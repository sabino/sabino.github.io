import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Stichos } from '../src/stichos/session.ts';
import { CoopRooms } from '../src/stichos/room-authority.mjs';

class Socket extends EventEmitter {
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

function created(index: number, skin?: string) {
  const game = new Stichos(3886, 4);
  const result = game.acceptLife(index, skin ? { skin } : {});
  assert.equal(result.ok, true, result.message);
  return game;
}
function admit(hub: CoopRooms, game: Stichos, room?: string) {
  const socket = new Socket(),
    connection = hub.attach(socket);
  hub.handle(connection, {
    type: 'join',
    protocol: 3,
    seed: game.world.seed,
    generation: game.world.generation,
    name: game.player.name,
    appearance: game.displayAppearance,
    position: { x: game.player.x, y: game.player.y },
    bodyId: game.bodyId,
    livingSystems: 1,
    ...(room ? { room } : {}),
  });
  return { socket, connection, welcome: socket.last('welcome') };
}

test('actual created lives bind distinct real residents despite their procedural appearance seeds', () => {
  const first = created(0),
    original = first.world
      .npcsAround(first.player.x, first.player.y, 8)
      .find((n) => n.id === first.bodyId);
  assert.ok(original, 'the creator selected an actual generated resident');
  assert.notEqual(
    first.player.appearance.seed,
    original.appearance.seed,
    'candidate appearance has its own deterministic variation seed',
  );
  let nextIndex = 1;
  while (nextIndex < 30 && first.lifeCandidate(nextIndex).id === first.bodyId) nextIndex++;
  const second = created(nextIndex, '#916652');
  assert.notEqual(second.bodyId, first.bodyId);
  const hub = new CoopRooms({ now: () => 10000, durable: true });
  const a = admit(hub, first);
  assert.ok(a.welcome);
  const b = admit(hub, second, a.welcome.room);
  assert.ok(b.welcome);
  assert.equal(
    a.connection.member.domainBodyId,
    first.bodyId,
    'creator cosmetics cannot silently discard the persistent body reservation',
  );
  assert.equal(b.connection.member.domainBodyId, second.bodyId);
  assert.equal(
    new Set([a.connection.member.domainBodyId, b.connection.member.domainBodyId]).size,
    2,
  );
  const save = hub.exportRoom(a.welcome.room);
  const restored = new CoopRooms({ now: () => 11000, durable: true });
  restored.restoreRoom(save.state, save.privateState);
  assert.equal(
    new Set(
      [...restored.rooms.get(a.welcome.room).members.values()].map((m: any) => m.domainBodyId),
    ).size,
    2,
  );
});

test('a second real creator cannot claim the same occupied body by changing its cosmetics', () => {
  const hub = new CoopRooms({ now: () => 10000, durable: true }),
    first = created(0),
    a = admit(hub, first);
  assert.ok(a.welcome);
  const duplicate = created(0, '#e6c6a2');
  assert.equal(duplicate.bodyId, first.bodyId);
  const b = admit(hub, duplicate, a.welcome.room);
  assert.equal(!!b.welcome, false, 'the same resident cannot belong to two independent room lives');
  assert.equal(b.socket.last('error')?.code, 'body_unavailable');
  assert.equal(a.connection.room.members.size, 1);
});

test('a customized creator cannot revive a dead resident hidden behind the appearance-seed mismatch', () => {
  const hub = new CoopRooms({ now: () => 10000, durable: true }),
    first = created(0),
    a = admit(hub, first);
  assert.ok(a.welcome);
  a.connection.room.removed.add(first.bodyId);
  a.connection.room.systems.actors.markDead(first.bodyId);
  a.socket.close();
  const b = admit(hub, created(0, '#ba8659'), a.welcome.room);
  assert.equal(!!b.welcome, false);
  assert.equal(b.socket.last('error')?.code, 'body_unavailable');
});

test('an authenticated older underground life with no retained actor can recall without gaining body custody', () => {
  const game = created(0),
    hub = new CoopRooms({ now: () => 10000, durable: true }),
    first = admit(hub, game);
  assert.ok(first.welcome);
  const room = first.connection.room,
    member = first.connection.member;
  const entered = room.systems.underworld.enter(hub.systemsPeer(member), 'town:1:1', member);
  assert.ok(entered.transition);
  Object.assign(member, entered.transition.to);
  const saved = hub.exportRoom(room.id),
    prior = saved.privateState.members.find((m: any) => m.id === member.id);
  delete prior.domainBodyId;
  saved.privateState.systems.occupied = saved.privateState.systems.occupied.filter(
    ([id]: [string, string]) => id !== member.id,
  );
  saved.privateState.systems.actors.actors = saved.privateState.systems.actors.actors.filter(
    (record: any) => record.id !== game.bodyId,
  );
  const restored = new CoopRooms({ now: () => 11000, durable: true });
  restored.restoreRoom(saved.state, saved.privateState);
  const socket = new Socket(),
    connection = restored.attach(socket);
  restored.handle(connection, {
    type: 'join',
    protocol: 3,
    seed: game.seed,
    generation: game.world.generation,
    name: game.player.name,
    appearance: game.displayAppearance,
    position: { x: 500, y: 500 },
    bodyId: game.bodyId,
    livingSystems: 1,
    room: room.id,
    resumeToken: first.welcome.resumeToken,
  });
  assert.ok(socket.last('welcome'));
  assert.equal(connection.member.domainBodyId, undefined);
  assert.equal(connection.room.systems.actors.get(game.bodyId), undefined);
  assert.equal(
    connection.room.systems.save().occupied.some(([id]: [string, string]) => id === member.id),
    false,
  );
  assert.deepEqual(socket.last('welcome').systems.location, entered.transition.to);
  restored.handle(connection, {
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'underworld-recover' },
  });
  assert.equal(socket.last('systems_result').ok, true);
  assert.equal(socket.last('systems_result').frame.location.spaceId, 'surface');
  assert.equal(connection.member.domainBodyId, undefined);
});
