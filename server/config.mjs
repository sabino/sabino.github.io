import { isAbsolute } from 'node:path';
import { isIP } from 'node:net';

function integer(env, key, fallback, min, max) {
  const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error(`${key} must be an integer between ${min} and ${max}.`);
  return value;
}

/** Resolve operational settings before opening any sockets or payment handlers. */
export function worldNodeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const allowedOrigins = [
    ...new Set(
      [env.VERSO_PUBLIC_ORIGIN, ...(env.VERSO_ALLOWED_ORIGINS || '').split(',')]
        .filter((value) => value?.trim())
        .map((value) => {
          const url = new URL(value.trim());
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            throw Error('World node origins must be HTTP(S) origins without credentials.');
          if (production && url.protocol !== 'https:')
            throw Error('Production world node origins must use HTTPS.');
          return url.origin;
        }),
    ),
  ];
  if (production && !allowedOrigins.length)
    throw Error('Production world nodes require VERSO_PUBLIC_ORIGIN or VERSO_ALLOWED_ORIGINS.');
  const persistenceDirectory = env.VERSO_WORLD_STORAGE || '.verso-server/worlds';
  const paymentDirectory = env.VERSO_PAYMENT_STORAGE || '.verso-server/payments';
  if (production && (!isAbsolute(persistenceDirectory) || !isAbsolute(paymentDirectory)))
    throw Error('Production world and payment storage paths must be absolute persistent paths.');
  return {
    port: integer(env, 'PORT', 4175, 1, 65535),
    host: env.HOST || '0.0.0.0',
    allowedOrigins,
    persistenceDirectory,
    paymentDirectory,
    trustedProxyHops: integer(env, 'VERSO_TRUST_PROXY_HOPS', 0, 0, 4),
    maxConnections: integer(env, 'VERSO_MAX_CONNECTIONS', 512, 8, 4096),
    maxConnectionsPerIp: integer(env, 'VERSO_MAX_CONNECTIONS_PER_IP', 32, 1, 512),
    maxRooms: integer(env, 'VERSO_MAX_ROOMS', 64, 1, 1024),
  };
}

/** Trust only a fixed number of controlled proxies, walking XFF from its right edge.
 * The container must not have a public port when this option is enabled.
 */
export function connectionAddress(req, trustedProxyHops = 0) {
  const direct = req.socket.remoteAddress ?? 'unknown';
  if (!trustedProxyHops) return direct;
  const raw = req.headers['x-forwarded-for'];
  if (typeof raw !== 'string' || raw.length > 2048) return direct;
  const chain = raw.split(',').map((part) => part.trim());
  if (chain.length < trustedProxyHops) return direct;
  const selected = chain[chain.length - trustedProxyHops];
  return isIP(selected) ? selected : direct;
}
