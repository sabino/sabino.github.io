import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { CoopRooms, MAX_MESSAGE_BYTES } from '../src/stichos/room-authority.mjs';
import { MULTIPLAYER_PROTOCOL } from '../src/stichos/multiplayer-protocol.ts';
import { attachRoomDisk } from './room-disk.mjs';
export { CoopRooms };

function originAllowed(req, allowedOrigins) {
  if (!req.headers.origin) return true; // Native clients, including the wire tests, have no Origin.
  let origin, host;
  try {
    origin = new URL(req.headers.origin);
    host = new URL(`http://${req.headers.host}`);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(origin.protocol)) return false;
  if (allowedOrigins.has(origin.origin)) return true;
  const local = (name) =>
    name === 'localhost' ||
    name === '[::1]' ||
    /^127\./.test(name) ||
    /^10\./.test(name) ||
    /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name) ||
    name.endsWith('.local');
  return origin.hostname === host.hostname && local(origin.hostname);
}

/** Standalone HTTP + WebSocket server. The store handler receives untouched request bodies. */
export function createCoopServer({
  storeHandler = async () => false,
  allowedOrigins = [],
  persistenceDirectory = process.env.VERSO_WORLD_STORAGE || null,
  onCheckpoint = async () => {},
  ...roomOptions
} = {}) {
  const hub = new CoopRooms({
    ...roomOptions,
    durable: !!persistenceDirectory || roomOptions.durable,
  });
  let disk;
  let persistenceTimer;
  let persistenceError = null;
  const origins = new Set(allowedOrigins);
  const http = createServer(async (req, res) => {
    try {
      if (await storeHandler(req, res)) return;
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            ok: true,
            protocol: MULTIPLAYER_PROTOCOL,
            rooms: hub.rooms.size,
            players: [...hub.rooms.values()].reduce(
              (sum, room) =>
                sum + [...room.members.values()].filter((member) => member.connection).length,
              0,
            ),
            durable: !!disk,
            storageHealthy: !persistenceError,
          }),
        );
        return;
      }
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify({ error: 'Not found.' }));
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'The request could not be completed.' }));
    }
  });
  http.headersTimeout = 10000;
  http.requestTimeout = 15000;
  const websocket = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  const ipConnections = new Map();
  http.on('upgrade', (req, socket, head) => {
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (
      req.url !== '/ws' ||
      !originAllowed(req, origins) ||
      (ipConnections.get(ip) ?? 0) >= 32 ||
      hub.connections.size >= 512
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    websocket.handleUpgrade(req, socket, head, (ws) => {
      ipConnections.set(ip, (ipConnections.get(ip) ?? 0) + 1);
      ws.once('close', () => {
        const n = (ipConnections.get(ip) ?? 1) - 1;
        if (n) ipConnections.set(ip, n);
        else ipConnections.delete(ip);
      });
      hub.attach(ws);
    });
  });
  const timer = setInterval(() => hub.heartbeat(), 15000);
  timer.unref();
  const combatTimer = setInterval(() => hub.tick(0.05), 50);
  combatTimer.unref();
  return {
    http,
    websocket,
    hub,
    async listen(port = 4175, host = '0.0.0.0') {
      if (persistenceDirectory && !disk) {
        disk = await attachRoomDisk(hub, persistenceDirectory, { onCheckpoint });
        persistenceTimer = setInterval(() => {
          void disk
            .flush()
            .then(() => {
              persistenceError = null;
            })
            .catch((error) => {
              persistenceError = error;
            });
        }, 5000);
        persistenceTimer.unref();
      }
      await new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, host, () => {
          http.off('error', reject);
          resolve();
        });
      });
      return http.address();
    },
    async close() {
      clearInterval(timer);
      clearInterval(combatTimer);
      clearInterval(persistenceTimer);
      if (disk) await disk.flush(true);
      for (const client of websocket.clients) client.terminate();
      await new Promise((resolve) => websocket.close(resolve));
      if (http.listening) await new Promise((resolve) => http.close(resolve));
    },
    async checkpoint() {
      if (disk) await disk.flush();
    },
  };
}
