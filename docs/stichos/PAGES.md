# Published Verso and source status

Play at **https://sabino.pro/games/verso/**.

The last independently verified public deployment recorded here serves the static build from `sabino/sabino.github.io`, branch `master`, directory `games/verso`. Release commit: `3db0182ca7fc1b21c9ee1e6db815edfafcd7be52`. The successful deployment is [run 34571768214](https://github.com/sabino/sabino.github.io/actions/runs/34571768214). Only the 24 files under that directory changed; the portfolio, CNAME and Pages configuration were preserved.

The game entry is `assets/app-CxKixEoO.js`; browser rooms load `assets/peer-transport-BB1VMhiR.js`. The content-versioned offline worker is `2cb83e93797ae90d0db9`, with 23 cached assets. Public JavaScript, manifest and service-worker bytes match the local tested build; hashes are recorded in `.dream-loop/pages-assets.json`.

That deployment predates the current unique-life entry. The newer source provides **Room**, code/link/QR invitations, resident creation, a galaxy and constructed production. [Current source behavior](UNIVERSE.md) and [current local verification](QA.md) are separate from the public asset hashes above. An online browser host or separately operated node is still needed for shared play; static Pages hosting alone does not run a world authority or model service.

Life progress belongs to its browser and origin. The current main UI has no routine save download/import workflow, so localhost and published lives do not automatically transfer. Continue the same origin/profile to retain a life; clearing site data removes that local continuity. The static edition displays premium cosmetic previews with purchasing disabled; payment-provider setup is still required on the separately prepared backend. See [PAYMENTS.md](PAYMENTS.md).

The recorded older production build passed 315 automated tests before that publication. Real browser checks covered the public game, mobile Compact interface, cosmetic status and cooperative combat. The exact subpath also passed the then-present JSON download/import controls, rejection of invalid saves, and service-worker offline continuation and movement. Those file-control checks are historical; the newer source uses continuing-life autosaves. Browser evidence lives under `.dream-loop/stichos-release-pages`, `.dream-loop/stichos-peer-rooms` and `.dream-loop/stichos-storage`.

The complete main investigation and Winter Compact provide 48 resolved objectives and continuing life activities. A fast action-only simulation took 3.548 hours; four hours of human play is not verified. This release does not claim a full reproduction of Vagabond, a wrapping globe, an authoritative MMO economy or active real-money billing.

The source at `c667dfd` separately passed 345 tests, formatting and build; its frozen app is `app-BsBd1dau.js`. Final browser acceptance and deployment of that newer checkpoint were pending when this record was updated.

For a later release, build with `npm run build`, test its relative `/games/verso/` paths, then replace only that directory in an up-to-date isolated checkout of the Pages repository. Commit and push `master`, monitor Pages deployment, and verify the new public asset identities and browser save/offline behavior.
