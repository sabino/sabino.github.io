import test from 'node:test';
import assert from 'node:assert/strict';
import { estatePlacementFootprint, drawEstatePlacement } from '../src/stichos/estate-art.ts';
import { surfaceSignMarkers } from '../src/stichos/map-signs.ts';
import { ESTATE_STATIONS, type StationKind } from '../src/stichos/property-world.ts';
import type { WorldSign } from '../src/stichos/world-signs.ts';

test('station preview covers the exact authority cells and uses their visual centre', () => {
  for (const kind of Object.keys(ESTATE_STATIONS) as StationKind[]) {
    const f = estatePlacementFootprint({ kind, worldX: -2.1, worldY: 5.1 })!;
    assert.equal(f.width, ESTATE_STATIONS[kind].width);
    assert.equal(f.height, ESTATE_STATIONS[kind].height);
    assert.equal(f.x, -2);
    assert.equal(f.y, 5);
    assert.equal(f.center.x, (f.x + (f.x + f.width - 1)) / 2);
    assert.equal(f.center.y, (f.y + (f.y + f.height - 1)) / 2);
  }
  assert.equal(estatePlacementFootprint({ kind: 'store', worldX: Infinity, worldY: 0 }), null);
  assert.equal(estatePlacementFootprint({ kind: 'garden', worldX: 10000001, worldY: 0 }), null);
});

test('placement preview remains a neutral review state and has non-colour blocked feedback', () => {
  const labels: string[] = [],
    rectangles: number[][] = [];
  const c = new Proxy(
    {
      globalAlpha: 1,
      measureText: (s: string) => ({ width: s.length * 6 }),
      fillText: (s: string) => labels.push(s),
      strokeRect: (...args: number[]) => rectangles.push(args),
    },
    { get: (o, k) => (k in o ? o[k as keyof typeof o] : () => {}) },
  ) as unknown as CanvasRenderingContext2D;
  drawEstatePlacement(
    c,
    { kind: 'garden', worldX: 10, worldY: 20 },
    (p) => ({ x: p.x * 32, y: p.y * 32 }),
    32,
  );
  assert.ok(labels.includes('2 × 2 · Preview'));
  assert.equal(rectangles.length, 4);
  assert.deepEqual(rectangles[0], [304, 624, 32, 32]);
  drawEstatePlacement(c, { kind: 'garden', worldX: 10, worldY: 20, allowed: false }, (p) => p, 32);
  assert.ok(labels.includes('2 × 2 · Blocked'));
  assert.ok(labels.every((s) => !s.includes('Approved')));
});

function sign(id: string, x: number, y: number, symbol: WorldSign['symbol'] = 'home'): WorldSign {
  return {
    id,
    x,
    y,
    spaceId: 'surface',
    symbol,
    mapSymbol: symbol,
    title: id,
    compactTitle: id,
    subtitle: '',
    lines: [],
    inspectDistance: 3,
    accessibleLabel: id,
  };
}
test('map glyphs come only from actual explored surface signs and preserve sign identity', () => {
  const seen: string[] = [];
  const input = [
    sign('known', 10, 0, 'workshop'),
    sign('fog', -10, 0),
    { ...sign('deep', 0, 10), spaceId: 'underground:1' },
    sign('outside', 1000, 0),
  ];
  const before = structuredClone(input);
  const markers = surfaceSignMarkers(input, { x: 0, y: 0, scale: 5 }, 240, 150, (x, y) => {
    seen.push(`${x},${y}`);
    return x !== -10;
  });
  assert.deepEqual(
    markers.map((m) => [m.id, m.sign.mapSymbol]),
    [['known', 'workshop']],
  );
  assert.equal(markers[0].x, 170);
  assert.equal(markers[0].y, 75);
  assert.deepEqual(input, before);
  assert.ok(!seen.includes('0,10'), 'underground signs must never consult surface fog');
});
test('map signs declutter deterministically, protect player marker and bound dense-town work', () => {
  const dense = Array.from({ length: 1000 }, (_, i) =>
    sign(`sign:${String(i).padStart(4, '0')}`, (i % 40) - 20, Math.floor(i / 40) - 10),
  );
  const view = { x: 0, y: 0, scale: 8 };
  let calls = 0;
  const markers = surfaceSignMarkers(
    dense,
    view,
    400,
    250,
    () => {
      calls++;
      return true;
    },
    { x: 0, y: 0 },
  );
  assert.ok(calls <= 128);
  assert.ok(markers.length <= 32);
  for (const m of markers) assert.ok(Math.hypot(m.x - 200, m.y - 125) >= m.size / 2 + 7);
  for (let i = 0; i < markers.length; i++)
    for (let j = i + 1; j < markers.length; j++)
      assert.ok(
        Math.abs(markers[i].x - markers[j].x) >= markers[i].size + 3 ||
          Math.abs(markers[i].y - markers[j].y) >= markers[i].size + 3,
      );
  assert.deepEqual(
    markers,
    surfaceSignMarkers(dense, view, 400, 250, () => true, { x: 0, y: 0 }),
  );
  assert.deepEqual(
    surfaceSignMarkers(dense, { ...view, scale: 0.1 }, 400, 250, () => {
      throw Error('Coarse maps must not scan individual signs');
    }),
    [],
  );
});
