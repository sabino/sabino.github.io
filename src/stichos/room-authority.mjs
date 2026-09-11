import { InfiniteWorld } from './world.ts';
import { generateArtifact, normalizeArtifactDesign } from './artifacts.ts';
import { artifactToolKind, requiredToolFor } from './labor.ts';
import { MULTIPLAYER_PROTOCOL, MAX_ROOM_PLAYERS } from './multiplayer-protocol.ts';
import {
  SharedCombat,
  validSharedCombatProgression,
  validSharedCombatFrame,
} from './shared-combat.ts';
import { validRoomWorldCheckpoint, validProductionMachine } from './room-checkpoint.ts';

const MAX_COORDINATE = Number.MAX_SAFE_INTEGER - 4096;
export const MAX_MESSAGE_BYTES = 8192;
const GATHERABLE = new Set(['pine', 'rock', 'cequin', 'heartleaf', 'emberroot', 'mushroom']);
const GESTURES = new Set(['wave', 'thanks', 'help']);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, low, high) =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const integer = (value, low, high) => finite(value, low, high) && Number.isInteger(value);
const text = (value, min, max) =>
  typeof value === 'string' &&
  value.length >= min &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const point = (value) =>
  object(value) &&
  finite(value.x, -MAX_COORDINATE, MAX_COORDINATE) &&
  finite(value.y, -MAX_COORDINATE, MAX_COORDINATE);
const bodyIdValid = (value) =>
  text(value, 1, 160) && !['__proto__', 'constructor', 'prototype'].includes(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const artifactDesignValid = (value) => {
  if (value === undefined) return true;
  try {
    return normalizeArtifactDesign(value) === value;
  } catch {
    return false;
  }
};
const appearanceValid = (value) =>
  object(value) &&
  integer(value.seed, -0xffffffff, 0xffffffff) &&
  (value.weaponSeed === undefined || integer(value.weaponSeed, 0, 0xffffffff)) &&
  artifactDesignValid(value.artifactDesign) &&
  ['skin', 'hair', 'coat', 'trim', 'trousers'].every(
    (key) =>
      typeof value[key] === 'string' &&
      /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value[key]),
  ) &&
  finite(value.height, 0.5, 2) &&
  finite(value.build, 0.5, 2) &&
  integer(value.hairStyle, 0, 100) &&
  integer(value.hat, 0, 100) &&
  typeof value.cloak === 'boolean' &&
  ['staff', 'sword', 'bow', 'none'].includes(value.weapon);
const copyAppearance = (value) => ({
  ...Object.fromEntries(
    [
      'seed',
      'skin',
      'hair',
      'coat',
      'trim',
      'trousers',
      'height',
      'build',
      'hairStyle',
      'hat',
      'cloak',
      'weapon',
    ].map((key) => [key, value[key]]),
  ),
  ...(value.weaponSeed === undefined ? {} : { weaponSeed: value.weaponSeed }),
  ...(value.artifactDesign === undefined ? {} : { artifactDesign: value.artifactDesign }),
});
const publicPeer = (member) => ({
  id: member.id,
  name: member.name,
  x: member.x,
  y: member.y,
  heading: member.heading,
  phase: member.phase,
  appearance: { ...member.appearance },
  combatActive: member.combatActive === true,
  ...(member.bodyId ? { bodyId: member.bodyId } : {}),
});
const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));
const roomCode = () =>
  [...randomBytes(5)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
const resumeToken = () =>
  btoa(String.fromCharCode(...randomBytes(24)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

/** Room authority covers generated resource claims, doors and hostile NPC combat.
 * Presence positions are reported by clients and checked for finite clear coordinates.
 * Inventory, personal health and bounded progression declarations remain client-owned.
 */
export class CoopRooms {
  constructor({
    now = Date.now,
    maxRooms = 64,
    maxPeers = MAX_ROOM_PLAYERS,
    reconnectMs = 90000,
    roomIdleMs = 30 * 60000,
    messagesPerSecond = 30,
    messageBurst = 60,
    codeFactory = roomCode,
    durable = false,
  } = {}) {
    this.now = now;
    this.durable = durable;
    this.checkpoints = new Map();
    this.codeFactory = codeFactory;
    this.maxRooms = maxRooms;
    this.maxPeers = maxPeers;
    this.reconnectMs = reconnectMs;
    this.roomIdleMs = roomIdleMs;
    this.messagesPerSecond = messagesPerSecond;
    this.messageBurst = messageBurst;
    this.rooms = new Map();
    this.connections = new Set();
  }
  attach(socket) {
    const connection = {
      socket,
      room: null,
      member: null,
      tokens: this.messageBurst,
      refill: this.now(),
      alive: true,
    };
    this.connections.add(connection);
    const handshake = setTimeout(() => {
      if (!connection.member) socket.close(1008, 'Join a room first.');
    }, 8000);
    handshake.unref?.();
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (data, binary) => {
      if (typeof data === 'string' && new TextEncoder().encode(data).length > MAX_MESSAGE_BYTES) {
        socket.close(1009, 'Message is too large.');
        return;
      }
      if (binary) {
        socket.close(1003, 'Text protocol required.');
        return;
      }
      const now = this.now();
      connection.tokens = Math.min(
        this.messageBurst,
        connection.tokens + (Math.max(0, now - connection.refill) * this.messagesPerSecond) / 1000,
      );
      connection.refill = now;
      if (--connection.tokens < 0) {
        this.error(connection, 'rate_limit', 'Too many updates.');
        socket.close(1008, 'Rate limit.');
        return;
      }
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        this.error(connection, 'invalid_json', 'A valid JSON message is required.');
        socket.close(1007, 'Invalid JSON.');
        return;
      }
      try {
        this.handle(connection, message);
      } catch {
        this.error(connection, 'invalid_action', 'The action could not be accepted.');
      }
    });
    socket.on('error', () => {});
    socket.once('close', () => {
      clearTimeout(handshake);
      this.detach(connection);
    });
    return connection;
  }
  send(connection, message) {
    const socket = connection.socket;
    if (socket.readyState !== 1) return;
    if (socket.bufferedAmount > 1024 * 1024) {
      socket.close(1013, 'Connection is too slow.');
      return;
    }
    socket.send(JSON.stringify(message));
  }
  error(connection, code, reason) {
    this.send(connection, { type: 'error', code, reason });
  }
  broadcast(room, message, except = null) {
    for (const member of room.members.values())
      if (member.connection && member.connection !== except) this.send(member.connection, message);
  }
  detach(connection) {
    this.connections.delete(connection);
    const { room, member } = connection;
    if (!room || !member || member.connection !== connection) return;
    member.connection = null;
    member.disconnectedAt = this.now();
    room.lastActivity = this.now();
    this.broadcast(room, { type: 'peerLeft', peerId: member.id });
  }
  sweep() {
    const now = this.now();
    for (const [id, room] of this.rooms) {
      for (const [peerId, member] of room.members)
        if (!this.durable && !member.connection && now - member.disconnectedAt >= this.reconnectMs)
          room.members.delete(peerId);
      if (
        !this.durable &&
        ![...room.members.values()].some((member) => member.connection) &&
        now - room.lastActivity >= this.roomIdleMs
      )
        this.rooms.delete(id);
    }
  }
  heartbeat() {
    for (const connection of this.connections) {
      if (connection.socket.readyState !== 1) continue;
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
    this.sweep();
  }
  combatPeer(member) {
    return {
      id: member.id,
      x: member.x,
      y: member.y,
      heading: member.heading,
      appearance: member.appearance,
      combatActive:
        !!member.connection &&
        member.combatActive === true &&
        this.now() - member.lastPose < 2500 &&
        member.combatHits.size + member.combatDeaths.size < 512,
      progression: member.progression,
      ...(member.bodyId ? { bodyId: member.bodyId } : {}),
    };
  }
  combatFrame(room, member) {
    return {
      snapshot: room.combat.snapshot(),
      hits: [...member.combatHits.values()],
      deaths: [...member.combatDeaths.values()],
    };
  }
  recordCombat(room, frame) {
    for (const hit of frame.hits) {
      room.combatEvent = Math.max(room.combatEvent, hit.id);
      const recipient = room.members.get(hit.target === 'peer' ? hit.targetId : hit.actorId);
      if (recipient && hit.id > recipient.combatAck) recipient.combatHits.set(hit.id, hit);
    }
    for (const death of frame.deaths) {
      room.combatEvent = Math.max(room.combatEvent, death.id);
      for (const id of death.contributors) {
        const recipient = room.members.get(id);
        if (recipient && death.id > recipient.combatAck)
          recipient.combatDeaths.set(death.id, death);
      }
    }
  }
  publishCombat(room, frame) {
    this.recordCombat(room, frame);
    this.broadcast(room, { type: 'combat_frame', frame });
  }
  tick(dt = 0.05) {
    if (!finite(dt, 0, 0.25) || dt === 0) return;
    for (const room of this.rooms.values()) {
      const members = [...room.members.values()].filter((m) => m.connection);
      if (!members.length) continue;
      const frame = room.combat.tick(
        dt,
        members.map((m) => this.combatPeer(m)),
        room.opened,
      );
      this.publishCombat(room, frame);
    }
  }
  handle(connection, message) {
    if (!object(message) || !text(message.type, 1, 24))
      return this.error(connection, 'invalid_message', 'Unknown message.');
    if (message.type === 'hello') {
      if (
        message.protocol !== MULTIPLAYER_PROTOCOL ||
        typeof message.room !== 'string' ||
        !/^[A-Za-z0-9]{4,16}$/.test(message.room)
      )
        return this.error(connection, 'invalid_hello', 'Use a valid room code.');
      const room = this.rooms.get(message.room.toUpperCase());
      if (!room)
        return this.error(connection, 'room_missing', 'That world is not currently hosted.');
      return this.send(connection, {
        type: 'room_info',
        info: {
          room: room.id,
          seed: room.seed,
          generation: room.generation,
          players: [...room.members.values()].filter((m) => m.connection).length,
        },
      });
    }
    if (message.type === 'join') return this.join(connection, message);
    if (!connection.member)
      return this.error(connection, 'join_required', 'Join a room before acting.');
    const room = connection.room,
      member = connection.member;
    if (member.connection !== connection) return;
    if (message.type === 'pose') {
      if (
        !point(message) ||
        !finite(message.heading, -1e6, 1e6) ||
        !finite(message.phase, 0, Number.MAX_SAFE_INTEGER) ||
        !appearanceValid(message.appearance) ||
        (message.combatActive !== undefined && typeof message.combatActive !== 'boolean') ||
        (message.bodyId !== undefined && !bodyIdValid(message.bodyId)) ||
        (message.progression !== undefined && !validSharedCombatProgression(message.progression))
      )
        return this.error(connection, 'invalid_pose', 'A valid humanoid pose is required.');
      if (room.world.blocked(message.x, message.y, room.removed))
        return this.error(connection, 'blocked_pose', 'That position is blocked.');
      Object.assign(member, {
        x: message.x,
        y: message.y,
        heading: message.heading,
        phase: message.phase,
        appearance: copyAppearance(message.appearance),
        combatActive: message.combatActive ?? member.combatActive,
        bodyId: message.bodyId ?? member.bodyId,
        progression: message.progression ? { ...message.progression } : member.progression,
        lastPose: this.now(),
      });
      room.lastActivity = this.now();
      this.broadcast(room, { type: 'pose', peer: publicPeer(member) }, connection);
      return;
    }
    if (message.type === 'chat') return this.chat(connection, message);
    if (message.type === 'machine' || message.type === 'production')
      return this.production(connection, message);
    if (message.type === 'claim' || message.type === 'door') return this.claim(connection, message);
    if (message.type === 'combat') return this.combat(connection, message);
    if (message.type === 'combat_ack') {
      if (!integer(message.eventId, 0, room.combatEvent))
        return this.error(connection, 'invalid_combat_ack', 'Unknown combat receipt.');
      member.combatAck = Math.max(member.combatAck, message.eventId);
      for (const id of member.combatHits.keys())
        if (id <= member.combatAck) member.combatHits.delete(id);
      for (const id of member.combatDeaths.keys())
        if (id <= member.combatAck) member.combatDeaths.delete(id);
      return;
    }
    if (message.type === 'emote') {
      if (!GESTURES.has(message.gesture))
        return this.error(connection, 'invalid_emote', 'Use a known gesture.');
      if (this.now() - member.lastEmote < 1500)
        return this.error(connection, 'emote_rate', 'Wait before another gesture.');
      member.lastEmote = this.now();
      this.broadcast(room, { type: 'emote', peerId: member.id, gesture: message.gesture });
      return;
    }
    this.error(connection, 'unknown_message', 'That action is not part of this room protocol.');
  }
  join(connection, message) {
    if (connection.member)
      return this.error(connection, 'already_joined', 'This connection already belongs to a room.');
    if (
      message.protocol !== MULTIPLAYER_PROTOCOL ||
      !integer(message.seed, 0, 0xffffffff) ||
      ![1, 2, 3].includes(message.generation) ||
      !text(message.name, 1, 64) ||
      !message.name.trim() ||
      !appearanceValid(message.appearance) ||
      !point(message.position) ||
      (message.combatActive !== undefined && typeof message.combatActive !== 'boolean') ||
      (message.bodyId !== undefined && !bodyIdValid(message.bodyId)) ||
      (message.progression !== undefined && !validSharedCombatProgression(message.progression)) ||
      (message.room !== undefined &&
        (typeof message.room !== 'string' || !/^[A-Za-z0-9]{4,16}$/.test(message.room))) ||
      (message.clientId !== undefined &&
        (typeof message.clientId !== 'string' || !/^[a-f0-9-]{36}$/.test(message.clientId))) ||
      (message.resumeToken !== undefined &&
        (typeof message.resumeToken !== 'string' ||
          !/^[A-Za-z0-9_-]{32}$/.test(message.resumeToken)))
    )
      return this.error(connection, 'invalid_join', 'Check the room, world and humanoid identity.');
    this.sweep();
    let room = message.room ? this.rooms.get(message.room.toUpperCase()) : null;
    if (message.room && !room)
      return this.error(connection, 'room_missing', 'That room is no longer available.');
    if (room && (room.seed !== message.seed || room.generation !== message.generation))
      return this.error(
        connection,
        'world_mismatch',
        'The room uses a different world seed or generation.',
      );
    if (!room && message.resumeToken)
      return this.error(connection, 'resume_expired', 'That connection can no longer be resumed.');
    if (!room) {
      if (this.rooms.size >= this.maxRooms)
        return this.error(connection, 'server_full', 'All rooms are currently occupied.');
      const world = new InfiniteWorld(message.seed, message.generation);
      if (world.blocked(message.position.x, message.position.y))
        return this.error(connection, 'blocked_pose', 'Begin on clear ground to create a room.');
      let id;
      do {
        id = this.codeFactory();
      } while (this.rooms.has(id));
      room = {
        id,
        seed: message.seed,
        generation: message.generation,
        world,
        members: new Map(),
        removed: new Set(),
        opened: new Set(),
        lastActivity: this.now(),
        combatEvent: 0,
        chat: [],
        chatSerial: 0,
        machines: new Map(),
        productionReceipts: new Map(),
      };
      room.combat = new SharedCombat(world, room.removed, { now: this.now });
      this.rooms.set(id, room);
    }
    if (room.world.blocked(message.position.x, message.position.y, room.removed))
      return this.error(connection, 'blocked_pose', 'Join from clear ground in this world.');
    let member;
    if (message.resumeToken) {
      member = [...room.members.values()].find((value) => value.token === message.resumeToken);
      if (!member)
        return this.error(
          connection,
          'resume_expired',
          'That connection can no longer be resumed.',
        );
      if (member.clientId && member.clientId !== message.clientId)
        return this.error(
          connection,
          'resume_identity',
          'This credential belongs to a different browser identity.',
        );
      if (member.connection)
        return this.error(connection, 'resume_in_use', 'That traveler is already connected.');
    }
    const connected = [...room.members.values()].filter((value) => value.connection).length;
    if (connected >= this.maxPeers)
      return this.error(
        connection,
        'room_full',
        `A room holds at most ${this.maxPeers} travelers.`,
      );
    if (!member) {
      // Bound abandoned reconnect records even when visitors repeatedly leave and rejoin.
      if (room.members.size >= this.maxPeers * 4) {
        const oldest = [...room.members.values()]
          .filter((value) => !value.connection)
          .sort((a, b) => a.disconnectedAt - b.disconnectedAt)[0];
        if (oldest) room.members.delete(oldest.id);
      }
      member = {
        id: crypto.randomUUID(),
        token: resumeToken(),
        requests: new Map(),
        lastEmote: -Infinity,
        lastChat: -Infinity,
        clientId: message.clientId,
        combatHits: new Map(),
        combatDeaths: new Map(),
        combatAck: 0,
        combatSerial: 0,
        combatNamedRequests: new Set(),
      };
      room.members.set(member.id, member);
    }
    Object.assign(member, {
      name: message.name.trim(),
      x: message.position.x,
      y: message.position.y,
      heading: Math.PI / 2,
      phase: 0,
      appearance: copyAppearance(message.appearance),
      connection,
      disconnectedAt: null,
      combatActive: message.combatActive === true,
      bodyId: message.bodyId,
      progression: message.progression
        ? { ...message.progression }
        : { level: 1, combatXp: 0, upgrade: 0 },
      lastPose: this.now(),
    });
    connection.member = member;
    connection.room = room;
    room.lastActivity = this.now();
    this.send(connection, {
      type: 'welcome',
      protocol: MULTIPLAYER_PROTOCOL,
      room: room.id,
      peerId: member.id,
      resumeToken: member.token,
      seed: room.seed,
      generation: room.generation,
      peers: [...room.members.values()].filter((value) => value.connection).map(publicPeer),
      removed: [...room.removed],
      opened: [...room.opened],
      combat: this.combatFrame(room, member),
      chat: room.chat.filter((c) => c.channel === 'world' || distance(c, member) <= 12),
      machines: [...room.machines.values()],
    });
    this.broadcast(room, { type: 'peerJoined', peer: publicPeer(member) }, connection);
    const checkpoint = this.checkpoints.get(room.id);
    if (checkpoint) this.send(connection, { type: 'checkpoint', checkpoint });
  }
  /** Trusted host-only persistence API. No wire message can restore or replace world state. */
  exportRoom(id) {
    const room = this.rooms.get(id);
    if (!room) return null;
    const state = {
      version: 1,
      room: room.id,
      seed: room.seed,
      generation: room.generation,
      removed: [...room.removed],
      opened: [...room.opened],
      combat: room.combat.checkpoint(),
      combatEvent: room.combatEvent,
      machines: [...room.machines.values()],
      chat: room.chat.filter((c) => c.channel === 'world'),
      chatSerial: room.chatSerial,
      productionReceipts: [...room.productionReceipts.values()],
    };
    const members = [...room.members.values()].map((m) => ({
      id: m.id,
      token: m.token,
      clientId: m.clientId,
      name: m.name,
      x: m.x,
      y: m.y,
      heading: m.heading,
      phase: m.phase,
      appearance: m.appearance,
      bodyId: m.bodyId,
      progression: m.progression,
      combatAck: m.combatAck,
      combatSerial: m.combatSerial,
      combatNamedRequests: [...m.combatNamedRequests],
      requests: [...m.requests],
      combatHits: [...m.combatHits.values()],
      combatDeaths: [...m.combatDeaths.values()],
    }));
    return structuredClone({ state, privateState: { members, chat: room.chat } });
  }
  restoreRoom(state, privateState = { members: [], chat: [] }) {
    if (
      !validRoomWorldCheckpoint(state) ||
      this.rooms.has(state.room) ||
      this.rooms.size >= this.maxRooms
    )
      throw Error('Invalid, occupied, or full room restore.');
    if (
      !object(privateState) ||
      !Array.isArray(privateState.members) ||
      privateState.members.length > 32 ||
      !Array.isArray(privateState.chat) ||
      privateState.chat.length > 200
    )
      throw Error('Invalid private room backup.');
    const world = new InfiniteWorld(state.seed, state.generation),
      removed = new Set(state.removed);
    const room = {
      id: state.room,
      seed: state.seed,
      generation: state.generation,
      world,
      removed,
      opened: new Set(state.opened),
      members: new Map(),
      machines: new Map(state.machines.map((m) => [m.id, structuredClone(m)])),
      chat: structuredClone(state.chat),
      chatSerial: state.chatSerial,
      productionReceipts: new Map(
        state.productionReceipts.map((r) => [r.sourceId, structuredClone(r)]),
      ),
      combatEvent: state.combatEvent,
      lastActivity: this.now(),
    };
    room.combat = new SharedCombat(world, removed, { now: this.now });
    room.combat.restore(state.combat);
    for (const m of privateState.members) {
      if (
        !object(m) ||
        !text(m.id, 1, 160) ||
        !text(m.token, 32, 32) ||
        !point(m) ||
        !appearanceValid(m.appearance) ||
        !text(m.name, 1, 64) ||
        !integer(m.combatAck, 0, state.combatEvent) ||
        !integer(m.combatSerial, 0, Number.MAX_SAFE_INTEGER) ||
        !Array.isArray(m.requests) ||
        m.requests.length > 128 ||
        !Array.isArray(m.combatNamedRequests) ||
        m.combatNamedRequests.length > 1024 ||
        !validSharedCombatFrame({
          snapshot: state.combat.snapshot,
          hits: m.combatHits,
          deaths: m.combatDeaths,
        })
      )
        throw Error('Invalid private traveler record.');
      room.members.set(m.id, {
        ...structuredClone(m),
        connection: null,
        disconnectedAt: this.now(),
        combatActive: false,
        lastPose: 0,
        lastChat: -Infinity,
        lastEmote: -Infinity,
        requests: new Map(m.requests),
        combatNamedRequests: new Set(m.combatNamedRequests),
        combatHits: new Map(m.combatHits.map((h) => [h.id, h])),
        combatDeaths: new Map(m.combatDeaths.map((d) => [d.id, d])),
      });
    }
    // Spatial speech remains in the private host backup, never the public replica.
    if (privateState.chat.length && validRoomWorldCheckpoint({ ...state, chat: privateState.chat }))
      room.chat = structuredClone(privateState.chat);
    this.rooms.set(room.id, room);
    return room.id;
  }
  publishCheckpoint(checkpoint) {
    const room = this.rooms.get(checkpoint.state.room);
    if (!room) return;
    this.checkpoints.set(room.id, checkpoint);
    this.broadcast(room, { type: 'checkpoint', checkpoint });
  }
  chat(connection, message) {
    const { room, member } = connection;
    if (!text(message.requestId, 1, 80))
      return this.error(connection, 'invalid_chat', 'A chat action ID is required.');
    const fingerprint = JSON.stringify(['chat', message.channel, message.text]),
      old = member.requests.get(message.requestId);
    const answer = (ok, reason) => {
      const result = {
        type: 'chat_result',
        requestId: message.requestId,
        ok,
        ...(reason ? { reason } : {}),
      };
      member.requests.set(message.requestId, { fingerprint, result });
      while (member.requests.size > 128)
        member.requests.delete(member.requests.keys().next().value);
      this.send(connection, result);
    };
    if (old) {
      if (old.fingerprint !== fingerprint)
        return this.send(connection, {
          type: 'chat_result',
          requestId: message.requestId,
          ok: false,
          reason: 'Action ID was already used.',
        });
      return this.send(connection, old.result);
    }
    if (
      !['say', 'world'].includes(message.channel) ||
      !text(message.text, 1, 560) ||
      [...message.text].length > 280 ||
      !message.text.trim()
    )
      return answer(false, 'Use 1–280 plain-text characters.');
    if (this.now() - member.lastChat < 1000)
      return answer(false, 'Wait a moment before speaking again.');
    member.lastChat = this.now();
    const chat = {
      id: ++room.chatSerial,
      room: room.id,
      peerId: member.id,
      name: member.name,
      text: message.text.normalize('NFC').trim(),
      channel: message.channel,
      x: member.x,
      y: member.y,
      at: this.now(),
    };
    room.chat.push(chat);
    if (room.chat.length > 200) room.chat.shift();
    answer(true);
    for (const target of room.members.values())
      if (target.connection && (chat.channel === 'world' || distance(member, target) <= 12))
        this.send(target.connection, { type: 'chat', message: chat });
    room.lastActivity = this.now();
  }
  production(connection, message) {
    const { room, member } = connection;
    if (!text(message.requestId, 1, 80))
      return this.error(connection, 'invalid_production', 'An action ID is required.');
    const fingerprint = JSON.stringify(message),
      old = member.requests.get(message.requestId);
    const answer = (ok, reason) => {
      const result = {
        type: 'claimResult',
        requestId: message.requestId,
        ok,
        ...(reason ? { reason } : {}),
      };
      member.requests.set(message.requestId, { fingerprint, result });
      while (member.requests.size > 128)
        member.requests.delete(member.requests.keys().next().value);
      this.send(connection, result);
    };
    if (old) {
      if (old.fingerprint !== fingerprint)
        return this.send(connection, {
          type: 'claimResult',
          requestId: message.requestId,
          ok: false,
          reason: 'Action ID was already used.',
        });
      return this.send(connection, old.result);
    }
    if (message.type === 'machine') {
      const machine = { ...message.machine, ownerId: member.id };
      if (!validProductionMachine(machine)) return answer(false, 'Invalid production platform.');
      const oldMachine = room.machines.get(machine.id);
      if (oldMachine)
        return answer(
          oldMachine.ownerId === member.id &&
            oldMachine.kind === machine.kind &&
            distance(oldMachine, machine) < 0.01,
          'That platform already has a different owner or placement.',
        );
      if (distance(member, machine) > 2 || room.world.blocked(machine.x, machine.y, room.removed))
        return answer(false, 'Stand within two tiles of a clear platform.');
      if (
        [...room.machines.values()].filter((m) => m.ownerId === member.id).length >= 8 ||
        room.machines.size >= 256
      )
        return answer(false, 'The production platform limit is reached.');
      if ([...room.machines.values()].some((m) => distance(m, machine) < 3))
        return answer(false, 'Leave three tiles between production platforms.');
      room.machines.set(machine.id, machine);
      answer(true);
      this.broadcast(room, { type: 'machines', machines: [...room.machines.values()] });
      return;
    }
    const machine = room.machines.get(message.machineId);
    if (
      !machine ||
      machine.ownerId !== member.id ||
      !text(message.jobId, 1, 160) ||
      !text(message.propId, 1, 160) ||
      !point(message)
    )
      return answer(false, 'Register your own production platform first.');
    const receipt = room.productionReceipts.get(message.propId);
    if (receipt)
      return answer(
        receipt.ownerId === member.id &&
          receipt.machineId === machine.id &&
          receipt.jobId === message.jobId,
        'That source belongs to another production claim.',
      );
    if (distance(machine, message) > 16)
      return answer(false, 'That source is outside the platform work area.');
    const prop = room.world
      .propsAround(message.x, message.y, 1)
      .find((p) => p.id === message.propId);
    if (
      !prop ||
      distance(prop, message) > 0.1 ||
      prop.kind !==
        (machine.kind === 'sawmill' ? 'pine' : machine.kind === 'ore-sorter' ? 'rock' : '')
    )
      return answer(false, 'The source does not match this platform.');
    if (room.removed.has(prop.id)) return answer(false, 'That source was already consumed.');
    if (room.productionReceipts.size >= 16384 || room.removed.size >= 16384)
      return answer(false, 'This world has reached its persistent resource limit.');
    room.productionReceipts.set(prop.id, {
      ownerId: member.id,
      machineId: machine.id,
      jobId: message.jobId,
      sourceId: prop.id,
    });
    room.removed.add(prop.id);
    answer(true);
    this.broadcast(room, { type: 'world', actorId: member.id, removed: [prop.id] });
    room.lastActivity = this.now();
  }
  combat(connection, message) {
    const { room, member } = connection;
    if (!text(message.requestId, 1, 80))
      return this.error(connection, 'invalid_combat', 'A combat action ID is required.');
    const fingerprint = JSON.stringify([
      message.type,
      message.kind,
      message.heading,
      message.guardIds,
    ]);
    const old = member.requests.get(message.requestId);
    const deny = (reason) =>
      this.send(connection, {
        type: 'combat_result',
        requestId: message.requestId,
        ok: false,
        reason,
        frame: this.combatFrame(room, member),
      });
    if (old) {
      if (old.fingerprint !== fingerprint)
        return deny('Action ID was already used for a different request.');
      this.send(connection, { ...old.result, frame: this.combatFrame(room, member) });
      return;
    }
    const serial = /^r([1-9]\d{0,14})$/.exec(message.requestId);
    if (serial && Number(serial[1]) <= member.combatSerial)
      return deny('That combat action was already processed.');
    if (!serial && member.combatNamedRequests.has(message.requestId))
      return deny('That combat action was already processed.');
    if (!serial && member.combatNamedRequests.size >= 1024)
      return deny('Use a new monotonic action ID.');
    const answer = (ok, reason, frame) => {
      const result = {
        type: 'combat_result',
        requestId: message.requestId,
        ok,
        ...(reason ? { reason } : {}),
        frame,
      };
      if (serial) member.combatSerial = Number(serial[1]);
      else member.combatNamedRequests.add(message.requestId);
      // Retry results attach the current snapshot; never retain 128 full world copies per peer.
      const { frame: _frame, ...receipt } = result;
      member.requests.set(message.requestId, { fingerprint, result: receipt });
      while (member.requests.size > 128)
        member.requests.delete(member.requests.keys().next().value);
      this.send(connection, result);
    };
    const invalid = (reason) => answer(false, reason, this.combatFrame(room, member));
    if (!['attack', 'ward', 'parley'].includes(message.kind))
      return invalid('Unknown combat action.');
    if (
      message.kind === 'parley'
        ? !Array.isArray(message.guardIds) ||
          message.guardIds.length !== 2 ||
          !message.guardIds.every((id) => text(id, 1, 160))
        : !finite(message.heading, -1e6, 1e6)
    )
      return invalid('Malformed combat intent.');
    const peer = this.combatPeer(member);
    if (member.combatHits.size + member.combatDeaths.size >= 512)
      return invalid('Acknowledge outstanding combat receipts before acting again.');
    // Dialogue withdraws a player from targeting but still permits its explicit peaceful resolution.
    const outcome =
      message.kind === 'parley'
        ? room.combat.parley({ ...peer, combatActive: true }, message.guardIds)
        : room.combat.attack(peer, message.heading, message.kind);
    const frame = { snapshot: outcome.snapshot, hits: outcome.hits, deaths: outcome.deaths };
    this.recordCombat(room, frame);
    answer(outcome.ok, outcome.reason, frame);
    this.broadcast(room, { type: 'combat_frame', frame });
    room.lastActivity = this.now();
  }
  claim(connection, message) {
    const { room, member } = connection;
    if (!text(message.requestId, 1, 80) || !text(message.propId, 1, 160))
      return this.error(connection, 'invalid_claim', 'An action ID and object ID are required.');
    const fingerprint = JSON.stringify([
      message.type,
      message.propId,
      message.kind,
      message.x,
      message.y,
      message.open,
      message.toolKind,
    ]);
    const old = member.requests.get(message.requestId);
    if (old) {
      if (old.fingerprint !== fingerprint)
        return this.send(connection, {
          type: 'claimResult',
          requestId: message.requestId,
          ok: false,
          reason: 'Action ID was already used for a different request.',
        });
      this.send(connection, old.result);
      return;
    }
    const result = (ok, reason) => {
      const answer = {
        type: 'claimResult',
        requestId: message.requestId,
        ok,
        ...(reason ? { reason } : {}),
      };
      member.requests.set(message.requestId, { fingerprint, result: answer });
      while (member.requests.size > 128)
        member.requests.delete(member.requests.keys().next().value);
      this.send(connection, answer);
    };
    if (message.type === 'claim' && (!['gather', 'loot'].includes(message.kind) || !point(message)))
      return result(false, 'Unknown resource action.');
    if (message.type === 'door' && typeof message.open !== 'boolean')
      return result(false, 'A door needs an explicit open state.');
    const prop = room.world
      .propsAround(member.x, member.y, 2.2)
      .find((value) => value.id === message.propId);
    if (!prop || distance(prop, member) > 1.9)
      return result(false, 'Move closer to the actual object.');
    if (message.type === 'claim' && distance(prop, message) > 0.1)
      return result(false, 'The object coordinates do not match.');
    if (message.type === 'door') {
      if (prop.kind !== 'door') return result(false, 'That object is not a door.');
      if (
        !message.open &&
        [...room.members.values()].some((other) => other.connection && distance(other, prop) < 0.85)
      )
        return result(false, 'A traveler is standing in the doorway.');
      const wasOpen = room.opened.has(prop.id);
      if (message.open) {
        room.opened.add(prop.id);
        room.removed.add(prop.id);
      } else {
        room.opened.delete(prop.id);
        room.removed.delete(prop.id);
      }
      result(true);
      if (wasOpen !== message.open)
        this.broadcast(room, {
          type: 'world',
          actorId: member.id,
          ...(message.open ? { removed: [prop.id], opened: [prop.id] } : { closed: [prop.id] }),
        });
      room.lastActivity = this.now();
      return;
    }
    if (room.removed.has(prop.id) || room.opened.has(prop.id))
      return result(false, 'Another traveler already gathered or searched this object.');
    if (room.removed.size >= 14000 || room.opened.size >= 16000)
      return result(false, 'This world has reached its persistent resource limit.');
    if (message.kind === 'gather') {
      if (!GATHERABLE.has(prop.kind)) return result(false, 'That object cannot be gathered.');
      const required = requiredToolFor(prop.kind);
      const artifact = member.appearance.artifactDesign
        ? artifactToolKind(generateArtifact(member.appearance.artifactDesign))
        : null;
      const legacy =
        room.generation < 3 && message.toolKind === undefined && !member.appearance.artifactDesign;
      if (!legacy && message.toolKind !== required && artifact !== required)
        return result(false, `This resource requires a ${required}.`);
      if (
        message.toolKind !== undefined &&
        !['axe', 'pickaxe', 'sickle'].includes(message.toolKind)
      )
        return result(false, 'Unknown gathering tool.');
      if (legacy && ['pine', 'rock'].includes(prop.kind) && member.appearance.weapon !== 'staff')
        return result(false, 'Equip the legacy staff or an appropriate work tool.');
      room.removed.add(prop.id);
      result(true);
      this.broadcast(room, { type: 'world', actorId: member.id, removed: [prop.id] });
    } else {
      if (!['chest', 'crate'].includes(prop.kind))
        return result(false, 'That object has no shared loot.');
      room.opened.add(prop.id);
      result(true);
      this.broadcast(room, { type: 'world', actorId: member.id, opened: [prop.id] });
    }
    room.lastActivity = this.now();
  }
}
