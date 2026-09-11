import type { Appearance, Point } from './types.ts';
import type { WorldGeneration } from './world.ts';
import type { SharedCombatFrame, SharedCombatProgression } from './shared-combat.ts';
import type { SignedRoomCheckpoint, RoomHelloProof } from './room-checkpoint.ts';

export const MULTIPLAYER_PROTOCOL = 3 as const;
export const MAX_ROOM_PLAYERS = 8;
export type MultiplayerGesture = 'wave' | 'thanks' | 'help';
export type ChatChannel = 'say' | 'world';
export interface RoomChat extends Point {
  id: number;
  room: string;
  channel: ChatChannel;
  peerId: string;
  name: string;
  text: string;
  at: number;
}
export interface ProductionMachine extends Point {
  id: string;
  kind: 'garden' | 'sawmill' | 'ore-sorter';
  ownerId: string;
}
export interface RoomInfo {
  room: string;
  seed: number;
  generation: WorldGeneration;
  players: number;
}

/** Presence is player-reported; the server validates and owns shared resource claims. */
export interface MultiplayerPeer extends Point {
  id: string;
  name: string;
  heading: number;
  phase: number;
  appearance: Appearance;
  combatActive?: boolean;
  bodyId?: string;
}

export type MultiplayerClientMessage =
  | { type: 'hello'; room: string; protocol: typeof MULTIPLAYER_PROTOCOL; challenge?: string }
  | { type: 'chat'; requestId: string; channel: ChatChannel; text: string }
  | { type: 'machine'; requestId: string; machine: Omit<ProductionMachine, 'ownerId'> }
  | {
      type: 'production';
      requestId: string;
      machineId: string;
      jobId: string;
      propId: string;
      x: number;
      y: number;
    }
  | {
      type: 'join';
      protocol: typeof MULTIPLAYER_PROTOCOL;
      room?: string;
      seed: number;
      generation: WorldGeneration;
      name: string;
      appearance: Appearance;
      position: Point;
      resumeToken?: string;
      clientId?: string;
      challenge?: string;
      combatActive?: boolean;
      bodyId?: string;
      progression?: SharedCombatProgression;
    }
  | {
      type: 'pose';
      x: number;
      y: number;
      heading: number;
      phase: number;
      appearance: Appearance;
      combatActive?: boolean;
      bodyId?: string;
      progression?: SharedCombatProgression;
    }
  | { type: 'combat'; requestId: string; kind: 'attack' | 'ward'; heading: number }
  | { type: 'combat'; requestId: string; kind: 'parley'; guardIds: string[] }
  | { type: 'combat_ack'; eventId: number }
  | {
      type: 'claim';
      requestId: string;
      propId: string;
      kind: 'gather' | 'loot';
      x: number;
      y: number;
      toolKind?: 'axe' | 'pickaxe' | 'sickle';
    }
  | { type: 'door'; requestId: string; propId: string; open: boolean }
  | { type: 'emote'; gesture: MultiplayerGesture };

export type MultiplayerServerMessage =
  | { type: 'room_info'; info: RoomInfo; proof?: RoomHelloProof }
  | { type: 'chat'; message: RoomChat }
  | { type: 'chat_result'; requestId: string; ok: boolean; reason?: string }
  | { type: 'machines'; machines: ProductionMachine[] }
  | { type: 'checkpoint'; checkpoint: SignedRoomCheckpoint }
  | {
      type: 'welcome';
      protocol: typeof MULTIPLAYER_PROTOCOL;
      room: string;
      peerId: string;
      /** Private reconnect credential; never included in another member's presence. */
      resumeToken: string;
      seed: number;
      generation: WorldGeneration;
      /** Includes the receiving peer; clients omit their own ID when drawing remote people. */
      peers: MultiplayerPeer[];
      removed: string[];
      opened: string[];
      combat: SharedCombatFrame;
      chat: RoomChat[];
      machines: ProductionMachine[];
      proof?: RoomHelloProof;
    }
  | { type: 'peerJoined'; peer: MultiplayerPeer }
  | { type: 'peerLeft'; peerId: string }
  | { type: 'pose'; peer: MultiplayerPeer }
  | { type: 'claimResult'; requestId: string; ok: boolean; reason?: string }
  | {
      type: 'combat_result';
      requestId: string;
      ok: boolean;
      reason?: string;
      frame: SharedCombatFrame;
    }
  | { type: 'combat_frame'; frame: SharedCombatFrame }
  | {
      type: 'world';
      /** The actor receives its acknowledgement first and handles its own local inventory. */
      actorId: string;
      removed?: string[];
      opened?: string[];
      closed?: string[];
    }
  | { type: 'emote'; peerId: string; gesture: MultiplayerGesture }
  | { type: 'error'; code: string; reason: string };

export type Peer = MultiplayerPeer;
export type ClientMessage = MultiplayerClientMessage;
export type ServerMessage = MultiplayerServerMessage;
