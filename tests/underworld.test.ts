import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  Underworld,
  generateUnderworld,
  underworldSpace,
  validUnderworldSave,
  underworldTrapPhase,
  type UnderworldPeer,
  type UnderworldPlan,
  type UnderworldSave,
} from '../src/stichos/underworld.ts';

function setup(seed = 42) {
  const world = new Underworld(seed),
    peer: UnderworldPeer = {
      id: 'traveler',
      spaceId: 'surface',
      x: 10,
      y: 10,
      heading: 0,
      active: true,
      weaponKind: 'sword',
      weaponSeed: 44,
    };
  const result = world.enter(peer, 'town:7', { x: 10, y: 10 });
  assert.equal(result.ok, true);
  Object.assign(peer, result.transition!.to);
  let sequence = 0;
  return { world, peer, next: () => ++sequence };
}
function flood(plan: UnderworldPlan, blocked = new Set<string>()) {
  const seen = new Set<string>(),
    todo = [plan.entrance];
  while (todo.length) {
    const p = todo.pop()!,
      key = `${p.x},${p.y}`;
    if (
      seen.has(key) ||
      blocked.has(key) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x >= plan.width ||
      p.y >= plan.height ||
      !plan.cells[p.y * plan.width + p.x]
    )
      continue;
    seen.add(key);
    for (const [x, y] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      todo.push({ x: p.x + x, y: p.y + y });
  }
  return seen;
}
function clearedSave(world: Underworld) {
  const save = world.save();
  for (const f of save.floors)
    for (const enemy of f.enemies) {
      enemy.hp = 0;
      enemy.state = 'dead';
    }
  return save;
}

test('recall uses a real clear surface landing, charges once, preserves cooldown and clears only transient attacks', () => {
  const { world, peer, next } = setup();
  let debits = 0;
  const options = {
    coinLoss: 5,
    canOccupySurface: (p: { x: number; y: number }) => p.x === 11 && p.y === 10,
    debit: () => {
      debits++;
      return true;
    },
  };
  assert.equal(world.recall('outsider', 10, next(), options).ok, false);
  assert.equal(
    world.recall(peer.id, 10, next(), { ...options, canOccupySurface: () => false }).ok,
    false,
  );
  assert.equal(debits, 0);
  peer.weaponKind = 'bow';
  assert.equal(world.attack(peer, { kind: 'ranged', heading: 0, sequence: next() }, 9.95).ok, true);
  assert.equal(world.diagnostics().projectiles, 1);
  const result = world.recall(peer.id, 10, next(), options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.transition?.to, { spaceId: 'surface', x: 11, y: 10 });
  assert.equal(result.transition?.reason, 'recall');
  assert.deepEqual(result.recovery, { coinLoss: 5, cooldownUntil: 40 });
  assert.deepEqual(result.events, []);
  assert.equal('rest' in result, false);
  assert.equal(world.diagnostics().projectiles, 0);
  assert.equal(debits, 1);
  assert.equal(world.recall(peer.id, 10, next(), options).ok, false);
  assert.equal(debits, 1);
  const saved = world.save();
  assert.equal(validUnderworldSave(saved), true);
  const bad = structuredClone(saved);
  delete bad.residents[0].recoverySequence;
  assert.equal(validUnderworldSave(bad), false);
  const restored = new Underworld(42, saved);
  Object.assign(peer, result.transition!.to);
  const entry = restored.enter(peer, 'town:7', { x: 10, y: 10 });
  assert.equal(entry.ok, true);
  Object.assign(peer, entry.transition!.to);
  restored.leave(peer.id);
  assert.equal(restored.recall(peer.id, 39, restored.nextSequence(peer.id), options).ok, false);
  assert.equal(debits, 1);
  assert.equal(restored.recall(peer.id, 40, restored.nextSequence(peer.id), options).ok, true);
  assert.equal(debits, 2);
});

test('addressed floor grammar is deterministic, connected, varied and gated without hiding the puzzle', () => {
  const identities = new Set<string>();
  for (let seed = 0; seed < 40; seed++)
    for (let depth = 0; depth < 3; depth++) {
      const plan = generateUnderworld(seed, 'town:7', depth);
      assert.deepEqual(plan, generateUnderworld(seed, 'town:7', depth));
      identities.add(JSON.stringify(plan.rooms.map((r) => [r.width, r.height])));
      assert.equal(plan.spaceId, underworldSpace('town:7', depth));
      const all = flood(plan);
      for (const feature of plan.features)
        assert.ok(
          all.has(`${feature.x},${feature.y}`),
          `unreachable ${feature.kind} in ${seed}/${depth}`,
        );
      const doors = new Set(
          plan.features
            .filter((f) => ['gate', 'shortcut', 'secret'].includes(f.kind))
            .map((f) => `${f.x},${f.y}`),
        ),
        closed = flood(plan, doors);
      assert.equal(closed.has(`${plan.exit.x},${plan.exit.y}`), false);
      for (const rune of plan.features.filter((f) => f.kind === 'rune' || f.kind === 'inscription'))
        assert.ok(closed.has(`${rune.x},${rune.y}`));
    }
  assert.ok(identities.size > 50);
});
test('entry and stairs require real location; a space string cannot impersonate a transition', () => {
  const { world, peer, next } = setup();
  const plan = world.frame(peer.spaceId)!.plan,
    up = plan.features.find((f) => f.kind === 'up')!;
  assert.equal(
    world.enter({ ...peer, spaceId: 'surface', x: 100 }, 'elsewhere', { x: 10, y: 10 }).ok,
    false,
  );
  assert.equal(world.syncPeer({ ...peer, spaceId: underworldSpace('town:7', 2) }), false);
  assert.equal(world.interact({ ...peer, x: 25, y: 7 }, up.id, 1, next()).ok, false);
  const result = world.interact(peer, up.id, 1, next());
  assert.equal(result.transition!.to.spaceId, 'surface');
  assert.deepEqual(world.location(peer.id), { spaceId: 'surface', x: 10, y: 10 });
  assert.equal(
    world.enter({ ...peer, spaceId: 'surface', x: NaN }, 'town:7', { x: 10, y: 10 }).ok,
    false,
  );
});
test('archive signal order opens a persistent gate; wrong order resets and duplicate sequence is rejected', () => {
  const { world, peer, next } = setup(),
    plan = world.frame(peer.spaceId)!.plan;
  const wrong = plan.features.find((f) => f.kind === 'rune' && f.value !== plan.puzzle[0])!;
  Object.assign(peer, { x: wrong.x, y: wrong.y });
  assert.match(world.interact(peer, wrong.id, 1, next()).message, /resets/);
  for (const value of plan.puzzle) {
    const rune = plan.features.find((f) => f.kind === 'rune' && f.value === value)!;
    Object.assign(peer, { x: rune.x, y: rune.y });
    assert.equal(world.interact(peer, rune.id, 1, next()).ok, true);
  }
  const gate = plan.features.find((f) => f.kind === 'gate')!;
  assert.equal(world.blocked(peer.spaceId, gate.x, gate.y), false);
  assert.equal(world.interact(peer, wrong.id, 1, 1).ok, false);
  const restored = new Underworld(42, world.save());
  assert.equal(restored.blocked(peer.spaceId, gate.x, gate.y), false);
});
test('shortcut opens only from its vault side, and descent requires the floor boss', () => {
  const { world, peer, next } = setup(),
    plan = world.frame(peer.spaceId)!.plan,
    shortcut = plan.features.find((f) => f.kind === 'shortcut')!,
    down = plan.features.find((f) => f.kind === 'down')!;
  Object.assign(peer, { x: shortcut.x - 1, y: shortcut.y });
  assert.equal(world.interact(peer, shortcut.id, 1, next()).ok, false);
  Object.assign(peer, { x: shortcut.x + 1, y: shortcut.y });
  assert.equal(world.interact(peer, shortcut.id, 1, next()).ok, true);
  Object.assign(peer, { x: down.x, y: down.y });
  assert.equal(world.interact(peer, down.id, 1, next()).ok, false);
  const restored = new Underworld(42, clearedSave(world));
  const outcome = restored.interact(peer, down.id, 2, next());
  assert.equal(outcome.transition!.to.spaceId, underworldSpace('town:7', 1));
  assert.equal(
    restored.blocked(
      outcome.transition!.to.spaceId,
      outcome.transition!.to.x,
      outcome.transition!.to.y,
    ),
    false,
  );
});
test('salvage is durable until an owned successful economy acknowledgement, including bag-full retries', () => {
  const { world, peer, next } = setup(),
    plan = world.frame(peer.spaceId)!.plan,
    cache = plan.features.find((f) => f.kind === 'cache')!,
    safe = new Underworld(42, clearedSave(world));
  Object.assign(peer, { x: cache.x, y: cache.y });
  const outcome = safe.interact(peer, cache.id, 1, next());
  assert.equal(outcome.ok, true);
  assert.equal(safe.pendingRewards(peer.id).length, 1);
  const token = safe.pendingRewards(peer.id)[0].id;
  assert.equal(safe.acknowledgeReward('other', token), false);
  const restored = new Underworld(42, safe.save());
  assert.deepEqual(restored.pendingRewards(peer.id), safe.pendingRewards(peer.id));
  assert.equal(restored.interact(peer, cache.id, 2, next()).ok, false);
  assert.equal(restored.acknowledgeReward(peer.id, token), true);
  assert.equal(restored.acknowledgeReward(peer.id, token), false);
  assert.equal(restored.pendingRewards(peer.id).length, 0);
});
test('rescue unlocks a named persistent surface trade once and is blocked by its overseer', () => {
  const { world, peer, next } = setup(),
    plan = world.frame(peer.spaceId)!.plan,
    survivor = plan.features.find((f) => f.kind === 'survivor')!;
  Object.assign(peer, { x: survivor.x, y: survivor.y });
  assert.equal(world.interact(peer, survivor.id, 1, next()).ok, false);
  const safe = new Underworld(42, clearedSave(world)),
    result = safe.interact(peer, survivor.id, 2, next());
  const rescue = result.events.find((e) => e.kind === 'rescue');
  assert.ok(rescue && rescue.profession === 'mason');
  assert.ok(result.events.some((e) => e.kind === 'unlock' && e.unlock === 'waterworks'));
  const restored = new Underworld(42, safe.save());
  assert.equal(restored.interact(peer, survivor.id, 3, next()).events.length, 0);
});
test('weapon combos use trusted generated profiles and preserve cooldown across disconnect', () => {
  const { world, peer, next } = setup();
  const enemy = world.frame(peer.spaceId)!.state.enemies[0];
  Object.assign(peer, { x: enemy.x - 1, y: enemy.y });
  const first = world.attack(peer, { kind: 'melee', heading: 0, sequence: next() }, 1);
  assert.ok(first.events.some((e) => e.kind === 'hit'));
  world.leave(peer.id);
  assert.equal(world.attack(peer, { kind: 'melee', heading: 0, sequence: next() }, 1.01).ok, false);
  const second = world.attack(peer, { kind: 'melee', heading: 0, sequence: next() }, 1.7);
  assert.equal(second.ok, true);
  const third = world.attack(peer, { kind: 'melee', heading: 0, sequence: next() }, 2.4);
  assert.match(third.message, /Finisher/);
  const deaths = [...first.events, ...second.events, ...third.events].filter(
    (e) => e.kind === 'death',
  );
  assert.equal(deaths.length, 1);
  assert.deepEqual(deaths[0].death.contributors, [peer.id]);
  assert.equal(world.attack(peer, { kind: 'melee', heading: 0, sequence: 1 }, 4).ok, false);
});
test('all ranged enemies telegraph fixed bearings before projectiles and cannot damage through walls', () => {
  const { world, peer } = setup();
  const sentry = world.frame(peer.spaceId)!.state.enemies.find((e) => e.kind === 'sentry')!;
  Object.assign(peer, { x: sentry.x - 3, y: sentry.y });
  world.tick(0.1, [peer], 1);
  const first = world.frame(peer.spaceId)!;
  assert.ok(first.state.enemies.find((e) => e.id === sentry.id)!.intent);
  assert.equal(first.projectiles.length, 0);
  for (let i = 0; i < 10; i++) world.tick(0.1, [peer], 1.1 + i * 0.1);
  assert.ok(world.frame(peer.spaceId)!.projectiles.length > 0);
  const isolated = { ...peer, x: 1, y: 1 };
  assert.equal(world.syncPeer(isolated), false);
});
test('bosses change phase below half health with readable warning and recoverable timing', () => {
  const { world, peer } = setup(),
    save = world.save(),
    boss = save.floors[0].enemies.find((e) => e.kind === 'boss')!;
  boss.hp = Math.floor(boss.maxHp * 0.49);
  const staged = new Underworld(42, save);
  Object.assign(peer, { x: boss.x + 1, y: boss.y });
  const events = staged.tick(0.1, [peer], 1);
  assert.ok(events.some((e) => e.kind === 'cue' && e.cue === 'boss-phase'));
  const current = staged.frame(peer.spaceId)!.state.enemies.find((e) => e.id === boss.id)!;
  assert.equal(current.phase, 2);
  assert.equal(current.intent!.shape, 'radial');
  assert.ok(current.intent!.duration >= 1);
  assert.equal(
    events.some((e) => e.kind === 'hit' && e.actorId === boss.id),
    false,
  );
  for (let i = 0; i < 12; i++) staged.tick(0.1, [peer], 1.1 + i * 0.1);
  assert.equal(
    staged.frame(peer.spaceId)!.state.enemies.find((e) => e.id === boss.id)!.state,
    'recovery',
  );
});
test('traps are deterministic warnings then finite damage with immunity cadence', () => {
  const { world, peer } = setup(),
    trap = world.frame(peer.spaceId)!.plan.features.find((f) => f.kind === 'trap')!;
  Object.assign(peer, { x: trap.x, y: trap.y });
  let now = 0;
  while (underworldTrapPhase(now, trap.id) !== 'active') now += 0.01;
  const first = world.tick(0.25, [peer], now);
  assert.equal(first.filter((e) => e.kind === 'hit' && e.actorId === trap.id).length, 1);
  assert.equal(
    world.tick(0.25, [peer], now + 0.01).filter((e) => e.kind === 'hit' && e.actorId === trap.id)
      .length,
    0,
  );
  assert.equal(world.tick(NaN, [peer], now).length, 0);
});
test('restored floor and residents retain identity without audio, visual objects or active attack timers', () => {
  const { world, peer } = setup();
  world.tick(0.1, [peer], 1);
  const save = world.save();
  assert.equal(validUnderworldSave(save), true);
  assert.deepEqual(new Underworld(42, save).save(), save);
  assert.equal(JSON.stringify(save).includes('intent'), false);
  assert.throws(() => new Underworld(43, save));
  for (const malformed of [
    { ...save, complexes: [...save.complexes, ...save.complexes] },
    { ...save, residents: [...save.residents, ...save.residents] },
    { ...save, seed: NaN },
    { ...save, rewards: [{ kind: 'reward' }] },
  ])
    assert.equal(validUnderworldSave(malformed), false);
  const bad = structuredClone(save);
  bad.floors[0].enemies[0].hp = -1;
  assert.equal(validUnderworldSave(bad), false);
});
test('multi-floor simulation has bounded enemy, projectile and event counts under crowded stress', () => {
  const { world, peer } = setup();
  for (let d = 0; d < 3; d++) world.floor('town:7', d);
  const samples = [];
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    const events = world.tick(0.25, [peer], i * 0.25);
    samples.push(performance.now() - start);
    assert.ok(events.length <= 256);
    assert.ok(world.diagnostics().projectiles <= 64);
  }
  assert.equal(world.diagnostics().enemyCount, 18);
  assert.ok(samples.every(Number.isFinite));
});

test('a pursuing actor follows connected corridors across its starting room without disappearing', () => {
  const { world, peer } = setup(),
    save = clearedSave(world),
    enemy = save.floors[0].enemies[0];
  enemy.hp = enemy.maxHp;
  enemy.state = 'idle';
  enemy.x = 20;
  enemy.y = 7;
  const roaming = new Underworld(42, save);
  Object.assign(peer, { x: 8, y: 21 });
  for (let i = 0; i < 600; i++) roaming.tick(0.1, [peer], i * 0.1);
  const moved = roaming.frame(peer.spaceId)!.state.enemies[0];
  assert.equal(moved.id, enemy.id);
  assert.ok(Math.hypot(moved.x - peer.x, moved.y - peer.y) < 3);
  const resumed = new Underworld(42, roaming.save());
  assert.deepEqual(resumed.frame(peer.spaceId)!.state.enemies[0].x, moved.x);
});

test('authority rejects impossible poses, weapon-family misuse, hostile save extensions and saturated admission', () => {
  const { world, peer, next } = setup();
  assert.equal(
    world.attack(
      { ...peer, spaceId: underworldSpace('town:7', 1) },
      { kind: 'melee', heading: 0, sequence: next() },
      1,
    ).ok,
    false,
  );
  assert.equal(world.attack(peer, { kind: 'spell', heading: 0, sequence: next() }, 2).ok, false);
  assert.equal(world.syncPeer({ ...peer, x: 999, y: 999 }), false);
  const save = world.save();
  assert.equal(validUnderworldSave({ ...save, audio: [1, 2, 3] }), false);
  const injected = structuredClone(save);
  Object.assign(injected.floors[0].enemies[0], { microphone: 'never' });
  assert.equal(validUnderworldSave(injected), false);
  const capacity = new Underworld(42);
  for (let i = 0; i < 16; i++) capacity.floor(`town:${i}`, 0);
  assert.throws(() => capacity.floor('town:overflow', 0));
  assert.equal(capacity.diagnostics().complexes, 16);
});
