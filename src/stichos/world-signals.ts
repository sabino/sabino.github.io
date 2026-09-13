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
import type { UnderworldPlan } from './underworld.ts';
export interface SignalWorld {
  tile(x: number, y: number): Tile;
  propsAround(x: number, y: number, radius: number): Prop[];
}
export interface WorldLocationSignal {
  biome: Biome | 'underground';
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
  /** Only an actual weather simulation may supply a non-clear state. */
  weather: 'clear' | 'rain' | 'storm' | 'snow';
  rainIntensity?: number;
  /** Semantic activity supplied by the simulation, never guessed from a music zone. */
  audioContext?: {
    population: number;
    crowdDistance?: number;
    crowdPan?: number;
    dungeonDepth?: number;
    specialNight?: boolean;
    reputation?: 'trusted' | 'feared' | 'wanted' | 'unknown';
    factionId?: string;
    home?: boolean;
    production?: number;
    victory?: boolean;
  };
}

/** Underground coordinates are a separate space, never coordinates on the surface.
 * Water recordings contain outdoor detail, so cistern water is represented by its
 * actual foot-contact material until a dedicated indoor water emitter is available.
 * No weather, population or temperature simulation is invented for these floors.
 */
export function underworldLocationAt(
  plan: Pick<UnderworldPlan, 'depth' | 'features'> | undefined,
  point: Point,
): WorldLocationSignal {
  let fire = Infinity;
  for (const feature of plan?.features ?? [])
    if (feature.kind === 'rest')
      fire = Math.min(fire, Math.hypot(feature.x - point.x, feature.y - point.y));
  return {
    biome: 'underground',
    terrain: 'floor',
    interior: true,
    temperature: 0,
    settlement: false,
    featureDistances: { water: Infinity, trees: Infinity, fire },
    weather: 'clear',
    audioContext: {
      population: 0,
      // The world uses zero-based floors; the composer's depth signal is one-based.
      dungeonDepth: plan ? plan.depth + 1 : undefined,
      home: false,
      production: 0,
    },
  };
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
