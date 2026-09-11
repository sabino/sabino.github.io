# Published Verso

Play at **https://sabino.pro/games/verso/**.

The multiplayer-universe release is deployed from `sabino/sabino.github.io`, branch `master`, directory `games/verso`. Pages commit: `148fe343f5aefa563883ea433912c2f4c8ef50c6`. Deployment [34617829015](https://github.com/sabino/sabino.github.io/actions/runs/34617829015) succeeded on 11 September 2026. The checkout was updated to the current remote first; this release changed only `games/verso/`.

The tested source is `0a4e2ed`. The main game bundle is `assets/app-4jvai5g6.js`, CSS `assets/app-BbuTIZnE.css`, room transport `assets/peer-transport-V6VzR-f7.js`, and entry `assets/index-CHsUkZiB.js`. Service-worker version `347aaea8a71453ab0c63` caches 30 assets. All 30 published non-HTML files match their local SHA-256 hashes. Hosting adds HTML markup, so the HTML document is verified through its actual loaded bundle rather than byte equality. Evidence: `.dream-loop/pages-universe-assets.json` and `.dream-loop/universe-release-build.json`.

## Start and meet

Choose a life, customize the generated resident, and accept the mind-transfer arrival. **Room** lets a player host and share a code, URL or QR. **Meet people on this planet** discovers the planet's public frequency. **Galaxy** charts shared planet addresses and remembered visits. **Work** builds and operates physical production. Local/Room chat and F7–F9 phrase shortcuts are available during play.

A browser host must stay online, or someone must operate a dedicated world node. Signed checkpoints let the same owner resume shared changes. The optional native [Pear node](../../pear-node/README.md) replicates public history, but no permanent public storage node or automatic authority migration is deployed by Pages. A replica cannot replace the owner's private authority backup.

Life progress belongs to its browser and origin. Continue on the same origin/profile; clearing site data loses that local continuity. There is no routine save download/import UI. Signed room checkpoints verify shared history; browser-local inventory is not an authoritative global economy.

## Verification

The final source passed **347/347 automated tests**, formatting and production build. Seven actual-input browser checks passed both locally and on the published HTTPS URL: chat and saved phrases, shared harvest, host restoration, visitor credentials, one active life tab, public rendezvous and mobile layout. The observed two-player frame rate was **60 FPS**. An independent visual review scored the revised interface **8.1/10**, up from 7.2.

The deployed `/games/verso/` path passed four continuing-life/offline/PWA checks. Actual walking and Pause saved the exact position, identity, body and inventory; reload/Continue retained them. The active worker has the exact nested scope, and manifest PNGs decode to the declared dimensions. With HTTP cache disabled and networking disabled for both page and service worker, navigation and game assets came from the service-worker cache, and offline Continue and walking worked. No browser errors occurred. Actual iOS/Android installation has not been device-tested.

Earlier checks also established actual tool gathering, construction costs, 80 active seconds of botanical production, finite nearby collection and reload persistence; eight real RTC participants verified live host proofs and signed large checkpoints; two native Pear nodes replicated and restarted from disk. See [QA.md](QA.md), [UNIVERSE-RELEASE-QA.md](UNIVERSE-RELEASE-QA.md) and [PRODUCTION.md](PRODUCTION.md) and [LIFE-OFFLINE-QA.md](LIFE-OFFLINE-QA.md).

The main investigation and Winter Compact provide 48 objectives and continuing activities. A previous fast action-only simulation took 3.548 hours; four hours of human play remains unverified. NPC model inference and browser Codex/WASM are unavailable. Real-money purchasing is prepared in the separate backend and remains inactive pending provider configuration. See [AI-COMPANION.md](AI-COMPANION.md) and [PAYMENTS.md](PAYMENTS.md).

## Earlier release

Pages commit `3db0182` and successful run `34571768214` served `app-CxKixEoO.js`, with 315 passing tests and the old export/import UI. Its checks remain archived in QA.md and are not instructions for this release.

For a later deployment, build with `npm run build`, verify relative paths, update an isolated Pages checkout, and replace only `games/verso/`. Commit and push `master`, monitor deployment, then verify public asset identities and actual browser persistence/offline behavior.
