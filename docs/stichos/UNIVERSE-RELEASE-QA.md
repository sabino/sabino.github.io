# Multiplayer universe release QA

On 11 September 2026, seven checks passed in 40 seconds against the frozen production preview at `http://localhost:4174/`. The browser loaded `app-BsBd1dau.js`, `app-BbuTIZnE.css`, and `index-wRZM3Wtj.js`. Root changes after this snapshot require a final release smoke test.

The harness uses real Chromium in the authorized hidden Agent Workspace, with fresh browser contexts and native CDP pointer, text, and keyboard events. Evaluation reads only DOM and exposed diagnostics; it does not alter game state, browser storage, or application handlers. All created contexts are disposed afterward.

- Two browser identities joined a real PeerJS/WebRTC room. Room chat and nearby Local chat appeared in the other browser with the authoritative sender name.
- Assigning `/room Supply route confirmed.` to F7 and pressing the actual key delivered the phrase. The assignment survived a full page reload.
- A player walked beside cequin and performed the actual gathering strokes. Both clients observed the same exhausted plant. After a signed checkpoint, the host reloaded and resumed its owned room. The visitor reconnected with the same peer ID and still observed the depleted plant.
- A second tab in the same browser context displayed the life-in-use gate. Escape could not bypass it. Closing the first tab allowed the second to continue the same body.
- Two independent contexts entered seed `989123` and selected **Meet people on this planet**. They converged on public room `U3000L77N` without exchanging a code.
- The mobile world at 390 × 844 opened with collapsed chat and reachable movement, ability, inventory, and chat controls.
- No browser exceptions or error-level console messages occurred. The desktop diagnostic reported **60.00 FPS** after the two-player interaction; this is a short local observation, not a device-wide performance guarantee.

Evidence is saved under `.dream-loop/universe-release-qa/`: `results.json`, `01-two-traveler-desktop.png` (1440 × 960), and `02-mobile-collapsed-world.png` (390 × 844). The first diagnostic attempt omitted Enter's native character payload, leaving text unsubmitted; the corrected harness sends a carriage return with the key event.

Reproduce with the verified workspace-owned CDP endpoint:

```sh
node scripts/browser-universe-release.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
```

These checks establish local browser co-op, live public-room discovery, browser persistence, and interface behavior. They do not establish always-on public hosting, automatic authority migration, an Internet-scale MMO, a four-hour balance playthrough, activated purchases, or working AI inference.
