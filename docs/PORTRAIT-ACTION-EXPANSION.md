# Portrait action expansion: integration and operations

This is a local successor to deployed source `e6063ea`. Publication is not authorized by this implementation task. The existing universe, terrain generations, personal lives, settlements, licensed sound library and voice service remain the foundation.

## Playable systems

Portrait controls expose held Strike, two weapon techniques and Step, with left-handed placement, direction-button fallback and persisted effect intensity. Ordinary attack and ward remain available on older rooms. Techniques depend on the **equipped** ordinary weapon or generated artifact delivery, not the resident’s original weapon. Level one opens the first technique; level four opens the second.

| Weapon delivery | First technique | Second technique | Gameplay identity                                                       |
| --------------- | --------------- | ---------------- | ----------------------------------------------------------------------- |
| Contact         | Reaping arc     | Seam breaker     | Broad follow-up versus a slower, stronger line and displacement         |
| Projectile      | Split flight    | Needle flight    | Three-angle coverage versus a piercing shot through up to three targets |
| Pulse           | Root resonance  | Stillbloom       | Nearby botanical pulse versus longer preparation and longer stagger     |

`combat-techniques.ts` owns tunable stamina, cooldown, preparation, range and target limits. Preparation is a fixed simulation time after input release; holding the button shows readiness but does not grant extra damage. Moving more than 0.65 tiles, changing body or leaving the room interrupts preparation. Payment and recovery are retained on interruption. Step costs stamina, respects walls and doors, has no invulnerability, and travels consistently across frame partitions. Touch aim assistance chooses nearby visible hostiles in the facing half-plane; it never targets peaceful residents automatically.

[Field expeditions](EXPEDITIONS.md) add three commission families, five enemy patterns including a two-phase warden, three generated implement reward families, optional time-of-day observation bonuses and three mutually exclusive earned combat synergies. Actual defeated enemies, crafted supplies, return delivery and a persistent claim receipt form each complete loop. Town names, architecture, ecology, contacts and loot derive from the existing world. NPC aid memory and reputation record completed deliveries. Existing fauna remain part of the habitat; this expansion does not replace their simulation.

The [combat feedback layer](combat-feedback.md) supplies trails, reactions, projectiles, impacts, death collapse, loot and level cues, exact hostile warnings, bounded camera impulses and reduced-motion behavior. Vegetation fades over the player, at most 16 nearby living hostiles and eight nearby peers; projected occlusion points are calculated once per frame. A thin danger boundary remains above foliage while its fill stays on the ground. Sound hooks reuse existing accepted-action Foley and ability events; there are no unlicensed imported assets.

## Multiplayer contract and persistence

Gameplay protocol remains version 3. Join may request `actionExpansion: 1`; the welcome advertises it only when supported. A new client in an old room disables the two new techniques, explaining why, and hides expedition tracking/claim actions that the old authority cannot complete. Ordinary attacks, movement and ward remain compatible. An old client on a new node continues to receive ordinary enemy/projectile/hit kinds, ignoring optional cast, release, stagger and geometry fields.

The existing authenticated room session, request ID ordering, body binding and position validation protect technique requests. Authority owns preparation, cancellation, projectiles, hit geometry, stagger, damage, enemy phases and deaths. Time-based enemy patterns use the room calendar. Successful release has an explicit bounded receipt; a disappearing cast is not treated as a release. Enemy releases also carry a bounded ephemeral receipt, so a missed shared area attack still has motion and sound. Preparation/release arrays are excluded from checkpoints. Intents capture their shape at preparation, so a phase change never alters an already advertised attack.

Visual reaction objects never influence authority or save data. Optional persisted recovery/technique cooldowns and enemy stagger survive reload; in-progress casts cancel on reload. Optional expedition state retains up to 256 permanent claim receipts. Existing saves with missing fields restore safely. Accepted shared actions still cost stamina if a delayed acknowledgement arrives after another local cost: temporary recovery debt repays before regeneration and survives save/load. This avoids free accepted attacks caused by network timing.

Personal inventories, XP, attunements and progression retain the existing client-reported trust model. This is not a new server-authoritative economy or anti-cheat system. Cooperative enemy outcomes remain authoritative. Shared world operations, checkpoints, signing identity, room authentication, `/ws` transport limits and `/voice` binary/audio handling remain intact. New presentation cues and microphone content do not enter checkpoints or Pear replication.

## Future deployment, awaiting separate authorization

Use the established deployment scripts and targets documented in [world-node hosting](stichos/ROOM-CONNECTIVITY.md) and [Pages publication](stichos/PAGES.md). No new domain, server, volume, secret or DNS layout is needed for this expansion. Capture currently deployed revisions first, preserve persistent data and signing identity, and update the existing world node before the frontend so its capability handshake enables new techniques immediately. Existing clients keep ordinary gameplay throughout. A frontend deployed first degrades to ordinary combat until the room supports the capability.

Build **after** the final commit so bundled release metadata identifies the clean source revision. `npm run build` performs typecheck, Vite production compilation and content-hashed offline-cache generation. Publish the entire generated frontend together with its manifest and service worker. Do not copy an older worker over new assets. Re-run live `/ws` and `/voice` compatibility smoke tests and verify installed clients fetch the new asset/cache revision. Existing voice configuration and secrets require no changes for these action features. Roll back application images/assets only if needed, retaining world data and volumes.

## Scope and verification limits

This is a substantial first action/content expansion, not an exhaustive class tree or an unlimited catalog of hand-authored encounters. There are six techniques, three commission families, five enemy patterns, one major two-phase encounter and three attunements. Sites recur through exploration of different settlements; dead shared enemies do not respawn on a timer. Pathological geography can omit an unreachable site. At most 256 commissions can be recorded by one life.

Browser QA uses actual isolated Chromium with native inputs at representative viewports and a simulated iOS standalone signal; CPU throttling is a comparative stress test, not a physical-phone benchmark. Physical Safari/Chrome keyboard chrome, notches, orientation lock, screen readers, Bluetooth/PTT routing, sustained thermals and multi-touch remain device checks. See [portrait verification](portrait-mobile.md), [independent content review](EXPEDITION-INTEGRATION-REVIEW.md), and the completion evidence report for exact measured results and screenshots.
