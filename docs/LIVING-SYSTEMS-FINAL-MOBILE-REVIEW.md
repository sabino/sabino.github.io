# Independent final mobile and gameplay review

Local working-tree review on `feat/living-systems-expansion`, September 13, 2026.
This reviewer did not implement the reviewed living-systems or interaction changes.
The app is served on localhost:4210 and uses the local world endpoint. All browser
inputs use native CDP touch, mouse, or keyboard in the existing isolated
`verso-living-systems` Chromium workspace. No production connection, publication,
payment, or microphone acquisition is part of this review.

No unresolved Important findings remain from this local review. The four issues
below were repaired by the integrator and verified with fresh native inputs.

## Evidence and scenario boundary

Evidence lives under
`.dream-loop/living-systems/mobile-systems-review/review-03/` (ignored local files).
Saved scenarios are explicitly prepared before app startup. Estate and contact
fixtures use actual generated life/property identifiers and accepted solo
commands; the estate fixture crafts its required boards before saving. The
underworld fixtures put a normal-health life beside each generated boss, and the
third-floor scenario starts the boss in phase two. They do not represent a
completed dungeon campaign. Subsequent actions, resource spending, combat, and
navigation are performed through real browser inputs. Diagnostics only observe
the resulting state.

Viewports: 320×568, 390×844, 430×932, and desktop 1280×900. Underworld floor
checks use 320, 390, and 1280 widths. Screenshots emulate CSS viewport sizes;
they do not establish physical iOS/Android behavior.

## Findings sent to the integrator

1. **Construction preview hidden by its own confirmation card at 320×568.**
   The original footprint occupied x157–229/y242–278 while the card covered
   x12–308/y234–368. Moving and shortening the short-phone card now leaves the
   footprint visible. Native preview, cancel, and confirm pass at all four sizes.
2. **Satchel management controls were 23–25 px high.** An obsolete important
   CSS declaration overrode a newer minimum. The base-rule repair is verified
   for both Tools & household and Invent at all three phone widths.
3. **Voice settings had undersized desktop controls.** The first repair fixed
   Close and the sliders, but the two selects remained 40 px because a later
   declaration won. Repairing that later base-rule minimum is verified at all
   four viewports.
4. **The desktop Pause Resume button measured 40.09 px.** This existing heading
   control uses `#s-resume`, so changes to the generic `.s-window-close` class do
   not apply to it. A focused replay checks its explicit 44 px minimum.

Historical failures remain in `final-all-results.json` and
`metrics-before-fix.json`; they must not be mistaken for final passing evidence.

## Final focused verification

| Evidence JSON                                                                   | Viewports           | Recorded checks or states |
| ------------------------------------------------------------------------------- | ------------------- | ------------------------: |
| `interaction/results.json`                                                      | 320, 390, 430       |                        30 |
| `final-estate-results.json`                                                     | 320, 390, 430, 1280 |                        39 |
| `final-contact-four-size-before-voice-fix-results.json` (three phone scenarios) | 320, 390, 430       |                        12 |
| `final-contact-results.json` (final desktop replay)                             | 1280                |                         5 |
| `final-all-results.json` (nine floor scenarios only)                            | 320, 390, 1280      |                        37 |
| `systems/results.json`                                                          | 320, 390, 430, 1280 |                        64 |
| `recovery/results.json`                                                         | 320, 390            |                         8 |

The broad screen pass found no horizontal overflow or broken accessible-label
references. Its sole remaining undersized control was the desktop Pause close
button, covered by the later focused replay. That final replay measures
`#s-resume` at 44×44 px, and `#v-ptt-behavior` and `#v-input-device` each at
481×44 px. Source snapshots are `source-03.json`, `source-03-final.json`,
`source-03-final-voicefix.json`, and `source-03-final-closefix.json`.
The final integration starts at commit `b2311c8`; later repairs only change CSS.

The native lifecycle run explicitly verifies held Interact release, drag-to-choice
cancellation, pointer cancellation after replacement, twelve rapid open/close
pairs under 4× CPU throttling, two-thumb attack-to-dialogue cancellation, held
Enter across focus replacement, fresh keyboard and touch activation, and PTT
setup without microphone permission. The harness waits for Interact to visibly
return after keyboard closure before aiming a fresh touch; an initial premature
aim was a harness failure, not evidence of an in-game close action.

Both recovery scenarios begin at 112 HP. Native Guard and Step are accepted;
actual enemy attacks reduce HP to zero. The focused recall button remains visible
and is 48.09 px high. Native recall restores 112 HP at the real surface entrance
(212, −4), changes field coins from 24 to 19, and leaves no held input sequence.
No browser exceptions or console errors occurred in these passing scenarios.

## Verified behavior

- The initial full replay records 92 checkpoints across 17 scenarios, with zero
  browser console errors or exceptions. Its four scenario failures correspond
  only to the two remaining control-size CSS issues above.
- Two-step construction does not spend materials during preview; Cancel creates
  nothing. Native Confirm creates exactly one Dressing table and consumes eight
  field coins and the admitted materials. Dismantling Cancel preserves it.
- Go home reaches the generated home's actual entrance on all four sizes.
- The occupied body is absent from autonomous actors and guild contacts. A real
  nearby craft contact can grant charter discovery. Actual keyboard Tab/End
  navigation selects Signs, and Escape returns to play.
- All three underground floors expose their correct floor label. Recall has an
  actionable confirmation and cancellation path, returns to the surface, clears
  held input, and debits `ceil(coins × 0.2)` exactly once.
- A native approach followed by an eight-second held Strike reduced the
  third-floor phase-two boss from 198 to 170 HP. The player survived with 32 HP.
  The read-only RAF sample recorded 480 intervals, p95 16.8 ms, no interval above
  33.5 ms, and no browser errors. This measures one local desktop-hosted Chromium
  encounter; it is not a physical phone performance claim.
- PTT opens settings while microphone state remains false. No real microphone
  permission was requested.

## Reproduction

Use a freshly verified workspace-owned CDP endpoint, never an arbitrary browser:

```sh
VERSO_BROWSER_CDP=http://127.0.0.1:45895 node scripts/browser-final-mobile-review.mjs
VERSO_BROWSER_CDP=http://127.0.0.1:45895 \
  VERSO_BROWSER_FIXTURE=.dream-loop/living-systems/mobile-systems-review/review-03/npc-fixture.json \
  node scripts/browser-final-interaction-review.mjs
VERSO_BROWSER_CDP=http://127.0.0.1:45895 node scripts/browser-final-recovery-review.mjs
```

The main script supports `VERSO_REVIEW_CASE=estate|contact|underworld` and
`VERSO_REVIEW_WIDTH=320|390|430|1280` for focused replays. It records assertion
failures and returns a failing exit code. Source hashes identify each reviewed
freeze in the evidence directory.

Targeted read-only Node review: 89/89 tests passed across interaction-sequence,
living-systems UI, estate presentation, civic/property world, floor isolation,
underworld, and world-sign suites. The integrator owns the final full test/build
and offline/PWA checks.

## Remaining device verification

Physical iPhone/iPad Safari and Android Chrome still need installation, safe-area,
on-screen keyboard, app resume, and prolonged thermal/performance checks. Actual
VoiceOver/TalkBack navigation and microphone/headset routing are not established
by keyboard and emulated touch tests. This review also does not certify live
multiplayer latency, production persistence, a four-hour playthrough, payments,
or offline service-worker update behavior.
