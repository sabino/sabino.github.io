import type { Effect, Point } from './types.ts';

/** Presentation data only: these values never determine damage, collision, drops or time. */
export type CombatCueKind =
  | 'anticipation'
  | 'charge'
  | 'melee'
  | 'projectile'
  | 'impact'
  | 'guard'
  | 'area'
  | 'dash'
  | 'death'
  | 'loot'
  | 'level'
  | 'status'
  | 'telegraph';
export interface CombatCue extends Point {
  id: string;
  kind: CombatCueKind;
  age: number;
  duration: number;
  heading?: number;
  /** World tiles, independent of viewport, zoom or device pixel ratio. */
  radius?: number;
  strength?: number;
  color?: string;
  actorId?: string;
  text?: string;
  shape?: 'cone' | 'line' | 'circle';
  halfAngle?: number;
  halfWidth?: number;
  style?: 'arc' | 'thrust' | 'cleave' | 'bolt';
  symbol?: 'heal' | 'burn' | 'chill' | 'stagger';
}
export interface CombatActor extends Point {
  id: string;
  bodyId?: string;
  hp: number;
  heading: number;
  weapon?: 'staff' | 'sword' | 'bow' | 'none';
  level?: number;
}
export interface FeedbackViewport {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export const COMBAT_FEEDBACK_LIMITS = Object.freeze({
  particles: 144,
  cues: 48,
  sourceEffects: 128,
  sourceCues: 64,
  actors: 128,
  remembered: 384,
  maxRadius: 14,
  maxCameraPixels: 2.5,
  maxDelta: 0.05,
});
export interface FeedbackSettings {
  intensity: number;
  reducedMotion: boolean;
}
export const feedbackSettings = (intensity = 0.7, reducedMotion = false): FeedbackSettings => ({
  intensity: Number.isFinite(intensity) ? clamp(intensity, 0, 1) : 0.7,
  reducedMotion: !!reducedMotion,
});
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const kinds = new Set<CombatCueKind>([
  'anticipation',
  'charge',
  'melee',
  'projectile',
  'impact',
  'guard',
  'area',
  'dash',
  'death',
  'loot',
  'level',
  'status',
  'telegraph',
]);
const colors = {
  steel: '#d8ded8',
  impact: '#e8c298',
  guard: '#91d4c2',
  hostile: '#e5a77d',
  loot: '#e5c66e',
  healing: '#b8d5a0',
  mind: '#afbade',
};
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Independent seeded visual stream; never consumes the procedural world's RNG. */
function visualRandom(seed: number) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}
export function validCombatCue(cue: CombatCue): boolean {
  return (
    !!cue &&
    typeof cue.id === 'string' &&
    cue.id.length > 0 &&
    cue.id.length <= 160 &&
    kinds.has(cue.kind) &&
    Number.isFinite(cue.x) &&
    Number.isFinite(cue.y) &&
    Number.isFinite(cue.age) &&
    cue.age >= 0 &&
    Number.isFinite(cue.duration) &&
    cue.duration > 0 &&
    cue.duration <= 20 &&
    cue.age < cue.duration &&
    (cue.heading === undefined || Number.isFinite(cue.heading)) &&
    (cue.radius === undefined ||
      (Number.isFinite(cue.radius) &&
        cue.radius > 0 &&
        cue.radius <= COMBAT_FEEDBACK_LIMITS.maxRadius)) &&
    (cue.strength === undefined ||
      (Number.isFinite(cue.strength) && cue.strength >= 0 && cue.strength <= 3)) &&
    (cue.color === undefined ||
      /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(cue.color)) &&
    (cue.actorId === undefined || (typeof cue.actorId === 'string' && cue.actorId.length <= 160)) &&
    (cue.text === undefined || (typeof cue.text === 'string' && cue.text.length <= 96)) &&
    (cue.shape === undefined || ['cone', 'line', 'circle'].includes(cue.shape)) &&
    (cue.halfAngle === undefined ||
      (Number.isFinite(cue.halfAngle) && cue.halfAngle > 0 && cue.halfAngle <= Math.PI)) &&
    (cue.halfWidth === undefined ||
      (Number.isFinite(cue.halfWidth) && cue.halfWidth > 0 && cue.halfWidth <= 3)) &&
    (cue.style === undefined || ['arc', 'thrust', 'cleave', 'bolt'].includes(cue.style)) &&
    (cue.symbol === undefined || ['heal', 'burn', 'chill', 'stagger'].includes(cue.symbol))
  );
}
export function legacyCombatCue(effect: Effect): CombatCue | null {
  const base = {
    id: `effect:${effect.id}`,
    x: effect.x,
    y: effect.y,
    age: effect.age,
    duration: effect.duration,
    heading: effect.heading,
    color: effect.color,
    actorId: effect.actorId,
    text: effect.text,
  };
  switch (effect.kind) {
    case 'slash':
      return { ...base, kind: 'melee', radius: 1.3 };
    case 'arrow':
      return { ...base, kind: 'projectile', radius: 0.25 };
    case 'ward':
      return { ...base, kind: 'guard', radius: 2.4 };
    case 'hurt':
      return { ...base, kind: 'impact', radius: 0.7 };
    case 'heal':
      return { ...base, kind: 'status', radius: 0.8, symbol: 'heal' };
    case 'ember':
      return { ...base, kind: 'status', radius: 0.5, symbol: 'burn' };
    case 'harvest':
      return effect.tool ? null : { ...base, kind: 'loot', radius: 0.55 };
    case 'speech':
      if (effect.text === 'Drawing bow' || effect.text === 'Striking')
        return {
          ...base,
          kind: 'telegraph',
          radius: effect.text === 'Drawing bow' ? 4.5 : 1.4,
          shape: effect.text === 'Drawing bow' ? 'line' : 'cone',
        };
      return null;
    default:
      return null;
  }
}

/** A short visual impact hold; simulation and network clocks continue without interruption. */
export function attackEnvelope(age: number, duration = 0.32, reduced = false) {
  if (!Number.isFinite(age) || age < 0 || age >= duration) return 0;
  if (reduced) return 0.3;
  const t = clamp(age / Math.max(0.1, duration), 0, 1);
  if (t < 0.13) return 0.18 + (t / 0.13) * 0.32;
  if (t < 0.38) return 0.5 + ((t - 0.13) / 0.25) * 0.5;
  if (t < 0.46) return 1;
  return (1 - (t - 0.46) / 0.54) ** 2;
}
export interface FeedbackParticle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  duration: number;
  size: number;
  color: string;
  kind: 'spark' | 'dust' | 'rune' | 'coin';
}
interface LiveCue extends CombatCue {
  frame: number;
  supplied: boolean;
}
interface PoseState {
  impact: number;
  strike: number;
  death: number;
  heading: number;
  power: number;
  prepare?: string;
}
export interface FeedbackPose {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  flash: number;
  attack: number;
  death: number | null;
}
const idlePose: FeedbackPose = Object.freeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  flash: 0,
  attack: 0,
  death: null,
});

/** Fixed particle pool + bounded cue/actor caches. No audio, DOM, networking or save access. */
export class CombatFeedback {
  readonly particles: FeedbackParticle[] = Array.from(
    { length: COMBAT_FEEDBACK_LIMITS.particles },
    () => ({
      alive: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      duration: 1,
      size: 1,
      color: colors.steel,
      kind: 'spark',
    }),
  );
  private cues = new Map<string, LiveCue>();
  private seen = new Map<string, number>();
  private actors = new Map<string, CombatActor>();
  private poses = new Map<string, PoseState>();
  private frame = 0;
  private now = 0;
  private lastTime = -1;
  private cursor = 0;
  private shakeUntil = 0;
  private shakePower = 0;
  private rejected = 0;
  private culled = 0;
  private dropped = 0;
  private updateMs = 0;
  private updateMaxMs = 0;
  settings = feedbackSettings();

  get activeCues(): IterableIterator<LiveCue> {
    return this.cues.values();
  }
  get diagnostics() {
    return {
      particles: this.particles.reduce((n, p) => n + Number(p.alive), 0),
      particleCapacity: this.particles.length,
      cues: this.cues.size,
      actors: this.actors.size,
      remembered: this.seen.size,
      rejected: this.rejected,
      culled: this.culled,
      dropped: this.dropped,
      updateMs: this.updateMs,
      updateMaxMs: this.updateMaxMs,
      intensity: this.settings.intensity,
      reducedMotion: this.settings.reducedMotion,
    };
  }
  reset() {
    this.cues.clear();
    this.seen.clear();
    this.actors.clear();
    this.poses.clear();
    for (const particle of this.particles) particle.alive = false;
    this.lastTime = -1;
    this.shakeUntil = 0;
    this.shakePower = 0;
  }
  update(
    now: number,
    effects: readonly Effect[],
    actors: readonly CombatActor[],
    viewport: FeedbackViewport,
    settings: FeedbackSettings = this.settings,
    supplied: readonly CombatCue[] = [],
  ) {
    if (!Number.isFinite(now)) return;
    const start = performance.now();
    if (now < this.lastTime) this.reset();
    this.settings = feedbackSettings(settings.intensity, settings.reducedMotion);
    const dt =
      this.lastTime < 0 ? 0 : clamp(now - this.lastTime, 0, COMBAT_FEEDBACK_LIMITS.maxDelta);
    this.lastTime = this.now = now;
    this.frame++;
    for (const cue of this.cues.values()) cue.age += dt;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.duration || this.settings.reducedMotion || this.settings.intensity === 0) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= (p.kind === 'rune' ? 0.8 : 5) * dt;
      p.vx *= Math.exp(-dt * 2);
      p.vy *= Math.exp(-dt * 2);
    }
    const current = actors.slice(0, COMBAT_FEEDBACK_LIMITS.actors);
    for (const actor of current) {
      if (![actor.x, actor.y, actor.hp, actor.heading].every(Number.isFinite)) continue;
      const previous = this.actors.get(actor.id);
      if (
        previous?.level !== undefined &&
        actor.level !== undefined &&
        Number.isInteger(actor.level) &&
        actor.level > previous.level
      )
        this.add(
          {
            id: `level:${actor.id}:${actor.level}`,
            kind: 'level',
            x: actor.x,
            y: actor.y,
            actorId: actor.id,
            age: 0,
            duration: 1.1,
            color: colors.loot,
            text: `Level ${actor.level}`,
          },
          viewport,
          false,
        );
      if (previous && previous.hp > 0 && actor.hp <= 0)
        this.add(
          {
            id: `death:${actor.id}:${this.frame}`,
            kind: 'death',
            x: actor.x,
            y: actor.y,
            actorId: actor.id,
            heading: actor.heading,
            age: 0,
            duration: 0.55,
            color: colors.impact,
          },
          viewport,
          false,
        );
      this.actors.set(actor.id, { ...actor });
    }
    const currentIds = new Set(current.map((a) => a.id));
    for (const id of this.actors.keys())
      if (!currentIds.has(id)) {
        this.actors.delete(id);
        this.poses.delete(id);
      }
    // Explicit authoritative geometry takes precedence over legacy visual approximations.
    for (let i = 0; i < Math.min(supplied.length, COMBAT_FEEDBACK_LIMITS.sourceCues); i++)
      this.add(supplied[i], viewport, true);
    for (let i = 0; i < Math.min(effects.length, COMBAT_FEEDBACK_LIMITS.sourceEffects); i++) {
      const cue = legacyCombatCue(effects[i]);
      const exactWarning =
        cue?.kind === 'telegraph' &&
        supplied
          .slice(0, COMBAT_FEEDBACK_LIMITS.sourceCues)
          .some(
            (provided) =>
              (provided.kind === 'telegraph' || provided.kind === 'anticipation') &&
              validCombatCue(provided) &&
              Math.hypot(provided.x - cue.x, provided.y - cue.y) < 0.25,
          );
      if (cue && !exactWarning) this.add(cue, viewport, true);
    }
    for (const [id, cue] of this.cues) {
      // A canceled charge/warning or collided projectile must disappear immediately.
      if (
        cue.age >= cue.duration ||
        (cue.frame !== this.frame &&
          cue.supplied &&
          ['projectile', 'charge', 'anticipation', 'telegraph'].includes(cue.kind))
      )
        this.cues.delete(id);
    }
    for (const [id, seenAt] of this.seen) if (now - seenAt > 20) this.seen.delete(id);
    while (this.seen.size > COMBAT_FEEDBACK_LIMITS.remembered)
      this.seen.delete(this.seen.keys().next().value!);
    this.updateMs = performance.now() - start;
    this.updateMaxMs = Math.max(this.updateMaxMs, this.updateMs);
  }
  private add(input: CombatCue, viewport: FeedbackViewport, supplied: boolean) {
    if (!validCombatCue(input)) {
      this.rejected++;
      return;
    }
    const radius = input.radius ?? 1;
    if (
      input.x + radius < viewport.left ||
      input.x - radius > viewport.right ||
      input.y + radius < viewport.top ||
      input.y - radius > viewport.bottom
    ) {
      this.culled++;
      return;
    }
    const existing = this.cues.get(input.id);
    if (existing) {
      Object.assign(existing, input, { frame: this.frame, supplied });
      return;
    }
    if (this.cues.size >= COMBAT_FEEDBACK_LIMITS.cues) {
      // Hostile and charge cues retain priority over expendable impact debris.
      const expendable = [...this.cues].find(
        ([, c]) => !['telegraph', 'charge', 'anticipation'].includes(c.kind),
      );
      if (['telegraph', 'charge', 'anticipation'].includes(input.kind) && expendable)
        this.cues.delete(expendable[0]);
      else {
        this.dropped++;
        return;
      }
    }
    const cue: LiveCue = {
      color: colors.steel,
      strength: 1,
      radius: 1,
      ...input,
      frame: this.frame,
      supplied,
    };
    this.cues.set(cue.id, cue);
    if (this.seen.has(cue.id)) return;
    this.seen.set(cue.id, this.now);
    if (cue.age > Math.min(0.16, cue.duration * 0.5)) return; // Never replay late snapshot bursts.
    const actor = cue.actorId
      ? [...this.actors.values()].find((a) => a.id === cue.actorId || a.bodyId === cue.actorId)
      : [...this.actors.values()].reduce<CombatActor | undefined>(
          (nearest, a) =>
            Math.hypot(a.x - cue.x, a.y - cue.y) <
            Math.min(0.9, nearest ? Math.hypot(nearest.x - cue.x, nearest.y - cue.y) : Infinity)
              ? a
              : nearest,
          undefined,
        );
    if (actor) {
      if (!cue.style && cue.kind === 'melee')
        cue.style = actor.weapon === 'staff' ? 'thrust' : 'arc';
      if (!cue.style && cue.kind === 'projectile' && actor.weapon && actor.weapon !== 'bow')
        cue.style = 'bolt';
      const pose = this.poses.get(actor.id) ?? {
        impact: -100,
        strike: -100,
        death: -100,
        heading: 0,
        power: 0,
      };
      if (cue.kind === 'impact') {
        pose.impact = this.now;
        pose.heading = cue.heading ?? actor.heading + Math.PI;
        pose.power = cue.strength ?? 1;
      }
      if (cue.kind === 'melee' || cue.kind === 'projectile') pose.strike = this.now;
      if (['charge', 'telegraph', 'anticipation'].includes(cue.kind)) pose.prepare = cue.id;
      if (cue.kind === 'death') pose.death = this.now;
      this.poses.set(actor.id, pose);
    }
    if (['impact', 'guard', 'area', 'death', 'level'].includes(cue.kind)) {
      this.shakeUntil = Math.max(this.shakeUntil, this.now + 0.14);
      this.shakePower = Math.max(
        this.shakePower * 0.5,
        cue.kind === 'level' ? 0.25 : Math.min(1, cue.strength ?? 1),
      );
    }
    this.burst(cue);
  }
  private burst(cue: CombatCue) {
    if (this.settings.reducedMotion || this.settings.intensity === 0) return;
    const base = {
      anticipation: 0,
      charge: 0,
      melee: 5,
      projectile: 3,
      impact: 14,
      guard: 18,
      area: 22,
      dash: 12,
      death: 18,
      loot: 9,
      level: 30,
      status: 7,
      telegraph: 0,
    }[cue.kind];
    const count = Math.round(base * this.settings.intensity);
    const rng = visualRandom(hash(cue.id) || 1);
    for (let i = 0; i < count; i++) {
      let particle: FeedbackParticle | undefined;
      for (let n = 0; n < this.particles.length; n++) {
        const p = this.particles[this.cursor++ % this.particles.length];
        if (!p.alive) {
          particle = p;
          break;
        }
      }
      if (!particle) {
        this.dropped += count - i;
        break;
      }
      const directional = ['melee', 'impact', 'dash'].includes(cue.kind);
      const a = directional ? (cue.heading ?? 0) + (rng() - 0.5) * 2.4 : rng() * Math.PI * 2;
      const speed = 0.6 + rng() * (cue.kind === 'level' ? 2.8 : 1.9);
      Object.assign(particle, {
        alive: true,
        x: cue.x,
        y: cue.y,
        z: cue.kind === 'dash' ? 0.02 : 0.35,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.65,
        vz: 0.6 + rng() * 1.8,
        life: 0,
        duration: 0.18 + rng() * 0.42,
        size: 1 + Math.floor(rng() * 2),
        color: i % 3 === 0 ? '#f0e5c5' : (cue.color ?? colors.impact),
        kind:
          cue.kind === 'loot'
            ? 'coin'
            : ['guard', 'level', 'status'].includes(cue.kind)
              ? 'rune'
              : cue.kind === 'death' || cue.kind === 'dash'
                ? 'dust'
                : 'spark',
      });
    }
  }
  pose(id: string): FeedbackPose {
    const pose = this.poses.get(id);
    if (!pose) return idlePose;
    const elapsed = this.now - pose.impact;
    const movement = this.settings.reducedMotion ? 0 : this.settings.intensity;
    const recoil =
      elapsed >= 0 && elapsed < 0.25
        ? Math.sin((Math.PI * elapsed) / 0.25) * 0.1 * movement * Math.min(2, pose.power)
        : 0;
    const deathAge = this.now - pose.death;
    const preparation = pose.prepare ? this.cues.get(pose.prepare) : undefined;
    return {
      x: recoil ? Math.cos(pose.heading) * recoil : 0,
      y: recoil ? Math.sin(pose.heading) * recoil : 0,
      scaleX: 1 + recoil * 0.7,
      scaleY: 1 - recoil * 0.6,
      flash: elapsed >= 0 && elapsed < 0.09 ? 0.34 * this.settings.intensity : 0,
      attack: preparation
        ? this.settings.reducedMotion
          ? 0.22
          : 0.1 + clamp(preparation.age / preparation.duration, 0, 1) * 0.35
        : attackEnvelope(this.now - pose.strike, 0.32, this.settings.reducedMotion),
      death:
        deathAge >= 0 && deathAge < 0.55
          ? this.settings.reducedMotion
            ? 1
            : deathAge / 0.55
          : null,
    };
  }
  cameraOffset(): Point {
    if (this.settings.reducedMotion || this.now >= this.shakeUntil) return { x: 0, y: 0 };
    const amplitude =
      COMBAT_FEEDBACK_LIMITS.maxCameraPixels *
      this.settings.intensity *
      this.shakePower *
      clamp((this.shakeUntil - this.now) / 0.14, 0, 1);
    return {
      x: Math.round(Math.sin(this.now * 91) * amplitude),
      y: Math.round(Math.cos(this.now * 73) * amplitude * 0.6),
    };
  }
}
