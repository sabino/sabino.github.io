import { clamp, deriveSeed, mix, random } from './random.ts';
import type {
  Appendage,
  BodyNode,
  EcologicalRole,
  Locomotion,
  SpeciesGenome,
  WeaponGenome,
  WorldLaws,
} from './schema.ts';

const rounded = (value: number, places = 3) => Number(value.toFixed(places));
const normalized = (seed: number) => (Number.isFinite(seed) ? seed >>> 0 : 0);
const choose = <T>(values: readonly T[], rng: () => number): T =>
  values[Math.floor(rng() * values.length)];
const integer = (min: number, max: number, rng: () => number) =>
  min + Math.floor(rng() * (max - min + 1));
const affinities = ['heat', 'cold', 'charge', 'growth'] as const;

function syllables(rng: () => number): string {
  const onset = ['v', 'th', 'k', 'm', 'n', 's', 'r', 'zh', 'l', 'br', 'f', 'd'];
  const vowel = ['a', 'e', 'i', 'o', 'u', 'ae', 'io'];
  const coda = ['', '', 'n', 'r', 's', 'th', 'm', 'l', 'k'];
  let result = '';
  for (let i = 0, count = integer(2, 3, rng); i < count; i++)
    result += choose(onset, rng) + choose(vowel, rng) + choose(coda, rng);
  return result[0].toUpperCase() + result.slice(1);
}

function color(hue: number, saturation: number, lightness: number): string {
  const h = (((hue % 360) + 360) % 360) / 360;
  const channel = (offset: number) => {
    const k = (offset + h * 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function affinityFor(laws: WorldLaws, rng: () => number): SpeciesGenome['affinity'] {
  const scores = [
    (laws.temperature + 28) / 100 + rng() * 0.55,
    (32 - laws.temperature) / 100 + rng() * 0.55,
    laws.radiation * 0.8 + rng() * 0.55,
    laws.moisture * 0.8 + rng() * 0.55,
  ];
  return affinities[scores.indexOf(Math.max(...scores))];
}

export function generateLaws(seed: number): WorldLaws {
  seed = normalized(seed);
  const rng = random(deriveSeed(seed, 'physical-laws'));
  return {
    seed,
    gravity: rounded(mix(6, 14, rng())),
    temperature: rounded(mix(-28, 42, rng())),
    moisture: rounded(mix(0.08, 0.98, rng())),
    radiation: rounded(mix(0.03, 1, rng())),
    hue: rounded(rng() * 360),
  };
}

/** Build an anatomy first; locomotion, role and statistics are consequences. */
export function generateSpecies(seed: number, laws: WorldLaws): SpeciesGenome {
  seed = normalized(seed);
  const rng = random(deriveSeed(seed, laws.seed, 'anatomy'));
  const naming = random(deriveSeed(seed, laws.seed, 'species-language'));
  const nodeCount = integer(2, 6, rng);
  const bulk = mix(0.19, 0.37, rng());
  const axialLength = mix(0.35, 0.72, rng());
  const compression = Math.sqrt(10 / laws.gravity);
  const nodes: BodyNode[] = [];
  const elevations: number[] = [];
  for (let id = 0; id < nodeCount; id++) {
    const branched = id > 2 && rng() < 0.25;
    const parent = id === 0 ? null : branched ? integer(0, id - 2, rng) : id - 1;
    const taper = mix(0.74, 1.16, rng());
    nodes.push({
      id,
      parent,
      offset:
        id === 0
          ? { x: 0, y: 0, z: 0 }
          : {
              x: rounded(mix(0.2, 0.42, rng()) * compression),
              y: rounded(mix(-0.04, 0.11, rng())),
              z: rounded(
                branched ? choose([-1, 1], rng) * mix(0.16, 0.4, rng()) : mix(-0.025, 0.025, rng()),
              ),
            },
      radius: rounded(clamp(bulk * taper, 0.16, 0.5)),
      length: rounded(clamp(axialLength * mix(0.75, 1.18, rng()), 0.3, 0.9)),
    });
    // Keep branch attachment heights within a supportable envelope. A random
    // upward offset on every segment must not strand the final pair of feet.
    const parentHeight = parent === null ? 0 : elevations[parent];
    const elevation = rounded(clamp(parentHeight + nodes[id].offset.y, -0.1, 0.22));
    nodes[id].offset.y = rounded(elevation - parentHeight);
    elevations.push(elevation);
  }
  const appendages: Appendage[] = [];
  const add = (
    parent: number,
    kind: Appendage['kind'],
    side: number,
    length: number,
    phase: number,
  ) => {
    appendages.push({
      id: appendages.length,
      parent,
      kind,
      side,
      length: rounded(length),
      phase: rounded(phase % 1),
    });
  };
  // Each choice allocates structural modules, not a finished creature archetype.
  const supportRoll = rng();
  const legPairs =
    supportRoll < 0.22
      ? 0
      : supportRoll < 0.42
        ? 1
        : supportRoll < 0.65
          ? 2
          : integer(Math.min(3, nodeCount), Math.min(5, nodeCount), rng);
  const spring = mix(0.22, 0.95, rng()) * mix(0.8, 1.15, laws.moisture);
  const bodyRadius = Math.max(...nodes.map((node) => node.radius));
  for (let pair = 0; pair < legPairs; pair++) {
    const parent = Math.min(nodeCount - 1, Math.floor((pair * nodeCount) / Math.max(1, legPairs)));
    // The motion solver rides at 55% of its shortest limb plus a small body
    // clearance; allow another 30% for raised attachment and stance margin.
    const supportReach =
      (elevations[parent] + bodyRadius * 0.2 - nodes[parent].radius * 0.35 + 0.025) / 0.3;
    const length = clamp(Math.max(mix(0.42, 1.15, rng()) * compression, supportReach), 0.35, 1.2);
    const phase = legPairs >= 3 ? (pair % 2) * 0.5 : pair / Math.max(1, legPairs);
    add(parent, 'leg', -1, length, phase);
    add(parent, 'leg', 1, length, phase + 0.5);
  }
  const wingPairs = rng() < 0.4 ? integer(1, 2, rng) : 0;
  for (let pair = 0; pair < wingPairs; pair++) {
    const parent = Math.min(nodeCount - 1, pair * 2);
    const length = mix(0.5, 1.2, rng());
    add(parent, 'wing', -1, length, pair * 0.2);
    add(parent, 'wing', 1, length, pair * 0.2);
  }
  const tendrilPairs = integer(0, laws.moisture > 0.6 ? 3 : 2, rng);
  for (let pair = 0; pair < tendrilPairs; pair++) {
    const parent = integer(0, nodeCount - 1, rng);
    const length = mix(0.35, 1.1, rng());
    add(parent, 'tendril', -1, length, rng());
    add(parent, 'tendril', 1, length, rng());
  }
  const antennaCount = integer(0, 4, rng);
  for (let index = 0; index < antennaCount; index++) {
    add(
      nodeCount - 1,
      'antenna',
      antennaCount === 1 ? 0 : index % 2 ? 1 : -1,
      mix(0.18, 0.55, rng()),
      index / Math.max(1, antennaCount),
    );
  }

  const legs = appendages.filter((part) => part.kind === 'leg');
  const wings = appendages.filter((part) => part.kind === 'wing');
  const tendrils = appendages.filter((part) => part.kind === 'tendril');
  const tissueDensity = 1.8 + laws.gravity * 0.045 + laws.moisture * 0.8 - laws.radiation * 0.3;
  const volume = nodes.reduce(
    (sum, node) => sum + (((4 * Math.PI) / 3) * node.radius ** 2 * node.length) / 2,
    0,
  );
  const limbMass = appendages.reduce(
    (sum, part) =>
      sum + part.length * (part.kind === 'leg' ? 0.035 : part.kind === 'wing' ? 0.022 : 0.012),
    0,
  );
  const mass = rounded(Math.max(0.12, volume * tissueDensity + limbMass));
  const meanLeg = legs.reduce((sum, leg) => sum + leg.length, 0) / Math.max(1, legs.length);
  const wingArea = wings.reduce((sum, wing) => sum + wing.length ** 2 * 0.7, 0);
  const liftCapacity = wingArea * (7 + laws.radiation * 7);
  const weight = mass * laws.gravity;
  const canHover = wings.length >= 2 && liftCapacity > weight * 1.12;
  const canHop = legs.length === 2 && (meanLeg * spring) / bulk > 1.35;
  let locomotion: Locomotion;
  if (canHover) locomotion = 'hover';
  else if (!legs.length) locomotion = 'slither';
  else if (canHop) locomotion = 'hop';
  else if (legs.length >= 6) locomotion = 'skitter';
  else locomotion = 'stride';

  const leverage = legs.length ? meanLeg * Math.sqrt(legs.length) : nodes.length * 0.18;
  const powerToMass = (0.9 + leverage + (canHover ? wingArea : 0)) / Math.sqrt(mass + 0.3);
  const speed = rounded(clamp(powerToMass * 1.15 * Math.sqrt(10 / laws.gravity), 1, 4));
  const canJump = legs.length > 0 && !canHover;
  const jump = canJump
    ? rounded(clamp(3 + (spring * meanLeg * 3.5) / Math.sqrt(mass + 0.5), 3, 7))
    : 0;
  const eyes = integer(0, Math.min(6, 2 + antennaCount), rng);
  const perception = rounded(
    clamp(1.4 + eyes * 0.42 + antennaCount * 0.65 + laws.radiation * 0.7, 1.4, 7),
  );
  const temperament = rounded(
    clamp(rng() * 0.65 + speed * 0.05 + laws.radiation * 0.15, 0.05, 0.95),
  );
  const affinity = affinityFor(laws, rng);
  const head = nodes[nodes.length - 1];
  const piercingRatio = head.length / head.radius;
  const capabilities = ['sense', `affinity:${affinity}`];
  if (legs.length) capabilities.push('walk');
  if (canJump) capabilities.push('jump');
  if (locomotion === 'slither') capabilities.push('crawl', 'pass-low-gaps');
  if (canHover) capabilities.push('fly', 'reach-canopy');
  else if (wings.length) capabilities.push('glide');
  if (tendrils.length >= 2) capabilities.push('grasp');
  if (antennaCount) capabilities.push('chemical-sense');
  const canHunt = piercingRatio > 1.7 && speed > 2 && temperament > 0.58;
  let role: EcologicalRole;
  if (affinity === 'charge' && antennaCount >= 2) {
    role = 'conductor';
    capabilities.push('conduct-charge');
  } else if (canHunt) {
    role = 'predator';
    capabilities.push('bite', 'hunt');
  } else if (canHover && (antennaCount > 0 || affinity === 'growth')) {
    role = 'pollinator';
    capabilities.push('transfer-pollen');
  } else if ((tendrils.length >= 2 || locomotion === 'slither') && laws.moisture > 0.45) {
    role = 'decomposer';
    capabilities.push('absorb-organics', 'decompose');
  } else {
    role = 'grazer';
    capabilities.push('graze');
  }
  const frequency = clamp(
    (0.8 + Math.sqrt(laws.gravity / Math.max(meanLeg, 0.35)) * 0.4) / Math.pow(mass + 0.3, 0.12),
    1,
    4.3,
  );
  const gait = {
    frequency: rounded(locomotion === 'hover' ? clamp(frequency + 0.6, 1, 4.5) : frequency),
    stride: rounded(
      clamp((meanLeg || axialLength) * (locomotion === 'hop' ? 0.8 : 0.5), 0.15, 0.7),
    ),
    lift: rounded(clamp((meanLeg || bulk) * (locomotion === 'hop' ? 0.32 : 0.18), 0.08, 0.35)),
    duty: rounded(
      locomotion === 'hover'
        ? 0.4
        : locomotion === 'hop'
          ? 0.42
          : clamp(0.76 - legs.length * 0.025 + mass * 0.025, 0.5, 0.8),
    ),
    wave: rounded(mix(0.6, 1.5, rng())),
  };
  const hueOffset = { heat: 14, cold: 188, charge: 275, growth: 93 }[affinity];
  return {
    version: 1,
    seed,
    id: `sp-${seed.toString(16)}-${deriveSeed(laws.seed, seed, 'identity').toString(16)}`,
    name: syllables(naming),
    role,
    locomotion,
    nodes,
    appendages,
    color: color(
      laws.hue * 0.45 + hueOffset * 0.55 + mix(-24, 24, rng()),
      mix(0.35, 0.65, rng()),
      mix(0.34, 0.53, rng()),
    ),
    accent: color(hueOffset + 35, 0.66, 0.75),
    eyes,
    pattern: integer(0, 3, rng),
    mass,
    speed,
    jump,
    perception,
    temperament,
    affinity,
    gait,
    capabilities,
    explanation:
      `${nodes.length} connected body segments and ${legs.length} support limbs carry ${mass} mass under ${laws.gravity} gravity. ` +
      `${wings.length} wings provide ${rounded(liftCapacity)} lift against ${rounded(weight)} weight; ${canHover ? 'sufficient lift selects hover' : legs.length ? `${legs.length} legs with ${rounded(meanLeg)} mean reach select ${locomotion}` : 'no legs selects a traveling body wave'}. ` +
      `${antennaCount} antennae, ${eyes} eyes and ${tendrils.length} tendrils give perception ${perception}. ${affinity} affinity and these capabilities make it a ${role}.`,
  };
}

/** Assemble functional frame, continuously sampled matter, core and delivery rule. */
export function generateWeapon(seed: number, laws: WorldLaws): WeaponGenome {
  seed = normalized(seed);
  const rng = random(deriveSeed(seed, laws.seed, 'equipment-components'));
  const naming = random(deriveSeed(seed, laws.seed, 'equipment-language'));
  const frame = choose(['edge', 'hammer', 'bow', 'conduit', 'relic'] as const, rng);
  const density = rounded(mix(0.55, 3.5, rng()) * mix(0.9, 1.1, laws.gravity / 14));
  const elasticity = rounded(
    clamp(mix(0.12, 0.94, rng()) + (laws.moisture - 0.5) * 0.08, 0.08, 0.98),
  );
  const conductivity = rounded(
    clamp(mix(0.03, 0.97, rng()) + laws.radiation * 0.12 - elasticity * 0.08, 0.02, 1),
  );
  const materialClass = density > 2.2 ? 'alloy' : elasticity > 0.6 ? 'fiber' : 'glass';
  const material = {
    name: `${syllables(naming)} ${materialClass}`,
    density,
    elasticity,
    conductivity,
    color: color(
      laws.hue + conductivity * 90,
      0.18 + elasticity * 0.25,
      0.35 + (1 - density / 4) * 0.24,
    ),
  };
  const core = affinityFor(laws, rng);
  const trigger: WeaponGenome['trigger'] =
    frame === 'bow'
      ? 'projectile'
      : frame === 'edge' || frame === 'hammer'
        ? 'impact'
        : frame === 'conduit'
          ? conductivity > 0.55 && rng() > 0.35
            ? 'field'
            : 'projectile'
          : choose(['impact', 'projectile', 'field'] as const, rng);
  const shape = {
    length: rounded(mix(0.45, 1.55, rng())),
    width: rounded(mix(0.065, 0.38, rng())),
    branches:
      frame === 'bow'
        ? choose([2, 4], rng)
        : frame === 'hammer'
          ? integer(0, 1, rng)
          : integer(0, 4, rng),
    curvature: rounded(frame === 'bow' ? mix(0.3, 0.85, rng()) : mix(-0.7, 0.7, rng())),
  };
  const inertia = density * shape.length * shape.width * (1 + shape.branches * 0.13);
  const coupling =
    core === 'charge'
      ? 0.35 + conductivity * 1.6 + laws.radiation * 0.4
      : core === 'heat'
        ? 0.5 + density * 0.3 + (laws.temperature + 28) / 100
        : core === 'cold'
          ? 0.65 + (1 - elasticity) * 0.8 + (42 - laws.temperature) / 110
          : 0.5 + elasticity * 0.9 + laws.moisture * 0.7;
  const power = rounded(clamp(coupling * (1 + shape.branches * 0.055), 0.35, 2.5));
  const springEnergy =
    elasticity * shape.length * (1 + Math.abs(shape.curvature)) * (1 + shape.branches * 0.1);
  const projectileSpeed =
    trigger === 'projectile'
      ? rounded(
          clamp(
            5 + Math.sqrt(springEnergy / (density * 0.06 + 0.08)) * 3 + conductivity * 2,
            5,
            18,
          ),
        )
      : 0;
  const edgeFactor =
    frame === 'edge' ? clamp(shape.length / shape.width, 1, 12) * (1 - elasticity * 0.35) : 0;
  const physical =
    trigger === 'impact'
      ? 7 + inertia * (frame === 'hammer' ? 20 : 12) + edgeFactor
      : trigger === 'projectile'
        ? 5 + projectileSpeed * density * 0.5
        : 4 + shape.branches;
  const damage = rounded(clamp(physical + power * 4, 6, 45), 1);
  const reach = rounded(
    clamp(
      shape.length +
        (trigger === 'field'
          ? power * 0.65 + shape.branches * 0.1
          : trigger === 'projectile'
            ? projectileSpeed * 0.11
            : 0.15),
      0.5,
      3.6,
    ),
  );
  const recovery = rounded(
    clamp(
      0.2 +
        Math.sqrt(inertia) * 0.22 +
        shape.branches * 0.026 +
        (trigger === 'field' ? power * 0.12 : 0) -
        elasticity * 0.06,
      0.18,
      0.95,
    ),
  );
  const operation = {
    heat: 'transfer heat and ignite receptive matter',
    cold: 'remove heat and slow living tissue',
    charge: 'conduct a discharge through receptive targets',
    growth: 'stimulate living tissue and organic regrowth',
  }[core];
  return {
    version: 1,
    seed,
    name: `${syllables(naming)} ${frame}`,
    frame,
    material,
    core,
    trigger,
    shape,
    damage,
    reach,
    recovery,
    projectileSpeed,
    power,
    explanation:
      `${material.name}: density ${density} gives inertia ${rounded(inertia)}; elasticity ${elasticity} stores spring energy ${rounded(springEnergy)}; conductivity ${conductivity} couples the ${core} core. ` +
      `${shape.length} length, ${shape.width} width, ${shape.branches} branches and ${shape.curvature} curvature produce ${damage} damage, ${reach} reach and ${recovery}s recovery. ` +
      `On ${trigger}, ${operation} at strength ${power}${trigger === 'projectile' ? `; emission travels at ${projectileSpeed} units/s` : ''}.`,
  };
}
