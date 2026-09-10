# Gamepad browser QA

Run: 2026-09-10T23:05:15.495Z. **PASS**.

## Verified

- Controller connection changes hints and prepares title name/submit
- A confirms title and deploys without accidental dash
- Controller-only blocked audio shows prompt; one click enables sound without muting
- Left stick moves player
- D-pad moves player
- Stick deadzone prevents drift
- Light analog movement retains full A dash: light movement 7.9; dash 132.8 ground units
- Right stick aims B pulse
- X triggers blade
- Start pauses/freezes and resumes
- View opens journal; held B closes without pulse until release and fresh press
- D-pad selects menu item and A activates it
- Y interacts and catalogs nearby species
- RB mends world integrity and consumes one fragment
- Disconnect stops motion and restores keyboard hints
- No browser errors

## Findings

None observed.

## Method and limits

This check overrides only `navigator.getGamepads` with a synthetic standard-mapping controller and changes its button/axis samples. The actual animation loop, adapter, UI handlers, and game simulation perform every action. `window.verso` is read-only and was not mutated. Offline collision geometry is used only to plan analog movement. No mouse or keyboard activation is supplied before the controller-only audio observation.

Physical USB/Bluetooth hardware, operating-system mapping, rumble, and device-specific browser activation behavior are **not tested**. This is browser integration QA for standard-mapping input.

The check creates a separate Agent Workspace tab at http://127.0.0.1:4174, bypasses service workers for the current production bundle, then restores the original scoped save/settings keys and closes the tab. Backup restored: **yes**. Loaded scripts: http://127.0.0.1:4174/assets/index-CG7BYMRU.js.

Evidence: [../.dream-loop/gamepad-qa/](../.dream-loop/gamepad-qa/).

Repeat with the active isolated workspace endpoint:

`node scripts/browser-gamepad-check.mjs http://127.0.0.1:40393 http://127.0.0.1:4174`
