import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { resourceWork, requiredToolFor, type LaborKind } from '../src/stichos/labor.ts';
import type { Point } from '../src/stichos/types.ts';
const kinds: [string, LaborKind][] = [
  ['origin-botanist', 'garden'],
  ['origin-engineer', 'quarry'],
  ['origin:resident:5', 'forestry'],
];
const input = { x: 0, y: 0, run: false };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function run(g: Stichos, done: () => boolean, max = 600) {
  for (let i = 0; i < max * 10 && !done(); i++) g.update(0.1, input);
  assert.ok(done(), 'Actual work should reach the requested state.');
}

test('named workers physically traverse collision-free routes, perform exact tool strokes and return before one finite collection', () => {
  for (const seed of [3886, 0xffffffff, 71])
    for (const [id, kind] of kinds) {
      const g = new Stichos(seed);
      assert.ok(g.hireLabor(id, kind).ok);
      const order = g.laborOrders[0],
        start = g.staff.find((n) => n.id === id)!,
        expected = order.allocations.reduce(
          (sum, a) =>
            sum +
            resourceWork(g.world.propsAround(a.x, a.y, 1).find((p) => p.id === a.propId)!)!
              .requiredStrokes,
          0,
        );
      let previous: Point = start,
        steps = 0,
        strokeCount = 0,
        workedStrokes = 0,
        previousAllocation = 0,
        previousStrokes = 0;
      const effects = new Set<number>(),
        phases = new Set<string>();
      for (let i = 0; i < 6000; i++) {
        g.update(0.1, input);
        const now = g.staff.find((n) => n.id === id)!,
          job = g.laborOrders[0];
        phases.add(job.journey!.phase);
        const j = job.journey!;
        if (j.allocation > previousAllocation) {
          workedStrokes++;
        } else if (j.strokes > previousStrokes) {
          workedStrokes += j.strokes - previousStrokes;
        }
        previousAllocation = j.allocation;
        previousStrokes = j.strokes;
        assert.ok(dist(now, previous) < 0.25, 'No teleporting to work or home.');
        steps += dist(now, previous);
        previous = now;
        for (const [dx, dy] of [
          [-0.2, -0.2],
          [0.2, -0.2],
          [-0.2, 0.2],
          [0.2, 0.2],
        ])
          assert.equal(
            g.world.blocked(now.x + dx, now.y + dy, g.removed),
            false,
            'Worker body stays on actual clear terrain.',
          );
        for (const e of g.effects)
          if (e.actorId === id && e.tool && !effects.has(e.id)) {
            effects.add(e.id);
            strokeCount++;
            assert.equal(
              e.tool.kind,
              kind === 'garden' ? 'sickle' : kind === 'quarry' ? 'pickaxe' : 'axe',
            );
            assert.ok(dist(e, now) < 0.25);
          }
        assert.ok(
          order.allocations.every((a) => !g.removed.has(a.propId)),
          'Working does not hand the player duplicate resource units.',
        );
        if (job.journey?.phase === 'ready') break;
        assert.notEqual(job.journey?.phase, 'blocked', job.journey?.reason);
      }
      const ready = g.laborOrders[0];
      assert.equal(ready.journey?.phase, 'ready');
      assert.ok(steps > 0.7);
      assert.ok(dist(previous, start) < 0.15);
      assert.ok(phases.has('working') && phases.has('returning'));
      assert.equal(
        workedStrokes,
        expected,
        'Every required physical stroke was simulated exactly once.',
      );
      assert.ok(
        strokeCount > 0 && strokeCount <= expected,
        'Visible actor-tagged strokes are real and finite.',
      );
      run(g, () => g.time >= order.endsAt);
      Object.assign(g.player, { x: start.x, y: start.y + 1 });
      const before = g.carried;
      assert.ok(g.collectLabor(order.id).ok);
      assert.equal(g.carried, before + order.allocations.reduce((sum, a) => sum + a.amount, 0));
      assert.ok(order.allocations.every((a) => g.removed.has(a.propId)));
      assert.equal(g.collectLabor(order.id).ok, false);
      assert.equal(Stichos.restore(g.save()).laborOrders[0].status, 'complete');
    }
});

test('elapsed resting time cannot replace physical labor, and a saved stroke resumes without resetting or duplicating its resources', () => {
  let g = new Stichos(3886);
  g.hireLabor('origin:resident:5', 'forestry');
  const id = g.laborOrders[0].id,
    worker = g.staff.find((n) => n.id === 'origin:resident:5')!;
  const home = g.estate.residence!;
  Object.assign(g.player, { x: home.x, y: home.y + 1 });
  for (let i = 0; i < 6; i++) assert.ok(g.restAtHome(home.id));
  assert.ok(g.time >= g.laborOrders[0].endsAt);
  assert.equal(g.laborOrders[0].journey?.phase, 'outbound');
  assert.equal(g.collectLabor(id).ok, false);
  run(g, () => g.laborOrders[0].journey!.strokes === 1);
  const save = g.save(),
    savedWorker = g.staff.find((n) => n.id === worker.id)!;
  g = Stichos.restore(save);
  assert.equal(g.laborOrders[0].journey?.strokes, 1);
  assert.ok(dist(g.staff.find((n) => n.id === worker.id)!, savedWorker) < 1e-9);
  run(g, () => g.laborOrders[0].journey?.phase === 'ready');
  assert.ok(dist(g.staff.find((n) => n.id === worker.id)!, worker) < 0.15);
});

test('a competing harvest interrupts work without any payout and corrupt journey timing or return coordinates are rejected', () => {
  const g = new Stichos(3886);
  g.hireLabor('origin-engineer', 'quarry');
  const order = g.laborOrders[0];
  g.removed.add(order.allocations[0].propId);
  g.update(0.1, input);
  assert.equal(g.laborOrders[0].journey?.phase, 'blocked');
  assert.match(g.laborOrders[0].journey?.reason ?? '', /taken/);
  assert.equal(g.collectLabor(order.id).ok, false);
  assert.equal(g.retryLabor(order.id).ok, false);
  for (const mutate of [
    (s: any) => (s.labor.orders[0].journey.nextStrokeAt = 1e308),
    (s: any) => (s.labor.orders[0].journey.returnPoint.x = 1e308),
    (s: any) => (s.labor.orders[0].journey.strokes = 9),
  ]) {
    const save: any = g.save();
    mutate(save);
    assert.throws(() => Stichos.restore(save));
  }
  assert.equal(g.cancelLabor(order.id).ok, true);
});

test('legacy paid orders migrate into a physical journey without charging wages again', () => {
  const g = new Stichos(3886);
  g.hireLabor('origin-engineer', 'quarry');
  const save: any = g.save();
  delete save.labor.orders[0].journey;
  const restored = Stichos.restore(save);
  assert.equal(restored.player.coins, g.player.coins);
  assert.equal(restored.laborOrders[0].journey?.phase, 'outbound');
  assert.equal(restored.collectLabor(restored.laborOrders[0].id).ok, false);
});

test('withdrawn workers walk back without resources or refunds before accepting another order', () => {
  const g = new Stichos(3886),
    id = 'origin:resident:5',
    start = g.staff.find((n) => n.id === id)!;
  g.hireLabor(id, 'forestry');
  const order = g.laborOrders[0],
    coins = g.player.coins;
  run(g, () => dist(g.staff.find((n) => n.id === id)!, start) > 2);
  g.cancelLabor(order.id);
  assert.equal(g.hireLabor(id, 'garden').ok, false);
  run(g, () => g.laborOrders[0].journey?.phase === 'ready');
  assert.ok(dist(g.staff.find((n) => n.id === id)!, start) < 0.15);
  assert.equal(g.player.coins, coins);
  assert.ok(order.allocations.every((a) => !g.removed.has(a.propId)));
  assert.equal(g.collectLabor(order.id).ok, false);
  assert.ok(g.hireLabor(id, 'forestry').ok);
});

test('a worker inside a real closed building opens its actual doorway and walks through instead of clipping or teleporting', () => {
  const initial = new Stichos(3886),
    saved = initial.save();
  const engineer = structuredClone(initial.npcs.find((n) => n.id === 'origin-engineer')!);
  Object.assign(engineer, { x: -13, y: 10 });
  saved.npcs = saved.npcs.filter((n) => n.id !== engineer.id);
  saved.npcs.push(engineer);
  const g = Stichos.restore(saved);
  assert.ok(g.hireLabor(engineer.id, 'quarry').ok);
  run(g, () => g.laborOrders[0].journey?.phase === 'ready');
  const openedDoors = [...g.removed].filter((id) => id.includes(':door:'));
  assert.ok(openedDoors.length > 0, 'The worker physically opens a door along the route.');
  assert.ok(dist(g.staff.find((n) => n.id === engineer.id)!, engineer) < 0.15);
  assert.deepEqual(Stichos.restore(g.save()).removed, g.removed);
});
