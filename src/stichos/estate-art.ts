import { ESTATE_STATIONS, PROPERTY_RULES, type StationKind } from './property-world.ts';
import type { Point } from './types.ts';
import { drawSignSymbol } from './world-signs.ts';

/** Original compact silhouettes; motion reports actual station work, never imaginary throughput. */
export function drawEstateStation(
  c: CanvasRenderingContext2D,
  kind: StationKind,
  x: number,
  y: number,
  scale: number,
  time: number,
  working: boolean,
  reduced = false,
) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(scale, scale);
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  r(-22, -2, 44, 8, '#142d32');
  r(-19, -18, 38, 18, '#675447');
  r(-19, -20, 38, 4, '#b0986e');
  r(-17, -1, 4, 8, '#3d4140');
  r(12, -1, 4, 8, '#3d4140');
  if (kind === 'sawmill') {
    r(-24, -15, 43, 5, '#c4a16f');
    r(-21, -13, 40, 1, '#725639');
    c.save();
    c.translate(5, -18);
    c.rotate(working && !reduced ? time * 4 : 0);
    c.fillStyle = '#bbccce';
    for (let i = 0; i < 8; i++) {
      c.rotate(Math.PI / 4);
      c.fillRect(-1, -10, 3, 9);
    }
    c.restore();
    r(3, -20, 4, 4, '#4c646d');
  } else if (kind === 'carpentry') {
    r(-13, -24, 15, 3, '#d4bd88');
    r(-10, -22, 3, 4, '#a08359');
    r(7, -25, 3, 8, '#424e52');
    r(4, -27, 10, 4, '#a7bcc3');
  } else if (kind === 'garden') {
    r(-20, -17, 40, 19, '#534a39');
    for (let i = 0; i < 5; i++) {
      r(-16 + i * 7, -14, 2, 13, '#8b9870');
      r(-19 + i * 7, -11, 8, 4, '#669564');
      r(-17 + i * 7, -17, 4, 5, '#aec77a');
    }
  } else if (kind === 'apothecary') {
    for (let i = 0; i < 4; i++) {
      r(-15 + i * 9, -30, 5, 12, '#829da5');
      r(-14 + i * 9, -26, 3, 7, i % 2 ? '#b3a179' : '#8bbe99');
      r(-14 + i * 9, -32, 3, 3, '#c8b18e');
    }
  } else {
    r(-21, -38, 3, 24, '#786047');
    r(18, -38, 3, 24, '#786047');
    r(-25, -40, 50, 7, '#b7b08b');
    for (let i = 0; i < 5; i++) r(-24 + i * 10, -40, 5, 10, '#5e8a86');
    r(-12, -26, 9, 8, '#aa986d');
    r(2, -24, 13, 6, '#8a9c79');
  }
  if (working) {
    r(-19, -5, 38, 2, '#3f4f44');
    r(-18, -5, Math.round((reduced ? 0.5 : (Math.sin(time * 2) + 1) / 2) * 36), 2, '#decf8b');
  }
  drawSignSymbol(
    c,
    kind === 'store' ? 'store' : kind === 'garden' ? 'farm' : 'workshop',
    -6,
    1,
    12,
    '#e9d8a7',
    '#243e46',
  );
  c.restore();
}

/** Preview coordinates use the same top-left occupied tile anchor as PropertyWorld. */
export interface EstatePlacementPreview {
  kind: StationKind;
  worldX: number;
  worldY: number;
  /** Local ground check only. The authority still checks ownership, access and funds. */
  allowed?: boolean;
}
export function estatePlacementFootprint(preview: EstatePlacementPreview) {
  if (
    !Object.hasOwn(ESTATE_STATIONS, preview.kind) ||
    !Number.isFinite(preview.worldX) ||
    !Number.isFinite(preview.worldY) ||
    Math.abs(preview.worldX) > PROPERTY_RULES.maxCoordinate ||
    Math.abs(preview.worldY) > PROPERTY_RULES.maxCoordinate
  )
    return null;
  const x = Math.round(preview.worldX),
    y = Math.round(preview.worldY),
    { width, height } = ESTATE_STATIONS[preview.kind];
  return { x, y, width, height, center: { x: x + (width - 1) / 2, y: y + (height - 1) / 2 } };
}
/** Bounded, static ghost: no work animation or success colour implies a completed purchase. */
export function drawEstatePlacement(
  c: CanvasRenderingContext2D,
  preview: EstatePlacementPreview,
  project: (point: Point) => Point,
  unit: number,
) {
  const footprint = estatePlacementFootprint(preview);
  if (!footprint || !Number.isFinite(unit) || unit <= 0 || unit > 1024) return;
  const origin = project({ x: footprint.x - 0.5, y: footprint.y - 0.5 }),
    center = project(footprint.center),
    scale = unit / 32,
    rejected = preview.allowed === false,
    ink = rejected ? '#ffc1ac' : preview.allowed === true ? '#c7ead7' : '#f2d18b';
  if (![origin.x, origin.y, center.x, center.y].every(Number.isFinite)) return;
  c.save();
  c.fillStyle = rejected ? '#6a2c2b88' : '#233e4788';
  c.fillRect(origin.x, origin.y, footprint.width * unit, footprint.height * unit);
  c.strokeStyle = ink;
  c.lineWidth = 2;
  c.setLineDash(rejected ? [] : [5, 3]);
  for (let y = 0; y < footprint.height; y++)
    for (let x = 0; x < footprint.width; x++) {
      c.strokeRect(origin.x + x * unit, origin.y + y * unit, unit, unit);
      if (rejected) {
        c.beginPath();
        c.moveTo(origin.x + x * unit + 5, origin.y + y * unit + 5);
        c.lineTo(origin.x + (x + 1) * unit - 5, origin.y + (y + 1) * unit - 5);
        c.moveTo(origin.x + (x + 1) * unit - 5, origin.y + y * unit + 5);
        c.lineTo(origin.x + x * unit + 5, origin.y + (y + 1) * unit - 5);
        c.stroke();
      }
    }
  c.setLineDash([]);
  c.globalAlpha = 0.62;
  drawEstateStation(c, preview.kind, center.x, center.y, scale, 0, false, true);
  c.globalAlpha = 1;
  // Dimension badge is readable without colour; app controls supply the review and confirm action.
  c.font = 'bold 12px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const caption = `${footprint.width} × ${footprint.height} · ${rejected ? 'Blocked' : 'Preview'}`,
    width = c.measureText(caption).width + 14,
    labelY = origin.y + footprint.height * unit + 14;
  c.fillStyle = '#132b35';
  c.fillRect(center.x - width / 2, labelY - 11, width, 22);
  c.fillStyle = ink;
  c.fillText(caption, center.x, labelY);
  c.restore();
}
