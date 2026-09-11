import { weaponProfile } from './equipment.ts';
import { generateArtifact, normalizeArtifactDesign } from './artifacts.ts';
import type { Appearance, Npc, Point } from './types.ts';
import type { InfiniteWorld } from './world.ts';
import { STOP_SPACING } from './world.ts';

export interface SharedCombatPeer extends Point {
  id: string;
  heading: number;
  appearance: Appearance;
  combatActive: boolean;
}
export interface SharedIntent {
  kind: 'slash' | 'arrow';
  heading: number;
  remaining: number;
  duration: number;
  range: number;
  color: string;
  targetId: string;
  damage: number;
}
export interface SharedEnemy extends Npc {
  intent?: SharedIntent;
}
export interface SharedProjectile extends Point {
  id: number;
  actorId: string;
  owner: 'peer' | 'npc';
  heading: number;
  remaining: number;
  speed: number;
  damage: number;
  color: string;
}
export interface SharedCombatHit {
  id: number;
  actorId: string;
  targetId: string;
  target: 'peer' | 'npc';
  damage: number;
  kind: 'slash' | 'arrow' | 'ward';
  color: string;
}
export interface SharedCombatDeath {
  id: number;
  npcId: string;
  killerId: string;
  contributors: string[];
}
export interface SharedCombatSnapshot {
  seq: number;
  enemies: SharedEnemy[];
  projectiles: SharedProjectile[];
  dead: string[];
  peaceful: string[];
}
export interface SharedCombatFrame {
  snapshot: SharedCombatSnapshot;
  hits: SharedCombatHit[];
  deaths: SharedCombatDeath[];
}
export interface SharedCombatResult extends SharedCombatFrame {
  ok: boolean;
  reason?: string;
}
type CombatWorld = Pick<InfiniteWorld, 'generation' | 'blocked' | 'npcsAround' | 'propsAround'>;
interface CombatProfile {
  damage: number;
  range: number;
  cooldown: number;
  delivery: 'contact' | 'projectile' | 'pulse';
  color: string;
}
const MAX_COORDINATE = Number.MAX_SAFE_INTEGER - 4096;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointValid = (p: Point) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.abs(p.x) <= MAX_COORDINATE &&
  Math.abs(p.y) <= MAX_COORDINATE;
const copy = <T>(v: T): T => structuredClone(v);

/** Portable room authority: generated hostile bodies only. Inventory/health remain client-owned.
 * Callers authenticate peers, deduplicate action requests, charge stamina and apply hit receipts.
 * Consequences are retained for this instance's lifetime; no damaged/dead actor is LRU-reset.
 */
export class SharedCombat {
  private enemies = new Map<string, SharedEnemy>();
  private records = new Map<string, SharedEnemy>();
  private dead = new Set<string>();
  private peaceful = new Set<string>();
  private contributors = new Map<string, Set<string>>();
  private projectiles: SharedProjectile[] = [];
  private peers: SharedCombatPeer[] = [];
  private cooldowns = new Map<string, { attack: number; ward: number }>();
  private profiles = new Map<string, CombatProfile>();
  private opened: ReadonlySet<string> = new Set();
  private collisionRemoved = new Set<string>();
  private hits: SharedCombatHit[] = [];
  private deaths: SharedCombatDeath[] = [];
  private serial = 0;
  private seq = 0;
  private discovery = 0;
  private readonly now: () => number;
  private readonly maxEnemies: number;
  private readonly maxRecords: number;
  private readonly world: CombatWorld;
  private readonly removed: Set<string>;

  constructor(
    world: CombatWorld,
    removed: Set<string>,
    options: { now?: () => number; maxEnemies?: number; maxRecords?: number } = {},
  ) {
    this.world = world;
    this.removed = removed;
    this.now = options.now ?? Date.now;
    this.maxEnemies = Math.floor(clamp(options.maxEnemies ?? 256, 1, 512));
    this.maxRecords = Math.floor(clamp(options.maxRecords ?? 2048, 1, 16384));
  }

  snapshot(): SharedCombatSnapshot {
    return {
      seq: this.seq,
      enemies: [...this.enemies.values()].sort((a, b) => a.id.localeCompare(b.id)).map(copy),
      projectiles: this.projectiles.map(copy),
      dead: [...this.dead].sort(),
      peaceful: [...this.peaceful].sort(),
    };
  }

  private frame(advance = true): SharedCombatFrame {
    if (advance) this.seq++;
    const frame = { snapshot: this.snapshot(), hits: this.hits, deaths: this.deaths };
    this.hits = [];
    this.deaths = [];
    return frame;
  }

  private result(ok: boolean, reason?: string): SharedCombatResult {
    return { ok, ...(reason ? { reason } : {}), ...this.frame(ok) };
  }

  private refreshCollision() {
    this.collisionRemoved = new Set([...this.removed, ...this.opened]);
  }

  private blocked(p: Point) {
    return !pointValid(p) || this.world.blocked(p.x, p.y, this.collisionRemoved);
  }

  private clear(p: Point) {
    return [-0.21, 0.21].every((dx) =>
      [-0.21, 0.21].every((dy) => !this.blocked({ x: p.x + dx, y: p.y + dy })),
    );
  }

  private lineOfSight(a: Point, b: Point) {
    const length = distance(a, b);
    if (!pointValid(a) || !pointValid(b) || length > 32) return false;
    const steps = Math.max(1, Math.ceil(length / 0.12));
    for (let i = 1; i <= steps; i++)
      if (this.blocked({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }))
        return false;
    return true;
  }

  private validPeer(peer: SharedCombatPeer) {
    return (
      !!peer &&
      typeof peer.id === 'string' &&
      peer.id.length > 0 &&
      peer.id.length <= 160 &&
      peer.combatActive === true &&
      pointValid(peer) &&
      Number.isFinite(peer.heading) &&
      !this.blocked(peer)
    );
  }

  private profile(look: Appearance): CombatProfile {
    // Validate before keying: JSON serializes NaN/null/undefined similarly inside arrays.
    if (!look || !Number.isInteger(look.seed) || Math.abs(look.seed) > 0xffffffff)
      throw Error('Invalid equipped body.');
    if (
      look.weaponSeed !== undefined &&
      (!Number.isInteger(look.weaponSeed) || look.weaponSeed < 0 || look.weaponSeed > 0xffffffff)
    )
      throw Error('Invalid weapon construction.');
    if (
      look.artifactDesign !== undefined &&
      normalizeArtifactDesign(look.artifactDesign) !== look.artifactDesign
    )
      throw Error('Invalid artifact design.');
    const key = JSON.stringify([look?.seed, look?.weaponSeed, look?.weapon, look?.artifactDesign]);
    const cached = this.profiles.get(key);
    if (cached) return cached;
    const profile = this.buildProfile(look);
    this.profiles.set(key, profile);
    while (this.profiles.size > 128) this.profiles.delete(this.profiles.keys().next().value!);
    return profile;
  }

  private buildProfile(look: Appearance): CombatProfile {
    if (!look || !Number.isInteger(look.seed) || Math.abs(look.seed) > 0xffffffff)
      throw Error('Invalid equipped body.');
    if (
      look.weaponSeed !== undefined &&
      (!Number.isInteger(look.weaponSeed) || look.weaponSeed < 0 || look.weaponSeed > 0xffffffff)
    )
      throw Error('Invalid weapon construction.');
    if (look.artifactDesign !== undefined) {
      if (normalizeArtifactDesign(look.artifactDesign) !== look.artifactDesign)
        throw Error('Invalid artifact design.');
      const artifact = generateArtifact(look.artifactDesign);
      if (artifact.category !== 'implement' || artifact.delivery === 'consume')
        throw Error('This object is not a weapon.');
      return { ...artifact.properties, delivery: artifact.delivery, color: artifact.color };
    }
    if (!['staff', 'sword', 'bow', 'none'].includes(look.weapon))
      throw Error('Invalid equipped weapon.');
    const kind = look.weapon === 'none' ? 'staff' : look.weapon;
    return {
      ...weaponProfile(look.weaponSeed ?? look.seed, kind, 1),
      delivery: kind === 'bow' ? ('projectile' as const) : ('contact' as const),
    };
  }

  private load(npc: Npc) {
    if (npc.role !== 'raider' || this.dead.has(npc.id) || this.removed.has(npc.id)) return;
    if (this.enemies.has(npc.id)) return;
    if (this.enemies.size >= this.maxEnemies) return;
    const actor = copy(this.records.get(npc.id) ?? npc) as SharedEnemy;
    if (this.peaceful.has(npc.id)) actor.hostile = false;
    this.enemies.set(npc.id, actor);
  }

  private discover(peers: readonly SharedCombatPeer[]) {
    for (const [id, npc] of this.enemies) {
      if (this.removed.has(id) || this.dead.has(id)) {
        this.enemies.delete(id);
        continue;
      }
      if (peers.every((p) => distance(npc, p) > 24)) {
        if (this.records.has(id)) this.records.set(id, copy(npc));
        this.enemies.delete(id);
      }
    }
    for (const peer of peers)
      for (const npc of this.world.npcsAround(peer.x, peer.y, 16)) this.load(npc);
  }

  private recordable(id: string) {
    return this.records.has(id) || this.records.size + this.dead.size < this.maxRecords;
  }

  private move(actor: Npc, dx: number, dy: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.12));
    const before = { x: actor.x, y: actor.y };
    for (let i = 0; i < steps; i++) {
      const x = { x: actor.x + dx / steps, y: actor.y };
      if (this.clear(x)) actor.x = x.x;
      const y = { x: actor.x, y: actor.y + dy / steps };
      if (this.clear(y)) actor.y = y.y;
    }
    actor.phase += distance(actor, before) * 2.5;
  }

  private inCone(from: Point, to: Point, heading: number, threshold = 0.2) {
    return (
      ((to.x - from.x) * Math.cos(heading) + (to.y - from.y) * Math.sin(heading)) /
        Math.max(0.001, distance(from, to)) >
      threshold
    );
  }

  private damage(
    npc: SharedEnemy,
    amount: number,
    actorId: string,
    kind: SharedCombatHit['kind'],
    color: string,
  ) {
    if (npc.hp <= 0 || !npc.hostile || this.dead.has(npc.id) || !this.recordable(npc.id))
      return false;
    const damage = Math.min(npc.hp, amount);
    npc.hp = Math.max(0, npc.hp - amount);
    delete npc.intent;
    npc.cooldown = Math.max(npc.cooldown, 0.35);
    const contributors = this.contributors.get(npc.id) ?? new Set<string>();
    contributors.add(actorId);
    this.contributors.set(npc.id, contributors);
    this.hits.push({
      id: ++this.serial,
      actorId,
      targetId: npc.id,
      target: 'npc',
      damage,
      kind,
      color,
    });
    if (npc.hp <= 0) {
      this.dead.add(npc.id);
      this.removed.add(npc.id);
      this.records.delete(npc.id);
      this.enemies.delete(npc.id);
      this.deaths.push({
        id: ++this.serial,
        npcId: npc.id,
        killerId: actorId,
        contributors: [...contributors].sort(),
      });
      this.contributors.delete(npc.id);
    } else this.records.set(npc.id, copy(npc));
    return true;
  }

  attack(
    peer: SharedCombatPeer,
    heading: number,
    kind: 'attack' | 'ward' = 'attack',
  ): SharedCombatResult {
    this.refreshCollision();
    if (!this.validPeer(peer) || !Number.isFinite(heading) || !['attack', 'ward'].includes(kind))
      return this.result(false, 'A living, active traveler on clear ground is required.');
    let profile: ReturnType<SharedCombat['profile']>;
    try {
      profile = this.profile(peer.appearance);
    } catch (error) {
      return this.result(false, error instanceof Error ? error.message : 'Invalid weapon.');
    }
    const now = this.now();
    if (!Number.isFinite(now)) return this.result(false, 'Authority clock unavailable.');
    for (const [id, value] of this.cooldowns)
      if (id !== peer.id && now >= Math.max(value.attack, value.ward)) this.cooldowns.delete(id);
    const cooldown = this.cooldowns.get(peer.id) ?? { attack: -Infinity, ward: -Infinity };
    if (now < cooldown[kind]) return this.result(false, 'The action is still recovering.');
    // A room has at most eight players; abandoned identities cannot grow this cache forever.
    if (!this.cooldowns.has(peer.id) && this.cooldowns.size >= 64)
      return this.result(false, 'Too many combat identities in this room.');
    cooldown[kind] = now + (kind === 'ward' ? 8000 : profile.cooldown * 1000);
    this.cooldowns.set(peer.id, cooldown);
    for (const npc of this.world.npcsAround(peer.x, peer.y, 16)) this.load(npc);
    const range = kind === 'ward' ? 2.7 : profile.range;
    const color = kind === 'ward' ? '#9abde9' : profile.color;
    if (kind === 'attack' && profile.delivery === 'projectile') {
      if (this.projectiles.length >= 128) return this.result(false, 'Too many projectiles.');
      this.projectiles.push({
        id: ++this.serial,
        actorId: peer.id,
        owner: 'peer',
        x: peer.x,
        y: peer.y,
        heading,
        remaining: range,
        speed: 9,
        damage: profile.damage,
        color,
      });
    } else {
      const radial = kind === 'ward' || profile.delivery === 'pulse';
      const targets = [...this.enemies.values()]
        .filter(
          (npc) =>
            npc.hp > 0 &&
            npc.hostile &&
            distance(peer, npc) <= range &&
            (radial || this.inCone(peer, npc, heading)) &&
            this.lineOfSight(peer, npc),
        )
        .sort((a, b) => distance(peer, a) - distance(peer, b) || a.id.localeCompare(b.id));
      for (const npc of radial ? targets : targets.slice(0, 1)) {
        const struck = this.damage(
          npc,
          kind === 'ward' ? 15 : profile.damage,
          peer.id,
          radial ? 'ward' : 'slash',
          color,
        );
        if (struck && kind === 'ward' && npc.hp > 0) {
          const d = Math.max(0.01, distance(peer, npc));
          this.move(npc, ((npc.x - peer.x) / d) * 0.7, ((npc.y - peer.y) / d) * 0.7);
          npc.cooldown = Math.max(npc.cooldown, 1);
          this.records.set(npc.id, copy(npc));
        }
      }
    }
    return this.result(true);
  }

  /** Caller pays the campaign medicine/food cost only after this geometric truce is accepted. */
  parley(peer: SharedCombatPeer, guardIds: readonly string[]): SharedCombatResult {
    this.refreshCollision();
    if (
      !this.validPeer(peer) ||
      !Array.isArray(guardIds) ||
      guardIds.length !== 2 ||
      new Set(guardIds).size !== 2
    )
      return this.result(false, 'Choose the actual vault guard pair.');
    const match = /^vault:(-?\d+):(-?\d+):guard:[01]$/.exec(guardIds[0]);
    if (!match) return this.result(false, 'Unknown vault guards.');
    const group = `vault:${match[1]}:${match[2]}`;
    if (!guardIds.every((id) => id === `${group}:guard:0` || id === `${group}:guard:1`))
      return this.result(false, 'These guards belong to different vaults.');
    const notice = this.world
      .propsAround(peer.x, peer.y, 2.2)
      .find((p) => p.id === `${group}:notice` && p.kind === 'notice');
    if (!notice || distance(peer, notice) > 1.9 || !this.lineOfSight(peer, notice))
      return this.result(false, 'Speak at the actual vault notice.');
    const spacing = this.world.generation === 3 ? STOP_SPACING : 80;
    const center = {
      x: Math.round((Number(match[1]) + 0.5) * spacing),
      y: Math.round((Number(match[2]) + 0.5) * spacing),
    };
    if (!pointValid(center)) return this.result(false, 'Unknown vault.');
    const generated = this.world
      .npcsAround(center.x, center.y, 24)
      .filter((n) => guardIds.includes(n.id) && n.role === 'raider');
    if (generated.length !== 2) return this.result(false, 'Unknown vault guards.');
    const living = generated.filter((n) => !this.dead.has(n.id) && !this.removed.has(n.id));
    if (!living.length) return this.result(false, 'These guards have already died.');
    const fresh = living.filter((n) => !this.records.has(n.id)).length;
    if (this.records.size + this.dead.size + fresh > this.maxRecords)
      return this.result(false, 'This room has reached its consequence limit.');
    for (const npc of living) {
      const actor = copy(
        this.enemies.get(npc.id) ?? this.records.get(npc.id) ?? npc,
      ) as SharedEnemy;
      actor.hostile = false;
      actor.cooldown = 0;
      delete actor.intent;
      this.peaceful.add(actor.id);
      this.records.set(actor.id, copy(actor));
      if (this.enemies.has(actor.id)) this.enemies.set(actor.id, actor);
    }
    this.projectiles = this.projectiles.filter((p) => !guardIds.includes(p.actorId));
    return this.result(true);
  }

  tick(
    dt: number,
    peers: readonly SharedCombatPeer[],
    opened: ReadonlySet<string> = new Set(),
  ): SharedCombatFrame {
    this.opened = opened;
    this.refreshCollision();
    this.peers = [
      ...new Map(peers.filter((p) => this.validPeer(p)).map((p) => [p.id, copy(p)])).values(),
    ]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 8);
    if (!Number.isFinite(dt) || dt <= 0) return this.frame(false);
    let remaining = Math.min(dt, 0.25);
    this.discovery -= remaining;
    if (this.discovery <= 0) {
      this.discovery = 0.5;
      this.discover(this.peers);
    }
    while (remaining > 0.000001) {
      const step = Math.min(remaining, 1 / 30);
      this.step(step);
      remaining -= step;
    }
    return this.frame();
  }

  private step(dt: number) {
    for (const npc of this.enemies.values()) {
      if (npc.hp <= 0 || this.removed.has(npc.id)) continue;
      npc.cooldown = Math.max(0, npc.cooldown - dt);
      const target = npc.hostile
        ? this.peers
            .filter((p) => distance(npc, p) < 8)
            .sort((a, b) => distance(npc, a) - distance(npc, b) || a.id.localeCompare(b.id))[0]
        : undefined;
      if (npc.intent) {
        const intent = npc.intent;
        intent.remaining -= dt;
        npc.heading = intent.heading;
        if (intent.remaining <= 0) {
          delete npc.intent;
          const original = this.peers.find((p) => p.id === intent.targetId);
          if (!original) continue;
          if (intent.kind === 'arrow') {
            const near = Math.min(intent.range, distance(npc, original));
            const end = {
              x: npc.x + Math.cos(intent.heading) * near,
              y: npc.y + Math.sin(intent.heading) * near,
            };
            if (this.lineOfSight(npc, end) && this.projectiles.length < 128)
              this.projectiles.push({
                id: ++this.serial,
                actorId: npc.id,
                owner: 'npc',
                x: npc.x,
                y: npc.y,
                heading: intent.heading,
                remaining: intent.range,
                speed: 7,
                damage: intent.damage,
                color: intent.color,
              });
          } else if (
            distance(npc, original) <= intent.range &&
            this.inCone(npc, original, intent.heading, 0.35) &&
            this.lineOfSight(npc, original)
          ) {
            this.hits.push({
              id: ++this.serial,
              actorId: npc.id,
              targetId: original.id,
              target: 'peer',
              damage: intent.damage,
              kind: 'slash',
              color: intent.color,
            });
          }
        }
        continue;
      }
      const destination = target ?? npc.home;
      const d = distance(npc, destination);
      const kind = npc.appearance.weapon === 'bow' ? 'arrow' : 'slash';
      const profile = this.profile(npc.appearance);
      const reach = profile.range * 0.78;
      const canAim = !!target && d <= reach && this.lineOfSight(npc, target);
      if (canAim && npc.cooldown <= 0) {
        const windup =
          kind === 'arrow' ? 0.42 + profile.cooldown * 0.18 : 0.16 + profile.cooldown * 0.1;
        npc.heading = Math.atan2(target.y - npc.y, target.x - npc.x);
        npc.cooldown =
          windup +
          clamp(
            profile.cooldown * 1.8,
            kind === 'arrow' ? 1.1 : 0.95,
            kind === 'arrow' ? 1.65 : 1.4,
          );
        npc.intent = {
          kind,
          heading: npc.heading,
          remaining: windup,
          duration: windup,
          range: reach,
          color: profile.color,
          targetId: target.id,
          damage: clamp(Math.round(profile.damage * 0.31), 5, 10),
        };
      } else if (!canAim && d > (target ? 0.85 : 0.5)) {
        const speed = clamp(npc.speed || 1.5, 0, 2.4);
        this.move(
          npc,
          ((destination.x - npc.x) / d) * speed * dt,
          ((destination.y - npc.y) / d) * speed * dt,
        );
        npc.heading = Math.atan2(destination.y - npc.y, destination.x - npc.x);
      }
    }
    for (const arrow of this.projectiles) {
      const travel = Math.min(arrow.remaining, arrow.speed * dt);
      const steps = Math.max(1, Math.ceil(travel / 0.1));
      for (let i = 0; i < steps && arrow.remaining > 0; i++) {
        arrow.x += (Math.cos(arrow.heading) * travel) / steps;
        arrow.y += (Math.sin(arrow.heading) * travel) / steps;
        arrow.remaining = Math.max(0, arrow.remaining - travel / steps);
        if (this.blocked(arrow)) {
          arrow.remaining = 0;
          break;
        }
        if (arrow.owner === 'npc') {
          const peer = this.peers.find((p) => distance(p, arrow) < 0.35);
          if (peer) {
            this.hits.push({
              id: ++this.serial,
              actorId: arrow.actorId,
              targetId: peer.id,
              target: 'peer',
              damage: arrow.damage,
              kind: 'arrow',
              color: arrow.color,
            });
            arrow.remaining = 0;
          }
        } else {
          const npc = [...this.enemies.values()].find(
            (n) => n.hp > 0 && n.hostile && distance(n, arrow) < 0.4,
          );
          if (npc) {
            this.damage(npc, arrow.damage, arrow.actorId, 'arrow', arrow.color);
            arrow.remaining = 0;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.remaining > 0);
  }
}
