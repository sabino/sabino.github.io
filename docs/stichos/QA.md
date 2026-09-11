# Release verification · 2026-09-11

## Public GitHub Pages release

**[Play Verso](https://sabino.pro/games/verso/)** is deployed from Pages commit `3db0182`, successful run `34571768214`. Public build `app-CxKixEoO.js` passed 8 real two-browser room checks (including identical raider HP and one shared defeat), 4 game/mobile/Compact/cosmetic checks, and 7 actual save/import/offline checks. Cosmetic purchase controls were present and disabled. Public JavaScript, manifest and service worker match the local build byte-for-byte. The offline cache is scoped to `https://sabino.pro/games/verso/` and contains 23 assets. [Deployment details](PAGES.md).

A separate source-only eight-participant RTC fixture reassembled complete combat frames above 22 KB and signalling reconnection without duplicate welcomes, then closed all transports. Evidence: `.dream-loop/stichos-peer-transport/fixture.json`. The fixture does not stand in for eight human players on separate networks.

The full automated suite passed **315/315** in **74.754 seconds**, with no failures or skipped tests. Output: `.dream-loop/release-tests.log`. Coverage includes the complete 24-lead campaign with timed tool work, generated terrain and artifacts, body possessions, physical household workers, payment mocks, strict save imports, shared combat, and the Winter Compact.

Before publication, the tested production checkpoint was **`app-fJn9TLqE.js`**, with `app-DrgXZaZt.css`, served at `http://localhost:4174/`. Eight real-browser PeerJS checks passed using public signalling and actual RTC data channels: two travelers connected, moved and waved; only one body received the final-stroke harvest; both saw the same raider wound at 55 HP and its eventual defeat; reconnect preserved exhausted resources; and host departure disconnected the visitor explicitly. There were no browser exceptions. Evidence: [room results](../../.dream-loop/stichos-peer-rooms/results.json) and [shared defeat](../../.dream-loop/stichos-peer-rooms/03-shared-raider-defeat.png).

Three additional local release checks passed on that checkpoint: actual walking, tracking and recording a nearby Winter Compact witness, and clean mobile closure without browser errors. The 390×844 Compact and cosmetics views were captured through real input. Evidence: [release results](../../.dream-loop/stichos-release-pages/results.json) and [mobile Compact](../../.dream-loop/stichos-release-pages/03-mobile-compact.png). The subsequent public release results above verify the final deployed build; the linked evidence now contains those later captures.

Household orders now move their named workers along collision-safe routes to reserved resources, perform repeated matching tool strokes, and return to the collection point. Six focused tests verify physical travel, exact work progress, actual doorway opening, cancellation return, and save migration. Resting cannot replace those actions, and collection grants each finite allocation once. The earlier timed-ledger browser pass below predates this physical-worker change; its screenshots are historical evidence rather than a current travel-animation check.

Fifteen session integration checks cover shared combat receipt replay across reconnect and save, body-specific late hits, one benefit per artifact pulse, duplicate bounty prevention, actual vault negotiation, and bounded receipt history. The Compact tests exercise nearby living witnesses and deposited accounts, atomic policy payments, real timed harvesting and medicine batches, fresh paid work, physical delivery, and corrupt-save rejection. Orders paid before an agreement still deliver their supplies but do not satisfy its fresh-work requirement. The Compact adds 24 projects with 72 milestones across six actual clan settlements.

The earlier action-earned main campaign completed all 24 leads over 12,113.9 tiles, 74 harvested resources and 4,087.68 simulated seconds (68.1 minutes). A fresh continuous public-action run has now completed all 24 main leads and all 24 Compact projects, including 48 witness accounts, 24 funded policies and 24 physical deliveries. It recorded **12,771.776 active simulated seconds (3.548 hours)**, excluding 870 seconds of rest jumps, with 926 tool strokes, 89 preparations, 25 save checkpoints and no deaths. This is below four active hours; no extra grind was added to inflate it. Evidence: [route results](../../.dream-loop/stichos-compact-proof/main-compact-v2/results.json). The old four-hour continuing-life endurance run remains a separate stability test that predates timed tools and the Compact. **Four hours of human story play remains unverified.** Automated travel and reading speed do not establish that experience.

Current limits: household orders remain solo; the room host owns hostile combat and finite shared claims, while personal inventory, tool condition, story, and bodily needs remain local. Host departure ends that shared session; there is no host migration. Inactive hostile bodies retain artifact visuals but use conventional weapon AI. Audio listening quality and prolonged human combat balance remain unmeasured. Real-money integration is prepared and mock-tested, with live billing disabled and no real charge made. A wrapping globe, large-scale warfare and public account service remain outside this release.

---

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

The isolated storage pass was repeated on production `app-DHCdk53y.js` / service worker `f58d84fdadaa2ae9f891` after the generation-3 atlas update. Seven checks passed:

- Actual Download save JSON matched the live seed, position, generation, and exploration revision after real walking.
- The file chooser restored that downloaded position, inventory, generation, explored bounds, exploration revision, and discovered places.
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

## Physical notebook and user-paced introduction

The final notebook pass ran from 05:17:40 to 05:18:29 UTC on 11 September 2026 against the frozen paper-materials build `app-xdAHfhHA.js` and `app-DimBOn-j.css` at `http://localhost:4174/`. All thirteen real-input checks passed in a fresh isolated browser context, with zero console or runtime errors.

The six introductory beats stayed on their selected page during 6.2 seconds of waiting, without advancing body time. Back and Continue worked through all six pages and explicitly returned to present-day Vespera. Replaying the introduction from the notebook and skipping back preserved the current body, inventory, simulation time, and selected leaf.

J first presented the physical closed cover. Open notebook unfolded it; Close book returned to the cover; Put away returned to the world. Escape and J performed the full closing sequence. Cancelling an opening and immediately reopening, or reopening during the delayed put-away, preserved the latest action. An actual conversation with the botanist remained visible when the notebook closed, including the normal UI redraw interval. Escape also worked while glossary search owned keyboard focus.

All eighteen dated leaves were selected through real mouse and wheel input. Previous/next boundaries worked, all four botanical sheets supplied accessible ink diagrams, and the plain-type toggle changed the actual rendered font. Accent-folded searches found **Cúpula do Destino** from `cupula` and **Stíchoi** from `stichoi`; empty results and clearing the search worked. Following a current thread updated the real sidebar objective and put the book away.

At 390×844, the cover, diary, botanical page, glossary, and current threads had no horizontal overflow. The native leaf selector, next-leaf control, tabs, search, and both closing controls were usable through real input. The desktop and mobile paper/text screenshots were independently inspected. A screenshot-pixel check now also verifies that visible light paper is actually painted, preventing an opaque decorative overlay from passing merely because underlying DOM controls still respond.

Current-life Save/Continue preserved the physical notebook, exact position, and possessions. The satchel identified and opened the book. Importing the legitimately played older campaign through the native file chooser, then reloading and continuing it, retained story stage four and restored the priest’s physical notebook through the legacy ownership migration. This notebook route did not perform a new possession; that model behavior is covered by the separate body-ledger tests and earlier possession browser route.

Evidence: [structured results](../../.dream-loop/stichos-notebook/results.json), [desktop cover](../../.dream-loop/stichos-notebook/03-closed-notebook.png), [open diary](../../.dream-loop/stichos-notebook/04-open-notebook.png), [botanical sheet](../../.dream-loop/stichos-notebook/05-botanical-sheet.png), [mobile cover](../../.dream-loop/stichos-notebook/06-mobile-cover.png), [mobile diary](../../.dream-loop/stichos-notebook/07-mobile-open-book.png), and [mobile glossary](../../.dream-loop/stichos-notebook/08-mobile-glossary.png).

The pass verified fixes for the two-pixel mobile cover overflow, stale transition callbacks, conversation visibility, and an inherited pseudo-element background that had hidden the pages. No game state or browser storage was injected or cleared; the harness disposed its own context afterward.

## Cooperative rooms

The final cooperative browser pass ran from 04:34:21 to 04:34:42 UTC on 11 September 2026 against frozen `app-CYu5WpWe.js` and `app-B_ckCyAZ.css`. Eight checks passed with zero console or runtime errors. Two fresh, independent browser contexts created and joined a room through the actual Together form; a third used a different seed to verify rejection.

Actual ground clicks moved a named remote humanoid across the other player's scene, and the Wave button displayed its greeting. Both players then clicked the same cequin plant: one body gained three portions and the other gained none, both worlds removed the same stable plant ID, and clicking the emptied place again produced no additional harvest. Recorded WebSocket frames confirm correct `gather` actions with only the six intended fields, one successful receipt, and one rejected competing claim. Opening and closing the actual southern cathedral door synchronized in both clients.

Terminating one connection at the test-owned server removed the remote body immediately. Clicking Reconnect restored the same private identity and shared plant removal, with exactly one remote body. Leave room returned to solo play and removed that peer. Entering the original room code from seed 3887 was rejected without changing either world; the two successful travelers used seed 3886, generation 3.

The initial production-server run on port 4175 independently passed presence, gestures, harvest, and doors. Chromium's offline emulation left an existing WebSocket open, so the final harness launches the unchanged production `createCoopServer` on an ephemeral loopback port and terminates only its own test peer's real socket. This makes the transport interruption deterministic without injecting game state, browser storage, or application methods. The harness closes its server and all browser contexts afterward. Server wire tests additionally cover loot, action idempotency, eight-player capacity, private reconnect credentials, tool/distance validation, malformed/rate-limited traffic, origin policy, and raw payment-body handoff.

The browser pass found a real client serialization bug: spreading a complete plant object over the action packet replaced `kind: 'gather'` with `kind: 'cequin'`. The client now copies only target coordinates. An additional test runs the actual client against the real server with full generated plant and chest objects, proving both gather and loot actions remain correct.

Evidence: [structured results and action frames](../../.dream-loop/stichos-multiplayer/results.json), [two visible travelers](../../.dream-loop/stichos-multiplayer/01-two-travelers.png), [peer greeting](../../.dream-loop/stichos-multiplayer/02-peer-wave.png), [shared harvest](../../.dream-loop/stichos-multiplayer/03-shared-harvest.png), and [reconnected room](../../.dream-loop/stichos-multiplayer/04-reconnected-room.png). Screenshots were inspected for visible humanoids, labels, greeting and readable room controls. That earlier checkpoint covered cooperative presence and shared resource/door state. The release verification above supersedes its local-combat limitation; current room behavior is described in [MULTIPLAYER.md](MULTIPLAYER.md).

## Findings

The previously reported sidebar tracking issue is fixed and browser-verified. No consequential gameplay findings remain from this bounded route. An initial performance detour clicked a nearby village interaction instead of walking; the harness now uses actual cardinal keys there, and the complete repeat passed.

## Evidence and limits

Screenshots and detailed results: [full route evidence](../../.dream-loop/stichos-qa/) and [latest expedition](../../.dream-loop/stichos-expedition/). Browser errors: 0. Desktop: 1600×1000. Round05 captured the actual mobile world, satchel and journal at 390×844 without horizontal overflow.

The full-route sample was 53.9 foreground RAF FPS. Round05 measured 55.6 FPS at default zoom and 50.1 FPS at minimum zoom0.65 near the cathedral. After the expedition, the dense forest at (−80,40) measured 58.0 foreground FPS at zoom0.65, with 519 unique organic sprites in the viewport plus sprite-margin footprint. CPU profiles accompany both wide-view samples. These observations describe this isolated browser session rather than a controlled hardware benchmark. [Round05 scene](../../.dream-loop/stichos/round-05.png), [equipment panel](../../.dream-loop/stichos/round-05-gear.png), and [dense forest](../../.dream-loop/stichos-expedition/10-dense-forest-minimum-zoom.png) are preserved separately. Audio listening quality, prolonged combat balance, and the southern-wall visual cutaway remain unverified. Browser-driven combat death and stable-signal mind recovery were subsequently verified in [Recovery QA](RECOVERY-QA.md); clinic revival remains a separate unverified browser branch.

## Repeat

Discover the active workspace-owned endpoint with `workspace_browser_targets`, then run:

```sh
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --atlas
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --possession
node scripts/browser-stichos-storage.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-notebook-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-multiplayer-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/'
node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT 'http://localhost:4174/' --visual --visual-name=round-05 --mobile --profile
```

The endpoint is ephemeral. Full QA creates and closes its own tab on the localhost QA origin; `--possession` continues its legitimately played save. Full QA also downloads a reusable campaign save to the workspace mount and copies it into ignored evidence; both paths are recorded in `results.json`. Import through the game's Restore a save control if needed. `--visual` and `--expedition` create and dispose separate browser contexts, preserving the completed campaign. The storage harness also uses a separate context. Add `--smoke` for only opening, controls, mobile, and saved continuation. Each run writes ignored results; a full run writes `REPORT.md` there instead of replacing this combined review.

The current generation-3 checks are `--atlas`, `--visual`, and storage. The full-route harness chooses a 240-tile journey for generation 3 and 110 tiles for older worlds; the current full opening chain has not yet been repeated end-to-end after the spacing change. The archived `--expedition` route expects the generation-2 checkpoint recorded above, including its former 80-tile road lattice; it is not a current-generation atlas test.

## Campaign, ending and free-life browser checkpoint

The final repeat used frozen preview `app-CSGK7Fcb.js`, CSS `app-CYoMy-Rj.css`, service worker `d38b930dc8226185004b`, and workspace browser `app-1319943` at its discovered loopback CDP endpoint. `scripts/browser-stichos-campaign.mjs` passed **8/8 checks with zero runtime errors** in a disposable browser context on 11 September 2026. This repeat includes solid closed doors and actual click routes that open them before entering. It used the actual file chooser to import saves earned by the complete public-action simulation; no browser simulation fields, position, inventory or quest state were injected.

Verified with real mouse/keyboard input: the Calling page hides the ending before investigation; all four final plaza lamps and radio complete the puzzle; the final decision opens a readable ending celebration; continuing returns to the same world; seven optional purposes and known identities are visible; an owned garden consumes a seed portion, prevents early harvest, advances through actual rest actions and pays its displayed yield; gathered timber/ore fund an equipment upgrade that changes its real profile; a selected willing host lacks the physical notebook, and returning to the original priest restores the exact original inventory and book. The Calling page also fits and closes at 390×844.

Evidence is in `.dream-loop/stichos-campaign-browser/results.json` and numbered screenshots. `08b-furnished-interior.png` follows an actual walk through the owned inn's south doorway. `04-ending.png` shows the final acknowledgement; `10-remembered-pages.png` shows the distinct memory record in another body.

Reproduce after generating the action-earned fixtures:

```sh
VERSO_QA_FIXTURES=1 node --experimental-strip-types --test --test-name-pattern='whole generation-three' tests/stichos-campaign.test.ts
node scripts/browser-stichos-campaign.mjs http://127.0.0.1:WORKSPACE_CDP_PORT http://localhost:4174/
```

The opt-in fixture files are `.dream-loop/campaign-fixtures/before-final-puzzle.json`, `before-ending.json`, `campaign-complete.json` and `free-life-home.json`. The additional combat branch writes `before-first-encounter.json` and `after-first-combat.json`, both earned through public gameplay actions. Ordinary test execution does not write them. The source of these states completes the radio opening, all 24 investigation objectives and post-story home/commission/identity actions through public simulation APIs. Unit tests separately cover all 81 weapon part combinations, matching forged previews and actual handling, physical weapon ownership across possession, and malformed recipe/owner/seed rejection. The modular forging UI was checked separately on the following frozen build.

## Component forging browser checkpoint

Frozen preview `app-4WUYSu3a.js`, CSS `app-CXxY52q5.css`, service worker `cdf5981529db893f69ba` passed **6/6 focused checks with zero runtime errors** on 11 September 2026. A fresh workspace browser context imported the action-earned `free-life-home.json` through the real file chooser, then gathered three timber trees and two ore deposits through actual world clicks.

Native weapon, material, living-core and proportion selectors changed the rendered construction. Missing timber disabled forging. At the owned home's field bench, the selected long ironbark/Cequin staff consumed exactly the displayed 34 coins, six timber, five ore and two Cequin. Its actual profile matched the preview: 43 strength, 1.77 reach and 0.64-second recovery. The body retained its original appearance seed while its held weapon used forged seed `3770690370`. Repeating the identical construction was disabled.

The Gear panel used the exact preview sprite and matching profile. Pause, browser reload and Continue retained the forged seed, weapon profile, body identity and paid inventory. The Forge controls worked at 390×844 without horizontal overflow and the panel closed. Screenshots were inspected for visible construction, held equipment and readable controls.

The actual local cosmetic service, with purchases unconfigured, disabled all three purchase buttons. Its recovery control generated a code masked by default in the disposable test wallet; no checkout, charge or premium entitlement was created. Recovery-code contents were not logged or included in evidence.

Evidence: [structured results](../../.dream-loop/stichos-forge-browser/results.json), [construction preview](../../.dream-loop/stichos-forge-browser/03-ready-forge-preview.png), [held weapon](../../.dream-loop/stichos-forge-browser/05-weapon-held-in-world.png), [Gear](../../.dream-loop/stichos-forge-browser/06-gear-forged-weapon.png), [mobile Forge](../../.dream-loop/stichos-forge-browser/07-mobile-forge.png), and [masked recovery control](../../.dream-loop/stichos-forge-browser/09-private-recovery-masked.png).

```sh
node scripts/browser-stichos-campaign.mjs http://127.0.0.1:WORKSPACE_CDP_PORT http://localhost:4174/ --forge
```

The fixtures must first be generated with the command above. This mode uses only actual UI input and read-only diagnostics, creates its own browser context, and removes its temporary mounted import copies after closing it.
