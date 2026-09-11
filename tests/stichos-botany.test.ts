import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plantGenome,
  plantPixels,
  plantProfile,
  plantProfileFromGenome,
  plantIcon,
} from '../src/stichos/botany.ts';
import type { PlantKind } from '../src/stichos/botany.ts';

const kinds: PlantKind[] = ['cequin', 'heartleaf', 'emberroot', 'mushroom'];
function connected(mask: Uint8Array, width: number, height: number) {
  const solid = [...mask].flatMap((value, index) => (value ? [index] : []));
  assert(solid.length > 0);
  const visited = new Set([solid[0]]),
    queue = [solid[0]];
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % width,
      y = Math.floor(queue[i] / width);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        index = ny * width + nx;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[index] || visited.has(index))
        continue;
      visited.add(index);
      queue.push(index);
    }
  }
  assert.equal(
    visited.size,
    solid.length,
    'all growth must attach to the root rather than float nearby',
  );
  return solid.length;
}

test('plant anatomy and colored pixels reproduce exactly regardless of generation order', () => {
  for (const kind of kinds)
    for (const seed of [0, 1, 7, 42, 0xffffffff]) {
      const genome = plantGenome(seed, kind),
        first = plantPixels(genome);
      plantPixels(plantGenome(seed + 100, kind));
      assert.deepEqual(genome, plantGenome(seed, kind));
      assert.deepEqual(first, plantPixels(plantGenome(seed, kind)));
      assert.deepEqual(plantProfile(seed, kind), plantProfileFromGenome(genome));
    }
});

test('roots, branches, caps and leaves remain connected across many seeds and within the palette', () => {
  for (const kind of kinds)
    for (let seed = 0; seed < 50; seed++) {
      const sprite = plantPixels(plantGenome(seed, kind));
      assert.equal(sprite.pixels.length, sprite.width * sprite.height);
      assert(sprite.pixels.every((pixel) => pixel >= 0 && pixel < sprite.palette.length));
      const mass = connected(sprite.pixels, sprite.width, sprite.height);
      assert(
        mass > 55 && mass < 2000,
        `${kind}/${seed} should retain a readable bounded silhouette`,
      );
      connected(sprite.skeleton, sprite.width, sprite.height);
      assert(
        sprite.pixels[sprite.anchor.y * sprite.width + sprite.anchor.x] > 0,
        'the visible plant retains its rooted anchor',
      );
      for (let i = 0; i < sprite.skeleton.length; i++)
        if (sprite.skeleton[i])
          assert(sprite.pixels[i] > 0, 'shading must not erase the structural core');
    }
});

test('seed variation changes construction and silhouettes while preserving botanical archetypes', () => {
  for (const kind of kinds) {
    const silhouettes = new Set<string>(),
      anatomies = new Set<string>(),
      yields = new Set<number>();
    for (let seed = 1; seed <= 48; seed++) {
      const g = plantGenome(seed, kind),
        sprite = plantPixels(g);
      silhouettes.add(Buffer.from(sprite.pixels.map((p) => (p ? 1 : 0))).toString('base64'));
      anatomies.add(
        JSON.stringify([
          g.stemHeight,
          g.branching,
          g.leafLength,
          g.leafWidth,
          g.leafArrangement,
          g.rootMass,
          g.budCount,
        ]),
      );
      yields.add(plantProfile(seed, kind).yield);
      if (kind === 'cequin')
        assert(g.leafLength >= g.leafWidth * 2, 'cequin must retain rosemary-like needles');
      if (kind === 'heartleaf') assert(g.leafWidth >= 4, 'heartleaf keeps broad leaves');
      if (kind === 'mushroom') {
        assert.equal(g.leafLength, 0);
        assert.equal(g.budShape, 'cap');
      }
    }
    assert(silhouettes.size >= 44, `${kind} should not reduce to a few canned silhouettes`);
    assert(anatomies.size >= 44);
    assert(yields.size >= 2, 'visible biomass should produce useful harvest variation');
  }
});

test('harvest quantity responds causally to visible branches and storage roots', () => {
  const base = {
    ...plantGenome(12, 'emberroot'),
    branching: 3,
    stemHeight: 18,
    rootMass: 1,
    budCount: 0,
  };
  const manyBranches = { ...base, branching: 10 },
    heavyRoots = { ...base, rootMass: 7 };
  const original = plantProfileFromGenome(base);
  assert(plantProfileFromGenome(manyBranches).yield > original.yield);
  assert(plantProfileFromGenome(heavyRoots).yield > original.yield);
  const rootMass = (g: typeof base) =>
    [...plantPixels(g).pixels].filter((p) => p === 3 || p === 4).length;
  assert(
    rootMass(heavyRoots) > rootMass(base),
    'larger yield-bearing roots must be visible, not only metadata',
  );
  assert.notDeepEqual(plantPixels(manyBranches).skeleton, plantPixels(base).skeleton);
  for (const kind of kinds)
    for (let seed = 0; seed < 100; seed++) {
      const g = plantGenome(seed, kind),
        profile = plantProfileFromGenome(g);
      assert([1, 2, 3, 4].includes(profile.yield));
      assert(plantProfileFromGenome({ ...g, rootMass: g.rootMass + 1 }).yield >= profile.yield);
      assert(plantProfileFromGenome({ ...g, branching: g.branching + 1 }).yield >= profile.yield);
    }
});

test('inventory icons share the same deterministic plant construction without external images', () => {
  const icon = plantIcon(981, 'cequin');
  assert.equal(icon, plantIcon(981, 'cequin'));
  assert.notEqual(icon, plantIcon(982, 'cequin'));
  assert(icon.includes('shape-rendering="crispEdges"'));
  assert(!icon.includes('<image') && !icon.includes('http'));
  assert(plantProfile(981, 'cequin').name.toLowerCase().includes('cequin'));
});
