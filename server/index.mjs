import { createCoopServer } from './coop.mjs';
import { createStoreHandler } from './payments.mjs';
import { createPearCheckpointPublisher } from './pear-checkpoint.mjs';
import { worldNodeConfig } from './config.mjs';

const { port, host, paymentDirectory, ...config } = worldNodeConfig();
const server = createCoopServer({
  ...config,
  storeHandler: createStoreHandler({ storageDir: paymentDirectory }),
  onCheckpoint: createPearCheckpointPublisher({
    onError: () =>
      console.warn(
        'The optional Pear replica bridge is unavailable; the local world checkpoint remains saved.',
      ),
  }),
});
await server.listen(port, host);
console.log(
  `Verso world node listening on port ${port}; WebSocket gameplay /ws and ephemeral voice /voice.`,
);
console.log(
  'Shared combat, resources, doors and chat; durable worlds in the configured private storage directory. Inventories remain personal.',
);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => {
      console.error('World node shutdown exceeded its 25-second checkpoint deadline.');
      process.exit(1);
    }, 25000);
    deadline.unref();
    try {
      await server.close();
      process.exit(0);
    } catch {
      console.error(
        'World node stopped after a checkpoint failure; inspect the persistent volume.',
      );
      process.exit(1);
    }
  });
