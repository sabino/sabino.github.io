/** Ephemeral semantic cues, never recorded sound or checkpoint state. */
export interface SystemSoundEvent {
  kind: string;
  spaceId?: string;
  x: number;
  y: number;
  actorId?: string;
  text?: string;
}
export const SYSTEM_SOUND_RANGE = 18;
export const SYSTEM_SOUND_BATCH = 24;
export function validSystemSoundEvents(value: unknown): value is SystemSoundEvent[] {
  return (
    Array.isArray(value) &&
    value.length <= SYSTEM_SOUND_BATCH &&
    value.every(
      (e) =>
        e &&
        typeof e === 'object' &&
        !Array.isArray(e) &&
        Object.keys(e).every((k) => ['kind', 'spaceId', 'x', 'y', 'actorId', 'text'].includes(k)) &&
        typeof e.kind === 'string' &&
        /^[a-z-]{1,40}$/.test(e.kind) &&
        Number.isFinite(e.x) &&
        Number.isFinite(e.y) &&
        Math.abs(e.x) < 1e8 &&
        Math.abs(e.y) < 1e8 &&
        (e.spaceId === undefined ||
          (typeof e.spaceId === 'string' && /^[a-zA-Z0-9:_.,-]{1,160}$/.test(e.spaceId))) &&
        (e.actorId === undefined || (typeof e.actorId === 'string' && e.actorId.length <= 160)) &&
        (e.text === undefined || (typeof e.text === 'string' && e.text.length <= 300)),
    )
  );
}
export function audibleSystemEvents(
  events: readonly SystemSoundEvent[],
  receiver: { spaceId: string; x: number; y: number },
) {
  return events
    .filter(
      (e) =>
        (e.spaceId ?? 'surface') === receiver.spaceId &&
        Math.hypot(e.x - receiver.x, e.y - receiver.y) <= SYSTEM_SOUND_RANGE,
    )
    .slice(-SYSTEM_SOUND_BATCH);
}
