import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PropertyWorld,
  ESTATE_RECIPES,
  PROPERTY_RULES,
  estateWorkerProfile,
  propertyPrice,
  validPropertySave,
  type PropertyAdapters,
  type PropertyCommand,
  type PropertyOffer,
  type PropertyPerson,
} from '../src/stichos/property-world.ts';
import { FieldEconomy, type FieldBundle } from '../src/stichos/field-loot.ts';
import type { ActorAddress } from '../src/stichos/actor-ledger.ts';
import { HierarchicalNavigator } from '../src/stichos/navigation.ts';

const at = (x: number, y: number): ActorAddress => ({ spaceId: 'surface', x, y });
const blank = (): FieldBundle => ({ coins: 0, items: {} });
function setup() {
  const bank = new FieldEconomy(77);
  bank.ensure('alice');
  bank.ensure('bob');
  assert.equal(
    bank.transact(
      'alice',
      blank(),
      {
        coins: 10000,
        items: {
          wood: 80,
          stone: 50,
          fiber: 60,
          resin: 40,
          bone: 20,
          planks: 30,
          spear: 5,
          bandage: 8,
        },
      },
      'fixture-stock',
    ).ok,
    true,
  );
  const offers = new Map<string, PropertyOffer>([
    [
      'house',
      {
        id: 'house',
        name: 'Alder Steps',
        kind: 'home',
        seed: 44,
        settlementId: 'town:1:1',
        ...at(3, 3),
        bounds: { x: 0, y: 0, width: 12, height: 12 },
        entrance: at(1, 1),
        vacant: true,
        rentable: true,
      },
    ],
    [
      'plot',
      {
        id: 'plot',
        name: 'Willow Yard',
        kind: 'plot',
        seed: 47,
        settlementId: 'town:1:1',
        ...at(18, 3),
        bounds: { x: 15, y: 0, width: 12, height: 12 },
        entrance: at(16, 1),
        vacant: true,
        rentable: true,
      },
    ],
  ]);
  const peers = new Map([
      ['alice', at(1, 1)],
      ['bob', at(1, 1)],
    ]),
    people = new Map<string, PropertyPerson>();
  for (let n = 0; n < 12; n++)
    people.set(`person:${n}`, {
      id: `person:${n}`,
      name: `Marin ${n}`,
      seed: n,
      role: n % 2 ? 'engineer' : 'merchant',
      alive: true,
      employable: true,
      ...at(1, 1),
      home: at(0, 1),
    });
  const destinations = new Map<string, ActorAddress>();
  let forbidden = false,
    road = false,
    solid = false,
    customerCount = 3,
    legacy: string | undefined;
  const adapters: PropertyAdapters = {
    offer: (id) => offers.get(id),
    person: (id) => people.get(id),
    peer: (id) => peers.get(id),
    cell: (p) => ({ solid, road, terrain: 'grass' }),
    travel: (id, to) => {
      destinations.set(id, { ...to });
      return 'arrived';
    },
    legacyHome: () => legacy,
    permission: () => ({ ok: !forbidden, reason: 'Local guild refuses this agreement.' }),
    customers: () => customerCount,
    transact: (...args) => bank.transact(...args),
  };
  const world = new PropertyWorld(77, adapters);
  let serial = 0;
  const run = (c: PropertyCommand, now = 0, peer = 'alice', id = `cmd-${++serial}`) =>
    world.command(peer, c, id, now);
  const own = (id = 'house') => {
    peers.set('alice', { ...offers.get(id)!.entrance });
    return run({ kind: 'acquire', propertyId: id, mode: 'buy' });
  };
  const moveWorkers = () => {
    for (const [id, to] of destinations) {
      Object.assign(people.get(id)!, to);
    }
    destinations.clear();
  };
  const build = (
    kind: 'sawmill' | 'carpentry' | 'store' | 'garden' | 'apothecary',
    x = 4,
    y = 4,
    propertyId = 'house',
  ) => run({ kind: 'build', propertyId, station: kind, at: at(x, y) });
  const employee = (
    kind: 'sawmill' | 'carpentry' | 'store' | 'garden' | 'apothecary' = 'sawmill',
  ) => {
    const made = build(kind);
    assert.equal(made.ok, true, made.message);
    const person = [...people.values()].find((p) => !estateWorkerProfile(p).nightShift)!;
    assert.equal(run({ kind: 'hire', propertyId: 'house', npcId: person.id }).ok, true);
    assert.equal(
      run({ kind: 'assign', propertyId: 'house', npcId: person.id, stationId: made.stationId! }).ok,
      true,
    );
    return { station: made.stationId!, person };
  };
  return {
    world,
    bank,
    run,
    own,
    offers,
    peers,
    people,
    adapters,
    destinations,
    moveWorkers,
    build,
    employee,
    setForbidden: (v: boolean) => (forbidden = v),
    setRoad: (v: boolean) => (road = v),
    setSolid: (v: boolean) => (solid = v),
    setCustomers: (v: number) => (customerCount = v),
    setLegacy: (v: string | undefined) => (legacy = v),
  };
}

test('offers and workers are seed-derived; acquisition is actual, local, exclusive, atomic and replay safe', () => {
  const f = setup();
  const offer = f.offers.get('house')!;
  assert.deepEqual(propertyPrice(offer), propertyPrice({ ...offer }));
  assert.deepEqual(
    estateWorkerProfile(f.people.get('person:2')!),
    estateWorkerProfile(f.people.get('person:2')!),
  );
  f.peers.set('alice', at(100, 100));
  assert.equal(f.run({ kind: 'acquire', propertyId: 'house', mode: 'buy' }).ok, false);
  f.peers.set('alice', at(1, 1));
  f.setForbidden(true);
  assert.equal(f.own().ok, false);
  f.setForbidden(false);
  const before = f.bank.satchel('alice')!.coins;
  const c = { kind: 'acquire', propertyId: 'house', mode: 'buy' } as const;
  assert.equal(f.run(c, 0, 'alice', 'same').ok, true);
  assert.equal(f.bank.satchel('alice')!.coins, before - propertyPrice(offer).buy);
  assert.equal(f.run(c, 0, 'alice', 'same').ok, false);
  assert.equal(f.run(c, 0, 'bob').ok, false);
  assert.equal(f.world.save().estates.length, 1);
});

test('legacy home adoption needs authority proof and never imports personal goods', () => {
  const f = setup();
  const c = { kind: 'acquire', propertyId: 'house', mode: 'legacy-home' } as const;
  assert.equal(f.run(c).ok, false);
  f.setLegacy('house');
  f.offers.get('house')!.vacant = false;
  const before = f.bank.satchel('alice')!;
  assert.equal(f.run(c).ok, true);
  assert.deepEqual(f.bank.satchel('alice'), before);
  assert.deepEqual(f.world.getEstate('house')!.storage, blank());
  assert.equal(f.world.getEstate('house')!.furnishings, 1);
});

test('placement respects footprint, parcel, roads, entrance, solid terrain and local permission before charging', () => {
  const f = setup();
  assert.equal(f.own().ok, true);
  const coins = f.bank.satchel('alice')!.coins;
  assert.equal(f.build('sawmill', 11, 4).ok, false);
  assert.equal(f.build('sawmill', 1, 1).ok, false);
  f.setRoad(true);
  assert.equal(f.build('sawmill').ok, false);
  f.setRoad(false);
  f.setSolid(true);
  assert.equal(f.build('sawmill').ok, false);
  f.setSolid(false);
  f.setForbidden(true);
  assert.equal(f.build('sawmill').ok, false);
  f.setForbidden(false);
  assert.equal(f.build('garden').ok, false);
  assert.equal(f.bank.satchel('alice')!.coins, coins);
  assert.equal(f.build('sawmill').ok, true);
  assert.equal(f.build('carpentry').ok, false);
  assert.equal(f.own('plot').ok, true);
  assert.equal(f.build('garden', 19, 4, 'plot').ok, true);
});

test('storage is owner-only, capacity checked and cannot duplicate an atomic transaction', () => {
  const f = setup();
  f.own();
  const c = {
    kind: 'deposit',
    propertyId: 'house',
    bundle: { coins: 7, items: { wood: 6 } },
  } as const;
  const before = f.bank.satchel('alice')!;
  assert.equal(f.run(c, 0, 'alice', 'deposit').ok, true);
  assert.equal(f.run(c, 0, 'alice', 'deposit').ok, false);
  assert.equal(f.world.getEstate('house')!.storage.items.wood, 6);
  assert.equal(f.bank.satchel('alice')!.items.wood, before.items.wood! - 6);
  assert.equal(
    f.run({ kind: 'withdraw', propertyId: 'house', bundle: { coins: 0, items: { wood: 7 } } }).ok,
    false,
  );
  assert.equal(
    f.run(
      { kind: 'withdraw', propertyId: 'house', bundle: { coins: 0, items: { wood: 1 } } },
      0,
      'bob',
    ).ok,
    false,
  );
  assert.equal(
    f.run({ kind: 'withdraw', propertyId: 'house', bundle: { coins: 7, items: { wood: 6 } } }).ok,
    true,
  );
  assert.deepEqual(f.world.getEstate('house')!.storage, blank());
});

test('one worker carries actual supplies, works at the station and delivers before rewards exist', () => {
  const f = setup();
  f.own();
  const { station, person } = f.employee();
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 6 } } });
  assert.equal(
    f.run({
      kind: 'queue',
      propertyId: 'house',
      stationId: station,
      recipe: 'saw-boards',
      batches: 2,
    }).ok,
    true,
  );
  const coins = f.bank.satchel('alice')!.coins;
  f.world.tick(1, 0.5);
  assert.equal(f.world.save().workers[0].phase, 'carrying-input');
  assert.equal(f.world.getEstate('house')!.storage.items.planks, undefined);
  // A dishonest travel adapter returning arrived cannot create a real arrival.
  for (let t = 2; t < 100; t++) f.world.tick(t, 0.5);
  assert.equal(f.world.getEstate('house')!.stations[0].job!.elapsed, 0);
  assert.equal(f.bank.satchel('alice')!.coins, coins - 1);
  f.moveWorkers();
  assert.notDeepEqual({ x: person.x, y: person.y }, { x: 1, y: 1 });
  for (let t = 100; t < 132; t++) f.world.tick(t, 0.5);
  assert.equal(f.world.save().workers[0].phase, 'carrying-output');
  assert.equal(f.world.getEstate('house')!.storage.items.planks, undefined);
  f.moveWorkers();
  f.world.tick(133, 0.5);
  assert.equal(f.world.getEstate('house')!.storage.items.planks, 2);
  assert.equal(f.world.getEstate('house')!.stations[0].produced, 1);
  assert.equal(
    f.world.drainEvents().some((e) => e.kind === 'production-delivered'),
    true,
  );
});

test('schedules, unpaid wages, catch-up bounds and missing actors halt actual production without deleting identity', () => {
  const f = setup();
  f.own();
  const { station, person } = f.employee();
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 3 } } });
  f.run({
    kind: 'queue',
    propertyId: 'house',
    stationId: station,
    recipe: 'saw-boards',
    batches: 1,
  });
  const balance = f.bank.satchel('alice')!.coins;
  assert.equal(
    f.bank.transact('alice', { coins: balance, items: {} }, blank(), 'empty-wages').ok,
    true,
  );
  f.world.tick(1, 0.5);
  assert.match(f.world.save().workers[0].status, /Wages missing/);
  f.world.tick(80, 0.5);
  assert.ok(f.world.save().workers[0].loyalty < estateWorkerProfile(person).loyalty);
  f.bank.transact('alice', blank(), { coins: 10, items: {} }, 'pay-wages');
  f.world.tick(81, 0.5);
  f.moveWorkers();
  f.world.tick(100000, 0.5);
  assert.ok(f.world.getEstate('house')!.stations[0].job!.elapsed <= 2.8);
  assert.ok(f.world.diagnostics.skippedSeconds > 99000);
  const elapsed = f.world.getEstate('house')!.stations[0].job!.elapsed;
  f.world.tick(100001, 0.9);
  assert.match(f.world.save().workers[0].status, /Off shift/);
  assert.equal(f.world.getEstate('house')!.stations[0].job!.elapsed, elapsed);
  person.alive = false;
  f.world.tick(100002, 0.5);
  assert.match(f.world.save().workers[0].status, /missing or injured/);
  assert.equal(f.world.save().workers[0].id, person.id);
});

test('physical chain supports sawmill, carpentry, finite staffed trade and truthful customer shortages', () => {
  const f = setup();
  f.own();
  const { station } = f.employee('store');
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { spear: 2 } } });
  assert.equal(
    f.run({
      kind: 'queue',
      propertyId: 'house',
      stationId: station,
      recipe: 'sell-spears',
      batches: 2,
    }).ok,
    true,
  );
  f.setCustomers(0);
  f.world.tick(1, 0.5);
  assert.match(f.world.save().workers[0].status, /customers/);
  f.setCustomers(1);
  for (let t = 2; t < 110; t++) {
    f.world.tick(t, 0.5);
    f.moveWorkers();
  }
  const e = f.world.getEstate('house')!;
  assert.equal(e.storage.coins, 28);
  assert.equal(e.dailySales, 1);
  assert.equal(e.stations[0].job!.remaining, 1);
  assert.match(f.world.save().workers[0].status, /customers/);
  assert.deepEqual(ESTATE_RECIPES.find((r) => r.id === 'carve-spear')!.inputs, {
    planks: 2,
    bone: 2,
    resin: 1,
  });
});

test('leases preserve belongings; access, guest keys, rest and demolition confirmations have visible consequences', () => {
  const f = setup();
  assert.equal(f.run({ kind: 'acquire', propertyId: 'house', mode: 'rent' }).ok, true);
  assert.equal(f.world.access('bob', 'house', 1).allowed, false);
  f.run({ kind: 'guest', propertyId: 'house', guestId: 'bob', allow: true });
  assert.equal(f.world.access('bob', 'house', 1).allowed, true);
  f.run({ kind: 'guest', propertyId: 'house', guestId: 'bob', allow: false });
  assert.equal(f.world.access('bob', 'house', 1).allowed, false);
  f.run({ kind: 'furnish', propertyId: 'house' });
  assert.equal(f.run({ kind: 'rest', propertyId: 'house' }, 1).ok, true);
  assert.equal(f.run({ kind: 'rest', propertyId: 'house' }, 2).ok, false);
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 3 } } });
  assert.equal(f.world.homeTarget('alice', PROPERTY_RULES.leaseSeconds + 1), undefined);
  assert.equal(f.world.access('alice', 'house', PROPERTY_RULES.leaseSeconds + 1).allowed, false);
  assert.equal(f.world.getEstate('house')!.storage.items.wood, 3);
  assert.equal(
    f.run({ kind: 'renew', propertyId: 'house' }, PROPERTY_RULES.leaseSeconds + 1).ok,
    true,
  );
  const made = f.build('sawmill'),
    e = f.world.getEstate('house')!;
  assert.equal(
    f.run({
      kind: 'demolish',
      propertyId: 'house',
      stationId: made.stationId!,
      confirmRevision: e.revision - 1,
    }).ok,
    false,
  );
  assert.equal(
    f.run({
      kind: 'demolish',
      propertyId: 'house',
      stationId: made.stationId!,
      confirmRevision: e.revision,
    }).ok,
    true,
  );
  assert.equal(f.world.getEstate('house')!.storage.items.wood, 5);
});

test('versioned save restores in-flight cargo and rejects duplicate identities, foreign ownership and transient payloads', () => {
  const f = setup();
  f.own();
  const { station } = f.employee();
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 3 } } });
  f.run({
    kind: 'queue',
    propertyId: 'house',
    stationId: station,
    recipe: 'saw-boards',
    batches: 1,
  });
  f.world.tick(1, 0.5);
  const saved = f.world.save();
  assert.equal(validPropertySave(saved), true);
  assert.deepEqual(new PropertyWorld(77, f.adapters, saved).save(), saved);
  const mutated = structuredClone(saved);
  mutated.workers.push(structuredClone(mutated.workers[0]));
  assert.equal(validPropertySave(mutated), false);
  const foreign = structuredClone(saved);
  foreign.workers[0].ownerId = 'bob';
  assert.equal(validPropertySave(foreign), false);
  assert.equal(validPropertySave({ ...saved, audio: [1, 2, 3] }), false);
  assert.throws(() => new PropertyWorld(78, f.adapters, saved), /Invalid/);
});

test('unassignment retains the person and cancellation returns only unworked reserved inputs', () => {
  const f = setup();
  f.own();
  const { station, person } = f.employee();
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 6 } } });
  f.run({
    kind: 'queue',
    propertyId: 'house',
    stationId: station,
    recipe: 'saw-boards',
    batches: 2,
  });
  assert.equal(f.run({ kind: 'unassign', propertyId: 'house', npcId: person.id }).ok, true);
  assert.equal(f.world.save().workers.length, 1);
  assert.equal(f.run({ kind: 'cancel-job', propertyId: 'house', stationId: station }).ok, true);
  assert.equal(f.world.getEstate('house')!.storage.items.wood, 6);
  const e = f.world.getEstate('house')!;
  assert.equal(
    f.run({
      kind: 'demolish',
      propertyId: 'house',
      stationId: station,
      confirmRevision: e.revision,
    }).ok,
    true,
  );
  assert.equal(validPropertySave(f.world.save()), true);
});

test('tampered reserved stock, cargo, orphan assignments and nested transient data are rejected', () => {
  const f = setup();
  f.own();
  const { station } = f.employee();
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 3 } } });
  f.run({
    kind: 'queue',
    propertyId: 'house',
    stationId: station,
    recipe: 'saw-boards',
    batches: 1,
  });
  f.world.tick(1, 0.5);
  const original = f.world.save();
  const stock = structuredClone(original);
  stock.estates[0].stations[0].job!.reserved.wood = 99;
  assert.equal(validPropertySave(stock), false);
  const cargo = structuredClone(original);
  cargo.workers[0].cargo.items.wood = 9;
  assert.equal(validPropertySave(cargo), false);
  const orphan = structuredClone(original);
  delete orphan.workers[0].stationId;
  assert.equal(validPropertySave(orphan), false);
  const nested = structuredClone(original);
  Object.assign(nested.estates[0].offer.entrance, { audio: 'never persist' });
  assert.equal(validPropertySave(nested), false);
});

test('worker simulation is bounded and witnessed mistreatment changes loyalty locally', () => {
  const f = setup();
  f.own();
  const { person } = f.employee();
  const saved = f.world.save();
  delete saved.estates[0].stations[0].workerId;
  const original = saved.workers[0];
  saved.workers = Array.from({ length: 40 }, (_, i) => ({
    ...structuredClone(original),
    id: `hired:${i}`,
    stationId: undefined,
    phase: 'idle' as const,
  }));
  for (const w of saved.workers) f.people.set(w.id, { ...person, id: w.id, ...at(1, 1) });
  assert.equal(validPropertySave(saved), true);
  const world = new PropertyWorld(77, f.adapters, saved);
  world.tick(5, 0.5);
  assert.equal(world.diagnostics.workerSteps, PROPERTY_RULES.maxWorkerSteps);
  const before = world.save().workers[0].loyalty;
  world.react('alice', 'injured-worker', at(1, 1));
  assert.equal(world.save().workers[0].loyalty, before - 24);
  world.react('alice', 'protected-worker', at(900, 900));
  assert.equal(world.save().workers[0].loyalty, before - 24);
});

test('malformed blueprint cannot replace station identity and semantic events retain their intended kind', () => {
  const f = setup();
  f.own();
  const injected = {
    kind: 'build',
    propertyId: 'house',
    station: 'sawmill',
    at: { ...at(4, 4), id: 'forged-station', kind: 'store' },
  };
  assert.equal(f.world.command('alice', injected as PropertyCommand, 'malformed', 0).ok, false);
  const made = f.build('sawmill');
  assert.equal(made.ok, true);
  const event = f.world.drainEvents().find((e) => e.kind === 'construction-complete')!;
  assert.ok(event);
  assert.notEqual(event.id, made.stationId);
  assert.equal('job' in event, false);
});

test('boxed workstation repro is rejected before payment and existing approach routes remain usable', () => {
  const f = setup();
  f.own();
  for (const [x, y] of [
    [2, 4],
    [6, 4],
    [4, 3],
    [4, 5],
  ])
    assert.equal(f.build('sawmill', x, y).ok, true);
  const before = f.bank.satchel('alice')!;
  assert.equal(f.build('sawmill', 4, 4).ok, false);
  assert.deepEqual(f.bank.satchel('alice'), before);
  // The center can be built first, but enclosing its final side must be refused too.
  const g = setup();
  g.own();
  assert.equal(g.build('sawmill', 4, 4).ok, true);
  for (const [x, y] of [
    [2, 4],
    [6, 4],
    [4, 3],
  ])
    assert.equal(g.build('sawmill', x, y).ok, true);
  assert.equal(g.build('sawmill', 4, 5).ok, false);
  assert.equal(g.world.getEstate('house')!.stations.length, 4);
});

test('workstation approach needs connection to the entrance, not merely an adjacent empty tile', () => {
  const f = setup();
  f.own();
  const raw = f.adapters.cell;
  f.adapters.cell = (p) => ({ ...raw(p), solid: p.y === 3 });
  const before = f.bank.satchel('alice')!;
  assert.equal(f.build('sawmill', 4, 4).ok, false);
  assert.deepEqual(f.bank.satchel('alice'), before);
  assert.equal(f.world.getEstate('house')!.stations.length, 0);
});

test('station obstacle index restores, tracks demolition and grants hired workers entry without storage authority', () => {
  const f = setup();
  f.own();
  const { station, person } = f.employee();
  assert.equal(f.world.blocks(at(4, 4)), true);
  assert.equal(f.world.blocks(at(5, 4)), true);
  assert.equal(f.world.blocks(at(6, 4)), false);
  assert.deepEqual(f.world.stationObstacle(at(4, 4)), {
    estateId: 'house',
    stationId: station,
    kind: 'sawmill',
  });
  assert.equal(Object.isFrozen(f.world.stationObstacle(at(4, 4))), true);
  const restored = new PropertyWorld(77, f.adapters, f.world.save());
  assert.equal(restored.blocks(at(5, 4)), true);
  assert.equal(f.world.access(person.id, 'house', 1).allowed, true);
  f.peers.set(person.id, at(1, 1));
  assert.equal(
    f.run(
      { kind: 'withdraw', propertyId: 'house', bundle: { coins: 0, items: { wood: 1 } } },
      1,
      person.id,
    ).ok,
    false,
  );
  f.run({ kind: 'unassign', propertyId: 'house', npcId: person.id });
  f.run({
    kind: 'demolish',
    propertyId: 'house',
    stationId: station,
    confirmRevision: f.world.getEstate('house')!.revision,
  });
  assert.equal(f.world.blocks(at(4, 4)), false);
  assert.equal(f.world.blocks(at(5, 4)), false);
});

test('canonical station allocations cannot exceed or collide with the saved serial', () => {
  const f = setup();
  f.own();
  f.build('sawmill');
  const save = f.world.save();
  assert.equal(validPropertySave(save), true);
  const rewind = structuredClone(save);
  rewind.serial = 0;
  assert.equal(validPropertySave(rewind), false);
  assert.throws(() => new PropertyWorld(77, f.adapters, rewind), /Invalid property/);
  for (const id of [
    'estate-station:01',
    'estate-station:-1',
    'station:1',
    `estate-station:${save.serial + 1}`,
  ]) {
    const invalid = structuredClone(save);
    invalid.estates[0].stations[0].id = id;
    assert.equal(validPropertySave(invalid), false, id);
  }
  const fractional = structuredClone(save);
  fractional.estates[0].stations[0].x += 0.1;
  assert.equal(validPropertySave(fractional), false);
  const restored = new PropertyWorld(77, f.adapters, save);
  assert.equal(
    restored.command(
      'alice',
      { kind: 'build', propertyId: 'house', station: 'sawmill', at: at(8, 8) },
      'after-restore',
      1,
    ).ok,
    true,
  );
  assert.equal(validPropertySave(restored.save()), true);
  assert.equal(new Set(restored.save().estates[0].stations.map((s) => s.id)).size, 2);
});

test('named worker follows real cardinal paths around stations, halts for blocked access and resumes delivery', () => {
  const f = setup();
  f.own();
  const { station, person } = f.employee();
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 3 } } });
  f.run({
    kind: 'queue',
    propertyId: 'house',
    stationId: station,
    recipe: 'saw-boards',
    batches: 1,
  });
  let wall = false;
  const raw = f.adapters.cell;
  f.adapters.cell = (p) => ({ ...raw(p), solid: wall && p.y === 3 });
  const routes = new Map<string, { target: string; nav: HierarchicalNavigator; cursor: number }>(),
    visited: ActorAddress[] = [];
  f.adapters.travel = (id, to) => {
    const actor = f.people.get(id)!;
    const key = `${to.x},${to.y}`;
    if (!routes.has(id) || routes.get(id)!.target !== key) {
      const nav = new HierarchicalNavigator({
        cell: (x, y) =>
          f.world.blocks(at(x, y)) || f.adapters.cell(at(x, y)).solid
            ? { kind: 'blocked' }
            : { kind: 'open' },
      });
      nav.request(actor, to);
      routes.set(id, { target: key, nav, cursor: 0 });
    }
    return routes.get(id)!.nav.status === 'unreachable' ? 'unreachable' : 'traveling';
  };
  const advance = () => {
    for (const [id, j] of routes) {
      if (j.nav.status === 'planning') j.nav.step(512);
      if (j.nav.status !== 'ready') continue;
      const next = j.nav.route[j.cursor];
      if (!next) continue;
      if (f.world.blocks(at(next.x, next.y)) || f.adapters.cell(at(next.x, next.y)).solid) continue;
      const actor = f.people.get(id)!;
      assert.ok(Math.hypot(actor.x - next.x, actor.y - next.y) <= 1.01);
      actor.x = next.x;
      actor.y = next.y;
      j.cursor++;
      visited.push(at(next.x, next.y));
    }
  };
  f.world.tick(1, 0.5);
  assert.equal(f.world.save().workers[0].phase, 'carrying-input');
  wall = true;
  f.world.invalidateNavigation('house');
  f.world.tick(2, 0.5);
  assert.match(f.world.save().workers[0].status, /Unreachable/);
  assert.equal(f.world.getEstate('house')!.stations[0].job!.elapsed, 0);
  assert.equal(f.world.save().workers[0].cargo.items.wood, 3);
  wall = false;
  f.world.invalidateNavigation('house');
  for (let t = 3; t < 250 && f.world.getEstate('house')!.stations[0].job; t++) {
    f.world.tick(t, 0.5);
    advance();
    assert.equal(validPropertySave(f.world.save()), true);
  }
  assert.ok(visited.length >= 12);
  assert.ok(visited.every((p) => !f.world.blocks(p)));
  assert.equal(f.world.getEstate('house')!.stations[0].produced, 1);
  assert.equal(f.world.getEstate('house')!.storage.items.planks, 2);
  assert.equal(f.world.save().workers[0].id, person.id);
});

test('remembered worker refusal pauses in-flight work and reconciliation resumes without a second wage or duplicate delivery', () => {
  const f = setup();
  f.own();
  const { station, person } = f.employee();
  f.run({ kind: 'deposit', propertyId: 'house', bundle: { coins: 0, items: { wood: 3 } } });
  f.run({
    kind: 'queue',
    propertyId: 'house',
    stationId: station,
    recipe: 'saw-boards',
    batches: 1,
  });
  const initialCoins = f.bank.satchel('alice')!.coins;
  f.world.tick(1, 0.5);
  assert.equal(f.world.save().workers[0].phase, 'carrying-input');
  const reserved = structuredClone(f.world.getEstate('house')!.stations[0].job!),
    cargo = structuredClone(f.world.save().workers[0].cargo);
  const calls: { peer: string; action: string; target: string }[] = [];
  let refuses = true;
  f.adapters.permission = (peer, action, target) => {
    calls.push({ peer, action, target });
    return { ok: !refuses, reason: 'Mara remembers your attack on her neighbour.' };
  };
  f.moveWorkers();
  for (let t = 2; t < 42; t++) {
    f.world.tick(t, 0.5);
    assert.equal(validPropertySave(f.world.save()), true);
  }
  assert.ok(calls.length > 0);
  assert.ok(
    calls.every((c) => c.peer === 'alice' && c.action === 'hire' && c.target === person.id),
  );
  assert.match(f.world.save().workers[0].status, /Work paused: Mara remembers/);
  assert.deepEqual(f.world.save().workers[0].cargo, cargo);
  assert.deepEqual(f.world.getEstate('house')!.stations[0].job, reserved);
  assert.equal(f.bank.satchel('alice')!.coins, initialCoins - 1);
  refuses = false;
  for (let t = 42; t < 150 && f.world.getEstate('house')!.stations[0].job; t++) {
    f.world.tick(t, 0.5);
    f.moveWorkers();
  }
  assert.equal(f.world.getEstate('house')!.stations[0].produced, 1);
  assert.equal(f.world.getEstate('house')!.storage.items.planks, 2);
  assert.equal(f.bank.satchel('alice')!.coins, initialCoins - 1);
  assert.equal(f.world.save().workers[0].id, person.id);
});
