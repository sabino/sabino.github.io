import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStoreHandler, verifyStripeSignature } from '../server/payments.mjs';

const origin = 'http://localhost:4173';
const webhookSecret = 'whsec_unit_test_only';
const timestamp = 1789099000000;
function signed(payload: unknown, secret = webhookSecret, at = timestamp) {
  const raw = JSON.stringify(payload),
    seconds = Math.floor(at / 1000);
  return {
    raw,
    signature: `t=${seconds},v1=${createHmac('sha256', secret).update(`${seconds}.${raw}`).digest('hex')}`,
  };
}
async function fixture(t: any, enabled = true) {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'verso-payment-test-'));
  const requests: { url: string; body: URLSearchParams }[] = [];
  const env = {
    VERSO_PAYMENTS_ENABLED: String(enabled),
    VERSO_PUBLIC_ORIGIN: origin,
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    STRIPE_PRICE_AURORA_MANTLE: 'price_aurora',
    STRIPE_PRICE_PROMETHEAN_GOLD: 'price_gold',
    STRIPE_PRICE_SALLAS_SILVER: 'price_silver',
  };
  const fetchStripe = async (url: string, options: any) => {
    if (url.includes('/prices/'))
      return Response.json({
        active: true,
        type: 'one_time',
        livemode: false,
        unit_amount: 500,
        currency: 'brl',
      });
    requests.push({ url, body: new URLSearchParams(options.body) });
    return Response.json({
      id: `cs_test_${requests.length}`,
      url: `https://checkout.stripe.com/c/pay/test_${requests.length}`,
      expires_at: timestamp / 1000 + 3600,
    });
  };
  let handle = createStoreHandler({ env, storageDir, fetchStripe, now: () => timestamp });
  const server = createServer((req, res) => {
    void handle(req, res).then((handled) => {
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(storageDir, { recursive: true, force: true });
  });
  const walletResponse = await fetch(`${base}/api/store/wallet`, { headers: { Origin: origin } });
  const cookie = walletResponse.headers.get('set-cookie')!.split(';')[0];
  assert.match(walletResponse.headers.get('set-cookie')!, /HttpOnly/);
  const wallet = await walletResponse.json();
  async function checkout(extra = {}, headers = {}) {
    return fetch(`${base}/api/store/checkout`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-Verso-CSRF': wallet.csrf,
        ...headers,
      },
      body: JSON.stringify({ skinId: 'aurora-mantle', ...extra }),
    });
  }
  function completion(requestIndex = 0, overrides = {}) {
    const values = requests[requestIndex].body;
    return {
      id: `evt_${requestIndex}`,
      livemode: false,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${requestIndex + 1}`,
          payment_status: 'paid',
          client_reference_id: values.get('client_reference_id'),
          currency: 'brl',
          amount_total: 500,
          payment_intent: 'pi_verified_test',
          metadata: {
            walletId: values.get('metadata[walletId]'),
            orderId: values.get('metadata[orderId]'),
            skinId: values.get('metadata[skinId]'),
          },
          ...overrides,
        },
      },
    };
  }
  async function webhook(event: unknown, secret = webhookSecret) {
    const value = signed(event, secret);
    return fetch(`${base}/api/store/webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': value.signature },
      body: value.raw,
    });
  }
  async function owned() {
    return (
      await (
        await fetch(`${base}/api/store/wallet`, { headers: { Origin: origin, Cookie: cookie } })
      ).json()
    ).entitlements;
  }
  return {
    base,
    env,
    cookie,
    wallet,
    requests,
    checkout,
    completion,
    webhook,
    owned,
    reload() {
      handle = createStoreHandler({ env, storageDir, fetchStripe, now: () => timestamp });
    },
  };
}

test('Stripe signature verification uses exact raw bytes, bounded timestamp and constant-time digest', () => {
  const { raw, signature } = signed({ paid: true });
  assert.equal(verifyStripeSignature(raw, signature, webhookSecret, timestamp), true);
  assert.equal(verifyStripeSignature(raw + ' ', signature, webhookSecret, timestamp), false);
  assert.equal(verifyStripeSignature(raw, signature, 'wrong', timestamp), false);
  assert.equal(verifyStripeSignature(raw, signature, webhookSecret, timestamp + 301000), false);
  assert.equal(verifyStripeSignature(raw, 't=NaN,v1=000', webhookSecret, timestamp), false);
  assert.equal(
    verifyStripeSignature(
      raw,
      `t=${timestamp / 1000},v1=${'a'.repeat(64)},${signature.split(',')[1]}`,
      webhookSecret,
      timestamp,
    ),
    true,
  );
});
test('an unconfigured store never contacts Stripe or starts a paid checkout', async (t) => {
  const f = await fixture(t, false);
  const catalog = await (await fetch(`${f.base}/api/store/catalog`)).json();
  assert.equal(catalog.enabled, false);
  assert.ok(catalog.skins.every((skin: any) => !skin.available && skin.amount === null));
  assert.equal((await f.checkout()).status, 503);
  assert.equal(f.requests.length, 0);
  assert.deepEqual(await f.owned(), []);
});
test('checkout requires same-origin CSRF and chooses the price from the server catalog', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.checkout({}, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await f.checkout({}, { 'X-Verso-CSRF': 'invented' })).status, 403);
  assert.equal((await f.checkout({ skinId: 'invented-skin' })).status, 400);
  const result = await f.checkout({ amount: 1, price: 'price_attacker' });
  assert.equal(result.status, 200);
  assert.equal(f.requests[0].body.get('line_items[0][price]'), 'price_aurora');
  assert.equal(f.requests[0].body.get('line_items[0][quantity]'), '1');
  assert.deepEqual(await f.owned(), [], 'creating or visiting checkout does not grant ownership');
});
test('simultaneous retries reuse one pending checkout and cannot grant outfits from redirect data', async (t) => {
  const f = await fixture(t);
  const responses = await Promise.all([f.checkout(), f.checkout()]);
  const values = await Promise.all(responses.map((r) => r.json()));
  assert.equal(values[0].url, values[1].url);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(await f.owned(), []);
  const fake = await fetch(`${f.base}/api/store/wallet?store=success&skinId=aurora-mantle`, {
    headers: { Cookie: f.cookie },
  });
  assert.deepEqual((await fake.json()).entitlements, []);
});
test('only a signed paid session matching a created order grants one durable entitlement', async (t) => {
  const f = await fixture(t);
  await f.checkout();
  assert.equal((await f.webhook(f.completion(), 'wrong-secret')).status, 400);
  assert.equal((await f.webhook(f.completion(0, { amount_total: 1 }))).status, 400);
  assert.equal((await f.webhook(f.completion(0, { id: 'cs_forged' }))).status, 400);
  await f.webhook(f.completion(0, { payment_status: 'unpaid' }));
  assert.deepEqual(await f.owned(), []);
  assert.equal((await f.webhook(f.completion())).status, 200);
  assert.equal((await f.webhook(f.completion())).status, 200);
  assert.deepEqual(await f.owned(), ['aurora-mantle']);
  f.reload();
  assert.deepEqual(await f.owned(), ['aurora-mantle']);
  assert.deepEqual(await (await f.checkout()).json(), { owned: true });
  assert.equal(f.requests.length, 1);
});
test('a verified full refund revokes the matching cosmetic without changing another wallet', async (t) => {
  const f = await fixture(t);
  await f.checkout();
  await f.webhook(f.completion());
  await f.webhook({
    id: 'evt_refund',
    livemode: false,
    type: 'charge.refunded',
    data: { object: { payment_intent: 'pi_verified_test', refunded: true } },
  });
  assert.deepEqual(await f.owned(), []);
  const other = await fetch(`${f.base}/api/store/wallet`);
  assert.deepEqual((await other.json()).entitlements, []);
});
test('out-of-order and repeated paid webhooks cannot restore a fully refunded outfit', async (t) => {
  const f = await fixture(t);
  await f.checkout();
  const refund = {
    id: 'evt_early_refund',
    livemode: false,
    type: 'charge.refunded',
    data: { object: { payment_intent: 'pi_verified_test', refunded: true } },
  };
  assert.equal((await f.webhook(refund)).status, 200);
  assert.equal((await f.webhook(f.completion())).status, 200);
  const late = {
    ...f.completion(),
    id: 'evt_late_async',
    type: 'checkout.session.async_payment_succeeded',
  };
  assert.equal((await f.webhook(late)).status, 200);
  assert.deepEqual(await f.owned(), []);
  f.reload();
  assert.deepEqual(await f.owned(), []);
});
