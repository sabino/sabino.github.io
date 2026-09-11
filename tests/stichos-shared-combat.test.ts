import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedCombat, type SharedCombatPeer } from '../src/stichos/shared-combat.ts';
import { weaponProfile } from '../src/stichos/equipment.ts';
import { generateArtifact } from '../src/stichos/artifacts.ts';
import { InfiniteWorld, STOP_SPACING } from '../src/stichos/world.ts';
import type { Appearance, Npc, Prop } from '../src/stichos/types.ts';

const look = (seed = 7, weapon: Appearance['weapon'] = 'sword'): Appearance => ({
  seed,
  weapon,
  skin: '#b99b83',
  hair: '#564236',
  coat: '#704839',
  trim: '#ae9970',
  trousers: '#34424c',
  height: 1,
  build: 1,
  hairStyle: 0,
  hat: 0,
  cloak: true,
});
const peer = (
  id = 'one',
  x = 0,
  y = 0,
  weapon: Appearance['weapon'] = 'sword',
): SharedCombatPeer => ({ id, x, y, heading: 0, combatActive: true, appearance: look(7, weapon) });
const enemy = (
  id = 'raider',
  x = 1,
  y = 0,
  weapon: Appearance['weapon'] = 'sword',
  hp = 100,
): Npc => ({
  id,
  x,
  y,
  seed: 17,
  name: id,
  role: 'raider',
  clan: 0,
  appearance: look(17, weapon),
  hp,
  maxHp: hp,
  home: { x, y },
  speed: 1.5,
  heading: 0,
  phase: 0,
  hostile: true,
  cooldown: 0,
});
function arena(npcs: Npc[], props: Prop[] = []) {
  let clock = 0;
  const walls = new Set<string>(),
    removed = new Set<string>();
  const world = {
    generation: 3 as const,
    blocked(x: number, y: number, gone: Set<string> = new Set()) {
      const key = `${Math.round(x)},${Math.round(y)}`;
      return (
        walls.has(key) ||
        props.some(
          (p) => `${p.x},${p.y}` === key && (p.solid || p.kind === 'door') && !gone.has(p.id),
        )
      );
    },
    npcsAround(x: number, y: number, radius: number) {
      return npcs
        .filter((n) => Math.hypot(n.x - x, n.y - y) <= radius)
        .map((n) => structuredClone(n));
    },
    propsAround(x: number, y: number, radius: number) {
      return props.filter((p) => Math.hypot(p.x - x, p.y - y) <= radius);
    },
  };
  const combat = new SharedCombat(world, removed, { now: () => clock });
  return {
    combat,
    world,
    walls,
    removed,
    advance(ms = 1000) {
      clock += ms;
    },
  };
}

test('two peers share exact generated damage, a single death receipt, and immutable late-join snapshots', () => {
  const a = arena([enemy('foe', 1, 0, 'sword', 50)]);
  const p = peer(),
    q = peer('two');
  const first = a.combat.attack({ ...p, damage: 99999 } as SharedCombatPeer, 0);
  assert.equal(first.ok, true);
  assert.equal(first.hits[0].damage, weaponProfile(7, 'sword', 1).damage);
  assert.equal(first.snapshot.enemies[0].hp, 50 - first.hits[0].damage);
  const second = a.combat.attack(q, 0);
  assert.equal(second.deaths.length, 1);
  assert.deepEqual(second.deaths[0].contributors, ['one', 'two']);
  assert.equal(second.deaths[0].killerId, 'two');
  assert.deepEqual(second.snapshot.dead, ['foe']);
  assert.ok(a.removed.has('foe'));
  a.advance();
  assert.equal(a.combat.attack(p, 0).deaths.length, 0);
  assert.equal(a.combat.tick(0.1, [p, q]).deaths.length, 0);
  const late = a.combat.snapshot();
  late.dead.length = 0;
  assert.deepEqual(a.combat.snapshot().dead, ['foe']);
  assert.ok(second.snapshot.seq > first.snapshot.seq);
  assert.ok(second.deaths[0].id > second.hits[0].id);
});

test('authority cooldown survives pose changes and inactive, invalid or nonweapon intents cannot hit', () => {
  const a = arena([enemy()]),
    p = peer();
  assert.equal(a.combat.attack(p, 0).ok, true);
  assert.equal(a.combat.attack({ ...p, appearance: look(200, 'staff') }, 0).ok, false);
  assert.equal(a.combat.attack(p, 0, 'ward').ok, true, 'ward has its own cooldown');
  a.advance(500);
  assert.equal(a.combat.attack(p, 0, 'ward').ok, false);
  assert.equal(a.combat.attack({ ...p, combatActive: false }, 0).ok, false);
  assert.equal(a.combat.attack({ ...p, x: Infinity }, 0).ok, false);
  assert.equal(a.combat.attack(p, NaN).ok, false);
  assert.equal(
    a.combat.attack({ ...p, appearance: { ...p.appearance, weaponSeed: -1 } }, 0).ok,
    false,
  );
  assert.equal(
    a.combat.attack({ ...p, appearance: { ...p.appearance, weaponSeed: NaN } }, 0).ok,
    false,
  );
  let design = '';
  for (let i = 0; i < 50; i++)
    if (generateArtifact(`vessel ${i}`).category !== 'implement') {
      design = `vessel ${i}`;
      break;
    }
  assert.ok(design);
  assert.equal(
    a.combat.attack({ ...p, appearance: { ...p.appearance, artifactDesign: design } }, 0).ok,
    false,
  );
  a.advance(8000);
  assert.equal(a.combat.attack(p, 0, 'ward').ok, true);
});

test('attack range, facing and actual closed doors prevent hits; open doors change the same ray', () => {
  const door: Prop = { id: 'door', seed: 1, kind: 'door', solid: false, name: 'Door', x: 1, y: 0 };
  const a = arena([enemy('behind', 2, 0)], [door]),
    p = peer('one', 0.4, 0, 'staff');
  assert.equal(a.combat.attack(p, 0).hits.length, 0);
  a.advance();
  a.combat.tick(0.01, [p], new Set(['door']));
  assert.equal(a.combat.attack(p, 0).hits.length, 1);
  a.advance();
  assert.equal(a.combat.attack(p, Math.PI).hits.length, 0);
  const far = arena([enemy('far', 5, 0)]);
  assert.equal(far.combat.attack(peer(), 0).hits.length, 0);
  const friendly = enemy();
  friendly.role = 'guard';
  friendly.hostile = false;
  assert.equal(arena([friendly]).combat.attack(peer(), 0).hits.length, 0);
});

test('enemy chooses the closest active peer, locks its windup, and the chosen body can dodge', () => {
  const a = arena([enemy('foe', 0, 0)]),
    near = peer('z-near', 1, 0),
    far = peer('a-far', 1.4, 0);
  let frame = a.combat.tick(0.01, [
    far,
    near,
    { ...peer('inactive', 0.1, 0), combatActive: false },
  ]);
  assert.equal(frame.snapshot.enemies[0].intent?.targetId, 'z-near');
  const heading = frame.snapshot.enemies[0].intent!.heading;
  frame = a.combat.tick(0.24, [
    { ...near, x: -1 },
    { ...far, x: 0.5 },
  ]);
  assert.equal(frame.hits.length, 0, 'fixed heading cannot follow a dodge behind the attacker');
  assert.equal(frame.snapshot.enemies[0].heading, heading);
  const b = arena([enemy('foe', 0, 0)]);
  frame = b.combat.tick(0.01, [peer('b', 1, 0), peer('a', -1, 0)]);
  assert.equal(
    frame.snapshot.enemies[0].intent?.targetId,
    'a',
    'equal distance uses stable ID tie break',
  );
  frame = b.combat.tick(0.25, [{ ...peer('a', -1, 0), combatActive: false }]);
  assert.equal(frame.hits.length, 0, 'a departed/paused target cannot receive the queued strike');
});

test('player and enemy arrows are swept through cover, and released enemy shots remain dodgeable', () => {
  const a = arena([enemy('foe', 6, 0)]),
    p = peer('one', 0, 0, 'bow');
  assert.equal(a.combat.attack(p, 0).snapshot.projectiles.length, 1);
  a.walls.add('3,0');
  let hits = 0;
  for (let i = 0; i < 8; i++)
    hits += a.combat.tick(0.1, [p]).hits.filter((h) => h.target === 'npc').length;
  assert.equal(hits, 0);
  assert.equal(a.combat.snapshot().enemies[0].hp, 100);
  const b = arena([enemy('archer', 0, 0, 'bow')]),
    target = peer('one', 6, 0);
  let frame = b.combat.tick(0.01, [target]);
  assert.equal(frame.snapshot.enemies[0].intent?.kind, 'arrow');
  for (let i = 0; i < 6; i++) frame = b.combat.tick(0.1, [target]);
  assert.ok(frame.snapshot.projectiles.length > 0);
  hits = 0;
  for (let i = 0; i < 10; i++) hits += b.combat.tick(0.1, [{ ...target, y: 2 }]).hits.length;
  assert.equal(hits, 0);
  const c = arena([enemy('archer', 0, 0, 'bow')]);
  let received = 0;
  for (let i = 0; i < 20; i++)
    received += c.combat.tick(0.1, [target]).hits.filter((h) => h.target === 'peer').length;
  assert.equal(received, 1, 'one released projectile produces one player-hit receipt');
});

test('damaged enemies survive cache streaming, and active/durable caches enforce bounds without resetting injury', () => {
  const npcs = Array.from({ length: 6 }, (_, i) => enemy(`n${i}`, i * 40 + 1, 0));
  const a = arena(npcs),
    p = peer();
  const combat = new SharedCombat(a.world, a.removed, {
    maxEnemies: 1,
    maxRecords: 1,
    now: () => 10000,
  });
  const injury = combat.attack(p, 0).snapshot.enemies[0].hp;
  combat.tick(0.25, [peer('two', 40, 0)]);
  combat.tick(0.25, [peer('two', 40, 0)]);
  assert.ok(combat.snapshot().enemies.length <= 1);
  assert.equal(
    combat.attack(peer('two', 40, 0), 0, 'ward').hits.length,
    0,
    'record cap cannot add a second consequence',
  );
  combat.tick(0.25, [p]);
  combat.tick(0.25, [p]);
  combat.tick(0.25, [p]);
  assert.equal(combat.snapshot().enemies.find((n) => n.id === 'n0')?.hp, injury);
  const saved = combat.snapshot();
  saved.enemies[0].hp = 1;
  assert.equal(combat.snapshot().enemies[0].hp, injury);
});

test('procedural implement construction supplies exact damage and forged weapon seeds remain physical', () => {
  let design = '';
  for (let i = 0; i < 100; i++) {
    const g = generateArtifact(`test ${i}`);
    if (g.category === 'implement' && g.delivery === 'contact') {
      design = g.design;
      break;
    }
  }
  assert.ok(design);
  const g = generateArtifact(design),
    a = arena([enemy('foe', 0.8, 0)]),
    p = peer();
  const hit = a.combat.attack({ ...p, appearance: { ...p.appearance, artifactDesign: design } }, 0);
  assert.equal(hit.hits[0].damage, g.properties.damage);
  const b = arena([enemy()]);
  assert.equal(
    b.combat.attack({ ...p, appearance: { ...p.appearance, weaponSeed: 810 } }, 0).hits[0].damage,
    weaponProfile(810, 'sword', 1).damage,
  );
});

test('actual generated vault notice validates its own pair and peaceful consequences survive late discovery', () => {
  const world = new InfiniteWorld(73, 3),
    removed = new Set<string>();
  const vault = world.vaultsAround(320, 320, 24)[0];
  assert.ok(vault);
  const notice = world
    .propsAround(
      vault.entrance.x + 1,
      Math.round((Math.floor(vault.y / STOP_SPACING) + 1) * STOP_SPACING) - 1,
      3,
    )
    .find((p) => p.id === `${vault.id}:notice`)!;
  assert.ok(notice);
  const p = peer('one', notice.x, notice.y),
    combat = new SharedCombat(world, removed);
  const guards = world
    .npcsAround(vault.x, vault.y, 24)
    .filter((n) => n.id.startsWith(`${vault.id}:guard:`));
  assert.equal(guards.length, 2);
  assert.equal(
    combat.parley(
      { ...p, x: p.x + 5 },
      guards.map((n) => n.id),
    ).ok,
    false,
  );
  assert.equal(combat.parley(p, [guards[0].id, 'vault:9:9:guard:1']).ok, false);
  const result = combat.parley(
    p,
    guards.map((n) => n.id),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.peaceful, guards.map((n) => n.id).sort());
  const g = guards[0];
  const frame = combat.tick(0.01, [peer('late', g.x, g.y)]);
  assert.ok(frame.snapshot.enemies.some((n) => n.id === g.id && !n.hostile));
  assert.equal(frame.hits.length, 0);
  assert.equal(combat.attack(peer('late', g.x, g.y), 0, 'ward').hits.length, 0);
});
