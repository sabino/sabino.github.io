export const MAX_MESSAGE_BYTES: number;
export interface AuthoritySocket {
  readyState: number;
  bufferedAmount: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
}
export interface AuthorityConnection {
  socket: AuthoritySocket;
  room: unknown;
  member: unknown;
}
export class CoopRooms {
  constructor(options?: {
    now?: () => number;
    maxRooms?: number;
    maxPeers?: number;
    reconnectMs?: number;
    roomIdleMs?: number;
    messagesPerSecond?: number;
    messageBurst?: number;
    codeFactory?: () => string;
  });
  rooms: Map<string, unknown>;
  connections: Set<AuthorityConnection>;
  attach(socket: AuthoritySocket): AuthorityConnection;
  detach(connection: AuthorityConnection): void;
  handle(connection: AuthorityConnection, message: unknown): void;
  heartbeat(): void;
  tick(dt?: number): void;
  sweep(): void;
}
