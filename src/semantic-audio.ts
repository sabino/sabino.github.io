import type { FoleyMaterial } from './foley.ts';

export type AnimalVoice = 'bird' | 'grazer' | 'boar' | 'wolf';
export type AnimalVoiceState =
  | 'idle'
  | 'forage'
  | 'fly'
  | 'flee'
  | 'curious'
  | 'stalk'
  | 'lunge'
  | 'sleep'
  | 'flock'
  | 'herd'
  | 'mating'
  | 'alert'
  | 'attack'
  | 'hurt'
  | 'death';
export const SEMANTIC_AUDIO_LIMITS = Object.freeze({
  sampleRate: 16000,
  buffers: 64,
  maxQueue: 12,
  sliceMs: 3,
  variants: 4,
});
const random = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
/** Original contact microstructure layered quietly under licensed recorded contacts. */
export function surfaceTexture(material: FoleyMaterial, variant = 0, rate = 16000): Float32Array {
  const output = new Float32Array(Math.ceil(rate * 0.22));
  let identity = 0;
  for (const c of material) identity = Math.imul(identity ^ c.charCodeAt(0), 31);
  const rng = random(0x541ec7 ^ (variant * 9187) ^ identity);
  const wet = ['mud', 'wet-earth', 'water', 'puddle'].includes(material);
  const hard = material === 'stone' || material === 'metal';
  const grain =
    material === 'gravel'
      ? 0.035
      : material === 'snow'
        ? 0.24
        : material === 'grass'
          ? 0.14
          : material === 'sand'
            ? 0.1
            : 0.08;
  let smooth = 0,
    previous = 0,
    phase = 0;
  for (let i = 0; i < output.length; i++) {
    const t = i / rate,
      n = rng();
    smooth = smooth * (wet ? 0.88 : 0.52) + n * (wet ? 0.12 : 0.48);
    const envelope =
      Math.min(1, i / 80) *
      Math.exp(-t * (hard ? 35 : material === 'sand' ? 18 : 23)) *
      Math.min(1, (output.length - i) / 100);
    const contact =
      hard || material === 'wood'
        ? Math.sin(
            t * Math.PI * 2 * (material === 'metal' ? 760 : material === 'wood' ? 290 : 165),
          ) * Math.exp(-t * (material === 'wood' ? 45 : 28))
        : 0;
    phase += ((wet ? 340 + 110 * Math.sin(t * 73) : 90) / rate) * Math.PI * 2;
    const bubble = wet
      ? Math.sin(phase) * Math.max(0, Math.sin(t * (material === 'mud' ? 75 : 120))) * 0.22
      : 0;
    const grains =
      Math.abs(n) > 1 - grain ? (n - previous) * (material === 'gravel' ? 0.8 : 0.3) : 0;
    output[i] = (smooth * (hard ? 0.06 : 0.3) + grains + contact * 0.32 + bubble) * envelope * 0.5;
    previous = n;
  }
  return output;
}

/** No speech or formants: species calls have breath, stable anatomy and behavioral envelopes. */
export function* animalCallChunks(
  species: AnimalVoice,
  state: AnimalVoiceState = 'idle',
  variant = 0,
  rate = 16000,
): Generator<void, Float32Array> {
  const urgent = ['flee', 'alert', 'attack', 'lunge', 'hurt'].includes(state);
  const duration =
    state === 'death'
      ? 0.45
      : state === 'hurt'
        ? 0.3
        : species === 'bird'
          ? 0.75
          : species === 'wolf' && !urgent
            ? 1.3
            : 0.65;
  const output = new Float32Array(Math.ceil(rate * duration));
  const rng = random(variant * 131 + species.length * 9181);
  let phase = 0,
    breath = 0;
  const base =
    (species === 'bird'
      ? 2350
      : species === 'grazer'
        ? 215
        : species === 'boar'
          ? 94
          : urgent
            ? 120
            : 245) *
    (0.96 + variant * 0.027);
  for (let i = 0; i < output.length; i++) {
    const t = i / rate,
      u = t / duration;
    breath = breath * 0.7 + rng() * 0.3;
    const bird = species === 'bird';
    const contour = bird
      ? 1 + 0.19 * Math.sin(t * 18) + 0.08 * Math.sin(t * 53)
      : 1 + 0.08 * Math.sin(t * 15) - u * (urgent ? 0.3 : -0.14);
    phase +=
      (base *
        contour *
        (state === 'death' ? 1 - u * 0.6 : state === 'hurt' ? 1.15 : 1) *
        Math.PI *
        2) /
      rate;
    const pulsing = bird
      ? Math.max(0, Math.sin(t * (urgent ? 41 : 26))) ** 2
      : species === 'boar'
        ? 0.5 + 0.5 * Math.sin(t * 31) ** 2
        : 0.8 + 0.2 * Math.sin(t * 22);
    const envelope = Math.sin(Math.PI * u) ** 1.5 * Math.min(1, i / 90, (output.length - i) / 140);
    const harmonic =
      Math.sin(phase) +
      (bird ? 0.06 : 0.28) * Math.sin(phase * 2) +
      (bird ? 0 : 0.11) * Math.sin(phase * 3);
    if (i > 0 && i % 1024 === 0) yield;
    output[i] =
      (harmonic * (bird ? 0.35 : 0.26) + breath * (urgent ? 0.2 : 0.06)) * envelope * pulsing;
  }
  return output;
}

export function animalCall(
  species: AnimalVoice,
  state: AnimalVoiceState = 'idle',
  variant = 0,
  rate = 16000,
): Float32Array {
  const builder = animalCallChunks(species, state, variant, rate);
  let step = builder.next();
  while (!step.done) step = builder.next();
  return step.value;
}

export function animalVoiceState(value?: string): AnimalVoiceState {
  return [
    'idle',
    'forage',
    'fly',
    'flee',
    'curious',
    'stalk',
    'lunge',
    'sleep',
    'flock',
    'herd',
    'mating',
    'alert',
    'attack',
    'hurt',
    'death',
  ].includes(value ?? '')
    ? (value as AnimalVoiceState)
    : 'idle';
}

/** Crowd is an actual population cue, never a location-wide phantom voice. */
export function crowdAudibility(
  population: number,
  distance: number,
  hour: number,
  tavern: boolean,
): number {
  if (
    !Number.isFinite(population) ||
    population < 2 ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance >= 14
  )
    return 0;
  const active = tavern ? hour >= 16 && hour < 24 : hour >= 7 && hour < 21;
  if (!active) return 0;
  return Math.min(1, (population - 1) / 7) * (1 - distance / 14) ** 2;
}
