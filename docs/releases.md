# The traveler’s bulletin

Release notes are a bundled, source-controlled part of Verso. `src/announcements-data.ts`
contains player-facing records, not downloaded marketing content. The title screen and
game menu open the same accessible bulletin. The newest entry starts expanded; native
`details` controls let keyboard, touch and assistive-technology users open older entries.
The existing application dialog supplies its heading, focus trap, Escape handling,
background inertness and focus restoration. The Return control remains in its fixed
footer. On small phones, category labels stack above their descriptions.

## Identity, reading and offline behavior

Vite embeds `package.json`'s real version, the source HEAD revision and source date,
and whether the working tree contains local changes. `scripts/build-metadata.mjs`
reads only package metadata and Git identity; it does not inspect environment secrets
or deployment settings. Source archives without Git say `unversioned`. This is the
running bundle's identity, not a promise that the latest production version is installed.
Rebuild after committing to embed the exact clean source revision. The existing offline
builder includes the JavaScript and optional project artwork in its content-based cache.
Reading never requires a network request and works in the installed offline application.

Read state lives only in `verso.announcements.read.v1`, separate from lives, saves,
rooms and authority data. Opening the panel marks the bundled entries read. Each key
combines an entry ID and a small non-security content fingerprint. Rebuilding unchanged
notes does not nag again. New or materially corrected notes are unread. At most 256
keys are retained; schema/size validation bounds malformed storage. If storage is blocked
or full, reading remains quiet for the current session; a later browser session may show
the badge again. No automatic popup, notification, analytics, audio or network message
is generated. Optional artwork must use `./release-art/<name>.png|webp|svg` and alt text;
only add artwork owned by the project or documented with an appropriate license.

## Honest historical backfill

The package stayed at `0.1.0` across these milestones, so notes identify the actual
source checkpoint instead of inventing semantic versions. Dates below use the recorded
publication day in repository documentation and matching commit dates. Several releases
occurred on the same day; they remain separate milestones instead of invented weeks.

| Bulletin entry                                | Proven shipped behavior                                                                                                   | Source and publication evidence                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12 September: physical sound and voice repair | Recorded terrain/action Foley, revised soundscape, actionable room/mic setup and explicit speaking button                 | `6a99b8a`, `c7255bd`, `245e105`, `e6063ea`; [published client record](stichos/PAGES.md), [audio provenance](AUDIO.md), [voice behavior](VOICE.md); deployed source `e6063ea9a074e34e9c0baa45ec115016fe384fa0` / Pages `9209920590f71976d81caf8b4756f8d303d7c34b` is the task's verified production baseline. |
| 12 September: living world and spatial voice  | Separate authenticated voice, day/night, wildlife, traits/routines, touch communication and app-mode diagnostics          | `e4ebc07`, `1c95310`, `9c7ade0`, `408b1b0`; [verification](VERIFICATION-2026-09.md), [living-world mechanics](stichos/LIVING-WORLD.md), and the deployed voice-enabled baseline above.                                                                                                                       |
| 12 September: persistent hosting              | Rooms survive creator departure; planet-aware invitations, public frequencies and room chat                               | `aa36cee`, `ce11692`, `bd483d2`, `cc7fd61`; [hosted-room public verification](stichos/ROOM-CONNECTIVITY.md#hosted-node-verification--2026-09-12), [Pages deployment record](stichos/PAGES.md).                                                                                                               |
| 11 September: generated civilizations         | Cultural architecture/clothing/ecology/equipment; personal lives and homes; paid solo labor                               | `ed6e070`, `59463eb`, `13a38eb`, `fcb0c64`, `9f2e631`; [generation-four public release](stichos/PAGES.md#earlier-browser-and-visual-verification), [generated lives](stichos/GENERATED-LIVES.md).                                                                                                            |
| 11 September: continuing lives                | Shared combat, production, persistent browser lives, install metadata, offline play and existing crafting/Compact content | `4ece94e`, `29d04ff`, `67737a9`, `c667dfd`, `f1eb035`; [public universe QA](stichos/UNIVERSE-RELEASE-QA.md), [offline QA](stichos/LIFE-OFFLINE-QA.md), [campaign and combat release QA](stichos/QA.md).                                                                                                      |

The first entry is explicitly **In this local build**. It describes only integrated
work, and is not a fabricated production release. Before publication, complete the
integration review, update its descriptions to the features actually verified, and
change its status/date/version only after the release is approved. Do not claim physical
iOS/Android installation, a global authoritative economy, end-to-end encrypted voice,
active real-money purchases or infinite populated worlds: those have not been verified.

## Integration contract and validation

Import `announcements.css` once. Create one `createAnnouncementInbox()` per page.
Use `inbox.buttonLabel()` for each title/menu control. To open it:

```ts
openModal('announcements', inbox.html());
disposeSpecial = inbox.mount(el('s-modal'), {
  onClose: () => (started ? showMenu() : title()),
  onRead: updateAnnouncementButtons,
});
```

Use the application's actual menu function name. The mount disposer removes its own
listener; application-owned dialog listeners remain untouched. Do not open another
modal while mounting or replace the mounted container in `onRead`. Root integration
owns opening routes and browser focus testing. The focused tests cover read/unread,
upgrades, storage corruption/denial, malformed records, bounded data, HTML escaping,
project-only artwork, disclosure markup, mount/disposal and actual build identity:

```sh
node --experimental-strip-types --test tests/announcements*.test.ts
```

Browser evidence must additionally exercise the title and in-game routes, native Tab /
Enter / Escape, focus return, 320px and 390px portrait layouts, all history disclosures,
and a cached offline reload. No third-party art, audio, branding or screenshots ship in
this feature.
