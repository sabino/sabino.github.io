import { deriveSeed, random } from '../procedural/random.ts';
import type { Biome, Point, Tile } from './types.ts';
import type { WorldTimeSignal } from './world-time.ts';
import { ActorLedger, validActorLedgerSave, type ActorLedgerSave } from './actor-ledger.ts';
import type { NavigationWorld } from './navigation.ts';

export const FAUNA_CELL_TILES = 12;
export const FAUNA_ACTIVE_RADIUS = 22;
export const FAUNA_MAX_ACTORS = 36;
export const FAUNA_MAX_OBSERVERS = 8;
export const FAUNA_ATTACK_PERIOD = 5;
export interface FaunaWorld {
  seed: number;
  tile(x: number, y: number): Tile;
  blocked(x: number, y: number, removed?: ReadonlySet<string>): boolean;
}
export interface LivingObserver extends Point {
  id: string;
  heading?: number;
  moving?: boolean;
  ward?: boolean;
}
export type FaunaKind = 'bird' | 'grazer' | 'boar' | 'wolf';
export type FaunaActivity =
  | 'sleep'
  | 'forage'
  | 'idle'
  | 'fly'
  | 'flee'
  | 'curious'
  | 'stalk'
  | 'lunge';
export interface FaunaActor extends Point {
  id: string;
  seed: number;
  kind: FaunaKind;
  name: string;
  group: string;
  home: Point;
  heading: number;
  activity: FaunaActivity;
  phase: number;
  scale: number;
  color: string;
  dangerous: boolean;
  targetId?: string;
  call: 'bird' | 'bleat' | 'rustle' | 'growl' | null;
}
export interface FaunaFrame {
  version: 1;
  elapsedSeconds: number;
  actors: FaunaActor[];
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const dry = (tile: Tile) =>
  !tile.building &&
  !tile.site &&
  !['water', 'ice', 'wall', 'floor', 'road', 'bridge'].includes(tile.terrain);

export function faunaHabitat(biome: Biome, kind: FaunaKind): boolean {
  if (biome === 'settlement' || biome === 'volcanic') return false;
  if (kind === 'bird') return !['dunes', 'badlands', 'alpine'].includes(biome);
  if (kind === 'grazer')
    return ['woodland', 'meadow', 'frostwood', 'tundra', 'highlands', 'alpine'].includes(biome);
  if (kind === 'boar') return ['wetland', 'marsh', 'woodland'].includes(biome);
  return ['frostwood', 'woodland', 'tundra', 'highlands', 'alpine', 'badlands'].includes(biome);
}
export function faunaActive(kind: FaunaKind, time: WorldTimeSignal): boolean {
  // Wolves remain resting in their habitat by day; birds roost invisibly at night.
  return kind !== 'bird' || time.daylight > 0.12;
}
/** Stop at terrain/closed doors; birds may cross water, but never clip through buildings. */
function reachable(
  world: FaunaWorld,
  from: Point,
  to: Point,
  bird: boolean,
  removed: ReadonlySet<string>,
): Point {
  const steps = Math.min(32, Math.max(1, Math.ceil(distance(from, to) / 0.35)));
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const point = lerp(from, to, i / steps),
      tile = world.tile(point.x, point.y);
    if (tile.building || tile.site || (!bird && world.blocked(point.x, point.y, removed)))
      return previous;
    previous = point;
  }
  return previous;
}

/**
 * A bounded deterministic ecological sampler, not a second world generator.
 * Absolute-time flock anchors keep animals identical after reconnect without catch-up ticks.
 * Behavioral priority: shelter > threat avoidance > predator pursuit > flock/foraging.
 * All observers must come from room authority when used in multiplayer.
 */
export class LivingWorld {
  private groups = new Map<string, FaunaActor[]>();
  private cacheSeed = -1;
  private readonly maxNewCells: number;
  private readonly persistent: boolean;
  private ledger: ActorLedger<FaunaActor>;
  /** Runtime consumers stream at most two cold ecological cells per refresh; pure replay can opt out. */
  constructor(
    options: {
      maxNewCells?: number;
      persistent?: boolean;
      save?: ActorLedgerSave<FaunaActor>;
    } = {},
  ) {
    this.maxNewCells = Math.max(1, Math.min(200, Math.floor(options.maxNewCells ?? 200)));
    this.persistent = options.persistent ?? false;
    this.ledger = new ActorLedger(options.save, validFaunaActor);
  }
  /** Capability-gated authority checkpoint. Playback calls are intentionally excluded. */
  save(): ActorLedgerSave<FaunaActor> | undefined {
    if (!this.persistent) return undefined;
    const state = this.ledger.snapshot();
    for (const actor of state.actors) actor.body.call = null;
    return state;
  }
  get persistentActors() {
    return this.ledger.size;
  }
  get persistenceSaturated() {
    return this.ledger.diagnostics.saturated > 0;
  }
  /** Authority harvest/combat owns deaths. Sampling can never regenerate this identity. */
  defeat(id: string): boolean {
    return this.persistent && this.ledger.markDead(id);
  }
  /** A real authority-confirmed wound changes the persistent animal's immediate goal. */
  wound(id: string, attacker: Point, response: 'flee' | 'defend'): boolean {
    const record = this.ledger.get(id);
    if (!this.persistent || !record || record.state === 'dead') return false;
    const actor = record.body;
    const heading = Math.atan2(actor.y - attacker.y, actor.x - attacker.x);
    actor.activity = response === 'defend' ? 'lunge' : 'flee';
    actor.call = actor.kind === 'bird' ? 'bird' : actor.kind === 'grazer' ? 'bleat' : 'growl';
    this.ledger.update(actor, record.simulatedAt);
    this.ledger.setDestination(id, {
      spaceId: 'surface',
      x: actor.x + Math.cos(heading) * 8,
      y: actor.y + Math.sin(heading) * 8,
    });
    return true;
  }
  sample(
    world: FaunaWorld,
    time: WorldTimeSignal,
    rawObservers: readonly LivingObserver[],
    removed: ReadonlySet<string> = new Set(),
  ): FaunaFrame {
    if (world.seed !== this.cacheSeed) {
      this.groups.clear();
      if (this.cacheSeed !== -1) this.ledger = new ActorLedger();
      this.cacheSeed = world.seed;
    }
    const observers = rawObservers
      .filter((p) => typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, FAUNA_MAX_OBSERVERS)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (this.persistent) return this.samplePersistent(world, time, observers, removed);
    const cells = new Map<string, { x: number; y: number }>();
    for (const p of observers) {
      const cx = Math.floor(p.x / FAUNA_CELL_TILES),
        cy = Math.floor(p.y / FAUNA_CELL_TILES);
      for (let y = cy - 2; y <= cy + 2; y++)
        for (let x = cx - 2; x <= cx + 2; x++) cells.set(`${x},${y}`, { x, y });
    }
    const candidates: FaunaActor[] = [];
    let newCells = 0;
    const ordered = [...cells].sort(([, a], [, b]) => {
      const nearest = (c: Point) =>
        Math.min(
          ...observers.map((p) =>
            distance({ x: (c.x + 0.5) * FAUNA_CELL_TILES, y: (c.y + 0.5) * FAUNA_CELL_TILES }, p),
          ),
        );
      return nearest(a) - nearest(b) || a.y - b.y || a.x - b.x;
    });
    for (const [key, cell] of ordered) {
      let group = this.groups.get(key);
      if (!group) {
        if (newCells >= this.maxNewCells) continue;
        newCells++;
        group = this.spawn(world, cell.x, cell.y, removed);
        this.groups.set(key, group);
      }
      for (const source of group) {
        if (!faunaActive(source.kind, time)) continue;
        if (!observers.some((p) => distance(p, source.home) < FAUNA_ACTIVE_RADIUS)) continue;
        candidates.push(this.actor(world, source, time, observers, removed));
      }
    }
    // Nearest actors first; sorting tie breaker is independent of traversal or connection order.
    const nearest = (a: Point) => Math.min(...observers.map((p) => distance(a, p)));
    candidates.sort((a, b) => nearest(a) - nearest(b) || a.id.localeCompare(b.id));
    while (this.groups.size > 256) this.groups.delete(this.groups.keys().next().value!);
    return {
      version: 1,
      elapsedSeconds: time.elapsedSeconds,
      actors: candidates.slice(0, FAUNA_MAX_ACTORS),
    };
  }
  private samplePersistent(
    world: FaunaWorld,
    time: WorldTimeSignal,
    observers: LivingObserver[],
    removed: ReadonlySet<string>,
  ): FaunaFrame {
    const cells = new Map<string, Point>();
    for (const p of observers) {
      const cx = Math.floor(p.x / FAUNA_CELL_TILES),
        cy = Math.floor(p.y / FAUNA_CELL_TILES);
      for (let y = cy - 2; y <= cy + 2; y++)
        for (let x = cx - 2; x <= cx + 2; x++) {
          const key = `${x},${y}`;
          // Warm, already admitted spawn cells need no allocation or sorting.
          if (!this.groups.has(key) && !cells.has(key)) cells.set(key, { x, y });
        }
    }
    const nearest = (p: Point) => {
      let d = Infinity;
      // Sorting only needs ordering. Squared distance avoids thousands of hypot
      // calls per refresh with eight observers in the same population.
      for (const observer of observers) {
        const dx = observer.x - p.x,
          dy = observer.y - p.y;
        d = Math.min(d, dx * dx + dy * dy);
      }
      return d;
    };
    const ordered = [...cells]
      .map(([key, cell]) => ({
        key,
        ...cell,
        range: nearest({
          x: (cell.x + 0.5) * FAUNA_CELL_TILES,
          y: (cell.y + 0.5) * FAUNA_CELL_TILES,
        }),
      }))
      .sort((a, b) => a.range - b.range || a.y - b.y || a.x - b.x);
    let fresh = 0;
    for (const cell of ordered) {
      if (fresh++ >= this.maxNewCells) break;
      const group = this.spawn(world, cell.x, cell.y, removed);
      this.groups.set(cell.key, group);
      for (const actor of group)
        this.ledger.register(actor, 'fauna', time.elapsedSeconds, {
          home: { ...actor.home, spaceId: 'surface' },
          speed: actor.kind === 'bird' ? 2.3 : 1.2,
        });
    }
    // The spawn cache can be forgotten; the identity and tombstone ledger cannot.
    while (this.groups.size > 256) this.groups.delete(this.groups.keys().next().value!);
    const active = new Map<string, ReturnType<ActorLedger<FaunaActor>['get']>>();
    for (const p of observers)
      for (const record of this.ledger.query(
        { x: p.x, y: p.y, spaceId: 'surface' },
        FAUNA_ACTIVE_RADIUS,
        FAUNA_MAX_ACTORS,
      ))
        active.set(record.id, record);
    const selected = [...active.values()]
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((record) => ({ record, range: nearest(record) }))
      .sort((a, b) => a.range - b.range || a.record.id.localeCompare(b.record.id))
      .slice(0, FAUNA_MAX_ACTORS)
      .map((entry) => entry.record);
    const frames: FaunaActor[] = [];
    const groundNavigation = this.faunaNavigation(world, removed, false);
    const flightNavigation = this.faunaNavigation(world, removed, true);
    for (const record of selected) {
      const source = record.body;
      const dt = Math.max(0, Math.min(0.75, time.elapsedSeconds - record.simulatedAt));
      // query() already returns a detached body. update() captures it before playback
      // calls are added; a second body/home clone here only adds garbage each refresh.
      const actor = source;
      actor.call = null;
      const observer = observers.reduce<LivingObserver | undefined>(
        (best, candidate) =>
          !best || distance(candidate, actor) < distance(best, actor) ? candidate : best,
        undefined,
      );
      const range = observer ? distance(observer, actor) : Infinity;
      const phase = (time.elapsedSeconds + (actor.seed % 5)) % FAUNA_ATTACK_PERIOD;
      let target: Point | undefined,
        speed = actor.kind === 'bird' ? 2.3 : 1.2;
      delete actor.targetId;
      if (
        source.activity === 'flee' &&
        record.destination &&
        distance(actor, record.destination) > 0.5
      ) {
        actor.activity = 'flee';
        target = record.destination;
        speed = actor.kind === 'bird' ? 4.2 : 3.4;
      } else if (!faunaActive(actor.kind, time) || (actor.kind === 'wolf' && time.daylight > 0.7))
        actor.activity = 'sleep';
      else if (
        observer &&
        (observer.ward || !actor.dangerous) &&
        range < (actor.kind === 'bird' ? 4.8 : 3.8)
      ) {
        const angle =
          range < 0.01
            ? (actor.seed % 628) / 100
            : Math.atan2(actor.y - observer.y, actor.x - observer.x);
        target = { x: actor.x + Math.cos(angle) * 5, y: actor.y + Math.sin(angle) * 5 };
        actor.activity = 'flee';
        speed = actor.kind === 'bird' ? 4.2 : 3.4;
      } else if (observer && actor.dangerous && range < (actor.kind === 'wolf' ? 9 : 3.2)) {
        // Pursuit is measured from the animal's current position, never its birth tile.
        actor.targetId = observer.id;
        actor.activity = phase < 3.5 ? 'stalk' : 'lunge';
        target = observer;
        speed = actor.activity === 'lunge' ? 4.4 : 1.6;
      } else if (observer && actor.kind === 'grazer' && range < 6 && !observer.moving)
        actor.activity = 'curious';
      else {
        const episode = Math.floor(time.elapsedSeconds / 28),
          rng = random(deriveSeed(actor.seed, `journey:${episode}`));
        if ((time.elapsedSeconds + (actor.seed % 24)) % 24 > 18) actor.activity = 'idle';
        else {
          actor.activity = actor.kind === 'bird' ? 'fly' : 'forage';
          target = record.destination ?? {
            x: actor.x + (rng() - 0.5) * 12,
            y: actor.y + (rng() - 0.5) * 12,
          };
          if (distance(actor, target) < 0.4)
            target = { x: actor.x + (rng() - 0.5) * 12, y: actor.y + (rng() - 0.5) * 12 };
        }
      }
      if (target && dt > 0) {
        const d = distance(actor, target),
          amount = Math.min(d, speed * dt),
          heading = Math.atan2(target.y - actor.y, target.x - actor.x);
        const end = {
          x: actor.x + Math.cos(heading) * amount,
          y: actor.y + Math.sin(heading) * amount,
        };
        const navigation = actor.kind === 'bird' ? flightNavigation : groundNavigation;
        let moved = 0;
        const steps = Math.max(1, Math.ceil(amount / 0.2));
        const startX = actor.x,
          startY = actor.y;
        for (let i = 1; i <= steps; i++) {
          const x = startX + ((end.x - startX) * i) / steps;
          const y = startY + ((end.y - startY) * i) / steps;
          if (navigation.cell(Math.round(x), Math.round(y)).kind === 'blocked') break;
          moved += Math.hypot(actor.x - x, actor.y - y);
          actor.x = x;
          actor.y = y;
        }
        actor.heading = heading;
        actor.phase += moved * 2.5;
        this.ledger.setDestination(actor.id, { ...target, spaceId: 'surface' });
      } else if (actor.activity === 'sleep' || actor.activity === 'curious')
        this.ledger.setDestination(actor.id);
      this.ledger.update(actor, Math.max(time.elapsedSeconds, record.simulatedAt));
      if (faunaActive(actor.kind, time)) {
        if (Math.floor(time.elapsedSeconds + (actor.seed % 31)) % 19 === 0)
          actor.call =
            actor.kind === 'bird'
              ? 'bird'
              : actor.kind === 'wolf'
                ? 'growl'
                : actor.kind === 'grazer'
                  ? 'bleat'
                  : 'rustle';
        frames.push(actor);
      }
    }
    this.ledger.advance(time.elapsedSeconds, () => groundNavigation, {
      active: new Set(selected.map((r) => r.id)),
    });
    return { version: 1, elapsedSeconds: time.elapsedSeconds, actors: frames };
  }
  private faunaNavigation(
    world: FaunaWorld,
    removed: ReadonlySet<string>,
    bird: boolean,
  ): NavigationWorld {
    return {
      cell: (x, y) => {
        const tile = world.tile(x, y);
        // An open building floor is traversable; a real wall/closed door is not.
        const blocked =
          bird && ['water', 'ice'].includes(tile.terrain) ? false : world.blocked(x, y, removed);
        return { kind: blocked ? 'blocked' : 'open' };
      },
    };
  }
  private spawn(
    world: FaunaWorld,
    cx: number,
    cy: number,
    removed: ReadonlySet<string>,
  ): FaunaActor[] {
    const seed = deriveSeed(world.seed, `ecology:1:${cx}:${cy}`),
      rng = random(seed);
    const home = {
      x: cx * FAUNA_CELL_TILES + 2 + rng() * 8,
      y: cy * FAUNA_CELL_TILES + 2 + rng() * 8,
    };
    const tile = world.tile(home.x, home.y);
    if (!dry(tile) || world.blocked(home.x, home.y, removed)) return [];
    const roll = rng(),
      kind: FaunaKind =
        roll < 0.4 ? 'bird' : roll < 0.75 ? 'grazer' : roll < 0.89 ? 'boar' : 'wolf';
    if (!faunaHabitat(tile.biome, kind)) return [];
    const count = kind === 'bird' ? 3 : kind === 'grazer' ? 2 : 1;
    return Array.from({ length: count }, (_, index) => {
      const s = deriveSeed(seed, `member:${index}`);
      const cold = ['frostwood', 'tundra', 'alpine', 'highlands'].includes(tile.biome);
      const names = {
        bird: cold ? 'Frost finch' : 'Reed finch',
        grazer: cold ? 'Slope grazer' : 'Meadow grazer',
        boar: 'Reed boar',
        wolf: cold ? 'Ash wolf' : 'Wood wolf',
      };
      return {
        id: `fauna:1:${cx}:${cy}:${index}`,
        seed: s,
        kind,
        name: names[kind],
        group: `${cx}:${cy}`,
        home,
        ...home,
        heading: 0,
        activity: 'idle' as const,
        phase: 0,
        scale: 0.8 + (s % 30) / 100,
        color:
          kind === 'bird'
            ? cold
              ? '#b9d2d0'
              : '#d2bb7e'
            : kind === 'grazer'
              ? cold
                ? '#c5c4b5'
                : '#b89976'
              : kind === 'boar'
                ? '#77695d'
                : '#89969b',
        dangerous: kind === 'wolf' || kind === 'boar',
        call: null,
      };
    });
  }
  private actor(
    world: FaunaWorld,
    source: FaunaActor,
    time: WorldTimeSignal,
    observers: LivingObserver[],
    removed: ReadonlySet<string>,
  ): FaunaActor {
    const t = time.elapsedSeconds,
      phase = t * (source.kind === 'bird' ? 2.4 : 1.5) + (source.seed % 101),
      groupPhase = (deriveSeed(world.seed, source.group) % 1000) / 100;
    const localForageTime = t + (source.seed % 24),
      idle = localForageTime % 24 >= 18;
    const forageTime = Math.floor(localForageTime / 24) * 18 + Math.min(18, localForageTime % 24);
    const orbit =
      (source.kind === 'bird' ? t : forageTime) * (source.kind === 'bird' ? 0.18 : 0.04) +
      groupPhase;
    const spacing = (source.seed % 628) / 100;
    const wandering = {
      x: source.home.x + Math.cos(orbit) * 1.6 + Math.cos(spacing) * 0.7,
      y: source.home.y + Math.sin(orbit * 0.83) * 1.4 + Math.sin(spacing) * 0.7,
    };
    let point = reachable(world, source.home, wandering, source.kind === 'bird', removed);
    let activity: FaunaActivity = source.kind === 'bird' ? 'fly' : idle ? 'idle' : 'forage';
    let target: LivingObserver | undefined;
    const nearest = [...observers].sort(
      (a, b) => distance(a, point) - distance(b, point) || a.id.localeCompare(b.id),
    )[0];
    const range = nearest ? distance(nearest, point) : Infinity;
    const nearTile = nearest ? world.tile(nearest.x, nearest.y) : undefined;
    if (source.kind === 'wolf' && time.daylight > 0.7) {
      activity = 'sleep';
      point = source.home;
    } else if (nearest && source.dangerous && nearest.ward && range < 4) {
      point = reachable(world, source.home, source.home, false, removed);
      activity = 'flee';
    } else if (
      nearest &&
      source.dangerous &&
      !nearTile?.building &&
      range < (source.kind === 'wolf' ? 7 : 2.4) &&
      distance(nearest, source.home) < 9
    ) {
      target = nearest;
      const cycle = (t + (source.seed % 5)) % FAUNA_ATTACK_PERIOD;
      activity = cycle < 3.5 ? 'stalk' : 'lunge';
      const chase = source.kind === 'wolf' ? 0.72 : 0.63;
      const lunge = Math.sin(Math.PI * clamp((cycle - 3.3) / 1.7)) ** 2;
      point = reachable(
        world,
        source.home,
        lerp(point, nearest, chase + (1 - chase) * lunge),
        false,
        removed,
      );
    } else if (nearest && !source.dangerous && range < (source.kind === 'bird' ? 4.8 : 3.8)) {
      const d = Math.max(0.001, range),
        fear = clamp(1 - range / (source.kind === 'bird' ? 4.8 : 3.8));
      const away = {
        x: point.x + ((point.x - nearest.x) / d) * fear * 4,
        y: point.y + ((point.y - nearest.y) / d) * fear * 4,
      };
      point = reachable(world, point, away, source.kind === 'bird', removed);
      activity = 'flee';
    } else if (nearest && source.kind === 'grazer' && range < 6 && !nearest.moving) {
      activity = 'curious';
    }
    const heading = target
      ? Math.atan2(target.y - point.y, target.x - point.x)
      : Math.atan2(Math.cos(orbit * 0.83), -Math.sin(orbit));
    const call: FaunaActor['call'] =
      Math.floor(t + (source.seed % 31)) % 19 === 0
        ? source.kind === 'bird'
          ? 'bird'
          : source.kind === 'wolf'
            ? 'growl'
            : source.kind === 'grazer'
              ? 'bleat'
              : 'rustle'
        : null;
    return {
      ...source,
      ...point,
      heading,
      activity,
      phase,
      call,
      ...(target ? { targetId: target.id } : {}),
    };
  }
}
/** Authority/local solo may apply at most one bite per actor per five-second cycle. */
export function faunaContacts(frame: FaunaFrame, observers: readonly LivingObserver[]) {
  return frame.actors
    .filter((a) => a.activity === 'lunge' && a.targetId)
    .flatMap((a) => {
      const target = observers.find((p) => p.id === a.targetId);
      return target && distance(a, target) < 0.85
        ? [
            {
              actorId: a.id,
              targetId: target.id,
              damage: a.kind === 'wolf' ? 5 : 3,
              strikeId: `${a.id}:${Math.floor((frame.elapsedSeconds + (a.seed % 5)) / FAUNA_ATTACK_PERIOD)}`,
            },
          ]
        : [];
    });
}
export function validFaunaFrame(value: unknown): value is FaunaFrame {
  if (!value || typeof value !== 'object') return false;
  const v = value as FaunaFrame;
  return (
    v.version === 1 &&
    Number.isFinite(v.elapsedSeconds) &&
    v.elapsedSeconds >= 0 &&
    Array.isArray(v.actors) &&
    v.actors.length <= FAUNA_MAX_ACTORS &&
    v.actors.every(
      (a) =>
        !!a &&
        typeof a.id === 'string' &&
        a.id.length < 100 &&
        Number.isInteger(a.seed) &&
        ['bird', 'grazer', 'boar', 'wolf'].includes(a.kind) &&
        typeof a.name === 'string' &&
        a.name.length < 60 &&
        typeof a.group === 'string' &&
        a.group.length < 60 &&
        ['sleep', 'forage', 'idle', 'fly', 'flee', 'curious', 'stalk', 'lunge'].includes(
          a.activity,
        ) &&
        typeof a.dangerous === 'boolean' &&
        ['x', 'y', 'heading', 'phase', 'scale'].every((k) =>
          Number.isFinite(a[k as keyof FaunaActor]),
        ) &&
        a.scale >= 0.5 &&
        a.scale <= 2 &&
        !!a.home &&
        Number.isFinite(a.home.x) &&
        Number.isFinite(a.home.y) &&
        typeof a.color === 'string' &&
        /^#[0-9a-f]{6}$/i.test(a.color) &&
        (a.targetId === undefined ||
          (typeof a.targetId === 'string' && a.targetId.length <= 160)) &&
        (a.call === null || ['bird', 'bleat', 'rustle', 'growl'].includes(a.call)),
    ) &&
    new Set(v.actors.map((a) => a.id)).size === v.actors.length
  );
}
function validFaunaActor(value: unknown): value is FaunaActor {
  return validFaunaFrame({ version: 1, elapsedSeconds: 0, actors: [value] });
}
export function validFaunaLedger(value: unknown): value is ActorLedgerSave<FaunaActor> {
  return validActorLedgerSave(value, validFaunaActor);
}
