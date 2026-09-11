import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { compactProject, createCompact, type CompactChoice } from '../src/stichos/compact.ts';
import { requiredToolFor } from '../src/stichos/labor.ts';
import type { Point, Prop } from '../src/stichos/types.ts';

// Unit fixtures place and provision a body deliberately. Actual work, payments,
// surveys and deliveries below still use session APIs; these are not duration evidence.
const idle = { x: 0, y: 0, run: false };
function near(g: Stichos, point: Point) {
  for (const [dx, dy] of [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [0, 0],
  ]) {
    const p = { x: point.x + dx, y: point.y + dy };
    if (
      [
        [-0.21, -0.21],
        [0.21, -0.21],
        [-0.21, 0.21],
        [0.21, 0.21],
      ].every(([x, y]) => !g.world.blocked(p.x + x, p.y + y, g.removed))
    ) {
      Object.assign(g.player, p);
      return;
    }
  }
  assert.fail('The real actor/resource needs an accessible nearby footing.');
}
function project(g: Stichos) {
  const { state, plan } = g.winterCompact;
  return compactProject(state, plan)!;
}
function survey(g: Stichos) {
  for (const witness of project(g).witnesses) {
    near(g, g.compactTarget(witness.id)!);
    const result = g.actCompact({ kind: 'survey', witnessId: witness.id });
    assert.ok(result.ok, result.message);
  }
}
function agree(g: Stichos, id: string): CompactChoice {
  survey(g);
  const p = project(g),
    choice = p.choices.find((c) => c.id === id)!;
  for (const [item, amount] of Object.entries(choice.cost.items))
    g.inventory[item as keyof typeof g.inventory] = Math.max(
      g.inventory[item as keyof typeof g.inventory] ?? 0,
      amount,
    );
  near(g, p.board);
  assert.ok(g.actCompact({ kind: 'choose', choiceId: id }).ok);
  return choice;
}
function harvest(g: Stichos, prop: Prop) {
  near(g, prop);
  assert.ok(g.equipTool(requiredToolFor(prop.kind)!).ok);
  for (let i = 0; i < 80 && !g.removed.has(prop.id); i++) {
    g.interact(prop.id);
    for (let n = 0; n < 6; n++) g.update(0.25, idle);
  }
  assert.ok(g.removed.has(prop.id), 'Finite actual timed strokes complete this harvest.');
}
function finishOrder(g: Stichos, id: string) {
  for (let i = 0; i < 3000; i++) {
    const order = g.laborOrders.find((o) => o.id === id)!;
    assert.notEqual(order.journey?.phase, 'blocked', order.journey?.reason);
    if (order.journey?.phase === 'ready' && g.time >= order.endsAt) return;
    g.update(0.25, idle);
  }
  assert.fail('The actual paid worker must travel, perform strokes, and return.');
}

test('legacy sessions default to an empty Compact and survey the correct nearby living witness with a saved statement', () => {
  const original = new Stichos(3886),
    legacy = original.save();
  assert.equal(legacy.winterCompact, undefined);
  const g = Stichos.restore(legacy),
    p = project(g),
    w = p.witnesses[0];
  assert.deepEqual(g.winterCompact.state, createCompact());
  assert.equal(g.save().winterCompact, undefined, 'Viewing a plan does not create fake progress.');
  const initialJournal = g.journal.length;
  Object.assign(g.player, { x: 0, y: 30 });
  assert.equal(g.actCompact({ kind: 'survey', witnessId: w.id }).ok, false);
  near(g, p.witnesses[1]);
  assert.equal(g.actCompact({ kind: 'survey', witnessId: w.id }).ok, false);
  near(g, g.compactTarget(w.id)!);
  const stateBefore = g.winterCompact.state;
  assert.ok(g.compactPreview({ kind: 'survey', witnessId: w.id }).ok);
  assert.deepEqual(g.winterCompact.state, stateBefore);
  assert.equal(g.journal.length, initialJournal);
  assert.ok(g.actCompact({ kind: 'survey', witnessId: w.id }).ok);
  assert.ok(g.journal.some((entry) => entry.text.includes(w.statement!)));
  const once = g.journal.length;
  assert.equal(g.actCompact({ kind: 'survey', witnessId: w.id }).ok, false);
  assert.equal(g.journal.length, once);
  const saved = g.save();
  assert.deepEqual(Stichos.restore(saved).winterCompact.state, g.winterCompact.state);
  assert.equal(g.quests.find((q) => q.id === 'winter-compact')?.target?.id, p.witnesses[1].id);
});

test('an unavailable witness leaves an account at the actual board without inventing a replacement person', () => {
  const g = new Stichos(3886),
    p = project(g),
    w = p.witnesses[0];
  g.removed.add(w.id);
  const target = g.compactTarget(w.id)!;
  assert.equal(target.id, p.board.id);
  near(g, w);
  assert.equal(g.actCompact({ kind: 'survey', witnessId: w.id }).ok, false);
  near(g, p.board);
  const result = g.actCompact({ kind: 'survey', witnessId: w.id });
  assert.ok(result.ok, result.message);
  assert.match(result.message, /deposited account/);
  assert.ok(result.message.includes(w.statement!));
  assert.ok(g.removed.has(w.id));
  assert.deepEqual(Stichos.restore(g.save()).winterCompact.state.surveys, [w.id]);
});

test('policy payments are atomic and timed physical harvest is credited once across save and depleted-resource retries', () => {
  let g = new Stichos(3886);
  survey(g);
  const p = project(g),
    choice = p.choices[0];
  near(g, p.board);
  g.player.coins = 0;
  g.inventory.wood = 0;
  const before = g.winterCompact.state,
    pack = { ...g.inventory };
  assert.equal(g.actCompact({ kind: 'choose', choiceId: choice.id }).ok, false);
  assert.deepEqual(g.winterCompact.state, before);
  assert.deepEqual(g.inventory, pack);
  g.player.coins = 100;
  g.inventory.wood = 1;
  assert.ok(g.compactPreview({ kind: 'choose', choiceId: choice.id }).ok);
  assert.equal(g.player.coins, 100);
  assert.equal(g.inventory.wood, 1);
  assert.ok(g.actCompact({ kind: 'choose', choiceId: choice.id }).ok);
  assert.equal(g.player.coins, 100 - choice.cost.coins);
  assert.equal(g.inventory.wood ?? 0, 0);
  const coins = g.player.coins;
  assert.equal(g.actCompact({ kind: 'choose', choiceId: 'charter' }).ok, false);
  assert.equal(g.player.coins, coins);
  const pine = g.world.propsAround(0, 0, 24).find((p) => p.kind === 'pine')!;
  near(g, pine);
  assert.ok(g.equipTool('axe').ok);
  g.interact(pine.id);
  assert.equal(g.winterCompact.state.work, 0, 'One preliminary stroke is not a complete harvest.');
  g = Stichos.restore(g.save());
  harvest(g, pine);
  assert.equal(g.winterCompact.state.work, 2);
  const credited = g.winterCompact.state;
  g.interact(pine.id);
  assert.deepEqual(g.winterCompact.state, credited);
  g = Stichos.restore(g.save());
  g.interact(pine.id);
  assert.deepEqual(g.winterCompact.state, credited);
  assert.ok(g.quests.find((q) => q.id === 'winter-compact')?.objective.includes('2/10'));
});

test('actual medicine batches count their real output, failed crafts and old stock do not, and physical delivery pays once', () => {
  let g = new Stichos(3886);
  const choice = agree(g, 'charter');
  assert.equal(choice.work.kind, 'craft');
  assert.equal(choice.work.item, 'bandage');
  near(g, project(g).board);
  g.inventory.bandage = 10;
  assert.equal(g.actCompact({ kind: 'deliver' }).ok, false);
  g.inventory.heartleaf = 0;
  g.inventory.cequin = 0;
  const before = g.winterCompact.state;
  g.craft('bandage');
  assert.deepEqual(g.winterCompact.state, before);
  g.inventory.heartleaf = 3;
  g.inventory.cequin = 5;
  const beforeBandages = g.inventory.bandage!;
  g.craft('bandage');
  assert.equal(g.inventory.bandage, beforeBandages + 2);
  assert.equal(g.winterCompact.state.work, 2);
  g = Stichos.restore(g.save());
  g.craft('bandage');
  g.craft('bandage');
  assert.equal(g.winterCompact.state.work, choice.work.amount);
  assert.equal(g.winterCompact.state.stage, 'delivery');
  const p = project(g),
    coins = g.player.coins,
    bandage = g.inventory.bandage!;
  near(g, p.board);
  assert.ok(g.actCompact({ kind: 'deliver' }).ok);
  assert.equal(g.player.coins, coins + p.reward.coins);
  assert.equal(g.inventory.bandage, bandage - choice.delivery.bandage!);
  assert.equal(g.winterCompact.state.project, 1);
  assert.equal(g.actCompact({ kind: 'deliver' }).ok, false);
  assert.equal(g.player.coins, coins + p.reward.coins);
  assert.equal(Stichos.restore(g.save()).winterCompact.state.project, 1);
});

test('only paid orders accepted after the agreement count as fresh work and returning-worker collection is one receipt', () => {
  let g = new Stichos(3886);
  assert.ok(g.hireLabor('origin:resident:5', 'forestry').ok);
  const old = g.laborOrders[0];
  agree(g, 'common');
  assert.equal(g.save().winterCompact?.laborBaseline, old.serial);
  finishOrder(g, old.id);
  near(g, g.estate.residence!);
  assert.ok(g.collectLabor(old.id).ok);
  assert.equal(g.winterCompact.state.work, 0);
  assert.ok(g.hireLabor('origin:resident:5', 'forestry').ok);
  const fresh = g.laborOrders.find((o) => o.status === 'working')!;
  assert.ok(fresh.serial > old.serial);
  g = Stichos.restore(g.save());
  finishOrder(g, fresh.id);
  near(g, g.estate.residence!);
  assert.ok(g.collectLabor(fresh.id).ok);
  const amount = fresh.allocations
    .filter((a) => a.item === 'wood')
    .reduce((n, a) => n + a.amount, 0);
  assert.equal(g.winterCompact.state.work, amount);
  assert.equal(g.winterCompact.state.paidOrders, 1);
  assert.equal(g.winterCompact.state.workerTrust[fresh.workerId], 2);
  const credited = g.winterCompact.state;
  assert.equal(g.collectLabor(fresh.id).ok, false);
  assert.deepEqual(g.winterCompact.state, credited);
  assert.deepEqual(Stichos.restore(g.save()).winterCompact.state, credited);
});

test('malformed Compact state and labor freshness boundaries reject the candidate save without altering the live session', () => {
  const g = new Stichos(3886);
  agree(g, 'common');
  const valid = g.save();
  const invalid = [
    { ...valid.winterCompact!, laborBaseline: 9999 },
    { ...valid.winterCompact!, laborBaseline: -1 },
    { ...valid.winterCompact!, extra: true },
    { ...valid.winterCompact!, state: { ...valid.winterCompact!.state, work: Infinity } },
    {
      ...valid.winterCompact!,
      state: { ...valid.winterCompact!.state, surveys: ['made-up-witness'] },
    },
  ];
  for (const ledger of invalid) {
    const corrupt = { ...valid, winterCompact: ledger };
    assert.throws(() => Stichos.restore(corrupt));
    assert.deepEqual(g.winterCompact.state, valid.winterCompact!.state);
    assert.equal(g.player.coins, valid.player.coins);
  }
  assert.deepEqual(Stichos.restore(valid).winterCompact.state, g.winterCompact.state);
});
