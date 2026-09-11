import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos, ITEMS } from '../src/stichos/session.ts';
import { appearance } from '../src/stichos/world.ts';
import type { Npc, Point, Prop } from '../src/stichos/types.ts';

const still = { x: 0, y: 0, run: false };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Walk actual session inputs along public terrain, without moving the player by assignment. */
function walkTo(game: Stichos, target: Point) {
  game.dialogue = null;
  const start = { x: Math.round(game.player.x), y: Math.round(game.player.y) };
  const key = (p: Point) => `${p.x},${p.y}`;
  const queue = [start],
    seen = new Set([key(start)]),
    previous = new Map<string, Point>();
  let end: Point | undefined;
  for (let i = 0; i < queue.length && i < 12000; i++) {
    const p = queue[i];
    if (dist(p, target) <= 1.3 && !game.world.blocked(p.x, p.y, game.removed)) {
      end = p;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: p.x + dx, y: p.y + dy };
      if (
        seen.has(key(next)) ||
        Math.abs(next.x - start.x) > 35 ||
        Math.abs(next.y - start.y) > 35 ||
        game.world.blocked(next.x, next.y, game.removed)
      )
        continue;
      seen.add(key(next));
      previous.set(key(next), p);
      queue.push(next);
    }
  }
  assert.ok(end, `No walkable route to ${key(target)}`);
  const route: Point[] = [];
  for (let p = end; key(p) !== key(start); p = previous.get(key(p))!) route.unshift(p);
  for (const point of [start, ...route]) {
    for (let i = 0; dist(game.player, point) > 0.025 && i < 100; i++) {
      const dx = point.x - game.player.x,
        dy = point.y - game.player.y;
      const length = Math.hypot(dx, dy);
      game.update(Math.min(0.05, length / game.player.speed), {
        x: dx / length,
        y: dy / length,
        run: false,
      });
    }
    assert.ok(dist(game.player, point) < 0.05, `Movement stalled at ${key(point)}`);
  }
  assert.ok(dist(game.player, target) <= 1.4);
}

function npc(game: Stichos, id: string) {
  const actor = game.world.npcsAround(0, 0, 24).find((n) => n.id === id);
  assert.ok(actor, id);
  walkTo(game, actor);
  game.interact(id);
  assert.equal(game.dialogue?.npcId, id);
  return actor;
}

function prop(game: Stichos, find: (p: Prop) => boolean) {
  const result = game.world.propsAround(0, 0, 24).find(find);
  assert.ok(result);
  return result;
}

function gather(game: Stichos, p: Prop) {
  walkTo(game, p);
  game.interact(p.id);
  assert.ok(game.removed.has(p.id), p.id);
}

function opening(game: Stichos, choice: 'aid-clinic' | 'aid-brown' = 'aid-clinic') {
  npc(game, 'origin-botanist');
  game.choose('learn-cequin');
  assert.equal(game.storyStage, 1);
  game.choose(choice);
  assert.equal(game.storyStage, 2);
  npc(game, 'origin-archivist');
  game.choose('ask-sallas');
  game.choose('close');
  assert.equal(game.storyStage, 3);
}

test('the opening story consumes gathered materials, repairs a radio, and permits voluntary mental travel without replacing the world', () => {
  const game = new Stichos(3886);
  opening(game);
  assert.equal(game.inventory.cequin ?? 0, 0);
  assert.ok(game.reputation[0] < 0);
  assert.ok(game.reputation[2] > 0);
  assert.equal(game.transferReady, false);
  const resources = game.world
    .propsAround(0, 0, 15)
    .filter((p) => p.id.startsWith('origin:timber:') || p.id.startsWith('origin:ore:'));
  assert.equal(resources.length, 4);
  for (const resource of resources) gather(game, resource);
  assert.equal(game.inventory.wood, 4);
  assert.equal(game.inventory.ore, 4);
  const bench = prop(game, (p) => p.kind === 'workbench' && p.x === 4 && p.y === 5);
  walkTo(game, bench);
  game.craft('lens');
  assert.equal(game.inventory.lens, 1);
  const radio = prop(game, (p) => p.id === 'origin-radio');
  walkTo(game, radio);
  game.interact(radio.id);
  game.choose('repair-radio');
  game.choose('close');
  assert.equal(game.storyStage, 4);
  assert.equal(game.transferReady, true);
  assert.equal(game.inventory.lens ?? 0, 0);
  assert.equal(game.inventory.ore ?? 0, 0);
  assert.equal(game.inventory.wood, 1);
  assert.ok(game.opened.has(radio.id));
  assert.equal(game.phase, 'playing');
  assert.ok(game.quests.find((q) => q.id === 'beyond-the-signal' && !q.complete));
  const shrine = prop(game, (p) => p.kind === 'shrine' && p.x === -2 && p.y === -2);
  walkTo(game, shrine);
  game.rest();
  const before = game.save();
  const candidate = game.transferCandidate!;
  assert.ok(candidate && ['pilgrim', 'refugee', 'guard'].includes(candidate.role));
  game.interact(shrine.id);
  assert.ok(
    game.dialogue?.choices.find((c) => c.id === 'transfer')?.label.includes(candidate.name),
  );
  game.choose('transfer');
  assert.deepEqual({ x: game.player.x, y: game.player.y }, { x: candidate.x, y: candidate.y });
  assert.equal(game.player.bodyName, candidate.name);
  assert.equal(game.player.appearance.coat, candidate.appearance.coat);
  assert.equal(game.player.clan, candidate.clan);
  assert.equal(game.occupiedNpcId, candidate.id);
  assert.ok(
    !game.npcs.some((n) => n.id === candidate.id),
    'the occupied body has no NPC duplicate',
  );
  const priest = game.npcs.find((n) => n.id.startsWith('body:theo-priest:'))!;
  assert.ok(priest, 'the original priest remains a real human in the world');
  assert.deepEqual({ x: priest.x, y: priest.y }, { x: before.player.x, y: before.player.y });
  assert.deepEqual([...game.removed], before.removed);
  assert.deepEqual(game.inventory, before.inventory);
  assert.equal(game.player.name, 'Theo Bishop');
  assert.notDeepEqual(game.player.appearance, before.player.appearance);
  assert.ok(game.drainEvents().some((e) => e.kind === 'transfer'));
  const restored = Stichos.restore(JSON.parse(JSON.stringify(game.save())));
  assert.equal(restored.transferReady, true);
  assert.deepEqual(restored.inventory, game.inventory);
  assert.deepEqual(restored.quests, game.quests);
  assert.deepEqual([...restored.removed], [...game.removed]);
  assert.equal(restored.occupiedNpcId, candidate.id);
  assert.ok(!restored.npcs.some((n) => n.id === candidate.id));
  walkTo(restored, shrine);
  const leaving = { x: restored.player.x, y: restored.player.y };
  assert.equal(
    restored.transferCandidate?.id,
    priest.id,
    'the original priest is a possible return body',
  );
  restored.reincarnate();
  assert.equal(restored.occupiedNpcId, priest.id);
  assert.equal(restored.player.bodyName, 'The priest');
  assert.equal(restored.player.appearance.coat, before.player.appearance.coat);
  const released = restored.npcs.find((n) => n.id === candidate.id)!;
  assert.ok(released, 'leaving a living host releases that person');
  assert.deepEqual({ x: released.x, y: released.y }, leaving);
  assert.ok(!restored.npcs.some((n) => n.id === priest.id));
  assert.equal(Stichos.restore(restored.save()).occupiedNpcId, priest.id);
});

test('an ethical alternative cannot pay twice or invent cequin and has different family consequences', () => {
  const game = new Stichos(8);
  npc(game, 'origin-botanist');
  game.choose('learn-cequin');
  game.use('cequin');
  const coins = game.player.coins;
  game.choose('aid-brown');
  assert.equal(game.storyStage, 1);
  assert.equal(game.player.coins, coins);
  game.choose('close');
  gather(
    game,
    prop(game, (p) => p.kind === 'cequin'),
  );
  npc(game, 'origin-botanist');
  game.choose('learn-cequin');
  game.choose('aid-brown');
  assert.equal(game.player.coins, coins + 12);
  assert.ok(game.reputation[0] > 0 && game.reputation[2] < 0);
  const after = game.save();
  game.choose('aid-brown');
  assert.deepEqual(game.inventory, after.inventory);
  assert.equal(game.player.coins, after.player.coins);
});

test('harvest, pack capacity, consumables and crafting form a finite resource loop', () => {
  const game = new Stichos(19);
  const plant = prop(game, (p) => p.kind === 'heartleaf');
  gather(game, plant);
  assert.equal(game.inventory.heartleaf, 2);
  game.interact(plant.id);
  assert.equal(game.inventory.heartleaf, 2, 'the same plant cannot be gathered twice');
  game.craft('salve');
  assert.equal(game.inventory.heartleaf ?? 0, 0);
  assert.equal(game.inventory.salve, 1);
  game.use('salve');
  assert.equal(game.inventory.salve, 1, 'do not waste medicine at full health');
  game.player.hp = 40;
  game.use('salve');
  assert.equal(game.player.hp, 75);
  assert.equal(game.inventory.salve ?? 0, 0);
  game.use('salve');
  assert.equal(game.player.hp, 75);
  const ore = prop(game, (p) => p.id === 'origin:ore:1');
  walkTo(game, ore);
  game.inventory = { cequin: 59 };
  game.interact(ore.id);
  assert.ok(!game.removed.has(ore.id), 'failed pickup must not destroy the rock');
  game.inventory = { wood: 1, ore: 2 };
  walkTo(game, { x: 0, y: -6 });
  game.craft('lens');
  assert.deepEqual(game.inventory, { wood: 1, ore: 2 }, 'a lens requires a real workbench');
  for (let i = 0; i < 190; i++) game.world.chunk(i + 30, 10);
  assert.ok(game.removed.has(plant.id));
  const restored = Stichos.restore(game.save());
  assert.ok(
    restored.removed.has(plant.id),
    'gathered plants stay gone after chunk eviction and reload',
  );
});

test('merchant transactions revalidate coins, stock in the player pack, and ownership', () => {
  const game = new Stichos(17);
  const merchant = game.world.npcsAround(0, 0, 20).find((n) => n.role === 'merchant')!;
  npc(game, merchant.id);
  const coins = game.player.coins;
  game.choose('buy:cequin');
  assert.equal(game.inventory.cequin, 4);
  assert.equal(game.player.coins, coins - ITEMS.cequin.price);
  game.choose('sell:cequin');
  assert.equal(game.inventory.cequin, 3);
  assert.ok(game.player.coins < coins, 'buy/sell is not an infinite coin exploit');
  game.player.coins = 0;
  const pack = structuredClone(game.inventory);
  game.choose('buy:cequin');
  assert.deepEqual(game.inventory, pack);
  game.choose('close');
  game.equip('bow');
  assert.equal(game.player.appearance.weapon, 'staff');
  game.player.coins = 32;
  game.interact(merchant.id);
  game.choose('weapon:bow');
  game.choose('close');
  game.equip('bow');
  assert.equal(game.player.appearance.weapon, 'bow');
  assert.equal(game.player.coins, 0);
});

test('repeatable botanical supply jobs point at real plots and only reward actual deliveries once', () => {
  const game = new Stichos(43);
  npc(game, 'origin-botanist');
  game.choose('supply:accept');
  game.choose('close');
  const quest = game.quests.find((q) => q.id.startsWith('supply:'))!;
  assert.ok(quest?.target);
  const target = game.world
    .propsAround(quest.target.x, quest.target.y, 1)
    .find(
      (p) =>
        p.x === quest.target!.x &&
        p.y === quest.target!.y &&
        ['cequin', 'heartleaf', 'emberroot'].includes(p.kind),
    );
  assert.ok(target, 'quest target must be an actual generated botanical resource');
  const item = target.kind as 'cequin' | 'heartleaf' | 'emberroot';
  const plants = game.world.propsAround(0, 0, 24).filter((p) => p.kind === item);
  for (const p of plants) {
    if ((game.inventory[item] ?? 0) >= 3) break;
    gather(game, p);
  }
  assert.ok((game.inventory[item] ?? 0) >= 3);
  npc(game, 'origin-botanist');
  const coins = game.player.coins;
  game.choose('supply:deliver');
  assert.equal(game.player.coins, coins + 14);
  assert.equal(quest.complete, true);
  game.choose('supply:deliver');
  assert.equal(game.player.coins, coins + 14);
  game.choose('close');
  game.interact('origin-botanist');
  game.choose('supply:accept');
  assert.equal(game.quests.filter((q) => q.id.startsWith('supply:')).length, 2);
});

function actor(game: Stichos, id: string, x: number, y: number, hostile = true): Npc {
  return {
    id,
    name: id,
    seed: 27,
    x,
    y,
    role: hostile ? 'raider' : 'pilgrim',
    clan: 3,
    appearance: appearance(27, 'raider', 3),
    hp: 50,
    maxHp: 50,
    home: { x, y },
    speed: 0,
    heading: 0,
    phase: 0,
    hostile,
    cooldown: 10,
  };
}

test('directional melee and a stamina-priced ward distinguish targets and persist deaths', () => {
  const game = new Stichos(31);
  const front = actor(game, 'front-raider', game.player.x + 0.7, game.player.y);
  const back = actor(game, 'back-raider', game.player.x - 1, game.player.y);
  const bystander = actor(game, 'innocent', game.player.x, game.player.y + 1, false);
  game.npcs = [front, back, bystander];
  game.attack({ x: game.player.x + 10, y: game.player.y });
  assert.ok(front.hp < 50);
  assert.equal(back.hp, 50);
  assert.equal(bystander.hp, 50);
  const hp = front.hp;
  game.attack(front);
  assert.equal(front.hp, hp, 'attack cooldown is enforced');
  const stamina = game.player.stamina;
  game.ward();
  assert.equal(game.player.stamina, stamina - 30);
  assert.ok(back.hp < 50);
  assert.ok(dist(front, game.player) > 1.3, 'the ward physically repels an attacker');
  assert.equal(bystander.hp, 50, 'defensive ward does not injure a friendly passerby');
  front.hp = 1;
  game.player.attackCooldown = 0;
  game.attack(front);
  assert.equal(front.hp, 0);
  assert.ok(game.removed.has(front.id));
  const restored = Stichos.restore(game.save());
  assert.ok(restored.removed.has(front.id));
  assert.ok(!restored.npcs.some((n) => n.id === front.id));
  game.player.attackCooldown = 0;
  game.player.stamina = 100;
  game.attack(bystander);
  assert.ok(game.reputation[3] < 0);
  assert.equal(bystander.hostile, true);
});

test('long real-input walking crosses chunks continuously with bounded active actors and terrain cache', () => {
  const game = new Stichos(901);
  game.use('cequin');
  const x = game.player.x;
  for (let i = 0; i < 800; i++) game.update(0.1, { x: 0, y: 1, run: false });
  assert.equal(game.phase, 'playing');
  assert.ok(game.player.y > 240);
  assert.equal(game.player.x, x);
  assert.ok(game.distanceTraveled > 235);
  assert.ok(game.visited.size >= 15);
  assert.ok(game.npcs.length <= 64);
  assert.ok(game.world.cacheSize <= 160);
  assert.equal(game.player.name, 'Theo Bishop');
  assert.equal(game.storyStage, 0);
  const saved = game.save();
  assert.ok(
    saved.npcs.length < 10,
    'untouched streamed residents do not accumulate in the permanent save',
  );
  const restored = Stichos.restore(saved);
  assert.deepEqual(restored.player, game.player);
  assert.deepEqual([...restored.visited], [...game.visited]);
});

test('movement normalizes diagonals and cannot tunnel through a solid wall on a delayed frame', () => {
  const a = new Stichos(2),
    b = new Stichos(2);
  a.update(0.1, { x: 1, y: 0, run: false });
  b.update(0.1, { x: 1, y: 1, run: false });
  assert.ok(Math.abs(dist(a.player, a.world.spawn) - dist(b.player, b.world.spawn)) < 1e-8);
  const rock = prop(a, (p) => p.id === 'origin:ore:1');
  walkTo(a, { x: rock.x - 1, y: rock.y });
  // Move onto the adjacent clear center before holding directly into the rock.
  while (a.player.x < rock.x - 1 - 0.02) a.update(0.01, { x: 1, y: 0, run: false });
  a.player.x = rock.x - 1;
  a.player.y = rock.y;
  a.update(60, { x: 1, y: 0, run: true });
  assert.ok(a.player.x < rock.x - 0.7, 'collision radius stops the body before the solid tile');
  const before = structuredClone(a.player);
  a.update(Number.NaN, { x: 1, y: 0, run: false });
  assert.deepEqual(a.player, before);
});

test('save restoration rejects malformed and contradictory state rather than propagating corruption', () => {
  const game = new Stichos(5),
    original = game.save();
  for (const corrupt of [
    null,
    {},
    { ...original, version: 2 },
    { ...original, time: Infinity },
    { ...original, reputation: [0] },
    { ...original, inventory: { cequin: -1 } },
    { ...original, inventory: { cequin: 61 } },
    { ...original, phase: 'lost' },
    { ...original, player: { ...original.player, x: Number.NaN } },
    { ...original, removed: ['same', 'same'] },
  ])
    assert.throws(() => Stichos.restore(corrupt));
  assert.equal(Stichos.restore(original).player.name, 'Theo Bishop');
  const recovered = Stichos.restore(original);
  recovered.inventory.cequin = 0;
  assert.equal(original.inventory.cequin, 3, 'restoring must not alias caller-owned data');
});

test('seeded weapon construction changes real damage, timing, reach and on-hit effects', () => {
  const seen = new Set<string>();
  for (const seed of [3, 8, 19, 31, 46, 57]) {
    const game = new Stichos(seed);
    const profile = game.weaponProfile('staff');
    assert.deepEqual(profile, new Stichos(seed).weaponProfile('staff'));
    seen.add(JSON.stringify(profile));
    const target = actor(game, 'weapon-target', game.player.x + 1, game.player.y);
    target.cooldown = 0;
    game.npcs = [target];
    game.player.breath = 50;
    game.player.warmth = 50;
    game.attack(target);
    assert.equal(target.hp, target.maxHp - profile.damage);
    assert.equal(game.player.attackCooldown, profile.cooldown);
    if (profile.effect === 'stagger') assert.ok(target.cooldown >= 1.35);
    if (profile.effect === 'breath') assert.equal(game.player.breath, 52);
    if (profile.effect === 'warmth') assert.equal(game.player.warmth, 53);
    const restored = Stichos.restore(game.save());
    assert.deepEqual(restored.weaponProfile('staff'), profile);
  }
  assert.ok(seen.size >= 5);
  const game = new Stichos(64);
  game.weapons.add('bow');
  game.equip('bow');
  const target = game.npcs.find((n) => n.role === 'pilgrim')!;
  const damage = game.weaponProfile('bow').damage;
  game.attack(target);
  assert.equal(target.hp, 50, 'a distant bow hit waits for projectile travel');
  for (let i = 0; i < 10; i++) game.update(0.05, still);
  const hit = game.npcs.find((n) => n.id === target.id);
  assert.ok(
    hit && hit.hp === 50 - damage,
    'the arrow travels across open ground and hits a humanoid',
  );
});

test('a large exploration history and distant road position still round-trip without a scene boundary', () => {
  const game = new Stichos(13);
  for (let i = 0; i < 100005; i++) game.visited.add(`${i},0`);
  const save = game.save();
  save.player.x = 1_000_000_010;
  save.player.y = 0;
  save.distanceTraveled = 1_000_000_100;
  const restored = Stichos.restore(save);
  assert.equal(restored.visited.size, game.visited.size);
  assert.equal(restored.player.x, save.player.x);
  assert.equal(restored.distanceTraveled, save.distanceTraveled);
  assert.deepEqual(Stichos.restore(restored.save()).player, restored.player);
});

test('losing a body freezes action and clinic recovery preserves the world before mind travel is unlocked', () => {
  const game = new Stichos(104);
  gather(
    game,
    prop(game, (p) => p.kind === 'cequin'),
  );
  const removed = [...game.removed];
  const inventory = structuredClone(game.inventory);
  const appearanceBefore = structuredClone(game.player.appearance);
  game.player.hp = 0.1;
  game.player.breath = 0;
  game.player.warmth = 0;
  game.player.cequinTime = 0;
  game.update(0.25, still);
  assert.equal(game.phase, 'lost');
  assert.equal(game.player.hp, 0);
  const position = { x: game.player.x, y: game.player.y };
  game.update(0.25, { x: 1, y: 0, run: true });
  game.attack({ x: game.player.x + 1, y: game.player.y });
  assert.deepEqual({ x: game.player.x, y: game.player.y }, position);
  const restored = Stichos.restore(game.save());
  assert.equal(restored.phase, 'lost');
  restored.reincarnate();
  assert.equal(restored.phase, 'playing');
  assert.equal(restored.player.hp, restored.player.maxHp);
  assert.deepEqual(restored.player.appearance, appearanceBefore);
  assert.deepEqual(restored.inventory, inventory);
  assert.deepEqual([...restored.removed], removed);
  assert.equal(restored.storyStage, 0);
  assert.deepEqual({ x: restored.player.x, y: restored.player.y }, restored.world.spawn);
});
