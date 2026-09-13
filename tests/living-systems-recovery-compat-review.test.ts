import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { Stichos } from '../src/stichos/session.ts';
import { validateSystemResult } from '../src/stichos/systems-receipts.ts';

class ReviewSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages: any[] = [];
  send(raw: string) {
    this.messages.push(JSON.parse(raw));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  ping() {}
  last(type: string) {
    return this.messages.filter((m) => m.type === type).at(-1);
  }
}

function sharedAt(point?: { x: number; y: number }) {
  let now = 10000;
  const game = new Stichos(3886, 2);
  game.phase = 'playing';
  game.dialogue = null;
  if (point) Object.assign(game.player, point);
  const hub = new CoopRooms({ now: () => now, durable: true });
  const socket = new ReviewSocket(),
    connection = hub.attach(socket);
  const send = (message: unknown) => hub.handle(connection, message);
  send({
    type: 'join',
    protocol: 3,
    seed: game.seed,
    generation: game.world.generation,
    name: game.player.bodyName,
    appearance: game.player.appearance,
    position: { x: game.player.x, y: game.player.y },
    bodyId: game.bodyId,
    livingSystems: 1,
  });
  const welcome = socket.last('welcome');
  assert.ok(welcome, 'fixture joins on real clear surface ground');
  game.setSharedWorld(true);
  game.applySystemsFrame(welcome.systems, welcome.peerId, welcome.room);
  const pose = (bodyId = game.bodyId) => {
    now += 100;
    send({
      type: 'pose',
      x: game.player.x,
      y: game.player.y,
      heading: game.player.heading,
      phase: game.player.phase,
      appearance: game.player.appearance,
      bodyId,
      combatActive: game.phase === 'playing',
    });
  };
  return {
    game,
    hub,
    socket,
    connection,
    send,
    pose,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function clearRoute(game: Stichos) {
  const start = { x: Math.round(game.player.x), y: Math.round(game.player.y) };
  const queue = [start],
    prior = new Map<string, { x: number; y: number } | null>([[`${start.x},${start.y}`, null]]);
  for (let i = 0; i < queue.length && i < 1000; i++) {
    const p = queue[i];
    if (Math.hypot(p.x - start.x, p.y - start.y) >= 10) {
      const path = [p];
      let cursor = prior.get(`${p.x},${p.y}`);
      while (cursor) {
        path.unshift(cursor);
        cursor = prior.get(`${cursor.x},${cursor.y}`);
      }
      return path;
    }
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const next = { x: p.x + dx, y: p.y + dy },
        key = `${next.x},${next.y}`;
      if (prior.has(key) || game.world.blocked(next.x, next.y, game.removed)) continue;
      prior.set(key, p);
      queue.push(next);
    }
  }
  throw new Error('Fixture needs a real surface route away from the clinic.');
}

test('a modern shared surface death cannot locally relocate or heal before an authority recovery receipt', (t) => {
  const f = sharedAt(),
    route = clearRoute(f.game);
  for (const point of route.slice(1)) {
    Object.assign(f.game.player, point);
    f.pose();
    assert.equal(f.connection.member.x, point.x);
    assert.equal(f.connection.member.y, point.y);
  }
  const death = { x: f.game.player.x, y: f.game.player.y };
  assert.ok(Math.hypot(death.x - route[0].x, death.y - route[0].y) >= 10);
  f.game.player.hp = 0;
  f.game.phase = 'lost';
  f.pose();
  f.game.reincarnate();
  f.pose();
  t.diagnostic(
    JSON.stringify({
      death,
      client: { x: f.game.player.x, y: f.game.player.y, hp: f.game.player.hp, phase: f.game.phase },
      authority: { x: f.connection.member.x, y: f.connection.member.y },
      correction: f.socket.last('systems_correction')?.location,
    }),
  );
  assert.equal(
    f.game.phase,
    'lost',
    'clinic recovery requires explicit authority admission before revival',
  );
  assert.equal(f.game.player.hp, 0);
  assert.deepEqual(
    { x: f.game.player.x, y: f.game.player.y },
    death,
    'the client must not pretend an unconfirmed clinic teleport happened',
  );
});

test('modern shared shrine travel cannot replace the local body while the server retains the previous identity', () => {
  const f = sharedAt({ x: -2, y: -2 });
  f.game.storyStage = 4;
  const before = {
    bodyId: f.game.bodyId,
    inventory: structuredClone(f.game.inventory),
    coins: f.game.player.coins,
    x: f.game.player.x,
    y: f.game.player.y,
  };
  const shrine = f.game.world.propsAround(-2, -2, 2).find((p) => p.kind === 'shrine');
  assert.ok(shrine, 'fixture stands at an actual quiet shrine');
  f.game.reincarnate();
  assert.equal(
    f.game.bodyId,
    before.bodyId,
    'an unsupported shared transfer cannot commit only in the browser',
  );
  assert.deepEqual(f.game.inventory, before.inventory);
  assert.equal(f.game.player.coins, before.coins);
  assert.deepEqual({ x: f.game.player.x, y: f.game.player.y }, { x: before.x, y: before.y });
  assert.equal(
    f.game.transferCandidates.length,
    0,
    'the shared shrine must not advertise unadmitted bodies',
  );
});

test('a modern pose cannot replace the body identity without an admitted transfer', () => {
  const f = sharedAt(),
    before = f.connection.member.bodyId;
  f.pose('unadmitted-other-body');
  assert.equal(
    f.connection.member.bodyId,
    before,
    'position updates are not authority to bind another life',
  );
  assert.ok(
    f.socket.last('error') || f.socket.last('systems_correction'),
    'the unsupported transition is explicitly rejected',
  );
});

test('authenticated modern resume cannot bypass body-transfer admission', () => {
  const f = sharedAt(),
    welcome = f.socket.last('welcome'),
    before = f.connection.member.bodyId;
  f.socket.close();
  const socket = new ReviewSocket(),
    connection = f.hub.attach(socket);
  f.hub.handle(connection, {
    type: 'join',
    protocol: 3,
    seed: f.game.seed,
    generation: f.game.world.generation,
    name: f.game.player.bodyName,
    appearance: f.game.player.appearance,
    position: { x: f.game.player.x, y: f.game.player.y },
    bodyId: 'unadmitted-resume-body',
    livingSystems: 1,
    room: welcome.room,
    resumeToken: welcome.resumeToken,
  });
  assert.equal(
    f.hub.rooms.get(welcome.room).members.get(welcome.peerId).bodyId,
    before,
    'resuming a credential retains its admitted body identity',
  );
  assert.equal(
    !!socket.last('welcome'),
    false,
    'unadmitted body change must be explicit rather than silently splitting client/server identity',
  );
});

test('surface rescue moves to the frozen anchor, charges once, synchronizes the client and persists replay/cooldown state', () => {
  const f = sharedAt(),
    welcome = f.socket.last('welcome'),
    anchor = structuredClone(f.connection.member.recoveryAnchor);
  assert.deepEqual(anchor, { spaceId: 'surface', x: 0, y: 5 });
  for (const point of clearRoute(f.game).slice(1)) {
    Object.assign(f.game.player, point);
    f.pose();
  }
  f.game.phase = 'lost';
  f.game.player.hp = 0;
  f.pose();
  const personalCoins = f.game.player.coins;
  const request = { type: 'systems', requestId: 'r1', command: { kind: 'surface-recover' } };
  let stopped = 0;
  f.hub.voiceAuthority = {
    stopForTransition: () => {
      stopped++;
    },
  };
  f.send(request);
  const first = f.socket.last('systems_result');
  assert.equal(first.ok, true, first.reason);
  assert.equal(validateSystemResult(first.result), true);
  assert.equal(first.result.transition.reason, 'clinic');
  assert.deepEqual(first.frame.location, anchor);
  assert.equal(first.result.recovery.coinLoss, 5);
  assert.equal(first.frame.economy.satchel.coins, 19);
  assert.equal(stopped, 1);
  const origin = { scope: `room:${welcome.room}:${welcome.peerId}`, actorId: welcome.peerId };
  f.game.applySystemsFrame(first.frame, welcome.peerId, welcome.room);
  f.game.correctSystemsPosition(first.frame.location);
  f.game.commitFieldResult(first.result, origin);
  assert.equal(f.game.finishExpeditionRecovery(), true);
  assert.equal(f.game.phase, 'playing');
  assert.ok(f.game.player.hp > 0);
  assert.equal(
    f.game.player.coins,
    personalCoins,
    'the authoritative field fee is not followed by a second personal-wallet fee',
  );
  f.pose();
  assert.equal(f.socket.last('systems_correction'), undefined);
  f.send(request);
  assert.equal(f.socket.last('systems_result').frame.economy.satchel.coins, 19);
  assert.equal(stopped, 1, 'cached receipt does not replay the transition hook');
  f.advance(200);
  f.send({ ...request, requestId: 'r2' });
  assert.equal(f.socket.last('systems_result').ok, false, 'a fresh ID cannot bypass the cooldown');
  const saved = f.hub.exportRoom(welcome.room),
    restored = new CoopRooms({ now: f.now, durable: true });
  restored.restoreRoom(saved.state, saved.privateState);
  const socket = new ReviewSocket(),
    connection = restored.attach(socket);
  restored.handle(connection, {
    type: 'join',
    protocol: 3,
    seed: f.game.seed,
    generation: f.game.world.generation,
    name: f.game.player.bodyName,
    appearance: f.game.player.appearance,
    position: { x: 100, y: 100 },
    bodyId: f.game.bodyId,
    livingSystems: 1,
    room: welcome.room,
    resumeToken: welcome.resumeToken,
  });
  assert.ok(socket.last('welcome'));
  assert.deepEqual(
    connection.member.recoveryAnchor,
    anchor,
    'untrusted resume coordinates cannot move the frozen anchor',
  );
  assert.deepEqual(
    { spaceId: connection.member.spaceId, x: connection.member.x, y: connection.member.y },
    anchor,
  );
  assert.equal(connection.member.recoveryReadyAt, first.result.recovery.cooldownUntil);
  restored.handle(connection, { ...request, requestId: 'r3' });
  assert.equal(socket.last('systems_result').ok, false);
  f.advance(31000);
  restored.handle(connection, { ...request, requestId: 'r4' });
  assert.equal(socket.last('systems_result').ok, true);
  assert.equal(socket.last('systems_result').frame.economy.satchel.coins, 15);
});

test('surface rescue rejects target injection and spends nothing when its bounded landing area is obstructed', () => {
  const f = sharedAt(),
    member = f.connection.member,
    room = f.connection.room;
  const coins = room.systems.economy.satchel(member.id).coins;
  f.send({
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'surface-recover', to: { spaceId: 'surface', x: 999, y: 999 } },
  });
  assert.equal(f.socket.last('error').code, 'invalid_systems');
  const blocked = room.world.blocked;
  room.world.blocked = () => true;
  f.send({ type: 'systems', requestId: 'r2', command: { kind: 'surface-recover' } });
  assert.equal(f.socket.last('systems_result').ok, false);
  assert.equal(room.systems.economy.satchel(member.id).coins, coins);
  assert.equal(member.recoveryReadyAt, undefined);
  room.world.blocked = blocked;
  const exported = f.hub.exportRoom(room.id);
  for (const mutation of [
    { recoveryAnchor: { spaceId: 'underground:wrong:0', x: 0, y: 5 } },
    { recoveryAnchor: { spaceId: 'surface', x: 0, y: 5, microphone: 'not allowed' } },
    { recoveryAnchor: { spaceId: 'surface', x: Infinity, y: 5 } },
    { recoveryReadyAt: -1 },
  ]) {
    const privateState = structuredClone(exported.privateState);
    Object.assign(privateState.members[0], mutation);
    assert.throws(
      () => new CoopRooms({ now: f.now, durable: true }).restoreRoom(exported.state, privateState),
      /Invalid private traveler record/,
    );
  }
});
