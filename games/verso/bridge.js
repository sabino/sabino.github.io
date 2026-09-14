import {
  LEGACY_PATH,
  RELEASE_PATH,
  isLegacyNavigation,
  projectURL,
  readRelease,
} from './release.js';

/** The URL (including invitations) and origin storage remain untouched. */
async function openGame() {
  if (!isLegacyNavigation(location.href, location.origin))
    throw new Error('Unexpected legacy address');
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    // Registration never forces a waiting worker to replace an open game.
    void navigator.serviceWorker
      .register(`${LEGACY_PATH}sw.js`, {
        scope: LEGACY_PATH,
        type: 'module',
        updateViaCache: 'none',
      })
      .then((registration) => {
        registration.active?.postMessage({ type: 'VERSO_BRIDGE_REFRESH' });
      })
      .catch(() => {});
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let release;
  try {
    release = await readRelease(
      await fetch(RELEASE_PATH, {
        cache: 'no-store',
        credentials: 'same-origin',
        mode: 'same-origin',
        redirect: 'error',
        signal: controller.signal,
      }),
      controller.signal,
    );
  } finally {
    clearTimeout(timer);
  }
  const integrity = (path) =>
    `sha256-${btoa(String.fromCharCode(...release.assets[path].sha256.match(/../g).map((hex) => parseInt(hex, 16))))}`;
  await Promise.all(
    release.stylesheets.map(
      (path) =>
        new Promise((resolve, reject) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = projectURL(path, location.origin);
          link.integrity = integrity(path);
          link.crossOrigin = 'anonymous';
          link.onload = resolve;
          link.onerror = () => reject(new Error('Verso styles are unavailable'));
          document.head.append(link);
        }),
    ),
  );
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = projectURL(release.entrypoint, location.origin);
    script.integrity = integrity(release.entrypoint);
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Verso could not load this release'));
    document.head.append(script);
  });
  document.getElementById('legacy-status')?.remove();
}

void openGame().catch(() => {
  const status = document.getElementById('legacy-status');
  if (!status) return;
  status.textContent =
    'Verso could not finish opening. Your saved life has not been changed. Reconnect and reload, or open the new address: ';
  const link = document.createElement('a');
  link.href = `/verso/${location.search}${location.hash}`;
  link.textContent = 'Open Verso';
  status.append(link);
});
