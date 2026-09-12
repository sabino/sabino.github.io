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
}

/**
 * Verso's small, entirely procedural sound world.
 *
 * Construction is silent. Call start() from a user gesture before using the
 * director; browsers that cannot create or resume audio remain playable.
 */
export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private ambienceLayers = new Map<string, { level: GainNode; filter: BiquadFilterNode }>();
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
    const key = `world:${event.kind}:${(event.id ?? '').slice(0, 64)}`;
    if (!this.allowEvent(key, context.currentTime, event.kind === 'bird' ? 4 : 2.5)) return;
    const strength =
      (1 - event.distance / AUDIO_LIMITS.worldSoundRadius) ** 2 *
      (this.environment?.location.interior ? 0.28 : 1);
    const pan = Number.isFinite(event.pan) ? Math.max(-1, Math.min(1, event.pan!)) : 0;
    this.environmentSound(event.kind, context.currentTime, strength, pan);
  }

  private refreshSoundscape(): void {
    if (!this.environment) return;
    const previous = this.soundscape;
    this.soundscape = selectSoundscape(
      this.environment.location,
      this.environment.time,
      this.intensity,
      this.seed,
    );
    if (
      !previous ||
      previous.zone !== this.soundscape.zone ||
      previous.culture !== this.soundscape.culture
    ) {
      // Two reusable buses let old note tails fade while the new location begins.
      this.phraseStep = 0;
      if (this.context && this.musicSlots.length === 2) {
        const now = this.context.currentTime;
        this.musicSlots[this.activeMusicSlot].gain.setTargetAtTime(0, now, 0.7);
        this.activeMusicSlot = 1 - this.activeMusicSlot;
        this.musicSlots[this.activeMusicSlot].gain.setTargetAtTime(1, now, 0.9);
        this.nextNote = now + 0.1;
      }
    }
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
  private droneLevel: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windLevel: GainNode | null = null;
  private droneVoices: OscillatorNode[] = [];
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
  private nextNote = 0;
  private phraseStep = 0;
  private beatLength = 0.47;
  private musicRandom = makeRandom(1);
  private effectRandom = makeRandom(2);
  private lastEvents = new Map<string, number>();
  private readonly pentatonic = [0, 3, 5, 7, 10];
  private motif = [0, 2, 4, 2, 1, 3, 2, 0];

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
    this.nextNote = this.context.currentTime + 0.12;
    this.updateLevels();
    this.ensureScheduler();
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
    this.mission = Number.isFinite(mission) ? Math.max(0, Math.floor(mission)) : 0;
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1;
    const worldSeed = (this.seed ^ Math.imul(this.mission + 1, 0x9e3779b9)) >>> 0;
    this.musicRandom = makeRandom(worldSeed);
    this.effectRandom = makeRandom(worldSeed ^ 0x68bc21eb);
    const roots = [50, 48, 53, 55];
    this.tonic = midi(roots[Math.floor(this.musicRandom() * roots.length)]);
    this.beatLength = 60 / (62 + Math.floor(this.musicRandom() * 12)) / 2;
    const turn = Math.floor(this.musicRandom() * 5);
    this.motif = [0, 2, 4, 2, 1, 3, 2, 0].map((degree) => (degree + turn) % 5);
    this.phraseStep = 0;
    this.lastAmbientSlice = -1;
    if (this.environment) this.refreshSoundscape();
    if (this.context) {
      this.nextNote = this.context.currentTime + 0.2;
      const multipliers = [0.5, 0.75, 1];
      this.droneVoices.forEach((voice, index) => {
        voice.frequency.setTargetAtTime(
          this.tonic * multipliers[index],
          this.context!.currentTime,
          1.6,
        );
      });
    }
    this.updateLevels();
  }

  /** Short names keep gameplay decoupled from the synthesis implementation. */
  play(event: string): void {
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
      this.nextNote = context.currentTime + 0.12;
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
    this.noiseBuffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    // Smoothed noise avoids the brittle white-noise edge of generic synth SFX.
    let previous = 0;
    for (let index = 0; index < data.length; index++) {
      previous = previous * 0.72 + (noiseRandom() * 2 - 1) * 0.28;
      data[index] = previous;
    }

    this.droneLevel = context.createGain();
    this.droneLevel.gain.value = 0.11;
    this.droneFilter = context.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 560;
    this.droneLevel.connect(this.droneFilter).connect(this.music);
    [0.5, 0.75, 1].forEach((multiple, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 1 ? 'triangle' : 'sine';
      oscillator.frequency.value = this.tonic * multiple;
      oscillator.detune.value = [-3, 2, 4][index];
      const level = context.createGain();
      level.gain.value = [0.44, 0.21, 0.12][index];
      oscillator.connect(level).connect(this.droneLevel!);
      oscillator.start();
      this.droneVoices.push(oscillator);
      this.permanentSources.push(oscillator);
    });

    const wind = context.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 510;
    this.windFilter.Q.value = 0.55;
    this.windLevel = context.createGain();
    this.windLevel.gain.value = 0.085;
    wind.connect(this.windFilter).connect(this.windLevel).connect(this.ambience);
    wind.start();
    this.permanentSources.push(wind);
    // The reusable noise buffer is pooled. Source nodes are one-shot by Web Audio design;
    // these three long-lived loops are never recreated on a location transition.
    for (const [index, name] of ['water', 'leaves', 'room'].entries()) {
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = name === 'water' ? 'lowpass' : 'bandpass';
      filter.frequency.value = [1850, 2350, 180][index];
      filter.Q.value = 0.35;
      const level = context.createGain();
      level.gain.value = 0;
      source.connect(filter).connect(level).connect(this.ambience!);
      source.start(0, index * 0.77);
      this.ambienceLayers.set(name, { level, filter });
      this.permanentSources.push(source);
    }

    const breeze = context.createOscillator();
    breeze.frequency.value = 0.065;
    const breezeAmount = context.createGain();
    breezeAmount.gain.value = 130;
    breeze.connect(breezeAmount).connect(this.windFilter.frequency);
    breeze.start();
    this.permanentSources.push(breeze);

    const breath = context.createOscillator();
    breath.frequency.value = 0.09;
    const breathAmount = context.createGain();
    breathAmount.gain.value = 0.012;
    breath.connect(breathAmount).connect(this.droneLevel.gain);
    breath.start();
    this.permanentSources.push(breath);
  }

  private schedule(): void {
    const context = this.context;
    const bus = this.music;
    if (
      !context ||
      !bus ||
      context.state !== 'running' ||
      this.paused ||
      this.lifecycleHidden ||
      this.disposed ||
      this.muted
    )
      return;
    this.scheduleAmbience();
    if (this.soundscape) {
      this.scheduleLocationMusic(this.soundscape);
      return;
    }
    // Never catch up a tab's missed beats in a burst after a long frame.
    if (this.nextNote < context.currentTime) this.nextNote = context.currentTime + 0.05;
    while (this.nextNote < context.currentTime + 0.24) {
      const step = this.phraseStep % 32;
      const degree = this.motif[Math.floor(step / 2) % this.motif.length];
      const random = this.musicRandom();
      if ((step % 2 === 0 && random > 0.16) || (this.intensity > 0.45 && random > 0.72)) {
        const octave = step >= 16 ? 2 : 1;
        const note = this.tonic * ratio(this.pentatonic[degree]) * octave;
        const pan = (this.musicRandom() - 0.5) * 1.1;
        this.tone(note, this.nextNote, 1.35, 0.035 + this.intensity * 0.009, bus, {
          shape: 'triangle',
          attack: 0.065,
          cutoff: 1600,
          pan,
        });
        // A very faint near-octave partial is the motif's glassy signature.
        this.tone(note * 2.003, this.nextNote + 0.008, 0.62, 0.008, bus, {
          attack: 0.035,
          pan: -pan,
        });
      }
      if (step % 8 === 0 && this.intensity > 0.16) {
        this.tone(this.tonic / 2, this.nextNote, 0.32, 0.014 + this.intensity * 0.045, bus, {
          endHz: this.tonic / 3,
          attack: 0.012,
          cutoff: 380,
        });
      }
      if (step === 30 && this.musicRandom() > 0.48) {
        this.tone(this.tonic * 4, this.nextNote, 2.2, 0.015, bus, {
          attack: 0.08,
          pan: this.musicRandom() > 0.5 ? 0.55 : -0.55,
        });
      }
      this.phraseStep++;
      this.nextNote += this.beatLength * (1 - this.intensity * 0.12);
    }
  }

  private scheduleLocationMusic(frame: SoundscapeFrame): void {
    const context = this.context!;
    const bus = this.musicSlots[this.activeMusicSlot] ?? this.music!;
    if (this.nextNote < context.currentTime) this.nextNote = context.currentTime + 0.05;
    let scheduled = 0;
    while (
      this.nextNote < context.currentTime + AUDIO_LIMITS.lookAheadSeconds &&
      scheduled++ < AUDIO_LIMITS.maxCatchupNotes
    ) {
      const step = this.phraseStep % 64;
      const random = atmosphereRandom(frame.variationSeed, this.phraseStep, 90);
      // Every other wilderness phrase breathes: long rests prevent a constant game loop.
      const rest = frame.zone === 'wilderness' && Math.floor(this.phraseStep / 32) % 3 === 2;
      if (
        !rest &&
        (step % 2 === 0 || frame.zone === 'tavern' || frame.zone === 'danger') &&
        random < frame.noteDensity
      ) {
        const degree =
          (this.motif[Math.floor(step / 2) % this.motif.length] + Math.floor(step / 16)) %
          frame.scale.length;
        const note = this.tonic * ratio(frame.scale[degree]) * (step >= 32 ? 2 : 1);
        const pan = atmosphereRandom(frame.variationSeed, this.phraseStep, 91) * 1.2 - 0.6;
        const temple = frame.zone === 'temple',
          tavern = frame.zone === 'tavern';
        const shape: OscillatorType =
          frame.culture === 'electronic' ? 'sine' : temple ? 'sine' : 'triangle';
        this.tone(
          note,
          this.nextNote,
          temple ? 3.3 : tavern ? 0.48 : 1.4,
          0.037 * frame.melodyGain,
          bus,
          {
            shape,
            attack: temple ? 0.4 : tavern ? 0.009 : 0.09,
            cutoff: temple ? 1100 : tavern ? 2600 : 1450,
            pan,
          },
        );
        if (temple)
          this.tone(note * ratio(7), this.nextNote + 0.08, 3.1, 0.014, bus, {
            attack: 0.5,
            cutoff: 1400,
            pan: -pan,
          });
        if (tavern && frame.culture === 'acoustic')
          this.tone(note * 2, this.nextNote, 0.2, 0.01, bus, { shape: 'sine', cutoff: 2400, pan });
      }
      if (
        step % 4 === 0 &&
        (frame.zone === 'danger' ||
          ((frame.zone === 'tavern' || frame.zone === 'workshop') && frame.activity > 0.2))
      ) {
        this.tone(
          this.tonic / 2,
          this.nextNote,
          0.22,
          frame.zone === 'danger' ? 0.043 : 0.018,
          bus,
          { endHz: this.tonic / 3, cutoff: 330, attack: 0.006 },
        );
      }
      this.phraseStep++;
      this.nextNote += frame.pulseSeconds;
    }
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
          event.kind === 'bird' ? 5.5 : 3,
        )
      )
        continue;
      this.environmentSound(event.kind, this.context.currentTime + 0.04, event.strength, event.pan);
    }
  }

  private environmentSound(kind: string, now: number, strength: number, pan: number): void {
    const bus = this.ambience;
    if (!bus || strength <= 0 || this.ambientVoices.size >= AUDIO_LIMITS.ambienceVoices) return;
    const volume = strength * 0.035;
    const options = { pan, category: 'ambience' as const };
    if (kind === 'bird') {
      const base = 1600 + atmosphereRandom(this.seed, Math.floor(now), 17) * 1500;
      this.tone(base, now, 0.17, volume * 0.6, bus, {
        ...options,
        endHz: base * 1.55,
        attack: 0.025,
      });
      this.tone(base * 1.36, now + 0.2, 0.22, volume * 0.5, bus, {
        ...options,
        endHz: base * 0.91,
        attack: 0.022,
      });
      this.tone(base, now + 0.5, 0.12, volume * 0.28, bus, {
        ...options,
        endHz: base * 1.25,
        attack: 0.016,
      });
    } else if (kind === 'insect') {
      for (let index = 0; index < 4; index++)
        this.tone(3700 + index * 32, now + index * 0.075, 0.043, volume * 0.23, bus, options);
    } else if (kind === 'fire' || kind === 'flee') {
      this.noise(
        now,
        kind === 'fire' ? 0.18 : 0.42,
        volume * 1.6,
        kind === 'fire' ? 1900 : 850,
        'bandpass',
        pan,
        0.013,
        bus,
      );
    } else if (kind === 'work') {
      this.tone(
        this.soundscape?.culture === 'electronic' ? 880 : 520,
        now,
        0.18,
        volume * 0.7,
        bus,
        { ...options, endHz: 410, shape: 'triangle', cutoff: 1600 },
      );
      this.noise(now, 0.07, volume, 1750, 'highpass', pan, 0.004, bus);
    } else if (kind === 'social') {
      // Abstract low room murmur: never synthesized intelligible words or recorded speech.
      [130, 185, 230].forEach((hz, index) =>
        this.tone(hz, now + index * 0.14, 0.4, volume * 0.16, bus, {
          ...options,
          shape: 'triangle',
          attack: 0.12,
          endHz: hz * 1.14,
          cutoff: 650,
        }),
      );
    } else if (kind === 'grazer') {
      this.tone(340, now, 0.42, volume * 0.65, bus, {
        ...options,
        shape: 'triangle',
        endHz: 220,
        attack: 0.09,
        cutoff: 1100,
      });
    } else if (kind === 'predator') {
      this.noise(now, 0.9, volume, 330, 'lowpass', pan, 0.2, bus);
      this.tone(104, now, 0.8, volume * 0.7, bus, {
        ...options,
        shape: 'triangle',
        endHz: 66,
        attack: 0.14,
        cutoff: 400,
      });
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
    const frame = this.soundscape;
    this.droneLevel?.gain.setTargetAtTime(
      frame?.droneGain ?? 0.08 + this.intensity * 0.028,
      now,
      1.1,
    );
    this.droneFilter?.frequency.setTargetAtTime(
      frame?.zone === 'temple' ? 1100 : 560 + this.intensity * 380,
      now,
      1.3,
    );
    this.windFilter?.frequency.setTargetAtTime(
      frame?.windHz ?? 480 + (this.mission % 3) * 90,
      now,
      1.8,
    );
    this.windLevel?.gain.setTargetAtTime(frame?.wind ?? 0.065, now, 1.1);
    for (const [name, layer] of this.ambienceLayers) {
      const target = frame
        ? name === 'water'
          ? frame.water
          : name === 'leaves'
            ? frame.leaves
            : frame.room
        : 0;
      layer.level.gain.setTargetAtTime(target, now, 1.2);
    }
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
    [...this.permanentSources, ...this.voices].forEach((source) => {
      try {
        source.stop();
      } catch {
        /* The source may have ended already. */
      }
      source.disconnect();
    });
    this.permanentSources = [];
    this.droneVoices = [];
    this.voices.clear();
    this.ambientVoices.clear();
    this.ambienceLayers.clear();
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
    this.droneLevel = null;
    this.droneFilter = null;
    this.windFilter = null;
    this.windLevel = null;
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
