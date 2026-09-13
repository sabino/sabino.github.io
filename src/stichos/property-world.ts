import { deriveSeed } from '../procedural/random.ts';
import { worldTimeAt } from './world-time.ts';
import type { ActorAddress } from './actor-ledger.ts';
import {
  FIELD_ITEMS,
  type FieldBundle,
  type FieldItem,
  type FieldOutcome,
  type FieldStacks,
} from './field-loot.ts';

export type EstateKind = 'home' | 'plot';
export type StationKind = 'sawmill' | 'carpentry' | 'garden' | 'apothecary' | 'store';
export type WorkerPhase = 'idle' | 'collecting' | 'carrying-input' | 'working' | 'carrying-output';
/** Every offer must be resolved from the authority's actual generated building/parcel, never client data. */
export interface PropertyOffer extends ActorAddress {
  id: string;
  name: string;
  kind: EstateKind;
  settlementId: string;
  seed: number;
  bounds: { x: number; y: number; width: number; height: number };
  entrance: ActorAddress;
  vacant: boolean;
  rentable: boolean;
}
export interface PropertyCell {
  solid: boolean;
  road: boolean;
  terrain: string;
  buildingId?: string;
  parcelId?: string;
}
export interface PropertyPerson extends ActorAddress {
  id: string;
  name: string;
  seed: number;
  role: string;
  alive: boolean;
  home: ActorAddress;
  /** Generated role/traits or real rescue consequences decide eligibility. */
  employable: boolean;
}
export interface PropertyAdapters {
  offer(id: string): PropertyOffer | undefined;
  person(id: string): PropertyPerson | undefined;
  peer(id: string): ActorAddress | undefined;
  cell(address: ActorAddress): PropertyCell;
  /** Actual navigation sets a persistent actor destination; it does not alter position here. */
  travel(actorId: string, destination: ActorAddress): 'traveling' | 'arrived' | 'unreachable';
  /** Server-derived origin candidate only; never accept a submitted legacy save as proof. */
  legacyHome(peerId: string): string | undefined;
  permission(
    peerId: string,
    action: 'acquire' | 'build' | 'hire',
    target: string,
  ): { ok: boolean; reason?: string };
  /** Awake local customers who can reach the shop; zero means no trade. */
  customers(propertyId: string, now: number): number;
  transact(peerId: string, cost: FieldBundle, reward: FieldBundle, eventId: string): FieldOutcome;
}
export interface EstateRecipe {
  id: string;
  station: StationKind;
  name: string;
  description: string;
  seconds: number;
  inputs: FieldStacks;
  output: FieldBundle;
  wage: number;
}
export const ESTATE_RECIPES: readonly EstateRecipe[] = [
  {
    id: 'saw-boards',
    station: 'sawmill',
    name: 'Plane timber',
    description:
      'Haul harvested timber to the saw and carry finished boards into the estate store.',
    seconds: 24,
    inputs: { wood: 3 },
    output: { coins: 0, items: { planks: 2 } },
    wage: 1,
  },
  {
    id: 'carve-spear',
    station: 'carpentry',
    name: 'Bind a hunting spear',
    description:
      'A joiner binds two planed boards to a harvested bone head with resin. The spear equips a hunter or supplies a finite local shop order.',
    seconds: 38,
    inputs: { planks: 2, bone: 2, resin: 1 },
    output: { coins: 0, items: { spear: 1 } },
    wage: 4,
  },
  {
    id: 'grow-fiber',
    station: 'garden',
    name: 'Tend fiber beds',
    description:
      'A living cutting and timber mulch produce three usable fiber bundles. The gardener must tend the bed.',
    seconds: 90,
    inputs: { fiber: 1, wood: 1 },
    output: { coins: 0, items: { fiber: 3 } },
    wage: 1,
  },
  {
    id: 'dressings',
    station: 'apothecary',
    name: 'Prepare field dressings',
    description: 'Wash and bind plant fiber with resin for wounds and expeditions.',
    seconds: 32,
    inputs: { fiber: 3, resin: 1 },
    output: { coins: 0, items: { bandage: 2 } },
    wage: 1,
  },
  {
    id: 'sell-spears',
    station: 'store',
    name: 'Sell a hunting spear',
    description:
      'A named shopkeeper carries a spear to the counter and serves local customers during their shift.',
    seconds: 28,
    inputs: { spear: 1 },
    output: { coins: 28, items: {} },
    wage: 1,
  },
  {
    id: 'sell-dressings',
    station: 'store',
    name: 'Supply the local clinic',
    description: 'The shopkeeper distributes two dressings; wages and real stock are required.',
    seconds: 25,
    inputs: { bandage: 2 },
    output: { coins: 18, items: {} },
    wage: 1,
  },
];
export const ESTATE_STATIONS: Readonly<
  Record<
    StationKind,
    { name: string; glyph: string; cost: FieldBundle; width: number; height: number }
  >
> = {
  sawmill: {
    name: 'Timber saw',
    glyph: 'saw',
    cost: { coins: 8, items: { wood: 5, stone: 2 } },
    width: 2,
    height: 1,
  },
  carpentry: {
    name: 'Joiner’s bench',
    glyph: 'joinery',
    cost: { coins: 8, items: { planks: 2, wood: 2 } },
    width: 2,
    height: 1,
  },
  garden: {
    name: 'Fiber nursery',
    glyph: 'sprout',
    cost: { coins: 5, items: { wood: 3, fiber: 1 } },
    width: 2,
    height: 2,
  },
  apothecary: {
    name: 'Dressing table',
    glyph: 'leaf-cross',
    cost: { coins: 8, items: { planks: 2, stone: 2 } },
    width: 2,
    height: 1,
  },
  store: {
    name: 'Neighbourhood counter',
    glyph: 'scales',
    cost: { coins: 10, items: { planks: 3, fiber: 2 } },
    width: 2,
    height: 1,
  },
};
export const PROPERTY_RULES = Object.freeze({
  maxEstates: 64,
  maxOwned: 4,
  maxWorkers: 96,
  maxStations: 8,
  maxGuests: 12,
  maxReceipts: 16384,
  maxBufferUnits: 4096,
  maxBatches: 20,
  maxWorkerSteps: 8,
  maxCatchupSeconds: 2,
  interactionDistance: 4,
  leaseSeconds: 7200,
  maxCoordinate: 10000000,
  routeMargin: 2,
  maxRouteCells: 1936,
  routeProbesPerTick: 2048,
  routeCacheSeconds: 2,
});
export interface EstateJob {
  id: number;
  recipe: string;
  remaining: number;
  completed: number;
  elapsed: number;
  reserved: FieldStacks;
  wageFunded: boolean;
}
export interface EstateStation extends ActorAddress {
  id: string;
  kind: StationKind;
  workerId?: string;
  job?: EstateJob;
  /** Useful even after the job completes; never a fabricated theoretical throughput. */
  produced: number;
  workingSeconds: number;
  status: string;
}
export interface Estate {
  id: string;
  ownerId: string;
  offer: PropertyOffer;
  tenure: 'owned' | 'rented';
  leaseUntil?: number;
  acquiredAt: number;
  locked: boolean;
  guests: string[];
  storage: FieldBundle;
  stations: EstateStation[];
  furnishings: number;
  lastRestAt: number;
  revision: number;
  salesDay: number;
  dailySales: number;
}
export interface StationObstacle {
  estateId: string;
  stationId: string;
  kind: StationKind;
}
interface EstateRoutes {
  checkedAt: number;
  approaches: Map<string, ActorAddress>;
}
type StationShape = Pick<EstateStation, 'id' | 'spaceId' | 'x' | 'y' | 'kind'>;
export interface EstateWorker {
  id: string;
  ownerId: string;
  estateId: string;
  name: string;
  home: ActorAddress;
  specialty: StationKind;
  competence: number;
  loyalty: number;
  nightShift: boolean;
  hiredAt: number;
  lastStepAt: number;
  stationId?: string;
  phase: WorkerPhase;
  cargo: FieldBundle;
  status: string;
  unpaidSince?: number;
}
export interface PropertySave {
  version: 1;
  seed: number;
  serial: number;
  estates: Estate[];
  workers: EstateWorker[];
  receipts: string[];
}
export interface PropertyResult {
  ok: boolean;
  message: string;
  estateId?: string;
  stationId?: string;
  rest?: { hpFraction: number; staminaFraction: number };
}
export interface PropertyEvent extends ActorAddress {
  id: string;
  kind:
    | 'construction-complete'
    | 'machine-cycle'
    | 'worker-hired'
    | 'production-delivered'
    | 'home-rest'
    | 'store-sale';
  ownerId: string;
  actorId?: string;
  estateId: string;
  recipe?: string;
}
export type PropertyCommand =
  | { kind: 'acquire'; propertyId: string; mode: 'buy' | 'rent' | 'legacy-home' }
  | { kind: 'renew'; propertyId: string }
  | { kind: 'build'; propertyId: string; station: StationKind; at: ActorAddress }
  | { kind: 'hire'; propertyId: string; npcId: string }
  | { kind: 'assign'; propertyId: string; npcId: string; stationId: string }
  | { kind: 'unassign'; propertyId: string; npcId: string }
  | { kind: 'queue'; propertyId: string; stationId: string; recipe: string; batches: number }
  | { kind: 'cancel-job'; propertyId: string; stationId: string }
  | { kind: 'deposit' | 'withdraw'; propertyId: string; bundle: FieldBundle }
  | { kind: 'guest'; propertyId: string; guestId: string; allow: boolean }
  | { kind: 'lock'; propertyId: string; locked: boolean }
  | { kind: 'furnish' | 'rest'; propertyId: string }
  | { kind: 'demolish'; propertyId: string; stationId: string; confirmRevision: number };
const empty = (): FieldBundle => ({ coins: 0, items: {} });
const clone = <T>(v: T): T => structuredClone(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (n: unknown, lo = 0, hi = 1e12): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const integer = (n: unknown, lo = 0, hi = 1e9): n is number =>
  finite(n, lo, hi) && Number.isSafeInteger(n);
const identity = (s: unknown): s is string =>
  typeof s === 'string' && s.length > 0 && s.length <= 200 && !/[\u0000-\u001f]/.test(s);
const text = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 160;
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const address = (v: unknown): v is ActorAddress =>
  isObject(v) &&
  identity(v.spaceId) &&
  /^[a-zA-Z0-9:_.,-]+$/.test(v.spaceId) &&
  finite(v.x, -PROPERTY_RULES.maxCoordinate, PROPERTY_RULES.maxCoordinate) &&
  finite(v.y, -PROPERTY_RULES.maxCoordinate, PROPERTY_RULES.maxCoordinate);
const plainAddress = (v: unknown): v is ActorAddress =>
  address(v) && keys(v as unknown as Record<string, unknown>, ['spaceId', 'x', 'y']);
const stacks = (v: unknown): v is FieldStacks =>
  isObject(v) &&
  Object.entries(v).every(
    ([k, n]) => Object.hasOwn(FIELD_ITEMS, k) && integer(n, 1, PROPERTY_RULES.maxBufferUnits),
  );
const bundle = (v: unknown): v is FieldBundle =>
  isObject(v) && keys(v, ['coins', 'items']) && integer(v.coins, 0, 100000000) && stacks(v.items);
const units = (v: FieldStacks) => Object.values(v).reduce((a, b) => a + (b ?? 0), 0);
const tileKey = (p: ActorAddress) => `${p.spaceId}|${Math.round(p.x)},${Math.round(p.y)}`;
const stationCovers = (s: StationShape, p: ActorAddress) =>
  s.spaceId === p.spaceId &&
  p.x >= s.x &&
  p.y >= s.y &&
  p.x < s.x + ESTATE_STATIONS[s.kind].width &&
  p.y < s.y + ESTATE_STATIONS[s.kind].height;
const distance = (a: ActorAddress, b: ActorAddress) =>
  a.spaceId === b.spaceId ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
const enough = (stock: FieldStacks, cost: FieldStacks) =>
  Object.entries(cost).every(([k, n]) => (stock[k as FieldItem] ?? 0) >= n!);
function change(stock: FieldStacks, delta: FieldStacks, sign = 1) {
  for (const [k, n] of Object.entries(delta)) {
    const key = k as FieldItem;
    const next = (stock[key] ?? 0) + n! * sign;
    if (next) stock[key] = next;
    else delete stock[key];
  }
}
function multiplied(items: FieldStacks, count: number): FieldStacks {
  return count > 0
    ? Object.fromEntries(Object.entries(items).map(([key, n]) => [key, n! * count]))
    : {};
}
const result = (ok: boolean, message: string): PropertyResult => ({ ok, message });
const inBounds = (p: ActorAddress, offer: PropertyOffer, width = 1, height = 1) =>
  p.spaceId === offer.spaceId &&
  p.x >= offer.bounds.x &&
  p.y >= offer.bounds.y &&
  p.x + width <= offer.bounds.x + offer.bounds.width &&
  p.y + height <= offer.bounds.y + offer.bounds.height;
const validOffer = (v: unknown): v is PropertyOffer =>
  isObject(v) &&
  keys(v, [
    'id',
    'name',
    'kind',
    'settlementId',
    'seed',
    'bounds',
    'entrance',
    'vacant',
    'rentable',
    'spaceId',
    'x',
    'y',
  ]) &&
  address(v) &&
  identity(v.id) &&
  text(v.name) &&
  ['home', 'plot'].includes(v.kind as string) &&
  identity(v.settlementId) &&
  integer(v.seed, 0, 0xffffffff) &&
  plainAddress(v.entrance) &&
  isObject(v.bounds) &&
  keys(v.bounds, ['x', 'y', 'width', 'height']) &&
  integer(v.bounds.x, -1e7, 1e7) &&
  integer(v.bounds.y, -1e7, 1e7) &&
  integer(v.bounds.width, 2, 40) &&
  integer(v.bounds.height, 2, 40) &&
  typeof v.vacant === 'boolean' &&
  typeof v.rentable === 'boolean';
export function propertyPrice(offer: PropertyOffer) {
  const area = offer.bounds.width * offer.bounds.height;
  return {
    buy: Math.min(280, (offer.kind === 'home' ? 32 : 16) + area * 2 + (offer.seed % 13)),
    rent: 8 + Math.floor(area / 6),
  };
}
export function estateWorkerProfile(person: PropertyPerson) {
  const seed = deriveSeed(person.seed, 'estate-person', person.id);
  const specialty: StationKind =
    person.role === 'engineer'
      ? 'carpentry'
      : person.role === 'botanist'
        ? 'garden'
        : person.role === 'merchant'
          ? 'store'
          : (['sawmill', 'apothecary', 'garden'] as const)[seed % 3];
  return {
    specialty,
    competence: 0.85 + (seed % 31) / 100,
    loyalty: 55 + (seed % 21),
    nightShift: (seed >>> 8) % 5 === 0,
  };
}
/** Strict versioned private ledger. No transient sound/effect or audio payload has a schema slot. */
export function validPropertySave(v: unknown): v is PropertySave {
  if (
    !isObject(v) ||
    !keys(v, ['version', 'seed', 'serial', 'estates', 'workers', 'receipts']) ||
    v.version !== 1 ||
    !integer(v.seed, 0, 0xffffffff) ||
    !integer(v.serial) ||
    !Array.isArray(v.estates) ||
    v.estates.length > PROPERTY_RULES.maxEstates ||
    !Array.isArray(v.workers) ||
    v.workers.length > PROPERTY_RULES.maxWorkers ||
    !Array.isArray(v.receipts) ||
    v.receipts.length > PROPERTY_RULES.maxReceipts ||
    !v.receipts.every(identity) ||
    new Set(v.receipts).size !== v.receipts.length
  )
    return false;
  const ownerCounts = new Map<string, number>();
  const estates = new Set<string>(),
    stations = new Map<string, EstateStation>(),
    workerIds = new Set<string>(),
    jobs = new Set<number>(),
    allocations = new Set<number>(),
    occupied = new Set<string>();
  for (const e of v.estates) {
    if (
      !isObject(e) ||
      !keys(e, [
        'id',
        'ownerId',
        'offer',
        'tenure',
        'leaseUntil',
        'acquiredAt',
        'locked',
        'guests',
        'storage',
        'stations',
        'furnishings',
        'lastRestAt',
        'revision',
        'salesDay',
        'dailySales',
      ]) ||
      !identity(e.id) ||
      estates.has(e.id) ||
      !identity(e.ownerId) ||
      !validOffer(e.offer) ||
      e.offer.id !== e.id ||
      !['owned', 'rented'].includes(e.tenure as string) ||
      !(e.tenure === 'rented' ? finite(e.leaseUntil) : e.leaseUntil === undefined) ||
      !finite(e.acquiredAt) ||
      typeof e.locked !== 'boolean' ||
      !Array.isArray(e.guests) ||
      e.guests.length > PROPERTY_RULES.maxGuests ||
      !e.guests.every(identity) ||
      new Set(e.guests).size !== e.guests.length ||
      !bundle(e.storage) ||
      units(e.storage.items) > PROPERTY_RULES.maxBufferUnits ||
      !integer(e.furnishings, 0, 3) ||
      !finite(e.lastRestAt, -1e12) ||
      !integer(e.revision) ||
      !integer(e.salesDay) ||
      !integer(e.dailySales, 0, 12) ||
      !Array.isArray(e.stations) ||
      e.stations.length > PROPERTY_RULES.maxStations
    )
      return false;
    const owned = (ownerCounts.get(e.ownerId) ?? 0) + 1;
    if (owned > PROPERTY_RULES.maxOwned) return false;
    ownerCounts.set(e.ownerId, owned);
    estates.add(e.id);
    for (const s of e.stations) {
      if (
        !isObject(s) ||
        !keys(s, [
          'id',
          'kind',
          'spaceId',
          'x',
          'y',
          'workerId',
          'job',
          'produced',
          'workingSeconds',
          'status',
        ]) ||
        !identity(s.id) ||
        stations.has(s.id) ||
        !/^estate-station:[1-9][0-9]*$/.test(s.id) ||
        !integer(Number(s.id.slice(15)), 1, v.serial) ||
        allocations.has(Number(s.id.slice(15))) ||
        !address(s) ||
        !Number.isInteger(s.x) ||
        !Number.isInteger(s.y) ||
        !Object.hasOwn(ESTATE_STATIONS, s.kind as string) ||
        !integer(s.produced) ||
        !finite(s.workingSeconds) ||
        !text(s.status) ||
        (s.workerId !== undefined && !identity(s.workerId))
      )
        return false;
      const def = ESTATE_STATIONS[s.kind as StationKind];
      if (!inBounds(s, e.offer, def.width, def.height)) return false;
      allocations.add(Number(s.id.slice(15)));
      for (let dy = 0; dy < def.height; dy++)
        for (let dx = 0; dx < def.width; dx++) {
          const key = tileKey({ spaceId: s.spaceId, x: s.x + dx, y: s.y + dy });
          if (occupied.has(key)) return false;
          occupied.add(key);
        }
      stations.set(s.id, s as unknown as EstateStation);
      if (s.job !== undefined) {
        const j = s.job;
        if (
          !isObject(j) ||
          !keys(j, [
            'id',
            'recipe',
            'remaining',
            'completed',
            'elapsed',
            'reserved',
            'wageFunded',
          ]) ||
          !integer(j.id, 1, v.serial) ||
          jobs.has(j.id) ||
          allocations.has(j.id) ||
          !ESTATE_RECIPES.some((r) => r.id === j.recipe && r.station === s.kind) ||
          !integer(j.remaining, 1, PROPERTY_RULES.maxBatches) ||
          !integer(j.completed, 0, PROPERTY_RULES.maxBatches) ||
          j.remaining + j.completed > PROPERTY_RULES.maxBatches ||
          !finite(j.elapsed, 0, 3600) ||
          !stacks(j.reserved) ||
          typeof j.wageFunded !== 'boolean'
        )
          return false;
        jobs.add(j.id);
        allocations.add(j.id);
      }
    }
  }
  for (const w of v.workers) {
    if (
      !isObject(w) ||
      !keys(w, [
        'id',
        'ownerId',
        'estateId',
        'name',
        'home',
        'specialty',
        'competence',
        'loyalty',
        'nightShift',
        'hiredAt',
        'lastStepAt',
        'stationId',
        'phase',
        'cargo',
        'status',
        'unpaidSince',
      ]) ||
      !identity(w.id) ||
      workerIds.has(w.id) ||
      !identity(w.ownerId) ||
      !identity(w.estateId) ||
      !estates.has(w.estateId) ||
      !text(w.name) ||
      !plainAddress(w.home) ||
      !Object.hasOwn(ESTATE_STATIONS, w.specialty as string) ||
      !finite(w.competence, 0.5, 1.5) ||
      !finite(w.loyalty, 0, 100) ||
      typeof w.nightShift !== 'boolean' ||
      !finite(w.hiredAt) ||
      !finite(w.lastStepAt) ||
      !['idle', 'collecting', 'carrying-input', 'working', 'carrying-output'].includes(
        w.phase as string,
      ) ||
      !bundle(w.cargo) ||
      !text(w.status) ||
      (w.unpaidSince !== undefined && !finite(w.unpaidSince)) ||
      (w.stationId !== undefined &&
        (!identity(w.stationId) || stations.get(w.stationId)?.workerId !== w.id))
    )
      return false;
    const e = (v.estates as Estate[]).find((e) => e.id === w.estateId)!;
    if (
      e.ownerId !== w.ownerId ||
      (w.stationId !== undefined && !e.stations.some((s) => s.id === w.stationId))
    )
      return false;
    if (w.stationId === undefined && (w.phase !== 'idle' || units(w.cargo.items) || w.cargo.coins))
      return false;
    workerIds.add(w.id);
  }
  for (const station of stations.values()) {
    const worker = (v.workers as EstateWorker[]).find((w) => w.id === station.workerId);
    if (station.workerId && (!worker || worker.stationId !== station.id)) return false;
    const job = station.job;
    if (!job) {
      if (worker && (worker.phase !== 'idle' || units(worker.cargo.items) || worker.cargo.coins))
        return false;
      continue;
    }
    const recipe = ESTATE_RECIPES.find((r) => r.id === job.recipe)!;
    if (job.elapsed > recipe.seconds) return false;
    const inFlight =
      !!worker && ['carrying-input', 'working', 'carrying-output'].includes(worker.phase);
    const expectedReserved = multiplied(recipe.inputs, job.remaining - (inFlight ? 1 : 0));
    const equalStacks = (a: FieldStacks, b: FieldStacks) =>
      Object.keys(a).length === Object.keys(b).length &&
      Object.entries(a).every(([k, n]) => b[k as FieldItem] === n);
    if (!equalStacks(job.reserved, expectedReserved) || job.wageFunded !== inFlight) return false;
    if (worker) {
      const expectedCargo =
        worker.phase === 'carrying-input'
          ? { coins: 0, items: recipe.inputs }
          : worker.phase === 'carrying-output'
            ? recipe.output
            : empty();
      if (
        worker.cargo.coins !== expectedCargo.coins ||
        !equalStacks(worker.cargo.items, expectedCargo.items)
      )
        return false;
    }
  }
  return true;
}

/** Operator authority owns this ledger. A tick can request travel but cannot create an arrival. */
export class PropertyWorld {
  private state: PropertySave;
  private receipts: Set<string>;
  private workerIndex: Map<string, EstateWorker>;
  private cursor = 0;
  private stationCells = new Map<string, Readonly<StationObstacle>>();
  private estateRoutes = new Map<string, EstateRoutes>();
  private routeSeen = new Uint8Array(PROPERTY_RULES.maxRouteCells);
  private routeQueue = new Uint16Array(PROPERTY_RULES.maxRouteCells);
  private routeBudget = PROPERTY_RULES.routeProbesPerTick;
  private events: PropertyEvent[] = [];
  private adapters: PropertyAdapters;
  readonly diagnostics = {
    workerSteps: 0,
    skippedSeconds: 0,
    saturated: false,
    routeProbes: 0,
    routeChecks: 0,
  };
  constructor(seed: number, adapters: PropertyAdapters, saved?: PropertySave) {
    if (saved && (!validPropertySave(saved) || saved.seed !== seed >>> 0))
      throw new Error('Invalid property checkpoint');
    this.state = saved
      ? clone(saved)
      : { version: 1, seed: seed >>> 0, serial: 0, estates: [], workers: [], receipts: [] };
    this.receipts = new Set(this.state.receipts);
    this.workerIndex = new Map(this.state.workers.map((w) => [w.id, w]));
    this.adapters = adapters;
    for (const estate of this.state.estates)
      for (const station of estate.stations) this.indexStation(estate.id, station);
  }
  stationObstacle(at: ActorAddress): Readonly<StationObstacle> | undefined {
    return this.stationCells.get(tileKey(at));
  }
  blocks(at: ActorAddress): boolean {
    return this.stationCells.has(tileKey(at));
  }
  /** Call after external door/terrain edits. Cached routes contain no persistent simulation data. */
  invalidateNavigation(estateId?: string): void {
    if (estateId) this.estateRoutes.delete(estateId);
    else this.estateRoutes.clear();
  }
  private indexStation(estateId: string, station: EstateStation, remove = false): void {
    const def = ESTATE_STATIONS[station.kind];
    const obstacle = Object.freeze({ estateId, stationId: station.id, kind: station.kind });
    for (let dy = 0; dy < def.height; dy++)
      for (let dx = 0; dx < def.width; dx++) {
        const key = tileKey({ spaceId: station.spaceId, x: station.x + dx, y: station.y + dy });
        if (remove) this.stationCells.delete(key);
        else this.stationCells.set(key, obstacle);
      }
    this.invalidateNavigation();
  }
  isHired(npcId: string): boolean {
    return this.workerIndex.has(npcId);
  }
  hasWorkAssignment(npcId: string): boolean {
    return !!this.workerIndex.get(npcId)?.stationId;
  }
  hiredWorkerIds(): readonly string[] {
    return [...this.workerIndex.keys()];
  }
  save(): PropertySave {
    return clone(this.state);
  }
  getEstate(id: string): Estate | undefined {
    const e = this.state.estates.find((e) => e.id === id);
    return e && clone(e);
  }
  homeTarget(peerId: string, now: number): ActorAddress | undefined {
    const e = this.state.estates.find(
      (e) => e.ownerId === peerId && e.offer.kind === 'home' && this.active(e, now),
    );
    return e && clone(e.offer.entrance);
  }
  frame(peerId: string, at?: ActorAddress) {
    const estates = this.state.estates
      .filter((e) => e.ownerId === peerId || (at && distance(e.offer, at) < 36))
      .map((e) =>
        e.ownerId === peerId
          ? clone(e)
          : {
              id: e.id,
              ownerId: e.ownerId,
              offer: clone(e.offer),
              locked: e.locked,
              stations: e.stations.map((s) => ({
                id: s.id,
                kind: s.kind,
                x: s.x,
                y: s.y,
                spaceId: s.spaceId,
                status: s.status,
              })),
            },
      );
    return {
      version: 1 as const,
      estates,
      workers: this.state.workers
        .filter((w) => w.ownerId === peerId)
        .map((w) => ({
          ...clone(w),
          address: this.adapters.person(w.id)
            ? this.personAddress(this.adapters.person(w.id)!)
            : undefined,
        })),
      saturated: this.receipts.size >= PROPERTY_RULES.maxReceipts,
    };
  }
  drainEvents(): PropertyEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
  access(
    peerId: string,
    propertyId: string,
    now: number,
  ): { allowed: boolean; reason: string; ownerId?: string } {
    const e = this.state.estates.find((e) => e.id === propertyId);
    if (!e) return { allowed: false, reason: 'This property has no registered access agreement.' };
    if (!this.active(e, now))
      return {
        allowed: false,
        reason: 'The lease has expired; belongings remain safely stored.',
        ownerId: e.ownerId,
      };
    const worker = this.workerIndex.get(peerId);
    const employee = worker?.estateId === e.id && worker.ownerId === e.ownerId;
    const allowed = e.ownerId === peerId || e.guests.includes(peerId) || employee || !e.locked;
    return {
      allowed,
      reason: allowed ? 'Welcome.' : 'Private property. Ask the owner for a guest key.',
      ownerId: e.ownerId,
    };
  }
  private active(e: Estate, now: number) {
    return e.tenure === 'owned' || (e.leaseUntil ?? 0) > now;
  }
  private personAddress(p: PropertyPerson): ActorAddress {
    return { spaceId: p.spaceId, x: p.x, y: p.y };
  }
  private emit(
    e: Estate,
    kind: PropertyEvent['kind'],
    actorId?: string,
    recipe?: string,
    at?: ActorAddress,
  ) {
    if (this.events.length >= 64) this.events.shift();
    this.events.push({
      id: `estate-event:${++this.state.serial}`,
      kind,
      ownerId: e.ownerId,
      estateId: e.id,
      ...(actorId ? { actorId } : {}),
      ...(recipe ? { recipe } : {}),
      spaceId: (at ?? e.offer.entrance).spaceId,
      x: (at ?? e.offer.entrance).x,
      y: (at ?? e.offer.entrance).y,
    });
  }
  private near(peerId: string, at: ActorAddress) {
    const p = this.adapters.peer(peerId);
    return !!p && distance(p, at) <= PROPERTY_RULES.interactionDistance;
  }
  private bank(peerId: string, cost: FieldBundle, reward: FieldBundle, id: string): PropertyResult {
    const r = this.adapters.transact(peerId, cost, reward, id);
    return result(r.ok, r.message);
  }
  private owned(peerId: string, id: string, now: number): Estate | undefined {
    return this.state.estates.find(
      (e) => e.id === id && e.ownerId === peerId && this.active(e, now),
    );
  }
  /** eventId is server-scoped, stable across retries and never a client-selected outcome. */
  command(peerId: string, command: PropertyCommand, eventId: string, now: number): PropertyResult {
    if (
      !identity(peerId) ||
      !identity(eventId) ||
      !finite(now) ||
      !isObject(command) ||
      !identity(command.propertyId)
    )
      return result(false, 'Invalid estate request.');
    const receipt = `${peerId}|${eventId}`;
    if (receipt.length > 200 || this.receipts.has(receipt))
      return result(false, 'This estate request was already handled.');
    if (this.receipts.size >= PROPERTY_RULES.maxReceipts) {
      this.diagnostics.saturated = true;
      return result(false, 'The estate ledger is full; existing property remains safe.');
    }
    const answer = this.apply(peerId, command, eventId, now);
    // Failed requests do not consume the finite permanent receipt ledger.
    if (answer.ok) {
      this.receipts.add(receipt);
      this.state.receipts.push(receipt);
    }
    return answer;
  }
  private apply(peerId: string, c: PropertyCommand, eventId: string, now: number): PropertyResult {
    if (c.kind === 'acquire') {
      const offer = this.adapters.offer(c.propertyId);
      if (!offer || !validOffer(offer) || !this.near(peerId, offer.entrance))
        return result(false, 'Visit the actual property entrance first.');
      if (this.state.estates.some((e) => e.id === offer.id))
        return result(false, 'This property already has an owner or tenant.');
      if (
        this.state.estates.length >= PROPERTY_RULES.maxEstates ||
        this.state.estates.filter((e) => e.ownerId === peerId).length >= PROPERTY_RULES.maxOwned
      )
        return result(false, 'The property register has reached its limit.');
      const permission = this.adapters.permission(peerId, 'acquire', offer.id);
      if (!permission.ok)
        return result(false, permission.reason ?? 'Local law refuses the purchase.');
      const legacy = c.mode === 'legacy-home' && this.adapters.legacyHome(peerId) === offer.id;
      if (c.mode === 'legacy-home' && !legacy)
        return result(false, 'The authority cannot verify that origin home.');
      if (!legacy && (!offer.vacant || (c.mode === 'rent' && !offer.rentable)))
        return result(false, 'This occupied property is not offered for that agreement.');
      if (!['buy', 'rent', 'legacy-home'].includes(c.mode)) return result(false, 'Unknown tenure.');
      const charge = legacy ? 0 : propertyPrice(offer)[c.mode === 'rent' ? 'rent' : 'buy'];
      const paid = this.bank(peerId, { coins: charge, items: {} }, empty(), `estate:${eventId}`);
      if (!paid.ok) return paid;
      const e: Estate = {
        id: offer.id,
        ownerId: peerId,
        offer: clone(offer),
        tenure: c.mode === 'rent' ? 'rented' : 'owned',
        ...(c.mode === 'rent' ? { leaseUntil: now + PROPERTY_RULES.leaseSeconds } : {}),
        acquiredAt: now,
        locked: true,
        guests: [],
        storage: empty(),
        stations: [],
        furnishings: legacy ? 1 : 0,
        lastRestAt: -1000,
        revision: 1,
        salesDay: worldTimeAt(now).day,
        dailySales: 0,
      };
      this.state.estates.push(e);
      return {
        ok: true,
        message: legacy
          ? 'Your established home is registered. Imported balances were not transferred.'
          : `${offer.name} is now ${c.mode === 'rent' ? 'rented' : 'yours'}.`,
        estateId: e.id,
      };
    }
    const anyEstate = this.state.estates.find((e) => e.id === c.propertyId && e.ownerId === peerId);
    if (c.kind === 'renew' && anyEstate && anyEstate.tenure === 'rented') {
      if (!this.near(peerId, anyEstate.offer.entrance))
        return result(false, 'Renew at the property entrance.');
      const paid = this.bank(
        peerId,
        { coins: propertyPrice(anyEstate.offer).rent, items: {} },
        empty(),
        `estate:${eventId}`,
      );
      if (!paid.ok) return paid;
      anyEstate.leaseUntil = Math.max(now, anyEstate.leaseUntil ?? 0) + PROPERTY_RULES.leaseSeconds;
      anyEstate.revision++;
      return result(true, 'Lease extended. Stored belongings were preserved.');
    }
    const e = this.owned(peerId, c.propertyId, now);
    if (!e) return result(false, 'An active ownership or rental agreement is required.');
    if (!this.near(peerId, e.offer.entrance) && !this.near(peerId, e.offer))
      return result(false, 'Manage the estate beside its entrance or storage.');
    switch (c.kind) {
      case 'build': {
        if (!Object.hasOwn(ESTATE_STATIONS, c.station) || !plainAddress(c.at))
          return result(false, 'Unknown construction.');
        const checked = this.placement(peerId, e, c.station, c.at);
        if (!checked.ok) return checked;
        const paid = this.bank(
          peerId,
          ESTATE_STATIONS[c.station].cost,
          empty(),
          `estate:${eventId}`,
        );
        if (!paid.ok) return paid;
        const s: EstateStation = {
          id: `estate-station:${++this.state.serial}`,
          kind: c.station,
          ...clone(c.at),
          produced: 0,
          workingSeconds: 0,
          status: 'Needs a worker and a recipe',
        };
        e.stations.push(s);
        this.indexStation(e.id, s);
        e.revision++;
        this.emit(e, 'construction-complete', peerId, undefined, s);
        return {
          ok: true,
          message: `${ESTATE_STATIONS[c.station].name} constructed.`,
          estateId: e.id,
          stationId: s.id,
        };
      }
      case 'hire': {
        if (
          !identity(c.npcId) ||
          this.state.workers.some((w) => w.id === c.npcId) ||
          this.state.workers.length >= PROPERTY_RULES.maxWorkers
        )
          return result(false, 'This person is already employed or the worker register is full.');
        const p = this.adapters.person(c.npcId);
        if (!p || !p.alive || !p.employable || !this.near(peerId, p))
          return result(false, 'Speak to a willing, living person nearby.');
        const permission = this.adapters.permission(peerId, 'hire', p.id);
        if (!permission.ok)
          return result(false, permission.reason ?? 'This person does not trust your offer.');
        const paid = this.bank(peerId, { coins: 4, items: {} }, empty(), `estate:${eventId}`);
        if (!paid.ok) return paid;
        this.state.workers.push({
          id: p.id,
          ownerId: peerId,
          estateId: e.id,
          name: p.name,
          home: clone(p.home),
          ...estateWorkerProfile(p),
          hiredAt: now,
          lastStepAt: now,
          phase: 'idle',
          cargo: empty(),
          status: 'Hired; choose a workstation',
        });
        e.revision++;
        this.workerIndex.set(p.id, this.state.workers[this.state.workers.length - 1]);
        this.emit(e, 'worker-hired', p.id);
        return result(
          true,
          `${p.name} accepted a paid contract. Their identity and home remain their own.`,
        );
      }
      case 'assign': {
        const w = this.state.workers.find(
            (w) => w.id === c.npcId && w.ownerId === peerId && w.estateId === e.id,
          ),
          s = e.stations.find((s) => s.id === c.stationId);
        if (!w || !s || (s.workerId && s.workerId !== w.id))
          return result(false, 'Choose your worker and a free workstation.');
        if (w.phase !== 'idle' || units(w.cargo.items) || w.cargo.coins)
          return result(
            false,
            'Let the worker finish and deliver their current batch before reassignment.',
          );
        for (const prev of e.stations) if (prev.workerId === w.id) delete prev.workerId;
        w.stationId = s.id;
        s.workerId = w.id;
        w.status = 'Waiting for a funded recipe';
        e.revision++;
        return result(true, `${w.name} assigned to ${ESTATE_STATIONS[s.kind].name}.`);
      }
      case 'unassign': {
        const w = this.state.workers.find(
          (w) => w.id === c.npcId && w.ownerId === peerId && w.estateId === e.id,
        );
        if (
          !w ||
          !['idle', 'collecting'].includes(w.phase) ||
          units(w.cargo.items) ||
          w.cargo.coins
        )
          return result(
            false,
            'Let the worker deliver the current batch before ending the assignment.',
          );
        const station = e.stations.find((s) => s.workerId === w.id);
        if (station) {
          delete station.workerId;
          station.status = 'Waiting for an assigned worker';
        }
        delete w.stationId;
        w.phase = 'idle';
        w.status = 'Off assignment; available for another job';
        this.adapters.travel(w.id, w.home);
        e.revision++;
        return result(
          true,
          `${w.name} is available for another assignment. Their employment and history are retained.`,
        );
      }
      case 'queue': {
        const s = e.stations.find((s) => s.id === c.stationId),
          recipe = ESTATE_RECIPES.find((r) => r.id === c.recipe && r.station === s?.kind);
        if (!s || !recipe || !integer(c.batches, 1, PROPERTY_RULES.maxBatches) || s.job)
          return result(false, 'Choose an idle matching station and one to twenty batches.');
        const cost = multiplied(recipe.inputs, c.batches);
        if (!enough(e.storage.items, cost))
          return result(
            false,
            'The estate storage lacks the reserved recipe inputs. Deposit gathered supplies first.',
          );
        change(e.storage.items, cost, -1);
        s.job = {
          id: ++this.state.serial,
          recipe: recipe.id,
          remaining: c.batches,
          completed: 0,
          elapsed: 0,
          reserved: cost,
          wageFunded: false,
        };
        s.status = 'Waiting for a worker';
        e.revision++;
        return result(
          true,
          `${c.batches} batch${c.batches === 1 ? '' : 'es'} reserved. Inputs stay physical; wages are paid per batch.`,
        );
      }
      case 'cancel-job': {
        const s = e.stations.find((s) => s.id === c.stationId),
          w = this.state.workers.find((w) => w.id === s?.workerId);
        if (!s?.job) return result(false, 'No queued job exists.');
        if (w && w.phase !== 'idle' && w.phase !== 'collecting')
          return result(false, 'The worker must deliver their current batch before cancellation.');
        if (units(e.storage.items) + units(s.job.reserved) > PROPERTY_RULES.maxBufferUnits)
          return result(false, 'Clear storage space before cancelling this reservation.');
        change(e.storage.items, s.job.reserved);
        delete s.job;
        if (w) {
          w.phase = 'idle';
          w.cargo = empty();
        }
        s.status = 'Job cancelled; unworked inputs returned';
        e.revision++;
        return result(true, s.status);
      }
      case 'deposit':
      case 'withdraw': {
        if (!bundle(c.bundle) || (!units(c.bundle.items) && !c.bundle.coins))
          return result(false, 'Select a positive, valid supply amount.');
        const deposit = c.kind === 'deposit';
        if (
          deposit &&
          (units(e.storage.items) + units(c.bundle.items) > PROPERTY_RULES.maxBufferUnits ||
            e.storage.coins + c.bundle.coins > 100000000)
        )
          return result(false, 'Estate storage is full.');
        if (
          !deposit &&
          (!enough(e.storage.items, c.bundle.items) || e.storage.coins < c.bundle.coins)
        )
          return result(false, 'Those supplies are not in estate storage.');
        const paid = this.bank(
          peerId,
          deposit ? c.bundle : empty(),
          deposit ? empty() : c.bundle,
          `estate:${eventId}`,
        );
        if (!paid.ok) return paid;
        change(e.storage.items, c.bundle.items, deposit ? 1 : -1);
        e.storage.coins += c.bundle.coins * (deposit ? 1 : -1);
        e.revision++;
        return result(
          true,
          deposit
            ? 'Supplies deposited into the physical estate store.'
            : 'Supplies collected into your authoritative field satchel.',
        );
      }
      case 'guest': {
        if (!identity(c.guestId) || typeof c.allow !== 'boolean')
          return result(false, 'Unknown guest.');
        if (c.allow && !e.guests.includes(c.guestId)) {
          if (e.guests.length >= PROPERTY_RULES.maxGuests)
            return result(false, 'The guest-key limit is reached.');
          e.guests.push(c.guestId);
        } else if (!c.allow) e.guests = e.guests.filter((id) => id !== c.guestId);
        e.revision++;
        return result(true, c.allow ? 'Guest access granted.' : 'Guest key revoked.');
      }
      case 'lock':
        if (typeof c.locked !== 'boolean') return result(false, 'Invalid lock request.');
        e.locked = c.locked;
        e.revision++;
        return result(
          true,
          c.locked
            ? 'Private access enabled.'
            : 'The entrance is open to visitors; storage remains owner-only.',
        );
      case 'furnish': {
        if (e.offer.kind !== 'home' || e.furnishings >= 3)
          return result(false, 'Only homes with an unfinished furnishing tier can be improved.');
        const paid = this.bank(
          peerId,
          { coins: 2, items: { planks: 2, fiber: 2 } },
          empty(),
          `estate:${eventId}`,
        );
        if (!paid.ok) return paid;
        e.furnishings++;
        e.revision++;
        this.emit(e, 'construction-complete', peerId);
        return result(
          true,
          [
            '',
            'A bed and private hearth are ready.',
            'Shelves and a sound work surface improve rest.',
            'Insulation and personal furnishings complete the home.',
          ][e.furnishings],
        );
      }
      case 'rest':
        if (e.offer.kind !== 'home' || !e.furnishings || now - e.lastRestAt < 30)
          return result(
            false,
            'Rest needs a furnished home and thirty seconds since your last rest.',
          );
        e.lastRestAt = now;
        e.revision++;
        this.emit(e, 'home-rest', peerId);
        return {
          ok: true,
          message: 'Rested at your own hearth.',
          rest: { hpFraction: 0.2 + e.furnishings * 0.1, staminaFraction: 1 },
        };
      case 'demolish': {
        const s = e.stations.find((s) => s.id === c.stationId);
        if (!s || c.confirmRevision !== e.revision)
          return result(false, 'Review the current estate before confirming demolition.');
        if (s.job || s.workerId)
          return result(
            false,
            'Cancel jobs and reassign the worker before dismantling a workstation.',
          );
        const salvage = Object.fromEntries(
          Object.entries(ESTATE_STATIONS[s.kind].cost.items).flatMap(([k, n]) =>
            Math.floor(n! / 2) > 0 ? [[k, Math.floor(n! / 2)]] : [],
          ),
        ) as FieldStacks;
        if (units(e.storage.items) + units(salvage) > PROPERTY_RULES.maxBufferUnits)
          return result(false, 'Make space for salvaged materials.');
        change(e.storage.items, salvage);
        this.indexStation(e.id, s, true);
        e.stations = e.stations.filter((p) => p.id !== s.id);
        e.revision++;
        return result(
          true,
          'Workstation dismantled. Half the construction materials were salvaged into storage.',
        );
      }
      default:
        return result(false, 'Unknown estate action.');
    }
  }
  placement(peerId: string, e: Estate, kind: StationKind, at: ActorAddress): PropertyResult {
    if (
      e.ownerId !== peerId ||
      !Object.hasOwn(ESTATE_STATIONS, kind) ||
      !plainAddress(at) ||
      !Number.isInteger(at.x) ||
      !Number.isInteger(at.y)
    )
      return result(false, 'Choose a whole tile in your own parcel.');
    const def = ESTATE_STATIONS[kind],
      permission = this.adapters.permission(peerId, 'build', e.id);
    if (!permission.ok)
      return result(false, permission.reason ?? 'Local construction law refuses this placement.');
    if (
      e.stations.length >= PROPERTY_RULES.maxStations ||
      !inBounds(at, e.offer, def.width, def.height)
    )
      return result(false, 'The blueprint must fit inside the owned parcel.');
    if (kind === 'garden' && e.offer.kind !== 'plot')
      return result(false, 'Living beds need an outdoor plot.');
    for (let y = 0; y < def.height; y++)
      for (let x = 0; x < def.width; x++) {
        const p = { spaceId: at.spaceId, x: at.x + x, y: at.y + y },
          cell = this.adapters.cell(p);
        if (
          cell.solid ||
          cell.road ||
          ['water', 'ice', 'wall', 'bridge', 'basalt'].includes(cell.terrain) ||
          (cell.buildingId && cell.buildingId !== e.id) ||
          (cell.parcelId && cell.parcelId !== e.id) ||
          distance(p, e.offer.entrance) < 1.5
        )
          return result(false, 'Keep roads, doors, other buildings and unsafe terrain clear.');
        if (this.blocks(p) || e.stations.some((s) => stationCovers(s, p)))
          return result(false, 'Another workstation occupies that blueprint.');
      }
    const planned: StationShape = { id: 'planned', kind, ...at };
    const routes = this.connectedApproaches(e, planned);
    const all = [...e.stations, planned];
    const stranded = all.find((station) => !routes.approaches.has(station.id));
    return result(
      !stranded,
      stranded
        ? 'Keep a walkable route from the entrance to every workstation. This blueprint would block collection or delivery.'
        : 'Blueprint fits and preserves all workstation delivery routes.',
    );
  }
  /** Called with the authority calendar. No wall-clock catch-up creates goods while the server is offline. */
  tick(now: number, dayFraction: number): void {
    if (!finite(now) || !finite(dayFraction, 0, 1)) return;
    this.routeBudget = PROPERTY_RULES.routeProbesPerTick;
    const count = Math.min(PROPERTY_RULES.maxWorkerSteps, this.state.workers.length);
    for (let i = 0; i < count; i++) {
      const w = this.state.workers[this.cursor++ % this.state.workers.length];
      const elapsed = Math.max(0, now - w.lastStepAt),
        dt = Math.min(PROPERTY_RULES.maxCatchupSeconds, elapsed);
      w.lastStepAt = Math.max(w.lastStepAt, now);
      this.diagnostics.skippedSeconds += Math.max(0, elapsed - dt);
      this.diagnostics.workerSteps++;
      this.stepWorker(w, now, dayFraction, dt);
    }
  }
  private move(w: EstateWorker, to: ActorAddress, label: string): boolean {
    const actual = this.adapters.person(w.id);
    if (!actual) return false;
    if (distance(actual, to) <= 0.85) return true;
    const status = this.adapters.travel(w.id, to);
    w.status =
      status === 'unreachable'
        ? `Unreachable: ${label}. Clear the route or reassign after recovery.`
        : `Walking: ${label}`;
    // Even a mistaken 'arrived' adapter result cannot authorize remote production.
    return false;
  }
  private stepWorker(w: EstateWorker, now: number, day: number, dt: number) {
    const e = this.state.estates.find((e) => e.id === w.estateId)!,
      s = e.stations.find((s) => s.id === w.stationId),
      p = this.adapters.person(w.id);
    if (!p || !p.alive) {
      w.status = 'Worker missing or injured; cargo and identity remain reserved';
      if (s) s.status = w.status;
      return;
    }
    if (!this.active(e, now)) {
      w.status = 'Lease expired; production paused without losing stock';
      if (s) s.status = w.status;
      return;
    }
    const shift = w.nightShift ? day >= 0.72 || day < 0.2 : day >= 0.23 && day < 0.77;
    if (!shift) {
      this.move(w, w.home, 'home for rest');
      w.status = 'Off shift; resting at home';
      if (s) s.status = w.status;
      return;
    }
    if (!s?.job) {
      w.phase = 'idle';
      w.status = 'Waiting for a queued job';
      return;
    }
    // The same actual person's witnessed/reported knowledge governs continuing employment.
    // A refusal pauses the batch; its already-paid wage, reserved stock and cargo remain intact.
    const permission = this.adapters.permission(w.ownerId, 'hire', w.id);
    if (!permission.ok) {
      w.status = `Work paused: ${(permission.reason ?? 'this worker no longer trusts the agreement; reconcile before resuming').slice(0, 140)}`;
      s.status = w.status;
      return;
    }
    const job = s.job,
      recipe = ESTATE_RECIPES.find((r) => r.id === job.recipe)!;
    if (w.loyalty < 15) {
      w.status = 'Refusing work: restore trust and safe pay';
      s.status = w.status;
      return;
    }
    if (w.phase === 'idle') w.phase = 'collecting';
    if (w.phase === 'collecting') {
      if (!this.move(w, e.offer.entrance, 'estate supplies')) {
        s.status = w.status;
        return;
      }
      if (!job.wageFunded) {
        if (s.kind === 'store') {
          const marketDay = worldTimeAt(now).day;
          if (e.salesDay !== marketDay) {
            e.salesDay = marketDay;
            e.dailySales = 0;
          }
          const actualCustomers = this.adapters.customers(e.id, now);
          const demand = Number.isFinite(actualCustomers)
            ? Math.min(12, Math.max(0, Math.floor(actualCustomers)))
            : 0;
          if (e.dailySales >= demand) {
            w.status = 'Waiting for local customers; daily orders are limited';
            s.status = w.status;
            return;
          }
        }
        const paid = this.bank(
          w.ownerId,
          { coins: recipe.wage, items: {} },
          empty(),
          `estate-wage:${job.id}:${job.completed}`,
        );
        if (!paid.ok) {
          w.unpaidSince ??= now;
          w.status = 'Wages missing; this batch cannot start';
          if (now - w.unpaidSince >= 60) {
            w.loyalty = Math.max(0, w.loyalty - 1);
            w.unpaidSince = now;
          }
          s.status = w.status;
          return;
        }
        job.wageFunded = true;
        if (s.kind === 'store') e.dailySales++;
        delete w.unpaidSince;
        w.loyalty = Math.min(100, w.loyalty + 0.5);
      }
      if (!enough(job.reserved, recipe.inputs)) {
        w.status = 'Reserved inputs are missing; production halted';
        s.status = w.status;
        return;
      }
      change(job.reserved, recipe.inputs, -1);
      w.cargo = { coins: 0, items: clone(recipe.inputs) };
      w.phase = 'carrying-input';
    }
    if (w.phase === 'carrying-input') {
      const approach = this.approach(e, s, now);
      if (!approach.point) {
        w.status = approach.pending
          ? 'Checking the workstation delivery route'
          : 'Unreachable: workstation approach is blocked. Clear a route to the estate entrance.';
        s.status = w.status;
        return;
      }
      if (!this.move(w, approach.point, 'loaded supplies to workstation')) {
        s.status = w.status;
        return;
      }
      w.cargo = empty();
      w.phase = 'working';
    }
    if (w.phase === 'working') {
      const approach = this.approach(e, s, now);
      if (!approach.point) {
        w.status = approach.pending
          ? 'Checking the workstation delivery route'
          : 'Unreachable: workstation approach is blocked. Clear a route to the estate entrance.';
        s.status = w.status;
        return;
      }
      if (!this.move(w, approach.point, 'workstation')) {
        s.status = w.status;
        return;
      }
      const rate = w.competence * (w.specialty === s.kind ? 1.15 : 0.85);
      job.elapsed = Math.min(recipe.seconds, job.elapsed + dt * rate);
      s.workingSeconds += dt;
      w.status = `Working: ${recipe.name} (${Math.floor((job.elapsed / recipe.seconds) * 100)}%)`;
      s.status = w.status;
      if (job.elapsed < recipe.seconds) return;
      w.cargo = clone(recipe.output);
      w.phase = 'carrying-output';
      this.emit(e, 'machine-cycle', w.id, recipe.id, s);
    }
    if (w.phase === 'carrying-output') {
      if (!this.move(w, e.offer.entrance, 'finished goods to estate storage')) {
        s.status = w.status;
        return;
      }
      if (
        units(e.storage.items) + units(w.cargo.items) > PROPERTY_RULES.maxBufferUnits ||
        e.storage.coins + w.cargo.coins > 100000000
      ) {
        w.status = 'Storage full; carrying the completed batch safely';
        s.status = w.status;
        return;
      }
      change(e.storage.items, w.cargo.items);
      e.storage.coins += w.cargo.coins;
      w.cargo = empty();
      job.remaining--;
      job.completed++;
      job.elapsed = 0;
      job.wageFunded = false;
      s.produced++;
      e.revision++;
      w.phase = 'idle';
      w.status = 'Delivered one complete batch';
      s.status = w.status;
      this.emit(e, recipe.output.coins ? 'store-sale' : 'production-delivered', w.id, recipe.id);
      if (!job.remaining) delete s.job;
    }
  }
  private approachCandidates(s: StationShape): ActorAddress[] {
    const d = ESTATE_STATIONS[s.kind],
      candidates: ActorAddress[] = [];
    // Every face tile is a legitimate work position; never target the station's own footprint.
    for (let dx = 0; dx < d.width; dx++)
      candidates.push(
        { spaceId: s.spaceId, x: s.x + dx, y: s.y + d.height },
        { spaceId: s.spaceId, x: s.x + dx, y: s.y - 1 },
      );
    for (let dy = 0; dy < d.height; dy++)
      candidates.push(
        { spaceId: s.spaceId, x: s.x - 1, y: s.y + dy },
        { spaceId: s.spaceId, x: s.x + d.width, y: s.y + dy },
      );
    return candidates;
  }
  private walkable(e: Estate, p: ActorAddress, planned?: StationShape): boolean {
    if (this.blocks(p) || (planned && stationCovers(planned, p))) return false;
    const cell = this.adapters.cell(p);
    return (
      !cell.solid &&
      !['water', 'ice', 'wall'].includes(cell.terrain) &&
      (!cell.buildingId || cell.buildingId === e.id) &&
      (!cell.parcelId || cell.parcelId === e.id)
    );
  }
  /** Exact cardinal connectivity inside this parcel plus its two-tile entrance apron, at most 1,936 cells. */
  private connectedApproaches(
    e: Estate,
    planned?: StationShape,
  ): { approaches: Map<string, ActorAddress>; probes: number } {
    const margin = PROPERTY_RULES.routeMargin,
      b = e.offer.bounds;
    const minX = b.x - margin,
      minY = b.y - margin,
      width = b.width + margin * 2,
      height = b.height + margin * 2,
      area = width * height;
    const approaches = new Map<string, ActorAddress>();
    if (area > PROPERTY_RULES.maxRouteCells) return { approaches, probes: 0 };
    const inside = (p: ActorAddress) =>
      p.spaceId === e.offer.spaceId &&
      p.x >= minX &&
      p.y >= minY &&
      p.x < minX + width &&
      p.y < minY + height;
    const index = (p: ActorAddress) => (p.y - minY) * width + p.x - minX;
    const point = (i: number): ActorAddress => ({
      spaceId: e.offer.spaceId,
      x: minX + (i % width),
      y: minY + Math.floor(i / width),
    });
    const origin = {
      spaceId: e.offer.entrance.spaceId,
      x: Math.round(e.offer.entrance.x),
      y: Math.round(e.offer.entrance.y),
    };
    if (!inside(origin)) return { approaches, probes: 0 };
    this.routeSeen.fill(0, 0, area);
    let probes = 0,
      head = 0,
      tail = 0;
    const visit = (p: ActorAddress) => {
      if (!inside(p)) return;
      const i = index(p);
      if (this.routeSeen[i]) return;
      probes++;
      if (!this.walkable(e, p, planned)) {
        this.routeSeen[i] = 1;
        return;
      }
      this.routeSeen[i] = 2;
      this.routeQueue[tail++] = i;
    };
    visit(origin);
    while (head < tail) {
      const i = this.routeQueue[head++],
        p = point(i);
      visit({ ...p, x: p.x + 1 });
      visit({ ...p, x: p.x - 1 });
      visit({ ...p, y: p.y + 1 });
      visit({ ...p, y: p.y - 1 });
    }
    for (const station of planned ? [...e.stations, planned] : e.stations) {
      const candidate = this.approachCandidates(station).find(
        (p) => inside(p) && this.routeSeen[index(p)] === 2,
      );
      if (candidate) approaches.set(station.id, candidate);
    }
    this.diagnostics.routeProbes += probes;
    this.diagnostics.routeChecks++;
    return { approaches, probes };
  }
  private approach(
    e: Estate,
    s: EstateStation,
    now: number,
  ): { point?: ActorAddress; pending?: boolean } {
    let cached = this.estateRoutes.get(e.id);
    const prior = cached?.approaches.get(s.id);
    const stale =
      !cached ||
      now - cached.checkedAt >= PROPERTY_RULES.routeCacheSeconds ||
      (prior && !this.walkable(e, prior));
    if (stale) {
      const maximum =
        (e.offer.bounds.width + PROPERTY_RULES.routeMargin * 2) *
        (e.offer.bounds.height + PROPERTY_RULES.routeMargin * 2);
      if (this.routeBudget < maximum) return { pending: true };
      const checked = this.connectedApproaches(e);
      this.routeBudget -= checked.probes;
      cached = { checkedAt: now, approaches: checked.approaches };
      this.estateRoutes.set(e.id, cached);
    }
    const point = cached?.approaches.get(s.id);
    return point ? { point } : {};
  }
  /** Authority-derived witnessed consequences only. Relationships change without rewriting actor identity. */
  react(
    ownerId: string,
    event: 'protected-worker' | 'injured-worker' | 'betrayed-guild' | 'restored-trust',
    at: ActorAddress,
  ) {
    if (!identity(ownerId) || !address(at)) return;
    const change =
      event === 'protected-worker'
        ? 8
        : event === 'injured-worker'
          ? -24
          : event === 'betrayed-guild'
            ? -12
            : 6;
    for (const worker of this.state.workers) {
      if (worker.ownerId !== ownerId) continue;
      const actual = this.adapters.person(worker.id);
      if (actual && distance(actual, at) <= 12)
        worker.loyalty = Math.min(100, Math.max(0, worker.loyalty + change));
    }
  }
}
