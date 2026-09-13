# Independent content and gameplay integration review

Review scope: the local `feat/portrait-action-expansion` tree, including the integrator's uncommitted combat/session work. This reviewer owned only `tests/stichos-expedition-integration-review.test.ts` and this document; implementation fixes remained with the integrator. No deployment, push, production data access, microphone capture or asset import was performed.

## Findings and repairs

- **Important, repaired:** a bounded reward search could fail and return a consumable vessel while promising a field weapon. The actual generation-4 world seed 107 produced that failure for the garden commission. A regression now checks its real artifact. The integrator replaced the unchecked fallback with independently verified reserve blueprints for each physical delivery type. Normal addressed generation remains unchanged. Exceptional reserve rewards can share a blueprint; they are not a guarantee of globally unique equipment.
- **Important, repaired by the integrator and re-reviewed:** near-town encounter aggro intersected an established campaign wood-gathering route. Placement now starts at least 36 tiles from a town center and beyond its resource band. Existing geography and NPC generation stay unchanged, and the generated sites still pass the reachable-site suite. The integrator separately reran the legacy campaign test.
- **Important, repaired and re-reviewed:** an equipped contact artifact inherited the body's ordinary weapon technique family. A staff carrier saw staff techniques that the room authority rejected, while an unarmed carrier saw no techniques. The integration test checks the actual reward's delivery against session techniques, including an unarmed body's equipped contact implement. The integrator added the explicit contact-to-sword mapping; both regressions now pass.

## Working vertical slices exercised

The independent integration suite executes real `Stichos` and `SharedCombat` APIs, rather than only testing catalog descriptions or reducers:

- All three generated settlement commissions discover their field sites, obtain authoritative enemy death receipts, reject remote/premature delivery, and consume the established inventory item costs. Tonic and salve are prepared through the real crafting method from emberroot, cequin and heartleaf. A full 60-slot pack can deliver its supplies before accepting the one-slot implement reward.
- Coins, experience, profession practice, physical artifact ownership and attunements are granted through the session. Saving, restoring and trying the same delivery again cannot consume supplies or repeat payment. The authority checkpoint retains defeated encounter IDs.
- All six techniques have actual delayed preparation, released hits, applied stagger, recovery, and authority restart recovery. They do not merely create a render effect.
- Wayfarer's rhythm discounts one technique after Step, not ordinary walking. Surveyor's measure checks existing stagger before applying the new stagger and gives the specified 15% damage increase.
- Three Split flight impacts grant Fieldkeeper's bond once, restoring four warmth and four breath. Authority receipt replay and a same-room reload do not repeat that restoration. The solo projectile path uses one cast token as well.
- The generated Measure warden releases a bearing strike at full health and a radial attack below half health, with the promised damage and visible warning duration.
- Shared Seed keeper warnings use the synchronized day/night clock. Their advertised range and duration remain fixed when that clock crosses to the other time regime while the attack is preparing.

Fixtures deliberately stage level, supplies, positions or already-earned attunements to isolate these transactions. They are not evidence of human play time, naturally earned progression, difficulty balance or browser input. The separate catalog suite verifies generated collision-graph reachability and unchanged terrain for the tested worlds. Browser motion, portrait readability and physical-device performance remain the integration/browser reviewers' gates.

## Bounds and measurement

The catalog retains at most 12 towns and examines at most four nearby towns per query; each addressed town contributes eight encounter actors. Fresh returned actors are copies, so combat state cannot mutate the deterministic templates. Existing shared actor, projectile, cast and consequence bounds remain in force.

An observed development-host run measured 10.38 ms for a cold catalog query on an already initialized world, then 1.55 ms total for 100 cached actor queries. An instrumented `world.tile` counter remained zero throughout those 100 warm queries, proving they did not rerun placement or reachability work. These are module measurements, not a phone frame-rate claim. Cold town placement still needs the application's bounded discovery/prewarm path.

## Originality and scope

The official [Soul Knight Prequel listing](https://play.google.com/store/apps/details?id=com.chillyroom.soulknightprequel), accessed 2026-09-12, provides the public high-level reference for equipment/skill combinations, readable combat roles, group encounters and settlement downtime. This does not license its characters, effects, music or artwork, and none are needed by these modules.

The reviewed content introduces original provision-road, survey-relay and botanical-containment stories tied to Verso's existing civilizations, resources, ecological exposure and residents. The effect geometry and procedural equipment are repository code. No new production art or audio files appeared in the content diff; existing audio retains its own recorded provenance. This is a copyright/provenance inspection, not a legal opinion.

The expansion supplies three coherent encounter/commission families, five enemy behaviors, six weapon techniques and three mutually exclusive earned synergies. It does not claim hundreds of new classes, a new cheat-proof economy, fully autonomous civilization simulation or endless distinct authored quest stories. Personal inventory/progression still use the established local trust model; room combat consequences remain authoritative. That boundary should remain explicit in the final product report.

## Reproduction

```sh
node --experimental-strip-types --test tests/stichos-expedition-integration-review.test.ts tests/stichos-expeditions.test.ts tests/stichos-encounter-patterns.test.ts
npx prettier --check tests/stichos-expedition-integration-review.test.ts docs/EXPEDITION-INTEGRATION-REVIEW.md
npx tsc --noEmit
```

Final verification: all 23 focused tests passed (10 independent integration tests plus 13 existing catalog/pattern tests), with zero skips/failures, in 7.98 seconds. Typecheck passed, and both reviewer-owned files passed Prettier. The final catalog sample measured 9.67 ms cold on an initialized world and 1.57 ms for 100 warm queries, with zero warm tile calls. Full-suite, production/offline build, browser console, screenshot, accessibility and performance evidence belong to the lead integration report; this document does not substitute for those gates.
