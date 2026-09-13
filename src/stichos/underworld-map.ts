import type { UnderworldFrame } from './underworld.ts';
import type { Point } from './types.ts';
export function drawUnderworldMap(
  target: HTMLCanvasElement,
  floor: UnderworldFrame,
  player: Point,
) {
  const ctx = target.getContext('2d')!,
    s = Math.min(target.width / floor.plan.width, target.height / floor.plan.height),
    ox = (target.width - floor.plan.width * s) / 2,
    oy = (target.height - floor.plan.height * s) / 2;
  ctx.fillStyle = '#101e28';
  ctx.fillRect(0, 0, target.width, target.height);
  const visible = (x: number, y: number) =>
    Math.hypot(x - player.x, y - player.y) < 8 ||
    floor.state.discovered.some((index) => {
      const r = floor.plan.rooms[index];
      return r && Math.abs(x - r.x) < r.width / 2 + 1 && Math.abs(y - r.y) < r.height / 2 + 1;
    });
  for (let y = 0; y < floor.plan.height; y++)
    for (let x = 0; x < floor.plan.width; x++)
      if (visible(x, y) && floor.plan.cells[y * floor.plan.width + x]) {
        ctx.fillStyle = '#67898e';
        ctx.fillRect(ox + x * s, oy + y * s, Math.max(1, s), Math.max(1, s));
      }
  for (const f of floor.plan.features)
    if (visible(f.x, f.y) && ['up', 'down', 'rest'].includes(f.kind)) {
      ctx.fillStyle = f.kind === 'up' ? '#e8cd88' : '#9ebf99';
      ctx.fillRect(ox + f.x * s - 2, oy + f.y * s - 2, 4, 4);
    }
  ctx.fillStyle = '#fff0aa';
  ctx.fillRect(ox + player.x * s - 2, oy + player.y * s - 2, 4, 4);
}
