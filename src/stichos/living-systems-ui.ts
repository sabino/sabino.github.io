import type { ActorAddress } from './actor-ledger.ts';
import type { LivingSystemsFrame, SystemsCommand, SystemsResult } from './living-systems.ts';
import { FIELD_ITEMS, FIELD_RECIPES, type FieldBundle, type FieldItem } from './field-loot.ts';
import {
  ESTATE_RECIPES,
  ESTATE_STATIONS,
  propertyPrice,
  type Estate,
  type PropertyCommand,
  type StationKind,
} from './property-world.ts';
import { UNDERWORLD_RULES, type UnderworldFeature } from './underworld.ts';
import type { Heraldry } from './civic-world.ts';

export type LivingSystemsSection = 'field' | 'charters' | 'estates' | 'signs';
export interface LivingSystemsUiState {
  section: LivingSystemsSection;
  detail?: string;
  view?: string;
  page: number;
  message: string;
  busy: boolean;
  confirmation?: { label: string; command: SystemsCommand };
}
export interface LivingSystemsUiOptions {
  openModal(html: string, mount: (root: HTMLElement) => void): void;
  closeModal(): void;
  command(command: SystemsCommand): Promise<SystemsResult>;
  frame(): LivingSystemsFrame | null;
  onTravel(address: ActorAddress, label: string): void;
  onPlace(propertyId: string, stationKind: StationKind): void;
}
interface FrameTargets {
  nearbyResources?: readonly { id: string; name: string; kind: string }[];
  resources?: readonly { id: string; name: string; kind: string }[];
  fauna?: readonly { id: string; name: string; kind: string; protected?: boolean }[];
  contacts?: readonly {
    factionId: string;
    npcId: string;
    name: string;
    spaceId?: string;
    x?: number;
    y?: number;
  }[];
}
export type LivingPanelAction =
  | {
      kind: 'navigate';
      section: LivingSystemsSection;
      detail?: string;
      view?: string;
      page?: number;
    }
  | { kind: 'command'; command: SystemsCommand }
  | { kind: 'confirm'; label: string; command: SystemsCommand }
  | { kind: 'cancel-confirm' | 'close' | 'refresh' }
  | { kind: 'travel'; address: ActorAddress; label: string }
  | { kind: 'place'; propertyId: string; stationKind: StationKind }
  | {
      kind: 'form';
      formId: string;
      operation: 'storage' | 'queue' | 'assign' | 'guest';
      propertyId: string;
      stationId?: string;
    };
const sections: readonly [LivingSystemsSection, string][] = [
  ['field', 'Field'],
  ['charters', 'Charters'],
  ['estates', 'Estates'],
  ['signs', 'Signs'],
];
const PAGE_SIZE = 4;
const UNDERWORLD_MARKS: Record<UnderworldFeature['kind'], string> = {
  up: '↑',
  down: '↓',
  gate: '‖',
  rune: '◇',
  inscription: '≡',
  shortcut: '↗',
  survivor: '+',
  cache: '▣',
  secret: '?',
  rest: '○',
  trap: '!',
  core: '◉',
};
const UNDERWORLD_ACTIONS: Record<UnderworldFeature['kind'], string> = {
  up: 'Ascend',
  down: 'Descend',
  gate: 'Inspect gate',
  rune: 'Align control',
  inscription: 'Read inscription',
  shortcut: 'Release shortcut',
  survivor: 'Rescue survivor',
  cache: 'Recover cache',
  secret: 'Search recess',
  rest: 'Rest at hearth',
  trap: 'Inspect hazard',
  core: 'Stabilize engine',
};
const headingTo = (dx: number, dy: number) => {
  const horizontal = dx > 1 ? 'east' : dx < -1 ? 'west' : '';
  const vertical = dy > 1 ? 'south' : dy < -1 ? 'north' : '';
  return vertical && horizontal
    ? `${vertical}${horizontal}`
    : vertical || horizontal || 'beside you';
};
const FIELD_TOOL_HELP: Partial<Record<FieldItem, string>> = {
  'field-knife':
    'Your owned field knife is selected automatically for close hunting and carcass harvesting. Move within reach and choose Hunt or Harvest; local wildlife law still applies.',
  hatchet:
    'Your owned hatchet is selected automatically for timber and resin. Stand beside the resource and choose Gather. It belongs to your field satchel, independently of your combat weapon.',
  pickaxe:
    'Your owned quarry pick is selected automatically for stone and ore. Stand beside the deposit and choose Gather; a full field satchel leaves the deposit untouched.',
  spear:
    'Your owned hunting spear is selected automatically for wildlife strikes, with greater reach and damage than the field knife. Combat weapon selection remains in Equipment.',
};
export const escapeLivingText = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const esc = escapeLivingText;
const itemName = (id: string) =>
  Object.hasOwn(FIELD_ITEMS, id) ? FIELD_ITEMS[id as FieldItem].name : id;
const bundleText = (b: FieldBundle) =>
  [
    ...(b.coins ? [`${b.coins} coins`] : []),
    ...Object.entries(b.items).map(([id, n]) => `${n} ${itemName(id)}`),
  ].join(' · ') || 'No materials';
const safeHex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#a9bfbb');
const ownEstates = (f: LivingSystemsFrame) =>
  f.property.estates.filter((e): e is Estate => 'storage' in e);
const asAddress = (p: ActorAddress): ActorAddress => ({ spaceId: p.spaceId, x: p.x, y: p.y });
const placeLabel = (frame: LivingSystemsFrame) =>
  frame.underground
    ? `${frame.underground.name} · floor ${frame.underground.depth + 1}`
    : (frame.town?.name ?? 'Wilderness');
/** Original geometric badges. Text describes shape/pattern/symbol as well as colour. */
export function livingHeraldry(h: Heraldry): string {
  const shapes = {
    shield: 'M4 2H28V18L16 30 4 18Z',
    roundel: 'M16 2A14 14 0 1 0 16 30A14 14 0 1 0 16 2',
    pennant: 'M4 2H29L23 16 29 30H4Z',
  };
  const symbols = {
    hammer: 'M10 9H22V13H17V24H13V13H10Z',
    scales: 'M15 7H17V11H24V13H21L25 20H17L21 13H17V25H15V13H11L15 20H7L11 13H8V11H15Z',
    antler: 'M15 25V17L9 13V7H11V12L15 14V6H17V14L21 12V7H23V13L17 17V25Z',
    leaf: 'M9 24C7 12 13 7 24 8C23 19 18 24 9 24M10 23L20 12',
    eye: 'M6 16Q16 4 26 16Q16 28 6 16M16 12V20',
  };
  return `<svg class="v-living-heraldry" viewBox="0 0 32 32" role="img" aria-label="${esc(h.label)}; ${esc(h.shape)}, ${esc(h.pattern)}, ${esc(h.symbol)}"><path d="${shapes[h.shape]}" fill="${safeHex(h.color)}" stroke="${safeHex(h.ink)}" stroke-width="2"/><path d="${h.pattern === 'bar' ? 'M5 15H27' : h.pattern === 'split' ? 'M16 3V28' : 'M5 18L16 8 27 18'}" fill="none" stroke="${safeHex(h.ink)}" stroke-width="3" opacity=".35"/><path d="${symbols[h.symbol]}" fill="none" stroke="${safeHex(h.ink)}" stroke-width="2" stroke-linejoin="miter"/></svg>`;
}

/** Pure presentation: actions retain real server IDs in memory instead of embedding command JSON in HTML. */
export function renderLivingSystemsPanel(
  frame: LivingSystemsFrame | null,
  state: LivingSystemsUiState,
) {
  const actions = new Map<string, LivingPanelAction>();
  let serial = 0;
  const button = (label: string, action: LivingPanelAction, disabled = false, extra = '') => {
    const id = `ls${++serial}`;
    actions.set(id, action);
    const key =
      action.kind === 'navigate'
        ? `nav:${action.section}:${action.detail ?? ''}:${action.view ?? ''}:${action.page ?? 0}`
        : `${action.kind}:${label}`;
    return `<button type="button" data-living-action="${id}" data-focus-key="${esc(key)}"${disabled || (state.busy && action.kind !== 'close') ? ' disabled' : ''} ${extra}>${esc(label)}</button>`;
  };
  const command = (label: string, c: SystemsCommand, disabled = false) =>
    button(label, { kind: 'command', command: c }, disabled);
  const property = (label: string, c: PropertyCommand, disabled = false) =>
    command(label, { kind: 'property', command: c }, disabled);
  const nav = (label: string, detail?: string, view?: string, page = 0) =>
    button(
      label,
      { kind: 'navigate', section: state.section, detail, view, page },
      false,
      view &&
        view ===
          (state.view ??
            (state.section === 'field' ? (frame?.underground ? 'underworld' : 'nearby') : 'home'))
        ? 'aria-current="page"'
        : '',
    );
  const back = () => nav('‹ Back');
  const empty = (text: string) => `<p class="v-living-empty">${esc(text)}</p>`;
  const notice = (text: string) => `<p class="v-living-note">${esc(text)}</p>`;
  const heading = (title: string, sub?: string) =>
    `<div class="v-living-detail-head"><h3 tabindex="-1" data-living-heading>${esc(title)}</h3>${sub ? notice(sub) : ''}</div>`;
  const option = (value: string, label: string) =>
    `<option value="${esc(value)}">${esc(label)}</option>`;
  const submit = (label: string, action: Extract<LivingPanelAction, { kind: 'form' }>) =>
    button(label, action);
  const list = (rows: string[], label: string) => {
    const count = Math.ceil(rows.length / PAGE_SIZE),
      page = Math.max(0, Math.min(Math.floor(state.page), Math.max(0, count - 1)));
    return `<div class="v-living-list" aria-label="${esc(label)}">${rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).join('')}</div>${count > 1 ? `<nav class="v-living-pager" aria-label="${esc(label)} pages">${button('Previous', { kind: 'navigate', section: state.section, detail: state.detail, view: state.view, page: page - 1 }, page === 0)}<span>Page ${page + 1} of ${count}</span>${button('Next', { kind: 'navigate', section: state.section, detail: state.detail, view: state.view, page: page + 1 }, page + 1 >= count)}</nav>` : ''}`;
  };
  const row = (title: string, description: string, action: LivingPanelAction, tag?: string) =>
    `<article class="v-living-row"><div><strong>${esc(title)}</strong>${tag ? `<small class="v-living-tag">${esc(tag)}</small>` : ''}<p>${esc(description)}</p></div>${button('Open', action, false, `aria-label="Open ${esc(title)}"`)}</article>`;
  let body = '';
  if (!frame)
    body = empty(
      'World systems are not available in this session yet. Join a compatible hosted world or continue in a supported solo life.',
    );
  else if (state.confirmation)
    body = `${heading('Confirm this action', state.confirmation.label)}<div class="v-living-actions">${command('Confirm', state.confirmation.command)}${button('Keep things as they are', { kind: 'cancel-confirm' })}</div>`;
  else if (state.section === 'field') {
    const bag = frame.economy.satchel;
    const targets = frame as LivingSystemsFrame & FrameTargets;
    const view = state.view ?? (frame.underground ? 'underworld' : 'nearby');
    const useSupplies = (['ration', 'bandage', 'ward-kit'] as const).filter(
      (id) => (bag.items[id] ?? 0) > 0,
    );
    const supplyButtons = useSupplies.length
      ? `<div class="v-living-actions v-living-supplies" aria-label="Use carried field supplies">${useSupplies.map((id) => command(`Use ${itemName(id)} · ${bag.items[id]}`, { kind: 'consume', item: id })).join('')}</div>`
      : '';
    const capacity =
      (frame.diagnostics?.actors?.saturated ?? 0) > 0
        ? notice(
            'The resident register is full. Existing people, homes and memories remain, but new residents cannot enter this local world yet.',
          )
        : '';
    const kit = frame.equipment
      ? notice(
          `Expedition weapon: ${frame.equipment.kind}. Used underground and in shared combat. Personal equipment stays in your pack.`,
        )
      : '';
    const views =
      capacity +
      kit +
      (frame.activeWardSeconds > 0
        ? notice(
            `Ward active · ${Math.ceil(frame.activeWardSeconds)} seconds at last refresh. Guard and underground blows reduced.`,
          )
        : '') +
      `<nav class="v-living-subnav" aria-label="Field pages">${nav('Nearby', undefined, 'nearby')}${nav('Satchel', undefined, 'satchel')}${nav('Craft', undefined, 'craft')}${nav('Underworld', undefined, 'underworld')}</nav>`;
    if (state.detail?.startsWith('recipe:')) {
      const r = FIELD_RECIPES.find((r) => `recipe:${r.id}` === state.detail);
      body = r
        ? `${nav('‹ Recipes', undefined, 'craft')}${heading(r.name, r.description)}<dl class="v-living-facts"><dt>Workplace</dt><dd>${esc(r.station)}</dd><dt>Needs</dt><dd>${esc(bundleText(r.cost))}</dd><dt>Makes</dt><dd>${esc(bundleText(r.reward))}</dd></dl>${command('Craft one', { kind: 'craft', recipeId: r.id })}${notice('Stand beside the required workplace. The world checks tools, materials and room access.')}`
        : empty('That recipe is no longer available.');
    } else if (state.detail?.startsWith('item:')) {
      const id = state.detail.slice(5) as FieldItem,
        amount = bag.items[id] ?? 0;
      body = `${nav('‹ Satchel', undefined, 'satchel')}${heading(itemName(id), `${amount} carried`)}${FIELD_TOOL_HELP[id] ? notice(FIELD_TOOL_HELP[id]!) : ''}${frame.consumables?.find((c) => c.item === id)?.description ? notice(frame.consumables.find((c) => c.item === id)!.description) : ''}${id === 'ration' || id === 'bandage' || id === 'ward-kit' ? command(`Use ${itemName(id)}`, { kind: 'consume', item: id }, amount < 1) : ''}${Object.hasOwn(FIELD_ITEMS, id) && FIELD_ITEMS[id].value > 0 ? `<div class="v-living-actions">${command('Sell one', { kind: 'sell', item: id, quantity: 1 }, amount < 1)}${command('Sell up to five', { kind: 'sell', item: id, quantity: Math.min(5, amount) }, amount < 1)}</div>${notice('Trade with an awake merchant nearby. Their opinion of you affects the actual offer.')}` : notice('Keep this equipment for field work. Personal equipment is not bought by ordinary merchants.')}`;
    } else if (view === 'underworld') {
      const underground = frame.underground,
        here = frame.location;
      const recall = underground
        ? notice(
            frame.recall && frame.recall.cooldownUntil > frame.elapsed
              ? `Recall anchor recovering · ${Math.ceil(frame.recall.cooldownUntil - frame.elapsed)} seconds at last refresh`
              : `Recall cost: ${frame.recall?.coinLoss ?? Math.ceil(bag.coins * 0.2)} field coins`,
          ) +
          button(
            'Recall to entrance',
            {
              kind: 'confirm',
              label:
                'Return through the mind tether and forfeit one fifth of your field coins? The anchor then rests for thirty seconds.',
              command: { kind: 'underworld-recover' },
            },
            !!frame.recall && frame.recall.cooldownUntil > frame.elapsed,
          )
        : '';
      const pendingSalvage = frame.pendingSalvage ?? [],
        salvageCount = frame.pendingSalvageCount ?? pendingSalvage.length;
      const salvage = pendingSalvage.length
        ? `<section class="v-living-task"><h3>Salvage awaiting collection</h3>${notice(`${salvageCount} earned ${salvageCount === 1 ? 'bundle' : 'bundles'} remain protected if your field satchel is full.`)}<details class="v-living-disclosure"><summary>Read recovered supplies · ${pendingSalvage.length} shown</summary>${pendingSalvage.map((reward) => `<p>${esc(bundleText(reward.bundle))}</p>`).join('')}</details>${command('Collect earned salvage', { kind: 'underworld-rewards' })}</section>`
        : '';
      const rescueCount = frame.rescued?.length ?? 0;
      const legacyFrame = !('underground' in frame) || !here;
      const feature = underground?.features.find((f) => f.id === state.detail);
      const near = (point: { x: number; y: number }, spaceId: string) =>
        here?.spaceId === spaceId &&
        Math.hypot(here.x - point.x, here.y - point.y) <= UNDERWORLD_RULES.interactDistance;
      const distanceTo = (point: { x: number; y: number }) =>
        here ? Math.hypot(here.x - point.x, here.y - point.y) : Infinity;
      const completed = (f: UnderworldFeature) =>
        !!underground &&
        (underground.state.rescued.includes(f.id) ||
          (['cache', 'secret', 'core', 'shortcut'].includes(f.kind) &&
            underground.state.opened.includes(f.id)) ||
          (f.kind === 'rune' && underground.state.puzzle >= 3));
      const featureCommand = (f: UnderworldFeature) =>
        command(
          completed(f) ? 'Already completed' : UNDERWORLD_ACTIONS[f.kind],
          { kind: 'underworld-interact', targetId: f.id },
          completed(f) || !underground || !near(f, underground.spaceId),
        );
      if (legacyFrame)
        body =
          views +
          empty(
            'This world has not supplied underground exploration information. Your current surface life remains available.',
          );
      else if (underground && feature) {
        body = `${nav('‹ Expedition', undefined, 'underworld')}${heading(feature.name, feature.description)}<div class="v-living-depth"><strong>Floor ${underground.depth + 1} of ${UNDERWORLD_RULES.floors}</strong><span>${distanceTo(feature).toFixed(1)} tiles · ${esc(headingTo(feature.x - here.x, feature.y - here.y))}</span></div>${feature.kind === 'rune' ? notice(`Archive circuit: ${underground.state.puzzle} of 3 controls aligned. Read the inscription before choosing the sequence.`) : ''}<div class="v-living-actions">${featureCommand(feature)}${button('Back to the world', { kind: 'close' })}</div>${!near(feature, underground.spaceId) ? notice('Walk within 2.2 tiles to use this place. The world checks the actual target and your position.') : ''}${completed(feature) ? notice('Your exploration has already changed this place.') : ''}`;
      } else if (underground) {
        const exit = underground.features.find((f) => f.kind === 'up');
        const visibleBosses = underground.state.enemies.filter(
          (e) => e.kind === 'boss' && distanceTo(e) <= 18,
        );
        const quick = underground.features
          .filter((f) => near(f, underground.spaceId) && !completed(f))
          .slice(0, 3);
        const features = [...underground.features].sort((a, b) => distanceTo(a) - distanceTo(b));
        body =
          views +
          heading(underground.name, underground.objective) +
          `<div class="v-living-depth"><strong>Floor ${underground.depth + 1} of ${UNDERWORLD_RULES.floors}</strong><span>${esc(underground.biome)} · ${esc(underground.material)}</span><span>${underground.state.discovered.length} rooms explored</span><span>Enemies grow stronger with each floor</span></div>${exit ? notice(`Way back: ${exit.name}, ${distanceTo(exit).toFixed(1)} tiles ${headingTo(exit.x - here.x, exit.y - here.y)}. ${underground.depth === 0 ? 'This stair returns to the surface.' : 'This stair returns to the previous floor.'}`) : notice('Find the return stair to ascend.')}<div class="v-living-actions">${button('Back to exploring', { kind: 'close' })}${quick.map(featureCommand).join('')}</div>${supplyButtons}${visibleBosses.map((boss, i) => `<section class="v-living-boss" data-living-boss="${esc(boss.id)}"><strong>${esc(boss.name)}</strong><p data-living-boss-state>${esc(boss.hp <= 0 ? 'Defeated' : `Phase ${boss.phase} · ${boss.state === 'windup' ? 'Attack warning — move out of its marked reach.' : boss.state === 'recovery' ? 'Recovering — a moment to strike.' : 'Watch for its attack warning.'}`)}</p><label for="living-boss-${i}" data-living-boss-health>${Math.ceil(boss.hp)} / ${esc(boss.maxHp)} health</label><progress id="living-boss-${i}" max="${esc(boss.maxHp)}" value="${Math.max(0, boss.hp)}" aria-label="${esc(boss.name)} health"></progress></section>`).join('')}${
            features.length
              ? list(
                  features.map(
                    (f) =>
                      `<article class="v-living-row"><span class="v-living-feature-mark" aria-hidden="true">${UNDERWORLD_MARKS[f.kind]}</span><div><strong>${esc(f.name)}</strong><p>${esc(completed(f) ? 'Completed' : f.kind)} · ${distanceTo(f).toFixed(1)} tiles ${esc(headingTo(f.x - here.x, f.y - here.y))}</p></div>${button('Inspect', { kind: 'navigate', section: 'field', detail: f.id, view: 'underworld' }, false, `aria-label="Inspect ${esc(f.name)}"`)}</article>`,
                  ),
                  'Known underground places',
                )
              : empty('Explore the passage to discover places worth investigating.')
          }${salvage}`;
      } else {
        const entrances = frame.entrances ?? [];
        body =
          views +
          heading(
            'Beneath the settlements',
            'Explore linked floors, recover useful salvage, rescue people and bring their skills home.',
          ) +
          notice(
            'Prepare food, dressings and a ward. Fight and dodge with the normal world controls; your field satchel carries recovered supplies.',
          ) +
          supplyButtons +
          (entrances.length
            ? list(
                entrances.map(
                  (entrance) =>
                    `<article class="v-living-row"><span class="v-living-feature-mark" aria-hidden="true">↓</span><div><strong>${esc(entrance.name)}</strong><p>${distanceTo(entrance).toFixed(1)} tiles · ${near(entrance, entrance.spaceId) ? 'Within entrance reach' : 'Walk to its surface entrance'}</p><div class="v-living-actions">${button('Walk to entrance', { kind: 'travel', address: asAddress(entrance), label: entrance.name })}${command('Enter underworld', { kind: 'underworld-enter', settlementId: entrance.settlementId }, !near(entrance, entrance.spaceId))}</div></div></article>`,
                ),
                'Underground entrances',
              )
            : empty('Walk through a settlement to discover a nearby underground entrance.')) +
          salvage +
          (rescueCount
            ? `<details class="v-living-disclosure"><summary>People brought home · ${rescueCount}</summary>${frame.rescued.map((r) => `<p>${esc(r.profession)} · floor ${r.depth + 1} · ${r.delivered ? 'Returned to the settlement' : 'Return to the surface to complete the rescue'}</p>`).join('')}</details>`
            : '');
      }
      body += recall;
    } else if (view === 'satchel') {
      body =
        views +
        supplyButtons +
        list(
          Object.entries(bag.items).map(([id, n]) =>
            row(itemName(id), `${n} carried`, {
              kind: 'navigate',
              section: 'field',
              detail: `item:${id}`,
            }),
          ),
          'Satchel',
        );
    } else if (view === 'craft') {
      body =
        views +
        list(
          FIELD_RECIPES.map((r) =>
            row(
              r.name,
              bundleText(r.cost),
              { kind: 'navigate', section: 'field', detail: `recipe:${r.id}` },
              r.station,
            ),
          ),
          'Field recipes',
        );
    } else {
      const drops = frame.economy.drops.map(
        (d) =>
          `<article class="v-living-row"><div><strong>${esc(d.name)}</strong><small class="v-living-tag">${esc(d.rarity)}${d.harvest ? ' · carcass' : ''}</small><p>${esc(bundleText(d.bundle))}</p></div>${command(d.harvest ? 'Harvest' : 'Pick up', { kind: 'claim', targetId: d.id })}</article>`,
      );
      const resources = (targets.nearbyResources ?? targets.resources ?? []).map(
        (r) =>
          `<article class="v-living-row"><div><strong>${esc(r.name)}</strong><p>${esc(r.kind)} · use the proper field tool</p></div>${command('Gather', { kind: 'gather', targetId: r.id })}</article>`,
      );
      const fauna = (targets.fauna ?? []).map(
        (a) =>
          `<article class="v-living-row"><div><strong>${esc(a.name)}</strong><p>${esc(a.kind)}${a.protected ? ' · protected wildlife' : ''}</p></div>${button('Hunt', { kind: 'confirm', label: `Attack ${a.name}? Hunting can be witnessed and local law may protect this animal.`, command: { kind: 'hunt', targetId: a.id } })}</article>`,
      );
      body =
        views +
        (drops.length + resources.length + fauna.length
          ? list([...drops, ...resources, ...fauna], 'Nearby field work')
          : empty(
              'Walk near timber, deposits or wildlife. Defeated creatures leave real drops to collect.',
            ));
    }
  } else if (state.section === 'charters') {
    const f = frame.factions.find((f) => f.id === state.detail);
    if (f) {
      const m = frame.memberships.find((m) => m.factionId === f.id),
        contacts = (frame as LivingSystemsFrame & FrameTargets).contacts ?? [],
        contact = contacts.find((c) => c.factionId === f.id),
        duty = frame.duties.find((d) => d.id.startsWith(`duty:${f.id}:`));
      const contactActor = contact ? frame.actors.find((a) => a.id === contact.npcId) : undefined;
      const point =
        contact && Number.isFinite(contact.x) && Number.isFinite(contact.y)
          ? { spaceId: contact.spaceId ?? 'surface', x: contact.x!, y: contact.y! }
          : contactActor
            ? { spaceId: 'surface', x: contactActor.x, y: contactActor.y }
            : undefined;
      const range =
        point && frame.location && point.spaceId === frame.location.spaceId
          ? Math.hypot(point.x - frame.location.x, point.y - frame.location.y)
          : Infinity;
      const reachable = range <= 3;
      const guild = (label: string, action: Extract<SystemsCommand, { kind: 'guild' }>['action']) =>
        command(
          label,
          { kind: 'guild', action, factionId: f.id, npcId: contact?.npcId ?? '' },
          !contact || !reachable,
        );
      body = `${back()}<div class="v-living-emblem-title">${livingHeraldry(f.heraldry)}${heading(f.name, f.principles)}</div>${notice(contact ? `${contact.name} · ${reachable ? 'within speaking distance' : Number.isFinite(range) && point ? `${Math.ceil(range)} paces ${headingTo(point.x - frame.location.x, point.y - frame.location.y)}` : 'current whereabouts unknown'}.` : 'No unoccupied guild contact is known here.')} ${point && !reachable ? button('Walk to contact', { kind: 'travel', address: point, label: contact!.name }) : ''}<dl class="v-living-facts"><dt>Standing</dt><dd>${esc(m?.status === 'member' ? (f.ranks[m.rank] ?? 'Member') : (m?.status ?? 'Undiscovered'))}</dd><dt>Entry</dt><dd>${esc(bundleText(f.entryCost))}</dd><dt>Dues</dt><dd>${f.dues} coins</dd></dl>`;
      if (!m?.discovered) body += guild('Ask for the charter', 'discover');
      else if (m.status === 'visitor')
        body += `<div class="v-living-actions">${guild('Join this guild', 'join')}${nav('Not now')}</div>`;
      else if (m.status === 'member') {
        body += `<details class="v-living-disclosure"><summary>Your oath and standing</summary><ul><li>Your named charter membership and current rank are remembered.</li><li>${esc(f.benefits[m.rank] ?? 'Charter standing recorded')}</li><li>Complete the active duty with your local contact to earn standing.</li><li>Keep dues current; rivals and witnesses can affect trust.</li></ul>${notice(f.rivalId ? `Rival charter: ${frame.factions.find((other) => other.id === f.rivalId)?.name ?? 'Ask your contact about their rivals.'}` : 'No rival charter is known here.')}<div class="v-living-actions">${guild('Pay dues', 'dues')}${button('Leave guild', { kind: 'confirm', label: `Surrender your badge and membership in ${f.name}? The guild will remember your departure.`, command: { kind: 'guild', action: 'leave', factionId: f.id, npcId: contact?.npcId ?? '' } }, !contact || !reachable)}</div></details>`;
        if (duty)
          body += `<section class="v-living-task">${heading(duty.title, duty.description)}${notice(bundleText(duty.cost))}${notice(`Standing earned: ${duty.standing}. ${duty.action ? 'A qualifying witnessed action is required.' : 'Listed supplies are consumed on acceptance.'}`)}${guild('Fulfil today’s duty', 'duty')}</section>`;
      } else body += guild('Seek reconciliation', 'reconcile');
    } else
      body = `${frame.town ? heading(frame.town.name, frame.reputation?.summary) : heading('Local charters')}${frame.laws ? notice(frame.laws.description) : ''}${
        frame.factions.length
          ? list(
              frame.factions.map(
                (f) =>
                  `<article class="v-living-row">${livingHeraldry(f.heraldry)}<div><strong>${esc(f.name)}</strong><p>${esc(f.purpose)} · ${esc(frame.memberships.find((m) => m.factionId === f.id)?.status ?? 'undiscovered')}</p></div>${button('Read', { kind: 'navigate', section: 'charters', detail: f.id }, false, `aria-label="Read ${esc(f.name)} charter"`)}</article>`,
              ),
              'Local charters',
            )
          : empty('Visit a settlement to discover its local guilds and laws.')
      }${frame.guards
        .filter((g) => g.state === 'fine' && (g.fine ?? 0) > 0)
        .map(
          (g) =>
            `<section class="v-living-task">${notice(g.message ?? 'The watch has issued a fine.')}${command(`Pay ${g.fine} coin fine`, { kind: 'fine', guardId: g.id })}</section>`,
        )
        .join('')}`;
  } else if (state.section === 'estates') {
    const owned = ownEstates(frame),
      e = owned.find((e) => e.id === state.detail),
      offer = frame.offers.find((o) => o.id === state.detail);
    if (e) {
      const view = state.view ?? 'home';
      const workers = frame.property.workers.filter((w) => w.estateId === e.id);
      body = `${back()}${heading(e.offer.name, e.tenure === 'rented' ? `Rented · ${Math.max(0, Math.ceil(((e.leaseUntil ?? 0) - frame.elapsed) / 60))} minutes remaining` : 'Owned property')}<nav class="v-living-subnav" aria-label="Estate pages">${nav('Home', e.id, 'home')}${nav('Supplies', e.id, 'storage')}${nav('Work', e.id, 'work')}</nav>`;
      if (view === 'storage') {
        const formId = 'living-storage',
          items = new Set([
            ...Object.keys(frame.economy.satchel.items),
            ...Object.keys(e.storage.items),
          ]);
        body += `<p class="v-living-balance">Estate cashbox: <strong>${e.storage.coins} coins</strong></p><div class="v-living-stocks">${
          Object.entries(e.storage.items)
            .map(([id, n]) => `<span>${esc(itemName(id))} <strong>×${n}</strong></span>`)
            .join('') || 'No supplies stored yet.'
        }</div><form id="${formId}" class="v-living-form"><label>Transfer<select name="direction">${option('deposit', 'Deposit from field satchel')}${option('withdraw', 'Collect into field satchel')}</select></label><label>Supply<select name="item">${option('coins', 'Coins')}${[...items].map((id) => option(id, `${itemName(id)} · bag ${frame.economy.satchel.items[id as FieldItem] ?? 0} / store ${e.storage.items[id as FieldItem] ?? 0}`)).join('')}</select></label><label>Amount<select name="quantity">${[1, 2, 5, 10, 20, 50].map((n) => option(String(n), String(n))).join('')}</select></label>${submit('Transfer supplies', { kind: 'form', formId, operation: 'storage', propertyId: e.id })}</form>${notice('Workers collect recipe inputs here. Their wages come from your field coin balance.')}`;
      } else if (view === 'work') {
        body += `<div class="v-living-actions">${nav('Build station', e.id, 'build')}${nav('Hire a person', e.id, 'hire')}</div>`;
        if (e.stations.length)
          body += list(
            e.stations.map((s) => {
              const w = workers.find((w) => w.id === s.workerId);
              return row(
                ESTATE_STATIONS[s.kind].name,
                `${w?.name ?? 'No worker'} · ${s.status}`,
                { kind: 'navigate', section: 'estates', detail: e.id, view: `station:${s.id}` },
                `${s.produced} batches delivered`,
              );
            }),
            'Estate workstations',
          );
        else
          body += empty(
            'Build a workstation, hire a real person, then deposit supplies and queue work.',
          );
      } else if (view === 'build') {
        body += list(
          (Object.keys(ESTATE_STATIONS) as StationKind[]).map((kind) =>
            row(
              ESTATE_STATIONS[kind].name,
              bundleText(ESTATE_STATIONS[kind].cost),
              { kind: 'place', propertyId: e.id, stationKind: kind },
              `${ESTATE_STATIONS[kind].width} × ${ESTATE_STATIONS[kind].height} tiles`,
            ),
          ),
          'Blueprints',
        );
      } else if (view === 'hire') {
        const candidates = frame.actors.filter(
          (a) =>
            !a.hostile &&
            a.hp > 0 &&
            ['refugee', 'engineer', 'botanist', 'pilgrim'].includes(a.role) &&
            !frame.property.workers.some((w) => w.id === a.id),
        );
        body +=
          notice(
            'Speak near a willing worker and your property. The agreement costs four coins; each production batch pays a separate wage.',
          ) +
          (candidates.length
            ? list(
                candidates.map(
                  (a) =>
                    `<article class="v-living-row"><div><strong>${esc(a.name)}</strong><p>${esc(a.role)}</p></div>${property('Offer work', { kind: 'hire', propertyId: e.id, npcId: a.id })}</article>`,
                ),
                'People available for work',
              )
            : empty(
                'No available worker is visible nearby. Rescue or meet people willing to work here.',
              ));
      } else if (view.startsWith('station:')) {
        const station = e.stations.find((s) => s.id === view.slice(8));
        if (station) {
          const w = workers.find((w) => w.id === station.workerId),
            recipes = ESTATE_RECIPES.filter((r) => r.station === station.kind),
            job = station.job,
            recipe = ESTATE_RECIPES.find((r) => r.id === job?.recipe);
          body += `${heading(ESTATE_STATIONS[station.kind].name, station.status)}<p>${w ? `${esc(w.name)} · ${esc(w.status)} · loyalty ${Math.round(w.loyalty)}` : 'No worker assigned'}</p>`;
          if (job)
            body += `<div class="v-living-progress"><label for="living-work-progress">${esc(recipe?.name ?? job.recipe)} · ${job.completed} delivered / ${job.remaining} remaining</label><progress id="living-work-progress" max="${recipe?.seconds ?? 1}" value="${job.elapsed}"></progress></div>${property('Cancel unworked batches', { kind: 'cancel-job', propertyId: e.id, stationId: station.id })}`;
          else {
            const formId = 'living-queue';
            body += `<form id="${formId}" class="v-living-form"><label>Recipe<select name="recipe">${recipes.map((r) => option(r.id, `${r.name} · ${r.wage} coin wage`)).join('')}</select></label><label>Batches<select name="quantity">${[1, 3, 5, 10, 20].map((n) => option(String(n), String(n))).join('')}</select></label>${submit('Reserve inputs and queue', { kind: 'form', formId, operation: 'queue', propertyId: e.id, stationId: station.id })}</form><details class="v-living-disclosure"><summary>Inputs and outputs</summary>${recipes.map((r) => `<p><strong>${esc(r.name)}</strong><br>${esc(bundleText({ coins: 0, items: r.inputs }))} → ${esc(bundleText(r.output))}<br>${esc(r.description)}</p>`).join('')}</details>`;
          }
          if (w)
            body += property('End this assignment', {
              kind: 'unassign',
              propertyId: e.id,
              npcId: w.id,
            });
          else if (workers.length) {
            const formId = 'living-assignment';
            body += `<form id="${formId}" class="v-living-form"><label>Worker<select name="worker">${workers.map((w) => option(w.id, `${w.name} · ${w.specialty}${w.nightShift ? ' · night shift' : ''}`)).join('')}</select></label>${submit('Assign worker', { kind: 'form', formId, operation: 'assign', propertyId: e.id, stationId: station.id })}</form>`;
          } else body += nav('Find a worker', e.id, 'hire');
          if (!job && !w)
            body += button('Dismantle station', {
              kind: 'confirm',
              label:
                'Dismantle this idle station? Half its construction materials return to estate storage.',
              command: {
                kind: 'property',
                command: {
                  kind: 'demolish',
                  propertyId: e.id,
                  stationId: station.id,
                  confirmRevision: e.revision,
                },
              },
            });
        } else body += empty('This station no longer exists.');
      } else {
        body += `<div class="v-living-actions">${button('Go to this property', { kind: 'travel', address: asAddress(e.offer.entrance), label: e.offer.name })}${e.offer.kind === 'home' ? property('Rest at home', { kind: 'rest', propertyId: e.id }) : ''}${property(e.locked ? 'Open to visitors' : 'Lock entrance', { kind: 'lock', propertyId: e.id, locked: !e.locked })}${e.tenure === 'rented' ? property('Renew lease', { kind: 'renew', propertyId: e.id }) : ''}</div>`;
        if (e.offer.kind === 'home')
          body += `<section class="v-living-task"><p>Furnishing ${e.furnishings} / 3</p>${property('Improve furnishings', { kind: 'furnish', propertyId: e.id }, e.furnishings >= 3)}${notice('Needs 2 planks, 2 fiber and 2 coins. Furnishings improve home rest.')}</section>`;
        const formId = 'living-guests';
        body += `<details class="v-living-disclosure"><summary>Guest keys (${e.guests.length})</summary><p>Keys allow entry. Only you can withdraw stored goods.</p>${e.guests.map((id) => `<div class="v-living-row"><span>${esc(id)}</span>${property('Revoke key', { kind: 'guest', propertyId: e.id, guestId: id, allow: false })}</div>`).join('')}<form id="${formId}" class="v-living-form"><label>Player identity<input type="text" name="guest" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="160" placeholder="Exact player identity"></label>${submit('Give guest key', { kind: 'form', formId, operation: 'guest', propertyId: e.id })}</form></details>`;
      }
    } else if (offer) {
      const price = propertyPrice(offer),
        alreadyOwned = frame.property.estates.some((e) => e.id === offer.id);
      body = `${back()}${heading(offer.name, offer.kind === 'home' ? 'Existing residence' : 'Outdoor building parcel')}<p>${offer.bounds.width} × ${offer.bounds.height} tiles</p>${notice(offer.vacant && !alreadyOwned ? 'Visit the entrance to sign an agreement.' : 'This property is occupied; its belongings and agreement are protected.')}<div class="v-living-actions">${button('Walk to entrance', { kind: 'travel', address: asAddress(offer.entrance), label: offer.name })}${property(`Buy · ${price.buy} coins`, { kind: 'acquire', propertyId: offer.id, mode: 'buy' }, !offer.vacant || alreadyOwned)}${offer.rentable ? property(`Rent · ${price.rent} coins`, { kind: 'acquire', propertyId: offer.id, mode: 'rent' }, !offer.vacant || alreadyOwned) : ''}</div>`;
    } else {
      const rows = [
        ...owned.map((e) =>
          row(
            e.offer.name,
            `${e.tenure} · ${e.stations.length} workstations`,
            { kind: 'navigate', section: 'estates', detail: e.id },
            'Your property',
          ),
        ),
        ...frame.offers
          .filter((o) => !owned.some((e) => e.id === o.id))
          .map((o) =>
            row(
              o.name,
              o.vacant ? `${propertyPrice(o).buy} coins · ${o.kind}` : 'Occupied property',
              { kind: 'navigate', section: 'estates', detail: o.id },
            ),
          ),
      ];
      body = `${heading('Homes and working places')}${frame.home ? button('Go home', { kind: 'travel', address: frame.home, label: 'Home' }) : ''}${rows.length ? list(rows, 'Properties') : empty('Walk through a settlement to discover homes and parcels. Existing possessions remain in your legacy home menu until ownership is verified here.')}`;
    }
  } else {
    const sign = frame.signs.find((s) => s.id === state.detail);
    body = sign
      ? `${back()}<div class="v-living-emblem-title">${sign.heraldry ? livingHeraldry(sign.heraldry) : ''}${heading(sign.title, sign.subtitle)}</div><div class="v-living-sign-copy" aria-label="${esc(sign.accessibleLabel)}">${sign.lines.map((line) => `<p class="v-living-sign-${esc(line.kind)}">${esc(line.text)}</p>`).join('')}</div>${button('Walk to sign', { kind: 'travel', address: asAddress(sign), label: sign.title })}`
      : `${heading('Read the world', 'Names, services, ownership and local rules. Symbols also appear on your map.')}${
          frame.signs.length
            ? list(
                frame.signs.map((s) =>
                  row(
                    s.compactTitle,
                    s.subtitle,
                    { kind: 'navigate', section: 'signs', detail: s.id },
                    s.symbol,
                  ),
                ),
                'Nearby signs',
              )
            : empty('Look near a building, gate, road junction or noticeboard for useful signs.')
        }`;
  }
  const tabs = sections
    .map(([id, label]) =>
      button(
        label,
        { kind: 'navigate', section: id },
        false,
        `role="tab" id="living-tab-${id}" aria-selected="${state.section === id}" aria-controls="living-system-body" tabindex="${state.section === id ? 0 : -1}"`,
      ),
    )
    .join('');
  const html = `<div class="s-window v-living-window"><section class="v-living-panel" aria-labelledby="living-systems-title"><header class="v-living-header"><div><h2 id="living-systems-title">World &amp; livelihood</h2><p class="v-living-session-meta">${frame ? `${frame.economy.satchel.coins} field coins · ${esc(placeLabel(frame))}` : 'Session unavailable'}</p></div>${button('Close', { kind: 'close' }, false, 'aria-label="Close world and livelihood"')}</header><nav class="v-living-tabs" role="tablist" aria-label="World systems">${tabs}</nav><div class="v-living-body" id="living-system-body" role="tabpanel" aria-labelledby="living-tab-${state.section}" aria-busy="${state.busy}">${body}</div><footer class="v-living-footer"><p role="status" aria-live="polite" aria-atomic="true" class="v-living-result">${esc(state.busy ? 'Working…' : state.message || 'Actions use your current world and belongings.')}</p>${button('Refresh', { kind: 'refresh' })}</footer></section></div>`;
  return { html, actions };
}

export function createLivingSystemsUi(options: LivingSystemsUiOptions) {
  let state: LivingSystemsUiState = { section: 'field', page: 0, message: '', busy: false },
    host: HTMLElement | undefined,
    actions = new Map<string, LivingPanelAction>(),
    opener: HTMLElement | null = null,
    controller: AbortController | undefined,
    alive = true,
    active = false,
    pending = false,
    signature = '',
    generation = 0,
    lastFocusKey: string | undefined,
    renderedSpace: string | undefined;
  const pointers = new Set<number>(),
    drafts = new Map<string, string>();
  const render = (reset = false) => {
    if (!active || !host?.isConnected) return;
    if (pointers.size) {
      pending = true;
      return;
    }
    const focused = host.ownerDocument.activeElement as HTMLElement | null,
      focusKey = focused?.dataset.focusKey ?? lastFocusKey,
      fieldName =
        focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement
          ? focused.name
          : undefined;
    const scrollTop = reset ? 0 : (host.querySelector('.v-living-body')?.scrollTop ?? 0);
    const disclosureState = reset
      ? []
      : [...host.querySelectorAll<HTMLDetailsElement>('details')].map((d) => d.open);
    const currentFrame = options.frame();
    renderedSpace = currentFrame?.location?.spaceId;
    const built = renderLivingSystemsPanel(currentFrame, state),
      old = host.querySelector('.v-living-window');
    actions = built.actions;
    if (!old) {
      active = false;
      controller?.abort();
      return;
    }
    old.outerHTML = built.html;
    const scroll = host.querySelector('.v-living-body');
    if (scroll) scroll.scrollTop = scrollTop;
    [...host.querySelectorAll<HTMLDetailsElement>('details')].forEach(
      (d, i) => (d.open = disclosureState[i] ?? false),
    );
    for (const input of host.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      'input[name],select[name]',
    )) {
      const key = `${input.form?.id}:${input.name}`;
      if (
        (drafts.has(key) &&
          [...(input instanceof HTMLSelectElement ? input.options : [])].some(
            (o) => o.value === drafts.get(key),
          )) ||
        (input instanceof HTMLInputElement && drafts.has(key))
      )
        input.value = drafts.get(key)!;
    }
    if (focusKey)
      [...host.querySelectorAll<HTMLElement>('[data-focus-key]')]
        .find((e) => e.dataset.focusKey === focusKey && !e.hasAttribute('disabled'))
        ?.focus({ preventScroll: true });
    else if (fieldName)
      host
        .querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${fieldName}"]`)
        ?.focus({ preventScroll: true });
    pending = false;
  };
  const close = () => {
    active = false;
    generation++;
    controller?.abort();
    pointers.clear();
    options.closeModal();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  const send = async (command: SystemsCommand) => {
    if (state.busy) return;
    state.busy = true;
    state.message = '';
    const run = generation;
    render();
    try {
      const out = await options.command(command);
      if (!alive || !active || run !== generation) return;
      state.message = out.message;
      state.confirmation = undefined;
    } catch {
      if (!alive || !active || run !== generation) return;
      state.message =
        'The world could not complete this action. Check the connection and try again.';
    } finally {
      if (alive && active && run === generation) {
        state.busy = false;
        render();
      }
    }
  };
  const formCommand = (
    action: Extract<LivingPanelAction, { kind: 'form' }>,
  ): SystemsCommand | null => {
    const form = host?.querySelector<HTMLFormElement>(`#${action.formId}`);
    if (!form) return null;
    const data = new FormData(form),
      get = (name: string) => String(data.get(name) ?? ''),
      quantity = Number(get('quantity'));
    if (action.operation === 'storage') {
      const item = get('item'),
        direction = get('direction');
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 99 ||
        !['deposit', 'withdraw'].includes(direction) ||
        (item !== 'coins' && !Object.hasOwn(FIELD_ITEMS, item))
      )
        return null;
      return {
        kind: 'property',
        command: {
          kind: direction as 'deposit' | 'withdraw',
          propertyId: action.propertyId,
          bundle:
            item === 'coins'
              ? { coins: quantity, items: {} }
              : { coins: 0, items: { [item]: quantity } },
        },
      };
    }
    if (action.operation === 'queue') {
      if (
        !action.stationId ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 20 ||
        !ESTATE_RECIPES.some((r) => r.id === get('recipe'))
      )
        return null;
      return {
        kind: 'property',
        command: {
          kind: 'queue',
          propertyId: action.propertyId,
          stationId: action.stationId,
          recipe: get('recipe'),
          batches: quantity,
        },
      };
    }
    if (action.operation === 'assign')
      return action.stationId && get('worker')
        ? {
            kind: 'property',
            command: {
              kind: 'assign',
              propertyId: action.propertyId,
              stationId: action.stationId,
              npcId: get('worker'),
            },
          }
        : null;
    const guest = get('guest').trim();
    return guest
      ? {
          kind: 'property',
          command: { kind: 'guest', propertyId: action.propertyId, guestId: guest, allow: true },
        }
      : null;
  };
  const act = (a: LivingPanelAction) => {
    if (state.busy && a.kind !== 'close') return;
    if (a.kind === 'close') {
      close();
      return;
    }
    if (a.kind === 'navigate') {
      state = {
        ...state,
        section: a.section,
        detail: a.detail,
        view: a.view,
        page: a.page ?? 0,
        confirmation: undefined,
      };
      drafts.clear();
      lastFocusKey = undefined;
      render(true);
      host?.querySelector<HTMLElement>('[data-living-heading]')?.focus({ preventScroll: true });
      return;
    }
    if (a.kind === 'refresh') {
      render();
      return;
    }
    if (a.kind === 'confirm') {
      state.confirmation = { label: a.label, command: a.command };
      render(true);
      return;
    }
    if (a.kind === 'cancel-confirm') {
      state.confirmation = undefined;
      render();
      return;
    }
    if (a.kind === 'travel') {
      close();
      options.onTravel(a.address, a.label);
      return;
    }
    if (a.kind === 'place') {
      close();
      options.onPlace(a.propertyId, a.stationKind);
      return;
    }
    if (a.kind === 'form') {
      const command = formCommand(a);
      if (command) void send(command);
      else {
        state.message = 'Choose valid supplies, amounts and a named target first.';
        render();
      }
      return;
    }
    if (a.kind === 'command') void send(a.command);
  };
  const mount = (root: HTMLElement) => {
    controller?.abort();
    controller = new AbortController();
    host = root;
    const signal = controller.signal;
    root.addEventListener(
      'click',
      (event) => {
        const target = (event.target as Element)?.closest<HTMLButtonElement>(
          'button[data-living-action]',
        );
        if (!target || !root.contains(target) || target.disabled) return;
        const action = actions.get(target.dataset.livingAction ?? '');
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        lastFocusKey = target.dataset.focusKey;
        act(action);
      },
      { signal },
    );
    root.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        const form = event.target as HTMLFormElement;
        const target = form.querySelector<HTMLButtonElement>('button[data-living-action]');
        if (target && !target.disabled) {
          const action = actions.get(target.dataset.livingAction ?? '');
          if (action) act(action);
        }
      },
      { signal },
    );
    root.addEventListener(
      'change',
      (event) => {
        const input = event.target;
        if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement)
          drafts.set(`${input.form?.id}:${input.name}`, input.value);
      },
      { signal },
    );
    root.addEventListener(
      'input',
      (event) => {
        const input = event.target;
        if (input instanceof HTMLInputElement)
          drafts.set(`${input.form?.id}:${input.name}`, input.value);
      },
      { signal },
    );
    root.addEventListener(
      'pointerdown',
      (event) => {
        pointers.add(event.pointerId);
      },
      { capture: true, signal },
    );
    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pending && !pointers.size) queueMicrotask(render);
    };
    root.ownerDocument.addEventListener('pointerup', release, { capture: true, signal });
    root.ownerDocument.addEventListener('pointercancel', release, { capture: true, signal });
    root.addEventListener(
      'keydown',
      (event) => {
        const target = event.target as HTMLElement;
        if (
          target.getAttribute('role') === 'tab' &&
          ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          const i = sections.findIndex(([s]) => s === state.section),
            n =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? 3
                  : (i + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
          act({ kind: 'navigate', section: sections[n][0] });
          root.querySelector<HTMLElement>(`#living-tab-${sections[n][0]}`)?.focus();
        }
      },
      { signal },
    );
    root.querySelector<HTMLElement>('#living-systems-title')?.setAttribute('tabindex', '-1');
    root.querySelector<HTMLElement>('#living-systems-title')?.focus({ preventScroll: true });
  };
  return {
    open(section: LivingSystemsSection = 'field', targetId?: string) {
      if (!alive) return;
      generation++;
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      state = { section, detail: targetId, page: 0, message: '', busy: false };
      active = true;
      lastFocusKey = undefined;
      drafts.clear();
      pointers.clear();
      const currentFrame = options.frame();
      renderedSpace = currentFrame?.location?.spaceId;
      const built = renderLivingSystemsPanel(currentFrame, state);
      actions = built.actions;
      options.openModal(built.html, mount);
    },
    update() {
      if (!active || !host?.isConnected) return;
      const focused = host.ownerDocument.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement || state.busy)
        return;
      const frame = options.frame();
      // A real stair/entrance transition replaces the semantic pane once. Ordinary
      // combat ticks only patch readings; they never replace a held control.
      if (state.section === 'field' && frame?.location?.spaceId !== renderedSpace) {
        if (frame?.underground || state.view === 'underworld') {
          state.view = 'underworld';
          state.detail = undefined;
          state.page = 0;
          render(true);
          return;
        }
        renderedSpace = frame?.location?.spaceId;
      }
      if (frame?.underground) {
        for (const node of host.querySelectorAll<HTMLElement>('[data-living-boss]')) {
          const boss = frame.underground.state.enemies.find(
            (e) => e.id === node.dataset.livingBoss,
          );
          if (!boss) continue;
          const meter = node.querySelector<HTMLProgressElement>('progress');
          if (meter) {
            meter.max = boss.maxHp;
            meter.value = Math.max(0, boss.hp);
          }
          const health = node.querySelector('[data-living-boss-health]');
          if (health) health.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp} health`;
          const behavior = node.querySelector('[data-living-boss-state]');
          if (behavior)
            behavior.textContent =
              boss.hp <= 0
                ? 'Defeated'
                : `Phase ${boss.phase} · ${boss.state === 'windup' ? 'Attack warning — move out of its marked reach.' : boss.state === 'recovery' ? 'Recovering — a moment to strike.' : 'Watch for its attack warning.'}`;
        }
      }
      const next = frame
        ? `${frame.elapsed.toFixed(0)}:${frame.economy.satchel.coins}:${frame.property.estates.length}`
        : 'missing';
      if (next !== signature) {
        signature = next;
        // Passive frames do not replace controls, reset reading position or close disclosures.
        const panel = host.querySelector('.v-living-window');
        if (!panel) {
          active = false;
          controller?.abort();
          return;
        }
        const meta = panel.querySelector('.v-living-session-meta');
        if (meta && frame)
          meta.textContent = `${frame.economy.satchel.coins} field coins · ${placeLabel(frame)}`;
      }
    },
    destroy() {
      alive = false;
      active = false;
      generation++;
      controller?.abort();
      pointers.clear();
      host = undefined;
    },
  };
}
