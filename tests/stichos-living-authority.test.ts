import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { appearance, InfiniteWorld } from '../src/stichos/world.ts';
import { MULTIPLAYER_PROTOCOL } from '../src/stichos/multiplayer-protocol.ts';
import { validRoomWorldCheckpoint } from '../src/stichos/room-checkpoint.ts';
import { LivingWorld, validFaunaFrame } from '../src/stichos/living-world.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';
import { validSharedCombatFrame } from '../src/stichos/shared-combat.ts';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages: any[] = [];
  send(data: string) {
    this.messages.push(JSON.parse(data));
  }
  close() {
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
function traveler(hub: CoopRooms, extra: Record<string, unknown> = {}) {
  const socket = new Socket(),
    connection = hub.attach(socket);
  hub.handle(connection, {
    type: 'join',
    protocol: MULTIPLAYER_PROTOCOL,
    seed: 1,
    generation: 4,
    name: 'Ari',
    appearance: look,
    position: { x: 0, y: 5 },
    ...extra,
  });
  return {
    socket,
    connection,
    welcome: socket.get('welcome'),
    send: (message: unknown) => hub.handle(connection, message),
  };
}

test('calendar survives empty rooms and restore, while older clients negotiate no wildlife', () => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const old = traveler(hub);
  assert.ok(old.welcome);
  assert.equal(old.welcome.living, undefined);
  const modern = traveler(hub, { room: old.welcome.room, livingWorld: 1 });
  assert.equal(modern.welcome.living.elapsedSeconds, 0);
  assert.equal(validFaunaFrame(modern.welcome.living), true);
  now += 1500;
  hub.tick(0.05);
  assert.equal(modern.socket.get('living_frame').frame.elapsedSeconds, 1.5);
  assert.equal(old.socket.get('living_frame'), undefined);
  const exported = hub.exportRoom(old.welcome.room)!;
  assert.equal(exported.privateState.calendarEpochMs, 10000);
  assert.equal(
    'calendarEpochMs' in exported.state,
    false,
    'legacy signed public checkpoint schema stays unchanged',
  );
  assert.equal(validRoomWorldCheckpoint(exported.state), true);
  old.socket.close();
  modern.socket.close();
  now += 30000;
  const next = new CoopRooms({ now: () => now, durable: true });
  next.restoreRoom(exported.state, exported.privateState);
  const resumed = traveler(next, {
    room: modern.welcome.room,
    resumeToken: modern.welcome.resumeToken,
    livingWorld: 1,
  });
  assert.equal(resumed.welcome.living.elapsedSeconds, 31.5);
  assert.equal(resumed.welcome.peerId, modern.welcome.peerId);
  resumed.socket.close();
});

test('all 64 occupied rooms receive living updates under the global two-room tick budget', () => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, maxRooms: 64 });
  const players = Array.from({ length: 64 }, () => traveler(hub, { livingWorld: 1 }));
  try {
    for (let i = 0; i < 80; i++) {
      now += 50;
      hub.tick(0.05);
    }
    const counts = players.map(
      (p) => p.socket.messages.filter((m) => m.type === 'living_frame').length,
    );
    assert.ok(
      counts.every((count) => count >= 2),
      `fair updates: ${counts.join(',')}`,
    );
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  } finally {
    for (const p of players) p.socket.close();
  }
});
test('old checkpoints receive a stable calendar migration and invalid epochs are rejected', () => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const p = traveler(hub);
  const old = hub.exportRoom(p.welcome.room)!;
  delete old.privateState.calendarEpochMs;
  p.socket.close();
  now += 1000;
  const next = new CoopRooms({ now: () => now, durable: true });
  next.restoreRoom(old.state, old.privateState);
  assert.equal(next.exportRoom(p.welcome.room)!.privateState.calendarEpochMs, 11000);
  assert.equal(validRoomWorldCheckpoint({ ...old.state, calendarEpochMs: Infinity }), false);
  assert.throws(
    () =>
      new CoopRooms().restoreRoom(old.state, { ...old.privateState, calendarEpochMs: Infinity }),
    /private room/,
  );
  const bad = traveler(new CoopRooms(), { livingWorld: 2 });
  assert.equal(bad.socket.get('error').code, 'invalid_join');
  bad.socket.close();
});

test('wildlife damage uses authenticated active peers and the existing receipt ledger, once per lunge', () => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const world = new InfiniteWorld(1, 4),
    sample = new LivingWorld().sample(world, worldTimeAt(840), [{ id: 'p', x: 80, y: 0 }]);
  const wolf = sample.actors.find((a) => a.kind === 'wolf')!;
  assert.ok(wolf);
  const point = [
    { x: wolf.home.x + 1, y: wolf.home.y },
    { x: wolf.home.x - 1, y: wolf.home.y },
    wolf.home,
  ].find((p) => !world.blocked(p.x, p.y))!;
  const a = traveler(hub, { position: point, livingWorld: 1, combatActive: true });
  assert.ok(a.welcome);
  const old = traveler(hub, { room: a.welcome.room, position: point, combatActive: true });
  now += 840000;
  for (let i = 0; i < 10; i++) {
    a.send({ type: 'pose', ...point, heading: 0, phase: 0, appearance: look, combatActive: true });
    old.send({
      type: 'pose',
      ...point,
      heading: 0,
      phase: 0,
      appearance: look,
      combatActive: true,
    });
    hub.tick(0.05);
    now += 500;
  }
  const hits = a.socket.messages
    .filter((m) => m.type === 'combat_frame')
    .flatMap((m) => m.frame.hits)
    .filter((h) => h.actorId === wolf.id && h.targetId === a.welcome.peerId);
  assert.ok(hits.length > 0, 'new clients receive real authoritative wildlife damage');
  assert.equal(new Set(hits.map((h) => h.id)).size, hits.length);
  assert.ok(hits.every((h) => h.damage <= 5));
  assert.equal(
    a.socket.messages
      .filter((m) => m.type === 'combat_frame')
      .flatMap((m) => m.frame.hits)
      .filter((h) => h.actorId.startsWith('fauna:') && h.targetId === old.welcome.peerId).length,
    0,
  );
  const saved = hub.exportRoom(a.welcome.room)!;
  assert.equal(validRoomWorldCheckpoint(saved.state), true);
  assert.equal('actors' in saved.state, false);
  assert.equal('living' in saved.state, false);
  const pending = (saved.privateState as any).members.find(
    (m: any) => m.id === a.welcome.peerId,
  ).combatHits;
  assert.ok(pending.some((h: any) => h.actorId === wolf.id));
  assert.equal(
    validSharedCombatFrame({ snapshot: saved.state.combat.snapshot, hits: pending, deaths: [] }),
    true,
  );
  const newest = hits.at(-1).id;
  a.send({ type: 'combat_ack', eventId: newest });
  const acknowledged = hub.exportRoom(a.welcome.room)!;
  assert.equal(
    (acknowledged.privateState as any).members
      .find((m: any) => m.id === a.welcome.peerId)
      .combatHits.some((h: any) => h.id <= newest),
    false,
  );
  a.send({
    type: 'environmentalContacts',
    actorId: wolf.id,
    damage: 999,
    targetId: old.welcome.peerId,
  });
  assert.equal(a.socket.get('error').code, 'unknown_message');
  a.socket.close();
  old.socket.close();
  const restored = new CoopRooms({ now: () => now, durable: true });
  restored.restoreRoom(acknowledged.state, acknowledged.privateState);
  assert.deepEqual(
    (restored.exportRoom(a.welcome.room)!.privateState as any).faunaStrikes,
    (acknowledged.privateState as any).faunaStrikes,
  );
});

test('a disconnected member receives no new world frames', () => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const p = traveler(hub, { livingWorld: 1 });
  now += 500;
  hub.tick(0.05);
  const before = p.socket.messages.length;
  p.socket.close();
  now += 500;
  hub.tick(0.05);
  assert.equal(p.socket.messages.length, before);
});
