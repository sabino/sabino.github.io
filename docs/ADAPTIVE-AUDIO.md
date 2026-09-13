# Adaptive score and semantic sound: living systems batch

This is an original procedural composition and contact-sound pass. It imports no music, game audio, dialogue or imitation of a named commercial soundtrack. Existing recorded contacts/field recordings remain byte-for-byte unchanged with their CC0 provenance in `public/audio/PROVENANCE.json` and `public/audio/LICENSE.md`.

## What changed

The old music sequencer made a probability decision at each pulse, chose a scale degree, then synthesized a 2.2-second plucked delay-line string or 3.6-second resonator on each missing pitch cache entry. That sparse attack-and-decay patch was the persistent koto-like impression. Music no longer calls that synthesizer. The physical string remains only for the bow-release effect.

`adaptive-score.ts` composes eight-bar, 32-beat statements from three original question/answer motifs. Each includes harmonic support, bass, a development/response and an authored dominant-to-tonic cadence. Seeds select motif/cultural identity and restrained articulation; they do not select unrelated pitches each timer tick. Seven small sustained instrument tables provide breathy flute, reed, bowed ensemble, pipe-like organ, bass, drum and brushed percussion. The browser uses looped buffers, shaped attacks/releases and restrained stereo positions. The score is intentionally quiet under the material sounds and player voices.

| Calendar identity | Musical character                                        | Base tempo |
| ----------------- | -------------------------------------------------------- | ---------- |
| Dawn              | Lydian brightness, upper flute, opening space            | 66 BPM     |
| Day               | Major harmony, reed melody, grounded pulse               | 84 BPM     |
| Dusk              | Dorian color, lower bowed lead, descending response      | 72 BPM     |
| Deep night        | Minor harmony, low flute, missing bars/long rests        | 56 BPM     |
| Special night     | Altered modal color, upper organ, unusual harmonic route | 62 BPM     |

Taverns add brisk reed/pulse interplay; temples use sustained organ voicings. High-technology cultures change the lead; wetlands favor flute; cold and deeper underground environments lower the lead register. A trusted reputation, faction membership or victory adds a short response motif; feared/wanted context darkens support. Home, workshop and dungeon context selects the corresponding place identity. Active production can add a work pulse. Immediate danger increases rhythm density and tempo in the next phrase. Rain softens articulation only when an actual weather signal reports it. Every fourth calm wilderness phrase omits the melody to prevent fatigue.

A context change never restarts a song at the doorway. The next eight-bar boundary reads the latest semantic signals and crossfades two reusable music buses; already scheduled note tails finish naturally. This deliberately permits roughly 17–34 seconds of musical response latency. Fast danger feedback remains in combat effects rather than restarting the score. Pausing/backgrounding cancels scheduled notes and starts one fresh phrase after resumption, never a burst of missed beats.

## Integration contracts

`AudioDirector.setEnvironment(location, time)` still runs at most twice per second. `WorldLocationSignal.audioContext` is optional and only supplied from simulation:

- `population`, `crowdDistance`, `crowdPan`: actual local people and a spatial anchor. Missing population is zero, missing distance is inaudible.
- `dungeonDepth`, `specialNight`, `reputation`, `factionId`, `home`, `production`, `victory`: semantic inputs. Do not infer events that have not happened.
- Existing canonical time, biome, temperature, architecture, indoor/building identity and truthful weather remain the base inputs.

Social sound now requires at least two nearby people within 14 world tiles and actual work/tavern hours. It is tested at most once per 12-second world slice and has one shared 24-second real-time cooldown across actual residents and scheduled ambient cues (48 seconds in reduced-sensory mode). The sound is quiet nonverbal cloth/handling, low-pass filtered and anchored to those people, with no synthesized speech or intelligible words. It does not follow the listener through wilderness. Real voiced crowd recordings, ceremonies and supernatural chants are intentionally absent until independently licensed/authored and audibly reviewed.

`WorldSoundEvent` additionally accepts `species: bird | grazer | boar | wolf` and the actual fauna state. Authored calls use species anatomy, short contour patterns, breath and fear/attack envelopes; calm and fleeing birds, grazers, boars and wolves differ. Explicit `hurt` and `death` states produce brief raised/dropping calls; their event cooldown identity is distinct from a preceding idle/growl so an accepted injury cue is not swallowed by it. Sleep emits no call. Calls are spatially attenuated within 18 world tiles, culled by ambience polyphony, cached by species/state/take, and cannot be recorded or persisted by this module. The existing field-recorded bird bed remains habitat/time aware; incidental birds in field water recordings remain a known limitation.

`FoleyEvent` additionally supports:

- Surfaces `wet-earth`, `mud`, `puddle`, alongside grass, dirt, gravel, stone, wood, metal, sand, snow, water and the existing material aliases.
- `footwear: bare | soft | boot | armored`, `weight`, `moisture` (0–1), `interior`.
- Families `construction`, `machine`, `guard`, `crime`, `spell`, `weather`, `ui`, `harvest`, alongside established contact kinds.

Actual displacement/animation contact remains the sole footstep cadence source. Idle input, collision and teleport emit no footstep. Walking/running changes gain/rate; footwear and body/load weight change force; wet soil gains suction; hard metal gains ringing; gravel has granular crackle; wood has a short hollow body. Each surface layers one of four small original microtextures under a licensed main contact. Dirt/gravel/wet earth still share the recorded sand base, and metal still shares the stone base, but their extra textures, filtering and force differ. These are composite sound designs, not claims of twelve newly field-recorded surfaces.

Construction adds debris after the hammer contact. Machines add a bounded three-part ratchet. Guards add weighted footsteps/equipment. Crime confirmation adds latch/equipment movement. Spells layer air and restrained metallic resonance instead of the old swept triangle pulse. Harvest adds close handling to the contact; metal doors add latch resonance. These families use at most two extra recorded layers. Named aliases available to the simulation are `guard-warning`, `crime-witnessed`, `construction-complete`, `machine-cycle`, `animal-harvest`, `loot-claim`, `door-locked`. Main footsteps, sword releases/hits, pickups, equipment, UI fabric ticks and material gathering preserve established sounds.

## Lifecycle and performance

Music owns seven 512-sample tables (~14 KiB) created once per graph, not one PCM buffer per pitch. Music reserves at most 20 source voices under the existing 48 transient / 12 ambient global caps, leaving 12 effect slots. A 100ms scheduling timer places notes on the audio clock with 240ms lookahead. A tick schedules at most 16 simultaneous/near notes (including chord voices), skips late notes, and never catches up expired phrases. Web Audio source nodes are single-use; reusable buffers/buses are cached and ended source/filter/gain/pan nodes disconnect.

Material texture generation runs in later tasks. Animal-call generation yields every 1,024 samples, rather than generating its whole 0.65–1.3-second waveform in one task. The queue is bounded to 12 jobs and 64 cached buffers (worst-case ~5.1 MiB), with one small slice per task. First uncached calls may start within 250ms; stale requests are dropped, not played after travelling away. Pause, world change and disposal cancel pending callbacks. Existing assets still decode through `SoundBank` once with two concurrent loads, 6 MiB input/24 MiB decoded limits and bounded failures. No new downloads were added.

`audio.getDiagnostics().score` reports phrase/zone/identity/BPM, current music voices, notes scheduled/skipped, scheduler calls/max milliseconds, table/cache/queue counts and generation max milliseconds. `audio.getProfile()` returns raw bounded duration rings (1,024 scheduler and 256 generation samples), containing neither PCM nor player data. The settings add a persisted `reducedSensory` preference: softer score, fewer response/brush stems, and no extra physical texture/layers. Wildlife/activity cooldowns double and their output falls to 65%, so the mode actually provides fewer, quieter incidental calls. Existing master/music/ambience/effects settings migrate by defaulting this new flag to false. Voice still ducks only music/ambience and owns its independent microphone context.

Audio creation remains behind a user gesture. Pausing/backgrounding suspends the game graph; visibility restoration resumes only where the browser allows. A subsequent gesture remains necessary on some iOS interruptions. This code does not select or override Bluetooth routes, does not own microphone consent and cannot guarantee the OS silent-switch/audio-session behavior. The independent voice graph is untouched.

## Evidence and limits

Run:

```sh
node --experimental-strip-types --test tests/adaptive-score.test.ts tests/audio-director.test.ts tests/audio-atmosphere.test.ts tests/foley-bank.test.ts tests/stichos-foley.test.ts
npx tsc --noEmit
```

The lane has 41 focused passing tests covering phrase/cadence determinism, five musical identities, contextual changes, buffer/voice limits, phrase transitions, skipped late notes, generated-call lifecycle, all twelve surfaces, species/states, crowd provenance, preferences, sample licenses/hashes and exact accepted contact timing.

`.dream-loop/living-systems/audio/` contains raw Node CPU measurements and seven audition WAVs. The five theme auditions dry-render the real planner/table content at increased listening gain; they intentionally omit browser filters/reverb/ducking and are not substitutes for native Web Audio listening. `footstep-materials.wav` gives four takes for each of twelve labeled materials; `animal-calls.wav` compares four species in calm/flee states. They are original/static game audio, never microphone recordings.

A first microbenchmark identified the old pitch-generation cost and also caught a new full-waveform animal-call spike; the implementation was changed to incremental generation in response. Node microbenchmarks do not establish phone frame time. Native browser scheduler/GC/decode measurements belong in the integrator's browser evidence. Physical Android/iOS speakers, headphones/Bluetooth, interrupt recovery, subjective instrument realism and long-session fatigue still need device listening. No numerical waveform test can certify that a score is exceptionally good.

## Primary research and provenance

- [Web Audio API 1.1](https://webaudio.github.io/web-audio-api/): source lifetime, scheduled audio clock, buffer reuse and interruption states. The implementation schedules/tears down sources accordingly, without copying example code.
- [Chris Wilson, A tale of two clocks](https://web.dev/articles/audio-scheduling): lookahead timing and independent audio scheduling. The design uses bounded overlap and drops obsolete work after stalled frames.
- [WebKit interruption regression 276016](https://bugs.webkit.org/show_bug.cgi?id=276016) and [WebKit issue 273511](https://bugs.webkit.org/show_bug.cgi?id=273511): real iOS interruption limitations. These reports justify retaining a gesture fallback and physical-device checks; they are not assertions that all current Safari versions have the reported bug.
- [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) and the exact OpenGameArt authors/source hashes recorded in `public/audio/PROVENANCE.json`: unchanged CC0 contact assets. No commercial-game soundtrack was downloaded, studied for melody, or incorporated.

## Final integration handoff

Keep one semantic bridge in the experience/session layer. None of these inputs permits a client to change authority, loot, reputation or actor state through the audio module:

1. At the existing 2Hz sample, populate `audioContext` from actual listener/world state: counted nearby scheduled people and their nearest anchor, owned home proximity, active production work, actual joined faction ID, locally observed wanted/feared/trusted status, real dungeon depth/space, and genuine victory/event flags. `specialNight` must refer to a seeded calendar event defined by gameplay, not a separate audio-only random event. Omit unsupported contexts.
2. On an accepted footfall, keep `speed` from actual movement and `material` from `footstepMaterial(tile)`; include `interior` from floor/building state, `moisture` from actual surface/weather and `weight` from normalized body/load mass. Only use `bare/soft/boot/armored` when actual equipment/appearance establishes that category. The fallback remains neutral; do not call grass wet merely because of its biome label.
3. On authoritative fauna injury/death, emit a single `WorldSoundEvent` with the actual species, actor ID, `state: 'hurt' | 'death'`, world-distance and pan. Existing calm/flee/lunge events continue. Harvest completion separately emits `{kind:'harvest',material:'flesh'}` only after the tool/claim succeeds. Neither a failed attack nor a duplicate network state refresh should emit a second reward/contact cue.
4. Production emits a `machine` contact on a completed actual work stroke/cycle; construction emits `construction` on accepted contact/completion. Derive wood/metal/stone from the machine or construction material. Loot emits pickup only after authoritative claim; guards/crime emit localized cues from an actual witness/reporting event.
5. User settings control `reducedSensory`; retain text/icons for every cue. QA may read `getProfile()` and diagnostics, but neither goes in saves/checkpoints.

The 30ms generation-completion assertion identified by independent review is replaced with deterministic generation-quantum draining. A separate post-pause assertion proves queued species calls never arrive after cancellation. A durable ten-resident-plus-ambient regression proves one social clip over six seconds, none at23.9seconds and the next at24seconds.

Native independent review retained eleven successful Web Audio checks and zero console errors. Raw results are in `.dream-loop/living-systems/independent-audio/`. An initial native cold generation tail reached13.7ms; repeated attribution measured species generation at most1.7ms and a surface job around4ms. These are retained honestly:3ms is a soft target, not an absolute guarantee. No subjective listening approval was possible in the reviewer runtime; phone/headphone human audition remains required.
