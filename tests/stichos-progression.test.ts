import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COSMETICS,
  FURNITURE,
  createProgression,
  restoreProgression,
  professionProfile,
  grantPractice,
  skillBonuses,
  upgradeBonuses,
  homeEffects,
  gardenStatus,
  applyCosmetic,
  ownsCosmetic,
  previewProgression,
  applyProgression,
} from '../src/stichos/progression.ts';
import type {
  ProgressionAction,
  ProgressionContext,
  ProgressionWallet,
  HomeAddress,
} from '../src/stichos/progression.ts';
import type { Appearance } from '../src/stichos/types.ts';

const address: HomeAddress = {
  id: 'home:origin:house:1',
  buildingId: 'origin:house:1',
  settlementId: 'origin',
  name: 'A room beside the gardens',
  x: 0,
  y: 7,
};
const look: Appearance = {
  seed: 42,
  skin: '#c7a38a',
  hair: '#665544',
  coat: '#885544',
  trim: '#aaa077',
  trousers: '#556677',
  height: 1.1,
  build: 0.9,
  hairStyle: 2,
  hat: 0,
  cloak: false,
  weapon: 'staff',
};
function fixture() {
  const state = createProgression(734);
  const wallet: ProgressionWallet = {
    coins: 500,
    inventory: { wood: 20, ore: 20, cequin: 4, heartleaf: 4, emberroot: 4, bandage: 2, lens: 1 },
  };
  const context: ProgressionContext = {
    bodyId: 'priest:734',
    position: { x: 0, y: 5 },
    time: 100,
    capacity: 80,
    nearWorkbench: true,
    ownedWeapons: ['staff', 'sword', 'bow'],
  };
  const run = (action: ProgressionAction) => applyProgression(state, wallet, action, context);
  return { state, wallet, context, run };
}
const snapshot = (...things: unknown[]) => JSON.stringify(things);

test('profession practice unlocks bounded consequential bonuses and survives saves', () => {
  const { state } = fixture();
  assert.equal(professionProfile(state, 'botany').level, 1);
  assert.equal(grantPractice(state, 'botany', 39), 0);
  assert.equal(grantPractice(state, 'botany', 1), 1);
  assert.equal(professionProfile(state, 'botany').level, 2);
  const before = state.xp.botany;
  for (const bad of [-5, NaN, Infinity]) grantPractice(state, 'botany', bad);
  assert.equal(state.xp.botany, before);
  for (const kind of ['botany', 'crafting', 'combat'] as const) {
    grantPractice(state, kind, 1000);
    grantPractice(state, kind, 1000);
    assert.equal(professionProfile(state, kind).level, 8);
    assert.equal(professionProfile(state, kind).nextAt, null);
  }
  const bonus = skillBonuses(state);
  assert.equal(bonus.harvestExtra, 2);
  assert.equal(bonus.medicineBonus, 14);
  assert.equal(bonus.craftExtra, 1);
  assert.equal(bonus.damageBonus, 3);
  assert(bonus.cooldownMultiplier > 0.8 && bonus.cooldownMultiplier < 1);
  assert.deepEqual(skillBonuses(restoreProgression(JSON.parse(JSON.stringify(state)), 734)), bonus);
});

test('weapon improvements require work, materials and skill and stay with their original body', () => {
  const { state, wallet, context, run } = fixture();
  context.nearWorkbench = false;
  const before = snapshot(state, wallet);
  assert.equal(run({ kind: 'upgrade', weapon: 'staff' }).ok, false);
  assert.equal(snapshot(state, wallet), before);
  context.nearWorkbench = true;
  assert.equal(run({ kind: 'upgrade', weapon: 'staff' }).ok, true);
  assert.equal(wallet.coins, 492);
  assert.equal(wallet.inventory.ore, 18);
  assert.equal(wallet.inventory.wood, 19);
  assert.equal(upgradeBonuses(state, context.bodyId, 'staff').damageBonus, 2);
  assert.equal(upgradeBonuses(state, 'other:host', 'staff').rank, 0);
  assert.equal(upgradeBonuses(state, context.bodyId, 'sword').rank, 0);
  const locked = snapshot(state, wallet);
  assert.equal(run({ kind: 'upgrade', weapon: 'staff' }).ok, false);
  assert.equal(snapshot(state, wallet), locked);
  grantPractice(state, 'crafting', 250);
  assert.equal(run({ kind: 'upgrade', weapon: 'staff' }).ok, true);
  assert.equal(run({ kind: 'upgrade', weapon: 'staff' }).ok, true);
  const fullyImproved = snapshot(state, wallet);
  assert.equal(run({ kind: 'upgrade', weapon: 'staff' }).ok, false);
  assert.equal(snapshot(state, wallet), fullyImproved);
  const improved = upgradeBonuses(state, context.bodyId, 'staff');
  assert.equal(improved.rank, 3);
  assert.equal(improved.damageBonus, 6);
  assert(improved.rangeBonus > 0 && improved.cooldownMultiplier < 1);
});

test('home purchase validates location and funds before mutation and rejects duplicates', () => {
  const { state, wallet, context, run } = fixture();
  context.position.x = 20;
  const before = snapshot(state, wallet);
  assert.equal(run({ kind: 'buy-home', address }).ok, false);
  assert.equal(snapshot(state, wallet), before);
  context.position.x = 0;
  wallet.coins = 95;
  const poor = snapshot(state, wallet);
  assert.equal(run({ kind: 'buy-home', address }).ok, false);
  assert.equal(snapshot(state, wallet), poor);
  wallet.coins = 500;
  assert.equal(run({ kind: 'buy-home', address }).ok, true);
  assert.equal(wallet.coins, 404);
  assert.equal(state.homes[0].plots.length, 2);
  const owned = snapshot(state, wallet);
  assert.equal(run({ kind: 'buy-home', address }).ok, false);
  assert.equal(snapshot(state, wallet), owned);
});

test('furniture occupies real slots and changes rest, crafting and growing conditions', () => {
  const { state, context, run } = fixture();
  assert(run({ kind: 'buy-home', address }).ok);
  grantPractice(state, 'crafting', 110);
  for (const furnitureId of ['woven-cot', 'iron-stove', 'field-bench', 'raised-beds'])
    assert(run({ kind: 'furnish', homeId: address.id, furnitureId }).ok);
  const home = state.homes[0],
    effects = homeEffects(home);
  assert.equal(home.plots.length, 4);
  assert.equal(Object.keys(home.furniture).length, 4);
  assert.equal(effects.healthRestBonus, 8);
  assert.equal(effects.warmthRestBonus, 15);
  assert.equal(effects.hasWorkbench, true);
  assert.equal(effects.growthMultiplier, 1);
  context.position.x = 100;
  assert.equal(run({ kind: 'furnish', homeId: address.id, furnitureId: 'clinic-bed' }).ok, false);
  assert.equal(home.furniture.rest, 'woven-cot');
  assert.equal(new Set(FURNITURE.map((item) => item.slot)).size, 4);
});

test('crops require cuttings and lived time, survive save and harvest exactly once', () => {
  const { state, wallet, context, run } = fixture();
  assert(run({ kind: 'buy-home', address }).ok);
  assert(run({ kind: 'plant', homeId: address.id, plot: 0, plant: 'cequin' }).ok);
  assert.equal(wallet.inventory.cequin, 3);
  const crop = state.homes[0].plots[0]!;
  assert.equal(crop.readyAt, 160);
  assert.equal(gardenStatus(state.homes[0], 100)[0].stage, 'seedling');
  assert.equal(gardenStatus(state.homes[0], 140)[0].stage, 'growing');
  assert.equal(gardenStatus(state.homes[0], 160)[0].stage, 'ready');
  const planted = snapshot(state, wallet);
  assert.equal(run({ kind: 'plant', homeId: address.id, plot: 0, plant: 'heartleaf' }).ok, false);
  assert.equal(run({ kind: 'harvest', homeId: address.id, plot: 0 }).ok, false);
  assert.equal(snapshot(state, wallet), planted);
  const restored = restoreProgression(JSON.parse(JSON.stringify(state)), 734);
  assert.deepEqual(restored.homes[0].plots[0], crop);
  context.time = crop.readyAt;
  const amount = wallet.inventory.cequin!;
  assert.equal(
    applyProgression(restored, wallet, { kind: 'harvest', homeId: address.id, plot: 0 }, context)
      .ok,
    true,
  );
  assert.equal(wallet.inventory.cequin, amount + crop.yield);
  const harvested = snapshot(restored, wallet);
  assert.equal(
    applyProgression(restored, wallet, { kind: 'harvest', homeId: address.id, plot: 0 }, context)
      .ok,
    false,
  );
  assert.equal(snapshot(restored, wallet), harvested);
});

test('a full pack cannot consume a mature crop, and freeing space permits its complete yield', () => {
  const { state, wallet, context, run } = fixture();
  assert(run({ kind: 'buy-home', address }).ok);
  assert(run({ kind: 'plant', homeId: address.id, plot: 0, plant: 'heartleaf' }).ok);
  const crop = state.homes[0].plots[0]!;
  context.time = crop.readyAt;
  context.capacity = Object.values(wallet.inventory).reduce((n, value) => n + value!, 0);
  const full = snapshot(state, wallet);
  assert.equal(run({ kind: 'harvest', homeId: address.id, plot: 0 }).ok, false);
  assert.equal(snapshot(state, wallet), full);
  wallet.inventory.wood! -= crop.yield;
  assert(run({ kind: 'harvest', homeId: address.id, plot: 0 }).ok);
  assert.equal(state.homes[0].plots[0], null);
  assert.equal(
    Object.values(wallet.inventory).reduce((n, value) => n + value!, 0),
    context.capacity,
  );
});

test('sheltered growing conditions causally shorten the same crop and increase its yield', () => {
  const ordinary = fixture(),
    sheltered = fixture();
  for (const f of [ordinary, sheltered]) {
    assert(f.run({ kind: 'buy-home', address }).ok);
    grantPractice(f.state, 'crafting', 110);
  }
  assert(sheltered.run({ kind: 'furnish', homeId: address.id, furnitureId: 'glass-planters' }).ok);
  for (const f of [ordinary, sheltered])
    assert(f.run({ kind: 'plant', homeId: address.id, plot: 0, plant: 'emberroot' }).ok);
  const a = ordinary.state.homes[0].plots[0]!,
    b = sheltered.state.homes[0].plots[0]!;
  assert.equal(a.seed, b.seed);
  assert.equal(b.readyAt - b.plantedAt, (a.readyAt - a.plantedAt) * 0.75);
  assert.equal(b.yield, a.yield + 1);
});

test('preview never spends coins, supplies, XP, crops or ownership', () => {
  const { state, wallet, context, run } = fixture();
  const initial = snapshot(state, wallet);
  const action: ProgressionAction = { kind: 'buy-home', address };
  const first = previewProgression(state, wallet, action, context);
  assert(first.ok);
  assert.deepEqual(previewProgression(state, wallet, action, context), first);
  assert.equal(snapshot(state, wallet), initial);
  assert(run(action).ok);
  const own = snapshot(state, wallet);
  assert(
    previewProgression(
      state,
      wallet,
      { kind: 'plant', homeId: address.id, plot: 0, plant: 'cequin' },
      context,
    ).ok,
  );
  assert.equal(snapshot(state, wallet), own);
});

test('earned clothing uses coins and changes only visual clothing fields per body', () => {
  const { state, wallet, context, run } = fixture();
  const style = COSMETICS.find((item) => item.id === 'field-botanist')!;
  assert.equal(COSMETICS.filter((item) => item.currency === 'coins').length, 6);
  assert.equal(run({ kind: 'equip-style', styleId: style.id }).ok, false);
  assert(run({ kind: 'buy-style', styleId: style.id }).ok);
  assert.equal(wallet.coins, 476);
  assert(run({ kind: 'equip-style', styleId: style.id }).ok);
  const dressed = applyCosmetic(look, state, context.bodyId);
  assert.equal(dressed.coat, style.coat);
  for (const key of ['seed', 'skin', 'hair', 'height', 'build', 'hairStyle', 'weapon'] as const)
    assert.equal(dressed[key], look[key]);
  assert.deepEqual(applyCosmetic(look, state, 'other:host'), look);
  assert.notEqual(dressed, look);
  const before = snapshot(state, wallet);
  assert.equal(run({ kind: 'buy-style', styleId: style.id }).ok, false);
  assert.equal(snapshot(state, wallet), before);
  assert(run({ kind: 'equip-style', styleId: null }).ok);
  assert.deepEqual(applyCosmetic(look, state, context.bodyId), look);
});

test('premium styles cannot be bought with coins or forged through local save ownership', () => {
  const { state, wallet, context, run } = fixture();
  const premium = COSMETICS.filter((item) => item.currency === 'premium');
  assert.deepEqual(
    premium.map((style) => style.id),
    ['aurora-mantle', 'promethean-gold', 'sallas-silver'],
  );
  assert(premium.every((style) => style.price === null));
  for (const style of premium) {
    const before = snapshot(state, wallet);
    assert.equal(run({ kind: 'buy-style', styleId: style.id }).ok, false);
    assert.equal(run({ kind: 'equip-style', styleId: style.id }).ok, false);
    assert.equal(snapshot(state, wallet), before);
  }
  state.ownedStyles.push('aurora-mantle');
  state.equippedStyles[context.bodyId] = 'aurora-mantle';
  assert.equal(ownsCosmetic(state, 'aurora-mantle'), false);
  const restored = restoreProgression(JSON.parse(JSON.stringify(state)), 734);
  assert.equal(restored.ownedStyles.includes('aurora-mantle'), false);
  assert.deepEqual(applyCosmetic(look, restored, context.bodyId), look);
  assert.equal(
    applyCosmetic(look, restored, context.bodyId, ['aurora-mantle']).coat,
    premium[0].coat,
  );
  context.verifiedEntitlements = ['sallas-silver'];
  assert(run({ kind: 'equip-style', styleId: 'sallas-silver' }).ok);
  assert.deepEqual(
    applyCosmetic(look, state, context.bodyId),
    look,
    'A saved selection is not an entitlement',
  );
});

test('restore bounds malformed data and refuses ownership from a different world seed', () => {
  const raw = JSON.parse(
    '{"version":1,"seed":734,"xp":{"botany":-2,"combat":999999999},"upgrades":{"__proto__":{"staff":3},"priest:734":{"staff":999}},"homes":[],"ownedStyles":["unknown","field-botanist","field-botanist","sallas-silver"],"equippedStyles":{"__proto__":"field-botanist"}}',
  );
  const restored = restoreProgression(raw, 734);
  assert.equal(restored.xp.botany, 0);
  assert.equal(restored.xp.combat, 1000000);
  assert.equal(restored.upgrades['priest:734'].staff, 3);
  assert.equal(Object.hasOwn(restored.upgrades, '__proto__'), false);
  assert.equal(Object.hasOwn(restored.equippedStyles, '__proto__'), false);
  assert.deepEqual(restored.ownedStyles, ['field-botanist']);
  assert.deepEqual(restoreProgression(raw, 999), createProgression(999));
  assert.deepEqual(restoreProgression(null, 734), createProgression(734));
});
