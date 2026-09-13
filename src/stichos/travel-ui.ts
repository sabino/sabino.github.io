import type { TravelFeedback } from './navigation.ts';

export type MovementPace = 'walk' | 'run';
export const MOVEMENT_PACE_KEY = 'verso.movement-pace.v1';
export function loadMovementPace(storage?: Pick<Storage, 'getItem'> | null): MovementPace {
  try {
    return storage?.getItem(MOVEMENT_PACE_KEY) === 'run' ? 'run' : 'walk';
  } catch {
    return 'walk';
  }
}
export function movementRuns(pace: MovementPace, shift = false, stickEdge = false) {
  return pace === 'run' || shift || stickEdge;
}
/** A dedicated gameplay shortcut; never steal text, browser commands or repeats. */
export function isPaceShortcut(
  event: Pick<
    KeyboardEvent,
    | 'key'
    | 'repeat'
    | 'altKey'
    | 'ctrlKey'
    | 'metaKey'
    | 'shiftKey'
    | 'isComposing'
    | 'defaultPrevented'
  >,
  gameplayAvailable: boolean,
  editing: boolean,
) {
  return (
    gameplayAvailable &&
    !editing &&
    !event.defaultPrevented &&
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.isComposing &&
    event.key.toLowerCase() === 'c'
  );
}

export function mountTravelUi(
  root: HTMLElement,
  actions: {
    canAct(): boolean;
    openOptions(): void;
    paceChanged(run: boolean): void;
    lock(run: boolean): void;
    stop(): void;
    home(): void;
  },
) {
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {}
  let pace = loadMovementPace(storage);
  const pane = document.createElement('div');
  pane.className = 'v-travel-controls';
  pane.innerHTML = `<div class="v-travel-buttons" role="group" aria-label="Movement pace and travel"><button type="button" data-travel="pace" aria-label="Walk/Run pace" aria-pressed="false" aria-keyshortcuts="C"><span data-pace-label>Walk</span><kbd>C</kbd></button><button type="button" data-travel="options" aria-expanded="false" aria-controls="v-travel-options">Travel</button><button type="button" data-travel="stop" hidden>Stop</button></div><div id="v-travel-options" class="v-travel-options" role="group" aria-label="Automatic travel" hidden><strong>Automatic travel</strong><button type="button" data-travel="lock">Auto walk</button><button type="button" data-travel="home">Go home</button><output class="v-travel-status" aria-live="polite" aria-atomic="true"></output></div><span class="v-travel-active" role="status" aria-live="polite"></span>`;
  const buttons = (name: string) =>
    pane.querySelector<HTMLButtonElement>(`[data-travel="${name}"]`)!;
  const options = pane.querySelector<HTMLElement>('.v-travel-options')!;
  const output = pane.querySelector('output')!;
  const activeStatus = pane.querySelector<HTMLElement>('.v-travel-active')!;
  let available = false;
  let previous = '';
  const closeOptions = (restoreFocus = false) => {
    if (options.hidden) return false;
    options.hidden = true;
    buttons('options').setAttribute('aria-expanded', 'false');
    if (restoreFocus) buttons('options').focus({ preventScroll: true });
    return true;
  };
  const updatePace = () => {
    buttons('pace').querySelector('[data-pace-label]')!.textContent =
      pace === 'run' ? 'Run' : 'Walk';
    buttons('pace').setAttribute('aria-pressed', String(pace === 'run'));
    buttons('pace').title =
      `${pace === 'run' ? 'Run' : 'Walk'} pace · C to switch. Shift temporarily runs.`;
    buttons('lock').textContent = pace === 'run' ? 'Auto run' : 'Auto walk';
    buttons('lock').setAttribute(
      'aria-label',
      `Keep ${pace === 'run' ? 'running' : 'walking'} in your current direction`,
    );
  };
  const togglePace = () => {
    if (!available || !actions.canAct()) return;
    pace = pace === 'run' ? 'walk' : 'run';
    try {
      storage?.setItem(MOVEMENT_PACE_KEY, pace);
    } catch {}
    closeOptions();
    updatePace();
    actions.paceChanged(pace === 'run');
  };
  buttons('pace').onclick = togglePace;
  buttons('options').onclick = () => {
    if (!available || !actions.canAct()) return;
    options.hidden = !options.hidden;
    buttons('options').setAttribute('aria-expanded', String(!options.hidden));
    if (!options.hidden) actions.openOptions();
  };
  for (const name of ['lock', 'home', 'stop']) {
    buttons(name).onclick = () => {
      if (!available || !actions.canAct()) return;
      closeOptions();
      if (name === 'lock') actions.lock(pace === 'run');
      else if (name === 'home') actions.home();
      else actions.stop();
    };
  }
  const outside = (event: PointerEvent) => {
    if (event.target instanceof Node && !pane.contains(event.target)) closeOptions();
  };
  root.addEventListener('pointerdown', outside, true);
  const media = matchMedia('(max-width: 899px), (pointer: coarse)');
  const place = () => {
    closeOptions();
    const target = root.querySelector(media.matches ? '.v-movement-cluster' : '.s-actionbar')!;
    target.append(pane);
    pane.dataset.layout = media.matches ? 'touch' : 'desktop';
  };
  media.addEventListener('change', place);
  place();
  updatePace();
  return {
    get pace() {
      return pace;
    },
    get optionsOpen() {
      return !options.hidden;
    },
    togglePace,
    closeOptions,
    update(feedback: TravelFeedback, enabled: boolean, hasHome: boolean) {
      available = enabled;
      pane.hidden = !enabled;
      if (!enabled) closeOptions();
      const active = ['locked', 'planning', 'walking', 'door'].includes(feedback.state);
      buttons('stop').hidden = !active;
      buttons('options').hidden = active;
      if (active) closeOptions();
      buttons('home').disabled = !hasHome;
      const text =
        feedback.state === 'idle'
          ? ''
          : feedback.state === 'locked'
            ? `Auto ${feedback.run ? 'run' : 'walk'}`
            : feedback.state === 'unreachable'
              ? (feedback.reason ?? 'No permitted route.')
              : `${feedback.label} · ${feedback.state === 'planning' ? 'finding a route' : feedback.state === 'arrived' ? 'arrived' : feedback.state === 'door' ? 'waiting at the door' : `${feedback.remaining} tiles remaining`}`;
      if (text !== previous) {
        output.textContent = text;
        activeStatus.textContent = active
          ? feedback.state === 'locked'
            ? text
            : feedback.state === 'planning'
              ? 'Finding route'
              : feedback.state === 'door'
                ? 'At door'
                : 'Following route'
          : '';
        previous = text;
      }
      pane.dataset.active = String(active);
    },
    dispose() {
      root.removeEventListener('pointerdown', outside, true);
      media.removeEventListener('change', place);
      pane.remove();
    },
  };
}
