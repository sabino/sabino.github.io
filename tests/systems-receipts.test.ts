import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import {
  SystemsReceiptLedger,
  SYSTEMS_RECEIPT_RULES,
  validateSystemResult,
  validSystemsReceiptSnapshot,
} from '../src/stichos/systems-receipts.ts';

const current = { scope: 'room:ABCDEF:traveler-1', actorId: 'traveler-1', bodyId: 'body-a' };
const result = (sequence = 1, patch: Record<string, unknown> = {}) => ({
  ok: true,
  message: 'Rested at the refuge.',
  rest: { hpFraction: 0.2, staminaFraction: 0.6 },
  receipt: {
    scope: current.scope,
    actorId: current.actorId,
    targetBodyId: current.bodyId,
    sequence,
  },
  ...patch,
});

test('only the authenticated scope, actor, and body can apply a successful effect once', () => {
  const ledger = new SystemsReceiptLedger();
  assert.equal(ledger.accept(result(), { ...current, scope: 'room:OTHER:traveler-1' }), false);
  assert.equal(ledger.accept(result(), { ...current, actorId: 'traveler-2' }), false);
  assert.equal(
    ledger.snapshot().scopes.length,
    0,
    'cross-room/identity frames do not poison the floor',
  );
  assert.equal(ledger.accept(result(), current), true);
  assert.equal(ledger.accept(result(), current), false);
  assert.equal(ledger.accept(result(2), current), true);
  assert.equal(ledger.accept(result(1), current), false);
  assert.equal(ledger.accept({ ...result(3), ok: false, rest: undefined }, current), false);
  assert.equal(
    ledger.accept(result(3), current),
    true,
    'informational failed command did not consume a heal',
  );
});

test('late effects for a changed or dead body are spent without reviving or healing another life', () => {
  const ledger = new SystemsReceiptLedger();
  assert.equal(ledger.accept(result(1), { ...current, bodyId: 'body-b' }), false);
  assert.equal(
    ledger.accept(result(1), current),
    false,
    'returning to body A does not replay its spent effect',
  );
  assert.equal(ledger.accept(result(2), { ...current, allowEffects: false }), false);
  assert.equal(
    ledger.accept(result(2), current),
    false,
    'reviving later does not make the delayed heal eligible',
  );
  assert.equal(ledger.accept(result(3), current), true);
});

test('receipt floors survive save/reconnect and repeated restore cannot rewind or forget them', () => {
  const ledger = new SystemsReceiptLedger();
  assert.equal(ledger.accept(result(5), current), true);
  const saved = JSON.parse(JSON.stringify(ledger.snapshot()));
  const restored = new SystemsReceiptLedger(saved);
  assert.equal(restored.accept(result(5), current), false);
  assert.equal(restored.accept(result(6), current), true);
  assert.equal(restored.restore(saved), true);
  assert.equal(restored.accept(result(6), current), false);
  assert.equal(restored.restore({ version: 1, scopes: [] }), true);
  assert.equal(restored.accept(result(5), current), false);
  saved.scopes[0].sequence = 100;
  assert.equal(
    restored.accept(result(7), current),
    true,
    'snapshot mutation does not alter live receipt floors',
  );
  const before = restored.snapshot();
  assert.equal(
    restored.restore({ version: 1, scopes: [{ ...before.scopes[0], actorId: 'intruder' }] }),
    false,
  );
  assert.deepEqual(restored.snapshot(), before, 'invalid restore is atomic');
});

test('bounded scope storage never evicts a previously authenticated replay floor', () => {
  const ledger = new SystemsReceiptLedger();
  for (let i = 0; i < SYSTEMS_RECEIPT_RULES.maxScopes; i++) {
    const scope = `solo:${i}:1:traveler-1`;
    const entry = result(1, {
      receipt: { scope, actorId: current.actorId, targetBodyId: current.bodyId, sequence: 1 },
    });
    assert.equal(ledger.accept(entry, { ...current, scope }), true);
  }
  assert.equal(ledger.accept(result(), current), false, 'a new scope fails closed at capacity');
  const scope = 'solo:0:1:traveler-1';
  const entry = result(2, {
    receipt: { scope, actorId: current.actorId, targetBodyId: current.bodyId, sequence: 2 },
  });
  assert.equal(ledger.accept(entry, { ...current, scope }), true, 'existing scopes remain usable');
  assert.equal(
    ledger.accept({ ...entry, receipt: { ...entry.receipt, sequence: 1 } }, { ...current, scope }),
    false,
  );
  assert.equal(ledger.snapshot().scopes.length, SYSTEMS_RECEIPT_RULES.maxScopes);
  assert.equal(
    ledger.restore({
      version: 1,
      scopes: [{ scope: current.scope, actorId: current.actorId, sequence: 1 }],
    }),
    false,
  );
});

test('result validation rejects oversized, malformed, noncanonical, inherited and unbounded effects', () => {
  assert.equal(validateSystemResult(result()), true);
  assert.equal(
    validateSystemResult({ ok: false, message: 'Older server; no field features.' }),
    true,
  );
  assert.equal(
    new SystemsReceiptLedger().accept(
      { ok: true, message: 'Unsigned effect', rest: { hpFraction: 1, staminaFraction: 1 } },
      current,
    ),
    false,
  );
  const bad = [
    { ...result(), audio: 'not allowed' },
    { ...result(), rest: { hpFraction: Infinity, staminaFraction: 1 } },
    { ...result(), rest: { hpFraction: 1.01, staminaFraction: 1 } },
    { ...result(), rest: { hpFraction: -0.1, staminaFraction: 1 } },
    { ...result(), rest: { hpFraction: 0.1, staminaFraction: 0.1, mic: 'not allowed' } },
    { ...result(), wardSeconds: 301 },
    { ...result(), wardSeconds: NaN },
    { ...result(), health: -1 },
    { ...result(), damage: 1000001 },
    { ...result(), killed: 'yes' },
    { ...result(), message: 'x'.repeat(2001) },
    { ...result(), removed: Array.from({ length: 129 }, (_, i) => `tree-${i}`) },
    { ...result(), removed: ['tree-a', 'tree-a'] },
    { ...result(), opened: [null] },
    { ...result(), receipt: { ...result().receipt, sequence: 0 } },
    { ...result(), receipt: { ...result().receipt, sequence: 1.5 } },
    { ...result(), receipt: { ...result().receipt, sequence: Number.MAX_SAFE_INTEGER + 1 } },
    { ...result(), receipt: { ...result().receipt, scope: 'https://attacker.example/' } },
    { ...result(), receipt: { ...result().receipt, targetBodyId: '' } },
    { ...result(), receipt: { ...result().receipt, audio: 'not allowed' } },
    { ...result(), ok: false },
    Object.assign(Object.create({ legacy: true }), result()),
    [],
    null,
  ];
  for (const value of bad) assert.equal(validateSystemResult(value), false, JSON.stringify(value));
});

test('canonical floor transitions and recall metadata are identity-bound and bounded', () => {
  const transition = {
    actorId: current.actorId,
    from: { spaceId: 'underground:city:0', x: 8, y: 7 },
    to: { spaceId: 'surface', x: 120, y: -25 },
    reason: 'recall',
  };
  const recall = result(1, {
    rest: undefined,
    transition,
    recovery: { coinLoss: 4, cooldownUntil: 300 },
  });
  assert.equal(validateSystemResult(recall), true);
  assert.equal(new SystemsReceiptLedger().accept(recall, current), true);
  for (const patch of [
    { transition: { ...transition, actorId: 'other' } },
    { transition: { ...transition, to: { ...transition.to, spaceId: 'underground:city:9' } } },
    { transition: { ...transition, to: { ...transition.to, x: 1e7 } } },
    { transition: { ...transition, to: { ...transition.to, audio: 'not allowed' } } },
    { transition: { ...transition, reason: 'warp-anywhere' } },
    { transition: { ...transition, reason: 'enter' } },
    { recovery: { coinLoss: -1, cooldownUntil: 300 } },
    { recovery: { coinLoss: 0.5, cooldownUntil: 300 } },
    { recovery: { coinLoss: 4, cooldownUntil: Infinity } },
    { recovery: { coinLoss: 4, cooldownUntil: 300, audio: 'not allowed' } },
  ])
    assert.equal(validateSystemResult({ ...recall, ...patch }), false, JSON.stringify(patch));
});

test('strict saved receipt schema rejects unknown/private payloads and ambiguous owner scopes', () => {
  const scope = { scope: current.scope, actorId: current.actorId, sequence: 2 };
  const saved = { version: 1 as const, scopes: [scope] };
  assert.equal(validSystemsReceiptSnapshot(saved), true);
  for (const bad of [
    { ...saved, audio: 'not allowed' },
    { ...saved, version: 2 },
    { ...saved, scopes: [scope, scope] },
    { ...saved, scopes: [{ ...scope, microphone: 'not allowed' }] },
    { ...saved, scopes: [{ ...scope, sequence: 0 }] },
    { ...saved, scopes: [{ ...scope, sequence: NaN }] },
    { ...saved, scopes: [Object.assign(Object.create({ shared: true }), scope)] },
    { ...saved, scopes: Array(33).fill(scope) },
    Object.assign(Object.create({ extra: true }), saved),
  ]) {
    assert.equal(validSystemsReceiptSnapshot(bad), false);
    assert.throws(
      () => new SystemsReceiptLedger(bad as typeof saved),
      /Invalid systems receipt ledger/,
    );
  }
});

test('actual session heals once across save/restore and spends delayed effects for dead or changed bodies', () => {
  const game = new Stichos(1);
  game.phase = 'playing';
  game.dialogue = null;
  game.enableLivingSystems('receipt-life');
  game.player.hp = game.player.maxHp * 0.1;
  const scope = `solo:${game.seed}:${game.world.generation}:receipt-life`;
  const effect = (sequence: number, bodyId = game.bodyId) =>
    result(sequence, {
      receipt: { scope, actorId: 'receipt-life', targetBodyId: bodyId, sequence },
    });
  const before = game.player.hp;
  game.commitFieldResult(effect(1));
  assert.equal(game.player.hp, before + game.player.maxHp * 0.2);
  const once = game.player.hp;
  game.commitFieldResult(effect(1));
  assert.equal(game.player.hp, once);
  const restored = Stichos.restore(game.save());
  restored.enableLivingSystems('receipt-life');
  restored.commitFieldResult(effect(1));
  assert.equal(restored.player.hp, once, 'save/restore cannot replay the rest effect');
  restored.commitFieldResult(effect(2, 'previous-body'));
  assert.equal(restored.player.hp, once);
  restored.commitFieldResult(effect(2));
  assert.equal(restored.player.hp, once, 'wrong-body receipt is already spent');
  restored.phase = 'lost';
  restored.player.hp = 0;
  restored.commitFieldResult(effect(3));
  assert.equal(restored.player.hp, 0, 'a delayed heal cannot revive death');
  restored.phase = 'playing';
  restored.player.hp = 1;
  restored.commitFieldResult(effect(3));
  assert.equal(restored.player.hp, 1, 'a later revival does not resurrect the spent effect');
  restored.commitFieldResult(effect(4));
  assert.equal(restored.player.hp, 1 + restored.player.maxHp * 0.2);
  const corrupt = restored.save();
  corrupt.fieldReceipts.scopes[0].audio = 'not permitted in a save';
  assert.throws(() => Stichos.restore(corrupt));
});

test('an old room acknowledgement cannot heal the same body after its game changes authority', () => {
  const game = new Stichos(1);
  game.phase = 'playing';
  game.dialogue = null;
  game.enableLivingSystems('receipt-life');
  const frame = structuredClone(game.livingSystemsFrame!);
  game.applySystemsFrame(frame, 'first-life', 'FIRST');
  const oldOrigin = { scope: 'room:FIRST:first-life', actorId: 'first-life' };
  const ack = result(1, { receipt: { ...oldOrigin, targetBodyId: game.bodyId, sequence: 1 } });
  game.applySystemsFrame(frame, 'second-life', 'SECOND');
  game.player.hp = 1;
  game.commitFieldResult(ack, oldOrigin);
  assert.equal(
    game.player.hp,
    1,
    'captured previous origin is not the current authenticated authority',
  );
  const origin = { scope: 'room:SECOND:second-life', actorId: 'second-life' };
  game.commitFieldResult(
    result(1, { receipt: { ...origin, targetBodyId: game.bodyId, sequence: 1 } }),
    origin,
  );
  assert.equal(game.player.hp, 1 + game.player.maxHp * 0.2);
});
