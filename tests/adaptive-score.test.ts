import test from 'node:test';
import assert from 'node:assert/strict';
import { composePhrase, scoreTable, SCORE_LIMITS } from '../src/adaptive-score.ts';
import type { ScoreInstrument } from '../src/adaptive-score.ts';
import { animalCall, surfaceTexture, crowdAudibility } from '../src/semantic-audio.ts';
import { foleyGroup, planFoley } from '../src/foley.ts';
import { FOLEY_CLIPS } from '../src/foley-clips.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';
import { selectSoundscape, ambientEvents } from '../src/atmosphere.ts';
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
test('original phrases retain a question/answer and dominant-tonic cadence under deterministic variation', () => {
  for (let seed = 0; seed < 90; seed++) {
    const phrase = composePhrase(seed, 0, location, worldTimeAt(0));
    assert.deepEqual(phrase, composePhrase(seed, 0, location, worldTimeAt(0)));
    assert.deepEqual(phrase.harmony.slice(-2), [4, 0]);
    assert.ok(phrase.notes.some((n) => n.stem === 'melody' && n.beat < 16));
    assert.ok(phrase.notes.some((n) => n.stem === 'melody' && n.beat >= 16));
    const cadence = phrase.notes.filter((n) => n.stem === 'melody').at(-1)!;
    assert.equal((cadence.midi - phrase.root) % 12, 0);
    assert.ok(phrase.notes.length <= SCORE_LIMITS.notesPerPhrase);
    assert.ok(
      phrase.notes.every(
        (n) => n.beat >= 0 && n.beat < 32 && n.duration > 0 && Number.isFinite(n.gain),
      ),
    );
  }
});
test('five calendar identities change harmony, instrumentation, register, tempo and density', () => {
  const frames = [
    worldTimeAt(22 * 60),
    worldTimeAt(0),
    worldTimeAt(11 * 60),
    worldTimeAt(16 * 60),
    worldTimeAt(16 * 60),
  ];
  const phrases = frames.map((time, i) =>
    composePhrase(3886, 0, location, time, 0, { specialNight: i === 4 }),
  );
  assert.deepEqual(
    phrases.map((p) => p.identity),
    ['dawn', 'day', 'dusk', 'deep-night', 'special-night'],
  );
  assert.equal(new Set(phrases.map((p) => p.bpm)).size, 5);
  assert.ok(phrases[3].notes.length < phrases[1].notes.length);
  assert.ok(
    new Set(
      phrases.flatMap((p) => p.notes.filter((n) => n.stem === 'melody').map((n) => n.instrument)),
    ).size >= 4,
  );
  assert.notDeepEqual(phrases[0].notes, phrases[1].notes);
});
test('town services, dungeon depth, faction identity, victory and weather are semantic score inputs', () => {
  const day = worldTimeAt(0),
    base = composePhrase(1, 0, location, day);
  const tavern = composePhrase(1, 0, { ...location, interior: true, buildingKind: 'inn' }, day);
  const temple = composePhrase(1, 0, { ...location, interior: true, buildingKind: 'church' }, day);
  const deep = composePhrase(1, 0, location, day, 0, { dungeonDepth: 7 });
  assert.ok(tavern.bpm > temple.bpm);
  assert.ok(temple.notes.some((n) => n.stem === 'harmony' && n.instrument === 'organ'));
  assert.equal(deep.zone, 'dungeon');
  assert.ok(deep.bpm < base.bpm);
  assert.notEqual(composePhrase(1, 0, location, day, 0, { factionId: 'guild-a' }).seed, base.seed);
  assert.ok(
    composePhrase(1, 0, location, day, 0, { victory: true }).notes.some(
      (n) => n.stem === 'response',
    ),
  );
  assert.ok(
    composePhrase(1, 0, { ...location, weather: 'rain' }, day).notes[0].gain < base.notes[0].gain,
  );
  assert.ok(
    composePhrase(NaN, NaN, location, day, NaN, { dungeonDepth: NaN }).notes.every((n) =>
      Number.isFinite(n.midi),
    ),
  );
});
test('seven bounded original instrument tables and material textures are finite, quiet at boundaries and distinct', () => {
  const instruments: ScoreInstrument[] = [
    'flute',
    'reed',
    'bowed',
    'organ',
    'bass',
    'drum',
    'brush',
  ];
  for (const name of instruments) {
    const table = scoreTable(name);
    assert.equal(table.length, 512);
    assert.ok(table.every((n) => Number.isFinite(n) && Math.abs(n) <= 1));
  }
  const materials = [
    'grass',
    'dirt',
    'gravel',
    'stone',
    'wood',
    'metal',
    'sand',
    'snow',
    'wet-earth',
    'mud',
    'water',
    'puddle',
  ] as const;
  const signatures = new Set();
  for (const material of materials) {
    const data = surfaceTexture(material);
    assert.deepEqual(data, surfaceTexture(material));
    assert.notDeepEqual(data, surfaceTexture(material, 1));
    assert.ok(data.every((n) => Number.isFinite(n) && Math.abs(n) <= 1));
    assert.ok(Math.abs(data[0]) < 0.001 && Math.abs(data.at(-1)!) < 0.001);
    signatures.add(data.slice(10, 30).join(','));
    assert.ok(FOLEY_CLIPS[foleyGroup({ kind: 'footstep', material })]);
  }
  assert.equal(signatures.size, materials.length);
  const boot = planFoley({ kind: 'footstep', material: 'stone', footwear: 'boot' }, 0, 1)!;
  const barefoot = planFoley({ kind: 'footstep', material: 'stone', footwear: 'bare' }, 0, 1)!;
  assert.ok(barefoot.gain < boot.gain);
  assert.equal(
    planFoley({ kind: 'footstep', material: 'grass', moisture: 1 }, 0, 1)!.texture,
    'wet-earth',
  );
});
test('species and behavioral calls differ and remain strictly bounded; no sleeping or phantom crowd', () => {
  for (const species of ['bird', 'grazer', 'boar', 'wolf'] as const) {
    const calm = animalCall(species),
      urgent = animalCall(species, 'flee');
    assert.notDeepEqual(calm, urgent);
    assert.ok(animalCall(species, 'hurt').length < calm.length);
    assert.notDeepEqual(animalCall(species, 'hurt'), animalCall(species, 'death'));
    assert.deepEqual(calm, animalCall(species));
    assert.ok(calm.length <= 20800);
    assert.ok(calm.every((n) => Number.isFinite(n) && Math.abs(n) < 1));
  }
  assert.equal(crowdAudibility(0, 1, 12, false), 0);
  assert.equal(crowdAudibility(10, 1, 3, false), 0);
  assert.equal(crowdAudibility(10, 14, 12, false), 0);
  assert.ok(crowdAudibility(10, 2, 20, true) > crowdAudibility(3, 7, 20, true));
  for (const buildingKind of ['inn', 'church', 'house'] as const) {
    const frame = selectSoundscape(
      { ...location, interior: true, buildingKind },
      worldTimeAt(11 * 60),
    );
    for (let time = 0; time < 3000; time += 2)
      assert.ok(!ambientEvents(frame, time).some((e) => e.kind === 'social'));
  }
});
