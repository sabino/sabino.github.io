import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos, ITEMS, EXPLORATION_CELL_SIZE } from '../src/stichos/session.ts';
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
    if (dist(p, target) <= 1.3 && !game.world.blocked(p.x, p.y, game.removed, true)) {
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
        game.world.blocked(next.x, next.y, game.removed, true)
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
    const door = game.world
      .propsAround(point.x, point.y, 0.1)
      .find((p) => p.kind === 'door' && !game.removed.has(p.id));
    if (door) {
      assert.ok(dist(game.player, door) <= 1.65, `Door is outside interaction range: ${door.id}`);
      game.interact(door.id);
      game.choose('close');
      assert.equal(game.world.blocked(point.x, point.y, game.removed), false, door.id);
    }
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
  const game = new Stichos(3886, 2);
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
  const game = new Stichos(104, 2);
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
  const game = new Stichos(19, 2);
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
  const game = new Stichos(3886, 2);
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
  const duplicate = new Stichos(3886, 2);
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
  const game = new Stichos(104, 2);
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
  const game = new Stichos(3886, 2);
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
  const game = new Stichos(3886, 2);
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
  const game = new Stichos(3886, 2);
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
  const game = new Stichos(8, 2);
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
  const game = new Stichos(19, 2);
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
  const game = new Stichos(17, 2);
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
  const game = new Stichos(43, 2);
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
  const game = new Stichos(3886, 2);
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
  const game = new Stichos(31, 2);
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
  const game = new Stichos(901, 2);
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
  const a = new Stichos(2, 2),
    b = new Stichos(2, 2);
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
  const game = new Stichos(5, 2),
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
    const game = new Stichos(seed, 2);
    const profile = game.weaponProfile('staff');
    assert.deepEqual(profile, new Stichos(seed, 2).weaponProfile('staff'));
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
  const game = new Stichos(64, 2);
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
  const game = new Stichos(13, 2);
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
  const game = new Stichos(104, 2);
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
  const game = new Stichos(104, 2);
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
  const game = new Stichos(3886, 2);
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
  const current = new Stichos(77, 2);
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
  assert.throws(() => Stichos.restore({ ...current.save(), worldGeneration: 4 }));
});

test('actual generation-three travel reveals a persistent narrow trail while atlas queries reveal nothing', () => {
  const game = new Stichos(3886);
  assert.equal(game.world.generation, 3);
  assert.equal(EXPLORATION_CELL_SIZE, 8);
  assert.ok(game.explored(game.player.x, game.player.y));
  assert.ok(!game.explored(0, 50));
  const revision = game.explorationRevision;
  const bounds = game.exploredBounds;
  const cells = [...game.exploredCells()];
  const sites = game.discoveredSites;
  assert.ok(sites.some((site) => site.id === 'origin'));
  assert.ok(Object.isFrozen(sites) && Object.isFrozen(sites[0]) && Object.isFrozen(bounds));
  game.world.tile(640, 640);
  game.world.settlementsAround(640, 640, 480);
  game.world.vaultsAround(107, 107, 80);
  assert.deepEqual([...game.exploredCells({ minX: 620, minY: 620, maxX: 660, maxY: 660 })], []);
  assert.ok(!game.explored(640, 640));
  assert.equal(game.explorationRevision, revision);
  assert.equal(game.exploredBounds, bounds, 'queries preserve the cached bounds object');
  assert.equal(game.discoveredSites, sites, 'queries preserve the cached discovery array');
  assert.deepEqual([...game.exploredCells()], cells);
  for (let i = 0; i < 170; i++) game.update(0.1, { x: 0, y: 1, run: false });
  assert.ok(game.player.y > 55, 'the character actually traverses the open trunk road');
  assert.ok(game.visited.size >= 4);
  assert.ok(game.explored(0, 48));
  assert.ok(!game.explored(32, 48), 'walking does not reveal the entire region around the road');
  assert.ok(game.explorationRevision > revision);
  const trail = [...game.exploredCells({ minX: -1, minY: 32, maxX: 1, maxY: 56 })];
  assert.ok(trail.length >= 6, 'coarse atlas drawing retains each side of a narrow trail');
  assert.ok(trail.every((cell) => cell.size === 8 && cell.x % 8 === 0 && cell.y % 8 === 0));
  assert.equal(new Set(trail.map((cell) => `${cell.x},${cell.y}`)).size, trail.length);
  const restored = Stichos.restore(JSON.parse(JSON.stringify(game.save())));
  assert.equal(restored.world.generation, 3);
  for (const cell of game.exploredCells()) assert.ok(restored.explored(cell.x, cell.y));
  assert.ok(!restored.explored(32, 48));
  assert.deepEqual(restored.discoveredSites, game.discoveredSites);
  assert.ok(restored.exploredBounds!.maxY >= game.exploredBounds!.maxY);
  const distantVillage = game.world.settlementsAround(0, 213, 50)[0];
  assert.ok(distantVillage && !game.discoveredSites.some((site) => site.id === distantVillage.id));
  for (let i = 0; i < 420; i++) game.update(0.1, { x: 0, y: 1, run: false });
  assert.ok(game.player.y > 180, 'the same body walks the uninterrupted road to the next village');
  const discoveredVillage = game.discoveredSites.find((site) => site.id === distantVillage.id);
  assert.equal(discoveredVillage?.name, distantVillage.name);
  assert.equal(discoveredVillage?.detail, distantVillage.rank);
  assert.ok(
    !game.explored(distantVillage.x, distantVillage.y),
    'recognizing the village outskirts does not reveal its unseen center',
  );
  assert.deepEqual(Stichos.restore(game.save()).discoveredSites, game.discoveredSites);
});

test('distant correspondence reveals a destination marker without discovering its terrain or settlement', () => {
  const game = new Stichos(3886);
  npc(game, 'origin-archivist');
  game.choose('dispatch:request');
  const job = game.dispatches[0];
  assert.ok(job, 'generation-three settlements have actual distant correspondence recipients');
  assert.ok(dist(job.sourcePoint, job.target) > 150, 'new roads connect distant settlements');
  assert.ok(!game.explored(job.target.x, job.target.y));
  assert.ok(!game.discoveredSites.some((site) => site.id === job.settlementId));
  const town = game.world
    .settlementsAround(job.target.x, job.target.y, 48)
    .find((site) => site.id === job.settlementId);
  assert.ok(town);
  const recipient = game.world
    .npcsAround(job.target.x, job.target.y, 2)
    .find((n) => n.id === job.recipientId);
  assert.ok(recipient, 'a map promise refers to a real resident, not a fabricated coordinate');
  const restored = Stichos.restore(game.save());
  assert.deepEqual(restored.dispatches, game.dispatches);
  assert.ok(!restored.explored(job.target.x, job.target.y));
  assert.ok(!restored.discoveredSites.some((site) => site.id === job.settlementId));
});

test('entering the outskirts discovers a real vault footprint without exposing its deep interior', () => {
  const game = new Stichos(3886, 2);
  const vault = game.world.vaultsAround(40, 40, 1)[0];
  assert.ok(vault);
  assert.ok(!game.discoveredSites.some((site) => site.id === vault.id));
  Object.assign(game.player, { x: vault.entrance.x, y: vault.y + vault.radius + 12 });
  assert.ok(!game.world.blocked(game.player.x, game.player.y));
  game.update(0.01, still);
  const known = game.discoveredSites.find((site) => site.id === vault.id);
  assert.ok(known);
  assert.equal(known.kind, 'vault');
  assert.deepEqual({ x: known.x, y: known.y }, { x: vault.x, y: vault.y });
  assert.ok(
    !game.explored(vault.x, vault.y),
    'site knowledge does not erase undiscovered interior fog',
  );
  assert.deepEqual(Stichos.restore(game.save()).discoveredSites, game.discoveredSites);
});

test('mind transfer reveals the selected body location and preserves the previous life’s explored ground', () => {
  const game = new Stichos(3886, 2);
  game.storyStage = 4;
  const shrine = prop(game, (p) => p.kind === 'shrine');
  walkTo(game, shrine);
  const oldGround = { x: game.player.x, y: game.player.y };
  for (const npc of game.world.npcsAround(game.player.x, game.player.y, 22)) {
    if (['pilgrim', 'refugee', 'guard'].includes(npc.role)) game.removed.add(npc.id);
  }
  // Pick a clear, still-fogged real world location within the signal's fourteen-tile reach.
  let target: Point | undefined;
  for (let y = Math.round(game.player.y) - 14; y <= game.player.y + 14 && !target; y++) {
    for (let x = Math.round(game.player.x) - 14; x <= game.player.x + 14 && !target; x++) {
      if (dist({ x, y }, game.player) <= 14 && !game.explored(x, y) && !game.world.blocked(x, y))
        target = { x, y };
    }
  }
  assert.ok(target, 'the fixture contains a human beyond the priest’s currently observed cells');
  const host = actor(game, 'fog-transfer-host', target.x, target.y, false);
  host.hp = 49;
  game.npcs.push(host);
  const previousCells = [...game.exploredCells()];
  const revision = game.explorationRevision;
  assert.ok(game.transferCandidates.some((npc) => npc.id === host.id));
  game.reincarnate(host.id);
  assert.equal(game.occupiedNpcId, host.id);
  assert.ok(game.explored(target.x, target.y));
  assert.ok(game.explored(oldGround.x, oldGround.y));
  assert.ok(game.explorationRevision > revision);
  for (const cell of previousCells) assert.ok(game.explored(cell.x, cell.y));
  const restored = Stichos.restore(game.save());
  assert.equal(restored.occupiedNpcId, host.id);
  assert.ok(restored.explored(target.x, target.y) && restored.explored(oldGround.x, oldGround.y));
});

test('legacy travel fog stays compact for 100k visited chunks and new travel only adds local sight cells', () => {
  const game = new Stichos(13, 2);
  const { exploration: _fog, ...legacy } = game.save();
  legacy.visited = Array.from({ length: 100005 }, (_, i) => `${i},0`);
  legacy.player.x = 1_000_000_010;
  legacy.player.y = 0;
  const restored = Stichos.restore(legacy);
  assert.ok(
    restored.explored(16 * 50000 + 15, 15),
    'old entered chunks are an explicit approximate footprint',
  );
  assert.ok(!restored.explored(16 * 50000, 24));
  assert.equal(
    [...restored.exploredCells({ minX: 16 * 50000, minY: 0, maxX: 16 * 50001, maxY: 16 })].length,
    4,
  );
  for (let i = 0; i < 35; i++) restored.update(0.1, { x: 1, y: 0, run: false });
  const saved = restored.save();
  assert.equal(saved.exploration.legacyVisitedCount, 100005);
  assert.ok(
    saved.exploration.chunks.length < 12,
    'migration never expands 100k old chunks into an explicit cell list',
  );
  assert.ok(JSON.stringify(saved).length < 8 * 1024 * 1024);
  const again = Stichos.restore(JSON.parse(JSON.stringify(saved)));
  assert.equal(again.save().exploration.legacyVisitedCount, 100005);
  assert.ok(again.explored(16 * 50000 + 15, 15));
  assert.ok(!again.explored(restored.player.x, 24));
  assert.deepEqual([...again.visited], [...restored.visited]);
});

test('fog save validation rejects malformed coordinates, duplicate records and invalid masks without imposing a travel boundary', () => {
  const saved = new Stichos(43, 2).save();
  for (const key of ['NaN,0', '1.5,2', '01,0', '-0,0', '9007199254740992,0'])
    assert.throws(() => Stichos.restore({ ...saved, visited: [key] }), /Invalid/);
  const fog = saved.exploration;
  for (const chunks of [
    [[0, 0, 0]],
    [[0, 0, 16]],
    [[0.5, 0, 1]],
    [[Infinity, 0, 1]],
    [
      [1, 1, 1],
      [1, 1, 2],
    ],
  ])
    assert.throws(() => Stichos.restore({ ...saved, exploration: { ...fog, chunks } }), /Invalid/);
  for (const legacyVisitedCount of [-1, 0.5, saved.visited.length + 1])
    assert.throws(
      () => Stichos.restore({ ...saved, exploration: { ...fog, legacyVisitedCount } }),
      /Invalid/,
    );
  assert.throws(
    () => Stichos.restore({ ...saved, exploration: { ...fog, revision: NaN } }),
    /Invalid/,
  );
  assert.throws(
    () =>
      Stichos.restore({ ...saved, exploration: { ...fog, sites: [fog.sites[0], fog.sites[0]] } }),
    /Invalid/,
  );
  assert.throws(
    () =>
      Stichos.restore({
        ...saved,
        exploration: { ...fog, sites: [{ ...fog.sites[0], radius: -1 }] },
      }),
    /Invalid/,
  );
});

test('bounded atlas queries match full known-cell filtering across negative seams without scanning travel history', () => {
  const saved = new Stichos(13, 2).save();
  saved.visited = Array.from({ length: 100005 }, (_, i) => `${i - 50000},0`);
  saved.exploration = {
    version: 1,
    revision: 3,
    legacyVisitedCount: saved.visited.length,
    chunks: [
      [-1, -1, 9],
      [0, -1, 6],
      [-2, 1, 5],
      [1, 1, 10],
    ],
    sites: saved.exploration.sites,
  };
  const game = Stichos.restore(saved);
  const all = [...game.exploredCells()];
  const canonical = (cells: Iterable<{ x: number; y: number; size: number }>) =>
    [...cells].map((cell) => `${cell.x},${cell.y},${cell.size}`).sort();
  const storage = game as unknown as {
    legacyFogChunks: Set<string>;
    fogChunks: Map<string, number>;
  };
  const legacyIterator = storage.legacyFogChunks[Symbol.iterator];
  const fogIterator = storage.fogChunks[Symbol.iterator];
  storage.legacyFogChunks[Symbol.iterator] = function* () {
    assert.fail('a small atlas query must not iterate the old travel history');
  };
  storage.fogChunks[Symbol.iterator] = function* () {
    assert.fail('a small atlas query must not iterate all new knowledge');
  };
  const revision = game.explorationRevision;
  for (const bounds of [
    { minX: -16, minY: -16, maxX: 0, maxY: 0 },
    { minX: -0.1, minY: -0.1, maxX: 0.1, maxY: 0.1 },
    { minX: -32, minY: -8, maxX: 16, maxY: 24 },
    { minX: -8, minY: -8, maxX: 8, maxY: 8 },
    { minX: 10000000, minY: 10000000, maxX: 10000008, maxY: 10000008 },
    { minX: 1e25, minY: 1e25, maxX: 1e25 + 1e15, maxY: 1e25 + 1e15 },
  ]) {
    const expected = all.filter(
      (cell) =>
        cell.x < bounds.maxX &&
        cell.y < bounds.maxY &&
        cell.x + cell.size > bounds.minX &&
        cell.y + cell.size > bounds.minY,
    );
    assert.deepEqual(canonical(game.exploredCells(bounds)), canonical(expected));
  }
  storage.legacyFogChunks[Symbol.iterator] = legacyIterator;
  storage.fogChunks[Symbol.iterator] = fogIterator;
  assert.equal(game.explorationRevision, revision);
  assert.deepEqual(
    canonical(game.exploredCells()),
    canonical(all),
    'zoomed-out unbounded traversal still includes the whole known trail',
  );
});

test('old discovered origin labels migrate to Vespera in every world generation without changing the saved life or fog', () => {
  for (const generation of [1, 2, 3] as const) {
    const game = new Stichos(703, generation);
    walkTo(game, { x: 0, y: 35 });
    walkTo(game, { x: 0, y: 48 });
    const current = game.save();
    assert.ok(
      game.player.y > 40,
      'exercise a remembered origin while the body is away from the city',
    );
    for (const oldName of ['Stíchos Cathedral', 'Stíchos', 'Stitchos']) {
      const legacy = JSON.parse(JSON.stringify(current)) as typeof current;
      const oldOrigin = legacy.exploration.sites.find((s) => s.id === 'origin')!;
      oldOrigin.name = oldName;
      const restored = Stichos.restore(legacy),
        saved = restored.save();
      assert.equal(restored.world.generation, generation);
      assert.equal(restored.discoveredSites.find((s) => s.id === 'origin')?.name, 'Vespera');
      assert.equal(oldOrigin.name, oldName, 'migration does not mutate the caller-owned save');
      for (const field of [
        'player',
        'inventory',
        'removed',
        'opened',
        'quests',
        'journal',
        'time',
        'distanceTraveled',
        'visited',
        'reputation',
        'worldGeneration',
        'terrainRevision',
      ] as const)
        assert.deepEqual(saved[field], legacy[field], `${generation}/${oldName}: ${field}`);
      assert.deepEqual(saved.exploration.chunks, legacy.exploration.chunks);
      assert.equal(saved.exploration.legacyVisitedCount, legacy.exploration.legacyVisitedCount);
      assert.equal(saved.exploration.revision, legacy.exploration.revision + 1);
      assert.deepEqual(
        saved.exploration.sites,
        legacy.exploration.sites.map((s) => (s.id === 'origin' ? { ...s, name: 'Vespera' } : s)),
      );
      assert.deepEqual(
        Stichos.restore(saved).save().exploration,
        saved.exploration,
        'normalization is idempotent',
      );
    }
  }
  const old = new Stichos(703, 1).save();
  old.exploration.sites.find((s) => s.id === 'origin')!.name = 'Stíchos Cathedral';
  const { worldGeneration: _generation, ...unversioned } = old;
  assert.equal(Stichos.restore(unversioned).world.generation, 1);
  assert.equal(
    Stichos.restore(unversioned).discoveredSites.find((s) => s.id === 'origin')?.name,
    'Vespera',
  );
  old.exploration.revision = Number.MAX_SAFE_INTEGER;
  const saturated = Stichos.restore(old).save();
  assert.equal(saturated.exploration.revision, Number.MAX_SAFE_INTEGER);
  assert.doesNotThrow(() => Stichos.restore(saturated));
});

test('an origin-bound saved dispatch renames only derived city labels and preserves the promise', () => {
  const game = new Stichos(2, 2);
  const source = game.world.npcsAround(84, 1, 18).find((n) => n.id === 'town:1:0:resident:2')!;
  assert.ok(source);
  travelRoads(game, source);
  game.interact(source.id);
  game.choose('dispatch:request');
  const legacy = game.save(),
    job = legacy.correspondenceJobs[0];
  assert.equal(job.settlementId, 'origin', 'fixture must be a real generated return dispatch');
  job.settlementName = 'Stíchos Cathedral';
  const quest = legacy.quests.find((q) => q.id === `correspondence:${job.sourceId}:${job.number}`)!;
  quest.title = 'A dispatch for Stíchos Cathedral';
  quest.objective = quest.objective.replace(' in Vespera.', ' in Stíchos Cathedral.');
  for (const entry of legacy.journal)
    if (entry.title === 'Words for another settlement')
      entry.text = entry.text.replace(' in Vespera.', ' in Stíchos Cathedral.');
  const restored = Stichos.restore(legacy),
    result = restored.save();
  assert.deepEqual(result.correspondenceJobs, [{ ...job, settlementName: 'Vespera' }]);
  assert.equal(result.quests.find((q) => q.id === quest.id)?.title, 'A dispatch for Vespera');
  assert.ok(result.quests.find((q) => q.id === quest.id)?.objective.includes(' in Vespera.'));
  assert.ok(
    result.journal
      .find((e) => e.title === 'Words for another settlement')
      ?.text.includes(' in Vespera.'),
  );
  assert.deepEqual(result.player, legacy.player);
  assert.deepEqual(result.inventory, legacy.inventory);
  assert.deepEqual(result.reputation, legacy.reputation);
  assert.equal(result.storyStage, legacy.storyStage);
  assert.equal(result.correspondenceJobs[0].status, 'active');
  assert.deepEqual(Stichos.restore(result).save().correspondenceJobs, result.correspondenceJobs);
});

test('the unique physical notebook stays with the priest while remembered records survive changing bodies', () => {
  const game = new Stichos(3886, 3);
  assert.equal(game.hasNotebook, true);
  const openingPack = structuredClone(game.inventory);
  assert.equal(
    game.carried,
    Object.values(openingPack).reduce((sum, n) => sum + (n ?? 0), 0),
    'the notebook uses no stack or capacity',
  );
  game.storyStage = 4;
  const shrine = prop(game, (p) => p.kind === 'shrine');
  walkTo(game, shrine);
  const priest = game.save(),
    first = game.transferCandidate!;
  game.reincarnate(first.id);
  assert.equal(game.hasNotebook, false);
  assert.equal(game.save().notebook, false);
  const priestBodyId = `body:theo-priest:${priest.seed}`;
  assert.equal(game.save().bodyPossessions.find((b) => b.npcId === priestBodyId)?.notebook, true);
  assert.ok(
    priest.journal.every((entry) =>
      game.journal.some((j) => j.title === entry.title && j.text === entry.text),
    ),
    'remembered pages remain known without the physical book',
  );
  assert.deepEqual(game.quests, priest.quests);
  const restored = Stichos.restore(game.save());
  assert.equal(restored.hasNotebook, false);
  walkTo(restored, shrine);
  restored.reincarnate(priestBodyId);
  assert.equal(restored.occupiedNpcId, priestBodyId);
  assert.equal(restored.hasNotebook, true);
  assert.deepEqual(restored.inventory, priest.inventory);
  assert.equal(restored.save().bodyPossessions.find((b) => b.npcId === first.id)?.notebook, false);
  assert.equal(
    Number(restored.save().notebook) +
      restored.save().bodyPossessions.filter((b) => b.notebook).length,
    1,
  );
  const again = Stichos.restore(restored.save());
  assert.equal(again.hasNotebook, true);
  again.reincarnate(first.id);
  assert.equal(again.hasNotebook, false);
  assert.equal(
    Number(again.save().notebook) + again.save().bodyPossessions.filter((b) => b.notebook).length,
    1,
    'repeated swaps never duplicate the physical volume',
  );
});

test('legacy notebook ownership follows the original body identity across every saved world generation', () => {
  const withoutNotebook = (save: ReturnType<Stichos['save']>) => {
    const { notebook: _book, ...old } = save;
    return {
      ...old,
      bodyPossessions: old.bodyPossessions.map(({ notebook: _owned, ...body }) => body),
    };
  };
  for (const generation of [1, 2, 3] as const) {
    const game = new Stichos(3886, generation);
    assert.equal(Stichos.restore(withoutNotebook(game.save())).hasNotebook, true);
    game.storyStage = 4;
    const shrine = prop(game, (p) => p.kind === 'shrine');
    walkTo(game, shrine);
    const priestBodyId = `body:theo-priest:${game.save().seed}`,
      host = game.transferCandidate!;
    game.reincarnate(host.id);
    const legacy = withoutNotebook(game.save());
    legacy.player.bodyName = 'The priest'; // A copied display name must not confer ownership.
    const restored = Stichos.restore(legacy);
    assert.equal(restored.occupiedNpcId, host.id);
    assert.equal(restored.hasNotebook, false);
    assert.equal(
      restored.save().bodyPossessions.find((b) => b.npcId === priestBodyId)?.notebook,
      true,
    );
    const { bodyPossessions: _ledger, ...older } = legacy;
    const withoutLedger = Stichos.restore(older);
    assert.equal(withoutLedger.hasNotebook, false);
    walkTo(withoutLedger, shrine);
    withoutLedger.reincarnate(priestBodyId);
    assert.equal(
      withoutLedger.hasNotebook,
      true,
      'even the pre-ledger save restores the priest’s own book on return',
    );
    assert.equal(Stichos.restore(withoutNotebook(withoutLedger.save())).hasNotebook, true);
    assert.equal(Stichos.restore(restored.save()).hasNotebook, false);
  }
  const old = withoutNotebook(new Stichos(3886, 1).save());
  const { worldGeneration: _generation, ...unversioned } = old;
  assert.equal(Stichos.restore(unversioned).hasNotebook, true);
});

test('notebook save flags reject duplicate or malformed ownership and do not reduce satchel capacity', () => {
  const game = new Stichos(3886, 2);
  game.inventory = { cequin: 60 };
  assert.equal(game.carried, 60);
  assert.equal(game.hasNotebook, true);
  assert.equal(Stichos.restore(game.save()).carried, 60);
  for (const notebook of [false, null, 0, 1, 'true'])
    assert.throws(() => Stichos.restore({ ...game.save(), notebook }));
  game.storyStage = 4;
  const shrine = prop(game, (p) => p.kind === 'shrine');
  walkTo(game, shrine);
  game.reincarnate();
  const host = game.save();
  assert.throws(
    () => Stichos.restore({ ...host, notebook: true }),
    'a generated host cannot receive a duplicated book',
  );
  for (const notebook of [false, null, 0, 'true'])
    assert.throws(() =>
      Stichos.restore({
        ...host,
        bodyPossessions: host.bodyPossessions.map((b) => ({ ...b, notebook })),
      }),
    );
  assert.equal(Stichos.restore(host).hasNotebook, false);
});
