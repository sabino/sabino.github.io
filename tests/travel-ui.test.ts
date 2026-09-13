import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPaceShortcut,
  loadMovementPace,
  movementRuns,
  MOVEMENT_PACE_KEY,
} from '../src/stichos/travel-ui.ts';

test('only a deliberate unmodified gameplay C toggles pace', () => {
  const event = {
    key: 'c',
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    defaultPrevented: false,
  };
  assert.equal(isPaceShortcut(event, true, false), true);
  assert.equal(isPaceShortcut({ ...event, key: 'C' }, true, false), true, 'Caps Lock still works');
  for (const flag of [
    'repeat',
    'altKey',
    'ctrlKey',
    'metaKey',
    'shiftKey',
    'isComposing',
    'defaultPrevented',
  ])
    assert.equal(isPaceShortcut({ ...event, [flag]: true }, true, false), false, flag);
  for (const key of ['v', 'r', 'Shift', 'Enter', 'Escape'])
    assert.equal(isPaceShortcut({ ...event, key }, true, false), false, key);
  assert.equal(isPaceShortcut(event, false, false), false, 'menus and unavailable gameplay');
  assert.equal(isPaceShortcut(event, true, true), false, 'typing and form inputs');
});
test('pace storage has a safe walking default and tolerates blocked storage', () => {
  let key = '';
  assert.equal(
    loadMovementPace({
      getItem: (k) => {
        key = k;
        return 'run';
      },
    }),
    'run',
  );
  assert.equal(key, MOVEMENT_PACE_KEY);
  for (const value of [null, '', 'walk', 'true', '"run"', '<script>'])
    assert.equal(loadMovementPace({ getItem: () => value }), 'walk');
  assert.equal(
    loadMovementPace({
      getItem: () => {
        throw Error('blocked');
      },
    }),
    'walk',
  );
  assert.equal(loadMovementPace(), 'walk');
});
test('selected pace and temporary overrides compose without changing the preference', () => {
  assert.equal(movementRuns('walk'), false);
  assert.equal(movementRuns('run'), true);
  assert.equal(movementRuns('walk', true), true);
  assert.equal(movementRuns('walk', false, true), true);
  assert.equal(movementRuns('run', false, false), true);
  assert.equal(
    movementRuns('walk', false, false),
    false,
    'releasing Shift or the edge restores Walk',
  );
});
