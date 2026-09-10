import test from 'node:test';
import assert from 'node:assert/strict';
import { Crossing } from '../src/procedural/session.ts';
import { generateSpecies } from '../src/procedural/compose.ts';
import { tileAt } from '../src/procedural/world.ts';
import type { Tile } from '../src/procedural/world.ts';

const idle = { x: 0, z: 0, run: false, aim: 0 };
function step(game: Crossing, seconds: number, intent = idle) {
  for (let i = 0; i < Math.ceil(seconds / 0.02); i++) game.update(0.02, intent);
}
function arena(game: Crossing, tiles?: Tile[]) {
  game.world = {
    ...game.world,
    tiles:
      tiles ??
      Array.from({ length: 41 }, (_, i) =>
        Array.from({ length: 11 }, (_, j) => ({
          x: i - 20,
          z: j - 5,
          height: 0,
          kind: 'soil' as const,
          decoration: 0,
          seed: 0,
        })),
      ).flat(),
    spawn: { x: 0, y: 0, z: 0 },
    gate: { x: -15, y: 0, z: 0 },
    resonator: { x: 15, y: 0, z: 0 },
  };
  game.player.position = { x: 0, y: 0, z: 0 };
  game.player.vy = 0;
  game.player.grounded = true;
  game.actors.forEach((a, i) => {
    a.position = { x: 15, y: 0, z: i };
    a.home = { ...a.position };
    a.genome = { ...a.genome, role: 'grazer' };
  });
}
function groundedGenome(game: Crossing) {
  for (let seed = 0; seed < 1000; seed++) {
    const genome = generateSpecies(seed, game.world.laws);
    if (genome.locomotion === 'stride' && genome.jump > 0) return genome;
  }
  throw new Error('no grounded test anatomy');
}

test('movement follows anatomical speed; jumping lands and deliberate edge traversal kills', () => {
  const game = new Crossing(2);
  arena(game);
  game.player.genome = groundedGenome(game);
  const speed = game.player.genome.speed;
  step(game, 1, { ...idle, x: 1 });
  assert.ok(Math.abs(game.player.position.x - speed) < 1e-8);
  game.jump();
  assert.equal(game.player.vy, game.player.genome.jump);
  step(game, 0.2);
  assert.ok(game.player.position.y > 0.1 && !game.player.grounded);
  step(game, 3);
  assert.equal(game.player.position.y, 0);
  assert.ok(game.player.grounded);
  game.player.position.x = 20.4;
  step(game, 4, { ...idle, x: 1 });
  assert.equal(game.phase, 'dead');
  const old = game.player.genome.id;
  game.reincarnate();
  assert.equal(game.phase, 'playing');
  assert.notEqual(game.player.genome.id, old);
});

test('walking into a tall ladder actually climbs to its upper surface', () => {
  const game = new Crossing(2);
  arena(game, [
    { x: 0, z: 0, height: 0, kind: 'soil', decoration: 0, seed: 0 },
    { x: 1, z: 0, height: 1.75, kind: 'ladder', decoration: 0, seed: 1 },
    { x: 2, z: 0, height: 1.75, kind: 'soil', decoration: 0, seed: 2 },
  ]);
  game.actors = [];
  game.player.genome = groundedGenome(game);
  for (let i = 0; i < 200 && game.player.position.x < 1; i++) game.update(0.02, { ...idle, x: 1 });
  assert.ok(game.player.position.x >= 1, 'must cross the ladder boundary');
  assert.equal(game.player.position.y, 1.75);
  assert.ok(game.player.grounded);
});

test('equipment delivery distinguishes forward impact, surrounding field and bounded projectiles', () => {
  const game = new Crossing(5);
  arena(game);
  const front = game.actors[0],
    back = game.actors[1];
  front.position = { x: 0.8, y: 0, z: 0 };
  back.position = { x: -0.8, y: 0, z: 0 };
  front.genome = { ...front.genome, affinity: 'cold' };
  back.genome = { ...back.genome, affinity: 'cold' };
  game.world.weapon = {
    ...game.world.weapon,
    trigger: 'impact',
    core: 'heat',
    reach: 1.2,
    damage: 10,
    power: 1,
  };
  const fhp = front.hp,
    bhp = back.hp;
  game.attack();
  assert.equal(front.hp, fhp - 10);
  assert.equal(back.hp, bhp);
  assert.ok(front.burn > 0);
  game.player.cooldown = 0;
  game.world.weapon = { ...game.world.weapon, trigger: 'field', core: 'cold' };
  game.attack();
  assert.ok(back.hp < bhp && back.slow > 0);
  game.player.cooldown = 0;
  game.world.weapon = {
    ...game.world.weapon,
    trigger: 'projectile',
    projectileSpeed: 10,
    reach: 2,
  };
  game.attack();
  assert.equal(game.bolts.length, 1);
  assert.ok(
    Math.abs(game.bolts[0].life - 0.2) < 1e-8,
    'projectile duration must derive from reach / speed',
  );
  game.bolts = [];
  game.actors = [];
  game.player.cooldown = 0;
  game.world.weapon.reach = 1.23;
  game.attack();
  const bolt = game.bolts[0];
  step(game, 0.3);
  assert.ok(bolt.position.x <= 1.23 + 1e-8, 'last partial step must respect generated range');
});

test('growth repairs living targets and links the requested escort; charge uses conductor anatomy', () => {
  const game = new Crossing(8, 1);
  arena(game);
  const target = game.target;
  target.position = { x: 0.5, y: 0, z: 0 };
  target.hp = 20;
  game.integrity = 70;
  game.world.weapon = {
    ...game.world.weapon,
    trigger: 'field',
    core: 'growth',
    reach: 1.5,
    damage: 10,
    power: 1,
  };
  game.attack();
  assert.equal(target.hp, 30);
  assert.ok(target.following);
  assert.ok(game.integrity > 70);
  game.player.cooldown = 0;
  target.genome = { ...target.genome, role: 'conductor', affinity: 'charge' };
  game.world.weapon = { ...game.world.weapon, core: 'charge' };
  game.attack();
  assert.ok(game.attunement > 0);
});

test('survey completion requires distinct species, extraction, and next world reflects action history', () => {
  const game = new Crossing(73),
    twin = new Crossing(73);
  for (const a of game.actors.slice(0, 3)) {
    game.player.position = { ...a.position };
    game.interact();
    game.interact();
  }
  assert.equal(game.scanned.length, 3);
  assert.equal(game.phase, 'playing');
  assert.ok(game.ready);
  game.player.position = { ...game.world.gate };
  game.interact();
  assert.equal(game.phase, 'complete');
  const next = game.next();
  assert.equal(next.crossing, 1);
  assert.equal(next.rootSeed, 73);
  assert.notEqual(next.world.seed, twin.next().world.seed);
  assert.deepEqual(game.next().world, next.world);
});

test('restoring a vessel reconstructs its anatomy without replaying action history', () => {
  const game = new Crossing(33),
    action = game.actionSeed;
  game.restoreVessel(10000);
  assert.equal(game.vessel, 10000);
  assert.equal(game.actionSeed, action);
  const same = new Crossing(33);
  same.restoreVessel(10000);
  assert.deepEqual(game.player, same.player);
  for (const bad of [-1, 1.5, 10001, Infinity, NaN]) assert.throws(() => game.restoreVessel(bad));
});

test('a recruited lifeform follows a tile route around an abyss instead of pushing into it', () => {
  const game = new Crossing(3, 1);
  const tiles: Tile[] = [];
  for (let z = 0; z <= 6; z++)
    for (let x = 0; x <= 6; x++)
      if (x === 0 || x === 6 || z === 6)
        tiles.push({ x, z, height: 0, kind: 'path', decoration: 0, seed: 0 });
  arena(game, tiles);
  game.player.position = { x: 6, y: 0, z: 0 };
  const target = game.target;
  game.actors = [target];
  target.position = { x: 0, y: 0, z: 0 };
  target.home = { ...target.position };
  target.genome = { ...groundedGenome(game), id: target.genome.id, role: 'grazer' };
  target.following = true;
  let passedFarBridge = false;
  for (let i = 0; i < 7000; i++) {
    game.update(0.02, idle);
    assert.ok(
      tileAt(game.world, target.position.x, target.position.z),
      'escort must stay on generated ground',
    );
    if (target.position.z > 5.4) passedFarBridge = true;
    if (Math.hypot(target.position.x - 6, target.position.z) < 1.1) break;
  }
  assert.ok(passedFarBridge, 'route must use the distant connecting bridge');
  assert.ok(
    Math.hypot(target.position.x - 6, target.position.z) < 1.1,
    'escort must reach the player around the cleft',
  );
});

test('death banks exact memories on reachable ground and recovery cannot duplicate them', () => {
  const game = new Crossing(8);
  arena(game);
  game.memories = 9;
  game.player.position = { x: 25, y: -9, z: 0 };
  game.update(0.02, idle);
  assert.equal(game.phase, 'dead');
  assert.equal(game.memories, 0);
  assert.equal(game.belongingsAmount, 9);
  assert.ok(tileAt(game.world, game.belongings!.x, game.belongings!.z));
  game.reincarnate();
  game.player.position = { ...game.belongings! };
  game.interact();
  assert.equal(game.memories, 9);
  assert.equal(game.belongings, null);
  assert.equal(game.belongingsAmount, 0);
  game.interact();
  assert.equal(game.memories, 9);
});

test('a linked predator escorts without continuing to attack its new partner', () => {
  const game = new Crossing(7, 1);
  arena(game);
  const target = game.target;
  game.actors = [target];
  target.position = { x: 0.6, y: 0, z: 0 };
  target.following = true;
  target.genome = { ...target.genome, role: 'predator' };
  const hp = game.player.hp;
  step(game, 4);
  assert.equal(game.player.hp, hp);
});

test('attune and hunt assignments can complete with their actually generated weapons', () => {
  const found = new Set<string>();
  for (let seed = 0; seed < 100 && found.size < 2; seed++) {
    const game = new Crossing(seed, 1),
      kind = game.world.mission.kind;
    if ((kind !== 'hunt' && kind !== 'attune') || found.has(kind)) continue;
    arena(game);
    const target = game.target;
    if (kind === 'hunt') {
      game.actors = [target];
      target.position = { x: 0.5, y: 0, z: 0 };
      target.home = { ...target.position };
      target.genome = { ...target.genome, role: 'grazer', speed: 0 };
    } else {
      game.actors = [];
      game.world.resonator = { x: 0.5, y: 0, z: 0 };
    }
    for (let i = 0; i < 80 && !game.ready; i++) {
      game.attack();
      step(game, game.world.weapon.recovery + 0.2);
    }
    assert.ok(
      game.ready,
      `${kind} must be achievable with ${game.world.weapon.core}/${game.world.weapon.trigger}`,
    );
    game.player.position = { ...game.world.gate };
    game.interact();
    assert.equal(game.phase, 'complete');
    found.add(kind);
  }
  assert.equal(found.size, 2);
});
