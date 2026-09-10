import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildOffline } from '../scripts/build-offline.mjs';

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'verso-offline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'assets'));
  await mkdir(path.join(directory, 'art'));
  await writeFile(path.join(directory, 'index.html'), '<main>Verso fixture</main>');
  await writeFile(path.join(directory, 'manifest.webmanifest'), '{"name":"Verso"}');
  await writeFile(path.join(directory, 'icon.svg'), '<svg></svg>');
  await writeFile(path.join(directory, 'assets/game-123.js'), 'console.log("Verso")');
  await writeFile(path.join(directory, 'art/verge.png'), 'fixture art bytes');
  return directory;
}

type FetchRequest = { url: string; method?: string; mode?: string };

/** Execute the actual generated worker with a small in-memory Cache API. */
async function worker(directory: string, scope = 'https://verso.test/games/verso/') {
  const handlers = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const installed: Request[] = [];
  let claimed = 0;
  let networkCalls = 0;
  let network: (request: FetchRequest) => Promise<Response> = async () => new Response('network');
  const cacheApi = {
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async addAll(requests: Request[]) {
          installed.push(...requests);
          for (const request of requests)
            store.set(request.url, new Response(`cached:${new URL(request.url).pathname}`));
        },
        async match(key: string) {
          return store.get(key)?.clone();
        },
        async put(key: string, response: Response) {
          store.set(key, response.clone());
        },
      };
    },
  };
  const context = vm.createContext({
    URL,
    Request,
    Response,
    encodeURIComponent,
    self: {
      registration: { scope },
      clients: {
        async claim() {
          claimed++;
        },
      },
      addEventListener(name: string, handler: (event: any) => void) {
        handlers.set(name, handler);
      },
    },
    caches: cacheApi,
    async fetch(request: FetchRequest) {
      networkCalls++;
      return network(request);
    },
  });
  new vm.Script(await readFile(path.join(directory, 'sw.js'), 'utf8')).runInContext(context);
  return {
    stores,
    installed,
    get claimed() {
      return claimed;
    },
    get networkCalls() {
      return networkCalls;
    },
    setNetwork(handler: (request: FetchRequest) => Promise<Response>) {
      network = handler;
    },
    async lifecycle(name: string) {
      let pending: Promise<void> | undefined;
      handlers.get(name)!({
        waitUntil(promise: Promise<void>) {
          pending = promise;
        },
      });
      await pending;
    },
    request(url: string, options: { method?: string; mode?: string } = {}) {
      let response: Promise<Response> | undefined;
      handlers.get('fetch')!({
        request: { url, method: options.method ?? 'GET', mode: options.mode ?? 'cors' },
        respondWith(promise: Promise<Response>) {
          response = promise;
        },
      });
      return response;
    },
  };
}

test('offline build versions every asset by content and is stable across repeated builds', async (t) => {
  const directory = await fixture(t);
  const first = await buildOffline(directory);
  const firstWorker = await readFile(path.join(directory, 'sw.js'), 'utf8');
  const second = await buildOffline(directory);
  assert.deepEqual(second, first);
  assert.equal(await readFile(path.join(directory, 'sw.js'), 'utf8'), firstWorker);
  assert.ok(first.assets.includes('./index.html'));
  assert.ok(first.assets.includes('./assets/game-123.js'));
  assert.ok(first.assets.includes('./art/verge.png'));
  assert.ok(!first.assets.includes('./sw.js'));
  await writeFile(path.join(directory, 'art/verge.png'), 'changed art bytes');
  assert.notEqual((await buildOffline(directory)).version, first.version);
});

test('precache paths encode special filenames and omit source maps and hidden files', async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'art/scene #1?.png'), 'special asset');
  await writeFile(path.join(directory, 'assets/game.js.map'), 'source map');
  await writeFile(path.join(directory, '.private'), 'not for the app');
  const result = await buildOffline(directory);
  assert.ok(result.assets.includes('./art/scene%20%231%3F.png'));
  assert.ok(
    !result.assets.some((asset: string) => asset.endsWith('.map') || asset.includes('.private')),
  );
  for (const asset of result.assets) {
    const resolved = new URL(asset, 'https://verso.test/sub/path/');
    assert.equal(resolved.origin, 'https://verso.test');
    assert.ok(resolved.pathname.startsWith('/sub/path/'));
  }
});

test('offline build rejects symlinks and incomplete app output', async (t) => {
  const directory = await fixture(t);
  await symlink(path.join(directory, 'index.html'), path.join(directory, 'art/link.html'));
  await assert.rejects(buildOffline(directory), /symbolic links/);
  await rm(path.join(directory, 'art/link.html'));
  await rm(path.join(directory, 'index.html'));
  await assert.rejects(buildOffline(directory), /missing index\.html/);
});

test('worker precaches every local asset under its deployment subpath', async (t) => {
  const directory = await fixture(t);
  const result = await buildOffline(directory);
  const runtime = await worker(directory);
  await runtime.lifecycle('install');
  assert.equal(runtime.installed.length, result.assets.length);
  for (const request of runtime.installed) {
    assert.equal(new URL(request.url).origin, 'https://verso.test');
    assert.ok(new URL(request.url).pathname.startsWith('/games/verso/'));
    assert.equal(request.method, 'GET');
    assert.equal(request.mode, 'same-origin');
    assert.equal(request.redirect, 'error');
    assert.equal(request.cache, 'reload');
  }
});

test('activation deletes only obsolete caches for this exact application scope', async (t) => {
  const directory = await fixture(t);
  const result = await buildOffline(directory);
  const runtime = await worker(directory);
  const prefix = `verso-offline:${encodeURIComponent('https://verso.test/games/verso/')}:`;
  const nested = `verso-offline:${encodeURIComponent('https://verso.test/games/verso/:branch/')}:old`;
  const other = `verso-offline:${encodeURIComponent('https://verso.test/other/')}:old`;
  runtime.stores.set(`${prefix}old`, new Map());
  runtime.stores.set(`${prefix}${result.version}`, new Map());
  runtime.stores.set(nested, new Map());
  runtime.stores.set(other, new Map());
  runtime.stores.set('unrelated-app', new Map());
  await runtime.lifecycle('activate');
  assert.ok(!runtime.stores.has(`${prefix}old`));
  assert.ok(runtime.stores.has(`${prefix}${result.version}`));
  assert.ok(runtime.stores.has(nested));
  assert.ok(runtime.stores.has(other));
  assert.ok(runtime.stores.has('unrelated-app'));
  assert.equal(runtime.claimed, 1);
});

test('navigation prefers the network and falls back to the installed entry while offline', async (t) => {
  const directory = await fixture(t);
  await buildOffline(directory);
  const runtime = await worker(directory);
  await runtime.lifecycle('install');
  const url = 'https://verso.test/games/verso/?resume=1';
  const online = await runtime.request(url, { mode: 'navigate' });
  assert.equal(await online!.text(), 'network');
  runtime.setNetwork(async () => {
    throw new Error('offline');
  });
  const offline = await runtime.request(url, { mode: 'navigate' });
  assert.equal(await offline!.text(), 'cached:/games/verso/index.html');
  runtime.setNetwork(async () => new Response('server unavailable', { status: 503 }));
  const unavailable = await runtime.request(url, { mode: 'navigate' });
  assert.equal(await unavailable!.text(), 'cached:/games/verso/index.html');
});

test('known assets work offline without network calls; other requests are untouched', async (t) => {
  const directory = await fixture(t);
  await buildOffline(directory);
  const runtime = await worker(directory);
  await runtime.lifecycle('install');
  runtime.setNetwork(async () => {
    throw new Error('offline');
  });
  const asset = await runtime.request('https://verso.test/games/verso/assets/game-123.js?v=2');
  assert.equal(await asset!.text(), 'cached:/games/verso/assets/game-123.js');
  assert.equal(runtime.networkCalls, 0);
  assert.equal(runtime.request('https://cdn.example/game.js'), undefined);
  assert.equal(
    runtime.request('https://verso.test/other/index.html', { mode: 'navigate' }),
    undefined,
  );
  assert.equal(
    runtime.request('https://verso.test/games/verso-other/index.html', { mode: 'navigate' }),
    undefined,
  );
  assert.equal(runtime.request('https://verso.test/games/verso/api/session'), undefined);
  assert.equal(
    runtime.request('https://verso.test/games/verso/index.html', { method: 'POST' }),
    undefined,
  );
});

test('manifest remains portable to a static subpath with the supplied local icon', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.name, 'Verso');
  assert.equal(manifest.short_name, 'Verso');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#031b24');
  const icon = manifest.icons.find((item: { src: string }) => item.src === './icon.svg');
  assert.equal(icon.sizes, 'any');
  assert.equal(icon.type, 'image/svg+xml');
  assert.ok(
    (await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')).includes('<svg'),
  );
});
