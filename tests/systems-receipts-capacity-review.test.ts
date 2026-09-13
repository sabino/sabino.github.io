import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { SYSTEMS_RECEIPT_RULES } from '../src/stichos/systems-receipts.ts';

function fullReceiptLife(rememberSolo = false) {
  const game = new Stichos(1);
  game.phase = 'playing';
  game.dialogue = null;
  game.enableLivingSystems('capacity-review');
  const save = game.save();
  save.player.hp = 10;
  save.livingSystems!.economy.satchels[0].items.bandage = 1;
  save.fieldReceipts = {
    version: 1,
    scopes: Array.from({ length: SYSTEMS_RECEIPT_RULES.maxScopes }, (_, i) => ({
      scope:
        rememberSolo && i === 0
          ? `solo:${game.seed}:${game.world.generation}:capacity-review`
          : `room:REMEMBERED${i}:capacity-review`,
      actorId: 'capacity-review',
      sequence: 1,
    })),
  };
  const restored = Stichos.restore(save);
  restored.enableLivingSystems('capacity-review');
  return restored;
}

test('independent review: a full receipt ledger refuses a new scope before consuming an owned bandage', () => {
  const game = fullReceiptLife();
  const before = game.save();
  const result = game.fieldCommand({ kind: 'consume', item: 'bandage' });
  assert.equal(result.ok, false);
  assert.match(result.message, /limit|remembered/i);
  assert.equal(game.player.hp, 10);
  const after = game.save();
  assert.deepEqual(after.livingSystems!.economy, before.livingSystems!.economy);
  assert.deepEqual(after.fieldReceipts, before.fieldReceipts, 'never evict replay floors');
  assert.equal(after.fieldSerial, before.fieldSerial, 'reject before executing the command');
});

test('independent review: existing authenticated room scopes remain available at capacity', () => {
  const game = fullReceiptLife();
  const frame = structuredClone(game.livingSystemsFrame!);
  game.applySystemsFrame(frame, 'capacity-review', 'REMEMBERED0');
  assert.equal(
    game.fieldEffectAvailability(
      { kind: 'consume', item: 'bandage' },
      { scope: 'room:REMEMBERED0:capacity-review', actorId: 'capacity-review' },
    ).ok,
    true,
  );
  game.applySystemsFrame(frame, 'capacity-review', 'NEWROOM');
  assert.equal(
    game.fieldEffectAvailability(
      { kind: 'consume', item: 'bandage' },
      { scope: 'room:NEWROOM:capacity-review', actorId: 'capacity-review' },
    ).ok,
    false,
  );
  assert.equal(
    game.fieldEffectAvailability(
      { kind: 'consume', item: 'bandage' },
      { scope: 'room:REMEMBERED0:capacity-review', actorId: 'capacity-review' },
    ).ok,
    false,
    'remembering an old room does not authorize effects after switching rooms',
  );
  assert.equal(game.fieldEffectAvailability({ kind: 'underworld-recover' }).ok, true);
});

test('independent review: a dead body cannot spend restorative supplies', () => {
  const game = fullReceiptLife(true);
  game.player.hp = 0;
  game.phase = 'lost';
  const before = game.save().livingSystems!.economy;
  const result = game.fieldCommand({ kind: 'consume', item: 'bandage' });
  assert.equal(result.ok, false);
  assert.equal(game.player.hp, 0);
  assert.deepEqual(game.save().livingSystems!.economy, before);
});
