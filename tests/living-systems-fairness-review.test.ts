import test from 'node:test';
import assert from 'node:assert/strict';
import { LivingSystems, type SystemsPeer } from '../src/stichos/living-systems.ts';
import { appearance, type InfiniteWorld } from '../src/stichos/world.ts';
import type { Npc } from '../src/stichos/types.ts';

function separatedTowns() {
  const people: Npc[] = Array.from({ length: 4 }, (_, cluster) =>
    Array.from({ length: 16 }, (_, i) => ({
      id: `person-${cluster}-${i}`,
      name: `Person ${cluster} ${i}`,
      role: 'botanist' as const,
      seed: cluster * 16 + i + 1,
      clan: 1,
      x: cluster * 1000 + (i % 4),
      y: Math.floor(i / 4),
      home: { x: cluster * 1000 + (i % 4), y: Math.floor(i / 4) },
      appearance: appearance(cluster * 16 + i + 1, 'botanist', 1),
      hp: 80,
      maxHp: 80,
      speed: 1.3,
      heading: 0,
      phase: 0,
      hostile: false,
      cooldown: 0,
    })),
  ).flat();
  const peers: SystemsPeer[] = [0, 1, 2, 3].map((i) => ({
    id: `peer-${i}`,
    spaceId: 'surface',
    x: i * 1000,
    y: 1,
    active: true,
    combatActive: true,
    heading: 0,
  }));
  const world = {
    seed: 42,
    generation: 4,
    civilization: null,
    tile: (x: number, y: number) => ({ x, y, seed: 9, terrain: 'grass', biome: 'forest' }),
    propsAround: () => [],
    npcsAround: (x: number, y: number, r: number) =>
      people.filter((p) => Math.hypot(p.x - x, p.y - y) <= r),
    settlementsAround: () => [],
    blocked: () => false,
  } as unknown as InfiniteWorld;
  const systems = new LivingSystems(world, new Set(), {
    mode: 'shared',
    fauna: () => [],
    defeatFauna: () => {},
    woundFauna: () => {},
  });
  return { systems, peers, people };
}

test('independent review: bounded discovery serves later peers and adapts to joins and leaves', () => {
  const { systems, peers } = separatedTowns();
  systems.setPeers(peers.slice(0, 3), 0);
  systems.tick(0);
  assert.equal(systems.actors.size, 32, 'first interval retains the two-peer work budget');
  systems.tick(0.5);
  for (const peer of peers.slice(0, 3)) assert.equal(systems.actors.query(peer, 24, 32).length, 16);
  systems.setPeers([peers[2], peers[3], peers[1]], 1);
  systems.tick(1);
  systems.tick(1.5);
  assert.equal(
    systems.actors.query(peers[3], 24, 32).length,
    16,
    'a later join is eventually served',
  );
  assert.equal(systems.actors.size, 64, 'leaving visibility does not delete an existing actor');
});

test('independent review: routines and gossip each rotate beyond the first thirty-two residents', () => {
  const { systems, peers, people } = separatedTowns();
  systems.setPeers(peers.slice(0, 3), 0);
  for (const person of people.slice(0, 48))
    systems.actors.register(person, 'npc', 0, {
      home: { spaceId: 'surface', ...person.home },
      speed: person.speed,
    });
  const routines = new Set<string>();
  const gossip = new Set<string>();
  const destination = systems.actors.setDestination.bind(systems.actors);
  const report = systems.civic.latestReportFor.bind(systems.civic);
  systems.actors.setDestination = (id, ...args) => {
    routines.add(id);
    return destination(id, ...args);
  };
  systems.civic.latestReportFor = (speaker, ...args) => {
    gossip.add(speaker);
    return report(speaker, ...args);
  };
  systems.tick(0);
  assert.ok(routines.size <= 32, 'social work budget was not raised');
  assert.ok(gossip.size <= 8, 'rumor work budget was not raised');
  for (let time = 1; time <= 12; time++) systems.tick(time);
  for (const person of people.slice(0, 48)) {
    assert.ok(routines.has(person.id), `${person.id} receives a routine`);
    assert.ok(gossip.has(person.id), `${person.id} gets an opportunity to report known events`);
  }
});
