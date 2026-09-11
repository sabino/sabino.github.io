# Always-on world node

The browser game remains a static GitHub Pages application. Its default hosted rooms connect over HTTPS WebSockets to the Verso world node. Captain's nginx terminates TLS and forwards `/ws` to the single Node process. This avoids WebRTC NAT traversal and keeps a room available when the player who created it leaves. Existing `peer:` invitations still use browser hosting and require their browser host to remain online.

The world node stores shared resource claims, doors, combat, world chat, production receipts, signing identities and reconnect credentials. Personal possessions and life state still live in each player's browser. The optional Pear bridge replicates signed **public** checkpoints; it is separate from gameplay transport and does not replace the node's private backup.

## CapRover app

Deploy the repository's `captain-definition`, which references `Dockerfile`. The image runs pinned Node 24.15.0 as the unprivileged `node` user (UID/GID 1000), installs only production dependencies and contains no build-time environment secrets. The game source is included because the authority executes the same deterministic TypeScript generators through Node's type stripping.

Configure these app properties before first use:

| Property                  | Value                                                       |
| ------------------------- | ----------------------------------------------------------- |
| App name                  | `verso-world`                                               |
| Container HTTP port       | `4175`                                                      |
| WebSocket support         | Enabled                                                     |
| HTTPS and force HTTPS     | Enabled for the app domain                                  |
| Persistent directory      | `/data`, backed by a named volume or private host directory |
| Instances                 | **1**                                                       |
| Published container ports | None; use Captain nginx                                     |
| Updates                   | Stop the old task before starting the new task              |
| Stop grace period         | At least 30 seconds                                         |
| Restart policy            | Restart on exit, including successful exit                  |

The `/data` mount must be writable by UID/GID 1000. A fresh named Docker volume inherits the image's directory ownership. A host bind mount must be prepared explicitly. Startup checks that the world directory can actually be written before opening the server socket. Do not expose this directory through nginx or static hosting: its files contain private room signing keys and player reconnect credentials.

Start with a 1 GiB container memory limit, a 768 MiB Node heap limit and one CPU, subject to available host capacity. These are operational bounds rather than a concurrency guarantee; watch CPU, RSS, disk use and connection counts under real traffic. Use CapRover's service-update override so resource limits, restart policy and the 30-second stop grace survive later deployments. Keep both update and rollback order `stop-first`: two processes writing the same volume are unsupported.

## Environment

| Variable                       | Production value / purpose                                   |
| ------------------------------ | ------------------------------------------------------------ |
| `NODE_ENV`                     | `production` (image default)                                 |
| `PORT`                         | `4175` (image default)                                       |
| `VERSO_PUBLIC_ORIGIN`          | `https://sabino.pro`                                         |
| `VERSO_ALLOWED_ORIGINS`        | Optional comma-separated additional exact HTTPS origins      |
| `VERSO_WORLD_STORAGE`          | `/data/worlds` (image default)                               |
| `VERSO_PAYMENT_STORAGE`        | `/data/payments` (image default; purchases remain disabled)  |
| `VERSO_TRUST_PROXY_HOPS`       | `1` when Captain nginx is the sole trusted proxy             |
| `VERSO_MAX_ROOMS`              | `64` by default                                              |
| `VERSO_MAX_CONNECTIONS`        | `512` by default, including connections that have not joined |
| `VERSO_MAX_CONNECTIONS_PER_IP` | `32` by default                                              |
| `NODE_OPTIONS`                 | `--max-old-space-size=768` for the suggested 1 GiB container |
| `VERSO_PAYMENTS_ENABLED`       | `false` (image default)                                      |

Production refuses missing origin allowlists, non-HTTPS origins, relative storage paths and invalid numeric bounds. Do not put Stripe keys or the Pear bridge bearer token into the browser bundle. Payment provisioning is a separate step and is not enabled by deploying multiplayer.

`VERSO_TRUST_PROXY_HOPS` selects the client address by counting from the **right** edge of `X-Forwarded-For`. With one controlled proxy it ignores a client-supplied prefix and uses the address nginx appends. Only increase it if every request traverses exactly that many trusted proxies and cannot bypass them. With `0`, forwarded headers are ignored. Never publish the container port publicly while trusting proxy headers.

Captain's generated nginx configuration must forward the WebSocket upgrade and append the real source to `X-Forwarded-For`. The authority sends ping frames every 15 seconds; proxy read timeouts must exceed that interval. The app accepts `/ws` exactly; it does not serve the browser game's static files.

## Public planets and private rooms

Public hosted rooms use the deterministic code `P{generation}{uint32 seed in seven base36 digits}`. A join packet may set `publicWorld: true` only with this exact derived room code. The authority atomically joins the existing room or creates it. Two simultaneous arrivals therefore enter one world. Arbitrary missing private room codes continue to fail instead of silently creating a different room. Newly generated private room IDs use eight random bytes encoded as sixteen hexadecimal digits.

Durable rooms remain present with zero connected browsers, including across orderly restarts. They have a hard configured capacity, initially 64 worlds, and are never silently deleted to free capacity. Raising this limit needs corresponding storage and memory headroom. Each room still allows eight simultaneous travelers. A bounded history retains up to 32 member reconnect records per room; the oldest disconnected record is evicted if new identities fill that history.

## Health, updates and recovery

`GET /health` returns `ok`, protocol, room count, connected player count, `durable` and `storageHealthy`. It returns HTTP 503 after a failed checkpoint or during shutdown. A later successful checkpoint restores healthy status. Docker checks this endpoint every 30 seconds, with a 30-second startup allowance and three retries. Invalid or unreadable saved worlds stop startup instead of erasing data or silently changing the signing key.

Shared state is checkpointed every five seconds by writing a private temporary file and atomically renaming it. SIGTERM/SIGINT performs a final checkpoint, closes sockets and exits. A checkpoint failure still closes sockets and exits nonzero. The process has a 25-second shutdown deadline, hence the requested Docker grace of at least 30 seconds. Abrupt host or process loss can discard changes since the last successful checkpoint; the five-second interval is not a transactional per-action durability guarantee.

Back up the entire private `/data` volume with restricted access. For a consistent operator backup, stop this single service gracefully, archive the volume, and restart it. Preserve the signing identities and reconnect credentials alongside world state. Restoring only public Pear checkpoints does not restore the authority's private credentials. Avoid rollback to a build that cannot read the existing world generation or checkpoint schema.

After a deployment, verify HTTPS `/health`, two actual WebSocket clients using the game origin, room-code discovery, public join-or-create, shared world changes, and identity recovery after a graceful service restart. Browser-hosted PeerJS success on a single machine is not evidence that this hosted endpoint works from other networks.

References: [CapRover Dockerfile definitions](https://caprover.com/docs/captain-definition-file), [persistent apps](https://caprover.com/docs/persistent-apps), [Node 24 TypeScript support](https://nodejs.org/download/release/v24.15.0/docs/api/typescript.html).
