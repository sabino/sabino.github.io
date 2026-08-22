import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedOrigin, validateContactPayload, verifyTurnstile } from '../src/index.js';

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

test('payload validation rejects oversized Turnstile tokens', () => {
  const { errors } = validateContactPayload({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'A sufficiently detailed description of a real system problem.',
    turnstileToken: 'x'.repeat(2049),
  });
  assert.deepEqual(errors, ['turnstile']);
});

test('payload validation accepts the documented Turnstile token boundary', () => {
  const { errors } = validateContactPayload({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'A sufficiently detailed description of a real system problem.',
    turnstileToken: 'x'.repeat(2048),
  });
  assert.deepEqual(errors, []);
});

const turnstileRequest = new Request('https://contact.sabino.pro/contact', {
  headers: { 'CF-Connecting-IP': '203.0.113.5' },
});

const turnstileEnv = {
  TURNSTILE_SECRET_KEY: 'secret',
  TURNSTILE_SITE_KEY: 'sitekey',
  ALLOWED_TURNSTILE_HOSTNAMES: 'sabino.pro,www.sabino.pro',
};

const turnstileResponse = (body) => async () => Response.json(body);

test('Turnstile verification requires the exact action and hostname', async () => {
  const malformedResult = await verifyTurnstile(
    turnstileRequest,
    turnstileEnv,
    'token',
    turnstileResponse(null),
  );
  assert.equal(malformedResult.reason, 'challenge-failed');

  const missingAction = await verifyTurnstile(turnstileRequest, turnstileEnv, 'token', turnstileResponse({
    success: true,
    hostname: 'sabino.pro',
  }));
  assert.equal(missingAction.reason, 'action-mismatch');

  const missingHostname = await verifyTurnstile(turnstileRequest, turnstileEnv, 'token', turnstileResponse({
    success: true,
    action: 'contact',
  }));
  assert.equal(missingHostname.reason, 'hostname-mismatch');

  const unexpectedHostname = await verifyTurnstile(turnstileRequest, turnstileEnv, 'token', turnstileResponse({
    success: true,
    action: 'contact',
    hostname: 'attacker.test',
  }));
  assert.equal(unexpectedHostname.reason, 'hostname-mismatch');
});

test('Turnstile verification accepts an approved action and hostname', async () => {
  const result = await verifyTurnstile(turnstileRequest, turnstileEnv, 'token', turnstileResponse({
    success: true,
    action: 'contact',
    hostname: 'sabino.pro',
  }));
  assert.deepEqual(result, { success: true, hostname: 'sabino.pro' });
});

test('Turnstile verification fails closed on upstream failures', async () => {
  const thrown = await verifyTurnstile(turnstileRequest, turnstileEnv, 'token', async () => {
    throw new Error('network');
  });
  assert.equal(thrown.reason, 'verification-unavailable');

  const nonSuccessful = await verifyTurnstile(
    turnstileRequest,
    turnstileEnv,
    'token',
    async () => new Response('', { status: 503 }),
  );
  assert.equal(nonSuccessful.reason, 'verification-unavailable');

  const invalidJson = await verifyTurnstile(
    turnstileRequest,
    turnstileEnv,
    'token',
    async () => new Response('not json', { status: 200 }),
  );
  assert.equal(invalidJson.reason, 'verification-unavailable');
});
