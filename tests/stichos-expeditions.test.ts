import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { generateArtifact } from '../src/stichos/artifacts.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';
import {
  ExpeditionCatalog,
  EXPEDITION_LIMITS,
  createExpeditionState,
  restoreExpeditions,
  observeExpeditions,
  expeditionStatus,
  claimExpedition,
  chooseAttunement,
  expeditionTechniqueBonus,
  parseExpeditionId,
  type ExpeditionContext,
} from '../src/stichos/expeditions.ts';
import { renderExpeditionPanel, expeditionTracker } from '../src/stichos/expedition-ui.ts';
import { validSharedCombatFrame } from '../src/stichos/shared-combat.ts';

const world = new InfiniteWorld(42, 4),
  catalog = new ExpeditionCatalog(world);
const plans = catalog.plansAround(0, 5);
const makeContext = (plan = plans[0]): ExpeditionContext => ({
  player: { ...plan.site },
  level: 10,
  inventory: { rations: 20, wood: 20, ore: 20, tonic: 20, salve: 20, cequin: 20 },
  defeated: new Set(plan.enemies.map((npc) => npc.id)),
  time: worldTimeAt(0),
});

test('three distinct reachable field sites outside the opening settlement preserve baseline terrain', () => {
  assert.equal(plans.length, 3);
  assert.deepEqual(
    plans.map((plan) => plan.kind),
    ['road', 'relay', 'garden'],
  );
  const pristine = new InfiniteWorld(42, 4);
  const seen = new Set<string>(),
    queue = [{ x: 0, y: 5 }];
  for (let i = 0; i < queue.length && i < 18000; i++) {
    const point = queue[i],
      key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: point.x + dx, y: point.y + dy };
      if (
        Math.abs(next.x) > 48 ||
        Math.abs(next.y) > 48 ||
        seen.has(`${next.x},${next.y}`) ||
        world.blocked(next.x, next.y, new Set(), true)
      )
        continue;
      queue.push(next);
    }
  }
  for (const plan of plans) {
    assert.ok(Math.hypot(plan.site.x, plan.site.y) > plan.town.radius + 5);
    assert.ok(
      Math.hypot(plan.site.x, plan.site.y - 5) < 45,
      'First field commissions are discoverable near the opening town',
    );
    assert.ok(
      seen.has(`${plan.site.x},${plan.site.y}`),
      `A walk through operable doors reaches ${plan.kind}`,
    );
    assert.notEqual(plan.biome, 'settlement');
    assert.ok(
      plan.enemies.every(
        (npc) => !world.blocked(npc.x, npc.y) && !world.tile(npc.x, npc.y).building,
      ),
    );
    assert.deepEqual(world.tile(plan.site.x, plan.site.y), pristine.tile(plan.site.x, plan.site.y));
    assert.deepEqual(
      world.npcsAround(plan.site.x, plan.site.y, 5),
      pristine.npcsAround(plan.site.x, plan.site.y, 5),
    );
    assert.ok(plan.enemies.every((npc) => npc.role === 'raider' && npc.hostile));
  }
});

test('encounter addresses, rewards and bodies are independent of exploration order in all save generations', () => {
  for (const generation of [1, 2, 3, 4] as const) {
    const a = new InfiniteWorld(3886, generation),
      b = new InfiniteWorld(3886, generation);
    b.tile(-100, 30);
    b.tile(100, -80);
    const ca = new ExpeditionCatalog(a),
      cb = new ExpeditionCatalog(b);
    assert.deepEqual(ca.plansAround(0, 5), cb.plansAround(0, 5));
    assert.ok(
      ca.plansAround(0, 5).length >= 2,
      `Established generation ${generation} has reachable additive content`,
    );
  }
});

test('encounter lookup rejects forged IDs and returns isolated standard wire-compatible NPCs', () => {
  const enemies = catalog.enemiesAround(plans[0].site.x, plans[0].site.y, 8);
  assert.equal(enemies.length, 3);
  assert.ok(
    validSharedCombatFrame({
      snapshot: { seq: 1, enemies, projectiles: [], dead: [], peaceful: [] },
      hits: [],
      deaths: [],
    }),
  );
  const id = enemies[0].id,
    copy = catalog.enemyById(id)!;
  assert.ok(copy);
  copy.hp = 1;
  assert.notEqual(catalog.enemyById(id)!.hp, 1);
  for (const bad of [
    'origin-archivist',
    'expedition:42:0:0:road:bird:0',
    'expedition:42:0:0:road:warden:0',
    'expedition:43:0:0:road:skirmisher:0',
    'expedition:42:0:0:road:skirmisher:9',
    'expedition:42:1:1:road:skirmisher:0',
    'expedition:42:0:0:road:skirmisher:0:more',
  ])
    assert.equal(catalog.enemyById(bad), undefined, bad);
  assert.equal(parseExpeditionId('expedition:042:0:0:road'), undefined);
  assert.equal(parseExpeditionId('expedition:4294967296:0:0:road'), undefined);
  assert.equal(parseExpeditionId('expedition:42:0:-0:road'), undefined);
  assert.deepEqual(catalog.plansAround(NaN, 0), []);
});

test('cached catalog queries avoid repeating placement work and bound returned actor count', () => {
  const town = plans[0].town;
  assert.strictEqual(catalog.plansForTown(town), catalog.plansForTown(town));
  assert.ok(catalog.cacheSize <= EXPEDITION_LIMITS.cachedTowns);
  assert.ok(
    catalog.enemiesAround(0, 0, Infinity).length <=
      EXPEDITION_LIMITS.nearbyTowns * 3 * EXPEDITION_LIMITS.enemiesPerSite,
  );
  for (const plan of plans) {
    assert.ok(plan.enemies.length <= EXPEDITION_LIMITS.enemiesPerSite);
    const reward = generateArtifact(plan.reward.artifactDesign);
    assert.equal(reward.category, 'implement');
    assert.equal(
      reward.delivery,
      plan.kind === 'road' ? 'contact' : plan.kind === 'relay' ? 'projectile' : 'pulse',
    );
    assert.ok(reward.parts.length > 0);
  }
});

test('the commission is a complete survey, combat, supply and once-only reward transaction', () => {
  const state = createExpeditionState(),
    plan = plans[0],
    context = makeContext(plan);
  context.defeated = new Set();
  assert.equal(expeditionStatus(plan, state, context).stage, 'discover');
  assert.equal(claimExpedition(plan, state, context).ok, false);
  assert.ok(observeExpeditions(state, [plan], context));
  assert.equal(expeditionStatus(plan, state, context).stage, 'combat');
  context.defeated = new Set(plan.enemies.slice(0, 2).map((npc) => npc.id));
  assert.equal(expeditionStatus(plan, state, context).defeated, 2);
  assert.equal(claimExpedition(plan, state, context).ok, false);
  context.defeated = new Set(plan.enemies.map((npc) => npc.id));
  assert.equal(expeditionStatus(plan, state, context).stage, 'deliver');
  assert.equal(
    expeditionStatus(plan, state, context).canClaim,
    false,
    'Must return, not deliver remotely',
  );
  context.player = { ...plan.giver.point };
  context.inventory.rations = 0;
  assert.equal(claimExpedition(plan, state, context).ok, false);
  context.inventory.rations = 20;
  const before = { ...context.inventory },
    result = claimExpedition(plan, state, context);
  assert.ok(result.ok);
  assert.equal(result.reward!.coins, plan.reward.coins + 12);
  assert.equal(context.inventory.rations, before.rations! - plan.cost.rations!);
  assert.equal(state.attunement, 'momentum');
  assert.equal(expeditionStatus(plan, state, context).stage, 'complete');
  const wallet = { ...context.inventory };
  assert.equal(claimExpedition(plan, state, context).ok, false);
  assert.deepEqual(
    context.inventory,
    wallet,
    'Repeated reward cannot consume twice or duplicate loot',
  );
  const restored = restoreExpeditions(JSON.parse(JSON.stringify(state)), world.seed);
  assert.equal(
    claimExpedition(plan, restored, context).ok,
    false,
    'Save/reload retains the reward receipt',
  );
});

test('night ecology observation is optional and cannot be retroactively claimed after delivery', () => {
  const plan = plans[2],
    state = createExpeditionState(),
    context = makeContext(plan);
  observeExpeditions(state, [plan], context);
  assert.equal(state.records[0].observed, false);
  context.time = worldTimeAt(13 * 60);
  observeExpeditions(state, [plan], context);
  assert.equal(state.records[0].observed, true);
  const daytime = createExpeditionState();
  context.time = worldTimeAt(0);
  observeExpeditions(daytime, [plan], context);
  context.player = { ...plan.giver.point };
  assert.equal(claimExpedition(plan, daytime, context).reward!.coins, plan.reward.coins);
  context.player = { ...plan.site };
  context.time = worldTimeAt(13 * 60);
  observeExpeditions(daytime, [plan], context);
  assert.equal(daytime.records[0].observed, false);
});

test('validation rejects malformed, cross-world and duplicate receipts, and protects ledger bounds', () => {
  const raw = {
    version: 1,
    records: [
      { id: plans[0].id, discovered: true, observed: true, claimed: true },
      { id: plans[0].id, discovered: true, observed: false, claimed: true },
      { id: 'expedition:99:0:0:road', discovered: true, observed: true, claimed: true },
      { id: plans[1].id, discovered: false, observed: true, claimed: true },
      { id: plans[2].id, discovered: 'yes', observed: true, claimed: true },
    ],
    attunement: 'renewal',
  };
  const restored = restoreExpeditions(raw, 42);
  assert.equal(restored.records.length, 1);
  assert.equal(restored.attunement, undefined);
  for (const malformed of [null, [], { version: 2, records: [] }, { version: 1, records: 'wrong' }])
    assert.deepEqual(restoreExpeditions(malformed, 42), createExpeditionState());
  const full = createExpeditionState();
  full.records = Array.from({ length: EXPEDITION_LIMITS.records }, (_, i) => ({
    id: `expedition:42:${i + 1}:0:road`,
    discovered: true,
    observed: false,
    claimed: true,
  }));
  assert.equal(observeExpeditions(full, [plans[0]], makeContext()), false);
  assert.equal(
    full.records.length,
    EXPEDITION_LIMITS.records,
    'Do not evict old reward receipts to make room',
  );
  const invalid = createExpeditionState(),
    context = makeContext();
  observeExpeditions(invalid, [plans[0]], context);
  context.player = { ...plans[0].giver.point };
  context.inventory.wood = NaN;
  assert.equal(claimExpedition(plans[0], invalid, context).ok, false);
  context.inventory.wood = 20;
  context.player.x = NaN;
  assert.equal(claimExpedition(plans[0], invalid, context).ok, false);
});

test('field lessons unlock through completed commissions and offer distinct bounded synergies', () => {
  const state = createExpeditionState();
  assert.equal(chooseAttunement(state, 'precision'), false);
  for (const plan of plans) {
    const context = makeContext(plan);
    observeExpeditions(state, [plan], context);
    context.player = { ...plan.giver.point };
    assert.ok(claimExpedition(plan, state, context).ok);
  }
  assert.ok(chooseAttunement(state, 'precision'));
  assert.equal(state.attunement, 'precision');
  assert.equal(expeditionTechniqueBonus('precision', false, true).damageMultiplier, 1.15);
  assert.equal(expeditionTechniqueBonus('precision', false, false).damageMultiplier, 1);
  assert.equal(expeditionTechniqueBonus('momentum', true, false).staminaReduction, 4);
  assert.equal(expeditionTechniqueBonus('momentum', false, false).staminaReduction, 0);
  assert.equal(expeditionTechniqueBonus('renewal', false, false).breath, 4);
});

test('portrait panel provides native controls, progress semantics and escaped civilization text', () => {
  const state = createExpeditionState(),
    context = makeContext();
  const hostileTextPlan = {
    ...plans[0],
    title: '<img src=x onerror=alert(1)>',
    description: '<script>bad()</script>',
  };
  const html = renderExpeditionPanel([hostileTextPlan, ...plans.slice(1)], state, context);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('aria-label="Nearby expedition sites"'));
  assert.ok(html.includes('aria-current="step"'));
  assert.ok(html.includes('<summary>Briefing &amp; tactics</summary>'));
  assert.equal((html.match(/class="expedition-card"/g) ?? []).length, 1);
  assert.ok(html.includes('data-expedition-action="track"'));
  assert.deepEqual(expeditionTracker(plans[0], state, context).target, plans[0].site);
  assert.ok(renderExpeditionPanel([], state, context).includes('No settlement commissions nearby'));
});
