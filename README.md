# Verso

A browser RPG of unique humanoid lives, generated civilizations and shared worlds. Choose a generated resident, customize their appearance, enter their existing home and profession, gather supplies, construct production, trade, explore and meet other players. The galaxy chart gives seeded planets shared addresses; live play happens in rooms of up to eight people.

**Theo Bishop’s story · Stíchos** is a separate legacy start. It preserves the authored Sallas investigation and Winter Compact in generation three. New generation-four lives, including residents of Stíchos, have their own histories, relationships and commitments.

## Play and run

**[Published game](https://sabino.pro/games/verso/)**. [PAGES.md](docs/stichos/PAGES.md) records the last verified public deployment; the source and local preview can be newer. The current life/universe and construction browser proofs are recorded in [QA.md](docs/stichos/QA.md).

Use **Node.js 26**, the verified development runtime:

```sh
npm install
npm run dev
```

Open **http://localhost:4173**. For a static production build:

```sh
npm run build
npm run preview
```

Open **http://localhost:4174**. `dist/` supports static hosting beneath a subpath. The base game needs neither an account nor a model API.

## A continuing life

**Choose a life** opens a rerollable resident preview. Name, age, profession, existing home, starting activity, body and initial supplies are generated from the planet and candidate index. Customize the name, colors, hair, headwear, cloak and build, then accept the person through the arrival sequence. Their professional strengths and finite kit affect play. **Theo Bishop’s story · Stíchos** starts the established priest instead; it does not replace an already remembered life on that planet.

**Continue this life** resumes the browser’s current person. The **Galaxy** chart pans, zooms, changes sectors and selects planets. Visiting another planet privately retains the previous planet’s life; returning restores it, with its possessions and production. Physical inventory does not travel between planets. New planets use ten civilization axes and coherent regional climate to generate technology, institutions, ecology, architecture and inhabitants. Primitive, forged, mechanical and electronic equipment is constructed in the live world. Its shape, materials and handling depend on its actual construction. Even empty-handed residents retain their civilization’s clothing style. [Generated lives and cultures](docs/stichos/GENERATED-LIVES.md), [ordinary equipment](docs/stichos/ORDINARY-EQUIPMENT.md).

Your personal case names actual inhabitants and a real local terminal. A workshop audit, disputed land, copied identity or another generated problem gives context to delivering supplies, choosing a witness, earning local standing through fresh commissions and crafting the lens needed to register your case. These choices and obligations persist with the life; the notebook, HUD and household describe that resident’s history.

**Pause → Leave this body** asks for confirmation before a new resident is accepted. Backing out keeps the present person. World changes and established possessions remain; a new body supplies its own identity and belongings. One tab may hold the continuing life when the browser supports Web Locks. This is browser-local continuity, not a cloud account or an anticheat guarantee. [Life and universe contract](docs/stichos/UNIVERSE.md).

## Meet other players

Open **Room**, leave its code blank to host a **Browser room**, and share the code, link or QR. A full invitation selects the correct planet and geography; code-only discovery can also find an online host’s world before life creation. PeerJS provides signalling and WebRTC carries the room traffic. The host must keep the game open. **Galaxy → Open public frequency** uses a deterministic rendezvous code for that planet, joining an available host or attempting to host it. A planet on the chart is not evidence of online players or an always-on service.

Rooms share presence, gestures, Local/Room chat, hostile combat, doors, finite resource claims and registered production platforms. Personal health, inventory, tool condition, progression and story remain local. No PvP, global population simulation, authoritative MMO economy or automatic host migration is implemented.

For an optional dedicated WebSocket room server:

```sh
npm run server
```

Select **Room → Connection options → Dedicated world node** and use `ws://localhost:4175/ws` locally. Remote hosting needs suitable HTTPS/WSS and origin configuration. Signed checkpoints retain shared changes; restoring authority requires its private owner storage. [Multiplayer](docs/stichos/MULTIPLAYER.md) and [world persistence](docs/stichos/WORLD-PERSISTENCE.md) describe the boundaries.

The optional [native Pear node](pear-node/README.md) uses actual Corestore/Hypercore and Hyperswarm to replicate signed **public** checkpoints. It runs separately in Node; it is neither browser WebAssembly nor a packaged Pear desktop app. Someone must operate and retain it. A public replica contains no owner private key or reconnect credentials and cannot replace that private backup.

## Install and optional services

**Install app** is available on the title and pause menu. Supporting browsers show their native installation prompt; otherwise the game explains the browser menu or iOS Add to Home Screen path. The production service worker supports offline solo play after a complete online load. Installing does not create cloud synchronization, a bundled native multiplayer server, or offline multiplayer. Actual iOS installation and a complete installed-PWA lifecycle have not been browser-verified.

**Pause → AI companion** can pair with an optional locally running Codex companion and report installation and authentication status. **NPC model inference is unavailable in this release.** No Codex WebAssembly runtime or model turn runs in the game. Existing dialogue remains authored/procedural; successful local authentication does not unlock generated conversations. [Capability and safety contract](docs/stichos/AI-COMPANION.md).

**Life → Cosmetic shop** previews optional outfits. Real-money purchasing remains disabled until a separately operated payment server is configured. Server-verified cosmetic wallet recovery is separate from continuing-life storage. No real payment was made during development. [Payments](docs/stichos/PAYMENTS.md).

## Things to do

- **Construct production:** **Work** places propagation beds, sawmills and ore sorters on clear ground. Build with actual materials, load finite inputs, let batches advance while you play, and approach to collect. Shared sawmills and sorters claim real nearby sources through the room authority. [Production rules and browser proof](docs/stichos/PRODUCTION.md).
- **Explore:** square-tile terrain continues across positive and negative coordinates. Roads and bridges connect generated settlements. Eleven overlapping wilderness biomes include warm woodland, meadows, dunes, wetlands, volcanic country and frozen regions. Local heat, cold, altitude and air quality affect the body; real interiors provide shelter. There is no enclosing island boundary.
- **Travel between distinct places:** major cities occupy a 640-tile lattice, with one civic landmark per city. Generation-four institutions and architecture reflect the local civilization. Smaller villages and hamlets break up the journey, usually about 190–237 tiles apart on trunk routes. Homes, inns, workshops, greenhouses, storehouses, and civic halls have distinct generated footprints, facades, and useful interiors.
- **Uncover the atlas:** explored terrain and discovered places stay in your current life’s memory across saves and body changes. Pan, zoom, locate coordinates, fit the whole explored region, and mark a direction to follow. Unvisited country remains dark.
- **Manage a household:** begin with your resident’s actual home, finite possessions and personal relationships. Choose whom to trust, commission forestry/quarry/garden work, and follow workers as they walk to reserved resources, perform actual tool strokes, return, and make the finite yield available for collection. Wages become the worker’s own money. **Life → Household & tools** manages tools, repairs, trust and assignments. Assignments currently operate in solo play.
- **Work for supplies:** select an axe, pickaxe or sickle in the satchel. Each click or E performs one stroke; trees need 4–7, minerals 5–9, and plants two. Recovery, energy and tool condition constrain the work. Repairs consume coins, timber and ore at a workbench.
- **Gather and prepare:** cequin supports breathing, heartleaf becomes medicine, emberroot restores warmth. Timber and conductive ore supply equipment and radio repairs. Gathering changes the actual world, and harvested objects stay removed when you leave and return.
- **Recognize botanical varieties:** stems, branches, leaf arrangement, buds, and roots are generated together. Wild varieties yield different amounts according to their visible growth. Hover or approach to inspect the harvest before gathering.
- **Talk and decide:** meet the real ally, witness and rival named in your personal case. Deliver its promised goods, choose whose account to trust, and earn the required local standing. Residents’ names, displayed professions, factions and terminology reflect their civilization. Merchants buy supplies and sell provisions and individually generated equipment.
- **Carry a dispatch:** noticeboards, archivists, and engineers send you to a named person in another settlement. Deliver the authorized account, disclose its omitted witness note, or withhold it. Payment and the two families’ trust reflect your choice.
- **Choose equipment:** merchant stock, raider drops, inherited possessions and forged items share the local construction generator. Compare exact material, geometry, reach, impact and recovery in Trade and Gear. Primitive blades, mechanical launchers and electronic coilcasters reflect the civilization; multiple constructions in the same family remain individually owned and selectable. [Equipment contract](docs/stichos/ORDINARY-EQUIPMENT.md).
- **Fight and recover:** aim your carried blade, rod or ranged weapon at an attacker, use a botanical ward, consume medicine, or rest at a bench or shrine. Weapon material, name, strength, reach, recovery, and successful-hit effects are seeded. Enemies use their generated weapon’s reach, impact, and recovery. Ranged attackers warn before releasing aimed projectiles; sidestep, take cover, or interrupt an attack. Attacking residents has consequences.
- **Develop a calling:** botany, crafting and combat improve through practice. Physical weapon improvements remain with their bodies. Your personal commitments and seeded noticeboard commissions offer fieldwork, medicine preparation, cultivation and identified road threats. Preparation commissions require actual work after acceptance.
- **Forge from components:** choose a staff, sword or bow, its structural material, living botanical core and proportions. The 81 combinations per host resolve into actual generated constructions with matching appearance, reach, recovery and successful-hit effects. Crafting level two and a nearby workbench unlock construction; the preview shows the exact cost and resulting profile. Forged equipment stays with its body. See [FORGING.md](docs/stichos/FORGING.md).
- **Invent beyond the recipe list:** **Life → Invent** generates connected assemblies from new seed-addressed sketches or arbitrary design phrases. Branches, shafts, blades, chambers, rings and living tissues determine shape, material costs, combat delivery and restorative properties. Make, carry, equip, use or salvage the actual object. New designs are not selected from the 81-recipe Forge menu; the supported interaction verbs remain contact, projectile, pulse and consumption.
- **Make a home:** buy an actual house or inn room, furnish its rest, hearth, workshop and garden slots, and cultivate cequin, heartleaf and emberroot. Procedural furniture and plants appear inside the building. Growing time advances through living and rest; plots, improvements and harvests persist.
- **Choose your clothing:** six earned patterns and three optional premium outfits alter colors, hats and cloaks while preserving anatomy and equipment strength. Each host remembers its own outfit.
- **Inhabit another person:** after completing your personal case and registering it at the local terminal, concentrate at a shrine. The candidate is an existing living human with a name, location, appearance, and clan. Your consciousness moves into that body; the previous body remains in the world. The occupied character is not duplicated. Each body keeps its own supplies, coins, and weapons; returning restores what you left with that person. Knowledge, experience and investigation persist within that planet’s life. **Pause → Leave this body** also offers a new resident outside a shared room; it preserves the planet and existing belongings.

## Optional legacy story

**Theo Bishop’s story · Stíchos** starts the established priest in Vespera. His residence, 240 coins, three working tools and paid relationships belong to that authored life. The clinic’s opening cequin choice changes family trust, and the archivist and engineer lead toward the repaired radio that permits mind travel.

- **Follow Theo’s story:** Theo’s bound notebook contains eighteen dated entries from 3866–3886, four illustrated botanical studies, a searchable glossary, and the current investigation. His scientific habits, mistakes, concealed identity, public compromises, and Sallas hypotheses develop over ten Earth years. The priest physically keeps the paper book; another host can recall its words without acquiring it.
- **Search seed vaults:** follow an excavation notice off the road into connected botanical chambers. Physical rock walls, alternate corridors, raiders, and a deep archive give the expedition an objective. Recover plants, materials, and a remembered Sallas clue. Vaults appear in generations 2 and 3.
- **Resolve the Sallas investigation:** the repaired radio begins six acts and twenty-four leads across generated clan cities, living witnesses, three excavations and spatial signal puzzles. Medicines, testimony, industrial agreements and the final return decision have consequences. Both endings leave the world playable. See [CAMPAIGN.md](docs/stichos/CAMPAIGN.md).
- **Build a Winter Compact:** an additional civic arc is designed around twenty-four projects in six districts. Compare two witnesses, choose obligations, perform real gathering, preparation or paid work, and deliver the agreed supplies. Earlier terms change later costs, trust and district outcomes. This is a defined continuing-life arc; its intended longer playtime has not been established by a four-hour human playthrough.

<details>
<summary>Legacy opening investigation hints</summary>

Speak to the botanist beside the cathedral garden and ask what the clinic needs. Three cequin can help the clinic or support Brown's industrial trial. Gather leaves if you have used your initial supply.

Then open the cathedral door, walk inside, and speak to the archivist about the Sallas record. The engineer explains the damaged radio. A signal lens costs **2 ore + 1 timber** and requires a nearby workbench. Repairing the radio then consumes **2 additional ore + 2 additional timber + the lens**. Two workshop ore stocks and two cultivated timber trees near the starting district provide enough raw material. Equip the pickaxe or axe and perform the required strokes; the priest already owns both tools. Merchants and other districts provide additional supplies.

A repaired signal allows voluntary mind travel at a shrine. Choose among the nearby eligible living people; the dialogue identifies each person and their possessions. It opens a way to continue investigating; it does not finish the entire Sallas mystery. The repaired radio immediately adds the first of twenty-four Sallas leads. Complete that investigation to resolve the return question, then continue into remembered willing hosts and a chosen profession.

For the first excavation in a new generation-3 life, take the road south to the next east–west road at **y=213**, then east toward the signed northern approach. The first vault is around **107, 107**; its exact entrance depends on the seed. Read its notice to mark an investigation. Earlier generation-2 lives retain their first vault around **40, 40**. Prepare medicine and supplies before entering.

</details>

## Controls

| Input                        | Action                                                  |
| ---------------------------- | ------------------------------------------------------- |
| WASD / arrows                | Walk                                                    |
| Shift                        | Run while energy lasts                                  |
| Click ground                 | Follow a path                                           |
| Click a person or object / E | Approach or interact; each resource stroke is real work |
| Mouse                        | Aim                                                     |
| F / 1 / right mouse          | Equipped attack                                         |
| Q / 2                        | Botanical ward                                          |
| 3 / 4 / 5 / 6                | Cequin / salve / warming tonic / food                   |
| I / B                        | Satchel / preparation                                   |
| K / L                        | Equipment / professions, homes and clothing             |
| J / M / G                    | Notebook / world atlas / galaxy                         |
| Enter                        | Focus chat                                              |
| Escape                       | Close conversation or panel, then pause                 |
| Mouse wheel                  | Zoom                                                    |

The satchel’s tool buttons select axe, pickaxe or sickle. **Work** opens construction and production; click a built platform to inspect its batches. Touch controls expose movement and actions. Closed doors block bodies and attacks; click a door or reachable ground beyond it to open and continue through the actual doorway.

A generation-four notebook presents the current resident’s personal history, commitments and acquaintances. In the legacy story, the priest carries a physical notebook: open its cover, read, close and put it away. Other bodies recall that knowledge without receiving his paper object. The world atlas reveals actual travel and permits panning, coordinate search and a tracked bearing; searching does not reveal terrain or teleport. A wrapping globe is not implemented. [Atlas](docs/stichos/ATLAS.md).

## Continuity and offline use

Normal actions autosave the current life under `verso.stichos.v1`; visited planets also retain a private life record in this origin. **Continue this life** resumes, **Galaxy** returns to another remembered planet, and leaving a body preserves the existing world. The current main UI has no routine Download save or Restore a save controls. Historical file-based QA is evidence for its recorded older build, not instructions for this UI.

Browser profiles and origins are distinct identities: different ports, `localhost`, `127.0.0.1` and the published site do not share progress. Clearing site data removes local life and ownership records; no cloud recovery of a life is supplied. The prepared cosmetic wallet has its own recovery mechanism and cannot restore the game world.

Records preserve their world-generation version. Earlier worlds retain their geography and established changes; compatibility migrations retain prior lives. The production service worker caches a complete build and waits for old clients to close before adopting an update. Offline solo play requires that cache; room discovery and live shared play require connectivity.

## Generation and rendering

`src/stichos/world.ts` creates 16×16 chunks from addressed coordinate hashes and coherent noise. An LRU cache retains at most 160 world chunks. A connected network of roads and bridges crosses settlement regions. Town footprints, material details, local populations, resources, and wilderness encounters vary by seed. The explicit legacy campaign keeps its cathedral and story anchors; generation four instead supplies contextual institutions and personal origins. In generation three, ordinary urban rocks are removed, canonical ore stocks occupy workshop yards, and coherent woodland stands and perimeter shelterbelts keep the city core and road verges clearer. The update removes incidental obstacles without moving existing buildings, bodies or terrain. Humanoid seeds now vary skulls, jaws, eye spacing, facial details, shoulders, waists, hems, pockets and tailoring as well as palette.

New generation-four worlds couple smoothly varying elevation, rainfall, temperature, latitude and geothermal fields into eleven overlapping biome weights. These determine terrain, vegetation, minerals and actual environmental exposure. Civilization axes independently shape architecture, institutions, names, clothing and equipment; older worlds retain their recorded generation. `vault.ts` partitions an excavation into rooms, connects a room graph with passages and cycles, applies constrained cellular growth, and verifies its walkable component before placing it in the world. `equipment.ts` and `botany.ts` construct sprites from shared parameters that also determine weapon handling and plant yields.

`src/stichos/art.ts` builds reusable pixel modules for ground, masonry, roofs, trees, plants, props, and humanoid parts. `render.ts` composes those modules into the camera view, with procedural gait, roof cutaways, occlusion handling, snow, breath, footsteps, light, and ability effects. Ground chunks and reusable art have bounded render caches. There is no painted full-world background or fixed terrain image.

`src/stichos/session.ts` owns gameplay, persistent world changes, inventory, trade, quests, clan trust, solo combat, and body occupancy. Shared rooms use the portable `room-authority.mjs` and `shared-combat.ts` simulation for hostile NPCs, then apply validated snapshots and numbered receipts locally. Untouched NPCs have a bounded runtime cache; meaningful changes remain in saved state. The browser UI and narrative transition live in `app.ts`; `audio.ts` synthesizes ambience, breath, radio interference, heartbeat, and transfer sounds.

`atlas.ts` renders remembered terrain at several scales and handles pointer-anchored zoom, panning, and coordinate navigation. The session stores exploration in compact 8×8-cell masks. Unknown map regions do not generate terrain chunks or become explored merely by viewing them. Read [ATLAS.md](docs/stichos/ATLAS.md) for the persistence and navigation contract.

Read [generated worlds and lives](docs/stichos/GENERATED-LIVES.md), [ordinary equipment](docs/stichos/ORDINARY-EQUIPMENT.md), the [generation references supplied by Sabino](docs/stichos/REFERENCES.md), [visual direction](docs/stichos/VISUALS.md), and [browser QA](docs/stichos/QA.md). [Story canon](docs/stichos/CANON.md) describes the optional legacy campaign.

## Verification

```sh
npm test
npm run build
npm run format:check
```

Current focused real-input harnesses use a previously verified, isolated Agent Workspace Chromium endpoint:

```sh
node scripts/browser-universe.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
node scripts/browser-production.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
node scripts/browser-peer-rooms.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
```

**The published build passed native three-player URL/code joining and all four generated-life offline/continuation checks.** Its full source suite passed 384 tests, followed by 24 focused checks for the final residential-housing correction.

The current generation-four evidence includes **43 automated network tests**, **seven checks with eight actual PeerJS/WebRTC clients**, and **five native Pear integration tests**. They verify exact equipment addresses, shared combat, signed checkpoint persistence, authenticated continuity and actual local-DHT replication. A separate three-browser native-input run created distinct lives and joined the same generation-four world using invitations. [Generation-four transport proof](docs/stichos/GENERATION4-NETWORK-QA.md).

The repaired interface has **207 normal-flow captures**, **126 explicitly staged presentation captures**, **72 generated-life captures** and **five final geometry checks**, with no browser errors in the completed runs. The generated-life route uses ordinary UI creation and checks the resident’s own notebook and HUD. A warm-world native arrival also verified a carried blade while facing north at approximately 60 FPS. [Screen repairs and evidence](docs/stichos/SCREEN-DESIGN-FIXES.md).

[QA.md](docs/stichos/QA.md) records the final source-suite/build status and separates current local evidence from previous public deployments and historical harnesses. The earlier 345- and 347-test totals, universe/production checks and legacy story routes belong to their named checkpoints. The legacy main investigation plus all 24 Compact projects measured **3.548 active simulated hours**, excluding rest jumps; **four hours of human play remains unverified**. Physical gamepads, large-scale war, a wrapping globe, global accounts and live billing are not implemented. This is not a feature-complete reproduction of Vagabond.

## Earlier work

The [earlier visual chapter](docs/VISUAL-STUDY.md) remains at `?study=1`; the [procedural anatomy lab](docs/PROCEDURAL-LAB.md) remains at `?lab=1` or `?generative=1`. Their controls and save keys belong to those development references, not the current main life interface.
