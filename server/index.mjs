import { createCoopServer } from './coop.mjs';
import { createStoreHandler } from './payments.mjs';
import { createPearCheckpointPublisher } from './pear-checkpoint.mjs';

const port = Number(process.env.PORT || 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('PORT must be between 1 and 65535.');
const allowedOrigins = [
  process.env.VERSO_PUBLIC_ORIGIN,
  ...(process.env.VERSO_ALLOWED_ORIGINS || '').split(','),
]
  .filter(Boolean)
  .map((value) => new URL(value.trim()).origin);
const server = createCoopServer({
  storeHandler: createStoreHandler(),
  allowedOrigins,
  persistenceDirectory: process.env.VERSO_WORLD_STORAGE || '.verso-server/worlds',
  onCheckpoint: createPearCheckpointPublisher({
    onError: () =>
      console.warn(
        'The optional Pear replica bridge is unavailable; the local world checkpoint remains saved.',
      ),
  }),
});
await server.listen(port, process.env.HOST || '0.0.0.0');
console.log(`Stíchos cooperative rooms listening on port ${port}; WebSocket path /ws.`);
console.log(
  'Shared combat, resources, doors and chat; durable worlds in the configured private storage directory. Inventories remain personal.',
);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  });
