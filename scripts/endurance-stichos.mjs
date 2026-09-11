/** Opt-in active simulation endurance. Does not measure human playtime or unique story length. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Stichos, RECIPES } from '../src/stichos/session.ts';
import { STOP_SPACING } from '../src/stichos/world.ts';
const args = process.argv.slice(2);
if (!args.includes('--run')) {
  console.log(
    'Opt in: node scripts/endurance-stichos.mjs --run [--hours 4] [--label full] [--fixture PATH]',
  );
  process.exit(0);
}
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const hours = Number(option('--hours', '4'));
if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
  throw Error('Use a positive endurance duration of at most24hours.');
const root = fileURLToPath(new URL('../', import.meta.url));
const fixturePath = path.resolve(
  root,
  option('--fixture', '.dream-loop/campaign-fixtures/campaign-complete.json'),
);
const label = option('--label', hours >= 4 ? 'full' : 'pilot');
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a short alphanumeric report label.');
const directory = path.join(root, '.dream-loop/stichos-endurance', label);
fs.mkdirSync(directory, { recursive: true });
const input = fs.readFileSync(fixturePath);
let game = Stichos.restore(JSON.parse(input));
assert.ok(game.campaign.ending, 'Use the legitimately completed campaign fixture.');
const started = new Date(),
  wallStart = performance.now(),
  initial = game.save();
const initialDead = new Set(initial.npcs.filter((n) => n.hp <= 0).map((n) => n.id));
const metrics = {
  activeSeconds: 0,
  updateSeconds: 0,
  blockedSeconds: 0,
  updateCalls: 0,
  gathered: 0,
  crafted: 0,
  bought: 0,
  sold: 0,
  conversations: 0,
  commissions: 0,
  supplies: 0,
  dispatches: 0,
  withdrawn: 0,
  rests: 0,
  restSeconds: 0,
  uses: {},
  events: {},
  checkpoints: [],
  stops: [],
  routeFailures: 0,
  deaths: 0,
  bodyChanges: 0,
  maxCache: 0,
  maxSaveBytes: 0,
  footingExtensions: 0,
};
const visitedTowns = new Set(),
  initialDistance = game.distanceTraveled;
const versions = Object.fromEntries(
  [
    'src/stichos/session.ts',
    'src/stichos/world.ts',
    'src/stichos/progression.ts',
    'src/stichos/free-life.ts',
  ].map((f) => [
    f,
    createHash('sha256')
      .update(fs.readFileSync(path.join(root, f)))
      .digest('hex'),
  ]),
);
let nextCheckpoint = 600,
  failure;
function collectEvents(g) {
  for (const e of g.drainEvents()) metrics.events[e.kind] = (metrics.events[e.kind] ?? 0) + 1;
}
function consume(g, item) {
  const before = g.inventory[item] ?? 0;
  g.use(item);
  if ((g.inventory[item] ?? 0) < before) metrics.uses[item] = (metrics.uses[item] ?? 0) + 1;
  collectEvents(g);
}
function prepare(g, id) {
  const recipe = RECIPES.find((r) => r.id === id);
  const before = g.inventory[recipe.result] ?? 0;
  g.craft(id);
  assert.ok(
    (g.inventory[recipe.result] ?? 0) > before,
    'Crafting produces actual ' + recipe.result,
  );
  metrics.crafted++;
  collectEvents(g);
}
function advance(g, dt, input) {
  assert.ok(Math.hypot(input.x, input.y) > 0, 'Endurance never pads duration with idle input');
  const enemy = g.npcs
    .filter((n) => n.hostile && n.hp > 0 && distance(n, g.player) < 8)
    .sort((a, b) => distance(a, g.player) - distance(b, g.player))[0];
  if (enemy) {
    if (distance(enemy, g.player) < 3 && g.player.stamina > 25) g.ward();
    g.attack(enemy);
  }
  const before = g.time,
    p = { x: g.player.x, y: g.player.y };
  g.update(dt, input);
  const elapsed = g.time - before;
  metrics.updateSeconds += elapsed;
  metrics.updateCalls++;
  if (distance(p, g.player) > 1e-7) metrics.activeSeconds += elapsed;
  else metrics.blockedSeconds += elapsed;
  metrics.maxCache = Math.max(metrics.maxCache, g.world.cacheSize);
  collectEvents(g);
  if (g.phase === 'lost') metrics.deaths++;
  assert.equal(
    g.phase,
    'playing',
    'The active traveler must remain alive through supplied road travel',
  );
  if (performance.now() - wallStart > 20 * 60 * 1000)
    throw Error('Wall-clock safety limit reached; report is incomplete.');
}

// Route planner adapted from the independently played campaign test.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const key = (p) => `${p.x},${p.y}`;
function sustain(game) {
  if (game.player.cequinTime < 20 && game.player.breath < 65 && game.inventory.cequin)
    consume(game, 'cequin');
  if (game.player.warmth < 35) {
    if (game.inventory.tonic) consume(game, 'tonic');
    else if (game.inventory.rations) consume(game, 'rations');
  }
  if (game.player.hp < 60) {
    if (game.inventory.salve) consume(game, 'salve');
    else if (game.inventory.bandage) consume(game, 'bandage');
  }
  assert.equal(game.phase, 'playing', `The campaign must remain survivable at ${key(game.player)}`);
}
/** All travel uses movement input. Planning inspects public collision; no player or quest assignment. */
function walk(game, target, tolerance = 1.25) {
  game.choose('close');
  const start = { x: Math.round(game.player.x), y: Math.round(game.player.y) };
  const queue = [start],
    seen = new Set([key(start)]),
    prev = new Map();
  const doors = new Map(
    game.world
      .propsAround(start.x, start.y, 45)
      .filter((p) => p.kind === 'door')
      .map((p) => [key(p), p]),
  );
  let end;
  for (let i = 0; i < queue.length && i < 25000; i++) {
    const p = queue[i];
    if (distance(p, target) <= tolerance && !game.world.blocked(p.x, p.y, game.removed)) {
      end = p;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (
        seen.has(key(n)) ||
        Math.abs(n.x - start.x) > 60 ||
        Math.abs(n.y - start.y) > 60 ||
        (game.world.blocked(n.x, n.y, game.removed) && !doors.has(key(n)))
      )
        continue;
      seen.add(key(n));
      prev.set(key(n), p);
      queue.push(n);
    }
  }
  assert.ok(end, `No route from ${key(start)} to ${key(target)}`);
  const path = [];
  for (let p = end; key(p) !== key(start); p = prev.get(key(p))) path.unshift(p);
  for (const point of [start, ...path]) {
    const door = doors.get(key(point));
    if (door && !game.removed.has(door.id) && distance(game.player, door) < 1.8) {
      game.interact(door.id);
      game.choose('close');
    }
    for (let i = 0; distance(game.player, point) > 0.025 && i < 40; i++) {
      sustain(game);
      const dx = point.x - game.player.x,
        dy = point.y - game.player.y,
        d = Math.hypot(dx, dy);
      advance(game, Math.min(0.2, d / game.player.speed), {
        x: dx / d,
        y: dy / d,
        run: false,
      });
    }
    assert.ok(
      distance(game.player, point) < 0.05,
      `Movement stalled at ${key(point)} (current ${key(game.player)}, ${game.phase}, hp${game.player.hp})`,
    );
  }
}
function road(game, target) {
  const spacing = game.world.generation === 3 ? STOP_SPACING : 80;
  const axis = (v) => Math.round(Math.round(v / spacing) * spacing);
  const initial = { x: axis(game.player.x), y: axis(game.player.y) };
  // Vaults have an actual south approach. Exit through it before returning to roads.
  const currentSite = game.world
    .vaultsAround(game.player.x, game.player.y, 24)
    .find((v) => Math.abs(game.player.x - v.x) < 18 && Math.abs(game.player.y - v.y) < 18);
  if (currentSite) {
    walk(game, currentSite.entrance, 0.1);
    const south = Math.round((Math.floor(currentSite.y / spacing) + 1) * spacing);
    while (game.player.y < south - 1)
      walk(game, { x: currentSite.entrance.x, y: Math.min(south, game.player.y + 30) }, 0.1);
    initial.x = axis(game.player.x);
    initial.y = south;
  }
  while (distance(game.player, initial) > 45)
    walk(game, {
      x: game.player.x + Math.max(-30, Math.min(30, initial.x - game.player.x)),
      y: game.player.y + Math.max(-30, Math.min(30, initial.y - game.player.y)),
    });
  walk(game, initial, 0.1);
  const end = { x: axis(target.x), y: axis(target.y) };
  for (const p of [{ x: end.x, y: initial.y }, end]) {
    let count = 0;
    while (distance(game.player, p) > 0.2 && count++ < 150) {
      walk(
        game,
        {
          x: game.player.x + Math.max(-35, Math.min(35, p.x - game.player.x)),
          y: game.player.y + Math.max(-35, Math.min(35, p.y - game.player.y)),
        },
        0.1,
      );
    }
    assert.ok(distance(game.player, p) < 0.3, 'Road journey reaches its actual junction.');
  }
  while (distance(game.player, target) > 45)
    walk(game, {
      x: game.player.x + Math.max(-30, Math.min(30, target.x - game.player.x)),
      y: game.player.y + Math.max(-30, Math.min(30, target.y - game.player.y)),
    });
  walk(game, target);
}
function approach(game, target) {
  if (distance(game.player, target) > 50) road(game, target);
  else walk(game, target);
}
function click(game, target) {
  approach(game, target);
  game.interact(target.id);
  assert.equal(game.dialogue?.npcId, target.id);
  metrics.conversations++;
}
function gather(game, prop) {
  approach(game, prop);
  game.interact(prop.id);
  assert.ok(game.removed.has(prop.id), `Gathered ${prop.id}`);
  metrics.gathered++;
  collectEvents(game);
}
function stock(game, cost, town) {
  for (const [id, n] of Object.entries(cost)) {
    const item = id;
    while ((game.inventory[item] ?? 0) < n) {
      const recipe = RECIPES.find((r) => r.result === item);
      if (recipe) {
        stock(game, recipe.cost, town);
        if (item === 'lens') walk(game, { x: town.x + 4, y: town.y + 5 });
        prepare(game, recipe.id);
        continue;
      }
      const kind =
        item === 'wood' ? 'pine' : item === 'ore' ? 'rock' : item === 'rations' ? 'mushroom' : item;
      const candidates = game.world
        .propsAround(town.x, town.y, 55)
        .filter((p) => p.kind === kind && !game.removed.has(p.id))
        .sort((a, b) => distance(a, game.player) - distance(b, game.player));
      let success = false;
      for (const p of candidates) {
        try {
          game.equip('staff');
          gather(game, p);
          success = true;
          break;
        } catch (error) {
          if (game.phase !== 'playing') throw error;
        }
      }
      if (!success && ['cequin', 'heartleaf', 'emberroot', 'rations', 'bandage'].includes(item)) {
        const merchant = game.world
          .npcsAround(town.x, town.y, 24)
          .find((n) => n.role === 'merchant');
        assert.ok(merchant);
        click(game, merchant);
        const before = game.inventory[item] ?? 0;
        game.choose(`buy:${item}`);
        metrics.bought += (game.inventory[item] ?? 0) - before;
        collectEvents(game);
        game.choose('close');
        success = (game.inventory[item] ?? 0) > before;
      }
      assert.ok(
        success,
        `Enough actual ${kind} or trade funds exists near ${key(town)} (coins ${game.player.coins})`,
      );
    }
  }
  // Preparing lenses or medicine can consume another requested raw material.
  if (Object.entries(cost).some(([id, n]) => (game.inventory[id] ?? 0) < n))
    stock(game, cost, town);
}
export {};

function trade(g, town) {
  const merchant = g.world.npcsAround(town.x, town.y, 26).find((n) => n.role === 'merchant');
  if (!merchant) return;
  click(g, merchant);
  const keep = {
    cequin: 6,
    rations: 5,
    tonic: 2,
    salve: 2,
    bandage: 2,
    wood: 3,
    ore: 2,
    heartleaf: 3,
    emberroot: 3,
    lens: 0,
  };
  for (const [item, n] of Object.entries(g.inventory)) {
    const amount = Math.max(0, n - (keep[item] ?? 0));
    for (let i = 0; i < amount; i++) {
      const before = g.inventory[item] ?? 0,
        coins = g.player.coins;
      g.choose(`sell:${item}`);
      if ((g.inventory[item] ?? 0) >= before) break;
      assert.ok(g.player.coins > coins, 'Actual sale pays coins');
      metrics.sold++;
    }
  }
  if ((g.inventory.bandage ?? 0) < 2 && g.player.coins > 30) {
    const before = g.inventory.bandage ?? 0;
    g.choose('buy:bandage');
    metrics.bought += (g.inventory.bandage ?? 0) - before;
  }
  g.choose('close');
  collectEvents(g);
}
function commission(g, town, board) {
  click(g, board);
  g.choose('life:contract');
  g.choose('close');
  const job = g.freeLife.contract;
  if (!job || job.status !== 'active') return;
  if (job.kind === 'watch' || job.kind === 'garden') {
    click(g, board);
    g.choose('life:cancel');
    g.choose('close');
    metrics.withdrawn++;
    return;
  }
  if (job.kind === 'workshop') {
    const recipe = RECIPES.find((r) => r.result === job.item);
    assert.ok(recipe);
    for (
      let attempts = 0;
      g.freeLife.contract.progress < job.required && attempts < 30;
      attempts++
    ) {
      stock(g, recipe.cost, town);
      prepare(g, recipe.id);
    }
  } else {
    for (
      let attempts = 0;
      g.freeLife.contract.progress < job.required && attempts < 20;
      attempts++
    ) {
      const candidate = g.world
        .propsAround(town.x, town.y, 55)
        .filter((p) => p.kind === job.item && !g.removed.has(p.id))
        .sort((a, b) => distance(a, g.player) - distance(b, g.player));
      let done = false;
      for (const plant of candidate) {
        try {
          gather(g, plant);
          done = true;
          break;
        } catch (error) {
          metrics.routeFailures++;
          if (g.phase !== 'playing') throw error;
        }
      }
      assert.ok(done, 'A remaining actual plot supports the commission');
    }
  }
  assert.ok(
    g.freeLife.contract.progress >= job.required,
    'Commission requires newly performed work',
  );
  stock(g, { [job.item]: job.required }, town);
  click(g, board);
  const coins = g.player.coins;
  g.choose('life:claim');
  assert.equal(g.freeLife.contract.status, 'complete');
  assert.equal(g.player.coins, coins + job.reward);
  g.choose('life:claim');
  assert.equal(g.player.coins, coins + job.reward, 'A reported commission cannot pay twice');
  g.choose('close');
  metrics.commissions++;
  collectEvents(g);
}
function botanicalJob(g, town) {
  const person = g.world.npcsAround(town.x, town.y, 26).find((n) => n.role === 'botanist');
  if (!person) return;
  click(g, person);
  g.choose('supply:accept');
  g.choose('close');
  const job = g.save().supplyJobs.find((j) => j.npcId === person.id && j.active);
  if (!job) return;
  stock(g, { [job.item]: job.amount }, town);
  click(g, person);
  const coins = g.player.coins;
  g.choose('supply:deliver');
  assert.equal(g.player.coins, coins + 14);
  g.choose('close');
  metrics.supplies++;
  collectEvents(g);
}
function checkpoint(final = false) {
  const saved = game.save();
  const serialized = JSON.stringify(saved),
    bytes = Buffer.byteLength(serialized),
    prettyBytes = Buffer.byteLength(JSON.stringify(saved, null, 2));
  assert.ok(
    prettyBytes < 8 * 1024 * 1024,
    'A normally formatted save remains importable under the actual8MiBlimit',
  );
  const restored = Stichos.restore(JSON.parse(serialized)),
    after = restored.save();
  const { exploration: beforeFog, ...beforeState } = saved,
    { exploration: afterFog, ...afterState } = after;
  assert.deepEqual(afterState, beforeState, 'Every persisted gameplay field round-trips exactly');
  if (JSON.stringify(beforeFog) !== JSON.stringify(afterFog)) metrics.footingExtensions++;
  assert.ok(
    afterFog.revision >= beforeFog.revision,
    'Restore only refreshes current footing knowledge',
  );
  const stable = restored.save(),
    twice = Stichos.restore(stable);
  assert.deepEqual(
    twice.save(),
    stable,
    'The current-footing checkpoint round-trips exactly including exploration',
  );
  game = twice;
  metrics.maxSaveBytes = Math.max(metrics.maxSaveBytes, bytes);
  const snapshot = {
    activeSeconds: Number(metrics.activeSeconds.toFixed(2)),
    time: game.time,
    distance: game.distanceTraveled - initialDistance,
    position: { x: game.player.x, y: game.player.y },
    bytes,
    prettyBytes,
    visited: game.visited.size,
    discovered: game.discoveredSites.length,
    cache: game.world.cacheSize,
    commissions: metrics.commissions,
    supplies: metrics.supplies,
    dispatches: metrics.dispatches,
    body: game.bodyId,
    exactPersistentState: true,
    exactStableExploration: true,
  };
  metrics.checkpoints.push(snapshot);
  fs.writeFileSync(path.join(directory, 'latest-save.json'), JSON.stringify(game.save(), null, 2));
  fs.writeFileSync(
    path.join(directory, 'progress.json'),
    JSON.stringify(
      {
        started: started.toISOString(),
        wallSeconds: (performance.now() - wallStart) / 1000,
        ...snapshot,
      },
      null,
      2,
    ),
  );
  console.log(`${final ? 'FINAL' : 'CHECKPOINT'} ${JSON.stringify(snapshot)}`);
}
function nearestTown(g) {
  const found = g.world
    .settlementsAround(g.player.x, g.player.y, 1024)
    .filter((t) => t.rank !== 'hamlet')
    .sort((a, b) => distance(a, g.player) - distance(b, g.player))[0];
  assert.ok(found, 'A real inhabited town exists in the surrounding road network');
  return found;
}
function nextTown(g, from) {
  const options = g.world
    .settlementsAround(from.x, from.y, 1024)
    .filter((t) => t.rank !== 'hamlet' && !visitedTowns.has(t.id) && t.x > from.x + 80)
    .sort((a, b) => distance(a, from) - distance(b, from));
  assert.ok(options.length, 'The eastward continuous world keeps providing actual new settlements');
  return options[0];
}
try {
  let town = nearestTown(game),
    pending = null;
  while (metrics.activeSeconds < hours * 3600) {
    if (distance(game.player, town) > 35) road(game, { x: town.x, y: town.y + 4 });
    visitedTowns.add(town.id);
    const board = game.world
      .propsAround(town.x, town.y, 18)
      .find((p) => p.kind === 'notice' && !p.id.startsWith('vault:'));
    assert.ok(board, 'An actual town noticeboard anchors local work');
    if (pending) {
      const person =
        game.npcs.find((n) => n.id === pending.recipientId) ??
        game.world
          .npcsAround(pending.target.x, pending.target.y, 6)
          .find((n) => n.id === pending.recipientId);
      assert.ok(person, 'The memorized dispatch reaches its actual living recipient');
      click(game, person);
      game.choose(`dispatch:deliver:${pending.sourceId}`);
      game.choose('close');
      assert.equal(
        game.dispatches.find((j) => j.sourceId === pending.sourceId).status,
        'delivered',
      );
      metrics.dispatches++;
      pending = null;
    }
    trade(game, town);
    const seat = game.world.propsAround(town.x, town.y, 18).find((p) => p.kind === 'bench');
    if (
      seat &&
      (game.player.warmth < 50 ||
        game.player.breath < 45 ||
        game.player.hp < game.player.maxHp * 0.65)
    ) {
      approach(game, seat);
      const before = game.time;
      game.rest();
      if (game.time > before) {
        metrics.rests++;
        metrics.restSeconds += game.time - before;
      }
    }
    stock(game, { cequin: 5, rations: 4, tonic: 2, salve: 2 }, town);
    commission(game, town, board);
    botanicalJob(game, town);
    trade(game, town);
    stock(game, { cequin: 5, rations: 4, tonic: 2, salve: 2 }, town);
    metrics.stops.push({
      id: town.id,
      name: town.name,
      x: town.x,
      y: town.y,
      activeSeconds: metrics.activeSeconds,
      coins: game.player.coins,
      inventory: { ...game.inventory },
    });
    if (metrics.activeSeconds >= nextCheckpoint) {
      checkpoint();
      nextCheckpoint = Math.floor(metrics.activeSeconds / 600 + 1) * 600;
    }
    if (metrics.activeSeconds >= hours * 3600) break;
    if (metrics.stops.length % 4 === 0) {
      click(game, board);
      game.choose('dispatch:request');
      game.choose('close');
      pending =
        game.dispatches.find((j) => j.sourceId === board.id && j.status === 'active') ?? null;
    }
    if (pending) {
      town = game.world
        .settlementsAround(pending.target.x, pending.target.y, 128)
        .find((t) => t.id === pending.settlementId);
      assert.ok(town, 'Dispatch destination names an actual generated settlement');
    } else town = nextTown(game, town);
    road(game, { x: town.x, y: town.y + 4 });
  }
  checkpoint(true);
  assert.ok(metrics.activeSeconds >= hours * 3600);
  assert.ok(
    metrics.commissions > 0 &&
      metrics.gathered > 0 &&
      metrics.crafted > 0 &&
      metrics.sold + metrics.bought > 0,
    'Endurance includes actual work, preparation and exchange',
  );
  assert.ok(metrics.maxCache <= 160, 'World LRU stays bounded after long travel');
  assert.ok(
    game.distanceTraveled - initialDistance > metrics.activeSeconds * 2,
    'Most simulated active time advances along real routes',
  );
} catch (error) {
  failure = error;
  console.error(error.stack);
} finally {
  const saved = game.save();
  const report = {
    status: failure ? 'FAIL' : 'PASS',
    purpose:
      'Automated simulation stability, not measured human playtime or a claim of four hours of unique story.',
    requestedActiveHours: hours,
    started: started.toISOString(),
    finished: new Date().toISOString(),
    wallSeconds: (performance.now() - wallStart) / 1000,
    sourceHashes: versions,
    startingFixture: {
      path: fixturePath,
      sha256: createHash('sha256').update(input).digest('hex'),
      provenance:
        'Produced by tests/stichos-campaign.test.ts using public movement/gather/craft/trade/dialogue APIs to complete all24campaign objectives.',
      preEarnedSimulationTime: initial.time,
      preEarnedDistance: initial.distanceTraveled,
      campaign: initial.campaign,
    },
    metrics,
    travel: {
      distance: game.distanceTraveled - initialDistance,
      distinctTowns: visitedTowns.size,
      visitedChunks: game.visited.size,
      final: { x: game.player.x, y: game.player.y },
    },
    health: {
      phase: game.phase,
      hp: game.player.hp,
      breath: game.player.breath,
      warmth: game.player.warmth,
      body: game.bodyId,
    },
    combat: { newDefeats: saved.npcs.filter((n) => n.hp <= 0 && !initialDead.has(n.id)).length },
    save: {
      bytes: Buffer.byteLength(JSON.stringify(saved)),
      prettyBytes: Buffer.byteLength(JSON.stringify(saved, null, 2)),
      npcs: saved.npcs.length,
      removed: game.removed.size,
      opened: game.opened.size,
    },
    failure: failure?.stack,
  };
  fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(directory, 'final-save.json'), JSON.stringify(saved, null, 2));
  fs.writeFileSync(
    path.join(directory, 'REPORT.md'),
    `# Stíchos active simulation endurance\n\n${report.status}. ${report.purpose}\n\n- Active movement simulation: ${metrics.activeSeconds.toFixed(2)} seconds (${(metrics.activeSeconds / 3600).toFixed(3)} hours).\n- Wall clock: ${report.wallSeconds.toFixed(2)} seconds.\n- Additional travel: ${report.travel.distance.toFixed(1)} tiles across ${visitedTowns.size} towns.\n- Newly completed work: ${metrics.commissions} commissions, ${metrics.supplies} clinic supplies, ${metrics.dispatches} dispatches.\n- Gathering/crafting/trade: ${metrics.gathered}/${metrics.crafted}/${metrics.bought + metrics.sold}.\n- Rest: ${metrics.rests} visits, ${metrics.restSeconds} seconds excluded from active duration.\n- Save: ${report.save.prettyBytes} bytes formatted, ${metrics.checkpoints.length} validated checkpoints; maximum terrain cache ${metrics.maxCache}/160.\n${failure ? `\nFailure: ${failure.message}\n` : ''}`,
  );
}
if (failure) process.exitCode = 1;
