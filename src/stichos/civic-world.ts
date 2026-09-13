import { deriveSeed } from '../procedural/random.ts';
import type { CivilizationProfile } from './civilization.ts';
import type { Npc, Point, Prop, Settlement, Tile } from './types.ts';
import { worldTimeAt } from './world-time.ts';
import type { FieldBundle } from './field-loot.ts';

/** Authority-owned social state. Coordinates are world tiles, time is shared world seconds. */
export const CIVIC_LIMITS = {
  towns: 128,
  members: 1024,
  events: 2048,
  knowledge: 8192,
  guards: 512,
  witnesses: 24,
  reportRange: 6,
  reportHops: 2,
} as const;
export type GuildPurpose = 'craft' | 'trade' | 'hunt' | 'care' | 'watch';
export type ReputationTrait =
  | 'helpful'
  | 'merciful'
  | 'trustworthy'
  | 'generous'
  | 'cruel'
  | 'violent'
  | 'thief'
  | 'trespasser'
  | 'protector'
  | 'hunter'
  | 'entrepreneur'
  | 'loyal'
  | 'oathbreaker';
export type CivicActionKind =
  | 'aid'
  | 'mercy'
  | 'gift'
  | 'trade'
  | 'build'
  | 'rescue'
  | 'protect'
  | 'hunt'
  | 'protected-hunt'
  | 'protected-harvest'
  | 'assault'
  | 'theft'
  | 'trespass'
  | 'burglary'
  | 'murder'
  | 'betrayal'
  | 'service';
export interface CivicAddress extends Point {
  spaceId: string;
}
export interface CivicActor extends CivicAddress {
  id: string;
  role?: Npc['role'];
  seed?: number;
  alive?: boolean;
}
export interface Heraldry {
  shape: 'shield' | 'roundel' | 'pennant';
  symbol: 'hammer' | 'scales' | 'antler' | 'leaf' | 'eye';
  pattern: 'bar' | 'chevron' | 'split';
  color: string;
  ink: string;
  label: string;
}
export interface CivicFaction {
  id: string;
  settlementId: string;
  clan: number;
  purpose: GuildPurpose;
  name: string;
  heraldry: Heraldry;
  rivalId?: string;
  entryCost: FieldBundle;
  dues: number;
  ranks: readonly string[];
  principles: string;
  benefits: readonly string[];
}
export interface CivicLaw {
  settlementId: string;
  enforcement: 'community' | 'watch' | 'strict';
  guards: number;
  fineMultiplier: number;
  protectsWildlife: boolean;
  privateHours: readonly [number, number];
  description: string;
}
export interface GuildMember {
  actorId: string;
  factionId: string;
  discovered: boolean;
  status: 'visitor' | 'member' | 'left' | 'expelled';
  rank: number;
  standing: number;
  completed: number;
  lastDutyDay: number;
  duesThroughDay: number;
  joinedAt: number;
  trust: number;
  reconciliationCount: number;
  remembered: string[];
}
export interface GuildDuty {
  id: string;
  day: number;
  title: string;
  description: string;
  cost: FieldBundle;
  action?: CivicActionKind;
  quantity: number;
  standing: number;
  benefit: string;
}
export interface CivicAction extends CivicAddress {
  actorId: string;
  kind: CivicActionKind;
  settlementId: string;
  at: number;
  victimId?: string;
  propertyId?: string;
  sourceId: string;
  factionId?: string;
}
export interface CivicEvent extends CivicAction {
  id: string;
  severity: number;
  resolution?: 'restitution';
}
export interface CivicKnowledge {
  eventId: string;
  observerId: string;
  provenance: 'seen' | 'victim' | 'heard' | 'reported';
  from?: string;
  confidence: number;
  identified: boolean;
  hops: number;
  at: number;
  settlementId: string;
}
export type Reputation = Partial<Record<ReputationTrait, number>>;
export interface CivicMemory {
  traits: Reputation;
  standing: number;
  attitude: 'welcoming' | 'reserved' | 'afraid' | 'hostile';
  knownActions: number;
  priceFactor: number;
  summary: string;
}
export interface GuardRecord {
  id: string;
  settlementId: string;
  state: 'patrol' | 'investigate' | 'warn' | 'fine' | 'pursue' | 'search' | 'arrest' | 'return';
  eventId?: string;
  targetId?: string;
  lastKnown?: CivicAddress;
  until: number;
  fine: number;
  warnings: number;
  settled: string[];
}
export interface GuardIntent {
  state: GuardRecord['state'];
  destination?: CivicAddress;
  targetId?: string;
  message?: string;
  fine?: number;
  attack: boolean;
  arrest: boolean;
}
export interface CivicSave {
  version: 1;
  seed: number;
  nextEvent: number;
  towns: Settlement[];
  contacts: { factionId: string; actorId: string }[];
  members: GuildMember[];
  events: CivicEvent[];
  knowledge: CivicKnowledge[];
  guards: GuardRecord[];
}
export interface CivicResult {
  ok: boolean;
  message: string;
  member?: GuildMember;
  event?: CivicEvent;
}
/** Root binds this synchronous atomic debit to the authenticated actor's FieldEconomy. */
export type CivicDebit = (cost: FieldBundle, receipt: string) => boolean;
export type CivicSight = (from: CivicAddress, to: CivicAddress) => boolean;
export interface DoorAccessInput {
  door: Prop;
  tile: Tile;
  settlement?: Settlement;
  actorId: string;
  hour: number;
  ownerId?: string;
  guests?: readonly string[];
  keys?: readonly string[];
  locked?: boolean;
  publicAccess?: boolean;
}
export interface DoorAccess {
  allowed: boolean;
  reason: 'owner' | 'guest' | 'key' | 'public' | 'closed' | 'private' | 'locked';
  ownerId?: string;
  opensAt?: number;
  label: string;
  offense?: 'trespass' | 'burglary';
}
const PURPOSES: readonly GuildPurpose[] = ['craft', 'trade', 'hunt', 'care', 'watch'];
const TRAITS: readonly ReputationTrait[] = [
  'helpful',
  'merciful',
  'trustworthy',
  'generous',
  'cruel',
  'violent',
  'thief',
  'trespasser',
  'protector',
  'hunter',
  'entrepreneur',
  'loyal',
  'oathbreaker',
];
const ACTIONS: readonly CivicActionKind[] = [
  'aid',
  'mercy',
  'gift',
  'trade',
  'build',
  'rescue',
  'protect',
  'hunt',
  'protected-hunt',
  'protected-harvest',
  'assault',
  'theft',
  'trespass',
  'burglary',
  'murder',
  'betrayal',
  'service',
];
const SYMBOLS = {
  craft: 'hammer',
  trade: 'scales',
  hunt: 'antler',
  care: 'leaf',
  watch: 'eye',
} as const;
const NAMES = {
  craft: 'Hearthwright Assembly',
  trade: 'Open Measure',
  hunt: 'Trailward Fellowship',
  care: 'Living Root Circle',
  watch: 'Lantern Covenant',
} as const;
const PRINCIPLES = {
  craft: 'Useful work earns a voice. Keep tools safe and repay what you borrow.',
  trade: 'Honest measures, safe roads, and obligations kept.',
  hunt: 'Take what feeds the settlement. Waste and needless suffering dishonor the trail.',
  care: 'Shelter the living, protect breeding grounds, and share healing knowledge.',
  watch: 'A charge requires a witness. Protect residents before pursuing glory.',
} as const;
const RANKS = ['Listener', 'Contributor', 'Keeper', 'Steward', 'First Voice'] as const;
const SEVERITY: Partial<Record<CivicActionKind, number>> = {
  trespass: 1,
  theft: 2,
  'protected-hunt': 2,
  'protected-harvest': 1,
  assault: 3,
  burglary: 3,
  betrayal: 3,
  murder: 5,
};
const DELTAS: Record<CivicActionKind, Reputation> = {
  aid: { helpful: 2, trustworthy: 1 },
  mercy: { merciful: 3 },
  gift: { generous: 2 },
  trade: { trustworthy: 1, entrepreneur: 1 },
  build: { entrepreneur: 2, helpful: 1 },
  rescue: { helpful: 4, protector: 3 },
  protect: { protector: 3 },
  hunt: { hunter: 1 },
  'protected-hunt': { hunter: 1, cruel: 2 },
  'protected-harvest': { hunter: 1, trespasser: 1 },
  assault: { violent: 3, cruel: 1 },
  theft: { thief: 3, trustworthy: -2 },
  trespass: { trespasser: 2 },
  burglary: { thief: 4, trespasser: 3 },
  murder: { violent: 6, cruel: 5 },
  betrayal: { oathbreaker: 5, loyal: -3 },
  service: { loyal: 2, helpful: 1 },
};
const emptyCost = (): FieldBundle => ({ coins: 0, items: {} });
const clone = <T>(v: T): T => structuredClone(v);
const distance = (a: CivicAddress, b: CivicAddress) =>
  a.spaceId === b.spaceId ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
const safeId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 180 && !/[\u0000-\u001f]/.test(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  finite(v) && Number.isSafeInteger(v) && v >= min && v <= max;
const address = (v: unknown): v is CivicAddress =>
  !!v &&
  typeof v === 'object' &&
  safeId((v as CivicAddress).spaceId) &&
  finite((v as Point).x) &&
  finite((v as Point).y) &&
  Math.abs((v as Point).x) <= 1e7 &&
  Math.abs((v as Point).y) <= 1e7;
const result = (ok: boolean, message: string, member?: GuildMember): CivicResult => ({
  ok,
  message,
  ...(member ? { member: clone(member) } : {}),
});
const memberKey = (actor: string, faction: string) => JSON.stringify([actor, faction]);
const knowledgeKey = (observer: string, event: string) => JSON.stringify([observer, event]);

export class CivicWorld {
  readonly seed: number;
  private readonly civilization?: CivilizationProfile;
  private towns = new Map<string, Settlement>();
  private factions = new Map<string, CivicFaction>();
  private contacts = new Map<string, Set<string>>();
  private members = new Map<string, GuildMember>();
  private events = new Map<string, CivicEvent>();
  private sources = new Set<string>();
  private knowledge = new Map<string, CivicKnowledge>();
  private byObserver = new Map<string, CivicKnowledge[]>();
  private guards = new Map<string, GuardRecord>();
  private nextEvent = 1;
  constructor(seed: number, civilization?: CivilizationProfile, save?: unknown) {
    this.seed = seed >>> 0;
    this.civilization = civilization ? clone(civilization) : undefined;
    if (save !== undefined) {
      if (!validCivicSave(save) || save.seed !== this.seed)
        throw new TypeError('Invalid civic world save');
      this.nextEvent = save.nextEvent;
      for (const town of save.towns) this.factionsFor(town);
      for (const contact of save.contacts) {
        if (!this.setGuildContact(contact.factionId, contact.actorId))
          throw new TypeError('Unknown saved guild contact');
      }
      for (const member of save.members) {
        if (!this.factions.has(member.factionId)) throw new TypeError('Unknown saved faction');
        this.members.set(memberKey(member.actorId, member.factionId), clone(member));
      }
      for (const event of save.events) {
        this.events.set(event.id, clone(event));
        this.sources.add(event.sourceId);
      }
      for (const known of save.knowledge) this.putKnowledge(clone(known));
      for (const guard of save.guards) this.guards.set(guard.id, clone(guard));
    }
  }
  get diagnostics() {
    return {
      towns: this.towns.size,
      members: this.members.size,
      events: this.events.size,
      knowledge: this.knowledge.size,
      guards: this.guards.size,
      saturated:
        this.events.size >= CIVIC_LIMITS.events || this.knowledge.size >= CIVIC_LIMITS.knowledge,
    };
  }
  factionsFor(settlement: Settlement): CivicFaction[] {
    if (!this.towns.has(settlement.id)) {
      if (this.towns.size >= CIVIC_LIMITS.towns) return [];
      if (!validTown(settlement)) return [];
      this.towns.set(settlement.id, clone(settlement));
      const axes = this.civilization?.axes;
      const local: GuildPurpose[] = [
        'watch',
        settlement.kind === 'foundry' || (axes?.industry ?? 0.5) > 0.55 ? 'craft' : 'trade',
        (axes?.organics ?? 0.7) > 0.52 ? 'care' : 'hunt',
      ];
      const ids = local.map((p) => `guild:${this.seed.toString(16)}:${settlement.id}:${p}`);
      local.forEach((purpose, i) => {
        const seed = deriveSeed(settlement.seed, 'heraldry-v1', purpose),
          color =
            this.civilization?.factions.find((c) => c.id === settlement.clan)?.color ??
            ['#87b9a5', '#dfb77c', '#b6a5d2'][i];
        const other =
          purpose === 'watch'
            ? undefined
            : ids[local.findIndex((p) => p !== purpose && p !== 'watch')];
        const guild: CivicFaction = {
          id: ids[i],
          settlementId: settlement.id,
          clan: settlement.clan,
          purpose,
          name: `${settlement.name} ${NAMES[purpose]}`,
          heraldry: {
            shape: ['shield', 'roundel', 'pennant'][seed % 3] as Heraldry['shape'],
            symbol: SYMBOLS[purpose],
            pattern: ['bar', 'chevron', 'split'][(seed >>> 3) % 3] as Heraldry['pattern'],
            color,
            ink: '#141f2c',
            label: NAMES[purpose],
          },
          rivalId: other,
          entryCost: { coins: purpose === 'trade' ? 12 : 8, items: {} },
          dues: purpose === 'trade' ? 4 : 2,
          ranks: RANKS,
          principles: PRINCIPLES[purpose],
          benefits: [
            'Local introductions',
            purpose === 'craft' ? 'Extended guild workshop hours' : 'Recognized charter standing',
            '10% construction service fee relief',
            'Senior charter recognition; construction relief retained',
            'Highest charter recognition; construction relief retained',
          ],
        };
        this.factions.set(guild.id, guild);
      });
    }
    return [...this.factions.values()].filter((g) => g.settlementId === settlement.id).map(clone);
  }
  faction(id: string) {
    const f = this.factions.get(id);
    return f ? clone(f) : undefined;
  }
  setGuildContact(factionId: string, actorId: string): boolean {
    if (!this.factions.has(factionId) || !safeId(actorId)) return false;
    const contacts = this.contacts.get(factionId) ?? new Set<string>();
    if (contacts.size >= 4 && !contacts.has(actorId)) return false;
    contacts.add(actorId);
    this.contacts.set(factionId, contacts);
    return true;
  }
  factionReputation(factionId: string, actorId: string): CivicMemory {
    const unique = new Map<string, CivicKnowledge>();
    for (const observer of this.contacts.get(factionId) ?? [])
      for (const k of this.byObserver.get(observer) ?? [])
        if (
          k.identified &&
          this.events.get(k.eventId)?.actorId === actorId &&
          (!unique.has(k.eventId) || unique.get(k.eventId)!.confidence < k.confidence)
        )
          unique.set(k.eventId, k);
    return this.interpret(
      [...unique.values()],
      deriveSeed(this.seed, 'guild-values', factionId),
      this.factions.get(factionId)?.purpose,
    );
  }
  lawsFor(settlement: Settlement): CivicLaw {
    const axes = this.civilization?.axes;
    const scarce = axes?.scarcity ?? 0.5,
      order = axes?.collectivism ?? 0.6;
    const enforcement =
      settlement.rank === 'hamlet' && scarce > 0.45
        ? 'community'
        : order > 0.73
          ? 'strict'
          : 'watch';
    return {
      settlementId: settlement.id,
      enforcement,
      guards: enforcement === 'community' ? 1 : enforcement === 'strict' ? 4 : 2,
      fineMultiplier: enforcement === 'strict' ? 1.5 : 1,
      protectsWildlife: (axes?.organics ?? 0.7) > 0.55,
      privateHours: [7, 19],
      description: `${enforcement === 'community' ? 'Residents keep a shared watch' : enforcement === 'strict' ? 'The civic watch enforces registered ownership' : 'The town watch answers witnessed complaints'}. Private homes require permission.${(axes?.organics ?? 0.7) > 0.55 ? ' Breeding grounds are protected.' : ''}`,
    };
  }
  membership(actorId: string, factionId: string) {
    const m = this.members.get(memberKey(actorId, factionId));
    return m ? clone(m) : undefined;
  }
  memberships(actorId: string) {
    return [...this.members.values()].filter((m) => m.actorId === actorId).map(clone);
  }
  discover(actorId: string, factionId: string): CivicResult {
    if (!safeId(actorId) || !this.factions.has(factionId))
      return result(false, 'This guild is not known here.');
    const key = memberKey(actorId, factionId),
      existing = this.members.get(key);
    if (existing) return result(true, 'Guild already known.', existing);
    if (this.members.size >= CIVIC_LIMITS.members)
      return result(false, 'The civic register is full.');
    const member: GuildMember = {
      actorId,
      factionId,
      discovered: true,
      status: 'visitor',
      rank: 0,
      standing: 0,
      completed: 0,
      lastDutyDay: 0,
      duesThroughDay: 0,
      joinedAt: 0,
      trust: 0,
      reconciliationCount: 0,
      remembered: [],
    };
    this.members.set(key, member);
    return result(true, 'The guild has introduced its charter.', member);
  }
  join(actorId: string, factionId: string, at: number, debit: CivicDebit): CivicResult {
    const f = this.factions.get(factionId),
      m = this.members.get(memberKey(actorId, factionId));
    if (!f || !m || !finite(at) || at < 0)
      return result(false, 'Meet the guild before requesting membership.');
    if (m.status === 'member') return result(false, 'You already belong to this guild.', m);
    if (m.status === 'expelled')
      return result(false, 'Reconcile with the guild before returning.', m);
    const reputation = this.factionReputation(factionId, actorId);
    if (
      reputation.standing < -8 ||
      ((reputation.traits.oathbreaker ?? 0) > 3 && m.reconciliationCount === 0)
    )
      return result(
        false,
        'Witnessed harm has closed this charter to you. Make amends locally first.',
        m,
      );
    const rival = f.rivalId && this.members.get(memberKey(actorId, f.rivalId));
    if (rival && rival.status === 'member' && rival.rank >= 2)
      return result(false, 'Your senior oath to the rival guild conflicts with this charter.', m);
    const receipt = `civic:join:${actorId}:${factionId}:${m.reconciliationCount}:${m.joinedAt}`;
    if (!debit(clone(f.entryCost), receipt))
      return result(false, 'The entry contribution is not available.', m);
    m.status = 'member';
    m.joinedAt = at;
    m.duesThroughDay = worldTimeAt(at).day + 2;
    return result(true, `You are a ${RANKS[m.rank]} of ${f.name}.`, m);
  }
  leave(actorId: string, factionId: string, at: number, betray = false): CivicResult {
    const m = this.members.get(memberKey(actorId, factionId));
    if (!m || m.status !== 'member' || !finite(at) || at < 0)
      return result(false, 'No active oath to leave.');
    m.status = betray ? 'expelled' : 'left';
    m.standing = Math.max(-20, m.standing - (betray ? 12 : 2));
    m.trust -= betray ? 6 : 1;
    m.reconciliationCount++;
    return result(
      true,
      betray
        ? 'Your broken oath is recorded. The guild has expelled you.'
        : 'You surrendered your badge and benefits.',
      m,
    );
  }
  payDues(actorId: string, factionId: string, at: number, debit: CivicDebit): CivicResult {
    const f = this.factions.get(factionId),
      m = this.members.get(memberKey(actorId, factionId));
    if (!f || !m || m.status !== 'member' || !finite(at) || at < 0)
      return result(false, 'Only a member pays this obligation.');
    const day = worldTimeAt(at).day;
    if (m.duesThroughDay >= day + 2) return result(false, 'Your dues are already current.', m);
    if (!debit({ coins: f.dues, items: {} }, `civic:dues:${actorId}:${factionId}:${day}`))
      return result(false, 'Not enough field coin for dues.', m);
    m.duesThroughDay = day + 2;
    return result(true, 'Your guild obligations are current for three days.', m);
  }
  duty(actorId: string, factionId: string, at: number): GuildDuty | undefined {
    const f = this.factions.get(factionId),
      m = this.members.get(memberKey(actorId, factionId));
    if (!f || !m || m.status !== 'member' || !finite(at) || at < 0) return undefined;
    const day = worldTimeAt(at).day,
      variation = deriveSeed(this.seed, 'guild-duty-v1', factionId, day) % 3;
    const delivery: Record<GuildPurpose, FieldBundle> = {
      craft: { coins: 0, items: { wood: 3, stone: 2 } },
      trade: { coins: 0, items: { ration: 2 } },
      hunt: { coins: 0, items: { hide: 2 } },
      care: { coins: 0, items: { bandage: 2 } },
      watch: { coins: 0, items: { planks: 2 } },
    };
    const action: Record<GuildPurpose, CivicActionKind> = {
      craft: 'build',
      trade: 'trade',
      hunt: 'hunt',
      care: 'rescue',
      watch: 'protect',
    };
    const isAction = variation === 2;
    return {
      id: `duty:${f.id}:${day}`,
      day,
      title: isAction
        ? {
            craft: 'Make shelter useful',
            trade: 'Keep a fair measure',
            hunt: 'Provision without waste',
            care: 'Bring someone home',
            watch: 'Stand between harm and home',
          }[f.purpose]
        : 'Supply the common stores',
      description: isAction
        ? `Perform a witnessed ${action[f.purpose]} near ${this.towns.get(f.settlementId)?.name}. The guild accepts acts from today after you joined.`
        : 'Deliver the listed field supplies. They are consumed by the guild, not merely shown.',
      cost: isAction ? emptyCost() : delivery[f.purpose],
      action: isAction ? action[f.purpose] : undefined,
      quantity: 1,
      standing: isAction ? 7 : 5,
      benefit: f.benefits[Math.min(m.rank + 1, 4)],
    };
  }
  completeDuty(actorId: string, factionId: string, at: number, debit: CivicDebit): CivicResult {
    const f = this.factions.get(factionId),
      m = this.members.get(memberKey(actorId, factionId)),
      d = this.duty(actorId, factionId, at);
    if (!f || !m || !d) return result(false, 'No active guild duty.');
    if (m.lastDutyDay >= d.day) return result(false, 'Today’s duty is already recorded.', m);
    if (m.duesThroughDay < d.day)
      return result(false, 'Settle your guild dues before requesting benefits.', m);
    if (d.action) {
      let count = 0;
      for (const e of this.events.values())
        if (
          e.actorId === actorId &&
          e.settlementId === f.settlementId &&
          e.kind === d.action &&
          e.at >= m.joinedAt &&
          worldTimeAt(e.at).day === d.day &&
          [...this.knowledge.values()].some(
            (k) =>
              k.eventId === e.id &&
              k.identified &&
              k.confidence >= 0.6 &&
              this.contacts.get(factionId)?.has(k.observerId),
          )
        )
          count++;
      if (count < d.quantity)
        return result(false, 'No qualifying witnessed service has reached this guild.', m);
    }
    if (!debit(clone(d.cost), `civic:${d.id}:${actorId}`))
      return result(
        false,
        'The required field supplies are missing or this delivery was already processed.',
        m,
      );
    m.lastDutyDay = d.day;
    m.completed++;
    m.standing += d.standing;
    m.trust++;
    const candidate =
      m.standing >= 72 && m.completed >= 12
        ? 4
        : m.standing >= 36 && m.completed >= 6
          ? 3
          : m.standing >= 18 && m.completed >= 3
            ? 2
            : m.standing >= 5
              ? 1
              : 0;
    const rival = f.rivalId && this.members.get(memberKey(actorId, f.rivalId));
    m.rank =
      rival && rival.status === 'member' && rival.rank >= 2 ? Math.min(1, candidate) : candidate;
    return result(true, `Service recorded. ${RANKS[m.rank]}: ${f.benefits[m.rank]}.`, m);
  }
  reconcile(actorId: string, factionId: string, at: number, debit: CivicDebit): CivicResult {
    const f = this.factions.get(factionId),
      m = this.members.get(memberKey(actorId, factionId));
    if (!f || !m || m.status !== 'expelled' || !finite(at) || at < 0)
      return result(false, 'There is no expulsion to reconcile.');
    const rep = this.factionReputation(factionId, actorId);
    if ((rep.traits.helpful ?? 0) + (rep.traits.protector ?? 0) < 6)
      return result(false, 'Two credible acts of help or protection must precede restitution.', m);
    if (
      !debit(
        { coins: 20 + 10 * m.reconciliationCount, items: { ration: 2 } },
        `civic:reconcile:${actorId}:${factionId}:${m.reconciliationCount}`,
      )
    )
      return result(false, 'Restitution requires field coin and provisions.', m);
    m.status = 'left';
    m.rank = 0;
    m.standing = 0;
    m.trust = 0;
    m.reconciliationCount++;
    return result(
      true,
      'Restitution was accepted. Your history remains, but a new oath is possible.',
      m,
    );
  }
  recordAction(
    action: CivicAction,
    witnesses: readonly CivicActor[],
    sight: CivicSight,
  ): CivicResult {
    if (!validAction(action) || !this.towns.has(action.settlementId))
      return result(false, 'The civic action has no valid local authority.');
    if (this.sources.has(action.sourceId))
      return result(false, 'This action has already been remembered.');
    if (this.events.size >= CIVIC_LIMITS.events)
      return result(false, 'The consequence ledger is full; this action cannot be admitted.');
    const event: CivicEvent = {
      spaceId: action.spaceId,
      x: action.x,
      y: action.y,
      actorId: action.actorId,
      kind: action.kind,
      settlementId: action.settlementId,
      at: action.at,
      sourceId: action.sourceId,
      ...(action.victimId ? { victimId: action.victimId } : {}),
      ...(action.propertyId ? { propertyId: action.propertyId } : {}),
      ...(action.factionId ? { factionId: action.factionId } : {}),
      id: `civic:${this.seed.toString(16)}:${this.nextEvent}`,
      severity: SEVERITY[action.kind] ?? 0,
    };
    const local = [
      ...new Map(
        witnesses
          .filter((w) => safeId(w.id) && address(w) && w.alive !== false && w.id !== action.actorId)
          .slice(0, 96)
          .map((w) => [w.id, w]),
      ).values(),
    ]
      .sort((a, b) => distance(a, event) - distance(b, event) || a.id.localeCompare(b.id))
      .slice(0, CIVIC_LIMITS.witnesses);
    const knowledge: CivicKnowledge[] = [];
    for (const observer of local) {
      const dist = distance(observer, event),
        victim = dist <= 12 && observer.id === action.victimId;
      const seen = dist <= 12 && sight(observer, event),
        heard = event.severity >= 2 && dist <= 8;
      if (!seen && !heard && !victim) continue;
      knowledge.push({
        eventId: event.id,
        observerId: observer.id,
        provenance: victim ? 'victim' : seen ? 'seen' : 'heard',
        confidence: victim || seen ? 1 : 0.35,
        identified: victim || seen,
        hops: 0,
        at: event.at,
        settlementId: event.settlementId,
      });
    }
    if (this.knowledge.size + knowledge.length > CIVIC_LIMITS.knowledge)
      return result(false, 'The witness register is full; no consequence was partially recorded.');
    this.nextEvent++;
    this.events.set(event.id, event);
    this.sources.add(action.sourceId);
    for (const k of knowledge) this.putKnowledge(k);
    this.applyGuildConsequences(event, knowledge);
    return {
      ok: true,
      message: knowledge.length
        ? `${knowledge.filter((k) => k.identified).length} local witness${knowledge.filter((k) => k.identified).length === 1 ? '' : 'es'} can identify this action.`
        : 'No one nearby witnessed the action.',
      event: clone(event),
    };
  }
  private applyGuildConsequences(event: CivicEvent, knowledge: readonly CivicKnowledge[]) {
    if (event.severity === 0) return;
    for (const m of this.members.values())
      if (
        m.actorId === event.actorId &&
        m.status === 'member' &&
        !m.remembered.includes(event.id) &&
        knowledge.some(
          (k) =>
            k.identified &&
            k.confidence >= 0.6 &&
            this.contacts.get(m.factionId)?.has(k.observerId),
        )
      ) {
        m.remembered.push(event.id);
        if (event.kind === 'betrayal' || event.kind === 'murder') {
          m.status = 'expelled';
          m.standing -= 12;
          m.trust -= 6;
          m.reconciliationCount++;
        } else {
          m.standing -= event.severity;
          m.trust -= event.severity;
          if (m.standing < -12) {
            m.status = 'expelled';
            m.reconciliationCount++;
          }
        }
      }
  }
  private putKnowledge(known: CivicKnowledge) {
    const key = knowledgeKey(known.observerId, known.eventId),
      old = this.knowledge.get(key);
    this.knowledge.set(key, known);
    if (old) {
      const list = this.byObserver.get(known.observerId)!;
      list[list.indexOf(old)] = known;
    } else {
      const list = this.byObserver.get(known.observerId) ?? [];
      list.push(known);
      this.byObserver.set(known.observerId, list);
    }
  }
  /** Allocation-free selection for a bounded, actual nearby conversation. */
  latestReportFor(observerId: string, receiverId?: string): string | undefined {
    let latest: CivicKnowledge | undefined;
    for (const known of this.byObserver.get(observerId) ?? []) {
      if (!known.identified || known.hops >= CIVIC_LIMITS.reportHops) continue;
      const existing = receiverId
        ? this.knowledge.get(knowledgeKey(receiverId, known.eventId))
        : undefined;
      if (existing && existing.confidence >= known.confidence * 0.8) continue;
      if (
        !latest ||
        known.at > latest.at ||
        (known.at === latest.at && known.eventId > latest.eventId)
      )
        latest = known;
    }
    return latest?.eventId;
  }
  knownActions(observerId: string) {
    return (this.byObserver.get(observerId) ?? []).map((k) => ({
      knowledge: clone(k),
      event: clone(this.events.get(k.eventId)!),
    }));
  }
  report(
    sender: CivicActor,
    receiver: CivicActor,
    eventId: string,
    at: number,
    sight: CivicSight,
  ): CivicResult {
    const k = this.knowledge.get(knowledgeKey(sender.id, eventId)),
      event = this.events.get(eventId);
    if (
      !address(sender) ||
      !address(receiver) ||
      !safeId(receiver.id) ||
      sender.id === receiver.id ||
      sender.alive === false ||
      receiver.alive === false ||
      !finite(at) ||
      !k ||
      !event ||
      at < k.at ||
      distance(sender, receiver) > CIVIC_LIMITS.reportRange ||
      !sight(sender, receiver)
    )
      return result(false, 'No nearby credible conversation carried this report.');
    if (!k.identified || k.hops >= CIVIC_LIMITS.reportHops)
      return result(false, 'An unidentified noise or distant rumor cannot name an offender.');
    const existing = this.knowledge.get(knowledgeKey(receiver.id, eventId));
    if (existing && existing.confidence >= k.confidence * 0.8)
      return result(false, 'The listener already has at least this evidence.');
    if (!existing && this.knowledge.size >= CIVIC_LIMITS.knowledge)
      return result(false, 'The witness register is full.');
    const reported: CivicKnowledge = {
      eventId,
      observerId: receiver.id,
      provenance: 'reported',
      from: sender.id,
      confidence: k.confidence * 0.8,
      identified: true,
      hops: k.hops + 1,
      at: existing?.identified ? Math.min(existing.at, at) : at,
      settlementId: event.settlementId,
    };
    this.putKnowledge(reported);
    this.applyGuildConsequences(event, [reported]);
    return result(true, 'A nearby listener now knows who reported this action.');
  }
  reputation(observerId: string, actorId: string): CivicMemory {
    const knowledge = (this.byObserver.get(observerId) ?? []).filter(
      (k) => k.identified && this.events.get(k.eventId)?.actorId === actorId,
    );
    return this.interpret(knowledge, deriveSeed(this.seed, 'civic-temperament', observerId));
  }
  townReputation(settlementId: string, actorId: string): CivicMemory {
    const unique = new Map<string, CivicKnowledge>();
    for (const k of this.knowledge.values())
      if (
        k.identified &&
        k.settlementId === settlementId &&
        this.events.get(k.eventId)?.actorId === actorId &&
        (!unique.has(k.eventId) || unique.get(k.eventId)!.confidence < k.confidence)
      )
        unique.set(k.eventId, k);
    return this.interpret(
      [...unique.values()],
      deriveSeed(this.seed, 'civic-values', settlementId),
    );
  }
  private interpret(known: CivicKnowledge[], seed: number, purpose?: GuildPurpose): CivicMemory {
    const traits: Reputation = {};
    for (const k of known) {
      const event = this.events.get(k.eventId)!;
      for (const trait of TRAITS) {
        const delta = DELTAS[event.kind][trait];
        if (delta)
          traits[trait] = Math.max(
            -100,
            Math.min(100, (traits[trait] ?? 0) + delta * k.confidence),
          );
      }
    }
    const fearful = 0.75 + (seed % 100) / 100,
      communal = 0.7 + ((seed >>> 8) % 100) / 100;
    const positive =
      (traits.helpful ?? 0) +
      (traits.merciful ?? 0) +
      (traits.generous ?? 0) +
      (traits.protector ?? 0) +
      (traits.trustworthy ?? 0) +
      (traits.loyal ?? 0);
    const harm =
      (traits.cruel ?? 0) +
      (traits.violent ?? 0) +
      (traits.thief ?? 0) +
      (traits.trespasser ?? 0) +
      (traits.oathbreaker ?? 0);
    const localValues =
      (traits.hunter ?? 0) *
        (purpose === 'care'
          ? -1
          : purpose === 'hunt'
            ? 1.5
            : (this.civilization?.axes.organics ?? 0.7) > 0.75
              ? -0.3
              : 0.5) +
      (traits.entrepreneur ?? 0) * (this.civilization?.axes.industry ?? 0.5) +
      (purpose === 'watch' ? (traits.protector ?? 0) : 0);
    const standing = Math.round(positive * communal - harm * fearful + localValues);
    const attitude =
      standing >= 5
        ? 'welcoming'
        : standing < -15
          ? 'hostile'
          : harm > positive + 3
            ? 'afraid'
            : 'reserved';
    return {
      traits,
      standing,
      attitude,
      knownActions: known.length,
      priceFactor: Math.max(0.85, Math.min(1.4, 1 - standing * 0.008)),
      summary: known.length
        ? attitude === 'welcoming'
          ? 'Your help has reached this person.'
          : attitude === 'afraid'
            ? 'Remembered harm makes this person cautious.'
            : attitude === 'hostile'
              ? 'This person distrusts your remembered conduct.'
              : 'This person remembers mixed conduct.'
        : 'No credible local history yet.',
    };
  }
  updateGuard(
    guard: CivicActor & { settlementId: string; home: CivicAddress },
    suspects: readonly CivicActor[],
    at: number,
    sight: CivicSight,
  ): GuardIntent {
    if (
      !safeId(guard.id) ||
      !address(guard) ||
      !address(guard.home) ||
      !finite(at) ||
      at < 0 ||
      !this.towns.has(guard.settlementId)
    )
      return { state: 'patrol', attack: false, arrest: false };
    let g = this.guards.get(guard.id);
    if (!g) {
      if (this.guards.size >= CIVIC_LIMITS.guards)
        return { state: 'patrol', attack: false, arrest: false };
      g = {
        id: guard.id,
        settlementId: guard.settlementId,
        state: 'patrol',
        until: 0,
        fine: 0,
        warnings: 0,
        settled: [],
      };
      this.guards.set(guard.id, g);
    }
    const known = (this.byObserver.get(guard.id) ?? [])
      .filter(
        (k) =>
          !g!.settled.includes(k.eventId) &&
          this.events.get(k.eventId)!.severity > 0 &&
          !this.events.get(k.eventId)!.resolution &&
          k.at <= at,
      )
      .sort(
        (a, b) =>
          this.events.get(b.eventId)!.severity - this.events.get(a.eventId)!.severity ||
          b.at - a.at,
      );
    const k = known[0],
      e = k && this.events.get(k.eventId);
    if (!e) {
      g.state = distance(guard, guard.home) > 2 ? 'return' : 'patrol';
      return { state: g.state, destination: clone(guard.home), attack: false, arrest: false };
    }
    if (
      g.state === 'return' &&
      g.eventId === e.id &&
      at < g.until &&
      !suspects
        .slice(0, 128)
        .some(
          (s) =>
            s.id === e.actorId &&
            s.alive !== false &&
            address(s) &&
            distance(guard, s) <= 14 &&
            sight(guard, s),
        )
    )
      return { state: 'return', destination: clone(guard.home), attack: false, arrest: false };
    if (g.eventId !== e.id) {
      g.eventId = e.id;
      g.targetId = k.identified ? e.actorId : undefined;
      g.lastKnown = { spaceId: e.spaceId, x: e.x, y: e.y };
      g.until = at + 18;
      g.state = 'investigate';
      const law = this.lawsFor(this.towns.get(e.settlementId)!);
      g.fine = Math.ceil(e.severity * 6 * law.fineMultiplier);
    }
    const target =
      k.identified && k.confidence >= 0.6
        ? suspects
            .slice(0, 128)
            .find(
              (s) =>
                s.id === e.actorId &&
                s.alive !== false &&
                address(s) &&
                distance(guard, s) <= 14 &&
                sight(guard, s),
            )
        : undefined;
    if (!target) {
      if (at >= g.until) {
        if (g.state !== 'search') {
          g.state = 'search';
          g.until = at + 20;
        } else {
          g.state = 'return';
          g.until = at + 60;
        }
      }
      return {
        state: g.state,
        destination: g.state === 'return' ? clone(guard.home) : clone(g.lastKnown),
        targetId: g.targetId,
        message: k.identified
          ? 'The watch searches the last witnessed location.'
          : 'The watch investigates a sound; no suspect has been identified.',
        attack: false,
        arrest: false,
      };
    }
    g.targetId = target.id;
    g.lastKnown = { spaceId: target.spaceId, x: target.x, y: target.y };
    g.until = at + 18;
    const dist = distance(guard, target);
    if (e.severity <= 2) {
      if (g.state === 'investigate' || g.state === 'search' || g.state === 'return') {
        g.state = 'warn';
        g.warnings++;
        g.until = at + 8;
      } else if (g.state === 'warn' && dist <= 3) {
        g.state = 'fine';
      }
      return {
        state: g.state,
        destination: dist > 2 ? clone(g.lastKnown) : undefined,
        targetId: target.id,
        message:
          g.state === 'warn'
            ? 'Stop. A local witness has made a complaint.'
            : 'Make restitution or leave under watch. Your conduct will remain in the record.',
        fine: g.fine,
        attack: false,
        arrest: false,
      };
    }
    g.state = dist <= 1.25 ? 'arrest' : 'pursue';
    return {
      state: g.state,
      destination: clone(g.lastKnown),
      targetId: target.id,
      message:
        g.state === 'arrest'
          ? 'The watch demands your surrender.'
          : 'The watch is following a named, witnessed charge.',
      fine: g.fine,
      attack: false,
      arrest: g.state === 'arrest',
    };
  }
  settleFine(guardId: string, actorId: string, debit: CivicDebit): CivicResult {
    const g = this.guards.get(guardId);
    if (!g || g.targetId !== actorId || !g.eventId || !['fine', 'warn', 'arrest'].includes(g.state))
      return result(false, 'There is no identified charge to settle here.');
    if (!debit({ coins: g.fine, items: {} }, `civic:fine:${g.eventId}:${actorId}`))
      return result(false, 'The field purse cannot cover restitution.');
    this.events.get(g.eventId)!.resolution = 'restitution';
    for (const guard of this.guards.values())
      if (guard.eventId === g.eventId) {
        if (!guard.settled.includes(g.eventId)) guard.settled.push(g.eventId);
        guard.state = 'return';
        guard.fine = 0;
      }
    return result(
      true,
      'Restitution was paid. The charge is settled, but witnesses retain their memory.',
    );
  }
  guard(id: string) {
    const g = this.guards.get(id);
    return g ? clone(g) : undefined;
  }
  doorAccess(input: DoorAccessInput): DoorAccess {
    return doorAccess(input);
  }
  save(): CivicSave {
    return {
      version: 1,
      seed: this.seed,
      nextEvent: this.nextEvent,
      towns: [...this.towns.values()].map(clone),
      contacts: [...this.contacts].flatMap(([factionId, actors]) =>
        [...actors].map((actorId) => ({ factionId, actorId })),
      ),
      members: [...this.members.values()].map(clone),
      events: [...this.events.values()].map(clone),
      knowledge: [...this.knowledge.values()].map(clone),
      guards: [...this.guards.values()].map(clone),
    };
  }
}

export function doorAccess(input: DoorAccessInput): DoorAccess {
  const { door, tile, actorId, ownerId } = input;
  const base = { ownerId };
  if (
    door.kind !== 'door' ||
    !door.building ||
    door.building !== tile.building ||
    !safeId(actorId) ||
    !finite(input.hour) ||
    input.hour < 0 ||
    input.hour >= 24
  )
    return { ...base, allowed: false, reason: 'locked', label: 'No usable entrance.' };
  if (ownerId === actorId)
    return { ...base, allowed: true, reason: 'owner', label: 'Your property' };
  if (input.guests?.includes(actorId))
    return { ...base, allowed: true, reason: 'guest', label: 'Invited guest' };
  if (input.keys?.includes(door.id) || input.keys?.includes(door.building))
    return { ...base, allowed: true, reason: 'key', label: 'Your key fits' };
  if (input.locked)
    return {
      ...base,
      allowed: false,
      reason: 'locked',
      label: 'Locked · permission or a key required',
      offense: 'burglary',
    };
  const kind = tile.buildingKind ?? 'house';
  const publicAccess =
    input.publicAccess ??
    (['inn', 'church', 'workshop', 'greenhouse', 'hall'].includes(kind) && !ownerId);
  if (!publicAccess)
    return {
      ...base,
      allowed: false,
      reason: 'private',
      label: 'Private · ask the resident for entry',
      offense: 'trespass',
    };
  const hours: Record<string, readonly [number, number]> = {
    inn: [0, 24],
    church: [5, 22],
    workshop: [6, 19],
    greenhouse: [7, 18],
    hall: [7, 20],
    house: [7, 19],
    storehouse: [7, 18],
  };
  const [open, close] = hours[kind];
  if (input.hour < open || input.hour >= close)
    return {
      ...base,
      allowed: false,
      reason: 'closed',
      opensAt: open,
      label: `Closed · opens at ${String(open).padStart(2, '0')}:00`,
      offense: 'trespass',
    };
  return {
    ...base,
    allowed: true,
    reason: 'public',
    label: kind === 'inn' ? 'Open · lodging and meals' : 'Open · public services',
  };
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
function validTown(v: unknown): v is Settlement {
  if (!object(v)) return false;
  return (
    safeId(v.id) &&
    safeId(v.name) &&
    finite(v.x) &&
    finite(v.y) &&
    Math.abs(v.x) <= 1e7 &&
    Math.abs(v.y) <= 1e7 &&
    integer(v.seed, 0, 0xffffffff) &&
    integer(v.clan, 0, 255) &&
    ['cathedral', 'village', 'foundry'].includes(v.kind as string) &&
    finite(v.radius) &&
    v.radius > 0 &&
    v.radius <= 200 &&
    (v.rank === undefined || ['city', 'village', 'hamlet'].includes(v.rank as string))
  );
}
function validAction(v: unknown): v is CivicAction {
  return (
    object(v) &&
    address(v) &&
    safeId(v.actorId) &&
    safeId(v.settlementId) &&
    safeId(v.sourceId) &&
    ACTIONS.includes(v.kind as CivicActionKind) &&
    finite(v.at) &&
    v.at >= 0 &&
    (v.victimId === undefined || safeId(v.victimId)) &&
    (v.propertyId === undefined || safeId(v.propertyId)) &&
    (v.factionId === undefined || safeId(v.factionId))
  );
}
/** Strict bounded snapshot validation; never accepts audio, arbitrary object graphs, or dangling evidence. */
export function validCivicSave(v: unknown): v is CivicSave {
  if (
    !object(v) ||
    !only(v, [
      'version',
      'seed',
      'nextEvent',
      'towns',
      'contacts',
      'members',
      'events',
      'knowledge',
      'guards',
    ]) ||
    v.version !== 1 ||
    !integer(v.seed, 0, 0xffffffff) ||
    !integer(v.nextEvent, 1) ||
    !Array.isArray(v.towns) ||
    v.towns.length > CIVIC_LIMITS.towns ||
    !Array.isArray(v.contacts) ||
    v.contacts.length > CIVIC_LIMITS.towns * 12 ||
    !Array.isArray(v.members) ||
    v.members.length > CIVIC_LIMITS.members ||
    !Array.isArray(v.events) ||
    v.events.length > CIVIC_LIMITS.events ||
    !Array.isArray(v.knowledge) ||
    v.knowledge.length > CIVIC_LIMITS.knowledge ||
    !Array.isArray(v.guards) ||
    v.guards.length > CIVIC_LIMITS.guards
  )
    return false;
  const towns = new Set<string>();
  for (const t of v.towns) {
    if (
      !validTown(t) ||
      towns.has(t.id) ||
      !only(t as unknown as Record<string, unknown>, [
        'id',
        'seed',
        'name',
        'x',
        'y',
        'clan',
        'kind',
        'rank',
        'architecture',
        'radius',
      ])
    )
      return false;
    towns.add(t.id);
    if (t.architecture !== undefined) {
      const a = t.architecture;
      if (
        !object(a) ||
        !only(a, [
          'seed',
          'style',
          'wallMaterial',
          'roof',
          'wallColor',
          'roofColor',
          'woodColor',
          'accentColor',
          'window',
          'raised',
          'technology',
          'industry',
          'organics',
          'illumination',
          'transparency',
          'verticality',
          'ornament',
          'motif',
          'eraName',
        ]) ||
        !integer(a.seed, 0, 0xffffffff) ||
        !['gothic', 'timber', 'adobe', 'stilt', 'basalt', 'alpine'].includes(a.style as string) ||
        !['stone', 'timber', 'adobe', 'basalt', 'metal', 'glass', 'composite'].includes(
          a.wallMaterial as string,
        ) ||
        !['steep', 'flat', 'terraced', 'gable'].includes(a.roof as string) ||
        !['arch', 'square', 'slit'].includes(a.window as string) ||
        typeof a.raised !== 'boolean' ||
        ['wallColor', 'roofColor', 'woodColor', 'accentColor'].some(
          (k) => typeof a[k] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a[k] as string),
        ) ||
        [
          'technology',
          'industry',
          'organics',
          'illumination',
          'transparency',
          'verticality',
          'ornament',
        ].some(
          (k) =>
            a[k] !== undefined && (!finite(a[k]) || (a[k] as number) < 0 || (a[k] as number) > 1),
        ) ||
        (a.motif !== undefined &&
          !['carved', 'riveted', 'latticed', 'circuit', 'grown'].includes(a.motif as string)) ||
        (a.eraName !== undefined && !safeId(a.eraName))
      )
        return false;
    }
  }
  const knownFactionIds = new Set(
    [...towns].flatMap((id) =>
      PURPOSES.map((purpose) => `guild:${(v.seed as number).toString(16)}:${id}:${purpose}`),
    ),
  );
  const contacts = new Set<string>(),
    contactCounts = new Map<string, number>();
  for (const c of v.contacts) {
    if (
      !object(c) ||
      !only(c, ['factionId', 'actorId']) ||
      !safeId(c.factionId) ||
      !knownFactionIds.has(c.factionId) ||
      !safeId(c.actorId)
    )
      return false;
    const key = memberKey(c.actorId, c.factionId);
    if (contacts.has(key)) return false;
    contacts.add(key);
    contactCounts.set(c.factionId, (contactCounts.get(c.factionId) ?? 0) + 1);
    if (contactCounts.get(c.factionId)! > 4) return false;
  }
  const members = new Set<string>();
  for (const m of v.members) {
    if (
      !object(m) ||
      !only(m, [
        'actorId',
        'factionId',
        'discovered',
        'status',
        'rank',
        'standing',
        'completed',
        'lastDutyDay',
        'duesThroughDay',
        'joinedAt',
        'trust',
        'reconciliationCount',
        'remembered',
      ]) ||
      !safeId(m.actorId) ||
      !safeId(m.factionId) ||
      !knownFactionIds.has(m.factionId) ||
      m.discovered !== true ||
      !['visitor', 'member', 'left', 'expelled'].includes(m.status as string) ||
      !integer(m.rank, 0, 4) ||
      !integer(m.standing, -100000, 100000) ||
      !integer(m.completed, 0, 100000) ||
      !integer(m.lastDutyDay, 0, 10000000) ||
      !integer(m.duesThroughDay, 0, 10000000) ||
      !finite(m.joinedAt) ||
      m.joinedAt < 0 ||
      !integer(m.trust, -100000, 100000) ||
      !integer(m.reconciliationCount, 0, 100000) ||
      !Array.isArray(m.remembered) ||
      m.remembered.length > CIVIC_LIMITS.events ||
      new Set(m.remembered).size !== m.remembered.length ||
      m.remembered.some((id) => !safeId(id))
    )
      return false;
    const key = memberKey(m.actorId, m.factionId);
    if (members.has(key)) return false;
    members.add(key);
  }
  const events = new Map<string, CivicEvent>(),
    sources = new Set<string>();
  for (const e of v.events) {
    if (
      !validAction(e) ||
      !object(e) ||
      !only(e, [
        'id',
        'spaceId',
        'x',
        'y',
        'actorId',
        'kind',
        'settlementId',
        'at',
        'victimId',
        'propertyId',
        'sourceId',
        'factionId',
        'severity',
        'resolution',
      ]) ||
      !safeId(e.id) ||
      (e.resolution !== undefined && e.resolution !== 'restitution') ||
      e.severity !== (SEVERITY[e.kind as CivicActionKind] ?? 0) ||
      !towns.has(e.settlementId) ||
      events.has(e.id) ||
      sources.has(e.sourceId)
    )
      return false;
    const prefix = `civic:${v.seed.toString(16)}:`;
    if (
      !e.id.startsWith(prefix) ||
      !integer(Number(e.id.slice(prefix.length)), 1, (v.nextEvent as number) - 1) ||
      String(Number(e.id.slice(prefix.length))) !== e.id.slice(prefix.length)
    )
      return false;
    events.set(e.id, e as unknown as CivicEvent);
    sources.add(e.sourceId);
  }
  for (const m of v.members)
    if (
      (m as GuildMember).remembered.some(
        (id) => !events.has(id) || events.get(id)!.actorId !== (m as GuildMember).actorId,
      )
    )
      return false;
  const knowledge = new Map<string, CivicKnowledge>();
  for (const k of v.knowledge) {
    if (
      !object(k) ||
      !only(k, [
        'eventId',
        'observerId',
        'provenance',
        'from',
        'confidence',
        'identified',
        'hops',
        'at',
        'settlementId',
      ]) ||
      !safeId(k.eventId) ||
      !events.has(k.eventId) ||
      !safeId(k.observerId) ||
      !['seen', 'victim', 'heard', 'reported'].includes(k.provenance as string) ||
      typeof k.identified !== 'boolean' ||
      !finite(k.confidence) ||
      k.confidence <= 0 ||
      k.confidence > 1 ||
      !integer(k.hops, 0, CIVIC_LIMITS.reportHops) ||
      !finite(k.at) ||
      k.at < events.get(k.eventId)!.at ||
      k.settlementId !== events.get(k.eventId)!.settlementId
    )
      return false;
    if (k.provenance === 'reported') {
      if (
        !safeId(k.from) ||
        k.from === k.observerId ||
        k.hops < 1 ||
        !k.identified ||
        Math.abs(k.confidence - Math.pow(0.8, k.hops)) > 1e-8
      )
        return false;
    } else if (
      k.from !== undefined ||
      k.hops !== 0 ||
      (k.provenance === 'heard'
        ? k.identified || k.confidence !== 0.35
        : !k.identified || k.confidence !== 1)
    )
      return false;
    const key = knowledgeKey(k.observerId, k.eventId);
    if (knowledge.has(key)) return false;
    knowledge.set(key, k as unknown as CivicKnowledge);
  }
  for (const k of knowledge.values())
    if (k.provenance === 'reported') {
      const parent = knowledge.get(knowledgeKey(k.from!, k.eventId));
      if (!parent || !parent.identified || parent.hops >= k.hops || parent.at > k.at) return false;
    }
  const guards = new Set<string>();
  for (const g of v.guards) {
    if (
      !object(g) ||
      !only(g, [
        'id',
        'settlementId',
        'state',
        'eventId',
        'targetId',
        'lastKnown',
        'until',
        'fine',
        'warnings',
        'settled',
      ]) ||
      !safeId(g.id) ||
      guards.has(g.id) ||
      !safeId(g.settlementId) ||
      !towns.has(g.settlementId) ||
      !['patrol', 'investigate', 'warn', 'fine', 'pursue', 'search', 'arrest', 'return'].includes(
        g.state as string,
      ) ||
      !finite(g.until) ||
      g.until < 0 ||
      !integer(g.fine, 0, 100000) ||
      !integer(g.warnings, 0, 100000) ||
      !Array.isArray(g.settled) ||
      g.settled.length > CIVIC_LIMITS.events ||
      new Set(g.settled).size !== g.settled.length ||
      g.settled.some((id) => typeof id !== 'string' || !events.has(id)) ||
      (g.eventId !== undefined && (typeof g.eventId !== 'string' || !events.has(g.eventId))) ||
      (g.targetId !== undefined && !safeId(g.targetId)) ||
      (g.lastKnown !== undefined && !address(g.lastKnown))
    )
      return false;
    guards.add(g.id);
    if (g.targetId !== undefined) {
      const k = g.eventId && knowledge.get(knowledgeKey(g.id, g.eventId as string));
      if (!k || !k.identified || events.get(k.eventId)!.actorId !== g.targetId) return false;
    }
  }
  return true;
}
