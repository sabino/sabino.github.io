import type { Stichos } from './session';
import {
  COSMETICS,
  FURNITURE,
  professionProfile,
  gardenStatus,
  upgradeBonuses,
  previewCosmetic,
} from './progression';
import type { ProgressionAction, Profession } from './progression';
import { drawPortrait } from './portrait';
import { weaponIcon } from './equipment';
import { furnitureIcon } from './progression-art';

const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
type LifeTab = 'purpose' | 'skills' | 'homes' | 'wardrobe' | 'store';
export function mountLife(container: HTMLElement, game: Stichos, onChange: () => void) {
  let tab: LifeTab = 'purpose';
  let selectedHome = game.progression.homes[0]?.id ?? '';
  let message = '';
  let revision = 0;
  const actions: ProgressionAction[] = [];
  function purpose() {
    const story = game.campaign,
      life = game.freeLife,
      ending = game.endingSummary;
    const contract = life.contract;
    return `<article class="s-life-story"><small>${story.ending ? 'The investigation is complete' : story.started ? `Act ${story.act + 1} of 6 · ${esc(story.actTitle)}` : 'Twenty years of silence'}</small><h3>${ending ? esc(ending.title) : esc(story.title)}</h3><p>${ending ? esc(ending.text) : story.started ? `${story.completed}/${story.total} leads resolved. Follow the current thread in your journal and atlas.` : 'The cathedral radio is broken. Begin with the clinic, the engineer and the Sallas records in Vespera.'}</p><progress value="${story.completed}" max="${story.total}" aria-label="Investigation progress"></progress>${ending ? `<details><summary>The choices you carried here</summary>${ending.decisions.map((decision) => `<h4>${esc(decision.title)}</h4><p>${esc(decision.text)}</p>`).join('')}</details>` : ''}</article><h3>${life.unlocked ? 'Choose a life worth staying for' : 'The work of a life'}</h3><p>Follow these callings at your own pace. Noticeboards offer new local commissions; botanists need supplies, and correspondence carries the six families’ secrets along the roads.</p><div class="s-life-grid">${life.milestones.map((goal) => `<article><small>${goal.complete ? 'Accomplished' : `${goal.progress} / ${goal.goal}`}</small><h4>${esc(goal.title)}</h4><p>${esc(goal.description)}</p><progress value="${goal.progress}" max="${goal.goal}" aria-label="${esc(goal.title)}"></progress></article>`).join('')}</div><h3>Local commissions · ${life.contractsCompleted} completed</h3>${contract?.status === 'active' ? `<article><h4>${esc(contract.title)}</h4><p>${esc(contract.description)}</p><p>${contract.progress}/${contract.required} completed · ${contract.reward} coins on delivery<br>Report at ${esc(contract.town)}: ${Math.round(contract.board.x)}, ${Math.round(contract.board.y)}.</p></article>` : '<p>Read a settlement noticeboard to choose work in gathering, medicine, cultivation or road protection.</p>'}<h3>Other lives you have encountered</h3><p>${life.unlocked ? 'At a quiet shrine, the restored signal can reach these remembered people. Every living, willing host keeps their own belongings; returning to the priest also returns you to the physical notebook.' : 'Finish the return investigation to reach remembered willing hosts beyond the nearby shrine. For now, learn the people and places around you.'}</p>${
      life.unlocked
        ? `<div class="s-life-grid">${game.knownIdentities
            .slice(0, 32)
            .map(
              (person) =>
                `<article><small>${esc(person.role)} · ${esc(game.world.clans[person.clan].name)}</small><h4>${esc(person.name)}</h4><p>${esc(person.consent)}<br>${Math.round(person.x)}, ${Math.round(person.y)} · ${person.available ? 'Can answer at a quiet shrine' : 'Currently unavailable'}</p></article>`,
            )
            .join('')}</div>`
        : ''
    }`;
  }
  function actionButton(action: ProgressionAction, label: string) {
    const preview = game.progressionPreview(action),
      index = actions.push(action) - 1;
    const cost = preview.cost;
    const price = cost
      ? [
          cost.coins ? `${cost.coins} coins` : '',
          ...Object.entries(cost.items).map(([item, amount]) => `${amount} ${item}`),
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
    return `<div class="s-life-action"><button data-life-action="${index}" ${preview.ok ? '' : 'disabled'}>${esc(label)}${price ? `<small>${esc(price)}</small>` : ''}</button>${!preview.ok ? `<small>${esc(preview.message)}</small>` : ''}</div>`;
  }
  function skills() {
    const descriptions = {
      botany: 'Gather and cultivate living plants. Practice improves medicine and harvest yields.',
      crafting:
        'Prepare supplies, improve weapons and furnish your home. Skilled hands prepare more from the same ingredients.',
      combat: 'Learn through encounters. Experience improves strength and recovery in every body.',
    };
    return `<p>What Theo learns travels with his mind. A weapon’s improvements belong to the body that carries it.</p><div class="s-life-grid">${(
      ['botany', 'crafting', 'combat'] as Profession[]
    )
      .map((profession) => {
        const p = professionProfile(game.progression, profession);
        return `<article><small>${esc(p.title)} · level ${p.level}</small><h3>${esc(profession)}</h3><p>${descriptions[profession]}</p><progress value="${p.progress}" max="1"></progress><small>${p.xp} practice${p.nextAt ? ` / ${p.nextAt} next level` : ' · mastered'}</small></article>`;
      })
      .join(
        '',
      )}</div><h3>Improve this body’s equipment</h3><p>Visit a workbench with timber, ore and coins. Three improvements add strength, reach and quicker handling.</p><div class="s-life-grid">${(
      ['staff', 'sword', 'bow'] as const
    )
      .map((weapon) => {
        const p = game.weaponProfile(weapon),
          rank = upgradeBonuses(game.progression, game.bodyId, weapon).rank;
        return `<article>${weaponIcon(game.player.appearance.seed, weapon, 84)}<h3>${esc(p.name)}</h3><p>Rank ${rank}/3 · ${p.damage} strength<br>${p.range.toFixed(2)} reach · ${p.cooldown.toFixed(2)}s recovery</p>${actionButton({ kind: 'upgrade', weapon }, rank === 3 ? 'Fully improved' : 'Improve weapon')}</article>`;
      })
      .join('')}</div>`;
  }
  function homes() {
    const owned = game.progression.homes,
      offered = game.nearbyHomes.filter((address) => !owned.some((h) => h.id === address.id));
    const home = owned.find((h) => h.id === selectedHome) ?? owned[0];
    if (home) selectedHome = home.id;
    return `<p>A place of your own on a very large planet. Buy a real house or inn room near its doorway. Furnishings, garden beds and ownership are remembered in your save.</p>${owned.length ? `<label>Your homes<select id="s-home-select">${owned.map((h) => `<option value="${esc(h.id)}" ${h.id === selectedHome ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>` : '<p>No home yet. Visit the houses around a settlement to see the available addresses.</p>'}${
      home
        ? `<article class="s-home-detail"><h3>${esc(home.name)}</h3><p>${Math.round(home.x)}, ${Math.round(home.y)} · ${Math.round(Math.hypot(home.x - game.player.x, home.y - game.player.y))} paces away</p><button id="s-home-rest" ${Math.hypot(home.x - game.player.x, home.y - game.player.y) > 10 ? 'disabled' : ''}>Rest at home · 30 seconds pass</button><h3>Your garden</h3><p>Plants grow while you live in the world. The menu pauses time; resting at home advances it.</p><div class="s-life-grid s-garden-plots">${gardenStatus(
            home,
            game.time,
          )
            .map(
              (plot) =>
                `<article><small>Plot ${plot.plot + 1}</small><h4>${plot.crop ? esc(plot.crop.plant) : 'Empty earth'}</h4>${plot.crop ? `<progress value="${plot.progress}" max="1"></progress><p>${plot.stage === 'ready' ? `${plot.crop.yield} portions ready` : `${plot.secondsLeft}s of lived time remaining`}</p>${actionButton({ kind: 'harvest', homeId: home.id, plot: plot.plot }, 'Gather crop')}` : `<select data-plot-plant="${plot.plot}" aria-label="Plant for plot ${plot.plot + 1}"><option value="cequin">Cequin</option><option value="heartleaf">Heartleaf</option><option value="emberroot">Emberroot</option></select><button data-plant-plot="${plot.plot}" ${Math.hypot(home.x - game.player.x, home.y - game.player.y) > 10 ? 'disabled' : ''}>Plant one portion</button>`}</article>`,
            )
            .join(
              '',
            )}</div><h3>Furnish this home</h3><div class="s-life-grid">${FURNITURE.map((part) => `<article><img class="s-furniture-preview" src="${furnitureIcon(part.id, game.world.seed)}" alt=""><small>${part.slot} · crafting ${part.level}</small><h4>${esc(part.name)}</h4><p>${esc(part.description)}</p>${actionButton({ kind: 'furnish', homeId: home.id, furnitureId: part.id }, home.furniture[part.slot] === part.id ? 'Installed' : home.furniture[part.slot] ? 'Replace furnishing' : 'Make furnishing')}</article>`).join('')}</div></article>`
        : ''
    }<h3>Nearby addresses</h3>${offered.length ? `<div class="s-life-grid">${offered.map((address) => `<article><h4>${esc(address.name)}</h4><p>${Math.round(address.x)}, ${Math.round(address.y)} · ${Math.round(Math.hypot(address.x - game.player.x, address.y - game.player.y))} paces away</p>${actionButton({ kind: 'buy-home', address }, 'Purchase home')}</article>`).join('')}</div>` : '<p>No unowned house or inn doorway nearby. Follow the streets to another building.</p>'}`;
  }
  function wardrobe() {
    const selected = game.progression.equippedStyles[game.bodyId];
    return `<p>Clothing changes how you look. It grants no extra power. Patterns learned with coins follow Theo; each host keeps its own choice of outfit.</p>${actionButton({ kind: 'equip-style', styleId: null }, selected ? 'Wear this body’s original clothing' : 'Original clothing selected')}<div class="s-life-grid s-style-grid">${COSMETICS.filter(
      (s) => s.currency === 'coins',
    )
      .map(
        (style) =>
          `<article><canvas data-style-preview="${style.id}" width="96" height="112" aria-label="${esc(style.name)} preview"></canvas><h3>${esc(style.name)}</h3><p>${esc(style.description)}</p>${game.progression.ownedStyles.includes(style.id) ? actionButton({ kind: 'equip-style', styleId: style.id }, selected === style.id ? 'Wearing this' : 'Wear in this body') : actionButton({ kind: 'buy-style', styleId: style.id }, 'Learn pattern')}</article>`,
      )
      .join('')}</div>`;
  }
  function render() {
    const current = ++revision;
    actions.length = 0;
    container.innerHTML = `<nav class="s-life-tabs" aria-label="Life disciplines">${(['purpose', 'skills', 'homes', 'wardrobe', 'store'] as LifeTab[]).map((t) => `<button data-life-tab="${t}" aria-current="${t === tab ? 'page' : 'false'}">${{ purpose: 'Calling', skills: 'Professions', homes: 'Home & garden', wardrobe: 'Clothing', store: 'Cosmetic shop' }[t]}</button>`).join('')}</nav><div class="s-life-balance">${esc(game.player.bodyName)} · ${game.player.coins} coins · ${game.carried}/${game.capacity} belongings</div><p class="s-life-message" role="status">${esc(message)}</p><div id="s-life-panel">${tab === 'purpose' ? purpose() : tab === 'skills' ? skills() : tab === 'homes' ? homes() : tab === 'wardrobe' ? wardrobe() : '<p>Checking the cosmetic shop…</p>'}</div>`;
    container.querySelectorAll<HTMLButtonElement>('[data-life-tab]').forEach(
      (button) =>
        (button.onclick = () => {
          tab = button.dataset.lifeTab as LifeTab;
          message = '';
          render();
        }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-life-action]').forEach(
      (button) =>
        (button.onclick = () => {
          const result = game.progress(actions[Number(button.dataset.lifeAction)]);
          message = result.message;
          onChange();
          render();
        }),
    );
    container
      .querySelectorAll<HTMLCanvasElement>('[data-style-preview]')
      .forEach((canvas) =>
        drawPortrait(
          canvas.getContext('2d')!,
          previewCosmetic(game.player.appearance, canvas.dataset.stylePreview!),
        ),
      );
    const select = container.querySelector<HTMLSelectElement>('#s-home-select');
    if (select)
      select.onchange = () => {
        selectedHome = select.value;
        render();
      };
    const rest = container.querySelector<HTMLButtonElement>('#s-home-rest');
    if (rest)
      rest.onclick = () => {
        message = game.restAtHome(selectedHome)
          ? 'Rested. Warmth returns, and the garden has had time to grow.'
          : 'Return home and move away from danger before resting.';
        onChange();
        render();
      };
    container.querySelectorAll<HTMLButtonElement>('[data-plant-plot]').forEach(
      (button) =>
        (button.onclick = () => {
          const plot = Number(button.dataset.plantPlot),
            plant = container.querySelector<HTMLSelectElement>(`[data-plot-plant="${plot}"]`)!
              .value as 'cequin' | 'heartleaf' | 'emberroot';
          message = game.progress({ kind: 'plant', homeId: selectedHome, plot, plant }).message;
          onChange();
          render();
        }),
    );
    if (tab === 'store')
      void import('./store').then(({ mountStore }) => {
        if (current === revision && container.isConnected)
          void mountStore(container.querySelector<HTMLElement>('#s-life-panel')!, game, onChange);
      });
  }
  render();
}
