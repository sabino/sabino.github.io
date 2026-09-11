import { deriveSeed, random } from '../procedural/random.ts';

export type WeaponKind = 'staff' | 'sword' | 'bow';
export interface WeaponGenome {
  seed: number;
  kind: WeaponKind;
  material: string;
  density: number;
  length: number;
  breadth: number;
  curvature: number;
  crown: number;
  binding: number;
  effect: 'stagger' | 'breath' | 'warmth';
  palette: string[];
}
const materials = {
  staff: [
    ['frostwood', 0.65, '#8c7962'],
    ['ironbark', 1.15, '#796754'],
    ['silver birch', 0.8, '#b5afa0'],
  ],
  sword: [
    ['blue steel', 1.05, '#809bb4'],
    ['tempered iron', 1.3, '#9d9d9e'],
    ['Sallas alloy', 0.75, '#abb7c6'],
  ],
  bow: [
    ['frostwood', 0.65, '#8c7962'],
    ['ironbark', 1.15, '#796754'],
    ['silver birch', 0.8, '#b5afa0'],
  ],
} as const;
const shade = (hex: string, delta: number) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    '#' +
    [n >> 16, (n >> 8) & 255, n & 255]
      .map((v) =>
        Math.max(0, Math.min(255, v + delta))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
/** Independent construction parameters drive both the silhouette and its actual handling. */
export function weaponGenome(ownerSeed: number, kind: WeaponKind): WeaponGenome {
  const seed = deriveSeed(ownerSeed, 'stichos-artifact', kind),
    rng = random(seed);
  const material = materials[kind][Math.floor(rng() * 3)];
  const effect = (['stagger', 'breath', 'warmth'] as const)[Math.floor(rng() * 3)];
  const core = { stagger: '#adbad3', breath: '#7fbea8', warmth: '#d69769' }[effect];
  return {
    seed,
    kind,
    material: material[0],
    density: material[1],
    length: 37 + Math.floor(rng() * 17),
    breadth: 2 + Math.floor(rng() * 4),
    curvature: (rng() - 0.5) * 5,
    crown: Math.floor(rng() * 4),
    binding: 3 + Math.floor(rng() * 4),
    effect,
    palette: [
      'transparent',
      '#101923',
      shade(material[2], -40),
      material[2],
      shade(material[2], 34),
      '#405165',
      '#95a9b8',
      '#dce0dd',
      shade(core, -44),
      core,
      shade(core, 52),
      '#5c4038',
      '#bf9960',
    ],
  };
}
export function weaponProfile(ownerSeed: number, kind: WeaponKind, level: number) {
  return weaponProfileFromGenome(weaponGenome(ownerSeed, kind), level);
}
export function weaponProfileFromGenome(g: WeaponGenome, level: number) {
  const kind = g.kind;
  const mass = g.density * (g.length / 45) * (0.7 + g.breadth * 0.12);
  const prefix = { stagger: 'Steadfast', breath: 'Breathkeeper', warmth: 'Emberbound' }[g.effect];
  return {
    name: `${prefix} ${g.material} ${kind}`,
    material: g.material,
    effect: g.effect,
    effectDescription: {
      stagger: 'Successful hits delay the target’s next attack.',
      breath: 'Successful hits restore two breath.',
      warmth: 'Successful hits restore three warmth.',
    }[g.effect],
    color: g.palette[9],
    damage: Math.round((kind === 'sword' ? 22 : kind === 'bow' ? 14 : 16) + mass * 3.2 + level * 2),
    range: Number((kind === 'bow' ? 6.9 + g.length * 0.045 : 0.85 + g.length * 0.018).toFixed(2)),
    cooldown: Number(
      ((kind === 'sword' ? 0.38 : kind === 'bow' ? 0.54 : 0.46) + mass * 0.105).toFixed(2),
    ),
    construction: `${g.material} · ${g.length} span · ${g.breadth} breadth · ${['bud', 'fork', 'cage', 'branch'][g.crown]} crown`,
  };
}
export interface WeaponPixels {
  width: number;
  height: number;
  pixels: Uint8Array;
  palette: string[];
}
/** Connected structural mask, constrained growth, edge shading, and a small coherent palette.
 * Conceptual references: SnoopethDuckDuck's Staff/Sword Maker and Deep-Fold's SpriteGenerator.
 * This is an original implementation; no upstream code or images are embedded.
 */
export function weaponPixels(g: WeaponGenome): WeaponPixels {
  const w = 32,
    h = 64,
    pixels = new Uint8Array(w * h),
    rng = random(g.seed);
  const set = (x: number, y: number, c: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x > 0 && x < w - 1 && y > 0 && y < h - 1) pixels[y * w + x] = c;
  };
  const stroke = (x: number, y: number, x2: number, y2: number, c: number, breadth = 1) => {
    const n = Math.ceil(Math.hypot(x2 - x, y2 - y) * 2);
    for (let i = 0; i <= n; i++)
      for (let k = 0; k < breadth; k++)
        set(x + ((x2 - x) * i) / Math.max(1, n) + k, y + ((y2 - y) * i) / Math.max(1, n), c);
  };
  const top = 59 - g.length;
  if (g.kind === 'sword') {
    const guardY = 43,
      half = g.breadth / 2;
    for (let y = top; y <= guardY; y++) {
      const width = Math.min(half, (y - top) * 0.48 + 0.2);
      const center = 16 + Math.sin(((y - top) / (guardY - top)) * Math.PI) * g.curvature * 0.5;
      for (let x = -width; x <= width; x++) set(center + x, y, x < 0 ? 7 : x < 1 ? 6 : 5);
      if (y > top + 8 && y % 6 === g.binding % 6) set(center, y, 9);
    }
    stroke(15, 44, 15, 57, 3, 3);
    for (let y = 46; y < 56; y += 3) stroke(15, y, 17, y - 1, 11);
    const span = 5 + g.crown;
    stroke(16 - span, 43 - (g.crown % 2), 16, 45, 12, 2);
    stroke(16, 45, 16 + span, 43 - (g.crown % 2), 12, 2);
    stroke(14, 58, 17, 58, 12, 2);
    set(16, 57, 9);
  } else if (g.kind === 'bow') {
    const bottom = 59,
      mid = (top + bottom) / 2,
      bend = 6 + g.breadth;
    let previous = { x: 12, y: top };
    for (let y = top + 1; y <= bottom; y++) {
      const x = 12 + Math.sin(((y - top) / (bottom - top)) * Math.PI) * bend;
      stroke(previous.x, previous.y, x, y, 3, 2);
      set(x, y, 4);
      previous = { x, y };
    }
    stroke(12, top, 12, bottom, 7);
    stroke(11, mid, 27, mid, 6);
    stroke(24, mid - 2, 27, mid, 7);
    stroke(27, mid, 24, mid + 2, 5);
    stroke(12 + bend, mid - 3, 12 + bend, mid + 3, 11, 2);
    set(13 + bend, mid, 9);
  } else {
    const radius = 5 + g.crown,
      cy = top + 8,
      neck = cy + radius;
    for (let y = neck; y <= 59; y++) {
      const x = 15 + Math.sin(((y - neck) / (59 - neck)) * Math.PI) * g.curvature;
      set(x, y, 2);
      set(x + 1, y, 3);
      if (g.breadth > 3) set(x + 2, y, 4);
      if (y > 40 && y < 49 && y % 2 === 0) stroke(x, y, x + 2, y, 11);
    }
    // Grow a symmetric botanical crown around a guaranteed connected stem/ring.
    const locked = new Uint8Array(w * h);
    const lock = (x: number, y: number) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        set(x, y, 12);
        locked[y * w + x] = 1;
      }
    };
    for (let y = cy; y <= neck + 2; y++) lock(16, y);
    for (let i = 0; i < 80; i++) {
      const t = (i * Math.PI * 2) / 80;
      lock(16 + Math.cos(t) * radius, cy + Math.sin(t) * (radius + 1));
    }
    let cells = new Uint8Array(w * h);
    for (let y = cy - radius - 2; y <= cy + radius + 2; y++)
      for (let x = 16 - radius - 2; x <= 16; x++)
        if (
          y > 0 &&
          Math.hypot((x - 16) / (radius + 1), (y - cy) / (radius + 2)) < 1.05 &&
          rng() > 0.48
        ) {
          cells[y * w + x] = 1;
          cells[y * w + (32 - x)] = 1;
        }
    for (let iteration = 0; iteration < 3; iteration++) {
      const next = new Uint8Array(w * h);
      for (let y = 1; y < Math.min(59, neck + 4); y++)
        for (let x = 2; x < 30; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (dx || dy)
                n += cells[(y + dy) * w + x + dx] || locked[(y + dy) * w + x + dx] ? 1 : 0;
          next[y * w + x] = locked[y * w + x] || n > 4 || (cells[y * w + x] && n > 2) ? 1 : 0;
        }
      cells = next;
    }
    // Remove detached ornaments; every visible cell must attach to the shaft.
    const queue = [(neck + 2) * w + 16],
      seen = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const d of [-w, -1, 1, w]) {
        const p = queue[i] + d;
        if (p >= 0 && p < cells.length && cells[p] && !seen.has(p)) {
          seen.add(p);
          queue.push(p);
        }
      }
    for (const p of seen) if (cells[p]) pixels[p] = locked[p] ? 12 : 3;
    for (let y = cy - 3; y <= cy + 3; y++)
      for (let x = 13; x <= 19; x++)
        if (Math.abs(x - 16) + Math.abs(y - cy) <= 3) set(x, y, x < 16 ? 10 : x === 16 ? 9 : 8);
    // The luminous seed is held by visible botanical filaments.
    stroke(16, cy + 3, 16, cy + radius, 12);
    stroke(16 - radius, cy, 13, cy, 12);
    stroke(19, cy, 16 + radius, cy, 12);
    set(15, cy - 1, 10);
  }
  // One-pixel outline is separate from the mask, so it never erodes slender handles.
  const out = pixels.slice();
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++)
      if (pixels[y * w + x]) {
        for (const d of [-w, -1, 1, w]) if (!pixels[y * w + x + d]) out[y * w + x + d] = 1;
        if (pixels[y * w + x] === 3 && rng() > 0.78) out[y * w + x] = 4;
      }
  return { width: w, height: h, pixels: out, palette: [...g.palette] };
}
const sprites = new Map<string, WeaponPixels>();
export function cachedWeaponPixels(seed: number, kind: WeaponKind) {
  const key = `${seed}:${kind}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    sprite = weaponPixels(weaponGenome(seed, kind));
    sprites.set(key, sprite);
    if (sprites.size > 96) sprites.delete(sprites.keys().next().value!);
  }
  return sprite;
}
export function weaponIcon(seed: number, kind: WeaponKind, size = 38) {
  const sprite = cachedWeaponPixels(seed, kind);
  let parts = '';
  for (let y = 0; y < sprite.height; y++)
    for (let x = 0; x < sprite.width; ) {
      const c = sprite.pixels[y * sprite.width + x];
      if (!c) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < sprite.width && sprite.pixels[y * sprite.width + end] === c) end++;
      parts += `<path fill="${sprite.palette[c]}" d="M${x} ${y}h${end - x}v1H${x}z"/>`;
      x = end;
    }
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" shape-rendering="crispEdges" aria-hidden="true"><g transform="translate(16)">${parts}</g></svg>`;
}
export function drawWeapon(
  ctx: CanvasRenderingContext2D,
  seed: number,
  kind: WeaponKind,
  x: number,
  y: number,
  scale: number,
  angle = 0,
) {
  const sprite = cachedWeaponPixels(seed, kind);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  for (let row = 0; row < sprite.height; row++)
    for (let col = 0; col < sprite.width; col++) {
      const c = sprite.pixels[row * sprite.width + col];
      if (c) {
        ctx.fillStyle = sprite.palette[c];
        ctx.fillRect(col - 16, row - 46, 1, 1);
      }
    }
  ctx.restore();
}
