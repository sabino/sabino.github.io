/** The deterministic, renderer-independent simulation for Verso. */
export type Vec2 = { x: number; y: number };
export type ActionKind = 'blade' | 'pulse' | 'dash' | 'scan' | 'mend';
export type InputState = { x: number; y: number; running: boolean; aim: Vec2 };
export type GamePhase = 'playing' | 'dead' | 'complete' | 'reveal';
export type EntityKind = 'species' | 'enemy' | 'relay' | 'survivor' | 'drop' | 'portal';

export interface Entity extends Vec2 {
  id: string;
  kind: EntityKind;
  subtype?: string;
  name?: string;
  radius: number;
  hp?: number;
  maxHp?: number;
  scanned?: boolean;
  active?: boolean;
  phase?: number;
  state?: string;
  timer?: number;
  order?: number;
  homeX?: number;
  homeY?: number;
  velocity?: Vec2;
  fragments?: number;
  rewarded?: boolean;
}

export interface Projectile extends Vec2 {
  id: string;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  owner: 'player' | 'enemy';
  radius: number;
}

export interface Effect extends Vec2 {
  id: string;
  kind: string;
  life: number;
  maxLife: number;
  radius: number;
  angle?: number;
  text?: string;
}

export interface PlayerState extends Vec2 {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  vessel: number;
  fragments: number;
  facing: Vec2;
  moving: boolean;
  running: boolean;
  dashing: number;
  invulnerable: number;
  cooldowns: Record<ActionKind, number>;
  weaponCharge: number;
}

export interface MissionStats {
  kills: number;
  mends: number;
  scans: number;
  damage: number;
  hostsLost: number;
}

export interface HistoryEntry {
  mission: number;
  title: string;
  integrity: number;
  kills: number;
  mends: number;
  vessel: number;
  worldSeed: number;
  time: number;
  report: string;
}

export interface WeaponProfile {
  name: string;
  family: 'sabre' | 'cleaver' | 'rapier';
  color: string;
  bladeDamage: number;
  pulseDamage: number;
  /** Maximum projectile travel after leaving the emitter, in ground-plane pixels. */
  pulseRange: number;
  bladeCooldown: number;
  pulseCooldown: number;
}

export interface GameState {
  phase: GamePhase;
  mission: number;
  missionTitle: string;
  seed: number;
  worldSeed: number;
  name: string;
  time: number;
  levelTime: number;
  player: PlayerState;
  weapon: WeaponProfile;
  entities: Entity[];
  projectiles: Projectile[];
  effects: Effect[];
  integrity: number;
  catalog: string[];
  relays: number[];
  kills: number;
  mends: number;
  rescued: boolean;
  relayErrors: number;
  endless: boolean;
  missionStats: MissionStats;
  history: HistoryEntry[];
  nextId: number;
}

export interface GameEvent {
  type: string;
  text?: string;
  x?: number;
  y?: number;
  value?: number;
}

export interface Objective {
  title: string;
  description: string;
  tasks: { label: string; done: boolean; progress?: string }[];
}

export interface Interaction extends Vec2 {
  label: string;
  entityId: string;
}

export interface SavedGame {
  version: 1;
  state: GameState;
}

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1000;
export const ISO_Y = 0.6;
export const SPAWN: Vec2 = { x: 795, y: 525 };
export const PORTAL: Vec2 = { x: 1030, y: 366 };
export const WALKABLE: Vec2[] = [
  [320, 380],
  [760, 275],
  [1060, 340],
  [1360, 480],
  [1390, 640],
  [1090, 760],
  [870, 715],
  [855, 675],
  [810, 655],
  [785, 690],
  [755, 718],
  [610, 745],
  [300, 625],
  [260, 510],
].map(([x, y]) => ({ x, y }));
// Saves made before the visible southern cleft received accurate collision can
// contain a host on its former ground polygon. Restore gently relocates those.
const LEGACY_WALKABLE: Vec2[] = [
  [320, 380],
  [760, 275],
  [1060, 340],
  [1360, 480],
  [1390, 640],
  [1090, 760],
  [860, 720],
  [610, 745],
  [300, 625],
  [260, 510],
].map(([x, y]) => ({ x, y }));
export const OBSTACLES = [
  { x: 625, y: 553, radius: 30 },
  { x: 960, y: 564, radius: 22 },
  { x: 1180, y: 515, radius: 55 },
  { x: 350, y: 370, radius: 55 },
  { x: 1320, y: 620, radius: 60 },
];

const TITLES = ['A small observation', 'The quiet adjustment', 'A borrowed life'];
const STATION_NAMES = ['I · MOSS', 'II · EMBER', 'III · TIDE'];
const BLANK_INPUT: InputState = { x: 0, y: 0, running: false, aim: { x: 895, y: 525 } };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Distances are measured on the isometric ground plane, not in screen pixels. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / ISO_Y);
}

function direction(a: Vec2, b: Vec2): Vec2 {
  const length = distance(a, b);
  return length > 0.001
    ? { x: (b.x - a.x) / length, y: (b.y - a.y) / ISO_Y / length }
    : { x: 1, y: 0 };
}

function pointInPolygon(point: Vec2, polygon = WALKABLE): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Feet remain a few pixels inside the cliff edge. Pillars use elliptical collision. */
export function isWalkable(point: Vec2, radius = 12): boolean {
  if (!finite(point.x) || !finite(point.y)) return false;
  for (const offset of [
    { x: 0, y: 0 },
    { x: radius, y: 0 },
    { x: -radius, y: 0 },
    { x: 0, y: radius * ISO_Y },
    { x: 0, y: -radius * ISO_Y },
  ]) {
    if (!pointInPolygon({ x: point.x + offset.x, y: point.y + offset.y })) return false;
  }
  return OBSTACLES.every((obstacle) => distance(point, obstacle) >= obstacle.radius + radius);
}

function relocateLegacyPosition(point: Vec2, radius: number): boolean {
  if (isWalkable(point, radius)) return false;
  if (
    !pointInPolygon(point, LEGACY_WALKABLE) ||
    OBSTACLES.some((obstacle) => distance(point, obstacle) < obstacle.radius)
  )
    return false;
  let nearest = SPAWN,
    best = Infinity;
  // This narrow migration is bounded to the old island; wildly invalid save
  // coordinates still fail validation rather than being silently accepted.
  for (let x = point.x - 100; x <= point.x + 100; x += 4) {
    for (let y = point.y - 60; y <= point.y + 60; y += 4) {
      const candidate = { x, y };
      const d = distance(point, candidate);
      if (d < best && isWalkable(candidate, radius)) {
        nearest = candidate;
        best = d;
      }
    }
  }
  point.x = nearest.x;
  point.y = nearest.y;
  return true;
}

function hash(seed: number, value: number): number {
  let n = (seed ^ Math.imul(value + 1, 0x9e3779b9)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0;
}

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

/** World-specific equipment, independent from encounter/layout random draws. */
export function generateWeapon(seed: number): WeaponProfile {
  const normalizedSeed = finite(seed) ? seed >>> 0 : 280519;
  // The opening world retains the established combat feel and cyan signature.
  if (normalizedSeed === 0x71a3)
    return {
      name: 'Riftglass sabre',
      family: 'sabre',
      color: '#9cf9ef',
      bladeDamage: 34,
      pulseDamage: 27,
      pulseRange: 775,
      bladeCooldown: 0.34,
      pulseCooldown: 0.36,
    };
  const rng = random(hash(normalizedSeed, 0x57454150));
  const templates: Omit<WeaponProfile, 'name'>[] = [
    {
      family: 'sabre',
      color: '#9cf9ef',
      bladeDamage: 34,
      pulseDamage: 27,
      pulseRange: 775,
      bladeCooldown: 0.34,
      pulseCooldown: 0.36,
    },
    {
      family: 'cleaver',
      color: '#aeead8',
      bladeDamage: 39,
      pulseDamage: 24,
      pulseRange: 700,
      bladeCooldown: 0.39,
      pulseCooldown: 0.33,
    },
    {
      family: 'rapier',
      color: '#c4ddff',
      bladeDamage: 29,
      pulseDamage: 30,
      pulseRange: 850,
      bladeCooldown: 0.3,
      pulseCooldown: 0.4,
    },
  ];
  const template = templates[Math.floor(rng() * templates.length)];
  const names = [
    'Stillwater',
    'Mosslight',
    'Ashwake',
    'Glasswind',
    'Lattice',
    'Dawnlight',
    'Tideborn',
    'Echo',
  ];
  const modifier = () => Math.floor(rng() * 3) - 1;
  return {
    ...template,
    name: `${names[Math.floor(rng() * names.length)]} ${template.family}`,
    bladeDamage: template.bladeDamage + modifier(),
    pulseDamage: template.pulseDamage + modifier(),
    pulseRange: template.pulseRange + (Math.floor(rng() * 11) - 5) * 5,
    bladeCooldown: Math.round((template.bladeCooldown + modifier() * 0.01) * 100) / 100,
    pulseCooldown: Math.round((template.pulseCooldown + modifier() * 0.01) * 100) / 100,
  };
}

function freshStats(): MissionStats {
  return { kills: 0, mends: 0, scans: 0, damage: 0, hostsLost: 0 };
}

function freshPlayer(vessel = 1, fragments = 2): PlayerState {
  return {
    ...SPAWN,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    vessel,
    fragments,
    facing: { x: 1, y: 0 },
    moving: false,
    running: false,
    dashing: 0,
    invulnerable: 1.4,
    weaponCharge: 0,
    cooldowns: { blade: 0, pulse: 0, dash: 0, scan: 0, mend: 0 },
  };
}

export class Game {
  state!: GameState;
  private events: GameEvent[] = [];
  private messageCooldown = 0;

  constructor(name = 'TRAVELER', seed = 280519) {
    this.newRun(name, seed);
  }

  newRun(name: string, seed = 280519): void {
    const cleanName =
      String(name)
        .trim()
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 24) || 'TRAVELER';
    const cleanSeed = finite(seed) ? seed >>> 0 : 280519;
    this.events = [];
    this.messageCooldown = 0;
    this.state = {
      phase: 'playing',
      mission: 0,
      missionTitle: TITLES[0],
      seed: cleanSeed,
      worldSeed: cleanSeed,
      name: cleanName,
      time: 0,
      levelTime: 0,
      player: freshPlayer(),
      weapon: generateWeapon(cleanSeed),
      entities: [],
      projectiles: [],
      effects: [],
      integrity: 100,
      catalog: [],
      relays: [],
      kills: 0,
      mends: 0,
      rescued: false,
      relayErrors: 0,
      endless: false,
      missionStats: freshStats(),
      history: [],
      nextId: 1,
    };
    this.buildWorld();
    this.emit('deploy', 'Host connection stable. Observe three lifeforms. Leave no trace.', SPAWN);
  }

  /** The same seed and action sequence always produce the same world. */
  private buildWorld(): void {
    const s = this.state;
    s.worldSeed =
      s.mission === 0 ? s.seed : hash(s.seed, s.mission + Math.round((100 - s.integrity) * 11));
    s.weapon = generateWeapon(s.worldSeed);
    const rng = random(s.worldSeed);
    const entities: Entity[] = [];
    const shifted = (base: Vec2, scale = 26): Vec2 => {
      if (s.mission === 0) return base;
      const candidate = {
        x: base.x + (rng() - 0.5) * scale,
        y: base.y + (rng() - 0.5) * scale * ISO_Y,
      };
      return isWalkable(candidate, 8) ? candidate : base;
    };
    const species = [
      { subtype: 'mushroom', name: 'Lumen cap', x: 410, y: 650 },
      { subtype: 'crystal', name: 'Glass fern', x: 1090, y: 710 },
      { subtype: 'deer', name: 'Prism stag', x: 470, y: 528 },
    ];
    for (const item of species) {
      const position = shifted(item);
      entities.push({
        id: `species-${s.mission}-${item.subtype}`,
        kind: 'species',
        subtype: item.subtype,
        name: item.name,
        ...position,
        homeX: position.x,
        homeY: position.y,
        radius: item.subtype === 'deer' ? 20 : 16,
        hp: 60,
        maxHp: 60,
        scanned: false,
        active: true,
        state: 'idle',
        phase: rng() * Math.PI * 2,
      });
    }
    entities.push({
      id: 'portal',
      kind: 'portal',
      subtype: 'gate',
      name: 'Transfer gate',
      ...PORTAL,
      radius: 42,
      active: false,
    });
    if (s.mission % 3 === 1) {
      const positions = [
        { x: 650, y: 410 },
        { x: 875, y: 590 },
        { x: 1230, y: 565 },
      ];
      positions.forEach((position, index) =>
        entities.push({
          id: `relay-${index}`,
          kind: 'relay',
          subtype: ['moss', 'ember', 'tide'][index],
          name: STATION_NAMES[index],
          ...position,
          radius: 22,
          order: index,
          active: false,
        }),
      );
    }
    if (s.mission % 3 === 2) {
      entities.push({
        id: 'archivist',
        kind: 'survivor',
        subtype: 'archivist',
        name: 'The archivist',
        x: 1140,
        y: 630,
        radius: 15,
        active: false,
        state: 'waiting',
        hp: 100,
        maxHp: 100,
        timer: 0,
      });
    }
    const enemyCount = s.mission === 0 ? 1 : Math.min(4, 2 + Math.floor(s.mission / 6));
    const positions = [
      { x: 1340, y: 505 },
      { x: 1160, y: 640 },
      { x: 590, y: 400 },
      { x: 390, y: 550 },
    ];
    for (let index = 0; index < enemyCount; index++) {
      const position = shifted(positions[index], 18);
      const maxHp = 84 + Math.min(42, Math.floor(s.mission / 3) * 6);
      entities.push({
        id: `sentinel-${index}`,
        kind: 'enemy',
        subtype: index % 2 ? 'warden' : 'sentinel',
        name: index % 2 ? 'Echo warden' : 'Quiet sentinel',
        ...position,
        homeX: position.x,
        homeY: position.y,
        radius: 20,
        hp: maxHp,
        maxHp,
        active: false,
        state: 'idle',
        timer: rng() * 0.4,
        phase: rng() * Math.PI * 2,
      });
    }
    s.entities = entities;
    s.projectiles = [];
    s.effects = [];
    s.player = freshPlayer(s.player.vessel, s.player.fragments);
    s.levelTime = 0;
    s.catalog = [];
    s.relays = [];
    s.rescued = false;
    s.relayErrors = 0;
    s.missionStats = freshStats();
    s.missionTitle = s.mission < 3 ? TITLES[s.mission] : `Unlicensed crossing ${s.mission - 2}`;
    this.effect('arrival', SPAWN, 1.6, 100);
  }

  update(dt: number, input: InputState = BLANK_INPUT): void {
    if (!finite(dt) || dt <= 0 || this.state.phase !== 'playing') return;
    // Resume from a background browser tab without a burst of simulation or damage.
    let remaining = Math.min(dt, 0.25);
    const safeInput: InputState = {
      x: finite(input.x) ? clamp(input.x, -1, 1) : 0,
      y: finite(input.y) ? clamp(input.y, -1, 1) : 0,
      running: Boolean(input.running),
      aim: input.aim && finite(input.aim.x) && finite(input.aim.y) ? input.aim : this.state.player,
    };
    while (remaining > 0.000001 && this.state.phase === 'playing') {
      const step = Math.min(remaining, 1 / 60);
      this.step(step, safeInput);
      remaining -= step;
    }
  }

  private step(dt: number, input: InputState): void {
    const s = this.state,
      p = s.player;
    s.time += dt;
    s.levelTime += dt;
    this.messageCooldown = Math.max(0, this.messageCooldown - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    for (const kind of Object.keys(p.cooldowns) as ActionKind[])
      p.cooldowns[kind] = Math.max(0, p.cooldowns[kind] - dt);
    p.weaponCharge = Math.max(0, p.weaponCharge - dt * 3);
    const magnitude = Math.hypot(input.x, input.y);
    p.moving = magnitude > 0.001;
    p.running = p.moving && input.running && p.stamina > 1 && p.dashing <= 0;
    if (p.dashing > 0) {
      this.move(p, p.facing.x * 640 * dt, p.facing.y * 640 * ISO_Y * dt);
      p.dashing = Math.max(0, p.dashing - dt);
    } else if (p.moving) {
      const x = input.x / Math.max(1, magnitude),
        y = input.y / Math.max(1, magnitude);
      p.facing = { x, y };
      const speed = p.running ? 278 : 180;
      this.move(p, x * speed * dt, y * speed * ISO_Y * dt);
    }
    p.stamina = clamp(p.stamina + (p.running ? -22 : p.dashing > 0 ? 0 : 24) * dt, 0, p.maxStamina);
    for (const entity of s.entities) {
      if (entity.kind === 'enemy') this.updateEnemy(entity, dt);
      else if (entity.kind === 'survivor') this.updateSurvivor(entity, dt);
      if (s.phase !== 'playing') break;
    }
    this.updateProjectiles(dt);
    for (const effect of s.effects) effect.life -= dt;
    s.effects = s.effects.filter((effect) => effect.life > 0);
    const portal = s.entities.find((entity) => entity.kind === 'portal');
    if (portal) portal.active = this.missionReady();
  }

  private move(object: Vec2, dx: number, dy: number, radius = 12): boolean {
    // Subdivide displacement as well as time: dashes cannot tunnel through pillars.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy / ISO_Y) / 7));
    let moved = false;
    for (let i = 0; i < steps; i++) {
      const x = dx / steps,
        y = dy / steps;
      if (isWalkable({ x: object.x + x, y: object.y + y }, radius)) {
        object.x += x;
        object.y += y;
        moved = true;
      } else {
        if (isWalkable({ x: object.x + x, y: object.y }, radius)) {
          object.x += x;
          moved = true;
        }
        if (isWalkable({ x: object.x, y: object.y + y }, radius)) {
          object.y += y;
          moved = true;
        }
      }
    }
    return moved;
  }

  private moveToward(entity: Entity, target: Vec2, speed: number, dt: number): void {
    const vector = direction(entity, target);
    const before = { x: entity.x, y: entity.y };
    this.move(entity, vector.x * speed * dt, vector.y * speed * ISO_Y * dt, entity.radius * 0.65);
    if (distance(entity, before) < speed * dt * 0.2) {
      // A deterministic tangent lets followers and sentinels round a pillar.
      const side = entity.id.length % 2 ? 1 : -1;
      this.move(
        entity,
        -vector.y * side * speed * dt,
        vector.x * side * speed * ISO_Y * dt,
        entity.radius * 0.65,
      );
    }
  }

  action(kind: ActionKind, target?: Vec2): boolean {
    const s = this.state,
      p = s.player;
    if (s.phase !== 'playing' || !(kind in p.cooldowns) || p.cooldowns[kind] > 0) return false;
    if (target && finite(target.x) && finite(target.y) && distance(target, p) > 1)
      p.facing = direction(p, target);
    if (kind === 'scan') return this.scan();
    if (kind === 'mend') return this.mend();
    const costs = { blade: 8, pulse: 14, dash: 28 };
    if (p.stamina < costs[kind]) {
      this.message('Connection energy low. Ease your pace.');
      return false;
    }
    p.stamina -= costs[kind];
    if (kind === 'dash') {
      p.cooldowns.dash = 0.8;
      p.dashing = 0.19;
      p.invulnerable = Math.max(p.invulnerable, 0.38);
      this.effect('dash', p, 0.42, 55);
      this.emit('dash', undefined, p);
    } else if (kind === 'blade') {
      p.cooldowns.blade = s.weapon.bladeCooldown;
      p.weaponCharge = 1;
      this.effect('blade', p, 0.25, 108, Math.atan2(p.facing.y * ISO_Y, p.facing.x));
      this.emit('blade', undefined, p);
      for (const entity of [...s.entities]) {
        if (!this.damageable(entity) || distance(p, entity) > 100 + entity.radius) continue;
        const vector = direction(p, entity);
        if (vector.x * p.facing.x + vector.y * p.facing.y >= -0.1)
          this.damageEntity(entity, s.weapon.bladeDamage);
      }
    } else {
      p.cooldowns.pulse = s.weapon.pulseCooldown;
      p.weaponCharge = 1;
      s.projectiles.push({
        id: this.id('pulse'),
        x: p.x + p.facing.x * 24,
        y: p.y + p.facing.y * 24 * ISO_Y,
        vx: p.facing.x * 620,
        vy: p.facing.y * 620 * ISO_Y,
        radius: 7,
        life: s.weapon.pulseRange / 620,
        damage: s.weapon.pulseDamage,
        owner: 'player',
      });
      this.effect('pulse', p, 0.18, 28);
      this.emit('pulse', undefined, p);
    }
    return true;
  }

  private scan(): boolean {
    const entity = this.nearest((entity) => entity.kind === 'species' && !entity.scanned, 128);
    if (!entity) {
      this.message('Move closer to an uncataloged lifeform.');
      return false;
    }
    entity.scanned = true;
    this.state.catalog.push(entity.id);
    this.state.player.fragments++;
    this.state.player.cooldowns.scan = 0.55;
    this.state.missionStats.scans++;
    this.effect('scan', entity, 1.25, 90);
    this.emit(
      'scan',
      `${entity.name} cataloged${entity.state === 'dead' ? ' from remains' : ''}. +1 memory shard.`,
      entity,
      this.state.catalog.length,
    );
    if (this.state.mission % 3 === 0 && this.state.catalog.length === 3)
      this.emit('objective', 'Survey complete. Return to the transfer gate.', PORTAL);
    this.refreshPortal();
    return true;
  }

  private mend(): boolean {
    const s = this.state,
      p = s.player;
    if (p.fragments < 1) {
      this.message('A memory shard is needed to mend this body.');
      return false;
    }
    if (p.hp === p.maxHp && s.integrity === 100) {
      this.message('Body and world are already whole.');
      return false;
    }
    p.fragments--;
    const restored = Math.min(28, p.maxHp - p.hp);
    p.hp = Math.min(p.maxHp, p.hp + 28);
    p.cooldowns.mend = 2.5;
    s.integrity = Math.min(100, s.integrity + 3);
    s.mends++;
    s.missionStats.mends++;
    this.effect('mend', p, 1, 100);
    this.emit(
      'mend',
      `Borrowed body mended. +${Math.round(restored)} vitality; +3 integrity.`,
      p,
      restored,
    );
    return true;
  }

  getInteraction(): Interaction | null {
    if (this.state.phase !== 'playing') return null;
    const entity = this.interactable();
    if (!entity) return null;
    let label = '';
    if (entity.kind === 'species') label = `Catalog ${entity.name}`;
    else if (entity.kind === 'relay')
      label = entity.active ? `${entity.name} is aligned` : `Align ${entity.name}`;
    else if (entity.kind === 'survivor')
      label = entity.state === 'following' ? 'The archivist is following' : 'Help the archivist';
    else if (entity.kind === 'drop') label = `Recover ${entity.fragments ?? 0} memory shards`;
    else if (entity.kind === 'portal')
      label = this.missionReady() ? 'Return through the gate' : 'Assignment unfinished';
    return { label, entityId: entity.id, x: entity.x, y: entity.y };
  }

  private interactable(): Entity | undefined {
    return this.nearest((entity) => {
      if (entity.kind === 'species') return !entity.scanned;
      if (entity.kind === 'survivor') return entity.state !== 'rescued';
      return entity.kind === 'relay' || entity.kind === 'drop' || entity.kind === 'portal';
    }, 128);
  }

  interact(): boolean {
    if (this.state.phase !== 'playing') return false;
    const entity = this.interactable();
    if (!entity) {
      this.message('Nothing within reach. Explore the island.');
      return false;
    }
    if (entity.kind === 'species') return this.action('scan');
    if (entity.kind === 'relay') return this.activateRelay(entity);
    if (entity.kind === 'drop') {
      const amount = entity.fragments ?? 0;
      this.state.player.fragments += amount;
      this.state.entities = this.state.entities.filter((item) => item.id !== entity.id);
      this.effect('collect', entity, 0.8, 70);
      this.emit(
        'collect',
        `Recovered ${amount} memory shard${amount === 1 ? '' : 's'} from your previous host.`,
        entity,
        amount,
      );
      return true;
    }
    if (entity.kind === 'survivor') {
      if (entity.state === 'following') {
        this.message('Stay close. Lead the archivist back to the gate.');
        return false;
      }
      entity.active = true;
      entity.state = 'following';
      this.effect('rescue', entity, 1, 80);
      this.emit(
        'rescue',
        '“They are selling our tomorrows.” Lead the archivist to the gate.',
        entity,
      );
      return true;
    }
    if (entity.kind === 'portal') {
      if (!this.missionReady()) {
        this.message(
          this.state.mission % 3 === 2
            ? 'Bring the archivist safely to the gate first.'
            : 'Finish the assignment before returning.',
        );
        return false;
      }
      this.completeMission();
      return true;
    }
    return false;
  }

  private activateRelay(entity: Entity): boolean {
    const s = this.state;
    if (entity.active) {
      this.message(`${entity.name} already aligned. Follow the numbered sequence.`);
      return false;
    }
    if (entity.order !== s.relays.length) {
      s.relays = [];
      s.relayErrors++;
      s.integrity = Math.max(0, s.integrity - 2);
      for (const relay of s.entities.filter((item) => item.kind === 'relay')) relay.active = false;
      this.effect('error', entity, 0.8, 110);
      this.emit('error', 'Sequence rejected. Align I · MOSS → II · EMBER → III · TIDE.', entity);
      this.refreshPortal();
      return false;
    }
    entity.active = true;
    s.relays.push(entity.order!);
    if (!entity.rewarded) {
      s.player.fragments++;
      entity.rewarded = true;
    }
    this.effect('relay', entity, 1.4, 125);
    this.emit('relay', `${entity.name} aligned. ${s.relays.length}/3.`, entity, s.relays.length);
    if (s.relays.length === 1) {
      for (const enemy of s.entities.filter(
        (item) => item.kind === 'enemy' && item.state !== 'dead',
      ))
        enemy.active = true;
      this.emit('message', 'The adjustment woke the sentinels. Keep moving.');
    }
    if (s.relays.length === 3)
      this.emit(
        'objective',
        'The lattice holds. Return to the gate. No casualties required.',
        PORTAL,
      );
    this.refreshPortal();
    return true;
  }

  private updateEnemy(enemy: Entity, dt: number): void {
    if (enemy.state === 'dead' || (enemy.hp ?? 0) <= 0) return;
    const s = this.state,
      p = s.player;
    const range = distance(enemy, p);
    enemy.timer = Math.max(0, (enemy.timer ?? 0) - dt);
    if (enemy.state === 'windup') {
      if (enemy.timer! <= 0) {
        this.effect('enemyAttack', enemy, 0.3, 72);
        if (range < 77 && distance(p, PORTAL) > 88)
          this.damagePlayer(13 + Math.min(5, Math.floor(s.mission / 3)), enemy);
        enemy.state = 'recovering';
        enemy.timer = 0.9;
      }
      return;
    }
    if (enemy.state === 'recovering' && enemy.timer! > 0) return;
    if (!enemy.active && range < (s.mission === 0 ? 170 : 230) && distance(p, PORTAL) > 105) {
      enemy.active = true;
      this.emit('alert', 'A sentinel noticed your presence.', enemy);
      this.effect('alert', enemy, 0.85, 45);
    }
    if (!enemy.active) {
      enemy.state = 'idle';
      return;
    }
    if (distance(p, PORTAL) < 88 || range > 620) {
      const home = { x: enemy.homeX ?? enemy.x, y: enemy.homeY ?? enemy.y };
      if (distance(enemy, home) > 12) this.moveToward(enemy, home, 72, dt);
      else {
        enemy.active = false;
        enemy.state = 'idle';
      }
      return;
    }
    if (range < 64 && enemy.timer! <= 0) {
      enemy.state = 'windup';
      enemy.timer = 0.64;
      this.effect('warning', enemy, 0.64, 74);
      this.emit('warning', undefined, enemy);
    } else {
      enemy.state = 'pursuing';
      this.moveToward(enemy, p, 94 + Math.min(30, s.mission * 3), dt);
    }
  }

  private updateSurvivor(entity: Entity, dt: number): void {
    if (entity.state !== 'following') return;
    const p = this.state.player;
    const range = distance(entity, p);
    if (range > 44 && range < 620) this.moveToward(entity, p, range > 160 ? 250 : 178, dt);
    if (distance(entity, PORTAL) < 105 && distance(p, PORTAL) < 130) {
      entity.state = 'rescued';
      entity.active = true;
      this.state.rescued = true;
      this.state.player.fragments += 2;
      this.state.integrity = Math.min(100, this.state.integrity + 6);
      this.effect('rescue', entity, 1.6, 120);
      this.emit('objective', 'The archivist is safe. The gate can take you both home.', PORTAL);
      this.refreshPortal();
    }
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of this.state.projectiles) {
      const travelTime = Math.min(dt, projectile.life);
      projectile.life -= dt;
      projectile.x += projectile.vx * travelTime;
      projectile.y += projectile.vy * travelTime;
      if (
        !pointInPolygon(projectile) ||
        OBSTACLES.some((obstacle) => distance(projectile, obstacle) < obstacle.radius)
      ) {
        projectile.life = 0;
        this.effect('spark', projectile, 0.2, 20);
        continue;
      }
      const hit = this.state.entities.find(
        (entity) =>
          this.damageable(entity) &&
          distance(projectile, entity) < entity.radius + projectile.radius,
      );
      if (hit) {
        this.damageEntity(hit, projectile.damage);
        projectile.life = 0;
      }
    }
    this.state.projectiles = this.state.projectiles.filter((projectile) => projectile.life > 0);
  }

  private damageable(entity: Entity): boolean {
    return (
      (entity.kind === 'enemy' || entity.kind === 'species') &&
      entity.state !== 'dead' &&
      (entity.hp ?? 0) > 0
    );
  }

  private damageEntity(entity: Entity, amount: number): void {
    const s = this.state;
    entity.hp = Math.max(0, (entity.hp ?? 0) - amount);
    this.effect('hit', entity, 0.3, 45, undefined, `−${amount}`);
    this.emit('hit', undefined, entity, amount);
    if (entity.kind === 'enemy') {
      entity.active = true;
      if (entity.state !== 'windup') {
        entity.state = 'recovering';
        entity.timer = 0.15;
      }
    } else {
      s.integrity = Math.max(0, s.integrity - 5);
      this.emit('consequence', 'Unassigned harm recorded. World integrity −5.', entity, -5);
    }
    if (entity.hp <= 0) {
      entity.state = 'dead';
      entity.active = false;
      const cost = entity.kind === 'species' ? 10 : 12;
      s.integrity = Math.max(0, s.integrity - cost);
      if (entity.kind === 'enemy') {
        s.kills++;
        s.missionStats.kills++;
        s.player.fragments++;
        this.emit('kill', 'A local life ended. World integrity −12. +1 memory shard.', entity);
      } else
        this.emit(
          'consequence',
          `${entity.name} destroyed. Its remains can still be cataloged.`,
          entity,
          -10,
        );
      this.effect('dissolve', entity, 1, 70);
    }
  }

  private damagePlayer(amount: number, source: Vec2): void {
    const s = this.state,
      p = s.player;
    if (s.phase !== 'playing' || p.invulnerable > 0 || p.dashing > 0) return;
    p.hp = Math.max(0, p.hp - amount);
    p.invulnerable = 0.78;
    s.missionStats.damage += amount;
    this.effect('damage', p, 0.5, 60, undefined, `−${amount}`);
    this.emit('damage', undefined, p, amount);
    const knockback = direction(source, p);
    this.move(p, knockback.x * 21, knockback.y * 21 * ISO_Y);
    if (p.hp <= 0) this.die();
  }

  private die(): void {
    const s = this.state,
      p = s.player;
    s.phase = 'dead';
    s.integrity = Math.max(0, s.integrity - 8);
    s.missionStats.hostsLost++;
    s.entities.push({
      id: this.id('drop'),
      kind: 'drop',
      subtype: 'memory',
      name: `Host ${p.vessel}'s belongings`,
      x: p.x,
      y: p.y,
      radius: 18,
      fragments: p.fragments,
      active: true,
    });
    p.fragments = 0;
    p.dashing = 0;
    p.moving = false;
    p.running = false;
    this.effect('death', p, 2, 125);
    this.emit('death', 'Host connection lost. Your belongings remain where this life ended.', p);
  }

  reincarnate(): boolean {
    const s = this.state;
    if (s.phase !== 'dead') return false;
    s.player = freshPlayer(s.player.vessel + 1, 0);
    s.phase = 'playing';
    s.projectiles = [];
    s.effects = [];
    for (const enemy of s.entities.filter(
      (entity) => entity.kind === 'enemy' && entity.state !== 'dead',
    )) {
      enemy.x = enemy.homeX ?? enemy.x;
      enemy.y = enemy.homeY ?? enemy.y;
      enemy.state = 'idle';
      enemy.active = false;
      enemy.timer = 1;
    }
    const follower = s.entities.find(
      (entity) => entity.kind === 'survivor' && entity.state === 'following',
    );
    if (follower) {
      follower.state = 'waiting';
      follower.active = false;
    }
    this.effect('arrival', s.player, 1.5, 120);
    this.emit(
      'reincarnate',
      `Host ${s.player.vessel} connected. The world remembers. Recover your memory shards.`,
      s.player,
      s.player.vessel,
    );
    return true;
  }

  private missionReady(): boolean {
    const s = this.state;
    if (s.mission % 3 === 0) return s.catalog.length >= 3;
    if (s.mission % 3 === 1) return s.relays.length === 3;
    return s.rescued;
  }

  private refreshPortal(): void {
    const portal = this.state.entities.find((entity) => entity.kind === 'portal');
    if (portal) portal.active = this.missionReady();
  }

  private completeMission(): void {
    const s = this.state;
    s.phase = s.mission === 2 ? 'reveal' : 'complete';
    s.player.moving = false;
    s.player.running = false;
    s.history.push({
      mission: s.mission,
      title: s.missionTitle,
      integrity: Math.round(s.integrity),
      kills: s.missionStats.kills,
      mends: s.missionStats.mends,
      vessel: s.player.vessel,
      worldSeed: s.worldSeed,
      time: s.levelTime,
      report: this.getDebrief().summary,
    });
    this.emit(
      s.phase === 'reveal' ? 'reveal' : 'complete',
      s.phase === 'reveal'
        ? 'ACCESS OVERRIDE: you are not saving worlds. You are editing them for the highest bidder.'
        : 'Transfer complete. Your intervention has been recorded.',
      PORTAL,
    );
  }

  nextMission(): boolean {
    const s = this.state;
    if (s.phase !== 'complete' && s.phase !== 'reveal') return false;
    s.mission++;
    s.endless = s.mission >= 3;
    s.phase = 'playing';
    // The next world's seed remembers the footprint; a new world starts intact.
    this.buildWorld();
    s.integrity = 100;
    this.emit(
      'deploy',
      s.mission === 1
        ? 'Align the relay lattice: I · MOSS → II · EMBER → III · TIDE.'
        : s.mission === 2
          ? 'Locate the archivist. Bring a living witness to the gate.'
          : `Independent crossing ${s.mission - 2}. The next choice is yours.`,
      SPAWN,
    );
    return true;
  }

  getObjective(): Objective {
    const s = this.state;
    const ready = this.missionReady();
    if (s.mission % 3 === 0)
      return {
        title:
          s.mission < 3
            ? '01 / FIELD SURVEY'
            : `${String(s.mission + 1).padStart(2, '0')} / FREE EXPLORATION`,
        description:
          'Catalog three native lifeforms. The contract asks for observation. Every life you leave intact matters.',
        tasks: [
          {
            label: 'Catalog Lumen cap',
            done: s.entities.some((entity) => entity.subtype === 'mushroom' && entity.scanned),
          },
          {
            label: 'Catalog Glass fern',
            done: s.entities.some((entity) => entity.subtype === 'crystal' && entity.scanned),
          },
          {
            label: 'Catalog Prism stag',
            done: s.entities.some((entity) => entity.subtype === 'deer' && entity.scanned),
          },
          {
            label: ready ? 'Return to the transfer gate' : 'Return after the survey',
            done: s.phase !== 'playing' && s.phase !== 'dead',
            progress: `${s.catalog.length} / 3`,
          },
        ],
      };
    if (s.mission % 3 === 1)
      return {
        title:
          s.mission < 3
            ? '02 / LATTICE ADJUSTMENT'
            : `${String(s.mission + 1).padStart(2, '0')} / FREE ALIGNMENT`,
        description:
          'Align the three relays in order. A rejected sequence resets the lattice. Sentinels can be avoided.',
        tasks: [
          ...STATION_NAMES.map((name, index) => ({
            label: `Align ${name}`,
            done: s.relays.includes(index),
          })),
          {
            label: 'Return to the transfer gate',
            done: s.phase !== 'playing' && s.phase !== 'dead',
            progress: `${s.relays.length} / 3`,
          },
        ],
      };
    const archivist = s.entities.find((entity) => entity.kind === 'survivor');
    return {
      title:
        s.mission < 3
          ? '03 / LIVING EVIDENCE'
          : `${String(s.mission + 1).padStart(2, '0')} / FREE PASSAGE`,
      description:
        'Find the archivist in the southeast. Stay close while they follow you back to the transfer gate.',
      tasks: [
        { label: 'Reach the archivist', done: archivist?.state === 'following' || s.rescued },
        { label: 'Escort the archivist to the gate', done: s.rescued },
        { label: 'Transfer with the witness', done: s.phase !== 'playing' && s.phase !== 'dead' },
      ],
    };
  }

  getDebrief(): { rating: string; summary: string; footprint: number } {
    const s = this.state;
    const rating =
      s.integrity >= 96
        ? 'LIGHT FOOTPRINT'
        : s.integrity >= 75
          ? 'VISIBLE TRACE'
          : s.integrity >= 45
            ? 'WORLD DISTURBED'
            : 'HEAVY INTERVENTION';
    let summary =
      s.integrity >= 96
        ? 'You completed the assignment without taking more than it asked. This world still belongs to its inhabitants.'
        : s.integrity >= 75
          ? 'The assignment is complete. Small disturbances remain in the lives you passed through.'
          : 'The assignment is complete, but its inhabitants will carry the cost of your intervention.';
    if (s.mission === 1)
      summary +=
        ' The lattice rerouted a river of possibility. Your employer has not disclosed the buyer.';
    if (s.mission === 2)
      summary =
        'The archivist brought proof: VERSO auctions changes in other worlds. Your first survey was a valuation. Your second mission prepared a sale. You can now cross on your own terms.';
    return { rating, summary, footprint: Math.round(100 - s.integrity) };
  }

  serialize(): SavedGame {
    return { version: 1, state: copy(this.state) };
  }

  static restore(data: unknown): Game {
    // Bound both file imports and local-storage restores before cloning or visiting
    // nested records. A malformed save must never become live renderer input.
    let encoded: string;
    try {
      encoded = typeof data === 'string' ? data : JSON.stringify(data);
    } catch {
      throw new Error('The saved crossing is not valid JSON.');
    }
    if (typeof encoded !== 'string' || encoded.length > 1_000_000)
      throw new Error('The saved crossing is too large or empty.');
    try {
      data = JSON.parse(encoded);
    } catch {
      throw new Error('The saved crossing is not valid JSON.');
    }
    if (
      !data ||
      typeof data !== 'object' ||
      !('version' in data) ||
      data.version !== 1 ||
      !('state' in data)
    )
      throw new Error('This saved crossing has an unsupported format.');
    const s = data.state as GameState;
    const bounded = (value: unknown, min: number, max: number): value is number =>
      finite(value) && value >= min && value <= max;
    const integer = (value: unknown, min = 0, max = 1_000_000): value is number =>
      bounded(value, min, max) && Number.isInteger(value);
    const textField = (value: unknown, max = 200): value is string =>
      typeof value === 'string' && value.length <= max;
    const flag = (value: unknown): value is boolean => typeof value === 'boolean';
    const coordinate = (point: Vec2): boolean =>
      !!point && bounded(point.x, 0, WORLD_WIDTH) && bounded(point.y, 0, WORLD_HEIGHT);
    const health = (entity: { hp?: number; maxHp?: number }): boolean =>
      bounded(entity.maxHp, 1, 1000) && bounded(entity.hp, 0, entity.maxHp);
    const seed = (value: unknown): boolean => integer(value, 0, 0xffffffff);
    const finished = s?.phase === 'complete' || s?.phase === 'reveal';
    if (
      !s ||
      typeof s !== 'object' ||
      !integer(s.mission, 0, 100000) ||
      !seed(s.seed) ||
      !seed(s.worldSeed) ||
      !bounded(s.time, 0, 1e12) ||
      !bounded(s.levelTime, 0, s.time + 0.001) ||
      !bounded(s.integrity, 0, 100) ||
      !integer(s.kills) ||
      !integer(s.mends) ||
      !integer(s.relayErrors) ||
      !integer(s.nextId, 1, Number.MAX_SAFE_INTEGER) ||
      !['playing', 'dead', 'complete', 'reveal'].includes(s.phase) ||
      !textField(s.name, 24) ||
      !s.name.trim() ||
      !textField(s.missionTitle) ||
      !flag(s.rescued) ||
      !flag(s.endless) ||
      s.endless !== s.mission >= 3 ||
      !Array.isArray(s.entities) ||
      s.entities.length > 200 ||
      !Array.isArray(s.catalog) ||
      s.catalog.length > 3 ||
      !Array.isArray(s.relays) ||
      s.relays.length > 3 ||
      !Array.isArray(s.history) ||
      s.history.length !== s.mission + (finished ? 1 : 0) ||
      !Array.isArray(s.projectiles) ||
      s.projectiles.length > 100 ||
      !Array.isArray(s.effects) ||
      s.effects.length > 100 ||
      !s.missionStats ||
      ['kills', 'mends', 'scans', 'damage', 'hostsLost'].some(
        (key) => !integer(s.missionStats[key as keyof MissionStats]),
      )
    )
      throw new Error('This saved crossing is incomplete.');
    const expectedWeapon = generateWeapon(s.worldSeed);
    if (
      'weapon' in s &&
      (!s.weapon ||
        typeof s.weapon !== 'object' ||
        (Object.keys(expectedWeapon) as (keyof WeaponProfile)[]).some(
          (key) => s.weapon[key] !== expectedWeapon[key],
        ))
    )
      throw new Error('The saved equipment does not match this world.');
    // Version 1 saves from before equipment was introduced derive their kit from
    // the existing world seed. A supplied profile must match that same derivation.
    s.weapon = expectedWeapon;
    if (
      s.history.some(
        (entry, index) =>
          !entry ||
          !textField(entry.title) ||
          !textField(entry.report, 2000) ||
          entry.mission !== index ||
          !bounded(entry.integrity, 0, 100) ||
          !integer(entry.kills) ||
          !integer(entry.mends) ||
          !integer(entry.vessel, 1) ||
          !seed(entry.worldSeed) ||
          !bounded(entry.time, 0, s.time + 0.001),
      )
    )
      throw new Error('The saved field record is invalid.');
    const p = s.player;
    const relocated = !!p && coordinate(p) && relocateLegacyPosition(p, 12);
    if (
      !p ||
      !coordinate(p) ||
      !isWalkable(p, 12) ||
      !health(p) ||
      !bounded(p.maxStamina, 1, 1000) ||
      !bounded(p.stamina, 0, p.maxStamina) ||
      !integer(p.vessel, 1) ||
      !integer(p.fragments) ||
      !bounded(p.dashing, 0, 0.2) ||
      !bounded(p.invulnerable, 0, 30) ||
      !bounded(p.weaponCharge, 0, 1) ||
      !flag(p.moving) ||
      !flag(p.running) ||
      !p.facing ||
      !finite(p.facing.x) ||
      !finite(p.facing.y) ||
      Math.hypot(p.facing.x, p.facing.y) > 1.01 ||
      !p.cooldowns ||
      (['blade', 'pulse', 'dash', 'scan', 'mend'] as ActionKind[]).some(
        (kind) => !bounded(p.cooldowns[kind], 0, 10),
      ) ||
      (s.phase === 'dead') !== (p.hp === 0)
    )
      throw new Error('The saved host is invalid.');
    const entityIds = new Set<string>();
    for (const entity of s.entities) {
      if (entity && coordinate(entity))
        relocateLegacyPosition(entity, entity.kind === 'enemy' ? 13 : 0);
      if (
        !entity ||
        !textField(entity.id, 100) ||
        !entity.id ||
        entityIds.has(entity.id) ||
        !['species', 'enemy', 'relay', 'survivor', 'drop', 'portal'].includes(entity.kind) ||
        !coordinate(entity) ||
        !isWalkable(entity, 0) ||
        !bounded(entity.radius, 1, 200) ||
        (['subtype', 'name', 'state'] as const).some(
          (key) => entity[key] !== undefined && !textField(entity[key]),
        ) ||
        (['scanned', 'active', 'rewarded'] as const).some(
          (key) => entity[key] !== undefined && !flag(entity[key]),
        ) ||
        (['hp', 'maxHp', 'phase', 'timer', 'homeX', 'homeY', 'fragments'] as const).some(
          (key) => entity[key] !== undefined && !bounded(entity[key], 0, 1_000_000),
        )
      )
        throw new Error('The saved world contains invalid entities.');
      entityIds.add(entity.id);
      if (entity.kind === 'species' || entity.kind === 'enemy' || entity.kind === 'survivor') {
        if (!health(entity) || !flag(entity.active))
          throw new Error('The saved world contains invalid entities.');
      }
      if (
        entity.kind === 'species' &&
        (!['mushroom', 'crystal', 'deer'].includes(entity.subtype!) ||
          !flag(entity.scanned) ||
          !['idle', 'dead'].includes(entity.state!) ||
          (entity.state === 'dead') !== (entity.hp === 0))
      )
        throw new Error('The saved species record is invalid.');
      if (
        entity.kind === 'enemy' &&
        (!['idle', 'pursuing', 'windup', 'recovering', 'dead'].includes(entity.state!) ||
          (entity.state === 'dead') !== (entity.hp === 0) ||
          !bounded(entity.timer, 0, 10) ||
          !coordinate({ x: entity.homeX!, y: entity.homeY! }) ||
          !isWalkable({ x: entity.homeX!, y: entity.homeY! }, 0))
      )
        throw new Error('The saved sentinel is invalid.');
      if (entity.kind === 'relay' && (!integer(entity.order, 0, 2) || !flag(entity.active)))
        throw new Error('The saved relay sequence is invalid.');
      if (
        entity.kind === 'survivor' &&
        (!['waiting', 'following', 'rescued'].includes(entity.state!) ||
          entity.active !== (entity.state !== 'waiting'))
      )
        throw new Error('The saved witness is invalid.');
      if (entity.kind === 'drop' && !integer(entity.fragments))
        throw new Error('The saved belongings are invalid.');
      if (
        entity.kind === 'portal' &&
        (entity.x !== PORTAL.x || entity.y !== PORTAL.y || !flag(entity.active))
      )
        throw new Error('The saved gate is invalid.');
    }
    const species = s.entities.filter((entity) => entity.kind === 'species');
    const relays = s.entities.filter((entity) => entity.kind === 'relay');
    const survivor = s.entities.filter((entity) => entity.kind === 'survivor');
    const enemies = s.entities.filter((entity) => entity.kind === 'enemy');
    if (
      species.length !== 3 ||
      new Set(species.map((entity) => entity.subtype)).size !== 3 ||
      s.entities.filter((entity) => entity.kind === 'portal').length !== 1 ||
      relays.length !== (s.mission % 3 === 1 ? 3 : 0) ||
      new Set(relays.map((entity) => entity.order)).size !== relays.length ||
      survivor.length !== (s.mission % 3 === 2 ? 1 : 0) ||
      enemies.length < 1 ||
      enemies.length > 4
    )
      throw new Error('The saved assignment is missing required entities.');
    const scannedIds = species.filter((entity) => entity.scanned).map((entity) => entity.id);
    const activeRelays = relays
      .filter((entity) => entity.active)
      .map((entity) => entity.order!)
      .sort((a, b) => a - b);
    if (
      s.catalog.some((id) => typeof id !== 'string' || !scannedIds.includes(id)) ||
      new Set(s.catalog).size !== s.catalog.length ||
      s.catalog.length !== scannedIds.length ||
      s.relays.some((order, index) => order !== index || order !== activeRelays[index]) ||
      s.relays.length !== activeRelays.length ||
      activeRelays.some((order, index) => order !== index) ||
      s.rescued !== (survivor[0]?.state === 'rescued')
    )
      throw new Error('The saved assignment progress is inconsistent.');
    if (
      s.projectiles.some(
        (projectile) =>
          !projectile ||
          !coordinate(projectile) ||
          !textField(projectile.id, 100) ||
          !bounded(projectile.vx, -10000, 10000) ||
          !bounded(projectile.vy, -10000, 10000) ||
          !bounded(projectile.life, 0, 30) ||
          !bounded(projectile.damage, 0, 1000) ||
          !bounded(projectile.radius, 1, 100) ||
          !['player', 'enemy'].includes(projectile.owner),
      )
    )
      throw new Error('The saved projectiles are invalid.');
    if (
      s.effects.some(
        (effect) =>
          !effect ||
          !coordinate(effect) ||
          !textField(effect.id, 100) ||
          !textField(effect.kind, 100) ||
          !bounded(effect.maxLife, 0.001, 30) ||
          !bounded(effect.life, 0, effect.maxLife) ||
          !bounded(effect.radius, 0, 1000) ||
          (effect.angle !== undefined && !bounded(effect.angle, -Math.PI * 2, Math.PI * 2)) ||
          (effect.text !== undefined && !textField(effect.text, 200)),
      )
    )
      throw new Error('The saved effects are invalid.');
    const ready =
      s.mission % 3 === 0
        ? scannedIds.length === 3
        : s.mission % 3 === 1
          ? activeRelays.length === 3
          : s.rescued;
    if (
      (finished && !ready) ||
      (s.phase === 'reveal' && s.mission !== 2) ||
      (s.phase === 'complete' && s.mission === 2)
    )
      throw new Error('The saved crossing has an invalid completion state.');
    const game = new Game(s.name, s.seed);
    s.catalog = scannedIds;
    s.relays = activeRelays;
    // Ephemeral animations do not belong across browser sessions.
    s.effects = [];
    s.projectiles = [];
    p.moving = false;
    p.running = false;
    p.dashing = 0;
    p.invulnerable = Math.max(1.2, p.invulnerable);
    game.state = s;
    game.events = [];
    game.refreshPortal();
    game.emit(
      'resume',
      relocated
        ? 'The island shifted. Your host has been returned to solid ground.'
        : 'Crossing restored. This world remembers your last visit.',
    );
    return game;
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private nearest(predicate: (entity: Entity) => boolean, range: number): Entity | undefined {
    let closest: Entity | undefined;
    let best = range;
    for (const entity of this.state.entities) {
      const d = distance(this.state.player, entity);
      if (predicate(entity) && d <= best) {
        closest = entity;
        best = d;
      }
    }
    return closest;
  }

  private id(prefix: string): string {
    return `${prefix}-${this.state.nextId++}`;
  }

  private effect(
    kind: string,
    point: Vec2,
    life: number,
    radius: number,
    angle?: number,
    text?: string,
  ): void {
    this.state.effects.push({
      id: this.id(kind),
      kind,
      x: point.x,
      y: point.y,
      life,
      maxLife: life,
      radius,
      angle,
      text,
    });
    if (this.state.effects.length > 100) this.state.effects.shift();
  }

  private emit(type: string, text?: string, point?: Vec2, value?: number): void {
    this.events.push({ type, text, x: point?.x, y: point?.y, value });
    if (this.events.length > 100) this.events.shift();
  }

  private message(text: string): void {
    if (this.messageCooldown <= 0) {
      this.emit('message', text);
      this.messageCooldown = 1.4;
    }
  }
}
