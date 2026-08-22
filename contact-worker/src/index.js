const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const text = (value, maximum) => typeof value === 'string'
  ? value.replace(/\r\n?/g, '\n').trim().slice(0, maximum)
  : '';

const configuredValues = (value) => new Set(
  String(value || '').split(',').map((item) => item.trim()).filter(Boolean),
);

export const isAllowedOrigin = (origin, allowedOrigins) => Boolean(origin && configuredValues(allowedOrigins).has(origin));

export const validateContactPayload = (input) => {
  const payload = {
    name: text(input?.name, 120),
    email: text(input?.email, 254).toLowerCase(),
    message: text(input?.message, 5000),
    website: text(input?.website, 500),
    language: text(input?.language, 16) || 'en',
    turnstileToken: text(input?.turnstileToken, 4096),
  };
  const errors = [];
  if (payload.name.length < 2) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.push('email');
  if (payload.message.length < 30) errors.push('message');
  if (!payload.turnstileToken) errors.push('turnstile');
  return { payload, errors };
};

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const json = (body, status = 200, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: { ...JSON_HEADERS, ...(origin ? corsHeaders(origin) : {}) },
});

const digest = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const verifyTurnstile = async (request, env, token) => {
  if (!env.TURNSTILE_SECRET_KEY) return { success: false, reason: 'not-configured' };
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  body.set('idempotency_key', crypto.randomUUID());
  const remoteAddress = request.headers.get('CF-Connecting-IP');
  if (remoteAddress) body.set('remoteip', remoteAddress);

  const response = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body });
  if (!response.ok) return { success: false, reason: 'verification-unavailable' };
  const result = await response.json();
  if (!result.success) return { success: false, reason: 'challenge-failed' };
  if (result.action && result.action !== 'contact') return { success: false, reason: 'action-mismatch' };
  const allowedHostnames = configuredValues(env.ALLOWED_TURNSTILE_HOSTNAMES);
  const officialTestResult = result.metadata?.result_with_testing_key === true
    && /^\d+x0{8,}/.test(env.TURNSTILE_SITE_KEY || '');
  if (!officialTestResult && result.hostname && allowedHostnames.size && !allowedHostnames.has(result.hostname)) {
    return { success: false, reason: 'hostname-mismatch' };
  }
  return { success: true, hostname: result.hostname || '' };
};

const notify = async (env, submission) => {
  if (!env.EMAIL || !env.CONTACT_TO || !env.CONTACT_FROM) return;
  try {
    const result = await env.EMAIL.send({
      to: env.CONTACT_TO,
      from: env.CONTACT_FROM,
      replyTo: { email: submission.email, name: submission.name },
      subject: 'new sabino.pro project context',
      text: [
        `submission: ${submission.id}`,
        `received: ${submission.createdAt}`,
        `language: ${submission.language}`,
        `name: ${submission.name}`,
        `reply address: ${submission.email}`,
        '',
        submission.message,
      ].join('\n'),
    });
    await env.CONTACTS.prepare(
      "UPDATE contact_messages SET notification_status = 'sent', notification_id = ? WHERE id = ?",
    ).bind(result.messageId, submission.id).run();
  } catch (error) {
    await env.CONTACTS.prepare(
      "UPDATE contact_messages SET notification_status = 'failed' WHERE id = ?",
    ).bind(submission.id).run();
    console.error('contact notification failed', { id: submission.id, code: error?.code || 'unknown' });
  }
};

const handleContact = async (request, env, context, origin) => {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 12000) return json({ ok: false, error: 'payload-too-large' }, 413, origin);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'content-type' }, 415, origin);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid-json' }, 400, origin);
  }

  const { payload, errors } = validateContactPayload(input);
  if (payload.website) return json({ ok: true }, 202, origin);
  if (errors.length) return json({ ok: false, error: 'invalid-fields', fields: errors }, 400, origin);

  const actorKey = await digest(payload.email);
  const rate = await env.CONTACT_RATE_LIMITER.limit({ key: `contact:${actorKey}` });
  if (!rate.success) return json({ ok: false, error: 'rate-limited' }, 429, origin);

  const challenge = await verifyTurnstile(request, env, payload.turnstileToken);
  if (!challenge.success) return json({ ok: false, error: 'verification-failed' }, 403, origin);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const notificationStatus = env.EMAIL && env.CONTACT_TO && env.CONTACT_FROM ? 'pending' : 'stored';
  await env.CONTACTS.prepare(
    `INSERT INTO contact_messages
      (id, created_at, name, reply_email, message, language, turnstile_hostname, notification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    createdAt,
    payload.name,
    payload.email,
    payload.message,
    payload.language,
    challenge.hostname,
    notificationStatus,
  ).run();

  context.waitUntil(notify(env, { ...payload, id, createdAt }));
  return json({ ok: true }, 202, origin);
};

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = isAllowedOrigin(origin, env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : json({ ok: false }, 403);
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, formReady: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.CONTACTS) });
    }
    if (!allowed) return json({ ok: false, error: 'origin' }, 403);
    if (url.pathname === '/config' && request.method === 'GET') {
      return json({ siteKey: env.TURNSTILE_SITE_KEY || '' }, 200, origin);
    }
    if (url.pathname === '/contact' && request.method === 'POST') {
      return handleContact(request, env, context, origin);
    }
    return json({ ok: false, error: 'not-found' }, 404, origin);
  },

  async scheduled(_controller, env) {
    await env.CONTACTS.prepare(
      "DELETE FROM contact_messages WHERE created_at < datetime('now', '-365 days')",
    ).run();
  },
};
