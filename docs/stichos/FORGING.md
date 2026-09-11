# Component forging

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
