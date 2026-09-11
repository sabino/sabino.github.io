# The Winter Compact

The optional Winter Compact adds twenty-four settlement projects after—or alongside—the twenty-four-step return investigation. Its six districts belong to actual generated settlements, one for each clan. Four rounds revisit those places as the consequences of earlier agreements change later terms. Completing the Compact does not replace the main ending or close the continuous world.

## What the player actually does

Each project has three milestones:

1. Hear two named residents at their actual world positions. The accounts describe conflicting practical interests: clinic heat, specimen consent, shelter obligations, woodland access, distribution routes, or public testimony. Reading the menu alone does not record a survey. If an essential witness becomes unavailable, their local noticeboard holds the recorded account.
2. Choose and fund one of two commitments. A common arrangement places more responsibility with local residents; a charter exchanges some independence for predictable outside support. Payment is immediate and the terms cannot be rerolled. The agreement then requires fresh harvesting, actual preparation, or an eligible paid resource order accepted after those terms.
3. Bring the physical delivery to the district board. Previously held goods can supply a delivery, but cannot substitute for the required fresh work. Payment and clan consequences occur once.

Care, independence, and reliability persist for each district. Reliability reduces the amount of later work; independence affects later funding; accumulated care adds emergency reserves. The interface states costs and consequences before payment. These are explicit mechanical consequences, not a claim that one policy is universally right. Matching paid work also records the worker's earned trust.

The project briefs are new adaptation material. They extend Theo's household obligations and clan relationships without establishing the true fate of the original priest, explaining the failed transmission, or resolving Sallas's hidden purpose by assertion. Stíchos remains the planet; Vespera is the origin city.

## Persistence and compatibility

The pure model is `src/stichos/compact.ts`; the Life panel uses `compact-view.ts` and `compact.css`. Session actions commit costs, rewards, reputation, journal entries and world-derived work receipts. Prop and order identities prevent replay. A strict version-one Compact ledger rejects skipped projects, impossible stages, inconsistent outcomes and duplicate receipts. Legacy saves default to an untouched Compact and retain their existing generation-one, -two or -three world.

The model tests cover four seeds, all three world generations, actual board and witness identities, traversable routes with ordinary doors opened, both policy branches, atomic costs, fresh-work requirements, unavailable witnesses, replay prevention and saved-state validation. Session tests separately exercise actual tool strokes, crafting and returning paid workers; their deliberately positioned unit fixtures are not play-duration evidence.

## Reproducible action proof

Run the opt-in planner with:

```sh
node --experimental-strip-types scripts/play-winter-compact.ts --run --label main-compact
```

It starts a fresh life, completes the main investigation, and continues through all twenty-four Compact projects. Travel uses normal movement inputs and collision; doors, tools, repairs, food, botany, preparation, conversations and deliveries use public gameplay actions. It never assigns player coordinates, supplies, resource removals or quest state. Save/restore checkpoints preserve the earned life after each project.

The report separates movement and necessary tool-recovery time from rest-clock jumps and blocked frames. It records harvests, strokes, preparations, policies, surveys, deliveries, cache size and save size. It does not add idle waits, repeat commissions to reach a duration target, or treat automated execution as human reading time or enjoyment. Detailed captures are written under `.dream-loop/stichos-compact-proof/`.

### Completed capture: seed 3886, generation three

The fresh-life capture `main-compact-v2` passed on 11 September 2026. It completed the original twenty-four objectives followed by all twenty-four Compact projects: forty-eight witness accounts, twenty-four funded policies, and twenty-four physical deliveries. Common and charter commitments were both used. Each successive round retained its earlier district consequences.

| Measurement                                 |                      Observed result |
| ------------------------------------------- | -----------------------------------: |
| Active movement and necessary tool recovery | **12,771.776 seconds / 3.548 hours** |
| Main investigation active portion           |   3,552.598 seconds / 59.210 minutes |
| Compact active portion                      |      9,219.179 seconds / 2.561 hours |
| Rest-clock jumps, excluded                  |                          870 seconds |
| Idle padding / blocked input                |                        0 / 0 seconds |
| Actual travel                               |                     45,768.185 tiles |
| Harvested objects / successful tool strokes |                            238 / 926 |
| Actual preparations / merchant sales        |                              89 / 18 |
| Deaths / extra repeatable supply jobs       |                                0 / 0 |
| Exact gameplay checkpoints                  |                                   25 |
| Maximum world cache / compact save          |           160 chunks / 135,294 bytes |
| Automated wall time                         |                      383.339 seconds |

The **four-hour active threshold was not met**. This is a completed automated gameplay route, not a four-hour human playthrough. The script intentionally reports that distinction and exits with status two when the route passes but the duration threshold remains unmet. Optional professions, housing, gardening, correspondence, other bodies and inventions remain available; their possible duration is not added to this measurement.

The capture used actual prospecting within 128 tiles after an earlier local-only planner exhausted ore near Orgard. No world replenishment or resource injection was needed. One paid forestry order was accepted and its worker physically returned, but the planner subsequently cut one allocated tree itself. Collection correctly failed, so **zero completed paid orders** are counted in this capture. Successful paid-labor contribution is covered separately by session integration tests.

The detailed report, per-project measurements, source hashes and earned saves are under `.dream-loop/stichos-compact-proof/main-compact-v2/`; `results.json` is the authoritative capture. The older four-hour endurance remains a separate long-session stability test, not evidence for this route or four hours of distinct narrative content.
