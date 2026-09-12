import type { Point, Prop, Tile } from './types.ts';

export const WORLD_ACOUSTICS = Object.freeze({
  maxDistance: 48,
  sampleStep: 0.4,
  wall: 0.34,
  closedDoor: 0.22,
  maximumOcclusion: 0.82,
});
export interface AcousticWorld {
  peekTile(x: number, y: number): Tile | undefined;
  peekPropsAt(x: number, y: number): readonly Prop[];
}
/** Walls and closed doors only. Trees/furniture/water never masquerade as sealed walls.
 * A bounded ray is an approximation, not a room impulse-response simulation.
 */
export function worldOcclusion(
  world: AcousticWorld,
  from: Point,
  to: Point,
  removed: ReadonlySet<string>,
): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (
    ![from.x, from.y, to.x, to.y].every(Number.isFinite) ||
    distance > WORLD_ACOUSTICS.maxDistance
  )
    return 0;
  const count = Math.max(1, Math.ceil(distance / WORLD_ACOUSTICS.sampleStep));
  const seen = new Set<string>();
  let obstruction = 0,
    insideWall = false;
  for (let i = 1; i < count; i++) {
    const x = from.x + ((to.x - from.x) * i) / count,
      y = from.y + ((to.y - from.y) * i) / count;
    const tile = world.peekTile(x, y);
    // Unloaded geometry is unknown. Never generate terrain in an audio callback.
    if (!tile) {
      insideWall = false;
      continue;
    }
    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const wall = tile.terrain === 'wall';
    if (wall && !insideWall) obstruction += WORLD_ACOUSTICS.wall;
    insideWall = wall;
    if (
      tile.terrain === 'floor' &&
      world
        .peekPropsAt(tile.x, tile.y)
        .some(
          (prop) =>
            prop.kind === 'door' && prop.x === tile.x && prop.y === tile.y && !removed.has(prop.id),
        )
    )
      obstruction += WORLD_ACOUSTICS.closedDoor;
    if (obstruction >= WORLD_ACOUSTICS.maximumOcclusion) return WORLD_ACOUSTICS.maximumOcclusion;
  }
  return obstruction;
}
