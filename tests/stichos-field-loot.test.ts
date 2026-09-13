import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FieldEconomy,
  FIELD_ITEMS,
  FIELD_RECIPES,
  FIELD_RULES,
  WILDLIFE_HEALTH,
  fieldSlots,
  rollFieldLoot,
  validFieldBundle,
  validFieldEconomySave,
  validFieldEconomyFrame,
  type FieldDeath,
  type FieldEconomySave,
  type FieldPeer,
} from '../src/stichos/field-loot.ts';
import type { FaunaActor, FaunaKind } from '../src/stichos/living-world.ts';
import { LivingWorld } from '../src/stichos/living-world.ts';
import { worldTimeAt } from '../src/stichos/world-time.ts';

const peer: FieldPeer = { id: 'life-one', spaceId: 'surface', x: 4, y: 5 };
const other: FieldPeer = { ...peer, id: 'life-two' };
const zero = { coins: 0, items: {} };
const death = (actorId = 'enemy-1', extra: Partial<FieldDeath> = {}): FieldDeath => ({
  actorId,
  kind: 'enemy',
  difficulty: 2,
  role: 'guard',
  contributors: [peer.id],
  spaceId: 'surface',
  x: 4,
  y: 5,
  time: 10,
  biome: 'woodland',
  ...extra,
});
const animal = (kind: FaunaKind = 'grazer', actorId = 'fauna-1'): FaunaActor => ({
  id: actorId,
  seed: 13,
  kind,
  name: 'Field grazer',
  group: 'fauna-group',
  home: { x: 4, y: 5 },
  x: 4,
  y: 5,
  heading: 0,
  activity: 'forage',
  phase: 0,
  scale: 1,
  color: '#abcdef',
  dangerous: kind === 'wolf' || kind === 'boar',
  call: null,
});
const setup = () => {
  const field = new FieldEconomy(3886);
  field.ensure(peer.id);
  field.ensure(other.id);
  return field;
};

test('expedition coin forfeiture is loss-only and remains possible at permanent receipt capacity', () => {
  const original = setup(),
    saved = original.save();
  for (let i = 0; i < FIELD_RULES.maxReceipts; i++)
    saved.receipts.push({
      id: `transaction:recall-full-${i}`,
      actorId: peer.id,
      kind: 'transaction',
    });
  const field = new FieldEconomy(3886, saved),
    before = field.satchel(peer.id)!;
  for (const invalid of [-1, NaN, Infinity, 0.5, 25])
    assert.equal(field.forfeitCoins(peer.id, invalid).ok, false);
  assert.equal(field.forfeitCoins('unknown', 0).ok, false);
  assert.deepEqual(field.satchel(peer.id), before);
  assert.equal(field.forfeitCoins(peer.id, 5).ok, true);
  assert.equal(field.satchel(peer.id)!.coins, 19);
  assert.deepEqual(field.satchel(peer.id)!.items, before.items);
  assert.equal(field.forfeitCoins(peer.id, 19).ok, true);
  assert.equal(field.forfeitCoins(peer.id, 0).ok, true);
  assert.equal(field.satchel(peer.id)!.coins, 0);
  assert.equal(field.save().receipts.length, FIELD_RULES.maxReceipts);
  assert.equal(validFieldEconomySave(field.save()), true);
});

test('field kit persists per authenticated life, is isolated and returned by copy', () => {
  const field = setup();
  const initial = field.ensure(peer.id)!;
  initial.coins = 999999;
  initial.items.wood = 999;
  assert.equal(field.ensure(peer.id)!.coins, 24);
  assert.equal(field.transact(peer.id, { coins: 7, items: {} }, zero, 'fee-one').ok, true);
  assert.equal(field.ensure(peer.id)!.coins, 17);
  const resumed = new FieldEconomy(3886, field.save());
  assert.equal(resumed.ensure(peer.id)!.coins, 17);
  assert.equal(resumed.ensure(other.id)!.coins, 24);
  assert.equal(resumed.ensure('__proto__'), undefined);
  assert.equal(resumed.ensure(''), undefined);
  assert.throws(() => new FieldEconomy(17, field.save()), /Invalid/);
});

test('deterministic loot is unaffected by contributor order, death timestamp or camera', () => {
  const first = rollFieldLoot(3886, death('once', { contributors: [peer.id, other.id] }));
  const replay = rollFieldLoot(
    3886,
    death('once', { time: 5000, x: 300, contributors: [other.id, peer.id] }),
  );
  assert.deepEqual(first, replay);
  assert.notDeepEqual(rollFieldLoot(17, death('once')), first);
  const field = setup(),
    dropped = field.spawnDeath(death());
  assert.equal(dropped.ok, true);
  assert.equal(dropped.drop!.sourceId, 'enemy-1');
  assert.equal(field.spawnDeath(death()).ok, false);
  const reopened = new FieldEconomy(3886, field.save());
  assert.equal(reopened.spawnDeath(death()).ok, false);
});

test('rarity and reward distributions are varied, bounded, and favor harder fights', () => {
  const counts = { common: 0, uncommon: 0, rare: 0, exceptional: 0 };
  let easyCoins = 0,
    hardCoins = 0;
  const signatures = new Set<string>();
  for (let i = 0; i < 5000; i++) {
    const easy = rollFieldLoot(99, death(`enemy-${i}`, { difficulty: 1 }));
    const hard = rollFieldLoot(99, death(`enemy-${i}`, { difficulty: 8 }));
    counts[easy.rarity]++;
    easyCoins += easy.bundle.coins;
    hardCoins += hard.bundle.coins;
    signatures.add(JSON.stringify(easy));
    assert.ok(validFieldBundle(easy.bundle));
    assert.ok(easy.bundle.coins >= 5 && easy.bundle.coins < 10);
    assert.ok(Object.values(easy.bundle.items).every((n) => n! > 0 && n! <= 8));
  }
  assert.ok(counts.common > 3000 && counts.common < 4200);
  assert.ok(counts.uncommon > 650 && counts.uncommon < 1500);
  assert.ok(counts.rare > 150 && counts.rare < 500);
  assert.ok(counts.exceptional > 20 && counts.exceptional < 130);
  assert.ok(hardCoins / easyCoins > 3);
  assert.ok(signatures.size >= 18);
});

test('ecological carcasses have species-appropriate yields and no cash or forged gear', () => {
  for (const kind of ['bird', 'grazer', 'boar', 'wolf'] as const) {
    for (let i = 0; i < 300; i++) {
      const loot = rollFieldLoot(i, death(`fauna-${i}`, { kind }));
      assert.equal(loot.bundle.coins, 0);
      assert.ok(
        Object.keys(loot.bundle.items).every(
          (key) => FIELD_ITEMS[key as keyof typeof FIELD_ITEMS].family === 'animal',
        ),
      );
      if (kind === 'bird') assert.ok(loot.bundle.items.feather! >= 2);
      if (kind === 'grazer') assert.equal(loot.bundle.items.hide, 2);
      if (kind === 'wolf') {
        assert.equal(loot.bundle.items.fang, 1);
        assert.equal(loot.bundle.items.meat, undefined);
      }
      assert.deepEqual(loot, rollFieldLoot(i, death(`fauna-${i}`, { kind, protected: true })));
    }
  }
  assert.ok(
    rollFieldLoot(4, death('boss', { role: 'warden', difficulty: 6 })).bundle.items.crystal! >= 3,
  );
  assert.ok(rollFieldLoot(4, death('mage', { role: 'scholar' })).bundle.items.knowledge);
});

test('claim enforces stable contributor membership, world space, exact range and one winner', () => {
  const field = setup();
  field.spawnDeath(death());
  assert.match(field.claim(other, 'drop:enemy-1', 11).message, /first claim/);
  assert.equal(
    field.claim({ ...peer, spaceId: 'underground:town:0' }, 'drop:enemy-1', 11).ok,
    false,
  );
  assert.equal(
    field.claim({ ...peer, x: peer.x + FIELD_RULES.claimDistance + 0.001 }, 'drop:enemy-1', 11).ok,
    false,
  );
  assert.equal(
    field.claim({ ...peer, x: peer.x + FIELD_RULES.claimDistance }, 'drop:enemy-1', 11).ok,
    true,
  );
  assert.equal(field.claim(peer, 'drop:enemy-1', 11).ok, false);
  assert.equal(field.claim(other, 'drop:enemy-1', 11).ok, false);
  assert.equal(new FieldEconomy(3886, field.save()).claim(peer, 'drop:enemy-1', 12).ok, false);
  assert.equal(field.spawnDeath(death()).ok, false);
});

test('shared contributing party and late scavengers can recover, but never duplicate', () => {
  const field = setup();
  field.spawnDeath(death('shared', { contributors: [peer.id, other.id] }));
  assert.equal(field.claim(other, 'drop:shared', 11).ok, true);
  assert.equal(field.claim(peer, 'drop:shared', 11).ok, false);
  field.spawnDeath(death('abandoned'));
  assert.equal(
    field.claim(other, 'drop:abandoned', 10 + FIELD_RULES.ownershipSeconds - 0.001).ok,
    false,
  );
  const scavenged = field.claim(other, 'drop:abandoned', 10 + FIELD_RULES.ownershipSeconds);
  assert.equal(scavenged.ok, true);
  assert.equal(scavenged.scavenged, true);
});

test('full satchel pickup is atomic and leaves the exact drop untouched', () => {
  const field = setup();
  field.spawnDeath(death());
  const save = field.save();
  save.satchels.find((s) => s.actorId === peer.id)!.capacity = 4;
  const full = new FieldEconomy(3886, save);
  const before = full.save();
  assert.equal(full.claim(peer, 'drop:enemy-1', 11).ok, false);
  assert.deepEqual(full.save(), before);
  assert.equal(
    full.transact(peer.id, { coins: 0, items: { fiber: 3 } }, zero, 'make-room').ok,
    true,
  );
  assert.equal(full.claim(peer, 'drop:enemy-1', 11).ok, true);
});

test('ground expiry is persistent and cannot reroll a defeated identity', () => {
  const field = setup();
  field.spawnDeath(death());
  field.tick(10 + FIELD_RULES.expirySeconds - 0.001);
  assert.ok(field.drop('drop:enemy-1'));
  field.tick(10 + FIELD_RULES.expirySeconds);
  assert.equal(field.drop('drop:enemy-1'), undefined);
  assert.equal(field.save().receipts[0].kind, 'death');
  const resumed = new FieldEconomy(3886, field.save());
  assert.equal(resumed.spawnDeath(death()).ok, false);
  assert.equal(resumed.claim(peer, 'drop:enemy-1', 4000).ok, false);
});

test('satchel transactions reject client-style forged data, overspending and replay', () => {
  const field = setup(),
    before = field.save();
  assert.equal(
    field.transact(
      peer.id,
      { coins: 500, items: {} },
      { coins: 0, items: { relic: 1 } },
      'too-poor',
    ).ok,
    false,
  );
  assert.equal(
    field.transact(peer.id, { coins: 0, items: { wood: 10 } }, zero, 'too-few').ok,
    false,
  );
  assert.equal(field.transact(peer.id, { coins: -4, items: {} }, zero, 'negative').ok, false);
  assert.equal(
    field.transact(peer.id, zero, { coins: 0, items: { unknown: 1 } } as never, 'invented').ok,
    false,
  );
  assert.equal(field.transact(peer.id, zero, { coins: Infinity, items: {} }, 'infinite').ok, false);
  assert.deepEqual(field.save(), before);
  assert.equal(
    field.transact(
      peer.id,
      { coins: 2, items: { wood: 2 } },
      { coins: 0, items: { planks: 1 } },
      'craft-one',
    ).ok,
    true,
  );
  const after = field.save();
  assert.equal(field.transact(peer.id, zero, { coins: 900, items: {} }, 'craft-one').ok, false);
  assert.equal(field.transact(other.id, zero, { coins: 900, items: {} }, 'craft-one').ok, false);
  assert.deepEqual(field.save(), after);
});

test('crafting consumes materials once, uses correct stations and makes useful goods', () => {
  const field = setup(),
    workshop = { ...peer, kind: 'workshop' as const };
  assert.equal(
    field.craft(peer, 'boards', { ...workshop, kind: 'field' }, 'bad-station').ok,
    false,
  );
  assert.equal(field.craft(peer, 'boards', { ...workshop, x: 40 }, 'remote').ok, false);
  assert.equal(field.craft(peer, 'boards', workshop, 'boards-one').ok, true);
  assert.equal(field.satchel(peer.id)!.items.wood, 1);
  assert.equal(field.satchel(peer.id)!.items.planks, 2);
  assert.equal(field.craft(peer, 'boards', workshop, 'boards-one').ok, false);
  assert.equal(field.craft(peer, 'unknown', workshop, 'invented-recipe').ok, false);
  const recipes = new Set(FIELD_RECIPES.map((r) => r.id));
  assert.equal(recipes.size, FIELD_RECIPES.length);
  for (const recipe of FIELD_RECIPES) {
    assert.ok(validFieldBundle(recipe.cost));
    assert.ok(validFieldBundle(recipe.reward));
  }
});

test('tool-backed gathering has actual identity, range, cooldown and depletion receipts', () => {
  const field = setup(),
    tree = { ...peer, id: 'tree-19', kind: 'wood' as const };
  assert.equal(field.gather(peer, tree, 10).ok, false);
  assert.equal(field.craft(peer, 'hatchet', { ...peer, kind: 'field' }, 'hatchet-one').ok, true);
  assert.equal(field.gather({ ...peer, x: 100 }, tree, 10).ok, false);
  const harvested = field.gather(peer, tree, 10);
  assert.equal(harvested.ok, true);
  assert.ok(harvested.reward!.items.wood! >= 2);
  assert.equal(field.gather(peer, { ...tree, id: 'tree-20' }, 10.1).ok, false);
  assert.equal(field.gather(other, tree, 20).ok, false);
  const resumed = new FieldEconomy(3886, field.save());
  assert.equal(resumed.gather(peer, tree, 20).ok, false);
  assert.equal(resumed.gather(peer, { ...tree, id: 'tree-20' }, 20).ok, true);
});

test('selling is local, bounded and cannot turn forged or starter tools into money', () => {
  const field = setup();
  assert.equal(field.sell(peer, 'wood', -1, peer, 'negative-sale').ok, false);
  assert.equal(field.sell(peer, 'wood', 1, { ...peer, x: 30 }, 'remote-sale').ok, false);
  assert.equal(field.sell(peer, 'field-knife', 1, peer, 'starter-profit').ok, false);
  assert.equal(field.sell(peer, 'wood', 1, { ...peer, buyMultiplier: 100 }, 'bad-price').ok, false);
  assert.equal(field.sell(peer, 'wood', 2, { ...peer, buyMultiplier: 1.2 }, 'real-sale').ok, true);
  assert.equal(field.satchel(peer.id)!.coins, 28);
  assert.equal(field.satchel(peer.id)!.items.wood, 2);
  assert.equal(field.sell(peer, 'wood', 2, peer, 'real-sale').ok, false);
});

test('wildlife has persistent health, owned tools, clear strike and reaction states', () => {
  const field = setup(),
    grazer = animal();
  assert.equal(field.hunt(peer, grazer, 10).ok, false, 'line of sight must be explicitly resolved');
  assert.equal(field.hunt({ ...peer, x: 80 }, grazer, 10, { clearLine: true }).ok, false);
  const hit = field.hunt(peer, grazer, 10, { clearLine: true });
  assert.equal(hit.ok, true);
  assert.equal(hit.health, WILDLIFE_HEALTH.grazer - 8);
  assert.equal(hit.reaction, 'flee');
  assert.equal(field.hunt(peer, grazer, 10.1, { clearLine: true }).ok, false);
  const resumed = new FieldEconomy(3886, field.save());
  assert.equal(resumed.hunt(peer, grazer, 10.2, { clearLine: true }).ok, false);
  assert.equal(resumed.hunt(other, grazer, 10.2, { clearLine: true }).health, 20);
  assert.deepEqual(resumed.wound(grazer.id)!.contributors, [peer.id, other.id].sort());
  assert.equal(
    resumed.hunt(peer, animal('wolf', 'wolf-one'), 11, { clearLine: true }).reaction,
    'defend',
  );
});

test('fatal wildlife strike makes exactly one carcass and a protected-hunt consequence', () => {
  const field = setup(),
    bird = animal('bird');
  assert.equal(field.hunt(peer, bird, 10, { clearLine: true }).killed, false);
  const dead = field.hunt(other, bird, 11, {
    clearLine: true,
    protected: true,
    factionId: 'wardens',
  });
  assert.equal(dead.killed, true);
  assert.equal(dead.consequence, 'protected-hunt');
  assert.equal(field.wound(bird.id), undefined);
  assert.deepEqual(dead.drop!.eligible, [peer.id, other.id].sort());
  assert.equal(field.hunt(peer, bird, 20, { clearLine: true }).ok, false);
  assert.equal(field.claim(peer, dead.drop!.id, 12).consequence, 'protected-harvest');
  assert.equal(
    new FieldEconomy(3886, field.save()).hunt(peer, bird, 30, { clearLine: true }).ok,
    false,
  );
});

test('harvesting requires a knife even when somebody else made the kill', () => {
  const field = setup();
  field.spawnDeath(death('carcass', { kind: 'boar', contributors: [peer.id, other.id] }));
  field.transact(other.id, { coins: 0, items: { 'field-knife': 1 } }, zero, 'lost-knife');
  const before = field.save();
  assert.match(field.claim(other, 'drop:carcass', 11).message, /knife/);
  assert.deepEqual(field.save(), before);
  assert.equal(field.claim(peer, 'drop:carcass', 11).ok, true);
});

test('spear upgrade has genuine reach and damage without trusting personal weapon metadata', () => {
  const field = setup(),
    target = { ...animal('wolf'), x: peer.x + 2.5 };
  assert.equal(field.hunt(peer, target, 10, { clearLine: true }).ok, false);
  field.transact(peer.id, zero, { coins: 0, items: { spear: 1 } }, 'server-reward');
  const hit = field.hunt(peer, target, 10, { clearLine: true });
  assert.equal(hit.ok, true);
  assert.equal(hit.damage, 18);
  assert.equal(hit.health, 26);
});

test('bounded visibility is distinct from persistent existence and uses world spaces', () => {
  const field = setup();
  for (let i = 0; i < 100; i++) field.spawnDeath(death(`near-${i}`, { x: 4 + i / 100 }));
  field.spawnDeath(death('far', { x: 400 }));
  field.spawnDeath(death('below', { spaceId: 'underground:town:0' }));
  const frame = field.frame(peer, 11)!;
  assert.equal(validFieldEconomyFrame(frame), true);
  assert.equal(frame.drops.length, FIELD_RULES.visibleDrops);
  assert.equal(
    frame.drops.some((d) => d.sourceId === 'far' || d.sourceId === 'below'),
    false,
  );
  assert.equal(field.save().drops.length, 102);
  assert.equal(field.frame({ ...peer, x: 400 }, 11)!.drops[0].sourceId, 'far');
  assert.equal(
    field.frame({ ...peer, spaceId: 'underground:town:0' }, 11)!.drops[0].sourceId,
    'below',
  );
  frame.drops[0].bundle.coins = 100000;
  assert.notEqual(field.drop(frame.drops[0].id)!.bundle.coins, 100000);
  assert.equal(validFieldEconomyFrame({ ...frame, drops: field.save().drops }), false);
  assert.equal(validFieldEconomyFrame({ ...frame, audio: [] }), false);
});

test('active drop saturation refuses admission without evicting an old unclaimed reward', () => {
  const field = setup();
  for (let i = 0; i < FIELD_RULES.maxDrops; i++)
    assert.equal(field.spawnDeath(death(`limit-${i}`)).ok, true);
  const before = field.save();
  assert.equal(field.spawnDeath(death('overflow')).ok, false);
  assert.deepEqual(field.save(), before);
  assert.equal(field.diagnostics.saturated, true);
  assert.equal(field.claim(peer, 'drop:limit-0', 11).ok, true);
  assert.equal(field.spawnDeath(death('overflow')).ok, true);
  assert.equal(field.spawnDeath(death('limit-0')).ok, false);
});

test('durable receipt limit reserves room for outstanding claims and never evicts replay protection', () => {
  const field = setup();
  field.spawnDeath(death());
  const save = field.save();
  for (let i = 0; i < FIELD_RULES.maxReceipts - 2; i++)
    save.receipts.push({ id: `transaction:old-${i}`, actorId: peer.id, kind: 'transaction' });
  assert.equal(validFieldEconomySave(save), true);
  const full = new FieldEconomy(3886, save);
  assert.equal(full.transact(peer.id, zero, { coins: 1, items: {} }, 'overflow').ok, false);
  assert.equal(full.spawnDeath(death('overflow')).ok, false);
  assert.equal(
    full.claim(peer, 'drop:enemy-1', 11).ok,
    true,
    'outstanding claim had a reserved receipt',
  );
  assert.equal(full.save().receipts.length, FIELD_RULES.maxReceipts);
  assert.equal(full.transact(peer.id, zero, { coins: 1, items: {} }, 'old-0').ok, false);
});

test('strict save schema rejects duplicate identities, tampering, unsupported values and audio', () => {
  const field = setup();
  field.spawnDeath(death());
  field.hunt(peer, animal(), 10, { clearLine: true });
  const save = field.save();
  assert.ok(validFieldEconomySave(save));
  const corrupt = (change: (s: FieldEconomySave) => void) => {
    const bad = structuredClone(save);
    change(bad);
    assert.equal(validFieldEconomySave(bad), false);
    assert.throws(() => new FieldEconomy(3886, bad));
  };
  corrupt((s) => s.satchels.push(s.satchels[0]));
  corrupt((s) => s.drops.push(s.drops[0]));
  corrupt((s) => s.receipts.push(s.receipts[0]));
  corrupt((s) => s.wounds.push(s.wounds[0]));
  corrupt((s) => {
    s.satchels[0].coins = NaN;
  });
  corrupt((s) => {
    s.satchels[0].items.wood = -1;
  });
  corrupt((s) => {
    s.drops[0].x = Infinity;
  });
  corrupt((s) => {
    s.drops[0].spaceId = '../../other-world';
  });
  corrupt((s) => {
    s.drops[0].expiresAt = 1;
  });
  corrupt((s) => {
    s.drops[0].eligible = [];
  });
  corrupt((s) => {
    s.receipts = [];
  });
  corrupt((s) => {
    (s as unknown as Record<string, unknown>).audio = 'content';
  });
  corrupt((s) => {
    (s.drops[0] as unknown as Record<string, unknown>).microphone = [];
  });
  assert.equal(/"(?:audio|voice|samples|codec|microphone|vfx)"/.test(JSON.stringify(save)), false);
});

test('slot accounting prevents overstacking and overflowing currency atomically', () => {
  assert.equal(fieldSlots({ wood: 99, stone: 100 }), 3);
  const field = setup(),
    before = field.save();
  assert.equal(
    field.transact(peer.id, zero, { coins: FIELD_RULES.maxCoins, items: {} }, 'overflow-coins').ok,
    false,
  );
  assert.equal(
    field.transact(
      peer.id,
      zero,
      { coins: 0, items: { wood: FIELD_RULES.stackSize * 25 } },
      'overflow-bag',
    ).ok,
    false,
  );
  assert.deepEqual(field.save(), before);
});

test('actual persistent fauna death stays dead across ledger restore and region resampling', () => {
  const world = {
    seed: 3886,
    tile: (x: number, y: number) => ({
      x,
      y,
      seed: 1,
      terrain: 'grass' as const,
      biome: 'woodland' as const,
      height: 0,
      temperature: 18,
      detail: 0,
    }),
    blocked: () => false,
  };
  const living = new LivingWorld({ persistent: true });
  const original = living.sample(world, worldTimeAt(10), [peer]);
  assert.ok(original.actors.length > 0);
  const target = original.actors[0];
  const hunter = { ...peer, x: target.x, y: target.y };
  const field = setup();
  let killed = false;
  for (let at = 10; at < 30 && !killed; at++)
    killed = field.hunt(hunter, target, at, { clearLine: true }).killed ?? false;
  assert.equal(killed, true);
  assert.equal(living.defeat(target.id), true);
  const restoredLiving = new LivingWorld({ persistent: true, save: living.save() });
  const restoredField = new FieldEconomy(3886, field.save());
  restoredLiving.sample(world, worldTimeAt(100), [{ ...peer, x: 2000, y: 2000 }]);
  assert.equal(
    restoredLiving.sample(world, worldTimeAt(200), [hunter]).actors.some((a) => a.id === target.id),
    false,
  );
  assert.equal(restoredField.hunt(hunter, target, 200, { clearLine: true }).ok, false);
  assert.ok(restoredField.drop(`drop:${target.id}`));
});
