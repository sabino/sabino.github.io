import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { generateArtifact } from '../src/stichos/artifacts.ts';
import {
  seededTool,
  requiredToolFor,
  resourceWork,
  applyToolStroke,
  workerProfile,
  assignLabor,
  finishLabor,
  validateLaborOrders,
  artifactToolKind,
  THEO_ESTATE,
  type WorkProgress,
} from '../src/stichos/labor.ts';

test('actual resource work needs the right tool, several timed strokes, energy and finite tool wear before completion', () => {
  for (const seed of [0, 1, 703, 0xffffffff]) {
    const world = new InfiniteWorld(seed, 3);
    for (const kind of ['pine', 'rock', 'cequin', 'heartleaf', 'mushroom']) {
      const prop = world.propsAround(0, 0, 20).find((p) => p.kind === kind)!;
      assert.ok(prop);
      const required = requiredToolFor(prop.kind)!,
        profile = seededTool(seed, required);
      let tool = { kind: required, seed, durability: profile.maxDurability },
        work: WorkProgress | null = null;
      const effort = resourceWork(prop)!;
      assert.ok(
        kind === 'pine'
          ? effort.requiredStrokes >= 4 && effort.requiredStrokes <= 7
          : kind === 'rock'
            ? effort.requiredStrokes >= 5 && effort.requiredStrokes <= 9
            : effort.requiredStrokes === 2,
      );
      const original = structuredClone(tool);
      assert.equal(applyToolStroke({ prop, tool, work, stamina: 0, now: 0 }).ok, false);
      assert.deepEqual(tool, original);
      const wrong = { ...tool, kind: required === 'axe' ? ('pickaxe' as const) : ('axe' as const) };
      assert.equal(applyToolStroke({ prop, tool: wrong, work, stamina: 100, now: 0 }).ok, false);
      let energy = 100;
      for (let stroke = 0; stroke < effort.requiredStrokes; stroke++) {
        const result = applyToolStroke({
          prop,
          tool,
          work,
          stamina: energy,
          now: stroke * profile.cooldown,
        });
        assert.ok(result.ok);
        assert.equal(result.complete, stroke + 1 === effort.requiredStrokes);
        tool = result.tool;
        work = result.work;
        energy -= result.staminaCost;
        assert.equal(
          applyToolStroke({ prop, tool, work, stamina: 100, now: stroke * profile.cooldown }).ok,
          false,
        );
      }
      assert.equal(
        tool.durability,
        profile.maxDurability - effort.requiredStrokes * (kind === 'rock' ? 2 : 1),
      );
      assert.ok(energy < 100);
      assert.equal(
        applyToolStroke({
          prop,
          tool: { ...tool, durability: 0 },
          work: null,
          stamina: 100,
          now: 100,
        }).ok,
        false,
      );
    }
  }
});

test('seeded physical tool geometry changes handling and generated artifacts specialize instead of replacing every tool', () => {
  const tools = Array.from({ length: 64 }, (_, seed) => seededTool(seed, 'axe'));
  assert.ok(new Set(tools.map((t) => t.strength)).size > 20);
  assert.ok(new Set(tools.map((t) => t.cooldown)).size > 20);
  for (const t of tools) {
    assert.deepEqual(seededTool(Number(t.id.split(':').at(-1)), 'axe'), t);
    assert.ok(t.maxDurability > 60 && t.headWidth > 0 && t.haftLength > t.bladeLength);
  }
  const kinds = new Set<string>();
  for (let i = 0; i < 512; i++) {
    const artifact = generateArtifact(`labor/tool/${i}`),
      kind = artifactToolKind(artifact);
    if (artifact.category !== 'implement' || artifact.properties.harvest === 0)
      assert.equal(kind, null);
    else {
      assert.ok(kind);
      kinds.add(kind);
    }
  }
  assert.deepEqual(kinds, new Set(['axe', 'pickaxe', 'sickle']));
});

test('paid workers reserve real finite resources, need elapsed work time and cannot create duplicated or missing output', () => {
  const world = new InfiniteWorld(703, 3),
    props = world.propsAround(0, 0, 24);
  const workers = world.npcsAround(0, 0, 24);
  const worker = workers.find((n) => n.id === 'origin:resident:5')!;
  const trees = props.filter((p) => ['origin:timber:1', 'origin:timber:2'].includes(p.id));
  const removed = new Set<string>();
  const input = {
    worker,
    reputation: [0, 0, 0, 0, 0, 0],
    kind: 'forestry' as const,
    props: trees,
    removed,
    orders: [],
    now: 10,
    serial: 1,
    coins: THEO_ESTATE.coins,
    yieldFor: () => 2,
  };
  assert.equal(assignLabor({ ...input, coins: 0 }).ok, false);
  const accepted = assignLabor(input);
  assert.ok(accepted.ok);
  assert.ok(
    accepted.wages > 0 &&
      accepted.order.endsAt - accepted.order.startedAt >= 60 &&
      accepted.order.endsAt - accepted.order.startedAt <= 180,
  );
  assert.equal(removed.size, 0, 'Assignment does not instantly consume or grant resources.');
  assert.equal(assignLabor({ ...input, serial: 2, orders: [accepted.order] }).ok, false);
  const engineer = workers.find((n) => n.id === 'origin-engineer')!;
  assert.equal(
    assignLabor({ ...input, worker: engineer, serial: 2, orders: [accepted.order] }).ok,
    false,
    'Two workers cannot reserve the same finite trees.',
  );
  assert.equal(
    finishLabor(accepted.order, {
      worker,
      props: trees,
      removed,
      now: accepted.order.endsAt - 0.01,
    }).ok,
    false,
  );
  assert.equal(
    finishLabor(accepted.order, {
      worker: { ...worker, hp: 0 },
      props: trees,
      removed,
      now: accepted.order.endsAt,
    }).ok,
    false,
  );
  assert.equal(
    finishLabor(accepted.order, {
      worker,
      props: trees.slice(1),
      removed,
      now: accepted.order.endsAt,
    }).ok,
    false,
  );
  const finished = finishLabor(accepted.order, {
    worker,
    props: trees,
    removed,
    now: accepted.order.endsAt,
  });
  assert.ok(finished.ok);
  assert.deepEqual(finished.output, { wood: 4 });
  assert.deepEqual(new Set(finished.consumeIds), new Set(trees.map((p) => p.id)));
  assert.equal(finishLabor(finished.order, { worker, props: trees, removed, now: 1000 }).ok, false);
  finished.consumeIds.forEach((id) => removed.add(id));
  assert.equal(finishLabor(accepted.order, { worker, props: trees, removed, now: 1000 }).ok, false);
  assert.deepEqual(validateLaborOrders(JSON.parse(JSON.stringify([finished.order]))), [
    finished.order,
  ]);
  assert.throws(() =>
    validateLaborOrders([accepted.order, { ...accepted.order, id: 'labor:2', serial: 2 }]),
  );
  assert.throws(() =>
    validateLaborOrders([
      { ...accepted.order, allocations: [{ ...accepted.order.allocations[0], item: 'ore' }] },
    ]),
  );
  assert.throws(() =>
    validateLaborOrders([{ ...accepted.order, endsAt: accepted.order.startedAt }]),
  );
  assert.throws(() =>
    validateLaborOrders([
      { ...accepted.order, allocations: [{ ...accepted.order.allocations[0], amount: -2 }] },
    ]),
  );
});

test('Theo’s existing residence and staff are real people with motives, competence and reputation-dependent trust', () => {
  for (const seed of [0, 703, 0xffffffff]) {
    const world = new InfiniteWorld(seed, 3);
    assert.equal(world.tile(THEO_ESTATE.x, THEO_ESTATE.y).building, THEO_ESTATE.residenceId);
    for (const id of THEO_ESTATE.staffIds) {
      const npc = world.npcsAround(0, 0, 24).find((n) => n.id === id)!;
      assert.ok(npc);
      const low = workerProfile(npc, [-100, -100, -100, -100, -100, -100]);
      const high = workerProfile(npc, [100, 100, 100, 100, 100, 100]);
      assert.ok(high.loyalty > low.loyalty && high.competence === low.competence);
      assert.ok(high.motive.length > 40 && high.summary.includes('trust'));
      assert.equal(workerProfile({ ...npc, hostile: true }, []).eligible, false);
    }
  }
});
