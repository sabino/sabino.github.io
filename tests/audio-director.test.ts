import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioDirector } from '../src/audio.ts';
import { AUDIO_LIMITS } from '../src/atmosphere.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';
import type { WorldLocationSignal } from '../src/stichos/world-signals.ts';

class Param {
  value = 0;
  targets: Array<{ value: number; time: number; constant: number }> = [];
  setValueAtTime(value: number, _time: number) {
    this.value = value;
  }
  linearRampToValueAtTime(value: number, _time: number) {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number, _time: number) {
    this.value = value;
  }
  setTargetAtTime(value: number, time: number, constant: number) {
    this.value = value;
    this.targets.push({ value, time, constant });
  }
}
class FakeNode {
  gain = new Param();
  frequency = new Param();
  detune = new Param();
  Q = new Param();
  pan = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  delayTime = new Param();
  buffer: unknown;
  loop = false;
  type = '';
  onended: (() => void) | null = null;
  disconnected = false;
  started: number | null = null;
  stopped: number | null = null;
  connect(node: FakeNode) {
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(time = 0) {
    assert.equal(this.started, null, 'source must only start once');
    this.started = time;
  }
  stop(time = 0) {
    this.stopped = time;
  }
}
class FakeContext {
  static instances: FakeContext[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 16000;
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  constructor() {
    FakeContext.instances.push(this);
  }
  node() {
    const node = new FakeNode();
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.node();
  }
  createDynamicsCompressor() {
    return this.node();
  }
  createDelay() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createOscillator() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createStereoPanner() {
    return this.node();
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.state = 'closed';
  }
  advance(seconds: number) {
    this.currentTime += seconds;
    for (const node of this.nodes) {
      if (node.stopped !== null && node.stopped <= this.currentTime && node.onended) {
        const handler = node.onended;
        node.onended = null;
        handler();
      }
    }
  }
}

const location: WorldLocationSignal = {
  biome: 'woodland',
  terrain: 'grass',
  interior: false,
  temperature: 12,
  settlement: false,
  featureDistances: { water: 2, trees: 2, fire: 4 },
  weather: 'clear',
};
const memoryStorage = () => {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_: string, next: string) => {
      value = next;
    },
  };
};

async function withAudio(
  run: (director: AudioDirector, context: () => FakeContext) => Promise<void>,
) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext });
  const director = new AudioDirector(memoryStorage());
  try {
    await run(director, () => FakeContext.instances.at(-1)!);
  } finally {
    director.dispose();
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
}

test('construction is silent and preferences/environment do not request autoplay', async () => {
  await withAudio(async (director) => {
    const count = FakeContext.instances.length;
    director.setEnvironment(location, worldTimeAt(0));
    director.setSettings({ music: 0.4 });
    director.setVoiceActivity(true);
    director.play('blade');
    director.playWorldEvent({ kind: 'bird', distance: 2 });
    assert.equal(FakeContext.instances.length, count);
    assert.equal(director.getDiagnostics().state, 'unstarted');
    await director.start(92);
    assert.equal(FakeContext.instances.length, count + 1);
    assert.equal(director.getDiagnostics().state, 'running');
    assert.equal(director.getDiagnostics().zone, 'wilderness');
    assert.ok(director.getDiagnostics().permanentSources <= AUDIO_LIMITS.permanentSources);
  });
});

test('voice ducking changes only game music/ambience gain and recovers gradually', async () => {
  await withAudio(async (director) => {
    await director.start(12);
    director.setSettings({ music: 1, ambience: 1, effects: 0.9 });
    const graph = director as unknown as { music: FakeNode; ambience: FakeNode; effects: FakeNode };
    director.setVoiceActivity(true);
    assert.equal(graph.music.gain.value, 0.28);
    assert.equal(graph.ambience.gain.value, 0.48);
    assert.equal(graph.effects.gain.value, 0.9);
    director.setVoiceActivity(false);
    assert.equal(graph.music.gain.value, 1);
    assert.equal(graph.music.gain.targets.at(-1)!.constant, AUDIO_LIMITS.voiceDuckRelease);
  });
});

test('spatial wildlife bounds, per-source cooldown and polyphony protect effects headroom', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(12);
    director.playWorldEvent({ kind: 'bird', distance: Infinity });
    director.playWorldEvent({ kind: 'predator', distance: AUDIO_LIMITS.worldSoundRadius });
    assert.equal(director.getDiagnostics().transientVoices, 0);
    director.playWorldEvent({ kind: 'bird', distance: 2, id: 'same' });
    const once = director.getDiagnostics().transientVoices;
    director.playWorldEvent({ kind: 'bird', distance: 2, id: 'same' });
    assert.equal(director.getDiagnostics().transientVoices, once);
    for (let index = 0; index < 1000; index++)
      director.playWorldEvent({ kind: 'bird', distance: 1, id: String(index) });
    assert.ok(director.getDiagnostics().ambienceVoices <= AUDIO_LIMITS.ambienceVoices);
    assert.ok(
      (director as unknown as { lastEvents: Map<string, number> }).lastEvents.size <=
        AUDIO_LIMITS.eventHistory,
    );
    director.play('mind-transfer');
    assert.ok(director.getDiagnostics().transientVoices > director.getDiagnostics().ambienceVoices);
    assert.ok(director.getDiagnostics().transientVoices <= AUDIO_LIMITS.transientVoices);
    getContext().advance(8);
    assert.equal(director.getDiagnostics().transientVoices, 0);
  });
});

test('zones crossfade through two reusable music buses and long frames never schedule missed notes', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(13);
    director.setEnvironment({ ...location, interior: true, buildingKind: 'inn' }, worldTimeAt(660));
    const graph = director as unknown as {
      musicSlots: FakeNode[];
      activeMusicSlot: number;
      schedule(): void;
      phraseStep: number;
    };
    const first = graph.activeMusicSlot;
    const sourceCount = director.getDiagnostics().permanentSources;
    director.setEnvironment(
      { ...location, interior: true, buildingKind: 'church' },
      worldTimeAt(660),
    );
    assert.notEqual(first, graph.activeMusicSlot);
    assert.equal(graph.musicSlots.length, 2);
    assert.equal(graph.musicSlots[first].gain.value, 0);
    assert.equal(graph.musicSlots[graph.activeMusicSlot].gain.value, 1);
    assert.equal(director.getDiagnostics().permanentSources, sourceCount);
    getContext().advance(3600);
    const step = graph.phraseStep;
    graph.schedule();
    assert.ok(graph.phraseStep - step <= AUDIO_LIMITS.maxCatchupNotes);
    assert.ok(director.getDiagnostics().transientVoices <= AUDIO_LIMITS.transientVoices);
  });
});

test('pause releases scheduler, cancels stale speech-like effects, resumes interrupted contexts, and disposal is final', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(9);
    director.play('radio');
    const context = getContext();
    director.pause(true);
    assert.equal(director.getDiagnostics().schedulerRunning, false);
    const before = director.getDiagnostics().transientVoices;
    director.play('blade');
    assert.equal(director.getDiagnostics().transientVoices, before);
    context.advance(1);
    assert.equal(director.getDiagnostics().transientVoices, 0);
    await new Promise((resolve) => setTimeout(resolve, 210));
    assert.equal(context.state, 'suspended');
    context.state = 'interrupted';
    director.pause(false);
    assert.equal(context.state, 'running');
    assert.equal(director.getDiagnostics().schedulerRunning, true);
    director.dispose();
    assert.equal(context.state, 'closed');
    assert.equal(director.getDiagnostics().schedulerRunning, false);
    assert.equal(director.getDiagnostics().permanentSources, 0);
    assert.equal(director.getDiagnostics().transientVoices, 0);
    await director.start(9);
    assert.equal(director.getDiagnostics().state, 'unstarted');
  });
});

test('visibility lifecycle pauses game context without owning or accessing any microphone', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const listeners = new Map<string, () => void>();
  const doc = {
    hidden: false,
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  try {
    await withAudio(async (director) => {
      await director.start(15);
      assert.equal(listeners.size, 1);
      doc.hidden = true;
      listeners.get('visibilitychange')!();
      assert.equal(director.getDiagnostics().paused, true);
      assert.equal(director.getDiagnostics().schedulerRunning, false);
      doc.hidden = false;
      listeners.get('visibilitychange')!();
      assert.equal(director.getDiagnostics().paused, false);
      director.dispose();
      assert.equal(listeners.size, 0);
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
