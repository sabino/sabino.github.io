import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weaponGenome,
  weaponPixels,
  weaponProfileFromGenome,
  weaponIcon,
} from '../src/stichos/equipment.ts';

test('component equipment is reproducible, varied, and fully attached to its physical silhouette', () => {
  const signatures = new Set<string>();
  for (const kind of ['staff', 'sword', 'bow'] as const) {
    for (let seed = 1; seed <= 100; seed++) {
      const genome = weaponGenome(seed, kind),
        image = weaponPixels(genome);
      assert.deepEqual(image, weaponPixels(weaponGenome(seed, kind)));
      assert.equal(image.pixels.length, 32 * 64);
      assert(image.pixels.every((c) => c < image.palette.length));
      const solid = [...image.pixels].flatMap((v, i) => (v ? [i] : []));
      assert(solid.length > 80 && solid.length < 1200);
      const queue = [solid[0]],
        reached = new Set(queue);
      for (let i = 0; i < queue.length; i++)
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const x = (queue[i] % 32) + dx,
            y = Math.floor(queue[i] / 32) + dy;
          const p = y * 32 + x;
          if (x < 0 || x >= 32 || y < 0 || y >= 64 || !image.pixels[p] || reached.has(p)) continue;
          reached.add(p);
          queue.push(p);
        }
      assert.equal(reached.size, solid.length, `${kind} ${seed} has detached pixels`);
      signatures.add(Buffer.from(image.pixels).toString('base64'));
    }
  }
  assert(signatures.size > 280, 'Construction should change silhouettes across seeds');
});

test('material mass, length, and core affect the handling and effect used by the simulation', () => {
  const genome = weaponGenome(123, 'staff');
  const base = weaponProfileFromGenome(genome, 1);
  const heavier = weaponProfileFromGenome({ ...genome, density: genome.density * 2 }, 1);
  assert(heavier.cooldown > base.cooldown);
  assert(heavier.damage > base.damage);
  assert.equal(heavier.range, base.range);
  const longer = weaponProfileFromGenome({ ...genome, length: genome.length + 8 }, 1);
  assert(longer.range > base.range);
  assert(longer.cooldown > base.cooldown);
  for (const effect of ['stagger', 'breath', 'warmth'] as const) {
    const profile = weaponProfileFromGenome({ ...genome, effect }, 1);
    assert.equal(profile.effect, effect);
    assert(profile.effectDescription.length > 20);
  }
  const leveled = weaponProfileFromGenome(genome, 3);
  assert.equal(leveled.damage, base.damage + 4);
  assert.equal(leveled.range, base.range);
});

test('rendered equipment icons retain the same stable geometry without external assets', () => {
  const first = weaponIcon(734, 'staff');
  assert.equal(first, weaponIcon(734, 'staff'));
  assert.notEqual(first, weaponIcon(735, 'staff'));
  assert(first.includes('shape-rendering="crispEdges"'));
  assert(!first.includes('<image') && !first.includes('http'));
});
