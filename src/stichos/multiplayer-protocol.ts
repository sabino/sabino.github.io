import type { Appearance, Point } from './types.ts';
import type { WorldGeneration } from './world.ts';
import type { SharedCombatFrame, SharedCombatProgression } from './shared-combat.ts';

export const MULTIPLAYER_PROTOCOL = 2 as const;
export const MAX_ROOM_PLAYERS = 8;
export type MultiplayerGesture = 'wave' | 'thanks' | 'help';

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
