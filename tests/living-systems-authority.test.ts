import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { appearance } from '../src/stichos/world.ts';
import { validLivingSystemsFrame, validLivingSystemsSave } from '../src/stichos/living-systems.ts';
import { validRoomWorldCheckpoint } from '../src/stichos/room-checkpoint.ts';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages: any[] = [];
  send(data: string) {
    this.messages.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  ping() {
    this.emit('pong');
  }
  get(type: string) {
    return this.messages.filter((m) => m.type === type).at(-1);
  }
}
const join = (hub: CoopRooms, extra: Record<string, unknown> = {}) => {
  const socket = new Socket(),
    connection = hub.attach(socket);
  hub.handle(connection, {
    type: 'join',
    protocol: 3,
    seed: 1,
    generation: 4,
    name: 'Field traveler',
    appearance: appearance(42, 'pilgrim', 1),
    position: { x: 0, y: 5 },
    ...extra,
  });
  return {
    socket,
    connection,
    welcome: socket.get('welcome'),
    send: (m: unknown) => hub.handle(connection, m),
  };
};
test('living systems capability is additive, authenticated, bounded and absent from public checkpoint', () => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const legacy = join(hub),
    modern = join(hub, { room: legacy.welcome.room, livingSystems: 1, livingWorld: 1 });
  assert.ok(modern.welcome);
  assert.equal(legacy.welcome.systems, undefined);
  assert.equal(modern.welcome.livingSystems, 1);
  assert.equal(validLivingSystemsFrame(modern.welcome.systems), true);
  const unjoined = new Socket(),
    connection = hub.attach(unjoined);
  hub.handle(connection, {
    type: 'systems',
    requestId: 'x',
    command: { kind: 'craft', recipeId: 'hatchet' },
  });
  assert.equal(unjoined.get('error').code, 'join_required');
  legacy.send({ type: 'systems', requestId: 'x', command: { kind: 'craft', recipeId: 'hatchet' } });
  assert.equal(legacy.socket.get('error').code, 'capability_required');
  now += 600;
  hub.tick(0.05);
  assert.equal(legacy.socket.get('systems_frame'), undefined);
  assert.equal(validLivingSystemsFrame(modern.socket.get('systems_frame').frame), true);
  const exported = hub.exportRoom(modern.welcome.room);
  assert.ok(validRoomWorldCheckpoint(exported.state));
  assert.equal(exported.state.systems, undefined);
  assert.ok(validLivingSystemsSave(exported.privateState.systems));
  assert.equal(JSON.stringify(exported.privateState.systems).includes('microphone'), false);
});
test('field crafting spends once, private life balances isolate peers and survive authenticated resume', () => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now, durable: true });
  const a = join(hub, {
    livingSystems: 1,
    livingWorld: 1,
    clientId: '11111111-1111-4111-8111-111111111111',
  });
  const b = join(hub, {
    room: a.welcome.room,
    livingSystems: 1,
    clientId: '22222222-2222-4222-8222-222222222222',
  });
  const request = {
    type: 'systems',
    requestId: 'r1',
    command: { kind: 'craft', recipeId: 'hatchet' },
  };
  a.send(request);
  const first = a.socket.get('systems_result');
  assert.equal(first.ok, true);
  assert.equal(first.frame.economy.satchel.items.hatchet, 1);
  a.send(request);
  assert.deepEqual(
    a.socket.get('systems_result').frame.economy.satchel,
    first.frame.economy.satchel,
  );
  a.send({ ...request, command: { kind: 'craft', recipeId: 'pickaxe' } });
  assert.equal(a.socket.get('error').code, 'request_reused');
  assert.equal(b.welcome.systems.economy.satchel.items.hatchet, undefined);
  a.send({ ...request, requestId: 'r2' });
  assert.equal(a.socket.get('systems_result').ok, false);
  now += 500;
  a.send({
    type: 'systems',
    requestId: 'r3',
    command: { kind: 'craft', recipeId: 'hatchet', coins: 10000 },
  });
  assert.equal(a.socket.get('error').code, 'invalid_systems');
  const before = hub.exportRoom(a.welcome.room);
  a.socket.close();
  b.socket.close();
  const restored = new CoopRooms({ now: () => now, durable: true });
  restored.restoreRoom(before.state, before.privateState);
  const resumed = join(restored, {
    room: a.welcome.room,
    livingSystems: 1,
    clientId: '11111111-1111-4111-8111-111111111111',
    resumeToken: a.welcome.resumeToken,
  });
  assert.ok(resumed.welcome);
  assert.equal(resumed.welcome.peerId, a.welcome.peerId);
  assert.equal(resumed.welcome.systems.economy.satchel.items.hatchet, 1);
  assert.equal(resumed.welcome.systems.economy.satchel.items.wood, 2);
});
