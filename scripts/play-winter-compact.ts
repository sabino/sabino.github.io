/** Opt-in continuous, action-earned main investigation + Winter Compact proof.
 * It measures normal simulation inputs, not human reading time or enjoyment.
 * No player coordinates, physical inventory, quest state or resources are assigned.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Stichos, RECIPES } from '../src/stichos/session.ts';
import { STOP_SPACING } from '../src/stichos/world.ts';
import { requiredToolFor } from '../src/stichos/labor.ts';
import {
  compactProject,
  type CompactAction,
  type CompactPlan,
  type CompactResult,
  type CompactState,
  type CompactTarget,
} from '../src/stichos/compact.ts';
import type { Point, ItemId, Prop } from '../src/stichos/types.ts';

const args = process.argv.slice(2);
if (!args.includes('--run')) {
  console.log(
    'Opt in: node --experimental-strip-types scripts/play-winter-compact.ts --run [--seed 3886] [--label main-compact]',
  );
  process.exit(0);
}
const option = (key: string, fallback: string) =>
  args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const seed = Number(option('--seed', '3886'));
assert.ok(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff);
const label = option('--label', 'main-compact');
assert.match(label, /^[a-z0-9-]+$/);
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.dream-loop/stichos-compact-proof', label);
mkdirSync(directory, { recursive: true });
const started = new Date(),
  wallStart = performance.now();
const sourceHashes = Object.fromEntries(
  [
    'src/stichos/session.ts',
    'src/stichos/world.ts',
    'src/stichos/compact.ts',
    'src/stichos/labor.ts',
    'src/stichos/progression.ts',
    'scripts/play-winter-compact.ts',
  ].map((f) => [
    f,
    createHash('sha256')
      .update(readFileSync(path.join(root, f)))
      .digest('hex'),
  ]),
);
const metrics = {
  movementSeconds: 0,
  workRecoverySeconds: 0,
  blockedSeconds: 0,
  restSeconds: 0,
  rests: 0,
  updates: 0,
  gathered: 0,
  strokes: 0,
  crafts: 0,
  mainObjectives: 0,
  compactProjects: 0,
  surveys: 0,
  policies: 0,
  deliveries: 0,
  hired: 0,
  collected: 0,
  tradeSales: 0,
  sideSupplies: 0,
  deaths: 0,
  maxCache: 0,
  maxSaveBytes: 0,
  checkpoints: 0,
};
const projects: Record<string, unknown>[] = [];
let phase = 'main';
let mainReport: Record<string, unknown> | undefined;
type CompactGame = Stichos & {
  readonly winterCompact: { state: CompactState; plan: CompactPlan };
  compactTarget(id: string): CompactTarget | null;
  compactPreview(action: CompactAction): CompactResult;
  actCompact(action: CompactAction): CompactResult;
};
function advance(g: Stichos, dt: number, input: { x: number; y: number; run: boolean }) {
  const before = g.time,
    p = { x: g.player.x, y: g.player.y };
  g.update(dt, input);
  const elapsed = g.time - before;
  metrics.updates++;
  if (Math.hypot(input.x, input.y) > 0) {
    if (Math.hypot(g.player.x - p.x, g.player.y - p.y) > 1e-7) metrics.movementSeconds += elapsed;
    else metrics.blockedSeconds += elapsed;
  } else metrics.workRecoverySeconds += elapsed;
  metrics.maxCache = Math.max(metrics.maxCache, g.world.cacheSize);
  if (g.phase === 'lost') metrics.deaths++;
  assert.equal(g.phase, 'playing', 'The actual provisioned traveler remains alive.');
  assert.ok(
    performance.now() - wallStart < 20 * 60 * 1000,
    'Finite twenty-minute wall-clock proof limit.',
  );
}
function rest(g: Stichos) {
  const before = g.time;
  g.rest();
  metrics.restSeconds += g.time - before;
  if (g.time > before) metrics.rests++;
}
function prepare(g: Stichos, recipeId: string) {
  const recipe = RECIPES.find((r) => r.id === recipeId)!;
  const before = g.inventory[recipe.result] ?? 0;
  g.craft(recipeId);
  assert.ok((g.inventory[recipe.result] ?? 0) > before, `Actual ${recipeId} preparation succeeds.`);
  metrics.crafts++;
}
function workStroke(g: Stichos, p: Prop) {
  const before = g.tools.find((t) => t.equipped)?.durability;
  g.interact(p.id);
  if ((g.tools.find((t) => t.equipped)?.durability ?? before ?? 0) < (before ?? 0))
    metrics.strokes++;
}
function fixture(name: string, g: Stichos) {
  writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(g.save()));
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Finish a real finite work sequence with the appropriate carried tool. */
function workResource(game: Stichos, prop: Prop) {
  const kind = requiredToolFor(prop.kind);
  assert.ok(kind);
  assert.ok(game.equipTool(kind).ok);
  for (let stroke = 0; stroke < 12 && !game.removed.has(prop.id); stroke++) {
    workStroke(game, prop);
    if (game.removed.has(prop.id)) break;
    for (let tick = 0; tick < 6; tick++) advance(game, 0.25, { x: 0, y: 0, run: false });
  }
  assert.ok(game.removed.has(prop.id), `Completed timed work at ${prop.id}`);
  metrics.gathered++;
}
const key = (p: Point) => `${p.x},${p.y}`;
function sustain(game: Stichos) {
  if (game.player.cequinTime < 20 && game.player.breath < 65 && game.inventory.cequin)
    game.use('cequin');
  if (game.player.warmth < 35) {
    if (game.inventory.tonic) game.use('tonic');
    else if (game.inventory.rations) game.use('rations');
  }
  if (game.player.hp < 60) {
    if (game.inventory.salve) game.use('salve');
    else if (game.inventory.bandage) game.use('bandage');
  }
  assert.equal(game.phase, 'playing', `The campaign must remain survivable at ${key(game.player)}`);
}
/** All travel uses movement input. Planning inspects public collision; no player or quest assignment. */
function walk(game: Stichos, target: Point, tolerance = 1.25, combatFrame?: () => void) {
  game.choose('close');
  const start = { x: Math.round(game.player.x), y: Math.round(game.player.y) };
  const queue = [start],
    seen = new Set([key(start)]),
    prev = new Map<string, Point>();
  const doors = new Map(
    game.world
      .propsAround(start.x, start.y, 45)
      .filter((p) => p.kind === 'door')
      .map((p) => [key(p), p]),
  );
  let end: Point | undefined;
  for (let i = 0; i < queue.length && i < 25000; i++) {
    const p = queue[i];
    if (
      distance(p, target) <= tolerance &&
      (!game.world.blocked(p.x, p.y, game.removed) || doors.has(key(p)))
    ) {
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
  const path: Point[] = [];
  for (let p = end; key(p) !== key(start); p = prev.get(key(p))!) path.unshift(p);
  for (const point of [start, ...path]) {
    const door = doors.get(key(point));
    if (door && !game.removed.has(door.id) && distance(game.player, door) < 1.8) {
      game.interact(door.id);
      game.choose('close');
    }
    for (let i = 0; distance(game.player, point) > 0.025 && i < 40; i++) {
      sustain(game);
      combatFrame?.();
      const dx = point.x - game.player.x,
        dy = point.y - game.player.y,
        d = Math.hypot(dx, dy);
      advance(game, Math.min(0.2, d / (game.player.speed * 1.55)), {
        x: dx / d,
        y: dy / d,
        run: true,
      });
    }
    assert.ok(
      distance(game.player, point) < 0.05,
      `Movement stalled at ${key(point)} (current ${key(game.player)}, ${game.phase}, hp${game.player.hp})`,
    );
  }
}
function road(game: Stichos, target: Point) {
  const spacing = game.world.generation === 3 ? STOP_SPACING : 80;
  const axis = (v: number) => Math.round(Math.round(v / spacing) * spacing);
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
function approach(game: Stichos, target: Point) {
  if (distance(game.player, target) > 50) road(game, target);
  else walk(game, target);
}
function click(game: Stichos, target: Point & { id: string }) {
  approach(game, target);
  game.interact(target.id);
  assert.equal(game.dialogue?.npcId, target.id);
}
const repairingTools = new Set<string>();
function gather(game: Stichos, prop: Prop) {
  const kind = requiredToolFor(prop.kind)!;
  const tool = game.tools.find((t) => t.kind === kind)!;
  if (
    tool &&
    tool.durability < (kind === 'pickaxe' ? 36 : kind === 'axe' ? 16 : 8) &&
    !repairingTools.has(kind)
  ) {
    repairingTools.add(kind);
    try {
      const town = game.world
        .settlementsAround(game.player.x, game.player.y, 128)
        .sort((a, b) => distance(a, game.player) - distance(b, game.player))[0]!;
      assert.ok(town, 'Tool maintenance has a real nearby settlement.');
      stock(game, { wood: 1, ore: 1 }, town);
      approach(game, { x: town.x + 4, y: town.y + 5 });
      assert.ok(
        game.repairTool(kind).ok,
        'Repair uses actual wood, ore and wages at the workbench.',
      );
    } finally {
      repairingTools.delete(kind);
    }
  }
  approach(game, prop);
  workResource(game, prop);
  assert.ok(game.removed.has(prop.id), `Gathered ${prop.id}`);
}
function stock(game: Stichos, cost: Partial<Record<ItemId, number>>, town: Point, depth = 0) {
  assert.ok(depth < 20, 'The resource planner resolves a finite dependency chain.');
  for (const [id, n] of Object.entries(cost)) {
    const item = id as ItemId;
    let attempts = 0;
    while ((game.inventory[item] ?? 0) < n!) {
      assert.ok(attempts++ < 80, `Bounded procurement for ${item} at ${key(town)}`);
      const recipe = RECIPES.find((r) => r.result === item);
      if (recipe) {
        stock(game, recipe.cost, town, depth + 1);
        if (item === 'lens') approach(game, { x: town.x + 4, y: town.y + 5 });
        const before = game.inventory[item] ?? 0;
        prepare(game, recipe.id);
        assert.ok(
          (game.inventory[item] ?? 0) > before,
          `Actual ${recipe.id} crafting progresses procurement.`,
        );
        continue;
      }
      const kind =
        item === 'wood' ? 'pine' : item === 'ore' ? 'rock' : item === 'rations' ? 'mushroom' : item;
      const candidates = game.world
        .propsAround(town.x, town.y, 128)
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
  if (Object.entries(cost).some(([id, n]) => (game.inventory[id as ItemId] ?? 0) < n!))
    stock(game, cost, town, depth + 1);
}
function opening(game: Stichos) {
  const actors = game.world.npcsAround(0, 0, 24);
  click(game, actors.find((n) => n.id === 'origin-botanist')!);
  game.choose('learn-cequin');
  game.choose('aid-clinic');
  click(game, actors.find((n) => n.id === 'origin-archivist')!);
  game.choose('ask-sallas');
  game.choose('close');
  stock(game, { wood: 3, ore: 4 }, { x: 0, y: 0 });
  walk(game, { x: 4, y: 5 });
  prepare(game, 'lens');
  click(game, { id: 'origin-radio', x: 3, y: 1 });
  game.choose('repair-radio');
  game.choose('close');
  assert.equal(game.storyStage, 4);
}

function playMain(): CompactGame {
  let game = new Stichos(seed, 3);
  opening(game);
  const decisions: string[] = [];
  for (let index = 0; index < 24; index++) {
    let step = game.campaignObjective!;
    assert.equal(step.id, `sallas:${index.toString().padStart(2, '0')}`);
    // Travel carries actual field provisions gathered near the previous inhabited stop.
    const nearbyTown = game.world
      .settlementsAround(game.player.x, game.player.y, 128)
      .sort((a, b) => distance(a, game.player) - distance(b, game.player))[0];
    if (nearbyTown && distance(nearbyTown, game.player) < 50) {
      stock(game, { cequin: 4, rations: 3, tonic: 2, salve: 2 }, nearbyTown);
    }
    if (distance(game.player, step.town) > 50) road(game, { x: step.town.x, y: step.town.y + 4 });
    walk(game, { x: step.town.x - 4, y: step.town.y + 2 });
    rest(game);
    if (step.cost) stock(game, step.cost, step.town);
    if (step.kind === 'puzzle') {
      if (index === 22) fixture('before-final-puzzle', game);
      click(game, step.target);
      game.choose('campaign:begin');
      if (index === 3) {
        const wrong = step.lamps![1];
        click(game, wrong);
        game.choose(`campaign:coil:${wrong.channel}`);
        assert.equal(game.campaignObjective!.puzzle, 0);
      }
      for (const lamp of step.lamps!) {
        click(game, lamp);
        game.choose(`campaign:coil:${lamp.channel}`);
      }
      click(game, step.target);
      game.choose('campaign:align');
    } else if (step.kind === 'archive' && step.vault) {
      const spacing = STOP_SPACING,
        south = Math.round((Math.floor(step.vault.y / spacing) + 1) * spacing);
      if (distance(game.player, { x: step.vault.entrance.x, y: south }) > 50)
        road(game, { x: step.vault.entrance.x, y: south });
      while (game.player.y > step.vault.entrance.y + 25)
        walk(game, { x: step.vault.entrance.x, y: game.player.y - 25 }, 0.1);
      walk(game, step.vault.entrance, 0.1);
      walk(game, step.target);
      game.interact(step.target.id);
    } else {
      click(game, step.target);
      if (step.kind === 'talk' || step.kind === 'archive') game.choose('campaign:read');
      else if (step.kind === 'delivery') game.choose('campaign:deliver');
      else if (step.kind === 'encounter') game.choose('campaign:parley');
      else if (step.kind === 'decode') {
        game.choose(`campaign:${step.options!.find(([id]) => id !== step.answer)![0]}`);
        assert.equal(game.campaign.step, index);
        game.choose('close');
        click(game, step.target);
        game.choose(`campaign:${step.answer}`);
      } else {
        if (step.kind === 'ending') {
          fixture('before-ending', game);
          const alternative = Stichos.restore(game.save());
          alternative.interact(step.target.id);
          alternative.choose('campaign:stay');
          assert.equal(alternative.campaign.ending, 'stay');
          assert.equal(Stichos.restore(alternative.save()).endingSummary!.choice, 'stay');
        }
        const choice = step.choices![0];
        decisions.push(choice.id);
        game.choose(`campaign:${choice.id}`);
      }
    }
    assert.equal(
      game.campaign.step,
      index + 1,
      `${step.id}: ${game.dialogue?.text ?? game.events.at(-1)?.text}`,
    );
    metrics.mainObjectives++;
    const saved = game.save();
    game = Stichos.restore(saved);
    const roundTrip = game.save();
    const { exploration: beforeFog, ...beforeState } = saved;
    const { exploration: afterFog, ...afterState } = roundTrip;
    assert.deepEqual(afterState, beforeState, `Act step ${index} gameplay round-trip`);
    assert.ok(
      afterFog.revision >= beforeFog.revision,
      'Restore may reveal the current footing since the last streamed sight update.',
    );
  }
  fixture('campaign-complete', game);
  return game as CompactGame;
}

function tradeSurplus(g: Stichos, town: Point, needed: Partial<Record<ItemId, number>> = {}) {
  const merchant = g.world
    .npcsAround(town.x, town.y, 32)
    .find((n) => n.role === 'merchant' && !n.hostile && n.hp > 0);
  if (!merchant) return;
  click(g, merchant);
  const reserve: Partial<Record<ItemId, number>> = {
    cequin: 5,
    rations: 4,
    tonic: 2,
    salve: 2,
    bandage: 2,
    wood: 3,
    ore: 3,
    heartleaf: 2,
    emberroot: 2,
  };
  for (const [id, n] of Object.entries(g.inventory)) {
    const item = id as ItemId,
      keep = Math.max(reserve[item] ?? 0, needed[item] ?? 0);
    for (let i = 0; i < Math.max(0, n! - keep); i++) {
      const before = g.inventory[item] ?? 0;
      g.choose(`sell:${item}`);
      if ((g.inventory[item] ?? 0) >= before) break;
      metrics.tradeSales++;
    }
  }
  g.choose('close');
}
function fund(g: Stichos, coins: number, town: Point) {
  for (let attempt = 0; g.player.coins < coins && attempt < 12; attempt++) {
    tradeSurplus(g, town);
    if (g.player.coins >= coins) break;
    const botanist = g.world
      .npcsAround(town.x, town.y, 32)
      .find((n) => n.role === 'botanist' && n.hp > 0 && !n.hostile);
    assert.ok(botanist, 'A real clinic can offer paid work for a missing budget.');
    click(g, botanist);
    g.choose('supply:accept');
    g.choose('close');
    const job = g.save().supplyJobs.find((j) => j.npcId === botanist.id && j.active);
    assert.ok(job, 'Accept an actual finite botanical supply request.');
    stock(g, { [job.item]: job.amount }, town);
    click(g, botanist);
    const before = g.player.coins;
    g.choose('supply:deliver');
    g.choose('close');
    assert.ok(g.player.coins > before, 'Only an actual completed supply earns the budget.');
    metrics.sideSupplies++;
  }
  assert.ok(g.player.coins >= coins, 'Earned funds cover the agreed expense.');
}
function current(g: CompactGame) {
  const view = g.winterCompact;
  return compactProject(view.state, view.plan)!;
}
function perform(g: CompactGame, action: CompactAction, targetId: string) {
  const target = g.compactTarget(targetId);
  assert.ok(target, `Actual target ${targetId}`);
  approach(g, target);
  const before = g.save(),
    preview = g.compactPreview(action);
  assert.ok(preview.ok, preview.message);
  assert.deepEqual(g.save(), before, 'Compact preflight remains read-only.');
  const result = g.actCompact(action);
  assert.ok(result.ok, result.message);
  if (action.kind === 'survey') metrics.surveys++;
  if (action.kind === 'choose') metrics.policies++;
  if (action.kind === 'deliver') metrics.deliveries++;
  g.choose('close');
}
function checkpoint(g: CompactGame, name: string): CompactGame {
  const saved = g.save(),
    bytes = Buffer.byteLength(JSON.stringify(saved));
  assert.ok(bytes < 8 * 1024 * 1024, 'The earned life remains importable.');
  metrics.maxSaveBytes = Math.max(metrics.maxSaveBytes, bytes);
  metrics.checkpoints++;
  const restored = Stichos.restore(saved) as CompactGame;
  const after = restored.save();
  const { exploration: a, ...first } = saved,
    { exploration: b, ...second } = after;
  assert.deepEqual(second, first, 'All non-fog gameplay round-trips exactly.');
  assert.ok(b.revision >= a.revision);
  const stable = restored.save();
  assert.deepEqual(
    Stichos.restore(stable).save(),
    stable,
    'Settled exploration also round-trips exactly.',
  );
  fixture(name, restored);
  return restored;
}
function completeCompact(g: CompactGame): CompactGame {
  for (let index = 0; index < 24; index++) {
    game = g; // Keep failure reports on the actual current restored life.
    let p = current(g);
    assert.equal(p.index, index);
    const began = { time: g.time, distance: g.distanceTraveled, ...metrics };
    const previousTown = g.world
      .settlementsAround(g.player.x, g.player.y, 128)
      .sort((a, b) => distance(a, g.player) - distance(b, g.player))[0];
    if (previousTown) {
      tradeSurplus(g, previousTown);
      stock(g, { cequin: 4, rations: 3, tonic: 2, salve: 2 }, previousTown);
    }
    approach(g, { x: p.town.x, y: p.town.y + 4 });
    if (g.player.hp < 75 || g.player.warmth < 55 || g.player.breath < 45) {
      walk(g, { x: p.town.x - 4, y: p.town.y + 2 });
      rest(g);
    }
    for (const witness of p.witnesses)
      perform(g, { kind: 'survey', witnessId: witness.id }, witness.id);
    const choice = p.choices[index % 2];
    fund(g, choice.cost.coins, p.town);
    tradeSurplus(g, p.town, choice.cost.items);
    stock(g, choice.cost.items, p.town);
    perform(g, { kind: 'choose', choiceId: choice.id }, p.board.id);
    p = current(g);
    const terms = p.choices.find((c) => c.id === choice.id)!;
    // A real paid order is opportunistic; this proof never waits for its clock.
    if (index === 0 && terms.work.kind === 'gather' && terms.work.item === 'wood') {
      const preview = g.laborPreview('origin-engineer', 'forestry');
      if (preview.ok) {
        const hired = g.hireLabor('origin-engineer', 'forestry');
        if (hired.ok) metrics.hired++;
      }
    }
    for (let attempts = 0; g.winterCompact.state.stage === 'work' && attempts < 100; attempts++) {
      const before = g.winterCompact.state.work;
      if (terms.work.kind === 'craft') {
        const recipe = RECIPES.find((r) => r.result === terms.work.item);
        assert.ok(recipe);
        stock(g, recipe.cost, p.town);
        if (recipe.id === 'lens') walk(g, { x: p.town.x + 4, y: p.town.y + 5 });
        prepare(g, recipe.id);
      } else {
        const kind =
          terms.work.item === 'wood'
            ? 'pine'
            : terms.work.item === 'ore'
              ? 'rock'
              : terms.work.item;
        const reserved = new Set(
          g.laborOrders
            .filter((o) => o.status === 'working')
            .flatMap((o) => o.allocations.map((a) => a.propId)),
        );
        const candidates = g.world
          .propsAround(p.town.x, p.town.y, 128)
          .filter((prop) => prop.kind === kind && !g.removed.has(prop.id) && !reserved.has(prop.id))
          .sort((a, b) => distance(a, g.player) - distance(b, g.player));
        let worked = false;
        for (const prop of candidates) {
          try {
            approach(g, prop);
            gather(g, prop);
            worked = true;
            break;
          } catch (error) {
            if (g.phase !== 'playing') throw error;
          }
        }
        assert.ok(worked, `Remaining actual ${kind} supports ${p.id}.`);
      }
      assert.ok(
        g.winterCompact.state.work > before || g.winterCompact.state.stage === 'delivery',
        'A successful physical operation advances this agreement.',
      );
    }
    assert.equal(
      g.winterCompact.state.stage,
      'delivery',
      'Fresh work reaches its real requirement.',
    );
    stock(g, terms.delivery, p.town);
    if (p.town.id === 'origin') {
      for (const order of g.laborOrders.filter(
        (o) => o.status === 'working' && o.journey?.phase === 'ready',
      )) {
        const worker = g.staff.find((w) => w.id === order.workerId);
        if (!worker) continue;
        approach(g, worker);
        if (g.collectLabor(order.id).ok) metrics.collected++;
      }
    }
    perform(g, { kind: 'deliver' }, p.board.id);
    assert.equal(g.winterCompact.state.project, index + 1);
    const duplicate = g.actCompact({ kind: 'deliver' });
    assert.equal(duplicate.ok, false, 'The prior district cannot pay its commitment twice.');
    metrics.compactProjects++;
    g = checkpoint(g, `compact-${String(index + 1).padStart(2, '0')}`);
    game = g;
    const record = {
      id: p.id,
      title: p.title,
      town: p.town.name,
      choice: terms.id,
      worldSeconds: g.time - began.time,
      tiles: g.distanceTraveled - began.distance,
      movementSeconds: metrics.movementSeconds - began.movementSeconds,
      workRecoverySeconds: metrics.workRecoverySeconds - began.workRecoverySeconds,
      strokes: metrics.strokes - began.strokes,
      harvests: metrics.gathered - began.gathered,
      crafts: metrics.crafts - began.crafts,
      coins: g.player.coins,
      outcomes: g.winterCompact.state.outcomes[p.district],
    };
    projects.push(record);
    console.log(JSON.stringify(record));
    writeFileSync(
      path.join(directory, 'progress.json'),
      JSON.stringify({ phase, metrics, projects }, null, 2),
    );
  }
  return g;
}
let game: CompactGame | undefined, failure: unknown;
try {
  game = playMain();
  mainReport = { worldSeconds: game.time, tiles: game.distanceTraveled, ...metrics };
  console.log('MAIN ' + JSON.stringify(mainReport));
  game = checkpoint(game, 'main-complete');
  phase = 'compact';
  game = completeCompact(game);
  assert.equal(game.campaign.completed, 24);
  assert.equal(game.winterCompact.state.stage, 'complete');
  assert.equal(metrics.surveys, 48);
  assert.equal(metrics.policies, 24);
  assert.equal(metrics.deliveries, 24);
} catch (error) {
  failure = error;
  console.error(error);
}
const activeSeconds = metrics.movementSeconds + metrics.workRecoverySeconds;
const report = {
  routeStatus: failure ? 'FAIL' : 'PASS',
  fourHourActiveRequirementMet: !failure && activeSeconds >= 14400,
  interpretation:
    'Automated action-earned main investigation plus Winter Compact at normal simulation speed. This is not measured human reading time or a claim about player enjoyment. Rest jumps and blocked frames are excluded.',
  seed,
  started: started.toISOString(),
  finished: new Date().toISOString(),
  wallSeconds: (performance.now() - wallStart) / 1000,
  sourceHashes,
  phase,
  activeSeconds,
  activeHours: activeSeconds / 3600,
  main: mainReport,
  metrics,
  projects,
  current: game
    ? {
        time: game.time,
        distance: game.distanceTraveled,
        bodyId: game.bodyId,
        campaign: game.campaign,
        compact: game.winterCompact.state,
      }
    : undefined,
  failure: failure instanceof Error ? { message: failure.message, stack: failure.stack } : failure,
};
writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2));
if (game) fixture('final-save', game);
writeFileSync(
  path.join(directory, 'REPORT.md'),
  `# Main investigation and Winter Compact action proof\n\nRoute: ${report.routeStatus}. Four-hour active simulation threshold: ${report.fourHourActiveRequirementMet ? 'met' : 'NOT met'}.\n\n${report.interpretation}\n\n- Active input: ${activeSeconds.toFixed(2)} seconds (${(activeSeconds / 3600).toFixed(3)} hours).\n- Main objectives: ${metrics.mainObjectives}; Compact projects: ${metrics.compactProjects}; witness accounts: ${metrics.surveys}; funded policies: ${metrics.policies}; physical deliveries: ${metrics.deliveries}.\n- Resource strokes: ${metrics.strokes}; harvested objects: ${metrics.gathered}; preparations: ${metrics.crafts}.\n- Rest-clock advances excluded: ${metrics.restSeconds.toFixed(2)} seconds; blocked frames excluded: ${metrics.blockedSeconds.toFixed(2)} seconds.\n- Exact checkpoints: ${metrics.checkpoints}; maximum compact save: ${metrics.maxSaveBytes} bytes; maximum world cache: ${metrics.maxCache}.\n- Wall time: ${report.wallSeconds.toFixed(2)} seconds.\n\n${failure instanceof Error ? `Failure: ${failure.message}\n` : ''}`,
);
console.log(
  'FINAL ' +
    JSON.stringify({
      routeStatus: report.routeStatus,
      fourHourActiveRequirementMet: report.fourHourActiveRequirementMet,
      activeSeconds,
      wallSeconds: report.wallSeconds,
      directory,
    }),
);
if (failure || !report.fourHourActiveRequirementMet) process.exitCode = 2;
