import { deriveSeed, random } from '../procedural/random.ts';

export type WeaponKind = 'staff' | 'sword' | 'bow';
export type WeaponSubtype =
  | 'arming sword'
  | 'sabre'
  | 'dagger'
  | 'falchion'
  | 'needleblade'
  | 'walking pole'
  | 'forked staff'
  | 'crook'
  | 'root staff'
  | 'seed sceptre'
  | 'longbow'
  | 'recurve bow'
  | 'flatbow'
  | 'reflex bow';
export interface WeaponConstruction {
  version: 2;
  edge: number;
  taper: number;
  guard: 'bar' | 'swept' | 'disc' | 'hook' | 'none';
  grip: 'cord' | 'leather' | 'bare' | 'woven';
  pommel: 'cap' | 'ring' | 'drop' | 'none';
  shaft: 'straight' | 'bent' | 'knotted';
  flex: number;
  balance: number;
  handleWood: string;
  headMetal: string;
  gripColor: string;
  metalColor: string;
  exposedCore: boolean;
}
export interface WeaponGenome {
  generatorVersion: 2;
  subtype: WeaponSubtype;
  parts: WeaponConstruction;
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
  // Keep the original structural random stream stable: saved forge recipes remain resolvable.
  const length = 37 + Math.floor(rng() * 17),
    breadth = 2 + Math.floor(rng() * 4),
    curvature = (rng() - 0.5) * 5,
    crown = Math.floor(rng() * 4),
    binding = 3 + Math.floor(rng() * 4);
  const part = random(deriveSeed(seed, 'ordinary-construction', 2));
  const choose = <T>(xs: readonly T[]): T => xs[Math.floor(part() * xs.length)];
  const subtype = choose<WeaponSubtype>(
    kind === 'sword'
      ? ['arming sword', 'sabre', 'dagger', 'falchion', 'needleblade']
      : kind === 'staff'
        ? ['walking pole', 'forked staff', 'crook', 'root staff', 'seed sceptre']
        : ['longbow', 'recurve bow', 'flatbow', 'reflex bow'],
  );
  const wood = choose(materials.staff),
    metal = choose(materials.sword);
  const parts: WeaponConstruction = {
    version: 2,
    edge: 0.65 + part() * 0.65,
    taper: 0.15 + part() * 0.7,
    guard: choose(['bar', 'swept', 'disc', 'hook', 'none']),
    grip: choose(['cord', 'leather', 'bare', 'woven']),
    pommel: choose(['cap', 'ring', 'drop', 'none']),
    shaft: choose(['straight', 'bent', 'knotted']),
    flex: (kind === 'bow' ? 1.1 / material[1] : 0.7) * (0.7 + part() * 0.5),
    balance: 0.25 + part() * 0.6,
    handleWood: wood[0],
    headMetal: metal[0],
    gripColor: choose(['#704e3f', '#435755', '#796742', '#615873']),
    metalColor: metal[2],
    exposedCore: subtype === 'seed sceptre' || (subtype !== 'walking pole' && part() > 0.78),
  };
  return {
    generatorVersion: 2,
    subtype,
    parts,
    seed,
    kind,
    material: material[0],
    density: material[1],
    length,
    breadth,
    curvature,
    crown,
    binding,
    effect,
    palette: [
      'transparent',
      '#101923',
      shade(material[2], -40),
      material[2],
      shade(material[2], 34),
      shade(kind === 'sword' ? material[2] : metal[2], -38),
      kind === 'sword' ? material[2] : metal[2],
      shade(kind === 'sword' ? material[2] : metal[2], 55),
      shade(core, -44),
      core,
      shade(core, 52),
      parts.gripColor,
      shade(metal[2], 18),
      shade(wood[2], -30),
      wood[2],
      shade(wood[2], 30),
    ],
  };
}
export function weaponProfile(ownerSeed: number, kind: WeaponKind, level: number) {
  return weaponProfileFromGenome(weaponGenome(ownerSeed, kind), level);
}
export function weaponProfileFromGenome(g: WeaponGenome, level: number) {
  const kind = g.kind;
  const shape = {
    'arming sword': [1, 1, 1],
    sabre: [1, 0.94, 1.05],
    dagger: [0.67, 0.7, 0.78],
    falchion: [0.9, 1.3, 1.12],
    needleblade: [1.1, 0.72, 1.02],
    'walking pole': [1, 0.72, 0.85],
    'forked staff': [1, 0.97, 1.05],
    crook: [0.94, 1.05, 1],
    'root staff': [0.93, 1.18, 1.1],
    'seed sceptre': [0.8, 1.2, 1.15],
    longbow: [1.1, 1, 1],
    'recurve bow': [0.96, 0.95, 1.15],
    flatbow: [0.95, 1.2, 1.05],
    'reflex bow': [0.9, 0.82, 1.2],
  }[g.subtype] ?? [1, 1, 1];
  const mass = g.density * (g.length / 45) * (0.7 + g.breadth * 0.12) * shape[1];
  const leverage = 0.8 + g.parts.balance * 0.4;
  const prefix = { stagger: 'Steadfast', breath: 'Breathkeeper', warmth: 'Emberbound' }[g.effect];
  return {
    name: `${prefix} ${g.material} ${g.subtype}`,
    material: g.material,
    effect: g.effect,
    effectDescription: {
      stagger: 'Successful hits delay the target’s next attack.',
      breath: 'Successful hits restore two breath.',
      warmth: 'Successful hits restore three warmth.',
    }[g.effect],
    color: g.palette[9],
    damage: Math.round(
      (kind === 'sword'
        ? 17 + g.parts.edge * 5
        : kind === 'bow'
          ? 12 + g.parts.flex * 3 * shape[2]
          : 13 + shape[2] * 3) +
        mass * 3.2 * leverage +
        level * 2,
    ),
    range: Number(
      (kind === 'bow'
        ? 5.9 + g.length * 0.045 * shape[0] + g.parts.flex * 0.65
        : 0.72 + g.length * 0.019 * shape[0]
      ).toFixed(2),
    ),
    cooldown: Number(
      ((kind === 'sword' ? 0.34 : kind === 'bow' ? 0.5 : 0.42) + mass * 0.13 * leverage).toFixed(2),
    ),
    construction: `${g.subtype} · ${g.material} · ${g.length} span · ${g.parts.handleWood} ${g.parts.grip} grip · ${kind === 'sword' ? `${g.parts.guard} guard / ${g.parts.pommel} pommel` : kind === 'bow' ? `${g.parts.flex.toFixed(2)} flex / ${g.breadth} limb` : `${g.parts.shaft} shaft / ${g.parts.headMetal} ferrule`}`,
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
    rng = random(deriveSeed(g.seed, 'grain-v2'));
  const set = (x: number, y: number, c: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x > 0 && x < w - 1 && y > 0 && y < h - 1) pixels[y * w + x] = c;
  };
  // Staircase rasterization keeps diagonal structural members four-connected at pixel scale.
  const stroke = (x: number, y: number, tx: number, ty: number, c: number, breadth = 1) => {
    let px = Math.round(x),
      py = Math.round(y);
    const n = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) * 2));
    const dot = () => {
      for (let k = 0; k < breadth; k++) set(px + k, py, c);
    };
    dot();
    for (let i = 1; i <= n; i++) {
      const nx = Math.round(x + ((tx - x) * i) / n),
        ny = Math.round(y + ((ty - y) * i) / n);
      while (px !== nx) {
        px += Math.sign(nx - px);
        dot();
      }
      while (py !== ny) {
        py += Math.sign(ny - py);
        dot();
      }
    }
  };
  const ring = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    c: number,
    start = 0,
    end = Math.PI * 2,
  ) => {
    let p = [cx + Math.cos(start) * rx, cy + Math.sin(start) * ry];
    for (let i = 1; i <= 48; i++) {
      const t = start + ((end - start) * i) / 48,
        q = [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
      stroke(p[0], p[1], q[0], q[1], c);
      p = q;
    }
  };
  const top = 59 - g.length,
    p = g.parts;
  const grip = (x: number, a: number, b: number, width = 3) => {
    stroke(x, a, x, b, p.grip === 'bare' ? 14 : 11, width);
    if (p.grip !== 'bare')
      for (let y = a + 1; y < b; y += g.binding - 1)
        stroke(x, y, x + width - 1, y - (p.grip === 'woven' ? 1 : 0), p.grip === 'cord' ? 12 : 4);
  };
  if (g.kind === 'sword') {
    const guardY = 44,
      bladeTop = g.subtype === 'dagger' ? top + 12 : top;
    let prev = { x: 16, y: guardY };
    for (let y = guardY; y >= bladeTop; y--) {
      const t = (guardY - y) / Math.max(1, guardY - bladeTop);
      const curve =
        g.subtype === 'sabre'
          ? (4 + Math.abs(g.curvature)) * t * t
          : g.subtype === 'falchion'
            ? 3 * t * t
            : g.curvature * 0.2 * Math.sin(t * Math.PI);
      const center = 16 + curve;
      const bulb = g.subtype === 'falchion' ? 1 + Math.sin(t * Math.PI) * 0.65 : 1;
      const base = g.subtype === 'needleblade' ? 1.1 : g.breadth * 0.65;
      const half = Math.max(0.2, base * bulb * (1 - t * p.taper) * Math.min(1, (1 - t) * 7 + 0.15));
      stroke(prev.x, prev.y, center, y, 6);
      for (let x = Math.floor(center - half); x <= Math.ceil(center + half); x++)
        set(x, y, x < center ? 7 : x > center + half * 0.5 ? 5 : 6);
      prev = { x: center, y };
    }
    grip(15, 44, 56);
    const span = 3 + g.crown;
    if (p.guard === 'bar') stroke(16 - span, 44, 16 + span, 44, 12, 2);
    if (p.guard === 'swept') {
      stroke(16 - span, 41, 16, 45, 12);
      stroke(16, 45, 16 + span, 41, 12);
    }
    if (p.guard === 'disc') {
      stroke(12, 44, 20, 44, 6);
      stroke(13, 43, 19, 43, 12);
    }
    if (p.guard === 'hook') {
      stroke(12, 44, 22, 44, 12);
      ring(20, 47, 3, 4, 6, -Math.PI / 2, Math.PI / 2);
      stroke(20, 51, 17, 53, 6);
    }
    if (p.pommel === 'cap') stroke(14, 57, 18, 57, 12, 1);
    if (p.pommel === 'ring') {
      stroke(16, 56, 16, 57, 12);
      ring(16, 59, 2, 2, 12);
    }
    if (p.pommel === 'drop') {
      stroke(15, 57, 17, 57, 6);
      stroke(16, 57, 16, 60, 12);
    }
    if (p.exposedCore) {
      set(16, 44, 9);
      set(16, 43, 10);
    }
  } else if (g.kind === 'bow') {
    const mid = (top + 59) / 2,
      bend = 5 + g.breadth + p.flex;
    let previous = { x: 11, y: top };
    for (let y = top; y <= 59; y++) {
      const t = (y - top) / (59 - top);
      let x = 11 + Math.sin(t * Math.PI) * bend;
      if (g.subtype === 'recurve bow') x -= Math.sin(t * Math.PI * 3) * 3;
      if (g.subtype === 'reflex bow') x += Math.cos(t * Math.PI * 4) * 2 - 2;
      if (g.subtype === 'flatbow') x = 11 + (1 - Math.abs(t * 2 - 1)) * bend;
      const width = g.subtype === 'flatbow' ? 3 : 2;
      stroke(previous.x, previous.y, x, y, 3, width);
      set(x, y, 4);
      previous = { x, y };
    }
    const endX = g.subtype === 'reflex bow' ? 11 : 11;
    stroke(endX, top, endX, 59, 7);
    grip(
      Math.round(11 + bend + (g.subtype === 'recurve bow' ? 3 : 0)),
      Math.round(mid - 3),
      Math.round(mid + 3),
      2,
    );
    // Bind the grip to the actual central limb even on recurved profiles.
    stroke(11 + bend, mid, 11 + bend + (g.subtype === 'recurve bow' ? 3 : 0), mid, 11, 2);
    if (p.exposedCore) set(12 + bend, mid, 9);
  } else {
    const ornate = g.subtype === 'seed sceptre',
      cy = top + (ornate ? 7 : 4),
      neck = ornate ? cy + 7 : g.subtype === 'crook' ? cy + 5 : top + 5;
    const center = (y: number) =>
      15 +
      (p.shaft === 'straight' ? 0 : Math.sin(((y - neck) / (59 - neck)) * Math.PI) * g.curvature) +
      (p.shaft === 'knotted' ? Math.sin(y * 0.5) * 0.65 : 0);
    let prev = { x: center(neck), y: neck };
    for (let y = neck; y <= 59; y++) {
      const x = center(y);
      stroke(prev.x, prev.y, x, y, 3, g.breadth > 3 ? 3 : 2);
      set(x, y, 4);
      prev = { x, y };
    }
    stroke(center(57), 57, center(59), 59, 6, 2);
    grip(Math.round(center(46)), 42, 49, g.breadth > 3 ? 3 : 2);
    stroke(center(42), 42, center(49), 49, p.grip === 'bare' ? 14 : 11, 2);
    if (g.subtype === 'walking pole') stroke(15, top, 15, neck, 3, 2);
    if (g.subtype === 'forked staff') {
      stroke(15, neck, 10 - g.crown, top, 3, 2);
      stroke(15, neck, 21 + g.crown, top + 1, 3, 2);
    }
    if (g.subtype === 'crook') {
      stroke(15, neck, 15, cy, 3, 2);
      ring(19, cy, 4, 4, 3, Math.PI, Math.PI * 2.4);
    }
    if (g.subtype === 'root staff') {
      stroke(15, neck, 15, top, 3, 3);
      for (let i = 0; i < 3; i++) {
        const side = i % 2 ? -1 : 1,
          by = top + 3 + i * 3;
        stroke(16, by + 4, 16 + side * (5 + i), by, 3, 2);
        stroke(16 + side * (5 + i), by, 16 + side * (6 + i), by - 2, 4);
      }
    }
    if (ornate) {
      stroke(16, neck, 16, cy, 12);
      ring(16, cy, 5 + g.crown * 0.5, 6, 3);
      stroke(16, cy + 6, 16, cy - 3, 12);
      for (let y = -3; y <= 3; y++)
        for (let x = -2; x <= 2; x++)
          if (Math.abs(x) + Math.abs(y) < 4) set(16 + x, cy + y, x < 0 ? 10 : x ? 8 : 9);
    }
  }
  // The silhouette, bindings and highlights all belong to one connected manufactured object.
  const out = pixels.slice();
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++)
      if (pixels[y * w + x]) {
        for (const d of [-w, -1, 1, w]) if (!pixels[y * w + x + d]) out[y * w + x + d] = 1;
        if (pixels[y * w + x] === 3 && rng() > 0.82) out[y * w + x] = 4;
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
