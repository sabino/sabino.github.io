import { createCoopServer } from './coop.mjs';
import { createStoreHandler } from './payments.mjs';

const port = Number(process.env.PORT || 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('PORT must be between 1 and 65535.');
const allowedOrigins = [
  process.env.VERSO_PUBLIC_ORIGIN,
  ...(process.env.VERSO_ALLOWED_ORIGINS || '').split(','),
]
  .filter(Boolean)
  .map((value) => new URL(value.trim()).origin);
const server = createCoopServer({ storeHandler: createStoreHandler(), allowedOrigins });
await server.listen(port, process.env.HOST || '0.0.0.0');
console.log(`Stíchos cooperative rooms listening on port ${port}; WebSocket path /ws.`);
console.log('Shared presence, resource claims and doors. Combat and inventory remain local.');
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  });
