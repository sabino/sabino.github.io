# Published Verso

Play at **https://sabino.pro/games/verso/**.

The generated-universe update is deployed from `sabino/sabino.github.io`, branch `master`, directory `games/verso`. Pages commit: `404b771f5946424dade1a7216b377ee8c0a062d9`. Deployment [34633591760](https://github.com/sabino/sabino.github.io/actions/runs/34633591760) succeeded on 11 September 2026. The checkout was updated to the current remote first; this release changed only `games/verso/`.

The deployed game source is `6e3214b`. Main bundle: `assets/app-C_d-KSbm.js`; interface: `assets/app-Cees6plc.css`; room transport: `assets/peer-transport-nrAD5ibn.js`; entry: `assets/index-BKojhclx.js`. Service-worker version `0c5a8a2e0e01ac7429f2` caches 31 assets. All **31 published non-HTML files** returned HTTP 200 with exact local SHA-256 hashes and correct content types on ordinary URLs. Hosting adds HTML markup; its actual entry-to-game bundle chain was verified. Evidence: `.dream-loop/pages-generation4-assets.json` and `.dream-loop/generation4-release-build.json`.

## Start and meet

Choose **Choose a life** for a new generated resident. Leaving the seed blank selects a new world. The person's history, relationships, practical obligations, profession, actual home and equipment belong to that life. New civilizations generate their technology, institutions, climate, ecology, material culture and architecture from their seed; medieval, mechanical and electronic equipment appears on actual residents and in ordinary trade and crafting. **Theo Bishop’s story · Stíchos** remains an explicit optional legacy campaign. Existing generation-one through generation-three records retain their established worlds.

Open **Room**, create a browser room and share its code, URL or QR. The full link selects the correct world before life creation; code-only discovery finds an online host. **Galaxy** charts shared planet addresses and remembered visits. **Work** constructs physical production. Local/Room chat and F7–F9 phrases remain available.

Rooms support up to eight participants. A browser host must stay online, or someone must operate a dedicated world node. Signed checkpoints let the same owner resume shared changes. The optional native [Pear node](../../pear-node/README.md) replicates public history; Pages does not deploy a permanent public storage node or automatic authority migration. A replica cannot replace the owner's private authority backup.

Life progress belongs to its browser and origin. Clearing site data loses that local continuity. Personal inventory, bodily needs and story progression remain local; household labor orders currently run in solo worlds. There is no authoritative global economy or cloud player account.

## Verification

The full suite passed **384/384 tests in 79.92 seconds** at `2a083ee`. The final housing correction at `fcb0c64` passed **24 focused tests** covering real local residences, personal stories, workers, ecology, planned parcels and legacy compatibility. Formatting, TypeScript and production build passed. The initial independent all-screen design audit was handed to a different implementer: repair evidence includes **207 normal-flow**, **126 staged presentation**, **72 generated-life**, and **five final geometry** captures, with zero browser errors in the completed runs. [Detailed screen evidence](SCREEN-DESIGN-FIXES.md).

The final local native-input route accepted a woodland resident, walked on actual ground, opened the real residential door and entered the owned inn. A separate dry settlement resident also entered their lodging. Earlier route timeouts exposed the corrected workplace-as-home bug and test-harness click/negative-coordinate errors; the final household route passed. Evidence: `.dream-loop/woodland-village/` and `.dream-loop/woodland-round3/`.

Local generated-life reload/Continue and genuinely network-disabled walking passed four checks, retaining exact identity, location, appearance and belongings. Service-worker scope and manifest/icon resolution passed. The exact public build passed the three-browser native cooperative route: distinct generation-four lives, URL joining, QR display, code-only joining at 390×844, correct electronic appearance tiers and shared player rosters, with **zero browser errors**. The harness was updated to open the redesigned mobile Appearance tab before editing the name. Evidence: `.dream-loop/g4-native-coop-public/results.json`. The public nested path also passed **four generated-life offline checks**: exact online reload/Continue, correct service-worker and standalone-manifest scope, decoded 192px/512px install icons, and network-disabled reload/Continue plus actual walking. HTTP cache was disabled and page/service-worker networking was disabled; the real game bundle came from the service-worker cache. Identity, body, location, appearance and belongings matched, with **zero browser errors**. Evidence: `.dream-loop/life-offline-public/results.json`.

The new generated-world art currently scores **6.5/10** in an independent review; the 8/10 visual target remains unmet. Current samples run around 53–60 foreground FPS. The previous release's 8.1 review rated its earlier interface and is not a score for these generated-world visuals. [Current and historical QA](QA.md).

The optional AI companion reports setup/authentication status; NPC model inference and browser Codex/WASM remain unavailable. Prepared real-money purchasing stays inactive until a separate payment service is configured. No real payment was made. Actual iOS/Android installation and a complete installed-PWA lifecycle remain device-unverified. The legacy campaign's action-only simulation measured 3.548 hours; four hours of human gameplay remains unverified. [AI companion](AI-COMPANION.md), [payments](PAYMENTS.md), [network proof](GENERATION4-NETWORK-QA.md).

## Earlier releases

Pages commit `148fe34`, successful run `34617829015`, served `app-4jvai5g6.js` with 347 passing tests. Its seven native public multiplayer checks and four public offline checks remain archived in [QA.md](QA.md). Commit `3db0182`, run `34571768214`, served the earlier export/import interface. Those checkpoints are historical evidence, not current UI instructions.

For a later deployment, build with `npm run build`, update an isolated Pages checkout, and replace only `games/verso/`. Commit and push `master`, monitor deployment, then verify public asset identities and actual browser persistence/offline behavior.
