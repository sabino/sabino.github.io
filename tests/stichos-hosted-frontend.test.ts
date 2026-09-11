import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createCoopServer } from '../server/coop.mjs';
import { MultiplayerConnection } from '../src/stichos/multiplayer.ts';
import { appearance } from '../src/stichos/world.ts';
import { publicRoomCode } from '../src/stichos/universe.ts';
import { storeRoom, loadSavedRoom, readRoomCredential } from '../src/stichos/room-storage.ts';
import { createRoomSigningIdentity, signRoomCheckpoint } from '../src/stichos/room-checkpoint.ts';

test('the frontend creates and rejoins a signed public node room without changing a legacy browser pin', async (t) => {
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const savedSocket = globalThis.WebSocket;
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
  });
  globalThis.WebSocket = WebSocket as any;
  const node = createCoopServer({ durable: true });
  const address: any = await node.listen(0, '127.0.0.1');
  const endpoint = `ws://127.0.0.1:${address.port}/ws`;
  const client = new MultiplayerConnection();
  t.after(async () => {
    client.disconnect();
    await node.close();
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage);
    else delete (globalThis as any).localStorage;
    globalThis.WebSocket = savedSocket;
  });
  const who = {
    seed: 8,
    generation: 4 as const,
    name: 'Node traveler',
    appearance: appearance(42, 'pilgrim', 1),
    position: { x: 0, y: 5 },
  };
  const code = publicRoomCode(who.seed, who.generation, endpoint);
  await client.joinPublicWorld(endpoint, code, who);
  assert.equal(client.status, 'online');
  assert.equal(client.room, code);
  assert.equal(node.hub.rooms.size, 1);
  const firstPeer = client.peerId;
  const credential = readRoomCredential(endpoint, code)!;
  assert.ok(credential.authority?.x);
  assert.equal((await client.sendChat('The first persistent signal.', 'world')).ok, true);

  // An older browser world on this planet has an independent, pinned authority.
  const state = node.hub.exportRoom(code)!.state;
  const legacyCode = publicRoomCode(who.seed, who.generation, 'peer:');
  const legacyIdentity = await createRoomSigningIdentity();
  const legacy = await signRoomCheckpoint({ ...state, room: legacyCode, chat: [] }, legacyIdentity);
  assert.equal(storeRoom({ checkpoint: legacy }), true);
  assert.notEqual(legacy.authority.x, credential.authority!.x);

  client.disconnect(false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await client.reconnect(who);
  assert.equal(client.peerId, firstPeer);
  assert.equal(client.chatHistory[0].text, 'The first persistent signal.');
  assert.equal(readRoomCredential(endpoint, code)!.authority!.x, credential.authority!.x);
  assert.equal((await loadSavedRoom(legacyCode))!.checkpoint.hash, legacy.hash);

  const absent = '0123456789ABCDEF';
  await assert.rejects(client.connect(endpoint, who, absent), /room|world/i);
  assert.ok(client.lastError, 'server rejection remains visible for reconnect UI');
});
