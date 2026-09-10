/** Enable offline play after a production build has been loaded successfully. */
export async function registerOffline(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !('serviceWorker' in navigator)
  )
    return;

  try {
    const script = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
    if (script.origin !== window.location.origin) return;
    await navigator.serviceWorker.register(script.href, {
      scope: new URL('./', script).href,
      updateViaCache: 'none',
    });
  } catch {
    // Restricted storage, private browsing, or a failed precache must not stop
    // the game. Normal online play continues without an offline guarantee.
  }
}
