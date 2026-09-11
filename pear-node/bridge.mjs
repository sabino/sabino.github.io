import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyRoomCheckpoint, roomCheckpointTopic } from '../src/stichos/room-checkpoint.ts';

const MAX_MESSAGE = 4 * 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/;
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) =>
  object(value) && Object.keys(value).every((key) => keys.includes(key));
const appearance = (value) =>
  only(value, [
    'seed',
    'skin',
    'hair',
    'coat',
    'trim',
    'trousers',
    'height',
    'build',
    'hairStyle',
    'hat',
    'cloak',
    'weapon',
    'weaponSeed',
    'artifactDesign',
  ]);
const enemy = (value) =>
  only(value, [
    'id',
    'x',
    'y',
    'seed',
    'name',
    'role',
    'clan',
    'appearance',
    'maxHp',
    'hp',
    'home',
    'speed',
    'heading',
    'phase',
    'hostile',
    'cooldown',
    'intent',
  ]) &&
  appearance(value.appearance) &&
  only(value.home, ['x', 'y']) &&
  (!value.intent ||
    only(value.intent, [
      'kind',
      'heading',
      'remaining',
      'duration',
      'range',
      'color',
      'targetId',
      'damage',
    ]));
/** Reject private backups and even signed unknown fields; this feed has a public-only schema. */
export function publicCheckpointShape(value) {
  try {
    if (
      !only(value, [
        'version',
        'authority',
        'revision',
        'previous',
        'createdAt',
        'state',
        'signature',
        'hash',
      ]) ||
      !only(value.authority, ['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg'])
    )
      return false;
    const s = value.state,
      c = s.combat,
      n = c.snapshot;
    return (
      only(s, [
        'version',
        'room',
        'seed',
        'generation',
        'removed',
        'opened',
        'combat',
        'combatEvent',
        'machines',
        'chat',
        'chatSerial',
        'productionReceipts',
      ]) &&
      only(c, ['snapshot', 'records', 'serial', 'contributors', 'cooldowns']) &&
      only(n, ['seq', 'enemies', 'projectiles', 'dead', 'peaceful']) &&
      n.enemies.every(enemy) &&
      c.records.every(enemy) &&
      n.projectiles.every((p) =>
        only(p, [
          'id',
          'actorId',
          'owner',
          'x',
          'y',
          'heading',
          'remaining',
          'speed',
          'damage',
          'color',
          'effect',
          'artifactDesign',
          'actorBodyId',
          'strikeId',
        ]),
      ) &&
      c.cooldowns.every((row) => only(row[1], ['attack', 'ward'])) &&
      s.machines.every((m) => only(m, ['id', 'ownerId', 'kind', 'x', 'y'])) &&
      s.productionReceipts.every((r) => only(r, ['ownerId', 'machineId', 'jobId', 'sourceId'])) &&
      s.chat.every(
        (m) =>
          m.channel === 'world' &&
          only(m, ['id', 'room', 'channel', 'peerId', 'name', 'text', 'x', 'y', 'at']),
      )
    );
  } catch {
    return false;
  }
}
class BridgeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function atomicJson(path, value) {
  const temporary = `${path}.new`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, path);
}
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Native optional service. Hypercore keys are public read capabilities, never game signing keys. */
export async function createPearBridge({
  directory,
  token,
  port = 0,
  host = '127.0.0.1',
  allowedOrigins = ['http://localhost:4173', 'http://localhost:4174'],
  bootstrap,
  follow = [],
  maxFeeds = 32,
  maxFeedBytes = 256 * 1024 * 1024,
  onError = () => {},
} = {}) {
  if (!directory) throw new Error('A dedicated storage directory is required.');
  if (!Number.isInteger(port) || port < 0 || port > 65535 || typeof host !== 'string' || !host)
    throw new Error('Invalid HTTP bind address.');
  if (token !== undefined && (typeof token !== 'string' || token.length < 24))
    throw new Error('Use an upload token of at least 24 characters.');
  if (
    !Number.isInteger(maxFeeds) ||
    maxFeeds < 1 ||
    maxFeeds > 128 ||
    !Number.isSafeInteger(maxFeedBytes) ||
    maxFeedBytes < MAX_MESSAGE
  )
    throw new Error('Invalid feed limits.');
  if (
    !Array.isArray(allowedOrigins) ||
    allowedOrigins.some((origin) => {
      try {
        return new URL(origin).origin !== origin;
      } catch {
        return true;
      }
    })
  )
    throw new Error('Origins must be exact URL origins.');
  const root = resolve(directory);
  await mkdir(join(root, 'latest'), { recursive: true, mode: 0o700 });
  const store = new Corestore(join(root, 'cores'));
  await store.ready();
  const swarm = new Hyperswarm({ maxPeers: 16, ...(bootstrap !== undefined ? { bootstrap } : {}) });
  const feeds = new Map(),
    latest = new Map(),
    writes = new Map(),
    scans = new Set();
  let closing = false,
    registryWrite = Promise.resolve();
  swarm.on('connection', (socket) => {
    socket.on('error', (error) => {
      if (!closing) onError(error);
    });
    store.replicate(socket);
  });
  const registryPath = join(root, 'feeds.json');
  function metadata(feed) {
    return {
      key: feed.key,
      topic: feed.topic ?? null,
      writable: !!feed.name,
      length: feed.core.length,
      bytes: feed.core.byteLength,
      revision: feed.topic ? (latest.get(feed.topic)?.revision ?? 0) : 0,
      error: feed.error ?? null,
    };
  }
  function persistRegistry() {
    const task = registryWrite
      .catch(() => {})
      .then(() =>
        atomicJson(registryPath, {
          version: 1,
          feeds: [...feeds.values()].map((f) => ({
            key: f.key,
            ...(f.name ? { name: f.name } : {}),
            ...(f.topic ? { topic: f.topic } : {}),
          })),
        }),
      );
    registryWrite = task;
    return task;
  }
  function queue(key, fn) {
    const previous = writes.get(key) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(fn);
    writes.set(key, task);
    task
      .finally(() => {
        if (writes.get(key) === task) writes.delete(key);
      })
      .catch(() => {});
    return task;
  }
  async function acceptRecord(feed, checkpoint) {
    if (!publicCheckpointShape(checkpoint) || !(await verifyRoomCheckpoint(checkpoint)))
      throw new BridgeError(422, 'A valid signed public world checkpoint is required.');
    const topic = await roomCheckpointTopic(checkpoint);
    if (feed.topic && feed.topic !== topic)
      throw new BridgeError(409, 'This feed is pinned to another world authority.');
    return queue(`accepted:${topic}`, async () => {
      const pinned = latest.get(topic);
      if (pinned?.hash === checkpoint.hash) return topic;
      if (!(await verifyRoomCheckpoint(checkpoint, pinned)))
        throw new BridgeError(409, 'Checkpoint conflicts with the pinned authority or revision.');
      await atomicJson(join(root, 'latest', `${topic}.json`), checkpoint);
      latest.set(topic, structuredClone(checkpoint));
      if (!feed.topic) {
        feed.topic = topic;
        await persistRegistry();
      }
      return topic;
    });
  }
  function scan(feed) {
    if (closing || feed.scanning) return;
    const task = (async () => {
      feed.scanning = true;
      try {
        if (feed.core.byteLength > maxFeedBytes) {
          feed.download?.destroy();
          feed.error = 'Feed exceeds configured storage limit.';
          return;
        }
        while (!closing && feed.cursor < feed.core.length) {
          const index = feed.cursor,
            buffer = await feed.core.get(index, { timeout: 1500 });
          if (!buffer) break;
          if (buffer.byteLength > MAX_MESSAGE) {
            feed.error = 'Oversized public checkpoint block.';
            feed.cursor++;
            continue;
          }
          let checkpoint;
          try {
            checkpoint = JSON.parse(buffer.toString('utf8'));
          } catch {
            feed.error = 'Invalid checkpoint JSON.';
            feed.cursor++;
            continue;
          }
          try {
            await acceptRecord(feed, checkpoint);
            feed.error = null;
          } catch (error) {
            // Old append-log entries naturally precede the durable latest pin on restart.
            const old = feed.topic ? latest.get(feed.topic) : null;
            if (
              !(
                old &&
                checkpoint.revision < old.revision &&
                publicCheckpointShape(checkpoint) &&
                (await verifyRoomCheckpoint(checkpoint))
              )
            )
              feed.error = error.message;
          }
          feed.cursor++;
        }
      } catch (error) {
        if (!closing) {
          feed.error = error.message;
          onError(error);
        }
      } finally {
        feed.scanning = false;
      }
    })();
    scans.add(task);
    task.finally(() => scans.delete(task)).catch(() => {});
    return task;
  }
  async function openFeed(record, persist = true) {
    if (feeds.has(record.key)) return feeds.get(record.key);
    if (feeds.size >= maxFeeds) throw new BridgeError(507, 'The node feed limit is reached.');
    const core = record.name
      ? store.get({ name: record.name })
      : store.get({ key: Buffer.from(record.key, 'hex') });
    await core.ready();
    const key = core.key.toString('hex');
    if (record.key && record.key !== key) {
      await core.close();
      throw new Error('Stored feed key does not match its local writer.');
    }
    const feed = { ...record, key, core, cursor: 0, scanning: false, download: null, error: null };
    feeds.set(key, feed);
    if (record.topic) {
      const checkpoint = await readJson(join(root, 'latest', `${record.topic}.json`));
      if (checkpoint) {
        if (
          !publicCheckpointShape(checkpoint) ||
          !(await verifyRoomCheckpoint(checkpoint)) ||
          (await roomCheckpointTopic(checkpoint)) !== record.topic
        )
          throw new Error('Stored public checkpoint is corrupt.');
        latest.set(record.topic, checkpoint);
      }
    }
    if (persist) await persistRegistry();
    core.on('append', () => {
      if (!feed.name) scan(feed);
    });
    core.on('download', () => {
      if (!feed.name) scan(feed);
    });
    core.on('error', (error) => {
      if (!closing) onError(error);
    });
    if (!record.name) {
      feed.download = core.download({ start: 0, end: -1 });
      feed.download.done().catch((error) => {
        if (!closing) onError(error);
      });
    }
    feed.discovery = swarm.join(core.discoveryKey, { server: true, client: true });
    await scan(feed);
    return feed;
  }
  try {
    const registry = await readJson(registryPath);
    if (registry) {
      if (
        registry.version !== 1 ||
        !Array.isArray(registry.feeds) ||
        registry.feeds.length > maxFeeds
      )
        throw new Error('Invalid feed registry.');
      for (const record of registry.feeds) {
        if (
          !object(record) ||
          !HEX.test(record.key) ||
          (record.topic !== undefined && !HEX.test(record.topic)) ||
          (record.name !== undefined && record.name !== `world:${record.topic}`)
        )
          throw new Error('Invalid feed registry entry.');
        await openFeed(record, false);
      }
    }
    for (const key of follow) {
      if (typeof key !== 'string' || !HEX.test(key))
        throw new Error('A replica needs a 64-digit public Hypercore key.');
      await openFeed({ key });
    }
  } catch (error) {
    closing = true;
    await swarm.clear();
    await swarm.destroy({ force: true });
    await store.close();
    throw error;
  }
  async function publish(checkpoint) {
    const raw = Buffer.from(JSON.stringify(checkpoint));
    if (raw.length > MAX_MESSAGE) throw new BridgeError(413, 'Checkpoint exceeds 4 MiB.');
    if (!publicCheckpointShape(checkpoint) || !(await verifyRoomCheckpoint(checkpoint)))
      throw new BridgeError(422, 'Only verified public checkpoints may be published.');
    const topic = await roomCheckpointTopic(checkpoint);
    return queue(topic, async () => {
      const pinned = latest.get(topic);
      if (!(await verifyRoomCheckpoint(checkpoint, pinned)))
        throw new BridgeError(409, 'Checkpoint conflicts with this pinned world.');
      let feed = [...feeds.values()].find((f) => f.topic === topic);
      if (feed && !feed.name)
        throw new BridgeError(
          409,
          'This node follows that world read-only; publish to its writer node.',
        );
      if (!feed) {
        const core = store.get({ name: `world:${topic}` });
        await core.ready();
        const key = core.key.toString('hex');
        await core.close();
        feed = await queue('registry', () => openFeed({ key, name: `world:${topic}`, topic }));
      }
      if (pinned?.hash === checkpoint.hash)
        return { topic, key: feed.key, revision: pinned.revision, duplicate: true };
      if (feed.core.byteLength + raw.length > maxFeedBytes)
        throw new BridgeError(507, 'The world feed storage limit is reached.');
      await feed.core.append(raw);
      await acceptRecord(feed, checkpoint);
      return { topic, key: feed.key, revision: checkpoint.revision, duplicate: false };
    });
  }
  const origins = new Set(allowedOrigins),
    secret = token ? Buffer.from(token) : null;
  const authorized = (request) => {
    const value = request.headers.authorization;
    const presented =
      typeof value === 'string' && value.startsWith('Bearer ')
        ? Buffer.from(value.slice(7))
        : Buffer.alloc(0);
    return !!secret && presented.length === secret.length && timingSafeEqual(presented, secret);
  };
  function respond(response, status, value, origin) {
    response.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    });
    response.end(JSON.stringify(value));
  }
  async function body(request) {
    if (Number(request.headers['content-length']) > MAX_MESSAGE)
      throw new BridgeError(413, 'Request exceeds 4 MiB.');
    if (request.headers['content-type']?.split(';')[0] !== 'application/json')
      throw new BridgeError(415, 'Use application/json.');
    let length = 0;
    const chunks = [];
    for await (const chunk of request) {
      length += chunk.length;
      if (length > MAX_MESSAGE) throw new BridgeError(413, 'Request exceeds 4 MiB.');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new BridgeError(400, 'Invalid JSON.');
    }
  }
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    try {
      const address = server.address(),
        hosts = new Set([
          `127.0.0.1:${address.port}`,
          `localhost:${address.port}`,
          `${host}:${address.port}`,
        ]);
      if (!hosts.has(request.headers.host))
        throw new BridgeError(403, 'Host is not this configured node.');
      if (origin && !origins.has(origin)) throw new BridgeError(403, 'Origin is not permitted.');
      const path = new URL(request.url, 'http://127.0.0.1').pathname;
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'access-control-allow-origin': origin ?? 'null',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'Authorization, Content-Type',
          vary: 'Origin',
        });
        response.end();
        return;
      }
      if (request.method === 'GET' && path === '/health') {
        respond(
          response,
          200,
          {
            ok: true,
            transport: 'hypercore+hyperswarm',
            feeds: feeds.size,
            peers: swarm.connections.size,
          },
          origin,
        );
        return;
      }
      if (request.method === 'GET' && path === '/api/feeds') {
        respond(response, 200, { feeds: [...feeds.values()].map(metadata) }, origin);
        return;
      }
      const match = path.match(/^\/api\/checkpoints\/([a-f0-9]{64})$/);
      if (request.method === 'GET' && match) {
        const checkpoint = latest.get(match[1]);
        respond(
          response,
          checkpoint ? 200 : 404,
          checkpoint ?? { error: 'No verified replica for this topic.' },
          origin,
        );
        return;
      }
      if (request.method !== 'POST' || !['/api/checkpoints', '/api/replicas'].includes(path))
        throw new BridgeError(404, 'Unknown node endpoint.');
      if (!authorized(request))
        throw new BridgeError(401, 'An authorized node upload token is required.');
      const value = await body(request);
      if (path === '/api/checkpoints') {
        const result = await publish(value);
        respond(response, result.duplicate ? 200 : 201, result, origin);
        return;
      }
      if (!only(value, ['key']) || typeof value.key !== 'string' || !HEX.test(value.key))
        throw new BridgeError(422, 'Provide a 64-digit public Hypercore key.');
      const result = await queue('registry', () => openFeed({ key: value.key }));
      respond(response, 201, metadata(result), origin);
    } catch (error) {
      if (!response.headersSent)
        respond(
          response,
          error.status ?? 500,
          { error: error.status ? error.message : 'Node storage or replication failed.' },
          origins.has(origin) ? origin : undefined,
        );
      if (!error.status) onError(error);
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    closing = true;
    for (const f of feeds.values()) f.download?.destroy();
    await swarm.clear();
    await swarm.destroy({ force: true });
    await store.close();
    throw error;
  }
  let closePromise;
  return {
    url: `http://${host}:${server.address().port}`,
    publish,
    feeds: () => [...feeds.values()].map(metadata),
    async follow(key) {
      if (!HEX.test(key)) throw Error('Invalid public key.');
      return metadata(await queue('registry', () => openFeed({ key })));
    },
    async flush() {
      await swarm.flush();
      await Promise.allSettled([...feeds.values()].map((f) => scan(f)));
    },
    async close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        closing = true;
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await Promise.allSettled([...writes.values()]);
        for (const f of feeds.values()) f.download?.destroy();
        await swarm.clear();
        await swarm.destroy({ force: true });
        await store.close();
        await Promise.allSettled([...scans]);
        await registryWrite.catch(() => {});
      })();
      return closePromise;
    },
  };
}
