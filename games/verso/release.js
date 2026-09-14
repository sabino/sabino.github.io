/** Small shared contract for the old URL bridge. No game or storage code lives here. */
export const LEGACY_PATH = '/games/verso/';
export const PROJECT_PATH = '/verso/';
export const RELEASE_PATH = `${PROJECT_PATH}release.json`;
export const MAX_RELEASE_BYTES = 256 * 1024;
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const METADATA = new Set([
  'sourceRepository',
  'sourceBranch',
  'worldNodeSourceCommit',
  'worldEndpoint',
  'voiceEndpoint',
  'worldNodeEndpoint',
  'worldUrl',
  'voiceUrl',
  'version',
  'sourceDate',
  'frontendUrl',
  'legacyUrl',
  'codec',
]);
const CORE = new Set([
  'schema',
  'sourceCommit',
  'entrypoint',
  'stylesheets',
  'assets',
  'swVersion',
]);
const POISON = new Set(['__proto__', 'prototype', 'constructor']);

function record(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

/** Accept literal relative static paths only; URL normalization must never expand authority. */
export function validAssetPath(value) {
  if (typeof value !== 'string' || value.length > 180 || !/^[A-Za-z0-9_./-]+$/.test(value))
    return false;
  const parts = value.split('/');
  if (
    parts.some(
      (part) => !part || part === '.' || part === '..' || POISON.has(part) || part.startsWith('.'),
    )
  )
    return false;
  if (value === 'index.html' || value === 'manifest.webmanifest') return true;
  if (
    /^(?:icon(?:-maskable)?-(?:192|512)|apple-touch-icon|favicon-32)\.png$/.test(value) ||
    value === 'icon.svg'
  )
    return true;
  return /^(?:assets\/[A-Za-z0-9_/-]+\.(?:js|css|woff2?|ttf|png|svg|webp|avif|md)|art\/[A-Za-z0-9_/-]+\.(?:png|svg|webp|avif)|fonts\/[A-Za-z0-9_/-]+\.(?:ttf|woff2?|txt)|audio\/[A-Za-z0-9_/-]+\.(?:mp3|wav|ogg|json|md))$/.test(
    value,
  );
}

/** Return a fresh, bounded record; never merge arbitrary keys into application objects. */
export function validateRelease(input) {
  if (!record(input) || Object.keys(input).some((key) => !CORE.has(key) && !METADATA.has(key)))
    throw new Error('Unknown release manifest');
  if (
    input.schema !== 1 ||
    typeof input.sourceCommit !== 'string' ||
    typeof input.swVersion !== 'string' ||
    !/^[a-f0-9]{40}$/.test(input.sourceCommit) ||
    !/^[a-f0-9]{20,64}$/.test(input.swVersion)
  )
    throw new Error('Unsupported release identity');
  for (const key of METADATA) {
    if (
      Object.hasOwn(input, key) &&
      input[key] !== null &&
      (typeof input[key] !== 'string' || input[key].length > 1024)
    )
      throw new Error('Invalid release metadata');
  }
  if (!record(input.assets)) throw new Error('Missing release assets');
  const entries = Object.entries(input.assets);
  if (entries.length < 1 || entries.length > 512) throw new Error('Invalid release asset count');
  const assets = Object.create(null);
  let total = 0;
  for (const [name, asset] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (
      !validAssetPath(name) ||
      !record(asset) ||
      Object.keys(asset).sort().join(',') !== 'bytes,sha256' ||
      typeof asset.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 0 ||
      asset.bytes > MAX_ASSET_BYTES
    )
      throw new Error('Invalid release asset');
    total += asset.bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error('Release exceeds offline storage budget');
    assets[name] = { sha256: asset.sha256, bytes: asset.bytes };
  }
  if (
    typeof input.entrypoint !== 'string' ||
    !/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.js$/.test(input.entrypoint) ||
    !Object.hasOwn(assets, input.entrypoint)
  )
    throw new Error('Unknown release entrypoint');
  if (
    !Array.isArray(input.stylesheets) ||
    input.stylesheets.length > 32 ||
    new Set(input.stylesheets).size !== input.stylesheets.length ||
    input.stylesheets.some(
      (file) =>
        typeof file !== 'string' ||
        !file.startsWith('assets/') ||
        !file.endsWith('.css') ||
        !Object.hasOwn(assets, file),
    )
  )
    throw new Error('Unknown release stylesheet');
  return {
    schema: 1,
    sourceCommit: input.sourceCommit,
    entrypoint: input.entrypoint,
    stylesheets: [...input.stylesheets],
    assets,
    swVersion: input.swVersion,
  };
}

export function projectURL(path, origin) {
  if (!validAssetPath(path)) throw new Error('Unsafe project asset path');
  return new URL(PROJECT_PATH + path, origin).href;
}

export function isLegacyNavigation(value, origin) {
  const url = new URL(value);
  return (
    url.origin === origin &&
    (url.pathname === LEGACY_PATH || url.pathname === `${LEGACY_PATH}index.html`)
  );
}

export async function readBounded(response, maximum, signal) {
  if (!response.ok || response.type === 'opaque' || response.redirected)
    throw new Error('Static release request failed');
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > maximum)
    throw new Error('Static release response too large');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new Error('Static release request timed out');
      const next = await reader.read();
      if (signal?.aborted) throw new Error('Static release request timed out');
      if (next.done) break;
      length += next.value.length;
      if (length > maximum) throw new Error('Static release response too large');
      chunks.push(next.value);
    }
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function readRelease(response, signal) {
  return validateRelease(
    JSON.parse(new TextDecoder().decode(await readBounded(response, MAX_RELEASE_BYTES, signal))),
  );
}
