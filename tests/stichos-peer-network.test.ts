import test from 'node:test';
import assert from 'node:assert/strict';
import {
  peerNetworkOptions,
  hasTurnServer,
  peerFailure,
  selectedPeerRoute,
  validateIceServers,
} from '../src/stichos/peer-network.ts';

test('direct-only defaults do not advertise the dead bundled PeerJS relays', async () => {
  const options = await peerNetworkOptions({});
  assert.equal(hasTurnServer(options), false);
  assert.equal(options.config.iceTransportPolicy, 'all');
  assert.ok(!JSON.stringify(options).includes('turn.peerjs.com'));
  await assert.rejects(
    peerNetworkOptions({ VITE_PEER_RELAY_ONLY: 'true' }),
    /needs a configured TURN/,
  );
});
test('operator credential endpoint supports TURN TLS and never sends stored browser credentials', async () => {
  const servers = [
    {
      urls: ['turns:relay.example:443?transport=tcp'],
      username: 'short-lived-user',
      credential: 'temporary-secret',
    },
  ];
  const options = await peerNetworkOptions(
    { VITE_PEER_ICE_ENDPOINT: '/api/ice', VITE_PEER_RELAY_ONLY: 'true' },
    async (url, init) => {
      assert.equal(String(url), 'https://game.example/api/ice');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.redirect, 'error');
      return new Response(JSON.stringify({ iceServers: servers }));
    },
    'https://game.example/games/verso/',
  );
  assert.equal(hasTurnServer(options), true);
  assert.equal(options.config.iceTransportPolicy, 'relay');
  assert.deepEqual(options.config.iceServers, servers);
});
test('bad ICE and credential-service responses fail closed with useful errors', async () => {
  for (const servers of [
    [],
    [{ urls: 'https://relay.example' }],
    [{ urls: 'turn:relay.example' }],
    [{ urls: 'turn:user:secret@relay.example', username: 'u', credential: 'p' }],
  ])
    assert.throws(() => validateIceServers(servers));
  for (const endpoint of [
    'http://remote.example/ice',
    'https://u:p@relay.example/ice',
    'javascript:alert(1)',
  ])
    await assert.rejects(peerNetworkOptions({ VITE_PEER_ICE_ENDPOINT: endpoint }), /HTTPS/);
  await assert.rejects(
    peerNetworkOptions(
      { VITE_PEER_ICE_ENDPOINT: 'https://relay.example/ice' },
      async () => new Response('no', { status: 403 }),
    ),
    /refused/,
  );
  await assert.rejects(
    peerNetworkOptions(
      { VITE_PEER_ICE_ENDPOINT: 'https://relay.example/ice' },
      async () => new Response('not-json'),
    ),
    /invalid ICE/,
  );
});
test('network failures distinguish host absence, signalling and relay availability', () => {
  const d = { hosting: false, signalling: true, relayConfigured: false };
  assert.match(peerFailure('peer-unavailable', d).reason, /host is not online/);
  assert.match(peerFailure('socket-error', d).reason, /signalling service/);
  assert.match(peerFailure('ice-failed', d).reason, /no TURN relay/);
  assert.match(
    peerFailure('ice-failed', { ...d, relayConfigured: true }).reason,
    /configured TURN relay/,
  );
});
test('selected route diagnostics expose no network addresses or credentials', () => {
  const report = new Map([
    ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
    [
      'pair',
      {
        type: 'candidate-pair',
        localCandidateId: 'local',
        remoteCandidateId: 'remote',
        currentRoundTripTime: 0.027,
      },
    ],
    ['local', { candidateType: 'relay', address: '192.0.2.1', port: 1234 }],
    ['remote', { candidateType: 'srflx', address: '198.51.100.1', port: 5432 }],
  ]);
  assert.deepEqual(selectedPeerRoute(report as unknown as RTCStatsReport), {
    route: 'relay',
    roundTripMs: 27,
  });
  report.set('local', { candidateType: 'host', address: '192.0.2.1', port: 1234 });
  assert.deepEqual(selectedPeerRoute(report as unknown as RTCStatsReport), {
    route: 'direct',
    roundTripMs: 27,
  });
});
