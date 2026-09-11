import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { InfiniteWorld, type WorldGeneration } from '../src/stichos/world.ts';

// Captured before the September networking/performance fixes. Covers full tile,
// settlement, prop/resource and NPC data, including procedural appearances/weapons.
const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/world-fingerprints.json', import.meta.url), 'utf8'),
) as { seed: number; generation: WorldGeneration; x: number; y: number; sha256: string }[];
const digest = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
test('performance caches preserve published geography and complete generated content in reverse load order', () => {
  const worlds = new Map<string, InfiniteWorld>();
  for (const f of [...fixtures].reverse()) {
    const key = `${f.seed}:${f.generation}`;
    let world = worlds.get(key);
    if (!world) {
      world = new InfiniteWorld(f.seed, f.generation);
      worlds.set(key, world);
    }
    assert.equal(digest(world.chunk(f.x, f.y)), f.sha256, `${key} chunk ${f.x},${f.y}`);
  }
  for (const f of fixtures)
    assert.equal(digest(worlds.get(`${f.seed}:${f.generation}`)!.chunk(f.x, f.y)), f.sha256);
});
test('evicting chunks and town/noise caches cannot change a revisited world', () => {
  const world = new InfiniteWorld(11, 4);
  const before = digest(world.chunk(0, 0));
  for (let i = 0; i < 180; i++) world.chunk(i * 14 + 100, -i * 15 - 200);
  assert.equal(world.cacheSize, 160);
  assert.equal(digest(world.chunk(0, 0)), before);
});
