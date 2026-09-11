import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planetAt,
  publicRoomCode,
  sectorPlanets,
  readRoomLink,
  roomLink,
  validRoomCode,
  STICHOS_SEED,
} from '../src/stichos/universe.ts';

test('planet addresses and neighboring sectors are shared deterministic coordinates', () => {
  assert.deepEqual(sectorPlanets(12), sectorPlanets(12));
  const origin = planetAt(STICHOS_SEED);
  assert.equal(origin.name, 'Stíchos');
  assert.equal(sectorPlanets()[0].id, origin.id);
  assert.equal(new Set(sectorPlanets(12).map((p) => p.id)).size, 48);
  assert.notDeepEqual(sectorPlanets(12), sectorPlanets(13));
  assert.equal(planetAt(123).id, planetAt(123).id);
  assert.notEqual(planetAt(123, 2).id, planetAt(123, 3).id);
  for (const p of sectorPlanets(-10))
    assert.ok(p.x >= -900 && p.x <= 900 && p.y >= -550 && p.y <= 550);
});
test('room URLs carry the exact world under nested hosting and discard unrelated query state', () => {
  const invite = { room: 'ABCDEF1234', seed: 0, generation: 3 as const, endpoint: 'peer:' };
  const link = roomLink('https://sabino.pro/games/verso/?lab=1#old', invite);
  assert.equal(new URL(link).pathname, '/games/verso/');
  assert.equal(new URL(link).hash, '');
  assert.equal(new URL(link).searchParams.has('lab'), false);
  assert.deepEqual(readRoomLink(link), invite);
  const node = {
    ...invite,
    seed: 4294967295,
    generation: 1 as const,
    endpoint: 'wss://world.example.test/verso/ws',
  };
  assert.deepEqual(readRoomLink(roomLink(link, node)), node);
  assert.equal(validRoomCode(' abcd1234 '), 'ABCD1234');
});
test('untrusted invitations cannot smuggle credentials, downgrade TLS, inject paths or wrap seeds', () => {
  const base = 'https://sabino.pro/games/verso/?room=ABCD&planet=123&g=3';
  for (const endpoint of [
    'javascript:alert(1)',
    'https://example.test',
    'ws://example.test',
    'wss://user:secret@example.test/ws',
  ])
    assert.equal(readRoomLink(base + '&server=' + encodeURIComponent(endpoint)), null);
  for (const seed of ['-1', '4294967296', 'Infinity', '1.2', '1e2', '0x123', ''])
    assert.equal(readRoomLink(base.replace('planet=123', `planet=${seed}`)), null);
  assert.equal(readRoomLink(base.replace('g=3', 'g=9')), null);
  assert.equal(validRoomCode('../../host'), null);
  assert.equal(validRoomCode('<script>'), null);
  assert.equal(readRoomLink('not a URL'), null);
});

test('public planet frequencies rendezvous deterministically without sharing rooms between versions', () => {
  assert.equal(publicRoomCode(3886), publicRoomCode(3886));
  assert.notEqual(publicRoomCode(3886, 2), publicRoomCode(3886, 3));
  assert.notEqual(publicRoomCode(3886), publicRoomCode(3887));
  for (const seed of [0, 3886, 4294967295])
    assert.equal(validRoomCode(publicRoomCode(seed)), publicRoomCode(seed));
});
