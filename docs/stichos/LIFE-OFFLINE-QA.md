# Continuing-life and offline PWA QA

Four checks passed on both the final local preview and the deployed [Verso game](https://sabino.pro/games/verso/) on 11 September 2026. The public run completed in 8.3 seconds. Both loaded `app-4jvai5g6.js`, `app-BbuTIZnE.css`, and worker cache version `347aaea8a71453ab0c63`.

The browser was Chromium in the authorized hidden Agent Workspace. A fresh browser context was used for each run. Only native pointer and keyboard events changed the game; evaluation read DOM, manifest responses, image dimensions, worker/cache state, and exposed game diagnostics. No save or game-state values were injected.

1. **Continuing life:** choose Theo's story, skip its intro, walk using the actual movement key, and Pause to save. Reload and Continue preserved the exact position, planet generation, body, browser identity, name, appearance, and inventory.
2. **Installable assets:** the worker was activated and controlled the page. Its public scope was exactly `https://sabino.pro/games/verso/`. The standalone manifest resolved its scope, start URL, and all four regular/maskable icon URLs inside that folder. PNG decoding confirmed actual dimensions of 192 × 192 and 512 × 512. The cache contained 30 build assets.
3. **Offline play:** with the browser's HTTP cache disabled, CDP disabled network access for both page requests and service-worker requests. An uncached probe failed. Reloaded navigation and the game JavaScript bundle were explicitly reported as service-worker responses. Continue retained the same saved life, and actual movement still worked offline.
4. **Runtime:** no browser exceptions or error-level console messages occurred.

Ordinary reload is intentional. Chromium's hard-reload option bypasses service-worker control for the reloaded document; disabling the HTTP cache separately demonstrates that the offline app is served by its installed worker.

Evidence:

- Local: `.dream-loop/life-offline/results.json` and `01-offline-continuing-life.png`.
- Published nested path: `.dream-loop/life-offline-public/results.json` and `01-offline-continuing-life.png`.

Reproduce against the verified workspace-owned CDP endpoint:

```sh
node scripts/browser-life-offline.mjs http://127.0.0.1:CDP_PORT https://sabino.pro/games/verso/
```

This checks the browser PWA prerequisites and actual offline behavior. It does not claim a physical iOS/Android installation test. A browser must load the game successfully once to populate the cache, and live multiplayer still needs connectivity and an available host.
