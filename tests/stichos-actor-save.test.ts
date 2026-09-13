import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { ActorLedger } from '../src/stichos/actor-ledger.ts';
import type { Npc } from '../src/stichos/types.ts';

function migratedWitness() {
  const game = new Stichos(734019);
  game.phase = 'playing';
  game.dialogue = null;
  const runtime = game as unknown as {
    actors: ActorLedger<Npc>;
    occupiedNpcId?: string;
    calendarSeconds: number;
    rememberNpc(npc: Npc): void;
  };
  const witness = game.npcs.find((n) => !n.hostile && n.id !== runtime.occupiedNpcId)!;
  assert.ok(witness);
  witness.hp--;
  runtime.rememberNpc(witness);
  const origin = witness.x;
  runtime.actors.setDestination(witness.id, {
    spaceId: 'surface',
    x: origin + 50,
    y: witness.y,
  });
  // The coarse ledger owns this culled witness; a deterministic open navigation
  // fixture isolates save precedence from surface geometry and player rendering.
  game.npcs = game.npcs.filter((n) => n.id !== witness.id);
  for (let time = 1; time <= 1000; time++)
    runtime.actors.advance(time, () => ({ cell: () => ({ kind: 'open' }) }));
  runtime.calendarSeconds = 1000;
  game.time = 1000;
  const record = runtime.actors.get(witness.id)!;
  assert.equal(record.state, 'arrived');
  assert.ok(record.x > origin + 49);
  return { game, witness, record };
}

test('saving a consequential offscreen migrant preserves its latest actor location and destination', () => {
  const { game, witness, record } = migratedWitness();
  const save = game.save();
  const memory = save.npcs.find((n) => n.id === witness.id)!;
  const persistent = save.actorLedger.actors.find((n) => n.id === witness.id)!;
  assert.equal(memory.x, record.x);
  assert.equal(memory.y, record.y);
  assert.equal(memory.hp, witness.hp);
  assert.equal(persistent.x, record.x);
  const restored = Stichos.restore(save).save();
  const after = restored.actorLedger.actors.find((n) => n.id === witness.id)!;
  assert.equal(after.x, record.x);
  assert.equal(after.y, record.y);
  assert.equal(after.body.hp, witness.hp);
  assert.deepEqual(after.destination, record.destination);
  assert.equal(after.revision, persistent.revision);
});

test('explicit legacy NPC edits still override the matching actor overlay during restore', () => {
  const { game, witness } = migratedWitness();
  const save = game.save();
  const edited = save.npcs.find((n) => n.id === witness.id)!;
  edited.x += 0.2;
  edited.hp--;
  const restored = Stichos.restore(save).save();
  const record = restored.actorLedger.actors.find((n) => n.id === witness.id)!;
  assert.equal(record.x, edited.x);
  assert.equal(record.body.hp, edited.hp);
  assert.equal(restored.npcs.find((n) => n.id === witness.id)!.x, edited.x);
});
