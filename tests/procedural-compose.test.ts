import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLaws, generateSpecies, generateWeapon } from '../src/procedural/compose.ts';
import { sampleMotion } from '../src/procedural/motion.ts';
import type { SpeciesGenome } from '../src/procedural/schema.ts';

function finite(value: unknown, path = 'genome'): void {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} must be finite`);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) finite(child, `${path}.${key}`);
}

test('world laws and separately addressed content reproduce exactly from their seeds', () => {
  for (const seed of [0, 1, 93, 0x71a3, 0xffffffff]) {
    const laws = generateLaws(seed);
    assert.deepEqual(laws, generateLaws(seed));
    assert.deepEqual(generateSpecies(seed, laws), generateSpecies(seed, laws));
    assert.deepEqual(generateWeapon(seed, laws), generateWeapon(seed, laws));
    const species = generateSpecies(seed, laws);
    generateWeapon(seed + 999, laws);
    assert.deepEqual(
      generateSpecies(seed, laws),
      species,
      'equipment generation must not consume anatomy randomness',
    );
    assert.ok(laws.gravity >= 6 && laws.gravity <= 14);
    assert.ok(laws.moisture >= 0 && laws.moisture <= 1);
    assert.ok(laws.radiation >= 0 && laws.radiation <= 1);
    finite(laws);
  }
  assert.notDeepEqual(generateLaws(0), generateLaws(1));
});

test('generated bodies have connected acyclic parent graphs and valid limb anchors', () => {
  const graphSignatures = new Set<string>();
  const nodeCounts = new Set<number>();
  const limbCounts = new Set<number>();
  let branches = 0;
  for (let seed = 0; seed < 500; seed++) {
    const genome = generateSpecies(seed, generateLaws(seed));
    finite(genome);
    assert.equal(genome.nodes[0].parent, null);
    assert.deepEqual(genome.nodes[0].offset, { x: 0, y: 0, z: 0 });
    assert.equal(genome.nodes.filter((node) => node.parent === null).length, 1);
    assert.equal(new Set(genome.nodes.map((node) => node.id)).size, genome.nodes.length);
    for (const node of genome.nodes.slice(1)) {
      assert.ok(node.parent !== null && node.parent >= 0 && node.parent < node.id);
      let current = node;
      const seen = new Set<number>();
      while (current.parent !== null) {
        assert.ok(!seen.has(current.id), 'body attachment cycle');
        seen.add(current.id);
        current = genome.nodes[current.parent];
      }
      assert.equal(current.id, 0);
      if (node.parent !== node.id - 1) branches++;
      assert.ok(node.offset.x > 0 && node.radius >= 0.16 && node.radius <= 0.5);
      assert.ok(node.length >= 0.3 && node.length <= 0.9);
    }
    for (const limb of genome.appendages) {
      assert.ok(genome.nodes.some((node) => node.id === limb.parent));
      assert.ok(limb.phase >= 0 && limb.phase < 1);
      assert.ok([-1, 0, 1].includes(limb.side));
      assert.ok(limb.length > 0 && limb.length <= 1.2);
    }
    const legAnchors = genome.appendages
      .filter((part) => part.kind === 'leg')
      .map((part) => `${part.parent}/${part.side}`);
    assert.equal(
      new Set(legAnchors).size,
      legAnchors.length,
      'support legs must not duplicate one anchor',
    );
    nodeCounts.add(genome.nodes.length);
    limbCounts.add(genome.appendages.length);
    graphSignatures.add(
      JSON.stringify(
        genome.nodes.map((node) => [node.parent, node.offset, node.radius, node.length]),
      ),
    );
    assert.match(genome.color, /^#[0-9a-f]{6}$/);
    assert.match(genome.accent, /^#[0-9a-f]{6}$/);
  }
  assert.equal(nodeCounts.size, 5);
  assert.ok(limbCounts.size > 12);
  assert.ok(
    graphSignatures.size > 490,
    'content must vary body structure/proportions, not just a name',
  );
  assert.ok(branches > 50, 'parent graphs should include lateral branching');
});

test('all five movement strategies obey the anatomy and available lift under gravity', () => {
  const modes = new Set<string>();
  for (let seed = 0; seed < 1000; seed++) {
    const laws = generateLaws(seed),
      genome = generateSpecies(seed, laws);
    modes.add(genome.locomotion);
    const legs = genome.appendages.filter((part) => part.kind === 'leg');
    const wings = genome.appendages.filter((part) => part.kind === 'wing');
    const lift =
      wings.reduce((sum, wing) => sum + wing.length ** 2 * 0.7, 0) * (7 + laws.radiation * 7);
    if (genome.locomotion === 'hover') {
      assert.ok(wings.length >= 2 && lift > genome.mass * laws.gravity * 1.12);
      assert.ok(genome.capabilities.includes('fly'));
    } else assert.ok(lift <= genome.mass * laws.gravity * 1.12 || wings.length < 2);
    if (genome.locomotion === 'slither') assert.equal(legs.length, 0);
    if (genome.locomotion === 'hop') assert.equal(legs.length, 2);
    if (genome.locomotion === 'skitter') assert.ok(legs.length >= 6);
    if (genome.locomotion === 'stride') assert.ok(legs.length >= 2);
    assert.equal(genome.capabilities.includes('jump'), genome.jump > 0);
    assert.ok(genome.speed >= 1 && genome.speed <= 4);
    assert.ok(genome.jump === 0 || (genome.jump >= 3 && genome.jump <= 7));
    assert.ok(
      genome.gait.frequency > 0 &&
        genome.gait.stride > 0 &&
        genome.gait.duty > 0 &&
        genome.gait.duty < 1,
    );
  }
  assert.deepEqual([...modes].sort(), ['hop', 'hover', 'skitter', 'slither', 'stride']);
});

test('gravity can make the same genetic wing structure lose flight rather than relabeling a preset', () => {
  const base = generateLaws(123);
  let lostFlight = 0;
  for (let seed = 0; seed < 400; seed++) {
    const low = generateSpecies(seed, { ...base, gravity: 6 });
    const high = generateSpecies(seed, { ...base, gravity: 14 });
    const wings = (genome: SpeciesGenome) =>
      genome.appendages.filter((part) => part.kind === 'wing');
    assert.deepEqual(
      wings(low),
      wings(high),
      'genetic wings stay the same when only gravity changes',
    );
    if (low.locomotion === 'hover' && high.locomotion !== 'hover') lostFlight++;
  }
  assert.ok(lostFlight >= 10, `expected gravity-dependent lift failures; observed ${lostFlight}`);
});

test('generated ground anatomies can plant every support limb without stretching at rest', () => {
  let groundedLegs = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const genome = generateSpecies(seed, generateLaws(seed));
    if (genome.locomotion === 'hover') continue;
    const pose = sampleMotion(genome, {
      position: { x: 0, y: 0, z: 0 },
      heading: 0,
      phase: 0,
      time: 0,
      speed: 0,
      grounded: true,
    });
    for (const limb of pose.limbs.filter((part) => part.kind === 'leg')) {
      groundedLegs++;
      assert.ok(limb.planted, `seed ${seed}, support limb ${limb.id} must reach ground`);
      assert.ok(Math.abs(limb.tip.y) < 1e-8);
      const genomeLimb = genome.appendages.find((part) => part.id === limb.id)!;
      const distance = (
        a: { x: number; y: number; z: number },
        b: { x: number; y: number; z: number },
      ) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      assert.ok(
        Math.abs(
          distance(limb.hip, limb.joint) + distance(limb.joint, limb.tip) - genomeLimb.length,
        ) < 1e-8,
      );
    }
  }
  assert.ok(groundedLegs > 2000);
});

test('mass derives from actual segment volumes, appendages, and world tissue conditions', () => {
  for (let seed = 0; seed < 100; seed++) {
    const laws = generateLaws(seed),
      genome = generateSpecies(seed, laws);
    const density = 1.8 + laws.gravity * 0.045 + laws.moisture * 0.8 - laws.radiation * 0.3;
    const volume = genome.nodes.reduce(
      (sum, node) => sum + (((4 * Math.PI) / 3) * node.radius ** 2 * node.length) / 2,
      0,
    );
    const limbs = genome.appendages.reduce(
      (sum, part) =>
        sum + part.length * (part.kind === 'leg' ? 0.035 : part.kind === 'wing' ? 0.022 : 0.012),
      0,
    );
    assert.ok(Math.abs(genome.mass - Math.max(0.12, volume * density + limbs)) <= 0.00051);
    assert.ok(genome.explanation.includes(String(genome.nodes.length)));
    assert.ok(genome.explanation.includes(String(laws.gravity)));
  }
});

test('ecological roles agree with derived sensory, mobility, and material capabilities', () => {
  const roles = new Set<string>(),
    names = new Set<string>();
  const required = {
    grazer: 'graze',
    predator: 'hunt',
    pollinator: 'transfer-pollen',
    decomposer: 'decompose',
    conductor: 'conduct-charge',
  };
  for (let seed = 0; seed < 600; seed++) {
    const genome = generateSpecies(seed, generateLaws(seed));
    roles.add(genome.role);
    names.add(genome.name);
    assert.ok(genome.capabilities.includes(required[genome.role]));
    if (genome.role === 'pollinator') assert.ok(genome.capabilities.includes('fly'));
    if (genome.role === 'conductor') assert.equal(genome.affinity, 'charge');
    if (genome.role === 'predator')
      assert.ok(genome.speed > 2 && genome.capabilities.includes('bite'));
    if (genome.role === 'decomposer') assert.ok(genome.capabilities.includes('absorb-organics'));
  }
  assert.equal(roles.size, 5);
  assert.ok(names.size > 590);
});

test('equipment combines continuous material and shape variation with compatible delivery rules', () => {
  const frames = new Set<string>(),
    combinations = new Set<string>(),
    shapes = new Set<string>(),
    materials = new Set<string>();
  for (let seed = 0; seed < 600; seed++) {
    const weapon = generateWeapon(seed, generateLaws(seed));
    finite(weapon);
    frames.add(weapon.frame);
    combinations.add(`${weapon.core}/${weapon.trigger}`);
    shapes.add(JSON.stringify(weapon.shape));
    materials.add(JSON.stringify(weapon.material));
    if (weapon.frame === 'bow') {
      assert.equal(weapon.trigger, 'projectile');
      assert.ok([2, 4].includes(weapon.shape.branches));
    }
    if (weapon.frame === 'edge' || weapon.frame === 'hammer')
      assert.equal(weapon.trigger, 'impact');
    assert.equal(weapon.projectileSpeed > 0, weapon.trigger === 'projectile');
    assert.ok(weapon.damage >= 6 && weapon.damage <= 45 && weapon.reach > 0 && weapon.recovery > 0);
    assert.ok(weapon.power >= 0.35 && weapon.power <= 2.5);
    assert.match(weapon.material.color, /^#[0-9a-f]{6}$/);
    assert.ok(weapon.explanation.includes(`On ${weapon.trigger}`));
    assert.ok(weapon.explanation.includes(weapon.core));
    assert.ok(weapon.explanation.includes(String(weapon.material.density)));
  }
  assert.equal(frames.size, 5);
  assert.equal(combinations.size, 12);
  assert.ok(
    shapes.size > 590 && materials.size > 590,
    'assembled matter and geometry must vary continuously',
  );
});

test('material density causally changes handling while keeping the same chosen weapon structure', () => {
  const base = generateLaws(7);
  let heavierRecovery = 0;
  for (let seed = 0; seed < 100; seed++) {
    const low = generateWeapon(seed, { ...base, gravity: 6 });
    const high = generateWeapon(seed, { ...base, gravity: 14 });
    assert.equal(low.frame, high.frame);
    assert.equal(low.trigger, high.trigger);
    assert.deepEqual(low.shape, high.shape);
    assert.equal(low.core, high.core);
    assert.ok(high.material.density > low.material.density);
    if (high.recovery > low.recovery) heavierRecovery++;
  }
  assert.ok(heavierRecovery > 90);
});

test('mutation of one generated artifact never contaminates future generation', () => {
  const laws = generateLaws(12);
  const species = generateSpecies(99, laws),
    weapon = generateWeapon(99, laws);
  const speciesCopy = structuredClone(species),
    weaponCopy = structuredClone(weapon);
  species.nodes[0].radius = 999;
  species.capabilities.push('impossible');
  weapon.material.density = 999;
  weapon.shape.length = 999;
  assert.deepEqual(generateSpecies(99, laws), speciesCopy);
  assert.deepEqual(generateWeapon(99, laws), weaponCopy);
});
