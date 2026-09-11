# Combat death and mind recovery QA

> Historical browser proof for the named pre-universe build. Its file-import/download controls are no longer part of the current main UI. Current lives use autosave and Continue; this record preserves the original fixture provenance, not a current recovery instruction.

The frozen production build `app-xdAHfhHA.js` passed six actual-input checks in an isolated Agent Workspace Chromium context on 11 September 2026. The context was disposed afterward. Runtime exceptions: zero.

The harness imports `before-first-encounter.json` through the visible Import save control and intercepted native file chooser. That fixture was earned by the campaign simulation’s public actions; it contains a living priest, an unreconciled first vault encounter, and a repaired radio. The browser then selects confrontation, walks 138.2 additional paces along the actual road and vault passages, and waits under real guard attacks. It never assigns gameplay state, storage, position, inventory or health. Read-only diagnostics supply collision information and assertions.

Observed outcomes:

- Guard attacks reduced the priest from 118 vitality to zero while breath and warmth remained at 100. The lost-body panel offered **Follow the other heartbeat**.
- The same control worked at 390×844 without horizontal overflow. It entered Arin Voss, the actual living host `town:-3:-3:resident:6` near the last rest anchor. The occupied host did not also appear in the NPC array.
- Arin had his own 50 vitality, seven coins, three Cequin, one ration and one tonic. The physical notebook stayed with the dead priest.
- The actual downloaded save contained exactly one priest body record and one possessions ledger: 69 coins, staff and bow, notebook, four rations, one timber, six Cequin, two tonics and two salves. No belongings were duplicated into Arin’s pack.
- The confrontation choice, five prior evidence records, story stage, opened objects and removed resources survived. The dead priest was marked removed.
- Browser reload and **Continue** retained Arin, his possessions and the unfinished investigation. Journal presented remembered pages instead of a transported physical book.

This verifies the stable-signal mind recovery branch. Clinic revival of the same body when no mind answers, including its 20% coin cost, remains a separate browser scenario; this run does not claim it. It also does not establish death/combat balance. The immediate mobile post-transfer screenshot captures camera settling; the settled continued-host screenshot establishes the final location and visible body.

Evidence: [lost body](../../.dream-loop/stichos-recovery/04-lost-body.png), [mobile recovery control](../../.dream-loop/stichos-recovery/05-mobile-lost-body.png), [continued host](../../.dream-loop/stichos-recovery/08-continued-host.png), [remembered pages](../../.dream-loop/stichos-recovery/09-remembered-pages-after-death.png), and [structured snapshots and assertions](../../.dream-loop/stichos-recovery/results.json).

Run against a verified workspace-owned endpoint:

```sh
node scripts/browser-stichos-recovery.mjs http://127.0.0.1:WORKSPACE_CDP http://localhost:4174/
```
