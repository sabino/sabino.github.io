import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorldAudioSampler,
  sampleWorldAudio,
  underworldOcclusion,
  type WorldAudioSource,
} from '../src/stichos/experience.ts';
import { selectSoundscape } from '../src/atmosphere.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';
import { generateUnderworld, type UnderworldFrame } from '../src/stichos/underworld.ts';
import { underworldLocationAt } from '../src/stichos/world-signals.ts';

function fixture() {
  let surfaceReads = 0;
  const source = {
    world: {
      tile: () => {
        surfaceReads++;
        return {
          biome: 'settlement',
          terrain: 'floor',
          temperature: 12,
          building: 'home:real',
          buildingKind: 'house',
        };
      },
      propsAround: () => [],
    },
    player: { x: 4, y: 4, heading: 0 },
    removed: new Set<string>(),
    spaceId: 'surface',
    underworldFrame: null as UnderworldFrame | null,
    usesLivingSystems: true,
    livingSystemsFrame: {
      location: { spaceId: 'surface', x: 4, y: 4 },
      economy: { satchel: { actorId: 'alice' } },
      elapsed: 10,
      actors: [1, 2, 3].map((id) => ({
        id: `resident:${id}`,
        x: 4 + id,
        y: 4,
        hp: 10,
        hostile: false,
        seed: id,
        role: 'botanist',
        clan: 'Bishop',
      })),
      guards: [] as Array<{ targetId: string; state: string }>,
      reputation: { attitude: 'welcoming', knownActions: 3 },
      factions: [{ id: 'local' }],
      memberships: [
        { actorId: 'alice', factionId: 'distant', status: 'member', rank: 4, standing: 50 },
        { actorId: 'alice', factionId: 'local', status: 'member', rank: 1, standing: 10 },
        { actorId: 'bob', factionId: 'other-person', status: 'member', rank: 9, standing: 90 },
      ],
      property: {
        estates: [
          {
            id: 'home:real',
            ownerId: 'alice',
            tenure: 'owned',
            leaseUntil: 100,
            offer: { id: 'home:real', kind: 'home', entrance: { spaceId: 'surface', x: 4, y: 4 } },
            stations: [
              {
                id: 'mill',
                spaceId: 'surface',
                x: 5,
                y: 4,
                workingSeconds: 10,
                workerId: 'resident:1',
                job: { wageFunded: true },
              },
            ],
          },
        ],
        workers: [
          { id: 'resident:1', phase: 'working', address: { spaceId: 'surface', x: 5, y: 4 } },
        ],
      },
      home: { spaceId: 'surface', x: 4, y: 4 },
    },
    npcs: [{ id: 'phantom', hp: 10, hostile: false, x: 4, y: 4 }],
    residentActivities: new Map(
      [1, 2, 3].map((id) => [
        `resident:${id}`,
        {
          activity: 'work',
          target: { x: 4 + id, y: 4 },
          reason: 'At work',
        },
      ]),
    ),
    fauna: [
      { id: 'bird', kind: 'bird', dangerous: false, activity: 'idle', call: true, x: 4, y: 4 },
    ],
    worldTime: worldTimeAt(0),
    progression: { homes: [{ x: 4, y: 4 }] },
    productionStructures: [{ x: 4, y: 4, phase: 'working' }],
  };
  return {
    source,
    read: () => source as unknown as WorldAudioSource,
    surfaceReads: () => surfaceReads,
  };
}
function floor(): UnderworldFrame {
  const plan = generateUnderworld(531, 'test:town', 0);
  return {
    plan,
    state: {
      spaceId: plan.spaceId,
      enemies: [],
      opened: [],
      rescued: [],
      discovered: [],
      puzzle: 0,
    },
    projectiles: [],
    time: 10,
  };
}

test('underground audio never samples surface coordinates or emits stale wildlife/crowds', () => {
  const f = fixture();
  f.source.underworldFrame = floor();
  f.source.spaceId = f.source.underworldFrame.plan.spaceId;
  const sampled = sampleWorldAudio(f.read());
  assert.equal(f.surfaceReads(), 0);
  assert.deepEqual(sampled.events, []);
  assert.equal(sampled.location.interior, true);
  assert.equal(sampled.location.biome, 'underground');
  assert.equal(sampled.location.audioContext?.dungeonDepth, 1);
  assert.equal(sampled.location.audioContext?.home, false);
  assert.equal(sampled.location.audioContext?.population, 0);
  assert.equal(sampled.location.audioContext?.production, 0);
  assert.equal(sampled.location.audioContext?.specialNight, undefined);
  const sound = selectSoundscape(sampled.location, f.source.worldTime);
  assert.equal(sound.birds, 0);
  assert.equal(sound.water, 0);
  assert.equal(sound.crowd, 0);
  assert.equal(sound.insects, 0);
  f.source.spaceId = 'another:floor';
  assert.equal(
    sampleWorldAudio(f.read()).location.audioContext?.dungeonDepth,
    undefined,
    'an old floor frame must not describe a new coordinate space',
  );
});

test('missing transitional floor data remains an honest quiet interior', () => {
  const location = underworldLocationAt(undefined, { x: 0, y: 0 });
  assert.equal(location.audioContext?.dungeonDepth, undefined);
  assert.equal(location.featureDistances.water, Infinity);
  assert.equal(location.weather, 'clear');
  const plan = floor().plan;
  const hearth = plan.features.find((f) => f.kind === 'rest')!;
  assert.equal(underworldLocationAt(plan, hearth).featureDistances.fire, 0);
});

test('score context uses actual active membership and local, identified reputation', () => {
  const f = fixture();
  let context = sampleWorldAudio(f.read()).location.audioContext!;
  assert.equal(context.factionId, 'local');
  assert.equal(context.reputation, 'trusted');
  f.source.livingSystemsFrame.guards.push({ targetId: 'bob', state: 'pursue' });
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.reputation, 'trusted');
  f.source.livingSystemsFrame.guards.push({ targetId: 'alice', state: 'arrest' });
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.reputation, 'wanted');
  f.source.livingSystemsFrame.guards = [];
  f.source.livingSystemsFrame.reputation.attitude = 'afraid';
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.reputation, 'feared');
  f.source.livingSystemsFrame.memberships[1].status = 'expelled';
  context = sampleWorldAudio(f.read()).location.audioContext!;
  assert.equal(context.factionId, 'distant');
});

test('home cues require owned/active property, not old home coordinates or another owner', () => {
  const f = fixture();
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.home, true);
  const estate = f.source.livingSystemsFrame.property.estates[0];
  estate.ownerId = 'bob';
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.home, false);
  estate.ownerId = 'alice';
  estate.tenure = 'rented';
  estate.leaseUntil = 5;
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.home, false);
  estate.leaseUntil = 20;
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.home, true);
});

test('production score follows measured staffed progress and stops for idle, distant or off-space workers', () => {
  const f = fixture(),
    counters = new Map<string, number>();
  const station = f.source.livingSystemsFrame.property.estates[0].stations[0];
  const worker = f.source.livingSystemsFrame.property.workers[0];
  const production = () => sampleWorldAudio(f.read(), counters).location.audioContext?.production;
  assert.equal(production(), 0, 'queue is not activity');
  station.workingSeconds++;
  assert.equal(production(), 1);
  assert.equal(production(), 0, 'blocked/off-shift counters stop');
  station.workingSeconds++;
  worker.phase = 'carrying-output';
  assert.equal(production(), 0);
  station.workingSeconds++;
  worker.phase = 'working';
  worker.address.x = 30;
  assert.equal(production(), 0);
  station.workingSeconds++;
  worker.address.x = 5;
  worker.address.spaceId = 'another-floor';
  assert.equal(production(), 0);
});

test('crowds require current authority actor, arrival and matching time schedule', () => {
  const f = fixture();
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.population, 3);
  f.source.livingSystemsFrame.actors[0].x = 10;
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.population, 2, 'travelling actor');
  f.source.livingSystemsFrame.actors.pop();
  assert.equal(sampleWorldAudio(f.read()).location.audioContext?.population, 1, 'missing actor');
  f.source.worldTime = worldTimeAt(18 * 60);
  assert.equal(
    sampleWorldAudio(f.read()).location.audioContext?.population,
    0,
    'stale daytime routine',
  );
});

test('audio sampler is bounded, refreshes immediately on space/life change and cannot emit after dispose', () => {
  const f = fixture();
  let current = f.read();
  let samples = 0,
    emitted = 0;
  const sampler = createWorldAudioSampler(() => current, {
    setEnvironment: () => {
      samples++;
    },
    playWorldEvent: () => {
      emitted++;
    },
  });
  sampler.update(0);
  sampler.update(1);
  sampler.update(499);
  assert.equal(samples, 1);
  f.source.spaceId = 'underworld:transition';
  sampler.update(100);
  assert.equal(samples, 2);
  assert.equal(sampler.location?.interior, true);
  const before = emitted;
  sampler.update(600);
  assert.equal(emitted, before);
  sampler.invalidate();
  sampler.update(601);
  assert.equal(samples, 4);
  current = fixture().read();
  sampler.update(602);
  assert.equal(samples, 5);
  sampler.dispose();
  sampler.update(9999);
  assert.equal(samples, 5);
  assert.equal(sampler.location, undefined);
});

test('voice occlusion uses cached dungeon walls and live gate opening, bounded and without terrain generation', () => {
  const f = floor();
  f.plan.width = 8;
  f.plan.height = 3;
  f.plan.cells = Array(24).fill(1);
  f.plan.features = [{ id: 'gate', kind: 'gate', x: 3, y: 1, name: 'Gate', description: 'Closed' }];
  const from = { x: 1, y: 1 },
    to = { x: 6, y: 1 };
  assert.equal(underworldOcclusion(f, from, to), 0.22);
  f.state.opened.push('gate');
  assert.equal(underworldOcclusion(f, from, to), 0);
  f.plan.cells[1 * 8 + 4] = 0;
  assert.equal(underworldOcclusion(f, from, to), 0.34);
  assert.equal(underworldOcclusion(f, { x: NaN, y: 0 }, to), 0);
  assert.equal(underworldOcclusion(f, from, { x: 100, y: 1 }), 0);
  assert.equal(underworldOcclusion(null, from, to), 0);
});
