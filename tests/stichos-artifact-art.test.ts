import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactIcon, artifactPixels } from '../src/stichos/artifact-art.ts';
import { generateArtifact } from '../src/stichos/artifacts.ts';
import { humanoidGenome } from '../src/stichos/humanoid-genome.ts';

test('human constructions keep eyes inside the face and connected tailoring proportions', () => {
  const signatures = new Set<string>();
  for (let seed = 0; seed < 1000; seed++) {
    const h = humanoidGenome(seed);
    assert.ok(Object.values(h).every((v) => typeof v === 'boolean' || Number.isFinite(v)));
    assert.ok(h.shoulders > h.waist && h.hem > h.waist);
    assert.ok(h.eyeGap + 0.5 < h.skull && h.jaw < h.skull);
    assert.ok(h.coatBottom > h.beltY && h.stance < h.waist);
    assert.deepEqual(humanoidGenome(seed), h);
    signatures.add(JSON.stringify(h));
  }
  assert.equal(signatures.size, 1000);
});

test('generated object pixels remain connected, bounded and visually diverse across all categories', () => {
  const categories = new Set<string>(),
    silhouettes = new Set<string>();
  for (let seed = 0; seed < 180; seed++) {
    const design = `winter field study ${seed}`,
      p = artifactPixels(design);
    categories.add(generateArtifact(design).category);
    const occupied = [...p.pixels.keys()].filter((i) => p.pixels[i]);
    assert.ok(occupied.length > 30);
    const seen = new Set([occupied[0]]),
      queue = [occupied[0]];
    for (let i = 0; i < queue.length; i++)
      for (const d of [
        -p.width - 1,
        -p.width,
        -p.width + 1,
        -1,
        1,
        p.width - 1,
        p.width,
        p.width + 1,
      ]) {
        const next = queue[i] + d;
        if (p.pixels[next] && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    assert.equal(seen.size, occupied.length, `detached topology: ${design}`);
    for (const i of occupied)
      assert.ok(
        i % p.width > 0 &&
          i % p.width < p.width - 1 &&
          i >= p.width &&
          i < p.width * (p.height - 1),
      );
    assert.ok(Number.isFinite(p.grip.x) && Number.isFinite(p.grip.y));
    silhouettes.add(occupied.join(','));
  }
  assert.equal(categories.size, 3);
  assert.ok(silhouettes.size > 170, 'designs collapse into a finite set of silhouettes');
});

test('cache eviction preserves exact construction and icon uses that same pixel palette', () => {
  const before = artifactPixels('copper moth beneath ice');
  const copy = Array.from(before.pixels),
    palette = [...before.palette];
  for (let i = 0; i < 150; i++) artifactPixels(`cache eviction ${i}`);
  assert.deepEqual(Array.from(artifactPixels('copper moth beneath ice').pixels), copy);
  const icon = artifactIcon('copper moth beneath ice');
  assert.ok(icon.startsWith('data:image/svg+xml;charset=utf-8,'));
  const svg = decodeURIComponent(icon.split(',')[1]);
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
  for (const color of palette.slice(1))
    if (before.pixels.includes(palette.indexOf(color))) assert.ok(svg.includes(color));
  assert.ok(!svg.includes('<script'));
});
