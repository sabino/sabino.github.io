import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactSignTitle,
  drawSignSymbol,
  inspectWorldSign,
  roadSign,
  signForProp,
  type SignSymbol,
} from '../src/stichos/world-signs.ts';
import { CivicWorld } from '../src/stichos/civic-world.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';
import type { Prop, Settlement, Tile } from '../src/stichos/types.ts';
const town: Settlement = {
  id: 'town',
  seed: 42,
  name: 'Cloudroot Reach',
  x: 0,
  y: 0,
  kind: 'village',
  rank: 'city',
  clan: 0,
  radius: 20,
};
const door: Prop = {
  id: 'house:door:1',
  building: 'house',
  x: 0,
  y: 1,
  kind: 'door',
  name: 'Cloudroot Residence',
  seed: 1,
  solid: true,
};
const tile: Tile = {
  x: 0,
  y: 1,
  seed: 1,
  terrain: 'floor',
  biome: 'settlement',
  height: 0,
  temperature: 12,
  detail: 1,
  building: 'house',
  buildingKind: 'house',
};
test('actual generated world doors produce useful signs tied to original building IDs', () => {
  const world = new InfiniteWorld(42, 4),
    settlements = world.settlementsAround(0, 0, 50),
    civic = new CivicWorld(42, world.civilization);
  let count = 0;
  for (const prop of world.propsAround(0, 0, 25)) {
    if (prop.kind !== 'door') continue;
    const t = world.tile(prop.x, prop.y),
      s = settlements.sort(
        (a, b) => Math.hypot(a.x - prop.x, a.y - prop.y) - Math.hypot(b.x - prop.x, b.y - prop.y),
      )[0];
    const sign = signForProp(prop, t, s, { actorId: 'player', hour: 12, civic });
    assert.ok(sign);
    assert.equal(sign.id, `sign:${prop.id}`);
    assert.equal(sign.title, prop.name);
    assert.ok(sign.lines.some((l) => l.key === 'sign.owner'));
    count++;
  }
  assert.ok(count >= 4);
});
test('home signs show real access, keeper, price, and full readable name without relying on color', () => {
  const sign = signForProp(door, tile, town, {
    actorId: 'player',
    hour: 12,
    ownerId: 'player',
    ownerName: 'Ari',
    price: 240,
  })!;
  assert.equal(sign.symbol, 'home');
  assert.equal(sign.access!.reason, 'owner');
  assert.match(sign.accessibleLabel, /Keeper: Ari/);
  assert.match(sign.accessibleLabel, /240 field coin/);
  assert.equal(sign.mapSymbol, sign.symbol);
  assert.equal(inspectWorldSign(sign, { x: 0, y: 1, spaceId: 'surface' }).ok, true);
  assert.equal(inspectWorldSign(sign, { x: 0, y: 1, spaceId: 'underground:a:1' }).ok, false);
  assert.equal(inspectWorldSign(sign, { x: 100, y: 1, spaceId: 'surface' }).ok, false);
});
test('sign content handles private doors, closed services, notices and long Unicode names honestly', () => {
  const long = '青葉🌿'.repeat(30);
  const sign = signForProp({ ...door, name: long }, { ...tile, buildingKind: 'workshop' }, town, {
    actorId: 'player',
    hour: 23,
    notices: ['Production awaits ore.'],
  })!;
  assert.equal(sign.access!.reason, 'closed');
  assert.match(sign.accessibleLabel, /opens at 06:00/);
  assert.equal(sign.title, long);
  assert.ok(Array.from(sign.compactTitle).length <= 30);
  assert.ok(sign.compactTitle.endsWith('…'));
  assert.match(sign.accessibleLabel, /Production awaits ore/);
  assert.equal(compactSignTitle('Short'), 'Short');
});
test('roads use surveyed settlements, semantic directions and truthful straight-line distances', () => {
  const sign = roadSign({ x: 0, y: 0 }, town, [
    town,
    { ...town, id: 'east', name: 'East House', x: 30, y: 0 },
    { ...town, id: 'south', name: 'South House', x: 0, y: 40 },
  ]);
  assert.match(sign.subtitle, /Straight-line/);
  assert.equal(sign.lines[0].values!.direction, 'east');
  assert.equal(sign.lines[0].values!.distance, 30);
  assert.equal(sign.lines[1].values!.direction, 'south');
  assert.match(roadSign({ x: 0, y: 0 }, town, []).accessibleLabel, /No other settlement/);
});
test('guild signs share the generated faction shape, charter and map symbol', () => {
  const civic = new CivicWorld(42),
    f = civic.factionsFor(town)[0];
  const sign = signForProp({ ...door, kind: 'banner' }, tile, town, {
    actorId: 'player',
    hour: 12,
    faction: f,
  })!;
  assert.deepEqual(sign.heraldry, f.heraldry);
  assert.match(sign.accessibleLabel, new RegExp(f.heraldry.symbol));
  assert.equal(sign.mapSymbol, 'guild');
  assert.equal(
    signForProp({ ...door, kind: 'rock' }, tile, town, { actorId: 'p', hour: 12 }),
    undefined,
  );
});
test('every original sign glyph has finite bounded geometry and balanced canvas state', () => {
  const symbols: SignSymbol[] = [
    'home',
    'inn',
    'temple',
    'workshop',
    'farm',
    'store',
    'civic',
    'guard',
    'guild',
    'road',
    'danger',
    'dungeon',
  ];
  const fingerprints = new Set<string>();
  for (const symbol of symbols) {
    const calls: unknown[][] = [];
    const c = new Proxy(
      {},
      {
        get:
          (_t, p) =>
          (...args: unknown[]) =>
            calls.push([p, ...args]),
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    drawSignSymbol(c, symbol, 0, 0, 24);
    assert.equal(calls[0][0], 'save');
    assert.equal(calls.at(-1)![0], 'restore');
    assert.ok(
      calls.every((a) => a.slice(1).every((n) => typeof n !== 'number' || Number.isFinite(n))),
    );
    fingerprints.add(JSON.stringify(calls));
  }
  assert.equal(fingerprints.size, symbols.length);
});

test('building silhouettes do not promise unimplemented or unverified services', () => {
  for (const kind of ['house', 'church', 'workshop', 'greenhouse', 'storehouse', 'hall'] as const) {
    const sign = signForProp(door, { ...tile, buildingKind: kind }, town, {
      actorId: 'player',
      hour: 12,
    })!;
    assert.equal(
      sign.lines.filter((l) => l.kind === 'service').length,
      0,
      `${kind} needs actual service evidence`,
    );
    assert.doesNotMatch(
      sign.accessibleLabel,
      /ceremonies|community aid|deliveries|guild production/i,
    );
  }
  const inn = signForProp(door, { ...tile, buildingKind: 'inn' }, town, {
    actorId: 'player',
    hour: 12,
  })!;
  assert.match(inn.accessibleLabel, /Hearth preparation.*ingredients/);
  assert.doesNotMatch(inn.accessibleLabel, /lodging|meals/i);
});

test('certified services, real owner and authority access override are reflected without duplicates', () => {
  const access = {
    allowed: true,
    reason: 'guest' as const,
    label: 'Your household invitation is current',
  };
  const sign = signForProp(door, tile, town, {
    actorId: 'guest',
    hour: 23,
    ownerId: 'owner',
    ownerName: 'Lina',
    services: ['storage', 'rest', 'storage'],
    access,
  })!;
  assert.deepEqual(sign.access, access);
  assert.match(sign.accessibleLabel, /Keeper: Lina/);
  assert.match(sign.accessibleLabel, /invitation is current/);
  assert.equal(sign.lines.filter((l) => l.key === 'sign.service.storage').length, 1);
  assert.equal(sign.lines.filter((l) => l.kind === 'service').length, 2);
  assert.match(sign.lines.find((l) => l.key === 'sign.district')!.text, /Cloudroot Reach/);
});

test('private unknown ownership and spoken names stay honest and bounded', () => {
  const sign = signForProp({ ...door, name: 'A\n' + '🌿'.repeat(500) }, tile, town, {
    actorId: 'player',
    hour: 12,
    notices: ['A\u0000'.repeat(200)],
  })!;
  assert.match(sign.lines.find((l) => l.key === 'sign.owner')!.text, /Private household/);
  assert.doesNotMatch(sign.accessibleLabel, /[\u0000-\u001f]/);
  assert.ok(Array.from(sign.title).length <= 180);
  assert.ok(sign.lines.every((l) => Array.from(l.text).length <= 180));
  assert.ok(sign.accessibleLabel.startsWith(sign.title));
});
