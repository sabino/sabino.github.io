import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PREMIUM_SKINS = Object.freeze([
  {
    id: 'aurora-mantle',
    name: 'Aurora Mantle',
    description: 'A northern-light coat and silver-green trim.',
    priceEnv: 'STRIPE_PRICE_AURORA_MANTLE',
  },
  {
    id: 'promethean-gold',
    name: 'Promethean Gold',
    description: 'Warm ceremonial gold over a deep ember coat.',
    priceEnv: 'STRIPE_PRICE_PROMETHEAN_GOLD',
  },
  {
    id: 'sallas-silver',
    name: 'Sallas Silver',
    description: 'Moonlit slate with restrained silver details.',
    priceEnv: 'STRIPE_PRICE_SALLAS_SILVER',
  },
]);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const cookieName = 'verso_wallet';
const safeEqual = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Stripe signs the exact raw body, not a parsed/re-serialized JSON object. */
export function verifyStripeSignature(raw, header, signingSecret, now = Date.now()) {
  if (!signingSecret || typeof header !== 'string') return false;
  const fields = header.split(',').map((part) => part.trim().split('='));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
    return false;
  const expected = createHmac('sha256', signingSecret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest('hex');
  return fields.some(
    ([key, value]) =>
      key === 'v1' && /^[a-f0-9]{64}$/.test(value ?? '') && safeEqual(expected, value),
  );
}

async function body(req, limit = 65536) {
  const parts = [];
  let bytes = 0;
  for await (const part of req) {
    bytes += part.length;
    if (bytes > limit) throw Object.assign(Error('Request is too large.'), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}
function reply(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

/** Prepared checkout integration. No purchase endpoint is active without explicit server configuration.
 * The wallet is a private HttpOnly browser credential; save files cannot grant paid ownership.
 * Single-process durable storage is intentional for this local build. See docs/stichos/PAYMENTS.md.
 */
export function createStoreHandler({
  env = process.env,
  storageDir = path.resolve('.verso-server/payments'),
  fetchStripe = globalThis.fetch,
  now = Date.now,
} = {}) {
  const origin = env.VERSO_PUBLIC_ORIGIN || 'http://localhost:4173';
  const publicUrl = new URL(origin);
  const live = String(env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
  const enabled =
    env.VERSO_PAYMENTS_ENABLED === 'true' &&
    !!env.STRIPE_SECRET_KEY &&
    !!env.STRIPE_WEBHOOK_SECRET &&
    (!live || publicUrl.protocol === 'https:');
  const allowedOrigins = new Set([publicUrl.origin]);
  if (!live) {
    allowedOrigins.add('http://localhost:4173');
    allowedOrigins.add('http://localhost:4174');
  }
  const file = path.join(storageDir, 'wallets.json');
  let database, loading;
  let storageFailed = false;
  let queue = Promise.resolve();
  const prices = new Map(),
    inFlight = new Map(),
    attempts = new Map();
  async function load() {
    if (database) return database;
    if (!loading)
      loading = (async () => {
        try {
          const parsed = JSON.parse(await readFile(file, 'utf8'));
          if (parsed.version !== 1 || !parsed.wallets || !Array.isArray(parsed.events))
            throw Error('Invalid purchase ledger.');
          parsed.refundedIntents ??= [];
          return (database = parsed);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          return (database = { version: 1, wallets: {}, events: [], refundedIntents: [] });
        }
      })();
    return loading;
  }
  async function persist() {
    try {
      await mkdir(storageDir, { recursive: true, mode: 0o700 });
      await writeFile(`${file}.tmp`, JSON.stringify(database), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    } catch (error) {
      // Never expose an entitlement which failed to reach durable storage.
      // Restart after storage is repaired; the last atomic ledger remains intact.
      storageFailed = true;
      throw error;
    }
  }
  function transaction(operation) {
    const next = queue.then(async () => {
      await load();
      const value = await operation();
      await persist();
      return value;
    });
    queue = next.catch(() => {});
    return next;
  }
  async function wallet(req, res) {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    const db = await load();
    if (token && /^[a-f0-9]{64}$/.test(token) && db.wallets[hash(token)])
      return db.wallets[hash(token)];
    return transaction(() => {
      const credential = secret();
      const record = { id: secret(), csrf: secret(), entitlements: [], orders: {} };
      db.wallets[hash(credential)] = record;
      res.setHeader(
        'Set-Cookie',
        `${cookieName}=${credential}; Path=/api/store; HttpOnly; SameSite=Lax; Max-Age=31536000${publicUrl.protocol === 'https:' ? '; Secure' : ''}`,
      );
      return record;
    });
  }
  async function stripe(route, init = {}) {
    const response = await fetchStripe(`https://api.stripe.com/v1/${route}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...init.headers },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok)
      throw Object.assign(Error('The payment provider could not complete this request.'), {
        status: 502,
      });
    return response.json();
  }
  async function price(skin) {
    const priceId = env[skin.priceEnv];
    if (!priceId || !/^price_[a-zA-Z0-9]+$/.test(priceId)) return null;
    const previous = prices.get(priceId);
    if (previous && now() - previous.fetched < 60000) return previous;
    const result = await stripe(`prices/${priceId}`);
    if (
      !result.active ||
      result.type !== 'one_time' ||
      result.livemode !== live ||
      !Number.isSafeInteger(result.unit_amount) ||
      result.unit_amount <= 0 ||
      !/^[a-z]{3}$/.test(result.currency)
    )
      return null;
    const value = {
      id: priceId,
      amount: result.unit_amount,
      currency: result.currency,
      fetched: now(),
    };
    prices.set(priceId, value);
    return value;
  }
  async function checkout(record, skin) {
    const key = record.id + ':' + skin.id;
    if (inFlight.has(key)) return inFlight.get(key);
    const task = (async () => {
      if (record.entitlements.includes(skin.id)) return { owned: true };
      const previous = Object.values(record.orders).find(
        (order) =>
          order.skinId === skin.id &&
          order.status === 'pending' &&
          order.url &&
          order.expires > now(),
      );
      if (previous) return { url: previous.url };
      const cost = await price(skin);
      if (!cost)
        throw Object.assign(Error('This outfit is currently unavailable.'), { status: 503 });
      const orderId = secret();
      await transaction(() => {
        record.orders[orderId] = {
          skinId: skin.id,
          priceId: cost.id,
          amount: cost.amount,
          currency: cost.currency,
          status: 'creating',
          created: now(),
        };
      });
      const data = new URLSearchParams({
        mode: 'payment',
        'line_items[0][price]': cost.id,
        'line_items[0][quantity]': '1',
        client_reference_id: record.id,
        'metadata[walletId]': record.id,
        'metadata[orderId]': orderId,
        'metadata[skinId]': skin.id,
        success_url: new URL('?store=success', publicUrl).href,
        cancel_url: new URL('?store=cancelled', publicUrl).href,
      });
      const session = await stripe('checkout/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': orderId,
        },
        body: data.toString(),
      });
      if (
        typeof session.id !== 'string' ||
        typeof session.url !== 'string' ||
        !session.url.startsWith('https://checkout.stripe.com/')
      )
        throw Error('Invalid checkout response.');
      await transaction(() => {
        Object.assign(record.orders[orderId], {
          status: 'pending',
          sessionId: session.id,
          url: session.url,
          expires: Number.isFinite(session.expires_at)
            ? session.expires_at * 1000
            : now() + 1800000,
        });
      });
      return { url: session.url };
    })();
    inFlight.set(key, task);
    try {
      return await task;
    } finally {
      inFlight.delete(key);
    }
  }
  async function webhook(req, res) {
    if (!enabled) {
      reply(res, 503, { error: 'Store unavailable.' });
      return;
    }
    const raw = await body(req, 262144);
    if (
      !verifyStripeSignature(raw, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET, now())
    ) {
      reply(res, 400, { error: 'Invalid signature.' });
      return;
    }
    const event = JSON.parse(raw.toString('utf8'));
    if (typeof event.id !== 'string' || event.livemode !== live) {
      reply(res, 400, { error: 'Invalid event.' });
      return;
    }
    await transaction(() => {
      if (database.events.includes(event.id)) return;
      if (
        ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
          event.type,
        )
      ) {
        const session = event.data?.object;
        if (session?.payment_status !== 'paid') return;
        const record = Object.values(database.wallets).find(
          (w) => w.id === session.client_reference_id,
        );
        const order = record?.orders[session.metadata?.orderId];
        if (
          !record ||
          !order ||
          order.sessionId !== session.id ||
          order.skinId !== session.metadata?.skinId ||
          record.id !== session.metadata?.walletId ||
          order.currency !== session.currency ||
          !Number.isSafeInteger(session.amount_total) ||
          session.amount_total < order.amount
        )
          throw Object.assign(Error('Unknown or mismatched purchase.'), { status: 400 });
        order.paymentIntent =
          typeof session.payment_intent === 'string' ? session.payment_intent : null;
        order.status =
          order.status === 'refunded' || database.refundedIntents.includes(order.paymentIntent)
            ? 'refunded'
            : 'paid';
        if (order.status === 'paid' && !record.entitlements.includes(order.skinId))
          record.entitlements.push(order.skinId);
      } else if (event.type === 'charge.refunded' && event.data?.object?.refunded === true) {
        const intent = event.data.object.payment_intent;
        if (typeof intent !== 'string')
          throw Object.assign(Error('Invalid refund.'), { status: 400 });
        if (!database.refundedIntents.includes(intent)) database.refundedIntents.push(intent);
        for (const record of Object.values(database.wallets)) {
          const affected = Object.values(record.orders).filter(
            (order) => order.paymentIntent && order.paymentIntent === intent,
          );
          for (const order of affected) {
            order.status = 'refunded';
            if (
              !Object.values(record.orders).some(
                (other) => other.skinId === order.skinId && other.status === 'paid',
              )
            )
              record.entitlements = record.entitlements.filter((id) => id !== order.skinId);
          }
        }
      }
      database.events.push(event.id);
    });
    reply(res, 200, { received: true });
  }
  return async function handleStore(req, res) {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/api/store/')) return false;
    if (storageFailed) {
      reply(res, 503, { error: 'The store is temporarily unavailable.' });
      return true;
    }
    try {
      if (pathname === '/api/store/webhook' && req.method === 'POST') {
        await webhook(req, res);
        return true;
      }
      const incoming = req.headers.origin;
      if (incoming && !allowedOrigins.has(incoming)) {
        reply(res, 403, { error: 'Origin not allowed.' });
        return true;
      }
      if (incoming) {
        res.setHeader('Access-Control-Allow-Origin', incoming);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type, X-Verso-CSRF',
        });
        res.end();
        return true;
      }
      if (req.method === 'GET' && pathname === '/api/store/catalog') {
        const catalog = await Promise.all(
          PREMIUM_SKINS.map(async (skin) => {
            const p = enabled ? await price(skin).catch(() => null) : null;
            return {
              id: skin.id,
              name: skin.name,
              description: skin.description,
              amount: p?.amount ?? null,
              currency: p?.currency ?? null,
              available: !!p,
            };
          }),
        );
        reply(res, 200, { enabled, testMode: !live, skins: catalog });
      } else if (req.method === 'GET' && pathname === '/api/store/wallet') {
        const record = await wallet(req, res);
        reply(res, 200, { csrf: record.csrf, entitlements: record.entitlements });
      } else if (req.method === 'POST' && pathname === '/api/store/checkout') {
        if (!enabled) {
          reply(res, 503, { error: 'The store is not open yet.' });
          return true;
        }
        if (
          !incoming ||
          !allowedOrigins.has(incoming) ||
          !String(req.headers['content-type']).startsWith('application/json')
        ) {
          reply(res, 403, { error: 'Invalid checkout request.' });
          return true;
        }
        const record = await wallet(req, res);
        if (!safeEqual(record.csrf, req.headers['x-verso-csrf'])) {
          reply(res, 403, { error: 'Refresh the store before purchasing.' });
          return true;
        }
        const prior = attempts.get(record.id) || [];
        const recent = prior.filter((time) => now() - time < 60000);
        if (recent.length >= 8) {
          reply(res, 429, { error: 'Please wait before trying again.' });
          return true;
        }
        attempts.set(record.id, [...recent, now()]);
        const request = JSON.parse((await body(req, 4096)).toString('utf8'));
        const skin = PREMIUM_SKINS.find((s) => s.id === request.skinId);
        if (!skin) {
          reply(res, 400, { error: 'Unknown outfit.' });
          return true;
        }
        reply(res, 200, await checkout(record, skin));
      } else reply(res, 404, { error: 'Unknown store route.' });
    } catch (error) {
      reply(res, error.status || (error instanceof SyntaxError ? 400 : 503), {
        error: error.status
          ? error.message
          : 'The store could not complete this request. Please try again.',
      });
    }
    return true;
  };
}
