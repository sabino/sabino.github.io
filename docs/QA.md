# Browser QA

Run: 2026-09-10T22:20:51.672Z. Workspace-owned Chromium via CDP; http://localhost:4174.

**PASS** — complete three-assignment playthrough and independent crossing verified.

Every game action used real mouse, keyboard, or touch events. Read-only diagnostics supplied assertions and collision geometry supplied route planning. No game state, saves, or shared developer storage were injected or cleared.

## Verified

- Required name validation
- Name entry and briefing
- Deployment
- Pause freezes simulation; journal opens and closes
- Mobile portrait content reachable: 390 × 844; scrolled to and clicked journal return
- Mobile landscape content reachable: 844 × 390; scrolled to and clicked journal return
- Touch joystick moves player
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
- Epilogue, journal, title, and saved continuation
- Independent crossing unlocked
- Dash moves and consumes stamina
- Mouse left triggers blade
- Mouse right triggers pulse
- Mend heals and consumes one fragment
- Death drops fragments; reincarnation creates next vessel
- Recover previous vessel fragments
- No browser console/runtime errors

## Evidence

Screenshots and detailed results: [../.dream-loop/qa/](../.dream-loop/qa/). Browser errors: 0.

## Scope

Desktop 1600 × 1000; mobile 390 × 844 and 844 × 390. The check covers a peaceful campaign, modal navigation, autosaved continuation, touch movement, abilities, healing, death, reincarnation, and fragment recovery. It does not assert audio fidelity, gamepad support, or export/import file dialogs.

## Findings

None observed.

The earlier portrait journal clipping was corrected and verified: its top is reachable, and both mobile orientations can scroll to and click the return button.

## Repeat

With a current production build served on localhost and an isolated Agent Workspace Chromium running:

```sh
node scripts/browser-check.mjs http://127.0.0.1:40393 http://localhost:4174
```

The browser endpoint is ephemeral; replace it with the active workspace endpoint. The script creates and closes its own tab.
