import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import {
  weaponGenome,
  weaponPixels,
  weaponProfileFromGenome,
  technologyWeaponSeed,
  weaponTechnology,
  MAX_WEAPON_SEED,
} from '../src/stichos/equipment.ts';
import { generateLifeCandidate } from '../src/stichos/life-origin.ts';
import { appearance } from '../src/stichos/world.ts';
import type { Npc } from '../src/stichos/types.ts';

const idle = { x: 0, y: 0, run: false };
function merchant(g: Stichos) {
  Object.assign(g.player, { x: -3, y: 2, coins: 250 });
  g.update(0.02, idle);
  g.interact('origin:resident:3');
  assert.equal(g.dialogue?.role, 'merchant');
}

test('ordinary everyday items independently construct every blade, staff and bow form without crown templates', () => {
  const expected = { sword: 5, staff: 5, bow: 4 };
  for (const kind of ['sword', 'staff', 'bow'] as const) {
    const forms = new Set(),
      guards = new Set(),
      grips = new Set(),
      masks = new Set();
    for (let seed = 0; seed < 250; seed++) {
      const g = weaponGenome(seed, kind);
      assert.equal(g.generatorVersion, 2);
      assert.equal(g.parts.version, 2);
      assert.deepEqual(g, weaponGenome(seed, kind));
      const sprite = weaponPixels(g);
      forms.add(g.subtype);
      guards.add(g.parts.guard);
      grips.add(g.parts.grip);
      masks.add(Buffer.from(sprite.pixels.map((v) => (v ? 1 : 0))).toString('base64'));
      if (g.subtype === 'walking pole') {
        assert.equal(g.parts.exposedCore, false);
        assert(
          !sprite.pixels.some((v) => [8, 9, 10].includes(v)),
          'Plain poles have no glowing crown.',
        );
      }
    }
    assert.equal(forms.size, expected[kind]);
    assert.equal(guards.size, 5);
    assert.equal(grips.size, 4);
    assert(masks.size > 160, `${kind} must vary visible shape, not only color.`);
  }
});

test('ordinary functional parts change damage, reach and recovery in the actual equipped profile', () => {
  const base = weaponGenome(991, 'sword');
  const dagger = weaponProfileFromGenome({ ...base, subtype: 'dagger' }, 1);
  const needle = weaponProfileFromGenome({ ...base, subtype: 'needleblade' }, 1);
  const falchion = weaponProfileFromGenome({ ...base, subtype: 'falchion' }, 1);
  assert(needle.range > dagger.range);
  assert(falchion.damage > dagger.damage);
  assert(falchion.cooldown > dagger.cooldown);
  const bow = weaponGenome(992, 'bow'),
    profile = weaponProfileFromGenome(bow, 1);
  const flexible = weaponProfileFromGenome(
    { ...bow, parts: { ...bow.parts, flex: bow.parts.flex * 1.6 } },
    1,
  );
  assert(flexible.range > profile.range);
  assert(flexible.damage > profile.damage);
});

test('a real merchant sells a specific deterministic construction that survives equip, save and switching kinds', () => {
  let g = new Stichos(3886);
  const inherited = g.weaponSeed('staff');
  merchant(g);
  const stock = g.merchantWeaponStock('origin:resident:3');
  assert.equal(stock.length, 3);
  const sword = stock.find((w) => w.kind === 'sword')!;
  const before = g.player.coins;
  g.choose('weapon:sword');
  assert.equal(g.player.coins, before - sword.price);
  assert.equal(g.weaponInventory.length, 2);
  const id = `ordinary:sword:${sword.seed}`;
  assert(g.equipWeapon(id).ok);
  assert.equal(g.weaponSeed('sword'), sword.seed);
  assert.equal(g.displayAppearance.weaponSeed, sword.seed);
  assert.deepEqual(g.weaponProfile('sword'), g.weaponInventory.find((w) => w.id === id)!.profile);
  assert(g.equipWeapon('base:staff').ok);
  assert.equal(g.weaponSeed('staff'), inherited);
  g.equip('sword');
  assert.equal(g.weaponSeed('sword'), sword.seed);
  g = Stichos.restore(g.save());
  assert.equal(g.displayAppearance.weaponSeed, sword.seed);
  assert.equal(g.weaponInventory.find((w) => w.id === id)?.equipped, true);
  assert(g.equipWeapon('base:staff').ok);
  assert.equal(g.weaponSeed('staff'), inherited);
  merchant(g);
  const coins = g.player.coins;
  g.choose('weapon:sword');
  assert.equal(g.player.coins, coins, 'A sold construction cannot be bought twice.');
  const saved = g.save();
  for (const mutation of [
    (s: typeof saved) => {
      s.ordinaryEquipment![0].designs[0].version = 99 as 2;
    },
    (s: typeof saved) => {
      s.ordinaryEquipment![0].designs[0].seed ^= 1;
    },
    (s: typeof saved) => {
      s.ordinaryEquipment![0].designs.push({ ...s.ordinaryEquipment![0].designs[0] });
    },
    (s: typeof saved) => {
      s.ordinaryEquipment![0].selected.sword = 123;
    },
  ]) {
    const bad = structuredClone(saved);
    mutation(bad);
    assert.throws(() => Stichos.restore(bad));
  }
});

test('actual combat recovers an enemy construction alongside a bought blade without overwriting it', () => {
  let g = new Stichos(3886);
  merchant(g);
  g.choose('weapon:sword');
  g.choose('close');
  const bought = g.weaponInventory.find((w) => w.source === 'merchant')!;
  assert(g.equipWeapon(bought.id).ok);
  const enemy: Npc = {
    id: 'ordinary-test-raider',
    seed: 897,
    name: 'A hostile scavenger',
    role: 'raider',
    clan: 3,
    appearance: { ...appearance(897, 'raider', 3), weapon: 'sword', weaponSeed: 98167 },
    x: g.player.x + 0.65,
    y: g.player.y,
    home: { x: g.player.x + 0.65, y: g.player.y },
    hp: 2,
    maxHp: 50,
    hostile: true,
    speed: 0,
    heading: 0,
    phase: 0,
    cooldown: 10,
  };
  g.npcs = [enemy];
  g.attack(enemy);
  assert.equal(enemy.hp, 0);
  const loot = g.weaponInventory.find((w) => w.source === 'loot')!;
  assert(loot);
  assert.equal(loot.seed, 98167);
  assert.equal(g.weaponInventory.filter((w) => w.kind === 'sword').length, 2);
  assert(g.equipWeapon(bought.id).ok);
  assert.equal(g.weaponSeed('sword'), bought.seed);
  assert(g.equipWeapon(loot.id).ok);
  assert.equal(g.displayAppearance.weaponSeed, loot.seed);
  g = Stichos.restore(g.save());
  assert.equal(g.weaponInventory.filter((w) => w.kind === 'sword').length, 2);
  assert.equal(g.displayAppearance.weaponSeed, loot.seed);
});

test('civilian origins can have empty hands and do not conjure a staff in inventory, attacks or restoration', () => {
  let index = 0;
  while (index < 60 && generateLifeCandidate(3886, index).appearance.weapon !== 'none') index++;
  assert(index < 60);
  let g = new Stichos(3886);
  assert(g.acceptLife(index).ok);
  assert.equal(g.player.appearance.weapon, 'none');
  assert.equal(g.weapons.size, 0);
  const stamina = g.player.stamina;
  g.attack({ x: g.player.x + 1, y: g.player.y });
  assert.equal(g.player.stamina, stamina);
  assert.equal(g.player.attackCooldown, 0);
  assert.equal(g.weaponInventory.length, 0);
  g = Stichos.restore(g.save());
  assert.equal(g.displayAppearance.weapon, 'none');
  assert.equal(g.weapons.size, 0);
  assert(g.tools.length > 0, 'Working life keeps its actual profession tools.');
});

test('technology addresses preserve old seeds and generate connected primitive, mechanical and electronic equipment', () => {
  assert.equal(weaponTechnology(0xffffffff), null);
  for (const bad of [MAX_WEAPON_SEED + 1, NaN, 1.5]) assert.throws(() => weaponTechnology(bad));
  const forms = new Set<string>();
  for (const tier of [0, 1, 2, 3] as const)
    for (const kind of ['staff', 'sword', 'bow'] as const)
      for (let source = 0; source < 80; source++) {
        const address = technologyWeaponSeed(source, tier),
          g = weaponGenome(address, kind),
          sprite = weaponPixels(g);
        assert.equal(weaponTechnology(address), tier);
        assert.equal(address % 0x100000000, source);
        assert.deepEqual(g, weaponGenome(address, kind));
        assert.equal(g.technology, tier);
        forms.add(g.subtype);
        const solid = [...sprite.pixels].flatMap((v, i) => (v ? [i] : [])),
          queue = [solid[0]],
          seen = new Set(queue);
        for (let i = 0; i < queue.length; i++)
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const x = (queue[i] % 32) + dx,
              y = Math.floor(queue[i] / 32) + dy,
              p = y * 32 + x;
            if (x >= 0 && x < 32 && y >= 0 && y < 64 && sprite.pixels[p] && !seen.has(p)) {
              seen.add(p);
              queue.push(p);
            }
          }
        assert.equal(seen.size, solid.length, `${g.subtype} components must connect.`);
        if (tier === 3 && kind === 'bow')
          assert(['coilcaster', 'rail carbine', 'pulse thrower'].includes(g.subtype));
        if (tier === 2 && kind === 'bow')
          assert(['crossbow', 'repeating crossbow', 'spring launcher'].includes(g.subtype));
        if (tier === 3) assert(!g.material.includes('Sallas'));
      }
  assert(forms.size >= 29);
});

test('electronic world merchants sell actual encoded ranged equipment and preserve it through reload', () => {
  let g = new Stichos(8, 4);
  merchant(g);
  const stock = g.merchantWeaponStock('origin:resident:3').find((w) => w.kind === 'bow')!;
  assert(stock.seed > 0xffffffff);
  assert.equal(weaponTechnology(stock.seed), 3);
  assert(/coilcaster|rail carbine|pulse thrower/.test(stock.profile.name));
  g.choose('weapon:bow');
  g.choose('close');
  const item = g.weaponInventory.find((w) => w.kind === 'bow')!;
  assert(g.equipWeapon(item.id).ok);
  assert.equal(g.displayAppearance.weaponSeed, stock.seed);
  g.equip('bow');
  assert.equal(g.displayAppearance.weaponSeed, stock.seed);
  g = Stichos.restore(g.save());
  assert.equal(g.displayAppearance.weaponSeed, stock.seed);
  assert.equal(g.weaponProfile('bow').name, stock.profile.name);
});

test('a real electronic workshop crafts the world technology using its exact physical component preview', () => {
  let g = new Stichos(8, 4);
  Object.assign(g.player, { x: 4, y: 5, coins: 250 });
  g.inventory = { wood: 20, ore: 20, cequin: 8, heartleaf: 8, emberroot: 8 };
  g.progression.xp.crafting = 160;
  const recipe = {
    kind: 'bow' as const,
    material: 1 as const,
    core: 'breath' as const,
    span: 'long' as const,
  };
  const preview = g.forgePreview(recipe);
  assert(preview.ok, preview.message);
  assert.equal(preview.construction!.recipe.technology, 3);
  assert.equal(preview.construction!.genome.technology, 3);
  assert(/coilcaster|rail carbine|pulse thrower/.test(preview.construction!.profile.name));
  const coins = g.player.coins;
  assert(g.forge(recipe).ok);
  assert.equal(g.player.coins, coins - preview.construction!.cost.coins);
  assert.equal(g.displayAppearance.weaponSeed, preview.construction!.seed);
  assert.deepEqual(g.weaponProfile('bow'), preview.construction!.profile);
  g = Stichos.restore(g.save());
  assert.equal(g.displayAppearance.weaponSeed, preview.construction!.seed);
  assert.equal(g.save().forgedWeapons[0].recipe.technology, 3);
});
