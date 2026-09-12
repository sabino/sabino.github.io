import type { FoleyEvent } from '../foley.ts';
import type { Point, PropKind, Tile } from './types.ts';

/** Sound follows physical surfaces, not the biome label or a receiver's screen size. */
export function footstepMaterial(tile: Tile): FoleyEvent['material'] {
  switch (tile.terrain) {
    case 'floor':
      return tile.architecture?.wallMaterial === 'metal' ||
        tile.architecture?.wallMaterial === 'composite'
        ? 'metal'
        : tile.architecture?.style === 'timber' || tile.architecture?.style === 'stilt'
          ? 'wood'
          : 'stone';
    case 'bridge':
      return 'wood';
    case 'road':
      return tile.site ? 'stone' : 'gravel';
    case 'wall':
    case 'basalt':
    case 'ice':
      return 'stone';
    case 'snow':
      return 'snow';
    case 'sand':
      return 'sand';
    case 'water':
      return 'water';
    case 'mud':
      return 'dirt';
    default:
      return 'grass';
  }
}

export function resourceMaterial(kind: PropKind): FoleyEvent['material'] {
  return kind === 'pine' ? 'wood' : kind === 'rock' ? 'stone' : 'plant';
}

/** Bounded local spatial cues. Offscreen work is culled before it reaches the mixer. */
export function physicalSound(
  kind: FoleyEvent['kind'],
  material: FoleyEvent['material'],
  actor: Point,
  listener: Point,
  actorId: string,
  variantSeed: number,
  intensity = 0.7,
  delay = 0,
  action?: FoleyEvent['action'],
): FoleyEvent {
  return {
    kind,
    material,
    actorId,
    variantSeed,
    intensity,
    delay,
    action,
    distance: Math.hypot(actor.x - listener.x, actor.y - listener.y),
    pan: Math.max(-1, Math.min(1, (actor.x - listener.x) / 10)),
  };
}
