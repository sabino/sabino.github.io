# Simulation robustness checks

These deterministic Node harnesses exercise the real game simulation without rendering or a browser. They supplement the unit tests and [browser QA](QA.md).

From the repository root, using the Node version specified in the [README](../README.md):

```sh
node scripts/simulation-soak.mjs
node scripts/reincarnation-soak.mjs
```

Both commands create their results under the repository's ignored `.dream-loop/` directory, independent of the shell's current directory. They print progress and a final JSON summary, exit unsuccessfully on an assertion or restore failure, and save the failing crossing for inspection.

## Recorded runs

The successful runs on 2026-09-10 produced:

| Harness                  | Coverage                                                                                                                      | Observed result                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `simulation-soak.mjs`    | 32 seeds; deterministic wandering, mission navigation, analog movement, combat, scanning, mending, and occasional long frames | 1,728,000 update calls; 18,951 save/restore checks; 1,127 mission transitions; 2,154 kills; 4,767 mends; about 8.1 cumulative simulated hours |
| `reincarnation-soak.mjs` | Walk to the sentinel, wait for natural host death, restore the dead crossing, and reincarnate                                 | 260 deaths and restores; 80,600 update calls; about 66.8 simulated minutes; 7 entities remaining                                              |

The mixed simulation checks live numeric values for finiteness, host ground collision, and preservation of mission, health, shards, and integrity through restoration. It includes the corporate revelation and continuing expeditions. The reincarnation run uses ordinary movement and enemy attacks; it does not directly lower health or teleport the host.

Reports are written to `.dream-loop/simulation-soak-results.json` and `.dream-loop/reincarnation-soak-results.json`. On failure, the corresponding `simulation-soak-failure.json` or `reincarnation-soak-failure.json` contains the crossing and failure context. Historical failure files are not removed by a later successful run; check the report timestamp and command exit status.

## Failure found and fixed

The original reincarnation run failed on the 196th natural death, after roughly 50 simulated minutes. Each empty death marker remained in the world, eventually producing 201 entities and exceeding the save validator's 200-entity limit. The game could therefore generate a save it could not restore.

The simulation now keeps only the latest empty death marker and preserves every drop containing shards. Restoration also compacts obsolete empty markers in older version 1 saves. Regressions cover 220 successive host losses and a legacy save containing 250 empty markers plus valuable belongings.

Valuable drops remain bounded by their finite sources: at most one carried shard bank, three species rewards, four enemy rewards, and three one-time relay rewards in a world. Recovery removes a drop, mending consumes shards, and reincarnation does not renew reward sources. With the latest empty marker and mission actors, normal play needs at most 23 entities.

## Limits

The mixed run restores every 97 update calls. Restoration grants brief connection invulnerability, so this run had no host deaths and is not a combat difficulty assessment. The separate reincarnation run restores after death and covers that missing case.

These fixed action sequences do not exhaust every route, seed, or possible input. They do not test rendering, sound, browser storage failures, physical controllers, or real-time performance. Browser QA and ordinary play remain separate checks; simulated hours are not wall-clock playtest hours.
