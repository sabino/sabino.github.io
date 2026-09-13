import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LivingSystems,
  validLivingSystemsSave,
  validLivingSystemsFrame,
  validSystemsCommand,
  type SystemsPeer,
  type SystemsCommand,
  type LivingSystemsSave,
} from '../src/stichos/living-systems.ts';
import { appearance, type InfiniteWorld } from '../src/stichos/world.ts';
import { CivicWorld, validCivicSave } from '../src/stichos/civic-world.ts';
import { generateUnderworld } from '../src/stichos/underworld.ts';
import { FIELD_RULES } from '../src/stichos/field-loot.ts';
import type { Npc, Prop, Settlement, Tile } from '../src/stichos/types.ts';

const town: Settlement = {
  id: 'town:fixture',
  seed: 42,
  name: 'Amber Ward',
  clan: 1,
  kind: 'village',
  x: 0,
  y: 0,
  radius: 16,
};
function person(id: string, role: Npc['role'], x: number, y: number): Npc {
  return {
    id,
    role,
    seed: 42,
    name: id,
    clan: 1,
    x,
    y,
    home: { x, y },
    appearance: appearance(42, role, 1),
    hp: 80,
    maxHp: 80,
    speed: 1.3,
    heading: 0,
    phase: 0,
    hostile: false,
    cooldown: 0,
  };
}
function fixture(mode: 'solo' | 'shared' = 'solo', saved?: LivingSystemsSave) {
  const npcs = [
    person('herbalist', 'botanist', 1, 3),
    person('watch', 'guard', 2, 3),
    person('joiner', 'engineer', 6, 6),
  ];
  const props: Prop[] = [
    { id: 'notice:town', seed: 11, kind: 'notice', x: 0, y: 0, solid: false, name: 'Town board' },
    {
      id: 'a:north',
      seed: 31,
      kind: 'door',
      x: 6,
      y: 4,
      solid: false,
      name: 'North entrance',
      building: 'house:fixture',
    },
    {
      id: 'z:south',
      seed: 81,
      kind: 'door',
      x: 6,
      y: 8,
      solid: false,
      name: 'South entrance',
      building: 'house:fixture',
    },
  ];
  const tile = (xx: number, yy: number): Tile => {
    const x = Math.round(xx),
      y = Math.round(yy),
      building = x >= 4 && x <= 9 && y >= 4 && y <= 8;
    return {
      x,
      y,
      seed: 9,
      terrain: building
        ? x === 4 || x === 9 || y === 4 || y === 8
          ? props.some((p) => p.kind === 'door' && p.x === x && p.y === y)
            ? 'floor'
            : 'wall'
          : 'floor'
        : y === 0
          ? 'road'
          : 'grass',
      biome: 'forest',
      ...(building ? { building: 'house:fixture', buildingKind: 'house' as const } : {}),
    } as Tile;
  };
  const world = {
    seed: 42,
    generation: 4,
    civilization: null,
    tile,
    propsAround: (x: number, y: number, r: number) =>
      props.filter((p) => Math.hypot(p.x - x, p.y - y) <= r + 0.01),
    npcsAround: (x: number, y: number, r: number) =>
      npcs.filter((p) => Math.hypot(p.x - x, p.y - y) <= r + 0.01),
    settlementsAround: () => [town],
    blocked: (x: number, y: number) => ['water', 'wall'].includes(tile(x, y).terrain),
  } as unknown as InfiniteWorld;
  const wounds: unknown[] = [];
  const systems = new LivingSystems(
    world,
    new Set(),
    {
      mode,
      fauna: () => [],
      defeatFauna: () => {},
      woundFauna: (...args) => wounds.push(args),
      legacyHome: () => 'house:fixture',
    },
    saved,
  );
  const peer: SystemsPeer = {
    id: 'traveler',
    spaceId: 'surface',
    x: 0,
    y: 1,
    name: 'Traveler',
    active: true,
    combatActive: true,
    heading: 0,
    weaponSeed: 44,
    weaponKind: 'sword',
  };
  systems.setPeers([peer], 1);
  systems.tick(1);
  const cmd = (command: SystemsCommand) =>
    systems.command(peer, command, `test:${systems.nextSequence(peer.id)}`);
  return { systems, peer, world, cmd, wounds, npcs, props };
}
const wire = <T>(v: T) => JSON.parse(JSON.stringify(v));

test('canonical civic events strip session metadata and all snapshots remain strict', () => {
  const { systems, peer } = fixture();
  const outcome = systems.action(
    { ...peer, secret: 'must not persist' } as SystemsPeer,
    'aid',
    'aid:1',
    'herbalist',
  );
  assert.equal(outcome?.ok, true);
  const save = systems.save();
  assert.equal(validLivingSystemsSave(save), true);
  assert.equal(JSON.stringify(save.civic).includes('must not persist'), false);
  assert.equal(JSON.stringify(save.civic.events).includes('weaponKind'), false);
  const civic = new CivicWorld(42);
  civic.factionsFor(town);
  const result = civic.recordAction(
    {
      actorId: 'traveler',
      spaceId: 'surface',
      x: 1,
      y: 1,
      kind: 'aid',
      settlementId: town.id,
      at: 1,
      sourceId: 'extra',
      id: 'wrong',
      secret: true,
    } as never,
    [],
    () => true,
  );
  assert.equal(result.ok, true);
  assert.equal(validCivicSave(civic.save()), true);
});
test('home offers use a canonical door and its exterior regardless of viewing side; plots are real clear parcels', () => {
  const a = fixture(),
    b = fixture();
  Object.assign(a.peer, { x: 6, y: 3 });
  a.systems.setPeers([a.peer], 2);
  a.systems.tick(2);
  Object.assign(b.peer, { x: 6, y: 9 });
  b.systems.setPeers([b.peer], 2);
  b.systems.tick(2);
  const offerA = a.systems.frame(a.peer).offers.find((o) => o.id === 'house:fixture')!,
    offerB = b.systems.frame(b.peer).offers.find((o) => o.id === 'house:fixture')!;
  assert.deepEqual(offerA, offerB);
  assert.deepEqual(offerA.entrance, { spaceId: 'surface', x: 6, y: 3 });
  assert.equal(a.world.tile(offerA.entrance.x, offerA.entrance.y).building, undefined);
  assert.ok(a.systems.frame(a.peer).offers.some((o) => o.kind === 'plot'));
  assert.equal(a.systems.property.getEstate('house:fixture')?.ownerId, a.peer.id);
  const shared = fixture('shared');
  Object.assign(shared.peer, { x: 6, y: 3 });
  shared.systems.setPeers([shared.peer], 2);
  shared.systems.tick(2);
  assert.equal(shared.systems.property.getEstate('house:fixture'), undefined);
  assert.equal(
    shared.cmd({
      kind: 'property',
      command: { kind: 'acquire', propertyId: 'house:fixture', mode: 'legacy-home' },
    }).ok,
    false,
  );
});
test('menus allow economic actions but not attacks, and sequence replay cannot spend or act twice', () => {
  const { systems, peer } = fixture();
  peer.combatActive = false;
  systems.setPeers([peer], 2);
  const seq = systems.nextSequence(peer.id),
    event = `test:${seq}`;
  const first = systems.command(peer, { kind: 'craft', recipeId: 'hatchet' }, event);
  assert.equal(first.ok, true);
  assert.equal(systems.command(peer, { kind: 'craft', recipeId: 'hatchet' }, event).ok, false);
  assert.equal(systems.economy.satchel(peer.id)!.items.hatchet, 1);
  assert.equal(
    systems.command(
      peer,
      { kind: 'person-attack', targetId: 'herbalist', heading: 0 },
      `test:${systems.nextSequence(peer.id)}`,
    ).ok,
    false,
  );
  const restored = fixture('solo', systems.save());
  assert.ok(restored.systems.nextSequence(peer.id) > seq);
});
test('underworks entrance, compact frame and resident address survive save/reconnect; false entrances cannot transition', () => {
  const { systems, peer, cmd } = fixture();
  const entrance = systems.frame(peer).entrances[0];
  assert.ok(entrance);
  assert.equal(cmd({ kind: 'underworld-enter', settlementId: 'invented' }).ok, false);
  Object.assign(peer, entrance);
  systems.setPeers([peer], 2);
  const result = cmd({ kind: 'underworld-enter', settlementId: town.id });
  assert.equal(result.ok, true);
  assert.ok(result.transition);
  Object.assign(peer, result.transition!.to);
  const frame = systems.frame(peer);
  assert.ok(frame.underground);
  assert.equal('cells' in frame.underground!, false);
  assert.equal(validLivingSystemsFrame(wire(frame)), true);
  assert.equal(validLivingSystemsSave(systems.save()), true);
  const restored = fixture('solo', systems.save());
  assert.equal(restored.systems.location(peer.id)?.spaceId, peer.spaceId);
  assert.deepEqual(restored.systems.frame(restored.peer).location, frame.location);
});
test('expedition recall permits an authenticated fainted life, loses trusted coins once and returns the real entrance without healing', () => {
  const { systems, peer, cmd } = fixture();
  const entry = cmd({ kind: 'underworld-enter', settlementId: town.id });
  assert.equal(entry.ok, true);
  Object.assign(peer, entry.transition!.to, { active: false, combatActive: false });
  systems.setPeers([peer], 2);
  const event = `test:${systems.nextSequence(peer.id)}`;
  const recall = systems.command(peer, { kind: 'underworld-recover' }, event);
  assert.equal(recall.ok, true);
  assert.deepEqual(recall.transition?.to, { spaceId: 'surface', x: 0, y: 1 });
  assert.deepEqual(recall.recovery, { coinLoss: 5, cooldownUntil: 32 });
  assert.equal(recall.transition?.reason, 'recall');
  assert.equal('rest' in recall, false);
  assert.equal('events' in recall, false);
  assert.equal(systems.economy.satchel(peer.id)!.coins, 19);
  assert.equal(systems.command(peer, { kind: 'underworld-recover' }, event).ok, false);
  assert.equal(systems.economy.satchel(peer.id)!.coins, 19);
  const restored = fixture('solo', systems.save());
  assert.equal(restored.systems.frame(restored.peer).recall.cooldownUntil, 32);
  const reentry = restored.cmd({ kind: 'underworld-enter', settlementId: town.id });
  assert.equal(reentry.ok, true);
  Object.assign(restored.peer, reentry.transition!.to);
  assert.equal(restored.cmd({ kind: 'underworld-recover' }).ok, false);
  assert.equal(validLivingSystemsSave(restored.systems.save()), true);
});
test('recall cannot be trapped by a full reward ledger or empty purse and cannot mint a receipt reward', () => {
  const first = fixture();
  assert.equal(first.cmd({ kind: 'underworld-enter', settlementId: town.id }).ok, true);
  const saved = first.systems.save();
  saved.economy.receipts = Array.from({ length: FIELD_RULES.maxReceipts }, (_, i) => ({
    id: `transaction:old-${i}`,
    actorId: first.peer.id,
    kind: 'transaction' as const,
  }));
  const withCoins = fixture('solo', saved);
  assert.equal(withCoins.cmd({ kind: 'underworld-recover' }).ok, true);
  assert.equal(withCoins.systems.economy.satchel(first.peer.id)!.coins, 19);
  saved.economy.satchels[0].coins = 0;
  const poor = fixture('solo', saved),
    result = poor.cmd({ kind: 'underworld-recover' });
  assert.equal(result.ok, true);
  assert.equal(result.recovery?.coinLoss, 0);
  assert.equal(poor.systems.economy.satchel(first.peer.id)!.coins, 0);
  assert.equal(poor.systems.economy.save().receipts.length, FIELD_RULES.maxReceipts);
});
test('actual denied entry is remembered once, separately for re-entry, without inventing spawn/resume or owned-house crime', () => {
  const shared = fixture('shared');
  Object.assign(shared.peer, { x: 6, y: 3 });
  shared.systems.setPeers([shared.peer], 2);
  shared.systems.tick(2);
  Object.assign(shared.peer, { x: 6, y: 4 });
  shared.systems.setPeers([shared.peer], 2.1);
  shared.systems.tick(2.1);
  let offenses = shared.systems.save().civic.events.filter((e) => e.kind === 'trespass');
  assert.equal(offenses.length, 1);
  assert.ok(
    shared.systems.save().civic.knowledge.some((k) => k.eventId === offenses[0].id && k.identified),
  );
  Object.assign(shared.peer, { x: 6, y: 5 });
  shared.systems.setPeers([shared.peer], 2.2);
  shared.systems.tick(2.2);
  assert.equal(shared.systems.save().civic.events.filter((e) => e.kind === 'trespass').length, 1);
  const saved = shared.systems.save();
  assert.equal(validLivingSystemsSave(saved), true);
  const restored = fixture('shared', saved);
  Object.assign(restored.peer, { x: 6, y: 5 });
  restored.systems.setPeers([], 3);
  restored.systems.setPeers([restored.peer], 3);
  restored.systems.tick(3);
  assert.equal(restored.systems.save().civic.events.filter((e) => e.kind === 'trespass').length, 1);
  Object.assign(shared.peer, { x: 6, y: 3 });
  shared.systems.setPeers([shared.peer], 3);
  shared.systems.tick(3);
  Object.assign(shared.peer, { x: 6, y: 4 });
  shared.systems.setPeers([shared.peer], 3.1);
  shared.systems.tick(3.1);
  assert.equal(shared.systems.save().civic.events.filter((e) => e.kind === 'trespass').length, 2);
  const solo = fixture();
  Object.assign(solo.peer, { x: 6, y: 3 });
  solo.systems.setPeers([solo.peer], 2);
  solo.systems.tick(2);
  Object.assign(solo.peer, { x: 6, y: 4 });
  solo.systems.setPeers([solo.peer], 2.1);
  solo.systems.tick(2.1);
  assert.equal(solo.systems.save().civic.events.filter((e) => e.kind === 'trespass').length, 0);
});
test('trusted occupied household keys permit entry while opaque doors and unobserved trespass preserve individual knowledge', () => {
  const own = fixture('shared');
  Object.assign(own.peer, { x: 6, y: 3, occupiedBodyId: 'joiner' });
  own.systems.setPeers([own.peer], 2);
  own.systems.tick(2);
  assert.equal(own.systems.doorAccess(own.peer, own.props[1]).reason, 'key');
  Object.assign(own.peer, { x: 6, y: 4 });
  own.systems.setPeers([own.peer], 2.1);
  own.systems.tick(2.1);
  assert.equal(own.systems.save().civic.events.filter((e) => e.kind === 'trespass').length, 0);
  const blind = fixture('shared'),
    originalBlocked = blind.world.blocked.bind(blind.world);
  blind.world.blocked = (x, y, removed, doorsPassable) =>
    (!doorsPassable && Math.round(x) === 6 && Math.round(y) === 4) ||
    originalBlocked(x, y, removed, doorsPassable);
  assert.equal(
    blind.systems.sight({ spaceId: 'surface', x: 6, y: 3 }, { spaceId: 'surface', x: 6, y: 5 }),
    false,
  );
  for (const actor of blind.systems.actors.query(blind.peer, 30, 32))
    blind.systems.actors.update({ ...actor.body, x: 100, y: 100 }, 2, 'surface');
  Object.assign(blind.peer, { x: 6, y: 4 });
  blind.systems.setPeers([blind.peer], 1.1);
  blind.systems.tick(1.1);
  assert.equal(
    blind.systems.save().civic.events.filter((e) => e.kind === 'trespass').length,
    0,
    'blocked entrance is not an entry',
  );
  Object.assign(blind.peer, { x: 6, y: 5 });
  blind.systems.setPeers([blind.peer], 1.2);
  blind.systems.tick(1.2);
  const offense = blind.systems.save().civic.events.find((e) => e.kind === 'trespass')!;
  assert.ok(offense);
  assert.equal(
    blind.systems.save().civic.knowledge.some((k) => k.eventId === offense.id && k.identified),
    false,
  );
});
test('observer reactions use personal identified memory and command receipts omit bank metadata', () => {
  const { systems, peer, cmd } = fixture();
  const craft = cmd({ kind: 'craft', recipeId: 'hatchet' });
  assert.equal(craft.ok, true);
  assert.deepEqual(Object.keys(craft).sort(), ['message', 'ok']);
  systems.actors.update({ ...systems.actors.get('watch')!.body, x: 100, y: 100 }, 2, 'surface');
  for (let i = 0; i < 5; i++) systems.action(peer, 'assault', `remembered:${i}`, 'herbalist');
  systems.actors.update({ ...systems.actors.get('watch')!.body, x: 2, y: 3 }, 2, 'surface');
  const frame = systems.frame(peer),
    harmed = frame.reactions.find((r) => r.npcId === 'herbalist')!,
    stranger = frame.reactions.find((r) => r.npcId === 'watch')!;
  assert.equal(harmed.hostile || harmed.fear, true);
  assert.equal(stranger.hostile || stranger.fear, false);
  assert.equal(stranger.priceMultiplier, 1);
  assert.equal(validLivingSystemsFrame(wire(frame)), true);
  assert.equal(
    validLivingSystemsFrame({
      ...wire(frame),
      reactions: [{ ...harmed, priceMultiplier: Infinity }],
    }),
    false,
  );
});
test('signs expose real owned storage, actual permission and installed workbenches without inventing rest or trade', () => {
  const { systems, peer, props } = fixture();
  Object.assign(peer, { x: 6, y: 3 });
  systems.setPeers([peer], 2);
  systems.tick(2);
  const sign = systems.frame(peer).signs.find((s) => s.access?.reason === 'owner')!;
  assert.ok(sign);
  assert.ok(sign.lines.some((l) => l.key === 'sign.service.storage'));
  assert.equal(
    sign.lines.some((l) => l.key === 'sign.service.rest'),
    systems.property.getEstate('house:fixture')!.furnishings > 0,
  );
  assert.equal(
    sign.lines.some((l) => l.key === 'sign.service.trade'),
    false,
  );
  props.push({
    id: 'real-bench',
    kind: 'workbench',
    x: 7,
    y: 6,
    seed: 7,
    solid: false,
    name: 'Joiner bench',
    building: 'house:fixture',
  });
  assert.ok(
    systems
      .frame(peer)
      .signs.find((s) => s.id === sign.id)!
      .lines.some((l) => l.key === 'sign.service.workbench'),
  );
});
test('underground audio cues and supplies are floor-scoped transient events with truthful ward effects', () => {
  const { systems, peer, cmd } = fixture();
  const entry = cmd({ kind: 'underworld-enter', settlementId: town.id });
  Object.assign(peer, entry.transition!.to);
  systems.setPeers([peer], 2);
  systems.drainEvents();
  assert.equal(cmd({ kind: 'underworld-attack', attack: 'melee', heading: 0 }).ok, true);
  assert.ok(systems.drainEvents().every((e) => e.spaceId === peer.spaceId));
  assert.equal(
    systems.economy.transact(
      peer.id,
      { coins: 0, items: {} },
      { coins: 0, items: { 'ward-kit': 1 } },
      'testward',
    ).ok,
    true,
  );
  const result = cmd({ kind: 'consume', item: 'ward-kit' });
  assert.equal(result.ok, true);
  assert.match(result.message, /guard and underground/);
  assert.ok(systems.drainEvents().every((e) => e.spaceId === peer.spaceId));
  assert.equal(systems.frame(peer).activeWardSeconds, 30);
  assert.equal(JSON.stringify(systems.save()).includes('tool-impact'), false);
});
test('rescuing a survivor creates a real employable surface person and durable rebuilding unlock once', () => {
  const start = fixture();
  const entered = start.cmd({ kind: 'underworld-enter', settlementId: town.id });
  assert.equal(entered.ok, true);
  const save = start.systems.save();
  for (const enemy of save.underworld.floors[0].enemies) {
    enemy.hp = 0;
    enemy.state = 'dead';
  }
  const f = fixture('solo', save),
    plan = generateUnderworld(42, town.id, 0),
    rescue = plan.features.find((p) => p.kind === 'survivor')!;
  Object.assign(f.peer, { spaceId: plan.spaceId, x: rescue.x, y: rescue.y });
  f.systems.setPeers([f.peer], 3);
  const out = f.cmd({ kind: 'underworld-interact', targetId: rescue.id });
  assert.equal(out.ok, true);
  const frame = f.systems.frame(f.peer);
  assert.equal(frame.rescued.length, 1);
  assert.equal(frame.rescued[0].delivered, true);
  const actor = f.systems.actors.get(frame.rescued[0].survivorId);
  assert.ok(actor);
  assert.equal(actor.spaceId, 'surface');
  assert.equal(actor.body.role, 'engineer');
  assert.ok(frame.unlocks.some((x) => x.endsWith(':waterworks')));
  assert.equal(f.cmd({ kind: 'underworld-interact', targetId: rescue.id }).ok, true);
  assert.equal(f.systems.frame(f.peer).rescued.length, 1);
  assert.equal(validLivingSystemsSave(f.systems.save()), true);
});
test('pending salvage is not credited twice and field supplies consume authoritative owned inventory', () => {
  const start = fixture();
  start.cmd({ kind: 'underworld-enter', settlementId: town.id });
  const save = start.systems.save();
  for (const enemy of save.underworld.floors[0].enemies) {
    enemy.hp = 0;
    enemy.state = 'dead';
  }
  const f = fixture('solo', save),
    plan = generateUnderworld(42, town.id, 0),
    cache = plan.features.find((p) => p.kind === 'cache')!;
  Object.assign(f.peer, { spaceId: plan.spaceId, x: cache.x, y: cache.y });
  f.systems.setPeers([f.peer], 3);
  assert.equal(f.cmd({ kind: 'underworld-interact', targetId: cache.id }).ok, true);
  assert.equal(f.systems.frame(f.peer).pendingSalvage.length, 1);
  const seq = f.systems.nextSequence(f.peer.id),
    event = `test:${seq}`;
  assert.equal(f.systems.command(f.peer, { kind: 'underworld-rewards' }, event).ok, true);
  const items = f.systems.economy.satchel(f.peer.id)!.items;
  assert.ok(items.scrap);
  assert.equal(f.systems.command(f.peer, { kind: 'underworld-rewards' }, event).ok, false);
  assert.deepEqual(f.systems.economy.satchel(f.peer.id)!.items, items);
  f.systems.economy.transact(
    f.peer.id,
    { coins: 0, items: {} },
    { coins: 0, items: { bandage: 1, 'ward-kit': 1 } },
    'trusted-test-reward',
  );
  const use = f.cmd({ kind: 'consume', item: 'bandage' });
  assert.equal(use.rest!.hpFraction, 0.25);
  assert.equal(f.systems.economy.satchel(f.peer.id)!.items.bandage, undefined);
  f.systems.setPeers([f.peer], 5);
  assert.equal(f.cmd({ kind: 'consume', item: 'ward-kit' }).wardSeconds, 30);
  assert.equal(f.systems.mitigateDamage(f.peer.id, 10), 7);
  assert.equal(validLivingSystemsSave(f.systems.save()), true);
});
test('actual person attacks change the persistent body, record witnessed consequences and cannot double-fire', () => {
  const { systems, peer } = fixture();
  Object.assign(peer, { x: 0, y: 3 });
  systems.setPeers([peer], 2);
  const event = `test:${systems.nextSequence(peer.id)}`;
  const first = systems.command(
    peer,
    { kind: 'person-attack', targetId: 'herbalist', heading: 0 },
    event,
  );
  assert.equal(first.ok, true);
  assert.ok(first.damage! > 0);
  const hp = systems.actors.get('herbalist')!.body.hp;
  assert.ok(hp < 80);
  assert.equal(
    systems.command(peer, { kind: 'person-attack', targetId: 'herbalist', heading: 0 }, event).ok,
    false,
  );
  assert.equal(systems.actors.get('herbalist')!.body.hp, hp);
  assert.equal(systems.civic.knownActions('watch').length > 0, true);
  assert.equal(validLivingSystemsSave(systems.save()), true);
});
test('new commands reject attacker-supplied equipment/damage and old optional-extension saves remain valid', () => {
  assert.equal(
    validSystemsCommand({ kind: 'underworld-attack', attack: 'melee', heading: 0, damage: 999 }),
    false,
  );
  assert.equal(validSystemsCommand({ kind: 'consume', item: 'coins' }), false);
  assert.equal(
    validSystemsCommand({ kind: 'person-attack', targetId: 'watch', heading: Infinity }),
    false,
  );
  const f = fixture(),
    save = f.systems.save() as Record<string, unknown>;
  for (const key of [
    'underworld',
    'commands',
    'pendingDeaths',
    'rescues',
    'unlocks',
    'wards',
    'domainSerial',
  ])
    delete save[key];
  assert.equal(validLivingSystemsSave(save), true);
  assert.doesNotThrow(() => fixture('solo', save as LivingSystemsSave));
});

test('occupied people retain identity and accepted location but never become autonomous contacts, workers or targets', () => {
  const f = fixture();
  Object.assign(f.peer, { x: 2, y: 3, occupiedBodyId: 'watch' });
  f.systems.setPeers([f.peer], 2);
  const before = f.systems.actors.get('watch')!;
  f.systems.tick(2);
  let frame = f.systems.frame(f.peer);
  assert.equal(
    frame.actors.some((a) => a.id === 'watch'),
    false,
  );
  assert.equal(
    frame.contacts.some((c) => c.npcId === 'watch'),
    false,
  );
  Object.assign(f.peer, { x: 12, y: 14 });
  f.systems.setPeers([f.peer], 3);
  for (let time = 3; time < 9; time++) f.systems.tick(time);
  const actor = f.systems.actors.get('watch')!;
  assert.equal(actor.id, before.id);
  assert.deepEqual({ x: actor.x, y: actor.y }, { x: 12, y: 14 });
  assert.equal(actor.destination, undefined);
  assert.equal(f.cmd({ kind: 'person-attack', targetId: 'watch', heading: 0 }).ok, false);
  const save = f.systems.save();
  assert.equal(validLivingSystemsSave(save), true);
  const restored = fixture('solo', save);
  assert.equal(
    restored.systems.frame(restored.peer).actors.some((a) => a.id === 'watch'),
    false,
  );
  const bad = {
    ...save,
    occupied: [
      ['a', 'watch'],
      ['b', 'watch'],
    ],
  };
  assert.equal(validLivingSystemsSave(bad), false);
});
test('guard force follows an actual witnessed assault, gives a surrender window, and damages through one drained stream', () => {
  const f = fixture();
  Object.assign(f.peer, { x: 1, y: 3 });
  f.systems.setPeers([f.peer], 2);
  assert.equal(f.cmd({ kind: 'person-attack', targetId: 'watch', heading: 0 }).ok, true);
  let hits: ReturnType<LivingSystems['drainCombatEvents']> = [];
  for (let t = 3; t < 9; t++) {
    f.systems.setPeers([f.peer], t);
    f.systems.tick(t);
    hits.push(...f.systems.drainCombatEvents());
  }
  assert.equal(hits.length, 0);
  for (let t = 9; t < 13; t++) {
    f.systems.setPeers([f.peer], t);
    f.systems.tick(t);
    hits.push(...f.systems.drainCombatEvents());
  }
  assert.ok(hits.some((h) => h.actorId === 'watch' && h.targetId === f.peer.id));
  assert.equal(f.systems.drainCombatEvents().length, 0);
  assert.equal(f.systems.frame(f.peer).actors.find((a) => a.id === 'watch')?.hostile, true);
  const other = { id: 'unrelated', spaceId: 'surface', x: 1, y: 3, active: true };
  f.systems.setPeers([f.peer, other], 13);
  assert.equal(f.systems.frame(other).actors.find((a) => a.id === 'watch')?.hostile, false);
  f.systems.economy.transact(
    f.peer.id,
    { coins: 0, items: {} },
    { coins: 100, items: {} },
    'trusted-fine-funds',
  );
  assert.equal(f.cmd({ kind: 'fine', guardId: 'watch' }).ok, true);
  f.systems.tick(14);
  assert.equal(f.systems.drainCombatEvents().length, 0);
  assert.equal(validLivingSystemsSave(f.systems.save()), true);
});
test('underground fatal damage cannot erase a reward when the field ground ledger is full', () => {
  const f = fixture();
  f.cmd({ kind: 'underworld-enter', settlementId: town.id });
  const save = f.systems.save(),
    enemy = save.underworld.floors[0].enemies[0];
  enemy.hp = 1;
  const staged = fixture('solo', save);
  for (let i = 0; i < 256; i++) {
    const out = staged.systems.economy.spawnDeath({
      actorId: `capacity:${i}`,
      kind: 'enemy',
      spaceId: 'surface',
      x: i,
      y: 0,
      difficulty: 1,
      contributors: [staged.peer.id],
      time: 1,
    });
    assert.equal(out.ok, true);
  }
  Object.assign(staged.peer, {
    spaceId: save.underworld.floors[0].spaceId,
    x: enemy.x - 1,
    y: enemy.y,
  });
  staged.systems.setPeers([staged.peer], 3);
  staged.cmd({ kind: 'underworld-attack', attack: 'melee', heading: 0 });
  assert.equal(staged.systems.underworld.frame(staged.peer.spaceId)!.state.enemies[0].hp, 1);
  staged.systems.economy.tick(1802);
  staged.systems.setPeers([staged.peer], 1803);
  staged.cmd({ kind: 'underworld-attack', attack: 'melee', heading: 0 });
  assert.equal(staged.systems.underworld.frame(staged.peer.spaceId)!.state.enemies[0].hp, 0);
  assert.ok(staged.systems.economy.drop(`drop:${enemy.id}`));
  assert.equal(validLivingSystemsSave(staged.systems.save()), true);
});

test('a recovered town plan changes actual construction fees without discounting property acquisition or transfers', () => {
  const first = fixture(),
    saved = first.systems.save();
  saved.unlocks = [`${town.id}:waterworks`];
  const f = fixture('solo', saved);
  f.systems.economy.transact(
    f.peer.id,
    { coins: 0, items: {} },
    { coins: 200, items: { wood: 20, stone: 20 } },
    'trusted-building-fixture',
  );
  const plot = f.systems.frame(f.peer).offers.find((o) => o.kind === 'plot')!;
  Object.assign(f.peer, plot.entrance);
  f.systems.setPeers([f.peer], 2);
  assert.equal(
    f.cmd({ kind: 'property', command: { kind: 'acquire', propertyId: plot.id, mode: 'buy' } }).ok,
    true,
  );
  const before = f.systems.economy.satchel(f.peer.id)!.coins;
  const built = f.cmd({
    kind: 'property',
    command: {
      kind: 'build',
      propertyId: plot.id,
      station: 'sawmill',
      at: { spaceId: 'surface', x: plot.bounds.x + 1, y: plot.bounds.y + 1 },
    },
  });
  assert.equal(built.ok, true);
  assert.equal(before - f.systems.economy.satchel(f.peer.id)!.coins, 6);
  assert.match(built.message, /25%/);
  const coins = f.systems.economy.satchel(f.peer.id)!.coins;
  assert.equal(
    f.cmd({
      kind: 'property',
      command: { kind: 'deposit', propertyId: plot.id, bundle: { coins: 10, items: {} } },
    }).ok,
    true,
  );
  assert.equal(coins - f.systems.economy.satchel(f.peer.id)!.coins, 10);
  assert.equal(validLivingSystemsSave(f.systems.save()), true);
});
