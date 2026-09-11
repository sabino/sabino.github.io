# Verso — Destino: Stíchos

A continuous browser RPG based on Sabino's **Destino: Stíchos** story. You are Theo Bishop, stranded for twenty local years in a priest's body. In the cold, cequin keeps people breathing. Six families compete over botanical knowledge, industrial production, and the future. The Sallas secret may explain the silence from home.

Walk beyond the cathedral, follow roads into other settlements, gather plants and materials, prepare medicine, trade, fight, and make promises to the people you meet. The terrain streams as you travel. There is no physical rift or extraction gate in this experience. Mind travel inhabits another living humanoid in the world.

## Play

Use **Node.js 22.18+**.

```sh
npm install
npm run dev
```

Open **http://localhost:4173**. For the production build:

```sh
npm run build
npm run preview
```

Open **http://localhost:4174**. This is now the default experience. The production `dist/` directory can be served by a static server, including beneath a URL subpath. The game has no runtime account, asset CDN, or model API dependency.

The first sequence is a memory of the failed transmission. Play resumes in **3886**, after Theo's twenty years on Stíchos. Use **Continue** during the sequence to skip it. The name or number entered on the title screen determines the world; the same seed reproduces its initial geography, inhabitants, resources, and equipment properties.

## Things to do

- **Explore:** square-tile terrain continues across positive and negative coordinates. Roads and bridges connect generated settlements. Frostwood, tundra, marshes, and highlands contain different resources and terrain. There is no enclosing island boundary.
- **Gather and prepare:** cequin supports breathing, heartleaf becomes medicine, emberroot restores warmth. Timber and conductive ore supply equipment and radio repairs. Gathering changes the actual world, and harvested objects stay removed when you leave and return.
- **Talk and decide:** botanists offer local supply work; a merchant buys supplies and sells provisions and weapons; the archivist and engineer advance the Sallas investigation. The opening cequin choice changes clan trust and consumes the same scarce bundle either way.
- **Fight and recover:** aim a staff, sword, or bow at an attacker, use a botanical ward, consume medicine, or rest at a bench or shrine. Weapon material, name, strength, reach, recovery, and successful-hit effects are seeded. Attacking residents has consequences.
- **Inhabit another person:** after restoring the mind signal, concentrate at a shrine. The candidate is an existing living human with a name, location, appearance, and clan. Your consciousness moves into that body; the previous body remains in the world. The occupied character is not duplicated. Each body keeps its own supplies, coins, and weapons; returning restores what you left with that person. Your knowledge, experience, investigation, and the world's changes follow your mind.

<details>
<summary>Opening investigation hints</summary>

Speak to the botanist beside the cathedral garden and ask what the clinic needs. Three cequin can help the clinic or support Brown's industrial trial. Gather leaves if you have used your initial supply.

Then open the cathedral door, walk inside, and speak to the archivist about the Sallas record. The engineer explains the damaged radio. A signal lens costs **2 ore + 1 timber** and requires a nearby workbench. Repairing the radio then consumes **2 additional ore + 2 additional timber + the lens**. Two mineral deposits and two timber trees near the starting district provide enough raw material. Merchants and other districts provide additional supplies.

A repaired signal allows voluntary mind travel at a shrine. It opens a way to continue investigating; it does not finish the entire Sallas mystery. You can keep following the roads after the opening thread.

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
| J / M                    | Journal / map                                      |
| Escape                   | Close conversation, close a panel, or pause        |
| Mouse wheel              | Zoom                                               |

Touch controls provide movement, interaction, attacks, medicine, and the satchel. Desktop equipment buttons select weapons you own; buy additional types from a merchant. The journal records quest details and clan trust. Choose **Follow this thread** to track an active task in the sidebar and on the map. Click an inventory item to read what it does. Lens preparation requires a workbench; botanical preparations can be made while traveling.

## Saving and offline use

Progress autosaves to this browser under `verso.stichos.v1`. **Continue this life** resumes it. The pause menu can **Download save** or **Restore a save**; invalid files leave the current run intact. The previous prototypes use separate save keys.

Storage belongs to a browser and origin: different ports, `localhost`, and `127.0.0.1` have different saves. Export before changing addresses or clearing browser data. The production service worker caches a build after a complete online load. Updates wait for existing sessions to close; they do not reload a live game automatically.

## Generation and rendering

`src/stichos/world.ts` creates 16×16 chunks from addressed coordinate hashes and coherent noise. An LRU cache retains at most 160 world chunks. A connected network of roads and bridges crosses settlement regions. Town footprints, material details, local populations, resources, and wilderness encounters vary by seed. The starting cathedral and story roles provide stable narrative anchors.

`src/stichos/art.ts` builds reusable pixel modules for ground, masonry, roofs, trees, plants, props, and humanoid parts. `render.ts` composes those modules into the camera view, with procedural gait, roof cutaways, occlusion handling, snow, breath, footsteps, light, and ability effects. Ground chunks and reusable art have bounded render caches. There is no painted full-world background or fixed terrain image in Stíchos.

`src/stichos/session.ts` owns gameplay, persistent world changes, inventory, trade, quests, clan trust, combat, and body occupancy. Untouched NPCs have a bounded runtime cache; meaningful changes remain in saved state. The browser UI and narrative transition live in `app.ts`; `audio.ts` synthesizes ambience, breath, radio interference, heartbeat, and transfer sounds.

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
```

The QA report distinguishes what was verified in the browser from simulation tests. Save download/import, invalid-file preservation, and service-worker offline reload and play are also exercised by `scripts/browser-stichos-storage.mjs`. Physical gamepads are not currently integrated into Stíchos. This is an expanding playable foundation, with an opening investigation and repeatable local work; the full Sallas story, large-scale war simulation, multiplayer, and richer long-term quest generation are not finished.

## Earlier work

The [earlier visual chapter](docs/VISUAL-STUDY.md) remains available with `?study=1`. The [procedural anatomy lab](docs/PROCEDURAL-LAB.md) remains at `?lab=1` (or `?generative=1`). They are development references with their own controls and saves. Stíchos is the main game now.
