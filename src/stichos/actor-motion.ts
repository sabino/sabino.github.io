import type { Effect, Point } from './types.ts';

export type HumanoidActionKind = 'gather' | 'craft' | 'ward' | 'heal' | 'hurt';
export interface HumanoidAction {
  kind: HumanoidActionKind;
  progress: number;
  reduced?: boolean;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A finite six-step action envelope supplements the eight-step walk cycle. Feet stay planted. */
export function actionMotion(action: HumanoidAction | null | undefined) {
  if (!action || !Number.isFinite(action.progress))
    return { kind: null, step: 0, strength: 0, settle: 0, crouch: 0, lean: 0 };
  const step = Math.round(clamp(action.progress, 0, 1) * 6);
  if (!action.reduced && (step === 0 || step === 6))
    return { kind: null, step: 0, strength: 0, settle: 0, crouch: 0, lean: 0 };
  const t = step / 6;
  const strength = action.reduced ? 0.32 : Math.sin(Math.PI * t);
  const settle = action.reduced ? 0.5 : t;
  const crouch =
    strength *
    (action.kind === 'gather' ? 6 : action.kind === 'craft' ? 1.5 : action.kind === 'hurt' ? 2 : 0);
  const lean = strength * (action.kind === 'gather' ? 2.5 : action.kind === 'hurt' ? -3 : 0);
  return { kind: action.kind, step: action.reduced ? 3 : step, strength, settle, crouch, lean };
}

export interface MotionActor extends Point {
  id: string;
  player: boolean;
}
/** Associate an effect once at onset. Gather/craft are player actions; impact chooses one body. */
export function effectActor(
  effect: Effect,
  actors: readonly MotionActor[],
): { id: string; kind: HumanoidActionKind } | null {
  if (effect.kind === 'harvest') {
    const player = actors.find((actor) => actor.player);
    return player
      ? {
          id: player.id,
          kind: Math.hypot(effect.x - player.x, effect.y - player.y) < 0.3 ? 'craft' : 'gather',
        }
      : null;
  }
  if (!['hurt', 'heal', 'ward'].includes(effect.kind)) return null;
  let closest: MotionActor | null = null,
    distance = 1.6;
  for (const actor of actors) {
    const d = Math.hypot(effect.x - actor.x, effect.y - actor.y);
    if (d < distance) {
      closest = actor;
      distance = d;
    }
  }
  return closest ? { id: closest.id, kind: effect.kind as 'hurt' | 'heal' | 'ward' } : null;
}
