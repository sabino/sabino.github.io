import { deriveSeed, random, mix } from '../procedural/random.ts';
import { generateVault, VAULT_SIZE, type VaultLayout } from './vault.ts';
import type {
  Appearance,
  BuildingKind,
  Biome,
  Chunk,
  Clan,
  Npc,
  NpcRole,
  Point,
  Prop,
  PropKind,
  Settlement,
  Tile,
} from './types.ts';

export const PLANET_NAME = 'Stíchos';
export const ORIGIN_CITY_NAME = 'Vespera';
export const ORIGIN_CATHEDRAL_NAME = 'Cathedral of Vespera';
export const CHUNK_SIZE = 16;
export type WorldGeneration = 1 | 2 | 3;
export const CITY_SPACING = 640;
export const STOP_SPACING = CITY_SPACING / 3;
export type WildernessBiome = Exclude<Biome, 'settlement'>;
export interface WorldClimate {
  elevation: number;
  moisture: number;
  regionalCold: number;
  coldness: number;
  temperature: number;
  biome: WildernessBiome;
  weights: Record<WildernessBiome, number>;
}
export interface VaultSite extends Point {
  id: string;
  seed: number;
  radius: number;
  entrance: Point;
  reward: Point;
}
interface PlacedVault {
  site: VaultSite;
  layout: VaultLayout;
  origin: Point;
  roadY: number;
  guards: Point[];
}
const CACHE_LIMIT = 160;
const TOWN_SPACING = 80;
const CLANS: Clan[] = [
  {
    id: 0,
    name: 'Brown',
    color: '#a68c6a',
    doctrine: 'Orlando advocates industrial production of food and medicine.',
  },
  {
    id: 1,
    name: 'Sallas',
    color: '#7faaa6',
    doctrine: 'Guard a family secret that may explain travel between minds.',
  },
  {
    id: 2,
    name: 'Veyr',
    color: '#aa8197',
    doctrine: 'Maintain the frostwood seed libraries.',
  },
  {
    id: 3,
    name: 'Ordel',
    color: '#9f9ab8',
    doctrine: 'Shelter travelers and record the winter roads.',
  },
  {
    id: 4,
    name: 'Meren',
    color: '#83a77f',
    doctrine: 'Restore living soil beneath the ice.',
  },
  {
    id: 5,
    name: 'Caldris',
    color: '#b08a76',
    doctrine: 'Keep the furnaces and long-range radios alive.',
  },
];
const pick = <T>(values: readonly T[], rng: () => number): T =>
  values[Math.floor(rng() * values.length)];
const squareDistance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const key = (x: number, y: number) => `${x},${y}`;
const integer = (v: number) => (Number.isFinite(v) ? Math.round(v) : 0);
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (a: number, b: number, v: number) => smooth(clamp01((v - a) / (b - a)));

export function appearance(seed: number, role: NpcRole = 'pilgrim', clan = 0): Appearance {
  const rng = random(deriveSeed(seed, 'humanoid-appearance'));
  const palette = CLANS[((clan % CLANS.length) + CLANS.length) % CLANS.length];
  return {
    seed: seed >>> 0,
    skin: pick(['#d2af97', '#b88e74', '#926c54', '#725346', '#dfc8ab', '#ad927f'], rng),
    hair: pick(['#242830', '#4a3933', '#6b5445', '#aaa59a', '#89756b', '#b6b3a6'], rng),
    coat: pick(['#33494b', '#4d5149', '#48505f', '#554650', palette.color], rng),
    trim: palette.color,
    trousers: pick(['#283137', '#343639', '#39313a', '#3d4540'], rng),
    height: Number(mix(0.88, 1.14, rng()).toFixed(3)),
    build: Number(mix(0.82, 1.18, rng()).toFixed(3)),
    hairStyle: Math.floor(rng() * 5),
    hat: Math.floor(rng() * 5),
    cloak: rng() > 0.3,
    weapon:
      role === 'guard' || role === 'raider'
        ? pick(['sword', 'bow'] as const, rng)
        : role === 'botanist' || role === 'pilgrim'
          ? 'staff'
          : 'none',
  };
}

interface Building {
  id: string;
  x: number;
  y: number;
  halfX: number;
  halfY: number;
  name: string;
  kind?: BuildingKind;
}
interface TownLayout {
  settlement: Settlement;
  buildings: Building[];
}

/** Addressed coordinate generation makes eviction, travel direction, and load order irrelevant. */
export class InfiniteWorld {
  readonly seed: number;
  readonly generation: WorldGeneration;
  readonly spawn: Point = { x: 0, y: 5 };
  readonly clans: Clan[] = CLANS.map((clan) => ({ ...clan }));
  private cache = new Map<string, Chunk>();
  private lattice = new Map<string, number>();
  private vaultCache = new Map<string, PlacedVault>();
  constructor(seed: number, generation: WorldGeneration = 3) {
    if (generation !== 1 && generation !== 2 && generation !== 3)
      throw new RangeError('Unsupported world generation');
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 0;
    this.generation = generation;
  }
  get cacheSize() {
    return this.cache.size;
  }

  private get spacing() {
    return this.generation === 3 ? STOP_SPACING : TOWN_SPACING;
  }
  private roadCenter(index: number) {
    return Math.round(index * this.spacing);
  }
  private highway(x: number, y: number) {
    return (
      Math.abs(x - this.roadCenter(Math.round(x / this.spacing))) <= 1 ||
      Math.abs(y - this.roadCenter(Math.round(y / this.spacing))) <= 1
    );
  }
  private hasTown(gx: number, gy: number) {
    // Stops on the routes between cities are guaranteed. Some cross-country
    // junctions are deliberately empty, preserving larger stretches of wilderness.
    return (
      this.generation !== 3 ||
      gx % 3 === 0 ||
      gy % 3 === 0 ||
      deriveSeed(this.seed, 'settlement-presence-v3', gx, gy) % 5 < 3
    );
  }

  private noise(x: number, y: number, scale: number, address: string): number {
    const px = x / scale,
      py = y / scale,
      ix = Math.floor(px),
      iy = Math.floor(py);
    const value = (dx: number, dy: number) => {
      if (this.generation === 1)
        return deriveSeed(this.seed, address, ix + dx, iy + dy) / 0xffffffff;
      const id = `${address}:${ix + dx}:${iy + dy}`;
      const cached = this.lattice.get(id);
      if (cached !== undefined) return cached;
      const sample = deriveSeed(this.seed, address, ix + dx, iy + dy) / 0xffffffff;
      this.lattice.set(id, sample);
      if (this.lattice.size > 8192) this.lattice.delete(this.lattice.keys().next().value!);
      return sample;
    };
    return mix(
      mix(value(0, 0), value(1, 0), smooth(px - ix)),
      mix(value(0, 1), value(1, 1), smooth(px - ix)),
      smooth(py - iy),
    );
  }

  /** Continuous, coordinate-addressed climate; independent of chunk boundaries and load order. */
  climate(x: number, y: number): WorldClimate {
    x = Number.isFinite(x) ? x : 0;
    y = Number.isFinite(y) ? y : 0;
    if (this.generation === 1) {
      const elevation =
        this.noise(x, y, 29, 'elevation') * 0.7 + this.noise(x, y, 11, 'folds') * 0.3;
      const moisture = this.noise(x, y, 43, 'moisture');
      const coldness = this.noise(x, y, 61, 'cold');
      const biome =
        elevation > 0.66
          ? 'highlands'
          : moisture > 0.6
            ? 'marsh'
            : coldness > 0.52
              ? 'tundra'
              : 'frostwood';
      return {
        elevation,
        moisture,
        regionalCold: coldness,
        coldness,
        temperature: Number((-19 + coldness * 11 + moisture * 2).toFixed(2)),
        biome,
        weights: {
          frostwood: Number(biome === 'frostwood'),
          tundra: Number(biome === 'tundra'),
          marsh: Number(biome === 'marsh'),
          highlands: Number(biome === 'highlands'),
        },
      };
    }
    // Broad independent displacement fields bend regional contours without any
    // per-chunk reseeding. Smaller octaves add terrain folds inside those regions.
    const wx = x + (this.noise(x, y, 173, 'climate-warp-x') - 0.5) * 72;
    const wy = y + (this.noise(x, y, 211, 'climate-warp-y') - 0.5) * 72;
    const elevation = smooth(
      this.noise(wx, wy, 87, 'altitude-region') * 0.62 +
        this.noise(wx, wy, 31, 'altitude-folds') * 0.26 +
        this.noise(wx, wy, 11, 'altitude-detail') * 0.12,
    );
    const moisture = smooth(
      this.noise(wx + 91, wy - 53, 117, 'moisture-region') * 0.74 +
        this.noise(wx + 91, wy - 53, 38, 'moisture-local') * 0.26,
    );
    const regionalCold = smooth(
      this.noise(wx - 87, wy + 47, 151, 'temperature-region') * 0.8 +
        this.noise(wx - 87, wy + 47, 61, 'temperature-local') * 0.2,
    );
    const coldness = clamp01(regionalCold * 0.7 + elevation * 0.3);
    const high = ramp(0.53, 0.73, elevation),
      wet = ramp(0.43, 0.74, moisture),
      frozen = ramp(0.39, 0.68, coldness);
    const raw: Record<WildernessBiome, number> = {
      highlands: high,
      marsh: (1 - high) * wet * (1 - frozen * 0.6),
      frostwood: (1 - high) * (1 - wet * 0.5) * (1 - frozen),
      tundra: (1 - high) * (0.2 + frozen) * (1 - wet * 0.35),
    };
    const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
    const weights = Object.fromEntries(
      Object.entries(raw).map(([biome, weight]) => [biome, weight / total]),
    ) as Record<WildernessBiome, number>;
    const biome = (Object.keys(weights) as WildernessBiome[]).reduce(
      (best, candidate) => (weights[candidate] > weights[best] ? candidate : best),
      'frostwood',
    );
    return {
      elevation,
      moisture,
      regionalCold,
      coldness,
      temperature: Number((-9 - regionalCold * 14 - elevation * 7 + moisture * 2).toFixed(2)),
      biome,
      weights,
    };
  }

  private vault(gx: number, gy: number): PlacedVault | null {
    if (
      this.generation === 1 ||
      ((gx !== 0 || gy !== 0) && deriveSeed(this.seed, 'vault-presence', gx, gy) % 3 !== 0)
    )
      return null;
    const id = `vault:${gx}:${gy}`;
    const cached = this.vaultCache.get(id);
    if (cached) {
      this.vaultCache.delete(id);
      this.vaultCache.set(id, cached);
      return cached;
    }
    const seed = deriveSeed(this.seed, 'botanical-vault', gx, gy);
    const layout = generateVault(seed);
    const x = Math.round((gx + 0.5) * this.spacing),
      y = Math.round((gy + 0.5) * this.spacing);
    const origin = { x: x - VAULT_SIZE / 2, y: y - VAULT_SIZE / 2 };
    const worldPoint = (p: Point) => ({ x: origin.x + p.x, y: origin.y + p.y });
    const site: VaultSite = {
      id,
      seed,
      x,
      y,
      radius: VAULT_SIZE / 2,
      entrance: worldPoint(layout.entrance),
      reward: worldPoint(layout.reward),
    };
    const floor = [...layout.floor.entries()]
      .filter(([, open]) => open)
      .map(([i]) => worldPoint({ x: i % VAULT_SIZE, y: Math.floor(i / VAULT_SIZE) }));
    const deep = floor
      .filter((p) => squareDistance(p, site.entrance) > 100 && squareDistance(p, site.reward) >= 4)
      .sort(
        (a, b) =>
          squareDistance(a, site.reward) - squareDistance(b, site.reward) || a.y - b.y || a.x - b.x,
      );
    const guards: Point[] = [];
    for (const p of deep)
      if (guards.every((g) => squareDistance(g, p) >= 9)) {
        guards.push(p);
        if (guards.length === 2) break;
      }
    const placed: PlacedVault = { site, layout, origin, roadY: this.roadCenter(gy + 1), guards };
    this.vaultCache.set(id, placed);
    while (this.vaultCache.size > 32) this.vaultCache.delete(this.vaultCache.keys().next().value!);
    return placed;
  }

  private vaultsForChunk(x0: number, y0: number): PlacedVault[] {
    if (this.generation === 1) return [];
    if (this.generation === 3) {
      const result: PlacedVault[] = [],
        spacing = this.spacing;
      for (
        let gy = Math.ceil((y0 - spacing - 1) / spacing);
        gy <= Math.floor((y0 + CHUNK_SIZE - 1 - spacing / 2 + 17) / spacing);
        gy++
      )
        for (
          let gx = Math.ceil((x0 - spacing / 2 - 17) / spacing);
          gx <= Math.floor((x0 + CHUNK_SIZE - 1 - spacing / 2 + 17) / spacing);
          gx++
        ) {
          const vault = this.vault(gx, gy);
          if (
            vault &&
            x0 <= vault.origin.x + 31 &&
            x0 + CHUNK_SIZE - 1 >= vault.origin.x &&
            y0 <= vault.roadY &&
            y0 + CHUNK_SIZE - 1 >= vault.origin.y
          )
            result.push(vault);
        }
      return result;
    }
    const result: PlacedVault[] = [];
    // Excavations occupy x24..55 and y24..55 in their 80-tile district;
    // the south approach continues to y80. No settlement lies on that approach.
    for (
      let gy = Math.ceil((y0 - 80) / 80);
      gy <= Math.floor((y0 + CHUNK_SIZE - 1 - 24) / 80);
      gy++
    )
      for (
        let gx = Math.ceil((x0 - 55) / 80);
        gx <= Math.floor((x0 + CHUNK_SIZE - 1 - 24) / 80);
        gx++
      ) {
        const vault = this.vault(gx, gy);
        if (vault) result.push(vault);
      }
    return result;
  }
  private town(gx: number, gy: number): TownLayout {
    if (this.generation === 3) return this.townV3(gx, gy);
    const seed = deriveSeed(this.seed, 'settlement', gx, gy),
      rng = random(seed),
      origin = gx === 0 && gy === 0;
    const x = gx * TOWN_SPACING + (origin ? 0 : Math.floor(rng() * 13) - 6);
    const y = gy * TOWN_SPACING + (origin ? 0 : Math.floor(rng() * 13) - 6);
    const clan = origin ? 0 : Math.floor(rng() * CLANS.length);
    const name = origin
      ? ORIGIN_CITY_NAME
      : `${pick(['Vey', 'Mor', 'El', 'Khar', 'Sael', 'Or', 'Cal', 'Thren'], rng)}${pick(['wick', 'mere', 'holt', 'grave', 'gard', 'watch', 'fell', 'haven'], rng)}`;
    const settlement: Settlement = {
      id: origin ? 'origin' : `town:${gx}:${gy}`,
      seed,
      x,
      y,
      name,
      clan,
      kind: origin ? 'cathedral' : pick(['village', 'foundry', 'cathedral'] as const, rng),
      radius: origin ? 21 : 16 + Math.floor(rng() * 3),
    };
    const buildings: Building[] = [
      {
        id: `${settlement.id}:hall`,
        x,
        y: y - (origin ? 5 : 9),
        halfX: origin ? 11 : 3 + Math.floor(rng() * 2),
        halfY: origin ? 4 : 3,
        name: origin
          ? ORIGIN_CATHEDRAL_NAME
          : settlement.kind === 'cathedral'
            ? 'Winter cathedral'
            : 'Assembly hall',
      },
    ];
    for (const [side, row] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      buildings.push({
        id: `${settlement.id}:house:${side}:${row}`,
        x: x + side * (origin ? (row < 0 ? 16 : 13) : 9),
        y: y + (origin ? (row < 0 ? -8 : 10) : row * 7),
        halfX: origin ? 2 : 2 + Math.floor(rng() * 2),
        halfY: origin ? 2 : 2 + Math.floor(rng() * 2),
        name: pick(
          [
            'Seed house',
            'Radio workshop',
            'Winter hospice',
            'Provision hall',
            'Glass conservatory',
          ],
          rng,
        ),
      });
    return { settlement, buildings };
  }
  private townV3(gx: number, gy: number): TownLayout {
    const origin = gx === 0 && gy === 0;
    const seed = deriveSeed(this.seed, origin ? 'settlement' : 'settlement-v3', gx, gy),
      rng = random(seed);
    const city = gx % 3 === 0 && gy % 3 === 0;
    const rank: NonNullable<Settlement['rank']> = city
      ? 'city'
      : deriveSeed(seed, 'stop-scale') % 4 === 0
        ? 'hamlet'
        : 'village';
    const jitter = rank === 'city' ? 0 : rank === 'hamlet' ? 6 : 10;
    const x = this.roadCenter(gx) + (origin ? 0 : Math.floor(rng() * (jitter * 2 + 1)) - jitter);
    const y = this.roadCenter(gy) + (origin ? 0 : Math.floor(rng() * (jitter * 2 + 1)) - jitter);
    // Retain the opening people's seeds and identities along with their exact anchors.
    const clan = origin ? 0 : Math.floor(rng() * CLANS.length);
    const name = origin
      ? ORIGIN_CITY_NAME
      : `${pick(['Vey', 'Mor', 'El', 'Khar', 'Sael', 'Or', 'Cal', 'Thren'], rng)}${pick(['wick', 'mere', 'holt', 'grave', 'gard', 'watch', 'fell', 'haven'], rng)}`;
    const mainKind: BuildingKind = city
      ? 'church'
      : rank === 'hamlet'
        ? pick(['inn', 'workshop'] as const, rng)
        : pick(['hall', 'workshop', 'inn'] as const, rng);
    const settlement: Settlement = {
      id: origin ? 'origin' : `town:${gx}:${gy}`,
      seed,
      x,
      y,
      name,
      clan,
      kind: city ? 'cathedral' : mainKind === 'workshop' ? 'foundry' : 'village',
      rank,
      radius: origin ? 21 : city ? 26 : rank === 'village' ? 17 : 11,
    };
    const names: Record<BuildingKind, string> = {
      church: 'Winter cathedral',
      house: 'Snowbound dwelling',
      inn: 'Wayfarer inn',
      workshop: 'Radio workshop',
      greenhouse: 'Glass conservatory',
      storehouse: 'Provision storehouse',
      hall: 'Assembly hall',
    };
    const main: Building = {
      id: `${settlement.id}:hall`,
      x,
      y: y - (origin ? 5 : rank === 'hamlet' ? 6 : 8),
      halfX: origin
        ? 11
        : city
          ? 7 + Math.floor(rng() * 3)
          : rank === 'hamlet'
            ? 3
            : 3 + Math.floor(rng() * 2),
      halfY: origin ? 4 : city ? 4 : rank === 'hamlet' ? 2 : 3,
      name: origin ? ORIGIN_CATHEDRAL_NAME : names[mainKind],
      kind: mainKind,
    };
    const buildings = [main];
    if (origin) {
      for (const [side, row, kind] of [
        [-1, -1, 'greenhouse'],
        [1, -1, 'workshop'],
        [-1, 1, 'inn'],
        [1, 1, 'storehouse'],
      ] as const)
        buildings.push({
          id: `origin:house:${side}:${row}`,
          x: side * (row < 0 ? 16 : 13),
          y: row < 0 ? -8 : 10,
          halfX: 2,
          halfY: 2,
          name: names[kind],
          kind,
        });
    } else {
      const slots: Point[] =
        rank === 'city'
          ? [
              { x: -16, y: -10 },
              { x: 16, y: -10 },
              { x: -16, y: 9 },
              { x: 16, y: 9 },
              { x: -8, y: 20 },
              { x: 8, y: 20 },
            ]
          : rank === 'village'
            ? [
                { x: -11, y: -7 },
                { x: 11, y: -7 },
                ...(rng() > 0.45
                  ? [
                      { x: -11, y: 11 },
                      { x: 11, y: 11 },
                    ]
                  : []),
              ]
            : rng() > 0.5
              ? [{ x: 7, y: -5 }]
              : [];
      const kinds: BuildingKind[] = [
        'house',
        'greenhouse',
        'storehouse',
        'inn',
        'workshop',
        'house',
      ];
      const offset = Math.floor(rng() * kinds.length);
      slots.forEach((slot, i) => {
        const kind = kinds[(i + offset) % kinds.length];
        const halfX = rank === 'hamlet' ? 2 : 2 + Math.floor(rng() * (rank === 'city' ? 3 : 2));
        const halfY = rank === 'hamlet' ? 2 : 2 + Math.floor(rng() * 2);
        buildings.push({
          id: `${settlement.id}:house:${i}`,
          x: x + slot.x,
          y: y + slot.y,
          halfX,
          halfY,
          kind,
          name: names[kind],
        });
      });
    }
    return { settlement, buildings };
  }
  private layouts(x: number, y: number, radius = 20): TownLayout[] {
    if (this.generation === 3) {
      const result: TownLayout[] = [];
      for (
        let gy = Math.floor((y - radius - 40) / this.spacing);
        gy <= Math.ceil((y + radius + 40) / this.spacing);
        gy++
      )
        for (
          let gx = Math.floor((x - radius - 40) / this.spacing);
          gx <= Math.ceil((x + radius + 40) / this.spacing);
          gx++
        ) {
          if (!this.hasTown(gx, gy)) continue;
          const layout = this.townV3(gx, gy),
            s = layout.settlement;
          if (Math.abs(s.x - x) <= radius + s.radius && Math.abs(s.y - y) <= radius + s.radius)
            result.push(layout);
        }
      return result;
    }
    const minX = Math.floor((x - radius - 24) / TOWN_SPACING),
      maxX = Math.ceil((x + radius + 24) / TOWN_SPACING);
    const minY = Math.floor((y - radius - 24) / TOWN_SPACING),
      maxY = Math.ceil((y + radius + 24) / TOWN_SPACING);
    const result: TownLayout[] = [];
    for (let gy = minY; gy <= maxY; gy++)
      for (let gx = minX; gx <= maxX; gx++) {
        const layout = this.town(gx, gy);
        if (
          Math.abs(layout.settlement.x - x) <= radius + 20 &&
          Math.abs(layout.settlement.y - y) <= radius + 20
        )
          result.push(layout);
      }
    return result;
  }
  private terrain(x: number, y: number, layouts: TownLayout[], vaults: PlacedVault[]): Tile {
    const seed = deriveSeed(this.seed, 'tile', x, y),
      detail = seed / 0xffffffff;
    const climate = this.climate(x, y);
    const { elevation, moisture, coldness: cold } = climate;
    let biome: Biome = climate.biome;
    let terrain: Tile['terrain'] =
      elevation < (this.generation === 1 ? 0.32 : 0.34) && moisture > 0.48
        ? 'water'
        : cold > (this.generation === 1 ? 0.69 : 0.6) && moisture > 0.54
          ? 'ice'
          : biome === 'frostwood' || biome === 'marsh'
            ? 'grass'
            : 'snow';
    const tile: Tile = {
      x,
      y,
      seed,
      terrain,
      biome,
      height: Math.round(elevation * 3) / 3,
      temperature: climate.temperature,
      detail,
    };
    const highway = this.highway(x, y);
    if (highway) tile.terrain = terrain === 'water' || terrain === 'ice' ? 'bridge' : 'road';
    for (const { settlement: s, buildings } of layouts) {
      const dx = x - s.x,
        dy = y - s.y;
      if (Math.abs(dx) > s.radius || Math.abs(dy) > s.radius) continue;
      tile.biome = 'settlement';
      tile.clan = s.clan;
      tile.height = 0;
      tile.terrain = highway || Math.abs(dx) <= 1 || Math.abs(dy) <= 1 ? 'road' : 'snow';
      if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) tile.terrain = 'floor';
      if (!highway && Math.abs(dx) >= 2 && Math.abs(dx) <= 4 && dy >= 4 && dy <= 8)
        tile.terrain = 'grass';
      for (const b of buildings)
        if (Math.abs(x - b.x) <= b.halfX && Math.abs(y - b.y) <= b.halfY) {
          const edge = Math.abs(x - b.x) === b.halfX || Math.abs(y - b.y) === b.halfY;
          const door = x === b.x && Math.abs(y - b.y) === b.halfY;
          tile.terrain = edge && !door ? 'wall' : 'floor';
          tile.building = b.id;
          if (b.kind) tile.buildingKind = b.kind;
        }
    }
    // Buildings that meet a trunk road form an arcade instead of sealing the
    // route. This preserves both interior rooms and an uninterrupted road grid.
    if (highway && tile.terrain === 'wall') tile.terrain = 'floor';
    if (tile.biome !== 'settlement')
      for (const vault of vaults) {
        const localX = x - vault.origin.x,
          localY = y - vault.origin.y;
        if (localX >= 0 && localX < VAULT_SIZE && localY >= 0 && localY < VAULT_SIZE) {
          const i = localY * VAULT_SIZE + localX;
          if (vault.layout.floor[i] || vault.layout.walls[i]) {
            tile.terrain = vault.layout.floor[i] ? 'floor' : 'wall';
            tile.site = vault.site.id;
            tile.height = 0;
          }
        }
        if (
          y >= vault.site.entrance.y &&
          y <= vault.roadY &&
          Math.abs(x - vault.site.entrance.x) <= 1
        ) {
          tile.terrain = tile.terrain === 'water' || tile.terrain === 'ice' ? 'bridge' : 'road';
          tile.site = vault.site.id;
          tile.height = 0;
        }
      }
    return tile;
  }
  private prop(
    kind: PropKind,
    x: number,
    y: number,
    name: string,
    id?: string,
    clan?: number,
    building?: string,
  ): Prop {
    return {
      id: id ?? `${kind}:${x}:${y}`,
      x,
      y,
      kind,
      name,
      seed: deriveSeed(this.seed, 'prop', kind, x, y),
      solid: ['pine', 'rock'].includes(kind),
      clan,
      building,
    };
  }
  private resident(
    s: Settlement,
    role: NpcRole,
    x: number,
    y: number,
    index: number,
    id?: string,
  ): Npc {
    const seed = deriveSeed(s.seed, 'resident', index, role),
      rng = random(seed);
    const name = `${pick(['Ana', 'Iven', 'Mira', 'Oren', 'Neris', 'Toma', 'Edda', 'Sorin', 'Vela', 'Darin', 'Leva', 'Arin'], rng)} ${pick(['Vale', 'Thorn', 'Reed', 'Rusk', 'Fen', 'Moss', 'Wren', 'Ash', 'Kerr', 'Voss', 'Silt', 'Frost'], rng)}`;
    const hp = role === 'guard' || role === 'raider' ? 75 : 50;
    return {
      id: id ?? `${s.id}:resident:${index}`,
      seed,
      name,
      role,
      x,
      y,
      clan: s.clan,
      appearance: appearance(seed, role, s.clan),
      maxHp: hp,
      hp,
      home: { x, y },
      speed: role === 'raider' ? 1.55 : mix(0.65, 1.2, rng()),
      heading: 2,
      phase: 0,
      hostile: role === 'raider',
      cooldown: 0,
    };
  }
  chunk(cx: number, cy: number): Chunk {
    cx = Math.floor(Number.isFinite(cx) ? cx : 0);
    cy = Math.floor(Number.isFinite(cy) ? cy : 0);
    const cacheKey = key(cx, cy),
      cached = this.cache.get(cacheKey);
    if (cached) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }
    const x0 = cx * CHUNK_SIZE,
      y0 = cy * CHUNK_SIZE,
      layouts = this.layouts(x0 + 7.5, y0 + 7.5, 12),
      vaults = this.vaultsForChunk(x0, y0);
    const chunk: Chunk = { cx, cy, tiles: [], props: [], npcs: [], settlements: [] };
    const contains = (p: Point) =>
      p.x >= x0 && p.x < x0 + CHUNK_SIZE && p.y >= y0 && p.y < y0 + CHUNK_SIZE;
    const add = (p: Prop) => {
      if (!contains(p)) return;
      if (p.solid && this.highway(p.x, p.y)) return;
      chunk.props.push(p);
    };
    for (let y = y0; y < y0 + CHUNK_SIZE; y++)
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const tile = this.terrain(x, y, layouts, vaults);
        chunk.tiles.push(tile);
        const roll = deriveSeed(this.seed, 'ecology', x, y) / 0xffffffff;
        if (tile.site) continue;
        if (tile.biome === 'settlement') {
          const town = layouts.find(
            (l) =>
              Math.abs(l.settlement.x - x) <= l.settlement.radius &&
              Math.abs(l.settlement.y - y) <= l.settlement.radius,
          )!.settlement;
          const dx = Math.abs(x - town.x),
            dy = y - town.y;
          const reservedGarden = dx <= 6 && dy >= 3 && dy <= 8;
          const clearWall = layouts.every((l) =>
            l.buildings.every(
              (b) => Math.abs(x - b.x) > b.halfX + 1 || Math.abs(y - b.y) > b.halfY + 1,
            ),
          );
          if (
            tile.terrain === 'snow' &&
            !tile.building &&
            clearWall &&
            Math.max(dx, Math.abs(dy)) >= 7 &&
            !reservedGarden
          ) {
            const clearNeighbor = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].every(
              ([dx, dy]) => deriveSeed(this.seed, 'ecology', x + dx, y + dy) / 0xffffffff >= 0.16,
            );
            if (roll < 0.14 && clearNeighbor)
              add(
                this.prop(
                  'pine',
                  x,
                  y,
                  this.generation === 3 ? 'Courtyard frostwood' : 'Cathedral frostwood',
                ),
              );
            else if (roll >= 0.14 && roll < 0.16 && clearNeighbor)
              add(this.prop('rock', x, y, 'Weathered mineral stone'));
            else if (roll < 0.2) add(this.prop('mushroom', x, y, 'Snowcap colony'));
          }
          continue;
        }
        if (!['snow', 'grass', 'ice'].includes(tile.terrain)) continue;
        if (roll < 0.026) {
          const kind: PropKind =
            tile.biome === 'marsh'
              ? 'heartleaf'
              : tile.biome === 'highlands'
                ? 'emberroot'
                : 'cequin';
          add(
            this.prop(
              kind,
              x,
              y,
              { heartleaf: 'Heartleaf', emberroot: 'Emberroot', cequin: 'Cequin' }[kind],
            ),
          );
        } else if (tile.biome === 'frostwood' && roll < 0.18)
          add(this.prop('pine', x, y, 'Frostwood pine'));
        else if (tile.biome === 'highlands' && roll < 0.11)
          add(this.prop('rock', x, y, 'Iron-bearing stone'));
        else if (roll > 0.992) add(this.prop('mushroom', x, y, 'Winter fungus'));
        const occupied = chunk.props.some((p) => p.x === x && p.y === y && p.solid);
        if (
          !occupied &&
          roll > 0.988 &&
          roll < 0.991 &&
          Math.hypot(x, y) > 30 &&
          !layouts.some(
            (l) =>
              Math.abs(l.settlement.x - x) < l.settlement.radius + 6 &&
              Math.abs(l.settlement.y - y) < l.settlement.radius + 6,
          )
        ) {
          const local = this.town(
            Math.round(x / this.spacing),
            Math.round(y / this.spacing),
          ).settlement;
          const role: NpcRole =
            deriveSeed(this.seed, 'wanderer-role', x, y) % 3 === 0 ? 'pilgrim' : 'raider';
          chunk.npcs.push(
            this.resident(
              local,
              role,
              x,
              y,
              deriveSeed(this.seed, 'wanderer', x, y),
              `wanderer:${x}:${y}`,
            ),
          );
        }
      }
    for (const vault of vaults) {
      const s = vault.site;
      add(this.prop('chest', s.reward.x, s.reward.y, 'Sealed botanical archive', `${s.id}:cache`));
      add(this.prop('lamp', s.entrance.x + 1, s.entrance.y, 'Excavation lantern', `${s.id}:lamp`));
      add(
        this.prop(
          'notice',
          s.entrance.x + 1,
          vault.roadY - 1,
          'Seed vault — follow this path north',
          `${s.id}:notice`,
        ),
      );
      const settlement = this.town(
        Math.floor(s.x / this.spacing),
        Math.floor(s.y / this.spacing),
      ).settlement;
      vault.guards.forEach((p, i) => {
        if (contains(p))
          chunk.npcs.push(
            this.resident(
              settlement,
              'raider',
              p.x,
              p.y,
              deriveSeed(s.seed, 'guard', i),
              `${s.id}:guard:${i}`,
            ),
          );
      });
    }
    for (const { settlement: s, buildings } of layouts) {
      if (contains(s)) chunk.settlements.push(s);
      add(this.prop('notice', s.x - 2, s.y + 1, `${s.name} noticeboard`, `${s.id}:notice`, s.clan));
      add(
        this.prop(
          'radio',
          s.x + 3,
          s.y + 1,
          'Long-range radio',
          s.id === 'origin' ? 'origin-radio' : `${s.id}:radio`,
          s.clan,
        ),
      );
      add(
        this.prop(
          'shrine',
          s.x - 2,
          s.y - 2,
          'Memorial of borrowed lives',
          `${s.id}:shrine`,
          s.clan,
        ),
      );
      add(
        this.prop(
          'workbench',
          s.x + 4,
          s.y + 5,
          'Botanical workbench',
          `${s.id}:workbench`,
          s.clan,
        ),
      );
      add(this.prop('cequin', s.x - 2, s.y + 5, 'Cequin', `${s.id}:cequin`, s.clan));
      add(this.prop('cequin', s.x - 2, s.y + 6, 'Cequin', `${s.id}:cequin:2`, s.clan));
      add(this.prop('cequin', s.x - 2, s.y + 7, 'Cequin', `${s.id}:cequin:3`, s.clan));
      add(this.prop('heartleaf', s.x - 3, s.y + 6, 'Heartleaf', `${s.id}:heartleaf`, s.clan));
      add(this.prop('heartleaf', s.x - 3, s.y + 7, 'Heartleaf', `${s.id}:heartleaf:2`, s.clan));
      add(this.prop('emberroot', s.x + 3, s.y + 7, 'Emberroot', `${s.id}:emberroot`, s.clan));
      add(this.prop('emberroot', s.x + 3, s.y + 6, 'Emberroot', `${s.id}:emberroot:2`, s.clan));
      add(this.prop('pine', s.x - 5, s.y + 4, 'Cultivated frostwood', `${s.id}:timber:1`, s.clan));
      add(this.prop('pine', s.x - 5, s.y + 6, 'Cultivated frostwood', `${s.id}:timber:2`, s.clan));
      add(this.prop('rock', s.x + 5, s.y + 6, 'Iron-bearing stone', `${s.id}:ore:1`, s.clan));
      add(this.prop('rock', s.x + 5, s.y + 7, 'Iron-bearing stone', `${s.id}:ore:2`, s.clan));
      for (const [dx, dy] of [
        [-4, 5],
        [-4, 7],
        [4, 6],
        [4, 8],
      ])
        add(
          this.prop(
            'mushroom',
            s.x + dx,
            s.y + dy,
            'Cultivated winter fungi',
            `${s.id}:garden:${dx}:${dy}`,
            s.clan,
          ),
        );
      add(
        this.prop(
          'banner',
          s.x + 2,
          s.y - 2,
          `${CLANS[s.clan].name} standard`,
          `${s.id}:banner`,
          s.clan,
        ),
      );
      add(this.prop('bench', s.x - 4, s.y + 2, 'Winter bench', `${s.id}:bench`, s.clan));
      for (const [dx, dy] of [
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ])
        add(
          this.prop(
            'lamp',
            s.x + dx,
            s.y + dy,
            'Lumen lantern',
            `${s.id}:lamp:${dx}:${dy}`,
            s.clan,
          ),
        );
      for (const [i, b] of buildings.entries()) {
        for (const side of [-1, 1])
          add(
            this.prop(
              'door',
              b.x,
              b.y + side * b.halfY,
              b.name,
              `${b.id}:door:${side}`,
              s.clan,
              b.id,
            ),
          );
        add(
          this.prop(
            this.generation === 3
              ? (
                  {
                    church: 'shrine',
                    house: 'crate',
                    inn: 'bench',
                    workshop: 'workbench',
                    greenhouse: 'cequin',
                    storehouse: 'chest',
                    hall: 'notice',
                  } as const
                )[b.kind!]
              : i === 0
                ? 'shrine'
                : i === 1
                  ? 'workbench'
                  : i === 2
                    ? 'crate'
                    : 'chest',
            b.x + 1,
            b.y,
            b.name,
            `${b.id}:fixture`,
            s.clan,
            b.id,
          ),
        );
      }
      const residents: [NpcRole, number, number, string?][] = [
        ['botanist', -3, 4, s.id === 'origin' ? 'origin-botanist' : undefined],
        ['archivist', 0, -8, s.id === 'origin' ? 'origin-archivist' : undefined],
        ['engineer', 4, 4, s.id === 'origin' ? 'origin-engineer' : undefined],
        ['merchant', -3, 1],
        ['guard', 3, -1],
        ['refugee', -4, 0],
        ['pilgrim', 2, 4],
      ];
      const presentResidents =
        this.generation === 3 && s.rank === 'hamlet'
          ? residents.filter(([role]) => ['botanist', 'merchant', 'pilgrim'].includes(role))
          : residents;
      presentResidents.forEach(([role, dx, dy, id], index) => {
        const npc = this.resident(s, role, s.x + dx, s.y + dy, index, id);
        if (contains(npc)) chunk.npcs.push(npc);
      });
    }
    this.cache.set(cacheKey, chunk);
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return chunk;
  }
  tile(x: number, y: number): Tile {
    x = integer(x);
    y = integer(y);
    const cx = Math.floor(x / CHUNK_SIZE),
      cy = Math.floor(y / CHUNK_SIZE);
    return this.chunk(cx, cy).tiles[(y - cy * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE];
  }
  private around<T extends Point>(
    x: number,
    y: number,
    radius: number,
    field: 'props' | 'npcs' | 'settlements',
  ): T[] {
    x = integer(x);
    y = integer(y);
    radius = Math.min(128, Math.max(0, Number.isFinite(radius) ? radius : 0));
    const result: T[] = [];
    for (
      let cy = Math.floor((y - radius) / CHUNK_SIZE);
      cy <= Math.floor((y + radius) / CHUNK_SIZE);
      cy++
    )
      for (
        let cx = Math.floor((x - radius) / CHUNK_SIZE);
        cx <= Math.floor((x + radius) / CHUNK_SIZE);
        cx++
      ) {
        for (const item of this.chunk(cx, cy)[field])
          if (squareDistance(item, { x, y }) <= radius * radius) result.push(item as unknown as T);
      }
    return result;
  }
  propsAround(x: number, y: number, radius: number): Prop[] {
    return this.around<Prop>(x, y, radius, 'props');
  }
  npcsAround(x: number, y: number, radius: number): Npc[] {
    return this.around<Npc>(x, y, radius, 'npcs');
  }
  settlementsAround(x: number, y: number, radius: number): Settlement[] {
    x = integer(x);
    y = integer(y);
    radius = Math.min(
      this.generation === 3 ? 2048 : 128,
      Math.max(0, Number.isFinite(radius) ? radius : 0),
    );
    return this.layouts(x, y, radius)
      .map((layout) => layout.settlement)
      .filter((settlement) => squareDistance(settlement, { x, y }) <= radius * radius);
  }
  vaultsAround(x: number, y: number, radius: number): VaultSite[] {
    if (this.generation === 1) return [];
    x = integer(x);
    y = integer(y);
    radius = Math.min(128, Math.max(0, Number.isFinite(radius) ? radius : 0));
    if (this.generation === 3) {
      const result: VaultSite[] = [];
      for (
        let gy = Math.ceil((y - radius - this.spacing / 2 - 1) / this.spacing);
        gy <= Math.floor((y + radius - this.spacing / 2 + 1) / this.spacing);
        gy++
      )
        for (
          let gx = Math.ceil((x - radius - this.spacing / 2 - 1) / this.spacing);
          gx <= Math.floor((x + radius - this.spacing / 2 + 1) / this.spacing);
          gx++
        ) {
          const vault = this.vault(gx, gy);
          if (vault && squareDistance(vault.site, { x, y }) <= radius * radius)
            result.push(vault.site);
        }
      return result;
    }
    const result: VaultSite[] = [];
    for (let gy = Math.ceil((y - radius - 40) / 80); gy <= Math.floor((y + radius - 40) / 80); gy++)
      for (
        let gx = Math.ceil((x - radius - 40) / 80);
        gx <= Math.floor((x + radius - 40) / 80);
        gx++
      ) {
        const vault = this.vault(gx, gy);
        if (vault && squareDistance(vault.site, { x, y }) <= radius * radius)
          result.push(vault.site);
      }
    return result;
  }
  /** Planning may treat doors as open; movement and projectiles use their actual state. */
  blocked(x: number, y: number, removed: Set<string> = new Set(), doorsOpen = false): boolean {
    x = integer(x);
    y = integer(y);
    const tile = this.tile(x, y);
    if (tile.terrain === 'wall' || tile.terrain === 'water') return true;
    return this.chunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE)).props.some(
      (p) =>
        (p.solid || (p.kind === 'door' && !doorsOpen)) &&
        p.x === x &&
        p.y === y &&
        !removed.has(p.id),
    );
  }
}
