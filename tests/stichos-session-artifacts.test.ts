import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { generateArtifact, type ArtifactDelivery } from '../src/stichos/artifacts.ts';
import { artifactToolKind } from '../src/stichos/labor.ts';
import type { Npc, Point } from '../src/stichos/types.ts';

const designs = new Map<ArtifactDelivery, string>();
for (let i = 0; i < 1000 && designs.size < 4; i++) {
  const g = generateArtifact(`session-example:${i}`);
  if (!designs.has(g.delivery)) designs.set(g.delivery, g.design);
}
assert.equal(designs.size, 4);
function prepared(design = designs.get('contact')!) {
  const game = new Stichos(3886),
    genome = generateArtifact(design);
  Object.assign(game.player, { x: 4, y: 5, coins: 500 });
  game.progression.xp.crafting = 110;
  game.inventory = { ...genome.cost.items };
  return game;
}
function move(game: Stichos, target: Point) {
  game.choose('close');
  for (
    let i = 0;
    i < 300 && Math.hypot(game.player.x - target.x, game.player.y - target.y) > 0.12;
    i++
  ) {
    const dx = target.x - game.player.x,
      dy = target.y - game.player.y,
      d = Math.hypot(dx, dy);
    game.update(Math.min(0.1, d / game.player.speed), { x: dx / d, y: dy / d, run: false });
  }
  assert.ok(Math.hypot(game.player.x - target.x, game.player.y - target.y) < 0.2);
}
function arena(game: Stichos, targets: { x: number; y: number; hostile?: boolean }[]) {
  Object.assign(game.player, {
    x: 0,
    y: 30,
    hp: 80,
    breath: 60,
    warmth: 60,
    stamina: 100,
    attackCooldown: 0,
  });
  const template = game.world.npcsAround(0, 0, 20)[0];
  const actors = targets.map(
    (p, i): Npc => ({
      ...structuredClone(template),
      ...p,
      id: `artifact-arena:${i}`,
      name: `Target ${i}`,
      role: 'raider',
      hostile: p.hostile ?? true,
      hp: 100,
      maxHp: 100,
      speed: 0.1,
      cooldown: 100,
      home: { x: p.x, y: p.y },
    }),
  );
  game.world.npcsAround = () => actors;
  game.npcs = actors;
  return actors;
}

test('arbitrary designs craft their actual generated properties with atomic costs and one physical capacity slot', () => {
  const design = designs.get('contact')!,
    game = prepared(design);
  const candidate = game.nextArtifactDesign,
    preview = game.artifactPreview(design),
    before = game.save();
  assert.equal(preview.ok, true);
  assert.deepEqual(game.save(), before, 'Preview is pure.');
  assert.notEqual(candidate, game.artifactDesign(1));
  const result = game.createArtifact(design);
  assert.equal(result.ok, true);
  assert.equal(game.player.coins, before.player.coins - preview.genome!.cost.coins);
  assert.deepEqual(game.inventory, {});
  assert.equal(game.carried, 1);
  assert.deepEqual(game.activeArtifact, preview.genome);
  assert.equal(game.displayAppearance.artifactDesign, design);
  assert.equal(game.player.appearance.seed, before.player.appearance.seed);
  assert.notEqual(game.nextArtifactDesign, candidate);
  const crafted = game.save();
  assert.equal(game.createArtifact(design).ok, false);
  assert.deepEqual(game.save(), crafted, 'Duplicate design cannot waste supplies.');
  game.equip('staff');
  assert.equal(game.activeArtifact, null);
  assert.equal(game.displayAppearance.artifactDesign, undefined);
  assert.equal(game.artifacts.length, 1);
  assert.equal(game.equipArtifact(design).ok, true);
  const restored = Stichos.restore(game.save());
  assert.deepEqual(restored.artifacts, game.artifacts);
  assert.equal(restored.nextArtifactDesign, game.nextArtifactDesign);
});

test('creation validates design, workbench, practice and exact resources before touching the pack', () => {
  const design = designs.get('contact')!,
    game = prepared(design);
  for (const invalid of ['', 'x'.repeat(65), 'bad\ntext'])
    assert.equal(game.createArtifact(invalid).ok, false);
  game.progression.xp.crafting = 0;
  assert.equal(game.createArtifact(design).ok, false);
  game.progression.xp.crafting = 110;
  move(game, { x: 8, y: 5 });
  assert.equal(game.createArtifact(design).ok, false);
  move(game, { x: 4, y: 5 });
  game.inventory = {};
  const before = game.save();
  assert.equal(game.createArtifact(design).ok, false);
  assert.deepEqual(game.save(), before);
});

test('contact, projectile and pulse implementations use real generated range, damage, cooldown and collision', () => {
  for (const delivery of ['contact', 'projectile', 'pulse'] as const) {
    const design = designs.get(delivery)!,
      game = prepared(design),
      genome = generateArtifact(design);
    assert.equal(game.createArtifact(design).ok, true);
    const targets = arena(game, [
      { x: 0, y: delivery === 'projectile' ? 34 : 31.2 },
      { x: 0, y: 28.8 },
      { x: 1, y: 30, hostile: false },
    ]);
    const health = (index: number) => game.npcs.find((n) => n.id === targets[index].id)!.hp;
    const oldHealth = game.player.hp,
      oldBreath = game.player.breath;
    game.attack(targets[0]);
    assert.equal(game.player.attackCooldown, genome.properties.cooldown);
    if (delivery === 'projectile') {
      assert.equal(targets[0].hp, 100, 'Arrows must travel before hitting.');
      for (let i = 0; i < 10; i++) game.update(0.05, { x: 0, y: 0, run: false });
    }
    assert.equal(
      health(0),
      100 - genome.properties.damage,
      `${delivery}: actual hit uses generated damage`,
    );
    assert.equal(health(1), delivery === 'pulse' ? 100 - genome.properties.damage : 100);
    assert.equal(
      health(2),
      100,
      'Pulse avoids uninvolved people; directional hits aim at their target.',
    );
    assert.ok(
      game.player.hp <= oldHealth + genome.properties.healing &&
        game.player.breath <= oldBreath + genome.properties.breath,
    );
    const hp = health(0);
    game.attack(targets[0]);
    assert.equal(health(0), hp, 'Shared cooldown prevents immediate repeated hits.');
  }
  for (const delivery of ['contact', 'projectile', 'pulse'] as const) {
    const game = prepared(designs.get(delivery)!);
    game.createArtifact(designs.get(delivery)!);
    const [target] = arena(game, [{ x: 0, y: -2 }]);
    Object.assign(game.player, { x: 0, y: 0 });
    assert.ok(game.world.blocked(0, -1), 'The actual cathedral door is closed.');
    game.attack(target);
    for (let i = 0; i < 10; i++) game.update(0.05, { x: 0, y: 0, run: false });
    assert.equal(
      game.npcs.find((n) => n.id === target.id)!.hp,
      100,
      `${delivery} cannot act through the actual closed door.`,
    );
  }
});

test('consumable artifacts restore the specified body resources once and release their pack slot', () => {
  const design = designs.get('consume')!,
    game = prepared(design),
    genome = generateArtifact(design);
  game.createArtifact(design);
  assert.equal(game.equipArtifact(design).ok, false);
  Object.assign(game.player, { hp: 20, breath: 20, warmth: 20 });
  assert.equal(game.useArtifact(design).ok, true);
  assert.equal(game.player.hp, 20 + genome.properties.healing);
  assert.equal(game.player.breath, 20 + genome.properties.breath);
  assert.equal(game.player.warmth, 20 + genome.properties.warmth);
  assert.equal(game.artifacts.length, 0);
  assert.equal(game.carried, 0);
  const before = game.save();
  assert.equal(game.useArtifact(design).ok, false);
  assert.deepEqual(game.save(), before);
});

test('artifacts remain with the original physical body and its notebook after real transfer and return', () => {
  const design = designs.get('contact')!;
  let game = prepared(design);
  game.storyStage = 4;
  game.createArtifact(design);
  const priest = game.bodyId,
    tools = structuredClone(game.tools);
  move(game, { x: 0, y: 5 });
  move(game, { x: 0, y: 0 });
  move(game, { x: -1, y: -1 });
  const target = game.transferCandidates.find((n) => n.role === 'pilgrim')!;
  game.reincarnate(target.id);
  assert.equal(game.artifacts.length, 0);
  assert.equal(game.tools.length, 0);
  assert.equal(game.workProgress, null);
  assert.equal(game.hasNotebook, false);
  const saved = game.save();
  assert.equal(saved.npcs.find((n) => n.id === priest)!.appearance.artifactDesign, design);
  game = Stichos.restore(saved);
  move(game, { x: -1, y: -1 });
  game.reincarnate(priest);
  assert.equal(game.activeArtifact!.design, design);
  assert.deepEqual(game.tools, tools);
  assert.equal(game.displayAppearance.artifactDesign, design);
  assert.equal(game.hasNotebook, true);
});

test('artifact saves regenerate designs and reject forged graphs, invalid equipment, unknown bodies and pack overflow', () => {
  const design = designs.get('contact')!,
    game = prepared(design);
  game.createArtifact(design);
  const valid = game.save();
  for (const mutate of [
    (s: any) => s.artifactPacks[0].designs.push(design),
    (s: any) => (s.artifactPacks[0].bodyId = 'unknown-body'),
    (s: any) => (s.artifactPacks[0].designs[0] = 'invalid\ntext'),
    (s: any) => (s.artifactPacks[0].genome = { properties: { damage: 1e9 } }),
    (s: any) => (s.artifactPacks[0].equipped = 'not-in-pack'),
    (s: any) => {
      s.artifactPacks[0].designs = [designs.get('consume')];
      s.artifactPacks[0].equipped = designs.get('consume');
    },
    (s: any) => (s.inventory.wood = 60),
    (s: any) => (s.inventionSerial = -1),
  ]) {
    const bad = structuredClone(valid);
    mutate(bad);
    assert.throws(() => Stichos.restore(bad));
  }
  const legacy = structuredClone(valid) as Partial<typeof valid>;
  delete legacy.artifactPacks;
  delete legacy.inventionSerial;
  assert.equal(Stichos.restore(legacy).artifacts.length, 0);
});

test('gathering implements affect both real harvest and capacity preflight', () => {
  const design = Array.from({ length: 1000 }, (_, i) => `session-gather:${i}`).find(
      (d) => artifactToolKind(generateArtifact(d)) === 'pickaxe',
    )!,
    game = prepared(design);
  const bonus = generateArtifact(design).properties.harvest;
  assert.ok(bonus > 0);
  game.createArtifact(design);
  const durability = game.artifacts[0].durability!;
  const rock = game.world.propsAround(0, 0, 30).find((p) => p.kind === 'rock')!;
  const neighbor = [
    { x: rock.x + 1, y: rock.y },
    { x: rock.x - 1, y: rock.y },
    { x: rock.x, y: rock.y + 1 },
    { x: rock.x, y: rock.y - 1 },
  ].find((p) => !game.world.blocked(p.x, p.y))!;
  Object.assign(game.player, neighbor);
  game.inventory = { wood: 58 };
  assert.equal(game.interactionAvailability(rock.id).ok, false);
  game.interact(rock.id);
  assert.equal(game.removed.has(rock.id), false);
  game.inventory = { wood: 57 - bonus };
  assert.equal(game.interactionAvailability(rock.id).ok, true);
  for (let i = 0; i < 10 && !game.removed.has(rock.id); i++) {
    game.interact(rock.id);
    for (let j = 0; j < 16; j++) game.update(0.1, { x: 0, y: 0, run: false });
  }
  assert.equal(game.inventory.ore, 2 + bonus);
  assert.equal(game.carried, 60);
  assert.ok(game.artifacts[0].durability! < durability);
  const restored = Stichos.restore(game.save());
  assert.equal(restored.artifacts[0].durability, game.artifacts[0].durability);
  Object.assign(restored.player, { x: 4, y: 5 });
  restored.inventory = { wood: 1, ore: 1 };
  const coins = restored.player.coins;
  assert.equal(restored.repairArtifact(design).ok, true);
  assert.equal(restored.artifacts[0].durability, durability);
  assert.equal(restored.player.coins, coins - 4);
  assert.deepEqual(restored.inventory, {});
});

test('salvage clears physical equipment, replaces one slot with a real material and cannot duplicate it', () => {
  const design = designs.get('contact')!,
    game = prepared(design);
  game.createArtifact(design);
  const carried = game.carried,
    ore = game.inventory.ore ?? 0;
  assert.equal(game.salvageArtifact(design).ok, true);
  assert.equal(game.carried, carried);
  assert.equal(game.inventory.ore, ore + 1);
  assert.equal(game.activeArtifact, null);
  assert.equal(game.displayAppearance.artifactDesign, undefined);
  assert.equal(game.salvageArtifact(design).ok, false);
  assert.equal(game.inventory.ore, ore + 1);
  assert.equal(Stichos.restore(game.save()).artifacts.length, 0);
});

test('an implement chooses a visible delivery pose even on an unarmed body without rewriting its ordinary belongings', () => {
  const design = designs.get('projectile')!,
    g = prepared(design);
  g.player.appearance.weapon = 'none';
  g.createArtifact(design);
  assert.equal(g.player.appearance.weapon, 'none');
  assert.equal(g.displayAppearance.weapon, 'bow');
  assert.equal(g.displayAppearance.artifactDesign, design);
});
