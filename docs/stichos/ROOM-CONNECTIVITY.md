# Browser rooms: addresses, reachability and storage

A planet is generated locally from `(uint32 seed, generation version)`. A room is a separate live authority whose signed changes sit on top of that base. Different players receive different lives; that does not mean they generated different terrain. A room is limited to eight players and its host must stay online.

## Share a complete address

New links use one `join` query parameter containing `V<generation>-<base36 planet seed>-<room ID>-<checksum>`. The Copy code button copies that same complete address for browser rooms. The title and Together fields accept it or a full invitation URL. Planet decoding needs no network lookup. The checksum catches transcription mistakes; it is not authentication. Signed authority proofs still authenticate an already pinned world.

New private room IDs contain 64 random bits. They are collision-resistant, not mathematically collision-free: PeerServer rejects an already registered host ID. Display names such as Copper Harbor are deliberately non-unique; share the complete code. Old bare codes and `room`, `planet`, `g` URLs continue to work. Bare codes still need a reachable host unless already remembered locally. Dedicated-node invitations must include their full URL because the endpoint is part of the address.

## Live browser connection

PeerJS uses PeerServer to exchange connection metadata. Gameplay then uses an RTC data channel. Discovery success alone does not mean the two browsers can connect. Some networks require TURN relay transport. [PeerJS client documentation](https://peerjs.com/client/getting-started).

On 2026-09-11, the TURN names bundled with PeerJS 1.5.5 (`eu-0.turn.peerjs.com` and `us-0.turn.peerjs.com`) had no A/AAAA records in local, Google and Cloudflare DNS checks. The deployment no longer silently counts those defaults as working relays. It uses STUN for direct connections until an operator provisions a TURN service. This does not guarantee cross-network reachability.

Together now reports signalling availability, connection stage, whether a relay is configured, the selected direct/relay route and coarse round-trip time. It retains specific errors for an offline host, signalling failure, ICE failure and credential-service failure. Diagnostics exclude IP addresses, SDP and credentials. A configured relay is not called a verified relay until RTC stats show a selected relay candidate.

### Configure a relay before building

Preferred: set `VITE_PEER_ICE_ENDPOINT=https://your-service.example/ice` in the operator build environment. The HTTPS endpoint must permit CORS from the game's origin and return either an ICE-server array or `{ "iceServers": [...] }`. Use short-lived per-connection credentials, rate limiting and provider-side abuse controls. The browser request omits cookies, rejects redirects and times out after six seconds.

Example response (replace placeholders with an actual provisioned service):

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": ["turn:relay.example:3478?transport=udp", "turns:relay.example:443?transport=tcp"],
      "username": "temporary-user",
      "credential": "temporary-credential"
    }
  ]
}
```

`VITE_PEER_ICE_SERVERS` also accepts that array as JSON for a controlled test deployment. **Every VITE value ships to the browser**; do not embed provider API keys or permanent operator secrets. Use the credential endpoint to keep the provider key on a server. `VITE_PEER_SIGNAL_URL` optionally selects an operator PeerServer. `VITE_PEER_RELAY_ONLY=true` forces relay transport for verification and refuses to start without TURN configuration.

No TURN account, publicly reachable world node, or credential endpoint has been provisioned by this repository. GitHub Pages serves the static client; it cannot run these processes. A dedicated WSS game node is the alternative already supported by Together and `server/`.

## Pear is storage, separate from the live channel

The optional native `pear-node/` service retains and replicates signed **public checkpoints**. The dedicated game server can send them to a configured bridge. Browser-hosted rooms save privately in their host browser and send verified public replicas to connected visitors; they do not automatically upload to a public Pear node. A replica does not keep a room running or elect a replacement host. See [WORLD-PERSISTENCE.md](WORLD-PERSISTENCE.md) for exact authority and backup limits.

## September performance verification

Click walking uses bounded A\* with cached collision samples and one search for all acceptable approach positions. Terrain noise reuses exact corner values; generation caches immutable town layouts. Ground art has a separate bounded cache, so new terrain cannot evict the current plants/props. Sampling 96 g4 chunks on the development machine fell from 1.14–1.25 seconds to 0.30–0.34 seconds; this is a local generation benchmark, not a promise about every device's frame rate.

`tests/fixtures/world-fingerprints.json` captures 64 complete chunks before these optimizations across four seeds and all four generations. Tests verify unchanged tile, building, resource and NPC/appearance bytes in reverse visitation order and after cache eviction. These samples support determinism of the changes; they are not an exhaustive proof of every possible seed or floating-point implementation.

Same-machine browser contexts verify the real RTC protocol and invitation flow but cannot substitute for two physical computers on different networks. Internet TURN verification must use an actual relay and show `route: relay`; no relay success is claimed from a direct local connection.

## Published verification — 2026-09-11

Source `265e9cc` was published in `sabino/sabino.github.io` commit `3af659ae2662745cbb5bad9dfed2f3362660b1fc`; [Pages deployment 34639464044](https://github.com/sabino/sabino.github.io/actions/runs/34639464044) succeeded. Every one of 31 non-HTML deployed files matched the built SHA-256; HTML loaded the expected `app-Co4MB4l8.js` / `peer-transport-CXmaMgBs.js` bundle generation. Offline cache version: `9781ec6d2848affb1127`.

- 401 unit/integration tests passed; production TypeScript build and formatting checks passed.
- Native-input public-site QA created three separate browser identities, joined seed 8/generation 4 by invitation URL and complete mobile code, and displayed a real QR invitation. An additional browser with networking disabled selected that planet from its code without host discovery. After the host left, a fresh invited traveler saw a persistent host-offline error. No runtime or console errors were recorded.
- The actual PeerJS fixture connected eight participants through public signalling, verified nonce/DTLS proofs, exchanged large combat frames and signed checkpoints, preserved 35-bit procedural weapon seeds, and recovered signalling without losing the established RTC channels.
- Native WASD and click walking entered the real generated home through its door. Reload/Continue retained identity, location and belongings, including with page/worker networking disabled. The foreground woodland capture measured approximately 60 FPS on the test workspace.

Evidence is retained locally under `.dream-loop/g4-native-coop-public/`, `.dream-loop/network-release-assets.json`, `.dream-loop/stichos-peer-transport-g4/`, `.dream-loop/network-walking-qa/` and `.dream-loop/life-offline/`. These browser tests used isolated Chromium contexts on one physical machine. No Internet TURN relay or cross-physical-device success is claimed; operator relay/world-node provisioning remains outstanding.
