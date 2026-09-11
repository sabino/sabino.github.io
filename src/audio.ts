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
    return !!this.context && this.context.state === 'suspended' && !this.muted && !this.paused;
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
    this.clearSuspendTimer();
    try {
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // Another user gesture may successfully resume the context later.
    }
    if (this.disposed || !this.context) return;
    this.nextNote = this.context.currentTime + 0.12;
    this.updateLevels();
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 100);
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.updateLevels();
  }

  /** Expected range is 0 (exploring) to 1 (immediate danger). */
  setIntensity(value: number): void {
    const intensity = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (intensity === this.intensity) return;
    this.intensity = intensity;
    this.updateLevels();
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
    if (now - (this.lastEvents.get(event) ?? -100) < (limits[event] ?? 0.08)) return;
    this.lastEvents.set(event, now);
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

  /** Pause freezes musical time and releases the device while the game is idle. */
  pause(paused: boolean): void {
    this.paused = paused;
    this.clearSuspendTimer();
    const context = this.context;
    if (!context || this.disposed) return;
    this.updateLevels();
    if (paused) {
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (this.paused && context.state === 'running') {
          void context
            .suspend()
            .then(() => {
              // An unpause can arrive while suspend() is waiting for the next
              // audio render quantum; honor the latest state after it settles.
              if (!this.paused && !this.disposed && this.context === context) {
                return context.resume();
              }
            })
            .catch(() => undefined);
        }
      }, 180);
    } else {
      this.nextNote = context.currentTime + 0.12;
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearSuspendTimer();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
    this.music.gain.value = 0.78;
    this.effects.gain.value = 0.88;
    this.music.connect(this.master);
    this.effects.connect(this.master);

    // Short stereo echoes create space without an external impulse response.
    const echo = context.createDelay(1);
    echo.delayTime.value = 0.337;
    const feedback = context.createGain();
    feedback.gain.value = 0.18;
    const damp = context.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1750;
    const wet = context.createGain();
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
    wind.connect(this.windFilter).connect(this.windLevel).connect(this.music);
    wind.start();
    this.permanentSources.push(wind);

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
    if (!context || !bus || context.state !== 'running' || this.paused || this.disposed) return;
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

  private updateLevels(): void {
    const context = this.context;
    if (!context || !this.master || context.state === 'closed') return;
    const now = context.currentTime;
    const level = this.started && !this.muted && !this.paused ? 0.64 : 0;
    this.master.gain.setTargetAtTime(level, now, 0.045);
    this.music?.gain.setTargetAtTime(0.78 - this.intensity * 0.11, now, 0.6);
    this.droneLevel?.gain.setTargetAtTime(0.11 + this.intensity * 0.028, now, 1.1);
    this.droneFilter?.frequency.setTargetAtTime(560 + this.intensity * 380, now, 1.3);
    this.windFilter?.frequency.setTargetAtTime(
      480 + (this.mission % 3) * 90 + this.intensity * 330,
      now,
      1.8,
    );
    this.windLevel?.gain.setTargetAtTime(0.085 + this.intensity * 0.03, now, 1.1);
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
    if (!context || this.voices.size >= 56) return;
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
    this.track(oscillator, [filter, envelope, panner]);
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
  ): void {
    const context = this.context;
    if (!context || !this.noiseBuffer || !this.effects || this.voices.size >= 56) return;
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
    source.connect(filter).connect(envelope).connect(panner).connect(this.effects);
    this.track(source, [filter, envelope, panner]);
    source.start(time, this.effectRandom());
    source.stop(time + duration + 0.03);
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
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
    const context = this.context;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.music = null;
    this.effects = null;
    this.droneLevel = null;
    this.droneFilter = null;
    this.windFilter = null;
    this.windLevel = null;
    this.noiseBuffer = null;
  }
}

interface ToneOptions {
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
