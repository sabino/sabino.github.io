import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadController } from '../src/gamepad.ts';
import type { PadLike } from '../src/gamepad.ts';

function pad(options: Partial<PadLike> = {}): PadLike {
  return {
    id: 'Test controller',
    index: 0,
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    ...options,
  };
}

function press(device: PadLike, ...indices: number[]): PadLike {
  return {
    ...device,
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: indices.includes(index),
      value: indices.includes(index) ? 1 : 0,
    })),
  };
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('only the first connected standard-mapping controller is selected', () => {
  const controller = new GamepadController();
  const unsupported = pad({ mapping: '', id: 'Unmapped' });
  const disconnected = pad({ connected: false });
  assert.equal(controller.sample([null, unsupported, disconnected], 0).connected, false);
  const first = pad({ id: 'First', index: 2 });
  const second = pad({ id: 'Second', index: 3 });
  const frame = controller.sample([null, unsupported, first, second], 0);
  assert.equal(frame.connected, true);
  assert.equal(frame.name, 'First');
});

test('radial deadzone removes drift and rescales the remaining stick travel', () => {
  const controller = new GamepadController();
  assert.deepEqual(controller.sample([pad({ axes: [0.1, -0.1, 0.18, 0] })], 0).move, {
    x: 0,
    y: 0,
  });
  const frame = controller.sample([pad({ axes: [0.59, 0, 0, -0.59] })], 0);
  near(frame.move.x, 0.5);
  near(frame.move.y, 0);
  near(frame.aim.x, 0);
  near(frame.aim.y, -0.5);
});

test('full diagonals are normalized for both sticks and D-pad fallback', () => {
  const controller = new GamepadController();
  const sticks = controller.sample([pad({ axes: [1, 1, -1, -1] })], 0);
  near(Math.hypot(sticks.move.x, sticks.move.y), 1);
  near(sticks.move.x, Math.SQRT1_2);
  near(Math.hypot(sticks.aim.x, sticks.aim.y), 1);
  const dpad = controller.sample([press(pad(), 12, 15)], 0);
  near(dpad.move.x, Math.SQRT1_2);
  near(dpad.move.y, -Math.SQRT1_2);
  const stickWins = controller.sample([press(pad({ axes: [-1, 0, 0, 0] }), 15)], 0);
  assert.deepEqual(stickWins.move, { x: -1, y: 0 });
});

test('missing, nonfinite, and out-of-range inputs produce finite bounded output', () => {
  const controller = new GamepadController();
  const sparse = pad({ axes: undefined, buttons: undefined } as unknown as Partial<PadLike>);
  const blank = controller.sample([sparse], Number.NaN);
  assert.deepEqual(blank.move, { x: 0, y: 0 });
  assert.deepEqual(blank.aim, { x: 0, y: 0 });
  const odd = controller.sample([pad({ axes: [Number.NaN, Infinity, -999, 999] })], Infinity);
  assert.deepEqual(odd.move, { x: 0, y: 0 });
  near(odd.aim.x, -Math.SQRT1_2);
  near(odd.aim.y, Math.SQRT1_2);
  assert.ok(Object.values(odd.aim).every(Number.isFinite));
});

test('action buttons emit edges while attacks and sprint remain held', () => {
  const controller = new GamepadController();
  const device = pad();
  controller.sample([device], 0);
  const down = press(device, 0, 1, 2, 3, 4, 5, 8, 9);
  const first = controller.sample([down], 0.016);
  assert.deepEqual(first.pressed, ['dash', 'scan', 'mend', 'journal', 'pause']);
  assert.deepEqual(first.held, ['blade', 'pulse']);
  assert.equal(first.running, true);
  assert.equal(first.confirm, true);
  assert.equal(first.back, true);
  const held = controller.sample([down], 0.016);
  assert.deepEqual(held.pressed, []);
  assert.deepEqual(held.held, ['blade', 'pulse']);
  assert.equal(held.running, true);
  assert.equal(held.confirm, false);
  assert.equal(held.back, false);
  controller.sample([device], 0.016);
  assert.equal(controller.sample([down], 0.016).confirm, true);
});

test('button analog values honor the digital threshold and reject invalid values', () => {
  const controller = new GamepadController();
  const device = pad();
  controller.sample([device], 0);
  const buttons = [...device.buttons];
  buttons[0] = { pressed: false, value: 0.5 };
  buttons[1] = { pressed: false, value: 0.49 };
  buttons[2] = { pressed: false, value: Infinity };
  buttons[4] = { pressed: false, value: Number.NaN };
  const frame = controller.sample([{ ...device, buttons }], 0);
  assert.equal(frame.confirm, true);
  assert.deepEqual(frame.held, []);
  assert.equal(frame.running, false);
});

test('menu movement steps immediately then repeats at the delayed cadence', () => {
  const controller = new GamepadController();
  const device = pad();
  const down = press(device, 13);
  controller.sample([device], 0);
  assert.equal(controller.sample([down], 0.016).menuStep, 1);
  assert.equal(controller.sample([down], 0.39).menuStep, 0);
  assert.equal(controller.sample([down], 0.01).menuStep, 1);
  assert.equal(controller.sample([down], 0.14).menuStep, 0);
  assert.equal(controller.sample([down], 0.01).menuStep, 1);
  assert.equal(controller.sample([down], 0.15).menuStep, 1);
  assert.equal(controller.sample([device], 0.1).menuStep, 0);
  assert.equal(controller.sample([down], 0).menuStep, 1);
});

test('menu direction changes act immediately; stick threshold and D-pad cancellation are stable', () => {
  const controller = new GamepadController();
  const device = pad();
  controller.sample([device], 0);
  assert.equal(controller.sample([pad({ axes: [0, 0.49] })], 0).menuStep, 0);
  assert.equal(controller.sample([pad({ axes: [0, 0.5] })], 0).menuStep, 1);
  assert.equal(controller.sample([pad({ axes: [0, -0.5] })], 0).menuStep, -1);
  assert.equal(controller.sample([press(pad({ axes: [0, 1] }), 12, 13)], 0).menuStep, 0);
  assert.equal(controller.sample([press(device, 12)], 0).menuStep, -1);
  assert.equal(controller.sample([press(device, 12)], -1).menuStep, 0);
  assert.equal(controller.sample([press(device, 12)], Number.NaN).menuStep, 0);
  assert.equal(controller.sample([press(device, 12)], Infinity).menuStep, 0);
});

test('disconnection clears all output and reconnecting held buttons creates no phantom edges', () => {
  const controller = new GamepadController();
  const device = pad();
  const down = press(device, 0, 1, 2, 4, 9, 13);
  controller.sample([device], 0);
  assert.equal(controller.sample([down], 0.016).confirm, true);
  const absent = controller.sample([], 1);
  assert.equal(absent.connected, false);
  assert.deepEqual(absent.move, { x: 0, y: 0 });
  assert.deepEqual(absent.aim, { x: 0, y: 0 });
  assert.deepEqual(absent.pressed, []);
  assert.deepEqual(absent.held, []);
  assert.equal(absent.running, false);
  assert.equal(absent.menuStep, 0);
  assert.equal(absent.confirm, false);
  assert.equal(absent.back, false);
  const restored = controller.sample([down], 0.016);
  assert.deepEqual(restored.pressed, []);
  assert.deepEqual(restored.held, ['blade', 'pulse']);
  assert.equal(restored.confirm, false);
  assert.equal(restored.back, false);
  assert.equal(restored.menuStep, 0);
  controller.sample([device], 0.016);
  assert.equal(controller.sample([down], 0.016).confirm, true);
});

test('device changes reset edges and menu repeat even without an empty intervening poll', () => {
  const controller = new GamepadController();
  const first = pad();
  controller.sample([first], 0);
  controller.sample([press(first, 13)], 0);
  controller.sample([press(first, 13)], 0.39);
  const second = pad({ id: 'Other pad', index: 1 });
  const down = press(second, 0, 8, 13);
  const changed = controller.sample([down], 0.1);
  assert.equal(changed.name, 'Other pad');
  assert.deepEqual(changed.pressed, []);
  assert.equal(changed.menuStep, 0);
  assert.equal(controller.sample([down], 0.2).menuStep, 0);
  assert.equal(controller.sample([down], 0.2).menuStep, 1);
  controller.sample([second], 0);
  assert.deepEqual(controller.sample([down], 0).pressed, ['dash', 'journal']);
});

test('returned frames are independent and delayed polls emit only a single menu step', () => {
  const controller = new GamepadController();
  const device = pad();
  const first = controller.sample([device], 0);
  first.pressed.push('dash');
  first.move.x = 99;
  const next = controller.sample([device], 0);
  assert.deepEqual(next.pressed, []);
  assert.equal(next.move.x, 0);
  const down = press(device, 13);
  assert.equal(controller.sample([down], 0).menuStep, 1);
  assert.equal(controller.sample([down], 1000).menuStep, 1);
  assert.equal(controller.sample([down], 0).menuStep, 0);
});
