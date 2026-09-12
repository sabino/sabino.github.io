import type { WorldLocationSignal } from './stichos/world-signals.ts';
import type { WorldTimeSignal } from './stichos/world-time.ts';

export type SoundscapeZone =
  | 'wilderness'
  | 'settlement'
  | 'tavern'
  | 'temple'
  | 'workshop'
  | 'home'
  | 'danger';
export type AmbientEventKind = 'bird' | 'insect' | 'fire' | 'work' | 'social';
export type WorldSoundKind = 'bird' | 'grazer' | 'predator' | 'flee' | 'social' | 'work';
export interface WorldSoundEvent {
  kind: WorldSoundKind;
  distance: number;
  pan?: number;
  id?: string;
}
export const AUDIO_LIMITS = Object.freeze({
  transientVoices: 48,
  ambienceVoices: 12,
  eventHistory: 96,
  permanentSources: 10,
  schedulerMs: 100,
  lookAheadSeconds: 0.24,
  maxCatchupNotes: 4,
  worldSoundRadius: 18,
  environmentHz: 2,
  voiceDuckAttack: 0.12,
  voiceDuckRelease: 1.3,
});

export interface SoundscapeFrame {
  zone: SoundscapeZone;
  culture: 'acoustic' | 'resonant' | 'electronic';
  scale: readonly number[];
  pulseSeconds: number;
  noteDensity: number;
  melodyGain: number;
  droneGain: number;
  wind: number;
  windHz: number;
  water: number;
  leaves: number;
  room: number;
  insects: number;
  birds: number;
  fire: number;
  activity: number;
  phase: WorldTimeSignal['phase'];
  variationSeed: number;
}

const clamp = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
const near = (distance: number, radius: number) =>
  Number.isFinite(distance) ? clamp(1 - Math.max(0, distance) / radius) ** 2 : 0;

/** Acoustics use world features, never viewport dimensions or random biome-independent loops. */
export function selectSoundscape(
  location: WorldLocationSignal,
  time: WorldTimeSignal,
  danger = 0,
  seed = 1,
): SoundscapeFrame {
  const indoor = location.interior;
  const zone: SoundscapeZone =
    danger > 0.55
      ? 'danger'
      : indoor
        ? location.buildingKind === 'church'
          ? 'temple'
          : location.buildingKind === 'inn'
            ? 'tavern'
            : location.buildingKind === 'workshop'
              ? 'workshop'
              : 'home'
        : location.settlement
          ? 'settlement'
          : 'wilderness';
  const technology = location.architecture?.technology ?? 0;
  const culture =
    technology >= 0.68
      ? 'electronic'
      : location.architecture?.style === 'gothic' || location.architecture?.style === 'basalt'
        ? 'resonant'
        : 'acoustic';
  const exposed = ['tundra', 'highlands', 'dunes', 'badlands', 'alpine'].includes(location.biome);
  const barren = ['tundra', 'dunes', 'badlands', 'volcanic', 'alpine'].includes(location.biome);
  const warm = location.temperature > 2;
  const daylight = clamp(time.daylight);
  const trees = near(location.featureDistances.trees, 9);
  const workHours = time.hour >= 7 && time.hour < 19;
  const evening = time.hour >= 17 && time.hour < 23;
  const activity =
    indoor && location.buildingKind === 'inn'
      ? evening
        ? 1
        : workHours
          ? 0.5
          : 0.12
      : workHours
        ? 0.7
        : 0.06;
  const scales: Record<SoundscapeZone, readonly number[]> = {
    wilderness: [0, 2, 5, 7, 9],
    settlement: [0, 2, 4, 7, 9],
    tavern: [0, 2, 4, 7, 9],
    temple: [0, 3, 5, 7, 10],
    workshop: [0, 2, 5, 7, 10],
    home: [0, 3, 5, 7, 10],
    danger: [0, 1, 5, 6, 10],
  };
  const tempo =
    zone === 'tavern'
      ? 0.29
      : zone === 'temple'
        ? 0.91
        : zone === 'danger'
          ? 0.26
          : zone === 'workshop'
            ? 0.48
            : 0.66;
  const variationSeed =
    (seed ^
      Math.imul(location.architecture?.seed ?? seed, 0x45d9f3b) ^
      Math.imul(time.day, 0x9e3779b9)) >>>
    0;
  return {
    zone,
    culture,
    scale: scales[zone],
    pulseSeconds: tempo * (0.94 + (variationSeed % 13) / 100),
    noteDensity:
      zone === 'tavern'
        ? 0.85 * activity
        : zone === 'temple'
          ? 0.32
          : zone === 'danger'
            ? 0.78
            : 0.32,
    melodyGain: zone === 'wilderness' ? 0.65 : zone === 'home' ? 0.5 : 1,
    droneGain:
      zone === 'temple' ? 0.12 : zone === 'danger' ? 0.095 : zone === 'tavern' ? 0.018 : 0.045,
    wind: (indoor ? 0.012 : exposed ? 0.11 : 0.06) * (0.83 + 0.17 * clamp(time.nightness)),
    windHz: exposed ? 430 : 760,
    water: near(location.featureDistances.water, 8) * (indoor ? 0.013 : 0.105),
    leaves: indoor ? 0 : trees * 0.036,
    room: indoor ? (zone === 'temple' ? 0.011 : 0.007) : 0,
    insects:
      !indoor && warm && !barren
        ? clamp(location.ecology?.moisture ?? 0.3) * (0.15 + 0.85 * clamp(time.nightness))
        : 0,
    birds:
      !indoor && !barren
        ? (0.25 + trees * 0.75) * (time.phase === 'dawn' ? 1 : daylight * 0.65)
        : 0,
    fire: near(location.featureDistances.fire, 6),
    activity: location.settlement || indoor ? activity : 0,
    phase: time.phase,
    variationSeed,
  };
}

/** Counter-based variation: missed frames do not replay missed sounds or advance a global PRNG. */
export function atmosphereRandom(seed: number, counter: number, salt = 0): number {
  let n = (seed ^ Math.imul(counter + 1, 0x9e3779b9) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function ambientEvents(
  frame: SoundscapeFrame,
  worldSeconds: number,
): Array<{ kind: AmbientEventKind; pan: number; strength: number }> {
  const slice = Math.floor(Math.max(0, worldSeconds) / 2);
  const choices: Array<[AmbientEventKind, number]> = [
    ['bird', frame.birds * 0.38],
    ['insect', frame.insects * 0.33],
    ['fire', frame.fire * 0.55],
    [
      'work',
      frame.zone === 'workshop'
        ? frame.activity * 0.23
        : frame.zone === 'settlement'
          ? frame.activity * 0.09
          : 0,
    ],
    ['social', frame.zone === 'tavern' || frame.zone === 'settlement' ? frame.activity * 0.2 : 0],
  ];
  return choices
    .flatMap(([kind, chance], index) =>
      atmosphereRandom(frame.variationSeed, slice, index) < chance
        ? [
            {
              kind,
              pan: atmosphereRandom(frame.variationSeed, slice, index + 8) * 1.6 - 0.8,
              strength: 0.7 + atmosphereRandom(frame.variationSeed, slice, index + 16) * 0.3,
            },
          ]
        : [],
    )
    .slice(0, 2);
}

export function voiceDuckLevels(active: boolean): {
  music: number;
  ambience: number;
  timeConstant: number;
} {
  return active
    ? { music: 0.28, ambience: 0.48, timeConstant: AUDIO_LIMITS.voiceDuckAttack }
    : { music: 1, ambience: 1, timeConstant: AUDIO_LIMITS.voiceDuckRelease };
}
