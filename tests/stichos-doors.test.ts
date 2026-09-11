import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { appearance } from '../src/stichos/world.ts';
import type { Npc } from '../src/stichos/types.ts';

function threshold() {
  const game = new Stichos(3886);
  const door = game.world.propsAround(-16, -6, 0).find((p) => p.kind === 'door')!;
  assert.ok(door, 'Use an actual generated house doorway.');
  Object.assign(game.player, { x: door.x, y: door.y + 1 });
  game.npcs = [];
  return { game, door };
}

test('closed generated doors stop movement; opened doors permit passage and cannot close on a body', () => {
  const { game, door } = threshold();
  assert.equal(game.world.blocked(door.x, door.y, game.removed), true);
  assert.equal(game.world.blocked(door.x, door.y, game.removed, true), false);
  for (let i = 0; i < 10; i++) game.update(0.05, { x: 0, y: -1, run: false });
  assert.ok(game.player.y > door.y + 0.65, 'The whole body stops on the near side.');
  game.interact(door.id);
  assert.equal(game.world.blocked(door.x, door.y, game.removed), false);
  while (game.player.y > door.y + 0.05) game.update(0.02, { x: 0, y: -1, run: false });
  game.interact(door.id);
  assert.ok(game.opened.has(door.id), 'The occupied doorway remains open.');
  while (game.player.y > door.y - 1) game.update(0.02, { x: 0, y: -1, run: false });
  game.interact(door.id);
  assert.equal(game.world.blocked(door.x, door.y, game.removed), true);
  assert.deepEqual(Stichos.restore(game.save()).player, game.player);
});

test('arrows, melee and wards respect an actual closed doorway, then work through its open state', () => {
  for (const open of [false, true]) {
    const { game, door } = threshold();
    if (open) game.interact(door.id);
    game.weapons.add('bow');
    game.equip('bow');
    game.attack({ x: door.x, y: door.y - 3 });
    for (let i = 0; i < 5; i++) game.update(0.04, { x: 0, y: 0, run: false });
    const arrow = game.effects.find((e) => e.kind === 'arrow');
    if (open) assert.ok(arrow && arrow.y < door.y - 0.5);
    else assert.equal(arrow, undefined, 'A closed door intercepts the arrow in flight.');
  }
  for (const action of ['attack', 'ward'] as const) {
    const { game, door } = threshold();
    game.player.y = door.y + 0.72;
    const enemy: Npc = {
      id: 'door-combat-fixture',
      name: 'Door combat fixture',
      seed: 27,
      x: door.x,
      y: door.y - 0.72,
      role: 'raider',
      clan: 3,
      appearance: appearance(27, 'raider', 3),
      hp: 50,
      maxHp: 50,
      home: { x: door.x, y: door.y - 0.72 },
      speed: 0,
      heading: 0,
      phase: 0,
      hostile: true,
      cooldown: 10,
    };
    game.npcs = [enemy];
    if (action === 'attack') game.attack(enemy);
    else game.ward();
    assert.equal(enemy.hp, 50, `${action} cannot cross the closed door.`);
    game.interact(door.id);
    game.player.attackCooldown = 0;
    game.player.wardCooldown = 0;
    game.player.stamina = 100;
    if (action === 'attack') game.attack(enemy);
    else game.ward();
    assert.ok(enemy.hp < 50, `${action} works through the opened door.`);
  }
});

test('pre-collision saves keep exact door-footing positions, while new blocked saves are rejected', () => {
  const { game, door } = threshold();
  const saved = game.save();
  Object.assign(saved.player, { x: door.x, y: door.y + 0.65 });
  assert.throws(() => Stichos.restore(saved), /blocked terrain/);
  const legacy = structuredClone(saved) as Partial<typeof saved>;
  delete legacy.doorRevision;
  const restored = Stichos.restore(legacy);
  assert.deepEqual(restored.player, saved.player);
  assert.ok(restored.opened.has(door.id) && restored.removed.has(door.id));
  assert.equal(restored.save().doorRevision, 1);
  assert.deepEqual(Stichos.restore(restored.save()).player, restored.player);
  const unrelated = restored.world.propsAround(16, -6, 0).find((p) => p.kind === 'door')!;
  assert.ok(!restored.opened.has(unrelated.id), 'Migration does not open unrelated doors.');
  assert.throws(() => Stichos.restore({ ...saved, doorRevision: 2 }), /incompatible/);
});
