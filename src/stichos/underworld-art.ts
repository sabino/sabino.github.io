import { deriveSeed } from '../procedural/random.ts';
import {
  underworldTrapPhase,
  type UnderworldFrame,
  type UnderworldFeature,
  type UnderworldEnemy,
} from './underworld.ts';

export interface UnderworldView {
  width: number;
  height: number;
  x: number;
  y: number;
  tileSize: number;
  time: number;
  reducedMotion?: boolean;
  intensity?: number;
}
const palettes = [
  {
    void: '#111a23',
    floor: '#354650',
    edge: '#263844',
    light: '#b6d8d3',
    accent: '#74b1bd',
    wall: '#53636a',
  },
  {
    void: '#121a1b',
    floor: '#384941',
    edge: '#263931',
    light: '#d0d8a0',
    accent: '#9cbf78',
    wall: '#566b51',
  },
  {
    void: '#1c1824',
    floor: '#49434e',
    edge: '#352e3d',
    light: '#efca9c',
    accent: '#d3a679',
    wall: '#6c6075',
  },
];
const symbols: Record<string, string> = {
  up: '↑',
  down: '↓',
  gate: 'III',
  rune: '',
  inscription: '?',
  shortcut: '↔',
  survivor: '!',
  cache: '▣',
  secret: '◇',
  rest: '+',
  trap: '!',
  core: '✦',
};
/** Original Canvas2D geometry. No downloaded art, shader, audio or reference-game assets. */
export function drawUnderworld(
  ctx: CanvasRenderingContext2D,
  frame: UnderworldFrame,
  view: UnderworldView,
): void {
  const { plan, state } = frame,
    p = palettes[plan.depth],
    s = view.tileSize;
  if (
    !Number.isFinite(s) ||
    s < 4 ||
    s > 128 ||
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y)
  )
    return;
  const ox = Math.round(view.width / 2 - view.x * s),
    oy = Math.round(view.height / 2 - view.y * s),
    left = Math.max(0, Math.floor(-ox / s) - 1),
    right = Math.min(plan.width - 1, Math.ceil((view.width - ox) / s) + 1),
    top = Math.max(0, Math.floor(-oy / s) - 1),
    bottom = Math.min(plan.height - 1, Math.ceil((view.height - oy) / s) + 1);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = p.void;
  ctx.fillRect(0, 0, view.width, view.height);
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const cell = plan.cells[y * plan.width + x],
        px = ox + (x - 0.5) * s,
        py = oy + (y - 0.5) * s,
        n = deriveSeed(plan.seed, x, y);
      if (!cell) {
        if (plan.cells[(y + 1) * plan.width + x]) {
          ctx.fillStyle = p.wall;
          ctx.fillRect(px, py + s * 0.35, s, s * 0.65);
          ctx.fillStyle = p.edge;
          ctx.fillRect(px, py + s * 0.85, s, s * 0.15);
          ctx.fillStyle = p.light;
          ctx.globalAlpha = 0.15;
          ctx.fillRect(px, py + s * 0.35, s, s * 0.07);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      ctx.fillStyle =
        cell === 2 ? '#2d4b56' : cell === 3 ? '#394c36' : cell === 4 ? '#534c4c' : p.floor;
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = p.edge;
      ctx.fillRect(px, py, s, Math.max(1, s / 24));
      ctx.fillRect(px, py, Math.max(1, s / 24), s);
      ctx.fillStyle = p.light;
      ctx.globalAlpha = 0.06 + (n % 5) * 0.015;
      ctx.fillRect(
        px + (s * ((n >> 5) % 7)) / 10,
        py + (s * ((n >> 9) % 7)) / 10,
        s * 0.24,
        s * 0.08,
      );
      ctx.globalAlpha = 1;
      if (cell === 2) {
        const tide = view.reducedMotion ? 0 : Math.sin(view.time * 1.4 + x * 0.9 + y) * s * 0.035;
        ctx.strokeStyle = '#6097a1';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = Math.max(1, s / 24);
        ctx.beginPath();
        ctx.moveTo(px + s * 0.2, py + s * 0.5 + tide);
        ctx.lineTo(px + s * 0.65, py + s * 0.5 + tide);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (cell === 3 && n % 4 === 0) {
        ctx.strokeStyle = '#718868';
        ctx.lineWidth = Math.max(1, s / 16);
        ctx.beginPath();
        ctx.moveTo(px, py + s * 0.6);
        ctx.lineTo(px + s * 0.4, py + s * 0.4);
        ctx.lineTo(px + s * 0.7, py + s);
        ctx.stroke();
      }
      if (cell === 4 && n % 3 === 0) {
        ctx.fillStyle = '#928073';
        ctx.fillRect(px + s * 0.1, py + s * 0.1, s * 0.08, s * 0.08);
        ctx.fillRect(px + s * 0.8, py + s * 0.8, s * 0.08, s * 0.08);
      }
    }
  const visible = (x: number, y: number) =>
    x >= left - 2 && x <= right + 2 && y >= top - 2 && y <= bottom + 2;
  for (const feature of plan.features)
    if (visible(feature.x, feature.y))
      drawFeature(
        ctx,
        feature,
        state.opened.includes(feature.id),
        state.rescued.includes(feature.id),
        ox,
        oy,
        s,
        view.time,
        p.accent,
        !!view.reducedMotion || view.intensity === 0,
      );
  for (const enemy of state.enemies)
    if (enemy.hp > 0 && visible(enemy.x, enemy.y))
      drawEnemy(ctx, enemy, ox, oy, s, view.time, !!view.reducedMotion);
  for (const projectile of frame.projectiles) {
    if (!visible(projectile.x, projectile.y)) continue;
    const x = ox + projectile.x * s,
      y = oy + projectile.y * s;
    ctx.strokeStyle = projectile.friendly ? '#e5d79b' : '#ef9c83';
    ctx.lineWidth = Math.max(2, s / 12);
    ctx.beginPath();
    ctx.moveTo(
      x - Math.cos(projectile.heading) * s * 0.45,
      y - Math.sin(projectile.heading) * s * 0.45,
    );
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  // Distance fog preserves immediately adjacent hazards; discovered rooms remain on the separate map.
  const radius = Math.min(view.width, view.height) * 0.85,
    gradient = ctx.createRadialGradient(
      view.width / 2,
      view.height / 2,
      Math.max(s * 2, radius * 0.3),
      view.width / 2,
      view.height / 2,
      radius,
    );
  gradient.addColorStop(0, 'rgba(4,8,14,0)');
  gradient.addColorStop(1, 'rgba(4,8,14,0.68)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
}
function drawFeature(
  c: CanvasRenderingContext2D,
  f: UnderworldFeature,
  opened: boolean,
  rescued: boolean,
  ox: number,
  oy: number,
  s: number,
  time: number,
  accent: string,
  reduced: boolean,
) {
  if (f.kind === 'survivor' && rescued) return;
  const x = ox + f.x * s,
    y = oy + f.y * s;
  c.save();
  c.translate(x, y);
  if (f.kind === 'trap') {
    const phase = underworldTrapPhase(time, f.id);
    c.fillStyle = phase === 'active' ? '#efb086' : phase === 'warning' ? '#dec984' : '#252c32';
    c.fillRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
    c.strokeStyle = phase === 'idle' ? '#687779' : '#fff0cd';
    c.lineWidth = Math.max(1, s / 20);
    c.strokeRect(-s * 0.38, -s * 0.38, s * 0.76, s * 0.76);
    if (phase === 'warning') {
      c.fillStyle = '#251f19';
      c.font = `bold ${Math.round(s * 0.6)}px monospace`;
      c.textAlign = 'center';
      c.fillText('!', 0, s * 0.22);
    }
    if (phase === 'active') {
      for (let i = 0; i < 3; i++) {
        c.fillStyle = '#f2d3a0';
        c.fillRect(
          (i - 1) * s * 0.25,
          -s * (reduced ? 0.5 : 0.4 + Math.sin(time * 10 + i) * 0.1),
          s * 0.09,
          s * 0.65,
        );
      }
    }
    c.restore();
    return;
  }
  if (f.kind === 'gate' || f.kind === 'shortcut') {
    c.fillStyle = opened ? '#524d42' : '#b29b78';
    for (let i = -1; i <= 1; i++)
      c.fillRect(i * s * 0.25, -s * 0.48, s * 0.09, opened ? s * 0.18 : s * 0.96);
    c.fillRect(-s * 0.45, -s * 0.48, s * 0.9, s * 0.1);
    c.restore();
    return;
  }
  if (f.kind === 'survivor') {
    c.fillStyle = '#1d2629';
    c.fillRect(-s * 0.25, s * 0.1, s * 0.5, s * 0.17);
    c.fillStyle = '#96b9a4';
    c.fillRect(-s * 0.2, -s * 0.22, s * 0.4, s * 0.42);
    c.fillStyle = '#d5bfa3';
    c.fillRect(-s * 0.13, -s * 0.5, s * 0.26, s * 0.24);
  } else {
    c.fillStyle = opened
      ? '#454d4d'
      : f.kind === 'rest'
        ? '#8e6646'
        : f.kind === 'up' || f.kind === 'down'
          ? '#647579'
          : '#62717a';
    c.fillRect(-s * 0.35, -s * 0.28, s * 0.7, s * 0.55);
    c.strokeStyle = accent;
    c.lineWidth = Math.max(1, s / 20);
    c.strokeRect(-s * 0.35, -s * 0.28, s * 0.7, s * 0.55);
  }
  if (!opened) {
    c.font = `bold ${Math.round(s * 0.5)}px monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#f4e8c4';
    c.fillText(
      f.kind === 'rune' ? ['∪', 'Y', '*'][f.value ?? 0] : (symbols[f.kind] ?? '?'),
      0,
      f.kind === 'survivor' ? -s * 0.8 : 0,
    );
  }
  c.restore();
}
function drawEnemy(
  c: CanvasRenderingContext2D,
  e: UnderworldEnemy,
  ox: number,
  oy: number,
  s: number,
  time: number,
  reduced: boolean,
) {
  const x = ox + e.x * s,
    y = oy + e.y * s;
  c.save();
  c.translate(x, y);
  if (e.intent) {
    const radius = e.intent.range * s;
    c.save();
    c.rotate(e.intent.heading);
    c.fillStyle = 'rgba(230,119,82,0.18)';
    c.strokeStyle = '#f4c297';
    c.lineWidth = Math.max(1, s / 18);
    if (e.intent.shape === 'radial') {
      c.beginPath();
      c.arc(0, 0, radius, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (e.intent.shape === 'line') {
      c.fillRect(0, -s * 0.6, radius, s * 1.2);
      c.strokeRect(0, -s * 0.6, radius, s * 1.2);
    } else {
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, radius, -1.15, 1.15);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
  }
  const boss = e.kind === 'boss',
    scale = boss ? 1.45 : e.kind === 'mini' ? 1.18 : 1,
    bob = reduced
      ? 0
      : e.state === 'pursue'
        ? Math.sin(time * 9) * s * 0.025
        : Math.sin(time * 2 + e.x) * s * 0.014;
  c.scale(scale, scale);
  c.fillStyle = 'rgba(5,8,12,0.4)';
  c.fillRect(-s * 0.35, s * 0.08, s * 0.7, s * 0.18);
  c.translate(0, bob);
  c.fillStyle = e.phase === 2 ? '#ac786a' : e.kind === 'crawler' ? '#779078' : '#90918e';
  if (e.kind === 'crawler') {
    c.fillRect(-s * 0.3, -s * 0.12, s * 0.6, s * 0.3);
    for (let i = -1; i <= 1; i++) {
      c.fillRect(i * s * 0.2, -s * 0.2, s * 0.06, s * 0.5);
    }
    c.fillStyle = '#e0c584';
    c.fillRect(s * 0.14, -s * 0.08, s * 0.09, s * 0.07);
  } else {
    c.fillRect(-s * 0.23, -s * 0.42, s * 0.46, s * 0.55);
    c.fillRect(-s * 0.31, -s * 0.36, s * 0.1, s * 0.4);
    c.fillRect(s * 0.21, -s * 0.36, s * 0.1, s * 0.4);
    c.fillStyle = '#41484c';
    c.fillRect(-s * 0.19, s * 0.03, s * 0.14, s * 0.25);
    c.fillRect(s * 0.05, s * 0.03, s * 0.14, s * 0.25);
    c.fillStyle = boss ? '#b9a08a' : '#b8b5a1';
    c.fillRect(-s * 0.18, -s * 0.68, s * 0.36, s * 0.26);
    c.fillStyle = e.phase === 2 ? '#f1b096' : '#d8dfb1';
    c.fillRect(-s * 0.11, -s * 0.6, s * 0.22, s * 0.06);
    if (boss) {
      c.fillStyle = '#756f75';
      c.fillRect(-s * 0.35, -s * 0.48, s * 0.16, s * 0.15);
      c.fillRect(s * 0.19, -s * 0.48, s * 0.16, s * 0.15);
    }
  }
  c.fillStyle = '#252a30';
  c.fillRect(-s * 0.35, -s * 0.85, s * 0.7, s * 0.07);
  c.fillStyle = e.phase === 2 ? '#efb27f' : '#d4c293';
  c.fillRect(-s * 0.35, -s * 0.85, (s * 0.7 * e.hp) / e.maxHp, s * 0.07);
  c.restore();
}
