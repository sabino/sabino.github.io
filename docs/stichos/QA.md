# Stíchos browser QA

**PASS** — a generation-3 atlas and village journey, the earlier opening campaign and body-specific mind transfer, and a generation-2 vault/dispatch expedition completed through real browser input. The latest atlas check used `app-DHCdk53y.js` / service worker `f58d84fdadaa2ae9f891`. The opening and possession checks used `app-C7Uk0xX8.js` / service worker `fb8fa2a70d25b402a3ce`; the expedition used `app-BQLDpW6p.js` / `3cdc9cff1bf20984bc80`, at `http://localhost:4174/`.

The harness uses an isolated Agent Workspace Chromium tab, real CDP keyboard/mouse input, and read-only `window.stichos` diagnostics. It does not inject game state or directly write or clear browser storage; save changes come from normal game actions. The game runs on the separate localhost origin.

## Verified

- Seed entry, visible mind-transfer sequence, skip button, and humanoid staff host
- WASD produces actual world movement
- Cequin hotkey consumes a real item and sustains breathing
- Click approach and botanist dialogue choice: learn-cequin
- E opens a nearby conversation
- Journal/map/pause freeze time; inventory, mouse attack, and ward work
- Desktop foreground frame rate: 53.9 FPS at 1600×1000
- Harvested garden herbs, two timber trees, and two ore deposits through world clicks
- Supplied clinic with three harvested Cequin and changed the story
- Crafted salve through the recipe UI: salve
- Crafted lens through the recipe UI: lens
- Sallas record, engineer plan, and radio repair use the crafted lens and actual materials
- Merchant buy: buy:cequin
- Merchant sell: sell:cequin
- Continuous road travel streams chunks and reaches another settlement: 111.2 tiles, cache 160
- Completed campaign exported through Download save: [completed-campaign.json](../../.dream-loop/stichos-qa/completed-campaign.json)
- Save and Continue restore position, inventory, and harvested world changes
- No browser console or runtime errors

## Actual person and belongings

The separate possession pass continued the completed road journey. It entered Ana Ash, a living pilgrim at (78, 8), through the shrine's named dialogue choice. Real input verified:

- The recipient's actual location, body dimensions, face/clothing appearance, and identity were adopted; the occupied NPC was not duplicated.
- The priest remained at the actual departure position. The recipient carried a separate finite pack, while story progress remained remembered.
- Save/Continue retained the occupied person, their belongings, and the body left behind.
- Returning to the priest restored his exact inventory, coins, and weapons without an unwanted second transfer.

Evidence: [possession results and screenshots](../../.dream-loop/stichos-possession/). No console or runtime errors.

## Save files and offline play

The isolated storage pass was repeated on production `app-BQLDpW6p.js` / service worker `3cdc9cff1bf20984bc80`. Seven checks passed:

- Actual Download save JSON matched the live seed and position.
- The file chooser restored that downloaded position, inventory, and world.
- Corrupt JSON, an unsupported save version, and an oversized file each preserved the active life.
- Offline service-worker reload, saved continuation, and real walking worked. The cache held 18 assets; an uncached network request was blocked during the offline check.
- No runtime exceptions occurred.

Evidence: [storage results](../../.dream-loop/stichos-storage/results.json). The dedicated possession pass also independently verified body-specific belongings through normal Save/Continue.

## Generation-2 expedition

A fresh isolated context completed 554 paces of actual walking between 2026-09-11T03:07:12.020Z and 2026-09-11T03:10:30.314Z. The harness harvested herbs and crafted two salves, accepted a dispatch from the engineer, followed roads to the excavation, and marked the real deep archive through its roadside notice.

A generated wild Clustered snowcap displayed its name, construction and two-portion yield in both hover and nearby prompts. Actual gathering added exactly two rations. Newly accepted dispatch and vault quests immediately replaced the tracked sidebar objective.

Keyboard input followed passable room corridors, and staff attacks plus the ward defeated both vault guards with the current ranged-enemy combat rules. The archive gave exactly three seed-selected herbs, two ore, one ration, and twelve coins, and completed its journal task. Searching it again produced no extra reward.

The character then walked to Ana Reed in Veywick. Authorized delivery, disclosure, and withholding were all offered as distinct choices. Delivery paid the promised 21 coins and changed both families' reputation by the specified amounts. Save/Continue retained generation 2, the actual position, exact inventory, harvested wild-plant removal, the opened archive, and the completed dispatch. No console or runtime errors occurred.

Evidence: [expedition results and screenshots](../../.dream-loop/stichos-expedition/). Route planning reads tile/collision diagnostics; all movement, combat, dialogue, and looting use keyboard/mouse input. The entire context is disposed afterward, preserving the earlier campaign save.

## Generation-3 atlas and smaller settlement

The latest frozen production build passed the dedicated `--atlas` route in a fresh isolated context. Actual mouse dragging and wheel zoom moved the chart; locating (10000, 10000) showed uncharted country without advancing game time, moving the host, changing possessions or learning any distant terrain. My body and All explored returned to the appropriate local views. Following a chart mark placed its exact coordinates in the HUD.

The character then walked 207.8 paces south to Calfell, a smaller generated settlement. The minimap and atlas revealed that actual road and settlement name while remote country remained unknown. The village screenshot shows its inn, workshop and houses in place of a repeated cathedral. The atlas's known-place button centered the actual location. At 390×844, the atlas had no horizontal overflow and its Keep walking button closed it successfully.

Save/Continue preserved generation 3, the actual destination, explored bounds, discovered places, and both visited and still-unknown cells. No console or runtime errors occurred. Evidence: [atlas results and screenshots](../../.dream-loop/stichos-atlas/), including [new origin](../../.dream-loop/stichos-atlas/03-cathedral-world.png), [Calfell](../../.dream-loop/stichos-atlas/04-first-smaller-settlement.png), and [mobile atlas](../../.dream-loop/stichos-atlas/06-mobile-atlas.png).

## Findings

The previously reported sidebar tracking issue is fixed and browser-verified. No consequential gameplay findings remain from this bounded route. An initial performance detour clicked a nearby village interaction instead of walking; the harness now uses actual cardinal keys there, and the complete repeat passed.

## Evidence and limits

Screenshots and detailed results: [full route evidence](../../.dream-loop/stichos-qa/) and [latest expedition](../../.dream-loop/stichos-expedition/). Browser errors: 0. Desktop: 1600×1000. Round05 captured the actual mobile world, satchel and journal at 390×844 without horizontal overflow.

The full-route sample was 53.9 foreground RAF FPS. Round05 measured 55.6 FPS at default zoom and 50.1 FPS at minimum zoom0.65 near the cathedral. After the expedition, the dense forest at (−80,40) measured 58.0 foreground FPS at zoom0.65, with 519 unique organic sprites in the viewport plus sprite-margin footprint. CPU profiles accompany both wide-view samples. These observations describe this isolated browser session rather than a controlled hardware benchmark. [Round05 scene](../../.dream-loop/stichos/round-05.png), [equipment panel](../../.dream-loop/stichos/round-05-gear.png), and [dense forest](../../.dream-loop/stichos-expedition/10-dense-forest-minimum-zoom.png) are preserved separately. Audio listening quality, prolonged combat balance, browser-driven death recovery, and the southern-wall visual cutaway remain unverified.

## Repeat

Discover the active workspace-owned endpoint with `workspace_browser_targets`, then run:

```sh
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --atlas
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --possession
node scripts/browser-stichos-storage.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --visual --visual-name=round-05 --mobile --profile
```

The endpoint is ephemeral. Full QA creates and closes its own tab on the localhost QA origin; `--possession` continues its legitimately played save. Full QA also downloads a reusable campaign save to the workspace mount and copies it into ignored evidence; both paths are recorded in `results.json`. Import through the game's Restore a save control if needed. `--visual` and `--expedition` create and dispose separate browser contexts, preserving the completed campaign. The storage harness also uses a separate context. Add `--smoke` for only opening, controls, mobile, and saved continuation. Each run writes ignored results; a full run writes `REPORT.md` there instead of replacing this combined review.

The current generation-3 checks are `--atlas`, `--visual`, and storage. The full-route harness chooses a 240-tile journey for generation 3 and 110 tiles for older worlds; the current full opening chain has not yet been repeated end-to-end after the spacing change. The archived `--expedition` route expects the generation-2 checkpoint recorded above, including its former 80-tile road lattice; it is not a current-generation atlas test.
