# Ordinary equipment is generated in play

Weapons bought from merchants, recovered from defeated raiders, inherited with a life, and forged at a workbench all use the same browser-side construction and combat generator. Invent remains a separate combinatorial object system. No weapon sprite sheets, remote image generation, or raster assets are used.

The physics families `sword`, `staff`, and `bow` identify contact blades, carried rods, and projectiles. They are not the displayed item catalog. Independent blade contours, limb equations, connected shafts, guards, grips, pommels, materials, balance, flex, and living bindings produce different shapes and handling. Dagger reach differs from a needleblade; a dense head takes longer to recover; flexible limbs affect projectile reach and impact. Every structural stroke is four-connected at pixel scale.

Generation-four civilization technology additionally selects primitive, forged, mechanical, or electronic construction. Ranged equipment can be a tension bow, crossbow, repeating mechanism, spring launcher, coilcaster, rail carbine, or pulse thrower. Electronic rods are probes and induction instruments. Different materials and components are still generated within each construction family. Existing geography versions retain the established ordinary material vocabulary.

## Compact deterministic addresses

An ordinary owned item stores `{version: 2, kind, seed, source, sourceId}`. Its pixels and numerical profile are regenerated locally. Merchant addresses derive from the world seed, actual merchant identity, and physics family; loot retains the defeated body's exact item address. The save rejects unknown item versions, invalid technology prefixes, duplicate constructions, incorrect merchant provenance, unavailable loot provenance, and nonexistent selected items.

Legacy weapon seeds use the complete unsigned 32-bit space. New technology addresses are exact JavaScript integers:

```
weaponSeed = 2^32 × (technologyTier + 1) + unsigned32ConstructionSeed
```

Prefix 0 is legacy; prefixes 1–4 encode primitive, forged, mechanical, and electronic construction. `0x4ffffffff` is the largest valid address. This preserves all 32 bits of construction entropy without colliding with or reinterpreting old forge seeds. Do not coerce an encoded weapon address with `>>> 0`: only the anatomy and world seeds remain plain uint32 values. Shared actor appearance sends this address, so browser clients and the authority reconstruct the same held geometry and combat profile.

## Ownership and interfaces

`Stichos.weaponInventory` returns the actual carried construction cards; `equipWeapon(id)` selects one. Multiple different swords or launchers can coexist, with at most 64 acquired constructions per body. `equip(kind)` retains the selected construction in that physics family for existing shortcuts. `merchantWeaponStock(npcId)` returns exact names, prices, seeds and profiles for the real nearby merchant.

Body-owned collections and selected designs survive save/restore and mind transfer. A shared death receipt gives the physical drop to its final attacker only, using the existing replay-protected receipt ledger. Other contributors retain their existing experience reward. An empty-handed civilian receives neither a hidden staff nor its attacks. Existing Theo saves preserve the priest's possessions.

These compact descriptors persist alongside world/life records; deterministic generation does not itself make personal inventory globally authoritative or provide permanent peer availability. Existing host authority, signed checkpoints, and optional Pear replication retain those responsibilities.
