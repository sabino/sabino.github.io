import {
  verifyRoomCheckpoint,
  type SignedRoomCheckpoint,
  type RoomSigningIdentity,
} from './room-checkpoint.ts';

const PREFIX = 'verso-room-v1:';
let memoryId = '';
const read = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
export function getBrowserPlayerId(): string {
  const old = read('identity');
  if (typeof old === 'string' && /^[a-f0-9-]{36}$/.test(old)) return old;
  memoryId ||= crypto.randomUUID();
  write('identity', memoryId);
  return memoryId;
}
export interface RoomCredential {
  token: string;
  peerId: string;
  serial: number;
  authority?: JsonWebKey;
}
const credentialKey = (endpoint: string, room: string) =>
  `credential:${endpoint}:${room.toUpperCase()}`;
export function readRoomCredential(endpoint: string, room: string): RoomCredential | null {
  const v = read(credentialKey(endpoint, room));
  return v &&
    typeof v.token === 'string' &&
    /^[A-Za-z0-9_-]{32}$/.test(v.token) &&
    typeof v.peerId === 'string' &&
    Number.isSafeInteger(v.serial) &&
    v.serial >= 0
    ? v
    : null;
}
export function saveRoomCredential(endpoint: string, room: string, value: RoomCredential) {
  const key = credentialKey(endpoint, room),
    old = read('credentials');
  const keys = [key, ...(Array.isArray(old) ? old : []).filter((k) => k !== key)];
  if (!write(key, value)) return false;
  for (const stale of keys.slice(64)) {
    try {
      localStorage.removeItem(PREFIX + stale);
    } catch {}
  }
  return write('credentials', keys.slice(0, 64));
}
export function forgetRoomCredential(endpoint: string, room: string) {
  try {
    localStorage.removeItem(PREFIX + credentialKey(endpoint, room));
  } catch {}
}
export interface SavedRoom {
  checkpoint: SignedRoomCheckpoint;
  owner?: { identity: RoomSigningIdentity; privateState: unknown };
}
export interface SavedWorldSummary {
  room: string;
  seed: number;
  generation: 1 | 2 | 3 | 4;
  revision: number;
  updatedAt: number;
  owned: boolean;
  authority: string;
}
export function savedWorlds(): SavedWorldSummary[] {
  const index = read('worlds');
  if (!Array.isArray(index)) return [];
  return index
    .slice(0, 24)
    .flatMap((code) => {
      const saved = read(`world:${code}`) as SavedRoom | null;
      const c = saved?.checkpoint;
      return c?.state
        ? [
            {
              room: c.state.room,
              seed: c.state.seed,
              generation: c.state.generation,
              revision: c.revision,
              updatedAt: c.createdAt,
              owned: !!saved?.owner,
              authority: `${c.authority.x}.${c.authority.y}`,
            },
          ]
        : [];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function loadSavedRoom(room: string): Promise<SavedRoom | null> {
  const value = read(`world:${room.toUpperCase()}`) as SavedRoom | null;
  return value && (await verifyRoomCheckpoint(value.checkpoint)) ? value : null;
}
export async function saveRoomReplica(checkpoint: SignedRoomCheckpoint): Promise<boolean> {
  if (!checkpoint?.state?.room) return false;
  const old = await loadSavedRoom(checkpoint.state.room);
  if (!(await verifyRoomCheckpoint(checkpoint, old?.checkpoint))) return false;
  // A visitor's newer replica never overwrites an owned world's private authority state.
  if (old?.owner) return checkpoint.hash === old.checkpoint.hash;
  // Verification yields: recheck the latest committed revision before the synchronous write.
  const current = read(`world:${checkpoint.state.room}`) as SavedRoom | null;
  if (current?.owner) return checkpoint.hash === current.checkpoint.hash;
  if (
    current?.checkpoint &&
    (current.checkpoint.revision > checkpoint.revision ||
      current.checkpoint.authority.x !== checkpoint.authority.x ||
      current.checkpoint.authority.y !== checkpoint.authority.y ||
      (current.checkpoint.revision === checkpoint.revision &&
        current.checkpoint.hash !== checkpoint.hash))
  )
    return false;
  return storeRoom({ checkpoint });
}
export function storeRoom(saved: SavedRoom): boolean {
  const room = saved.checkpoint.state.room;
  const current = read(`world:${room}`) as SavedRoom | null;
  if (current?.checkpoint) {
    if (current.owner && !saved.owner) return false;
    if (
      current.checkpoint.authority.x !== saved.checkpoint.authority.x ||
      current.checkpoint.authority.y !== saved.checkpoint.authority.y
    )
      return false;
    if (
      current.checkpoint.revision > saved.checkpoint.revision ||
      (current.checkpoint.revision === saved.checkpoint.revision &&
        current.checkpoint.hash !== saved.checkpoint.hash)
    )
      return false;
  }
  const old = read('worlds');
  const keys = [room, ...(Array.isArray(old) ? old : []).filter((c) => c !== room)];
  // Explicit capacity failure preserves owned planets rather than silently deleting one.
  if (keys.length > 24) return false;
  if (!write(`world:${room}`, saved)) return false;
  return write('worlds', keys);
}
