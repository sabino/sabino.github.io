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
    glass: kind === 'greenhouse',
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
  const mix = (a: string, b: string, t: number) => {
    const aa = Number.parseInt(a.slice(1), 16),
      bb = Number.parseInt(b.slice(1), 16);
    return (
      '#' +
      [16, 8, 0]
        .map((shift) =>
          Math.round(((aa >> shift) & 255) * (1 - t) + ((bb >> shift) & 255) * t)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  };
  // Roofs, warm wall faces and deep structural recesses occupy different value bands.
  // This keeps a northern slate roof from reading as another upright masonry panel.
  const wall = mix(culture.wallColor, g.technology > 0.67 ? '#81959b' : '#a2987e', 0.28),
    roof = mix(culture.roofColor, '#223548', 0.28),
    wood = mix(culture.woodColor, '#71523d', 0.22),
    trim = culture.accentColor,
    dark = mix(g.structuralColor, '#15232d', 0.38);
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
        const face = color(tone, r() * 20 - 10 - (j / Math.max(1, hh)) * 9);
        rect(c, xx + left + 1, yy + j + 1, right - left - 1, Math.min(bh - 1, hh - j - 1), face);
        rect(c, xx + left + 2, yy + j + 1, Math.max(1, right - left - 3), 1, color(face, 14));
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
      rect(c, left + 3, top + 2, ww - 6, hh - 3, g.illuminated ? '#183848' : '#4b3f35');
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
              : ['#dbad6f', '#ab804f', '#ffe0a0'][Math.floor(r() * 3)],
          );
      line(c, cx, top, cx, foot, color(wood, -16), 2);
      line(c, left, foot - hh / 2, left + ww, foot - hh / 2, color(wood, -16), 2);
    });
    line(c, left - 2, foot + 2, left + ww + 2, foot + 2, trim, 3);
    if (culture.window === 'slit')
      for (const side of [-1, 1])
        rect(c, cx + side * (ww / 2 + 4) - 2, top + 6, 3, hh - 5, color(wall, 18));
  };
  const shallowStroke = (x0: number, y0: number, x1: number, y1: number, tone: string) => {
    const steps = Math.max(1, Math.abs(Math.round(y1 - y0)) + 1),
      width = (x1 - x0) / steps;
    for (let n = 0; n < steps; n++)
      rect(c, x0 + n * width, y0 + ((y1 - y0) * n) / Math.max(1, steps - 1), width + 1, 1, tone);
  };
  const roofPlane = (points: number[][], tone: string, metallic = g.technology > 0.67) => {
    const minX = Math.min(...points.map((p) => p[0])),
      maxX = Math.max(...points.map((p) => p[0])),
      minY = Math.min(...points.map((p) => p[1])),
      maxY = Math.max(...points.map((p) => p[1])),
      depth = maxY - minY;
    poly(c, points, color(tone, -25));
    clip(points, () => {
      // Courses compress towards the rear and cross the slate at a shallow angle.
      // Their horizontal overlap differs from the chunky vertical wall blocks below.
      let yy = minY - 8,
        row = 0;
      while (yy < maxY + 12) {
        const t = Math.max(0, Math.min(1, (yy - minY) / Math.max(1, depth))),
          sh = metallic ? 14 + t * 8 : 4 + t * 4,
          sw = metallic ? 34 : 13 + t * 3,
          drift = Math.round((1 - t) * 8);
        for (let xx = minX - sw * 2; xx < maxX + sw * 2; xx += sw) {
          const px = xx + ((row % 2) * sw) / 2 + drift,
            value = r() * 13 - 6 + (1 - t) * 16 - t * 14,
            face = color(tone, value),
            skew = metallic ? 2 : 1;
          poly(
            c,
            [
              [px, yy],
              [px + sw - 1, yy - skew],
              [px + sw - 2, yy + sh - 1],
              [px + 1, yy + sh],
            ],
            face,
          );
          shallowStroke(px + 1, yy, px + sw - 2, yy - skew, color(face, metallic ? 21 : 29));
          shallowStroke(px + 2, yy + sh, px + sw - 2, yy + sh - 1, color(face, -27));
          if (metallic) {
            rect(c, px + 3, yy + 3, 1, 1, color(face, 32));
            rect(c, px + sw - 5, yy + sh - 4, 1, 1, color(face, 28));
          } else if (r() > 0.64) rect(c, px + 3, yy + 2, 5, 1, color(face, 13));
        }
        yy += sh;
        row++;
      }
      // Broad weathered patches live within the material instead of a uniform noise wash.
      for (let n = 0; n < (maxX - minX) / 31; n++) {
        const px = minX + r() * (maxX - minX),
          py = minY + r() * depth;
        for (let k = 0; k < 3; k++)
          rect(c, px + k * 4, py + k * 3, 12 - k * 2, 2, n % 2 ? '#abc4c513' : '#07142219');
      }
      if (frost)
        for (let n = 0; n < (maxX - minX) / 17; n++) {
          const px = minX + r() * (maxX - minX),
            py = minY + r() * depth;
          rect(c, px, py, 9 + r() * 15, 3, '#b5c9d3');
          rect(c, px + 2, py - 1, 8 + r() * 9, 2, '#e0eae5');
        }
    });
  };
  const advanced = g.technology > 0.67,
    organic = culture.organics ?? 0.35;
  const glow = advanced ? color(trim, 76) : '#ffe0a0';
  const windowFrame = (
    cx: number,
    foot: number,
    ww: number,
    hh: number,
    arched = culture.window === 'arch',
  ) => {
    // Thick lintel, dark inset and projecting sill keep openings readable at game scale.
    poly(
      c,
      [
        [cx - ww / 2 - 5, foot - hh - 5],
        [cx + ww / 2 + 6, foot - hh - 5],
        [cx + ww / 2 + 12, foot + 9],
        [cx - ww / 2 - 1, foot + 9],
      ],
      '#09172649',
    );
    rect(c, cx - ww / 2 - 5, foot - hh - 5, ww + 10, hh + 10, '#1b2930');
    rect(c, cx - ww / 2 - 5, foot - hh - 5, ww + 9, 3, color(wall, 29));
    rect(c, cx - ww / 2 - 5, foot - hh - 3, 3, hh + 6, color(wall, 19));
    pane(cx, foot, ww, hh, arched);
    rect(c, cx - ww / 2, foot - hh + 1, ww, 3, '#111c286b');
    rect(c, cx - ww / 2 + 1, foot - hh + 2, 3, hh - 2, '#1521285c');
    rect(c, cx - ww / 2 - 7, foot + 3, ww + 14, 4, color(wall, -23));
    rect(c, cx - ww / 2 - 7, foot + 2, ww + 14, 2, color(wall, 34));
    rect(c, cx - 2, foot - hh + 6, 3, Math.max(4, hh / 2 - 7), glow);
  };
  const planter = (xx: number, yy: number, ww = 28) => {
    rect(c, xx + 3, yy + 2, ww, 8, '#182c294a');
    boards(xx, yy - 7, ww, 10);
    rect(c, xx - 1, yy - 8, ww + 2, 3, color(wood, 22));
    for (let i = 0; i < ww * 0.8; i++) {
      const px = xx + r() * ww,
        py = yy - 9 - r() * 12;
      rect(c, px, py, 3 + r() * 3, 3, ['#2e4f38', '#52734b', '#7c955d'][Math.floor(r() * 3)]);
      if (r() > 0.72)
        rect(c, px + 1, py - 1, 2, 2, ['#e3c27d', '#bb849d', '#ece1b5'][Math.floor(r() * 3)]);
    }
  };
  const crate = (xx: number, foot: number, ww = 24) => {
    const hh = Math.floor(ww * 0.7);
    boards(xx, foot - hh, ww - 6, hh);
    poly(
      c,
      [
        [xx, foot - hh],
        [xx + 6, foot - hh - 5],
        [xx + ww, foot - hh - 5],
        [xx + ww - 6, foot - hh],
      ],
      color(wood, 19),
    );
    poly(
      c,
      [
        [xx + ww - 6, foot - hh],
        [xx + ww, foot - hh - 5],
        [xx + ww, foot - 5],
        [xx + ww - 6, foot],
      ],
      color(wood, -31),
    );
    rect(c, xx + 2, foot - hh, 3, hh, color(wood, 24));
    rect(c, xx + ww - 10, foot - hh, 3, hh, color(wood, -12));
    line(c, xx + 3, foot - hh + 2, xx + ww - 9, foot - 3, color(wood, 15), 2);
  };
  const barrel = (xx: number, foot: number) => {
    poly(
      c,
      [
        [xx + 4, foot - 25],
        [xx + 17, foot - 25],
        [xx + 21, foot - 17],
        [xx + 20, foot - 4],
        [xx + 16, foot],
        [xx + 4, foot],
        [xx, foot - 5],
        [xx, foot - 17],
      ],
      color(wood, -13),
    );
    for (let i = 3; i < 18; i += 4)
      line(c, xx + i, foot - 22, xx + i, foot - 3, color(wood, i < 10 ? 17 : -22), 2);
    rect(c, xx + 1, foot - 20, 19, 3, '#52616b');
    rect(c, xx, foot - 7, 21, 3, '#46545b');
    rect(c, xx + 3, foot - 25, 15, 4, color(wood, 27));
    rect(c, xx + 6, foot - 24, 9, 2, color(wood, -21));
  };
  type ServiceKind = 'vent' | 'tank' | 'fan' | 'terminal' | 'battery';
  const serviceModule = (
    xx: number,
    yy: number,
    ww: number,
    hh: number,
    use: ServiceKind = 'vent',
  ) => {
    const face = color(wall, -9),
      lit = color(wall, 29),
      shade = color(wall, -53);
    poly(
      c,
      [
        [xx + 3, yy + hh],
        [xx + ww - 4, yy + hh],
        [xx + ww + 12, yy + hh + 9],
        [xx + 11, yy + hh + 9],
      ],
      '#0816225c',
    );
    if (use === 'tank') {
      poly(
        c,
        [
          [xx + 5, yy - 5],
          [xx + ww - 9, yy - 5],
          [xx + ww - 3, yy + 1],
          [xx + ww - 3, yy + hh - 4],
          [xx + ww - 9, yy + hh],
          [xx + 5, yy + hh],
          [xx, yy + hh - 5],
          [xx, yy + 1],
        ],
        shade,
      );
      rect(c, xx + 3, yy, ww - 11, hh - 2, face);
      rect(c, xx + 4, yy + 2, 4, hh - 5, lit);
      rect(c, xx + ww - 13, yy + 2, 5, hh - 4, shade);
      rect(c, xx + 4, yy - 5, ww - 13, 5, lit);
      for (const by of [yy + 6, yy + hh - 10]) {
        rect(c, xx, by, ww - 3, 3, '#243641');
        rect(c, xx + 2, by, ww - 8, 1, color(wall, 22));
      }
      line(c, xx + ww - 3, yy + hh - 7, xx + ww + 8, yy + hh - 7, shade, 5);
      line(c, xx + ww + 8, yy + hh - 7, xx + ww + 8, yy + hh + 5, shade, 5);
      rect(c, xx + 9, yy - 9, 8, 4, color(trim, 10));
      return;
    }
    rect(c, xx, yy, ww - 6, hh, face);
    poly(
      c,
      [
        [xx, yy],
        [xx + 7, yy - 6],
        [xx + ww, yy - 6],
        [xx + ww - 6, yy],
      ],
      lit,
    );
    poly(
      c,
      [
        [xx + ww - 6, yy],
        [xx + ww, yy - 6],
        [xx + ww, yy + hh - 6],
        [xx + ww - 6, yy + hh],
      ],
      shade,
    );
    rect(c, xx + 1, yy + 1, 2, hh - 2, color(wall, 20));
    if (use === 'fan') {
      const cx = xx + (ww - 6) / 2,
        cy = yy + hh / 2,
        rad = Math.min(ww - 13, hh - 5) / 2;
      poly(
        c,
        [
          [cx - rad, cy - rad / 2],
          [cx - rad / 2, cy - rad],
          [cx + rad / 2, cy - rad],
          [cx + rad, cy - rad / 2],
          [cx + rad, cy + rad / 2],
          [cx + rad / 2, cy + rad],
          [cx - rad / 2, cy + rad],
          [cx - rad, cy + rad / 2],
        ],
        '#17232c',
      );
      for (let n = 0; n < 4; n++) {
        const a = (n * Math.PI) / 2;
        poly(
          c,
          [
            [cx, cy],
            [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad],
            [cx + Math.cos(a + 0.8) * rad * 0.8, cy + Math.sin(a + 0.8) * rad * 0.8],
          ],
          color(wall, -17),
        );
      }
      rect(c, cx - 2, cy - 2, 4, 4, color(wall, 27));
    } else if (use === 'terminal') {
      rect(c, xx + 4, yy + 4, ww - 14, hh * 0.54, '#10232b');
      rect(c, xx + 6, yy + 6, ww - 19, 2, glow);
      for (let n = 0; n < 3; n++)
        rect(c, xx + 6, yy + 11 + n * 3, Math.max(3, ww - 20 - n * 3), 1, color(trim, 31));
      rect(c, xx + 5, yy + hh - 8, ww - 17, 3, '#26363c');
    } else if (use === 'battery') {
      for (let bx = xx + 4; bx < xx + ww - 10; bx += 7) {
        rect(c, bx, yy + 4, 5, hh - 9, '#21333c');
        rect(c, bx, yy + 5, 2, hh - 11, color(trim, 21));
        rect(c, bx, yy + hh - 9, 5, 2, color(wall, 29));
      }
    } else
      for (let j = 5; j < hh - 3; j += 4) {
        rect(c, xx + 4, yy + j, ww - 14, 2, '#13222c');
        rect(c, xx + 4, yy + j + 2, ww - 14, 1, color(wall, 23));
      }
    rect(c, xx + 2, yy + 2, 2, 2, glow);
  };
  const skylight = (xx: number, yy: number, ww: number, hh: number) => {
    poly(
      c,
      [
        [xx + 2, yy + hh],
        [xx + ww, yy + hh - 7],
        [xx + ww + 10, yy + hh + 1],
        [xx + 10, yy + hh + 9],
      ],
      '#0716225c',
    );
    poly(
      c,
      [
        [xx, yy],
        [xx + ww, yy - 7],
        [xx + ww, yy + hh - 7],
        [xx, yy + hh],
      ],
      '#213c49',
    );
    for (let j = 3; j < hh - 3; j += 10)
      line(c, xx + 3, yy + j, xx + ww - 3, yy + j - 7, '#71a9b2', 2);
    for (let i = 4; i < ww - 2; i += 12) {
      const sy = yy - (i / ww) * 7;
      line(c, xx + i, sy + 3, xx + i, sy + hh - 3, '#b3cbd0');
    }
    line(c, xx - 2, yy + hh, xx + ww + 2, yy + hh - 7, color(wall, -35), 5);
    line(c, xx - 2, yy, xx + ww + 2, yy - 7, color(wall, 38), 3);
    line(c, xx, yy, xx, yy + hh, color(wall, 19), 2);
  };
  const awning = (xx: number, yy: number, ww: number, fabric = !advanced) => {
    const dy = fabric ? 19 : 13,
      top = [
        [xx + 5, yy],
        [xx + ww - 7, yy - 4],
        [xx + ww + 1, yy + dy - 3],
        [xx - 3, yy + dy],
      ];
    poly(
      c,
      [
        [xx - 1, yy + dy + 3],
        [xx + ww + 4, yy + dy],
        [xx + ww + 15, yy + dy + 13],
        [xx + 10, yy + dy + 16],
      ],
      '#0a162945',
    );
    poly(c, top, fabric ? color(trim, -17) : color(roof, 9));
    clip(top, () => {
      if (fabric)
        for (let px = xx - 1; px < xx + ww; px += 16) {
          poly(
            c,
            [
              [px + 4, yy - 3],
              [px + 12, yy - 3],
              [px + 9, yy + dy + 2],
              [px, yy + dy + 2],
            ],
            mix(wall, '#e4d6b0', 0.64),
          );
        }
      else
        for (let py = yy; py < yy + dy; py += 5) line(c, xx, py, xx + ww, py - 3, color(roof, 29));
    });
    poly(
      c,
      [
        [xx - 3, yy + dy],
        [xx + ww + 1, yy + dy - 3],
        [xx + ww + 1, yy + dy + 3],
        [xx - 3, yy + dy + 6],
      ],
      fabric ? color(trim, -40) : color(roof, -29),
    );
    line(
      c,
      xx - 3,
      yy + dy,
      xx + ww + 1,
      yy + dy - 3,
      fabric ? color(trim, 22) : color(wall, 30),
      2,
    );
    for (const px of [xx + 1, xx + ww - 4]) {
      line(c, px, yy + dy + 5, px, yy + dy + 21, color(wood, -34), 3);
      line(c, px + 1, yy + dy + 5, px + 9, yy + 8, color(wood, -15), 3);
    }
  };
  const seating = (xx: number, foot: number, ww: number) => {
    const materialTone = advanced ? wall : wood;
    rect(c, xx + 3, foot - 3, ww + 8, 7, '#0b192a4f');
    rect(c, xx, foot - 18, ww, 4, color(materialTone, 16));
    rect(c, xx, foot - 13, ww, 3, color(materialTone, -8));
    poly(
      c,
      [
        [xx - 2, foot - 7],
        [xx + ww, foot - 9],
        [xx + ww + 4, foot - 4],
        [xx, foot - 2],
      ],
      color(materialTone, 25),
    );
    for (const px of [xx + 3, xx + ww - 5]) {
      rect(c, px, foot - 18, 3, 20, color(materialTone, -32));
      rect(c, px + 1, foot - 18, 1, 17, color(materialTone, 28));
    }
  };
  type Volume = {
    left: number;
    width: number;
    foot: number;
    top: number;
    height: number;
    rise: number;
    central?: boolean;
    glass?: boolean;
    flat?: boolean;
    windows?: boolean;
    gallery?: boolean;
  };
  const drawVolume = (v: Volume) => {
    const bx = Math.round(v.left),
      bw = Math.round(v.width),
      foot = v.foot,
      east = Math.min(21, bw * 0.12),
      faceRight = bx + bw - east,
      fy = foot - v.height,
      top = Math.min(v.top, fy - 27),
      ridgeY = top + Math.max(16, (fy - top) * 0.32),
      peak = fy - v.rise;
    if (v.central)
      poly(
        c,
        [
          [bx + bw - 5, top + 8],
          [bx + bw + 17, top + 23],
          [bx + bw + 24, foot + 1],
          [bx + bw - 3, foot - 3],
        ],
        '#08162955',
      );
    // The east return has its own full-height plane and sits inside the collision footprint.
    const eastFace = [
      [faceRight, fy],
      [bx + bw, fy - 14],
      [bx + bw, foot - 14],
      [faceRight, foot],
    ];
    material(bx, fy, bw - east, v.height);
    clip(eastFace, () => {
      material(faceRight, fy - 14, east + 2, v.height + 15);
      rect(c, faceRight, fy - 14, east + 2, v.height + 15, '#07132299');
    });
    poly(
      c,
      [
        [bx, fy],
        [faceRight, fy],
        [faceRight, fy + 20],
        [bx + 4, fy + 13],
      ],
      '#0713228c',
    );
    rect(c, bx, fy + 2, 3, v.height - 2, color(wall, 27));
    rect(c, faceRight - 3, fy + 2, 3, v.height - 2, color(wall, -35));
    rect(c, bx - 2, foot - 8, bw - east + 3, 8, color(wall, -22));
    rect(c, bx - 2, foot - 9, bw - east + 3, 2, color(wall, 21));
    if (culture.wallMaterial === 'timber' && !advanced) {
      const bay = Math.max(38, (bw - east) / Math.max(2, Math.floor(bw / 54)));
      for (let px = bx + 4; px < faceRight - 3; px += bay) {
        rect(c, px, fy + 3, 6, v.height - 11, color(wood, -39));
        rect(c, px + 1, fy + 3, 2, v.height - 11, color(wood, 22));
        if (v.height > 70)
          line(
            c,
            px + 6,
            fy + 12,
            Math.min(faceRight - 5, px + bay - 2),
            fy + 49,
            color(wood, -28),
            4,
          );
      }
      rect(c, bx, fy + v.height * 0.48, bw - east, 5, color(wood, -30));
      rect(c, bx, fy + v.height * 0.48, bw - east, 1, color(wood, 25));
    }
    if (v.glass) {
      const glassFace = [
        [bx - 5, top],
        [faceRight, top],
        [bx + bw + 3, top + 10],
        [bx + bw + 3, fy + 4],
        [bx - 5, fy + 4],
      ];
      poly(c, glassFace, '#244b50');
      clip(glassFace, () => {
        for (let n = 0; n < 40; n++) {
          const px = bx + r() * bw,
            py = top + r() * (fy - top);
          rect(c, px, py, 7 + r() * 13, 5, '#497359');
          line(c, px + 4, py + 7, px + 4, py - 5, '#94ad75', 2);
        }
        rect(c, bx - 5, top, bw + 10, fy - top + 4, '#81b0be40');
        for (let yy = top; yy < fy + 7; yy += 27) {
          line(c, bx - 5, yy, bx + bw + 4, yy, '#24414b', 4);
          line(c, bx - 5, yy, bx + bw + 4, yy, '#a3c5c6', 1);
        }
        for (let xx = bx; xx < bx + bw; xx += 32) {
          line(c, xx, top, xx, fy + 6, '#2c4b51', 4);
          line(c, xx, top, xx, fy + 6, '#a3b9b4', 1);
          for (let yy = top + 6; yy < fy - 20; yy += 54)
            line(c, xx + 7, yy, xx + 23, yy + 15, '#afccd195', 2);
        }
      });
      rect(c, bx - 6, fy + 3, bw + 12, 6, dark);
      rect(c, bx - 6, fy + 3, bw + 12, 2, color(trim, 24));
    } else if (v.flat || v.rise < 8) {
      const points = [
        [bx - 5, top],
        [bx + bw + 4, top - 6],
        [bx + bw + 4, fy - 9],
        [faceRight + 4, fy + 1],
        [bx - 5, fy + 1],
      ];
      roofPlane(points, color(roof, 9), advanced);
      // Premises determine a service assembly; shared culture determines its construction.
      const roofDepth = fy - top,
        sx = bx + 14,
        sy = top + Math.min(34, roofDepth * 0.27),
        equipmentWidth = Math.min(44, bw - 29);
      if (advanced) {
        const usage: ServiceKind =
          kind === 'workshop'
            ? 'fan'
            : kind === 'greenhouse'
              ? 'tank'
              : kind === 'church' || kind === 'hall'
                ? 'battery'
                : kind === 'inn'
                  ? 'tank'
                  : 'vent';
        if ((kind === 'house' || kind === 'inn' || kind === 'hall') && bw > 88) {
          skylight(sx, sy + 4, Math.min(75, bw - 32), Math.min(42, roofDepth * 0.28));
          if (bw > 168)
            serviceModule(bx + bw - 62, sy + 19, 36, 28, kind === 'house' ? 'battery' : usage);
        } else {
          serviceModule(sx, sy, equipmentWidth, Math.min(35, roofDepth * 0.3), usage);
          if (bw > 135)
            serviceModule(bx + bw - 54, sy + 22, 33, 27, kind === 'workshop' ? 'tank' : 'battery');
        }
        if (kind === 'workshop' || kind === 'storehouse') {
          const pipeY = fy - 29;
          line(c, bx + 17, pipeY, faceRight - 10, pipeY, '#17252e', 8);
          line(c, bx + 17, pipeY, faceRight - 10, pipeY, color(wall, 28), 3);
          line(c, sx + 17, sy + 23, sx + 17, pipeY, '#26333b', 7);
          line(c, sx + 17, sy + 23, sx + 17, pipeY, color(wall, 23), 2);
          for (let px = bx + 25; px < faceRight - 15; px += 30)
            rect(c, px, pipeY - 2, 4, 10, color(wall, -24));
        }
        if (kind === 'church' || kind === 'hall') {
          const ax = bx + bw * 0.68,
            ay = top + Math.min(48, roofDepth * 0.4);
          line(c, ax, ay + 10, ax, ay - 32, color(wall, -46), 4);
          poly(
            c,
            [
              [ax - 19, ay - 24],
              [ax + 10, ay - 30],
              [ax + 17, ay - 15],
              [ax - 8, ay - 11],
            ],
            color(wall, 29),
          );
          line(c, ax - 16, ay - 23, ax + 14, ay - 16, color(trim, 34), 2);
          rect(c, ax - 3, ay + 9, 10, 5, color(wall, 21));
        }
      } else {
        // Flat earthen roofs have parapets, a shaded stair head, jars and drying beds.
        material(sx, sy - 3, Math.min(47, bw - 28), 25);
        rect(c, sx - 3, sy - 6, Math.min(53, bw - 22), 5, color(wall, 29));
        pane(sx + Math.min(23, (bw - 28) / 2), sy + 18, 15, 17, false);
        if (bw > 130) {
          barrel(bx + bw - 51, sy + 23);
          barrel(bx + bw - 31, sy + 29);
        }
      }
      if (organic > 0.68 && (kind === 'house' || kind === 'inn' || kind === 'greenhouse')) {
        const count = Math.min(3, Math.floor((bw - 15) / 38));
        for (let n = 0; n < count; n++) planter(bx + 10 + n * 34, fy - 24 - (n % 2) * 5, 27);
      }
      // Thick parapet returns reveal the horizontal roof tray and cast shadows into it.
      poly(
        c,
        [
          [bx - 3, top],
          [bx + 10, top + 8],
          [bx + 10, fy - 13],
          [bx - 3, fy - 6],
        ],
        '#09182b55',
      );
      rect(c, bx + 4, top + 1, bw - 10, 7, '#0a172944');
      rect(c, bx - 5, fy - 8, bw - east + 10, 11, color(wall, -14));
      rect(c, bx - 7, fy - 10, bw - east + 14, 4, color(wall, 32));
      for (const xx of [bx - 5, bx + bw - 4]) {
        rect(c, xx, top, 6, fy - top - 8, color(wall, -12));
        rect(c, xx, top, 2, fy - top - 8, color(wall, 29));
      }
      if (advanced) rect(c, bx - 5, fy + 4, bw - east + 9, 2, color(trim, 58));
    } else if (v.central) {
      const ridge = bx + (bw - east) / 2;
      roofPlane(
        [
          [bx - 7, top + 12],
          [ridge, top - v.rise * 0.5],
          [ridge, peak],
          [bx - 7, fy],
        ],
        color(roof, 15),
      );
      roofPlane(
        [
          [ridge, top - v.rise * 0.5],
          [bx + bw + 6, top + 5],
          [bx + bw + 6, fy - 11],
          [ridge, peak],
        ],
        color(roof, -35),
      );
      line(c, ridge, top - v.rise * 0.5, ridge, peak - 2, color(roof, 32), 4);
      line(c, ridge + 4, top - v.rise * 0.5 + 2, ridge + 4, peak - 1, color(roof, -39), 3);
      const gable = [
        [bx - 6, fy],
        [ridge, peak],
        [faceRight + 7, fy],
      ];
      clip(gable, () => material(bx - 7, peak, bw + 14, v.rise + 1));
      line(c, bx - 8, fy + 3, ridge, peak - 4, color(wood, -34), 7);
      line(c, ridge, peak - 4, faceRight + 9, fy + 3, color(wood, -43), 7);
      line(c, bx - 8, fy, ridge, peak - 5, color(wood, 33), 2);
      line(c, ridge, peak - 5, faceRight + 9, fy, color(wood, 12), 2);
      if (culture.wallMaterial === 'timber') {
        line(c, ridge, peak + 5, ridge, fy - 4, color(wood, -31), 4);
        line(c, ridge, peak + 18, bx + 10, fy - 4, color(wood, -27), 3);
        line(c, ridge, peak + 18, faceRight - 10, fy - 4, color(wood, -27), 3);
      }
      if (v.rise > 30) windowFrame(ridge, fy - 7, 18, Math.min(26, v.rise - 18), false);
      rect(c, bx - 7, fy, bw - east + 14, 5, dark);
      rect(c, bx - 7, fy, bw - east + 14, 1, color(wood, 26));
    } else {
      // Cross-ridged side volumes leave a broad slope for genuinely projecting dormers.
      roofPlane(
        [
          [bx - 8, top + 10],
          [bx + bw + 4, top + 3],
          [bx + bw + 7, ridgeY],
          [bx - 8, ridgeY + 7],
        ],
        color(roof, -18),
      );
      roofPlane(
        [
          [bx - 8, ridgeY + 7],
          [bx + bw + 7, ridgeY],
          [bx + bw + 8, fy - 10],
          [faceRight + 8, fy],
          [bx - 8, fy],
        ],
        color(roof, 5),
      );
      // Hipped return facets and a raised cap make the ridge visibly recede in space.
      roofPlane(
        [
          [bx - 8, ridgeY + 7],
          [bx + 12, ridgeY + 1],
          [bx + 3, fy],
          [bx - 8, fy],
        ],
        color(roof, 26),
      );
      roofPlane(
        [
          [bx + bw - 16, ridgeY + 2],
          [bx + bw + 7, ridgeY],
          [bx + bw + 8, fy - 10],
          [faceRight + 8, fy],
        ],
        color(roof, -32),
      );
      poly(
        c,
        [
          [bx - 10, ridgeY + 6],
          [bx + bw + 9, ridgeY - 1],
          [bx + bw + 9, ridgeY + 5],
          [bx - 10, ridgeY + 12],
        ],
        color(roof, -30),
      );
      line(c, bx - 10, ridgeY + 5, bx + bw + 9, ridgeY - 2, color(roof, 44), 3);
      for (let px = bx + 3; px < bx + bw; px += 18)
        rect(c, px, ridgeY + 4 - ((px - bx) / bw) * 7, 2, 6, color(roof, -11));
      poly(
        c,
        [
          [bx - 9, fy],
          [faceRight + 9, fy],
          [faceRight + 9, fy + 10],
          [bx - 9, fy + 10],
        ],
        color(wood, -40),
      );
      line(c, bx - 9, fy, faceRight + 9, fy, color(wood, 31), 2);
      for (let px = bx + 5; px < faceRight - 1; px += 24) {
        rect(c, px, fy + 4, 5, 11, color(wood, -37));
        rect(c, px, fy + 4, 1, 8, color(wood, 17));
      }
      if (kind !== 'storehouse' && kind !== 'workshop' && fy - ridgeY > 32) {
        for (let dx = bx + 32; dx < faceRight - 18; dx += 79) {
          if (Math.abs(dx - mid) < 38 && bw > 155) continue;
          const dy = ridgeY + (fy - ridgeY) * 0.62;
          poly(
            c,
            [
              [dx - 24, dy + 24],
              [dx + 27, dy + 24],
              [dx + 35, dy + 31],
              [dx - 18, dy + 31],
            ],
            '#0a162954',
          );
          material(dx - 18, dy - 8, 36, 33);
          poly(
            c,
            [
              [dx + 18, dy - 8],
              [dx + 25, dy - 15],
              [dx + 25, dy + 16],
              [dx + 18, dy + 25],
            ],
            color(wall, -38),
          );
          poly(
            c,
            [
              [dx - 23, dy - 8],
              [dx, dy - 31],
              [dx + 24, dy - 8],
            ],
            color(roof, -19),
          );
          line(c, dx - 24, dy - 8, dx, dy - 32, color(wood, 34), 3);
          line(c, dx, dy - 32, dx + 24, dy - 8, color(wood, -12), 3);
          windowFrame(dx, dy + 21, 19, 23, true);
        }
      }
    }
    if (v.windows !== false) {
      const count = Math.max(1, Math.floor((bw - east) / 58)),
        spacing = (bw - east) / count;
      for (let i = 0; i < count; i++) {
        const px = bx + spacing * (i + 0.5);
        if (Math.abs(px - mid) < (kind === 'church' ? 54 : 40) && Math.abs(foot - front) < 20)
          continue;
        const wh = kind === 'church' ? 48 : kind === 'workshop' ? 24 : 29;
        windowFrame(
          px,
          foot - 20,
          kind === 'workshop' ? 28 : 23,
          wh,
          !advanced && culture.window === 'arch',
        );
        if (v.height > 95) windowFrame(px, fy + 40, 21, 28, false);
        if (organic > 0.42 && ['house', 'inn'].includes(kind) && r() > 0.28)
          planter(px - 17, foot - 14, 34);
        if (!advanced && ['house', 'inn'].includes(kind)) {
          boards(px - 22, foot - 20 - wh, 7, wh, true);
          boards(px + 15, foot - 20 - wh, 7, wh, true);
        }
      }
    }
    if (v.gallery) {
      const gy = foot - 53,
        end = faceRight + 6;
      poly(
        c,
        [
          [bx - 8, gy - 2],
          [end, gy - 2],
          [end + 5, gy + 6],
          [bx - 8, gy + 6],
        ],
        color(wood, 15),
      );
      rect(c, bx - 8, gy + 6, end - bx + 16, 5, color(wood, -37));
      rect(c, bx - 8, gy - 20, end - bx + 16, 3, color(wood, 28));
      for (let xx = bx - 6; xx < end; xx += 9) rect(c, xx, gy - 17, 3, 20, color(wood, -13));
      for (let xx = bx - 4; xx < end; xx += 54) {
        rect(c, xx, gy + 8, 5, foot - gy - 8, color(wood, -36));
        rect(c, xx, gy + 8, 1, foot - gy - 8, color(wood, 31));
        line(c, xx + 3, gy + 20, xx + 17, gy + 8, color(wood, -30), 3);
      }
    }
  };
  // Low wings are assembled before the high entrance volume, so roof levels occlude each other.
  // Every volume stays within the existing footprint; its true door remains at (mid, front).
  poly(
    c,
    [
      [x - 5, front],
      [x + w + 9, front],
      [x + w + 22, front + 15],
      [x + 4, front + 15],
    ],
    '#12232d50',
  );
  masonry(x - 2, front - 12, w + 4, 12, color(wall, -14));
  if (g.raised) {
    rect(c, x, front - g.raised, w, g.raised, '#162729');
    for (let xx = x + 7; xx < x + w; xx += 29) {
      rect(c, xx, front - g.raised, 5, g.raised, color(wood, -14));
      rect(c, xx, front - g.raised, 1, g.raised, color(wood, 29));
      line(c, xx + 3, front - 1, xx + 25, front - g.raised, color(wood, -27), 3);
    }
  }
  const buildingFoot = front - g.raised;
  const monument = kind === 'church' || kind === 'hall',
    centralWidth = Math.min(w * (monument ? 0.44 : 0.38), monument ? 184 : 116),
    portalWidth = Math.max(kind === 'church' ? 88 : 68, centralWidth),
    portalLeft = mid - portalWidth / 2 + 6;
  if (g.glass) {
    drawVolume({
      left: x,
      width: w,
      foot: buildingFoot - 4,
      top: back,
      height: g.facade,
      rise: 21,
      glass: true,
    });
    // A separate solid service entrance gives glasshouses a foundation and working frontage.
    drawVolume({
      left: portalLeft,
      width: portalWidth,
      foot: buildingFoot,
      top: buildingFoot - g.facade - 29,
      height: 51,
      rise: advanced ? 0 : 20,
      central: true,
      flat: advanced,
      windows: false,
    });
  } else if (monument && w > 185) {
    const wingWidth = (w - portalWidth) / 2 + 10;
    drawVolume({
      left: x,
      width: wingWidth,
      foot: buildingFoot - 11,
      top: back + 18,
      height: g.facade - 24,
      rise: g.rise * 0.6,
      flat: advanced || g.rise === 0,
      gallery: kind === 'hall' && g.gallery,
    });
    drawVolume({
      left: x + w - wingWidth,
      width: wingWidth,
      foot: buildingFoot - 11,
      top: back + 31,
      height: g.facade - 29,
      rise: g.rise * 0.7,
      flat: advanced || g.rise === 0,
      gallery: kind === 'hall' && g.gallery,
    });
    drawVolume({
      left: portalLeft,
      width: portalWidth,
      foot: buildingFoot,
      top: back - 5,
      height: g.facade + 14,
      rise: Math.max(32, g.rise),
      central: true,
      flat: advanced || g.rise === 0,
    });
  } else {
    drawVolume({
      left: x,
      width: w,
      foot: buildingFoot - 7,
      top: back,
      height: g.facade,
      rise: g.rise,
      flat: advanced || g.rise === 0,
      gallery: g.gallery && !advanced,
    });
    const ph = kind === 'inn' ? g.facade + 8 : kind === 'storehouse' ? 56 : g.facade - 1;
    drawVolume({
      left: portalLeft,
      width: portalWidth,
      foot: buildingFoot,
      top: back + Math.max(32, (eave - back) * 0.46),
      height: ph,
      rise: Math.max(24, g.rise * 0.8),
      central: true,
      flat: advanced || g.rise === 0,
      windows: false,
    });
  }
  // Buttresses and industrial service pilons create alternating depth across public frontages.
  if (monument) {
    for (let xx = x + 9; xx < x + w - 12; xx += Math.max(54, w / 6)) {
      if (Math.abs(xx - mid) < portalWidth / 2 + 10) continue;
      const hh = g.facade - 21,
        yy = buildingFoot - hh;
      if (advanced) {
        serviceModule(xx - 5, yy + 11, 19, hh - 17);
        rect(c, xx - 2, yy + 17, 2, hh - 33, color(trim, 48));
      } else {
        masonry(xx - 5, yy, 13, hh, color(wall, 4));
        poly(
          c,
          [
            [xx + 8, yy],
            [xx + 15, yy + 10],
            [xx + 15, buildingFoot + 2],
            [xx + 8, buildingFoot],
          ],
          color(wall, -35),
        );
        poly(
          c,
          [
            [xx - 7, yy],
            [xx - 3, yy - 9],
            [xx + 9, yy - 9],
            [xx + 15, yy],
          ],
          color(wall, 29),
        );
        rect(c, xx - 8, buildingFoot - 9, 24, 9, color(wall, -14));
        rect(c, xx - 8, buildingFoot - 10, 24, 2, color(wall, 27));
      }
    }
  }
  // Framed recessed entrance. The animated world door is drawn separately in this exact opening.
  const dw = kind === 'church' ? 40 : kind === 'storehouse' ? 44 : 28,
    dh = kind === 'church' ? 66 : 43,
    doorY = buildingFoot - dh;
  rect(c, mid - dw / 2 - 8, doorY - 9, dw + 16, dh + 9, color(wall, -28));
  rect(c, mid - dw / 2 - 4, doorY - 3, dw + 8, dh + 3, '#10212b');
  for (const side of [-1, 1]) {
    const xx = mid + side * (dw / 2 + 7) - 2;
    rect(c, xx, doorY - 7, 5, dh + 7, side < 0 ? color(wall, 32) : color(wall, -8));
    rect(c, xx - 2, doorY - 8, 9, 4, color(trim, 24));
    rect(c, xx - 2, buildingFoot - 5, 9, 5, color(wall, -14));
  }
  rect(c, mid - dw / 2 - 12, doorY - 13, dw + 24, 7, color(wall, -14));
  rect(c, mid - dw / 2 - 12, doorY - 14, dw + 24, 2, color(wall, 39));
  if (advanced) {
    rect(c, mid - dw / 2 - 3, doorY - 5, dw + 6, 2, glow);
    rect(c, mid + dw / 2 + 12, doorY + 15, 6, 13, '#192a34');
    rect(c, mid + dw / 2 + 13, doorY + 17, 3, 4, glow);
  } else {
    const py = doorY - 22;
    poly(
      c,
      [
        [mid - 35, py + 8],
        [mid - 23, py - 2],
        [mid + 24, py - 2],
        [mid + 34, py + 8],
        [mid + 34, py + 14],
        [mid - 35, py + 14],
      ],
      color(roof, -11),
    );
    line(c, mid - 35, py + 7, mid + 34, py + 7, color(roof, 31), 2);
    rect(c, mid - 35, py + 12, 69, 4, color(wood, -34));
    for (const side of [-1, 1]) {
      const lx = mid + side * (dw / 2 + 21),
        ly = buildingFoot - 31;
      line(c, lx, ly - 16, lx, ly - 7, dark, 2);
      rect(c, lx - 4, ly - 8, 9, 13, '#29353c');
      rect(c, lx - 2, ly - 6, 5, 9, '#c79453');
      rect(c, lx - 1, ly - 5, 2, 7, '#ffe5a8');
      rect(c, lx - 5, ly - 9, 11, 2, color(wood, 27));
    }
  }
  for (let n = (g.raised ? 5 : 2) - 1; n >= 0; n--) {
    const sw = dw + 20 + n * 7,
      yy = front + n * 3;
    rect(c, mid - sw / 2, yy, sw, 4, color(wall, -15));
    rect(c, mid - sw / 2, yy, sw, 1, color(wall, 29));
  }
  if (g.chimney && !advanced) {
    const cx = x + w * 0.79,
      foot = back + Math.max(28, (eave - back) * 0.35),
      hh = kind === 'workshop' ? 65 : 44;
    masonry(cx, foot - hh, 18, hh, color(wall, -2));
    poly(
      c,
      [
        [cx + 18, foot - hh],
        [cx + 26, foot - hh - 6],
        [cx + 26, foot - 6],
        [cx + 18, foot],
      ],
      color(wall, -34),
    );
    poly(
      c,
      [
        [cx - 3, foot - hh],
        [cx + 5, foot - hh - 7],
        [cx + 28, foot - hh - 7],
        [cx + 21, foot - hh],
      ],
      color(wall, 30),
    );
    rect(c, cx - 3, foot - hh, 24, 5, color(wall, -20));
    rect(c, cx + 5, foot - hh - 4, 13, 3, '#19262a');
  }
  if (kind === 'church') {
    // Paired towers belong to the roof volumes rather than being pasted onto one giant slab.
    for (const side of [-1, 1]) {
      const tx = mid + side * Math.min(w * 0.32, w / 2 - 36),
        tw = advanced ? 42 : 35,
        ty = back - 13 + (side > 0 ? 9 : 0),
        tf = eave - 12;
      material(tx - tw / 2, ty, tw - 7, Math.max(48, tf - ty));
      poly(
        c,
        [
          [tx + tw / 2 - 7, ty],
          [tx + tw / 2 + 4, ty - 9],
          [tx + tw / 2 + 4, tf - 9],
          [tx + tw / 2 - 7, tf],
        ],
        color(wall, -37),
      );
      windowFrame(tx - 3, ty + 44, 15, 25, !advanced);
      if (advanced) {
        rect(c, tx - tw / 2 - 4, ty - 6, tw + 9, 7, color(wall, 24));
        rect(c, tx - tw / 2 - 4, ty + 3, tw + 2, 2, glow);
        line(c, tx - 2, ty - 7, tx - 2, ty - 42, color(wall, -17), 3);
        rect(c, tx - 11, ty - 25, 21, 3, glow);
        rect(c, tx - 6, ty - 38, 11, 2, color(trim, 26));
      } else {
        poly(
          c,
          [
            [tx - 25, ty],
            [tx - 3, ty - 51],
            [tx + 25, ty],
          ],
          color(roof, -23),
        );
        poly(
          c,
          [
            [tx - 25, ty],
            [tx - 3, ty - 51],
            [tx - 3, ty],
          ],
          color(roof, 13),
        );
        line(c, tx - 25, ty, tx - 3, ty - 51, color(roof, 41), 2);
        rect(c, tx - tw / 2 - 4, ty - 1, tw + 8, 5, color(wall, 25));
      }
    }
  }
  // Attached objects communicate use and local technology without putting obstacles in streets.
  const sideX = x + 10,
    farX = x + w - 43;
  if (advanced) {
    if (kind === 'house') {
      serviceModule(sideX + 2, buildingFoot - 32, 26, 29, 'terminal');
      if (organic > 0.4) planter(farX + 4, buildingFoot - 1, 27);
      else serviceModule(farX + 10, buildingFoot - 27, 25, 24, 'battery');
    } else if (kind === 'inn') {
      awning(sideX, buildingFoot - 69, Math.min(69, w * 0.26), false);
      seating(sideX + 5, buildingFoot - 1, Math.min(48, w * 0.2));
      serviceModule(farX + 6, buildingFoot - 47, 29, 43, 'terminal');
    } else if (kind === 'workshop') {
      serviceModule(sideX, buildingFoot - 39, 38, 35, 'fan');
      serviceModule(farX + 8, buildingFoot - 47, 29, 43, 'tank');
      line(c, sideX + 35, buildingFoot - 9, sideX + 52, buildingFoot - 9, color(wall, -37), 5);
      awning(sideX - 1, buildingFoot - 63, Math.min(62, w * 0.25), false);
    } else if (kind === 'storehouse') {
      const dockWidth = Math.min(66, w * 0.28);
      rect(c, sideX - 3, buildingFoot - 5, dockWidth + 4, 9, color(wall, -32));
      rect(c, sideX - 3, buildingFoot - 7, dockWidth + 4, 3, color(wall, 27));
      crate(sideX + 3, buildingFoot - 7, 24);
      crate(sideX + 24, buildingFoot - 9, 22);
      awning(sideX - 3, buildingFoot - 65, dockWidth + 1, false);
      serviceModule(farX + 10, buildingFoot - 39, 24, 34, 'terminal');
    } else if (kind === 'greenhouse') {
      serviceModule(sideX, buildingFoot - 42, 28, 38, 'tank');
      planter(farX + 3, buildingFoot, 31);
    } else {
      serviceModule(sideX, buildingFoot - 35, 27, 30, 'terminal');
      seating(farX - 2, buildingFoot - 1, 39);
    }
    for (const xx of [x + 5, x + w - 7]) {
      line(c, xx, eave + 21, xx, buildingFoot - 7, color(wall, -43), 5);
      line(c, xx, eave + 21, xx, buildingFoot - 7, color(trim, 10), 2);
      for (let yy = eave + 25; yy < buildingFoot - 14; yy += 23)
        rect(c, xx - 2, yy, 6, 3, color(wall, 19));
    }
    const sx = mid - portalWidth / 2 - 17,
      sy = buildingFoot - 92;
    rect(c, sx + 2, sy + 3, 19, 57, '#10222d80');
    rect(c, sx, sy, 18, 55, '#172d39');
    rect(c, sx, sy, 2, 55, color(trim, 68));
    rect(c, sx + 2, sy, 16, 2, color(trim, 68));
    for (let row = 0; row < 4; row++) {
      const bits = Math.floor(r() * 15) + 1;
      for (let col = 0; col < 3; col++)
        if ((bits >> col) & 1) rect(c, sx + 5 + col * 3, sy + 8 + row * 10, 2, 5, glow);
      rect(c, sx + 5, sy + 13 + row * 10, 8, 1, color(trim, 30));
    }
  } else {
    if (kind === 'storehouse') {
      crate(sideX, buildingFoot + 1, 29);
      crate(sideX + 21, buildingFoot - 2, 21);
      crate(sideX + 9, buildingFoot - 21, 21);
      barrel(farX + 9, buildingFoot);
      awning(sideX - 4, buildingFoot - 62, Math.min(68, w * 0.29));
    } else if (kind === 'workshop') {
      const fx = sideX + 5,
        fy = buildingFoot - 3;
      masonry(fx - 3, fy - 38, 36, 39, color(wall, -12));
      poly(
        c,
        [
          [fx + 2, fy - 4],
          [fx + 2, fy - 25],
          [fx + 9, fy - 32],
          [fx + 21, fy - 32],
          [fx + 28, fy - 25],
          [fx + 28, fy - 4],
        ],
        '#19242a',
      );
      rect(c, fx + 6, fy - 8, 20, 4, '#a95735');
      for (let n = 0; n < 4; n++) {
        const px = fx + 7 + n * 5;
        poly(
          c,
          [
            [px, fy - 7],
            [px + 1, fy - 14 - r() * 6],
            [px + 5, fy - 7],
          ],
          n % 2 ? '#efbd65' : '#d58942',
        );
      }
      rect(c, fx - 6, fy - 4, 42, 5, color(wall, -31));
      rect(c, fx - 6, fy - 5, 42, 2, color(wall, 32));
      boards(farX - 5, buildingFoot - 20, 39, 5);
      for (const px of [farX, farX + 25]) rect(c, px, buildingFoot - 16, 4, 17, color(wood, -28));
      line(c, farX + 7, buildingFoot - 24, farX + 17, buildingFoot - 19, '#26343b', 3);
      rect(c, farX + 5, buildingFoot - 28, 12, 5, '#a4a695');
    } else if (kind === 'inn' || kind === 'house') {
      if (kind === 'inn') {
        awning(sideX - 2, buildingFoot - 66, Math.min(69, w * 0.26));
        seating(sideX + 3, buildingFoot, Math.min(47, w * 0.19));
      } else barrel(sideX + 3, buildingFoot);
      if (organic > 0.35) planter(farX, buildingFoot - 1, 31);
      else crate(farX + 3, buildingFoot, 26);
    } else if (kind === 'greenhouse') {
      planter(sideX, buildingFoot - 1, 30);
      planter(farX, buildingFoot - 1, 30);
      crate(sideX + 4, buildingFoot - 3, 20);
    }
    if (kind !== 'church') {
      const sx = mid - portalWidth / 2 - 19,
        sy = buildingFoot - 47;
      line(c, sx, sy - 24, sx, sy + 1, dark, 3);
      line(c, sx, sy - 24, sx + 26, sy - 24, dark, 3);
      line(c, sx + 5, sy - 23, sx + 21, sy - 23, color(wood, 25));
      line(c, sx + 10, sy - 23, sx + 10, sy - 15, '#667271');
      line(c, sx + 24, sy - 23, sx + 24, sy - 15, '#667271');
      rect(c, sx + 5, sy - 15, 27, 25, color(wood, -30));
      rect(c, sx + 7, sy - 13, 23, 21, color(trim, -8));
      rect(c, sx + 7, sy - 13, 23, 2, color(trim, 30));
      const ix = sx + 18,
        iy = sy - 3;
      if (kind === 'workshop') {
        line(c, ix - 6, iy - 5, ix + 6, iy + 6, dark, 3);
        line(c, ix + 6, iy - 5, ix - 6, iy + 6, dark, 3);
      } else if (kind === 'inn') {
        rect(c, ix - 6, iy - 4, 11, 7, dark);
        rect(c, ix - 7, iy + 1, 2, 6, dark);
        rect(c, ix + 5, iy + 1, 2, 6, dark);
      } else {
        line(c, ix, iy - 7, ix, iy + 6, dark, 2);
        line(c, ix - 5, iy - 2, ix + 5, iy - 2, dark, 2);
      }
    }
  }
  return { image, x: 36, y: 194 };
}
