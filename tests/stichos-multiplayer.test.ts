import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createCoopServer } from '../server/coop.mjs';
import { InfiniteWorld, appearance } from '../src/stichos/world.ts';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const look = () => ({ ...appearance(42, 'pilgrim', 1), weapon: 'staff' });
const identity = (extra = {}) => ({
  type: 'join',
  protocol: 1,
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
  const request = { type: 'claim', propId: 'origin:cequin', kind: 'gather', x: -2, y: 5 };
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
  assert.equal((await attempt('staff-tool', { propId: pine.id, x: pine.x, y: pine.y })).ok, true);
  assert.ok(
    !room.world.blocked(pine.x, pine.y, room.removed),
    'successful timber gathering opens the real shared collision cell',
  );
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
    world.blocked(door.x, door.y),
    'Closing preserves the generated doorway collision rule.',
  );
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
  assert.equal((await (await fetch(`${http}/health`)).json()).protocol, 1);
  assert.equal((await fetch(`${http}/missing`)).status, 404);
});
