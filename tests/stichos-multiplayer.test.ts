import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createCoopServer } from '../server/coop.mjs';
import { InfiniteWorld, appearance } from '../src/stichos/world.ts';
import { MultiplayerConnection } from '../src/stichos/multiplayer.ts';
import { resolveForge } from '../src/stichos/forge.ts';
import { generateArtifact } from '../src/stichos/artifacts.ts';
import { artifactToolKind } from '../src/stichos/labor.ts';
import { MULTIPLAYER_PROTOCOL } from '../src/stichos/multiplayer-protocol.ts';
import { validSharedCombatFrame } from '../src/stichos/shared-combat.ts';
import { weaponProfile } from '../src/stichos/equipment.ts';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const look = () => ({ ...appearance(42, 'pilgrim', 1), weapon: 'staff' });
const identity = (extra = {}) => ({
  type: 'join',
  protocol: MULTIPLAYER_PROTOCOL,
  seed: 3886,
  generation: 3,
  name: 'Theo',
  appearance: look(),
  position: { x: 0, y: 5 },
  ...extra,
});
async function serverFixture(t: any, options = {}) {
  const server = createCoopServer(options);
  const address = await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  return {
    server,
    url: `ws://127.0.0.1:${address.port}/ws`,
    http: `http://127.0.0.1:${address.port}`,
  };
}
async function wire(url: string, options = {}) {
  const socket = new WebSocket(url, options);
  const queue: any[] = [],
    history: any[] = [];
  socket.on('message', (data: Buffer) => {
    const m = JSON.parse(data.toString());
    queue.push(m);
    history.push(m);
  });
  socket.on('error', () => {});
  await once(socket, 'open');
  return {
    socket,
    history,
    send(message: unknown) {
      socket.send(JSON.stringify(message));
    },
    async next(type: string, predicate = (_value: any) => true) {
      const until = Date.now() + 2500;
      while (Date.now() < until) {
        const index = queue.findIndex((m) => m.type === type && predicate(m));
        if (index >= 0) return queue.splice(index, 1)[0];
        await pause(5);
      }
      throw Error(`No ${type} message. Received: ${JSON.stringify(history)}`);
    },
  };
}
async function join(url: string, extra = {}) {
  const client = await wire(url);
  client.send(identity(extra));
  return { ...client, welcome: await client.next('welcome') };
}
function adjacent(
  world: InfiniteWorld,
  prop: { x: number; y: number },
  removed = new Set<string>(),
) {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const point = { x: prop.x + dx, y: prop.y + dy };
    if (!world.blocked(point.x, point.y, removed)) return point;
  }
  throw Error('No clear adjacent fixture point');
}

test('two real sockets share humanoid presence, emotes and an atomic single-winner generated harvest', async (t) => {
  const { server, url } = await serverFixture(t);
  const alice = await join(url);
  const bob = await join(url, { room: alice.welcome.room, name: 'Mira' });
  assert.equal(bob.welcome.peers.length, 2);
  assert.ok(bob.welcome.peers.every((p: any) => !('resumeToken' in p) && !('token' in p)));
  assert.equal((await alice.next('peerJoined')).peer.id, bob.welcome.peerId);
  const position = { x: -1, y: 5 };
  const pose = { type: 'pose', ...position, heading: -1, phase: 7, appearance: look() };
  alice.send(pose);
  bob.send({ ...pose, heading: 1 });
  assert.equal((await bob.next('pose')).peer.heading, -1);
  assert.equal((await alice.next('pose')).peer.phase, 7);
  alice.send({ type: 'emote', gesture: 'wave' });
  assert.deepEqual(await bob.next('emote'), {
    type: 'emote',
    peerId: alice.welcome.peerId,
    gesture: 'wave',
  });
  const request = {
    type: 'claim',
    propId: 'origin:cequin',
    kind: 'gather',
    toolKind: 'sickle',
    x: -2,
    y: 5,
  };
  // Both frames enter independent network connections before either winner is observed.
  alice.send({ ...request, requestId: 'alice-harvest' });
  bob.send({ ...request, requestId: 'bob-harvest' });
  const a = await alice.next('claimResult'),
    b = await bob.next('claimResult');
  assert.equal(Number(a.ok) + Number(b.ok), 1);
  const winner = a.ok ? alice : bob;
  const changeA = await alice.next('world'),
    changeB = await bob.next('world');
  assert.deepEqual(changeA, changeB);
  assert.deepEqual(changeA.removed, ['origin:cequin']);
  assert.equal(changeA.actorId, winner.welcome.peerId);
  assert.ok(
    winner.history.findIndex((m) => m.type === 'claimResult') <
      winner.history.findIndex((m) => m.type === 'world'),
    'the winner can finish its local interaction before handling its own world delta',
  );
  const room = server.hub.rooms.get(alice.welcome.room);
  assert.equal(room.removed.size, 1);
  const late = await join(url, { room: alice.welcome.room, name: 'Late arrival' });
  assert.deepEqual(late.welcome.removed, ['origin:cequin']);
});

test('claims require a real nearby object, correct action, coordinates and harvesting tool; retries cannot change their target', async (t) => {
  const { server, url } = await serverFixture(t);
  const player = await join(url);
  const attempt = async (id: string, extra: object) => {
    player.send({
      type: 'claim',
      requestId: id,
      propId: 'origin:cequin',
      kind: 'gather',
      toolKind: 'sickle',
      x: -2,
      y: 5,
      ...extra,
    });
    return player.next('claimResult');
  };
  assert.equal((await attempt('remote', {})).ok, false, 'spawn is too far from the first plant');
  assert.equal((await attempt('fake', { propId: 'invented-resource' })).ok, false);
  player.send({ type: 'pose', x: -1, y: 5, heading: 0, phase: 0, appearance: look() });
  assert.equal((await attempt('wrong-position', { x: 600 })).ok, false);
  assert.equal((await attempt('wrong-kind', { kind: 'loot' })).ok, false);
  assert.equal((await attempt('first', {})).ok, true);
  assert.equal(
    (await attempt('first', {})).ok,
    true,
    'identical retry returns its previous receipt',
  );
  assert.equal((await attempt('first', { propId: 'origin:cequin:2', y: 6 })).ok, false);
  assert.equal(
    (await attempt('second-id', {})).ok,
    false,
    'another action cannot harvest the claimed object twice',
  );
  const room = server.hub.rooms.get(player.welcome.room);
  assert.deepEqual([...room.removed], ['origin:cequin']);
  const pine = room.world.propsAround(-5, 4, 1).find((p: any) => p.kind === 'pine');
  assert.ok(pine);
  player.send({
    type: 'pose',
    ...adjacent(room.world, pine),
    heading: 0,
    phase: 0,
    appearance: { ...look(), weapon: 'bow' },
  });
  assert.equal((await attempt('no-tool', { propId: pine.id, x: pine.x, y: pine.y })).ok, false);
  player.send({
    type: 'pose',
    ...adjacent(room.world, pine),
    heading: 0,
    phase: 0,
    appearance: look(),
  });
  assert.equal(
    (
      await attempt('staff-cannot-mine', {
        propId: pine.id,
        x: pine.x,
        y: pine.y,
        toolKind: undefined,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await attempt('wrong-real-tool', {
        propId: pine.id,
        x: pine.x,
        y: pine.y,
        toolKind: 'pickaxe',
      })
    ).ok,
    false,
  );
  assert.equal(
    (await attempt('axe-tool', { propId: pine.id, x: pine.x, y: pine.y, toolKind: 'axe' })).ok,
    true,
  );
  assert.ok(
    !room.world.blocked(pine.x, pine.y, room.removed),
    'successful timber gathering opens the real shared collision cell',
  );
});

test('a generated artifact must have the actual resource specialization while legacy worlds retain their old staff contract', async (t) => {
  const { url } = await serverFixture(t);
  const world = new InfiniteWorld(3886, 3),
    pine = world.propsAround(-5, 4, 1).find((p) => p.kind === 'pine')!;
  const generated = Array.from({ length: 512 }, (_, i) => generateArtifact(`labor/tool/${i}`));
  const axe = generated.find((g) => artifactToolKind(g) === 'axe')!;
  const pickaxe = generated.find((g) => artifactToolKind(g) === 'pickaxe')!;
  const modern = await join(url, {
    position: adjacent(world, pine),
    appearance: { ...look(), artifactDesign: pickaxe.design },
  });
  modern.send({
    type: 'claim',
    requestId: 'wrong-artifact',
    propId: pine.id,
    kind: 'gather',
    x: pine.x,
    y: pine.y,
  });
  assert.equal((await modern.next('claimResult')).ok, false);
  modern.send({
    type: 'pose',
    ...adjacent(world, pine),
    heading: 0,
    phase: 0,
    appearance: { ...look(), artifactDesign: axe.design },
  });
  modern.send({
    type: 'claim',
    requestId: 'right-artifact',
    propId: pine.id,
    kind: 'gather',
    x: pine.x,
    y: pine.y,
  });
  assert.equal((await modern.next('claimResult')).ok, true);
  const oldWorld = new InfiniteWorld(3886, 1),
    oldPine = oldWorld.propsAround(-5, 4, 1).find((p) => p.kind === 'pine')!;
  const legacy = await join(url, { generation: 1, position: adjacent(oldWorld, oldPine) });
  legacy.send({
    type: 'claim',
    requestId: 'old-staff',
    propId: oldPine.id,
    kind: 'gather',
    x: oldPine.x,
    y: oldPine.y,
  });
  assert.equal((await legacy.next('claimResult')).ok, true);
});

test('generated loot is opened once and door state cannot close over another connected traveler', async (t) => {
  const { server, url } = await serverFixture(t);
  const world = new InfiniteWorld(3886, 3);
  const props = world.propsAround(0, 0, 30);
  const chest = props.find((p) => ['chest', 'crate'].includes(p.kind));
  const door = props.find((p) => p.kind === 'door');
  assert.ok(chest && door);
  const alice = await join(url, { position: adjacent(world, chest) });
  const bob = await join(url, { room: alice.welcome.room });
  alice.send({
    type: 'claim',
    requestId: 'loot-1',
    propId: chest.id,
    kind: 'loot',
    x: chest.x,
    y: chest.y,
  });
  assert.equal((await alice.next('claimResult')).ok, true);
  assert.deepEqual((await bob.next('world')).opened, [chest.id]);
  alice.send({
    type: 'claim',
    requestId: 'loot-2',
    propId: chest.id,
    kind: 'loot',
    x: chest.x,
    y: chest.y,
  });
  assert.equal((await alice.next('claimResult')).ok, false);
  const beside = adjacent(world, door);
  alice.send({ type: 'pose', ...beside, heading: 0, phase: 0, appearance: look() });
  await bob.next('pose');
  bob.send({ type: 'pose', x: door.x, y: door.y, heading: 0, phase: 0, appearance: look() });
  assert.equal((await bob.next('error')).code, 'blocked_pose');
  alice.send({ type: 'door', requestId: 'open-door', propId: door.id, open: true });
  assert.equal((await alice.next('claimResult')).ok, true);
  assert.deepEqual((await bob.next('world')).opened, [door.id]);
  bob.send({ type: 'pose', x: door.x, y: door.y, heading: 0, phase: 0, appearance: look() });
  await alice.next('pose');
  alice.send({ type: 'door', requestId: 'occupied-door', propId: door.id, open: false });
  assert.equal((await alice.next('claimResult')).ok, false);
  bob.send({ type: 'pose', ...beside, heading: 0, phase: 0, appearance: look() });
  await alice.next('pose');
  alice.send({ type: 'door', requestId: 'clear-door', propId: door.id, open: false });
  assert.equal((await alice.next('claimResult')).ok, true);
  assert.deepEqual((await bob.next('world')).closed, [door.id]);
  const room = server.hub.rooms.get(alice.welcome.room);
  assert.ok(!room.removed.has(door.id) && !room.opened.has(door.id));
  assert.equal(
    room.world.blocked(door.x, door.y, room.removed),
    true,
    'Closing restores actual collision after the peer has left the doorway.',
  );
});

test('new rooms reject closed doorway positions while an already-open shared doorway permits joining', async (t) => {
  const { server, url } = await serverFixture(t);
  const world = new InfiniteWorld(3886, 3);
  const door = world.propsAround(0, 0, 24).find((p) => p.kind === 'door')!;
  assert.ok(door);
  const candidate = await wire(url);
  candidate.send(identity({ position: { x: door.x, y: door.y } }));
  const rejected = await candidate.next('error');
  assert.equal(rejected.code, 'blocked_pose');
  assert.match(rejected.reason, /clear ground/i);
  assert.equal(server.hub.rooms.size, 0, 'A failed doorway start must not allocate a room.');

  const host = await join(url, { position: adjacent(world, door) });
  host.send({ type: 'door', requestId: 'open-for-arrival', propId: door.id, open: true });
  assert.equal((await host.next('claimResult')).ok, true);
  candidate.send(identity({ room: host.welcome.room, position: { x: door.x, y: door.y } }));
  const welcome = await candidate.next('welcome');
  assert.deepEqual(welcome.opened, [door.id]);
  assert.ok(welcome.removed.includes(door.id));
  assert.ok(welcome.peers.some((p) => p.id === welcome.peerId && p.x === door.x && p.y === door.y));
});

test('disconnect broadcasts departure and a private valid token restores identity and shared claims without duplication', async (t) => {
  const { url } = await serverFixture(t);
  const alice = await join(url, { position: { x: -1, y: 5 } });
  const bob = await join(url, { room: alice.welcome.room });
  alice.send({
    type: 'claim',
    requestId: 'before-disconnect',
    propId: 'origin:cequin',
    kind: 'gather',
    toolKind: 'sickle',
    x: -2,
    y: 5,
  });
  await alice.next('claimResult');
  await bob.next('world');
  alice.socket.close();
  assert.equal((await bob.next('peerLeft')).peerId, alice.welcome.peerId);
  const invalid = await wire(url);
  invalid.send(identity({ room: alice.welcome.room, resumeToken: 'A'.repeat(32) }));
  assert.equal((await invalid.next('error')).code, 'resume_expired');
  const resumed = await join(url, {
    room: alice.welcome.room,
    resumeToken: alice.welcome.resumeToken,
    position: { x: -1, y: 5 },
  });
  assert.equal(resumed.welcome.peerId, alice.welcome.peerId);
  assert.deepEqual(resumed.welcome.removed, ['origin:cequin']);
  assert.equal(resumed.welcome.peers.filter((p: any) => p.id === alice.welcome.peerId).length, 1);
  const intruder = await wire(url);
  intruder.send(identity({ room: alice.welcome.room, resumeToken: alice.welcome.resumeToken }));
  assert.equal((await intruder.next('error')).code, 'resume_in_use');
  resumed.send({
    type: 'claim',
    requestId: 'after-disconnect',
    propId: 'origin:cequin',
    kind: 'gather',
    toolKind: 'sickle',
    x: -2,
    y: 5,
  });
  assert.equal((await resumed.next('claimResult')).ok, false);
});

test('room seed/generation, eight-player capacity, clear coordinates and abandoned-room expiry are enforced', async (t) => {
  let clock = 1000;
  const { server, url } = await serverFixture(t, {
    now: () => clock,
    maxRooms: 1,
    reconnectMs: 100,
    roomIdleMs: 200,
  });
  const first = await join(url);
  const mismatch = await wire(url);
  mismatch.send(identity({ room: first.welcome.room, generation: 2 }));
  assert.equal((await mismatch.next('error')).code, 'world_mismatch');
  mismatch.send(identity({ room: first.welcome.room, seed: 1 }));
  assert.equal((await mismatch.next('error')).code, 'world_mismatch');
  mismatch.send(identity({ position: { x: Infinity, y: 0 } }));
  assert.equal((await mismatch.next('error')).code, 'invalid_join');
  const clients = [first];
  for (let i = 1; i < 8; i++)
    clients.push(await join(url, { room: first.welcome.room, name: `Traveler ${i}` }));
  mismatch.send(identity({ room: first.welcome.room }));
  assert.equal((await mismatch.next('error')).code, 'room_full');
  mismatch.send(identity());
  assert.equal((await mismatch.next('error')).code, 'server_full');
  first.send({ type: 'pose', x: -5, y: 4, heading: 0, phase: 0, appearance: look() });
  assert.equal((await first.next('error')).code, 'blocked_pose');
  for (const client of clients) client.socket.close();
  await pause(25);
  clock += 201;
  server.hub.sweep();
  assert.equal(server.hub.rooms.size, 0);
  mismatch.send(identity());
  assert.ok((await mismatch.next('welcome')).room !== first.welcome.room);
});

test('malformed and excessive network input is bounded, and an unrelated website cannot upgrade the socket', async (t) => {
  const { url } = await serverFixture(t, { messageBurst: 5, messagesPerSecond: 0 });
  const bad = await wire(url);
  bad.socket.send('{broken json');
  assert.equal((await bad.next('error')).code, 'invalid_json');
  const flood = await join(url);
  const closed = once(flood.socket, 'close');
  for (let i = 0; i < 8; i++)
    flood.send({ type: 'pose', x: 0, y: 5, heading: 0, phase: i, appearance: look() });
  const [code] = await closed;
  assert.equal(code, 1008);
  const large = await wire(url);
  const largeClosed = once(large.socket, 'close');
  large.socket.send('x'.repeat(9000));
  assert.equal((await largeClosed)[0], 1009);
  await assert.rejects(wire(url, { origin: 'https://unrelated.example' }), /403/);
});

test('HTTP store routing receives the exact raw request body before the shared server fallback', async (t) => {
  let observed = '';
  const { http } = await serverFixture(t, {
    storeHandler: async (req: any, res: any) => {
      if (req.url !== '/api/store/webhook') return false;
      for await (const part of req) observed += part.toString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"received":true}');
      return true;
    },
  });
  const raw = '{ "signed": [1, 2] }\n';
  const response = await fetch(`${http}/api/store/webhook`, { method: 'POST', body: raw });
  assert.equal(response.status, 200);
  assert.equal(observed, raw);
  assert.equal((await (await fetch(`${http}/health`)).json()).protocol, MULTIPLAYER_PROTOCOL);
  assert.equal((await fetch(`${http}/missing`)).status, 404);
});

test('the actual browser client preserves gather and loot actions when given full generated props', async (t) => {
  const { server, url } = await serverFixture(t);
  const client = new MultiplayerConnection();
  t.after(() => client.disconnect());
  await client.connect(url, {
    seed: 3886,
    generation: 3,
    name: 'Client adapter regression',
    appearance: { ...appearance(42, 'pilgrim', 1), weapon: 'staff' },
    position: { x: -1, y: 5 },
  });
  const room = server.hub.rooms.get(client.room);
  const frames: any[] = [];
  [...server.hub.connections][0].socket.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'claim') frames.push(message);
  });
  const plant = room.world.propsAround(-2, 5, 0).find((p: any) => p.id === 'origin:cequin');
  assert.ok(plant);
  assert.equal(plant.kind, 'cequin');
  assert.equal((await client.claim(plant.id, 'gather', plant, 'sickle')).ok, true);
  assert.ok(room.removed.has(plant.id));
  const chest = room.world.propsAround(0, 0, 30).find((p: any) => p.kind === 'chest');
  assert.ok(chest);
  client.pose(
    { ...adjacent(room.world, chest), heading: 0, phase: 0 },
    appearance(42, 'pilgrim', 1),
    true,
  );
  assert.equal((await client.claim(chest.id, 'loot', chest)).ok, true);
  assert.ok(room.opened.has(chest.id));
  assert.deepEqual(
    frames.map((message) => message.kind),
    ['gather', 'loot'],
  );
  for (const message of frames)
    assert.deepEqual(
      Object.keys(message)
        .filter((key) => key !== 'toolKind')
        .sort(),
      ['kind', 'propId', 'requestId', 'type', 'x', 'y'],
    );
});

test('forged item appearance travels with the peer while invalid seeds cannot replace its body or weapon', async (t) => {
  const { server, url } = await serverFixture(t);
  const forged = resolveForge(42, { kind: 'staff', material: 1, core: 'warmth', span: 'long' })!;
  const owner = await join(url, { appearance: { ...look(), weaponSeed: forged.seed } });
  const observer = await join(url, { room: owner.welcome.room });
  const shown = observer.welcome.peers.find((p: any) => p.id === owner.welcome.peerId);
  assert.equal(shown.appearance.weaponSeed, forged.seed);
  assert.equal(shown.appearance.seed, look().seed);
  const member = server.hub.rooms.get(owner.welcome.room).members.get(owner.welcome.peerId);
  for (const weaponSeed of [-1, 0x100000000, 3.5, '42']) {
    owner.send({
      type: 'pose',
      x: 0,
      y: 5,
      heading: 0,
      phase: 0,
      appearance: { ...look(), weaponSeed },
    });
    assert.equal((await owner.next('error')).code, 'invalid_pose');
    assert.equal(member.appearance.weaponSeed, forged.seed);
    assert.equal(member.appearance.seed, look().seed);
  }
  owner.send({
    type: 'pose',
    x: 0,
    y: 5,
    heading: 0,
    phase: 0,
    appearance: { ...look(), weaponSeed: 0xffffffff },
  });
  assert.equal((await observer.next('pose')).peer.appearance.weaponSeed, 0xffffffff);
  owner.send({ type: 'pose', x: 0, y: 5, heading: 0, phase: 0, appearance: look() });
  assert.equal(
    (await observer.next('pose')).peer.appearance.weaponSeed,
    undefined,
    'unforged legacy appearance still works',
  );
  const invalid = await wire(url);
  invalid.send(identity({ appearance: { ...look(), weaponSeed: -1 } }));
  assert.equal((await invalid.next('error')).code, 'invalid_join');
  assert.equal(server.hub.rooms.size, 1, 'invalid equipment cannot create another room');
});

test('arbitrary canonical artifact designs reach other peers without accepting malformed design state', async (t) => {
  const { server, url } = await serverFixture(t);
  const artifact = generateArtifact('Céquin · Vespera/3886/body/73');
  const owner = await join(url, { appearance: { ...look(), artifactDesign: artifact.design } });
  const observer = await join(url, { room: owner.welcome.room });
  const shown = observer.welcome.peers.find((p: any) => p.id === owner.welcome.peerId);
  assert.equal(shown.appearance.artifactDesign, artifact.design);
  assert.deepEqual(generateArtifact(shown.appearance.artifactDesign).parts, artifact.parts);
  const member = server.hub.rooms.get(owner.welcome.room).members.get(owner.welcome.peerId);
  for (const artifactDesign of [
    '',
    'x'.repeat(65),
    'hidden\ncontrol',
    '  not canonical  ',
    123,
    null,
  ]) {
    owner.send({
      type: 'pose',
      x: 0,
      y: 5,
      heading: 0,
      phase: 0,
      appearance: { ...look(), artifactDesign },
    });
    assert.equal((await owner.next('error')).code, 'invalid_pose');
    assert.equal(member.appearance.artifactDesign, artifact.design);
    assert.equal(member.appearance.seed, look().seed);
  }
  const unicode = '🌱'.repeat(64);
  owner.send({
    type: 'pose',
    x: 0,
    y: 5,
    heading: 0,
    phase: 0,
    appearance: { ...look(), artifactDesign: unicode },
  });
  assert.equal((await observer.next('pose')).peer.appearance.artifactDesign, unicode);
  owner.send({ type: 'pose', x: 0, y: 5, heading: 0, phase: 0, appearance: look() });
  assert.equal((await observer.next('pose')).peer.appearance.artifactDesign, undefined);
  const invalid = await wire(url);
  invalid.send(identity({ appearance: { ...look(), artifactDesign: '\u0000' } }));
  assert.equal((await invalid.next('error')).code, 'invalid_join');
  assert.equal(server.hub.rooms.size, 1);
});

test('real room sockets share PvE HP/death and replay only unacknowledged contributor receipts after reconnect', async (t) => {
  let clock = 10000;
  const { server, url } = await serverFixture(t, { now: () => clock });
  const world = new InfiniteWorld(3886, 3),
    vault = world.vaultsAround(107, 107, 24)[0];
  assert.ok(vault);
  const npc = world
    .npcsAround(vault.x, vault.y, 24)
    .find((n) => n.id.startsWith(`${vault.id}:guard:`))!;
  assert.ok(npc);
  const position = adjacent(world, npc),
    heading = Math.atan2(npc.y - position.y, npc.x - position.x);
  const extras = { position, combatActive: true, bodyId: 'theo-test-body' };
  const alice = await join(url, extras);
  const bob = await join(url, {
    ...extras,
    bodyId: 'mira-test-body',
    room: alice.welcome.room,
    name: 'Mira',
  });
  assert.equal(validSharedCombatFrame(alice.welcome.combat), true);
  alice.send({ type: 'combat', requestId: 'r1', kind: 'attack', heading, damage: 1e9 });
  const first = await alice.next('combat_result');
  assert.equal(first.ok, true);
  assert.equal(first.frame.hits[0].damage, weaponProfile(42, 'staff', 1).damage);
  assert.equal(first.frame.hits[0].actorBodyId, 'theo-test-body');
  const mirrored = await bob.next('combat_frame', (m) =>
    m.frame.hits.some((h: any) => h.id === first.frame.hits[0].id),
  );
  assert.deepEqual(mirrored.frame, first.frame);
  assert.equal(validSharedCombatFrame(mirrored.frame), true);
  const partial = first.frame.snapshot.enemies.find((n: any) => n.id === npc.id).hp;
  const lateWounded = await join(url, { position, room: alice.welcome.room, name: 'Witness' });
  assert.equal(
    lateWounded.welcome.combat.snapshot.enemies.find((n: any) => n.id === npc.id).hp,
    partial,
  );
  assert.equal(lateWounded.welcome.combat.hits.length, 0);
  alice.socket.close();
  await once(alice.socket, 'close');
  let kill: any;
  for (let i = 1; i <= 5 && !kill; i++) {
    clock += 1000;
    bob.send({
      type: 'pose',
      ...position,
      heading,
      phase: 0,
      appearance: look(),
      combatActive: true,
      bodyId: 'mira-test-body',
    });
    bob.send({ type: 'combat', requestId: `r${i}`, kind: 'attack', heading });
    const result = await bob.next('combat_result');
    assert.equal(result.ok, true);
    kill = result.frame.deaths.find((d: any) => d.npcId === npc.id);
  }
  assert.ok(kill);
  assert.deepEqual(new Set(kill.contributors), new Set([alice.welcome.peerId, bob.welcome.peerId]));
  assert.equal(kill.killerBodyId, 'mira-test-body');
  const resumed = await join(url, {
    ...extras,
    room: alice.welcome.room,
    resumeToken: alice.welcome.resumeToken,
  });
  assert.equal(resumed.welcome.peerId, alice.welcome.peerId);
  assert.ok(resumed.welcome.combat.snapshot.dead.includes(npc.id));
  assert.equal(resumed.welcome.combat.deaths.filter((d: any) => d.npcId === npc.id).length, 1);
  assert.ok(resumed.welcome.combat.hits.some((h: any) => h.id === first.frame.hits[0].id));
  assert.ok(
    resumed.welcome.combat.hits.every((h: any) =>
      h.target === 'peer'
        ? h.targetId === resumed.welcome.peerId
        : h.actorId === resumed.welcome.peerId,
    ),
  );
  resumed.send({ type: 'combat', requestId: 'r1', kind: 'attack', heading });
  const replay = await resumed.next('combat_result');
  assert.equal(replay.ok, true);
  assert.equal(replay.frame.snapshot.dead.filter((id: string) => id === npc.id).length, 1);
  const ack = Math.max(
    0,
    ...replay.frame.hits.map((h: any) => h.id),
    ...replay.frame.deaths.map((d: any) => d.id),
  );
  resumed.send({ type: 'combat_ack', eventId: ack });
  await pause(15);
  const member = server.hub.rooms.get(alice.welcome.room).members.get(alice.welcome.peerId);
  assert.equal(member.combatHits.size, 0);
  assert.equal(member.combatDeaths.size, 0);
  resumed.socket.close();
  await once(resumed.socket, 'close');
  const clean = await join(url, {
    ...extras,
    room: alice.welcome.room,
    resumeToken: alice.welcome.resumeToken,
  });
  assert.equal(clean.welcome.combat.hits.length, 0);
  assert.equal(clean.welcome.combat.deaths.length, 0);
  const late = await join(url, { position, room: alice.welcome.room, name: 'Later' });
  assert.ok(late.welcome.combat.snapshot.dead.includes(npc.id));
  assert.equal(late.welcome.combat.deaths.length, 0);
});

test('room combat rejects invalid progression, inactivity, cooldown and reused intent IDs while accepting exact bounded upgrades', async (t) => {
  let clock = 10000;
  const { url } = await serverFixture(t, { now: () => clock });
  const p = await join(url);
  p.send({ type: 'combat', requestId: 'r1', kind: 'attack', heading: 0 });
  assert.equal((await p.next('combat_result')).ok, false);
  p.send({
    type: 'pose',
    x: 0,
    y: 5,
    heading: 0,
    phase: 0,
    appearance: look(),
    combatActive: true,
    progression: { level: 51, combatXp: 0, upgrade: 0 },
  });
  assert.equal((await p.next('error')).code, 'invalid_pose');
  p.send({
    type: 'pose',
    x: 0,
    y: 5,
    heading: 0,
    phase: 0,
    appearance: look(),
    combatActive: true,
    progression: { level: 8, combatXp: 500, upgrade: 2 },
  });
  p.send({ type: 'combat', requestId: 'r2', kind: 'attack', heading: 0 });
  assert.equal((await p.next('combat_result')).ok, true);
  p.send({ type: 'combat', requestId: 'r3', kind: 'attack', heading: 0 });
  assert.equal((await p.next('combat_result')).ok, false);
  p.send({ type: 'combat', requestId: 'r2', kind: 'ward', heading: 0 });
  assert.match((await p.next('combat_result')).reason, /different request/);
  clock += 1000;
  p.send({ type: 'combat', requestId: 'r4', kind: 'attack', heading: 1e9 });
  assert.equal((await p.next('combat_result')).ok, false);
  p.send({ type: 'combat_ack', eventId: Number.MAX_SAFE_INTEGER });
  assert.equal((await p.next('error')).code, 'invalid_combat_ack');
  p.send({
    type: 'combat',
    requestId: 'r5',
    kind: 'parley',
    guardIds: ['vault:0:0:guard:0', 'vault:0:0:guard:1'],
  });
  assert.equal((await p.next('combat_result')).ok, false);
});

test('combat replay remains rejected after bounded response eviction and a dialogue truce reaches late joiners', async (t) => {
  let clock = 10000;
  const { server, url } = await serverFixture(t, { now: () => clock, messageBurst: 1000 });
  const world = new InfiniteWorld(3886, 3),
    vault = world.vaultsAround(107, 107, 24)[0];
  const notice = world
    .propsAround(vault.entrance.x + 1, 212, 3)
    .find((p) => p.id === `${vault.id}:notice`)!;
  assert.ok(notice);
  const p = await join(url, { position: notice, combatActive: false });
  const guardIds = world
    .npcsAround(vault.x, vault.y, 24)
    .filter((n) => n.id.startsWith(`${vault.id}:guard:`))
    .map((n) => n.id);
  p.send({ type: 'combat', requestId: 'r1', kind: 'parley', guardIds });
  const truce = await p.next('combat_result');
  assert.equal(truce.ok, true);
  assert.equal(validSharedCombatFrame(truce.frame), true);
  assert.deepEqual(truce.frame.snapshot.peaceful, guardIds.sort());
  for (let i = 2; i < 135; i++)
    p.send({ type: 'combat', requestId: `r${i}`, kind: 'attack', heading: Infinity });
  await p.next('combat_result', (m) => m.requestId === 'r134');
  clock += 1000;
  p.send({ type: 'combat', requestId: 'r1', kind: 'parley', guardIds });
  const stale = await p.next('combat_result', (m) => m.requestId === 'r1');
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /already processed/);
  const room = server.hub.rooms.get(p.welcome.room),
    member = room.members.get(p.welcome.peerId);
  assert.ok(member.requests.size <= 128);
  assert.ok(
    [...member.requests.values()].every((entry: any) => !entry.result.frame),
    'retry cache holds outcomes instead of repeated full snapshots',
  );
  const q = await join(url, { room: p.welcome.room });
  assert.deepEqual(q.welcome.combat.snapshot.peaceful, guardIds.sort());
  assert.equal(q.welcome.combat.deaths.length, 0);
});
