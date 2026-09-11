import { mkdir, readdir, readFile, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { verifyRoomCheckpoint } from '../src/stichos/room-checkpoint.ts';
import { RoomPersistence } from '../src/stichos/room-persistence.ts';

const MAX_PRIVATE_BACKUP_BYTES = 32_000_000;

/** Files contain private authority keys and traveler credentials: never serve this directory. */
export async function attachRoomDisk(hub, directory, { onCheckpoint = async () => {} } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Fail before listening if the persistent mount is read-only or owned by another UID.
  const probe = join(directory, `.write-probe-${randomUUID()}`);
  await writeFile(probe, 'ready', { mode: 0o600, flag: 'wx' });
  await unlink(probe);
  const writers = new Map();
  const save = async (record) => {
    const path = join(directory, `${record.checkpoint.state.room}.json`);
    const raw = JSON.stringify(record);
    if (Buffer.byteLength(raw) > MAX_PRIVATE_BACKUP_BYTES)
      throw Error('Saved world exceeds the storage limit.');
    await writeFile(`${path}.tmp`, raw, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    await onCheckpoint(record.checkpoint);
  };
  for (const name of (await readdir(directory))
    .filter((n) => /^[A-Z0-9]{4,16}\.json$/.test(n))
    .slice(0, hub.maxRooms)) {
    const path = join(directory, name);
    if ((await stat(path)).size > MAX_PRIVATE_BACKUP_BYTES)
      throw Error('Saved world exceeds the storage limit.');
    const raw = await readFile(path, 'utf8');
    if (Buffer.byteLength(raw) > MAX_PRIVATE_BACKUP_BYTES)
      throw Error('Saved world exceeds the storage limit.');
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
    async flush(latest = false) {
      for (const id of hub.rooms.keys())
        if (!writers.has(id)) writers.set(id, new RoomPersistence(singleRoom(hub, id), save));
      await Promise.all(
        [...writers.values()].map((writer) => (latest ? writer.flushLatest() : writer.flush())),
      );
    },
  };
}
function singleRoom(hub, id) {
  return {
    rooms: new Map([[id, null]]),
    exportRoom: (code) => hub.exportRoom(code),
    publishCheckpoint: (c) => hub.publishCheckpoint(c),
    signingIdentity: (code) => hub.signingIdentity(code),
    setSigningIdentity: (code, identity) => hub.setSigningIdentity(code, identity),
  };
}
