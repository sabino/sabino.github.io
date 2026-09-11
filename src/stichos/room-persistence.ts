import type { CoopRooms } from './room-authority.mjs';
import {
  createRoomSigningIdentity,
  signRoomCheckpoint,
  type RoomSigningIdentity,
  type SignedRoomCheckpoint,
} from './room-checkpoint.ts';
import type { SavedRoom } from './room-storage.ts';

/** Coalesces snapshots; live authority is the only writer. Storage failures reach the caller. */
export class RoomPersistence {
  private identity: Promise<RoomSigningIdentity>;
  private previous = new Map<string, SignedRoomCheckpoint>();
  private running: Promise<void> | null = null;
  private hub: CoopRooms;
  private save: (room: SavedRoom) => Promise<void> | void;
  constructor(
    hub: CoopRooms,
    save: (room: SavedRoom) => Promise<void> | void,
    identity?: RoomSigningIdentity,
    restored?: SignedRoomCheckpoint,
  ) {
    this.hub = hub;
    this.save = save;
    this.identity = identity ? Promise.resolve(identity) : createRoomSigningIdentity();
    if (restored) this.previous.set(restored.state.room, restored);
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.capture().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async capture() {
    const identity = await this.identity;
    for (const id of this.hub.rooms.keys()) {
      const record = this.hub.exportRoom(id);
      if (!record) continue;
      const checkpoint = await signRoomCheckpoint(record.state, identity, this.previous.get(id));
      await this.save({ checkpoint, owner: { identity, privateState: record.privateState } });
      this.previous.set(id, checkpoint);
      this.hub.publishCheckpoint(checkpoint);
    }
  }
}
