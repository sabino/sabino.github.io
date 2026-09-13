import { validSystemAddress } from './systems-receipts.ts';
import {
  Underworld,
  validUnderworldSave,
  parseUnderworldSpace,
  type UnderworldTransition,
  type UnderworldEvent,
  type UnderworldPeer,
  type UnderworldSave,
} from './underworld.ts';
import { appearance } from './world.ts';
import { weaponProfile, MAX_WEAPON_SEED, type WeaponKind } from './equipment.ts';
import { ActorLedger, validActorLedgerSave, type ActorAddress } from './actor-ledger.ts';
import { validPersistentNpc } from './persistent-npc.ts';
import {
  FieldEconomy,
  FIELD_RULES,
  FIELD_ITEMS,
  validFieldEconomySave,
  validFieldEconomyFrame,
  type FieldItem,
  type FieldPeer,
  type FieldDeath,
} from './field-loot.ts';
import {
  CivicWorld,
  validCivicSave,
  type CivicActionKind,
  type CivicActor,
  type GuardIntent,
  type DoorAccess,
} from './civic-world.ts';
import {
  PropertyWorld,
  validPropertySave,
  propertyPrice,
  type PropertyCommand,
  type PropertyOffer,
} from './property-world.ts';
import { signForProp, type WorldSign, type SignService } from './world-signs.ts';
import { worldTimeAt } from './world-time.ts';
import { NpcSociety, validSocietySave } from './npc-society.ts';
import type { InfiniteWorld } from './world.ts';
import type { FaunaActor } from './living-world.ts';
import type { Npc, Point, Prop, Settlement } from './types.ts';
import { deriveSeed } from '../procedural/random.ts';

export const LIVING_SYSTEMS_VERSION = 1 as const;
export type SystemsCommand =
  | { kind: 'gather' | 'claim' | 'hunt'; targetId: string }
  | { kind: 'craft'; recipeId: string }
  | { kind: 'sell'; item: FieldItem; quantity: number }
  | {
      kind: 'guild';
      action: 'discover' | 'join' | 'duty' | 'dues' | 'leave' | 'reconcile';
      factionId: string;
      npcId: string;
    }
  | { kind: 'property'; command: PropertyCommand }
  | { kind: 'fine'; guardId: string }
  | { kind: 'force-door'; targetId: string }
  | { kind: 'underworld-enter'; settlementId: string }
  | { kind: 'underworld-interact'; targetId: string }
  | {
      kind: 'underworld-attack';
      attack: 'melee' | 'ranged' | 'spell' | 'guard' | 'dodge';
      heading: number;
    }
  | { kind: 'underworld-rewards' | 'underworld-recover' | 'surface-recover' }
  | { kind: 'person-attack'; targetId: string; heading: number }
  | { kind: 'consume'; item: 'ration' | 'bandage' | 'ward-kit' };
export interface SystemsPeer extends FieldPeer {
  name?: string;
  active?: boolean;
  combatActive?: boolean;
  occupiedBodyId?: string;
  heading?: number;
  weaponSeed?: number;
  weaponKind?: WeaponKind;
}
export interface SystemsResult {
  receipt?: { scope: string; sequence: number; actorId: string; targetBodyId: string };
  recovery?: { coinLoss: number; cooldownUntil: number };
  ok: boolean;
  message: string;
  removed?: string[];
  opened?: string[];
  health?: number;
  damage?: number;
  killed?: boolean;
  targetId?: string;
  transition?: UnderworldTransition;
  wardSeconds?: number;
  rest?: { hpFraction: number; staminaFraction: number };
}
export interface SystemsCombatHit {
  id: string;
  actorId: string;
  targetId: string;
  damage: number;
  spaceId: string;
  x: number;
  y: number;
  attack: 'melee' | 'ranged' | 'spell' | 'trap';
}
interface SystemsRescue {
  actorId: string;
  survivorId: string;
  profession: 'mason' | 'herbalist' | 'engineer';
  settlementId: string;
  depth: number;
  delivered: boolean;
}
export interface SystemsHooks {
  mode?: 'solo' | 'shared';
  woundFauna?(id: string, attacker: Point, response: 'flee' | 'defend'): void;
  fauna(): readonly FaunaActor[];
  defeatFauna(id: string): void;
  legacyHome?(peerId: string): string | undefined;
}
const empty = () => ({ coins: 0, items: {} });
const address = (point: Point, spaceId = 'surface'): ActorAddress => ({
  spaceId,
  x: point.x,
  y: point.y,
});
const distance = (a: ActorAddress, b: ActorAddress) =>
  a.spaceId === b.spaceId ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\u0000-\u001f]/.test(v);
export function validSystemsCommand(v: unknown): v is SystemsCommand {
  if (!object(v) || typeof v.kind !== 'string') return false;
  const exact = (keys: string[]) => Object.keys(v).every((k) => keys.includes(k));
  if (['gather', 'claim', 'hunt', 'force-door', 'underworld-interact'].includes(v.kind))
    return exact(['kind', 'targetId']) && id(v.targetId);
  if (v.kind === 'underworld-enter') return exact(['kind', 'settlementId']) && id(v.settlementId);
  if (
    v.kind === 'underworld-rewards' ||
    v.kind === 'underworld-recover' ||
    v.kind === 'surface-recover'
  )
    return exact(['kind']);
  if (v.kind === 'consume')
    return exact(['kind', 'item']) && ['ration', 'bandage', 'ward-kit'].includes(String(v.item));
  if (v.kind === 'underworld-attack')
    return (
      exact(['kind', 'attack', 'heading']) &&
      ['melee', 'ranged', 'spell', 'guard', 'dodge'].includes(String(v.attack)) &&
      typeof v.heading === 'number' &&
      Number.isFinite(v.heading) &&
      Math.abs(v.heading) <= Math.PI * 2
    );
  if (v.kind === 'person-attack')
    return (
      exact(['kind', 'targetId', 'heading']) &&
      id(v.targetId) &&
      typeof v.heading === 'number' &&
      Number.isFinite(v.heading) &&
      Math.abs(v.heading) <= Math.PI * 2
    );
  if (v.kind === 'craft') return exact(['kind', 'recipeId']) && id(v.recipeId);
  if (v.kind === 'sell')
    return (
      exact(['kind', 'item', 'quantity']) &&
      typeof v.item === 'string' &&
      Object.hasOwn(FIELD_ITEMS, v.item) &&
      Number.isSafeInteger(v.quantity) &&
      Number(v.quantity) > 0 &&
      Number(v.quantity) <= 99
    );
  if (v.kind === 'fine') return exact(['kind', 'guardId']) && id(v.guardId);
  if (v.kind === 'guild')
    return (
      exact(['kind', 'action', 'factionId', 'npcId']) &&
      ['discover', 'join', 'duty', 'dues', 'leave', 'reconcile'].includes(String(v.action)) &&
      id(v.factionId) &&
      id(v.npcId)
    );
  // The property authority validates every command field again before transactions.
  return (
    v.kind === 'property' &&
    exact(['kind', 'command']) &&
    object(v.command) &&
    typeof v.command.kind === 'string' &&
    JSON.stringify(v.command).length <= 2000
  );
}

/** Same domain authority in solo and hosted play; callers authenticate peers, never submitted balances. */
export class LivingSystems {
  readonly economy: FieldEconomy;
  readonly civic: CivicWorld;
  readonly property: PropertyWorld;
  readonly actors: ActorLedger<Npc>;
  readonly underworld: Underworld;
  private commandSequences = new Map<string, number>();
  private occupiedBindings = new Map<string, string>();
  private occupiedBodies = new Set<string>();
  /** Last accepted building occupancy; loading/spawning never fabricates an entry offense. */
  private occupancy = new Map<string, { spaceId: string; building: string | null }>();
  private combatEvents: SystemsCombatHit[] = [];
  private reservedDeaths = new Set<string>();
  private pendingDeaths: FieldDeath[] = [];
  private rescues: SystemsRescue[] = [];
  private unlocks = new Set<string>();
  private wards = new Map<string, number>();
  private combatCooldowns = new Map<string, number>();
  private lastDungeonTick = 0;
  private domainSerial = 0;
  private serviceDiscount = 0;
  private entrances = new Map<
    string,
    { settlementId: string; name: string; spaceId: 'surface'; x: number; y: number }
  >();
  private society: NpcSociety;
  private peers = new Map<string, SystemsPeer>();
  private offers = new Map<string, PropertyOffer>();
  private discoveryCursor = 0;
  private socialCursor = 0;
  private gossipCursor = 0;
  private nextDiscovery = 0;
  private nextSocial = 0;
  private elapsed = 0;
  private guardIntents = new Map<string, GuardIntent>();
  private events: {
    kind: string;
    x: number;
    y: number;
    spaceId?: string;
    actorId?: string;
    text?: string;
  }[] = [];
  private world: InfiniteWorld;
  private removed: Set<string>;
  private hooks: SystemsHooks;
  constructor(
    world: InfiniteWorld,
    removed: Set<string>,
    hooks: SystemsHooks,
    saved?: LivingSystemsSave,
  ) {
    if (saved && (!validLivingSystemsSave(saved) || saved.seed !== world.seed))
      throw new Error('Invalid living systems checkpoint');
    this.world = world;
    this.removed = removed;
    this.hooks = hooks;
    this.economy = new FieldEconomy(world.seed, saved?.economy);
    this.civic = new CivicWorld(world.seed, world.civilization ?? undefined, saved?.civic);
    this.actors = new ActorLedger(saved?.actors, validPersistentNpc);
    this.society = new NpcSociety(saved?.society);
    this.elapsed = saved?.elapsed ?? 0;
    this.lastDungeonTick = this.elapsed;
    this.commandSequences = new Map(saved?.commands ?? []);
    this.occupiedBindings = new Map(saved?.occupied ?? []);
    this.occupiedBodies = new Set(this.occupiedBindings.values());
    this.occupancy = new Map(saved?.occupancy ?? []);
    this.pendingDeaths = structuredClone(saved?.pendingDeaths ?? []);
    this.rescues = structuredClone(saved?.rescues ?? []);
    this.unlocks = new Set(saved?.unlocks ?? []);
    this.wards = new Map(saved?.wards ?? []);
    this.domainSerial = saved?.domainSerial ?? 0;
    this.underworld = new Underworld(world.seed, saved?.underworld, {
      canDefeat: (id, time) => {
        const d = this.economy.diagnostics;
        if (
          this.reservedDeaths.has(id) ||
          !this.economy.canAdmitDeath(id, time) ||
          d.drops + this.reservedDeaths.size >= FIELD_RULES.maxDrops ||
          d.receipts + d.drops + this.reservedDeaths.size * 2 + 2 > FIELD_RULES.maxReceipts
        )
          return false;
        this.reservedDeaths.add(id);
        return true;
      },
    });
    this.property = new PropertyWorld(
      world.seed,
      {
        offer: (id) => this.offers.get(id) ?? this.property?.getEstate(id)?.offer,
        person: (id) => {
          if (this.occupied(id)) return;
          const actor = this.actors.get(id);
          if (!actor || actor.state === 'dead') return;
          const npc = actor.body;
          return {
            id,
            ...address(actor, actor.spaceId),
            name: npc.name,
            seed: npc.seed,
            role: npc.role,
            alive: npc.hp > 0,
            home: actor.home,
            employable:
              !npc.hostile && ['refugee', 'engineer', 'botanist', 'pilgrim'].includes(npc.role),
          };
        },
        peer: (id) => this.peers.get(id),
        cell: (p) => {
          const tile = world.tile(p.x, p.y);
          return {
            solid: world.blocked(p.x, p.y, removed, true),
            road: ['road', 'bridge'].includes(tile.terrain),
            terrain: tile.terrain,
            buildingId: tile.building,
          };
        },
        travel: (id, target) => {
          const actor = this.actors.get(id);
          if (!actor || actor.state === 'dead') return 'unreachable';
          if (distance(actor, target) < 0.6) return 'arrived';
          this.actors.setDestination(id, target);
          return this.actors.get(id)?.state === 'unreachable' ? 'unreachable' : 'traveling';
        },
        legacyHome: (id) => (hooks.mode === 'solo' ? hooks.legacyHome?.(id) : undefined),
        permission: (peer, action, target) => {
          const person = action === 'hire' ? this.actors.get(target) : undefined;
          const estate = this.offers.get(target) ?? this.property?.getEstate(target)?.offer;
          const rep = person
            ? this.civic.reputation(target, peer)
            : estate
              ? this.civic.townReputation(estate.settlementId, peer)
              : undefined;
          return rep && rep.attitude === 'hostile'
            ? { ok: false, reason: 'This person remembers your conduct and refuses employment.' }
            : { ok: true };
        },
        customers: (id, now) => {
          const offer = this.offers.get(id) ?? this.property.getEstate(id)?.offer;
          if (!offer || worldTimeAt(now).nightness > 0.5) return 0;
          return this.actors
            .query(offer, 16, 24)
            .filter((a) => !a.body.hostile && a.body.hp > 0 && this.sight(a, offer)).length;
        },
        transact: (peer, cost, reward, event) =>
          this.economy.transact(
            peer,
            { ...cost, coins: Math.ceil(cost.coins * (1 - this.serviceDiscount)) },
            reward,
            event,
          ),
      },
      saved?.property,
    );
  }
  setPeers(peers: readonly SystemsPeer[], elapsed: number) {
    this.elapsed = Math.max(this.elapsed, elapsed);
    const prior = new Set(this.peers.keys());
    this.peers.clear();
    for (const p of peers.slice(0, 32)) {
      if (
        !this.economy.ensure(p.id) ||
        !id(p.id) ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        Math.abs(p.x) > 1e7 ||
        Math.abs(p.y) > 1e7
      )
        continue;
      const resident = this.underworld.location(p.id),
        current: SystemsPeer = {
          id: p.id,
          ...address(p, p.spaceId),
          ...(p.name ? { name: p.name } : {}),
          active: p.active !== false,
          combatActive: p.combatActive !== false,
          heading: Number.isFinite(p.heading) ? p.heading : 0,
          ...(p.weaponKind ? { weaponKind: p.weaponKind } : {}),
          ...(p.weaponSeed !== undefined ? { weaponSeed: p.weaponSeed } : {}),
        };
      if (resident?.spaceId.startsWith('underground:')) {
        if (p.spaceId === resident.spaceId) this.underworld.syncPeer(this.dungeonPeer(current));
        Object.assign(current, this.underworld.location(p.id));
      } else if (p.spaceId !== 'surface')
        Object.assign(current, resident ?? { spaceId: 'surface', x: p.x, y: p.y });
      if (
        p.occupiedBodyId &&
        id(p.occupiedBodyId) &&
        !this.occupiedBindings.has(p.id) &&
        !this.occupiedBodies.has(p.occupiedBodyId)
      ) {
        this.occupiedBindings.set(p.id, p.occupiedBodyId);
        this.occupiedBodies.add(p.occupiedBodyId);
      }
      const bodyId = this.occupiedBindings.get(p.id);
      if (bodyId) {
        current.occupiedBodyId = bodyId;
        let body = this.actors.get(bodyId)?.body;
        if (!body && current.spaceId === 'surface')
          body = this.world.npcsAround(current.x, current.y, 8).find((n) => n.id === bodyId);
        if (body) {
          this.actors.register(body, 'npc', this.elapsed, {
            home: address(body.home),
            speed: body.speed,
          });
          this.actors.update(
            { ...body, x: current.x, y: current.y, heading: current.heading ?? body.heading },
            this.elapsed,
            current.spaceId,
          );
          this.actors.setDestination(bodyId);
        }
      }
      this.peers.set(p.id, current);
      if (!prior.has(p.id)) this.occupancy.set(p.id, this.buildingOccupancy(current));
      this.economy.ensure(p.id);
      prior.delete(p.id);
    }
    for (const id of prior) this.underworld.leave(id);
  }
  private occupied(bodyId: string) {
    return this.occupiedBodies.has(bodyId);
  }
  /** Authority-only admission for commands with private room-member state. */
  admitExternalCommand(actorId: string, sequence: number): boolean {
    if (
      !this.peers.has(actorId) ||
      !Number.isSafeInteger(sequence) ||
      sequence < this.nextSequence(actorId)
    )
      return false;
    this.commandSequences.set(actorId, sequence);
    return true;
  }
  nextSequence(actorId: string) {
    return (
      Math.max(this.commandSequences.get(actorId) ?? 0, this.underworld.nextSequence(actorId) - 1) +
      1
    );
  }
  location(actorId: string) {
    const p = this.peers.get(actorId);
    return this.underworld.location(actorId)?.spaceId.startsWith('underground:')
      ? this.underworld.location(actorId)
      : p
        ? address(p, p.spaceId)
        : undefined;
  }
  floorBlocked(spaceId: string, x: number, y: number) {
    return spaceId === 'surface'
      ? this.world.blocked(x, y, this.removed) || this.property.blocks({ spaceId, x, y })
      : this.underworld.blocked(spaceId, x, y);
  }
  private dungeonPeer(p: SystemsPeer, combat = false): UnderworldPeer {
    return {
      id: p.id,
      ...address(p, p.spaceId),
      heading: p.heading ?? 0,
      active: p.active !== false && (!combat || p.combatActive !== false),
      ...(p.weaponKind ? { weaponKind: p.weaponKind } : {}),
      ...(p.weaponSeed !== undefined ? { weaponSeed: p.weaponSeed } : {}),
    };
  }
  private town(p: Point) {
    return this.world
      .settlementsAround(p.x, p.y, 96)
      .filter((t) => Math.hypot(t.x - p.x, t.y - p.y) <= t.radius + 12)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  }
  sight = (from: ActorAddress, to: ActorAddress) => {
    if (from.spaceId !== to.spaceId || from.spaceId !== 'surface') return false;
    const steps = Math.ceil(Math.hypot(from.x - to.x, from.y - to.y) * 4);
    if (steps > 256) return false;
    for (let n = 1; n < steps; n++)
      if (
        this.world.blocked(
          from.x + ((to.x - from.x) * n) / steps,
          from.y + ((to.y - from.y) * n) / steps,
          this.removed,
        )
      )
        return false;
    return true;
  };
  private npc(id: string) {
    return this.actors.get(id)?.body;
  }
  private prop(peer: FieldPeer, id: string) {
    return peer.spaceId === 'surface'
      ? this.world.propsAround(peer.x, peer.y, 5).find((p) => p.id === id)
      : undefined;
  }
  private witnesses(p: ActorAddress): CivicActor[] {
    return this.actors
      .query(p, 18, 24)
      .filter((a) => !this.occupied(a.id))
      .map((a) => ({
        id: a.id,
        ...address(a, a.spaceId),
        seed: a.body.seed,
        role: a.body.role,
        alive: a.body.hp > 0,
      }));
  }
  action(peer: FieldPeer, kind: CivicActionKind, sourceId: string, victimId?: string) {
    if (peer.spaceId !== 'surface') return;
    const town = this.town(peer);
    if (!town) return;
    this.civic.factionsFor(town);
    const result = this.civic.recordAction(
      {
        ...address(peer, peer.spaceId),
        actorId: peer.id,
        kind,
        settlementId: town.id,
        at: this.elapsed,
        sourceId,
        ...(victimId ? { victimId } : {}),
      },
      this.witnesses(peer),
      this.sight,
    );
    if (result.ok && result.event?.severity)
      this.events.push({
        kind: 'crime-witnessed',
        x: peer.x,
        y: peer.y,
        actorId: peer.id,
        text: 'A local witness may remember what happened.',
      });
    return result;
  }
  doorAccess(peer: FieldPeer, door: Prop): DoorAccess {
    const tile = this.world.tile(door.x, door.y),
      estate = tile.building ? this.property.getEstate(tile.building) : undefined;
    if (estate) {
      const access = this.property.access(peer.id, estate.id, this.elapsed);
      return {
        allowed: access.allowed,
        label: access.reason,
        ownerId: estate.ownerId,
        reason: estate.ownerId === peer.id ? 'owner' : access.allowed ? 'guest' : 'locked',
      };
    }
    if (
      tile.building &&
      this.hooks.mode === 'solo' &&
      this.hooks.legacyHome?.(peer.id) === tile.building
    )
      return { allowed: true, reason: 'owner', label: 'Your established home.' };
    const bodyId = this.occupiedBindings.get(peer.id),
      body = bodyId ? this.actors.get(bodyId) : undefined;
    if (
      tile.building &&
      body?.home.spaceId === 'surface' &&
      this.world.tile(body.home.x, body.home.y).building === tile.building
    )
      return { allowed: true, reason: 'key', label: 'This body carries its household permission.' };
    const town = this.town(door);
    if (tile.buildingKind === 'workshop' && town && this.guildRank(peer.id, town.id, 'craft') >= 1)
      return {
        allowed: true,
        reason: 'key',
        label: 'Your guild grants after-hours workshop access.',
      };
    return this.civic.doorAccess({
      door,
      tile,
      settlement: this.town(door),
      actorId: peer.id,
      hour: worldTimeAt(this.elapsed).hour,
    });
  }
  private buildingOccupancy(peer: ActorAddress) {
    return {
      spaceId: peer.spaceId,
      building:
        peer.spaceId === 'surface' ? (this.world.tile(peer.x, peer.y).building ?? null) : null,
    };
  }
  private observeEntry(peer: SystemsPeer) {
    if (peer.spaceId === 'surface' && this.floorBlocked('surface', peer.x, peer.y)) return;
    const current = this.buildingOccupancy(peer),
      previous = this.occupancy.get(peer.id);
    this.occupancy.set(peer.id, current);
    if (
      !previous ||
      previous.spaceId !== 'surface' ||
      current.spaceId !== 'surface' ||
      !current.building ||
      previous.building === current.building
    )
      return;
    // The nearest real entrance supplies the property's canonical authority rule even when an NPC
    // opened the global door earlier. A pose does not itself confer permission to that household.
    const door = this.world
      .propsAround(peer.x, peer.y, 24)
      .filter((p) => p.kind === 'door' && p.building === current.building)
      .sort(
        (a, b) =>
          Math.hypot(a.x - peer.x, a.y - peer.y) - Math.hypot(b.x - peer.x, b.y - peer.y) ||
          a.id.localeCompare(b.id),
      )[0];
    if (door && !this.doorAccess(peer, door).allowed)
      this.action(peer, 'trespass', `entry:${++this.domainSerial}`);
  }
  private discover(peer: SystemsPeer) {
    if (peer.spaceId !== 'surface') return;
    const town = this.town(peer);
    if (town) this.civic.factionsFor(town);
    for (const npc of this.world.npcsAround(peer.x, peer.y, 18).slice(0, 48)) {
      if (npc.role === 'raider' || this.occupied(npc.id)) continue;
      this.actors.register(npc, npc.role === 'guard' ? 'guard' : 'npc', this.elapsed, {
        home: address(npc.home),
        speed: npc.speed,
      });
      if (this.removed.has(npc.id)) this.actors.markDead(npc.id);
    }
    if (town) this.discoverTown(town);
    let admitted = 0;
    for (const door of this.world.propsAround(peer.x, peer.y, 12)) {
      if (door.kind !== 'door' || !door.building || this.offers.has(door.building)) continue;
      const offer = this.canonicalHome(door);
      if (!offer) continue;
      if (admitted++ >= 2 || this.offers.size >= 128) break;
      this.offers.set(offer.id, offer);
    }
    if (this.hooks.mode === 'solo') {
      const legacy = this.hooks.legacyHome?.(peer.id),
        offer = legacy ? this.offers.get(legacy) : undefined;
      if (offer && !this.property.getEstate(offer.id) && distance(peer, offer.entrance) <= 4)
        this.property.command(
          peer.id,
          { kind: 'acquire', propertyId: offer.id, mode: 'legacy-home' },
          `origin:${deriveSeed(this.world.seed, peer.id, offer.id)}`,
          this.elapsed,
        );
    }
  }
  /** Whole building flood bounds and a stable sorted door make offers independent of viewing side. */
  private canonicalHome(door: Prop): PropertyOffer | undefined {
    if (!door.building || this.world.tile(door.x, door.y).buildingKind !== 'house') return;
    const building = door.building,
      seen = new Set<string>(),
      queue: Point[] = [{ x: door.x, y: door.y }];
    let cursor = 0,
      minX = door.x,
      maxX = door.x,
      minY = door.y,
      maxY = door.y;
    while (cursor < queue.length && seen.size < 256) {
      const p = queue[cursor++],
        key = `${p.x}:${p.y}`;
      if (seen.has(key) || this.world.tile(p.x, p.y).building !== building) continue;
      seen.add(key);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (Math.abs(p.x + dx - door.x) <= 20 && Math.abs(p.y + dy - door.y) <= 20)
          queue.push({ x: p.x + dx, y: p.y + dy });
    }
    if (!seen.size || seen.size >= 256) return;
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      town = this.town(center);
    if (!town) return;
    const doors = this.world
      .propsAround(center.x, center.y, Math.max(maxX - minX, maxY - minY) + 2)
      .filter((p) => p.kind === 'door' && p.building === building)
      .sort((a, b) => a.id.localeCompare(b.id));
    let chosen: Prop | undefined, outside: ActorAddress | undefined;
    for (const d of doors) {
      const candidates = [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ]
        .map(([dx, dy]) => address({ x: d.x + dx, y: d.y + dy }))
        .filter(
          (p) =>
            this.world.tile(p.x, p.y).building !== building &&
            !this.world.blocked(p.x, p.y, this.removed, true),
        )
        .sort(
          (a, b) =>
            Math.hypot(b.x - center.x, b.y - center.y) -
              Math.hypot(a.x - center.x, a.y - center.y) ||
            a.y - b.y ||
            a.x - b.x,
        );
      if (candidates[0]) {
        chosen = d;
        outside = candidates[0];
        break;
      }
    }
    if (!chosen || !outside) return;
    const seed = deriveSeed(this.world.seed, 'property-v1', building),
      resident = this.world
        .npcsAround(center.x, center.y, 24)
        .some((n) => this.world.tile(n.home.x, n.home.y).building === building);
    return {
      id: building,
      name: `${town.name} · House ${1 + (seed % 90)}`,
      kind: 'home',
      settlementId: town.id,
      seed,
      spaceId: 'surface',
      x: chosen.x,
      y: chosen.y,
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      entrance: outside,
      vacant: !resident,
      rentable: !resident,
    };
  }
  private knownTowns = new Set<string>();
  private plotSurveys: { town: Settlement; cursor: number; admitted: number }[] = [];
  private discoverTown(town: Settlement) {
    if (this.knownTowns.has(town.id) || this.knownTowns.size >= 64) return;
    this.knownTowns.add(town.id);
    const props = this.world
      .propsAround(town.x, town.y, Math.min(town.radius + 8, 12))
      .filter((p) => ['notice', 'shrine', 'grave', 'door'].includes(p.kind))
      .sort(
        (a, b) =>
          ['notice', 'shrine', 'grave', 'door'].indexOf(a.kind) -
            ['notice', 'shrine', 'grave', 'door'].indexOf(b.kind) || a.id.localeCompare(b.id),
      );
    for (const prop of props) {
      const candidate = [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]
        .map(([dx, dy]) => address({ x: prop.x + dx, y: prop.y + dy }))
        .find(
          (p) =>
            !this.world.blocked(p.x, p.y, this.removed, true) &&
            !this.world.tile(p.x, p.y).building,
        );
      if (candidate) {
        this.entrances.set(town.id, {
          settlementId: town.id,
          name: `${town.name} underworks`,
          spaceId: 'surface',
          x: candidate.x,
          y: candidate.y,
        });
        break;
      }
    }
    this.plotSurveys.push({ town, cursor: 0, admitted: 0 });
  }
  private surveyPlot() {
    const survey = this.plotSurveys[0];
    if (!survey) return;
    const { town } = survey;
    if (survey.cursor >= 8 || survey.admitted >= 2 || this.offers.size >= 128) {
      this.plotSurveys.shift();
      return;
    }
    // One bounded parcel survey per discovery interval; do not generate every town approach in one frame.
    const radius = Math.ceil(town.radius) + 3;
    const candidates = [
      [radius, 2],
      [-radius - 4, 2],
      [2, radius],
      [2, -radius - 4],
      [radius, -7],
      [-radius - 4, -7],
      [-7, radius],
      [-7, -radius - 4],
    ];
    for (const [dx, dy] of candidates.slice(survey.cursor, survey.cursor + 1)) {
      survey.cursor++;
      const x = Math.round(town.x) + dx,
        y = Math.round(town.y) + dy;
      let clear = true;
      for (let oy = 0; oy < 5; oy++)
        for (let ox = 0; ox < 5; ox++) {
          const tile = this.world.tile(x + ox, y + oy);
          if (
            tile.building ||
            ['road', 'bridge', 'water', 'ice', 'wall', 'basalt'].includes(tile.terrain) ||
            this.world.blocked(x + ox, y + oy, this.removed, true)
          )
            clear = false;
        }
      if (!clear) continue;
      const entrances = [
        [x - 1, y + 2],
        [x + 5, y + 2],
        [x + 2, y - 1],
        [x + 2, y + 5],
      ]
        .map(([x, y]) => address({ x, y }))
        .filter((p) => !this.world.blocked(p.x, p.y, this.removed, true));
      const entrance = entrances.sort(
        (a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y),
      )[0];
      if (!entrance) continue;
      const key = `plot:${town.id}:${dx}:${dy}`,
        seed = deriveSeed(this.world.seed, 'plot-v1', key);
      this.offers.set(key, {
        id: key,
        name: `${town.name} · Workshop plot ${1 + (seed % 90)}`,
        kind: 'plot',
        settlementId: town.id,
        seed,
        spaceId: 'surface',
        x: entrance.x,
        y: entrance.y,
        bounds: { x, y, width: 5, height: 5 },
        entrance,
        vacant: true,
        rentable: true,
      });
      survey.admitted++;
    }
  }

  tick(elapsed: number) {
    const dungeonDt = Math.max(0, Math.min(0.25, elapsed - this.lastDungeonTick));
    this.lastDungeonTick = Math.max(this.lastDungeonTick, elapsed);
    this.elapsed = Math.max(this.elapsed, elapsed);
    const peers = [...this.peers.values()];
    this.handleUnderworld(
      this.underworld.tick(
        dungeonDt,
        peers.map((p) => this.dungeonPeer(p, true)),
        this.elapsed,
      ),
    );
    this.retryDomainDeliveries();
    if (this.elapsed >= this.nextDiscovery) {
      this.nextDiscovery = this.elapsed + 0.5;
      for (let i = 0; i < Math.min(2, peers.length); i++)
        this.discover(peers[(this.discoveryCursor + i) % peers.length]);
      this.discoveryCursor = peers.length
        ? (this.discoveryCursor + Math.min(2, peers.length)) % peers.length
        : 0;
      this.surveyPlot();
    }
    for (const peer of peers) this.observeEntry(peer);
    if (this.elapsed >= this.nextSocial) {
      this.nextSocial = this.elapsed + 1;
      const known = new Map<string, Npc>();
      for (const peer of peers)
        for (const a of this.actors.query(peer, 24, 32))
          if (!this.occupied(a.id)) known.set(a.id, a.body);
      const residents = [...known.values()].sort((a, b) => a.id.localeCompare(b.id));
      const rotate = (start: number, count: number) =>
        Array.from(
          { length: Math.min(count, residents.length) },
          (_, i) => residents[(start + i) % residents.length],
        );
      const social = rotate(this.socialCursor, 32),
        gossip = rotate(this.gossipCursor, 8);
      this.socialCursor = residents.length
        ? (this.socialCursor + social.length) % residents.length
        : 0;
      this.gossipCursor = residents.length
        ? (this.gossipCursor + gossip.length) % residents.length
        : 0;
      for (const npc of social) {
        if (this.property.hasWorkAssignment(npc.id)) continue;
        const actor = this.actors.get(npc.id)!;
        const town = this.town(npc);
        if (npc.role === 'guard' && town) {
          const intent = this.civic.updateGuard(
            {
              id: npc.id,
              ...address(npc),
              seed: npc.seed,
              role: npc.role,
              home: actor.home,
              settlementId: town.id,
            },
            peers.map((p) => ({ ...p, alive: p.active !== false })),
            this.elapsed,
            this.sight,
          );
          this.guardIntents.set(npc.id, intent);
          this.actors.setDestination(npc.id, intent.destination ?? actor.home);
        } else {
          const routine = this.society.routine(
            npc,
            worldTimeAt(this.elapsed),
            this.world,
            residents,
          );
          this.actors.setDestination(npc.id, address(routine.target));
        }
      }
      // One nearby rumor pair per actor, each report still validates knowledge, range and LOS.
      for (const npc of gossip) {
        const listener = residents.find(
          (n) => n.id !== npc.id && Math.hypot(n.x - npc.x, n.y - npc.y) < 6,
        );
        if (!listener) continue;
        const report = this.civic.latestReportFor(npc.id, listener.id);
        if (report)
          this.civic.report(
            { id: npc.id, ...address(npc) },
            { id: listener.id, ...address(listener) },
            report,
            this.elapsed,
            this.sight,
          );
      }
    }
    this.actors.advance(
      this.elapsed,
      (space) =>
        space === 'surface'
          ? {
              cell: (x, y) => {
                const door = this.world.propsAround(x, y, 0).find((p) => p.kind === 'door');
                if (door)
                  return {
                    kind: 'door',
                    id: door.id,
                    allowed: true,
                    open: this.removed.has(door.id),
                  };
                return {
                  kind:
                    this.world.blocked(x, y, this.removed, true) ||
                    this.property.blocks({ spaceId: 'surface', x, y })
                      ? 'blocked'
                      : 'open',
                };
              },
            }
          : undefined,
      {
        active: this.occupiedBodies,
        openDoor: (actor, id) => {
          const door = this.world.propsAround(actor.x, actor.y, 2).find((p) => p.id === id);
          if (!door) return;
          const homeBuilding = this.world.tile(actor.home.x, actor.home.y).building;
          if (
            door.building === homeBuilding ||
            (door.building &&
              this.property.access(actor.id, door.building, this.elapsed).allowed) ||
            this.civic.doorAccess({
              door,
              tile: this.world.tile(door.x, door.y),
              actorId: actor.id,
              hour: worldTimeAt(this.elapsed).hour,
            }).allowed
          )
            this.removed.add(id);
        },
      },
    );
    this.guardCombat();
    this.property.tick(this.elapsed, worldTimeAt(this.elapsed).hour / 24);
    for (const e of this.property.drainEvents()) {
      this.events.push({ kind: e.kind, x: e.x, y: e.y, actorId: e.ownerId });
      if (['construction-complete', 'store-sale'].includes(e.kind))
        this.action(
          { id: e.ownerId, spaceId: e.spaceId, x: e.x, y: e.y },
          e.kind === 'store-sale' ? 'trade' : 'build',
          e.id,
        );
    }
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
  }
  command(peer: SystemsPeer, command: SystemsCommand, eventId: string): SystemsResult {
    const result = this.execute(peer, command, eventId),
      canonical: SystemsResult = { ok: result.ok, message: result.message };
    // Adapter outcomes can contain internal bank/drop/member records. Only explicit effect receipts
    // cross the command boundary; inventory and civic/property state travel in the bounded frame.
    for (const key of [
      'removed',
      'opened',
      'health',
      'damage',
      'killed',
      'targetId',
      'transition',
      'wardSeconds',
      'rest',
      'recovery',
      'receipt',
    ] as const)
      if (result[key] !== undefined) Object.assign(canonical, { [key]: result[key] });
    return canonical;
  }
  private execute(peer: SystemsPeer, command: SystemsCommand, eventId: string): SystemsResult {
    const recalling = validSystemsCommand(command) && command.kind === 'underworld-recover';
    if (
      !this.peers.has(peer.id) ||
      (!recalling && peer.active === false) ||
      !validSystemsCommand(command)
    )
      return { ok: false, message: 'This life cannot act in the shared world.' };
    const current = this.peers.get(peer.id)!;
    if (!recalling && current.active === false)
      return { ok: false, message: 'This life cannot act right now.' };
    const match = /:r?(\d+)$/.exec(eventId),
      sequence = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(sequence) || sequence < this.nextSequence(current.id))
      return {
        ok: false,
        message: 'This action has already completed or belongs to an earlier session.',
      };
    this.commandSequences.set(current.id, sequence);
    if (command.kind === 'surface-recover')
      return {
        ok: false,
        message: 'Surface rescue must be admitted by the connected world authority.',
      };
    if (command.kind === 'underworld-recover') {
      const satchel = this.economy.satchel(current.id);
      if (!satchel) return { ok: false, message: 'This life has no admitted field satchel.' };
      const coinLoss = satchel.coins > 0 ? Math.max(1, Math.ceil(satchel.coins * 0.2)) : 0;
      const result = this.underworld.recall(current.id, this.elapsed, sequence, {
        coinLoss,
        canOccupySurface: (p) => !this.floorBlocked('surface', p.x, p.y),
        debit: () => this.economy.forfeitCoins(current.id, coinLoss).ok,
      });
      if (result.transition) Object.assign(current, result.transition.to);
      return {
        ok: result.ok,
        message: result.ok
          ? `The mind tether returns you to the surface. ${coinLoss} field coin${coinLoss === 1 ? '' : 's'} lost; the anchor needs thirty seconds to recover.`
          : result.message,
        ...(result.transition ? { transition: result.transition } : {}),
        ...(result.recovery ? { recovery: result.recovery } : {}),
      };
    }
    if (command.kind === 'underworld-enter') {
      if (current.spaceId !== 'surface')
        return { ok: false, message: 'Return to the surface before entering another complex.' };
      this.discover(current);
      const entrance = this.entrances.get(command.settlementId);
      if (!entrance || distance(current, entrance) > 2.2)
        return { ok: false, message: 'Stand beside the actual underworks entrance.' };
      const result = this.underworld.enter(
        this.dungeonPeer(current),
        command.settlementId,
        entrance,
      );
      if (result.transition) Object.assign(current, result.transition.to);
      return {
        ok: result.ok,
        message: result.message,
        ...(result.transition ? { transition: result.transition } : {}),
      };
    }
    if (command.kind === 'underworld-interact') {
      const result = this.underworld.interact(
        this.dungeonPeer(current),
        command.targetId,
        this.elapsed,
        sequence,
      );
      this.handleUnderworld(result.events);
      this.retryDomainDeliveries();
      if (result.transition) Object.assign(current, result.transition.to);
      const rested = result.events.some((e) => e.kind === 'cue' && e.cue === 'rest');
      return {
        ok: result.ok,
        message: result.message,
        ...(result.transition ? { transition: result.transition } : {}),
        ...(rested ? { rest: { hpFraction: 0.2, staminaFraction: 0.6 } } : {}),
      };
    }
    if (command.kind === 'underworld-attack') {
      const result = this.underworld.attack(
        this.dungeonPeer(current, true),
        { kind: command.attack, heading: command.heading, sequence },
        this.elapsed,
      );
      this.handleUnderworld(result.events);
      return { ok: result.ok, message: result.message };
    }
    if (command.kind === 'underworld-rewards') {
      const pending = this.underworld.pendingRewards(current.id);
      if (!pending.length) return { ok: false, message: 'No salvage is waiting for this life.' };
      let claimed = 0;
      for (const reward of pending) {
        const out = this.economy.transact(
          current.id,
          empty(),
          reward.bundle,
          `underworld-reward:${reward.id}`,
        );
        if (out.ok) {
          this.underworld.acknowledgeReward(current.id, reward.id);
          claimed++;
        }
      }
      return {
        ok: claimed > 0,
        message: claimed
          ? `${claimed} recovered cache${claimed === 1 ? '' : 's'} moved into your field satchel.`
          : 'Make space in your field satchel; the salvage remains safely reserved.',
      };
    }
    if (command.kind === 'consume') {
      if ((this.combatCooldowns.get(`consume:${current.id}`) ?? 0) > this.elapsed)
        return { ok: false, message: 'Finish using the previous supply.' };
      const out = this.economy.transact(
        current.id,
        { coins: 0, items: { [command.item]: 1 } },
        empty(),
        `consume:${eventId}`,
      );
      if (!out.ok) return out;
      this.combatCooldowns.set(`consume:${current.id}`, this.elapsed + 1);
      this.events.push({
        kind: command.item === 'ward-kit' ? 'spell' : 'heal',
        spaceId: current.spaceId,
        x: current.x,
        y: current.y,
        actorId: current.id,
      });
      if (command.item === 'ward-kit') {
        this.wards.set(current.id, this.elapsed + 30);
        return {
          ok: true,
          message:
            'The bone-and-crystal ward reduces guard and underground attack damage by thirty percent for thirty seconds.',
          wardSeconds: 30,
        };
      }
      return {
        ok: true,
        message: command.item === 'ration' ? 'Trail meal eaten.' : 'Field dressing applied.',
        rest: {
          hpFraction: command.item === 'ration' ? 0.08 : 0.25,
          staminaFraction: command.item === 'ration' ? 0.45 : 0,
        },
      };
    }
    if (command.kind === 'person-attack' && current.combatActive === false)
      return { ok: false, message: 'Close the conversation before attacking.' };
    if (command.kind === 'person-attack')
      return this.attackPerson(current, command.targetId, command.heading, eventId);
    if (current.spaceId !== 'surface' && !['claim', 'craft'].includes(command.kind))
      return { ok: false, message: 'That action belongs to the surface. Use the stair to return.' };
    if (command.kind === 'claim') {
      const out = this.economy.claim(current, command.targetId, this.elapsed);
      if (out.ok) {
        this.events.push({
          kind: 'loot-claim',
          spaceId: current.spaceId,
          x: current.x,
          y: current.y,
          actorId: current.id,
        });
        if (out.consequence)
          this.action(
            current,
            out.consequence === 'protected-harvest' ? 'protected-harvest' : 'hunt',
            eventId,
          );
      }
      return out;
    }
    if (command.kind === 'hunt') {
      const animal = this.hooks.fauna().find((a) => a.id === command.targetId);
      if (!animal) return { ok: false, message: 'That animal is no longer here.' };
      const town = this.town(animal),
        protect = !!town && this.civic.lawsFor(town).protectsWildlife && !animal.dangerous;
      const out = this.economy.hunt(current, animal, this.elapsed, {
        clearLine: this.sight(current, address(animal)),
        protected: protect,
        biome: this.world.tile(animal.x, animal.y).biome,
        night: worldTimeAt(this.elapsed).nightness > 0.5,
      });
      if (out.ok) {
        if (out.reaction) this.hooks.woundFauna?.(animal.id, current, out.reaction);
        this.events.push({ kind: 'animal-harvest', x: animal.x, y: animal.y, actorId: current.id });
        if (out.killed) {
          this.hooks.defeatFauna(animal.id);
          this.action(current, protect ? 'protected-hunt' : 'hunt', eventId, animal.id);
        }
      }
      return { ...out, targetId: animal.id };
    }
    if (command.kind === 'gather') {
      const prop = this.prop(current, command.targetId);
      if (!prop || this.removed.has(prop.id))
        return { ok: false, message: 'This resource is no longer available.' };
      const kind =
        prop.kind === 'pine'
          ? 'wood'
          : prop.kind === 'rock'
            ? prop.seed % 3 === 0
              ? 'ore'
              : 'stone'
            : ['cequin', 'heartleaf', 'emberroot'].includes(prop.kind)
              ? prop.seed % 3 === 0
                ? 'resin'
                : 'fiber'
              : undefined;
      if (!kind) return { ok: false, message: 'That is not a field resource.' };
      const out = this.economy.gather(
        current,
        { ...address(prop), id: prop.id, kind },
        this.elapsed,
      );
      if (out.ok) {
        this.removed.add(prop.id);
        this.events.push({ kind: 'harvest', x: prop.x, y: prop.y, actorId: current.id });
        return { ...out, removed: [prop.id] };
      }
      return out;
    }
    if (command.kind === 'craft') {
      const helper =
        current.spaceId === 'surface'
          ? this.actors
              .query(current, 3, 8)
              .find((a) => this.rescues.some((r) => r.delivered && r.survivorId === a.id))
          : undefined;
      const nearby =
          current.spaceId === 'surface' ? this.world.propsAround(current.x, current.y, 3) : [],
        work =
          nearby.find((p) => p.kind === 'workbench') ??
          (helper?.body.role === 'engineer' ? helper : undefined),
        hearth =
          current.spaceId === 'surface' &&
          this.world.tile(current.x, current.y).buildingKind === 'inn'
            ? current
            : helper?.body.role === 'botanist'
              ? helper
              : undefined;
      const place = work ?? hearth;
      return this.economy.craft(
        current,
        command.recipeId,
        {
          ...address(place ?? current, current.spaceId),
          kind: work ? 'workshop' : hearth ? 'hearth' : 'field',
        },
        eventId,
      );
    }
    if (command.kind === 'sell') {
      const merchant = this.actors
        .query(current, 3, 8)
        .find((a) => a.body.role === 'merchant' && !a.body.hostile);
      if (!merchant || worldTimeAt(this.elapsed).nightness > 0.5)
        return { ok: false, message: 'Find an awake merchant nearby.' };
      const rep = this.civic.reputation(merchant.id, current.id);
      const out = this.economy.sell(
        current,
        command.item,
        command.quantity,
        { ...address(merchant), buyMultiplier: 1 / rep.priceFactor },
        eventId,
      );
      if (out.ok) this.action(current, 'trade', eventId, merchant.id);
      return out;
    }
    if (command.kind === 'guild') {
      const contact = this.npc(command.npcId),
        faction = this.civic.faction(command.factionId);
      if (
        !contact ||
        !faction ||
        !this.contacts(current).some((c) => c.factionId === faction.id && c.npcId === contact.id) ||
        contact.hostile ||
        contact.hp <= 0 ||
        distance(current, address(contact)) > 3 ||
        this.town(contact)?.id !== faction.settlementId
      )
        return { ok: false, message: 'Meet a local guild contact in person.' };
      this.civic.setGuildContact(faction.id, contact.id);
      const debit = (cost: Parameters<FieldEconomy['transact']>[1], receipt: string) =>
        this.economy.transact(current.id, cost, empty(), receipt).ok;
      if (command.action === 'discover') return this.civic.discover(current.id, faction.id);
      if (command.action === 'join')
        return this.civic.join(current.id, faction.id, this.elapsed, debit);
      if (command.action === 'duty')
        return this.civic.completeDuty(current.id, faction.id, this.elapsed, debit);
      if (command.action === 'dues')
        return this.civic.payDues(current.id, faction.id, this.elapsed, debit);
      if (command.action === 'reconcile')
        return this.civic.reconcile(current.id, faction.id, this.elapsed, debit);
      return this.civic.leave(current.id, faction.id, this.elapsed);
    }
    if (command.kind === 'property') {
      const offer =
        this.offers.get(command.command.propertyId) ??
        this.property.getEstate(command.command.propertyId)?.offer;
      this.serviceDiscount =
        offer &&
        ['build', 'hire', 'furnish'].includes(command.command.kind) &&
        this.guildRank(current.id, offer.settlementId) >= 2
          ? 0.1
          : 0;
      const rebuilding =
        offer && command.command.kind === 'build'
          ? this.rebuildingRelief(offer.settlementId, command.command.station)
          : 0;
      this.serviceDiscount = Math.max(this.serviceDiscount, rebuilding);
      try {
        const result = this.property.command(current.id, command.command, eventId, this.elapsed);
        return result.ok && rebuilding
          ? {
              ...result,
              message: `${result.message} Recovered plans reduced the construction coin fee by 25%.`,
            }
          : result;
      } finally {
        this.serviceDiscount = 0;
      }
    }
    if (command.kind === 'fine') {
      const guard = this.npc(command.guardId);
      if (!guard || distance(current, address(guard)) > 3)
        return { ok: false, message: 'Speak to the watch nearby.' };
      return this.civic.settleFine(
        command.guardId,
        current.id,
        (cost, receipt) => this.economy.transact(current.id, cost, empty(), receipt).ok,
      );
    }
    if (command.kind !== 'force-door')
      return { ok: false, message: 'That command is not available here.' };
    const door = this.prop(current, command.targetId);
    if (!door || door.kind !== 'door' || distance(current, address(door)) > 2)
      return { ok: false, message: 'Stand beside the door.' };
    if (this.doorAccess(current, door).allowed)
      return { ok: false, message: 'You already have permission. Open the door normally.' };
    if (!this.economy.satchel(current.id)?.items.hatchet)
      return {
        ok: false,
        message: 'Forcing a door requires a forester hatchet. This is a witnessed crime.',
      };
    const outcome = this.action(current, 'burglary', eventId, door.building);
    if (!outcome?.ok)
      return { ok: false, message: 'This property cannot admit another consequence.' };
    this.removed.add(door.id);
    this.property.invalidateNavigation();
    return {
      ok: true,
      message: 'The forced lock draws attention. The household will remember credible reports.',
      removed: [door.id],
      opened: [door.id],
    };
  }
  private handleUnderworld(events: readonly UnderworldEvent[]) {
    for (const event of events) {
      if (event.kind === 'hit') {
        if (this.peers.has(event.targetId)) this.queueHit(event);
        this.events.push({
          kind: 'tool-impact',
          spaceId: event.spaceId,
          x: event.x,
          y: event.y,
          actorId: event.actorId,
        });
      } else if (event.kind === 'death') {
        const out = this.economy.spawnDeath(event.death);
        this.reservedDeaths.delete(event.death.actorId);
        if (
          !out.ok &&
          !this.pendingDeaths.some((d) => d.actorId === event.death.actorId) &&
          this.pendingDeaths.length < 288
        )
          this.pendingDeaths.push(structuredClone(event.death));
      } else if (event.kind === 'rescue') {
        if (!this.rescues.some((r) => r.survivorId === event.survivorId))
          this.rescues.push({
            actorId: event.actorId,
            survivorId: event.survivorId,
            profession: event.profession,
            settlementId: event.settlementId,
            depth: event.depth,
            delivered: false,
          });
      } else if (event.kind === 'unlock') this.unlocks.add(`${event.settlementId}:${event.unlock}`);
      else if (event.kind === 'cue')
        this.events.push({
          kind:
            event.cue === 'gate'
              ? 'door-open'
              : event.cue === 'attack'
                ? 'swing'
                : event.cue === 'victory'
                  ? 'loot-claim'
                  : event.cue === 'boss-phase'
                    ? 'spell'
                    : 'ui',
          x: event.x,
          y: event.y,
          spaceId: event.spaceId,
        });
    }
  }
  private queueHit(hit: SystemsCombatHit) {
    if (this.combatEvents.length >= 256) return;
    this.combatEvents.push({ ...hit, damage: this.mitigateDamage(hit.targetId, hit.damage) });
  }
  mitigateDamage(actorId: string, damage: number) {
    return Math.max(
      0,
      Math.round(damage * ((this.wards.get(actorId) ?? 0) > this.elapsed ? 0.7 : 1)),
    );
  }
  drainCombatEvents(): SystemsCombatHit[] {
    return this.combatEvents.splice(0);
  }
  private retryDomainDeliveries() {
    for (const death of this.pendingDeaths.slice(0, 8)) {
      if (!this.economy.canAdmitDeath(death.actorId, this.elapsed)) continue;
      const out = this.economy.spawnDeath({ ...death, time: this.elapsed });
      if (out.ok) this.pendingDeaths.splice(this.pendingDeaths.indexOf(death), 1);
    }
    for (const rescue of this.rescues.filter((r) => !r.delivered).slice(0, 2)) {
      const town = this.civic.save().towns.find((t) => t.id === rescue.settlementId);
      if (!town) continue;
      this.discoverTown(town);
      const entrance = this.entrances.get(town.id);
      if (!entrance) continue;
      let point: Point | undefined;
      for (let radius = 1; radius <= 5 && !point; radius++)
        for (const [dx, dy] of [
          [radius, 0],
          [-radius, 0],
          [0, radius],
          [0, -radius],
        ]) {
          const p = { x: entrance.x + dx, y: entrance.y + dy };
          if (
            !this.world.blocked(p.x, p.y, this.removed, true) &&
            !this.property.blocks(address(p))
          ) {
            point = p;
            break;
          }
        }
      if (!point) continue;
      const seed = deriveSeed(this.world.seed, rescue.survivorId),
        role = rescue.profession === 'herbalist' ? 'botanist' : 'engineer';
      const npc: Npc = {
        id: rescue.survivorId,
        seed,
        name: `${['Mira', 'Oren', 'Neri', 'Aven', 'Tera', 'Ilan'][seed % 6]} · ${rescue.profession}`,
        role,
        clan: town.clan,
        appearance: appearance(seed, role, town.clan),
        maxHp: 75,
        hp: 75,
        home: { ...point },
        ...point,
        speed: 1.4,
        heading: 0,
        phase: 0,
        hostile: false,
        cooldown: 0,
      };
      if (!this.actors.register(npc, 'npc', this.elapsed, { home: address(point), speed: 1.4 }))
        continue;
      rescue.delivered = true;
      this.action(
        { id: rescue.actorId, ...address(point) },
        'rescue',
        `rescue:${rescue.survivorId}`,
        rescue.survivorId,
      );
      this.events.push({
        kind: 'rescue',
        x: point.x,
        y: point.y,
        actorId: rescue.actorId,
        text: `${npc.name} has returned and can be hired.`,
      });
    }
  }
  private attackPerson(
    peer: SystemsPeer,
    targetId: string,
    heading: number,
    eventId: string,
  ): SystemsResult {
    const record = this.actors.get(targetId);
    if (
      peer.spaceId !== 'surface' ||
      !record ||
      record.spaceId !== 'surface' ||
      record.state === 'dead' ||
      record.body.hp <= 0 ||
      this.occupied(record.id)
    )
      return { ok: false, message: 'That person is not within this world space.' };
    const weapon = peer.weaponKind ?? 'sword',
      seed =
        Number.isSafeInteger(peer.weaponSeed) &&
        peer.weaponSeed! >= -0xffffffff &&
        peer.weaponSeed! <= MAX_WEAPON_SEED
          ? peer.weaponSeed!
          : deriveSeed(this.world.seed, peer.id, 'field-combat'),
      profile = weaponProfile(seed, weapon, 1),
      range = weapon === 'bow' ? Math.min(8, profile.range) : profile.range;
    if ((this.combatCooldowns.get(peer.id) ?? 0) > this.elapsed)
      return { ok: false, message: 'Recover before attacking again.' };
    const dist = distance(peer, record),
      dot =
        dist < 0.01
          ? 1
          : ((record.x - peer.x) * Math.cos(heading) + (record.y - peer.y) * Math.sin(heading)) /
            dist;
    if (dist > range || dot < 0.3 || !this.sight(peer, record))
      return { ok: false, message: 'Face the person within clear weapon reach.' };
    const damage = profile.damage,
      killed = record.body.hp <= damage;
    if (killed && !this.economy.canAdmitDeath(record.id, this.elapsed))
      return {
        ok: false,
        message: 'The field ledger cannot retain another death. Recover existing belongings first.',
      };
    const consequence = this.action(peer, killed ? 'murder' : 'assault', eventId, targetId);
    if (!consequence?.ok)
      return {
        ok: false,
        message: 'This action cannot be admitted to the local consequence ledger.',
      };
    this.combatCooldowns.set(peer.id, this.elapsed + profile.cooldown);
    record.body.hp = Math.max(0, record.body.hp - damage);
    this.actors.update(record.body, this.elapsed, record.spaceId);
    if (killed) {
      this.actors.markDead(record.id);
      this.economy.spawnDeath({
        actorId: record.id,
        kind: 'enemy',
        role: record.body.role,
        difficulty: Math.max(1, Math.round(record.body.maxHp / 35)),
        contributors: [peer.id],
        time: this.elapsed,
        ...address(record, record.spaceId),
        biome: this.world.tile(record.x, record.y).biome,
      });
    } else if (record.body.role !== 'guard') {
      const dx = record.x - peer.x,
        dy = record.y - peer.y,
        length = Math.hypot(dx, dy) || 1;
      this.actors.setDestination(record.id, {
        spaceId: record.spaceId,
        x: record.x + (dx / length) * 8,
        y: record.y + (dy / length) * 8,
      });
    }
    this.events.push({ kind: 'tool-impact', x: record.x, y: record.y, actorId: peer.id });
    return {
      ok: true,
      message: killed
        ? 'The witnessed killing will be remembered.'
        : 'The person reacts to your attack.',
      targetId,
      health: record.body.hp,
      damage,
      killed,
    };
  }
  private arrests = new Map<string, { targetId: string; at: number }>();
  private guardCombat() {
    for (const [guardId, intent] of this.guardIntents) {
      const guard = this.actors.get(guardId),
        target = intent.targetId ? this.peers.get(intent.targetId) : undefined;
      if (
        !guard ||
        this.occupied(guardId) ||
        guard.body.hp <= 0 ||
        !target ||
        !intent.arrest ||
        target.active === false ||
        target.combatActive === false
      ) {
        this.arrests.delete(guardId);
        continue;
      }
      let arrest = this.arrests.get(guardId);
      if (!arrest || arrest.targetId !== target.id) {
        arrest = { targetId: target.id, at: this.elapsed };
        this.arrests.set(guardId, arrest);
      }
      if (
        this.elapsed - arrest.at < 6 ||
        distance(guard, target) > 1.8 ||
        !this.sight(guard, target) ||
        (this.combatCooldowns.get(guardId) ?? 0) > this.elapsed
      )
        continue;
      intent.attack = true;
      intent.message =
        'The watch warned you to surrender. Settle the fine to end the confrontation.';
      this.combatCooldowns.set(guardId, this.elapsed + 1.5);
      this.queueHit({
        id: `guard:${this.world.seed}:${++this.domainSerial}`,
        actorId: guardId,
        targetId: target.id,
        damage: 6,
        spaceId: target.spaceId,
        x: target.x,
        y: target.y,
        attack: 'melee',
      });
      this.events.push({ kind: 'guard-warning', x: guard.x, y: guard.y, actorId: guardId });
    }
  }
  death(death: FieldDeath) {
    return this.economy.spawnDeath(death);
  }
  private rebuildingRelief(settlementId: string, station: string) {
    const unlock =
      station === 'garden' || station === 'sawmill'
        ? 'waterworks'
        : station === 'apothecary'
          ? 'healing-garden'
          : station === 'carpentry'
            ? 'deep-forge'
            : undefined;
    return unlock && this.unlocks.has(`${settlementId}:${unlock}`) ? 0.25 : 0;
  }
  private guildRank(actorId: string, settlementId: string, purpose?: string) {
    const day = worldTimeAt(this.elapsed).day;
    return Math.max(
      -1,
      ...this.civic
        .memberships(actorId)
        .filter(
          (m) =>
            m.status === 'member' &&
            m.duesThroughDay >= day &&
            this.civic.faction(m.factionId)?.settlementId === settlementId &&
            (!purpose || this.civic.faction(m.factionId)?.purpose === purpose),
        )
        .map((m) => m.rank),
    );
  }
  private contacts(peer: SystemsPeer) {
    if (peer.spaceId !== 'surface') return [];
    const town = this.town(peer);
    if (!town) return [];
    const residents = this.world
      .npcsAround(town.x, town.y, town.radius + 8)
      .filter(
        (n) =>
          n.hp > 0 && !n.hostile && this.actors.get(n.id)?.state !== 'dead' && !this.occupied(n.id),
      );
    return this.civic.factionsFor(town).flatMap((f) => {
      const roles =
        f.purpose === 'watch'
          ? ['guard']
          : f.purpose === 'craft'
            ? ['engineer']
            : f.purpose === 'trade'
              ? ['merchant']
              : f.purpose === 'care'
                ? ['botanist', 'archivist']
                : ['pilgrim', 'refugee'];
      const npc = residents
        .filter((n) => roles.includes(n.role))
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!npc) return [];
      const actor = this.actors.get(npc.id);
      return [
        {
          factionId: f.id,
          npcId: npc.id,
          name: actor?.body.name ?? npc.name,
          ...address(actor ?? npc, actor?.spaceId ?? 'surface'),
        },
      ];
    });
  }
  frame(peer: SystemsPeer) {
    peer = this.peers.get(peer.id) ?? peer;
    const dungeon = this.underworld.frame(peer.spaceId);
    const nearbyFeatures =
      dungeon?.plan.features.filter(
        (feature) =>
          feature.kind === 'up' ||
          distance(peer, { ...address(feature, peer.spaceId) }) <= 8 ||
          dungeon.state.discovered.some((i) => {
            const room = dungeon.plan.rooms[i];
            return (
              room &&
              Math.abs(feature.x - room.x) <= room.width / 2 + 1 &&
              Math.abs(feature.y - room.y) <= room.height / 2 + 1
            );
          }),
      ) ?? [];
    const economy = this.economy.frame(peer, this.elapsed);
    if (!economy) throw new Error('This life has no admitted field satchel.');
    const town = peer.spaceId === 'surface' ? this.town(peer) : undefined;
    const factions = town ? this.civic.factionsFor(town) : [];
    const visibleActors = this.actors.query(peer, 24, 32).filter((a) => !this.occupied(a.id));
    const contacts = this.contacts(peer);
    const nearbyProps =
      peer.spaceId === 'surface' ? this.world.propsAround(peer.x, peer.y, 24) : [];
    const actorBuildings = new Map(
      visibleActors.map((a) => [a.id, this.world.tile(a.x, a.y).building]),
    );
    const signs: WorldSign[] = [];
    if (peer.spaceId === 'surface')
      for (const prop of nearbyProps) {
        if (Math.hypot(prop.x - peer.x, prop.y - peer.y) > 16) continue;
        if (signs.length >= 24) break;
        const tile = this.world.tile(prop.x, prop.y),
          offer = tile.building ? this.offers.get(tile.building) : undefined,
          estate = tile.building ? this.property.getEstate(tile.building) : undefined;
        const services: SignService[] = [];
        if (tile.buildingKind === 'inn') services.push('food-preparation');
        if (estate?.ownerId === peer.id) {
          services.push('storage');
          if (estate.furnishings > 0) services.push('rest');
          if (estate.stations.length) services.push('production');
          if (estate.stations.some((s) => s.kind === 'garden')) services.push('garden');
        }
        if (
          tile.building &&
          nearbyProps.some((p) => p.kind === 'workbench' && p.building === tile.building)
        )
          services.push('workbench');
        const inside = visibleActors.filter(
          (a) => tile.building && actorBuildings.get(a.id) === tile.building && a.state !== 'dead',
        );
        if (inside.some((a) => a.body.role === 'merchant')) services.push('trade');
        if (inside.some((a) => contacts.some((c) => c.npcId === a.id)))
          services.push('guild-contact');
        const sign = signForProp(prop, tile, town, {
          actorId: peer.id,
          hour: worldTimeAt(this.elapsed).hour,
          civic: this.civic,
          price: offer?.vacant ? propertyPrice(offer).buy : undefined,
          services,
          ...(estate
            ? {
                ownerId: estate.ownerId,
                ownerName:
                  this.peers.get(estate.ownerId)?.name ??
                  (estate.ownerId === peer.id ? 'You' : 'Registered holding'),
                guests: estate.guests,
                locked: estate.locked,
              }
            : {}),
          ...(prop.kind === 'door' ? { access: this.doorAccess(peer, prop) } : {}),
        });
        if (sign) signs.push(sign);
      }
    return {
      version: LIVING_SYSTEMS_VERSION,
      seed: this.world.seed,
      benefits: town
        ? {
            workshopAccess: this.guildRank(peer.id, town.id, 'craft') >= 1,
            serviceDiscount: this.guildRank(peer.id, town.id) >= 2 ? 0.1 : 0,
            rebuilding: ['sawmill', 'garden', 'apothecary', 'carpentry']
              .filter((station) => this.rebuildingRelief(town.id, station) > 0)
              .map((station) => ({ station, coinDiscount: 0.25 })),
          }
        : null,
      equipment: {
        kind: peer.weaponKind ?? 'sword',
        seed: peer.weaponSeed ?? deriveSeed(this.world.seed, peer.id, 'field-combat'),
      },
      nextSequence: this.nextSequence(peer.id),
      recall: {
        coinLoss:
          economy.satchel.coins > 0 ? Math.max(1, Math.ceil(economy.satchel.coins * 0.2)) : 0,
        cooldownUntil: this.underworld.recoveryStatus(peer.id).cooldownUntil,
      },
      activeWardSeconds: Math.max(0, (this.wards.get(peer.id) ?? 0) - this.elapsed),
      location: address(peer, peer.spaceId),
      underground: dungeon
        ? {
            settlementId: dungeon.plan.settlementId,
            depth: dungeon.plan.depth,
            spaceId: peer.spaceId,
            name: dungeon.plan.name,
            biome: dungeon.plan.biome,
            material: dungeon.plan.material,
            width: dungeon.plan.width,
            height: dungeon.plan.height,
            state: dungeon.state,
            projectiles: dungeon.projectiles,
            time: dungeon.time,
            features: nearbyFeatures,
            objective: dungeon.state.enemies.some((e) => e.kind === 'boss' && e.hp > 0)
              ? dungeon.state.puzzle < 3
                ? 'Read the archive inscription and align its three controls.'
                : 'Defeat the keeper. Its warning reveals the attack before release.'
              : dungeon.plan.depth === 2
                ? 'Stabilize the engine and return its knowledge to the surface.'
                : 'The keeper is defeated. Descend or return through the open stair.',
          }
        : null,
      entrances:
        peer.spaceId === 'surface'
          ? [...this.entrances.values()].filter((e) => distance(peer, e) <= 32).slice(0, 4)
          : [],
      pendingSalvage: this.underworld.pendingRewards(peer.id, 16),
      pendingSalvageCount: this.underworld.pendingRewardCount(peer.id),
      consumables: (['ration', 'bandage', 'ward-kit'] as const).map((item) => ({
        item,
        quantity: economy.satchel.items[item] ?? 0,
        description:
          item === 'ration'
            ? 'Restore stamina and a little health.'
            : item === 'bandage'
              ? 'Restore a quarter of your maximum health.'
              : 'Reduce guard and underground attack damage by 30% for 30 seconds.',
      })),
      rescued: this.rescues.filter((r) => r.actorId === peer.id),
      unlocks: [...this.unlocks].filter((key) =>
        this.rescues.some((r) => r.actorId === peer.id && key.startsWith(`${r.settlementId}:`)),
      ),
      contacts,
      reactions: visibleActors.map((a) => {
        const memory = this.civic.reputation(a.id, peer.id);
        return {
          npcId: a.id,
          summary: memory.summary,
          hostile: memory.attitude === 'hostile',
          fear: memory.attitude === 'afraid',
          priceMultiplier: memory.priceFactor,
        };
      }),
      resources:
        peer.spaceId === 'surface'
          ? this.world
              .propsAround(peer.x, peer.y, 3)
              .filter(
                (p) =>
                  !this.removed.has(p.id) &&
                  ['pine', 'rock', 'cequin', 'heartleaf', 'emberroot'].includes(p.kind),
              )
              .slice(0, 16)
              .map((p) => ({ id: p.id, name: p.name, kind: p.kind }))
          : [],
      fauna:
        peer.spaceId === 'surface'
          ? this.hooks
              .fauna()
              .filter((a) => distance(peer, address(a)) < 4)
              .slice(0, 8)
              .map((a) => ({
                id: a.id,
                name: a.name,
                kind: a.kind,
                protected: !!town && this.civic.lawsFor(town).protectsWildlife && !a.dangerous,
              }))
          : [],
      elapsed: this.elapsed,
      economy,
      actors: visibleActors.map((a) => {
        const intent = this.guardIntents.get(a.id);
        return {
          ...a.body,
          hostile:
            a.body.hostile ||
            !!(intent?.targetId === peer.id && ['pursue', 'arrest'].includes(intent.state)),
        };
      }),
      signs,
      town: town ?? null,
      laws: town ? this.civic.lawsFor(town) : null,
      factions,
      memberships: this.civic.memberships(peer.id).map(({ remembered, ...membership }) => ({
        ...membership,
        rememberedCount: remembered.length,
      })),
      duties: factions.map((f) => this.civic.duty(peer.id, f.id, this.elapsed)).filter((d) => !!d),
      reputation: town ? this.civic.townReputation(town.id, peer.id) : null,
      guards: [...this.guardIntents]
        .filter(([id]) => this.actors.get(id) && distance(this.actors.get(id)!, peer) < 24)
        .slice(0, 8)
        .map(([id, intent]) => ({ id, ...intent })),
      offers: [...this.offers.values()].filter((o) => distance(o, peer) < 24).slice(0, 12),
      property: this.property.frame(peer.id, peer),
      home: this.property.homeTarget(peer.id, this.elapsed) ?? null,
      diagnostics: {
        actors: this.actors.diagnostics,
        civic: this.civic.diagnostics,
        property: this.property.diagnostics,
      },
    };
  }
  drainEvents() {
    return this.events.splice(0);
  }
  save() {
    return {
      version: 1 as const,
      seed: this.world.seed,
      elapsed: this.elapsed,
      economy: this.economy.save(),
      civic: this.civic.save(),
      property: this.property.save(),
      actors: this.actors.snapshot(),
      society: this.society.save(),
      underworld: this.underworld.save(),
      commands: [...this.commandSequences] as [string, number][],
      occupied: [...this.occupiedBindings] as [string, string][],
      occupancy: [...this.occupancy] as [string, { spaceId: string; building: string | null }][],
      pendingDeaths: structuredClone(this.pendingDeaths),
      rescues: structuredClone(this.rescues),
      unlocks: [...this.unlocks],
      wards: [...this.wards] as [string, number][],
      domainSerial: this.domainSerial,
    };
  }
}
type CurrentLivingSystemsSave = ReturnType<LivingSystems['save']>;
type ExtensionKeys =
  | 'underworld'
  | 'commands'
  | 'pendingDeaths'
  | 'rescues'
  | 'unlocks'
  | 'wards'
  | 'domainSerial'
  | 'occupied'
  | 'occupancy';
export type LivingSystemsSave = Omit<CurrentLivingSystemsSave, ExtensionKeys> &
  Partial<Pick<CurrentLivingSystemsSave, ExtensionKeys>>;
export type LivingSystemsFrame = ReturnType<LivingSystems['frame']>;
/** Bounded typed presentation from the authenticated authority; never accepted as a save. */
export function validLivingSystemsFrame(v: unknown): v is LivingSystemsFrame {
  if (
    !object(v) ||
    v.version !== 1 ||
    typeof v.elapsed !== 'number' ||
    !Number.isFinite(v.elapsed) ||
    v.elapsed < 0 ||
    !validFieldEconomyFrame(v.economy) ||
    !validSystemAddress(v.location) ||
    !Number.isSafeInteger(v.nextSequence) ||
    Number(v.nextSequence) < 1
  )
    return false;
  const arrays: [string, number][] = [
    ['actors', 32],
    ['signs', 24],
    ['factions', 3],
    ['memberships', 384],
    ['duties', 3],
    ['guards', 8],
    ['offers', 12],
    ['contacts', 3],
    ['resources', 16],
    ['fauna', 8],
  ];
  if (
    !arrays.every(
      ([key, max]) => Array.isArray(v[key]) && v[key].length <= max && v[key].every(object),
    )
  )
    return false;
  if (
    v.reactions !== undefined &&
    (!Array.isArray(v.reactions) ||
      v.reactions.length > 32 ||
      !v.reactions.every(
        (r) =>
          object(r) &&
          id(r.npcId) &&
          typeof r.summary === 'string' &&
          r.summary.length <= 500 &&
          typeof r.hostile === 'boolean' &&
          typeof r.fear === 'boolean' &&
          (r.priceMultiplier === undefined ||
            (typeof r.priceMultiplier === 'number' &&
              Number.isFinite(r.priceMultiplier) &&
              r.priceMultiplier >= 0.5 &&
              r.priceMultiplier <= 2)),
      ))
  )
    return false;
  if (
    !(v.actors as unknown[]).every(validPersistentNpc) ||
    !object(v.property) ||
    !Array.isArray(v.property.estates) ||
    v.property.estates.length > 64 ||
    !Array.isArray(v.property.workers) ||
    v.property.workers.length > 96
  )
    return false;
  if (
    v.pendingSalvageCount !== undefined &&
    (!Number.isInteger(v.pendingSalvageCount) ||
      Number(v.pendingSalvageCount) < 0 ||
      Number(v.pendingSalvageCount) > 256)
  )
    return false;
  let nodes = 0;
  const safe = (x: unknown, depth = 0): boolean => {
    if (++nodes > 20000 || depth > 12) return false;
    if (x === null || typeof x === 'boolean') return true;
    if (typeof x === 'number') return Number.isFinite(x);
    if (typeof x === 'string') return x.length <= 2000;
    if (Array.isArray(x)) return x.length <= 384 && x.every((y) => safe(y, depth + 1));
    return (
      object(x) &&
      Object.keys(x).length <= 64 &&
      Object.entries(x).every(
        ([k, y]) => !['__proto__', 'constructor', 'prototype'].includes(k) && safe(y, depth + 1),
      )
    );
  };
  // JSON wire payloads omit optional undefined properties. Local callers do not use this validator.
  return safe(v);
}
export function validLivingSystemsSave(v: unknown): v is LivingSystemsSave {
  return (
    object(v) &&
    Object.keys(v).every((k) =>
      [
        'version',
        'seed',
        'elapsed',
        'economy',
        'civic',
        'property',
        'actors',
        'society',
        'underworld',
        'commands',
        'pendingDeaths',
        'rescues',
        'unlocks',
        'wards',
        'domainSerial',
        'occupied',
        'occupancy',
      ].includes(k),
    ) &&
    v.version === 1 &&
    Number.isInteger(v.seed) &&
    typeof v.elapsed === 'number' &&
    Number.isFinite(v.elapsed) &&
    v.elapsed >= 0 &&
    validFieldEconomySave(v.economy) &&
    validCivicSave(v.civic) &&
    validPropertySave(v.property) &&
    validActorLedgerSave(v.actors, validPersistentNpc) &&
    validSocietySave(v.society) &&
    validSystemsExtension(v)
  );
}

function validSystemsExtension(v: Record<string, unknown>): boolean {
  if (
    v.occupancy !== undefined &&
    (!Array.isArray(v.occupancy) ||
      v.occupancy.length > 128 ||
      !v.occupancy.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          id(p[0]) &&
          object(p[1]) &&
          Object.keys(p[1]).every((k) => ['spaceId', 'building'].includes(k)) &&
          id(p[1].spaceId) &&
          (p[1].building === null || id(p[1].building)),
      ) ||
      new Set(v.occupancy.map((p) => p[0])).size !== v.occupancy.length)
  )
    return false;
  if (
    v.occupied !== undefined &&
    (!Array.isArray(v.occupied) ||
      v.occupied.length > 128 ||
      !v.occupied.every((p) => Array.isArray(p) && p.length === 2 && id(p[0]) && id(p[1])) ||
      new Set(v.occupied.map((p) => (p as string[])[0])).size !== v.occupied.length ||
      new Set(v.occupied.map((p) => (p as string[])[1])).size !== v.occupied.length)
  )
    return false;
  if (
    v.underworld !== undefined &&
    (!validUnderworldSave(v.underworld) || v.underworld.seed !== v.seed)
  )
    return false;
  const pairs = (a: unknown, max: number) =>
    Array.isArray(a) &&
    a.length <= max &&
    a.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        id(p[0]) &&
        typeof p[1] === 'number' &&
        Number.isFinite(p[1]) &&
        p[1] >= 0,
    ) &&
    new Set(a.map((p) => p[0])).size === a.length;
  if (
    v.commands !== undefined &&
    (!pairs(v.commands, 128) ||
      !(v.commands as [string, number][]).every((p) => Number.isSafeInteger(p[1])))
  )
    return false;
  if (v.wards !== undefined && !pairs(v.wards, 128)) return false;
  if (
    v.domainSerial !== undefined &&
    (!Number.isSafeInteger(v.domainSerial) || Number(v.domainSerial) < 0)
  )
    return false;
  if (
    v.unlocks !== undefined &&
    (!Array.isArray(v.unlocks) ||
      v.unlocks.length > 48 ||
      new Set(v.unlocks).size !== v.unlocks.length ||
      !v.unlocks.every(id))
  )
    return false;
  if (
    v.rescues !== undefined &&
    (!Array.isArray(v.rescues) ||
      v.rescues.length > 48 ||
      !v.rescues.every(
        (r) =>
          object(r) &&
          Object.keys(r).every((k) =>
            ['actorId', 'survivorId', 'profession', 'settlementId', 'depth', 'delivered'].includes(
              k,
            ),
          ) &&
          id(r.actorId) &&
          id(r.survivorId) &&
          id(r.settlementId) &&
          ['mason', 'herbalist', 'engineer'].includes(String(r.profession)) &&
          Number.isInteger(r.depth) &&
          Number(r.depth) >= 0 &&
          Number(r.depth) < 3 &&
          typeof r.delivered === 'boolean',
      ) ||
      new Set(v.rescues.map((r) => (r as SystemsRescue).survivorId)).size !== v.rescues.length)
  )
    return false;
  if (
    v.pendingDeaths !== undefined &&
    (!Array.isArray(v.pendingDeaths) ||
      v.pendingDeaths.length > 288 ||
      !v.pendingDeaths.every(
        (d) =>
          object(d) &&
          Object.keys(d).every((k) =>
            [
              'actorId',
              'kind',
              'role',
              'difficulty',
              'contributors',
              'time',
              'spaceId',
              'x',
              'y',
              'biome',
              'night',
              'protected',
              'factionId',
            ].includes(k),
          ) &&
          id(d.actorId) &&
          id(d.spaceId) &&
          d.kind === 'enemy' &&
          typeof d.x === 'number' &&
          Number.isFinite(d.x) &&
          Math.abs(d.x) < 1e7 &&
          typeof d.y === 'number' &&
          Number.isFinite(d.y) &&
          Math.abs(d.y) < 1e7 &&
          typeof d.time === 'number' &&
          Number.isFinite(d.time) &&
          d.time >= 0 &&
          typeof d.difficulty === 'number' &&
          Number.isFinite(d.difficulty) &&
          d.difficulty >= 0 &&
          d.difficulty <= 100 &&
          Array.isArray(d.contributors) &&
          d.contributors.length <= 32 &&
          d.contributors.every(id),
      ) ||
      new Set(v.pendingDeaths.map((d) => (d as FieldDeath).actorId)).size !==
        v.pendingDeaths.length)
  )
    return false;
  return true;
}
