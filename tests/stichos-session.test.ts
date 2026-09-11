import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos, ITEMS } from '../src/stichos/session.ts';
import { appearance } from '../src/stichos/world.ts';
import type { ItemId, Npc, Point, Prop } from '../src/stichos/types.ts';

const still = { x: 0, y: 0, run: false };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Walk actual session inputs along public terrain, without moving the player by assignment. */
function walkTo(game: Stichos, target: Point) {
  game.dialogue = null;
  const start = { x: Math.round(game.player.x), y: Math.round(game.player.y) };
  const key = (p: Point) => `${p.x},${p.y}`;
  const queue = [start],
    seen = new Set([key(start)]),
    previous = new Map<string, Point>();
  let end: Point | undefined;
  for (let i = 0; i < queue.length && i < 12000; i++) {
    const p = queue[i];
    if (dist(p, target) <= 1.3 && !game.world.blocked(p.x, p.y, game.removed)) {
      end = p;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: p.x + dx, y: p.y + dy };
      if (
        seen.has(key(next)) ||
        Math.abs(next.x - start.x) > 35 ||
        Math.abs(next.y - start.y) > 35 ||
        game.world.blocked(next.x, next.y, game.removed)
      )
        continue;
      seen.add(key(next));
      previous.set(key(next), p);
      queue.push(next);
    }
  }
  assert.ok(end, `No walkable route to ${key(target)}`);
  const route: Point[] = [];
  for (let p = end; key(p) !== key(start); p = previous.get(key(p))!) route.unshift(p);
  for (const point of [start, ...route]) {
    for (let i = 0; dist(game.player, point) > 0.025 && i < 100; i++) {
      const dx = point.x - game.player.x,
        dy = point.y - game.player.y;
      const length = Math.hypot(dx, dy);
      game.update(Math.min(0.05, length / game.player.speed), {
        x: dx / length,
        y: dy / length,
        run: false,
      });
    }
    assert.ok(dist(game.player, point) < 0.05, `Movement stalled at ${key(point)}`);
  }
  assert.ok(dist(game.player, target) <= 1.4);
}

function npc(game: Stichos, id: string) {
  const actor = game.world.npcsAround(0, 0, 24).find((n) => n.id === id);
  assert.ok(actor, id);
  walkTo(game, actor);
  game.interact(id);
  assert.equal(game.dialogue?.npcId, id);
  return actor;
}

function prop(game: Stichos, find: (p: Prop) => boolean) {
  const result = game.world.propsAround(0, 0, 24).find(find);
  assert.ok(result);
  return result;
}

function gather(game: Stichos, p: Prop) {
  walkTo(game, p);
  game.interact(p.id);
  assert.ok(game.removed.has(p.id), p.id);
}

function opening(game: Stichos, choice: 'aid-clinic' | 'aid-brown' = 'aid-clinic') {
  npc(game, 'origin-botanist');
  game.choose('learn-cequin');
  assert.equal(game.storyStage, 1);
  game.choose(choice);
  assert.equal(game.storyStage, 2);
  npc(game, 'origin-archivist');
  game.choose('ask-sallas');
  game.choose('close');
  assert.equal(game.storyStage, 3);
}

function travelRoads(game: Stichos, target: Point) {
  game.dialogue = null;
  const roadX = Math.round(game.player.x / 80) * 80;
  const roadY = Math.round(game.player.y / 80) * 80;
  walkTo(game, { x: roadX, y: roadY });
  const targetX = Math.round(target.x / 80) * 80;
  const targetY = Math.round(target.y / 80) * 80;
  for (const end of [
    { x: targetX, y: roadY },
    { x: targetX, y: targetY },
  ]) {
    for (let step = 0; dist(game.player, end) > 1.4 && step < 40; step++) {
      walkTo(game, {
        x: game.player.x + Math.max(-20, Math.min(20, end.x - game.player.x)),
        y: game.player.y + Math.max(-20, Math.min(20, end.y - game.player.y)),
      });
    }
    assert.ok(dist(game.player, end) <= 1.4, 'the road journey must make forward progress');
  }
  walkTo(game, target);
}

function vaultFixture(game: Stichos) {
  const site = game.world.vaultsAround(40, 40, 1).find((v) => v.id === 'vault:0:0');
  assert.ok(site, 'the guaranteed first excavation exists in generation two');
  const notice = game.world
    .propsAround(site.entrance.x, 80, 3)
    .find((p) => p.id === `${site.id}:notice`);
  const chest = game.world
    .propsAround(site.reward.x, site.reward.y, 1)
    .find((p) => p.id === `${site.id}:cache`);
  assert.ok(notice && chest);
  return { site, notice, chest };
}

test('a reachable vault notice marks the actual deep archive, whose reward is persistent and paid once', () => {
  const game = new Stichos(3886);
  const { site, notice, chest } = vaultFixture(game);
  Object.assign(game.player, { x: site.entrance.x, y: 80 });
  walkTo(game, notice);
  game.interact(notice.id);
  assert.equal(game.dialogue?.npcId, notice.id);
  assert.ok(game.dialogue?.choices.some((choice) => choice.id === 'vault:survey'));
  game.choose('vault:survey');
  const quest = game.quests.find((q) => q.id === `${site.id}:survey`)!;
  assert.ok(quest && !quest.complete);
  assert.deepEqual(quest.target, { x: chest.x, y: chest.y });
  game.interact(notice.id);
  game.choose('vault:survey');
  assert.equal(game.quests.filter((q) => q.id === quest.id).length, 1);

  // Check the actual world collision route, including the approach, rather than the generator's mask.
  const key = (p: Point) => `${p.x},${p.y}`;
  const start = { x: Math.round(game.player.x), y: Math.round(game.player.y) };
  const queue = [start],
    visited = new Set([key(start)]);
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const next = { x: point.x + dx, y: point.y + dy };
      if (
        visited.has(key(next)) ||
        Math.abs(next.x - site.x) > 18 ||
        next.y < site.y - 18 ||
        next.y > 80 ||
        game.world.blocked(next.x, next.y, game.removed)
      )
        continue;
      visited.add(key(next));
      queue.push(next);
    }
  }
  assert.ok(
    visited.has(key(site.entrance)),
    'the notice approach reaches the actual south doorway',
  );
  assert.ok(visited.has(key(chest)), 'the journal target is reachable through world collision');
  assert.ok(
    dist(chest, site.entrance) > 15,
    'the archive is inside the excavation, not beside the notice',
  );

  // Isolate archive transaction semantics from the separate combat playtest.
  Object.assign(game.player, { x: chest.x, y: chest.y });
  const before = game.save();
  game.interact(chest.id);
  assert.ok(game.opened.has(chest.id));
  assert.equal(game.player.coins, before.player.coins + 12);
  assert.equal(
    game.carried,
    Object.values(before.inventory).reduce((sum, n) => sum + (n ?? 0), 0) + 6,
  );
  assert.equal(game.inventory.ore, (before.inventory.ore ?? 0) + 2);
  assert.equal(game.inventory.rations, (before.inventory.rations ?? 0) + 1);
  const herbDeltas = (['cequin', 'heartleaf', 'emberroot'] as const).map(
    (item) => (game.inventory[item] ?? 0) - (before.inventory[item] ?? 0),
  );
  assert.deepEqual(
    herbDeltas.sort(),
    [0, 0, 3],
    'exactly one seeded botanical supply is recovered',
  );
  assert.equal(quest.complete, true);
  assert.equal(quest.stage, 1);
  const archiveEntry = game.journal.find((entry) => entry.title === 'A record beneath the frost');
  assert.match(archiveEntry?.text ?? '', /Sallas/);
  const recovered = game.save();
  const restored = Stichos.restore(JSON.parse(JSON.stringify(recovered)));
  restored.interact(chest.id);
  restored.interact(chest.id);
  assert.deepEqual(restored.inventory, recovered.inventory);
  assert.equal(restored.player.coins, recovered.player.coins);
  assert.deepEqual(restored.journal, recovered.journal);
  assert.ok(restored.quests.find((q) => q.id === quest.id)?.complete);
});

test('an archive with insufficient pack space remains closed and incomplete until the whole reward fits', () => {
  const game = new Stichos(104);
  const { site, notice, chest } = vaultFixture(game);
  Object.assign(game.player, { x: notice.x, y: notice.y });
  game.interact(notice.id);
  game.choose('vault:survey');
  Object.assign(game.player, { x: chest.x, y: chest.y });
  game.inventory = { cequin: 55 }; // Five free slots; the complete archive package needs six.
  const before = game.save();
  game.interact(chest.id);
  assert.equal(game.opened.has(chest.id), false);
  assert.deepEqual(game.inventory, before.inventory);
  assert.equal(game.player.coins, before.player.coins);
  assert.deepEqual(game.quests, before.quests);
  assert.deepEqual(game.journal, before.journal);
  const restored = Stichos.restore(game.save());
  assert.equal(restored.opened.has(chest.id), false);
  restored.player.breath = 60;
  restored.use('cequin');
  assert.equal(restored.carried, 54, 'using one carried leaf creates exactly enough space');
  restored.interact(chest.id);
  assert.equal(restored.carried, 60);
  assert.equal(restored.player.coins, before.player.coins + 12);
  assert.ok(restored.opened.has(chest.id));
  assert.ok(restored.quests.find((q) => q.id === `${site.id}:survey`)?.complete);
});

test('finding the vault notice after looting its archive records an already-complete survey', () => {
  const game = new Stichos(19);
  const { site, notice, chest } = vaultFixture(game);
  Object.assign(game.player, { x: chest.x, y: chest.y });
  game.interact(chest.id);
  assert.ok(game.opened.has(chest.id));
  assert.ok(!game.quests.some((q) => q.id === `${site.id}:survey`));
  const restored = Stichos.restore(game.save());
  const inventory = structuredClone(restored.inventory),
    coins = restored.player.coins;
  Object.assign(restored.player, { x: notice.x, y: notice.y });
  restored.interact(notice.id);
  restored.choose('vault:survey');
  const survey = restored.quests.find((q) => q.id === `${site.id}:survey`)!;
  assert.ok(survey.complete);
  assert.equal(survey.stage, 1);
  assert.deepEqual(survey.target, site.reward);
  assert.match(survey.objective, /recovered/);
  assert.deepEqual(restored.inventory, inventory);
  assert.equal(restored.player.coins, coins);
  restored.interact(notice.id);
  restored.choose('vault:survey');
  assert.equal(restored.quests.filter((q) => q.id === survey.id).length, 1);
  assert.ok(Stichos.restore(restored.save()).quests.find((q) => q.id === survey.id)?.complete);
});

test('wild generation-two plants yield exactly their displayed botanical profile and stay harvested after restoration', () => {
  const game = new Stichos(3886, 2);
  const plants = game.world
    .propsAround(120, 0, 48)
    .filter((p) => game.world.tile(p.x, p.y).biome !== 'settlement');
  for (const kind of ['cequin', 'heartleaf', 'emberroot', 'mushroom'] as const) {
    const plant = plants.find((p) => p.kind === kind)!;
    assert.ok(plant && !plant.id.startsWith('origin:'));
    const displayed = game.botanicalProfile(plant)!;
    assert.ok(displayed.yield >= 1 && displayed.yield <= 4);
    assert.ok(displayed.name && displayed.construction);
    assert.ok(!game.world.blocked(plant.x, plant.y));
    Object.assign(game.player, { x: plant.x, y: plant.y });
    const item: ItemId = kind === 'mushroom' ? 'rations' : kind;
    const before = game.inventory[item] ?? 0;
    game.drainEvents();
    game.interact(plant.id);
    assert.equal(game.inventory[item], before + displayed.yield);
    assert.ok(game.removed.has(plant.id));
    assert.ok(
      game
        .drainEvents()
        .some(
          (event) => event.kind === 'harvest' && event.text?.includes(displayed.name.toLowerCase()),
        ),
    );
    const saved = game.save();
    const restored = Stichos.restore(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(restored.botanicalProfile(plant), displayed);
    restored.interact(plant.id);
    restored.interact(plant.id);
    assert.deepEqual(
      restored.inventory,
      saved.inventory,
      'a removed plant cannot be harvested again after loading',
    );
    assert.ok(restored.removed.has(plant.id));
  }
});

test('a wild harvest that does not fit leaves the whole plant intact until a consumable frees enough space', () => {
  const game = new Stichos(3886, 2);
  const plant = game.world
    .propsAround(120, 0, 48)
    .find(
      (p) =>
        game.world.tile(p.x, p.y).biome !== 'settlement' &&
        (game.botanicalProfile(p)?.yield ?? 0) >= 2,
    )!;
  assert.ok(plant);
  const displayed = game.botanicalProfile(plant)!;
  Object.assign(game.player, { x: plant.x, y: plant.y });
  game.inventory = { rations: game.capacity - displayed.yield + 1 };
  const before = game.save();
  game.interact(plant.id);
  assert.equal(game.removed.has(plant.id), false);
  assert.deepEqual(
    game.inventory,
    before.inventory,
    'harvesting never silently accepts a partial yield',
  );
  assert.equal(game.player.coins, before.player.coins);
  assert.deepEqual(game.quests, before.quests);
  assert.deepEqual(game.journal, before.journal);
  const restored = Stichos.restore(game.save());
  restored.player.stamina = 50;
  restored.use('rations');
  assert.equal(restored.capacity - restored.carried, displayed.yield);
  const item = (plant.kind === 'mushroom' ? 'rations' : plant.kind) as ItemId;
  const amount = restored.inventory[item] ?? 0;
  restored.interact(plant.id);
  assert.equal(restored.inventory[item], amount + displayed.yield);
  assert.equal(restored.carried, restored.capacity);
  assert.ok(restored.removed.has(plant.id));
});

test('legacy wilderness and the origin teaching garden keep their established cequin and other plant yields', () => {
  for (const generation of [1, 2] as const) {
    const game = new Stichos(3886, generation);
    const plants =
      generation === 1
        ? game.world
            .propsAround(120, 0, 48)
            .filter((p) => game.world.tile(p.x, p.y).biome !== 'settlement')
        : game.world.propsAround(0, 5, 12).filter((p) => p.id.startsWith('origin:'));
    for (const kind of ['cequin', 'heartleaf', 'emberroot', 'mushroom'] as const) {
      const plant = plants.find((p) => p.kind === kind)!;
      assert.ok(plant);
      const expected = kind === 'cequin' ? 3 : 2;
      assert.equal(game.botanicalProfile(plant)?.yield, expected);
      const item: ItemId = kind === 'mushroom' ? 'rations' : kind;
      const before = game.inventory[item] ?? 0;
      Object.assign(game.player, { x: plant.x, y: plant.y });
      game.interact(plant.id);
      assert.equal(game.inventory[item], before + expected);
      assert.ok(game.removed.has(plant.id));
    }
  }
});

test('correspondence requires a real journey and lets disclosure change family trust without repeat payments', () => {
  const game = new Stichos(3886);
  npc(game, 'origin-archivist');
  game.choose('dispatch:request');
  const job = game.save().correspondenceJobs[0];
  assert.ok(job);
  assert.notEqual(job.settlementId, 'origin');
  assert.ok(dist(job.sourcePoint, job.target) > 50);
  const resident = game.world
    .npcsAround(job.target.x, job.target.y, 2)
    .find((n) => n.id === job.recipientId);
  assert.ok(resident, 'the address belongs to an actual generated resident');
  const coins = game.player.coins;
  game.choose(`dispatch:deliver:${job.sourceId}`);
  assert.equal(game.player.coins, coins, 'an accepted task cannot be completed at its source');
  const duplicate = new Stichos(3886);
  npc(duplicate, 'origin-archivist');
  duplicate.choose('dispatch:request');
  assert.deepEqual(
    duplicate.save().correspondenceJobs[0],
    job,
    'the same source generates the same addressed dispatch',
  );
  game.choose('close');
  game.use('cequin');
  travelRoads(game, job.target);
  assert.ok(game.distanceTraveled > 60);
  assert.equal(game.phase, 'playing');
  const arrival = game.save();
  for (const [choice, sourceTrust, recipientTrust, payment] of [
    ['deliver', 7, 2, job.reward],
    ['reveal', -6, 8, Math.floor(job.reward * 0.6)],
    ['withhold', 3, -5, 0],
  ] as const) {
    const branch = Stichos.restore(arrival);
    branch.interact(job.recipientId);
    assert.ok(branch.dialogue?.choices.some((c) => c.id === `dispatch:${choice}:${job.sourceId}`));
    const before = branch.player.coins;
    branch.choose(`dispatch:${choice}:${job.sourceId}`);
    assert.equal(branch.player.coins, before + payment);
    if (job.sourceClan === job.recipientClan)
      assert.equal(branch.reputation[job.sourceClan], sourceTrust + recipientTrust);
    else {
      assert.equal(branch.reputation[job.sourceClan], sourceTrust);
      assert.equal(branch.reputation[job.recipientClan], recipientTrust);
    }
    assert.ok(branch.quests.find((q) => q.id === `correspondence:${job.sourceId}:1`)?.complete);
    branch.choose(`dispatch:${choice}:${job.sourceId}`);
    branch.interact(job.recipientId);
    branch.choose(`dispatch:${choice}:${job.sourceId}`);
    assert.equal(branch.player.coins, before + payment, 'repeat conversations cannot pay again');
    const restored = Stichos.restore(branch.save());
    assert.equal(
      restored.save().correspondenceJobs[0].status,
      choice === 'deliver' ? 'delivered' : choice === 'reveal' ? 'revealed' : 'withheld',
    );
  }
});

test('a dead correspondence recipient can be cancelled at a noticeboard and replaced without reward farming', () => {
  const game = new Stichos(104);
  npc(game, 'origin-engineer');
  game.choose('dispatch:request');
  const job = game.save().correspondenceJobs[0];
  game.choose('close');
  game.use('cequin');
  travelRoads(game, job.target);
  const recipient = game.npcs.find((n) => n.id === job.recipientId)!;
  assert.ok(recipient);
  recipient.hp = 1;
  game.attack(recipient);
  assert.ok(game.removed.has(recipient.id));
  const deadSave = game.save();
  const restored = Stichos.restore(deadSave);
  assert.equal(restored.save().correspondenceJobs[0].status, 'active');
  restored.use('cequin');
  travelRoads(restored, { x: -2, y: 1 });
  const notice = prop(restored, (p) => p.kind === 'notice' && p.id.startsWith('origin:'));
  walkTo(restored, notice);
  restored.interact(notice.id);
  const cancel = `dispatch:cancel:${job.sourceId}`;
  assert.match(
    restored.dialogue?.choices.find((c) => c.id === cancel)?.label ?? '',
    /cannot receive/,
  );
  const before = { coins: restored.player.coins, xp: restored.player.xp };
  restored.choose(cancel);
  assert.equal(restored.save().correspondenceJobs[0].status, 'cancelled');
  assert.equal(restored.player.coins, before.coins);
  assert.equal(restored.player.xp, before.xp, 'cancellation never grants completion experience');
  npc(restored, 'origin-engineer');
  restored.choose('dispatch:request');
  const replacement = restored.save().correspondenceJobs[0];
  assert.equal(replacement.number, 2);
  assert.equal(replacement.status, 'active');
  assert.notEqual(replacement.recipientId, recipient.id);
  assert.ok(!restored.removed.has(replacement.recipientId));
  const saved = restored.save();
  assert.throws(() =>
    Stichos.restore({ ...saved, correspondenceJobs: [{ ...replacement, status: 'delivered' }] }),
  );
  assert.throws(() =>
    Stichos.restore({ ...saved, correspondenceJobs: [replacement, replacement] }),
  );
  const { correspondenceJobs: _dispatches, ...legacy } = saved;
  assert.equal(Stichos.restore(legacy).save().correspondenceJobs.length, 0);
});

test('the opening story consumes gathered materials, repairs a radio, and permits voluntary mental travel without replacing the world', () => {
  const game = new Stichos(3886);
  opening(game);
  assert.equal(game.inventory.cequin ?? 0, 0);
  assert.ok(game.reputation[0] < 0);
  assert.ok(game.reputation[2] > 0);
  assert.equal(game.transferReady, false);
  const resources = game.world
    .propsAround(0, 0, 15)
    .filter((p) => p.id.startsWith('origin:timber:') || p.id.startsWith('origin:ore:'));
  assert.equal(resources.length, 4);
  for (const resource of resources) gather(game, resource);
  assert.equal(game.inventory.wood, 4);
  assert.equal(game.inventory.ore, 4);
  const bench = prop(game, (p) => p.kind === 'workbench' && p.x === 4 && p.y === 5);
  walkTo(game, bench);
  game.craft('lens');
  assert.equal(game.inventory.lens, 1);
  const radio = prop(game, (p) => p.id === 'origin-radio');
  walkTo(game, radio);
  game.interact(radio.id);
  game.choose('repair-radio');
  game.choose('close');
  assert.equal(game.storyStage, 4);
  assert.equal(game.transferReady, true);
  assert.equal(game.inventory.lens ?? 0, 0);
  assert.equal(game.inventory.ore ?? 0, 0);
  assert.equal(game.inventory.wood, 1);
  assert.ok(game.opened.has(radio.id));
  assert.equal(game.phase, 'playing');
  assert.ok(game.quests.find((q) => q.id === 'beyond-the-signal' && !q.complete));
  const shrine = prop(game, (p) => p.kind === 'shrine' && p.x === -2 && p.y === -2);
  walkTo(game, shrine);
  game.rest();
  const before = game.save();
  const candidate = game.transferCandidate!;
  assert.ok(candidate && ['pilgrim', 'refugee', 'guard'].includes(candidate.role));
  game.interact(shrine.id);
  assert.ok(
    game.dialogue?.choices.find((c) => c.id === 'transfer')?.label.includes(candidate.name),
  );
  game.choose('transfer');
  assert.deepEqual({ x: game.player.x, y: game.player.y }, { x: candidate.x, y: candidate.y });
  assert.equal(game.player.bodyName, candidate.name);
  assert.equal(game.player.appearance.coat, candidate.appearance.coat);
  assert.equal(game.player.clan, candidate.clan);
  assert.equal(game.occupiedNpcId, candidate.id);
  assert.ok(
    !game.npcs.some((n) => n.id === candidate.id),
    'the occupied body has no NPC duplicate',
  );
  const priest = game.npcs.find((n) => n.id.startsWith('body:theo-priest:'))!;
  assert.ok(priest, 'the original priest remains a real human in the world');
  assert.deepEqual({ x: priest.x, y: priest.y }, { x: before.player.x, y: before.player.y });
  assert.deepEqual([...game.removed], before.removed);
  assert.notDeepEqual(
    game.inventory,
    before.inventory,
    'the host supplies a different physical pack',
  );
  const priestBelongings = game.save().bodyPossessions.find((body) => body.npcId === priest.id)!;
  assert.deepEqual(priestBelongings.inventory, before.inventory);
  assert.equal(priestBelongings.coins, before.player.coins);
  assert.equal(game.player.name, 'Theo Bishop');
  assert.notDeepEqual(game.player.appearance, before.player.appearance);
  assert.ok(game.drainEvents().some((e) => e.kind === 'transfer'));
  const restored = Stichos.restore(JSON.parse(JSON.stringify(game.save())));
  assert.equal(restored.transferReady, true);
  assert.deepEqual(restored.inventory, game.inventory);
  assert.deepEqual(restored.quests, game.quests);
  assert.deepEqual([...restored.removed], [...game.removed]);
  assert.equal(restored.occupiedNpcId, candidate.id);
  assert.ok(!restored.npcs.some((n) => n.id === candidate.id));
  walkTo(restored, shrine);
  const leaving = { x: restored.player.x, y: restored.player.y };
  assert.equal(
    restored.transferCandidate?.id,
    priest.id,
    'the original priest is a possible return body',
  );
  restored.reincarnate();
  assert.equal(restored.occupiedNpcId, priest.id);
  assert.equal(restored.player.bodyName, 'The priest');
  assert.equal(restored.player.appearance.coat, before.player.appearance.coat);
  assert.deepEqual(
    restored.inventory,
    before.inventory,
    'returning to the priest restores the pack left behind',
  );
  assert.equal(restored.player.coins, before.player.coins);
  assert.deepEqual([...restored.weapons], before.weapons);
  const released = restored.npcs.find((n) => n.id === candidate.id)!;
  assert.ok(released, 'leaving a living host releases that person');
  assert.deepEqual({ x: released.x, y: released.y }, leaving);
  assert.ok(!restored.npcs.some((n) => n.id === priest.id));
  assert.equal(Stichos.restore(restored.save()).occupiedNpcId, priest.id);
});

test('body possessions survive repeated possession and restoration without refreshing consumed supplies', () => {
  const game = new Stichos(3886);
  game.storyStage = 4;
  game.weapons.add('bow');
  game.equip('bow');
  game.inventory.lens = 2;
  game.player.coins = 61;
  game.player.xp = 37;
  const shrine = prop(game, (p) => p.kind === 'shrine');
  walkTo(game, shrine);
  const priest = game.save();
  const firstHost = game.transferCandidate!;
  game.reincarnate();
  assert.ok(!game.weapons.has('bow'), 'the priest’s bow stays with the priest');
  assert.equal(game.inventory.lens, undefined);
  assert.equal(game.player.xp, 37, 'experience is a memory');
  game.use('cequin');
  const hostInventory = structuredClone(game.inventory);
  const hostCoins = game.player.coins;
  const hostWeapons = [...game.weapons];
  walkTo(game, shrine);
  assert.ok(game.transferCandidate?.id.startsWith('body:theo-priest:'));
  game.reincarnate();
  assert.deepEqual(game.inventory, priest.inventory);
  assert.equal(game.player.coins, 61);
  assert.equal(game.player.appearance.weapon, 'bow');
  assert.deepEqual([...game.weapons], priest.weapons);
  const saved = game.save();
  assert.equal(
    saved.bodyPossessions.length,
    1,
    'active possessions have only one storage location',
  );
  assert.equal(saved.bodyPossessions[0].npcId, firstHost.id);
  const restored = Stichos.restore(saved);
  assert.equal(restored.transferCandidate?.id, firstHost.id);
  restored.reincarnate();
  assert.deepEqual(
    restored.inventory,
    hostInventory,
    're-entering a body does not regenerate its starter pack',
  );
  assert.equal(restored.player.coins, hostCoins);
  assert.deepEqual([...restored.weapons], hostWeapons);
  assert.equal(restored.player.xp, 37);
  assert.equal(restored.save().bodyPossessions[0].npcId, game.occupiedNpcId);

  for (const bodyPossessions of [
    [saved.bodyPossessions[0], saved.bodyPossessions[0]],
    [{ ...saved.bodyPossessions[0], npcId: saved.occupiedNpcId }],
    [{ ...saved.bodyPossessions[0], inventory: { cequin: 61 } }],
    [{ ...saved.bodyPossessions[0], equipped: 'bow', weapons: ['staff'] }],
  ])
    assert.throws(() => Stichos.restore({ ...saved, bodyPossessions }));
  const { bodyPossessions: _ledger, ...legacy } = saved;
  assert.deepEqual(
    Stichos.restore(legacy).inventory,
    game.inventory,
    'older saves keep their current body’s pack',
  );
});

test('a shrine offers distinct bodies and revalidates the exact chosen person before possession', () => {
  const game = new Stichos(3886);
  game.storyStage = 4;
  const shrine = prop(game, (p) => p.kind === 'shrine');
  walkTo(game, shrine);
  game.interact(shrine.id);
  const candidates = game.transferCandidates;
  assert.equal(candidates.length, 3);
  const first = candidates[0];
  const alternative = candidates[1];
  const option = game.dialogue?.choices.find((c) => c.id === `transfer:${alternative.id}`);
  assert.ok(option?.label.includes(alternative.name));
  assert.ok(option?.detail?.includes(game.world.clans[alternative.clan].name));
  assert.match(option?.detail ?? '', /health.*coins/);
  game.removed.add(first.id);
  const before = game.save();
  game.choose('transfer');
  assert.equal(
    game.occupiedNpcId,
    null,
    'a stale first option must not silently choose somebody else',
  );
  assert.deepEqual(game.player, before.player);
  game.interact(shrine.id);
  game.reincarnate('origin-archivist');
  assert.equal(game.occupiedNpcId, null, 'essential actors cannot be selected by a supplied ID');
  game.reincarnate(alternative.id);
  assert.equal(game.occupiedNpcId, alternative.id);
  assert.equal(game.player.bodyName, alternative.name);
  assert.deepEqual({ x: game.player.x, y: game.player.y }, { x: alternative.x, y: alternative.y });
});

test('an ethical alternative cannot pay twice or invent cequin and has different family consequences', () => {
  const game = new Stichos(8);
  npc(game, 'origin-botanist');
  game.choose('learn-cequin');
  game.use('cequin');
  const coins = game.player.coins;
  game.choose('aid-brown');
  assert.equal(game.storyStage, 1);
  assert.equal(game.player.coins, coins);
  game.choose('close');
  gather(
    game,
    prop(game, (p) => p.kind === 'cequin'),
  );
  npc(game, 'origin-botanist');
  game.choose('learn-cequin');
  game.choose('aid-brown');
  assert.equal(game.player.coins, coins + 12);
  assert.ok(game.reputation[0] > 0 && game.reputation[2] < 0);
  const after = game.save();
  game.choose('aid-brown');
  assert.deepEqual(game.inventory, after.inventory);
  assert.equal(game.player.coins, after.player.coins);
});

test('harvest, pack capacity, consumables and crafting form a finite resource loop', () => {
  const game = new Stichos(19);
  const plant = prop(game, (p) => p.kind === 'heartleaf');
  gather(game, plant);
  assert.equal(game.inventory.heartleaf, 2);
  game.interact(plant.id);
  assert.equal(game.inventory.heartleaf, 2, 'the same plant cannot be gathered twice');
  game.craft('salve');
  assert.equal(game.inventory.heartleaf ?? 0, 0);
  assert.equal(game.inventory.salve, 1);
  game.use('salve');
  assert.equal(game.inventory.salve, 1, 'do not waste medicine at full health');
  game.player.hp = 40;
  game.use('salve');
  assert.equal(game.player.hp, 75);
  assert.equal(game.inventory.salve ?? 0, 0);
  game.use('salve');
  assert.equal(game.player.hp, 75);
  const ore = prop(game, (p) => p.id === 'origin:ore:1');
  walkTo(game, ore);
  game.inventory = { cequin: 59 };
  game.interact(ore.id);
  assert.ok(!game.removed.has(ore.id), 'failed pickup must not destroy the rock');
  game.inventory = { wood: 1, ore: 2 };
  walkTo(game, { x: 0, y: -6 });
  game.craft('lens');
  assert.deepEqual(game.inventory, { wood: 1, ore: 2 }, 'a lens requires a real workbench');
  for (let i = 0; i < 190; i++) game.world.chunk(i + 30, 10);
  assert.ok(game.removed.has(plant.id));
  const restored = Stichos.restore(game.save());
  assert.ok(
    restored.removed.has(plant.id),
    'gathered plants stay gone after chunk eviction and reload',
  );
});

test('merchant transactions revalidate coins, stock in the player pack, and ownership', () => {
  const game = new Stichos(17);
  const merchant = game.world.npcsAround(0, 0, 20).find((n) => n.role === 'merchant')!;
  npc(game, merchant.id);
  const coins = game.player.coins;
  game.choose('buy:cequin');
  assert.equal(game.inventory.cequin, 4);
  assert.equal(game.player.coins, coins - ITEMS.cequin.price);
  game.choose('sell:cequin');
  assert.equal(game.inventory.cequin, 3);
  assert.ok(game.player.coins < coins, 'buy/sell is not an infinite coin exploit');
  game.player.coins = 0;
  const pack = structuredClone(game.inventory);
  game.choose('buy:cequin');
  assert.deepEqual(game.inventory, pack);
  game.choose('close');
  game.equip('bow');
  assert.equal(game.player.appearance.weapon, 'staff');
  game.player.coins = 32;
  game.interact(merchant.id);
  game.choose('weapon:bow');
  game.choose('close');
  game.equip('bow');
  assert.equal(game.player.appearance.weapon, 'bow');
  assert.equal(game.player.coins, 0);
});

test('repeatable botanical supply jobs point at real plots and only reward actual deliveries once', () => {
  const game = new Stichos(43);
  npc(game, 'origin-botanist');
  game.choose('supply:accept');
  game.choose('close');
  const quest = game.quests.find((q) => q.id.startsWith('supply:'))!;
  assert.ok(quest?.target);
  const target = game.world
    .propsAround(quest.target.x, quest.target.y, 1)
    .find(
      (p) =>
        p.x === quest.target!.x &&
        p.y === quest.target!.y &&
        ['cequin', 'heartleaf', 'emberroot'].includes(p.kind),
    );
  assert.ok(target, 'quest target must be an actual generated botanical resource');
  const item = target.kind as 'cequin' | 'heartleaf' | 'emberroot';
  const plants = game.world.propsAround(0, 0, 24).filter((p) => p.kind === item);
  for (const p of plants) {
    if ((game.inventory[item] ?? 0) >= 3) break;
    gather(game, p);
  }
  assert.ok((game.inventory[item] ?? 0) >= 3);
  npc(game, 'origin-botanist');
  const coins = game.player.coins;
  game.choose('supply:deliver');
  assert.equal(game.player.coins, coins + 14);
  assert.equal(quest.complete, true);
  game.choose('supply:deliver');
  assert.equal(game.player.coins, coins + 14);
  game.choose('close');
  game.interact('origin-botanist');
  game.choose('supply:accept');
  assert.equal(game.quests.filter((q) => q.id.startsWith('supply:')).length, 2);
});

function actor(game: Stichos, id: string, x: number, y: number, hostile = true): Npc {
  return {
    id,
    name: id,
    seed: 27,
    x,
    y,
    role: hostile ? 'raider' : 'pilgrim',
    clan: 3,
    appearance: appearance(27, 'raider', 3),
    hp: 50,
    maxHp: 50,
    home: { x, y },
    speed: 0,
    heading: 0,
    phase: 0,
    hostile,
    cooldown: 10,
  };
}

function enemyArena(
  kind: 'bow' | 'sword',
  ownerSeed = 27,
  player: Point = { x: 4000, y: 4000 },
  enemy: Point = { x: 4000, y: 3995 },
) {
  const game = new Stichos(3886);
  Object.assign(game.player, player);
  for (const npc of game.world.npcsAround(player.x, player.y, 22)) game.removed.add(npc.id);
  const hostile = actor(game, 'weapon-arena-enemy', enemy.x, enemy.y);
  hostile.appearance = appearance(ownerSeed, 'raider', 3);
  hostile.appearance.weapon = kind;
  hostile.hp = 49; // A meaningful persistent actor survives the normal streaming refresh.
  hostile.speed = 0.001;
  hostile.cooldown = 0;
  game.npcs = [hostile];
  assert.ok(!game.world.blocked(player.x, player.y));
  assert.ok(!game.world.blocked(enemy.x, enemy.y));
  return game;
}

test('enemy bows give a visible fixed-aim windup and a traveling shot that can be dodged', () => {
  const hit = enemyArena('bow');
  hit.update(0.02, still);
  assert.equal(hit.player.hp, 100, 'aiming does not deal instant damage at range');
  assert.ok(hit.effects.some((e) => e.text === 'Drawing bow'));
  assert.ok(!hit.effects.some((e) => e.kind === 'arrow'));
  let released = false,
    releasedAt = 0;
  for (let i = 0; i < 90 && hit.player.hp === 100; i++) {
    hit.update(0.02, still);
    if (!released && hit.effects.some((e) => e.kind === 'arrow')) {
      released = true;
      releasedAt = hit.time;
    }
  }
  assert.ok(released && releasedAt >= 0.4, 'the warning precedes an actual projectile');
  assert.ok(hit.player.hp >= 90 && hit.player.hp <= 95, 'one shot has bounded encounter damage');
  assert.ok(hit.time - releasedAt > 0.5, 'damage waits for the arrow to cover the distance');

  const dodged = enemyArena('bow');
  dodged.update(0.02, still);
  let sawArrow = false;
  for (let i = 0; i < 70; i++) {
    dodged.update(0.02, i < 45 ? { x: 1, y: 0, run: false } : still);
    sawArrow ||= dodged.effects.some((e) => e.kind === 'arrow');
  }
  assert.ok(dodged.player.x > 4002.5);
  assert.ok(
    sawArrow,
    'the enemy really releases its locked aim rather than cancelling on movement',
  );
  assert.equal(dodged.player.hp, 100, 'moving away from the aimed line avoids the shot');
});

test('enemy bow aim respects obstruction and released arrows collide with newly closed cover', () => {
  const game = enemyArena('bow', 27, { x: 5, y: 8 }, { x: 5, y: 4 });
  const rocks = game.world.propsAround(5, 6, 2).filter((p) => p.kind === 'rock' && p.x === 5);
  assert.ok(rocks.length >= 2);
  for (let i = 0; i < 60; i++) game.update(0.02, still);
  assert.equal(game.player.hp, 100);
  assert.ok(
    !game.effects.some((e) => e.kind === 'arrow' || e.text === 'Drawing bow'),
    'solid terrain prevents aiming through cover',
  );
  for (const rock of rocks) game.removed.add(rock.id);
  let arrow = game.effects.find((e) => e.kind === 'arrow');
  for (let i = 0; i < 60 && !arrow; i++) {
    game.update(0.02, still);
    arrow = game.effects.find((e) => e.kind === 'arrow');
  }
  assert.ok(arrow, 'opening the line allows a shot');
  const cover = rocks.find((p) => p.y === 6)!;
  assert.ok(arrow.y < cover.y - 0.5);
  game.removed.delete(cover.id); // A world obstacle closes after release, before impact.
  for (let i = 0; i < 70; i++) game.update(0.02, still);
  assert.equal(
    game.player.hp,
    100,
    'projectiles cannot pass through cover introduced during flight',
  );
  assert.ok(!game.effects.some((e) => e.kind === 'arrow'));
});

test('generated enemy melee weapons change impact and recovery while a ward interrupts their telegraph', () => {
  const outcomes = new Set<string>();
  for (const seed of [3, 8, 19, 31, 46, 57]) {
    const game = enemyArena('sword', seed, { x: 4000, y: 4000 }, { x: 4000, y: 3999 });
    game.update(0.02, still);
    assert.equal(game.player.hp, 100);
    assert.ok(game.effects.some((e) => e.text === 'Striking'));
    for (let i = 0; i < 30 && game.player.hp === 100; i++) game.update(0.02, still);
    const damage = 100 - game.player.hp;
    assert.ok(damage >= 5 && damage <= 10);
    const recovery = game.npcs.find((n) => n.id === 'weapon-arena-enemy')!.cooldown;
    assert.ok(recovery >= 0.9, 'impact is followed by a fair recovery window');
    outcomes.add(`${damage}/${recovery.toFixed(2)}/${game.time.toFixed(2)}`);
    const hp = game.player.hp;
    for (let i = 0; i < 30; i++) game.update(0.02, still);
    assert.equal(game.player.hp, hp, 'the enemy cannot hit again during recovery');
  }
  assert.ok(outcomes.size >= 3, 'different generated constructions have different actual handling');
  const interrupted = enemyArena('sword', 31, { x: 4000, y: 4000 }, { x: 4000, y: 3999 });
  interrupted.update(0.02, still);
  interrupted.ward();
  for (let i = 0; i < 30; i++) interrupted.update(0.02, still);
  assert.equal(interrupted.player.hp, 100, 'a ward cancels the pending swing before impact');
});

test('a live bow within actual reach prevents resting and voluntary transfer unless distant cover blocks its line', () => {
  const game = enemyArena('bow', 27, { x: -1, y: -2 }, { x: -1, y: 4 });
  game.storyStage = 4;
  const host = actor(game, 'quiet-shrine-host', 0, -2, false);
  game.npcs.push(host);
  assert.ok(game.transferCandidate);
  game.player.hp = 60;
  const time = game.time;
  game.rest();
  assert.equal(game.player.hp, 60, 'an archer six tiles away is still a live threat');
  assert.equal(game.time, time);
  game.reincarnate();
  assert.equal(game.occupiedNpcId, null);
  assert.ok(game.drainEvents().some((e) => e.text === 'An attacker breaks your concentration.'));

  const archer = game.npcs.find((n) => n.id === 'weapon-arena-enemy')!;
  Object.assign(game.player, { x: -5, y: 2 });
  Object.assign(archer, { x: -5, y: 8 });
  assert.ok(game.world.blocked(-5, 4), 'a cultivated pine now covers the nearby bench');
  game.rest();
  assert.equal(
    game.player.hp,
    game.player.maxHp,
    'distant obstructed bows do not prevent sheltered rest',
  );
  game.player.hp = 60;
  Object.assign(archer, { x: -4, y: 6 });
  game.rest();
  assert.equal(
    game.player.hp,
    60,
    'the established five-tile nearby-attacker restriction still applies',
  );
});

test('directional melee and a stamina-priced ward distinguish targets and persist deaths', () => {
  const game = new Stichos(31);
  const front = actor(game, 'front-raider', game.player.x + 0.7, game.player.y);
  const back = actor(game, 'back-raider', game.player.x - 1, game.player.y);
  const bystander = actor(game, 'innocent', game.player.x, game.player.y + 1, false);
  game.npcs = [front, back, bystander];
  game.attack({ x: game.player.x + 10, y: game.player.y });
  assert.ok(front.hp < 50);
  assert.equal(back.hp, 50);
  assert.equal(bystander.hp, 50);
  const hp = front.hp;
  game.attack(front);
  assert.equal(front.hp, hp, 'attack cooldown is enforced');
  const stamina = game.player.stamina;
  game.ward();
  assert.equal(game.player.stamina, stamina - 30);
  assert.ok(back.hp < 50);
  assert.ok(dist(front, game.player) > 1.3, 'the ward physically repels an attacker');
  assert.equal(bystander.hp, 50, 'defensive ward does not injure a friendly passerby');
  front.hp = 1;
  game.player.attackCooldown = 0;
  game.attack(front);
  assert.equal(front.hp, 0);
  assert.ok(game.removed.has(front.id));
  const restored = Stichos.restore(game.save());
  assert.ok(restored.removed.has(front.id));
  assert.ok(!restored.npcs.some((n) => n.id === front.id));
  game.player.attackCooldown = 0;
  game.player.stamina = 100;
  game.attack(bystander);
  assert.ok(game.reputation[3] < 0);
  assert.equal(bystander.hostile, true);
});

test('long real-input walking crosses chunks continuously with bounded active actors and terrain cache', () => {
  const game = new Stichos(901);
  game.use('cequin');
  const x = game.player.x;
  for (let i = 0; i < 800; i++) game.update(0.1, { x: 0, y: 1, run: false });
  assert.equal(game.phase, 'playing');
  assert.ok(game.player.y > 240);
  assert.equal(game.player.x, x);
  assert.ok(game.distanceTraveled > 235);
  assert.ok(game.visited.size >= 15);
  assert.ok(game.npcs.length <= 64);
  assert.ok(game.world.cacheSize <= 160);
  assert.equal(game.player.name, 'Theo Bishop');
  assert.equal(game.storyStage, 0);
  const saved = game.save();
  assert.ok(
    saved.npcs.length < 10,
    'untouched streamed residents do not accumulate in the permanent save',
  );
  const restored = Stichos.restore(saved);
  assert.deepEqual(restored.player, game.player);
  assert.deepEqual([...restored.visited], [...game.visited]);
});

test('movement normalizes diagonals and cannot tunnel through a solid wall on a delayed frame', () => {
  const a = new Stichos(2),
    b = new Stichos(2);
  a.update(0.1, { x: 1, y: 0, run: false });
  b.update(0.1, { x: 1, y: 1, run: false });
  assert.ok(Math.abs(dist(a.player, a.world.spawn) - dist(b.player, b.world.spawn)) < 1e-8);
  const rock = prop(a, (p) => p.id === 'origin:ore:1');
  walkTo(a, { x: rock.x - 1, y: rock.y });
  // Move onto the adjacent clear center before holding directly into the rock.
  while (a.player.x < rock.x - 1 - 0.02) a.update(0.01, { x: 1, y: 0, run: false });
  a.player.x = rock.x - 1;
  a.player.y = rock.y;
  a.update(60, { x: 1, y: 0, run: true });
  assert.ok(a.player.x < rock.x - 0.7, 'collision radius stops the body before the solid tile');
  const before = structuredClone(a.player);
  a.update(Number.NaN, { x: 1, y: 0, run: false });
  assert.deepEqual(a.player, before);
});

test('save restoration rejects malformed and contradictory state rather than propagating corruption', () => {
  const game = new Stichos(5),
    original = game.save();
  for (const corrupt of [
    null,
    {},
    { ...original, version: 2 },
    { ...original, time: Infinity },
    { ...original, reputation: [0] },
    { ...original, inventory: { cequin: -1 } },
    { ...original, inventory: { cequin: 61 } },
    { ...original, phase: 'lost' },
    { ...original, player: { ...original.player, x: Number.NaN } },
    { ...original, removed: ['same', 'same'] },
  ])
    assert.throws(() => Stichos.restore(corrupt));
  assert.equal(Stichos.restore(original).player.name, 'Theo Bishop');
  const recovered = Stichos.restore(original);
  recovered.inventory.cequin = 0;
  assert.equal(original.inventory.cequin, 3, 'restoring must not alias caller-owned data');
});

test('seeded weapon construction changes real damage, timing, reach and on-hit effects', () => {
  const seen = new Set<string>();
  for (const seed of [3, 8, 19, 31, 46, 57]) {
    const game = new Stichos(seed);
    const profile = game.weaponProfile('staff');
    assert.deepEqual(profile, new Stichos(seed).weaponProfile('staff'));
    seen.add(JSON.stringify(profile));
    const target = actor(game, 'weapon-target', game.player.x + 1, game.player.y);
    target.cooldown = 0;
    game.npcs = [target];
    game.player.breath = 50;
    game.player.warmth = 50;
    game.attack(target);
    assert.equal(target.hp, target.maxHp - profile.damage);
    assert.equal(game.player.attackCooldown, profile.cooldown);
    if (profile.effect === 'stagger') assert.ok(target.cooldown >= 1.35);
    if (profile.effect === 'breath') assert.equal(game.player.breath, 52);
    if (profile.effect === 'warmth') assert.equal(game.player.warmth, 53);
    const restored = Stichos.restore(game.save());
    assert.deepEqual(restored.weaponProfile('staff'), profile);
  }
  assert.ok(seen.size >= 5);
  const game = new Stichos(64);
  game.weapons.add('bow');
  game.equip('bow');
  const target = game.npcs.find((n) => n.role === 'pilgrim')!;
  const damage = game.weaponProfile('bow').damage;
  game.attack(target);
  assert.equal(target.hp, 50, 'a distant bow hit waits for projectile travel');
  for (let i = 0; i < 10; i++) game.update(0.05, still);
  const hit = game.npcs.find((n) => n.id === target.id);
  assert.ok(
    hit && hit.hp === 50 - damage,
    'the arrow travels across open ground and hits a humanoid',
  );
});

test('a large exploration history and distant road position still round-trip without a scene boundary', () => {
  const game = new Stichos(13);
  for (let i = 0; i < 100005; i++) game.visited.add(`${i},0`);
  const save = game.save();
  save.player.x = 1_000_000_010;
  save.player.y = 0;
  save.distanceTraveled = 1_000_000_100;
  const restored = Stichos.restore(save);
  assert.equal(restored.visited.size, game.visited.size);
  assert.equal(restored.player.x, save.player.x);
  assert.equal(restored.distanceTraveled, save.distanceTraveled);
  assert.deepEqual(Stichos.restore(restored.save()).player, restored.player);
});

test('losing a body freezes action and clinic recovery preserves the world before mind travel is unlocked', () => {
  const game = new Stichos(104);
  gather(
    game,
    prop(game, (p) => p.kind === 'cequin'),
  );
  const removed = [...game.removed];
  const inventory = structuredClone(game.inventory);
  const appearanceBefore = structuredClone(game.player.appearance);
  game.player.hp = 0.1;
  game.player.breath = 0;
  game.player.warmth = 0;
  game.player.cequinTime = 0;
  game.update(0.25, still);
  assert.equal(game.phase, 'lost');
  assert.equal(game.player.hp, 0);
  const position = { x: game.player.x, y: game.player.y };
  game.update(0.25, { x: 1, y: 0, run: true });
  game.attack({ x: game.player.x + 1, y: game.player.y });
  assert.deepEqual({ x: game.player.x, y: game.player.y }, position);
  const restored = Stichos.restore(game.save());
  assert.equal(restored.phase, 'lost');
  restored.reincarnate();
  assert.equal(restored.phase, 'playing');
  assert.equal(restored.player.hp, restored.player.maxHp);
  assert.deepEqual(restored.player.appearance, appearanceBefore);
  assert.deepEqual(restored.inventory, inventory);
  assert.deepEqual([...restored.removed], removed);
  assert.equal(restored.storyStage, 0);
  assert.deepEqual({ x: restored.player.x, y: restored.player.y }, restored.world.spawn);
});

test('post-signal loss without an answering host revives the occupied body at the clinic', () => {
  const game = new Stichos(104);
  game.storyStage = 4;
  const shrine = prop(game, (p) => p.kind === 'shrine');
  walkTo(game, shrine);
  assert.ok(game.transferCandidate);
  game.reincarnate();
  const identity = {
    id: game.occupiedNpcId,
    name: game.player.bodyName,
    appearance: structuredClone(game.player.appearance),
    clan: game.player.clan,
  };
  assert.ok(identity.id);
  walkTo(game, shrine);
  for (const n of [...game.world.npcsAround(0, 0, 30), ...game.npcs]) {
    if (n.id !== identity.id && ['pilgrim', 'refugee', 'guard'].includes(n.role))
      game.removed.add(n.id);
  }
  game.npcs = game.npcs.filter((n) => !game.removed.has(n.id));
  assert.equal(game.transferCandidate, null);
  const position = { x: game.player.x, y: game.player.y };
  game.reincarnate();
  assert.deepEqual({ x: game.player.x, y: game.player.y }, position);
  assert.equal(game.phase, 'playing', 'voluntary travel without a host leaves the body alone');

  game.player.hp = 0.1;
  game.player.breath = game.player.warmth = game.player.cequinTime = 0;
  game.update(0.25, still);
  assert.equal(game.phase, 'lost');
  const restored = Stichos.restore(game.save());
  assert.equal(restored.transferCandidate, null);
  const inventory = structuredClone(restored.inventory);
  restored.reincarnate();
  assert.equal(restored.phase, 'playing');
  assert.equal(restored.player.hp, restored.player.maxHp);
  assert.equal(restored.occupiedNpcId, identity.id);
  assert.equal(restored.player.bodyName, identity.name);
  assert.equal(restored.player.clan, identity.clan);
  assert.deepEqual(restored.player.appearance, identity.appearance);
  assert.deepEqual(restored.inventory, inventory);
  assert.deepEqual({ x: restored.player.x, y: restored.player.y }, restored.world.spawn);
  assert.ok(!restored.npcs.some((n) => n.id === identity.id));
  assert.match(restored.drainEvents().find((e) => e.kind === 'transfer')?.text ?? '', /clinic/);
  assert.equal(Stichos.restore(restored.save()).occupiedNpcId, identity.id);
});

test('legacy origin saves migrate displaced bodies locally while current and distant saves stay strict', () => {
  const game = new Stichos(3886);
  const { terrainRevision: _revision, ...legacy } = game.save();
  const oldPosition = { x: 11, y: -3 };
  assert.ok(
    game.world.blocked(oldPosition.x, oldPosition.y),
    'the wider cathedral now has a wall here',
  );
  Object.assign(legacy.player, oldPosition);
  legacy.restAnchor = { x: -11, y: -3 };
  legacy.inventory.wood = 3;
  legacy.removed.push('origin:timber:1');
  const resident = actor(game, 'legacy-witness', 11, -3, false);
  resident.home = { x: 11, y: -3 };
  resident.hp = 40;
  legacy.npcs.push(resident);
  const restored = Stichos.restore(legacy);
  assert.ok(
    dist(restored.player, oldPosition) <= 1.01,
    'migration finds adjacent ground, not a new spawn',
  );
  assert.ok(!restored.world.blocked(restored.player.x, restored.player.y, restored.removed));
  assert.deepEqual(restored.inventory, legacy.inventory);
  assert.deepEqual([...restored.removed], legacy.removed);
  assert.deepEqual(restored.quests, legacy.quests);
  const migrated = restored.save();
  assert.equal(migrated.terrainRevision, 3);
  assert.ok(!restored.world.blocked(migrated.restAnchor.x, migrated.restAnchor.y));
  const witness = migrated.npcs.find((n) => n.id === resident.id)!;
  assert.equal(witness.hp, 40);
  assert.ok(!restored.world.blocked(witness.x, witness.y));
  assert.ok(!restored.world.blocked(witness.home.x, witness.home.y));
  assert.deepEqual(Stichos.restore(migrated).player, restored.player);
  assert.deepEqual(Stichos.restore({ ...legacy, terrainRevision: 2 }).player, restored.player);
  assert.throws(() => Stichos.restore({ ...legacy, terrainRevision: 3 }), /blocked terrain/);
  assert.throws(() => Stichos.restore({ ...legacy, terrainRevision: 4 }), /incompatible/);

  const { terrainRevision: _clearRevision, ...clearLegacy } = game.save();
  assert.deepEqual(
    Stichos.restore(clearLegacy).player,
    game.player,
    'clear legacy footing stays exact',
  );
  const farWall = game.world
    .propsAround(96, 96, 60)
    .find((p) => p.solid && Math.abs(p.x) > 24 && game.world.blocked(p.x, p.y));
  assert.ok(farWall);
  Object.assign(clearLegacy.player, { x: farWall.x, y: farWall.y });
  assert.throws(
    () => Stichos.restore(clearLegacy),
    /blocked terrain/,
    'origin migration never relocates a distant invalid save',
  );
});

test('legacy wilderness saves retain their exact generator while new worlds opt into climate generation two', () => {
  const old = new Stichos(77, 1);
  const current = new Stichos(77);
  assert.equal(current.world.generation, 2);
  let changed: Point | undefined;
  for (let y = 24; y < 72 && !changed; y++) {
    for (let x = 24; x < 72 && !changed; x++) {
      if (!old.world.blocked(x, y) && current.world.blocked(x, y)) changed = { x, y };
    }
  }
  assert.ok(changed, 'the enhanced generator changes some wilderness collision');
  const { worldGeneration: _generation, ...legacy } = old.save();
  Object.assign(legacy.player, changed);
  const restored = Stichos.restore(legacy);
  assert.equal(restored.world.generation, 1);
  assert.deepEqual({ x: restored.player.x, y: restored.player.y }, changed);
  assert.deepEqual(restored.world.tile(changed.x, changed.y), old.world.tile(changed.x, changed.y));
  assert.ok(!restored.world.blocked(changed.x, changed.y));
  assert.equal(restored.save().worldGeneration, 1);
  assert.equal(Stichos.restore(current.save()).world.generation, 2);
  assert.throws(() => Stichos.restore({ ...current.save(), worldGeneration: 3 }));
});
