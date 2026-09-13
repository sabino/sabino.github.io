import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  renderLivingSystemsPanel,
  livingHeraldry,
  type LivingSystemsUiState,
} from '../src/stichos/living-systems-ui.ts';
import type { LivingSystemsFrame } from '../src/stichos/living-systems.ts';
import { FIELD_RECIPES } from '../src/stichos/field-loot.ts';
import type { Estate } from '../src/stichos/property-world.ts';

const state = (
  section: LivingSystemsUiState['section'],
  more: Partial<LivingSystemsUiState> = {},
): LivingSystemsUiState => ({ section, page: 0, message: '', busy: false, ...more });
function fixture(): LivingSystemsFrame {
  const at = { spaceId: 'surface', x: 1, y: 1 };
  const estate: Estate = {
    id: 'real:house',
    ownerId: 'alice',
    offer: {
      ...at,
      id: 'real:house',
      name: 'Alder & Hearth',
      kind: 'home',
      settlementId: 'town:1',
      seed: 3,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      entrance: at,
      vacant: false,
      rentable: true,
    },
    tenure: 'owned',
    acquiredAt: 0,
    locked: true,
    guests: [],
    storage: { coins: 8, items: { wood: 6, planks: 2 } },
    stations: [
      {
        ...at,
        id: 'real:sawmill',
        kind: 'sawmill',
        workerId: 'person:1',
        produced: 1,
        workingSeconds: 24,
        status: 'Walking: finished goods',
        job: {
          id: 1,
          recipe: 'saw-boards',
          remaining: 1,
          completed: 1,
          elapsed: 12,
          reserved: { wood: 3 },
          wageFunded: false,
        },
      },
    ],
    furnishings: 1,
    lastRestAt: -100,
    revision: 7,
    salesDay: 1,
    dailySales: 0,
  };
  return {
    version: 1,
    elapsed: 3,
    economy: {
      version: 1,
      satchel: {
        actorId: 'alice',
        coins: 24,
        items: { wood: 8, fiber: 3, stone: 4, 'field-knife': 1 },
        capacity: 24,
        lastHuntAt: -1,
        lastGatherAt: -1,
      },
      drops: [
        {
          ...at,
          id: 'drop:real',
          sourceId: 'wolf:1',
          name: 'Fallen wolf',
          kind: 'wolf',
          rarity: 'uncommon',
          bundle: { coins: 0, items: { meat: 2, hide: 1 } },
          eligible: ['alice'],
          createdAt: 0,
          exclusiveUntil: 90,
          expiresAt: 1800,
          protected: false,
          harvest: true,
        },
      ],
      saturated: false,
    },
    actors: [],
    signs: [],
    town: null,
    laws: null,
    factions: [],
    memberships: [],
    duties: [],
    reputation: null,
    guards: [],
    offers: [estate.offer],
    property: {
      version: 1,
      estates: [estate],
      workers: [
        {
          id: 'person:1',
          ownerId: 'alice',
          estateId: estate.id,
          name: 'Mara',
          home: at,
          specialty: 'sawmill',
          competence: 1,
          loyalty: 68,
          nightShift: false,
          hiredAt: 0,
          lastStepAt: 3,
          stationId: 'real:sawmill',
          phase: 'carrying-output',
          cargo: { coins: 0, items: { planks: 2 } },
          status: 'Walking to storage',
          address: at,
        },
      ],
      saturated: false,
    },
    home: at,
    diagnostics: {},
  } as unknown as LivingSystemsFrame;
}

test('four accessible tabs retain a usable close action while authority is busy', () => {
  const built = renderLivingSystemsPanel(fixture(), state('field', { busy: true }));
  assert.equal((built.html.match(/role="tab" /g) ?? []).length, 4);
  assert.match(built.html, /role="tabpanel"/);
  assert.match(built.html, /role="status" aria-live="polite"/);
  const closeId = [...built.actions].find(([, a]) => a.kind === 'close')![0];
  const closeTag = built.html.match(
    new RegExp(`<button[^>]*data-living-action="${closeId}"[^>]*>`),
  )![0];
  assert.doesNotMatch(closeTag, / disabled/);
  assert.match(built.html, /aria-busy="true"/);
});

test('all generated text is escaped; no command JSON, script, external art or inline event handlers leak into markup', () => {
  const f = fixture();
  f.economy.drops[0].name = '<img src=x onerror="steal()">';
  const built = renderLivingSystemsPanel(f, state('field', { message: '<script>bad()</script>' }));
  assert.match(built.html, /&lt;img/);
  assert.match(built.html, /&lt;script/);
  assert.doesNotMatch(built.html, /<script|<img|onclick=|data-command=/);
  const claim = [...built.actions.values()].find(
    (a) => a.kind === 'command' && a.command.kind === 'claim',
  );
  assert.deepEqual(claim, { kind: 'command', command: { kind: 'claim', targetId: 'drop:real' } });
});

test('recipe catalog is paginated and details use actual station/material/reward definitions', () => {
  const f = fixture();
  const first = renderLivingSystemsPanel(f, state('field', { view: 'craft' }));
  assert.equal((first.html.match(/<article class="v-living-row">/g) ?? []).length, 4);
  assert.match(first.html, /Page 1 of/);
  const next = renderLivingSystemsPanel(f, state('field', { view: 'craft', page: 1 }));
  assert.doesNotMatch(next.html, new RegExp(`<strong>${FIELD_RECIPES[0].name}</strong>`));
  const r = FIELD_RECIPES.find((r) => r.id === 'spear')!;
  const detail = renderLivingSystemsPanel(f, state('field', { detail: `recipe:${r.id}` }));
  assert.match(detail.html, /workshop/);
  assert.match(detail.html, /Carving bone/);
  assert.ok(
    [...detail.actions.values()].some(
      (a) => a.kind === 'command' && a.command.kind === 'craft' && a.command.recipeId === 'spear',
    ),
  );
});

test('estate home, storage, work and station flows bind real owner and worker identifiers', () => {
  const f = fixture();
  const home = renderLivingSystemsPanel(f, state('estates', { detail: 'real:house' }));
  assert.match(home.html, /Alder &amp; Hearth/);
  assert.ok([...home.actions.values()].some((a) => a.kind === 'travel' && a.address.x === 1));
  const storage = renderLivingSystemsPanel(
    f,
    state('estates', { detail: 'real:house', view: 'storage' }),
  );
  assert.match(storage.html, /name="direction"/);
  assert.match(storage.html, /name="quantity"/);
  assert.match(storage.html, /Estate cashbox/);
  const station = renderLivingSystemsPanel(
    f,
    state('estates', { detail: 'real:house', view: 'station:real:sawmill' }),
  );
  assert.match(station.html, /Mara/);
  assert.match(station.html, /<progress/);
  assert.ok(
    [...station.actions.values()].some(
      (a) =>
        a.kind === 'command' &&
        a.command.kind === 'property' &&
        a.command.command.kind === 'unassign' &&
        a.command.command.npcId === 'person:1',
    ),
  );
  assert.ok(
    [...station.actions.values()].some(
      (a) =>
        a.kind === 'command' &&
        a.command.kind === 'property' &&
        a.command.command.kind === 'cancel-job' &&
        a.command.command.stationId === 'real:sawmill',
    ),
  );
});

test('demolition uses a concrete revision confirmation and occupied property cannot be purchased', () => {
  const f = fixture();
  const e = f.property.estates[0] as Estate;
  delete e.stations[0].workerId;
  delete e.stations[0].job;
  const station = renderLivingSystemsPanel(
    f,
    state('estates', { detail: e.id, view: 'station:real:sawmill' }),
  );
  const confirm = [...station.actions.values()].find((a) => a.kind === 'confirm');
  assert.ok(confirm && confirm.kind === 'confirm');
  assert.deepEqual(confirm.command, {
    kind: 'property',
    command: { kind: 'demolish', propertyId: e.id, stationId: 'real:sawmill', confirmRevision: 7 },
  });
  const pending = renderLivingSystemsPanel(f, state('estates', { confirmation: confirm }));
  assert.match(pending.html, /Confirm this action/);
  f.property.estates = [];
  const offered = renderLivingSystemsPanel(f, state('estates', { detail: e.id }));
  const buy = [...offered.actions].find(
    ([, a]) =>
      a.kind === 'command' && a.command.kind === 'property' && a.command.command.kind === 'acquire',
  )![0];
  assert.match(offered.html, new RegExp(`data-living-action="${buy}"[^>]*disabled`));
});

test('guild presentation requires an actual contact; heraldry is labelled and invented join benefits are absent', () => {
  const f = fixture();
  const heraldry = {
    shape: 'shield',
    symbol: 'hammer',
    pattern: 'chevron',
    color: '#4f7666',
    ink: '#eee2bb',
    label: 'Joiners hammer',
  } as const;
  f.factions = [
    {
      id: 'guild:real',
      settlementId: 'town:1',
      clan: 0,
      purpose: 'craft',
      name: 'The Needlewrights',
      heraldry,
      entryCost: { coins: 4, items: { wood: 2 } },
      dues: 3,
      ranks: ['Apprentice', 'Keeper'],
      principles: 'Repair before replacing.',
      benefits: ['Workshop instruction'],
    },
  ];
  f.memberships = [
    {
      actorId: 'alice',
      factionId: 'guild:real',
      discovered: true,
      status: 'visitor',
      rank: 0,
      standing: 0,
      completed: 0,
      lastDutyDay: 0,
      duesThroughDay: 0,
      joinedAt: 0,
      trust: 0,
      reconciliationCount: 0,
      remembered: [],
    },
  ];
  const closed = renderLivingSystemsPanel(f, state('charters', { detail: 'guild:real' }));
  const join = [...closed.actions].find(
    ([, a]) => a.kind === 'command' && a.command.kind === 'guild' && a.command.action === 'join',
  )![0];
  assert.match(closed.html, new RegExp(`data-living-action="${join}"[^>]*disabled`));
  assert.match(closed.html, /No unoccupied guild contact/);
  Object.assign(f, {
    contacts: [{ factionId: 'guild:real', npcId: 'person:actual', name: 'Iven' }],
  });
  const ready = renderLivingSystemsPanel(f, state('charters', { detail: 'guild:real' }));
  assert.ok(
    [...ready.actions.values()].some(
      (a) =>
        a.kind === 'command' && a.command.kind === 'guild' && a.command.npcId === 'person:actual',
    ),
  );
  assert.match(
    livingHeraldry(heraldry),
    /role="img" aria-label="Joiners hammer; shield, chevron, hammer"/,
  );
  assert.doesNotMatch(ready.html, /damage bonus|free weapon|unlimited/i);
});

test('sign details include real service/access/warning copy and the same navigable world address', () => {
  const f = fixture();
  f.signs = [
    {
      id: 'sign:real',
      symbol: 'home',
      mapSymbol: 'home',
      spaceId: 'surface',
      x: 7,
      y: 8,
      title: 'West gate',
      compactTitle: 'West gate',
      subtitle: 'Owned by the town',
      lines: [
        { key: 'hours', text: 'Open from dawn to dusk', kind: 'access' },
        { key: 'warning', text: 'Protected breeding ground', kind: 'warning' },
      ],
      inspectDistance: 3,
      accessibleLabel: 'West gate. Hours and wildlife law.',
    },
  ];
  const built = renderLivingSystemsPanel(f, state('signs', { detail: 'sign:real' }));
  assert.match(built.html, /Open from dawn to dusk/);
  assert.match(built.html, /Protected breeding ground/);
  assert.ok(
    [...built.actions.values()].some(
      (a) => a.kind === 'travel' && a.address.x === 7 && a.address.y === 8,
    ),
  );
});

test('portrait CSS guarantees bounded columns, readable inputs, touch controls and reduced motion', () => {
  const css = readFileSync(
    new URL('../src/stichos/living-systems-ui.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /env\(safe-area-inset/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(css, /overscroll-behavior: contain/);
});

test('the underworld entrance is reachable through Field and commands bind real entrances within authority reach', () => {
  const f = fixture();
  f.location = { spaceId: 'surface', x: 1, y: 1 };
  f.underground = null;
  f.entrances = [
    { settlementId: 'town:near', name: 'Old waterworks', spaceId: 'surface', x: 2, y: 1 },
    { settlementId: 'town:far', name: 'Distant archive', spaceId: 'surface', x: 20, y: 1 },
  ];
  f.pendingSalvage = [];
  const built = renderLivingSystemsPanel(f, state('field', { view: 'underworld' }));
  assert.match(built.html, /Beneath the settlements/);
  assert.match(built.html, /aria-current="page"/);
  assert.equal((built.html.match(/role="tab" /g) ?? []).length, 4);
  for (const [target, disabled] of [
    ['town:near', false],
    ['town:far', true],
  ] as const) {
    const entry = [...built.actions].find(
      ([, a]) =>
        a.kind === 'command' &&
        a.command.kind === 'underworld-enter' &&
        a.command.settlementId === target,
    )!;
    const tag = built.html.match(
      new RegExp(`<button[^>]*data-living-action="${entry[0]}"[^>]*>`),
    )![0];
    assert.equal(tag.includes(' disabled'), disabled);
    assert.deepEqual(entry[1], {
      kind: 'command',
      command: { kind: 'underworld-enter', settlementId: target },
    });
  }
  assert.ok(
    [...built.actions.values()].some(
      (a) => a.kind === 'travel' && a.address.spaceId === 'surface' && a.address.x === 20,
    ),
  );
});

function undergroundFixture() {
  const f = fixture();
  f.location = { spaceId: 'underground:town:1:0', x: 10, y: 10 };
  f.entrances = [];
  f.pendingSalvage = [];
  f.rescued = [];
  f.unlocks = [];
  f.underground = {
    settlementId: 'town:1',
    depth: 0,
    spaceId: f.location.spaceId,
    name: 'The Turning Cistern',
    biome: 'Drowned machinery',
    material: 'stone',
    width: 58,
    height: 44,
    features: [
      {
        id: 'return:actual',
        kind: 'up',
        name: 'Return stair',
        description: 'This stair returns to the surface.',
        x: 4,
        y: 10,
      },
      {
        id: 'rune:actual',
        kind: 'rune',
        name: 'Amber control',
        description: 'The archive inscription describes this control.',
        x: 11,
        y: 10,
        value: 1,
      },
      {
        id: 'hearth:actual',
        kind: 'rest',
        name: 'Sheltered hearth',
        description: 'Rest while no threat is close.',
        x: 8,
        y: 10,
      },
      {
        id: 'cache:actual',
        kind: 'cache',
        name: 'Provision locker',
        description: 'Recovered supplies.',
        x: 20,
        y: 10,
      },
      {
        id: 'survivor:actual',
        kind: 'survivor',
        name: 'Stranded mason',
        description: 'Defeat the overseer first.',
        x: 21,
        y: 10,
      },
      {
        id: 'trap:actual',
        kind: 'trap',
        name: 'Pressure vent',
        description: 'A bright rim warns before release.',
        x: 18,
        y: 11,
      },
    ],
    objective: 'Read the archive inscription and align its three controls.',
    state: {
      spaceId: f.location.spaceId,
      opened: [],
      rescued: [],
      discovered: [0, 1, 2],
      puzzle: 1,
      enemies: [
        {
          id: 'keeper:actual',
          kind: 'boss',
          name: 'Cistern keeper',
          x: 18,
          y: 10,
          hp: 110,
          maxHp: 220,
          heading: 0,
          phase: 2,
          state: 'windup',
          remaining: 0.6,
          intent: { shape: 'cone', heading: 0, range: 4, duration: 0.6 },
        },
      ],
    },
    projectiles: [],
    time: 50,
  };
  return f;
}

test('underground pages present authority-known features, a return direction and boss warnings without generating a map', () => {
  const f = undergroundFixture();
  const built = renderLivingSystemsPanel(f, state('field', { view: 'underworld' }));
  assert.match(built.html, /The Turning Cistern/);
  assert.match(built.html, /Floor 1 of 3/);
  assert.match(built.html, /3 rooms explored/);
  assert.match(built.html, /6.0 tiles west/);
  assert.match(built.html, /110 \/ 220 health/);
  assert.match(built.html, /Attack warning/);
  assert.match(built.html, /<progress[^>]*aria-label="Cistern keeper health"/);
  assert.equal((built.html.match(/<article class="v-living-row">/g) ?? []).length, 4);
  assert.match(built.html, /Page 1 of 2/);
  const use = [...built.actions.values()].filter(
    (a) => a.kind === 'command' && a.command.kind === 'underworld-interact',
  );
  assert.ok(
    use.some(
      (a) =>
        a.kind === 'command' &&
        a.command.kind === 'underworld-interact' &&
        a.command.targetId === 'rune:actual',
    ),
  );
  assert.ok(
    !use.some(
      (a) =>
        a.kind === 'command' &&
        a.command.kind === 'underworld-interact' &&
        a.command.targetId === 'cache:actual',
    ),
  );
  const next = renderLivingSystemsPanel(f, state('field', { view: 'underworld', page: 1 }));
  assert.equal((next.html.match(/<article class="v-living-row">/g) ?? []).length, 2);
});

test('inspecting an underground place preserves its exact ID and disables distant or completed actions', () => {
  const f = undergroundFixture();
  const close = renderLivingSystemsPanel(
    f,
    state('field', { view: 'underworld', detail: 'rune:actual' }),
  );
  assert.match(close.html, /1 of 3 controls aligned/);
  assert.match(close.html, /Read the inscription/);
  const far = renderLivingSystemsPanel(
    f,
    state('field', { view: 'underworld', detail: 'cache:actual' }),
  );
  const [id, action] = [...far.actions].find(
    ([, a]) => a.kind === 'command' && a.command.kind === 'underworld-interact',
  )!;
  assert.deepEqual(action, {
    kind: 'command',
    command: { kind: 'underworld-interact', targetId: 'cache:actual' },
  });
  assert.match(far.html, new RegExp(`data-living-action="${id}"[^>]*disabled`));
  f.location.x = 20;
  f.underground!.state.opened.push('cache:actual');
  const done = renderLivingSystemsPanel(
    f,
    state('field', { view: 'underworld', detail: 'cache:actual' }),
  );
  assert.match(done.html, /Already completed/);
  assert.match(done.html, /Your exploration has already changed this place/);
});

test('pending salvage and actual consumables bind atomic authority commands without invented rewards', () => {
  const f = undergroundFixture();
  f.economy.satchel.items.ration = 2;
  f.economy.satchel.items.bandage = 1;
  f.economy.satchel.items['ward-kit'] = 1;
  f.consumables = [
    { item: 'ration', quantity: 2, description: 'Restore stamina.' },
    { item: 'bandage', quantity: 1, description: 'Restore health.' },
    { item: 'ward-kit', quantity: 1, description: 'Apply a protective ward.' },
  ];
  f.pendingSalvage = [
    {
      id: 'reward:real',
      kind: 'reward',
      actorId: 'alice',
      sourceId: 'cache:actual',
      bundle: { coins: 7, items: { crystal: 2 } },
      spaceId: f.location.spaceId,
      x: 20,
      y: 10,
    },
  ];
  const built = renderLivingSystemsPanel(f, state('field', { view: 'underworld' }));
  assert.match(built.html, /earned bundle/);
  assert.match(built.html, /7 coins/);
  assert.ok(
    [...built.actions.values()].some(
      (a) => a.kind === 'command' && a.command.kind === 'underworld-rewards',
    ),
  );
  for (const item of ['ration', 'bandage', 'ward-kit'] as const)
    assert.ok(
      [...built.actions.values()].some(
        (a) => a.kind === 'command' && a.command.kind === 'consume' && a.command.item === item,
      ),
    );
  const detail = renderLivingSystemsPanel(f, state('field', { detail: 'item:ward-kit' }));
  assert.match(detail.html, /Apply a protective ward/);
  assert.match(detail.html, /Use Bone and crystal ward/);
});

test('dungeon text is escaped and field kit help explains owned tool selection without promising inactive guild perks', () => {
  const f = undergroundFixture();
  f.underground!.features[0].name = '<img src=x onerror=bad()>';
  f.underground!.state.enemies[0].name = 'Keeper <script>bad()</script>';
  const dungeon = renderLivingSystemsPanel(f, state('field', { view: 'underworld' }));
  assert.doesNotMatch(dungeon.html, /<script|<img|onclick=|data-command=/);
  assert.match(dungeon.html, /&lt;script&gt;/);
  const tool = renderLivingSystemsPanel(f, state('field', { detail: 'item:field-knife' }));
  assert.match(tool.html, /selected automatically/);
  assert.match(tool.html, /carcass harvesting/);
  assert.ok([...tool.actions.values()].some((a) => a.kind === 'navigate' && a.view === 'satchel'));
});
