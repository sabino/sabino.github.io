import { generateUnderworld, type UnderworldFrame, type UnderworldPlan } from './underworld.ts';

/** Plans are reproducible client data; room frames carry mutable state only. */
export class UnderworldViewCache {
  private plans = new Map<string, UnderworldPlan>();
  frame(
    seed: number,
    compact: {
      settlementId: string;
      depth: number;
      spaceId: string;
      state: UnderworldFrame['state'];
      projectiles: UnderworldFrame['projectiles'];
      time: number;
    },
  ): UnderworldFrame {
    const key = `${seed}:${compact.spaceId}`;
    let plan = this.plans.get(key);
    if (!plan) {
      plan = generateUnderworld(seed, compact.settlementId, compact.depth);
      if (this.plans.size >= 6) this.plans.delete(this.plans.keys().next().value!);
      this.plans.set(key, plan);
    }
    return { plan, state: compact.state, projectiles: compact.projectiles, time: compact.time };
  }
}
export function underworldViewBlocked(frame: UnderworldFrame, x: number, y: number) {
  const tx = Math.round(x),
    ty = Math.round(y),
    { plan, state } = frame;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    tx < 0 ||
    ty < 0 ||
    tx >= plan.width ||
    ty >= plan.height ||
    !plan.cells[ty * plan.width + tx]
  )
    return true;
  return plan.features.some(
    (f) =>
      ['gate', 'shortcut', 'secret'].includes(f.kind) &&
      Math.round(f.x) === tx &&
      Math.round(f.y) === ty &&
      !state.opened.includes(f.id),
  );
}
