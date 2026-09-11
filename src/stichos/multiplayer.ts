import { MULTIPLAYER_PROTOCOL } from './multiplayer-protocol';
import type {
  ClientMessage,
  ServerMessage,
  Peer,
  MultiplayerGesture,
} from './multiplayer-protocol';
import type { Appearance, Point } from './types';
import type { WorldGeneration } from './world';

export interface RoomIdentity {
  seed: number;
  generation: WorldGeneration;
  name: string;
  appearance: Appearance;
  position: Point;
}
export class MultiplayerConnection {
  private socket: WebSocket | null = null;
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
  private endpoint = '';
  private lastPose = 0;
  private peerRecords = new Map<string, Peer>();
  room = '';
  peerId = '';
  status: 'offline' | 'connecting' | 'online' | 'disconnected' = 'offline';
  onChange: () => void = () => {};
  onWorld: (
    change: Extract<ServerMessage, { type: 'world' }> | Extract<ServerMessage, { type: 'welcome' }>,
  ) => void = () => {};
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
  ): Promise<void> {
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password)
      throw Error('Use a valid ws:// or wss:// game server.');
    const token = resume ? this.resumeToken : '';
    this.disconnect(false);
    if (!resume) {
      this.room = '';
      this.peerId = '';
      this.resumeToken = '';
    }
    const epoch = ++this.epoch;
    this.endpoint = url.href;
    this.reconnectIdentity = identity;
    this.status = 'connecting';
    this.onChange();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      let welcomed = false;
      const timeout = setTimeout(() => {
        socket.close();
        reject(Error('The game server did not answer.'));
      }, 10000);
      socket.onopen = () =>
        this.send({
          type: 'join',
          protocol: MULTIPLAYER_PROTOCOL,
          ...identity,
          room: room || undefined,
          resumeToken: token || undefined,
        });
      socket.onmessage = (event) => {
        if (epoch !== this.epoch || typeof event.data !== 'string' || event.data.length > 4_000_000)
          return;
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === 'welcome') {
          if (
            message.protocol !== MULTIPLAYER_PROTOCOL ||
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
          this.room = message.room;
          this.peerId = message.peerId;
          this.resumeToken = message.resumeToken;
          this.peerRecords = new Map(message.peers.map((peer) => [peer.id, peer]));
          this.onWorld(message);
          this.onChange();
          resolve();
        } else if (message.type === 'peerJoined' || message.type === 'pose') {
          this.peerRecords.set(message.peer.id, message.peer);
          this.onChange();
        } else if (message.type === 'peerLeft') {
          this.peerRecords.delete(message.peerId);
          this.onChange();
        } else if (message.type === 'world') {
          // The claimant applies its own successful local action after the acknowledgement.
          if (message.actorId !== this.peerId) this.onWorld(message);
        } else if (message.type === 'claimResult') {
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
            reject(Error(message.reason));
            socket.close();
          } else this.onMessage(message.reason);
        }
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        if (!welcomed) reject(Error('Cannot reach the game server.'));
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (epoch !== this.epoch) return;
        this.socket = null;
        this.status = welcomed ? 'disconnected' : 'offline';
        this.peerRecords.clear();
        this.cancelClaims();
        this.onChange();
        if (welcomed)
          this.onMessage(
            'The shared signal was interrupted. Reconnect from Together before gathering again.',
          );
        else reject(Error('The connection closed before joining the room.'));
      };
    });
  }
  reconnect(identity: RoomIdentity) {
    return this.connect(this.endpoint, identity, this.room, true);
  }
  disconnect(forget = true) {
    this.epoch++;
    this.socket?.close();
    this.socket = null;
    this.cancelClaims();
    this.peerRecords.clear();
    this.status = 'offline';
    if (forget) {
      this.room = '';
      this.peerId = '';
      this.resumeToken = '';
      this.reconnectIdentity = null;
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
  pose(player: Point & { heading: number; phase: number }, appearance: Appearance, force = false) {
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
    });
  }
  claim(propId: string, kind: 'gather' | 'loot', point: Point) {
    return this.request({ type: 'claim', requestId: '', propId, kind, ...point });
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
