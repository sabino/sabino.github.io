import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import createTestnet from '@hyperswarm/testnet';
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';
import { InfiniteWorld } from '../../src/stichos/world.ts';
import { createPearBridge } from '../bridge.mjs';
import {
  createRoomSigningIdentity,
  signRoomCheckpoint,
  roomCheckpointTopic,
} from '../../src/stichos/room-checkpoint.ts';

const TOKEN = 'local-test-upload-capability-64characters-keep-off-the-public-feed';
const emptyState = () => ({
  version: 1,
  room: 'PEAR3886',
  seed: 3886,
  generation: 3,
  removed: [],
  opened: [],
  combat: {
    snapshot: { seq: 0, enemies: [], projectiles: [], dead: [], peaceful: [] },
    records: [],
    serial: 0,
    contributors: [],
    cooldowns: [],
  },
  combatEvent: 0,
  machines: [],
  chat: [],
  chatSerial: 0,
  productionReceipts: [],
});
const post = (node, path, value, headers = {}) =>
  fetch(`${node.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...headers },
    body: JSON.stringify(value),
  });
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  let value;
  while (Date.now() < end) {
    value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.fail('Timed out waiting for actual Hyperswarm replication.');
}
async function checkpoint(node, topic) {
  const r = await fetch(`${node.url}/api/checkpoints/${topic}`);
  return r.ok ? r.json() : null;
}

test(
  'generation-four electronic enemy equipment and clothing context replicate exactly between native nodes and survive restart',
  { timeout: 45000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'verso-pear-g4-')),
      network = await createTestnet(3);
    let writer, reader;
    const options = (name) => ({
      directory: join(directory, name),
      token: TOKEN,
      bootstrap: network.bootstrap,
      onError: () => {},
    });
    t.after(async () => {
      await writer?.close();
      await reader?.close();
      await network.destroy();
      await rm(directory, { recursive: true, force: true });
    });
    writer = await createPearBridge(options('writer'));
    reader = await createPearBridge(options('reader'));
    const npc = new InfiniteWorld(8, 4).npcsAround(96, -32, 16).find((n) => n.role === 'raider');
    assert(npc.appearance.weaponSeed > 0xffffffff);
    assert.equal(npc.appearance.technology, 3);
    npc.hp -= 7;
    const state = { ...emptyState(), seed: 8, generation: 4, room: 'G4PEAR88' };
    state.combat.snapshot.enemies = [npc];
    state.combat.records = [npc];
    const key = await createRoomSigningIdentity(),
      first = await signRoomCheckpoint(state, key);
    const published = await post(writer, '/api/checkpoints', first);
    assert.equal(published.status, 201);
    const receipt = await published.json();
    assert.equal((await post(reader, '/api/replicas', { key: receipt.key })).status, 201);
    const replicated = await until(async () => {
      const value = await checkpoint(reader, receipt.topic);
      return value?.hash === first.hash ? value : null;
    });
    assert.deepEqual(replicated.state.combat.records[0].appearance, npc.appearance);
    assert.equal(replicated.state.generation, 4);
    await writer.close();
    await reader.close();
    writer = await createPearBridge(options('writer'));
    reader = await createPearBridge(options('reader'));
    for (const node of [writer, reader]) {
      const restored = await checkpoint(node, receipt.topic);
      assert.equal(
        restored.state.combat.records[0].appearance.weaponSeed,
        npc.appearance.weaponSeed,
      );
      assert.equal(restored.state.combat.records[0].appearance.technology, 3);
      assert.equal(restored.state.combat.records[0].hp, npc.hp);
    }
    const nextState = structuredClone(state);
    nextState.combat.records[0].hp = npc.hp - 3;
    nextState.combat.snapshot.enemies[0].hp = npc.hp - 3;
    const second = await signRoomCheckpoint(nextState, key, first);
    assert.equal((await post(writer, '/api/checkpoints', second)).status, 201);
    await until(async () => (await checkpoint(reader, receipt.topic))?.hash === second.hash);
  },
);

test(
  'two native nodes discover over a local DHT, replicate signed updates, and both resume their disk state',
  { timeout: 45000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'verso-pear-')),
      network = await createTestnet(3);
    let writer, reader;
    t.after(async () => {
      await writer?.close();
      await reader?.close();
      await network.destroy();
      await rm(directory, { recursive: true, force: true });
    });
    const options = (name) => ({
      directory: join(directory, name),
      token: TOKEN,
      bootstrap: network.bootstrap,
      onError: () => {},
    });
    writer = await createPearBridge(options('writer'));
    reader = await createPearBridge(options('reader'));
    const authority = await createRoomSigningIdentity(),
      first = await signRoomCheckpoint(emptyState(), authority);
    const sent = await post(writer, '/api/checkpoints', first);
    assert.equal(sent.status, 201);
    const receipt = await sent.json();
    assert.match(receipt.key, /^[a-f0-9]{64}$/);
    assert.equal(receipt.topic, await roomCheckpointTopic(first));
    const subscribed = await post(reader, '/api/replicas', { key: receipt.key });
    assert.equal(subscribed.status, 201);
    const mirrored = await until(async () => {
      const value = await checkpoint(reader, receipt.topic);
      return value?.hash === first.hash ? value : null;
    });
    assert.deepEqual(mirrored, first);
    assert.ok(
      (await (await fetch(`${reader.url}/health`)).json()).peers > 0,
      'Two distinct native swarms established a real encrypted connection.',
    );
    const state = emptyState();
    state.removed.push('origin:cequin');
    state.opened.push('origin:hall:door:1');
    const npc = new InfiniteWorld(3886, 3).npcsAround(40, 40, 48).find((n) => n.role === 'raider');
    state.combat.snapshot.enemies.push(npc);
    state.combat.records.push(npc);
    state.machines.push({ id: 'machine:1', ownerId: 'resident', kind: 'garden', x: 40, y: 40 });
    state.chat.push({
      id: 1,
      room: state.room,
      channel: 'world',
      peerId: 'resident',
      name: 'A resident',
      text: 'The garden is planted.',
      x: 40,
      y: 40,
      at: 1,
    });
    state.chatSerial = 1;
    const second = await signRoomCheckpoint(state, authority, first);
    assert.equal((await post(writer, '/api/checkpoints', second)).status, 201);
    await until(async () => (await checkpoint(reader, receipt.topic))?.hash === second.hash);
    const duplicate = await post(writer, '/api/checkpoints', second);
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicate, true);
    assert.equal(writer.feeds()[0].length, 2);
    await writer.close();
    await reader.close();
    writer = await createPearBridge(options('writer'));
    reader = await createPearBridge(options('reader'));
    assert.equal((await checkpoint(writer, receipt.topic)).hash, second.hash);
    assert.equal((await checkpoint(reader, receipt.topic)).hash, second.hash);
    assert.equal(writer.feeds()[0].key, receipt.key);
    assert.equal(reader.feeds()[0].writable, false);
    assert.equal(
      (await post(writer, '/api/checkpoints', first)).status,
      409,
      'Restart retains the monotonic revision pin.',
    );
    const third = await signRoomCheckpoint(
      { ...state, opened: [...state.opened, 'another-door'] },
      authority,
      second,
    );
    assert.equal((await post(writer, '/api/checkpoints', third)).status, 201);
    await until(async () => (await checkpoint(reader, receipt.topic))?.hash === third.hash);
    const publicCache = await readFile(
      join(directory, 'reader', 'latest', `${receipt.topic}.json`),
      'utf8',
    );
    assert.equal(publicCache.includes(TOKEN), false);
    assert.equal(publicCache.includes(authority.privateKey.d), false);
    assert.equal(
      (await post(reader, '/api/checkpoints', third)).status,
      409,
      'A mirror cannot acquire the feed writer capability.',
    );
  },
);

test(
  'HTTP authorization, origins, public-only shape and cryptographic pins reject unsafe or conflicting uploads',
  { timeout: 20000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'verso-pear-check-')),
      network = await createTestnet(2);
    const node = await createPearBridge({
      directory,
      token: TOKEN,
      bootstrap: network.bootstrap,
      allowedOrigins: ['https://game.example'],
    });
    t.after(async () => {
      await node.close();
      await network.destroy();
      await rm(directory, { recursive: true, force: true });
    });
    const authority = await createRoomSigningIdentity(),
      first = await signRoomCheckpoint(emptyState(), authority),
      topic = await roomCheckpointTopic(first);
    assert.equal(
      (await post(node, '/api/checkpoints', first, { authorization: 'Bearer wrong' })).status,
      401,
    );
    assert.equal(
      (await post(node, '/api/checkpoints', first, { origin: 'https://other.example' })).status,
      403,
    );
    const okay = await post(node, '/api/checkpoints', first, { origin: 'https://game.example' });
    assert.equal(okay.status, 201);
    assert.equal(okay.headers.get('access-control-allow-origin'), 'https://game.example');
    const changed = structuredClone(first);
    changed.state.removed.push('forged');
    assert.equal((await post(node, '/api/checkpoints', changed)).status, 422);
    const privateState = { ...emptyState(), ownerBackup: { resumeToken: 'not-public' } };
    await assert.rejects(signRoomCheckpoint(privateState, authority, first));
    const privateData = { ...first, state: privateState };
    assert.equal(
      (await post(node, '/api/checkpoints', privateData)).status,
      422,
      'Even signed private/unknown fields cannot enter replication.',
    );
    const localSpeech = {
      ...emptyState(),
      chat: [
        {
          id: 1,
          room: 'PEAR3886',
          channel: 'say',
          peerId: 'one',
          name: 'Resident',
          text: 'Proximity only',
          x: 0,
          y: 5,
          at: 1,
        },
      ],
      chatSerial: 1,
    };
    await assert.rejects(signRoomCheckpoint(localSpeech, authority, first));
    assert.equal(
      (await post(node, '/api/checkpoints', { ...first, state: localSpeech })).status,
      422,
    );
    const second = await signRoomCheckpoint(
      { ...emptyState(), removed: ['first-valid'] },
      authority,
      first,
    );
    assert.equal((await post(node, '/api/checkpoints', second)).status, 201);
    const equivocation = await signRoomCheckpoint(
      { ...emptyState(), removed: ['conflicting-valid'] },
      authority,
      first,
    );
    assert.equal((await post(node, '/api/checkpoints', equivocation)).status, 409);
    assert.equal((await checkpoint(node, topic)).hash, second.hash);
    assert.equal(node.feeds()[0].length, 2);
    const wrongAuthority = await createRoomSigningIdentity(),
      alien = await signRoomCheckpoint(emptyState(), wrongAuthority, second);
    assert.notEqual(
      await roomCheckpointTopic(alien),
      topic,
      'Another signing authority is an explicitly different world topic, not an overwrite.',
    );
    assert.equal((await checkpoint(node, topic)).hash, second.hash);
  },
);

test(
  'a malicious feed block is not exposed even when its Hypercore transport signature is valid',
  { timeout: 20000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'verso-pear-untrusted-')),
      network = await createTestnet(2);
    const store = new Corestore(join(directory, 'publisher'));
    await store.ready();
    const core = store.get({ name: 'untrusted-author' });
    await core.ready();
    const swarm = new Hyperswarm({ bootstrap: network.bootstrap });
    swarm.on('connection', (socket) => {
      socket.on('error', () => {});
      store.replicate(socket);
    });
    swarm.join(core.discoveryKey, { server: true, client: true });
    const reader = await createPearBridge({
      directory: join(directory, 'reader'),
      bootstrap: network.bootstrap,
      follow: [core.key.toString('hex')],
    });
    t.after(async () => {
      await reader.close();
      await swarm.clear();
      await swarm.destroy({ force: true });
      await store.close();
      await network.destroy();
      await rm(directory, { recursive: true, force: true });
    });
    const authority = await createRoomSigningIdentity(),
      first = await signRoomCheckpoint(emptyState(), authority),
      topic = await roomCheckpointTopic(first);
    await core.append(Buffer.from(JSON.stringify(first)));
    await until(async () => (await checkpoint(reader, topic))?.hash === first.hash);
    const forged = structuredClone(first);
    forged.revision = 2;
    forged.state.removed = ['unverified-removal'];
    await core.append(Buffer.from(JSON.stringify(forged)));
    await until(() => reader.feeds()[0].error);
    assert.equal(
      (await checkpoint(reader, topic)).hash,
      first.hash,
      'Invalid author signature cannot replace the verified world.',
    );
    const foreign = await signRoomCheckpoint({ ...emptyState(), seed: 92 }, authority);
    await core.append(Buffer.from(JSON.stringify(foreign)));
    await until(() => reader.feeds()[0].error?.includes('another world'));
    assert.equal(
      await checkpoint(reader, await roomCheckpointTopic(foreign)),
      null,
      'A feed cannot change its pinned planet.',
    );
    const second = await signRoomCheckpoint(
      { ...emptyState(), removed: ['verified-removal'] },
      authority,
      first,
    );
    await core.append(Buffer.from(JSON.stringify(second)));
    await until(async () => (await checkpoint(reader, topic))?.hash === second.hash);
    assert.equal(
      reader.feeds()[0].error,
      null,
      'A later valid checkpoint recovers after bad blocks.',
    );
  },
);

test(
  'concurrent publications respect the feed cap and oversized requests fail before appending',
  { timeout: 20000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'verso-pear-limits-')),
      network = await createTestnet(2);
    const node = await createPearBridge({
      directory,
      token: TOKEN,
      bootstrap: network.bootstrap,
      maxFeeds: 1,
    });
    t.after(async () => {
      await node.close();
      await network.destroy();
      await rm(directory, { recursive: true, force: true });
    });
    const authority = await createRoomSigningIdentity();
    const first = await signRoomCheckpoint(emptyState(), authority);
    const second = await signRoomCheckpoint({ ...emptyState(), seed: 90 }, authority);
    const responses = await Promise.all([
      post(node, '/api/checkpoints', first),
      post(node, '/api/checkpoints', second),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 507]);
    assert.equal(node.feeds().length, 1);
    assert.equal(node.feeds()[0].length, 1);
    const oversized = await post(node, '/api/checkpoints', {
      padding: 'x'.repeat(4 * 1024 * 1024),
    });
    assert.equal(oversized.status, 413);
    assert.equal(node.feeds()[0].length, 1);
  },
);
