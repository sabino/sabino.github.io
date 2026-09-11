# Cooperative rooms

Stíchos supports 2–8 people exploring the same generated terrain, seeing one another's humanoid bodies and gestures, and sharing harvest, container and door changes. A room is an ephemeral cooperative session, not an MMO server.

## Run on a local network

Use Node 26 and install dependencies with `npm install`. Start the game with `npm run dev` (configured port 4173), or build and preview it with `npm run build` and `npm run preview -- --port 4174`. In a second terminal run `npm run server`. The room service listens on `0.0.0.0:4175`; its WebSocket address is `ws://<host>:4175/ws`. Open the frontend through the same hostname or LAN address used in that WebSocket address. A second player needs the host's LAN address, not their own `localhost`.

The creating player receives a room code. Joining requires the same world seed and generation. Existing generation 1 and 2 worlds retain their terrain; generation 3 is supported. The room does not import a creator's previously removed resources or opened containers: shared claims begin when the room is created, while each body retains its local inventory and prior save history.

`HOST` and `PORT` override the room server's bind address and port. By default browser connections are accepted only when the frontend and server use the same localhost or private LAN hostname/IP. For an explicitly configured origin, set `VERSO_PUBLIC_ORIGIN=https://game.example` or comma-separated `VERSO_ALLOWED_ORIGINS`. Public hosting needs a reverse proxy providing HTTPS/WSS; do not expose this development service as a complete account or MMO backend.

## What is shared

- Presence: name, generated appearance, position, heading and walking phase. Positions are client reported and checked against finite clear terrain; the server does not simulate movement or enforce travel speed.
- Resource claims: the server reconstructs the seeded world, checks the actual nearby object, action kind, target coordinates and timber/ore tool, then accepts exactly one claimant. The successful client performs its local inventory operation after the acknowledgement. Other clients apply the world change.
- Doors: explicit open/closed state and collision are shared. Closed doors block movement and combat; opening makes the doorway passable on every client. A floor-click route approaches a closed door, waits for the shared opening acknowledgement, then continues. Closing over another connected traveler is rejected. Create a new room from clear ground; an existing room permits joining in a doorway it has already opened.
- Gestures: wave, thanks and help. There is no free-text chat.

Combat, enemies, body inventory, quests and survival remain local. This server does not establish combat or inventory authority, synchronize NPC damage, enable PvP, or make purchases part of resource claims. Clients must check inventory capacity before claiming and freeze the pending local interaction until acknowledgement. A disconnect during a claim can leave its outcome uncertain; reconnect refreshes the shared world and never awards a second harvest automatically.

## Lifetime and limits

Rooms live in server memory. A private reconnect token retains the same identity for 90 seconds after disconnection; it is never included in another player's roster. Leaving removes the visible peer immediately. Unoccupied rooms expire after 30 minutes, and restarting the server clears rooms and their claim history. Local exported saves are separate and remain available.

The service bounds room count (64), players per room (8), reconnect records, remembered action receipts, connections, message size (8 KiB) and update rate. Heartbeats remove dead sockets. Atomic claims prevent ordinary simultaneous double harvesting; the protocol is not an anticheat guarantee against a modified client or an authority over local saves.

`GET /health` reports service readiness and room/player counts. The shared HTTP server passes `/api/store/*` requests to the separately configured store handler before reading their bodies, preserving raw webhook signatures. The store is disabled by default; configuring a payment provider is a separate deployment task.

## Verification

`node --experimental-strip-types --test tests/stichos-multiplayer.test.ts` opens real WebSocket clients against an ephemeral server. It covers peer movement and gestures, simultaneous claims, generated-object/tool/distance checks, loot and door state, private reconnect, world mismatch and capacity limits, malformed and oversized traffic, origin rejection, and raw HTTP body handoff. It also runs the actual browser client against that server with complete generated props to catch action-packet field collisions.

The real-input browser harness is `scripts/browser-multiplayer-check.mjs`. It uses a verified isolated workspace browser, starts a test-owned instance of the production server on an ephemeral loopback port, and creates independent browser contexts. Its controlled socket interruption tests the real Reconnect button without changing game state directly. The initial pass is recorded in [QA.md](QA.md#cooperative-rooms).

The door-regression rerun passed **9/9 checks with no browser errors** on production `app-CSGK7Fcb.js`. Both clients stopped at the closed cathedral door under keyboard input. A single floor click opened it through an acknowledged server action and continued indoors; a second client crossed the same shared opening, closed it, and used one exterior floor click to reopen and leave. The remote browser observed matching door state and arriving bodies without rejected positions or stuck pending actions. The original shared-harvest, emote, disconnect/reconnect and wrong-world checks also passed. [Current results](../../.dream-loop/stichos-multiplayer/results.json) and the [two-player doorway screenshot](../../.dream-loop/stichos-multiplayer/05-shared-door-route.png) retain the actual frames and build identity. The focused WebSocket suite now passes 10 tests, including rejection of a new-room doorway start without allocating a room, and successful joining through an already-open shared doorway.
