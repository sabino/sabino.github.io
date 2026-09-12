import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import WebSocket from 'ws';
import { VoiceRelay } from '../server/voice.mjs';
import { createCoopServer } from '../server/coop.mjs';
import { appearance } from '../src/stichos/world.ts';
import {
  VOICE_CODEC,
  VOICE_RANGES,
  VOICE_MODES,
  VOICE_FRAME_BYTES,
  VOICE_SAMPLES,
  encodeVoiceFrame,
  decodeVoiceFrame,
  validVoiceFrame,
  voicePeerId,
} from '../src/stichos/voice-protocol.ts';
import { voiceAcoustics, voiceOcclusion } from '../src/stichos/voice-acoustics.ts';
import {
  normalizeVoiceSettings,
  voiceAvailability,
  microphoneErrorMessage,
} from '../src/stichos/voice.ts';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: any[] = [];
  code = 0;
  send(data: any) {
    this.sent.push(data instanceof Uint8Array ? data.slice() : JSON.parse(data));
  }
  close(code = 1000) {
    this.code = code;
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  ping() {}
}
function fixture(t: any, options = {}) {
  let now = 1000;
  const hub: any = {
    rooms: new Map(),
    connections: new Set(),
    send: (c: any, m: any) => c.socket.send(JSON.stringify(m)),
  };
  const relay = new VoiceRelay(hub, { now: () => now, ...options });
  t.after(() => relay.close());
  function member(roomId = 'ROOM', x = 0, y = 0) {
    let room = hub.rooms.get(roomId);
    if (!room) {
      room = { id: roomId };
      hub.rooms.set(roomId, room);
    }
    const game: any = { room, socket: new Socket(), member: { id: crypto.randomUUID(), x, y } };
    game.member.connection = game;
    hub.connections.add(game);
    return game;
  }
  function auth(game: any) {
    relay.issue(game, 'v1');
    const ticket = game.socket.sent.at(-1);
    const socket = new Socket(),
      c = relay.attach(socket);
    relay.receive(
      c,
      JSON.stringify({ type: 'auth', ticket: ticket.ticket, codecs: [VOICE_CODEC] }),
      false,
    );
    return { c, socket, ticket };
  }
  function control(c: any, m: any) {
    relay.receive(c, JSON.stringify(m), false);
  }
  return {
    hub,
    relay,
    member,
    auth,
    control,
    advance: (ms: number) => {
      now += ms;
    },
    frame: (c: any, seq = 0, mode: any = 'normal') =>
      relay.receive(c, encodeVoiceFrame(new Float32Array(VOICE_SAMPLES), seq, mode), true),
  };
}
test('independent ADPCM frames preserve speech-band signals and reject malformed header/length', () => {
  const samples = Float32Array.from(
      { length: VOICE_SAMPLES },
      (_, i) => Math.sin((i * 2 * Math.PI * 440) / 16000) * 0.35,
    ),
    frame = encodeVoiceFrame(samples, 4294967295, 'normal'),
    decoded = decodeVoiceFrame(frame);
  assert.equal(frame.length, VOICE_FRAME_BYTES);
  assert.ok(validVoiceFrame(frame));
  const mse = decoded.reduce((sum, s, i) => sum + (s - samples[i]!) ** 2, 0) / decoded.length;
  assert.ok(mse < 0.008, `MSE ${mse}`);
  for (const index of [0, 1, 2, 3, 4, 5, 6, 14, 15]) {
    const corrupt = frame.slice();
    corrupt[index] = 255;
    assert.equal(validVoiceFrame(corrupt), false);
    assert.throws(() => decodeVoiceFrame(corrupt));
  }
  assert.equal(validVoiceFrame(frame.subarray(0, -1)), false);
  assert.ok(
    decodeVoiceFrame(encodeVoiceFrame(new Float32Array(320).fill(100), 1, 'shout', 2)).every(
      Number.isFinite,
    ),
  );
});
test('voice tickets require live membership, expire, are single-use, and bind to original game session', async (t) => {
  const f = fixture(t),
    a = f.member();
  const first = f.auth(a);
  assert.equal(first.socket.sent[0].type, 'ready');
  const replay = new Socket(),
    c = f.relay.attach(replay);
  f.control(c, { type: 'auth', ticket: first.ticket.ticket, codecs: [VOICE_CODEC] });
  assert.equal(replay.code, 1008);
  f.advance(1001);
  f.relay.issue(a, 'v2');
  const stale = a.socket.sent.at(-1);
  f.advance(10001);
  const expired = new Socket();
  f.control(f.relay.attach(expired), { type: 'auth', ticket: stale.ticket, codecs: [VOICE_CODEC] });
  assert.equal(expired.code, 1008);
  f.advance(1001);
  f.relay.issue(a, 'v3');
  const old = a.socket.sent.at(-1);
  a.member.connection = null;
  const moved = new Socket();
  f.control(f.relay.attach(moved), { type: 'auth', ticket: old.ticket, codecs: [VOICE_CODEC] });
  assert.equal(moved.code, 1008);
  const codeOnly = new Socket();
  f.control(f.relay.attach(codeOnly), { type: 'auth', ticket: 'ROOM', codecs: [VOICE_CODEC] });
  assert.equal(codeOnly.code, 1008);
});
for (const mode of VOICE_MODES)
  test(`${mode} boundary: server delivers only same-room members within ${VOICE_RANGES[mode]} world tiles`, (t) => {
    const f = fixture(t),
      speaker = f.auth(f.member()),
      inside = f.auth(f.member('ROOM', VOICE_RANGES[mode], 0)),
      outside = f.auth(f.member('ROOM', VOICE_RANGES[mode] + 0.001, 0)),
      different = f.auth(f.member('OTHER', 0, 0));
    f.control(speaker.c, { type: 'ptt', active: true, mode });
    f.frame(speaker.c, 0, mode);
    const audio = (s: Socket) => s.sent.filter((m) => m instanceof Uint8Array);
    assert.equal(audio(inside.socket).length, 1);
    assert.equal(audio(outside.socket).length, 0);
    assert.equal(audio(different.socket).length, 0);
    assert.equal(audio(speaker.socket).length, 0);
    assert.equal(voicePeerId(audio(inside.socket)[0]), speaker.c.game.member.id);
    inside.c.game.member.x += 1;
    f.advance(20);
    f.frame(speaker.c, 1, mode);
    assert.equal(audio(inside.socket).length, 1, 'range is rechecked for every frame');
  });
test('blocking filters on server, PTT lease ends, room leave revokes transport and outstanding ticket', (t) => {
  const f = fixture(t),
    game = f.member(),
    a = f.auth(game),
    b = f.auth(f.member());
  f.control(b.c, { type: 'block', peers: [game.member.id] });
  f.control(a.c, { type: 'ptt', active: true, mode: 'normal' });
  f.frame(a.c);
  assert.equal(b.socket.sent.filter((m) => m instanceof Uint8Array).length, 0);
  f.advance(1201);
  f.relay.sweep();
  assert.equal(a.c.active, false);
  f.advance(1);
  f.relay.issue(game, 'v2');
  f.relay.revoke(game);
  assert.equal(a.socket.code, 1008);
  assert.equal(f.relay.tickets.size, 0);
  assert.equal(f.relay.members.has(game.member.id), false);
});
test('independent rate/bandwidth limits, replay rejection and slow consumers never close gameplay', (t) => {
  const f = fixture(t),
    game = f.member(),
    a = f.auth(game),
    b = f.auth(f.member());
  f.control(a.c, { type: 'ptt', active: true, mode: 'normal' });
  b.socket.bufferedAmount = 17000;
  f.frame(a.c);
  assert.equal(b.socket.code, 1013);
  assert.equal(game.socket.readyState, 1);
  f.frame(a.c, 0);
  assert.equal(a.socket.code, 1008, 'sequence replay rejected');
  const attacker = f.auth(f.member());
  f.control(attacker.c, { type: 'ptt', active: true, mode: 'normal' });
  for (let i = 0; i < 20; i++) f.frame(attacker.c, i);
  assert.equal(attacker.socket.code, 1008);
  assert.equal(game.socket.readyState, 1);
  assert.ok(f.relay.metrics.rejected >= 2);
});
test('maximum simultaneous speakers, negotiated codec, wrong mode and malformed binary are enforced', (t) => {
  const f = fixture(t),
    clients = Array.from({ length: 4 }, () => f.auth(f.member()));
  for (const a of clients) f.control(a.c, { type: 'ptt', active: true, mode: 'whisper' });
  assert.equal(clients.filter((a) => a.c.active).length, 3);
  assert.equal(clients[3]!.socket.sent.at(-1).type, 'stopped');
  f.frame(clients[0]!.c, 0, 'shout');
  assert.equal(clients[0]!.socket.code, 1007);
  const malformed = new Uint8Array(VOICE_FRAME_BYTES);
  f.relay.receive(clients[1]!.c, malformed, true);
  assert.equal(clients[1]!.socket.code, 1007);
  const newGame = f.member();
  f.relay.issue(newGame, 'v1');
  const badCodec = new Socket();
  f.control(f.relay.attach(badCodec), {
    type: 'auth',
    ticket: newGame.socket.sent.at(-1).ticket,
    codecs: ['webm/opus'],
  });
  assert.equal(badCodec.code, 1008);
});
test('server lease expiry discards bounded in-flight frames without disconnecting an admitted talker', (t) => {
  const f = fixture(t),
    a = f.auth(f.member());
  f.control(a.c, { type: 'ptt', active: true, mode: 'normal', requestId: 1 });
  f.frame(a.c, 1);
  f.advance(20001);
  f.frame(a.c, 2);
  assert.equal(a.c.active, false);
  f.advance(40);
  f.frame(a.c, 3);
  assert.equal(a.socket.readyState, 1);
  assert.equal(f.relay.metrics.dropped, 1);
  f.advance(800);
  f.frame(a.c, 4);
  assert.equal(a.socket.code, 1008, 'grace is finite, rate/size/sequence checks remain enforced');
});
test('reconnect requires fresh single-use ticket and cannot resume transmission', (t) => {
  const f = fixture(t),
    game = f.member(),
    first = f.auth(game);
  f.control(first.c, { type: 'ptt', active: true, mode: 'normal' });
  f.frame(first.c);
  first.socket.close();
  f.advance(1100);
  const second = f.auth(game);
  assert.equal(second.c.active, false);
  f.frame(second.c);
  assert.equal(second.socket.code, 1008);
});
test('attenuation is smooth, behind remains audible/muffled, pan changes with head direction, geometry is bounded', () => {
  const at = (x: number) => voiceAcoustics({ x: 0, y: 0, heading: 0 }, { x, y: 0 }, 'normal');
  assert.ok(at(2).gain > at(8).gain);
  assert.equal(at(14).gain, 0);
  assert.ok(at(-2).gain > 0 && at(-2).gain < at(2).gain);
  assert.ok(at(-2).cutoff < at(2).cutoff);
  assert.equal(
    Math.sign(voiceAcoustics({ x: 0, y: 0, heading: 0 }, { x: 0, y: 2 }, 'normal').pan),
    1,
  );
  assert.equal(
    Math.sign(voiceAcoustics({ x: 0, y: 0, heading: Math.PI }, { x: 0, y: 2 }, 'normal').pan),
    -1,
  );
  let count = 0;
  assert.equal(
    voiceOcclusion({ x: 0, y: 0 }, { x: 1000, y: 0 }, () => {
      count++;
      return false;
    }),
    0,
  );
  assert.ok(count <= 64);
  assert.ok(voiceOcclusion({ x: 0, y: 0 }, { x: 8, y: 0 }, (x) => x === 4) > 0);
  assert.equal(
    voiceOcclusion({ x: 0, y: 0 }, { x: 8, y: 0 }, () => false),
    0,
  );
});
test('personal settings normalization bounds gain and excludes unrelated saved fields', () => {
  const s = normalizeVoiceSettings({
    output: 9,
    input: -3,
    mode: 'broadcast',
    ptt: 'unknown',
    recording: 'audio',
    peers: { __proto__: { muted: true } },
  });
  assert.equal(s.output, 1);
  assert.equal(s.input, 0);
  assert.equal(s.mode, 'normal');
  assert.equal(s.ptt, 'hold');
  assert.ok(!JSON.stringify(s).includes('recording'));
});
test('voice setup distinguishes room membership, playback support and microphone restrictions', () => {
  const ready = {
    joined: true,
    endpoint: true,
    secure: true,
    webAudio: true,
    worklet: true,
    capture: true,
  };
  assert.equal(voiceAvailability(ready).canCapture, true);
  const solo = voiceAvailability({ ...ready, joined: false, endpoint: false });
  assert.equal(solo.reason, 'room-required');
  assert.match(solo.message, /Join a shared planet or room/);
  assert.equal(solo.canListen, false);
  assert.equal(voiceAvailability({ ...ready, endpoint: false }).reason, 'host-unsupported');
  assert.equal(voiceAvailability({ ...ready, secure: false }).reason, 'insecure');
  assert.equal(voiceAvailability({ ...ready, webAudio: false }).reason, 'browser-unsupported');
  for (const restriction of [
    { worklet: false },
    { capture: false },
    { policyAllowsCapture: false },
  ]) {
    const capability = voiceAvailability({ ...ready, ...restriction });
    assert.equal(capability.reason, 'capture-unsupported');
    assert.equal(capability.canListen, true, 'capture restrictions preserve listen-only');
    assert.equal(capability.canCapture, false);
  }
  assert.match(microphoneErrorMessage({ name: 'NotAllowedError' }), /browser settings/);
  assert.match(microphoneErrorMessage({ name: 'OverconstrainedError' }), /System default/);
  assert.match(microphoneErrorMessage({ name: 'NotReadableError' }), /in use/);
});
test('capture worklet resamples 48kHz into independent 16kHz frames and emits nothing with PTT off', async () => {
  const source = await readFile(
    new URL('../src/stichos/voice-capture.worklet.js', import.meta.url),
    'utf8',
  );
  let Constructor: any;
  const packets: Float32Array[] = [];
  const context = vm.createContext({
    AudioWorkletProcessor: class {
      port = { postMessage: (p: Float32Array) => packets.push(p), onmessage: null };
    },
    sampleRate: 48000,
    Float32Array,
    registerProcessor: (_name: string, c: any) => (Constructor = c),
  });
  vm.runInContext(source, context);
  const processor = new Constructor();
  const block = new Float32Array(128).fill(0.2);
  for (let i = 0; i < 10; i++) processor.process([[block]]);
  assert.equal(packets.length, 0);
  processor.port.onmessage({ data: true });
  for (let i = 0; i < 15; i++) processor.process([[block]]);
  assert.equal(packets.length, 2);
  assert.equal(packets[0]!.length, 320);
  assert.ok(Math.abs(packets[0]![100]! - 0.2) < 1e-6);
  processor.port.onmessage({ data: false });
  for (let i = 0; i < 10; i++) processor.process([[block]]);
  assert.equal(packets.length, 2);
});
async function wire(url: string) {
  const socket = new WebSocket(url);
  const messages: any[] = [];
  socket.on('error', () => {});
  socket.on('message', (data, binary) =>
    messages.push(binary ? new Uint8Array(data as Buffer) : JSON.parse(data.toString())),
  );
  await once(socket, 'open');
  return {
    socket,
    messages,
    send: (m: any) => socket.send(JSON.stringify(m)),
    next: async (type: string) => {
      for (let i = 0; i < 300; i++) {
        const index = messages.findIndex((m) => m.type === type);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise((r) => setTimeout(r, 5));
      }
      throw Error(`Missing ${type}`);
    },
  };
}
test('real /voice binary relay and /ws text transport coexist; microphone data never enters checkpoint or Pear callback', async (t) => {
  const checkpoints: any[] = [];
  const directory = await mkdtemp(join(tmpdir(), 'verso-voice-'));
  const server = createCoopServer({
      persistenceDirectory: directory,
      onCheckpoint: (state: any) => checkpoints.push(state),
    }),
    address: any = await server.listen(0, '127.0.0.1');
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = `ws://127.0.0.1:${address.port}`;
  const a = await wire(`${base}/ws`),
    b = await wire(`${base}/ws`),
    identity = {
      type: 'join',
      protocol: 3,
      seed: 3886,
      generation: 3,
      name: 'Voice test',
      appearance: appearance(42, 'pilgrim', 1),
      position: { x: 0, y: 5 },
    };
  a.send(identity);
  const welcome = await a.next('welcome');
  b.send({ ...identity, room: welcome.room });
  await b.next('welcome');
  assert.equal(welcome.voice.codecs[0], VOICE_CODEC);
  async function connectVoice(game: any) {
    game.send({ type: 'voice_ticket', requestId: 'v1' });
    const ticket = await game.next('voice_ticket'),
      v = await wire(`${base}/voice`);
    v.send({ type: 'auth', ticket: ticket.ticket, codecs: [VOICE_CODEC] });
    await v.next('ready');
    return v;
  }
  const av = await connectVoice(a),
    bv = await connectVoice(b);
  av.send({ type: 'ptt', active: true, mode: 'normal' });
  await av.next('ptt');
  const stable = (value: any) =>
    JSON.stringify(value, (key, v) =>
      ['seq', 'elapsedSeconds', 'sampledAtMs'].includes(key) ? undefined : v,
    );
  const before = stable(server.hub.exportRoom(welcome.room));
  av.socket.send(encodeVoiceFrame(new Float32Array(320).fill(0.1234), 0, 'normal'));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(bv.messages.filter((m) => m instanceof Uint8Array).length, 1);
  assert.equal(stable(server.hub.exportRoom(welcome.room)), before);
  await server.checkpoint();
  assert.ok(checkpoints.length > 0, 'actual signed replication callback exercised');
  const forbidden = new Set(['audio', 'voice', 'ticket', 'codec', 'samples', 'microphone']);
  const checkKeys = (value: any) => {
    if (value && typeof value === 'object')
      for (const [key, v] of Object.entries(value)) {
        assert.ok(!forbidden.has(key), `nonpersistent field ${key}`);
        checkKeys(v);
      }
  };
  checkKeys(server.hub.exportRoom(welcome.room));
  checkKeys(checkpoints);
  a.send({ type: 'chat', requestId: 'chat', channel: 'world', text: 'Gameplay still works' });
  assert.equal((await b.next('chat')).message.text, 'Gameplay still works');
  const status = await (await fetch(`http://127.0.0.1:${address.port}/voice/health`)).json();
  assert.equal(status.frames, 1);
  assert.ok(!JSON.stringify(status).includes('ticket'));
  const closed = once(av.socket, 'close');
  a.socket.close();
  await closed;
  assert.equal(av.socket.readyState, WebSocket.CLOSED);
});

test('microphone consent cancellation stops late tracks; PTT release/background stop capture without auto-transmitting', async (t) => {
  const { SpatialVoice } = await import('../src/stichos/voice.ts');
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const put = (key: string, value: any) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  const documentMock = Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    windowMock = new EventTarget();
  put('document', documentMock);
  put('window', windowMock);
  put('isSecureContext', true);
  put('localStorage', { getItem: () => null, setItem: () => {} });
  const node = () => ({
    connect() {
      return this;
    },
    disconnect() {},
    gain: { value: 0, setTargetAtTime() {} },
    port: { onmessage: null as any, postMessage() {}, close() {} },
  });
  class Context {
    state = 'running';
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    createMediaStreamSource() {
      return node();
    }
    createGain() {
      return node();
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {
      this.state = 'closed';
    }
  }
  put('AudioContext', Context);
  put(
    'AudioWorkletNode',
    class {
      port = node().port;
      connect() {
        return this;
      }
      disconnect() {}
    },
  );
  put('WebSocket', { OPEN: 1 });
  let resolveCapture: (s: any) => void = () => {};
  let captureCalls = 0;
  put('navigator', {
    mediaDevices: {
      getUserMedia: () => {
        captureCalls++;
        return new Promise((r) => {
          resolveCapture = r;
        });
      },
      enumerateDevices: async () => [],
    },
  });
  let voice: any;
  t.after(() => {
    voice?.dispose();
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete (globalThis as any)[key];
    }
  });
  const game: any = {
    onVoiceSessionChange: () => {},
    voiceEndpoint: 'wss://example.test/voice',
    status: 'online',
    peers: [],
    peerId: 'test',
  };
  voice = new SpatialVoice(game, { listener: () => ({ x: 0, y: 0 }) });
  let resolveListening: () => void = () => {};
  voice.enableListening = () => {
    voice.context ??= new Context();
    return new Promise<void>((resolve) => {
      resolveListening = resolve;
    });
  };
  let stops = 0;
  const track = {
      enabled: true,
      onended: null,
      onmute: null,
      stop() {
        stops++;
      },
    },
    stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const pending = voice.enableMicrophone();
  assert.equal(
    captureCalls,
    1,
    'getUserMedia starts inside the consent gesture before awaiting network listening',
  );
  voice.disableMicrophone();
  resolveCapture(stream);
  resolveListening();
  await pending;
  assert.equal(stops, 1);
  assert.equal(voice.snapshot.microphone, false);
  assert.equal(voice.snapshot.transmitting, false);
  voice.enableListening = async () => {};
  const allowed = voice.enableMicrophone();
  await Promise.resolve();
  resolveCapture(stream);
  await allowed;
  assert.equal(voice.snapshot.microphone, true);
  assert.equal(track.enabled, false);
  assert.equal(voice.snapshot.transmitting, false, 'permission never starts PTT');
  const sent: any[] = [];
  voice.socket = { readyState: 1, send: (s: string) => sent.push(JSON.parse(s)), close() {} };
  voice.press();
  assert.equal(track.enabled, false, 'capture waits for server speaking-slot admission');
  assert.equal(voice.snapshot.requesting, true);
  assert.equal(voice.snapshot.transmitting, false);
  const canceledRequest = voice.pttSerial;
  voice.release();
  assert.match(voice.snapshot.message, /Microphone ready/);
  voice.admitPtt(canceledRequest, 'normal');
  assert.equal(track.enabled, false, 'a late acknowledgment never resumes released PTT');
  voice.press();
  voice.admitPtt(canceledRequest, 'normal');
  assert.equal(track.enabled, false, 'old acknowledgments cannot admit a new request');
  voice.admitPtt(voice.pttSerial, 'normal');
  assert.equal(track.enabled, true);
  assert.equal(voice.snapshot.transmitting, true);
  voice.release();
  assert.equal(track.enabled, false);
  assert.equal(sent.at(-1).active, false);
  assert.match(voice.snapshot.message, /Microphone ready/);
  voice.state.status = 'interrupted';
  voice.state.message = 'Voice interrupted. Tap Listen to retry.';
  voice.release();
  assert.equal(voice.snapshot.message, 'Voice interrupted. Tap Listen to retry.');
  voice.state.status = 'ready';
  const blockedId = crypto.randomUUID();
  voice.setPeerSettings(blockedId, { blocked: true });
  assert.deepEqual(
    sent.at(-1).peers,
    [blockedId],
    'absent identities are already blocked on the relay',
  );
  game.peers.push({ id: blockedId });
  voice.update();
  assert.deepEqual(
    sent.at(-1).peers,
    [blockedId],
    'resumed peer is blocked before next audio update',
  );
  const count = sent.length;
  voice.update();
  assert.equal(sent.length, count, 'unchanged rosters never flood controls');
  voice.press();
  documentMock.visibilityState = 'hidden';
  documentMock.dispatchEvent(new Event('visibilitychange'));
  assert.equal(voice.snapshot.microphone, false);
  assert.equal(voice.snapshot.transmitting, false);
  assert.equal(stops, 2);
  assert.equal(voice.snapshot.status, 'interrupted');
  documentMock.visibilityState = 'visible';
  game.status = 'offline';
  await assert.rejects(voice.enableMicrophone(), /Join a shared planet or room/);
  assert.equal(captureCalls, 2, 'solo setup never requests microphone permission');
  game.status = 'online';
  voice.enableListening = async () => {
    throw Error('Network unavailable');
  };
  const failedNetwork = voice.enableMicrophone();
  await assert.rejects(failedNetwork, /Network unavailable/);
  resolveCapture(stream);
  await Promise.resolve();
  assert.equal(
    stops,
    3,
    'permission granted after transport failure immediately stops the late track',
  );
  assert.equal(voice.snapshot.microphone, false);
});

test('rejected voice sockets retain connection limits until close and uncooperative closes are bounded', async (t) => {
  const server = createCoopServer({ voice: { limits: { connections: 1, perIp: 1 } } });
  const address: any = await server.listen(0, '127.0.0.1');
  const clients: WebSocket[] = [];
  t.after(async () => {
    for (const client of clients) client.terminate();
    await server.close();
  });
  const base = `ws://127.0.0.1:${address.port}/voice`;
  const bad = new WebSocket(base);
  clients.push(bad);
  bad.on('error', () => {});
  await once(bad, 'open');
  // Deliberately withhold the client's close reply, just as an adversarial wire peer can.
  (bad as any)._receiver.removeAllListeners('conclude');
  bad.send(JSON.stringify({ type: 'auth', ticket: 'x'.repeat(43), codecs: [VOICE_CODEC] }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(server.voice.connections.size, 1);
  assert.equal(server.voice.websocket.clients.size, 1);
  const rejected = new WebSocket(base);
  clients.push(rejected);
  rejected.on('error', () => {});
  const status = await new Promise<number>((resolve, reject) => {
    rejected.on('unexpected-response', (_req, res) => {
      res.resume();
      resolve(res.statusCode!);
    });
    rejected.on('open', () => reject(Error('Connection accounting was bypassed')));
  });
  assert.equal(status, 429);
  await new Promise((resolve) => setTimeout(resolve, 600));
  for (let i = 0; i < 20 && server.voice.connections.size; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(server.voice.connections.size, 0);
  assert.equal(server.voice.websocket.clients.size, 0);
});

test('mute stops incoming audio only while block is reciprocal; global overload drops instead of queueing', (t) => {
  const f = fixture(t, { limits: { globalBytesPerSecond: 1 } }),
    a = f.auth(f.member()),
    b = f.auth(f.member());
  f.control(b.c, { type: 'block', peers: [], muted: [a.c.game.member.id] });
  f.control(a.c, { type: 'ptt', active: true, mode: 'normal' });
  f.control(b.c, { type: 'ptt', active: true, mode: 'normal' });
  assert.equal(f.relay.recipients(a.c).length, 0);
  assert.equal(f.relay.recipients(b.c).length, 1);
  f.frame(b.c);
  assert.equal(f.relay.metrics.dropped, 1);
  assert.equal(a.socket.sent.filter((m) => m instanceof Uint8Array).length, 0);
});

test('WebSocket ping and unsolicited pong floods share bounded voice control budgets', async (t) => {
  const server = createCoopServer({ voice: { limits: { controlRate: 1, controlBurst: 2 } } });
  const address: any = await server.listen(0, '127.0.0.1');
  const clients: WebSocket[] = [];
  t.after(async () => {
    for (const client of clients) client.terminate();
    await server.close();
  });
  for (const kind of ['ping', 'pong'] as const) {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/voice`);
    clients.push(socket);
    socket.on('error', () => {});
    await once(socket, 'open');
    let responses = 0;
    socket.on('pong', () => responses++);
    const closed = once(socket, 'close');
    for (let i = 0; i < 100; i++) socket[kind](Buffer.alloc(125));
    const [code] = await closed;
    assert.equal(code, 1008);
    assert.ok(responses <= 2, `protocol amplification bounded: ${responses}`);
  }
  for (let i = 0; i < 20 && server.voice.connections.size; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(server.voice.connections.size, 0);
});
