import './style.css';
import { Stichos, ITEMS, RECIPES } from './session';
import { StichosRenderer } from './render';
import { drawHumanoid } from './art';
import { itemIcon } from './icons';
import { parseSeed, formatSeed } from '../seed';
import { AudioDirector } from '../audio';
import { registerOffline } from '../offline';
import type { ItemId, Npc, Point, Prop } from './types';

void registerOffline();
const root = document.getElementById('app')!;
root.innerHTML = `<main class="s-shell">
 <header class="s-header"><a class="s-brand" href="?">VERSO<span>Destino: Stíchos</span></a><div class="s-location"><strong id="s-place">The cathedral quarter</strong><span id="s-coordinates">Stíchos · 3886</span></div><nav><button id="s-sound" title="Sound">♫</button><button id="s-journal" title="Journal (J)">Journal <kbd>J</kbd></button><button id="s-pause" aria-label="Pause">Ⅱ</button></nav></header>
 <section class="s-world-wrap"><canvas id="s-world" tabindex="0" aria-label="The continuous world of Stíchos. WASD or click to walk. E to interact."></canvas><div class="s-weather"><i></i><span id="s-weather">A cold morning</span></div><div class="s-mobile-status"><span>♥ <b id="s-mobile-hp"></b><i><em id="s-mobile-hp-bar"></em></i></span><span>Breath <b id="s-mobile-breath"></b><i><em id="s-mobile-breath-bar"></em></i></span></div><div class="s-compass">N<span>◇</span></div><div id="s-hover" class="s-hover" hidden></div><button id="s-context" class="s-context" hidden></button><div id="s-toast" class="s-toast" role="status" aria-live="polite"></div><div class="s-world-caption">The road disappears into snow.</div></section>
 <aside class="s-sidebar"><section class="s-person"><div class="s-person-heading"><canvas id="s-portrait" width="64" height="72" aria-label="Your current human host"></canvas><div><small id="s-body-label">A borrowed life</small><h1 id="s-person-name">Theo Bishop</h1></div><strong id="s-level">1</strong></div><div class="s-meter health"><label>Vitality <b id="s-hp-label"></b></label><div><i id="s-hp"></i></div></div><div class="s-meter breath"><label>Breath <b id="s-breath-label"></b></label><div><i id="s-breath"></i></div></div><div class="s-person-minor"><span id="s-warmth"></span><span id="s-stamina"></span></div><div class="s-xp"><i id="s-xp"></i></div></section>
 <section class="s-map-block"><canvas id="s-map" width="240" height="150" aria-label="Map around your current position"></canvas><div><span id="s-map-label">Cathedral district</span><button id="s-expand-map" title="Map (M)">⤢</button></div></section>
 <section class="s-task"><small>Following a thread</small><h2 id="s-quest-title"></h2><p id="s-quest-objective"></p><button id="s-track">Read journal</button></section>
 <section class="s-pack"><div class="s-pack-heading"><h2>Your satchel</h2><span id="s-coins"></span></div><div class="s-tabs" role="tablist" aria-label="Satchel view"><button id="s-tab-pack" role="tab" aria-selected="true">Belongings</button><button id="s-tab-craft" role="tab" aria-selected="false">Prepare</button></div><div id="s-pack-content"></div><div id="s-item-detail" class="s-item-detail">Select an item to examine it.</div></section>
 <footer class="s-side-footer"><span id="s-distance">0 paces traveled</span><button id="s-help">Controls</button></footer></aside>
 <footer class="s-actionbar"><div class="s-equipment"><button data-equip="staff" title="Equip staff">${itemIcon('staff')}</button><button data-equip="sword" title="Equip sword">${itemIcon('sword')}</button><button data-equip="bow" title="Equip bow">${itemIcon('bow')}</button></div><div class="s-hotkeys"><button data-action="attack" title="Attack (F / 1)"><kbd>1</kbd>${itemIcon('sword')}<span>Strike</span></button><button data-action="ward" title="Botanical ward (Q / 2)"><kbd>2</kbd>${itemIcon('ward')}<span>Ward</span><i id="s-ward-cooldown"></i></button><button data-use="cequin" title="Breathe cequin (3)"><kbd>3</kbd>${itemIcon('cequin')}<b data-count="cequin"></b><span>Breathe</span></button><button data-use="salve" title="Apply salve (4)"><kbd>4</kbd>${itemIcon('salve')}<b data-count="salve"></b><span>Heal</span></button><button data-use="tonic" title="Use warming tonic (5)"><kbd>5</kbd>${itemIcon('tonic')}<b data-count="tonic"></b><span>Warm</span></button><button data-use="rations" title="Eat (6)"><kbd>6</kbd>${itemIcon('rations')}<b data-count="rations"></b><span>Eat</span></button><button data-action="interact" title="Interact (E)"><kbd>E</kbd>${itemIcon('hand')}<span>Interact</span></button></div><button id="s-mobile-pack">Satchel</button><span class="s-walk-help">WASD / click to walk<br>Shift to run</span></footer>
 <div class="s-mobile-move"><button data-move="w">↑</button><button data-move="a">←</button><button data-move="s">↓</button><button data-move="d">→</button></div>
 <div id="s-dialogue" class="s-dialogue" hidden></div><div id="s-modal" class="s-modal" hidden></div><div id="s-transfer" class="s-transfer" hidden><div class="s-transfer-ring"></div><span id="s-transfer-time"></span><h2 id="s-transfer-line"></h2><p id="s-transfer-sub"></p><button id="s-skip">Continue</button></div></main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (text: unknown) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const canvas = el<HTMLCanvasElement>('s-world');
const renderer = new StichosRenderer(canvas);
const audio = new AudioDirector();
const storageKey = 'verso.stichos.v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let game = new Stichos(0x53544943);
let started = false,
  paused = true,
  muted = false,
  modal = '',
  packView: 'pack' | 'craft' = 'pack';
let selectedItem: ItemId | null = null;
let stored: string | null = null;
try {
  stored = localStorage.getItem(storageKey);
} catch {}
let keys = new Set<string>(),
  pointer: Point | null = null,
  hover: Npc | Prop | null = null;
let walk: Point[] = [],
  walkTarget: string | undefined,
  walkStuck = 0,
  walkLast: Point = { ...game.player };
let frameLast = performance.now(),
  uiLast = 0,
  mapLast = 0,
  saveLast = 0,
  breathLast = 0;
let toastUntil = 0,
  packSignature = '',
  portraitSignature = '',
  dialogueSignature = '',
  lastPhase = game.phase;
let transferStarted = 0,
  transferKind: 'opening' | 'return' = 'opening',
  transferStep = -1;
let pendingTransfer: (() => void) | null = null;
let ignoreNextTransfer = false;
let fps = 60,
  frames = 0,
  frameSeconds = 0;

function resize() {
  const bounds = canvas.parentElement!.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height, Math.min(devicePixelRatio || 1, 2));
}
addEventListener('resize', resize);
resize();

function toast(message: string, duration = 4500) {
  if (modal) {
    const window = el('s-modal').querySelector('.s-window');
    if (window) {
      let note = window.querySelector<HTMLElement>('.s-modal-note');
      if (!note) {
        note = document.createElement('p');
        note.className = 's-modal-note';
        note.setAttribute('role', 'status');
        window.append(note);
      }
      note.textContent = message;
    }
  }
  el('s-toast').textContent = message;
  el('s-toast').classList.add('visible');
  toastUntil = performance.now() + duration;
}
function save() {
  if (!started) return;
  try {
    stored = JSON.stringify(game.save());
    localStorage.setItem(storageKey, stored);
  } catch {
    toast('This browser could not store your progress. Download a save from the pause menu.');
  }
}
function activate(next: Stichos) {
  game = next;
  started = true;
  lastPhase = game.phase;
  walk = [];
  keys.clear();
  packSignature = '';
  dialogueSignature = '';
  audio.setWorld(0, game.world.seed);
  renderer.draw(game);
  updateUI();
  drawMap();
}
function setInert(value: boolean) {
  document
    .querySelectorAll<HTMLElement>('.s-shell > :not(#s-modal):not(#s-transfer)')
    .forEach((n) => (n.inert = value));
}
function openModal(kind: string, html: string) {
  modal = kind;
  paused = true;
  keys.clear();
  walk = [];
  audio.pause(true);
  el('s-dialogue').hidden = true;
  setInert(true);
  const container = el('s-modal');
  container.hidden = false;
  container.className = `s-modal ${kind === 'title' ? 'is-title' : ''}`;
  container.innerHTML = `<section class="s-window" role="dialog" aria-modal="true">${html}</section>`;
  const heading = container.querySelector('h2');
  if (heading) {
    heading.id = 's-modal-heading';
    container.querySelector('section')!.setAttribute('aria-labelledby', heading.id);
  }
  container.querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true });
  container.scrollTop = 0;
}
function closeModal() {
  modal = '';
  el('s-modal').hidden = true;
  el('s-modal').innerHTML = '';
  setInert(false);
  paused = false;
  audio.pause(false);
  canvas.focus({ preventScroll: true });
}
function title() {
  openModal(
    'title',
    `<div class="s-title-mark">V E R S O</div><span class="s-chapter">Destino: Stíchos</span><h2>Someone else's face.<br>Twenty years of silence.</h2><p>Cold air. A cathedral. A civilization on the edge of war.<br>You remember a home that this body has never seen.</p><form id="s-start"><label>A possible Stíchos<input id="s-seed-input" value="0x53544943" maxlength="64" aria-label="World seed"></label><button class="s-primary" type="submit">Remember how it began</button></form>${stored ? '<button id="s-continue" class="s-continue">Continue this life</button>' : ''}<p class="s-title-foot">A continuous world of botanical medicine, clan loyalties,<br>and a voice on the other side of a broken transmission.</p>`,
  );
  el<HTMLFormElement>('s-start').onsubmit = (event) => {
    event.preventDefault();
    activate(new Stichos(parseSeed(el<HTMLInputElement>('s-seed-input').value)));
    void audio.start(game.world.seed);
    closeModal();
    transfer('opening');
  };
  if (stored)
    el('s-continue').onclick = () => {
      try {
        activate(Stichos.restore(JSON.parse(stored!)));
        void audio.start(game.world.seed);
        closeModal();
        if (game.phase === 'lost') lost();
        else toast('The cold is familiar. The silence, less so.');
      } catch {
        toast('This save could not be read. You can start a new life or restore a saved file.');
      }
    };
}
const opening = [
  [
    'Transmission archive',
    'Your mind leaves before your body knows.',
    'Somewhere on Earth. Twenty Stíchoi years ago.',
  ],
  [
    'Signal interrupted',
    'That is not my heartbeat.',
    'Destination mismatch. A priest opens his eyes.',
  ],
  [
    'Stíchos · 3886',
    'Ten Earth years. Twenty years here.',
    'My name in this world is Theo Bishop.',
  ],
  [
    'The cathedral quarter',
    'I have spent too long waiting.',
    'The Sallas secret may be my only way home. First, breathe.',
  ],
];
const returning = [
  [
    'A faint connection',
    'A memory crosses the silence.',
    'Hold the rhythm. Let the other breath become yours.',
  ],
  [
    'Consciousness returning',
    'Different hands. The same unfinished life.',
    'The world has not forgotten what you did.',
  ],
];
function transfer(kind: 'opening' | 'return', after?: () => void) {
  closeModal();
  paused = true;
  keys.clear();
  walk = [];
  game.dialogue = null;
  transferKind = kind;
  pendingTransfer = after ?? null;
  transferStarted = performance.now();
  transferStep = -1;
  el('s-transfer').hidden = false;
  setInert(true);
  el('s-skip').focus({ preventScroll: true });
  audio.pause(false);
  audio.play('mind-transfer');
}
function endTransfer() {
  if (pendingTransfer) {
    ignoreNextTransfer = true;
    pendingTransfer();
  }
  pendingTransfer = null;
  transferStarted = 0;
  el('s-transfer').hidden = true;
  setInert(false);
  paused = false;
  canvas.focus({ preventScroll: true });
  save();
  toast(
    transferKind === 'opening'
      ? 'Cequin helps this body breathe. Speak to the botanist beside the garden.'
      : 'Your mind settles. The investigation continues.',
    7000,
  );
}
el('s-skip').onclick = endTransfer;
function updateTransfer(now: number) {
  if (!transferStarted) return;
  const lines = transferKind === 'opening' ? opening : returning,
    seconds = (now - transferStarted) / 1000;
  const duration = reducedMotion.matches ? 2.5 : 3.1;
  const step = Math.min(lines.length - 1, Math.floor(seconds / duration));
  if (step !== transferStep) {
    transferStep = step;
    el('s-transfer-time').textContent = lines[step][0];
    el('s-transfer-line').textContent = lines[step][1];
    el('s-transfer-sub').textContent = lines[step][2];
    el('s-transfer').dataset.step = String(step);
    if (step === 1) audio.play('radio');
  }
  const p = seconds / (lines.length * duration);
  el('s-transfer').style.setProperty('--transfer', String(Math.sin(Math.PI * p)));
  if (p >= 1) endTransfer();
}

function pauseMenu() {
  save();
  openModal(
    'pause',
    `<span class="s-chapter">Between thoughts</span><h2>This life can wait.</h2><p>Stíchos · 3886<br>World ${formatSeed(game.world.seed)} · ${Math.floor(game.distanceTraveled)} paces traveled</p><div class="s-menu-buttons"><button id="s-resume" class="s-primary">Return to the world</button><button id="s-save-file">Download save</button><button id="s-load-file">Restore a save</button><button id="s-new">Another possible Stíchos</button><button id="s-pause-help">Controls</button></div><input id="s-save-input" type="file" accept=".json,application/json" hidden>`,
  );
  el('s-resume').onclick = closeModal;
  el('s-new').onclick = title;
  el('s-pause-help').onclick = controls;
  el('s-save-file').onclick = () => {
    const blob = new Blob([JSON.stringify(game.save(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verso-stichos-${formatSeed(game.world.seed)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el('s-load-file').onclick = () => el<HTMLInputElement>('s-save-input').click();
  el<HTMLInputElement>('s-save-input').onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw Error();
      const next = Stichos.restore(JSON.parse(await file.text()));
      activate(next);
      save();
      closeModal();
      if (game.phase === 'lost') lost();
      else toast('Your life on Stíchos has been restored.');
    } catch {
      toast('That file is not a valid Stíchos save. Your current life is intact.');
    }
  };
}
function controls() {
  openModal(
    'help',
    `<span class="s-chapter">Living on Stíchos</span><h2>Take your time. Keep breathing.</h2><div class="s-control-list"><p><b>WASD / arrows</b><span>Walk · Shift runs</span></p><p><b>Click the ground</b><span>Follow a path; click a person or object to approach</span></p><p><b>E</b><span>Talk, gather, open, read, or use a nearby object</span></p><p><b>F / 1 / right mouse</b><span>Attack toward the cursor</span></p><p><b>Q / 2</b><span>Release a botanical ward</span></p><p><b>3 / 4 / 5 / 6</b><span>Cequin · salve · tonic · food</span></p><p><b>I / B</b><span>Satchel / prepare botanical supplies</span></p><p><b>J / M / Escape</b><span>Journal / map / pause</span></p><p><b>Mouse wheel</b><span>Zoom the world</span></p></div><p>Cequin sustains breath. Tonics help with cold. Rest near a shrine or bench. Roads connect inhabited districts; wilderness contains supplies and danger. Dialogue choices and violence affect clan trust.</p><button id="s-help-return" class="s-primary">Return to this life</button>`,
  );
  el('s-help-return').onclick = closeModal;
}
function journal() {
  openModal(
    'journal',
    `<span class="s-chapter">Theo Bishop's record · 3886</span><h2>What survives the transmission.</h2><div class="s-journal-columns"><div><h3>Threads to follow</h3>${game.quests.map((q) => `<article class="s-quest-record ${q.complete ? 'complete' : ''}"><small>${q.complete ? 'Resolved' : 'Unfinished'}</small><h4>${esc(q.title)}</h4><p>${esc(q.description)}</p><b>${esc(q.objective)}</b>${q.target ? `<span>Near ${Math.round(q.target.x)}, ${Math.round(q.target.y)}</span>` : ''}</article>`).join('')}<h3>The six families</h3>${game.world.clans.map((c, i) => `<div class="s-clan-row"><i style="background:${c.color}"></i><strong>${esc(c.name)}</strong><span>Trust ${game.reputation[i] ?? 0}</span></div>`).join('')}</div><div><h3>Remembered words</h3><blockquote>“Não, eu devo fazer algo!”</blockquote><p>I have avoided changing history for twenty years. Orlando Brown is preparing to industrialize the plants that keep this world alive. The Sallas secret may be my way home. Silence is becoming a choice.</p>${game.journal
      .slice()
      .reverse()
      .map(
        (entry) =>
          `<article class="s-memory"><h4>${esc(entry.title)}</h4><p>${esc(entry.text)}</p></article>`,
      )
      .join(
        '',
      )}</div></div><button id="s-journal-return" class="s-primary">Close the record</button>`,
  );
  el('s-journal-return').onclick = closeModal;
}
function mapModal() {
  openModal(
    'map',
    `<span class="s-chapter">Beyond the cathedral</span><h2>A world without an edge in sight.</h2><canvas id="s-large-map" width="640" height="450"></canvas><p>Stone roads continue between settlements. Green marks are botanical terrain; dark blue is water. The gold point is your current body. Scale: three map pixels represent one world tile.</p><button id="s-map-return" class="s-primary">Keep walking</button>`,
  );
  drawMap(el<HTMLCanvasElement>('s-large-map'), 3);
  el('s-map-return').onclick = closeModal;
}
function lost() {
  openModal(
    'lost',
    `<span class="s-chapter">The breath stops</span><h2>${game.transferReady ? 'Your mind is still here.' : 'A voice pulls you back.'}</h2><p>${game.transferReady ? 'The restored signal can hold your consciousness while another body wakes. Your choices remain in Stíchos.' : 'The clinic knows this face. Somewhere beyond the cold, someone is still trying to reach you.'}</p><button id="s-return-life" class="s-primary">${game.transferReady ? 'Follow the other heartbeat' : 'Wake at the clinic'}</button>`,
  );
  el('s-return-life').onclick = () =>
    transfer('return', () => {
      game.reincarnate();
      lastPhase = game.phase;
    });
}
function inventory(view: 'pack' | 'craft' = packView) {
  packView = view;
  packSignature = '';
  el('s-tab-pack').setAttribute('aria-selected', String(view === 'pack'));
  el('s-tab-craft').setAttribute('aria-selected', String(view === 'craft'));
  root.classList.add('satchel-open');
  updatePack();
}
function updatePack() {
  const signature = JSON.stringify([
    game.inventory,
    game.player.coins,
    packView,
    selectedItem,
    Math.round(game.player.x),
    Math.round(game.player.y),
  ]);
  if (signature === packSignature) return;
  packSignature = signature;
  if (packView === 'pack') {
    const entries = (Object.keys(ITEMS) as ItemId[]).filter((id) => (game.inventory[id] ?? 0) > 0);
    el('s-pack-content').innerHTML =
      `<div class="s-item-grid">${entries.map((id) => `<button class="s-item ${selectedItem === id ? 'selected' : ''}" data-item="${id}" title="${esc(ITEMS[id].name)}">${itemIcon(id, 34)}<b>${game.inventory[id]}</b></button>`).join('')}${Array.from({ length: Math.max(0, 12 - entries.length) }, () => '<span class="s-empty-slot"></span>').join('')}</div>`;
  } else {
    el('s-pack-content').innerHTML = `<div class="s-recipes">${RECIPES.map(
      (r) =>
        `<button data-craft="${r.id}" ${Object.entries(r.cost).some(([id, n]) => (game.inventory[id as ItemId] ?? 0) < n!) ? 'disabled' : ''}>${itemIcon(r.result)}<span><strong>${esc(r.name)}</strong><small>${Object.entries(
          r.cost,
        )
          .map(([id, n]) => `${n} ${esc(ITEMS[id as ItemId].name)}`)
          .join(' + ')}</small></span></button>`,
    ).join('')}</div>`;
  }
  if (selectedItem) {
    const item = ITEMS[selectedItem];
    el('s-item-detail').innerHTML =
      `<strong>${esc(item.name)}</strong><p>${esc(item.description)}</p>${['cequin', 'salve', 'tonic', 'rations', 'bandage'].includes(selectedItem) ? `<button data-use="${selectedItem}">Use ${esc(item.name.toLowerCase())}</button>` : ''}`;
  }
}
function updateDialogue() {
  if (modal || transferStarted) {
    el('s-dialogue').hidden = true;
    return;
  }
  const d = game.dialogue;
  const signature = JSON.stringify(d);
  if (signature === dialogueSignature) return;
  dialogueSignature = signature;
  el('s-dialogue').hidden = !d;
  if (!d) return;
  keys.clear();
  walk = [];
  el('s-dialogue').innerHTML =
    `<section role="dialog" aria-label="Conversation with ${esc(d.speaker)}"><div class="s-dialogue-heading"><div><small>${esc(d.role)}</small><h2>${esc(d.speaker)}</h2></div><button id="s-dialogue-close" aria-label="Close conversation">×</button></div><p>${esc(d.text)}</p><div class="s-dialogue-choices">${d.choices.map((c) => `<button data-choice="${esc(c.id)}" ${c.disabled ? 'disabled' : ''}>${esc(c.label)}${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</button>`).join('')}</div></section>`;
  el('s-dialogue-close').onclick = () => {
    game.dialogue = null;
    updateDialogue();
    canvas.focus();
  };
}
function updateUI() {
  const p = game.player,
    tile = game.world.tile(p.x, p.y);
  el('s-person-name').textContent = p.bodyName;
  const bodySignature = JSON.stringify(p.appearance);
  if (portraitSignature !== bodySignature) {
    portraitSignature = bodySignature;
    const portrait = el<HTMLCanvasElement>('s-portrait').getContext('2d')!;
    portrait.imageSmoothingEnabled = false;
    portrait.fillStyle = '#1a2832';
    portrait.fillRect(0, 0, 64, 72);
    drawHumanoid(portrait, p.appearance, 32, 103, 2.45, 2, 0, false, 0, true);
  }
  el('s-body-label').textContent =
    p.name === 'Theo Bishop' ? 'Theo Bishop · a borrowed life' : `${p.name} · a borrowed life`;
  el('s-level').textContent = String(p.level);
  el('s-hp-label').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  el('s-breath-label').textContent = `${Math.ceil(p.breath)}%`;
  el('s-hp').style.width = `${(p.hp / p.maxHp) * 100}%`;
  el('s-breath').style.width = `${p.breath}%`;
  el('s-mobile-hp').textContent = String(Math.ceil(p.hp));
  el('s-mobile-breath').textContent = `${Math.ceil(p.breath)}%`;
  el('s-mobile-hp-bar').style.width = `${(p.hp / p.maxHp) * 100}%`;
  el('s-mobile-breath-bar').style.width = `${p.breath}%`;
  el('s-warmth').textContent = `Warmth ${Math.round(p.warmth)}%`;
  el('s-stamina').textContent = `Energy ${Math.round(p.stamina)}%`;
  el('s-xp').style.width = `${Math.min(100, (p.xp / (p.level * 40)) * 100)}%`;
  el('s-coins').textContent = `◈ ${p.coins}`;
  const closest = game.world
    .settlementsAround(p.x, p.y, 28)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  el('s-place').textContent =
    closest?.name ??
    {
      frostwood: 'The frostwood',
      tundra: 'Open tundra',
      marsh: 'The blue marshes',
      highlands: 'The highlands',
      settlement: 'An inhabited quarter',
    }[tile.biome];
  el('s-map-label').textContent = closest
    ? `${game.world.clans[closest.clan].name} territory`
    : 'Unclaimed wilderness';
  el('s-coordinates').textContent = `${Math.round(p.x)}, ${Math.round(p.y)} · Stíchos, 3886`;
  const romer = (tile.temperature * 21) / 40 + 7.5;
  el('s-weather').textContent =
    `${romer.toFixed(1)}° Rø · ${tile.temperature.toFixed(0)}° C · ${p.cequinTime > 0 ? 'Cequin in your breath' : 'The air bites'}`;
  const q = game.quests.find((q) => !q.complete);
  el('s-quest-title').textContent = q?.title ?? 'A life beyond the cathedral';
  el('s-quest-objective').textContent =
    q?.objective ?? 'Follow the roads. Find the people whose lives touch yours.';
  el('s-distance').textContent = `${Math.floor(game.distanceTraveled)} paces traveled`;
  document
    .querySelectorAll<HTMLElement>('[data-count]')
    .forEach((n) => (n.textContent = String(game.inventory[n.dataset.count as ItemId] ?? 0)));
  document.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((n) => {
    n.classList.toggle('equipped', n.dataset.equip === p.appearance.weapon);
    n.disabled = !game.weapons.has(n.dataset.equip as 'staff' | 'sword' | 'bow');
    n.title = n.disabled ? `Buy a ${n.dataset.equip} from a merchant` : `Equip ${n.dataset.equip}`;
    const profile = game.weaponProfile(n.dataset.equip as 'staff' | 'sword' | 'bow');
    if (!n.disabled)
      n.title = `${profile.name} · ${profile.damage} strength · ${profile.range.toFixed(1)} reach · ${profile.effectDescription}`;
  });
  el('s-ward-cooldown').style.height = `${Math.min(100, (p.wardCooldown / 8) * 100)}%`;
  const near = game.nearby();
  const context = el<HTMLButtonElement>('s-context');
  context.hidden = !near || !!game.dialogue || !!modal || !!transferStarted;
  if (near)
    context.textContent = `E · ${'role' in near ? 'Speak to ' + near.name : (({ cequin: 'Gather cequin', heartleaf: 'Gather heartleaf', emberroot: 'Gather emberroot', pine: 'Gather wood', rock: 'Mine stone', chest: 'Open chest', radio: 'Listen to the radio', workbench: 'Use workbench', shrine: 'Rest and remember', notice: 'Read the notice', door: 'Open door', bench: 'Rest here', crate: 'Search crate' } as Record<string, string>)[near.kind] ?? near.name)}`;
  updatePack();
  updateDialogue();
}
function drawMap(target = el<HTMLCanvasElement>('s-map'), scale = 5) {
  const ctx = target.getContext('2d')!;
  const w = target.width,
    h = target.height;
  ctx.fillStyle = '#13212b';
  ctx.fillRect(0, 0, w, h);
  const colors: Record<string, string> = {
    road: '#b5a887',
    floor: '#a6a7a3',
    wall: '#667381',
    bridge: '#9f8662',
    snow: '#80949d',
    grass: '#526f67',
    ice: '#5e8b9c',
    water: '#254354',
  };
  // Sparse sampling keeps the map bounded even while walking across many chunks.
  const stride = target.id === 's-large-map' ? 2 : 1;
  for (let y = 0; y < h; y += scale * stride)
    for (let x = 0; x < w; x += scale * stride) {
      const t = game.world.tile(
        game.player.x + (x - w / 2) / scale,
        game.player.y + (y - h / 2) / scale,
      );
      ctx.fillStyle = colors[t.terrain];
      ctx.fillRect(x, y, scale * stride, scale * stride);
    }
  const range = Math.max(w, h) / scale / 2;
  for (const town of game.world.settlementsAround(game.player.x, game.player.y, range)) {
    const x = w / 2 + (town.x - game.player.x) * scale,
      y = h / 2 + (town.y - game.player.y) * scale;
    ctx.strokeStyle = game.world.clans[town.clan].color;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
    if (target.id === 's-large-map') {
      ctx.font = '12px Georgia';
      ctx.fillStyle = '#f3dfb2';
      ctx.fillText(town.name, x + 7, y);
    }
  }
  const q = game.quests.find((q) => !q.complete && q.target);
  if (q?.target) {
    const x = w / 2 + (q.target.x - game.player.x) * scale,
      y = h / 2 + (q.target.y - game.player.y) * scale;
    ctx.fillStyle = '#bfb280';
    ctx.fillRect(x - 2, y - 2, 5, 5);
  }
  ctx.fillStyle = '#f5dda2';
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2 - 5);
  ctx.lineTo(w / 2 + 4, h / 2 + 3);
  ctx.lineTo(w / 2 - 4, h / 2 + 3);
  ctx.closePath();
  ctx.fill();
}
function act(command: string) {
  if (!started || paused || transferStarted || game.phase !== 'playing') return;
  if (command === 'attack') game.attack(pointer ?? undefined);
  if (command === 'ward') game.ward();
  if (command === 'interact') game.interact();
  updateUI();
  save();
}
function pathTo(goal: Point): Point[] {
  const start = { x: Math.round(game.player.x), y: Math.round(game.player.y) },
    end = { x: Math.round(goal.x), y: Math.round(goal.y) };
  const key = (p: Point) => `${p.x},${p.y}`;
  const queue = [start],
    parents = new Map<string, Point | null>([[key(start), null]]);
  if (game.world.blocked(end.x, end.y, game.removed)) return [];
  for (let i = 0; i < queue.length && i < 5500; i++) {
    const p = queue[i];
    if (key(p) === key(end)) {
      const route: Point[] = [];
      for (
        let at: Point | null = end;
        at && key(at) !== key(start);
        at = parents.get(key(at)) ?? null
      )
        route.push(at);
      return route.reverse();
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (
        Math.abs(n.x - start.x) > 52 ||
        Math.abs(n.y - start.y) > 52 ||
        parents.has(key(n)) ||
        game.world.blocked(n.x, n.y, game.removed)
      )
        continue;
      parents.set(key(n), p);
      queue.push(n);
    }
  }
  return [];
}
function approach(target: Prop | Npc) {
  const options: Point[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      options.push({ x: Math.round(target.x) + dx, y: Math.round(target.y) + dy });
  options.sort(
    (a, b) =>
      Math.hypot(a.x - game.player.x, a.y - game.player.y) -
      Math.hypot(b.x - game.player.x, b.y - game.player.y),
  );
  if (Math.hypot(target.x - game.player.x, target.y - game.player.y) < 1.65) {
    game.interact(target.id);
    updateUI();
    return;
  }
  for (const point of options) {
    const route = pathTo(point);
    if (route.length) {
      walk = route;
      walkTarget = target.id;
      walkStuck = 0;
      return;
    }
  }
  toast('There is no clear route from here. Try the road around it.');
}
function identify(point: Point): Prop | Npc | null {
  const candidates: [Prop | Npc, number][] = [];
  for (const npc of game.npcs) {
    if (npc.hp <= 0) continue;
    const d = Math.hypot(npc.x - point.x, npc.y - 0.5 - point.y);
    if (d < 0.85) candidates.push([npc, d]);
  }
  for (const prop of game.world.propsAround(point.x, point.y, 2)) {
    if (game.removed.has(prop.id)) continue;
    const d = Math.hypot(prop.x - point.x, prop.y - 0.25 - point.y);
    if (d < 0.75) candidates.push([prop, d]);
  }
  return candidates.sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
}
canvas.addEventListener('pointermove', (event) => {
  const bounds = canvas.getBoundingClientRect();
  const ground: Point = renderer.screenToWorld({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  });
  pointer = ground;
  hover = identify(ground);
  const label = el('s-hover');
  label.hidden = !hover || paused || !!game.dialogue;
  if (hover) {
    label.textContent = hover.name + ('role' in hover ? ` · ${hover.role}` : '');
    label.style.left = `${Math.min(bounds.width - 200, Math.max(8, event.clientX - bounds.left + 14))}px`;
    label.style.top = `${Math.max(10, event.clientY - bounds.top - 40)}px`;
  }
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
  hover = null;
  el('s-hover').hidden = true;
});
canvas.addEventListener('pointerdown', (event) => {
  if (paused || game.dialogue || !started) return;
  void audio.start(game.world.seed);
  canvas.focus();
  const bounds = canvas.getBoundingClientRect();
  const ground: Point = renderer.screenToWorld({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  });
  pointer = ground;
  if (event.button === 2) {
    act('attack');
    return;
  }
  if (event.button !== 0) return;
  const target = identify(ground);
  if (target) approach(target);
  else {
    walk = pathTo(ground);
    walkTarget = undefined;
    walkStuck = 0;
    if (!walk.length) toast('That ground is blocked. Follow a clear path.');
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    renderer.setZoom(renderer.zoom + (e.deltaY < 0 ? 0.15 : -0.15));
  },
  { passive: false },
);
root.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;
  const d = button.dataset;
  audio.play('click');
  if (d.action) act(d.action);
  if (d.use && !paused) {
    game.use(d.use as ItemId);
    updateUI();
    save();
  }
  if (d.equip && !paused) {
    game.equip(d.equip as 'staff' | 'sword' | 'bow');
    updateUI();
  }
  if (d.item) {
    selectedItem = d.item as ItemId;
    packSignature = '';
    updatePack();
  }
  if (d.craft && !paused) {
    game.craft(d.craft);
    updateUI();
    save();
  }
  if (d.choice) {
    game.choose(d.choice);
    updateUI();
    save();
  }
});
el('s-context').onclick = () => act('interact');
el('s-pause').onclick = pauseMenu;
el('s-journal').onclick = journal;
el('s-track').onclick = journal;
el('s-expand-map').onclick = mapModal;
el('s-help').onclick = controls;
el('s-tab-pack').onclick = () => inventory('pack');
el('s-tab-craft').onclick = () => inventory('craft');
el('s-mobile-pack').onclick = () => root.classList.toggle('satchel-open');
el('s-sound').onclick = () => {
  if (audio.needsGesture) {
    void audio.start(game.world.seed);
    muted = false;
  } else {
    muted = !muted;
    void audio.start(game.world.seed);
  }
  audio.setMuted(muted);
  el('s-sound').textContent = muted ? '♩' : '♫';
  el('s-sound').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
};
document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
  button.onpointerdown = (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    keys.add(button.dataset.move!);
    walk = [];
  };
  const release = () => keys.delete(button.dataset.move!);
  button.onpointerup = release;
  button.onpointercancel = release;
  button.onlostpointercapture = release;
});
addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && modal) {
    const focus = [
      ...el('s-modal').querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not([hidden]),a[href]',
      ),
    ];
    const first = focus[0],
      last = focus.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if ((e.target as HTMLElement).matches('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if (transferStarted) {
    if (k === 'escape' || k === 'enter') {
      e.preventDefault();
      endTransfer();
    }
    return;
  }
  if (k === 'escape') {
    e.preventDefault();
    if (game.dialogue) {
      game.dialogue = null;
      updateDialogue();
    } else if (modal && modal !== 'title' && modal !== 'lost') closeModal();
    else if (!modal) pauseMenu();
    return;
  }
  if (modal || !started) return;
  if (!e.repeat) {
    if (k === 'j') {
      journal();
      return;
    }
    if (k === 'm') {
      mapModal();
      return;
    }
    if (k === 'i') {
      inventory('pack');
      return;
    }
    if (k === 'b') {
      inventory('craft');
      return;
    }
  }
  if (game.dialogue) return;
  if (
    ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)
  ) {
    e.preventDefault();
    keys.add(k);
    walk = [];
  }
  if (e.repeat) return;
  void audio.start(game.world.seed);
  if (k === 'e') act('interact');
  if (k === 'f' || k === '1') act('attack');
  if (k === 'q' || k === '2') act('ward');
  const item = (
    { '3': 'cequin', '4': 'salve', '5': 'tonic', '6': 'rations' } as Record<string, ItemId>
  )[k];
  if (item) {
    e.preventDefault();
    game.use(item);
    updateUI();
    save();
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => {
  keys.clear();
  walk = [];
  if (started && !paused && !transferStarted) pauseMenu();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    walk = [];
    save();
    if (started && !paused && !transferStarted) pauseMenu();
  }
});
addEventListener('beforeunload', save);

function frame(now: number) {
  const elapsed = Math.max(0, (now - frameLast) / 1000),
    dt = Math.min(0.05, elapsed);
  frameLast = now;
  frames++;
  frameSeconds += elapsed;
  if (frameSeconds >= 1) {
    fps = frames / frameSeconds;
    frames = 0;
    frameSeconds = 0;
  }
  updateTransfer(now);
  if (started && !paused && !game.dialogue && !transferStarted) {
    let x =
        Number(keys.has('d') || keys.has('arrowright')) -
        Number(keys.has('a') || keys.has('arrowleft')),
      y =
        Number(keys.has('s') || keys.has('arrowdown')) -
        Number(keys.has('w') || keys.has('arrowup'));
    if (walk.length && !x && !y) {
      const next = walk[0],
        dx = next.x - game.player.x,
        dy = next.y - game.player.y,
        d = Math.hypot(dx, dy);
      if (d < 0.13) {
        walk.shift();
        if (!walk.length && walkTarget) {
          game.interact(walkTarget);
          walkTarget = undefined;
        }
      } else {
        x = (dx / d) * Math.min(1, d / (game.player.speed * Math.max(dt, 0.001)));
        y = (dy / d) * Math.min(1, d / (game.player.speed * Math.max(dt, 0.001)));
      }
      if (Math.hypot(game.player.x - walkLast.x, game.player.y - walkLast.y) < 0.001)
        walkStuck += dt;
      else walkStuck = 0;
      walkLast = { x: game.player.x, y: game.player.y };
      if (walkStuck > 1.5) {
        walk = [];
        toast('The path is blocked. Choose another way around.');
      }
    }
    game.update(dt, { x, y, run: keys.has('shift') });
    if (game.phase !== lastPhase) {
      lastPhase = game.phase;
      if (game.phase === 'lost') lost();
    }
    audio.setIntensity(
      game.npcs.some(
        (n) => n.hostile && n.hp > 0 && Math.hypot(n.x - game.player.x, n.y - game.player.y) < 6,
      )
        ? 0.7
        : game.player.breath < 25
          ? 0.4
          : 0.05,
    );
    if (now - breathLast > 4200) {
      audio.play('breath');
      breathLast = now;
    }
  }
  for (const event of game.drainEvents()) {
    if (event.kind === 'transfer' && ignoreNextTransfer) {
      ignoreNextTransfer = false;
      continue;
    }
    if (event.text) toast(event.text, event.kind === 'quest' ? 7000 : 4200);
    audio.play(
      (
        {
          step: 'step',
          attack: 'blade',
          hurt: 'hurt',
          harvest: 'scan',
          heal: 'heal',
          quest: 'complete',
          dialogue: 'click',
          transfer: 'mind-transfer',
          level: 'scanned',
          trade: 'relay',
          ward: 'pulse',
        } as Record<string, string>
      )[event.kind],
    );
    if (event.kind === 'transfer' && !transferStarted) transfer('return');
  }
  renderer.draw(game, {
    reducedMotion: reducedMotion.matches,
    transfer: transferStarted
      ? Math.max(
          0.0001,
          Math.min(
            1,
            (now - transferStarted) /
              ((reducedMotion.matches ? 2500 : 3100) * (transferKind === 'opening' ? 4 : 2)),
          ),
        )
      : 0,
    pointer: walk[0] ?? null,
  });
  if (now - uiLast > 160) {
    updateUI();
    uiLast = now;
  }
  if (now - mapLast > 1500 && !modal) {
    drawMap();
    mapLast = now;
  }
  if (now - saveLast > 8000 && started && !transferStarted) {
    save();
    saveLast = now;
  }
  if (now > toastUntil) el('s-toast').classList.remove('visible');
  requestAnimationFrame(frame);
}
Object.defineProperty(window, 'stichos', {
  value: Object.freeze({
    get state() {
      return structuredClone({
        seed: game.world.seed,
        player: game.player,
        phase: game.phase,
        time: game.time,
        paused,
        modal,
        transfer: !!transferStarted,
        inventory: game.inventory,
        quests: game.quests,
        storyStage: game.storyStage,
        transferReady: game.transferReady,
        occupiedNpcId: game.occupiedNpcId,
        transferCandidate: game.transferCandidate,
        weapons: [...game.weapons],
        weaponProfile: game.weaponProfile(
          game.player.appearance.weapon === 'none' ? 'staff' : game.player.appearance.weapon,
        ),
        reputation: game.reputation,
        distanceTraveled: game.distanceTraveled,
        npcs: game.npcs,
        nearby: game.nearby(),
        dialogue: game.dialogue,
        removed: [...game.removed],
        opened: [...game.opened],
        cacheSize: game.world.cacheSize,
      });
    },
    get fps() {
      return fps;
    },
    get zoom() {
      return renderer.zoom;
    },
    worldToScreen(point: Point) {
      return renderer.worldToScreen(point);
    },
    tile(x: number, y: number) {
      return structuredClone(game.world.tile(x, y));
    },
    props(x: number, y: number, radius = 10) {
      return structuredClone(
        game.world.propsAround(x, y, radius).filter((p) => !game.removed.has(p.id)),
      );
    },
    blocked(x: number, y: number) {
      return game.world.blocked(x, y, game.removed);
    },
  }),
  configurable: true,
});
updateUI();
title();
requestAnimationFrame(frame);
