import { deriveSeed, random } from '../procedural/random.ts';
import type { RockMaterial, Tile, TreeForm } from './types.ts';
import type { Sprite } from './art.ts';

type Ctx = CanvasRenderingContext2D;
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const rgb = (hex: string) => [16, 8, 0].map((n) => (parseInt(hex.slice(1), 16) >> n) & 255);
export function blendColor(a: string, b: string, t: number) {
  const x = rgb(a),
    y = rgb(b),
    v = Math.max(0, Math.min(1, t));
  return (
    '#' +
    x
      .map((n, i) =>
        clamp(n + (y[i] - n) * v)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
const shade = (a: string, n: number) =>
  '#' +
  rgb(a)
    .map((c) =>
      clamp(c + n)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}
function poly(c: Ctx, pts: number[][], fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  pts.forEach(([x, y], i) =>
    i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)),
  );
  c.closePath();
  c.fill();
}
function line(c: Ctx, x: number, y: number, xx: number, yy: number, fill: string, width = 1) {
  const steps = Math.max(Math.abs(xx - x), Math.abs(yy - y), 1);
  for (let i = 0; i <= steps; i++)
    rect(c, x + ((xx - x) * i) / steps, y + ((yy - y) * i) / steps, width, width, fill);
}
function sprite(w: number, h: number, x: number, y: number, paint: (c: Ctx) => void): Sprite {
  const image = document.createElement('canvas');
  image.width = w;
  image.height = h;
  const c = image.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  paint(c);
  return { image, x, y };
}

/** Ground color is a continuous climate response; individual tiles never choose random palettes. */
export function regionalGroundColor(tile: Tile) {
  const e = tile.ecology,
    wet = e?.moisture ?? 0.5;
  if (tile.terrain === 'snow') return '#bccce0';
  if (tile.terrain === 'ice') return '#92b6c8';
  if (tile.terrain === 'water') return blendColor('#376b79', '#284f56', wet);
  if (tile.terrain === 'sand') return blendColor('#c3ad79', '#bb936e', wet);
  if (tile.terrain === 'basalt') return '#55595c';
  if (tile.terrain === 'mud') return blendColor('#756d55', '#425e54', wet);
  if (tile.terrain === 'bridge') return tile.architecture?.woodColor ?? '#76634f';
  if (tile.terrain === 'wall' || tile.terrain === 'floor')
    return shade(tile.architecture?.wallColor ?? '#74818a', -15);
  if (tile.terrain === 'road')
    return blendColor(tile.architecture?.wallColor ?? '#a6a28c', '#aeb8ac', 0.4);
  const grass = blendColor('#a1a36b', '#537c5a', wet);
  return blendColor(grass, '#8a9fa1', Math.max(0, Math.min(0.8, (4 - tile.temperature) / 30)));
}

// Low-frequency ground relief spans many tiles; the small grain sits inside these shared patches.
function surfaceField(x: number, y: number, scale: number, salt: number) {
  const ix = Math.floor(x / scale),
    iy = Math.floor(y / scale);
  const fx = x / scale - ix,
    fy = y / scale - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const hash = (a: number, b: number) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ salt;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
  };
  return (
    (hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx) * (1 - sy) +
    (hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx) * sy
  );
}

// A world-space cellular surface: fractures and stones continue across tile edges.
function mineralSurface(c: Ctx, tile: Tile, base: string, basalt: boolean) {
  const sx = basalt ? 35 : 13,
    sy = basalt ? 29 : 9,
    ox = tile.x * 32,
    oy = tile.y * 32;
  const hash = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ (basalt ? 12713 : 919);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  };
  const cells: { x: number; y: number; seed: number }[] = [];
  for (let yy = Math.floor(oy / sy) - 1; yy <= Math.floor((oy + 31) / sy) + 1; yy++)
    for (let xx = Math.floor(ox / sx) - 1; xx <= Math.floor((ox + 31) / sx) + 1; xx++) {
      const h = hash(xx, yy);
      cells.push({
        x: (xx + 0.18 + ((h & 255) / 255) * 0.64) * sx,
        y: (yy + 0.18 + (((h >>> 8) & 255) / 255) * 0.64) * sy,
        seed: h,
      });
    }
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      let first = Infinity,
        second = Infinity,
        chosen = cells[0];
      for (const cell of cells) {
        const dx = (x + ox - cell.x) / sx,
          dy = (y + oy - cell.y) / sy,
          d = dx * dx + dy * dy;
        if (d < first) {
          second = first;
          first = d;
          chosen = cell;
        } else if (d < second) second = d;
      }
      const gap = second - first,
        grain = hash(x + ox, y + oy),
        rim = basalt ? 0.026 : 0.046;
      let light = (chosen.seed % 23) - 11 + (grain % 5) - 2;
      light += (surfaceField(x + ox, y + oy, 117, basalt ? 197 : 283) - 0.5) * 22;
      if (gap < rim) light = basalt ? -29 : -22;
      else if (gap < rim * 2.1) light += x + ox < chosen.x && y + oy < chosen.y ? 19 : -8;
      const hot =
        basalt &&
        (tile.ecology?.geothermal ?? 0) > 0.72 &&
        chosen.seed % 11 === 0 &&
        gap < rim * 0.55;
      rect(c, x, y, 1, 1, hot ? '#ad7150' : shade(base, light));
    }
}

export function makeRegionalGround(tile: Tile): Sprite {
  const r = random(deriveSeed(tile.seed % 32, 'ground-v4', tile.terrain)),
    base = regionalGroundColor(tile);
  return sprite(32, 32, 16, 16, (c) => {
    rect(c, 0, 0, 32, 32, base);
    if (['grass', 'sand', 'mud', 'snow'].includes(tile.terrain)) {
      for (let y = 0; y < 32; y += 2)
        for (let x = 0; x < 32; x += 2) {
          const wx = tile.x * 32 + x,
            wy = tile.y * 32 + y;
          const broad = surfaceField(wx, wy, 126, 593);
          const fold = surfaceField(wx, wy, 37, 229);
          let tone = (broad - 0.5) * 36 + (fold - 0.5) * 11;
          if (tile.terrain === 'sand') {
            const wave = Math.sin(wx / 53 + wy / 24 + broad * 3.2);
            tone += Math.max(0, wave) * 9 - Math.max(0, -wave) * 5;
          }
          rect(c, x, y, 2, 2, shade(base, tone));
        }
    }
    if (['road', 'floor', 'wall'].includes(tile.terrain)) {
      const wood = tile.architecture?.wallMaterial === 'timber' && !!tile.building;
      if (
        !wood &&
        (tile.architecture?.technology ?? 0) > 0.62 &&
        ['metal', 'glass', 'composite'].includes(tile.architecture?.wallMaterial ?? '')
      ) {
        const dark = shade(base, -18);
        rect(c, 0, 0, 32, 32, shade(base, (tile.seed % 7) - 3));
        rect(c, 0, 0, 32, 1, dark);
        rect(c, 0, 0, 1, 32, dark);
        rect(c, 2, 2, 28, 1, shade(base, 12));
        rect(c, 2, 3, 1, 27, shade(base, 7));
        if (tile.building) {
          for (const x of [4, 27]) for (const y of [4, 27]) rect(c, x, y, 1, 1, shade(base, -26));
        }
        for (let n = 0; n < 15; n++) rect(c, r() * 32, r() * 32, 1, 1, shade(base, r() * 12 - 6));
        return;
      }
      if (!wood) {
        mineralSurface(c, tile, base, false);
        return;
      }
      for (let y = -1, row = 0; y < 32; y += wood ? 5 : 7, row++)
        for (let x = -10; x < 32; x += wood ? 34 : 11) {
          const xx = x + (row % 2) * 5,
            tone = shade(base, r() * 16 - 8);
          rect(c, xx + 1, y + 1, wood ? 33 : 10, wood ? 4 : 6, tone);
          rect(c, xx + 2, y + 1, wood ? 30 : 8, 1, shade(tone, 11));
        }
    } else if (tile.terrain === 'sand') {
      // Wind combs long shared dune contours, rather than restarting a stripe on each square.
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x += 2) {
          const wx = tile.x * 32 + x,
            wy = tile.y * 32 + y;
          const contour = wy + Math.sin(wx / 47) * 5 + Math.sin(wx / 101) * 9;
          if (((contour % 19) + 19) % 19 < 0.85) rect(c, x, y, 2, 1, shade(base, 9));
        }
      if (r() > 0.75)
        for (let n = 0; n < 5; n++) {
          const x = 8 + r() * 15,
            y = 10 + r() * 12;
          rect(c, x, y, 2 + r() * 2, 1, shade(base, -15));
          rect(c, x, y - 1, 2, 1, shade(base, 12));
        }
    } else if (tile.terrain === 'basalt') {
      mineralSurface(c, tile, base, true);
    } else if (tile.terrain === 'water' || tile.terrain === 'ice') {
      for (let i = 0; i < 8; i++)
        rect(c, r() * 32, r() * 32, 3 + r() * 10, 1, shade(base, r() * 24 - 5));
      if (tile.terrain === 'ice') line(c, 5, 0, 14, 20, shade(base, 24));
    } else if (tile.terrain === 'bridge') {
      for (let y = 0; y < 32; y += 6) {
        rect(c, 0, y, 32, 5, shade(base, r() * 14 - 7));
        rect(c, 2, y + 1, 28, 1, shade(base, 12));
      }
      for (const x of [3, 27]) for (let y = 2; y < 32; y += 6) rect(c, x, y, 1, 1, '#38474a');
    } else {
      for (let i = 0; i < 18; i++)
        rect(c, r() * 32, r() * 32, 1 + r() * 3, 1, shade(base, r() * 24 - 12));
      if (tile.terrain === 'grass') {
        // Overlapping moss and low foliage clusters read as ground cover, with breathing space for paths.
        const cover = tile.ecology?.groundCover ?? 0.5;
        for (let patch = 0; patch < 2 + cover * 4; patch++) {
          const px = r() * 32,
            py = r() * 32,
            span = 3 + r() * 6,
            tone = shade(base, r() * 20 - 14);
          for (let n = 0; n < 14; n++) {
            const dx = (r() - 0.5) * span * 2,
              dy = (r() - 0.5) * span;
            if ((dx * dx) / span ** 2 + (dy * dy) / (span * 0.6) ** 2 > 1) continue;
            rect(c, px + dx, py + dy, 2 + r() * 3, 1 + r() * 2, tone);
            if (r() > 0.6) rect(c, px + dx, py + dy - 1, 2, 1, shade(tone, 25));
          }
        }
        for (let i = 0; i < 5 + cover * 8; i++) {
          const x = r() * 32,
            y = r() * 32;
          line(c, x, y, x - 1, y - 2, shade(base, -14));
          rect(c, x + 1, y - 3, 1, 2, shade(base, 23));
          if (
            (tile.biome === 'meadow' || tile.biome === 'woodland' || tile.biome === 'settlement') &&
            tile.temperature > 4 &&
            r() > 0.72
          )
            rect(c, x, y - 3, 2, 1, r() > 0.5 ? '#dacb95' : '#af95af');
        }
      }
      if (tile.terrain === 'mud')
        for (let i = 0; i < 3; i++) rect(c, r() * 32, r() * 32, 4 + r() * 6, 2, '#63837a');
    }
    for (let i = 0; i < 12; i++)
      rect(c, r() * 32, r() * 32, 1, 1, shade(base, r() > 0.5 ? 18 : -15));
  });
}

export interface TreeConstruction {
  form: TreeForm;
  height: number;
  spread: number;
  trunk: number;
  branches: { x: number; y: number; size: number }[];
  leaf: string;
  bark: string;
}
/** Branch anchors and canopy masses share one organism; silhouettes are not scattered particles. */
export function treeConstruction(seed: number, form: TreeForm): TreeConstruction {
  const r = random(deriveSeed(seed, 'regional-tree-v4', form));
  const height = 85 + Math.floor(r() * 43),
    spread = form === 'acacia' ? 54 : form === 'willow' ? 47 : 37 + r() * 16;
  const leaf = {
    conifer: '#426956',
    broadleaf: '#638750',
    willow: '#64856b',
    acacia: '#8a9561',
    palm: '#6c9362',
    cactus: '#739582',
    snag: '#776d65',
  }[form];
  const branches = Array.from(
    { length: form === 'snag' ? 5 : 5 + Math.floor(r() * 4) },
    (_, i) => ({
      x: (r() - 0.5) * spread * 1.6,
      y: -height * 0.56 - r() * height * 0.28,
      size: 17 + r() * 16,
    }),
  );
  return {
    form,
    height,
    spread,
    trunk: 6 + Math.floor(r() * 4),
    branches,
    leaf: shade(leaf, r() * 18 - 9),
    bark: form === 'cactus' ? '#598474' : form === 'broadleaf' && r() > 0.5 ? '#aaa99a' : '#796951',
  };
}
export function makeRegionalTree(form: TreeForm, seed: number): Sprite {
  const g = treeConstruction(seed, form),
    r = random(deriveSeed(seed, 'tree-leaves-v4'));
  return sprite(192, 208, 96, 196, (c) => {
    const x = 96,
      foot = 196;
    poly(
      c,
      [
        [x - 13, foot],
        [x - 4, foot - 7],
        [x + 6, foot - 7],
        [x + 18, foot],
      ],
      '#344e4340',
    );
    const branch = (xx: number, yy: number, w: number) => {
      line(
        c,
        x - g.trunk / 2,
        foot,
        x - g.trunk / 2,
        foot - g.height * 0.6,
        shade(g.bark, -22),
        g.trunk + 2,
      );
      line(
        c,
        x - g.trunk / 2 + 1,
        foot - 1,
        x - g.trunk / 2 + 1,
        foot - g.height * 0.6,
        g.bark,
        g.trunk,
      );
      line(c, x, foot - g.height * 0.38, x + xx, foot + yy, shade(g.bark, -20), w + 2);
      line(c, x + 1, foot - g.height * 0.38, x + xx + 1, foot + yy, g.bark, w);
    };
    if (form === 'cactus') {
      branch(0, -g.height, 7);
      for (const s of [-1, 1]) {
        const yy = foot - g.height * (s === 1 ? 0.6 : 0.4);
        line(c, x, yy, x + s * 15, yy, '#3f6258', 8);
        line(c, x + s * 15, yy, x + s * 15, yy - 24, '#3f6258', 8);
        line(c, x + s * 15 + 2, yy - 2, x + s * 15 + 2, yy - 23, '#83aa91', 3);
      }
      line(c, x + 2, foot - 3, x + 2, foot - g.height, '#91b199', 2);
      for (let i = 0; i < 12; i++) rect(c, x - 3 + (i % 2) * 7, foot - i * 7, 1, 2, '#c0c49d');
      rect(c, x - 2, foot - g.height - 2, 5, 3, '#cfad91');
      return;
    }
    if (form !== 'conifer') for (const b of g.branches) branch(b.x, b.y, 3);
    branch(0, -g.height * 0.88, g.trunk - 1);
    if (form === 'snag') {
      for (const b of g.branches) {
        line(
          c,
          x + b.x,
          foot + b.y,
          x + b.x + Math.sign(b.x) * 8,
          foot + b.y - 13,
          shade(g.bark, 10),
          2,
        );
      }
      return;
    }
    if (form === 'palm') {
      const top = foot - g.height * 0.87;
      for (let n = 0; n < 9; n++) {
        const angle = (n / 9) * Math.PI * 2,
          end = x + Math.cos(angle) * 38,
          yy = top + Math.sin(angle) * 14 + 12;
        line(c, x, top, end, yy, shade(g.leaf, -20), 3);
        for (let j = 0; j < 9; j++) {
          const t = j / 9,
            xx = x + (end - x) * t,
            y = top + (yy - top) * t;
          line(c, xx, y, xx + Math.cos(angle + 1) * 8, y + 8, g.leaf, 2);
          line(c, xx, y, xx + Math.cos(angle - 1) * 8, y + 5, shade(g.leaf, 15), 2);
        }
      }
      for (let y = foot - g.height * 0.7; y < foot; y += 7)
        rect(c, x - g.trunk / 2, y, g.trunk, 2, shade(g.bark, -15));
      return;
    }
    const clump = (xx: number, yy: number, rx: number, ry: number) => {
      const pts = Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2,
          k = 0.78 + r() * 0.22;
        return [xx + Math.cos(a) * rx * k, yy + Math.sin(a) * ry * k];
      });
      poly(c, pts, shade(g.leaf, -26));
      for (let i = 0; i < 155; i++) {
        const dx = (r() - 0.5) * rx * 2,
          dy = (r() - 0.5) * ry * 2;
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 0.84) continue;
        const lit = -dx / rx - dy / ry;
        const density = Math.max(0, Math.min(1, (lit + 0.65) / 2));
        let tone = blendColor('#203f37', g.leaf, 0.48 + density * 0.52);
        if (lit > 0.35) tone = blendColor(tone, '#c2ba76', (lit - 0.35) * 0.16);
        tone = shade(tone, r() * 14 - 7);
        const ww = 3 + r() * 5,
          hh = 2 + r() * 3;
        rect(c, xx + dx, yy + dy + 1, ww, hh, shade(tone, -13));
        rect(c, xx + dx, yy + dy, ww - 1, Math.max(1, hh - 1), tone);
        if (r() > 0.7 && lit > 0.4) {
          rect(c, xx + dx, yy + dy, 2, 1, shade(tone, 22));
          rect(c, xx + dx + 1, yy + dy - 1, 1, 1, shade(tone, 28));
        }
      }
    };
    if (form === 'conifer') {
      for (let i = 0; i < 8; i++) {
        const yy = foot - g.height + i * 12,
          span = 6 + i * 5;
        clump(x, yy + 8, span, 13);
      }
    } else {
      // Dark connected crown establishes depth before overlapping sunlit lobes.
      clump(x, foot - g.height * 0.69, g.spread * 0.88, g.spread * 0.61);
      for (const b of [...g.branches].sort((a, b) => a.y - b.y))
        clump(
          x + b.x,
          foot + b.y,
          b.size * (form === 'acacia' ? 1.3 : 1),
          b.size * (form === 'acacia' ? 0.5 : 0.85),
        );
      clump(x, foot - g.height * 0.88, g.spread * 0.7, g.spread * 0.52);
    }
    if (form === 'willow')
      for (let n = 0; n < 23; n++) {
        const xx = x + (r() - 0.5) * g.spread * 1.7,
          yy = foot - g.height * 0.78 + r() * 10,
          len = 20 + r() * 28;
        line(c, xx, yy, xx + Math.sin(n) * 4, yy + len, shade(g.leaf, -18));
        for (let d = 1; d < len; d += 3)
          rect(c, xx + Math.sin(n + d * 0.1) * 3, yy + d, 2, 3, shade(g.leaf, r() * 22));
      }
    for (let n = 0; n < 14; n++) {
      const xx = x + (r() - 0.5) * 31,
        yy = foot - 1 + r() * 5;
      rect(c, xx, yy, 3 + r() * 4, 2, shade(g.leaf, -23));
      line(c, xx + 2, yy, xx + 1, yy - 3 - r() * 4, shade(g.leaf, 9));
    }
    line(c, x - 4, foot - 3, x - 12, foot, g.bark, 2);
    line(c, x + 3, foot - 4, x + 10, foot, g.bark, 2);
  });
}

export function makeRegionalRock(material: RockMaterial, seed: number): Sprite {
  const r = random(deriveSeed(seed, material, 'rock-v4'));
  const base = {
    granite: '#849092',
    slate: '#687984',
    sandstone: '#bd9674',
    basalt: '#57515c',
    limestone: '#b6b59e',
  }[material];
  return sprite(64, 58, 32, 51, (c) => {
    const w = 17 + r() * 11,
      h = 14 + r() * 14;
    const pts = [
      [32 - w, 48],
      [30 - w, 44 - h * 0.4],
      [23 - w * 0.25, 44 - h],
      [35 + w * 0.2, 40 - h],
      [32 + w, 46 - h * 0.5],
      [32 + w, 49],
      [37, 53],
    ];
    poly(c, pts, shade(base, -27));
    poly(
      c,
      [
        [32 - w + 2, 44 - h * 0.4],
        [23 - w * 0.25, 44 - h + 1],
        [35 + w * 0.2, 41 - h],
        [38, 44 - h * 0.3],
        [31, 48],
      ],
      base,
    );
    poly(
      c,
      [
        [23 - w * 0.25, 44 - h + 1],
        [35 + w * 0.2, 41 - h],
        [38, 44 - h * 0.3],
        [28, 45 - h * 0.4],
      ],
      shade(base, 22),
    );
    for (let i = 0; i < 60; i++) {
      const x = 32 + (r() - 0.5) * w * 1.5,
        y = 47 - r() * h * 0.7;
      rect(c, x, y, 1 + r() * 2, 1, shade(base, r() * 30 - 12));
    }
    if (material === 'slate' || material === 'sandstone')
      for (let i = 0; i < 4; i++)
        line(c, 32 - w + 4, 45 - i * 4, 32 + w - 4, 47 - i * 4, shade(base, -12));
    const vein =
      material === 'basalt' ? '#ac8260' : material === 'sandstone' ? '#d6bc91' : '#bbbbb0';
    line(c, 24, 48 - h * 0.6, 33, 46 - h * 0.2, vein, 2);
    line(c, 33, 46 - h * 0.2, 42, 47 - h * 0.45, vein);
  });
}
