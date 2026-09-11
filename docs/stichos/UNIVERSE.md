# Lives, planets and continuity

The main entry offers a generated humanoid life. **Theo Bishop’s story · Stíchos** remains an explicit narrative start. These are entry choices within the same game, not two connected inventories.

## Resident creation

`life-origin.ts` derives a candidate from planet seed, geography version and candidate index. Each candidate is an actual generated resident with a name, age, profession, appearance, home address, starting place/activity, finite supplies and coins, working tools and profession practice. A candidate cannot use the church as a newly assigned home. Canonical opening specialists remain story anchors rather than disposable origin candidates.

The UI initially chooses a candidate index and permits rerolls. The same seed/version/index reproduces the underlying person. Name, skin/hair/coat/trim colors, hairstyle, headwear, cloak and build are validated customization fields; editing them does not create arbitrary damage, wealth or stats. Accepting plays a mind-arrival transition and adopts the person's actual position. Their occupied NPC is not drawn a second time.

The priest story retains its established residence, notebook, 240 coins and named household relationships. Generated lives use their own professional kit and do not all inherit that estate or physical book.

## A life stays on its planet

`verso.stichos.v1` stores the active life. Before changing planets, the browser also retains its current serialized session under `verso.life.<seed>.<generation>`. Selecting a remembered planet restores that session rather than starting another copy. A failed read preserves the stored record and reports the problem. Planet travel keeps packs, money, world changes and production with that planet's continuing life; there is no cross-planet inventory transfer.

**Pause → Leave this body** confirms retirement before offering another real resident. Cancelling either confirmation or the creator preserves the current body. Acceptance retains world changes, established structures and previous bodies' possessions, then adopts the selected body's own belongings. Already visited bodies recover their existing ledger rather than receiving an initial kit again. Retirement is unavailable while attached to a shared room; the story's shrine transfer remains a separate gameplay route with its own conditions.

A stable browser player ID identifies reconnect credentials; it is not a globally authenticated account. `life-lease.ts` uses Web Locks to hold one continuing-life tab per origin when that API is available. A second tab is asked to wait or retry after the first releases the life. Browsers without Web Locks do not receive this tab-exclusion guarantee.

The current UI does not offer routine save download/import. Another browser profile, device, port or hostname has separate storage. Clearing site data removes its life records and private host ownership. Cosmetic-wallet recovery does not recover these lives, and a public room replica does not contain the host's private signing key.

## Shared address space, bounded rooms

`universe.ts` assigns every 32-bit planet seed a stable address in `verso-1`; geography versions remain part of a world's identity. The named Stíchos address is `0x53544943`. The galaxy displays 48 generated signals per sector and up to 128 locally remembered world entries. Its plotted planets are navigation choices, not measured astronomical bodies or online player counts. New lives use generation 4: ten independent civilization axes control technology, industry, organics, spirituality, collectivism, scarcity, illumination, verticality, ornament and transparency. Regional climate and geology generate eleven wilderness biomes and six climate-appropriate architecture families. Culture alters the actual wall/roof materials, windows, lighting, names, institutions, equipment and workshop catalog. A technologically advanced culture can still inhabit alpine stone cities or forest settlements; an era name is a description of the generated rules, rather than a complete prefab world.

The original generation 1–3 saves keep their geography. The title's explicit Theo story starts generation 3 at Stíchos; generation 4 residents use personal origins even on that planet. Each personal origin composes an individual history and obligations around actual generated neighbors, a home, working tools, supplies and profession. Decisions and completed work are persisted per body.

Ordinary equipment is generated in the same live systems as purchases, crafting, loot and characters. Its address describes connected parts and material properties; primitive, forged, mechanical and electronic constructions share balanced underlying combat families. Empty-handed residents remain empty-handed. [Equipment and exact address compatibility](ORDINARY-EQUIPMENT.md).

**Galaxy → Open public frequency** derives a rendezvous code from seed and generation. It attempts discovery, joins an online authority, or attempts to host the frequency. An existing pinned visitor replica cannot be silently promoted into another owner's authority. Simultaneous first hosts may race; a losing connection can join the winner. This is not distributed consensus, automatic host migration or a globally available MMO.

**Room** can host a private browser room or accept a code. Full invitation links and QR codes carry the room, planet, generation and selected endpoint; code-only browser-room discovery obtains world metadata before creation. Up to eight participants share that room. **Local** chat reaches nearby participants, **Room** chat reaches the current room. Neither channel reaches everyone using every planet.

Browser rooms need their host online and external signalling/connectivity. Dedicated servers and the optional native Pear replica node must be operated separately. Signed public replicas preserve verified shared history but cannot issue new owner signatures. Read [MULTIPLAYER.md](MULTIPLAYER.md), [WORLD-PERSISTENCE.md](WORLD-PERSISTENCE.md) and [the native node instructions](../../pear-node/README.md).

## Installation, AI and evidence

The manifest and service worker support installation and cached offline solo play. **Install app** uses a native browser prompt if supplied, otherwise shows platform instructions. This does not install Codex, a local server or a Pear runtime, and does not create cloud storage. An installed iOS/Android/desktop lifecycle has not been established by the current browser proof.

The optional **AI companion** is a capability/authentication-status check for a separately installed local Codex. Model inference and NPC generation remain unavailable. No model, OAuth credential or unrestricted coding-agent tool runs inside the game page. [Exact boundary](AI-COMPANION.md).

The local universe browser proof passed ten checks on `app-tZDgoFWJ.js`: rerolls, real text/color input, arrival into the chosen resident, reload continuity, cancellation, galaxy navigation, QR/link invitations and code-only mobile joining. It did not test actual interplanetary transfer, the subsequently added public-frequency flow, or native installation. [Recorded evidence and reproduction](UNIVERSE-QA.md). Session tests separately cover candidate determinism, valid homes, finite possessions, retirement and persistence. Newer build acceptance is tracked in [QA.md](QA.md).
