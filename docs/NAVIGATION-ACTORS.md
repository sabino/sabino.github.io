# World travel and actor persistence

This batch adds two opt-in systems without changing generation seeds or the legacy fauna sampler. The root integrator owns the session, room capability and checkpoint wiring. These APIs do not authorize a client to change another actor or to cross a dungeon transition.

## Navigation contract

`NavigationWorld.cell(x, y)` reads integer **world tile coordinates** and returns open, blocked, or a door with its stable ID, current open state and actor-specific permission. Permission must reflect the actual authoritative lock/property rule. A private locked door is blocked; an unlocked permitted door can be planned through but must still be opened through the normal interaction path.

`HierarchicalNavigator.request(origin, destination)` starts a cancellable incremental job. `step(96)` is a bounded slice, with a hard maximum of 512 operations per call. Collision probes, component floodfill, portal scanning and route reconstruction all yield. The two-level graph consists of connected components inside 16×16 tile sectors and every real passable boundary aperture. A one-tile gate is never skipped because of sparse waypoint sampling. A final cardinal route traverses connected tiles inside those components. Negative coordinates use floor division.

The route is deterministic for the same world state regardless of slice size. It is valid, but not necessarily globally shortest. `portals` gives the crossed sector boundaries for map feedback. Terrain and door state must be checked again while walking. Cached planning is per request; replanning sees current world changes.

The hard bound is 128 sectors per request. Exhaustion reports `budget-exceeded`, **not** a claim that no route exists. The player is asked to select a closer waypoint. A finite sealed component reports `unreachable`. This bounds RAM and CPU instead of silently transporting the actor home. Long routes currently plan before movement starts; streaming the first safe leg while planning later legs is a concrete next increment.

## Player integration

`TravelController` accepts the same world adapter. Its public methods are:

- `lock(direction, run)` starts walk/run direction lock; the supplied direction is normalized.
- `travel(player, homeOrMapPoint, { label, run })` plans physical movement to that point.
- `update({ position, dt, manual, paused, danger, obstructed, crowd })` returns the ordinary `{ x, y, run }` input. Feed it into the existing movement/collision/pose pipeline. It never moves the player itself.
- The optional `doorId` output requests one normal authorized door interaction. Keep waiting for the actual open state; do not mutate `removed` directly in UI code.
- `cancel(reason)` handles Stop, Interact, menus, conversation, background/suspension, death, world change or other explicit interruption. Explicit nonzero manual movement cancels immediately and is returned unchanged in direction. A danger condition cancels unless `stopForCombat` is disabled by the player's settings.
- `feedback` supplies state, destination label, remaining route tiles, reason and run state. Expose the planning, locked, door, arrived and unreachable states. The `route` getter is a UI-only copy; do not request it every simulation substep.

The controller detects a changed obstacle before entering it; the existing mover should additionally supply `obstructed` on a rejected stride to stop immediately at body-radius collisions. It yields to nearby people and replans at most three times. A stationary actor also stops/replans rather than pushing forever. A door waits for up to three seconds because an authoritative request can fail or the owner can change access; this is a navigation acknowledgement bound, not an input debounce. Direction lock stops at a closed door rather than entering a private property automatically.

Camera click conversion, touch ownership, the actual visible lock/Stop control, Go home menu entry and multiplayer endpoint are session/app integration responsibilities. Dialogues and PTT retain their own pointer ownership. Do not serialize TravelController or its routes.

## Persistent actors

`ActorAddress = { spaceId, x, y }`. Existing bodies default to `surface`; dungeon addresses use a stable `underground:<settlementId>:<depth>` namespace. `ActorLedger<T>` stores stable ID, body, current address, home, destination, journey state, speed, last simulation time and revision. The owning domain validates the body schema. A ledger checkpoint has `version: 1`; malformed coordinates, duplicate identities, unsupported states and invalid bodies fail closed.

The root session integrates generated residents with `register`, and captures actual active movement with `update`. `query({ spaceId, x, y }, radius)` uses **current positions**, not spawn chunks or birth homes. Rediscovering the procedural source never replaces an existing body. A culling query cannot delete or modify an actor. A death creates a permanent tombstone; rediscovery cannot respawn it.

The ledger admits up to 2,048 identities and reports saturation instead of evicting a changed/owned/dead actor. This is a bounded first production slice, not infinite persistent storage. Admission saturation needs visible diagnostics; the root must not pretend a rejected admission was saved. A later compact baseline/delta archive can extend capacity without sacrificing existing identities.

`setDestination` starts actual navigation. `advance(time, worldForSpace, { active, openDoor })` processes at most four offscreen actors, scans at most 32 candidates, owns at most eight live navigators, and shares a 96-operation budget. Active actors are excluded so their normal simulation is not doubled. The sorted actor order is independent of registration/checkpoint insertion order. The spatial index updates as actors cross cells.

Coarse travel moves along validated paths in increments of at most 0.2 tile. It never crosses a blocked door and never jumps along a road by elapsed time. An absent actor can account for at most two seconds/four tiles per coarse visit. Offline/resume does not simulate years of catchup or teleport the actor. Existing location and goals persist, and work resumes within normal budgets. A destination in another space waits for an **explicit authoritative portal transition**; `transition` is only for the dungeon/session transition owner. Automatic portal selection between dungeon floors is not implemented in this module.

Only the room authority or a solo session owns the ledger. The integrator must checkpoint it with the room, publish only appropriate visible bodies, and keep old rooms/clients on their previous behavior unless they negotiate `livingSystems: 1`. No navigation request, audio event, sound buffer, connection handle or VFX queue belongs in an actor checkpoint.

## Persistent fauna

`new LivingWorld({ persistent: true, maxNewCells: 2, save })` enables the ledger. `save()`, `validFaunaLedger()` and `defeat(id)` are the authority hooks. The default constructor still uses the deployed absolute-time sampler and produces exactly its previous replay behavior; `save()` is undefined and authority deaths are unavailable without opt-in.

Persistent wolves pursue from their current coordinates, and prey flee with bounded movement. Their birth location no longer imposes the old nine-tile pursuit leash. Current-position queries keep migrants visible through chunks. An actual open floor is traversable; only physical walls, closed doors and unsuitable collision surfaces stop them. Birds still roost out of view at night but their identity remains. Homes/habitat are retained as ecological provenance. Calls in published frames are transient; every stored body has `call: null`.

This first slice has direct local steering for visible wildlife and hierarchical travel for offscreen goals. Visible animals can pause at a complex obstacle instead of routing around it; active hierarchical wildlife pursuit and species-specific cross-space path costs are next increments. Birds can cross water while active; the conservative generic offscreen adapter treats water as blocked rather than simulating an unverified flight crossing. Those limitations are preferable to phasing through structures.

## Evidence and performance

`tests/stichos-navigation.test.ts` verifies one-tile portal reachability across chunks, deterministic routing across tick budgets, bounded failures, permitted door acknowledgements, dynamic obstacles, every interruption, continuous 90-tile actor migration, current-location culling, checkpoint restoration, explicit space changes, death and saturation. `tests/stichos-fauna-persistence.test.ts` verifies pursuit over 25 tiles past birth territory, stateful save/restore, tombstones after the spawn cache is evicted, open-floor entry and real wall collision. Legacy living-world tests remain unchanged and pass.

The native baseline from the browser lane is `.dream-loop/living-systems/performance-before/results.json`. It measured roughly 0.87–1.47 second traversal gaps. These are not explained by the small navigation microbenchmark; the integrator's follow-up phase trace attributed a 1,654.9 ms spike to rendering, versus 12.1 ms generation and 0.2 ms simulation/audio. The integrator owns the terrain/prop raster cache repair.

The reproducible isolated CPU probe is `.dream-loop/living-systems/navigation/profile.mjs`, with raw results in `probe.json` in that directory. Run:

```sh
node --experimental-strip-types .dream-loop/living-systems/navigation/profile.mjs
```

On this host, 20 warm maze-route trials yielded old synchronous A\* p50 **1.573 ms**, p95 **2.952 ms**, max **3.232 ms**. The new incremental slices had p50 **0.019 ms**, p95 **0.058 ms**, max **0.975 ms**; total p50 work was **2.094 ms**, spread across 99 slices. The example path is 100 tiles versus the old shortest path's 94. The benefit is bounded scheduling, not a claim of less total work or shorter routes. The old radius-52 search allocates approximately 108 KiB of scratch typed arrays per search; new sectors use 768 bytes each plus bounded queues/frontier and reconstruct scratch. Eight worst-case actor navigators must remain bounded.

These warm host numbers are not mobile FPS, audio, GC traces, or cold generation measurements. A single `world.cell` callback may itself trigger expensive chunk generation; the integrator must stage that work or provide a warmed adapter. Final native portrait normal/stress traces, controls, path feedback, session save/restore and authority checks remain integration gates.
