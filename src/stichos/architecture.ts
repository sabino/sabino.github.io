import { deriveSeed, random } from '../procedural/random.ts';
import type { ArchitecturalCulture, BuildingKind } from './types.ts';
import { color, line, poly, rect, type Sprite } from './art.ts';

/** Function, available materials, climate and local craft constrain each generated building. */
export function architectureGenome(
  kind: BuildingKind,
  seed: number,
  columns: number,
  rows: number,
  culture: ArchitecturalCulture,
) {
  const r = random(deriveSeed(seed, culture.seed, kind, 'architecture-v4'));
  const technology = culture.technology ?? 0,
    industrial = culture.industry ?? 0;
  return {
    seed,
    kind,
    columns,
    rows,
    culture,
    technology,
    industrial,
    facade:
      { house: 64, inn: 102, workshop: 76, greenhouse: 55, storehouse: 60, hall: 96, church: 125 }[
        kind
      ] + Math.floor(r() * 13),
    rise:
      culture.roof === 'flat'
        ? 0
        : culture.roof === 'terraced'
          ? 15
          : culture.roof === 'steep'
            ? 57 + Math.floor(r() * 17)
            : 34 + Math.floor(r() * 18),
    bayCount: Math.max(2, Math.floor(columns / (kind === 'church' ? 2.8 : 1.8))),
    ridge: 0.42 + r() * 0.16,
    raised: culture.raised ? 18 : 0,
    gallery:
      (kind === 'inn' || kind === 'hall') && (culture.wallMaterial === 'timber' || r() > 0.45),
    dormers:
      culture.roof !== 'flat' && ['house', 'inn', 'hall'].includes(kind)
        ? 1 + Math.floor(r() * 2)
        : 0,
    chimney: kind === 'workshop' || kind === 'inn' || (kind === 'house' && r() > 0.4),
    wing: kind === 'church' || (kind === 'hall' && r() > 0.45),
    roofPlanting: (culture.organics ?? 0) > 0.66 && culture.roof !== 'steep',
    illuminated: technology > 0.67 && (culture.illumination ?? 0) > 0.35,
    glass:
      kind === 'greenhouse' ||
      (technology > 0.65 && (culture.transparency ?? 0) > 0.55 && r() < 0.32),
    structuralColor: color(culture.wallColor, -43),
  };
}

export function makeRegionalBuilding(
  kind: BuildingKind,
  seed: number,
  columns: number,
  rows: number,
  culture: ArchitecturalCulture,
): Sprite {
  const g = architectureGenome(kind, seed, columns, rows, culture),
    r = random(deriveSeed(seed, culture.seed, 'building-detail-v4'));
  const w = columns * 32,
    h = rows * 32,
    x = 36,
    y = 194,
    front = y + h,
    mid = x + w / 2,
    eave = front - g.facade - g.raised,
    back = y - 22;
  const image = document.createElement('canvas');
  image.width = w + 72;
  image.height = h + 224;
  const c = image.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const wall = culture.wallColor,
    roof = culture.roofColor,
    wood = culture.woodColor,
    trim = culture.accentColor,
    dark = g.structuralColor;
  const frost = culture.style === 'alpine';
  const clip = (points: number[][], paint: () => void) => {
    c.save();
    c.beginPath();
    points.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
    c.closePath();
    c.clip();
    paint();
    c.restore();
  };
  const boards = (xx: number, yy: number, ww: number, hh: number, vertical = false) => {
    rect(c, xx, yy, ww, hh, color(wood, -27));
    for (let n = 0; n < (vertical ? ww : hh); n += 7) {
      const tone = color(wood, r() * 18 - 9);
      rect(
        c,
        xx + (vertical ? n : 0),
        yy + (vertical ? 0 : n),
        vertical ? Math.min(6, ww - n) : ww,
        vertical ? hh : Math.min(6, hh - n),
        tone,
      );
      if (vertical) line(c, xx + n + 2, yy + 3, xx + n + 2, yy + hh - 3, color(tone, 12));
      else line(c, xx + 3, yy + n + 1, xx + ww - 3, yy + n + 1, color(tone, 10));
    }
  };
  const masonry = (xx: number, yy: number, ww: number, hh: number, tone = wall) => {
    rect(c, xx, yy, ww, hh, color(tone, -22));
    const bw = culture.wallMaterial === 'adobe' ? 24 : culture.wallMaterial === 'basalt' ? 17 : 15,
      bh = culture.wallMaterial === 'adobe' ? 12 : 8;
    for (let j = 0; j < hh; j += bh)
      for (let k = -bw; k < ww; k += bw) {
        const left = Math.max(0, k + (((j / bh) % 2) * bw) / 2),
          right = Math.min(ww, k + (((j / bh) % 2) * bw) / 2 + bw - 1);
        if (right <= left) continue;
        const face = color(tone, r() * 27 - 13);
        rect(c, xx + left + 1, yy + j + 1, right - left - 1, Math.min(bh - 1, hh - j - 1), face);
        rect(c, xx + left + 2, yy + j + 1, Math.max(1, right - left - 3), 1, color(face, 18));
        if (r() > 0.5)
          rect(
            c,
            xx + left + 3,
            yy + j + bh - 2,
            Math.max(1, right - left - 5),
            1,
            color(face, -13),
          );
      }
  };
  const material = (xx: number, yy: number, ww: number, hh: number) => {
    if (culture.wallMaterial === 'timber') boards(xx, yy, ww, hh);
    else if (['metal', 'glass', 'composite'].includes(culture.wallMaterial)) {
      rect(c, xx, yy, ww, hh, dark);
      for (let py = 0; py < hh; py += 24)
        for (let px = 0; px < ww; px += 34) {
          const ww2 = Math.min(32, ww - px),
            hh2 = Math.min(22, hh - py),
            tone = color(wall, r() * 12 - 6);
          rect(c, xx + px + 1, yy + py + 1, ww2, hh2, tone);
          rect(c, xx + px + 2, yy + py + 2, ww2 - 2, 1, color(tone, 21));
          rect(c, xx + px + ww2 - 2, yy + py + 3, 1, Math.max(1, hh2 - 4), color(tone, -19));
          for (const offset of [3, ww2 - 3])
            rect(c, xx + px + offset, yy + py + 4, 1, 1, color(trim, 18));
        }
    } else masonry(xx, yy, ww, hh);
  };
  const pane = (
    cx: number,
    foot: number,
    ww: number,
    hh: number,
    arch = culture.window === 'arch',
  ) => {
    const left = cx - ww / 2,
      top = foot - hh;
    const pts = arch
      ? [
          [left, foot],
          [left, top + 8],
          [cx, top - 3],
          [left + ww, top + 8],
          [left + ww, foot],
        ]
      : [
          [left, top],
          [left + ww, top],
          [left + ww, foot],
          [left, foot],
        ];
    poly(c, pts, dark);
    clip(pts, () => {
      rect(c, left + 3, top + 2, ww - 6, hh - 3, g.illuminated ? '#284e65' : '#786c4f');
      for (let j = 0; j < hh; j += 10)
        for (let k = 0; k < ww; k += 8)
          rect(
            c,
            left + k + 3,
            top + j + 3,
            Math.min(6, ww - k - 6),
            Math.min(8, hh - j - 3),
            g.illuminated
              ? color(trim, r() * 35 + 12)
              : ['#c9b080', '#b39668', '#ddc598'][Math.floor(r() * 3)],
          );
      line(c, cx, top, cx, foot, color(wood, -16), 2);
      line(c, left, foot - hh / 2, left + ww, foot - hh / 2, color(wood, -16), 2);
    });
    line(c, left - 2, foot + 2, left + ww + 2, foot + 2, trim, 3);
    if (culture.window === 'slit')
      for (const side of [-1, 1])
        rect(c, cx + side * (ww / 2 + 4) - 2, top + 6, 3, hh - 5, color(wall, 18));
  };
  const roofPlane = (points: number[][], tone: string) => {
    poly(c, points, tone);
    clip(points, () => {
      const metal = g.technology > 0.55;
      for (let j = back - g.rise - 30, row = 0; j < eave + 10; j += metal ? 19 : 7, row++)
        for (let k = x - 12; k < x + w + 12; k += metal ? 29 : 11) {
          const xx = k + (row % 2) * (metal ? 0 : 5),
            t = color(tone, r() * 14 - 7);
          rect(c, xx, j, metal ? 27 : 10, metal ? 17 : 6, t);
          rect(c, xx + 1, j, metal ? 25 : 8, 1, color(t, 15));
        }
      if (frost)
        for (let i = 0; i < w / 14; i++) {
          const xx = x + r() * w,
            yy = back - g.rise + r() * (eave - back + g.rise);
          rect(c, xx, yy, 10 + r() * 20, 3, '#c0d4df');
          rect(c, xx + 3, yy - 1, 8 + r() * 14, 2, '#dde9e9');
        }
      if (g.roofPlanting)
        for (let i = 0; i < w / 5; i++) {
          const xx = x + r() * w,
            yy = back + r() * (eave - back);
          rect(c, xx, yy, 7 + r() * 14, 3, '#4d7560');
          rect(c, xx + 2, yy - 2, 5 + r() * 8, 3, '#779168');
        }
    });
  };
  // Foundation and raised floor never move the real south doorway or its collision footprint.
  poly(
    c,
    [
      [x - 6, front + 2],
      [x + w + 8, front + 2],
      [x + w + 22, front + 16],
      [x + 2, front + 16],
    ],
    '#24393855',
  );
  if (g.raised) {
    rect(c, x, front - g.raised, w, g.raised, dark);
    for (let px = x + 8; px < x + w; px += 30) {
      rect(c, px, front - g.raised - 5, 5, g.raised + 6, color(wood, -17));
      rect(c, px + 1, front - g.raised, 1, g.raised, color(wood, 16));
      line(c, px, front - 2, px + 25, front - g.raised, dark, 2);
    }
  } else masonry(x - 2, front - 13, w + 4, 14, color(wall, -12));
  material(x, eave, w, front - eave - g.raised);
  // Deep corner posts, an upper cornice and narrow return face give true volume.
  rect(c, x - 3, eave - 3, 6, front - eave - g.raised + 4, dark);
  rect(c, x + w - 3, eave - 3, 6, front - eave - g.raised + 4, dark);
  rect(c, x - 4, eave - 4, w + 8, 5, color(trim, -19));
  rect(c, x - 3, eave - 4, w + 6, 1, color(trim, 19));
  if (culture.wallMaterial === 'timber') {
    for (let px = x + Math.floor(w / 4); px < x + w; px += Math.floor(w / 4)) {
      rect(c, px, eave, 5, front - eave - g.raised, dark);
      line(
        c,
        px + 2,
        eave + 5,
        Math.min(x + w - 4, px + w / 4 - 4),
        front - g.raised - 14,
        dark,
        3,
      );
    }
    rect(c, x, eave + (front - eave - g.raised) * 0.5, w, 4, dark);
  }
  const ridge = x + w * g.ridge;
  if (g.glass) {
    const pts = [
      [x - 5, back + 5],
      [ridge, back - g.rise],
      [x + w + 5, back + 5],
      [x + w + 5, eave],
      [ridge, eave - g.rise],
      [x - 5, eave],
    ];
    poly(c, pts, '#355b68');
    clip(pts, () => {
      for (let yy = back - g.rise; yy < eave + 12; yy += 25)
        for (let xx = x - 10; xx < x + w + 10; xx += 28) {
          rect(c, xx + 2, yy + 2, 24, 21, color('#779d9f', r() * 20 - 10));
          rect(c, xx + 4, yy + 4, 1, 17, '#c1d6cd');
          if (r() > 0.6) line(c, xx + 6, yy + 4, xx + 18, yy + 18, '#aac5c1');
          rect(c, xx + 3, yy + 19, 21, 2, '#456871');
        }
      if (kind === 'greenhouse')
        for (let i = 0; i < 25; i++) {
          const xx = x + r() * w,
            yy = back + r() * (eave - back);
          rect(c, xx, yy, 6, 10, '#537d61');
          line(c, xx + 3, yy + 8, xx + 3, yy - 3, '#abc19a');
        }
    });
    line(c, ridge, back - g.rise, ridge, eave - g.rise, trim, 4);
    line(c, x - 5, eave, ridge, eave - g.rise, trim, 4);
    line(c, ridge, eave - g.rise, x + w + 5, eave, trim, 4);
  } else if (g.rise === 0 || culture.roof === 'terraced') {
    roofPlane(
      [
        [x - 5, back],
        [x + w + 5, back],
        [x + w + 5, eave],
        [x - 5, eave],
      ],
      roof,
    );
    const parapet = culture.roof === 'terraced' ? 13 : 9;
    material(x - 5, eave - parapet, w + 10, parapet);
    rect(c, x - 7, eave - parapet - 2, w + 14, 3, trim);
    for (const px of [x - 4, x + w - 4]) {
      rect(c, px, back, 7, eave - back - parapet, color(wall, 8));
      rect(c, px, back, 2, eave - back - parapet, color(wall, 24));
    }
    if (culture.roof === 'terraced') {
      const bx = x + w * 0.18,
        bw = w * 0.35;
      material(bx, back - 15, bw, 35);
      rect(c, bx - 3, back - 18, bw + 6, 4, trim);
      pane(bx + bw / 2, back + 15, 20, 22, false);
    }
  } else {
    roofPlane(
      [
        [x - 8, back + 12],
        [ridge, back - g.rise],
        [ridge, eave - g.rise],
        [x - 8, eave],
      ],
      roof,
    );
    roofPlane(
      [
        [ridge, back - g.rise],
        [x + w + 8, back + 12],
        [x + w + 8, eave],
        [ridge, eave - g.rise],
      ],
      color(roof, -13),
    );
    // The front gable uses local wall construction, with deep visible bargeboards.
    const gable = [
      [x - 8, eave],
      [ridge, eave - g.rise],
      [x + w + 8, eave],
    ];
    poly(c, gable, wall);
    clip(gable, () => material(x - 8, eave - g.rise, w + 16, g.rise));
    line(c, x - 10, eave, ridge, eave - g.rise - 3, dark, 5);
    line(c, ridge, eave - g.rise - 3, x + w + 8, eave, dark, 5);
    line(c, x - 8, eave - 2, ridge, eave - g.rise - 4, trim, 2);
    line(c, ridge, eave - g.rise - 4, x + w + 8, eave - 2, trim, 2);
    if (g.rise > 40) pane(ridge, eave - 8, 19, Math.min(27, g.rise - 18), false);
    for (let i = 0; i < g.dormers; i++) {
      const dx = x + (w * (i + 1)) / (g.dormers + 1),
        dy = back + (eave - back) * 0.48 - g.rise * 0.4;
      material(dx - 17, dy - 16, 34, 27);
      poly(
        c,
        [
          [dx - 22, dy - 15],
          [dx, dy - 36],
          [dx + 22, dy - 15],
        ],
        color(roof, -7),
      );
      line(c, dx - 22, dy - 15, dx, dy - 36, trim, 2);
      pane(dx, dy + 8, 16, 21, false);
    }
  }
  const doorwayWidth = kind === 'church' ? 40 : kind === 'storehouse' ? 44 : 26,
    doorwayHeight = kind === 'church' ? 65 : 41;
  for (let i = 0; i < g.bayCount; i++) {
    const px = x + (w * (i + 0.5)) / g.bayCount;
    if (Math.abs(px - mid) < doorwayWidth) continue;
    pane(px, front - g.raised - 19, kind === 'workshop' ? 25 : 20, kind === 'church' ? 52 : 28);
    if (kind === 'house' || kind === 'inn') {
      for (const side of [-1, 1]) boards(px + side * 16 - 3, front - g.raised - 47, 6, 28, true);
      if ((culture.organics ?? 0.4) > 0.28 && r() > 0.28) {
        const fy = front - g.raised - 16;
        boards(px - 17, fy, 34, 10);
        line(c, px - 19, fy, px + 19, fy, color(wood, 23), 2);
        for (let n = 0; n < 26; n++) {
          const fx = px - 16 + r() * 32,
            yy = fy - r() * 10;
          rect(c, fx, yy, 3, 3, ['#42614d', '#67825a', '#8c9a6a'][Math.floor(r() * 3)]);
          if (r() > 0.65)
            rect(c, fx + 1, yy, 2, 2, ['#d6c38c', '#bb8e9e', '#d8d5b1'][Math.floor(r() * 3)]);
        }
      }
      if (g.facade > 90) pane(px, eave + 33, 18, 26, false);
    }
  }
  // A visual frame surrounds the actual separately animated door prop.
  material(
    mid - doorwayWidth / 2 - 7,
    front - g.raised - doorwayHeight - 7,
    doorwayWidth + 14,
    doorwayHeight + 7,
  );
  rect(
    c,
    mid - doorwayWidth / 2 - 3,
    front - g.raised - doorwayHeight - 3,
    doorwayWidth + 6,
    doorwayHeight + 3,
    dark,
  );
  for (const side of [-1, 1]) {
    rect(
      c,
      mid + side * (doorwayWidth / 2 + 5) - 2,
      front - g.raised - doorwayHeight,
      3,
      doorwayHeight,
      color(trim, 10),
    );
  }
  // A projecting entrance canopy is built from the same structural material as the facade.
  if (kind === 'inn' || kind === 'house' || kind === 'workshop') {
    const py = front - g.raised - doorwayHeight - 11;
    poly(
      c,
      [
        [mid - 30, py + 5],
        [mid, py - 12],
        [mid + 30, py + 5],
        [mid + 25, py + 11],
        [mid - 25, py + 11],
      ],
      color(roof, -10),
    );
    line(c, mid - 31, py + 5, mid, py - 13, trim, 2);
    line(c, mid, py - 13, mid + 31, py + 5, trim, 2);
    rect(c, mid - 29, py + 9, 58, 4, dark);
    rect(c, mid - 26, py + 9, 52, 1, color(wood, 22));
  }
  const steps = g.raised ? 5 : 2;
  for (let n = steps - 1; n >= 0; n--) {
    const sw = doorwayWidth + 14 + n * 7,
      yy = front + n * 3;
    rect(c, mid - sw / 2, yy, sw, 4, color(wall, n % 2 ? 4 : -3));
    rect(c, mid - sw / 2, yy, sw, 1, color(wall, 25));
  }
  if (g.gallery) {
    const yy = front - g.raised - 54;
    rect(c, x - 8, yy, w + 16, 5, color(wood, -16));
    line(c, x - 8, yy - 17, x + w + 8, yy - 17, trim, 3);
    for (let xx = x - 6; xx < x + w + 8; xx += 10) rect(c, xx, yy - 15, 2, 15, color(wood, 6));
    for (const xx of [x + 2, x + w - 6])
      rect(c, xx, yy, 4, front - yy - g.raised, color(wood, -12));
  }
  if (g.chimney) {
    const cx = x + w * 0.77,
      foot = back + (eave - back) * 0.4,
      hh = kind === 'workshop' ? 65 : 42,
      cw = kind === 'workshop' ? 24 : 16;
    masonry(cx, foot - hh, cw, hh, color(wall, -14));
    rect(c, cx - 3, foot - hh - 3, cw + 6, 5, trim);
    rect(c, cx + 3, foot - hh - 3, cw - 6, 2, dark);
    if (g.industrial > 0.5)
      for (let i = 0; i < 3; i++)
        rect(c, cx - 1, foot - hh + 12 + i * 15, cw + 2, 3, color(trim, -15));
  }
  if (kind === 'church') {
    for (const side of [-1, 1]) {
      const tx = mid + side * (w * 0.36),
        tw = 38,
        ty = back - 56;
      material(tx - tw / 2, ty, tw, eave - ty);
      pane(tx, ty + 50, 16, 28, true);
      if (g.technology > 0.65) {
        rect(c, tx - 24, ty - 8, 48, 8, roof);
        line(c, tx, ty - 8, tx, ty - 45, trim, 2);
        rect(c, tx - 7, ty - 30, 14, 3, trim);
      } else {
        poly(
          c,
          [
            [tx - 25, ty],
            [tx, ty - 57],
            [tx + 25, ty],
          ],
          roof,
        );
        line(c, tx - 25, ty, tx, ty - 57, trim, 2);
      }
      rect(c, tx - tw / 2 - 3, eave - 5, tw + 6, 5, trim);
    }
  }
  // Function remains legible through physical signs, work attachments and local illumination.
  const signX = x + w * 0.18,
    signY = front - g.raised - 12;
  if (kind !== 'church' && kind !== 'greenhouse') {
    line(c, signX, signY - 36, signX, signY - 5, dark, 3);
    line(c, signX, signY - 35, signX + 25, signY - 35, dark, 3);
    rect(c, signX + 8, signY - 33, 25, 22, color(wood, -20));
    rect(c, signX + 10, signY - 31, 21, 18, trim);
    if (kind === 'workshop') {
      line(c, signX + 15, signY - 27, signX + 27, signY - 16, dark, 3);
      line(c, signX + 27, signY - 27, signX + 15, signY - 16, dark, 3);
    } else if (kind === 'inn') {
      rect(c, signX + 15, signY - 26, 10, 7, dark);
      rect(c, signX + 14, signY - 22, 2, 8, dark);
      rect(c, signX + 26, signY - 22, 2, 8, dark);
    } else {
      line(c, signX + 20, signY - 27, signX + 20, signY - 15, dark, 2);
      line(c, signX + 15, signY - 22, signX + 25, signY - 22, dark, 2);
    }
  }
  if (g.illuminated) {
    const glow = color(trim, 50);
    rect(c, x - 3, eave + 5, w + 6, 2, glow);
    for (const px of [x + 3, x + w - 4])
      rect(c, px, eave + 8, 2, front - eave - g.raised - 12, trim);
    const bx = x + w * 0.62,
      by = back + (eave - back) * 0.45;
    rect(c, bx, by, 27, 18, color(wall, -10));
    rect(c, bx + 3, by + 3, 21, 3, glow);
    for (let i = 0; i < 4; i++) rect(c, bx + 4 + i * 5, by + 10, 2, 4, trim);
    line(c, bx + 23, by, bx + 23, by - 27, dark, 2);
    rect(c, bx + 20, by - 26, 7, 3, glow);
  } else
    for (const side of [-1, 1]) {
      const xx = mid + side * (doorwayWidth / 2 + 17),
        yy = front - g.raised - 33;
      rect(c, xx - 3, yy - 9, 7, 12, dark);
      rect(c, xx - 1, yy - 7, 3, 8, '#e3bc7c');
      rect(c, xx - 4, yy - 10, 9, 2, trim);
    }
  return { image, x: 36, y: 194 };
}
