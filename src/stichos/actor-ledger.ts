import { HierarchicalNavigator, type NavigationWorld } from './navigation.ts';
import type { Point } from './types.ts';

export interface ActorAddress extends Point {
  spaceId: string;
}
export type PersistentActorKind = 'npc' | 'enemy' | 'guard' | 'worker' | 'fauna';
export type ActorJourneyState =
  | 'idle'
  | 'planning'
  | 'traveling'
  | 'waiting'
  | 'arrived'
  | 'unreachable'
  | 'dead';
export interface ActorBody extends Point {
  id: string;
}
export interface ActorRecord<T extends ActorBody = ActorBody> extends ActorAddress {
  id: string;
  kind: PersistentActorKind;
  body: T;
  home: ActorAddress;
  destination?: ActorAddress;
  state: ActorJourneyState;
  speed: number;
  simulatedAt: number;
  revision: number;
}
export interface ActorLedgerSave<T extends ActorBody = ActorBody> {
  version: 1;
  actors: ActorRecord<T>[];
}
export const ACTOR_LEDGER_RULES = Object.freeze({
  maxActors: 2048,
  indexCell: 16,
  coarseActorsPerTick: 4,
  coarseWorkPerTick: 96,
  maxNavigators: 8,
  maxCoarseSeconds: 2,
  maxCoarseDistance: 4,
});
interface Journey {
  navigator: HierarchicalNavigator;
  cursor: number;
  key: string;
  tries: number;
}
const finitePoint = (p: Point) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e8 && Math.abs(p.y) < 1e8;
const validSpace = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 160 && /^[a-zA-Z0-9:_.,-]+$/.test(v);
const exactKeys = (v: unknown, keys: readonly string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v)) &&
  Object.keys(v).every((k) => keys.includes(k));
const validAddress = (v: ActorAddress) => finitePoint(v) && validSpace(v.spaceId);
const savedAddress = (v: ActorAddress) => exactKeys(v, ['x', 'y', 'spaceId']) && validAddress(v);
const copyAddress = (v: ActorAddress): ActorAddress => ({ spaceId: v.spaceId, x: v.x, y: v.y });
const addressKey = (p: ActorAddress) =>
  `${p.spaceId}|${Math.floor(p.x / ACTOR_LEDGER_RULES.indexCell)},${Math.floor(p.y / ACTOR_LEDGER_RULES.indexCell)}`;
const clone = <T>(value: T): T => structuredClone(value);
// Bodies are validated plain save data. Equal captures at the same simulation tick
// must not create mutations merely because autosave asks for another snapshot.
const equalBody = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  let count = 0;
  for (const key in a) {
    if (!Object.hasOwn(a, key)) continue;
    count++;
    if (
      !Object.hasOwn(b, key) ||
      !equalBody((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    )
      return false;
  }
  for (const key in b) if (Object.hasOwn(b, key)) count--;
  return count === 0;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const canWalk = (c: ReturnType<NavigationWorld['cell']>) =>
  c.kind === 'open' || (c.kind === 'door' && c.allowed === true);

/** Validation is fail-closed. The owning subsystem also validates its body schema. */
export function validActorLedgerSave<T extends ActorBody>(
  value: unknown,
  validBody: (body: unknown) => body is T,
): value is ActorLedgerSave<T> {
  if (!value || typeof value !== 'object') return false;
  const save = value as ActorLedgerSave<T>;
  return (
    exactKeys(save, ['version', 'actors']) &&
    save.version === 1 &&
    Array.isArray(save.actors) &&
    save.actors.length <= ACTOR_LEDGER_RULES.maxActors &&
    new Set(save.actors.map((a) => a?.id)).size === save.actors.length &&
    save.actors.every(
      (a) =>
        exactKeys(a, [
          'id',
          'kind',
          'body',
          'home',
          'destination',
          'state',
          'speed',
          'simulatedAt',
          'revision',
          'spaceId',
          'x',
          'y',
        ]) &&
        typeof a.id === 'string' &&
        a.id.length > 0 &&
        a.id.length <= 200 &&
        ['npc', 'enemy', 'guard', 'worker', 'fauna'].includes(a.kind) &&
        finitePoint(a) &&
        validSpace(a.spaceId) &&
        savedAddress(a.home) &&
        (a.destination === undefined || savedAddress(a.destination)) &&
        ['idle', 'planning', 'traveling', 'waiting', 'arrived', 'unreachable', 'dead'].includes(
          a.state,
        ) &&
        Number.isFinite(a.speed) &&
        a.speed > 0 &&
        a.speed <= 8 &&
        Number.isFinite(a.simulatedAt) &&
        a.simulatedAt >= 0 &&
        Number.isSafeInteger(a.revision) &&
        a.revision >= 0 &&
        validBody(a.body) &&
        a.body.id === a.id &&
        a.body.x === a.x &&
        a.body.y === a.y,
    )
  );
}

/**
 * Existence and display are different concerns. Admission may report saturation but
 * never removes an existing identity. A rendering query has no mutation side effect.
 * Only authority mutates this ledger; peers consume published bodies/addresses.
 * Navigation/queues are ephemeral. Checkpoints retain body, address, destination and
 * consequences; no sound, effect, peer connection or audio buffer belongs here.
 */
export class ActorLedger<T extends ActorBody> {
  private records = new Map<string, ActorRecord<T>>();
  private cells = new Map<string, Set<string>>();
  private journeys = new Map<string, Journey>();
  private cursor = 0;
  private ordered?: ActorRecord<T>[];
  readonly diagnostics = { admitted: 0, saturated: 0, stepped: 0, probes: 0, navigators: 0 };

  constructor(save?: ActorLedgerSave<T>, validBody?: (body: unknown) => body is T) {
    if (save && (!validBody || !validActorLedgerSave(save, validBody)))
      throw new Error('Invalid actor ledger checkpoint');
    for (const actor of save?.actors ?? []) {
      const record = clone(actor);
      this.records.set(record.id, record);
      this.ordered = undefined;
      this.index(record);
    }
  }
  get size() {
    return this.records.size;
  }
  has(id: string) {
    return this.records.has(id);
  }
  destination(id: string): ActorAddress | undefined {
    const destination = this.records.get(id)?.destination;
    return destination && { ...destination };
  }
  /** Returned records are immutable copies. Use update/setDestination to preserve the spatial index. */
  get(id: string): ActorRecord<T> | undefined {
    const value = this.records.get(id);
    return value && clone(value);
  }
  register(
    body: T,
    kind: PersistentActorKind,
    time: number,
    options: { spaceId?: string; home?: ActorAddress; speed?: number } = {},
  ): boolean {
    if (this.records.has(body.id)) return true;
    const spaceId = options.spaceId ?? 'surface';
    if (
      !finitePoint(body) ||
      !validSpace(spaceId) ||
      !body.id ||
      body.id.length > 200 ||
      !Number.isFinite(time) ||
      time < 0
    )
      return false;
    if (this.records.size >= ACTOR_LEDGER_RULES.maxActors) {
      this.diagnostics.saturated++;
      return false;
    }
    const home = options.home ?? { spaceId, x: body.x, y: body.y };
    if (!validAddress(home)) return false;
    const record: ActorRecord<T> = {
      id: body.id,
      kind,
      body: clone(body),
      spaceId,
      x: body.x,
      y: body.y,
      home: copyAddress(home),
      state: 'idle',
      speed: Math.max(0.1, Math.min(8, Number.isFinite(options.speed) ? options.speed! : 1.5)),
      simulatedAt: time,
      revision: 0,
    };
    this.records.set(record.id, record);
    this.ordered = undefined;
    this.index(record);
    this.diagnostics.admitted++;
    return true;
  }
  update(body: T, time: number, spaceId?: string): boolean {
    const record = this.records.get(body.id);
    if (
      !record ||
      !finitePoint(body) ||
      !Number.isFinite(time) ||
      time < record.simulatedAt ||
      (spaceId !== undefined && !validSpace(spaceId))
    )
      return false;
    if (
      time === record.simulatedAt &&
      (spaceId === undefined || spaceId === record.spaceId) &&
      equalBody(body, record.body)
    )
      return true;
    this.unindex(record);
    if (distance(record, body) > 0.3 || (spaceId !== undefined && spaceId !== record.spaceId))
      this.journeys.delete(record.id);
    record.body = clone(body);
    record.x = body.x;
    record.y = body.y;
    if (spaceId) record.spaceId = spaceId;
    record.simulatedAt = time;
    record.revision++;
    this.index(record);
    return true;
  }
  setDestination(id: string, destination?: ActorAddress): boolean {
    const record = this.records.get(id);
    if (!record || record.state === 'dead' || (destination && !validAddress(destination)))
      return false;
    if (
      (!destination && !record.destination) ||
      (destination &&
        record.destination &&
        destination.spaceId === record.destination.spaceId &&
        destination.x === record.destination.x &&
        destination.y === record.destination.y)
    )
      return true;
    record.destination = destination && copyAddress(destination);
    record.state = destination ? 'planning' : 'idle';
    record.revision++;
    this.journeys.delete(id);
    return true;
  }
  markDead(id: string): boolean {
    const record = this.records.get(id);
    if (!record || record.state === 'dead') return false;
    record.state = 'dead';
    record.destination = undefined;
    record.revision++;
    this.journeys.delete(id);
    return true;
  }
  /** Floor changes require an explicit authoritative transition; navigation cannot invent one. */
  transition(id: string, address: ActorAddress, time: number): boolean {
    const record = this.records.get(id);
    if (!record || !validAddress(address) || !Number.isFinite(time) || time < record.simulatedAt)
      return false;
    return this.update({ ...record.body, x: address.x, y: address.y }, time, address.spaceId);
  }
  query(center: ActorAddress, radius: number, limit = 64): ActorRecord<T>[] {
    if (!validAddress(center) || !Number.isFinite(radius) || radius < 0) return [];
    const r = Math.min(256, radius),
      size = ACTOR_LEDGER_RULES.indexCell;
    const result: ActorRecord<T>[] = [];
    for (let cy = Math.floor((center.y - r) / size); cy <= Math.floor((center.y + r) / size); cy++)
      for (
        let cx = Math.floor((center.x - r) / size);
        cx <= Math.floor((center.x + r) / size);
        cx++
      )
        for (const id of this.cells.get(`${center.spaceId}|${cx},${cy}`) ?? []) {
          const actor = this.records.get(id)!;
          if (actor.state !== 'dead' && distance(actor, center) <= r) result.push(actor);
        }
    return result
      .sort((a, b) => distance(a, center) - distance(b, center) || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, Math.min(256, Math.floor(limit))))
      .map(clone);
  }
  snapshot(): ActorLedgerSave<T> {
    return {
      version: 1,
      actors: [...this.records.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone),
    };
  }
  private index(record: ActorRecord<T>) {
    const key = addressKey(record),
      bucket = this.cells.get(key) ?? new Set();
    bucket.add(record.id);
    this.cells.set(key, bucket);
  }
  private unindex(record: ActorRecord<T>) {
    const key = addressKey(record),
      bucket = this.cells.get(key);
    bucket?.delete(record.id);
    if (!bucket?.size) this.cells.delete(key);
  }
  /**
   * Bounded coarse simulation, preserving actual collision-checked movement. Elapsed
   * absence is capped at two seconds per visit: no offline teleport or unbounded catchup.
   * A space adapter is selected per actor. Foreign-space goals wait for a real portal.
   */
  advance(
    time: number,
    worldFor: (spaceId: string) => NavigationWorld | undefined,
    options: {
      active?: ReadonlySet<string>;
      openDoor?: (actor: ActorRecord<T>, id: string) => void;
    } = {},
  ) {
    // Fine simulation owns these actors now. Retaining its abandoned coarse route
    // would consume all eight planner slots and starve unrelated migrants.
    for (const id of this.journeys.keys()) if (options.active?.has(id)) this.journeys.delete(id);
    if (!Number.isFinite(time) || time < 0 || !this.records.size) return;
    const records = (this.ordered ??= [...this.records.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ));
    let work = ACTOR_LEDGER_RULES.coarseWorkPerTick,
      steps = 0;
    // Scanning is bounded too: no all-actors filter when most actors are resting.
    for (
      let scanned = 0;
      scanned < Math.min(records.length, 32) && steps < ACTOR_LEDGER_RULES.coarseActorsPerTick;
      scanned++
    ) {
      const actor = records[this.cursor++ % records.length];
      if (
        actor.state === 'dead' ||
        !actor.destination ||
        options.active?.has(actor.id) ||
        time <= actor.simulatedAt ||
        actor.state === 'unreachable' ||
        actor.state === 'arrived'
      )
        continue;
      steps++;
      if (actor.destination.spaceId !== actor.spaceId) {
        actor.state = 'waiting';
        continue;
      }
      const world = worldFor(actor.spaceId);
      if (!world) {
        actor.state = 'waiting';
        continue;
      }
      const key = `${actor.spaceId}:${actor.destination.x},${actor.destination.y}`;
      let journey = this.journeys.get(actor.id);
      if (!journey || journey.key !== key) {
        if (this.journeys.size >= ACTOR_LEDGER_RULES.maxNavigators) continue;
        const navigator = new HierarchicalNavigator(world);
        navigator.request(actor, actor.destination);
        journey = { navigator, cursor: 0, key, tries: 0 };
        this.journeys.set(actor.id, journey);
      }
      if (journey.navigator.status === 'planning') {
        if (work <= 0) continue;
        const before = journey.navigator.diagnostics.work;
        journey.navigator.step(Math.min(32, work));
        work -= journey.navigator.diagnostics.work - before;
        actor.state = 'planning';
        continue;
      }
      if (journey.navigator.status !== 'ready') {
        actor.state = 'unreachable';
        this.journeys.delete(actor.id);
        continue;
      }
      actor.state = 'traveling';
      let stride = Math.min(
        ACTOR_LEDGER_RULES.maxCoarseDistance,
        Math.min(ACTOR_LEDGER_RULES.maxCoarseSeconds, time - actor.simulatedAt) * actor.speed,
      );
      actor.simulatedAt = time;
      while (stride > 0.001 && journey.cursor < journey.navigator.route.length && work > 0) {
        const next = journey.navigator.route[journey.cursor],
          d = distance(actor, next);
        if (d < 0.05) {
          journey.cursor++;
          continue;
        }
        const amount = Math.min(0.2, stride, d),
          p = {
            x: actor.x + ((next.x - actor.x) / d) * amount,
            y: actor.y + ((next.y - actor.y) / d) * amount,
          };
        const cell = world.cell(Math.round(p.x), Math.round(p.y));
        work--;
        this.diagnostics.probes++;
        if (!canWalk(cell)) {
          if (journey.tries++ >= 3) {
            actor.state = 'unreachable';
            this.journeys.delete(actor.id);
          } else {
            journey.navigator.request(actor, actor.destination);
            journey.cursor = 0;
            actor.state = 'planning';
          }
          break;
        }
        if (cell.kind === 'door' && !cell.open) {
          actor.state = 'waiting';
          if (cell.id) options.openDoor?.(clone(actor), cell.id);
          break;
        }
        this.unindex(actor);
        actor.x = p.x;
        actor.y = p.y;
        actor.body.x = p.x;
        actor.body.y = p.y;
        actor.revision++;
        this.index(actor);
        stride -= amount;
      }
      if (journey.cursor >= journey.navigator.route.length) {
        actor.state = 'arrived';
        this.journeys.delete(actor.id);
      }
      this.diagnostics.stepped++;
    }
    this.diagnostics.navigators = this.journeys.size;
  }
}
