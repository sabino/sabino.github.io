import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createCoopServer } from '../server/coop.mjs';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { VoiceRelay } from '../server/voice.mjs';
import { appearance } from '../src/stichos/world.ts';
import { Stichos } from '../src/stichos/session.ts';
import { VOICE_CODEC, VOICE_SAMPLES, encodeVoiceFrame } from '../src/stichos/voice-protocol.ts';
import { validRoomWorldCheckpoint, verifyRoomCheckpoint } from '../src/stichos/room-checkpoint.ts';
import { validLivingSystemsSave } from '../src/stichos/living-systems.ts';
import { validateSystemResult } from '../src/stichos/systems-receipts.ts';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages: any[] = [];
  send(data: string | Uint8Array) {
    this.messages.push(data instanceof Uint8Array ? data.slice() : JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  ping() {}
  get(type: string) {
    return this.messages.filter((m) => m.type === type).at(-1);
  }
}
const identity = '11111111-1111-4111-8111-111111111111';
function fixture() {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const join = (extra: Record<string, unknown> = {}) => {
    const socket = new Socket(),
      connection = hub.attach(socket);
    hub.handle(connection, {
      type: 'join',
      protocol: 3,
      seed: 1,
      generation: 4,
      name: 'Review traveler',
      appearance: appearance(42, 'pilgrim', 1),
      position: { x: 0, y: 5 },
      ...extra,
    });
    return {
      socket,
      connection,
      welcome: socket.get('welcome'),
      send: (message: unknown) => hub.handle(connection, message),
    };
  };
  return {
    hub,
    join,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

test('a retained authoritative life cannot downgrade capabilities to relocate its field wealth', () => {
  const f = fixture();
  const first = f.join({ livingSystems: 1, clientId: identity });
  assert.ok(first.welcome);
  const room = first.connection.room;
  let remote: { x: number; y: number } | undefined;
  for (let y = 1000; y < 1020 && !remote; y++)
    for (let x = 1000; x < 1020 && !remote; x++)
      if (!room.world.blocked(x, y, room.removed)) remote = { x, y };
  assert.ok(remote);
  first.socket.close();
  const downgraded = f.join({
    room: room.id,
    clientId: identity,
    resumeToken: first.welcome.resumeToken,
    position: remote,
  });
  assert.equal(downgraded.welcome, undefined);
  assert.equal(downgraded.socket.get('error')?.code, 'capability_required');
  const saved = f.hub.exportRoom(room.id);
  assert.equal(validRoomWorldCheckpoint(saved.state), true);
  const restored = new CoopRooms({ now: f.now, durable: true });
  restored.restoreRoom(saved.state, saved.privateState);
  const socket = new Socket(),
    connection = restored.attach(socket);
  restored.handle(connection, {
    type: 'join',
    protocol: 3,
    seed: 1,
    generation: 4,
    name: 'Old build',
    appearance: appearance(42, 'pilgrim', 1),
    position: remote,
    room: room.id,
    clientId: identity,
    resumeToken: first.welcome.resumeToken,
  });
  assert.equal(socket.get('welcome'), undefined);
  assert.equal(socket.get('error')?.code, 'capability_required');
  assert.ok(f.join({ room: room.id }).welcome, 'a genuinely legacy new life still joins');
});

test('underground members cannot invoke legacy surface mutations or appear in old-client presence', () => {
  const f = fixture(),
    modern = f.join({ livingSystems: 1 });
  const room = modern.connection.room,
    member = modern.connection.member;
  const entered = room.systems.underworld.enter(f.hub.systemsPeer(member), 'town:review', member);
  assert.ok(entered.transition);
  Object.assign(member, entered.transition.to, { x: 6, y: 4 });
  assert.equal(room.systems.underworld.blocked(member.spaceId, 6, 4), false);
  room.systems.underworld.syncPeer(f.hub.systemsPeer(member));
  const pine = room.world.propsAround(6, 4, 1.8).find((p: any) => p.kind === 'pine');
  assert.ok(pine);
  modern.send({
    type: 'claim',
    requestId: 'floor-claim',
    propId: pine.id,
    kind: 'gather',
    x: pine.x,
    y: pine.y,
    toolKind: 'axe',
  });
  assert.equal(modern.socket.get('claimResult').ok, false);
  assert.equal(room.removed.has(pine.id), false);
  modern.send({ type: 'door', requestId: 'floor-door', propId: 'surface-door', open: false });
  assert.match(modern.socket.get('claimResult').reason, /[Ss]urface/);
  modern.send({ type: 'machine', requestId: 'floor-machine', machine: {} });
  assert.match(modern.socket.get('claimResult').reason, /[Ss]urface/);
  modern.send({ type: 'production', requestId: 'floor-production', machineId: 'surface-machine' });
  assert.match(modern.socket.get('claimResult').reason, /[Ss]urface/);
  modern.send({ type: 'combat', requestId: 'floor-parley', kind: 'parley', guardIds: [] });
  assert.equal(modern.socket.get('combat_result').ok, false);
  assert.match(modern.socket.get('combat_result').reason, /floor/);
  const legacy = f.join({ room: room.id });
  assert.ok(legacy.welcome);
  assert.equal(
    legacy.welcome.peers.some((p: any) => p.id === member.id),
    false,
  );
  modern.send({ type: 'pose', x: 6, y: 4, heading: 0, phase: 0, appearance: member.appearance });
  assert.equal(legacy.socket.get('pose'), undefined);
});

test('first authoritative body reservation cannot revive an already-dead generated resident', () => {
  const f = fixture(),
    first = f.join({ livingSystems: 1 });
  const room = first.connection.room;
  const npc = room.world
    .npcsAround(0, 5, 20)
    .find((n: any) => !room.world.blocked(n.x, n.y, room.removed));
  assert.ok(npc);
  room.removed.add(npc.id);
  room.systems.actors.markDead(npc.id);
  const next = f.join({
    room: room.id,
    livingSystems: 1,
    position: { x: npc.x, y: npc.y },
    appearance: npc.appearance,
    bodyId: npc.id,
  });
  assert.notEqual(next.connection.member?.domainBodyId, npc.id);
  assert.equal(room.removed.has(npc.id), true);
});

test('new life selection cannot seize a migrated resident at its obsolete generated position', () => {
  const f = fixture(),
    first = f.join({ livingSystems: 1 });
  const room = first.connection.room;
  const npc = room.world
    .npcsAround(0, 5, 20)
    .find((n: any) => !room.world.blocked(n.x, n.y, room.removed));
  assert.ok(npc);
  room.systems.actors.register(npc, npc.role === 'guard' ? 'guard' : 'npc', 0);
  const record = room.systems.actors.get(npc.id);
  assert.ok(record);
  const destination = { spaceId: 'surface', x: npc.x + 100, y: npc.y + 100 };
  assert.equal(room.systems.actors.transition(npc.id, destination, record.simulatedAt + 1), true);
  const next = f.join({
    room: room.id,
    livingSystems: 1,
    position: { x: npc.x, y: npc.y },
    appearance: npc.appearance,
    bodyId: npc.id,
  });
  assert.equal(!!next.welcome, false, 'the real actor has left this starting location');
  assert.equal(next.socket.get('error')?.code, 'body_unavailable');
  assert.equal(
    room.systems.actors.get(npc.id).x,
    destination.x,
    'identity stays at the authoritative migrated address',
  );
});

test('trusted floor damage uses numeric combat receipts that survive restore and cannot apply twice', () => {
  const f = fixture(),
    game = new Stichos(1);
  game.phase = 'playing';
  game.dialogue = null;
  game.setSharedWorld(true);
  game.setSharedCombat(true, 'review-room');
  const joined = f.join({ livingSystems: 1, bodyId: game.bodyId });
  const room = joined.connection.room,
    member = joined.connection.member;
  const frame = room.combat.domainContacts([
    {
      actorId: 'underworld:test:enemy:0',
      damage: 7,
      peer: { ...f.hub.combatPeer(member), bodyId: game.bodyId, combatActive: true },
    },
  ]);
  f.hub.publishCombat(room, frame);
  const before = game.player.hp;
  const receipt = game.applySharedCombat(frame, member.id);
  assert.equal(game.player.hp, before - 7);
  game.applySharedCombat(frame, member.id);
  assert.equal(game.player.hp, before - 7);
  const savedGame = Stichos.restore(game.save());
  savedGame.setSharedWorld(true);
  savedGame.setSharedCombat(true, 'review-room');
  savedGame.applySharedCombat(frame, member.id);
  assert.equal(savedGame.player.hp, before - 7);
  assert.equal(member.combatHits.size, 1);
  joined.send({ type: 'combat_ack', eventId: receipt.eventId });
  assert.equal(member.combatHits.size, 0);
});

test('voice at identical coordinates stays within the same floor and transition tails are dropped', async (t) => {
  const f = fixture(),
    surface = f.join(),
    first = f.join({ livingSystems: 1 });
  const same = f.join({ room: first.welcome.room, livingSystems: 1 });
  const upper = f.join({ room: first.welcome.room, livingSystems: 1 });
  // Place all connections in one room so space filtering, not room filtering, is tested.
  surface.socket.close();
  const legacy = f.join({ room: first.welcome.room });
  first.connection.member.spaceId = same.connection.member.spaceId = 'underground:review:0';
  upper.connection.member.spaceId = 'underground:review:1';
  const relay = new VoiceRelay(f.hub, { now: f.now });
  t.after(() => relay.close());
  const auth = (game: any) => {
    relay.issue(game, 'v1');
    const socket = new Socket(),
      connection = relay.attach(socket);
    relay.receive(
      connection,
      JSON.stringify({
        type: 'auth',
        ticket: game.socket.get('voice_ticket').ticket,
        codecs: [VOICE_CODEC],
      }),
      false,
    );
    assert.equal(socket.get('ready')?.codec, VOICE_CODEC);
    return { socket, connection };
  };
  const source = auth(first.connection),
    listener = auth(same.connection),
    otherFloor = auth(upper.connection),
    surfaceListener = auth(legacy.connection);
  relay.receive(
    source.connection,
    JSON.stringify({ type: 'ptt', active: true, mode: 'normal' }),
    false,
  );
  relay.receive(
    source.connection,
    encodeVoiceFrame(new Float32Array(VOICE_SAMPLES), 1, 'normal'),
    true,
  );
  const binaryCount = (socket: Socket) =>
    socket.messages.filter((m) => m instanceof Uint8Array).length;
  assert.equal(binaryCount(listener.socket), 1);
  assert.equal(binaryCount(otherFloor.socket), 0);
  assert.equal(binaryCount(surfaceListener.socket), 0);
  first.connection.member.spaceId = 'surface';
  relay.stopForTransition(first.connection);
  relay.receive(
    source.connection,
    encodeVoiceFrame(new Float32Array(VOICE_SAMPLES), 2, 'normal'),
    true,
  );
  assert.equal(binaryCount(surfaceListener.socket), 0);
  assert.equal(binaryCount(listener.socket), 1);
  assert.equal(source.socket.readyState, 1);
});

test('accepted command sequence survives response-cache eviction and private restore without duplicate rewards', () => {
  const f = fixture(),
    joined = f.join({ livingSystems: 1, clientId: identity, bodyId: 'review-body' });
  const room = joined.connection.room,
    member = joined.connection.member;
  joined.send({
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'craft', recipeId: 'hatchet' },
  });
  const first = joined.socket.get('systems_result');
  assert.equal(first.ok, true);
  assert.equal(validateSystemResult(first.result), true);
  assert.deepEqual(first.result.receipt, {
    scope: `room:${room.id}:${member.id}`,
    actorId: member.id,
    targetBodyId: 'review-body',
    sequence: 1,
  });
  const satchel = structuredClone(first.frame.economy.satchel);
  for (let i = 2; i <= 131; i++) {
    f.advance(200);
    joined.send({
      type: 'systems',
      requestId: `r${i}`,
      command: { kind: 'craft', recipeId: 'does-not-exist' },
    });
  }
  assert.equal(member.requests.has('r1'), false, 'original response is no longer in bounded cache');
  f.advance(200);
  joined.send({
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'craft', recipeId: 'hatchet' },
  });
  assert.equal(joined.socket.get('systems_result').ok, false);
  assert.deepEqual(room.systems.economy.satchel(member.id), satchel);
  const saved = f.hub.exportRoom(room.id);
  const restored = new CoopRooms({ now: f.now, durable: true });
  restored.restoreRoom(saved.state, saved.privateState);
  const socket = new Socket(),
    connection = restored.attach(socket);
  restored.handle(connection, {
    type: 'join',
    protocol: 3,
    seed: 1,
    generation: 4,
    name: 'Restored',
    appearance: appearance(42, 'pilgrim', 1),
    position: { x: 0, y: 5 },
    room: room.id,
    livingSystems: 1,
    clientId: identity,
    resumeToken: joined.welcome.resumeToken,
    bodyId: 'review-body',
  });
  assert.ok(socket.get('welcome'));
  f.advance(200);
  restored.handle(connection, {
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'craft', recipeId: 'hatchet' },
  });
  assert.equal(socket.get('systems_result').ok, false);
  assert.deepEqual(connection.room.systems.economy.satchel(member.id), satchel);
  assert.equal(validRoomWorldCheckpoint(saved.state), true);
  assert.equal('systems' in saved.state, false);
});

test('modern surface combat ignores forged progression and construction while legacy peers retain their contract', () => {
  const f = fixture(),
    modern = f.join({ livingSystems: 1 }),
    legacy = f.join();
  const member = modern.connection.member;
  const frozen = structuredClone(member.domainWeapon);
  member.appearance = {
    ...member.appearance,
    weapon: 'bow',
    weaponSeed: 0x4ffffffff,
    artifactDesign: 'forged-design',
  };
  member.progression = { level: 99, combatXp: 999999, upgrade: 9, attunement: 'forged' };
  const peer = f.hub.combatPeer(member);
  assert.equal(peer.appearance.weapon, frozen.kind);
  assert.equal(peer.appearance.weaponSeed, frozen.seed);
  assert.equal(peer.appearance.artifactDesign, undefined);
  assert.deepEqual(peer.progression, { level: 1, combatXp: 0, upgrade: 0 });
  assert.equal(
    member.appearance.artifactDesign,
    'forged-design',
    'server never destroys cosmetic/personal inventory state to derive combat',
  );
  legacy.connection.member.progression = { level: 4, combatXp: 70, upgrade: 2 };
  assert.deepEqual(f.hub.combatPeer(legacy.connection.member).progression, {
    level: 4,
    combatXp: 70,
    upgrade: 2,
  });
  assert.deepEqual(
    f.hub.combatPeer(legacy.connection.member).appearance,
    legacy.connection.member.appearance,
  );
});

test('real world storage preserves signing identity, modern private possessions and old-client public compatibility across restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'verso-modern-private-review-'));
  const replicated: any[] = [];
  let server = createCoopServer({
    persistenceDirectory: directory,
    onCheckpoint: (c: any) => {
      replicated.push(c);
    },
  });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const reply = (socket: WebSocket, type: string) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('message', receive);
        reject(new Error(`Timed out waiting for ${type}`));
      }, 2000);
      const receive = (data: any, binary: boolean) => {
        if (binary) return;
        const message = JSON.parse(data.toString());
        if (message.type !== type) return;
        clearTimeout(timer);
        socket.off('message', receive);
        resolve(message);
      };
      socket.on('message', receive);
    });
  let address: any = await server.listen(0, '127.0.0.1');
  let socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(socket, 'open');
  const identityMessage = {
    type: 'join',
    protocol: 3,
    seed: 1,
    generation: 4,
    name: 'Persistence reviewer',
    appearance: appearance(42, 'pilgrim', 1),
    position: { x: 0, y: 5 },
    livingSystems: 1,
    clientId: identity,
    bodyId: 'review-body',
  };
  const firstWelcome = reply(socket, 'welcome');
  socket.send(JSON.stringify(identityMessage));
  const first = await firstWelcome;
  const crafted = reply(socket, 'systems_result');
  socket.send(
    JSON.stringify({
      type: 'systems',
      requestId: 'r1',
      command: { kind: 'craft', recipeId: 'hatchet' },
    }),
  );
  assert.equal((await crafted).ok, true);
  await server.checkpoint();
  const saved = JSON.parse(await readFile(join(directory, `${first.room}.json`), 'utf8'));
  assert.equal(await verifyRoomCheckpoint(saved.checkpoint), true);
  assert.equal(validRoomWorldCheckpoint(saved.checkpoint.state), true);
  assert.equal(validLivingSystemsSave(saved.owner.privateState.systems), true);
  assert.equal(Object.hasOwn(saved.checkpoint.state, 'systems'), false);
  const satchel = saved.owner.privateState.systems.economy.satchels.find(
    (s: any) => s.actorId === first.peerId,
  );
  assert.equal(satchel.items.hatchet, 1);
  const publicKey = JSON.stringify(saved.checkpoint.authority);
  const closing = once(socket, 'close');
  socket.close();
  await closing;
  await server.close();
  server = createCoopServer({
    persistenceDirectory: directory,
    onCheckpoint: (c: any) => {
      replicated.push(c);
    },
  });
  address = await server.listen(0, '127.0.0.1');
  const health = await (await fetch(`http://127.0.0.1:${address.port}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.storageHealthy, true);
  assert.equal(health.durable, true);
  assert.equal(
    JSON.stringify((await server.hub.signingIdentity(first.room)).publicKey),
    publicKey,
    'the existing signing identity survives disk restore',
  );
  socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(socket, 'open');
  const resumedWelcome = reply(socket, 'welcome');
  socket.send(
    JSON.stringify({ ...identityMessage, room: first.room, resumeToken: first.resumeToken }),
  );
  const resumed = await resumedWelcome;
  assert.equal(resumed.peerId, first.peerId);
  assert.deepEqual(resumed.systems.economy.satchel, satchel);
  const old = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(old, 'open');
  const legacyWelcome = reply(old, 'welcome');
  const {
    livingSystems: _systems,
    clientId: _client,
    bodyId: _body,
    ...legacyIdentity
  } = identityMessage;
  old.send(JSON.stringify({ ...legacyIdentity, room: first.room }));
  const legacy = await legacyWelcome;
  assert.equal(legacy.protocol, 3);
  assert.equal(legacy.systems, undefined);
  const oldClosed = once(old, 'close');
  old.close();
  await oldClosed;
  await server.checkpoint();
  assert.ok(replicated.length >= 2);
  for (const checkpoint of replicated) {
    assert.equal(await verifyRoomCheckpoint(checkpoint), true);
    assert.equal(JSON.stringify(checkpoint.authority), publicKey);
    assert.equal(Object.hasOwn(checkpoint.state, 'systems'), false);
  }
  const forbidden = new Set(['audio', 'voice', 'microphone', 'samples', 'ticket', 'codec']);
  const noTransient = (value: any) => {
    if (value && typeof value === 'object')
      for (const [key, entry] of Object.entries(value)) {
        assert.equal(forbidden.has(key), false, `Transient key ${key} must not be persisted`);
        noTransient(entry);
      }
  };
  noTransient(saved.owner.privateState.systems);
  noTransient(replicated);
});
