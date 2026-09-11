# Active simulation endurance

The opt-in runner completed **14,499.67 seconds of active movement simulation (4.03 hours)** across 43,499 additional tiles and 111 distinct towns after closed-door collision was enabled. It completed 80 local commissions, 114 clinic deliveries and 28 intersettlement dispatches; gathered 293 plants/material deposits, prepared 74 medicines, and made 125 purchases/sales. Seventy-two hostile raiders were defeated while traveling. The traveler remained alive in the original body.

This is an automated stability result for one seeded world, **not a measurement of human playtime, four hours of unique narrative, or player enjoyment**. The six-act investigation was already completed in the starting fixture. Its earlier 3,744.63 simulated seconds and 11,899 tiles are excluded from these totals.

## What the runner actually does

The planner reads generated terrain and collision, then moves through ordinary `game.update` inputs to actual towns, plants, benches and people. It may plan a route through an interactable door, but must approach within 1.65 tiles, open it with `game.interact`, and verify its actual collision cell is clear before walking through. Gathering, equipment selection, crafting, trade, combat and choices also use public session methods. No player positions, resources, currency, mission progress or world changes are assigned directly. Each additional commission requires fresh fieldwork or preparation before its real issuing noticeboard pays; dispatches require traveling to their actual recipients. The courier declined 34 watch/garden commissions without receiving payment.

Only updates with nonzero movement input that actually advanced the body count toward the four-hour target. The successful run had 86,998 updates and no stationary or blocked padding. One necessary rest added 30 seconds to the world clock; those seconds are explicitly excluded. The model ran in about 72 seconds of wall-clock time; it did not wait four physical hours.

Twenty-four checkpoints serialized the ongoing life and restored every persisted gameplay field exactly. Two restores refreshed exploration around the current footing since the last periodic sight update; no existing knowledge was lost. A second round trip at each checkpoint was exact including that settled exploration state. The final save was 457,559 bytes compact or 829,370 bytes with normal formatting, below the UI's 8 MiB import limit. The world terrain cache never exceeded its 160-chunk bound. The final atlas retained 2,648 visited chunks and 164 discovered sites, including knowledge acquired before this run.

Source hashes, starting-fixture provenance, elapsed times, consumables, action counts, checkpoints, final location and save sizes are in [results.json](../../.dream-loop/stichos-endurance/doors/results.json). The generated [report](../../.dream-loop/stichos-endurance/doors/REPORT.md) and [final save](../../.dream-loop/stichos-endurance/doors/final-save.json) are retained as ignored local evidence. The initial pilot and earlier completed passes remain separate evidence where available.

## Repeat

The runner does nothing unless explicitly given `--run`. With Node 26 and dependencies installed:

```sh
# Generate an action-earned fixture if the local evidence directory is absent.
VERSO_QA_FIXTURES=1 node --experimental-strip-types --test \
  --test-name-pattern='a whole generation-three campaign' tests/stichos-campaign.test.ts

# Optional short route check, then the four-hour active simulation.
node scripts/endurance-stichos.mjs --run --hours 0.05 --label pilot
node scripts/endurance-stichos.mjs --run --hours 4 --label doors
```

`--fixture PATH` selects another valid completed-campaign save. `--hours` accepts a positive duration up to 24, and the report always states the requested and achieved duration. The runner has a 20-minute wall-clock cutoff; any route, survival, save or bound failure produces a failed report with its actual partial progress rather than a completed-duration claim.

The test samples session behavior and generated-world persistence. It does not benchmark browser rendering, audio, long-lived WebSocket rooms or payments. Those have separate browser and server checks.
