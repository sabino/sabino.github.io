import type { BodyPose, MotionSample, SpeciesGenome, V3 } from './schema.ts';

const TAU = Math.PI * 2;
const EPS = 1e-9;
const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fract = (value: number) => value - Math.floor(value);
const point = (p: V3): V3 => ({ x: finite(p.x), y: finite(p.y), z: finite(p.z) });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: V3, n: number): V3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const subtract = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (a: V3) => Math.hypot(a.x, a.y, a.z);
const rotate = (p: V3, heading: number): V3 => ({
  x: p.x * Math.cos(heading) - p.z * Math.sin(heading),
  y: p.y,
  z: p.x * Math.sin(heading) + p.z * Math.cos(heading),
});

/** Exact two-link geometry in a stable bend plane; bend's sign chooses the knee side.
 * Unreachable targets return the nearest reachable tip, never stretched bones.
 */
export function solveTwoBone(
  hip: V3,
  target: V3,
  upper: number,
  lower: number,
  bend: number,
): { joint: V3; tip: V3 } {
  const root = point(hip);
  const a = clamp(finite(upper), 0, 1e4);
  const b = clamp(finite(lower), 0, 1e4);
  if (a + b < EPS) return { joint: { ...root }, tip: { ...root } };
  const delta = subtract(point(target), root);
  const rawDistance = length(delta);
  const direction = rawDistance > EPS ? scale(delta, 1 / rawDistance) : { x: 1, y: 0, z: 0 };
  const distance = clamp(rawDistance, Math.max(Math.abs(a - b), EPS), a + b);
  const tip = add(root, scale(direction, distance));
  if (a < EPS) return { joint: { ...root }, tip };
  if (b < EPS) return { joint: { ...tip }, tip };
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  // Project a fixed pole onto the perpendicular plane; avoid a near-parallel pole.
  const pole = Math.abs(direction.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const dot = pole.x * direction.x + pole.y * direction.y + pole.z * direction.z;
  const perpendicular = subtract(pole, scale(direction, dot));
  const bendDirection = scale(
    perpendicular,
    (finite(bend, 1) < 0 ? -1 : 1) / Math.max(EPS, length(perpendicular)),
  );
  return { joint: add(add(root, scale(direction, along)), scale(bendDirection, height)), tip };
}

/** Deterministic kinematic pose; +X forward, +Z lateral, +Y vertical.
 * sample.phase is radians, advanced by 2π * ground distance / gait.stride.
 * appendage.phase is a cycle fraction. Stance cancels straight-line root travel.
 * Arbitrary turning requires persistent foot anchors beyond this stateless API.
 */
export function sampleMotion(species: SpeciesGenome, sample: MotionSample): BodyPose {
  const origin = point(sample.position);
  const heading = finite(sample.heading);
  const phase = finite(sample.phase);
  const time = finite(sample.time);
  const activity = clamp(
    Math.abs(finite(sample.speed)) / Math.max(0.1, finite(species.speed, 1)),
    0,
    1,
  );
  const moving = Math.abs(finite(sample.speed)) > 0.001;
  const stride = clamp(finite(species.gait.stride, 0.4), 0.01, 4);
  const lift = clamp(finite(species.gait.lift, 0.15), 0, 2) * Math.sqrt(activity);
  const wave = clamp(finite(species.gait.wave, 0.8), 0, Math.PI);
  const mode = species.locomotion;
  const duty = clamp(finite(species.gait.duty, 0.65) + (mode === 'skitter' ? -0.1 : 0), 0.2, 0.9);
  const cycle = fract(phase / TAU);
  const legs = species.appendages.filter((limb) => limb.kind === 'leg');
  const radius = Math.max(0.05, ...species.nodes.map((node) => finite(node.radius, 0.2)));
  const shortestLeg = legs.length
    ? Math.min(...legs.map((leg) => Math.max(0.05, finite(leg.length, 0.5))))
    : 0;
  const ride =
    mode === 'hover'
      ? radius + 0.5
      : mode === 'slither'
        ? radius * 0.72
        : shortestLeg
          ? shortestLeg * 0.55 + radius * 0.2
          : radius;
  const flight = mode === 'hop' && cycle >= duty && moving ? (cycle - duty) / (1 - duty) : 0;
  const flightLift = 16 * flight * flight * (1 - flight) * (1 - flight);
  const bob =
    mode === 'hover'
      ? Math.sin(time * 2.1) * 0.045
      : mode === 'hop'
        ? flightLift * lift * 1.8
        : mode === 'slither'
          ? 0
          : Math.cos(phase * 2) * 0.018 * activity;
  const bodyBase = { ...origin, y: origin.y + ride + (sample.grounded ? bob : 0) };
  const byId = new Map(species.nodes.map((node) => [node.id, node]));
  const resting = new Map<number, V3>();
  const posed = new Map<number, V3>();
  const depths = new Map<number, number>();
  const visiting = new Set<number>();
  const resolve = (id: number): V3 => {
    const cached = posed.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return { x: 0, y: 0, z: 0 };
    visiting.add(id);
    const hasParent = node.parent !== null && byId.has(node.parent);
    const parent = hasParent ? resolve(node.parent!) : { x: 0, y: 0, z: 0 };
    const restParent = hasParent ? (resting.get(node.parent!) ?? parent) : parent;
    const depth = hasParent ? (depths.get(node.parent!) ?? 0) + 1 : 0;
    const offset = point(node.offset);
    const yaw = mode === 'slither' ? Math.sin(phase - depth * wave) * 0.48 * activity : 0;
    const position = add(parent, rotate(offset, yaw));
    resting.set(id, add(restParent, offset));
    posed.set(id, position);
    depths.set(id, depth);
    visiting.delete(id);
    return position;
  };
  const world = (p: V3, base = bodyBase) => add(base, rotate(p, heading));
  const nodes = species.nodes.map((node) => ({
    id: node.id,
    position: world(resolve(node.id)),
    radius: node.radius,
    length: node.length,
  }));
  const limbs = species.appendages.map((limb) => {
    const parent = resolve(limb.parent);
    const restParent = resting.get(limb.parent) ?? parent;
    const parentRadius = Math.max(0.01, finite(byId.get(limb.parent)?.radius ?? radius, radius));
    const side = Math.sign(finite(limb.side));
    const reach = clamp(finite(limb.length, 0.5), 0.01, 8);
    const hipLocal = add(parent, { x: 0, y: -parentRadius * 0.35, z: side * parentRadius * 0.5 });
    const hip = world(hipLocal);
    const limbCycle = mode === 'hop' ? cycle : fract(phase / TAU + finite(limb.phase));
    const stance = limbCycle < duty;
    const swing = stance ? 0 : (limbCycle - duty) / (1 - duty);
    const smooth = swing * swing * (3 - 2 * swing);
    const legTravel = moving
      ? stance
        ? stride * (duty / 2 - limbCycle)
        : stride * duty * (smooth - 0.5)
      : 0;
    let target: V3;
    let planted = false;
    if (limb.kind === 'leg') {
      const hover = mode === 'hover' || !sample.grounded;
      const airborneHop = mode === 'hop' && !stance && moving;
      const swingHeight = moving ? lift * 16 * swing * swing * (1 - swing) * (1 - swing) : 0;
      const foot = {
        x: restParent.x + legTravel,
        y: hover ? ride - reach * 0.65 : airborneHop ? flightLift * lift * 1.4 : swingHeight,
        z: restParent.z + side * (parentRadius * 0.5 + reach * 0.4),
      };
      target = world(foot, origin);
      planted = sample.grounded && !hover && (!moving || stance) && !airborneHop;
    } else {
      const oscillation = Math.sin(
        time * Math.max(0.1, finite(species.gait.frequency, 2)) * TAU + finite(limb.phase) * TAU,
      );
      const extent =
        limb.kind === 'wing'
          ? {
              x: -reach * 0.12,
              y: reach * (0.15 + 0.55 * oscillation),
              z: (side || 1) * reach * 0.72,
            }
          : limb.kind === 'antenna'
            ? {
                x: reach * 0.7,
                y: reach * 0.48,
                z: (side || 1) * reach * 0.22 + oscillation * reach * 0.08,
              }
            : {
                x: -reach * 0.4 + oscillation * reach * 0.15,
                y: -reach * 0.45,
                z: (side || 1) * reach * 0.35,
              };
      target = world(add(hipLocal, extent));
    }
    // Solve in the creature frame so the knee pole rotates with its heading.
    const localSolved = solveTwoBone(
      rotate(subtract(hip, origin), -heading),
      rotate(subtract(target, origin), -heading),
      reach * 0.52,
      reach * 0.48,
      side || 1,
    );
    const solved = { joint: world(localSolved.joint, origin), tip: world(localSolved.tip, origin) };
    return {
      id: limb.id,
      kind: limb.kind,
      hip,
      ...solved,
      planted: planted && Math.abs(solved.tip.y - origin.y) < 0.02,
    };
  });
  return { nodes, limbs, facing: heading };
}
