import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectSoundscape,
  ambientEvents,
  atmosphereRandom,
  voiceDuckLevels,
  AUDIO_LIMITS,
} from '../src/atmosphere.ts';
import {
  normalizeAudioSettings,
  readAudioSettings,
  writeAudioSettings,
  DEFAULT_AUDIO_SETTINGS,
} from '../src/audio-settings.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';
import type { WorldLocationSignal } from '../src/stichos/world-signals.ts';

const location: WorldLocationSignal = {
  biome: 'woodland',
  terrain: 'grass',
  interior: false,
  temperature: 12,
  settlement: false,
  featureDistances: { water: Infinity, trees: 2, fire: Infinity },
  weather: 'clear',
};
const day = worldTimeAt(0),
  night = worldTimeAt(14 * 60),
  dawn = worldTimeAt(22 * 60);

test('location and culture select distinct tavern, temple, home, workshop, danger music', () => {
  const tavern = selectSoundscape({ ...location, interior: true, buildingKind: 'inn' }, day);
  const temple = selectSoundscape({ ...location, interior: true, buildingKind: 'church' }, day);
  assert.equal(tavern.zone, 'tavern');
  assert.equal(temple.zone, 'temple');
  assert.notDeepEqual(tavern.scale, temple.scale);
  assert.ok(tavern.pulseSeconds < temple.pulseSeconds);
  assert.ok(temple.droneGain > tavern.droneGain);
  assert.equal(
    selectSoundscape({ ...location, interior: true, buildingKind: 'house' }, day).zone,
    'home',
  );
  assert.equal(
    selectSoundscape({ ...location, interior: true, buildingKind: 'workshop' }, day).zone,
    'workshop',
  );
  assert.equal(selectSoundscape(location, day, 1).zone, 'danger');
});

test('ecological ambient layers respect habitats, daylight, indoor state and actual nearby features', () => {
  const daylight = selectSoundscape(location, day),
    nocturnal = selectSoundscape(location, night);
  assert.ok(daylight.birds > nocturnal.birds);
  assert.ok(nocturnal.insects > daylight.insects);
  assert.ok(selectSoundscape(location, dawn).birds > daylight.birds);
  assert.equal(daylight.water, 0);
  assert.equal(daylight.fire, 0);
  assert.ok(
    selectSoundscape(
      { ...location, featureDistances: { ...location.featureDistances, water: 1, fire: 1 } },
      day,
    ).water > 0,
  );
  const indoor = selectSoundscape({ ...location, interior: true }, day);
  assert.equal(indoor.insects, 0);
  assert.equal(indoor.birds, 0);
  assert.equal(indoor.leaves, 0);
  assert.ok(indoor.wind < daylight.wind);
  assert.equal(selectSoundscape({ ...location, temperature: -10 }, night).insects, 0);
  assert.equal(selectSoundscape({ ...location, biome: 'dunes' }, day).birds, 0);
});

test('settlement routines quiet work at night and favor tavern activity in the evening', () => {
  const town = { ...location, settlement: true };
  assert.ok(selectSoundscape(town, day).activity > selectSoundscape(town, night).activity);
  const inn = { ...town, interior: true, buildingKind: 'inn' as const };
  assert.ok(
    selectSoundscape(inn, worldTimeAt(11 * 60)).activity > selectSoundscape(inn, day).activity,
  );
});

test('seeded variation is repeatable, bounded and changes across days/cultures', () => {
  const frame = selectSoundscape(location, day, 0, 9123);
  for (let second = 0; second < 2400; second += 2) {
    const events = ambientEvents(frame, second);
    assert.deepEqual(events, ambientEvents(frame, second));
    assert.ok(events.length <= 2);
    assert.ok(
      events.every((event) => event.pan >= -0.8 && event.pan <= 0.8 && event.strength <= 1),
    );
  }
  assert.notEqual(
    frame.variationSeed,
    selectSoundscape(location, worldTimeAt(1500), 0, 9123).variationSeed,
  );
  assert.notEqual(atmosphereRandom(1, 5), atmosphereRandom(2, 5));
  assert.ok(
    AUDIO_LIMITS.transientVoices <= 48 &&
      AUDIO_LIMITS.ambienceVoices < AUDIO_LIMITS.transientVoices,
  );
});

test('voice ducking leaves effects separate and uses slow recovery to avoid pumping', () => {
  const active = voiceDuckLevels(true),
    inactive = voiceDuckLevels(false);
  assert.ok(active.music < active.ambience);
  assert.equal(inactive.music, 1);
  assert.ok(inactive.timeConstant > active.timeConstant * 5);
});

test('only bounded personal audio preferences persist, invalid and unavailable storage is harmless', () => {
  const normalized = normalizeAudioSettings({
    master: 2,
    music: -2,
    effects: NaN,
    ambience: '1',
    muted: true,
    audio: 'never',
  });
  assert.deepEqual(normalized, {
    master: 1,
    music: 0,
    effects: DEFAULT_AUDIO_SETTINGS.effects,
    ambience: DEFAULT_AUDIO_SETTINGS.ambience,
    muted: true,
  });
  let stored = '';
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  };
  assert.equal(writeAudioSettings(normalized, storage), true);
  assert.deepEqual(readAudioSettings(storage), normalized);
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), [
    'ambience',
    'effects',
    'master',
    'music',
    'muted',
  ]);
  assert.deepEqual(
    readAudioSettings({ ...storage, getItem: () => '{bad' }),
    DEFAULT_AUDIO_SETTINGS,
  );
  assert.equal(
    writeAudioSettings(normalized, {
      ...storage,
      setItem: () => {
        throw Error('blocked');
      },
    }),
    false,
  );
});
