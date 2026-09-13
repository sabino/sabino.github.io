import { atmosphereRandom } from './atmosphere.ts';
import type { WorldLocationSignal } from './stichos/world-signals.ts';
import type { WorldTimeSignal } from './stichos/world-time.ts';

/** Transient listener context; never added to saves or sent as audio over the network. */
export type ScoreContext = Partial<NonNullable<WorldLocationSignal['audioContext']>>;
export type ScoreIdentity = 'dawn' | 'day' | 'dusk' | 'deep-night' | 'special-night';
export type ScoreInstrument = 'flute' | 'reed' | 'bowed' | 'organ' | 'bass' | 'drum' | 'brush';
export interface ScoreNote {
  beat: number;
  duration: number;
  midi: number;
  instrument: ScoreInstrument;
  gain: number;
  pan: number;
  stem: 'melody' | 'harmony' | 'bass' | 'rhythm' | 'response';
}
export interface ScorePhrase {
  identity: ScoreIdentity;
  zone: string;
  seed: number;
  index: number;
  bpm: number;
  beats: 32;
  root: number;
  harmony: readonly number[];
  notes: ScoreNote[];
}
export const SCORE_LIMITS = Object.freeze({ notesPerPhrase: 112, voices: 20, tables: 7 });

// Original eight-bar themes: a two-bar question, answer, development and cadence.
// Scale degrees are chosen by the composer. Seed variation selects a theme and
// articulation; it never picks unrelated notes out of a scale on each pulse.
const THEMES: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [
    [0, 0, 1.5],
    [2, 2, 0.75],
    [3, 4, 2],
    [6, 3, 1],
    [8, 2, 1.5],
    [10, 1, 0.75],
    [11, 0, 2.5],
  ],
  [
    [0, 4, 2],
    [3, 5, 0.75],
    [4, 4, 1.5],
    [6, 2, 1],
    [8, 3, 2],
    [11, 2, 1],
    [12, 0, 2],
  ],
  [
    [0, 0, 2.5],
    [3, 2, 0.75],
    [4, 1, 2],
    [7, 4, 0.75],
    [8, 3, 1.5],
    [10, 2, 1],
    [12, 1, 2],
  ],
];
const PALETTES = {
  dawn: {
    scale: [0, 2, 4, 6, 7, 9, 11],
    chords: [0, 3, 5, 4, 0, 3, 4, 0],
    bpm: 66,
    lead: 'flute',
    register: 12,
  },
  day: {
    scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [0, 5, 3, 4, 0, 3, 4, 0],
    bpm: 84,
    lead: 'reed',
    register: 12,
  },
  dusk: {
    scale: [0, 2, 3, 5, 7, 9, 10],
    chords: [0, 3, 6, 4, 0, 3, 4, 0],
    bpm: 72,
    lead: 'bowed',
    register: 0,
  },
  'deep-night': {
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [0, 5, 3, 0, 0, 3, 4, 0],
    bpm: 56,
    lead: 'flute',
    register: 0,
  },
  'special-night': {
    scale: [0, 2, 3, 6, 7, 9, 11],
    chords: [0, 3, 5, 4, 0, 5, 4, 0],
    bpm: 62,
    lead: 'organ',
    register: 12,
  },
} as const;

export function scoreIdentity(time: WorldTimeSignal, context: ScoreContext = {}): ScoreIdentity {
  if (time.phase === 'night') return context.specialNight ? 'special-night' : 'deep-night';
  return time.phase;
}
const degreePitch = (degree: number, scale: readonly number[]) =>
  scale[((degree % 7) + 7) % 7] + 12 * Math.floor(degree / 7);
const hashText = (text = '') => {
  let hash = 0;
  for (let i = 0; i < Math.min(text.length, 64); i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
};

/** Call at phrase boundaries only. Location changes become a musical continuation. */
export function composePhrase(
  seed: number,
  index: number,
  location: WorldLocationSignal,
  time: WorldTimeSignal,
  danger = 0,
  context: ScoreContext = {},
): ScorePhrase {
  seed = Number.isFinite(seed) ? seed >>> 0 : 1;
  index = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const identity = scoreIdentity(time, context),
    palette = PALETTES[identity];
  const depth = Number.isFinite(context.dungeonDepth)
    ? Math.max(0, Math.min(20, context.dungeonDepth!))
    : 0;
  const zone =
    depth > 0
      ? 'dungeon'
      : context.home
        ? 'home'
        : location.interior
          ? location.buildingKind === 'church'
            ? 'temple'
            : location.buildingKind === 'inn'
              ? 'tavern'
              : location.buildingKind === 'workshop'
                ? 'workshop'
                : 'home'
          : location.settlement
            ? 'settlement'
            : 'wilderness';
  const threat = Math.max(0, Math.min(1, Number.isFinite(danger) ? danger : 0));
  const cultureSeed = (seed ^ (location.architecture?.seed ?? 0)) >>> 0;
  const root = [48, 50, 53, 55][cultureSeed % 4];
  const keySeed = cultureSeed ^ hashText(location.biome) ^ hashText(context.factionId);
  const theme = THEMES[(keySeed >>> 0) % THEMES.length];
  const bpm = Math.min(
    112,
    palette.bpm + (zone === 'tavern' ? 18 : 0) + (threat > 0.55 ? 24 : 0) - Math.min(depth, 8),
  );
  const notes: ScoreNote[] = [];
  const add = (
    beat: number,
    duration: number,
    degree: number,
    instrument: ScoreInstrument,
    gain: number,
    stem: ScoreNote['stem'],
    pan = 0,
    register = 0,
  ) => {
    if (notes.length >= SCORE_LIMITS.notesPerPhrase) return;
    notes.push({
      beat,
      duration,
      midi: root + degreePitch(degree, palette.scale) + register,
      instrument,
      gain,
      stem,
      pan,
    });
  };
  const sparse = identity === 'deep-night' || zone === 'dungeon';
  const quietPhrase = zone === 'wilderness' && threat < 0.3 && index % 4 === 3;
  const harmonyInstrument: ScoreInstrument = zone === 'temple' ? 'organ' : 'bowed';
  const lead: ScoreInstrument =
    zone === 'tavern'
      ? 'reed'
      : zone === 'temple' || (location.architecture?.technology ?? 0) > 0.7
        ? 'organ'
        : ['wetland', 'marsh'].includes(location.biome)
          ? 'flute'
          : palette.lead;
  const weight = context.reputation === 'wanted' || context.reputation === 'feared' ? 0.75 : 1;
  for (let bar = 0; bar < 8; bar++) {
    const chord = palette.chords[bar];
    if (sparse && bar % 2 === 1 && threat < 0.35 && bar < 6) continue;
    // Close voiced thirds with a shared root bass; final dominant-to-tonic resolves.
    for (const [voice, degree] of [chord, chord + 2, chord + 4].entries()) {
      add(
        bar * 4,
        3.8,
        degree >= 7 ? degree - 7 : degree,
        harmonyInstrument,
        (sparse ? 0.012 : 0.017) * weight,
        'harmony',
        (voice - 1) * 0.36,
      );
    }
    add(bar * 4, sparse ? 3.5 : 2.6, chord, 'bass', 0.047, 'bass', 0, -12);
    if (!sparse || threat > 0.35 || (context.production ?? 0) > 0) {
      add(bar * 4, 0.35, 0, 'drum', threat > 0.55 ? 0.055 : 0.024, 'rhythm', -0.12, -12);
      if (zone === 'tavern' || threat > 0.55 || zone === 'workshop')
        add(bar * 4 + 2, 0.22, 4, 'brush', 0.018 + threat * 0.015, 'rhythm', 0.22);
    }
  }
  if (!quietPhrase) {
    for (const [beat, degree, duration] of theme) {
      if (sparse && beat % 2 === 1) continue;
      add(
        beat,
        duration * (zone === 'tavern' ? 0.82 : 1),
        degree,
        lead,
        0.054,
        'melody',
        -0.18,
        palette.register,
      );
      // Second statement changes contour purposefully; the last notes are an authored cadence.
      if (beat < 11)
        add(
          beat + 16,
          duration,
          degree + (index % 2 ? 2 : 0),
          lead,
          0.047,
          'melody',
          0.15,
          palette.register,
        );
    }
    add(27, 1, 1, lead, 0.051, 'melody', 0.1, palette.register);
    add(28, 3, 0, lead, 0.045, 'melody', 0.05, palette.register);
    if (context.factionId || context.victory || context.reputation === 'trusted') {
      const reply = context.victory ? [0, 2, 4, 7] : [4, 2, 1, 0];
      reply.forEach((degree, n) =>
        add(24 + n, n === 3 ? 2.5 : 0.75, degree, 'flute', 0.027, 'response', 0.38, 12),
      );
    }
  }
  // A cold/high rocky biome darkens register; rain softens articulation, never invents weather.
  const dark = location.temperature < 0 || depth > 2;
  for (const note of notes) {
    if (dark && note.stem === 'melody') note.midi -= 12;
    note.gain *=
      (location.weather === 'rain' || location.weather === 'storm' ? 0.82 : 1) *
      (0.94 + atmosphereRandom(seed, index, Math.floor(note.beat * 4)) * 0.06);
  }
  notes.sort((a, b) => a.beat - b.beat);
  return {
    identity,
    zone,
    seed: keySeed >>> 0,
    index,
    bpm,
    beats: 32,
    root,
    harmony: palette.chords,
    notes,
  };
}

/** Tiny band-limited tables, generated once per graph: no per-pitch PCM synthesis. */
export function scoreTable(instrument: ScoreInstrument, length = 512): Float32Array {
  const partials: Record<ScoreInstrument, readonly number[]> = {
    flute: [1, 0.15, 0.035, 0.012],
    reed: [1, 0.22, 0.38, 0.12, 0.14, 0.04],
    bowed: [1, 0.42, 0.24, 0.15, 0.075, 0.05, 0.025],
    organ: [1, 0.3, 0.07, 0.15, 0.02, 0.03],
    bass: [1, 0.24, 0.08],
    drum: [1, 0.12, 0.035],
    brush: [1, 0.4, 0.3, 0.2, 0.17, 0.12, 0.08],
  };
  const output = new Float32Array(length),
    harmonics = partials[instrument];
  const total = harmonics.reduce((a, b) => a + b, 0);
  for (let i = 0; i < length; i++)
    for (let h = 0; h < harmonics.length; h++)
      output[i] += (Math.sin((i / length) * Math.PI * 2 * (h + 1)) * harmonics[h]) / total;
  return output;
}
