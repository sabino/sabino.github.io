import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreeLife,
  createCommission,
  restoreFreeLife,
  freeLifeMilestones,
} from '../src/stichos/free-life.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { createProgression } from '../src/stichos/progression.ts';

test('local commissions deterministically vary actual activities and only target supplied real entities', () => {
  const world = new InfiniteWorld(3886),
    town = world.settlementsAround(0, 0, 1)[0],
    board = world.propsAround(0, 0, 5).find((p) => p.id === 'origin:notice')!;
  const plants = world
    .propsAround(0, 0, 35)
    .filter((p) => ['cequin', 'heartleaf', 'emberroot'].includes(p.kind));
  const enemies = world.npcsAround(35, 35, 40).filter((n) => n.hostile);
  assert.ok(enemies.length);
  const kinds = new Set();
  for (let number = 1; number <= 64; number++) {
    const job = createCommission(3886, number, town, board, plants, enemies, {
      x: -13,
      y: 12,
      plant: 'cequin',
    });
    kinds.add(job.kind);
    assert.deepEqual(
      job,
      createCommission(3886, number, town, board, plants, enemies, {
        x: -13,
        y: 12,
        plant: 'cequin',
      }),
    );
    assert.equal(job.progress, 0);
    assert.equal(job.status, 'active');
    assert.ok(job.reward > 0 && job.reward <= 100);
    if (job.kind === 'field')
      assert.ok(
        plants.some((p) => p.kind === job.item && p.x === job.target.x && p.y === job.target.y),
      );
    if (job.kind === 'watch')
      assert.ok(job.targets.every((id) => enemies.some((n) => n.id === id)));
    const state = { ...createFreeLife(), serial: number, commission: job };
    assert.deepEqual(restoreFreeLife(state), state);
  }
  assert.deepEqual([...kinds].sort(), ['field', 'garden', 'watch', 'workshop']);
  for (let number = 1; number <= 20; number++)
    assert.equal(
      createCommission(3886, number, town, board, [], [], undefined).kind,
      'workshop',
      'Exhausted local resources still permit a preparation contract.',
    );
});

test('free-life validation rejects contradictory records and milestones reflect distinct earned activities', () => {
  const blank = createFreeLife();
  assert.deepEqual(restoreFreeLife(undefined), blank);
  for (const patch of [
    { serial: -1 },
    { completed: 1 },
    { hostProfessions: ['invented'] },
    { knownHosts: ['same', 'same'] },
    { rewarded: ['made-up'] },
    { commission: {} },
    { gardenProduce: Infinity },
  ])
    assert.throws(() => restoreFreeLife({ ...blank, ...patch }));
  const progression = createProgression(3886),
    goals = freeLifeMilestones(blank, progression, 0, 0);
  assert.equal(goals.length, 7);
  assert.equal(goals.filter((g) => g.complete).length, 0);
  const advanced = {
    ...blank,
    gardenProduce: 24,
    completed: 3,
    hostProfessions: ['botanist', 'guard', 'engineer', 'pilgrim'],
  };
  progression.xp.botany = 380;
  progression.upgrades.priest = { staff: 2, bow: 1 };
  const earned = freeLifeMilestones(advanced, progression, 3, 3);
  assert.equal(earned.filter((g) => g.complete).length, 6);
  assert.equal(
    earned.find((g) => g.id === 'life:home')!.complete,
    false,
    'A profession and coin balance cannot substitute for furnishing an actual home.',
  );
});

test('new field contracts reflect unique available portions while sufficient seeded terms stay unchanged', () => {
  const world = new InfiniteWorld(0xffffffff, 3),
    town = world.settlementsAround(-640, -640, 10)[0],
    board = world.propsAround(town.x, town.y, 5).find((p) => p.id === `${town.id}:notice`)!;
  const plots = world.propsAround(town.x, town.y, 48).filter((p) => p.kind === 'heartleaf');
  assert.equal(plots.length, 2);
  const make = (plants = plots, yieldFor: (p: (typeof plots)[number]) => number = () => 2) =>
    createCommission(0xffffffff, 7, town, board, plants, [], undefined, yieldFor);
  const limited = make();
  assert.equal(limited.kind, 'field');
  assert.equal(limited.required, 4);
  assert.match(limited.description, /Gather 4 fresh heartleaf/);
  assert.equal(limited.reward, 32);
  assert.deepEqual(
    make([...plots, ...plots]),
    limited,
    'Repeated IDs do not invent additional harvest.',
  );
  const enough = make(plots, () => 5);
  assert.equal(enough.required, 6);
  assert.equal(enough.reward, 38);
  assert.deepEqual(
    restoreFreeLife({ ...createFreeLife(), serial: 7, commission: limited }).commission,
    limited,
  );
  for (const invalid of [0, -1, NaN, Infinity, 1.5, Number.MAX_VALUE]) {
    const safe = make(plots, () => invalid);
    assert.equal(
      safe.required,
      2,
      'Invalid yield callbacks conservatively count one portion per real plot.',
    );
    assert.equal(safe.reward, 26);
  }
  assert.equal(
    createCommission(0xffffffff, 7, town, board, plots, [], undefined).required,
    2,
    'Callers without a yield model receive a conservative finite requirement.',
  );
});
