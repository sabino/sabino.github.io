# Earlier visual study browser QA

Run: 2026-09-10T23:11:21.292Z. Workspace-owned Chromium via CDP; http://localhost:4174.

**Campaign passed; post-campaign check stopped in the QA driver.** All three assignments reached the reveal at 100% integrity and zero kills. The expanded journal placed its Return button below the viewport; the old click helper did not scroll first, so its next selector was absent. This is not a confirmed game defect. The helper now scrolls through actual wheel input, but it has not been rerun because the user redirected work to compositional world generation.

Every game action used real mouse, keyboard, or touch events. Read-only diagnostics supplied assertions and collision geometry supplied route planning. No game state, saves, or shared developer storage were injected or cleared.

## Verified

- Current production bundle loaded with service worker bypassed: http://localhost:4174/assets/index-CKOJ0I-m.js
- Required name validation
- Name entry and briefing
- Deployment
- Foreground desktop frame-rate sample: 60.0 FPS over 2.00 s at 1600 × 1000; diagnostic 60, 60, 60, 60, 60, 60, 60, 60
- Pause freezes simulation; journal opens and closes
- Mobile portrait content reachable: 390 × 844; scrolled to and clicked journal return
- Mobile landscape content reachable: 844 × 390; scrolled to and clicked journal return
- Touch joystick moves player
- Ultrawide southern movement keeps player visible: 2560 × 720; 126.0 ground units; player screen (1403.6, 360.0)
- Catalog Prism stag
- Catalog Lumen cap
- Catalog Glass fern
- Return survey through gate
- Align relay 1
- Align relay 2
- Align relay 3
- Return relay assignment through gate
- Recruit archivist
- Escort archivist safely to gate
- Three-assignment reveal: Integrity 100%; kills 0

## Evidence

Screenshots and detailed results: [../.dream-loop/qa/](../.dream-loop/qa/). Browser errors: 0.

Failure screenshot: `99-failure.png`.

## Scope

Desktop 1600 × 1000; ultrawide 2560 × 720; mobile 390 × 844 and 844 × 390. FPS is a foreground observation in this isolated Chromium session, not a hardware benchmark. This run reached the full peaceful campaign and reveal. Earlier runs also passed continuation, abilities, healing, death, reincarnation, and fragment recovery; those later checks were not reached in this run. Separate reports cover gamepad and storage/offline behavior.

## Findings

No game error observed before the QA-driver stop. These results apply to the bundle named above, before the compositional-generation changes.

## Repeat

With a current production build served on localhost and an isolated Agent Workspace Chromium running:

```sh
node scripts/browser-check.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/?study=1
```

The browser endpoint is ephemeral; replace it with the active workspace endpoint. The script creates and closes its own tab.
