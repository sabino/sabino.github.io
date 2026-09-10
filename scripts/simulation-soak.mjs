import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Game, ISO_Y, PORTAL, distance, isWalkable } from '../src/game.ts';

// Resolve artifacts from this script, so commands also work outside the repository.
const OUTPUT_DIRECTORY = new URL('../.dream-loop/', import.meta.url);
mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

const seeds = [
  0,
  1,
  2,
  3,
  42,
  93,
  0x71a3,
  0xffffffff,
  ...Array.from({ length: 24 }, (_, i) => Math.imul(i + 123, 0x9e3779b9) >>> 0),
];
const framesPerSeed = 54000;
const report = {
  started: new Date().toISOString(),
  seeds: [],
  total: {
    frames: 0,
    restores: 0,
    deaths: 0,
    missions: 0,
    scans: 0,
    kills: 0,
    mends: 0,
    simulatedSeconds: 0,
  },
};
const started = performance.now();
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function route(from, target, reach = 75) {
  const nodes = [{ x: from.x, y: from.y, parent: -1, i: 0, j: 0 }],
    seen = new Set(['0,0']);
  let goal = -1;
  for (let head = 0; head < nodes.length && head < 7000; head++) {
    const n = nodes[head];
    if (distance(n, target) < reach) {
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
  if (goal < 0) return [];
  const points = [];
  for (let i = goal; i > 0; i = nodes[i].parent) points.unshift({ x: nodes[i].x, y: nodes[i].y });
  return points;
}
function targetFor(game, rng) {
  const s = game.state,
    ready = s.entities.find((e) => e.kind === 'portal' && e.active);
  if (ready) return ready;
  let candidates =
    s.mission % 3 === 0
      ? s.entities.filter((e) => e.kind === 'species' && !e.scanned)
      : s.mission % 3 === 1
        ? s.entities.filter((e) => e.kind === 'relay' && e.order === s.relays.length)
        : s.entities.filter((e) => e.kind === 'survivor' && e.state === 'waiting');
  if (s.mission % 3 === 2 && !candidates.length) return PORTAL;
  if (rng() < 0.2)
    candidates = s.entities.filter((e) => ['species', 'relay', 'drop'].includes(e.kind));
  candidates.sort((a, b) => distance(a, s.player) - distance(b, s.player));
  return candidates[0] || PORTAL;
}
function finiteState(value, path = 'state') {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} became nonfinite`);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) finiteState(v, `${path}.${k}`);
}
for (const seed of seeds) {
  let game = new Game('Long crossing', seed),
    rng = random(seed ^ 0x54455354),
    path = [],
    destination = null,
    mode = 'wander',
    angle = 0,
    restores = 0,
    deaths = 0,
    missions = 0,
    scans = 0,
    kills = 0,
    mends = 0;
  let frame = 0;
  const seedStarted = performance.now();
  try {
    for (; frame < framesPerSeed; frame++) {
      if (game.state.phase === 'dead') {
        Game.restore(game.serialize());
        restores++;
        deaths++;
        game.reincarnate();
        path = [];
      } else if (game.state.phase === 'complete' || game.state.phase === 'reveal') {
        Game.restore(game.serialize());
        restores++;
        missions++;
        game.nextMission();
        path = [];
      }
      const p = game.state.player;
      if (frame % 240 === 0 || !destination) {
        mode = rng() < 0.72 ? 'assignment' : 'wander';
        destination = targetFor(game, rng);
        path = mode === 'assignment' ? route(p, destination) : [];
        angle = rng() * Math.PI * 2;
      }
      while (path.length && distance(p, path[0]) < 5) path.shift();
      let x = Math.cos(angle),
        y = Math.sin(angle);
      if (mode === 'assignment') {
        if (path.length) {
          const d = distance(p, path[0]);
          x = (path[0].x - p.x) / d;
          y = (path[0].y - p.y) / ISO_Y / d;
        } else {
          x = 0;
          y = 0;
          if (frame % 10 === 0) game.interact();
        }
      }
      const nearby = game.state.entities
        .filter((e) => e.kind === 'enemy' && (e.hp || 0) > 0 && distance(e, p) < 260)
        .sort((a, b) => distance(a, p) - distance(b, p))[0];
      const aim = nearby && rng() < 0.7 ? nearby : { x: p.x + x * 200, y: p.y + y * 120 };
      const dt = frame % 907 === 0 ? 0.2 : 1 / 60;
      const strength = frame % 600 < 90 ? 0.23 : 1;
      game.update(dt, { x: x * strength, y: y * strength, running: frame % 800 < 140, aim });
      if (frame % 19 === 0) {
        const action = rng();
        if (action < 0.22) game.action('blade', aim);
        else if (action < 0.44) game.action('pulse', aim);
        else if (action < 0.52) game.action('dash');
        else if (action < 0.7) game.action('scan');
        else if (action < 0.84) game.action('mend');
        else game.interact();
      }
      for (const event of game.drainEvents()) {
        if (event.type === 'scan') scans++;
        if (event.type === 'kill') kills++;
        if (event.type === 'mend') mends++;
      }
      if (frame % 97 === 0) {
        finiteState(game.state);
        const saved = game.serialize();
        assert.ok(isWalkable(saved.state.player), `host left ground at frame ${frame}`);
        const restored = Game.restore(saved);
        assert.equal(restored.state.mission, saved.state.mission);
        assert.equal(restored.state.player.hp, saved.state.player.hp);
        assert.equal(restored.state.player.fragments, saved.state.player.fragments);
        assert.equal(restored.state.integrity, saved.state.integrity);
        game = restored;
        restores++;
      }
    }
  } catch (error) {
    writeFileSync(
      new URL('simulation-soak-failure.json', OUTPUT_DIRECTORY),
      JSON.stringify(
        {
          seed,
          frame,
          mode,
          destination,
          error: String(error),
          stack: error.stack,
          save: game.serialize(),
        },
        null,
        2,
      ),
    );
    console.error(JSON.stringify({ status: 'FAILED', seed, frame, error: String(error) }));
    throw error;
  }
  const row = {
    seed,
    frames: frame,
    restores,
    deaths,
    missions,
    scans,
    kills,
    mends,
    time: game.state.time,
    host: game.state.player.vessel,
    entities: game.state.entities.length,
    wallSeconds: (performance.now() - seedStarted) / 1000,
  };
  report.seeds.push(row);
  for (const key of ['frames', 'restores', 'deaths', 'missions', 'scans', 'kills', 'mends'])
    report.total[key] += row[key];
  report.total.simulatedSeconds += row.time;
  console.log(JSON.stringify(row));
}
report.finished = new Date().toISOString();
report.wallSeconds = (performance.now() - started) / 1000;
writeFileSync(
  new URL('simulation-soak-results.json', OUTPUT_DIRECTORY),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ status: 'PASSED', ...report.total, wallSeconds: report.wallSeconds }));
