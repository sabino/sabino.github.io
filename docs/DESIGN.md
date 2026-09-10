# Visual direction

Verso is a playable isometric diorama. The world takes precedence over the interface: crumbling ivory architecture, deep teal forest, a burning cyan rift, an orange scarf, and rich moss over a suspended stone island. This direction comes from the supplied floating-island, pixel-art, and spatial-puzzle references.

## Tokens

- Void: `#031b24`
- Glass: `#082a31`
- Rift: `#83eee6`
- Parchment: `#ede6cc`
- Moss: `#81913d`
- Ember: `#ed9c49`

The wordmark is a custom pixel grid and the rest of the interface uses a system monospaced face. Thin corner brackets, small square controls, and restrained terminal panels echo the DOS system in the brief. They exist only where there is an interaction, status, or navigational purpose.

## Composition

The fixed elevated isometric island occupies the screen. Mission information sits above the dark upper-left void; a map sits in the upper-right void; health and abilities occupy the bottom edge. A small prompt follows the nearest interaction. On compact screens, the stage scrolls with the player and touch controls replace keyboard hints.

```
 wordmark / mission          island canopy          pause / map
                     ruins       RIFT
               fauna       EXPLORER       sentinel
                    moss / cliffs / falling water
 vessel health              abilities               world seed
```

Intro, journal, briefings, and debriefings use one consistent terminal surface with clear actions. No marketing page or unrelated navigation sits in front of play.

## Asset strategy

The first realm is an authored environment using original generated pixel art. Actors, interactions, weather, particles, attacks, scan markers, navigation, and UI are live. Seeded encounters and mission permutations vary repeat expeditions; full arbitrary terrain synthesis is a later milestone. A static environmental plate must never be described as wholly procedural geometry.

The dream-loop target and prompts are retained in the ignored `.dream-loop` working folder. Production assets are self-contained in `public/art`; no runtime image-generation service or network asset dependency is required.
