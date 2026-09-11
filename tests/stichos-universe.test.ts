import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planetAt,
  publicRoomCode,
  sectorPlanets,
  readRoomLink,
  roomLink,
  roomAddress,
  readRoomAddress,
  readRoomInput,
  roomTitle,
  validRoomCode,
  STICHOS_SEED,
} from '../src/stichos/universe.ts';
import { worldNodeEndpoint } from '../src/stichos/world-node.ts';

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

test('complete room addresses decode a planet offline, survive sharing and detect typos', () => {
  for (const seed of [0, 8, 3886, 4294967295])
    for (const generation of [1, 2, 3, 4] as const) {
      const invite = { seed, generation, room: 'ABCDEF1234567890', endpoint: 'peer:' };
      const code = roomAddress(invite);
      assert.deepEqual(readRoomAddress(code.toLowerCase()), invite);
      assert.deepEqual(readRoomInput(code), invite);
      const link = roomLink('https://sabino.pro/games/verso/', invite);
      assert.equal(new URL(link).searchParams.size, 1);
      assert.deepEqual(readRoomInput(link), invite);
      for (let i = 0; i < code.length; i++) {
        if (code[i] === '-') continue;
        const changed = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
        assert.equal(readRoomAddress(changed), null, changed);
      }
    }
  assert.equal(readRoomAddress('ABCDEF1234'), null);
  assert.equal(roomTitle('ABCDEF1234'), roomTitle('abcdef1234'));
});

test('old invitation URLs remain valid and a corrupt new address never falls back to other query values', () => {
  const old = 'https://sabino.pro/games/verso/?room=ABCD&planet=8&g=4';
  assert.deepEqual(readRoomLink(old), { room: 'ABCD', seed: 8, generation: 4, endpoint: 'peer:' });
  assert.equal(readRoomLink(old + '&join=broken'), null);
});

test('hosted room codes include the planet and default node without a separate server URL', () => {
  for (const seed of [0, 8, 0xffffffff]) {
    const invite = {
      seed,
      generation: 4 as const,
      room: '0123456789ABCDEF',
      endpoint: worldNodeEndpoint(),
    };
    const code = roomAddress(invite);
    assert.match(code, /^N4-/);
    assert.deepEqual(readRoomInput(code), invite);
    const link = roomLink('https://sabino.pro/games/verso/', invite);
    assert.equal(new URL(link).searchParams.size, 1);
    assert.deepEqual(readRoomInput(link), invite);
    const peer = { ...invite, endpoint: 'peer:' };
    assert.match(roomAddress(peer), /^V4-/);
    assert.deepEqual(readRoomInput(roomAddress(peer)), peer);
  }
});

test('persistent public frequencies have a separate signing namespace from browser frequencies', () => {
  const endpoint = worldNodeEndpoint();
  for (const seed of [0, 8, 0xffffffff]) {
    const room = publicRoomCode(seed, 4, endpoint);
    assert.match(room, /^P4[A-Z0-9]{7}$/);
    assert.notEqual(room, publicRoomCode(seed, 4, 'peer:'));
    const invite = { seed, generation: 4 as const, room, endpoint, public: true };
    assert.deepEqual(readRoomInput(roomAddress(invite)), invite);
    assert.deepEqual(readRoomLink(roomLink('https://sabino.pro/games/verso/', invite)), invite);
    const custom = { ...invite, endpoint: 'wss://other.example/ws' };
    const link = roomLink('https://sabino.pro/games/verso/', custom);
    assert.equal(new URL(link).searchParams.get('server'), custom.endpoint);
    assert.deepEqual(readRoomLink(link), custom);
  }
});
