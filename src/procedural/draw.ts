import type { BodyPose, SpeciesGenome, V3, WeaponGenome } from './schema';

type Point = { x: number; y: number };
type Project = (p: V3) => Point;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (v: V3) => mul(v, 1 / (Math.hypot(v.x, v.y, v.z) || 1));
const hash = (seed: number, salt: number) => {
  const v = Math.sin(seed * 0.000017 + salt * 127.1) * 43758.5453;
  return v - Math.floor(v);
};

function rgb(color: string): number[] {
  const hex = color.replace('#', '');
  if (/^[\da-f]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  if (/^[\da-f]{3}$/i.test(hex)) return [...hex].map((c) => parseInt(c + c, 16));
  const n = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (color.startsWith('rgb') && n.length >= 3) return n.slice(0, 3);
  if (color.startsWith('hsl') && n.length >= 3) {
    const h = n[0] / 360,
      s = n[1] / 100,
      l = n[2] / 100;
    const f = (k: number) => {
      const t = (k + h * 12) % 12;
      return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(t - 3, 9 - t, 1)));
    };
    return [f(0), f(8), f(4)];
  }
  return [126, 178, 163];
}

function tint(color: string, light: number): string {
  return `rgb(${rgb(color)
    .map((c) => Math.round(clamp(light > 1 ? c + (245 - c) * (light - 1) : c * light, 0, 255)))
    .join(',')})`;
}

function polygon(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  fill: string,
  stroke?: string,
  width = 1,
): void {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0].x), Math.round(points[0].y));
  for (let i = 1; i < points.length; i++)
    ctx.lineTo(Math.round(points[i].x), Math.round(points[i].y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }
}

function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const p of sorted) {
    while (lower.length > 1 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  for (const p of sorted.reverse()) {
    while (upper.length > 1 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function segment(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  wa: number,
  wb: number,
  color: string,
  outline: string,
): void {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / length,
    ny = (b.x - a.x) / length;
  const side = (p: Point, w: number, s: number) => ({ x: p.x + nx * w * s, y: p.y + ny * w * s });
  polygon(
    ctx,
    [side(a, wa, 1), side(b, wb, 1), side(b, wb, -1), side(a, wa, -1)],
    color,
    outline,
    1,
  );
  if (wa > 1.4)
    polygon(
      ctx,
      [
        side(a, wa * 0.1, -1),
        side(b, wb * 0.1, -1),
        side(b, wb * 0.65, -1),
        side(a, wa * 0.65, -1),
      ],
      tint(color, 1.36),
    );
}

function gem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  const r = Math.max(1, radius);
  polygon(
    ctx,
    [
      { x, y: y - r },
      { x: x + r, y },
      { x, y: y + r },
      { x: x - r, y },
    ],
    color,
  );
  polygon(
    ctx,
    [
      { x, y: y - r },
      { x: x + r, y },
      { x, y },
    ],
    tint(color, 1.62),
  );
  if (r > 3)
    ((ctx.fillStyle = '#f2fff0'), ctx.fillRect(Math.round(x - 1), Math.round(y - r / 2), 2, 2));
}

function viewVector(project: Project): V3 {
  const o = project({ x: 0, y: 0, z: 0 });
  const a = project({ x: 1, y: 0, z: 0 }),
    b = project({ x: 0, y: 1, z: 0 }),
    c = project({ x: 0, y: 0, z: 1 });
  const v = cross(
    { x: a.x - o.x, y: b.x - o.x, z: c.x - o.x },
    { x: a.y - o.y, y: b.y - o.y, z: c.y - o.y },
  );
  return normalize(v.y < 0 ? mul(v, -1) : v);
}

/** Draws only from a genome and its evaluated body/limb graph; no creature sprites or canned silhouettes. */
export function drawSpecies(
  ctx: CanvasRenderingContext2D,
  species: SpeciesGenome,
  pose: BodyPose,
  project: Project,
  scale: number,
  highlight = false,
): void {
  if (!pose.nodes.length || !Number.isFinite(scale) || scale <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const forward = { x: Math.cos(pose.facing), y: 0, z: Math.sin(pose.facing) };
  const lateral = { x: -forward.z, y: 0, z: forward.x };
  const view = viewVector(project),
    outline = tint(species.color, 0.28);
  const jobs: { depth: number; run: () => void }[] = [];
  const nodeById = new Map(species.nodes.map((n) => [n.id, n]));
  const poseById = new Map(pose.nodes.map((n) => [n.id, n]));
  const head = pose.nodes.reduce((best, n) =>
    dot(n.position, forward) > dot(best.position, forward) ? n : best,
  );
  const lightDirection = normalize({ x: -0.6, y: 1.1, z: -0.8 });
  const qscale = Math.max(0.8, scale / 32);

  for (const limb of pose.limbs) {
    const attachment = species.appendages.find((a) => a.id === limb.id);
    const parent = attachment ? poseById.get(attachment.parent) : pose.nodes[0];
    const radius = parent?.radius ?? 0.25;
    const a = project(limb.hip),
      b = project(limb.joint),
      c = project(limb.tip);
    const width = clamp(radius * scale * 0.2, 1.1, 5.5 * qscale);
    jobs.push({
      depth: dot(limb.joint, view),
      run: () => {
        if (limb.kind === 'wing') {
          const inset = project(add(limb.hip, mul(forward, -radius * 1.2)));
          const fold = {
            x: (b.x + c.x) / 2 + (a.x - b.x) * 0.3,
            y: (b.y + c.y) / 2 + (a.y - b.y) * 0.3,
          };
          polygon(ctx, [a, b, c, fold, inset], tint(species.accent, 0.64), outline);
          polygon(ctx, [a, b, c], tint(species.accent, 1.1));
          segment(ctx, a, b, width * 0.42, width * 0.3, species.color, outline);
          segment(ctx, b, c, width * 0.3, 0.5, species.accent, outline);
          segment(ctx, a, c, 0.55, 0.5, tint(species.color, 0.72), outline);
        } else if (limb.kind === 'antenna') {
          segment(ctx, a, b, width * 0.32, 0.55, tint(species.color, 0.75), outline);
          segment(ctx, b, c, 0.55, 0.35, species.accent, outline);
          gem(ctx, c.x, c.y, 1.8 * qscale, species.accent);
        } else if (limb.kind === 'tendril') {
          const middle = { x: b.x * 0.4 + c.x * 0.6, y: b.y * 0.4 + c.y * 0.6 + width * 1.4 };
          segment(ctx, a, b, width, width * 0.67, tint(species.color, 0.74), outline);
          segment(ctx, b, middle, width * 0.67, width * 0.35, species.color, outline);
          segment(ctx, middle, c, width * 0.35, 0.5, species.accent, outline);
        } else {
          segment(ctx, a, b, width, width * 0.76, tint(species.color, 0.79), outline);
          gem(ctx, b.x, b.y, width * 1.03, tint(species.color, 1.2));
          segment(ctx, b, c, width * 0.63, width * 0.36, tint(species.color, 0.62), outline);
          const toe = { x: c.x + (c.x - b.x) * 0.15, y: c.y + (limb.planted ? 0 : -width * 0.35) };
          segment(ctx, c, toe, width * 0.45, 0.5, species.accent, outline);
          if (limb.planted) {
            ctx.fillStyle = tint(species.accent, 0.8);
            ctx.fillRect(
              Math.round(c.x - width * 0.6),
              Math.round(c.y),
              Math.max(2, Math.round(width * 1.6)),
              Math.max(1, Math.round(qscale)),
            );
          }
        }
      },
    });
  }

  for (const node of pose.nodes) {
    const descriptor = nodeById.get(node.id);
    const radius = Math.max(0.04, node.radius);
    const length = Math.max(radius * 0.7, node.length * 0.5 + radius * 0.35);
    const tallness =
      species.locomotion === 'slither' ? 0.67 : species.locomotion === 'hop' ? 1.12 : 0.87;
    const worldRings: V3[][] = [];
    for (let ring = 0; ring < 5; ring++) {
      const longitudinal = (ring - 2) / 2;
      // A superellipse profile makes generated segments read as shell/capsule volumes.
      const ringRadius = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(longitudinal), 2.5)), 0.45);
      worldRings.push(
        Array.from({ length: 8 }, (_, i) => {
          const angle = (i / 8) * TAU + Math.PI / 8;
          return add(
            node.position,
            add(
              mul(forward, longitudinal * length),
              add(mul(lateral, Math.cos(angle) * radius * ringRadius), {
                x: 0,
                y: Math.sin(angle) * radius * ringRadius * tallness,
                z: 0,
              }),
            ),
          );
        }),
      );
    }
    const points = worldRings.flat().map(project);
    const faces: { points: Point[]; depth: number; color: string }[] = [];
    for (let ring = 0; ring < 4; ring++)
      for (let i = 0; i < 8; i++) {
        const vertices = [
          worldRings[ring][i],
          worldRings[ring + 1][i],
          worldRings[ring + 1][(i + 1) % 8],
          worldRings[ring][(i + 1) % 8],
        ];
        const middle = mul(vertices.reduce(add, { x: 0, y: 0, z: 0 }), 0.25);
        const normal = normalize({
          x: middle.x - node.position.x,
          y: (middle.y - node.position.y) / tallness,
          z: middle.z - node.position.z,
        });
        const light = clamp(0.76 + dot(normal, lightDirection) * 0.4, 0.4, 1.25);
        const stripe =
          (species.pattern % 3 === 0 && (ring + node.id) % 3 === 1) ||
          (species.pattern % 3 === 1 && i % 4 === node.id % 4);
        const base = stripe && Math.sin((i / 8) * TAU) > -0.2 ? species.accent : species.color;
        faces.push({
          points: vertices.map(project),
          depth: dot(middle, view),
          color: tint(base, light),
        });
      }
    jobs.push({
      depth: dot(node.position, view),
      run: () => {
        polygon(
          ctx,
          hull(points),
          outline,
          highlight ? tint(species.accent, 1.38) : outline,
          highlight ? 2 * qscale : 1.35 * qscale,
        );
        for (const face of faces.sort((a, b) => a.depth - b.depth))
          polygon(ctx, face.points, face.color);
        // Dorsal markings are generated from the node ID and genome; they follow its motion.
        if (species.pattern % 3 === 2)
          for (let k = 0; k < 3; k++) {
            const spot = project(
              add(
                node.position,
                add(mul(forward, (hash(species.seed, node.id * 7 + k) - 0.5) * length), {
                  x: 0,
                  y: radius * tallness * 0.87,
                  z: 0,
                }),
              ),
            );
            gem(ctx, spot.x, spot.y, Math.max(1, radius * scale * 0.13), tint(species.accent, 1.1));
          }
        if (node.id === head.id) {
          const eyes = Math.floor(clamp(species.eyes, 0, 8));
          for (let eye = 0; eye < eyes; eye++) {
            const spread = eyes > 1 ? (eye / (eyes - 1) - 0.5) * 1.4 : 0;
            const pos = project(
              add(
                node.position,
                add(
                  mul(forward, length * 0.69),
                  add(mul(lateral, spread * radius), {
                    x: 0,
                    y: radius * tallness * 0.45 + Math.abs(spread) * 0.08,
                    z: 0,
                  }),
                ),
              ),
            );
            const r = Math.max(1.5 * qscale, radius * scale * 0.18);
            polygon(
              ctx,
              [
                { x: pos.x - r, y: pos.y - r },
                { x: pos.x + r, y: pos.y - r * 0.7 },
                { x: pos.x + r, y: pos.y + r },
                { x: pos.x - r, y: pos.y + r * 0.7 },
              ],
              '#102028',
            );
            ctx.fillStyle = tint(species.accent, 1.48);
            ctx.fillRect(
              Math.round(pos.x - r * 0.45),
              Math.round(pos.y - r * 0.4),
              Math.max(1, Math.round(r)),
              Math.max(1, Math.round(r)),
            );
            ctx.fillStyle = '#f1ffe9';
            ctx.fillRect(
              Math.round(pos.x - r * 0.25),
              Math.round(pos.y - r * 0.5),
              Math.max(1, Math.round(qscale)),
              Math.max(1, Math.round(qscale)),
            );
          }
        }
        // Small attachment collars visually explain how child volumes join the body graph.
        if (
          descriptor?.parent !== null &&
          descriptor?.parent !== undefined &&
          hash(species.seed, node.id + 900) > 0.55
        ) {
          const p = project(add(node.position, { x: 0, y: radius * tallness * 0.93, z: 0 }));
          gem(ctx, p.x, p.y, Math.max(1, radius * scale * 0.12), tint(species.color, 1.5));
        }
      },
    });
  }
  jobs.sort((a, b) => a.depth - b.depth).forEach((job) => job.run());
  ctx.restore();
}

const CORE_COLORS: Record<WeaponGenome['core'], string> = {
  heat: '#ff9054',
  cold: '#91e5ed',
  charge: '#cfb2ff',
  growth: '#b4df7a',
};

/** Assembles a frame, material, dimensional shape and active core into a unique icon. */
export function drawWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponGenome,
  x: number,
  y: number,
  size: number,
): void {
  if (!Number.isFinite(size) || size <= 0) return;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.imageSmoothingEnabled = false;
  const unit = size / 100;
  const p = (x: number, y: number) => ({ x: x * unit, y: y * unit });
  const poly = (points: number[][], fill: string, outline = true) =>
    polygon(
      ctx,
      points.map(([x, y]) => p(x, y)),
      fill,
      outline ? '#172b32' : undefined,
      Math.max(1, unit),
    );
  const metal = weapon.material.color,
    dark = tint(metal, 0.4),
    bright = tint(metal, 1.5),
    core = CORE_COLORS[weapon.core];
  const length = clamp(weapon.shape.length, 0.4, 3.2),
    width = clamp(weapon.shape.width, 0.08, 1.8),
    curve = clamp(weapon.shape.curvature, -2, 2);
  const branches = Math.floor(clamp(weapon.shape.branches, 0, 8));
  const tip = -27 - length * 4.4,
    bladeWidth = 3.5 + width * 5.5;
  ctx.rotate(weapon.frame === 'bow' ? -0.32 : 0.58);

  // Every frame shares component scale but has a different mechanical silhouette.
  if (weapon.frame === 'edge') {
    poly(
      [
        [-3, 33],
        [3, 33],
        [3, 6],
        [-3, 6],
      ],
      dark,
    );
    for (let k = 0; k < 4; k++)
      poly(
        [
          [-3, 12 + k * 5],
          [3, 10 + k * 5],
          [3, 12 + k * 5],
          [-3, 14 + k * 5],
        ],
        tint(metal, 0.83),
        false,
      );
    poly(
      [
        [-bladeWidth, 5],
        [-bladeWidth * 0.67, tip + 10],
        [curve * 3, tip - 5],
        [bladeWidth, tip + 11],
        [bladeWidth, 5],
        [0, 9],
      ],
      metal,
    );
    poly(
      [
        [0, 5],
        [curve * 3, tip - 5],
        [bladeWidth, tip + 11],
        [bladeWidth, 5],
      ],
      bright,
      false,
    );
    poly(
      [
        [-15, 6],
        [-12, 1],
        [12, 1],
        [15, 6],
        [6, 8],
        [-6, 8],
      ],
      dark,
    );
    for (let k = 0; k < Math.min(branches, 4); k++) {
      const yy = -6 - k * 7;
      poly(
        [
          [-bladeWidth, yy + 4],
          [-bladeWidth - 3 - width * 2, yy - 2],
          [-bladeWidth, yy - 1],
        ],
        tint(metal, 0.65),
      );
    }
    gem(ctx, 0, 4 * unit, 4.5 * unit, core);
    gem(ctx, 0, 34 * unit, 4 * unit, metal);
  } else if (weapon.frame === 'hammer') {
    poly(
      [
        [-3, 34],
        [3, 34],
        [3, -15],
        [-3, -15],
      ],
      dark,
    );
    poly(
      [
        [-1, 31],
        [1, 31],
        [1, -15],
        [-1, -15],
      ],
      bright,
      false,
    );
    const w = 14 + width * 7,
      h = 7 + length * 2;
    poly(
      [
        [-w, -22 - h],
        [w - 5, -22 - h],
        [w, -17 - h],
        [w, -12 + h],
        [-w + 4, -12 + h],
        [-w, -16 + h],
      ],
      metal,
    );
    poly(
      [
        [-w, -22 - h],
        [w - 5, -22 - h],
        [w, -17 - h],
        [-w + 5, -17 - h],
      ],
      bright,
      false,
    );
    poly(
      [
        [-w, -22 - h],
        [-w + 5, -17 - h],
        [-w + 5, -12 + h],
        [-w, -16 + h],
      ],
      dark,
      false,
    );
    poly(
      [
        [-5, -22 - h],
        [5, -22 - h],
        [5, -12 + h],
        [-5, -12 + h],
      ],
      tint(core, 0.63),
    );
    gem(ctx, 0, -19 * unit, 5.5 * unit, core);
    for (let k = 0; k < Math.min(branches, 4); k++)
      poly(
        [
          [w - 1, -23 + k * 5],
          [w + 5, -24 + k * 5],
          [w + 5, -21 + k * 5],
          [w - 1, -20 + k * 5],
        ],
        bright,
      );
  } else if (weapon.frame === 'bow') {
    const bend = 17 + Math.abs(curve) * 6 + width * 2;
    poly(
      [
        [0, tip],
        [-bend, -18],
        [-bend - 5, 0],
        [-bend, 18],
        [0, -tip],
        [-bend + 7, 16],
        [-bend + 5, 0],
        [-bend + 7, -16],
      ],
      metal,
    );
    poly(
      [
        [0, tip],
        [-bend + 7, -16],
        [-bend + 5, 0],
        [-bend - 1, 0],
        [-bend + 1, -17],
      ],
      bright,
      false,
    );
    segment(ctx, p(0, tip), p(4, 0), 0.6 * unit, 0.6 * unit, core, tint(core, 0.55));
    segment(ctx, p(4, 0), p(0, -tip), 0.6 * unit, 0.6 * unit, core, tint(core, 0.55));
    segment(ctx, p(-24, 0), p(28, 0), 1.1 * unit, 1.1 * unit, dark, '#172b32');
    poly(
      [
        [27, -4],
        [35, 0],
        [27, 4],
        [29, 0],
      ],
      core,
    );
    gem(ctx, (-bend + 3) * unit, 0, 4.5 * unit, core);
    for (let k = 0; k < Math.min(branches, 3); k++) {
      const yy = 9 + k * 7;
      poly(
        [
          [-bend + 2, yy],
          [-bend - 6, yy + 2],
          [-bend + 5, yy + 5],
        ],
        tint(metal, 0.7),
      );
    }
  } else if (weapon.frame === 'conduit') {
    poly(
      [
        [-3, 36],
        [3, 36],
        [3, -17],
        [-3, -17],
      ],
      dark,
    );
    poly(
      [
        [-1, 32],
        [1, 32],
        [1, -15],
        [-1, -15],
      ],
      tint(core, 0.75),
      false,
    );
    const spread = 11 + width * 5;
    poly(
      [
        [-4, -12],
        [-spread, -23],
        [-spread - 2, tip],
        [-spread + 3, tip + 2],
        [-spread + 6, -25],
        [0, -18],
        [spread - 6, -25],
        [spread - 3, tip + 2],
        [spread + 2, tip],
        [spread, -23],
        [4, -12],
      ],
      metal,
    );
    gem(ctx, 0, (tip + 10) * unit, (7 + length) * unit, core);
    for (let k = 0; k < Math.min(branches, 5); k++) {
      const yy = 0 + k * 5;
      poly(
        [
          [-5, yy],
          [5, yy],
          [5, yy + 2],
          [-5, yy + 2],
        ],
        k % 2 ? bright : metal,
      );
    }
  } else {
    const sides = 4 + (branches % 4),
      radius = 22 + width * 4;
    const outlinePoints = Array.from({ length: sides * 2 }, (_, i) => {
      const angle = (i / (sides * 2)) * TAU;
      const r = i % 2 ? radius * 0.69 : radius;
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    });
    poly(outlinePoints, metal);
    poly(
      outlinePoints.map(([x, y]) => [x * 0.7, y * 0.7]),
      dark,
    );
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU;
      gem(
        ctx,
        Math.cos(a) * radius * 0.79 * unit,
        Math.sin(a) * radius * 0.79 * unit,
        2.3 * unit,
        bright,
      );
    }
    gem(ctx, 0, 0, (10 + length * 1.1) * unit, core);
    poly(
      [
        [-5, radius - 2],
        [5, radius - 2],
        [5, radius + 9],
        [0, radius + 13],
        [-5, radius + 9],
      ],
      dark,
    );
  }

  // The active core is physically visible on each frame; emissive motes echo its property.
  const moteCount = Math.min(4, 1 + branches);
  for (let k = 0; k < moteCount; k++) {
    const xx = (hash(weapon.seed, k + 3) - 0.5) * 38,
      yy = tip + hash(weapon.seed, k + 9) * 17;
    const r = (1 + hash(weapon.seed, k + 19) * 1.3) * unit;
    gem(ctx, xx * unit, yy * unit, r, core);
  }
  ctx.restore();
}
