import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLISHED_WORLD_NODE,
  worldNodeEndpoint,
  validateWorldNode,
  preferredRoomEndpoint,
  hasCompleteRoomAddress,
} from '../src/stichos/world-node.ts';

test('world node configuration uses TLS and permits localhost development only', () => {
  assert.equal(worldNodeEndpoint({}), PUBLISHED_WORLD_NODE);
  for (const endpoint of [
    'wss://another.example/ws',
    'ws://localhost:4300/ws',
    'ws://127.0.0.1:4300/ws',
    'ws://[::1]:4300/ws',
  ])
    assert.equal(worldNodeEndpoint({ VITE_WORLD_NODE_URL: endpoint }), endpoint);
  for (const endpoint of [
    'ws://host.example/ws',
    'https://host.example/ws',
    'wss://user:secret@host.example/ws',
    'wss://host.example/ws?token=secret',
    'wss://host.example/ws#secret',
    'peer:',
    '',
  ])
    assert.throws(() => validateWorldNode(endpoint));
});

test('the old implicit browser default migrates without changing explicit peer or custom-node choices', () => {
  assert.equal(preferredRoomEndpoint(null), PUBLISHED_WORLD_NODE);
  assert.equal(preferredRoomEndpoint('peer:'), PUBLISHED_WORLD_NODE);
  assert.equal(preferredRoomEndpoint('peer:', true), 'peer:');
  assert.equal(preferredRoomEndpoint('wss://other.example/ws'), 'wss://other.example/ws');
  assert.equal(preferredRoomEndpoint('invalid'), PUBLISHED_WORLD_NODE);
  assert.equal(hasCompleteRoomAddress(PUBLISHED_WORLD_NODE), true);
  assert.equal(hasCompleteRoomAddress('peer:'), true);
  assert.equal(hasCompleteRoomAddress('wss://other.example/ws'), false);
});
