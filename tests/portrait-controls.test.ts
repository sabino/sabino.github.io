import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_PORTRAIT_PREFERENCES,
  PORTRAIT_PREFERENCES_KEY,
  joystickVector,
  loadPortraitPreferences,
  sanitizePortraitPreferences,
} from '../src/stichos/portrait-controls.ts';
import { viewportLayout } from '../src/stichos/mobile-viewport.ts';

test('stick dead zone rejects accidental contact, with continuous bounded diagonal walking', () => {
  assert.deepEqual(joystickVector(3, 3), { x: 0, y: 0, run: false });
  const gentle = joystickVector(13, 0);
  const farther = joystickVector(24, 0);
  assert.ok(gentle.x > 0 && gentle.x < farther.x && farther.x < 1);
  assert.equal(gentle.y, 0);
  const diagonal = joystickVector(30, 30);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
  assert.equal(diagonal.x, diagonal.y);
  assert.equal(joystickVector(0, -43).y, -1);
  assert.equal(joystickVector(-43, 0).x, -1);
});
test('sprint begins only at the outer edge and can be disabled independently of speed', () => {
  assert.equal(joystickVector(40, 0).run, false);
  assert.equal(joystickVector(43, 0).run, true);
  assert.deepEqual(joystickVector(430, 0, 43, false), { x: 1, y: 0, run: false });
  assert.equal(Math.hypot(joystickVector(430, 430).x, joystickVector(430, 430).y), 1);
});
test('non-finite and degenerate joystick measurements never reach game input', () => {
  for (const [x, y, radius] of [
    [NaN, 0, 43],
    [1, Infinity, 43],
    [1, 1, 0],
    [1, 1, -1],
  ])
    assert.deepEqual(joystickVector(x, y, radius), { x: 0, y: 0, run: false });
});
test('personal touch preferences survive upgrades, malformed JSON and denied storage', () => {
  assert.deepEqual(sanitizePortraitPreferences(null), DEFAULT_PORTRAIT_PREFERENCES);
  assert.deepEqual(
    sanitizePortraitPreferences({
      handedness: 'left',
      movement: 'buttons',
      sprintAtEdge: false,
      extra: true,
    }),
    { handedness: 'left', movement: 'buttons', sprintAtEdge: false },
  );
  assert.deepEqual(
    sanitizePortraitPreferences({ handedness: '<script>', movement: 2, sprintAtEdge: 'false' }),
    DEFAULT_PORTRAIT_PREFERENCES,
  );
  assert.deepEqual(
    loadPortraitPreferences({ getItem: () => '{broken' }),
    DEFAULT_PORTRAIT_PREFERENCES,
  );
  assert.deepEqual(
    loadPortraitPreferences({
      getItem: () => {
        throw Error('Storage blocked');
      },
    }),
    DEFAULT_PORTRAIT_PREFERENCES,
  );
  let key = '';
  assert.equal(
    loadPortraitPreferences({
      getItem: (k) => {
        key = k;
        return '{"handedness":"left"}';
      },
    }).handedness,
    'left',
  );
  assert.equal(key, PORTRAIT_PREFERENCES_KEY);
});
test('portrait gate affects touch landscape, not desktop or portrait keyboard resizing', () => {
  const base = { width: 844, height: 390, coarse: true, editing: false };
  assert.equal(viewportLayout(base).portraitRequired, true);
  assert.equal(viewportLayout({ ...base, coarse: false }).portraitRequired, false);
  assert.equal(viewportLayout({ ...base, editing: true }).portraitRequired, false);
  assert.equal(
    viewportLayout({ ...base, editing: true, physicalLandscape: true }).portraitRequired,
    true,
  );
  assert.equal(
    viewportLayout({ ...base, editing: true, physicalLandscape: false }).portraitRequired,
    false,
  );
  assert.equal(
    viewportLayout({ ...base, width: 390, height: 844, visualHeight: 310, editing: true })
      .portraitRequired,
    false,
  );
  assert.equal(viewportLayout({ ...base, width: 768, height: 1024 }).portraitRequired, false);
});
test('installed manifest declares portrait without changing the app identity or start URL', () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.orientation, 'portrait');
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
});
