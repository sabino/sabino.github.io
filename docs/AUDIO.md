# Recorded Foley and natural soundscapes

Physical interactions now use **73 distinct CC0 recorded takes** in one PCM atlas: grass, hard ground, sand/gravel, snow, wood, cloth and water footsteps; chopping and mining; metal collisions; dry-leaf gathering; clothing, coins, equipment, doors, blade movement and hits. The atlas contains 77 original slots; one duplicate carpet take is excluded, and some collision recordings intentionally serve more than one action. This is recorded material sound, rather than pitched UI beeps used as physical feedback.

Five compact field-recording banks supply wind, river, birds, crickets and fire. The complete six-bank download is **2,340,998 bytes**. File names include their SHA-256 prefix; changed audio receives a different URL and service-worker revision. Every original file, creator, license, transformation and resulting hash is listed in [PROVENANCE.json](../public/audio/PROVENANCE.json); redistribution terms and author credits are in [LICENSE.md](../public/audio/LICENSE.md). No external requests occur during gameplay: these assets are served from the application's own `audio/` directory, including `/games/verso/audio/` in production.

## Contact contract

`AudioDirector.playFoley(event)` accepts the exported `FoleyEvent` from `src/foley.ts` (also re-exported from `audio.ts`):

- `kind`: `footstep`, `tool-impact`, `pickup`, `swing`, `hit`, `door`, `equip`, `craft`.
- `material`: `grass`, `dirt`, `gravel`, `stone`, `wood`, `sand`, `snow`, `water`, `metal`, `plant`, `cloth`, `flesh`.
- Optional `intensity` and `speed` are 0–1, `pan` is −1–1, and `distance` is in world tiles. Sources at 18 tiles are culled with smooth attenuation inside that radius.
- `delay` is clamped to 0–0.3 seconds. Emit actual tool contact around 0.17 seconds after an accepted swing, and a successful pickup around 0.28 seconds. Footsteps should follow actual walking distance/footfall events, never key presses, blocked movement or render frames.
- `actorId` scopes contact cooldown; `variantSeed` changes deterministic variation. Recorded take selection remembers the previous take per group, so changing event seeds still cannot repeat the adjacent take.
- `action: 'open' | 'close'` selects the correct door recording. `action: 'release'` on a swing produces a short physically modeled bow-string release on the **effects** bus; it stays audible when music is disabled. Non-metal staff swings use soft movement recordings rather than metal clashes. A clash requires an actual hit.

Existing `play(event)`, `start(seed)`, `setWorld()`, `setIntensity()`, `setMuted()`, `pause()` and `dispose()` remain compatible. Physical aliases (`step`, `blade`, `hurt`, `enemy-death`, `dash`, `click`) resolve to recorded Foley. Fictional mind transfer/radio/ability signals retain deliberate electronic effects. Construction and settings changes are silent; `start()` creates/resumes audio only from an explicit user gesture.

## Location and music

`setEnvironment(location,time)` consumes canonical location/time signals at most 2Hz. Outdoor field recordings follow exposure, actual nearby water/trees, daylight and habitat. Day birds and warm night crickets fade out indoors and in unsuitable biomes. Water still contains incidental field-recorded wildlife, so its faint background calls are not an authoritative animal simulation. The game currently reports clear weather; no invented rain layer is added.

Wind, water, birds and insects use at most four reusable recorded loops with 1.35-second exponential crossfades. Their seams were edited with equal-power overlaps; start offsets vary deterministically. The short fire recording plays intermittent localized crackles with cooldowns instead of repeating continuously every few seconds. NPC work uses distant real material impacts; social activity uses quiet clothing/handling sounds. Grazer/predator hooks currently render vegetation movement, not fabricated animal vocal imitations. Broader species-specific recordings remain a future sound-bank increment.

The location-aware composition grammar remains seeded. Acoustic taverns use noise-excited delay-line strings, while temples use damped inharmonic resonators and modal fifths. Electronic civilizations favor resonators. Continuous synthetic drones and noise masquerading as wind/water, synthetic bird chirps, and triangle-note plucks have been removed from the main world soundscape. Wilderness music is sparse with long phrase rests. Existing two music buses allow note tails and semantic location changes to crossfade without abrupt cuts. These are original generated compositions and physical instrument models, not imported commercial songs.

## Cache, limits and mobile lifecycle

The atlas decodes once and is reused by every recorded contact. `SoundBank` deduplicates requests, limits concurrent loads to 2, bounds streamed bytes to 6 MiB per bank and request/decode lifetime to 12 seconds. Failures back off 15 seconds with at most 3 attempts rather than loop silently. Decoded shapes are checked (mono, positive duration≤45 seconds, sane sample rate/length) before any compact allocation. Banks are retained at 24 kHz or less even on high-rate devices, within 24 MiB total. At most 20 instrument buffers are retained. Initial loading exposes diagnostics; only the latest 12 pending contact events can wait, for at most 300ms. Stale contacts are dropped, never replayed in a burst.

`AUDIO_LIMITS` preserves 48 transient sources, 12 ambient voices, 12 reserved effect slots, 96 cooldown records, 100 ms scheduler ticks, 240 ms lookahead and at most 4 catch-up music notes. Field loops reuse their source/bus until disposal. Transient nodes disconnect on completion. Instrument resonators use recurrence rather than per-sample trigonometric/exponential loops. These budgets bound retained resources; a browser decoder's temporary internal allocation is implementation-dependent.

Master, ambience, music and effects preferences persist locally. Voice has its own context and capture/output settings: this module never requests, records, stores or handles microphone data. Voice activity ducks music to 28% and ambience to 48%, with 120ms attack and 1.3-second recovery; physical effects remain clear. Pausing/backgrounding clears pending contacts, cancels scheduled transients, fades the game master and suspends its context. Resume skips missed events. iOS interruption/autoplay recovery remains dependent on an explicit tap when required.

Diagnostics expose sample readiness/failures/loading/decoded bytes and `foleyPlayed`, `foleyPending`, `lastFoley`, alongside existing source counts and audio settings. No audio content enters diagnostics or persistence. Public static sample assets may be cached by the service worker; microphone audio never does.

## Verification

```sh
node --experimental-strip-types --test tests/audio-atmosphere.test.ts tests/audio-director.test.ts tests/foley-bank.test.ts
```

Tests cover material/action mapping, contact delays, no adjacent repeated takes, sample hashes/licenses/actual PCM energy, deterministic physical instruments, bounded load/decode/concurrency, stalled network recovery, disposal races, high-rate memory bounds, source limits, zone fades and voice ducking. Browser QA should load each bank, walk on actual ground, make a real accepted tool contact, and verify `foleyPlayed`/sample diagnostics. The audition artifact at `.dream-loop/audio-revamp/foley-audition.wav` is a synthetic arrangement of licensed game samples, not microphone capture.

Real-device listening remains necessary for phone speaker/headphone/Bluetooth balance, iOS routing/silent-switch behavior, incoming calls and installed-app restoration. Waveform checks and browser emulation do not establish subjective sound quality.

Primary implementation references: [Web Audio buffer playback](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode), [browser audio codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs), and Julius O. Smith's [physical audio signal-processing text](https://ccrma.stanford.edu/~jos/pasp/). Short Foley uses PCM/WAV and ambience uses MP3 for practical Android Chrome/iOS Safari decoding, independent of voice transport codecs.
