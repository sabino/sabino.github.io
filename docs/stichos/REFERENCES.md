# Generation references for Stíchos

Sabino supplied these references during development on 10 September 2026. Vagabond is the reference for the structure and interactions of a procedural sandbox RPG. **Keep Verso’s current visual style**, as explicitly requested. These references do not replace Destino: Stíchos as story canon.

## World and climate

The [Godot biome discussion](https://www.reddit.com/r/godot/comments/1q5mh01/randomly_generated_map_with_biomes_and_infinite/) describes combining altitude, temperature, and moisture and asks how to make regions coherent. The useful design direction is to couple the fields meaningfully and separate broad regions from local variation. A noise function’s frequency alone does not define an interesting world. Stíchos keeps its ice-age climate while varying cold, wetness, high ground, forest cover, marsh, and exposed tundra. The implementation and compatibility contract are in [GENERATION.md](GENERATION.md).

The [LPC world-generation thread](https://opengameart.org/forumtopic/procedural-world-generation-using-lpc-assets) shows an ordered pipeline: geography, terrain tiles, rivers and roads, and biome objects. Its discussion of clumped trees, clear routes, and layered terrain details is especially relevant. Our map and art are separate systems: the collision and interaction world must be valid before decorative modules are composed over it. No LPC images are embedded in the Stíchos build.

## Connected excavations

Pierre Vigier’s [dungeon and cave generator, part 1](https://pvigier.github.io/2019/06/23/vagabond-dungeon-cave-generation.html) separates space partitioning, room creation, graph connections, corridors, and constrained cellular growth. Fixed passage cells preserve the intended connections while surrounding cells produce organic contours. [Part 2](https://pvigier.github.io/2019/06/30/vagabond-dungeon-cave-generation-part2.html) removes unreachable pockets and treats the tile presentation as another stage. Stíchos adapts that graph-first principle to botanical vault excavations in its continuous world; this does not claim a complete multi-floor dungeon system.

## Equipment as a generated object

[Staff Maker](https://snoopethduckduck.itch.io/staff-maker) and [Sword Maker](https://snoopethduckduck.itch.io/sword-maker) generate pixel-art weapons. Staff Maker links to a [fork of Deep-Fold’s generator](https://github.com/BumbertFiddlesticks/SpriteGenerator), including cellular growth and separate drawing/coloring stages; Sword Maker links to its [shader project](https://github.com/BumbertFiddlesticks/Sword-Maker). The original [Deep-Fold tool](https://deep-fold.itch.io/pixel-sprite-generator) is another useful reference for procedural silhouettes. The creator pages found were Staff Maker and Sword Maker; a separate Swarm Maker was not identified.

Verso’s `equipment.ts` is an original implementation inspired by this separation. A body seed and weapon kind choose material density, length, breadth, curvature, crown, binding, and core. A connected structural mask receives constrained botanical growth, edge outlines, and palette shading. The same construction controls combat: greater length extends reach; greater mass increases impact and recovery time; the core determines a successful-hit effect. UI icons and held weapons use the same pixels. No upstream code, font, or exported sprite is embedded.

The subsequently supplied [Procedural Sword Generation article](https://medium.com/@snoopethduckduck/procedural-sword-generation-69b8b7bc197) explains the same [Shadertoy slBXWc](https://www.shadertoy.com/view/slBXWc) reference. It separates gem masks from a constrained, mirrored handle, protects a central connection, and colors and shades those structures in a final composition pass. The primary article was accessible; the shader viewer and supplied Freedium mirror were not fetched successfully. The implementation reasoning comes from the article, not an unobserved shader execution.

## Plants from reusable growth rules

[Sprator](https://github.com/yurkth/sprator) demonstrates a compact cellular-automaton sprite generator with mirrored structure and outlines. Together with the sword article, it is a useful reference for separating the structural mask, growth rules, and material treatment. Mirroring alone is not suitable for every organic object: botanical growth can preserve a connected stem while varying leaf placement and asymmetric branches.

Verso’s `botany.ts` applies that direction to cequin, heartleaf, emberroot, and mushrooms. A seed chooses stem dimensions, branching, leaf geometry and arrangement, buds, roots, and palette. The visible biomass determines a finite harvest yield. The world sprite, hover description, interaction prompt, and actual harvest share the same profile. The teaching garden keeps known yields; existing generation-1 lives preserve their earlier harvest amounts. This is a vocabulary of four botanical families with generated varieties, not an assertion that an unlimited biological taxonomy or arbitrary medicinal effects have been implemented.

## Sandbox reference and scope

The [Vagabond Steam page](https://store.steampowered.com/app/1673090/Vagabond/) describes generated worlds populated with villages, gathering and crafting, quests, dungeon combat, skill progression, and several other sandbox activities. For Verso the useful direction is a world whose people, needs, resources, and locations give one another purpose. This is not a claim of feature parity: multiplayer, housing, guild simulation, a complete war economy, and the full Sallas mystery are not implemented.

The current local work and dispatches are grounded in actual generated resources and named recipients. Physical items belong to bodies; Theo’s remembered tasks and decisions survive mind travel. Future systems should extend that relationship rather than add unrelated minigames or substitute a new visual style.
