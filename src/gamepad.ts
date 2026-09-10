/** Structural subset shared by native Gamepad objects and deterministic tests. */
export interface PadLike {
  id: string;
  index: number;
  mapping: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadFrame {
  connected: boolean;
  name: string;
  move: { x: number; y: number };
  aim: { x: number; y: number };
  running: boolean;
  pressed: ('dash' | 'scan' | 'mend' | 'pause' | 'journal')[];
  held: ('blade' | 'pulse')[];
  menuStep: -1 | 0 | 1;
  confirm: boolean;
  back: boolean;
}

const DEADZONE = 0.18;
const MENU_DELAY = 0.4;
const MENU_REPEAT = 0.15;

/** Pure standard-mapping adapter. It neither polls devices nor mutates the game. */
export class GamepadController {
  private identity: string | null = null;
  private previousButtons: boolean[] = [];
  private menuDirection: -1 | 0 | 1 = 0;
  private menuElapsed = 0;
  private menuRepeatAt = MENU_DELAY;

  /** dt is elapsed seconds. A frame emits at most one menu movement. */
  sample(pads: readonly (PadLike | null)[], dt: number): PadFrame {
    const pad = pads?.find((candidate) => candidate?.connected && candidate.mapping === 'standard');
    if (!pad) {
      this.identity = null;
      this.previousButtons = [];
      this.resetMenu();
      return emptyFrame();
    }

    const identity = `${pad.index}:${pad.id}`;
    const changed = identity !== this.identity;
    const buttons = Array.from({ length: 16 }, (_, index) => buttonDown(pad, index));
    // Connecting while a button is down must not confirm a menu or spend an
    // ability. Fresh presses work after release; held input stays responsive.
    const previous = changed ? buttons : this.previousButtons;
    const edge = (index: number) => buttons[index] && !previous[index];
    if (changed) this.resetMenu();
    this.identity = identity;

    const frame = emptyFrame();
    frame.connected = true;
    frame.name = typeof pad.id === 'string' && pad.id.trim() ? pad.id.trim() : 'Gamepad';
    frame.move = stick(pad.axes?.[0], pad.axes?.[1]);
    frame.aim = stick(pad.axes?.[2], pad.axes?.[3]);
    if (frame.move.x === 0 && frame.move.y === 0) {
      const x = Number(buttons[15]) - Number(buttons[14]);
      const y = Number(buttons[13]) - Number(buttons[12]);
      const length = Math.hypot(x, y) || 1;
      frame.move = { x: x / length, y: y / length };
    }

    frame.running = buttons[4];
    if (edge(0)) frame.pressed.push('dash');
    if (edge(3)) frame.pressed.push('scan');
    if (edge(5)) frame.pressed.push('mend');
    if (edge(8)) frame.pressed.push('journal');
    if (edge(9)) frame.pressed.push('pause');
    if (buttons[2]) frame.held.push('blade');
    if (buttons[1]) frame.held.push('pulse');
    frame.confirm = edge(0);
    frame.back = edge(1);

    const vertical = axis(pad.axes?.[1]);
    const direction =
      buttons[12] || buttons[13]
        ? ((Number(buttons[13]) - Number(buttons[12])) as -1 | 0 | 1)
        : vertical <= -0.5
          ? -1
          : vertical >= 0.5
            ? 1
            : 0;
    frame.menuStep = this.stepMenu(direction, dt, changed);
    this.previousButtons = buttons;
    return frame;
  }

  private stepMenu(direction: -1 | 0 | 1, dt: number, changed: boolean): -1 | 0 | 1 {
    if (direction === 0) {
      this.resetMenu();
      return 0;
    }
    if (direction !== this.menuDirection) {
      this.menuDirection = direction;
      this.menuElapsed = 0;
      this.menuRepeatAt = MENU_DELAY;
      return changed ? 0 : direction;
    }
    // Invalid or delayed frames never create a burst of menu steps. The cap
    // bounds arithmetic after long background suspension; only one is emitted.
    this.menuElapsed += Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1)) : 0;
    if (this.menuElapsed + 1e-9 < this.menuRepeatAt) return 0;
    const missed = Math.floor(
      Math.max(0, this.menuElapsed - this.menuRepeatAt + 1e-9) / MENU_REPEAT,
    );
    this.menuRepeatAt += (missed + 1) * MENU_REPEAT;
    return direction;
  }

  private resetMenu(): void {
    this.menuDirection = 0;
    this.menuElapsed = 0;
    this.menuRepeatAt = MENU_DELAY;
  }
}

function emptyFrame(): PadFrame {
  return {
    connected: false,
    name: '',
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    running: false,
    pressed: [],
    held: [],
    menuStep: 0,
    confirm: false,
    back: false,
  };
}

function axis(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function stick(rawX: number | undefined, rawY: number | undefined): { x: number; y: number } {
  const x = axis(rawX),
    y = axis(rawY);
  const length = Math.hypot(x, y);
  if (length <= DEADZONE) return { x: 0, y: 0 };
  const strength = Math.min(1, (length - DEADZONE) / (1 - DEADZONE));
  return { x: (x / length) * strength, y: (y / length) * strength };
}

function buttonDown(pad: PadLike, index: number): boolean {
  const button = pad.buttons?.[index];
  return button?.pressed === true || (Number.isFinite(button?.value) && button.value >= 0.5);
}
