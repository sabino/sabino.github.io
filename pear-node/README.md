# Optional native Pear world node

This service uses actual **Corestore, Hypercore and Hyperswarm** to persist and replicate Verso's signed public world checkpoints. It runs in Node beside the game host. The browser continues to use WebRTC or WebSocket for live multiplayer; this package is a native replica service, not a browser implementation of raw Hyperswarm or a packaged Pear desktop application.

## Run

Use Node 24 or newer from this repository checkout. Native dependency installation requires a supported platform; the committed lockfile records the versions tested on Linux with Node 26.

```sh
cd pear-node
npm ci
export VERSO_PEAR_TOKEN='replace-this-with-a-long-random-operator-secret'
npm start
```

The default HTTP listener is `127.0.0.1:4188`. Keep the upload token outside source control. Set these on the separate Verso multiplayer server to enable its existing publisher:

```sh
export VERSO_PEAR_BRIDGE_URL='http://127.0.0.1:4188'
export VERSO_PEAR_BRIDGE_TOKEN='the-same-operator-secret'
```

The host publishes only after its private local checkpoint has been written. Without these variables it runs normally without Pear. Without `VERSO_PEAR_TOKEN`, the node's HTTP interface is read-only.

| Node variable               | Default / meaning                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `VERSO_PEAR_DATA`           | `./data`, relative to the working directory; use a separate directory per node     |
| `VERSO_PEAR_HOST`           | `127.0.0.1`; HTTP binding, separate from Hyperswarm discovery                      |
| `VERSO_PEAR_PORT`           | `4188`                                                                             |
| `VERSO_PEAR_TOKEN`          | Optional upload/replica-management bearer capability, at least 24 characters       |
| `VERSO_PEAR_ORIGINS`        | Exact allowed origins, comma separated; defaults to local game ports 4173 and 4174 |
| `VERSO_PEAR_FOLLOW`         | Comma-separated public Hypercore keys to follow, including in read-only mode       |
| `VERSO_PEAR_MAX_FEED_BYTES` | 268435456 bytes per feed; publication stops when full                              |

## HTTP interface

All replies are JSON. POST requests require `Authorization: Bearer …` and `Content-Type: application/json`. Requests with an Origin must match the exact configured allowlist; Host checks reject DNS rebinding. HTTP is intended for a local operator or a separately secured reverse proxy, not an unauthenticated public write endpoint.

- `POST /api/checkpoints`: a complete `SignedRoomCheckpoint`. Returns `{topic,key,revision,duplicate}`. The first accepted upload creates a named writable Hypercore; the public key is its read capability. Duplicate uploads do not append again. Uploads to a followed read-only world are rejected.
- `POST /api/replicas`: `{ "key": "64 lowercase hexadecimal characters" }`. Persists a subscription to a public Hypercore; no owner private key is needed.
- `GET /api/checkpoints/:topic`: latest verified public checkpoint, or 404 while unavailable.
- `GET /api/feeds`: public feed keys, topics, local writer flags, lengths and replication errors.
- `GET /health`: transport, feed count and connected native peers.

Run another node with a different data directory and HTTP port, then provide the writer's public key through `VERSO_PEAR_FOLLOW` or the authenticated replicas endpoint. Peers discover each other using the feed's discovery key. The latest verified replica remains readable from disk while the host is offline. A surviving replica can serve the log to other subscribers; it cannot sign new game history on the owner's behalf.

## Authority and storage

The world topic is SHA-256 of `verso-world-v1|room|seed|generation|authority.x|authority.y`. A feed pins this identity after its first valid record. Hypercore verifies its own append-log signature; the bridge independently checks the game's P-256 signature, public schema, revision, and adjacent parent hash. Equal-revision conflicts and rollback are rejected, including after restart. The checkpoint format permits signed forward revision gaps, so missed intermediate host publications do not stop later recovery.

Only public world state is publishable: terrain changes, shared combat, production registrations/receipts and **World** chat. Local Say chat, session inventory, owner private keys and member reconnect credentials do not enter the published envelope. Invalid blocks from an untrusted external feed remain untrusted transport data and are never returned as the latest checkpoint. The bearer token stays in the local HTTP request, outside the log.

Corestore persists each node's own log-writing capability in its private data directory. Back up that directory to preserve the same writer key. Replicated public checkpoints are not a replacement for the game host's private owner backup: owner authority and authenticated reconnection still require that backup. Feed discovery is based on a public read capability, and this package does not encrypt public world history for a private membership group.

The service bounds subscriptions to 32 feeds, each log to a configurable byte budget, and individual uploads/blocks to 4 MiB. It has no automatic archival compaction or feed rotation; monitor `GET /api/feeds` and provision another explicitly announced feed if a log reaches its budget. Internet discovery/NAT reachability depends on the native environment. No claim is made that every network permits direct peer connectivity.

## Verification

```sh
cd pear-node
npm test
```

Tests use an isolated real local HyperDHT test network; they do not contact public bootstrap nodes. They establish an encrypted connection between two distinct native swarms, replicate signed updates, restart both nodes from disk, retain the original writer key and revision pin, and continue replication. Further checks cover authorization and origins, malformed/private state, tampered signatures, equivocation, and a malicious but transport-signed feed that later recovers with a valid checkpoint. This is a native-library integration test, not a long-running multi-host Internet availability test.

The implementation follows the official [Hypercore replication and persistence guide](https://docs.pears.com/how-to/store-and-replicate/replicate-and-persist-with-hypercore/), [Corestore API](https://docs.pears.com/reference/helpers/corestore/) and [Hyperswarm API](https://docs.pears.com/reference/building-blocks/hyperswarm/). Local discovery tests use the maintained [Hyperswarm testnet helper](https://github.com/holepunchto/hyperswarm-testnet).
