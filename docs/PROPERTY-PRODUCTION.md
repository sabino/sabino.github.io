# Property, named workers and physical production

This local lane lives in `src/stichos/property-world.ts`; the lead owns its world/session/server/UI/render integration. It is a version 1 **private operator ledger**, additive to the existing deployed systems. It does not replace legacy homes or turn imported personal balances into authoritative funds.

## Working slice and balancing

A generated, vacant, authority-resolved house or land parcel can be bought or rented. A lease lasts 7,200 authority seconds; expiry pauses access/production and retains belongings. Renewing restores access. Purchases cost a deterministic amount based on actual parcel area/seed, with a 280 coin ceiling. The owner has private storage, guest keys, a lock, a home travel target, three furnishing tiers and bounded home rest. Guests receive entrance access, never withdrawal authority. Open doors do not make storage public.

An established origin home can be adopted without transferring coins/items **only** if the authority's `legacyHome(peerId)` proves the generated original home. An arbitrary client body identifier or submitted save is not that proof. Online adapters should return `undefined` until that proof is available; solo integration may use its trusted generated life candidate.

Construction consumes field materials and coins, checks owned bounds, dimensions, terrain, roads, entrances, other buildings/stations and asks the local law adapter. A bounded cardinal flood fill connects the actual entrance to a free face of every existing and proposed station; a blueprint cannot seal in an earlier workstation. The route scope is the parcel plus a two-tile entrance apron, not an actor movement boundary. Five original workstations use legible semantic glyph names: timber saw, joiner's bench, fiber nursery, dressing table and neighbourhood counter. Blueprints are small furnished stations, not instant replacements for generated architecture. Dismantling requires the current estate revision and no assigned worker/job; half the material cost is recovered. No economic transaction refunds coins.

| Station               | Reserved physical inputs      | Delivered result           | Work seconds | Per-batch wage |
| --------------------- | ----------------------------- | -------------------------- | ------------ | -------------- |
| Timber saw            | 3 wood                        | 2 planks                   | 24           | 1              |
| Joiner's bench        | 2 planks, 2 bone, 1 resin     | 1 hunting spear            | 38           | 4              |
| Fiber nursery         | 1 fiber cutting, 1 wood mulch | 3 fiber                    | 90           | 1              |
| Dressing table        | 3 fiber, 1 resin              | 2 bandages                 | 32           | 1              |
| Neighbourhood counter | 1 spear                       | 28 coins in estate cashbox | 28           | 1              |
| Neighbourhood counter | 2 bandages                    | 18 coins in estate cashbox | 25           | 1              |

The spear retains the authoritative hunting recipe's bone/resin progression. Shops fulfill finite local service orders at a premium; they are not an infinite public tool buyback. Awake customers with access must exist, and total sales per estate are bounded by that actual population and at most 12 per calendar day. Zero customers means zero sales. At ordinary field market values, the complete timber/spear/service chain returns about five coins above materials and wages, before the capital investment and travel time. Bandages also serve actual wound/exploration needs instead of existing only as sale tokens.

Workers are the actual hired NPC IDs, with names, homes and generated role-based specialties. Engineers favor joinery, botanists gardening and merchants shopkeeping; other employable people have seeded specialties. Competence and preferences modify working time only, never multiply output. Day shifts run at local day fractions .23–.77; one fifth of seeded workers prefer .72–.20 night shifts. The authority should stop competing generic routines while a worker has an active assignment.

Each batch performs these observable states:

1. Walk to the estate entrance/store and pay a real field-bank wage.
2. Pick up reserved inputs and physically carry them to a usable workstation approach.
3. Work only while the NPC's authoritative position is beside that workstation.
4. Carry the actual output/cash back to estate storage.
5. Deposit once, then start another funded batch or wait.

`travel()` only requests normal actor navigation. Even if it incorrectly returns `arrived`, production cannot skip the independent actual-position check. Routes can be blocked, and the worker reports the obstruction while retaining identity/cargo. Off shift, a worker walks toward their own home without losing the job. Missing/injured actors pause; no worker disappears from the property register. Unpaid batches lose loyalty gradually and do not begin. Nearby authority-proven protection, injury, betrayal and reconciliation events change loyalty; severely mistreated workers refuse further work. Reassigning/unassigning is refused while goods are in flight.

## Lead integration contract

Construct one `PropertyWorld(seed, adapters, saved?)` per authority room and one corresponding solo authority. `PropertyAdapters` supplies:

- `offer(id)`: actual generated `PropertyOffer`, including stable building/parcel ID, world address, entrance, bounds, vacancy, rental availability and settlement ID. Never construct it from request coordinates or a client-supplied price.
- `person(id)`: living persistent actor record with its real name/seed/role/home/current address and actual eligibility. Look up the actor ledger, not merely the current render list.
- `peer(id)`: authenticated member's current address. The original movement trust boundary remains; this module does not claim to replace gameplay movement authority.
- `cell(address)`: collision, terrain, road and building/parcel occupancy. Include built estate stations in subsequent collision and navigation queries through `property.blocks(address)`; it is an O(1) tile-footprint index. `stationObstacle(address)` returns a frozen `{ estateId, stationId, kind }` record. Frame station records carry `kind`, `x`, `y`, `spaceId`; dimensions come from `ESTATE_STATIONS[kind]`, not nonexistent station width/height fields. Call `invalidateNavigation(estateId?)` after external door/terrain edits.
- `travel(actorId,address)`: set the existing actor ledger destination; its navigation handles doors and normal movement. Render workers from that same ledger.
- `permission(peer,action,target)`: local faction/reputation/law decision for acquire/build/hire.
- `legacyHome(peer)`: verified generated original home, otherwise `undefined`.
- `customers(estateId,now)`: actual awake local customers who can reach the counter. Respect locks, opening schedules, danger and settlement presence. Missing/closed population is zero.
- `transact(peer,cost,reward,eventId)`: the shared `FieldEconomy.transact` method. Ensure the authenticated persistent field account once before commands. These calls are synchronous and must be captured with the property ledger in the same private snapshot.

Route authenticated command messages through `command(peerId, command, serverEventId, authoritySeconds)`. Use a short, room-global, authority-issued stable event ID (the combined `peerId|eventId` must fit 200 characters), not a user-selected reward or arbitrary replay key. Commands are `acquire`, `renew`, `build`, `hire`, `assign`, `unassign`, `queue`, `cancel-job`, `deposit`, `withdraw`, `guest`, `lock`, `furnish`, `rest` and revision-confirmed `demolish`.

Expose `ESTATE_STATIONS`, `ESTATE_RECIPES`, `PROPERTY_RULES`, `propertyPrice` and `estateWorkerProfile` to the owner UI. `getEstate()` and `frame()` return copies. Nonowners receive public estate/name/owner/lock/station status, not the private buffer. `frame()` includes actual worker addresses for task markers. Use `homeTarget(peer,now)` for ordinary auto-navigation; `access()` supplies property door decisions, including employee entry to their employer’s active estate while preserving owner-only storage; `react()` consumes actual witnessed consequences. Never let a guest call an owner command.

Call `tick(authoritySeconds, worldTime.hour / 24)` with the shared calendar. At most eight workers update per call, round-robin; each receives at most two elapsed seconds. Server downtime does not create completed goods or teleport workers, even though the room calendar continues. Other worlds and saves keep their time scale.

`drainEvents()` returns bounded ephemeral construction, work, delivery, hiring, home-rest and sale semantic events. Feed those into existing original sound/VFX and civic consequences; do **not** persist the queue or audio/VFX payloads. `save()` belongs only at `privateState.systems.property`; the public checkpoint schema stays unchanged. `validPropertySave` rejects malformed versions, duplicate IDs/receipts/jobs, noncanonical or rewound `estate-station:N` allocations, overlapping/fractional footprints, unsafe coordinates, foreign ownership, invalid assignment links, inconsistent reserved stock/cargo, nested audio-like extras and invalid lifecycle state.

## Limits and honest next increments

Placement route checks inspect at most 1,936 cells using reused typed-array scratch storage. Runtime route refreshes share a 2,048-probe budget per tick and a two-second maximum cache age; absent budget produces a truthful checking state, and blocked routes pause work without consuming cargo or producing rewards. Explicit geometry invalidation and construction/demolition discard the cache. The obstacle index and route cache are ephemeral and rebuilt on restore.

The register supports 64 estates total, four per owner, eight stations per estate, 96 workers and 16,384 permanent command receipts. Saturation rejects new mutation without evicting existing possessions/history. Per-estate storage holds 4,096 item units and bounded cash. Event presentation queues are capped at 64; this affects presentation only. No unbounded offline production or catch-up pathfinding runs in this module.

This slice builds furnished workstations on acquired parcels and buys/rents/furnishes existing homes. A ground-up residential shell with staged wall/roof construction, property damage/fire propagation, worker hunger/food delivery, payroll recipients' personal spending, property taxes and multi-estate conveyor/cart routes remain concrete continuation work. The current workers physically carry their own batch between the shared store and station; they are not anonymous rate multipliers. Legacy homes remain available through the historical system if online authoritative adoption cannot be proved.

## Validation and provenance

`node --experimental-strip-types --test tests/property-world.test.ts` covers locality/ownership/payment/replay, honest legacy adoption, placement/law, owner-only storage, real arrival checks and cargo delivery, schedules/wages/offline bounds, finite shop demand, keys/leases/rest/demolition, save restore/tampering, unassignment, bounded worker steps and localized trust reactions. The lead must additionally exercise the integrated native portrait flow, persistent actor travel, protocol isolation and save upgrade.

`npx tsc --noEmit` passes after the lane module and focused tests were written. See the final lead report for whole-build and native integration gates; module tests alone do not prove the player flow.

All names, recipes, data structures and glyph concepts here are original code/data. No external art/audio assets were introduced. Public design principles are documented in [the shared research notes](LIVING-SYSTEMS-REFERENCES.md): Factorio's physical jobs and bottlenecks, Fable's consequential property ownership, and original Verso societies. No proprietary layout, dialogue, code, character or asset was copied.

## Portrait systems panel

`src/stichos/living-systems-ui.ts` exports `createLivingSystemsUi(options)` and the pure `renderLivingSystemsPanel(frame,state)`. Import `living-systems-ui.css` through the app's normal stylesheet path. The factory accepts:

```ts
{
  openModal(html, mount /* receives the actual modal host HTMLElement */),
  closeModal(),
  command(command): Promise<SystemsResult>,
  frame(): LivingSystemsFrame | null,
  onTravel(address, label),
  onPlace(propertyId, stationKind)
}
```

It returns `open('field' | 'charters' | 'estates' | 'signs', optionalTargetId)`, `update()` and `destroy()`. The main app retains modal/input epoch ownership and implements its ordinary world placement gesture; `onPlace` closes the panel before handing the blueprint to the playfield. The UI never fabricates a completed construction or reward. It binds actual commands in memory; generated names/IDs are escaped before display.

The four main tabs have roving arrow-key navigation, a labelled panel, four-row pagination, nested focused detail pages, 44-pixel controls, 16-pixel text inputs, safe-area limits, forced-colour support and reduced-motion rules. Supplies transfer and production queues use touch select controls instead of requiring keyboard entry. Property work pages expose actual workers, cargo/status, delivered batch counts, wages, queues, safe unassignment and revision-confirmed dismantling. Guild controls require a real nearby contact and display only the actual charter data. Ordinary tool buyback remains unavailable. All money labels say **field coins** to distinguish this server-owned economy from historical personal balances.

The frame may include `nearbyResources` (or `resources`), `fauna` and `contacts` collections with real target IDs. Without those collections, the UI does not invent targets or contacts. `contacts` uses `{ factionId, npcId, name }`; field target records use `{ id, name, kind }`. A guild invitation's `Not now` button simply leaves the detail page because the current authority does not implement a persisted visitor-refusal action.

Native click/form activation supports keyboard and screen readers. Rendering waits until tracked physical pointers end rather than inserting a timer. The Close action remains available during a slow command; late responses are ignored after closing or opening another modal. Explicit updates preserve scroll/disclosures and focus. Passive `update()` refreshes the currency/location line without remounting controls, resetting reading or stealing text focus; players can use Refresh for a new full snapshot. Global modal replacement cannot be overwritten by a late panel response.

`tests/living-systems-ui.test.ts` currently has eight passing tests for accessible tabs/closing during commands, escaped names, real command IDs, pagination, concrete recipe inputs, property/worker paths, demolition revision confirmation, occupied property protection, real guild contacts/heraldry and meaningful sign copy. CSS checks cover touch size, portrait grid, safe areas, input readability and reduced motion. Native touch, scroll, keyboard and portrait screenshot validation remain the lead's integration gate, not a claim of the pure renderer tests.

## Independent review fixes

The domain review's enclosed-workstation reproduction is now rejected before payment. Reversing its order also refuses the final station that would isolate an existing workstation. Runtime work uses the same station-aware geometry, finds a reachable perimeter cell and reports blocked access rather than targeting a machine footprint. A focused regression runs the actual `HierarchicalNavigator`, moves the named worker one cardinal tile at a time, blocks/reopens access, and verifies exactly one delivered batch with save validity throughout.

The restored allocation regression now rejects a station whose canonical numeric ID exceeds the saved serial, leading zero/negative/foreign IDs, shared station/job allocation numbers, overlapping footprints and fractional station coordinates. The next valid post-restore build retains unique station identity. The footprint index rebuilds on restore and clears when dismantling.

`tests/property-world.test.ts` now contains **18 passing tests**. Independent re-review and coordinator collision integration remain lead gates; this fix does not self-approve the batch.
