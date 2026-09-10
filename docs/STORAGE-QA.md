# Storage, accessibility, and offline QA

Run: 2026-09-10T22:43:55.885Z. **PASS**.

A separate Agent Workspace Chromium tab used http://localhost:4174; the developer's 127.0.0.1 tab was never controlled. Original QA-origin save/settings restored: **yes**.

## Verified

- Name-input Shift+Tab and forward Tab remain trapped in title
- HTML characters in name display literally in briefing and journal
- Actual Download save creates valid JSON in workspace folder: verso--b---o-neil--b-.json
- Actual Restore a save file chooser restores position, name, and equipment
- Invalid import preserves current progress: corrupt-json.json
- Invalid import preserves current progress: unsupported-version.json
- Invalid import preserves current progress: oversized.json
- Journal J/Escape preserves complete phase and controls
- Journal J/Escape preserves dead phase and controls
- Journal J/Escape preserves reveal phase and controls
- Production service worker activates, controls page, and caches application: 2 cache(s)
- Offline reload loads art/game and Continue restores saved crossing with HTTP cache disabled
- Network restored online

## Method and scope

Name, focus, export/import, journal navigation, and continuation used actual mouse/keyboard/file-chooser UI. The complete/dead/reveal edge cases used explicitly generated offline Game fixtures imported through that UI. These fixtures are separate from the full real-input campaign in [QA.md](QA.md).

Offline verification waited for an activated service worker and controller, disabled network and the HTTP cache, then reloaded and continued the saved game. Network was restored in cleanup. This verifies service worker/cache behavior, not physical PWA installation.

Downloads and fixtures stayed in workspace `/workspace/agent/verso-storage-qa/run-1789080235885`, mapped to host `/home/sabino/.local/share/agent-workspace-linux/files/verso-storage-qa/run-1789080235885`. Only the two backed-up save/settings keys were restored; storage was never cleared wholesale.

## Evidence and repeat

Screenshots and structured results: [../.dream-loop/storage-qa/](../.dream-loop/storage-qa/). Online browser errors: 0; offline-period browser errors: 1.

`node scripts/browser-storage-check.mjs http://127.0.0.1:40393 http://localhost:4174`

Replace the ephemeral CDP endpoint with the active Agent Workspace endpoint. The check creates and closes its own tab.

The uncached offline probe is intentionally expected to report `ERR_INTERNET_DISCONNECTED`. Navigation, bundles, and artwork must still arrive from the service worker. Any other browser error fails the check.
