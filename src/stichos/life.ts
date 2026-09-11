import './compact.css';
import { renderCompact } from './compact-view';
import type { CompactAction } from './compact';
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
import { drawHumanoid } from './art';
import { weaponIcon } from './equipment';
import { furnitureIcon } from './progression-art';
import { forgeMaterials, FORGE_CORES, FORGE_SPANS } from './forge';
import type { ForgeRecipe } from './forge';
import { artifactIcon } from './artifact-art';
import type { ArtifactGenome } from './artifacts';
import type { LaborKind, ToolKind } from './labor';
import { artifactToolKind } from './labor';
import { toolIcon } from './labor-art';

const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
type LifeTab =
  | 'purpose'
  | 'compact'
  | 'skills'
  | 'forge'
  | 'discover'
  | 'estate'
  | 'homes'
  | 'wardrobe'
  | 'store';
export function mountLife(
  container: HTMLElement,
  game: Stichos,
  onChange: () => void,
  initialTab: LifeTab = 'purpose',
  initialDesign?: string,
  sharedWorld = false,
  onTrack?: (id: string) => void,
) {
  let tab: LifeTab = initialTab;
  let inventionOffset = 0;
  let design = initialDesign ?? game.nextArtifactDesign;
  const forgeRecipe: ForgeRecipe = {
    technology: game.equipmentTechnology,
    kind: game.player.appearance.weapon === 'none' ? 'staff' : game.player.appearance.weapon,
    material: 0,
    core: 'breath',
    span: 'balanced',
  };
  let selectedHome = game.progression.homes[0]?.id ?? '';
  let message = '';
  let revision = 0;
  let selectedPattern = COSMETICS.find((s) => s.currency === 'coins')!.id;
  let sectionIndex = 0;
  let changedTab = false;
  const actions: ProgressionAction[] = [];
  function purpose() {
    if (game.personalStory) {
      const personal = game.personalStory;
      return `<article class="s-life-story"><small>${esc(personal.subtitle)}</small><h3>${esc(personal.title)}</h3><p>${esc(personal.worldContext)}</p><p>${esc(personal.purpose)}</p></article><h3>Your commitments</h3><div class="s-life-grid">${personal.obligations.map((o) => `<article><small>${o.complete ? 'Kept' : 'Unfinished'}</small><h4>${esc(o.title)}</h4><p>${esc(o.description)}</p><progress value="${o.progress}" max="${o.goal}" aria-label="${esc(o.title)}"></progress><p>${o.progress}/${o.goal} · ${Math.round(o.target.x)}, ${Math.round(o.target.y)}</p></article>`).join('')}</div><h3>The people in this life</h3><div class="s-life-grid">${personal.relationships.map((r) => `<article><small>${esc(r.role)} · ${esc(r.stance)}</small><h4>${esc(r.name)}</h4><p>${esc(r.reason)}</p><p>${r.trusted ? 'Trusted' : r.met ? 'Met in this life' : 'An unfinished conversation'} · ${Math.round(r.target.x)}, ${Math.round(r.target.y)}</p></article>`).join('')}</div><h3>What you remember</h3><div class="s-life-grid">${personal.history.map((h) => `<article><small>Age ${h.age}</small><h4>${esc(h.title)}</h4><p>${esc(h.text)}</p></article>`).join('')}</div><h3>Local commissions</h3><p>${game.freeLife.contract ? esc(game.freeLife.contract.description) : 'Visit a noticeboard for paid work. Your profession, relationships and the needs of this place give that work a purpose.'}</p>`;
    }
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
  function publicWork() {
    const life = game.freeLife,
      job = life.contract;
    return `<article class="s-life-story"><small>${esc(game.world.civilization?.name)} · ${life.contractsCompleted} commissions completed</small><h3>Build a livelihood here.</h3><p>Settlements pay for fresh supplies, prepared goods, cultivated plants and safer roads. Accept a noticeboard commission before doing the work, then return to its issuer for payment.</p></article><h3>Your current commission</h3>${job ? `<article><h4>${esc(job.title)}</h4><p>${esc(job.description)}</p><progress value="${job.progress}" max="${job.required}" aria-label="Commission progress"></progress><p>${job.progress}/${job.required} · ${job.reward} coins on delivery<br>${esc(job.town)} · ${Math.round(job.board.x)}, ${Math.round(job.board.y)}</p></article>` : '<p>No commission accepted. Look for a noticeboard in a settlement. The issuer and work site appear in your notebook and atlas.</p>'}<h3>A working life</h3><div class="s-life-grid">${life.milestones.map((goal) => `<article><small>${goal.complete ? 'Accomplished' : `${goal.progress}/${goal.goal}`}</small><h4>${esc(goal.title)}</h4><p>${esc(goal.description)}</p><progress value="${goal.progress}" max="${goal.goal}" aria-label="${esc(goal.title)}"></progress></article>`).join('')}</div>`;
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
    return `<p>What you learn travels with your mind. A weapon’s improvements belong to the body that carries it.</p><div class="s-life-grid">${(
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
        return `<article>${weaponIcon(game.weaponSeed(weapon), weapon, 84)}<h3>${esc(p.name)}</h3><p>Rank ${rank}/3 · ${p.damage} strength<br>${p.range.toFixed(2)} reach · ${p.cooldown.toFixed(2)}s recovery</p>${actionButton({ kind: 'upgrade', weapon }, rank === 3 ? 'Fully improved' : 'Improve weapon')}</article>`;
      })
      .join('')}</div>`;
  }
  function forge() {
    const preview = game.forgePreview(forgeRecipe),
      resolved = preview.construction;
    const current = game.weaponProfile(forgeRecipe.kind);
    const price = resolved
      ? [
          `${resolved.cost.coins} coins`,
          ...Object.entries(resolved.cost.items).map(([item, amount]) => `${amount} ${item}`),
        ].join(' · ')
      : '';
    return `<p>Build a weapon from its parts. Material sets mass, proportions shape reach and recovery, and a living core changes what a successful hit does. Your choices resolve into an actual generated weapon.</p><div class="s-forge-layout"><div class="s-forge-controls"><label>Weapon<select id="s-forge-kind">${(['staff', 'sword', 'bow'] as const).map((kind) => `<option value="${kind}" ${forgeRecipe.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}</select></label><label>Structural material<select id="s-forge-material">${forgeMaterials(
      forgeRecipe.kind,
      forgeRecipe.technology,
    )
      .map(
        (material, index) =>
          `<option value="${index}" ${forgeRecipe.material === index ? 'selected' : ''}>${esc(material)}</option>`,
      )
      .join(
        '',
      )}</select></label><label>Living core<select id="s-forge-core">${FORGE_CORES.map((core) => `<option value="${core.id}" ${forgeRecipe.core === core.id ? 'selected' : ''}>${esc(core.name)}</option>`).join('')}</select></label><label>Proportions<select id="s-forge-span">${FORGE_SPANS.map((span) => `<option value="${span.id}" ${forgeRecipe.span === span.id ? 'selected' : ''}>${esc(span.name)}</option>`).join('')}</select></label><p>${esc(FORGE_SPANS.find((span) => span.id === forgeRecipe.span)!.description)}</p></div><article class="s-forge-preview">${resolved ? `${weaponIcon(resolved.seed, forgeRecipe.kind, 160)}<small>${esc(resolved.profile.construction)}</small><h3>${esc(resolved.profile.name)}</h3><dl><div><dt>Strength</dt><dd>${resolved.profile.damage} <small>current ${current.damage}</small></dd></div><div><dt>Reach</dt><dd>${resolved.profile.range.toFixed(2)} <small>current ${current.range.toFixed(2)}</small></dd></div><div><dt>Recovery</dt><dd>${resolved.profile.cooldown.toFixed(2)}s <small>current ${current.cooldown.toFixed(2)}s</small></dd></div></dl><p>${esc(resolved.profile.effectDescription)}</p>` : '<p>This construction could not be resolved. Choose another combination.</p>'}</article></div><p class="s-forge-price">${esc(price)}</p><button id="s-forge-build" class="s-primary" ${preview.ok ? '' : 'disabled'}>Forge and equip this construction</button><p id="s-forge-requirement">${esc(preview.message)}</p><p>The work requires crafting level 2 and a nearby field or home workbench. Its materials and coins leave this body’s pack. The completed weapon stays with this body when your mind travels.</p>`;
  }
  function inventionStats(genome: ArtifactGenome) {
    const p = genome.properties;
    return `<dl class="s-invention-stats">${genome.delivery !== 'consume' ? `<div><dt>Strength</dt><dd>${p.damage}</dd></div><div><dt>Reach</dt><dd>${p.range.toFixed(2)}</dd></div><div><dt>Recovery</dt><dd>${p.cooldown.toFixed(2)}s</dd></div>` : ''}${[
      ['Healing', p.healing],
      ['Breath', p.breath],
      ['Warmth', p.warmth],
      ['Harvest', p.harvest],
    ]
      .filter(([, value]) => Number(value) > 0)
      .map(([name, value]) => `<div><dt>${name}</dt><dd>+${value}</dd></div>`)
      .join('')}</dl>`;
  }
  function discover() {
    const preview = game.artifactPreview(design),
      g = preview.genome;
    const owned = game.artifacts.find((a) => a.design === g?.design);
    return `<p>Sketch a construction from branches, blades, chambers, roots and living tissues. Its shape and materials determine what it does.</p><form id="s-invention-form"><label>A phrase for this design<input id="s-invention-design" value="${esc(design)}" maxlength="64" autocomplete="off" spellcheck="false"></label><div class="s-invention-buttons"><button type="submit">Sketch this phrase</button><button type="button" id="s-invention-next">Next invention →</button></div></form>${
      g
        ? `<article class="s-invention-sheet"><div class="s-invention-drawing"><img src="${artifactIcon(g.design, 200)}" alt="${esc(g.name)}"><small>${g.parts.length} connected parts · ${esc({ consume: 'Single-use preparation', projectile: 'Ranged implement', beam: 'Focused emitter', contact: 'Handheld implement', pulse: 'Area emitter' }[g.delivery] ?? 'Working implement')}</small></div><div><span class="s-chapter">${esc(g.category)} · a new construction</span><h3>${esc(g.name)}</h3><p>${esc(g.description)}</p>${inventionStats(g)}${artifactToolKind(g) ? `<p>Working purpose: ${artifactToolKind(g)} · requires repeated tool strokes.</p>` : ''}<small>${g.delivery === 'consume' ? 'Using this consumes the physical object.' : 'Restorative effects apply only after a successful hit. This implement remains with its bearer.'}</small></div></article><details class="s-invention-parts"><summary>Read the construction</summary><div class="s-invention-part-list">${g.parts.map((part, i) => `<span><b>${i + 1}. ${esc(part.kind)}</b>${esc(part.material.name)}<small>${part.length.toFixed(1)} span · ${part.width.toFixed(1)} breadth<br>hardness ${part.material.hardness.toFixed(2)} · density ${part.material.density.toFixed(2)}</small></span>`).join('')}</div></details><p class="s-forge-price">${g.cost.coins} coins · ${Object.entries(
            g.cost.items,
          )
            .map(([id, amount]) => `${amount} ${esc(id)}`)
            .join(
              ' · ',
            )}</p>${owned ? `<button id="s-invention-act" class="s-primary" ${owned.equipped ? 'disabled' : ''}>${owned.equipped ? 'Held by this body' : g.delivery === 'consume' ? 'Use this invention' : 'Equip this invention'}</button>` : `<button id="s-invention-build" class="s-primary" ${preview.ok ? '' : 'disabled'}>Make this invention</button>`}`
        : ''
    }<p id="s-invention-requirement">${esc(preview.message)}</p><p>New sketches use your world and your next invention number. You can also enter your own phrase. The same phrase reproduces the same construction; keep exploring new phrases and sketches.</p><h3>This body’s inventions · ${game.artifacts.length}</h3><div class="s-invention-owned">${game.artifacts.map((a) => `<article><button data-invention-inspect="${esc(a.design)}"><img src="${artifactIcon(a.design, 88)}" alt=""><strong>${esc(a.genome.name)}</strong><small>${esc(a.genome.delivery)}${a.equipped ? ' · equipped' : ''}</small></button><button data-invention-action="${esc(a.design)}" ${a.equipped ? 'disabled' : ''}>${a.equipped ? 'Equipped' : a.genome.delivery === 'consume' ? 'Use' : 'Equip'}</button>${a.toolKind ? `<p>${a.toolKind} · ${a.durability}/${a.maxDurability} condition</p><button data-invention-repair="${esc(a.design)}" ${a.durability === a.maxDurability ? 'disabled' : ''}>Repair · 4 coins + wood + ore</button>` : ''}<button data-invention-salvage="${esc(a.design)}">Salvage materials</button></article>`).join('') || '<p>No inventions in this body’s pack yet. Make one at a workbench when the materials are ready.</p>'}</div>`;
  }
  function estate() {
    const residence = game.estate.residence;
    return `<article class="s-life-story"><small>${game.universeLife ? esc(game.player.bodyName) + '’s household' : 'The priest’s household · established over twenty stíchoi'}</small><h3>A life already lived here.</h3><p>${esc(game.estate.description)}</p>${residence ? `<p><b>${esc(residence.name)}</b> · ${Math.round(residence.x)}, ${Math.round(residence.y)}</p>` : ''}<p>Timber and ore maintain tools, furnish homes and make expedition equipment. Living plants keep clinics supplied. Wages buy another person’s time; your choice of whom to trust shapes this household.</p></article><h3>Working tools · this body’s belongings</h3><p>Equip an axe to chop wood, a pickaxe to mine, or a sickle to gather plants. Press E for each stroke. Working consumes energy and wears the tool; return to a workbench for repairs.</p><div class="s-life-grid s-tool-grid">${(
      ['axe', 'pickaxe', 'sickle'] as ToolKind[]
    )
      .map((kind) => {
        const tool = game.tools.find((t) => t.kind === kind);
        return `<article>${tool ? `<img class="s-tool-preview" src="${toolIcon(tool.seed, kind, 88)}" alt="${esc(kind)}">` : ''}<small>${esc(kind)}${tool?.equipped && !game.activeArtifact ? ' · selected for work' : ''}</small><h4>${tool ? esc(tool.profile.name) : `No ${kind} in this body’s keeping`}</h4>${tool ? `<progress value="${tool.durability}" max="${tool.profile.maxDurability}" aria-label="${kind} condition"></progress><p>${tool.durability}/${tool.profile.maxDurability} condition<br>${tool.profile.staminaCost} energy per stroke · ${tool.profile.cooldown.toFixed(2)}s recovery</p><button data-tool-equip="${kind}" ${tool.equipped && !game.activeArtifact ? 'disabled' : ''}>${tool.equipped && !game.activeArtifact ? 'Selected' : 'Select tool'}</button><button data-tool-repair="${kind}">Repair at workbench</button>` : `<button data-tool-buy="${kind}">Obtain a working ${kind}</button>`}</article>`;
      })
      .join(
        '',
      )}</div><h3>The people who work with you</h3><p>Choose people individually. Their families, skills and motives matter; employment does not erase their own judgment.</p>${sharedWorld ? '<p class="s-life-message">Household assignments are available while playing alone. Leave the shared room to hire or collect work.</p>' : ''}<div class="s-life-grid s-staff-grid">${
      game.staff
        .map(
          (worker) =>
            `<article><small>${esc(worker.specialty)} · ${worker.competence}/100 competence</small><h4>${esc(worker.name)}</h4><p>${esc(worker.motive)}</p><p>${worker.loyalty}/100 trust in the household</p><button data-staff-trust="${esc(worker.id)}" data-trusted="${worker.trusted ? 'no' : 'yes'}">${worker.trusted ? 'Withdraw my trust' : 'Entrust household work'}</button>${(
              ['forestry', 'quarry', 'garden'] as LaborKind[]
            )
              .map((kind) => {
                const preview = game.laborPreview(worker.id, kind);
                return `<div class="s-life-action"><button data-staff-hire="${esc(worker.id)}" data-labor-kind="${kind}" ${!preview.ok || sharedWorld ? 'disabled' : ''}>Commission ${kind}</button><small>${esc(preview.ok ? `${preview.wages} coins · ${Math.ceil(preview.order.endsAt - game.time)} seconds of work` : preview.reason)}</small></div>`;
              })
              .join('')}</article>`,
        )
        .join('') ||
      '<p>Meet peaceful residents and learn who they are before entrusting household work.</p>'
    }</div><h3>Agreed work</h3><p>Work advances while you are in the world. Menus pause the clock. Workers walk to each resource, use their tools and return. Collect returned work near the worker or at your residence. If a route is blocked, clear the obstruction and ask them to try again.</p><div class="s-life-grid">${
      game.laborOrders
        .filter((o) => o.status === 'working' || o.journey?.phase === 'returning')
        .map(
          (order) =>
            `<article><small>${esc(order.kind)} · ${order.wages} coins paid</small><h4>${esc(order.workerName)}</h4><progress value="${Math.max(0, game.time - order.startedAt)}" max="${order.endsAt - order.startedAt}"></progress><p><b>${esc(order.status === 'cancelled' ? 'Returning from a cancelled assignment' : { outbound: 'Walking to the resource', working: 'Working with tools', returning: 'Returning with supplies', ready: 'Back with the agreed work', blocked: 'Route blocked' }[order.journey?.phase ?? 'outbound'])}</b><br>${Math.min(order.allocations.length, order.journey?.allocation ?? 0)}/${order.allocations.length} resource sites worked${order.journey?.phase === 'working' ? ` · ${order.journey.strokes} tool strokes at this site` : ''}<br>${order.journey?.reason ? esc(order.journey.reason) : `${Math.max(0, Math.ceil(order.endsAt - game.time))} seconds left in the paid shift`}<br>${order.allocations.map((a) => `${a.amount} ${esc(a.item)}`).join(' · ')}</p>${order.status === 'working' ? `<button data-labor-collect="${esc(order.id)}" ${sharedWorld || game.time < order.endsAt || order.journey?.phase !== 'ready' ? 'disabled' : ''}>Collect returned work</button>${order.journey?.phase === 'blocked' ? `<button data-labor-retry="${esc(order.id)}">Try the route again</button>` : ''}<button data-labor-cancel="${esc(order.id)}">Cancel assignment</button>` : ''}</article>`,
        )
        .join('') ||
      '<p>No assignment is underway. Select someone you trust and agree on paid work above.</p>'
    }</div>`;
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
    const styles = COSMETICS.filter((s) => s.currency === 'coins');
    const style = styles.find((s) => s.id === selectedPattern) ?? styles[0];
    return `<p>Patterns change appearance without granting power. Each body keeps its own outfit.</p><div class="s-wardrobe-workspace"><div class="s-outfit-pair"><canvas data-style-preview="${style.id}" data-facing="down" width="192" height="208" aria-label="${esc(style.name)} full outfit, front"></canvas><canvas data-style-preview="${style.id}" data-facing="up" width="192" height="208" aria-label="${esc(style.name)} full outfit, back"></canvas></div><div><label>Clothing pattern<select id="s-pattern-select">${styles.map((s) => `<option value="${s.id}" ${s.id === style.id ? 'selected' : ''}>${esc(s.name)}${game.progression.ownedStyles.includes(s.id) ? ' · owned' : ''}</option>`).join('')}</select></label><h3>${esc(style.name)}</h3><p>${esc(style.description)}</p>${game.progression.ownedStyles.includes(style.id) ? actionButton({ kind: 'equip-style', styleId: style.id }, selected === style.id ? 'Wearing this' : 'Wear in this body') : actionButton({ kind: 'buy-style', styleId: style.id }, 'Learn pattern')}${actionButton({ kind: 'equip-style', styleId: null }, selected ? 'Wear original clothing' : 'Original clothing selected')}</div></div>`;
  }
  function render() {
    const current = ++revision;
    const active = container.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    const oldScroll = container.querySelector('#s-life-panel')?.scrollTop ?? 0;
    const focusId = active?.id,
      focusTab = active?.dataset.lifeTab;
    actions.length = 0;
    container.innerHTML = `<nav class="s-life-tabs" role="tablist" aria-label="Life disciplines">${(['purpose', 'compact', 'skills', 'forge', 'discover', 'estate', 'homes', 'wardrobe', 'store'] as LifeTab[]).map((t) => `<button data-life-tab="${t}" role="tab" aria-selected="${t === tab}" aria-controls="s-life-panel" aria-current="${t === tab ? 'page' : 'false'}">${{ purpose: 'Calling', compact: game.universeLife ? 'Public work' : 'Winter Compact', skills: 'Professions', forge: 'Forge', discover: 'Invent', estate: 'Household & tools', homes: 'Home & garden', wardrobe: 'Clothing', store: 'Cosmetic shop' }[t]}</button>`).join('')}</nav><div class="s-life-balance">${esc(game.player.bodyName)} · ${game.player.coins} coins · ${game.carried}/${game.capacity} belongings</div><p class="s-life-message" role="status">${esc(message)}</p><div id="s-life-sections"></div><div id="s-life-panel" role="tabpanel" tabindex="0">${tab === 'purpose' ? purpose() : tab === 'compact' ? (game.universeLife ? publicWork() : renderCompact(game.winterCompact.state, game.winterCompact.plan, game.inventory, game.player.coins)) : tab === 'skills' ? skills() : tab === 'forge' ? forge() : tab === 'discover' ? discover() : tab === 'estate' ? estate() : tab === 'homes' ? homes() : tab === 'wardrobe' ? wardrobe() : '<p>Checking the cosmetic shop…</p>'}</div>`;
    container.querySelectorAll<HTMLButtonElement>('[data-life-tab]').forEach(
      (button) =>
        (button.onclick = () => {
          tab = button.dataset.lifeTab as LifeTab;
          sectionIndex = 0;
          changedTab = true;
          message = '';
          render();
        }),
    );
    container
      .querySelectorAll<HTMLButtonElement>('[data-compact-track]')
      .forEach((button) => (button.onclick = () => onTrack?.(button.dataset.compactTrack!)));
    const compactAction = (button: HTMLButtonElement, action: CompactAction) => {
      const preview = game.compactPreview(action);
      button.title = preview.message;
      button.disabled = !preview.ok;
      button.onclick = () => {
        message = game.actCompact(action).message;
        onChange();
        render();
      };
    };
    container
      .querySelectorAll<HTMLButtonElement>('[data-compact-survey]')
      .forEach((button) =>
        compactAction(button, { kind: 'survey', witnessId: button.dataset.compactSurvey! }),
      );
    container
      .querySelectorAll<HTMLButtonElement>('[data-compact-choose]')
      .forEach((button) =>
        compactAction(button, { kind: 'choose', choiceId: button.dataset.compactChoose! }),
      );
    container
      .querySelectorAll<HTMLButtonElement>('[data-compact-deliver]')
      .forEach((button) => compactAction(button, { kind: 'deliver' }));
    container.querySelectorAll<HTMLButtonElement>('[data-life-action]').forEach(
      (button) =>
        (button.onclick = () => {
          const result = game.progress(actions[Number(button.dataset.lifeAction)]);
          message = result.message;
          onChange();
          render();
        }),
    );
    container.querySelectorAll<HTMLCanvasElement>('[data-style-preview]').forEach((canvas) => {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      drawHumanoid(
        ctx,
        previewCosmetic(game.player.appearance, canvas.dataset.stylePreview!),
        96,
        171,
        4,
        canvas.dataset.facing === 'up' ? 0 : 2,
        0,
        false,
      );
    });
    const patternSelect = container.querySelector<HTMLSelectElement>('#s-pattern-select');
    if (patternSelect)
      patternSelect.onchange = () => {
        selectedPattern = patternSelect.value;
        render();
      };
    const select = container.querySelector<HTMLSelectElement>('#s-home-select');
    if (select)
      select.onchange = () => {
        selectedHome = select.value;
        render();
      };
    for (const key of ['kind', 'material', 'core', 'span'] as const) {
      const control = container.querySelector<HTMLSelectElement>(`#s-forge-${key}`);
      if (control)
        control.onchange = () => {
          if (key === 'material')
            forgeRecipe.material = Number(control.value) as ForgeRecipe['material'];
          else if (key === 'kind') forgeRecipe.kind = control.value as ForgeRecipe['kind'];
          else if (key === 'core') forgeRecipe.core = control.value as ForgeRecipe['core'];
          else forgeRecipe.span = control.value as ForgeRecipe['span'];
          message = '';
          render();
        };
    }
    const build = container.querySelector<HTMLButtonElement>('#s-forge-build');
    if (build)
      build.onclick = () => {
        message = game.forge(forgeRecipe).message;
        onChange();
        render();
      };
    const inventionForm = container.querySelector<HTMLFormElement>('#s-invention-form');
    if (inventionForm)
      inventionForm.onsubmit = (event) => {
        event.preventDefault();
        design = container.querySelector<HTMLInputElement>('#s-invention-design')!.value;
        render();
      };
    const nextInvention = container.querySelector<HTMLButtonElement>('#s-invention-next');
    if (nextInvention)
      nextInvention.onclick = () => {
        design = game.artifactDesign(++inventionOffset);
        message = '';
        render();
      };
    const makeInvention = container.querySelector<HTMLButtonElement>('#s-invention-build');
    if (makeInvention)
      makeInvention.onclick = () => {
        const result = game.createArtifact(design);
        message = result.message;
        onChange();
        render();
      };
    const useInvention = (chosen: string) => {
      const canonical = game.artifactPreview(chosen).genome?.design;
      const owned = game.artifacts.find((a) => a.design === canonical);
      if (!owned) return;
      message = (
        owned.genome.delivery === 'consume'
          ? game.useArtifact(owned.design)
          : game.equipArtifact(owned.design)
      ).message;
      onChange();
      render();
    };
    const currentInvention = container.querySelector<HTMLButtonElement>('#s-invention-act');
    if (currentInvention) currentInvention.onclick = () => useInvention(design);
    container
      .querySelectorAll<HTMLButtonElement>('[data-invention-action]')
      .forEach((button) => (button.onclick = () => useInvention(button.dataset.inventionAction!)));
    container.querySelectorAll<HTMLButtonElement>('[data-invention-inspect]').forEach(
      (button) =>
        (button.onclick = () => {
          design = button.dataset.inventionInspect!;
          render();
        }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-invention-repair]').forEach(
      (b) =>
        (b.onclick = () => {
          message = game.repairArtifact(b.dataset.inventionRepair!).message;
          onChange();
          render();
        }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-invention-salvage]').forEach(
      (b) =>
        (b.onclick = () => {
          message = game.salvageArtifact(b.dataset.inventionSalvage!).message;
          onChange();
          render();
        }),
    );
    const workAction = (result: { ok: boolean; message: string }) => {
      message = result.message;
      onChange();
      render();
    };
    container
      .querySelectorAll<HTMLButtonElement>('[data-tool-equip]')
      .forEach(
        (b) => (b.onclick = () => workAction(game.equipTool(b.dataset.toolEquip as ToolKind))),
      );
    container
      .querySelectorAll<HTMLButtonElement>('[data-tool-repair]')
      .forEach(
        (b) => (b.onclick = () => workAction(game.repairTool(b.dataset.toolRepair as ToolKind))),
      );
    container
      .querySelectorAll<HTMLButtonElement>('[data-tool-buy]')
      .forEach((b) => (b.onclick = () => workAction(game.buyTool(b.dataset.toolBuy as ToolKind))));
    container
      .querySelectorAll<HTMLButtonElement>('[data-staff-trust]')
      .forEach(
        (b) =>
          (b.onclick = () =>
            workAction(game.chooseEstateTrust(b.dataset.staffTrust!, b.dataset.trusted === 'yes'))),
      );
    container.querySelectorAll<HTMLButtonElement>('[data-staff-hire]').forEach(
      (b) =>
        (b.onclick = () => {
          if (!sharedWorld)
            workAction(game.hireLabor(b.dataset.staffHire!, b.dataset.laborKind as LaborKind));
        }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-labor-collect]').forEach(
      (b) =>
        (b.onclick = () => {
          if (!sharedWorld) workAction(game.collectLabor(b.dataset.laborCollect!));
        }),
    );
    container
      .querySelectorAll<HTMLButtonElement>('[data-labor-retry]')
      .forEach((b) => (b.onclick = () => workAction(game.retryLabor(b.dataset.laborRetry!))));
    container
      .querySelectorAll<HTMLButtonElement>('[data-labor-cancel]')
      .forEach((b) => (b.onclick = () => workAction(game.cancelLabor(b.dataset.laborCancel!))));
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
    const panel = container.querySelector<HTMLElement>('#s-life-panel')!;
    // Keep each discipline at its own beginning, and split long task families into compact pages.
    const headings = [...panel.children].filter((n) => n.tagName === 'H3');
    if (headings.length > 0) {
      const groups: HTMLElement[][] = [[]];
      const labels = ['Overview'];
      for (const node of [...panel.children] as HTMLElement[]) {
        if (node.tagName === 'H3') {
          groups.push([]);
          labels.push(node.textContent ?? 'Details');
        }
        groups[groups.length - 1].push(node);
      }
      if (!groups[0].length) {
        groups.shift();
        labels.shift();
      }
      sectionIndex = Math.min(sectionIndex, groups.length - 1);
      const nav = container.querySelector<HTMLElement>('#s-life-sections')!;
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Section in this discipline');
      labels.forEach((label, i) =>
        select.add(new Option(label, String(i), i === sectionIndex, i === sectionIndex)),
      );
      const show = () => {
        groups.forEach((group, i) => group.forEach((node) => (node.hidden = i !== sectionIndex)));
        panel.scrollTop = 0;
      };
      select.onchange = () => {
        sectionIndex = Number(select.value);
        show();
      };
      nav.append(select);
      show();
    }
    panel.querySelectorAll<HTMLElement>('.s-life-grid').forEach((grid) => {
      const cards = [...grid.children] as HTMLElement[];
      const count = innerWidth < 600 ? 1 : 3;
      if (cards.length <= count) return;
      let page = 0;
      const nav = document.createElement('div');
      nav.className = 's-card-pages';
      const prev = document.createElement('button'),
        next = document.createElement('button'),
        label = document.createElement('span');
      prev.textContent = '←';
      next.textContent = '→';
      prev.setAttribute('aria-label', 'Previous items');
      next.setAttribute('aria-label', 'Next items');
      const show = () => {
        cards.forEach((card, i) => (card.hidden = i < page * count || i >= (page + 1) * count));
        prev.disabled = !page;
        next.disabled = (page + 1) * count >= cards.length;
        label.textContent = `${page * count + 1}–${Math.min(cards.length, (page + 1) * count)} of ${cards.length}`;
      };
      prev.onclick = () => {
        page--;
        show();
      };
      next.onclick = () => {
        page++;
        show();
      };
      nav.append(prev, label, next);
      grid.after(nav);
      show();
    });
    panel.scrollTop = changedTab ? 0 : oldScroll;
    changedTab = false;
    const restoredFocus = focusId
      ? container.querySelector<HTMLElement>(`#${focusId}`)
      : focusTab
        ? container.querySelector<HTMLElement>(`[data-life-tab="${focusTab}"]`)
        : null;
    if (restoredFocus && !(restoredFocus as HTMLButtonElement).disabled)
      restoredFocus.focus({ preventScroll: true });
  }
  render();
}
