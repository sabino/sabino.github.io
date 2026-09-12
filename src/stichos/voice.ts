import type { MultiplayerConnection } from './multiplayer.ts';
import {
  VOICE_CODEC,
  VOICE_MODES,
  VOICE_RANGES,
  VOICE_RELAY_BYTES,
  VOICE_SAMPLE_RATE,
  VOICE_SAMPLES,
  decodeVoiceFrame,
  encodeVoiceFrame,
  validVoiceFrame,
  validVoiceMode,
  voicePeerId,
  type VoiceMode,
} from './voice-protocol.ts';
import { voiceAcoustics, VOICE_ACOUSTICS, type VoicePoint } from './voice-acoustics.ts';
export interface VoicePeerSettings {
  volume: number;
  muted: boolean;
  blocked: boolean;
}
export interface VoiceSettings {
  output: number;
  input: number;
  mode: VoiceMode;
  ptt: 'hold' | 'toggle';
  deviceId: string;
  peers: Record<string, VoicePeerSettings>;
}
export interface VoiceSnapshot {
  status: 'offline' | 'connecting' | 'listening' | 'ready' | 'interrupted' | 'error';
  message: string;
  microphone: boolean;
  transmitting: boolean;
  requesting: boolean;
  inputLevel: number;
  speakers: string[];
  ranges: Record<VoiceMode, number>;
  supported: boolean;
  availability: VoiceAvailability;
  microphoneIssue: string | null;
}
export interface VoiceAvailability {
  reason:
    | 'room-required'
    | 'host-unsupported'
    | 'insecure'
    | 'browser-unsupported'
    | 'capture-unsupported'
    | 'available';
  canListen: boolean;
  canCapture: boolean;
  message: string;
}
/** Capability and membership are separate from microphone consent. This never requests access. */
export function voiceAvailability(environment: {
  joined: boolean;
  endpoint: boolean;
  secure: boolean;
  webAudio: boolean;
  worklet: boolean;
  capture: boolean;
  policyAllowsCapture?: boolean;
}): VoiceAvailability {
  const unavailable = (
    reason: VoiceAvailability['reason'],
    message: string,
  ): VoiceAvailability => ({ reason, canListen: false, canCapture: false, message });
  if (!environment.secure)
    return unavailable(
      'insecure',
      'Voice needs a secure HTTPS page. Open the HTTPS game address; text chat still works.',
    );
  if (!environment.webAudio)
    return unavailable(
      'browser-unsupported',
      'This browser cannot play room voice. Open Verso in a current Safari or Chrome browser, or use text chat.',
    );
  if (!environment.joined)
    return unavailable(
      'room-required',
      'You are playing on your own. Join a shared planet or room first, then choose listening or microphone access.',
    );
  if (!environment.endpoint)
    return unavailable(
      'host-unsupported',
      'This room does not offer voice. Choose a shared planet on a voice-enabled world server, or keep using text here.',
    );
  if (!environment.worklet || !environment.capture || environment.policyAllowsCapture === false)
    return {
      reason: 'capture-unsupported',
      canListen: true,
      canCapture: false,
      message:
        environment.policyAllowsCapture === false
          ? 'This embedded page blocks microphone access. Open the game directly in your browser. Listen only and text remain available.'
          : 'Microphone capture is unavailable in this browser. You can listen without a microphone, or open the game in a current Safari or Chrome browser.',
    };
  return {
    reason: 'available',
    canListen: true,
    canCapture: true,
    message:
      'Choose Listen only, or enable your microphone. Then return to the game and hold the talk button to speak.',
  };
}
export function microphoneErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone access was denied or blocked. Allow Microphone for this site in your browser settings, then tap Enable my microphone again. Listen only and text still work.';
  if (name === 'NotFoundError')
    return 'No microphone was found. Connect a microphone or use Listen only and text.';
  if (name === 'NotReadableError')
    return 'The microphone is unavailable or in use. Close other recording apps, check your headset, then try again. Listen only still works.';
  if (name === 'OverconstrainedError')
    return 'The selected microphone is unavailable. Choose System default, then enable your microphone again.';
  if (name === 'InvalidStateError' || name === 'AbortError')
    return 'Microphone setup was interrupted. Return to this game tab and tap Enable my microphone again.';
  return error instanceof Error
    ? error.message
    : 'Microphone setup failed. Check browser permissions, then try again. Listen only and text remain available.';
}
export interface SpatialVoiceOptions {
  listener: () => VoicePoint;
  occlusion?: (from: VoicePoint, to: VoicePoint) => number;
  onActivity?: (active: boolean) => void;
}
const STORAGE_KEY = 'verso.voice.settings.v1';
const clamp = (x: unknown, fallback: number, max = 1) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, x)) : fallback;
export function normalizeVoiceSettings(value: unknown): VoiceSettings {
  const s = (value && typeof value === 'object' ? value : {}) as Partial<VoiceSettings>,
    peers: Record<string, VoicePeerSettings> = {};
  if (s.peers && typeof s.peers === 'object')
    for (const [id, p] of Object.entries(s.peers).slice(-128))
      if (/^[a-f0-9-]{36}$/i.test(id) && p && typeof p === 'object')
        peers[id] = {
          volume: clamp(p.volume, 1),
          muted: p.muted === true,
          blocked: p.blocked === true,
        };
  return {
    output: clamp(s.output, 0.8),
    input: clamp(s.input, 1, 2),
    mode: validVoiceMode(s.mode) ? s.mode : 'normal',
    ptt: s.ptt === 'toggle' ? 'toggle' : 'hold',
    deviceId: typeof s.deviceId === 'string' ? s.deviceId.slice(0, 256) : '',
    peers,
  };
}
interface PeerAudio {
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  sources: Set<AudioBufferSourceNode>;
  next: number;
  last: number;
  sequence: number | null;
  mode: VoiceMode;
}
/** User-gesture controlled, transient audio relay. Only personal controls enter localStorage. */
export class SpatialVoice {
  onChange: () => void = () => {};
  private options: SpatialVoiceOptions;
  private connection: MultiplayerConnection;
  private config: VoiceSettings;
  private state: VoiceSnapshot = {
    status: 'offline',
    message: 'Join a room, then enable listening. Microphone is off.',
    microphone: false,
    transmitting: false,
    requesting: false,
    inputLevel: 0,
    speakers: [],
    ranges: { ...VOICE_RANGES },
    supported: false,
    availability: voiceAvailability({
      joined: false,
      endpoint: false,
      secure: true,
      webAudio: true,
      worklet: true,
      capture: true,
    }),
    microphoneIssue: null,
  };
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private stream: MediaStream | null = null;
  private capture: AudioWorkletNode | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private captureSink: GainNode | null = null;
  private peers = new Map<string, PeerAudio>();
  private epoch = 0;
  private captureEpoch = 0;
  private sequence = 0;
  private lastBlocks = '';
  private previousAudioSessionType: string | null = null;
  private listeningWanted = false;
  private disposed = false;
  private workletLoaded = false;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private admissionTimer: ReturnType<typeof setTimeout> | null = null;
  private pttSerial = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retry = 0;
  private activity = false;
  private meterTimer: ReturnType<typeof setInterval>;
  private previousSession: () => void;
  private sessionHandler: () => void;
  private hidden = () => {
    if (document.visibilityState === 'hidden') this.suspend();
  };
  private blur = () => this.release();
  private pagehide = () => this.suspend();
  constructor(connection: MultiplayerConnection, options: SpatialVoiceOptions) {
    this.connection = connection;
    this.options = options;
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      saved = null;
    }
    this.config = normalizeVoiceSettings(saved);
    this.previousSession = connection.onVoiceSessionChange;
    this.sessionHandler = () => {
      this.previousSession();
      this.disconnectTransport();
      this.disableMicrophone();
      this.refreshSupport();
      if (
        connection.status === 'online' &&
        this.listeningWanted &&
        document.visibilityState !== 'hidden'
      )
        void this.connect().catch((e) => this.fail(e));
      else {
        this.state.status = 'offline';
        this.state.message =
          connection.status === 'online'
            ? 'Voice is off. Tap Voice to enable listening.'
            : 'Join a room to hear nearby voices. Microphone is off.';
        this.changed();
      }
    };
    connection.onVoiceSessionChange = this.sessionHandler;
    document.addEventListener('visibilitychange', this.hidden);
    window.addEventListener('blur', this.blur);
    window.addEventListener('pagehide', this.pagehide);
    this.meterTimer = setInterval(() => this.update(), 100);
    this.refreshSupport();
  }
  get settings(): Readonly<VoiceSettings> {
    return {
      ...this.config,
      peers: Object.fromEntries(Object.entries(this.config.peers).map(([id, p]) => [id, { ...p }])),
    };
  }
  get snapshot(): Readonly<VoiceSnapshot> {
    this.refreshSupport();
    return {
      ...this.state,
      speakers: [...this.state.speakers],
      ranges: { ...this.state.ranges },
      availability: { ...this.state.availability },
    };
  }
  private changed() {
    this.onChange();
  }
  private refreshSupport() {
    const policy = document as Document & {
      permissionsPolicy?: { allowsFeature(name: string): boolean };
      featurePolicy?: { allowsFeature(name: string): boolean };
    };
    let policyAllowsCapture = true;
    try {
      policyAllowsCapture =
        (policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature('microphone') !== false;
    } catch {
      /* Unknown policy is resolved by getUserMedia. */
    }
    this.state.availability = voiceAvailability({
      joined: this.connection.status === 'online',
      endpoint: !!this.connection.voiceEndpoint,
      secure: typeof isSecureContext !== 'undefined' && isSecureContext,
      webAudio: typeof AudioContext !== 'undefined',
      worklet: typeof AudioWorkletNode !== 'undefined',
      capture: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      policyAllowsCapture,
    });
    this.state.supported = this.state.availability.canListen;
  }
  private fail(error: unknown) {
    this.state.status = 'error';
    this.state.message = error instanceof Error ? error.message : 'Voice is unavailable.';
    this.changed();
  }
  setSettings(patch: Partial<Omit<VoiceSettings, 'peers'>>) {
    if (patch.mode && patch.mode !== this.config.mode) this.release();
    this.config = normalizeVoiceSettings({ ...this.config, ...patch });
    this.saveSettings();
    if (this.output && this.context)
      this.output.gain.setTargetAtTime(this.config.output, this.context.currentTime, 0.05);
    this.changed();
  }
  setMode(mode: VoiceMode) {
    this.setSettings({ mode });
  }
  setPeerSettings(id: string, patch: Partial<VoicePeerSettings>) {
    this.config = normalizeVoiceSettings({
      ...this.config,
      peers: {
        ...this.config.peers,
        [id]: {
          ...(this.config.peers[id] ?? { volume: 1, muted: false, blocked: false }),
          ...patch,
        },
      },
    });
    this.saveSettings();
    this.sendBlocks();
    this.update();
    this.changed();
  }
  private saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      /* Controls remain usable without storage. */
    }
  }
  private async audio() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.output = this.context.createGain();
      this.output.gain.value = this.config.output;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.15;
      this.output.connect(this.compressor).connect(this.context.destination);
      this.context.onstatechange = () => {
        if (this.context?.state !== 'running') {
          this.release();
          if (this.state.microphone) this.disableMicrophone();
          this.state.status = 'interrupted';
          this.state.message = 'Audio was interrupted. Tap Listen to resume.';
          this.changed();
        }
      };
    }
    await this.context.resume();
    if (this.context.state !== 'running')
      throw Error('Tap Listen to allow browser audio playback.');
  }
  async enableListening() {
    if (this.disposed) return;
    this.refreshSupport();
    if (!this.state.availability.canListen) throw Error(this.state.availability.message);
    this.listeningWanted = true;
    await this.audio();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.state.status = this.state.microphone ? 'ready' : 'listening';
      this.changed();
      return;
    }
    await this.connect();
  }
  private async connect() {
    if (this.disposed || !this.listeningWanted || this.connection.status !== 'online') return;
    this.disconnectTransport();
    const epoch = ++this.epoch;
    this.state.status = 'connecting';
    this.state.message = 'Connecting room audio…';
    this.changed();
    const credential = await this.connection.requestVoiceTicket();
    if (epoch !== this.epoch || document.visibilityState === 'hidden') return;
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.connection.voiceEndpoint);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';
      let ready = false;
      const timeout = setTimeout(() => {
        socket.close();
        reject(Error('Voice connection timed out.'));
      }, 5000);
      socket.onopen = () => {
        const controls = this.blockControls();
        this.lastBlocks = JSON.stringify({ type: 'block', ...controls });
        socket.send(
          JSON.stringify({
            type: 'auth',
            ticket: credential.ticket,
            codecs: [VOICE_CODEC],
            ...controls,
          }),
        );
      };
      socket.onmessage = (e) => {
        if (epoch !== this.epoch) return;
        if (e.data instanceof ArrayBuffer) {
          if (ready) this.receive(new Uint8Array(e.data));
          return;
        }
        if (typeof e.data !== 'string' || e.data.length > 2048) {
          socket.close(1007);
          return;
        }
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          socket.close(1007);
          return;
        }
        if (m.type === 'ready' && m.codec === VOICE_CODEC && m.peerId === this.connection.peerId) {
          ready = true;
          clearTimeout(timeout);
          this.retry = 0;
          for (const mode of VOICE_MODES)
            if (typeof m.ranges?.[mode] === 'number' && m.ranges[mode] > 0 && m.ranges[mode] <= 128)
              this.state.ranges[mode] = m.ranges[mode];
          this.state.status = 'listening';
          this.state.message = this.state.microphoneIssue ?? 'Listening nearby. Microphone is off.';
          this.sendBlocks();
          this.changed();
          resolve();
        } else if (m.type === 'stopped') {
          this.release();
          this.state.message = String(m.reason || 'Release and press again.').slice(0, 160);
          this.changed();
        } else if (m.type === 'ptt' && m.active === true && m.peerId === this.connection.peerId) {
          this.admitPtt(m.requestId, m.mode);
        } else if (m.type === 'ptt' && m.active === false && typeof m.peerId === 'string') {
          const peer = this.peers.get(m.peerId);
          if (peer) peer.last = Math.min(peer.last, performance.now() - 160);
        }
      };
      socket.onerror = () => {
        if (!ready) reject(Error('Cannot reach room voice. Text and gameplay remain available.'));
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (!ready) reject(Error('Voice connection closed. Tap Listen to retry.'));
        if (epoch !== this.epoch) return;
        this.socket = null;
        this.release();
        this.disableMicrophone();
        this.clearPeers();
        this.state.status = 'interrupted';
        this.state.message = 'Voice interrupted; listening will retry. Microphone is off.';
        this.changed();
        if (
          this.listeningWanted &&
          this.connection.status === 'online' &&
          document.visibilityState !== 'hidden' &&
          this.retry < 3
        )
          this.reconnectTimer = setTimeout(
            () => {
              this.retry++;
              void this.connect().catch((e) => this.fail(e));
            },
            1500 * (this.retry + 1),
          );
      };
    });
  }
  async enableMicrophone() {
    if (this.disposed) return;
    this.refreshSupport();
    if (!this.state.availability.canCapture) throw Error(this.state.availability.message);
    const epoch = ++this.captureEpoch;
    this.state.microphoneIssue = null;
    this.release();
    this.disableCapture();
    const constraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      ...(this.config.deviceId ? { deviceId: { exact: this.config.deviceId } } : {}),
    };
    // Both browser-gated calls begin in the original consent gesture. Neither
    // microphone permission nor AudioContext.resume waits for a network round trip.
    const listening = this.enableListening();
    let permission: Promise<MediaStream>;
    try {
      permission = navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
    } catch (e) {
      permission = Promise.reject(e);
    }
    try {
      const capture = permission.then((stream) => {
        // Permission can resolve while the authenticated voice socket is still
        // connecting. Keep hardware muted, and make cancellation stop it at once.
        for (const track of stream.getAudioTracks()) track.enabled = false;
        if (
          epoch !== this.captureEpoch ||
          this.disposed ||
          document.visibilityState === 'hidden' ||
          this.connection.status !== 'online'
        ) {
          stream.getTracks().forEach((track) => track.stop());
          return null;
        }
        this.stream = stream;
        for (const track of stream.getAudioTracks()) {
          track.onended = () => this.disableMicrophone();
          track.onmute = () => this.release();
        }
        return stream;
      });
      const [, stream] = await Promise.all([listening, capture]);
      if (!stream || epoch !== this.captureEpoch || this.disposed || this.stream !== stream) return;
      if (!this.workletLoaded) {
        await this.context!.audioWorklet.addModule(
          new URL('./voice-capture.worklet.js', import.meta.url).href,
        );
        this.workletLoaded = true;
      }
      if (epoch !== this.captureEpoch || this.stream !== stream) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.capture = new AudioWorkletNode(this.context!, 'verso-voice-capture');
      this.captureSource = this.context!.createMediaStreamSource(stream);
      this.captureSink = this.context!.createGain();
      this.captureSink.gain.value = 0;
      this.captureSource
        .connect(this.capture)
        .connect(this.captureSink)
        .connect(this.context!.destination);
      this.capture.port.onmessage = (e) => {
        if (
          !this.state.transmitting ||
          this.socket?.readyState !== WebSocket.OPEN ||
          this.context?.state !== 'running'
        )
          return;
        const samples = e.data;
        if (!(samples instanceof Float32Array) || samples.length !== VOICE_SAMPLES) return;
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        this.state.inputLevel = Math.min(1, Math.sqrt(sum / VOICE_SAMPLES) * this.config.input * 3);
        if (this.socket.bufferedAmount > 8192) {
          this.release();
          this.state.message = 'Voice paused: connection is too slow.';
          this.changed();
          return;
        }
        this.socket.send(
          encodeVoiceFrame(samples, this.sequence++, this.config.mode, this.config.input),
        );
      };
      this.audioSession(true);
      this.state.microphone = true;
      this.state.status = 'ready';
      this.state.message =
        this.config.ptt === 'toggle'
          ? 'Microphone ready. Return to the game and tap Talk to start; tap again to stop.'
          : 'Microphone ready. Return to the game, then press and hold the talk button. Release to stop.';
      this.changed();
    } catch (e) {
      if (epoch !== this.captureEpoch || this.disposed) return;
      this.disableMicrophone();
      this.state.message = microphoneErrorMessage(e);
      this.state.microphoneIssue = this.state.message;
      this.changed();
      throw Error(this.state.message);
    }
  }
  async inputDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  }
  async selectInputDevice(deviceId: string) {
    const enabled = this.state.microphone;
    this.disableMicrophone();
    this.setSettings({ deviceId });
    if (enabled) await this.enableMicrophone();
  }
  press() {
    if (
      !this.state.microphone ||
      this.socket?.readyState !== WebSocket.OPEN ||
      this.context?.state !== 'running' ||
      document.visibilityState === 'hidden'
    )
      return;
    if (this.state.transmitting || this.state.requesting) return;
    this.state.requesting = true;
    this.pttSerial = (this.pttSerial % 0xffffffff) + 1;
    this.state.message = 'Waiting for a speaking slot…';
    this.socket.send(
      JSON.stringify({
        type: 'ptt',
        active: true,
        mode: this.config.mode,
        requestId: this.pttSerial,
      }),
    );
    this.admissionTimer = setTimeout(() => {
      this.release();
      this.state.message = 'No speaking slot answered. Release and try again.';
      this.changed();
    }, 3000);
    this.changed();
  }
  private admitPtt(requestId: unknown, mode: unknown) {
    if (requestId !== this.pttSerial || mode !== this.config.mode || !this.state.requesting) return;
    if (
      !this.state.microphone ||
      this.context?.state !== 'running' ||
      document.visibilityState === 'hidden'
    ) {
      this.release();
      return;
    }
    if (this.admissionTimer) clearTimeout(this.admissionTimer);
    this.admissionTimer = null;
    this.state.requesting = false;
    this.state.transmitting = true;
    this.state.message = `Speaking · ${this.config.mode} · ${this.state.ranges[this.config.mode]} tiles`;
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = true;
    });
    this.capture?.port.postMessage(true);
    this.holdTimer = setTimeout(() => {
      this.release();
      this.state.message = 'Release and press again after 20 seconds.';
      this.changed();
    }, 20000);
    this.changed();
  }
  release() {
    const endingPtt = this.state.transmitting || this.state.requesting;
    if (this.admissionTimer) clearTimeout(this.admissionTimer);
    this.admissionTimer = null;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.capture?.port.postMessage(false);
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });
    if (
      (this.state.transmitting || this.state.requesting) &&
      this.socket?.readyState === WebSocket.OPEN
    )
      this.socket.send(
        JSON.stringify({
          type: 'ptt',
          active: false,
          mode: this.config.mode,
          requestId: this.pttSerial,
        }),
      );
    this.state.transmitting = false;
    this.state.requesting = false;
    this.state.inputLevel = 0;
    if (
      endingPtt &&
      (this.state.status === 'ready' || this.state.status === 'listening') &&
      !this.state.microphoneIssue
    )
      this.state.message = this.state.microphone
        ? this.config.ptt === 'toggle'
          ? 'Microphone ready. Tap Talk to start; tap again to stop.'
          : 'Microphone ready. Press and hold the talk button; release to stop.'
        : 'Listening nearby. Microphone is off.';
    this.updateActivity();
    this.changed();
  }
  private disableCapture() {
    this.capture?.port.close();
    this.capture?.disconnect();
    this.captureSource?.disconnect();
    this.captureSink?.disconnect();
    this.capture = null;
    this.captureSource = null;
    this.captureSink = null;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.stop();
    });
  }
  disableMicrophone() {
    this.captureEpoch++;
    this.state.microphoneIssue = null;
    this.release();
    this.disableCapture();
    this.audioSession(false);
    this.state.microphone = false;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.state.status = 'listening';
      this.state.message = 'Listening nearby. Microphone is off.';
    }
    this.changed();
  }
  private audioSession(capturing: boolean) {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (!session) return;
    try {
      if (capturing) {
        this.previousAudioSessionType ??= session.type;
        session.type = 'play-and-record';
      } else if (this.previousAudioSessionType !== null) {
        session.type = this.previousAudioSessionType;
        this.previousAudioSessionType = null;
      }
    } catch {
      /* Routing is ultimately controlled by the browser and OS. */
    }
  }
  private blockControls() {
    return {
      peers: Object.entries(this.config.peers)
        .filter(([, p]) => p.blocked)
        .map(([id]) => id)
        .slice(0, 128),
      muted: Object.entries(this.config.peers)
        .filter(([, p]) => p.muted && !p.blocked)
        .map(([id]) => id)
        .slice(0, 128),
    };
  }
  private sendBlocks() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify({ type: 'block', ...this.blockControls() });
    if (payload === this.lastBlocks) return;
    this.lastBlocks = payload;
    this.socket.send(payload);
  }
  private receive(packet: Uint8Array) {
    if (packet.length !== VOICE_RELAY_BYTES || this.context?.state !== 'running' || !this.output)
      return;
    const id = voicePeerId(packet),
      source = this.connection.peers.find((p) => p.id === id),
      settings = this.config.peers[id];
    if (!source || settings?.muted || settings?.blocked) return;
    const bytes = packet.subarray(16);
    if (!validVoiceFrame(bytes)) return;
    const mode = VOICE_MODES[bytes[4]]!,
      listener = this.options.listener(),
      acoustic = voiceAcoustics(
        listener,
        source,
        mode,
        this.options.occlusion?.(listener, source) ?? 0,
        this.state.ranges,
      );
    if (acoustic.gain <= 0) return;
    let peer = this.peers.get(id);
    if (
      !peer &&
      [...this.peers.values()].filter((p) => performance.now() - p.last < 300).length >= 3
    )
      return;
    if (!peer) {
      if (this.peers.size >= 7) return;
      const gain = this.context.createGain(),
        filter = this.context.createBiquadFilter(),
        pan = this.context.createStereoPanner();
      filter.type = 'lowpass';
      gain.connect(filter).connect(pan).connect(this.output);
      peer = { gain, filter, pan, sources: new Set(), next: 0, last: 0, sequence: null, mode };
      this.peers.set(id, peer);
    }
    const sequence = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      8,
      true,
    );
    if (
      (peer.sequence !== null && (sequence - peer.sequence) >>> 0 > 0x7fffffff) ||
      sequence === peer.sequence
    )
      return;
    peer.sequence = sequence;
    peer.mode = mode;
    const now = this.context.currentTime;
    if (peer.next > now + 0.14 || peer.sources.size >= 9) {
      for (const s of peer.sources) s.stop();
      peer.sources.clear();
      peer.next = now + 0.04;
    }
    peer.next = Math.max(peer.next, now + 0.025);
    const buffer = this.context.createBuffer(1, VOICE_SAMPLES, VOICE_SAMPLE_RATE);
    buffer.getChannelData(0).set(decodeVoiceFrame(bytes));
    // Short ramps suppress clicks at independent-frame gaps, without a growing playback queue.
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < 8; i++) {
      samples[i] *= i / 8;
      samples[VOICE_SAMPLES - 1 - i] *= i / 8;
    }
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.connect(peer.gain);
    peer.sources.add(node);
    node.onended = () => {
      node.disconnect();
      peer!.sources.delete(node);
    };
    node.start(peer.next);
    peer.next += 0.02;
    peer.last = performance.now();
    this.applySpatial(peer, acoustic, settings?.volume ?? 1);
    this.updateActivity();
  }
  private applySpatial(
    peer: PeerAudio,
    acoustic: ReturnType<typeof voiceAcoustics>,
    volume: number,
  ) {
    const now = this.context!.currentTime,
      t = VOICE_ACOUSTICS.smoothingSeconds;
    peer.gain.gain.setTargetAtTime(acoustic.gain * volume, now, t);
    peer.pan.pan.setTargetAtTime(acoustic.pan, now, t);
    peer.filter.frequency.setTargetAtTime(acoustic.cutoff, now, t);
  }
  private update() {
    // A blocked identity can resume after this listener authenticated. Reconcile the
    // current roster without sending duplicate controls on ordinary pose updates.
    this.sendBlocks();
    if (!this.context) return;
    const now = performance.now();
    for (const [id, peer] of this.peers) {
      const source = this.connection.peers.find((p) => p.id === id),
        settings = this.config.peers[id];
      if (!source || now - peer.last > 1000) {
        for (const s of peer.sources) s.stop();
        peer.gain.disconnect();
        peer.filter.disconnect();
        peer.pan.disconnect();
        this.peers.delete(id);
        continue;
      }
      const listener = this.options.listener();
      this.applySpatial(
        peer,
        voiceAcoustics(
          listener,
          source,
          peer.mode,
          this.options.occlusion?.(listener, source) ?? 0,
          this.state.ranges,
        ),
        settings?.muted || settings?.blocked ? 0 : (settings?.volume ?? 1),
      );
    }
    this.updateActivity();
    if (this.state.transmitting) this.changed();
  }
  private updateActivity() {
    const now = performance.now(),
      speakers = [...this.peers]
        .filter(
          ([id, p]) =>
            now - p.last < 300 &&
            !this.config.peers[id]?.muted &&
            !this.config.peers[id]?.blocked &&
            (this.config.peers[id]?.volume ?? 1) > 0,
        )
        .map(([id]) => id),
      active = this.state.transmitting || (speakers.length > 0 && this.config.output > 0);
    const changed = speakers.join() !== this.state.speakers.join();
    this.state.speakers = speakers;
    if (active !== this.activity) {
      this.activity = active;
      this.options.onActivity?.(active);
    }
    if (changed) this.changed();
  }
  private clearPeers() {
    for (const p of this.peers.values()) {
      for (const s of p.sources) s.stop();
      p.gain.disconnect();
      p.filter.disconnect();
      p.pan.disconnect();
    }
    this.peers.clear();
    this.updateActivity();
  }
  private disconnectTransport() {
    this.epoch++;
    this.lastBlocks = '';
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.release();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.clearPeers();
  }
  suspend() {
    this.disableMicrophone();
    this.disconnectTransport();
    void this.context?.suspend();
    this.state.status = 'interrupted';
    this.state.message = 'Voice paused in the background. Tap Listen to resume.';
    this.changed();
  }
  disconnect() {
    this.listeningWanted = false;
    this.disableMicrophone();
    this.disconnectTransport();
    this.state.status = 'offline';
    this.state.message = 'Voice is off.';
    this.changed();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disconnect();
    clearInterval(this.meterTimer);
    document.removeEventListener('visibilitychange', this.hidden);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('pagehide', this.pagehide);
    if (this.connection.onVoiceSessionChange === this.sessionHandler)
      this.connection.onVoiceSessionChange = this.previousSession;
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close();
    }
    this.context = null;
  }
}
