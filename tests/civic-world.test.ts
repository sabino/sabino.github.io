import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CivicWorld,
  CIVIC_LIMITS,
  doorAccess,
  validCivicSave,
  type CivicActor,
  type CivicAction,
  type CivicDebit,
} from '../src/stichos/civic-world.ts';
import { civilizationFor } from '../src/stichos/civilization.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';
import type { Settlement, Tile, Prop } from '../src/stichos/types.ts';
const town: Settlement = {
  id: 'town:0:0',
  seed: 43,
  name: 'Ilex Reach',
  x: 0,
  y: 0,
  radius: 18,
  clan: 1,
  kind: 'village',
  rank: 'city',
};
const town2: Settlement = { ...town, id: 'town:1:0', name: 'East Mere', x: 200 };
const actor = (id: string, x = 0, y = 0): CivicActor => ({
  id,
  x,
  y,
  spaceId: 'surface',
  alive: true,
});
const yes = () => true;
const setup = () => {
  const c = new CivicWorld(43, civilizationFor(43));
  c.factionsFor(town);
  return c;
};
const act = (kind: CivicAction['kind'], sourceId = kind, at = 10): CivicAction => ({
  actorId: 'player',
  kind,
  sourceId,
  at,
  x: 0,
  y: 0,
  spaceId: 'surface',
  settlementId: town.id,
});
const debit: CivicDebit = () => true;

test('guild identity and heraldry derive from seed and actual settlement, independent of discovery order', () => {
  const a = setup(),
    b = new CivicWorld(43, civilizationFor(43));
  b.factionsFor(town2);
  assert.deepEqual(a.factionsFor(town), b.factionsFor(town));
  assert.equal(new Set([...a.factionsFor(town), ...a.factionsFor(town2)].map((f) => f.id)).size, 6);
  assert.equal(a.factionsFor(town).length, 3);
  assert.ok(
    a.factionsFor(town).every((g) => g.heraldry.symbol && g.principles && g.benefits.length === 5),
  );
});
test('guild discovery, atomic entry cost, duties, dues, replay and rank have real state effects', () => {
  const c = setup(),
    f = c.factionsFor(town)[0],
    receipts = new Set<string>();
  let coins = 40;
  const bank: CivicDebit = (cost, id) => {
    if (receipts.has(id) || cost.coins > coins) return false;
    coins -= cost.coins;
    receipts.add(id);
    return true;
  };
  assert.equal(c.join('player', f.id, 10, bank).ok, false);
  c.discover('player', f.id);
  assert.equal(c.join('player', f.id, 10, bank).ok, true);
  assert.equal(coins, 32);
  assert.equal(c.join('player', f.id, 10, bank).ok, false);
  c.setGuildContact(f.id, 'registrar');
  let time = 10;
  while (c.duty('player', f.id, time)!.action) time += 1440;
  c.payDues('player', f.id, time, bank);
  const duty = c.duty('player', f.id, time)!;
  assert.ok(Object.values(duty.cost.items).some((n) => n! > 0));
  assert.equal(c.completeDuty('player', f.id, time, bank).ok, true);
  assert.equal(c.completeDuty('player', f.id, time, bank).ok, false);
  assert.equal(c.membership('player', f.id)!.rank, 1);
  assert.equal(c.membership('player', f.id)!.completed, 1);
  assert.equal(c.completeDuty('player', f.id, time + 10000, bank).ok, false);
});
test('no atomic debit means no membership, service, fine, or standings mutation', () => {
  const c = setup(),
    f = c.factionsFor(town)[0];
  c.discover('player', f.id);
  const before = c.save();
  assert.equal(c.join('player', f.id, 10, () => false).ok, false);
  assert.deepEqual(c.save(), before);
});
test('witnesses require local line of sight; noise alone does not reveal identity', () => {
  const c = setup();
  const remote = { ...actor('remote', 0), spaceId: 'underground:town:0:0:1' };
  const e = c.recordAction(
    act('assault'),
    [actor('seen', 2), actor('heard', 3), actor('far', 30), remote],
    (from) => from.x === 2,
  ).event!;
  assert.equal(c.knownActions('seen')[0].knowledge.provenance, 'seen');
  assert.equal(c.knownActions('heard')[0].knowledge.provenance, 'heard');
  assert.equal(c.knownActions('heard')[0].knowledge.identified, false);
  assert.equal(c.knownActions('far').length, 0);
  assert.equal(c.knownActions('remote').length, 0);
  assert.equal(c.reputation('heard', 'player').knownActions, 0);
  assert.equal(c.report(actor('heard', 3), actor('listener', 4), e.id, 11, yes).ok, false);
});
test('gossip carries actual bounded provenance, nearby contacts, confidence, and at most two hops', () => {
  const c = setup(),
    e = c.recordAction(act('theft'), [actor('a')], yes).event!;
  assert.equal(c.report(actor('a'), actor('b', 20), e.id, 11, yes).ok, false);
  assert.equal(c.report(actor('a'), actor('b', 2), e.id, 11, () => false).ok, false);
  assert.equal(c.report(actor('a'), actor('b', 2), e.id, 11, yes).ok, true);
  assert.equal(c.report(actor('b', 2), actor('c', 3), e.id, 12, yes).ok, true);
  assert.equal(c.report(actor('c', 3), actor('d', 4), e.id, 13, yes).ok, false);
  assert.equal(c.knownActions('c')[0].knowledge.confidence, 0.6400000000000001);
  assert.equal(c.knownActions('c')[0].knowledge.from, 'b');
  assert.equal(validCivicSave(c.save()), true);
});
test('guilds know only their real contacts: distant witness cannot immediately expel or deny access', () => {
  const c = setup(),
    f = c.factionsFor(town)[0];
  c.setGuildContact(f.id, 'registrar');
  c.discover('player', f.id);
  c.join('player', f.id, 1, debit);
  const e = c.recordAction(act('murder'), [actor('witness', 1)], yes).event!;
  assert.equal(c.membership('player', f.id)!.status, 'member');
  assert.equal(c.factionReputation(f.id, 'player').knownActions, 0);
  assert.equal(c.report(actor('witness', 1), actor('registrar', 2), e.id, 11, yes).ok, true);
  assert.equal(c.membership('player', f.id)!.status, 'expelled');
  assert.equal(c.factionReputation(f.id, 'player').knownActions, 1);
  assert.equal(c.reputation('unrelated-resident', 'player').knownActions, 0);
});
test('guard investigates unidentified sound, follows a real report, searches lost sight and retains the unresolved charge', () => {
  const c = setup(),
    guard = {
      ...actor('guard', 2),
      role: 'guard' as const,
      home: actor('home', 8),
      settlementId: town.id,
    };
  const e = c.recordAction(
    act('assault'),
    [guard, actor('witness')],
    (from) => from.id === 'witness',
  ).event!;
  assert.equal(c.updateGuard(guard, [actor('player')], 10, yes).state, 'investigate');
  assert.equal(c.updateGuard(guard, [actor('player')], 10, yes).targetId, undefined);
  c.report(actor('witness'), guard, e.id, 11, yes);
  assert.equal(c.updateGuard(guard, [actor('player')], 11, yes).state, 'pursue');
  assert.equal(c.updateGuard({ ...guard, x: 0.5 }, [actor('player')], 12, yes).arrest, true);
  assert.equal(c.updateGuard(guard, [], 40, yes).state, 'search');
  assert.equal(c.updateGuard(guard, [], 61, yes).state, 'return');
  assert.equal(c.guard(guard.id)!.settled.length, 0);
  assert.equal(c.updateGuard(guard, [actor('player')], 62, yes).state, 'pursue');
});
test('minor offense has warning/fine; payment is atomic and does not erase reputation or recharge through a second guard', () => {
  const c = setup(),
    g = { ...actor('guard', 1), home: actor('home', 8), settlementId: town.id };
  c.recordAction(act('theft'), [g, actor('second', 2)], yes);
  assert.equal(c.updateGuard(g, [actor('player')], 10, yes).state, 'warn');
  assert.equal(c.updateGuard(g, [actor('player')], 11, yes).state, 'fine');
  const before = c.reputation('guard', 'player');
  assert.equal(c.settleFine('guard', 'intruder', debit).ok, false);
  assert.equal(c.settleFine('guard', 'player', () => false).ok, false);
  assert.equal(c.settleFine('guard', 'player', debit).ok, true);
  assert.equal(c.settleFine('guard', 'player', debit).ok, false);
  assert.deepEqual(c.reputation('guard', 'player'), before);
  assert.equal(c.updateGuard({ ...g, id: 'second' }, [actor('player')], 12, yes).state, 'return');
  assert.equal(validCivicSave(c.save()), true);
});
test('events are authority assigned, source receipts are replay safe, and observer ordering is deterministic', () => {
  const a = setup(),
    b = setup(),
    observers = [actor('a', 2), actor('b', 3), actor('c', 2)];
  assert.equal(a.recordAction(act('aid'), observers, yes).ok, true);
  b.recordAction(act('aid'), observers.toReversed(), yes);
  assert.deepEqual(a.save(), b.save());
  assert.equal(a.recordAction(act('aid'), observers, yes).ok, false);
  assert.equal(a.save().events.length, 1);
});
test('individual interpretation has multiple remembered traits and no universal city hostility', () => {
  const c = setup();
  c.recordAction(act('rescue'), [actor('a')], yes);
  c.recordAction(act('theft', 'theft2'), [actor('b')], yes);
  assert.ok(c.reputation('a', 'player').traits.helpful);
  assert.equal(c.reputation('a', 'player').traits.thief, undefined);
  assert.ok(c.reputation('b', 'player').traits.thief);
  assert.equal(c.reputation('b', 'player').traits.helpful, undefined);
  assert.notEqual(c.reputation('a', 'player').priceFactor, c.reputation('b', 'player').priceFactor);
});
test('civic saturation rejects admission without evicting persistent witnesses, actors, or identities', () => {
  const c = setup();
  for (let i = 0; i < CIVIC_LIMITS.events; i++)
    assert.equal(c.recordAction(act('aid', `source:${i}`), [], yes).ok, true);
  const before = c.save();
  assert.equal(c.recordAction(act('theft', 'overflow'), [], yes).ok, false);
  assert.deepEqual(c.save(), before);
});
test('save/restore keeps exact membership, individual evidence, guard intent, and original generated towns', () => {
  const c = setup(),
    f = c.factionsFor(town)[0];
  c.setGuildContact(f.id, 'registrar');
  c.discover('player', f.id);
  c.join('player', f.id, 2, debit);
  c.recordAction(act('aid'), [actor('registrar')], yes);
  assert.equal(validCivicSave(c.save()), true);
  assert.deepEqual(new CivicWorld(43, civilizationFor(43), c.save()).save(), c.save());
  const world = new InfiniteWorld(43, 4);
  for (const t of world.settlementsAround(0, 0, 50)) c.factionsFor(t);
  assert.equal(validCivicSave(c.save()), true);
});
test('strict save rejects cross references, forged identity/confidence, duplicate records, unknown keys and microphone payloads', () => {
  const c = setup();
  c.recordAction(act('theft'), [actor('a')], yes);
  const snapshot = c.save();
  for (const mutate of [
    (s: any) => (s.audio = new Uint8Array(3)),
    (s: any) => s.events.push(s.events[0]),
    (s: any) => (s.events[0].severity = 0),
    (s: any) => (s.events[0].id = 'civic:2b:900'),
    (s: any) => (s.knowledge[0].identified = false),
    (s: any) => (s.knowledge[0].confidence = 0.9),
    (s: any) => (s.knowledge[0].eventId = 'missing'),
    (s: any) => (s.towns[0].extra = 'audio'),
    (s: any) => (s.events[0].x = Infinity),
  ]) {
    const copy = structuredClone(snapshot);
    mutate(copy);
    assert.equal(validCivicSave(copy), false);
    assert.throws(() => new CivicWorld(43, undefined, copy));
  }
  assert.throws(() => new CivicWorld(44, undefined, snapshot));
});
const tile: Tile = {
  x: 0,
  y: 0,
  seed: 1,
  terrain: 'floor',
  biome: 'settlement',
  height: 0,
  temperature: 0,
  detail: 0,
  building: 'home:1',
  buildingKind: 'house',
};
const door: Prop = {
  id: 'home:1:door:1',
  building: 'home:1',
  x: 0,
  y: 0,
  seed: 1,
  kind: 'door',
  solid: true,
  name: 'Root House',
};
test('door ownership, guest permissions, keys, locks, public hours and building identity are explicit', () => {
  const base = { door, tile, actorId: 'player', hour: 12 };
  assert.equal(doorAccess(base).reason, 'private');
  assert.equal(doorAccess({ ...base, ownerId: 'player', locked: true }).allowed, true);
  assert.equal(doorAccess({ ...base, ownerId: 'other', guests: ['player'] }).reason, 'guest');
  assert.equal(doorAccess({ ...base, locked: true, keys: ['home:1'] }).reason, 'key');
  assert.equal(doorAccess({ ...base, locked: true }).offense, 'burglary');
  assert.equal(doorAccess({ ...base, tile: { ...tile, buildingKind: 'workshop' } }).allowed, true);
  assert.equal(
    doorAccess({ ...base, tile: { ...tile, buildingKind: 'workshop' }, hour: 19 }).reason,
    'closed',
  );
  assert.equal(
    doorAccess({ ...base, tile: { ...tile, buildingKind: 'inn' }, hour: 2 }).allowed,
    true,
  );
  assert.equal(doorAccess({ ...base, tile: { ...tile, building: 'wrong' } }).allowed, false);
  assert.equal(doorAccess({ ...base, hour: NaN }).allowed, false);
});

test('an action duty needs evidence at a guild contact, not an unwitnessed player assertion', () => {
  const c = setup(),
    f = c.factionsFor(town)[0];
  c.discover('player', f.id);
  c.setGuildContact(f.id, 'registrar');
  c.join('player', f.id, 1, debit);
  let at = 10;
  while (!c.duty('player', f.id, at)!.action) at += 1440;
  c.payDues('player', f.id, at, debit);
  const d = c.duty('player', f.id, at)!;
  const e = c.recordAction(act(d.action!, 'duty-service', at), [actor('witness')], yes).event!;
  assert.equal(c.completeDuty('player', f.id, at, debit).ok, false);
  c.report(actor('witness'), actor('registrar', 1), e.id, at + 1, yes);
  assert.equal(c.completeDuty('player', f.id, at + 1, debit).ok, true);
});

test('successive real contributions earn senior ranks; rival senior oaths block benefits until relinquished', () => {
  const c = setup(),
    guilds = c.factionsFor(town),
    f = guilds.find((g) => g.rivalId)!;
  c.setGuildContact(f.id, 'registrar');
  c.discover('player', f.id);
  c.join('player', f.id, 1, debit);
  for (let day = 0; day < 12; day++) {
    const at = 10 + day * 1440;
    c.payDues('player', f.id, at, debit);
    const d = c.duty('player', f.id, at)!;
    if (d.action) c.recordAction(act(d.action, `duty:${day}`, at), [actor('registrar')], yes);
    assert.equal(c.completeDuty('player', f.id, at, debit).ok, true);
  }
  assert.ok(c.membership('player', f.id)!.rank >= 3);
  c.discover('player', f.rivalId!);
  assert.equal(c.join('player', f.rivalId!, 17300, debit).ok, false);
  c.leave('player', f.id, 17300);
  assert.equal(c.join('player', f.rivalId!, 17300, debit).ok, true);
});

test('expulsion requires witnessed service and restitution to reconcile, preserving the old history', () => {
  const c = setup(),
    f = c.factionsFor(town)[0];
  c.setGuildContact(f.id, 'registrar');
  c.discover('player', f.id);
  c.join('player', f.id, 1, debit);
  c.recordAction(act('betrayal'), [actor('registrar')], yes);
  assert.equal(c.membership('player', f.id)!.status, 'expelled');
  assert.equal(c.reconcile('player', f.id, 11, debit).ok, false);
  for (let i = 0; i < 4; i++)
    c.recordAction(act('rescue', `redemption:${i}`, 12 + i), [actor('registrar')], yes);
  assert.equal(c.reconcile('player', f.id, 20, () => false).ok, false);
  assert.equal(c.reconcile('player', f.id, 20, debit).ok, true);
  assert.equal(c.join('player', f.id, 21, debit).ok, true);
  assert.equal(c.factionReputation(f.id, 'player').traits.oathbreaker, 5);
  assert.equal(c.save().events.length, 5);
});

test('bounded gossip selects the newest identifiable evidence a nearby recipient still lacks', () => {
  const c = setup(),
    first = c.recordAction(act('aid', 'first', 10), [actor('speaker')], yes).event!;
  const second = c.recordAction(act('rescue', 'second', 12), [actor('speaker')], yes).event!;
  assert.equal(c.latestReportFor('speaker', 'listener'), second.id);
  c.report(actor('speaker'), actor('listener', 1), second.id, 13, yes);
  assert.equal(c.latestReportFor('speaker', 'listener'), first.id);
  c.report(actor('speaker'), actor('listener', 1), first.id, 14, yes);
  assert.equal(c.latestReportFor('speaker', 'listener'), undefined);
  assert.equal(c.latestReportFor('unknown'), undefined);
});
