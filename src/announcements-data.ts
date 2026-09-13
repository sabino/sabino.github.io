import type { AnnouncementEntry } from './announcements.ts';

/** Player-facing records. Evidence and publication rules live in docs/releases.md. */
export const RELEASE_NOTES: readonly AnnouncementEntry[] = [
  {
    id: 'portrait-action-preview-1',
    version: '0.1.0',
    date: '2026-09-12',
    title: 'Take the field',
    status: 'development',
    changes: [
      {
        category: 'New',
        description:
          'A release notebook on the start screen and game menu keeps the latest changes close at hand, even offline.',
      },
      {
        category: 'Improved',
        description:
          'Portrait play has a two-thumb movement stick, held strikes, weapon techniques and quick steps. Mirror the controls or use direction buttons in settings.',
      },
      {
        category: 'New',
        description:
          'Six weapon techniques add sweeping strikes, piercing flights and botanical pulses. Second techniques unlock at level four; movement can interrupt preparation.',
      },
      {
        category: 'New',
        description:
          'Find Field expeditions in More: clear a provision road, confront a relay warden or investigate a troubled garden. Bring supplies back for generated equipment and one of three combat lessons.',
      },
      {
        category: 'Improved',
        description:
          'Readable enemy warnings, weapon trails, hit reactions and brief loot effects give actions weight. Effect intensity and reduced motion keep the field clear.',
      },
      {
        category: 'Fixed',
        description:
          'Movement continues while shared attacks are acknowledged. Leaving a room cancels prepared attacks, and older rooms keep their existing combat controls.',
      },
    ],
    evidence: [],
  },
  {
    id: '2026-09-12-physical-sound-voice',
    version: '0.1.0 · e6063ea',
    date: '2026-09-12',
    title: 'Hear the ground beneath your feet',
    status: 'released',
    changes: [
      {
        category: 'Improved',
        description:
          'Recorded footsteps follow the terrain. Woodcutting, mining, bow releases, impacts, doors and pickups follow actual accepted actions.',
      },
      {
        category: 'Improved',
        description:
          'Natural field recordings and instrument textures bring wind, water, wildlife, fire and local music into the soundscape.',
      },
      {
        category: 'Fixed',
        description:
          'Voice setup explains how to enter a shared room and enable your microphone. Hold to talk now shows a clear Talking state.',
      },
    ],
    evidence: ['6a99b8a', 'c7255bd', '245e105', 'e6063ea'],
  },
  {
    id: '2026-09-12-living-world-voice',
    version: '0.1.0 · 408b1b0',
    date: '2026-09-12',
    title: 'A world that wakes, listens and answers',
    status: 'released',
    changes: [
      {
        category: 'New',
        description:
          'Whisper, speak or shout to nearby room members with spatial push-to-talk, personal volume controls and blocking.',
      },
      {
        category: 'New',
        description:
          'A shared day and night cycle shapes wildlife, local activity and individual NPC routines. Observe animals and learn who lives around you.',
      },
      {
        category: 'Improved',
        description:
          'Touch-first quick phrases, bounded phone panels and installed-app diagnostics make room communication easier without a keyboard.',
      },
    ],
    evidence: ['e4ebc07', '1c95310', '9c7ade0', '408b1b0'],
  },
  {
    id: '2026-09-12-persistent-world-hosting',
    version: '0.1.0 · cc7fd61',
    date: '2026-09-12',
    title: 'Your room outlives its first traveler',
    status: 'released',
    changes: [
      {
        category: 'New',
        description:
          'Hosted worlds retain shared changes after the creator leaves. Planet-aware room codes, invitation links and QR codes bring friends to the same place.',
      },
      {
        category: 'Improved',
        description:
          'Public planet frequencies, bidirectional room chat and reconnecting identities work through the persistent world node.',
      },
    ],
    evidence: ['aa36cee', 'ce11692', 'bd483d2', 'cc7fd61'],
  },
  {
    id: '2026-09-11-generated-civilizations',
    version: '0.1.0 · 9f2e631',
    date: '2026-09-11',
    title: 'Different planets. Different ways to live.',
    status: 'released',
    changes: [
      {
        category: 'New',
        description:
          'Seeded civilizations shape architecture, clothing, technology, ecology and ordinary equipment instead of sharing a single cultural template.',
      },
      {
        category: 'New',
        description:
          'Generated residents have their own profession, relationships, obligations and an actual home. Household workers perform paid resource gathering in solo worlds.',
      },
      {
        category: 'Improved',
        description:
          'Settlements have coherent gardens, groves, road shoulders and residential interiors. Earlier world generations keep their established terrain.',
      },
    ],
    evidence: ['ed6e070', '59463eb', '13a38eb', 'fcb0c64', '9f2e631'],
  },
  {
    id: '2026-09-11-continuing-lives',
    version: '0.1.0 · f1eb035',
    date: '2026-09-11',
    title: 'Carry on where you belong',
    status: 'released',
    changes: [
      {
        category: 'New',
        description:
          'Choose a generated life, build physical production and share a planet with friends. Cooperative enemies keep their wounds and defeats across reconnects.',
      },
      {
        category: 'Improved',
        description:
          'Installable app metadata and offline caching let a returning browser life continue without a connection after the game has loaded.',
      },
      {
        category: 'New',
        description:
          'Combat, real tools, finite resource gathering, crafting and the optional Winter Compact campaign give discoveries practical consequences.',
      },
    ],
    evidence: ['4ece94e', '29d04ff', '67737a9', 'c667dfd', 'f1eb035'],
  },
];
