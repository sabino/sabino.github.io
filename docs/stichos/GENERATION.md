# Stíchos generation

## Continuous world and climate

`InfiniteWorld(seed, generation)` addresses every sample by world coordinates and a named seed stream. Generation 3 is the default for new lives. Tiles are grouped into 16×16 chunks, with at most 160 resident chunks; eviction and reversed travel reproduce the same terrain, resources, and people. Negative coordinates use floor-based lattice addressing. Town discovery queries settlement coordinates directly and does not generate terrain chunks.

The [user-supplied biome example](https://www.reddit.com/r/godot/comments/1q5mh01/randomly_generated_map_with_biomes_and_infinite/) motivated stronger regional structure. The implementation uses our own bounded value-noise sampler. It applies coordinate displacement from two independent broad fields before sampling altitude, moisture, and regional cold. This follows the general domain-warp mechanism described in the [Godot FastNoiseLite documentation](https://docs.godotengine.org/en/stable/classes/class_fastnoiselite.html#class-fastnoiselite-property-domain-warp-enabled); no Godot runtime or third-party noise library is required.

Altitude combines broad regions, intermediate folds, and local detail. Moisture and regional cold use different seeds, spatial offsets, and scales. Smooth nonlinear remapping increases regional contrast. Effective cold also rises with altitude; temperature decreases as either regional cold or altitude increases. All generated climates remain below freezing, preserving the cold Stíchos setting.

Four continuous suitability weights combine these fields:

- **Highlands:** increasing elevation favors exposed mineral terrain.
- **Marsh:** low, moist ground favors wet botanical pockets.
- **Frostwood:** comparatively milder, sufficiently moist ground favors forest.
- **Tundra:** colder or drier ground favors open snowy terrain.

Weights are nonnegative and normalized. Their dominant value selects the terrain/ecology label; intermediate weights remain available through `world.climate(x, y)` for rendering and future ecological rules. Moisture and altitude determine low water pockets; colder moist terrain can become ice. These thresholds and climate scales are design choices for this prototype, not claims that the source documents specify a climate simulation.

Town positions, dimensions, clan affiliation, and local buildings come from separately addressed streams. A three-tile-wide trunk-road grid connects settlement streets. Water crossings become bridges, building intersections become arcades, and solid props cannot occupy trunk roads. Climate variation therefore cannot terminate the continuous walking routes or relocate opening quest anchors.

## Cities, villages and distinct buildings

Generation 3 places major cities on a 640-tile lattice. The intervening road network uses one-third of that spacing, with all crossings rounded consistently to integer coordinates. Each city-to-city trunk route has two smaller stops. Their seeded offsets create ordinary neighboring gaps around 190–237 tiles; some are tiny hamlets. Several junctions away from those trunk routes remain empty, creating longer stretches of wilderness. Negative addresses follow the same rules.

A city has exactly one church. Villages and hamlets use a compact civic hall, workshop or inn as their main building. Seeded rank and layout rules vary the number of surrounding houses, greenhouses, storehouses and workshops, their footprints and their proportions. Every footprint tile records its actual `buildingKind`, so the renderer draws the appropriate structure without inventing another church or occupied wing. North/south doors and interiors remain part of collision geometry. Building purpose also selects its usable fixture: workshops have benches, inns provide rest, greenhouses hold plants, and storehouses contain supplies.

The origin keeps the canonical people, resource nodes, radio and cathedral anchors. Its four smaller buildings are explicitly a greenhouse, workshop, inn and storehouse. Other cities contain seven buildings, villages three or five, and hamlets one or two; the origin has five. Cities keep the archivist, engineer and civic professions, while hamlets have a smaller population. All settlement ranks provide herbs, rest and crafting stops along the journey.

Settlement metadata queries may cover up to 2,048 tiles in generation 3 without creating terrain chunks. This lets correspondence select a real distant recipient while avoiding an expensive terrain scan. The climate fields remain generation 2's coherent regions, so the longer travel crosses existing continuous biome transitions.

## Excavated botanical vaults

Generations 2 and 3 place open-roof excavations between settlements. The first lies around (40, 40) in generation 2 and (107, 107) in generation 3. Other districts independently receive a site with a one-in-three seeded chance. Generation 3 scales the district and southern approach with its wider road network, keeping excavation rooms away from settlement footprints. Each 32×32 layout is generated from constrained room partitions, a connected room graph with extra cycles, protected corridors, and cellular smoothing. A final flood fill removes isolated floor cells. These stages adapt the methods described in [Vagabond's first generation article](https://pvigier.github.io/2019/06/23/vagabond-dungeon-cave-generation.html) and [its follow-up](https://pvigier.github.io/2019/06/30/vagabond-dungeon-cave-generation-part2.html), using Stíchos's own visual style and code.

The rooms exist directly in the continuous overworld. Floor and wall tiles carry a `site` identifier and have no roofed-building identifier. Their south entrance connects to the trunk road through a three-tile-wide approach, including bridges where necessary. A road sign points north toward the excavation. Two raiders occupy deep connected floor positions, and an actual loot chest sits at the generator's distant reward point. Sites do not displace settlement anchors. Natural solid props are excluded from excavation passages.

`world.vaultsAround(x, y, radius)` exposes site centers, entrances, and reward positions without generating terrain chunks. At most 32 generated vault layouts are retained alongside the bounded terrain and noise caches. Generation 1 has no excavations, so pre-existing wilderness saves keep their original geography.

## Saved-world compatibility

The world-generation version is separate from local architectural `terrainRevision`. Existing saves without `worldGeneration` restore generation 1, preserving their original wilderness, solid props, and temperatures. Generation 2 retains its climate, settlements and vault positions; generation 3 changes settlement spacing only for new lives. Six pre-change wilderness chunk hashes verify generation 1 byte-for-byte. Eight more fixtures verify generation 2, including origin architecture, villages, vaults, negative coordinates, resources and residents.

The current origin cathedral remains centered at (0, −5), with half-width 11 and half-depth 4; northern houses sit at x=±16, and the origin settlement radius is 21. Local architecture migrations are handled by the session save validator.

## Verification

```sh
node --experimental-strip-types --test tests/stichos-world.test.ts
```

World checks cover deterministic seams at positive, negative, and million-tile coordinates; bounded eviction and exact regeneration; uninterrupted road traversal from −1600 to +1600 on both axes for three seeds; reachable town interiors and opening resources; four climate regions and terrain variation; smooth climate weights across chunk seams; altitude cooling under comparable regional conditions; and settlement discovery without chunk generation.

World integration checks additionally follow actual passable site tiles from the road to the chest across 24 seeds, verify every room floor is reachable, confirm exposed walls physically block movement, and check guard placement, signs, loot, and negative-coordinate determinism. The independent vault tests exercise topology across 128 seeds.

Generation-3 checks sample settlement spacing and ranks across 100 seeds, verify one church per city and none in smaller settlements, check complete archetype footprints and accessible fixtures/residents, and follow rounded roads from −1920 to +1920 along both axes plus off-axis crossings. They also confirm bounded cache regeneration, preserved generation-2 climate, and connected wider vault approaches.
