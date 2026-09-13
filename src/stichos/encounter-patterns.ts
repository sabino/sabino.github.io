import { deriveSeed } from '../procedural/random.ts';
import type { Point } from './types.ts';
import type { WorldTimeSignal } from './world-time.ts';

export type EncounterArchetype = 'skirmisher' | 'slinger' | 'breaker' | 'warden' | 'cultivator';
export interface EncounterPattern {
  archetype: EncounterArchetype;
  name: string;
  shape: 'cone' | 'volley' | 'line' | 'radial';
  windup: number;
  recovery: number;
  range: number;
  damage: number;
  angles: readonly number[];
  movement: 'pursue' | 'kite' | 'hold';
  preferredDistance: number;
  color: string;
  sound: 'swing' | 'tool-impact' | 'craft';
  description: string;
}

/** An optional encounter actor uses the normal raider wire shape. No new hostile fauna. */
export function encounterArchetype(id: string): EncounterArchetype | undefined {
  const value = id.split(':').at(-2);
  return value === 'skirmisher' ||
    value === 'slinger' ||
    value === 'breaker' ||
    value === 'warden' ||
    value === 'cultivator'
    ? value
    : undefined;
}

/** Shared deterministic attack choice. Cooldowns own cadence; render frames never choose attacks. */
export function encounterPattern(
  id: string,
  seed: number,
  hp: number,
  maxHp: number,
  time: Pick<WorldTimeSignal, 'nightness'> = { nightness: 0 },
): EncounterPattern | undefined {
  if (!id.startsWith('expedition:')) return;
  const archetype = encounterArchetype(id);
  const injured = Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp / maxHp < 0.5;
  const slight = (deriveSeed(seed, 'encounter-tempo') % 7) * 0.01;
  switch (archetype) {
    case 'skirmisher':
      return {
        archetype,
        name: 'Hook and retreat',
        shape: 'cone',
        windup: 0.43 + slight,
        recovery: 1.1,
        range: 1.65,
        damage: 7,
        angles: [0],
        movement: injured ? 'kite' : 'pursue',
        preferredDistance: 1.2,
        color: '#e2ae83',
        sound: 'swing',
        description:
          'A quick frontal hook. Wounded scouts retreat; do not chase into the slinger’s line.',
      };
    case 'slinger':
      return {
        archetype,
        name: 'Forked shot',
        shape: 'volley',
        windup: 0.83 + slight,
        recovery: 1.6,
        range: 7,
        damage: 6,
        angles: [-0.16, 0.16],
        movement: 'kite',
        preferredDistance: 4.3,
        color: '#e7ca83',
        sound: 'swing',
        description:
          'Two diverging shots leave a gap down the middle. Close the distance during the long reload.',
      };
    case 'breaker':
      return {
        archetype,
        name: 'Roadsplitter',
        shape: 'line',
        windup: 1.08 + slight,
        recovery: 1.9,
        range: 3.6,
        damage: 13,
        angles: [0],
        movement: 'pursue',
        preferredDistance: 2.5,
        color: '#e59777',
        sound: 'tool-impact',
        description:
          'A narrow, heavy ground strike. Move sideways when the line lights up; its recovery leaves an opening.',
      };
    case 'warden':
      return injured
        ? {
            archetype,
            name: 'Broken circuit',
            shape: 'radial',
            windup: 1.35 + slight,
            recovery: 2.3,
            range: 3.15,
            damage: 15,
            angles: [0],
            movement: 'hold',
            preferredDistance: 2.4,
            color: '#bfaae4',
            sound: 'craft',
            description:
              'Below half health the warden vents a ring. Step outside the ring, then rush the long recovery.',
          }
        : {
            archetype,
            name: 'Survey beam',
            shape: 'line',
            windup: 1.15 + slight,
            recovery: 1.8,
            range: 5,
            damage: 12,
            angles: [0],
            movement: 'pursue',
            preferredDistance: 3.5,
            color: '#8fcddd',
            sound: 'tool-impact',
            description:
              'A fixed bearing strike. The direction locks at anticipation; step aside instead of running backward.',
          };
    case 'cultivator':
      return {
        archetype,
        name: 'Seedburst',
        shape: 'radial',
        windup: (time.nightness > 0.6 ? 0.95 : 1.2) + slight,
        recovery: 1.9,
        range: time.nightness > 0.6 ? 3.25 : 2.75,
        damage: 10,
        angles: [0],
        movement: 'pursue',
        preferredDistance: 2,
        color: '#9dc99a',
        sound: 'craft',
        description:
          'A slow botanical burst; the organism spreads farther at night. Interrupt the gather or leave its circle.',
      };
  }
}

export function encounterContains(
  pattern: EncounterPattern,
  from: Point,
  to: Point,
  heading: number,
): boolean {
  if (![from.x, from.y, to.x, to.y, heading].every(Number.isFinite)) return false;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    distance = Math.hypot(dx, dy);
  if (distance > pattern.range) return false;
  if (pattern.shape === 'radial') return true;
  const along = dx * Math.cos(heading) + dy * Math.sin(heading);
  if (pattern.shape === 'line')
    return along >= 0 && Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading)) <= 0.62;
  return distance < 0.001 || along / distance > 0.35;
}

export function encounterSteering(
  pattern: EncounterPattern,
  from: Point,
  target: Point,
  cooldown: number,
): Point {
  const dx = target.x - from.x,
    dy = target.y - from.y,
    d = Math.hypot(dx, dy);
  if (d < 0.001 || !Number.isFinite(d)) return { x: 0, y: 0 };
  if (pattern.movement === 'hold' && d <= pattern.range) return { x: 0, y: 0 };
  const retreat =
    pattern.movement === 'kite' && d < pattern.preferredDistance - 0.6 && cooldown > 0.2;
  const advance = d > pattern.preferredDistance + 0.3;
  const sign = retreat ? -1 : advance ? 1 : 0;
  return { x: (dx / d) * sign, y: (dy / d) * sign };
}
