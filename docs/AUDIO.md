# Procedural audio

`src/audio.ts` exports `AudioDirector`. It has no asset downloads or runtime dependencies; the browser's Web Audio API produces the score and effects.

Create one director and call `await audio.start(seed)` from the deployment button or another explicit user gesture. Call `audio.setWorld(mission, seed)` on deployment, `audio.setIntensity(value)` as nearby danger changes (range 0–1), and `audio.play(event)` for game events. `setMuted(boolean)` fades the entire mix without restarting the score. `pause(boolean)` suspends/resumes musical time; use it for the pause menu and hidden tabs. Call `dispose()` when tearing down the game. Unavailable or blocked audio does not throw or stop gameplay; another call to `start()` can retry resuming after a gesture.

Supported events: `blade`, `pulse`, `dash`, `scan`, `scanned`, `hurt`, `heal`, `enemy-death`, `relay`, `portal`, `complete`, `death`, `click`, and `step`. Step, combat, and UI effects have built-in rate limits, and a 56-voice ceiling bounds rapid event bursts.

The score combines a seed-specific minor pentatonic motif with gently detuned low drones, moving filtered wind, restrained glass-like partials, and a damped delay. A seeded world changes the root, motif, tempo, and wind register. Higher danger adds understated low pulses and denser notes. Effects use a separate seeded random stream so footsteps and combat do not alter the world's melodic sequence.

The mixer fades state changes, schedules notes ahead of time, drops missed beats after a delayed frame, cleans up completed voices, and compresses the combined output. No microphone, speakers selection, network access, stored audio files, or autoplay is required.
