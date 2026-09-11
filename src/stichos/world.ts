import { deriveSeed, random, mix } from '../procedural/random.ts';
import type {
  Appearance,
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

export const CHUNK_SIZE = 16;
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
}
interface TownLayout {
  settlement: Settlement;
  buildings: Building[];
}

/** Addressed coordinate generation makes eviction, travel direction, and load order irrelevant. */
export class InfiniteWorld {
  readonly seed: number;
  readonly spawn: Point = { x: 0, y: 5 };
  readonly clans: Clan[] = CLANS.map((clan) => ({ ...clan }));
  private cache = new Map<string, Chunk>();
  constructor(seed: number) {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 0;
  }
  get cacheSize() {
    return this.cache.size;
  }

  private noise(x: number, y: number, scale: number, address: string): number {
    const px = x / scale,
      py = y / scale,
      ix = Math.floor(px),
      iy = Math.floor(py);
    const value = (dx: number, dy: number) =>
      deriveSeed(this.seed, address, ix + dx, iy + dy) / 0xffffffff;
    return mix(
      mix(value(0, 0), value(1, 0), smooth(px - ix)),
      mix(value(0, 1), value(1, 1), smooth(px - ix)),
      smooth(py - iy),
    );
  }
  private town(gx: number, gy: number): TownLayout {
    const seed = deriveSeed(this.seed, 'settlement', gx, gy),
      rng = random(seed),
      origin = gx === 0 && gy === 0;
    const x = gx * TOWN_SPACING + (origin ? 0 : Math.floor(rng() * 13) - 6);
    const y = gy * TOWN_SPACING + (origin ? 0 : Math.floor(rng() * 13) - 6);
    const clan = origin ? 0 : Math.floor(rng() * CLANS.length);
    const name = origin
      ? 'Stíchos Cathedral'
      : `${pick(['Vey', 'Mor', 'El', 'Khar', 'Sael', 'Or', 'Cal', 'Thren'], rng)}${pick(['wick', 'mere', 'holt', 'grave', 'gard', 'watch', 'fell', 'haven'], rng)}`;
    const settlement: Settlement = {
      id: origin ? 'origin' : `town:${gx}:${gy}`,
      seed,
      x,
      y,
      name,
      clan,
      kind: origin ? 'cathedral' : pick(['village', 'foundry', 'cathedral'] as const, rng),
      radius: origin ? 19 : 16 + Math.floor(rng() * 3),
    };
    const buildings: Building[] = [
      {
        id: `${settlement.id}:hall`,
        x,
        y: y - (origin ? 5 : 9),
        halfX: origin ? 7 : 3 + Math.floor(rng() * 2),
        halfY: origin ? 4 : 3,
        name: settlement.kind === 'cathedral' ? 'Winter cathedral' : 'Assembly hall',
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
        x: x + side * (origin ? 13 : 9),
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
  private layouts(x: number, y: number, radius = 20): TownLayout[] {
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
  private terrain(x: number, y: number, layouts: TownLayout[]): Tile {
    const seed = deriveSeed(this.seed, 'tile', x, y),
      detail = seed / 0xffffffff;
    const elevation = this.noise(x, y, 29, 'elevation') * 0.7 + this.noise(x, y, 11, 'folds') * 0.3;
    const moisture = this.noise(x, y, 43, 'moisture'),
      cold = this.noise(x, y, 61, 'cold');
    let biome: Biome =
      elevation > 0.66
        ? 'highlands'
        : moisture > 0.6
          ? 'marsh'
          : cold > 0.52
            ? 'tundra'
            : 'frostwood';
    let terrain: Tile['terrain'] =
      elevation < 0.32 && moisture > 0.48
        ? 'water'
        : cold > 0.69 && moisture > 0.54
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
      temperature: Number((-19 + cold * 11 + moisture * 2).toFixed(2)),
      detail,
    };
    const highway =
      Math.abs(x - Math.round(x / TOWN_SPACING) * TOWN_SPACING) <= 1 ||
      Math.abs(y - Math.round(y / TOWN_SPACING) * TOWN_SPACING) <= 1;
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
        }
    }
    // Buildings that meet a trunk road form an arcade instead of sealing the
    // route. This preserves both interior rooms and an uninterrupted road grid.
    if (highway && tile.terrain === 'wall') tile.terrain = 'floor';
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
      layouts = this.layouts(x0 + 7.5, y0 + 7.5, 12);
    const chunk: Chunk = { cx, cy, tiles: [], props: [], npcs: [], settlements: [] };
    const contains = (p: Point) =>
      p.x >= x0 && p.x < x0 + CHUNK_SIZE && p.y >= y0 && p.y < y0 + CHUNK_SIZE;
    const add = (p: Prop) => {
      if (!contains(p)) return;
      if (
        p.solid &&
        (Math.abs(p.x - Math.round(p.x / TOWN_SPACING) * TOWN_SPACING) <= 1 ||
          Math.abs(p.y - Math.round(p.y / TOWN_SPACING) * TOWN_SPACING) <= 1)
      )
        return;
      chunk.props.push(p);
    };
    for (let y = y0; y < y0 + CHUNK_SIZE; y++)
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const tile = this.terrain(x, y, layouts);
        chunk.tiles.push(tile);
        const roll = deriveSeed(this.seed, 'ecology', x, y) / 0xffffffff;
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
            if (roll < 0.14 && clearNeighbor) add(this.prop('pine', x, y, 'Cathedral frostwood'));
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
            Math.round(x / TOWN_SPACING),
            Math.round(y / TOWN_SPACING),
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
            i === 0 ? 'shrine' : i === 1 ? 'workbench' : i === 2 ? 'crate' : 'chest',
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
      residents.forEach(([role, dx, dy, id], index) => {
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
    return this.around<Settlement>(x, y, radius, 'settlements');
  }
  blocked(x: number, y: number, removed: Set<string> = new Set()): boolean {
    x = integer(x);
    y = integer(y);
    const tile = this.tile(x, y);
    if (tile.terrain === 'wall' || tile.terrain === 'water') return true;
    return this.chunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE)).props.some(
      (p) => p.solid && p.x === x && p.y === y && !removed.has(p.id),
    );
  }
}
