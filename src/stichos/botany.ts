import { deriveSeed, random } from '../procedural/random.ts';

export type PlantKind = 'cequin' | 'heartleaf' | 'emberroot' | 'mushroom';
export type LeafArrangement = 'opposite' | 'alternate' | 'whorled' | 'clustered';
export interface PlantGenome {
  seed: number;
  kind: PlantKind;
  stemHeight: number;
  branching: number;
  leafLength: number;
  leafWidth: number;
  leafArrangement: LeafArrangement;
  leafAngle: number;
  budShape: 'spike' | 'bell' | 'berry' | 'cap';
  budCount: number;
  budSize: number;
  rootMass: number;
  lean: number;
  palette: string[];
}
export interface PlantProfile {
  name: string;
  kind: PlantKind;
  yield: 1 | 2 | 3 | 4;
  description: string;
  construction: string;
  color: string;
}
export interface PlantPixels {
  width: number;
  height: number;
  pixels: Uint8Array;
  /** Locked, connected roots and stems, before leaves, buds, shading and outlines. */
  skeleton: Uint8Array;
  palette: string[];
  anchor: { x: number; y: number };
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const palettes: Record<PlantKind, string[]> = {
  cequin: [
    'transparent',
    '#203842',
    '#40574f',
    '#6e7b5b',
    '#a0a98a',
    '#426a63',
    '#89ac8e',
    '#315e57',
    '#69a28c',
    '#b5d2b3',
    '#766093',
    '#b099d2',
    '#d6cae9',
    '#d6e4df',
  ],
  heartleaf: [
    'transparent',
    '#213847',
    '#3d5261',
    '#6b7c80',
    '#9eafb0',
    '#426774',
    '#81aaa2',
    '#315e70',
    '#71a9ae',
    '#aed4c7',
    '#716a9b',
    '#b5a6dc',
    '#e0cfe7',
    '#d8e6e3',
  ],
  emberroot: [
    'transparent',
    '#29383e',
    '#644d42',
    '#a9754f',
    '#d9a778',
    '#596b50',
    '#a4b189',
    '#3b584b',
    '#809879',
    '#c4ca99',
    '#9b644e',
    '#df9d73',
    '#f1c891',
    '#dde1c6',
  ],
  mushroom: [
    'transparent',
    '#27384b',
    '#46596b',
    '#738293',
    '#b1bdc1',
    '#777f89',
    '#c1cbc2',
    '#456a7f',
    '#83a7b8',
    '#c1d6dd',
    '#56728c',
    '#9bb7ca',
    '#d4e0e6',
    '#e2e9e7',
  ],
};

/** Original constrained-growth implementation. Conceptual references only:
 * https://github.com/yurkth/sprator (bounded cellular growth and palette/outline stages)
 * https://medium.com/@snoopethduckduck/procedural-sword-generation-69b8b7bc197
 * (a guaranteed connected structural core with independently composed parts).
 * No upstream code, sprite or rule table is copied into this module.
 */
export function plantGenome(ownerSeed: number, kind: PlantKind): PlantGenome {
  const seed = deriveSeed(Number.isFinite(ownerSeed) ? ownerSeed >>> 0 : 0, 'stichos-botany', kind);
  const rng = random(seed),
    integer = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const mushroom = kind === 'mushroom';
  const branching = mushroom ? integer(2, 7) : kind === 'cequin' ? integer(4, 10) : integer(3, 8);
  return {
    seed,
    kind,
    stemHeight: mushroom
      ? integer(11, 25)
      : kind === 'cequin'
        ? integer(25, 39)
        : kind === 'heartleaf'
          ? integer(20, 33)
          : integer(16, 28),
    branching,
    leafLength: mushroom
      ? 0
      : kind === 'cequin'
        ? integer(4, 7)
        : kind === 'heartleaf'
          ? integer(7, 11)
          : integer(5, 9),
    leafWidth: mushroom
      ? 0
      : kind === 'cequin'
        ? integer(1, 2)
        : kind === 'heartleaf'
          ? integer(4, 7)
          : integer(2, 4),
    leafArrangement: mushroom
      ? 'clustered'
      : (['opposite', 'alternate', 'whorled'] as const)[integer(0, 2)],
    leafAngle: Number((0.42 + rng() * 0.64).toFixed(3)),
    budShape: mushroom
      ? 'cap'
      : kind === 'cequin'
        ? 'spike'
        : kind === 'heartleaf'
          ? 'bell'
          : 'berry',
    budCount: mushroom ? branching : integer(0, 6),
    budSize: mushroom ? integer(4, 8) : integer(2, 4),
    rootMass: kind === 'emberroot' ? integer(3, 7) : integer(1, 5),
    lean: Number(((rng() - 0.5) * 7).toFixed(2)),
    palette: [...palettes[kind]],
  };
}

/** Harvest quantity depends only on drawn construction, never another random roll. */
export function plantProfileFromGenome(g: PlantGenome): PlantProfile {
  const mass = (g.branching * g.stemHeight) / 36 + g.rootMass * 0.85 + g.budCount * 0.25;
  const amount = clamp(1 + Math.floor((mass - 2.2) / 3.1), 1, 4) as 1 | 2 | 3 | 4;
  const descriptor =
    g.kind === 'mushroom'
      ? g.branching >= 5
        ? 'Clustered'
        : 'Slender'
      : g.kind === 'emberroot'
        ? g.rootMass >= 5
          ? 'Heavy-root'
          : 'Fine-root'
        : g.kind === 'heartleaf'
          ? g.leafWidth >= 6
            ? 'Broadleaf'
            : g.stemHeight >= 29
              ? 'Tall'
              : 'Small-leaf'
          : g.branching >= 8
            ? 'Branching'
            : g.stemHeight >= 34
              ? 'Tall'
              : 'Silver-needle';
  const base = g.kind === 'mushroom' ? 'snowcap' : g.kind;
  const description =
    g.kind === 'cequin'
      ? 'Rosemary-like needles on branching stems; its leaves help this body breathe.'
      : g.kind === 'heartleaf'
        ? 'Broad heart-shaped leaves hold the cool sap used in restorative preparations.'
        : g.kind === 'emberroot'
          ? 'Warm-colored roots beneath narrow leaves supply the usable crop.'
          : 'Pale clustered caps grow from a connected mat of winter mycelium.';
  return {
    name: `${descriptor} ${base}`,
    kind: g.kind,
    yield: amount,
    description,
    construction: `${g.branching} ${g.kind === 'mushroom' ? 'stalks' : 'stems'} · ${g.kind === 'mushroom' ? 'clustered caps' : g.leafArrangement + ' leaves'} · ${g.rootMass >= 5 ? 'dense' : g.rootMass >= 3 ? 'branched' : 'fine'} roots`,
    color: g.palette[g.kind === 'emberroot' ? 4 : g.kind === 'mushroom' ? 11 : 8],
  };
}
export function plantProfile(seed: number, kind: PlantKind): PlantProfile {
  return plantProfileFromGenome(plantGenome(seed, kind));
}

export function plantPixels(g: PlantGenome): PlantPixels {
  const width = 56,
    height = 64,
    baseX = 28,
    baseY = 54;
  const pixels = new Uint8Array(width * height),
    skeleton = new Uint8Array(width * height),
    rng = random(g.seed);
  const put = (x: number, y: number, c: number, locked = false) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) return;
    pixels[y * width + x] = c;
    if (locked) skeleton[y * width + x] = 1;
  };
  // A Manhattan bridge at each diagonal step guarantees four-neighbor attachment.
  const stroke = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    c: number,
    locked = false,
    thickness = 1,
  ) => {
    let x = Math.round(x0),
      y = Math.round(y0);
    const endX = Math.round(x1),
      endY = Math.round(y1);
    const dx = Math.abs(endX - x),
      dy = Math.abs(endY - y),
      sx = x < endX ? 1 : -1,
      sy = y < endY ? 1 : -1;
    let error = dx - dy;
    for (let step = 0; step < 200; step++) {
      for (let k = 0; k < thickness; k++) put(x + k, y, c, locked);
      if (x === endX && y === endY) break;
      const e = error * 2;
      if (e > -dy) {
        error -= dy;
        x += sx;
        put(x, y, c, locked);
      }
      if (e < dx) {
        error += dx;
        y += sy;
        put(x, y, c, locked);
      }
    }
  };
  const polygon = (points: number[][], c: number) => {
    const minX = Math.max(1, Math.floor(Math.min(...points.map((p) => p[0]))));
    const maxX = Math.min(width - 2, Math.ceil(Math.max(...points.map((p) => p[0]))));
    const minY = Math.max(1, Math.floor(Math.min(...points.map((p) => p[1]))));
    const maxY = Math.min(height - 2, Math.ceil(Math.max(...points.map((p) => p[1]))));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const a = points[i],
            b = points[j];
          if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
            inside = !inside;
        }
        if (inside) put(x, y, c);
      }
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, c: number) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, c);
  };
  const leaf = (x: number, y: number, tx: number, ty: number, breadth: number) => {
    const dx = tx - x,
      dy = ty - y,
      length = Math.max(1, Math.hypot(dx, dy)),
      nx = -dy / length,
      ny = dx / length;
    if (breadth <= 2) {
      stroke(x, y, tx, ty, 8, false, breadth);
      stroke(x, y, tx - 1, ty - 1, 9);
    } else {
      const heart = g.kind === 'heartleaf';
      const shape = heart
        ? [
            [0, 0],
            [0.15, -0.55],
            [0.4, -0.64],
            [0.74, -0.3],
            [1, 0],
            [0.74, 0.3],
            [0.4, 0.64],
            [0.15, 0.55],
          ]
        : [
            [0, 0],
            [0.4, -0.45],
            [0.75, -0.25],
            [1, 0],
            [0.75, 0.25],
            [0.4, 0.45],
          ];
      const points = shape.map(([t, v]) => [
        x + dx * t + nx * v * breadth,
        y + dy * t + ny * v * breadth,
      ]);
      polygon(points, 8);
      stroke(x, y, tx, ty, 7);
      for (let t = 0.25; t < 0.85; t += 0.23) {
        stroke(
          x + dx * t,
          y + dy * t,
          x + dx * (t + 0.12) + nx * breadth * 0.32,
          y + dy * (t + 0.12) + ny * breadth * 0.32,
          9,
        );
      }
    }
    // The leaf vein is physically attached even when the broad mask rounds its base.
    stroke(x, y, tx, ty, 6);
  };
  // Root spread and orange storage lobes are visible, so the mass/yield link can be read.
  const rootMass = clamp(g.rootMass, 1, 8);
  put(baseX, baseY, 3, true);
  for (let root = 0; root < Math.ceil(rootMass) + 2; root++) {
    const side = root % 2 ? 1 : -1,
      rx = baseX + (side * (3 + rootMass * 1.5) * (root + 1)) / (rootMass + 2),
      ry = baseY + 2 + (root % 3);
    stroke(baseX, baseY, rx, ry, 3, true, g.kind === 'emberroot' ? 2 : 1);
    if (g.kind === 'emberroot') {
      ellipse(rx, ry - 1, 1.6 + rootMass * 0.25, 2.4, 3);
      stroke(rx, ry - 2, rx, ry, 4);
    } else stroke(rx, ry, rx + side * 2, ry + 1, 4, true);
  }
  const branches = Math.round(clamp(g.branching, 1, 12)),
    tips: { x: number; y: number }[] = [];
  for (let branch = 0; branch < branches; branch++) {
    const fan = branches === 1 ? 0 : (branch / (branches - 1) - 0.5) * 2;
    const h = clamp(g.stemHeight, 8, 43) * (0.66 + rng() * 0.34);
    const tipX = clamp(
        baseX + fan * (6 + rootMass * 0.9) + g.lean + (rng() - 0.5) * 3,
        9,
        width - 10,
      ),
      tipY = baseY - h;
    const controlX = baseX + fan * 5,
      controlY = baseY - h * 0.48;
    const at = (t: number) => ({
      x: (1 - t) ** 2 * baseX + 2 * (1 - t) * t * controlX + t * t * tipX,
      y: (1 - t) ** 2 * baseY + 2 * (1 - t) * t * controlY + t * t * tipY,
    });
    let previous = at(0);
    for (let step = 1; step <= 12; step++) {
      const p = at(step / 12);
      stroke(previous.x, previous.y, p.x, p.y, 5, true, g.kind === 'mushroom' ? 2 : 1);
      previous = p;
    }
    if (g.kind === 'mushroom') {
      const cap = clamp(g.budSize, 3, 9),
        capY = tipY;
      ellipse(tipX, capY, cap, cap * 0.55, 10);
      ellipse(tipX - 0.5, capY - 1, cap * 0.92, cap * 0.47, 11);
      stroke(tipX - cap * 0.7, capY + 1, tipX + cap * 0.7, capY + 1, 6);
      for (let i = 0; i < cap; i++)
        put(tipX + (rng() - 0.5) * cap * 1.5, capY - 2 + rng() * 2, rng() > 0.5 ? 12 : 13);
    } else {
      const count = Math.max(3, Math.floor(h / 6));
      for (let node = 1; node <= count; node++) {
        const t = 0.18 + (node / (count + 1)) * 0.72,
          p = at(t);
        const sides = g.leafArrangement === 'alternate' ? [node % 2 ? 1 : -1] : [-1, 1];
        for (const side of sides) {
          const length = clamp(g.leafLength, 2, 12) * (0.7 + rng() * 0.3),
            angle = clamp(g.leafAngle, 0.2, 1.3);
          leaf(
            p.x,
            p.y,
            p.x + side * Math.cos(angle) * length,
            p.y - Math.sin(angle) * length,
            g.leafWidth,
          );
        }
        if (g.leafArrangement === 'whorled' && node % 2 === 0)
          leaf(
            p.x,
            p.y,
            p.x + (rng() - 0.5) * 3,
            p.y - g.leafLength * 0.8,
            Math.max(1, g.leafWidth * 0.6),
          );
      }
    }
    tips.push({ x: tipX, y: tipY });
  }
  if (g.kind !== 'mushroom')
    for (let bud = 0; bud < Math.round(clamp(g.budCount, 0, 9)); bud++) {
      const tip = tips[bud % tips.length],
        x = tip.x,
        y = tip.y - Math.floor(bud / tips.length) * 3;
      stroke(tip.x, tip.y, x, y, 5, true);
      const size = clamp(g.budSize, 2, 5);
      if (g.budShape === 'spike') {
        stroke(x, y, x, y - size * 2, 5, true);
        for (let j = 0; j < 3; j++) {
          ellipse(x + (j % 2 ? 1 : -1), y - j * 2, size * 0.6, 1, 11);
          put(x, y - j * 2 - 1, 12);
        }
      } else if (g.budShape === 'bell') {
        polygon(
          [
            [x - 1, y - size],
            [x + 1, y - size],
            [x + size, y + 1],
            [x - size, y + 1],
          ],
          11,
        );
        stroke(x - 1, y - size, x, y, 12);
      } else {
        ellipse(x, y, size * 0.75, size, 11);
        put(x - 1, y - 1, 12);
      }
    }
  // Preserve the structural core, remove detached decoration, then shade its connected skin.
  const queue = [baseY * width + baseX],
    reached = new Uint8Array(pixels.length);
  reached[queue[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i],
      x = p % width,
      y = Math.floor(p / width);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        k = ny * width + nx;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || !pixels[k] || reached[k]) continue;
      reached[k] = 1;
      queue.push(k);
    }
  }
  for (let i = 0; i < pixels.length; i++) if (!reached[i]) pixels[i] = 0;
  const outlined = pixels.slice();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      if (pixels[y * width + x]) {
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ])
          if (!pixels[(y + dy) * width + x + dx]) outlined[(y + dy) * width + x + dx] = 1;
        if (!pixels[(y - 1) * width + x] && rng() > 0.68 && pixels[y * width + x] >= 7)
          outlined[y * width + x] = 13;
      }
  return {
    width,
    height,
    pixels: outlined,
    skeleton,
    palette: [...g.palette],
    anchor: { x: baseX, y: baseY },
  };
}

const cached = new Map<string, PlantPixels>();
export function cachedPlantPixels(seed: number, kind: PlantKind): PlantPixels {
  const key = `${seed >>> 0}:${kind}`,
    found = cached.get(key);
  if (found) {
    cached.delete(key);
    cached.set(key, found);
    return found;
  }
  const result = plantPixels(plantGenome(seed, kind));
  cached.set(key, result);
  while (cached.size > 192) cached.delete(cached.keys().next().value!);
  return result;
}
export function drawPlant(
  ctx: CanvasRenderingContext2D,
  seed: number,
  kind: PlantKind,
  x: number,
  y: number,
  scale = 1,
) {
  const sprite = cachedPlantPixels(seed, kind);
  for (let row = 0; row < sprite.height; row++)
    for (let col = 0; col < sprite.width; col++) {
      const value = sprite.pixels[row * sprite.width + col];
      if (!value) continue;
      ctx.fillStyle = sprite.palette[value];
      ctx.fillRect(
        Math.round(x + (col - sprite.anchor.x) * scale),
        Math.round(y + (row - sprite.anchor.y) * scale),
        Math.max(1, Math.ceil(scale)),
        Math.max(1, Math.ceil(scale)),
      );
    }
}
export function plantIcon(seed: number, kind: PlantKind, size = 32): string {
  const sprite = cachedPlantPixels(seed, kind);
  let paths = '';
  for (let y = 0; y < sprite.height; y++)
    for (let x = 0; x < sprite.width; ) {
      const c = sprite.pixels[y * sprite.width + x];
      if (!c) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < sprite.width && sprite.pixels[y * sprite.width + end] === c) end++;
      paths += `<path fill="${sprite.palette[c]}" d="M${x} ${y}h${end - x}v1H${x}z"/>`;
      x = end;
    }
  return `<svg width="${size}" height="${size}" viewBox="0 0 56 64" shape-rendering="crispEdges" aria-hidden="true">${paths}</svg>`;
}
