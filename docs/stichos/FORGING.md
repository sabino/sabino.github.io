# Inventions and component forging

## Open-ended invention sketches

**Life → Invent**, the satchel, and **K → Invent** expose a second construction system beyond the component recipes. A normalized design phrase (up to 64 Unicode characters) addresses a connected graph of 5–24 parts. New sketches incorporate the world, body and saved invention serial. The graph determines generated materials, mass, hardness, conductive pathways, living tissue, silhouette, price and effects.

The current primitive grammar supports implements, vessels and botanical constructions with contact, projectile, pulse or consumable delivery. There is no prewritten list of finished items; there are still finite primitive types and supported gameplay verbs. Each object uses the same generated pixels in its preview, pack and held appearance. Actual attacks obey its range, recovery and line of sight; restorative on-hit effects require a successful hit. Consumables restore bounded amounts and remove one physical object.

The crafting level-two workbench checks exact coins, ingredients and resulting pack capacity before spending. One body can hold one copy of a particular design; salvage removes it and returns one raw material. Objects stay with their physical bearer through mind travel and save restoration regenerates the original construction. Gathering-capable designs advertise a graph-derived axe, pickaxe or sickle specialization.

## Basic component recipes

Open **Life → Forge**, or **K → Build from parts**. The bench combines choices into an actual procedural weapon. Three kinds, three materials per kind, three botanical cores and three proportions provide 81 recipes for each host. The host seed supplies the remaining details, so another body's interpretation of the same recipe can differ.

| Choice                                  | Effect                                                            |
| --------------------------------------- | ----------------------------------------------------------------- |
| Staff, sword or bow                     | Weapon construction and delivery: sweep, blade or traveling arrow |
| Frostwood, ironbark, silver birch       | Staff/bow structural material and handling                        |
| Blue steel, tempered iron, Sallas alloy | Sword structural material and handling                            |
| Heartleaf binding                       | Stagger on a successful hit                                       |
| Cequin seed                             | Restore breath on a successful hit                                |
| Emberroot heart                         | Restore warmth on a successful hit                                |
| Swift, balanced or long proportions     | Physical span and breadth, changing strength, reach and recovery  |

The preview uses the same generated construction as the equipped sprite, action bar, equipment panel and combat profile. It includes learned combat bonuses and body-owned upgrades. Crafting practice earned by forging is accounted for when it crosses a relevant level threshold. Costs are displayed before construction; the engine rechecks bench proximity, crafting level two, coins, supplies and duplicate construction before spending anything.

Forging grants and equips the selected weapon type. It replaces this body's construction for that type, without changing its anatomy seed or the other two weapon types. Repeating an identical recipe is rejected. Materials are consumed; this is not a free visual reroll.

The physical body owns the construction. After mind travel, its former bearer still displays it and uses its handling. Returning restores the same weapon. The independent weapon seed is included in cooperative appearance updates. Save restoration verifies the recipe, owner, construction seed and uniqueness; old saves without forged records use their established equipment.

## Verification

Generator tests exercise all 81 recipes across representative owner seeds, reproducibility, real parameter/profile agreement and bounded search/cache behavior. Five session tests cover exact cost/profile, failed-operation preservation, type ownership, body transfer, strict save validation and inactive appearances. The real-input browser pass used gathered timber and ore, changed each component control, checked the paid result against its preview, saved/reloaded it, opened the K equipment panel and checked a 390-pixel mobile viewport.

The generator combines existing primitive construction rules rather than drawing from a gallery of complete weapon images. The space is deliberately bounded; it is not an unlimited crafting grammar, and users cannot yet name or trade individual forged artifacts.
