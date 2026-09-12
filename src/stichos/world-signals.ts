import type {
  ArchitecturalCulture,
  Biome,
  BuildingKind,
  Point,
  Prop,
  Terrain,
  Tile,
  TileEcology,
} from './types.ts';
export interface SignalWorld {
  tile(x: number, y: number): Tile;
  propsAround(x: number, y: number, radius: number): Prop[];
}
export interface WorldLocationSignal {
  biome: Biome;
  terrain: Terrain;
  interior: boolean;
  buildingKind?: BuildingKind;
  buildingId?: string;
  ecology?: TileEcology;
  architecture?: ArchitecturalCulture;
  temperature: number;
  settlement: boolean;
  /** Tile distances, Infinity when outside the bounded sampling area. */
  featureDistances: { water: number; trees: number; fire: number };
  /** The world has no dynamic weather simulation yet. Never invent a storm. */
  weather: 'clear';
}
/** Bounded 7x7 local probes + props within 8 tiles. Cache at the consumer, not per frame. */
export function worldLocationAt(
  world: SignalWorld,
  point: Point,
  removed: ReadonlySet<string> = new Set(),
): WorldLocationSignal {
  const tile = world.tile(point.x, point.y);
  const featureDistances = { water: Infinity, trees: Infinity, fire: Infinity };
  for (let y = -6; y <= 6; y += 2)
    for (let x = -6; x <= 6; x += 2) {
      const sample = world.tile(point.x + x, point.y + y);
      if (sample.terrain === 'water')
        featureDistances.water = Math.min(featureDistances.water, Math.hypot(x, y));
    }
  for (const prop of world.propsAround(point.x, point.y, 8)) {
    if (removed.has(prop.id)) continue;
    const d = Math.hypot(prop.x - point.x, prop.y - point.y);
    if (prop.kind === 'pine') featureDistances.trees = Math.min(featureDistances.trees, d);
    // Lamps are not all flames: only pre-electric styles represent combustion.
    if (prop.kind === 'lamp' && (world.tile(prop.x, prop.y).architecture?.technology ?? 0) < 0.5)
      featureDistances.fire = Math.min(featureDistances.fire, d);
  }
  return {
    biome: tile.biome,
    terrain: tile.terrain,
    interior: tile.terrain === 'floor',
    buildingKind: tile.buildingKind,
    buildingId: tile.building,
    ecology: tile.ecology,
    architecture: tile.architecture,
    temperature: tile.temperature,
    settlement: tile.biome === 'settlement' || !!tile.building,
    featureDistances,
    weather: 'clear',
  };
}
