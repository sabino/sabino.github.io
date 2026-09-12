# Voice, mobile, atmosphere and living-world integration

Local implementation branch: `feat/voice-mobile-living-world`, starting at `cc7fd61`.
The starting working tree was clean. Work is additive; no reset, stash or clean is used.
Deployment and production configuration are outside this change's authorization.

## Ownership

The lead integrates and commits. Specialists do not stage or commit shared files.

| Lane                 | Exclusive files during implementation                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A — voice/networking | Server voice/coop/config; room authority and protocol; multiplayer; voice controller/protocol/acoustics; voice tests/docs |
| D — living world     | Session, renderer, world types; world-time, world-signals, living-world/fauna/NPC modules; living-world tests/docs        |
| C — atmosphere       | AudioDirector and new audio/atmosphere modules; audio tests/docs                                                          |
| Lead                 | Voice UI, integration harness, this record; app integration after explicit handover                                       |
| B — mobile           | App/CSS/install/mobile modules and responsive tests, after its ownership handover                                         |

There are three concurrent specialist slots, so B follows the first completed specialist.
Reviewers receive read-only ownership; fixes are assigned back to the responsible owner.

## Shared contracts

- World coordinates use tiles, east-positive X and south-positive Y. Renderer's default
  scale is 36 CSS pixels per tile; zoom never changes gameplay or hearing distance.
- `worldTimeAt(seconds)` supplies day, local hour, phase, daylight and nightness.
  One local day takes 1,440 real seconds, starting at 08:00. Hosted time comes from
  a persisted room epoch, advanced by the server; the browser extrapolates monotonically.
  Solo time belongs to the saved life. Neither changes procedural generation seeds.
- `worldLocationAt(world, point, removed)` supplies biome, interior/building kind,
  architecture/ecology, settlement state and bounded feature distances. Consumers sample
  at most twice a second. Existing worlds have no dynamic weather simulation: `clear`
  is explicit rather than inferred from decorative particles.
- `AudioDirector.setEnvironment(location,time)` selects atmosphere;
  `playWorldEvent(event)` consumes ecological/activity cues;
  `setVoiceActivity(active)` gently ducks game sound. Voice owns a separate context.
- `SpatialVoice` binds to the established multiplayer session and owns `/voice` only.
  UI consent, press/release, settings and status pass through its public methods.
  Its server receives and forwards ephemeral encoded frames, never a checkpoint field.

## Completion evidence

Commands, evidence, review findings and limitations are recorded after integration in
the lane documentation and final verification record. Passing a browser emulation
test does not substitute for Safari/Android hardware, microphone or Bluetooth testing.
