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
  | 'flesh';
export interface FoleyEvent {
  kind: 'footstep' | 'tool-impact' | 'pickup' | 'swing' | 'hit' | 'door' | 'equip' | 'craft';
  material: FoleyMaterial;
  intensity?: number;
  speed?: number;
  pan?: number;
  distance?: number;
  actorId?: string;
  variantSeed?: number;
  delay?: number;
  action?: 'open' | 'close' | 'release';
}
export interface FoleyPlan {
  group: string;
  variant: number;
  gain: number;
  rate: number;
  pan: number;
  cutoff: number;
  delay: number;
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
  if (event.kind === 'footstep')
    return `step-${material === 'metal' ? 'stone' : material === 'dirt' || material === 'gravel' ? 'sand' : material === 'plant' ? 'grass' : material === 'flesh' ? 'cloth' : material}`;
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
    gain: base * (0.45 + power * 0.55) * (1 - distance / FOLEY_LIMITS.radius) ** 2,
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
  };
}
