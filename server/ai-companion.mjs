import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AI_BOUNDARY =
  'This Codex runtime has not been verified to deny every model tool. NPC inference is disabled; ordinary game dialogue remains available.';
export const AI_ORIGINS = [
  'https://sabino.pro',
  ...['localhost', '127.0.0.1'].flatMap((host) =>
    [4173, 4174].map((port) => `http://${host}:${port}`),
  ),
];
const digest = (value) => createHash('sha256').update(value).digest();
const equalSecret = (a, b) =>
  typeof a === 'string' && a.length <= 256 && timingSafeEqual(digest(a), digest(b));
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) =>
  typeof v === 'string' &&
  v.trim().length > 0 &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const only = (v, keys) => object(v) && Object.keys(v).every((key) => keys.includes(key));

export function validNpcRequest(value) {
  return (
    only(value, ['npc', 'message', 'context']) &&
    only(value.npc, ['id', 'name', 'role', 'clan']) &&
    text(value.npc.id, 160) &&
    text(value.npc.name, 80) &&
    text(value.npc.role, 40) &&
    text(value.npc.clan, 80) &&
    text(value.message, 600) &&
    only(value.context, ['place', 'bodyName', 'year', 'facts']) &&
    text(value.context.place, 100) &&
    text(value.context.bodyName, 100) &&
    value.context.year === 3886 &&
    Array.isArray(value.context.facts) &&
    value.context.facts.length <= 12 &&
    value.context.facts.every((fact) => text(fact, 240))
  );
}

function versionOf(command) {
  return new Promise((resolve) => {
    execFile(
      command,
      ['--version'],
      { timeout: 3000, maxBuffer: 8192, windowsHide: true },
      (error, stdout) => {
        resolve(error ? null : (/^codex-cli\s+([\w.+-]{1,48})/m.exec(stdout)?.[1] ?? null));
      },
    );
  });
}

/** Only these two read-only RPCs exist here. There is deliberately no turn/start relay. */
export function readCodexAccount(command, cwd, spawnProcess = spawn) {
  return new Promise((resolve) => {
    let child,
      timer,
      buffer = '',
      finished = false;
    const finish = (auth) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child?.stdin?.end();
      child?.kill();
      resolve(auth);
    };
    try {
      child = spawnProcess(
        command,
        ['app-server', '--listen', 'stdio://', '-c', 'features.hooks=false'],
        {
          cwd,
          stdio: ['pipe', 'pipe', 'ignore'],
          windowsHide: true,
          shell: false,
        },
      );
      timer = setTimeout(() => finish('unknown'), 7000);
      child.on('error', () => finish('unknown'));
      child.on('exit', () => finish('unknown'));
      child.stdin.on('error', () => finish('unknown'));
      child.stdout.on('data', (data) => {
        buffer += data.toString();
        if (buffer.length > 131072) return finish('unknown');
        while (buffer.includes('\n')) {
          const at = buffer.indexOf('\n'),
            line = buffer.slice(0, at);
          buffer = buffer.slice(at + 1);
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          // Server requests are never approved or forwarded, including future protocol additions.
          if (message.method && message.id !== undefined) return finish('unknown');
          if (message.id === 1) {
            if (!message.result || message.error) return finish('unknown');
            child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
            child.stdin.write(
              JSON.stringify({ id: 2, method: 'account/read', params: { refreshToken: false } }) +
                '\n',
            );
          }
          if (message.id === 2) {
            if (message.error) return finish('unknown');
            const account = message.result?.account;
            return finish(
              account == null
                ? 'none'
                : account.type === 'chatgpt'
                  ? 'chatgpt'
                  : account.type === 'apiKey'
                    ? 'apiKey'
                    : 'unknown',
            );
          }
        }
      });
      child.stdin.write(
        JSON.stringify({
          id: 1,
          method: 'initialize',
          params: {
            clientInfo: {
              name: 'stichos_capability_probe',
              title: 'Stíchos local capability check',
              version: '1.0.0',
            },
            capabilities: { experimentalApi: false },
          },
        }) + '\n',
      );
    } catch {
      finish('unknown');
    }
  });
}

export async function probeCodex({
  command = 'codex',
  accountReader = readCodexAccount,
  versionReader = versionOf,
} = {}) {
  const version = await versionReader(command);
  if (!version) return { installed: false, version: null, auth: 'unknown' };
  const cwd = await mkdtemp(join(tmpdir(), 'stichos-codex-probe-'));
  try {
    return { installed: true, version, auth: await accountReader(command, cwd) };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function statusFrom(probe) {
  return {
    paired: true,
    installed: probe.installed === true,
    version: typeof probe.version === 'string' ? probe.version.slice(0, 48) : null,
    auth: ['chatgpt', 'apiKey', 'none', 'unknown'].includes(probe.auth) ? probe.auth : 'unknown',
    browserWasm: false,
    transport: 'native-app-server-stdio',
    chatAvailable: false,
    toolsIsolated: false,
    reason: AI_BOUNDARY,
    setup: probe.installed
      ? ['codex login', 'codex login status']
      : ['Install Codex CLI using the official instructions.', 'codex login'],
  };
}

/** Loopback-only capability/auth companion. No inference backend is enabled in this release. */
export function createAICompanion({
  pairingCode = randomBytes(24).toString('base64url'),
  allowedOrigins = AI_ORIGINS,
  probe = probeCodex,
  now = Date.now,
  sessionLifetime = 30 * 60 * 1000,
} = {}) {
  if (!text(pairingCode, 128) || pairingCode.length < 24)
    throw Error('Use at least 24 characters for the pairing capability.');
  const origins = new Set(
    allowedOrigins.map((origin) => {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
        throw Error('Use exact HTTP origins.');
      return origin;
    }),
  );
  const sessions = new Map();
  let port = 0,
    windowAt = 0,
    pairAttempts = 0,
    cached,
    cachedAt = 0,
    probing;
  const clean = () => {
    for (const [key, session] of sessions) if (session.expires <= now()) sessions.delete(key);
  };
  const timer = setInterval(clean, 60000);
  timer.unref();
  const capability = async () => {
    if (cached && now() - cachedAt < 30000) return cached;
    if (!probing)
      probing = Promise.resolve()
        .then(() => probe())
        .then((value) => {
          cached = statusFrom(value);
          cachedAt = now();
          return cached;
        })
        .catch(() => statusFrom({ installed: false, auth: 'unknown' }))
        .finally(() => {
          probing = undefined;
        });
    return probing;
  };
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status, value) => {
      if (res.writableEnded) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    if (
      !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)
    )
      return send(403, { code: 'host_denied', message: 'Use the local companion address.' });
    if (typeof origin !== 'string' || !origins.has(origin))
      return send(403, { code: 'origin_denied', message: 'This game origin is not allowed.' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204);
      return res.end();
    }
    // Queries/fragments never carry pairing or session capabilities.
    if (!['/api/ai/pair', '/api/ai/status', '/api/ai/chat', '/api/ai/disconnect'].includes(req.url))
      return send(404, { code: 'not_found', message: 'Unknown companion route.' });
    let body;
    if (req.method === 'POST') {
      if (req.headers['content-type']?.split(';')[0] !== 'application/json')
        return send(415, { code: 'json_required', message: 'Send JSON.' });
      let raw = '';
      try {
        for await (const data of req) {
          raw += data;
          if (Buffer.byteLength(raw) > 8192)
            return send(413, { code: 'too_large', message: 'The request is too long.' });
        }
        body = JSON.parse(raw);
      } catch {
        return send(400, { code: 'invalid_json', message: 'Invalid request.' });
      }
    }
    clean();
    if (req.url === '/api/ai/pair' && req.method === 'POST') {
      if (now() - windowAt >= 60000) {
        pairAttempts = 0;
        windowAt = now();
      }
      if (++pairAttempts > 10)
        return send(429, {
          code: 'pair_rate',
          message: 'Wait a minute before another pairing attempt.',
        });
      if (!only(body, ['code']) || !equalSecret(body.code, pairingCode))
        return send(401, { code: 'pair_denied', message: 'The pairing code did not match.' });
      if (sessions.size >= 8)
        return send(429, { code: 'session_limit', message: 'Close another paired game first.' });
      const token = randomBytes(32).toString('base64url');
      sessions.set(digest(token).toString('hex'), {
        origin,
        expires: now() + sessionLifetime,
        requests: 0,
        windowAt: now(),
      });
      return send(200, { token, expiresIn: sessionLifetime / 1000 });
    }
    const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
    const sessionKey = bearer && digest(bearer).toString('hex'),
      session = sessionKey && sessions.get(sessionKey);
    if (!session || session.origin !== origin)
      return send(401, {
        code: 'pair_required',
        message: 'Pair this game using the code shown by your local companion.',
      });
    if (now() - session.windowAt >= 60000) {
      session.requests = 0;
      session.windowAt = now();
    }
    if (++session.requests > 30)
      return send(429, { code: 'request_rate', message: 'Wait a moment before another request.' });
    if (req.url === '/api/ai/status' && req.method === 'GET') return send(200, await capability());
    if (req.url === '/api/ai/disconnect' && req.method === 'POST') {
      sessions.delete(sessionKey);
      return send(200, { disconnected: true });
    }
    if (req.url === '/api/ai/chat' && req.method === 'POST') {
      if (!validNpcRequest(body))
        return send(400, {
          code: 'invalid_npc_request',
          message: 'Use a nearby named resident, a short question, and bounded game context.',
        });
      // Hard boundary: neither player text nor any browser-selected method reaches Codex.
      return send(409, { code: 'tool_isolation_unverified', message: AI_BOUNDARY });
    }
    return send(405, { code: 'method_denied', message: 'That method is not supported.' });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  return {
    pairingCode,
    async listen(requestedPort = 4176) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(requestedPort, '127.0.0.1', resolve);
      });
      port = server.address().port;
      return `http://127.0.0.1:${port}`;
    },
    async close() {
      clearInterval(timer);
      sessions.clear();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    get sessionCount() {
      clean();
      return sessions.size;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const companion = createAICompanion();
  const endpoint = await companion.listen(4176);
  console.log(`Stíchos local capability companion: ${endpoint}`);
  console.log(
    `Pairing code (paste into the game; never put it in a URL): ${companion.pairingCode}`,
  );
  console.log(AI_BOUNDARY);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await companion.close();
      process.exit(0);
    });
}
