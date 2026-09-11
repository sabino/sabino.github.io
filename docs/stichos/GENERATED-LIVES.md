# Generated worlds and lives

New generation-four worlds are reconstructed in the browser from a 32-bit world seed and generator revision. They retain the wide road network, towns separated by long stretches of wilderness, actual connected interiors, and one civic landmark per city. Generations one through three retain their existing geography and canonical story.

## Climate is part of the simulation

`ecology.ts` combines independently addressed, smoothly interpolated elevation, rainfall, temperature, latitude and geothermal fields. Its eleven wilderness biome weights overlap at ecotones. The resulting fields determine lakes and ice, snow, sand, mud, grass and basalt, vegetation density and anatomy, and mineral distributions. Trees and rocks retain the physical resource IDs used by axes and picks. Roads and inhabited workyards remain deliberately cleared.

`exposure.ts` applies the actual local conditions to generation-four bodies. Clean temperate air restores breath naturally. Freezing air, altitude and industrial or volcanic pollution require protection. Heat and cold affect thermal comfort differently. Actual building interiors protect against temperature exposure; an open plaza floor does not count as a heated room. Older generations keep their previous breathing and cold rates.

## Civilizations combine independent attributes

`civilizationFor(seed)` produces technology, industry, organics, spirituality, collectivism, scarcity, illumination, verticality, ornament and transparency axes. These produce world-specific factions, political disputes, names, professions and practical terminology. They also contribute materials, light and fabrication motifs to the local climate-based architecture. Electronic organic settlements and electronic religious settlements can share a technology level while differing in materials, structure and politics.

Ordinary equipment uses the civilization's primitive, forged, mechanical or electronic construction tier. The encoded equipment descriptor retains its complete construction seed and tier; sprites are calculated locally. The tier is not an inventory-only display choice.

Stíchos remains one optional civilization with its established family names and cold climate. Every generation-four player, including a resident of that planet, receives a generated personal life. Theo's authored story belongs to the explicit legacy generation-three entry.

## A personal history names real people and work

`generatePersonalStory(world, life)` uses the selected resident and candidate index. It references three actual inhabitants and the settlement's actual terminal. Its case combines role-biased stakes, a technological cause, political incentives, histories and rewards. Possible stakes include a workshop audit, sabotaged rations, a duplicated courier shipment, a land dispute, a suppressed warning, displaced research or a copied identity.

The playable obligations use existing physical systems:

1. Deliver the required goods to the named resident, surrendering them once.
2. Choose a witness through a real conversation. The chosen faction gains trust.
3. Complete and claim two to four local commissions accepted during this life. Preparation commissions count actual crafting after acceptance, not pre-existing stock.
4. Mine or acquire the remaining materials, craft a lens, and align the real terminal to register the case independently. The resulting record permits voluntary mind transfer.

The case, chosen witness, delivered obligation, commission baseline and final alignment survive reload. Generated descriptions reconstruct from the same world and life inputs. Different lives can share mechanical verbs while having different stakes, relationships, causes and consequences.

## Household employees

A generated household's employee list comes from its real personal relationships, plus workers with unfinished paid orders. The ally is trusted initially; the other relationships can be explicitly retained or released. Choosing the personal case's witness also establishes employment trust in that person.

An accepted job reserves finite real resources. The worker travels, performs timed tool strokes, returns, and delivers the output once. Wages leave the player's purse and become the worker body's money. Collected fresh plant output also counts toward an already-accepted matching field commission. Releasing future trust does not cancel already-paid obligations. Invented worker IDs and invalid resource yields are rejected when restoring a save.

Worker resource orders currently run in solo worlds. Shared-room labor requires an authority-backed work-order protocol; the interface states this restriction. Browser world reconstruction does not by itself provide global persistence or solve authority migration.

## Verification

Tests cover exact legacy world snapshots, generator seams and eviction, climate and material coherence, six architectural cultures, generated civilizations, actual inhabited relationship references, the complete delivery/conversation/paid-crafting/mining/lens/alignment flow, environmental physiology, finite employee work and reload invariants. They do not establish a particular campaign duration or permanent online world availability.
