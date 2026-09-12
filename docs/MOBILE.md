# Phone play and installed-app behavior

Verso keeps its pixel-art world as the main surface. The phone HUD now reserves a
single communication row for Voice, range, PTT, Words and Chat. The transcript is
collapsed on arrival; opening it does not focus an input. Words offers saved
phrases plus help, thanks, trade and work without a keyboard. Room/local selection
is explicit. All essential actions remain reachable through the bottom bar and
More; very narrow phones move Ward into More. Holding Run with a direction enables
running. Directional touches use pointer capture and stop on cancellation.

## Text entry

`src/stichos/mobile-viewport.ts` coalesces window and VisualViewport resize/scroll
signals to one update per animation frame. At normal zoom, the app uses the actual
visible viewport height and offset. Pinch zoom is not interpreted as a keyboard.
Focusing chat compacts chrome immediately, retaining the world, movement/actions,
a recent-message line and a 44px Send/Done composer. Sending blurs the input,
collapses the transcript on phones and returns focus to the canvas. Done dismisses
text entry while retaining an unsent draft. IME composition does not send messages
or invoke game shortcuts. Opening another panel releases PTT and does not focus a
phone text field automatically.

Inputs use at least 16px text on phones to avoid Safari's automatic input zoom.
Dialogs have bounded content scrolling and persistent headings/close controls;
satchel keyboard focus is contained and Escape closes it. Safe-area insets are
applied without assuming a notch size. Orientation and browser chrome changes
resize the game canvas. Keyboard and switch activation, text fallback, labeled
controls, visible focus and reduced-motion preferences remain available.

## App mode

`src/app-mode.ts` reports this window's observed mode. Standalone, minimal-ui,
window-controls-overlay, and iOS `navigator.standalone` count as an installed app
window. Browser mode is honestly reported as “installation elsewhere unknown.”
Fullscreen alone does not prove installation. `launchQueue` capability, observed
launches and `appinstalled` are separate signals; neither changes a browser tab
into a claimed standalone installation. No launch URL is trusted or acted on by
the detector. Existing invitation parsing owns room navigation.

Sound & app settings is available from the header, Pause and More. It exposes
master/ambience/music/effects preferences, voice settings, install guidance,
observed display mode, viewport behavior and current soundscape. Read-only QA
signals are also exposed through `window.stichos.state` (`appMode`, `viewport`,
`audio`, `voice`, `worldTime`, `fauna`, `residentActivities`, `fieldObservations`).

## Verification

- Pure policy tests: `node --experimental-strip-types --test tests/mobile-layout.test.ts`.
- Native touch and keyboard responsive pass (22 checks, zero browser errors):
  `node scripts/browser-mobile-living.mjs http://127.0.0.1:CDP_PORT http://localhost:4183/`.
  CDP must come from the isolated agent-workspace browser, never the host browser.
- Evidence: `.dream-loop/mobile-living-voice/results.json` and adjacent screenshots.
  The harness checks 320×640, 360×780, 390×844, 768×1024, 1024×768, 844×390 and 1440×960.
  The verified 390×390 keyboard case retains 247px of world height and uses a genuinely focused input and a reduced emulated
  viewport; Chromium desktop does not display an actual iOS/Android keyboard.

Remaining physical-device checks: Safari/iOS and installed iPhone/iPad launch;
Chrome/Android and installed launch; keyboard dock/undock and predictive-input
bars; notched landscape insets; pinch zoom with keyboard open; Bluetooth/headphone
routing; permission interruptions and calls; VoiceOver/TalkBack/switch controls.
Browser responsive automation is not a substitute for these hardware checks.

## Browser references

- [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport):
  visual and layout viewports can differ when keyboards or browser UI appear.
- [Display mode](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/display-mode):
  media queries describe the current app window's presentation.
- [LaunchQueue](https://developer.mozilla.org/en-US/docs/Web/API/LaunchQueue):
  launch handling remains feature-detected and does not prove installation.
