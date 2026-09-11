import type { Point, Terrain } from './types.ts';

export interface AtlasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface AtlasView {
  x: number;
  y: number;
  scale: number;
}
export interface AtlasSite extends Point {
  id: string;
  name: string;
  kind: 'settlement' | 'vault';
  detail: string;
  radius: number;
  clan?: number;
}
export interface AtlasSource {
  identity: string;
  player: Point;
  target?: Point;
  waypoint?: Point;
  sites: readonly AtlasSite[];
  explored(x: number, y: number): boolean;
  cells(bounds: AtlasBounds): Iterable<{ x: number; y: number; size: number }>;
  terrain(x: number, y: number): Terrain;
  climate(
    x: number,
    y: number,
  ): { biome: string; elevation: number; moisture: number; coldness: number };
}
const LIMIT = 1_000_000_000;
export const ATLAS_MIN_SCALE = 2 ** -24;
export const ATLAS_MAX_SCALE = 8;
const bounded = (n: number) => Math.max(-LIMIT, Math.min(LIMIT, Number.isFinite(n) ? n : 0));
export function atlasPoint(view: AtlasView, screen: Point, width: number, height: number): Point {
  return {
    x: view.x + (screen.x - width / 2) / view.scale,
    y: view.y + (screen.y - height / 2) / view.scale,
  };
}
export function atlasScreen(view: AtlasView, world: Point, width: number, height: number): Point {
  return {
    x: width / 2 + (world.x - view.x) * view.scale,
    y: height / 2 + (world.y - view.y) * view.scale,
  };
}
/** Zoom about the pointer: the same world location remains underneath it. */
export function zoomAtlas(
  view: AtlasView,
  screen: Point,
  factor: number,
  width: number,
  height: number,
): AtlasView {
  const anchor = atlasPoint(view, screen, width, height);
  const scale = Math.max(
    ATLAS_MIN_SCALE,
    Math.min(ATLAS_MAX_SCALE, view.scale * (Number.isFinite(factor) && factor > 0 ? factor : 1)),
  );
  return {
    x: bounded(anchor.x - (screen.x - width / 2) / scale),
    y: bounded(anchor.y - (screen.y - height / 2) / scale),
    scale,
  };
}
export function fitAtlas(
  bounds: AtlasBounds | null,
  width: number,
  height: number,
  fallback: Point,
): AtlasView {
  if (!bounds) return { ...fallback, scale: 3 };
  return {
    x: bounded((bounds.minX + bounds.maxX) / 2),
    y: bounded((bounds.minY + bounds.maxY) / 2),
    scale: Math.max(
      ATLAS_MIN_SCALE,
      Math.min(
        ATLAS_MAX_SCALE,
        (width - 60) / Math.max(24, bounds.maxX - bounds.minX),
        (height - 60) / Math.max(24, bounds.maxY - bounds.minY),
      ),
    ),
  };
}
export const atlasDistance = (distance: number) =>
  distance >= 1_000_000
    ? `${Number((distance / 1_000_000).toPrecision(3))} million paces`
    : `${Math.max(1, Math.round(distance)).toLocaleString('en-US')} paces`;
const COLORS: Record<Terrain, string> = {
  road: '#c2ad7d',
  bridge: '#ba9767',
  floor: '#abb1a8',
  wall: '#667a81',
  sand: '#b5a16b',
  mud: '#596650',
  basalt: '#665666',
  snow: '#8099a1',
  grass: '#52776b',
  ice: '#639bab',
  water: '#264c61',
};
const BIOMES: Record<string, string> = {
  woodland: '#577956',
  meadow: '#8c9a5a',
  wetland: '#417c72',
  dunes: '#c6af72',
  badlands: '#ac7b60',
  volcanic: '#68576a',
  alpine: '#a5b8c0',
  frostwood: '#52776b',
  marsh: '#497c80',
  highlands: '#8d929b',
  tundra: '#90a8ad',
  settlement: '#a8a494',
};

/** Paints only remembered terrain. Coarse views aggregate known cells into pixels,
 * so long explored paths remain visible and unknown space never generates chunks. */
export class AtlasPainter {
  private identity = '';
  private samples = new Map<string, string>();
  draw(canvas: HTMLCanvasElement, source: AtlasSource, view: AtlasView, labels = true) {
    const ctx = canvas.getContext('2d')!,
      width = canvas.width,
      height = canvas.height;
    if (this.identity !== source.identity) {
      this.identity = source.identity;
      this.samples.clear();
    }
    ctx.fillStyle = '#0c1b25';
    ctx.fillRect(0, 0, width, height);
    const a = atlasPoint(view, { x: 0, y: 0 }, width, height),
      b = atlasPoint(view, { x: width, y: height }, width, height);
    const bounds = { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
    const spacing = 2 ** Math.ceil(Math.log2(72 / view.scale));
    ctx.strokeStyle = '#29404a66';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(a.x / spacing) * spacing; x <= b.x; x += spacing) {
      const p = atlasScreen(view, { x, y: 0 }, width, height);
      ctx.moveTo(Math.round(p.x) + 0.5, 0);
      ctx.lineTo(Math.round(p.x) + 0.5, height);
    }
    for (let y = Math.ceil(a.y / spacing) * spacing; y <= b.y; y += spacing) {
      const p = atlasScreen(view, { x: 0, y }, width, height);
      ctx.moveTo(0, Math.round(p.y) + 0.5);
      ctx.lineTo(width, Math.round(p.y) + 0.5);
    }
    ctx.stroke();
    const pixels = new Set<number>();
    for (const cell of source.cells(bounds)) {
      const cellPixels = cell.size * view.scale;
      if (cellPixels < 1) {
        const p = atlasScreen(
          view,
          { x: cell.x + cell.size / 2, y: cell.y + cell.size / 2 },
          width,
          height,
        );
        const x = Math.floor(p.x),
          y = Math.floor(p.y),
          key = y * width + x;
        if (x < 0 || y < 0 || x >= width || y >= height || pixels.has(key)) continue;
        pixels.add(key);
        ctx.fillStyle = '#8ea998';
        ctx.fillRect(x, y, 1, 1);
        continue;
      }
      const stride = view.scale >= 2 ? 1 : view.scale >= 0.5 ? 2 : cell.size;
      for (let dy = 0; dy < cell.size; dy += stride)
        for (let dx = 0; dx < cell.size; dx += stride) {
          const x = cell.x + dx,
            y = cell.y + dy;
          if (x + stride < a.x || y + stride < a.y || x > b.x || y > b.y) continue;
          const sampleX = x + (stride - 1) / 2,
            sampleY = y + (stride - 1) / 2;
          if (!source.explored(sampleX, sampleY)) continue;
          const key = `${stride}:${x}:${y}`;
          let color = this.samples.get(key);
          if (!color) {
            if (stride < cell.size) color = COLORS[source.terrain(sampleX, sampleY)];
            else {
              const c = source.climate(sampleX, sampleY);
              color =
                c.elevation < 0.34 && c.moisture > 0.48
                  ? COLORS.water
                  : (BIOMES[c.biome] ?? COLORS.snow);
            }
            this.samples.set(key, color);
            while (this.samples.size > 32768)
              this.samples.delete(this.samples.keys().next().value!);
          }
          const p = atlasScreen(view, { x, y }, width, height);
          ctx.fillStyle = color;
          ctx.fillRect(
            Math.floor(p.x),
            Math.floor(p.y),
            Math.ceil(stride * view.scale) + 1,
            Math.ceil(stride * view.scale) + 1,
          );
        }
    }
    const visible = (p: Point, pad = 8) =>
      p.x >= -pad && p.x <= width + pad && p.y >= -pad && p.y <= height + pad;
    const marker = (world: Point, color: string, diamond = false) => {
      const p = atlasScreen(view, world, width, height);
      if (!visible(p)) return;
      ctx.fillStyle = '#101e28';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (diamond) {
        ctx.moveTo(p.x, p.y - 5);
        ctx.lineTo(p.x + 5, p.y);
        ctx.lineTo(p.x, p.y + 5);
        ctx.lineTo(p.x - 5, p.y);
        ctx.closePath();
      } else ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
      return p;
    };
    const occupiedLabels: { x: number; y: number }[] = [];
    for (const site of source.sites) {
      const p = marker(site, site.kind === 'vault' ? '#9dc9b1' : '#d8bd89', site.kind === 'vault');
      if (
        !p ||
        !labels ||
        occupiedLabels.some((q) => Math.abs(q.x - p.x) < 112 && Math.abs(q.y - p.y) < 22)
      )
        continue;
      occupiedLabels.push(p);
      ctx.font = '12px Georgia';
      ctx.textAlign = 'left';
      const label = site.name,
        textWidth = ctx.measureText(label).width;
      const tx = Math.max(5, Math.min(width - textWidth - 7, p.x + 8)),
        ty = Math.max(17, p.y - 7);
      ctx.fillStyle = '#0c1b25df';
      ctx.fillRect(tx - 3, ty - 12, textWidth + 6, 16);
      ctx.fillStyle = '#ecdbb4';
      ctx.fillText(label, tx, ty);
    }
    if (source.target) marker(source.target, '#e4c477', true);
    if (source.waypoint) marker(source.waypoint, '#b0dcea', true);
    const player = atlasScreen(view, source.player, width, height);
    if (visible(player)) {
      ctx.fillStyle = '#ffdf96';
      ctx.strokeStyle = '#392e1f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y - 6);
      ctx.lineTo(player.x + 5, player.y + 4);
      ctx.lineTo(player.x - 5, player.y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (labels) {
      const unit = 2 ** Math.floor(Math.log2(100 / view.scale)),
        pixels = unit * view.scale;
      ctx.fillStyle = '#0c1b25df';
      ctx.fillRect(10, height - 45, Math.max(135, pixels + 20), 35);
      ctx.strokeStyle = '#bac6b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, height - 20);
      ctx.lineTo(20 + pixels, height - 20);
      ctx.moveTo(20, height - 23);
      ctx.lineTo(20, height - 17);
      ctx.moveTo(20 + pixels, height - 23);
      ctx.lineTo(20 + pixels, height - 17);
      ctx.stroke();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cad4c8';
      ctx.fillText(atlasDistance(unit), 20, height - 29);
    }
  }
}

export class AtlasController {
  view: AtlasView;
  readonly canvas: HTMLCanvasElement;
  private source: () => AtlasSource;
  private painter: AtlasPainter;
  private changed: (view: AtlasView, cursor?: Point) => void;
  private selected: (point: Point) => void;
  private drag: { id: number; x: number; y: number; origin: AtlasView; moved: boolean } | null =
    null;
  private controller = new AbortController();
  private frame = 0;
  constructor(
    canvas: HTMLCanvasElement,
    source: () => AtlasSource,
    painter: AtlasPainter,
    changed: (view: AtlasView, cursor?: Point) => void,
    selected: (point: Point) => void,
    view: AtlasView,
  ) {
    this.canvas = canvas;
    this.source = source;
    this.painter = painter;
    this.changed = changed;
    this.selected = selected;
    this.view = { ...view };
    const signal = this.controller.signal;
    const point = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * canvas.width) / r.width,
        y: ((e.clientY - r.top) * canvas.height) / r.height,
      };
    };
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        canvas.focus();
        canvas.setPointerCapture(e.pointerId);
        const p = point(e);
        this.drag = { id: e.pointerId, ...p, origin: { ...this.view }, moved: false };
      },
      { signal },
    );
    canvas.addEventListener(
      'pointermove',
      (e) => {
        const p = point(e);
        if (this.drag?.id === e.pointerId) {
          const dx = p.x - this.drag.x,
            dy = p.y - this.drag.y;
          if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
          this.view.x = bounded(this.drag.origin.x - dx / this.view.scale);
          this.view.y = bounded(this.drag.origin.y - dy / this.view.scale);
          this.requestDraw();
        }
        this.changed(this.view, atlasPoint(this.view, p, canvas.width, canvas.height));
      },
      { signal },
    );
    canvas.addEventListener(
      'pointerup',
      (e) => {
        if (this.drag?.id !== e.pointerId) return;
        if (!this.drag.moved)
          this.selected(atlasPoint(this.view, point(e), canvas.width, canvas.height));
        this.drag = null;
      },
      { signal },
    );
    canvas.addEventListener(
      'pointercancel',
      () => {
        this.drag = null;
      },
      { signal },
    );
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.view = zoomAtlas(
          this.view,
          point(e),
          e.deltaY < 0 ? 1.35 : 1 / 1.35,
          canvas.width,
          canvas.height,
        );
        this.requestDraw();
      },
      { signal, passive: false },
    );
    canvas.addEventListener(
      'keydown',
      (e) => {
        const directions: Record<string, Point> = {
          ArrowLeft: { x: -1, y: 0 },
          ArrowRight: { x: 1, y: 0 },
          ArrowUp: { x: 0, y: -1 },
          ArrowDown: { x: 0, y: 1 },
        };
        const direction = directions[e.key];
        if (direction) {
          e.preventDefault();
          e.stopPropagation();
          this.view.x = bounded(this.view.x + (direction.x * 70) / this.view.scale);
          this.view.y = bounded(this.view.y + (direction.y * 70) / this.view.scale);
          this.requestDraw();
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          this.zoom(1.5);
        } else if (e.key === '-') {
          e.preventDefault();
          this.zoom(1 / 1.5);
        }
      },
      { signal },
    );
    this.draw();
  }
  zoom(factor: number) {
    this.view = zoomAtlas(
      this.view,
      { x: this.canvas.width / 2, y: this.canvas.height / 2 },
      factor,
      this.canvas.width,
      this.canvas.height,
    );
    this.requestDraw();
  }
  center(point: Point) {
    this.view.x = bounded(point.x);
    this.view.y = bounded(point.y);
    this.requestDraw();
  }
  fit(bounds: AtlasBounds | null) {
    this.view = fitAtlas(bounds, this.canvas.width, this.canvas.height, this.source().player);
    this.requestDraw();
  }
  requestDraw() {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
  }
  draw() {
    this.painter.draw(this.canvas, this.source(), this.view);
    this.changed(this.view);
  }
  dispose() {
    this.controller.abort();
    cancelAnimationFrame(this.frame);
  }
}
