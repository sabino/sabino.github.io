import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCampaign, createCampaignState, type CampaignStep } from '../src/stichos/campaign.ts';
import { createCommission } from '../src/stichos/free-life.ts';
import { Stichos } from '../src/stichos/session.ts';
import { InfiniteWorld, STOP_SPACING, type WorldGeneration } from '../src/stichos/world.ts';
import type { Point, Prop, Settlement } from '../src/stichos/types.ts';

const SEEDS = [0, 1, 703, 0xffffffff];
const GENERATIONS = [1, 2, 3] as const;
const key = (p: Point) => `${p.x},${p.y}`;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const still = { x: 0, y: 0, run: false };
const axis = (world: InfiniteWorld, value: number) => {
  const spacing = world.generation === 3 ? STOP_SPACING : 80;
  return Math.round(Math.round(value / spacing) * spacing);
};

/** Potential pedestrian connectivity: doors can be opened, walls/water/trees remain solid. */
function flood(
  world: InfiniteWorld,
  start: Point,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
) {
  assert.equal(
    world.blocked(start.x, start.y, undefined, true),
    false,
    `Blocked route origin ${key(start)}`,
  );
  const queue = [start],
    seen = new Set([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: p.x + dx, y: p.y + dy };
      if (
        next.x < bounds.minX ||
        next.x > bounds.maxX ||
        next.y < bounds.minY ||
        next.y > bounds.maxY ||
        seen.has(key(next)) ||
        world.blocked(next.x, next.y, undefined, true)
      )
        continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

function townRoutes(world: InfiniteWorld, town: Settlement, extra = 8) {
  const radius = town.radius + extra;
  return flood(
    world,
    { x: axis(world, town.x), y: axis(world, town.y) },
    {
      minX: town.x - radius,
      maxX: town.x + radius,
      minY: town.y - radius,
      maxY: town.y + radius,
    },
  );
}

function accessible(seen: Set<string>, target: Point) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const p = { x: Math.round(target.x) + dx, y: Math.round(target.y) + dy };
      if (distance(p, target) <= 1.65 && seen.has(key(p))) return p;
    }
  return null;
}

function actual(world: InfiniteWorld, target: Point & { id: string }) {
  const found = [
    ...world.propsAround(target.x, target.y, 2),
    ...world.npcsAround(target.x, target.y, 2),
  ].find((p) => p.id === target.id);
  assert.ok(found, `Missing generated target ${target.id} at ${key(target)}`);
  assert.equal(found.x, target.x, `${target.id}: marker x agrees with actual object`);
  assert.equal(found.y, target.y, `${target.id}: marker y agrees with actual object`);
  return found;
}

function roadConnectsOrigin(world: InfiniteWorld, town: Settlement) {
  const x = axis(world, town.x),
    y = axis(world, town.y);
  for (let yy = Math.min(0, y); yy <= Math.max(0, y); yy++)
    assert.equal(world.blocked(0, yy, undefined, true), false, `Broken trunk road at 0,${yy}`);
  for (let xx = Math.min(0, x); xx <= Math.max(0, x); xx++)
    assert.equal(world.blocked(xx, y, undefined, true), false, `Broken cross road at ${xx},${y}`);
}

test('all seeded campaign witnesses, coils, convoy approaches and deep archives connect to real roads in generations one through three', () => {
  let targets = 0,
    guards = 0,
    negativeTowns = 0;
  for (const generation of GENERATIONS)
    for (const seed of SEEDS) {
      const world = new InfiniteWorld(seed, generation),
        plan = buildCampaign(world);
      const routes = new Map<string, Set<string>>();
      for (const town of new Map(plan.towns.map((t) => [t.id, t])).values()) {
        roadConnectsOrigin(world, town);
        routes.set(town.id, townRoutes(world, town));
        if (town.x < 0 || town.y < 0) negativeTowns++;
      }
      const vaultRoutes = new Map<string, Set<string>>();
      for (const step of plan.steps) {
        const context = `${generation}/${seed}/${step.id}`;
        const target = actual(world, step.target);
        let seen = routes.get(step.town.id)!;
        if (step.vault) {
          const site = step.vault;
          seen = vaultRoutes.get(site.id)!;
          if (!seen) {
            const spacing = generation === 3 ? STOP_SPACING : 80;
            const roadY = Math.round((Math.floor(site.y / spacing) + 1) * spacing);
            roadConnectsOrigin(world, { ...step.town, x: site.entrance.x, y: roadY });
            for (
              let x = Math.min(axis(world, site.entrance.x), site.entrance.x);
              x <= Math.max(axis(world, site.entrance.x), site.entrance.x);
              x++
            )
              assert.equal(
                world.blocked(x, roadY, undefined, true),
                false,
                `${context}: vault road access`,
              );
            seen = flood(
              world,
              { x: site.entrance.x, y: roadY },
              {
                minX: site.x - 17,
                maxX: site.x + 17,
                minY: site.y - 17,
                maxY: roadY,
              },
            );
            vaultRoutes.set(site.id, seen);
            assert.ok(seen.has(key(site.entrance)), `${context}: entrance reached from the road`);
            assert.ok(
              seen.has(key(site.reward)),
              `${context}: deepest reward reached from the entrance`,
            );
            const residents = world
              .npcsAround(site.x, site.y, 24)
              .filter((n) => n.id.startsWith(`${site.id}:guard:`));
            assert.equal(residents.length, 2, `${context}: both required guards exist`);
            for (const guard of residents) {
              assert.ok(guard.hostile && guard.role === 'raider' && guard.hp > 0);
              assert.ok(accessible(seen, guard), `${context}: combat target ${guard.id} reachable`);
              guards++;
            }
          }
        }
        assert.ok(
          accessible(seen, target),
          `${context}: unreachable ${target.id} at ${key(target)}`,
        );
        targets++;
        for (const lamp of step.lamps ?? []) {
          assert.equal((actual(world, lamp) as Prop).kind, 'lamp');
          assert.ok(
            accessible(routes.get(step.town.id)!, lamp),
            `${context}: unreachable coil ${lamp.id}`,
          );
          targets++;
        }
        if (generation === 1 && step.kind === 'archive') {
          assert.equal(step.vault, undefined);
          assert.ok(
            'role' in target && target.role === 'archivist',
            `${context}: old worlds use real civic records`,
          );
        }
      }
    }
  assert.equal(targets, 432);
  assert.ok(
    guards >= 40 && negativeTowns >= 12,
    'The sample includes underground guards and negative-coordinate towns.',
  );
});

/** A unit fixture at a verified connected local footing; subsequent actions use public APIs. */
function standNear(game: Stichos, target: Point, seen: Set<string>) {
  const point = accessible(seen, target);
  assert.ok(point, `No connected interaction footing for ${key(target)}`);
  // Prefer a clear adjacent cell so restoring does not need an unopened-door migration.
  const footing = [...seen]
    .map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    })
    .filter((p) => distance(p, target) <= 1.65 && !game.world.blocked(p.x, p.y, game.removed))
    .sort((a, b) => distance(a, target) - distance(b, target))[0];
  assert.ok(footing);
  game.choose('close');
  game.player.x = footing.x;
  game.player.y = footing.y;
  for (let i = 0; i < 4; i++) game.update(0.2, still);
}

test('botanical supply and correspondence accepted in negative towns mark real connected targets and can be cancelled without reward', () => {
  let supplies = 0,
    dispatches = 0;
  for (const generation of GENERATIONS)
    for (const seed of SEEDS) {
      const game = new Stichos(seed, generation);
      const spacing = generation === 3 ? STOP_SPACING : 80;
      const town = game.world
        .settlementsAround(-3 * spacing, -3 * spacing, 100)
        .sort(
          (a, b) =>
            distance(a, { x: -3 * spacing, y: -3 * spacing }) -
            distance(b, { x: -3 * spacing, y: -3 * spacing }),
        )[0];
      assert.ok(town && town.x < 0 && town.y < 0);
      const seen = townRoutes(game.world, town, 28);
      const botanist = game.world
        .npcsAround(town.x, town.y, town.radius + 2)
        .find((n) => n.role === 'botanist')!;
      standNear(game, botanist, seen);
      game.interact(botanist.id);
      assert.ok(game.dialogue?.choices.some((c) => c.id === 'supply:accept'));
      game.choose('supply:accept');
      const job = game.save().supplyJobs.find((j) => j.npcId === botanist.id)!;
      assert.ok(job?.active, `${generation}/${seed}: actual clinic offers a local supply job`);
      const plant = game.world
        .propsAround(job.target.x, job.target.y, 0.1)
        .find((p) => p.kind === job.item)!;
      assert.ok(plant && !game.removed.has(plant.id));
      assert.ok(
        accessible(seen, plant),
        `${generation}/${seed}: marked plant is connected to its town`,
      );
      const before = game.player.coins,
        itemBefore = game.inventory[job.item] ?? 0;
      game.choose('close');
      game.interact(botanist.id);
      game.choose('supply:deliver');
      assert.equal(game.player.coins, before + (itemBefore >= job.amount ? 14 : 0));
      assert.equal(
        game.save().supplyJobs.find((j) => j.npcId === botanist.id)?.active,
        itemBefore < job.amount,
      );
      supplies++;

      const board = actual(game.world, { id: `${town.id}:notice`, x: town.x - 2, y: town.y + 1 });
      standNear(game, board, seen);
      game.interact(board.id);
      game.choose('dispatch:request');
      const dispatch = game.dispatches.find((j) => j.sourceId === board.id)!;
      assert.ok(
        dispatch?.status === 'active',
        `${generation}/${seed}: a real neighboring recipient is available`,
      );
      const recipient = actual(game.world, { id: dispatch.recipientId, ...dispatch.target });
      assert.ok('role' in recipient && recipient.hp > 0 && !recipient.hostile);
      const destination = game.world
        .settlementsAround(recipient.x, recipient.y, 40)
        .sort((a, b) => distance(a, recipient) - distance(b, recipient))[0];
      assert.ok(destination && destination.id !== town.id);
      roadConnectsOrigin(game.world, destination);
      assert.ok(accessible(townRoutes(game.world, destination), recipient));
      const coins = game.player.coins;
      game.choose('close');
      game.interact(board.id);
      game.choose(`dispatch:cancel:${board.id}`);
      assert.equal(game.dispatches.find((j) => j.sourceId === board.id)?.status, 'cancelled');
      assert.equal(game.player.coins, coins);
      const restored = Stichos.restore(game.save());
      assert.equal(restored.dispatches.find((j) => j.sourceId === board.id)?.status, 'cancelled');
      dispatches++;
    }
  assert.equal(supplies, 12);
  assert.equal(dispatches, 12);
});

test('seeded field, preparation and road-watch commissions in negative towns identify connected real work', () => {
  const kinds = new Set<string>();
  let checked = 0;
  for (const generation of GENERATIONS)
    for (const seed of SEEDS) {
      const game = new Stichos(seed, generation),
        world = game.world;
      const spacing = generation === 3 ? STOP_SPACING : 80;
      const town = world
        .settlementsAround(-3 * spacing, -3 * spacing, 100)
        .sort(
          (a, b) =>
            distance(a, { x: -3 * spacing, y: -3 * spacing }) -
            distance(b, { x: -3 * spacing, y: -3 * spacing }),
        )[0]!;
      const seen = townRoutes(world, town, 55);
      const board = actual(world, {
        id: `${town.id}:notice`,
        x: town.x - 2,
        y: town.y + 1,
      }) as Prop;
      const plants = world
        .propsAround(town.x, town.y, 48)
        .filter((p) => ['cequin', 'heartleaf', 'emberroot'].includes(p.kind));
      const enemies = world
        .npcsAround(town.x, town.y, 48)
        .filter((n) => n.role === 'raider' && n.hostile && n.hp > 0)
        .sort((a, b) => distance(a, board) - distance(b, board));
      for (let serial = 1; serial <= 16; serial++) {
        const job = createCommission(
          seed,
          serial,
          town,
          board,
          plants,
          enemies,
          undefined,
          (plant) => game.botanicalProfile(plant)!.yield,
        );
        const context = `${generation}/${seed}/commission:${serial}/${job.kind}`;
        assert.ok(accessible(seen, job.target), `${context}: route to ${key(job.target)}`);
        if (job.kind === 'field') {
          assert.ok(plants.some((p) => p.kind === job.item && distance(p, job.target) < 0.1));
          assert.ok(
            plants
              .filter((p) => p.kind === job.item)
              .reduce((sum, p) => sum + game.botanicalProfile(p)!.yield, 0) >= job.required,
            `${context}: enough finite matching plants exist to gather the requested amount`,
          );
        } else if (job.kind === 'watch') {
          assert.equal(job.targets.length, job.required);
          for (const id of job.targets) {
            const enemy = enemies.find((n) => n.id === id)!;
            assert.ok(enemy && accessible(seen, enemy), `${context}: real reachable hostile ${id}`);
          }
        } else {
          assert.equal(job.kind, 'workshop');
          assert.ok(
            world.propsAround(job.target.x, job.target.y, 0.1).some((p) => p.kind === 'workbench'),
          );
        }
        kinds.add(job.kind);
        checked++;
      }
    }
  assert.equal(checked, 192);
  assert.deepEqual(kinds, new Set(['field', 'workshop', 'watch']));
});

/** Restored in-progress save fixture, not a claim of an action-earned campaign playthrough. */
function campaignCheckpoint(seed: number, generation: WorldGeneration, index: number) {
  const base = new Stichos(seed, generation),
    saved = base.save();
  const steps = buildCampaign(base.world).steps;
  saved.storyStage = 4;
  saved.campaign = {
    ...createCampaignState(),
    started: true,
    step: index,
    ending: index === 24 ? 'return-link' : null,
    evidence: steps.slice(0, index).map((s) => s.id),
    choices: Object.fromEntries(
      steps.slice(0, index).flatMap((s) => {
        const choice =
          s.choices?.[0]?.id ?? s.answer ?? (s.kind === 'encounter' ? 'parley' : undefined);
        return choice ? [[s.id, choice]] : [];
      }),
    ),
  };
  for (const step of steps.slice(0, index))
    saved.quests.push({
      id: step.id,
      title: step.title,
      description: step.text,
      objective: step.result,
      stage: 1,
      complete: true,
    });
  // The original schema omitted generation; it must remain generation one, with no excavations.
  if (generation === 1) delete (saved as Partial<typeof saved>).worldGeneration;
  return Stichos.restore(saved);
}

function stepRoutes(world: InfiniteWorld, step: CampaignStep) {
  if (!step.vault) return townRoutes(world, step.town);
  const site = step.vault;
  return flood(world, site.entrance, {
    minX: site.x - 17,
    maxX: site.x + 17,
    minY: site.y - 17,
    maxY: site.y + 17,
  });
}

test('restored legacy civic archives and modern deep caches advance each archive lead once without changing their world generation', () => {
  for (const generation of GENERATIONS)
    for (const seed of SEEDS)
      for (const index of [6, 11, 18]) {
        let game = campaignCheckpoint(seed, generation, index);
        const step = game.campaignObjective!;
        assert.equal(step.kind, 'archive');
        assert.equal(game.world.generation, generation);
        const target = actual(game.world, step.target);
        standNear(game, target, stepRoutes(game.world, step));
        // Re-enter through validation at the real target footing, including an old generation-one save.
        game = Stichos.restore(game.save());
        const coins = game.player.coins;
        game.interact(target.id);
        if (!step.vault) {
          assert.ok(game.dialogue?.choices.some((c) => c.id === 'campaign:read'));
          game.choose('campaign:read');
          assert.deepEqual(game.world.vaultsAround(step.town.x, step.town.y, 128), []);
        }
        assert.equal(
          game.campaign.step,
          index + 1,
          `${generation}/${seed}: archive ${step.id} advances`,
        );
        assert.equal(game.quests.find((q) => q.id === step.id)?.complete, true);
        assert.equal(game.player.coins, coins + step.reward.coins + (step.vault ? 12 : 0));
        if (step.vault) assert.ok(game.opened.has(target.id));
        game = Stichos.restore(game.save());
        const rewarded = game.player.coins;
        game.interact(target.id);
        game.choose('campaign:read');
        assert.equal(game.campaign.step, index + 1);
        assert.equal(
          game.player.coins,
          rewarded,
          'Reading the same archive cannot award its payment again.',
        );
      }
});

test('generation-one convoy leads consume real local preparations and then expose their civic archive without requiring absent vault guards', () => {
  for (const seed of SEEDS)
    for (const index of [5, 10, 17]) {
      let game = campaignCheckpoint(seed, 1, index);
      const step = game.campaignObjective!,
        seen = townRoutes(game.world, step.town);
      assert.equal(step.kind, 'encounter');
      assert.equal(step.vault, undefined);
      const board = actual(game.world, step.target);
      standNear(game, board, seen);
      game.interact(board.id);
      assert.ok(!game.dialogue?.choices.some((c) => c.id === 'campaign:fight'));
      assert.ok(game.dialogue?.choices.some((c) => c.id === 'campaign:shelter'));
      game.choose('campaign:parley');
      assert.equal(
        game.campaign.step,
        index,
        'The convoy cannot be bypassed without its actual supplies.',
      );

      for (const id of [
        `${step.town.id}:heartleaf`,
        `${step.town.id}:heartleaf:2`,
        `${step.town.id}:garden:-4:5`,
      ]) {
        const plant = game.world
          .propsAround(step.town.x, step.town.y, 16)
          .find((p) => p.id === id)!;
        assert.ok(plant);
        standNear(game, plant, seen);
        game.interact(plant.id);
        assert.ok(game.removed.has(plant.id), `${seed}: finite local ingredient harvested`);
      }
      game.craft('salve');
      game.craft('salve');
      assert.ok((game.inventory.salve ?? 0) >= 2 && (game.inventory.rations ?? 0) >= 3);
      standNear(game, board, seen);
      const salves = game.inventory.salve!,
        rations = game.inventory.rations!;
      game.interact(board.id);
      game.choose('campaign:parley');
      assert.equal(game.campaign.step, index + 1);
      assert.equal(game.inventory.salve ?? 0, salves - 2);
      assert.equal(game.inventory.rations ?? 0, rations - 3);
      assert.equal(game.campaignObjective?.kind, 'archive');
      const archive = actual(game.world, game.campaignObjective!.target);
      standNear(game, archive, seen);
      game.interact(archive.id);
      game.choose('campaign:read');
      assert.equal(game.campaign.step, index + 2);
      game = Stichos.restore(game.save());
      assert.equal(game.campaign.step, index + 2);
      assert.equal(game.world.generation, 1);
    }
});

test('new local orders fit finite botanical yields while a larger legacy order finds a real next plot after exhausting its original marker', () => {
  let game = campaignCheckpoint(0xffffffff, 3, 24);
  const town = game.world.settlementsAround(-640, -640, 1)[0]!;
  const seen = townRoutes(game.world, town, 55);
  const board = actual(game.world, { id: `${town.id}:notice`, x: town.x - 2, y: town.y + 1 });
  standNear(game, board, seen);
  for (let serial = 1; serial <= 7; serial++) {
    game.choose('close');
    game.interact(board.id);
    game.choose('life:contract');
    assert.equal(game.freeLife.contract?.number, serial);
    if (serial < 7) {
      game.choose('close');
      game.interact(board.id);
      const coins = game.player.coins;
      game.choose('life:cancel');
      assert.equal(game.player.coins, coins);
    }
  }
  const generated = game.freeLife.contract!;
  assert.equal(generated.kind, 'field');
  assert.equal(generated.item, 'heartleaf');
  assert.equal(
    generated.required,
    4,
    'Two actual two-leaf plants can satisfy the new local order.',
  );

  // Preserve an already-issued six-leaf order from before the cap; migration must
  // find fresh work rather than silently changing its promise or granting progress.
  const saved = game.save();
  saved.freeLife.commission!.required = 6;
  saved.freeLife.commission!.description = generated.description.replace('4 fresh', '6 fresh');
  game = Stichos.restore(saved);
  assert.equal(game.freeLife.contract?.required, 6);
  for (const id of [`${town.id}:heartleaf`, `${town.id}:heartleaf:2`]) {
    const plant = game.world.propsAround(town.x, town.y, 12).find((p) => p.id === id)!;
    standNear(game, plant, seen);
    game.interact(plant.id);
    assert.ok(game.removed.has(id));
  }
  const continued = game.freeLife.contract!;
  assert.equal(continued.progress, 4);
  assert.equal(continued.required, 6);
  assert.equal(continued.status, 'active');
  const next = game.world
    .propsAround(continued.target.x, continued.target.y, 0.1)
    .find((p) => p.kind === 'heartleaf' && !game.removed.has(p.id));
  assert.ok(next, 'The remaining legacy work receives a real unharvested plot.');
  assert.ok(
    distance(next, town) > 48 && distance(next, town) <= 128,
    'The search expands beyond the exhausted original local ring.',
  );
  assert.ok(accessible(seen, next), 'The replacement marker is reachable from the city road.');
  game = Stichos.restore(game.save());
  assert.deepEqual(game.freeLife.contract?.target, continued.target);
  assert.equal(game.freeLife.contract?.progress, 4);

  // A depleted-world fixture must explain the absence without awarding imaginary
  // harvests, and routine saves must not repeatedly regenerate three wide rings.
  for (const plot of game.world.propsAround(board.x, board.y, 128))
    if (plot.kind === 'heartleaf') game.removed.add(plot.id);
  const originalPropsAround = game.world.propsAround.bind(game.world);
  let wideSearches = 0;
  game.world.propsAround = (x, y, radius) => {
    if (radius >= 48) wideSearches++;
    return originalPropsAround(x, y, radius);
  };
  game.save();
  assert.deepEqual(game.freeLife.contract?.target, { x: board.x, y: board.y });
  assert.equal(game.freeLife.contract?.progress, 4);
  assert.match(
    game.quests.find((q) => q.id === continued.id)!.objective,
    /No matching plots remain/,
  );
  const searchesAfterFailure = wideSearches;
  assert.ok(searchesAfterFailure > 0);
  for (let i = 0; i < 10; i++) game.save();
  assert.equal(
    wideSearches,
    searchesAfterFailure,
    'Unchanged exhausted terrain does not trigger repeated wide searches.',
  );
  standNear(game, board, seen);
  game.interact(board.id);
  const coins = game.player.coins;
  game.choose('life:cancel');
  assert.equal(game.freeLife.contract?.status, 'cancelled');
  assert.equal(game.player.coins, coins);
});
