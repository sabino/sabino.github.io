import { deriveSeed, random } from '../procedural/random.ts';
import type { Npc, Point, Prop, Tile } from './types.ts';
import type { WorldTimeSignal } from './world-time.ts';

export const NPC_MEMORY_LIMIT = 256;
export type NpcActivity = 'work' | 'rest' | 'socialize' | 'worship' | 'patrol' | 'shelter';
export interface NpcPersonality {
  temperament: 'measured' | 'warm' | 'guarded' | 'restless';
  sociability: number;
  courage: number;
  generosity: number;
  diligence: number;
  likes: string;
  dislikes: string;
  goal: string;
  communication: 'brief' | 'reflective' | 'candid' | 'formal';
  earlyHours: number;
}
export type NpcMemoryEvent = 'gift' | 'aid' | 'threat' | 'warning' | 'gossip';
export interface NpcMemory {
  id: string;
  trust: number;
  talks: number;
  lastGiftDay: number;
  lastEvent?: NpcMemoryEvent;
  lastEventAt: number;
  alarmUntil: number;
  heardFrom?: string;
}
export interface SocietySave {
  version: 1;
  memories: NpcMemory[];
}
export interface SocietyWorld {
  tile(x: number, y: number): Tile;
  propsAround(x: number, y: number, radius: number): Prop[];
}
export interface NpcRoutine {
  activity: NpcActivity;
  target: Point;
  reason: string;
  partnerId?: string;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Stable personality is derived, not rolled every visit and not copied into world chunks. */
export function npcPersonality(npc: Pick<Npc, 'seed' | 'role' | 'clan'>): NpcPersonality {
  const rng = random(deriveSeed(npc.seed, `mind:1:${npc.role}:${npc.clan}`));
  const sociability = rng(),
    courage = clamp(rng() + (npc.role === 'guard' ? 0.3 : 0), 0, 1),
    generosity = rng(),
    diligence = rng();
  const temperament =
    courage < 0.3
      ? 'guarded'
      : sociability > 0.65
        ? 'warm'
        : diligence > 0.55
          ? 'measured'
          : 'restless';
  const interests = {
    botanist: ['living gardens', 'careless harvesting', 'keep the local clinic supplied'],
    merchant: ['fair bargains', 'broken promises', 'build a dependable trading circle'],
    archivist: ['old testimony', 'careless rumors', 'preserve records before they disappear'],
    engineer: ['well-kept tools', 'wasted material', 'finish a safer workshop'],
    guard: ['quiet roads', 'drawn weapons', 'bring every traveler home'],
    refugee: ['shared meals', 'empty assurances', 'secure a permanent home'],
    raider: ['unwatched roads', 'armed patrols', 'control the next crossing'],
    pilgrim: ['quiet gatherings', 'public cruelty', 'find a place worth belonging to'],
  } as const;
  const [roleLikes, roleDislikes, roleGoal] = interests[npc.role];
  const personalLikes = [
    'quiet dawn walks',
    'music shared over a meal',
    'precise stories',
    'small handmade gifts',
    'animals left in peace',
    'friendly competition',
  ];
  const personalDislikes = [
    'being hurried',
    'loud boasting',
    'wasteful habits',
    'unasked favors',
    'late arrivals',
    'needless risk',
  ];
  const personalGoals = [
    'save enough for a private room',
    'earn a neighbor’s confidence',
    'teach an apprentice',
    'repay an old kindness',
    'support a relative',
    'leave a useful legacy',
  ];
  const likes = `${roleLikes} and ${personalLikes[Math.floor(rng() * personalLikes.length)]}`;
  const dislikes = `${roleDislikes} and ${personalDislikes[Math.floor(rng() * personalDislikes.length)]}`;
  const goal = `${roleGoal}, and ${personalGoals[Math.floor(rng() * personalGoals.length)]}`;
  return {
    temperament,
    sociability,
    courage,
    generosity,
    diligence,
    likes,
    dislikes,
    goal,
    communication:
      temperament === 'guarded'
        ? 'brief'
        : temperament === 'warm'
          ? 'candid'
          : temperament === 'measured'
            ? 'formal'
            : 'reflective',
    earlyHours: Math.floor(rng() * 3) - 1,
  };
}
export function npcSchedule(
  npc: Pick<Npc, 'role'>,
  personality: NpcPersonality,
  time: WorldTimeSignal,
  alarm = false,
): NpcActivity {
  if (alarm) return npc.role === 'guard' ? 'patrol' : 'shelter';
  const hour = (time.hour + personality.earlyHours + 24) % 24;
  if (npc.role === 'guard') return hour >= 2 && hour < 6 ? 'rest' : 'patrol';
  if (hour < 6 || hour >= 22) return 'rest';
  if (hour < 7.5 && (npc.role === 'pilgrim' || npc.role === 'archivist')) return 'worship';
  if (hour >= 18 && hour < 21 && personality.sociability > 0.35) return 'socialize';
  return 'work';
}
export function validSocietySave(value: unknown): value is SocietySave {
  if (!value || typeof value !== 'object') return false;
  const v = value as SocietySave;
  return (
    v.version === 1 &&
    Array.isArray(v.memories) &&
    v.memories.length <= NPC_MEMORY_LIMIT &&
    v.memories.every(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        m.id.length <= 160 &&
        Number.isFinite(m.trust) &&
        m.trust >= -20 &&
        m.trust <= 20 &&
        Number.isInteger(m.talks) &&
        m.talks >= 0 &&
        m.talks <= 10000 &&
        Number.isInteger(m.lastGiftDay) &&
        m.lastGiftDay >= -1 &&
        Number.isFinite(m.lastEventAt) &&
        m.lastEventAt >= 0 &&
        Number.isFinite(m.alarmUntil) &&
        m.alarmUntil >= 0 &&
        (m.lastEvent === undefined ||
          ['gift', 'aid', 'threat', 'warning', 'gossip'].includes(m.lastEvent)) &&
        (m.heardFrom === undefined ||
          (typeof m.heardFrom === 'string' && m.heardFrom.length <= 160)),
    ) &&
    new Set(v.memories.map((m) => m.id)).size === v.memories.length
  );
}
export class NpcSociety {
  private memories = new Map<string, NpcMemory>();
  private places = new Map<string, Prop[]>();
  private personalities = new Map<string, NpcPersonality>();
  private gossipTimes = new Map<string, number>();
  constructor(save?: unknown) {
    if (save !== undefined) {
      if (!validSocietySave(save)) throw new Error('Invalid resident memories.');
      for (const m of save.memories) this.memories.set(m.id, { ...m });
    }
  }
  personality(npc: Npc) {
    let p = this.personalities.get(npc.id);
    if (!p) {
      p = npcPersonality(npc);
      this.personalities.set(npc.id, p);
      if (this.personalities.size > 256)
        this.personalities.delete(this.personalities.keys().next().value!);
    }
    return p;
  }
  memory(id: string): Readonly<NpcMemory> {
    return (
      this.memories.get(id) ?? {
        id,
        trust: 0,
        talks: 0,
        lastGiftDay: -1,
        lastEventAt: 0,
        alarmUntil: 0,
      }
    );
  }
  private write(m: NpcMemory) {
    this.memories.delete(m.id);
    this.memories.set(m.id, m);
    while (this.memories.size > NPC_MEMORY_LIMIT)
      this.memories.delete(this.memories.keys().next().value!);
    return m;
  }
  remember(npc: Npc, event: NpcMemoryEvent, time: WorldTimeSignal, sourceId?: string) {
    const m = { ...this.memory(npc.id) },
      p = this.personality(npc);
    m.lastEvent = event;
    m.lastEventAt = time.elapsedSeconds;
    if (event === 'gift') {
      m.trust = clamp(m.trust + 2 + Math.round(p.generosity * 2), -20, 20);
      m.lastGiftDay = time.day;
    }
    if (event === 'aid') m.trust = clamp(m.trust + 3, -20, 20);
    if (event === 'threat') {
      m.trust = clamp(m.trust - 8, -20, 20);
      m.alarmUntil = time.elapsedSeconds + 120;
    }
    if (event === 'warning' || event === 'gossip')
      m.alarmUntil = Math.max(m.alarmUntil, time.elapsedSeconds + 45);
    if (sourceId) m.heardFrom = sourceId;
    return this.write(m);
  }
  converse(npc: Npc) {
    const m = { ...this.memory(npc.id) };
    m.talks = Math.min(10000, m.talks + 1);
    this.write(m);
  }
  routine(
    npc: Npc,
    time: WorldTimeSignal,
    world: SocietyWorld,
    neighbors: readonly Npc[],
  ): NpcRoutine {
    const p = this.personality(npc),
      m = this.memory(npc.id),
      activity = npcSchedule(npc, p, time, m.alarmUntil > time.elapsedSeconds);
    let places = this.places.get(npc.id);
    if (!places) {
      places = world
        .propsAround(npc.home.x, npc.home.y, 12)
        .filter((a) => a.kind === 'door' || a.kind === 'bench' || a.kind === 'shrine');
      this.places.set(npc.id, places);
      while (this.places.size > 128) this.places.delete(this.places.keys().next().value!);
    }
    const wanted =
      activity === 'rest' || activity === 'shelter'
        ? ['house', 'inn']
        : activity === 'worship'
          ? ['church']
          : activity === 'socialize'
            ? ['inn', 'hall']
            : [];
    const place = places
      .filter((a) => wanted.includes(world.tile(a.x, a.y).buildingKind ?? ''))
      .sort((a, b) => distance(a, npc.home) - distance(b, npc.home))[0];
    let target: Point = place
      ? { x: place.x, y: place.y + (place.kind === 'door' ? 0.9 : 0) }
      : { ...npc.home };
    let partnerId: string | undefined;
    if (activity === 'socialize' && !place) {
      const partner = neighbors
        .filter(
          (n) =>
            n.id !== npc.id &&
            !n.hostile &&
            n.hp > 0 &&
            n.clan === npc.clan &&
            distance(n.home, npc.home) < 7,
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (partner) {
        target = { x: (npc.home.x + partner.home.x) / 2, y: (npc.home.y + partner.home.y) / 2 };
        partnerId = partner.id;
      }
    }
    if (activity === 'patrol') {
      const phase = Math.floor(time.elapsedSeconds / 12) + (npc.seed % 4);
      target = {
        x: npc.home.x + Math.cos((phase * Math.PI) / 2) * 2,
        y: npc.home.y + Math.sin((phase * Math.PI) / 2) * 2,
      };
    }
    const reason =
      activity === 'shelter'
        ? `Keeping clear after ${m.heardFrom ? 'a neighbor’s warning' : 'a nearby threat'}.`
        : activity === 'rest'
          ? 'Resting before the next shift.'
          : activity === 'socialize'
            ? `Making time for company and ${p.likes}.`
            : activity === 'worship'
              ? 'Joining the morning observance.'
              : activity === 'patrol'
                ? 'Watching the approaches and exchanging warnings.'
                : `Working to ${p.goal}.`;
    return { activity, target, reason, ...(partnerId ? { partnerId } : {}) };
  }
  /** Neighbor speech transfers a concrete warning and changes the listener's next routine. */
  communicate(
    npcs: readonly Npc[],
    time: WorldTimeSignal,
  ): { speakerId: string; listenerId: string; text: string }[] {
    const events: { speakerId: string; listenerId: string; text: string }[] = [];
    for (const speaker of npcs.slice(0, 64)) {
      const memory = this.memory(speaker.id);
      if (
        memory.alarmUntil <= time.elapsedSeconds ||
        speaker.hostile ||
        speaker.hp <= 0 ||
        time.elapsedSeconds - (this.gossipTimes.get(speaker.id) ?? -100) < 15
      )
        continue;
      const listener = npcs.find(
        (n) =>
          n.id !== speaker.id &&
          !n.hostile &&
          n.hp > 0 &&
          n.clan === speaker.clan &&
          distance(n, speaker) < 3 &&
          this.memory(n.id).alarmUntil <= time.elapsedSeconds,
      );
      if (!listener) continue;
      this.remember(listener, 'gossip', time, speaker.id);
      const inherited = { ...this.memory(listener.id), alarmUntil: memory.alarmUntil };
      this.write(inherited);
      this.gossipTimes.set(speaker.id, time.elapsedSeconds);
      events.push({
        speakerId: speaker.id,
        listenerId: listener.id,
        text:
          listener.role === 'guard'
            ? 'Trouble nearby. Watch the road.'
            : 'There is trouble. Stay near shelter.',
      });
      if (events.length >= 2) break;
    }
    while (this.gossipTimes.size > 128)
      this.gossipTimes.delete(this.gossipTimes.keys().next().value!);
    return events;
  }
  describe(npc: Npc, time: WorldTimeSignal, roleName: string = npc.role): string {
    const p = this.personality(npc),
      m = this.memory(npc.id),
      activity = npcSchedule(npc, p, time, m.alarmUntil > time.elapsedSeconds);
    const opening =
      p.communication === 'brief'
        ? 'Keep it brief.'
        : p.communication === 'formal'
          ? 'Let us speak plainly.'
          : p.communication === 'candid'
            ? 'It is good to have company.'
            : 'A person needs something to work toward.';
    const memory =
      m.trust >= 2
        ? ' I remember your help.'
        : m.trust < 0
          ? ' I have not forgotten the violence.'
          : m.talks > 1
            ? ' We have spoken before.'
            : '';
    return `${opening} I am a ${roleName}; I value ${p.likes}, and have little patience for ${p.dislikes}. I want to ${p.goal}. My current duty is ${activity}.${memory}`;
  }
  save(): SocietySave {
    return { version: 1, memories: [...this.memories.values()].map((m) => ({ ...m })) };
  }
}
