import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { resourceWork, requiredToolFor, THEO_ESTATE } from '../src/stichos/labor.ts';
import type { Prop } from '../src/stichos/types.ts';
const wait = (g: Stichos, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / 0.1); i++) g.update(0.1, { x: 0, y: 0, run: false });
};
function beside(g: Stichos, p: Prop) {
  const point = [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].find((a) => !g.world.blocked(a.x, a.y, g.removed));
  assert.ok(point);
  Object.assign(g.player, point);
}
test('established priest owns real residence, finite savings and three physical tools; old saves preserve their money and home progress', () => {
  const g = new Stichos(3886);
  assert.equal(g.player.coins, 240);
  assert.equal(g.tools.length, 3);
  assert.equal(g.estate.residence?.id, THEO_ESTATE.residenceId);
  assert.equal(
    g.world.tile(g.estate.residence!.x, g.estate.residence!.y).building,
    THEO_ESTATE.residenceId,
  );
  assert.equal(g.staff.length, 3);
  const old: any = g.save();
  old.player.coins = 19;
  old.progression.homes = [];
  delete old.labor;
  const restored = Stichos.restore(old);
  assert.equal(restored.player.coins, 19);
  assert.equal(restored.progression.homes.length, 0);
  assert.equal(restored.tools.length, 3);
});
test('real resources require matching tools, separate timed strokes, stamina and wear; only final stroke grants and removes', () => {
  const g = new Stichos(3886),
    prop = g.world.propsAround(0, 0, 24).find((p) => p.kind === 'pine')!;
  beside(g, prop);
  const required = resourceWork(prop)!.requiredStrokes;
  assert.equal(g.interactionAvailability(prop.id).ok, false);
  g.equipTool('axe');
  const start = g.tools.find((t) => t.kind === 'axe')!.durability,
    energy = g.player.stamina;
  assert.equal(g.interactionAvailability(prop.id).completes, false);
  g.interact(prop.id);
  assert.equal(g.workProgress?.strokes, 1);
  assert.equal(g.removed.has(prop.id), false);
  assert.equal(g.inventory.wood, undefined);
  assert.ok(g.player.stamina < energy);
  assert.equal(g.effects.at(-1)?.tool?.kind, 'axe');
  g.interact(prop.id);
  assert.equal(g.workProgress?.strokes, 1, 'Cooldown prevents duplicate stroke');
  const saved = Stichos.restore(g.save());
  assert.equal(saved.workProgress?.strokes, 1);
  for (let i = 1; i < required; i++) {
    wait(saved, 1.6);
    assert.equal(saved.interactionAvailability(prop.id).completes, i === required - 1);
    saved.interact(prop.id);
  }
  assert.equal(saved.inventory.wood, 2);
  assert.ok(saved.removed.has(prop.id));
  assert.equal(saved.tools.find((t) => t.kind === 'axe')!.durability, start - required);
  assert.equal(saved.workProgress, null);
  assert.equal(Stichos.restore(saved.save()).inventory.wood, 2);
});
test('repair is an atomic workbench resource sink', () => {
  const g = new Stichos(3886),
    p = g.world.propsAround(0, 0, 24).find((p) => p.kind === 'rock')!;
  beside(g, p);
  g.equipTool('pickaxe');
  g.interact(p.id);
  assert.equal(g.repairTool('pickaxe').ok, false);
  Object.assign(g.player, { x: 4, y: 5 });
  g.inventory = { wood: 1, ore: 1 };
  const coins = g.player.coins;
  assert.equal(g.repairTool('pickaxe').ok, true);
  assert.equal(g.player.coins, coins - 4);
  assert.deepEqual(g.inventory, {});
  assert.equal(
    g.tools.find((t) => t.kind === 'pickaxe')!.durability,
    g.tools.find((t) => t.kind === 'pickaxe')!.profile.maxDurability,
  );
});
test('paid workers consume allocated real resources only once after work, trust and shared-world rules prevent invalid assignments', () => {
  const g = new Stichos(3886),
    worker = 'origin-botanist';
  g.chooseEstateTrust(worker, false);
  assert.equal(g.hireLabor(worker, 'garden').ok, false);
  g.chooseEstateTrust(worker, true);
  const preview = g.laborPreview(worker, 'garden');
  assert.ok(preview.ok);
  const coins = g.player.coins;
  assert.equal(g.hireLabor(worker, 'garden').ok, true);
  const order = g.laborOrders[0];
  assert.equal(g.player.coins, coins - preview.wages);
  assert.equal(g.hireLabor(worker, 'garden').ok, false);
  assert.ok(order.allocations.every((a) => !g.removed.has(a.propId)));
  Object.assign(g.player, { x: -3, y: 5 });
  assert.equal(g.collectLabor(order.id).ok, false);
  wait(g, order.endsAt - g.time + 0.1);
  g.setSharedWorld(true);
  assert.equal(g.collectLabor(order.id).ok, false);
  g.setSharedWorld(false);
  const before = g.carried;
  assert.equal(g.collectLabor(order.id).ok, true);
  assert.equal(g.carried, before + order.allocations.reduce((n, a) => n + a.amount, 0));
  assert.ok(order.allocations.every((a) => g.removed.has(a.propId)));
  assert.equal(g.collectLabor(order.id).ok, false);
  assert.equal(Stichos.restore(g.save()).laborOrders[0].status, 'complete');
});
test('worker completion preserves allocation and output on capacity failure or competing depletion; strict saves reject forged yield and durability', () => {
  const g = new Stichos(3886);
  assert.equal(g.hireLabor('origin-engineer', 'quarry').ok, true);
  const order = g.laborOrders[0];
  Object.assign(g.player, { x: 4, y: 5 });
  wait(g, order.endsAt - g.time + 0.1);
  g.inventory = { wood: 60 };
  assert.equal(g.collectLabor(order.id).ok, false);
  assert.ok(order.allocations.every((a) => !g.removed.has(a.propId)));
  g.inventory = {};
  g.removed.add(order.allocations[0].propId);
  assert.equal(g.collectLabor(order.id).ok, false);
  assert.equal(g.carried, 0);
  for (const change of [
    (s: any) => (s.labor.orders[0].allocations[0].amount = 20),
    (s: any) => (s.labor.tools[0].tools[0].durability = 1e8),
    (s: any) => (s.labor.tools[0].bodyId = 'unknown'),
  ]) {
    const save: any = g.save();
    change(save);
    assert.throws(() => Stichos.restore(save));
  }
  assert.equal(g.cancelLabor(order.id).ok, true);
  assert.equal(g.laborOrders[0].status, 'cancelled');
});
