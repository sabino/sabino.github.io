# Independent mobile systems review

Local review only; no production connection, push, deployment, or microphone access.
The reviewed browser build is an isolated copy of the working tree under
`.dream-loop/living-systems/mobile-systems-review/snapshot-01`, served on port 4230
with its world endpoint set to an unused localhost port. Native CDP touch and
mouse events run in the existing `verso-living-systems` Chromium workspace.
Screenshots emulate CSS viewport sizes; they do not establish iOS device behavior.

## First pass: integration findings (open)

1. **Important: nested modal prevents small-phone access.** The app adapter passes
   the module's complete `.s-window.v-living-window` through `openModal`, which
   adds another `.s-window` and extracted title/close control. After navigating
   tabs, both titles appear. At 320×568, the Charters list cannot be reached by
   the native harness through the nested clipping/scroll containers. On 390×844,
   the duplicate header consumes much of the viewport and the inner Close button
   wraps its label. Evidence: `systems-320-charters.png`,
   `systems-390-field-craft.png`. Fix the adapter to provide one window, one
   accessible title, one close control, and one bounded scroll container.
2. **Important: desktop discovery/access is missing.** `moreActions` is bound
   only to `#v-mobile-more`, hidden at 1280×900. The Field/Charters/Estates/Signs
   entry is absent from visible desktop menus and shortcuts (apart from the
   special denied-door entry into Signs). Native desktop test cannot reach it.
3. **Important: established homes are offered for sale again.** With seed 8,
   generation 4, life 0, the existing progression owns `town:1:0:house:1`, but the
   new property register is empty and that same home is listed as vacant with
   Buy/Rent. The authority already supports `legacy-home` with a verifying hook;
   no adoption action or automatic bridge exposed it in the reviewed snapshot.
4. **Important: property identity depends on discovery viewpoint.** Actual
   `Stichos` instances with the same seed/life admitted the same building using
   different doors. Starting at (217,-7) yielded southern door (225,-10), seed
   4072291182, House 73, entrance (225,-9). First admission at (225,-9) yielded
   northern door (225,-16), seed 1166496929, House 90, entrance (225,-15).
   `discover` stores the first nearby door and always adds +1 to Y for the
   entrance. This changes the price/name according to approach and points the
   north entrance inward. Use a stable building seed and canonical entrance;
   compute the outward direction from actual building bounds.

## Observed passing behavior in the first pass

- Native 390×844 and 430×932 taps reached field inventory, recipes, a successful
  field-knife craft, guild detail, property detail, sign detail and voice setup.
- Crafting consumed actual admitted field materials and displayed the success
  result; browser state was read, not mutated, during interactions.
- The normal Close action returned to play and restored focus to More.
- PTT opened setup without consenting to or obtaining microphone access.
- No browser console exceptions/errors occurred after the completed snapshot
  was served. An initial incomplete snapshot lacked its imported documentation;
  that harness packaging mistake was repaired before these recorded runs.

## Evidence and reproduction

- `scripts/browser-mobile-systems-review.mjs`
- `scripts/browser-mobile-systems-fixtures.mjs` (an owned-home fixture admitted
  through actual solo commands and accepted by save restoration)
- `.dream-loop/living-systems/mobile-systems-review/results.json`
- `.dream-loop/living-systems/mobile-systems-review/source-01.json`
- `.dream-loop/living-systems/mobile-systems-review/*.png`

Command:

```sh
VERSO_BROWSER_CDP=http://127.0.0.1:45895 node scripts/browser-mobile-systems-review.mjs
```

The script records failures in JSON while continuing other sizes; its shell exit
code alone is not a passing gate. All Important findings require fixes and a
fresh snapshot re-review. Further planned coverage: established-home storage,
worker/production forms, native select and keyboard behavior, guild discovery
and membership, rapid replacement taps, landscape, keyboard-height emulation,
travel cancellation, and new dungeon transitions after the integrator lands them.

Additional first-pass evidence: `estate-first/results.json` records actual one-coin storage transfers on 390×844 and 320×568. Both succeeded, but nested modal clipping blocked deeper Home/Work/Guest controls. The isolated UI module suite passed 8/8 (`node --experimental-strip-types --test tests/living-systems-ui.test.ts`); it did not catch the host integration defect.

## Second pass: fixes verified; two new Important findings

`review-02/results.json`: 16 recorded states on each of 320×568, 390×844,
430×932 and 1280×900. All completed with zero console errors. Every enabled
new-panel control measured at least 44px high; no horizontal overflow or broken
ARIA label references. The single-window fix makes Charters and property controls
reachable. Desktop Pause entries now expose all four systems sections.
`review-02/canonical-home.json` proves identical property seed/name/entrance from
three viewpoints, and verified solo home adoption succeeds at the canonical
entrance. Its generated owned-home fixture survives save restoration.

`review-02/estates-confirmed/results.json`: native 320/390 taps access ownership,
storage, successful one-coin deposit, Work/Hire/Blueprints, Guest keys input and
successful guest grant. Direction lock cancels on a closed-door obstruction;
turning with the touch joystick on clear ground permits a lock and explicit Stop.
All 12 recorded checks per size completed with zero console errors. The earlier
`estates/results.json` failure was a test expectation error: it expected Stop to
remain visible after correct automatic obstruction cancellation.

`review-02/interaction/results.json`: the full native touch regression passed
10 checks at each of 320/390/430 widths. Cases include held opener release over
Leave, pointercancel, dragged choices, 12 rapid open/close pairs at 4× CPU throttle,
multitouch attack-to-dialogue transitions, keyboard ownership, accessibility click,
and microphone-free PTT setup. No console errors.

New Important issues sent to integrator:

- Charter contact discovery lists a designated person anywhere in town, while
  the UI describes them as nearby and enables agreement actions. The authority
  correctly demands a real contact within three tiles. Give the player a truthful
  direction/distance and travel action using the actual actor position; do not
  claim proximity or enable agreement outside range.
- In seed 8/life 0, the player's occupied body is guard resident:4. The ordinary
  visible NPC list excludes it, but the living authority still simulates that
  actor and selects it as the watch contact. Thus the player is referred to their
  own invisible duplicate. `review-02/occupied-contact.json` records body identity,
  authority actors, visible actors and contacts. Autonomous actor admission and
  guild contacts must respect trusted occupied-body identity.

These two findings require fixes and focused re-review before this reviewer can
approve the connected guild/identity experience. Production, live multiplayer,
real microphones and real-device browser behavior remain outside this local pass.
