import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORGE_CORES,
  FORGE_MATERIALS,
  FORGE_SPANS,
  FORGE_SEARCH_LIMIT,
  forgeCost,
  resolveForge,
  validForgeRecipe,
} from '../src/stichos/forge.ts';
import type { ForgeRecipe } from '../src/stichos/forge.ts';
import {
  weaponGenome,
  weaponProfile,
  weaponProfileFromGenome,
  weaponPixels,
} from '../src/stichos/equipment.ts';

test('all eighty-one component recipes resolve to real generator parts within the fixed search budget', () => {
  const seeds = [3886, 0, 0xffffffff];
  for (const owner of seeds)
    for (const kind of ['staff', 'sword', 'bow'] as const)
      for (const material of [0, 1, 2] as const)
        for (const core of FORGE_CORES)
          for (const span of FORGE_SPANS) {
            const recipe = { kind, material, core: core.id, span: span.id };
            const result = resolveForge(owner, recipe, 3);
            assert.ok(result, JSON.stringify({ owner, recipe }));
            assert.ok(result.attempts >= 1 && result.attempts <= FORGE_SEARCH_LIMIT);
            assert.equal(result.genome.material, FORGE_MATERIALS[kind][material]);
            assert.equal(result.genome.effect, core.id);
            assert.ok(result.genome.length >= span.min && result.genome.length <= span.max);
            assert.equal(result.genome.breadth, span.breadth);
            assert.deepEqual(result.genome, weaponGenome(result.seed, kind));
            assert.deepEqual(result.profile, weaponProfile(result.seed, kind, 3));
            assert.equal(result.cost.items[core.item], 2);
            assert.ok(
              result.cost.items.wood! > 0 && result.cost.items.ore! > 0 && result.cost.coins > 0,
            );
          }
});

test('changing actual frame, material and living core changes handling and visible equipment', () => {
  for (const owner of [4, 3886, 19191])
    for (const kind of ['staff', 'sword', 'bow'] as const) {
      const recipe: ForgeRecipe = { kind, material: 0, core: 'breath', span: 'swift' };
      const frames = FORGE_SPANS.map((s) => resolveForge(owner, { ...recipe, span: s.id })!);
      for (let i = 1; i < frames.length; i++) {
        // A long dagger need not outrange a short needleblade. Hold the other
        // functional parts fixed when testing the physical effect of span.
        const samePartsLonger = weaponProfileFromGenome(
          {
            ...frames[i - 1].genome,
            length: frames[i].genome.length,
            breadth: frames[i].genome.breadth,
          },
          1,
        );
        assert.ok(samePartsLonger.range > frames[i - 1].profile.range);
        assert.ok(samePartsLonger.cooldown > frames[i - 1].profile.cooldown);
        assert.ok(frames[i].cost.items.wood! > frames[i - 1].cost.items.wood!);
        assert.notDeepEqual(
          weaponPixels(frames[i].genome).pixels,
          weaponPixels(frames[i - 1].genome).pixels,
        );
      }
      const light = resolveForge(owner, recipe)!;
      const heavy = resolveForge(owner, { ...recipe, material: 1 })!;
      const denser = weaponProfileFromGenome({ ...light.genome, density: heavy.genome.density }, 1);
      assert.ok(denser.damage >= light.profile.damage);
      assert.ok(denser.cooldown > light.profile.cooldown);
      assert.notDeepEqual(heavy.genome.palette, light.genome.palette);
      const cores = FORGE_CORES.map((c) => resolveForge(owner, { ...recipe, core: c.id })!);
      assert.deepEqual(
        cores.map((c) => c.profile.effect),
        ['stagger', 'breath', 'warmth'],
      );
      assert.equal(new Set(cores.map((c) => c.profile.color)).size, 3);
      assert.equal(new Set(cores.map((c) => c.profile.effectDescription)).size, 3);
    }
});

test('forge resolution is stable across cache eviction, caller mutation and player-level changes', () => {
  const recipe: ForgeRecipe = { kind: 'staff', material: 2, core: 'warmth', span: 'balanced' };
  const original = resolveForge(3886, recipe, 1)!;
  const baseline = structuredClone(original);
  original.genome.palette[3] = '#000000';
  original.cost.items.wood = 999;
  original.recipe.kind = 'bow';
  for (let i = 0; i < 150; i++) assert.ok(resolveForge(i, recipe, 1));
  assert.deepEqual(resolveForge(3886, recipe, 1), baseline);
  const experienced = resolveForge(3886, recipe, 5)!;
  assert.equal(experienced.seed, baseline.seed);
  assert.deepEqual(experienced.genome, baseline.genome);
  assert.deepEqual(experienced.cost, baseline.cost);
  assert.equal(experienced.profile.damage, baseline.profile.damage + 8);
  assert.equal(experienced.profile.range, baseline.profile.range);
  assert.equal(experienced.profile.cooldown, baseline.profile.cooldown);
  assert.notEqual(resolveForge(3887, recipe)!.seed, baseline.seed);
  assert.deepEqual(
    resolveForge(-0xffffffff, recipe),
    resolveForge(1, recipe),
    'Legacy signed owner seeds keep their original 32-bit identity',
  );
});

test('invalid parts cannot produce a preview or recipe cost, including inherited object names', () => {
  const recipe: ForgeRecipe = { kind: 'sword', material: 0, core: 'stagger', span: 'long' };
  for (const part of [
    { kind: 'constructor' },
    { material: -1 },
    { material: 3 },
    { material: '1' },
    { core: 'poison' },
    { span: 'longest' },
  ]) {
    const bad = { ...recipe, ...part };
    assert.equal(validForgeRecipe(bad), false);
    assert.equal(resolveForge(3886, bad as ForgeRecipe), null);
    assert.equal(forgeCost(bad as ForgeRecipe), null);
  }
  assert.equal(resolveForge(NaN, recipe), null);
  assert.equal(resolveForge(0x100000000, recipe), null);
  assert.equal(resolveForge(3886, recipe, 0), null);
  assert.equal(resolveForge(3886, recipe, 1.5), null);
  assert.equal(validForgeRecipe(null), false);
});
