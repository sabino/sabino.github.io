# Screen design repairs

Implementation by a different agent from the reviewer of [SCREEN-DESIGN-AUDIT.md](SCREEN-DESIGN-AUDIT.md), 2026-09-11. The existing pixel art, bronze window bevels and physical paper notebook are retained.

| Review  | Repair                                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01–A03 | Bounded dialog frames, persistent heading/close/footer, one task body, retained Life navigation, sections and paginated card groups. New disciplines start at the beginning.                                                               |
| A04     | Mobile Satchel contains inventory, tools, preparation and selected-item detail. Profile, map and quest are excluded from the drawer. Its own close button remains visible.                                                                 |
| A05     | Short desktop sidebar uses six explicit rows so status, chart, objective, pack, roster and footer fit. Selected item details are displayed rather than hidden by old CSS.                                                                  |
| A06     | Generation-four HUD, atlas, notebook, callings, household and weather derive from the resident and world. Private history, commitments and actual acquaintances replace Theo’s diary. Theo’s original experience remains generation three. |
| A07     | Principal mobile controls use 44px targets. Character creation separates Life and Appearance, with acceptance outside the scrolling body. Safe-area space is reserved.                                                                     |
| A08     | Paper typography is scoped independently of radio windows. Handwriting is the default; plain type is deliberate. The cover still opens, folds and can be put away. Book navigation and close controls stay above the scrolling leaf.       |
| A09     | Trade has Buy/Sell tabs, a selectable list, actual procedural weapon preview/materials/stats, quantity and displayed total price. Weapon families appear first. Gear lists individual body-owned records and equips their exact identity.  |
| A10–A12 | Camera controls explicitly say World zoom. The local chart expand button is named. Mobile atlas offers Places & mark separately. Galaxy labels disclose progressively and avoid collisions; changing sector changes the selected signal.   |
| A13     | Room code and scannable QR share one compact region. Full URL is expandable; roster and emotes are compact. Existing code/link sharing and host persistence are preserved.                                                                 |
| A14     | Clothing uses one front/back full-body preview and a pattern selector. Unavailable premium shops hide wallet recovery. Payment activation remains unchanged.                                                                               |
| A15     | Production has persistent Build/My work tabs, actual platform thumbnails, readable phases, distance, batch progress, inputs and output. Existing collect/retry/track actions remain available.                                             |
| A16–A17 | Touch help and a visible More action menu expose equipment, notebook, supplies, atlas and phrases. Shared channel selection synchronizes `/say` and `/room` with button states. Phrase editing includes explicit touch Send controls.      |
| A18     | Item controls name their item/count/action, tabs expose selected state, and Tab loops exclude disabled controls and include conversations. Dialogs restore an available invoking control.                                                  |
| A19     | AI availability is stated before optional advanced setup. The setup notes are linked as a packaged artifact. No unavailable inference is implied.                                                                                          |
| A20     | Shared square panels, progress bars, pressed states, readable labels and consistent ink colors replace conflicting default controls.                                                                                                       |

## Verification

The normal-flow replay recorded 207 captures across desktop, mobile and compact laptop, including 197 main-flow states, all 18 legacy journal entries, four plant studies, all nine Life disciplines, character creation, room hosting and inventory. It completed with no console errors. An initial source-HMR interruption at the start of mobile was rerun against frozen preview 4174; the completed result is `.dream-loop/screen-fixes/observations.json`.

The separate, conspicuously labeled visual review source on local 4179 recorded 98 gated captures, with no exceptions or runner failure. This includes conversations, merchant, campaign encounters, both endings, home planting and growth, death/recovery, production phases, and Compact stages/outcomes. These fixtures are presentation coverage, not proof that their state was earned during this pass. Results are `.dream-loop/screen-fix-fixtures/observations.json`.

The passes exposed additional short-sidebar, item-detail, book-header and compressed trade-row issues; those were corrected. The final generated-life replay adds strict viewport, visible-close, correct-identity, item-detail, notebook-folding and laptop-sidebar assertions. Its result is `.dream-loop/screen-final/observations.json` once completed.

Native OS install sheets, external real-money checkout/recovery, model inference, and every possible procedural dialogue are outside these screenshot claims. The prepared payment and optional companion availability boundaries remain explicit in the UI.
