import { weaponProfile } from './equipment.ts';
import { generateArtifact, normalizeArtifactDesign } from './artifacts.ts';
import { createProgression, skillBonuses } from './progression.ts';
import type { Appearance, Npc, Point } from './types.ts';
import type { InfiniteWorld } from './world.ts';
import { STOP_SPACING } from './world.ts';

export interface SharedCombatPeer extends Point {
  id: string;
  heading: number;
  appearance: Appearance;
  combatActive: boolean;
  progression?: SharedCombatProgression;
  bodyId?: string;
}
export interface SharedCombatProgression {
  level: number;
  combatXp: number;
  upgrade: number;
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
  effect?: 'stagger' | 'breath' | 'warmth';
  artifactDesign?: string;
  actorBodyId?: string;
  strikeId?: number;
}
export interface SharedCombatHit {
  id: number;
  actorId: string;
  targetId: string;
  target: 'peer' | 'npc';
  damage: number;
  kind: 'slash' | 'arrow' | 'ward';
  color: string;
  effect?: 'stagger' | 'breath' | 'warmth';
  artifactDesign?: string;
  actorBodyId?: string;
  targetBodyId?: string;
  strikeId?: number;
}
export interface SharedCombatDeath {
  id: number;
  npcId: string;
  killerId: string;
  killerBodyId?: string;
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
export interface SharedCombatCheckpoint {
  snapshot: SharedCombatSnapshot;
  records: SharedEnemy[];
  serial: number;
  contributors: [string, string[]][];
  cooldowns: [string, { attack: number; ward: number }][];
}
export function validSharedCombatCheckpoint(v: unknown): v is SharedCombatCheckpoint {
  if (
    !object(v) ||
    !integer(v.serial) ||
    !validSharedCombatFrame({ snapshot: v.snapshot, hits: [], deaths: [] })
  )
    return false;
  if (
    !Array.isArray(v.records) ||
    v.records.length > 2048 ||
    !Array.isArray(v.contributors) ||
    v.contributors.length > 2048
  )
    return false;
  for (let i = 0; i < v.records.length; i += 512) {
    if (
      !validSharedCombatFrame({
        snapshot: { ...(v.snapshot as SharedCombatSnapshot), enemies: v.records.slice(i, i + 512) },
        hits: [],
        deaths: [],
      })
    )
      return false;
  }
  return (
    unique(v.records.map((n) => n.id)) &&
    v.contributors.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        text(row[0]) &&
        boundedArray(row[1], 32, (id) => text(id)),
    ) &&
    boundedArray(
      v.cooldowns,
      64,
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        text(row[0]) &&
        object(row[1]) &&
        finite(row[1].attack, 0, 30000) &&
        finite(row[1].ward, 0, 30000),
    )
  );
}
type CombatWorld = Pick<InfiniteWorld, 'generation' | 'blocked' | 'npcsAround' | 'propsAround'>;
interface CombatProfile {
  damage: number;
  range: number;
  cooldown: number;
  delivery: 'contact' | 'projectile' | 'pulse';
  color: string;
  effect?: 'stagger' | 'breath' | 'warmth';
  artifactDesign?: string;
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

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, low: number, high: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
const integer = (v: unknown, low = 0, high = Number.MAX_SAFE_INTEGER): v is number =>
  finite(v, low, high) && Number.isInteger(v);
const text = (v: unknown, max = 160): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
const color = (v: unknown): v is string =>
  typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
const point = (v: unknown): v is Record<string, unknown> & Point =>
  object(v) &&
  finite(v.x, -MAX_COORDINATE, MAX_COORDINATE) &&
  finite(v.y, -MAX_COORDINATE, MAX_COORDINATE);
const design = (v: unknown) => {
  try {
    return typeof v === 'string' && normalizeArtifactDesign(v) === v;
  } catch {
    return false;
  }
};
const optionalText = (v: unknown) => v === undefined || text(v);
const appearance = (v: unknown) =>
  object(v) &&
  integer(v.seed, -0xffffffff, 0xffffffff) &&
  (v.weaponSeed === undefined || integer(v.weaponSeed, 0, 0xffffffff)) &&
  (v.artifactDesign === undefined || design(v.artifactDesign)) &&
  ['skin', 'hair', 'coat', 'trim', 'trousers'].every((key) => color(v[key])) &&
  finite(v.height, 0.5, 2) &&
  finite(v.build, 0.5, 2) &&
  integer(v.hairStyle, 0, 100) &&
  integer(v.hat, 0, 100) &&
  typeof v.cloak === 'boolean' &&
  ['staff', 'sword', 'bow', 'none'].includes(v.weapon as string);
const benefits = (v: Record<string, unknown>) =>
  (v.effect === undefined || ['stagger', 'breath', 'warmth'].includes(v.effect as string)) &&
  (v.artifactDesign === undefined || design(v.artifactDesign)) &&
  optionalText(v.actorBodyId) &&
  (v.strikeId === undefined || integer(v.strikeId, 1));
const boundedArray = (
  v: unknown,
  max: number,
  check: (entry: unknown) => boolean,
): v is unknown[] => {
  if (!Array.isArray(v) || v.length > max) return false;
  for (let i = 0; i < v.length; i++) if (!check(v[i])) return false;
  return true;
};
const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
export function validSharedCombatProgression(value: unknown): value is SharedCombatProgression {
  return (
    object(value) &&
    integer(value.level, 1, 50) &&
    integer(value.combatXp, 0, 1000000) &&
    integer(value.upgrade, 0, 3)
  );
}
/** Constant shape checks only: no world generation, rendering, mutation, or simulation. */
export function validSharedCombatFrame(value: unknown): value is SharedCombatFrame {
  try {
    if (!object(value) || !object(value.snapshot)) return false;
    const s = value.snapshot;
    if (
      !integer(s.seq) ||
      !boundedArray(s.enemies, 512, (n) => {
        if (
          !point(n) ||
          !text(n.id) ||
          !text(n.name) ||
          n.role !== 'raider' ||
          !integer(n.seed, -0xffffffff, 0xffffffff) ||
          !integer(n.clan, 0, 100) ||
          !appearance(n.appearance) ||
          !finite(n.maxHp, 1, 10000) ||
          !finite(n.hp, 0, n.maxHp) ||
          !point(n.home) ||
          !finite(n.speed, 0, 4) ||
          !finite(n.heading, -1e6, 1e6) ||
          !finite(n.phase, 0, Number.MAX_SAFE_INTEGER) ||
          typeof n.hostile !== 'boolean' ||
          !finite(n.cooldown, 0, 30)
        )
          return false;
        if (n.intent === undefined) return true;
        const i = n.intent;
        return (
          object(i) &&
          ['slash', 'arrow'].includes(i.kind as string) &&
          finite(i.heading, -1e6, 1e6) &&
          finite(i.duration, 0, 10) &&
          finite(i.remaining, 0, i.duration) &&
          finite(i.range, 0, 32) &&
          color(i.color) &&
          text(i.targetId) &&
          finite(i.damage, 0, 1000)
        );
      }) ||
      !unique(s.enemies.map((n) => (n as { id: string }).id))
    )
      return false;
    if (
      !boundedArray(
        s.projectiles,
        128,
        (p) =>
          point(p) &&
          integer(p.id, 1) &&
          text(p.actorId) &&
          ['peer', 'npc'].includes(p.owner as string) &&
          finite(p.heading, -1e6, 1e6) &&
          finite(p.remaining, 0, 32) &&
          finite(p.speed, 0.1, 32) &&
          finite(p.damage, 0, 1000) &&
          color(p.color) &&
          benefits(p),
      ) ||
      !unique(s.projectiles.map((p) => (p as { id: number }).id))
    )
      return false;
    if (
      !boundedArray(s.dead, 16384, (v) => text(v)) ||
      !unique(s.dead) ||
      !boundedArray(s.peaceful, 16384, (v) => text(v)) ||
      !unique(s.peaceful)
    )
      return false;
    const dead = new Set(s.dead);
    if (
      s.peaceful.some((id) => dead.has(id)) ||
      s.enemies.some((n) => dead.has((n as { id: string }).id))
    )
      return false;
    if (
      !boundedArray(
        value.hits,
        1024,
        (h) =>
          object(h) &&
          integer(h.id, 1) &&
          text(h.actorId) &&
          text(h.targetId) &&
          ['peer', 'npc'].includes(h.target as string) &&
          finite(h.damage, 0, 1000) &&
          ['slash', 'arrow', 'ward'].includes(h.kind as string) &&
          color(h.color) &&
          benefits(h) &&
          optionalText(h.targetBodyId),
      ) ||
      !unique(value.hits.map((h) => (h as { id: number }).id))
    )
      return false;
    if (
      !boundedArray(
        value.deaths,
        1024,
        (d) =>
          object(d) &&
          integer(d.id, 1) &&
          text(d.npcId) &&
          text(d.killerId) &&
          optionalText(d.killerBodyId) &&
          boundedArray(d.contributors, 32, (v) => text(v)) &&
          d.contributors.length > 0 &&
          unique(d.contributors) &&
          d.contributors.includes(d.killerId),
      ) ||
      !unique(value.deaths.map((d) => (d as { id: number }).id))
    )
      return false;
    return unique([...value.hits, ...value.deaths].map((e) => (e as { id: number }).id));
  } catch {
    return false;
  }
}

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

  /** Trusted authority persistence; never accepted as a client combat command. */
  checkpoint(): SharedCombatCheckpoint {
    return {
      snapshot: this.snapshot(),
      records: [...this.records.values()].map(copy),
      serial: this.serial,
      contributors: [...this.contributors].map(([id, peers]) => [id, [...peers]]),
      cooldowns: [...this.cooldowns].map(([id, c]) => [
        id,
        { attack: Math.max(0, c.attack - this.now()), ward: Math.max(0, c.ward - this.now()) },
      ]),
    };
  }
  restore(checkpoint: SharedCombatCheckpoint) {
    if (!validSharedCombatCheckpoint(checkpoint)) throw Error('Invalid shared combat checkpoint.');
    const value = copy(checkpoint);
    this.seq = value.snapshot.seq;
    this.serial = Math.max(value.serial, ...value.snapshot.projectiles.map((p) => p.id));
    this.enemies = new Map(value.snapshot.enemies.map((n) => [n.id, n]));
    this.records = new Map(value.records.map((n) => [n.id, n]));
    this.dead = new Set(value.snapshot.dead);
    this.peaceful = new Set(value.snapshot.peaceful);
    this.projectiles = value.snapshot.projectiles;
    this.contributors = new Map(value.contributors.map(([id, peers]) => [id, new Set(peers)]));
    this.hits = [];
    this.deaths = [];
    this.cooldowns = new Map(
      value.cooldowns.map(([id, c]) => [
        id,
        { attack: this.now() + c.attack, ward: this.now() + c.ward },
      ]),
    );
    this.discovery = 0;
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
      text(peer.id) &&
      optionalText(peer.bodyId) &&
      peer.combatActive === true &&
      pointValid(peer) &&
      finite(peer.heading, -1e6, 1e6) &&
      !this.blocked(peer)
    );
  }

  private profile(look: Appearance, progression?: SharedCombatProgression): CombatProfile {
    if (progression !== undefined && !validSharedCombatProgression(progression))
      throw Error('Invalid combat progression.');
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
    const key = JSON.stringify([
      look?.seed,
      look?.weaponSeed,
      look?.weapon,
      look?.artifactDesign,
      progression,
    ]);
    const cached = this.profiles.get(key);
    if (cached) return cached;
    const profile = this.buildProfile(look, progression);
    this.profiles.set(key, profile);
    while (this.profiles.size > 128) this.profiles.delete(this.profiles.keys().next().value!);
    return profile;
  }

  private buildProfile(look: Appearance, progression?: SharedCombatProgression): CombatProfile {
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
      return {
        ...artifact.properties,
        delivery: artifact.delivery,
        color: artifact.color,
        artifactDesign: artifact.design,
      };
    }
    if (!['staff', 'sword', 'bow', 'none'].includes(look.weapon))
      throw Error('Invalid equipped weapon.');
    const kind = look.weapon === 'none' ? 'staff' : look.weapon;
    const state = createProgression(look.seed);
    state.xp.combat = progression?.combatXp ?? 0;
    const skill = skillBonuses(state),
      rank = progression?.upgrade ?? 0;
    const base = weaponProfile(look.weaponSeed ?? look.seed, kind, progression?.level ?? 1);
    return {
      ...base,
      damage: base.damage + skill.damageBonus + rank * 2,
      range: base.range + rank * 0.08,
      cooldown: base.cooldown * skill.cooldownMultiplier * (1 - rank * 0.04),
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
    benefits?: Pick<CombatProfile, 'artifactDesign' | 'effect'> & {
      actorBodyId?: string;
      strikeId?: number;
    },
  ) {
    if (npc.hp <= 0 || !npc.hostile || this.dead.has(npc.id) || !this.recordable(npc.id))
      return false;
    const damage = Math.min(npc.hp, amount);
    npc.hp = Math.max(0, npc.hp - amount);
    delete npc.intent;
    npc.cooldown = Math.max(npc.cooldown, benefits?.effect === 'stagger' ? 1.35 : 0.35);
    const contributors = this.contributors.get(npc.id) ?? new Set<string>();
    contributors.add(actorId);
    while (contributors.size > 32) contributors.delete(contributors.values().next().value!);
    this.contributors.set(npc.id, contributors);
    this.hits.push({
      id: ++this.serial,
      actorId,
      targetId: npc.id,
      target: 'npc',
      damage,
      kind,
      color,
      ...(benefits?.effect ? { effect: benefits.effect } : {}),
      ...(benefits?.artifactDesign ? { artifactDesign: benefits.artifactDesign } : {}),
      ...(benefits?.actorBodyId ? { actorBodyId: benefits.actorBodyId } : {}),
      targetBodyId: npc.id,
      ...(benefits?.strikeId ? { strikeId: benefits.strikeId } : {}),
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
        ...(benefits?.actorBodyId ? { killerBodyId: benefits.actorBodyId } : {}),
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
    if (
      !this.validPeer(peer) ||
      !Number.isFinite(heading) ||
      Math.abs(heading) > 1e6 ||
      !['attack', 'ward'].includes(kind)
    )
      return this.result(false, 'A living, active traveler on clear ground is required.');
    let profile: ReturnType<SharedCombat['profile']>;
    try {
      profile = this.profile(peer.appearance, peer.progression);
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
    const strikeId = ++this.serial;
    if (kind === 'attack' && profile.delivery === 'projectile') {
      if (this.projectiles.length >= 128) return this.result(false, 'Too many projectiles.');
      this.projectiles.push({
        id: strikeId,
        actorId: peer.id,
        owner: 'peer',
        x: peer.x,
        y: peer.y,
        heading,
        remaining: range,
        speed: 9,
        damage: profile.damage,
        color,
        ...(profile.effect ? { effect: profile.effect } : {}),
        ...(profile.artifactDesign ? { artifactDesign: profile.artifactDesign } : {}),
        ...(peer.bodyId ? { actorBodyId: peer.bodyId } : {}),
        strikeId,
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
          kind === 'ward' ? 14 + (peer.progression?.level ?? 1) : profile.damage,
          peer.id,
          radial ? 'ward' : 'slash',
          color,
          {
            ...(kind === 'ward' ? {} : profile),
            ...(peer.bodyId ? { actorBodyId: peer.bodyId } : {}),
            strikeId,
          },
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
      !this.validPeer({ ...peer, combatActive: true }) ||
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
                actorBodyId: npc.id,
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
              actorBodyId: npc.id,
              ...(original.bodyId ? { targetBodyId: original.bodyId } : {}),
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
              actorBodyId: arrow.actorId,
              ...(peer.bodyId ? { targetBodyId: peer.bodyId } : {}),
            });
            arrow.remaining = 0;
          }
        } else {
          const npc = [...this.enemies.values()].find(
            (n) => n.hp > 0 && n.hostile && distance(n, arrow) < 0.4,
          );
          if (npc) {
            this.damage(npc, arrow.damage, arrow.actorId, 'arrow', arrow.color, arrow);
            arrow.remaining = 0;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.remaining > 0);
  }
}
