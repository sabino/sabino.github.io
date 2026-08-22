import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedOrigin, validateContactPayload } from '../src/index.js';

test('origin allowlist requires an exact match', () => {
  const configured = 'https://sabino.pro,http://127.0.0.1:4173';
  assert.equal(isAllowedOrigin('https://sabino.pro', configured), true);
  assert.equal(isAllowedOrigin('https://sabino.pro.attacker.test', configured), false);
  assert.equal(isAllowedOrigin('', configured), false);
});

test('payload validation normalizes valid fields', () => {
  const { payload, errors } = validateContactPayload({
    name: '  Ada Lovelace  ',
    email: '  ADA@EXAMPLE.COM ',
    message: 'A sufficiently detailed description of a real system problem.',
    language: 'en',
    turnstileToken: 'token',
  });
  assert.deepEqual(errors, []);
  assert.equal(payload.name, 'Ada Lovelace');
  assert.equal(payload.email, 'ada@example.com');
});

test('payload validation rejects missing or undersized fields', () => {
  const { errors } = validateContactPayload({ name: 'x', email: 'bad', message: 'short' });
  assert.deepEqual(errors, ['name', 'email', 'message', 'turnstile']);
});
