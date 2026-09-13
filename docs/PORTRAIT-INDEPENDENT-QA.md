# Independent portrait and combat browser review

The reviewer did not implement the announcements, mobile controls or combat presentation.
Testing used the existing isolated Linux workspace Chromium, native CDP touch/keyboard
input and read-only application diagnostics. No host browser, emulator, physical
installation, deployment or real microphone content was involved.

## Verified product source

Production candidate built from `c95155a2feba4b608af5b492a0639dd6686e29cc`:
`app-CS94cc-y.js`, service worker `78d7fa837ad8b642e47a`. The immutable local copy is
`.dream-loop/portrait-action-expansion/qa-build-2`. Subsequent bulletin spacing/build
metadata changes receive a separate final smoke check; these measurements describe
the gameplay source above.

Final evidence directory:
`.dream-loop/portrait-action-expansion/review-mobile/final-c95155a/`.

- `evidence.json`: **16 independent UI checks, 20 screenshots, zero console errors**.
- `combat/evidence.json`: **three actual encounters plus a reduced-motion variant,
  20 action screenshots, zero console errors**; raw positions, HP, deaths, cue/pool
  counts and CDP Performance counters accompany the metrics.
- `fixtures/`: test-only saves generated in Node through `Stichos.save()` and validated
  by `Stichos.restore()`. Explicit setup gives existing generated weapon owners level 4,
  bounded supplies and 180 HP near real seeded expedition sites. The death fixture has
  1 HP beside an actual hostile. Browser play uses Continue and native controls afterward.
- `ui-run.log`, `combat-run.log`: exact runner outcomes. The earlier reviewer report and
  screenshots remain one directory above for comparison.

## Native UI and lifecycle results

The title and game-menu bulletin routes retain their quiet read state after opening
and reload. Native Tab/Space operate historical disclosures and stay within the labelled
modal; native range-arrow edits persist. At 320×568 and 390×844 the action targets remain
at least 44px and inside the viewport. Inventory, crafting, text fallback, voice setup,
techniques and Field expeditions are reachable. More directly exposes Field expeditions.
The solo microphone panel explains the room prerequisite and offers an actionable route.

Rotation cancels a held action and makes the world inert until portrait returns. Native
browser-window minimization produced a genuinely hidden document and zero held actions;
restoration returns operable portrait controls. Low HP followed by actual enemy AI reached
the death panel; native clinic recovery played its transition and restored the same body
at 320px without clipped recovery controls.

For offline verification, the harness starts its own temporary local static origin, waits
for full service-worker caching, disables HTTP cache and stops that origin. A direct fetch
then fails, while a native reload and six-entry bulletin still work from the service worker.
OS connectivity was not changed. This avoids falsely treating a reset emulation flag as
proof of an offline reload.

## Actual frame behavior

The four bounded fights each sample approximately 14 seconds of real application RAF
intervals. Every interval is retained; gaps of 500ms or more are additionally recorded
with visibility state. Screenshots occur outside timed samples. Root paused its heavy
test processes while these measurements ran.

| Fight                                                             | CPU throttle | RAF p95 | RAF p99 | Full maximum | Frames >50ms |
| ----------------------------------------------------------------- | -----------: | ------: | ------: | -----------: | -----------: |
| Road: sword techniques, held attack and two-thumb pursuit         |           1× |  16.7ms |  16.8ms |       16.8ms |        0/841 |
| Relay: bow techniques and held attack against the major encounter |           4× |  33.4ms |  33.4ms |       50.0ms |        0/728 |
| Garden: staff techniques, held attack and pursuit                 |           1× |  16.7ms |  16.8ms |       16.8ms |        0/841 |
| Garden with OS reduced-motion emulation                           |           1× |  16.7ms |  16.8ms |       16.8ms |        0/841 |

All samples ended visible, with no 500ms gaps. Actual enemies took damage and players
were hurt. Peak observed presentation load was 49 particles / 7 cues, within the 144 / 48
caps; maximum observed feedback update cost was 1.9ms under throttling. Reduced motion
kept zero particles during real attacks while actors and threat boundaries remained visible.
Unit saturation tests complement this naturally observed load; it is not a claim that a
real encounter reached all 144 particles.

The workspace uses GPU-disabled desktop Chromium, a 390×844 touch-emulated viewport and
DPR1. These are concrete browser measurements, not a sustained low-end-phone guarantee.
Bounded fights also do not substitute for a full playthrough of every supply/reward branch.

## Findings and re-review

Two important visual findings were fixed by the integrator and independently rechecked:

1. Long skill names clipped circular controls. Visible Reap/Seam/Split/Needle/Root/Bloom
   labels now fit, with full technique names retained in accessible descriptions.
2. Forest canopies hid nearby hostile bodies and danger zones. Nearby-combat canopy
   fading now exposes the three garden combatants; a thin foreground warning boundary
   survives both scenery and reduced motion. Compare the earlier `combat/garden-charge.png`
   with `final-c95155a/combat/garden-charge.png` and `garden-reduced-charge.png`.
   The safety band moved the generated site, so these are gameplay/readability comparisons,
   not an identical-camera pixel diff.

No critical or important mobile/accessibility/readability/provenance finding remains in
this inspected candidate. Separately assigned reviewers own wider authority/security and
full integration approval.

## Provenance and history

The official developer [Google Play presentation](https://play.google.com/store/apps/details?id=com.chillyroom.soulknightprequel)
was inspected as a public quality reference. Its broad equipment/skill combinations,
cooperative encounters and village downtime inform the documented design principles;
no proprietary frame timings were measured or claimed.

The production public-asset delta from `e6063ea` contains only the manifest. No reference
artwork, audio, branding, character/place names or code was added to runtime assets. New
feedback is original canvas geometry with Verso's existing sprites and palette; prior
recorded-audio provenance files remain intact. Backfilled milestone dates and identities
were independently matched against Git for `e6063ea`, `408b1b0`, `cc7fd61`, `9f2e631` and
`f1eb035`, alongside the publication records linked by `docs/releases.md`.

## Reproduce and remaining device checks

After building, serve an immutable copy locally and obtain the isolated workspace's CDP
endpoint through the agent-workspace tool. Set `VERSO_BROWSER_CDP`, `VERSO_BROWSER_URL`,
`VERSO_BROWSER_OUT` and `VERSO_BROWSER_STATIC_DIR` (the local build directory), then run:

```sh
node --experimental-strip-types scripts/browser-portrait-fixtures.mjs
node scripts/browser-portrait-review.mjs
node scripts/browser-portrait-combat-review.mjs
```

The scripts never launch a browser or connect to production. The UI runner's temporary
offline origin is automatically stopped. Fixture generation must precede the death/combat
checks. Syntax and formatting checks passed for all three scripts; independent focused
announcement/mobile tests passed 26 cases with one browser-gated skip, separately covered
by the native browser checks above.

Physical checks still required: Android Chrome/iPhone/iPad Safari actual keyboard and
browser-chrome transitions; OS orientation/installed launch and safe areas; VoiceOver and
TalkBack; Bluetooth interruptions; simultaneous stick/attack/PTT; thermal, battery and
long-session performance on a low-end phone. Browser emulation cannot certify these.
