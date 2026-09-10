import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Game,
  ISO_Y,
  OBSTACLES,
  PORTAL,
  SPAWN,
  distance,
  generateWeapon,
  isWalkable,
} from '../src/game.ts';
import type { Entity, InputState, SavedGame, Vec2 } from '../src/game.ts';

const idle: InputState = { x: 0, y: 0, running: false, aim: { x: 1000, y: 500 } };
function tick(game: Game, seconds: number, input: InputState = idle): void {
  for (let elapsed = 0; elapsed < seconds - 0.000001; elapsed += 1 / 60)
    game.update(Math.min(1 / 60, seconds - elapsed), input);
}
function at(game: Game, point: Vec2): void {
  game.state.player.x = point.x;
  game.state.player.y = point.y;
}
function entities(game: Game, kind: Entity['kind']): Entity[] {
  return game.state.entities.filter((entity) => entity.kind === kind);
}
function scanAll(game: Game): void {
  for (const species of entities(game, 'species')) {
    at(game, { x: species.x + 45, y: species.y });
    tick(game, 0.6);
    assert.equal(game.action('scan'), true);
  }
}
function extract(game: Game): void {
  at(game, PORTAL);
  assert.equal(game.interact(), true);
}
/** Drive real movement through a coarse navigation graph; do not teleport the host. */
function walkTo(game: Game, target: Vec2, reach = 65): void {
  const origin = { x: game.state.player.x, y: game.state.player.y };
  const nodes = [{ x: origin.x, y: origin.y, parent: -1, gridX: 0, gridY: 0 }];
  const visited = new Set(['0,0']);
  let end = -1;
  for (let head = 0; head < nodes.length && head < 10000; head++) {
    const node = nodes[head];
    if (distance(node, target) < reach) {
      end = head;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      const gridX = node.gridX + dx,
        gridY = node.gridY + dy;
      const key = `${gridX},${gridY}`;
      const next = {
        x: origin.x + gridX * 20,
        y: origin.y + gridY * 12,
        parent: head,
        gridX,
        gridY,
      };
      if (
        !visited.has(key) &&
        isWalkable(next, 18) &&
        isWalkable({ x: (next.x + node.x) / 2, y: (next.y + node.y) / 2 }, 18)
      ) {
        visited.add(key);
        nodes.push(next);
      }
    }
  }
  assert.notEqual(end, -1, `no route from ${JSON.stringify(origin)} to ${JSON.stringify(target)}`);
  const route: Vec2[] = [];
  for (let index = end; index !== -1; index = nodes[index].parent) route.unshift(nodes[index]);
  for (const waypoint of route.slice(1)) {
    for (let step = 0; distance(game.state.player, waypoint) > 2 && step < 180; step++) {
      const range = distance(game.state.player, waypoint);
      const input = {
        ...idle,
        x: (waypoint.x - game.state.player.x) / range,
        y: (waypoint.y - game.state.player.y) / ISO_Y / range,
      };
      game.update(Math.min(1 / 60, range / 180), input);
      assert.equal(game.state.phase, 'playing', 'host was lost during the movement-only route');
    }
    assert.ok(distance(game.state.player, waypoint) < 3, 'movement stalled on a waypoint');
  }
}
function toMission(game: Game, mission: number): void {
  while (game.state.mission < mission) {
    if (game.state.mission % 3 === 0) scanAll(game);
    else if (game.state.mission % 3 === 1) {
      for (const relay of entities(game, 'relay')) {
        at(game, { x: relay.x - 45, y: relay.y });
        assert.equal(game.interact(), true);
      }
    } else {
      const archivist = entities(game, 'survivor')[0];
      at(game, archivist);
      assert.equal(game.interact(), true);
      at(game, PORTAL);
      archivist.x = PORTAL.x + 40;
      archivist.y = PORTAL.y;
      tick(game, 0.1);
    }
    extract(game);
    assert.equal(game.nextMission(), true);
  }
}

test('the opening deployment is a peaceful, deterministic three-species survey', () => {
  const a = new Game('Sabino', 12345),
    b = new Game('Sabino', 12345);
  assert.deepEqual(a.serialize(), b.serialize());
  assert.equal(a.state.name, 'Sabino');
  assert.equal(a.state.entities.filter((entity) => entity.kind === 'species').length, 3);
  assert.equal(a.state.entities.filter((entity) => entity.kind === 'enemy').length, 1);
  assert.equal(a.state.entities.find((entity) => entity.kind === 'enemy')?.active, false);
  assert.deepEqual({ x: a.state.player.x, y: a.state.player.y }, SPAWN);
  tick(a, 20);
  assert.equal(a.state.player.hp, 100);
  assert.equal(a.state.integrity, 100);
  assert.equal(a.state.kills, 0);
});

test('movement is diagonal-normalized on the isometric ground plane', () => {
  const a = new Game(),
    b = new Game();
  tick(a, 0.3, { ...idle, x: 1 });
  tick(b, 0.3, { ...idle, x: 1, y: -1 });
  assert.ok(Math.abs(distance(a.state.player, SPAWN) - 54) < 0.01);
  assert.ok(Math.abs(distance(a.state.player, SPAWN) - distance(b.state.player, SPAWN)) < 0.01);
  assert.ok(b.state.player.y < SPAWN.y);
});

test('running is faster, drains energy, and recovers while stationary', () => {
  const game = new Game();
  tick(game, 0.3, { ...idle, x: 1, running: true });
  assert.ok(distance(game.state.player, SPAWN) > 80);
  assert.ok(game.state.player.stamina < 94);
  tick(game, 1);
  assert.equal(game.state.player.stamina, 100);
});

test('movement and dash cannot leave the island or tunnel through ruins', () => {
  const game = new Game();
  for (let i = 0; i < 1600; i++) {
    const angle = (Math.floor(i / 100) * Math.PI) / 4;
    const input = { ...idle, x: Math.cos(angle), y: Math.sin(angle), running: true };
    if (i % 60 === 0) game.action('dash');
    game.update(1 / 60, input);
    assert.ok(isWalkable(game.state.player), `player left valid ground at frame ${i}`);
  }
  at(game, { x: 560, y: 553 });
  game.state.player.stamina = 100;
  game.state.player.cooldowns.dash = 0;
  game.action('dash', { x: 700, y: 553 });
  tick(game, 0.25);
  assert.ok(game.state.player.x < 590, 'dash must stop at the west side of the pillar');
  assert.ok(distance(game.state.player, OBSTACLES[0]) >= OBSTACLES[0].radius + 12);
});

test('a long or invalid frame does not fast-forward the game', () => {
  const game = new Game();
  game.update(Infinity, idle);
  game.update(NaN, idle);
  game.update(-1, idle);
  assert.equal(game.state.time, 0);
  game.update(60, idle);
  assert.ok(Math.abs(game.state.time - 0.25) < 0.000001);
  game.update(0.1, { x: NaN, y: Infinity, running: false, aim: { x: NaN, y: NaN } });
  assert.ok(Number.isFinite(game.state.player.x));
});

test('scanning requires proximity and each lifeform grants only one catalog entry', () => {
  const game = new Game();
  assert.equal(game.action('scan'), false);
  const species = entities(game, 'species')[0];
  at(game, species);
  const before = game.state.player.fragments;
  assert.equal(game.action('scan'), true);
  assert.equal(game.state.catalog.length, 1);
  assert.equal(game.state.player.fragments, before + 1);
  tick(game, 1);
  assert.equal(game.action('scan'), false);
  assert.equal(game.state.catalog.length, 1);
  assert.equal(game.state.integrity, 100);
});

test('the survey can be completed without combat and requires extraction at the gate', () => {
  const game = new Game();
  at(game, PORTAL);
  assert.equal(game.interact(), false);
  scanAll(game);
  assert.equal(game.state.phase, 'playing');
  assert.equal(entities(game, 'portal')[0].active, true);
  assert.equal(game.state.kills, 0);
  assert.equal(game.state.integrity, 100);
  extract(game);
  assert.equal(game.state.phase, 'complete');
  assert.equal(game.state.history.length, 1);
  assert.equal(game.getDebrief().rating, 'LIGHT FOOTPRINT');
  assert.ok(game.getObjective().tasks.every((task) => task.done));
  assert.equal(game.interact(), false);
});

test('relay puzzle rejects incorrect order, resets progress, and cannot farm shards', () => {
  const game = new Game();
  toMission(game, 1);
  const relays = entities(game, 'relay');
  at(game, relays[1]);
  assert.equal(game.interact(), false);
  assert.equal(game.state.integrity, 98);
  assert.equal(game.state.relayErrors, 1);
  const before = game.state.player.fragments;
  at(game, relays[0]);
  assert.equal(game.interact(), true);
  assert.equal(game.state.player.fragments, before + 1);
  assert.ok(entities(game, 'enemy').every((entity) => entity.active));
  at(game, relays[2]);
  assert.equal(game.interact(), false);
  assert.deepEqual(game.state.relays, []);
  at(game, relays[0]);
  assert.equal(game.interact(), true);
  assert.equal(game.state.player.fragments, before + 1);
  at(game, relays[1]);
  assert.equal(game.interact(), true);
  at(game, relays[2]);
  assert.equal(game.interact(), true);
  assert.deepEqual(game.state.relays, [0, 1, 2]);
  assert.equal(entities(game, 'portal')[0].active, true);
  extract(game);
  assert.equal(game.state.phase, 'complete');
});

test('rescue requires contact and escort, then unlocks the corporate revelation', () => {
  const game = new Game();
  toMission(game, 2);
  const archivist = entities(game, 'survivor')[0];
  at(game, PORTAL);
  assert.equal(game.interact(), false);
  at(game, archivist);
  assert.equal(game.interact(), true);
  assert.equal(archivist.state, 'following');
  const before = { x: archivist.x, y: archivist.y };
  at(game, { x: archivist.x - 150, y: archivist.y - 20 });
  tick(game, 0.3);
  assert.ok(distance(archivist, before) > 20);
  at(game, PORTAL);
  assert.equal(game.interact(), false, 'the player alone cannot extract a distant survivor');
  archivist.x = PORTAL.x + 40;
  archivist.y = PORTAL.y;
  tick(game, 0.1);
  assert.equal(game.state.rescued, true);
  extract(game);
  assert.equal(game.state.phase, 'reveal');
  assert.equal(game.state.history.length, 3);
  assert.match(game.getDebrief().summary, /auctions changes/);
  assert.ok(game.drainEvents().some((event) => event.type === 'reveal'));
});

test('after the revelation the player can continue through seeded endless assignments', () => {
  const game = new Game('Traveler', 584);
  toMission(game, 3);
  assert.equal(game.state.endless, true);
  assert.equal(game.state.mission, 3);
  assert.match(game.state.missionTitle, /Unlicensed crossing/);
  assert.equal(game.state.catalog.length, 0);
  assert.equal(game.state.integrity, 100);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.nextMission(), false, 'cannot skip an unfinished assignment');
  toMission(game, 5);
  assert.equal(game.state.mission, 5);
  assert.equal(entities(game, 'survivor').length, 1);
});

test('the next world seed remembers the previous intervention footprint', () => {
  const a = new Game('A', 120),
    b = new Game('A', 120);
  scanAll(a);
  scanAll(b);
  b.state.integrity = 67;
  extract(a);
  extract(b);
  a.nextMission();
  b.nextMission();
  assert.notEqual(a.state.worldSeed, b.state.worldSeed);
  assert.notDeepEqual(
    entities(a, 'species').map((entity) => [entity.x, entity.y]),
    entities(b, 'species').map((entity) => [entity.x, entity.y]),
  );
});

test('blade attacks respect range, direction, cooldown, energy, and world consequences', () => {
  const game = new Game();
  const enemy = entities(game, 'enemy')[0];
  enemy.x = 850;
  enemy.y = 525;
  const firstHitHealth = enemy.hp! - game.state.weapon.bladeDamage;
  assert.equal(game.action('blade', enemy), true);
  assert.equal(enemy.hp, firstHitHealth);
  assert.equal(game.action('blade', enemy), false);
  tick(game, 0.4);
  assert.equal(game.action('blade', { x: 500, y: 525 }), true);
  assert.equal(enemy.hp, firstHitHealth, 'attacks behind the host must miss');
  tick(game, 0.4);
  game.action('blade', enemy);
  tick(game, 0.4);
  game.action('blade', enemy);
  assert.equal(enemy.state, 'dead');
  assert.equal(game.state.kills, 1);
  assert.equal(game.state.integrity, 88);
  tick(game, 1);
  game.state.player.stamina = 0;
  assert.equal(game.action('blade', enemy), false);
  assert.equal(game.action('pulse', enemy), false);
  assert.equal(game.action('dash'), false);
});

test('pulse projectiles can hit distant enemies and are removed on impact', () => {
  const game = new Game();
  const enemy = entities(game, 'enemy')[0];
  enemy.x = 990;
  enemy.y = 525;
  const health = enemy.hp!;
  assert.equal(game.action('pulse', enemy), true);
  assert.equal(game.state.projectiles.length, 1);
  tick(game, 0.4);
  assert.equal(enemy.hp, health - game.state.weapon.pulseDamage);
  assert.equal(game.state.projectiles.length, 0);
});

test('ancient ruins block pulse shots', () => {
  const game = new Game();
  at(game, { x: 540, y: 553 });
  const enemy = entities(game, 'enemy')[0];
  enemy.x = 710;
  enemy.y = 553;
  const health = enemy.hp!;
  game.action('pulse', enemy);
  tick(game, 0.2);
  assert.equal(enemy.hp, health);
  assert.equal(game.state.projectiles.length, 0);
});

test('destroying a survey lifeform is consequential but leaves a catalogable specimen', () => {
  const game = new Game();
  const species = entities(game, 'species')[0];
  at(game, { x: species.x - 55, y: species.y });
  game.action('blade', species);
  tick(game, 0.4);
  game.action('blade', species);
  assert.equal(species.state, 'dead');
  assert.equal(game.state.integrity, 80);
  assert.equal(game.action('scan'), true);
  assert.ok(game.state.catalog.includes(species.id));
  assert.ok(game.drainEvents().some((event) => event.text?.includes('from remains')));
});

test('enemy attacks telegraph before damage and dash provides evasion', () => {
  const game = new Game();
  const enemy = entities(game, 'enemy')[0];
  enemy.x = game.state.player.x + 45;
  enemy.y = game.state.player.y;
  enemy.timer = 0;
  game.state.player.invulnerable = 0;
  tick(game, 0.1);
  assert.equal(enemy.state, 'windup');
  assert.equal(game.state.player.hp, 100);
  game.action('dash', { x: 650, y: 525 });
  tick(game, 0.7);
  assert.equal(game.state.player.hp, 100);
  assert.ok(distance(game.state.player, enemy) > 70);
});

test('host death leaves belongings and reincarnation preserves the assignment and consequences', () => {
  const game = new Game();
  const species = entities(game, 'species')[0];
  at(game, species);
  game.action('scan');
  at(game, SPAWN);
  const enemy = entities(game, 'enemy')[0];
  enemy.x = SPAWN.x + 35;
  enemy.y = SPAWN.y;
  enemy.active = true;
  enemy.state = 'windup';
  enemy.timer = 0.01;
  game.state.player.hp = 5;
  game.state.player.invulnerable = 0;
  const shards = game.state.player.fragments;
  tick(game, 0.1);
  assert.equal(game.state.phase, 'dead');
  assert.equal(game.state.integrity, 92);
  assert.equal(game.state.player.fragments, 0);
  const drop = entities(game, 'drop')[0];
  assert.equal(drop.fragments, shards);
  const time = game.state.time;
  tick(game, 1);
  assert.equal(game.state.time, time, 'death pauses simulation');
  assert.equal(game.reincarnate(), true);
  assert.equal(game.state.player.vessel, 2);
  assert.equal(game.state.player.hp, 100);
  assert.equal(game.state.player.fragments, 0);
  assert.ok(game.state.catalog.includes(species.id));
  assert.equal(game.state.integrity, 92);
  at(game, drop);
  assert.equal(game.interact(), true);
  assert.equal(game.state.player.fragments, shards);
  assert.equal(entities(game, 'drop').length, 0);
  assert.equal(game.reincarnate(), false);
});

test('mending spends a finite memory shard and cannot exceed health or integrity caps', () => {
  const game = new Game();
  assert.equal(game.action('mend'), false, 'no cost when already whole');
  assert.equal(game.state.player.fragments, 2);
  game.state.player.hp = 83;
  game.state.integrity = 99;
  assert.equal(game.action('mend'), true);
  assert.equal(game.state.player.hp, 100);
  assert.equal(game.state.integrity, 100);
  assert.equal(game.state.player.fragments, 1);
  assert.equal(game.state.mends, 1);
  game.state.player.hp = 40;
  assert.equal(game.action('mend'), false, 'mend cooldown applies');
  tick(game, 3);
  assert.equal(game.action('mend'), true);
  assert.equal(game.state.player.hp, 68);
  assert.equal(game.state.player.fragments, 0);
  tick(game, 3);
  assert.equal(game.action('mend'), false);
});

test('save data is detached, restores progress, and resets transient simulation effects', () => {
  const game = new Game('Sabino', 42);
  scanAll(game);
  const saved = game.serialize();
  saved.state.player.hp = 77;
  assert.equal(game.state.player.hp, 100, 'saved data is not a mutable reference');
  const restored = Game.restore(JSON.stringify(saved));
  assert.equal(restored.state.name, 'Sabino');
  assert.equal(restored.state.player.hp, 77);
  assert.equal(restored.state.catalog.length, 3);
  assert.equal(restored.state.effects.length, 0);
  assert.equal(restored.state.projectiles.length, 0);
  assert.equal(entities(restored, 'portal')[0].active, true);
  extract(restored);
  assert.equal(restored.state.phase, 'complete');
});

test('malformed or incomplete saves fail safely', () => {
  for (const value of [
    undefined,
    null,
    '',
    'broken-json',
    {},
    { version: 2 },
    { version: 1, state: {} },
  ]) {
    assert.throws(() => Game.restore(value));
  }
  const game = new Game();
  const invalidPosition = game.serialize();
  invalidPosition.state.player.x = -99999;
  assert.throws(() => Game.restore(invalidPosition), /host is invalid/);
  const missingSpecies = game.serialize();
  missingSpecies.state.entities = missingSpecies.state.entities.filter(
    (entity) => entity.kind !== 'species',
  );
  assert.throws(() => Game.restore(missingSpecies), /missing required entities/);
  const invalidEntity = game.serialize();
  invalidEntity.state.entities[0].x = Infinity;
  assert.throws(() => Game.restore(invalidEntity), /invalid entities/);
  const completed = new Game();
  scanAll(completed);
  extract(completed);
  const invalidRecord = completed.serialize();
  invalidRecord.state.history[0].title = 14 as never;
  assert.throws(() => Game.restore(invalidRecord), /field record is invalid/);
  const invalidStats = game.serialize();
  invalidStats.state.missionStats = {} as never;
  assert.throws(() => Game.restore(invalidStats), /incomplete/);
  const invalidName = game.serialize();
  invalidName.state.entities[0].subtype = 14 as never;
  assert.throws(() => Game.restore(invalidName), /invalid entities/);
  const invalidFacing = game.serialize();
  invalidFacing.state.player.facing.x = 1e200;
  assert.throws(() => Game.restore(invalidFacing), /host is invalid/);
});

test('dead and completed crossings can be saved and resumed without losing their phase', () => {
  const game = new Game();
  scanAll(game);
  extract(game);
  const restored = Game.restore(game.serialize());
  assert.equal(restored.state.phase, 'complete');
  assert.equal(restored.nextMission(), true);
  restored.state.phase = 'dead';
  restored.state.player.hp = 0;
  const dead = Game.restore(restored.serialize());
  assert.equal(dead.state.phase, 'dead');
  assert.equal(dead.reincarnate(), true);
});

test('all objective locations have a route from the spawn on the collision mesh', () => {
  const game = new Game();
  toMission(game, 2);
  const targets = [
    ...entities(game, 'species'),
    ...entities(game, 'survivor'),
    ...entities(game, 'portal'),
    { x: 650, y: 410 },
    { x: 875, y: 590 },
    { x: 1230, y: 565 },
  ];
  const step = 20;
  const key = (point: Vec2) => `${point.x},${point.y}`;
  const queue: Vec2[] = [{ x: 800, y: 520 }];
  const visited = new Set([key(queue[0])]);
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    for (const [dx, dy] of [
      [step, 0],
      [-step, 0],
      [0, step * ISO_Y],
      [0, -step * ISO_Y],
    ]) {
      const next = { x: Math.round(point.x + dx), y: Math.round(point.y + dy) };
      if (!visited.has(key(next)) && isWalkable(next, 14)) {
        visited.add(key(next));
        queue.push(next);
      }
    }
  }
  for (const target of targets)
    assert.ok(
      queue.some((point) => distance(point, target) < 85),
      `no navigable interaction approach for ${JSON.stringify(target)}`,
    );
});

test('event queues drain once and repeated status messages are throttled', () => {
  const game = new Game();
  assert.ok(game.drainEvents().some((event) => event.type === 'deploy'));
  assert.deepEqual(game.drainEvents(), []);
  for (let i = 0; i < 100; i++) game.action('scan');
  assert.equal(game.drainEvents().filter((event) => event.type === 'message').length, 1);
});

test('the full opening survey is walkable with ordinary movement and no damage', () => {
  const game = new Game();
  for (const species of entities(game, 'species')) {
    walkTo(game, species);
    assert.equal(game.interact(), true);
  }
  walkTo(game, PORTAL);
  assert.equal(game.interact(), true);
  assert.equal(game.state.phase, 'complete');
  assert.equal(game.state.integrity, 100);
  assert.equal(game.state.player.hp, 100);
  assert.equal(game.state.kills, 0);
});

test('an ordinary movement route can align the lattice and escort the witness without kills', () => {
  const game = new Game();
  toMission(game, 1);
  for (const relay of entities(game, 'relay')) {
    walkTo(game, relay);
    assert.equal(game.interact(), true);
  }
  walkTo(game, PORTAL);
  assert.equal(game.interact(), true);
  game.nextMission();
  const archivist = entities(game, 'survivor')[0];
  walkTo(game, archivist);
  assert.equal(game.interact(), true);
  walkTo(game, PORTAL, 35);
  tick(game, 2);
  assert.equal(game.state.rescued, true, `archivist stalled at ${archivist.x},${archivist.y}`);
  assert.equal(game.interact(), true);
  assert.equal(game.state.phase, 'reveal');
  assert.equal(game.state.kills, 0);
});

test('the southern abyss is not ground, and ordinary movement stops at its moss lip', () => {
  const game = new Game();
  assert.equal(isWalkable({ x: 795, y: 699.6 }), false);
  assert.equal(isWalkable({ x: 825, y: 702 }), false);
  tick(game, 5, { ...idle, y: 1 });
  assert.ok(game.state.player.y <= 665, `host crossed the cleft lip at ${game.state.player.y}`);
  assert.ok(isWalkable(game.state.player));
  game.state.player.stamina = 100;
  game.action('dash', { x: 795, y: 760 });
  tick(game, 0.4);
  assert.ok(game.state.player.y <= 665, 'dash crossed the southern cleft');
});

test('saves from before the southern cleft fix relocate the host and belongings to solid ground', () => {
  const game = new Game();
  const saved = game.serialize();
  saved.state.player.x = 795;
  saved.state.player.y = 699.6;
  saved.state.entities.push({
    id: 'drop-legacy',
    kind: 'drop',
    x: 825,
    y: 702,
    radius: 18,
    fragments: 3,
    active: true,
  });
  const restored = Game.restore(saved);
  assert.ok(isWalkable(restored.state.player));
  assert.ok(distance(restored.state.player, { x: 795, y: 699.6 }) < 100);
  const drop = entities(restored, 'drop')[0];
  assert.ok(isWalkable(drop, 0));
  assert.equal(drop.fragments, 3);
  assert.ok(restored.drainEvents().some((event) => event.text?.includes('solid ground')));
  walkTo(restored, entities(restored, 'species')[0]);
  assert.equal(
    restored.interact(),
    true,
    'the migrated host must be able to continue its assignment',
  );
});

test('previous valid species anchor positions remain compatible with saved crossings', () => {
  const game = new Game();
  const saved = game.serialize();
  const old = [
    { x: 435, y: 625 },
    { x: 1090, y: 660 },
    { x: 490, y: 497 },
  ];
  saved.state.entities
    .filter((entity) => entity.kind === 'species')
    .forEach((entity, index) => Object.assign(entity, old[index]));
  const restored = Game.restore(saved);
  assert.deepEqual(
    entities(restored, 'species').map((entity) => ({ x: entity.x, y: entity.y })),
    old,
  );
  scanAll(restored);
  extract(restored);
  assert.equal(restored.state.phase, 'complete');
});

test('corrupt save fields that could break rendering, movement, or objectives are rejected', () => {
  const game = new Game();
  const corruptions: [string, (save: SavedGame) => void][] = [
    [
      'unsupported version',
      (save) => {
        (save as unknown as { version: number }).version = 999;
      },
    ],
    [
      'huge entity list',
      (save) => {
        save.state.entities = Array(201).fill(save.state.entities[0]);
      },
    ],
    [
      'duplicate IDs',
      (save) => {
        save.state.entities[1].id = save.state.entities[0].id;
      },
    ],
    [
      'duplicate species',
      (save) => {
        save.state.entities[1].subtype = save.state.entities[0].subtype;
      },
    ],
    [
      'species coordinate outside world',
      (save) => {
        save.state.entities[0].x = -1;
      },
    ],
    [
      'species coordinate in ruin',
      (save) => {
        Object.assign(save.state.entities[0], OBSTACLES[0]);
      },
    ],
    [
      'negative radius',
      (save) => {
        save.state.entities[0].radius = -1;
      },
    ],
    [
      'enormous radius',
      (save) => {
        save.state.entities[0].radius = 1e100;
      },
    ],
    [
      'invalid species hp',
      (save) => {
        save.state.entities[0].hp = 61;
      },
    ],
    [
      'dead species with live state',
      (save) => {
        save.state.entities[0].hp = 0;
      },
    ],
    [
      'invalid boolean',
      (save) => {
        save.state.entities[0].scanned = 'yes' as never;
      },
    ],
    [
      'missing species health',
      (save) => {
        delete save.state.entities[0].maxHp;
      },
    ],
    [
      'missing enemy health',
      (save) => {
        delete save.state.entities.find((entity) => entity.kind === 'enemy')!.hp;
      },
    ],
    [
      'missing enemy home',
      (save) => {
        delete save.state.entities.find((entity) => entity.kind === 'enemy')!.homeX;
      },
    ],
    [
      'invalid enemy state',
      (save) => {
        save.state.entities.find((entity) => entity.kind === 'enemy')!.state = 'broken';
      },
    ],
    [
      'invalid enemy timer',
      (save) => {
        save.state.entities.find((entity) => entity.kind === 'enemy')!.timer = 1e99;
      },
    ],
    [
      'displaced portal',
      (save) => {
        save.state.entities.find((entity) => entity.kind === 'portal')!.x = 700;
      },
    ],
    [
      'unscanned catalog entry',
      (save) => {
        save.state.catalog.push(save.state.entities[0].id);
      },
    ],
    [
      'oversized catalog',
      (save) => {
        save.state.catalog = Array(2000).fill('x');
      },
    ],
    [
      'false relay progress',
      (save) => {
        save.state.relays = [0];
      },
    ],
    [
      'invalid player health',
      (save) => {
        save.state.player.hp = 101;
      },
    ],
    [
      'negative player health',
      (save) => {
        save.state.player.hp = -5;
      },
    ],
    [
      'dead host without death phase',
      (save) => {
        save.state.player.hp = 0;
      },
    ],
    [
      'invalid player max health',
      (save) => {
        save.state.player.maxHp = 0;
      },
    ],
    [
      'invalid player energy',
      (save) => {
        save.state.player.stamina = 500;
      },
    ],
    [
      'invalid player cooldown',
      (save) => {
        save.state.player.cooldowns.blade = 1e100;
      },
    ],
    [
      'invalid player fragments',
      (save) => {
        save.state.player.fragments = -1;
      },
    ],
    [
      'huge facing vector',
      (save) => {
        save.state.player.facing.x = 1e100;
      },
    ],
    [
      'excessive elapsed time',
      (save) => {
        save.state.time = 1e100;
      },
    ],
    [
      'unbounded mission index',
      (save) => {
        save.state.mission = 1e100;
      },
    ],
    [
      'invalid integrity',
      (save) => {
        save.state.integrity = 101;
      },
    ],
    [
      'incomplete finished phase',
      (save) => {
        save.state.phase = 'complete';
      },
    ],
    [
      'missing transient arrays',
      (save) => {
        save.state.effects = null as never;
      },
    ],
    [
      'malformed projectile',
      (save) => {
        save.state.projectiles.push({ x: NaN } as never);
      },
    ],
    [
      'malformed effect',
      (save) => {
        save.state.effects.push({ x: 800, y: 500, radius: 1e100 } as never);
      },
    ],
    [
      'extra future history',
      (save) => {
        save.state.history.push({ title: 'Impossible future' } as never);
      },
    ],
  ];
  for (const [label, corrupt] of corruptions) {
    const saved = game.serialize();
    corrupt(saved);
    assert.throws(() => Game.restore(saved), undefined, label);
  }
  assert.throws(() => Game.restore(' '.repeat(1_000_001)), /too large/);
  assert.throws(
    () => Game.restore({ version: 1, state: { padding: 'x'.repeat(1_000_001) } }),
    /too large/,
  );
});

test('duplicate or impossible relay/witness progress cannot restore a softlocked assignment', () => {
  const game = new Game();
  toMission(game, 1);
  const duplicate = game.serialize();
  const relays = duplicate.state.entities.filter((entity) => entity.kind === 'relay');
  relays[1].order = relays[0].order;
  assert.throws(() => Game.restore(duplicate));
  const outOfOrder = game.serialize();
  outOfOrder.state.entities.filter((entity) => entity.kind === 'relay')[2].active = true;
  outOfOrder.state.relays = [2];
  assert.throws(() => Game.restore(outOfOrder), /progress is inconsistent/);
  toMission(game, 2);
  const impossibleRescue = game.serialize();
  impossibleRescue.state.rescued = true;
  assert.throws(() => Game.restore(impossibleRescue), /progress is inconsistent/);
  const missingWitness = game.serialize();
  missingWitness.state.entities = missingWitness.state.entities.filter(
    (entity) => entity.kind !== 'survivor',
  );
  assert.throws(() => Game.restore(missingWitness), /missing required entities/);
});

test('legitimate saves survive movement, live combat effects, every mission phase, and endless progression', () => {
  const game = new Game('Compatibility', 0xffffffff);
  const roundTrip = () => {
    const restored = Game.restore(game.serialize());
    assert.equal(restored.state.phase, game.state.phase);
    assert.equal(restored.state.mission, game.state.mission);
    assert.equal(restored.state.player.hp, game.state.player.hp);
    assert.equal(restored.state.integrity, game.state.integrity);
  };
  roundTrip();
  tick(game, 0.2, { ...idle, x: 0.4, y: -0.2 });
  roundTrip();
  game.action('pulse', { x: 1000, y: 490 });
  roundTrip();
  game.action('dash', { x: 780, y: 490 });
  roundTrip();
  game.state.player.hp = 40;
  game.state.integrity = 92;
  game.action('mend');
  roundTrip();
  tick(game, 0.5);
  scanAll(game);
  roundTrip();
  extract(game);
  roundTrip();
  game.nextMission();
  roundTrip();
  for (const relay of entities(game, 'relay')) {
    at(game, relay);
    game.interact();
    roundTrip();
  }
  extract(game);
  roundTrip();
  game.nextMission();
  roundTrip();
  const archivist = entities(game, 'survivor')[0];
  at(game, archivist);
  game.interact();
  roundTrip();
  archivist.x = PORTAL.x + 40;
  archivist.y = PORTAL.y;
  at(game, PORTAL);
  tick(game, 0.1);
  roundTrip();
  extract(game);
  roundTrip();
  game.nextMission();
  roundTrip();
  assert.equal(game.state.endless, true);
});

test('the first authored seed retains the original combat kit exactly', () => {
  const game = new Game('Baseline', 0x71a3);
  assert.deepEqual(game.state.weapon, {
    name: 'Riftglass sabre',
    family: 'sabre',
    color: '#9cf9ef',
    bladeDamage: 34,
    pulseDamage: 27,
    pulseRange: 775,
    bladeCooldown: 0.34,
    pulseCooldown: 0.36,
  });
  const enemy = entities(game, 'enemy')[0];
  enemy.x = 850;
  enemy.y = 525;
  game.action('blade', enemy);
  assert.equal(enemy.hp, 50);
  assert.equal(game.state.player.cooldowns.blade, 0.34);
  game.action('pulse', enemy);
  assert.equal(game.state.projectiles[0].damage, 27);
  assert.equal(game.state.projectiles[0].life, 1.25);
  assert.equal(game.state.player.cooldowns.pulse, 0.36);
});

test('seeded equipment is deterministic, varies meaningfully, and remains within combat balance bounds', () => {
  const profiles = new Set<string>(),
    families = new Set<string>();
  const baseline = generateWeapon(0x71a3);
  const numericFields = [
    'bladeDamage',
    'pulseDamage',
    'pulseRange',
    'bladeCooldown',
    'pulseCooldown',
  ] as const;
  for (let seed = 0; seed < 600; seed++) {
    const weapon = generateWeapon(seed);
    assert.deepEqual(weapon, generateWeapon(seed));
    profiles.add(JSON.stringify(numericFields.map((key) => weapon[key])));
    families.add(weapon.family);
    assert.match(weapon.color, /^#[0-9a-f]{6}$/);
    assert.ok(weapon.name.endsWith(weapon.family));
    for (const key of numericFields) {
      assert.ok(
        weapon[key] >= baseline[key] * 0.8 && weapon[key] <= baseline[key] * 1.2,
        `${key} for seed ${seed} exceeds ±20%`,
      );
    }
    for (const family of ['blade', 'pulse'] as const) {
      const dps = weapon[`${family}Damage`] / weapon[`${family}Cooldown`];
      const baselineDps = baseline[`${family}Damage`] / baseline[`${family}Cooldown`];
      assert.ok(
        dps >= baselineDps * 0.8 && dps <= baselineDps * 1.2,
        `seed ${seed} has imbalanced ${family} DPS`,
      );
    }
  }
  assert.equal(families.size, 3);
  assert.ok(
    profiles.size > 200,
    'seeds must produce meaningful stat variation, not only different names',
  );
  assert.notDeepEqual(generateWeapon(1), generateWeapon(2));
  const detached = generateWeapon(42);
  detached.bladeDamage = 999;
  assert.notEqual(generateWeapon(42).bladeDamage, 999, 'profiles must not share mutable templates');
});

test('each seeded kit controls actual attack damage and cooldown gates', () => {
  for (const seed of [1, 2, 3, 42, 93, 0x71a3]) {
    const game = new Game('Kit test', seed);
    const weapon = game.state.weapon;
    const enemy = entities(game, 'enemy')[0];
    enemy.x = 850;
    enemy.y = 525;
    enemy.hp = 1000;
    enemy.maxHp = 1000;
    assert.equal(game.action('blade', enemy), true);
    assert.equal(enemy.hp, 1000 - weapon.bladeDamage);
    assert.equal(game.state.player.cooldowns.blade, weapon.bladeCooldown);
    tick(game, weapon.bladeCooldown - 0.002);
    assert.equal(
      game.action('blade', enemy),
      false,
      'attack fired before the generated cooldown elapsed',
    );
    tick(game, 0.003);
    assert.equal(game.action('blade', enemy), true);
    assert.equal(enemy.hp, 1000 - weapon.bladeDamage * 2);
    assert.equal(game.action('pulse', enemy), true);
    assert.equal(game.state.projectiles[0].damage, weapon.pulseDamage);
    assert.equal(game.state.player.cooldowns.pulse, weapon.pulseCooldown);
    tick(game, weapon.pulseCooldown - 0.002);
    assert.equal(
      game.action('pulse', enemy),
      false,
      'pulse fired before the generated cooldown elapsed',
    );
    tick(game, 0.003);
    assert.equal(game.action('pulse', enemy), true);
  }
});

test('pulse lifetime and measured flight distance follow the seeded range without overshoot', () => {
  for (const seed of [1, 2, 3, 42, 93, 0x71a3]) {
    const game = new Game('Range test', seed);
    at(game, { x: 380, y: 470 });
    assert.equal(game.action('pulse', { x: 1300, y: 470 }), true);
    const projectile = game.state.projectiles[0];
    const muzzle = { x: projectile.x, y: projectile.y };
    assert.equal(projectile.life, game.state.weapon.pulseRange / 620);
    tick(game, projectile.life + 0.03);
    assert.equal(game.state.projectiles.length, 0);
    assert.ok(
      Math.abs(distance(muzzle, projectile) - game.state.weapon.pulseRange) < 0.001,
      `seed ${seed}: travelled ${distance(muzzle, projectile)} instead of ${game.state.weapon.pulseRange}`,
    );
  }
});

test('new worlds issue their deterministic kit while reincarnation keeps the current equipment', () => {
  const game = new Game('Traveler', 0x71a3);
  const first = structuredClone(game.state.weapon);
  toMission(game, 1);
  assert.deepEqual(game.state.weapon, generateWeapon(game.state.worldSeed));
  assert.notDeepEqual(game.state.weapon, first);
  const current = structuredClone(game.state.weapon);
  game.state.phase = 'dead';
  game.state.player.hp = 0;
  game.reincarnate();
  assert.deepEqual(game.state.weapon, current);
  game.newRun('Fresh', 0x71a3);
  assert.deepEqual(game.state.weapon, first);
});

test('older version 1 saves derive equipment without losing progress', () => {
  const game = new Game('Legacy kit', 93);
  toMission(game, 1);
  const relay = entities(game, 'relay')[0];
  at(game, relay);
  game.interact();
  const saved = game.serialize();
  delete (saved.state as unknown as { weapon?: unknown }).weapon;
  const restored = Game.restore(JSON.stringify(saved));
  assert.deepEqual(restored.state.weapon, generateWeapon(game.state.worldSeed));
  assert.equal(restored.state.mission, 1);
  assert.deepEqual(restored.state.relays, [0]);
  assert.equal(restored.state.player.fragments, game.state.player.fragments);
  assert.deepEqual(restored.serialize().state.weapon, restored.state.weapon);
});

test('present but forged or corrupt equipment profiles cannot enter the simulation', () => {
  const game = new Game('Gear validation', 42);
  const fields = Object.keys(game.state.weapon) as (keyof typeof game.state.weapon)[];
  for (const key of fields) {
    const saved = game.serialize();
    (saved.state.weapon as unknown as Record<string, unknown>)[key] =
      typeof saved.state.weapon[key] === 'number' ? 999999 : 'forged';
    assert.throws(() => Game.restore(saved), /equipment does not match/);
  }
  for (const corrupt of [null, [], {}, 'sabre', generateWeapon(1)]) {
    const saved = game.serialize();
    saved.state.weapon = corrupt as never;
    assert.throws(() => Game.restore(saved), /equipment does not match/);
  }
  const restored = Game.restore(game.serialize());
  assert.deepEqual(restored.state.weapon, game.state.weapon);
});
