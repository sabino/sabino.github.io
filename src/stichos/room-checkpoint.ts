import { validSharedCombatCheckpoint, type SharedCombatCheckpoint } from './shared-combat.ts';
import type { ProductionMachine, RoomChat } from './multiplayer-protocol.ts';
import type { WorldGeneration } from './world.ts';

export interface RoomWorldCheckpoint {
  version: 1;
  room: string;
  seed: number;
  generation: WorldGeneration;
  removed: string[];
  opened: string[];
  combat: SharedCombatCheckpoint;
  combatEvent: number;
  machines: ProductionMachine[];
  chat: RoomChat[];
  chatSerial: number;
  productionReceipts: { ownerId: string; machineId: string; jobId: string; sourceId: string }[];
}
export interface SignedRoomCheckpoint {
  version: 1;
  authority: JsonWebKey;
  revision: number;
  previous: string;
  createdAt: number;
  state: RoomWorldCheckpoint;
  signature: string;
  hash: string;
}
export interface RoomSigningIdentity {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}
const encode = new TextEncoder();
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  finite(v, min, max) && Number.isInteger(v);
const text = (v: unknown, max = 160): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
const strings = (v: unknown, max = 16384): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => text(x)) && new Set(v).size === v.length;
export function validRoomChat(v: unknown): v is RoomChat {
  return (
    object(v) &&
    integer(v.id, 1) &&
    text(v.room, 16) &&
    ['say', 'world'].includes(v.channel as string) &&
    text(v.peerId) &&
    text(v.name, 64) &&
    text(v.text, 560) &&
    [...(v.text as string)].length <= 280 &&
    finite(v.x, -1e9, 1e9) &&
    finite(v.y, -1e9, 1e9) &&
    integer(v.at)
  );
}
export function validProductionMachine(v: unknown): v is ProductionMachine {
  return (
    object(v) &&
    text(v.id) &&
    text(v.ownerId) &&
    ['garden', 'sawmill', 'ore-sorter'].includes(v.kind as string) &&
    finite(v.x, -1e9, 1e9) &&
    finite(v.y, -1e9, 1e9)
  );
}
export function validRoomWorldCheckpoint(v: unknown): v is RoomWorldCheckpoint {
  try {
    return (
      object(v) &&
      v.version === 1 &&
      typeof v.room === 'string' &&
      /^[A-Z0-9]{4,16}$/.test(v.room) &&
      integer(v.seed, 0, 0xffffffff) &&
      [1, 2, 3].includes(v.generation as number) &&
      strings(v.removed) &&
      strings(v.opened) &&
      validSharedCombatCheckpoint(v.combat) &&
      integer(v.combatEvent) &&
      integer(v.chatSerial) &&
      Array.isArray(v.chat) &&
      v.chat.length <= 200 &&
      v.chat.every(validRoomChat) &&
      v.chat.every((c) => c.room === v.room && c.id <= (v.chatSerial as number)) &&
      Array.isArray(v.machines) &&
      v.machines.length <= 256 &&
      v.machines.every(validProductionMachine) &&
      new Set(v.machines.map((m) => m.id)).size === v.machines.length &&
      Array.isArray(v.productionReceipts) &&
      v.productionReceipts.length <= 16384 &&
      v.productionReceipts.every(
        (r) =>
          object(r) && text(r.ownerId) && text(r.machineId) && text(r.jobId) && text(r.sourceId),
      )
    );
  } catch {
    return false;
  }
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (object(v))
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}
function bytes64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function from64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
/** Public topic binds the generated planet to its signing authority, not a mutable nickname. */
export function roomCheckpointTopic(checkpoint: SignedRoomCheckpoint): Promise<string> {
  const { state, authority } = checkpoint;
  return digest(
    `verso-world-v1|${state.room}|${state.seed}|${state.generation}|${authority.x}|${authority.y}`,
  );
}
export async function createRoomSigningIdentity(): Promise<RoomSigningIdentity> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  return {
    publicKey: await crypto.subtle.exportKey('jwk', keys.publicKey),
    privateKey: await crypto.subtle.exportKey('jwk', keys.privateKey),
  };
}
export async function signRoomCheckpoint(
  state: RoomWorldCheckpoint,
  identity: RoomSigningIdentity,
  previous?: SignedRoomCheckpoint,
): Promise<SignedRoomCheckpoint> {
  if (!validRoomWorldCheckpoint(state)) throw Error('Invalid room checkpoint.');
  const payload = {
    version: 1 as const,
    authority: identity.publicKey,
    revision: (previous?.revision ?? 0) + 1,
    previous: previous?.hash ?? '',
    createdAt: Date.now(),
    state: structuredClone(state),
  };
  // Sign only public state: reconnect credentials and private keys never enter the envelope.
  const serialized = canonical(payload);
  if (encode.encode(serialized).length > 3_500_000)
    throw Error('Room checkpoint storage limit reached.');
  const key = await crypto.subtle.importKey(
    'jwk',
    identity.privateKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = bytes64(
    new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encode.encode(serialized)),
    ),
  );
  return { ...payload, signature, hash: await digest(`${serialized}.${signature}`) };
}
export async function verifyRoomCheckpoint(
  value: unknown,
  pinned?: SignedRoomCheckpoint,
): Promise<boolean> {
  try {
    if (
      !object(value) ||
      value.version !== 1 ||
      !object(value.authority) ||
      value.authority.d !== undefined ||
      value.authority.kty !== 'EC' ||
      value.authority.crv !== 'P-256' ||
      !text(value.authority.x, 64) ||
      !text(value.authority.y, 64) ||
      !integer(value.revision, 1) ||
      !integer(value.createdAt) ||
      typeof value.previous !== 'string' ||
      !/^(?:[a-f0-9]{64})?$/.test(value.previous) ||
      typeof value.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.hash) ||
      typeof value.signature !== 'string' ||
      value.signature.length > 128 ||
      !validRoomWorldCheckpoint(value.state)
    )
      return false;
    if (
      pinned &&
      (canonical(value.authority) !== canonical(pinned.authority) ||
        value.state.room !== pinned.state.room ||
        value.state.seed !== pinned.state.seed ||
        value.state.generation !== pinned.state.generation ||
        value.revision < pinned.revision ||
        (value.revision === pinned.revision && value.hash !== pinned.hash))
    )
      return false;
    if (pinned && value.revision === pinned.revision + 1 && value.previous !== pinned.hash)
      return false;
    const { signature, hash, ...payload } = value;
    const serialized = canonical(payload);
    if (
      encode.encode(serialized).length > 3_500_000 ||
      (await digest(`${serialized}.${signature}`)) !== hash
    )
      return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      value.authority,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      from64(signature),
      encode.encode(serialized),
    );
  } catch {
    return false;
  }
}
