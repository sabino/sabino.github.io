import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyRoomCheckpoint } from '../src/stichos/room-checkpoint.ts';
import { RoomPersistence } from '../src/stichos/room-persistence.ts';

/** Files contain private authority keys and traveler credentials: never serve this directory. */
export async function attachRoomDisk(hub, directory, { onCheckpoint = async () => {} } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const writers = new Map();
  const save = async (record) => {
    const path = join(directory, `${record.checkpoint.state.room}.json`);
    await writeFile(`${path}.tmp`, JSON.stringify(record), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    await onCheckpoint(record.checkpoint);
  };
  for (const name of (await readdir(directory))
    .filter((n) => /^[A-Z0-9]{4,16}\.json$/.test(n))
    .slice(0, hub.maxRooms)) {
    const raw = await readFile(join(directory, name), 'utf8');
    if (Buffer.byteLength(raw) > 8_000_000) throw Error('Saved world exceeds the storage limit.');
    const record = JSON.parse(raw);
    if (!record.owner || !(await verifyRoomCheckpoint(record.checkpoint)))
      throw Error(`Saved world ${name} failed signature verification.`);
    hub.restoreRoom(record.checkpoint.state, record.owner.privateState);
    writers.set(
      record.checkpoint.state.room,
      new RoomPersistence(
        singleRoom(hub, record.checkpoint.state.room),
        save,
        record.owner.identity,
        record.checkpoint,
      ),
    );
    hub.publishCheckpoint(record.checkpoint);
  }
  return {
    async flush() {
      for (const id of hub.rooms.keys())
        if (!writers.has(id)) writers.set(id, new RoomPersistence(singleRoom(hub, id), save));
      await Promise.all([...writers.values()].map((writer) => writer.flush()));
    },
  };
}
function singleRoom(hub, id) {
  return {
    rooms: new Map([[id, null]]),
    exportRoom: (code) => hub.exportRoom(code),
    publishCheckpoint: (c) => hub.publishCheckpoint(c),
  };
}
