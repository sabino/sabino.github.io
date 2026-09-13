import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { movementRuns } from '../src/stichos/travel-ui.ts';
import { TravelController } from '../src/stichos/navigation.ts';

test('chosen pace changes real session displacement; sprint overrides expire and idle Run spends no stamina', () => {
  const session = () => new Stichos(2468);
  const reference = session();
  const origin = { x: reference.player.x, y: reference.player.y };
  const direction = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ].find((d) =>
    [0.2, 0.4, 0.6].every(
      (step) =>
        !reference.world.blocked(origin.x + d.x * step, origin.y + d.y * step, reference.removed),
    ),
  );
  assert.ok(direction, 'The real generated spawn has a clear short walking direction.');
  const advance = (run: boolean) => {
    const game = session();
    game.update(0.08, { ...direction, run });
    return {
      distance: Math.hypot(game.player.x - origin.x, game.player.y - origin.y),
      stamina: game.player.stamina,
    };
  };
  const walk = advance(movementRuns('walk'));
  const run = advance(movementRuns('run'));
  assert.ok(walk.distance > 0.1, 'Ordinary input moves through actual terrain.');
  assert.ok(Math.abs(run.distance / walk.distance - 1.55) < 1e-8);
  assert.ok(run.stamina < walk.stamina, 'Run uses the existing stamina model.');
  assert.deepEqual(advance(movementRuns('walk', true)), run, 'Shift is a temporary override.');
  assert.deepEqual(advance(movementRuns('walk', false, true)), run, 'Stick edge can override.');
  assert.deepEqual(advance(movementRuns('walk')), walk, 'Releasing overrides restores Walk.');

  const idle = session();
  const before = { x: idle.player.x, y: idle.player.y, stamina: idle.player.stamina };
  idle.update(0.2, { x: 0, y: 0, run: movementRuns('run') });
  assert.deepEqual(
    { x: idle.player.x, y: idle.player.y, stamina: idle.player.stamina },
    before,
    'A stored Run choice alone cannot move or drain the player.',
  );
});

test('routed Walk and Run reach the same final waypoint at actual speed and Stop cancels immediately', () => {
  const durations: number[] = [];
  for (const run of [false, true]) {
    const travel = new TravelController({ cell: () => ({ kind: 'open' }) });
    const position = { x: 0, y: 0 };
    const target = { x: 8, y: 3 };
    const speed = 3 * (run ? 1.55 : 1);
    travel.travel(position, target, { label: 'Review destination', run });
    let elapsed = 0;
    for (let tick = 0; tick < 2000 && travel.active; tick++) {
      const dt = tick % 4 === 0 ? 0.05 : 0.016;
      const input = travel.update({ position, dt, speed, manual: { x: 0, y: 0, run: false } });
      if (Math.hypot(input.x, input.y) > 0) assert.equal(input.run, run);
      position.x += input.x * speed * dt;
      position.y += input.y * speed * dt;
      elapsed += dt;
    }
    assert.equal(travel.feedback.state, 'arrived');
    assert.ok(Math.hypot(position.x - target.x, position.y - target.y) < 0.15);
    durations.push(elapsed);
    assert.ok(travel.lock({ x: 1, y: 0 }, run));
    travel.cancel('stop');
    assert.deepEqual(travel.update({ position, dt: 0.05, speed, manual: { x: 0, y: 0, run } }), {
      x: 0,
      y: 0,
      run: false,
    });
    assert.equal(travel.active, false);
  }
  assert.ok(durations[1] < durations[0] * 0.8, 'Run is measurably faster along the same route.');
});
