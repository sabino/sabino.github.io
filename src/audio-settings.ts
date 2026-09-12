/** Only preferences are stored. No audio, browser device identifiers, or world state. */
export interface AudioSettings {
  master: number;
  ambience: number;
  music: number;
  effects: number;
  muted: boolean;
}

export const AUDIO_SETTINGS_KEY = 'verso.audio.settings.v1';
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  master: 0.8,
  ambience: 0.75,
  music: 0.55,
  effects: 0.85,
  muted: false,
});

export interface AudioSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeAudioSettings(
  value: unknown,
  base: Readonly<AudioSettings> = DEFAULT_AUDIO_SETTINGS,
): AudioSettings {
  const input = value && typeof value === 'object' ? (value as Partial<AudioSettings>) : {};
  const level = (key: 'master' | 'ambience' | 'music' | 'effects') =>
    typeof input[key] === 'number' && Number.isFinite(input[key])
      ? Math.max(0, Math.min(1, input[key]!))
      : base[key];
  return {
    master: level('master'),
    ambience: level('ambience'),
    music: level('music'),
    effects: level('effects'),
    muted: typeof input.muted === 'boolean' ? input.muted : base.muted,
  };
}

export function browserAudioStorage(): AudioSettingsStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readAudioSettings(storage = browserAudioStorage()): AudioSettings {
  try {
    return normalizeAudioSettings(JSON.parse(storage?.getItem(AUDIO_SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function writeAudioSettings(
  settings: AudioSettings,
  storage = browserAudioStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(normalizeAudioSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
