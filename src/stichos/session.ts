import {
  InfiniteWorld,
  appearance,
  CHUNK_SIZE,
  ORIGIN_CITY_NAME,
  type WorldGeneration,
} from './world.ts';
import { deriveSeed } from '../procedural/random.ts';
import { weaponProfile as generatedWeaponProfile } from './equipment.ts';
import { plantProfile, type PlantKind } from './botany.ts';
import {
  createFreeLife,
  restoreFreeLife,
  createCommission,
  freeLifeMilestones,
} from './free-life.ts';
import {
  createProgression,
  restoreProgression,
  grantPractice,
  skillBonuses,
  upgradeBonuses,
  homeEffects,
  applyCosmetic,
  previewProgression,
  applyProgression,
  type ProgressionAction,
  type ProgressionState,
  type HomeAddress,
} from './progression.ts';
import {
  buildCampaign,
  createCampaignState,
  validateCampaignState,
  CAMPAIGN_ACTS,
  CAMPAIGN_LENGTH,
  type CampaignPlan,
  type CampaignStep,
} from './campaign.ts';
import type {
  Dialogue,
  Effect,
  GameEvent,
  Input,
  ItemId,
  JournalEntry,
  Npc,
  Player,
  Point,
  Prop,
  Quest,
  Recipe,
  Settlement,
} from './types.ts';

export const ITEMS: Record<ItemId, { name: string; description: string; price: number }> = {
  cequin: {
    name: 'Cequin',
    description:
      'Rosemary-like leaves that sustain breath in the cold. Protects breathing for three minutes.',
    price: 4,
  },
  heartleaf: {
    name: 'Heartleaf',
    description: 'A medicinal leaf used in healing salves and dressings.',
    price: 3,
  },
  emberroot: {
    name: 'Emberroot',
    description: 'A warming root used in botanical tonics.',
    price: 4,
  },
  wood: {
    name: 'Timber',
    description: 'Gathered with the staff. Used for tools and radio repairs.',
    price: 3,
  },
  ore: {
    name: 'Conductive ore',
    description: 'Recovered with the staff. A raw material for lenses and wiring.',
    price: 5,
  },
  salve: {
    name: 'Heartleaf salve',
    description: 'A prepared botanical medicine. Restores 35 health.',
    price: 12,
  },
  tonic: { name: 'Ember tonic', description: 'Restores 55 warmth and 25 breath.', price: 14 },
  rations: {
    name: 'Plant rations',
    description: 'Restores 35 stamina, 20 warmth, and 8 health.',
    price: 6,
  },
  bandage: {
    name: 'Botanical dressing',
    description: 'A clean plant-fibre dressing. Restores 20 health.',
    price: 8,
  },
  seal: {
    name: 'Family seal',
    description: 'Evidence of service to a local community.',
    price: 20,
  },
  lens: {
    name: 'Signal lens',
    description: 'A carefully aligned conductive lens. Craft at a workbench.',
    price: 24,
  },
};

export const RECIPES: Recipe[] = [
  {
    id: 'salve',
    name: 'Heartleaf salve',
    description: 'Crush two heartleaves into a restorative salve.',
    cost: { heartleaf: 2 },
    result: 'salve',
    amount: 1,
  },
  {
    id: 'tonic',
    name: 'Ember tonic',
    description: 'Prepare emberroot with cequin to warm the body.',
    cost: { emberroot: 2, cequin: 1 },
    result: 'tonic',
    amount: 1,
  },
  {
    id: 'bandage',
    name: 'Botanical dressing',
    description: 'Weave heartleaf fibre with a cequin antiseptic.',
    cost: { heartleaf: 1, cequin: 1 },
    result: 'bandage',
    amount: 2,
  },
  {
    id: 'lens',
    name: 'Signal lens',
    description: 'Align two conductive ores in a timber housing at a workbench.',
    cost: { ore: 2, wood: 1 },
    result: 'lens',
    amount: 1,
  },
];

type Weapon = 'staff' | 'sword' | 'bow';
export interface WeaponProfile {
  name: string;
  material: string;
  effect: 'stagger' | 'breath' | 'warmth';
  effectDescription: string;
  color: string;
  damage: number;
  range: number;
  cooldown: number;
  construction?: string;
}
type SupplyJob = {
  npcId: string;
  item: 'cequin' | 'heartleaf' | 'emberroot';
  amount: number;
  number: number;
  active: boolean;
  target: Point;
};
type BodyPossessions = {
  npcId: string;
  notebook: boolean;
  inventory: Partial<Record<ItemId, number>>;
  coins: number;
  weapons: Weapon[];
  equipped: Weapon;
};
type CorrespondenceJob = {
  sourceId: string;
  sourceName: string;
  sourceClan: number;
  sourcePoint: Point;
  recipientId: string;
  recipientName: string;
  recipientClan: number;
  settlementId: string;
  settlementName: string;
  target: Point;
  number: number;
  payload: string;
  omitted: string;
  reward: number;
  status: 'active' | 'delivered' | 'revealed' | 'withheld' | 'cancelled';
};
type Arrow = {
  owner: 'player' | 'enemy';
  effect: Effect;
  vx: number;
  vy: number;
  damage: number;
  enchantment: WeaponProfile['effect'];
};
type EnemyIntent = {
  remaining: number;
  heading: number;
  kind: Weapon;
  damage: number;
  range: number;
  color: string;
  warning: Effect;
};
export const EXPLORATION_CELL_SIZE = 8;
export interface ExplorationBounds {
  minX: number;
  minY: number;
  /** Upper bounds are exclusive world-tile coordinates. */
  maxX: number;
  maxY: number;
}
export interface DiscoveredSite extends Point {
  id: string;
  name: string;
  kind: 'settlement' | 'vault';
  detail: string;
  clan?: number;
  radius: number;
}
type ExplorationSave = {
  version: 1;
  revision: number;
  /** Prefix of the existing ordered visited list; no duplicate legacy coordinates are stored. */
  legacyVisitedCount: number;
  chunks: [number, number, number][];
  sites: DiscoveredSite[];
};
const CAPACITY = 60;
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const itemIds = Object.keys(ITEMS) as ItemId[];
const isItem = (v: string): v is ItemId => itemIds.includes(v as ItemId);
const maxExplorationChunk = Math.ceil(Number.MAX_SAFE_INTEGER / CHUNK_SIZE);
const chunkCoordinates = (key: unknown): [number, number] | null => {
  if (typeof key !== 'string' || !/^-?\d+,-?\d+$/.test(key)) return null;
  const [x, y] = key.split(',').map(Number);
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    Math.abs(x) > maxExplorationChunk ||
    Math.abs(y) > maxExplorationChunk ||
    `${x},${y}` !== key
  )
    return null;
  return [x, y];
};

/** Persistent human-scale simulation; chunk eviction never discards a player's actions. */
export class Stichos {
  readonly world: InfiniteWorld;
  player: Player;
  inventory: Partial<Record<ItemId, number>> = { cequin: 3, rations: 2, bandage: 2 };
  readonly removed = new Set<string>();
  readonly opened = new Set<string>();
  readonly weapons = new Set<Weapon>(['staff']);
  effects: Effect[] = [];
  npcs: Npc[] = [];
  quests: Quest[] = [];
  journal: JournalEntry[] = [];
  dialogue: Dialogue | null = null;
  events: GameEvent[] = [];
  time = 0;
  distanceTraveled = 0;
  readonly visited = new Set<string>();
  private fogChunks = new Map<string, number>();
  private legacyFogChunks = new Set<string>();
  private knownSites = new Map<string, Readonly<DiscoveredSite>>();
  private knownSiteView: ReadonlyArray<Readonly<DiscoveredSite>> = Object.freeze([]);
  private fogBounds: Readonly<ExplorationBounds> | null = null;
  private knowledgeRevision = 0;
  private lastExplorationPoint: Point | null = null;
  reputation = [0, 0, 0, 0, 0, 0];
  storyStage = 0;
  phase: 'playing' | 'lost' = 'playing';
  occupiedNpcId: string | null = null;
  private occupiedBody: Npc | null = null;
  private bodyPossessions = new Map<string, BodyPossessions>();
  private notebook = true;
  private campaignState = createCampaignState();
  private campaignPlan: CampaignPlan | null = null;
  private campaignOrdinary = false;
  progression: ProgressionState;
  private cosmeticEntitlements: string[] = [];
  private freeLifeState = createFreeLife();
  private npcMemory = new Map<string, Npc>();
  private npcRuntime = new Map<string, Npc>();
  private supplyJobs = new Map<string, SupplyJob>();
  private correspondenceJobs = new Map<string, CorrespondenceJob>();
  private arrows: Arrow[] = [];
  private enemyIntents = new Map<string, EnemyIntent>();
  private nextEffect = 1;
  private refreshClock = 0;
  private stepClock = 0;
  private lifeCount = 0;
  private restAnchor: Point;
  private transferDialogTarget: string | null = null;
  private seed: number;

  constructor(seed: number, generation: WorldGeneration = 3) {
    if (!Number.isSafeInteger(seed)) throw new Error('A world seed must be a safe integer.');
    if (![1, 2, 3].includes(generation)) throw new Error('Unknown world generation.');
    this.seed = seed >>> 0;
    this.progression = createProgression(this.seed);
    this.world = new InfiniteWorld(this.seed, generation);
    this.restAnchor = { ...this.world.spawn };
    this.player = {
      ...this.world.spawn,
      name: 'Theo Bishop',
      bodyName: 'The priest',
      clan: 1,
      appearance: appearance(this.seed ^ 0x7468656f, 'archivist', 1),
      hp: 100,
      maxHp: 100,
      breath: 100,
      warmth: 90,
      stamina: 100,
      heading: Math.PI / 2,
      phase: 0,
      speed: 3,
      level: 1,
      xp: 0,
      coins: 18,
      attackCooldown: 0,
      wardCooldown: 0,
      cequinTime: 0,
    };
    this.player.appearance.weapon = 'staff';
    this.player.appearance.coat = '#8d5847';
    this.player.appearance.cloak = true;
    this.quests = [
      {
        id: 'first-breath',
        title: 'Twenty stíchoi later',
        description:
          '3886. Ten Earth years have passed in the priest’s body. Begin with the people keeping Vespera alive.',
        stage: 0,
        complete: false,
        objective: 'Speak with the botanist near the plaza.',
        target: this.originTarget('origin-botanist'),
      },
    ];
    this.entry(
      'Theo Bishop · 3886',
      'Theo comes from the future, with many missions across planets and eras behind him. Ten Earth years, twenty stíchoi, have passed in this priest’s body on the planet Stíchos. He does not know why the transmission failed or what the Sallas family conceals. In Vespera, cequin sustains breath while he looks for evidence.',
    );
    this.refreshNpcs();
    this.visit();
  }

  /** A unique physical object belonging to the priest, separate from remembered pages. */
  get hasNotebook() {
    return this.notebook;
  }

  get transferReady() {
    return this.storyStage >= 4;
  }
  get explorationRevision() {
    return this.knowledgeRevision;
  }
  get exploredBounds() {
    return this.fogBounds;
  }
  get discoveredSites() {
    return this.knownSiteView;
  }

  explored(x: number, y: number) {
    if (
      !finite(x) ||
      !finite(y) ||
      Math.abs(x) > Number.MAX_SAFE_INTEGER ||
      Math.abs(y) > Number.MAX_SAFE_INTEGER
    )
      return false;
    const cellX = Math.floor(x / EXPLORATION_CELL_SIZE),
      cellY = Math.floor(y / EXPLORATION_CELL_SIZE);
    const cx = Math.floor(cellX / 2),
      cy = Math.floor(cellY / 2);
    const key = `${cx},${cy}`;
    if (this.legacyFogChunks.has(key)) return true;
    const bit = 1 << ((cellY - cy * 2) * 2 + cellX - cx * 2);
    return !!((this.fogChunks.get(key) ?? 0) & bit);
  }

  /** Read-only 8×8 world-cell origins, clipped without expanding old travel histories in memory. */
  *exploredCells(
    bounds?: ExplorationBounds,
  ): IterableIterator<{ x: number; y: number; size: number }> {
    if (
      bounds &&
      (!Object.values(bounds).every(finite) ||
        bounds.maxX <= bounds.minX ||
        bounds.maxY <= bounds.minY)
    )
      return;
    const emit = function* (key: string, mask: number) {
      const [cx, cy] = chunkCoordinates(key)!;
      const chunkX = cx * CHUNK_SIZE,
        chunkY = cy * CHUNK_SIZE;
      if (
        bounds &&
        (chunkX >= bounds.maxX ||
          chunkY >= bounds.maxY ||
          chunkX + CHUNK_SIZE <= bounds.minX ||
          chunkY + CHUNK_SIZE <= bounds.minY)
      )
        return;
      for (let bit = 0; bit < 4; bit++) {
        if (!(mask & (1 << bit))) continue;
        const x = chunkX + (bit % 2) * EXPLORATION_CELL_SIZE;
        const y = chunkY + Math.floor(bit / 2) * EXPLORATION_CELL_SIZE;
        if (
          !bounds ||
          (x < bounds.maxX &&
            y < bounds.maxY &&
            x + EXPLORATION_CELL_SIZE > bounds.minX &&
            y + EXPLORATION_CELL_SIZE > bounds.minY)
        )
          yield { x, y, size: EXPLORATION_CELL_SIZE };
      }
    };
    if (bounds) {
      const minX = Math.max(-maxExplorationChunk, Math.floor(bounds.minX / CHUNK_SIZE));
      const minY = Math.max(-maxExplorationChunk, Math.floor(bounds.minY / CHUNK_SIZE));
      const maxX = Math.min(maxExplorationChunk, Math.ceil(bounds.maxX / CHUNK_SIZE) - 1);
      const maxY = Math.min(maxExplorationChunk, Math.ceil(bounds.maxY / CHUNK_SIZE) - 1);
      if (minX > maxX || minY > maxY) return;
      const area = (maxX - minX + 1) * (maxY - minY + 1);
      // A small minimap samples visible chunk addresses instead of scanning a life's history.
      if (area < 50000 && area < this.legacyFogChunks.size + this.fogChunks.size) {
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const key = `${x},${y}`;
            const mask = this.legacyFogChunks.has(key) ? 15 : (this.fogChunks.get(key) ?? 0);
            if (mask) yield* emit(key, mask);
          }
        }
        return;
      }
    }
    for (const key of this.legacyFogChunks) yield* emit(key, 15);
    for (const [key, mask] of this.fogChunks)
      if (!this.legacyFogChunks.has(key)) yield* emit(key, mask);
  }
  get transferCandidate(): Npc | null {
    return this.transferCandidates[0] ?? null;
  }
  get dispatches() {
    return [...this.correspondenceJobs.values()].map((job) => clone(job));
  }
  get transferCandidates(): Npc[] {
    if (!this.transferReady) return [];
    const center = this.phase === 'lost' ? this.restAnchor : this.player;
    const candidates = new Map<string, Npc>();
    for (const original of this.world.npcsAround(center.x, center.y, 14)) {
      const npc = this.npcMemory.get(original.id) ?? this.npcRuntime.get(original.id) ?? original;
      candidates.set(npc.id, npc);
    }
    for (const npc of [...this.npcMemory.values(), ...this.npcs]) candidates.set(npc.id, npc);
    const priority = (npc: Npc) =>
      this.campaignState.ending && npc.id === `body:theo-priest:${this.seed}`
        ? -1
        : npc.role === 'pilgrim'
          ? 0
          : npc.role === 'refugee'
            ? 1
            : 2;
    return [...candidates.values()]
      .filter(
        (npc) =>
          npc.id !== this.occupiedNpcId &&
          npc.hp > 0 &&
          !npc.hostile &&
          !this.removed.has(npc.id) &&
          (this.campaignState.ending !== null ||
            ['pilgrim', 'refugee', 'guard'].includes(npc.role)) &&
          !(npc.role === 'guard' && this.reputation[npc.clan] < -24) &&
          (distance(npc, center) <= 14 ||
            (this.campaignState.ending !== null &&
              this.freeLifeState.knownHosts.includes(npc.id))) &&
          this.clear(npc),
      )
      .sort((a, b) =>
        this.campaignState.ending
          ? Number(b.id === `body:theo-priest:${this.seed}`) -
              Number(a.id === `body:theo-priest:${this.seed}`) ||
            Number(distance(b, center) <= 14) - Number(distance(a, center) <= 14) ||
            priority(a) - priority(b) ||
            distance(a, center) - distance(b, center)
          : priority(a) - priority(b) || distance(a, center) - distance(b, center),
      )
      .slice(0, this.campaignState.ending ? 128 : 3)
      .map((npc) => clone(npc));
  }
  get bodyId() {
    return this.occupiedNpcId ?? `body:theo-priest:${this.seed}`;
  }
  get displayAppearance() {
    return applyCosmetic(
      this.player.appearance,
      this.progression,
      this.bodyId,
      this.cosmeticEntitlements,
    );
  }
  setCosmeticEntitlements(ids: readonly string[]) {
    this.cosmeticEntitlements = [...new Set(ids.filter((id) => typeof id === 'string'))].slice(
      0,
      64,
    );
  }
  get nearbyHomes(): HomeAddress[] {
    const homes = new Map<string, HomeAddress>();
    for (const prop of this.world.propsAround(this.player.x, this.player.y, 12)) {
      if (prop.kind !== 'door') continue;
      const tile = this.world.tile(prop.x, prop.y);
      if (
        !tile.building ||
        !['house', 'inn'].includes(
          tile.buildingKind ?? (tile.building.includes(':house:') ? 'house' : ''),
        )
      )
        continue;
      const town = this.world
        .settlementsAround(prop.x, prop.y, 64)
        .find((t) => tile.building!.startsWith(`${t.id}:`));
      if (!town) continue;
      const southDoor =
        this.world
          .propsAround(prop.x, prop.y, 24)
          .find(
            (p) => p.kind === 'door' && p.building === tile.building && p.id.endsWith(':door:1'),
          ) ?? prop;
      const address = {
        id: tile.building,
        buildingId: tile.building,
        settlementId: town.id,
        name: `${town.name} · ${tile.buildingKind === 'inn' ? 'inn rooms' : 'house'} ${tile.building.split(':').at(-1)}`,
        x: southDoor.x,
        y: southDoor.y,
      };
      const previous = homes.get(tile.building);
      if (!previous) homes.set(tile.building, address);
    }
    return [...homes.values()].sort((a, b) => distance(a, this.player) - distance(b, this.player));
  }
  private nearHome() {
    return this.progression.homes.find((home) => distance(home, this.player) <= 10);
  }
  private progressionContext() {
    return {
      bodyId: this.bodyId,
      position: this.player,
      time: this.time,
      capacity: this.capacity,
      nearWorkbench:
        !!this.nearProp('workbench') ||
        !!(this.nearHome() && homeEffects(this.nearHome()!).hasWorkbench),
      ownedWeapons: [...this.weapons],
      verifiedEntitlements: this.cosmeticEntitlements,
    };
  }
  progressionPreview(action: ProgressionAction) {
    if (this.phase !== 'playing') return { ok: false, message: 'This body cannot act.' };
    if (action.kind === 'buy-home') {
      const real = this.nearbyHomes.find((home) => home.id === action.address.id);
      if (!real || JSON.stringify(real) !== JSON.stringify(action.address))
        return { ok: false, message: 'Choose an actual nearby house or inn doorway.' };
    }
    return previewProgression(
      this.progression,
      { coins: this.player.coins, inventory: this.inventory },
      action,
      this.progressionContext(),
    );
  }
  progress(action: ProgressionAction) {
    const preview = this.progressionPreview(action);
    if (!preview.ok) {
      this.event('dialogue', preview.message);
      return preview;
    }
    const wallet = { coins: this.player.coins, inventory: this.inventory };
    const result = applyProgression(this.progression, wallet, action, this.progressionContext());
    if (result.ok) {
      this.player.coins = wallet.coins;
      if (action.kind === 'harvest' && result.gained)
        for (const [item, amount] of Object.entries(result.gained)) {
          this.freeLifeState.gardenProduce += amount ?? 0;
          this.recordFreeLife('garden', item, amount ?? 0);
        }
      this.syncFreeLife();
      this.event('quest', result.message);
      if (action.kind === 'buy-home')
        this.entry(
          'A place to return to',
          `Theo acquired ${action.address.name}. Ownership and the remembered address remain with his identity; the body carries its own equipment.`,
        );
    }
    return result;
  }
  restAtHome(homeId: string) {
    const home = this.progression.homes.find((h) => h.id === homeId);
    if (
      this.phase !== 'playing' ||
      !home ||
      distance(home, this.player) > 10 ||
      this.nearbyThreat()
    )
      return false;
    const bonus = homeEffects(home);
    this.player.hp = clamp(this.player.hp + 35 + bonus.healthRestBonus, 0, this.player.maxHp);
    this.player.warmth = clamp(this.player.warmth + 45 + bonus.warmthRestBonus);
    this.player.breath = clamp(this.player.breath + 50);
    this.player.stamina = 100;
    this.time += 30;
    this.restAnchor = { x: this.player.x, y: this.player.y };
    this.event('heal', 'Rested in your home.');
    return true;
  }
  get capacity() {
    return CAPACITY;
  }
  get carried() {
    return Object.values(this.inventory).reduce((sum, n) => sum + (n ?? 0), 0);
  }

  weaponProfile(kind: Weapon): WeaponProfile {
    const profile = generatedWeaponProfile(this.player.appearance.seed, kind, this.player.level);
    const skill = skillBonuses(this.progression),
      upgrade = upgradeBonuses(this.progression, this.bodyId, kind);
    return {
      ...profile,
      damage: profile.damage + skill.damageBonus + upgrade.damageBonus,
      range: profile.range + upgrade.rangeBonus,
      cooldown: profile.cooldown * skill.cooldownMultiplier * upgrade.cooldownMultiplier,
    };
  }

  update(dt: number, input: Input) {
    if (!finite(dt) || dt <= 0 || this.phase !== 'playing' || this.dialogue) return;
    const ix = finite(input.x) ? clamp(input.x, -1, 1) : 0;
    const iy = finite(input.y) ? clamp(input.y, -1, 1) : 0;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 0.000001) {
      const step = Math.min(remaining, 1 / 30);
      this.tick(step, { x: ix, y: iy, run: !!input.run });
      remaining -= step;
      if (this.phase !== 'playing') break;
    }
  }

  private tick(dt: number, input: Input) {
    const p = this.player;
    this.time += dt;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.wardCooldown = Math.max(0, p.wardCooldown - dt);
    p.cequinTime = Math.max(0, p.cequinTime - dt);
    const length = Math.hypot(input.x, input.y);
    const running = input.run && length > 0 && p.stamina > 1;
    if (length > 0) {
      p.heading = Math.atan2(input.y, input.x);
      const speed = p.speed * (running ? 1.55 : 1);
      const before = { x: p.x, y: p.y };
      this.move(
        p,
        (input.x / Math.max(1, length)) * speed * dt,
        (input.y / Math.max(1, length)) * speed * dt,
      );
      const moved = distance(p, before);
      this.distanceTraveled += moved;
      p.phase += moved * 2.5;
      this.stepClock += moved;
      if (this.stepClock > 0.85) {
        this.stepClock = 0;
        this.event('step');
      }
    }
    p.stamina = clamp(p.stamina + (running ? -15 : 18) * dt);
    const tile = this.world.tile(p.x, p.y);
    const sheltered = tile.terrain === 'floor';
    p.breath = clamp(p.breath + (p.cequinTime > 0 ? 0.3 : sheltered ? -0.03 : -0.11) * dt);
    p.warmth = clamp(p.warmth + (sheltered ? 1.2 : running ? -0.015 : -0.075) * dt);
    if (p.breath <= 0 || p.warmth <= 0) this.hurt((p.breath <= 0 ? 0.9 : 0.35) * dt, false);
    this.refreshClock -= dt;
    if (this.refreshClock <= 0) {
      this.refreshClock = 0.6;
      this.refreshNpcs();
      this.visit();
    }
    this.updateNpcs(dt);
    this.updateArrows(dt);
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter((e) => e.age < e.duration);
  }

  private clear(point: Point) {
    const r = 0.21;
    return [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ].every(([x, y]) => !this.world.blocked(point.x + x, point.y + y, this.removed));
  }

  private move(point: Point, dx: number, dy: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
    for (let i = 0; i < steps; i++) {
      const x = { x: point.x + dx / steps, y: point.y };
      if (this.clear(x)) point.x = x.x;
      const y = { x: point.x, y: point.y + dy / steps };
      if (this.clear(y)) point.y = y.y;
    }
  }

  private refreshNpcs() {
    for (const npc of this.npcs) {
      this.rememberNpc(npc);
      this.npcRuntime.delete(npc.id);
      this.npcRuntime.set(npc.id, clone(npc));
    }
    while (this.npcRuntime.size > 128) this.npcRuntime.delete(this.npcRuntime.keys().next().value!);
    const generated = this.world.npcsAround(this.player.x, this.player.y, 15);
    const candidates = new Map<string, Npc>();
    for (const npc of generated) {
      const saved = this.npcMemory.get(npc.id) ?? this.npcRuntime.get(npc.id);
      const actor = saved ? clone(saved) : clone(npc);
      if (
        actor.id !== this.occupiedNpcId &&
        actor.hp > 0 &&
        !this.removed.has(actor.id) &&
        distance(actor, this.player) <= 18
      )
        candidates.set(actor.id, actor);
    }
    for (const npc of this.npcMemory.values())
      if (
        npc.id !== this.occupiedNpcId &&
        npc.hp > 0 &&
        !this.removed.has(npc.id) &&
        distance(npc, this.player) <= 17 &&
        !candidates.has(npc.id)
      )
        candidates.set(npc.id, clone(npc));
    this.npcs = [...candidates.values()]
      .sort((a, b) => distance(a, this.player) - distance(b, this.player))
      .slice(0, 64);
    if (this.campaignState.ending)
      for (const npc of this.npcs) if (distance(npc, this.player) < 6) this.rememberIdentity(npc);
  }

  private rememberNpc(npc: Npc) {
    // Only consequences belong in the permanent save, not every streamed resident.
    if (
      this.npcMemory.has(npc.id) ||
      npc.id.startsWith('body:theo-priest:') ||
      npc.hp < npc.maxHp ||
      npc.hostile !== (npc.role === 'raider') ||
      this.removed.has(npc.id)
    )
      this.npcMemory.set(npc.id, clone(npc));
  }

  private updateNpcs(dt: number) {
    const active = new Set(
      this.npcs.filter((npc) => npc.hp > 0 && npc.hostile).map((npc) => npc.id),
    );
    for (const [id, intent] of this.enemyIntents)
      if (!active.has(id)) {
        intent.warning.age = intent.warning.duration;
        this.enemyIntents.delete(id);
      }
    for (const npc of this.npcs) {
      if (npc.hp <= 0 || this.phase !== 'playing') continue;
      npc.cooldown = Math.max(0, npc.cooldown - dt);
      if (npc.role === 'guard' && this.reputation[npc.clan] < -24) npc.hostile = true;
      const range = distance(npc, this.player);
      const target = npc.hostile && range < 8 ? this.player : npc.home;
      const targetDistance = distance(npc, target);
      const intent = this.enemyIntents.get(npc.id);
      if (intent) {
        intent.remaining -= dt;
        npc.heading = intent.heading;
        if (intent.remaining <= 0) {
          this.enemyIntents.delete(npc.id);
          intent.warning.age = intent.warning.duration;
          if (intent.kind === 'bow') {
            const speed = 7;
            const end = {
              x: npc.x + Math.cos(intent.heading) * intent.range,
              y: npc.y + Math.sin(intent.heading) * intent.range,
            };
            // Cover can interrupt a drawn shot; already released arrows also collide with it.
            const nearEnd = {
              x: npc.x + Math.cos(intent.heading) * Math.min(range, intent.range),
              y: npc.y + Math.sin(intent.heading) * Math.min(range, intent.range),
            };
            if (this.lineOfSight(npc, nearEnd)) {
              const effect = this.effect(
                'arrow',
                npc,
                intent.color,
                distance(npc, end) / speed,
                intent.heading,
              );
              this.arrows.push({
                owner: 'enemy',
                effect,
                vx: Math.cos(intent.heading) * speed,
                vy: Math.sin(intent.heading) * speed,
                damage: intent.damage,
                enchantment: 'stagger',
              });
              this.event('attack');
            }
          } else {
            this.event('attack');
            this.effect('slash', npc, intent.color, 0.22, intent.heading);
            const facing =
              ((this.player.x - npc.x) * Math.cos(intent.heading) +
                (this.player.y - npc.y) * Math.sin(intent.heading)) /
              Math.max(0.001, range);
            if (range <= intent.range && facing > 0.35 && this.lineOfSight(npc, this.player))
              this.hurt(intent.damage);
          }
        }
        continue;
      }
      const kind = npc.appearance.weapon === 'none' ? 'staff' : npc.appearance.weapon;
      const profile =
        npc.hostile && range < 8 ? generatedWeaponProfile(npc.appearance.seed, kind, 1) : null;
      const reach = profile ? profile.range * 0.78 : 0;
      const canAim = !!profile && range <= reach && this.lineOfSight(npc, this.player);
      if (canAim && npc.cooldown <= 0) {
        const windup =
          kind === 'bow' ? 0.42 + profile!.cooldown * 0.18 : 0.16 + profile!.cooldown * 0.1;
        const recovery = clamp(
          profile!.cooldown * 1.8,
          kind === 'bow' ? 1.1 : 0.95,
          kind === 'bow' ? 1.65 : 1.4,
        );
        npc.heading = Math.atan2(this.player.y - npc.y, this.player.x - npc.x);
        npc.cooldown = windup + recovery;
        const warning = this.effect('speech', npc, '#edbd91', windup, npc.heading);
        warning.text = kind === 'bow' ? 'Drawing bow' : 'Striking';
        this.enemyIntents.set(npc.id, {
          remaining: windup,
          heading: npc.heading,
          kind,
          damage: clamp(Math.round(profile!.damage * (npc.role === 'raider' ? 0.31 : 0.25)), 5, 10),
          range: reach,
          color: profile!.color,
          warning,
        });
      } else if (!canAim && targetDistance > (npc.hostile && range < 8 ? 0.85 : 0.5)) {
        const dx = target.x - npc.x,
          dy = target.y - npc.y;
        const speed = Math.min(2.4, npc.speed || 1.5);
        const before = { x: npc.x, y: npc.y };
        this.move(npc, (dx / targetDistance) * speed * dt, (dy / targetDistance) * speed * dt);
        npc.heading = Math.atan2(dy, dx);
        npc.phase += distance(npc, before) * 2.5;
      }
    }
  }

  private lineOfSight(from: Point, to: Point) {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 0.15));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      if (
        this.world.blocked(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, this.removed)
      )
        return false;
    }
    return true;
  }

  private nearbyThreat() {
    return this.npcs.some((npc) => {
      if (!npc.hostile || npc.hp <= 0 || this.removed.has(npc.id)) return false;
      const range = distance(npc, this.player);
      if (range < 5) return true;
      return (
        npc.appearance.weapon === 'bow' &&
        range < 8 &&
        range <= generatedWeaponProfile(npc.appearance.seed, 'bow', 1).range * 0.78 &&
        this.lineOfSight(npc, this.player)
      );
    });
  }

  nearby(): Prop | Npc | null {
    const props = this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .filter((p) => !this.removed.has(p.id) || p.kind === 'door');
    const npcs = this.npcs.filter((n) => n.hp > 0 && !n.hostile);
    return (
      [...props, ...npcs]
        .filter((p) => distance(p, this.player) <= 1.8)
        .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0] ?? null
    );
  }

  get endingSummary() {
    if (!this.campaignState.ending) return null;
    this.campaignPlan ??= buildCampaign(this.world);
    const ending = this.campaignPlan.steps[23].choices!.find(
      (c) => c.id === this.campaignState.ending,
    )!;
    return {
      choice: this.campaignState.ending,
      title: ending.label,
      text: ending.text,
      decisions: this.campaignPlan.steps
        .filter((s) => s.choices && this.campaignState.choices[s.id])
        .map((s) => ({
          title: s.title,
          text: s.choices!.find((c) => c.id === this.campaignState.choices[s.id])?.text ?? s.result,
        })),
    };
  }
  get freeLife() {
    const supplies = this.quests.filter((q) => q.id.startsWith('supply:') && q.complete).length;
    const dispatches = this.quests.filter(
      (q) =>
        q.id.startsWith('correspondence:') &&
        q.complete &&
        !q.objective.startsWith('Dispatch withdrawn'),
    ).length;
    return {
      unlocked: this.campaignState.ending !== null,
      milestones: freeLifeMilestones(this.freeLifeState, this.progression, supplies, dispatches),
      contract: this.freeLifeState.commission ? clone(this.freeLifeState.commission) : null,
      contractsCompleted: this.freeLifeState.completed,
    };
  }
  get knownIdentities() {
    return this.freeLifeState.knownHosts
      .map((id) => this.npcs.find((n) => n.id === id) ?? this.npcMemory.get(id))
      .filter(
        (n): n is Npc =>
          !!n && n.hp > 0 && !n.hostile && !this.removed.has(n.id) && n.id !== this.occupiedNpcId,
      )
      .map((n) => ({
        ...clone(n),
        consent: 'Willing while peaceful and alive; a quiet shrine is required.',
        available:
          this.campaignState.ending !== null &&
          !(n.role === 'guard' && this.reputation[n.clan] < -24) &&
          this.clear(n),
      }));
  }
  private rememberIdentity(npc: Npc) {
    if (npc.hp <= 0 || npc.hostile || this.removed.has(npc.id)) return;
    if (!this.freeLifeState.knownHosts.includes(npc.id)) {
      if (this.freeLifeState.knownHosts.length >= 128) {
        if (npc.id !== `body:theo-priest:${this.seed}`) return;
        this.freeLifeState.knownHosts.pop();
      }
      this.freeLifeState.knownHosts.push(npc.id);
    }
    this.npcMemory.set(npc.id, clone(npc));
  }
  private addFreeLifeChoices(board: Prop) {
    if (!this.dialogue) return;
    const job = this.freeLifeState.commission;
    if (job?.status === 'active') {
      if (job.boardId === board.id)
        this.dialogue.choices.unshift({
          id: 'life:claim',
          label: `Report: ${job.title}`,
          detail: `${job.progress}/${job.required} · ${job.reward} coins`,
          disabled:
            job.progress < job.required || (!!job.item && !this.has({ [job.item]: job.required })),
        });
      this.dialogue.choices.unshift({
        id: 'life:cancel',
        label: 'Withdraw the current local commission',
        detail: 'No reward; another seeded commission can be chosen.',
      });
    } else
      this.dialogue.choices.unshift({
        id: 'life:contract',
        label: 'Choose a local guild commission',
        detail: 'Fieldwork, medicine preparation, cultivation or an identified road threat.',
      });
  }
  private chooseFreeLife(id: string, board: Prop) {
    if (!this.campaignState.ending) return;
    const job = this.freeLifeState.commission;
    if (id === 'life:contract' && job?.status !== 'active') {
      const town = this.world
        .settlementsAround(board.x, board.y, 128)
        .sort((a, b) => distance(a, board) - distance(b, board))[0];
      if (!town) return;
      const plants = this.world
        .propsAround(town.x, town.y, 48)
        .filter(
          (p) => ['cequin', 'heartleaf', 'emberroot'].includes(p.kind) && !this.removed.has(p.id),
        );
      const enemies = this.world
        .npcsAround(town.x, town.y, 48)
        .map((n) => this.npcMemory.get(n.id) ?? n)
        .filter((n) => n.role === 'raider' && n.hostile && n.hp > 0 && !this.removed.has(n.id))
        .sort((a, b) => distance(a, board) - distance(b, board));
      const home = this.progression.homes.find((h) => h.plots.some((p) => p !== null));
      const crop = home?.plots.find((p) => p !== null);
      const garden = home && crop ? { x: home.x, y: home.y, plant: crop.plant } : undefined;
      this.freeLifeState.serial++;
      const next = createCommission(
        this.seed,
        this.freeLifeState.serial,
        town,
        board,
        plants,
        enemies,
        garden,
      );
      this.freeLifeState.commission = next;
      this.addQuest({
        id: next.id,
        title: next.title,
        description: next.description,
        objective: `${next.description} Progress0/${next.required}. Reward${next.reward}coins.`,
        stage: 0,
        complete: false,
        target: { ...next.target },
      });
      this.entry(
        'A freely chosen commission',
        `${next.description} Report to ${town.name} when the work and supplies are ready.`,
      );
      this.reply(
        `${next.description} Reward: ${next.reward} coins. The actual work site is marked.`,
      );
    } else if (
      id === 'life:claim' &&
      job?.status === 'active' &&
      job.boardId === board.id &&
      job.progress >= job.required
    ) {
      if (job.item && !this.spend({ [job.item]: job.required })) return;
      job.status = 'complete';
      this.freeLifeState.completed++;
      this.player.coins += job.reward;
      this.awardXp(24);
      this.changeReputation(job.clan, 5);
      this.complete(job.id);
      this.entry(
        job.title,
        'The commission was fulfilled and paid once. Its supplies and consequences remain in the world.',
      );
      this.reply(
        `The work is accepted. ${job.reward} coins and local trust. Another commission can be requested when you choose.`,
      );
      this.syncFreeLife();
    } else if (id === 'life:cancel' && job?.status === 'active') {
      job.status = 'cancelled';
      this.complete(job.id);
      const quest = this.quests.find((q) => q.id === job.id);
      if (quest) quest.objective = 'Withdrawn without payment.';
      this.reply('The commission is withdrawn. No fee or reward was claimed.');
    }
  }
  private recordFreeLife(
    kind: 'field' | 'workshop' | 'garden' | 'watch',
    item: string,
    amount: number,
  ) {
    const job = this.freeLifeState.commission;
    if (
      job?.status === 'active' &&
      job.kind === kind &&
      (kind === 'watch' ? job.targets.includes(item) : job.item === item)
    )
      job.progress = Math.min(job.required, job.progress + amount);
    this.syncFreeLife();
  }
  private syncFreeLife() {
    if (!this.campaignState.ending) return;
    const job = this.freeLifeState.commission;
    if (job?.status === 'active') {
      if (job.kind === 'watch')
        job.progress = job.targets.filter((id) => this.removed.has(id)).length;
      if (job.progress >= job.required) job.target = { ...job.board };
      else if (job.kind === 'field') {
        const plots = this.world
          .propsAround(job.board.x, job.board.y, 48)
          .filter((p) => p.kind === job.item && !this.removed.has(p.id));
        if (!plots.some((p) => distance(p, job.target) < 0.1)) {
          const plot = plots.sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
          if (plot) job.target = { x: plot.x, y: plot.y };
        }
      } else if (job.kind === 'watch') {
        const target = job.targets
          .map((id) => this.npcs.find((n) => n.id === id) ?? this.npcMemory.get(id))
          .find((n) => n && n.hp > 0 && !this.removed.has(n.id));
        if (target) job.target = { x: Math.round(target.x), y: Math.round(target.y) };
      }
      const quest = this.quests.find((q) => q.id === job.id);
      if (quest)
        Object.assign(quest, {
          target: { ...job.target },
          objective: `${job.description} ${job.progress}/${job.required} completed. ${job.progress >= job.required ? 'Return to the issuing noticeboard with the requested supplies.' : ''}`,
        });
    }
    for (const milestone of this.freeLife.milestones) {
      let quest = this.quests.find((q) => q.id === milestone.id);
      if (!quest) {
        this.addQuest({
          id: milestone.id,
          title: milestone.title,
          description: milestone.description,
          objective: `${milestone.progress}/${milestone.goal} · ${milestone.description}`,
          complete: false,
          stage: 0,
        });
        quest = this.quests.find((q) => q.id === milestone.id);
      }
      if (quest)
        quest.objective = `${milestone.progress}/${milestone.goal} · ${milestone.description}`;
      if (milestone.complete && !this.freeLifeState.rewarded.includes(milestone.id)) {
        this.freeLifeState.rewarded.push(milestone.id);
        this.complete(milestone.id);
        this.player.coins += 35;
        this.awardXp(50);
        this.entry(
          milestone.title,
          'A purpose chosen freely, fulfilled through lived work. The community recognized it with thirty-five coins and fifty experience.',
        );
      }
    }
  }

  /** Read-only preflight for atomic multiplayer claims; the local transaction rechecks all rules. */
  interactionAvailability(propId: string): { ok: boolean; reason?: string } {
    if (this.phase !== 'playing') return { ok: false, reason: 'This body cannot act.' };
    const prop = this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .find((p) => p.id === propId);
    if (!prop || distance(prop, this.player) > 1.8)
      return { ok: false, reason: 'Move closer to interact.' };
    if (this.removed.has(prop.id) && prop.kind !== 'door')
      return { ok: false, reason: 'Already gathered.' };
    if (['chest', 'crate'].includes(prop.kind) && this.opened.has(prop.id))
      return { ok: false, reason: 'Already searched.' };
    if (['pine', 'rock'].includes(prop.kind) && this.player.appearance.weapon !== 'staff')
      return { ok: false, reason: 'Equip the staff to gather timber or ore.' };
    const amount = ['chest', 'crate'].includes(prop.kind)
      ? prop.id.startsWith('vault:')
        ? 6
        : 3
      : ['cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(prop.kind)
        ? this.botanicalProfile(prop)!.yield
        : ['pine', 'rock'].includes(prop.kind)
          ? 2
          : 0;
    if (
      prop.kind === 'door' &&
      this.removed.has(prop.id) &&
      (distance(this.player, prop) < 0.85 ||
        this.npcs.some((n) => n.hp > 0 && distance(n, prop) < 0.7))
    )
      return { ok: false, reason: 'Step clear of the doorway before closing it.' };
    if (this.carried + amount > this.capacity) return { ok: false, reason: 'Your pack is full.' };
    return { ok: true };
  }

  get campaign() {
    const state = this.campaignState;
    const step = this.activeCampaignStep();
    return {
      act: Math.min(5, Math.floor(state.step / 4)),
      step: state.step,
      title: step?.title ?? (state.ending ? 'A choice made awake' : 'The radio is still silent'),
      actTitle: CAMPAIGN_ACTS[Math.min(5, Math.floor(state.step / 4))],
      completed: state.step,
      total: CAMPAIGN_LENGTH,
      ending: state.ending,
      started: state.started,
    };
  }
  get campaignObjective() {
    const step = this.activeCampaignStep();
    return step
      ? clone({ ...step, target: this.campaignTarget(step), puzzle: this.campaignState.puzzle })
      : null;
  }
  private activeCampaignStep(): CampaignStep | null {
    if (this.storyStage < 4 || this.campaignState.step >= CAMPAIGN_LENGTH) return null;
    this.campaignPlan ??= buildCampaign(this.world);
    return this.campaignPlan.steps[this.campaignState.step] ?? null;
  }
  private campaignGuards(step: CampaignStep) {
    if (!step.vault) return [];
    return this.world
      .npcsAround(step.vault.x, step.vault.y, 24)
      .filter((n) => n.id.startsWith(`${step.vault!.id}:guard:`))
      .map((n) => this.npcs.find((a) => a.id === n.id) ?? this.npcMemory.get(n.id) ?? n);
  }
  private campaignTarget(step: CampaignStep): Point & { id: string } {
    if (step.kind === 'puzzle' && this.campaignState.puzzle >= 0 && this.campaignState.puzzle < 4)
      return step.lamps![this.campaignState.puzzle];
    if (step.kind === 'encounter' && this.campaignState.choices[step.id] === 'fight') {
      const guard = this.campaignGuards(step).find((n) => n.hp > 0 && !this.removed.has(n.id));
      if (guard) return { id: guard.id, x: guard.x, y: guard.y };
    }
    const original = step.target;
    const changed = this.npcs.find((n) => n.id === original.id) ?? this.npcMemory.get(original.id);
    if (
      this.removed.has(original.id) ||
      original.id === this.occupiedNpcId ||
      (changed && (changed.hp <= 0 || changed.hostile))
    )
      return { id: `${step.town.id}:notice`, x: step.town.x - 2, y: step.town.y + 1 };
    if (changed) return { id: changed.id, x: changed.x, y: changed.y };
    return original;
  }
  private syncCampaign() {
    const step = this.activeCampaignStep();
    if (!step) return;
    this.campaignState.started = true;
    const target = this.campaignTarget(step);
    const objective =
      step.kind === 'puzzle'
        ? this.campaignPuzzleClue(step)
        : `${step.text}${step.cost ? ` Required: ${this.costText(step.cost)}.` : ''} Destination: ${step.town.name}.`;
    const existing = this.quests.find((q) => q.id === step.id);
    if (existing)
      Object.assign(existing, { complete: false, target: { x: target.x, y: target.y }, objective });
    else
      this.addQuest({
        id: step.id,
        title: `${step.act + 1}.${(this.campaignState.step % 4) + 1} · ${step.title}`,
        description: `${CAMPAIGN_ACTS[step.act]}. ${step.text}`,
        objective,
        stage: 0,
        complete: false,
        target: { x: target.x, y: target.y },
      });
  }
  private campaignPuzzleClue(step: CampaignStep) {
    const channels = ['low', 'middle', 'high'];
    const sequence = step
      .lamps!.map((lamp, i) => `${i + 1}. ${lamp.name} ${channels[lamp.channel]}`)
      .join(' → ');
    return `Coil sequence: ${sequence}. ${this.campaignState.puzzle < 0 ? 'Begin at the radio.' : this.campaignState.puzzle < 4 ? `${this.campaignState.puzzle}/4 aligned. Tune the next plaza lamp.` : '4/4 aligned. Return to the radio and close the circuit.'}`;
  }
  private campaignInteraction(found: Npc | Prop) {
    this.syncCampaign();
    const step = this.activeCampaignStep();
    if (!step) return false;
    const target = this.campaignTarget(step);
    const lamp = step.kind === 'puzzle' ? step.lamps!.find((l) => l.id === found.id) : undefined;
    if (found.id !== target.id && found.id !== step.target.id && !lamp) return false;
    if ('role' in found && (found.hp <= 0 || found.hostile)) return false;
    if (
      step.kind === 'archive' &&
      'kind' in found &&
      ['chest', 'crate'].includes(found.kind) &&
      !this.opened.has(found.id)
    )
      return false;
    const choices: Dialogue['choices'] = [];
    const add = (id: string, label: string, detail?: string, disabled = false) =>
      choices.push({ id: `campaign:${id}`, label, detail, disabled });
    let text = step.text;
    if (target.id !== step.target.id && !lamp && step.kind !== 'encounter')
      text +=
        ' The intended witness is no longer available in their former role. Their deposited record and practical arrangements remain at this noticeboard; the absence itself is recorded.';
    if (step.kind === 'talk' || step.kind === 'archive') add('read', 'Read the independent record');
    if (step.kind === 'delivery')
      add(
        'deliver',
        'Deliver the requested supplies',
        this.costText(step.cost!),
        !this.has(step.cost!),
      );
    if (step.kind === 'choice' || step.kind === 'ending')
      for (const c of step.choices!) add(c.id, c.label, c.text);
    if (step.kind === 'decode') for (const [id, label] of step.options!) add(id, label);
    if (step.kind === 'encounter') {
      add(
        'parley',
        'Provide medicine and food for safe passage',
        this.costText(step.cost!),
        !this.has(step.cost!),
      );
      if (step.vault) add('fight', 'Take responsibility for confronting both guards');
      else
        add('shelter', 'Fund shelter for the displaced convoy', '40 coins', this.player.coins < 40);
    }
    if (step.kind === 'puzzle') {
      text += ` ${this.campaignPuzzleClue(step)}`;
      if (lamp) {
        for (const [i, label] of ['low', 'middle', 'high'].entries())
          add(`coil:${i}`, `Tune the ${label} channel`, undefined, this.campaignState.puzzle < 0);
      } else if (this.campaignState.puzzle === 4) add('align', 'Close the circuit and listen');
      else
        add(
          'begin',
          this.campaignState.puzzle < 0 ? 'Begin the coil alignment' : 'Restart the alignment',
        );
    }
    add('ordinary', 'Other business here');
    choices.push({ id: 'close', label: 'Close the conversation' });
    this.dialogue = {
      speaker: 'name' in found ? found.name : step.title,
      role: `Act ${step.act + 1} · ${CAMPAIGN_ACTS[step.act]}`,
      npcId: found.id,
      text,
      choices,
    };
    this.event('dialogue');
    return true;
  }
  private chooseCampaign(choiceId: string, found: Npc | Prop) {
    if (choiceId === 'campaign:ordinary') {
      this.dialogue = null;
      this.campaignOrdinary = true;
      this.interact(found.id);
      return;
    }
    const step = this.activeCampaignStep();
    if (!step) return;
    const id = choiceId.slice('campaign:'.length),
      target = this.campaignTarget(step);
    const lamp = step.lamps?.find((l) => l.id === found.id);
    if (found.id !== target.id && found.id !== step.target.id && !lamp) return;
    if ((step.kind === 'talk' || step.kind === 'archive') && id === 'read') {
      this.advanceCampaign();
      return;
    }
    if (step.kind === 'delivery' && id === 'deliver') {
      if (this.spend(step.cost!)) this.advanceCampaign();
      return;
    }
    if (step.kind === 'choice' || step.kind === 'ending') {
      const choice = step.choices!.find((c) => c.id === id);
      if (!choice) return;
      for (const [clan, delta] of choice.trust) this.changeReputation(clan, delta);
      if (step.kind === 'ending') this.campaignState.ending = id as 'return-link' | 'stay';
      this.advanceCampaign(id, choice.text);
      return;
    }
    if (step.kind === 'decode') {
      if (id === step.answer) this.advanceCampaign(id);
      else
        this.reply(
          'That claim does not fit the independent records. Reopen this discussion and compare the dated evidence before answering.',
        );
      return;
    }
    if (step.kind === 'encounter') {
      if (id === 'parley' && this.spend(step.cost!)) {
        for (const npc of this.campaignGuards(step))
          if (npc.hp > 0 && !this.removed.has(npc.id)) {
            npc.hostile = false;
            npc.cooldown = 0;
            this.npcMemory.set(npc.id, clone(npc));
            this.npcRuntime.set(npc.id, npc);
            const intent = this.enemyIntents.get(npc.id);
            if (intent) intent.warning.age = intent.warning.duration;
            this.enemyIntents.delete(npc.id);
          }
        this.advanceCampaign(
          'parley',
          'The guards accepted medicine and food. Their lives remain in the world.',
        );
      } else if (id === 'shelter' && !step.vault && this.player.coins >= 40) {
        this.player.coins -= 40;
        this.advanceCampaign('shelter');
      } else if (id === 'fight' && step.vault) {
        this.campaignState.choices[step.id] = 'fight';
        this.dialogue = null;
        this.syncCampaign();
        this.checkCampaignEncounter();
      }
      return;
    }
    if (step.kind === 'puzzle') {
      if (id === 'begin' && found.id === step.target.id) {
        this.campaignState.puzzle = 0;
        this.dialogue = null;
        this.syncCampaign();
        this.event('quest', 'The coil sequence is ready. Follow its order and channel settings.');
      } else if (id === 'align' && found.id === step.target.id && this.campaignState.puzzle === 4)
        this.advanceCampaign();
      else if (lamp && id.startsWith('coil:') && this.campaignState.puzzle >= 0) {
        const expected = step.lamps![this.campaignState.puzzle];
        if (expected?.id === lamp.id && Number(id.slice(5)) === expected.channel) {
          this.campaignState.puzzle++;
          this.effect('mind', found, '#a4e6ee', 1);
          this.event('quest', 'The coil answers in sequence.');
        } else {
          this.campaignState.puzzle = 0;
          this.player.stamina = Math.max(0, this.player.stamina - 10);
          this.event('quest', 'The alignment broke. Start again from the first listed coil.');
        }
        this.dialogue = null;
        this.syncCampaign();
      }
    }
  }
  private checkCampaignEncounter() {
    const step = this.activeCampaignStep();
    if (step?.kind === 'encounter' && this.campaignState.choices[step.id] === 'fight') {
      const guards = this.campaignGuards(step);
      if (guards.length === 2 && guards.every((n) => n.hp <= 0 || this.removed.has(n.id)))
        this.advanceCampaign(
          'fight',
          'Both guards died. Passage is open, and their deaths remain part of the account.',
        );
      else this.syncCampaign();
    }
  }
  private advanceCampaign(choice?: string, consequence?: string) {
    const step = this.activeCampaignStep();
    if (!step) return;
    this.complete(step.id);
    const quest = this.quests.find((q) => q.id === step.id);
    if (quest) quest.objective = step.result;
    if (choice) this.campaignState.choices[step.id] = choice;
    this.campaignState.evidence.push(step.id);
    this.player.coins += step.reward.coins;
    this.awardXp(step.reward.xp);
    this.entry(step.title, `${step.result}${consequence ? ` ${consequence}` : ''}`);
    this.campaignState.step++;
    this.campaignState.puzzle = -1;
    this.dialogue = null;
    this.event(
      'quest',
      `${step.title} resolved. ${step.reward.coins} coins and ${step.reward.xp} experience.`,
    );
    if (this.campaignState.step === CAMPAIGN_LENGTH) {
      this.complete('beyond-the-signal');
      this.entry(
        'The country remains',
        'The return investigation is complete. Theo may keep travelling, support or oppose the six families, maintain homes and clinics, and inhabit any nearby willing, living person at a quiet shrine. Each body retains its own belongings.',
      );
    } else this.syncCampaign();
  }

  interact(id?: string) {
    if (this.phase !== 'playing') return;
    const found = id
      ? [...this.npcs, ...this.world.propsAround(this.player.x, this.player.y, 2.2)].find(
          (p) => p.id === id,
        )
      : this.nearby();
    if (!found || distance(found, this.player) > 1.8) {
      this.event('dialogue', 'Move closer to interact.');
      return;
    }
    if ('role' in found) this.rememberIdentity(found);
    if (!this.campaignOrdinary && this.campaignInteraction(found)) return;
    this.campaignOrdinary = false;
    if ('role' in found) {
      if (found.hp <= 0 || found.hostile) return;
      this.talk(found);
      return;
    }
    const prop = found;
    if (this.removed.has(prop.id) && prop.kind !== 'door') return;
    if (['cequin', 'heartleaf', 'emberroot', 'pine', 'rock', 'mushroom'].includes(prop.kind)) {
      this.harvest(prop);
      return;
    }
    if (prop.kind === 'chest' || prop.kind === 'crate') {
      if (this.opened.has(prop.id)) {
        this.event('dialogue', 'Already searched.');
        return;
      }
      const vault = prop.id.startsWith('vault:');
      const archiveHerb = (['cequin', 'heartleaf', 'emberroot'] as const)[prop.seed % 3];
      if (!this.gain(vault ? { [archiveHerb]: 3, ore: 2, rations: 1 } : { wood: 2, rations: 1 }))
        return;
      this.opened.add(prop.id);
      this.player.coins += vault ? 12 : 5;
      if (vault) {
        const quest = this.quests.find((q) => q.id === prop.id.replace(/:cache$/, ':survey'));
        if (quest)
          Object.assign(quest, {
            complete: true,
            stage: 1,
            objective: 'The botanical archive has been recovered.',
          });
        this.entry(
          'A record beneath the frost',
          [
            'These seed records predate Brown’s factories. A Sallas annotation describes cequin sustaining more than breath: a living body may hold an echo after the mind has left. It is a lead, not an explanation.',
            'The vault’s catalogue records plants exchanged between rival families before the first industrial trials. Someone has struck the original recipients from the ledger. Sallas appears in the surviving margin.',
            'A preserved botanical drawing shows root systems connected beneath separate beds. The accompanying Sallas note compares their shared signal to a memory carried between living hosts.',
          ][prop.seed % 3]!,
        );
        this.event(
          'harvest',
          `Recovered three ${ITEMS[archiveHerb].name.toLowerCase()}, two ore, rations, twelve coins, and an archive note.`,
        );
      } else this.event('harvest', 'Recovered two timber, plant rations, and five coins.');
      const step = this.activeCampaignStep();
      if (step?.kind === 'archive' && step.target.id === prop.id) this.advanceCampaign();
      return;
    }
    if (prop.kind === 'door') {
      if (this.removed.has(prop.id)) {
        if (
          distance(this.player, prop) < 0.85 ||
          this.npcs.some((n) => n.hp > 0 && distance(n, prop) < 0.7)
        ) {
          this.event('dialogue', 'Step clear of the doorway before closing it.');
          return;
        }
        this.removed.delete(prop.id);
        this.opened.delete(prop.id);
      } else {
        this.removed.add(prop.id);
        this.opened.add(prop.id);
      }
      this.event('dialogue', this.opened.has(prop.id) ? 'Door opened.' : 'Door closed.');
      return;
    }
    if (prop.kind === 'radio') {
      this.dialogue = {
        speaker: prop.id === 'origin-radio' ? 'Vespera cathedral radio' : 'Long-range radio',
        role: 'Signal apparatus',
        npcId: prop.id,
        text: this.transferReady
          ? 'A fragile reply threads through the static. The signal describes a mental alignment, not a road through space. There is still a Sallas mystery to investigate.'
          : this.storyStage >= 3
            ? 'The damaged radio needs two timber, two conductive ore, and a signal lens. The Sallas record provides the missing alignment.'
            : 'Static. The engineer can explain the damage, but its alignment is concealed in a Sallas record.',
        choices: this.transferReady
          ? [{ id: 'close', label: 'Keep exploring Stíchos' }]
          : [
              {
                id: 'repair-radio',
                label: 'Repair and align the radio',
                disabled: this.storyStage < 3 || !this.has({ wood: 2, ore: 2, lens: 1 }),
                detail: '2 timber · 2 ore · 1 signal lens',
              },
              { id: 'close', label: 'Step away' },
            ],
      };
    } else if (prop.kind === 'bench' || prop.kind === 'shrine') {
      const candidates = prop.kind === 'shrine' ? this.transferCandidates : [];
      const candidate = candidates[0];
      this.transferDialogTarget = candidate?.id ?? null;
      this.dialogue = {
        speaker: prop.kind === 'shrine' ? 'Quiet concentration' : 'A sheltered rest',
        role: 'Rest',
        npcId: prop.id,
        text:
          prop.kind === 'shrine'
            ? candidate
              ? `Beyond the stained glass, ${candidate.name} breathes in another human body. The signal can carry Theo into that person at their present location. This body keeps its pack, coins and equipment here; the other person has their own belongings. Memories and promises travel with the mind.`
              : 'Prometheus watches in colored glass. Quiet concentration steadies this borrowed body. No eligible living mind is within reach yet.'
            : 'The wind is gentler here. Rest replenishes health, breath, warmth, and stamina.',
        choices: [
          { id: 'rest', label: 'Rest and remember this place' },
          ...(prop.kind === 'shrine' && this.transferReady
            ? candidates.length
              ? candidates.map((person, i) => {
                  const kit =
                    this.bodyPossessions.get(person.id) ?? this.initialPossessions(person);
                  return {
                    id: i === 0 ? 'transfer' : `transfer:${person.id}`,
                    label: `Enter ${person.name}’s body`,
                    detail: `${person.role} · ${this.world.clans[person.clan].name} · ${Math.ceil(person.hp)}/${person.maxHp} health · ${kit.weapons.join('/')} · ${kit.coins} coins · ${Object.entries(
                      kit.inventory,
                    )
                      .map(
                        ([item, amount]) => `${amount} ${ITEMS[item as ItemId].name.toLowerCase()}`,
                      )
                      .join(', ')}`,
                  };
                })
              : [
                  {
                    id: 'transfer',
                    label: 'No living mind within reach',
                    disabled: true,
                    detail: 'Keep exploring for inhabited shrines.',
                  },
                ]
            : []),
          { id: 'close', label: 'Continue walking' },
        ],
      };
    } else if (prop.kind === 'workbench') {
      this.dialogue = {
        speaker: 'Botanical workbench',
        role: 'Crafting',
        npcId: prop.id,
        text: 'Prepare the plants directly, or align a conductive lens for the cathedral radio.',
        choices: [
          ...RECIPES.map((r) => ({
            id: `craft:${r.id}`,
            label: r.name,
            disabled: !this.has(r.cost),
            detail: this.costText(r.cost),
          })),
          { id: 'close', label: 'Leave the bench' },
        ],
      };
    } else {
      this.dialogue = {
        speaker: prop.name,
        role: 'Stíchos',
        npcId: prop.id,
        text:
          prop.kind === 'notice'
            ? prop.id.startsWith('vault:')
              ? 'An old botanical seed vault lies north along this path. Raiders have entered its chambers. The archive deep inside may preserve plants and records from before Brown’s industrial trials. Recovering it could reveal another trace of Sallas.'
              : 'The botanical clinics need supplies. Speak with local botanists for paid work. Brown factories promise abundance; the other families fear what that promise will cost.'
            : prop.kind === 'grave'
              ? 'A human name, worn by cold. The six families do not own every memory.'
              : 'Cold blue country continues beyond the settlement. Roads connect inhabited places; wild plants grow off the paths.',
        choices: [{ id: 'close', label: 'Continue' }],
      };
    }
    if (prop.kind === 'notice') {
      if (prop.id.startsWith('vault:'))
        this.dialogue!.choices.unshift({
          id: 'vault:survey',
          label: 'Mark the vault in my journal',
        });
      else this.addDispatchChoices(prop);
      if (this.campaignState.ending) this.addFreeLifeChoices(prop);
    }
    this.event('dialogue');
  }

  botanicalProfile(prop: Prop) {
    if (!['cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(prop.kind)) return null;
    const profile = plantProfile(prop.seed, prop.kind as PlantKind);
    // The teaching garden has a known harvest; old lives keep their established yields.
    if (this.world.generation === 1 || prop.id.startsWith('origin:'))
      return {
        ...profile,
        yield: (prop.kind === 'cequin' ? 3 : 2) + skillBonuses(this.progression).harvestExtra,
        description: `${profile.description} Cultivated harvest.`,
      };
    return { ...profile, yield: profile.yield + skillBonuses(this.progression).harvestExtra };
  }

  private harvest(prop: Prop) {
    if (
      (prop.kind === 'pine' || prop.kind === 'rock') &&
      this.player.appearance.weapon !== 'staff'
    ) {
      this.event('dialogue', 'Equip the staff to gather timber or ore.');
      return;
    }
    const item: ItemId =
      prop.kind === 'pine'
        ? 'wood'
        : prop.kind === 'rock'
          ? 'ore'
          : prop.kind === 'mushroom'
            ? 'rations'
            : (prop.kind as ItemId);
    const botanical = this.botanicalProfile(prop);
    const amount = botanical?.yield ?? (item === 'cequin' ? 3 : 2);
    if (!this.gain({ [item]: amount })) return;
    this.removed.add(prop.id);
    if (botanical) grantPractice(this.progression, 'botany', 3);
    this.recordFreeLife('field', item, amount);
    this.effect('harvest', prop, '#d2efa8');
    this.event(
      'harvest',
      `Gathered ${amount} ${ITEMS[item].name.toLowerCase()}${botanical ? ` from ${botanical.name.toLowerCase()}` : ''}.`,
    );
  }

  private talk(npc: Npc) {
    const choices = [{ id: 'close', label: 'Leave the conversation' }];
    let text =
      'The roads do not end here. Every settlement carries its own bargains, and the cold treats all six families alike.';
    if (npc.role === 'botanist') {
      text =
        'Cequin opens the breath in this cold. We measure it in Rømer; your body still needs the leaves whatever scale you remember. Our clinics prepare food and medicine directly from plants. Orlando Brown asks us to abandon that knowledge for his factories.';
      choices.unshift({
        id: 'learn-cequin',
        label:
          this.storyStage === 0 ? 'Ask what the clinic needs' : 'Discuss cequin and the clinic',
      });
      const job = this.supplyJobs.get(npc.id);
      choices.unshift({
        id: job?.active ? 'supply:deliver' : 'supply:accept',
        label: job?.active
          ? `Deliver ${job.amount} ${ITEMS[job.item].name.toLowerCase()}`
          : 'Ask for local botanical work',
      });
    } else if (npc.role === 'archivist') {
      text =
        'Priests are called originais, true children of Prometheus. Behind their reverence sits the Cúpula do Destino. The Sallas family keeps records even the other families cannot read.';
      choices.unshift({ id: 'ask-sallas', label: 'Ask about the Sallas transmission records' });
    } else if (npc.role === 'engineer') {
      text =
        'Orlando Brown wants industry to feed the clans. Machines can serve people, but someone always controls the switch. I can repair this radio if you bring an aligned lens and materials; its strange tuning is a Sallas matter.';
      choices.unshift({ id: 'engineer-plan', label: 'Review the radio repair' });
    } else if (npc.role === 'merchant') {
      this.merchant(npc);
      return;
    } else if (npc.role === 'refugee') {
      text =
        'We need three cequin for the clinic’s breath jars. Brown’s buyers want the same leaves for an industrial trial. One bundle cannot serve both today.';
      if (this.storyStage >= 1 && this.storyStage < 2)
        choices.unshift(
          { id: 'aid-clinic', label: 'Give the clinic three cequin' },
          { id: 'aid-brown', label: 'Sell three cequin to Brown’s trial' },
        );
    } else if (npc.role === 'guard')
      text = `I serve ${this.world.clans[npc.clan]?.name ?? 'this family'}. Keep your weapons away from our people. Reputation travels farther than footsteps.`;
    this.dialogue = { speaker: npc.name, role: npc.role, npcId: npc.id, text, choices };
    this.addDispatchChoices(npc);
    this.event('dialogue');
  }

  private merchant(npc: Npc) {
    const stock: ItemId[] = ['cequin', 'heartleaf', 'emberroot', 'rations', 'bandage'];
    this.dialogue = {
      speaker: npc.name,
      role: 'merchant',
      npcId: npc.id,
      text: `Trade fairly. You carry ${this.carried}/${CAPACITY} items and ${this.player.coins} coins.`,
      choices: [
        ...stock.map((item) => ({
          id: `buy:${item}`,
          label: `Buy ${ITEMS[item].name} · ${ITEMS[item].price} coins`,
          disabled: this.player.coins < ITEMS[item].price || this.carried >= CAPACITY,
        })),
        ...itemIds
          .filter((item) => (this.inventory[item] ?? 0) > 0)
          .map((item) => ({
            id: `sell:${item}`,
            label: `Sell ${ITEMS[item].name} · ${this.sellPrice(item)} coins`,
          })),
        ...(['sword', 'bow'] as Weapon[])
          .filter((w) => !this.weapons.has(w))
          .map((w) => ({
            id: `weapon:${w}`,
            label: `Buy ${w} · ${w === 'sword' ? 28 : 32} coins`,
            disabled: this.player.coins < (w === 'sword' ? 28 : 32),
          })),
        { id: 'close', label: 'Finish trading' },
      ],
    };
    this.event('dialogue');
  }

  choose(choiceId: string) {
    const dialogue = this.dialogue;
    const choice = dialogue?.choices.find((c) => c.id === choiceId);
    if (!dialogue || !choice || choice.disabled || this.phase !== 'playing') return;
    if (choiceId === 'close') {
      this.dialogue = null;
      return;
    }
    const npc = this.npcs.find(
      (n) => n.id === dialogue.npcId && !n.hostile && n.hp > 0 && distance(n, this.player) <= 1.8,
    );
    const prop = this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .find((p) => p.id === dialogue.npcId && distance(p, this.player) <= 1.8);
    if (!npc && !prop) {
      this.dialogue = null;
      this.event('dialogue', 'Move closer to continue.');
      return;
    }
    if (choiceId.startsWith('life:') && prop?.kind === 'notice') {
      this.chooseFreeLife(choiceId, prop);
      return;
    }
    if (choiceId.startsWith('campaign:')) {
      this.chooseCampaign(choiceId, npc ?? prop!);
      return;
    }
    if (choiceId === 'vault:survey' && prop?.kind === 'notice' && prop.id.startsWith('vault:')) {
      const siteId = prop.id.replace(/:notice$/, '');
      const site = this.world.vaultsAround(prop.x, prop.y, 80).find((v) => v.id === siteId);
      if (site && !this.quests.some((q) => q.id === `${siteId}:survey`)) {
        const complete = this.opened.has(`${siteId}:cache`);
        this.quests.push({
          id: `${siteId}:survey`,
          title: 'Beneath the frost',
          description:
            'An abandoned seed vault preserves a botanical archive. Its chambers are occupied by raiders.',
          stage: complete ? 1 : 0,
          complete,
          target: site.reward,
          objective: complete
            ? 'The botanical archive has been recovered.'
            : 'Follow the path north. Search the archive in the deepest chamber.',
        });
      }
      this.dialogue = null;
      this.event('dialogue', 'The seed vault is recorded in your journal.');
      return;
    }
    if (
      choiceId === 'dispatch:request' &&
      (npc?.role === 'archivist' || npc?.role === 'engineer' || prop?.kind === 'notice')
    ) {
      this.acceptDispatch(npc ?? prop!);
      return;
    }
    if (choiceId.startsWith('dispatch:cancel:')) {
      const job = this.correspondenceJobs.get(choiceId.slice('dispatch:cancel:'.length));
      if (
        job?.status === 'active' &&
        (npc?.id === job.sourceId ||
          (prop?.kind === 'notice' && distance(prop, job.sourcePoint) < 32))
      ) {
        job.status = 'cancelled';
        const quest = this.quests.find((q) => q.id === this.dispatchQuestId(job));
        if (quest)
          Object.assign(quest, {
            complete: true,
            stage: 1,
            objective: 'Dispatch withdrawn. No payment was claimed.',
          });
        this.entry(
          'A dispatch withdrawn',
          `Theo withdrew the memorized dispatch for ${job.recipientName} in ${job.settlementName}. No payment or experience was claimed.`,
        );
        this.reply('The dispatch is withdrawn. You can ask for another route when ready.');
        this.event('quest', 'Dispatch withdrawn.');
      }
      return;
    }
    const dispatchChoice = /^dispatch:(deliver|reveal|withhold):(.+)$/.exec(choiceId);
    if (dispatchChoice && npc) {
      const job = this.correspondenceJobs.get(dispatchChoice[2]);
      if (
        job?.status === 'active' &&
        job.recipientId === npc.id &&
        !this.removed.has(npc.id) &&
        this.clear(npc)
      )
        this.deliverDispatch(job, dispatchChoice[1] as 'deliver' | 'reveal' | 'withhold');
      return;
    }
    if (choiceId.startsWith('buy:') || choiceId.startsWith('sell:')) {
      if (npc?.role !== 'merchant') return;
      const [kind, item] = choiceId.split(':');
      if (!isItem(item)) return;
      if (kind === 'buy') {
        if (this.player.coins < ITEMS[item].price || !this.gain({ [item]: 1 })) return;
        this.player.coins -= ITEMS[item].price;
      } else {
        if (!this.spend({ [item]: 1 })) return;
        this.player.coins += this.sellPrice(item);
      }
      this.event(
        'trade',
        `${kind === 'buy' ? 'Bought' : 'Sold'} ${ITEMS[item].name.toLowerCase()}.`,
      );
      this.merchant(npc);
      return;
    }
    if (choiceId.startsWith('weapon:')) {
      if (npc?.role !== 'merchant') return;
      const weapon = choiceId.slice(7) as Weapon;
      const price = weapon === 'sword' ? 28 : 32;
      if (
        !['sword', 'bow'].includes(weapon) ||
        this.weapons.has(weapon) ||
        this.player.coins < price
      )
        return;
      this.player.coins -= price;
      this.weapons.add(weapon);
      this.event('trade', `Acquired a ${weapon}.`);
      this.merchant(npc);
      return;
    }
    if (choiceId.startsWith('craft:')) {
      this.craft(choiceId.slice(6));
      if (prop) this.interact(prop.id);
      return;
    }
    if (choiceId === 'learn-cequin' && npc?.role === 'botanist') {
      this.complete('first-breath');
      this.storyStage = Math.max(1, this.storyStage);
      this.addQuest({
        id: 'cequin-choice',
        title: 'Three leaves, two promises',
        description:
          'A scarce bundle can relieve the clinic today or support Brown’s industrial trial. Decide whom to trust.',
        stage: 0,
        complete: false,
        objective: 'Give three cequin to the clinic or to Brown’s trial.',
        target: { x: npc.x, y: npc.y },
      });
      this.dialogue = {
        speaker: npc.name,
        role: 'botanist',
        npcId: npc.id,
        text:
          this.storyStage >= 2
            ? 'Your first decision is remembered. Other clinics still need plants; ask me for local supply work whenever you return.'
            : 'Three cequin will give the clinic’s patients another day of breath. Brown’s buyers offer twelve coins for an industrial trial instead. A priest’s quiet choice is still a political act.',
        choices:
          this.storyStage >= 2
            ? [{ id: 'close', label: 'Continue' }]
            : [
                {
                  id: 'aid-clinic',
                  label: 'Give three cequin to the clinic',
                  disabled: !this.has({ cequin: 3 }),
                  detail: 'Community trust rises; Brown loses influence.',
                },
                {
                  id: 'aid-brown',
                  label: 'Sell three cequin to Brown’s trial',
                  disabled: !this.has({ cequin: 3 }),
                  detail: 'Gain 12 coins and Brown’s trust; the clinic must wait.',
                },
                { id: 'close', label: 'Gather more cequin first' },
              ],
      };
      return;
    }
    if (
      (choiceId === 'aid-clinic' || choiceId === 'aid-brown') &&
      npc &&
      ['botanist', 'refugee'].includes(npc.role)
    ) {
      if (this.storyStage !== 1 || !this.spend({ cequin: 3 })) return;
      const brown = this.clanId('Brown', 0);
      const botanical = npc.clan === brown ? this.clanId('Veyr', 2) : npc.clan;
      if (choiceId === 'aid-clinic') {
        this.changeReputation(botanical, 10);
        this.changeReputation(brown, -3);
        this.entry(
          'A bundle for the clinic',
          'Three cequin went to people struggling to breathe. Brown’s industrial trial will have to wait.',
        );
      } else {
        this.player.coins += 12;
        this.changeReputation(brown, 10);
        this.changeReputation(botanical, -5);
        this.entry(
          'A bundle for industry',
          'Brown’s trial received the cequin. Twelve coins changed hands; the clinic’s need remains.',
        );
      }
      this.storyStage = 2;
      this.complete('cequin-choice');
      this.addQuest({
        id: 'sallas-record',
        title: 'What Sallas remembers',
        description: 'The archivist knows a hidden record about mental transmission.',
        stage: 0,
        complete: false,
        objective: 'Ask the archivist about Sallas.',
        target: this.originTarget('origin-archivist'),
      });
      this.dialogue = null;
      return;
    }
    if (choiceId === 'ask-sallas' && npc?.role === 'archivist') {
      if (this.storyStage < 2) {
        this.reply(
          'First understand the settlement’s need for breath. Speak to the botanist; words about destiny are cheap while the clinic goes without.',
        );
        return;
      }
      if (this.storyStage === 2) {
        this.storyStage = 3;
        this.complete('sallas-record');
        this.changeReputation(this.clanId('Sallas', 1), 6);
        this.entry(
          'The Sallas alignment',
          'A concealed record describes phase-locked memory, not a physical passage. Its alignment may let the cathedral radio hear a mind signal. This is one clue, not the resolution of the Sallas secret.',
        );
        this.addQuest({
          id: 'repair-radio',
          title: 'A voice beneath the static',
          description:
            'Use the Sallas alignment to repair the cathedral radio. The signal may reveal a way to steady mental transmission.',
          stage: 0,
          complete: false,
          objective: 'Repair the radio: 2 timber, 2 ore, and 1 crafted signal lens.',
          target: this.originTarget('origin-radio', true),
        });
      }
      this.reply(
        'The Cúpula do Destino conceals a record of phase-locked memory. I copied its alignment. Bring it to the engineer, craft a signal lens at a workbench, and repair the cathedral radio. There is no gate to walk through.',
      );
      return;
    }
    if (choiceId === 'engineer-plan' && npc?.role === 'engineer') {
      this.reply(
        this.storyStage < 3
          ? 'Gather timber with your staff and conductive ore from exposed rock. An aligned lens needs one timber and two ore at a workbench. Before we can tune it, ask the archivist for the Sallas alignment.'
          : 'Craft one signal lens at a workbench using one timber and two ore. Bring that lens, two more timber, and two more ore to the radio itself. I have marked it in your journal.',
      );
      return;
    }
    if (choiceId === 'repair-radio' && prop?.kind === 'radio') {
      if (this.storyStage !== 3 || !this.spend({ wood: 2, ore: 2, lens: 1 })) return;
      this.opened.add(prop.id);
      this.storyStage = 4;
      this.complete('repair-radio');
      this.effect('mind', prop, '#9ae4ff', 2.4);
      this.entry(
        'The reply',
        'A remembered voice surfaced through the radio static. The signal can steady a voluntary mind transfer at a quiet shrine. Theo remains on Stíchos; the families, the threatened botanical society, and the Sallas secret are still here.',
      );
      this.addQuest({
        id: 'beyond-the-signal',
        title: 'The country continues',
        description:
          'The reply is a beginning. Travel between settlements, support local clinics, and decide how the six families will remember you.',
        stage: 0,
        complete: false,
        objective: 'Explore Stíchos. A quiet shrine now permits voluntary mind travel.',
      });
      this.syncCampaign();
      this.reply(
        'A voice returns in fragments: memory, breath, a coordinate inside the mind. The link holds. At a quiet shrine you can attempt a voluntary transfer. Outside, the same cold country stretches on.',
      );
      return;
    }
    if (choiceId === 'supply:accept' && npc?.role === 'botanist') {
      this.acceptSupply(npc);
      return;
    }
    if (choiceId === 'supply:deliver' && npc?.role === 'botanist') {
      this.deliverSupply(npc);
      return;
    }
    if (choiceId === 'rest' && prop && ['bench', 'shrine'].includes(prop.kind)) {
      this.dialogue = null;
      this.rest();
      return;
    }
    if (
      (choiceId === 'transfer' || choiceId.startsWith('transfer:')) &&
      prop?.kind === 'shrine' &&
      this.transferReady
    ) {
      this.dialogue = null;
      this.reincarnate(
        choiceId === 'transfer'
          ? (this.transferDialogTarget ?? undefined)
          : choiceId.slice('transfer:'.length),
      );
    }
  }

  private acceptSupply(npc: Npc) {
    if (this.supplyJobs.get(npc.id)?.active) return;
    const number = (this.supplyJobs.get(npc.id)?.number ?? 0) + 1;
    const preferred = (['cequin', 'heartleaf', 'emberroot'] as const)[
      ((npc.seed >>> 0) + number) % 3
    ];
    const plants = this.world
      .propsAround(npc.x, npc.y, 24)
      .filter(
        (p) => ['cequin', 'heartleaf', 'emberroot'].includes(p.kind) && !this.removed.has(p.id),
      );
    const target =
      plants
        .filter((p) => p.kind === preferred)
        .sort((a, b) => distance(a, npc) - distance(b, npc))[0] ??
      plants.sort((a, b) => distance(a, npc) - distance(b, npc))[0];
    if (!target) {
      this.reply(
        'These nearby plots have been gathered. Other settlements have their own clinics and supply work.',
      );
      return;
    }
    const item = target.kind as SupplyJob['item'];
    const job: SupplyJob = {
      npcId: npc.id,
      item,
      amount: 3,
      number,
      active: true,
      target: { x: target.x, y: target.y },
    };
    this.supplyJobs.set(npc.id, job);
    this.addQuest({
      id: `supply:${npc.id}:${number}`,
      title: `${ITEMS[item].name} for ${npc.name}`,
      description:
        'Gather or trade for the plants, then return to this botanist. The map marks a real nearby plot.',
      stage: 0,
      complete: false,
      objective: `Bring 3 ${ITEMS[item].name.toLowerCase()} to ${npc.name}. Reward: 14 coins and local trust.`,
      target: { ...job.target },
    });
    this.reply(
      `Bring three ${ITEMS[item].name.toLowerCase()}. I marked a nearby growing plot. Deliver the leaves here and the clinic will pay fourteen coins.`,
    );
  }

  private deliverSupply(npc: Npc) {
    const job = this.supplyJobs.get(npc.id);
    if (!job?.active) return;
    if (!this.spend({ [job.item]: job.amount })) {
      this.reply(
        `We still need ${job.amount} ${ITEMS[job.item].name.toLowerCase()}. The plants are marked in your journal.`,
      );
      return;
    }
    job.active = false;
    this.player.coins += 14;
    this.changeReputation(npc.clan, 5);
    this.awardXp(12);
    this.complete(`supply:${npc.id}:${job.number}`);
    this.reply(
      'The clinic can prepare these immediately. Fourteen coins, with our thanks. There will be more work when you are ready.',
    );
  }

  private dispatchQuestId(job: CorrespondenceJob) {
    return `correspondence:${job.sourceId}:${job.number}`;
  }

  private addDispatchChoices(source: Npc | Prop) {
    if (!this.dialogue) return;
    const canOffer =
      'role' in source
        ? source.role === 'archivist' || source.role === 'engineer'
        : source.kind === 'notice';
    const own = this.correspondenceJobs.get(source.id);
    if (canOffer)
      this.dialogue.choices.unshift({
        id: 'dispatch:request',
        label:
          own?.status === 'active'
            ? `Review the dispatch to ${own.settlementName}`
            : 'Carry a memorized dispatch to another settlement',
      });
    for (const job of this.correspondenceJobs.values()) {
      if (job.status !== 'active') continue;
      if (source.id === job.recipientId) {
        this.dialogue.text = `${job.sourceName} asked you to carry this account: “${job.payload}” The omitted witness note says: “${job.omitted}” ${source.name} waits to hear what you will say.`;
        this.dialogue.choices.unshift(
          {
            id: `dispatch:deliver:${job.sourceId}`,
            label: `Give the authorized account · ${job.reward} coins`,
            detail: 'Source trust +7 · recipient trust +2',
          },
          {
            id: `dispatch:reveal:${job.sourceId}`,
            label: `Disclose the omitted witness note · ${Math.floor(job.reward * 0.6)} coins`,
            detail: 'Source trust −6 · recipient trust +8',
          },
          {
            id: `dispatch:withhold:${job.sourceId}`,
            label: 'Withhold the account and warn its sender',
            detail: 'Source trust +3 · recipient trust −5 · no payment',
          },
        );
      }
      if (
        source.id === job.sourceId ||
        (!('role' in source) && source.kind === 'notice' && distance(source, job.sourcePoint) < 32)
      ) {
        const unavailable =
          this.removed.has(job.recipientId) || this.npcMemory.get(job.recipientId)?.hostile;
        this.dialogue.choices.unshift({
          id: `dispatch:cancel:${job.sourceId}`,
          label: unavailable
            ? `Withdraw dispatch: ${job.recipientName} cannot receive it`
            : `Withdraw the dispatch to ${job.recipientName}`,
        });
      }
    }
  }

  private hasRoadAccess(npc: Npc, town: Settlement) {
    const queue: Point[] = [{ x: Math.round(npc.x), y: Math.round(npc.y) }];
    const visited = new Set<string>([`${queue[0].x},${queue[0].y}`]);
    for (let i = 0; i < queue.length && i < 2600; i++) {
      const point = queue[i];
      const tile = this.world.tile(point.x, point.y);
      if (
        (Math.abs(point.x - town.x) > town.radius || Math.abs(point.y - town.y) > town.radius) &&
        ['road', 'bridge'].includes(tile.terrain)
      )
        return true;
      for (const [dx, dy] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]) {
        const next = { x: point.x + dx, y: point.y + dy };
        const key = `${next.x},${next.y}`;
        if (
          visited.has(key) ||
          Math.abs(next.x - town.x) > town.radius + 5 ||
          Math.abs(next.y - town.y) > town.radius + 5 ||
          !this.clear(next)
        )
          continue;
        visited.add(key);
        queue.push(next);
      }
    }
    return false;
  }

  private acceptDispatch(source: Npc | Prop) {
    const existing = this.correspondenceJobs.get(source.id);
    if (existing?.status === 'active') {
      this.reply(
        `Your memorized dispatch is for ${existing.recipientName} in ${existing.settlementName}. Give the authorized account, disclose its omitted witness note, or withhold it when you reach that person. You may withdraw the work here or at this settlement’s noticeboard.`,
      );
      this.addDispatchChoices(source);
      return;
    }
    const number = (existing?.number ?? 0) + 1;
    const nearby = this.world.settlementsAround(
      source.x,
      source.y,
      this.world.generation === 3 ? 480 : 112,
    );
    const home = [...nearby].sort((a, b) => distance(a, source) - distance(b, source))[0];
    if (!home || distance(home, source) > 32) return;
    const sourceClan = source.clan ?? home.clan;
    const destinations = nearby
      .filter((town) => town.id !== home.id)
      .sort(
        (a, b) =>
          Number(a.clan === sourceClan) - Number(b.clan === sourceClan) ||
          deriveSeed(this.seed, source.id, number, a.id) -
            deriveSeed(this.seed, source.id, number, b.id),
      );
    let recipient: Npc | undefined;
    let destination: Settlement | undefined;
    for (const town of destinations) {
      const residents = this.world
        .npcsAround(town.x, town.y, town.radius + 2)
        .map((n) => this.npcMemory.get(n.id) ?? n)
        .filter(
          (n) =>
            ['archivist', 'engineer', 'botanist'].includes(n.role) &&
            n.id !== source.id &&
            n.id !== this.occupiedNpcId &&
            !this.removed.has(n.id) &&
            n.hp > 0 &&
            !n.hostile &&
            this.clear(n),
        )
        .sort(
          (a, b) =>
            deriveSeed(this.seed, source.id, number, a.id) -
            deriveSeed(this.seed, source.id, number, b.id),
        );
      recipient = residents.find((n) => this.hasRoadAccess(n, town));
      if (recipient) {
        destination = town;
        break;
      }
    }
    if (!recipient || !destination) {
      this.reply(
        'No living recipient with an open road is available nearby. Other settlements may have correspondence to carry.',
      );
      return;
    }
    const seed = deriveSeed(this.seed, source.id, 'dispatch', number);
    const reports = [
      [
        'A trial furnace met its quota without delaying the clinic’s cequin allotment.',
        'The gardener counted three missing breath jars after the same trial.',
      ],
      [
        'The last winter convoy arrived with its botanical medicines intact.',
        'A refugee says the family seal was replaced before the medicine was counted.',
      ],
      [
        'A copied radio log contains only routine weather reports.',
        'The copyist heard an unregistered voice between the weather intervals.',
      ],
      [
        'The seed archive is being moved for protection from frost.',
        'A botanist was refused access to the oldest cequin cultivation records.',
      ],
    ];
    const [payload, omitted] = reports[seed % reports.length];
    const job: CorrespondenceJob = {
      sourceId: source.id,
      sourceName: source.name,
      sourceClan,
      sourcePoint: { x: source.x, y: source.y },
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientClan: recipient.clan,
      settlementId: destination.id,
      settlementName: destination.name,
      target: { x: recipient.x, y: recipient.y },
      number,
      payload,
      omitted,
      reward: 16 + (seed % 13) + Math.floor(distance(source, recipient) / 20),
      status: 'active',
    };
    this.correspondenceJobs.set(source.id, job);
    this.addQuest({
      id: this.dispatchQuestId(job),
      title: `A dispatch for ${destination.name}`,
      description: `Memorize ${source.name}’s account: “${payload}” The omitted note says: “${omitted}” This message is knowledge, so it remains with Theo through a body change.`,
      objective: `Speak to ${recipient.name} in ${destination.name}. Choose what to disclose. Authorized delivery pays ${job.reward} coins.`,
      stage: 0,
      complete: false,
      target: { ...job.target },
    });
    this.entry(
      'Words for another settlement',
      `${source.name} entrusted Theo with a memorized dispatch for ${recipient.name} in ${destination.name}. Its authorized account and omitted witness note are recorded in the journal. Neither account has been independently verified.`,
    );
    this.reply(
      `Follow the roads to ${destination.name} and speak with ${recipient.name}. Memorize this account: “${payload}” An omitted witness note says: “${omitted}” Decide what they should hear when you arrive. The authorized payment is ${job.reward} coins.`,
    );
  }

  private deliverDispatch(job: CorrespondenceJob, choice: 'deliver' | 'reveal' | 'withhold') {
    job.status = choice === 'deliver' ? 'delivered' : choice === 'reveal' ? 'revealed' : 'withheld';
    this.player.coins +=
      choice === 'deliver' ? job.reward : choice === 'reveal' ? Math.floor(job.reward * 0.6) : 0;
    this.changeReputation(job.sourceClan, choice === 'deliver' ? 7 : choice === 'reveal' ? -6 : 3);
    this.changeReputation(
      job.recipientClan,
      choice === 'deliver' ? 2 : choice === 'reveal' ? 8 : -5,
    );
    this.complete(this.dispatchQuestId(job));
    const decision =
      choice === 'deliver'
        ? 'gave the authorized account'
        : choice === 'reveal'
          ? 'disclosed the omitted witness note'
          : 'withheld the account and warned its sender';
    const quest = this.quests.find((q) => q.id === this.dispatchQuestId(job));
    if (quest) quest.objective = `In ${job.settlementName}, Theo ${decision}.`;
    this.entry(
      'What the next settlement heard',
      `Before ${job.recipientName} in ${job.settlementName}, Theo ${decision}. The families’ trust changed; the underlying report remains a disputed account, not a solution to the Sallas mystery.`,
    );
    this.reply(
      choice === 'deliver'
        ? 'The authorized account is received. Your sender will know it arrived, and the agreed coins are yours.'
        : choice === 'reveal'
          ? 'That missing detail changes what we were told. Take this smaller payment for speaking plainly; your sender may resent the disclosure.'
          : 'Then this conversation will be remembered for what you refused to say. The sender receives your warning; this family offers no payment.',
    );
  }

  attack(target?: Point) {
    const p = this.player;
    if (this.phase !== 'playing' || this.dialogue || p.attackCooldown > 0 || p.stamina < 8) return;
    if (target && finite(target.x) && finite(target.y) && distance(target, p) > 0.01)
      p.heading = Math.atan2(target.y - p.y, target.x - p.x);
    const weapon = p.appearance.weapon === 'none' ? 'staff' : p.appearance.weapon;
    const profile = this.weaponProfile(weapon);
    p.stamina -= 8;
    p.attackCooldown = profile.cooldown;
    this.event('attack');
    if (weapon === 'bow') {
      const effect = this.effect('arrow', p, profile.color, profile.range / 9, p.heading);
      this.arrows.push({
        owner: 'player',
        effect,
        vx: Math.cos(p.heading) * 9,
        vy: Math.sin(p.heading) * 9,
        damage: profile.damage,
        enchantment: profile.effect,
      });
      return;
    }
    this.effect('slash', p, profile.color, 0.22, p.heading);
    const range = profile.range;
    const candidates = this.npcs.filter(
      (n) => n.hp > 0 && distance(n, p) <= range && this.inCone(n, p.heading),
    );
    candidates.sort((a, b) => distance(a, p) - distance(b, p));
    if (candidates[0]) this.damageNpc(candidates[0], profile.damage, profile.effect);
  }

  ward() {
    const p = this.player;
    if (this.phase !== 'playing' || this.dialogue || p.wardCooldown > 0 || p.stamina < 30) return;
    p.stamina -= 30;
    p.wardCooldown = 8;
    this.effect('ward', p, '#9abde9', 0.75);
    this.event('ward', 'The ward steadies your breath and repels attackers.');
    p.breath = clamp(p.breath + 5);
    for (const npc of this.npcs.filter((n) => n.hostile && n.hp > 0 && distance(n, p) < 2.7)) {
      this.damageNpc(npc, 14 + p.level);
      const range = Math.max(0.01, distance(npc, p));
      this.move(npc, ((npc.x - p.x) / range) * 0.7, ((npc.y - p.y) / range) * 0.7);
      npc.cooldown = Math.max(npc.cooldown, 1);
    }
  }

  private inCone(npc: Npc, heading: number) {
    const d = Math.max(0.001, distance(npc, this.player));
    return (
      ((npc.x - this.player.x) * Math.cos(heading) + (npc.y - this.player.y) * Math.sin(heading)) /
        d >
      0.2
    );
  }

  private updateArrows(dt: number) {
    for (const arrow of this.arrows) {
      if (arrow.effect.age >= arrow.effect.duration) continue;
      const count = Math.max(1, Math.ceil((Math.hypot(arrow.vx, arrow.vy) * dt) / 0.12));
      for (let i = 0; i < count; i++) {
        arrow.effect.x += (arrow.vx * dt) / count;
        arrow.effect.y += (arrow.vy * dt) / count;
        if (this.world.blocked(arrow.effect.x, arrow.effect.y, this.removed)) {
          arrow.effect.age = arrow.effect.duration;
          break;
        }
        if (arrow.owner === 'enemy') {
          if (distance(this.player, arrow.effect) < 0.35) {
            this.hurt(arrow.damage);
            arrow.effect.age = arrow.effect.duration;
            break;
          }
          continue;
        }
        const hit = this.npcs.find((n) => n.hp > 0 && distance(n, arrow.effect) < 0.4);
        if (hit) {
          this.damageNpc(hit, arrow.damage, arrow.enchantment);
          arrow.effect.age = arrow.effect.duration;
          break;
        }
      }
    }
    this.arrows = this.arrows.filter((a) => a.effect.age < a.effect.duration);
  }

  private damageNpc(npc: Npc, amount: number, enchantment?: WeaponProfile['effect']) {
    const interrupted = this.enemyIntents.get(npc.id);
    if (interrupted) {
      interrupted.warning.age = interrupted.warning.duration;
      this.enemyIntents.delete(npc.id);
    }
    const wasFriendly = !npc.hostile && npc.role !== 'raider';
    if (!wasFriendly && npc.hp > 0) grantPractice(this.progression, 'combat', 2);
    npc.hp = Math.max(0, npc.hp - amount);
    npc.hostile = true;
    if (enchantment === 'stagger') npc.cooldown = Math.max(npc.cooldown, 1.35);
    if (enchantment === 'breath') this.player.breath = clamp(this.player.breath + 2);
    if (enchantment === 'warmth') this.player.warmth = clamp(this.player.warmth + 3);
    this.effect('hurt', npc, '#ec8277', 0.45);
    if (wasFriendly) {
      this.changeReputation(npc.clan, -12);
      this.event(
        'quest',
        `Violence against ${npc.name} damages your standing with ${this.world.clans[npc.clan]?.name ?? 'their family'}.`,
      );
      for (const guard of this.npcs)
        if (guard.role === 'guard' && guard.clan === npc.clan && distance(guard, npc) < 8)
          guard.hostile = true;
    }
    if (npc.hp <= 0) {
      this.removed.add(npc.id);
      if (npc.role === 'raider') {
        this.recordFreeLife('watch', npc.id, 1);
        grantPractice(this.progression, 'combat', 6);
        this.player.coins += 4;
        this.awardXp(16);
      } else {
        this.changeReputation(npc.clan, -18);
        this.entry(
          'A life ended',
          `${npc.name} died by Theo’s hand. The ${this.world.clans[npc.clan]?.name ?? 'local'} family will remember.`,
        );
      }
    }
    this.npcMemory.set(npc.id, clone(npc));
    this.checkCampaignEncounter();
  }

  private hurt(amount: number, feedback = true) {
    if (this.phase !== 'playing') return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    if (feedback) {
      this.effect('hurt', this.player, '#ed8b81', 0.4);
      this.event('hurt');
    }
    if (this.player.hp <= 0) {
      this.phase = 'lost';
      this.dialogue = null;
      this.arrows = [];
      this.enemyIntents.clear();
      this.entry(
        'The body falls quiet',
        this.transferReady
          ? 'The signal remains. At the last place of rest, another human breath may answer.'
          : 'The clinic can still recover the priest’s body. The radio signal is not yet stable.',
      );
      this.event('hurt', 'The body can no longer continue.');
    }
  }

  use(item: ItemId) {
    if (this.phase !== 'playing' || !isItem(item) || !(this.inventory[item] ?? 0)) return;
    const p = this.player;
    if (!['cequin', 'salve', 'tonic', 'rations', 'bandage'].includes(item)) {
      this.event('dialogue', 'This material must be traded or prepared.');
      return;
    }
    if ((item === 'salve' || item === 'bandage') && p.hp >= p.maxHp) {
      this.event('dialogue', 'You are already at full health.');
      return;
    }
    this.spend({ [item]: 1 });
    if (item === 'cequin') {
      p.cequinTime = Math.min(600, p.cequinTime + 180);
      p.breath = clamp(p.breath + 35);
    }
    if (item === 'salve')
      p.hp = clamp(p.hp + 35 + skillBonuses(this.progression).medicineBonus, 0, p.maxHp);
    if (item === 'bandage')
      p.hp = clamp(p.hp + 20 + skillBonuses(this.progression).medicineBonus, 0, p.maxHp);
    if (item === 'tonic') {
      p.warmth = clamp(p.warmth + 55);
      p.breath = clamp(p.breath + 25);
    }
    if (item === 'rations') {
      p.stamina = clamp(p.stamina + 35);
      p.warmth = clamp(p.warmth + 20);
      p.hp = clamp(p.hp + 8, 0, p.maxHp);
    }
    this.effect('heal', p, '#addaa5', 0.6);
    this.event('heal', `Used ${ITEMS[item].name.toLowerCase()}.`);
  }

  craft(recipeId: string) {
    if (this.phase !== 'playing') return;
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return;
    if (recipe.id === 'lens' && !this.progressionContext().nearWorkbench) {
      this.event('dialogue', 'A signal lens must be aligned at a workbench.');
      return;
    }
    if (!this.has(recipe.cost)) {
      this.event('dialogue', `Missing materials: ${this.costText(recipe.cost)}.`);
      return;
    }
    const used = Object.values(recipe.cost).reduce((sum, n) => sum + (n ?? 0), 0);
    const home = this.nearHome();
    const amount =
      recipe.amount +
      (recipe.id === 'lens'
        ? 0
        : skillBonuses(this.progression).craftExtra + (home ? homeEffects(home).craftExtra : 0));
    if (this.carried - used + amount > CAPACITY) {
      this.event('dialogue', 'Your pack is full.');
      return;
    }
    this.spend(recipe.cost);
    this.gain({ [recipe.result]: amount });
    grantPractice(this.progression, 'crafting', 4);
    this.recordFreeLife('workshop', recipe.result, amount);
    this.effect('harvest', this.player, '#d5dca4');
    this.event('harvest', `Prepared ${amount} ${recipe.name.toLowerCase()}.`);
  }

  equip(weapon: Weapon) {
    if (!this.weapons.has(weapon) || this.phase !== 'playing') {
      this.event('dialogue', 'Acquire that weapon from a merchant first.');
      return;
    }
    this.player.appearance.weapon = weapon;
    this.event('dialogue', `Equipped ${weapon}.`);
  }

  rest() {
    if (this.phase !== 'playing') return;
    const place = this.nearProp('bench') ?? this.nearProp('shrine');
    if (!place) {
      this.event('dialogue', 'Find a bench or quiet shrine to rest.');
      return;
    }
    if (this.nearbyThreat()) {
      this.event('dialogue', 'It is not safe to rest beside an attacker.');
      return;
    }
    this.restAnchor = { x: this.player.x, y: this.player.y };
    this.player.hp = this.player.maxHp;
    this.player.stamina = 100;
    this.player.warmth = 100;
    this.player.breath = 100;
    this.time += 30;
    this.effect('heal', this.player, '#c4e7df', 1);
    this.event('heal', 'Rested. This place will anchor a return.');
  }

  reincarnate(targetId?: string) {
    const lost = this.phase === 'lost';
    if (!lost && (!this.transferReady || !this.nearProp('shrine'))) {
      this.event(
        'dialogue',
        'A stable signal and a quiet shrine are needed for voluntary mind travel.',
      );
      return;
    }
    if (!lost && this.nearbyThreat()) {
      this.event('dialogue', 'An attacker breaks your concentration.');
      return;
    }
    const candidates = this.transferCandidates;
    const target = targetId ? candidates.find((npc) => npc.id === targetId) : candidates[0];
    if (targetId && !target) {
      this.event('dialogue', 'That person’s living mind is no longer within reach.');
      return;
    }
    if (this.transferReady && !target && !lost) {
      this.event('dialogue', 'No living human mind answers near this place of rest.');
      return;
    }
    const previousPosition = { x: this.player.x, y: this.player.y };
    if (target) {
      const previous: Npc = this.occupiedBody
        ? clone(this.occupiedBody)
        : {
            id: `body:theo-priest:${this.seed}`,
            name: 'The priest',
            seed: this.player.appearance.seed,
            role: 'pilgrim',
            clan: this.player.clan,
            appearance: clone(this.player.appearance),
            x: this.player.x,
            y: this.player.y,
            home: previousPosition,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            speed: 0.7,
            heading: this.player.heading,
            phase: 0,
            hostile: false,
            cooldown: 0,
          };
      Object.assign(previous, previousPosition, {
        home: { ...previousPosition },
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        heading: this.player.heading,
        appearance: clone(this.player.appearance),
      });
      this.npcMemory.set(previous.id, previous);
      this.npcRuntime.set(previous.id, clone(previous));
      if (previous.hp <= 0) this.removed.add(previous.id);
      this.bodyPossessions.set(previous.id, {
        npcId: previous.id,
        notebook: this.notebook,
        inventory: clone(this.inventory),
        coins: this.player.coins,
        weapons: [...this.weapons],
        equipped:
          this.player.appearance.weapon === 'none' ? 'staff' : this.player.appearance.weapon,
      });
      const belongings = this.bodyPossessions.get(target.id) ?? this.initialPossessions(target);
      this.bodyPossessions.delete(target.id);
      this.inventory = clone(belongings.inventory);
      this.notebook = belongings.notebook;
      this.player.coins = belongings.coins;
      this.weapons.clear();
      for (const weapon of belongings.weapons) this.weapons.add(weapon);
      this.occupiedBody = clone(target);
      this.occupiedNpcId = target.id;
      this.rememberIdentity(previous);
      this.rememberIdentity(target);
      if (this.campaignState.ending && !this.freeLifeState.hostProfessions.includes(target.role))
        this.freeLifeState.hostProfessions.push(target.role);
      this.lifeCount++;
      this.player.x = target.x;
      this.player.y = target.y;
      this.player.bodyName = target.name;
      this.player.clan = target.clan;
      this.player.appearance = clone(target.appearance);
      this.player.appearance.weapon = belongings.equipped;
      this.player.cequinTime = 0;
      this.player.maxHp = target.maxHp;
      this.player.hp = target.hp;
      this.player.heading = target.heading;
      this.player.phase = 0;
      this.entry(
        'Another person’s breath',
        `Theo’s mind entered ${target.name}, a living ${target.role}, at (${target.x.toFixed(1)}, ${target.y.toFixed(1)}). ${previous.name}’s body and belongings remained at (${previousPosition.x.toFixed(1)}, ${previousPosition.y.toFixed(1)}). This host carries their own pack, coins and equipment. Theo’s memories and unfinished promises remain.`,
      );
    } else {
      // Without an answering mind, the clinic revives the current body at its rest anchor.
      this.player.x = this.restAnchor.x;
      this.player.y = this.restAnchor.y;
      this.player.hp = this.player.maxHp;
    }
    if (lost && !target) this.player.coins = Math.floor(this.player.coins * 0.8);
    this.player.breath = 100;
    this.player.warmth = 100;
    this.player.stamina = 100;
    this.player.attackCooldown = 0;
    this.player.wardCooldown = 0;
    this.phase = 'playing';
    this.dialogue = null;
    this.arrows = [];
    this.enemyIntents.clear();
    this.effects = [];
    this.refreshNpcs();
    this.visit();
    this.effect('mind', previousPosition, '#c1d9ff', 2);
    this.effect('mind', this.player, '#c1d9ff', 2);
    this.syncFreeLife();
    this.event(
      'transfer',
      target
        ? `Theo now breathes through ${target.name}’s body.`
        : `The clinic restores ${this.player.bodyName}’s breath.`,
    );
  }

  private initialPossessions(npc: Npc): BodyPossessions {
    const seed = deriveSeed(this.seed, `body:${npc.id}:belongings`);
    const equipped =
      npc.role === 'guard'
        ? 'sword'
        : npc.appearance.weapon === 'none'
          ? 'staff'
          : npc.appearance.weapon;
    return {
      npcId: npc.id,
      notebook: npc.id === `body:theo-priest:${this.seed}`,
      inventory:
        npc.role === 'guard'
          ? { cequin: 2, rations: 2, bandage: 1 }
          : npc.role === 'refugee'
            ? { cequin: 2, heartleaf: 1, rations: 1 }
            : { cequin: 3, rations: 1, tonic: 1 },
      coins: (npc.role === 'guard' ? 12 : npc.role === 'refugee' ? 2 : 5) + (seed % 8),
      weapons: equipped === 'staff' ? ['staff'] : ['staff', equipped],
      equipped,
    };
  }

  private has(cost: Partial<Record<ItemId, number>>) {
    return Object.entries(cost).every(
      ([item, amount]) => (this.inventory[item as ItemId] ?? 0) >= (amount ?? 0),
    );
  }
  private spend(cost: Partial<Record<ItemId, number>>) {
    if (!this.has(cost)) return false;
    for (const [item, amount] of Object.entries(cost)) {
      const key = item as ItemId;
      this.inventory[key] = (this.inventory[key] ?? 0) - (amount ?? 0);
      if (!this.inventory[key]) delete this.inventory[key];
    }
    return true;
  }
  private gain(items: Partial<Record<ItemId, number>>) {
    const count = Object.values(items).reduce((sum, n) => sum + (n ?? 0), 0);
    if (this.carried + count > CAPACITY) {
      this.event('dialogue', 'Your pack is full. Use supplies, craft, or trade first.');
      return false;
    }
    for (const [item, amount] of Object.entries(items))
      this.inventory[item as ItemId] = (this.inventory[item as ItemId] ?? 0) + (amount ?? 0);
    return true;
  }
  private nearProp(kind: Prop['kind']) {
    return this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .find((p) => p.kind === kind && distance(p, this.player) <= 1.8);
  }
  private sellPrice(item: ItemId) {
    return Math.max(1, Math.floor(ITEMS[item].price * 0.45));
  }
  private costText(cost: Partial<Record<ItemId, number>>) {
    return Object.entries(cost)
      .map(([id, n]) => `${n} ${ITEMS[id as ItemId].name.toLowerCase()}`)
      .join(' · ');
  }
  private clanId(name: string, fallback: number) {
    return (
      this.world.clans.find((c) => c.name.toLowerCase().includes(name.toLowerCase()))?.id ??
      fallback
    );
  }
  private changeReputation(clan: number, amount: number) {
    if (Number.isInteger(clan) && clan >= 0 && clan < 6)
      this.reputation[clan] = clamp(this.reputation[clan] + amount, -100, 100);
  }
  private originTarget(id: string, prop = false): Point {
    const result = (prop ? this.world.propsAround(0, 0, 24) : this.world.npcsAround(0, 0, 24)).find(
      (n) => n.id === id,
    );
    return result ? { x: result.x, y: result.y } : { ...this.world.spawn };
  }
  private reply(text: string) {
    if (this.dialogue)
      this.dialogue = { ...this.dialogue, text, choices: [{ id: 'close', label: 'Continue' }] };
  }
  private addQuest(quest: Quest) {
    if (!this.quests.some((q) => q.id === quest.id)) {
      this.quests.push(quest);
      this.event('quest', quest.title);
    }
  }
  private complete(id: string) {
    const q = this.quests.find((q) => q.id === id);
    if (q && !q.complete) {
      q.complete = true;
      q.stage++;
      this.awardXp(15);
      this.event('quest', `${q.title} · complete`);
    }
  }
  private awardXp(amount: number) {
    this.player.xp += amount;
    while (this.player.xp >= this.player.level * 40 && this.player.level < 50) {
      this.player.xp -= this.player.level * 40;
      this.player.level++;
      this.player.maxHp += 6;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 6);
      this.event('level', `Experience ${this.player.level}`);
    }
  }
  private entry(title: string, text: string) {
    this.journal.push({ title, text, time: this.time });
    if (this.journal.length > 400) this.journal.splice(0, this.journal.length - 400);
  }
  private visit() {
    this.visited.add(
      `${Math.floor(this.player.x / CHUNK_SIZE)},${Math.floor(this.player.y / CHUNK_SIZE)}`,
    );
    this.revealExploration();
  }

  private includeExploredBounds(x: number, y: number, size: number) {
    const previous = this.fogBounds;
    this.fogBounds = Object.freeze({
      minX: Math.min(previous?.minX ?? x, x),
      minY: Math.min(previous?.minY ?? y, y),
      maxX: Math.max(previous?.maxX ?? x + size, x + size),
      maxY: Math.max(previous?.maxY ?? y + size, y + size),
    });
  }

  private revealExploration() {
    const position = this.player;
    if (this.lastExplorationPoint?.x === position.x && this.lastExplorationPoint.y === position.y)
      return;
    this.lastExplorationPoint = { x: position.x, y: position.y };
    let changed = false;
    const radius = 12,
      size = EXPLORATION_CELL_SIZE;
    for (
      let y = Math.floor((position.y - radius) / size);
      y <= Math.floor((position.y + radius) / size);
      y++
    ) {
      for (
        let x = Math.floor((position.x - radius) / size);
        x <= Math.floor((position.x + radius) / size);
        x++
      ) {
        // The cell containing the body always reveals; other cell centers lie within sight.
        if (
          Math.hypot(x * size + size / 2 - position.x, y * size + size / 2 - position.y) > radius &&
          !(x === Math.floor(position.x / size) && y === Math.floor(position.y / size))
        )
          continue;
        const cx = Math.floor(x / 2),
          cy = Math.floor(y / 2),
          key = `${cx},${cy}`;
        if (
          Math.abs(cx) > maxExplorationChunk ||
          Math.abs(cy) > maxExplorationChunk ||
          this.legacyFogChunks.has(key)
        )
          continue;
        const bit = 1 << ((y - cy * 2) * 2 + x - cx * 2);
        const before = this.fogChunks.get(key) ?? 0;
        if (before & bit) continue;
        this.fogChunks.set(key, before | bit);
        this.includeExploredBounds(x * size, y * size, size);
        changed = true;
      }
    }
    const nearFootprint = (site: Point & { radius: number }) =>
      Math.hypot(
        Math.max(0, Math.abs(position.x - site.x) - site.radius),
        Math.max(0, Math.abs(position.y - site.y) - site.radius),
      ) <= radius;
    let sitesChanged = false;
    const rememberSite = (site: DiscoveredSite) => {
      if (this.knownSites.has(site.id)) return;
      this.knownSites.set(site.id, Object.freeze(site));
      changed = sitesChanged = true;
    };
    for (const town of this.world.settlementsAround(position.x, position.y, 128)) {
      if (!nearFootprint(town)) continue;
      rememberSite({
        id: town.id,
        name: town.name,
        x: town.x,
        y: town.y,
        kind: 'settlement',
        detail: (town as Settlement & { rank?: string }).rank ?? town.kind,
        clan: town.clan,
        radius: town.radius,
      });
    }
    for (const vault of this.world.vaultsAround(position.x, position.y, 40)) {
      if (!nearFootprint(vault)) continue;
      rememberSite({
        id: vault.id,
        name: 'Botanical vault',
        x: vault.x,
        y: vault.y,
        kind: 'vault',
        detail: 'Abandoned seed archive',
        radius: vault.radius,
      });
    }
    if (sitesChanged) this.knownSiteView = Object.freeze([...this.knownSites.values()]);
    if (changed) this.knowledgeRevision++;
  }

  private explorationSave(): ExplorationSave {
    return {
      version: 1,
      revision: this.knowledgeRevision,
      legacyVisitedCount: this.legacyFogChunks.size,
      chunks: [...this.fogChunks].map(([key, mask]) => [...chunkCoordinates(key)!, mask]),
      sites: [...this.knownSites.values()],
    };
  }
  private effect(
    kind: Effect['kind'],
    point: Point,
    color: string,
    duration = 0.6,
    heading?: number,
  ): Effect {
    const effect: Effect = {
      id: this.nextEffect++,
      kind,
      x: point.x,
      y: point.y,
      age: 0,
      duration,
      color,
      heading,
    };
    this.effects.push(effect);
    return effect;
  }
  private event(kind: GameEvent['kind'], text?: string) {
    this.events.push({ kind, text });
    if (this.events.length > 100) this.events.shift();
  }
  drainEvents() {
    return this.events.splice(0);
  }

  save() {
    this.syncCampaign();
    this.syncFreeLife();
    if (this.campaignState.ending)
      for (const npc of this.npcs) if (distance(npc, this.player) < 6) this.rememberIdentity(npc);
    for (const npc of this.npcs) this.rememberNpc(npc);
    return clone({
      version: 1,
      terrainRevision: 3,
      worldGeneration: this.world.generation,
      seed: this.seed,
      player: this.player,
      notebook: this.notebook,
      campaign: this.campaignState,
      progression: this.progression,
      freeLife: this.freeLifeState,
      inventory: this.inventory,
      removed: [...this.removed],
      opened: [...this.opened],
      weapons: [...this.weapons],
      npcs: [...this.npcMemory.values()],
      quests: this.quests,
      journal: this.journal,
      time: this.time,
      distanceTraveled: this.distanceTraveled,
      visited: [...this.visited],
      exploration: this.explorationSave(),
      reputation: this.reputation,
      storyStage: this.storyStage,
      phase: this.phase,
      restAnchor: this.restAnchor,
      lifeCount: this.lifeCount,
      occupiedNpcId: this.occupiedNpcId,
      occupiedBody: this.occupiedBody,
      bodyPossessions: [...this.bodyPossessions.values()],
      supplyJobs: [...this.supplyJobs.values()],
      correspondenceJobs: [...this.correspondenceJobs.values()],
    });
  }

  static restore(value: unknown): Stichos {
    const data = validateSave(value);
    const game = new Stichos(data.seed, data.worldGeneration ?? 1);
    game.player = clone(data.player);
    const priestBodyId = `body:theo-priest:${data.seed}`;
    game.notebook = data.notebook ?? (data.occupiedNpcId ?? priestBodyId) === priestBodyId;
    game.inventory = { ...data.inventory };
    game.progression = restoreProgression(data.progression, data.seed);
    for (const id of data.removed) game.removed.add(id);
    for (const id of data.opened) game.opened.add(id);
    game.weapons.clear();
    for (const weapon of data.weapons) game.weapons.add(weapon);
    game.npcMemory = new Map(data.npcs.map((n) => [n.id, clone(n)]));
    game.npcs = [];
    game.quests = clone(data.quests);
    game.journal = clone(data.journal);
    game.time = data.time;
    game.distanceTraveled = data.distanceTraveled;
    game.visited.clear();
    for (const id of data.visited) game.visited.add(id);
    game.fogChunks.clear();
    game.legacyFogChunks.clear();
    game.knownSites.clear();
    game.knownSiteView = Object.freeze([]);
    game.fogBounds = null;
    game.lastExplorationPoint = null;
    const exploration = data.exploration;
    let originLabelMigrated = false;
    // Old saves recorded entered chunks, not sight cells. Reconstruct only that approximate
    // old trail lazily; retain its ordered prefix rather than expanding 100k chunks into cells.
    const legacyCount = exploration?.legacyVisitedCount ?? data.visited.length;
    for (let i = 0; i < legacyCount; i++) {
      const key = data.visited[i];
      game.legacyFogChunks.add(key);
      const [cx, cy] = chunkCoordinates(key)!;
      game.includeExploredBounds(cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE);
    }
    if (exploration) {
      for (const [cx, cy, mask] of exploration.chunks) {
        const key = `${cx},${cy}`;
        if (game.legacyFogChunks.has(key)) continue;
        game.fogChunks.set(key, mask);
        for (let bit = 0; bit < 4; bit++)
          if (mask & (1 << bit))
            game.includeExploredBounds(
              cx * CHUNK_SIZE + (bit % 2) * EXPLORATION_CELL_SIZE,
              cy * CHUNK_SIZE + Math.floor(bit / 2) * EXPLORATION_CELL_SIZE,
              EXPLORATION_CELL_SIZE,
            );
      }
      for (const site of exploration.sites) {
        const restoredSite = clone(site);
        // The old label used the planet's name for its starting city. Stable IDs,
        // positions, fog and world generation still describe the same visited place.
        if (
          restoredSite.id === 'origin' &&
          restoredSite.kind === 'settlement' &&
          restoredSite.name !== ORIGIN_CITY_NAME
        ) {
          restoredSite.name = ORIGIN_CITY_NAME;
          originLabelMigrated = true;
        }
        game.knownSites.set(site.id, Object.freeze(restoredSite));
      }
      game.knownSiteView = Object.freeze([...game.knownSites.values()]);
    }
    game.knowledgeRevision = Math.min(
      Number.MAX_SAFE_INTEGER,
      (exploration?.revision ?? 0) + Number(originLabelMigrated),
    );
    game.reputation = [...data.reputation];
    game.storyStage = data.storyStage;
    game.campaignState = data.campaign
      ? validateCampaignState(data.campaign)
      : createCampaignState();
    game.freeLifeState = restoreFreeLife(data.freeLife);
    if (data.freeLife === undefined)
      game.freeLifeState.knownHosts = [...game.npcMemory.values()]
        .filter((n) => n.hp > 0 && !n.hostile && !game.removed.has(n.id))
        .sort((a, b) => Number(b.id === priestBodyId) - Number(a.id === priestBodyId))
        .slice(0, 128)
        .map((n) => n.id);
    game.phase = data.phase;
    game.restAnchor = { ...data.restAnchor };
    game.lifeCount = data.lifeCount;
    game.occupiedNpcId = data.occupiedNpcId ?? null;
    game.occupiedBody = data.occupiedBody ? clone(data.occupiedBody) : null;
    game.bodyPossessions = new Map(
      (data.bodyPossessions ?? []).map((body) => [
        body.npcId,
        {
          ...clone(body),
          notebook: body.notebook ?? body.npcId === priestBodyId,
        },
      ]),
    );
    game.supplyJobs = new Map(data.supplyJobs.map((job) => [job.npcId, clone(job)]));
    game.correspondenceJobs = new Map(
      (data.correspondenceJobs ?? []).map((job) => [job.sourceId, clone(job)]),
    );
    // A saved dispatch can point back to the origin. Update only its derived place
    // label; the recipient, promises, reward and decision remain the same.
    for (const job of game.correspondenceJobs.values()) {
      if (job.settlementId !== 'origin' || job.settlementName === ORIGIN_CITY_NAME) continue;
      const previousName = job.settlementName;
      job.settlementName = ORIGIN_CITY_NAME;
      const quest = game.quests.find((q) => q.id === game.dispatchQuestId(job));
      if (quest) {
        if (quest.title === `A dispatch for ${previousName}`)
          quest.title = `A dispatch for ${ORIGIN_CITY_NAME}`;
        quest.objective = quest.objective.replace(
          ` in ${previousName}. Choose what to disclose.`,
          ` in ${ORIGIN_CITY_NAME}. Choose what to disclose.`,
        );
      }
      for (const entry of game.journal)
        if (entry.title === 'Words for another settlement')
          entry.text = entry.text.replace(
            ` for ${job.recipientName} in ${previousName}.`,
            ` for ${job.recipientName} in ${ORIGIN_CITY_NAME}.`,
          );
    }
    if ((data.terrainRevision ?? 1) < 3) {
      // Revisions 2 and 3 widen only the origin cathedral and move its houses.
      // Preserve exact positions everywhere else and every already-clear legacy position.
      const relocate = (point: Point) => {
        if (game.clear(point) || Math.abs(point.x) > 26 || Math.abs(point.y) > 26) return false;
        let nearest: Point | undefined;
        let nearestDistance = 4.01;
        for (let y = Math.round(point.y) - 4; y <= Math.round(point.y) + 4; y++) {
          for (let x = Math.round(point.x) - 4; x <= Math.round(point.x) + 4; x++) {
            const candidate = { x, y };
            const offset = distance(candidate, point);
            if (offset < nearestDistance && game.clear(candidate)) {
              nearest = candidate;
              nearestDistance = offset;
            }
          }
        }
        if (!nearest) return false;
        Object.assign(point, nearest);
        return true;
      };
      const playerMoved = relocate(game.player);
      const anchorMoved = relocate(game.restAnchor);
      for (const npc of game.npcMemory.values()) {
        if (npc.hp > 0 && !game.removed.has(npc.id)) {
          relocate(npc);
          relocate(npc.home);
        }
      }
      if (playerMoved || anchorMoved)
        game.entry(
          'Familiar ground',
          'Your footing was restored beside the expanded cathedral. Your belongings, body and unfinished promises remain.',
        );
    }
    if (!game.clear(game.player) || !game.clear(game.restAnchor))
      throw new Error('Saved position is inside blocked terrain.');
    game.refreshNpcs();
    game.syncCampaign();
    game.syncFreeLife();
    game.revealExploration();
    game.events = [];
    game.dialogue = null;
    return game;
  }
}

type SaveData = ReturnType<Stichos['save']>;
function validateSave(value: unknown): SaveData {
  const fail = () => {
    throw new Error('Invalid or incompatible Stíchos save.');
  };
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const number = (v: unknown, min: number, max: number, integer = false) =>
    finite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
  const text = (v: unknown, limit = 500): v is string => typeof v === 'string' && v.length <= limit;
  const point = (v: unknown) =>
    object(v) &&
    number(v.x, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) &&
    number(v.y, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const strings = (v: unknown) =>
    Array.isArray(v) && v.every((x) => text(x, 160)) && new Set(v).size === v.length;
  const look = (v: unknown) =>
    object(v) &&
    number(v.seed, -0xffffffff, 0xffffffff, true) &&
    ['skin', 'hair', 'coat', 'trim', 'trousers'].every(
      (k) => text(v[k], 40) && /^#[0-9a-f]{3,8}$/i.test(v[k] as string),
    ) &&
    ['height', 'build'].every((k) => number(v[k], 0.1, 10)) &&
    ['hairStyle', 'hat'].every((k) => number(v[k], 0, 100, true)) &&
    typeof v.cloak === 'boolean' &&
    ['staff', 'sword', 'bow', 'none'].includes(v.weapon as string);
  if (!object(value) || value.version !== 1 || !number(value.seed, 0, 0xffffffff, true))
    return fail();
  if (value.terrainRevision !== undefined && ![1, 2, 3].includes(value.terrainRevision as number))
    return fail();
  if (value.worldGeneration !== undefined && ![1, 2, 3].includes(value.worldGeneration as number))
    return fail();
  const p = value.player;
  if (
    !object(p) ||
    !point(p) ||
    !text(p.name, 80) ||
    !text(p.bodyName, 100) ||
    !look(p.appearance) ||
    !number(p.clan, 0, 5, true) ||
    !number(p.maxHp, 1, 1000) ||
    !number(p.hp, 0, p.maxHp as number) ||
    !['breath', 'warmth', 'stamina'].every((k) => number(p[k], 0, 100)) ||
    !number(p.speed, 0.5, 8) ||
    !number(p.level, 1, 50, true) ||
    !number(p.xp, 0, Number.MAX_SAFE_INTEGER, true) ||
    !number(p.coins, 0, Number.MAX_SAFE_INTEGER, true) ||
    !number(p.heading, -1e6, 1e6) ||
    !number(p.phase, 0, Number.MAX_SAFE_INTEGER) ||
    !number(p.attackCooldown, 0, 10) ||
    !number(p.wardCooldown, 0, 30) ||
    !number(p.cequinTime, 0, 600)
  )
    return fail();
  if (
    !object(value.inventory) ||
    !Object.entries(value.inventory).every(([k, v]) => isItem(k) && number(v, 0, CAPACITY, true)) ||
    Object.values(value.inventory).reduce<number>((sum, n) => sum + (n as number), 0) > CAPACITY
  )
    return fail();
  if (
    !strings(value.removed) ||
    !strings(value.opened) ||
    !strings(value.visited) ||
    !(value.visited as string[]).every((key) => chunkCoordinates(key)) ||
    !Array.isArray(value.weapons) ||
    !value.weapons.length ||
    !value.weapons.every((w) => ['staff', 'sword', 'bow'].includes(w)) ||
    !value.weapons.includes((p.appearance as Record<string, unknown>).weapon)
  )
    return fail();
  if (value.exploration !== undefined) {
    const fog = value.exploration;
    if (
      !object(fog) ||
      fog.version !== 1 ||
      !number(fog.revision, 0, Number.MAX_SAFE_INTEGER, true) ||
      !number(fog.legacyVisitedCount, 0, (value.visited as string[]).length, true) ||
      !Array.isArray(fog.chunks) ||
      !fog.chunks.every(
        (chunk) =>
          Array.isArray(chunk) &&
          chunk.length === 3 &&
          number(chunk[0], -maxExplorationChunk, maxExplorationChunk, true) &&
          number(chunk[1], -maxExplorationChunk, maxExplorationChunk, true) &&
          number(chunk[2], 1, 15, true),
      ) ||
      !Array.isArray(fog.sites) ||
      !fog.sites.every(
        (site) =>
          object(site) &&
          point(site) &&
          text(site.id, 160) &&
          text(site.name, 200) &&
          text(site.detail, 200) &&
          ['settlement', 'vault'].includes(site.kind as string) &&
          number(site.radius, 1, 1024) &&
          (site.clan === undefined || number(site.clan, 0, 5, true)),
      )
    )
      return fail();
    const legacy = new Set((value.visited as string[]).slice(0, fog.legacyVisitedCount as number));
    const keys = fog.chunks.map(([x, y]) => `${x},${y}`);
    if (
      new Set(keys).size !== keys.length ||
      keys.some((key) => legacy.has(key)) ||
      new Set(fog.sites.map((site) => site.id)).size !== fog.sites.length
    )
      return fail();
  }
  if (
    !number(value.time, 0, Number.MAX_SAFE_INTEGER) ||
    !number(value.distanceTraveled, 0, Number.MAX_SAFE_INTEGER) ||
    !number(value.storyStage, 0, 4, true) ||
    !number(value.lifeCount, 0, Number.MAX_SAFE_INTEGER, true) ||
    !point(value.restAnchor) ||
    !['playing', 'lost'].includes(value.phase as string) ||
    (value.phase === 'lost') !== (p.hp === 0)
  )
    return fail();
  if (
    !Array.isArray(value.reputation) ||
    value.reputation.length !== 6 ||
    !value.reputation.every((r) => number(r, -100, 100))
  )
    return fail();
  const npc = (n: unknown) =>
    object(n) &&
    point(n) &&
    text(n.id, 160) &&
    text(n.name, 100) &&
    number(n.seed, -0xffffffff, 0xffffffff, true) &&
    [
      'botanist',
      'merchant',
      'archivist',
      'engineer',
      'guard',
      'refugee',
      'raider',
      'pilgrim',
    ].includes(n.role as string) &&
    number(n.clan, 0, 5, true) &&
    look(n.appearance) &&
    number(n.maxHp, 1, 1000) &&
    number(n.hp, 0, n.maxHp as number) &&
    point(n.home) &&
    number(n.speed, 0, 10) &&
    number(n.heading, -1e6, 1e6) &&
    number(n.phase, 0, Number.MAX_SAFE_INTEGER) &&
    typeof n.hostile === 'boolean' &&
    number(n.cooldown, 0, 30);
  if (
    !Array.isArray(value.npcs) ||
    !value.npcs.every(npc) ||
    new Set(value.npcs.map((n) => n.id)).size !== value.npcs.length
  )
    return fail();
  if (value.occupiedNpcId !== undefined && value.occupiedNpcId !== null) {
    if (
      !text(value.occupiedNpcId, 160) ||
      !npc(value.occupiedBody) ||
      (value.occupiedBody as Npc).id !== value.occupiedNpcId ||
      (!(object(value.campaign) && value.campaign.step === CAMPAIGN_LENGTH) &&
        !['pilgrim', 'refugee', 'guard'].includes((value.occupiedBody as Npc).role)) ||
      (value.removed as string[]).includes(value.occupiedNpcId) ||
      (value.storyStage as number) < 4
    )
      return fail();
  } else if (value.occupiedBody !== undefined && value.occupiedBody !== null) return fail();
  const priestBodyId = `body:theo-priest:${value.seed}`;
  const currentBodyId = value.occupiedNpcId ?? priestBodyId;
  // There is no notebook trade/drop mechanic. The one physical volume stays with
  // its original body; old saves omit these flags and derive the same ownership.
  if (value.notebook !== undefined && value.notebook !== (currentBodyId === priestBodyId))
    return fail();
  if (value.bodyPossessions !== undefined) {
    if (
      !Array.isArray(value.bodyPossessions) ||
      !value.bodyPossessions.every(
        (body) =>
          object(body) &&
          text(body.npcId, 160) &&
          body.npcId !== currentBodyId &&
          (body.notebook === undefined || body.notebook === (body.npcId === priestBodyId)) &&
          (value.npcs as Npc[]).some((n) => n.id === body.npcId) &&
          object(body.inventory) &&
          Object.entries(body.inventory).every(
            ([k, v]) => isItem(k) && number(v, 0, CAPACITY, true),
          ) &&
          Object.values(body.inventory).reduce<number>((sum, n) => sum + (n as number), 0) <=
            CAPACITY &&
          number(body.coins, 0, Number.MAX_SAFE_INTEGER, true) &&
          Array.isArray(body.weapons) &&
          body.weapons.length > 0 &&
          body.weapons.every((w) => ['staff', 'sword', 'bow'].includes(w)) &&
          new Set(body.weapons).size === body.weapons.length &&
          body.weapons.includes(body.equipped),
      ) ||
      new Set(value.bodyPossessions.map((body) => body.npcId)).size !== value.bodyPossessions.length
    )
      return fail();
  }
  if (
    !Array.isArray(value.quests) ||
    !value.quests.every(
      (q) =>
        object(q) &&
        text(q.id, 200) &&
        text(q.title, 200) &&
        text(q.description, 2000) &&
        text(q.objective, 1000) &&
        number(q.stage, 0, 100, true) &&
        typeof q.complete === 'boolean' &&
        (q.target === undefined || point(q.target)),
    ) ||
    new Set(value.quests.map((q) => q.id)).size !== value.quests.length
  )
    return fail();
  if (
    !Array.isArray(value.journal) ||
    value.journal.length > 400 ||
    !value.journal.every(
      (j) =>
        object(j) &&
        text(j.title, 200) &&
        text(j.text, 4000) &&
        number(j.time, 0, value.time as number),
    )
  )
    return fail();
  if (
    !Array.isArray(value.supplyJobs) ||
    !value.supplyJobs.every(
      (j) =>
        object(j) &&
        text(j.npcId, 160) &&
        ['cequin', 'heartleaf', 'emberroot'].includes(j.item as string) &&
        number(j.amount, 1, 20, true) &&
        number(j.number, 1, Number.MAX_SAFE_INTEGER, true) &&
        typeof j.active === 'boolean' &&
        point(j.target),
    )
  )
    return fail();
  if (value.correspondenceJobs !== undefined) {
    if (
      !Array.isArray(value.correspondenceJobs) ||
      !value.correspondenceJobs.every(
        (job) =>
          object(job) &&
          ['sourceId', 'recipientId', 'settlementId'].every((k) => text(job[k], 160)) &&
          ['sourceName', 'recipientName', 'settlementName'].every((k) => text(job[k], 200)) &&
          job.sourceId !== job.recipientId &&
          number(job.sourceClan, 0, 5, true) &&
          number(job.recipientClan, 0, 5, true) &&
          point(job.sourcePoint) &&
          point(job.target) &&
          number(job.number, 1, Number.MAX_SAFE_INTEGER, true) &&
          text(job.payload, 1000) &&
          text(job.omitted, 1000) &&
          number(job.reward, 1, 100, true) &&
          ['active', 'delivered', 'revealed', 'withheld', 'cancelled'].includes(
            job.status as string,
          ) &&
          (value.quests as Quest[]).some(
            (q) =>
              q.id === `correspondence:${job.sourceId}:${job.number}` &&
              q.complete === (job.status !== 'active'),
          ),
      ) ||
      new Set(value.correspondenceJobs.map((job) => job.sourceId)).size !==
        value.correspondenceJobs.length
    )
      return fail();
  }
  if (value.campaign !== undefined) {
    const campaign = validateCampaignState(value.campaign);
    if (campaign.started !== (value.storyStage as number) >= 4) return fail();
    for (let i = 0; i < campaign.step; i++) {
      const id = `sallas:${i.toString().padStart(2, '0')}`;
      if (!(value.quests as Quest[]).some((q) => q.id === id && q.complete)) return fail();
    }
  }
  if (value.freeLife !== undefined) {
    const freeLife = restoreFreeLife(value.freeLife);
    if (
      freeLife.knownHosts.some(
        (id) => !(value.npcs as Npc[]).some((n) => n.id === id) && id !== value.occupiedNpcId,
      )
    )
      return fail();
  }
  return value as unknown as SaveData;
}
