import { VOICE_RANGES, type VoiceMode } from './voice-protocol.ts';
export interface VoicePoint {
  x: number;
  y: number;
  heading?: number;
}
export const VOICE_ACOUSTICS = Object.freeze({
  rearGain: 0.62,
  rearCutoff: 2400,
  clearCutoff: 7600,
  wallGain: 0.3,
  wallCutoff: 850,
  smoothingSeconds: 0.07,
});
/** World-space, orientation-relative acoustics. The server separately enforces audibility. */
export function voiceAcoustics(
  listener: VoicePoint,
  source: VoicePoint,
  mode: VoiceMode,
  occlusion = 0,
  ranges = VOICE_RANGES,
) {
  const dx = source.x - listener.x,
    dy = source.y - listener.y,
    distance = Math.hypot(dx, dy),
    reach = ranges[mode];
  const angle = Math.atan2(dy, dx) - (listener.heading ?? Math.PI / 2),
    rear = (1 - Math.cos(angle)) * 0.5;
  const blocked = Math.max(0, Math.min(1, occlusion));
  const falloff = Math.max(0, 1 - (distance / reach) ** 2);
  return {
    distance,
    gain:
      falloff *
      falloff *
      (1 - rear * (1 - VOICE_ACOUSTICS.rearGain)) *
      (1 - blocked * (1 - VOICE_ACOUSTICS.wallGain)),
    pan: Math.sin(angle),
    cutoff: Math.max(
      VOICE_ACOUSTICS.wallCutoff,
      VOICE_ACOUSTICS.clearCutoff -
        rear * (VOICE_ACOUSTICS.clearCutoff - VOICE_ACOUSTICS.rearCutoff) -
        blocked * 5200,
    ),
  };
}
/** Bounded tile ray samples. Caller supplies reliable terrain/closed-door tests only. */
export function voiceOcclusion(
  from: VoicePoint,
  to: VoicePoint,
  opaque: (x: number, y: number) => boolean,
): number {
  const n = Math.min(64, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2));
  let hits = 0;
  const seen = new Set<string>();
  for (let i = 1; i < n; i++) {
    const x = Math.floor(from.x + ((to.x - from.x) * i) / n),
      y = Math.floor(from.y + ((to.y - from.y) * i) / n),
      key = `${x},${y}`;
    if (!seen.has(key) && opaque(x, y)) hits++;
    seen.add(key);
    if (hits >= 3) return 1;
  }
  return Math.min(1, hits * 0.42);
}
