/** Testable policy: keyboard chrome must not consume the remaining game view. */
export function viewportLayout(input: {
  width: number;
  height: number;
  visualHeight?: number;
  visualTop?: number;
  scale?: number;
  editing: boolean;
  coarse: boolean;
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
export function mountMobileViewport(root: HTMLElement, onResize: () => void) {
  let frame = 0;
  let last = '';
  let current = viewportLayout({
    width: innerWidth,
    height: innerHeight,
    editing: false,
    coarse: false,
  });
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
    });
    const key = JSON.stringify(current);
    if (key === last) return;
    last = key;
    root.style.setProperty('--v-viewport-height', `${current.height}px`);
    root.style.setProperty('--v-viewport-top', `${current.top}px`);
    root.classList.toggle('text-editing', current.compactInput);
    root.classList.toggle('keyboard-likely', current.keyboardLikely);
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
  apply();
  return {
    get diagnostics() {
      return { ...current, visualViewport: !!window.visualViewport };
    },
    dispose() {
      cancelAnimationFrame(frame);
      removeEventListener('resize', schedule);
      removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    },
  };
}
