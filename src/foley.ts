import { atmosphereRandom } from './atmosphere.ts';

export type FoleyMaterial =
  | 'grass'
  | 'dirt'
  | 'gravel'
  | 'stone'
  | 'wood'
  | 'sand'
  | 'snow'
  | 'water'
  | 'metal'
  | 'plant'
  | 'cloth'
  | 'flesh'
  | 'wet-earth'
  | 'mud'
  | 'puddle';
export interface FoleyEvent {
  kind:
    | 'footstep'
    | 'tool-impact'
    | 'pickup'
    | 'swing'
    | 'hit'
    | 'door'
    | 'equip'
    | 'craft'
    | 'construction'
    | 'machine'
    | 'guard'
    | 'crime'
    | 'spell'
    | 'weather'
    | 'ui'
    | 'harvest';
  material: FoleyMaterial;
  intensity?: number;
  speed?: number;
  pan?: number;
  distance?: number;
  actorId?: string;
  variantSeed?: number;
  delay?: number;
  action?: 'open' | 'close' | 'release';
  footwear?: 'bare' | 'soft' | 'boot' | 'armored';
  weight?: number;
  moisture?: number;
  interior?: boolean;
}
export interface FoleyPlan {
  group: string;
  variant: number;
  gain: number;
  rate: number;
  pan: number;
  cutoff: number;
  delay: number;
  texture: FoleyMaterial | null;
  textureGain: number;
}
const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
export const FOLEY_LIMITS = Object.freeze({
  pendingEvents: 12,
  pendingSeconds: 0.3,
  sampleBanks: 6,
  decodedBytes: 24 * 1024 * 1024,
  concurrentLoads: 2,
  maxAssetBytes: 6 * 1024 * 1024,
  requestTimeoutMs: 12000,
  radius: 18,
});
export function foleyGroup(event: FoleyEvent): string {
  const material = event.material;
  if (event.kind === 'construction') return material === 'wood' ? 'chop' : 'mining';
  if (event.kind === 'machine') return material === 'metal' ? 'metal' : 'wood';
  if (event.kind === 'guard') return 'equip-metal';
  if (event.kind === 'crime') return 'door-close';
  if (event.kind === 'spell') return 'swish';
  if (event.kind === 'weather') return 'step-water';
  if (event.kind === 'ui') return 'cloth';
  if (event.kind === 'harvest') return material === 'flesh' ? 'hit' : 'rustle';
  if (event.kind === 'footstep')
    return `step-${material === 'puddle' || material === 'mud' ? 'water' : material === 'wet-earth' ? 'sand' : material === 'metal' ? 'stone' : material === 'dirt' || material === 'gravel' ? 'sand' : material === 'plant' ? 'grass' : material === 'flesh' ? 'cloth' : material}`;
  if (event.kind === 'swing')
    return event.action === 'release'
      ? 'bow-release'
      : event.material === 'metal'
        ? 'swing'
        : 'swish';
  if (event.kind === 'door') return event.action === 'close' ? 'door-close' : 'door-open';
  if (event.kind === 'equip') return material === 'metal' ? 'equip-metal' : 'cloth';
  if (event.kind === 'pickup')
    return material === 'plant' || material === 'grass'
      ? 'rustle'
      : material === 'metal'
        ? 'coins'
        : material === 'stone' || material === 'gravel'
          ? 'stone-light'
          : 'cloth';
  if (event.kind === 'hit')
    return material === 'metal' ? 'clash' : material === 'wood' ? 'wood' : 'hit';
  return material === 'wood'
    ? 'chop'
    : material === 'plant' || material === 'grass'
      ? 'rustle'
      : material === 'metal'
        ? 'metal'
        : material === 'cloth'
          ? 'cloth'
          : 'mining';
}
/** Counter-stratified variations never repeat adjacent takes; pitch stays within natural size variation. */
export function planFoley(
  event: FoleyEvent,
  counter: number,
  seed: number,
  variants = 4,
): FoleyPlan | null {
  const distance = clamp(event.distance, 0, 0, 1e6);
  if (distance >= FOLEY_LIMITS.radius) return null;
  const power = clamp(event.intensity, 0.65, 0, 1),
    speed = clamp(event.speed, 0.5, 0, 1);
  const random = atmosphereRandom(event.variantSeed ?? seed, counter, 611);
  const weight = clamp(event.weight, 0.5, 0, 1),
    moisture = clamp(event.moisture, 0, 0, 1);
  const soft =
    event.footwear === 'bare'
      ? 0.65
      : event.footwear === 'soft'
        ? 0.8
        : event.footwear === 'armored'
          ? 1.15
          : 1;
  const base =
    event.kind === 'footstep'
      ? 0.17
      : event.kind === 'tool-impact'
        ? 0.46
        : event.kind === 'pickup'
          ? 0.2
          : event.kind === 'hit'
            ? 0.38
            : 0.27;
  return {
    group: foleyGroup(event),
    variant:
      (Math.abs(Math.floor(counter)) + ((event.variantSeed ?? seed) >>> 0)) % Math.max(1, variants),
    gain:
      base *
      (0.45 + power * 0.55) *
      (1 - distance / FOLEY_LIMITS.radius) ** 2 *
      (event.kind === 'footstep' ? soft * (0.8 + weight * 0.4) : 1),
    rate: (event.kind === 'footstep' ? 0.93 + speed * 0.12 : 0.96) + random * 0.07,
    pan: clamp(event.pan, 0, -1, 1),
    cutoff:
      event.material === 'snow'
        ? 6200
        : event.material === 'dirt'
          ? 4600
          : event.material === 'cloth'
            ? 5000
            : 11000,
    delay: clamp(event.delay, 0, 0, 0.3),
    texture:
      event.kind === 'footstep'
        ? moisture > 0.65 && ['grass', 'dirt', 'gravel'].includes(event.material)
          ? 'wet-earth'
          : event.material
        : null,
    textureGain:
      event.kind === 'footstep'
        ? 0.065 * soft * (0.7 + speed * 0.3) * (1 - distance / FOLEY_LIMITS.radius) ** 2
        : 0,
  };
}

/** Reusable recorded layers give new actions a physical identity, with at most two tails. */
export function semanticFoleyLayers(event: FoleyEvent): ReadonlyArray<{
  group: string;
  delay: number;
  gain: number;
  rate: number;
  cutoff: number;
}> {
  if (event.kind === 'construction')
    return [
      {
        group: event.material === 'wood' ? 'rustle' : 'stone-light',
        delay: 0.075,
        gain: 0.17,
        rate: 0.85,
        cutoff: 5100,
      },
    ];
  if (event.kind === 'machine')
    return [0.075, 0.15].map((delay) => ({
      group: event.material === 'wood' ? 'wood' : 'metal',
      delay,
      gain: 0.27,
      rate: 1.08,
      cutoff: 3800,
    }));
  if (event.kind === 'guard')
    return [{ group: 'step-stone', delay: 0.11, gain: 0.25, rate: 0.86, cutoff: 5500 }];
  if (event.kind === 'crime')
    return [{ group: 'equip-metal', delay: 0.14, gain: 0.32, rate: 0.9, cutoff: 4400 }];
  if (event.kind === 'spell')
    return [{ group: 'clash', delay: 0.035, gain: 0.16, rate: 1.4, cutoff: 7400 }];
  if (event.kind === 'harvest')
    return [{ group: 'cloth', delay: 0.1, gain: 0.25, rate: 0.83, cutoff: 2800 }];
  if (event.kind === 'door' && event.material === 'metal')
    return [{ group: 'metal', delay: 0.025, gain: 0.3, rate: 0.83, cutoff: 4800 }];
  return [];
}
