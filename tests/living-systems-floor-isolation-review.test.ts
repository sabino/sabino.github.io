import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { LivingSystems } from '../src/stichos/living-systems.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';

function entered() {
  const game = new Stichos(3886, 4);
  game.enableLivingSystems('isolation-review');
  const entrance = game.livingSystemsFrame!.entrances[0];
  assert.ok(entrance, 'A real generated settlement exposes an entrance.');
  Object.assign(game.player, { x: entrance.x, y: entrance.y });
  const result = game.fieldCommand({
    kind: 'underworld-enter',
    settlementId: entrance.settlementId,
  });
  assert.equal(result.ok, true, result.message);
  assert.match(game.spaceId, /^underground:/);
  return game;
}

test('underground proximity cannot resolve an overlapping surface prop', () => {
  const game = entered();
  const original = game.world.propsAround.bind(game.world);
  game.world.propsAround = () => [
    {
      id: 'surface-only-bench',
      kind: 'bench',
      name: 'Surface bench',
      solid: false,
      seed: 1,
      x: game.player.x,
      y: game.player.y,
    },
  ];
  try {
    assert.equal(game.nearby(), null, 'No invisible surface interaction appears underground.');
  } finally {
    game.world.propsAround = original;
  }
});

test('a surface bench cannot fully heal or move the rest anchor from an underground floor', () => {
  const game = entered();
  game.player.hp = Math.floor(game.player.maxHp / 2);
  const hp = game.player.hp,
    time = game.time;
  const original = game.world.propsAround.bind(game.world);
  game.world.propsAround = () => [
    {
      id: 'surface-only-bench',
      kind: 'bench',
      name: 'Surface bench',
      solid: false,
      seed: 1,
      x: game.player.x,
      y: game.player.y,
    },
  ];
  try {
    game.rest();
    assert.equal(game.player.hp, hp, 'Dungeon recovery must use an actual dungeon hearth.');
    assert.equal(game.time, time);
  } finally {
    game.world.propsAround = original;
  }
});

test('recovery from an underground death restores a consistent traversable authority address', () => {
  const game = entered();
  game.player.hp = 0;
  game.phase = 'lost';
  game.reincarnate();
  assert.equal(game.phase, 'playing');
  assert.equal(
    game.spaceId,
    'surface',
    'The clinic return changes both floor identity and position.',
  );
  game.update(0.2, { x: 0, y: 0, run: false });
  assert.equal(game.livingSystemsFrame?.location.spaceId, game.spaceId);
  assert.equal(game.navigationBlocked(game.player.x, game.player.y), false);
  const restored = Stichos.restore(game.save());
  restored.enableLivingSystems('isolation-review');
  assert.equal(restored.spaceId, game.spaceId);
});

test('a closed opaque door blocks witness and guard identification until it is opened', () => {
  const world = new InfiniteWorld(3886, 4);
  const removed = new Set<string>();
  world.blocked = (x, _y, _removed, doorsOpen) =>
    Math.round(x) === 1 && !doorsOpen && !removed.has('opaque-door');
  const systems = new LivingSystems(world, removed, {
    mode: 'solo',
    fauna: () => [],
    defeatFauna: () => {},
  });
  const a = { spaceId: 'surface', x: 0, y: 0 },
    b = { spaceId: 'surface', x: 2, y: 0 };
  assert.equal(
    systems.sight(a, b),
    false,
    'Planning permissions cannot grant vision through a shut door.',
  );
  removed.add('opaque-door');
  assert.equal(systems.sight(a, b), true);
});
