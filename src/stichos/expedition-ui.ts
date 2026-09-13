import {
  ATTUNEMENTS,
  expeditionRecord,
  expeditionStatus,
  type ExpeditionContext,
  type ExpeditionPlan,
  type ExpeditionState,
} from './expeditions.ts';

const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const itemNames: Readonly<Record<string, string>> = {
  cequin: 'breathing leaves',
  wood: 'timber',
  ore: 'ore',
  salve: 'salve',
  rations: 'rations',
  tonic: 'tonic',
};
const direction = (dx: number, dy: number) => {
  if (Math.hypot(dx, dy) < 3) return 'here';
  const compass = [
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
    'north',
    'northeast',
  ];
  return compass[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
};

/** Root owns dialog focus/close. This body contains native accessible controls and no DOM/global state. */
export function renderExpeditionPanel(
  plans: readonly ExpeditionPlan[],
  state: ExpeditionState,
  context: ExpeditionContext,
  selectedId?: string,
): string {
  const active =
    plans.find((plan) => plan.id === selectedId) ??
    plans.find((plan) => !expeditionRecord(state, plan.id)?.claimed) ??
    plans[0];
  const completed = state.records.filter((record) => record.claimed).length;
  const unlocked = (Object.keys(ATTUNEMENTS) as (keyof typeof ATTUNEMENTS)[]).filter((id) =>
    state.records.some(
      (record) =>
        record.claimed &&
        record.id.endsWith(id === 'momentum' ? ':road' : id === 'precision' ? ':relay' : ':garden'),
    ),
  );
  return `<section class="expedition-panel" aria-label="Field expeditions">
    <header class="expedition-heading"><div><small>THE FIELD LEDGER</small><h2>Expeditions</h2></div><span class="expedition-seal" aria-label="${completed} expeditions completed">${completed}<small>delivered</small></span></header>
    <p class="expedition-intro">Follow a local commission beyond the streets. Survey its site, clear the danger, then bring crafted supplies home.</p>
    ${plans.length ? `<nav class="expedition-tabs" aria-label="Nearby expedition sites">${plans.map((plan) => `<button type="button" data-expedition="${escape(plan.id)}" data-expedition-action="select" ${plan.id === active?.id ? 'aria-current="true"' : ''}><span aria-hidden="true">${plan.kind === 'road' ? '↗' : plan.kind === 'relay' ? '◇' : '❧'}</span>${plan.kind === 'road' ? 'Road' : plan.kind === 'relay' ? 'Relay' : 'Garden'}${expeditionRecord(state, plan.id)?.claimed ? '<small>✓ Delivered</small>' : `<small>Lv ${plan.level}</small>`}</button>`).join('')}</nav>` : '<p class="expedition-empty">No settlement commissions nearby. Follow the roads to another settlement and open the ledger again.</p>'}
    ${active ? renderCard(active, state, context) : ''}
    ${unlocked.length ? `<section class="expedition-attunements" aria-label="Field attunement"><h3>Carry one field lesson</h3><p>Choose one earned attunement. Changing it replaces the previous lesson.</p>${unlocked.map((id) => `<button type="button" data-attunement="${id}" aria-pressed="${state.attunement === id}"><strong>${escape(ATTUNEMENTS[id].name)}</strong><small>${escape(ATTUNEMENTS[id].description)}</small></button>`).join('')}</section>` : ''}
    <p class="expedition-fineprint">Each settlement has its own seeded encounters and rewards. Shared enemies stay defeated; commissions are delivered once per life.</p>
  </section>`;
}

function renderCard(
  plan: ExpeditionPlan,
  state: ExpeditionState,
  context: ExpeditionContext,
): string {
  const status = expeditionStatus(plan, state, context),
    target = status.target;
  const distance = Math.round(Math.hypot(target.x - context.player.x, target.y - context.player.y));
  const stages = ['discover', 'combat', 'deliver', 'complete'];
  const current = stages.indexOf(status.stage);
  return `<article class="expedition-card" aria-labelledby="expedition-title">
    <div class="expedition-eyebrow"><span>${escape(plan.subtitle)}</span><span>Lv ${plan.level}</span></div>
    <h3 id="expedition-title">${escape(plan.title)}</h3>
    <p class="expedition-town">${escape(plan.town.name)} · ${escape(plan.biome)} · ${distance} tiles ${direction(target.x - context.player.x, target.y - context.player.y)}</p>
    <ol class="expedition-steps" aria-label="Commission progress">${['Survey', 'Clear', 'Supply', 'Delivered'].map((label, i) => `<li ${i === current ? 'aria-current="step"' : ''} class="${i < current ? 'is-done' : ''}"><span aria-hidden="true">${i < current ? '✓' : i + 1}</span>${label}</li>`).join('')}</ol>
    <p class="expedition-objective" role="status">${escape(status.reason)}</p>
    <div class="expedition-actions"><button type="button" data-expedition="${escape(plan.id)}" data-expedition-action="track">${status.stage === 'deliver' || status.stage === 'complete' ? 'Track return route' : 'Track field site'}</button>${status.stage === 'deliver' ? `<button type="button" class="expedition-deliver" data-expedition="${escape(plan.id)}" data-expedition-action="claim" ${status.canClaim ? '' : 'disabled'}>Deliver supplies</button>` : ''}</div>
    <details class="expedition-details"><summary>Briefing &amp; tactics</summary><p>${escape(plan.description)}</p><p><strong>Read the danger.</strong> ${escape(plan.tactics)}</p><p>${escape(plan.observationText)} ${status.observed ? '✓ Observation recorded.' : ''}</p><p>Commission contact: ${escape(plan.giver.name)}.</p></details>
    <div class="expedition-supplies"><h4>Bring home</h4><ul>${Object.entries(plan.cost)
      .map(([item, count]) => {
        const held = context.inventory[item as keyof typeof context.inventory] ?? 0;
        return `<li class="${held >= count! ? 'is-ready' : ''}"><span>${escape(itemNames[item] ?? item)}</span><strong>${held}/${count}</strong></li>`;
      })
      .join('')}</ul></div>
    <div class="expedition-reward"><small>COMMISSION REWARD</small><p><strong>${plan.reward.coins}${status.observed ? ' + 12' : ''} coins · ${plan.reward.xp} XP</strong><span>${plan.reward.practice.amount} ${plan.reward.practice.profession} practice · a generated field implement</span></p><p class="expedition-lesson">${escape(ATTUNEMENTS[plan.reward.attunement].name)}<span>${escape(ATTUNEMENTS[plan.reward.attunement].description)}</span></p></div>
  </article>`;
}

export function expeditionTracker(
  plan: ExpeditionPlan,
  state: ExpeditionState,
  context: ExpeditionContext,
): { title: string; text: string; target: { x: number; y: number } } {
  const status = expeditionStatus(plan, state, context),
    distance = Math.round(
      Math.hypot(status.target.x - context.player.x, status.target.y - context.player.y),
    );
  return {
    title: plan.title,
    text: `${status.stage === 'combat' ? `${status.defeated}/${status.total} cleared` : status.stage === 'deliver' ? 'Return with supplies' : status.stage === 'complete' ? 'Delivered' : 'Survey site'} · ${distance} tiles ${direction(status.target.x - context.player.x, status.target.y - context.player.y)}`,
    target: { ...status.target },
  };
}
