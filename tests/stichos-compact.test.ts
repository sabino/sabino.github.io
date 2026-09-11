import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld } from '../src/stichos/world.ts';
import {
  createCompact,
  buildCompact,
  compactProject,
  previewCompact,
  applyCompact,
  recordCompactEvent,
  restoreCompact,
  COMPACT_MILESTONES,
  type CompactState,
  type CompactPlan,
  type CompactContext,
  type CompactEvent,
  type CompactTarget,
  type CompactAction,
} from '../src/stichos/compact.ts';
import type { ItemId, Point } from '../src/stichos/types.ts';

const supplies: Record<ItemId, number> = {
  cequin: 1000,
  heartleaf: 1000,
  emberroot: 1000,
  wood: 1000,
  ore: 1000,
  salve: 1000,
  tonic: 1000,
  rations: 1000,
  bandage: 1000,
  seal: 1000,
  lens: 1000,
};
const clone = <T>(v: T): T => structuredClone(v);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function context(plan: CompactPlan, actor: CompactTarget): CompactContext {
  return {
    plan,
    position: { x: actor.x, y: actor.y },
    actor: { ...actor, hp: 80 },
    coins: 10000,
    inventory: { ...supplies },
  };
}
function action(
  state: CompactState,
  plan: CompactPlan,
  input: CompactAction,
  actor: CompactTarget,
) {
  const result = applyCompact(state, input, context(plan, actor));
  assert.ok(result.ok, result.message);
  return result.state;
}
function survey(state: CompactState, plan: CompactPlan) {
  for (const w of compactProject(state, plan)!.witnesses)
    state = action(state, plan, { kind: 'survey', witnessId: w.id }, w);
  return state;
}
function select(state: CompactState, plan: CompactPlan, choiceId = 'common') {
  return action(
    survey(state, plan),
    plan,
    { kind: 'choose', choiceId },
    compactProject(state, plan)!.board,
  );
}
function finishWork(state: CompactState, plan: CompactPlan) {
  const p = compactProject(state, plan)!,
    c = p.choices.find((c) => c.id === state.choices[p.id])!;
  const id = `performed:${p.id}:${state.observed}`;
  const event: CompactEvent =
    c.work.kind === 'gather'
      ? { id, kind: 'gather', item: c.work.item, amount: c.work.amount, propId: `plot:${p.id}` }
      : { id, kind: 'craft', item: c.work.item, amount: c.work.amount, recipeId: c.work.item };
  return recordCompactEvent(state, event, plan);
}
function finishProject(state: CompactState, plan: CompactPlan, choice = 'common') {
  state = finishWork(select(state, plan, choice), plan);
  return action(state, plan, { kind: 'deliver' }, compactProject(state, plan)!.board);
}

/** Verify the actual doorway-open topology, rather than accepting merely plausible coordinates. */
function connected(world: InfiniteWorld, town: Point, targets: Point[]) {
  const key = (p: Point) => `${p.x},${p.y}`;
  const start = { x: Math.round(town.x), y: Math.round(town.y + 4) };
  assert.equal(world.blocked(start.x, start.y, new Set(), true), false);
  const queue = [start],
    seen = new Set([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (
        Math.abs(n.x - town.x) > 32 ||
        Math.abs(n.y - town.y) > 32 ||
        seen.has(key(n)) ||
        world.blocked(n.x, n.y, new Set(), true)
      )
        continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  for (const target of targets)
    assert.ok(
      queue.some((p) => distance(p, target) <= 1.65),
      `Actual public approach to ${key(target)}`,
    );
}

test('six real families, 24 distinct projects and 72 milestones retain connected witnesses and boards in old and new geographies', () => {
  for (const generation of [1, 2, 3] as const)
    for (const seed of [0, 1, 703, 0xffffffff]) {
      const world = new InfiniteWorld(seed, generation),
        plan = buildCompact(world);
      assert.equal(plan.projects.length, 24);
      assert.equal(COMPACT_MILESTONES, 72);
      assert.equal(new Set(plan.towns.map((t) => t.id)).size, 6);
      assert.deepEqual(
        plan.towns.map((t) => t.clan),
        [0, 1, 2, 3, 4, 5],
      );
      assert.equal(new Set(plan.projects.map((p) => p.title)).size, 24);
      assert.equal(new Set(plan.projects.map((p) => p.description)).size, 24);
      assert.equal(
        new Set(plan.projects.flatMap((p) => p.witnesses.map((w) => w.statement))).size,
        48,
        'Every project carries two specific, distinct accounts.',
      );
      for (const town of plan.towns) {
        const projects = plan.projects.filter((p) => p.town.id === town.id);
        assert.equal(projects.length, 4);
        const p = projects[0];
        const residents = world.npcsAround(town.x, town.y, town.radius + 8);
        for (const witness of p.witnesses)
          assert.ok(residents.some((n) => n.id === witness.id && n.hp > 0 && !n.hostile));
        assert.ok(
          world
            .propsAround(town.x, town.y, town.radius + 8)
            .some((a) => a.id === p.board.id && a.kind === 'notice'),
        );
        connected(world, town, [p.board, ...p.witnesses]);
        for (const step of projects)
          for (const choice of step.choices) {
            assert.ok(choice.work.amount >= 3 && choice.work.amount <= 20);
            assert.ok(choice.cost.coins > 0);
            assert.ok(choice.delivery[choice.work.item]! >= choice.work.amount);
            assert.ok(['gather', 'craft'].includes(choice.work.kind));
            assert.ok(!Object.hasOwn(choice, 'wait') && !Object.hasOwn(choice, 'distance'));
          }
      }
      assert.deepEqual(
        buildCompact(new InfiniteWorld(seed, generation)),
        plan,
        'Call order and terrain cache eviction cannot reroll policy terms.',
      );
    }
});

test('a public agreement needs two actual accounts, physical proximity and atomic upfront funding; old stock cannot finish fresh work', () => {
  const plan = buildCompact(new InfiniteWorld(3886)),
    p = plan.projects[0];
  let state = createCompact();
  const begin = clone(state),
    ctx = context(plan, p.board);
  assert.equal(applyCompact(state, { kind: 'choose', choiceId: 'common' }, ctx).ok, false);
  const distant = { ...context(plan, p.witnesses[0]), position: { x: 999, y: 999 } };
  assert.equal(
    applyCompact(state, { kind: 'survey', witnessId: p.witnesses[0].id }, distant).ok,
    false,
  );
  assert.equal(
    applyCompact(state, { kind: 'survey', witnessId: p.witnesses[0].id }, ctx).ok,
    false,
  );
  assert.deepEqual(state, begin);
  state = survey(state, plan);
  const surveyed = clone(state),
    poor = { ...ctx, coins: 0, inventory: {} };
  const refused = applyCompact(state, { kind: 'choose', choiceId: 'common' }, poor);
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.state, state);
  assert.equal(refused.reward.coins, 0);
  const preview = previewCompact(state, { kind: 'choose', choiceId: 'common' }, ctx);
  assert.ok(preview.ok);
  assert.deepEqual(preview.state, surveyed);
  assert.deepEqual(state, surveyed);
  const agreement = applyCompact(state, { kind: 'choose', choiceId: 'common' }, ctx);
  assert.ok(agreement.ok);
  assert.deepEqual(agreement.cost, p.choices[0].cost);
  state = agreement.state;
  assert.equal(
    applyCompact(state, { kind: 'choose', choiceId: 'charter' }, ctx).ok,
    false,
    'Terms cannot reroll after being paid.',
  );
  assert.equal(
    applyCompact(state, { kind: 'deliver' }, ctx).ok,
    false,
    'A full pre-existing pack is not fresh physical work.',
  );
  const unrelated = recordCompactEvent(
    state,
    { id: 'unrelated', kind: 'craft', recipeId: 'salve', item: 'salve', amount: 20 },
    plan,
  );
  assert.equal(unrelated.work, 0);
  assert.equal(unrelated.stage, 'work');
  assert.deepEqual(restoreCompact(state, plan), state);
});

test('real resource/order identity prevents repeated credit, paid workers count only relevant completed output, and delivery consumes once', () => {
  const plan = buildCompact(new InfiniteWorld(3886));
  let state = select(createCompact(), plan);
  const p = compactProject(state, plan)!,
    c = p.choices[0];
  const event: CompactEvent = {
    id: 'actual:first',
    kind: 'gather',
    item: c.work.item,
    amount: 2,
    propId: 'origin:pine:0',
  };
  state = recordCompactEvent(state, event, plan);
  const once = clone(state);
  assert.deepEqual(recordCompactEvent(state, event, plan), once);
  assert.deepEqual(
    recordCompactEvent(state, { ...event, id: 'renamed' }, plan),
    once,
    'Renaming an event cannot gather the same prop twice.',
  );
  const labor: CompactEvent = {
    id: 'labor:1',
    kind: 'labor',
    workerId: 'origin-engineer',
    orderId: 'labor:1',
    paidCoins: 18,
    output: { [c.work.item]: 3 },
  };
  state = recordCompactEvent(state, labor, plan);
  assert.equal(state.work, 5);
  assert.equal(state.paidOrders, 1);
  assert.equal(state.workerTrust['origin-engineer'], 2);
  assert.deepEqual(recordCompactEvent(state, { ...labor, id: 'renamed:labor' }, plan), state);
  assert.throws(() =>
    recordCompactEvent(state, { ...labor, id: 'unpaid', orderId: 'labor:2', paidCoins: 0 }, plan),
  );
  const wrong = recordCompactEvent(
    state,
    { ...labor, id: 'wrong:out', orderId: 'labor:2', output: { lens: 2 } },
    plan,
  );
  assert.equal(wrong.work, state.work);
  assert.equal(wrong.paidOrders, 1);
  state = finishWork(state, plan);
  assert.equal(state.stage, 'delivery');
  const ctx = context(plan, p.board),
    missing = { ...ctx, inventory: {} };
  assert.equal(applyCompact(state, { kind: 'deliver' }, missing).ok, false);
  assert.deepEqual(applyCompact(state, { kind: 'deliver' }, missing).state, state);
  const delivered = applyCompact(state, { kind: 'deliver' }, ctx);
  assert.ok(delivered.ok);
  assert.deepEqual(delivered.cost.items, c.delivery);
  assert.equal(delivered.state.project, 1);
  assert.equal(delivered.reward.coins, p.reward.coins);
  assert.deepEqual(delivered.reputation, c.reputation);
  const restored = restoreCompact(delivered.state, plan);
  assert.equal(
    applyCompact(restored, { kind: 'deliver' }, ctx).ok,
    false,
    'Restore cannot repeat the prior delivery or its reward.',
  );
});

test('policy choices change subsequent obligations and civic outcomes while every branch reaches a finite resolution', () => {
  const plan = buildCompact(new InfiniteWorld(703));
  let common = createCompact(),
    charter = createCompact();
  for (let round = 0; round < 6; round++) {
    common = finishProject(common, plan, 'common');
    charter = finishProject(charter, plan, 'charter');
  }
  const a = compactProject(common, plan)!,
    b = compactProject(charter, plan)!;
  assert.equal(a.id, b.id);
  assert.ok(
    a.choices[0].cost.coins < b.choices[0].cost.coins,
    'Local ownership lowers the next funding requirement.',
  );
  assert.ok(
    b.choices[0].work.amount < a.choices[0].work.amount,
    'The reliable charter changes actual later work, not only its label.',
  );
  assert.notDeepEqual(common.outcomes, charter.outcomes);
  for (let i = 6; i < 24; i++) {
    common = finishProject(common, plan, i % 2 ? 'common' : 'charter');
    charter = finishProject(charter, plan, i % 2 ? 'charter' : 'common');
    assert.deepEqual(restoreCompact(common, plan), common);
    assert.deepEqual(restoreCompact(charter, plan), charter);
  }
  for (const state of [common, charter]) {
    assert.equal(state.stage, 'complete');
    assert.equal(state.project, 24);
    assert.equal(state.completed.length, 24);
    assert.equal(Object.keys(state.choices).length, 24);
    assert.equal(
      applyCompact(state, { kind: 'deliver' }, context(plan, plan.projects[23].board)).ok,
      false,
    );
    assert.deepEqual(
      recordCompactEvent(
        state,
        { id: 'late', kind: 'craft', recipeId: 'salve', item: 'salve', amount: 2 },
        plan,
      ),
      state,
    );
  }
});

test('unavailable witnesses keep an honest deposited-record route; malformed saves cannot skip surveys, choices or outcomes', () => {
  const plan = buildCompact(new InfiniteWorld(1)),
    p = plan.projects[0];
  let state = createCompact();
  const dead = { ...context(plan, p.witnesses[0]), actor: { ...p.witnesses[0], hp: 0 } };
  assert.equal(
    applyCompact(state, { kind: 'survey', witnessId: p.witnesses[0].id }, dead).ok,
    false,
  );
  const board = { ...context(plan, p.board), unavailableWitnesses: [p.witnesses[0].id] };
  const archive = applyCompact(state, { kind: 'survey', witnessId: p.witnesses[0].id }, board);
  assert.ok(archive.ok);
  assert.match(archive.message, /unavailable/);
  state = action(
    archive.state,
    plan,
    { kind: 'survey', witnessId: p.witnesses[1].id },
    p.witnesses[1],
  );
  state = action(state, plan, { kind: 'choose', choiceId: 'charter' }, p.board);
  assert.deepEqual(restoreCompact(undefined, plan), createCompact());
  assert.deepEqual(restoreCompact(state, plan), state);
  for (const bad of [
    { ...state, project: 24 },
    { ...state, stage: 'delivery' },
    { ...state, surveys: [] },
    { ...state, choices: { [p.id]: 'invented' } },
    { ...state, completed: ['compact:0:1'] },
    { ...state, receipts: ['same', 'same'] },
    { ...state, observed: -1 },
    {
      ...state,
      outcomes: Array.from({ length: 6 }, () => ({ care: 99, independence: 0, reliability: 0 })),
    },
    { ...state, unknown: 'unbounded payload' },
    { ...state, workerTrust: JSON.parse('{"__proto__":2}') },
  ])
    assert.throws(() => restoreCompact(bad, plan));
  assert.deepEqual(restoreCompact(JSON.parse(JSON.stringify(state)), plan), state);
});
