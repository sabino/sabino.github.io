import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos, RECIPES } from '../src/stichos/session.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { generateLifeCandidate } from '../src/stichos/life-origin.ts';
import { generatePersonalStory, restorePersonalStories } from '../src/stichos/personal-story.ts';
import type { ItemId, Point } from '../src/stichos/types.ts';

function stand(game: Stichos, point: Point) {
  const approach = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, -1],
  ]
    .map(([x, y]) => ({ x: point.x + x, y: point.y + y }))
    .find((p) => !game.world.blocked(p.x, p.y));
  assert.ok(approach, `A real approach is needed near ${point.x},${point.y}`);
  Object.assign(game.player, approach);
  game.dialogue = null;
  return Stichos.restore(game.save());
}
function buy(game: Stichos, item: ItemId, needed: number) {
  const merchant = game.world
    .npcsAround(0, 0, 24)
    .find((n) => n.role === 'merchant' && n.id !== game.bodyId)!;
  assert.ok(merchant);
  game = stand(game, merchant);
  const active = game.npcs.find((n) => n.id === merchant.id)!;
  Object.assign(game.player, { x: active.x, y: active.y + 1 });
  game.interact(active.id);
  for (let n = game.inventory[item] ?? 0; n < needed; n++) {
    const before = game.inventory[item] ?? 0;
    game.choose(`buy:${item}`);
    assert.equal(game.inventory[item], before + 1, `Buy ${item} with actual earned coins`);
  }
  game.choose('close');
  return game;
}
function board(game: Stichos, point: Point, id: string) {
  game = stand(game, point);
  game.interact(id);
  return game;
}

test('one universe composes different personal stakes, actual relationships, histories and rewards from the selected life', () => {
  const world = new InfiniteWorld(8, 4),
    hooks = new Set<string>(),
    causes = new Set<string>(),
    rewards = new Set<number>(),
    histories = new Set<string>();
  for (let index = 0; index < 32; index++) {
    const life = generateLifeCandidate(8, index, {}, 4),
      plan = generatePersonalStory(world, life);
    if ([0, 11, 31].includes(index))
      assert.deepEqual(generatePersonalStory(new InfiniteWorld(8, 4), life), plan);
    hooks.add(plan.case.kind);
    causes.add(plan.case.cause);
    rewards.add(plan.reward.coins);
    histories.add(JSON.stringify(plan.history));
    assert.equal(plan.relationships.length, 3);
    assert.equal(new Set(plan.relationships.map((r) => r.npcId)).size, 3);
    assert.ok(plan.relationships.every((r) => r.npcId !== life.id));
    for (const relation of plan.relationships)
      assert.ok(
        world
          .npcsAround(relation.target.x, relation.target.y, 1)
          .some((n) => n.id === relation.npcId && n.name === relation.name),
        'history references a real world resident',
      );
    assert.ok(
      world
        .propsAround(plan.signal.x, plan.signal.y, 0.1)
        .some((p) => p.id === plan.signal.id && p.kind === 'radio'),
    );
    assert.ok(!/Theo|Sallas|Stíchos|Vespera/.test(JSON.stringify(plan)));
    assert.ok(
      plan.history.every(
        (h, i) => h.age < life.age && (i === 0 || h.age >= plan.history[i - 1].age),
      ),
    );
  }
  assert.equal(hooks.size, 7);
  assert.ok(causes.size >= 3);
  assert.ok(rewards.size > 10);
  assert.equal(histories.size, 32);
});

test('all generation-four residents, including Stíchos, bypass the Theo campaign and can choose work immediately', () => {
  for (const seed of [8, 0x53544943]) {
    let game = new Stichos(seed, 4);
    assert.ok(game.acceptLife(3).ok);
    assert.equal(game.universeLife, true);
    assert.ok(game.personalStory);
    assert.equal(game.freeLife.unlocked, true);
    assert.equal(game.storyStage, 0);
    assert.equal(game.transferReady, false);
    assert.equal(game.campaignObjective, null);
    assert.ok(
      !game.quests.some((q) =>
        ['first-breath', 'sallas-record', 'cequin-choice', 'repair-radio'].includes(q.id),
      ),
    );
    const town = game.lifeOrigin!.settlement;
    game = board(game, { x: town.x - 2, y: town.y + 1 }, `${town.id}:notice`);
    assert.ok(game.dialogue!.choices.some((c) => c.id === 'life:contract'));
    game.choose('life:contract');
    assert.equal(game.freeLife.contract?.status, 'active');
    for (const npc of game.world
      .npcsAround(0, 0, 24)
      .filter((n) => ['botanist', 'archivist', 'engineer'].includes(n.role))) {
      game = stand(game, npc);
      game.interact(npc.id);
      assert.ok(game.dialogue);
      assert.ok(
        !game.dialogue!.choices.some((c) =>
          ['ask-sallas', 'engineer-plan', 'learn-cequin'].includes(c.id),
        ),
      );
      assert.ok(!/Theo/.test(game.dialogue!.text));
      game.choose('close');
    }
    assert.equal(game.storyStage, 0);
  }
  const legacy = new Stichos(8, 3);
  assert.equal(legacy.universeLife, false);
  assert.equal(legacy.personalStory, null);
  assert.equal(legacy.quests[0].id, 'first-breath');
});

test('resource delivery, a chosen witness, real paid preparation work and a mined/crafted alignment finish one life without duplicate rewards', () => {
  let game = new Stichos(8, 4);
  assert.ok(game.acceptLife(3).ok);
  const life = game.lifeOrigin!,
    plan = generatePersonalStory(game.world, life),
    town = life.settlement;
  assert.equal(life.profession, 'merchant');
  const ally = plan.debt.recipient;
  game = stand(game, ally.target);
  game.interact(ally.npcId);
  const debtChoice = game.dialogue!.choices.find((c) => c.id === 'personal:debt')!;
  assert.ok(debtChoice.disabled, 'a relationship does not invent the missing supplies');
  const beforeFailed = game.inventory[plan.debt.item] ?? 0;
  game.choose('personal:debt');
  assert.equal(game.inventory[plan.debt.item] ?? 0, beforeFailed);
  game = buy(game, plan.debt.item, plan.debt.required);
  game = stand(game, ally.target);
  game.interact(ally.npcId);
  game.choose('personal:debt');
  assert.equal(game.personalStory!.obligations[0].complete, true);
  assert.equal(game.inventory[plan.debt.item] ?? 0, 0, 'promised supplies leave the physical pack');
  game = stand(game, plan.signal);
  game.interact(plan.signal.id);
  assert.ok(
    game.dialogue!.choices.find((c) => c.id === 'personal:align')!.disabled,
    'neither payment nor a lens skips trust and demonstrated work',
  );
  const witness = plan.relationships.find((r) => r.stance === 'witness')!;
  game = stand(game, witness.target);
  game.interact(witness.npcId);
  game.choose('personal:trust');
  assert.equal(
    game.personalStory!.relationships.find((r) => r.npcId === witness.npcId)!.trusted,
    true,
  );
  game = Stichos.restore(game.save());
  assert.equal(game.personalStory!.obligations[1].complete, true);
  const boardPoint = { x: town.x - 2, y: town.y + 1 },
    boardId = `${town.id}:notice`;
  for (let completed = 0; completed < plan.commissionGoal; completed++) {
    let attempts = 0;
    for (;;) {
      game = board(game, boardPoint, boardId);
      game.choose('life:contract');
      const contract = game.freeLife.contract!;
      assert.equal(contract.status, 'active');
      if (contract.kind === 'workshop') break;
      const beforeXp = game.player.level * 100000 + game.player.xp;
      game = board(game, boardPoint, boardId);
      game.choose('life:cancel');
      assert.equal(
        game.player.level * 100000 + game.player.xp,
        beforeXp,
        'withdrawing work gives no experience reward',
      );
      assert.ok(++attempts < 30, 'deterministic board offers preparation work');
    }
    let contract = game.freeLife.contract!;
    const recipe = RECIPES.find((r) => r.result === contract.item)!;
    assert.ok(recipe);
    assert.equal(contract.progress, 0);
    game = board(game, boardPoint, boardId);
    game.choose('life:claim');
    assert.equal(game.freeLife.contract!.status, 'active');
    for (let i = 0; game.freeLife.contract!.progress < contract.required; i++) {
      assert.ok(i < 8);
      for (const [item, amount] of Object.entries(recipe.cost))
        game = buy(game, item as ItemId, amount!);
      game.craft(recipe.id);
    }
    contract = game.freeLife.contract!;
    assert.equal(
      contract.progress,
      contract.required,
      'only actual preparation recorded fresh-work progress',
    );
    game = board(game, boardPoint, boardId);
    const beforePay = game.player.coins;
    game.choose('life:claim');
    assert.equal(game.player.coins, beforePay + contract.reward);
    assert.equal(game.freeLife.contractsCompleted, completed + 1);
    game = Stichos.restore(game.save());
    assert.equal(game.personalStory!.obligations[2].progress, completed + 1);
  }
  // This body's starting ore covers the lens; the final relay also needs a real newly mined portion.
  const rock = game.world
    .propsAround(0, 0, 12)
    .find((p) => p.kind === 'rock' && !game.removed.has(p.id))!;
  assert.ok(rock, 'The established central workyard contains a real accessible ore stock.');
  game = stand(game, rock);
  assert.ok(game.equipTool('pickaxe').ok);
  for (let i = 0; !game.removed.has(rock.id); i++) {
    assert.ok(i < 20, 'the actual pick must finish the rock');
    game.interact(rock.id);
    for (let j = 0; j < 6; j++) game.update(0.25, { x: 0, y: 0, run: false });
  }
  const bench = game.world.propsAround(town.x, town.y, 12).find((p) => p.kind === 'workbench')!;
  game = stand(game, bench);
  game.craft('lens');
  assert.equal(game.inventory.lens, 1);
  game = board(game, plan.signal, plan.signal.id);
  assert.equal(game.dialogue!.choices.find((c) => c.id === 'personal:align')!.disabled, false);
  const beforeFinal = game.player.coins;
  game.choose('personal:align');
  assert.equal(game.player.coins, beforeFinal + plan.reward.coins);
  assert.equal(game.personalStory!.complete, true);
  assert.equal(game.transferReady, true);
  assert.equal(game.inventory.lens ?? 0, 0);
  const final = game.save();
  game = Stichos.restore(final);
  assert.equal(game.personalStory!.complete, true);
  assert.equal(game.transferReady, true);
  assert.equal(game.campaignObjective, null);
  game = board(game, plan.signal, plan.signal.id);
  const coins = game.player.coins;
  game.choose('personal:align');
  assert.equal(game.player.coins, coins);
  game = stand(game, ally.target);
  game.interact(ally.npcId);
  assert.ok(
    !game.dialogue!.choices.some((c) => c.id === 'personal:debt' || c.id === 'personal:trust'),
  );
});

test('personal state validation rejects impossible completion and unrelated trusted witnesses', () => {
  for (const records of [
    [{ bodyId: 'x', baselineCommissions: -1, repaid: false, trusted: null, aligned: false }],
    [{ bodyId: 'x', baselineCommissions: 0, repaid: false, trusted: null, aligned: true }],
  ])
    assert.throws(() => restorePersonalStories({ version: 1, records }));
  const game = new Stichos(8, 4);
  game.acceptLife(3);
  const save = game.save();
  save.personalStories!.records[0].trusted = 'not-a-real-related-person';
  assert.throws(() => Stichos.restore(save), /unrelated witness/);
  const old = new Stichos(8, 3).save();
  old.player.appearance.technology = 7 as 3;
  assert.throws(() => Stichos.restore(old), /save/);
});
