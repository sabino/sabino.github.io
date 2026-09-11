import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStorePrice, hostedCheckoutUrl } from '../src/stichos/store-protocol.ts';

test('checkout navigation accepts only exact HTTPS Stripe checkout URLs', () => {
  assert.equal(
    hostedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'),
    'https://checkout.stripe.com/c/pay/cs_test_123',
  );
  for (const value of [
    null,
    {},
    '/checkout',
    'http://checkout.stripe.com/c/pay',
    'https://checkout.stripe.com.evil.test/c/pay',
    'https://checkout.stripe.com@evil.test/c/pay',
    'https://evil.test@checkout.stripe.com/c/pay',
    'https://checkout.stripe.com:8443/c/pay',
    'javascript:alert(1)',
    'data:text/html,checkout.stripe.com',
  ])
    assert.equal(hostedCheckoutUrl(value), null, String(value));
});

test('prices retain server minor-unit meaning including zero-decimal and Stripe special-case currencies', () => {
  assert.equal(formatStorePrice(1099, 'usd', 'en-US'), '$10.99');
  assert.equal(formatStorePrice(500, 'jpy', 'en-US'), '¥500');
  assert.match(formatStorePrice(500, 'isk', 'en-US')!, /5$/);
  assert.match(formatStorePrice(500, 'ugx', 'en-US')!, /5$/);
  assert.match(formatStorePrice(1045, 'huf', 'en-US')!, /10\.45$/);
  assert.match(formatStorePrice(1045, 'twd', 'en-US')!, /10\.45$/);
  for (const amount of [-1, NaN, Infinity, '900', 1.25, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(formatStorePrice(amount, 'usd'), null);
  for (const currency of [null, 'USDD', '<x>', ''])
    assert.equal(formatStorePrice(100, currency), null);
});
