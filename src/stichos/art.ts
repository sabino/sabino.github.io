import {
  makeRegionalGround,
  makeRegionalTree,
  makeRegionalRock,
  regionalGroundColor,
} from './biome-art.ts';
import { random, deriveSeed } from '../procedural/random.ts';
import type {
  Appearance,
  ArchitecturalCulture,
  BuildingKind,
  PropKind,
  Terrain,
  Tile,
  TreeForm,
  RockMaterial,
} from './types.ts';
import { drawWeapon, weaponGenome } from './equipment.ts';
import { drawArtifact } from './artifact-art.ts';
import { humanoidGenome, tailoringGenome } from './humanoid-genome.ts';
import { drawLaborTool } from './labor-art.ts';
import { drawPlant } from './botany.ts';
import type { PlantKind } from './botany.ts';
import { actionMotion } from './actor-motion.ts';
import type { HumanoidAction } from './actor-motion.ts';

export interface Sprite {
  image: HTMLCanvasElement;
  x: number;
  y: number;
}
export type CivilBuildingKind = Exclude<BuildingKind, 'church'>;
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

/** Footprint-sized civic architecture, baked once by the renderer's bounded roof cache.
 * All archetypes share a south entrance at the real center door. Roofs and bays are
 * assembled from seeded parts; their overhangs never imply additional walkable rooms.
 */
export function makeCivilBuilding(
  kind: CivilBuildingKind,
  seed: number,
  columns: number,
  rows: number,
): Sprite {
  const rng = random(deriveSeed(seed, kind, 'civil-architecture'));
  const w = columns * 32,
    h = rows * 32,
    x = 32,
    y = 128,
    front = y + h,
    middle = x + w / 2,
    facade = { house: 57, inn: 78, workshop: 53, greenhouse: 43, storehouse: 46, hall: 69 }[kind],
    eave = front - facade,
    back = y - 30,
    rise = kind === 'storehouse' ? 22 : kind === 'greenhouse' ? 29 : 32 + Math.floor(rng() * 13),
    ridge = middle + (kind === 'workshop' ? -w * 0.16 : (rng() - 0.5) * w * 0.15),
    wood = ['#526268', '#626468', '#575c68', '#655e5a'][Math.floor(rng() * 4)],
    trim = ['#718d93', '#898573', '#927c67', '#657e8b'][Math.floor(rng() * 4)],
    warm = kind === 'inn' || kind === 'house' || kind === 'hall';

  return image(
    w + 64,
    h + 151,
    (ctx) => {
      const clip = (points: number[][], paint: () => void) => {
        ctx.save();
        ctx.beginPath();
        points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.clip();
        paint();
        ctx.restore();
      };
      const masonry = (left: number, top: number, width: number, height: number, brick = false) => {
        rect(ctx, left, top, width, height, '#2a3e50');
        const blockW = brick ? 13 : 19,
          blockH = brick ? 6 : 9;
        for (let row = 0; row < height / blockH; row++)
          for (let col = -1; col < width / blockW; col++) {
            const px = left + col * blockW + ((row % 2) * blockW) / 2,
              py = top + row * blockH,
              start = Math.max(left, px + 1),
              end = Math.min(left + width, px + blockW - 1);
            if (end <= start) continue;
            const tone = brick
              ? ['#635b5b', '#6c6260', '#5a555b', '#736762'][Math.floor(rng() * 4)]
              : ['#4c6374', '#536c7c', '#496071', '#5b7180'][Math.floor(rng() * 4)];
            rect(ctx, start, py + 1, end - start, Math.min(blockH - 1, top + height - py), tone);
            if (rng() > 0.35)
              rect(ctx, start + 1, py + 1, Math.max(1, end - start - 3), 1, color(tone, 10));
          }
      };
      const boards = (
        left: number,
        top: number,
        width: number,
        height: number,
        vertical = false,
      ) => {
        rect(ctx, left, top, width, height, color(wood, -20));
        for (let k = 0; k < (vertical ? width : height); k += 7) {
          const tone = color(wood, Math.floor(rng() * 14) - 7);
          rect(
            ctx,
            left + (vertical ? k : 0),
            top + (vertical ? 0 : k),
            vertical ? Math.min(6, width - k) : width,
            vertical ? height : Math.min(6, height - k),
            tone,
          );
          if (vertical)
            line(ctx, left + k + 1, top + 4, left + k + 1, top + height - 5, color(tone, 9));
        }
      };
      const pane = (
        cx: number,
        foot: number,
        width: number,
        height: number,
        amber = warm,
        shutters = false,
      ) => {
        rect(ctx, cx - width / 2 - 4, foot - height - 4, width + 8, height + 8, '#283d4e');
        rect(ctx, cx - width / 2 - 2, foot - height - 2, width + 4, height + 4, trim);
        rect(ctx, cx - width / 2, foot - height, width, height, amber ? '#74644d' : '#416b79');
        for (let py = 0; py < height - 2; py += 10)
          for (let px = 0; px < width - 2; px += 9) {
            rect(
              ctx,
              cx - width / 2 + px + 1,
              foot - height + py + 1,
              Math.min(7, width - px - 2),
              Math.min(8, height - py - 2),
              amber
                ? ['#c6a573', '#d6b786', '#9e885f'][Math.floor(rng() * 3)]
                : ['#709596', '#557f89', '#91b5b5'][Math.floor(rng() * 3)],
            );
          }
        rect(ctx, cx - 1, foot - height, 2, height, '#43575d');
        rect(ctx, cx - width / 2, foot - height / 2, width, 2, '#43575d');
        rect(ctx, cx - width / 2 - 5, foot + 2, width + 10, 3, '#9fadb4');
        rect(ctx, cx - width / 2 - 4, foot + 1, width + 7, 2, '#d1dfe7');
        if (shutters)
          for (const side of [-1, 1]) {
            const sx = cx + side * (width / 2 + 8) - 4;
            boards(sx, foot - height, 8, height, true);
            rect(ctx, sx, foot - 7, 8, 2, '#89928b');
            rect(ctx, sx, foot - height + 5, 8, 2, '#89928b');
          }
      };
      const chimney = (cx: number, foot: number, height: number, industrial = false) => {
        const cw = industrial ? 23 : 16;
        poly(
          ctx,
          [
            [cx + cw - 3, foot],
            [cx + cw + 6, foot - 3],
            [cx + cw + 6, foot - height],
            [cx + cw - 3, foot - height + 3],
          ],
          '#324655',
        );
        masonry(cx, foot - height, cw, height, industrial);
        rect(ctx, cx - 3, foot - height - 2, cw + 6, 5, '#71838e');
        rect(ctx, cx - 2, foot - height - 3, cw + 4, 2, '#d1e0e9');
        rect(ctx, cx + 3, foot - height - 3, cw - 6, 2, '#263b4a');
        if (industrial) {
          rect(ctx, cx - 1, foot - height + 12, cw + 2, 3, '#354953');
          rect(ctx, cx - 1, foot - height + 29, cw + 2, 3, '#354953');
        }
      };
      const slate = (points: number[][], tint: string, metal = false) => {
        poly(ctx, points, tint);
        clip(points, () => {
          for (let py = back - rise - 12, row = 0; py < eave + 8; py += metal ? 20 : 7, row++)
            for (let px = x - 14; px < x + w + 16; px += metal ? 31 : 11) {
              const xx = px + (row % 2) * (metal ? 0 : 5),
                tone = color(tint, Math.floor(rng() * 10) - 5);
              rect(ctx, xx, py, metal ? 29 : 10, metal ? 18 : 6, tone);
              rect(ctx, xx + 1, py, metal ? 27 : 8, 1, color(tone, 12));
              if (metal) rect(ctx, xx, py, 1, 19, color(tone, -15));
            }
          for (let i = 0; i < w / 27; i++) {
            const sx = x + rng() * w,
              sy = back - rise + rng() * (eave - back + rise),
              span = 23 + rng() * 36;
            poly(
              ctx,
              [
                [sx - 4, sy + 6],
                [sx + 7, sy],
                [sx + span * 0.5, sy - 2],
                [sx + span, sy + 3],
                [sx + span - 4, sy + 10],
                [sx + 10, sy + 13],
              ],
              '#9eb6ce',
            );
            poly(
              ctx,
              [
                [sx - 2, sy + 5],
                [sx + 8, sy],
                [sx + span * 0.5, sy - 2],
                [sx + span, sy + 3],
                [sx + span - 7, sy + 7],
                [sx + 10, sy + 8],
              ],
              '#d0e0ec',
            );
          }
        });
      };
      const lamp = (cx: number, foot: number) => {
        rect(ctx, cx - 2, foot - 22, 3, 24, '#273d4c');
        line(ctx, cx - 1, foot - 21, cx + 9, foot - 21, '#84938f', 2);
        rect(ctx, cx + 4, foot - 19, 9, 13, '#283e4c');
        rect(ctx, cx + 6, foot - 17, 5, 8, '#d0ad70');
        rect(ctx, cx + 7, foot - 16, 2, 6, '#f0ce8c');
        rect(ctx, cx + 3, foot - 21, 11, 3, '#9eadae');
      };

      // A dark foot/recess follows the real rectangular wall, with a snowy plinth.
      rect(ctx, x + 3, front - 4, w + 8, 11, '#324a6182');
      masonry(x, y - 30, w, h + 30, kind === 'workshop');
      if (kind === 'inn' || kind === 'house' || kind === 'storehouse') {
        boards(x + 3, eave, w - 6, facade - 12, kind === 'storehouse');
        for (let bx = x + 4; bx < x + w; bx += kind === 'inn' ? 42 : 48) {
          rect(ctx, bx, eave, 5, facade - 10, '#2c424b');
          rect(ctx, bx + 1, eave, 2, facade - 12, trim);
          if (kind === 'inn' || kind === 'storehouse') {
            line(ctx, bx + 4, front - 16, Math.min(bx + 40, x + w - 4), eave + 4, '#344951', 3);
          }
        }
        rect(ctx, x, front - 14, w, 4, '#344a57');
      }

      if (kind === 'greenhouse') {
        // Visible benches and growth beneath individual translucent roof panes.
        rect(ctx, x + 5, back, w - 10, front - back - 13, '#35545a');
        for (let bx = x + 18; bx < x + w - 12; bx += 38)
          for (let by = back + 28; by < front - 24; by += 48) {
            rect(ctx, bx - 9, by - 7, 22, 16, '#776f5d');
            rect(ctx, bx - 8, by - 6, 20, 10, '#253e42');
            drawPlant(
              ctx,
              deriveSeed(seed, bx, by),
              rng() > 0.5 ? 'cequin' : 'heartleaf',
              bx + 3,
              by + 3,
              0.45,
            );
          }
        const glassShape = [
          [x - 5, back + 5],
          [ridge, back - rise],
          [x + w + 5, back + 5],
          [x + w + 5, eave],
          [ridge, eave - rise],
          [x - 5, eave],
        ];
        poly(ctx, glassShape, '#639a9c68');
        clip(glassShape, () => {
          for (let px = x - 4; px <= x + w + 5; px += 22) {
            line(ctx, px, back - rise, px, eave + 5, '#314d59', 3);
            line(ctx, px + 1, back - rise, px + 1, eave + 4, '#a5bfc4');
            for (let py = back - rise; py < eave; py += 34) {
              line(ctx, px + 5, py + 4, px + 16, py + 12, '#d5ece32e', 3);
              rect(ctx, px + 3, py + 1, 17, 2, '#a5c6c152');
            }
          }
          for (let py = back; py < eave + 10; py += 34) {
            line(ctx, x - 6, py, ridge, py - rise, '#4d777f', 3);
            line(ctx, ridge, py - rise, x + w + 6, py, '#3b6470', 3);
          }
        });
        for (const side of [-1, 1]) {
          const edge = side < 0 ? x - 5 : x + w + 5;
          line(ctx, edge, back + 5, edge, eave, '#b9d0d6', 4);
          line(ctx, edge, eave, ridge, eave - rise, '#bed3d6', 4);
        }
        line(ctx, ridge, back - rise, ridge, eave - rise, '#d4e2e5', 4);
        for (let cx = x + 21; cx < x + w - 10; cx += 30)
          if (Math.abs(cx - middle) > 27) pane(cx, front - 12, 21, 30, false);
        // Copper gutter and its drain are visually attached to the true side wall.
        rect(ctx, x + w - 4, eave + 2, 4, facade - 2, '#9b8e72');
        rect(ctx, x + w - 6, front - 9, 7, 3, '#c0baa1');
      } else {
        // Gable and hip layouts vary structurally; none reuse the cathedral facade.
        const leftEdge = x - 7,
          rightEdge = x + w + 7;
        if (kind === 'storehouse') {
          slate(
            [
              [leftEdge, back + 6],
              [x + 24, back - rise],
              [x + w - 24, back - rise],
              [rightEdge, back + 6],
              [rightEdge, eave],
              [x + w - 24, eave - rise],
              [x + 24, eave - rise],
              [leftEdge, eave],
            ],
            '#40586b',
          );
          slate(
            [
              [leftEdge, eave],
              [x + 24, eave - rise],
              [x + w - 24, eave - rise],
              [rightEdge, eave],
            ],
            '#354c5e',
          );
          line(ctx, x + 24, back - rise, x + w - 24, back - rise, '#d3e0e9', 4);
          for (const xx of [x + 25, x + w - 25])
            line(ctx, xx, back - rise, xx, eave - rise, '#8199b0', 2);
        } else {
          poly(
            ctx,
            [
              [leftEdge, eave],
              [ridge, eave - rise],
              [rightEdge, eave],
            ],
            color(wood, 4),
          );
          slate(
            [
              [leftEdge, back + 6],
              [ridge, back - rise],
              [ridge, eave - rise],
              [leftEdge, eave],
            ],
            '#476075',
            kind === 'workshop',
          );
          slate(
            [
              [ridge, back - rise],
              [rightEdge, back + 6],
              [rightEdge, eave],
              [ridge, eave - rise],
            ],
            '#344f65',
            kind === 'workshop',
          );
          line(ctx, ridge, back - rise, ridge, eave - rise, '#cddde9', 4);
          line(ctx, leftEdge, eave, ridge, eave - rise, '#bfcfdd', 4);
          line(ctx, ridge, eave - rise, rightEdge, eave, '#9db4c9', 4);
        }
        rect(ctx, x - 8, eave, w + 16, 5, '#263e53');
        rect(ctx, x - 7, eave - 2, w + 14, 2, '#bfcedc');

        if (kind === 'inn') {
          for (const side of [-1, 1]) {
            const cx = middle + side * w * 0.3,
              foot = eave - 15;
            boards(cx - 20, foot - 26, 40, 29);
            poly(
              ctx,
              [
                [cx - 27, foot - 24],
                [cx, foot - 48],
                [cx + 27, foot - 24],
              ],
              '#354c60',
            );
            line(ctx, cx - 26, foot - 24, cx, foot - 47, '#c7d7e2', 3);
            line(ctx, cx, foot - 47, cx + 26, foot - 24, '#aebfd0', 3);
            pane(cx, foot - 3, 21, 22, true);
            chimney(x + (side < 0 ? w * 0.17 : w * 0.8), back + 29, 44);
          }
          for (let cx = x + 24; cx < x + w - 12; cx += 42)
            if (Math.abs(cx - middle) > 33) pane(cx, front - 20, 23, 35, true, true);
          // A suspended crescent-cup sign is readable without text or invented NPCs.
          line(ctx, middle + 31, front - 64, middle + 63, front - 64, '#ae9f78', 3);
          line(ctx, middle + 39, front - 61, middle + 39, front - 53, '#b6a579', 2);
          rect(ctx, middle + 32, front - 53, 29, 22, '#293f48');
          rect(ctx, middle + 33, front - 52, 27, 20, '#66776d');
          rect(ctx, middle + 42, front - 47, 11, 9, '#d0b984');
          rect(ctx, middle + 51, front - 45, 5, 5, '#d0b984');
          rect(ctx, middle + 52, front - 44, 2, 3, '#66776d');
          rect(ctx, middle + 39, front - 36, 17, 2, '#c6b585');
        } else if (kind === 'workshop') {
          // Two raised sawtooth skylights and a brick stack distinguish the workshop.
          for (let k = 0; k < 2; k++) {
            const sx = x + w * (0.48 + k * 0.24),
              sy = back + (eave - back) * 0.5;
            poly(
              ctx,
              [
                [sx - 13, sy + 12],
                [sx - 13, sy - 12],
                [sx + 18, sy + 7],
                [sx + 18, sy + 16],
              ],
              '#293f50',
            );
            rect(ctx, sx - 11, sy - 8, 7, 18, '#7c9fa4');
            line(ctx, sx - 13, sy - 13, sx + 19, sy + 7, '#c8d9e2', 3);
          }
          chimney(x + w * 0.18, back + 36, 57, true);
          pane(x + w * 0.8, front - 17, Math.min(39, w * 0.22), 24, false);
          boards(middle - 35, front - 43, 70, 43, true);
          for (const dx of [-33, 0, 33]) rect(ctx, middle + dx, front - 43, 3, 43, '#273d47');
          line(ctx, middle - 31, front - 6, middle - 3, front - 38, '#a0967b', 3);
          line(ctx, middle + 4, front - 38, middle + 31, front - 6, '#a0967b', 3);
          rect(ctx, middle - 42, front - 49, 85, 5, '#87989d');
          // Mounted tool emblem, a small hammer above the real loading entrance.
          line(ctx, middle + 4, front - 64, middle - 7, front - 52, '#b5a477', 3);
          poly(
            ctx,
            [
              [middle - 3, front - 67],
              [middle + 1, front - 71],
              [middle + 13, front - 60],
              [middle + 8, front - 55],
            ],
            '#a8b9bb',
          );
        } else if (kind === 'storehouse') {
          for (const side of [-1, 1]) {
            const cx = middle + side * w * 0.32;
            rect(ctx, cx - 15, front - 38, 30, 20, '#273e49');
            for (let slat = 0; slat < 5; slat++)
              rect(ctx, cx - 13, front - 36 + slat * 3, 26, 1, '#819497');
          }
          boards(middle - 34, front - 40, 68, 40, true);
          for (const side of [-1, 1]) {
            line(ctx, middle + side * 30, front - 4, middle + side * 4, front - 35, '#a79f80', 3);
            rect(ctx, middle + side * 7, front - 20, 3, 7, '#273d48');
          }
          rect(ctx, middle - 40, front - 45, 80, 5, '#a5b6bd');
          rect(ctx, middle - 36, front - 47, 72, 2, '#d5e0e7');
          // Small louvered loft, with hoist directly over the existing doorway.
          boards(middle - 17, eave - 27, 34, 24, true);
          rect(ctx, middle - 20, eave - 29, 40, 3, '#a5b6bd');
          line(ctx, middle, eave - 25, middle, eave - 9, '#b3a383', 2);
        } else if (kind === 'hall') {
          // A compact civic pediment and clock medallion, without chapel wings or spire.
          const foot = eave + 4;
          poly(
            ctx,
            [
              [middle - 42, foot],
              [middle, foot - 34],
              [middle + 42, foot],
            ],
            '#566e7c',
          );
          line(ctx, middle - 43, foot, middle, foot - 35, '#d0dce4', 4);
          line(ctx, middle, foot - 35, middle + 43, foot, '#b9cbd7', 4);
          for (let py = -8; py <= 8; py++)
            for (let px = -8; px <= 8; px++)
              if (px * px + py * py <= 64)
                rect(
                  ctx,
                  middle + px,
                  foot - 13 + py,
                  1,
                  1,
                  px * px + py * py > 38 ? '#b4aa88' : '#2d4956',
                );
          line(ctx, middle, foot - 13, middle, foot - 19, '#d5c395');
          line(ctx, middle, foot - 13, middle + 5, foot - 11, '#d5c395');
          for (const side of [-1, 1]) {
            pane(middle + side * w * 0.3, front - 19, 26, 37, true);
            const bx = middle + side * 37;
            rect(ctx, bx - 3, front - 57, 7, 56, '#7d919d');
            rect(ctx, bx - 5, front - 58, 11, 3, '#c4d3dc');
          }
          chimney(x + w * 0.78, back + 26, 31);
        } else {
          // Domestic gable: shuttered windows, asymmetric chimney and shallow porch.
          for (const side of [-1, 1])
            pane(middle + side * w * 0.31, front - 18, 22, 28, true, true);
          chimney(x + w * (0.18 + rng() * 0.6), back + 27, 35 + Math.floor(rng() * 9));
          const dormerX = middle + (rng() > 0.5 ? -1 : 1) * w * 0.15;
          boards(dormerX - 16, eave - 24, 32, 23);
          poly(
            ctx,
            [
              [dormerX - 21, eave - 23],
              [dormerX, eave - 41],
              [dormerX + 21, eave - 23],
            ],
            '#3c5367',
          );
          line(ctx, dormerX - 21, eave - 23, dormerX, eave - 42, '#cfdee7', 3);
          line(ctx, dormerX, eave - 42, dormerX + 21, eave - 23, '#afc4d5', 3);
          pane(dormerX, eave - 3, 17, 17, true);
        }
      }

      // Carved surround leaves the actual door prop in control of open/closed state.
      const broad = kind === 'workshop' || kind === 'storehouse';
      if (!broad) {
        const dh = kind === 'inn' || kind === 'hall' ? 48 : 43;
        rect(ctx, middle - 21, front - dh, 42, dh, '#273d4b');
        rect(ctx, middle - 23, front - dh - 3, 46, 4, trim);
        rect(ctx, middle - 22, front - dh, 4, dh, trim);
        rect(ctx, middle + 18, front - dh, 4, dh, color(trim, -15));
        line(ctx, middle - 25, front - dh - 4, middle, front - dh - 13, '#c8d8e2', 3);
        line(ctx, middle, front - dh - 13, middle + 25, front - dh - 4, '#adbfce', 3);
      }
      for (const side of [-1, 1]) {
        rect(ctx, side < 0 ? x : x + w - 4, eave + 4, 4, facade - 4, '#7f939f');
        rect(ctx, side < 0 ? x + 1 : x + w - 3, eave + 4, 1, facade - 7, '#b0c0c9');
      }
      if (kind !== 'greenhouse' && kind !== 'storehouse') lamp(middle - 36, front - 24);
      rect(ctx, x - 2, front - 3, w + 4, 3, '#9eb2c5');
      rect(ctx, x - 2, front - 4, w + 2, 1, '#cedde7');
      for (let i = 0; i < columns * 2; i++) {
        const sx = x + rng() * w;
        rect(ctx, sx, eave - 3, 4 + rng() * 12, 2 + rng() * 3, '#d0dfe9');
        if (rng() > 0.6) rect(ctx, sx + 3, eave, 1, 3 + rng() * 5, '#b9cede');
      }
    },
    x,
    y,
  );
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
    // A dense 1600px view at minimum zoom can contain 480 distinct plants/trees.
    // Keep a whole visible set resident so full-seed art never regenerates each frame.
    while (this.cache.size > 768) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
  get cacheSize() {
    return this.cache.size;
  }
  ground(tile: Tile): Sprite {
    if (tile.ecology)
      return this.get(
        `regional-ground:${tile.terrain}:${tile.seed % 32}:${regionalGroundColor(tile)}:${tile.architecture?.wallMaterial}:${!!tile.building}`,
        () => makeRegionalGround(tile),
      );
    const terrain = tile.terrain === 'wall' ? 'floor' : tile.terrain;
    const variant = tile.seed % 16;
    return this.get(`ground:${terrain}:${variant}:${!!tile.building}:${!!tile.site}`, () =>
      image(
        32,
        32,
        (ctx) => {
          const rng = random(deriveSeed(variant, terrain, Number(!!tile.building)));
          const choose = (a: string[]) => a[Math.floor(rng() * a.length)];
          const base: Record<Terrain, string> = {
            sand: '#b3a173',
            mud: '#54645c',
            basalt: '#4c535b',
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
          if (tile.site && terrain === 'floor') {
            rect(ctx, 0, 0, 32, 32, '#283e53');
            for (let row = 0; row < 2; row++)
              for (let col = 0; col < 2; col++) {
                const x = col * 16,
                  y = row * 16,
                  c = ['#4c6173', '#526879', '#455e73'][Math.floor(rng() * 3)];
                poly(
                  ctx,
                  [
                    [x + 1, y + 2],
                    [x + 13, y + 1],
                    [x + 15, y + 4],
                    [x + 14, y + 14],
                    [x + 3, y + 15],
                    [x + 1, y + 11],
                  ],
                  c,
                );
                line(ctx, x + 3, y + 2, x + 12, y + 2, color(c, 10));
                for (let i = 0; i < 7; i++)
                  rect(
                    ctx,
                    x + 2 + rng() * 10,
                    y + 3 + rng() * 10,
                    1 + rng() * 2,
                    1,
                    rng() > 0.5 ? color(c, 7) : color(c, -8),
                  );
              }
            if (variant % 4 === 0) {
              line(ctx, 7, 24, 14, 18, '#2c4a61');
              line(ctx, 14, 18, 18, 20, '#29465e');
            }
            if (variant % 5 === 0) {
              rect(ctx, 6, 7, 2, 1, '#789a90');
              rect(ctx, 8, 9, 1, 2, '#80a499');
            }
          } else if (terrain === 'road' || terrain === 'floor') {
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

  prop(
    kind: PropKind,
    seed: number,
    opened = false,
    tint = '#687e80',
    doorStyle?: CivilBuildingKind | 'church',
    stockpile = false,
    vegetation?: TreeForm,
    mineral?: RockMaterial,
    culture?: ArchitecturalCulture,
  ): Sprite {
    if (kind === 'door' && culture && (culture.technology ?? 0) > 0.57)
      return this.get(
        `regional-door:${seed}:${opened}:${culture.wallColor}:${culture.accentColor}`,
        () =>
          image(
            42,
            62,
            (ctx) => {
              const rim = color(culture.wallColor, -28),
                metal = color(culture.wallColor, -9),
                accent = color(culture.accentColor, 32);
              rect(ctx, 4, 7, 34, 54, rim);
              rect(ctx, 5, 8, 32, 51, '#142936');
              for (const side of [-1, 1]) {
                const xx = 21 + side * (opened ? 16 : 8) - 7;
                rect(ctx, xx, 11, 14, 47, metal);
                rect(ctx, xx + 1, 12, 12, 2, color(metal, 27));
                rect(ctx, xx + 2, 17, 10, 13, '#385667');
                rect(ctx, xx + 3, 18, 8, 1, '#91b6bb');
                rect(ctx, xx + 2, 35, 10, 16, color(metal, -15));
                line(ctx, xx + 3, 36, xx + 9, 46, color(metal, 5));
                rect(ctx, xx + 3, 52, 8, 2, accent);
              }
              for (const x of [3, 37]) {
                rect(ctx, x, 7, 3, 51, rim);
                rect(ctx, x, 11, 1, 39, accent);
              }
              rect(ctx, 10, 4, 22, 4, rim);
              rect(ctx, 14, 5, 14, 1, accent);
              rect(ctx, 1, 60, 40, 2, color(metal, 15));
            },
            21,
            61,
          ),
      );
    if (kind === 'pine' && vegetation)
      return this.get(`regional-tree:${vegetation}:${seed}`, () =>
        makeRegionalTree(vegetation, seed),
      );
    if (kind === 'rock' && mineral && !stockpile)
      return this.get(`regional-rock:${mineral}:${seed}`, () => makeRegionalRock(mineral, seed));
    if (kind === 'rock' && stockpile)
      return this.get(`ore-stock:${seed >>> 0}`, () =>
        image(
          48,
          48,
          (ctx) => {
            const r = random(deriveSeed(seed, 'mineral-workyard'));
            rect(ctx, 7, 32, 34, 8, '#31414a');
            for (let row = 0; row < 2; row++)
              for (let n = 0; n < 3; n++) {
                const x = 11 + n * 10 + (row ? 4 : 0),
                  y = 31 - row * 8,
                  w = 4 + Math.floor(r() * 3);
                poly(
                  ctx,
                  [
                    [x - w, y],
                    [x - w + 1, y - 7],
                    [x + 1, y - 10],
                    [x + w, y - 6],
                    [x + w - 1, y + 1],
                  ],
                  '#667d8b',
                );
                poly(
                  ctx,
                  [
                    [x - w + 1, y - 7],
                    [x + 1, y - 10],
                    [x + 2, y - 4],
                    [x - 2, y - 2],
                  ],
                  '#a0b6c0',
                );
                line(ctx, x + 1, y - 8, x + w - 1, y - 3, '#c9c4a0');
              }
            rect(ctx, 5, 35, 38, 3, '#735f4b');
            rect(ctx, 5, 35, 38, 1, '#9b8c70');
            for (const x of [7, 37]) {
              rect(ctx, x, 29, 3, 14, '#4a4640');
              rect(ctx, x, 29, 1, 12, '#9a8b71');
            }
            rect(ctx, 9, 40, 30, 2, '#627681');
          },
          24,
          42,
        ),
      );
    if (kind === 'cequin' || kind === 'heartleaf' || kind === 'emberroot' || kind === 'mushroom')
      return this.get(`plant:${kind}:${seed >>> 0}`, () => this.herb(kind, seed));
    // Organic silhouettes retain their full coordinate seed; the bounded sprite
    // cache controls memory without collapsing the forest into 24 repeated trees.
    const variant = kind === 'pine' || kind === 'rock' ? seed >>> 0 : seed % 12;
    return this.get(`prop:${kind}:${variant}:${opened}:${tint}:${doorStyle ?? 'legacy'}`, () => {
      const rng = random(deriveSeed(variant, kind));
      if (kind === 'pine') return this.pine(rng);
      if (kind === 'rock') return this.rock(rng);
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
          } else if (kind === 'door' && doorStyle && doorStyle !== 'church') {
            const timber = doorStyle === 'workshop' || doorStyle === 'storehouse',
              glass = doorStyle === 'greenhouse',
              base = glass ? '#4f7477' : timber ? '#5b605c' : '#415159';
            if (opened) {
              poly(
                ctx,
                [
                  [18, 87],
                  [18, 46],
                  [24, 50],
                  [24, 83],
                ],
                base,
              );
              line(ctx, 20, 49, 20, 83, '#8b9d96');
              rect(ctx, 22, 70, 2, 3, '#d2ba80');
            } else {
              rect(ctx, 18, 44, 29, 44, '#243a46');
              for (let px = 20; px < 45; px += 5) {
                rect(ctx, px, 46, 4, 39, color(base, Math.floor(rng() * 14) - 7));
                line(ctx, px, 48, px, 84, color(base, 16));
              }
              if (glass || doorStyle === 'inn') {
                rect(ctx, 22, 49, 21, glass ? 26 : 15, glass ? '#8eb8b5' : '#b3996a');
                rect(ctx, 23, 51, 7, glass ? 10 : 11, glass ? '#67969b' : '#d1b880');
                rect(ctx, 33, 51, 7, glass ? 10 : 11, glass ? '#afd0c7' : '#c9ac73');
                rect(ctx, 31, 48, 2, glass ? 29 : 17, '#465e61');
                if (glass) rect(ctx, 21, 62, 22, 2, '#465e61');
              }
              if (timber) {
                line(ctx, 21, 81, 42, 49, '#97a196', 3);
                rect(ctx, 20, 51, 25, 3, '#344750');
                rect(ctx, 20, 77, 25, 3, '#344750');
              } else {
                rect(ctx, 21, 80, 24, 2, '#84938b');
                if (doorStyle === 'hall') {
                  poly(
                    ctx,
                    [
                      [32, 51],
                      [38, 58],
                      [32, 66],
                      [26, 58],
                    ],
                    '#b6ac86',
                  );
                  rect(ctx, 31, 54, 2, 9, '#526e70');
                }
              }
              rect(ctx, 40, 68, 3, 5, '#c6b080');
              rect(ctx, 41, 69, 1, 3, '#344b52');
              rect(ctx, 18, 86, 29, 2, '#aabbbf');
            }
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
              for (let x = 21; x < 44; x += 3) {
                rect(ctx, x, 57, 2, 29, x % 2 ? '#2b3e48' : '#32454e');
                rect(ctx, x, 58, 1, 28, '#4b5b5b');
              }
              for (const side of [-1, 1]) {
                const px = 32 + side * 6;
                poly(
                  ctx,
                  [
                    [px - 4, 81],
                    [px - 4, 57],
                    [px, 49],
                    [px + 4, 57],
                    [px + 4, 81],
                  ],
                  '#172c38',
                );
                line(ctx, px - 4, 57, px, 49, '#65716a');
                line(ctx, px, 49, px + 4, 57, '#4e635f');
                line(ctx, px, 54, px, 79, '#6a7668');
                for (let yy = 59; yy < 78; yy += 5)
                  for (const s of [-1, 1]) line(ctx, px, yy + 2, px + s * 3, yy - 1, '#77816d');
              }
              rect(ctx, 31, 49, 2, 38, '#101e29');
              for (let y = 65; y < 86; y += 12) {
                rect(ctx, 21, y, 23, 1, '#263b43');
                for (let x = 22; x < 44; x += 3) rect(ctx, x, y, 1, 1, '#aba582');
              }
              for (const side of [-1, 1]) {
                rect(ctx, 32 + side * 3, 72, 2, 3, '#a99664');
                rect(ctx, 32 + side * 3, 73, 1, 1, '#283e45');
              }
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
            if (bench) {
              for (const x of [10, 52]) {
                rect(ctx, x, foot - 62, 2, 58, '#4d5148');
                rect(ctx, x, foot - 60, 1, 53, '#b2a37c');
              }
              rect(ctx, 9, foot - 57, 47, 2, '#605c49');
              poly(
                ctx,
                [
                  [7, foot - 57],
                  [17, foot - 72],
                  [47, foot - 69],
                  [57, foot - 55],
                  [51, foot - 49],
                  [41, foot - 53],
                  [29, foot - 49],
                  [18, foot - 53],
                  [9, foot - 49],
                ],
                '#536569',
              );
              poly(
                ctx,
                [
                  [7, foot - 57],
                  [17, foot - 72],
                  [47, foot - 69],
                  [57, foot - 55],
                  [48, foot - 54],
                  [39, foot - 58],
                  [28, foot - 54],
                  [18, foot - 59],
                ],
                '#758685',
              );
              for (let x = 17; x < 52; x += 9) line(ctx, x, foot - 67, x - 6, foot - 54, '#b0b8a7');
              line(ctx, 8, foot - 58, 17, foot - 73, '#d4e0e4', 2);
              line(ctx, 17, foot - 73, 47, foot - 70, '#dce4e9', 3);
              for (let i = 0; i < 6; i++)
                rect(ctx, 18 + i * 5, foot - 72 + rng() * 2, 5, 2, '#e2e8eb');
              for (const px of [16, 47]) {
                line(ctx, px, foot - 54, px, foot - 40, '#9b9f83');
                poly(
                  ctx,
                  [
                    [px - 4, foot - 40],
                    [px + 4, foot - 40],
                    [px + 3, foot - 34],
                    [px - 2, foot - 34],
                  ],
                  '#77736b',
                );
                for (let i = 0; i < 4; i++)
                  line(
                    ctx,
                    px,
                    foot - 40,
                    px + (rng() - 0.5) * 9,
                    foot - 46 - rng() * 3,
                    '#81b2a0',
                  );
              }
              rect(ctx, 11, foot - 26, 43, 3, '#233d4a');
            }
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
      128,
      180,
      (ctx) => {
        const foot = 168,
          cx = 64 + (rng() - 0.5) * 8,
          lean = (rng() - 0.5) * 17,
          type = Math.floor(rng() * 3);
        const spread = type === 0 ? 0.8 : type === 1 ? 1 : 1.08,
          spacing = 14 + rng() * 2,
          snowBias = rng() > 0.5 ? 1 : -1;
        ctx.save();
        ctx.globalAlpha = 0.17;
        for (let i = 0; i < 6; i++)
          blob(
            ctx,
            cx + (rng() - 0.5) * 32,
            foot + 1 + rng() * 3,
            15 + rng() * 15,
            3 + rng() * 4,
            '#264663',
            rng,
          );
        ctx.restore();
        // Tangled roots, fallen branchlets and low surviving needles bind the tree to the snow.
        for (let i = 0; i < 15; i++) {
          const bx = cx + (rng() - 0.5) * 54,
            by = foot - 3 + rng() * 9;
          line(ctx, bx - 3, by + 2, bx + 3, by - 3, '#617583');
          for (let j = 0; j < 3; j++)
            line(ctx, bx, by - j, bx + (j % 2 ? 1 : -1) * (3 + rng() * 3), by - j - 2, '#416677');
          if (rng() > 0.3) blob(ctx, bx, by, 4 + rng() * 4, 2, '#b7cce0', rng);
        }
        rect(ctx, cx - 5, foot - 87, 10, 87, '#203340');
        rect(ctx, cx - 3, foot - 78, 3, 75, '#536363');
        for (let i = 0; i < 24; i++)
          rect(
            ctx,
            cx - 4 + rng() * 8,
            foot - rng() * 80,
            1,
            2 + rng() * 6,
            rng() > 0.5 ? '#7c8071' : '#273f4d',
          );
        for (let tier = 0; tier < 9; tier++) {
          const y = foot - 15 - tier * spacing + (rng() - 0.5) * 7,
            half = (49 - tier * 4.9) * spread * (0.9 + rng() * 0.17),
            shift = (lean * tier) / 9;
          const silhouette: number[][] = [[cx + shift, y - 35]];
          for (let j = 0; j <= 16; j++) {
            const xx = -half + (j / 16) * half * 2;
            silhouette.push([cx + shift + xx, y + (rng() - 0.3) * 8 - Math.abs(xx) * 0.1]);
          }
          poly(ctx, silhouette, tier % 2 ? '#19384d' : '#213e52');
          const branches = 7 + (tier < 3 ? 2 : 0);
          for (let branch = 0; branch < branches; branch++) {
            const direction = (branch / (branches - 1) - 0.5) * 2,
              bx = cx + shift + direction * half,
              by = y - 4 - (1 - Math.abs(direction)) * 14;
            line(ctx, cx + shift, y - 20, bx, by, '#4a626a', 2);
            for (let needle = 0; needle < 16; needle++) {
              const px = bx + (rng() - 0.5) * 15,
                py = by - rng() * 9,
                length = 3 + rng() * 5;
              poly(
                ctx,
                [
                  [px - 3, py - 2],
                  [px + 1, py - 5],
                  [px + 3, py],
                  [px + 5, py + length],
                  [px, py + 2],
                  [px - 4, py + length - 1],
                ],
                ['#18374d', '#2a4b5e', '#3c6070', '#25495f'][Math.floor(rng() * 4)],
              );
              if (rng() > 0.65) line(ctx, px, py - 2, px + 1, py + 3, '#63838d');
            }
            // Windward branches carry linked lumpy snow masses; lee branches expose needles.
            if (rng() > (direction * snowBias > 0 ? 0.22 : 0.48)) {
              const snowWidth = 5 + rng() * 9;
              blob(ctx, bx + 1, by - 1, snowWidth + 2, 4 + rng() * 3, '#7e9abc', rng);
              blob(ctx, bx, by - 4, snowWidth, 4 + rng() * 2, '#b5c9e0', rng);
              for (let lobe = 0; lobe < 3; lobe++) {
                const px = bx + (lobe - 1) * snowWidth * 0.5,
                  py = by - 6 + (rng() - 0.5) * 3;
                blob(ctx, px, py, snowWidth * 0.53, 2 + rng() * 2, '#d6e2f0', rng);
                if (rng() > 0.5) rect(ctx, px - 2, py - 2, 3, 1, '#f0eff4');
              }
              for (let chip = 0; chip < 5; chip++)
                rect(
                  ctx,
                  bx + (rng() - 0.5) * snowWidth * 1.7,
                  by - 2 + rng() * 3,
                  1 + rng() * 2,
                  1,
                  '#9bb5d3',
                );
              if (rng() > 0.55)
                rect(ctx, bx + snowWidth * 0.6, by + 1, 1, 3 + rng() * 4, '#acc6dd');
            }
          }
        }
        const apexX = cx + lean,
          apexY = foot - 15 - 8 * spacing - 22;
        line(ctx, apexX, apexY + 17, apexX, apexY, '#587788', 2);
        line(ctx, apexX, apexY + 7, apexX - 4, apexY + 12, '#adc5df', 2);
        rect(ctx, apexX - 1, apexY, 2, 7, '#e0e9f2');
      },
      64,
      168,
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

  private herb(kind: PlantKind, seed: number): Sprite {
    return image(
      64,
      72,
      (ctx) => {
        const rng = random(deriveSeed(seed, 'plant-soil'));
        ctx.save();
        ctx.globalAlpha = 0.2;
        blob(ctx, 33, 62, 14, 4, '#27455d', rng);
        ctx.restore();
        blob(ctx, 32, 60, 11, 3, '#3b5964', rng);
        for (let i = 0; i < 7; i++)
          rect(ctx, 22 + rng() * 20, 58 + rng() * 5, 2, 1, rng() > 0.5 ? '#75877e' : '#2e4a5a');
        drawPlant(ctx, seed, kind, 32, 60);
      },
      32,
      60,
    );
  }
}

const humanFrames = new Map<string, Sprite>();

/** Four sprite directions retain continuous north/south depth at diagonal headings. */
export function humanoidDirection(heading: number) {
  const north = Math.sin(heading) < -1e-8;
  const diagonalNorth =
    north && Math.abs(Math.abs(Math.sin(heading)) - Math.abs(Math.cos(heading))) < 1e-8;
  return {
    face: diagonalNorth ? 0 : (((Math.round(heading / (Math.PI / 2)) + 1) % 4) + 4) % 4,
    weaponBehindBody: north,
  };
}

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
  weaponBehindBody = ((Math.round(heading) % 4) + 4) % 4 === 0,
  action: HumanoidAction | null = null,
) {
  const motion = actionMotion(action);
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
    look.weaponSeed ?? look.seed,
    JSON.stringify(look.artifactDesign ?? ''),
    heading,
    gait,
    moving,
    strike,
    weaponBehindBody,
    motion.kind ?? '',
    action?.tool?.kind ?? '',
    action?.tool?.seed ?? '',
    motion.step,
    !!action?.reduced,
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
          weaponBehindBody,
          motion.kind
            ? {
                kind: motion.kind,
                progress: motion.step / 6,
                reduced: action?.reduced,
                tool: action?.tool,
              }
            : null,
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
  weaponBehindBody = false,
  action: HumanoidAction | null = null,
) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const anatomy = humanoidGenome(look.seed),
    tailoring = tailoringGenome(look.seed);
  ctx.scale(scale * look.build * 1.28 * anatomy.width, scale * look.height * anatomy.height);
  const face = ((Math.round(heading) % 4) + 4) % 4;
  const side = face === 1 || face === 3,
    east = face === 1 ? 1 : -1;
  const step = moving ? Math.sin(phase) : 0,
    bob = moving ? Math.abs(Math.sin(phase * 2)) : 0;
  const cloak = color(look.coat, -9),
    coat = look.coat,
    sleeve = tailoring.sleeve === 'underlayer' ? color(look.trousers, 28) : coat;
  const motion = actionMotion(action),
    strength = motion.strength;
  const handPose = (s: number, front: boolean) => {
    const ax = side ? east * (front ? 5 : -4) : s * (anatomy.shoulders + 1);
    let hx = ax + 1,
      hy = -14 + (moving ? step * s * 2 : 0);
    if (motion.kind === 'gather') {
      hx += strength * (side ? east * (front ? 3 : 8) : front ? -2 : 3);
      hy += strength * (front ? 4 : 10 - motion.settle * 10);
    } else if (motion.kind === 'craft') {
      hx += strength * (side ? east * 5 : -s * 4);
      hy -=
        strength * (front ? 4 : 7) +
        (action?.reduced ? 0 : Math.sin(motion.settle * Math.PI * 4) * strength * 1.5);
    } else if (motion.kind === 'ward') {
      hx += strength * (side ? east * 5 : s * 6);
      hy -= strength * 17;
    } else if (motion.kind === 'heal' && !front) {
      hx += strength * (side ? east * 6 : 4);
      hy -= strength * 17;
    } else if (motion.kind === 'hurt') {
      hx += strength * (side ? -east * 3 : -s * 4);
      hy -= strength * (front ? 1 : 7);
    }
    return { x: hx, y: hy };
  };
  const arm = (s: number, front: boolean) => {
    const ax = side ? east * (front ? 5 : -4) : s * (anatomy.shoulders + 1),
      sway = moving ? step * s * 2 : 0,
      lift = attack > 0 && front ? -8 * Math.sin(attack * Math.PI) : 0;
    if (motion.kind) {
      const hand = handPose(s, front);
      const elbowX = ax + (side ? east * 2 : s * 2),
        elbowY = (-25 - bob + hand.y) * 0.5 + 2;
      line(ctx, ax, -25 - bob, elbowX, elbowY, color(sleeve, front ? 9 : -15), 3);
      line(ctx, elbowX, elbowY, hand.x, hand.y, color(sleeve, front ? 14 : -8), 3);
      rect(ctx, hand.x - 1, hand.y - anatomy.cuff, 3, anatomy.cuff, color(look.trim, -10));
      rect(ctx, hand.x - 1, hand.y, 3, 3, look.skin);
      if (!front && motion.kind === 'heal') {
        rect(ctx, hand.x - 1, hand.y - 5, 3, 5, '#89b6a2');
        rect(ctx, hand.x, hand.y - 6, 2, 2, '#d8ce9e');
        rect(ctx, hand.x, hand.y - 3, 1, 2, '#c8e5ca');
      }
      if (!front && motion.kind === 'gather' && motion.settle >= 0.5) {
        line(ctx, hand.x, hand.y, hand.x + 2, hand.y - 5, '#91b59a');
        rect(ctx, hand.x + 2, hand.y - 4, 3, 2, '#b2c99e');
      }
      return;
    }
    line(
      ctx,
      ax,
      -25 - bob,
      ax + (front ? attack * 5 : 0),
      -16 + sway + lift,
      color(sleeve, front ? 9 : -15),
      3,
    );
    rect(ctx, ax, -15 + sway + lift, 3, 3, look.skin);
    rect(ctx, ax, -16 - anatomy.cuff + sway + lift, 3, anatomy.cuff, color(look.trim, -10));
  };
  const heldArmAndItem = () => {
    arm(1, true);
    const held = motion.kind ? handPose(1, true) : null;
    const wx = held ? held.x : side ? east * 7 : 8,
      hand = held ? held.y : -14 + step * 2 - attack * 7;
    const workTool = motion.kind === 'gather' ? action?.tool : undefined;
    if (workTool || look.weapon !== 'none') {
      const sign = side ? east : 1;
      const angle =
        (workTool ? sign * (-0.85 + strength * 1.4) : 0) +
        (motion.kind === 'gather' && !workTool ? sign * strength * 0.22 : 0) +
        (look.weapon === 'sword'
          ? sign * (0.16 + attack * 1.12)
          : look.weapon === 'bow'
            ? sign * attack * 0.3
            : sign * (0.04 + attack * 0.7));
      const weaponScale = look.weapon === 'bow' ? 0.62 : 0.68;
      const weaponSeed = look.weaponSeed ?? look.seed;
      const bow =
        !look.artifactDesign && look.weapon === 'bow' ? weaponGenome(weaponSeed, 'bow') : null;
      ctx.save();
      ctx.translate(wx + sign * attack * 4, hand);
      ctx.rotate(angle);
      if (side && east < 0) ctx.scale(-1, 1);
      if (workTool && !look.artifactDesign) drawLaborTool(ctx, workTool, 0, 0, 0.85);
      else if (look.artifactDesign) drawArtifact(ctx, look.artifactDesign, 0, 0, weaponScale);
      else if (look.weapon !== 'none')
        drawWeapon(
          ctx,
          weaponSeed,
          look.weapon,
          bow ? -(2 + bow.breadth) * weaponScale : 0,
          bow ? -(13 - bow.length / 2) * weaponScale : 0,
          weaponScale,
        );
      ctx.restore();
      // A visible gripping hand belongs to the articulated body, over its generated handle.
      rect(ctx, wx + sign * attack * 4, hand, 2, 2, look.skin);
    }
  };
  // Sole, trouser folds, two distinct feet, and the visible rear hand.
  for (const s of [-1, 1]) {
    const sy = s * step * 2,
      bx = side ? s * step * 3 : s * anatomy.stance;
    rect(ctx, bx - 2, -12 + sy, 4, 10 - sy, look.trousers);
    rect(ctx, bx - 2, -3 + sy, 5, 3, '#1b2b32');
    rect(ctx, bx - 2, -3 + sy, 3, 1, '#77818a');
    rect(ctx, bx, -10 + sy, 1, 5, color(look.trousers, 17));
  }
  // The torso moves around planted feet; short contextual poses never shift gameplay position.
  if (motion.kind) ctx.translate((side ? east : 0) * motion.lean, motion.crouch);
  // Looking north puts the held arm, grip and item beyond the back of the body.
  // Paint the complete assembly first so neither a swing nor a bow can cross the hood.
  if (look.artifactDesign && look.weapon === 'none') {
    // A sheathed/stowed construction remains a physical object attached to its owner's back.
    drawArtifact(ctx, look.artifactDesign, -3, -16, 0.55, -0.42);
  }
  if (weaponBehindBody) heldArmAndItem();
  if (look.cloak) {
    const hem = -28 + tailoring.capeLength;
    poly(
      ctx,
      [
        [-6, -28 - bob],
        [5, -28 - bob],
        [8 + step, hem - 2],
        [3, hem],
        [0, hem - (tailoring.capeSplit ? 4 : 0)],
        [-5, hem],
        [-8 - step, hem - 2],
      ],
      color(cloak, -17),
    );
    poly(
      ctx,
      [
        [-5, -27 - bob],
        [4, -27 - bob],
        [6 + step, hem - 3],
        [1, hem - 2],
        [-5, hem - 3],
      ],
      cloak,
    );
    line(ctx, -4, -25 - bob, -6, hem - 4, color(cloak, 17));
    line(ctx, 1, -24, 3, hem - 4, color(cloak, -12));
  }
  if (!motion.kind || weaponBehindBody) arm(-1, false);
  const hem = tailoring.bottom,
    width = anatomy.waist + tailoring.flare;
  // A shirt remains visible through open coats and under sleeveless work garments.
  poly(
    ctx,
    [
      [-anatomy.shoulders, -27 - bob],
      [anatomy.shoulders, -27 - bob],
      [anatomy.waist, -14],
      [-anatomy.waist, -14],
    ],
    color(look.trousers, 28),
  );
  poly(
    ctx,
    [
      [-anatomy.shoulders, -27 - bob],
      [anatomy.shoulders, -27 - bob],
      [anatomy.waist, anatomy.beltY],
      [width, hem - 1],
      [tailoring.split, hem],
      [0, hem - tailoring.split],
      [-width, hem - 1],
      [-anatomy.waist, anatomy.beltY],
    ],
    coat,
  );
  line(ctx, -anatomy.shoulders + 1, -25 - bob, -width + 1, hem - 2, color(coat, 17));
  line(ctx, anatomy.shoulders - 1, -25 - bob, width - 1, hem - 2, color(coat, -18));
  if (face !== 0) {
    const axis = side ? east * 2 : 0;
    if (tailoring.closure === 'open') {
      poly(
        ctx,
        [
          [axis - 2, -27 - bob],
          [axis + 2, -27 - bob],
          [axis + 2, hem],
          [axis - 2, hem],
        ],
        color(look.trousers, 28),
      );
      line(ctx, axis - 3, -25 - bob, axis - 2, hem - 2, look.trim);
      line(ctx, axis + 3, -25 - bob, axis + 2, hem - 2, color(look.trim, -12));
      line(ctx, axis - 3, -26 - bob, axis - 1, -21, look.trim, 2);
    } else if (tailoring.closure === 'wrap') {
      line(ctx, -3, -26 - bob, 3, -17, look.trim, 2);
      line(ctx, 3, -17, -1, hem - 2, color(coat, -12));
    } else if (tailoring.closure === 'laces') {
      rect(ctx, axis - 1, -25 - bob, 3, 7, color(coat, -28));
      for (let i = 0; i < 3; i++)
        line(ctx, axis - 1, -24 - bob + i * 2, axis + 1, -23 - bob + i * 2, look.trim);
    } else {
      line(ctx, axis, -25 - bob, axis, -14, color(coat, -13));
      for (let i = 0; i < anatomy.buttons; i++)
        rect(ctx, axis + tailoring.buttonSide, -23 + i * 2, 1, 1, color(look.trim, 28));
    }
    if (tailoring.cut === 'apron') {
      const fabric = color(look.trim, -12);
      poly(
        ctx,
        [
          [-3, -24 - bob],
          [3, -24 - bob],
          [3, -18],
          [5, hem - 1],
          [-5, hem - 1],
          [-3, -18],
        ],
        fabric,
      );
      line(ctx, -4, -27 - bob, -2, -21, color(fabric, 18));
      line(ctx, 4, -27 - bob, 2, -21, color(fabric, 18));
      rect(ctx, -3, -13, 6, 4, color(fabric, -22));
      rect(ctx, -3, -13, 6, 1, color(fabric, 18));
    }
    if (tailoring.cut !== 'apron')
      for (let i = 0; i < tailoring.pockets; i++) {
        const px = (i ? -anatomy.pocketSide : anatomy.pocketSide) * (anatomy.waist - 1);
        const py = Math.min(-14, hem - 4);
        rect(ctx, px - 1, py, 3, 3, color(coat, -20));
        rect(ctx, px - 1, py, 3, 1, color(coat, 20));
      }
    if (tailoring.embroidery)
      line(ctx, -width + 1, hem - 2, width - 1, hem - 2, color(look.trim, -8));
    if (tailoring.collar === 1) rect(ctx, -3, -27 - bob, 7, 2, color(look.trim, -12));
    else if (tailoring.collar === 2) line(ctx, -4, -26 - bob, 1, -22, look.trim, 2);
    else if (tailoring.collar === 3) {
      rect(ctx, -4, -27 - bob, 3, 3, color(coat, 23));
      rect(ctx, 2, -27 - bob, 3, 3, color(coat, 12));
    }
  } else {
    line(ctx, anatomy.seam, -25 - bob, anatomy.seam, hem - 2, color(coat, -12));
    if (tailoring.cut === 'apron')
      line(ctx, -anatomy.shoulders + 1, -25 - bob, anatomy.waist - 1, -17, look.trim);
  }
  if (tailoring.fastening === 'belt') {
    rect(ctx, -anatomy.waist, anatomy.beltY, anatomy.waist * 2 + 1, 2, '#2c3738');
    if (face !== 0) rect(ctx, side ? east * 2 : 0, anatomy.beltY, 2, 2, '#d2b781');
  } else if (tailoring.fastening === 'sash') {
    line(ctx, -anatomy.waist, anatomy.beltY + 1, anatomy.waist, anatomy.beltY - 1, look.trim, 2);
    if (face !== 0) {
      line(
        ctx,
        anatomy.waist - 1,
        anatomy.beltY,
        anatomy.waist + 1,
        Math.min(-4, hem),
        color(look.trim, 12),
        2,
      );
    }
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
  poly(
    ctx,
    [
      [-anatomy.skull, -34 - bob],
      [-anatomy.skull + 0.5, -36 - bob],
      [anatomy.skull - 0.5, -36 - bob],
      [anatomy.skull, -33 - bob],
      [anatomy.jaw, -28 - bob],
      [-anatomy.jaw, -28 - bob],
    ],
    face === 0 ? look.hair : look.skin,
  );
  rect(ctx, -3, -36 - bob, 6, 2, look.hair);
  if (anatomy.hairline === 1) rect(ctx, -3, -35 - bob, 2, 2, look.hair);
  else if (anatomy.hairline === 2) rect(ctx, 1, -35 - bob, 3, 2, look.hair);
  else if (anatomy.hairline === 3) rect(ctx, -anatomy.skull, -33 - bob, 1, 5, look.hair);
  else if (anatomy.hairline === 4) rect(ctx, anatomy.skull - 1, -34 - bob, 2, 5, look.hair);
  if (face !== 0) {
    rect(ctx, -4, -34 - bob, 2, 5, color(look.skin, -27));
    rect(ctx, 2, -33 - bob, 2, 3, color(look.skin, 13));
    if (look.hairStyle % 3 === 0) rect(ctx, -3, -35 - bob, 2, 3, look.hair);
    if (look.hairStyle % 3 === 1) rect(ctx, 2, -35 - bob, 2, 3, look.hair);
    const eyeY = -32 - bob - anatomy.eyeLift;
    const eyesX = side ? east * 2 : -anatomy.eyeGap;
    rect(ctx, eyesX - 1, eyeY - 1, anatomy.brow === 1 ? 3 : 2, 1, color(look.hair, -8));
    rect(ctx, eyesX, eyeY, 1, 1, '#223441');
    if (!side) {
      rect(ctx, anatomy.eyeGap, eyeY, 1, 1, '#223441');
      rect(
        ctx,
        anatomy.eyeGap - 1,
        eyeY - 1 - (anatomy.brow === 2 ? 1 : 0),
        2,
        1,
        color(look.hair, -8),
      );
    }
    const noseX = side ? east * (3 + anatomy.nose * 0.4) : 0;
    rect(
      ctx,
      noseX,
      -31 - bob,
      1 + Number(anatomy.nose === 2),
      1 + Number(anatomy.nose === 1),
      color(look.skin, 19),
    );
    rect(ctx, -1, -28 - bob, 3, 1, color(look.skin, -26));
    if (anatomy.beard === 1 || look.hairStyle === 4) {
      rect(ctx, -3, -29 - bob, 6, 2, color(look.hair, 8));
      rect(ctx, -1, -27 - bob, 3, 1, look.hair);
    } else if (anatomy.beard === 2) rect(ctx, -2, -30 - bob, 4, 1, look.hair);
    else if (anatomy.beard === 3)
      rect(ctx, side ? east * 3 : -1, -28 - bob, 2, 2, color(look.hair, 10));
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
  if (!weaponBehindBody) heldArmAndItem();
  if (motion.kind && !weaponBehindBody) arm(-1, false);
  ctx.restore();
}
