# Independent portrait expansion integration review

Reviewed the changes from deployed-source baseline `e6063ea` through the local
`feat/portrait-action-expansion` tree, including commits `038b525`, `ee87a40`,
`0282254`, `3d85fb6` and `1d937e8`, plus the integrator's combat/session changes.
This reviewer owns only this document and
`tests/stichos-action-security-review.test.ts`. Implementation fixes remained with
the integrator; no production access, deployment, push, microphone capture or
third-party asset download occurred during review.

## Findings corrected and independently exercised

- Held movement and Strike now remain available while a shared combat reply is
  pending. Action dispatch still prevents duplicate outstanding requests.
- An accepted shared attack pays its energy even when running spent stamina
  during network delay. A bounded saved debt is repaid before usable regeneration;
  the action's cooldown prevents duplicate commitment.
- Changing rooms or leaving authority cancels paid preparation, remote charges
  and transient movement without clearing the paid recovery.
- Quick-step and ordinary movement consume separate portions of elapsed time.
  Independent tests obtain the same 1.81-tile displacement over 0.2 seconds at
  10, 20, 50 and 100 ms update partitions.
- Actual technique releases have explicit bounded authority records. A canceled
  cast's disappearance no longer pretends that a strike or pulse occurred.
- Local danger cues use authority range, locked heading, cone angle and beam or
  projectile width. Their source priority survives a full paused decoration queue
  and 70 irrelevant remote warnings.
- Defeated shared actors receive bounded presentation copies; they remain absent
  from simulation. Paused room updates cannot grow death cues indefinitely or
  replay old deaths.
- Renewal uses the authoritative cast identifier, so multiple targets, replayed
  frames and a same-room reload produce one benefit. Precision reads pre-hit
  stagger, and stagger interrupts preparation with bounded persisted values.
- Content review separately found and repaired a reward fallback that could
  produce a non-weapon, encounter placement inside an established resource route,
  and incorrect technique families for contact implements. See
  [the independent content review](./EXPEDITION-INTEGRATION-REVIEW.md).

- Older rooms now show an explicit field-expedition unavailable state. Stale
  callbacks and the tracker also respect the negotiated capability; they no
  longer send players to encounters absent from that authority.
- Shared enemy attacks now emit a bounded actual-release record even when their
  attack misses. An independent warden test steps outside its locked beam,
  verifies one visible release and one semantic sound, rejects duplicate sound,
  and confirms interrupted/staggered preparation stays quiet. Malformed and
  oversized release arrays fail validation. All three presentation collections
  are omitted from authority checkpoints; browser saves contain no release
  cue or sound receipt.

No critical or important code/security/design findings remain in this review
scope. Final full-suite/build and native-browser evidence remain separate gates.

## Security, compatibility and persistence

The protocol remains version 3. Techniques require a per-member negotiated
`actionExpansion` capability; room codes do not grant an additional authority.
Intent IDs retain the established monotonic/replay checks. The server computes
weapon damage, reach, preparation, interruption, recipient hits and consequences.
New optional properties retain the legacy `slash`, `arrow` and `ward` event
kinds. Legacy ordinary attacks pass the actual room-authority test.

Artifact technique families derive from physical delivery: contact, projectile
or pulse. The existing personal inventory/progression trust boundary remains:
this is not a newly cheat-proof server economy. Expedition claims consume local
supplies and retain permanent receipts; shared enemy deaths remain authoritative.
Generation versions, original terrain/resident addresses and old optional-save
defaults are preserved.

Voice transport, microphone capture, room-signing code and recorded audio banks
have no changes relative to `e6063ea`. Added combat state contains numerical
cooldowns, status, cast identifiers and presentation metadata, not microphone
content. Announcements use their own bounded browser key; opening them does not
touch character or room state. Their text and optional local artwork references
are validated and escaped.

## Performance and readability design

Feedback has a preallocated 144-particle pool, 48 active cues, 128 actors and a
384-entry visual receipt cache. At most 64 explicit source cues and 128 legacy
effects enter its update; nearby hostile warnings take priority before that
source limit. Zero intensity/reduced motion removes particles and camera recoil
while preserving threat geometry. Simulation and network clocks do not stop for
visual hit holds.

The session retains at most 64 queued presentation cues and 16 falling actors,
including while paused. Shared preparations are bounded to eight; technique
release records are bounded to 16 with a short authority-controlled lifetime.
Enemy release records likewise retain at most 16 entries for 0.35 seconds;
clients keep at most 64 presentation receipt IDs per room and sound only nearby
releases. No presentation record is restored from a room checkpoint.
Existing combat projectile, actor and consequence limits still apply.

The expedition catalog retains 12 towns, examines at most four nearby towns,
uses bounded placement/reachability work and returns copied actor templates.
The independent integrated run measured 10.46 ms for a cold catalog query on an
initialized development-host world and 1.52 ms for 100 warm actor queries, with
zero warm tile queries. These are module costs, not evidence of sustained phone
frame rate. Cold discovery work remains a possible transient frame cost;
browser stress measurements and physical-device testing must be reported
separately.

## Product and provenance scope

The working expansion contains a bundled offline bulletin, portrait two-thumb
controls, six physical-delivery techniques, quick-step, bounded combat feedback,
three repeatable settlement commission families, five distinct encounter roles,
a phase-changing warden and three earned mutually exclusive build synergies.
Progress uses actual discovery, enemies, crafted supplies, equipment and resident
aid memory. This is a coherent expansion, not a claim of hundreds of new classes,
fully autonomous civilization simulation or independently measured hours of play.

The public Soul Knight Prequel presentation is a high-level readability/content
reference. No new third-party production art or audio files appear in the diff;
procedural geometry, names and equipment are Verso code. Existing recorded audio
keeps its previously documented provenance. No proprietary reference assets,
characters, exact effects or branding were introduced in reviewed source.

The PWA keeps its manifest identity, start URL and scope, adding portrait
orientation. Installed/fullscreen locking is feature-detected; ordinary browsers
receive an accessible rotation state. Real iOS/Android installation, keyboard,
screen-reader, safe-area, Bluetooth and sustained low-end-device checks cannot be
certified by emulation.

## Reproduction and remaining gates

```sh
node --experimental-strip-types --test \
  tests/stichos-action-security-review.test.ts \
  tests/stichos-expedition-integration-review.test.ts \
  tests/announcements.test.ts tests/announcements-build.test.ts \
  tests/portrait-controls.test.ts tests/stichos-combat-feedback.test.ts
```

At this review checkpoint: **57 passed, zero failures/skips, 6.84 seconds**.
The broader combat/session-focused run previously passed 51 tests in 2.22
seconds. After the final enemy-release repair, the independent adversarial suite
contains **12 tests, all passing**, including the new release/non-persistence
test (4.58 seconds while other integration checks were running). Full-suite,
production/offline build, final clean source identity,
native-browser screenshots, console checks and forest/combat stress evidence
remain lead integration gates. This document does not assert those results or
authorize deployment.
