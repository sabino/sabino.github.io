# Spatial room voice

Verso uses an operator-owned **ephemeral binary audio relay at `/voice`**, separate from gameplay `/ws`. This is server-relayed voice over TLS, not direct peer-to-peer voice and not end-to-end encryption: the operator can access audio in transit. No microphone content is recorded, logged, stored in browser storage, written to world checkpoints, or sent to Pear/Hypercore. Personal control preferences alone are saved locally.

## Compatibility and codec decision

Current Android Chrome and iPhone/iPad Safari support secure-context AudioWorklet and Web Audio. Capture uses `getUserMedia`, then a worklet downsamples the device clock to 16 kHz mono. Independent 20 ms **IMA ADPCM** blocks carry speech; the receiver decodes them into bounded Web Audio buffers. Both sides explicitly negotiate `ima-adpcm-16k-v1`. Unsupported browsers stay listen/text-only as appropriate; this build requires AudioWorklet even for voice enablement, so older browsers retain text rather than guessing a codec.

This avoids assuming that Chrome WebM/Opus and Safari MP4/AAC recorder chunks are interchangeable or independently decodable. `MediaRecorder` timeslices can be delayed by Safari capture interruption or Android screen locking. Safari 18.4 adds WebM/Opus recording and Ogg playback support; that does not make earlier mobile versions interchangeable. ADPCM is original application code implementing the public IMA algorithm, with no third-party audio asset or codec download. It costs more bandwidth than Opus and is intended for intelligible speech, not high-fidelity music. A later version can negotiate Opus through an audited WASM codec without changing `/ws`.

Sources checked September 2026:

- [MDN AudioWorklet, secure context and browser compatibility](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [MDN getUserMedia permissions and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN recorder timing and mobile interruption behavior](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event)
- [WebKit Safari 18.4 media improvements](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [Chrome Web Audio autoplay policy](https://developer.chrome.com/blog/web-audio-autoplay)
- [MDN WebSocket buffering limitations](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

## Authentication and lifecycle

1. A joined gameplay connection requests `voice_ticket` with a bounded request identifier. The authority issues a random 256-bit ticket valid for 10 seconds, scoped to that exact current member/game socket. A room code is never a voice credential.
2. The browser opens `/voice`; its first, bounded JSON control frame carries the ticket and supported codecs. Tickets are never put in URLs or browser storage. Redemption deletes the ticket, including failed stale attempts. Issuing another invalidates earlier unused tickets for the same session.
3. The server confirms codec and tunable world ranges. PTT control selects the mode and a request serial; capture waits for the server's matching speaking-slot acknowledgment. Release cancels pending requests, and stale acknowledgments never activate capture. Audio travels in binary frames with no sender-supplied identity or position. The relay prepends the authenticated peer UUID.
4. Every frame checks current room membership and range against the authority's latest accepted positions. Room departure immediately closes voice and revokes unused tickets. Reconnect needs a fresh ticket and never resumes an open microphone/PTT automatically.
5. Closing, hiding or suspending the page stops capture hardware and empties playback queues. An explicit Listen action resumes mobile audio. Switching input device stops the previous track; late permission results are discarded after cancellation. Releasing PTT disables the track and worklet immediately; **Turn microphone off** stops the track entirely. No local microphone monitor is connected to audible output.

Gameplay membership is authenticated to the current socket/private resume credential, **not a verified human account**. Rooms currently permit new guest identities. Room codes and invite links therefore retain their existing join semantics; voice does not introduce account identity or make a room invitation private. Presence remains client-reported and world-validated by existing gameplay rules; position cheating requires a future authoritative movement system. Server-side acoustic reach prevents honest clients receiving distant packets but cannot prevent a modified game client reporting another valid position. Endpoint TLS and existing origin allowlists remain mandatory in production.

## Tunable spatial rules

The renderer uses 36 pixels/world tile at zoom 1. Its reference desktop play area is roughly 1,000 pixels wide, so a canonical half-screen reach is 14 tiles. These are **world-space radii**, independent of device width, CSS, DPI and zoom:

| Mode    |   Radius | Meaning                                        |
| ------- | -------: | ---------------------------------------------- |
| Whisper |  3 tiles | A close conversation                           |
| Normal  | 14 tiles | Roughly one canonical visible radius           |
| Shout   | 42 tiles | Normal plus two further canonical screen radii |

The server checks distance inclusively; listeners fade continuously to zero at the boundary. No binary audio reaches out-of-range or cross-room listeners. Each listener applies smooth squared distance falloff, head-relative stereo panning, quieter/more muffled rear sound, and a bounded ray through reliable world walls/closed doors supplied by the integration layer. Rear sound is never magically silent. Open doors do not occlude. Geometry failure should return unobstructed sound, never generate or mutate world state. Coefficients live in `voice-acoustics.ts`; UI range rings and audio use server-advertised ranges.

## Bounds and operator configuration

The two transports have separate WebSocketServer instances, message limits, connection maps, buffering and rate buckets. `/ws` remains JSON protocol 3; legacy clients need not send any voice messages. PeerJS browser-hosted rooms do not advertise `/voice` and retain text communication.

Defaults: control payload at most 8 KiB (up to 128 saved blocked/muted identities); binary audio exactly 176 bytes; 4-second pre-auth deadline; 128 total voice sockets, 12/IP; 55 audio frames/s with a 12-frame burst; 11,000 input bytes/s with an 8 KiB burst; six control messages/s with burst 12. WebSocket ping/pong shares control/byte limits; automatic unlimited pong replies are disabled. Fragment/buffer chunk counts are capped at 16/64. Outbound buffering above 16 KiB closes slow listeners; rejected/closing sockets retain their connection accounting until actual closure, with a 500 ms terminate deadline. At most three talkers/room, a 20-second continuous PTT lease and 1.2-second silence expiry apply. The global audio budget accounts for input **and fan-out output** at 1.5 MB/s. Overload drops current audio instead of queuing history. Replay/out-of-order sequences, unknown codecs, wrong PTT mode, oversized or malformed frames close only voice. The application performs no audio decoding server-side. Rooms have at most eight players, so each fan-out is bounded. `/voice/health` and `/health.voice` expose aggregate counters only: no payloads, tickets, names, rooms, coordinates or addresses.

A 176-byte frame at 50 Hz is 8,800 bytes/s before WS/TLS overhead; a 192-byte relayed frame is 9,600 bytes/s per listener. Three talkers produce about 28.8 KB/s listener payload. Client playback bounds the jitter queue to 140 ms/9 packets per peer, current talkers to three, retained peer nodes to seven, and discards stale backlog. Typical clean-link audio latency combines 20 ms capture, network RTT legs, and 25–140 ms playback headroom. TCP head-of-line blocking remains a limitation on lossy mobile networks. No STUN, NAT hole punching or TURN is needed; the browser opens outbound WSS/443. Separate bounded transports protect gameplay queues; both share the Node event loop and host CPU, so deployment load tests remain necessary for capacity planning.

| Environment variable          | Default               |
| ----------------------------- | --------------------- |
| `VERSO_VOICE_ENABLED`         | enabled; `0` disables |
| `VERSO_VOICE_MAX_CONNECTIONS` | `128`                 |
| `VERSO_VOICE_MAX_PER_IP`      | `12`                  |
| `VERSO_VOICE_GLOBAL_BYTES`    | `1500000`             |
| `VERSO_VOICE_WHISPER_RANGE`   | `3`                   |
| `VERSO_VOICE_NORMAL_RANGE`    | `14`                  |
| `VERSO_VOICE_SHOUT_RANGE`     | `42`                  |

Ranges must strictly increase. Additional fine-grained bounds are exported as `VOICE_LIMITS` and can be overridden through the local server factory. Existing reverse proxies must forward WebSocket upgrades for `/voice` and route `/voice/health`; no new public port is required. Keep authentication controls out of HTTP access-body logs and do not enable WebSocket payload capture. This implementation does not change production proxy configuration.

## Controls, accessibility and privacy

Listening is opt-in through a gesture and never requires microphone permission. Microphone permission is a distinct action. Hold or toggle PTT works with pointer/keyboard controls, mode selection and visible status; input meter shows capture level. Master voice output, input gain, device choice, individual player volume/mute/block persist locally. Mute rejects only that player's incoming audio at the server; block prevents voice in both directions. Blocks are scoped to a stable member UUID and can be evaded by creating a new guest identity; there is no claim of global account moderation. Text/quick phrases remain available. There is no automatic speech recognition, transcript or recording.

Output passes through a compressor, capture uses conservative headroom/soft limiting, echo cancellation and noise suppression are requested, and local monitoring is inaudible. Echo cancellation effectiveness is device-dependent; headphones are recommended. Bluetooth/headphone/speaker routing remains browser/OS-controlled. The build does not promise programmatic speaker selection or background iOS microphone operation. Game music and ambience duck smoothly while audible speech or local PTT is active; voice has its own audio context so a paused game menu does not accidentally mute incoming speech.

## Verification and remaining physical-device checks

`node --experimental-strip-types --test tests/stichos-voice.test.ts` verifies authenticated one-use tickets, expiry/session replacement, all three exact range boundaries, cross-room filtering, frame identity/framing/codec validation, replay, PTT leases/concurrency, blocking, bandwidth, slow consumers, reconnect and independent gameplay wire traffic. The real socket test compares persisted world data before/after actual binary audio and asserts the replication callback receives no audio. Codec tests exercise speech-band reconstruction and bounded capture worklet resampling; lifecycle tests cover permission cancellation and inactive capture.

Responsive Chromium emulation cannot certify microphone hardware/audio routing. Before releasing, use Android Chrome and iPhone/iPad Safari in browser and installed modes to check permission allow/deny/revoke, 44.1/48 kHz hardware, Bluetooth route changes, headphones removal, incoming call interruption, background/lock/resume, low-power mode, cellular packet loss, and two-device acoustic feedback. Test WSS through the approved deployment proxy under sustained load. A browser without AudioWorklet or a server without `/voice` keeps text gameplay usable. The existing Pear node replicates signed world data only; microphone content never enters that path.
