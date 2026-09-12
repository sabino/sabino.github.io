import './voice-ui.css';
import type { SpatialVoice } from './voice.ts';

type Traveler = { id: string; name: string };
type VoiceUiOptions = {
  voice: SpatialVoice;
  container: HTMLElement;
  peers: () => readonly Traveler[];
  canTalk: () => boolean;
  openSettings: (html: string, mount: (element: HTMLElement) => void) => void;
  onChange?: () => void;
};
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** UI never captures sound. Consent, lifecycle and all transport live in SpatialVoice. */
export function mountVoiceUi(options: VoiceUiOptions) {
  const { voice, container } = options;
  const bar = document.createElement('section');
  bar.className = 'v-voice';
  bar.setAttribute('aria-label', 'Nearby voice');
  bar.innerHTML = `<button id="v-voice-settings" aria-label="Voice and microphone settings" title="Voice and microphone settings">Voice</button><label class="v-voice-mode"><span class="v-sr-only">Speaking range</span><select id="v-voice-mode" aria-label="Speaking range"><option value="whisper">Whisper</option><option value="normal">Normal</option><option value="shout">Shout</option></select></label><button id="v-ptt" aria-label="Push to talk" aria-pressed="false">Hold to talk</button><span id="v-voice-status" role="status" aria-live="polite">Voice off</span><span id="v-voice-speakers" aria-label="Speaking travelers"></span>`;
  container.append(bar);
  const talk = bar.querySelector<HTMLButtonElement>('#v-ptt')!;
  const range = bar.querySelector<HTMLSelectElement>('#v-voice-mode')!;
  let heldPointer: number | null = null;
  let keyboardHeld = false;
  let panel: HTMLElement | null = null;
  let disposed = false;
  function release() {
    heldPointer = null;
    keyboardHeld = false;
    voice.release();
  }
  function toggleOrPress() {
    if (!options.canTalk()) return;
    if (!voice.snapshot.microphone) {
      showSettings();
      return;
    }
    if (
      voice.settings.ptt === 'toggle' &&
      (voice.snapshot.transmitting || voice.snapshot.requesting)
    )
      voice.release();
    else voice.press();
  }
  talk.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    heldPointer = event.pointerId;
    talk.setPointerCapture(event.pointerId);
    toggleOrPress();
  });
  talk.addEventListener('pointerup', (event) => {
    if (heldPointer !== event.pointerId) return;
    heldPointer = null;
    if (voice.settings.ptt === 'hold') voice.release();
  });
  talk.addEventListener('pointercancel', release);
  talk.addEventListener('lostpointercapture', () => {
    if (heldPointer !== null) release();
  });
  talk.addEventListener('contextmenu', (event) => event.preventDefault());
  // A synthesized click from keyboard/switch activation has detail=0.
  talk.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    if (!voice.snapshot.microphone || voice.settings.ptt === 'toggle') toggleOrPress();
  });
  const editable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest('input,textarea,select,[contenteditable="true"]');
  function keydown(event: KeyboardEvent) {
    if (event.repeat || event.isComposing || editable(event.target)) return;
    const focusedTalk = event.target === talk && (event.key === ' ' || event.key === 'Enter');
    if (!(event.code === 'KeyV' || focusedTalk) || !options.canTalk()) return;
    // Enter/Space in toggle mode are handled by the native button click.
    if (focusedTalk && voice.settings.ptt === 'toggle') return;
    event.preventDefault();
    keyboardHeld = true;
    toggleOrPress();
  }
  function keyup(event: KeyboardEvent) {
    if (!keyboardHeld || !['KeyV', 'Space', 'Enter'].includes(event.code)) return;
    keyboardHeld = false;
    if (voice.settings.ptt === 'hold') voice.release();
  }
  document.addEventListener('keydown', keydown);
  document.addEventListener('keyup', keyup);
  addEventListener('blur', release);
  range.onchange = () => {
    release();
    voice.setSettings({ mode: range.value as 'whisper' | 'normal' | 'shout' });
  };
  bar.querySelector<HTMLButtonElement>('#v-voice-settings')!.onclick = showSettings;

  function update() {
    if (disposed) return;
    const state = voice.snapshot,
      settings = voice.settings;
    bar.dataset.state = state.transmitting ? 'speaking' : state.status;
    talk.textContent = state.requesting
      ? 'Waiting…'
      : !state.microphone
        ? 'Enable mic'
        : settings.ptt === 'toggle'
          ? state.transmitting
            ? 'Stop talking'
            : 'Tap to talk'
          : 'Hold to talk';
    talk.setAttribute('aria-pressed', String(state.transmitting));
    talk.setAttribute(
      'aria-label',
      `${talk.textContent}. ${settings.mode}, ${state.ranges[settings.mode]} paces. V shortcut.`,
    );
    talk.disabled = !state.supported;
    range.value = settings.mode;
    const status = bar.querySelector<HTMLElement>('#v-voice-status')!;
    const label = state.requesting
      ? 'Waiting for voice'
      : state.transmitting
        ? `${settings.mode} · ${state.ranges[settings.mode]} paces`
        : state.status === 'ready'
          ? 'Mic ready · V to talk'
          : state.status === 'listening'
            ? 'Listen only'
            : state.message;
    if (status.textContent !== label) status.textContent = label;
    status.title = state.message;
    const names = new Map(options.peers().map((peer) => [peer.id, peer.name]));
    bar.querySelector<HTMLElement>('#v-voice-speakers')!.textContent = state.speakers
      .map((id) => names.get(id) ?? 'Traveler')
      .join(', ');
    if (panel?.isConnected) {
      panel.querySelector<HTMLElement>('#v-voice-detail-status')!.textContent = state.message;
      const meter = panel.querySelector<HTMLMeterElement>('#v-mic-meter');
      if (meter) meter.value = state.inputLevel;
      const button = panel.querySelector<HTMLButtonElement>('#v-mic-consent');
      if (button)
        button.textContent = state.microphone ? 'Turn microphone off' : 'Enable my microphone';
    }
    options.onChange?.();
  }

  function showSettings() {
    release();
    const settings = voice.settings;
    options.openSettings(
      `<div class="v-window-heading"><h2>Nearby voices</h2></div><p>Hear people around your body. Choose Listen only, or enable your microphone and hold the talk button. Voice travels through this world’s operator; it is never recorded in saves.</p><div class="v-voice-consent"><button id="v-listen-consent">Listen only</button><button id="v-mic-consent">${voice.snapshot.microphone ? 'Turn microphone off' : 'Enable my microphone'}</button><button id="v-voice-off">Turn voice off</button></div><p id="v-voice-detail-status" class="v-voice-message" role="status">${escape(voice.snapshot.message)}</p><div class="v-audio-controls"><label>Voice output <input data-voice-setting="output" type="range" min="0" max="1" step="0.05" value="${settings.output}"></label><label>Microphone gain <input data-voice-setting="input" type="range" min="0" max="2" step="0.05" value="${settings.input}"></label><label>Input level <meter id="v-mic-meter" min="0" max="1" low="0.02" high="0.85" optimum="0.45" value="0"></meter></label><label>Talk button <select id="v-ptt-behavior"><option value="hold" ${settings.ptt === 'hold' ? 'selected' : ''}>Hold to talk</option><option value="toggle" ${settings.ptt === 'toggle' ? 'selected' : ''}>Tap to start / tap to stop</option></select></label><label>Microphone <select id="v-input-device"><option value="">System default</option></select></label></div><p class="v-muted">Whisper: ${voice.snapshot.ranges.whisper} paces. Normal: ${voice.snapshot.ranges.normal}. Shout: ${voice.snapshot.ranges.shout}. Walls and distance soften sound. Headphones help prevent echo. Your browser and operating system choose speaker/Bluetooth routing.</p><h3>Other travelers</h3><div class="v-voice-people">${
        options
          .peers()
          .map((peer) => {
            const personal = settings.peers[peer.id] ?? { volume: 1, muted: false, blocked: false };
            return `<fieldset data-voice-peer="${escape(peer.id)}"><legend>${escape(peer.name)}</legend><label>Volume <input data-peer-setting="volume" type="range" min="0" max="1" step="0.05" value="${personal.volume}"></label><label><input type="checkbox" data-peer-setting="muted" ${personal.muted ? 'checked' : ''}> Mute voice</label><label><input type="checkbox" data-peer-setting="blocked" ${personal.blocked ? 'checked' : ''}> Block voice delivery</label></fieldset>`;
          })
          .join('') || '<p>Join a room to see its travelers here.</p>'
      }</div><p class="v-muted">V uses your talk-button behavior. Talking always stops if the page is hidden or interrupted. Tap-to-talk also has a safety timeout. Chat, quick phrases, and speaking indicators remain available without audio.</p>`,
      (element) => {
        // The application's modal host is reused. Keep this specific window, so a
        // late device/permission result cannot update or break a different screen.
        element = element.querySelector<HTMLElement>('[data-screen="voice"]') ?? element;
        panel = element;
        const active = () => !disposed && element.isConnected;
        let busy = false;
        async function consent(action: () => Promise<void>) {
          if (busy) return;
          busy = true;
          const buttons = element.querySelectorAll<HTMLButtonElement>(
            '#v-listen-consent,#v-mic-consent',
          );
          buttons.forEach((button) => {
            button.disabled = true;
          });
          try {
            await action();
          } catch (error) {
            showError(error);
          } finally {
            busy = false;
            if (active())
              buttons.forEach((button) => {
                button.disabled = false;
              });
          }
        }
        const showError = (error: unknown) => {
          if (active())
            element.querySelector<HTMLElement>('#v-voice-detail-status')!.textContent =
              error instanceof Error
                ? error.message
                : 'Voice could not start. Check browser permissions.';
        };
        element.querySelector<HTMLButtonElement>('#v-listen-consent')!.onclick = () => {
          voice.disableMicrophone();
          void consent(() => voice.enableListening());
        };
        element.querySelector<HTMLButtonElement>('#v-mic-consent')!.onclick = () => {
          if (voice.snapshot.microphone) voice.disableMicrophone();
          else
            void consent(async () => {
              await voice.enableMicrophone();
              await loadDevices();
            });
        };
        element.querySelector<HTMLButtonElement>('#v-voice-off')!.onclick = () =>
          voice.disconnect();
        element.querySelectorAll<HTMLInputElement>('[data-voice-setting]').forEach((input) => {
          input.oninput = () =>
            voice.setSettings({ [input.dataset.voiceSetting!]: Number(input.value) });
        });
        element.querySelector<HTMLSelectElement>('#v-ptt-behavior')!.onchange = (event) => {
          release();
          voice.setSettings({
            ptt: (event.target as HTMLSelectElement).value as 'hold' | 'toggle',
          });
        };
        element.querySelectorAll<HTMLElement>('[data-voice-peer]').forEach((row) => {
          row.querySelectorAll<HTMLInputElement>('[data-peer-setting]').forEach((input) => {
            input.oninput = () =>
              voice.setPeerSettings(row.dataset.voicePeer!, {
                [input.dataset.peerSetting!]:
                  input.type === 'checkbox' ? input.checked : Number(input.value),
              });
          });
        });
        const device = element.querySelector<HTMLSelectElement>('#v-input-device')!;
        device.onchange = () => {
          void voice.selectInputDevice(device.value).catch(showError);
        };
        async function loadDevices() {
          const devices = await voice.inputDevices();
          if (!active()) return;
          device.replaceChildren(
            new Option('System default', ''),
            ...devices.map(
              (d, index) => new Option(d.label || `Microphone ${index + 1}`, d.deviceId),
            ),
          );
          device.value = voice.settings.deviceId;
        }
        void loadDevices().catch(showError);
        update();
      },
    );
  }
  voice.onChange = update;
  update();
  return {
    update,
    release,
    showSettings,
    element: bar,
    dispose() {
      disposed = true;
      release();
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('keyup', keyup);
      removeEventListener('blur', release);
      voice.onChange = () => {};
      bar.remove();
    },
  };
}
