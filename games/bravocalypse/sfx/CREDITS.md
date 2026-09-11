# Recorded sound effects

Kenney's [Impact Sounds](https://kenney.nl/assets/impact-sounds) and [RPG Audio](https://kenney.nl/assets/rpg-audio), licensed under CC0 1.0.

The original pack notices are in LICENSE-impact.txt and LICENSE-rpg.txt. File names, source pages and SHA-256 hashes are recorded in sources.json. Playback varies pitch, gain and stereo placement; some game cues layer several recordings.

Improvised instruments reuse these recordings as pitched, velocity-sensitive score samples: wood (`impactWood_medium_000`), metal (`metalPot1`), glass (`impactGlass_heavy_000`), fabric (`cloth1`), and soft fruit/jelly (`impactSoft_heavy_000`, lowered for a soft squashing impact). Object size changes resonance. These phrases are prepared in a dedicated worker; no new audio sources are created per MIDI note.
