import { generateArtifact } from './artifacts.ts';
import { deriveSeed, random } from '../procedural/random.ts';

export interface ArtifactPixels {
  width: number;
  height: number;
  grip: { x: number; y: number };
  pixels: Uint8Array;
  palette: string[];
}
const cache = new Map<string, ArtifactPixels>();
const shade = (hex: string, amount: number) => {
  const value = parseInt(hex.replace('#', ''), 16);
  return (
    '#' +
    [value >> 16, (value >> 8) & 255, value & 255]
      .map((v) =>
        Math.max(0, Math.min(255, v + amount))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};

/** One connected pixel construction serves the inspection image and every physical body. */
export function artifactPixels(design: string): ArtifactPixels {
  const hit = cache.get(design);
  if (hit) {
    cache.delete(design);
    cache.set(design, hit);
    return hit;
  }
  const genome = generateArtifact(design),
    parts = genome.parts;
  const width = 72,
    height = 80,
    pixels = new Uint8Array(width * height);
  const palette = ['transparent', '#15242c'];
  const index = (color: string) => {
    let i = palette.indexOf(color);
    if (i < 0) {
      i = palette.length;
      palette.push(color);
    }
    return i;
  };
  let minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;
  for (const p of parts) {
    const tx = p.x + Math.cos(p.angle) * p.length,
      ty = p.y + Math.sin(p.angle) * p.length;
    const margin = p.width * 0.65 + 2;
    minX = Math.min(minX, p.x - margin, tx - margin);
    maxX = Math.max(maxX, p.x + margin, tx + margin);
    minY = Math.min(minY, p.y - margin, ty - margin);
    maxY = Math.max(maxY, p.y + margin, ty + margin);
  }
  const scale = Math.min(62 / Math.max(1, maxX - minX), 70 / Math.max(1, maxY - minY));
  const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (height - (maxY - minY) * scale) / 2 - minY * scale;
  const point = (x: number, y: number) => [x * scale + offsetX, y * scale + offsetY] as const;
  const put = (x: number, y: number, color: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x > 0 && x < width - 1 && y > 0 && y < height - 1) pixels[y * width + x] = color;
  };
  const line = (a: readonly number[], b: readonly number[], color: number, thick = 1) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
    const radius = Math.max(0, thick / 2 - 0.4);
    for (let i = 0; i <= steps; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / steps,
        y = a[1] + ((b[1] - a[1]) * i) / steps;
      for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++)
        for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++)
          if (Math.hypot(dx, dy) <= radius + 0.25) put(x + dx, y + dy, color);
    }
  };
  const polygon = (vertices: readonly (readonly number[])[], color: number) => {
    const low = Math.max(1, Math.floor(Math.min(...vertices.map((v) => v[1]))));
    const high = Math.min(height - 2, Math.ceil(Math.max(...vertices.map((v) => v[1]))));
    for (let y = low; y <= high; y++) {
      const xs: number[] = [];
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % vertices.length];
        if (a[1] > y + 0.5 !== b[1] > y + 0.5)
          xs.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.ceil(xs[i]); x <= xs[i + 1]; x++) put(x, y, color);
    }
    for (let i = 0; i < vertices.length; i++)
      line(vertices[i], vertices[(i + 1) % vertices.length], color);
  };
  const rng = random(deriveSeed(0, 'artifact-pixels', design));
  for (const p of parts) {
    const base = index(p.color),
      dark = index(shade(p.color, -28)),
      light = index(shade(p.color, 30));
    const local = (along: number, across: number) =>
      point(
        p.x + Math.cos(p.angle) * along - Math.sin(p.angle) * across,
        p.y + Math.sin(p.angle) * along + Math.cos(p.angle) * across,
      );
    const length = p.length,
      breadth = p.width;
    const origin = local(0, 0),
      tip = local(length, 0);
    // Connection survives subpixel thin branches and every open-ring topology.
    line(origin, tip, dark, Math.max(1, breadth * scale * 0.18));
    if (['shaft', 'branch', 'root', 'tine'].includes(p.kind)) {
      const bend = p.kind === 'root' || p.kind === 'tine' ? breadth * 0.5 : 0;
      polygon(
        [
          local(0, -breadth * 0.43),
          local(length * 0.7, -breadth * 0.26 + bend),
          tip,
          local(length * 0.7, breadth * 0.26 + bend),
          local(0, breadth * 0.43),
        ],
        base,
      );
      line(local(0, -breadth * 0.2), local(length * 0.8, -breadth * 0.1 + bend), light);
      if (p.kind === 'shaft') {
        for (let t = 0.1; t < 0.8; t += 0.11 + rng() * 0.08)
          line(
            local(length * t, -breadth * 0.45),
            local(length * t + breadth * 0.5, breadth * 0.45),
            dark,
          );
      }
    } else if (p.kind === 'blade' || p.kind === 'leaf' || p.kind === 'crystal') {
      const shoulder = p.kind === 'blade' ? 0.22 : p.kind === 'leaf' ? 0.46 : 0.3;
      polygon(
        [
          origin,
          local(length * shoulder, -breadth * 0.5),
          local(length * 0.78, -breadth * 0.27),
          tip,
          local(length * 0.72, breadth * 0.4),
          local(length * shoulder, breadth * 0.5),
        ],
        base,
      );
      polygon(
        [origin, local(length * shoulder, -breadth * 0.5), tip, local(length * 0.48, 0)],
        light,
      );
      line(origin, tip, p.kind === 'leaf' ? dark : light);
      if (p.kind === 'leaf')
        for (let t = 0.25; t < 0.85; t += 0.2) {
          line(local(length * t, 0), local(length * (t + 0.13), -breadth * 0.28), dark);
          line(local(length * t, 0), local(length * (t + 0.12), breadth * 0.28), dark);
        }
    } else if (p.kind === 'ring') {
      let previous = local(0, 0);
      for (let i = 1; i <= 48; i++) {
        const theta = (i * Math.PI * 2) / 48;
        const next = local(
          length * 0.5 - Math.cos(theta) * length * 0.5,
          Math.sin(theta) * breadth * 0.5,
        );
        line(previous, next, i < 24 ? light : base, Math.max(1.4, breadth * scale * 0.14));
        previous = next;
      }
      // A ring is genuinely open rather than a recolored solid blade.
    } else {
      const vertices: (readonly number[])[] = [];
      for (let i = 0; i < 24; i++) {
        const t = (i * Math.PI * 2) / 24;
        vertices.push(
          local(length * 0.48 - Math.cos(t) * length * 0.43, Math.sin(t) * breadth * 0.5),
        );
      }
      polygon(vertices, dark);
      const inset: (readonly number[])[] = [];
      for (let i = 0; i < 20; i++) {
        const t = (i * Math.PI * 2) / 20;
        inset.push(
          local(length * 0.45 - Math.cos(t) * length * 0.32, Math.sin(t) * breadth * 0.34),
        );
      }
      polygon(inset, base);
      line(local(length * 0.22, -breadth * 0.24), local(length * 0.61, -breadth * 0.24), light, 2);
      line(origin, local(length * 0.16, 0), base, Math.max(2, breadth * scale * 0.32));
      line(local(length * 0.05, -breadth * 0.24), local(length * 0.05, breadth * 0.24), light, 2);
      // Flecks sit inside the vessel/chamber mass; silhouettes remain deterministic and coherent.
      for (let i = 0; i < 4; i++)
        put(...local(length * (0.25 + rng() * 0.4), (rng() - 0.5) * breadth * 0.4), light);
    }
  }
  // A single outline is added after composition, so joined pieces do not receive false internal seams.
  const ink = pixels.slice();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!ink[i] && (ink[i - 1] || ink[i + 1] || ink[i - width] || ink[i + width])) pixels[i] = 1;
    }
  const result = { width, height, grip: { x: offsetX, y: offsetY }, pixels, palette };
  cache.set(design, result);
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return result;
}

export function artifactIcon(design: string, size = 160): string {
  const p = artifactPixels(design);
  let paths = '';
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; ) {
      const color = p.pixels[y * p.width + x];
      if (!color) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < p.width && p.pixels[y * p.width + end] === color) end++;
      paths += `<path fill="${p.palette[color]}" d="M${x} ${y}h${end - x}v1H${x}z"/>`;
      x = end;
    }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(16, Math.min(512, size))}" height="${Math.max(16, Math.min(512, size))}" viewBox="-4 0 80 80" shape-rendering="crispEdges" aria-hidden="true">${paths}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** x/y is the actual grip joint; heading is an image-plane rotation in radians. */
export function drawArtifact(
  ctx: CanvasRenderingContext2D,
  design: string,
  x: number,
  y: number,
  scale = 1,
  heading = 0,
) {
  const p = artifactPixels(design);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(scale, scale);
  for (let row = 0; row < p.height; row++)
    for (let col = 0; col < p.width; col++) {
      const c = p.pixels[row * p.width + col];
      if (c) {
        ctx.fillStyle = p.palette[c];
        ctx.fillRect(col - p.grip.x, row - p.grip.y, 1, 1);
      }
    }
  ctx.restore();
}
