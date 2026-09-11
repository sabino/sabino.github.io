import { random, deriveSeed } from '../procedural/random.ts';
import type { Appearance, PropKind, Terrain, Tile } from './types.ts';

export interface Sprite {
  image: HTMLCanvasElement;
  x: number;
  y: number;
}
type Ctx = CanvasRenderingContext2D;
const snow = ['#d9e3ee', '#c9d6e6', '#b7c8df', '#edf0f2', '#91aac6'];
const stone = ['#82909d', '#8796a2', '#8d9aa7', '#7e8d9b', '#919eaa'];
export function color(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n + amount)))
      .toString(16)
      .padStart(2, '0');
  return `#${c((value >> 16) & 255)}${c((value >> 8) & 255)}${c(value & 255)}`;
}
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(
    Math.round(x),
    Math.round(y),
    Math.max(1, Math.round(w)),
    Math.max(1, Math.round(h)),
  );
}
export function poly(ctx: Ctx, points: number[][], fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  points.forEach(([x, y], i) =>
    i ? ctx.lineTo(Math.round(x), Math.round(y)) : ctx.moveTo(Math.round(x), Math.round(y)),
  );
  ctx.closePath();
  ctx.fill();
}
export function line(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fill: string,
  width = 1,
) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++)
    rect(ctx, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, width, width, fill);
}
function image(w: number, h: number, paint: (ctx: Ctx) => void, x = w / 2, y = h): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  return { image: canvas, x, y };
}
function blob(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  rng: () => number,
) {
  const pts: number[][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2,
      k = 0.78 + rng() * 0.22;
    pts.push([x + Math.cos(a) * w * k, y + Math.sin(a) * h * k]);
  }
  poly(ctx, pts, fill);
}

/** Bounded, reusable pixel modules. No full landscape or complete character image is loaded. */
export class StichosArt {
  private cache = new Map<string, Sprite>();
  private get(key: string, make: () => Sprite): Sprite {
    const found = this.cache.get(key);
    if (found) {
      this.cache.delete(key);
      this.cache.set(key, found);
      return found;
    }
    const result = make();
    this.cache.set(key, result);
    while (this.cache.size > 320) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
  get cacheSize() {
    return this.cache.size;
  }
  ground(tile: Tile): Sprite {
    const terrain = tile.terrain === 'wall' ? 'floor' : tile.terrain;
    const variant = tile.seed % 16;
    return this.get(`ground:${terrain}:${variant}:${!!tile.building}`, () =>
      image(
        32,
        32,
        (ctx) => {
          const rng = random(deriveSeed(variant, terrain, Number(!!tile.building)));
          const choose = (a: string[]) => a[Math.floor(rng() * a.length)];
          const base: Record<Terrain, string> = {
            snow: '#bccce0',
            grass: '#5b7783',
            road: '#738392',
            floor: tile.building ? '#52616a' : '#72828f',
            wall: '#52616a',
            ice: '#97b5d1',
            water: '#304e68',
            bridge: '#635e59',
          };
          rect(ctx, 0, 0, 32, 32, base[terrain]);
          if (terrain === 'road' || terrain === 'floor') {
            for (let row = -1; row < 6; row++)
              for (let col = -1; col < 5; col++) {
                const x = col * 9 + (row % 2) * 4,
                  y = row * 7;
                const c = choose(
                  tile.building ? ['#52636c', '#4d5c63', '#64717a', '#586b73'] : stone,
                );
                poly(
                  ctx,
                  [
                    [x + 1, y + 1],
                    [x + 7, y],
                    [x + 8, y + 4],
                    [x + 7, y + 6],
                    [x + 1, y + 6],
                    [x, y + 3],
                  ],
                  c,
                );
                rect(ctx, x + 2, y + 1, 5, 1, color(c, 7));
                rect(ctx, x + 2, y + 5, 5, 1, color(c, -7));
                for (let j = 0; j < 1; j++)
                  rect(
                    ctx,
                    x + 1 + rng() * 6,
                    y + 1 + rng() * 4,
                    1,
                    1,
                    color(c, rng() > 0.5 ? 8 : -8),
                  );
              }
            if (!tile.building)
              for (let i = 0; i < 3; i++)
                blob(
                  ctx,
                  rng() * 32,
                  rng() * 32,
                  3 + rng() * 7,
                  1 + rng() * 2,
                  choose(['#a7bacf', '#b4c6d9', '#a3b7cc']),
                  rng,
                );
            if (terrain === 'floor' && !tile.building && variant % 4 === 0) {
              line(ctx, 8, 16, 16, 8, '#a5ada7');
              line(ctx, 16, 8, 24, 16, '#a5ada7');
              line(ctx, 24, 16, 16, 24, '#a5ada7');
              line(ctx, 16, 24, 8, 16, '#a5ada7');
            }
          } else if (terrain === 'snow') {
            for (let i = 0; i < 9; i++)
              blob(
                ctx,
                rng() * 32,
                rng() * 32,
                3 + rng() * 8,
                0.5 + rng() * 2,
                choose(['#c2d0e2', '#b5c6dc', '#c7d4e5']),
                rng,
              );
            for (let i = 0; i < 60; i++)
              rect(
                ctx,
                rng() * 32,
                rng() * 32,
                1 + rng() * 2,
                1,
                choose(['#c6d3e3', '#b4c4d9', '#ccd8e7', '#b9cbe0']),
              );
            if (variant < 5) {
              line(ctx, 4, 24, 17, 19, '#d5dfeb');
              line(ctx, 17, 19, 28, 20, '#cfdae8');
            }
            if (variant === 7) {
              rect(ctx, 8, 12, 2, 2, '#819bb5');
              rect(ctx, 12, 17, 2, 2, '#819bb5');
            }
          } else if (terrain === 'grass') {
            for (let i = 0; i < 100; i++) {
              const x = rng() * 32,
                y = rng() * 32;
              line(
                ctx,
                x,
                y,
                x + rng() * 3 - 1,
                y - 1 - rng() * 3,
                choose(['#3d5c68', '#52757b', '#6e8e91', '#77959a', '#354e60']),
              );
            }
            for (let i = 0; i < 6; i++)
              blob(
                ctx,
                rng() * 32,
                rng() * 32,
                2 + rng() * 6,
                1 + rng() * 3,
                choose(snow.slice(1, 3)),
                rng,
              );
          } else if (terrain === 'ice') {
            for (let i = 0; i < 18; i++)
              rect(
                ctx,
                rng() * 32,
                rng() * 32,
                2 + rng() * 12,
                1,
                choose(['#a2bfd7', '#88a9c7', '#bed1e1']),
              );
            let x = rng() * 8,
              y = 0;
            for (let i = 0; i < 5; i++) {
              const nx = x + rng() * 12 - 2,
                ny = y + 8;
              line(ctx, x, y, nx, ny, '#deebf0');
              line(ctx, x + 1, y, nx + 1, ny, '#718cae');
              if (i === 2) line(ctx, nx, ny, nx - 8, ny + 3, '#d3e3ef');
              x = nx;
              y = ny;
            }
          } else if (terrain === 'water') {
            for (let i = 0; i < 28; i++)
              rect(
                ctx,
                rng() * 32,
                rng() * 32,
                2 + rng() * 9,
                1,
                choose(['#446983', '#385d7b', '#284359', '#52778d']),
              );
          } else {
            for (let i = 0; i < 5; i++) {
              const y = i * 7;
              rect(ctx, 0, y, 32, 5, choose(['#7b756b', '#68675f', '#8a8172']));
              rect(ctx, 0, y, 32, 1, '#9b9484');
              for (let j = 0; j < 6; j++)
                rect(ctx, rng() * 32, y + rng() * 4, 3 + rng() * 8, 1, '#575953');
              rect(ctx, 2, y + 2, 1, 1, '#272f32');
              rect(ctx, 29, y + 2, 1, 1, '#272f32');
            }
          }
        },
        0,
        0,
      ),
    );
  }

  prop(kind: PropKind, seed: number, opened = false, tint = '#687e80'): Sprite {
    const variant = seed % (kind === 'pine' ? 24 : 12);
    return this.get(`prop:${kind}:${variant}:${opened}:${tint}`, () => {
      const rng = random(deriveSeed(variant, kind));
      if (kind === 'pine') return this.pine(rng);
      if (kind === 'rock') return this.rock(rng);
      if (['cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(kind))
        return this.herb(kind, rng);
      return image(
        64,
        96,
        (ctx) => {
          const cx = 32,
            foot = 87;
          if (kind === 'lamp') {
            poly(
              ctx,
              [
                [cx - 6, foot],
                [cx + 6, foot],
                [cx + 4, foot - 3],
                [cx - 4, foot - 3],
              ],
              '#33434b',
            );
            rect(ctx, cx - 2, foot - 39, 4, 36, '#263640');
            rect(ctx, cx - 1, foot - 35, 1, 32, '#8c927d');
            rect(ctx, cx - 5, foot - 44, 10, 4, '#68716b');
            rect(ctx, cx - 4, foot - 57, 8, 13, '#d4a761');
            rect(ctx, cx - 2, foot - 55, 4, 9, '#ffe2a0');
            for (const x of [-5, 3]) rect(ctx, cx + x, foot - 58, 2, 16, '#34454a');
            poly(
              ctx,
              [
                [cx - 7, foot - 57],
                [cx, foot - 64],
                [cx + 7, foot - 57],
              ],
              '#71808a',
            );
            rect(ctx, cx - 6, foot - 58, 12, 2, '#d9e0e3');
            rect(ctx, cx, foot - 66, 1, 3, '#9aa79e');
          } else if (kind === 'door') {
            if (!opened) {
              poly(
                ctx,
                [
                  [19, 88],
                  [19, 56],
                  [24, 47],
                  [32, 41],
                  [40, 47],
                  [45, 56],
                  [45, 88],
                ],
                '#202d37',
              );
              for (let x = 22; x < 44; x += 4) {
                rect(ctx, x, 58, 2, 28, '#40505a');
                rect(ctx, x, 60, 1, 24, '#5b6665');
              }
              rect(ctx, 31, 49, 2, 38, '#101e29');
              for (let y = 65; y < 86; y += 12) {
                rect(ctx, 22, y, 20, 2, '#748278');
                rect(ctx, 24, y, 1, 1, '#c2bc9a');
                rect(ctx, 39, y, 1, 1, '#c2bc9a');
              }
              rect(ctx, 34, 73, 2, 3, '#d0af64');
            } else {
              poly(
                ctx,
                [
                  [19, 87],
                  [19, 53],
                  [24, 50],
                  [25, 82],
                ],
                '#384850',
              );
              rect(ctx, 21, 58, 1, 22, '#9b947b');
            }
          } else if (kind === 'banner') {
            rect(ctx, cx - 1, foot - 65, 3, 63, '#66777a');
            rect(ctx, cx, foot - 67, 1, 3, '#d9c091');
            rect(ctx, cx - 12, foot - 59, 27, 2, '#a39872');
            poly(
              ctx,
              [
                [cx - 11, foot - 57],
                [cx + 12, foot - 57],
                [cx + 12, foot - 22],
                [cx, foot - 15],
                [cx - 11, foot - 22],
              ],
              tint,
            );
            line(ctx, cx - 10, foot - 56, cx - 10, foot - 23, '#b7a177');
            line(ctx, cx + 10, foot - 56, cx + 10, foot - 23, '#b7a177');
            line(ctx, cx, foot - 49, cx, foot - 25, '#d1b785');
            for (let i = 0; i < 4; i++)
              for (const s of [-1, 1])
                line(ctx, cx, foot - 31 - i * 5, cx + s * (6 - i), foot - 35 - i * 5, '#d1b785');
            rect(ctx, cx - 12, foot - 59, 24, 2, '#d7e1e7');
          } else if (kind === 'notice') {
            for (const x of [15, 44]) {
              rect(ctx, x, 54, 4, 34, '#4e4d46');
              rect(ctx, x, 55, 1, 30, '#969180');
            }
            rect(ctx, 12, 52, 39, 27, '#383e40');
            rect(ctx, 14, 54, 35, 22, '#615c50');
            for (const [x, y, w, h] of [
              [17, 56, 13, 16],
              [32, 58, 12, 12],
            ]) {
              rect(ctx, x, y, w, h, '#b7b39e');
              for (let j = 3; j < h - 2; j += 3) rect(ctx, x + 2, y + j, w - 5, 1, '#737c70');
              rect(ctx, x + w / 2, y + 1, 1, 1, '#6d5a4a');
            }
            poly(
              ctx,
              [
                [10, 53],
                [15, 49],
                [49, 49],
                [53, 53],
              ],
              '#d4e0ea',
            );
          } else if (kind === 'bench') {
            for (const x of [12, 44]) rect(ctx, x, 75, 5, 13, '#303d43');
            for (let i = 0; i < 3; i++)
              rect(ctx, 10, 66 + i * 4, 44, 3, i === 0 ? '#a1a79a' : '#7a7765');
            rect(ctx, 13, 55, 3, 17, '#394a50');
            rect(ctx, 47, 55, 3, 17, '#394a50');
            rect(ctx, 14, 56, 35, 4, '#8c8c79');
            rect(ctx, 14, 55, 35, 2, '#cbd8de');
          } else if (kind === 'radio') {
            rect(ctx, 19, 74, 27, 12, '#344650');
            rect(ctx, 21, 56, 23, 20, '#84785c');
            rect(ctx, 23, 58, 19, 16, '#344650');
            rect(ctx, 24, 59, 17, 1, '#c2ac77');
            for (let i = 0; i < 5; i++) rect(ctx, 25, 62 + i * 2, 8, 1, '#8a998d');
            rect(ctx, 35, 63, 5, 4, '#85beb5');
            rect(ctx, 36, 68, 3, 3, '#c4ae77');
            rect(ctx, 30, 27, 2, 28, '#a8af9f');
            line(ctx, 18, 38, 45, 29, '#6d7d7e');
            rect(ctx, 30, 25, 3, 2, '#d8c48d');
            for (let i = 0; i < 3; i++) rect(ctx, 17 + i * 11, 86, 8, 3, '#7c8991');
          } else if (kind === 'shrine' || kind === 'grave') {
            rect(ctx, 17, 81, 31, 7, '#647784');
            rect(ctx, 20, 76, 25, 5, '#8b9aa2');
            rect(ctx, 23, 58, 19, 18, '#5d707d');
            poly(
              ctx,
              [
                [21, 59],
                [25, 45],
                [32, 37],
                [40, 46],
                [44, 59],
              ],
              '#9aa8af',
            );
            rect(ctx, 30, 44, 4, 24, '#425b69');
            rect(ctx, 25, 50, 14, 3, '#425b69');
            rect(ctx, 22, 76, 21, 2, '#d0dce4');
            for (let i = 0; i < 12; i++)
              rect(ctx, 24 + rng() * 16, 60 + rng() * 13, 2, 1, '#91a0a3');
            for (const x of [18, 44]) {
              rect(ctx, x, 74, 2, 8, '#c7b890');
              rect(ctx, x, 72, 2, 2, '#ffd698');
            }
          } else {
            const bench = kind === 'workbench',
              h = bench ? 17 : kind === 'crate' ? 22 : 17;
            rect(ctx, 13, foot - h, 38, h, '#4e4d44');
            for (let i = 0; i < 5; i++) {
              rect(ctx, 15 + i * 7, foot - h + 2, 6, h - 4, i % 2 ? '#766b54' : '#89785b');
              rect(ctx, 16 + i * 7, foot - h + 3, 1, h - 6, '#a39471');
            }
            for (const y of [foot - h + 3, foot - 5]) {
              rect(ctx, 13, y, 38, 2, '#343c3a');
              for (const x of [16, 47]) rect(ctx, x, y, 1, 1, '#c1b186');
            }
            if (kind === 'chest') {
              poly(
                ctx,
                [
                  [13, foot - h],
                  [16, foot - h - 6],
                  [47, foot - h - 6],
                  [51, foot - h],
                ],
                opened ? '#343f42' : '#8a7c61',
              );
              rect(ctx, 29, foot - h + 7, 5, 5, '#bd995b');
            }
            if (bench) {
              rect(ctx, 10, foot - 22, 45, 6, '#9a8b69');
              rect(ctx, 12, foot - 23, 41, 1, '#c5b492');
              rect(ctx, 19, foot - 32, 6, 9, '#94bba9');
              rect(ctx, 20, foot - 34, 4, 3, '#b8b792');
              rect(ctx, 20, foot - 30, 1, 5, '#d1e4d4');
              poly(
                ctx,
                [
                  [31, foot - 25],
                  [32, foot - 31],
                  [38, foot - 31],
                  [40, foot - 25],
                ],
                '#756889',
              );
              rect(ctx, 34, foot - 38, 2, 9, '#9aae8d');
              line(ctx, 35, foot - 34, 40, foot - 36, '#accb99');
              rect(ctx, 43, foot - 26, 8, 2, '#d3c59c');
            } else if (kind === 'crate') {
              line(ctx, 17, foot - h + 4, 45, foot - 6, '#a49473', 2);
              rect(ctx, 14, foot - h, 36, 2, '#bacbd8');
            }
          }
        },
        32,
        87,
      );
    });
  }

  private pine(rng: () => number): Sprite {
    return image(
      112,
      160,
      (ctx) => {
        const cx = 56 + (rng() - 0.5) * 5,
          foot = 148,
          top = 10 + rng() * 15,
          lean = (rng() - 0.5) * 15,
          spread = 0.78 + rng() * 0.3,
          tierSpacing = 12 + rng() * 3;
        rect(ctx, cx - 5, foot - 68, 11, 67, '#253942');
        for (let i = 0; i < 20; i++)
          rect(
            ctx,
            cx - 4 + rng() * 8,
            foot - 65 + rng() * 63,
            1 + rng() * 2,
            3 + rng() * 8,
            rng() > 0.6 ? '#7b827a' : '#4e5c5d',
          );
        for (const side of [-1, 1])
          line(ctx, cx, foot - 8, cx + side * (10 + rng() * 6), foot, '#53686d', 3);
        for (let tier = 0; tier < 8; tier++) {
          const y = foot - 25 - tier * tierSpacing + (rng() - 0.5) * 7,
            half = (45 - tier * 4.6) * spread * (0.86 + rng() * 0.2),
            offset = (lean * tier) / 8;
          const pts: number[][] = [[cx + offset, y - 40]];
          for (let j = 0; j <= 12; j++) {
            const x = -half + (j / 12) * half * 2;
            pts.push([cx + offset + x, y + Math.sin(j * 2.4) * 3 + rng() * 7 - Math.abs(x) * 0.09]);
          }
          poly(ctx, pts, tier % 2 ? '#213e50' : '#294b5b');
          // Feathered branch tips, grouped needles and irregular loads of snow.
          for (let branch = 0; branch < 9; branch++) {
            const a = (branch / 8 - 0.5) * 2,
              x = cx + offset + a * half,
              by = y - 3 - (1 - Math.abs(a)) * 12;
            line(ctx, cx + offset, y - 22, x, by, '#4a6972', 2);
            for (let n = 0; n < 10; n++) {
              const bx = x + (rng() - 0.5) * 12,
                yy = by - rng() * 8;
              line(
                ctx,
                bx,
                yy,
                bx + (rng() - 0.5) * 6,
                yy + 3 + rng() * 4,
                rng() > 0.65 ? '#6b8990' : '#315867',
              );
            }
            if (rng() > 0.31) {
              const sw = 4 + rng() * 8;
              blob(ctx, x, by - 3, sw, 3 + rng() * 3, '#a6bad4', rng);
              blob(ctx, x - 1, by - 6, sw * 0.9, 3 + rng() * 2, '#cad9e9', rng);
              if (rng() > 0.4) rect(ctx, x - sw * 0.5, by - 8, sw * 0.7, 1, '#e6eef5');
              if (rng() > 0.5) rect(ctx, x + sw * 0.5, by - 2, 1, 3 + rng() * 4, '#c5d7e6');
            }
          }
        }
        line(ctx, cx + lean, top + 14, cx + lean, top - 2, '#527983', 2);
        rect(ctx, cx + lean - 1, top, 3, 7, '#dce7ef');
        for (let i = 0; i < 22; i++)
          rect(
            ctx,
            cx + (rng() - 0.5) * 25,
            foot - 5 + rng() * 10,
            2 + rng() * 4,
            1,
            rng() > 0.5 ? '#d8e2eb' : '#879db8',
          );
      },
      56,
      148,
    );
  }

  private rock(rng: () => number): Sprite {
    return image(
      64,
      48,
      (ctx) => {
        const pts = [
          [9, 33],
          [13, 18],
          [25, 11],
          [39, 12],
          [51, 23],
          [54, 35],
          [42, 42],
          [22, 43],
        ];
        poly(ctx, pts, '#596e7f');
        poly(
          ctx,
          [
            [13, 18],
            [25, 11],
            [39, 12],
            [44, 23],
            [28, 29],
            [9, 33],
          ],
          '#8a9bad',
        );
        poly(
          ctx,
          [
            [28, 29],
            [44, 23],
            [54, 35],
            [42, 42],
            [22, 43],
          ],
          '#42596d',
        );
        for (let i = 0; i < 130; i++) {
          const x = 13 + rng() * 35,
            y = 15 + rng() * 23;
          rect(
            ctx,
            x,
            y,
            1 + rng() * 2,
            1,
            ['#708a9c', '#a2b1bb', '#405e73', '#5f7788'][Math.floor(rng() * 4)],
          );
        }
        line(ctx, 22, 18, 33, 27, '#293f56');
        line(ctx, 33, 27, 30, 37, '#a8c3d1');
        for (let i = 0; i < 7; i++) {
          const x = 28 + rng() * 18,
            y = 22 + rng() * 11;
          poly(
            ctx,
            [
              [x, y - 3],
              [x + 3, y - 1],
              [x + 1, y + 3],
              [x - 2, y + 1],
            ],
            '#9dadd9',
          );
          rect(ctx, x, y - 2, 1, 2, '#dae1f4');
        }
        for (let i = 0; i < 5; i++)
          blob(ctx, 15 + i * 6, 16 - Math.sin(i) * 2, 5 + rng() * 3, 3, snow[i % 3], rng);
      },
      32,
      41,
    );
  }

  private herb(kind: PropKind, rng: () => number): Sprite {
    return image(
      40,
      42,
      (ctx) => {
        const cx = 20,
          base = 35;
        blob(ctx, cx, base, 12, 4, '#6b8190', rng);
        blob(ctx, cx, base + 1, 10, 2, '#425e69', rng);
        if (kind === 'mushroom') {
          for (let i = 0; i < 5; i++) {
            const x = 11 + rng() * 18,
              y = 25 + rng() * 9;
            rect(ctx, x, y - 4, 2, 7, '#b2c6bc');
            blob(ctx, x + 1, y - 5, 4 + rng() * 2, 3, '#99bbc6', rng);
            rect(ctx, x, y - 7, 2, 1, '#e0e8da');
          }
        } else {
          for (let stem = 0; stem < 7; stem++) {
            const x = cx + (rng() - 0.5) * 19,
              h = 10 + rng() * 19,
              tip = x + (rng() - 0.5) * 9;
            line(ctx, cx, base, tip, base - h, '#657f78');
            for (let j = 0; j < 7; j++) {
              const t = j / 8,
                sx = cx + (tip - cx) * t,
                sy = base - h * t;
              const c =
                kind === 'heartleaf'
                  ? ['#5faaa9', '#a1cbb9', '#7fb7b0'][j % 3]
                  : kind === 'emberroot'
                    ? ['#768a70', '#b5a475', '#798e78'][j % 3]
                    : ['#9fbeb4', '#6da798', '#bed4c1'][j % 3];
              for (const side of [-1, 1]) {
                if (kind === 'heartleaf')
                  poly(
                    ctx,
                    [
                      [sx, sy],
                      [sx + side * 6, sy - 5],
                      [sx + side * 7, sy - 2],
                      [sx + side * 3, sy + 1],
                    ],
                    c,
                  );
                else line(ctx, sx, sy, sx + side * (2 + rng() * 3), sy - 2, c);
              }
            }
            if (kind !== 'cequin' || stem % 3 === 0) {
              const c = kind === 'emberroot' ? '#dc9b79' : '#b6a4e2';
              for (let j = 0; j < 3; j++) {
                rect(ctx, tip - 2 + rng() * 3, base - h + j * 3, 3, 2, c);
                rect(ctx, tip, base - h + j * 3, 1, 1, '#e5d9ed');
              }
            }
          }
        }
      },
      20,
      35,
    );
  }
}

const humanFrames = new Map<string, Sprite>();

/** Discrete articulated pixel poses are cached; travel selects a gait phase, never a baked actor. */
export function drawHumanoid(
  ctx: Ctx,
  look: Appearance,
  x: number,
  y: number,
  scale: number,
  heading: number,
  phase: number,
  moving: boolean,
  attack = 0,
  player = false,
) {
  const gait = moving ? ((Math.round((phase / (Math.PI * 2)) * 8) % 8) + 8) % 8 : 0;
  const strike = Math.round(attack * 5);
  const key = [
    look.seed,
    look.coat,
    look.trim,
    look.skin,
    look.hair,
    look.hairStyle,
    look.hat,
    look.cloak,
    look.height,
    look.build,
    look.trousers,
    look.weapon,
    heading,
    gait,
    moving,
    strike,
  ].join(':');
  let frame = humanFrames.get(key);
  if (!frame) {
    frame = image(
      96,
      80,
      (context) =>
        drawHumanoidParts(
          context,
          look,
          48,
          68,
          1,
          heading,
          (gait / 8) * Math.PI * 2,
          moving,
          strike / 5,
          player,
        ),
      48,
      68,
    );
    humanFrames.set(key, frame);
    while (humanFrames.size > 384) humanFrames.delete(humanFrames.keys().next().value!);
  } else {
    humanFrames.delete(key);
    humanFrames.set(key, frame);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    frame.image,
    Math.round(x - frame.x * scale),
    Math.round(y - frame.y * scale),
    Math.round(frame.image.width * scale),
    Math.round(frame.image.height * scale),
  );
}

/** Human proportions remain stable; gait moves arms, legs, cloak and carried tools. */
function drawHumanoidParts(
  ctx: Ctx,
  look: Appearance,
  x: number,
  y: number,
  scale: number,
  heading: number,
  phase: number,
  moving: boolean,
  attack = 0,
  player = false,
) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale * look.build * 1.28, scale * look.height);
  const face = ((Math.round(heading) % 4) + 4) % 4;
  const side = face === 1 || face === 3,
    east = face === 1 ? 1 : -1;
  const step = moving ? Math.sin(phase) : 0,
    bob = moving ? Math.abs(Math.sin(phase * 2)) : 0;
  const cloak = color(look.coat, -9),
    coat = look.coat;
  // Sole, trouser folds, two distinct feet, and the visible rear hand.
  for (const s of [-1, 1]) {
    const sy = s * step * 2,
      bx = side ? s * step * 3 : s * 3;
    rect(ctx, bx - 2, -12 + sy, 4, 10 - sy, look.trousers);
    rect(ctx, bx - 2, -3 + sy, 5, 3, '#1b2b32');
    rect(ctx, bx - 2, -3 + sy, 3, 1, '#77818a');
    rect(ctx, bx, -10 + sy, 1, 5, color(look.trousers, 17));
  }
  if (look.cloak) {
    poly(
      ctx,
      [
        [-6, -28 - bob],
        [5, -28 - bob],
        [8 + step, -7],
        [3, -5],
        [-1, -7],
        [-6, -5],
        [-8 - step, -8],
      ],
      color(cloak, -17),
    );
    poly(
      ctx,
      [
        [-5, -27 - bob],
        [4, -27 - bob],
        [6 + step, -8],
        [1, -10],
        [-5, -8],
      ],
      cloak,
    );
    line(ctx, -4, -25 - bob, -6, -10, color(cloak, 17));
    line(ctx, 1, -24, 3, -9, color(cloak, -12));
  }
  const arm = (s: number, front: boolean) => {
    const ax = side ? east * (front ? 5 : -4) : s * 6,
      sway = moving ? step * s * 2 : 0,
      lift = attack > 0 && front ? -8 * Math.sin(attack * Math.PI) : 0;
    line(
      ctx,
      ax,
      -25 - bob,
      ax + (front ? attack * 5 : 0),
      -16 + sway + lift,
      color(coat, front ? 9 : -15),
      3,
    );
    rect(ctx, ax, -15 + sway + lift, 3, 3, look.skin);
    rect(ctx, ax, -18 + sway + lift, 3, 2, '#9b947d');
  };
  arm(-1, false);
  poly(
    ctx,
    [
      [-5, -27 - bob],
      [5, -27 - bob],
      [6, -12],
      [2, -10],
      [-5, -12],
    ],
    coat,
  );
  rect(ctx, -4, -25 - bob, 2, 13, color(coat, 17));
  rect(ctx, 3, -25 - bob, 2, 12, color(coat, -18));
  rect(ctx, -5, -16, 11, 2, '#2c3738');
  rect(ctx, 0, -16, 2, 2, '#d2b781');
  if (face !== 0) {
    line(ctx, -2, -25 - bob, 0, -17, look.trim);
    line(ctx, 2, -25 - bob, 0, -17, color(look.trim, 20));
    rect(ctx, 0, -22, 1, 1, '#e1d3a6');
  }
  // Neck, skull silhouette, hair/hood and a readable face at only a few pixels.
  rect(ctx, -2, -29 - bob, 4, 3, color(look.skin, -15));
  poly(
    ctx,
    [
      [-5, -34 - bob],
      [-3, -38 - bob],
      [2, -39 - bob],
      [5, -35 - bob],
      [5, -29 - bob],
      [2, -27 - bob],
      [-3, -28 - bob],
      [-5, -31 - bob],
    ],
    '#20313a',
  );
  rect(ctx, -4, -34 - bob, 8, 6, face === 0 ? look.hair : look.skin);
  rect(ctx, -3, -36 - bob, 6, 2, look.hair);
  if (face !== 0) {
    const eyesX = side ? east * 2 : -2;
    rect(ctx, eyesX, -32 - bob, 1, 1, '#223441');
    if (!side) rect(ctx, 2, -32 - bob, 1, 1, '#223441');
    rect(ctx, side ? east * 3 : 0, -30 - bob, 1, 1, '#eed7b6');
    rect(ctx, -2, -28 - bob, 5, 1, color(look.skin, -26));
  }
  if (look.hat === 1 || look.hat === 3) {
    poly(
      ctx,
      [
        [-7, -29 - bob],
        [-6, -36 - bob],
        [-2, -41 - bob],
        [3, -40 - bob],
        [7, -35 - bob],
        [6, -28 - bob],
        [4, -30 - bob],
        [3, -35 - bob],
        [-3, -35 - bob],
        [-4, -29 - bob],
      ],
      color(cloak, 2),
    );
    line(ctx, -5, -36 - bob, -2, -39 - bob, color(cloak, 28));
  } else if (look.hat === 2) {
    rect(ctx, -5, -36 - bob, 10, 3, color(look.trim, -15));
    rect(ctx, -3, -39 - bob, 7, 4, look.trim);
    rect(ctx, -6, -34 - bob, 13, 1, '#b2b1a0');
  } else if (look.hat === 4) {
    poly(
      ctx,
      [
        [-5, -35 - bob],
        [-3, -39 - bob],
        [3, -39 - bob],
        [6, -35 - bob],
      ],
      '#7a8e98',
    );
    rect(ctx, -5, -35 - bob, 11, 2, '#bbc7c9');
  }
  arm(1, true);
  const wx = side ? east * 7 : 8,
    hand = -14 + step * 2 - attack * 7;
  if (look.weapon === 'staff') {
    line(ctx, wx, -3, wx + attack * 10, -36 + attack * 5, '#8c7755', 2);
    rect(ctx, wx, -34, 1, 27, '#c1ac7e');
    poly(
      ctx,
      [
        [wx - 2, -35],
        [wx + 1, -40],
        [wx + 4, -35],
        [wx + 1, -31],
      ],
      '#adc7b5',
    );
    rect(ctx, wx, -38, 2, 3, '#d6e7c5');
  } else if (look.weapon === 'sword') {
    const tx = wx + attack * 17,
      ty = hand - 15 + attack * 4;
    line(ctx, wx, hand, tx, ty, '#758d9c', 3);
    line(ctx, wx, hand, tx, ty, '#d4e4e8');
    line(ctx, wx - 3, hand - 1, wx + 4, hand + 1, '#c2a56b', 2);
  } else if (look.weapon === 'bow') {
    line(ctx, wx, -28, wx + 5, -19, '#b29a76', 2);
    line(ctx, wx + 5, -19, wx, -8, '#b29a76', 2);
    line(ctx, wx, -28, wx, -8, '#c1c3b0');
  }
  ctx.restore();
}
