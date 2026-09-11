import {
  buildCompact,
  createCompact,
  compactProject,
  previewCompact,
  applyCompact,
  recordCompactEvent,
  restoreCompact,
  type CompactPlan,
  type CompactAction,
  type CompactEvent,
  type CompactContext,
} from './compact.ts';
import {
  InfiniteWorld,
  appearance,
  CHUNK_SIZE,
  ORIGIN_CITY_NAME,
  type WorldGeneration,
} from './world.ts';
import {
  seededTool,
  requiredToolFor,
  resourceWork,
  applyToolStroke,
  workerProfile,
  assignLabor,
  finishLabor,
  validateLaborOrders,
  artifactToolKind,
  THEO_ESTATE,
  type ToolKind,
  type ToolState,
  type WorkProgress,
  type LaborKind,
  type LaborOrder,
} from './labor.ts';
import {
  validSharedCombatFrame,
  type SharedCombatFrame,
  type SharedEnemy,
  type SharedCombatProgression,
} from './shared-combat.ts';
import { deriveSeed } from '../procedural/random.ts';
import {
  generateLifeCandidate,
  normalizeLifeCustomization,
  restoreLifeOrigin,
  type LifeCandidate,
  type LifeCustomization,
  type LifeOriginRecord,
} from './life-origin.ts';
import {
  createProduction,
  restoreProduction,
  productionSources,
  PRODUCTION_KINDS,
  PRODUCTION_RECIPES,
  type ProductionKind,
  type ProductionState,
  type ProductionStructure,
} from './production.ts';
import {
  weaponProfile as generatedWeaponProfile,
  technologyWeaponSeed,
  MAX_WEAPON_SEED,
} from './equipment.ts';
import { civilizationFor, civilizationTechnologyTier } from './civilization.ts';
import { plantProfile, type PlantKind } from './botany.ts';
import { resolveForge, type ForgeRecipe, type ForgeResult } from './forge.ts';
import { generateArtifact, normalizeArtifactDesign, type ArtifactGenome } from './artifacts.ts';
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
  professionProfile,
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
  Appearance,
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
function ordinaryMarketSeed(
  seed: number,
  generation: WorldGeneration,
  sourceId: string,
  kind: string,
) {
  const base = deriveSeed(seed, 'ordinary-stock-v2', sourceId, kind);
  return generation < 4
    ? base
    : technologyWeaponSeed(base, civilizationTechnologyTier(civilizationFor(seed)));
}
type OrdinaryWeapon = {
  version: 2;
  kind: Weapon;
  seed: number;
  source: 'merchant' | 'loot';
  sourceId: string;
};
type OrdinaryPack = {
  designs: OrdinaryWeapon[];
  selected: Partial<Record<Weapon, number>>;
  inherited?: Partial<Record<Weapon, number>>;
};
type BodyPossessions = {
  npcId: string;
  notebook: boolean;
  inventory: Partial<Record<ItemId, number>>;
  coins: number;
  weapons: Weapon[];
  equipped: Weapon | 'none';
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
  enchantment?: WeaponProfile['effect'];
  artifactBenefits?: ArtifactGenome['properties'];
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
  private originRecord: LifeOriginRecord | null = null;
  private originCandidate: LifeCandidate | null = null;
  private production = createProduction();
  private winterState = createCompact();
  private winterPlan: CompactPlan | null = null;
  private winterLaborBaseline = 0;
  private campaignState = createCampaignState();
  private campaignPlan: CampaignPlan | null = null;
  private campaignOrdinary = false;
  progression: ProgressionState;
  private cosmeticEntitlements: string[] = [];
  private freeLifeState = createFreeLife();
  private fieldCommissionSearch: {
    jobId: string;
    propId?: string;
    failedAtRemovedSize?: number;
  } | null = null;
  private toolPacks = new Map<string, { tools: ToolState[]; equipped: ToolKind | null }>();
  private currentWork:
    | (WorkProgress & { requiredStrokes: number; toolKind: ToolKind; bodyId: string })
    | null = null;
  private orders: LaborOrder[] = [];
  private laborSerial = 0;
  private laborPaths = new Map<string, { target: string; points: Point[]; removedSize: number }>();
  private sharedWorld = false;
  private sharedCombat = false;
  private sharedRoom = '';
  private sharedSequence = -1;
  private sharedSnapshotLoaded = false;
  private sharedEnemies = new Map<string, SharedEnemy>();
  private sharedProjectiles = new Map<number, { effect: Effect; vx: number; vy: number }>();
  private sharedWarnings = new Map<string, Effect>();
  private sharedReceipts = new Set<number>();
  private sharedBenefitStrikes = new Set<number>();
  private sharedReceiptFloor = 0;
  private sharedAcknowledged = 0;
  private sharedRewarded = new Set<string>();
  private sharedIneligible = new Set<string>();
  private sharedPeaceful = new Set<string>();
  private approvingSharedParley = false;
  private estateTrust: Record<string, boolean> = Object.fromEntries(
    THEO_ESTATE.staffIds.map((id) => [id, true]),
  );
  private inventionSerial = 0;
  private artifactPacks = new Map<
    string,
    { designs: string[]; equipped: string | null; wear?: Record<string, number> }
  >();
  private ordinaryEquipment = new Map<string, OrdinaryPack>();
  private forgedWeapons = new Map<
    string,
    Partial<Record<Weapon, { seed: number; ownerSeed: number; recipe: ForgeRecipe }>>
  >();
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
    if (![1, 2, 3, 4].includes(generation)) throw new Error('Unknown world generation.');
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
      coins: THEO_ESTATE.coins,
      attackCooldown: 0,
      wardCooldown: 0,
      cequinTime: 0,
    };
    this.initializeEstate();
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

  get lifeOrigin() {
    return this.originCandidate ? clone(this.originCandidate) : null;
  }
  get identityName() {
    return this.player.name;
  }
  get originName() {
    return this.originCandidate?.settlement.name ?? ORIGIN_CITY_NAME;
  }
  lifeCandidate(index: number, customization: LifeCustomization = {}) {
    const candidate = generateLifeCandidate(this.seed, index, customization, this.world.generation);
    const known =
      this.npcMemory.get(candidate.id) ??
      (this.occupiedNpcId === candidate.id ? this.occupiedBody : null);
    if (known) {
      candidate.name = known.name;
      candidate.appearance = clone(known.appearance);
      candidate.stats.maxHp = known.maxHp;
      candidate.start = { x: known.x, y: known.y };
      const belongings =
        known.id === this.bodyId
          ? { inventory: this.inventory, coins: this.player.coins }
          : (this.bodyPossessions.get(known.id) ?? this.initialPossessions(known));
      candidate.inventory = clone(belongings.inventory);
      candidate.coins = belongings.coins;
    }
    return candidate;
  }
  private lifeBody(candidate: LifeCandidate): Npc {
    return {
      id: candidate.id,
      seed: candidate.seed,
      name: candidate.name,
      role: candidate.profession,
      clan: candidate.clan,
      appearance: clone(candidate.appearance),
      x: candidate.start.x,
      y: candidate.start.y,
      home: { x: candidate.home.x, y: candidate.home.y + 1 },
      hp: candidate.stats.maxHp,
      maxHp: candidate.stats.maxHp,
      speed: 0.75,
      heading: Math.PI / 2,
      phase: 0,
      hostile: false,
      cooldown: 0,
    };
  }
  acceptLife(index: number, customization: LifeCustomization = {}) {
    if (
      this.originRecord ||
      this.time !== 0 ||
      this.distanceTraveled !== 0 ||
      this.removed.size ||
      this.opened.size ||
      this.player.xp ||
      this.player.coins !== THEO_ESTATE.coins ||
      this.journal.length !== 1 ||
      this.orders.length ||
      this.artifactPacks.size ||
      this.forgedWeapons.size ||
      Object.values(this.progression.xp).some((n) => n > 0)
    )
      return {
        ok: false,
        message:
          'Choose an origin before this life begins. Retire the current life to enter another resident.',
      };
    let candidate: LifeCandidate;
    try {
      candidate = this.lifeCandidate(index, customization);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Invalid life candidate.',
      };
    }
    this.originRecord = {
      version: 1,
      index,
      customization: normalizeLifeCustomization(customization),
    };
    this.originCandidate = candidate;
    this.occupiedNpcId = candidate.id;
    this.occupiedBody = this.lifeBody(candidate);
    this.npcMemory.set(candidate.id, clone(this.occupiedBody));
    Object.assign(this.player, {
      ...candidate.start,
      name: candidate.name,
      bodyName: candidate.name,
      clan: candidate.clan,
      appearance: clone(candidate.appearance),
      maxHp: candidate.stats.maxHp,
      hp: candidate.stats.maxHp,
      speed: candidate.stats.speed,
      breath: candidate.stats.breath,
      warmth: candidate.stats.warmth,
      coins: candidate.coins,
    });
    this.inventory = clone(candidate.inventory);
    this.notebook = false;
    this.weapons.clear();
    if (candidate.appearance.weapon !== 'none') this.weapons.add(candidate.appearance.weapon);
    this.progression = createProgression(this.seed);
    this.progression.xp = { ...candidate.professionXp };
    this.progression.homes = [
      { ...candidate.home, purchasedAt: 0, furniture: {}, plots: [null, null] },
    ];
    this.estateTrust = Object.fromEntries(THEO_ESTATE.staffIds.map((id) => [id, false]));
    this.toolPacks.clear();
    this.installLifeTools(candidate);
    this.restAnchor = { ...candidate.start };
    this.quests = [
      {
        id: 'life-first-work',
        title: 'A life already in motion',
        description: `${candidate.name}, ${candidate.age}, ${candidate.profession} in ${candidate.settlement.name}. ${candidate.activity.label}.`,
        objective: 'Read a local notice, practice your trade, or investigate the old signal.',
        stage: 0,
        complete: false,
        target: { x: candidate.settlement.x - 2, y: candidate.settlement.y + 1 },
      },
    ];
    this.journal = [];
    this.entry(
      'A different morning',
      `${candidate.name} was ${candidate.activity.label.toLowerCase()} when awareness settled into this body. ${candidate.perk} A real home waits in ${candidate.settlement.name}.`,
    );
    this.visited.clear();
    this.fogChunks.clear();
    this.legacyFogChunks.clear();
    this.knownSites.clear();
    this.knownSiteView = Object.freeze([]);
    this.fogBounds = null;
    this.knowledgeRevision = 0;
    this.lastExplorationPoint = null;
    this.effects = [];
    this.refreshNpcs();
    this.visit();
    const e = this.effect('mind', this.player, '#c1d9ff', 2.4);
    e.actorId = this.bodyId;
    this.event('transfer', `Awareness enters ${candidate.name}.`);
    return {
      ok: true,
      message: `${candidate.name}'s life begins in ${candidate.settlement.name}.`,
    };
  }
  private installLifeTools(candidate: LifeCandidate) {
    if (this.toolPacks.has(candidate.id)) return;
    this.toolPacks.set(candidate.id, {
      tools: candidate.tools.map((kind) => ({
        kind,
        seed: candidate.appearance.seed,
        durability: seededTool(candidate.appearance.seed, kind).maxDurability,
      })),
      equipped: candidate.tools[0] ?? null,
    });
  }
  retireLife(index: number, customization: LifeCustomization = {}) {
    if (this.phase !== 'playing' || this.sharedWorld || this.nearbyThreat())
      return { ok: false, message: 'Settle safely in solo play before retiring this life.' };
    let candidate: LifeCandidate;
    try {
      candidate = this.lifeCandidate(index, customization);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Invalid life candidate.',
      };
    }
    if (candidate.id === this.bodyId || this.removed.has(candidate.id))
      return { ok: false, message: 'That body is already occupied or no longer available.' };
    const existing = this.npcMemory.get(candidate.id),
      target = existing ? clone(existing) : this.lifeBody(candidate);
    if (target.hp <= 0 || target.hostile || !this.clear(target))
      return { ok: false, message: 'That resident cannot receive this arrival.' };
    if (!existing) {
      this.npcMemory.set(target.id, clone(target));
      this.bodyPossessions.set(target.id, {
        npcId: target.id,
        notebook: false,
        inventory: clone(candidate.inventory),
        coins: candidate.coins,
        weapons: candidate.appearance.weapon === 'none' ? [] : [candidate.appearance.weapon],
        equipped: candidate.appearance.weapon,
      });
      this.installLifeTools(candidate);
    }
    this.enterBody(target, false);
    this.originRecord = {
      version: 1,
      index,
      customization: normalizeLifeCustomization(customization),
    };
    this.originCandidate = candidate;
    this.player.name = candidate.name;
    this.player.speed = candidate.stats.speed;
    for (const profession of ['botany', 'crafting', 'combat'] as const)
      this.progression.xp[profession] = Math.max(
        this.progression.xp[profession],
        candidate.professionXp[profession],
      );
    this.restAnchor = { x: this.player.x, y: this.player.y };
    if (
      !this.progression.homes.some((home) => home.id === candidate.home.id) &&
      this.progression.homes.length < 3
    )
      this.progression.homes.push({
        ...candidate.home,
        purchasedAt: this.time,
        furniture: {},
        plots: [null, null],
      });
    this.entry(
      'A life left standing',
      `Awareness now lives as ${candidate.name}. The previous body keeps its physical belongings; work sites and commitments remain on this planet.`,
    );
    return {
      ok: true,
      message: `Entered ${candidate.name}; the previous life and its belongings remain.`,
    };
  }

  get transferReady() {
    return this.storyStage >= 4;
  }
  get productionStructures() {
    return this.production.structures.map((s) => {
      const recipe = PRODUCTION_RECIPES.find((r) => r.id === s.job?.recipe);
      return {
        ...clone(s),
        phase: s.job?.blocked
          ? 'blocked'
          : s.job?.awaitingClaim
            ? 'awaiting-claim'
            : s.job
              ? 'working'
              : Object.values(s.output).some((n) => n && n > 0)
                ? 'ready'
                : 'idle',
        progress: s.job && recipe ? s.job.elapsed / recipe.seconds : 0,
      };
    });
  }
  get nextProductionId() {
    return `production:${this.production.serial + 1}`;
  }
  get productionRecipes() {
    return clone(PRODUCTION_RECIPES);
  }
  private productionSiteClear(point: Point, ignoreId?: string) {
    if (this.production.structures.some((s) => s.id !== ignoreId && distance(s, point) < 3))
      return false;
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const tile = this.world.tile(point.x + x, point.y + y);
        if (
          tile.building ||
          tile.site ||
          !['snow', 'grass'].includes(tile.terrain) ||
          this.world.blocked(tile.x, tile.y, this.removed)
        )
          return false;
      }
    if (
      this.world
        .propsAround(point.x, point.y, 2.1)
        .some((p) => !this.removed.has(p.id) && distance(p, point) < 2.1)
    )
      return false;
    return !this.npcs.some((n) => n.hp > 0 && distance(n, point) < 2);
  }
  productionPreview(kind: ProductionKind, point: Point) {
    const definition = PRODUCTION_KINDS.find((k) => k.id === kind),
      valid =
        point &&
        finite(point.x) &&
        finite(point.y) &&
        Math.abs(point.x) <= 10000000 &&
        Math.abs(point.y) <= 10000000;
    const place = valid ? { x: Math.round(point.x), y: Math.round(point.y) } : { x: 0, y: 0 };
    const fail = (message: string) => ({
      ok: false,
      message,
      point: place,
      definition: definition ?? null,
    });
    if (!definition || !valid) return fail('Choose a valid production structure and world tile.');
    if (this.phase !== 'playing' || this.nearbyThreat()) return fail('Build while safe and awake.');
    if (distance(this.player, place) > 2)
      return fail('Stand within two paces of the marked work platform.');
    if (this.production.structures.length >= 8 || this.production.serial >= 1000000)
      return fail('This household already maintains eight production platforms.');
    if (!this.productionSiteClear(place))
      return fail(
        'Choose a clear three-by-three patch of snow or grass away from roads, buildings, people and resources.',
      );
    if (kind !== 'garden' && professionProfile(this.progression, 'crafting').level < 2)
      return fail('Crafting level two is needed to assemble powered production.');
    if (this.player.coins < definition.coins || !this.has(definition.items))
      return fail(
        `Construction needs ${definition.coins} coins and ${this.costText(definition.items)}.`,
      );
    return {
      ok: true,
      message: `Build ${definition.name.toLowerCase()} here.`,
      point: place,
      definition,
    };
  }
  buildProduction(kind: ProductionKind, point: Point) {
    const preview = this.productionPreview(kind, point);
    if (!preview.ok || !preview.definition) return preview;
    this.player.coins -= preview.definition.coins;
    this.spend(preview.definition.items);
    const structure: ProductionStructure = {
      id: `production:${++this.production.serial}`,
      kind,
      ...preview.point,
      createdAt: this.time,
      output: {},
      job: null,
    };
    this.production.structures.push(structure);
    grantPractice(this.progression, 'crafting', 12);
    this.effect('harvest', structure, '#d5dca4', 1);
    this.entry(
      'A working place',
      `${preview.definition.name} assembled at (${structure.x}, ${structure.y}). Each job must receive its physical inputs before work begins.`,
    );
    return {
      ok: true,
      message: `${preview.definition.name} is ready for inputs.`,
      structure: clone(structure),
    };
  }
  private productionReservations() {
    return new Set([
      ...this.production.structures.flatMap(
        (s) => s.job?.sources.slice(s.job.completed).map((p) => p.id) ?? [],
      ),
      ...this.orders
        .filter((o) => o.status === 'working')
        .flatMap((o) => o.allocations.map((a) => a.propId)),
    ]);
  }
  productionJobPreview(id: string, recipeId: string, batches = 1) {
    const s = this.production.structures.find((s) => s.id === id),
      recipe = PRODUCTION_RECIPES.find((r) => r.id === recipeId && r.kind === s?.kind),
      fail = (message: string) => ({
        ok: false,
        message,
        recipe: recipe ?? null,
        sources: [] as ReturnType<typeof productionSources>,
        inputs: {} as Partial<Record<ItemId, number>>,
        batches,
      });
    if (!s || !recipe || !Number.isInteger(batches) || batches < 1 || batches > 5)
      return fail('Choose one to five batches from this structure’s recipes.');
    if (this.phase !== 'playing' || distance(this.player, s) > 3)
      return fail('Load inputs beside the actual structure.');
    if (s.job) return fail('Finish or cancel the current job first.');
    if (this.production.jobSerial >= 1000000) return fail('The production ledger is full.');
    const inputs = Object.fromEntries(
      Object.entries(recipe.inputs).map(([item, n]) => [item, n! * batches]),
    ) as Partial<Record<ItemId, number>>;
    if (!this.has(inputs)) return fail(`The job needs ${this.costText(inputs)}.`);
    const stored = Object.values(s.output).reduce((a, b) => a + (b ?? 0), 0),
      yieldCount = Object.values(recipe.output).reduce((a, b) => a + (b ?? 0), 0) * batches;
    if (stored + yieldCount > 60)
      return fail('Retrieve the stored output before loading that many batches.');
    const sources = recipe.source
      ? productionSources(
          this.world.propsAround(s.x, s.y, 16),
          recipe.source,
          s,
          this.removed,
          this.productionReservations(),
          batches,
        )
      : [];
    if (recipe.source && sources.length !== batches)
      return fail(
        `This job needs ${batches} unreserved ${recipe.source === 'pine' ? 'timber trees' : 'ore outcrops'} within sixteen paces.`,
      );
    return {
      ok: true,
      message: `Load ${batches} batch${batches === 1 ? '' : 'es'} of ${recipe.name.toLowerCase()}.`,
      recipe,
      sources,
      inputs,
      batches,
    };
  }
  startProduction(id: string, recipeId: string, batches = 1) {
    const preview = this.productionJobPreview(id, recipeId, batches);
    if (!preview.ok) return preview;
    this.spend(preview.inputs);
    const s = this.production.structures.find((s) => s.id === id)!;
    s.job = {
      id: ++this.production.jobSerial,
      recipe: recipeId,
      batches,
      completed: 0,
      elapsed: 0,
      sources: preview.sources,
    };
    return { ok: true, message: 'Inputs loaded. Production advances while this life is active.' };
  }
  private finishProductionBatch(s: ProductionStructure, sharedClaim = false) {
    const job = s.job,
      recipe = PRODUCTION_RECIPES.find((r) => r.id === job?.recipe);
    if (!job || !recipe) return false;
    const source = job.sources[job.completed];
    if (source && !sharedClaim && this.removed.has(source.id)) {
      job.blocked =
        'The reserved resource was taken. Cancel this unfinished job to recover its unused inputs.';
      return false;
    }
    if (source) this.removed.add(source.id);
    for (const [id, n] of Object.entries(recipe.output))
      s.output[id as ItemId] = (s.output[id as ItemId] ?? 0) + n!;
    job.completed++;
    job.elapsed = 0;
    delete job.awaitingClaim;
    delete job.blocked;
    if (job.completed === job.batches) s.job = null;
    if (distance(s, this.player) < 22) this.effect('harvest', s, '#b8d6a1', 0.8);
    this.event('harvest', `${recipe.name}: one completed batch is stored at the platform.`);
    return true;
  }
  private updateProduction(dt: number) {
    for (const s of this.production.structures) {
      const job = s.job;
      if (!job || job.blocked || job.awaitingClaim) continue;
      const recipe = PRODUCTION_RECIPES.find((r) => r.id === job.recipe)!;
      job.elapsed = Math.min(recipe.seconds, job.elapsed + dt);
      if (job.elapsed >= recipe.seconds) {
        if (recipe.source && this.sharedWorld) job.awaitingClaim = true;
        else this.finishProductionBatch(s);
      }
    }
  }
  get pendingProductionClaims() {
    return this.production.structures.flatMap((s) => {
      const job = s.job,
        source = job?.sources[job.completed];
      return job?.awaitingClaim && source
        ? [
            {
              structureId: s.id,
              jobId: job.id,
              sourceId: source.id,
              x: source.x,
              y: source.y,
              kind: source.kind,
            },
          ]
        : [];
    });
  }
  commitProductionClaim(id: string, jobId: number, sourceId: string) {
    const s = this.production.structures.find((s) => s.id === id),
      job = s?.job;
    if (
      !this.sharedWorld ||
      !s ||
      !job?.awaitingClaim ||
      job.id !== jobId ||
      job.sources[job.completed]?.id !== sourceId
    )
      return { ok: false, message: 'That production completion is no longer pending.' };
    return {
      ok: this.finishProductionBatch(s, true),
      message: 'The room confirmed this finite production batch.',
    };
  }
  rejectProductionClaim(
    id: string,
    jobId: number,
    sourceId: string,
    reason = 'The room could not confirm this reserved resource.',
  ) {
    const s = this.production.structures.find((s) => s.id === id),
      job = s?.job;
    if (!job?.awaitingClaim || job.id !== jobId || job.sources[job.completed]?.id !== sourceId)
      return { ok: false, message: 'That production completion is no longer pending.' };
    job.blocked = reason.slice(0, 180);
    delete job.awaitingClaim;
    return { ok: true, message: job.blocked };
  }
  retryProduction(id: string) {
    const s = this.production.structures.find((s) => s.id === id),
      job = s?.job;
    if (!s || !job?.blocked || distance(s, this.player) > 3)
      return { ok: false, message: 'Inspect the blocked production platform nearby.' };
    if (job.sources[job.completed] && this.removed.has(job.sources[job.completed].id))
      return { ok: false, message: 'The source is gone. Cancel and load a new resource.' };
    delete job.blocked;
    return { ok: true, message: 'Production will retry its reserved source.' };
  }
  cancelProduction(id: string) {
    const s = this.production.structures.find((s) => s.id === id),
      job = s?.job,
      recipe = PRODUCTION_RECIPES.find((r) => r.id === job?.recipe);
    if (
      !s ||
      !job ||
      !recipe ||
      this.phase !== 'playing' ||
      distance(s, this.player) > 3 ||
      (job.awaitingClaim && this.sharedWorld)
    )
      return {
        ok: false,
        message: 'Inspect the active platform nearby; a pending room claim must settle first.',
      };
    const refund = Object.fromEntries(
      Object.entries(recipe.inputs).map(([item, n]) => [item, n! * (job.batches - job.completed)]),
    ) as Partial<Record<ItemId, number>>;
    if (!this.gain(refund))
      return { ok: false, message: 'Make room for the unused physical inputs.' };
    s.job = null;
    return { ok: true, message: 'Unfinished inputs returned; completed batches remain stored.' };
  }
  collectProduction(id: string) {
    const s = this.production.structures.find((s) => s.id === id);
    if (!s || this.phase !== 'playing' || distance(s, this.player) > 3)
      return { ok: false, message: 'Collect output beside the actual platform.' };
    if (!Object.values(s.output).some((n) => n && n > 0))
      return { ok: false, message: 'No completed output is waiting.' };
    if (!this.gain(s.output))
      return { ok: false, message: 'Make room for the complete stored output.' };
    const output = clone(s.output);
    s.output = {};
    grantPractice(this.progression, 'crafting', 2);
    return { ok: true, message: `Retrieved ${this.costText(output)}.`, output };
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
    return this.appearanceForBody(this.player.appearance, this.bodyId);
  }
  appearanceForBody(base: Appearance, bodyId: string): Appearance {
    const look = applyCosmetic(base, this.progression, bodyId, this.cosmeticEntitlements);
    const forged =
      base.weapon === 'none' ? undefined : this.forgedWeapons.get(bodyId)?.[base.weapon];
    const ordinary =
      base.weapon === 'none'
        ? undefined
        : this.ordinaryEquipment.get(bodyId)?.selected[base.weapon];
    if (ordinary !== undefined) look.weaponSeed = ordinary;
    else if (forged) look.weaponSeed = forged.seed;
    else if (
      base.weapon !== 'none' &&
      this.ordinaryEquipment.get(bodyId)?.inherited?.[base.weapon] !== undefined
    )
      look.weaponSeed = this.ordinaryEquipment.get(bodyId)!.inherited![base.weapon];
    // Ordinary inherited equipment already has its own seed; never erase it here.
    const artifact = this.artifactPacks.get(bodyId)?.equipped;
    if (artifact) {
      look.artifactDesign = artifact;
      const delivery = generateArtifact(artifact).delivery;
      look.weapon = delivery === 'projectile' ? 'bow' : delivery === 'pulse' ? 'staff' : 'sword';
    } else delete look.artifactDesign;
    return look;
  }
  private initializeEstate() {
    const owner = `body:theo-priest:${this.seed}`,
      seed = this.player.appearance.seed;
    this.toolPacks.set(owner, {
      tools: THEO_ESTATE.toolKinds.map((kind) => ({
        kind,
        seed,
        durability: seededTool(seed, kind).maxDurability,
      })),
      equipped: 'sickle',
    });
    const door = this.world
      .propsAround(THEO_ESTATE.x, THEO_ESTATE.y, 8)
      .find(
        (p) =>
          p.building === THEO_ESTATE.residenceId && p.kind === 'door' && p.id.endsWith(':door:1'),
      );
    if (door)
      this.progression.homes.push({
        id: THEO_ESTATE.residenceId,
        buildingId: THEO_ESTATE.residenceId,
        settlementId: 'origin',
        name: THEO_ESTATE.residenceName,
        x: door.x,
        y: door.y,
        purchasedAt: 0,
        furniture: {},
        plots: [null, null],
      });
  }
  get estate() {
    return {
      residence:
        this.progression.homes.find(
          (h) => h.id === (this.originCandidate?.home.id ?? THEO_ESTATE.residenceId),
        ) ?? null,
      staffIds: this.originCandidate ? [] : [...THEO_ESTATE.staffIds],
      description: this.originCandidate
        ? `${this.originCandidate.name}'s established home in ${this.originCandidate.settlement.name}. People may be hired through their own paid agreements.`
        : THEO_ESTATE.description,
    };
  }
  get tools() {
    const pack = this.toolPacks.get(this.bodyId);
    return (pack?.tools ?? []).map((tool) => ({
      ...tool,
      profile: seededTool(tool.seed, tool.kind),
      equipped: pack?.equipped === tool.kind,
    }));
  }
  get workProgress() {
    return this.currentWork && this.currentWork.bodyId === this.bodyId
      ? { ...this.currentWork }
      : null;
  }
  equipTool(kind: ToolKind) {
    const pack = this.toolPacks.get(this.bodyId);
    if (this.phase !== 'playing' || !pack?.tools.some((t) => t.kind === kind))
      return { ok: false, message: 'This body does not carry that tool.' };
    if (pack.equipped !== kind || this.activeArtifact) this.currentWork = null;
    pack.equipped = kind;
    this.clearArtifact();
    return { ok: true, message: `Equipped ${kind} for work.` };
  }
  buyTool(kind: ToolKind) {
    if (
      !THEO_ESTATE.toolKinds.includes(kind) ||
      this.phase !== 'playing' ||
      !this.progressionContext().nearWorkbench
    )
      return { ok: false, message: 'Choose a tool at a workbench.' };
    const pack = this.toolPacks.get(this.bodyId) ?? { tools: [], equipped: null };
    if (pack.tools.some((t) => t.kind === kind))
      return { ok: false, message: 'Repair the tool this body already carries.' };
    if (this.player.coins < 18 || !this.has({ wood: 2, ore: 2 }))
      return { ok: false, message: 'A tool costs 18 coins, two wood and two ore.' };
    this.player.coins -= 18;
    this.spend({ wood: 2, ore: 2 });
    const seed = this.player.appearance.seed;
    pack.tools.push({ kind, seed, durability: seededTool(seed, kind).maxDurability });
    pack.equipped = kind;
    this.toolPacks.set(this.bodyId, pack);
    return { ok: true, message: `Built a ${kind} for this body.` };
  }
  repairTool(kind: ToolKind) {
    const tool = this.toolPacks.get(this.bodyId)?.tools.find((t) => t.kind === kind);
    if (!tool || this.phase !== 'playing' || !this.progressionContext().nearWorkbench)
      return { ok: false, message: 'Bring the tool to a workbench.' };
    const profile = seededTool(tool.seed, kind);
    if (tool.durability === profile.maxDurability)
      return { ok: false, message: 'This tool needs no repair.' };
    if (!this.has({ wood: 1, ore: 1 }) || this.player.coins < 4)
      return { ok: false, message: 'Repair costs one wood, one ore and four coins.' };
    this.spend({ wood: 1, ore: 1 });
    this.player.coins -= 4;
    tool.durability = profile.maxDurability;
    return { ok: true, message: `Repaired ${profile.name}.` };
  }
  private workTool(prop: Prop): ToolState | null {
    const required = requiredToolFor(prop.kind),
      artifact = this.activeArtifact;
    if (artifact)
      return artifactToolKind(artifact) === required
        ? {
            kind: required!,
            seed: this.player.appearance.seed,
            durability:
              seededTool(this.player.appearance.seed, required!).maxDurability -
              (this.artifactPacks.get(this.bodyId)?.wear?.[artifact.design] ?? 0),
          }
        : null;
    const pack = this.toolPacks.get(this.bodyId);
    return pack?.equipped === required
      ? (pack.tools.find((t) => t.kind === required) ?? null)
      : null;
  }
  private workPreview(prop: Prop) {
    const tool = this.workTool(prop);
    if (!tool)
      return {
        ok: false as const,
        reason: `Equip a ${requiredToolFor(prop.kind)} suited to this resource.`,
      };
    return applyToolStroke({
      prop,
      tool,
      work: this.currentWork?.bodyId === this.bodyId ? this.currentWork : null,
      stamina: this.player.stamina,
      now: this.time,
    });
  }
  get staff() {
    return THEO_ESTATE.staffIds
      .map((id) => this.laborWorker(id))
      .filter((n): n is Npc => !!n)
      .map((npc) => ({
        ...workerProfile(npc, this.laborReputation(npc)),
        trusted: this.estateTrust[npc.id] !== false,
        x: npc.x,
        y: npc.y,
      }));
  }
  private laborWorker(id: string) {
    return (
      this.npcs.find((n) => n.id === id) ??
      this.npcMemory.get(id) ??
      this.world.npcsAround(0, 0, 24).find((n) => n.id === id)
    );
  }
  chooseEstateTrust(workerId: string, trusted: boolean) {
    if (
      this.phase !== 'playing' ||
      !THEO_ESTATE.staffIds.includes(workerId) ||
      typeof trusted !== 'boolean'
    )
      return { ok: false, message: 'Choose a named household relationship.' };
    this.estateTrust[workerId] = trusted;
    return {
      ok: true,
      message: trusted
        ? 'Retained this paid working relationship; their judgment remains their own.'
        : 'Released this person from future household assignments. Existing paid work retains its terms.',
    };
  }
  setSharedWorld(active: boolean) {
    this.sharedWorld = active;
  }
  get laborOrders() {
    return clone(this.orders);
  }
  laborPreview(workerId: string, kind: LaborKind) {
    const worker = this.laborWorker(workerId);
    if (
      this.orders.some(
        (o) =>
          o.workerId === workerId && o.status === 'cancelled' && o.journey?.phase === 'returning',
      )
    )
      return {
        ok: false as const,
        message: 'This worker is returning from a withdrawn assignment.',
        reason: 'Let the worker return before offering new work.',
      };
    if (this.sharedWorld)
      return {
        ok: false as const,
        message: 'This worker cannot accept that order.',
        reason: 'Collective resource orders require a solo world.',
      };
    if (
      this.phase !== 'playing' ||
      !worker ||
      !THEO_ESTATE.staffIds.includes(workerId) ||
      this.estateTrust[workerId] === false ||
      this.occupiedNpcId === workerId ||
      this.removed.has(workerId)
    )
      return {
        ok: false as const,
        message: 'This worker cannot accept that order.',
        reason: 'This trusted, living worker is not available.',
      };
    if (
      this.orders.filter((o) => o.status === 'working').length >= 64 ||
      this.laborSerial >= Number.MAX_SAFE_INTEGER
    )
      return {
        ok: false as const,
        message: 'This worker cannot accept that order.',
        reason: 'The labor ledger is full.',
      };
    const result = assignLabor({
      worker,
      reputation: this.laborReputation(worker),
      kind,
      props: this.world.propsAround(worker.x, worker.y, 24),
      removed: this.removed,
      orders: this.orders,
      now: this.time,
      serial: this.laborSerial + 1,
      coins: this.player.coins,
      yieldFor: (p) => this.baseLaborYield(p),
    });
    return {
      ...result,
      message: result.ok ? `Agree ${result.wages} coins for finite resource work.` : result.reason,
    };
  }
  private baseLaborYield(prop: Prop) {
    if (!['cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(prop.kind)) return 2;
    if (this.world.generation === 1 || prop.id.startsWith('origin:'))
      return prop.kind === 'cequin' ? 3 : 2;
    return plantProfile(prop.seed, prop.kind as PlantKind).yield;
  }
  hireLabor(workerId: string, kind: LaborKind) {
    const preview = this.laborPreview(workerId, kind);
    if (!preview.ok) return { ok: false, message: preview.reason };
    this.player.coins -= preview.wages;
    this.laborSerial++;
    this.orders = this.orders
      .filter((o) => o.status === 'working' || o.journey?.phase === 'returning')
      .slice(-63);
    this.orders.push(preview.order);
    const worker = this.laborWorker(workerId)!;
    this.beginLaborJourney(preview.order, worker);
    this.npcMemory.set(worker.id, clone(worker));
    return {
      ok: true,
      message: `${preview.order.workerName} accepted ${preview.wages} coins. Collect after ${Math.ceil(preview.order.endsAt - this.time)} seconds of lived time.`,
    };
  }
  collectLabor(orderId: string) {
    if (this.sharedWorld)
      return { ok: false, message: 'Collective resource orders require a solo world.' };
    const order = this.orders.find((o) => o.id === orderId),
      worker = order && this.laborWorker(order.workerId);
    if (
      this.phase !== 'playing' ||
      !order ||
      !worker ||
      this.occupiedNpcId === worker.id ||
      this.removed.has(worker.id)
    )
      return { ok: false, message: 'The worker is unavailable.' };
    if (
      distance(worker, this.player) > 4 &&
      !(this.estate.residence && distance(this.estate.residence, this.player) <= 10)
    )
      return { ok: false, message: 'Collect beside the worker or at the established residence.' };
    this.beginLaborJourney(order, worker);
    const result = finishLabor(order, {
      worker,
      props: order.allocations.flatMap((a) => this.world.propsAround(a.x, a.y, 1)),
      removed: this.removed,
      now: this.time,
    });
    if (!result.ok) return { ok: false, message: result.reason };
    if (
      this.carried + Object.values(result.output).reduce((sum, n) => sum + (n ?? 0), 0) >
      this.capacity
    )
      return { ok: false, message: 'Make room before collecting the complete order.' };
    for (const id of result.consumeIds) this.removed.add(id);
    this.gain(result.output);
    Object.assign(order, result.order);
    if (order.serial > this.winterLaborBaseline)
      this.recordWinterWork({
        id: `labor:${order.id}`,
        kind: 'labor',
        workerId: worker.id,
        orderId: order.id,
        paidCoins: order.wages,
        output: result.output,
      });
    return { ok: true, message: `${worker.name} delivered the agreed resources.` };
  }
  cancelLabor(orderId: string) {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order || order.status !== 'working')
      return { ok: false, message: 'This assignment has already ended.' };
    order.status = 'cancelled';
    if (order.journey) {
      order.journey.phase = 'returning';
      order.journey.allocation = order.allocations.length;
      order.journey.strokes = 0;
      delete order.journey.reason;
    }
    this.laborPaths.delete(order.id);
    return {
      ok: true,
      message: 'Assignment withdrawn. Agreed wages already paid are not refunded.',
    };
  }
  private beginLaborJourney(order: LaborOrder, worker: Npc) {
    if (order.journey || order.status !== 'working') return;
    const strokes = order.allocations.reduce((sum, a) => {
      const prop = this.world.propsAround(a.x, a.y, 1).find((p) => p.id === a.propId);
      return sum + (prop ? (resourceWork(prop)?.requiredStrokes ?? 1) : 1);
    }, 0);
    order.journey = {
      version: 1,
      phase: 'outbound',
      allocation: 0,
      strokes: 0,
      nextStrokeAt: this.time,
      strokeInterval: clamp(
        ((order.endsAt - order.startedAt) * 0.8) / Math.max(1, strokes),
        0.65,
        20,
      ),
      returnPoint: { x: worker.x, y: worker.y },
    };
  }
  private laborPassable(point: Point) {
    return [
      [-0.21, -0.21],
      [0.21, -0.21],
      [-0.21, 0.21],
      [0.21, 0.21],
    ].every(([dx, dy]) => !this.world.blocked(point.x + dx, point.y + dy, this.removed, true));
  }
  private routeLabor(from: Point, goals: Point[]): Point[] | null {
    const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
    const end = new Map(goals.filter((p) => this.laborPassable(p)).map((p) => [key(p), p]));
    if (!end.size) return null;
    const start = { x: Math.round(from.x), y: Math.round(from.y) },
      queue = [start],
      parents = new Map<string, Point | null>([[key(start), null]]);
    for (let i = 0; i < queue.length && i < 6500; i++) {
      const point = queue[i],
        target = end.get(key(point));
      if (target) {
        const route: Point[] = [];
        for (
          let at: Point | null = point;
          at && key(at) !== key(start);
          at = parents.get(key(at)) ?? null
        )
          route.push(at);
        route.reverse();
        if (route.length) route[route.length - 1] = { ...target };
        else if (distance(from, target) > 0.12) route.push({ ...target });
        return route;
      }
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const next = { x: point.x + dx, y: point.y + dy },
          id = key(next);
        if (
          parents.has(id) ||
          Math.abs(next.x - start.x) > 48 ||
          Math.abs(next.y - start.y) > 48 ||
          !this.laborPassable(next)
        )
          continue;
        parents.set(id, point);
        queue.push(next);
      }
    }
    return null;
  }
  private advanceLaborWalker(
    order: LaborOrder,
    worker: Npc,
    goals: Point[],
    target: string,
    dt: number,
  ): 'moving' | 'arrived' | 'blocked' {
    let route = this.laborPaths.get(order.id);
    if (!route || route.target !== target || route.removedSize !== this.removed.size) {
      const points = this.routeLabor(worker, goals);
      if (!points) return 'blocked';
      route = { target, points, removedSize: this.removed.size };
      this.laborPaths.set(order.id, route);
    }
    while (route.points.length && distance(worker, route.points[0]) < 0.08) route.points.shift();
    if (!route.points.length) return 'arrived';
    const next = route.points[0],
      before = { x: worker.x, y: worker.y };
    if (!this.clear(next)) {
      const door = this.world
        .propsAround(next.x, next.y, 0.75)
        .find((p) => p.kind === 'door' && distance(p, next) < 0.6 && !this.removed.has(p.id));
      if (door && distance(worker, door) <= 1.4) {
        this.removed.add(door.id);
        route.removedSize = this.removed.size;
      } else {
        this.laborPaths.delete(order.id);
        return 'blocked';
      }
    }
    const span = distance(worker, next),
      stride = Math.min(span, Math.min(2.4, worker.speed || 1.5) * dt);
    worker.heading = Math.atan2(next.y - worker.y, next.x - worker.x);
    this.move(worker, Math.cos(worker.heading) * stride, Math.sin(worker.heading) * stride);
    worker.phase += distance(before, worker) * 2.5;
    if (distance(before, worker) < stride * 0.1 && stride > 0.001) {
      this.laborPaths.delete(order.id);
      return 'blocked';
    }
    return 'moving';
  }
  private updateLabor(dt: number) {
    if (this.sharedWorld) return;
    for (const order of this.orders) {
      if (
        order.status !== 'working' &&
        !(order.status === 'cancelled' && order.journey?.phase === 'returning')
      )
        continue;
      const worker = this.laborWorker(order.workerId);
      if (!worker) continue;
      this.beginLaborJourney(order, worker);
      const j = order.journey!;
      if (j.phase === 'ready' || j.phase === 'blocked') continue;
      const block = (reason: string) => {
        j.phase = 'blocked';
        j.reason = reason;
        this.laborPaths.delete(order.id);
      };
      if (
        worker.hp <= 0 ||
        worker.hostile ||
        this.removed.has(worker.id) ||
        this.occupiedNpcId === worker.id
      ) {
        block('The assigned worker is no longer available.');
        continue;
      }
      if (j.phase === 'returning') {
        const result = this.advanceLaborWalker(order, worker, [j.returnPoint], 'return', dt);
        if (result === 'arrived') {
          j.phase = 'ready';
          this.laborPaths.delete(order.id);
          this.event(
            'quest',
            order.status === 'cancelled'
              ? `${worker.name} returned from the withdrawn assignment.`
              : `${worker.name} returned with the completed work. Collect the agreed resources.`,
          );
        } else if (result === 'blocked')
          block('The return route is obstructed. Clear it and retry the assignment.');
      } else {
        const allocation = order.allocations[j.allocation];
        const prop =
          allocation &&
          this.world
            .propsAround(allocation.x, allocation.y, 1)
            .find((p) => p.id === allocation.propId);
        if (!prop || this.removed.has(prop.id)) {
          block(
            'An allocated resource was taken. Withdraw this assignment or restore access before retrying.',
          );
          continue;
        }
        const kind = requiredToolFor(prop.kind)!,
          profile = seededTool(worker.appearance.seed, kind),
          effort = resourceWork(prop)!;
        if (j.phase === 'outbound') {
          const goals = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([dx, dy]) => ({ x: prop.x + dx, y: prop.y + dy }));
          const result = this.advanceLaborWalker(order, worker, goals, prop.id, dt);
          if (result === 'arrived') {
            j.phase = 'working';
            j.nextStrokeAt = this.time + Math.max(profile.cooldown, j.strokeInterval);
            this.laborPaths.delete(order.id);
          } else if (result === 'blocked')
            block('The resource has no clear working approach. Clear the route and retry.');
        } else if (j.phase === 'working') {
          if (distance(worker, prop) > 1.8) {
            j.phase = 'outbound';
            this.laborPaths.delete(order.id);
          } else if (this.time >= j.nextStrokeAt) {
            worker.heading = Math.atan2(prop.y - worker.y, prop.x - worker.x);
            j.strokes++;
            j.nextStrokeAt = this.time + Math.max(profile.cooldown, j.strokeInterval);
            if (distance(worker, this.player) < 22) {
              const effect = this.effect(
                'harvest',
                worker,
                profile.metalColor,
                0.65,
                worker.heading,
              );
              effect.actorId = worker.id;
              effect.tool = { kind, seed: worker.appearance.seed };
            }
            if (j.strokes >= effort.requiredStrokes) {
              j.allocation++;
              j.strokes = 0;
              j.phase = j.allocation >= order.allocations.length ? 'returning' : 'outbound';
              this.laborPaths.delete(order.id);
            }
          }
        }
      }
      this.npcMemory.set(worker.id, clone(worker));
    }
  }
  retryLabor(orderId: string) {
    const order = this.orders.find((o) => o.id === orderId),
      worker = order && this.laborWorker(order.workerId);
    if (
      this.sharedWorld ||
      this.phase !== 'playing' ||
      !order ||
      order.status !== 'working' ||
      order.journey?.phase !== 'blocked' ||
      !worker ||
      worker.hp <= 0 ||
      worker.hostile ||
      this.occupiedNpcId === worker.id
    )
      return { ok: false, message: 'This worker cannot resume that assignment.' };
    if (order.allocations.some((a) => this.removed.has(a.propId)))
      return {
        ok: false,
        message:
          'An allocated resource has been taken. Withdraw the order; it cannot duplicate that harvest.',
      };
    order.journey.phase =
      order.journey.allocation >= order.allocations.length ? 'returning' : 'outbound';
    delete order.journey.reason;
    this.laborPaths.delete(order.id);
    return { ok: true, message: 'The worker is trying the cleared route again.' };
  }
  get sharedCombatProgression(): SharedCombatProgression {
    const kind = this.player.appearance.weapon === 'none' ? 'staff' : this.player.appearance.weapon;
    return {
      level: this.player.level,
      combatXp: this.progression.xp.combat,
      upgrade: this.progression.upgrades[this.bodyId]?.[kind] ?? 0,
    };
  }
  setSharedCombat(active: boolean, roomIdentity?: string) {
    if (active === this.sharedCombat && (!roomIdentity || roomIdentity === this.sharedRoom)) return;
    if (roomIdentity && roomIdentity !== this.sharedRoom) {
      this.sharedRoom = roomIdentity;
      this.sharedSequence = -1;
      this.sharedReceipts.clear();
      this.sharedBenefitStrikes.clear();
      this.sharedReceiptFloor = 0;
      this.sharedAcknowledged = 0;
      this.sharedIneligible = new Set(this.removed);
      this.sharedEnemies.clear();
      this.sharedPeaceful.clear();
    }
    this.sharedCombat = active;
    this.sharedSnapshotLoaded = false;
    for (const { effect } of this.sharedProjectiles.values()) effect.age = effect.duration;
    this.sharedProjectiles.clear();
    for (const effect of this.sharedWarnings.values()) effect.age = effect.duration;
    this.sharedWarnings.clear();
    this.arrows = [];
    this.enemyIntents.clear();
    if (!active) this.sharedEnemies.clear();
    this.refreshNpcs();
  }
  sharedCombatPreview(kind: 'attack' | 'ward', target?: Point) {
    const p = this.player,
      bodyId = this.bodyId;
    const heading =
      target && finite(target.x) && finite(target.y) && distance(target, p) > 0.01
        ? Math.atan2(target.y - p.y, target.x - p.x)
        : p.heading;
    const result = (ok: boolean, message: string) => ({ ok, message, heading, bodyId });
    if (!this.sharedCombat || this.sharedSequence < 0)
      return result(false, 'Wait for the shared combat state.');
    if (!['attack', 'ward'].includes(kind) || this.phase !== 'playing' || this.dialogue)
      return result(false, 'This body cannot attack now.');
    if (
      (kind === 'attack' ? p.attackCooldown : p.wardCooldown) > 0 ||
      p.stamina < (kind === 'attack' ? 8 : 30)
    )
      return result(false, 'Recover enough energy and let the action settle first.');
    if (kind === 'attack' && p.appearance.weapon === 'none' && !this.activeArtifact)
      return result(false, 'Equip a weapon or an invented implement before attacking.');
    if (kind === 'attack') {
      const weapon = p.appearance.weapon === 'none' ? 'staff' : p.appearance.weapon;
      const range = this.activeArtifact?.properties.range ?? this.weaponProfile(weapon).range;
      const aimed = this.npcs
        .filter(
          (n) =>
            n.hp > 0 &&
            distance(n, p) <= range &&
            this.inCone(n, heading) &&
            this.lineOfSight(p, n),
        )
        .sort((a, b) => distance(a, p) - distance(b, p))[0];
      if (
        aimed &&
        (!aimed.hostile || aimed.role !== 'raider') &&
        (target ? distance(target, aimed) < 0.9 : true)
      )
        return result(
          false,
          'Residents are protected in a shared world. Choose a hostile creature.',
        );
    }
    return result(true, 'Ready for the room to confirm this action.');
  }
  commitSharedCombatAction(kind: 'attack' | 'ward', heading: number, bodyId: string) {
    if (bodyId !== this.bodyId || !finite(heading))
      return { ok: false, message: 'The attacking body has changed.' };
    if (
      !this.sharedCombat ||
      this.sharedSequence < 0 ||
      this.phase !== 'playing' ||
      this.dialogue ||
      !['attack', 'ward'].includes(kind) ||
      (kind === 'attack' ? this.player.attackCooldown : this.player.wardCooldown) > 0 ||
      this.player.stamina < (kind === 'attack' ? 8 : 30)
    )
      return { ok: false, message: 'This body cannot commit that action now.' };
    const p = this.player;
    p.heading = heading;
    if (kind === 'ward') {
      p.stamina -= 30;
      p.wardCooldown = 8;
      p.breath = clamp(p.breath + 5);
      const effect = this.effect('ward', p, '#9abde9', 0.75, heading);
      effect.actorId = this.bodyId;
      this.event('ward');
    } else {
      const artifact = this.activeArtifact,
        weapon = p.appearance.weapon === 'none' ? 'staff' : p.appearance.weapon,
        profile = this.weaponProfile(weapon);
      const delivery = artifact?.delivery ?? (weapon === 'bow' ? 'projectile' : 'contact');
      p.stamina -= 8;
      p.attackCooldown = artifact?.properties.cooldown ?? profile.cooldown;
      // The released projectile comes from the authoritative room snapshot.
      const effect = this.effect(
        delivery === 'pulse' ? 'ward' : 'slash',
        p,
        artifact?.color ?? profile.color,
        delivery === 'pulse' ? 0.6 : 0.22,
        heading,
      );
      effect.actorId = this.bodyId;
      this.event('attack');
    }
    return { ok: true, message: 'The room confirmed the action.' };
  }
  sharedParleyPreview() {
    const step = this.activeCampaignStep(),
      bodyId = this.bodyId;
    const fail = (message: string) => ({
      ok: false as const,
      message,
      bodyId,
      stepId: step?.id ?? '',
      guardIds: [] as string[],
    });
    if (
      !this.sharedCombat ||
      this.phase !== 'playing' ||
      !step ||
      step.kind !== 'encounter' ||
      !step.vault
    )
      return fail('This is not an active shared vault negotiation.');
    if (distance(this.player, step.target) > 1.8 || this.dialogue?.npcId !== step.target.id)
      return fail('Speak at the actual vault notice.');
    if (!this.has(step.cost!)) return fail('Bring the listed medicine and food for the agreement.');
    return {
      ok: true as const,
      message: 'Ask the room to confirm the truce.',
      bodyId,
      stepId: step.id,
      guardIds: [`${step.vault.id}:guard:0`, `${step.vault.id}:guard:1`],
    };
  }
  commitSharedParley(stepId: string, bodyId: string) {
    const preview = this.sharedParleyPreview();
    if (!preview.ok || preview.stepId !== stepId || preview.bodyId !== bodyId)
      return { ok: false, message: 'The negotiation changed before confirmation.' };
    if (!preview.guardIds.every((id) => this.sharedPeaceful.has(id) || this.removed.has(id)))
      return { ok: false, message: 'The room has not confirmed this truce.' };
    this.approvingSharedParley = true;
    try {
      this.choose('campaign:parley');
    } finally {
      this.approvingSharedParley = false;
    }
    return {
      ok: this.activeCampaignStep()?.id !== stepId,
      message: 'The guards accepted the physical supplies.',
    };
  }
  applySharedCombat(frame: SharedCombatFrame, localPeerId: string): { eventId: number } {
    if (
      !this.sharedCombat ||
      !validSharedCombatFrame(frame) ||
      typeof localPeerId !== 'string' ||
      !localPeerId
    )
      return { eventId: this.sharedAcknowledged };
    if (
      frame.snapshot.seq > this.sharedSequence ||
      (!this.sharedSnapshotLoaded && frame.snapshot.seq === this.sharedSequence)
    ) {
      this.sharedSnapshotLoaded = true;
      this.sharedSequence = frame.snapshot.seq;
      this.sharedEnemies = new Map(frame.snapshot.enemies.map((n) => [n.id, clone(n)]));
      this.sharedPeaceful = new Set(frame.snapshot.peaceful);
      for (const id of frame.snapshot.dead) {
        this.removed.add(id);
        const npc = this.npcMemory.get(id) ?? this.npcs.find((n) => n.id === id);
        if (npc) {
          npc.hp = 0;
          this.npcMemory.set(id, clone(npc));
        }
      }
      for (const npc of this.sharedEnemies.values())
        if (distance(npc, this.player) < 24 && (npc.hp < npc.maxHp || !npc.hostile)) {
          const { intent, ...body } = npc;
          this.npcMemory.set(npc.id, clone(body));
        }
      for (const id of frame.snapshot.peaceful) {
        const npc = this.npcMemory.get(id) ?? this.npcs.find((n) => n.id === id);
        if (npc) {
          npc.hostile = false;
          npc.cooldown = 0;
          this.npcMemory.set(id, clone(npc));
        }
      }
      const liveProjectiles = new Set(frame.snapshot.projectiles.map((p) => p.id));
      for (const [id, value] of this.sharedProjectiles)
        if (!liveProjectiles.has(id)) {
          value.effect.age = value.effect.duration;
          this.sharedProjectiles.delete(id);
        }
      for (const projectile of frame.snapshot.projectiles) {
        if (distance(projectile, this.player) > 24) continue;
        let value = this.sharedProjectiles.get(projectile.id);
        if (!value) {
          value = {
            effect: this.effect(
              'arrow',
              projectile,
              projectile.color,
              Math.max(0.1, projectile.remaining / projectile.speed),
              projectile.heading,
            ),
            vx: 0,
            vy: 0,
          };
          this.sharedProjectiles.set(projectile.id, value);
        }
        Object.assign(value.effect, {
          x: projectile.x,
          y: projectile.y,
          age: 0,
          duration: Math.max(0.1, projectile.remaining / projectile.speed),
          heading: projectile.heading,
        });
        value.vx = Math.cos(projectile.heading) * projectile.speed;
        value.vy = Math.sin(projectile.heading) * projectile.speed;
      }
      const warnings = new Set<string>();
      for (const npc of this.sharedEnemies.values())
        if (npc.intent && distance(npc, this.player) < 22) {
          warnings.add(npc.id);
          let e = this.sharedWarnings.get(npc.id);
          if (!e) {
            e = this.effect('speech', npc, '#edbd91', npc.intent.duration, npc.intent.heading);
            this.sharedWarnings.set(npc.id, e);
          }
          Object.assign(e, {
            x: npc.x,
            y: npc.y,
            age: npc.intent.duration - npc.intent.remaining,
            duration: npc.intent.duration,
            heading: npc.intent.heading,
            actorId: npc.id,
            text: npc.intent.kind === 'arrow' ? 'Drawing bow' : 'Striking',
          });
        }
      for (const [id, e] of this.sharedWarnings)
        if (!warnings.has(id)) {
          e.age = e.duration;
          this.sharedWarnings.delete(id);
        }
      this.refreshNpcs();
      this.checkCampaignEncounter();
    }
    const receipts = [
      ...frame.hits.map((hit) => ({ id: hit.id, hit })),
      ...frame.deaths.map((death) => ({ id: death.id, death })),
    ].sort((a, b) => a.id - b.id);
    for (const receipt of receipts) {
      const hit = 'hit' in receipt ? receipt.hit : null,
        death = 'death' in receipt ? receipt.death : null;
      const relevant = hit
        ? (hit.target === 'peer' && hit.targetId === localPeerId) ||
          (hit.target === 'npc' && hit.actorId === localPeerId)
        : !!death && (death.killerId === localPeerId || death.contributors.includes(localPeerId));
      if (!relevant) continue;
      this.sharedAcknowledged = Math.max(this.sharedAcknowledged, receipt.id);
      if (receipt.id <= this.sharedReceiptFloor || this.sharedReceipts.has(receipt.id)) continue;
      this.sharedReceipts.add(receipt.id);
      if (hit) {
        if (
          hit.target === 'peer' &&
          hit.targetId === localPeerId &&
          (!hit.targetBodyId || hit.targetBodyId === this.bodyId)
        )
          this.hurt(hit.damage);
        if (hit.target === 'npc' && hit.actorId === localPeerId) {
          grantPractice(this.progression, 'combat', 2);
          if (this.phase === 'playing' && (!hit.actorBodyId || hit.actorBodyId === this.bodyId)) {
            const strike = hit.strikeId ?? hit.id;
            if (hit.artifactDesign && !this.sharedBenefitStrikes.has(strike)) {
              this.sharedBenefitStrikes.add(strike);
              this.artifactBenefits(generateArtifact(hit.artifactDesign).properties);
            }
            if (hit.effect === 'breath') this.player.breath = clamp(this.player.breath + 2);
            if (hit.effect === 'warmth') this.player.warmth = clamp(this.player.warmth + 3);
          }
        }
        const target =
          hit.target === 'peer'
            ? !hit.targetBodyId || hit.targetBodyId === this.bodyId
              ? this.player
              : null
            : (this.sharedEnemies.get(hit.targetId) ??
              this.npcs.find((n) => n.id === hit.targetId));
        if (target) {
          const e = this.effect('hurt', target, hit.color, 0.4);
          e.actorId = hit.target === 'peer' ? this.bodyId : hit.targetId;
        }
      }
      if (
        death &&
        !this.sharedRewarded.has(death.npcId) &&
        !this.sharedIneligible.has(death.npcId)
      ) {
        this.sharedRewarded.add(death.npcId);
        this.removed.add(death.npcId);
        this.recordFreeLife('watch', death.npcId, 1);
        grantPractice(this.progression, 'combat', 6);
        this.awardXp(16);
        if (death.killerId === localPeerId) {
          const defeated = this.npcMemory.get(death.npcId);
          if (
            defeated &&
            defeated.hp <= 0 &&
            defeated.role === 'raider' &&
            defeated.appearance.weapon !== 'none'
          ) {
            const kind = defeated.appearance.weapon,
              seed = defeated.appearance.weaponSeed ?? defeated.appearance.seed;
            this.storeOrdinary(
              { version: 2, kind, seed, source: 'loot', sourceId: defeated.id },
              death.killerBodyId ?? this.bodyId,
            );
          }
          if (!death.killerBodyId || death.killerBodyId === this.bodyId) this.player.coins += 4;
          else {
            const body = this.bodyPossessions.get(death.killerBodyId);
            if (body) body.coins += 4;
          }
        }
      }
    }
    while (this.sharedBenefitStrikes.size > 4096)
      this.sharedBenefitStrikes.delete(Math.min(...this.sharedBenefitStrikes));
    while (this.sharedReceipts.size > 4096) {
      const first = Math.min(...this.sharedReceipts);
      this.sharedReceipts.delete(first);
      this.sharedReceiptFloor = Math.max(this.sharedReceiptFloor, first);
    }
    return { eventId: this.sharedAcknowledged };
  }
  private updateSharedProjectiles(dt: number) {
    for (const { effect, vx, vy } of this.sharedProjectiles.values()) {
      if (effect.age >= effect.duration) continue;
      const next = { x: effect.x + vx * dt, y: effect.y + vy * dt };
      if (this.world.blocked(next.x, next.y, this.removed)) effect.age = effect.duration;
      else {
        effect.x = next.x;
        effect.y = next.y;
      }
    }
  }
  get winterCompact() {
    this.winterPlan ??= buildCompact(this.world);
    return { state: clone(this.winterState), plan: clone(this.winterPlan) };
  }
  compactTarget(id: string) {
    this.winterPlan ??= buildCompact(this.world);
    const project = compactProject(this.winterState, this.winterPlan);
    if (!project) return null;
    if (project.board.id === id) return clone(project.board);
    const witness = project.witnesses.find((w) => w.id === id);
    if (!witness) return null;
    const actual = this.npcs.find((n) => n.id === id) ?? this.npcMemory.get(id);
    if (this.removed.has(id) || actual?.hp === 0 || actual?.hostile || this.occupiedNpcId === id)
      return { ...clone(project.board), name: `${witness.name}'s deposited account` };
    return { ...clone(witness), ...(actual ? { x: actual.x, y: actual.y } : {}) };
  }
  private compactContext(action: CompactAction): CompactContext {
    this.winterPlan ??= buildCompact(this.world);
    const project = compactProject(this.winterState, this.winterPlan);
    const unavailable: string[] = [];
    const witnesses =
      project?.witnesses.map((w) => {
        const actual =
          this.npcs.find((n) => n.id === w.id) ??
          this.npcMemory.get(w.id) ??
          this.world.npcsAround(w.x, w.y, 3).find((n) => n.id === w.id);
        if (
          !actual ||
          actual.hp <= 0 ||
          actual.hostile ||
          this.removed.has(w.id) ||
          this.occupiedNpcId === w.id
        )
          unavailable.push(w.id);
        return actual;
      }) ?? [];
    const requested =
      action.kind === 'survey' && !unavailable.includes(action.witnessId)
        ? witnesses.find((n) => n?.id === action.witnessId)
        : project?.board;
    return {
      plan: this.winterPlan,
      position: this.player,
      coins: this.player.coins,
      inventory: this.inventory,
      actor: this.phase === 'playing' ? requested : undefined,
      unavailableWitnesses: unavailable,
    };
  }
  compactPreview(action: CompactAction) {
    return previewCompact(this.winterState, action, this.compactContext(action));
  }
  actCompact(action: CompactAction) {
    const title = this.winterPlan
      ? compactProject(this.winterState, this.winterPlan)?.title
      : undefined;
    const result = applyCompact(this.winterState, action, this.compactContext(action));
    if (result.ok) {
      this.player.coins += result.reward.coins - result.cost.coins;
      this.spend(result.cost.items);
      this.winterState = result.state;
      if (action.kind === 'choose') this.winterLaborBaseline = this.laborSerial;
      for (const [clan, delta] of result.reputation) this.changeReputation(clan, delta);
      this.awardXp(result.reward.xp);
      this.entry(title ?? 'The Winter Compact', result.message);
      this.syncCompactQuest();
      this.event('quest', result.message);
    }
    return result;
  }
  private recordWinterWork(event: CompactEvent) {
    if (this.winterState.stage !== 'work' || !Object.keys(this.winterState.choices).length) return;
    this.winterPlan ??= buildCompact(this.world);
    const before = this.winterState.stage;
    this.winterState = recordCompactEvent(this.winterState, event, this.winterPlan);
    this.syncCompactQuest();
    if (before !== this.winterState.stage)
      this.event(
        'quest',
        'The agreed fresh work is complete. Bring the physical supplies to the district board.',
      );
  }
  private syncCompactQuest() {
    if (
      !this.winterPlan ||
      (!this.winterState.surveys.length &&
        !this.winterState.project &&
        !Object.keys(this.winterState.choices).length)
    )
      return;
    const p = compactProject(this.winterState, this.winterPlan);
    let q = this.quests.find((q) => q.id === 'winter-compact');
    if (!q) {
      q = {
        id: 'winter-compact',
        title: 'The Winter Compact',
        description: 'Six families must answer for the commitments they make.',
        objective: '',
        stage: 0,
        complete: false,
      };
      this.quests.push(q);
    }
    q.stage = this.winterState.project;
    q.complete = !p;
    if (!p) {
      q.title = 'The Winter Compact · resolved';
      q.objective = 'Twenty-four commitments have changed the six districts.';
      delete q.target;
      return;
    }
    const choice = p.choices.find((c) => c.id === this.winterState.choices[p.id]);
    const witness = p.witnesses.find((w) => !this.winterState.surveys.includes(w.id));
    q.title = `Winter Compact ${this.winterState.project + 1}/24 · ${p.title}`;
    q.objective =
      this.winterState.stage === 'survey'
        ? `Hear ${witness?.name ?? 'both witnesses'} in ${p.town.name}.`
        : !choice
          ? `Agree one funded policy at the ${p.town.name} board.`
          : this.winterState.stage === 'work'
            ? `${choice.work.kind === 'gather' ? 'Gather' : 'Prepare'} fresh ${choice.work.item}: ${this.winterState.work}/${choice.work.amount}. ${choice.work.acceptsLabor ? 'New paid resource work also counts.' : ''}`
            : `Deliver ${this.costText(choice.delivery)} to ${p.town.name}.`;
    q.target =
      this.compactTarget(
        this.winterState.stage === 'survey' && witness ? witness.id : p.board.id,
      ) ?? p.board;
  }
  private laborReputation(worker: Npc) {
    const learned = this.winterState.workerTrust[worker.id] ?? 0;
    return this.reputation.map(
      (value, clan) => value + (clan === worker.clan ? learned / 0.35 : 0),
    );
  }
  artifactDesign(index = 0) {
    const offset = Number.isSafeInteger(index) && index >= 0 ? index : 0;
    return `verso:${this.seed.toString(36)}:${(this.player.appearance.seed >>> 0).toString(36)}:${this.inventionSerial.toString(36)}:${offset.toString(36)}`;
  }
  get nextArtifactDesign() {
    return this.artifactDesign();
  }
  get artifacts() {
    const pack = this.artifactPacks.get(this.bodyId);
    return (pack?.designs ?? []).map((design) => ({
      design,
      genome: generateArtifact(design),
      equipped: pack?.equipped === design,
      toolKind: artifactToolKind(generateArtifact(design)),
      ...(artifactToolKind(generateArtifact(design))
        ? {
            durability:
              seededTool(this.player.appearance.seed, artifactToolKind(generateArtifact(design))!)
                .maxDurability - (pack?.wear?.[design] ?? 0),
            maxDurability: seededTool(
              this.player.appearance.seed,
              artifactToolKind(generateArtifact(design))!,
            ).maxDurability,
          }
        : {}),
    }));
  }
  get activeArtifact(): ArtifactGenome | null {
    const design = this.artifactPacks.get(this.bodyId)?.equipped;
    return design ? generateArtifact(design) : null;
  }
  artifactPreview(design: string): { ok: boolean; message: string; genome: ArtifactGenome | null } {
    let genome: ArtifactGenome;
    try {
      genome = generateArtifact(normalizeArtifactDesign(design));
    } catch {
      return {
        ok: false,
        message: 'Enter a design of one to 64 characters without control characters.',
        genome: null,
      };
    }
    const result = (ok: boolean, message: string) => ({ ok, message, genome });
    if (this.phase !== 'playing') return result(false, 'This body cannot work.');
    if (this.inventionSerial >= Number.MAX_SAFE_INTEGER)
      return result(false, 'This invention record is full.');
    if (this.artifactPacks.get(this.bodyId)?.designs.includes(genome.design))
      return result(false, 'This body already carries that exact design.');
    if (professionProfile(this.progression, 'crafting').level < 2)
      return result(false, 'Reach crafting level 2 through actual preparation and construction.');
    if (!this.progressionContext().nearWorkbench)
      return result(false, 'Work beside a field or home workbench.');
    if (this.player.coins < genome.cost.coins || !this.has(genome.cost.items))
      return result(false, 'This body needs the listed coins and raw materials.');
    const spent = Object.values(genome.cost.items).reduce((sum, n) => sum + (n ?? 0), 0);
    if (this.carried - spent + 1 > this.capacity)
      return result(false, 'There is no room for the completed artifact.');
    return result(true, `Create ${genome.name}. Its physical properties come from this design.`);
  }
  createArtifact(design: string) {
    const preview = this.artifactPreview(design);
    if (!preview.ok || !preview.genome) return preview;
    const genome = preview.genome;
    this.spend(genome.cost.items);
    this.player.coins -= genome.cost.coins;
    const pack = this.artifactPacks.get(this.bodyId) ?? { designs: [], equipped: null };
    pack.designs.push(genome.design);
    if (genome.category === 'implement') pack.equipped = genome.design;
    this.artifactPacks.set(this.bodyId, pack);
    this.inventionSerial++;
    grantPractice(this.progression, 'crafting', 8);
    this.syncFreeLife();
    this.effect('harvest', this.player, genome.color);
    const message = `Created ${genome.name}. It remains with this body.`;
    this.event('harvest', message);
    return { ok: true, message, genome };
  }
  equipArtifact(design: string) {
    let genome: ArtifactGenome;
    try {
      genome = generateArtifact(normalizeArtifactDesign(design));
    } catch {
      return { ok: false, message: 'That design is invalid.', genome: null };
    }
    const pack = this.artifactPacks.get(this.bodyId);
    if (
      this.phase !== 'playing' ||
      !pack?.designs.includes(genome.design) ||
      genome.category !== 'implement'
    )
      return {
        ok: false,
        message: 'This body must carry an implement before equipping it.',
        genome,
      };
    pack.equipped = genome.design;
    this.event('dialogue', `Equipped ${genome.name}.`);
    return { ok: true, message: `Equipped ${genome.name}.`, genome };
  }
  useArtifact(design: string) {
    let genome: ArtifactGenome;
    try {
      genome = generateArtifact(normalizeArtifactDesign(design));
    } catch {
      return { ok: false, message: 'That design is invalid.', genome: null };
    }
    const pack = this.artifactPacks.get(this.bodyId),
      p = this.player,
      benefits = genome.properties;
    if (
      this.phase !== 'playing' ||
      !pack?.designs.includes(genome.design) ||
      genome.delivery !== 'consume'
    )
      return {
        ok: false,
        message: 'This body must carry a consumable artifact before using it.',
        genome,
      };
    if (
      !(
        (benefits.healing > 0 && p.hp < p.maxHp) ||
        (benefits.breath > 0 && p.breath < 100) ||
        (benefits.warmth > 0 && p.warmth < 100)
      )
    )
      return { ok: false, message: 'This body does not need its restorative effects yet.', genome };
    this.artifactBenefits(benefits);
    pack.designs = pack.designs.filter((value) => value !== genome.design);
    if (!pack.designs.length) this.artifactPacks.delete(this.bodyId);
    this.effect('heal', p, genome.color);
    const message = `Used ${genome.name}; its vessel is spent.`;
    this.event('heal', message);
    return { ok: true, message, genome };
  }
  repairArtifact(design: string) {
    const item = this.artifacts.find((a) => a.design === design),
      pack = this.artifactPacks.get(this.bodyId);
    if (
      this.phase !== 'playing' ||
      !item?.toolKind ||
      !pack ||
      !this.progressionContext().nearWorkbench
    )
      return { ok: false, message: 'Bring this gathering implement to a workbench.' };
    if (!pack.wear?.[design]) return { ok: false, message: 'This implement needs no repair.' };
    if (this.player.coins < 4 || !this.has({ wood: 1, ore: 1 }))
      return { ok: false, message: 'Repair costs four coins, one wood and one ore.' };
    this.player.coins -= 4;
    this.spend({ wood: 1, ore: 1 });
    delete pack.wear[design];
    return { ok: true, message: `Repaired ${item.genome.name}.` };
  }
  salvageArtifact(design: string) {
    let genome: ArtifactGenome;
    try {
      genome = generateArtifact(normalizeArtifactDesign(design));
    } catch {
      return { ok: false, message: 'That design is invalid.', genome: null };
    }
    const pack = this.artifactPacks.get(this.bodyId);
    if (this.phase !== 'playing' || !pack?.designs.includes(genome.design))
      return { ok: false, message: 'This body must carry the artifact to salvage it.', genome };
    const item: ItemId = genome.cost.items.ore ? 'ore' : 'wood';
    pack.designs = pack.designs.filter((value) => value !== genome.design);
    if (pack.equipped === genome.design) pack.equipped = null;
    if (pack.wear) delete pack.wear[genome.design];
    if (!pack.designs.length) this.artifactPacks.delete(this.bodyId);
    this.inventory[item] = (this.inventory[item] ?? 0) + 1;
    const message = `Salvaged ${genome.name} into one ${item}.`;
    this.event('harvest', message);
    return { ok: true, message, genome };
  }
  private artifactBenefits(properties: ArtifactGenome['properties']) {
    this.player.hp = clamp(this.player.hp + properties.healing, 0, this.player.maxHp);
    this.player.breath = clamp(this.player.breath + properties.breath);
    this.player.warmth = clamp(this.player.warmth + properties.warmth);
  }
  private clearArtifact() {
    const pack = this.artifactPacks.get(this.bodyId);
    if (pack) pack.equipped = null;
    delete this.player.appearance.artifactDesign;
  }
  weaponSeed(kind: Weapon) {
    return (
      this.ordinaryEquipment.get(this.bodyId)?.selected[kind] ??
      this.forgedWeapons.get(this.bodyId)?.[kind]?.seed ??
      this.ordinaryEquipment.get(this.bodyId)?.inherited?.[kind] ??
      (this.player.appearance.weapon === kind ? this.player.appearance.weaponSeed : undefined) ??
      this.player.appearance.seed
    );
  }
  get weaponInventory() {
    const owned = this.ordinaryEquipment.get(this.bodyId)?.designs ?? [];
    const rows = [...this.weapons]
      .map((kind) => {
        const forged = this.forgedWeapons.get(this.bodyId)?.[kind],
          seed =
            forged?.seed ??
            this.ordinaryEquipment.get(this.bodyId)?.inherited?.[kind] ??
            (this.player.appearance.weapon === kind
              ? this.player.appearance.weaponSeed
              : undefined) ??
            this.player.appearance.seed;
        return {
          id: `base:${kind}`,
          kind,
          seed,
          source: forged ? 'forged' : 'inherited',
          profile: this.profileWithBonuses(
            generatedWeaponProfile(seed, kind, this.player.level),
            kind,
          ),
          equipped:
            !this.activeArtifact &&
            this.player.appearance.weapon === kind &&
            this.ordinaryEquipment.get(this.bodyId)?.selected[kind] === undefined,
        };
      })
      .filter(
        (row) =>
          !owned.length ||
          this.forgedWeapons.get(this.bodyId)?.[row.kind] ||
          this.ordinaryEquipment.get(this.bodyId)?.inherited?.[row.kind] !== undefined,
      );
    return [
      ...rows,
      ...owned.map((item) => ({
        ...item,
        id: `ordinary:${item.kind}:${item.seed}`,
        source: item.source as string,
        profile: this.profileWithBonuses(
          generatedWeaponProfile(item.seed, item.kind, this.player.level),
          item.kind,
        ),
        equipped:
          !this.activeArtifact &&
          this.player.appearance.weapon === item.kind &&
          this.weaponSeed(item.kind) === item.seed,
      })),
    ];
  }
  equipWeapon(id: string) {
    const item = this.weaponInventory.find((w) => w.id === id);
    if (!item || this.phase !== 'playing')
      return { ok: false, message: 'That construction is not carried by this body.' };
    const pack = this.ordinaryEquipment.get(this.bodyId);
    if (pack) {
      if (id.startsWith('ordinary:')) pack.selected[item.kind] = item.seed;
      else delete pack.selected[item.kind];
    }
    this.player.appearance.weapon = item.kind;
    this.player.appearance.weaponSeed = item.seed;
    this.clearArtifact();
    this.event('dialogue', `Equipped ${item.profile.name}.`);
    return { ok: true, message: `Equipped ${item.profile.name}.` };
  }
  private storeOrdinary(record: OrdinaryWeapon, bodyId = this.bodyId) {
    const belongings = bodyId === this.bodyId ? null : this.bodyPossessions.get(bodyId),
      owner =
        bodyId === this.bodyId ? this.player.appearance : this.npcMemory.get(bodyId)?.appearance;
    if (!owner || (bodyId !== this.bodyId && !belongings)) return false;
    const kinds = bodyId === this.bodyId ? [...this.weapons] : belongings!.weapons;
    const pack: OrdinaryPack = this.ordinaryEquipment.get(bodyId) ?? {
      designs: [],
      selected: {},
      inherited: Object.fromEntries(
        kinds.map((kind) => [
          kind,
          bodyId === this.bodyId
            ? this.weaponSeed(kind)
            : (this.forgedWeapons.get(bodyId)?.[kind]?.seed ??
              (owner.weapon === kind ? owner.weaponSeed : undefined) ??
              owner.seed),
        ]),
      ),
    };
    if (pack.designs.some((w) => w.kind === record.kind && w.seed === record.seed)) return false;
    if (pack.designs.length >= 64) return false;
    pack.designs.push(record);
    pack.selected[record.kind] = record.seed;
    this.ordinaryEquipment.set(bodyId, pack);
    if (bodyId === this.bodyId) this.weapons.add(record.kind);
    else if (!belongings!.weapons.includes(record.kind)) belongings!.weapons.push(record.kind);
    return true;
  }
  merchantWeaponStock(npcId: string) {
    const npc = this.npcs.find(
      (n) => n.id === npcId && n.role === 'merchant' && n.hp > 0 && !n.hostile,
    );
    if (!npc) return [];
    return (['staff', 'sword', 'bow'] as const).map((kind) => {
      const seed = ordinaryMarketSeed(this.seed, this.world.generation, npc.id, kind),
        profile = generatedWeaponProfile(seed, kind, this.player.level);
      return {
        version: 2 as const,
        kind,
        seed,
        source: 'merchant' as const,
        sourceId: npc.id,
        profile,
        price: kind === 'staff' ? 20 : kind === 'sword' ? 28 : 32,
        owned: (this.ordinaryEquipment.get(this.bodyId)?.designs ?? []).some(
          (w) => w.kind === kind && w.seed === seed,
        ),
      };
    });
  }
  get equipmentTechnology() {
    return this.world.generation >= 4
      ? civilizationTechnologyTier(civilizationFor(this.seed))
      : undefined;
  }
  forgePreview(recipe: ForgeRecipe): {
    ok: boolean;
    message: string;
    construction: ForgeResult | null;
  } {
    const contextual =
      this.equipmentTechnology === undefined
        ? recipe
        : { ...recipe, technology: this.equipmentTechnology };
    const raw = resolveForge(this.player.appearance.seed, contextual, this.player.level);
    let expectedLevel = this.player.level,
      expectedXp = this.player.xp;
    if (raw && this.campaignState.ending) {
      const future = clone(this.progression);
      grantPractice(future, 'crafting', 10);
      const current = this.freeLife;
      const possible = freeLifeMilestones(
        this.freeLifeState,
        future,
        this.quests.filter((q) => q.id.startsWith('supply:') && q.complete).length,
        this.quests.filter(
          (q) =>
            q.id.startsWith('correspondence:') &&
            q.complete &&
            !q.objective.startsWith('Dispatch withdrawn'),
        ).length,
      );
      expectedXp +=
        possible.filter(
          (m) => m.complete && !current.milestones.find((c) => c.id === m.id)?.rewarded,
        ).length * 50;
      while (expectedXp >= expectedLevel * 40 && expectedLevel < 50) {
        expectedXp -= expectedLevel * 40;
        expectedLevel++;
      }
    }
    const construction = raw
      ? {
          ...raw,
          profile: this.profileWithBonuses(
            generatedWeaponProfile(raw.seed, recipe.kind, expectedLevel),
            recipe.kind,
          ),
        }
      : null;
    const fail = (message: string) => ({ ok: false, message, construction });
    if (!construction) return fail('That combination could not be constructed.');
    if (this.phase !== 'playing') return fail('This body cannot work.');
    if (!this.progressionContext().nearWorkbench)
      return fail('Visit a workbench or furnish one at home.');
    if (professionProfile(this.progression, 'crafting').level < 2)
      return fail('Crafting level two is required to shape a new weapon.');
    if (this.forgedWeapons.get(this.bodyId)?.[recipe.kind]?.seed === construction.seed)
      return fail('This body already carries that exact construction.');
    if (this.player.coins < construction.cost.coins || !this.has(construction.cost.items))
      return fail(
        `Needs ${construction.cost.coins} coins and ${this.costText(construction.cost.items)}.`,
      );
    return {
      ok: true,
      message: `Forge ${construction.profile.name} for this body. The chosen material, living core and frame determine its appearance and handling.`,
      construction,
    };
  }
  forge(recipe: ForgeRecipe): { ok: boolean; message: string; construction: ForgeResult | null } {
    const preview = this.forgePreview(recipe);
    if (!preview.ok || !preview.construction) {
      this.event('dialogue', preview.message);
      return preview;
    }
    const made = preview.construction;
    if (!this.spend(made.cost.items))
      return { ...preview, ok: false, message: 'The materials are no longer available.' };
    this.player.coins -= made.cost.coins;
    const belongings = this.forgedWeapons.get(this.bodyId) ?? {};
    belongings[recipe.kind] = {
      seed: made.seed,
      ownerSeed: this.player.appearance.seed,
      recipe: clone(made.recipe),
    };
    this.forgedWeapons.set(this.bodyId, belongings);
    const ordinary = this.ordinaryEquipment.get(this.bodyId);
    if (ordinary) delete ordinary.selected[recipe.kind];
    delete this.player.appearance.weaponSeed;
    this.weapons.add(recipe.kind);
    this.player.appearance.weapon = recipe.kind;
    this.clearArtifact();
    grantPractice(this.progression, 'crafting', 10);
    this.syncFreeLife();
    this.effect('harvest', this.player, made.profile.color, 1);
    this.event(
      'quest',
      `Forged ${made.profile.name}. Its physical construction remains with this body.`,
    );
    return preview;
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
      capacity: this.capacity - (this.artifactPacks.get(this.bodyId)?.designs.length ?? 0),
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
    return (
      Object.values(this.inventory).reduce((sum, n) => sum + (n ?? 0), 0) +
      (this.artifactPacks.get(this.bodyId)?.designs.length ?? 0)
    );
  }

  weaponProfile(kind: Weapon): WeaponProfile {
    return this.profileWithBonuses(
      generatedWeaponProfile(this.weaponSeed(kind), kind, this.player.level),
      kind,
    );
  }
  private profileWithBonuses<T extends WeaponProfile>(profile: T, kind: Weapon): T {
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
    this.updateLabor(dt);
    this.updateProduction(dt);
    this.updateArrows(dt);
    this.updateSharedProjectiles(dt);
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
      if (this.sharedCombat && npc.role === 'raider') continue;
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
        !(this.sharedCombat && npc.role === 'raider') &&
        npc.id !== this.occupiedNpcId &&
        npc.hp > 0 &&
        !this.removed.has(npc.id) &&
        distance(npc, this.player) <= 17 &&
        !candidates.has(npc.id)
      )
        candidates.set(npc.id, clone(npc));
    if (this.sharedCombat)
      for (const npc of this.sharedEnemies.values())
        if (npc.hp > 0 && distance(npc, this.player) <= 18) candidates.set(npc.id, clone(npc));
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
      if (this.sharedCombat && npc.role === 'raider') continue;
      if (
        !npc.hostile &&
        !this.sharedWorld &&
        this.orders.some(
          (o) =>
            o.workerId === npc.id &&
            (o.status === 'working' ||
              (o.status === 'cancelled' && o.journey?.phase === 'returning')),
        )
      )
        continue;
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
        npc.hostile && range < 8
          ? generatedWeaponProfile(npc.appearance.weaponSeed ?? npc.appearance.seed, kind, 1)
          : null;
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
        range <=
          generatedWeaponProfile(npc.appearance.weaponSeed ?? npc.appearance.seed, 'bow', 1).range *
            0.78 &&
        this.lineOfSight(npc, this.player)
      );
    });
  }

  nearby(): Prop | Npc | null {
    const props = this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .filter((p) => !this.removed.has(p.id) || p.kind === 'door');
    const ongoing = this.workProgress;
    const worked =
      ongoing && props.find((p) => p.id === ongoing.propId && distance(p, this.player) <= 1.8);
    if (worked) return worked;
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
        (prop) => this.botanicalProfile(prop)?.yield ?? 1,
      );
      this.freeLifeState.commission = next;
      this.fieldCommissionSearch = null;
      this.addQuest({
        id: next.id,
        title: next.title,
        description: next.description,
        objective: `${next.description} Progress 0/${next.required}. Reward ${next.reward} coins.`,
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
      this.fieldCommissionSearch = null;
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
      this.fieldCommissionSearch = null;
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
    if (job?.status !== 'active') this.fieldCommissionSearch = null;
    if (job?.status === 'active') {
      if (job.kind === 'watch')
        job.progress = job.targets.filter((id) => this.removed.has(id)).length;
      let fieldUnavailable = false;
      if (job.progress >= job.required) {
        job.target = { ...job.board };
        this.fieldCommissionSearch = null;
      } else if (job.kind === 'field') {
        const cached =
          this.fieldCommissionSearch?.jobId === job.id ? this.fieldCommissionSearch : null;
        if (cached?.propId && !this.removed.has(cached.propId)) {
          // A living target remains valid across routine quest/save refreshes.
        } else if (cached?.failedAtRemovedSize === this.removed.size) {
          fieldUnavailable = true;
          job.target = { ...job.board };
        } else {
          let plot = this.world
            .propsAround(job.target.x, job.target.y, 0.25)
            .find(
              (p) =>
                p.kind === job.item && distance(p, job.target) < 0.1 && !this.removed.has(p.id),
            );
          if (!plot)
            for (const radius of [48, 80, 128]) {
              plot = this.world
                .propsAround(job.board.x, job.board.y, radius)
                .filter((p) => p.kind === job.item && !this.removed.has(p.id))
                .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
              if (plot) break;
            }
          if (plot) {
            job.target = { x: plot.x, y: plot.y };
            this.fieldCommissionSearch = { jobId: job.id, propId: plot.id };
          } else {
            fieldUnavailable = true;
            job.target = { ...job.board };
            this.fieldCommissionSearch = { jobId: job.id, failedAtRemovedSize: this.removed.size };
          }
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
          objective: fieldUnavailable
            ? `${job.progress}/${job.required} fresh ${job.item} gathered. No matching plots remain within 128 paces of this board. Return to withdraw without penalty, or gather matching plants farther away; the accepted terms and ${job.reward}-coin reward are unchanged.`
            : `${job.description} ${job.progress}/${job.required} completed. ${job.progress >= job.required ? 'Return to the issuing noticeboard with the requested supplies.' : ''}`,
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
  interactionAvailability(propId: string): {
    ok: boolean;
    reason?: string;
    completes?: boolean;
    toolKind?: ToolKind;
  } {
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
    const work = requiredToolFor(prop.kind) ? this.workPreview(prop) : null;
    if (work && !work.ok) return { ok: false, reason: work.reason };
    const amount = ['chest', 'crate'].includes(prop.kind)
      ? prop.id.startsWith('vault:')
        ? 6
        : 3
      : ['cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(prop.kind)
        ? this.botanicalProfile(prop)!.yield
        : ['pine', 'rock'].includes(prop.kind)
          ? 2 + (this.activeArtifact?.properties.harvest ?? 0)
          : 0;
    if (
      prop.kind === 'door' &&
      this.removed.has(prop.id) &&
      (distance(this.player, prop) < 0.85 ||
        this.npcs.some((n) => n.hp > 0 && distance(n, prop) < 0.7))
    )
      return { ok: false, reason: 'Step clear of the doorway before closing it.' };
    if (this.carried + amount > this.capacity) return { ok: false, reason: 'Your pack is full.' };
    return {
      ok: true,
      ...(work?.ok ? { completes: work.complete, toolKind: requiredToolFor(prop.kind)! } : {}),
    };
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
      if (id === 'parley' && this.sharedCombat && !this.approvingSharedParley) {
        this.event('dialogue', 'The room must confirm this truce before supplies are committed.');
        return;
      }
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
        yield:
          (prop.kind === 'cequin' ? 3 : 2) +
          skillBonuses(this.progression).harvestExtra +
          (this.activeArtifact?.properties.harvest ?? 0),
        description: `${profile.description} Cultivated harvest.`,
      };
    return {
      ...profile,
      yield:
        profile.yield +
        skillBonuses(this.progression).harvestExtra +
        (this.activeArtifact?.properties.harvest ?? 0),
    };
  }

  private harvest(prop: Prop) {
    const availability = this.interactionAvailability(prop.id);
    if (!availability.ok) {
      this.event('dialogue', availability.reason);
      return;
    }
    const stroke = this.workPreview(prop);
    if (!stroke.ok) {
      this.event('dialogue', stroke.reason);
      return;
    }
    const toolKind = requiredToolFor(prop.kind)!;
    this.currentWork = {
      ...stroke.work,
      requiredStrokes: resourceWork(prop)!.requiredStrokes,
      toolKind,
      bodyId: this.bodyId,
    };
    this.player.stamina -= stroke.staminaCost;
    if (this.activeArtifact) {
      const pack = this.artifactPacks.get(this.bodyId)!;
      pack.wear ??= {};
      pack.wear[this.activeArtifact.design] =
        seededTool(stroke.tool.seed, toolKind).maxDurability - stroke.tool.durability;
    } else {
      const pack = this.toolPacks.get(this.bodyId)!;
      pack.tools = pack.tools.map((t) => (t.kind === toolKind ? stroke.tool : t));
    }
    this.effect('harvest', prop, '#dfc69b', 0.65);
    const effect = this.effects.at(-1);
    if (effect) effect.tool = { kind: toolKind, seed: stroke.tool.seed };
    if (!stroke.complete) {
      this.event(
        'harvest',
        `${toolKind}: ${stroke.work.strokes}/${this.currentWork.requiredStrokes} strokes.`,
      );
      return;
    }
    this.currentWork = null;
    const item: ItemId =
      prop.kind === 'pine'
        ? 'wood'
        : prop.kind === 'rock'
          ? 'ore'
          : prop.kind === 'mushroom'
            ? 'rations'
            : (prop.kind as ItemId);
    const botanical = this.botanicalProfile(prop);
    const amount =
      botanical?.yield ??
      (item === 'cequin' ? 3 : 2) + (this.activeArtifact?.properties.harvest ?? 0);
    if (!this.gain({ [item]: amount })) return;
    this.removed.add(prop.id);
    if (botanical) grantPractice(this.progression, 'botany', 3);
    this.recordFreeLife('field', item, amount);
    this.recordWinterWork({
      id: `gather:${prop.id}`,
      kind: 'gather',
      propId: prop.id,
      item,
      amount,
    });
    this.effect('harvest', prop, '#d2efa8');
    this.event(
      'harvest',
      `Gathered ${amount} ${ITEMS[item].name.toLowerCase()}${botanical ? ` from ${botanical.name.toLowerCase()}` : ''}.`,
    );
  }

  private talk(npc: Npc) {
    const job = this.orders.find(
      (o) => o.workerId === npc.id && o.status === 'working' && o.journey?.phase !== 'ready',
    );
    if (job) {
      this.dialogue = {
        speaker: npc.name,
        role: npc.role,
        npcId: npc.id,
        text:
          job.journey?.reason ??
          `I am carrying out the ${job.kind} assignment. I will return to my post when the actual work is done; we can discuss other matters then.`,
        choices: [{ id: 'close', label: 'Let them continue working' }],
      };
      this.event('dialogue');
      return;
    }
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
        ...this.merchantWeaponStock(npc.id)
          .filter((w) => !w.owned)
          .map((w) => ({
            id: `weapon:${w.kind}`,
            label: `Buy ${w.profile.name} · ${w.price} coins`,
            detail: `${w.profile.damage} power · ${w.profile.range} reach · ${w.profile.cooldown}s · ${w.profile.construction}`,
            disabled:
              this.player.coins < w.price ||
              (this.ordinaryEquipment.get(this.bodyId)?.designs.length ?? 0) >= 64,
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
      const weapon = choiceId.slice(7) as Weapon,
        stock = this.merchantWeaponStock(npc.id).find((w) => w.kind === weapon);
      if (!stock || stock.owned || this.player.coins < stock.price) return;
      if (
        !this.storeOrdinary({
          version: 2,
          kind: stock.kind,
          seed: stock.seed,
          source: 'merchant',
          sourceId: npc.id,
        })
      )
        return;
      this.player.coins -= stock.price;
      this.event('trade', `Acquired ${stock.profile.name}.`);
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
      this.world.generation >= 3 ? 480 : 112,
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
    if (this.sharedCombat) {
      this.event('dialogue', 'Shared attacks require confirmation from the room.');
      return;
    }
    const p = this.player;
    if (this.phase !== 'playing' || this.dialogue || p.attackCooldown > 0 || p.stamina < 8) return;
    if (target && finite(target.x) && finite(target.y) && distance(target, p) > 0.01)
      p.heading = Math.atan2(target.y - p.y, target.x - p.x);
    const artifact = this.activeArtifact;
    if (artifact) {
      this.attackArtifact(artifact);
      return;
    }
    if (p.appearance.weapon === 'none') {
      this.event('dialogue', 'Equip a weapon or an invented implement before attacking.');
      return;
    }
    const weapon = p.appearance.weapon;
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
      (n) =>
        n.hp > 0 && distance(n, p) <= range && this.inCone(n, p.heading) && this.lineOfSight(p, n),
    );
    candidates.sort((a, b) => distance(a, p) - distance(b, p));
    if (candidates[0]) this.damageNpc(candidates[0], profile.damage, profile.effect);
  }

  private attackArtifact(genome: ArtifactGenome) {
    const p = this.player,
      properties = genome.properties;
    p.stamina -= 8;
    p.attackCooldown = properties.cooldown;
    this.event('attack');
    if (genome.delivery === 'projectile') {
      const effect = this.effect('arrow', p, genome.color, properties.range / 9, p.heading);
      this.arrows.push({
        owner: 'player',
        effect,
        vx: Math.cos(p.heading) * 9,
        vy: Math.sin(p.heading) * 9,
        damage: properties.damage,
        artifactBenefits: properties,
      });
      return;
    }
    const pulse = genome.delivery === 'pulse';
    this.effect(pulse ? 'ward' : 'slash', p, genome.color, pulse ? 0.6 : 0.22, p.heading);
    const candidates = this.npcs
      .filter(
        (n) =>
          n.hp > 0 &&
          distance(n, p) <= properties.range &&
          (pulse ? n.hostile : this.inCone(n, p.heading)) &&
          this.lineOfSight(p, n),
      )
      .sort((a, b) => distance(a, p) - distance(b, p));
    const targets = pulse ? candidates : candidates.slice(0, 1);
    for (const target of targets) this.damageNpc(target, properties.damage);
    if (targets.length) this.artifactBenefits(properties);
  }

  ward() {
    if (this.sharedCombat) {
      this.event('dialogue', 'Shared wards require confirmation from the room.');
      return;
    }
    const p = this.player;
    if (this.phase !== 'playing' || this.dialogue || p.wardCooldown > 0 || p.stamina < 30) return;
    p.stamina -= 30;
    p.wardCooldown = 8;
    this.effect('ward', p, '#9abde9', 0.75);
    this.event('ward', 'The ward steadies your breath and repels attackers.');
    p.breath = clamp(p.breath + 5);
    for (const npc of this.npcs.filter(
      (n) => n.hostile && n.hp > 0 && distance(n, p) < 2.7 && this.lineOfSight(p, n),
    )) {
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
          if (arrow.artifactBenefits) this.artifactBenefits(arrow.artifactBenefits);
          arrow.effect.age = arrow.effect.duration;
          break;
        }
      }
    }
    this.arrows = this.arrows.filter((a) => a.effect.age < a.effect.duration);
  }

  private damageNpc(npc: Npc, amount: number, enchantment?: WeaponProfile['effect']) {
    if (this.sharedCombat) return;
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
        if (npc.appearance.weapon !== 'none') {
          const kind = npc.appearance.weapon,
            seed = npc.appearance.weaponSeed ?? npc.appearance.seed;
          if (this.storeOrdinary({ version: 2, kind, seed, source: 'loot', sourceId: npc.id }))
            this.event('harvest', `Recovered ${generatedWeaponProfile(seed, kind, 1).name}.`);
        }
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
      this.currentWork = null;
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
    this.recordWinterWork({
      id: `craft:${this.winterState.observed + 1}`,
      kind: 'craft',
      recipeId: recipe.id,
      item: recipe.result,
      amount,
    });
    this.effect('harvest', this.player, '#d5dca4');
    this.event('harvest', `Prepared ${amount} ${recipe.name.toLowerCase()}.`);
  }

  equip(weapon: Weapon) {
    if (!this.weapons.has(weapon) || this.phase !== 'playing') {
      this.event('dialogue', 'Acquire that weapon from a merchant first.');
      return;
    }
    const seed = this.weaponSeed(weapon);
    this.player.appearance.weapon = weapon;
    if (
      this.ordinaryEquipment.get(this.bodyId)?.selected[weapon] !== undefined ||
      this.forgedWeapons.get(this.bodyId)?.[weapon] ||
      seed !== this.player.appearance.seed
    )
      this.player.appearance.weaponSeed = seed;
    else delete this.player.appearance.weaponSeed;
    this.clearArtifact();
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
    this.enterBody(target, lost);
  }
  private enterBody(target: Npc | undefined, lost: boolean) {
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
        appearance: {
          ...clone(this.player.appearance),
          ...(this.activeArtifact ? { artifactDesign: this.activeArtifact.design } : {}),
          ...(this.player.appearance.weapon !== 'none' &&
          (this.forgedWeapons.get(this.bodyId)?.[this.player.appearance.weapon] ||
            this.ordinaryEquipment.get(this.bodyId)?.selected[this.player.appearance.weapon] !==
              undefined)
            ? { weaponSeed: this.weaponSeed(this.player.appearance.weapon) }
            : {}),
        },
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
        equipped: this.player.appearance.weapon,
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
      delete this.player.appearance.artifactDesign;
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
    this.currentWork = null;
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
    const equipped = npc.appearance.weapon;
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
      weapons: equipped === 'none' ? [] : [equipped],
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
      this.player.hp = this.phase === 'lost' ? 0 : Math.min(this.player.maxHp, this.player.hp + 6);
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
      doorRevision: 1,
      worldGeneration: this.world.generation,
      seed: this.seed,
      player: this.player,
      lifeOrigin: this.originRecord ?? undefined,
      production: this.production.structures.length ? this.production : undefined,
      notebook: this.notebook,
      campaign: this.campaignState,
      winterCompact:
        this.winterState.project ||
        this.winterState.surveys.length ||
        Object.keys(this.winterState.choices).length
          ? { state: this.winterState, laborBaseline: this.winterLaborBaseline }
          : undefined,
      progression: this.progression,
      freeLife: this.freeLifeState,
      sharedCombatRewards: [...this.sharedRewarded],
      sharedCombatLedger: {
        room: this.sharedRoom,
        sequence: this.sharedSequence,
        receipts: [...this.sharedReceipts],
        strikes: [...this.sharedBenefitStrikes],
        floor: this.sharedReceiptFloor,
        acknowledged: this.sharedAcknowledged,
        ineligible: [...this.sharedIneligible],
      },
      labor: {
        serial: this.laborSerial,
        trust: this.estateTrust,
        orders: this.orders,
        tools: [...this.toolPacks].map(([bodyId, pack]) => ({ bodyId, ...pack })),
        work: this.currentWork,
      },
      inventionSerial: this.inventionSerial,
      artifactPacks: [...this.artifactPacks].map(([bodyId, pack]) => ({
        bodyId,
        designs: [...pack.designs],
        equipped: pack.equipped,
        wear: { ...pack.wear },
      })),
      ordinaryEquipment: this.ordinaryEquipment.size
        ? [...this.ordinaryEquipment].map(([bodyId, pack]) => ({ bodyId, ...pack }))
        : undefined,
      forgedWeapons: [...this.forgedWeapons].flatMap(([bodyId, weapons]) =>
        Object.entries(weapons).map(([kind, record]) => ({ bodyId, kind, ...record })),
      ),
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
    if (data.lifeOrigin) {
      game.originRecord = restoreLifeOrigin(data.lifeOrigin);
      game.originCandidate = generateLifeCandidate(
        data.seed,
        game.originRecord.index,
        game.originRecord.customization,
        data.worldGeneration ?? 1,
      );
    }
    game.production = restoreProduction(data.production, data.time);
    for (const structure of game.production.structures) {
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++) {
          const tile = game.world.tile(structure.x + x, structure.y + y);
          if (tile.building || tile.site || !['snow', 'grass'].includes(tile.terrain))
            throw new Error('A production platform overlaps protected terrain.');
        }
      for (const source of structure.job?.sources ?? []) {
        const actual = game.world
          .propsAround(source.x, source.y, 0.1)
          .find((p) => p.id === source.id);
        if (!actual || actual.kind !== source.kind)
          throw new Error('A production job names an absent resource.');
      }
    }
    game.player = clone(data.player);
    const priestBodyId = `body:theo-priest:${data.seed}`;
    game.notebook = data.notebook ?? (data.occupiedNpcId ?? priestBodyId) === priestBodyId;
    game.inventory = { ...data.inventory };
    game.sharedRewarded = new Set(data.sharedCombatRewards ?? []);
    if (data.sharedCombatLedger) {
      const ledger = data.sharedCombatLedger;
      game.sharedRoom = ledger.room;
      game.sharedSequence = ledger.sequence;
      game.sharedReceipts = new Set(ledger.receipts);
      game.sharedBenefitStrikes = new Set(ledger.strikes ?? []);
      game.sharedReceiptFloor = ledger.floor;
      game.sharedAcknowledged = ledger.acknowledged;
      game.sharedIneligible = new Set(ledger.ineligible ?? []);
    }

    const establishedResidence = game.estate.residence;
    game.progression = restoreProgression(data.progression, data.seed);
    // A legacy continuation gains the established address once, never money or
    // replacements for furnished homes; the existing three-home cap still applies.
    if (
      !data.labor &&
      establishedResidence &&
      game.progression.homes.length < 3 &&
      !game.progression.homes.some((home) => home.id === establishedResidence.id)
    )
      game.progression.homes.push(clone(establishedResidence));
    if (data.labor) {
      game.laborSerial = data.labor.serial;
      game.estateTrust = { ...data.labor.trust };
      game.orders = clone(data.labor.orders);
      game.toolPacks = new Map(
        data.labor.tools.map((pack) => [
          pack.bodyId,
          { tools: clone(pack.tools), equipped: pack.equipped },
        ]),
      );
      game.currentWork = data.labor.work ? clone(data.labor.work) : null;
    }
    game.inventionSerial = data.inventionSerial ?? 0;
    game.artifactPacks = new Map(
      (data.artifactPacks ?? []).map((pack) => [
        pack.bodyId,
        { designs: [...pack.designs], equipped: pack.equipped, wear: { ...pack.wear } },
      ]),
    );
    game.ordinaryEquipment = new Map(
      (data.ordinaryEquipment ?? []).map(({ bodyId, ...pack }) => [bodyId, clone(pack)]),
    );
    for (const record of data.forgedWeapons ?? []) {
      const owned = game.forgedWeapons.get(record.bodyId) ?? {};
      owned[record.kind as Weapon] = {
        seed: record.seed,
        ownerSeed: record.ownerSeed,
        recipe: clone(record.recipe),
      };
      game.forgedWeapons.set(record.bodyId, owned);
    }
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
    if (data.winterCompact !== undefined) {
      const ledger = data.winterCompact;
      if (
        !ledger ||
        typeof ledger !== 'object' ||
        Array.isArray(ledger) ||
        Object.keys(ledger).some((k) => !['state', 'laborBaseline'].includes(k)) ||
        !Number.isSafeInteger(ledger.laborBaseline) ||
        ledger.laborBaseline < 0 ||
        ledger.laborBaseline > (data.labor?.serial ?? 0)
      )
        throw new Error('Invalid winter labor evidence.');
      game.winterPlan = buildCompact(game.world);
      game.winterState = restoreCompact(ledger.state, game.winterPlan);
      game.winterLaborBaseline = ledger.laborBaseline;
    }
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
    if (game.originCandidate) {
      const known =
        game.npcMemory.get(game.originCandidate.id) ??
        (game.occupiedNpcId === game.originCandidate.id ? game.occupiedBody : null);
      if (known) {
        game.originCandidate.name = known.name;
        game.originCandidate.appearance = clone(known.appearance);
        game.originCandidate.start = { x: known.x, y: known.y };
      }
    }
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
    if (data.doorRevision === undefined) {
      // Earlier builds drew closed doors without collision. Preserve bodies and rest
      // anchors exactly by opening only doors that overlap their existing footprint.
      const keepFooting = (point: Point) => {
        for (const door of game.world.propsAround(point.x, point.y, 1)) {
          if (
            door.kind === 'door' &&
            Math.abs(point.x - door.x) < 0.72 &&
            Math.abs(point.y - door.y) < 0.72
          ) {
            game.removed.add(door.id);
            game.opened.add(door.id);
          }
        }
      };
      keepFooting(game.player);
      keepFooting(game.restAnchor);
      for (const npc of game.npcMemory.values()) {
        if (npc.hp > 0 && !game.removed.has(npc.id)) {
          keepFooting(npc);
          keepFooting(npc.home);
        }
      }
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
    for (const order of game.orders) {
      const worker = game.laborWorker(order.workerId);
      if (worker) game.beginLaborJourney(order, worker);
    }
    game.syncCampaign();
    game.syncFreeLife();
    game.syncCompactQuest();
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
  const validArtifactDesign = (v: unknown) => {
    try {
      return normalizeArtifactDesign(v) === v;
    } catch {
      return false;
    }
  };
  const look = (v: unknown) =>
    object(v) &&
    number(v.seed, -0xffffffff, 0xffffffff, true) &&
    ['skin', 'hair', 'coat', 'trim', 'trousers'].every(
      (k) => text(v[k], 40) && /^#[0-9a-f]{3,8}$/i.test(v[k] as string),
    ) &&
    ['height', 'build'].every((k) => number(v[k], 0.1, 10)) &&
    ['hairStyle', 'hat'].every((k) => number(v[k], 0, 100, true)) &&
    typeof v.cloak === 'boolean' &&
    (v.weaponSeed === undefined || number(v.weaponSeed, 0, MAX_WEAPON_SEED, true)) &&
    (v.artifactDesign === undefined || validArtifactDesign(v.artifactDesign)) &&
    ['staff', 'sword', 'bow', 'none'].includes(v.weapon as string);
  if (!object(value) || value.version !== 1 || !number(value.seed, 0, 0xffffffff, true))
    return fail();
  let generatedOriginId: string | null = null;
  if (value.lifeOrigin !== undefined) {
    try {
      const origin = restoreLifeOrigin(value.lifeOrigin);
      generatedOriginId = generateLifeCandidate(
        value.seed as number,
        origin.index,
        origin.customization,
        (value.worldGeneration ?? 1) as WorldGeneration,
      ).id;
    } catch {
      return fail();
    }
  }
  if (value.doorRevision !== undefined && value.doorRevision !== 1) fail();
  if (value.terrainRevision !== undefined && ![1, 2, 3].includes(value.terrainRevision as number))
    return fail();
  if (
    value.worldGeneration !== undefined &&
    ![1, 2, 3, 4].includes(value.worldGeneration as number)
  )
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
    !value.weapons.every((w) => ['staff', 'sword', 'bow'].includes(w)) ||
    ((p.appearance as Record<string, unknown>).weapon !== 'none' &&
      !value.weapons.includes((p.appearance as Record<string, unknown>).weapon))
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
      (generatedOriginId !== value.occupiedNpcId &&
        !(object(value.campaign) && value.campaign.step === CAMPAIGN_LENGTH) &&
        !['pilgrim', 'refugee', 'guard'].includes((value.occupiedBody as Npc).role)) ||
      (value.removed as string[]).includes(value.occupiedNpcId) ||
      (generatedOriginId !== value.occupiedNpcId && (value.storyStage as number) < 4)
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
          body.weapons.every((w) => ['staff', 'sword', 'bow'].includes(w)) &&
          new Set(body.weapons).size === body.weapons.length &&
          (body.equipped === 'none' || body.weapons.includes(body.equipped)),
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
  if (
    value.inventionSerial !== undefined &&
    !number(value.inventionSerial, 0, Number.MAX_SAFE_INTEGER, true)
  )
    return fail();
  if (value.artifactPacks !== undefined) {
    if (
      !Array.isArray(value.artifactPacks) ||
      value.artifactPacks.length > (value.npcs as Npc[]).length + 1
    )
      return fail();
    const owners = new Set<string>();
    for (const pack of value.artifactPacks) {
      if (
        !object(pack) ||
        Object.keys(pack).some((key) => !['bodyId', 'designs', 'equipped', 'wear'].includes(key)) ||
        !text(pack.bodyId, 160) ||
        owners.has(pack.bodyId as string) ||
        !Array.isArray(pack.designs) ||
        pack.designs.length < 1 ||
        pack.designs.length > CAPACITY ||
        new Set(pack.designs).size !== pack.designs.length
      )
        return fail();
      owners.add(pack.bodyId as string);
      const belongings =
        pack.bodyId === currentBodyId
          ? { inventory: value.inventory }
          : (value.bodyPossessions as BodyPossessions[] | undefined)?.find(
              (body) => body.npcId === pack.bodyId,
            );
      if (
        !belongings ||
        Object.values(belongings.inventory).reduce<number>((sum, n) => sum + (n as number), 0) +
          pack.designs.length >
          CAPACITY
      )
        return fail();
      for (const design of pack.designs) {
        if (typeof design !== 'string') return fail();
        try {
          if (normalizeArtifactDesign(design) !== design) return fail();
          generateArtifact(design);
        } catch {
          return fail();
        }
      }
      if (pack.wear !== undefined) {
        if (!object(pack.wear)) return fail();
        const ownerAppearance =
          pack.bodyId === currentBodyId
            ? (value.player as Player).appearance
            : (value.npcs as Npc[]).find((n) => n.id === pack.bodyId)?.appearance;
        if (!ownerAppearance) return fail();
        for (const [design, wear] of Object.entries(pack.wear)) {
          if (!pack.designs.includes(design)) return fail();
          const kind = artifactToolKind(generateArtifact(design));
          if (!kind || !number(wear, 0, seededTool(ownerAppearance.seed, kind).maxDurability, true))
            return fail();
        }
      }
      if (
        pack.equipped !== null &&
        (typeof pack.equipped !== 'string' ||
          !pack.designs.includes(pack.equipped) ||
          generateArtifact(pack.equipped).category !== 'implement')
      )
        return fail();
    }
  }
  if (
    value.sharedCombatRewards !== undefined &&
    (!strings(value.sharedCombatRewards) ||
      (value.sharedCombatRewards as string[]).some(
        (id) => !(value.removed as string[]).includes(id),
      ))
  )
    return fail();
  if (value.sharedCombatLedger !== undefined) {
    const ledger = value.sharedCombatLedger;
    if (
      !object(ledger) ||
      !text(ledger.room, 300) ||
      !number(ledger.sequence, -1, Number.MAX_SAFE_INTEGER, true) ||
      !number(ledger.floor, 0, Number.MAX_SAFE_INTEGER, true) ||
      !number(ledger.acknowledged, 0, Number.MAX_SAFE_INTEGER, true) ||
      (ledger.strikes !== undefined &&
        (!Array.isArray(ledger.strikes) ||
          ledger.strikes.length > 4096 ||
          new Set(ledger.strikes).size !== ledger.strikes.length ||
          !ledger.strikes.every((id) => number(id, 1, ledger.acknowledged as number, true)))) ||
      (ledger.ineligible !== undefined && !strings(ledger.ineligible)) ||
      !Array.isArray(ledger.receipts) ||
      ledger.receipts.length > 4096 ||
      new Set(ledger.receipts).size !== ledger.receipts.length ||
      !ledger.receipts.every((id) =>
        number(id, (ledger.floor as number) + 1, ledger.acknowledged as number, true),
      )
    )
      return fail();
  }
  if (value.labor !== undefined) {
    const labor = value.labor;
    if (
      !object(labor) ||
      !number(labor.serial, 0, Number.MAX_SAFE_INTEGER, true) ||
      !object(labor.trust) ||
      Object.keys(labor.trust).some(
        (id) =>
          !THEO_ESTATE.staffIds.includes(id) ||
          typeof (labor.trust as Record<string, unknown>)[id] !== 'boolean',
      ) ||
      !Array.isArray(labor.tools) ||
      labor.tools.length > (value.npcs as Npc[]).length + 2
    )
      return fail();
    const orders = validateLaborOrders(labor.orders);
    if (
      orders.some(
        (o) =>
          o.serial > (labor.serial as number) ||
          o.startedAt > (value.time as number) ||
          !THEO_ESTATE.staffIds.includes(o.workerId),
      )
    )
      return fail();
    const world = new InfiniteWorld(
      value.seed as number,
      (value.worldGeneration ?? 1) as WorldGeneration,
    );
    for (const order of orders) {
      const journey = order.journey;
      if (
        journey &&
        (journey.nextStrokeAt > (value.time as number) + 30 ||
          order.allocations.some((a) => distance(a, journey.returnPoint) > 24.001))
      )
        return fail();
    }
    for (const order of orders)
      for (const a of order.allocations) {
        if (!point(a)) return fail();
        const prop = world.propsAround(a.x, a.y, 1).find((p) => p.id === a.propId);
        if (!prop || prop.kind !== a.kind || prop.x !== a.x || prop.y !== a.y) return fail();
        const expected = ['pine', 'rock'].includes(prop.kind)
          ? 2
          : world.generation === 1 || prop.id.startsWith('origin:')
            ? prop.kind === 'cequin'
              ? 3
              : 2
            : plantProfile(prop.seed, prop.kind as PlantKind).yield;
        if (expected !== a.amount) return fail();
        if (
          order.journey &&
          order.allocations[order.journey.allocation] === a &&
          order.journey.strokes >= resourceWork(prop)!.requiredStrokes
        )
          return fail();
      }
    const owners = new Set<string>();
    for (const pack of labor.tools) {
      if (
        !object(pack) ||
        !text(pack.bodyId, 160) ||
        owners.has(pack.bodyId) ||
        (pack.bodyId !== priestBodyId &&
          pack.bodyId !== currentBodyId &&
          !(value.bodyPossessions as BodyPossessions[] | undefined)?.some(
            (b) => b.npcId === pack.bodyId,
          )) ||
        !Array.isArray(pack.tools) ||
        pack.tools.length > 3
      )
        return fail();
      owners.add(pack.bodyId);
      const kinds = new Set<string>();
      for (const tool of pack.tools) {
        if (
          !object(tool) ||
          !THEO_ESTATE.toolKinds.includes(tool.kind as ToolKind) ||
          kinds.has(tool.kind as string) ||
          !number(tool.seed, -0xffffffff, 0xffffffff, true)
        )
          return fail();
        kinds.add(tool.kind as string);
        if (
          !number(
            tool.durability,
            0,
            seededTool(tool.seed as number, tool.kind as ToolKind).maxDurability,
            true,
          )
        )
          return fail();
      }
      if (pack.equipped !== null && !kinds.has(pack.equipped as string)) return fail();
    }
    if (labor.work !== null) {
      const work = labor.work;
      if (
        !object(work) ||
        work.bodyId !== currentBodyId ||
        !text(work.propId, 160) ||
        !THEO_ESTATE.toolKinds.includes(work.toolKind as ToolKind) ||
        !number(work.requiredStrokes, 2, 9, true) ||
        !number(work.strokes, 1, (work.requiredStrokes as number) - 1, true) ||
        !number(work.lastStrokeAt, 0, value.time as number)
      )
        return fail();
    }
  }
  if (value.ordinaryEquipment !== undefined) {
    if (!Array.isArray(value.ordinaryEquipment) || value.ordinaryEquipment.length > 256)
      return fail();
    const bodies = new Set<string>();
    for (const pack of value.ordinaryEquipment) {
      if (
        !object(pack) ||
        Object.keys(pack).some(
          (k) => !['bodyId', 'designs', 'selected', 'inherited'].includes(k),
        ) ||
        !text(pack.bodyId, 160) ||
        bodies.has(pack.bodyId as string) ||
        !Array.isArray(pack.designs) ||
        pack.designs.length > 64 ||
        !object(pack.selected)
      )
        return fail();
      const owner =
        pack.bodyId === currentBodyId
          ? p.appearance
          : (value.npcs as Npc[]).find((n) => n.id === pack.bodyId)?.appearance;
      if (!owner) return fail();
      bodies.add(pack.bodyId as string);
      const keys = new Set<string>();
      for (const raw of pack.designs) {
        if (
          !object(raw) ||
          Object.keys(raw).some(
            (k) => !['version', 'kind', 'seed', 'source', 'sourceId'].includes(k),
          ) ||
          raw.version !== 2 ||
          !['staff', 'sword', 'bow'].includes(raw.kind as string) ||
          !number(raw.seed, 0, MAX_WEAPON_SEED, true) ||
          !['merchant', 'loot'].includes(raw.source as string) ||
          !text(raw.sourceId, 160)
        )
          return fail();
        const id = `${raw.kind}:${raw.seed}`;
        if (keys.has(id)) return fail();
        keys.add(id);
        const source = (value.npcs as Npc[]).find((n) => n.id === raw.sourceId);
        if (!source) return fail();
        if (
          raw.source === 'merchant' &&
          (source.role !== 'merchant' ||
            raw.seed !==
              ordinaryMarketSeed(
                value.seed as number,
                (value.worldGeneration ?? 1) as WorldGeneration,
                source.id,
                raw.kind as string,
              ))
        )
          return fail();
        if (
          raw.source === 'loot' &&
          (source.role !== 'raider' ||
            source.hp > 0 ||
            !(value.removed as string[]).includes(source.id) ||
            source.appearance.weapon !== raw.kind ||
            raw.seed !== (source.appearance.weaponSeed ?? source.appearance.seed))
        )
          return fail();
      }
      if (
        !Object.entries(pack.selected).every(
          ([kind, seed]) =>
            ['staff', 'sword', 'bow'].includes(kind) &&
            number(seed, 0, MAX_WEAPON_SEED, true) &&
            keys.has(`${kind}:${seed}`),
        )
      )
        return fail();
      if (
        pack.inherited !== undefined &&
        (!object(pack.inherited) ||
          !Object.entries(pack.inherited).every(
            ([kind, seed]) =>
              ['staff', 'sword', 'bow'].includes(kind) && number(seed, 0, MAX_WEAPON_SEED, true),
          ))
      )
        return fail();
      const weapons =
        pack.bodyId === currentBodyId
          ? value.weapons
          : (value.bodyPossessions as BodyPossessions[] | undefined)?.find(
              (b) => b.npcId === pack.bodyId,
            )?.weapons;
      if (
        !Array.isArray(weapons) ||
        !(pack.designs as OrdinaryWeapon[]).every((w) => weapons.includes(w.kind))
      )
        return fail();
    }
  }
  if (value.forgedWeapons !== undefined) {
    if (!Array.isArray(value.forgedWeapons) || value.forgedWeapons.length > 768) return fail();
    const ids = new Set<string>();
    for (const record of value.forgedWeapons) {
      if (
        !object(record) ||
        !text(record.bodyId, 160) ||
        !['staff', 'sword', 'bow'].includes(record.kind as string) ||
        !number(record.seed, 0, MAX_WEAPON_SEED, true) ||
        !number(record.ownerSeed, -0xffffffff, 0xffffffff, true) ||
        !object(record.recipe) ||
        record.recipe.kind !== record.kind
      )
        return fail();
      const key = `${record.bodyId}:${record.kind}`;
      if (ids.has(key)) return fail();
      ids.add(key);
      const owner =
        record.bodyId === currentBodyId
          ? p.appearance
          : (value.npcs as Npc[]).find((n) => n.id === record.bodyId)?.appearance;
      if (!owner || !object(owner) || owner.seed !== record.ownerSeed) return fail();
      const construction = resolveForge(
        record.ownerSeed as number,
        record.recipe as unknown as ForgeRecipe,
        1,
      );
      if (!construction || construction.seed !== record.seed) return fail();
    }
  }
  return value as unknown as SaveData;
}
