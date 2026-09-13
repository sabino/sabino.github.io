import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Stichos } from '../src/stichos/session.ts';
import { ExpeditionCatalog, type Attunement } from '../src/stichos/expeditions.ts';
import { generateArtifact } from '../src/stichos/artifacts.ts';
import { TECHNIQUES } from '../src/stichos/combat-techniques.ts';
import {
  SharedCombat,
  validSharedCombatFrame,
  type SharedCombatFrame,
  type SharedCombatPeer,
  type SharedEnemy,
} from '../src/stichos/shared-combat.ts';
import type { Npc } from '../src/stichos/types.ts';

const idle = { x: 0, y: 0, run: false };
const room = '42:independent-expedition-review';
const peer = (g: Stichos): SharedCombatPeer => ({
  id: 'review-player',
  bodyId: g.bodyId,
  x: g.player.x,
  y: g.player.y,
  heading: g.player.heading,
  appearance: g.displayAppearance,
  combatActive: true,
  progression: g.sharedCombatProgression,
});
function apply(g: Stichos, frame: SharedCombatFrame) {
  assert(validSharedCombatFrame(frame), 'Authority output passes the actual wire validator.');
  return g.applySharedCombat(frame, 'review-player');
}

// Explicitly staged combat fixtures: these test simulation transactions, not earned play time.
// The separate catalog tests walk the generated collision graph; no terrain is carved here.
function attuned(attunement: Attunement, weapon: 'staff' | 'sword' | 'bow' = 'staff') {
  const g = new Stichos(42, 4),
    saved = g.save();
  saved.expeditions = {
    version: 1,
    attunement,
    records: g.expeditions.map((p) => ({
      id: p.id,
      discovered: true,
      observed: false,
      claimed: true,
    })),
  };
  saved.weapons = ['staff', 'sword', 'bow'];
  saved.player.appearance.weapon = weapon;
  saved.player.level = 4;
  saved.player.x = 0;
  saved.player.y = 30;
  return Stichos.restore(saved);
}
function fixtureEnemies(g: Stichos, count = 1): Npc[] {
  const template = g.expeditions.find((p) => p.kind === 'relay')!.enemies[0];
  return Array.from({ length: count }, (_, i) => ({
    ...structuredClone(template),
    id: `integration-review-target:${i}`,
    x: 0.55 + i * 0.2,
    y: 30,
    home: { x: 0.55 + i * 0.2, y: 30 },
    hp: 1000,
    maxHp: 1000,
    speed: 0,
    cooldown: 20,
  }));
}
function arena(g: Stichos, npcs: Npc[]) {
  let clock = 0;
  const authority = new SharedCombat(
    {
      generation: 4,
      blocked: () => false,
      propsAround: () => [],
      npcsAround: () => structuredClone(npcs),
    },
    new Set(),
    { now: () => clock },
  );
  return {
    authority,
    tick(dt: number) {
      clock += dt * 1000;
      return authority.tick(dt, [peer(g)]);
    },
  };
}

test('all three generated commissions receive real room death receipts, consume crafted supplies, award usable loot once and survive reload', () => {
  let g = new Stichos(42, 4);
  g.player.level = 4;
  g.inventory = { rations: 3, wood: 2, ore: 4, emberroot: 2, cequin: 5, heartleaf: 4 };
  g.craft('tonic');
  g.craft('salve');
  g.craft('salve');
  assert.equal(g.inventory.tonic, 1);
  assert.equal(g.inventory.salve, 2);
  assert.equal(g.inventory.emberroot ?? 0, 0);
  assert.equal(g.inventory.heartleaf ?? 0, 0);
  const plans = g.expeditions;
  assert.equal(plans.length, 3);
  let clock = 0;
  const authority = new SharedCombat(g.world, new Set(), { now: () => clock });
  g.setSharedWorld(true);
  g.setSharedCombat(true, room);
  for (const plan of plans) {
    Object.assign(g.player, plan.site);
    g.update(0.1, idle);
    assert(g.expeditionProgress.records.some((r) => r.id === plan.id && r.discovered));
    apply(g, authority.tick(0.01, [peer(g)]));
    assert.equal(g.deliverExpedition(plan.id).ok, false, 'Living site cannot pay its commission.');
    for (const generated of plan.enemies) {
      for (let attempt = 0; attempt < 40 && !g.removed.has(generated.id); attempt++) {
        const enemy = authority.snapshot().enemies.find((n) => n.id === generated.id) ?? generated;
        const position = [
          { x: enemy.x - 0.45, y: enemy.y },
          { x: enemy.x + 0.45, y: enemy.y },
          { x: enemy.x, y: enemy.y - 0.45 },
          { x: enemy.x, y: enemy.y + 0.45 },
        ].find((p) => !g.world.blocked(p.x, p.y, g.removed))!;
        Object.assign(g.player, position);
        clock += 2000;
        const result = authority.attack(
          peer(g),
          Math.atan2(enemy.y - position.y, enemy.x - position.x),
        );
        assert(result.ok, result.reason);
        apply(g, result);
      }
      assert(
        g.removed.has(generated.id),
        `${generated.id}: room death reached the personal ledger.`,
      );
    }
    assert.equal(
      g.deliverExpedition(plan.id).ok,
      false,
      'Clearing the site does not remotely deliver supplies.',
    );
    Object.assign(g.player, plan.giver.point);
    g.inventory.wood = (g.inventory.wood ?? 0) + 60 - g.carried;
    assert.equal(
      g.carried,
      60,
      'A full pack can deliver supplies before receiving its one-slot reward.',
    );
    const before = {
      inventory: { ...g.inventory },
      coins: g.player.coins,
      xp: g.progression.xp[plan.reward.practice.profession],
    };
    assert.equal(g.deliverExpedition(plan.id).ok, true);
    for (const [id, amount] of Object.entries(plan.cost)) {
      assert.equal(
        g.inventory[id as keyof typeof g.inventory] ?? 0,
        before.inventory[id as keyof typeof g.inventory]! - amount!,
      );
    }
    assert(g.player.coins >= before.coins + plan.reward.coins);
    assert.equal(
      g.progression.xp[plan.reward.practice.profession],
      before.xp + plan.reward.practice.amount,
    );
    const loot = g.artifacts.find((a) => a.design === plan.reward.artifactDesign)!;
    assert(loot, 'The promise materializes as an actual item in this body’s inventory.');
    assert.equal(loot.genome.category, 'implement');
    assert.equal(g.equipArtifact(loot.design).ok, true);
    assert.equal(g.techniques.length, 2, 'Generated implement grants its actual delivery family.');
    const family =
      loot.genome.delivery === 'contact'
        ? 'sword'
        : loot.genome.delivery === 'projectile'
          ? 'bow'
          : 'staff';
    assert(
      g.techniques.every((t) => t.weapon === family),
      'Equipped implement delivery overrides the body’s ordinary weapon family.',
    );
    g.equip('staff');
    assert(g.carried <= 60);
    const saved = g.save();
    g = Stichos.restore(saved);
    const afterRestore = g.save();
    assert.equal(g.deliverExpedition(plan.id).ok, false, 'Reload cannot duplicate delivery.');
    assert.deepEqual(g.save(), afterRestore, 'Duplicate attempt has no side effect.');
    g.setSharedWorld(true);
    g.setSharedCombat(true, room);
  }
  assert.deepEqual(
    g.expeditionProgress.records.map((r) => r.claimed),
    [true, true, true],
  );
  for (const attunement of ['momentum', 'precision', 'renewal'] as const)
    assert(g.attuneExpedition(attunement));
  const checkpoint = authority.checkpoint();
  const restoredAuthority = new SharedCombat(g.world, new Set(), { now: () => clock });
  restoredAuthority.restore(checkpoint);
  for (const plan of plans)
    for (const n of plan.enemies) assert(restoredAuthority.snapshot().dead.includes(n.id));
});

test('reward fallback still guarantees an equippable pulse implement when the first addressed candidates fail', () => {
  const g = new Stichos(107, 4),
    plan = g.expeditions.find((p) => p.kind === 'garden')!;
  const reward = generateArtifact(plan.reward.artifactDesign);
  assert.equal(reward.category, 'implement');
  assert.equal(reward.delivery, 'pulse');
});

test('an initially unarmed life can use the actual contact implement technique family', () => {
  const g = new Stichos(42, 4),
    plan = g.expeditions.find((p) => p.kind === 'road')!;
  const saved = g.save();
  saved.player.appearance.weapon = 'none';
  saved.artifactPacks = [
    {
      bodyId: g.bodyId,
      designs: [plan.reward.artifactDesign],
      equipped: plan.reward.artifactDesign,
    },
  ];
  const armed = Stichos.restore(saved);
  assert.equal(armed.player.appearance.weapon, 'none', 'Owned ordinary equipment remains intact.');
  assert.equal(armed.displayAppearance.weapon, 'sword');
  assert.deepEqual(
    armed.techniques.map((t) => t.id),
    ['crescent', 'faultline'],
  );
});

test('all six technique preparations release actual authority hits after their own windup and retain cooldown on restart', () => {
  for (const t of TECHNIQUES) {
    const g = attuned('renewal', t.weapon),
      a = arena(g, fixtureEnemies(g, 3));
    g.setSharedWorld(true);
    g.setSharedCombat(true, room);
    apply(g, a.tick(0.01));
    const start = a.authority.technique(peer(g), 0, t.id);
    assert(start.ok, `${t.id}: ${start.reason}`);
    assert.equal(start.hits.length, 0, 'Preparation is not an instant impact.');
    assert(start.snapshot.casts?.some((c) => c.technique === t.id));
    const hits = [] as SharedCombatFrame['hits'];
    for (let i = 0; i < Math.ceil((t.windup + 0.4) / 0.02); i++) {
      const frame = a.tick(0.02);
      apply(g, frame);
      hits.push(...frame.hits);
    }
    assert(
      hits.some((h) => h.technique === t.id && h.target === 'npc'),
      `${t.id} releases and collides.`,
    );
    assert(a.authority.snapshot().enemies.some((n) => n.hp < n.maxHp && (n.stagger ?? 0) > 0));
    assert.equal(
      a.authority.technique(peer(g), 0, t.id).ok,
      false,
      'Release does not bypass recovery.',
    );
    const stored = a.authority.checkpoint(),
      resumed = arena(g, fixtureEnemies(g, 3));
    resumed.authority.restore(stored);
    assert.equal(
      resumed.authority.technique(peer(g), 0, t.id).ok,
      false,
      'Authority restart retains paid recovery.',
    );
  }
});

test('momentum discounts exactly one technique after Step; ordinary walking does not create credit', () => {
  const g = attuned('momentum');
  const original = g.player.stamina;
  g.update(0.1, { x: 1, y: 0, run: false });
  assert(g.technique('pulse').ok);
  assert.equal(g.player.stamina, original - 20);
  for (let i = 0; i < 50; i++) g.update(0.1, idle);
  assert(g.dodge());
  const afterStep = g.player.stamina;
  assert(g.technique('pulse').ok);
  assert.equal(g.player.stamina, afterStep - 16);
  // A different ready technique uses the same one-use credit; directly accepted actions
  // model network acknowledgement without advancing the simulation or stamina recovery.
  const afterFirst = g.player.stamina;
  assert(g.commitTechnique('bloom', 0, g.bodyId).ok);
  assert.equal(g.player.stamina, afterFirst - 32);
});

test('precision checks actual pre-existing stagger, while renewal credits one cast despite three arrow impacts and receipt replays', () => {
  const damages: number[] = [];
  for (const stagger of [0, 2]) {
    const g = attuned('precision'),
      npcs = fixtureEnemies(g);
    npcs[0].stagger = stagger;
    const a = arena(g, npcs);
    a.tick(0.01);
    assert(a.authority.technique(peer(g), 0, 'pulse').ok);
    const hits: SharedCombatFrame['hits'] = [];
    for (let i = 0; i < 12; i++) hits.push(...a.tick(0.02).hits);
    damages.push(hits.find((h) => h.technique === 'pulse')!.damage);
  }
  const expected = attuned('precision').weaponProfile('staff').damage * 0.8;
  assert.deepEqual(damages, [Math.round(expected), Math.round(expected * 1.15)]);
  let g = attuned('renewal', 'bow');
  const a = arena(g, fixtureEnemies(g));
  g.setSharedWorld(true);
  g.setSharedCombat(true, room);
  apply(g, a.tick(0.01));
  g.player.breath = 40;
  g.player.warmth = 40;
  assert(a.authority.technique(peer(g), 0, 'fan').ok);
  const frames: SharedCombatFrame[] = [];
  for (let i = 0; i < 20; i++) {
    const f = a.tick(0.02);
    frames.push(f);
    apply(g, f);
  }
  assert.equal(frames.flatMap((f) => f.hits).filter((h) => h.technique === 'fan').length, 3);
  assert.equal(g.player.breath, 44);
  assert.equal(g.player.warmth, 44);
  g = Stichos.restore(g.save());
  g.setSharedWorld(true);
  g.setSharedCombat(true, room);
  for (const f of frames) apply(g, f);
  assert.equal(g.player.breath, 44, 'Benefit receipts survive save and same-room reconnect.');
  assert.equal(g.player.warmth, 44);
});

test('generated relay warden locks a visible bearing and changes its real release geometry below half health', () => {
  const g = new Stichos(42, 4),
    plan = g.expeditions.find((p) => p.kind === 'relay')!;
  const generated = plan.enemies.find((n) => n.id.includes(':warden:'))!;
  for (const injured of [false, true]) {
    const authority = new SharedCombat(g.world, new Set());
    Object.assign(g.player, { x: generated.x - 0.5, y: generated.y });
    authority.tick(0.01, [peer(g)]);
    const checkpoint = authority.checkpoint();
    checkpoint.snapshot.enemies = checkpoint.snapshot.enemies.filter((n) => n.id === generated.id);
    const staged: SharedEnemy = checkpoint.snapshot.enemies[0];
    staged.cooldown = 0;
    staged.hp = injured ? Math.floor(staged.maxHp * 0.49) : staged.maxHp;
    checkpoint.records = [structuredClone(staged)];
    authority.restore(checkpoint);
    const warning = authority
      .tick(0.01, [peer(g)])
      .snapshot.enemies.find((n) => n.id === generated.id)!.intent!;
    assert.equal(warning.shape, injured ? 'radial' : 'line');
    assert(warning.duration > 1);
    const hits: SharedCombatFrame['hits'] = [];
    for (let i = 0; i < 160; i++) hits.push(...authority.tick(0.01, [peer(g)]).hits);
    assert(
      hits.some(
        (h) =>
          h.actorId === generated.id && h.target === 'peer' && h.damage === (injured ? 15 : 12),
      ),
    );
  }
});

test('solo fan arrows share one renewal token without changing deterministic physical damage', () => {
  const results: { hp: number; warmth: number; breath: number }[] = [];
  for (const attunement of ['momentum', 'renewal'] as const) {
    const g = attuned(attunement, 'bow'),
      npcs = fixtureEnemies(g);
    g.world.npcsAround = () => npcs;
    g.npcs = npcs;
    Object.assign(g.player, { breath: 40, warmth: 40, heading: 0 });
    assert(g.technique('fan', npcs[0]).ok);
    for (let i = 0; i < 20; i++) g.update(0.02, idle);
    results.push({
      hp: g.npcs.find((n) => n.id === npcs[0].id)!.hp,
      warmth: g.player.warmth,
      breath: g.player.breath,
    });
  }
  assert(results[0].hp < 1000);
  assert.equal(results[1].hp, results[0].hp);
  assert(Math.abs(results[1].warmth - results[0].warmth - 4) < 1e-8);
  assert(Math.abs(results[1].breath - results[0].breath - 4) < 1e-8);
});

test('shared botanical telegraphs use the synchronized night clock and keep their promised geometry across a clock change', () => {
  const g = new Stichos(42, 4),
    plan = g.expeditions.find((p) => p.kind === 'garden')!;
  const generated = plan.enemies.find((n) => n.id.includes(':cultivator:'))!;
  const ranges: number[] = [];
  for (const elapsed of [0, 13 * 60]) {
    const authority = new SharedCombat(g.world, new Set());
    Object.assign(g.player, { x: generated.x - 0.5, y: generated.y });
    authority.tick(0.01, [peer(g)]);
    const checkpoint = authority.checkpoint();
    checkpoint.snapshot.enemies = checkpoint.snapshot.enemies.filter((n) => n.id === generated.id);
    checkpoint.snapshot.enemies[0].cooldown = 0;
    checkpoint.records = structuredClone(checkpoint.snapshot.enemies);
    authority.restore(checkpoint);
    authority.setWorldTime(elapsed);
    const frame = authority.tick(0.01, [peer(g)]);
    const promised = frame.snapshot.enemies.find((n) => n.id === generated.id)!.intent!;
    ranges.push(promised.range);
    authority.setWorldTime(elapsed === 0 ? 13 * 60 : 0);
    const next = authority
      .tick(0.01, [peer(g)])
      .snapshot.enemies.find((n) => n.id === generated.id)!.intent!;
    assert.equal(
      next.range,
      promised.range,
      'An advertised danger radius cannot change underneath the player.',
    );
    assert.equal(next.duration, promised.duration);
  }
  assert.deepEqual(ranges, [2.75, 3.25]);
});

test('warm catalog queries are bounded and never repeat terrain placement work', (t) => {
  const g = new Stichos(42, 4),
    catalog = new ExpeditionCatalog(g.world);
  const coldStart = performance.now();
  catalog.plansAround(0, 5, 96);
  const coldMs = performance.now() - coldStart;
  let tileQueries = 0;
  const original = g.world.tile.bind(g.world);
  g.world.tile = (...args) => {
    tileQueries++;
    return original(...args);
  };
  const started = performance.now();
  for (let i = 0; i < 100; i++) assert(catalog.enemiesAround(0, 5, 32).length <= 48);
  const warmMs = performance.now() - started;
  assert.equal(
    tileQueries,
    0,
    'Warm observer updates reuse addressed placement instead of A* or terrain queries.',
  );
  assert(catalog.cacheSize <= 12);
  t.diagnostic(
    JSON.stringify({
      coldMs,
      warm100QueriesMs: warmMs,
      warmTileQueries: tileQueries,
      cachedTowns: catalog.cacheSize,
    }),
  );
});
