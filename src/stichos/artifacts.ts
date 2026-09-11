import { deriveSeed, random } from '../procedural/random.ts';
import type { ItemId } from './types.ts';

export type ArtifactCategory = 'implement' | 'vessel' | 'botanical';
export type ArtifactDelivery = 'contact' | 'projectile' | 'pulse' | 'consume';
export type ArtifactPrimitive =
  | 'shaft'
  | 'blade'
  | 'branch'
  | 'ring'
  | 'chamber'
  | 'leaf'
  | 'root'
  | 'tine'
  | 'crystal'
  | 'vessel';
export interface ArtifactMaterial {
  name: string;
  hardness: number;
  density: number;
  flexibility: number;
  conductivity: number;
}
export interface ArtifactPart {
  kind: ArtifactPrimitive;
  /** Root -1; every other parent precedes this part. */
  parent: number;
  /** Absolute attachment point. Endpoint = point + angle vector × length. Grip is (0,0). */
  x: number;
  y: number;
  length: number;
  width: number;
  angle: number;
  color: string;
  material: ArtifactMaterial;
}
export interface ArtifactProperties {
  damage: number;
  range: number;
  cooldown: number;
  breath: number;
  warmth: number;
  healing: number;
  harvest: number;
}
export interface ArtifactGenome {
  id: string;
  design: string;
  name: string;
  category: ArtifactCategory;
  delivery: ArtifactDelivery;
  parts: ArtifactPart[];
  color: string;
  properties: ArtifactProperties;
  cost: { coins: number; items: Partial<Record<ItemId, number>> };
  description: string;
}

export const ARTIFACT_CACHE_LIMIT = 128;
const cache = new Map<string, ArtifactGenome>();
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const round = (n: number, digits = 2) => Number(n.toFixed(digits));

export function normalizeArtifactDesign(value: unknown): string {
  if (typeof value !== 'string' || /\p{Cc}/u.test(value))
    throw new Error('A design must be plain text.');
  const design = value.normalize('NFC').trim();
  if (!design || Array.from(design).length > 64)
    throw new Error('Use one to sixty-four characters for the design.');
  return design;
}

function color(hue: number, saturation: number, lightness: number) {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const h = (((hue % 360) + 360) % 360) / 60,
    x = c * (1 - Math.abs((h % 2) - 1));
  const rgb =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round((v + lightness - c / 2) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Measures the visible assembly. No item-name lookup participates in its mechanics. */
export function measureArtifact(parts: readonly ArtifactPart[]): {
  category: ArtifactCategory;
  delivery: ArtifactDelivery;
  properties: ArtifactProperties;
} {
  if (!parts.length) throw new Error('An artifact needs a physical assembly.');
  let mass = 0,
    edge = 0,
    foliage = 0,
    reservoir = 0,
    conductor = 0,
    recoil = 0,
    root = 0,
    reach = 0,
    warm = 0;
  let chambers = 0,
    rings = 0;
  for (const p of parts) {
    const volume = p.length * p.width;
    mass += volume * (0.2 + p.material.density);
    reach = Math.max(
      reach,
      Math.hypot(p.x + Math.cos(p.angle) * p.length, p.y + Math.sin(p.angle) * p.length),
    );
    if (['blade', 'tine', 'crystal'].includes(p.kind))
      edge += p.length * (0.15 + p.material.hardness) * (1 + p.width / 12);
    if (p.kind === 'leaf') foliage += volume * (0.25 + p.material.flexibility);
    if (p.kind === 'root') root += volume;
    if (p.kind === 'vessel' || p.kind === 'chamber') reservoir += volume;
    if (p.kind === 'chamber') chambers++;
    if (p.kind === 'ring') rings++;
    conductor +=
      volume * p.material.conductivity * (p.kind === 'ring' || p.kind === 'crystal' ? 2 : 0.15);
    recoil +=
      p.length * p.material.flexibility * (p.kind === 'branch' || p.kind === 'shaft' ? 1 : 0.1);
    warm +=
      volume *
      (1 - p.material.conductivity) *
      (p.kind === 'root' || p.kind === 'chamber' ? 1 : 0.08);
  }
  const category: ArtifactCategory =
    foliage + root * 0.8 > edge * 5 + reservoir * 0.65 + recoil * 3
      ? 'botanical'
      : reservoir > edge * 2 + foliage * 0.4 + recoil * 2 && reservoir > 130
        ? 'vessel'
        : 'implement';
  const delivery: ArtifactDelivery =
    category !== 'implement'
      ? 'consume'
      : chambers > 0 && recoil > 12 && reservoir > 35
        ? 'projectile'
        : rings > 0 && conductor > 65
          ? 'pulse'
          : 'contact';
  const consume = delivery === 'consume';
  return {
    category,
    delivery,
    properties: {
      damage: consume ? 0 : Math.round(clamp(3 + edge * 0.08 + mass * 0.006, 4, 25)),
      range: consume
        ? 0
        : round(
            clamp(
              delivery === 'projectile'
                ? 4 + recoil * 0.04 + reach * 0.035
                : delivery === 'pulse'
                  ? 1.7 + conductor * 0.002
                  : 0.8 + reach * 0.025,
              1,
              delivery === 'contact' ? 3 : delivery === 'pulse' ? 4 : 10,
            ),
          ),
      cooldown: round(clamp(0.4 + mass * 0.0012 + reach * 0.003 - recoil * 0.001, 0.4, 1.8)),
      breath: Math.round(
        clamp((foliage * 0.055 + conductor * 0.025) * (consume ? 1 : 0.12), 0, consume ? 60 : 8),
      ),
      warmth: Math.round(
        clamp((warm * 0.13 + reservoir * 0.025) * (consume ? 1 : 0.1), 0, consume ? 60 : 6),
      ),
      healing: Math.round(
        clamp(
          (root * 0.045 + foliage * 0.035 + reservoir * 0.015) * (consume ? 1 : 0.1),
          consume ? 5 : 0,
          consume ? 60 : 5,
        ),
      ),
      harvest: consume ? 0 : Math.floor(clamp((edge + root * 0.12) / 65, 0, 3)),
    },
  };
}

/** A graph-rewriting grammar over reusable primitives, not a catalog of complete items. */
export function generateArtifact(value: string): ArtifactGenome {
  const design = normalizeArtifactDesign(value),
    cached = cache.get(design);
  if (cached) {
    cache.delete(design);
    cache.set(design, cached);
    return structuredClone(cached);
  }
  const seed = deriveSeed(0x61727466, 'construction', design),
    rng = random(seed);
  const syllables = ['va', 'ren', 'ith', 'sa', 'ol', 'mir', 'ka', 'thel', 'an', 'vyr', 'or', 'eis'];
  const word = () =>
    syllables[Math.floor(rng() * syllables.length)] +
    syllables[Math.floor(rng() * syllables.length)] +
    syllables[Math.floor(rng() * syllables.length)];
  const substanceName = word(),
    hue = rng() * 290 + 15;
  const primary: ArtifactMaterial = {
    name: substanceName,
    hardness: round(0.1 + rng() * 0.85, 3),
    density: round(0.12 + rng() * 0.85, 3),
    flexibility: round(0.08 + rng() * 0.9, 3),
    conductivity: round(0.04 + rng() * 0.95, 3),
  };
  const rootKind: ArtifactPrimitive = rng() < 0.48 ? 'shaft' : rng() < 0.5 ? 'vessel' : 'root';
  const parts: ArtifactPart[] = [
    {
      kind: rootKind,
      parent: -1,
      x: 0,
      y: 0,
      length: round(15 + rng() * 24),
      width: round(rootKind === 'shaft' ? 2 + rng() * 4 : 7 + rng() * 8),
      angle: -Math.PI / 2,
      color: color(hue, 0.16 + rng() * 0.35, 0.35 + rng() * 0.22),
      material: { ...primary },
    },
  ];
  const primitives: ArtifactPrimitive[] = [
    'shaft',
    'blade',
    'branch',
    'ring',
    'chamber',
    'leaf',
    'root',
    'tine',
    'crystal',
    'vessel',
  ];
  const count = 5 + Math.floor(rng() * 20);
  for (let index = 1; index < count; index++) {
    const parent = index === 1 || rng() < 0.32 ? 0 : Math.floor(rng() * index);
    const base = parts[parent];
    const growth = rng();
    const kind =
      base.kind === 'root' && growth < 0.48
        ? 'leaf'
        : base.kind === 'vessel' && growth < 0.4
          ? 'chamber'
          : base.kind === 'shaft' && growth < 0.22
            ? 'branch'
            : primitives[Math.floor(rng() * primitives.length)];
    const material: ArtifactMaterial = {
      name: primary.name,
      hardness: round(clamp(primary.hardness + (rng() - 0.5) * 0.28, 0.05, 1), 3),
      density: round(clamp(primary.density + (rng() - 0.5) * 0.3, 0.05, 1), 3),
      flexibility: round(clamp(primary.flexibility + (rng() - 0.5) * 0.4, 0.05, 1), 3),
      conductivity: round(clamp(primary.conductivity + (rng() - 0.5) * 0.4, 0.02, 1), 3),
    };
    const joint = 0.25 + rng() * 0.75;
    parts.push({
      kind,
      parent,
      x: round(base.x + Math.cos(base.angle) * base.length * joint),
      y: round(base.y + Math.sin(base.angle) * base.length * joint),
      length: round(3 + rng() * (kind === 'branch' || kind === 'blade' ? 23 : 15)),
      width: round(1.2 + rng() * (['leaf', 'vessel', 'chamber', 'ring'].includes(kind) ? 10 : 4)),
      angle: round(base.angle + (rng() - 0.5) * (kind === 'ring' ? 0.5 : 2.7), 4),
      color: color(
        hue + (kind === 'leaf' ? 50 : kind === 'crystal' ? 130 : 0) + (rng() - 0.5) * 30,
        0.25 + material.conductivity * 0.35,
        0.32 + material.hardness * 0.3,
      ),
      material,
    });
  }
  const measured = measureArtifact(parts);
  const volume = (kinds: ArtifactPrimitive[]) =>
    parts.filter((p) => kinds.includes(p.kind)).reduce((n, p) => n + p.length * p.width, 0);
  const items: Partial<Record<ItemId, number>> = {};
  const add = (item: ItemId, amount: number) => {
    if (amount > 0) items[item] = Math.ceil(clamp(amount, 1, 6));
  };
  add('wood', volume(['shaft', 'branch', 'tine']) / 100);
  add('ore', (volume(['blade', 'ring', 'chamber', 'crystal', 'vessel']) * primary.density) / 130);
  add('heartleaf', volume(['leaf']) / 100);
  add('emberroot', volume(['root']) / 120);
  if (measured.properties.breath > 0) add('cequin', measured.properties.breath / 15);
  const coins = Math.round(clamp(8 + parts.length * 1.4 + primary.hardness * 8, 8, 80));
  const label = word(),
    name = label[0].toUpperCase() + label.slice(1);
  const structure = `${parts.length} joined parts in ${primary.name}; ${measured.delivery === 'consume' ? 'a finite preparation held by this body' : measured.delivery === 'projectile' ? 'a flexible drive feeds its chambers' : measured.delivery === 'pulse' ? 'conducting rings distribute a pulse' : 'its shaped edges meet the target directly'}`;
  const genome: ArtifactGenome = {
    id: `artifact:${seed.toString(36)}:${deriveSeed(seed, 'identity', design).toString(36)}`,
    design,
    name,
    ...measured,
    parts,
    color: parts[0].color,
    cost: { coins, items },
    description: `${structure}. Density, cutting edges, reach, reservoirs and living surface determine its effects.`,
  };
  cache.set(design, structuredClone(genome));
  while (cache.size > ARTIFACT_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return genome;
}
