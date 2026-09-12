import type { AudioDirector } from '../audio.ts';
import { SpatialVoice } from './voice.ts';
import { worldLocationAt, type WorldLocationSignal } from './world-signals.ts';
import { worldOcclusion } from './world-acoustics.ts';
import type { Stichos } from './session.ts';
import type { MultiplayerConnection } from './multiplayer.ts';

/** One bounded bridge between simulation, game sound and the independent voice context. */
export function createWorldExperience(
  game: () => Stichos,
  multiplayer: MultiplayerConnection,
  audio: AudioDirector,
) {
  const acousticCache = new Map<string, { at: number; value: number }>();
  let nextSample = 0,
    lastGame: Stichos | undefined,
    location: WorldLocationSignal | undefined;
  const voice = new SpatialVoice(multiplayer, {
    listener: () => ({ x: game().player.x, y: game().player.y, heading: game().player.heading }),
    occlusion: (from, to) => {
      const current = game(),
        now = performance.now();
      const key = `${Math.round(from.x * 2)},${Math.round(from.y * 2)}:${Math.round(to.x * 2)},${Math.round(to.y * 2)}:${current.removed.size}`;
      const cached = acousticCache.get(key);
      if (cached && now - cached.at < 200) return cached.value;
      const value = worldOcclusion(current.world, from, to, current.removed);
      if (acousticCache.size >= 32) acousticCache.delete(acousticCache.keys().next().value!);
      acousticCache.set(key, { at: now, value });
      return value;
    },
    onActivity: (active) => audio.setVoiceActivity(active),
  });
  function update(now = performance.now()) {
    const current = game();
    if (current !== lastGame) {
      acousticCache.clear();
      nextSample = 0;
      lastGame = current;
    }
    if (now < nextSample) return;
    nextSample = now + 500;
    location = worldLocationAt(current.world, current.player, current.removed);
    audio.setEnvironment(location, current.worldTime);
    for (const animal of current.fauna) {
      if (!animal.call) continue;
      audio.playWorldEvent({
        kind: animal.kind === 'bird' ? 'bird' : animal.dangerous ? 'predator' : 'grazer',
        id: animal.id,
        distance: Math.hypot(animal.x - current.player.x, animal.y - current.player.y),
        pan: Math.max(-1, Math.min(1, (animal.x - current.player.x) / 10)),
      });
    }
    for (const [id, routine] of current.residentActivities) {
      const resident = current.npcs.find((n) => n.id === id);
      if (!resident) continue;
      // Actual scheduled work and social gatherings supply quiet, local activity sounds.
      const activity = String(routine.activity);
      if (!['work', 'socialize'].includes(activity)) continue;
      audio.playWorldEvent({
        kind: activity === 'work' ? 'work' : 'social',
        id,
        distance: Math.hypot(resident.x - current.player.x, resident.y - current.player.y),
        pan: Math.max(-1, Math.min(1, (resident.x - current.player.x) / 10)),
      });
    }
  }
  return {
    voice,
    update,
    get location() {
      return location;
    },
    suspend() {
      voice.suspend();
    },
    dispose() {
      voice.dispose();
      acousticCache.clear();
    },
  };
}
