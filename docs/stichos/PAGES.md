# Published Verso

Play at **https://sabino.pro/games/verso/**.

GitHub Pages serves the static build from `sabino/sabino.github.io`, branch `master`, directory `games/verso`. Release commit: `3db0182ca7fc1b21c9ee1e6db815edfafcd7be52`. The successful deployment is [run 34571768214](https://github.com/sabino/sabino.github.io/actions/runs/34571768214). Only the 24 files under that directory changed; the portfolio, CNAME and Pages configuration were preserved.

The game entry is `assets/app-CxKixEoO.js`; browser rooms load `assets/peer-transport-BB1VMhiR.js`. The content-versioned offline worker is `2cb83e93797ae90d0db9`, with 23 cached assets. Public JavaScript, manifest and service-worker bytes match the local tested build; hashes are recorded in `.dream-loop/pages-assets.json`.

Choose **Together → Browser-hosted room** for cooperative play. The host keeps the tab open; visitors use its seed, geography version and room code. Shared battles, resource claims and doors use the same portable authority as the optional dedicated server. Browser-local saves, inventory and story remain personal.

Save progress belongs to an origin. To move an existing localhost journey, choose **Pause → Download save** locally, then **Pause → Restore a save** on the published site. The static edition displays premium cosmetic previews with purchasing disabled; payment-provider setup is still required on the separately prepared backend. See [PAYMENTS.md](PAYMENTS.md).

The production build passed 315 automated tests before publication. Real browser checks covered the public game, mobile Compact interface, cosmetic status and cooperative combat. The exact subpath also passed actual JSON download/import, rejection of invalid saves, and service-worker offline continuation and movement. Browser evidence lives under `.dream-loop/stichos-release-pages`, `.dream-loop/stichos-peer-rooms` and `.dream-loop/stichos-storage`.

The complete main investigation and Winter Compact provide 48 resolved objectives and continuing life activities. A fast action-only simulation took 3.548 hours; four hours of human play is not verified. This release does not claim a full reproduction of Vagabond, a wrapping globe, an authoritative MMO economy or active real-money billing.

For a later release, build with `npm run build`, test its relative `/games/verso/` paths, then replace only that directory in an up-to-date isolated checkout of the Pages repository. Commit and push `master`, monitor Pages deployment, and verify the new public asset identities and browser save/offline behavior.
