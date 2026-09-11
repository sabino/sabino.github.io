import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { InfiniteWorld, appearance } from '../src/stichos/world.ts';
import { MULTIPLAYER_PROTOCOL } from '../src/stichos/multiplayer-protocol.ts';
import {
  createRoomSigningIdentity,
  signRoomCheckpoint,
  verifyRoomCheckpoint,
} from '../src/stichos/room-checkpoint.ts';
import { createCoopServer } from '../server/coop.mjs';
import { RoomPersistence } from '../src/stichos/room-persistence.ts';
import {
  getBrowserPlayerId,
  storeRoom,
  saveRoomReplica,
  loadSavedRoom,
  savedWorlds,
  readRoomCredential,
} from '../src/stichos/room-storage.ts';
import { MultiplayerConnection, discoverRoom } from '../src/stichos/multiplayer.ts';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages: any[] = [];
  send(raw: string) {
    this.messages.push(JSON.parse(raw));
  }
  close() {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  ping() {
    this.emit('pong');
  }
  get(type: string) {
    return this.messages.filter((m) => m.type === type).at(-1);
  }
}
const look = appearance(42, 'pilgrim', 1);
const identity = (extra: any = {}) => ({
  type: 'join',
  protocol: MULTIPLAYER_PROTOCOL,
  seed: 3886,
  generation: 3,
  name: 'Theo',
  appearance: look,
  position: { x: 0, y: 5 },
  ...extra,
});
function traveler(hub: CoopRooms, extra: any = {}) {
  const socket = new Socket();
  const connection = hub.attach(socket);
  hub.handle(connection, identity(extra));
  return {
    socket,
    connection,
    welcome: socket.get('welcome'),
    send: (message: any) => hub.handle(connection, message),
  };
}
function fixture(t: any) {
  let time = 10000;
  const hub = new CoopRooms({ now: () => time, durable: true });
  t.after(() => {
    for (const c of hub.connections) c.socket.close();
  });
  return { hub, advance: (ms: number) => (time += ms) };
}

test('authoritative spatial speech, planet chat, bounded history and replay do not disclose distant speech', (t) => {
  const { hub, advance } = fixture(t);
  const a = traveler(hub),
    room = a.welcome.room;
  const b = traveler(hub, { room, name: 'Near', position: { x: 1, y: 5 } });
  const far = traveler(hub, { room, name: 'Far', position: { x: 0, y: 40 } });
  assert.ok(far.welcome);
  a.send({
    type: 'chat',
    requestId: 'r1',
    channel: 'say',
    text: '<b>literal & herbs</b>',
    name: 'Forged',
  });
  assert.equal(a.socket.get('chat_result').ok, true);
  assert.equal(b.socket.get('chat').message.name, 'Theo');
  assert.equal(b.socket.get('chat').message.text, '<b>literal & herbs</b>');
  assert.equal(far.socket.get('chat'), undefined);
  a.send({ type: 'chat', requestId: 'r1', channel: 'say', text: '<b>literal & herbs</b>' });
  assert.equal(b.socket.messages.filter((m) => m.type === 'chat').length, 1);
  a.send({ type: 'chat', requestId: 'r2', channel: 'world', text: 'too soon' });
  assert.equal(a.socket.get('chat_result').ok, false);
  advance(1000);
  a.send({ type: 'chat', requestId: 'r3', channel: 'world', text: 'Planet-wide' });
  assert.equal(far.socket.get('chat').message.text, 'Planet-wide');
  a.send({ type: 'chat', requestId: 'r4', channel: 'world', text: 'x'.repeat(281) });
  assert.equal(a.socket.get('chat_result').ok, false);
  a.send({ type: 'chat', requestId: 'r5', channel: 'world', text: 'line\nbreak' });
  assert.equal(a.socket.get('chat_result').ok, false);
  for (let i = 0; i < 205; i++) {
    advance(1000);
    a.send({ type: 'chat', requestId: `chat${i}`, channel: 'world', text: `message ${i}` });
  }
  const late = traveler(hub, { room, position: { x: 0, y: 40 } });
  assert.equal(late.welcome.chat.length, 200);
  assert.equal(hub.exportRoom(room)!.state.chat.length, 200);
});

test('signed public checkpoints reject mutation, wrong authority and rollback and exclude private credentials and spatial speech', async (t) => {
  const { hub } = fixture(t);
  const a = traveler(hub);
  a.send({ type: 'chat', requestId: 'c', channel: 'say', text: 'local only' });
  const exported = hub.exportRoom(a.welcome.room)!;
  assert.equal(exported.state.chat.length, 0);
  assert.equal(JSON.stringify(exported.state).includes(a.welcome.resumeToken), false);
  const key = await createRoomSigningIdentity(),
    one = await signRoomCheckpoint(exported.state, key),
    two = await signRoomCheckpoint(exported.state, key, one);
  assert.equal(await verifyRoomCheckpoint(one), true);
  assert.equal(await verifyRoomCheckpoint(two, one), true);
  assert.equal(await verifyRoomCheckpoint(one, two), false);
  const changed = structuredClone(two);
  changed.state.removed.push('forged-resource');
  assert.equal(await verifyRoomCheckpoint(changed), false);
  const alien = await signRoomCheckpoint(exported.state, await createRoomSigningIdentity(), two);
  assert.equal(await verifyRoomCheckpoint(alien, two), false);
  assert.equal(JSON.stringify(one).includes('privateKey'), false);
  assert.equal('d' in one.authority, false);
  a.send({ type: 'restore', state: { ...exported.state, removed: ['injected'] } });
  assert.equal(hub.exportRoom(a.welcome.room)!.state.removed.length, 0);
});

test('owned production source claims persist and acknowledge exact job retries without allowing another job or owner to win', (t) => {
  const { hub } = fixture(t),
    a = traveler(hub),
    room = a.welcome.room;
  a.send({
    type: 'machine',
    requestId: 'r1',
    machine: { id: 'platform:test', kind: 'sawmill', x: 0, y: 5 },
  });
  assert.equal(a.socket.get('claimResult').ok, true);
  const world = new InfiniteWorld(3886, 3),
    pine = world.propsAround(0, 5, 16).find((p) => p.kind === 'pine')!;
  assert.ok(pine);
  const claim = {
    type: 'production',
    machineId: 'platform:test',
    jobId: 'batch:1',
    propId: pine.id,
    x: pine.x,
    y: pine.y,
  };
  a.send({ ...claim, requestId: 'r2' });
  assert.equal(a.socket.get('claimResult').ok, true);
  a.send({ ...claim, requestId: 'r3' });
  assert.equal(a.socket.get('claimResult').ok, true);
  a.send({ ...claim, requestId: 'r4', jobId: 'batch:2' });
  assert.equal(a.socket.get('claimResult').ok, false);
  const other = traveler(hub, { room });
  other.send({ ...claim, requestId: 'other' });
  assert.equal(other.socket.get('claimResult').ok, false);
  const backup = hub.exportRoom(room)!;
  a.socket.close();
  other.socket.close();
  const restored = new CoopRooms({ durable: true });
  restored.restoreRoom(backup.state, backup.privateState);
  const resumed = traveler(restored, { room, resumeToken: a.welcome.resumeToken });
  t.after(() => resumed.socket.close());
  assert.equal(resumed.welcome.peerId, a.welcome.peerId);
  assert.ok(resumed.welcome.removed.includes(pine.id));
  resumed.send({ ...claim, requestId: 'r5' });
  assert.equal(resumed.socket.get('claimResult').ok, true);
  assert.equal(restored.exportRoom(room)!.state.productionReceipts.length, 1);
});

test('coalesced authority persistence keeps independent signed revisions and private member resume state', async (t) => {
  const { hub } = fixture(t),
    a = traveler(hub);
  const records: any[] = [];
  const writer = new RoomPersistence(hub, (record) => {
    records.push(record);
  });
  await Promise.all([writer.flush(), writer.flush()]);
  assert.equal(records.length, 1);
  await writer.flush();
  assert.equal(records[1].checkpoint.revision, 2);
  assert.equal(records[1].checkpoint.previous, records[0].checkpoint.hash);
  assert.equal(await verifyRoomCheckpoint(records[1].checkpoint, records[0].checkpoint), true);
  assert.equal(records[1].owner.privateState.members[0].token, a.welcome.resumeToken);
  assert.equal(a.socket.get('checkpoint').checkpoint.revision, 2);
});

test('a real server restart restores signed world changes and authenticated identity; discovery does not consume a player slot', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verso-room-'));
  let server = createCoopServer({ persistenceDirectory: directory });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  let address: any = await server.listen(0, '127.0.0.1');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(socket, 'open');
  const welcomePromise = once(socket, 'message');
  socket.send(
    JSON.stringify(identity({ clientId: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12) })),
  );
  const welcome = JSON.parse((await welcomePromise)[0].toString());
  // Actual wire action modifies the shared door/resource state, not a client checkpoint upload.
  socket.send(
    JSON.stringify({ type: 'pose', x: -1, y: 5, heading: 0, phase: 0, appearance: look }),
  );
  socket.send(
    JSON.stringify({
      type: 'claim',
      requestId: 'r1',
      propId: 'origin:cequin',
      kind: 'gather',
      toolKind: 'sickle',
      x: -2,
      y: 5,
    }),
  );
  await new Promise((r) => setTimeout(r, 60));
  await server.checkpoint();
  socket.close();
  await once(socket, 'close');
  await server.close();
  const saved = JSON.parse(await readFile(join(directory, `${welcome.room}.json`), 'utf8'));
  assert.ok(saved.checkpoint.state.removed.includes('origin:cequin'));
  server = createCoopServer({ persistenceDirectory: directory });
  address = await server.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const info = await discoverRoom(url, welcome.room);
  assert.equal(info.seed, 3886);
  assert.equal(info.players, 0);
  const resumed = new WebSocket(url);
  await once(resumed, 'open');
  const incoming = once(resumed, 'message');
  resumed.send(
    JSON.stringify(
      identity({
        room: welcome.room,
        resumeToken: welcome.resumeToken,
        clientId: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12),
      }),
    ),
  );
  const next = JSON.parse((await incoming)[0].toString());
  assert.equal(next.peerId, welcome.peerId);
  assert.ok(next.removed.includes('origin:cequin'));
  resumed.close();
  await once(resumed, 'close');
});

test('browser credentials survive a new client instance and signed visitor replicas cannot overwrite an owned world', async (t) => {
  const data = new Map<string, string>(),
    descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    previousSocket = globalThis.WebSocket;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, v: string) => data.set(key, v),
      removeItem: (key: string) => data.delete(key),
    },
  });
  globalThis.WebSocket = WebSocket as any;
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete (globalThis as any).localStorage;
    globalThis.WebSocket = previousSocket;
  });
  const server = createCoopServer({ durable: true }),
    address: any = await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  const url = `ws://127.0.0.1:${address.port}/ws`,
    a = new MultiplayerConnection(),
    id = getBrowserPlayerId();
  const who = {
    seed: 3886,
    generation: 3 as const,
    name: 'Theo',
    appearance: look,
    position: { x: 0, y: 5 },
  };
  await a.connect(url, who);
  const room = a.room,
    peerId = a.peerId;
  assert.equal((await a.sendChat('Persisted world chat', 'world')).ok, true);
  const serial = readRoomCredential(url, room)!.serial;
  assert.ok(serial > 0);
  a.disconnect();
  await new Promise((r) => setTimeout(r, 20));
  const b = new MultiplayerConnection();
  t.after(() => b.disconnect());
  await b.connect(url, who, room);
  assert.equal(b.peerId, peerId);
  assert.equal(getBrowserPlayerId(), id);
  assert.equal(b.chatHistory[0].text, 'Persisted world chat');
  await b.sendChat('another message', 'world');
  assert.ok(readRoomCredential(url, room)!.serial > serial);
  const exported = server.hub.exportRoom(room)!,
    keys = await createRoomSigningIdentity(),
    one = await signRoomCheckpoint(exported.state, keys);
  assert.equal(
    storeRoom({ checkpoint: one, owner: { identity: keys, privateState: exported.privateState } }),
    true,
  );
  const newer = await signRoomCheckpoint(exported.state, keys, one);
  assert.equal(await saveRoomReplica(newer), false);
  assert.equal((await loadSavedRoom(room))!.checkpoint.hash, one.hash);
  assert.equal(savedWorlds()[0].owned, true);
  b.disconnect();
});
