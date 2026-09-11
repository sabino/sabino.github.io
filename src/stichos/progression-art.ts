import type { Point, Tile } from './types.ts';
import type { GardenCrop, HomeState } from './progression.ts';
import { gardenStatus } from './progression.ts';
import { deriveSeed, random } from '../procedural/random.ts';
import { drawPlant } from './botany.ts';
import { color, line, poly, rect } from './art.ts';
import type { Sprite } from './art.ts';

interface HomeWorld {
  seed: number;
  generation: number;
  tile(x: number, y: number): Tile;
}
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export type HomeDecoration = Point & {
  id: string;
  homeId: string;
  buildingId: string;
  seed: number;
} & (
    | { kind: 'furniture'; furnitureId: string }
    | {
        kind: 'crop';
        crop: GardenCrop | null;
        stage: 'empty' | 'seedling' | 'growing' | 'ready';
        plot: number;
      }
  );
const boundsCache = new Map<string, Bounds | null>();
const sprites = new Map<string, Sprite>();

function houseBounds(home: HomeState, world: HomeWorld) {
  const key = `${world.seed}:${world.generation}:${home.buildingId}`;
  if (boundsCache.has(key)) return boundsCache.get(key)!;
  const x = Math.round(home.x),
    y = Math.round(home.y);
  let bounds: Bounds | null = null;
  if (world.tile(x, y).building === home.buildingId) {
    bounds = { minX: x, maxX: x, minY: y, maxY: y };
    while (x - bounds.minX < 32 && world.tile(bounds.minX - 1, y).building === home.buildingId)
      bounds.minX--;
    while (bounds.maxX - x < 32 && world.tile(bounds.maxX + 1, y).building === home.buildingId)
      bounds.maxX++;
    while (y - bounds.minY < 32 && world.tile(x, bounds.minY - 1).building === home.buildingId)
      bounds.minY--;
    while (bounds.maxY - y < 32 && world.tile(x, bounds.maxY + 1).building === home.buildingId)
      bounds.maxY++;
  }
  boundsCache.set(key, bounds);
  while (boundsCache.size > 128) boundsCache.delete(boundsCache.keys().next().value!);
  return bounds;
}

/** Interior decorations follow the actual owned footprint; the center door aisle stays clear.
 * These are non-blocking furnishing visuals. Session home rules supply their gameplay effects.
 */
export function homeDecorations(home: HomeState, time: number, world: HomeWorld): HomeDecoration[] {
  const b = houseBounds(home, world);
  if (!b || b.maxX - b.minX < 4 || b.maxY - b.minY < 4) return [];
  const left = b.minX + 1,
    right = b.maxX - 1,
    north = b.minY + 1,
    south = b.maxY - 1,
    middle = (b.minY + b.maxY) / 2;
  const decorations: HomeDecoration[] = [];
  const furniture = (slot: string, x: number, y: number, furnitureId: string | undefined) => {
    if (!furnitureId || world.tile(x, y).terrain !== 'floor') return;
    decorations.push({
      id: `${home.id}:furniture:${slot}`,
      homeId: home.id,
      buildingId: home.buildingId,
      seed: deriveSeed(world.seed, home.id, slot),
      x,
      y,
      kind: 'furniture',
      furnitureId,
    });
  };
  furniture('rest', left, north, home.furniture.rest);
  furniture('hearth', right, north, home.furniture.hearth);
  furniture('work', left, south, home.furniture.work);
  furniture('garden-left', left, middle, home.furniture.garden);
  if (home.plots.length > 2) furniture('garden-right', right, middle, home.furniture.garden);
  for (const plot of gardenStatus(home, time)) {
    const x = (plot.plot < 2 ? left : right) + (plot.plot % 2 ? 0.23 : -0.23);
    if (world.tile(Math.round(x), Math.round(middle)).terrain !== 'floor') continue;
    decorations.push({
      id: `${home.id}:plot:${plot.plot}`,
      homeId: home.id,
      buildingId: home.buildingId,
      seed: plot.crop?.seed ?? deriveSeed(world.seed, home.id, plot.plot),
      x,
      y: middle + 0.03,
      kind: 'crop',
      crop: plot.crop,
      stage: plot.stage as 'empty' | 'seedling' | 'growing' | 'ready',
      plot: plot.plot,
    });
  }
  return decorations;
}

function cached(key: string, paint: (ctx: CanvasRenderingContext2D) => void): Sprite {
  const found = sprites.get(key);
  if (found) {
    sprites.delete(key);
    sprites.set(key, found);
    return found;
  }
  const image = document.createElement('canvas');
  image.width = 64;
  image.height = 80;
  const ctx = image.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  const sprite = { image, x: 32, y: 67 };
  sprites.set(key, sprite);
  while (sprites.size > 192) sprites.delete(sprites.keys().next().value!);
  return sprite;
}
function furnitureSprite(id: string, seed: number) {
  return cached(`furniture:${id}:${seed}`, (ctx) => {
    const rng = random(deriveSeed(seed, id));
    const wood = ['#716957', '#666551', '#756b58'][Math.floor(rng() * 3)];
    const timber = (x: number, y: number, w: number, h: number) => {
      rect(ctx, x, y, w, h, wood);
      for (let by = y + 3; by < y + h; by += 5) {
        rect(ctx, x + 1, by, w - 2, 1, color(wood, -14));
        rect(ctx, x + 3 + rng() * Math.max(1, w - 8), by - 1, 3, 1, color(wood, 16));
      }
      rect(ctx, x, y, w, 1, '#a6aa98');
    };
    poly(
      ctx,
      [
        [12, 65],
        [40, 61],
        [55, 66],
        [43, 72],
        [16, 72],
        [8, 69],
      ],
      '#173b4a50',
    );
    if (id === 'woven-cot' || id === 'clinic-bed') {
      const clinic = id === 'clinic-bed';
      for (const x of [15, 46]) {
        timber(x, 29, 3, 39);
        rect(ctx, x - 1, 27, 5, 3, '#b1b8a4');
      }
      poly(
        ctx,
        [
          [17, 33],
          [44, 33],
          [49, 61],
          [12, 61],
        ],
        '#334c52',
      );
      poly(
        ctx,
        [
          [18, 33],
          [43, 33],
          [47, 59],
          [14, 59],
        ],
        clinic ? '#a7c4b7' : '#8d9c87',
      );
      for (let y = 39; y < 59; y += 5)
        line(ctx, 18 - (y - 39) * 0.13, y, 43 + (y - 39) * 0.13, y, clinic ? '#71998f' : '#6b8377');
      poly(
        ctx,
        [
          [19, 35],
          [41, 35],
          [42, 41],
          [18, 41],
        ],
        '#d4d8bd',
      );
      line(ctx, 20, 36, 39, 36, '#ede7c9');
      rect(ctx, 29, 43, 5, 16, clinic ? '#c7d5be' : '#b3b395');
      timber(12, 60, 37, 5);
      if (clinic) {
        rect(ctx, 28, 46, 7, 2, '#789d91');
        rect(ctx, 31, 44, 2, 7, '#789d91');
      }
    } else if (id === 'iron-stove' || id === 'tile-hearth') {
      const tiles = id === 'tile-hearth';
      rect(ctx, 36, 11, 7, 26, '#334b56');
      rect(ctx, 37, 12, 2, 23, '#81919a');
      rect(ctx, 35, 10, 10, 3, '#a5b0b0');
      rect(ctx, 18, 34, 30, 30, '#2c414b');
      rect(ctx, 21, 33, 25, 30, tiles ? '#536f6d' : '#485d62');
      if (tiles)
        for (let y = 34; y < 63; y += 7)
          for (let x = 22; x < 46; x += 8) {
            rect(ctx, x, y, 7, 6, '#73918a');
            rect(ctx, x + 1, y + 1, 4, 1, '#a0b2a0');
          }
      rect(ctx, 23, 42, 20, 15, '#253841');
      rect(ctx, 26, 45, 14, 9, '#8d603e');
      rect(ctx, 29, 47, 8, 6, '#d5a657');
      rect(ctx, 32, 45, 3, 7, '#f1cf83');
      line(ctx, 24, 42, 42, 42, '#a6a98a');
      rect(ctx, 17, 32, 32, 4, '#8b9893');
      rect(ctx, 17, 63, 32, 3, '#96a296');
      for (const x of [21, 43]) rect(ctx, x, 65, 3, 3, '#31464e');
    } else if (id === 'field-bench' || id === 'precision-bench') {
      for (const x of [14, 47]) timber(x, 48, 4, 21);
      timber(12, 46, 40, 9);
      poly(
        ctx,
        [
          [14, 38],
          [47, 38],
          [54, 46],
          [10, 46],
        ],
        '#8d866b',
      );
      line(ctx, 13, 39, 48, 39, '#bcc0a2');
      for (let i = 0; i < 4; i++) {
        const x = 17 + i * 8;
        rect(ctx, x, 32 + (i % 2), 5, 10, ['#7fa79b', '#a1a6b6', '#a69674', '#729797'][i]);
        rect(ctx, x + 1, 31 + (i % 2), 3, 2, '#c5c3a3');
        rect(ctx, x + 1, 35, 1, 5, '#d3ddd0');
      }
      line(ctx, 16, 60, 47, 60, '#9fa48d', 2);
      if (id === 'precision-bench') {
        rect(ctx, 36, 25, 3, 13, '#b7a26c');
        poly(
          ctx,
          [
            [34, 24],
            [36, 20],
            [43, 20],
            [45, 24],
            [43, 29],
            [36, 29],
          ],
          '#bfcab7',
        );
        rect(ctx, 37, 22, 5, 5, '#527d86');
        line(ctx, 34, 37, 44, 37, '#d6c391', 2);
      }
    } else {
      // Raised beds/glass planter bases remain low enough to show every crop.
      timber(11, 56, 42, 10);
      poly(
        ctx,
        [
          [13, 49],
          [49, 49],
          [53, 56],
          [10, 56],
        ],
        '#a09b78',
      );
      poly(
        ctx,
        [
          [15, 51],
          [47, 51],
          [49, 55],
          [13, 55],
        ],
        '#354b43',
      );
      for (let k = 0; k < 12; k++) rect(ctx, 15 + rng() * 32, 52 + rng() * 2, 2, 1, '#68795b');
      if (id === 'glass-planters') {
        for (const x of [12, 50]) line(ctx, x, 54, x, 32, '#80a09b', 2);
        line(ctx, 12, 32, 31, 23, '#b2c9bc', 2);
        line(ctx, 31, 23, 50, 32, '#b2c9bc', 2);
        poly(
          ctx,
          [
            [13, 33],
            [31, 25],
            [49, 33],
            [49, 45],
            [13, 45],
          ],
          '#97d1bc18',
        );
        line(ctx, 17, 34, 27, 29, '#d1e7cf70');
      }
    }
  });
}
function cropSprite(decoration: Extract<HomeDecoration, { kind: 'crop' }>) {
  const { crop, stage, seed } = decoration;
  return cached(`crop:${crop?.plant ?? 'empty'}:${seed}:${stage}`, (ctx) => {
    poly(
      ctx,
      [
        [25, 61],
        [39, 61],
        [37, 69],
        [27, 69],
      ],
      '#716859',
    );
    rect(ctx, 24, 59, 16, 4, '#a3916c');
    rect(ctx, 26, 59, 12, 2, '#394c42');
    rect(ctx, 28, 65, 1, 3, '#b0a386');
    if (!crop) return;
    if (stage === 'seedling') {
      line(ctx, 32, 60, 32, 51, '#64867a', 2);
      poly(
        ctx,
        [
          [32, 55],
          [25, 49],
          [26, 54],
          [31, 57],
        ],
        '#8ab19a',
      );
      poly(
        ctx,
        [
          [33, 54],
          [39, 47],
          [39, 52],
          [33, 57],
        ],
        '#b0c5a2',
      );
    } else drawPlant(ctx, crop.seed, crop.plant, 32, 61, stage === 'growing' ? 0.39 : 0.56);
  });
}

/** x/y are screen foot coordinates; scale is the renderer's CSS pixels per32-pixel tile. */
export function drawHomeDecoration(
  ctx: CanvasRenderingContext2D,
  decoration: HomeDecoration,
  x: number,
  y: number,
  scale: number,
  time: number,
  reducedMotion = false,
) {
  const sprite =
    decoration.kind === 'crop'
      ? cropSprite(decoration)
      : furnitureSprite(decoration.furnitureId, decoration.seed);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sprite.image,
    Math.round(x - sprite.x * scale),
    Math.round(y - sprite.y * scale),
    Math.round(sprite.image.width * scale),
    Math.round(sprite.image.height * scale),
  );
  if (
    decoration.kind === 'furniture' &&
    ['iron-stove', 'tile-hearth'].includes(decoration.furnitureId)
  ) {
    const flicker = reducedMotion
      ? 0.6
      : 0.48 + Math.sin(time * 3.7 + (decoration.seed % 19)) * 0.16;
    ctx.save();
    ctx.globalAlpha *= flicker;
    rect(ctx, x - 4 * scale, y - 18 * scale, 6 * scale, 3 * scale, '#f8d785');
    ctx.restore();
  }
}

export function furnitureIcon(furnitureId: string, seed = 0) {
  const sprite = furnitureSprite(furnitureId, seed);
  return sprite.image.toDataURL('image/png');
}
