import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  VOICE_CODEC,
  VOICE_FRAME_BYTES,
  VOICE_MODES,
  VOICE_RANGES,
  validVoiceFrame,
  validVoiceMode,
  voicePeerBytes,
} from '../src/stichos/voice-protocol.ts';

export const VOICE_LIMITS = Object.freeze({
  payload: 8192,
  buffered: 16384,
  frameRate: 55,
  frameBurst: 12,
  bytesPerSecond: 11000,
  byteBurst: 8192,
  controlRate: 6,
  controlBurst: 12,
  speakers: 3,
  holdMs: 20000,
  silenceMs: 1200,
  ticketMs: 10000,
  handshakeMs: 4000,
  connections: 128,
  perIp: 12,
  globalBytesPerSecond: 1500000,
});
const bucket = (rate, burst, now) => ({ rate, burst, tokens: burst, at: now });
function validControls(peers = [], muted = []) {
  return (
    Array.isArray(peers) &&
    Array.isArray(muted) &&
    peers.length + muted.length <= 128 &&
    [...peers, ...muted].every((id) => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id))
  );
}
function take(b, n, now) {
  b.tokens = Math.min(b.burst, b.tokens + (Math.max(0, now - b.at) * b.rate) / 1000);
  b.at = now;
  if (b.tokens < n) return false;
  b.tokens -= n;
  return true;
}
/** Ephemeral relay only: this module has no disk, checkpoint, recording or replication API. */
export class VoiceRelay {
  constructor(hub, { now = Date.now, limits = {}, ranges = {} } = {}) {
    this.hub = hub;
    this.now = now;
    this.limits = { ...VOICE_LIMITS, ...limits };
    this.ranges = { ...VOICE_RANGES, ...ranges };
    for (const mode of VOICE_MODES)
      if (!Number.isFinite(this.ranges[mode]) || this.ranges[mode] <= 0 || this.ranges[mode] > 128)
        throw Error('Invalid voice range.');
    if (this.ranges.whisper >= this.ranges.normal || this.ranges.normal >= this.ranges.shout)
      throw Error('Voice ranges must increase from whisper to shout.');
    this.connections = new Set();
    this.tickets = new Map();
    this.members = new Map();
    this.ips = new Map();
    this.metrics = { accepted: 0, rejected: 0, frames: 0, forwarded: 0, dropped: 0, slow: 0 };
    this.global = bucket(
      this.limits.globalBytesPerSecond,
      this.limits.globalBytesPerSecond / 10,
      now(),
    );
    this.websocket = new WebSocketServer({
      noServer: true,
      maxPayload: this.limits.payload,
      perMessageDeflate: false,
      autoPong: false,
      maxFragments: 16,
      maxBufferedChunks: 64,
    });
    hub.voiceAuthority = this;
    this.timer = setInterval(() => this.sweep(), 250);
    this.timer.unref();
  }
  get capability() {
    return { version: 1, codecs: [VOICE_CODEC], ranges: this.ranges };
  }
  diagnostics() {
    return {
      enabled: true,
      connections: this.connections.size,
      speakers: [...this.connections].filter((c) => c.active).length,
      ...this.metrics,
      codec: VOICE_CODEC,
    };
  }
  issue(connection, requestId) {
    const now = this.now();
    if (
      !this.current(connection) ||
      typeof requestId !== 'string' ||
      !/^v[0-9]{1,16}$/.test(requestId) ||
      now - (connection.voiceTicketAt ?? -Infinity) < 1000
    )
      return;
    connection.voiceTicketAt = now;
    for (const [key, t] of this.tickets)
      if (t.connection === connection || t.expiresAt <= now) this.tickets.delete(key);
    const ticket = randomBytes(32).toString('base64url'),
      expiresAt = now + this.limits.ticketMs;
    this.tickets.set(ticket, { connection, expiresAt });
    this.hub.send(connection, { type: 'voice_ticket', requestId, ticket, expiresAt });
  }
  current(game) {
    return (
      game?.member?.connection === game &&
      this.hub.connections.has(game) &&
      game.socket.readyState === 1 &&
      this.hub.rooms.get(game.room?.id) === game.room
    );
  }
  upgrade(req, socket, head, ip) {
    if (
      this.connections.size >= this.limits.connections ||
      (this.ips.get(ip) ?? 0) >= this.limits.perIp
    ) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      return;
    }
    this.websocket.handleUpgrade(req, socket, head, (ws) => this.attach(ws, ip));
  }
  attach(socket, ip = 'test') {
    const now = this.now(),
      c = {
        socket,
        ip,
        game: null,
        active: false,
        mode: 'normal',
        blocked: new Set(),
        muted: new Set(),
        sequence: null,
        started: 0,
        lastFrame: 0,
        cooldown: 0,
        alive: true,
        closing: false,
        closeTimer: null,
        frames: bucket(this.limits.frameRate, this.limits.frameBurst, now),
        bytes: bucket(this.limits.bytesPerSecond, this.limits.byteBurst, now),
        controls: bucket(this.limits.controlRate, this.limits.controlBurst, now),
        created: now,
      };
    this.connections.add(c);
    this.ips.set(ip, (this.ips.get(ip) ?? 0) + 1);
    socket.on('message', (data, binary) => {
      try {
        this.receive(c, data, binary);
      } catch {
        this.reject(c, 'Malformed voice message.', 1007);
      }
    });
    socket.on('error', () => {});
    socket.on('ping', (data) => {
      if (!this.protocolControl(c, data.length)) return;
      if (socket.bufferedAmount > this.limits.buffered) {
        this.metrics.slow++;
        this.reject(c, 'Voice connection is too slow.', 1013);
        return;
      }
      if (take(this.global, data.length + 2, this.now()) && socket.readyState === 1)
        socket.pong(data);
    });
    socket.on('pong', (data) => {
      if (!this.protocolControl(c, data.length)) return;
      c.alive = true;
    });
    socket.once('close', () => this.detach(c));
    return c;
  }
  protocolControl(c, length) {
    if (c.closing || !this.connections.has(c)) return false;
    const now = this.now();
    if (!take(c.controls, 1, now) || !take(c.bytes, length + 2, now)) {
      this.reject(c, 'Voice protocol control limit.');
      return false;
    }
    return true;
  }
  send(c, message) {
    if (c.closing || c.socket.readyState !== 1) return false;
    if (c.socket.bufferedAmount > this.limits.buffered) {
      this.metrics.slow++;
      this.reject(c, 'Voice connection is too slow.', 1013);
      return false;
    }
    c.socket.send(
      typeof message === 'string' || message instanceof Uint8Array
        ? message
        : JSON.stringify(message),
    );
    return true;
  }
  reject(c, reason, code = 1008) {
    if (c.closing || !this.connections.has(c)) return;
    c.closing = true;
    this.metrics.rejected++;
    this.stop(c);
    // A peer may refuse the close handshake. Keep its slot and IP accounting until
    // actual closure, and bound that handshake independently from ws's 30s timeout.
    c.closeTimer = setTimeout(() => c.socket.terminate(), 500);
    c.closeTimer.unref();
    c.socket.close(code, reason);
  }
  receive(c, data, binary) {
    if (c.closing || !this.connections.has(c)) return;
    const now = this.now();
    const bytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length);
    if (bytes.byteLength > this.limits.payload)
      return this.reject(c, 'Voice packet is too large.', 1009);
    if (binary) {
      if (!this.current(c.game)) return this.reject(c, 'Press to talk before sending.');
      if (!validVoiceFrame(bytes) || VOICE_MODES[bytes[4]] !== c.mode)
        return this.reject(c, 'Invalid voice frame.', 1007);
      const seq = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
      if ((c.sequence !== null && (seq - c.sequence) >>> 0 > 0x7fffffff) || seq === c.sequence)
        return this.reject(c, 'Replayed voice frame.');
      if (!take(c.frames, 1, now) || !take(c.bytes, bytes.length, now))
        return this.reject(c, 'Voice bandwidth limit.');
      c.sequence = seq;
      c.lastFrame = now;
      if (!c.active) {
        if (now < (c.graceUntil ?? 0)) {
          this.metrics.dropped++;
          return;
        }
        return this.reject(c, 'Press to talk before sending.');
      }
      if (now - c.started >= this.limits.holdMs) {
        this.stop(c, true);
        c.cooldown = now + 500;
        this.send(c, { type: 'stopped', reason: 'Release and press again after 20 seconds.' });
        return;
      }
      if (!take(this.global, bytes.length, now)) {
        this.metrics.dropped++;
        return;
      }
      this.metrics.frames++;
      const packet = new Uint8Array(16 + VOICE_FRAME_BYTES);
      packet.set(voicePeerBytes(c.game.member.id));
      packet.set(bytes, 16);
      for (const peer of this.recipients(c)) {
        if (!take(this.global, packet.length, now)) {
          this.metrics.dropped++;
          continue;
        }
        if (this.send(peer, packet)) this.metrics.forwarded++;
      }
      return;
    }
    if (!take(c.controls, 1, now) || !take(c.bytes, bytes.length, now))
      return this.reject(c, 'Voice control rate limit.');
    let m;
    try {
      m = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return this.reject(c, 'Invalid voice control.', 1007);
    }
    if (!m || typeof m !== 'object' || Array.isArray(m))
      return this.reject(c, 'Invalid voice control.');
    if (!c.game) {
      if (
        m.type !== 'auth' ||
        typeof m.ticket !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(m.ticket) ||
        !Array.isArray(m.codecs) ||
        m.codecs.length > 4 ||
        !m.codecs.includes(VOICE_CODEC) ||
        !validControls(m.peers, m.muted)
      )
        return this.reject(c, 'Unsupported voice authentication or codec.');
      const t = this.tickets.get(m.ticket);
      this.tickets.delete(m.ticket);
      if (!t || t.expiresAt <= now || !this.current(t.connection))
        return this.reject(c, 'Voice credential expired or already used.');
      const old = this.members.get(t.connection.member.id);
      if (old) this.reject(old, 'Voice moved to a new connection.');
      c.game = t.connection;
      c.blocked = new Set(m.peers ?? []);
      c.muted = new Set(m.muted ?? []);
      this.members.set(c.game.member.id, c);
      this.metrics.accepted++;
      this.send(c, {
        type: 'ready',
        codec: VOICE_CODEC,
        peerId: c.game.member.id,
        ranges: this.ranges,
      });
      return;
    }
    if (!this.current(c.game)) return this.reject(c, 'Game membership ended.');
    if (
      m.type === 'ptt' &&
      typeof m.active === 'boolean' &&
      validVoiceMode(m.mode) &&
      (m.requestId === undefined ||
        (Number.isInteger(m.requestId) && m.requestId > 0 && m.requestId <= 0xffffffff))
    ) {
      if (!m.active) {
        this.stop(c);
        return;
      }
      if (c.active) return;
      if (now < c.cooldown) {
        this.send(c, { type: 'stopped', reason: 'Wait briefly, then press again.' });
        return;
      }
      if (
        [...this.connections].filter((p) => p.game?.room === c.game.room && p.active).length >=
        this.limits.speakers
      ) {
        this.send(c, { type: 'stopped', reason: 'Three people are speaking. Try again shortly.' });
        return;
      }
      c.active = true;
      c.mode = m.mode;
      c.started = now;
      c.lastFrame = now;
      this.send(c, {
        type: 'ptt',
        peerId: c.game.member.id,
        active: true,
        mode: c.mode,
        requestId: m.requestId,
      });
      for (const peer of this.recipients(c))
        this.send(peer, { type: 'ptt', peerId: c.game.member.id, active: true, mode: c.mode });
      return;
    }
    if (m.type === 'block' && validControls(m.peers, m.muted)) {
      c.blocked = new Set(m.peers);
      c.muted = new Set(m.muted ?? []);
      return;
    }
    return this.reject(c, 'Unknown voice control.');
  }
  recipients(c) {
    return [...this.connections].filter(
      (p) =>
        p !== c &&
        !p.closing &&
        this.current(p.game) &&
        p.game.room === c.game.room &&
        !p.blocked.has(c.game.member.id) &&
        !p.muted.has(c.game.member.id) &&
        !c.blocked.has(p.game.member.id) &&
        Math.hypot(p.game.member.x - c.game.member.x, p.game.member.y - c.game.member.y) <=
          this.ranges[c.mode],
    );
  }
  stop(c, grace = false) {
    if (!c.active) return;
    c.active = false;
    c.graceUntil = grace ? this.now() + 750 : 0;
    for (const p of this.connections)
      if (p.game?.room === c.game?.room)
        this.send(p, { type: 'ptt', peerId: c.game?.member.id, active: false, mode: c.mode });
  }
  detach(c) {
    if (!this.connections.delete(c)) return;
    if (c.closeTimer) clearTimeout(c.closeTimer);
    c.closeTimer = null;
    this.stop(c);
    if (c.game && this.members.get(c.game.member.id) === c) this.members.delete(c.game.member.id);
    const count = (this.ips.get(c.ip) ?? 1) - 1;
    if (count) this.ips.set(c.ip, count);
    else this.ips.delete(c.ip);
  }
  revoke(game) {
    for (const [k, t] of this.tickets) if (t.connection === game) this.tickets.delete(k);
    for (const c of [...this.connections])
      if (c.game === game) this.reject(c, 'Game membership ended.');
  }
  sweep() {
    const now = this.now();
    for (const [k, t] of this.tickets) if (t.expiresAt <= now) this.tickets.delete(k);
    for (const c of [...this.connections]) {
      if (!c.game && now - c.created > this.limits.handshakeMs)
        this.reject(c, 'Voice handshake expired.');
      else if (c.game && !this.current(c.game)) this.reject(c, 'Game membership ended.');
      else if (c.active && now - c.lastFrame > this.limits.silenceMs) {
        this.stop(c, true);
        this.send(c, {
          type: 'stopped',
          reason: 'Speech paused after a connection interruption. Release and try again.',
        });
      }
    }
  }
  heartbeat() {
    for (const c of [...this.connections]) {
      if (c.closing) continue;
      if (!c.alive) {
        c.socket.terminate();
        this.detach(c);
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }
  async close() {
    clearInterval(this.timer);
    this.tickets.clear();
    for (const c of [...this.connections]) {
      c.socket.terminate();
      this.detach(c);
    }
    for (const socket of this.websocket.clients) socket.terminate();
    if (this.hub.voiceAuthority === this) this.hub.voiceAuthority = null;
    await new Promise((resolve) => this.websocket.close(resolve));
  }
}
