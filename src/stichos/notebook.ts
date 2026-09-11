import { JOURNAL_ENTRIES, PLANT_NOTES, GLOSSARY } from './lore';
import { plantGenome } from './botany';
import type { PlantKind } from './botany';
import type { Stichos } from './session';

export type NotebookSection = 'years' | 'botany' | 'glossary' | 'threads';
export interface NotebookView {
  section: NotebookSection;
  entry: number;
  plant: number;
  plain: boolean;
  open: boolean;
}
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const paragraphs = (text: readonly string[]) => text.map((p) => `<p>${esc(p)}</p>`).join('');
const paperTextures = new Map<number, string>();
/** A small cached procedural fibre tile: no directional hatch or downloaded paper asset. */
function paperTexture(seed: number) {
  const key = seed >>> 0;
  const previous = paperTextures.get(key);
  if (previous) return previous;
  let state = (key ^ 0x5b274ac1) >>> 0;
  const sample = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const fibres: string[] = [];
  for (let i = 0; i < 52; i++) {
    const x = (sample() * 384).toFixed(1),
      y = (sample() * 384).toFixed(1);
    const dx = ((sample() - 0.5) * 5).toFixed(1),
      dy = ((sample() - 0.5) * 3).toFixed(1);
    fibres.push(`<path d="M${x} ${y}l${dx} ${dy}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".71" numOctaves="3" stitchTiles="stitch" seed="${key % 65535}"/><feColorMatrix type="matrix" values="0 0 0 0 .26 0 0 0 0 .21 0 0 0 0 .13 .12 0 0 0 0"/></filter><path fill="#fff" filter="url(#grain)" d="M0 0h384v384H0z"/><g fill="none" stroke="#716548" stroke-width=".6" opacity=".12">${fibres.join('')}</g></svg>`;
  const texture = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  paperTextures.set(key, texture);
  while (paperTextures.size > 8) paperTextures.delete(paperTextures.keys().next().value!);
  return texture;
}

/** An ink study from the same botanical construction parameters as world plants. */
function botanicalStudy(seed: number, kind: PlantKind) {
  const g = plantGenome(seed, kind);
  const paths: string[] = [];
  const top = 152 - g.stemHeight * 2.7;
  paths.push(`<path d="M98 161 Q${92 + g.lean} 113 ${100 + g.lean} ${top}"/>`);
  for (let n = 0; n < g.branching; n++) {
    const side = n % 2 ? 1 : -1,
      y = 145 - n * (105 / g.branching);
    const x = 98 + side * (18 + (n % 3) * 7),
      tip = y - 19;
    paths.push(`<path d="M98 ${y + 12} Q${x} ${y + 2} ${x} ${tip}"/>`);
    if (kind === 'mushroom') {
      paths.push(
        `<path d="M${x - 17} ${tip} Q${x} ${tip - 29} ${x + 17} ${tip} Q${x} ${tip + 8} ${x - 17} ${tip}Z"/><path d="M${x - 10} ${tip + 1}l7 -5m6 0l6 5"/>`,
      );
    } else {
      for (let k = 0; k < 3; k++) {
        const ly = tip + k * 8,
          dx = g.leafLength * 1.5,
          dy = g.leafWidth * 1.8;
        paths.push(
          `<path d="M${x} ${ly}q${-dx} ${-dy - 10} ${-dx - 2} -5q3 ${dy + 8} ${dx + 2} 5m0 0q${dx} ${-dy - 10} ${dx + 2} -5q-3 ${dy + 8} ${-dx - 2} 5"/>`,
        );
      }
    }
  }
  for (let n = 0; n < g.rootMass; n++)
    paths.push(
      `<path d="M98 156q${(n - g.rootMass / 2) * 7} 15 ${(n - g.rootMass / 2) * 11} 23"/>`,
    );
  return `<svg class="s-botanical-study" viewBox="0 0 210 210" role="img" aria-label="Ink study of ${kind === 'mushroom' ? 'winter fungi' : kind}"><g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">${paths.join('')}<path stroke-dasharray="2 3" opacity=".5" d="M25 174H177M161 33v112"/><path d="M157 33h8m-8 112h8"/></g><text x="112" y="198">T. Bishop</text></svg>`;
}

function threads(game: Stichos) {
  return `<div class="s-notebook-threads"><section><h3>Threads to follow</h3>${game.quests.map((q) => `<article class="s-quest-record ${q.complete ? 'complete' : ''}"><small>${q.complete ? 'Resolved' : 'Unfinished'}</small><h4>${esc(q.title)}</h4><p>${esc(q.description)}</p><b>${esc(q.objective)}</b>${q.target ? `<span>Near ${Math.round(q.target.x)}, ${Math.round(q.target.y)}</span>` : ''}${!q.complete ? `<button class="s-track-quest" data-track-quest="${esc(q.id)}">Follow this thread</button>` : ''}</article>`).join('')}<h3>The six families</h3>${game.world.clans.map((c, i) => `<div class="s-clan-row"><i style="background:${c.color}"></i><strong>${esc(c.name)}</strong><span>Trust ${game.reputation[i] ?? 0}</span></div>`).join('')}</section><section><h3>Since this morning</h3><p class="s-notebook-caption">These pages change with the life you lead.</p>${game.journal
    .slice()
    .reverse()
    .map((e) => `<article class="s-memory"><h4>${esc(e.title)}</h4><p>${esc(e.text)}</p></article>`)
    .join('')}</section></div>`;
}

export function notebookHtml(game: Stichos, view: NotebookView) {
  if (game.hasNotebook && !view.open)
    return `<div class="s-notebook is-shut"><div class="s-notebook-cover"><span class="s-cover-owner">T H E O &nbsp; B I S H O P</span><div class="s-cover-frame"><span class="s-cover-rule">PRIVATE RECORD · VOL. I</span><h2>The years<br>between<br>two breaths.</h2><div class="s-cover-plant">${botanicalStudy(game.world.seed, 'cequin')}</div><p>3866 — 3886<br>Vespera · planet Stíchos</p></div><p class="s-cover-note">If these hands are no longer mine,<br>leave this book in their keeping.</p><button id="s-notebook-open">Open notebook</button><button id="s-journal-return">Put away <kbd>J / Esc</kbd></button><span class="s-cover-binding" aria-hidden="true"></span></div></div>`;
  const tabs: [NotebookSection, string][] = [
    ['years', 'Twenty stíchoi'],
    ['botany', 'Botany'],
    ['glossary', 'Glossary'],
    ['threads', 'Current threads'],
  ];
  let contents = '',
    page = '',
    footer = '';
  if (view.section === 'years' || view.section === 'botany') {
    const years = view.section === 'years';
    const index = years ? view.entry : view.plant;
    const list = years ? JOURNAL_ENTRIES : PLANT_NOTES;
    contents = `<aside class="s-notebook-contents"><span class="s-notebook-overline">${years ? 'The years in the margins' : 'Botanical field studies'}</span><label class="s-notebook-select">Choose a leaf<select id="s-notebook-select">${list.map((e, i) => `<option value="${i}" ${i === index ? 'selected' : ''}>${'year' in e ? e.year + ' · ' : ''}${esc(e.title)}</option>`).join('')}</select></label><nav aria-label="Notebook leaves">${list.map((e, i) => `<button data-leaf="${i}" ${i === index ? 'aria-current="page"' : ''}><small>${'year' in e ? e.year : `Study ${i + 1}`}</small><span>${esc(e.title)}</span></button>`).join('')}</nav><div class="s-notebook-marginalia"><p class="s-notebook-aside">Ten years on Earth.<br>Twenty stíchoi here.<br>One unfinished return.</p><span aria-hidden="true">${botanicalStudy(game.world.seed, 'cequin')}</span></div></aside>`;
    if (years) {
      const e = JOURNAL_ENTRIES[index];
      page = `<article class="s-notebook-leaf" aria-labelledby="s-leaf-title"><span class="s-notebook-overline">${e.year} · private record</span><h3 id="s-leaf-title" tabindex="-1">${esc(e.title)}</h3><p class="s-leaf-subtitle">${esc(e.subtitle)}</p><div class="s-handwriting">${paragraphs(e.paragraphs)}</div><aside class="s-margin-note"><span>In the margin</span><p>${esc(e.margin)}</p></aside><div class="s-leaf-signature">Theo Bishop</div></article>`;
    } else {
      const e = PLANT_NOTES[index];
      const kind = (['cequin', 'heartleaf', 'emberroot', 'mushroom'] as const)[index];
      page = `<article class="s-notebook-leaf s-plant-leaf" aria-labelledby="s-leaf-title"><span class="s-notebook-overline">Field study ${index + 1} · Stíchos</span><h3 id="s-leaf-title" tabindex="-1">${esc(e.title)}</h3><p class="s-leaf-subtitle">${esc(e.subtitle)}</p><figure>${botanicalStudy(game.world.seed, kind)}<figcaption>A study of form.<br>Inspect each living specimen.</figcaption></figure><div class="s-handwriting">${paragraphs(e.paragraphs)}</div><aside class="s-margin-note"><span>Field observation</span><p>${esc(e.observation)}</p></aside></article>`;
    }
    footer = `<button id="s-leaf-prev" ${index === 0 ? 'disabled' : ''}>← Previous leaf</button><span>Folio ${String(index + 1).padStart(2, '0')} / ${list.length}</span><button id="s-leaf-next" ${index === list.length - 1 ? 'disabled' : ''}>Next leaf →</button>`;
  } else if (view.section === 'glossary') {
    page = `<article class="s-notebook-leaf s-glossary-leaf"><span class="s-notebook-overline">Words learned by living here</span><h3 id="s-leaf-title" tabindex="-1">A language for this life.</h3><label class="s-glossary-search">Find a word<input id="s-glossary-search" type="search" placeholder="Stíchos, cequin, Sallas…" autocomplete="off"></label><dl class="s-glossary">${GLOSSARY.map((e) => `<div data-glossary="${esc((e.term + ' ' + e.definition).toLocaleLowerCase())}"><dt>${esc(e.term)}</dt><dd>${esc(e.definition)}</dd></div>`).join('')}</dl><p id="s-glossary-empty" hidden>No entry contains those words.</p></article>`;
  } else {
    page = `<article class="s-notebook-leaf s-threads-leaf"><span class="s-notebook-overline">3886 · the present investigation</span><h3 id="s-leaf-title" tabindex="-1">What I choose to change.</h3>${threads(game)}</article>`;
  }
  return `<div class="s-notebook ${game.hasNotebook ? 'physical-book' : 'remembered-book'} ${view.plain ? 'plain-type' : ''}" style="--s-paper-grain:${esc(paperTexture(game.world.seed))}"><header class="s-notebook-header"><div><span class="s-chapter">${game.hasNotebook ? 'Theo Bishop · private notebook' : 'Theo Bishop · remembered pages'}</span><h2>Twenty stíchoi of silence.</h2><p>${game.hasNotebook ? '3866—3886 · Vespera, planet Stíchos' : 'The paper notebook remains with the priest. These words survive in your memory.'}</p></div><button id="s-journal-return" aria-label="${game.hasNotebook ? 'Close notebook cover' : 'Leave remembered pages'}">${game.hasNotebook ? 'Close book' : 'Return'} <kbd>J / Esc</kbd></button></header><nav class="s-notebook-tabs" aria-label="Notebook sections">${tabs.map(([id, text]) => `<button data-notebook-section="${id}" aria-pressed="${id === view.section}">${text}</button>`).join('')}</nav><div class="s-notebook-spread ${contents ? '' : 'single-leaf'}">${contents}${page}</div><footer class="s-notebook-footer"><div class="s-notebook-pages">${footer}</div><div class="s-notebook-tools"><button id="s-notebook-intro">Remember the beginning</button><button id="s-notebook-type" aria-label="Use plain type" aria-pressed="${view.plain}">${view.plain ? 'Handwriting' : 'Plain type'}</button></div></footer></div>`;
}
