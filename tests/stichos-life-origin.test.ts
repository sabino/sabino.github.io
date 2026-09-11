import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLifeCandidate, normalizeLifeCustomization } from '../src/stichos/life-origin.ts';
import { Stichos } from '../src/stichos/session.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';

test('rerolled lives deterministically inhabit varied real humanoids, homes and clear activity positions', () => {
  const roles = new Set<string>(),
    ids = new Set<string>(),
    appearances = new Set<number>();
  for (const generation of [1, 2, 3] as const)
    for (const seed of [0, 3886, 0xffffffff])
      for (let index = 0; index < 5; index++) {
        const c = generateLifeCandidate(seed, index, {}, generation),
          world = new InfiniteWorld(seed, generation);
        assert.deepEqual(generateLifeCandidate(seed, index, {}, generation), c);
        assert.ok(
          world.npcsAround(c.start.x, c.start.y, 1).some((n) => n.id === c.id && !n.hostile),
        );
        assert.ok(
          world
            .propsAround(c.home.x, c.home.y, 0.1)
            .some((p) => p.kind === 'door' && p.building === c.home.buildingId),
        );
        assert.ok(
          c.home.buildingId.includes(':house:') ||
            world.tile(c.home.x, c.home.y).buildingKind === 'inn',
        );
        for (const [dx, dy] of [
          [-0.21, -0.21],
          [0.21, -0.21],
          [-0.21, 0.21],
          [0.21, 0.21],
        ])
          assert.equal(world.blocked(c.start.x + dx, c.start.y + dy), false);
        assert.ok(c.age >= 20 && c.age <= 68);
        assert.ok(Object.values(c.inventory).reduce((a, b) => a + b, 0) < 60);
        assert.ok(c.stats.speed >= 2.9 && c.stats.speed <= 3.2);
        assert.ok(c.tools.length > 0);
        roles.add(c.profession);
        ids.add(c.id);
        appearances.add(c.appearance.seed);
      }
  assert.ok(roles.size >= 6);
  assert.ok(ids.size >= 15);
  assert.equal(
    appearances.size,
    15,
    'Appearance identity is stable across world-generation migrations.',
  );
});

test('bounded appearance and name editing never changes professional resources or stats', () => {
  const original = generateLifeCandidate(3886, 0),
    custom = generateLifeCandidate(3886, 0, {
      name: '  Ivo Lumen  ',
      coat: '#Aa22CC',
      hairStyle: 4,
      hat: 0,
      height: 1.1,
      build: 0.85,
      cloak: false,
    });
  assert.equal(custom.name, 'Ivo Lumen');
  assert.equal(custom.appearance.coat, '#aa22cc');
  assert.equal(custom.appearance.cloak, false);
  assert.deepEqual(custom.stats, original.stats);
  assert.deepEqual(custom.inventory, original.inventory);
  assert.deepEqual(custom.professionXp, original.professionXp);
  for (const bad of [
    { name: '' },
    { name: 'x'.repeat(61) },
    { skin: 'red' },
    { height: 100 },
    { hat: 9 },
    { coins: 999 },
    null,
  ])
    assert.throws(() => normalizeLifeCustomization(bad));
  assert.throws(() => generateLifeCandidate(3886, -1));
  assert.throws(() => generateLifeCandidate(3886, Infinity));
});

test('accepting a life supplies its actual profession, home and arrival once while legacy Theo stays compatible', () => {
  const legacy = new Stichos(3886),
    savedLegacy = legacy.save();
  assert.equal(legacy.identityName, 'Theo Bishop');
  assert.equal(legacy.lifeOrigin, null);
  assert.ok(legacy.hasNotebook);
  let g = new Stichos(3886);
  const c = g.lifeCandidate(0, { name: 'Ivo Lumen' });
  assert.ok(g.acceptLife(0, { name: 'Ivo Lumen' }).ok);
  assert.equal(g.identityName, c.name);
  assert.equal(g.player.bodyName, c.name);
  assert.equal(g.bodyId, c.id);
  assert.equal(g.player.speed, c.stats.speed);
  assert.equal(g.hasNotebook, false);
  assert.deepEqual(g.inventory, c.inventory);
  assert.equal(g.player.coins, c.coins);
  assert.deepEqual(g.progression.xp, c.professionXp);
  assert.equal(g.estate.residence?.buildingId, c.home.buildingId);
  assert.deepEqual(g.estate.staffIds, []);
  assert.ok(g.effects.some((e) => e.kind === 'mind' && e.actorId === c.id && e.duration >= 2));
  assert.equal(
    g.npcs.some((n) => n.id === c.id),
    false,
  );
  const coins = g.player.coins;
  assert.equal(g.acceptLife(1).ok, false);
  assert.equal(g.player.coins, coins);
  g = Stichos.restore(g.save());
  assert.equal(g.identityName, c.name);
  assert.equal(g.lifeOrigin?.age, c.age);
  assert.equal(g.originName, c.settlement.name);
  assert.deepEqual(g.inventory, c.inventory);
  assert.deepEqual(Stichos.restore(savedLegacy).save(), savedLegacy);
});

test('retiring preserves planetary changes and exact abandoned belongings instead of refilling visited bodies', () => {
  let g = new Stichos(3886);
  assert.ok(g.acceptLife(0).ok);
  const first = g.lifeOrigin!;
  g.player.coins = 17;
  g.inventory.wood = 7;
  g.removed.add('origin:cequin');
  let index = 1;
  while (g.lifeCandidate(index).id === first.id) index++;
  const next = g.lifeCandidate(index);
  assert.ok(g.retireLife(index).ok);
  assert.equal(g.bodyId, next.id);
  assert.ok(g.removed.has('origin:cequin'));
  const old = g.npcs.find((n) => n.id === first.id) ?? g.save().npcs.find((n) => n.id === first.id);
  assert.ok(old && old.name === first.name);
  assert.ok(g.retireLife(0).ok);
  assert.equal(g.bodyId, first.id);
  assert.equal(g.player.coins, 17);
  assert.equal(g.inventory.wood, 7);
  g = Stichos.restore(g.save());
  assert.equal(g.player.coins, 17);
  assert.equal(g.player.name, first.name);
  g.removed.add(next.id);
  assert.equal(g.retireLife(index).ok, false);
  g.setSharedWorld(true);
  assert.equal(g.retireLife(index + 1).ok, false);
});

test('corrupt generated-origin records reject without changing legacy occupancy validation', () => {
  const g = new Stichos(3886);
  g.acceptLife(0);
  const save = g.save();
  for (const lifeOrigin of [
    { ...save.lifeOrigin!, index: NaN },
    { ...save.lifeOrigin!, version: 99 },
    { ...save.lifeOrigin!, customization: { height: 100 } },
    { ...save.lifeOrigin!, customization: { stats: { hp: 1000 } } },
  ])
    assert.throws(() => Stichos.restore({ ...save, lifeOrigin }));
  const noOrigin = { ...save, lifeOrigin: undefined };
  assert.throws(
    () => Stichos.restore(noOrigin),
    'Early non-priest occupancy requires its validated origin.',
  );
});
