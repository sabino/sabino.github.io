/** One real second is one local minute: a complete day lasts 24 real minutes. */
export const WORLD_DAY_SECONDS = 24 * 60;
export const WORLD_START_HOUR = 8;
export type WorldDayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export interface WorldTimeSignal {
  elapsedSeconds: number;
  day: number;
  hour: number;
  phase: WorldDayPhase;
  daylight: number;
  nightness: number;
  label: string;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
/** Pure shared calendar. Never consults the device clock or changes generation seeds. */
export function worldTimeAt(elapsedSeconds: number, _seed = 0): WorldTimeSignal {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const totalMinutes = (elapsed / WORLD_DAY_SECONDS) * 1440 + WORLD_START_HOUR * 60;
  const minute = Math.floor(totalMinutes % 1440);
  const hour = (totalMinutes % 1440) / 60;
  const daylight = smooth((hour - 5) / 2) * (1 - smooth((hour - 18) / 2));
  const phase: WorldDayPhase =
    hour >= 5 && hour < 7
      ? 'dawn'
      : hour >= 7 && hour < 18
        ? 'day'
        : hour >= 18 && hour < 20
          ? 'dusk'
          : 'night';
  return {
    elapsedSeconds: elapsed,
    day: Math.floor(totalMinutes / 1440) + 1,
    hour,
    phase,
    daylight,
    nightness: 1 - daylight,
    label: `Day ${Math.floor(totalMinutes / 1440) + 1} · ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
  };
}
/** Server clock: epoch belongs to room creation, survives checkpoint/restart, runs while away. */
export function roomWorldSeconds(createdAtMs: number, nowMs: number): number {
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, (nowMs - createdAtMs) / 1000);
}
