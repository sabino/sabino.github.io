# Living systems expansion — integration contract

Local batch begins at deployed `79ed0944dfe0d43b2091a17cca140a9358a3e352` on `feat/living-systems-expansion`. No push or deployment is authorized. Existing generated terrain and protocol 3 remain supported. This document records implementation ownership and shared rules; passing runtime integration and review, not this document, are completion gates.

## Ownership and waves

The lead owns `app.ts`, `session.ts`, `render.ts`, `world.ts`, shared types, protocol, checkpoints, authority and server integration. Agents publish contracts before central integration. No agent stages or commits another lane's files.

1. Input lifecycle agent: interaction sequence ownership, portrait control bindings, PTT bindings, native touch reproduction and isolated browser baseline.
2. Audio agent: audio graph, score planner, atmosphere, Foley events/banks, dedicated tests and provenance.
3. Navigation agent: navigation/pathfinding, persistent actor ledger and opt-in fauna behavior, dedicated tests and profiling.
4. Next available agents: authoritative loot/economy; factions/law/consequences; signage; property/workers/production; underground complex. Each receives distinct new modules, tests and a central integration note. These lanes consume the contracts below rather than duplicate identities or currencies.
5. Independent review follows implementation: input/accessibility, audio, performance, saves/protocol, security/economy, gameplay/content/provenance and final integration.

## Shared rules

- Coordinates are world tiles, never receiver CSS pixels. A world address has `spaceId`, `x`, `y`; old records imply `surface`. Actor IDs remain stable across simulation detail, culling, migration, work, injury, rescue and save/restore. Underground spaces use `underground:<settlementId>:<depth>`.
- Display range and simulation budget do not determine existence. Actor ledgers retain changed/owned identities and locations. Admission must stop truthfully at a declared persistence capacity; never evict an existing owned or consequential actor to admit a new one.
- Navigation asks a world adapter for open, blocked or permission-aware door cells. Requests produce ordinary movement and explicit door operations. Menus, dialogue, death, explicit movement, stop, obstruction and configured danger interrupt travel. Navigation never teleports.
- New shared systems negotiate `livingSystems: 1` additively over protocol 3. Current clients joining an older authority retain current gameplay and clearly disable unsupported shared actions. Existing `/ws` and `/voice` framing, credential issuance and limits remain untouched.
- The deployed public checkpoint validator accepts only a fixed key set. Consequently new domain ledgers live in a versioned `privateState.systems` operator snapshot in this batch; the existing signed public checkpoint remains byte-schema compatible. Negotiated clients receive bounded authoritative domain frames over the authenticated room connection. This preserves old-client verification and existing signing identity. New domain ledgers are not yet recoverable from a public Pear replica alone; a separately versioned signed public extension is a documented continuation, not an implied guarantee.
- Commands refer to authenticated room-member IDs and server-resolved targets. The authority derives consequences, drops, access and rewards from actual world state. Client-supplied outcomes, balances, witnesses and completed jobs are not authority.
- New loot/materials use an authoritative field satchel separate from the historical client-owned personal inventory. Ownership claims and craft/property transactions consume server balances atomically. Nothing converts arbitrary imported personal items into trusted currency. Explicit migration/adoption rules must be reviewed before legacy possessions gain authority.
- Stable event IDs are assigned by the authority. Remembered consequences contain action, actor, victim/place, time and witness/report provenance. Report propagation is bounded and local. Audio, PTT content, VFX, timers and render objects never enter this journal or checkpoints.
- Faction IDs derive from seed/civilization/settlement/purpose; generated display names are labels, not keys. Individual and group interpretations are separate from the action record. Rank/benefits/obligations have concrete transactions and observable consequences.
- Property IDs refer to actual parcels/buildings. Doors consult owner, access hours, keys and local law. Workers keep the same actor ID as the person hired/rescued and use navigation/schedules. Production consumes inventories through timed jobs and physical delivery, with visible shortages and bounded catch-up.
- Dungeon topology uses a versioned grammar and stable seed. Entrances, exits and floor transitions must be reachable and explicit; surface identities and prior world generation are unchanged. Discoveries, cleared threats, rescued people and unlocked shortcuts persist independently from visual fog and sound.
- Audio reads semantic location, world time, actual population, surface, affiliation, reputation, home, production and dungeon depth. Missing population means no crowd. Optional weather is only emitted when a real world weather system supplies it. Themes change at musical boundaries; combat events vary stems without repeatedly restarting a song.
- Profiling retains raw RAF measurements for this batch, bounded subsystem measurements and before/after conditions. A single active game page is required for comparable browser performance. Reduced motion/effect settings preserve essential threat and access information.

## Review invariants

Old save fixtures and world fingerprints must still validate. New schemas reject malformed values, duplicate identities/receipts and unsafe coordinates. Multiplayer tests cover capability omission, cross-room access, replay, concurrent claims, disconnect/reconnect and checkpoints. Persistent domain state is isolated from transient presentation. No branch cleanup, reset, stash, secret handling or production mutation is needed for this local batch.
