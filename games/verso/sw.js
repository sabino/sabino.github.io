import {
  LEGACY_PATH,
  PROJECT_PATH,
  RELEASE_PATH,
  isLegacyNavigation,
  projectURL,
  readBounded,
  readRelease,
} from './release.js';

/** Dependency injection lets tests execute this exact worker without a browser or game. */
export function createBridgeWorker(env) {
  const scope = new URL(env.registration.scope);
  if (scope.pathname !== LEGACY_PATH) throw new Error('Bridge scope must remain the legacy URL');
  const origin = scope.origin;
  const prefix = `verso-legacy-bridge:${encodeURIComponent(scope.href)}:`;
  const legacyPrefix = `verso-offline:${encodeURIComponent(scope.href)}:`;
  const stateName = `${prefix}state`;
  const stateURL = new URL(`${LEGACY_PATH}.bridge-state`, origin).href;
  const releaseURL = new URL(RELEASE_PATH, origin).href;
  const shell = ['index.html', 'bridge.js', 'release.js', 'manifest.webmanifest'].map(
    (path) => new URL(LEGACY_PATH + path, origin).href,
  );
  let updating;
  const hex = (bytes) =>
    [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const digest = async (bytes) => hex(await env.crypto.subtle.digest('SHA-256', bytes));
  const request = (url) =>
    new Request(url, {
      cache: 'reload',
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
    });
  async function network(url, consume) {
    const controller = new AbortController();
    const timer = (env.setTimeout ?? setTimeout)(() => controller.abort(), 30000);
    try {
      const response = await env.fetch(new Request(request(url), { signal: controller.signal }));
      return await consume(response, controller.signal);
    } finally {
      (env.clearTimeout ?? clearTimeout)(timer);
    }
  }
  async function staticResponse(url, maximum) {
    return network(url, async (response, signal) => {
      const bytes = await readBounded(response, maximum, signal);
      const headers = new Headers(response.headers);
      // Fetch already decoded transfer encoding; the cached body contains those decoded bytes.
      headers.delete('Content-Encoding');
      headers.delete('Content-Length');
      return { bytes, headers, status: response.status };
    });
  }
  async function state() {
    const response = await (await env.caches.open(stateName)).match(stateURL);
    if (!response) return {};
    const value = await response.json();
    return value &&
      typeof value.current === 'string' &&
      value.current.startsWith(`${prefix}release:`)
      ? value
      : {};
  }
  async function snapshot(name) {
    if (typeof name !== 'string' || !name.startsWith(`${prefix}release:`)) return;
    const cache = await env.caches.open(name);
    const response = await cache.match(releaseURL);
    if (!response) return;
    try {
      return { cache, release: await readRelease(response) };
    } catch {
      return;
    }
  }
  async function stage() {
    const release = await network(releaseURL, readRelease);
    const json = JSON.stringify(release);
    const name = `${prefix}release:${await digest(new TextEncoder().encode(json))}`;
    const before = await state();
    if (before.current === name && (await snapshot(name))) return;
    const cache = await env.caches.open(name);
    try {
      for (const [path, asset] of Object.entries(release.assets)) {
        // Canonical navigation belongs to /verso/'s worker. This bridge serves its
        // own legacy shell; edge-transformed, unused canonical HTML is not an asset
        // it needs to fetch or cache. Every other declared asset stays hash-checked.
        if (path === 'index.html') continue;
        const url = projectURL(path, origin);
        const response = await staticResponse(url, asset.bytes);
        const bytes = response.bytes;
        if (bytes.length !== asset.bytes || (await digest(bytes)) !== asset.sha256)
          throw new Error('Release asset integrity mismatch');
        await cache.put(
          url,
          new Response(bytes, { status: response.status, headers: response.headers }),
        );
      }
      for (const url of shell) {
        const response = await staticResponse(url, 128 * 1024);
        const bytes = response.bytes;
        await cache.put(
          url,
          new Response(bytes, { status: response.status, headers: response.headers }),
        );
      }
      // Completeness marker first, then one atomic pointer write. Never replace a working release halfway.
      await cache.put(
        releaseURL,
        new Response(json, { headers: { 'Content-Type': 'application/json' } }),
      );
      await (
        await env.caches.open(stateName)
      ).put(
        stateURL,
        new Response(JSON.stringify({ current: name, previous: before.current ?? null })),
      );
    } catch (error) {
      if (name !== before.current && name !== before.previous) await env.caches.delete(name);
      throw error;
    }
    const keep = new Set([name, before.current, stateName]);
    for (const key of await env.caches.keys()) {
      if (key.startsWith(`${prefix}release:`) && !keep.has(key)) await env.caches.delete(key);
    }
  }
  function refresh() {
    if (!updating) {
      // Cache API has no compare-and-swap. Active and installing workers must share
      // one origin-wide lock, including cleanup; a per-worker promise is insufficient.
      const locks = env.navigator?.locks;
      if (!locks) return Promise.reject(new Error('Safe bridge cache updates require Web Locks'));
      updating = locks.request(`${prefix}update`, stage).finally(() => {
        updating = undefined;
      });
    }
    return updating;
  }
  async function activate() {
    const current = await state();
    if (!(await snapshot(current.current)))
      throw new Error('Bridge has no complete offline release');
    // Only after successful install and normal activation; unrelated/new-project caches are untouched.
    for (const key of await env.caches.keys())
      if (key.startsWith(legacyPrefix)) await env.caches.delete(key);
    await env.clients.claim();
  }
  async function respond(request) {
    const current = await state();
    const installed = await snapshot(current.current);
    const url = new URL(request.url);
    if (request.mode === 'navigate') {
      const saved = await installed?.cache.match(shell[0]);
      if (saved) return saved;
      return env.fetch(request);
    }
    if (url.href === releaseURL && installed) return installed.cache.match(releaseURL);
    if (shell.includes(url.href) && installed) return installed.cache.match(url.href);
    const path = url.pathname.slice(PROJECT_PATH.length);
    for (const name of [current.current, current.previous]) {
      const entry = name === current.current ? installed : await snapshot(name);
      if (entry && Object.hasOwn(entry.release.assets, path)) {
        const saved = await entry.cache.match(url.href);
        if (saved) return saved;
      }
    }
    // Unknown requests never enter any cache (including APIs, media input and unrelated apps).
    return env.fetch(request);
  }
  function handles(request) {
    if (request.method !== 'GET') return false;
    const url = new URL(request.url);
    if (url.origin !== origin) return false;
    if (request.mode === 'navigate') return isLegacyNavigation(url.href, origin);
    if (url.search || url.hash) return false;
    return (
      url.href === releaseURL ||
      shell.includes(url.href) ||
      (url.pathname.startsWith(PROJECT_PATH) &&
        (() => {
          try {
            return projectURL(url.pathname.slice(PROJECT_PATH.length), origin) === url.href;
          } catch {
            return false;
          }
        })())
    );
  }
  return { refresh, activate, respond, handles, prefix, legacyPrefix };
}

if (typeof self !== 'undefined' && self.registration) {
  const bridge = createBridgeWorker(self);
  self.addEventListener('install', (event) => event.waitUntil(bridge.refresh()));
  self.addEventListener('activate', (event) => event.waitUntil(bridge.activate()));
  self.addEventListener('fetch', (event) => {
    if (bridge.handles(event.request)) event.respondWith(bridge.respond(event.request));
  });
  self.addEventListener('message', (event) => {
    if (
      event.data?.type !== 'VERSO_BRIDGE_REFRESH' ||
      !event.source?.url ||
      !isLegacyNavigation(event.source.url, new URL(self.registration.scope).origin)
    )
      return;
    event.waitUntil(bridge.refresh().catch(() => {}));
  });
}
