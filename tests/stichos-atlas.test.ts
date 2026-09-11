import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atlasPoint,
  atlasScreen,
  zoomAtlas,
  fitAtlas,
  ATLAS_MAX_SCALE,
  ATLAS_MIN_SCALE,
} from '../src/stichos/atlas.ts';

test('atlas zoom keeps the pointed world location fixed across local and distant scales', () => {
  for (const x of [-900_000_000, -1200, 0, 840_000_000])
    for (const scale of [0.0001, 0.5, 3]) {
      const view = { x, y: -x / 3, scale },
        cursor = { x: 612, y: 84 };
      const before = atlasPoint(view, cursor, 800, 500);
      const zoomed = zoomAtlas(view, cursor, 1.35, 800, 500);
      const after = atlasPoint(zoomed, cursor, 800, 500);
      assert.ok(Math.abs(before.x - after.x) < 0.00001);
      assert.ok(Math.abs(before.y - after.y) < 0.00001);
      const projected = atlasScreen(zoomed, after, 800, 500);
      assert.ok(Math.abs(projected.x - cursor.x) < 0.00001);
      assert.ok(Math.abs(projected.y - cursor.y) < 0.00001);
    }
});

test('fit explored includes the whole remembered extent, even a billion tiles from the origin', () => {
  for (const bounds of [
    { minX: -32, minY: -16, maxX: 80, maxY: 48 },
    { minX: -1e9, minY: -8e8, maxX: 1e9, maxY: 9e8 },
  ]) {
    const view = fitAtlas(bounds, 800, 500, { x: 0, y: 5 });
    for (const point of [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    ]) {
      const pixel = atlasScreen(view, point, 800, 500);
      assert.ok(pixel.x >= 29 && pixel.x <= 771);
      assert.ok(pixel.y >= 29 && pixel.y <= 471);
    }
  }
  assert.deepEqual(fitAtlas(null, 800, 500, { x: 3, y: -4 }), { x: 3, y: -4, scale: 3 });
});

test('repeated atlas zoom stays finite and bounded without mutating the saved view', () => {
  const original = { x: 12, y: -30, scale: 3 };
  let view = original;
  for (let i = 0; i < 200; i++) view = zoomAtlas(view, { x: 400, y: 250 }, 0.5, 800, 500);
  assert.equal(view.scale, ATLAS_MIN_SCALE);
  for (let i = 0; i < 200; i++) view = zoomAtlas(view, { x: 400, y: 250 }, 2, 800, 500);
  assert.equal(view.scale, ATLAS_MAX_SCALE);
  assert.deepEqual(original, { x: 12, y: -30, scale: 3 });
  assert.deepEqual(zoomAtlas(original, { x: 400, y: 250 }, Infinity, 800, 500), original);
});
