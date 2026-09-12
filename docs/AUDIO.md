# Procedural atmosphere and game audio

Verso generates its sound in the browser. This change contains **no external audio assets, recordings, sample packs, copyrighted compositions, or fetched music**. The note grammars, filtered noise, envelopes, calls and room textures in `src/audio.ts` and `src/atmosphere.ts` are original project code. Existing procedural combat/interaction effects remain available through `AudioDirector.play()`. Asset provenance: original procedural synthesis, authored for Verso; no additional asset license or attribution obligations.

## Integration contract

`new AudioDirector()` is silent and reads only personal audio preferences. Call `start(seed)` from a click, tap or keyboard gesture. It safely does nothing if Web Audio is unavailable. Existing `setWorld(mission, seed)`, `setIntensity(0..1)`, `setMuted()`, `play(event)`, `pause()` and `dispose()` APIs remain compatible with the other game variants.

- `setEnvironment(location, time)` consumes the shared `WorldLocationSignal` and `WorldTimeSignal`. Sample the world at **at most 2 Hz**, not every animation frame. The signal reports actual feature distances, building kind, biome, architecture and the authoritative/solo calendar.
- `setVoiceActivity(boolean)` ducks only the game music and ambience. It does not own, pause, capture or route voice. The voice service has a separate AudioContext and separate volume controls.
- `playWorldEvent({ kind, distance, pan?, id? })` accepts `bird`, `grazer`, `predator`, `flee`, `social`, `work`. Distances are world tiles; pan is -1..1. Map living-world `bird/bleat/growl/rustle` hints to `bird/grazer/predator/flee`. Stable IDs enable per-animal cooldowns. Sounds beyond 18 tiles are culled; those heard indoors are reduced. This ambient rendering is not a security boundary for player voice.
- `getSettings()` / `setSettings({ master, ambience, music, effects, muted })` expose locally persisted values from 0..1. Settings changes never request audio activation. `verso.audio.settings.v1` contains only these five scalar preferences; storage restrictions/corruption are handled without interrupting play.
- `getDiagnostics()` exposes audio context state, current zone/culture/day phase, paused/speech-duck status, settings and live source counts. It contains no audio data.

## Location and time rules

`selectSoundscape()` is a pure, seeded, testable selector. Low-tech taverns use short plucked triangle tones, optional octave partials and a lively pentatonic rhythm. Temples use sustained sine voices in modal fifths, a deeper drone and longer filtered echoes. High-tech architecture changes the timbre toward smooth electronic resonance; gothic/basalt architecture selects resonant culture. The civilization/architecture seed varies rhythm and melodic contour. These are fictional world traditions, not imitations of particular real-world cultures or compositions.

Workshops have sparse measured accents, settlements favor daytime activity, houses have a quieter tone, and danger introduces a tense scale and pulse. Tavern activity peaks in the evening and subsides after closing hours. Wilderness phrases include extended rests to limit repetition. Zone changes reuse two music buses with approximately 2–3 second crossfades; existing note tails decay naturally. Echo parameters and continuous layers interpolate smoothly.

Outdoor wind increases on exposed tundra, dunes, highlands and alpine ground. Water requires sampled nearby water. Leaves require actual nearby trees. Fire crackles require a nearby pre-electric lamp identified by the world signal; the system does not assume every light is a flame. Birds favor wooded daylight/dawn and are suppressed indoors and in barren biomes. Insects require above-freezing warmth and suitable non-barren habitat, grow more active after dark, and are suppressed indoors. Settlement work and abstract room murmur respect local activity hours. Murmur is synthesized nonverbal texture, never recorded or generated intelligible speech. Fauna events can provide localized animal calls and foliage disturbances.

The current game does not simulate weather. The shared signal deliberately reports `weather: 'clear'`, so this build does not invent rain or storms. New weather states should be added to that shared contract before rain/wind-storm layers are introduced. Indoor classification currently follows floor tiles rather than detailed roof/material acoustics; no unsupported wall model is assumed for ambience.

## Resource and lifecycle limits

`AUDIO_LIMITS` defines 48 transient sources, a 12-source ambience allowance, 12 reserved effect slots, 96 cooldown records, at most 10 permanent sources (currently 9), a 100 ms scheduler, a 240 ms scheduling horizon, and at most four notes scheduled after a delayed tick. Each ambient time slice can emit at most two events. Missed time slices are skipped, not replayed after resume. Tone/source nodes disconnect on completion. Noise buffers and continuous sound layers are reused across locations; Web Audio source nodes themselves cannot be restarted and are not pooled as reusable one-shot sources.

Music drops to 28% and ambience to 48% while player speech is active. Attack uses a 120 ms exponential time constant; release uses 1.3 seconds to avoid pumping between PTT frames. Effects stay independent. Conservative synthesis levels and a master compressor provide headroom. Voice inputs and any voice limiter belong to the independent voice graph.

Pausing or hiding the page fades the game bus, cancels pending transients, stops the scheduler and suspends the game AudioContext. Resume skips missed notes. The implementation handles Safari's observable `interrupted` state as a resumable state, and exposes `needsGesture` when another tap is needed. It does not use silent-media autoplay bypasses or attempt to force background audio. Dispose closes the context, stops sources and removes visibility listeners.

## Verification and remaining device checks

Run:

```sh
node --experimental-strip-types --test tests/audio-atmosphere.test.ts tests/audio-director.test.ts
```

The suite checks semantic zone/culture/time choices, ecological exclusions, deterministic variation, event caps, settings validation/persistence, silent construction, ducking buses, range/cooldown limits, source budgets, reusable transition buses, delayed-tick bounds, pause/resume/disposal and visibility handling using an instrumented AudioContext. Full-game browser checks should verify the diagnostic zone follows walking indoors/outdoors, sliders remain available on narrow screens, and ambient/game audio resumes only when browser policy allows.

Physical Android/iPhone/iPad listening remains necessary for speaker/headphone/Bluetooth timbre, perceived mix, iOS silent-switch/device routing, incoming call interruptions and browser/PWA background restoration. Browser emulation does not prove those hardware behaviors. No physical-device install is part of this change.

## Primary API references

- [MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices): audio activation after a user gesture; generated buffers/oscillators.
- [MDN AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode): source nodes play once; buffers can be reused.
- [MDN BaseAudioContext state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state): suspended/running/closed and Safari interruption behavior.
- [MDN AudioParam.setTargetAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime): exponential approach for smooth transitions.

No server or deployment configuration is required for this procedural game-audio lane. Voice transport has its own operator documentation and security requirements.
