# Procedural browser QA

2026-09-10T23:40:51.271Z · http://localhost:4174/

Actual CDP keyboard/mouse input in a new isolated Agent Workspace tab. Diagnostics were read-only; no game state or save injection. Service worker bypassed for the current served build.

- PASS title → briefing → inhabit: hop, 5 segments, 6 appendages; hammer/impact
- PASS keyboard movement: {"x":6.027649535238068,"y":0.05,"z":-0.07167975759024267}
- PASS jump capability: airborne observed
- PASS weapon keyboard input
- PASS journal toggle and frozen simulation
- PASS pause and resume
- PASS approach + E reads generated anatomy: sp-71008e03-4f0a7f64
- PASS foreground desktop frame sample: {"fps":50.37925959470168,"hud":45.99999999999999}
- PASS seed changes structural anatomy, terrain, equipment: skitter, 3 segments, 13 appendages; conduit/projectile
- PASS save/continue inspected: {"before":{"x":10.506038422371743,"y":0,"z":2.4939615776282587},"after":{"x":10.506038422371743,"y":0,"z":2.4939615776282587}}
- PASS mobile journal dimensions: {"w":390,"inner":390,"scroll":390,"dialog":{"x":17,"y":17,"width":356,"height":1605.0625,"top":17,"right":373,"bottom":1622.0625,"left":17}}

## Findings

No failures in this bounded check.

Screenshots and two seed descriptor snapshots: [.dream-loop/procedural-qa](../.dream-loop/procedural-qa/). This input check is not a full campaign or physical controller test of the new mode.

## Production offline verification

Passed separately on fresh loopback origin `http://127.0.0.2:4174/`, without clearing existing saves or caches. Worker version `8117d7f89ef63b061bb1` activated and cached all 15 build assets, including `app-DZ0iFwFo.js`. The test disabled the HTTP cache and applied CDP offline conditions to both the page and its service-worker target. An uncached fetch failed; reloaded HTML, JavaScript, CSS, manifest, and icon all reported `fromServiceWorker: true` with `serviceWorkerResponseSource: cache-storage`. The actual Continue button resumed the saved crossing.

Network conditions were restored for both contexts and all probe tabs were closed. This verifies offline loading and saved continuation, not physical PWA installation. Existing localhost worker update timing was not validated; a previously installed older version remained active during that preliminary probe.

Evidence: [offline-results.json](../.dream-loop/procedural-qa/offline-results.json) and [offline continuation screenshot](../.dream-loop/procedural-qa/13-offline-continued.png).
