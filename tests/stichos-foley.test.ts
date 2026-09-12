import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { footstepMaterial, physicalSound } from '../src/stichos/foley-events.ts';
import { resourceWork } from '../src/stichos/labor.ts';
import type { Tile, Prop } from '../src/stichos/types.ts';

const tile = (terrain: Tile['terrain'], extra: Partial<Tile> = {}) =>
  ({ terrain, ...extra }) as Tile;
const wait = (game: Stichos, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) game.update(0.1, { x: 0, y: 0, run: false });
};
function beside(game: Stichos, prop: Prop) {
  const point = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([x, y]) => ({ x: prop.x + x, y: prop.y + y }))
    .find((p) => !game.world.blocked(p.x, p.y, game.removed));
  assert.ok(point);
  Object.assign(game.player, point);
}

test('footsteps distinguish physical terrain and built surfaces within the same biome', () => {
  assert.equal(footstepMaterial(tile('grass')), 'grass');
  assert.equal(footstepMaterial(tile('snow')), 'snow');
  assert.equal(footstepMaterial(tile('sand')), 'sand');
  assert.equal(footstepMaterial(tile('mud')), 'dirt');
  assert.equal(footstepMaterial(tile('water')), 'water');
  assert.equal(footstepMaterial(tile('road')), 'gravel');
  assert.equal(footstepMaterial(tile('road', { site: 'town' })), 'stone');
  assert.equal(footstepMaterial(tile('bridge')), 'wood');
  assert.equal(footstepMaterial(tile('floor')), 'stone');
  assert.equal(
    footstepMaterial(tile('floor', { architecture: { style: 'timber' } as Tile['architecture'] })),
    'wood',
  );
  assert.equal(
    footstepMaterial(
      tile('floor', { architecture: { wallMaterial: 'metal' } as Tile['architecture'] }),
    ),
    'metal',
  );
});

test('steps are driven by actual displacement; idle, collision, and teleport create no footsteps', () => {
  const game = new Stichos(3886);
  game.drainEvents();
  wait(game, 1);
  assert.equal(game.drainEvents().filter((e) => e.kind === 'step').length, 0);
  Object.assign(game.player, { x: 0, y: 0 });
  wait(game, 0.1);
  assert.equal(game.drainEvents().filter((e) => e.kind === 'step').length, 0);
  const originalBlocked = game.world.blocked.bind(game.world);
  game.world.blocked = () => true;
  for (let i = 0; i < 10; i++) game.update(0.1, { x: 1, y: 0, run: true });
  assert.equal(game.drainEvents().filter((e) => e.kind === 'step').length, 0);
  game.world.blocked = () => false;
  for (let i = 0; i < 10; i++) game.update(0.1, { x: 1, y: 0, run: false });
  const steps = game.drainEvents().filter((e) => e.kind === 'step');
  assert.ok(steps.length > 0);
  assert.ok(steps.every((e) => e.foley?.kind === 'footstep' && e.foley.speed === 0));
  assert.equal(steps.length, Math.floor(game.distanceTraveled / 0.85));
  game.world.blocked = originalBlocked;
});

for (const [kind, tool, material] of [
  ['pine', 'axe', 'wood'],
  ['rock', 'pickaxe', 'stone'],
] as const) {
  test(`${tool} emits material impacts only on accepted strokes and a pickup only on completion`, () => {
    const game = new Stichos(3886);
    const prop = game.world.propsAround(0, 0, 24).find((p) => p.kind === kind)!;
    beside(game, prop);
    game.drainEvents();
    game.interact(prop.id);
    assert.equal(game.drainEvents().filter((e) => e.foley?.kind === 'tool-impact').length, 0);
    game.equipTool(tool);
    game.drainEvents();
    game.interact(prop.id);
    const first = game.drainEvents();
    const impact = first.find((e) => e.foley?.kind === 'tool-impact')!.foley!;
    assert.equal(impact.material, material);
    assert.equal(impact.delay, 0.17);
    assert.equal(first.filter((e) => e.foley?.kind === 'pickup').length, 0);
    game.interact(prop.id);
    assert.equal(game.drainEvents().filter((e) => e.foley?.kind === 'tool-impact').length, 0);
    const count = resourceWork(prop)!.requiredStrokes;
    for (let i = 1; i < count; i++) {
      wait(game, 1.6);
      game.drainEvents();
      game.interact(prop.id);
      const events = game.drainEvents();
      assert.equal(events.filter((e) => e.foley?.kind === 'tool-impact').length, 1);
      assert.equal(
        events.filter((e) => e.foley?.kind === 'pickup').length,
        i === count - 1 ? 1 : 0,
      );
    }
    assert.ok(game.removed.has(prop.id));
    assert.ok(
      !JSON.stringify(game.save()).includes('tool-impact'),
      'Foley intents never enter save data',
    );
  });
}

test('physical sound uses bounded world-distance and direction independent of viewport', () => {
  const sound = physicalSound('tool-impact', 'wood', { x: -10, y: 0 }, { x: 0, y: 0 }, 'worker', 1);
  assert.equal(sound.distance, 10);
  assert.equal(sound.pan, -1);
});

test('a released bow and an actual door opening carry their distinct acoustic action', () => {
  const game = new Stichos(3886);
  game.player.appearance.weapon = 'bow';
  game.drainEvents();
  game.attack();
  assert.equal(game.drainEvents().find((e) => e.kind === 'attack')?.foley?.action, 'release');
  const door = game.world.propsAround(0, 0, 24).find((p) => p.kind === 'door')!;
  beside(game, door);
  game.interact(door.id);
  const opened = game.drainEvents().find((e) => e.foley?.kind === 'door');
  assert.equal(opened?.foley?.action, 'open');
  assert.ok(game.opened.has(door.id));
  // No resident is in this doorway in the controlled session fixture.
  game.npcs = game.npcs.filter((n) => Math.hypot(n.x - door.x, n.y - door.y) >= 0.7);
  game.interact(door.id);
  assert.equal(game.drainEvents().find((e) => e.foley?.kind === 'door')?.foley?.action, 'close');
});
