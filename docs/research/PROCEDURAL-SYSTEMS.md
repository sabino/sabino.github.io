# Mathematics for compositional generation

The shared principle is **generate a structure, derive its behavior, then validate that behavior in context**. A seed supplies reproducible choices; it does not supply meaning or guarantee playability. The equations below separate implemented mechanisms from proposed extensions.

## Reproducible, independently addressed choices

The current implementation derives streams from a world seed and semantic addresses:

```text
subseed = H(worldSeed, subsystem, entity, property)
descriptor = generator(PRNG(subseed), worldConditions)
nextWorldSeed = H(rootSeed, crossing, recordedActionHistory)
```

`H` is a deterministic 32-bit mixing function, not a cryptographic hash. The state space is finite and collisions are possible. The current code separates broad streams such as topology, anatomy, and naming; it does not yet address every individual property independently. Generator version and parameters are part of the reproducibility contract. Future changes need explicit migration or retained old generators.

## Structures with constraints

The current terrain generator connects room centers using a minimum spanning tree, adds some extra edges, and turns edges into traversable corridors. Tests flood the tile graph from the landing and check that objectives and inhabitants are reachable. This is a global connectivity check:

```text
reachable = floodFill(traversableGraph, landing)
valid = everyRequiredAnchor belongsTo reachable
```

For richer buildings and materials, local constraint propagation can govern compatible neighboring parts. [The original WaveFunctionCollapse repository](https://github.com/mxgmn/WaveFunctionCollapse) demonstrates overlapping and tile-based local constraints. A cell has a domain of possible parts; selecting one removes incompatible possibilities from neighbors. Contradictions require recovery, backtracking, or regeneration. Local validity alone does not prove that a level is connected or a mission is solvable. WFC is a possible future detail generator, **not an algorithm already used by Verso**.

The current body grammar similarly requires parent references to form a connected acyclic graph and appendages to attach to valid nodes. Geometry, proportions, and usable limb reach are checked separately from appearance. Longer-term grammar rules should attach interfaces and capabilities to components: a hinge accepts rotational constraints, a grasper exposes contact goals, and an elastic member stores usable energy.

## Properties that change function

The current game approximates segment volume and mass, combines material properties with dimensions, and derives movement and equipment handling. These are bounded game rules inspired by physical relationships. The generated lift threshold, damage, elemental power, and material coupling coefficients are **design heuristics**, not experimentally calibrated physical laws.

Useful physical relationships for a future shared object simulation include:

```text
mass = density * volume
weight = mass * gravity
springEnergy = 0.5 * stiffness * extension²
rotationalInertia = integral(distanceFromAxis² * dm)
```

That simulation could make a long rigid object useful as a bridge, lever, or weapon depending on supports, attachment, mass, and applied force. The physics GIF on PPTX slide 20 motivates these interactions. Merely assigning an object the word “bridge” would not implement them. Current terrain and equipment do not yet share movable rigid bodies or constraints.

See [the motion research](PROCEDURAL-MOTION.md) for the implemented two-bone geometric IK, distance-driven phases, body waves, and the boundaries between animation and physically supported locomotion.

## Missions derived from a changing world

[Chapter 7 of the authors' _Procedural Content Generation in Games_](https://www.pcgbook.com/chapter07.pdf), by Cheong, Riedl, Bae, and Nelson, discusses planning-based quests and stories, including preconditions/effects and hierarchical task methods. [The book's official site](https://www.pcgbook.com/) places this alongside generation of geometry, rules, and other content.

A candidate future mission system can represent a verb by its requirements and state changes:

```text
applicable(action, state) = action.preconditions are satisfied
nextState = (state - action.deletedFacts) union action.addedFacts
validMission = a bounded action sequence reaches its goal
```

Planning must consume the actual host's abilities, object affordances, spatial reachability, and resource constraints. For example, restoring a habitat might require transferring charge through a generated conductor, moving a structure, or protecting a pollinator, with different feasible routes in different worlds. This is a design proposal, not present gameplay. The current four assignment families only bind targets to generated entities and reject a few incompatible combinations.

Simulation can produce events without producing a satisfying story. Mission selection needs objectives for coherence, novelty, cost, and intervention consequences, followed by playtesting. A score function can help compare candidates, but its coefficients encode design preferences; optimizing it does not establish an objective definition of “meaning.”

The immediate engineering target is therefore a shared descriptor and action model consumed by generation, simulation, animation, missions, and validation. Expanding that common model is more valuable than multiplying finished worlds or inventing larger seed counts.
