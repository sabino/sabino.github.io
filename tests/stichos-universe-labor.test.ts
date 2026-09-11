import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { THEO_ESTATE } from '../src/stichos/labor.ts';

const wait = (game: Stichos, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 4); i++) game.update(0.25, { x: 0, y: 0, run: false });
};

test('a generated household employs its actual personal relationships with deliberate trust and finite paid physical work', () => {
  let game = new Stichos(8, 4);
  assert.ok(game.acceptLife(3).ok);
  const story = game.personalStory!,
    relationships = story.relationships;
  assert.deepEqual([...game.estate.staffIds].sort(), relationships.map((r) => r.npcId).sort());
  assert.deepEqual(game.staff.map((w) => w.name).sort(), relationships.map((r) => r.name).sort());
  assert.ok(game.estate.residence?.name.includes(game.identityName));
  const ally = game.staff.find((w) => w.stance === 'ally')!,
    witness = game.staff.find((w) => w.stance === 'witness')!;
  assert.ok(ally.trusted);
  assert.equal(witness.trusted, false);
  assert.equal(
    game.hireLabor(witness.id, 'garden').ok,
    false,
    'a named witness is not automatically a trusted employee',
  );
  assert.equal(game.chooseEstateTrust(witness.id, true).ok, true);
  assert.equal(game.staff.find((w) => w.id === witness.id)!.trusted, true);
  assert.equal(game.chooseEstateTrust('invented-worker', true).ok, false);
  const preview = game.laborPreview(ally.id, 'garden');
  assert.ok(preview.ok);
  const town = game.lifeOrigin!.settlement,
    boardId = `${town.id}:notice`;
  const offered = new Set(preview.order.allocations.map((a) => a.item));
  for (let attempt = 0; ; attempt++) {
    assert.ok(attempt < 30);
    game.interact(boardId);
    game.choose('life:contract');
    const contract = game.freeLife.contract!;
    if (contract.kind === 'field' && offered.has(contract.item!)) {
      game.choose('close');
      break;
    }
    game.choose('close');
    game.interact(boardId);
    game.choose('life:cancel');
    game.choose('close');
  }
  assert.equal(game.freeLife.contract!.progress, 0);
  const coins = game.player.coins,
    carried = game.carried;
  assert.ok(game.hireLabor(ally.id, 'garden').ok);
  const order = game.laborOrders[0];
  assert.equal(order.workerName, ally.name);
  assert.equal(game.player.coins, coins - preview.wages);
  assert.equal(game.hireLabor(ally.id, 'garden').ok, false);
  assert.equal(game.carried, carried, 'paying wages does not conjure the output');
  const paidBody = game.save().bodyPossessions.find((p) => p.npcId === ally.id)!;
  assert.ok(paidBody && paidBody.coins >= preview.wages, 'wages become the actual worker’s money');
  game = Stichos.restore(game.save());
  assert.equal(game.laborOrders[0].workerId, ally.id);
  assert.equal(game.staff.find((w) => w.id === witness.id)!.trusted, true);
  assert.equal(game.save().bodyPossessions.find((p) => p.npcId === ally.id)!.coins, paidBody.coins);
  assert.equal(
    game.chooseEstateTrust(ally.id, false).ok,
    true,
    'ending future trust preserves already-paid terms',
  );
  assert.equal(game.collectLabor(order.id).ok, false);
  wait(game, order.endsAt - game.time + 35);
  assert.equal(
    game.laborOrders[0].journey?.phase,
    'ready',
    'the employee travels, performs real tool strokes, and returns',
  );
  const home = game.estate.residence!;
  const standing = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ]
    .map(([x, y]) => ({ x: home.x + x, y: home.y + y }))
    .find((p) => !game.world.blocked(p.x, p.y, game.removed))!;
  Object.assign(game.player, standing);
  assert.ok(game.collectLabor(order.id).ok);
  assert.equal(game.carried, carried + order.allocations.reduce((a, b) => a + b.amount, 0));
  assert.ok(order.allocations.every((a) => game.removed.has(a.propId)));
  const contract = game.freeLife.contract!;
  assert.equal(
    contract.progress,
    Math.min(
      contract.required,
      order.allocations
        .filter((a) => a.item === contract.item)
        .reduce((sum, a) => sum + a.amount, 0),
    ),
    'fresh paid gathering counts toward the accepted field commission',
  );
  assert.equal(game.collectLabor(order.id).ok, false);
  assert.equal(
    game.hireLabor(ally.id, 'garden').ok,
    false,
    'the released employee cannot receive new assignments',
  );
  const restored = Stichos.restore(game.save());
  assert.equal(restored.laborOrders[0].status, 'complete');
  assert.equal(
    restored.save().bodyPossessions.find((p) => p.npcId === ally.id)!.coins,
    paidBody.coins,
    'collection and reload do not pay wages twice',
  );
});

test('generated labor saves require actual world residents and legacy priest employees remain unchanged', () => {
  const game = new Stichos(8, 4);
  game.acceptLife(3);
  const ally = game.staff.find((w) => w.stance === 'ally')!;
  assert.ok(game.hireLabor(ally.id, 'garden').ok);
  for (const mutate of [
    (s: ReturnType<Stichos['save']>) => {
      s.labor.trust['town:999:999:resident:99'] = true;
    },
    (s: ReturnType<Stichos['save']>) => {
      s.labor.orders[0].workerId = 'origin:made-up-worker';
    },
    (s: ReturnType<Stichos['save']>) => {
      s.labor.orders[0].allocations[0].amount = 20;
    },
  ]) {
    const raw = game.save();
    mutate(raw);
    assert.throws(() => Stichos.restore(raw));
  }
  for (const generation of [1, 2, 3] as const) {
    const legacy = new Stichos(8, generation);
    assert.deepEqual(legacy.estate.staffIds, THEO_ESTATE.staffIds);
    assert.deepEqual(
      legacy.staff.map((w) => w.id),
      THEO_ESTATE.staffIds,
    );
  }
});
