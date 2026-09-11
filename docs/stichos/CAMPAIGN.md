# The Sallas investigation

The repaired opening radio now starts six acts containing twenty-four objectives. All destinations are generated inhabitants, radios, four plaza lamps, or existing botanical excavations. Generation-three campaigns visit four different distant clan cities before returning to Vespera; the seed chooses their actual names and locations. The continuous world remains available throughout.

## Authored adaptation, not additional source canon

Theo's uncertainty at arrival, the failed transmission, the six families, the botanical society, and the Sallas mystery come from the supplied concept and user clarification. The surviving records, clinic agreements, 3866 quarantine order, consensual acknowledgement protocol, and resolution below are newly authored game fiction. They do not claim to be explanations contained in the source documents. Theo learns them during play rather than knowing the answer at the outset.

| Act                           | Four playable objectives                                                                                                                                                           | Consequences                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The broken address            | Compare the archivist's incomplete address; supply two salves and two dressings; decide witness anonymity; align four actual plaza lamps and the radio.                            | Medicines leave the current body's pack; testimony changes family trust; incorrect coil order or frequency resets the sequence.                                        |
| What Sallas preserved         | Visit the generated Sallas city's archive; negotiate or fight at its excavation; recover the deep ledger; interpret its acknowledgement condition.                                 | Two real guards can survive a payment of medicine and food or die in combat; the cache pays its ordinary finite loot once.                                             |
| The price of abundance        | Gather timber, ore and crafted lenses for an independent receiver; agree an industrial audit or trial; secure a second excavation; recover its dated shutdown log.                 | Physical construction costs and a different group of guards; Brown/clinic trust reflects the chosen agreement.                                                         |
| A council of living witnesses | Supply three botanical medicines in raw form; protect a clerk or sign a disclosure; solve a different four-coil sequence; choose distributed references or an auditable custodian. | Actual clinic supplies are consumed; testimony and governance remain recorded in memory and family trust.                                                              |
| The missing return            | Construct the northern receiver; secure the third archive; recover its 3866 instruction; compare all three records to identify the quarantine.                                     | Ore, lenses and tonics are spent; independent evidence resolves the investigation's cause rather than treating a wrong guess as progress.                              |
| A choice made awake           | Return the assembled evidence to Vespera; fund an independent receiver; solve its final coil sequence; keep a standing return connection or choose to remain.                      | A clear acknowledgement resolves the return investigation. Both endings leave Stíchos playable and allow nearby willing people of additional professions to host Theo. |

Every step grants finite coins and experience. Incorrect interpretations can be reconsidered. Lamp clues are explicitly printed in the current objective: location, channel, order, and progress. Ordinary trading, workbench use and local dialogue remain accessible through **Other business here** while a campaign conversation is active.

Evidence belongs to memory, while medicines, equipment, currency and the notebook stay with the physical body. Recovering an archive before receiving its corresponding lead permits rereading the existing evidence without generating a second chest reward. If an essential witness dies, becomes hostile, or is currently occupied by Theo, the deposited records and practical arrangements can be accessed through that settlement's real noticeboard; their absence is acknowledged. No witness is respawned to erase the consequence.

## Saves and older worlds

`campaign` is an optional version-one record containing the current step, coil progress, completed sequential evidence, decisions and ending. Existing radio-complete saves begin the first new lead automatically. Earlier lives retain their original terrain generation. Generation-one worlds, which predate excavations, use their actual civic archives and displaced-convoy shelter arrangements instead of modifying their geography.

New professions, homes, garden plots, cosmetic selections and physical equipment upgrades are stored independently as `progression`. Older saves start with untrained professions. Paid cosmetic entitlement is never trusted from a local save; the renderer receives an overlay on the body's unmodified appearance only after account verification.

## Verification and playtime limits

Run:

```sh
node --experimental-strip-types --test tests/stichos-campaign.test.ts
node --experimental-strip-types --test tests/stichos-session.test.ts tests/stichos-progression.test.ts
```

The generation-three campaign test completes the original radio opening and every new objective using public movement, interaction, choice, harvesting, trading, crafting, rest and consumption APIs. It never assigns player positions or advances quest state directly. It negotiates all three excavations, corrects a wrong lamp order and wrong interpretations, and saves/restores after each objective. Fifteen seed/generation combinations independently verify that every target and coil exists in the actual world.

Observed seed 3886 run: **24 objectives**, **11,899.9 tiles walked**, **3,744.6 seconds of simulation time**, **81 botany practice**, **100 crafting practice**, and **six surviving pacified archive guards**. The test's resource planner includes some unnecessary travel between an archive and its associated city. It reads dialogue instantly, chooses known answers, and does not pursue houses, gardens, correspondence or multiplayer. This is roughly 62 minutes of accelerated campaign play; four hours of human play has not been measured or demonstrated. No timer gates pad the campaign to a claimed duration.

A second branch restores the legitimately earned first-encounter state, purchases a bow from the actual merchant, and chooses confrontation. It walks the real vault passages and defeats its generated archer and swordsman using a travelling arrow and directional staff hits. Both enemy warning types occur; the observed minimum health was 85. Declaring the fight alone leaves the objective incomplete. Actual deaths complete it, survive restoration and permit the next archive search; repeating the search pays nothing further. This branch added 170.2 simulation seconds including approach and combat. The peaceful source branch still leaves all six guards alive. Solid door collision is enabled in the repeat; the planner opens encountered doors through the public interaction API before crossing.

Unit checks separately cover preflight/transaction consistency, actual house address validation, paid-cost atomicity, home workbench crafting, original appearance preservation and rejection of local premium-entitlement restoration. Browser presentation and human combat balance remain separate QA tasks.

## A life after the return investigation

Seven optional purposes remain visible in the journal and the Life panel: reach profession level five; fully furnish a home; harvest 24 garden portions; earn three physical equipment upgrade ranks; fulfill six clinic jobs or local commissions; resolve three correspondence routes; inhabit four willing professions. Each purpose recognizes actual earned activity and pays once. No additional travel distance or waiting threshold substitutes for the activity.

Any real noticeboard offers repeatable, seed-selected local commissions after the ending. Field commissions require freshly gathered plants and physical delivery. Workshop commissions require newly crafted medicines and delivery. Garden commissions require harvest from an owned growing plot and delivery. Road-watch commissions identify specific living hostile raiders; unrelated violence never counts. The journal tracks the actual work location and then the issuing board. Supplies are consumed only when a completed delivery is claimed. A commission can be withdrawn without payment or a penalty; a new serial produces another task.

The repaired protocol also permits distant mind travel between encountered willing people from a quiet shrine. The saved roster holds up to 128 encountered identities; nearby willing people remain selectable even when that roster is full. The original priest is prioritized when alive. Hostility, death, guard distrust, blocked terrain and an attacker disturbing the current shrine still prevent a transfer. Physical inventory, money, equipment and the notebook remain with each body. The record retains professions, promises, home ownership and memories.

The full action test now additionally checks both ending choices, three different distant professions plus return to the priest, two completed preparation commissions without duplicate payment, real home purchase and four furnishings, seeded crop growth, 24 garden portions and a paid cultivation commission. Pure generator tests cover 64 commission serials and all four activities, including safe fallback when a locality's plants or enemies are exhausted. These are simulation checks; they do not replace human pacing or multiplayer browser QA.
