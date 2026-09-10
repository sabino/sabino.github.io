import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Game, ISO_Y, distance, isWalkable } from '../src/game.ts';

// Resolve artifacts from this script, so commands also work outside the repository.
const OUTPUT_DIRECTORY = new URL('../.dream-loop/', import.meta.url);
mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

const idle = { x: 0, y: 0, running: false, aim: { x: 1000, y: 500 } };
function route(from, target) {
  const nodes = [{ x: from.x, y: from.y, parent: -1, i: 0, j: 0 }],
    seen = new Set(['0,0']);
  let goal = -1;
  for (let head = 0; head < nodes.length && head < 7000; head++) {
    const n = nodes[head];
    if (distance(n, target) < 55) {
      goal = head;
      break;
    }
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      const i = n.i + di,
        j = n.j + dj,
        key = `${i},${j}`,
        p = { x: from.x + i * 24, y: from.y + j * 24 * ISO_Y, parent: head, i, j };
      if (
        !seen.has(key) &&
        isWalkable(p, 18) &&
        isWalkable({ x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 }, 18)
      ) {
        seen.add(key);
        nodes.push(p);
      }
    }
  }
  assert.ok(goal >= 0);
  const points = [];
  for (let i = goal; i > 0; i = nodes[i].parent) points.unshift(nodes[i]);
  return points;
}
let game = new Game('Long lived identity', 0x71a3),
  frames = 0,
  restores = 0;
const started = performance.now();
const startedAt = new Date().toISOString();
try {
  for (let life = 1; life <= 260; life++) {
    const enemy = game.state.entities.find((e) => e.kind === 'enemy');
    const path = route(game.state.player, enemy);
    for (const target of path) {
      for (
        let i = 0;
        distance(game.state.player, target) > 3 && i < 120 && game.state.phase === 'playing';
        i++
      ) {
        const p = game.state.player,
          d = distance(p, target);
        game.update(Math.min(1 / 60, d / 180), {
          ...idle,
          x: (target.x - p.x) / d,
          y: (target.y - p.y) / ISO_Y / d,
        });
        frames++;
      }
    }
    for (let i = 0; i < 1800 && game.state.phase === 'playing'; i++) {
      game.update(0.1, idle);
      frames++;
      game.drainEvents();
    }
    assert.equal(game.state.phase, 'dead', `life ${life} did not naturally end`);
    game = Game.restore(game.serialize());
    restores++;
    game.reincarnate();
    if (life % 25 === 0)
      console.log(
        JSON.stringify({ life, entities: game.state.entities.length, time: game.state.time }),
      );
  }
  const report = {
    status: 'PASSED',
    started: startedAt,
    finished: new Date().toISOString(),
    lives: 260,
    frames,
    restores,
    entities: game.state.entities.length,
    time: game.state.time,
    wallSeconds: (performance.now() - started) / 1000,
  };
  writeFileSync(
    new URL('reincarnation-soak-results.json', OUTPUT_DIRECTORY),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (error) {
  writeFileSync(
    new URL('reincarnation-soak-failure.json', OUTPUT_DIRECTORY),
    JSON.stringify(
      {
        vessel: game.state.player.vessel,
        frames,
        restores,
        error: String(error),
        stack: error.stack,
        save: game.serialize(),
      },
      null,
      2,
    ),
  );
  console.error(
    JSON.stringify({
      status: 'FAILED',
      frames,
      restores,
      error: String(error),
      entities: game.state.entities.length,
      time: game.state.time,
    }),
  );
  throw error;
}
