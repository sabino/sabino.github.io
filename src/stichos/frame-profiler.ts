/** Opt-in frame instrumentation. Fixed storage; copying/percentiles happen only on inspection. */
export const FRAME_PHASES = [
  'simulation',
  'render',
  'audio',
  'ui',
  'network',
  'save',
  'generation',
  'navigation',
  'entities',
] as const;
export type FramePhase = (typeof FRAME_PHASES)[number];
export interface FrameSample {
  at: number;
  rafMs: number;
  workMs: number;
  phases: Record<FramePhase, number>;
}
export class FrameProfiler {
  readonly capacity: number;
  private values: Float64Array;
  private cursor = 0;
  private count = 0;
  private total = 0;
  private open = false;
  private enabled = false;
  private readonly stride = FRAME_PHASES.length + 3;
  constructor(capacity = 4096) {
    this.capacity = Math.max(16, Math.min(16384, Math.floor(capacity) || 4096));
    this.values = new Float64Array(this.capacity * this.stride);
  }
  get active() {
    return this.enabled;
  }
  start() {
    this.enabled = true;
    this.cursor = this.count = this.total = 0;
    this.open = false;
    this.values.fill(0);
  }
  stop() {
    this.enabled = false;
    this.open = false;
  }
  begin(at: number, rafMs: number) {
    if (!this.enabled || !Number.isFinite(at)) return;
    const offset = this.cursor * this.stride;
    this.values.fill(0, offset, offset + this.stride);
    this.values[offset] = at;
    this.values[offset + 1] = Number.isFinite(rafMs) ? Math.max(0, rafMs) : 0;
    this.open = true;
  }
  record(phase: FramePhase, elapsedMs: number) {
    if (!this.enabled || !this.open || !Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    const index = FRAME_PHASES.indexOf(phase);
    if (index >= 0) this.values[this.cursor * this.stride + index + 3] += elapsedMs;
  }
  end(at: number) {
    if (!this.enabled || !this.open) return;
    const offset = this.cursor * this.stride;
    this.values[offset + 2] = Number.isFinite(at) ? Math.max(0, at - this.values[offset]) : 0;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.total++;
    this.open = false;
  }
  snapshot(): { enabled: boolean; capacity: number; total: number; samples: FrameSample[] } {
    const samples: FrameSample[] = [];
    for (let i = 0; i < this.count; i++) {
      const offset = ((this.cursor - this.count + i + this.capacity) % this.capacity) * this.stride;
      samples.push({
        at: this.values[offset],
        rafMs: this.values[offset + 1],
        workMs: this.values[offset + 2],
        phases: Object.fromEntries(
          FRAME_PHASES.map((p, j) => [p, this.values[offset + 3 + j]]),
        ) as Record<FramePhase, number>,
      });
    }
    return { enabled: this.enabled, capacity: this.capacity, total: this.total, samples };
  }
  get diagnostics() {
    return {
      enabled: this.enabled,
      retained: this.count,
      total: this.total,
      bytes: this.values.byteLength,
    };
  }
}
