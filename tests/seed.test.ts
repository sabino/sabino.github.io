import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed, formatSeed, DEFAULT_SEED } from '../src/seed.ts';
test('seed inputs round trip numeric values, including zero and the maximum', () => {
  for (const value of [0, 1, DEFAULT_SEED, 0xffffffff]) {
    assert.equal(parseSeed(formatSeed(value)), value);
    assert.equal(parseSeed(String(value)), value);
  }
  assert.equal(parseSeed('  0X71a3  '), DEFAULT_SEED);
  assert.equal(parseSeed(''), DEFAULT_SEED);
});
test('named worlds are stable, bounded, and normalize equivalent Unicode', () => {
  assert.equal(parseSeed('the quiet verge'), parseSeed('the quiet verge'));
  assert.notEqual(parseSeed('the quiet verge'), parseSeed('another world'));
  assert.equal(parseSeed('café'), parseSeed('cafe\u0301'));
  assert.ok(parseSeed('🌿') >= 0 && parseSeed('🌿') <= 0xffffffff);
  assert.equal(parseSeed('a'.repeat(80)), parseSeed('a'.repeat(64)));
});
