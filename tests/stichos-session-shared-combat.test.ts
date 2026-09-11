import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import {
  SharedCombat,
  validSharedCombatFrame,
  type SharedCombatFrame,
  type SharedCombatPeer,
} from '../src/stichos/shared-combat.ts';
import { generateArtifact } from '../src/stichos/artifacts.ts';
import { buildCampaign, createCampaignState } from '../src/stichos/campaign.ts';
import type { Npc } from '../src/stichos/types.ts';

const room = '3886:test-room';
const idle = { x: 0, y: 0, run: false };
function game() {
  const g = new Stichos(3886);
  Object.assign(g.player, { x: 0, y: 30, heading: 0 });
  assert.equal(g.world.blocked(0, 30, g.removed), false);
  g.setSharedWorld(true);
  g.setSharedCombat(true, room);
  return g;
}
function frame(seq = 1): SharedCombatFrame {
  return {
    snapshot: { seq, enemies: [], projectiles: [], dead: [], peaceful: [] },
    hits: [],
    deaths: [],
  };
}
function enemy(g: Stichos, hp = 100): Npc {
  const n = structuredClone(g.world.npcsAround(0, 0, 20)[0]);
  return Object.assign(n, {
    id: 'test-raider',
    role: 'raider' as const,
    name: 'Room raider',
    x: 1,
    y: 30,
    home: { x: 1, y: 30 },
    hp,
    maxHp: hp,
    hostile: true,
    cooldown: 0,
  });
}
function peer(g: Stichos, id = 'one'): SharedCombatPeer {
  return {
    id,
    bodyId: g.bodyId,
    x: g.player.x,
    y: g.player.y,
    heading: g.player.heading,
    appearance: g.displayAppearance,
    progression: g.sharedCombatProgression,
    combatActive: true,
  };
}
function apply(g: Stichos, f: SharedCombatFrame, id = 'one') {
  assert.equal(validSharedCombatFrame(f), true, 'Test receipt obeys the actual wire contract.');
  return g.applySharedCombat(f, id);
}

test('actual authority damage is the only shared damage and acknowledged actions spend once', () => {
  const g = game(),
    other = game(),
    n = enemy(g, g.weaponProfile('staff').damage * 2 - 1);
  let clock = 0;
  const authority = new SharedCombat(
    {
      generation: 3,
      blocked: () => false,
      propsAround: () => [],
      npcsAround: () => [structuredClone(n)],
    },
    new Set(),
    { now: () => clock },
  );
  const start = authority.tick(0.01, [peer(g), peer(other, 'two')]);
  apply(g, start);
  apply(other, start, 'two');
  const initial = g.npcs.find((n) => n.id === 'test-raider')!.hp,
    stamina = g.player.stamina;
  g.attack({ x: 1, y: 30 });
  assert.equal(g.npcs.find((n) => n.id === 'test-raider')!.hp, initial);
  assert.equal(g.player.stamina, stamina);
  const intent = g.sharedCombatPreview('attack', { x: 1, y: 30 });
  assert.ok(intent.ok);
  const first = authority.attack(peer(g), intent.heading);
  assert.ok(first.ok);
  apply(g, first);
  apply(other, first, 'two');
  assert.ok(g.commitSharedCombatAction('attack', intent.heading, intent.bodyId).ok);
  assert.equal(g.player.stamina, stamina - 8);
  assert.equal(g.commitSharedCombatAction('attack', intent.heading, intent.bodyId).ok, false);
  assert.equal(g.npcs.find((n) => n.id === 'test-raider')!.hp, initial - first.hits[0].damage);
  assert.equal(
    other.npcs.find((n) => n.id === 'test-raider')!.hp,
    g.npcs.find((n) => n.id === 'test-raider')!.hp,
  );
  const remaining = g.npcs.find((n) => n.id === 'test-raider')!.hp;
  for (let i = 0; i < 20; i++) g.update(0.1, idle);
  assert.equal(g.npcs.find((n) => n.id === 'test-raider')!.hp, remaining);
  assert.equal(g.player.hp, g.player.maxHp, 'Local raider AI cannot inflict an additional strike.');
  const coins = g.player.coins,
    xp = g.player.xp;
  clock += 1000;
  const kill = authority.attack(peer(g), 0);
  assert.equal(kill.deaths.length, 1);
  apply(g, kill);
  apply(other, kill, 'two');
  apply(g, kill);
  assert.equal(g.player.coins, coins + 4);
  assert.equal(g.player.xp, xp + 16);
  assert.equal(
    g.npcs.some((n) => n.id === 'test-raider'),
    false,
  );
  assert.equal(
    other.npcs.some((n) => n.id === 'test-raider'),
    false,
  );
});

test('receipt replay is independent of snapshot order and survives save plus same-room reconnect', () => {
  let g = game();
  const old = frame(1);
  old.snapshot.enemies = [enemy(g)];
  old.hits = [
    {
      id: 2,
      actorId: 'test-raider',
      targetId: 'one',
      targetBodyId: g.bodyId,
      target: 'peer',
      damage: 7,
      kind: 'slash',
      color: '#ffaaaa',
    },
  ];
  const newer = frame(2);
  newer.snapshot.enemies = [enemy(g)];
  newer.snapshot.enemies[0].hp = 41;
  apply(g, newer);
  const hp = g.player.hp;
  assert.equal(apply(g, old).eventId, 2);
  assert.equal(g.player.hp, hp - 7);
  assert.equal(
    g.npcs.find((n) => n.id === 'test-raider')!.hp,
    41,
    'Old receipts cannot roll enemy HP back.',
  );
  g = Stichos.restore(g.save());
  g.setSharedWorld(true);
  g.setSharedCombat(true, room);
  apply(g, newer);
  apply(g, old);
  assert.equal(g.player.hp, hp - 7);
  assert.equal(
    g.npcs.find((n) => n.id === 'test-raider')!.hp,
    41,
    'Equal-sequence welcome restores visuals after reconnect.',
  );
  g.setSharedCombat(false, room);
  g.setSharedCombat(true, room);
  apply(g, old);
  assert.equal(g.player.hp, hp - 7);
  g.setSharedCombat(true, '3886:other-room');
  apply(g, old);
  assert.equal(g.player.hp, hp - 14, 'A different room has an independent event-number space.');
});

test('death receipts cannot farm a second bounty across rooms, reloads, or already-cleared solo enemies', () => {
  let g = game();
  const f = frame();
  f.snapshot.dead = ['test-raider'];
  f.deaths = [
    { id: 3, npcId: 'test-raider', killerId: 'one', killerBodyId: g.bodyId, contributors: ['one'] },
  ];
  const before = g.player.coins;
  apply(g, f);
  assert.equal(g.player.coins, before + 4);
  g = Stichos.restore(g.save());
  g.setSharedCombat(true, '3886:new-room');
  apply(g, f);
  assert.equal(g.player.coins, before + 4);
  const solo = new Stichos(3886);
  solo.removed.add('test-raider');
  solo.setSharedCombat(true, room);
  const oldCoins = solo.player.coins;
  apply(solo, f);
  assert.equal(solo.player.coins, oldCoins);
});

test('late receipts respect target and launch bodies, and posthumous experience cannot revive a lost body', () => {
  const g = game(),
    f = frame();
  Object.assign(g.player, { hp: 50, breath: 50, warmth: 50 });
  f.hits = [
    {
      id: 1,
      actorId: 'raider',
      targetId: 'one',
      targetBodyId: 'old-body',
      target: 'peer',
      damage: 12,
      kind: 'arrow',
      color: '#aabbcc',
    },
    {
      id: 2,
      actorId: 'one',
      actorBodyId: 'old-body',
      targetId: 'raider',
      target: 'npc',
      damage: 10,
      kind: 'arrow',
      color: '#aabbcc',
      effect: 'breath',
    },
  ];
  assert.equal(apply(g, f).eventId, 2);
  assert.equal(g.player.hp, 50);
  assert.equal(g.player.breath, 50);
  const lethal = frame(2);
  lethal.hits = [
    {
      id: 3,
      actorId: 'raider',
      targetId: 'one',
      targetBodyId: g.bodyId,
      target: 'peer',
      damage: 100,
      kind: 'slash',
      color: '#aabbcc',
    },
  ];
  g.player.xp = 30;
  apply(g, lethal);
  assert.equal(g.phase, 'lost');
  const posthumous = frame(3);
  posthumous.snapshot.dead = ['raider'];
  posthumous.deaths = [
    { id: 4, npcId: 'raider', killerId: 'one', killerBodyId: g.bodyId, contributors: ['one'] },
  ];
  apply(g, posthumous);
  assert.equal(g.player.level, 2);
  assert.equal(g.player.hp, 0);
  assert.equal(g.phase, 'lost');
  assert.equal(Stichos.restore(g.save()).phase, 'lost');
});

test('one artifact pulse benefits its launch body once even when it hits several targets', () => {
  const g = game();
  let design = '';
  for (let i = 0; i < 1000; i++) {
    const d = `shared pulse ${i}`,
      a = generateArtifact(d);
    if (
      a.delivery === 'pulse' &&
      a.properties.breath + a.properties.warmth + a.properties.healing > 0
    ) {
      design = d;
      break;
    }
  }
  assert.ok(design);
  const properties = generateArtifact(design).properties;
  Object.assign(g.player, { hp: 40, breath: 40, warmth: 40 });
  const f = frame();
  f.hits = [2, 3].map((id) => ({
    id,
    strikeId: 1,
    actorId: 'one',
    actorBodyId: g.bodyId,
    targetId: `target-${id}`,
    target: 'npc' as const,
    damage: 10,
    kind: 'ward' as const,
    color: '#aabbcc',
    artifactDesign: design,
  }));
  apply(g, f);
  apply(g, f);
  assert.equal(g.player.hp, 40 + properties.healing);
  assert.equal(g.player.breath, 40 + properties.breath);
  assert.equal(g.player.warmth, 40 + properties.warmth);
  const restored = Stichos.restore(g.save());
  restored.setSharedCombat(true, room);
  const extra = frame(2);
  extra.hits = [{ ...f.hits[0], id: 4, targetId: 'late-target' }];
  apply(restored, extra);
  assert.equal(restored.player.hp, g.player.hp);
  assert.equal(restored.player.breath, g.player.breath);
});

test('projectile and windup snapshots animate exact actors without causing local damage', () => {
  const g = game(),
    f = frame();
  const n = enemy(g);
  f.snapshot.enemies = [
    {
      ...n,
      intent: {
        kind: 'arrow',
        heading: Math.PI,
        duration: 0.5,
        remaining: 0.4,
        targetId: 'one',
        range: 7,
        color: '#aabbcc',
        damage: 7,
      },
    },
  ];
  f.snapshot.projectiles = [
    {
      id: 1,
      actorId: n.id,
      owner: 'npc',
      x: 1,
      y: 30,
      heading: Math.PI,
      remaining: 6,
      speed: 7,
      damage: 7,
      color: '#aabbcc',
    },
  ];
  apply(g, f);
  assert.ok(g.effects.some((e) => e.actorId === n.id && e.text === 'Drawing bow'));
  const arrow = g.effects.find((e) => e.kind === 'arrow')!;
  assert.ok(arrow);
  g.update(0.1, idle);
  assert.ok(arrow.x < 1);
  assert.equal(g.player.hp, g.player.maxHp);
  apply(g, frame(2));
  g.update(0.01, idle);
  assert.equal(
    g.effects.some((e) => e.kind === 'arrow' || e.text === 'Drawing bow'),
    false,
  );
});

test('malformed shared frames and damaged receipt ledgers fail closed', () => {
  const g = game(),
    before = g.player.hp,
    f = frame();
  f.hits = [
    {
      id: 1,
      actorId: 'raider',
      targetId: 'one',
      target: 'peer',
      damage: NaN,
      kind: 'slash',
      color: '#aabbcc',
    },
  ];
  assert.equal(g.applySharedCombat(f, 'one').eventId, 0);
  assert.equal(g.player.hp, before);
  const save = g.save();
  save.sharedCombatLedger.receipts = [9];
  save.sharedCombatLedger.acknowledged = 8;
  assert.throws(() => Stichos.restore(save));
});

test('actual shared vault parley remains withdrawn and spends supplies only after a confirmed room truce', () => {
  // A validated in-progress save fixture exercises the adapter, not campaign play duration.
  const base = new Stichos(3886),
    saved = base.save(),
    plan = buildCampaign(base.world),
    step = plan.steps[5];
  assert.ok(step.vault && step.cost);
  saved.storyStage = 4;
  saved.campaign = {
    ...createCampaignState(),
    started: true,
    step: 5,
    evidence: plan.steps.slice(0, 5).map((s) => s.id),
    choices: { 'sallas:02': 'protect' },
  };
  for (const s of plan.steps.slice(0, 5))
    saved.quests.push({
      id: s.id,
      title: s.title,
      description: s.text,
      objective: s.result,
      stage: 1,
      complete: true,
    });
  for (const [id, amount] of Object.entries(step.cost))
    saved.inventory[id as keyof typeof saved.inventory] = amount;
  let footing: { x: number; y: number } | undefined;
  for (const [dx, dy] of [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const p = { x: step.target.x + dx, y: step.target.y + dy };
    if (
      [
        [-0.21, -0.21],
        [0.21, -0.21],
        [-0.21, 0.21],
        [0.21, 0.21],
      ].every(([x, y]) => !base.world.blocked(p.x + x, p.y + y, base.removed))
    ) {
      footing = p;
      break;
    }
  }
  assert.ok(footing);
  Object.assign(saved.player, footing);
  const g = Stichos.restore(saved);
  g.setSharedWorld(true);
  g.setSharedCombat(true, room);
  const authority = new SharedCombat(g.world, new Set(), { now: () => 1000 });
  apply(g, authority.tick(0.01, [{ ...peer(g), combatActive: false }]));
  g.interact(step.target.id);
  const preview = g.sharedParleyPreview();
  assert.ok(preview.ok, preview.message);
  const inventory = { ...g.inventory };
  g.choose('campaign:parley');
  assert.equal(g.campaign.step, 5);
  assert.deepEqual(g.inventory, inventory);
  assert.equal(g.commitSharedParley(preview.stepId, preview.bodyId).ok, false);
  const accepted = authority.parley({ ...peer(g), combatActive: false }, preview.guardIds);
  assert.ok(accepted.ok, accepted.reason);
  apply(g, accepted);
  assert.ok(g.commitSharedParley(preview.stepId, preview.bodyId).ok);
  assert.equal(g.campaign.step, 6);
  for (const [id, amount] of Object.entries(step.cost))
    assert.equal(
      g.inventory[id as keyof typeof g.inventory] ?? 0,
      (inventory[id as keyof typeof inventory] ?? 0) - amount,
    );
  const paid = { ...g.inventory };
  assert.equal(g.commitSharedParley(preview.stepId, preview.bodyId).ok, false);
  assert.deepEqual(g.inventory, paid);
  assert.ok(accepted.snapshot.peaceful.every((id) => preview.guardIds.includes(id)));
  assert.equal(Stichos.restore(g.save()).campaign.step, 6);
});

test('bounded receipt compaction and active Compact knowledge survive the same save without replaying pruned events', () => {
  let g = game();
  const witness = g.winterCompact.plan.projects[0].witnesses[0];
  Object.assign(g.player, { x: witness.x, y: witness.y + 1 });
  assert.ok(g.actCompact({ kind: 'survey', witnessId: witness.id }).ok);
  Object.assign(g.player, { x: 0, y: 30 });
  for (let first = 1; first <= 4100; first += 1000) {
    const f = frame(first);
    for (let id = first; id < first + 1000 && id <= 4100; id++)
      f.hits.push({
        id,
        actorId: 'raider',
        targetId: 'one',
        targetBodyId: 'previous-body',
        target: 'peer',
        damage: 1,
        kind: 'arrow',
        color: '#aabbcc',
      });
    apply(g, f);
  }
  const save = g.save();
  assert.equal(save.sharedCombatLedger.receipts.length, 4096);
  assert.equal(save.sharedCombatLedger.floor, 4);
  assert.equal(save.sharedCombatLedger.acknowledged, 4100);
  assert.deepEqual(save.winterCompact?.state.surveys, [witness.id]);
  g = Stichos.restore(save);
  g.setSharedCombat(true, room);
  const old = frame(1);
  old.hits = [
    {
      id: 2,
      actorId: 'raider',
      targetId: 'one',
      targetBodyId: g.bodyId,
      target: 'peer',
      damage: 12,
      kind: 'arrow',
      color: '#aabbcc',
    },
  ];
  const hp = g.player.hp;
  assert.equal(apply(g, old).eventId, 4100);
  assert.equal(g.player.hp, hp);
  assert.deepEqual(g.winterCompact.state.surveys, [witness.id]);
});
