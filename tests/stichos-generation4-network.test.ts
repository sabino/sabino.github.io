import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createCoopServer } from '../server/coop.mjs';
import { InfiniteWorld, appearance } from '../src/stichos/world.ts';
import { MULTIPLAYER_PROTOCOL } from '../src/stichos/multiplayer-protocol.ts';
import { discoverRoom } from '../src/stichos/multiplayer.ts';
import {
  SharedCombat,
  validSharedCombatFrame,
  validSharedCombatCheckpoint,
} from '../src/stichos/shared-combat.ts';
import { verifyRoomCheckpoint, verifyRoomHello } from '../src/stichos/room-checkpoint.ts';
import { technologyWeaponSeed, weaponProfile, MAX_WEAPON_SEED } from '../src/stichos/equipment.ts';
import type { Appearance } from '../src/stichos/types.ts';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function wire(url: string) {
  const socket = new WebSocket(url),
    queue: any[] = [];
  socket.on('message', (data) => queue.push(JSON.parse(data.toString())));
  await once(socket, 'open');
  return {
    socket,
    send: (value: unknown) => socket.send(JSON.stringify(value)),
    async next(type: string, predicate = (_value: any) => true) {
      const deadline = Date.now() + 3500;
      while (Date.now() < deadline) {
        const index = queue.findIndex((m) => m.type === type && predicate(m));
        if (index >= 0) return queue.splice(index, 1)[0];
        await wait(5);
      }
      throw Error(
        `Missing ${type}; received ${queue.map((m) => `${m.type}:${m.code ?? ''}`).join(', ')}`,
      );
    },
  };
}
const encoded = (source: number, weapon: Appearance['weapon'] = 'sword'): Appearance => ({
  ...appearance(42, 'guard', 1),
  technology: 3,
  weapon,
  weaponSeed: technologyWeaponSeed(source, 3),
});

test('real generation-four sockets preserve high technology gear, exact combat, signed disk state and authenticated resume', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verso-g4-network-'));
  let clock = 10000,
    server = createCoopServer({ persistenceDirectory: directory, now: () => clock });
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  let address: any = await server.listen(0, '127.0.0.1'),
    url = `ws://127.0.0.1:${address.port}/ws`;
  const world = new InfiniteWorld(8, 4);
  const enemy = world.npcsAround(96, -32, 16).find((n) => n.hostile && n.role === 'raider')!;
  assert(
    enemy.appearance.weaponSeed! > 0xffffffff,
    'The world itself generates electronic hostile equipment.',
  );
  const position = [
    [0.65, 0],
    [-0.65, 0],
    [0, 0.65],
    [0, -0.65],
  ]
    .map(([x, y]) => ({ x: enemy.x + x, y: enemy.y + y }))
    .find((p) =>
      [
        [-0.22, -0.22],
        [0.22, -0.22],
        [-0.22, 0.22],
        [0.22, 0.22],
      ].every(([dx, dy]) => !world.blocked(p.x + dx, p.y + dy)),
    )!;
  assert(position);
  const heading = Math.atan2(enemy.y - position.y, enemy.x - position.x),
    look = encoded(0xfffffff0);
  const clientId = '12345678-1234-4123-8123-123456789abc';
  const identity = (extra: Record<string, unknown> = {}) => ({
    type: 'join',
    protocol: MULTIPLAYER_PROTOCOL,
    seed: 8,
    generation: 4,
    name: 'Electronic resident',
    clientId,
    bodyId: 'g4-original-body',
    position,
    appearance: look,
    combatActive: false,
    progression: { level: 1, combatXp: 0, upgrade: 0 },
    ...extra,
  });
  const a = await wire(url);
  sockets.push(a.socket);
  const challenge = 'a'.repeat(64);
  a.send(identity({ challenge }));
  const welcome = await a.next('welcome');
  assert.equal(welcome.generation, 4);
  assert(await verifyRoomHello(welcome.proof, challenge, welcome.room, ''));
  const b = await wire(url);
  sockets.push(b.socket);
  b.send(
    identity({
      room: welcome.room,
      clientId: '87654321-4321-4321-8321-abcdef123456',
      name: 'Observer',
      appearance: encoded(0xffffffff, 'bow'),
    }),
  );
  const observed = await b.next('welcome');
  assert.equal(
    observed.peers.find((p: any) => p.id === welcome.peerId).appearance.weaponSeed,
    look.weaponSeed,
  );
  assert.equal(
    observed.peers.find((p: any) => p.name === 'Observer').appearance.weaponSeed,
    MAX_WEAPON_SEED,
  );
  const replacement = encoded(0xfffffffe);
  a.send({
    type: 'pose',
    ...position,
    heading,
    phase: 7,
    appearance: replacement,
    combatActive: true,
    bodyId: 'g4-original-body',
  });
  const pose = await b.next('pose', (m) => m.peer.id === welcome.peerId);
  assert.equal(pose.peer.appearance.weaponSeed, replacement.weaponSeed);
  assert.equal(pose.peer.appearance.technology, 3);
  assert.equal(
    pose.peer.appearance.seed,
    look.seed,
    'Weapon changes cannot alter the anatomy seed.',
  );
  a.send({ type: 'combat', requestId: 'g4-first-hit', kind: 'attack', heading, damage: 999999 });
  const hit = await a.next('combat_result');
  assert.equal(hit.ok, true);
  const injury = hit.frame.hits.find((h: any) => h.targetId === enemy.id);
  assert(injury, 'The real generated hostile was hit.');
  assert.equal(injury.damage, weaponProfile(replacement.weaponSeed!, 'sword', 1).damage);
  assert(validSharedCombatFrame(hit.frame));
  const mirrored = await b.next('combat_frame', (m) =>
    m.frame.hits.some((h: any) => h.id === injury.id),
  );
  assert.deepEqual(mirrored.frame, hit.frame);
  const remainingHp = hit.frame.snapshot.enemies.find((n: any) => n.id === enemy.id).hp;
  assert(remainingHp > 0 && remainingHp < enemy.hp);
  await server.checkpoint();
  const persisted = JSON.parse(await readFile(join(directory, `${welcome.room}.json`), 'utf8'));
  assert(await verifyRoomCheckpoint(persisted.checkpoint));
  assert.equal(persisted.checkpoint.state.generation, 4);
  assert.equal(
    persisted.checkpoint.state.combat.records.find((n: any) => n.id === enemy.id).appearance
      .weaponSeed,
    enemy.appearance.weaponSeed,
  );
  assert.equal(
    persisted.owner.privateState.members.find((m: any) => m.id === welcome.peerId).appearance
      .weaponSeed,
    replacement.weaponSeed,
  );
  assert(!JSON.stringify(persisted.checkpoint).includes(welcome.resumeToken));
  assert(validSharedCombatCheckpoint(persisted.checkpoint.state.combat));
  for (const socket of sockets) socket.close();
  await Promise.all(
    sockets.map((s) => (s.readyState === WebSocket.CLOSED ? undefined : once(s, 'close'))),
  );
  await server.close();
  clock += 1000;
  server = createCoopServer({ persistenceDirectory: directory, now: () => clock });
  address = await server.listen(0, '127.0.0.1');
  url = `ws://127.0.0.1:${address.port}/ws`;
  const discovery = await discoverRoom(url, welcome.room);
  assert.equal(discovery.generation, 4);
  assert.equal(discovery.seed, 8);
  const resumed = await wire(url);
  sockets.push(resumed.socket);
  const nextChallenge = 'b'.repeat(64);
  resumed.send(
    identity({
      room: welcome.room,
      resumeToken: welcome.resumeToken,
      appearance: replacement,
      challenge: nextChallenge,
    }),
  );
  const next = await resumed.next('welcome');
  assert.equal(next.peerId, welcome.peerId);
  assert.equal(
    next.peers.find((p: any) => p.id === welcome.peerId).appearance.weaponSeed,
    replacement.weaponSeed,
  );
  resumed.send({
    type: 'pose',
    ...position,
    heading,
    phase: 0,
    appearance: replacement,
    combatActive: true,
    bodyId: 'g4-original-body',
  });
  const activeAgain = await resumed.next('combat_frame', (m) =>
    m.frame.snapshot.enemies.some((n: any) => n.id === enemy.id),
  );
  assert.equal(
    activeAgain.frame.snapshot.enemies.find((n: any) => n.id === enemy.id).hp,
    remainingHp,
  );
  assert(
    next.combat.hits.some((h: any) => h.id === injury.id),
    'Unacknowledged actual injury receipt survives the restart.',
  );
  assert(
    await verifyRoomHello(
      next.proof,
      nextChallenge,
      welcome.room,
      '',
      persisted.checkpoint.authority,
    ),
  );
  const incompatible = await wire(url);
  sockets.push(incompatible.socket);
  incompatible.send(identity({ room: welcome.room, generation: 3 }));
  assert.equal((await incompatible.next('error')).code, 'world_mismatch');
});

test('same low32 bits never alias technology in authority profile caches or projectile checkpoints', () => {
  const world = {
    generation: 4 as const,
    blocked: () => false,
    propsAround: () => [],
    npcsAround: () => [],
  };
  const combat = new SharedCombat(world, new Set());
  for (const tier of [0, 1, 2, 3] as const) {
    const weaponSeed = technologyWeaponSeed(0xffffffff, tier),
      look = { ...encoded(7, 'bow'), weaponSeed };
    const peer = {
      id: `tier-${tier}`,
      x: 0,
      y: 0,
      heading: 0,
      combatActive: true,
      appearance: look,
    };
    const shot = combat.attack(peer, 0);
    assert(shot.ok);
    const projectile = shot.snapshot.projectiles.find((p) => p.actorId === peer.id)!;
    const expected = weaponProfile(weaponSeed, 'bow', 1);
    assert.equal(projectile.damage, expected.damage);
    assert.equal(projectile.remaining, expected.range);
    assert.equal(projectile.color, expected.color);
  }
  const saved = combat.checkpoint();
  assert(validSharedCombatCheckpoint(saved));
  const restored = new SharedCombat(world, new Set());
  restored.restore(saved);
  assert.deepEqual(restored.snapshot().projectiles, saved.snapshot.projectiles);
  assert.equal(
    restored.attack(
      {
        id: 'unarmed',
        x: 0,
        y: 0,
        heading: 0,
        combatActive: true,
        appearance: { ...encoded(7), weapon: 'none' },
      },
      0,
    ).ok,
    false,
  );
});

test('unarmed civilization clothing crosses real sockets while invalid technology values cannot change identity', async (t) => {
  const server = createCoopServer(),
    address: any = await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  const url = `ws://127.0.0.1:${address.port}/ws`,
    world = new InfiniteWorld(8, 4);
  const resident = world.npcsAround(0, 0, 20).find((n) => n.appearance.weapon === 'none')!;
  assert(resident);
  assert.equal(resident.appearance.technology, 3);
  assert.equal(resident.appearance.weaponSeed, undefined);
  const identity = {
    type: 'join',
    protocol: MULTIPLAYER_PROTOCOL,
    seed: 8,
    generation: 4,
    name: resident.name,
    appearance: resident.appearance,
    position: { x: 0, y: 5 },
  };
  const a = await wire(url);
  a.send(identity);
  const welcome = await a.next('welcome');
  const b = await wire(url);
  b.send({ ...identity, room: welcome.room, name: 'Clothing witness' });
  const observed = await b.next('welcome');
  assert.equal(observed.peers.find((p: any) => p.id === welcome.peerId).appearance.technology, 3);
  const member = server.hub.rooms.get(welcome.room).members.get(welcome.peerId);
  for (const technology of [-1, 4, 1.5, '3', null]) {
    a.send({
      type: 'pose',
      x: 0,
      y: 5,
      heading: 0,
      phase: 0,
      appearance: { ...resident.appearance, technology },
    });
    assert.equal((await a.next('error')).code, 'invalid_pose');
    assert.equal(member.appearance.technology, 3);
    assert.equal(member.appearance.weapon, 'none');
  }
  a.send({
    type: 'pose',
    x: 0,
    y: 5,
    heading: 0,
    phase: 0,
    appearance: resident.appearance,
    combatActive: true,
  });
  a.send({ type: 'combat', requestId: 'barehanded', kind: 'attack', heading: 0 });
  assert.equal((await a.next('combat_result')).ok, false);
  a.send({ type: 'combat', requestId: 'defensive', kind: 'ward', heading: 0 });
  assert.equal((await a.next('combat_result')).ok, true);
  a.socket.close();
  b.socket.close();
});
