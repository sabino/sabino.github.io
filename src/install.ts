interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPrompt | null = null;
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as InstallPrompt;
});
export function installed() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
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
