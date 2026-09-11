# Verso — Destino: Stíchos

A continuous browser RPG based on Sabino's **Destino: Stíchos** story. Stíchos is the planet; **Vespera** is the starting city. You are Theo Bishop, an exceptionally intelligent traveler from the future, stranded for twenty local years in a priest's body. In the cold, cequin keeps people breathing. Six families compete over botanical knowledge, industrial production, and the future. The Sallas secret may explain the silence from home.

Walk beyond the cathedral, follow roads into other settlements, gather plants and materials, prepare medicine, trade, fight, and make promises to the people you meet. The terrain streams as you travel. There is no physical rift or extraction gate in this experience. Mind travel inhabits another living humanoid in the world.

## Play

Use **Node.js 26** (the verified runtime for this build).

```sh
npm install
npm run dev
```

Open **http://localhost:4173**. For the production build:

```sh
npm run build
npm run preview
```

Open **http://localhost:4174**. This is now the default experience. The production `dist/` directory can be served by a static server, including beneath a URL subpath. Solo play works without an account, external assets, or model API. Cooperative rooms and the optional cosmetic shop use the separate local server below.

For cooperative rooms and the prepared cosmetic shop, keep another terminal running:

```sh
npm run server
```

The **Together** button creates or joins an eight-person room on `ws://localhost:4175/ws`. A friend on your network opens `http://YOUR-LAN-IP:4173`, starts the same seed/geography, and uses your room code. Combat and story remain personal; presence, gatherings, containers and doors are shared. Read [MULTIPLAYER.md](docs/stichos/MULTIPLAYER.md) for its actual scope and hosting setup.

**Life → Cosmetic shop** previews three real-money outfits. Purchases are disabled until the owner configures Stripe prices, keys and a webhook. Paid ownership is verified by the server and can be restored with a private recovery code. No payment account was used or charged during development. Read [PAYMENTS.md](docs/stichos/PAYMENTS.md).

The opening has six recollections, advanced at your pace with **Continue** or the arrow keys. **Begin in 3886** skips directly to play. The failed transmission happened in **3866**; play resumes in **3886**, after twenty stíchoi, equivalent to ten Earth years. The name or number entered on the title screen determines the world; the same seed reproduces its initial geography, inhabitants, resources, and equipment properties.

## Things to do

- **Explore:** square-tile terrain continues across positive and negative coordinates. Roads and bridges connect generated settlements. Frostwood, tundra, marshes, and highlands contain different resources and terrain. There is no enclosing island boundary.
- **Travel between distinct places:** major cities occupy a 640-tile lattice, with one church per city. Smaller villages and hamlets break up the journey, usually about 190–237 tiles apart on trunk routes. Homes, inns, workshops, greenhouses, storehouses, and civic halls have distinct generated footprints, facades, and useful interiors.
- **Uncover the atlas:** explored terrain and discovered places stay in Theo’s memory across saves and body changes. Pan, zoom, locate coordinates, fit the whole explored region, and mark a direction to follow. Unvisited country remains dark.
- **Read a life already lived:** Theo’s bound notebook contains eighteen dated entries from 3866–3886, four illustrated botanical studies, a searchable glossary, and the current investigation. His scientific habits, mistakes, concealed identity, public compromises, and Sallas hypotheses develop over ten Earth years. The priest physically keeps the paper book; another host can recall its words without acquiring it.
- **Manage an established household:** Theo starts with a real residence, 240 coins, three body-owned working tools and three named paid relationships. Choose whom to trust, commission forestry/quarry/garden work, and collect the agreed yield after time passes. Workers consume actual nearby resources. **Life → Household & tools** manages tools, repairs, trust and assignments. Assignments currently operate in solo play.
- **Work for supplies:** select an axe, pickaxe or sickle in the satchel. Each click or E performs one stroke; trees need 4–7, minerals 5–9, and plants two. Recovery, energy and tool condition constrain the work. Repairs consume coins, timber and ore at a workbench.
- **Gather and prepare:** cequin supports breathing, heartleaf becomes medicine, emberroot restores warmth. Timber and conductive ore supply equipment and radio repairs. Gathering changes the actual world, and harvested objects stay removed when you leave and return.
- **Recognize botanical varieties:** stems, branches, leaf arrangement, buds, and roots are generated together. Wild varieties yield different amounts according to their visible growth. Hover or approach to inspect the harvest before gathering.
- **Talk and decide:** botanists offer local supply work; a merchant buys supplies and sells provisions and weapons; the archivist and engineer advance the Sallas investigation. The opening cequin choice changes clan trust and consumes the same scarce bundle either way.
- **Carry a dispatch:** noticeboards, archivists, and engineers send you to a named person in another settlement. Deliver the authorized account, disclose its omitted witness note, or withhold it. Payment and the two families’ trust reflect your choice.
- **Search seed vaults:** follow an excavation notice off the road into connected botanical chambers. Physical rock walls, alternate corridors, raiders, and a deep archive give the expedition an objective. Recover plants, materials, and a remembered Sallas clue. Vaults appear in generations 2 and 3.
- **Fight and recover:** aim a staff, sword, or bow at an attacker, use a botanical ward, consume medicine, or rest at a bench or shrine. Weapon material, name, strength, reach, recovery, and successful-hit effects are seeded. Enemies use their generated weapon’s reach, impact, and recovery. Bows warn before releasing aimed arrows; sidestep, take cover, or interrupt an attack. Attacking residents has consequences.
- **Resolve the Sallas investigation:** the repaired radio begins six acts and twenty-four leads across generated clan cities, living witnesses, three excavations and spatial signal puzzles. Medicines, testimony, industrial agreements and the final return decision have consequences. Both endings leave the world playable. See [CAMPAIGN.md](docs/stichos/CAMPAIGN.md).
- **Develop a calling:** botany, crafting and combat improve through practice. Physical weapon improvements remain with their bodies. Seven continuing-life milestones and seeded noticeboard commissions offer fieldwork, medicine preparation, cultivation and identified road threats.
- **Forge from components:** choose a staff, sword or bow, its structural material, living botanical core and proportions. The 81 combinations per host resolve into actual generated constructions with matching appearance, reach, recovery and successful-hit effects. Crafting level two and a nearby workbench unlock construction; the preview shows the exact cost and resulting profile. Forged equipment stays with its body. See [FORGING.md](docs/stichos/FORGING.md).
- **Invent beyond the recipe list:** **Life → Invent** generates connected assemblies from new seed-addressed sketches or arbitrary design phrases. Branches, shafts, blades, chambers, rings and living tissues determine shape, material costs, combat delivery and restorative properties. Make, carry, equip, use or salvage the actual object. New designs are not selected from the 81-recipe Forge menu; the supported interaction verbs remain contact, projectile, pulse and consumption.
- **Make a home:** buy an actual house or inn room, furnish its rest, hearth, workshop and garden slots, and cultivate cequin, heartleaf and emberroot. Procedural furniture and plants appear inside the building. Growing time advances through living and rest; plots, improvements and harvests persist.
- **Choose your clothing:** six earned patterns and three optional premium outfits alter colors, hats and cloaks while preserving anatomy and equipment strength. Each host remembers its own outfit.
- **Inhabit another person:** after restoring the mind signal, concentrate at a shrine. The candidate is an existing living human with a name, location, appearance, and clan. Your consciousness moves into that body; the previous body remains in the world. The occupied character is not duplicated. Each body keeps its own supplies, coins, and weapons; returning restores what you left with that person. Your knowledge, experience, investigation, and the world's changes follow your mind.

<details>
<summary>Opening investigation hints</summary>

Speak to the botanist beside the cathedral garden and ask what the clinic needs. Three cequin can help the clinic or support Brown's industrial trial. Gather leaves if you have used your initial supply.

Then open the cathedral door, walk inside, and speak to the archivist about the Sallas record. The engineer explains the damaged radio. A signal lens costs **2 ore + 1 timber** and requires a nearby workbench. Repairing the radio then consumes **2 additional ore + 2 additional timber + the lens**. Two workshop ore stocks and two cultivated timber trees near the starting district provide enough raw material. Equip the pickaxe or axe and perform the required strokes; the priest already owns both tools. Merchants and other districts provide additional supplies.

A repaired signal allows voluntary mind travel at a shrine. Choose among the nearby eligible living people; the dialogue identifies each person and their possessions. It opens a way to continue investigating; it does not finish the entire Sallas mystery. The repaired radio immediately adds the first of twenty-four Sallas leads. Complete that investigation to resolve the return question, then continue into remembered willing hosts and a chosen profession.

For the first excavation in a new generation-3 life, take the road south to the next east–west road at **y=213**, then east toward the signed northern approach. The first vault is around **107, 107**; its exact entrance depends on the seed. Read its notice to mark an investigation. Earlier generation-2 lives retain their first vault around **40, 40**. Prepare medicine and supplies before entering.

</details>

## Controls

| Input                    | Action                                             |
| ------------------------ | -------------------------------------------------- |
| WASD / arrow keys        | Walk                                               |
| Shift                    | Run while energy lasts                             |
| Click ground             | Follow a path                                      |
| Click a person or object | Approach and interact when reachable               |
| E                        | Talk, gather, open, read, or use the nearby object |
| Mouse                    | Aim                                                |
| F / 1 / right mouse      | Use the equipped weapon                            |
| Q / 2                    | Botanical ward                                     |
| 3 / 4 / 5 / 6            | Cequin / salve / warming tonic / food              |
| I / B                    | Satchel / preparation recipes                      |
| K                        | Inspect this body’s generated equipment            |
| L                        | Callings, professions, homes, clothing and shop    |
| J / M                    | Notebook / map                                     |
| Escape                   | Close conversation, close a panel, or pause        |
| Mouse wheel              | Zoom                                               |

Touch controls provide movement, interaction, attacks, medicine, and the satchel. Desktop equipment buttons select weapons you own; buy additional types from a merchant. The journal records quest details and clan trust. Choose **Follow this thread** to track an active task in the sidebar and on the map. Click an inventory item to read what it does. Lens preparation requires a workbench; botanical preparations can be made while traveling.

Closed doors block bodies, arrows, melee and wards. Use **E** or click a door to open it. A click on reachable ground beyond a door opens it as you approach and continues the route; in a cooperative room this waits for the server's reply. A door cannot close over an occupying body.

**J** or the satchel’s notebook button brings out the priest’s closed book. **Open notebook** unfolds it; **Close book** folds the cover shut, and **Put away**, **J**, or **Escape** returns to the world. Use the contents, leaf arrows, and section tabs to read. **Plain type** switches the handwriting to a reading font. **Remember the beginning** replays the introduction without restarting the life. In another body, the same control opens clearly identified remembered pages; the physical notebook remains with the priest. Current threads and fresh observations continue to follow Theo’s knowledge.

Press **M** for the atlas. Drag or focus the chart and use arrow keys to pan; scroll or press **+ / −** to zoom. **My body** recenters, **All explored** fits the remembered world, and known-place buttons locate discovered settlements. Coordinate search changes the view without revealing terrain. Click a point and choose **Follow this mark** for a bearing in your field notes; this does not teleport or automatically walk the character. The current view and chart mark last for the active life in this page; discovered terrain and places are saved. The atlas represents the continuous world as a plane; a wrapping globe is not implemented.

## Saving and offline use

Progress autosaves to this browser under `verso.stichos.v1`. **Continue this life** resumes it. The pause menu can **Download save** or **Restore a save**; invalid files leave the current run intact. The previous prototypes use separate save keys.

The save records its world-generation version. Earlier lives retain their wilderness, settlement spacing, and established harvests. **Start a new life for generation 3’s distant cities and varied buildings**; export an existing life first if you want to retain both. Existing lives also receive the atlas, reconstructing a coarse explored trail only from their saved visited chunks.

Older saves made before doors gained collision keep their exact body and rest positions: only doors overlapping those saved bodies or anchors are opened during migration. New saves retain their physical door state strictly.

Storage belongs to a browser and origin: different ports, `localhost`, and `127.0.0.1` have different saves. Export before changing addresses or clearing browser data. The production service worker caches a build after a complete online load. Updates wait for existing sessions to close; they do not reload a live game automatically.

## Generation and rendering

`src/stichos/world.ts` creates 16×16 chunks from addressed coordinate hashes and coherent noise. An LRU cache retains at most 160 world chunks. A connected network of roads and bridges crosses settlement regions. Town footprints, material details, local populations, resources, and wilderness encounters vary by seed. The starting cathedral and story roles provide stable narrative anchors. In generation three, ordinary urban rocks are removed, canonical ore stocks occupy workshop yards, and coherent woodland stands and perimeter shelterbelts keep the city core and road verges clearer. The update removes incidental obstacles without moving existing buildings, bodies or terrain. Humanoid seeds now vary skulls, jaws, eye spacing, facial details, shoulders, waists, hems, pockets and tailoring as well as palette.

New worlds couple broad altitude, moisture, and temperature fields into coherent cold-climate regions. `vault.ts` partitions an excavation into rooms, connects a room graph with passages and cycles, applies constrained cellular growth, and verifies its walkable component before placing it in the world. `equipment.ts` and `botany.ts` construct sprites from shared parameters that also determine weapon handling and plant yields.

`src/stichos/art.ts` builds reusable pixel modules for ground, masonry, roofs, trees, plants, props, and humanoid parts. `render.ts` composes those modules into the camera view, with procedural gait, roof cutaways, occlusion handling, snow, breath, footsteps, light, and ability effects. Ground chunks and reusable art have bounded render caches. There is no painted full-world background or fixed terrain image in Stíchos.

`src/stichos/session.ts` owns gameplay, persistent world changes, inventory, trade, quests, clan trust, combat, and body occupancy. Untouched NPCs have a bounded runtime cache; meaningful changes remain in saved state. The browser UI and narrative transition live in `app.ts`; `audio.ts` synthesizes ambience, breath, radio interference, heartbeat, and transfer sounds.

`atlas.ts` renders remembered terrain at several scales and handles pointer-anchored zoom, panning, and coordinate navigation. The session stores exploration in compact 8×8-cell masks. Unknown map regions do not generate terrain chunks or become explored merely by viewing them. Read [ATLAS.md](docs/stichos/ATLAS.md) for the persistence and navigation contract.

Read the [generation references supplied by Sabino](docs/stichos/REFERENCES.md), [story canon and adaptation decisions](docs/stichos/CANON.md), [visual direction](docs/stichos/VISUALS.md), and [browser QA](docs/stichos/QA.md).

## Verification

```sh
npm test
npm run build
npm run format:check
```

World tests cover reproducibility across chunk seams and load orders, negative and distant coordinates, a bounded chunk cache, settlement access, starting resources, and uninterrupted **3,200-tile road walks in both axes across three seeds**. Session tests exercise actual movement, gathering, crafting, trade, story choices, radio repair, combat effects, body possession and return, saves, corrupted files, and long exploration.

The browser harness uses actual input in an isolated Agent Workspace Chromium and read-only diagnostics:

```sh
node scripts/browser-stichos-check.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
node scripts/browser-stichos-check.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/ --atlas
node scripts/browser-notebook-check.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
```

The QA report distinguishes what was verified in the browser from simulation tests. Save download/import, invalid-file preservation, and service-worker offline reload and play are also exercised by `scripts/browser-stichos-storage.mjs`. Physical gamepads are not currently integrated into Stíchos. The Sallas campaign has a playable resolution and continuing activities. With timed tool work and earned repairs, a rushed simulation completed its twenty-four leads in about **68 minutes**, without reading time or optional professions/homes/commissions; **four hours of human play has not been verified**. Cooperative rooms share exploration and resource changes, while combat and NPC simulation remain local. Large-scale war, a wrapping globe, a public account service and live billing are not implemented. The mechanics take inspiration from Vagabond; this is not a feature-complete reproduction of that game.

## Earlier work

The [earlier visual chapter](docs/VISUAL-STUDY.md) remains available with `?study=1`. The [procedural anatomy lab](docs/PROCEDURAL-LAB.md) remains at `?lab=1` (or `?generative=1`). They are development references with their own controls and saves. Stíchos is the main game now.
