import type { Appearance, Point } from './types.ts';

/** Additive protocol-3 capability. Older rooms continue to support attack/ward. */
export const ACTION_EXPANSION = 1 as const;
export type TechniqueId = 'crescent' | 'faultline' | 'fan' | 'thread' | 'pulse' | 'bloom';
export interface Technique {
  id: TechniqueId;
  name: string;
  weapon: 'sword' | 'bow' | 'staff';
  level: number;
  stamina: number;
  cooldown: number;
  windup: number;
  radius: number;
  multiplier: number;
  pattern: 'cone' | 'line' | 'fan' | 'pierce' | 'radial';
  targets: number;
  stagger: number;
  knockback: number;
  color: string;
  description: string;
}
export const TECHNIQUES: readonly Technique[] = Object.freeze([
  {
    id: 'crescent',
    name: 'Reaping arc',
    weapon: 'sword',
    level: 1,
    stamina: 18,
    cooldown: 3.5,
    windup: 0.12,
    radius: 2.4,
    multiplier: 0.85,
    pattern: 'cone',
    targets: 3,
    stagger: 0.45,
    knockback: 0.25,
    color: '#e7c78e',
    description:
      'Sweep up to three threats ahead. Break a group’s rhythm, then follow with a precise strike.',
  },
  {
    id: 'faultline',
    name: 'Seam breaker',
    weapon: 'sword',
    level: 4,
    stamina: 30,
    cooldown: 7,
    windup: 0.55,
    radius: 4,
    multiplier: 1.45,
    pattern: 'line',
    targets: 4,
    stagger: 1.4,
    knockback: 1.1,
    color: '#edaa79',
    description:
      'Plant your feet and drive a narrow shock along the ground. A long warning precedes a forceful, interrupting cut.',
  },
  {
    id: 'fan',
    name: 'Split flight',
    weapon: 'bow',
    level: 1,
    stamina: 18,
    cooldown: 4,
    windup: 0.15,
    radius: 7,
    multiplier: 0.62,
    pattern: 'fan',
    targets: 1,
    stagger: 0.35,
    knockback: 0,
    color: '#ddd2a7',
    description:
      'Release three separate arrows in a shallow fan. Close targets can catch several; distant gaps remain open.',
  },
  {
    id: 'thread',
    name: 'Needle flight',
    weapon: 'bow',
    level: 4,
    stamina: 28,
    cooldown: 6,
    windup: 0.6,
    radius: 10,
    multiplier: 1.3,
    pattern: 'pierce',
    targets: 3,
    stagger: 0.7,
    knockback: 0,
    color: '#a7d5dd',
    description:
      'Draw a single penetrating shot through up to three enemies. Line up a column before releasing.',
  },
  {
    id: 'pulse',
    name: 'Root resonance',
    weapon: 'staff',
    level: 1,
    stamina: 20,
    cooldown: 4.5,
    windup: 0.2,
    radius: 3.2,
    multiplier: 0.8,
    pattern: 'radial',
    targets: 8,
    stagger: 1,
    knockback: 0.5,
    color: '#9ed1b4',
    description:
      'Resonate through nearby living matter, staggering surrounding threats. Walls shelter those beyond them.',
  },
  {
    id: 'bloom',
    name: 'Stillbloom',
    weapon: 'staff',
    level: 4,
    stamina: 32,
    cooldown: 8,
    windup: 0.7,
    radius: 4.2,
    multiplier: 1.15,
    pattern: 'radial',
    targets: 8,
    stagger: 2.2,
    knockback: 0,
    color: '#b5b1e5',
    description:
      'Gather a slow botanical pulse, then hold enemies in a long stagger. Time it before allies follow up.',
  },
]);

export function techniqueById(id: unknown): Technique | undefined {
  return typeof id === 'string' ? TECHNIQUES.find((t) => t.id === id) : undefined;
}
export function techniquesFor(
  weapon: Appearance['weapon'],
  delivery?: string,
): readonly Technique[] {
  const family =
    delivery === 'contact'
      ? 'sword'
      : delivery === 'projectile'
        ? 'bow'
        : delivery === 'pulse'
          ? 'staff'
          : weapon;
  return TECHNIQUES.filter((t) => t.weapon === family);
}
/** Geometry shared by offline and room authority. No screen-size inputs. */
export function techniqueContains(
  technique: Technique,
  from: Point,
  to: Point,
  heading: number,
): boolean {
  if (![from.x, from.y, to.x, to.y, heading].every(Number.isFinite)) return false;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    d = Math.hypot(dx, dy);
  if (d > technique.radius || d < 0.001) return d < 0.001;
  const along = dx * Math.cos(heading) + dy * Math.sin(heading);
  if (technique.pattern === 'radial') return true;
  if (technique.pattern === 'line')
    return along >= 0 && Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading)) <= 0.65;
  return along / d > 0.05;
}
export function techniqueAngles(technique: Technique, heading: number): number[] {
  return technique.pattern === 'fan' ? [heading - 0.19, heading, heading + 0.19] : [heading];
}
/** Touch aiming acquires visible hostiles only; line-of-sight remains caller-owned. */
export function assistedAim<T extends Point & { id: string; hp: number; hostile: boolean }>(
  origin: Point,
  heading: number,
  targets: readonly T[],
  range: number,
  visible: (target: T) => boolean,
): T | undefined {
  return targets
    .filter((t) => {
      const d = Math.hypot(t.x - origin.x, t.y - origin.y);
      const facing =
        ((t.x - origin.x) * Math.cos(heading) + (t.y - origin.y) * Math.sin(heading)) /
        Math.max(0.001, d);
      return t.hp > 0 && t.hostile && d <= range && facing >= -0.15 && visible(t);
    })
    .sort(
      (a, b) =>
        Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) ||
        a.id.localeCompare(b.id),
    )[0];
}

export const STEP_RULES = Object.freeze({
  stamina: 14,
  cooldown: 2.8,
  duration: 0.18,
  distance: 1.75,
});
