import type { FaunaActor } from './living-world.ts';
/** Original procedural pixel silhouettes. No external art or raster asset licenses. */
export function drawFauna(
  ctx: CanvasRenderingContext2D,
  animal: FaunaActor,
  x: number,
  y: number,
  unit: number,
  reducedMotion = false,
) {
  const scale = (unit / 32) * animal.scale,
    moving = ['fly', 'flee', 'stalk', 'lunge'].includes(animal.activity);
  const phase = reducedMotion ? 0 : animal.phase;
  const facing = Math.cos(animal.heading) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale * facing, scale);
  ctx.fillStyle = 'rgba(14,27,34,.18)';
  ctx.fillRect(-7, -1, 14, 3);
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  if (animal.kind === 'bird') {
    const lift = animal.activity === 'fly' || animal.activity === 'flee' ? 12 : 3;
    const wing = Math.sin(phase * 2) > 0 ? -4 : 0;
    r(-3, -7 - lift, 7, 4, animal.color);
    r(3, -8 - lift, 3, 3, animal.color);
    r(6, -7 - lift, 2, 1, '#d1a467');
    r(-2, -8 - lift + wing, 3, 5, '#607d83');
    r(-6, -6 - lift, 4, 2, '#70878a');
    r(4, -8 - lift, 1, 1, '#273640');
  } else {
    const stride = moving && !reducedMotion ? Math.sin(phase * 3) * 2 : 0;
    const graze = animal.activity === 'forage' ? 2 : 0;
    const asleep = animal.activity === 'sleep';
    const body = animal.kind === 'wolf' ? 15 : animal.kind === 'boar' ? 16 : 13;
    for (const [lx, side] of [
      [-5, -1],
      [4, 1],
    ] as const) {
      r(lx + stride * side, -5, 2, 5, '#586065');
      r(lx - stride * side + 2, -5, 2, 5, animal.color);
    }
    r(-7, asleep ? -6 : -11, body, asleep ? 5 : 7, animal.color);
    r(5, -13 + graze, 6, 5, animal.color);
    r(9, -11 + graze, animal.kind === 'wolf' ? 5 : 3, 3, animal.color);
    r(7, -14 + graze, 2, 3, '#647075');
    r(9, -12 + graze, 1, 1, '#24383d');
    r(-10, -10, 4, 2, animal.color);
    if (animal.kind === 'grazer') {
      r(6, -17, 1, 4, '#dacbb1');
      r(10, -17, 1, 4, '#dacbb1');
      r(5, -17, 2, 1, '#dacbb1');
    }
    if (animal.kind === 'boar') {
      r(10, -8 + graze, 1, 3, '#eee0bd');
      r(-6, -12, 9, 2, '#635b55');
    }
    if (animal.activity === 'lunge') {
      r(12, -10 + graze, 2, 1, '#f0d3c3');
    }
    if (animal.activity === 'stalk') {
      r(-1, -22, 2, 5, '#dda285');
      r(-1, -15, 2, 2, '#dda285');
    }
  }
  ctx.restore();
}
