import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { PRODUCTION_RECIPES, type ProductionKind } from '../src/stichos/production.ts';
import type { Point } from '../src/stichos/types.ts';
const idle = { x: 0, y: 0, run: false };
// Provisioned unit fixture: production still spends/claims/advances/collects through actual APIs.
function game() {
  const g = new Stichos(3886);
  g.player.coins = 1000;
  g.inventory = { wood: 24, ore: 18, cequin: 6, heartleaf: 3, emberroot: 3 };
  g.progression.xp.crafting = 80;
  return g;
}
function site(g: Stichos, kind: ProductionKind): Point {
  for (let y = -40; y <= 40; y += 2)
    for (let x = -40; x <= 40; x += 2) {
      if (g.world.blocked(x, y, g.removed)) continue;
      Object.assign(g.player, { x, y });
      if (
        g.productionPreview(kind, { x, y }).ok &&
        (!['sawmill', 'ore-sorter'].includes(kind) ||
          g.world
            .propsAround(x, y, 16)
            .filter(
              (p) => p.kind === (kind === 'sawmill' ? 'pine' : 'rock') && !g.removed.has(p.id),
            ).length >= 3)
      )
        return { x, y };
    }
  assert.fail('The world must have a valid production site.');
}
function build(g: Stichos, kind: ProductionKind) {
  const p = site(g, kind),
    before = g.player.coins,
    result = g.buildProduction(kind, p);
  assert.ok(result.ok, result.message);
  assert.ok(g.player.coins < before);
  return g.productionStructures.at(-1)!;
}
function run(g: Stichos, seconds: number) {
  const position = { x: g.player.x, y: g.player.y };
  Object.assign(g.player, { x: 0, y: 5 });
  for (let i = 0; i < seconds * 4; i++) {
    g.update(0.25, idle);
    assert.equal(g.phase, 'playing');
  }
  Object.assign(g.player, position);
}

test('construction uses real clear terrain and atomic materials, and invalid roads/homes/stacked sites spend nothing', () => {
  const g = game(),
    before = g.player.coins;
  Object.assign(g.player, { x: 0, y: 5 });
  assert.equal(g.buildProduction('garden', { x: 0, y: 5 }).ok, false);
  assert.equal(g.player.coins, before);
  assert.equal(g.buildProduction('garden', { x: Infinity, y: 5 }).ok, false);
  const s = build(g, 'garden'),
    coins = g.player.coins;
  assert.equal(g.buildProduction('garden', s).ok, false);
  assert.equal(g.player.coins, coins);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const tile = g.world.tile(s.x + dx, s.y + dy);
      assert.ok(['snow', 'grass'].includes(tile.terrain));
      assert.equal(tile.building, undefined);
      assert.equal(tile.site, undefined);
    }
  assert.equal(Stichos.restore(g.save()).productionStructures[0].id, s.id);
});

test('garden inputs are finite, active time advances saved batches, and rest or repeated collection cannot mint output', () => {
  let g = game();
  const s = build(g, 'garden'),
    seed = g.inventory.cequin!,
    wood = g.inventory.wood!;
  assert.ok(g.startProduction(s.id, 'grow-cequin', 2).ok);
  assert.equal(g.inventory.cequin, seed - 2);
  assert.equal(g.inventory.wood, wood - 2);
  run(g, 20);
  const elapsed = g.productionStructures[0].job!.elapsed;
  const shrine = g.world.propsAround(0, 0, 10).find((p) => p.kind === 'shrine')!;
  Object.assign(g.player, { x: shrine.x, y: shrine.y + 1 });
  g.rest();
  assert.equal(
    g.productionStructures[0].job!.elapsed,
    elapsed,
    'Rest jumps are not productive active time.',
  );
  g = Stichos.restore(g.save());
  run(g, 141);
  assert.equal(g.productionStructures[0].phase, 'ready');
  assert.equal(g.productionStructures[0].output.cequin, 6);
  Object.assign(g.player, { x: s.x, y: s.y });
  const before = g.inventory.cequin!;
  assert.ok(g.collectProduction(s.id).ok);
  assert.equal(g.inventory.cequin, before + 6);
  assert.equal(g.collectProduction(s.id).ok, false);
  assert.equal(g.inventory.cequin, before + 6);
  assert.deepEqual(Stichos.restore(g.save()).productionStructures[0].output, {});
});

test('timber and ore machines reserve actual distinct resources, consume once, and cancel only unfinished batch inputs', () => {
  for (const [kind, recipeId, sourceKind, outputItem, inputItem] of [
    ['sawmill', 'cut-timber', 'pine', 'wood', 'ore'],
    ['ore-sorter', 'sort-ore', 'rock', 'ore', 'wood'],
  ] as const) {
    let g = game();
    const s = build(g, kind),
      recipe = PRODUCTION_RECIPES.find((r) => r.id === recipeId)!;
    const start = g.productionJobPreview(s.id, recipeId, 2);
    assert.ok(start.ok, start.message);
    assert.equal(new Set(start.sources.map((p) => p.id)).size, 2);
    const input = g.inventory[inputItem]!;
    assert.ok(g.startProduction(s.id, recipeId, 2).ok);
    assert.equal(g.inventory[inputItem], input - 2);
    assert.ok(start.sources.every((p) => !g.removed.has(p.id)));
    run(g, recipe.seconds + 1);
    assert.ok(g.removed.has(start.sources[0].id));
    assert.equal(g.removed.has(start.sources[1].id), false);
    assert.equal(g.productionStructures[0].output[outputItem], 4);
    g = Stichos.restore(g.save());
    Object.assign(g.player, { x: s.x, y: s.y });
    assert.ok(g.cancelProduction(s.id).ok);
    assert.equal(g.inventory[inputItem], input - 1);
    assert.equal(g.cancelProduction(s.id).ok, false);
    assert.equal(g.removed.has(start.sources[1].id), false);
    assert.ok(g.collectProduction(s.id).ok);
    assert.equal(g.productionStructures[0].job, null);
  }
});

test('depleted reserved sources block without duplicate output and preserve capacity-safe cancellation', () => {
  const g = game(),
    s = build(g, 'sawmill');
  assert.ok(g.startProduction(s.id, 'cut-timber').ok);
  const source = g.productionStructures[0].job!.sources[0];
  g.removed.add(source.id);
  run(g, 56);
  assert.equal(g.productionStructures[0].phase, 'blocked');
  assert.deepEqual(g.productionStructures[0].output, {});
  assert.equal(g.retryProduction(s.id).ok, false);
  assert.ok(g.cancelProduction(s.id).ok);
  assert.deepEqual(Stichos.restore(g.save()).productionStructures[0].output, {});
});

test('online machines wait for the exact shared source acknowledgement and materialize each batch once', () => {
  let g = game();
  const s = build(g, 'sawmill');
  g.setSharedWorld(true);
  assert.ok(g.startProduction(s.id, 'cut-timber').ok);
  run(g, 56);
  const claim = g.pendingProductionClaims[0];
  assert.ok(claim);
  assert.equal(g.removed.has(claim.sourceId), false);
  assert.deepEqual(g.productionStructures[0].output, {});
  g = Stichos.restore(g.save());
  g.setSharedWorld(true);
  assert.deepEqual(g.pendingProductionClaims[0], claim);
  assert.equal(g.commitProductionClaim(s.id, claim.jobId + 1, claim.sourceId).ok, false);
  g.removed.add(claim.sourceId);
  assert.ok(g.commitProductionClaim(s.id, claim.jobId, claim.sourceId).ok);
  assert.equal(g.productionStructures[0].output.wood, 4);
  assert.equal(g.commitProductionClaim(s.id, claim.jobId, claim.sourceId).ok, false);
  const herb = game(),
    beds = build(herb, 'garden');
  herb.setSharedWorld(true);
  assert.ok(herb.startProduction(beds.id, 'grow-cequin').ok);
  run(herb, 81);
  assert.equal(herb.productionStructures[0].output.cequin, 3);
  assert.equal(herb.pendingProductionClaims.length, 0);
});

test('production save validation rejects oversized sites, forged sources, wrong recipes and impossible progress', () => {
  const g = game(),
    s = build(g, 'sawmill');
  g.startProduction(s.id, 'cut-timber');
  const save = g.save();
  for (const change of [
    (s: any) => (s.x = 1e15),
    (s: any) => (s.kind = 'cathedral'),
    (s: any) => (s.output = { coins: 100 }),
    (s: any) => (s.job.recipe = 'grow-cequin'),
    (s: any) => (s.job.elapsed = 1e12),
    (s: any) => (s.job.sources[0].id = 'fake-resource'),
  ]) {
    const bad = structuredClone(save);
    change(bad.production!.structures[0]);
    assert.throws(() => Stichos.restore(bad));
  }
  assert.equal(Stichos.restore(new Stichos(3886).save()).productionStructures.length, 0);
});
