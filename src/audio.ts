import { FOLEY_LIMITS, foleyGroup, planFoley, semanticFoleyLayers } from './foley.ts';
import type { FoleyEvent } from './foley.ts';
import { FOLEY_CLIPS } from './foley-clips.ts';
import { SoundBank } from './sound-bank.ts';
import type { SampleBankId } from './sound-bank.ts';
import { composePhrase, scoreTable, SCORE_LIMITS } from './adaptive-score.ts';
import type { ScoreContext, ScoreInstrument, ScoreNote, ScorePhrase } from './adaptive-score.ts';
import {
  animalCallChunks,
  animalVoiceState,
  surfaceTexture,
  SEMANTIC_AUDIO_LIMITS,
} from './semantic-audio.ts';
import { instrumentSamples } from './physical-instruments.ts';
export type { FoleyEvent, FoleyMaterial } from './foley.ts';
import {
  AUDIO_LIMITS,
  ambientEvents,
  atmosphereRandom,
  selectSoundscape,
  voiceDuckLevels,
} from './atmosphere.ts';
import type { SoundscapeFrame, WorldSoundEvent } from './atmosphere.ts';
import { readAudioSettings, writeAudioSettings, normalizeAudioSettings } from './audio-settings.ts';
import type { AudioSettings, AudioSettingsStorage } from './audio-settings.ts';
import type { WorldLocationSignal } from './stichos/world-signals.ts';
import type { WorldTimeSignal } from './stichos/world-time.ts';
export type { AudioSettings } from './audio-settings.ts';
export interface AudioDiagnostics {
  state: string;
  started: boolean;
  paused: boolean;
  voiceDucked: boolean;
  zone: string;
  culture: string;
  phase: string;
  transientVoices: number;
  ambienceVoices: number;
  permanentSources: number;
  schedulerRunning: boolean;
  settings: AudioSettings;
  samples: {
    ready: number;
    loading: number;
    failed: number;
    decodedBytes: number;
    activeLoads: number;
  };
  foleyPlayed: number;
  foleyPending: number;
  lastFoley: string;
  score: {
    identity: string;
    zone: string;
    phrase: number;
    bpm: number;
    voices: number;
    notesScheduled: number;
    notesSkipped: number;
    schedulerMaxMs: number;
    schedulerCalls: number;
    tables: number;
    generatedBuffers: number;
    queuedBuffers: number;
    generationMaxMs: number;
  };
}

/**
 * Recorded material Foley, field ambience and physically modeled instruments.
 *
 * Construction is silent. Call start() from a user gesture before using the
 * director; browsers that cannot create or resume audio remain playable.
 */
export class AudioDirector {
  private context: AudioContext | null = null;
  private soundBank: SoundBank | null = null;
  private sampledLoops = new Map<SampleBankId, { source: AudioBufferSourceNode; gain: GainNode }>();
  private sampleLoads = new Set<SampleBankId>();
  private pendingFoley = new Map<string, { event: FoleyEvent; at: number; sequence: number }>();
  private foleySequence = new Map<string, number>();
  private previousFoleyTake = new Map<string, number>();
  private foleyPlayed = 0;
  private lastFoley = '';
  private instrumentBuffers = new Map<string, AudioBuffer>();
  private scoreTables = new Map<ScoreInstrument, AudioBuffer>();
  private scorePhrase: ScorePhrase | null = null;
  private scoreStart = 0;
  private scoreCursor = 0;
  private scoreIndex = 0;
  private scoreVoices = new Set<AudioScheduledSourceNode>();
  private notesScheduled = 0;
  private notesSkipped = 0;
  private schedulerMaxMs = 0;
  private schedulerCalls = 0;
  private schedulerTrace = new Float32Array(1024);
  private schedulerTraceCount = 0;
  private generationTrace = new Float32Array(256);
  private generationTraceCount = 0;
  private generationMaxMs = 0;
  private generatedBuffers = new Map<string, AudioBuffer>();
  private generationQueue = new Map<
    string,
    {
      generate: () => Float32Array | Generator<void, Float32Array>;
      iterator?: Generator<void, Float32Array>;
    }
  >();
  private generationReady = new Map<string, (buffer: AudioBuffer) => void>();
  private generationTimer: ReturnType<typeof setTimeout> | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private musicSlots: GainNode[] = [];
  private activeMusicSlot = 0;
  private ambientVoices = new Set<AudioScheduledSourceNode>();
  private soundscape: SoundscapeFrame | null = null;
  private environment: { location: WorldLocationSignal; time: WorldTimeSignal } | null = null;
  private lastAmbientSlice = -1;
  private voiceActive = false;
  private lifecycleHidden = false;
  private lifecycleInstalled = false;
  private settings: AudioSettings;
  private storage: AudioSettingsStorage | undefined;
  private echoDelay: DelayNode | null = null;
  private echoWet: GainNode | null = null;
  private echoDamp: BiquadFilterNode | null = null;
  private visibilityHandler = () => {
    this.lifecycleHidden = typeof document !== 'undefined' && document.hidden;
    this.applyPause();
  };

  constructor(storage?: AudioSettingsStorage) {
    this.storage = storage;
    this.settings = readAudioSettings(storage);
    this.muted = this.settings.muted;
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setSettings(update: Partial<AudioSettings>): void {
    this.settings = normalizeAudioSettings(update, this.settings);
    this.muted = this.settings.muted;
    writeAudioSettings(this.settings, this.storage);
    this.updateLevels();
  }

  /** Speech has its own AudioContext. Only ambience/music are smoothly ducked here. */
  setVoiceActivity(active: boolean): void {
    if (this.voiceActive === active) return;
    this.voiceActive = active;
    this.updateLevels();
  }

  /** Call at most twice per second using canonical world time and sampled geometry. */
  setEnvironment(location: WorldLocationSignal, time: WorldTimeSignal): void {
    this.environment = { location, time };
    this.refreshSoundscape();
  }

  getDiagnostics(): AudioDiagnostics {
    return {
      state: this.context?.state ?? 'unstarted',
      started: this.started,
      paused: this.paused || this.lifecycleHidden,
      voiceDucked: this.voiceActive,
      zone: this.soundscape?.zone ?? 'legacy',
      culture: this.soundscape?.culture ?? 'procedural',
      phase: this.soundscape?.phase ?? 'day',
      transientVoices: this.voices.size,
      ambienceVoices: this.ambientVoices.size,
      permanentSources: this.permanentSources.length,
      schedulerRunning: this.timer !== null,
      settings: this.getSettings(),
      samples: this.soundBank?.diagnostics() ?? {
        ready: 0,
        loading: 0,
        failed: 0,
        decodedBytes: 0,
        activeLoads: 0,
      },
      foleyPlayed: this.foleyPlayed,
      foleyPending: this.pendingFoley.size,
      lastFoley: this.lastFoley,
      score: {
        identity: this.scorePhrase?.identity ?? 'waiting',
        zone: this.scorePhrase?.zone ?? 'waiting',
        phrase: this.scoreIndex,
        bpm: this.scorePhrase?.bpm ?? 0,
        voices: this.scoreVoices.size,
        notesScheduled: this.notesScheduled,
        notesSkipped: this.notesSkipped,
        schedulerMaxMs: this.schedulerMaxMs,
        schedulerCalls: this.schedulerCalls,
        tables: this.scoreTables.size,
        generatedBuffers: this.generatedBuffers.size,
        queuedBuffers: this.generationQueue.size,
        generationMaxMs: this.generationMaxMs,
      },
    };
  }

  /** Raw bounded timing rings for QA; contains durations only, never audio or player data. */
  getProfile(): { schedulerMs: number[]; generationMs: number[] } {
    const ordered = (values: Float32Array, count: number) =>
      Array.from(
        { length: Math.min(count, values.length) },
        (_, i) => values[(Math.max(0, count - values.length) + i) % values.length],
      );
    return {
      schedulerMs: ordered(this.schedulerTrace, this.schedulerTraceCount),
      generationMs: ordered(this.generationTrace, this.generationTraceCount),
    };
  }

  /** Call only for visible simulation events. Distance is measured in world tiles. */
  playWorldEvent(event: WorldSoundEvent): void {
    const context = this.context;
    if (
      !context ||
      !this.ambience ||
      context.state !== 'running' ||
      this.paused ||
      this.lifecycleHidden ||
      this.muted ||
      this.disposed ||
      this.settings.ambience <= 0 ||
      this.settings.master <= 0
    )
      return;
    if (
      !Number.isFinite(event.distance) ||
      event.distance < 0 ||
      event.distance >= AUDIO_LIMITS.worldSoundRadius
    )
      return;
    const injury = event.state === 'hurt' || event.state === 'death';
    const key = `world:${event.kind}:${(event.id ?? '').slice(0, 64)}${injury ? `:${event.state}` : ''}`;
    const sensorySpacing = this.settings.reducedSensory ? 2 : 1;
    if (
      !this.allowEvent(
        key,
        context.currentTime,
        (event.state === 'hurt' ? 0.9 : event.kind === 'bird' ? 4 : 2.5) * sensorySpacing,
      )
    )
      return;
    const strength =
      (1 - event.distance / AUDIO_LIMITS.worldSoundRadius) ** 2 *
      (this.environment?.location.interior ? 0.28 : 1);
    const pan = Number.isFinite(event.pan) ? Math.max(-1, Math.min(1, event.pan!)) : 0;
    if (event.kind === 'social' && (this.soundscape?.crowd ?? 0) <= 0) return;
    if (event.species || ['bird', 'grazer', 'predator', 'flee'].includes(event.kind)) {
      if (event.state === 'sleep') return;
      const species =
        event.species ??
        (event.kind === 'bird' ? 'bird' : event.kind === 'predator' ? 'wolf' : 'grazer');
      const state = animalVoiceState(event.state ?? (event.kind === 'flee' ? 'flee' : 'idle'));
      const variant = Math.floor(
        atmosphereRandom(this.seed, Math.floor(context.currentTime / 3), species.length) * 4,
      );
      const key = `animal:${species}:${state}:${variant}`;
      const playCall = (buffer: AudioBuffer) => {
        if (
          this.context !== context ||
          context.state !== 'running' ||
          !this.ambience ||
          this.paused ||
          this.lifecycleHidden ||
          this.muted ||
          this.disposed ||
          this.settings.ambience <= 0 ||
          this.settings.master <= 0
        )
          return;
        this.sample(
          buffer,
          0,
          buffer.duration,
          context.currentTime,
          strength * 0.2 * (this.settings.reducedSensory ? 0.65 : 1),
          1,
          pan,
          this.environment?.location.interior ? 2600 : 8000,
          this.ambience,
          true,
          0.025,
        );
      };
      const buffer = this.generatedBuffer(
        key,
        () => animalCallChunks(species, state, variant),
        playCall,
      );
      if (buffer) playCall(buffer);
      return;
    }
    this.environmentSound(event.kind, context.currentTime, strength, pan);
  }

  private refreshSoundscape(): void {
    if (!this.environment) return;
    this.soundscape = selectSoundscape(
      this.environment.location,
      this.environment.time,
      this.intensity,
      this.seed,
    );
    // Musical context is sampled at the next phrase boundary. Rapidly crossing a
    // doorway updates acoustics now but cannot restart the composition.
    this.updateLevels();
  }

  private allowEvent(key: string, now: number, cooldown: number): boolean {
    if (now - (this.lastEvents.get(key) ?? -100) < cooldown) return false;
    this.lastEvents.delete(key);
    this.lastEvents.set(key, now);
    while (this.lastEvents.size > AUDIO_LIMITS.eventHistory)
      this.lastEvents.delete(this.lastEvents.keys().next().value!);
    return true;
  }
  private permanentSources: AudioScheduledSourceNode[] = [];
  private voices = new Set<AudioScheduledSourceNode>();
  private noiseBuffer: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private muted = false;
  private paused = false;
  private disposed = false;
  private started = false;
  private intensity = 0;
  private seed = 1;
  private mission = 0;
  private tonic = 146.832;
  private effectRandom = makeRandom(2);
  private lastSocialAt = -Infinity;
  private lastEvents = new Map<string, number>();

  /** A controller can start play without granting the browser audio activation. */
  get needsGesture(): boolean {
    return (
      !!this.context &&
      this.context.state !== 'running' &&
      this.context.state !== 'closed' &&
      !this.muted &&
      !this.paused &&
      !this.lifecycleHidden
    );
  }

  /** Create/resume audio only in response to a click, tap, or key gesture. */
  async start(seed: number): Promise<void> {
    if (this.disposed) return;
    if (!this.started) this.setWorld(this.mission, seed);

    if (!this.context) {
      try {
        const scope = globalThis as typeof globalThis & {
          webkitAudioContext?: typeof AudioContext;
        };
        const Context = scope.AudioContext ?? scope.webkitAudioContext;
        if (!Context) return;
        this.context = new Context();
        this.createGraph();
      } catch {
        // A disabled device, strict browser policy, or unavailable API should
        // never prevent deployment into a world.
        this.disposeGraph();
        return;
      }
    }

    this.started = true;
    this.paused = false;
    if (!this.lifecycleInstalled && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
      this.lifecycleInstalled = true;
      this.lifecycleHidden = document.hidden;
    }
    this.clearSuspendTimer();
    try {
      if (
        this.context.state !== 'running' &&
        this.context.state !== 'closed' &&
        !this.lifecycleHidden
      )
        await this.context.resume();
    } catch {
      // Another user gesture may successfully resume the context later.
    }
    if (this.disposed || !this.context) return;
    this.updateLevels();
    this.ensureScheduler();
    this.warmFoley();
    this.updateSampledAmbience();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.setSettings({ muted });
  }

  /** Expected range is 0 (exploring) to 1 (immediate danger). */
  setIntensity(value: number): void {
    const intensity = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (intensity === this.intensity) return;
    this.intensity = intensity;
    if (this.environment) this.refreshSoundscape();
    else this.updateLevels();
  }

  /** A seed determines the world's motif, tempo, root, and texture. */
  setWorld(mission: number, seed: number): void {
    this.instrumentBuffers.clear();
    this.previousFoleyTake.clear();
    this.foleySequence.clear();
    this.generationQueue.clear();
    this.generationReady.clear();
    this.mission = Number.isFinite(mission) ? Math.max(0, Math.floor(mission)) : 0;
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1;
    const worldSeed = (this.seed ^ Math.imul(this.mission + 1, 0x9e3779b9)) >>> 0;
    const musicRandom = makeRandom(worldSeed);
    this.effectRandom = makeRandom(worldSeed ^ 0x68bc21eb);
    const roots = [50, 48, 53, 55];
    this.tonic = midi(roots[Math.floor(musicRandom() * roots.length)]);
    this.scorePhrase = null;
    this.scoreCursor = 0;
    this.scoreIndex = 0;
    this.lastAmbientSlice = -1;
    if (this.environment) this.refreshSoundscape();
    this.updateLevels();
  }

  /** Short names keep gameplay decoupled from the synthesis implementation. */
  play(event: string): void {
    const physical: Record<string, FoleyEvent> = {
      step: { kind: 'footstep', material: this.environment?.location.interior ? 'wood' : 'grass' },
      blade: { kind: 'swing', material: 'metal' },
      pulse: { kind: 'spell', material: 'metal', intensity: 0.75 },
      hurt: { kind: 'hit', material: 'flesh' },
      'enemy-death': { kind: 'hit', material: 'flesh', intensity: 0.8 },
      'guard-warning': { kind: 'guard', material: 'metal' },
      'crime-witnessed': { kind: 'crime', material: 'wood', intensity: 0.4 },
      'construction-complete': { kind: 'construction', material: 'wood' },
      'machine-cycle': { kind: 'machine', material: 'metal', intensity: 0.35 },
      'animal-harvest': { kind: 'harvest', material: 'flesh', intensity: 0.5 },
      'loot-claim': { kind: 'pickup', material: 'metal' },
      'door-locked': { kind: 'equip', material: 'metal', intensity: 0.3 },
      click: { kind: 'equip', material: 'cloth', intensity: 0.2 },
      dash: { kind: 'equip', material: 'cloth', intensity: 0.7 },
    };
    if (physical[event]) {
      this.playFoley(physical[event]);
      return;
    }
    const context = this.context;
    const bus = this.effects;
    if (
      !context ||
      !bus ||
      context.state !== 'running' ||
      this.paused ||
      this.lifecycleHidden ||
      this.muted ||
      this.disposed
    )
      return;

    const now = context.currentTime;
    const limits: Record<string, number> = {
      step: 0.17,
      blade: 0.13,
      pulse: 0.12,
      dash: 0.2,
      hurt: 0.23,
      scan: 0.35,
      scanned: 0.5,
      relay: 0.35,
      click: 0.065,
      breath: 2.7,
      'mind-transfer': 3,
      radio: 0.7,
    };
    if (!this.allowEvent(event, now, limits[event] ?? 0.08)) return;
    const jitter = 0.94 + this.effectRandom() * 0.12;
    const pan = (this.effectRandom() - 0.5) * 0.35;

    switch (event) {
      case 'mind-transfer':
        this.noise(now, 3.8, 0.13, 1100, 'bandpass', 0, 0.5);
        [0.5, 1, 1.007, 1.5].forEach((multiplier, index) => {
          this.tone(110 * multiplier, now + index * 0.12, 4.6, 0.042, bus, {
            endHz: 330 * multiplier,
            attack: 0.7,
            shape: 'sine',
            pan: index % 2 ? 0.65 : -0.65,
          });
        });
        for (let i = 0; i < 4; i++) {
          this.tone(65, now + i * 0.76, 0.2, 0.12, bus, { endHz: 36, cutoff: 180 });
          this.tone(56, now + i * 0.76 + 0.21, 0.15, 0.065, bus, { endHz: 34, cutoff: 160 });
        }
        break;
      case 'breath':
        this.noise(now, 1.1, 0.045, 800, 'bandpass', -0.12, 0.18);
        this.noise(now + 1.45, 1.35, 0.027, 600, 'lowpass', 0.12, 0.12);
        break;
      case 'radio':
        this.noise(now, 0.55, 0.08, 2200, 'bandpass', 0);
        [700, 1050, 700].forEach((frequency, index) =>
          this.tone(frequency, now + 0.16 * index, 0.095, 0.022, bus, { shape: 'sine' }),
        );
        break;
      case 'blade':
        this.noise(now, 0.16, 0.17, 1700, 'bandpass', pan);
        this.tone(320 * jitter, now, 0.13, 0.07, bus, {
          endHz: 115,
          cutoff: 1050,
          shape: 'triangle',
          pan,
        });
        break;
      case 'pulse':
        this.tone(690 * jitter, now, 0.23, 0.095, bus, {
          endHz: 175,
          cutoff: 1900,
          shape: 'triangle',
          pan,
        });
        this.tone(1120 * jitter, now, 0.11, 0.035, bus, { endHz: 620, pan });
        break;
      case 'dash':
        this.noise(now, 0.27, 0.14, 1250, 'bandpass', pan);
        this.tone(210, now, 0.2, 0.045, bus, { endHz: 430, attack: 0.025, pan });
        break;
      case 'scan':
        [0, 7, 12].forEach((interval, index) => {
          this.tone(this.tonic * 2 * ratio(interval), now + index * 0.09, 0.35, 0.045, bus, {
            attack: 0.025,
            pan: (index - 1) * 0.35,
          });
        });
        break;
      case 'scanned':
        this.chime([0, 7, 12, 15], now, 0.11, 0.075);
        break;
      case 'hurt':
        this.tone(130 * jitter, now, 0.23, 0.12, bus, {
          endHz: 52,
          shape: 'triangle',
          cutoff: 600,
        });
        this.noise(now, 0.12, 0.12, 490, 'lowpass', 0);
        break;
      case 'heal':
        this.chime([0, 5, 7, 12], now, 0.13, 0.055);
        break;
      case 'enemy-death':
        this.tone(290 * jitter, now, 0.4, 0.065, bus, {
          endHz: 68,
          shape: 'triangle',
          cutoff: 750,
          pan,
        });
        this.noise(now, 0.28, 0.1, 800, 'lowpass', pan);
        break;
      case 'relay':
        this.chime([0, 7, 10, 19], now, 0.115, 0.07);
        this.tone(this.tonic / 2, now, 1.4, 0.09, bus, { attack: 0.16 });
        break;
      case 'portal':
        this.noise(now, 1.3, 0.15, 740, 'bandpass', 0, 0.25);
        [0, 7, 12].forEach((interval, index) => {
          this.tone(this.tonic * ratio(interval), now + index * 0.05, 1.7, 0.052, bus, {
            endHz: this.tonic * ratio(interval + 12),
            attack: 0.28,
            pan: (index - 1) * 0.5,
          });
        });
        break;
      case 'complete':
        this.chime([0, 7, 12, 15, 19, 24], now, 0.16, 0.07);
        [0, 7, 12].forEach((interval) => {
          this.tone(this.tonic * ratio(interval), now + 0.36, 2.3, 0.034, bus, { attack: 0.25 });
        });
        break;
      case 'death':
        [12, 7, 3, 0].forEach((interval, index) => {
          this.tone(this.tonic * ratio(interval), now + index * 0.2, 1.5, 0.055, bus, {
            endHz: this.tonic * ratio(interval) * 0.7,
            attack: 0.06,
          });
        });
        this.noise(now, 0.85, 0.1, 420, 'lowpass', 0, 0.04);
        break;
      case 'click':
        this.tone(680, now, 0.055, 0.037, bus, { endHz: 550 });
        break;
      case 'step':
        this.noise(now, 0.075, 0.044, 450 + this.effectRandom() * 300, 'lowpass', pan);
        break;
      default:
        break;
    }
  }

  /** Pause releases only the game's device graph; the independent voice graph is untouched. */
  pause(paused: boolean): void {
    this.paused = paused;
    this.applyPause();
  }

  private ensureScheduler(): void {
    if (this.context && !this.disposed && !this.paused && !this.lifecycleHidden && !this.timer)
      this.timer = setInterval(() => this.schedule(), AUDIO_LIMITS.schedulerMs);
  }

  private applyPause(): void {
    this.clearSuspendTimer();
    const context = this.context;
    if (!context || this.disposed) return;
    const paused = this.paused || this.lifecycleHidden;
    this.updateLevels();
    if (paused) {
      this.scorePhrase = null;
      this.pendingFoley.clear();
      this.generationQueue.clear();
      this.generationReady.clear();
      if (this.generationTimer) clearTimeout(this.generationTimer);
      this.generationTimer = null;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      // Scheduled transients are cancelled so a suspended context cannot replay stale events.
      for (const source of [...this.voices]) {
        try {
          source.stop(context.currentTime + 0.15);
        } catch {
          /* Already ended. */
        }
      }
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if ((this.paused || this.lifecycleHidden) && context.state === 'running') {
          void context
            .suspend()
            .then(() => {
              if (
                !this.paused &&
                !this.lifecycleHidden &&
                !this.disposed &&
                this.context === context
              )
                return context.resume();
            })
            .catch(() => undefined);
        }
      }, 180);
    } else {
      this.lastAmbientSlice = this.environment
        ? Math.floor(this.environment.time.elapsedSeconds / 2)
        : -1;
      if (context.state !== 'running' && context.state !== 'closed')
        void context.resume().catch(() => undefined);
      this.ensureScheduler();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearSuspendTimer();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.lifecycleInstalled && typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.lifecycleInstalled = false;
    this.disposeGraph();
    this.lastEvents.clear();
    this.lastSocialAt = -Infinity;
  }

  private createGraph(): void {
    const context = this.context!;
    this.master = context.createGain();
    this.master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.18;
    this.master.connect(limiter).connect(context.destination);

    this.music = context.createGain();
    this.effects = context.createGain();
    this.ambience = context.createGain();
    this.ambience.gain.value = 0;
    this.ambience.connect(this.master);
    this.musicSlots = [context.createGain(), context.createGain()];
    this.musicSlots.forEach((slot, index) => {
      slot.gain.value = index === this.activeMusicSlot ? 1 : 0;
      slot.connect(this.music!);
    });
    this.music.gain.value = 0.78;
    this.effects.gain.value = 0.88;
    this.music.connect(this.master);
    this.effects.connect(this.master);

    // Short stereo echoes create space without an external impulse response.
    const echo = context.createDelay(1);
    this.echoDelay = echo;
    echo.delayTime.value = 0.337;
    const feedback = context.createGain();
    feedback.gain.value = 0.18;
    const damp = context.createBiquadFilter();
    this.echoDamp = damp;
    damp.type = 'lowpass';
    damp.frequency.value = 1750;
    const wet = context.createGain();
    this.echoWet = wet;
    wet.gain.value = 0.16;
    this.music.connect(echo);
    echo.connect(damp).connect(feedback).connect(echo);
    damp.connect(wet).connect(this.master);

    const noiseRandom = makeRandom(0x1ea5c0de);
    this.noiseBuffer = context.createBuffer(1, 24000, 24000);
    const data = this.noiseBuffer.getChannelData(0);
    // Smoothed noise avoids the brittle white-noise edge of generic synth SFX.
    let previous = 0;
    for (let index = 0; index < data.length; index++) {
      previous = previous * 0.72 + (noiseRandom() * 2 - 1) * 0.28;
      data[index] = previous;
    }

    this.soundBank = new SoundBank(context);
    for (const kind of ['flute', 'reed', 'bowed', 'organ', 'bass', 'drum', 'brush'] as const) {
      const data = scoreTable(kind),
        buffer = context.createBuffer(1, data.length, 16000);
      buffer.getChannelData(0).set(data);
      this.scoreTables.set(kind, buffer);
    }
  }

  private schedule(): void {
    const context = this.context;
    if (
      !context ||
      !this.music ||
      context.state !== 'running' ||
      this.paused ||
      this.lifecycleHidden ||
      this.disposed ||
      this.muted
    )
      return;
    const started = performance.now();
    this.scheduleAmbience();
    this.scheduleComposedMusic();
    this.schedulerCalls++;
    const duration = performance.now() - started;
    this.schedulerMaxMs = Math.max(this.schedulerMaxMs, duration);
    this.schedulerTrace[this.schedulerTraceCount++ % this.schedulerTrace.length] = duration;
  }

  private scheduleComposedMusic(): void {
    const context = this.context,
      environment = this.environment;
    if (!context || !environment || this.settings.music <= 0 || this.settings.master <= 0) return;
    const now = context.currentTime;
    if (
      !this.scorePhrase ||
      now + AUDIO_LIMITS.lookAheadSeconds >=
        this.scoreStart + (this.scorePhrase.beats * 60) / this.scorePhrase.bpm
    ) {
      const previous = this.scorePhrase;
      const boundary = previous
        ? this.scoreStart + (previous.beats * 60) / previous.bpm
        : now + 0.08;
      // An interrupted tab starts one fresh phrase; missed phrases never burst.
      this.scoreStart = Math.max(now + 0.015, boundary);
      if (previous) this.scoreIndex++;
      this.scorePhrase = composePhrase(
        this.seed,
        this.scoreIndex,
        environment.location,
        environment.time,
        this.intensity,
        environment.location.audioContext,
      );
      this.scoreCursor = 0;
      if (this.musicSlots.length === 2) {
        this.musicSlots[this.activeMusicSlot].gain.setTargetAtTime(0, this.scoreStart, 0.7);
        this.activeMusicSlot = 1 - this.activeMusicSlot;
        this.musicSlots[this.activeMusicSlot].gain.setTargetAtTime(1, this.scoreStart, 0.65);
      }
    }
    const phrase = this.scorePhrase,
      beatSeconds = 60 / phrase.bpm;
    let scheduled = 0;
    while (this.scoreCursor < phrase.notes.length && scheduled < 16) {
      const note = phrase.notes[this.scoreCursor],
        at = this.scoreStart + note.beat * beatSeconds;
      if (at >= now + AUDIO_LIMITS.lookAheadSeconds) break;
      this.scoreCursor++;
      if (at < now - 0.02) {
        this.notesSkipped++;
        continue;
      }
      this.scoreNote(note, Math.max(now, at), note.duration * beatSeconds);
      scheduled++;
      this.notesScheduled++;
    }
  }

  private scoreNote(note: ScoreNote, at: number, duration: number): void {
    const context = this.context,
      buffer = this.scoreTables.get(note.instrument),
      bus = this.musicSlots[this.activeMusicSlot];
    if (
      !context ||
      !buffer ||
      !bus ||
      this.scoreVoices.size >= SCORE_LIMITS.voices ||
      this.voices.size >= AUDIO_LIMITS.transientVoices - 12
    )
      return;
    if (this.settings.reducedSensory && (note.stem === 'response' || note.instrument === 'brush'))
      return;
    const source = context.createBufferSource(),
      envelope = context.createGain(),
      filter = context.createBiquadFilter(),
      pan = context.createStereoPanner();
    source.buffer = note.instrument === 'brush' ? this.noiseBuffer : buffer;
    source.loop = true;
    source.playbackRate.value =
      note.instrument === 'brush' ? 1 : (midi(note.midi) * buffer.length) / buffer.sampleRate;
    const scoreGain = note.gain * (this.settings.reducedSensory ? 0.65 : 1);
    const percussion = note.instrument === 'drum' || note.instrument === 'brush';
    if (note.instrument === 'drum')
      source.playbackRate.setTargetAtTime(source.playbackRate.value * 0.55, at, 0.045);
    filter.type = 'lowpass';
    filter.frequency.value =
      note.instrument === 'flute'
        ? 3600
        : note.instrument === 'bowed'
          ? 2400
          : note.instrument === 'brush'
            ? 2700
            : percussion
              ? 1300
              : 4200;
    pan.pan.value = note.pan;
    const attack = percussion ? 0.008 : note.instrument === 'bowed' ? 0.16 : 0.065;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(scoreGain, at + Math.min(attack, duration / 4));
    if (percussion) envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    else {
      envelope.gain.setValueAtTime(scoreGain * 0.83, at + Math.max(attack, duration - 0.16));
      envelope.gain.linearRampToValueAtTime(0, at + duration + 0.16);
    }
    source.connect(filter).connect(envelope).connect(pan).connect(bus);
    this.scoreVoices.add(source);
    this.track(source, [filter, envelope, pan]);
    source.start(at);
    source.stop(at + duration + 0.18);
  }

  /** Missing generated takes are warmed in bounded later tasks, never synthesized on a step. */
  private generatedBuffer(
    key: string,
    generate: () => Float32Array | Generator<void, Float32Array>,
    ready?: (buffer: AudioBuffer) => void,
  ): AudioBuffer | undefined {
    const buffer = this.generatedBuffers.get(key);
    if (buffer) return buffer;
    if (
      !this.generationQueue.has(key) &&
      this.generationQueue.size < SEMANTIC_AUDIO_LIMITS.maxQueue
    ) {
      this.generationQueue.set(key, { generate });
      if (ready) {
        const at = this.context?.currentTime ?? 0;
        this.generationReady.set(key, (value) => {
          if ((this.context?.currentTime ?? 100) - at < 0.25) ready(value);
        });
      }
    }
    if (!this.generationTimer && this.generationQueue.size && !this.disposed)
      this.generationTimer = setTimeout(() => this.generateNextBuffer(), 0);
    return undefined;
  }

  private generateNextBuffer(): void {
    this.generationTimer = null;
    if (!this.context || this.disposed || this.paused || this.lifecycleHidden) {
      this.generationQueue.clear();
      this.generationReady.clear();
      return;
    }
    const next = this.generationQueue.entries().next().value;
    if (!next) return;
    const [key, job] = next;
    this.generationQueue.delete(key);
    const start = performance.now();
    let data: Float32Array | undefined;
    if (!job.iterator) {
      const value = job.generate();
      if (value instanceof Float32Array) data = value;
      else job.iterator = value;
    }
    if (job.iterator) {
      const step = job.iterator.next();
      if (step.done) data = step.value;
      else this.generationQueue.set(key, job);
    }
    if (data) {
      const buffer = this.context.createBuffer(1, data.length, SEMANTIC_AUDIO_LIMITS.sampleRate);
      buffer.getChannelData(0).set(data);
      this.generatedBuffers.set(key, buffer);
      const ready = this.generationReady.get(key);
      this.generationReady.delete(key);
      ready?.(buffer);
      while (this.generatedBuffers.size > SEMANTIC_AUDIO_LIMITS.buffers)
        this.generatedBuffers.delete(this.generatedBuffers.keys().next().value!);
    }
    const duration = performance.now() - start;
    this.generationMaxMs = Math.max(this.generationMaxMs, duration);
    this.generationTrace[this.generationTraceCount++ % this.generationTrace.length] = duration;
    if (this.generationQueue.size)
      this.generationTimer = setTimeout(() => this.generateNextBuffer(), 2);
  }

  private scheduleAmbience(): void {
    if (!this.soundscape || !this.environment || !this.context || this.settings.ambience <= 0)
      return;
    const slice = Math.floor(this.environment.time.elapsedSeconds / 2);
    if (slice === this.lastAmbientSlice) return;
    this.lastAmbientSlice = slice;
    for (const event of ambientEvents(this.soundscape, this.environment.time.elapsedSeconds)) {
      if (
        !this.allowEvent(
          `ambient:${event.kind}`,
          this.context.currentTime,
          (event.kind === 'social' ? 24 : event.kind === 'bird' ? 5.5 : 3) *
            (this.settings.reducedSensory ? 2 : 1),
        )
      )
        continue;
      this.environmentSound(event.kind, this.context.currentTime + 0.04, event.strength, event.pan);
    }
  }

  private environmentSound(kind: string, now: number, strength: number, pan: number): void {
    if (!this.ambience || strength <= 0 || !this.soundBank) return;
    if (this.settings.reducedSensory) strength *= 0.65;
    if (kind === 'social') {
      if (
        (this.soundscape?.crowd ?? 0) <= 0 ||
        now - this.lastSocialAt < (this.settings.reducedSensory ? 48 : 24)
      )
        return;
      this.lastSocialAt = now;
    }
    if (kind === 'bird' || kind === 'insect' || kind === 'fire') {
      const bank: SampleBankId = kind === 'bird' ? 'birds' : kind === 'insect' ? 'insects' : 'fire';
      const buffer = this.soundBank.get(bank);
      if (!buffer) {
        void this.soundBank.load(bank);
        return;
      }
      const duration = Math.min(1.6, buffer.duration);
      const offset =
        atmosphereRandom(this.seed, Math.floor(now), 83) * Math.max(0, buffer.duration - duration);
      this.sample(
        buffer,
        offset,
        duration,
        now,
        strength * (kind === 'bird' ? 0.16 : 0.08),
        1,
        pan,
        8500,
        this.ambience,
        true,
        0.08,
      );
      return;
    }
    if (kind === 'social' && (this.soundscape?.crowd ?? 0) <= 0) return;
    const group = kind === 'work' ? 'wood' : kind === 'social' ? 'cloth' : 'rustle';
    const buffer = this.soundBank.get('foley'),
      clips = FOLEY_CLIPS[group];
    if (!buffer || !clips) return;
    const clip = clips[Math.floor(atmosphereRandom(this.seed, Math.floor(now), 84) * clips.length)];
    this.sample(
      buffer,
      clip.offset,
      clip.duration,
      now,
      strength *
        (kind === 'work'
          ? 0.075
          : kind === 'social'
            ? 0.024 * (this.soundscape?.crowd ?? 0)
            : 0.05),
      1,
      pan,
      kind === 'social' ? 900 : 6500,
      this.ambience,
      true,
    );
  }

  /** Real contact events only; counter-stratified takes prevent machine-gun repetition. */
  playFoley(event: FoleyEvent): void {
    const context = this.context;
    if (
      !context ||
      !this.effects ||
      this.disposed ||
      context.state !== 'running' ||
      this.paused ||
      this.lifecycleHidden ||
      this.muted ||
      this.settings.effects <= 0 ||
      this.settings.master <= 0
    )
      return;
    const group = foleyGroup(event),
      key = `${event.actorId ?? 'player'}:${event.kind}`.slice(0, 96);
    if (
      !this.allowEvent(
        `foley:${key}`,
        context.currentTime,
        event.kind === 'footstep' ? 0.095 : 0.045,
      )
    )
      return;
    const sequence = this.foleySequence.get(group) ?? 0;
    this.foleySequence.set(group, sequence + 1);
    if (group === 'bow-release') {
      this.renderBowRelease(event, sequence);
      return;
    }
    if (!this.soundBank?.get('foley')) {
      this.pendingFoley.delete(key);
      this.pendingFoley.set(key, { event: { ...event }, at: context.currentTime, sequence });
      while (this.pendingFoley.size > FOLEY_LIMITS.pendingEvents)
        this.pendingFoley.delete(this.pendingFoley.keys().next().value!);
      this.warmFoley();
      return;
    }
    this.renderFoley(event, sequence, context.currentTime);
  }

  private flushFoley(): void {
    const now = this.context?.currentTime ?? 0;
    for (const pending of this.pendingFoley.values()) {
      if (now - pending.at <= FOLEY_LIMITS.pendingSeconds)
        this.renderFoley(
          { ...pending.event, delay: Math.max(0, (pending.event.delay ?? 0) - (now - pending.at)) },
          pending.sequence,
          now,
        );
    }
    this.pendingFoley.clear();
  }

  private warmFoley(): void {
    if (!this.soundBank || this.sampleLoads.has('foley')) return;
    this.sampleLoads.add('foley');
    void this.soundBank.load('foley').then(() => {
      this.sampleLoads.delete('foley');
      this.flushFoley();
    });
  }

  private renderFoley(event: FoleyEvent, sequence: number, now: number): void {
    if (
      !this.context ||
      this.context.state !== 'running' ||
      this.paused ||
      this.lifecycleHidden ||
      this.muted ||
      this.disposed ||
      this.settings.effects <= 0 ||
      this.settings.master <= 0 ||
      !this.effects
    )
      return;
    const buffer = this.soundBank?.get('foley'),
      clips = FOLEY_CLIPS[foleyGroup(event)];
    if (!buffer || !clips) return;
    const plan = planFoley(event, sequence, this.seed, clips.length);
    if (!plan || plan.gain <= 0) return;
    if (clips.length > 1 && this.previousFoleyTake.get(plan.group) === plan.variant)
      plan.variant = (plan.variant + 1) % clips.length;
    const clip = clips[plan.variant];
    if (
      this.sample(
        buffer,
        clip.offset,
        clip.duration,
        now + plan.delay,
        plan.gain,
        plan.rate,
        plan.pan,
        plan.cutoff,
        this.effects,
      )
    ) {
      this.foleyPlayed++;
      this.lastFoley = `${plan.group}:${plan.variant}`;
      this.previousFoleyTake.set(plan.group, plan.variant);
      if (!this.settings.reducedSensory) {
        for (const layer of semanticFoleyLayers(event)) {
          const takes = FOLEY_CLIPS[layer.group],
            take = takes[sequence % takes.length];
          this.sample(
            buffer,
            take.offset,
            take.duration,
            now + plan.delay + layer.delay,
            plan.gain * layer.gain,
            layer.rate,
            plan.pan,
            layer.cutoff,
            this.effects,
          );
        }
      }
      if (plan.texture) {
        const material = plan.texture,
          variant = sequence % SEMANTIC_AUDIO_LIMITS.variants;
        const texture = this.settings.reducedSensory
          ? undefined
          : this.generatedBuffer(`surface:${material}:${variant}`, () =>
              surfaceTexture(material, variant),
            );
        if (texture)
          this.sample(
            texture,
            0,
            texture.duration,
            now + plan.delay,
            plan.textureGain,
            plan.rate,
            plan.pan,
            event.interior ? 4400 : 7600,
            this.effects,
          );
      }
    }
  }

  private renderBowRelease(event: FoleyEvent, sequence: number): void {
    const context = this.context;
    if (!context || !this.effects) return;
    const plan = planFoley(event, sequence, this.seed);
    if (!plan) return;
    const key = 'bow-release';
    let buffer = this.instrumentBuffers.get(key);
    if (!buffer) {
      const data = instrumentSamples('string', 105, this.seed, 24000).slice(0, 6000);
      for (let i = 0; i < data.length; i++)
        data[i] *= Math.exp(-i / 1350) * Math.min(1, (data.length - i) / 300);
      buffer = context.createBuffer(1, data.length, 24000);
      buffer.getChannelData(0).set(data);
      this.instrumentBuffers.set(key, buffer);
      while (this.instrumentBuffers.size > 20)
        this.instrumentBuffers.delete(this.instrumentBuffers.keys().next().value!);
    }
    if (
      this.sample(
        buffer,
        0,
        buffer.duration,
        context.currentTime + plan.delay,
        plan.gain * 2.2,
        plan.rate,
        plan.pan,
        8200,
        this.effects,
      )
    ) {
      this.foleyPlayed++;
      this.lastFoley = 'bow-release:physical-string';
    }
  }

  private sample(
    buffer: AudioBuffer,
    offset: number,
    duration: number,
    now: number,
    volume: number,
    rate: number,
    pan: number,
    cutoff: number,
    bus: AudioNode,
    ambient = false,
    attack = 0.002,
  ): boolean {
    const context = this.context;
    if (
      !context ||
      this.voices.size >= AUDIO_LIMITS.transientVoices ||
      (bus !== this.effects && this.voices.size >= AUDIO_LIMITS.transientVoices - 12) ||
      (ambient && this.ambientVoices.size >= AUDIO_LIMITS.ambienceVoices)
    )
      return false;
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain(),
      panner = context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    panner.pan.value = pan;
    const end = now + duration / rate;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(attack, duration / 4));
    gain.gain.setValueAtTime(volume, Math.max(now + attack, end - 0.018));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(filter).connect(gain).connect(panner).connect(bus);
    this.track(source, [filter, gain, panner], ambient);
    source.start(now, offset, duration);
    source.stop(end + 0.01);
    return true;
  }

  private updateSampledAmbience(): void {
    const context = this.context,
      bank = this.soundBank,
      frame = this.soundscape;
    if (!context || !bank || !this.ambience || this.disposed) return;
    const targets: Array<[SampleBankId, number]> = [
      ['wind', frame ? frame.wind * 2.1 + frame.leaves * 2 : 0],
      ['water', frame ? frame.water * 2.4 : 0],
      ['birds', frame ? frame.birds * 0.22 : 0],
      ['insects', frame ? frame.insects * 0.2 : 0],
    ];
    for (const [id, target] of targets) {
      const current = this.sampledLoops.get(id);
      if (current) {
        current.gain.gain.setTargetAtTime(target, context.currentTime, 1.35);
        continue;
      }
      if (
        target <= 0 ||
        !this.started ||
        this.paused ||
        this.lifecycleHidden ||
        this.settings.ambience <= 0 ||
        this.settings.master <= 0 ||
        this.muted
      )
        continue;
      const buffer = bank.get(id);
      if (!buffer) {
        if (!this.sampleLoads.has(id)) {
          this.sampleLoads.add(id);
          void bank.load(id).then((value) => {
            this.sampleLoads.delete(id);
            if (value && !this.disposed) this.updateSampledAmbience();
          });
        }
        continue;
      }
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(this.ambience);
      source.start(0, atmosphereRandom(this.seed, 0, id.length) * buffer.duration);
      gain.gain.setTargetAtTime(target, context.currentTime, 1.35);
      this.sampledLoops.set(id, { source, gain });
      this.permanentSources.push(source);
    }
  }

  private updateLevels(): void {
    const context = this.context;
    if (!context || !this.master || context.state === 'closed') return;
    const now = context.currentTime;
    const level =
      this.started && !this.muted && !this.paused && !this.lifecycleHidden
        ? 0.8 * this.settings.master
        : 0;
    const duck = voiceDuckLevels(this.voiceActive);
    this.master.gain.setTargetAtTime(level, now, 0.045);
    this.music?.gain.setTargetAtTime(this.settings.music * duck.music, now, duck.timeConstant);
    this.ambience?.gain.setTargetAtTime(
      this.settings.ambience * duck.ambience,
      now,
      duck.timeConstant,
    );
    this.effects?.gain.setTargetAtTime(this.settings.effects, now, 0.08);
    this.updateSampledAmbience();
    const frame = this.soundscape;
    this.echoDelay?.delayTime.setTargetAtTime(
      frame?.zone === 'temple' ? 0.61 : frame?.zone === 'tavern' ? 0.12 : 0.337,
      now,
      1,
    );
    this.echoWet?.gain.setTargetAtTime(
      frame?.zone === 'temple' ? 0.24 : frame?.zone === 'tavern' ? 0.05 : 0.12,
      now,
      1,
    );
    this.echoDamp?.frequency.setTargetAtTime(
      frame?.culture === 'electronic' ? 2800 : 1400,
      now,
      1.2,
    );
  }

  private chime(intervals: number[], time: number, spacing: number, volume: number): void {
    if (!this.effects) return;
    intervals.forEach((interval, index) => {
      const note = this.tonic * 2 * ratio(interval);
      const pan = (index / Math.max(1, intervals.length - 1) - 0.5) * 0.6;
      this.tone(note, time + index * spacing, 1.1, volume, this.effects!, { attack: 0.008, pan });
      this.tone(note * 2.007, time + index * spacing, 0.3, volume * 0.12, this.effects!, {
        attack: 0.005,
        pan,
      });
    });
  }

  private tone(
    hz: number,
    time: number,
    duration: number,
    volume: number,
    bus: AudioNode,
    options: ToneOptions = {},
  ): void {
    const context = this.context;
    if (
      !context ||
      this.voices.size >= AUDIO_LIMITS.transientVoices ||
      (bus !== this.effects && this.voices.size >= AUDIO_LIMITS.transientVoices - 12) ||
      (options.category === 'ambience' && this.ambientVoices.size >= AUDIO_LIMITS.ambienceVoices)
    )
      return;
    const oscillator = context.createOscillator();
    oscillator.type = options.shape ?? 'sine';
    oscillator.frequency.setValueAtTime(hz, time);
    if (options.endHz)
      oscillator.frequency.exponentialRampToValueAtTime(options.endHz, time + duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = options.cutoff ?? 5500;
    const envelope = context.createGain();
    const attack = Math.min(options.attack ?? 0.007, duration * 0.35);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    envelope.gain.linearRampToValueAtTime(0, time + duration + 0.025);
    const panner = context.createStereoPanner();
    panner.pan.value = options.pan ?? 0;
    oscillator.connect(filter).connect(envelope).connect(panner).connect(bus);
    this.track(oscillator, [filter, envelope, panner], options.category === 'ambience');
    oscillator.start(time);
    oscillator.stop(time + duration + 0.04);
  }

  private noise(
    time: number,
    duration: number,
    volume: number,
    cutoff: number,
    filterType: BiquadFilterType,
    pan: number,
    attack = 0.007,
    bus = this.effects,
  ): void {
    const context = this.context;
    if (
      !context ||
      !this.noiseBuffer ||
      !bus ||
      this.voices.size >= AUDIO_LIMITS.transientVoices ||
      (bus === this.ambience &&
        (this.ambientVoices.size >= AUDIO_LIMITS.ambienceVoices ||
          this.voices.size >= AUDIO_LIMITS.transientVoices - 12))
    )
      return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoff;
    filter.Q.value = 0.65;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + Math.min(attack, duration * 0.4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    envelope.gain.linearRampToValueAtTime(0, time + duration + 0.02);
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    source.connect(filter).connect(envelope).connect(panner).connect(bus);
    this.track(source, [filter, envelope, panner], bus === this.ambience);
    source.start(time, this.effectRandom());
    source.stop(time + duration + 0.03);
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], ambient = false): void {
    this.voices.add(source);
    if (ambient) this.ambientVoices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      this.scoreVoices.delete(source);
      this.ambientVoices.delete(source);
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
    };
  }

  private clearSuspendTimer(): void {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
  }

  private disposeGraph(): void {
    this.soundBank?.dispose();
    this.soundBank = null;
    this.sampleLoads.clear();
    this.pendingFoley.clear();
    this.instrumentBuffers.clear();
    this.scoreTables.clear();
    this.scoreVoices.clear();
    this.scorePhrase = null;
    this.generatedBuffers.clear();
    this.generationQueue.clear();
    this.generationReady.clear();
    if (this.generationTimer) clearTimeout(this.generationTimer);
    this.generationTimer = null;
    for (const loop of this.sampledLoops.values()) loop.gain.disconnect();
    this.sampledLoops.clear();
    [...this.permanentSources, ...this.voices].forEach((source) => {
      try {
        source.stop();
      } catch {
        /* The source may have ended already. */
      }
      source.disconnect();
    });
    this.permanentSources = [];
    this.voices.clear();
    this.ambientVoices.clear();
    this.musicSlots = [];
    const context = this.context;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.music = null;
    this.effects = null;
    this.ambience = null;
    this.echoDelay = null;
    this.echoWet = null;
    this.echoDamp = null;
    this.noiseBuffer = null;
  }
}

interface ToneOptions {
  category?: 'ambience';
  shape?: OscillatorType;
  endHz?: number;
  attack?: number;
  cutoff?: number;
  pan?: number;
}

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function ratio(semitones: number): number {
  return 2 ** (semitones / 12);
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
