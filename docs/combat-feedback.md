# Combat feedback architecture

The presentation layer reads accepted actions and authoritative outcomes. It never changes damage, collision, inventory, random generation, multiplayer clocks or checkpoint data. `StichosRenderer.draw` accepts optional `effectIntensity` (0–1, default 0.7), the existing `reducedMotion` preference, and `combatCues` for new skills and encounters. `feedbackDiagnostics` exposes live pool counts and update costs for browser QA.

## Cue contract

`CombatCue` in `src/stichos/combat-feedback.ts` contains a stable ID, kind, world tile position, current age and duration. Optional heading, radius, color, strength, physical actor ID, text and shape describe the accepted action. All numeric fields are finite and bounded. Radius means **world tiles**, never CSS pixels. Friendly charge rings and hostile cone/line/circle warnings use the same geometry on every device.

Kinds cover anticipation, charge, melee, projectile, impact, guard, area, dash, death, loot, level, status and hostile telegraph. Optional styles distinguish thrusts, arcs and invented energy projectiles; status symbols distinguish healing and burning. The session supplies exact world-space shape/radius/half-angle/half-width for ordinary enemies and expedition intents, including separate lanes for split volleys. The adapter retains conservative legacy hints only for a caller without these explicit cues; colocated explicit warnings suppress them. Session input prioritizes nearby hostile warnings before preparations and decoration within its 64-cue bound.

Existing slash/arrow/ward/hurt/heal/ember effects adapt automatically. Physical tool strokes retain the dedicated tool animation and Foley already shipped. Loot completion receives a brief material-colored sparkle. Accepted deaths retain at most 16 transient presentation actors for 0.55 seconds, allowing collapse after shared simulation removes the actor. Loading a corpse does not replay a death. This presentation state is never saved. Physical body IDs bind preparation and impact to the correct actor, including remote players. Ordinary NPC cooldowns no longer falsely swing held equipment. Explicit authority release receipts distinguish a successful technique from a canceled preparation. A separate bounded 16-entry, 0.35-second enemy-release snapshot drives shared encounter motion and semantic Foley even when the attack misses. The session deduplicates at most 64 such receipts; preparation and release arrays are stripped from checkpoints and cleared on restore.

Melee uses preparation, release, a 26 ms visual strike hold and quadratic recovery. This is **actor animation only**: world simulation, input and networking continue. Impact recoil and squash displace the drawn sprite by at most a fraction of a tile; the physical position never changes. Pixel afterimages, directional bursts and material-colored leading edges separate travel from impact. Body glints stay local rather than flashing the full screen. Camera displacement is limited to 2.5 CSS pixels, fades within 140 ms and preserves inverse pointer projection.

## Performance and lifecycle

- A preallocated pool contains 144 particle records. New bursts drop particles when full; nothing grows without bound.
- At most 48 active cues, 128 tracked actors, 128 legacy source effects and 64 explicit source cues are processed per update. Warning/charge cues can displace decorative cues at saturation.
- A bounded 384-ID visual receipt cache prevents repeated snapshot bursts. Late snapshots show their ongoing visual state without replaying launch bursts.
- Cues outside the world-space viewport plus their radius are culled. Projectiles, canceled charges and interrupted warnings disappear on the next snapshot/frame.
- Pool integration caps elapsed time at 50 ms. Rewind/new-world resets clear state. No stale burst catches up after resume.
- Rendering allocates no canvases, gradients or image filters. All particle geometry uses pixel rectangles; cues use bounded paths. The existing humanoid sprite cache handles six finite attack poses.
- Intensity zero or reduced motion immediately clears particles and disables camera displacement and squash/recoil. Threat geometry, projectiles, labels and charge progress remain legible. No screen-wide flashes or strobing. Exact warning outlines are repeated as thin contrasting foreground boundaries so foliage cannot erase danger geometry; the filled area remains beneath actors. Nearby combatant canopy transparency is bounded to 16 hostiles and eight peers within eight world tiles, plus the player.

`tests/stichos-combat-feedback.test.ts` exercises malformed payloads, snapshot immutability, deterministic visual RNG, repeated/late receipts, saturation, priority warnings, culling, cancellation, reduced motion, death transitions, finite attack timing and all render branches. Browser QA must additionally measure actual renderer/combat frame times on the integrated game; the pure-module timings are not a substitute for mobile-device measurement.

## Sound and provenance

The feedback layer emits no sound and does not duplicate attack or gathering audio. Accepted simulation actions continue to use the existing recorded material Foley and semantic ability hooks. Existing CC0 asset provenance remains in `public/audio/PROVENANCE.json` and `public/audio/LICENSE.md`.

The official [Soul Knight Prequel Google Play presentation](https://play.google.com/store/apps/details?id=com.chillyroom.soulknightprequel) was inspected on 2026-09-12 as a quality reference. Its public material emphasizes distinct action silhouettes, combinations of equipment/skills, and visible loot moments. The still-image inspection supports those readability observations, not a claim to have measured its proprietary frame timings. Verso's implementation uses original pixel geometry, its muted mineral/botanical palette, world-space warnings, existing humanoid artwork and its own procedural equipment. No reference artwork, game names, characters, audio or effects were added to production assets. A temporary research screenshot stayed outside the repository.
