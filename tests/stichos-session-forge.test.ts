import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { resolveForge, type ForgeRecipe } from '../src/stichos/forge.ts';
import type { Point } from '../src/stichos/types.ts';
const recipe: ForgeRecipe = { kind: 'staff', material: 1, core: 'breath', span: 'long' };
function prepared() {
  const game = new Stichos(3886);
  Object.assign(game.player, { x: 4, y: 5, coins: 250 });
  game.inventory = { wood: 16, ore: 16, cequin: 8, heartleaf: 8, emberroot: 8 };
  game.progression.xp.crafting = 110;
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

test('forging spends the previewed cost and exact component profile including trained physical upgrades', () => {
  const game = prepared();
  game.progression.xp.combat = 220;
  game.progression.upgrades[game.bodyId] = { staff: 1 };
  const before = game.save(),
    preview = game.forgePreview(recipe);
  assert.equal(preview.ok, true);
  assert.deepEqual(game.save(), before, 'Preview does not mutate state.');
  assert.equal(preview.construction!.genome.material, 'ironbark');
  assert.equal(preview.construction!.genome.effect, 'breath');
  assert.ok(preview.construction!.genome.length >= 48);
  const result = game.forge(recipe);
  assert.equal(result.ok, true);
  assert.equal(game.player.coins, before.player.coins - result.construction!.cost.coins);
  for (const [id, n] of Object.entries(result.construction!.cost.items))
    assert.equal(
      game.inventory[id as keyof typeof game.inventory],
      before.inventory[id as keyof typeof before.inventory]! - n!,
    );
  assert.deepEqual(game.weaponProfile('staff'), preview.construction!.profile);
  assert.equal(game.weaponSeed('staff'), result.construction!.seed);
  assert.equal(game.displayAppearance.weaponSeed, result.construction!.seed);
  assert.equal(game.player.appearance.seed, before.player.appearance.seed);
  const forged = game.save();
  assert.equal(game.forge(recipe).ok, false, 'Identical recipe cannot waste supplies.');
  assert.deepEqual(game.save(), forged);
  const restored = Stichos.restore(forged);
  assert.equal(restored.weaponSeed('staff'), game.weaponSeed('staff'));
  assert.deepEqual(restored.weaponProfile('staff'), game.weaponProfile('staff'));
});

test('forging validates level, real workbench and all costs before mutation, and grants the chosen kind', () => {
  const game = prepared();
  game.progression.xp.crafting = 0;
  assert.equal(game.forgePreview(recipe).ok, false);
  game.progression.xp.crafting = 40;
  move(game, { x: 8, y: 5 });
  assert.equal(game.forgePreview(recipe).ok, false);
  move(game, { x: 4, y: 5 });
  game.inventory = {};
  const before = game.save();
  assert.equal(game.forge(recipe).ok, false);
  assert.deepEqual(game.save(), before);
  game.inventory = { wood: 10, ore: 10, cequin: 6, heartleaf: 6, emberroot: 6 };
  const bow: ForgeRecipe = { kind: 'bow', material: 2, core: 'warmth', span: 'swift' };
  assert.equal(game.weapons.has('bow'), false);
  assert.equal(game.forge(bow).ok, true);
  assert.equal(game.weapons.has('bow'), true);
  assert.equal(game.player.appearance.weapon, 'bow');
  const seed = game.weaponSeed('bow');
  game.equip('staff');
  assert.equal(game.displayAppearance.weaponSeed, undefined);
  game.equip('bow');
  assert.equal(game.displayAppearance.weaponSeed, seed);
});

test('a forged weapon stays visible on its original body and returns with that body after possession', () => {
  let game = prepared();
  game.storyStage = 4;
  assert.equal(game.forge(recipe).ok, true);
  const seed = game.weaponSeed('staff'),
    owner = game.player.appearance.seed;
  move(game, { x: 0, y: 5 });
  move(game, { x: 0, y: 0 });
  move(game, { x: -1, y: -1 });
  const priest = `body:theo-priest:${game.world.seed}`;
  const target = game.transferCandidates.find((n) => n.role === 'pilgrim')!;
  assert.ok(target);
  game.reincarnate(target.id);
  assert.equal(game.occupiedNpcId, target.id);
  const saved = game.save(),
    oldBody = saved.npcs.find((n) => n.id === priest)!;
  assert.equal(oldBody.appearance.seed, owner);
  assert.equal(oldBody.appearance.weaponSeed, seed);
  assert.notEqual(game.weaponSeed('staff'), seed, 'The other body does not acquire a copy.');
  game = Stichos.restore(saved);
  move(game, { x: -1, y: -1 });
  game.reincarnate(priest);
  assert.equal(game.occupiedNpcId, priest);
  assert.equal(game.weaponSeed('staff'), seed);
  assert.equal(game.displayAppearance.weaponSeed, seed);
  assert.equal(game.hasNotebook, true);
});

test('forged save records validate owner identity, exact deterministic recipe, seed and uniqueness', () => {
  const game = prepared();
  game.forge(recipe);
  const valid = game.save();
  const legacy = structuredClone(valid) as Partial<typeof valid>;
  delete legacy.forgedWeapons;
  assert.doesNotThrow(() => Stichos.restore(legacy));
  for (const mutate of [
    (s: typeof valid) => s.forgedWeapons.push({ ...s.forgedWeapons[0] }),
    (s: typeof valid) => (s.forgedWeapons[0].seed ^= 1),
    (s: typeof valid) => (s.forgedWeapons[0].ownerSeed ^= 1),
    (s: typeof valid) => (s.forgedWeapons[0].bodyId = 'nonexistent'),
    (s: typeof valid) => (s.forgedWeapons[0].recipe.span = 'invalid' as ForgeRecipe['span']),
  ]) {
    const bad = structuredClone(valid);
    mutate(bad);
    assert.throws(() => Stichos.restore(bad));
  }
  assert.equal(
    resolveForge(game.player.appearance.seed, recipe)!.seed,
    valid.forgedWeapons[0].seed,
  );
});

test('inactive body appearances retain their learned outfit and forged seed without trusting saved premium ownership', () => {
  const game = prepared();
  game.forge(recipe);
  const body = game.bodyId,
    base = { ...game.player.appearance };
  game.progression.ownedStyles.push('field-botanist');
  game.progression.equippedStyles[body] = 'field-botanist';
  const displayed = game.appearanceForBody(base, body);
  assert.notEqual(displayed.coat, base.coat);
  assert.equal(displayed.weaponSeed, game.weaponSeed('staff'));
  assert.deepEqual(base, game.player.appearance);
  game.progression.equippedStyles[body] = 'aurora-mantle';
  assert.equal(game.appearanceForBody(base, body).coat, base.coat);
  game.setCosmeticEntitlements(['aurora-mantle']);
  assert.notEqual(game.appearanceForBody(base, body).coat, base.coat);
  const restored = Stichos.restore(game.save());
  assert.equal(restored.appearanceForBody(base, body).coat, base.coat);
  assert.equal(restored.appearanceForBody(base, body).weaponSeed, game.weaponSeed('staff'));
});
