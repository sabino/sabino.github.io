import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Stichos } from '../src/stichos/session.ts';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { appearance } from '../src/stichos/world.ts';

class CreatorReviewSocket extends EventEmitter {
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
let created: any;
function creatorPayload() {
  if (!created) {
    const game = new Stichos(3886, 4);
    const accepted = game.acceptLife(0, { name: 'Independent created life' });
    assert.equal(accepted.ok, true, accepted.message);
    created = {
      type: 'join',
      protocol: 3,
      seed: game.seed,
      generation: game.world.generation,
      name: game.player.bodyName,
      appearance: game.player.appearance,
      position: { x: game.player.x, y: game.player.y },
      bodyId: game.bodyId,
      livingSystems: 1,
    };
  }
  return structuredClone(created);
}
function attach(hub: any, message: unknown) {
  const socket = new CreatorReviewSocket();
  const connection = hub.attach(socket);
  hub.handle(connection, message);
  return { socket, connection, welcome: socket.last('welcome') };
}
function fixture() {
  const identity = creatorPayload();
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const observer = attach(hub, {
    ...identity,
    name: 'Authority observer',
    bodyId: 'independent-observer-body',
    position: { x: 0, y: 5 },
    appearance: appearance(42, 'pilgrim', 1),
  });
  assert.ok(observer.welcome);
  const room = observer.connection.room;
  const npc = room.world
    .npcsAround(identity.position.x, identity.position.y, 8)
    .find((n: any) => n.id === identity.bodyId);
  assert.ok(npc, 'Actual acceptLife output retains an actual generated resident ID');
  assert.notEqual(
    identity.appearance.seed,
    npc.appearance.seed,
    'Creator appearance is cosmetic and has its own seed',
  );
  return {
    hub,
    room,
    npc,
    identity: { ...identity, room: room.id },
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function oldUnboundSave(f: ReturnType<typeof fixture>, underground = false) {
  f.room.systems.actors.register(f.npc, 'npc', 0);
  const first = attach(f.hub, f.identity);
  assert.ok(first.welcome);
  if (underground) {
    const entered = f.room.systems.underworld.enter(
      f.hub.systemsPeer(first.connection.member),
      'town:1:1',
      first.connection.member,
    );
    assert.ok(entered.transition);
    Object.assign(first.connection.member, entered.transition.to);
  }
  const saved = f.hub.exportRoom(f.room.id);
  const member = saved.privateState.members.find((m: any) => m.id === first.welcome.peerId);
  delete member.domainBodyId;
  saved.privateState.systems.occupied = saved.privateState.systems.occupied.filter(
    ([owner]: [string, string]) => owner !== member.id,
  );
  return { saved, member, token: first.welcome.resumeToken };
}

test('actual creator cosmetics still bind a unique persistent resident before any field admission', () => {
  const f = fixture();
  const first = attach(f.hub, f.identity);
  assert.ok(first.welcome);
  assert.equal(first.connection.member.domainBodyId, f.npc.id);
  assert.equal(
    first.connection.member.appearance.seed,
    f.identity.appearance.seed,
    'The appearance editor remains cosmetic',
  );
  assert.equal(
    first.welcome.systems.actors.some((n: any) => n.id === f.npc.id),
    false,
  );
  assert.ok(
    f.room.systems
      .save()
      .occupied.some(
        ([owner, body]: [string, string]) => owner === first.welcome.peerId && body === f.npc.id,
      ),
  );
  const members = f.room.members.size,
    lives = f.room.systems.economy.save().satchels.length;
  first.socket.close();
  const duplicate = attach(f.hub, {
    ...f.identity,
    appearance: { ...f.identity.appearance, seed: f.identity.appearance.seed ^ 1 },
  });
  assert.equal(!!duplicate.welcome, false, 'A disconnected occupied resident is still reserved');
  assert.equal(duplicate.socket.last('error')?.code, 'body_unavailable');
  assert.equal(f.room.members.size, members);
  assert.equal(f.room.systems.economy.save().satchels.length, lives);
});

test('cosmetic creator seeds cannot bypass durable dead or migrated resident admission', () => {
  for (const state of ['removed', 'dead', 'migrated'] as const) {
    const f = fixture();
    f.room.systems.actors.register(f.npc, 'npc', 0);
    if (state === 'removed') f.room.removed.add(f.npc.id);
    if (state === 'dead') f.room.systems.actors.markDead(f.npc.id);
    if (state === 'migrated')
      f.room.systems.actors.transition(
        f.npc.id,
        { spaceId: 'surface', x: f.npc.x + 100, y: f.npc.y + 100 },
        1,
      );
    const prior = f.room.systems.actors.get(f.npc.id);
    const members = f.room.members.size,
      lives = f.room.systems.economy.save().satchels.length;
    const denied = attach(f.hub, f.identity);
    assert.equal(!!denied.welcome, false, state);
    assert.equal(denied.socket.last('error')?.code, 'body_unavailable', state);
    assert.equal(!!denied.connection.member, false, state);
    assert.equal(f.room.members.size, members, state);
    assert.equal(f.room.systems.economy.save().satchels.length, lives, state);
    assert.deepEqual(
      f.room.systems.actors.get(f.npc.id),
      prior,
      'Denial cannot rewind or resurrect the authoritative record',
    );
  }
});

test('an older unbound modern created life binds using saved address and body, never supplied resume coordinates', () => {
  const f = fixture();
  const { saved, member, token } = oldUnboundSave(f);
  const expected = { spaceId: member.spaceId ?? 'surface', x: member.x, y: member.y };
  const hub = new CoopRooms({ now: () => 10000, durable: true });
  hub.restoreRoom(saved.state, saved.privateState);
  const resumed = attach(hub, {
    ...f.identity,
    resumeToken: token,
    position: { x: 500, y: 500 },
    appearance: { ...f.identity.appearance, seed: f.identity.appearance.seed ^ 7 },
  });
  assert.ok(resumed.welcome);
  assert.equal(resumed.connection.member.domainBodyId, f.npc.id);
  assert.deepEqual(resumed.welcome.systems.location, expected);
  assert.equal(
    resumed.welcome.systems.actors.some((n: any) => n.id === f.npc.id),
    false,
  );
  assert.ok(
    resumed.connection.room.systems
      .save()
      .occupied.some(([owner, body]: [string, string]) => owner === member.id && body === f.npc.id),
  );
});

test('unbound modern resume cannot revive a persisted dead creator resident or mutate its record', () => {
  const f = fixture();
  const { saved, member, token } = oldUnboundSave(f);
  const record = saved.privateState.systems.actors.actors.find(
    (actor: any) => actor.id === f.npc.id,
  );
  assert.ok(record);
  record.state = 'dead';
  record.body.hp = 0;
  record.revision++;
  const hub = new CoopRooms({ now: () => 10000, durable: true });
  hub.restoreRoom(saved.state, saved.privateState);
  const prior = hub.rooms.get(f.room.id).systems.actors.get(f.npc.id);
  const resumed = attach(hub, { ...f.identity, resumeToken: token, position: { x: 500, y: 500 } });
  assert.equal(!!resumed.welcome, false);
  assert.equal(resumed.socket.last('error')?.code, 'body_unavailable');
  assert.deepEqual(hub.rooms.get(f.room.id).systems.actors.get(f.npc.id), prior);
  assert.equal(!!hub.rooms.get(f.room.id).members.get(member.id).connection, false);
});

test('remote generated resident IDs cannot fall back to generic labels, while a nearby migrated ledger body can bind', () => {
  const f = fixture();
  const remote = { ...f.identity, position: { x: 0, y: 5 } };
  assert.equal(f.room.systems.actors.get(f.npc.id), undefined);
  const denied = attach(f.hub, remote);
  assert.equal(!!denied.welcome, false);
  assert.equal(denied.socket.last('error')?.code, 'body_unavailable');
  f.room.systems.actors.register(f.npc, 'npc', 0);
  assert.equal(
    f.room.systems.actors.transition(f.npc.id, { spaceId: 'surface', x: 0, y: 5 }, 1),
    true,
  );
  assert.equal(
    f.room.world.npcsAround(0, 5, 8).some((n: any) => n.id === f.npc.id),
    false,
    'This body is known here through its ledger, not its old generated spawn',
  );
  const admitted = attach(f.hub, remote);
  assert.ok(admitted.welcome);
  assert.equal(admitted.connection.member.domainBodyId, f.npc.id);
});

test('a retained unbound underground creator can reconnect while dead, removed and canonical occupied bodies remain refused', () => {
  for (const condition of ['alive', 'dead', 'removed', 'occupied'] as const) {
    const f = fixture();
    const { saved, member, token } = oldUnboundSave(f, true);
    const expected = { spaceId: member.spaceId, x: member.x, y: member.y };
    assert.equal(expected.spaceId, 'underground:town:1:1:0');
    const record = saved.privateState.systems.actors.actors.find(
      (actor: any) => actor.id === f.npc.id,
    );
    assert.equal(
      record.spaceId,
      'surface',
      'The earlier unbound body did not follow its player into the floor',
    );
    if (condition === 'dead') {
      record.state = 'dead';
      record.body.hp = 0;
      record.revision++;
    }
    if (condition === 'removed') saved.state.removed.push(f.npc.id);
    if (condition === 'occupied') {
      const holder = saved.privateState.members.find((m: any) => m.id !== member.id);
      holder.domainBodyId = f.npc.id;
      holder.bodyId = f.npc.id;
      holder.x = f.npc.x;
      holder.y = f.npc.y;
      saved.privateState.systems.occupied.push([holder.id, f.npc.id]);
    }
    const hub = new CoopRooms({ now: () => 10000, durable: true });
    hub.restoreRoom(saved.state, saved.privateState);
    const before = hub.rooms.get(f.room.id).systems.actors.get(f.npc.id);
    const resumed = attach(hub, {
      ...f.identity,
      resumeToken: token,
      position: { x: 500, y: 500 },
    });
    if (condition === 'alive') {
      assert.ok(resumed.welcome, 'The authenticated saved expedition must be able to reconnect');
      assert.equal(resumed.connection.member.domainBodyId, f.npc.id);
      assert.deepEqual(
        resumed.welcome.systems.location,
        expected,
        'The actual stored floor wins over spoofed coordinates',
      );
      assert.ok(
        resumed.connection.room.systems
          .save()
          .occupied.some(
            ([owner, body]: [string, string]) => owner === member.id && body === f.npc.id,
          ),
      );
      hub.handle(resumed.connection, {
        type: 'systems',
        requestId: 'r1',
        command: { kind: 'underworld-recover' },
      });
      assert.equal(
        resumed.socket.last('systems_result').ok,
        true,
        'The restored life can use actual expedition recall',
      );
      assert.equal(resumed.socket.last('systems_result').frame.location.spaceId, 'surface');
    } else {
      assert.equal(!!resumed.welcome, false, condition);
      assert.equal(resumed.socket.last('error')?.code, 'body_unavailable', condition);
      assert.deepEqual(hub.rooms.get(f.room.id).systems.actors.get(f.npc.id), before, condition);
    }
  }
});

test('an old unbound surface life that physically walked away resumes its stored position and identity', () => {
  const f = fixture();
  f.room.systems.actors.register(f.npc, 'npc', 0);
  const first = attach(f.hub, f.identity);
  assert.ok(first.welcome);
  const start = { ...f.identity.position };
  const queue = [start];
  const previous = new Map<string, { x: number; y: number } | null>([
    [`${start.x},${start.y}`, null],
  ]);
  let destination: { x: number; y: number } | undefined;
  for (let i = 0; i < queue.length && i < 500; i++) {
    const current = queue[i];
    if (Math.hypot(current.x - start.x, current.y - start.y) >= 10) {
      destination = current;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: current.x + dx, y: current.y + dy },
        key = `${next.x},${next.y}`;
      if (previous.has(key) || f.room.world.blocked(next.x, next.y, f.room.removed)) continue;
      previous.set(key, current);
      queue.push(next);
    }
  }
  assert.ok(destination, 'Actual terrain contains a legal route away from the chosen resident');
  const route = [destination];
  let cursor = previous.get(`${destination.x},${destination.y}`);
  while (cursor) {
    route.unshift(cursor);
    cursor = previous.get(`${cursor.x},${cursor.y}`);
  }
  for (const point of route.slice(1)) {
    f.advance(100);
    f.hub.handle(first.connection, {
      type: 'pose',
      ...point,
      heading: 0,
      phase: 0,
      appearance: f.identity.appearance,
      bodyId: f.identity.bodyId,
    });
    assert.deepEqual({ x: first.connection.member.x, y: first.connection.member.y }, point);
  }
  const saved = f.hub.exportRoom(f.room.id);
  const member = saved.privateState.members.find((m: any) => m.id === first.welcome.peerId);
  delete member.domainBodyId;
  saved.privateState.systems.occupied = saved.privateState.systems.occupied.filter(
    ([owner]: [string, string]) => owner !== member.id,
  );
  const record = saved.privateState.systems.actors.actors.find(
    (actor: any) => actor.id === f.npc.id,
  );
  assert.ok(
    Math.hypot(member.x - record.x, member.y - record.y) > 8,
    'The old unbound record remains behind the physically admitted player',
  );
  const hub = new CoopRooms({ now: f.now, durable: true });
  hub.restoreRoom(saved.state, saved.privateState);
  const resumed = attach(hub, {
    ...f.identity,
    resumeToken: first.welcome.resumeToken,
    position: { x: 500, y: 500 },
  });
  assert.ok(
    resumed.welcome,
    'A legitimate saved walk is not mistaken for a new remote body selection',
  );
  assert.equal(resumed.connection.member.domainBodyId, f.npc.id);
  assert.deepEqual(resumed.welcome.systems.location, {
    spaceId: 'surface',
    x: member.x,
    y: member.y,
  });
});
