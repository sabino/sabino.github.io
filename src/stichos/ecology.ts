import { deriveSeed, mix, random } from '../procedural/random.ts';
import type { ArchitecturalCulture, Biome, RockMaterial, Terrain, TreeForm } from './types.ts';

export const STICHOS_CLIMATE_SEED = 0x53544943;
export type RegionalBiome = Exclude<Biome, 'settlement'>;
export interface RegionalClimate {
  elevation: number;
  moisture: number;
  regionalCold: number;
  coldness: number;
  temperature: number;
  geothermal: number;
  biome: RegionalBiome;
  weights: Record<string, number>;
}
export interface EcologyProfile {
  treeForm: TreeForm;
  rockMaterial: RockMaterial;
  treeDensity: number;
  rockDensity: number;
  herbDensity: number;
  groundCover: number;
}
export type ClimateNoise = (x: number, y: number, scale: number, address: string) => number;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const ramp = (a: number, b: number, v: number) => smooth(clamp((v - a) / (b - a)));
const unit = (seed: number, address: string) => deriveSeed(seed, address) / 0xffffffff;

/** Addressed continuous fields. No chunk random state, downloaded map or stored base terrain. */
export function regionalClimate(
  seed: number,
  x: number,
  y: number,
  noise: ClimateNoise,
): RegionalClimate {
  const wx = x + (noise(x, y, 317, 'v4-warp-x') - 0.5) * 140;
  const wy = y + (noise(x, y, 431, 'v4-warp-y') - 0.5) * 140;
  const elevation = smooth(
    noise(wx, wy, 173, 'v4-elevation') * 0.7 +
      noise(wx, wy, 61, 'v4-folds') * 0.23 +
      noise(wx, wy, 19, 'v4-rock-folds') * 0.07,
  );
  const moisture = clamp(
    smooth(
      noise(wx + 151, wy - 83, 263, 'v4-rainfall') * 0.76 +
        noise(wx, wy, 83, 'v4-local-rain') * 0.24,
    ) +
      (unit(seed, 'v4-ocean-cycle') - 0.5) * 0.14 -
      Math.max(0, elevation - 0.65) * 0.3,
  );
  const fault = smooth(
    noise(wx - 251, wy + 171, 389, 'v4-hotspots') * 0.76 + noise(wx, wy, 137, 'v4-faults') * 0.24,
  );
  const geothermal = ramp(0.63, 0.86, fault);
  const canonical = seed === STICHOS_CLIMATE_SEED;
  const latitude = Math.abs(
    Math.sin(((y + (canonical ? 0 : unit(seed, 'v4-latitude-phase') * 16000)) * Math.PI) / 16000),
  );
  const mean = canonical ? -5 : mix(16, 36, unit(seed, 'v4-solar-energy'));
  const localHeat =
    noise(wx - 73, wy + 311, 347, 'v4-temperature') * 0.78 +
    noise(wx, wy, 113, 'v4-local-heat') * 0.22;
  const temperature =
    mean -
    latitude * (canonical ? 18 : 33) +
    (localHeat - 0.5) * 25 -
    elevation * 17 +
    geothermal * 32;
  const coldness = clamp((12 - temperature) / 35);
  const regionalCold = clamp(latitude * 0.68 + (1 - localHeat) * 0.32);
  const wet = ramp(0.57, 0.81, moisture);
  const dry = 1 - ramp(0.22, 0.46, moisture);
  const cold = 1 - ramp(-8, 6, temperature);
  const frozen = 1 - ramp(-17, -4, temperature);
  const warm = ramp(4, 19, temperature);
  const high = ramp(0.59, 0.81, elevation);
  const low = 1 - ramp(0.38, 0.65, elevation);
  const forestMoisture = ramp(0.29, 0.55, moisture) * (1 - wet * 0.6);
  const volcanic = ramp(0.42, 0.88, geothermal);
  const live = 1 - volcanic * 0.9;
  const weights: Record<RegionalBiome, number> = {
    frostwood: cold * (1 - frozen * 0.9) * forestMoisture * (1 - high) * live,
    tundra: (frozen + cold * (1 - forestMoisture) * 0.5) * (1 - high * 0.75) * live,
    marsh: wet * low * cold * (1 - frozen) * live,
    highlands: high * (1 - cold) * (1 - dry * warm * 0.75) * live,
    woodland: (1 - cold) * forestMoisture * (1 - high) * (1 - dry) * live,
    meadow: (1 - cold) * (1 - wet) * (1 - dry * warm) * (1 - high) * 0.38 * live,
    wetland: wet * low * (1 - cold) * 1.8 * live,
    dunes: dry * warm * (1 - high) * (1 - ramp(0.38, 0.65, elevation)) * 1.9 * live,
    badlands: dry * warm * ramp(0.3, 0.67, elevation) * live,
    volcanic: volcanic * 1.5,
    alpine: high * cold * 1.6 * live,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const biome of Object.keys(weights) as RegionalBiome[]) weights[biome] /= total;
  const biome = (Object.keys(weights) as RegionalBiome[]).reduce(
    (best, candidate) => (weights[candidate] > weights[best] ? candidate : best),
    'meadow',
  );
  return {
    elevation,
    moisture,
    regionalCold,
    coldness,
    geothermal,
    temperature: Number(temperature.toFixed(2)),
    biome,
    weights,
  };
}

export function ecologyProfile(c: RegionalClimate): EcologyProfile {
  const w = (biome: RegionalBiome) => c.weights[biome] ?? 0;
  const volcanic = w('volcanic');
  const treeForm: TreeForm =
    c.temperature < 4
      ? 'conifer'
      : c.biome === 'volcanic'
        ? 'snag'
        : c.biome === 'wetland'
          ? 'willow'
          : c.biome === 'dunes'
            ? c.moisture < 0.21
              ? 'cactus'
              : 'palm'
            : c.biome === 'badlands' || (c.biome === 'meadow' && c.moisture < 0.44)
              ? 'acacia'
              : 'broadleaf';
  const rockMaterial: RockMaterial =
    c.geothermal > 0.46
      ? 'basalt'
      : c.biome === 'dunes' || c.biome === 'badlands'
        ? 'sandstone'
        : c.elevation > 0.65
          ? c.moisture > 0.52
            ? 'slate'
            : 'granite'
          : c.moisture > 0.62
            ? 'limestone'
            : 'granite';
  return {
    treeForm,
    rockMaterial,
    treeDensity:
      (w('woodland') * 0.24 +
        w('frostwood') * 0.2 +
        w('wetland') * 0.1 +
        w('meadow') * 0.035 +
        w('badlands') * 0.012 +
        w('dunes') * 0.008) *
      (1 - volcanic),
    rockDensity:
      w('highlands') * 0.16 +
      w('alpine') * 0.1 +
      w('volcanic') * 0.12 +
      w('badlands') * 0.1 +
      w('tundra') * 0.015,
    herbDensity:
      0.003 +
      (w('woodland') + w('wetland') + w('marsh') + w('meadow') + w('frostwood')) * 0.035 +
      volcanic * 0.01,
    groundCover: clamp(
      (w('woodland') + w('frostwood') + w('meadow') + w('wetland') + w('marsh')) * 1.2,
    ),
  };
}

export function regionalTerrain(c: RegionalClimate): Terrain {
  // Lakes depend on drainage and rainfall, not a biome paint threshold. Ice uses actual temperature.
  if (c.elevation < 0.31 && c.moisture > 0.57) return c.temperature < -1 ? 'ice' : 'water';
  if (c.temperature < -5 && c.geothermal < 0.55) return 'snow';
  if (c.biome === 'volcanic') return 'basalt';
  if (c.biome === 'dunes' || c.biome === 'badlands') return 'sand';
  if ((c.biome === 'wetland' || c.biome === 'marsh') && c.moisture > 0.68) return 'mud';
  if (c.biome === 'highlands' && c.moisture < 0.43) return 'basalt';
  return 'grass';
}

const color = (rgb: readonly number[], shift: number) =>
  '#' +
  rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v + shift)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
export function architecturalCulture(
  seed: number,
  c: RegionalClimate,
  clan: number,
  accent: string,
  origin = false,
): ArchitecturalCulture {
  const rng = random(deriveSeed(seed, 'v4-local-building-craft', clan));
  const style: ArchitecturalCulture['style'] =
    origin && c.temperature < 3
      ? 'gothic'
      : c.geothermal > 0.56
        ? 'basalt'
        : c.temperature < -6 || c.biome === 'alpine'
          ? 'alpine'
          : c.biome === 'wetland' || c.biome === 'marsh'
            ? 'stilt'
            : c.moisture < 0.4 && c.temperature > 5
              ? 'adobe'
              : c.biome === 'woodland' || c.biome === 'frostwood' || c.biome === 'meadow'
                ? 'timber'
                : 'gothic';
  const palettes = {
    gothic: [
      [110, 134, 139],
      [48, 77, 87],
      [105, 88, 69],
    ],
    timber: [
      [135, 111, 78],
      [60, 86, 69],
      [79, 62, 49],
    ],
    adobe: [
      [178, 137, 94],
      [128, 79, 61],
      [99, 72, 47],
    ],
    stilt: [
      [107, 132, 111],
      [60, 87, 85],
      [85, 80, 55],
    ],
    basalt: [
      [97, 102, 109],
      [64, 62, 73],
      [102, 77, 62],
    ],
    alpine: [
      [130, 145, 143],
      [64, 80, 91],
      [99, 79, 67],
    ],
  } as const;
  const palette = palettes[style];
  return {
    seed: deriveSeed(seed, 'v4-architecture'),
    style,
    wallMaterial:
      style === 'adobe'
        ? 'adobe'
        : style === 'basalt'
          ? 'basalt'
          : style === 'timber' || style === 'stilt'
            ? 'timber'
            : 'stone',
    roof:
      style === 'adobe'
        ? rng() > 0.4
          ? 'terraced'
          : 'flat'
        : style === 'basalt'
          ? 'terraced'
          : style === 'alpine' || style === 'gothic'
            ? 'steep'
            : 'gable',
    wallColor: color(palette[0], (rng() - 0.5) * 20),
    roofColor: color(palette[1], (rng() - 0.5) * 18),
    woodColor: color(palette[2], (rng() - 0.5) * 18),
    accentColor: accent,
    window:
      style === 'gothic' ? 'arch' : style === 'adobe' || style === 'basalt' ? 'slit' : 'square',
    raised: style === 'stilt',
  };
}
