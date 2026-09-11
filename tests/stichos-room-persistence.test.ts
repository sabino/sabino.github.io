import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
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
  signRoomHello,
  verifyRoomHello,
} from '../src/stichos/room-checkpoint.ts';
import { createCoopServer } from '../server/coop.mjs';
import { attachRoomDisk } from '../server/room-disk.mjs';
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

function platformSite(world: InfiniteWorld) {
  for (let y = 2; y < 60; y++)
    for (let x = -45; x <= 45; x++) {
      let clear = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const tile = world.tile(x + dx, y + dy);
          if (
            tile.building ||
            tile.site ||
            !['snow', 'grass'].includes(tile.terrain) ||
            world.blocked(tile.x, tile.y)
          )
            clear = false;
        }
      if (!clear || world.propsAround(x, y, 2.1).some((p) => Math.hypot(p.x - x, p.y - y) < 2.1))
        continue;
      const pine = world
        .propsAround(x, y, 16)
        .find((p) => p.kind === 'pine' && Math.hypot(p.x - x, p.y - y) <= 16);
      if (pine) return { point: { x, y }, pine };
    }
  throw Error('No actual clear production fixture.');
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

test('a renamed body updates presence and subsequent chat while retaining historical authors through authority restore', (t) => {
  const { hub, advance } = fixture(t);
  const a = traveler(hub),
    room = a.welcome.room;
  const b = traveler(hub, { room, name: 'Witness' });
  a.send({ type: 'chat', requestId: 'before', channel: 'world', text: 'First life' });
  const pose = { type: 'pose', x: 0, y: 5, heading: 1, phase: 0, appearance: look };
  a.send({ ...pose, name: '  Elara  ', bodyId: 'body:new-life' });
  assert.equal(b.socket.get('pose').peer.name, 'Elara');
  assert.equal(b.socket.get('pose').peer.bodyId, 'body:new-life');
  a.send(pose);
  assert.equal(b.socket.get('pose').peer.name, 'Elara', 'omitting a name retains the room alias');
  for (const name of ['', '   ', 'x'.repeat(65), 'bad\nname', 7]) {
    a.send({ ...pose, name });
    assert.equal(a.socket.get('error').code, 'invalid_pose');
    assert.equal(b.socket.get('pose').peer.name, 'Elara');
  }
  advance(1000);
  a.send({ type: 'chat', requestId: 'after', channel: 'world', text: 'Second life' });
  assert.equal(b.socket.get('chat').message.name, 'Elara');
  const record = hub.exportRoom(room)!;
  assert.deepEqual(
    record.state.chat.map((c: any) => c.name),
    ['Theo', 'Elara'],
  );
  const restored = new CoopRooms({ durable: true });
  restored.restoreRoom(record.state, record.privateState);
  const observer = traveler(restored, { room, name: 'Observer' });
  t.after(() => observer.socket.close());
  assert.equal(
    restored.exportRoom(room)!.privateState.members.find((p: any) => p.id === a.welcome.peerId)
      .name,
    'Elara',
  );
  assert.deepEqual(
    observer.welcome.chat.map((c: any) => c.name),
    ['Theo', 'Elara'],
  );
});

test('private disk backups above the old cap restore and oversized writes preserve the last good checkpoint', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verso-disk-bound-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { hub } = fixture(t),
    a = traveler(hub),
    room = a.welcome.room;
  const exportRoom = hub.exportRoom.bind(hub);
  let padding = 'x'.repeat(9_000_000);
  // Storage-boundary fixture: expand only the trusted private envelope, never public world data.
  hub.exportRoom = (id: string) => {
    const record = exportRoom(id)!;
    return { ...record, privateState: { ...record.privateState, storageBoundaryFixture: padding } };
  };
  const disk = await attachRoomDisk(hub, directory);
  await disk.flush();
  const path = join(directory, `${room}.json`),
    previous = await readFile(path, 'utf8');
  assert.ok(Buffer.byteLength(previous) > 8_000_000);
  const restored = new CoopRooms({ durable: true });
  await attachRoomDisk(restored, directory);
  assert.equal(restored.exportRoom(room)!.state.seed, 3886);
  padding = 'x'.repeat(32_000_001);
  await assert.rejects(() => disk.flush(), /storage limit/);
  assert.equal(
    await readFile(path, 'utf8'),
    previous,
    'failed write preserves the last signed backup',
  );
  await writeFile(path, padding);
  await assert.rejects(
    () => attachRoomDisk(new CoopRooms({ durable: true }), directory),
    /storage limit/,
  );
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
  const restored = new CoopRooms({ durable: true });
  restored.restoreRoom(exported.state, exported.privateState);
  const resumed = traveler(restored, { room: a.welcome.room, resumeToken: a.welcome.resumeToken });
  t.after(() => resumed.socket.close());
  assert.equal(resumed.welcome.chat[0].text, 'local only');
  assert.equal(restored.exportRoom(a.welcome.room)!.state.chat.length, 0);
  await assert.rejects(() =>
    signRoomCheckpoint({ ...exported.state, owner: { token: 'private' } } as any, key),
  );
  await assert.rejects(() =>
    signRoomCheckpoint({ ...exported.state, chat: resumed.welcome.chat }, key),
  );
});

test('owned production source claims persist and acknowledge exact job retries without allowing another job or owner to win', (t) => {
  const { hub } = fixture(t),
    world = new InfiniteWorld(3886, 3),
    site = platformSite(world),
    a = traveler(hub, { position: site.point }),
    room = a.welcome.room;
  a.send({
    type: 'machine',
    requestId: 'r1',
    machine: { id: 'platform:test', kind: 'sawmill', ...site.point },
  });
  assert.equal(a.socket.get('claimResult').ok, true);
  const pine = site.pine;
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
  a.pose({ x: 0, y: 5, heading: 0, phase: 0 }, look, true, false, undefined, 'body:elara', 'Elara');
  assert.equal((await a.sendChat('Persisted world chat', 'world')).ok, true);
  assert.equal(server.hub.exportRoom(room)!.state.chat[0].name, 'Elara');
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
  assert.equal(b.chatHistory[0].name, 'Elara');
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

test('platform registration rejects roads, resources, fractional tiles and concurrent overlap without mutating the losing owner', (t) => {
  const { hub } = fixture(t),
    a = traveler(hub),
    room = a.welcome.room;
  a.send({
    type: 'machine',
    requestId: 'road',
    machine: { id: 'road', kind: 'garden', x: 0, y: 5 },
  });
  assert.equal(a.socket.get('claimResult').ok, false);
  assert.equal(hub.exportRoom(room)!.state.machines.length, 0);
  const world = new InfiniteWorld(3886, 3),
    site = platformSite(world);
  a.send({ type: 'pose', ...site.point, heading: 0, phase: 0, appearance: look });
  const b = traveler(hub, { room, position: site.point });
  a.send({
    type: 'machine',
    requestId: 'fraction',
    machine: { id: 'fraction', kind: 'garden', x: site.point.x + 0.2, y: site.point.y },
  });
  assert.equal(a.socket.get('claimResult').ok, false);
  a.send({
    type: 'machine',
    requestId: 'first',
    machine: { id: 'first', kind: 'garden', ...site.point },
  });
  b.send({
    type: 'machine',
    requestId: 'second',
    machine: { id: 'second', kind: 'garden', ...site.point },
  });
  assert.equal(a.socket.get('claimResult').ok, true);
  assert.equal(b.socket.get('claimResult').ok, false);
  const state = hub.exportRoom(room)!.state;
  assert.equal(state.machines.length, 1);
  assert.equal(state.machines[0].ownerId, a.welcome.peerId);
});

test('actual hostile damage receipts survive authority restore and a synchronous acknowledgement clears only persisted delivered receipts', (t) => {
  const { hub, advance } = fixture(t),
    world = new InfiniteWorld(3886, 3);
  const npc = world.npcsAround(-352, -448, 16).find((n) => n.role === 'raider' && n.hostile)!;
  assert.ok(npc);
  const position = [
    { x: npc.x + 1, y: npc.y },
    { x: npc.x - 1, y: npc.y },
    { x: npc.x, y: npc.y + 1 },
    { x: npc.x, y: npc.y - 1 },
  ].find((p) => !world.blocked(p.x, p.y))!;
  assert.ok(position);
  const a = traveler(hub, { position, combatActive: true, bodyId: 'body:hit' }),
    room = a.welcome.room;
  let hit: any;
  for (let i = 0; i < 50 && !hit; i++) {
    advance(100);
    a.send({
      type: 'pose',
      ...position,
      heading: 0,
      phase: 0,
      appearance: look,
      combatActive: true,
      bodyId: 'body:hit',
    });
    hub.tick(0.1);
    hit = a.socket.messages
      .flatMap((m) => (m.type === 'combat_frame' ? m.frame.hits : []))
      .find((h) => h.target === 'peer');
  }
  assert.ok(hit, 'actual generated hostile must hit the standing active body');
  const backup = hub.exportRoom(room)!;
  assert.ok((backup.privateState as any).members[0].combatHits.some((h: any) => h.id === hit.id));
  a.socket.close();
  const restored = new CoopRooms({ durable: true });
  restored.restoreRoom(backup.state, backup.privateState);
  const b = traveler(restored, {
    room,
    resumeToken: a.welcome.resumeToken,
    position,
    bodyId: 'body:hit',
  });
  t.after(() => b.socket.close());
  assert.ok(
    b.welcome.combat.hits.some((h: any) => h.id === hit.id && h.targetBodyId === 'body:hit'),
  );
  b.send({ type: 'combat_ack', eventId: hit.id });
  const after = restored.exportRoom(room)!;
  assert.equal((after.privateState as any).members[0].combatHits.length, 0);
  b.send({ type: 'combat_ack', eventId: hit.id + 10000 });
  assert.equal(b.socket.get('error').code, 'invalid_combat_ack');
  assert.equal((restored.exportRoom(room)!.privateState as any).members[0].combatAck, hit.id);
});

test('live authority proofs reject a replayed nonce, another room, another signing key and a substituted RTC fingerprint', async () => {
  const identity = await createRoomSigningIdentity(),
    nonce = 'a'.repeat(64),
    binding = 'sha-256 aa:bb:cc';
  const proof = await signRoomHello('ABCDEF', nonce, binding, identity);
  assert.equal(await verifyRoomHello(proof, nonce, 'ABCDEF', binding, identity.publicKey), true);
  assert.equal(
    await verifyRoomHello(proof, 'b'.repeat(64), 'ABCDEF', binding, identity.publicKey),
    false,
  );
  assert.equal(await verifyRoomHello(proof, nonce, 'FEDCBA', binding, identity.publicKey), false);
  assert.equal(
    await verifyRoomHello(proof, nonce, 'ABCDEF', 'sha-256 dd:ee:ff', identity.publicKey),
    false,
  );
  assert.equal(
    await verifyRoomHello(
      proof,
      nonce,
      'ABCDEF',
      binding,
      (await createRoomSigningIdentity()).publicKey,
    ),
    false,
  );
  assert.equal(
    await verifyRoomHello(
      { ...proof, issuedAt: Infinity },
      nonce,
      'ABCDEF',
      binding,
      identity.publicKey,
    ),
    false,
  );
});

test('known-world client rejects changed live keys before world/combat callbacks and applies a valid pinned welcome only after verification', async (t) => {
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
    who = {
      seed: 3886,
      generation: 3 as const,
      name: 'Theo',
      appearance: look,
      position: { x: 0, y: 5 },
    };
  const a = new MultiplayerConnection();
  await a.connect(url, who);
  const room = a.room,
    peerId = a.peerId;
  const identity = await server.hub.signingIdentity(room),
    checkpoint = await signRoomCheckpoint(server.hub.exportRoom(room)!.state, identity);
  assert.equal(storeRoom({ checkpoint }), true);
  a.disconnect();
  await new Promise((r) => setTimeout(r, 20));
  server.hub.publishCheckpoint(checkpoint);
  server.hub.setSigningIdentity(room, await createRoomSigningIdentity());
  let worldCalls = 0,
    combatCalls = 0,
    machineCalls = 0,
    secretsSent = 0;
  const handle = server.hub.handle.bind(server.hub);
  server.hub.handle = (c: any, m: any) => {
    if (m.type === 'join' && m.resumeToken) secretsSent++;
    return handle(c, m);
  };
  const wrong = new MultiplayerConnection();
  wrong.onWorld = () => worldCalls++;
  wrong.onCombat = () => combatCalls++;
  wrong.onMachines = () => machineCalls++;
  await assert.rejects(() => wrong.connect(url, who, room), /signing key/);
  assert.equal(
    secretsSent,
    0,
    'private credential must remain unsent until the authority proves its key',
  );
  assert.equal(worldCalls + combatCalls + machineCalls, 0);
  assert.equal(readRoomCredential(url, room)!.peerId, peerId);
  await new Promise((r) => setTimeout(r, 20));
  server.hub.setSigningIdentity(room, identity);
  const valid = new MultiplayerConnection();
  t.after(() => valid.disconnect());
  valid.onWorld = () => worldCalls++;
  valid.onCombat = () => combatCalls++;
  valid.onMachines = () => machineCalls++;
  await valid.connect(url, who, room);
  assert.equal(secretsSent, 1);
  assert.equal(valid.peerId, peerId);
  assert.equal(worldCalls, 1);
  assert.ok(combatCalls >= 1);
  assert.equal(machineCalls, 1);
  server.hub.broadcast(server.hub.rooms.get(room), {
    type: 'machines',
    machines: Array.from({ length: 257 }, () => ({ id: 'bad', x: NaN, y: 0 })),
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(machineCalls, 1);
  valid.disconnect();
});
