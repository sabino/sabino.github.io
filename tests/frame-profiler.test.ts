import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameProfiler } from '../src/stichos/frame-profiler.ts';

test('profiling is opt-in and does not retain disabled work', () => {
  const p = new FrameProfiler();
  p.begin(10, 16.7);
  p.record('render', 3);
  p.end(14);
  assert.equal(p.snapshot().samples.length, 0);
  p.start();
  p.begin(20, 16.7);
  p.record('render', 3);
  p.record('render', 1);
  p.end(25);
  assert.deepEqual(
    p.snapshot().samples.map((s) => [s.at, s.rafMs, s.workMs, s.phases.render]),
    [[20, 16.7, 5, 4]],
  );
  p.stop();
  p.begin(40, 20);
  p.end(50);
  assert.equal(p.snapshot().total, 1);
});
test('raw long frames remain in chronological bounded storage without filtering', () => {
  const p = new FrameProfiler(16);
  p.start();
  for (let i = 0; i < 20; i++) {
    p.begin(i * 1000, i === 19 ? 1600 : 16.7);
    p.end(i * 1000 + 3);
  }
  const s = p.snapshot();
  assert.equal(s.samples.length, 16);
  assert.equal(s.total, 20);
  assert.equal(s.samples[0].at, 4000);
  assert.equal(s.samples.at(-1)?.rafMs, 1600);
  assert.equal(p.diagnostics.bytes, 16 * 12 * 8);
});
test('invalid samples cannot poison traces and a new capture clears prior samples', () => {
  const p = new FrameProfiler();
  p.start();
  p.begin(2, NaN);
  p.record('audio', Infinity);
  p.record('save', -10);
  p.end(1);
  assert.equal(p.snapshot().samples[0].workMs, 0);
  assert.equal(p.snapshot().samples[0].phases.audio, 0);
  p.start();
  assert.equal(p.snapshot().total, 0);
});
