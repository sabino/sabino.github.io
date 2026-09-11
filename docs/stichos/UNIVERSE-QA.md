# Universe entry and invitations: native browser proof

On 11 September 2026, 15:14:54–15:15:39 UTC, the production preview at
`http://localhost:4174/` passed **10 real-input checks**, with no browser exceptions
or console errors. The inspected build was `app-tZDgoFWJ.js` with
`app-B_fqJ_rx.css`.

The run used four fresh, isolated Chromium contexts in the verified
`verso-universe-qa` workspace: a host, a mobile creation preview, a link visitor,
and a mobile room-code visitor. Desktop viewports were 1440 × 960; mobile
viewports were 390 × 844. Every context created by the harness was disposed.

Verified behavior:

- The mobile title and life creator fit horizontally, with the real reroll and
  acceptance controls reachable.
- Choosing planet seed 3886 and rerolling changed the visible person, profession,
  and established-life circumstances.
- Real name entry and native color-picker input changed the candidate's displayed
  name, coat, and portrait. The accepted life was named Mira Browser Witness.
- Accepting the candidate played the arrival transition and entered the actual
  body `origin:resident:5`, retaining the selected appearance.
- Pause/save, page reload, and Continue retained the chosen body, name, coat,
  and planet.
- Leaving a body required explicit confirmation. Cancelling, or backing out of
  the next-body creator before accepting, preserved the existing body.
- Galaxy zoom and sector controls opened and responded without changing the
  currently inhabited body. This check did not claim an interplanetary transfer.
- Hosting a browser room displayed a real QR code and a complete invitation URL.
- A fresh visitor followed that URL through the correct creator and joined the
  host's planet and room without entering a seed.
- A fresh mobile visitor entered only the room code; host metadata selected
  planet 3886 and generation 3 before creation and joined the same room. The
  final mobile screenshot shows usable world, work, room, movement, and action
  controls.

The room was `11ECE80710`; this was a temporary test room, not a persistent public
service. The successful run explicitly selected **Browser room**. An earlier
attempt exposed the HTTP profile's dedicated-node default, which contacted an
older local server and failed validation; that is separate from the successful
browser-room result. The root integration subsequently changed the new-profile
default to browser rooms. The inspected screenshot also exposed a hardcoded
overhead `Theo` label for custom lives; this was reported to the renderer owner.

## Reproduce

Run against an already verified, isolated Agent Workspace Chromium endpoint:

```sh
node scripts/browser-universe.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
```

The harness changes the game only through real pointer, keyboard, and text
input. JavaScript evaluation reads DOM geometry and the frozen diagnostics; it
does not assign game state, storage, positions, resources, or event handlers.
It bypasses service-worker interception to identify the supplied build; this
is not an offline or installed-PWA proof.

At `NATIVE_COLOR`, the script waits up to 60 seconds for an actual color change.
Chromium's native color popup is outside page CDP input. Inspect the isolated
workspace screenshot and use window-scoped native input to choose a different
coat color and dismiss the popup. The successful run used those real native
clicks; it did not synthesize an input event or set the value from JavaScript.

Machine-readable results and screenshots are written under
`.dream-loop/universe-qa/`. The authoritative run is `results.json`; old `FAIL-*`
files, if present, belong to earlier attempts. Useful visual evidence includes:

- `01-title.png`, `01-mobile-title.png`, `02-mobile-creator.png`
- `02-customized-life.png`, `03-arrived-life.png`
- `04-leave-body-confirmation.png`, `04-galaxy.png`
- `06-host-invitation.png`, `07-link-visitor.png`
- `08-mobile-creator.png`, `09-mobile-world.png`

This verifies the reported Chromium flows. It does not establish iOS install
behavior, real-device touch ergonomics, public internet NAT traversal, or
availability of an optional world node.
