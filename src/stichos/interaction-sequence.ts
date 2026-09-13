/** A physical gesture belongs to the element and input surface on which it began.
 * It may never activate a replacement control. This ledger uses event order, not
 * a time threshold, so slow frames and fast deliberate subsequent taps agree. */
export class InteractionSequenceLedger<Owner> {
  private epoch = 0;
  private active = new Map<number, { owner: Owner; epoch: number; claimed: boolean }>();
  private finished = new Map<number, { owner: Owner; epoch: number; claimed: boolean }>();
  private lastFinished: number | null = null;
  private rejected = 0;

  begin(id: number, owner: Owner) {
    this.finished.delete(id);
    this.lastFinished = null;
    if (this.active.has(id) || this.active.size >= 16) return false;
    this.active.set(id, { owner, epoch: this.epoch, claimed: false });
    return true;
  }
  claim(id: number, owner: Owner) {
    const item = this.active.get(id);
    if (!item || item.owner !== owner || item.epoch !== this.epoch || item.claimed) return false;
    item.claimed = true;
    return true;
  }
  finish(id: number, cancelled = false) {
    const item = this.active.get(id);
    if (!item) return;
    this.active.delete(id);
    if (cancelled) item.claimed = true;
    this.finished.set(id, item);
    this.lastFinished = id;
    // Pointer ids increase on mobile browsers; only pending compatibility clicks
    // matter. Never retain an unbounded input history.
    while (this.finished.size > 16) this.finished.delete(this.finished.keys().next().value!);
  }
  permitsRelease(id: number, owner: Owner) {
    const item = this.active.get(id);
    return !!item && item.owner === owner && item.epoch === this.epoch;
  }
  hasPointer(id: number) {
    return this.active.has(id);
  }
  click(id: number | null, owner: Owner) {
    const key = id ?? this.lastFinished;
    const item = key === null ? undefined : (this.finished.get(key) ?? this.active.get(key));
    if (!item || item.owner !== owner || item.epoch !== this.epoch || item.claimed) {
      this.rejected++;
      return false;
    }
    item.claimed = true;
    return true;
  }
  transition() {
    this.epoch++;
  }
  clear() {
    this.transition();
    this.active.clear();
    this.finished.clear();
    this.lastFinished = null;
  }
  get diagnostics() {
    return {
      epoch: this.epoch,
      active: this.active.size,
      pending: this.finished.size,
      rejected: this.rejected,
    };
  }
}

export interface InteractionSequences {
  claim(event: PointerEvent, owner: HTMLElement): boolean;
  transition(): void;
  readonly diagnostics: InteractionSequenceLedger<HTMLElement>['diagnostics'];
  dispose(): void;
}

/** Install before any gameplay input bindings. Generic native buttons still use
 * click, including keyboard/switch/screen-reader activation. Pointer-driven held
 * controls call claim before invoking an action and keep their own capture. */
export function mountInteractionSequences(
  root: HTMLElement,
  options: { onTransition?: () => void } = {},
): InteractionSequences {
  const ledger = new InteractionSequenceLedger<HTMLElement>();
  const owner = (target: EventTarget | null) =>
    target instanceof Element
      ? ((target.closest(
          'button,a,input,select,textarea,summary,canvas,[role="button"]',
        ) as HTMLElement | null) ?? (target as HTMLElement))
      : root;
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const origins = new Map<number, { x: number; y: number; moved: boolean }>();
  let forwardedClick: HTMLElement | null = null;
  const down = (event: PointerEvent) => {
    if (ledger.begin(event.pointerId, owner(event.target)))
      origins.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
  };
  const move = (event: PointerEvent) => {
    const origin = origins.get(event.pointerId);
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 14)
      origin.moved = true;
  };
  const up = (event: PointerEvent) => {
    if (!ledger.hasPointer(event.pointerId)) return;
    const element = owner(event.target);
    const allowed = ledger.permitsRelease(event.pointerId, element);
    const origin = origins.get(event.pointerId);
    origins.delete(event.pointerId);
    const conversationButton =
      element instanceof HTMLButtonElement && element.matches('#s-dialogue button');
    ledger.finish(event.pointerId, conversationButton && !!origin?.moved);
    if (!allowed) {
      stop(event);
      return;
    }
    // Touch recognizers may omit a compatibility click immediately after a drag.
    // Conversation actions use the owned release itself; subsequent native click
    // is consumed. Keep existing click handlers for keyboard/assistive activation.
    if (
      event.button === 0 &&
      origin &&
      !origin.moved &&
      conversationButton &&
      !element.disabled &&
      !element.closest('[inert],[hidden]')
    ) {
      const bounds = element.getBoundingClientRect();
      if (
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom &&
        ledger.click(event.pointerId, element)
      ) {
        forwardedClick = element;
        try {
          element.click();
        } finally {
          forwardedClick = null;
        }
        stop(event);
      }
    }
  };
  const cancel = (event: PointerEvent) => {
    origins.delete(event.pointerId);
    ledger.finish(event.pointerId, true);
  };
  let keyboard: { owner: HTMLElement; epoch: number; key: string } | null = null;
  const keyDown = (event: KeyboardEvent) => {
    if (!event.repeat && (event.key === 'Enter' || event.key === ' '))
      keyboard = { owner: owner(event.target), epoch: ledger.diagnostics.epoch, key: event.key };
  };
  const keyUp = (event: KeyboardEvent) => {
    if (keyboard?.key !== event.key) return;
    const current = keyboard;
    // Native keyboard click is the default action of this keyboard dispatch.
    // Retire its attribution at the event-turn boundary, not after a cooldown.
    queueMicrotask(() => {
      if (keyboard === current) keyboard = null;
    });
  };
  const click = (event: MouseEvent) => {
    if (forwardedClick === owner(event.target)) return;
    const pointer = event as PointerEvent;
    const nativePointer =
      event.detail > 0 ||
      pointer.pointerId > 0 ||
      !!(event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } })
        .sourceCapabilities?.firesTouchEvents;
    if (nativePointer) {
      if (!ledger.click(pointer.pointerId > 0 ? pointer.pointerId : null, owner(event.target)))
        stop(event);
    } else if (
      keyboard &&
      (keyboard.owner !== owner(event.target) || keyboard.epoch !== ledger.diagnostics.epoch)
    ) {
      stop(event);
    }
  };
  const blur = () => {
    ledger.clear();
    origins.clear();
    keyboard = null;
    options.onTransition?.();
  };
  root.addEventListener('pointerdown', down, true);
  document.addEventListener('pointermove', move, true);
  // A removed owner may send its terminal event outside the old root. Observe
  // completion at document level while affecting only this ledger's contacts.
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
  root.addEventListener('click', click, true);
  root.addEventListener('keydown', keyDown, true);
  root.addEventListener('keyup', keyUp, true);
  addEventListener('blur', blur);
  return {
    claim(event, element) {
      return ledger.claim(event.pointerId, element);
    },
    transition() {
      ledger.transition();
      options.onTransition?.();
    },
    get diagnostics() {
      return ledger.diagnostics;
    },
    dispose() {
      root.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      root.removeEventListener('click', click, true);
      root.removeEventListener('keydown', keyDown, true);
      root.removeEventListener('keyup', keyUp, true);
      removeEventListener('blur', blur);
      ledger.clear();
      origins.clear();
    },
  };
}
