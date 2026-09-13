import { validFaunaFrame, type FaunaFrame } from './living-world.ts';
import type { VoiceCapability, VoiceTicket } from './voice-protocol.ts';
import type { RoomTransport } from './peer-transport';
import { PEER_CONNECT_TIMEOUT, peerFailure, type PeerNetworkDiagnostic } from './peer-network.ts';
import type { SharedCombatFrame } from './shared-combat';
import type { SharedCombatProgression } from './shared-combat';
import { ACTION_EXPANSION, type TechniqueId } from './combat-techniques.ts';
import { MULTIPLAYER_PROTOCOL } from './multiplayer-protocol.ts';
import type {
  ClientMessage,
  ServerMessage,
  Peer,
  MultiplayerGesture,
} from './multiplayer-protocol.ts';
import type { Appearance, Point } from './types';
import type { WorldGeneration } from './world';
import {
  getBrowserPlayerId,
  readRoomCredential,
  saveRoomCredential,
  loadSavedRoom,
  saveRoomReplica,
  type SavedRoom,
} from './room-storage.ts';
import {
  validRoomChat,
  validProductionMachine,
  verifyRoomCheckpoint,
  verifyRoomHello,
  type SignedRoomCheckpoint,
} from './room-checkpoint.ts';
import type { ChatChannel, RoomChat, ProductionMachine, RoomInfo } from './multiplayer-protocol.ts';
export { getBrowserPlayerId, savedWorlds } from './room-storage.ts';

export interface RoomIdentity {
  clientId?: string;
  seed: number;
  generation: WorldGeneration;
  name: string;
  appearance: Appearance;
  position: Point;
  bodyId?: string;
  combatActive?: boolean;
  progression?: SharedCombatProgression;
}
export class MultiplayerConnection {
  actionExpansion = false;
  private socket: RoomTransport | WebSocket | null = null;
  voiceCapability: VoiceCapability | null = null;
  onVoiceSessionChange: () => void = () => {};
  private voiceRequests = new Map<
    string,
    {
      resolve: (ticket: VoiceTicket) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  get voiceEndpoint(): string {
    if (!this.voiceCapability || this.endpoint === 'peer:') return '';
    const url = new URL(this.endpoint);
    url.pathname = '/voice';
    url.search = '';
    url.hash = '';
    return url.href;
  }
  requestVoiceTicket(): Promise<VoiceTicket> {
    if (this.status !== 'online' || !this.voiceEndpoint)
      return Promise.reject(Error('Join a voice-enabled world node first.'));
    const requestId = `v${++this.serial}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.voiceRequests.delete(requestId);
        reject(Error('Voice credential request timed out.'));
      }, 4000);
      this.voiceRequests.set(requestId, { resolve, reject, timer });
      this.send({ type: 'voice_ticket', requestId });
    });
  }
  private clearVoiceSession() {
    this.actionExpansion = false;
    this.voiceCapability = null;
    this.livingClock = null;
    for (const r of this.voiceRequests.values()) {
      clearTimeout(r.timer);
      r.reject(Error('Game membership ended.'));
    }
    this.voiceRequests.clear();
    this.onVoiceSessionChange();
  }
  onNetworkChange: () => void = () => {};
  networkDiagnostic: Readonly<PeerNetworkDiagnostic> | null = null;
  lastError = '';
  private serial = 0;
  private epoch = 0;
  private pending = new Map<
    string,
    {
      resolve: (value: { ok: boolean; reason?: string }) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private reconnectIdentity: RoomIdentity | null = null;
  private resumeToken = '';
  private knownAuthority: JsonWebKey | undefined;
  private endpoint = '';
  private publicWorld = false;
  private lastPose = 0;
  private lastCombatAck = 0;
  private peerRecords = new Map<string, Peer>();
  private chats: RoomChat[] = [];
  machines: ProductionMachine[] = [];
  onChat: (message: RoomChat) => void = () => {};
  onMachines: (machines: readonly ProductionMachine[]) => void = () => {};
  onCheckpoint: (checkpoint: SignedRoomCheckpoint) => void = () => {};
  get chatHistory(): readonly RoomChat[] {
    return this.chats;
  }
  private persistCredential() {
    if (this.room && this.resumeToken)
      saveRoomCredential(this.endpoint, this.room, {
        token: this.resumeToken,
        peerId: this.peerId,
        serial: this.serial,
        authority: this.knownAuthority,
      });
  }
  room = '';
  peerId = '';
  status: 'offline' | 'connecting' | 'online' | 'disconnected' = 'offline';
  onChange: () => void = () => {};
  onWorld: (
    change: Extract<ServerMessage, { type: 'world' }> | Extract<ServerMessage, { type: 'welcome' }>,
  ) => void = () => {};
  onCombat: (frame: SharedCombatFrame) => void = () => {};
  onLiving: (frame: FaunaFrame) => void = () => {};
  private livingClock: { seconds: number; sampledAt: number } | null = null;
  get worldElapsedSeconds(): number | null {
    return this.status === 'online' && this.livingClock
      ? this.livingClock.seconds +
          Math.max(0, performance.now() - this.livingClock.sampledAt) / 1000
      : null;
  }
  private receiveLiving(frame: unknown) {
    if (!validFaunaFrame(frame)) return;
    this.livingClock = { seconds: frame.elapsedSeconds, sampledAt: performance.now() };
    this.onLiving(frame);
  }
  onMessage: (text: string) => void = () => {};
  onEmote: (peerId: string, gesture: MultiplayerGesture) => void = () => {};
  get peers(): readonly Peer[] {
    return [...this.peerRecords.values()].filter((peer) => peer.id !== this.peerId);
  }
  get busy() {
    return this.pending.size > 0;
  }
  get reconnectable() {
    return !!this.reconnectIdentity && !!this.room && !!this.resumeToken;
  }
  async connect(
    endpoint: string,
    identity: RoomIdentity,
    room = '',
    resume = false,
    hostedRestore?: SavedRoom,
    forceHost = false,
    publicWorld = false,
  ): Promise<void> {
    room = room.trim().toUpperCase();
    const peerHosted = endpoint === 'peer:';
    const url = new URL(peerHosted ? 'https://peerjs.com' : endpoint);
    if (!peerHosted && (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password))
      throw Error('Use a valid ws:// or wss:// game server.');
    const normalizedEndpoint = peerHosted ? 'peer:' : url.href;
    const stored = room ? readRoomCredential(normalizedEndpoint, room) : null;
    const token =
      forceHost && !hostedRestore ? '' : resume ? this.resumeToken : (stored?.token ?? '');
    this.serial = Math.max(this.serial, stored?.serial ?? 0);
    identity = { ...identity, clientId: identity.clientId ?? getBrowserPlayerId() };
    this.disconnect(false);
    if (!resume) {
      this.room = room;
      this.peerId = '';
      this.resumeToken = '';
    }
    const epoch = ++this.epoch;
    this.endpoint = peerHosted ? 'peer:' : url.href;
    this.publicWorld = !peerHosted && publicWorld;
    this.reconnectIdentity = identity;
    this.lastCombatAck = 0;
    this.lastError = '';
    this.networkDiagnostic = null;
    this.status = 'connecting';
    this.onChange();
    const pinned = room ? (await loadSavedRoom(room))?.checkpoint : undefined;
    const pinnedKey =
      forceHost && !hostedRestore
        ? undefined
        : (pinned?.authority ?? stored?.authority ?? (resume ? this.knownAuthority : undefined));
    const peerFactory = peerHosted ? (await import('./peer-transport')).createPeerTransport : null;
    if (epoch !== this.epoch) return;
    return new Promise((resolve, reject) => {
      const socket = peerFactory
        ? peerFactory(room, undefined, hostedRestore, forceHost)
        : new WebSocket(url);
      this.socket = socket;
      let welcomed = false;
      const diagnostic = () => (socket as RoomTransport).diagnostic;
      const failureReason = (fallback: string) => diagnostic()?.error?.reason ?? fallback;
      if (peerHosted)
        (socket as RoomTransport).onstatuschange = () => {
          if (epoch !== this.epoch) return;
          this.networkDiagnostic = diagnostic() ?? null;
          if (this.networkDiagnostic?.error) this.lastError = this.networkDiagnostic.error.reason;
          this.onNetworkChange();
        };
      const timeout = setTimeout(
        () => {
          this.lastError = failureReason(
            peerHosted && diagnostic()
              ? peerFailure('timeout', diagnostic()!).reason
              : 'The game server did not answer.',
          );
          reject(Error(this.lastError));
          socket.close();
        },
        peerHosted ? PEER_CONNECT_TIMEOUT + 5000 : 10000,
      );
      const challenge = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      let joined = false;
      const join = () => {
        joined = true;
        this.send({
          type: 'join',
          livingWorld: 1,
          actionExpansion: ACTION_EXPANSION,
          protocol: MULTIPLAYER_PROTOCOL,
          ...identity,
          room: forceHost && !hostedRestore ? undefined : room || undefined,
          ...(this.publicWorld ? { publicWorld: true } : {}),
          challenge,
          resumeToken: (pinnedKey ? token : '') || undefined,
        });
      };
      socket.onopen = () => {
        if (pinnedKey && room)
          this.send({ type: 'hello', room, protocol: MULTIPLAYER_PROTOCOL, challenge });
        else join();
      };
      const consume = (message: ServerMessage) => {
        if (message.type === 'welcome') {
          if (
            message.protocol !== MULTIPLAYER_PROTOCOL ||
            typeof message.room !== 'string' ||
            !/^[A-Z0-9]{4,16}$/.test(message.room) ||
            !Array.isArray(message.peers) ||
            message.peers.length > 8 ||
            typeof message.peerId !== 'string' ||
            typeof message.resumeToken !== 'string' ||
            !/^[A-Za-z0-9_-]{32}$/.test(message.resumeToken) ||
            !Array.isArray(message.removed) ||
            message.removed.length > 16384 ||
            !Array.isArray(message.opened) ||
            message.opened.length > 16384 ||
            message.seed !== identity.seed ||
            message.generation !== identity.generation
          ) {
            clearTimeout(timeout);
            reject(
              Error(
                'This room belongs to a different world. Enter its seed and generation before joining.',
              ),
            );
            this.disconnect();
            return;
          }
          welcomed = true;
          clearTimeout(timeout);
          this.status = 'online';
          this.voiceCapability =
            message.voice?.version === 1 && Array.isArray(message.voice.codecs)
              ? message.voice
              : null;
          this.room = message.room;
          this.actionExpansion = message.actionExpansion === ACTION_EXPANSION;
          this.peerId = message.peerId;
          this.resumeToken = message.resumeToken;
          this.persistCredential();
          this.chats = (Array.isArray(message.chat) ? message.chat : [])
            .filter(validRoomChat)
            .slice(-200);
          this.machines =
            Array.isArray(message.machines) &&
            message.machines.length <= 256 &&
            message.machines.every(validProductionMachine)
              ? message.machines
              : [];
          this.onMachines(this.machines);
          this.peerRecords = new Map(message.peers.map((peer) => [peer.id, peer]));
          this.onWorld(message);
          this.onChange();
          this.onCombat(message.combat);
          if (message.living) this.receiveLiving(message.living);
          this.onVoiceSessionChange();
          resolve();
        } else if (message.type === 'voice_ticket') {
          const pending = this.voiceRequests.get(message.requestId);
          if (
            pending &&
            /^[A-Za-z0-9_-]{43}$/.test(message.ticket) &&
            Number.isFinite(message.expiresAt)
          ) {
            clearTimeout(pending.timer);
            this.voiceRequests.delete(message.requestId);
            pending.resolve({ ticket: message.ticket, expiresAt: message.expiresAt });
          }
        } else if (message.type === 'peerJoined' || message.type === 'pose') {
          this.peerRecords.set(message.peer.id, message.peer);
          this.onChange();
        } else if (message.type === 'peerLeft') {
          this.peerRecords.delete(message.peerId);
          this.onChange();
        } else if (message.type === 'world') {
          // The claimant applies its own successful local action after the acknowledgement.
          if (message.actorId !== this.peerId) this.onWorld(message);
        } else if (message.type === 'chat') {
          if (
            validRoomChat(message.message) &&
            message.message.room === this.room &&
            !this.chats.some((c) => c.id === message.message.id)
          ) {
            this.chats.push(message.message);
            this.chats = this.chats.slice(-200);
            this.onChat(message.message);
          }
        } else if (message.type === 'machines') {
          if (
            !Array.isArray(message.machines) ||
            message.machines.length > 256 ||
            !message.machines.every(validProductionMachine)
          )
            return;
          this.machines = message.machines;
          this.onMachines(this.machines);
        } else if (message.type === 'checkpoint') {
          if (message.checkpoint?.state?.room === this.room)
            void saveRoomReplica(message.checkpoint).then((ok) => {
              if (ok && epoch === this.epoch) this.onCheckpoint(message.checkpoint);
            });
        } else if (message.type === 'living_frame') {
          this.receiveLiving(message.frame);
        } else if (message.type === 'combat_frame') {
          this.onCombat(message.frame);
        } else if (
          message.type === 'claimResult' ||
          message.type === 'combat_result' ||
          message.type === 'chat_result'
        ) {
          if (message.type === 'combat_result') this.onCombat(message.frame);
          const request = this.pending.get(message.requestId);
          if (request) {
            clearTimeout(request.timer);
            this.pending.delete(message.requestId);
            request.resolve(message);
          }
        } else if (message.type === 'emote') this.onEmote(message.peerId, message.gesture);
        else if (message.type === 'error') {
          if (!welcomed) {
            clearTimeout(timeout);
            this.lastError = message.reason;
            reject(Error(message.reason));
            socket.close();
          } else this.onMessage(message.reason);
        }
      };
      let checkpointVerified = !pinned,
        proofVerified = false,
        verifying = false,
        failed = false;
      let liveAuthority: JsonWebKey | undefined;
      let waiting: Extract<ServerMessage, { type: 'welcome' }> | null = null;
      let queued: ServerMessage[] = [],
        queuedBytes = 0;
      const rejectPin = (reason: string) => {
        this.lastError = reason;
        failed = true;
        clearTimeout(timeout);
        queued = [];
        waiting = null;
        if (welcomed) this.onMessage(reason);
        reject(Error(reason));
        socket.close();
      };
      const finishWelcome = () => {
        if (failed || epoch !== this.epoch || !waiting || !proofVerified || !checkpointVerified)
          return;
        const welcome = waiting;
        waiting = null;
        consume(welcome);
        if (!welcomed) return;
        for (const packet of queued) consume(packet);
        queued = [];
        queuedBytes = 0;
      };
      socket.onmessage = (event: { data: unknown }) => {
        if (
          failed ||
          epoch !== this.epoch ||
          typeof event.data !== 'string' ||
          event.data.length > 4_000_000
        )
          return;
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
        if (!welcomed) {
          if (message.type === 'error') {
            consume(message);
            return;
          }
          if (message.type === 'room_info' && pinnedKey && !joined) {
            const binding = (socket as RoomTransport).channelBinding ?? '';
            void verifyRoomHello(message.proof, challenge, room, binding, pinnedKey).then((ok) => {
              if (failed || epoch !== this.epoch || socket.readyState !== 1 || joined) return;
              if (!ok)
                return rejectPin(
                  'The live room could not prove its signing key. Your private reconnect credential was not sent.',
                );
              if (
                message.info?.seed !== identity.seed ||
                message.info?.generation !== identity.generation
              )
                return rejectPin('This room belongs to a different generated planet.');
              join();
            });
            return;
          }
          if (message.type === 'welcome') {
            if (waiting) return rejectPin('The room repeated its identity handshake.');
            waiting = message;
            const binding = (socket as RoomTransport).channelBinding ?? '';
            void verifyRoomHello(
              message.proof,
              challenge,
              room || message.room,
              binding,
              pinnedKey,
            ).then((ok) => {
              if (failed || epoch !== this.epoch || socket.readyState !== 1) return;
              if (!ok)
                return rejectPin(
                  'The live room could not prove its signing key for this connection. No room state was applied.',
                );
              liveAuthority = message.proof!.authority;
              this.knownAuthority = liveAuthority;
              proofVerified = true;
              finishWelcome();
            });
            return;
          }
          if (message.type === 'checkpoint' && pinned && !checkpointVerified) {
            if (verifying) return;
            verifying = true;
            void verifyRoomCheckpoint(message.checkpoint, pinned).then((ok) => {
              if (failed || epoch !== this.epoch || socket.readyState !== 1) return;
              if (!ok)
                return rejectPin(
                  'This room could not prove the saved world’s signing authority. Its live state was not applied.',
                );
              checkpointVerified = true;
              queued.push(message);
              finishWelcome();
            });
            return;
          }
          queuedBytes += event.data.length;
          if (queued.length >= 128 || queuedBytes > 8_000_000)
            return rejectPin('The room sent too much state before proving its saved world.');
          queued.push(message);
          return;
        }
        if (
          message.type === 'checkpoint' &&
          liveAuthority &&
          (message.checkpoint?.authority?.x !== liveAuthority.x ||
            message.checkpoint?.authority?.y !== liveAuthority.y)
        )
          return rejectPin('The room changed its signing authority during this connection.');
        consume(message);
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        this.lastError = failureReason(
          peerHosted
            ? 'Could not reach that browser room. Keep the host’s game open and retry.'
            : 'Cannot reach the game server.',
        );
        if (!welcomed) reject(Error(this.lastError));
        socket.close();
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (epoch !== this.epoch) return;
        this.socket = null;
        this.status = welcomed ? 'disconnected' : 'offline';
        this.clearVoiceSession();
        this.peerRecords.clear();
        this.cancelClaims();
        this.onChange();
        if (welcomed)
          this.onMessage(
            'The shared signal was interrupted. Reconnect from Together before gathering again.',
          );
        else {
          this.lastError ||= failureReason('The connection closed before joining the room.');
          reject(Error(this.lastError));
        }
      };
    });
  }
  async hostSavedWorld(roomCode: string, identity: RoomIdentity) {
    const saved = await loadSavedRoom(roomCode);
    if (!saved?.owner)
      throw Error('Only the original browser authority can resume this saved world.');
    if (
      saved.checkpoint.state.seed !== identity.seed ||
      saved.checkpoint.state.generation !== identity.generation
    )
      throw Error('Enter the saved world seed before hosting it.');
    return this.connect('peer:', identity, roomCode, false, saved);
  }
  async hostPublicWorld(code: string, identity: RoomIdentity) {
    code = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) throw Error('Use a valid public world code.');
    const saved = await loadSavedRoom(code);
    if (saved?.owner) return this.hostSavedWorld(code, identity);
    if (saved)
      throw Error(
        'This planet belongs to its saved signing authority. Its original host or world node must return.',
      );
    return this.connect('peer:', identity, code, false, undefined, true);
  }
  joinPublicWorld(endpoint: string, code: string, identity: RoomIdentity) {
    if (endpoint === 'peer:') throw Error('A persistent public world needs a world node.');
    return this.connect(endpoint, identity, code, false, undefined, false, true);
  }
  sendChat(text: string, channel: ChatChannel = 'say') {
    return this.request({ type: 'chat', requestId: '', channel, text });
  }
  registerProductionMachine(machine: Omit<ProductionMachine, 'ownerId'>) {
    return this.request({ type: 'machine', requestId: '', machine });
  }
  productionClaim(machineId: string, jobId: string, propId: string, point: Point) {
    return this.request({ type: 'production', requestId: '', machineId, jobId, propId, ...point });
  }
  reconnect(identity: RoomIdentity) {
    return this.connect(
      this.endpoint,
      identity,
      this.room,
      true,
      undefined,
      false,
      this.publicWorld,
    );
  }
  disconnect(forget = true) {
    this.epoch++;
    this.socket?.close();
    this.socket = null;
    this.networkDiagnostic = null;
    this.onNetworkChange();
    this.cancelClaims();
    this.peerRecords.clear();
    this.status = 'offline';
    this.clearVoiceSession();
    if (forget) {
      this.lastError = '';
      this.room = '';
      this.peerId = '';
      this.resumeToken = '';
      this.reconnectIdentity = null;
      this.knownAuthority = undefined;
    }
    this.onChange();
  }
  private cancelClaims() {
    for (const value of this.pending.values()) {
      clearTimeout(value.timer);
      value.resolve({
        ok: false,
        reason: 'The connection was interrupted. Please reconnect before trying again.',
      });
    }
    this.pending.clear();
  }
  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  pose(
    player: Point & { heading: number; phase: number },
    appearance: Appearance,
    force = false,
    combatActive = false,
    progression?: SharedCombatProgression,
    bodyId?: string,
    name?: string,
  ) {
    const time = performance.now();
    if (this.status !== 'online' || (!force && time - this.lastPose < 100)) return;
    this.lastPose = time;
    this.send({
      type: 'pose',
      x: player.x,
      y: player.y,
      heading: player.heading,
      phase: player.phase,
      appearance,
      combatActive,
      progression,
      bodyId,
      name,
    });
  }
  acknowledgeCombat(eventId: number) {
    if (Number.isSafeInteger(eventId) && eventId > this.lastCombatAck) {
      this.lastCombatAck = eventId;
      this.send({ type: 'combat_ack', eventId });
    }
  }
  combat(kind: 'attack' | 'ward', heading: number) {
    return this.request({ type: 'combat', requestId: '', kind, heading });
  }
  technique(technique: TechniqueId, heading: number) {
    if (!this.actionExpansion)
      return Promise.resolve({
        ok: false,
        reason: 'This room runs an earlier build. Ordinary attacks and wards still work.',
      });
    return this.request({ type: 'combat', requestId: '', kind: 'technique', technique, heading });
  }
  parley(guardIds: string[]) {
    return this.request({ type: 'combat', requestId: '', kind: 'parley', guardIds });
  }
  claim(
    propId: string,
    kind: 'gather' | 'loot',
    point: Point,
    toolKind?: 'axe' | 'pickaxe' | 'sickle',
  ) {
    return this.request({
      type: 'claim',
      requestId: '',
      propId,
      kind,
      x: point.x,
      y: point.y,
      ...(toolKind === undefined ? {} : { toolKind }),
    });
  }
  door(propId: string, open: boolean) {
    return this.request({ type: 'door', requestId: '', propId, open });
  }
  private request(
    message: Extract<ClientMessage, { requestId: string }>,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (this.status !== 'online')
      return Promise.resolve({ ok: false, reason: 'Reconnect to the shared world first.' });
    const requestId = `r${++this.serial}`;
    this.persistCredential();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({
          ok: false,
          reason: 'No acknowledgement arrived. Reconnect to refresh the shared world.',
        });
        // An uncertain result must be reconciled before another local claim can run.
        this.socket?.close();
      }, 7000);
      this.pending.set(requestId, { resolve, timer });
      this.send({ ...message, requestId });
    });
  }
  emote(gesture: MultiplayerGesture) {
    if (this.status === 'online') this.send({ type: 'emote', gesture });
  }
}

/** Reads metadata without joining, changing a world, or reserving a player slot. */
export async function discoverRoom(endpoint: string, room: string): Promise<RoomInfo> {
  room = room.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(room)) throw Error('Use a valid room code.');
  const peerHosted = endpoint === 'peer:';
  if (!peerHosted) {
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password)
      throw Error('Use a valid game server.');
  }
  const socket: RoomTransport | WebSocket = peerHosted
    ? (await import('./peer-transport.ts')).createPeerTransport(room)
    : new WebSocket(endpoint);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, info?: RoomInfo) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else resolve(info!);
    };
    const timeout = setTimeout(
      () =>
        finish(
          Error(
            (socket as RoomTransport).diagnostic
              ? peerFailure('timeout', (socket as RoomTransport).diagnostic!).reason
              : 'The world node did not answer.',
          ),
        ),
      peerHosted ? PEER_CONNECT_TIMEOUT + 5000 : 15000,
    );
    socket.onopen = () =>
      socket.send(JSON.stringify({ type: 'hello', room, protocol: MULTIPLAYER_PROTOCOL }));
    socket.onerror = () =>
      finish(
        Error(
          (socket as RoomTransport).diagnostic?.error?.reason ??
            'The world node could not be reached.',
        ),
      );
    socket.onclose = () => finish(Error('World discovery closed before answering.'));
    socket.onmessage = (event: { data: unknown }) => {
      if (typeof event.data !== 'string' || event.data.length > 8192) return;
      try {
        const m = JSON.parse(event.data);
        if (
          m.type === 'room_info' &&
          m.info?.room === room &&
          Number.isInteger(m.info.seed) &&
          m.info.seed >= 0 &&
          m.info.seed <= 0xffffffff &&
          [1, 2, 3, 4].includes(m.info.generation)
        )
          finish(undefined, m.info);
        else if (m.type === 'error') finish(Error(m.reason));
      } catch {}
    };
  });
}
