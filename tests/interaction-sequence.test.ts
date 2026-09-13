import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionSequenceLedger } from '../src/stichos/interaction-sequence.ts';

test('a pointerdown action cannot also activate Leave after dialogue replaces its owner', () => {
  const ledger = new InteractionSequenceLedger<object>();
  const interact = {},
    leave = {};
  ledger.begin(1, interact);
  assert.equal(ledger.claim(1, interact), true);
  ledger.transition();
  assert.equal(ledger.permitsRelease(1, leave), false);
  ledger.finish(1);
  assert.equal(ledger.click(1, leave), false);
  assert.equal(ledger.click(1, interact), false);
  assert.equal(ledger.diagnostics.rejected, 2);
});
test('click-driven choices have exactly one action and replacement nodes never inherit ownership', () => {
  const ledger = new InteractionSequenceLedger<object>();
  const choice = {};
  ledger.begin(3, choice);
  ledger.finish(3);
  assert.equal(ledger.click(3, {}), false);
  assert.equal(ledger.click(3, choice), true);
  assert.equal(ledger.click(3, choice), false);
});
test('touch compatibility clicks without pointer ids use the completed physical sequence', () => {
  const ledger = new InteractionSequenceLedger<string>();
  ledger.begin(6, 'PTT');
  ledger.claim(6, 'PTT');
  ledger.finish(6);
  assert.equal(ledger.click(null, 'Enable mic'), false);
  ledger.begin(7, 'Enable mic');
  ledger.finish(7);
  assert.equal(ledger.click(null, 'Enable mic'), true);
});
test('simultaneous movement and attack retain separate owners and transition cancels both', () => {
  const ledger = new InteractionSequenceLedger<string>();
  ledger.begin(11, 'stick');
  ledger.begin(12, 'attack');
  assert.equal(ledger.claim(11, 'attack'), false);
  assert.equal(ledger.claim(11, 'stick'), true);
  assert.equal(ledger.claim(12, 'attack'), true);
  ledger.transition();
  assert.equal(ledger.permitsRelease(11, 'stick'), false);
  assert.equal(ledger.permitsRelease(12, 'attack'), false);
  ledger.finish(11);
  ledger.finish(12);
  assert.equal(ledger.click(12, 'attack'), false);
  assert.equal(ledger.diagnostics.active, 0);
});
test('cancelled contact cannot activate an overlay and a fresh rapid tap is immediately valid', () => {
  const ledger = new InteractionSequenceLedger<string>();
  ledger.begin(20, 'interact');
  ledger.finish(20, true);
  assert.equal(ledger.click(20, 'interact'), false);
  for (let id = 21; id < 1000; id++) {
    ledger.begin(id, 'choice');
    assert.equal(ledger.permitsRelease(id, 'choice'), true);
    ledger.finish(id);
    assert.equal(ledger.click(id, 'choice'), true);
    ledger.transition();
  }
  assert.equal(ledger.diagnostics.active, 0);
  assert.ok(ledger.diagnostics.pending <= 16);
});
test('pointer id reuse starts a new gesture while duplicate downs cannot steal a held pointer', () => {
  const ledger = new InteractionSequenceLedger<string>();
  assert.equal(ledger.begin(1, 'attack'), true);
  assert.equal(ledger.begin(1, 'PTT'), false);
  assert.equal(ledger.claim(1, 'attack'), true);
  ledger.finish(1);
  assert.equal(ledger.begin(1, 'Leave'), true);
  ledger.finish(1);
  assert.equal(ledger.click(1, 'Leave'), true);
  ledger.clear();
  assert.deepEqual(
    { active: ledger.diagnostics.active, pending: ledger.diagnostics.pending },
    { active: 0, pending: 0 },
  );
});
test('missing terminal events are bounded and a lifecycle reset permits input again', () => {
  const ledger = new InteractionSequenceLedger<string>();
  for (let i = 0; i < 16; i++) assert.equal(ledger.begin(i, `control-${i}`), true);
  assert.equal(ledger.begin(17, 'extra'), false);
  assert.equal(ledger.diagnostics.active, 16);
  ledger.clear();
  assert.equal(ledger.begin(17, 'fresh'), true);
  ledger.finish(17);
  assert.equal(ledger.click(17, 'fresh'), true);
});
