import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos, RECIPES } from '../src/stichos/session.ts';
import { InfiniteWorld, STOP_SPACING } from '../src/stichos/world.ts';
import {
  buildCampaign,
  validateCampaignState,
  createCampaignState,
} from '../src/stichos/campaign.ts';
import type { Point, ItemId, Prop } from '../src/stichos/types.ts';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
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
function walk(game: Stichos, target: Point, tolerance = 1.25) {
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
      const dx = point.x - game.player.x,
        dy = point.y - game.player.y,
        d = Math.hypot(dx, dy);
      game.update(Math.min(0.2, d / (game.player.speed * 1.55)), {
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
function gather(game: Stichos, prop: Prop) {
  walk(game, prop);
  game.interact(prop.id);
  assert.ok(game.removed.has(prop.id), `Gathered ${prop.id}`);
}
function stock(game: Stichos, cost: Partial<Record<ItemId, number>>, town: Point) {
  for (const [id, n] of Object.entries(cost)) {
    const item = id as ItemId;
    while ((game.inventory[item] ?? 0) < n!) {
      const recipe = RECIPES.find((r) => r.result === item);
      if (recipe) {
        stock(game, recipe.cost, town);
        if (item === 'lens') walk(game, { x: town.x + 4, y: town.y + 5 });
        game.craft(recipe.id);
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
    stock(game, cost, town);
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
  game.craft('lens');
  click(game, { id: 'origin-radio', x: 3, y: 1 });
  game.choose('repair-radio');
  game.choose('close');
  assert.equal(game.storyStage, 4);
}

test('six acts assemble distinct real towns, unique archives and genuine coil anchors across world generations', () => {
  for (const generation of [1, 2, 3] as const)
    for (const seed of [3886, 0x53544943, 1, 73, 9876]) {
      const world = new InfiniteWorld(seed, generation),
        plan = buildCampaign(world);
      assert.equal(plan.steps.length, 24);
      assert.equal(new Set(plan.towns.slice(0, 5).map((t) => t.id)).size, 5);
      assert.deepEqual(plan, buildCampaign(new InfiniteWorld(seed, generation)));
      const sites = plan.steps
        .filter((s) => s.kind === 'archive' && s.vault)
        .map((s) => s.vault!.id);
      assert.equal(new Set(sites).size, sites.length);
      for (const step of plan.steps) {
        const found = [
          ...world.npcsAround(step.target.x, step.target.y, 2),
          ...world.propsAround(step.target.x, step.target.y, 2),
        ].find((p) => p.id === step.target.id);
        assert.ok(found, `${generation}/${seed}/${step.id} targets actual ${step.target.id}`);
        if (step.lamps)
          for (const lamp of step.lamps)
            assert.ok(
              world
                .propsAround(lamp.x, lamp.y, 1)
                .some((p) => p.id === lamp.id && p.kind === 'lamp'),
            );
      }
    }
});

test('a whole generation-three campaign resolves through actual movement, harvesting, crafting, choices and spatial coils', (t) => {
  let game = new Stichos(3886, 3);
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
    game.rest();
    if (step.cost) stock(game, step.cost, step.town);
    if (step.kind === 'puzzle') {
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
  assert.equal(game.campaign.ending, 'return-link');
  assert.equal(game.campaign.completed, 24);
  assert.equal(game.quests.filter((q) => q.id.startsWith('sallas:') && q.complete).length, 24);
  assert.ok(game.distanceTraveled > 5000);
  t.diagnostic(
    JSON.stringify({
      distance: game.distanceTraveled,
      time: game.time,
      practice: game.progression.xp,
      harvests: game.removed.size,
      coins: game.player.coins,
    }),
  );
  assert.ok(game.progression.xp.botany > 30);
  assert.ok(game.progression.xp.crafting > 60);
  assert.ok(game.save().npcs.filter((n) => n.role === 'raider' && !n.hostile).length >= 6);
  assert.ok(decisions.includes('open-audit'));
  assert.equal(game.phase, 'playing');
  walk(game, { x: 0, y: 4 });
  assert.ok(
    game.transferCandidates.some((n) => ['botanist', 'merchant', 'engineer'].includes(n.role)),
    'The resolved protocol permits other willing professions.',
  );
});

test('legacy radio saves gain an actionable lead while malformed or skipped campaign evidence is rejected', () => {
  const game = new Stichos(3886);
  opening(game);
  const save = game.save();
  const legacy = structuredClone(save) as Partial<typeof save>;
  delete legacy.campaign;
  delete legacy.progression;
  const restored = Stichos.restore(legacy);
  assert.equal(restored.campaign.step, 0);
  assert.ok(restored.quests.some((q) => q.id === 'sallas:00' && !q.complete));
  assert.deepEqual(validateCampaignState(createCampaignState()), createCampaignState());
  for (const corrupt of [
    { step: 4 },
    { evidence: ['sallas:01'] },
    { puzzle: 99 },
    { choices: [] },
    { ending: 'stay' },
  ])
    assert.throws(() => validateCampaignState({ ...createCampaignState(), ...corrupt }));
});

test('multiplayer preflight is read-only and matches actual tool, yield, exhaustion and capacity checks', () => {
  const game = new Stichos(3886);
  const plant = game.world.propsAround(0, 0, 16).find((p) => p.id === 'origin:cequin')!;
  walk(game, plant);
  const before = game.save();
  assert.deepEqual(game.interactionAvailability(plant.id), { ok: true });
  assert.deepEqual(game.save(), before);
  game.inventory = { wood: 58 };
  assert.equal(game.interactionAvailability(plant.id).ok, false);
  game.interact(plant.id);
  assert.equal(game.removed.has(plant.id), false);
  game.inventory = {};
  game.interact(plant.id);
  assert.equal(game.inventory.cequin, 3);
  assert.equal(game.interactionAvailability(plant.id).ok, false);
  const rock = game.world
    .propsAround(game.player.x, game.player.y, 30)
    .find((p) => p.kind === 'rock')!;
  walk(game, rock);
  game.weapons.add('sword');
  game.equip('sword');
  assert.equal(game.interactionAvailability(rock.id).ok, false);
  game.equip('staff');
  assert.equal(game.interactionAvailability(rock.id).ok, true);
  game.interact(rock.id);
  assert.equal(game.inventory.ore, 2);
  assert.equal(game.interactionAvailability('unknown').ok, false);
});

test('session home addresses are real and stable while physical upgrades and cosmetics preserve base appearance', () => {
  const game = new Stichos(3886);
  walk(game, { x: -13, y: 13 });
  const address =
    game.nearbyHomes.find((h) => h.buildingId === 'origin:house:3') ?? game.nearbyHomes[0]!;
  assert.ok(address);
  assert.equal(game.world.tile(address.x, address.y).building, address.buildingId);
  game.player.coins = 300;
  game.inventory = { wood: 20, ore: 12, heartleaf: 10 };
  const forged = { ...address, x: address.x + 100 };
  assert.equal(game.progress({ kind: 'buy-home', address: forged }).ok, false);
  assert.equal(game.progression.homes.length, 0);
  assert.equal(game.progress({ kind: 'buy-home', address }).ok, true);
  assert.equal(game.progression.homes.length, 1);
  const prior = game.save();
  assert.equal(game.progress({ kind: 'buy-home', address }).ok, false);
  assert.deepEqual(game.inventory, prior.inventory);
  assert.equal(game.player.coins, prior.player.coins);
  assert.equal(
    game.progress({ kind: 'furnish', homeId: address.id, furnitureId: 'field-bench' }).ok,
    true,
  );
  const ore = game.inventory.ore!;
  game.craft('lens');
  assert.equal(game.inventory.ore, ore - 2);
  assert.equal(game.inventory.lens, 1);
  const base = { ...game.player.appearance };
  assert.equal(game.progress({ kind: 'buy-style', styleId: 'field-botanist' }).ok, true);
  assert.equal(game.progress({ kind: 'equip-style', styleId: 'field-botanist' }).ok, true);
  assert.deepEqual(game.player.appearance, base);
  assert.notDeepEqual(game.displayAppearance, base);
  assert.equal(game.progress({ kind: 'equip-style', styleId: 'aurora-mantle' }).ok, false);
  game.setCosmeticEntitlements(['aurora-mantle']);
  assert.equal(game.progress({ kind: 'equip-style', styleId: 'aurora-mantle' }).ok, true);
  const restored = Stichos.restore(game.save());
  assert.deepEqual(
    restored.displayAppearance,
    base,
    'A local save cannot restore a premium entitlement.',
  );
  assert.equal(restored.progression.homes.length, 1);
});
