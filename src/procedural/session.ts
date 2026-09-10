import { generateSpecies } from './compose.ts';
import { deriveSeed, clamp } from './random.ts';
import { generateWorld, tileAt } from './world.ts';
import type { WorldPlan } from './world.ts';
import type { SpeciesGenome, V3 } from './schema.ts';

export interface Actor {
  id: string;
  genome: SpeciesGenome;
  position: V3;
  heading: number;
  phase: number;
  speed: number;
  hp: number;
  maxHp: number;
  vy: number;
  grounded: boolean;
  scanned: boolean;
  following: boolean;
  slow: number;
  burn: number;
  cooldown: number;
  home: V3;
}
export interface Bolt {
  position: V3;
  velocity: V3;
  life: number;
  core: string;
  power: number;
  damage: number;
}
export interface Burst {
  position: V3;
  life: number;
  core: string;
  radius: number;
}
export interface Intent {
  x: number;
  z: number;
  run: boolean;
  aim: number;
}
export class Crossing {
  world: WorldPlan;
  player: Actor;
  actors: Actor[];
  bolts: Bolt[] = [];
  bursts: Burst[] = [];
  time = 0;
  vessel = 0;
  crossing: number;
  rootSeed: number;
  actionSeed: number;
  integrity = 100;
  attunement = 0;
  scanned: string[] = [];
  phase: 'playing' | 'dead' | 'complete' = 'playing';
  message = 'A borrowed body. An unfamiliar ecology.';
  recovered = false;
  belongings: V3 | null = null;
  belongingsAmount = 0;
  memories = 2;
  kills = 0;
  private routes = new WeakMap<Actor, { goal: string; points: V3[] }>();
  constructor(seed: number, crossing = 0, rootSeed = seed) {
    this.rootSeed = rootSeed;
    this.crossing = crossing;
    this.actionSeed = seed;
    this.world = generateWorld(seed, crossing);
    this.player = this.makeHost();
    this.actors = this.world.placements.map(({ species, position }, i) =>
      this.makeActor(this.world.species[species], position, `life-${i}`),
    );
  }
  private makeActor(genome: SpeciesGenome, position: V3, id: string): Actor {
    const hp = Math.round(45 + genome.mass * 18);
    return {
      id,
      genome,
      position: { ...position },
      home: { ...position },
      heading: 0,
      phase: 0,
      speed: 0,
      hp,
      maxHp: hp,
      vy: 0,
      grounded: true,
      scanned: false,
      following: false,
      slow: 0,
      burn: 0,
      cooldown: 0,
    };
  }
  private makeHost() {
    return this.makeActor(
      generateSpecies(deriveSeed(this.world.seed, 'host', this.vessel), this.world.laws),
      this.world.spawn,
      'host',
    );
  }
  restoreVessel(index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 10000)
      throw new RangeError('Invalid vessel index');
    this.vessel = index;
    this.player = this.makeHost();
  }
  record(action: string) {
    this.actionSeed = deriveSeed(this.actionSeed, 'input', action);
  }
  get target() {
    return this.actors.find((a) => a.genome.id === this.world.mission.target)!;
  }
  get ready() {
    const m = this.world.mission;
    return m.kind === 'survey'
      ? this.scanned.length >= m.required
      : m.kind === 'escort'
        ? this.target.following && distance(this.target.position, this.world.gate) < 2.2
        : m.kind === 'attune'
          ? this.attunement >= 1
          : this.target.hp <= 0;
  }
  get nearby() {
    return this.actors
      .filter((a) => distance(a.position, this.player.position) < 1.7)
      .sort(
        (a, b) =>
          distance(a.position, this.player.position) - distance(b.position, this.player.position),
      )[0];
  }
  interact() {
    if (this.phase !== 'playing') return;
    this.record('interact');
    if (distance(this.player.position, this.world.gate) < 1.6 && this.ready) {
      this.phase = 'complete';
      this.message = 'Assignment returned. The next world remembers your actions.';
      return;
    }
    if (this.belongings && distance(this.player.position, this.belongings) < 1.5) {
      this.memories += this.belongingsAmount;
      this.belongingsAmount = 0;
      this.belongings = null;
      this.message = 'The previous vessel’s memories are yours again.';
      return;
    }
    const actor = this.nearby;
    if (!actor) {
      this.message = this.ready
        ? 'Return to the rift.'
        : 'Approach a lifeform to read its anatomy.';
      return;
    }
    actor.scanned = true;
    if (!this.scanned.includes(actor.genome.id)) {
      this.scanned.push(actor.genome.id);
      this.memories++;
    }
    if (this.world.mission.kind === 'escort' && actor === this.target && actor.hp > 0) {
      actor.following = true;
      this.message = `${actor.genome.name} has accepted the link. Its ${actor.genome.locomotion} gait will set the pace.`;
    } else this.message = `${actor.genome.name}: ${actor.genome.explanation}`;
    this.bursts.push({
      position: { ...actor.position },
      life: 0.7,
      core: actor.genome.affinity,
      radius: 1,
    });
  }
  jump() {
    if (this.phase !== 'playing' || !this.player.grounded) return;
    this.record('jump');
    if (this.player.genome.jump <= 0) {
      this.message = 'This anatomy cannot jump. Its other movement traits still apply.';
      return;
    }
    this.player.vy = this.player.genome.jump;
    this.player.grounded = false;
  }
  heal() {
    if (this.memories <= 0 || this.phase !== 'playing') return;
    this.record('mend');
    this.memories--;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
    this.message = 'A memory becomes living tissue.';
  }
  attack() {
    if (this.phase !== 'playing' || this.player.cooldown > 0) return;
    this.record('attack');
    const w = this.world.weapon,
      p = this.player;
    p.cooldown = w.recovery;
    if (w.trigger === 'projectile') {
      const speed = Math.max(3, w.projectileSpeed);
      this.bolts.push({
        position: { x: p.position.x, y: p.position.y + 0.6, z: p.position.z },
        velocity: { x: Math.cos(p.heading) * speed, y: 0, z: Math.sin(p.heading) * speed },
        life: w.reach / speed,
        core: w.core,
        power: w.power,
        damage: w.damage,
      });
    } else {
      const radius = w.trigger === 'field' ? Math.max(1.8, w.reach) : w.reach;
      this.bursts.push({ position: { ...p.position }, life: 0.45, core: w.core, radius });
      for (const a of this.actors) {
        const angle =
          Math.atan2(a.position.z - p.position.z, a.position.x - p.position.x) - p.heading;
        if (
          distance(a.position, p.position) <= radius &&
          (w.trigger === 'field' || Math.cos(angle) > 0.25)
        )
          this.affect(a, w.core, w.damage, w.power);
      }
      if (distance(p.position, this.world.resonator) < radius + 1) this.attune(w.core, w.power);
    }
    this.message = `${w.name}: ${w.core} through ${w.trigger}.`;
  }
  private attune(core: string, power: number) {
    if (core === this.world.weapon.core) {
      this.attunement = clamp(this.attunement + power * 0.4, 0, 1);
      if (this.attunement >= 1) this.message = 'The lattice has changed state. Return to the rift.';
    }
  }
  private affect(a: Actor, core: string, damage: number, power: number) {
    if (a.hp <= 0) return;
    if (core === 'growth') {
      a.hp = Math.min(a.maxHp, a.hp + damage);
      a.following = a === this.target || a.following;
      this.integrity = Math.min(100, this.integrity + power);
      return;
    }
    const resistance = a.genome.affinity === core ? 0.45 : 1;
    a.hp -= damage * resistance;
    if (core === 'cold') a.slow = 2 + power;
    if (core === 'heat') a.burn = 1 + power;
    if (core === 'charge' && a.genome.role === 'conductor') {
      this.attunement = clamp(this.attunement + power * 0.2, 0, 1);
      for (const other of this.actors)
        if (other !== a && other.hp > 0 && distance(other.position, a.position) < 2.5)
          other.slow = Math.max(other.slow, 1);
    }
    this.integrity = Math.max(0, this.integrity - 1);
    if (a.hp <= 0) {
      a.hp = 0;
      this.kills++;
      this.integrity = Math.max(0, this.integrity - (a.genome.role === 'pollinator' ? 12 : 7));
      this.record(`loss:${a.genome.id}`);
    }
    this.bursts.push({ position: { ...a.position }, life: 0.5, core, radius: 0.8 });
  }
  private move(a: Actor, x: number, z: number, dt: number, run = false) {
    const strength = Math.min(1, Math.hypot(x, z));
    if (strength > 0) {
      const length = Math.hypot(x, z);
      x /= length;
      z /= length;
      a.heading = Math.atan2(z, x);
    }
    let speed = a.genome.speed * strength * (run ? 1.5 : 1) * (a.slow > 0 ? 0.45 : 1);
    if (a.genome.locomotion === 'hop') speed *= 0.6 + 0.6 * Math.max(0, Math.sin(a.phase));
    const nextX = a.position.x + x * speed * dt,
      nextZ = a.position.z + z * speed * dt;
    const ground = tileAt(this.world, nextX, nextZ);
    let canMove = true;
    let climbing = false;
    if (ground && ground.height > a.position.y + 0.4) {
      if (ground.kind === 'ladder' || ground.kind === 'path') {
        a.position.y = Math.min(ground.height, a.position.y + dt * 2.8);
        canMove = a.position.y >= ground.height - 0.4;
        climbing = !canMove;
      } else canMove = false;
    }
    // Native animals avoid accidental falls; a player can deliberately walk off an edge.
    if (a !== this.player && !ground) canMove = false;
    if (canMove) {
      a.position.x = nextX;
      a.position.z = nextZ;
    } else speed = 0;
    a.speed = speed;
    a.phase += ((speed * dt) / Math.max(0.15, a.genome.gait.stride)) * Math.PI * 2;
    if (climbing) {
      a.vy = 0;
      a.grounded = false;
      return;
    }
    const beneath = tileAt(this.world, a.position.x, a.position.z);
    if (a.genome.locomotion === 'hover' && beneath) {
      a.position.y = beneath.height;
      a.vy = 0;
      a.grounded = true;
    } else {
      a.vy -= this.world.laws.gravity * dt;
      a.position.y += a.vy * dt;
      if (beneath && a.position.y <= beneath.height) {
        a.position.y = beneath.height;
        a.vy = 0;
        a.grounded = true;
      } else a.grounded = false;
    }
  }
  private followTarget(a: Actor, goal: V3): V3 {
    const destination = tileAt(this.world, goal.x, goal.z);
    const start = tileAt(this.world, a.position.x, a.position.z);
    if (!destination || !start) return a.position;
    const key = `${destination.x},${destination.z}`;
    let route = this.routes.get(a);
    if (!route || route.goal !== key) {
      const origin = `${start.x},${start.z}`;
      const parents = new Map<string, string | null>([[origin, null]]);
      const queue = [start];
      for (let i = 0; i < queue.length && !parents.has(key); i++) {
        const cell = queue[i];
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const next = tileAt(this.world, cell.x + dx, cell.z + dz);
          if (
            !next ||
            (next.height > cell.height + 0.4 && next.kind !== 'path' && next.kind !== 'ladder')
          )
            continue;
          const nextKey = `${next.x},${next.z}`;
          if (parents.has(nextKey)) continue;
          parents.set(nextKey, `${cell.x},${cell.z}`);
          queue.push(next);
        }
      }
      const points: V3[] = [];
      if (parents.has(key)) {
        let cursor: string | null = key;
        while (cursor && cursor !== origin) {
          const [x, z] = cursor.split(',').map(Number);
          points.unshift({ x, y: tileAt(this.world, x, z)!.height, z });
          cursor = parents.get(cursor) ?? null;
        }
      }
      route = { goal: key, points };
      this.routes.set(a, route);
    }
    while (route.points.length && distance(a.position, route.points[0]) < 0.14)
      route.points.shift();
    return (
      route.points[0] ??
      (start.x === destination.x && start.z === destination.z ? goal : a.position)
    );
  }
  update(dt: number, intent: Intent) {
    if (this.phase !== 'playing' || !Number.isFinite(dt)) return;
    dt = clamp(dt, 0, 0.04);
    this.time += dt;
    this.player.cooldown = Math.max(0, this.player.cooldown - dt);
    this.move(this.player, intent.x, intent.z, dt, intent.run);
    if (Number.isFinite(intent.aim)) this.player.heading = intent.aim;
    for (const a of this.actors) {
      if (a.hp <= 0) continue;
      a.slow = Math.max(0, a.slow - dt);
      a.cooldown = Math.max(0, a.cooldown - dt);
      if (a.burn > 0) {
        a.burn = Math.max(0, a.burn - dt);
        a.hp -= dt * 3;
        if (a.hp <= 0) {
          a.hp = 0;
          this.kills++;
          this.integrity = Math.max(0, this.integrity - 7);
          this.record(`loss:${a.genome.id}`);
          continue;
        }
      }
      let target = a.home;
      if (a.following) target = this.followTarget(a, this.player.position);
      else {
        const phase = this.time * 0.17 + (a.genome.seed % 100);
        target = {
          x: a.home.x + Math.cos(phase) * 1.7,
          y: a.home.y,
          z: a.home.z + Math.sin(phase * 0.83) * 1.7,
        };
      }
      const d = distance(a.position, target),
        minimum = a.following ? 0.1 : 0.35;
      const arrived = a.following && distance(a.position, this.player.position) < 1.1;
      this.move(
        a,
        !arrived && d > minimum ? target.x - a.position.x : 0,
        !arrived && d > minimum ? target.z - a.position.z : 0,
        dt,
      );
      if (
        a.genome.role === 'predator' &&
        !a.following &&
        distance(a.position, this.player.position) < 1.1 &&
        a.cooldown <= 0
      ) {
        this.player.hp -= 6 + a.genome.mass * 2;
        a.cooldown = 1.8;
        this.message = 'This predator defends its space.';
      }
    }
    for (const b of this.bolts) {
      const travelTime = Math.min(dt, b.life);
      b.position.x += b.velocity.x * travelTime;
      b.position.z += b.velocity.z * travelTime;
      b.life -= dt;
      const target = this.actors.find((a) => a.hp > 0 && distance(a.position, b.position) < 0.65);
      if (target) {
        this.affect(target, b.core, b.damage, b.power);
        b.life = 0;
      }
      if (distance(b.position, this.world.resonator) < 0.8) {
        this.attune(b.core, b.power);
        b.life = 0;
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.bursts = this.bursts.filter((b) => (b.life -= dt) > 0);
    if (this.player.hp <= 0 || this.player.position.y < -8) {
      this.player.hp = 0;
      this.phase = 'dead';
      const nearest = this.world.tiles.reduce((best, tile) =>
        Math.hypot(tile.x - this.player.position.x, tile.z - this.player.position.z) <
        Math.hypot(best.x - this.player.position.x, best.z - this.player.position.z)
          ? tile
          : best,
      );
      this.belongings = { x: nearest.x, y: nearest.height, z: nearest.z };
      this.belongingsAmount = this.memories;
      this.memories = 0;
      this.message = 'That vessel has ended. Another anatomy can continue.';
    }
  }
  reincarnate() {
    this.vessel++;
    this.player = this.makeHost();
    this.phase = 'playing';
    this.record('new-host');
  }
  next() {
    return new Crossing(
      deriveSeed(this.world.seed, 'crossing', this.actionSeed, this.kills, this.scanned.join(',')),
      this.crossing + 1,
      this.rootSeed,
    );
  }
}
export function distance(a: V3, b: V3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
