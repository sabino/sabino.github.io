/** Testable policy: keyboard chrome must not consume the remaining game view. */
export function viewportLayout(input: {
  width: number;
  height: number;
  visualHeight?: number;
  visualTop?: number;
  scale?: number;
  editing: boolean;
  coarse: boolean;
  physicalLandscape?: boolean;
}) {
  const narrow = input.width < 900 || input.coarse;
  const unzoomed = Math.abs((input.scale ?? 1) - 1) < 0.05;
  const height = Math.max(
    1,
    Math.round(
      unzoomed ? Math.min(input.height, input.visualHeight ?? input.height) : input.height,
    ),
  );
  return {
    height,
    top: unzoomed ? Math.max(0, Math.round(input.visualTop ?? 0)) : 0,
    compactInput: narrow && input.editing,
    keyboardLikely: narrow && input.editing && (input.height - height > 120 || height < 500),
    landscape: input.width > input.height,
    // A keyboard can make a portrait layout viewport wider than it is tall.
    // Only a non-editing touch window may require the rotation interstitial.
    portraitRequired:
      input.coarse && input.width > input.height && (input.physicalLandscape ?? !input.editing),
  };
}
export function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      'textarea,[contenteditable="true"],input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="color"]):not([type="submit"])',
    )
  );
}
/** Subscribe once; VisualViewport events are coalesced to one layout change per frame. */
export function mountMobileViewport(
  root: HTMLElement,
  onResize: () => void,
  options: { installed?: () => boolean; onPortraitBlocked?: (blocked: boolean) => void } = {},
) {
  let frame = 0;
  let last = '';
  let current = viewportLayout({
    width: innerWidth,
    height: innerHeight,
    editing: false,
    coarse: false,
  });
  const shell = root.querySelector<HTMLElement>('.s-shell');
  const gate = document.createElement('section');
  gate.className = 'v-portrait-gate';
  gate.hidden = true;
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'v-portrait-heading');
  gate.tabIndex = -1;
  gate.innerHTML = `<span class="v-portrait-device" aria-hidden="true">↶</span><h2 id="v-portrait-heading">Turn your world upright</h2><p>Verso is played in portrait on a phone or tablet. Rotate your device to return to the world.</p><p class="v-portrait-room-note">In a shared room, the world keeps moving while you turn.</p><button type="button" id="v-portrait-lock">Try portrait lock</button><small id="v-portrait-lock-note"></small>`;
  root.append(gate);
  const lockButton = gate.querySelector<HTMLButtonElement>('button')!;
  const lockNote = gate.querySelector<HTMLElement>('small')!;
  gate.onkeydown = (event) => {
    // Gameplay shortcuts must not escape the inert shell through window listeners.
    event.stopPropagation();
    if (event.key === 'Tab') {
      event.preventDefault();
      (lockButton.hidden ? gate : lockButton).focus({ preventScroll: true });
    }
  };
  let lockState = 'browser-managed';
  let lockPending = false;
  let disposed = false;
  let previousFocus: HTMLElement | null = null;
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  const installed = () =>
    options.installed?.() ??
    (matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const eligible = () =>
    matchMedia('(pointer: coarse)').matches &&
    (installed() || !!document.fullscreenElement) &&
    document.visibilityState === 'visible';
  const describeLock = () => {
    lockButton.hidden = !eligible() || !orientation?.lock;
    lockNote.textContent =
      lockState === 'locked'
        ? 'Portrait lock requested by this app.'
        : lockState === 'unavailable'
          ? 'This browser cannot lock orientation. Rotate your device manually.'
          : installed()
            ? 'Your device may control rotation even when the game is installed.'
            : 'Browser tab · rotation is controlled by your device.';
  };
  const tryLock = async () => {
    if (!eligible() || lockPending || lockState === 'locked' || disposed) return;
    if (!orientation?.lock) {
      lockState = 'unavailable';
      describeLock();
      return;
    }
    lockPending = true;
    try {
      await orientation.lock('portrait');
      if (!disposed) lockState = 'locked';
      else orientation.unlock?.();
    } catch {
      if (!disposed) lockState = 'unavailable';
    } finally {
      lockPending = false;
      if (!disposed) describeLock();
    }
  };
  lockButton.onclick = () => void tryLock();
  const gesture = () => {
    if (lockState === 'browser-managed') void tryLock();
  };
  const apply = () => {
    frame = 0;
    const viewport = window.visualViewport;
    current = viewportLayout({
      width: innerWidth,
      height: innerHeight,
      visualHeight: viewport?.height,
      visualTop: viewport?.offsetTop,
      scale: viewport?.scale,
      editing: isTextEntry(document.activeElement),
      coarse: matchMedia('(pointer: coarse)').matches,
      physicalLandscape: screen.orientation?.type
        ? screen.orientation.type.startsWith('landscape')
        : undefined,
    });
    const key = JSON.stringify(current);
    if (key === last) return;
    last = key;
    root.style.setProperty('--v-viewport-height', `${current.height}px`);
    root.style.setProperty('--v-viewport-top', `${current.top}px`);
    root.classList.toggle('text-editing', current.compactInput);
    root.classList.toggle('keyboard-likely', current.keyboardLikely);
    const wasBlocked = !gate.hidden;
    gate.hidden = !current.portraitRequired;
    root.classList.toggle('portrait-required', current.portraitRequired);
    if (shell) shell.inert = current.portraitRequired;
    if (wasBlocked !== current.portraitRequired) {
      if (current.portraitRequired) {
        previousFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        gate.focus({ preventScroll: true });
      } else if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
        previousFocus = null;
      }
      options.onPortraitBlocked?.(current.portraitRequired);
    }
    describeLock();
    root.classList.toggle(
      'chat-editing',
      current.compactInput && document.activeElement?.id === 'v-chat-input',
    );
    onResize();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  addEventListener('resize', schedule);
  addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('pointerdown', gesture, { passive: true });
  const modeChanged = () => {
    lockState = 'browser-managed';
    describeLock();
    void tryLock();
    schedule();
  };
  document.addEventListener('fullscreenchange', modeChanged);
  addEventListener('verso-app-mode-change', modeChanged);
  const visibility = () => {
    if (document.visibilityState === 'visible') modeChanged();
  };
  document.addEventListener('visibilitychange', visibility);
  apply();
  return {
    get diagnostics() {
      return { ...current, visualViewport: !!window.visualViewport, portraitLock: lockState };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      removeEventListener('resize', schedule);
      removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      document.removeEventListener('pointerdown', gesture);
      document.removeEventListener('fullscreenchange', modeChanged);
      removeEventListener('verso-app-mode-change', modeChanged);
      document.removeEventListener('visibilitychange', visibility);
      if (lockState === 'locked') {
        try {
          orientation?.unlock?.();
        } catch {}
      }
      if (shell) shell.inert = false;
      gate.remove();
      root.classList.remove('portrait-required');
    },
  };
}
