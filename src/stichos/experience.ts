import type { AudioDirector } from '../audio.ts';
import type { WorldSoundEvent } from '../atmosphere.ts';
import { SpatialVoice } from './voice.ts';
import {
  underworldLocationAt,
  worldLocationAt,
  type WorldLocationSignal,
} from './world-signals.ts';
import { WORLD_ACOUSTICS, worldOcclusion } from './world-acoustics.ts';
import { npcPersonality, npcSchedule } from './npc-society.ts';
import type { UnderworldFrame } from './underworld.ts';
import type { Point } from './types.ts';
import type { Stichos } from './session.ts';
import type { MultiplayerConnection } from './multiplayer.ts';

export type WorldAudioSource = Pick<
  Stichos,
  | 'world'
  | 'player'
  | 'removed'
  | 'spaceId'
  | 'underworldFrame'
  | 'livingSystemsFrame'
  | 'usesLivingSystems'
  | 'npcs'
  | 'residentActivities'
  | 'fauna'
  | 'worldTime'
  | 'progression'
  | 'productionStructures'
>;
type AudioSink = Pick<AudioDirector, 'setEnvironment' | 'playWorldEvent'>;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pan = (source: Point, listener: Point) =>
  Math.max(-1, Math.min(1, (source.x - listener.x) / 10));

/** A semantic sample never generates a surface chunk while in another coordinate space.
 * Station counters are ephemeral observation, not simulation or saved audio state.
 */
export function sampleWorldAudio(
  current: WorldAudioSource,
  productionCounters = new Map<string, number>(),
): { location: WorldLocationSignal; events: WorldSoundEvent[] } {
  const surface = current.spaceId === 'surface';
  const frame = current.livingSystemsFrame;
  const authoritative = frame?.location.spaceId === current.spaceId ? frame : null;
  const underground = surface ? null : current.underworldFrame;
  const location = surface
    ? worldLocationAt(current.world, current.player, current.removed)
    : underworldLocationAt(
        underground?.plan.spaceId === current.spaceId ? underground.plan : undefined,
        current.player,
      );
  const events: WorldSoundEvent[] = [];
  const context = (location.audioContext ??= { population: 0 });
  const time = current.worldTime;

  if (authoritative) {
    const actorId = authoritative.economy.satchel.actorId;
    const wanted = authoritative.guards.some(
      (guard) =>
        guard.targetId === actorId && (guard.state === 'pursue' || guard.state === 'arrest'),
    );
    context.reputation = wanted
      ? 'wanted'
      : authoritative.reputation?.attitude === 'afraid'
        ? 'feared'
        : authoritative.reputation?.attitude === 'welcoming' &&
            authoritative.reputation.knownActions > 0
          ? 'trusted'
          : 'unknown';
    const localFactionIds = new Set(authoritative.factions.map((faction) => faction.id));
    context.factionId = authoritative.memberships
      .filter((member) => member.actorId === actorId && member.status === 'member')
      .sort(
        (a, b) =>
          Number(localFactionIds.has(b.factionId)) - Number(localFactionIds.has(a.factionId)) ||
          b.rank - a.rank ||
          b.standing - a.standing ||
          a.factionId.localeCompare(b.factionId),
      )[0]?.factionId;
    // A legacy home record or neighboring house is not proof of current ownership.
    context.home =
      surface &&
      authoritative.property.estates.some((estate) => {
        if (!('tenure' in estate) || estate.ownerId !== actorId || estate.offer.kind !== 'home')
          return false;
        if (estate.tenure === 'rented' && (estate.leaseUntil ?? 0) <= authoritative.elapsed)
          return false;
        return (
          location.buildingId === estate.offer.id ||
          (authoritative.home?.spaceId === current.spaceId &&
            distance(authoritative.home, estate.offer.entrance) < 0.1 &&
            distance(current.player, authoritative.home) < 2.2)
        );
      });
    let active = 0;
    const observed = new Map<string, number>();
    for (const estate of authoritative.property.estates) {
      for (const station of estate.stations) {
        if (
          !('workingSeconds' in station) ||
          station.spaceId !== current.spaceId ||
          distance(station, current.player) > 12 ||
          observed.size >= 64
        )
          continue;
        observed.set(station.id, station.workingSeconds);
        const worker = authoritative.property.workers.find(
          (person) => person.id === station.workerId,
        );
        if (
          station.job &&
          station.job.wageFunded &&
          worker?.phase === 'working' &&
          worker.address?.spaceId === current.spaceId &&
          distance(worker.address, station) <= 2.2 &&
          station.workingSeconds > (productionCounters.get(station.id) ?? station.workingSeconds)
        )
          active++;
      }
    }
    productionCounters.clear();
    for (const [id, seconds] of observed) productionCounters.set(id, seconds);
    context.production = active;
  } else {
    productionCounters.clear();
    // Old non-coordinator saves retain their existing working machines and home semantics.
    context.home =
      surface &&
      !current.usesLivingSystems &&
      current.progression.homes.some((home) => distance(home, current.player) < 2.2);
    context.production =
      surface && !current.usesLivingSystems
        ? current.productionStructures.filter(
            (machine) => machine.phase === 'working' && distance(machine, current.player) < 12,
          ).length
        : 0;
  }

  if (!surface) return { location, events };
  const people = (authoritative?.actors ?? (current.usesLivingSystems ? [] : current.npcs)).filter(
    (npc) => npc.hp > 0 && !npc.hostile && distance(npc, current.player) <= 12,
  );
  // Coordinator actor bodies are authoritative. Until that frame exposes its own
  // activity, a session routine is only accepted for the same present actor at its
  // destination and in its current seeded schedule; stale travelling crowds stay quiet.
  const present = people.flatMap((npc) => {
    const routine = current.residentActivities.get(npc.id);
    if (
      !routine ||
      distance(npc, routine.target) > 2.2 ||
      routine.activity !== npcSchedule(npc, npcPersonality(npc), time)
    )
      return [];
    return [{ npc, activity: routine.activity }];
  });
  const gathering = location.settlement
    ? present.filter(({ activity }) => ['socialize', 'worship', 'work'].includes(activity))
    : [];
  context.population = gathering.length;
  if (gathering.length) {
    let x = 0,
      y = 0;
    for (const { npc } of gathering) {
      x += npc.x;
      y += npc.y;
    }
    const center = { x: x / gathering.length, y: y / gathering.length };
    context.crowdDistance = distance(center, current.player);
    context.crowdPan = pan(center, current.player);
  }
  for (const animal of current.fauna) {
    if (!animal.call || distance(animal, current.player) > 18) continue;
    events.push({
      kind: animal.kind === 'bird' ? 'bird' : animal.dangerous ? 'predator' : 'grazer',
      id: animal.id,
      species: animal.kind,
      state: animal.activity,
      distance: distance(animal, current.player),
      pan: pan(animal, current.player),
    });
  }
  for (const { npc, activity } of present) {
    if (activity !== 'work' && activity !== 'socialize') continue;
    if (activity === 'socialize' && (!location.settlement || gathering.length < 3)) continue;
    events.push({
      kind: activity === 'work' ? 'work' : 'social',
      id: npc.id,
      distance: distance(npc, current.player),
      pan: pan(npc, current.player),
    });
  }
  // Authoritative machine cycles, guard warnings, construction, wounds and deaths
  // enter through GameEvent.foley / app combat hooks. Never duplicate or persist them here.
  return { location, events };
}

/** Two-hertz control-rate work, reset immediately at a life/floor transition. */
export function createWorldAudioSampler(game: () => WorldAudioSource, audio: AudioSink) {
  let nextSample = 0,
    lastGame: WorldAudioSource | undefined,
    lastSpace: string | undefined;
  let location: WorldLocationSignal | undefined,
    disposed = false;
  const productionCounters = new Map<string, number>();
  return {
    update(now = performance.now()) {
      if (disposed) return;
      const current = game();
      if (current !== lastGame || current.spaceId !== lastSpace) {
        nextSample = 0;
        productionCounters.clear();
        lastGame = current;
        lastSpace = current.spaceId;
      }
      if (now < nextSample) return;
      nextSample = now + 500;
      const sample = sampleWorldAudio(current, productionCounters);
      location = sample.location;
      audio.setEnvironment(location, current.worldTime);
      for (const event of sample.events) audio.playWorldEvent(event);
    },
    get location() {
      return location;
    },
    invalidate() {
      nextSample = 0;
      location = undefined;
      productionCounters.clear();
    },
    dispose() {
      disposed = true;
      location = undefined;
      productionCounters.clear();
    },
  };
}

/** Same bounded ray rules as surface voice, using only cached authoritative floor geometry. */
export function underworldOcclusion(frame: UnderworldFrame | null, from: Point, to: Point): number {
  if (
    !frame ||
    ![from.x, from.y, to.x, to.y].every(Number.isFinite) ||
    distance(from, to) > WORLD_ACOUSTICS.maxDistance
  )
    return 0;
  const { plan, state } = frame;
  const steps = Math.max(1, Math.ceil(distance(from, to) / WORLD_ACOUSTICS.sampleStep));
  const seen = new Set<number>();
  let obstruction = 0,
    insideWall = false;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
    const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
    if (x < 0 || y < 0 || x >= plan.width || y >= plan.height) {
      insideWall = false;
      continue;
    }
    const index = y * plan.width + x;
    if (seen.has(index)) continue;
    seen.add(index);
    const wall = plan.cells[index] === 0;
    if (wall && !insideWall) obstruction += WORLD_ACOUSTICS.wall;
    insideWall = wall;
    if (
      !wall &&
      plan.features.some(
        (feature) =>
          ['gate', 'shortcut', 'secret'].includes(feature.kind) &&
          Math.round(feature.x) === x &&
          Math.round(feature.y) === y &&
          !state.opened.includes(feature.id),
      )
    )
      obstruction += WORLD_ACOUSTICS.closedDoor;
    if (obstruction >= WORLD_ACOUSTICS.maximumOcclusion) return WORLD_ACOUSTICS.maximumOcclusion;
  }
  return obstruction;
}

/** One bounded bridge between simulation, game sound and the independent voice context. */
export function createWorldExperience(
  game: () => Stichos,
  multiplayer: MultiplayerConnection,
  audio: AudioDirector,
) {
  const acousticCache = new Map<string, { at: number; value: number }>();
  const sampler = createWorldAudioSampler(game, audio);
  let acousticSpace: string | undefined;
  let acousticGame: Stichos | undefined;
  const voice = new SpatialVoice(multiplayer, {
    listener: () => ({ x: game().player.x, y: game().player.y, heading: game().player.heading }),
    occlusion: (from, to) => {
      const current = game(),
        now = performance.now();
      if (current !== acousticGame || current.spaceId !== acousticSpace) {
        acousticCache.clear();
        acousticSpace = current.spaceId;
        acousticGame = current;
      }
      const dungeon = current.spaceId === 'surface' ? null : current.underworldFrame;
      const key = `${Math.round(from.x * 2)},${Math.round(from.y * 2)}:${Math.round(to.x * 2)},${Math.round(to.y * 2)}:${dungeon?.state.opened.length ?? current.removed.size}`;
      const cached = acousticCache.get(key);
      if (cached && now - cached.at < 200) return cached.value;
      const value =
        current.spaceId === 'surface'
          ? worldOcclusion(current.world, from, to, current.removed)
          : underworldOcclusion(dungeon, from, to);
      if (acousticCache.size >= 32) acousticCache.delete(acousticCache.keys().next().value!);
      acousticCache.set(key, { at: now, value });
      return value;
    },
    onActivity: (active) => audio.setVoiceActivity(active),
  });
  return {
    voice,
    update: sampler.update,
    get location() {
      return sampler.location;
    },
    suspend() {
      voice.suspend();
      sampler.invalidate();
      acousticCache.clear();
    },
    dispose() {
      sampler.dispose();
      voice.dispose();
      acousticCache.clear();
    },
  };
}
