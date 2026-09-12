import { detectAppMode } from './app-mode.ts';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPrompt | null = null;
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as InstallPrompt;
});
let installObserved = false;
let launchObserved = false;
const launchQueue = (
  window as Window & { launchQueue?: { setConsumer: (callback: () => void) => void } }
).launchQueue;
export function appMode() {
  return detectAppMode({
    matches: (query) => matchMedia(query).matches,
    iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    launchQueueSupported: !!launchQueue,
    launchObserved,
    installObserved,
  });
}
export function installed() {
  return appMode().installedWindow;
}
function changed() {
  dispatchEvent(new Event('verso-app-mode-change'));
}
addEventListener('appinstalled', () => {
  installObserved = true;
  changed();
});
for (const mode of ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen']) {
  const query = matchMedia(`(display-mode: ${mode})`);
  if (query.addEventListener) query.addEventListener('change', changed);
  else query.addListener?.(changed);
}
// Merely having LaunchQueue does not mean this window was installed. Never act on
// untrusted launch URLs/files here; normal room invitation parsing owns navigation.
try {
  launchQueue?.setConsumer(() => {
    launchObserved = true;
    changed();
  });
} catch {}
export async function requestInstall(): Promise<string> {
  if (installed()) return 'Verso is already running as an installed app.';
  if (deferred) {
    const prompt = deferred;
    deferred = null;
    try {
      await prompt.prompt();
      return (await prompt.userChoice).outcome === 'accepted'
        ? 'Verso is being added to your apps.'
        : 'You can install later from this menu.';
    } catch {
      return 'Installation did not finish. Use your browser’s Install or Add to Home Screen option to try again.';
    }
  }
  if (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
    return 'On iPhone or iPad: open Verso in Safari, tap Share, then Add to Home Screen. Your progress stays in this browser; keep using the same installation.';
  return 'Open your browser menu and choose Install Verso or Add to Home Screen. Desktop Chrome and Edge also show an install icon in the address bar.';
}
