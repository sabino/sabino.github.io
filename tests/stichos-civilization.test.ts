import test from 'node:test';
import assert from 'node:assert/strict';
import {
  civilizationFor,
  civilizationTechnologyTier,
  civilizationPersonName,
  civilizationPlaceName,
} from '../src/stichos/civilization.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { weaponTechnology, weaponGenome } from '../src/stichos/equipment.ts';

const canonicalSeed = 0x53544943;

test('civilization identity and continuous axes reconstruct solely from world seed, independent of cache order', () => {
  const before = civilizationFor(71);
  assert.deepEqual(civilizationFor(71), before);
  const identities = new Set<string>(),
    axes = new Set<string>(),
    tiers = new Set<number>();
  const combinations = new Set<string>();
  for (let seed = 0; seed < 512; seed++) {
    const p = civilizationFor(seed);
    identities.add(p.name);
    axes.add(JSON.stringify(p.axes));
    tiers.add(civilizationTechnologyTier(p));
    for (const v of Object.values(p.axes)) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v));
    combinations.add(
      `${p.axes.technology > 0.5}:${p.axes.organics > 0.5}:${p.axes.spirituality > 0.5}`,
    );
    assert.equal(p.factions.length, 6);
    assert.equal(new Set(p.factions.map((f) => f.name)).size, 6);
    assert.ok(p.factions.every((f, i) => f.id === i && /^#[\da-f]{6}$/i.test(f.color)));
    assert.ok(
      !/Theo|Sallas|Stíchos|Stíchoi|Vespera|Orlando/.test(JSON.stringify(p)),
      'canonical lore must not define arbitrary planets',
    );
  }
  assert.ok(identities.size > 500);
  assert.equal(axes.size, 512);
  assert.deepEqual([...tiers].sort(), [0, 1, 2, 3]);
  assert.equal(combinations.size, 8, 'technology, biology and religion must combine independently');
  assert.deepEqual(
    civilizationFor(71),
    before,
    'bounded cache eviction must not change a civilization',
  );
  const altered = civilizationFor(71);
  altered.factions[0].name = 'LOCAL MUTATION';
  altered.axes.technology = 0;
  assert.deepEqual(
    civilizationFor(71),
    before,
    'one caller cannot rewrite another browser’s deterministic profile',
  );
});

test('Stíchos is an explicit canonical planet, while older generators retain their original families and labels', () => {
  const p = civilizationFor(canonicalSeed);
  assert.equal(p.canonical, true);
  assert.equal(p.name, 'Stíchos');
  assert.equal(p.originCityName, 'Vespera');
  assert.deepEqual(
    p.factions.map((f) => f.name),
    ['Brown', 'Sallas', 'Veyr', 'Ordel', 'Meren', 'Caldris'],
  );
  assert.equal(p.lexicon.radio, 'Long-range radio');
  for (const generation of [1, 2, 3] as const) {
    const world = new InfiniteWorld(71, generation);
    assert.equal(world.civilization, undefined);
    assert.equal(world.clans[1].name, 'Sallas');
    assert.equal(world.settlementsAround(0, 0, 1)[0].name, 'Vespera');
  }
  const world = new InfiniteWorld(canonicalSeed, 4);
  assert.equal(world.clans[1].name, 'Sallas');
  assert.equal(world.settlementsAround(0, 0, 1)[0].name, 'Vespera');
});

test('medieval and electronic civilizations change actual buildings, terminals, professions, factions and residents', () => {
  for (const [seed, tier, terminal, workshop] of [
    [1, 1, 'Resonance beacon', 'Artisan forge'],
    [8, 3, 'Memory-network terminal', 'Fabrication atelier'],
  ] as const) {
    const world = new InfiniteWorld(seed, 4),
      profile = civilizationFor(seed),
      origin = world.settlementsAround(0, 0, 1)[0];
    assert.equal(civilizationTechnologyTier(profile), tier);
    assert.equal(origin.name, profile.originCityName);
    assert.deepEqual(world.clans, profile.factions);
    assert.ok(
      world.clans.every(
        (c) => !['Brown', 'Sallas', 'Veyr', 'Ordel', 'Meren', 'Caldris'].includes(c.name),
      ),
    );
    const props = world.propsAround(0, 0, 24);
    assert.equal(props.find((p) => p.id === 'origin-radio')!.name, terminal);
    assert.ok(
      props.some((p) => p.kind === 'door' && p.name.includes(workshop)),
      'generated building function must be represented by its actual entrance',
    );
    assert.equal(props.find((p) => p.id === 'origin:cequin')!.name, profile.lexicon.cequin);
    assert.equal(
      props.find((p) => p.id === 'origin:banner')!.name,
      profile.factions[0].name + ' standard',
    );
    for (const npc of world.npcsAround(0, 0, 24)) {
      assert.equal(npc.name, civilizationPersonName(profile, npc.seed));
      assert.equal(npc.appearance.trim, profile.factions[npc.clan].color);
      if (npc.appearance.weapon !== 'none') {
        assert.equal(weaponTechnology(npc.appearance.weaponSeed!), tier);
        const g = weaponGenome(npc.appearance.weaponSeed!, npc.appearance.weapon);
        assert.equal(g.technology, tier);
        if (tier === 3)
          assert.ok(
            /coil|rail|pulse|vibro|arc|phase|probe|baton|induction/.test(g.subtype),
            g.subtype,
          );
      }
    }
    assert.ok(!/Stíchos|Sallas|Theo|Vespera/.test(JSON.stringify(world.chunk(0, 0))));
    const architecture = origin.architecture!;
    assert.ok(Math.abs(architecture.technology! - profile.axes.technology) <= 0.061);
    assert.equal(architecture.eraName, profile.eraName);
    assert.equal(architecture.organics, profile.axes.organics);
    if (tier === 1) {
      assert.equal(architecture.wallMaterial, 'stone');
      assert.equal(architecture.motif, 'carved');
    } else {
      assert.equal(architecture.wallMaterial, 'glass');
      assert.equal(architecture.motif, 'grown');
      assert.ok(architecture.illumination! > 0.7);
    }
  }
});

test('technology overlays local ecological architecture instead of replacing climates with a genre preset', () => {
  const world = new InfiniteWorld(71, 4),
    profile = world.civilization!;
  const towns = world.settlementsAround(0, 0, 2048);
  assert.equal(world.cacheSize, 0);
  assert.deepEqual([...new Set(towns.map((t) => t.architecture!.style))].sort(), [
    'adobe',
    'alpine',
    'basalt',
    'gothic',
    'stilt',
    'timber',
  ]);
  for (const town of towns) {
    const a = town.architecture!;
    assert.ok(a.technology! > 0.9);
    assert.equal(a.motif, 'circuit');
    assert.equal(a.illumination, profile.axes.illumination);
    assert.equal(a.accentColor, world.clans[town.clan].color);
    if (a.style === 'stilt') assert.equal(a.raised, true);
    if (a.style === 'alpine') assert.equal(a.roof, 'steep');
    if (town.id !== 'origin') assert.equal(town.name, civilizationPlaceName(profile, town.seed));
  }
  assert.notEqual(profile.politics.governance, civilizationFor(8).politics.governance);
  assert.ok(
    profile.axes.spirituality > 0.9 && profile.axes.organics < 0.1,
    'a networked religious society differs from the organic network on seed8',
  );
});
