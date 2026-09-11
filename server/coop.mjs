import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { normalizeArtifactDesign } from '../src/stichos/artifacts.ts';
import { MULTIPLAYER_PROTOCOL, MAX_ROOM_PLAYERS } from '../src/stichos/multiplayer-protocol.ts';

const MAX_COORDINATE = Number.MAX_SAFE_INTEGER - 4096;
const MAX_MESSAGE_BYTES = 8192;
const GATHERABLE = new Set(['pine', 'rock', 'cequin', 'heartleaf', 'emberroot', 'mushroom']);
const GESTURES = new Set(['wave', 'thanks', 'help']);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, low, high) =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const integer = (value, low, high) => finite(value, low, high) && Number.isInteger(value);
const text = (value, min, max) =>
  typeof value === 'string' &&
  value.length >= min &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const point = (value) =>
  object(value) &&
  finite(value.x, -MAX_COORDINATE, MAX_COORDINATE) &&
  finite(value.y, -MAX_COORDINATE, MAX_COORDINATE);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const artifactDesignValid = (value) => {
  if (value === undefined) return true;
  try {
    return normalizeArtifactDesign(value) === value;
  } catch {
    return false;
  }
};
const appearanceValid = (value) =>
  object(value) &&
  integer(value.seed, -0xffffffff, 0xffffffff) &&
  (value.weaponSeed === undefined || integer(value.weaponSeed, 0, 0xffffffff)) &&
  artifactDesignValid(value.artifactDesign) &&
  ['skin', 'hair', 'coat', 'trim', 'trousers'].every(
    (key) =>
      typeof value[key] === 'string' &&
      /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value[key]),
  ) &&
  finite(value.height, 0.5, 2) &&
  finite(value.build, 0.5, 2) &&
  integer(value.hairStyle, 0, 100) &&
  integer(value.hat, 0, 100) &&
  typeof value.cloak === 'boolean' &&
  ['staff', 'sword', 'bow', 'none'].includes(value.weapon);
const copyAppearance = (value) => ({
  ...Object.fromEntries(
    [
      'seed',
      'skin',
      'hair',
      'coat',
      'trim',
      'trousers',
      'height',
      'build',
      'hairStyle',
      'hat',
      'cloak',
      'weapon',
    ].map((key) => [key, value[key]]),
  ),
  ...(value.weaponSeed === undefined ? {} : { weaponSeed: value.weaponSeed }),
  ...(value.artifactDesign === undefined ? {} : { artifactDesign: value.artifactDesign }),
});
const publicPeer = (member) => ({
  id: member.id,
  name: member.name,
  x: member.x,
  y: member.y,
  heading: member.heading,
  phase: member.phase,
  appearance: { ...member.appearance },
});
const roomCode = () => randomBytes(5).toString('hex').toUpperCase();

/** Room authority covers generated resource claims and doors, not combat or player inventory.
 * Presence positions are reported by clients and checked for finite clear coordinates.
 */
export class CoopRooms {
  constructor({
    now = Date.now,
    maxRooms = 64,
    maxPeers = MAX_ROOM_PLAYERS,
    reconnectMs = 90000,
    roomIdleMs = 30 * 60000,
    messagesPerSecond = 30,
    messageBurst = 60,
  } = {}) {
    this.now = now;
    this.maxRooms = maxRooms;
    this.maxPeers = maxPeers;
    this.reconnectMs = reconnectMs;
    this.roomIdleMs = roomIdleMs;
    this.messagesPerSecond = messagesPerSecond;
    this.messageBurst = messageBurst;
    this.rooms = new Map();
    this.connections = new Set();
  }
  attach(socket) {
    const connection = {
      socket,
      room: null,
      member: null,
      tokens: this.messageBurst,
      refill: this.now(),
      alive: true,
    };
    this.connections.add(connection);
    const handshake = setTimeout(() => {
      if (!connection.member) socket.close(1008, 'Join a room first.');
    }, 8000);
    handshake.unref();
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (data, binary) => {
      if (binary) {
        socket.close(1003, 'Text protocol required.');
        return;
      }
      const now = this.now();
      connection.tokens = Math.min(
        this.messageBurst,
        connection.tokens + (Math.max(0, now - connection.refill) * this.messagesPerSecond) / 1000,
      );
      connection.refill = now;
      if (--connection.tokens < 0) {
        this.error(connection, 'rate_limit', 'Too many updates.');
        socket.close(1008, 'Rate limit.');
        return;
      }
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        this.error(connection, 'invalid_json', 'A valid JSON message is required.');
        socket.close(1007, 'Invalid JSON.');
        return;
      }
      try {
        this.handle(connection, message);
      } catch {
        this.error(connection, 'invalid_action', 'The action could not be accepted.');
      }
    });
    socket.on('error', () => {});
    socket.once('close', () => {
      clearTimeout(handshake);
      this.detach(connection);
    });
    return connection;
  }
  send(connection, message) {
    const socket = connection.socket;
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 1024 * 1024) {
      socket.close(1013, 'Connection is too slow.');
      return;
    }
    socket.send(JSON.stringify(message));
  }
  error(connection, code, reason) {
    this.send(connection, { type: 'error', code, reason });
  }
  broadcast(room, message, except = null) {
    for (const member of room.members.values())
      if (member.connection && member.connection !== except) this.send(member.connection, message);
  }
  detach(connection) {
    this.connections.delete(connection);
    const { room, member } = connection;
    if (!room || !member || member.connection !== connection) return;
    member.connection = null;
    member.disconnectedAt = this.now();
    room.lastActivity = this.now();
    this.broadcast(room, { type: 'peerLeft', peerId: member.id });
  }
  sweep() {
    const now = this.now();
    for (const [id, room] of this.rooms) {
      for (const [peerId, member] of room.members)
        if (!member.connection && now - member.disconnectedAt >= this.reconnectMs)
          room.members.delete(peerId);
      if (
        ![...room.members.values()].some((member) => member.connection) &&
        now - room.lastActivity >= this.roomIdleMs
      )
        this.rooms.delete(id);
    }
  }
  heartbeat() {
    for (const connection of this.connections) {
      if (connection.socket.readyState !== WebSocket.OPEN) continue;
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
    this.sweep();
  }
  handle(connection, message) {
    if (!object(message) || !text(message.type, 1, 24))
      return this.error(connection, 'invalid_message', 'Unknown message.');
    if (message.type === 'join') return this.join(connection, message);
    if (!connection.member)
      return this.error(connection, 'join_required', 'Join a room before acting.');
    const room = connection.room,
      member = connection.member;
    if (member.connection !== connection) return;
    if (message.type === 'pose') {
      if (
        !point(message) ||
        !finite(message.heading, -1e6, 1e6) ||
        !finite(message.phase, 0, Number.MAX_SAFE_INTEGER) ||
        !appearanceValid(message.appearance)
      )
        return this.error(connection, 'invalid_pose', 'A valid humanoid pose is required.');
      if (room.world.blocked(message.x, message.y, room.removed))
        return this.error(connection, 'blocked_pose', 'That position is blocked.');
      Object.assign(member, {
        x: message.x,
        y: message.y,
        heading: message.heading,
        phase: message.phase,
        appearance: copyAppearance(message.appearance),
      });
      room.lastActivity = this.now();
      this.broadcast(room, { type: 'pose', peer: publicPeer(member) }, connection);
      return;
    }
    if (message.type === 'claim' || message.type === 'door') return this.claim(connection, message);
    if (message.type === 'emote') {
      if (!GESTURES.has(message.gesture))
        return this.error(connection, 'invalid_emote', 'Use a known gesture.');
      if (this.now() - member.lastEmote < 1500)
        return this.error(connection, 'emote_rate', 'Wait before another gesture.');
      member.lastEmote = this.now();
      this.broadcast(room, { type: 'emote', peerId: member.id, gesture: message.gesture });
      return;
    }
    this.error(connection, 'unknown_message', 'That action is not part of this room protocol.');
  }
  join(connection, message) {
    if (connection.member)
      return this.error(connection, 'already_joined', 'This connection already belongs to a room.');
    if (
      message.protocol !== MULTIPLAYER_PROTOCOL ||
      !integer(message.seed, 0, 0xffffffff) ||
      ![1, 2, 3].includes(message.generation) ||
      !text(message.name, 1, 64) ||
      !message.name.trim() ||
      !appearanceValid(message.appearance) ||
      !point(message.position) ||
      (message.room !== undefined &&
        (typeof message.room !== 'string' || !/^[A-Za-z0-9]{4,16}$/.test(message.room))) ||
      (message.resumeToken !== undefined &&
        (typeof message.resumeToken !== 'string' ||
          !/^[A-Za-z0-9_-]{32}$/.test(message.resumeToken)))
    )
      return this.error(connection, 'invalid_join', 'Check the room, world and humanoid identity.');
    this.sweep();
    let room = message.room ? this.rooms.get(message.room.toUpperCase()) : null;
    if (message.room && !room)
      return this.error(connection, 'room_missing', 'That room is no longer available.');
    if (room && (room.seed !== message.seed || room.generation !== message.generation))
      return this.error(
        connection,
        'world_mismatch',
        'The room uses a different world seed or generation.',
      );
    if (!room && message.resumeToken)
      return this.error(connection, 'resume_expired', 'That connection can no longer be resumed.');
    if (!room) {
      if (this.rooms.size >= this.maxRooms)
        return this.error(connection, 'server_full', 'All rooms are currently occupied.');
      const world = new InfiniteWorld(message.seed, message.generation);
      if (world.blocked(message.position.x, message.position.y))
        return this.error(connection, 'blocked_pose', 'Begin on clear ground to create a room.');
      let id;
      do {
        id = roomCode();
      } while (this.rooms.has(id));
      room = {
        id,
        seed: message.seed,
        generation: message.generation,
        world,
        members: new Map(),
        removed: new Set(),
        opened: new Set(),
        lastActivity: this.now(),
      };
      this.rooms.set(id, room);
    }
    if (room.world.blocked(message.position.x, message.position.y, room.removed))
      return this.error(connection, 'blocked_pose', 'Join from clear ground in this world.');
    let member;
    if (message.resumeToken) {
      member = [...room.members.values()].find((value) => value.token === message.resumeToken);
      if (!member)
        return this.error(
          connection,
          'resume_expired',
          'That connection can no longer be resumed.',
        );
      if (member.connection)
        return this.error(connection, 'resume_in_use', 'That traveler is already connected.');
    }
    const connected = [...room.members.values()].filter((value) => value.connection).length;
    if (connected >= this.maxPeers)
      return this.error(
        connection,
        'room_full',
        `A room holds at most ${this.maxPeers} travelers.`,
      );
    if (!member) {
      // Bound abandoned reconnect records even when visitors repeatedly leave and rejoin.
      if (room.members.size >= this.maxPeers * 4) {
        const oldest = [...room.members.values()]
          .filter((value) => !value.connection)
          .sort((a, b) => a.disconnectedAt - b.disconnectedAt)[0];
        if (oldest) room.members.delete(oldest.id);
      }
      member = {
        id: randomUUID(),
        token: randomBytes(24).toString('base64url'),
        requests: new Map(),
        lastEmote: -Infinity,
      };
      room.members.set(member.id, member);
    }
    Object.assign(member, {
      name: message.name.trim(),
      x: message.position.x,
      y: message.position.y,
      heading: Math.PI / 2,
      phase: 0,
      appearance: copyAppearance(message.appearance),
      connection,
      disconnectedAt: null,
    });
    connection.member = member;
    connection.room = room;
    room.lastActivity = this.now();
    this.send(connection, {
      type: 'welcome',
      protocol: MULTIPLAYER_PROTOCOL,
      room: room.id,
      peerId: member.id,
      resumeToken: member.token,
      seed: room.seed,
      generation: room.generation,
      peers: [...room.members.values()].filter((value) => value.connection).map(publicPeer),
      removed: [...room.removed],
      opened: [...room.opened],
    });
    this.broadcast(room, { type: 'peerJoined', peer: publicPeer(member) }, connection);
  }
  claim(connection, message) {
    const { room, member } = connection;
    if (!text(message.requestId, 1, 80) || !text(message.propId, 1, 160))
      return this.error(connection, 'invalid_claim', 'An action ID and object ID are required.');
    const fingerprint = JSON.stringify([
      message.type,
      message.propId,
      message.kind,
      message.x,
      message.y,
      message.open,
    ]);
    const old = member.requests.get(message.requestId);
    if (old) {
      if (old.fingerprint !== fingerprint)
        return this.send(connection, {
          type: 'claimResult',
          requestId: message.requestId,
          ok: false,
          reason: 'Action ID was already used for a different request.',
        });
      this.send(connection, old.result);
      return;
    }
    const result = (ok, reason) => {
      const answer = {
        type: 'claimResult',
        requestId: message.requestId,
        ok,
        ...(reason ? { reason } : {}),
      };
      member.requests.set(message.requestId, { fingerprint, result: answer });
      while (member.requests.size > 128)
        member.requests.delete(member.requests.keys().next().value);
      this.send(connection, answer);
    };
    if (message.type === 'claim' && (!['gather', 'loot'].includes(message.kind) || !point(message)))
      return result(false, 'Unknown resource action.');
    if (message.type === 'door' && typeof message.open !== 'boolean')
      return result(false, 'A door needs an explicit open state.');
    const prop = room.world
      .propsAround(member.x, member.y, 2.2)
      .find((value) => value.id === message.propId);
    if (!prop || distance(prop, member) > 1.9)
      return result(false, 'Move closer to the actual object.');
    if (message.type === 'claim' && distance(prop, message) > 0.1)
      return result(false, 'The object coordinates do not match.');
    if (message.type === 'door') {
      if (prop.kind !== 'door') return result(false, 'That object is not a door.');
      if (
        !message.open &&
        [...room.members.values()].some((other) => other.connection && distance(other, prop) < 0.85)
      )
        return result(false, 'A traveler is standing in the doorway.');
      const wasOpen = room.opened.has(prop.id);
      if (message.open) {
        room.opened.add(prop.id);
        room.removed.add(prop.id);
      } else {
        room.opened.delete(prop.id);
        room.removed.delete(prop.id);
      }
      result(true);
      if (wasOpen !== message.open)
        this.broadcast(room, {
          type: 'world',
          actorId: member.id,
          ...(message.open ? { removed: [prop.id], opened: [prop.id] } : { closed: [prop.id] }),
        });
      room.lastActivity = this.now();
      return;
    }
    if (room.removed.has(prop.id) || room.opened.has(prop.id))
      return result(false, 'Another traveler already gathered or searched this object.');
    if (message.kind === 'gather') {
      if (!GATHERABLE.has(prop.kind)) return result(false, 'That object cannot be gathered.');
      if (['pine', 'rock'].includes(prop.kind) && member.appearance.weapon !== 'staff')
        return result(false, 'Equip the staff to gather timber or ore.');
      room.removed.add(prop.id);
      result(true);
      this.broadcast(room, { type: 'world', actorId: member.id, removed: [prop.id] });
    } else {
      if (!['chest', 'crate'].includes(prop.kind))
        return result(false, 'That object has no shared loot.');
      room.opened.add(prop.id);
      result(true);
      this.broadcast(room, { type: 'world', actorId: member.id, opened: [prop.id] });
    }
    room.lastActivity = this.now();
  }
}

function originAllowed(req, allowedOrigins) {
  if (!req.headers.origin) return true; // Native clients, including the wire tests, have no Origin.
  let origin, host;
  try {
    origin = new URL(req.headers.origin);
    host = new URL(`http://${req.headers.host}`);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(origin.protocol)) return false;
  if (allowedOrigins.has(origin.origin)) return true;
  const local = (name) =>
    name === 'localhost' ||
    name === '[::1]' ||
    /^127\./.test(name) ||
    /^10\./.test(name) ||
    /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name) ||
    name.endsWith('.local');
  return origin.hostname === host.hostname && local(origin.hostname);
}

/** Standalone HTTP + WebSocket server. The store handler receives untouched request bodies. */
export function createCoopServer({
  storeHandler = async () => false,
  allowedOrigins = [],
  ...roomOptions
} = {}) {
  const hub = new CoopRooms(roomOptions);
  const origins = new Set(allowedOrigins);
  const http = createServer(async (req, res) => {
    try {
      if (await storeHandler(req, res)) return;
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            ok: true,
            protocol: MULTIPLAYER_PROTOCOL,
            rooms: hub.rooms.size,
            players: [...hub.rooms.values()].reduce(
              (sum, room) =>
                sum + [...room.members.values()].filter((member) => member.connection).length,
              0,
            ),
          }),
        );
        return;
      }
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify({ error: 'Not found.' }));
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'The request could not be completed.' }));
    }
  });
  http.headersTimeout = 10000;
  http.requestTimeout = 15000;
  const websocket = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  const ipConnections = new Map();
  http.on('upgrade', (req, socket, head) => {
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (
      req.url !== '/ws' ||
      !originAllowed(req, origins) ||
      (ipConnections.get(ip) ?? 0) >= 32 ||
      hub.connections.size >= 512
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    websocket.handleUpgrade(req, socket, head, (ws) => {
      ipConnections.set(ip, (ipConnections.get(ip) ?? 0) + 1);
      ws.once('close', () => {
        const n = (ipConnections.get(ip) ?? 1) - 1;
        if (n) ipConnections.set(ip, n);
        else ipConnections.delete(ip);
      });
      hub.attach(ws);
    });
  });
  const timer = setInterval(() => hub.heartbeat(), 15000);
  timer.unref();
  return {
    http,
    websocket,
    hub,
    async listen(port = 4175, host = '0.0.0.0') {
      await new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, host, () => {
          http.off('error', reject);
          resolve();
        });
      });
      return http.address();
    },
    async close() {
      clearInterval(timer);
      for (const client of websocket.clients) client.terminate();
      await new Promise((resolve) => websocket.close(resolve));
      if (http.listening) await new Promise((resolve) => http.close(resolve));
    },
  };
}
