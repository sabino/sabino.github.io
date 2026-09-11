# Generation-four equipment and persistence QA

Verified on 11 September 2026 against the current source in the isolated `verso-art-qa` browser workspace. The game UI was not modified by these transport fixtures.

## Results

- **43 automated network tests passed.** Real WebSocket clients joined an electronic generation-four world, replicated exact equipment addresses up to `0x4ffffffff`, inflicted the generated weapon's actual damage, saved signed world changes, restarted the authority, and resumed the original authenticated identity and pending combat receipts. The wounded enemy kept its exact health and equipment after becoming active again.
- **Unarmed clothing context passed over real sockets.** Optional `Appearance.technology` values 0–3 survive peer copying, generation and life selection. Malformed context values cannot replace a valid appearance. Empty-handed ordinary attacks remain rejected; the existing defensive ward still works. Old unarmed hostile NPCs now use short physical striking reach without crashing or inventing a staff.
- **Profile-cache separation passed.** Four technology addresses sharing identical lower 32 bits produced their own expected projectile damage, range and color. Checkpoints restored those released projectiles exactly.
- **Eight actual PeerJS/WebRTC clients passed seven browser checks.** The generation-four run completed in 7.55 seconds, retained every exact 35-bit equipment address and clothing tier, reassembled identical 22,030-byte combat frames, verified 21,853-byte signed public checkpoints, and checked fresh nonce proofs against the actual host DTLS fingerprints. Interrupting the host's signaling socket recovered without replacing live room sessions or issuing duplicate welcome messages.
- **Five native Pear integration tests passed.** A generation-four hostile's actual electronic equipment, clothing tier and wounds replicated between two native Hypercore/Hyperswarm nodes over a local test DHT. Both nodes restarted from disk and continued the same signed feed. Existing signature, authorization, public-schema, rollback and capacity tests also passed.

Browser evidence is in `.dream-loop/stichos-peer-transport-g4/fixture.json` and `fixture.png`. All eight fixture transports closed, the temporary WebSocket observer was restored, and the fixture browser context was disposed. The first runner attempt did not start because its button lacked focus; adding focus emulation corrected the harness before the successful network run.

## Repeat

```
node --experimental-strip-types --test tests/stichos-generation4-network.test.ts tests/stichos-shared-combat.test.ts tests/stichos-multiplayer.test.ts tests/stichos-room-persistence.test.ts
node scripts/browser-peer-transport.mjs <verified-workspace-CDP> http://localhost:4174/ 4
cd pear-node
node --experimental-strip-types --test test/bridge.test.mjs
```

The browser fixture loads its TypeScript page from the source server on port 4173; the optional final argument chooses geography 4 or the established geography-3 stress fixture.

## Limits

These tests demonstrate interoperability, deterministic reconstruction, authenticated host continuity and replication—not a permanent public hosting service or automatic host migration. The native test used a local DHT, so it does not establish Internet NAT reachability. Signed host checkpoints retain the existing authority trust model; they do not by themselves prove that a client legitimately acquired every cosmetic or item it advertises. Personal inventory remains body-owned game state rather than a globally authoritative economy.
