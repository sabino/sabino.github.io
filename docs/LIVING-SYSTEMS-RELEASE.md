# Living systems and movement pace — approved rollout contract

The local systems gate is recorded in [the batch report](LIVING-SYSTEMS-LOCAL-BATCH.md). On 13 September 2026 the user authorized its deployment after adding dedicated Walk/Run controls. The source remains on `feat/living-systems-expansion`; the published source is identified by the production `games/verso/release.json`, not by an assumed latest local commit.

## Movement controls

Walk/Run is a persisted movement preference, separate from automatic travel. C toggles it during active gameplay; modified/repeated/composing keys, text fields and overlays do not change it. Shift and the optional stick-edge gesture temporarily run. The preference does not start movement. Desktop places the controls in the action bar; mobile places them with the movement thumb controls and mirrors handedness. Travel offers direction lock and Go home; active travel exposes Stop. Ordinary movement, collision, permissions and authoritative speed bounds still apply.

## Existing deployment targets

Use only the existing GitHub Pages repository `sabino/sabino.github.io`, master directory `games/verso/`, and CapRover application `verso-world` at `verso-world.host.sabino.pro`. Publish the verified source branch separately, retain old hashed browser assets and update the content-versioned service worker. Submit an image-only CapRover deployment; the general configuration helper must not overwrite captured environment, payment, resource or proxy values. No new DNS, service, volume or secret is required.

Capture the prior source, Pages commit, immutable image, full private operator configuration and existing volume records with restricted permissions. Validate signatures and restore using the new image against a read-only copy. Run node canaries before publishing the frontend: existing legacy QA room reconnect, real scoped binary voice authentication/ranges/abuse rejection, and modern field craft/replay plus a real walked underground entry, retained resume and paid recall. Preserve non-QA state and every signing identity.

## Retention-aware rollback

The older `79ed094` server and browser can read portions of new records but omit new domain fields when saving. Therefore blindly reverting their images/assets after modern writes is **not** a data-safe rollback. A pre-rollout backup is evidence and recovery insurance; restoring it over live player progress is not the default rollback procedure.

A safe fallback must preserve unsupported records unchanged and refuse old gameplay for migrated lives/rooms until a compatible forward repair. The operator evidence includes separately tested fallback guards for this purpose; they are not part of normal gameplay. Their exact hashes, activation recipe, availability limits and independent review belong in the final deployment report. Never describe a bare old image or old Pages revision as a transparent fallback after new domain data exists. Preserve both source generations and all current data.

## Completion gates

The release is verified only after full tests/typecheck/format/build, independent movement/input and fallback review, exact image/source and Pages revision proofs, private storage/signing/configuration preservation, actual TLS gameplay/voice/domain canaries, native portrait/desktop controls, announcements and old-save PWA activation/offline checks. Physical Android/iOS, microphone routing and long-session performance remain separate device checks.

Actual run results, source hashes, screenshots and rollback references are generated under `.dream-loop/living-systems-deployment/` and linked by the final operator report. Preparing this contract does not assert that a deployment has succeeded.
