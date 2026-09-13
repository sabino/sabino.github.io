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
  playbackRate = new Param();
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
  createBuffer(channels: number, length: number, rate = this.sampleRate) {
    const data = new Float32Array(length);
    return {
      getChannelData: () => data,
      length,
      sampleRate: rate,
      numberOfChannels: channels,
      duration: length / rate,
    };
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

/** Exercise one generation quantum at a time without depending on host timer scheduling. */
function drainGenerated(director: AudioDirector): void {
  const graph = director as unknown as {
    generationTimer: ReturnType<typeof setTimeout> | null;
    generateNextBuffer(): void;
  };
  let remaining = 512;
  while (director.getDiagnostics().score.queuedBuffers > 0 && remaining-- > 0) {
    if (graph.generationTimer) clearTimeout(graph.generationTimer);
    graph.generationTimer = null;
    graph.generateNextBuffer();
  }
  assert.ok(remaining > 0, 'bounded synthesis jobs must finish in a bounded number of quanta');
}

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

test('location changes wait for a phrase boundary, crossfade reusable buses and never replay missed notes', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(13);
    director.setEnvironment({ ...location, interior: true, buildingKind: 'inn' }, worldTimeAt(660));
    const graph = director as unknown as {
      musicSlots: FakeNode[];
      activeMusicSlot: number;
      schedule(): void;
    };
    graph.schedule();
    const first = graph.activeMusicSlot;
    assert.equal(director.getDiagnostics().score.zone, 'tavern');
    director.setEnvironment(
      { ...location, interior: true, buildingKind: 'church' },
      worldTimeAt(660),
    );
    graph.schedule();
    assert.equal(first, graph.activeMusicSlot, 'crossing a doorway must not restart the phrase');
    assert.equal(director.getDiagnostics().score.zone, 'tavern');
    getContext().advance((32 * 60) / director.getDiagnostics().score.bpm + 0.1);
    graph.schedule();
    assert.notEqual(first, graph.activeMusicSlot);
    assert.equal(director.getDiagnostics().score.zone, 'temple');
    assert.equal(graph.musicSlots.length, 2);
    assert.equal(graph.musicSlots[first].gain.value, 0);
    assert.equal(graph.musicSlots[graph.activeMusicSlot].gain.value, 1);
    getContext().advance(3600);
    const notes = director.getDiagnostics().score.notesScheduled;
    graph.schedule();
    assert.ok(director.getDiagnostics().score.notesScheduled - notes <= 16);
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

test('real Foley contacts honor delay, vary takes with changing seeds, and cancel on pause', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(5);
    const context = getContext(),
      atlas = context.createBuffer(1, 24000 * 40, 24000);
    const graph = director as unknown as {
      soundBank: { get: (id: string) => unknown };
      pendingFoley: Map<string, unknown>;
    };
    graph.soundBank.get = () => atlas;
    const observed = [];
    for (let i = 0; i < 8; i++) {
      director.playFoley({ kind: 'footstep', material: 'stone', variantSeed: i, delay: 0.17 });
      const source = context.nodes.filter((node) => node.buffer === atlas).at(-1)!;
      assert.equal(source.started, context.currentTime + 0.17);
      observed.push(director.getDiagnostics().lastFoley);
      context.advance(0.25);
    }
    for (let i = 1; i < observed.length; i++) assert.notEqual(observed[i], observed[i - 1]);
    director.playFoley({ kind: 'tool-impact', material: 'wood', delay: 0.17 });
    const contact = context.nodes.filter((node) => node.buffer === atlas).at(-1)!;
    director.pause(true);
    assert.ok(contact.stopped! <= context.currentTime + 0.15);
    assert.equal(graph.pendingFoley.size, 0);
    const count = director.getDiagnostics().foleyPlayed;
    director.playFoley({ kind: 'tool-impact', material: 'stone' });
    assert.equal(director.getDiagnostics().foleyPlayed, count);
  });
});

test('field recordings use at most five reusable loops and fade with actual environment', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(5);
    const context = getContext(),
      recorded = context.createBuffer(1, 24000 * 10, 24000);
    const graph = director as unknown as {
      soundBank: { get: (id: string) => unknown };
      sampledLoops: Map<string, { gain: FakeNode }>;
    };
    graph.soundBank.get = () => recorded;
    director.setEnvironment(location, worldTimeAt(0));
    assert.ok(director.getDiagnostics().permanentSources <= 5);
    assert.ok(graph.sampledLoops.get('birds')!.gain.gain.value > 0);
    director.setEnvironment(
      { ...location, interior: true, buildingKind: 'church' },
      worldTimeAt(0),
    );
    assert.equal(graph.sampledLoops.get('birds')!.gain.gain.value, 0);
    const count = director.getDiagnostics().permanentSources;
    for (let i = 0; i < 20; i++) director.setEnvironment(location, worldTimeAt(i));
    assert.equal(director.getDiagnostics().permanentSources, count);
  });
});

test('bow release remains an effect with music disabled and stalled ambience registers one continuation per bank', async () => {
  await withAudio(async (director) => {
    await director.start(5);
    director.setSettings({ music: 0 });
    director.playFoley({ kind: 'swing', material: 'wood', action: 'release' });
    assert.equal(director.getDiagnostics().foleyPlayed, 1);
    assert.equal(director.getDiagnostics().lastFoley, 'bow-release:physical-string');
    const graph = director as unknown as {
      soundBank: { load: (id: string) => Promise<unknown> };
      sampleLoads: Set<string>;
    };
    let calls = 0;
    graph.soundBank.load = () => {
      calls++;
      return new Promise(() => {});
    };
    for (let i = 0; i < 100; i++) director.setEnvironment(location, worldTimeAt(i));
    assert.ok(calls <= 4);
    assert.ok(graph.sampleLoads.size <= 5);
  });
});

test('composed score keeps bounded tables and voices through changing biomes without per-note PCM allocation', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(13);
    const graph = director as unknown as {
      schedule(): void;
      instrumentBuffers: Map<string, unknown>;
    };
    const context = getContext();
    for (let i = 0; i < 1200; i++) {
      director.setEnvironment(
        { ...location, interior: i % 3 === 0, buildingKind: i % 2 ? 'inn' : 'church' },
        worldTimeAt(i),
      );
      context.advance(0.1);
      graph.schedule();
      assert.ok(director.getDiagnostics().score.voices <= 20);
      assert.ok(director.getDiagnostics().transientVoices <= 48);
    }
    assert.equal(director.getDiagnostics().score.tables, 7);
    assert.equal(graph.instrumentBuffers.size, 0, 'score never generates the old plucked strings');
    assert.ok(director.getDiagnostics().score.notesScheduled > 100);
  });
});

test('species calls are rendered once in deferred tasks and pause cancels queued calls', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(27);
    director.playWorldEvent({
      kind: 'predator',
      species: 'wolf',
      state: 'lunge',
      distance: 2,
      id: 'wolf-one',
    });
    assert.equal(director.getDiagnostics().score.queuedBuffers, 1);
    drainGenerated(director);
    assert.equal(director.getDiagnostics().score.generatedBuffers, 1);
    assert.ok(director.getDiagnostics().ambienceVoices > 0);
    getContext().advance(3);
    director.playWorldEvent({
      kind: 'grazer',
      species: 'grazer',
      state: 'flee',
      distance: 2,
      id: 'grazer-two',
    });
    director.pause(true);
    getContext().advance(1);
    drainGenerated(director);
    assert.equal(
      director.getDiagnostics().ambienceVoices,
      0,
      'a cancelled call must not arrive after pause',
    );
    assert.equal(director.getDiagnostics().score.queuedBuffers, 0);
    assert.equal(director.getDiagnostics().score.generatedBuffers, 1);
  });
});

test('one shared crowd gate bounds ten residents plus ambient cues to one clip per 24 seconds', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(19);
    const context = getContext(),
      atlas = context.createBuffer(1, 24000 * 40, 24000);
    const graph = director as unknown as {
      soundBank: { get: (id: string) => unknown };
      environmentSound(kind: string, at: number, strength: number, pan: number): void;
    };
    graph.soundBank.get = () => atlas;
    director.setEnvironment(
      {
        ...location,
        interior: true,
        buildingKind: 'inn',
        audioContext: { population: 10, crowdDistance: 1, crowdPan: 0.1 },
      },
      worldTimeAt(11 * 60),
    );
    const count = () => context.nodes.filter((node) => node.buffer === atlas && !node.loop).length;
    for (let slice = 0; slice < 12; slice++) {
      for (let resident = 0; resident < 10; resident++)
        director.playWorldEvent({ kind: 'social', id: `resident-${resident}`, distance: 2 });
      graph.environmentSound('social', context.currentTime + 0.04, 0.8, 0.1);
      context.advance(0.5);
    }
    assert.equal(count(), 1);
    context.advance(17.9);
    graph.environmentSound('social', context.currentTime, 0.8, 0.1);
    assert.equal(count(), 1);
    context.advance(0.1);
    graph.environmentSound('social', context.currentTime, 0.8, 0.1);
    assert.equal(count(), 2);
  });
});

test('reduced sensory makes animal and social activity quieter and less frequent', async () => {
  await withAudio(async (director, getContext) => {
    await director.start(19);
    director.setSettings({ reducedSensory: true });
    const context = getContext(),
      atlas = context.createBuffer(1, 24000 * 40, 24000);
    const graph = director as unknown as {
      soundBank: { get: (id: string) => unknown };
      environmentSound(kind: string, at: number, strength: number, pan: number): void;
    };
    graph.soundBank.get = () => atlas;
    director.setEnvironment(
      {
        ...location,
        interior: true,
        buildingKind: 'inn',
        audioContext: { population: 10, crowdDistance: 1 },
      },
      worldTimeAt(11 * 60),
    );
    const count = () => context.nodes.filter((node) => node.buffer === atlas && !node.loop).length;
    graph.environmentSound('social', 0, 1, 0);
    graph.environmentSound('social', 24, 1, 0);
    assert.equal(count(), 1);
    graph.environmentSound('social', 48, 1, 0);
    assert.equal(count(), 2);
    director.playWorldEvent({
      kind: 'grazer',
      id: 'nearby',
      species: 'grazer',
      state: 'curious',
      distance: 1,
    });
    drainGenerated(director);
    const once = director.getDiagnostics().score.generatedBuffers;
    context.advance(3);
    director.playWorldEvent({
      kind: 'grazer',
      id: 'nearby',
      species: 'grazer',
      state: 'flee',
      distance: 1,
    });
    assert.equal(
      director.getDiagnostics().score.queuedBuffers,
      0,
      'same animal call waits at least five seconds',
    );
    assert.equal(director.getDiagnostics().score.generatedBuffers, once);
    context.advance(2);
    director.playWorldEvent({
      kind: 'grazer',
      id: 'nearby',
      species: 'grazer',
      state: 'flee',
      distance: 1,
    });
    assert.equal(director.getDiagnostics().score.queuedBuffers, 1);
  });
});
