# Voice, mobile, atmosphere and living-world verification

Implemented locally on `feat/voice-mobile-living-world`, based on `cc7fd61`.
The starting working tree was clean. Existing tracked and ignored work was preserved;
no reset, stash, clean, force overwrite, deployment, push, DNS or production configuration
change was performed. Specialists had explicit exclusive file ownership, then handed
shared integration files back to the lead; independent reviewers did not edit files.

## Delivered behavior

- Separate authenticated `/voice` WebSocket relay, binary 16 kHz speech, spatial
  whisper/normal/shout at 3/14/42 world tiles, receiver filtering, attenuation/panning,
  rear muffling and cached wall/door occlusion. Explicit listening/mic consent,
  hold/toggle PTT, device/input/output/per-player controls, blocking, reconnect and
  mobile suspension handling. Independent admission, bandwidth, buffer and abuse limits.
- Phone movement/run/combat/equipment controls, accessible bounded panels, touch-first
  phrases, compact chat with focus restoration and usable reduced keyboard viewport.
  Observed installed-window mode and audio/viewport diagnostics are exposed honestly.
- Original procedural biome/building/culture/time soundscapes, distinct tavern/temple
  music, ecological ambience, bounded synthesis, crossfades and voice-aware ducking.
- Visible 24-minute day/night cycle, privately persisted server calendar, capability
  negotiation for older clients, ecological wildlife with authoritative encounters,
  finite observation notes, individual NPC traits/routines/trust/warnings and gossip.

Implementation and operator contracts: [voice](VOICE.md), [mobile](MOBILE.md),
[audio/provenance](AUDIO.md), [living world](stichos/LIVING-WORLD.md),
[ownership and integration](INTEGRATION-2026-09.md).

## Commits and exact files

- `e4ebc07` — shared world signals and procedural location-aware atmosphere.
- `1c95310` — authenticated spatial voice and authoritative living-world simulation.
- `9c7ade0` — touch-first communication and installed-app-aware controls.
- The subsequent verification commit contains this record and the native living-world
  evidence harness; its exact ID is included in the completion report.

The complete file inventory is below. Reproduce the committed inventory with
`git diff --name-only cc7fd61..HEAD`.

```text
docs/AUDIO.md
docs/INTEGRATION-2026-09.md
docs/MOBILE.md
docs/VERIFICATION-2026-09.md
docs/VOICE.md
docs/stichos/LIVING-WORLD.md
scripts/browser-harness.mjs
scripts/browser-living-evidence.mjs
scripts/browser-mobile-living.mjs
scripts/browser-voice-integration.mjs
server/config.mjs
server/coop.mjs
server/index.mjs
server/voice.mjs
src/app-mode.ts
src/atmosphere.ts
src/audio-settings.ts
src/audio.ts
src/install.ts
src/stichos/app.ts
src/stichos/experience.ts
src/stichos/fauna-art.ts
src/stichos/living-world.ts
src/stichos/mobile-ui.css
src/stichos/mobile-viewport.ts
src/stichos/multiplayer-protocol.ts
src/stichos/multiplayer.ts
src/stichos/npc-society.ts
src/stichos/render.ts
src/stichos/room-authority.mjs
src/stichos/session.ts
src/stichos/shared-combat.ts
src/stichos/voice-acoustics.ts
src/stichos/voice-capture.worklet.js
src/stichos/voice-protocol.ts
src/stichos/voice-ui.css
src/stichos/voice-ui.ts
src/stichos/voice.ts
src/stichos/world-acoustics.ts
src/stichos/world-signals.ts
src/stichos/world-time.ts
src/stichos/world.ts
tests/audio-atmosphere.test.ts
tests/audio-director.test.ts
tests/mobile-layout.test.ts
tests/stichos-living-authority.test.ts
tests/stichos-living-world.test.ts
tests/stichos-voice.test.ts
tests/stichos-world-acoustics.test.ts
```

## Automated gates

Commands ran in the repository through `rtk proxy`:

| Command                                                                                  | Result                                                                               | Evidence                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `node --experimental-strip-types --test tests/*.test.ts` (the complete `npm test` suite) | 473/473 passed, 0 failed/skipped, 49.40 s                                            | `.dream-loop/integration-tests-final.log`  |
| `node --test pear-node/test/bridge.test.mjs`                                             | 5/5 passed, 0 failed/skipped, 2.35 s                                                 | `.dream-loop/pear-bridge-tests-final.log`  |
| `npm run build`                                                                          | TypeScript `tsc --noEmit`, Vite production build and offline asset generation passed | `.dream-loop/integration-build.log`        |
| `prettier --check` on every file changed by this branch                                  | Passed                                                                               | `.dream-loop/integration-format-final.log` |

The production build generated 31 offline assets, version `ad358e94669893b4e68e`.
Vite reports a non-blocking large-chunk warning: the main world bundle is 748.89 kB
(267.11 kB gzip). This is not a low-end-device performance certification.

## Native browser evidence

All interaction used isolated agent-workspace Chromium, native touch/mouse/keyboard
events and read-only diagnostics. No physical device, Android emulator, host Chrome
profile or production room was used. Screenshots and result JSON remain local in
the ignored `.dream-loop` directory; no microphone content was written there.

**Mobile:**

```sh
node scripts/browser-mobile-living.mjs http://127.0.0.1:39873 http://localhost:4183/
```

22 checks, 43 final screenshots, zero browser runtime/console errors. Viewports:
320×640, 360×780, 390×844, 768×1024, 1024×768, 844×390 and 1440×960.
Includes native movement/release/run, combat/equipment, resident dialogue, preparing
a supply from owned plants, all nine Life tabs, construction/atlas/galaxy/notebook,
quick phrases, focus restoration, audio preferences, room hosting/invitation/chat,
and explicit listen-only consent. A focused input in an emulated 390×390 visible
viewport retains 247 px of world; normal 390×844 retains 673 px. This is a reduced
viewport fixture, not a real mobile keyboard.

Evidence: `.dream-loop/mobile-living-voice/results.json`; representative PNGs:
`phone-play-390x844.png`, `phone-play-844x390.png`, `phone-keyboard-emulated.png`,
`phone-prepare.png`, `phone-life-homes.png`, `phone-voice-settings.png`,
`phone-app-diagnostics.png`, `tablet-joined-room.png`, `desktop-play.png`.

**Compiled-build voice:**

```sh
VOICE_QA_OUT=.dream-loop/voice-integration-production \
node --experimental-strip-types scripts/browser-voice-integration.mjs \
  http://127.0.0.1:40803 http://localhost:4184/
```

Five checks passed with zero browser errors. The speaker and phone listener chose
nearby lives through the actual character reroll controls, joined through an
invitation, and used native PTT. The workspace browser used Chromium's synthetic
microphone flags; no real microphone was accessed. The compiled bundle was directed
to local `ws://localhost:4185/ws` through Connection options before joining.
Exactly 78 frames were accepted and forwarded, with zero drops/rejections/slow
consumers. Listen-only remained microphone-free; speech ducked the game mix;
per-player blocking prevented delivery; microphone-off prevented transmission;
gameplay chat remained connected afterward. The development build independently
passed the same five checks with 76 delivered frames.

Evidence: `.dream-loop/voice-integration-production/results.json`,
`speaker-mic-ready.png`, `listener-phone-listen-only.png`,
`listener-phone-hearing.png`, `listener-phone-blocked-peer.png`.

**Living-world slice:**

```sh
node --experimental-strip-types scripts/browser-living-evidence.mjs \
  http://127.0.0.1:39873 http://localhost:4183/
```

`scripts/browser-living-evidence.mjs` drives native browser inputs and a separate
local authority on port 4187. Its stdin-controlled test clock accelerates time;
this facility exists only in the QA script, not in the product or browser state.
The same inhabited street visibly progresses from 08:15 to 22:17, with rest
routines and daytime birds leaving the active scene. Native walking reaches grazing/fleeing/curious fauna;
Observe records finite bird/grazer field notes. The new `resident:life` choice
shows individual tastes, goals, communication and current duty on desktop and phone.
Ten evidence assertions passed, with 14 screenshots and zero browser errors.
The exact stdin interaction sequence is in `.dream-loop/living-evidence/README.md`;
`.dream-loop/living-evidence/summary.json` contains the compact assertions.
Warning propagation is covered by automated tests, not claimed as a browser encounter.

Evidence: `.dream-loop/living-evidence/evidence.json` and PNGs
`living-authoritative-day-street.png`, `living-authoritative-night-street.png`,
`living-night-resident-rest-routines.png`, `living-resident-personality-phone.png`,
`living-daytime-wilderness-fauna.png`, `living-phone-wildlife-observation.png`,
`living-recorded-fauna-field-notes.png`. The earlier mobile screenshot named
`phone-resident-personality.png` shows the older personal-story dialogue and is
not used as evidence of the new trait system.

## Independent review and fixes

Security/privacy/performance review cleared after real WebSocket regressions for
closing-socket accounting, server-admitted PTT, pre-applied absent-peer blocklists,
ping/pong abuse limits, lease-tail handling and zero-generation acoustic rays.
Independent rerun: 21 focused tests passed. No audio persistence, checkpoint,
logging or Pear replication path was found. A synthetic eight-client, three-talker,
five-second local load smoke delivered 5,166 packets from 738 accepted frames with
zero drops/rejections; five accepted gameplay chats had maximum 1.50 ms local
delivery latency. This short local smoke establishes isolation behavior, not
production capacity or cellular latency.

Living-world/audio review cleared after fixing room scheduler fairness, NPC route
arrival and old-client checkpoint compatibility. Independent rerun: 30 focused
tests passed. All 64 test rooms received living updates; the actual `cc7fd61`
public checkpoint validator and pinned cryptographic verifier accepted the new
authority's unchanged public schema. Cached acoustic rays generated zero chunks
and measured about 0.10–0.15 ms on this host. Cold fauna generation can still cost
more: bounded streaming is used rather than claiming uniform frame time.

Independent final integration/spec review passed 54 focused tests and inspected
the final 473-test/build logs, mobile evidence, compiled voice and corrected
living-world evidence. No critical or important findings remain.

## Limits and checks before release

- Voice is an operator TLS relay, not P2P or end-to-end encryption. Audio is
  ephemeral; the operator can access it in transit. Guest identity is not verified
  account identity. Positions retain existing client-reported gameplay trust.
  Fresh guest identities can evade UUID blocks. Browser-hosted PeerJS rooms retain
  text; they do not acquire this operator `/voice` service.
- ADPCM prioritizes broad modern AudioWorklet compatibility over Opus bandwidth.
  TCP head-of-line delay remains possible on lossy cellular links. The separate
  transports share Node CPU; deployment load testing and monitoring are required.
- This slice has no dynamic weather simulation, livestock/breeding or hunting
  economy. Friendly NPC trust and motion remain personal-life context; room time
  and hostile wildlife consequences are shared. Public-only Pear recovery starts
  a fresh calendar; complete private operator backups preserve it.
- Test Android Chrome and iPhone/iPad Safari in browser and installed modes:
  microphone allow/deny/revoke, 44.1/48 kHz devices, autoplay recovery, calls,
  background/lock/resume, Bluetooth/speaker/headphone routing and feedback.
  Check real keyboard/predictive bars, notch/landscape safe areas, pinch zoom,
  VoiceOver/TalkBack/switch input, low-power mode and long multiplayer sessions.
  Emulated layout and synthetic audio do not certify those hardware behaviors.

## Configuration and deployment awaiting authorization

No production action was taken. After separate approval, deploy the reviewed Node
and browser builds together, forward `/voice` upgrades and `/voice/health` through
the existing TLS proxy, retain `/ws` and origin restrictions, and choose the
documented `VERSO_VOICE_*` limits/ranges. Keep WebSocket payload capture disabled.
No TURN, audio storage, Pear audio feed or external audio asset download is required.
Verify old-client reconnection and the actual WSS proxy with mobile devices before
announcing availability. The Telegram completion report is authorized separately
and is sent only after the implementation/review gates and final commit checks.

The local review build remains available at `http://localhost:4183/`, configured to
use the isolated local world node on port 4185. This is a development process, not
a deployment or an always-on service. Test browser workspaces, accelerated-clock
authority 4187 and compiled-build preview 4184 were stopped after verification.
