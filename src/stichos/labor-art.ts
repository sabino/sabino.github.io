import { seededTool } from './labor.ts';
import type { ToolKind } from './labor.ts';

export interface WorkTool {
  kind: ToolKind;
  seed: number;
}
const cache = new Map<string, { pixels: Uint8Array; palette: string[] }>();
/** Actual profile dimensions construct a recognizable cutting or quarrying head on its haft. */
function toolPixels(tool: WorkTool) {
  const key = tool.kind + ':' + tool.seed,
    hit = cache.get(key);
  if (hit) return hit;
  const g = seededTool(tool.seed, tool.kind),
    pixels = new Uint8Array(48 * 64);
  const palette = [
    'transparent',
    '#172a33',
    g.color,
    '#ad9170',
    g.metalColor,
    '#e0e2d5',
    '#687e87',
    '#4a4540',
  ];
  const set = (x: number, y: number, c: number) => {
    x = Math.round(x + 24);
    y = Math.round(y + 48);
    if (x > 0 && x < 47 && y > 0 && y < 63) pixels[y * 48 + x] = c;
  };
  const line = (x: number, y: number, x2: number, y2: number, c: number, breadth = 1) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x, y2 - y) * 2));
    for (let i = 0; i <= steps; i++)
      for (let dx = 0; dx < breadth; dx++)
        set(x + ((x2 - x) * i) / steps + dx, y + ((y2 - y) * i) / steps, c);
  };
  const fill = (points: number[][], c: number) => {
    const low = Math.floor(Math.min(...points.map((p) => p[1]))),
      high = Math.ceil(Math.max(...points.map((p) => p[1])));
    for (let y = low; y <= high; y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if (a[1] > y + 0.5 !== b[1] > y + 0.5)
          xs.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.ceil(xs[i]); x <= xs[i + 1]; x++) set(x, y, c);
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      line(a[0], a[1], b[0], b[1], c);
    }
  };
  const y = -g.haftLength;
  line(-1, 8, -1, y, 2, 3);
  line(-1, 7, -1, y, 3);
  for (let grip = -3; grip < 7; grip += 3) line(-1, grip, 1, grip - 1, 7);
  if (tool.kind === 'axe') {
    const w = g.headWidth,
      l = g.bladeLength;
    fill(
      [
        [-2, y - 2],
        [3, y - 3],
        [w, y - l * 0.35],
        [w + 1, y + l * 0.45],
        [3, y + g.headThickness],
        [-2, y + 2],
      ],
      4,
    );
    line(w, y - l * 0.35, w + 1, y + l * 0.45, 5, 2);
    line(2, y, 7, y + 2, 6, 2);
    line(-3, y - 1, -3, y + 2, 7, 2);
  } else if (tool.kind === 'pickaxe') {
    const w = g.headWidth;
    fill(
      [
        [-w, y + 5],
        [-w * 0.6, y - 1],
        [0, y - g.headThickness],
        [w * 0.65, y - 1],
        [w, y + 5],
        [w * 0.5, y + 2],
        [0, y + 1],
        [-w * 0.5, y + 2],
      ],
      4,
    );
    line(-w * 0.6, y - 1, 0, y - g.headThickness, 5);
    line(0, y - g.headThickness, w * 0.65, y - 1, 5);
    line(-1, y - 3, 1, y + 3, 7, 2);
  } else {
    const rx = g.headWidth,
      ry = g.bladeLength * 0.65;
    let previous = [0, y];
    for (let i = 1; i <= 32; i++) {
      const angle = Math.PI * 0.5 - (i / 32) * Math.PI * 1.55;
      const p = [Math.cos(angle) * rx, y - ry + Math.sin(angle) * ry];
      line(
        previous[0],
        previous[1],
        p[0],
        p[1],
        i < 28 ? 4 : 5,
        i < 24 ? Math.max(2, g.headThickness * 0.7) : 1,
      );
      if (i < 25) set(p[0] - 1, p[1], 5);
      previous = p;
    }
    line(-1, y - 2, 1, y + 2, 7, 2);
  }
  const original = pixels.slice();
  for (let y = 1; y < 63; y++)
    for (let x = 1; x < 47; x++) {
      const i = y * 48 + x;
      if (
        !original[i] &&
        (original[i - 1] || original[i + 1] || original[i - 48] || original[i + 48])
      )
        pixels[i] = 1;
    }
  const result = { pixels, palette };
  cache.set(key, result);
  if (cache.size > 96) cache.delete(cache.keys().next().value!);
  return result;
}
export function drawLaborTool(
  ctx: CanvasRenderingContext2D,
  tool: WorkTool,
  x: number,
  y: number,
  scale = 0.85,
  angle = 0,
) {
  const p = toolPixels(tool);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 48; x++) {
      const c = p.pixels[y * 48 + x];
      if (c) {
        ctx.fillStyle = p.palette[c];
        ctx.fillRect(x - 24, y - 48, 1, 1);
      }
    }
  ctx.restore();
}
export function toolIcon(seed: number, kind: ToolKind, size = 80) {
  const p = toolPixels({ seed, kind });
  let paths = '';
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 48; x++) {
      const c = p.pixels[y * 48 + x];
      if (c) paths += `<path fill="${p.palette[c]}" d="M${x} ${y}h1v1h-1z"/>`;
    }
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-8 0 64 64" shape-rendering="crispEdges">${paths}</svg>`,
    )
  );
}
