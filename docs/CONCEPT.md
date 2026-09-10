# Verso — source brief

Verso is an isometric action adventure about a person sent into other people's bodies to make small changes across a multiverse. Its retro sci-fi interface presents clear assignments, while its slipstream story gradually makes the player question who benefits from their work. The defining tension is to complete a mission while affecting its world as little as possible.

This brief compares `Verso Game Concept.pdf`, `Verso Game Concept.docx`, and `Verso.pptx` supplied by the author. The PDF and DOCX contain the same substantive design. The slides restate that design, add controls and references, and revise the audience description. Section titles and slide numbers below refer to those sources; no external source material is required to understand this brief.

## Faithful design pillars

- **A borrowed life.** The player enters their name in a DOS-like system, receives a briefing, and is transferred into a host body in another world. Date, weather, planet, items, and characters can differ between assignments. Death kills the host, leaving recoverable belongings; another host can retry the mission. [PDF/DOCX: Gameplay]
- **Explore before intervening.** The first assignment is always exploration. Cataloging three species is the source's example objective. Actions beyond an assignment can help or harm the world and should have visible consequences. Later mission types include rescue, assassination, preventing chaos, causing chaos, and exploration. [Gameplay]
- **Readable isometric action.** Fluid movement follows an isometric square grid, with melee and ranged weapons, running, jumping, ladders, and dangerous edges. Weapons derive from recognizable templates whose details vary with the world seed. [Weapons; Abilities; slides 11–14]
- **Worlds that respond.** Procedural levels, items, characters, and music draw on a seed influenced by play. Forests, snow, roads, and worlds with distinct palettes are named examples. This is intended to give a handcrafted impression rather than generic noise. [Core Concepts; Procedurally Generated Levels; Environments; Outstanding Soundtrack]
- **A conspiracy disclosed through play.** After the first three levels, the player learns that they are a multiverse engineer employed by a large company, which auctions changes in other worlds to the highest bidder. The campaign has an ending; continuing indefinitely remains possible. [Story]

## Visual and audio direction

The source calls for a classic NES feeling, rich 8-bit-inspired pixel art, and an isometric view, with modern effects allowed beneath a pixel treatment. Diablo II/III and DeathSpank inform the action-adventure structure. The slides explicitly name EITR as a mechanics reference and Monument Valley and Pavilion as environment references. These are reference points, not assets to copy. [Core Concepts; Incredible Pixel Art; slides 15, 18]

Embedded slide images repeatedly show floating square-tile islands, green forest dioramas, visible cliff strata over an abyss, stairs and bridges, architecturally impossible spaces, and saturated blue/purple effects. Dark pixel action scenes establish a useful contrast with quiet, readable environments. The title artwork includes the phrase **“a game about multiverse, species and selfishness.”** [slides 1, 5, 7, 9–10, 15, 17–20]

For the browser slice, favor an original forest/anomaly diorama: layered tile cliffs, restrained lush foliage, legible host and creature silhouettes, a distant void, and bright cyan/teal science-fiction signals. Preserve visible pixels and deliberate low-resolution edges. Keep mission information integrated into a terse terminal-style HUD. Event-responsive synthesized music and effects can establish the intended procedural soundtrack without shipping a large audio library.

## Browser vertical slice priorities

The current request makes a browser implementation the delivery target. Unity and the console platforms listed in the source are original production assumptions, not constraints on this prototype.

1. **Complete playable loop.** A name/terminal entry leads to a clear exploration briefing, host deployment, three species to discover/catalog, and a return or extraction action that produces a debrief.
2. **Immediate game feel.** Responsive movement, running, a defensive attack, a purposeful jump or evade, interaction feedback, collisions, and readable health/energy feedback. The source explicitly specifies WASD, Shift to run, and mouse or arrow keys to attack/shoot. [slides 11–13]
3. **Consequences that demonstrate the premise.** Track unnecessary destruction or aggression separately from mission completion. Let the debrief reflect the player's intervention footprint; the exact formula is an implementation choice, not an existing source rule.
4. **One coherent puzzle.** Give exploration a small spatial or environmental obstacle, with visible cause and effect. Puzzle details are not specified in the source and should be authored for this slice.
5. **Borrowed-body recovery.** A host loss and retry should retain player identity, with a clear explanation of what resets. Recoverable inventory can remain small; this should establish the premise before building a full loot economy.
6. **Replayable worlds.** Use deterministic generation or seeded variation in layout details, species placement, effects, or mission details, while guaranteeing traversable paths and achievable objectives.
7. **Browser readiness.** Provide a local development command and production build, persist useful progress locally, expose controls and audio settings, and test the actual game in an isolated browser. Validate an entire mission, retry/reset, and viewport behavior.

This priority list defines a feasible demonstration, not a claim that every source feature has been implemented. Track delivered behavior and known limitations in the project README as implementation develops.

## Scope explicitly deferred

- A 15-hour narrative campaign, all mission types, the complete corporate revelation arc, and a designed ending.
- Real-time cooperative/PvP multiplayer, instant challengers, different simultaneous player missions, and networking. The slides specify optional multiplayer for up to four players. [Multiplayer; slide 2]
- Infinite runtime-generated terrain with every input influencing the next world, full procedural character generation, and a broad weapon/loot system.
- Machine-learning-driven adaptation and comprehensive novice/expert balancing. The slides simplify the documents' machine-learning goal to procedural algorithms; neither provides a model, training data, or balancing specification. [Design Goals; slide 3]
- World-specific advancement in shooting range, attack speed, and melee strength, plus persistent cross-world jumping/running progression. [Abilities]
- Voice calling the player by name, a production-grade generative score, and console releases.

## Source differences and decisions

| Topic             | PDF / DOCX                            | Slides                                                               | Prototype interpretation                                                                           |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Audience / rating | M, violence and strong language       | 10+, fantasy violence, broad child/adult appeal                      | Use stylized fantasy conflict; no need for strong language or gore. No official rating is claimed. |
| Multiplayer       | “Hybrid multiplayer,” co-op or battle | Optional, up to four players                                         | Single-player slice; preserve seed-based architecture where practical.                             |
| Controls          | WASD, jump, ladders, lethal edges     | Adds Shift running, mouse/arrow combat                               | Present explicit browser-friendly bindings and verify them in play.                                |
| Adaptation        | Machine-learning premises             | Procedural algorithms                                                | Deterministic procedural variation first; no unsupported adaptive-AI claim.                        |
| Sample assignment | First mission always explores         | Later example: kill suspicious person, fireball sword, find princess | Keep the first assignment exploratory; the slide example is not the opening mission.               |
