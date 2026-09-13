import type { Point } from './types.ts';
import type { CombatCue, CombatFeedback } from './combat-feedback.ts';

type Project = (point: Point) => Point;
const TAU = Math.PI * 2;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const pixel = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) =>
  ctx.fillRect(
    Math.round(x),
    Math.round(y),
    Math.max(1, Math.round(w)),
    Math.max(1, Math.round(h)),
  );
function ring(ctx: CanvasRenderingContext2D, radius: number, phase: number, count = 24) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + phase;
    pixel(ctx, Math.cos(a) * radius, Math.sin(a) * radius * 0.58, 2, 2);
  }
}
function groundShape(ctx: CanvasRenderingContext2D, cue: CombatCue, unit: number) {
  const r = (cue.radius ?? 1.4) * unit;
  if (cue.shape === 'line') {
    ctx.moveTo(0, -unit * 0.16);
    ctx.lineTo(r, -unit * 0.16);
    ctx.lineTo(r, unit * 0.16);
    ctx.lineTo(0, unit * 0.16);
  } else if (cue.shape === 'circle') ctx.ellipse(0, 0, r, r, 0, 0, TAU);
  else {
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -0.8, 0.8);
  }
  ctx.closePath();
}

/** Ground warnings stay visible at intensity zero; disabling decoration never removes safety cues. */
export function drawCombatGround(
  ctx: CanvasRenderingContext2D,
  feedback: CombatFeedback,
  project: Project,
  unit: number,
) {
  for (const cue of feedback.activeCues) {
    if (!['telegraph', 'anticipation', 'charge', 'area', 'guard', 'dash'].includes(cue.kind))
      continue;
    const p = project(cue),
      t = clamp(cue.age / cue.duration, 0, 1);
    const warning = cue.kind === 'telegraph' || cue.kind === 'anticipation';
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    if (warning) {
      ctx.rotate(cue.heading ?? 0);
      ctx.beginPath();
      groundShape(ctx, cue, unit);
      ctx.fillStyle = '#b95137';
      ctx.globalAlpha = 0.12 + t * 0.1;
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#f0bd86';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Inward chevrons communicate a closing attack window without a flashing strobe.
      ctx.fillStyle = '#f0d0a1';
      const x = (cue.radius ?? 1.4) * unit * (1 - t * 0.78);
      pixel(ctx, x, -3, 4, 6);
      pixel(ctx, x - 2, -1, 2, 2);
    } else {
      const charge = cue.kind === 'charge';
      const radius = charge ? unit * 0.42 : (cue.radius ?? 1) * unit * (0.35 + t * 0.65);
      ctx.strokeStyle = cue.color ?? '#9fcdb9';
      ctx.fillStyle = cue.color ?? '#9fcdb9';
      ctx.globalAlpha = charge ? 0.8 : (1 - t) * Math.max(0.2, feedback.settings.intensity) * 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        radius,
        radius * 0.58,
        0,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * (charge ? t : 1),
      );
      ctx.stroke();
      if (!feedback.settings.reducedMotion && feedback.settings.intensity > 0.25)
        ring(ctx, radius + 3, charge ? 0 : t * 0.3, 16);
    }
    ctx.restore();
  }
}

function drawCue(
  ctx: CanvasRenderingContext2D,
  cue: CombatCue,
  feedback: CombatFeedback,
  project: Project,
  unit: number,
) {
  const p = project(cue),
    t = clamp(cue.age / cue.duration, 0, 1),
    s = unit / 32;
  const reduced = feedback.settings.reducedMotion;
  const intensity = feedback.settings.intensity;
  const decorative = !reduced && intensity > 0;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y - unit * 0.35));
  ctx.fillStyle = cue.color ?? '#dedac5';
  ctx.strokeStyle = cue.color ?? '#dedac5';
  ctx.globalAlpha = Math.min(1, (1 - t) * 1.5);
  if (cue.kind === 'melee') {
    ctx.rotate(cue.heading ?? 0);
    const release = reduced ? 0.6 : clamp((t - 0.06) / 0.46, 0, 1);
    const a = -1.1 + release * 2.2;
    const radius = unit * Math.min(cue.radius ?? 1.3, 2.5);
    if (cue.style === 'thrust') {
      const reach = radius * (reduced ? 0.85 : Math.sin(Math.PI * Math.min(1, t * 1.3)));
      ctx.globalAlpha = (1 - t) * Math.max(0.3, intensity);
      pixel(ctx, reach * 0.3, -s, reach * 0.7, 2 * s);
      pixel(ctx, reach - 2 * s, -4 * s, 4 * s, 8 * s);
      ctx.restore();
      return;
    }
    const segments = decorative ? 9 : 3;
    // A bright leading edge and stepped, fading afterimage make facing readable at thumb scale.
    for (let i = 0; i < segments; i++) {
      const angle = a - i * 0.1;
      ctx.globalAlpha = (1 - i / segments) * Math.max(0.28, intensity) * (1 - t * 0.7);
      const x = Math.cos(angle) * radius,
        y = Math.sin(angle) * radius * 0.7;
      ctx.fillStyle = i === 0 ? '#fff0ce' : (cue.color ?? '#d3d8ce');
      pixel(ctx, x - 2 * s, y - s, (i === 0 ? 5 : 3) * s, 2 * s);
    }
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.87, radius * 0.61, 0, a - 0.55, a);
    ctx.stroke();
  } else if (cue.kind === 'projectile') {
    ctx.rotate(cue.heading ?? 0);
    if (decorative)
      for (let i = 1; i <= 5; i++) {
        ctx.globalAlpha = (1 - i / 6) * intensity * 0.45;
        pixel(ctx, (-8 - i * 5) * s, -s, (6 - i) * s, 2 * s);
      }
    ctx.globalAlpha = 1;
    if (cue.style === 'bolt') {
      ctx.fillStyle = cue.color ?? '#b4cdd0';
      pixel(ctx, -7 * s, -2 * s, 14 * s, 4 * s);
      ctx.fillStyle = '#f3e8c5';
      pixel(ctx, -2 * s, -s, 8 * s, 2 * s);
      pixel(ctx, 2 * s, -4 * s, 2 * s, 8 * s);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#ddc497';
    pixel(ctx, -11 * s, -s, 20 * s, 2 * s);
    ctx.fillStyle = '#f0e9cd';
    pixel(ctx, 8 * s, -2 * s, 4 * s, 4 * s);
    ctx.fillStyle = cue.color ?? '#bdc6ca';
    pixel(ctx, -13 * s, -3 * s, 4 * s, 2 * s);
    pixel(ctx, -13 * s, s, 4 * s, 2 * s);
  } else if (cue.kind === 'impact') {
    const progress = reduced ? 0.5 : t;
    const r = (4 + progress * 12) * s;
    ctx.globalAlpha = (1 - t) * Math.max(0.3, intensity);
    const rays = decorative ? 6 : 3;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + (cue.heading ?? 0);
      pixel(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.7, 3 * s, s);
    }
    if (t < 0.35) {
      ctx.fillStyle = '#fff0d0';
      pixel(ctx, -s, -4 * s, 2 * s, 8 * s);
      pixel(ctx, -4 * s, -s, 8 * s, 2 * s);
    }
  } else if (cue.kind === 'guard') {
    ctx.globalAlpha = (1 - t) * Math.max(0.25, intensity) * 0.65;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    const r = unit * (0.5 + (reduced ? 0.3 : t * 0.4));
    ctx.moveTo(-r * 0.7, -r * 0.75);
    ctx.lineTo(0, -r);
    ctx.lineTo(r * 0.7, -r * 0.75);
    ctx.lineTo(r * 0.55, r * 0.25);
    ctx.lineTo(0, r * 0.7);
    ctx.lineTo(-r * 0.55, r * 0.25);
    ctx.closePath();
    ctx.stroke();
  } else if (cue.kind === 'loot' || cue.kind === 'level') {
    const rise = reduced ? 0 : Math.sin((Math.min(1, t * 2) * Math.PI) / 2) * 11 * s;
    ctx.translate(0, -rise);
    const r = cue.kind === 'level' ? 13 * s : 5 * s;
    ctx.globalAlpha = (1 - t) * Math.max(0.3, intensity);
    ctx.fillStyle = '#ebce7c';
    pixel(ctx, -s, -r, 2 * s, r * 2);
    pixel(ctx, -r, -s, r * 2, 2 * s);
    ctx.fillStyle = '#fff0c4';
    pixel(ctx, -2 * s, -2 * s, 4 * s, 4 * s);
    if (decorative && cue.kind === 'level') ring(ctx, r * (1 + t), 0);
  } else if (cue.kind === 'status') {
    ctx.globalAlpha = (1 - t) * Math.max(0.35, intensity);
    const rise = reduced ? 0 : t * 14 * s;
    if (cue.symbol === 'burn') {
      pixel(ctx, -3 * s, -4 * s - rise, 6 * s, 4 * s);
      pixel(ctx, -2 * s, -7 * s - rise, 3 * s, 4 * s);
      pixel(ctx, s, -10 * s - rise, 2 * s, 5 * s);
    } else {
      pixel(ctx, -s, -8 * s - rise, 2 * s, 8 * s);
      pixel(ctx, -4 * s, -5 * s - rise, 8 * s, 2 * s);
      if (cue.symbol === 'chill') {
        pixel(ctx, -4 * s, -8 * s - rise, 2 * s, 2 * s);
        pixel(ctx, 2 * s, -2 * s - rise, 2 * s, 2 * s);
      }
    }
  } else if (cue.kind === 'charge') {
    const r = (7 + (reduced ? 0 : (1 - t) * 14)) * s;
    ctx.globalAlpha = 0.4 + t * 0.4;
    ring(ctx, r, reduced ? 0 : t * Math.PI, 8);
    ctx.fillStyle = '#efe3b8';
    pixel(ctx, -s, -unit * 0.9, 2 * s, 5 * s);
  }
  if (cue.text) {
    ctx.globalAlpha = 1;
    const warning = cue.kind === 'telegraph' || cue.kind === 'anticipation';
    const rise = warning || reduced ? 0 : Math.min(12, t * 14) * s;
    ctx.font = `${Math.max(11, Math.round(11 * Math.sqrt(unit / 36)))}px "Courier New",monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const text = cue.text.slice(0, 48),
      y = -unit * (warning ? 1.35 : 0.75) - rise;
    const width = Math.min(unit * 8, ctx.measureText(text).width + 8);
    ctx.fillStyle = '#142c39e8';
    pixel(ctx, -width / 2, y - 13, width, 15);
    ctx.fillStyle = warning ? '#f3cf9b' : (cue.color ?? '#f2e4b5');
    ctx.fillText(text, 0, y, unit * 8);
  }
  ctx.restore();
}

/** All loops are bounded by the director's fixed pool; no gradients, filters or canvas allocations. */
export function drawCombatForeground(
  ctx: CanvasRenderingContext2D,
  feedback: CombatFeedback,
  project: Project,
  unit: number,
) {
  for (const cue of feedback.activeCues) drawCue(ctx, cue, feedback, project, unit);
  if (feedback.settings.reducedMotion || feedback.settings.intensity === 0) return;
  ctx.save();
  for (const particle of feedback.particles) {
    if (!particle.alive) continue;
    const p = project(particle),
      s = unit / 32;
    ctx.globalAlpha = Math.min(0.85, (1 - particle.life / particle.duration) * 1.7);
    ctx.fillStyle = particle.color;
    const x = p.x,
      y = p.y - Math.max(0, particle.z) * unit;
    pixel(ctx, x, y, particle.size * s, (particle.kind === 'rune' ? 3 : particle.size) * s);
    if (particle.kind === 'rune') pixel(ctx, x - s, y + s, 3 * s, s);
  }
  ctx.restore();
}
