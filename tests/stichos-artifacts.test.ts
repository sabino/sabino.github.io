import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTIFACT_CACHE_LIMIT,
  generateArtifact,
  measureArtifact,
  normalizeArtifactDesign,
  type ArtifactPart,
} from '../src/stichos/artifacts.ts';

test('arbitrary addressed designs create hundreds of distinct connected assemblies and all usable affordances', () => {
  const genomes = Array.from({ length: 512 }, (_, i) => generateArtifact(`Vespera/3886/body/${i}`));
  const graphs = new Set<string>(),
    profiles = new Set<string>(),
    categories = new Set<string>(),
    deliveries = new Set<string>(),
    counts = new Set<number>();
  for (const genome of genomes) {
    assert.equal(genome.parts[0].parent, -1);
    assert.ok(genome.parts.length >= 5 && genome.parts.length <= 24);
    assert.deepEqual(
      { category: genome.category, delivery: genome.delivery, properties: genome.properties },
      measureArtifact(genome.parts),
      'Visible construction directly determines the returned gameplay profile.',
    );
    for (const [i, p] of genome.parts.entries()) {
      assert.ok(Number.isInteger(p.parent) && p.parent < i && (i === 0 || p.parent >= 0));
      assert.ok(
        [
          p.x,
          p.y,
          p.angle,
          p.length,
          p.width,
          ...Object.values(p.material).filter((v) => typeof v === 'number'),
        ].every(Number.isFinite),
      );
      assert.ok(p.length > 0 && p.width > 0 && /^#[0-9a-f]{6}$/.test(p.color));
      if (i) {
        const parent = genome.parts[p.parent],
          vx = Math.cos(parent.angle),
          vy = Math.sin(parent.angle);
        const dx = p.x - parent.x,
          dy = p.y - parent.y;
        const along = dx * vx + dy * vy,
          across = Math.abs(dx * vy - dy * vx);
        assert.ok(
          across < 0.012 && along >= -0.01 && along <= parent.length + 0.01,
          'Every component is attached to its actual parent, not scattered independently.',
        );
      }
    }
    const p = genome.properties;
    assert.ok(p.damage >= 0 && p.damage <= 25 && Number.isInteger(p.damage));
    assert.ok(p.range >= 0 && p.range <= 10 && p.cooldown >= 0.4 && p.cooldown <= 1.8);
    assert.ok(
      [p.breath, p.warmth, p.healing, p.harvest].every(
        (v) => Number.isInteger(v) && v >= 0 && v <= 60,
      ),
    );
    assert.ok(p.harvest <= 3);
    if (genome.delivery === 'consume') assert.ok(p.damage === 0 && p.healing > 0);
    else assert.ok(p.damage > 0 && p.range > 0);
    assert.ok(
      Number.isInteger(genome.cost.coins) && genome.cost.coins >= 8 && genome.cost.coins <= 80,
    );
    const costs = Object.values(genome.cost.items);
    assert.ok(costs.length > 0 && costs.every((n) => Number.isInteger(n) && n > 0));
    assert.ok(
      costs.reduce((a, b) => a + b, 0) <= 30,
      'A construction fits within the actual finite pack.',
    );
    graphs.add(JSON.stringify(genome.parts));
    profiles.add(JSON.stringify(p));
    categories.add(genome.category);
    deliveries.add(genome.delivery);
    counts.add(genome.parts.length);
  }
  assert.equal(new Set(genomes.map((g) => g.id)).size, 512);
  assert.equal(graphs.size, 512);
  assert.ok(
    profiles.size > 480 && counts.size === 20,
    'Designs change real measurements and graph size beyond a finite recipe catalog.',
  );
  assert.deepEqual(categories, new Set(['implement', 'vessel', 'botanical']));
  assert.deepEqual(deliveries, new Set(['contact', 'projectile', 'pulse', 'consume']));
});

const part = (kind: ArtifactPart['kind'], extra: Partial<ArtifactPart> = {}): ArtifactPart => ({
  kind,
  parent: -1,
  x: 0,
  y: 0,
  length: 24,
  width: 3,
  angle: -Math.PI / 2,
  color: '#829798',
  material: {
    name: 'Measured test material',
    hardness: 0.5,
    density: 0.4,
    flexibility: 0.4,
    conductivity: 0.2,
  },
  ...extra,
});

test('longer and denser structures change actual reach/recovery while hardness changes impact', () => {
  const short = [part('shaft'), part('blade', { parent: 0, y: -24, length: 20 })];
  const long = structuredClone(short);
  long[0].length = 60;
  long[1].y = -60;
  const a = measureArtifact(short),
    b = measureArtifact(long);
  assert.equal(a.delivery, 'contact');
  assert.equal(b.delivery, 'contact');
  assert.ok(
    b.properties.range > a.properties.range && b.properties.cooldown > a.properties.cooldown,
  );
  const dense = structuredClone(short);
  dense.forEach((p) => (p.material.density = 1));
  assert.ok(measureArtifact(dense).properties.cooldown > a.properties.cooldown);
  const soft = structuredClone(short),
    hard = structuredClone(short);
  soft[1].material.hardness = 0.05;
  hard[1].material.hardness = 1;
  assert.ok(measureArtifact(hard).properties.damage > measureArtifact(soft).properties.damage);
});

test('chambers, flex and conducting rings cause delivery modes; living area determines finite restorative effects', () => {
  const shaft = part('shaft', { length: 40 });
  shaft.material.flexibility = 0.9;
  const blade = part('blade', { parent: 0, y: -40, length: 30 });
  blade.material.hardness = 1;
  const chamber = part('chamber', { parent: 0, y: -20, length: 10, width: 8 });
  assert.equal(measureArtifact([shaft, blade]).delivery, 'contact');
  assert.equal(measureArtifact([shaft, blade, chamber]).delivery, 'projectile');
  const ring = part('ring', { parent: 0, y: -20, length: 14, width: 6 });
  ring.material.conductivity = 1;
  assert.equal(measureArtifact([shaft, blade, ring]).delivery, 'pulse');
  ring.material.conductivity = 0.02;
  assert.equal(measureArtifact([shaft, blade, ring]).delivery, 'contact');
  const root = part('root', { length: 10, width: 2 });
  const leaf = part('leaf', { parent: 0, y: -10, length: 10, width: 4 });
  const small = measureArtifact([root, leaf]);
  const broadLeaf = structuredClone(leaf);
  broadLeaf.length = 24;
  broadLeaf.width = 10;
  const large = measureArtifact([root, broadLeaf]);
  assert.equal(large.category, 'botanical');
  assert.equal(large.delivery, 'consume');
  assert.ok(
    large.properties.breath > small.properties.breath &&
      large.properties.healing > small.properties.healing,
  );
});

test('normalization, call order, caller mutation and bounded cache eviction cannot change a design', () => {
  assert.equal(normalizeArtifactDesign('  Ce\u0301quin · 3886  '), 'Céquin · 3886');
  const original = generateArtifact('Céquin · 3886');
  const modified = generateArtifact('Céquin · 3886');
  modified.parts[0].length = 99999;
  modified.parts[0].material.hardness = 999;
  modified.cost.items.ore = 999;
  for (let i = 0; i < ARTIFACT_CACHE_LIMIT + 32; i++) generateArtifact(`cache/other-world/${i}`);
  assert.deepEqual(generateArtifact('  Ce\u0301quin · 3886  '), original);
  assert.notDeepEqual(generateArtifact('Céquin · 3887').parts, original.parts);
  for (const invalid of ['', ' '.repeat(4), 'x'.repeat(65), 'hidden\ncontrol', '\u0000', null, 12])
    assert.throws(() => normalizeArtifactDesign(invalid));
  assert.doesNotThrow(() => generateArtifact('🌱'.repeat(64)));
});
