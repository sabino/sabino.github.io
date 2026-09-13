/** Client input only. Simulation, stamina, cooldowns and targeting remain in the session. */
export type PortraitAction =
  | 'attack'
  | 'technique-1'
  | 'technique-2'
  | 'dodge'
  | 'ward'
  | 'interact';
export type PortraitActionPhase = 'press' | 'release' | 'cancel';
export interface PortraitPreferences {
  handedness: 'right' | 'left';
  movement: 'joystick' | 'buttons';
  sprintAtEdge: boolean;
}
export const PORTRAIT_PREFERENCES_KEY = 'verso.portrait-controls.v1';
export const DEFAULT_PORTRAIT_PREFERENCES: PortraitPreferences = {
  handedness: 'right',
  movement: 'joystick',
  sprintAtEdge: true,
};
export function sanitizePortraitPreferences(value: unknown): PortraitPreferences {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    handedness: v.handedness === 'left' ? 'left' : 'right',
    movement: v.movement === 'buttons' ? 'buttons' : 'joystick',
    sprintAtEdge: typeof v.sprintAtEdge === 'boolean' ? v.sprintAtEdge : true,
  };
}
export function loadPortraitPreferences(storage?: Pick<Storage, 'getItem'> | null) {
  try {
    return sanitizePortraitPreferences(
      JSON.parse(storage?.getItem(PORTRAIT_PREFERENCES_KEY) ?? '{}'),
    );
  } catch {
    return { ...DEFAULT_PORTRAIT_PREFERENCES };
  }
}
/** Radial dead zone and bounded analog speed. Input is world axes, not camera pixels. */
export function joystickVector(dx: number, dy: number, radius = 43, sprintAtEdge = true) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(radius) || radius <= 0)
    return { x: 0, y: 0, run: false };
  const distance = Math.hypot(dx, dy);
  const magnitude = Math.min(1, distance / radius);
  const deadZone = 0.14;
  if (magnitude <= deadZone) return { x: 0, y: 0, run: false };
  const speed = Math.min(1, (magnitude - deadZone) / (0.78 - deadZone));
  return {
    x: (dx / distance) * speed,
    y: (dy / distance) * speed,
    run: sprintAtEdge && magnitude >= 0.96,
  };
}
export interface PortraitControlState {
  enabled?: boolean;
  attackCooldown?: number;
  wardCooldown?: number;
  dodgeCooldown?: number;
  attackLabel?: string;
  interactLabel?: string;
  charge?: number;
  techniques?: [
    { label: string; cooldown: number; unlocked: boolean; lockedReason?: string },
    { label: string; cooldown: number; unlocked: boolean; lockedReason?: string },
  ];
}
const fraction = (n: number | undefined) => Math.max(0, Math.min(1, Number.isFinite(n) ? n! : 0));
export function mountPortraitControls(
  root: HTMLElement,
  options: {
    canAct: () => boolean;
    onAction: (action: PortraitAction, phase: PortraitActionPhase, heldMs: number) => void;
    onMoveStart: () => void;
  },
) {
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {}
  let preferences = loadPortraitPreferences(storage);
  let enabled = true;
  let vector = { x: 0, y: 0, run: false };
  let stickPointer: number | null = null;
  let stickCenter = { x: 0, y: 0 };
  const activeActions = new Map<PortraitAction, { pointer: number; start: number }>();
  const heldKeys = new Set<string>();
  let switchStepTimer = 0;
  const pane = document.createElement('div');
  pane.className = 'v-portrait-controls';
  pane.setAttribute('aria-label', 'Touch movement and combat');
  pane.innerHTML = `<div class="v-movement-cluster"><button class="v-touch-interact" type="button" data-portrait-action="interact" aria-label="Interact with the nearest person or object"><span aria-hidden="true"><svg viewBox="0 0 20 20" width="22" height="22" shape-rendering="crispEdges"><path fill="currentColor" d="M7 3h2v7h1V1h2v9h1V3h2v7h1V6h2v8h-2v4H8v-2H6v-2H4v-2H2V9h3l2 3z"/></svg></span><span class="v-control-label">Interact</span></button><div class="v-joystick" role="group" aria-label="Movement stick"><button type="button" class="v-joystick-surface" aria-label="Move: drag to walk, reach the edge to run. Arrow keys also move." aria-describedby="v-joystick-hint"><span class="v-joystick-cross" aria-hidden="true"></span><span class="v-joystick-thumb" aria-hidden="true"></span></button><span id="v-joystick-hint">Walk · push to run</span></div></div><div class="v-combat-cluster" role="group" aria-label="Combat actions"><button type="button" class="v-touch-technique v-technique-second" data-portrait-action="technique-2" aria-label="Second technique, unlocks at level 4"><span aria-hidden="true">✧</span><span class="v-control-label">Level 4</span><i class="v-control-cooldown" aria-hidden="true"></i></button><button type="button" class="v-touch-technique" data-portrait-action="technique-1" aria-label="First weapon technique"><span aria-hidden="true">◇</span><span class="v-control-label">Skill</span><i class="v-control-cooldown" aria-hidden="true"></i></button><button type="button" class="v-touch-attack" data-portrait-action="attack" aria-label="Attack: hold for repeated strikes"><span class="v-attack-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34" shape-rendering="crispEdges"><path fill="#d3dfda" d="M3 2h4v2h2v2h2v2h2v2h2v2h2v2h-3v-2h-2v-2h-2V8H8V6H6V4H3zM18 2h4v4h-2v2h-2v2h-2v2h-2v2h-3v-2h2v-2h2V8h2V6h2V4h-1z"/><path fill="#e8cb7c" d="M5 14h2v2h2v2H7v2H5v2H2v-3h2v-2H2v-2h3zM18 14h2v2h2v2h-2v2h2v2h-3v-2h-2v-2h-2v-2h3z"/></svg></span><span class="v-control-label">Strike</span><i class="v-control-cooldown" aria-hidden="true"></i><i class="v-control-charge" aria-hidden="true"></i></button><button type="button" class="v-touch-dodge" data-portrait-action="dodge" aria-label="Quick step in your movement direction"><span aria-hidden="true">➜</span><span class="v-control-label">Step</span><i class="v-control-cooldown" aria-hidden="true"></i></button></div>`;
  root.querySelector('.s-world-wrap')!.append(pane);
  const stick = pane.querySelector<HTMLButtonElement>('.v-joystick-surface')!;
  const thumb = pane.querySelector<HTMLElement>('.v-joystick-thumb')!;
  const hint = pane.querySelector<HTMLElement>('#v-joystick-hint')!;
  const actionButtons = new Map(
    [...pane.querySelectorAll<HTMLButtonElement>('[data-portrait-action]')].map((button) => [
      button.dataset.portraitAction as PortraitAction,
      button,
    ]),
  );
  const allowed = () =>
    enabled &&
    !document.hidden &&
    !root.classList.contains('portrait-required') &&
    options.canAct();
  const blurText = () => {
    if (document.activeElement?.matches('input,textarea,[contenteditable="true"]'))
      (document.activeElement as HTMLElement).blur();
  };
  const resetStick = () => {
    clearTimeout(switchStepTimer);
    stickPointer = null;
    heldKeys.clear();
    vector = { x: 0, y: 0, run: false };
    thumb.style.transform = '';
    stick.classList.remove('is-held', 'is-running');
  };
  const finish = (action: PortraitAction, phase: 'release' | 'cancel') => {
    const active = activeActions.get(action);
    if (!active) return;
    activeActions.delete(action);
    actionButtons.get(action)?.classList.remove('is-held');
    options.onAction(action, phase, Math.min(20000, Math.max(0, performance.now() - active.start)));
  };
  const release = () => {
    resetStick();
    for (const action of activeActions.keys()) finish(action, 'cancel');
  };
  const applyPreferences = () => {
    release();
    root.dataset.controlHand = preferences.handedness;
    root.dataset.movementControl = preferences.movement;
    root.classList.add('portrait-controls-mounted');
    hint.textContent = preferences.sprintAtEdge ? 'Walk · push to run' : 'Drag to walk';
    stick.setAttribute(
      'aria-label',
      preferences.sprintAtEdge
        ? 'Move: drag to walk, reach the edge to run. Arrow keys also move.'
        : 'Move: drag to walk. Arrow keys also move.',
    );
  };
  const moveStick = (event: PointerEvent) => {
    const dx = event.clientX - stickCenter.x,
      dy = event.clientY - stickCenter.y;
    vector = joystickVector(dx, dy, 43, preferences.sprintAtEdge);
    const distance = Math.hypot(dx, dy),
      ratio = distance > 43 ? 43 / distance : 1;
    thumb.style.transform = `translate(${dx * ratio}px, ${dy * ratio}px)`;
    stick.classList.toggle('is-running', vector.run);
  };
  stick.onpointerdown = (event) => {
    if (event.button !== 0 || stickPointer !== null || !allowed()) return;
    event.preventDefault();
    blurText();
    options.onMoveStart();
    const bounds = stick.getBoundingClientRect();
    stickCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    stick.classList.add('is-held');
    moveStick(event);
  };
  stick.onpointermove = (event) => {
    if (event.pointerId !== stickPointer) return;
    event.preventDefault();
    if (!allowed()) resetStick();
    else moveStick(event);
  };
  const stickEnd = (event: PointerEvent) => {
    if (event.pointerId === stickPointer) resetStick();
  };
  stick.onpointerup = stickEnd;
  stick.onpointercancel = stickEnd;
  stick.onlostpointercapture = stickEnd;
  const keyVector = () => {
    const x = Number(heldKeys.has('ArrowRight')) - Number(heldKeys.has('ArrowLeft'));
    const y = Number(heldKeys.has('ArrowDown')) - Number(heldKeys.has('ArrowUp'));
    vector = joystickVector(x * 30, y * 30, 43, false);
  };
  stick.onkeydown = (event) => {
    if (!event.key.startsWith('Arrow') || !allowed()) return;
    event.preventDefault();
    event.stopPropagation();
    heldKeys.add(event.key);
    options.onMoveStart();
    keyVector();
  };
  stick.onkeyup = (event) => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    heldKeys.delete(event.key);
    keyVector();
  };
  stick.onblur = resetStick;
  const directionButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-move]')];
  const directionKeys: Record<string, string> = {
    w: 'ArrowUp',
    a: 'ArrowLeft',
    s: 'ArrowDown',
    d: 'ArrowRight',
  };
  // Native pointer handlers on the original pad remain owned by app.ts. Add
  // keyboard and switch activation without replacing those pointer handlers.
  for (const button of directionButtons) {
    const direction = directionKeys[button.dataset.move || ''];
    button.onkeydown = (event) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || !direction) return;
      event.preventDefault();
      event.stopPropagation();
      if (!allowed() || event.repeat) return;
      heldKeys.add(direction);
      options.onMoveStart();
      keyVector();
    };
    button.onkeyup = (event) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || !direction) return;
      event.preventDefault();
      event.stopPropagation();
      heldKeys.delete(direction);
      keyVector();
    };
    button.onblur = resetStick;
    button.onclick = (event) => {
      if (event.detail !== 0 || !direction || !allowed()) return;
      options.onMoveStart();
      heldKeys.add(direction);
      keyVector();
      clearTimeout(switchStepTimer);
      switchStepTimer = window.setTimeout(resetStick, 180);
    };
  }
  for (const [action, button] of actionButtons) {
    button.onpointerdown = (event) => {
      if (event.button !== 0 || activeActions.has(action) || !allowed() || button.disabled) return;
      event.preventDefault();
      blurText();
      button.setPointerCapture(event.pointerId);
      activeActions.set(action, { pointer: event.pointerId, start: performance.now() });
      button.classList.add('is-held');
      options.onAction(action, 'press', 0);
    };
    button.onpointerup = (event) => {
      if (activeActions.get(action)?.pointer === event.pointerId) {
        const bounds = button.getBoundingClientRect();
        const inside =
          event.clientX >= bounds.left - 20 &&
          event.clientX <= bounds.right + 20 &&
          event.clientY >= bounds.top - 20 &&
          event.clientY <= bounds.bottom + 20;
        finish(action, allowed() && inside ? 'release' : 'cancel');
      }
    };
    button.onpointercancel = button.onlostpointercapture = (event) => {
      if (activeActions.get(action)?.pointer === event.pointerId) finish(action, 'cancel');
    };
    button.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || activeActions.has(action) || !allowed() || button.disabled) return;
      activeActions.set(action, { pointer: -1, start: performance.now() });
      button.classList.add('is-held');
      options.onAction(action, 'press', 0);
    };
    button.onkeyup = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (activeActions.get(action)?.pointer === -1)
        finish(action, allowed() ? 'release' : 'cancel');
    };
    button.onblur = () => {
      if (activeActions.get(action)?.pointer === -1) finish(action, 'cancel');
    };
    // Keyboard, assistive switch and screen-reader synthesized click have detail=0.
    // Pointer activation already ran press/release; never attack twice for its click.
    button.onclick = (event) => {
      event.stopPropagation();
      if (event.detail !== 0 || !allowed() || button.disabled) return;
      options.onAction(action, 'press', 0);
      options.onAction(action, 'release', 0);
    };
  }
  pane.oncontextmenu = (event) => event.preventDefault();
  const visibility = () => {
    if (document.hidden) release();
  };
  addEventListener('blur', release);
  addEventListener('orientationchange', release);
  document.addEventListener('visibilitychange', visibility);
  const update = (state: PortraitControlState) => {
    if (state.enabled !== undefined) {
      enabled = state.enabled;
      pane.classList.toggle('is-unavailable', !enabled);
      pane.inert = !enabled;
    }
    if (!allowed()) release();
    const cooldowns: Partial<Record<PortraitAction, number | undefined>> = {
      attack: state.attackCooldown,
      dodge: state.dodgeCooldown,
    };
    if (state.techniques)
      for (const [index, technique] of state.techniques.entries()) {
        const action = `technique-${index + 1}` as PortraitAction;
        const button = actionButtons.get(action)!;
        const label = technique.label;
        button.querySelector<HTMLElement>('.v-control-label')!.textContent = label;
        button.setAttribute(
          'aria-label',
          technique.unlocked
            ? technique.label
            : `${technique.label}: ${technique.lockedReason || 'currently unavailable'}`,
        );
        button.disabled = !technique.unlocked;
        button.classList.toggle('is-locked', !technique.unlocked);
        cooldowns[action] = technique.cooldown;
      }
    for (const [action, value] of Object.entries(cooldowns)) {
      if (value === undefined) continue;
      const button = actionButtons.get(action as PortraitAction)!;
      button.style.setProperty('--v-cooldown', `${fraction(value) * 100}%`);
      button.classList.toggle('is-cooling', fraction(value) > 0);
      button.setAttribute('aria-description', fraction(value) > 0 ? 'Recovering' : 'Ready');
    }
    if (state.attackLabel !== undefined)
      actionButtons.get('attack')!.querySelector<HTMLElement>('.v-control-label')!.textContent =
        state.attackLabel;
    if (state.interactLabel !== undefined)
      actionButtons.get('interact')!.querySelector<HTMLElement>('.v-control-label')!.textContent =
        state.interactLabel || 'Interact';
    if (state.charge !== undefined)
      actionButtons
        .get('attack')!
        .style.setProperty('--v-charge', `${fraction(state.charge) * 100}%`);
  };
  const settingsHtml = () =>
    `<fieldset class="v-touch-preferences"><legend>Touch controls</legend><label>Attack hand<select id="v-control-hand"><option value="right"${preferences.handedness === 'right' ? ' selected' : ''}>Right thumb</option><option value="left"${preferences.handedness === 'left' ? ' selected' : ''}>Left thumb</option></select></label><label>Movement<select id="v-control-movement"><option value="joystick"${preferences.movement === 'joystick' ? ' selected' : ''}>Analog stick</option><option value="buttons"${preferences.movement === 'buttons' ? ' selected' : ''}>Direction pad</option></select></label><label class="v-touch-check"><input id="v-control-sprint" type="checkbox"${preferences.sprintAtEdge ? ' checked' : ''}>Run at the stick’s edge</label><p>Drag to walk; push to the edge to run. Hold Strike for follow-ups. Release a skill to use it, or drag away to cancel. Keyboard controls stay available.</p></fieldset>`;
  applyPreferences();
  return {
    get input() {
      return allowed() ? { ...vector } : { x: 0, y: 0, run: false };
    },
    get diagnostics() {
      return {
        ...preferences,
        analogActive: stickPointer !== null,
        heldActions: activeActions.size,
      };
    },
    update,
    release,
    settingsHtml,
    bindSettings(container: HTMLElement) {
      const hand = container.querySelector<HTMLSelectElement>('#v-control-hand');
      const movement = container.querySelector<HTMLSelectElement>('#v-control-movement');
      const sprint = container.querySelector<HTMLInputElement>('#v-control-sprint');
      if (!hand || !movement || !sprint) return;
      const changed = () => {
        preferences = sanitizePortraitPreferences({
          handedness: hand.value,
          movement: movement.value,
          sprintAtEdge: sprint.checked,
        });
        try {
          storage?.setItem(PORTRAIT_PREFERENCES_KEY, JSON.stringify(preferences));
        } catch {}
        applyPreferences();
      };
      hand.onchange = movement.onchange = sprint.onchange = changed;
    },
    dispose() {
      release();
      removeEventListener('blur', release);
      removeEventListener('orientationchange', release);
      document.removeEventListener('visibilitychange', visibility);
      pane.remove();
      for (const button of directionButtons) {
        button.onkeydown = button.onkeyup = button.onblur = button.onclick = null;
      }
      root.classList.remove('portrait-controls-mounted');
      delete root.dataset.controlHand;
      delete root.dataset.movementControl;
    },
  };
}
