import {
  compactProject,
  COMPACT_MILESTONES,
  type CompactState,
  type CompactPlan,
  type CompactCost,
  type CompactChoice,
} from './compact.ts';
import type { ItemId } from './types.ts';

const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const names: Record<ItemId, string> = {
  cequin: 'cequin',
  heartleaf: 'heartleaf',
  emberroot: 'emberroot',
  wood: 'timber',
  ore: 'ore',
  salve: 'salves',
  tonic: 'warming tonics',
  rations: 'food portions',
  bandage: 'dressings',
  seal: 'archive seals',
  lens: 'lenses',
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const afford = (cost: CompactCost, inventory: Partial<Record<ItemId, number>>, coins: number) =>
  coins >= cost.coins &&
  Object.entries(cost.items).every(([id, n]) => (inventory[id as ItemId] ?? 0) >= n!);
function costRows(cost: CompactCost, inventory: Partial<Record<ItemId, number>>, coins: number) {
  const rows: [string, number, number][] = [
    ...(cost.coins ? [['coins', cost.coins, coins] as [string, number, number]] : []),
    ...Object.entries(cost.items)
      .filter(([, n]) => n! > 0)
      .map(
        ([id, n]) =>
          [names[id as ItemId] ?? id, n!, inventory[id as ItemId] ?? 0] as [string, number, number],
      ),
  ];
  return `<ul class="s-compact-cost">${rows.map(([name, needed, carried]) => `<li ${carried < needed ? 'class="is-short"' : ''}><span>${esc(name)}</span><b>${needed}</b><small>${carried} carried${carried < needed ? ` · ${needed - carried} missing` : ''}</small></li>`).join('')}</ul>`;
}
const family = (plan: CompactPlan, id: number) =>
  plan.clans?.find((c) => c.id === id)?.name ?? `Family ${id + 1}`;
function outcomes(state: CompactState, plan: CompactPlan) {
  return `<details class="s-compact-outcomes" ${state.stage === 'complete' ? 'open' : ''}><summary>What these agreements are changing · six districts</summary><p>Care expands the clinic’s obligations. Reliability reduces later replacement work. Independence reduces future outside funding; dependency increases it.</p><div class="s-compact-districts">${plan.towns
    .map((town, i) => {
      const o = state.outcomes[i],
        resolved = plan.projects.filter(
          (p) => p.district === i && state.completed.includes(p.id),
        ).length;
      return `<article><small>${esc(family(plan, town.clan))} · ${resolved}/4 commitments</small><h5>${esc(town.name)}</h5><dl><div><dt>Care</dt><dd>${signed(o.care)}</dd></div><div><dt>Independence</dt><dd>${signed(o.independence)}</dd></div><div><dt>Reliability</dt><dd>${signed(o.reliability)}</dd></div></dl></article>`;
    })
    .join(
      '',
    )}</div>${state.paidOrders ? `<p>${state.paidOrders} paid work orders supplied accepted commitments. The people who performed them keep their own loyalties.</p>` : ''}</details>`;
}

/** HTML only; the caller validates proximity and applies actions through the live session. */
export function renderCompact(
  state: CompactState,
  plan: CompactPlan,
  inventory: Partial<Record<ItemId, number>>,
  coins: number,
): string {
  const p = compactProject(state, plan);
  const milestone =
    state.project * 3 + (state.stage === 'work' ? 1 : state.stage === 'delivery' ? 2 : 0);
  const heading = `<header class="s-compact-heading"><div><small>The Winter Compact</small><h3>A public life, with consequences.</h3></div><span>${Math.min(COMPACT_MILESTONES, milestone)} / ${COMPACT_MILESTONES}<small>milestones</small></span></header><progress max="${COMPACT_MILESTONES}" value="${Math.min(COMPACT_MILESTONES, milestone)}" aria-label="Winter Compact milestones"></progress>`;
  if (!p)
    return `<section class="s-compact" aria-label="The Winter Compact">${heading}<p>Twenty-four commitments across the six families are resolved. The people, reserves, dependencies and disagreements remain. Theo’s choice about the return signal is still his own.</p>${outcomes(state, plan)}</section>`;
  const selected = p.choices.find((c) => c.id === state.choices[p.id]);
  const stages = [
    ['survey', 'Hear both accounts'],
    ['work', 'Agree and perform the work'],
    ['delivery', 'Deliver and record the outcome'],
  ] as const;
  const stageIndex = stages.findIndex(([id]) => id === state.stage);
  const policy = (choice: CompactChoice) => {
    const chosen = selected?.id === choice.id,
      canChoose = state.stage === 'work' && !selected && afford(choice.cost, inventory, coins);
    return `<article class="s-compact-policy ${chosen ? 'is-selected' : ''}"><small>${chosen ? 'Agreed terms' : selected ? 'The alternative remains on record' : 'A possible agreement'}</small><h5>${esc(choice.label)}</h5><p>${esc(choice.description)}</p><p class="s-compact-consequence">${esc(choice.consequence)}</p><h6>Upfront commitment</h6>${costRows(choice.cost, inventory, coins)}<p><b>Fresh work:</b> ${choice.work.amount} ${esc(names[choice.work.item])}, ${choice.work.kind === 'craft' ? 'newly prepared' : 'newly gathered'} after these terms are accepted.${choice.work.acceptsLabor ? ' Relevant completed paid labor can supply this work.' : ''}</p><details><summary>The later physical delivery</summary>${costRows({ coins: 0, items: choice.delivery }, inventory, coins)}<p>Family trust: ${choice.reputation.map(([id, n]) => `${esc(family(plan, id))} ${signed(n)}`).join(' · ')}.</p></details>${!selected ? `<button type="button" data-compact-choose="${esc(choice.id)}" ${canChoose ? '' : 'disabled'}>Agree at the district board</button>${state.stage === 'survey' ? '<small>First hear both witnesses.</small>' : !canChoose ? '<small>Bring the missing upfront supplies and coins.</small>' : ''}` : chosen ? '<p class="s-compact-seal">Terms paid and recorded</p>' : ''}</article>`;
  };
  return `<section class="s-compact" aria-label="The Winter Compact">${heading}<article class="s-compact-brief"><small>Council round ${p.phase + 1} of 4 · ${esc(family(plan, p.clan))} · ${esc(p.town.name)}</small><h4>${esc(p.title)}</h4><p>${esc(p.description)}</p><button type="button" data-compact-track="${esc(p.board.id)}">Follow the district board <small>${Math.round(p.board.x)}, ${Math.round(p.board.y)}</small></button></article><ol class="s-compact-stages">${stages.map(([id, title], i) => `<li class="${i < stageIndex ? 'is-done' : i === stageIndex ? 'is-current' : ''}" ${i === stageIndex ? 'aria-current="step"' : ''}><span>${i < stageIndex ? '✓' : i + 1}</span>${title}</li>`).join('')}</ol><div class="s-compact-witnesses">${p.witnesses
    .map((w) => {
      const recorded = state.surveys.includes(w.id);
      return `<article><small>${esc(w.role)} · ${recorded ? 'Account recorded' : 'Account still unheard'}</small><h5>${esc(w.name)}</h5>${recorded ? `<blockquote>${esc(w.statement ?? 'This witness’s account is recorded.')}</blockquote>` : '<p>Visit this person and hear their account before agreeing to a policy.</p>'}<div class="s-compact-buttons"><button type="button" data-compact-track="${esc(w.id)}">Follow ${esc(w.name)}</button><button type="button" data-compact-survey="${esc(w.id)}" ${state.stage === 'survey' && !recorded ? '' : 'disabled'}>${recorded ? 'Recorded' : 'Hear this account nearby'}</button></div></article>`;
    })
    .join(
      '',
    )}</div><p class="s-compact-help">Speak beside the actual person. If they are dead, hostile or currently inhabited, their deposited account can be read at this district’s board.</p><div class="s-compact-policies">${p.choices.map(policy).join('')}</div>${selected ? `<article class="s-compact-work"><h5>${state.stage === 'delivery' ? 'Fresh work complete · supplies still need delivery' : 'The work you agreed to perform'}</h5><p>${state.work}/${selected.work.amount} fresh ${esc(names[selected.work.item])} ${selected.work.kind === 'craft' ? 'prepared' : 'gathered'}.</p><progress value="${state.work}" max="${selected.work.amount}" aria-label="Fresh Compact work"></progress><p>${selected.work.kind === 'craft' ? 'Use the preparation recipes to make the agreed items. Buying an already prepared batch does not demonstrate this work.' : 'Use the appropriate working tool on remaining resource plots. Completed paid labor that produces the agreed material also counts.'} Keep the agreed delivery in this body’s pack.</p><h6>Bring to ${esc(p.town.name)}</h6>${costRows({ coins: 0, items: selected.delivery }, inventory, coins)}<button type="button" data-compact-deliver ${state.stage === 'delivery' && afford({ coins: 0, items: selected.delivery }, inventory, coins) ? '' : 'disabled'}>Deliver at the district board</button><small>Accepted once · ${p.reward.coins} coins · ${p.reward.xp} experience. The supplies leave this body’s pack.</small></article>` : ''}${outcomes(state, plan)}</section>`;
}
