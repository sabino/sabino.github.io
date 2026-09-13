import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LivingSystems,
  validLivingSystemsFrame,
  validLivingSystemsSave,
  type SystemsPeer,
  type SystemsCommand,
} from '../src/stichos/living-systems.ts';
import { appearance, type InfiniteWorld } from '../src/stichos/world.ts';
import {
  estateWorkerProfile,
  PROPERTY_RULES,
  type PropertyOffer,
} from '../src/stichos/property-world.ts';
import { CIVIC_LIMITS } from '../src/stichos/civic-world.ts';
import type { Npc, Settlement } from '../src/stichos/types.ts';

// Coordinator fixture: flat original test terrain and authority-resolved parcel;
// production, bank, navigation, people, civic events and save code are real modules.
function fixture(count = 2) {
  const town = {
    id: 'review-town',
    seed: 17,
    name: 'Review Hamlet',
    clan: 1,
    kind: 'foundry',
    x: 0,
    y: 0,
    radius: 20,
  } as Settlement;
  const people: Npc[] = [];
  for (let i = 0; i < count; i++) {
    let seed = i + 1;
    while (
      estateWorkerProfile({
        id: `review-person:${i}`,
        name: 'Worker',
        seed,
        role: 'engineer',
        alive: true,
        employable: true,
        spaceId: 'surface',
        x: 1,
        y: 1,
        home: { spaceId: 'surface', x: 1, y: 1 },
      }).nightShift
    )
      seed++;
    people.push({
      id: `review-person:${i}`,
      seed,
      name: `Worker ${i}`,
      role: 'engineer',
      clan: 1,
      x: 1,
      y: 1,
      home: { x: 1, y: 1 },
      appearance: appearance(seed, 'engineer', 1),
      hp: 80,
      maxHp: 80,
      speed: 1.5,
      heading: 0,
      phase: 0,
      hostile: false,
      cooldown: 0,
    });
  }
  const world = {
    seed: 173,
    generation: 4,
    civilization: null,
    tile: (x: number, y: number) => ({
      x: Math.round(x),
      y: Math.round(y),
      terrain: 'grass',
      biome: 'forest',
      seed: 3,
    }),
    propsAround: () => [],
    npcsAround: () => people,
    settlementsAround: () => [town],
    blocked: () => false,
  } as unknown as InfiniteWorld;
  const systems = new LivingSystems(world, new Set(), {
    mode: 'shared',
    fauna: () => [],
    defeatFauna: () => {},
  });
  const peer: SystemsPeer = {
    id: 'review-owner',
    spaceId: 'surface',
    x: 1,
    y: 1,
    active: true,
    combatActive: true,
    weaponKind: 'sword',
    weaponSeed: 17,
  };
  systems.setPeers([peer], 1);
  systems.civic.factionsFor(town);
  const offer: PropertyOffer = {
    id: 'review-estate',
    name: 'Review Yard',
    kind: 'plot',
    seed: 17,
    settlementId: town.id,
    spaceId: 'surface',
    x: 3,
    y: 3,
    entrance: { spaceId: 'surface', x: 1, y: 1 },
    bounds: { x: 0, y: 0, width: 12, height: 12 },
    vacant: true,
    rentable: true,
  };
  (systems as unknown as { offers: Map<string, PropertyOffer> }).offers.set(offer.id, offer);
  for (const person of people)
    assert.equal(
      systems.actors.register(person, 'npc', 1, {
        home: { spaceId: 'surface', ...person.home },
        speed: person.speed,
      }),
      true,
    );
  assert.equal(
    systems.economy.transact(
      peer.id,
      { coins: 0, items: {} },
      { coins: 10000, items: { planks: 30, fiber: 30, spear: 2 } },
      'review-stock',
    ).ok,
    true,
  );
  let sequence = 0;
  const command = (command: SystemsCommand) =>
    systems.command(peer, command, `review:${++sequence}`);
  assert.equal(
    command({ kind: 'property', command: { kind: 'acquire', propertyId: offer.id, mode: 'buy' } })
      .ok,
    true,
  );
  return { systems, peer, people, offer, world, command };
}

test('all legitimately admitted workers remain in a valid bounded authoritative frame', () => {
  const { systems, people, offer, command, peer } = fixture(PROPERTY_RULES.maxWorkers);
  for (const p of people)
    assert.equal(
      command({ kind: 'property', command: { kind: 'hire', propertyId: offer.id, npcId: p.id } })
        .ok,
      true,
    );
  const frame = JSON.parse(JSON.stringify(systems.frame(peer)));
  assert.equal(frame.property.workers.length, PROPERTY_RULES.maxWorkers);
  assert.equal(validLivingSystemsSave(systems.save()), true);
  assert.equal(validLivingSystemsFrame(frame), true);
  assert.ok(Buffer.byteLength(JSON.stringify({ type: 'systems_frame', frame })) < 512 * 1024);
});

test('private restore enforces the same four-estate owner limit as live acquisition', () => {
  const { systems, world } = fixture();
  const snapshot = systems.save();
  const template = snapshot.property.estates[0];
  snapshot.property.estates = Array.from({ length: PROPERTY_RULES.maxOwned + 1 }, (_, i) => {
    const id = i ? `review-overowned:${i}` : template.id;
    return { ...structuredClone(template), id, offer: { ...structuredClone(template.offer), id } };
  });
  assert.equal(validLivingSystemsSave(snapshot), false);
  assert.throws(
    () =>
      new LivingSystems(
        world,
        new Set(),
        { mode: 'shared', fauna: () => [], defeatFauna: () => {} },
        snapshot,
      ),
    /Invalid living systems checkpoint/,
  );
  snapshot.property.estates.pop();
  assert.equal(validLivingSystemsSave(snapshot), true);
  snapshot.property.estates = Array.from({ length: PROPERTY_RULES.maxEstates }, (_, i) => {
    const id = `review-global:${i}`;
    return {
      ...structuredClone(template),
      id,
      ownerId: `review-global-owner:${i}`,
      offer: { ...structuredClone(template.offer), id },
    };
  });
  assert.equal(validLivingSystemsSave(snapshot), true);
  const extraId = 'review-global:extra';
  snapshot.property.estates.push({
    ...structuredClone(template),
    id: extraId,
    ownerId: 'review-global-owner:extra',
    offer: { ...structuredClone(template.offer), id: extraId },
  });
  assert.equal(validLivingSystemsSave(snapshot), false);
});

test('maximal worker and discovered-charter registers stay bounded without publishing private history', (t) => {
  const { systems, people, offer, command, peer, world } = fixture(PROPERTY_RULES.maxWorkers);
  for (const p of people)
    assert.equal(
      command({ kind: 'property', command: { kind: 'hire', propertyId: offer.id, npcId: p.id } })
        .ok,
      true,
    );
  for (const town of systems.civic.save().towns)
    for (const faction of systems.civic.factionsFor(town))
      systems.civic.discover(peer.id, faction.id);
  for (let n = 1; n < CIVIC_LIMITS.towns; n++) {
    const town = {
      id: `review-town:${n}`,
      seed: n,
      name: `Review Ward ${n}`,
      clan: 1,
      kind: 'village',
      x: n * 50,
      y: 0,
      radius: 20,
    } as Settlement;
    for (const faction of systems.civic.factionsFor(town))
      assert.equal(systems.civic.discover(peer.id, faction.id).ok, true);
  }
  const frame = JSON.parse(JSON.stringify(systems.frame(peer)));
  assert.equal(frame.memberships.length, CIVIC_LIMITS.towns * 3);
  assert.equal(frame.property.workers.length, PROPERTY_RULES.maxWorkers);
  assert.equal(
    frame.memberships.some((member: object) => 'remembered' in member),
    false,
  );
  assert.equal(validLivingSystemsSave(systems.save()), true);
  assert.equal(validLivingSystemsFrame(frame), true);
  const count = (v: unknown): number =>
    !v || typeof v !== 'object'
      ? 1
      : 1 + Object.values(v).reduce<number>((sum, entry) => sum + count(entry), 0);
  const bytes = Buffer.byteLength(JSON.stringify({ type: 'systems_frame', frame }));
  assert.ok(bytes < 512 * 1024);
  t.diagnostic(`96 workers, 384 charters: ${count(frame)} JSON nodes, ${bytes} wire bytes`);
  // A valid maximal property snapshot, with disjoint footprints, 4 owned estates,
  // 60 nearby public estates and 512 correctly reserved queued jobs. Snapshot
  // construction isolates presentation bounds from hundreds of unrelated inputs.
  const saved = systems.save(),
    template = saved.property.estates[0];
  let serial = saved.property.serial;
  saved.property.estates = Array.from({ length: PROPERTY_RULES.maxEstates }, (_, i) => {
    const x = -24 + (i % 8) * 6,
      y = -24 + Math.floor(i / 8) * 6;
    const id = i === 0 ? template.id : `review-capacity-estate:${i}`;
    return {
      ...structuredClone(template),
      id,
      ownerId: i < 4 ? peer.id : `review-neighbor:${Math.floor(i / 4)}`,
      offer: {
        ...structuredClone(template.offer),
        id,
        x: x + 3,
        y: y + 3,
        bounds: { x, y, width: 6, height: 6 },
        entrance: { spaceId: 'surface', x: x + 2, y: y + 2 },
      },
      stations: Array.from({ length: PROPERTY_RULES.maxStations }, (_, j) => ({
        id: `estate-station:${++serial}`,
        kind: 'sawmill' as const,
        spaceId: 'surface',
        x: x + (j % 2) * 3,
        y: y + [0, 1, 3, 4][Math.floor(j / 2)],
        produced: 0,
        workingSeconds: 0,
        status: 'Waiting for a funded worker and physical delivery. '.repeat(3),
        job: {
          id: ++serial,
          recipe: 'saw-boards',
          remaining: 20,
          completed: 0,
          elapsed: 0,
          reserved: { wood: 60 },
          wageFunded: false,
        },
      })),
    };
  });
  saved.property.serial = serial;
  assert.equal(
    validLivingSystemsSave(saved),
    true,
    'Stress state must satisfy actual private validators',
  );
  const dense = new LivingSystems(
    world,
    new Set(),
    { mode: 'shared', fauna: () => [], defeatFauna: () => {} },
    saved,
  );
  dense.setPeers([peer], saved.elapsed);
  const denseFrame = JSON.parse(JSON.stringify(dense.frame(peer)));
  assert.equal(denseFrame.property.estates.length, 64);
  assert.equal(
    denseFrame.property.estates.reduce(
      (sum: number, estate: { stations: unknown[] }) => sum + estate.stations.length,
      0,
    ),
    512,
  );
  assert.equal(validLivingSystemsFrame(denseFrame), true);
  const denseBytes = Buffer.byteLength(
    JSON.stringify({ type: 'systems_frame', frame: denseFrame }),
  );
  assert.ok(denseBytes < 512 * 1024);
  t.diagnostic(
    `Plus 64 estates / 512 queued stations: ${count(denseFrame)} JSON nodes, ${denseBytes} wire bytes`,
  );
  for (let i = 0; i < 64; i++)
    assert.equal(
      dense.economy.spawnDeath({
        actorId: `review-drop-source:${i}`,
        kind: 'enemy',
        role: 'warden',
        difficulty: 8,
        contributors: Array.from({ length: 32 }, (_, n) => `review-contributor:${n}`),
        time: dense.elapsed,
        spaceId: 'surface',
        x: 1,
        y: 1,
      }).ok,
      true,
    );
  const lootFrame = JSON.parse(JSON.stringify(dense.frame(peer)));
  assert.equal(lootFrame.economy.drops.length, 64);
  assert.equal(validLivingSystemsFrame(lootFrame), true);
  const lootBytes = Buffer.byteLength(JSON.stringify({ type: 'systems_frame', frame: lootFrame }));
  assert.ok(lootBytes < 512 * 1024);
  t.diagnostic(
    `Plus 64 drops / 32 contributors: ${count(lootFrame)} JSON nodes, ${lootBytes} wire bytes`,
  );
  // Complete all 16 admitted complexes in a strict snapshot: each unique cache,
  // secret and final core can leave an earned pending reward while the owner is
  // back on the surface. This is not a duplicated source or arbitrary wire grant.
  const plans = [];
  for (let complex = 0; complex < 16; complex++)
    for (let depth = 0; depth < 3; depth++)
      plans.push(dense.underworld.floor(complex ? `review-town:${complex}` : 'review-town', depth));
  const enter = dense.underworld.enter({ ...peer, heading: 0, active: true }, 'review-town', peer);
  assert.equal(enter.ok, true);
  const up = plans[0].features.find((f) => f.kind === 'up')!;
  assert.equal(
    dense.underworld.interact(
      { ...peer, ...enter.transition!.to, x: up.x, y: up.y, heading: 0, active: true },
      up.id,
      dense.elapsed,
      1,
    ).ok,
    true,
  );
  const all = dense.save();
  assert.ok(all.underworld);
  for (const floor of all.underworld.floors) {
    const plan = plans.find((p) => p.spaceId === floor.spaceId)!;
    for (const enemy of floor.enemies) {
      enemy.hp = 0;
      enemy.state = 'dead';
      enemy.remaining = 0;
    }
    for (const feature of plan.features.filter((f) =>
      ['cache', 'secret', 'core'].includes(f.kind),
    )) {
      floor.opened.push(feature.id);
      const bundle =
        feature.kind === 'core'
          ? { coins: 35, items: { relic: 1, knowledge: 3, crystal: 3 } }
          : feature.kind === 'secret'
            ? { coins: 8, items: { relic: 1 } }
            : feature.x === 26
              ? { coins: 0, items: { knowledge: 1 } }
              : { coins: 0, items: { scrap: 3 + plan.depth, ore: 2 + plan.depth } };
      all.underworld.rewards.push({
        id: `underworld:${all.seed}:${++all.underworld.serial}`,
        kind: 'reward',
        actorId: peer.id,
        sourceId: feature.id,
        bundle,
        spaceId: plan.spaceId,
        x: feature.x,
        y: feature.y,
      });
    }
  }
  assert.equal(all.underworld.rewards.length, 160);
  assert.equal(validLivingSystemsSave(all), true);
  const completed = new LivingSystems(
    world,
    new Set(),
    { mode: 'shared', fauna: () => [], defeatFauna: () => {} },
    all,
  );
  completed.setPeers([peer], all.elapsed);
  const finalFrame = JSON.parse(JSON.stringify(completed.frame(peer)));
  assert.equal(finalFrame.pendingSalvageCount, 160);
  assert.equal(finalFrame.pendingSalvage.length, 16);
  assert.equal(completed.underworld.pendingRewards(peer.id).length, 160);
  assert.equal(completed.save().underworld!.rewards.length, 160);
  const finalBytes = Buffer.byteLength(
    JSON.stringify({ type: 'systems_frame', frame: finalFrame }),
  );
  t.diagnostic(
    `Plus 160 unique pending caches: ${count(finalFrame)} JSON nodes, ${finalBytes} wire bytes`,
  );
  assert.equal(
    validLivingSystemsFrame(finalFrame),
    true,
    'Combined valid domain capacities must still produce an accepted presentation frame',
  );
  assert.ok(finalBytes < 512 * 1024);
});

test('an actual offline-owner shop delivery records durable civic history at its estate', () => {
  const { systems, people, offer, command, peer, world } = fixture();
  const built = command({
    kind: 'property',
    command: {
      kind: 'build',
      propertyId: offer.id,
      station: 'store',
      at: { spaceId: 'surface', x: 3, y: 1 },
    },
  });
  assert.equal(built.ok, true, built.message);
  const station = systems.property.getEstate(offer.id)!.stations[0];
  for (const commandData of [
    { kind: 'hire', propertyId: offer.id, npcId: people[0].id },
    { kind: 'assign', propertyId: offer.id, npcId: people[0].id, stationId: station.id },
    { kind: 'deposit', propertyId: offer.id, bundle: { coins: 0, items: { spear: 1 } } },
    {
      kind: 'queue',
      propertyId: offer.id,
      stationId: station.id,
      recipe: 'sell-spears',
      batches: 1,
    },
  ] as const) {
    const outcome = command({ kind: 'property', command: commandData });
    assert.equal(outcome.ok, true, outcome.message);
  }
  // Flush connected construction before the owner leaves; production remains real.
  systems.tick(1.25);
  systems.setPeers([], 1.5);
  for (let i = 1; i <= 900 && !systems.property.getEstate(offer.id)!.stations[0].produced; i++)
    systems.tick(1.5 + i * 0.25);
  const estate = systems.property.getEstate(offer.id)!;
  assert.equal(estate.stations[0].produced, 1, estate.stations[0].status);
  assert.equal(estate.storage.coins, 28);
  const events = systems.civic
    .save()
    .events.filter((e) => e.actorId === peer.id && e.kind === 'trade');
  assert.equal(events.length, 1, 'Disconnected ownership must not discard a completed sale');
  assert.deepEqual({ spaceId: events[0].spaceId, x: events[0].x, y: events[0].y }, offer.entrance);
  const saved = systems.save();
  assert.equal(validLivingSystemsSave(saved), true);
  const restored = new LivingSystems(
    world,
    new Set(),
    { mode: 'shared', fauna: () => [], defeatFauna: () => {} },
    saved,
  );
  assert.equal(
    restored.civic.save().events.filter((e) => e.actorId === peer.id && e.kind === 'trade').length,
    1,
  );
  assert.equal(restored.property.getEstate(offer.id)!.storage.coins, 28);
});

test('restored charter rank grants real workshop access and fee relief, revoked by departure or unpaid dues', () => {
  const { systems, peer, world, offer } = fixture();
  const faction = systems.civic
    .factionsFor(world.settlementsAround(0, 0, 10)[0])
    .find((f) => f.purpose === 'craft')!;
  assert.ok(faction);
  assert.equal(systems.civic.discover(peer.id, faction.id).ok, true);
  assert.equal(
    systems.civic.join(
      peer.id,
      faction.id,
      1,
      (cost, receipt) =>
        systems.economy.transact(peer.id, cost, { coins: 0, items: {} }, receipt).ok,
    ).ok,
    true,
  );
  const baseTile = world.tile.bind(world);
  world.tile = (x, y) =>
    x === 20 && y === 20
      ? {
          ...baseTile(x, y),
          terrain: 'floor',
          building: 'review-workshop',
          buildingKind: 'workshop',
        }
      : baseTile(x, y);
  const door = {
    id: 'review-workshop-door',
    kind: 'door' as const,
    seed: 3,
    x: 20,
    y: 20,
    building: 'review-workshop',
    name: 'Workshop',
    solid: false,
  };
  for (const rank of [1, 2]) {
    const snapshot = systems.save();
    Object.assign(snapshot.civic.members[0], {
      rank,
      standing: rank === 1 ? 5 : 18,
      completed: rank === 1 ? 1 : 3,
    });
    assert.equal(validLivingSystemsSave(snapshot), true);
    const restored = new LivingSystems(
      world,
      new Set(),
      { mode: 'shared', fauna: () => [], defeatFauna: () => {} },
      snapshot,
    );
    restored.setPeers([peer], 900); // 23:00: ordinary workshop hours are closed.
    assert.equal(restored.doorAccess(peer, door).allowed, true);
    const before = restored.economy.satchel(peer.id)!.coins;
    const built = restored.command(
      peer,
      {
        kind: 'property',
        command: {
          kind: 'build',
          propertyId: offer.id,
          station: 'store',
          at: { spaceId: 'surface', x: 3, y: 1 },
        },
      },
      `review:${restored.nextSequence(peer.id)}`,
    );
    assert.equal(built.ok, true, built.message);
    assert.equal(before - restored.economy.satchel(peer.id)!.coins, rank === 2 ? 9 : 10);
    assert.equal(restored.civic.leave(peer.id, faction.id, 900).ok, true);
    assert.equal(restored.doorAccess(peer, door).allowed, false);
    const unpaid = new LivingSystems(
      world,
      new Set(),
      { mode: 'shared', fauna: () => [], defeatFauna: () => {} },
      snapshot,
    );
    unpaid.setPeers([peer], 5220); // A later night, beyond the saved paid-through day.
    assert.equal(unpaid.doorAccess(peer, door).allowed, false);
  }
});
