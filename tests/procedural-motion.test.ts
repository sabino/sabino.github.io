import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleMotion, solveTwoBone } from '../src/procedural/motion.ts';
import type { Locomotion, MotionSample, SpeciesGenome, V3 } from '../src/procedural/schema.ts';

const distance = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const near = (actual: number, expected: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const sample: MotionSample = {
  position: { x: 0, y: 0, z: 0 },
  heading: 0,
  speed: 1,
  time: 0,
  phase: 0,
  grounded: true,
};
function species(mode: Locomotion = 'stride', count = 4): SpeciesGenome {
  return {
    version: 1,
    seed: 1,
    id: 'test',
    name: 'Test',
    role: 'grazer',
    locomotion: mode,
    nodes: [0, 1, 2].map((id) => ({
      id,
      parent: id ? id - 1 : null,
      offset: { x: id ? 0.4 : 0, y: 0, z: 0 },
      radius: 0.2,
      length: 0.4,
    })),
    appendages: Array.from({ length: count }, (_, id) => ({
      id,
      parent: id % 3,
      kind: 'leg',
      side: id % 2 ? 1 : -1,
      length: 0.8,
      phase: id / count,
    })),
    color: '#abc',
    accent: '#def',
    eyes: 3,
    pattern: 0,
    mass: 2,
    speed: 1,
    jump: 4,
    perception: 2,
    temperament: 0.3,
    affinity: 'growth',
    gait: { frequency: 2, stride: 0.4, lift: 0.18, duty: 0.65, wave: 1 },
    capabilities: ['walk'],
    explanation: 'Test body',
  };
}

test('two-bone IK preserves link lengths for reachable, distant, near and coincident goals', () => {
  const hip = { x: 2, y: 3, z: -1 };
  for (const [a, b] of [
    [1, 1],
    [0.25, 1.5],
    [1.5, 0.25],
    [0, 1],
    [1, 0],
    [0, 0],
  ]) {
    for (const target of [
      hip,
      { x: 2.01, y: 3, z: -1 },
      { x: 20, y: -8, z: 4 },
      { x: 2.3, y: 3.4, z: -0.8 },
    ]) {
      const pose = solveTwoBone(hip, target, a, b, -1);
      near(distance(hip, pose.joint), a);
      near(distance(pose.joint, pose.tip), b);
      assert.ok(distance(hip, pose.tip) <= a + b + 1e-7);
      assert.ok(distance(hip, pose.tip) >= Math.abs(a - b) - 1e-7);
    }
  }
  const reached = solveTwoBone(hip, { x: 2.3, y: 3.4, z: -0.8 }, 1, 1, 1);
  near(distance(reached.tip, { x: 2.3, y: 3.4, z: -0.8 }), 0);
});

test('IK bend changes knee side without changing target and invalid numbers remain finite', () => {
  const hip = { x: 0, y: 1, z: 0 },
    target = { x: 0, y: 0, z: 0 };
  const left = solveTwoBone(hip, target, 0.8, 0.8, -1);
  const right = solveTwoBone(hip, target, 0.8, 0.8, 1);
  assert.ok(left.joint.x < 0 && right.joint.x > 0);
  assert.deepEqual(left.tip, right.tip);
  const invalid = solveTwoBone({ x: NaN, y: Infinity, z: 0 }, target, NaN, -10, 1);
  assert.ok(Object.values(invalid).flatMap(Object.values).every(Number.isFinite));
});

test('sampler is deterministic, accumulates parent offsets, and does not mutate the genome', () => {
  const genome = species();
  const before = structuredClone(genome);
  const pose = sampleMotion(genome, sample);
  assert.deepEqual(pose, sampleMotion(genome, sample));
  assert.deepEqual(genome, before);
  near(pose.nodes[2].position.x - pose.nodes[0].position.x, 0.8);
  const reordered = { ...genome, nodes: [...genome.nodes].reverse() };
  assert.deepEqual(sampleMotion(reordered, sample).nodes.reverse(), pose.nodes);
});

test('straight-line planted stance cancels root travel with distance-driven phase', () => {
  const genome = species('stride', 1);
  const first = sampleMotion(genome, { ...sample, phase: 0.1 * Math.PI * 2 });
  const traveled = genome.gait.stride * 0.2;
  const next = sampleMotion(genome, {
    ...sample,
    position: { x: traveled, y: 0, z: 0 },
    phase: 0.3 * Math.PI * 2,
  });
  assert.ok(first.limbs[0].planted && next.limbs[0].planted);
  near(distance(first.limbs[0].tip, next.limbs[0].tip), 0);
  const swing = sampleMotion(genome, { ...sample, phase: 0.82 * Math.PI * 2 });
  assert.ok(!swing.limbs[0].planted && swing.limbs[0].tip.y > 0.05);
});

test('heading rotates the complete articulated pose, including knee poles', () => {
  const genome = species();
  const first = sampleMotion(genome, sample);
  const turned = sampleMotion(genome, { ...sample, heading: Math.PI / 2 });
  for (let i = 0; i < first.limbs.length; i++)
    for (const key of ['hip', 'joint', 'tip'] as const) {
      near(turned.limbs[i][key].x, -first.limbs[i][key].z);
      near(turned.limbs[i][key].z, first.limbs[i][key].x);
      near(turned.limbs[i][key].y, first.limbs[i][key].y);
    }
});

test('all five modes handle zero and arbitrary odd leg counts with finite bounded limbs', () => {
  for (const mode of ['stride', 'skitter', 'hop', 'slither', 'hover'] as const) {
    for (const count of [0, 1, 3, 7, 13])
      for (const phase of [0, 1, 3, 5, -10, 1e6])
        for (const speed of [0, 0.01, 1, 5]) {
          const genome = species(mode, count);
          const pose = sampleMotion(genome, { ...sample, speed, phase });
          assert.equal(pose.limbs.length, count);
          for (const limb of pose.limbs) {
            assert.ok(
              [limb.hip, limb.joint, limb.tip].flatMap(Object.values).every(Number.isFinite),
            );
            near(distance(limb.hip, limb.joint), 0.8 * 0.52);
            near(distance(limb.joint, limb.tip), 0.8 * 0.48);
            if (limb.planted) near(limb.tip.y, 0, 0.02);
          }
        }
  }
});

test('slither articulates connected body segments and preserves their lengths', () => {
  const genome = species('slither', 0);
  const first = sampleMotion(genome, sample);
  const next = sampleMotion(genome, { ...sample, phase: 2 });
  assert.notDeepEqual(first.nodes, next.nodes);
  for (let i = 1; i < first.nodes.length; i++)
    near(distance(first.nodes[i - 1].position, first.nodes[i].position), 0.4);
  assert.deepEqual(
    sampleMotion(genome, { ...sample, speed: 0, phase: 0 }).nodes,
    sampleMotion(genome, { ...sample, speed: 0, phase: 3 }).nodes,
  );
});

test('hop has synchronized flight, hover suspends, and airborne legs never claim contact', () => {
  const hop = species('hop', 7);
  const flight = sampleMotion(hop, { ...sample, phase: 0.82 * Math.PI * 2 });
  assert.ok(flight.limbs.every((limb) => !limb.planted));
  assert.ok(flight.nodes[0].position.y > sampleMotion(hop, sample).nodes[0].position.y);
  assert.ok(sampleMotion(species('hover'), sample).limbs.every((limb) => !limb.planted));
  assert.ok(
    sampleMotion(species(), { ...sample, grounded: false }).limbs.every((limb) => !limb.planted),
  );
});

test('wings, antennae and tendrils articulate without acquiring ground contact', () => {
  const genome = species('hover', 3);
  genome.appendages.forEach((limb, i) => {
    limb.kind = (['wing', 'antenna', 'tendril'] as const)[i];
  });
  const first = sampleMotion(genome, sample);
  const next = sampleMotion(genome, { ...sample, time: 0.13 });
  assert.ok(first.limbs.every((limb) => !limb.planted));
  assert.notDeepEqual(first.limbs, next.limbs);
});
