import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { CoopRooms, type AuthoritySocket } from './room-authority.mjs';
import { RoomPersistence } from './room-persistence.ts';
import { storeRoom, type SavedRoom } from './room-storage.ts';
const fingerprint = (sdp?: string) =>
  /^a=fingerprint:(sha-256\s+[a-f0-9:]+)\r?$/im
    .exec(sdp ?? '')?.[1]
    .toLowerCase()
    .trim() ?? '';

/** A common wire shape keeps the WebSocket and browser-hosted room rules identical. */
export interface RoomTransport {
  readyState: number;
  readonly channelBinding?: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(message: string): void;
  close(): void;
}

class HostSocket implements AuthoritySocket {
  readyState = 1;
  get bufferedAmount() {
    return this.pendingBytes();
  }
  get channelBinding() {
    return this.binding();
  }
  private listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  constructor(
    private deliver: (message: string) => void,
    private terminateWire: () => void,
    private pendingBytes: () => number = () => 0,
    private binding: () => string = () => '',
  ) {}
  on(event: string, callback: (...args: unknown[]) => void) {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
  }
  once(event: string, callback: (...args: unknown[]) => void) {
    const once = (...args: unknown[]) => {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((fn) => fn !== once),
      );
      callback(...args);
    };
    this.on(event, once);
  }
  emit(event: string, ...args: unknown[]) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }
  send(message: string) {
    if (this.readyState === 1) this.deliver(message);
  }
  receive(message: unknown) {
    if (this.readyState !== 1) return;
    if (typeof message !== 'string' || message.length > 8192) return this.close();
    this.emit('message', message, false);
  }
  ping() {
    this.emit('pong');
  }
  terminate() {
    this.close();
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close');
    this.terminateWire();
  }
}

/** Peers exchange room data directly. PeerServer supplies discovery/signalling only. */
export function createPeerTransport(
  room = '',
  peerOptions?: PeerOptions,
  restore?: SavedRoom,
  forceHost = false,
): RoomTransport {
  const hosting = forceHost || !room || !!restore?.owner;
  const code =
    restore?.checkpoint.state.room ||
    room ||
    [...crypto.getRandomValues(new Uint8Array(5))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) throw Error('Use a valid room code.');
  const hostId = `verso-room-${code}`;
  const peer = hosting ? new Peer(hostId, peerOptions) : new Peer(peerOptions ?? {});
  let closed = false;
  let initialized = false;
  let activated = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempts = 0;
  const pendingChannels = new Set<DataConnection>();
  const offerTimers = new Map<DataConnection, ReturnType<typeof setTimeout>>();
  let channel: DataConnection | undefined;
  let local: HostSocket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let combatClock: ReturnType<typeof setInterval> | undefined;
  let persistenceClock: ReturnType<typeof setInterval> | undefined;
  let initialSave: ReturnType<typeof setTimeout> | undefined;
  const sockets = new Set<HostSocket>();
  const hub = hosting
    ? new CoopRooms({ maxRooms: 1, codeFactory: () => code, durable: true })
    : null;
  if (hub && restore?.owner) hub.restoreRoom(restore.checkpoint.state, restore.owner.privateState);
  const persistence = hub
    ? new RoomPersistence(
        hub,
        (saved) => {
          if (!storeRoom(saved))
            throw Error('Browser storage is full; this world could not be saved.');
        },
        restore?.owner?.identity,
        restore?.checkpoint,
      )
    : null;
  const persist = (latest = false) => {
    if (!activated || !persistence) return;
    return (latest ? persistence.flushLatest() : persistence.flush()).catch(() => {
      wire.onmessage?.({
        data: JSON.stringify({
          type: 'error',
          code: 'storage_failed',
          reason:
            'This world could not be saved in browser storage. Export your personal save and free storage before closing.',
        }),
      });
    });
  };
  const onPageHide = () => {
    void persist(true);
  };
  if (hosting) globalThis.addEventListener?.('pagehide', onPageHide);
  const wire: RoomTransport = {
    readyState: 0,
    get channelBinding() {
      return local ? 'loopback' : fingerprint(channel?.peerConnection?.remoteDescription?.sdp);
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(message) {
      if (wire.readyState !== 1) return;
      if (local) queueMicrotask(() => local?.receive(message));
      else channel?.send(message);
    },
    close() {
      if (closed) return;
      closed = true;
      wire.readyState = 3;
      clearInterval(heartbeat);
      clearInterval(combatClock);
      clearInterval(persistenceClock);
      clearTimeout(initialSave);
      globalThis.removeEventListener?.('pagehide', onPageHide);
      void persist(true);
      clearTimeout(reconnectTimer);
      for (const pending of pendingChannels) pending.close();
      pendingChannels.clear();
      for (const timer of offerTimers.values()) clearTimeout(timer);
      offerTimers.clear();
      for (const socket of sockets) socket.close();
      sockets.clear();
      channel?.close();
      peer.destroy();
      queueMicrotask(() => wire.onclose?.());
    },
  };
  const fail = () => {
    if (!closed) {
      wire.onerror?.();
      wire.close();
    }
  };
  const opened = () => {
    if (!closed) {
      activated = true;
      wire.readyState = 1;
      wire.onopen?.();
    }
  };
  const receive = (data: unknown) => {
    if (typeof data !== 'string' || data.length > 4_000_000) return fail();
    wire.onmessage?.({ data });
  };
  const reconnectSignal = () => {
    if (closed || reconnectTimer || peer.destroyed) return;
    reconnectTimer = setTimeout(
      () => {
        reconnectTimer = undefined;
        if (closed || peer.destroyed) return;
        if (peer.disconnected) peer.reconnect();
      },
      Math.min(30000, 1000 * 2 ** Math.min(5, reconnectAttempts++)),
    );
  };
  peer.on('error', (error) => {
    // Signalling loss must not tear down already established RTC channels.
    if (
      wire.readyState === 1 &&
      ['network', 'socket-error', 'socket-closed'].includes(error.type)
    ) {
      reconnectSignal();
      return;
    }
    fail();
  });
  peer.on('disconnected', () => {
    if (wire.readyState === 0) fail();
    else reconnectSignal();
  });
  peer.on('close', () => wire.close());
  peer.on('open', () => {
    if (closed) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    reconnectAttempts = 0;
    if (initialized) return;
    initialized = true;
    if (hub) {
      local = new HostSocket(
        (message) => queueMicrotask(() => receive(message)),
        () => wire.close(),
        () => 0,
        () => 'loopback',
      );
      sockets.add(local);
      hub.attach(local);
      heartbeat = setInterval(() => hub.heartbeat(), 15000);
      combatClock = setInterval(() => hub.tick(0.05), 50);
      persistenceClock = setInterval(() => void persist(), 5000);
      initialSave = setTimeout(() => void persist(), 500);
      opened();
    } else {
      channel = peer.connect(hostId, {
        reliable: true,
        serialization: 'binary',
        metadata: { game: 'verso' },
      });
      channel.on('open', opened);
      channel.on('data', receive);
      channel.on('error', fail);
      channel.on('close', () => wire.close());
    }
  });
  peer.on('connection', (connection) => {
    if (!hub || closed || sockets.size + pendingChannels.size >= 32) return connection.close();
    pendingChannels.add(connection);
    const releaseOffer = () => {
      pendingChannels.delete(connection);
      clearTimeout(offerTimers.get(connection));
      offerTimers.delete(connection);
    };
    offerTimers.set(
      connection,
      setTimeout(() => {
        releaseOffer();
        connection.close();
      }, 20000),
    );
    connection.on('close', releaseOffer);
    connection.on('error', () => {
      releaseOffer();
      connection.close();
    });
    connection.on('open', () => {
      releaseOffer();
      if (closed || sockets.size >= 32) return connection.close();
      const socket = new HostSocket(
        (message) => connection.send(message),
        () => connection.close(),
        () => connection.dataChannel?.bufferedAmount ?? 0,
        () => fingerprint(connection.peerConnection?.localDescription?.sdp),
      );
      sockets.add(socket);
      hub.attach(socket);
      connection.on('data', (data) => socket.receive(data));
      connection.on('error', () => socket.close());
      connection.on('close', () => {
        socket.close();
        sockets.delete(socket);
      });
    });
  });
  return wire;
}
