import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { appearance } from '../src/stichos/world.ts';
import { MultiplayerConnection } from '../src/stichos/multiplayer.ts';
import { Stichos } from '../src/stichos/session.ts';
import {
  validLivingSystemsFrame,
  type LivingSystemsFrame,
  type SystemsResult,
} from '../src/stichos/living-systems.ts';

let generated: { frame: LivingSystemsFrame; bodyId: string } | undefined;
function fixture() {
  if (!generated) {
    const game = new Stichos(3886, 2);
    game.phase = 'playing';
    game.dialogue = null;
    game.enableLivingSystems('review-life');
    const frame = JSON.parse(JSON.stringify(game.livingSystemsFrame!));
    assert.equal(validLivingSystemsFrame(frame), true);
    generated = { frame, bodyId: game.bodyId };
  }
  const cachedFrame = structuredClone(generated.frame);
  const connection = new MultiplayerConnection();
  connection.livingSystems = true;
  connection.peerId = 'review-life';
  connection.room = 'review-room';
  connection.systemsFrame = cachedFrame;
  const corrections: unknown[] = [];
  connection.onSystemsCorrection = (location) => {
    corrections.push(structuredClone(location));
  };
  const result: SystemsResult = {
    ok: true,
    message: 'The admitted refuge receives this life.',
    transition: {
      actorId: 'review-life',
      from: cachedFrame.location,
      to: { spaceId: 'surface', x: 50, y: 50 },
      reason: 'clinic',
    },
    recovery: { coinLoss: 2, cooldownUntil: 30 },
    receipt: {
      scope: 'room:review-room:review-life',
      actorId: 'review-life',
      targetBodyId: generated.bodyId,
      sequence: 1,
    },
  };
  const currentFrame = {
    ...structuredClone(cachedFrame),
    nextSequence: 2,
    location: { spaceId: 'surface', x: 20, y: 20 },
  };
  assert.equal(validLivingSystemsFrame(currentFrame), true);
  const respond = (response: unknown) => {
    (connection as unknown as { request: () => Promise<unknown> }).request = async () => response;
  };
  return { connection, cachedFrame, currentFrame, corrections, result, respond };
}

// The request promise is the only transport substitute. Frame generation and the
// public MultiplayerConnection.systems action/result boundary are actual modules.
test('a recovery receipt cannot succeed using an absent, invalid, foreign or stale response frame', async () => {
  const f = fixture();
  for (const frame of [
    undefined,
    {},
    { ...f.currentFrame, economy: null },
    {
      ...f.currentFrame,
      economy: {
        ...f.currentFrame.economy,
        satchel: { ...f.currentFrame.economy.satchel, actorId: 'another-life' },
      },
    },
    { ...f.currentFrame, nextSequence: 1 },
  ]) {
    f.respond({ ok: true, result: f.result, ...(frame === undefined ? {} : { frame }) });
    assert.equal((await f.connection.systems({ kind: 'surface-recover' })).ok, false);
    assert.deepEqual(f.connection.systemsFrame, f.cachedFrame);
    assert.equal(f.corrections.length, 0);
  }
});

test('recovery correction requires an actual bounded location and safe monotonic sequence', async () => {
  const f = fixture();
  const invalid = [
    { ...f.currentFrame, location: {} },
    { ...f.currentFrame, location: 1 },
    { ...f.currentFrame, location: { spaceId: 'surface', x: 20 } },
    { ...f.currentFrame, location: { spaceId: 'surface', x: 1e12, y: 20 } },
    { ...f.currentFrame, nextSequence: undefined },
    { ...f.currentFrame, nextSequence: 1.5 },
    { ...f.currentFrame, nextSequence: '2' },
  ];
  for (const frame of invalid) {
    const wireFrame = JSON.parse(JSON.stringify(frame));
    f.respond({ ok: true, result: f.result, frame: wireFrame });
    assert.equal(
      (await f.connection.systems({ kind: 'surface-recover' })).ok,
      false,
      JSON.stringify({ location: frame.location, nextSequence: frame.nextSequence }),
    );
    assert.equal(f.corrections.length, 0);
  }
});

test('valid clinic receipt corrects to its own current frame and rejects foreign receipt or outer result', async () => {
  const f = fixture();
  f.respond({ ok: true, result: f.result, frame: f.currentFrame });
  assert.equal((await f.connection.systems({ kind: 'surface-recover' })).ok, true);
  assert.deepEqual(f.corrections, [f.currentFrame.location]);
  assert.notDeepEqual(
    f.corrections[0],
    f.result.transition!.to,
    'A cached transition cannot rewind later authority movement',
  );
  f.corrections.length = 0;
  for (const response of [
    { ok: false, result: f.result, frame: f.currentFrame },
    {
      ok: true,
      result: {
        ...f.result,
        receipt: { ...f.result.receipt!, scope: 'room:another-room:review-life' },
      },
      frame: f.currentFrame,
    },
  ]) {
    f.respond(response);
    assert.equal((await f.connection.systems({ kind: 'surface-recover' })).ok, false);
    assert.equal(f.corrections.length, 0);
  }
});

test('recovery response cannot act after the connection epoch, room or life changes', async () => {
  for (const change of ['epoch', 'peerId', 'room'] as const) {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    (f.connection as unknown as { request: () => Promise<unknown> }).request = () =>
      new Promise((done) => {
        resolve = done;
      });
    const outcome = f.connection.systems({ kind: 'surface-recover' });
    if (change === 'epoch') (f.connection as unknown as { epoch: number }).epoch++;
    else f.connection[change] = 'replacement';
    resolve({ ok: true, result: f.result, frame: f.currentFrame });
    assert.equal((await outcome).ok, false);
    assert.equal(f.corrections.length, 0);
  }
});

test('a shared revival consumes one accepted current-body recovery authorization', () => {
  const f = fixture();
  const game = new Stichos(3886, 2);
  game.setSharedWorld(true);
  game.applySystemsFrame(f.cachedFrame, 'review-life', 'review-room');
  game.phase = 'lost';
  game.player.hp = 0;
  const origin = { scope: 'room:review-room:review-life', actorId: 'review-life' };
  const bodyId = game.bodyId;
  assert.equal(game.finishExpeditionRecovery(), false, 'No receipt has admitted recovery');
  assert.equal(game.phase, 'lost');
  assert.equal(game.player.hp, 0);
  game.commitFieldResult(
    { ...f.result, receipt: { ...f.result.receipt!, targetBodyId: 'another-body' } },
    origin,
  );
  assert.equal(
    game.finishExpeditionRecovery(),
    false,
    'Wrong-body effects cannot authorize revival',
  );
  game.correctSystemsPosition(f.currentFrame.location);
  // A valid wrong-body receipt is consumed, so the next real rescue has a fresh sequence.
  const approved = {
    ...f.result,
    receipt: { ...f.result.receipt!, targetBodyId: bodyId, sequence: 2 },
  };
  assert.equal(game.commitFieldResult(approved, origin), true);
  assert.equal(game.finishExpeditionRecovery(), true);
  assert.equal(game.phase, 'playing');
  assert.equal(game.bodyId, bodyId);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.deepEqual({ x: game.player.x, y: game.player.y }, { x: 20, y: 20 });
  game.phase = 'lost';
  game.player.hp = 0;
  game.commitFieldResult(approved, origin);
  assert.equal(
    game.finishExpeditionRecovery(),
    false,
    'A consumed receipt cannot revive a later faint',
  );
  assert.equal(game.player.hp, 0);
  const next = { ...approved, receipt: { ...approved.receipt, sequence: 3 } };
  game.commitFieldResult(next, origin);
  game.applySystemsFrame(f.cachedFrame, 'review-life', 'replacement-room');
  assert.equal(
    game.finishExpeditionRecovery(),
    false,
    'Changing rooms invalidates an outstanding recovery authorization',
  );
  assert.equal(game.phase, 'lost');
});

class RecoveryReviewSocket extends EventEmitter {
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
    return this.messages.filter((message) => message.type === type).at(-1);
  }
}
function authorityFixture() {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const socket = new RecoveryReviewSocket();
  const connection = hub.attach(socket);
  const identity = {
    type: 'join',
    protocol: 3,
    seed: 1,
    generation: 4,
    name: 'Independent recovery traveler',
    appearance: appearance(42, 'pilgrim', 1),
    position: { x: 0, y: 5 },
    bodyId: 'review-bound-body',
    livingSystems: 1,
  };
  hub.handle(connection, identity);
  assert.ok(socket.last('welcome'));
  return {
    hub,
    socket,
    connection,
    identity,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('surface recovery uses the durable common command floor after response-cache eviction and private reload', () => {
  const f = authorityFixture();
  const request = { type: 'systems', requestId: 'r1', command: { kind: 'surface-recover' } };
  f.hub.handle(f.connection, request);
  const first = f.socket.last('systems_result');
  assert.equal(first.ok, true, first.reason);
  const anchor = structuredClone(f.connection.member.recoveryAnchor);
  const saved = f.hub.exportRoom(f.connection.room.id);
  // Expiring the small presentation response cache cannot erase durable admission.
  saved.privateState.members[0].requests = [];
  f.advance(31000);
  const hub = new CoopRooms({ now: f.now, durable: true });
  hub.restoreRoom(saved.state, saved.privateState);
  const socket = new RecoveryReviewSocket();
  const connection = hub.attach(socket);
  hub.handle(connection, {
    ...f.identity,
    position: { x: 500, y: 500 },
    room: saved.state.room,
    resumeToken: f.socket.last('welcome').resumeToken,
  });
  assert.ok(socket.last('welcome'));
  assert.deepEqual(connection.member.recoveryAnchor, anchor);
  assert.deepEqual(socket.last('welcome').systems.location, anchor);
  hub.handle(connection, request);
  assert.equal(socket.last('systems_result').ok, false);
  assert.equal(socket.last('systems_result').result.transition, undefined);
  assert.equal(
    connection.room.systems.economy.satchel(connection.member.id).coins,
    first.frame.economy.satchel.coins,
  );
  f.advance(200);
  hub.handle(connection, { ...request, requestId: 'r2' });
  assert.equal(socket.last('systems_result').ok, true);
  assert.equal(connection.room.systems.economy.satchel(connection.member.id).coins, 15);
});

test('failed surface landing search is bounded and leaves a retryable unfunded rescue', () => {
  const f = authorityFixture();
  const room = f.connection.room,
    member = f.connection.member;
  const before = room.systems.economy.satchel(member.id).coins;
  const originalBlocked = room.world.blocked;
  let probes = 0;
  room.world.blocked = () => {
    probes++;
    return true;
  };
  f.hub.handle(f.connection, {
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'surface-recover' },
  });
  assert.equal(f.socket.last('systems_result').ok, false);
  assert.ok(
    probes <= 169,
    `At most the bounded 13 by 13 landing area is searched; observed ${probes}`,
  );
  assert.ok(probes > 0);
  assert.equal(room.systems.economy.satchel(member.id).coins, before);
  assert.equal(member.recoveryReadyAt, undefined);
  room.world.blocked = originalBlocked;
  f.advance(200);
  f.hub.handle(f.connection, {
    type: 'systems',
    requestId: 'r2',
    command: { kind: 'surface-recover' },
  });
  assert.equal(f.socket.last('systems_result').ok, true);
  assert.equal(room.systems.economy.satchel(member.id).coins, before - Math.ceil(before * 0.2));
});

test('older private records derive their anchor from retained authority position while genuine legacy lives retain their path', () => {
  const f = authorityFixture();
  const saved = f.hub.exportRoom(f.connection.room.id);
  const expected = {
    spaceId: 'surface',
    x: saved.privateState.members[0].x,
    y: saved.privateState.members[0].y,
  };
  delete saved.privateState.members[0].recoveryAnchor;
  delete saved.privateState.members[0].recoveryReadyAt;
  const hub = new CoopRooms({ now: f.now, durable: true });
  hub.restoreRoom(saved.state, saved.privateState);
  const socket = new RecoveryReviewSocket();
  const connection = hub.attach(socket);
  hub.handle(connection, {
    ...f.identity,
    position: { x: 500, y: 500 },
    room: saved.state.room,
    resumeToken: f.socket.last('welcome').resumeToken,
  });
  assert.ok(socket.last('welcome'));
  assert.deepEqual(connection.member.recoveryAnchor, expected);
  assert.deepEqual(socket.last('welcome').systems.location, expected);
  hub.handle(connection, {
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'surface-recover' },
  });
  assert.equal(
    socket.last('systems_result').ok,
    true,
    'A pre-extension retained life is not stranded',
  );

  const legacySocket = new RecoveryReviewSocket();
  const legacy = hub.attach(legacySocket);
  const { livingSystems: _unusedCapability, ...legacyIdentity } = f.identity;
  hub.handle(legacy, { ...legacyIdentity, bodyId: 'legacy-body', room: saved.state.room });
  assert.ok(legacySocket.last('welcome'));
  assert.equal(legacySocket.last('welcome').livingSystems, undefined);
  hub.handle(legacy, {
    type: 'pose',
    x: 0,
    y: 5,
    heading: 0,
    phase: 0,
    appearance: f.identity.appearance,
    bodyId: 'legacy-replacement-body',
  });
  assert.equal(legacy.member.bodyId, 'legacy-replacement-body');
  hub.handle(legacy, { type: 'systems', requestId: 'r1', command: { kind: 'surface-recover' } });
  assert.equal(legacySocket.last('error').code, 'capability_required');
  assert.equal(legacySocket.last('systems_result'), undefined);
});
