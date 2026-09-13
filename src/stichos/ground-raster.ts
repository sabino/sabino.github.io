import { StichosArt } from './art.ts';
import { regionalGroundColor } from './biome-art.ts';
import type { Tile } from './types.ts';

interface GroundJob {
  id: number;
  key: string;
  cx: number;
  cy: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tiles: Tile[];
  base: number;
  decoration: number;
  waiting: boolean;
}

/** Bounded raster pipeline. Worker failures use the same art in small main-thread slices. */
export class GroundRaster {
  private cache = new Map<string, HTMLCanvasElement>();
  private jobs: GroundJob[] = [];
  private worker: Worker | null = null;
  private active: GroundJob | null = null;
  private sequence = 0;
  private admitted = false;
  private art = new StichosArt();
  private workerAllowed = true;
  private completed = 0;
  private workerMs: number[] = [];
  private mainMs: number[] = [];
  get diagnostics() {
    return {
      worker: !!this.worker,
      queued: this.jobs.length,
      cached: this.cache.size,
      completed: this.completed,
      workerMs: [...this.workerMs],
      mainMs: [...this.mainMs],
    };
  }
  reset() {
    this.worker?.terminate();
    this.worker = null;
    this.active = null;
    this.jobs = [];
    this.cache.clear();
    this.art = new StichosArt();
    this.admitted = false;
  }
  beginFrame() {
    this.admitted = false;
  }
  request(cx: number, cy: number, tileAt: (x: number, y: number) => Tile) {
    const key = `${cx},${cy}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const pending = this.jobs.find((job) => job.key === key);
    if (pending) return pending.canvas;
    // Admission itself generates a tile snapshot. Never generate several cold chunks in one frame.
    if (this.admitted || this.jobs.length >= 12) return null;
    this.admitted = true;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const tiles: Tile[] = [];
    for (let dy = -1; dy <= 16; dy++)
      for (let dx = -1; dx <= 16; dx++) {
        const tile = tileAt(cx * 16 + dx, cy * 16 + dy);
        tiles.push(tile);
        ctx.fillStyle = regionalGroundColor(tile);
        ctx.fillRect(dx * 32, dy * 32, 32, 32);
      }
    this.jobs.push({
      id: ++this.sequence,
      key,
      cx,
      cy,
      canvas,
      ctx,
      tiles,
      base: 0,
      decoration: 0,
      waiting: false,
    });
    return canvas;
  }
  private failWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.workerAllowed = false;
    if (this.active) this.active.waiting = false;
    this.active = null;
  }
  private dispatch() {
    if (
      !this.workerAllowed ||
      this.active ||
      typeof Worker === 'undefined' ||
      typeof OffscreenCanvas === 'undefined'
    )
      return;
    const job = this.jobs.find(
      (entry) => entry.base === 0 && entry.tiles.every((tile) => !!tile.ecology),
    );
    if (!job) return;
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('./ground-worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onerror = () => this.failWorker();
        this.worker.onmessageerror = () => this.failWorker();
        this.worker.onmessage = ({ data }) => {
          const current = this.active;
          if (!current || current.id !== data.id) {
            data.bitmap?.close();
            return;
          }
          if (data.failed || !data.bitmap) {
            this.failWorker();
            return;
          }
          current.ctx.drawImage(data.bitmap, 0, 0);
          data.bitmap.close();
          current.base = current.tiles.length;
          current.waiting = false;
          this.workerMs.push(data.ms);
          if (this.workerMs.length > 128) this.workerMs.shift();
          this.active = null;
        };
      }
      this.active = job;
      job.waiting = true;
      this.worker.postMessage({ id: job.id, cx: job.cx, cy: job.cy, tiles: job.tiles });
    } catch {
      this.failWorker();
    }
  }
  work(
    decorate: (tile: Tile, ctx: CanvasRenderingContext2D, cx: number, cy: number) => void,
    budgetMs = 2.5,
  ) {
    const started = performance.now();
    this.dispatch();
    let steps = 0;
    for (const job of this.jobs) {
      if (job.waiting) continue;
      // Regional base jobs wait for the worker; legacy art uses the exact old sprite path.
      if (job.base < job.tiles.length && this.workerAllowed && this.worker && job.tiles[0].ecology)
        continue;
      while (
        job.base < job.tiles.length &&
        steps++ < 48 &&
        performance.now() - started < budgetMs
      ) {
        const tile = job.tiles[job.base++];
        job.ctx.drawImage(
          this.art.ground(tile).image,
          (tile.x - job.cx * 16) * 32,
          (tile.y - job.cy * 16) * 32,
        );
      }
      if (job.base < job.tiles.length) break;
      while (
        job.decoration < job.tiles.length &&
        steps++ < 48 &&
        performance.now() - started < budgetMs
      ) {
        decorate(job.tiles[job.decoration++], job.ctx, job.cx, job.cy);
      }
      if (job.decoration < job.tiles.length) break;
      this.cache.set(job.key, job.canvas);
      this.completed++;
      while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      if (performance.now() - started >= budgetMs) break;
    }
    this.jobs = this.jobs.filter((job) => job.decoration < job.tiles.length);
    const elapsed = performance.now() - started;
    if (steps) {
      this.mainMs.push(elapsed);
      if (this.mainMs.length > 256) this.mainMs.shift();
    }
  }
}
