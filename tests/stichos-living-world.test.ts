import test from 'node:test';
import assert from 'node:assert/strict';
import { worldTimeAt, roomWorldSeconds, WORLD_DAY_SECONDS } from '../src/stichos/world-time.ts';
import { worldLocationAt } from '../src/stichos/world-signals.ts';
import {
  LivingWorld,
  faunaHabitat,
  faunaActive,
  faunaContacts,
  validFaunaFrame,
  FAUNA_MAX_ACTORS,
  type FaunaWorld,
} from '../src/stichos/living-world.ts';
import {
  NpcSociety,
  npcPersonality,
  npcSchedule,
  validSocietySave,
  NPC_MEMORY_LIMIT,
} from '../src/stichos/npc-society.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { Stichos } from '../src/stichos/session.ts';
import { SharedCombat } from '../src/stichos/shared-combat.ts';
import type { Npc, Tile, Biome } from '../src/stichos/types.ts';

const tile = (x: number, y: number, biome: Biome = 'woodland'): Tile => ({
  x,
  y,
  seed: 1,
  terrain: 'grass',
  biome,
  height: 0,
  temperature: 18,
  detail: 0,
});
const flat = (seed = 1): FaunaWorld => ({ seed, tile: (x, y) => tile(x, y), blocked: () => false });
const resident = (id = 'resident:a', role: Npc['role'] = 'botanist'): Npc => ({
  id,
  seed: 123,
  role,
  name: 'Ari',
  clan: 1,
  x: 0,
  y: 0,
  home: { x: 0, y: 0 },
  maxHp: 100,
  hp: 100,
  speed: 1.5,
  heading: 0,
  phase: 0,
  hostile: false,
  cooldown: 0,
  appearance: {
    seed: 1,
    skin: '#b89976',
    hair: '#332211',
    coat: '#557766',
    trim: '#88aabb',
    trousers: '#334455',
    height: 1,
    build: 1,
    hairStyle: 1,
    hat: 0,
    cloak: false,
    weapon: 'none',
  },
});

test('shared calendar has a smooth 24-minute day and stable epoch independent of device clocks', () => {
  assert.equal(worldTimeAt(0).label, 'Day 1 · 08:00');
  assert.equal(worldTimeAt(WORLD_DAY_SECONDS).label, 'Day 2 · 08:00');
  assert.equal(worldTimeAt(600).phase, 'dusk');
  assert.equal(worldTimeAt(840).phase, 'night');
  assert.equal(worldTimeAt(240).daylight, 1);
  assert.equal(worldTimeAt(840).daylight, 0);
  for (let n = 0; n < 1440; n++)
    assert.ok(Math.abs(worldTimeAt(n + 1).daylight - worldTimeAt(n).daylight) < 0.02);
  assert.equal(roomWorldSeconds(1000, 61000), 60);
  assert.equal(roomWorldSeconds(1000, 0), 0);
  assert.deepEqual(worldTimeAt(NaN), worldTimeAt(0));
});

test('location signals distinguish interiors and only report real nearby ecology', () => {
  let probes = 0;
  const world = {
    tile: (x: number, y: number) => {
      probes++;
      return x === 2
        ? { ...tile(x, y), terrain: 'water' as const }
        : {
            ...tile(x, y),
            terrain: 'floor' as const,
            building: 'town:inn',
            buildingKind: 'inn' as const,
          };
    },
    propsAround: () => [
      { id: 'tree', seed: 1, x: 3, y: 0, solid: true, kind: 'pine' as const, name: 'tree' },
    ],
  };
  const location = worldLocationAt(world, { x: 0, y: 0 });
  assert.equal(location.interior, true);
  assert.equal(location.buildingKind, 'inn');
  assert.equal(location.featureDistances.water, 2);
  assert.equal(location.featureDistances.trees, 3);
  assert.equal(location.featureDistances.fire, Infinity);
  assert.equal(location.weather, 'clear');
  assert.equal(probes, 50);
  assert.equal(
    worldLocationAt(world, { x: 0, y: 0 }, new Set(['tree'])).featureDistances.trees,
    Infinity,
  );
});

test('ecology excludes settled floors and volcanic terrain and respects bird roosting', () => {
  for (const kind of ['bird', 'grazer', 'boar', 'wolf'] as const) {
    assert.equal(faunaHabitat('settlement', kind), false);
    assert.equal(faunaHabitat('volcanic', kind), false);
  }
  assert.equal(faunaHabitat('wetland', 'boar'), true);
  assert.equal(faunaHabitat('dunes', 'grazer'), false);
  assert.equal(faunaActive('bird', worldTimeAt(840)), false);
  const world = {
    ...flat(),
    tile: (x: number, y: number) => ({
      ...tile(x, y),
      terrain: 'floor' as const,
      building: 'house',
    }),
  };
  assert.equal(
    new LivingWorld().sample(world, worldTimeAt(0), [{ id: 'p', x: 0, y: 0 }]).actors.length,
    0,
  );
});

test('fauna replay is identical across observer order, streaming and a fresh process', () => {
  const observers = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 7, y: 4 },
    ],
    world = flat();
  const living = new LivingWorld(),
    time = worldTimeAt(100);
  const a = living.sample(world, time, observers);
  assert.ok(a.actors.length > 3);
  assert.ok(a.actors.length <= FAUNA_MAX_ACTORS);
  living.sample(world, worldTimeAt(500), [{ id: 'far', x: 10000, y: -10000 }]);
  assert.deepEqual(a, new LivingWorld().sample(world, time, [...observers].reverse()));
  assert.deepEqual(a, living.sample(world, time, observers));
  assert.equal(validFaunaFrame(a), true);
  assert.equal(validFaunaFrame({ ...a, actors: [...a.actors, a.actors[0]] }), false);
  assert.equal(validFaunaFrame({ ...a, actors: [{ ...a.actors[0], x: NaN }] }), false);
});

test('passive animals flee close approaches and predators telegraph bounded contact', () => {
  const world = flat(),
    living = new LivingWorld(),
    t = worldTimeAt(840);
  const initial = living.sample(world, t, [{ id: 'scout', x: 0, y: 0 }]);
  const prey = initial.actors.find((a) => a.kind === 'grazer')!;
  assert.ok(prey);
  const approached = living.sample(world, t, [{ id: 'scout', x: prey.x + 0.5, y: prey.y }]);
  assert.equal(approached.actors.find((a) => a.id === prey.id)?.activity, 'flee');
  const wolf = initial.actors.find((a) => a.kind === 'wolf')!;
  assert.ok(wolf);
  const point = { id: 'scout', x: wolf.home.x + 2, y: wolf.home.y };
  let contacts = 0,
    stalked = false;
  for (let offset = 0; offset < 5; offset += 0.1) {
    const frame = living.sample(world, worldTimeAt(840 + offset), [point]);
    stalked ||= frame.actors.some((a) => a.id === wolf.id && a.activity === 'stalk');
    contacts += faunaContacts(frame, [point]).length;
  }
  assert.ok(stalked);
  assert.ok(contacts > 0);
  const ward = living.sample(world, t, [{ ...point, ward: true }]);
  assert.equal(ward.actors.find((a) => a.id === wolf.id)?.activity, 'flee');
});

test('terrain barriers prevent wildlife pursuit through buildings', () => {
  const world = flat(),
    living = new LivingWorld();
  const initial = living.sample(world, worldTimeAt(840), [{ id: 'p', x: 0, y: 0 }]);
  const wolf = initial.actors.find((a) => a.kind === 'wolf')!;
  const barrier = wolf.home.x + 0.8;
  const wallWorld = {
    ...world,
    tile: (x: number, y: number) =>
      x > barrier ? { ...tile(x, y), terrain: 'wall' as const, building: 'wall' } : tile(x, y),
    blocked: (x: number) => x > barrier,
  };
  const point = { id: 'p', x: wolf.home.x + 3, y: wolf.home.y };
  const frame = living.sample(wallWorld, worldTimeAt(843), [point]);
  assert.equal(faunaContacts(frame, [point]).length, 0);
});

test('personality stays individual and schedule follows role, time and concrete warnings', () => {
  const npc = resident(),
    p = npcPersonality(npc);
  assert.deepEqual(p, npcPersonality(npc));
  assert.notDeepEqual(p, npcPersonality({ ...npc, seed: 991 }));
  assert.equal(npcSchedule(npc, p, worldTimeAt(900)), 'rest');
  assert.equal(npcSchedule(npc, p, worldTimeAt(100), true), 'shelter');
  assert.equal(npcSchedule(resident('guard', 'guard'), p, worldTimeAt(100), true), 'patrol');
  const society = new NpcSociety();
  society.remember(npc, 'gift', worldTimeAt(1));
  assert.ok(society.memory(npc.id).trust > 0);
  assert.equal(society.memory(npc.id).lastGiftDay, 1);
  assert.match(society.describe(npc, worldTimeAt(2)), /remember your help/);
  society.remember(npc, 'threat', worldTimeAt(3));
  assert.ok(society.memory(npc.id).trust < 0);
  assert.deepEqual(new NpcSociety(society.save()).save(), society.save());
});

test('resident communication spreads a warning that changes neighbor behavior with cooldowns', () => {
  const a = resident('a'),
    b = { ...resident('b'), x: 1 },
    c = { ...resident('c'), x: 2 };
  const society = new NpcSociety(),
    time = worldTimeAt(100);
  society.remember(a, 'warning', time);
  const messages = society.communicate([a, b, c], time);
  assert.ok(messages.length > 0 && messages.length <= 2);
  assert.equal(society.memory('b').heardFrom, 'a');
  assert.equal(
    npcSchedule(b, society.personality(b), time, society.memory('b').alarmUntil > 100),
    'shelter',
  );
  assert.equal(society.communicate([a, b, c], worldTimeAt(101)).length, 0);
  assert.equal(society.communicate([a, b, c], worldTimeAt(1000)).length, 0);
});

test('resident persistence is bounded and rejects malformed memories', () => {
  const society = new NpcSociety();
  for (let i = 0; i < 400; i++) society.converse(resident(`r${i}`));
  assert.equal(society.save().memories.length, NPC_MEMORY_LIMIT);
  assert.equal(validSocietySave(society.save()), true);
  assert.throws(() => new NpcSociety({ version: 1, memories: [{ id: 'x', trust: Infinity }] }));
});

test('resident routines finish multi-waypoint paths instead of stopping before the first waypoint', () => {
  const game = new Stichos(19, 4) as any;
  const npc = resident();
  game.phase = 'playing';
  game.npcs = [npc];
  game.player.x = -10;
  game.player.y = -10;
  game.world.blocked = () => false;
  const points = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
  ];
  game.residentPaths.set(npc.id, { points, target: { x: 3, y: 1 } });
  game.residentRoutines.set(npc.id, { activity: 'socialize', target: { x: 3, y: 1 } });
  for (let i = 0; i < 600; i++) game.updateNpcs(1 / 60);
  assert.equal(points.length, 0);
  assert.ok(Math.hypot(npc.x - 3, npc.y - 1) < 0.5);
});
test('save migration preserves lived time without regenerating worlds and shared frames never cause local damage', () => {
  const game = new Stichos(19, 4);
  game.applyWorldClock(900);
  game.update(0.1, { x: 0, y: 0 });
  const saved = game.save();
  assert.ok(saved.worldElapsed >= 900);
  assert.equal(Stichos.restore(saved).worldTime.label, game.worldTime.label);
  const old = { ...saved };
  delete (old as Partial<typeof old>).worldElapsed;
  delete (old as Partial<typeof old>).society;
  delete (old as Partial<typeof old>).wildlifeNotes;
  const legacy = Stichos.restore(old);
  assert.equal(legacy.worldTime.elapsedSeconds, old.time);
  const frame = new LivingWorld().sample(flat(), worldTimeAt(840), [{ id: '$player', x: 0, y: 0 }]);
  const hp = game.player.hp;
  assert.equal(game.applyLivingWorldFrame(frame), true);
  game.update(0.1, { x: 0, y: 0 });
  assert.equal(game.player.hp, hp);
  assert.equal(JSON.stringify(game.save()).includes('fauna:1:'), false);
});

test('living overlays leave generation-one terrain and inhabitants unchanged', () => {
  const world = new InfiniteWorld(51, 1),
    before = JSON.stringify(world.chunk(1, 1));
  new LivingWorld().sample(world, worldTimeAt(840), [{ id: 'p', x: 20, y: 20 }]);
  assert.equal(JSON.stringify(world.chunk(1, 1)), before);
});

test('trusted environmental contacts reuse combat activation and ward protection', () => {
  const world = new InfiniteWorld(1, 4),
    combat = new SharedCombat(world, new Set(), { now: () => 10000 });
  const inactive = {
    id: 'p',
    x: 0,
    y: 5,
    heading: 0,
    appearance: resident().appearance,
    combatActive: false,
  };
  assert.equal(
    combat.environmentalContacts([{ actorId: 'fauna:1:0:0:0', peer: inactive, damage: 5 }]).hits
      .length,
    0,
  );
  assert.equal(
    combat.environmentalContacts([
      { actorId: 'forged', peer: { ...inactive, combatActive: true }, damage: 5 },
    ]).hits.length,
    0,
  );
  assert.equal(
    combat.environmentalContacts([
      { actorId: 'fauna:1:0:0:0', peer: { ...inactive, combatActive: true }, damage: 999 },
    ]).hits.length,
    0,
  );
  const active = { ...inactive, combatActive: true };
  const ward = combat.attack(active, 0, 'ward');
  assert.equal(ward.ok, true);
  assert.equal(combat.wardActive(active.id), true);
  assert.equal(
    combat.environmentalContacts([{ actorId: 'fauna:1:0:0:0', peer: active, damage: 5 }]).hits
      .length,
    0,
  );
});
