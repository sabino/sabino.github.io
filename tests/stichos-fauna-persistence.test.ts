import test from 'node:test';
import assert from 'node:assert/strict';
import { LivingWorld, validFaunaLedger, type FaunaWorld } from '../src/stichos/living-world.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';

const world: FaunaWorld = {
  seed: 1,
  blocked: () => false,
  tile: (x, y) => ({
    x,
    y,
    seed: 1,
    terrain: 'grass',
    biome: 'woodland',
    height: 0,
    temperature: 18,
    detail: 0,
  }),
};

test('persistent predators follow across birth territories without teleporting or losing identity', () => {
  const living = new LivingWorld({ persistent: true });
  const initial = living.sample(world, worldTimeAt(840), [{ id: 'p', x: 0, y: 0 }]);
  let wolf = initial.actors.find((a) => a.kind === 'wolf')!;
  assert.ok(wolf);
  const original = { ...wolf },
    id = wolf.id;
  for (let i = 1; i <= 40; i++) {
    const next = living
      .sample(world, worldTimeAt(840 + i * 0.5), [{ id: 'p', x: wolf.x + 3, y: wolf.y }])
      .actors.find((a) => a.id === id)!;
    assert.ok(next, 'a chased predator is queried at its current position');
    assert.ok(Math.hypot(next.x - wolf.x, next.y - wolf.y) <= 2.21, 'bounded actual movement');
    wolf = next;
  }
  assert.ok(wolf.x - original.home.x > 25, 'no 9-tile home leash');
  const snapshot = living.save()!;
  assert.equal(validFaunaLedger(snapshot), true);
  assert.ok(
    snapshot.actors.every((record) => record.body.call === null),
    'no audio event checkpoint',
  );
  const restored = new LivingWorld({ persistent: true, save: snapshot });
  const returned = restored
    .sample(world, worldTimeAt(860), [{ id: 'p', x: wolf.x + 3, y: wolf.y }])
    .actors.find((a) => a.id === id)!;
  assert.ok(returned);
  assert.equal(returned.x, wolf.x);
  assert.equal(returned.y, wolf.y);
  assert.deepEqual(returned.home, original.home);
});

test('animal death stays tombstoned through eviction, rediscovery, save and restore', () => {
  const living = new LivingWorld({ persistent: true, maxNewCells: 2 });
  let frame = living.sample(world, worldTimeAt(840), [{ id: 'p', x: 0, y: 0 }]);
  for (let i = 1; i < 12; i++)
    frame = living.sample(world, worldTimeAt(840 + i * 0.5), [{ id: 'p', x: 0, y: 0 }]);
  const animal = frame.actors[0];
  assert.ok(animal);
  assert.equal(living.defeat(animal.id), true);
  assert.equal(living.defeat(animal.id), false);
  for (let i = 0; i < 150; i++)
    living.sample(world, worldTimeAt(850 + i), [{ id: 'p', x: 1000 + i * 100, y: 1000 }]);
  const saved = living.save()!;
  const restored = new LivingWorld({ persistent: true, save: saved });
  const returned = restored.sample(world, worldTimeAt(1001), [
    { id: 'p', x: animal.home.x, y: animal.home.y },
  ]);
  assert.equal(
    returned.actors.some((a) => a.id === animal.id),
    false,
  );
  assert.equal(saved.actors.find((a) => a.id === animal.id)?.state, 'dead');
});

test('fauna can enter open built floors but actual walls remain collision barriers', () => {
  const living = new LivingWorld({ persistent: true });
  const first = living.sample(world, worldTimeAt(840), [{ id: 'p', x: 0, y: 0 }]);
  let wolf = first.actors.find((a) => a.kind === 'wolf')!;
  const startX = wolf.x,
    startY = wolf.y;
  const floorWorld: FaunaWorld = {
    ...world,
    tile: (x, y) =>
      x > startX + 1
        ? { ...world.tile(x, y), terrain: 'floor', building: 'workshop', buildingKind: 'workshop' }
        : world.tile(x, y),
    blocked: (x) => x >= startX + 6,
  };
  for (let i = 1; i <= 16; i++) {
    wolf = living
      .sample(floorWorld, worldTimeAt(840 + i * 0.5), [{ id: 'p', x: startX + 8, y: startY }])
      .actors.find((a) => a.id === wolf.id)!;
  }
  assert.ok(wolf.x > startX + 1, 'open floor does not delete or repel wildlife');
  assert.ok(wolf.x < startX + 6.5, 'tile collision stops the actual wall');
});

test('legacy sampler does not begin persistence or authority deaths without capability', () => {
  const living = new LivingWorld();
  living.sample(world, worldTimeAt(840), [{ id: 'p', x: 0, y: 0 }]);
  assert.equal(living.save(), undefined);
  assert.equal(living.defeat('fauna:1:0:0:0'), false);
});

test('warm multi-observer refreshes remain bounded and detached from checkpoints', () => {
  const living = new LivingWorld({ persistent: true, maxNewCells: 2 });
  const observers = Array.from({ length: 8 }, (_, i) => ({
    id: `observer:${i}`,
    x: (i % 4) * 12,
    y: Math.floor(i / 4) * 12,
  }));
  for (let i = 0; i < 60; i++) living.sample(world, worldTimeAt(840 + i * 0.5), observers);
  const admitted = living.persistentActors;
  for (let i = 60; i < 120; i++) {
    const frame = living.sample(world, worldTimeAt(840 + i * 0.5), observers);
    assert.ok(frame.actors.length <= 36);
    assert.equal(new Set(frame.actors.map((a) => a.id)).size, frame.actors.length);
  }
  assert.equal(
    living.persistentActors,
    admitted,
    'warm observer footprints cannot keep admitting identities',
  );
  const frame = living.sample(world, worldTimeAt(900), observers);
  const saved = living.save();
  if (frame.actors[0]) {
    frame.actors[0].x = -99999;
    frame.actors[0].home.x = -99999;
  }
  assert.deepEqual(
    living.save(),
    saved,
    'published frame mutation cannot change persistent bodies or homes',
  );
});
