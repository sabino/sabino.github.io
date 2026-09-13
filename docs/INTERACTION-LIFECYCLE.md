# One gesture, one action

`interaction-sequence.ts` owns a bounded, transient ledger of pointer sequences.
The owner is the exact element present at pointerdown, plus an input-surface
revision. A new dialogue button with the same ID is still a different owner.
Held controls claim their sequence before executing; their eventual compatibility
click cannot execute another action. Ordinary native buttons continue to activate
on click, including keyboard, switch and screen-reader clicks.

No elapsed-time exclusion window is used. A new deliberate pointerdown starts a
new gesture immediately. Simultaneous pointers have separate owners; changing an
overlay cancels all held game inputs without allowing another pointer to continue
attacking or transmitting behind it. The ledger is not saved or sent over the
network.

Conversation buttons activate from the matching pointerup inside their own bounds,
with a 14-pixel movement slop. This is an input-distance threshold, not a cooldown.
The owned release invokes the existing accessible click handler exactly once and
consumes any later compatibility click. This also handles Chromium's observed
omission of the next native click after an interrupted drag. A scrolling/dragging
contact cannot choose an option. Terminal events are observed at document capture
so removing the old element cannot strand a contact outside the application root.

## Integration contract

The lead integrator owns `app.ts` and must make these changes:

1. Import `mountInteractionSequences`; instantiate `inputSequences` after input
   variables and before `mountVoiceUi`/`mountPortraitControls`. Its `onTransition`
   clears `heldAttack`, `heldTechnique`, `keys`, `walk`, and `walkTarget`, then
   releases portrait controls and voice UI. The callback is invoked after these
   controls are initialized, never during ledger construction.
2. Pass `sequences: inputSequences` to both controls' option objects.
3. Call `inputSequences.transition()` at the start of `openModal`, `closeModal`,
   `transfer`, and only when the satchel state actually changes. In
   `updateDialogue`, call it after detecting a changed `dialogueSignature`, before
   replacing/removing its contents. Do not advance it on unchanged UI refreshes.
4. In canvas `pointerdown`, after rejecting inactive/invalid inputs but before any
   audio/gameplay/placement/approach action, require
   `inputSequences.claim(event, canvas)`. Prevent default, stop propagation and
   capture the pointer on canvas. Pointer capture keeps release attached to the
   old surface; the ledger also rejects compatibility clicks after inertness,
   replacement or lost capture.
5. The old `[data-move]` direction-pad handlers must each own a pointer ID, reject
   an additional pointer on the same button, claim before adding movement, and
   remove that direction only for the owning pointer's up/cancel/lost-capture.
   Closing a surface already clears every held direction through `onTransition`.
6. Expose `inputSequences.diagnostics` in the read-only browser diagnostics.

## Browser evidence interpretation

The ordinary held Interact gesture on baseline Chromium retained its dialogue:
capture survived the portrait pane becoming inert, and its compatibility click
landed on a non-action container. This alone does not reproduce the reported
phone-specific failure. The before/after browser suite therefore also exercises
capture cancellation, retargeting across overlay mounting, simultaneous held
controls and rapid independent taps. Results distinguish observed native failures
from deterministic ledger regression tests; Chromium emulation does not claim to
replace physical iOS Safari checks.
