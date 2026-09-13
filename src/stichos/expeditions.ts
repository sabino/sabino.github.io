import { deriveSeed } from '../procedural/random.ts';
import { appearance, type InfiniteWorld } from './world.ts';
import { generateArtifact } from './artifacts.ts';
import type { ItemId, Npc, NpcRole, Point, Settlement, Tile } from './types.ts';
import type { WorldTimeSignal } from './world-time.ts';
import type { EncounterArchetype } from './encounter-patterns.ts';

export type ExpeditionKind = 'road' | 'relay' | 'garden';
export type Attunement = 'momentum' | 'precision' | 'renewal';
export const EXPEDITION_LIMITS = Object.freeze({
  cachedTowns: 12,
  records: 256,
  nearbyTowns: 4,
  enemiesPerSite: 4,
  discoveryRadius: 5,
  deliveryRadius: 5,
  queryRadius: 96,
});
export interface ExpeditionReward {
  coins: number;
  xp: number;
  practice: { profession: 'combat' | 'crafting' | 'botany'; amount: number };
  artifactDesign: string;
  attunement: Attunement;
}
export interface ExpeditionPlan {
  id: string;
  seed: number;
  kind: ExpeditionKind;
  title: string;
  subtitle: string;
  description: string;
  town: Settlement;
  site: Point;
  biome: Tile['biome'];
  giver: { id: string; role: NpcRole; name: string; point: Point };
  enemies: readonly Npc[];
  level: number;
  cost: Partial<Record<ItemId, number>>;
  reward: ExpeditionReward;
  observation: 'day' | 'night' | 'any';
  observationText: string;
  tactics: string;
}
export interface ExpeditionRecord {
  id: string;
  discovered: boolean;
  observed: boolean;
  claimed: boolean;
}
export interface ExpeditionState {
  version: 1;
  records: ExpeditionRecord[];
  attunement?: Attunement;
}
export interface ExpeditionContext {
  player: Point;
  level: number;
  inventory: Partial<Record<ItemId, number>>;
  defeated: ReadonlySet<string>;
  time: Pick<WorldTimeSignal, 'nightness'>;
}
export type ExpeditionStage = 'discover' | 'combat' | 'deliver' | 'complete';
export interface ExpeditionStatus {
  stage: ExpeditionStage;
  defeated: number;
  total: number;
  observed: boolean;
  canClaim: boolean;
  reason: string;
  target: Point;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const EMPTY = new Set<string>();
const KINDS: readonly ExpeditionKind[] = ['road', 'relay', 'garden'];
const validAttunement = (v: unknown): v is Attunement =>
  v === 'momentum' || v === 'precision' || v === 'renewal';

/** No additive actors are written into terrain/chunks: old seeds generate identical geography. */
export class ExpeditionCatalog {
  private cache = new Map<string, readonly ExpeditionPlan[]>();
  readonly world: InfiniteWorld;
  constructor(world: InfiniteWorld) {
    this.world = world;
  }
  get cacheSize() {
    return this.cache.size;
  }

  plansForTown(town: Settlement): readonly ExpeditionPlan[] {
    const cached = this.cache.get(town.id);
    if (cached) return cached;
    const plans = KINDS.flatMap((kind, index) => {
      const seed = deriveSeed(this.world.seed, 'expedition-v1', town.id, kind);
      const site = this.findSite(town, kind, index, seed);
      return site ? [this.makePlan(town, kind, seed, site)] : [];
    });
    this.cache.set(town.id, plans);
    if (this.cache.size > EXPEDITION_LIMITS.cachedTowns)
      this.cache.delete(this.cache.keys().next().value!);
    return plans;
  }

  plansAround(x: number, y: number, radius = 64): ExpeditionPlan[] {
    if (![x, y, radius].every(Number.isFinite)) return [];
    radius = Math.min(EXPEDITION_LIMITS.queryRadius, Math.max(0, radius));
    const point = { x, y };
    return this.world
      .settlementsAround(x, y, radius + 100)
      .sort((a, b) => distance(a, point) - distance(b, point) || a.id.localeCompare(b.id))
      .slice(0, EXPEDITION_LIMITS.nearbyTowns)
      .flatMap((town) => this.plansForTown(town))
      .filter(
        (plan) => distance(plan.site, point) <= radius || distance(plan.town, point) <= radius,
      );
  }

  enemiesAround(x: number, y: number, radius: number): Npc[] {
    const point = { x, y },
      bounded = Math.min(32, Math.max(0, radius));
    return this.plansAround(x, y, bounded + 3)
      .flatMap((plan) => plan.enemies)
      .filter((npc) => distance(npc, point) <= bounded)
      .map((npc) => structuredClone(npc));
  }

  /** Parse only bounded, canonical town addresses; never scan an untrusted world-wide ID. */
  enemyById(id: string): Npc | undefined {
    const parsed = parseExpeditionId(id);
    if (!parsed || parsed.seed !== this.world.seed) return;
    const town = this.world
      .settlementsAround(parsed.x, parsed.y, 2)
      .find((candidate) => candidate.x === parsed.x && candidate.y === parsed.y);
    if (!town) return;
    const npc = this.plansForTown(town)
      .flatMap((plan) => plan.enemies)
      .find((npc) => npc.id === id);
    return npc ? structuredClone(npc) : undefined;
  }

  private findSite(
    town: Settlement,
    kind: ExpeditionKind,
    index: number,
    seed: number,
  ): Point | undefined {
    // Restrict each encounter to its own 90-degree sector; never overlap towns, gardens or roads.
    const initial = index * ((Math.PI * 2) / 3) + (seed % 19) * 0.015;
    const candidates: { point: Point; score: number }[] = [];
    for (let attempt = 0; attempt < 96; attempt++) {
      const ring = Math.floor(attempt / 16);
      // Keep the full eight-tile encounter attention radius beyond established
      // town-edge gatherers and legacy household resource loops.
      const radius = Math.max(36, town.radius + 16) + ring * 3;
      const angle = initial + ((attempt % 16) - 7.5) * 0.11;
      const point = {
        x: Math.round(town.x + Math.cos(angle) * radius),
        y: Math.round(town.y + Math.sin(angle) * radius),
      };
      const tile = this.world.tile(point.x, point.y);
      if (!this.safeSite(point) || distance(point, town) < town.radius + 5) continue;
      const ecological =
        kind === 'garden'
          ? (tile.ecology?.moisture ?? 0.4) * 4
          : kind === 'relay'
            ? (tile.ecology?.elevation ?? 0.4) * 3
            : 0;
      const score = ecological - ring * 0.7;
      candidates.push({ point, score });
      if (candidates.length >= 8) break;
    }
    for (const candidate of candidates.sort((a, b) => b.score - a.score).slice(0, 12)) {
      if (this.reachableFromTown(town, candidate.point)) return candidate.point;
    }
    return undefined;
  }

  private reachableFromTown(town: Settlement, target: Point): boolean {
    // A bounded A* checks doors as operable. This does not open/remove a door or carve terrain.
    const start = { x: town.x, y: town.y + 5 };
    const key = (p: Point) => `${p.x},${p.y}`;
    const heuristic = (p: Point) => Math.abs(p.x - target.x) + Math.abs(p.y - target.y);
    const queue = [{ ...start, cost: 0, score: heuristic(start) }];
    const visited = new Set<string>();
    const costs = new Map([[key(start), 0]]);
    for (let iteration = 0; queue.length && iteration < 4096; iteration++) {
      let best = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].score < queue[best].score) best = i;
      const current = queue.splice(best, 1)[0],
        currentKey = key(current);
      if (visited.has(currentKey)) continue;
      if (current.x === target.x && current.y === target.y) return true;
      visited.add(currentKey);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const point = { x: current.x + dx, y: current.y + dy },
          pointKey = key(point),
          cost = current.cost + 1;
        if (
          Math.abs(point.x - town.x) > 64 ||
          Math.abs(point.y - town.y) > 64 ||
          visited.has(pointKey) ||
          (costs.get(pointKey) ?? Infinity) <= cost ||
          this.world.blocked(point.x, point.y, EMPTY, true)
        )
          continue;
        costs.set(pointKey, cost);
        queue.push({ ...point, cost, score: cost + heuristic(point) });
      }
    }
    return false;
  }

  private safeSite(point: Point) {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = point.x + dx,
        y = point.y + dy,
        tile = this.world.tile(x, y);
      if (
        tile.building ||
        tile.site ||
        tile.cultivated ||
        tile.biome === 'settlement' ||
        tile.terrain === 'road' ||
        this.world.blocked(x, y, EMPTY)
      )
        return false;
    }
    return true;
  }

  private makePlan(
    town: Settlement,
    kind: ExpeditionKind,
    seed: number,
    site: Point,
  ): ExpeditionPlan {
    const id = `expedition:${this.world.seed}:${town.x}:${town.y}:${kind}`;
    const civ = this.world.civilization;
    const role: NpcRole = kind === 'road' ? 'merchant' : kind === 'relay' ? 'engineer' : 'botanist';
    const residents = this.world.npcsAround(town.x, town.y, Math.min(48, town.radius + 5));
    const resident = residents
      .filter((npc) => npc.role === role && !npc.hostile)
      .sort(
        (a, b) => distance(a.home, town) - distance(b.home, town) || a.id.localeCompare(b.id),
      )[0];
    const giver = {
      id: resident?.id ?? `${town.id}:notice`,
      role,
      name: resident?.name ?? `${town.name} ${civ?.roleNames[role] ?? role}`,
      point: resident ? { ...resident.home } : { x: town.x - 2, y: town.y + 1 },
    };
    const tier = Math.min(3, 1 + Math.floor(distance(town, this.world.spawn) / 600));
    const definitions = {
      road: {
        title: 'The broken provision road',
        subtitle: 'Supply expedition',
        profession: 'combat' as const,
        attunement: 'momentum' as const,
        cost: { rations: 2 + tier, wood: 2 } as Partial<Record<ItemId, number>>,
        observation: 'day' as const,
        observationText:
          'Survey by daylight to identify intact supply marks; earn an extra 12 coins.',
        tactics:
          'Scouts retreat into a forked crossfire. Isolate the slinger, then sidestep the roadbreaker’s long strike.',
        types: ['skirmisher', 'slinger', 'breaker'] as EncounterArchetype[],
        weapon: 'contact',
        description: `${town.name} depends on the surrounding settlements for food. A toll band has seized a route used by gatherers. Clear the blockade, then deliver replacement rations and repair timber to ${giver.name}.`,
      },
      relay: {
        title: 'The silent measure',
        subtitle: 'Major relay encounter',
        profession: 'crafting' as const,
        attunement: 'precision' as const,
        cost: { ore: 3 + tier, tonic: 1 } as Partial<Record<ItemId, number>>,
        observation: 'any' as const,
        observationText:
          'Inspect the abandoned field relay at any time; its survey bearing reveals a 12-coin salvage bonus.',
        tactics:
          'The warden locks a long bearing strike, then vents a circle below half health. Flank the line; leave the circle; punish recovery.',
        types: ['slinger', 'warden'] as EncounterArchetype[],
        weapon: 'projectile',
        description: `${civ?.eraName ?? 'Local'} instruments once measured safe journeys beyond ${town.name}. The field relay is held by an armed survey custodian who refuses every new calibration. Defeat its guard, then bring ore and tonic to stabilize the revived equipment.`,
      },
      garden: {
        title: 'A garden out of season',
        subtitle: 'Botanical containment',
        profession: 'botany' as const,
        attunement: 'renewal' as const,
        cost: { salve: 2, cequin: 3 + tier } as Partial<Record<ItemId, number>>,
        observation: 'night' as const,
        observationText:
          'Observe after dusk to distinguish nocturnal seed growth; earn an extra 12 coins. Combat is possible by day.',
        tactics:
          'Cultivators spread wider bursts at night. Use an interrupt or retreat outside the marked circle; leave ordinary wildlife alone.',
        types: ['skirmisher', 'cultivator', 'cultivator'] as EncounterArchetype[],
        weapon: 'pulse',
        description: `A discarded cultivation experiment is spreading into the ${this.world.tile(site.x, site.y).biome}. Armed keepers are defending it while ${giver.name} tries to protect food plants and grazing grounds. Stop the keepers, then deliver salve and breathing leaves for the injured field workers.`,
      },
    }[kind];
    // Verified reserve blueprints guarantee the advertised physical delivery even
    // when a bounded addressed search finds none. This never changes old designs.
    const reserves: Record<string, readonly number[]> = {
      contact: [15, 20, 31, 41, 78, 82, 104, 116],
      projectile: [0, 6, 10, 11, 18, 27, 28, 34],
      pulse: [2, 3, 12, 40, 42, 56, 69, 70],
    };
    let artifactDesign = `Field commission ${definitions.weapon} reserve ${reserves[definitions.weapon][seed % 8]}`;
    // Search a bounded addressed sequence for a genuine existing generated implement, never a fake stat label.
    for (let attempt = 0; attempt < 64; attempt++) {
      const design = `Expedition ${seed.toString(36)} ${kind} ${attempt}`;
      const artifact = generateArtifact(design);
      if (artifact.category === 'implement' && artifact.delivery === definitions.weapon) {
        artifactDesign = design;
        break;
      }
    }
    const enemySpots = [
      site,
      { x: site.x + 1, y: site.y },
      { x: site.x, y: site.y + 1 },
      { x: site.x - 1, y: site.y },
    ];
    const enemies = definitions.types.map((archetype, index): Npc => {
      const enemySeed = deriveSeed(seed, archetype, index),
        body = appearance(enemySeed, 'raider', town.clan),
        point = enemySpots[index];
      body.weapon =
        archetype === 'slinger'
          ? 'bow'
          : archetype === 'cultivator' || archetype === 'warden'
            ? 'staff'
            : 'sword';
      body.weaponSeed = deriveSeed(enemySeed, 'encounter-weapon');
      body.technology =
        town.architecture?.technology && town.architecture.technology > 0.65 ? 2 : 1;
      body.trim =
        archetype === 'warden' ? '#b6a5e1' : archetype === 'cultivator' ? '#9dc99a' : '#e1ba86';
      if (archetype === 'warden') {
        body.height = 1.2;
        body.build = 1.25;
        body.cloak = true;
      }
      const names = {
        skirmisher: 'Toll scout',
        slinger: 'Forkshot sentry',
        breaker: 'Roadbreaker',
        warden: 'Measure warden',
        cultivator: 'Seed keeper',
      };
      const hp =
        { skirmisher: 32, slinger: 36, breaker: 62, warden: 145, cultivator: 52 }[archetype] +
        (tier - 1) * 12;
      return {
        id: `${id}:${archetype}:${index}`,
        seed: enemySeed,
        name: names[archetype],
        role: 'raider',
        clan: town.clan,
        appearance: body,
        x: point.x,
        y: point.y,
        home: { ...point },
        maxHp: hp,
        hp,
        speed: archetype === 'warden' ? 1.1 : archetype === 'skirmisher' ? 1.9 : 1.4,
        heading: (enemySeed % 628) / 100,
        phase: 0,
        hostile: true,
        cooldown: 0.8 + index * 0.35,
      };
    });
    return {
      id,
      seed,
      kind,
      title: definitions.title,
      subtitle: definitions.subtitle,
      description: definitions.description,
      town,
      site,
      biome: this.world.tile(site.x, site.y).biome,
      giver,
      enemies,
      level: kind === 'relay' ? 3 + tier : tier,
      cost: definitions.cost,
      observation: definitions.observation,
      observationText: definitions.observationText,
      tactics: definitions.tactics,
      reward: {
        coins: kind === 'relay' ? 70 + tier * 10 : 35 + tier * 8,
        xp: kind === 'relay' ? 65 + tier * 10 : 35 + tier * 5,
        practice: { profession: definitions.profession, amount: 8 + tier * 3 },
        artifactDesign,
        attunement: definitions.attunement,
      },
    };
  }
}

export function parseExpeditionId(
  id: unknown,
): { seed: number; x: number; y: number; kind: ExpeditionKind } | undefined {
  if (typeof id !== 'string' || id.length > 150) return;
  const match =
    /^expedition:(\d{1,10}):(-?\d{1,9}):(-?\d{1,9}):(road|relay|garden)(?::(skirmisher|slinger|breaker|warden|cultivator):[0-3])?$/.exec(
      id,
    );
  if (!match) return;
  const seed = Number(match[1]),
    x = Number(match[2]),
    y = Number(match[3]);
  if (seed > 0xffffffff || [seed, x, y].some((n, i) => String(n) !== match[i + 1])) return;
  return { seed, x, y, kind: match[4] as ExpeditionKind };
}

export function createExpeditionState(): ExpeditionState {
  return { version: 1, records: [] };
}
export function restoreExpeditions(value: unknown, seed: number): ExpeditionState {
  const state = createExpeditionState();
  if (!value || typeof value !== 'object') return state;
  const raw = value as Partial<ExpeditionState>;
  if (raw.version !== 1 || !Array.isArray(raw.records)) return state;
  for (const candidate of raw.records.slice(0, EXPEDITION_LIMITS.records)) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.discovered !== 'boolean' ||
      typeof candidate.observed !== 'boolean' ||
      typeof candidate.claimed !== 'boolean'
    )
      continue;
    const parsed = parseExpeditionId(candidate.id);
    if (
      !parsed ||
      parsed.seed !== seed ||
      candidate.id.split(':').length !== 5 ||
      state.records.some((record) => record.id === candidate.id)
    )
      continue;
    if (candidate.claimed && !candidate.discovered) continue;
    state.records.push({
      id: candidate.id,
      discovered: candidate.discovered,
      observed: candidate.observed,
      claimed: candidate.claimed,
    });
  }
  if (
    validAttunement(raw.attunement) &&
    state.records.some(
      (record) =>
        record.claimed && attunementForKind(parseExpeditionId(record.id)!.kind) === raw.attunement,
    )
  )
    state.attunement = raw.attunement;
  return state;
}
export function attunementForKind(kind: ExpeditionKind): Attunement {
  return kind === 'road' ? 'momentum' : kind === 'relay' ? 'precision' : 'renewal';
}
export function expeditionRecord(state: ExpeditionState, id: string): ExpeditionRecord | undefined {
  return state.records.find((record) => record.id === id);
}

/** Caller runs near the player at a bounded cadence, not per render frame. */
export function observeExpeditions(
  state: ExpeditionState,
  plans: readonly ExpeditionPlan[],
  context: Pick<ExpeditionContext, 'player' | 'time'>,
): boolean {
  let changed = false;
  for (const plan of plans) {
    if (distance(context.player, plan.site) > EXPEDITION_LIMITS.discoveryRadius) continue;
    let record = expeditionRecord(state, plan.id);
    if (!record) {
      // Never evict receipts; an evicted reward could be claimed twice after returning.
      if (state.records.length >= EXPEDITION_LIMITS.records) continue;
      record = { id: plan.id, discovered: true, observed: false, claimed: false };
      state.records.push(record);
      changed = true;
    }
    if (!record.discovered) {
      record.discovered = true;
      changed = true;
    }
    const rightTime =
      plan.observation === 'any' ||
      (plan.observation === 'night' ? context.time.nightness > 0.6 : context.time.nightness < 0.3);
    if (!record.observed && !record.claimed && rightTime) {
      record.observed = true;
      changed = true;
    }
  }
  return changed;
}

export function expeditionStatus(
  plan: ExpeditionPlan,
  state: ExpeditionState,
  context: ExpeditionContext,
): ExpeditionStatus {
  const record = expeditionRecord(state, plan.id),
    defeated = plan.enemies.filter((npc) => context.defeated.has(npc.id)).length;
  const common = {
    defeated,
    total: plan.enemies.length,
    observed: record?.observed ?? false,
    canClaim: false,
  };
  if (
    ![context.player.x, context.player.y, context.level].every(Number.isFinite) ||
    Object.keys(plan.cost).some((item) => {
      const amount = context.inventory[item as ItemId] ?? 0;
      return !Number.isSafeInteger(amount) || amount < 0;
    })
  )
    return {
      ...common,
      stage: 'deliver',
      reason:
        'The field ledger cannot verify these supplies. Reopen it after the world has synchronized.',
      target: plan.giver.point,
    };
  if (record?.claimed)
    return {
      ...common,
      stage: 'complete',
      reason: 'Delivered. Another settlement has its own expedition sites.',
      target: plan.giver.point,
    };
  if (!record?.discovered)
    return {
      ...common,
      stage: 'discover',
      reason: 'Reach the marked field site and survey its surroundings.',
      target: plan.site,
    };
  if (defeated < plan.enemies.length)
    return {
      ...common,
      stage: 'combat',
      reason: `${defeated}/${plan.enemies.length} threats cleared. ${plan.tactics}`,
      target: plan.site,
    };
  if (context.level < plan.level)
    return {
      ...common,
      stage: 'deliver',
      reason: `Reach level ${plan.level} before accepting this commission’s reward.`,
      target: plan.giver.point,
    };
  if (distance(context.player, plan.giver.point) > EXPEDITION_LIMITS.deliveryRadius)
    return {
      ...common,
      stage: 'deliver',
      reason: `Return to ${plan.giver.name} in ${plan.town.name}.`,
      target: plan.giver.point,
    };
  const missing = Object.entries(plan.cost).filter(
    ([item, count]) => (context.inventory[item as ItemId] ?? 0) < count!,
  );
  if (missing.length)
    return {
      ...common,
      stage: 'deliver',
      reason: `Bring ${missing.map(([item, count]) => `${count} ${item}`).join(' and ')}. Gather or craft the supplies first.`,
      target: plan.giver.point,
    };
  return {
    ...common,
    stage: 'deliver',
    canClaim: true,
    reason: 'Supplies ready. Deliver them to claim the field commission.',
    target: plan.giver.point,
  };
}

/** Atomic personal-inventory transaction. Combat/removed receipts must come from the room authority. */
export function claimExpedition(
  plan: ExpeditionPlan,
  state: ExpeditionState,
  context: ExpeditionContext,
): { ok: boolean; reason: string; reward?: ExpeditionReward } {
  const status = expeditionStatus(plan, state, context);
  if (!status.canClaim) return { ok: false, reason: status.reason };
  const record = expeditionRecord(state, plan.id)!;
  for (const [id, amount] of Object.entries(plan.cost))
    context.inventory[id as ItemId] = (context.inventory[id as ItemId] ?? 0) - amount!;
  record.claimed = true;
  state.attunement ??= plan.reward.attunement;
  return {
    ok: true,
    reason: `${plan.title}: commission delivered.`,
    reward: {
      ...plan.reward,
      coins: plan.reward.coins + (record.observed ? 12 : 0),
      practice: { ...plan.reward.practice },
    },
  };
}

export const ATTUNEMENTS: Readonly<
  Record<Attunement, { name: string; description: string; color: string }>
> = Object.freeze({
  momentum: {
    name: 'Wayfarer’s rhythm',
    description:
      'After a deliberate step, your next technique costs 4 less stamina. Stays ready for 3 seconds; one use.',
    color: '#e3b782',
  },
  precision: {
    name: 'Surveyor’s measure',
    description:
      'Techniques against a staggered target deal 15% more damage. Align allies’ interrupts with your release.',
    color: '#9fcddc',
  },
  renewal: {
    name: 'Fieldkeeper’s bond',
    description:
      'A technique that lands restores 4 warmth and 4 breath once per cast. Sustains long journeys without replacing supplies.',
    color: '#a4c79a',
  },
});
export function chooseAttunement(state: ExpeditionState, attunement: Attunement): boolean {
  if (
    !validAttunement(attunement) ||
    !state.records.some((record) => {
      const parsed = parseExpeditionId(record.id);
      return record.claimed && parsed && attunementForKind(parsed.kind) === attunement;
    })
  )
    return false;
  state.attunement = attunement;
  return true;
}
export function expeditionTechniqueBonus(
  attunement: Attunement | undefined,
  steppedRecently: boolean,
  targetStaggered: boolean,
) {
  return {
    staminaReduction: attunement === 'momentum' && steppedRecently ? 4 : 0,
    damageMultiplier: attunement === 'precision' && targetStaggered ? 1.15 : 1,
    warmth: attunement === 'renewal' ? 4 : 0,
    breath: attunement === 'renewal' ? 4 : 0,
  };
}
