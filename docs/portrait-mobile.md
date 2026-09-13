# Portrait play and touch controls

Verso keeps its existing procedural canvas art and etched-metal interface. The
phone composition gives the world most of the display: movement occupies the
lower left, combat the lower right, and voice/text and supplies remain reachable
below the world. These controls send ordinary client input; they do not change
world coordinates, hearing ranges, combat authority, saves or room protocols.

## Movement and combat

- The analog stick has a radial 14% dead zone, reaches full walking speed at 78%
  of its 43 CSS-pixel travel, and optionally runs at 96% travel. The output is a
  normalized world-axis vector, independent of render scale or camera zoom.
- The larger Strike button supports press/release, with separate weapon
  techniques and Step. The session owns acceptance, timing, stamina, targeting,
  damage and cooldowns. The input widget only displays normalized cooldowns.
- Skill releases more than 20 pixels beyond their button cancel, allowing normal
  touch slop while supporting a deliberate drag-away cancellation. Pointer
  cancellation, focus loss, page suspension, orientation changes and blocked
  controls cancel every active input.
- Pointer IDs are independent: movement and attacks may be held with different
  fingers. A second pointer cannot steal an occupied stick or action.
- Arrow-key movement, keyboard/switch activation and the existing direction
  buttons remain available. **Sound, touch & app settings** contains attack-hand
  placement, analog/direction movement and edge-sprint preferences.
- These preferences use `verso.portrait-controls.v1` in local storage. Invalid or
  unavailable storage falls back safely. They are personal interface preferences,
  separate from the character save.

The right-handed layout uses 120-pixel stick, 76-pixel Strike, 60-pixel first
technique, 52-pixel second technique, 54-pixel Step, and 44-pixel interaction
targets. Left-handed mode mirrors their placement while keeping labels readable.
On narrow screens, secondary supplies remain in More instead of shrinking targets.

## Portrait and installed mode

The existing manifest identity, start URL and scope remain unchanged; the manifest
now declares `orientation: portrait`. `mountMobileViewport` requests
`screen.orientation.lock('portrait')` only in an installed or fullscreen touch
window, after interaction or a relevant lifecycle event. Rejection is caught and
reported honestly in viewport diagnostics; the app never forces fullscreen.

Ordinary browsers may not grant orientation lock. A touch landscape window shows
an accessible **Turn your world upright** interstitial, makes the gameplay shell
inert, clears held input, and restores focus when portrait returns. Desktop
mouse/keyboard landscape remains available. A shared room continues to simulate
while a participant turns their device; this is stated on the interstitial.

The existing app-mode detector remains authoritative for standalone versus browser
status, including iOS `navigator.standalone`. Keyboard contraction is not mistaken
for a physical rotation while text entry is active. VisualViewport height and top
offset still control the visible game and compact composer. Browser tabs cannot
prove whether a separate installation exists.

Settings expose viewport height, VisualViewport support, portrait lock outcome and
installed-mode detection. Real browser behavior is feature-detected rather than
promised from a user-agent name.

## Panels and accessibility

On touch screens, bounded panels become bottom sheets with fixed headings/close
buttons and their own contained scroll area. The satchel is capped instead of
covering the entire screen with unused space. Actions and pause options use a
two-column thumb grid. Inputs use at least 16-pixel text, and major actions have
at least 44-pixel targets. Chat and PTT remain separate from movement and combat;
quick phrases permit communication without microphone consent or text entry.

The orientation dialog has a labelled modal role and focus restoration. Controls
have descriptive labels and visible focus rings. Reduced-motion preferences
disable decorative control transitions. Main-session focus traps and gameplay
pause rules continue to own dialogs and inventory.

## Verification

- `node --experimental-strip-types --test tests/portrait-controls.test.ts tests/mobile-layout.test.ts`
  covers dead zone, normalization, sprint threshold, invalid coordinates,
  settings migration/corruption/denial, manifest identity and rotation policy.
- `VERSO_BROWSER_CDP=<verified-workspace-endpoint> VERSO_BROWSER_URL=http://localhost:4197/ node scripts/browser-portrait-mobile.mjs`
  attaches to an already-running isolated browser. It never launches an emulator
  or a host browser. It checks six portrait sizes, actual pointer movement and
  release, touch targets, panels, text fallback, left-handed direction buttons,
  landscape blocking, desktop and a **simulated** iOS standalone signal.
- Evidence is written under `.dream-loop/portrait-expansion/`; before screenshots
  were captured from deployed-source baseline `e6063ea` before lane edits.

Required physical-device follow-up: Android Chrome and iPhone/iPad Safari actual
keyboard/browser-chrome transitions; OS orientation lock and installed launch;
VoiceOver/TalkBack rotor navigation; Bluetooth headset interruptions; simultaneous
stick/PTT/attack touches; notch/safe-area behavior in an installed app; sustained
frame rate on a low-end phone. Browser emulation cannot certify those behaviors.

## Platform references

- [Screen Orientation locking and browser restrictions](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)
- [Pointer capture and cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)

No third-party game artwork, audio or interface assets are included in this lane.
