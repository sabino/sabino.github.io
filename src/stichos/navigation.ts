import type { Input, Point } from './types.ts';

/** World tiles, never receiver pixels. Navigation is an input aid, not movement authority. */
export const NAVIGATION_RULES = Object.freeze({
  sectorSize: 16,
  maxSectors: 128,
  workPerTick: 96,
  maxWorkPerTick: 512,
  arrival: 0.18,
  maxReplans: 3,
  crowdRadius: 0.55,
});
export interface NavigationCell {
  kind: 'open' | 'blocked' | 'door';
  id?: string;
  /** Only a permitted door belongs in a route. The actor must open it through normal authority. */
  allowed?: boolean;
  open?: boolean;
}
export interface NavigationWorld {
  cell(x: number, y: number): NavigationCell;
}
export type NavigationStatus = 'idle' | 'planning' | 'ready' | 'unreachable' | 'budget-exceeded';
export interface NavigationPortal extends Point {
  from: string;
  to: string;
}
interface Sector {
  key: string;
  x: number;
  y: number;
  labels: Uint16Array;
  free: Uint8Array;
  ready: boolean;
}
interface SearchNode {
  key: string;
  sector: Sector;
  component: number;
  entry: Point;
  cost: number;
  estimate: number;
  serial: number;
  parent?: SearchNode;
  exit?: Point;
}
const SIZE = NAVIGATION_RULES.sectorSize;
const AREA = SIZE * SIZE;
const offsets = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
const point = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
const finitePoint = (p: Point) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e8 && Math.abs(p.y) < 1e8;
const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const passable = (cell: NavigationCell) =>
  cell.kind === 'open' || (cell.kind === 'door' && cell.allowed === true);
const sectorKey = (x: number, y: number) => `${Math.floor(x / SIZE)},${Math.floor(y / SIZE)}`;
const index = (s: Sector, p: Point) => (p.y - s.y) * SIZE + p.x - s.x;
const at = (s: Sector, id: number): Point => ({
  x: s.x + (id % SIZE),
  y: s.y + Math.floor(id / SIZE),
});

/**
 * Two-level search: connected regions in 16-tile sectors, joined by actual walkable
 * boundary portals; then exact cardinal paths inside those regions. Unlike a sparse
 * waypoint graph, a one-tile gate cannot be missed. Work includes collision probes,
 * floodfill, portal scans and route reconstruction. No complete floodfill runs in a tick.
 * Routes are deterministic and valid, but are not promised globally shortest.
 */
export class HierarchicalNavigator {
  status: NavigationStatus = 'idle';
  route: Point[] = [];
  portals: NavigationPortal[] = [];
  readonly diagnostics = { work: 0, probes: 0, sectors: 0, peakFrontier: 0, ticks: 0 };
  private sectors = new Map<string, Sector>();
  private job?: Generator<void, void, void>;
  private origin: Point = { x: 0, y: 0 };
  private target: Point = { x: 0, y: 0 };

  private readonly world: NavigationWorld;
  constructor(world: NavigationWorld) {
    this.world = world;
  }

  request(origin: Point, destination: Point) {
    this.route = [];
    this.portals = [];
    this.sectors.clear();
    Object.assign(this.diagnostics, { work: 0, probes: 0, sectors: 0, peakFrontier: 0, ticks: 0 });
    this.job = undefined;
    if (!finitePoint(origin) || !finitePoint(destination)) {
      this.status = 'unreachable';
      return;
    }
    this.origin = point(origin);
    this.target = point(destination);
    this.status = 'planning';
    this.job = this.search();
  }

  step(budget: number = NAVIGATION_RULES.workPerTick): NavigationStatus {
    if (this.status !== 'planning' || !this.job) return this.status;
    const count = Number.isFinite(budget)
      ? Math.max(1, Math.min(NAVIGATION_RULES.maxWorkPerTick, Math.floor(budget)))
      : NAVIGATION_RULES.workPerTick;
    this.diagnostics.ticks++;
    for (let n = 0; n < count && this.status === 'planning'; n++) {
      this.diagnostics.work++;
      if (this.job.next().done) {
        if (this.status === 'planning') this.status = 'unreachable';
        this.job = undefined;
        break;
      }
    }
    return this.status;
  }

  private *sector(p: Point): Generator<void, Sector | undefined, void> {
    const key = sectorKey(p.x, p.y);
    const cached = this.sectors.get(key);
    if (cached) return cached;
    if (this.sectors.size >= NAVIGATION_RULES.maxSectors) {
      this.status = 'budget-exceeded';
      return undefined;
    }
    const s: Sector = {
      key,
      x: Math.floor(p.x / SIZE) * SIZE,
      y: Math.floor(p.y / SIZE) * SIZE,
      labels: new Uint16Array(AREA),
      free: new Uint8Array(AREA),
      ready: false,
    };
    this.sectors.set(key, s);
    this.diagnostics.sectors = this.sectors.size;
    for (let id = 0; id < AREA; id++) {
      const cell = at(s, id);
      s.free[id] = passable(this.world.cell(cell.x, cell.y)) ? 1 : 0;
      this.diagnostics.probes++;
      yield;
    }
    // A blocked starting cell is allowed only as the root, e.g. a door closed behind a player.
    if (sectorKey(this.origin.x, this.origin.y) === key) s.free[index(s, this.origin)] = 1;
    let label = 0;
    const queue = new Uint16Array(AREA);
    for (let id = 0; id < AREA; id++) {
      yield;
      if (!s.free[id] || s.labels[id]) continue;
      label++;
      let read = 0,
        write = 1;
      queue[0] = id;
      s.labels[id] = label;
      while (read < write) {
        const current = queue[read++],
          x = current % SIZE,
          y = Math.floor(current / SIZE);
        for (const [dx, dy] of offsets) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * SIZE + nx;
          if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && s.free[next] && !s.labels[next]) {
            s.labels[next] = label;
            queue[write++] = next;
          }
        }
        yield;
      }
    }
    s.ready = true;
    return s;
  }

  private *search(): Generator<void, void, void> {
    const start = yield* this.sector(this.origin);
    if (!start) return;
    const startLabel = start.labels[index(start, this.origin)];
    if (!startLabel) return;
    let serial = 0;
    const root: SearchNode = {
      key: `${start.key}:${startLabel}`,
      sector: start,
      component: startLabel,
      entry: this.origin,
      cost: 0,
      estimate: manhattan(this.origin, this.target),
      serial: serial++,
    };
    const frontier = [root];
    const best = new Map<string, number>([[root.key, 0]]);
    const closed = new Set<string>();
    while (frontier.length && this.status === 'planning') {
      // Frontier is sector components, bounded by 128 sectors, not thousands of tiles.
      let chosen = 0;
      for (let i = 1; i < frontier.length; i++) {
        const a = frontier[i],
          b = frontier[chosen];
        if (
          a.cost + a.estimate < b.cost + b.estimate ||
          (a.cost + a.estimate === b.cost + b.estimate &&
            (a.estimate < b.estimate || (a.estimate === b.estimate && a.serial < b.serial)))
        )
          chosen = i;
        yield;
      }
      const node = frontier.splice(chosen, 1)[0];
      if (closed.has(node.key) || node.cost !== best.get(node.key)) continue;
      closed.add(node.key);
      const s = node.sector;
      if (
        sectorKey(this.target.x, this.target.y) === s.key &&
        s.labels[index(s, this.target)] === node.component
      ) {
        yield* this.reconstruct(node);
        if (this.status === 'planning') this.status = 'ready';
        return;
      }
      // Nearest direction first reduces cold generation along long inter-town routes.
      const directions = [...offsets].sort(
        ([ax, ay], [bx, by]) =>
          manhattan({ x: node.entry.x + ax * SIZE, y: node.entry.y + ay * SIZE }, this.target) -
          manhattan({ x: node.entry.x + bx * SIZE, y: node.entry.y + by * SIZE }, this.target),
      );
      for (const [dx, dy] of directions) {
        // Read all apertures; choose the best crossing into each neighboring component.
        const crossings: Point[] = [];
        for (let t = 0; t < SIZE; t++) {
          const exit = {
            x: s.x + (dx > 0 ? SIZE - 1 : dx < 0 ? 0 : t),
            y: s.y + (dy > 0 ? SIZE - 1 : dy < 0 ? 0 : t),
          };
          if (s.labels[index(s, exit)] === node.component) crossings.push(exit);
          yield;
        }
        if (!crossings.length) continue;
        const neighbor = yield* this.sector({ x: s.x + dx * SIZE, y: s.y + dy * SIZE });
        if (!neighbor) return;
        const candidates = new Map<number, { entry: Point; exit: Point; score: number }>();
        for (const exit of crossings) {
          const entry = { x: exit.x + dx, y: exit.y + dy },
            component = neighbor.labels[index(neighbor, entry)];
          if (component) {
            const score = manhattan(node.entry, exit) + manhattan(entry, this.target);
            if (!candidates.has(component) || candidates.get(component)!.score > score)
              candidates.set(component, { entry, exit, score });
          }
          yield;
        }
        for (const [component, crossing] of candidates) {
          const key = `${neighbor.key}:${component}`,
            cost = node.cost + manhattan(node.entry, crossing.exit) + 1;
          if (!closed.has(key) && cost < (best.get(key) ?? Infinity)) {
            best.set(key, cost);
            frontier.push({
              key,
              sector: neighbor,
              component,
              entry: crossing.entry,
              exit: crossing.exit,
              cost,
              estimate: manhattan(crossing.entry, this.target),
              serial: serial++,
              parent: node,
            });
            this.diagnostics.peakFrontier = Math.max(
              this.diagnostics.peakFrontier,
              frontier.length,
            );
          }
          yield;
        }
      }
    }
  }

  private *reconstruct(last: SearchNode): Generator<void, void, void> {
    const chain: SearchNode[] = [];
    for (let n: SearchNode | undefined = last; n; n = n.parent) {
      chain.push(n);
      yield;
    }
    chain.reverse();
    for (let c = 0; c < chain.length; c++) {
      const node = chain[c],
        s = node.sector,
        end = chain[c + 1]?.exit ?? this.target;
      const startId = index(s, node.entry),
        endId = index(s, end),
        parents = new Int16Array(AREA).fill(-1),
        queue = new Uint16Array(AREA);
      let read = 0,
        write = 1;
      queue[0] = startId;
      parents[startId] = startId;
      while (read < write && parents[endId] < 0) {
        const id = queue[read++],
          x = id % SIZE,
          y = Math.floor(id / SIZE);
        for (const [dx, dy] of offsets) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * SIZE + nx;
          if (
            nx >= 0 &&
            nx < SIZE &&
            ny >= 0 &&
            ny < SIZE &&
            s.labels[next] === node.component &&
            parents[next] < 0
          ) {
            parents[next] = id;
            queue[write++] = next;
          }
        }
        yield;
      }
      if (parents[endId] < 0) {
        this.status = 'unreachable';
        this.route = [];
        return;
      }
      const leg: Point[] = [];
      for (let id = endId; id !== startId; id = parents[id]) {
        leg.push(at(s, id));
        yield;
      }
      leg.reverse();
      this.route.push(...leg);
      if (chain[c + 1]) {
        const next = chain[c + 1];
        this.route.push({ ...next.entry });
        this.portals.push({ ...next.entry, from: node.sector.key, to: next.sector.key });
      }
    }
  }
}

export type TravelCancelReason =
  | 'manual'
  | 'stop'
  | 'obstruction'
  | 'danger'
  | 'menu'
  | 'dialogue'
  | 'death'
  | 'background'
  | 'interaction'
  | 'world-change';
export type TravelState =
  | 'idle'
  | 'locked'
  | 'planning'
  | 'walking'
  | 'door'
  | 'arrived'
  | 'unreachable';
export interface TravelFeedback {
  state: TravelState;
  label: string;
  target?: Point;
  remaining: number;
  reason?: string;
  run: boolean;
}
export interface TravelUpdate {
  position: Point;
  dt: number;
  /** Actual world speed including the current run modifier. Keeps delayed frames from overshooting. */
  speed?: number;
  manual: Input;
  paused?: TravelCancelReason;
  danger?: boolean;
  /** The existing collision mover can report a rejected previous stride immediately. */
  obstructed?: boolean;
  /** Actor positions only; collision/door permissions still come from the world adapter. */
  crowd?: readonly Point[];
}
export interface TravelInput extends Input {
  doorId?: string;
}
const stopped = (): TravelInput => ({ x: 0, y: 0, run: false });

/** Outputs the same normalized input consumed by ordinary movement/network pose authority. */
export class TravelController {
  readonly navigation: HierarchicalNavigator;
  feedback: TravelFeedback = { state: 'idle', label: 'Travel stopped', remaining: 0, run: false };
  stopForCombat = true;
  private direction: Point = { x: 0, y: 0 };
  private cursor = 0;
  private replans = 0;
  private stationary = 0;
  private previous?: Point;
  private doorWait = 0;
  private doorRequested?: string;

  private readonly world: NavigationWorld;
  constructor(world: NavigationWorld) {
    this.world = world;
    this.navigation = new HierarchicalNavigator(world);
  }
  lock(direction: Point, run = false): boolean {
    if (!finitePoint(direction) || Math.hypot(direction.x, direction.y) < 0.1) return false;
    const length = Math.hypot(direction.x, direction.y);
    this.direction = { x: direction.x / length, y: direction.y / length };
    this.feedback = {
      state: 'locked',
      label: run ? 'Run locked · Stop to cancel' : 'Walk locked · Stop to cancel',
      remaining: 0,
      run,
    };
    this.previous = undefined;
    this.stationary = 0;
    return true;
  }
  travel(origin: Point, target: Point, options: { label?: string; run?: boolean } = {}) {
    this.feedback = {
      state: 'planning',
      label: options.label ?? 'Destination',
      target: point(target),
      remaining: distance(origin, target),
      run: options.run ?? false,
    };
    this.replans = 0;
    this.begin(origin);
  }
  cancel(reason: TravelCancelReason = 'stop') {
    this.feedback = { state: 'idle', label: 'Travel stopped', remaining: 0, reason, run: false };
    this.previous = undefined;
    this.doorRequested = undefined;
  }
  get active() {
    return ['locked', 'planning', 'walking', 'door'].includes(this.feedback.state);
  }
  /** Change pace without replanning, losing a destination, or starting movement. */
  setRun(run: boolean) {
    this.feedback.run = run;
    if (this.feedback.state === 'locked')
      this.feedback.label = run ? 'Run locked · Stop to cancel' : 'Walk locked · Stop to cancel';
  }
  get route(): readonly Point[] {
    return this.navigation.route.slice(this.cursor);
  }
  private begin(origin: Point) {
    this.navigation.request(origin, this.feedback.target!);
    this.feedback.state = 'planning';
    this.cursor = 0;
    this.stationary = 0;
    this.previous = undefined;
    this.doorRequested = undefined;
    this.doorWait = 0;
  }
  private replan(origin: Point, reason: string) {
    if (!this.feedback.target || this.replans++ >= NAVIGATION_RULES.maxReplans) {
      this.feedback.state = 'unreachable';
      this.feedback.reason = reason;
      return;
    }
    this.begin(origin);
  }
  update(input: TravelUpdate): TravelInput {
    const manual = input.manual;
    if (input.paused) {
      this.cancel(input.paused);
      return stopped();
    }
    if (Math.hypot(manual.x, manual.y) > 0.08) {
      this.cancel('manual');
      return {
        x: Math.max(-1, Math.min(1, manual.x)),
        y: Math.max(-1, Math.min(1, manual.y)),
        run: !!manual.run,
      };
    }
    if (input.danger && this.stopForCombat && this.active) {
      this.cancel('danger');
      return stopped();
    }
    if (input.obstructed && this.active) {
      if (this.feedback.state === 'locked') this.cancel('obstruction');
      else this.replan(input.position, 'Movement is obstructed.');
      return stopped();
    }
    if (!this.active || !finitePoint(input.position)) return stopped();
    const dt = Number.isFinite(input.dt) ? Math.max(0, Math.min(0.25, input.dt)) : 0;
    if (this.feedback.state === 'planning') {
      const status = this.navigation.step();
      if (status === 'ready') this.feedback.state = 'walking';
      else if (status !== 'planning') {
        this.feedback.state = 'unreachable';
        this.feedback.reason =
          status === 'budget-exceeded'
            ? 'Route exceeds the current planning budget. Choose a nearer waypoint.'
            : 'No permitted route found.';
      }
      return stopped();
    }
    let next: Point;
    if (this.feedback.state === 'locked')
      next = {
        x: input.position.x + this.direction.x * 0.55,
        y: input.position.y + this.direction.y * 0.55,
      };
    else {
      while (
        this.cursor < this.navigation.route.length &&
        distance(input.position, this.navigation.route[this.cursor]) < NAVIGATION_RULES.arrival
      )
        this.cursor++;
      if (this.cursor >= this.navigation.route.length) {
        this.feedback.state = 'arrived';
        this.feedback.remaining = 0;
        return stopped();
      }
      next = this.navigation.route[this.cursor];
      this.feedback.remaining = this.navigation.route.length - this.cursor;
    }
    const dx = next.x - input.position.x,
      dy = next.y - input.position.y,
      length = Math.hypot(dx, dy);
    const probe = {
      x: input.position.x + (dx / Math.max(0.001, length)) * Math.min(0.55, length),
      y: input.position.y + (dy / Math.max(0.001, length)) * Math.min(0.55, length),
    };
    const cell = this.world.cell(Math.round(probe.x), Math.round(probe.y));
    if (!passable(cell)) {
      if (this.feedback.state === 'locked') this.cancel('obstruction');
      else this.replan(input.position, 'The route is obstructed or access changed.');
      return stopped();
    }
    if (cell.kind === 'door' && !cell.open) {
      if (this.feedback.state === 'locked') {
        this.cancel('obstruction');
        return stopped();
      }
      this.feedback.state = 'door';
      this.doorWait += dt;
      if (!cell.id || this.doorWait > 3) {
        this.replan(input.position, 'The door could not be opened.');
        return stopped();
      }
      if (this.doorRequested !== cell.id) {
        this.doorRequested = cell.id;
        return { ...stopped(), doorId: cell.id };
      }
      return stopped();
    }
    if (this.feedback.state === 'door') {
      this.feedback.state = 'walking';
      this.doorRequested = undefined;
      this.doorWait = 0;
    }
    const occupied = input.crowd?.some(
      (p) =>
        distance(p, input.position) > 0.05 && distance(p, probe) < NAVIGATION_RULES.crowdRadius,
    );
    this.stationary =
      this.previous && distance(input.position, this.previous) < 0.003 ? this.stationary + dt : 0;
    this.previous = { ...input.position };
    if (this.stationary > 0.7) {
      if (this.feedback.state === 'locked') this.cancel('obstruction');
      else
        this.replan(
          input.position,
          occupied ? 'The passage remains crowded.' : 'Movement is blocked.',
        );
      return stopped();
    }
    if (occupied) return stopped();
    return {
      x:
        (dx / Math.max(0.001, length)) *
        Math.min(1, length / Math.max(0.001, (input.speed ?? 3) * dt)),
      y:
        (dy / Math.max(0.001, length)) *
        Math.min(1, length / Math.max(0.001, (input.speed ?? 3) * dt)),
      run: this.feedback.run,
    };
  }
}
