/** Display mode is an observation of this window, not proof of installation elsewhere. */
export type AppDisplayMode =
  | 'browser'
  | 'standalone'
  | 'minimal-ui'
  | 'window-controls-overlay'
  | 'fullscreen';
export interface AppModeSignals {
  matches: (query: string) => boolean;
  iosStandalone?: boolean;
  launchQueueSupported?: boolean;
  launchObserved?: boolean;
  installObserved?: boolean;
}
export function detectAppMode(signals: AppModeSignals) {
  const modes: AppDisplayMode[] = [
    'window-controls-overlay',
    'standalone',
    'minimal-ui',
    'fullscreen',
  ];
  const displayMode = modes.find((mode) => signals.matches(`(display-mode: ${mode})`)) ?? 'browser';
  const installedWindow =
    signals.iosStandalone === true ||
    ['standalone', 'minimal-ui', 'window-controls-overlay'].includes(displayMode);
  const source = signals.iosStandalone
    ? 'iOS standalone signal'
    : displayMode === 'browser'
      ? 'Browser window'
      : `${displayMode} display mode`;
  return {
    displayMode,
    installedWindow,
    source,
    launchQueueSupported: !!signals.launchQueueSupported,
    launchObserved: !!signals.launchObserved,
    installObserved: !!signals.installObserved,
    label: installedWindow
      ? 'Installed app window'
      : displayMode === 'fullscreen'
        ? 'Fullscreen window · installation unconfirmed'
        : 'Browser tab · installation elsewhere unknown',
  };
}
