# Stíchos browser QA

**PASS** — the opening campaign, body-specific mind transfer, and a later generation-2 vault/dispatch expedition completed through real browser input. The opening and possession checks used `app-C7Uk0xX8.js` / service worker `fb8fa2a70d25b402a3ce`; the expedition used `app-BMa4UVxL.js` / `23fbddecb2494ab77ce8`, at `http://localhost:4174/`.

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

The isolated storage pass tested production `app-Bqud7p6L.js` / service worker `dd38cbd0f71bfbed460b`. Seven checks passed:

- Actual Download save JSON matched the live seed and position.
- The file chooser restored that downloaded position, inventory, and world.
- Corrupt JSON, an unsupported save version, and an oversized file each preserved the active life.
- Offline service-worker reload, saved continuation, and real walking worked. The cache held 18 assets; an uncached network request was blocked during the offline check.
- No runtime exceptions occurred.

Evidence: [storage results](../../.dream-loop/stichos-storage/results.json). This storage pass preceded the body-specific belongings build; the later possession pass independently verified its normal Save/Continue path.

## Generation-2 expedition

A fresh isolated context completed 497 paces of actual walking between 2026-09-11T02:43:17Z and 02:46:05Z. The harness harvested herbs and crafted two salves, accepted a dispatch from the engineer, followed roads to the excavation, and marked the real deep archive through its roadside notice.

Keyboard input followed passable room corridors, and staff attacks plus the ward defeated both vault guards. The archive gave exactly three seed-selected herbs, two ore, one ration, and twelve coins, and completed its journal task. Searching it again produced no extra reward.

The character then walked to Ana Reed in Veywick. Authorized delivery, disclosure, and withholding were all offered as distinct choices. Delivery paid the promised 21 coins and changed both families' reputation by the specified amounts. Save/Continue retained generation 2, the actual position, the opened archive, and the completed dispatch. No console or runtime errors occurred.

Evidence: [expedition results and screenshots](../../.dream-loop/stichos-expedition/). Route planning reads tile/collision diagnostics; all movement, combat, dialogue, and looting use keyboard/mouse input. The entire context is disposed afterward, preserving the earlier campaign save.

## Findings

The expedition build kept the old opening objective in the sidebar after accepting new tasks. The journal held the correct targets. Automatic tracking and map/site labels have been corrected in source and await the next browser checkpoint.

## Evidence and limits

Screenshots and detailed results: [full route evidence](../../.dream-loop/stichos-qa/). Browser errors: 0. Desktop: 1600×1000. The updated portrait/world and satchel were captured at 390×844 in round04 without horizontal overflow; the correctly verified mobile journal is [expedition screenshot 02](../../.dream-loop/stichos-expedition/02-mobile-journal.png). An earlier round04 screenshot labeled journal actually showed pause; the input sequence and modal assertion are corrected in the harness.

The full-route sample was 53.9 foreground RAF FPS; warm-cache visual samples were 59.0 FPS in round03 and 54.1 FPS in round04. These are observations from this isolated browser session, not controlled hardware benchmarks. [Round04 scene](../../.dream-loop/stichos/round-04.png) and [equipment panel](../../.dream-loop/stichos/round-04-gear.png) are preserved separately. Audio listening quality, prolonged combat balance, browser-driven death recovery, and the southern-wall visual cutaway remain unverified.

## Repeat

Discover the active workspace-owned endpoint with `workspace_browser_targets`, then run:

```sh
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --possession
node scripts/browser-stichos-storage.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --expedition
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --visual --visual-name=round-05 --mobile --profile
```

The endpoint is ephemeral. Full QA creates and closes its own tab on the localhost QA origin; `--possession` continues its legitimately played save. Full QA also downloads a reusable campaign save to the workspace mount and copies it into ignored evidence; both paths are recorded in `results.json`. Import through the game's Restore a save control if needed. `--visual` and `--expedition` create and dispose separate browser contexts, preserving the completed campaign. The storage harness also uses a separate context. Add `--smoke` for only opening, controls, mobile, and saved continuation. Each run writes ignored results; a full run writes `REPORT.md` there instead of replacing this combined review.
