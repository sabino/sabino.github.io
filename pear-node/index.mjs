import { createPearBridge } from './bridge.mjs';
import { resolve } from 'node:path';

const integer = (value, fallback) => (value === undefined ? fallback : Number(value));
const bridge = await createPearBridge({
  directory: resolve(process.env.VERSO_PEAR_DATA ?? './data'),
  token: process.env.VERSO_PEAR_TOKEN || undefined,
  host: process.env.VERSO_PEAR_HOST ?? '127.0.0.1',
  port: integer(process.env.VERSO_PEAR_PORT, 4188),
  allowedOrigins: (process.env.VERSO_PEAR_ORIGINS ?? 'http://localhost:4173,http://localhost:4174')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  follow: (process.env.VERSO_PEAR_FOLLOW ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  maxFeedBytes: integer(process.env.VERSO_PEAR_MAX_FEED_BYTES, 256 * 1024 * 1024),
  onError: (error) => console.error('World replica:', error.message),
});
console.log(`Verso native Pear world node: ${bridge.url}`);
console.log(
  process.env.VERSO_PEAR_TOKEN
    ? 'Authenticated checkpoint upload enabled.'
    : 'Read-only HTTP mode; set VERSO_PEAR_TOKEN to enable uploads.',
);
console.log('Public Hypercore feed keys: GET /api/feeds');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await bridge.close();
}
process.once('SIGINT', () =>
  close().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }),
);
process.once('SIGTERM', () =>
  close().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }),
);
