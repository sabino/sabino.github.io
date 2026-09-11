import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { connectionAddress, worldNodeConfig } from '../server/config.mjs';
import { createCoopServer } from '../server/coop.mjs';
import { MULTIPLAYER_PROTOCOL } from '../src/stichos/multiplayer-protocol.ts';
import { appearance } from '../src/stichos/world.ts';

const publicCode = (seed: number, generation: number) =>
  `P${generation}${(seed >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
const joinIdentity = (extra = {}) => ({
  type: 'join',
  protocol: MULTIPLAYER_PROTOCOL,
  seed: 3886,
  generation: 3,
  name: 'World traveler',
  appearance: appearance(42, 'pilgrim', 1),
  position: { x: 0, y: 5 },
  ...extra,
});
async function openSocket(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await once(socket, 'open');
  return socket;
}
async function request(socket: WebSocket, packet: unknown) {
  const incoming = once(socket, 'message');
  socket.send(JSON.stringify(packet));
  return JSON.parse((await incoming)[0].toString());
}

test('production requires HTTPS origins and persistent absolute storage with bounded limits', () => {
  const env = {
    NODE_ENV: 'production',
    VERSO_PUBLIC_ORIGIN: 'https://sabino.pro',
    VERSO_WORLD_STORAGE: '/data/worlds',
    VERSO_PAYMENT_STORAGE: '/data/payments',
    VERSO_TRUST_PROXY_HOPS: '1',
  };
  const config = worldNodeConfig(env);
  assert.equal(config.trustedProxyHops, 1);
  assert.equal(config.maxRooms, 64);
  assert.deepEqual(config.allowedOrigins, ['https://sabino.pro']);
  assert.throws(() => worldNodeConfig({ ...env, VERSO_PUBLIC_ORIGIN: '' }), /require/);
  assert.throws(
    () => worldNodeConfig({ ...env, VERSO_PUBLIC_ORIGIN: 'http://sabino.pro' }),
    /HTTPS/,
  );
  assert.throws(() => worldNodeConfig({ ...env, VERSO_WORLD_STORAGE: './worlds' }), /absolute/);
  assert.throws(() => worldNodeConfig({ ...env, VERSO_MAX_ROOMS: 'Infinity' }), /integer/);
  assert.throws(() => worldNodeConfig({ ...env, VERSO_TRUST_PROXY_HOPS: '5' }), /integer/);
  assert.equal(worldNodeConfig({}).trustedProxyHops, 0);
});

test('proxy addresses use only the configured rightmost hop, never the untrusted prefix', () => {
  const request = (value: any) => ({
    socket: { remoteAddress: '172.18.0.2' },
    headers: { 'x-forwarded-for': value },
  });
  assert.equal(connectionAddress(request('198.51.100.1')), '172.18.0.2');
  assert.equal(connectionAddress(request('203.0.113.99, 198.51.100.1'), 1), '198.51.100.1');
  assert.equal(connectionAddress(request('203.0.113.99, 198.51.100.1'), 2), '203.0.113.99');
  assert.equal(connectionAddress(request('198.51.100.1'), 2), '172.18.0.2');
  assert.equal(connectionAddress(request('untrusted, invalid'), 1), '172.18.0.2');
  assert.equal(connectionAddress(request(['198.51.100.1']), 1), '172.18.0.2');
  assert.equal(connectionAddress(request('2001:db8::1'), 1), '2001:db8::1');
});

test('real websocket limits separate clients behind a trusted reverse proxy', async (t) => {
  const server = createCoopServer({ trustedProxyHops: 1, maxConnectionsPerIp: 1 });
  const address: any = await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const connect = (forwarded: string) => {
    const socket = new WebSocket(url, { headers: { 'x-forwarded-for': forwarded } });
    socket.on('error', () => {});
    return socket;
  };
  const a = connect('198.51.100.1');
  await once(a, 'open');
  const b = connect('198.51.100.2');
  await once(b, 'open');
  const forged = connect('203.0.113.99, 198.51.100.1');
  await assert.rejects(once(forged, 'open'), /403/);
  assert.equal(server.hub.connections.size, 2);
});

test('failed durable checkpoint reports unhealthy and shutdown still closes live sockets', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verso-world-node-'));
  const server = createCoopServer({ persistenceDirectory: directory });
  const address: any = await server.listen(0, '127.0.0.1');
  t.after(async () => {
    await server.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });
  const health = () => fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal((await health()).status, 200);
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(socket, 'open');
  const incoming = once(socket, 'message');
  socket.send(
    JSON.stringify({
      type: 'join',
      protocol: MULTIPLAYER_PROTOCOL,
      seed: 3886,
      generation: 3,
      name: 'Durable traveler',
      appearance: appearance(42, 'pilgrim', 1),
      position: { x: 0, y: 5 },
    }),
  );
  const welcome = JSON.parse((await incoming)[0].toString());
  assert.equal(welcome.type, 'welcome');
  await server.checkpoint();
  // Replace this test's storage mount with a regular file: deterministic write failure even as root.
  await rm(directory, { recursive: true });
  await writeFile(directory, 'unavailable mount');
  await assert.rejects(server.checkpoint());
  const response = await health();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).storageHealthy, false);
  const closed = once(socket, 'close');
  await assert.rejects(server.close());
  await closed;
  assert.equal(server.http.listening, false);
});

test('recovered storage becomes healthy again after a successful checkpoint', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verso-world-recovery-'));
  const server = createCoopServer({ persistenceDirectory: directory });
  const address: any = await server.listen(0, '127.0.0.1');
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(socket, 'open');
  const incoming = once(socket, 'message');
  socket.send(
    JSON.stringify({
      type: 'join',
      protocol: MULTIPLAYER_PROTOCOL,
      seed: 3886,
      generation: 3,
      name: 'Recovery traveler',
      appearance: appearance(42, 'pilgrim', 1),
      position: { x: 0, y: 5 },
    }),
  );
  await incoming;
  await server.checkpoint();
  await rm(directory, { recursive: true });
  await writeFile(directory, 'unavailable mount');
  await assert.rejects(server.checkpoint());
  await rm(directory);
  await mkdir(directory);
  await server.checkpoint();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).storageHealthy, true);
});

test('public planet creation is atomic and survives empty rooms and a node restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verso-public-world-'));
  let clock = Date.now();
  let server = createCoopServer({ persistenceDirectory: directory, now: () => clock });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  let address: any = await server.listen(0, '127.0.0.1');
  const a = await openSocket(address.port);
  const b = await openSocket(address.port);
  const room = publicCode(3886, 3);
  const [first, second] = await Promise.all([
    request(a, joinIdentity({ room, publicWorld: true })),
    request(b, joinIdentity({ room, publicWorld: true, name: 'Another traveler' })),
  ]);
  assert.equal(first.type, 'welcome');
  assert.equal(second.type, 'welcome');
  assert.equal(first.room, room);
  assert.equal(second.room, room);
  assert.equal(server.hub.rooms.size, 1);
  const closed = Promise.all([once(a, 'close'), once(b, 'close')]);
  a.close();
  b.close();
  await closed;
  clock += 7 * 24 * 60 * 60 * 1000;
  server.hub.sweep();
  assert.equal(server.hub.rooms.size, 1, 'durable public worlds do not expire when empty');
  await server.close();
  server = createCoopServer({ persistenceDirectory: directory, now: () => clock });
  address = await server.listen(0, '127.0.0.1');
  const returning = await openSocket(address.port);
  const restored = await request(
    returning,
    joinIdentity({ room, publicWorld: true, resumeToken: first.resumeToken }),
  );
  assert.equal(restored.type, 'welcome');
  assert.equal(restored.peerId, first.peerId);
  assert.equal(restored.room, room);
  assert.equal(server.hub.rooms.size, 1);
});

test('public creation requires the exact planet code; unknown private rooms stay missing', async (t) => {
  const server = createCoopServer({ maxRooms: 1, durable: true });
  const address: any = await server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  const socket = await openSocket(address.port);
  const wrongPlanet = await request(
    socket,
    joinIdentity({ room: publicCode(3887, 3), publicWorld: true }),
  );
  assert.equal(wrongPlanet.code, 'invalid_join');
  const wrongType = await request(
    socket,
    joinIdentity({ room: publicCode(3886, 3), publicWorld: 'true' }),
  );
  assert.equal(wrongType.code, 'invalid_join');
  const noFlag = await request(socket, joinIdentity({ room: publicCode(3886, 3) }));
  assert.equal(noFlag.code, 'room_missing');
  const wrongNamespace = await request(
    socket,
    joinIdentity({ room: 'ABCDEF1234567890', publicWorld: true }),
  );
  assert.equal(wrongNamespace.code, 'invalid_join');
  assert.equal(server.hub.rooms.size, 0);
  const privateWelcome = await request(socket, joinIdentity());
  assert.match(privateWelcome.room, /^[0-9A-F]{16}$/);
  const other = await openSocket(address.port);
  const full = await request(other, joinIdentity({ room: publicCode(3886, 3), publicWorld: true }));
  assert.equal(full.code, 'server_full');
  assert.equal(server.hub.rooms.size, 1, 'capacity never silently evicts a durable world');
});
