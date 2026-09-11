import './style.css';
import './notebook.css';
import './life.css';
import { mountLife } from './life';
import { MultiplayerConnection } from './multiplayer';
import { notebookHtml } from './notebook';
import type { NotebookSection, NotebookView } from './notebook';
import { INTRO_BEATS, JOURNAL_ENTRIES, PLANT_NOTES } from './lore';
import { Stichos, ITEMS, RECIPES } from './session';
import { StichosRenderer } from './render';
import { drawPortrait } from './portrait';
import { weaponIcon } from './equipment';
import type { WeaponKind } from './equipment';
import { itemIcon } from './icons';
import { AtlasController, AtlasPainter, atlasDistance } from './atlas';
import type { AtlasView, AtlasSource } from './atlas';
import { parseSeed, formatSeed } from '../seed';
import { AudioDirector } from '../audio';
import { registerOffline } from '../offline';
import type { ItemId, Npc, Point, Prop } from './types';

void registerOffline();
const root = document.getElementById('app')!;
root.innerHTML = `<main class="s-shell">
 <header class="s-header"><a class="s-brand" href="?">VERSO<span>Destino: Stíchos</span></a><div class="s-location"><strong id="s-place">Vespera</strong><span id="s-coordinates">Stíchos · 3886</span></div><nav><button id="s-sound" title="Sound">♫</button><button id="s-together" title="Play together">Together</button><button id="s-life" title="Professions, homes and clothing (L)">Life</button><button id="s-journal" title="Journal (J)">Journal <kbd>J</kbd></button><button id="s-pause" aria-label="Pause">Ⅱ</button></nav></header>
 <section class="s-world-wrap"><canvas id="s-world" tabindex="0" aria-label="The continuous world of Stíchos. WASD or click to walk. E to interact."></canvas><div class="s-weather"><i></i><span id="s-weather">A cold morning</span></div><div class="s-mobile-status"><span>♥ <b id="s-mobile-hp"></b><i><em id="s-mobile-hp-bar"></em></i></span><span>Breath <b id="s-mobile-breath"></b><i><em id="s-mobile-breath-bar"></em></i></span></div><div class="s-compass">N<span>◇</span></div><div id="s-hover" class="s-hover" hidden></div><button id="s-context" class="s-context" hidden></button><div id="s-toast" class="s-toast" role="status" aria-live="polite"></div><div class="s-world-caption">The road disappears into snow.</div></section>
 <aside class="s-sidebar"><section class="s-person"><div class="s-person-heading"><canvas id="s-portrait" width="96" height="112" aria-label="Your current human host"></canvas><div><small id="s-body-label">A borrowed life</small><h1 id="s-person-name">Theo Bishop</h1></div><strong id="s-level">1</strong></div><div class="s-meter health"><label>Vitality <b id="s-hp-label"></b></label><div><i id="s-hp"></i></div></div><div class="s-meter breath"><label>Breath <b id="s-breath-label"></b></label><div><i id="s-breath"></i></div></div><div class="s-person-minor"><span id="s-warmth"></span><span id="s-stamina"></span></div><div class="s-xp"><i id="s-xp"></i></div></section>
 <section class="s-map-block"><canvas id="s-map" width="240" height="150" aria-label="Map around your current position"></canvas><div><span id="s-map-label">Vespera</span><button id="s-expand-map" title="Map (M)">⤢</button></div></section>
 <section class="s-task"><small>Following a thread</small><h2 id="s-quest-title"></h2><p id="s-quest-objective"></p><span id="s-quest-distance"></span><button id="s-track">Read journal</button></section>
 <section class="s-pack"><div class="s-pack-heading"><h2>Your satchel</h2><span id="s-coins"></span></div><div class="s-tabs" role="tablist" aria-label="Satchel view"><button id="s-tab-pack" role="tab" aria-selected="true">Belongings</button><button id="s-tab-craft" role="tab" aria-selected="false">Prepare</button></div><div id="s-pack-content"></div><button id="s-pocketbook" class="s-pocketbook"><span aria-hidden="true">▤</span><strong id="s-pocketbook-label">The priest’s notebook</strong><small id="s-pocketbook-note">In this body’s keeping</small></button><div id="s-item-detail" class="s-item-detail">Select an item to examine it.</div></section>
 <footer class="s-side-footer"><span id="s-distance">0 paces traveled</span><button id="s-help">Controls</button></footer></aside>
 <footer class="s-actionbar"><div class="s-equipment"><button data-equip="staff" title="Equip staff">${itemIcon('staff')}</button><button data-equip="sword" title="Equip sword">${itemIcon('sword')}</button><button data-equip="bow" title="Equip bow">${itemIcon('bow')}</button><button id="s-inspect-gear" title="Inspect equipment (K)">Gear</button></div><div class="s-hotkeys"><button data-action="attack" title="Attack (F / 1)"><kbd>1</kbd>${itemIcon('sword')}<span>Strike</span></button><button data-action="ward" title="Botanical ward (Q / 2)"><kbd>2</kbd>${itemIcon('ward')}<span>Ward</span><i id="s-ward-cooldown"></i></button><button data-use="cequin" title="Breathe cequin (3)"><kbd>3</kbd>${itemIcon('cequin')}<b data-count="cequin"></b><span>Breathe</span></button><button data-use="salve" title="Apply salve (4)"><kbd>4</kbd>${itemIcon('salve')}<b data-count="salve"></b><span>Heal</span></button><button data-use="tonic" title="Use warming tonic (5)"><kbd>5</kbd>${itemIcon('tonic')}<b data-count="tonic"></b><span>Warm</span></button><button data-use="rations" title="Eat (6)"><kbd>6</kbd>${itemIcon('rations')}<b data-count="rations"></b><span>Eat</span></button><button data-action="interact" title="Interact (E)"><kbd>E</kbd>${itemIcon('hand')}<span>Interact</span></button></div><button id="s-mobile-pack">Satchel</button><span class="s-walk-help">WASD / click to walk<br>Shift to run</span></footer>
 <div class="s-mobile-move"><button data-move="w">↑</button><button data-move="a">←</button><button data-move="s">↓</button><button data-move="d">→</button></div>
 <div id="s-dialogue" class="s-dialogue" hidden></div><div id="s-modal" class="s-modal" hidden></div><div id="s-transfer" class="s-transfer" role="dialog" aria-modal="true" aria-labelledby="s-transfer-line" hidden><div class="s-transfer-ring"></div><span id="s-transfer-time"></span><h2 id="s-transfer-line"></h2><p id="s-transfer-sub"></p><div id="s-intro-controls" class="s-intro-controls" hidden><button id="s-intro-prev">← Back</button><span id="s-intro-page" aria-live="polite"></span><button id="s-intro-next">Continue →</button></div><button id="s-skip">Continue</button></div></main>`;

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
const multiplayer = new MultiplayerConnection();
const peerEmotes = new Map<string, { text: string; until: number }>();
let sharedActionPending = false;
let multiplayerRoster = '';
let roomName = 'Theo';
let roomServer =
  location.protocol === 'https:'
    ? `wss://${location.host}/ws`
    : `ws://${location.hostname}:4175/ws`;
try {
  roomName = localStorage.getItem('verso.room.name') || 'Theo';
  roomServer = localStorage.getItem('verso.room.server') || roomServer;
} catch {}
let started = false,
  paused = true,
  muted = false,
  modal = '',
  packView: 'pack' | 'craft' = 'pack';
let selectedItem: ItemId | null = null;
let trackedQuestId: string | null = null;
let mapWaypoint: Point | null = null;
let chartView: AtlasView | null = null;
let chartControl: AtlasController | null = null;
let modalRevision = 0;
const atlasPainter = new AtlasPainter();
function trackedQuest() {
  if (trackedQuestId === 'map-waypoint' && mapWaypoint)
    return {
      id: 'map-waypoint',
      title: 'Your marked destination',
      description: 'A point marked in Theo’s atlas.',
      objective: `Travel toward ${Math.round(mapWaypoint.x)}, ${Math.round(mapWaypoint.y)}.`,
      target: mapWaypoint,
      complete: false,
      stage: 0,
    };
  const active = game.quests.filter((q) => !q.complete);
  return (
    active.find((q) => q.id === trackedQuestId) ??
    active.filter((q) => q.target).at(-1) ??
    active[0]
  );
}
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
  equipmentSignature = '',
  dialogueSignature = '',
  lastPhase = game.phase;
let transferStarted = 0,
  transferKind: 'opening' | 'return' | 'clinic' = 'opening',
  transferStep = -1;
let pendingTransfer: (() => void) | null = null;
let ignoreNextTransfer = false;
let introPage = 0,
  replayingIntro = false;
const notebookView: NotebookView = {
  section: 'years',
  entry: 0,
  plant: 0,
  plain: false,
  open: false,
};
try {
  notebookView.plain = localStorage.getItem('verso.notebook.plain') === 'true';
} catch {}
let fps = 60,
  frames = 0,
  frameSeconds = 0;

function resize() {
  const bounds = canvas.parentElement!.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height, Math.min(devicePixelRatio || 1, 2));
  if (chartControl) {
    const map = chartControl.canvas;
    map.width = Math.max(260, Math.round(map.getBoundingClientRect().width));
    map.height = Math.min(560, Math.max(290, Math.round(innerHeight * 0.51)));
    chartControl.requestDraw();
  }
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
  multiplayer.disconnect();
  peerEmotes.clear();
  game = next;
  void import('./store')
    .then(({ restoreStoreEntitlements }) =>
      restoreStoreEntitlements(next, () => {
        if (game === next) updateUI();
      }),
    )
    .catch(() => {});
  started = true;
  lastPhase = game.phase;
  walk = [];
  keys.clear();
  packSignature = '';
  trackedQuestId = null;
  notebookView.open = false;
  chartView = null;
  mapWaypoint = null;
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
  modalRevision++;
  chartControl?.dispose();
  chartControl = null;
  modal = kind;
  paused = true;
  keys.clear();
  walk = [];
  audio.pause(true);
  el('s-dialogue').hidden = true;
  setInert(true);
  const container = el('s-modal');
  container.hidden = false;
  container.className = `s-modal ${kind === 'title' ? 'is-title' : kind === 'map' ? 'is-atlas' : kind === 'journal' ? 'is-notebook' : ''}`;
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
  modalRevision++;
  chartControl?.dispose();
  chartControl = null;
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
    `<div class="s-title-mark">V E R S O</div><span class="s-chapter">Destino: Stíchos</span><h2>I came from the future.<br>I woke in his past.</h2><p>Planet Stíchos, year 3886. For twenty local years, Theo Bishop has worn a priest’s face. Now a war is beginning—and the family he came to study may be his only way home.</p><form id="s-start"><label>A possible Stíchos<input id="s-seed-input" value="0x53544943" maxlength="64" aria-label="World seed"></label><button class="s-primary" type="submit">Remember how it began</button></form>${stored ? '<button id="s-continue" class="s-continue">Continue this life</button>' : ''}<p class="s-title-foot">A continuous world of botanical medicine, clan loyalties,<br>and a voice on the other side of a broken transmission.</p>`,
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
const opening = INTRO_BEATS;
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
const recovering = [
  [
    'A voice beyond the cold',
    'Stay with this breath.',
    'Warm cequin. Someone at the clinic knows this face.',
  ],
  [
    'The same hands',
    'Not every silence is the end.',
    'Your body recovers. The unanswered questions remain.',
  ],
];
function transfer(kind: 'opening' | 'return' | 'clinic', after?: () => void) {
  closeModal();
  paused = true;
  keys.clear();
  walk = [];
  game.dialogue = null;
  transferKind = kind;
  introPage = 0;
  el('s-intro-controls').hidden = kind !== 'opening';
  el('s-skip').textContent = kind === 'opening' ? 'Begin in 3886 · skip recollection' : 'Continue';
  el('s-transfer').classList.toggle('is-opening', kind === 'opening');
  pendingTransfer = after ?? null;
  transferStarted = performance.now();
  transferStep = -1;
  el('s-transfer').hidden = false;
  setInert(true);
  el(kind === 'opening' ? 's-intro-next' : 's-skip').focus({ preventScroll: true });
  audio.pause(false);
  audio.play(kind === 'clinic' ? 'breath' : 'mind-transfer');
}
function endTransfer() {
  if (pendingTransfer) {
    pendingTransfer();
    ignoreNextTransfer = game.phase === 'playing';
  }
  pendingTransfer = null;
  transferStarted = 0;
  el('s-transfer').hidden = true;
  setInert(false);
  paused = false;
  canvas.focus({ preventScroll: true });
  if (replayingIntro) {
    replayingIntro = false;
    journal();
    return;
  }
  save();
  if (game.phase === 'lost') {
    lost();
    return;
  }
  toast(
    transferKind === 'opening'
      ? 'Cequin helps this body breathe. Speak to the botanist beside the garden.'
      : 'Your mind settles. The investigation continues.',
    7000,
  );
}
el('s-skip').onclick = endTransfer;
function turnIntro(delta: number) {
  if (introPage + delta >= opening.length) {
    endTransfer();
    return;
  }
  introPage = Math.max(0, introPage + delta);
  transferStep = -1;
}
el('s-intro-next').onclick = () => turnIntro(1);
el('s-intro-prev').onclick = () => turnIntro(-1);
function updateTransfer(now: number) {
  if (!transferStarted) return;
  const lines =
      transferKind === 'opening' ? opening : transferKind === 'clinic' ? recovering : returning,
    seconds = (now - transferStarted) / 1000;
  const duration = reducedMotion.matches ? 2.5 : 3.1;
  const step =
    transferKind === 'opening'
      ? introPage
      : Math.min(lines.length - 1, Math.floor(seconds / duration));
  if (step !== transferStep) {
    transferStep = step;
    el('s-transfer-time').textContent = lines[step][0];
    el('s-transfer-line').textContent = lines[step][1];
    el('s-transfer-sub').textContent = lines[step][2];
    el('s-transfer').dataset.step = String(step);
    if (transferKind === 'opening') {
      el<HTMLButtonElement>('s-intro-prev').disabled = step === 0;
      el('s-intro-next').textContent =
        step === lines.length - 1
          ? replayingIntro
            ? 'Return to the notebook'
            : 'Wake in Vespera'
          : 'Continue →';
      el('s-intro-page').textContent = `${step + 1} / ${lines.length} · recollection`;
    }
    if (step === 1) audio.play('radio');
  }
  const p = seconds / (lines.length * duration);
  el('s-transfer').style.setProperty(
    '--transfer',
    String(
      transferKind === 'opening' ? 0.55 + Math.sin(seconds * 0.6) * 0.15 : Math.sin(Math.PI * p),
    ),
  );
  if (p >= 1 && transferKind !== 'opening') endTransfer();
}

function pauseMenu() {
  if (sharedActionPending) return;
  save();
  openModal(
    'pause',
    `<span class="s-chapter">Between thoughts</span><h2>This life can wait.</h2><p>Stíchos · 3886<br>World ${formatSeed(game.world.seed)} · ${Math.floor(game.distanceTraveled)} paces traveled</p><div class="s-menu-buttons"><button id="s-resume" class="s-primary">Return to the world</button><button id="s-save-file">Download save</button><button id="s-load-file">Restore a save</button><button id="s-new">Another possible Stíchos</button><button id="s-pause-life">Skills, homes & clothing</button><button id="s-pause-together">Play together</button><button id="s-pause-help">Controls</button></div><input id="s-save-input" type="file" accept=".json,application/json" hidden>`,
  );
  el('s-resume').onclick = closeModal;
  el('s-new').onclick = title;
  el('s-pause-help').onclick = controls;
  el('s-pause-life').onclick = lifeMenu;
  el('s-pause-together').onclick = togetherMenu;
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
function equipmentMenu() {
  openModal(
    'gear',
    `<span class="s-chapter">Belongings of ${esc(game.player.bodyName)}</span><h2>Wood, metal, and a living core.</h2><p>Longer weapons reach farther. Denser materials strike harder and recover more slowly. These belongings stay with this body when your mind travels.</p><div class="s-gear-cards">${(
      ['staff', 'sword', 'bow'] as WeaponKind[]
    )
      .map((kind) => {
        const p = game.weaponProfile(kind);
        const owned = game.weapons.has(kind);
        return `<article>${weaponIcon(game.player.appearance.seed, kind, 112)}<small>${owned ? (game.player.appearance.weapon === kind ? 'Equipped' : 'In this body’s keeping') : 'Available from merchants'}</small><h3>${esc(p.name)}</h3><dl><div><dt>Strength</dt><dd>${p.damage}</dd></div><div><dt>Reach</dt><dd>${p.range.toFixed(2)}</dd></div><div><dt>Recovery</dt><dd>${p.cooldown.toFixed(2)}s</dd></div></dl><p>${esc(p.effectDescription)}</p><button data-equip="${kind}" ${!owned ? 'disabled' : ''}>${owned ? 'Equip' : 'Not owned'}</button></article>`;
      })
      .join('')}</div><button id="s-gear-return" class="s-primary">Return to this life</button>`,
  );
  el('s-gear-return').onclick = closeModal;
}
function controls() {
  openModal(
    'help',
    `<span class="s-chapter">Living on Stíchos</span><h2>Take your time. Keep breathing.</h2><div class="s-control-list"><p><b>WASD / arrows</b><span>Walk · Shift runs</span></p><p><b>Click the ground</b><span>Follow a path; click a person or object to approach</span></p><p><b>E</b><span>Talk, gather, open, read, or use a nearby object</span></p><p><b>F / 1 / right mouse</b><span>Attack toward the cursor</span></p><p><b>Q / 2</b><span>Release a botanical ward</span></p><p><b>3 / 4 / 5 / 6</b><span>Cequin · salve · tonic · food</span></p><p><b>I / B / K</b><span>Satchel / prepare supplies / inspect equipment</span></p><p><b>J / M / Escape</b><span>Journal / map / pause</span></p><p><b>Mouse wheel</b><span>Zoom the world</span></p></div><p>Cequin sustains breath. Tonics help with cold. Rest near a shrine or bench. Roads connect inhabited districts; wilderness contains supplies and danger. Dialogue choices and violence affect clan trust.</p><p>Watch an attacker’s windup. Step sideways to avoid a drawn bow, use walls as cover, or interrupt a nearby strike with your weapon or ward.</p><button id="s-help-return" class="s-primary">Return to this life</button>`,
  );
  el('s-help-return').onclick = closeModal;
}
function journal(section?: NotebookSection) {
  if (section) {
    notebookView.section = section;
    notebookView.open = true;
  }
  openModal('journal', notebookHtml(game, notebookView));
  const refresh = (focus = '#s-leaf-title') => {
    journal();
    el('s-modal').querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  };
  el('s-journal-return').onclick = () => {
    if (game.hasNotebook && notebookView.open) foldNotebook(false);
    else closeModal();
  };
  const open = el('s-notebook-open');
  if (open) {
    open.onclick = () => {
      const revision = ++modalRevision;
      el('s-modal').querySelector('.s-notebook')?.classList.add('is-unfolding');
      open.setAttribute('disabled', '');
      setTimeout(
        () => {
          if (modal !== 'journal' || modalRevision !== revision) return;
          notebookView.open = true;
          refresh();
        },
        reducedMotion.matches ? 0 : 350,
      );
    };
    return;
  }
  el('s-modal')
    .querySelectorAll<HTMLButtonElement>('[data-notebook-section]')
    .forEach((button) => {
      button.onclick = () => {
        notebookView.section = button.dataset.notebookSection as NotebookSection;
        refresh(`[data-notebook-section="${notebookView.section}"]`);
      };
    });
  const leaf = (n: number) => {
    if (notebookView.section === 'years')
      notebookView.entry = Math.max(0, Math.min(JOURNAL_ENTRIES.length - 1, n));
    else notebookView.plant = Math.max(0, Math.min(PLANT_NOTES.length - 1, n));
    refresh();
  };
  el('s-modal')
    .querySelectorAll<HTMLButtonElement>('[data-leaf]')
    .forEach((button) => {
      button.onclick = () => leaf(Number(button.dataset.leaf));
    });
  const select = el<HTMLSelectElement>('s-notebook-select');
  if (select) select.onchange = () => leaf(Number(select.value));
  const current = () =>
    notebookView.section === 'years' ? notebookView.entry : notebookView.plant;
  const prev = el('s-leaf-prev'),
    next = el('s-leaf-next');
  if (prev) prev.onclick = () => leaf(current() - 1);
  if (next) next.onclick = () => leaf(current() + 1);
  el('s-notebook-type').onclick = () => {
    notebookView.plain = !notebookView.plain;
    try {
      localStorage.setItem('verso.notebook.plain', String(notebookView.plain));
    } catch {}
    refresh('#s-notebook-type');
  };
  el('s-notebook-intro').onclick = () => {
    replayingIntro = true;
    transfer('opening');
  };
  const search = el<HTMLInputElement>('s-glossary-search');
  if (search)
    search.oninput = () => {
      const query = search.value
        .trim()
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      let visible = 0;
      el('s-modal')
        .querySelectorAll<HTMLElement>('[data-glossary]')
        .forEach((entry) => {
          entry.hidden = !entry.dataset
            .glossary!.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .includes(query);
          if (!entry.hidden) visible++;
        });
      el('s-glossary-empty').hidden = visible !== 0;
    };
}
function foldNotebook(putAway: boolean) {
  if (!game.hasNotebook || !notebookView.open) {
    closeModal();
    return;
  }
  const book = el('s-modal').querySelector<HTMLElement>('.s-notebook');
  if (!book || book.classList.contains('is-folding')) return;
  const revision = ++modalRevision;
  book.classList.add('is-folding');
  book.inert = true;
  setTimeout(
    () => {
      if (modal !== 'journal' || modalRevision !== revision) return;
      notebookView.open = false;
      journal();
      const closedRevision = modalRevision;
      if (putAway)
        setTimeout(
          () => {
            if (modal === 'journal' && modalRevision === closedRevision && !notebookView.open)
              closeModal();
          },
          reducedMotion.matches ? 0 : 180,
        );
    },
    reducedMotion.matches ? 0 : 300,
  );
}
function atlasSource(): AtlasSource {
  return {
    identity: `${game.world.seed}:${game.world.generation}`,
    player: game.player,
    target: trackedQuest()?.target,
    waypoint: mapWaypoint ?? undefined,
    sites: game.discoveredSites,
    explored: (x, y) => game.explored(x, y),
    cells: (bounds) => game.exploredCells(bounds),
    terrain: (x, y) => game.world.tile(x, y).terrain,
    climate: (x, y) => game.world.climate(x, y),
  };
}
function mapModal() {
  const places = game.discoveredSites;
  openModal(
    'map',
    `<span class="s-chapter">Theo Bishop’s atlas · Stíchos, 3886</span><div class="s-atlas-heading"><h2>The country you remember.</h2><button id="s-map-return" class="s-primary">Keep walking</button></div><div class="s-atlas-toolbar"><div class="s-atlas-zoom"><button id="s-atlas-minus" aria-label="Zoom atlas out">−</button><button id="s-atlas-plus" aria-label="Zoom atlas in">+</button></div><button id="s-atlas-body">My body</button><button id="s-atlas-fit">All explored</button>${trackedQuest()?.target ? '<button id="s-atlas-task">Current thread</button>' : ''}<span id="s-atlas-scale"></span></div><div class="s-atlas-layout"><div class="s-atlas-chart"><canvas id="s-large-map" tabindex="0" width="800" height="500" aria-label="Explored world atlas. Drag or use arrow keys to pan. Scroll or use plus and minus to zoom. Click to mark a destination."></canvas><div class="s-atlas-coordinate-line"><span id="s-atlas-coordinate"></span><span>Dark country is uncharted</span></div></div><aside class="s-atlas-places"><h3>Known places</h3>${places.length ? places.map((site) => `<button data-atlas-site="${esc(site.id)}"><strong>${esc(site.name)}</strong><small>${esc(site.detail)} · ${Math.round(site.x)}, ${Math.round(site.y)}</small></button>`).join('') : '<p>Walk the roads to learn the names of distant places.</p>'}<div class="s-atlas-mark"><h3>Chart mark</h3><p id="s-atlas-mark-label">Click the chart to mark a destination.</p><button id="s-atlas-follow" disabled>Follow this mark</button><button id="s-atlas-clear" ${mapWaypoint ? '' : 'disabled'}>Clear mark</button></div></aside></div><form id="s-atlas-find" class="s-atlas-find"><span>Find coordinates</span><label>East / west <input id="s-atlas-x" type="number" step="1" min="-1000000000" max="1000000000" value="${Math.round(game.player.x)}" required></label><label>North / south <input id="s-atlas-y" type="number" step="1" min="-1000000000" max="1000000000" value="${Math.round(game.player.y)}" required></label><button type="submit">Locate</button></form><p class="s-atlas-hint">Drag to move the chart. Scroll to change scale. Your gold arrow marks the current body; diamonds mark destinations. Only explored terrain is drawn. Looking at the atlas does not move your body or reveal distant country.</p>`,
  );
  const map = el<HTMLCanvasElement>('s-large-map');
  map.width = Math.max(260, Math.round(map.getBoundingClientRect().width));
  map.height = Math.min(560, Math.max(290, Math.round(innerHeight * 0.51)));
  let selection: Point | null = mapWaypoint ? { ...mapWaypoint } : null;
  const updateMark = () => {
    const button = el<HTMLButtonElement>('s-atlas-follow');
    button.disabled = !selection;
    el<HTMLButtonElement>('s-atlas-clear').disabled = !selection && !mapWaypoint;
    el('s-atlas-mark-label').textContent = selection
      ? `${Math.round(selection.x)}, ${Math.round(selection.y)} · ${game.explored(selection.x, selection.y) ? 'explored country' : 'uncharted country'} · ${atlasDistance(Math.hypot(selection.x - game.player.x, selection.y - game.player.y))} from this body`
      : 'Click the chart to mark a destination.';
  };
  chartControl = new AtlasController(
    map,
    () => ({ ...atlasSource(), waypoint: selection ?? undefined }),
    atlasPainter,
    (view, cursor) => {
      chartView = { ...view };
      const at = cursor ?? view;
      el('s-atlas-coordinate').textContent =
        `${Math.round(at.x).toLocaleString('en-US')}, ${Math.round(at.y).toLocaleString('en-US')}`;
      el('s-atlas-scale').textContent = `${atlasDistance(map.width / view.scale)} across`;
    },
    (point) => {
      selection = { x: Math.round(point.x), y: Math.round(point.y) };
      updateMark();
      chartControl?.requestDraw();
    },
    chartView ?? { x: game.player.x, y: game.player.y, scale: 3 },
  );
  el('s-atlas-plus').onclick = () => chartControl?.zoom(2);
  el('s-atlas-minus').onclick = () => chartControl?.zoom(0.5);
  el('s-atlas-body').onclick = () => chartControl?.center(game.player);
  el('s-atlas-fit').onclick = () => chartControl?.fit(game.exploredBounds);
  const task = document.getElementById('s-atlas-task');
  if (task)
    task.onclick = () => {
      const point = trackedQuest()?.target;
      if (point) chartControl?.center(point);
    };
  document.querySelectorAll<HTMLButtonElement>('[data-atlas-site]').forEach((button) => {
    button.onclick = () => {
      const site = game.discoveredSites.find((s) => s.id === button.dataset.atlasSite);
      if (site) {
        selection = { x: site.x, y: site.y };
        chartControl?.center(site);
        updateMark();
      }
    };
  });
  el<HTMLFormElement>('s-atlas-find').onsubmit = (event) => {
    event.preventDefault();
    const point = {
      x: Number(el<HTMLInputElement>('s-atlas-x').value),
      y: Number(el<HTMLInputElement>('s-atlas-y').value),
    };
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.max(Math.abs(point.x), Math.abs(point.y)) > 1e9
    )
      return;
    chartControl?.center(point);
    selection = point;
    updateMark();
  };
  el('s-atlas-follow').onclick = () => {
    if (!selection) return;
    mapWaypoint = { ...selection };
    trackedQuestId = 'map-waypoint';
    closeModal();
    updateUI();
    drawMap();
    toast('Follow the atlas bearing in your field notes.');
  };
  el('s-atlas-clear').onclick = () => {
    mapWaypoint = null;
    selection = null;
    if (trackedQuestId === 'map-waypoint') trackedQuestId = null;
    updateMark();
    chartControl?.requestDraw();
    updateUI();
  };
  el('s-map-return').onclick = closeModal;
  updateMark();
}

function lost() {
  const anotherMind = game.transferReady && !!game.transferCandidate;
  openModal(
    'lost',
    `<span class="s-chapter">The breath stops</span><h2>${anotherMind ? 'Your mind is still here.' : 'A voice pulls you back.'}</h2><p>${anotherMind ? 'The restored signal can hold your consciousness while another body wakes. Your choices remain in Stíchos.' : 'The clinic knows this face. Somewhere beyond the cold, someone is still trying to reach you.'}</p><button id="s-return-life" class="s-primary">${anotherMind ? 'Follow the other heartbeat' : 'Wake at the clinic'}</button>`,
  );
  el('s-return-life').onclick = () =>
    transfer(anotherMind ? 'return' : 'clinic', () => {
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
  el('s-dialogue').hidden = !d;
  const signature = JSON.stringify(d);
  if (signature === dialogueSignature) return;
  dialogueSignature = signature;
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
  el('s-pocketbook-label').textContent = game.hasNotebook
    ? 'The priest’s notebook'
    : 'Remembered pages';
  el('s-pocketbook-note').textContent = game.hasNotebook
    ? 'In this body’s keeping'
    : 'The book remains with the priest';
  const p = game.player,
    tile = game.world.tile(p.x, p.y);
  el('s-person-name').textContent = p.bodyName;
  const bodySignature = JSON.stringify(game.displayAppearance);
  if (portraitSignature !== bodySignature) {
    portraitSignature = bodySignature;
    const portrait = el<HTMLCanvasElement>('s-portrait').getContext('2d')!;
    drawPortrait(portrait, game.displayAppearance);
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
    (tile.site ? 'Botanical seed vault' : closest?.name) ??
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
  const q = trackedQuest();
  el('s-quest-title').textContent = q?.title ?? 'A life beyond the cathedral';
  el('s-quest-objective').textContent =
    q?.objective ?? 'Follow the roads. Find the people whose lives touch yours.';
  const target = q?.target;
  if (target) {
    const dx = target.x - p.x,
      dy = target.y - p.y;
    const bearing = [
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
      'north',
      'northeast',
    ][((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
    const steps = Math.round(Math.hypot(dx, dy));
    el('s-quest-distance').textContent =
      steps < 3 ? 'Your destination is nearby.' : `${steps} paces ${bearing}`;
  } else el('s-quest-distance').textContent = '';
  el('s-distance').textContent = `${Math.floor(game.distanceTraveled)} paces traveled`;
  document
    .querySelectorAll<HTMLElement>('[data-count]')
    .forEach((n) => (n.textContent = String(game.inventory[n.dataset.count as ItemId] ?? 0)));
  const equipmentKey = `${p.appearance.seed}:${p.appearance.weapon}`;
  const equipmentChanged = equipmentSignature !== equipmentKey;
  equipmentSignature = equipmentKey;
  if (equipmentChanged) {
    const kind = p.appearance.weapon === 'none' ? 'staff' : p.appearance.weapon;
    document
      .querySelector('[data-action="attack"] svg')
      ?.replaceWith(
        document.createRange().createContextualFragment(weaponIcon(p.appearance.seed, kind, 30)),
      );
  }
  document.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((n) => {
    if (equipmentChanged)
      n.innerHTML = weaponIcon(p.appearance.seed, n.dataset.equip as WeaponKind, 38);
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
    context.textContent = `E · ${'role' in near ? 'Speak to ' + near.name : (({ cequin: 'Gather cequin', heartleaf: 'Gather heartleaf', emberroot: 'Gather emberroot', pine: 'Gather wood', rock: 'Mine stone', chest: 'Open chest', radio: 'Listen to the radio', workbench: 'Use workbench', shrine: 'Rest and remember', notice: 'Read the notice', door: game.opened.has(near.id) ? 'Close door' : 'Open door', bench: 'Rest here', crate: 'Search crate' } as Record<string, string>)[near.kind] ?? near.name)}`;
  if (near && !('role' in near)) {
    const plant = game.botanicalProfile(near);
    if (plant)
      context.textContent = `E · Gather ${plant.name.toLowerCase()} · ${plant.yield} portions`;
  }
  updatePack();
  updateDialogue();
}
function drawMap(target = el<HTMLCanvasElement>('s-map'), scale = 5) {
  atlasPainter.draw(target, atlasSource(), { x: game.player.x, y: game.player.y, scale }, false);
}

function lifeMenu() {
  if (sharedActionPending) return;
  openModal(
    'life',
    '<span class="s-chapter">A life of your choosing</span><h2>What will you make of it?</h2><div id="s-life-content"></div><button id="s-life-return" class="s-primary">Return to the world</button>',
  );
  mountLife(el('s-life-content'), game, () => {
    updateUI();
    save();
  });
  el('s-life-return').onclick = closeModal;
}
function endingMenu() {
  const ending = game.endingSummary;
  if (!ending) return;
  save();
  openModal(
    'ending',
    `<div class="s-ending-mark" aria-hidden="true">◇</div><span class="s-chapter">Destino: Stíchos · A choice made awake</span><h2>${esc(ending.title)}</h2><p class="s-ending-prose">${esc(ending.text)}</p><p>For twenty stíchoi, I waited for permission to return. Today I answered for myself. Whatever waits beyond the signal, the people here are no longer a history I can stand outside.</p><p class="s-ending-signature">Theo Bishop · 3886</p><p>Your investigation is complete. Stíchos remains open: choose a profession, cultivate a home, take commissions, travel with friends, or visit a quiet shrine to enter another remembered, willing life.</p><div class="s-menu-buttons"><button id="s-ending-continue" class="s-primary">Keep living on Stíchos</button><button id="s-ending-life">Choose my next calling</button><button id="s-ending-journal">Write the next page</button></div>`,
  );
  el('s-ending-continue').onclick = closeModal;
  el('s-ending-life').onclick = lifeMenu;
  el('s-ending-journal').onclick = () => journal('threads');
}
function roomIdentity() {
  return {
    seed: game.world.seed,
    generation: game.world.generation,
    name: roomName,
    appearance: game.displayAppearance,
    position: { x: game.player.x, y: game.player.y },
  };
}
function togetherMenu() {
  if (sharedActionPending) return;
  const active = multiplayer.status === 'online';
  openModal(
    'together',
    `<span class="s-chapter">Voices on the same frequency</span><h2>Travel together.</h2><p>Share the roads of the same Stíchos with up to eight people. You see each other move, gather from the same plants and chests, and open the same doors. Your story, battles, homes and belongings stay personal.</p><p class="s-room-status" role="status">${active ? `Connected · room <b>${esc(multiplayer.room)}</b> · ${multiplayer.peers.length + 1}/8 travelers` : multiplayer.status === 'disconnected' ? 'Signal interrupted. Reconnect to refresh the shared world.' : 'Create a room, or enter a friend’s room code.'}</p><p>World <b>${formatSeed(game.world.seed)}</b> · geography ${game.world.generation}<br>Friends must start or restore this same world before joining.</p>${active ? `<div class="s-room-people">${[{ id: multiplayer.peerId, name: roomName, x: game.player.x, y: game.player.y }, ...multiplayer.peers].map((p) => `<p><b>${esc(p.name)}</b><span>${Math.round(p.x)}, ${Math.round(p.y)}${p.id === multiplayer.peerId ? ' · you' : ''}</span></p>`).join('')}</div><label>Invitation<input id="s-room-invitation" readonly value="${esc(`Stíchos · seed ${formatSeed(game.world.seed)} · geography ${game.world.generation} · room ${multiplayer.room} · server ${roomServer}`)}"></label><div class="s-menu-buttons"><button id="s-room-copy">Copy invitation</button><button data-room-emote="wave">Wave</button><button data-room-emote="thanks">Thank you</button><button data-room-emote="help">Over here</button><button id="s-room-leave">Leave room</button></div>` : `<form id="s-room-form"><label>Your traveler name<input id="s-room-name" value="${esc(roomName)}" maxlength="32" required></label><label>Game server<input id="s-room-server" value="${esc(roomServer)}" maxlength="240" required></label><label>Room code · leave empty to create<input id="s-room-code" value="${esc(multiplayer.room)}" maxlength="16" autocapitalize="characters"></label><button class="s-primary" type="submit">${multiplayer.status === 'connecting' ? 'Connecting…' : 'Join this frequency'}</button>${multiplayer.reconnectable ? '<button id="s-room-reconnect" type="button">Reconnect to my room</button><button id="s-room-forget" type="button">Leave this room</button>' : ''}</form>`}<button id="s-room-return">Return to the world</button>`,
  );
  el('s-room-return').onclick = closeModal;
  if (active) {
    el('s-room-leave').onclick = () => {
      multiplayer.disconnect();
      togetherMenu();
      toast('You are traveling alone again.');
    };
    el('s-room-copy').onclick = async () => {
      const input = el<HTMLInputElement>('s-room-invitation');
      input.select();
      try {
        await navigator.clipboard.writeText(input.value);
        toast('Invitation copied.');
      } catch {
        toast('Select and copy the invitation above.');
      }
    };
    document.querySelectorAll<HTMLButtonElement>('[data-room-emote]').forEach(
      (button) =>
        (button.onclick = () => {
          multiplayer.emote(button.dataset.roomEmote as 'wave' | 'thanks' | 'help');
          closeModal();
        }),
    );
  } else {
    el<HTMLFormElement>('s-room-form').onsubmit = async (event) => {
      event.preventDefault();
      if (multiplayer.status === 'connecting') return;
      roomName = el<HTMLInputElement>('s-room-name').value.trim() || 'Traveler';
      roomServer = el<HTMLInputElement>('s-room-server').value.trim();
      const code = el<HTMLInputElement>('s-room-code').value.trim().toUpperCase();
      try {
        localStorage.setItem('verso.room.name', roomName);
        localStorage.setItem('verso.room.server', roomServer);
      } catch {}
      try {
        await multiplayer.connect(roomServer, roomIdentity(), code);
        if (modal === 'together') togetherMenu();
        toast('The shared frequency is open.');
      } catch (error) {
        if (modal === 'together') togetherMenu();
        toast(error instanceof Error ? error.message : 'Could not join this room.');
      }
    };
    const forget = document.getElementById('s-room-forget');
    if (forget)
      forget.onclick = () => {
        multiplayer.disconnect();
        togetherMenu();
      };
    const reconnect = document.getElementById('s-room-reconnect');
    if (reconnect)
      reconnect.onclick = async () => {
        try {
          await multiplayer.reconnect(roomIdentity());
          if (modal === 'together') togetherMenu();
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Could not reconnect.');
        }
      };
  }
}
multiplayer.onChange = () => {
  el('s-together').textContent =
    multiplayer.status === 'online'
      ? `Together · ${multiplayer.peers.length + 1}`
      : multiplayer.status === 'disconnected'
        ? 'Reconnect'
        : 'Together';
  const signature = `${multiplayer.status}:${multiplayer.room}:${multiplayer.peers.map((p) => p.id).join(',')}`;
  if (signature !== multiplayerRoster) {
    multiplayerRoster = signature;
    if (modal === 'together' && multiplayer.status !== 'connecting') togetherMenu();
  }
};
multiplayer.onMessage = (text) => toast(text, 7000);
multiplayer.onEmote = (id, gesture) => {
  const text = { wave: 'Hello!', thanks: 'Thank you.', help: 'Over here!' }[gesture];
  peerEmotes.set(id, { text, until: performance.now() + 4500 });
  toast(
    `${id === multiplayer.peerId ? roomName : (multiplayer.peers.find((p) => p.id === id)?.name ?? 'A traveler')}: ${text}`,
    3000,
  );
};
multiplayer.onWorld = (change) => {
  if (change.type === 'welcome') {
    for (const id of game.opened)
      if (id.includes(':door') && !change.opened.includes(id)) {
        game.opened.delete(id);
        game.removed.delete(id);
      }
  }
  for (const id of change.removed ?? []) game.removed.add(id);
  for (const id of change.opened ?? []) {
    game.opened.add(id);
    if (id.includes(':door')) game.removed.add(id);
  }
  if (change.type === 'world')
    for (const id of change.closed ?? []) {
      game.opened.delete(id);
      game.removed.delete(id);
    }
  save();
};
async function interactShared(id?: string) {
  if (sharedActionPending || game.phase !== 'playing') return;
  const target = id
    ? (game.world.propsAround(game.player.x, game.player.y, 2.2).find((p) => p.id === id) ??
      game.npcs.find((n) => n.id === id))
    : game.nearby();
  if (
    !target ||
    'role' in target ||
    ![
      'cequin',
      'heartleaf',
      'emberroot',
      'mushroom',
      'pine',
      'rock',
      'chest',
      'crate',
      'door',
    ].includes(target.kind) ||
    multiplayer.status === 'offline'
  ) {
    game.interact(id);
    updateUI();
    save();
    return;
  }
  if (multiplayer.status !== 'online') {
    toast('Reconnect from Together, or leave the room before gathering alone.');
    return;
  }
  if (
    ['chest', 'crate'].includes(target.kind) &&
    game.opened.has(target.id) &&
    game.campaignObjective?.kind === 'archive' &&
    game.campaignObjective.target.id === target.id
  ) {
    game.interact(target.id);
    updateUI();
    save();
    return;
  }
  const available = game.interactionAvailability(target.id);
  if (!available.ok) {
    toast(available.reason ?? 'This cannot be gathered yet.');
    return;
  }
  const current = game,
    desiredOpen = !game.opened.has(target.id);
  sharedActionPending = true;
  keys.clear();
  walk = [];
  setInert(true);
  multiplayer.pose(game.player, game.displayAppearance, true);
  try {
    const result =
      target.kind === 'door'
        ? await multiplayer.door(target.id, desiredOpen)
        : await multiplayer.claim(
            target.id,
            ['chest', 'crate'].includes(target.kind) ? 'loot' : 'gather',
            target,
          );
    if (current !== game) return;
    if (result.ok) {
      if (target.kind !== 'door' || game.opened.has(target.id) !== desiredOpen)
        game.interact(target.id);
      updateUI();
      save();
    } else toast(result.reason ?? 'Another traveler reached it first.');
  } finally {
    sharedActionPending = false;
    if (!modal && !transferStarted) setInert(false);
    if (document.hidden && !modal && !transferStarted) pauseMenu();
  }
}
function act(command: string) {
  if (
    !started ||
    paused ||
    sharedActionPending ||
    transferStarted ||
    game.dialogue ||
    game.phase !== 'playing'
  )
    return;
  if (command === 'attack') game.attack(pointer ?? undefined);
  if (command === 'ward') game.ward();
  if (command === 'interact') void interactShared();
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
    void interactShared(target.id);
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
    const d = Math.hypot((npc.x - point.x) / 0.6, (npc.y - 0.8 - point.y) / 1.1);
    if (d < 1) candidates.push([npc, d]);
  }
  for (const prop of game.world.propsAround(point.x, point.y, 2)) {
    if (game.removed.has(prop.id) && prop.kind !== 'door') continue;
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
    const plant = 'role' in hover ? null : game.botanicalProfile(hover);
    label.textContent = plant
      ? `${plant.name} · ${plant.yield} portions · ${plant.construction}`
      : hover.name + ('role' in hover ? ` · ${hover.role}` : '');
    label.style.left = `${Math.max(8, Math.min(bounds.width - label.offsetWidth - 8, event.clientX - bounds.left + 14))}px`;
    label.style.top = `${Math.max(10, Math.min(bounds.height - label.offsetHeight - 8, event.clientY - bounds.top - label.offsetHeight - 10))}px`;
  }
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
  hover = null;
  el('s-hover').hidden = true;
});
canvas.addEventListener('pointerdown', (event) => {
  if (paused || sharedActionPending || game.dialogue || !started) return;
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
  if (!button || sharedActionPending) return;
  const d = button.dataset;
  audio.play('click');
  if (d.trackQuest) {
    trackedQuestId = d.trackQuest;
    if (modal === 'journal') foldNotebook(true);
    else closeModal();
    updateUI();
    drawMap();
  }
  if (d.action) act(d.action);
  if (d.use && !paused) {
    game.use(d.use as ItemId);
    updateUI();
    save();
  }
  if (d.equip && (!paused || modal === 'gear')) {
    game.equip(d.equip as 'staff' | 'sword' | 'bow');
    if (modal === 'gear') closeModal();
    updateUI();
    save();
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
    const previousEnding = game.campaign.ending;
    const knownQuests = new Set(game.quests.map((q) => q.id));
    const sourceId = game.dialogue?.npcId;
    game.choose(d.choice);
    const accepted = game.quests.find((q) => !knownQuests.has(q.id) && !q.complete);
    if (accepted) trackedQuestId = accepted.id;
    else if (d.choice === 'vault:survey' && sourceId) {
      const survey = game.quests.find(
        (q) => q.id === sourceId.replace(/:notice$/, ':survey') && !q.complete,
      );
      if (survey) trackedQuestId = survey.id;
    }
    updateUI();
    drawMap();
    save();
    if (!previousEnding && game.campaign.ending) endingMenu();
  }
});
el('s-life').onclick = lifeMenu;
el('s-together').onclick = togetherMenu;
el('s-context').onclick = () => act('interact');
el('s-pause').onclick = pauseMenu;
el('s-journal').onclick = () => journal();
el('s-pocketbook').onclick = () => {
  notebookView.open = false;
  journal();
};
el('s-track').onclick = () => journal('threads');
el('s-expand-map').onclick = mapModal;
el('s-help').onclick = controls;
el('s-inspect-gear').onclick = equipmentMenu;
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
  if (sharedActionPending) {
    e.preventDefault();
    return;
  }
  if (e.key === 'Tab' && (modal || transferStarted)) {
    const focus = [
      ...el(transferStarted ? 's-transfer' : 's-modal').querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not([hidden]),select,textarea,a[href],[tabindex="0"]',
      ),
    ].filter((node) => node.getClientRects().length && !node.closest('[hidden],[inert]'));
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
  if (e.key !== 'Escape' && (e.target as HTMLElement).matches('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if (transferStarted) {
    if (k === 'enter' && (e.target as HTMLElement).closest('button')) return;
    if (['escape', 'enter', 'arrowright', 'arrowleft'].includes(k)) {
      e.preventDefault();
      if (k === 'escape' || transferKind !== 'opening') endTransfer();
      else turnIntro(k === 'arrowleft' ? -1 : 1);
    }
    return;
  }
  if (k === 'escape') {
    e.preventDefault();
    if (modal === 'journal') foldNotebook(true);
    else if (modal && modal !== 'title' && modal !== 'lost') closeModal();
    else if (game.dialogue) {
      game.dialogue = null;
      updateDialogue();
    } else if (!modal) pauseMenu();
    return;
  }
  if (modal === 'journal' && k === 'j') {
    e.preventDefault();
    foldNotebook(true);
    return;
  }
  if (modal || !started) return;
  if (!e.repeat) {
    if (k === 'l') {
      lifeMenu();
      return;
    }
    if (k === 'k') {
      equipmentMenu();
      return;
    }
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
  if (started && !paused && !sharedActionPending && !game.dialogue && !transferStarted) {
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
          const target = walkTarget;
          walkTarget = undefined;
          void interactShared(target);
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
    if (!sharedActionPending) game.update(dt, { x, y, run: keys.has('shift') });
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
          level: 'scanned',
          trade: 'relay',
          ward: 'pulse',
        } as Record<string, string>
      )[event.kind],
    );
    if (event.kind === 'transfer' && !transferStarted) transfer('return');
  }
  multiplayer.pose(game.player, game.displayAppearance);
  renderer.draw(game, {
    peers: multiplayer.peers,
    playerAppearance: game.displayAppearance,
    emotes: peerEmotes,
    reducedMotion: reducedMotion.matches,
    transfer: transferStarted
      ? Math.max(
          0.0001,
          Math.min(
            1,
            (now - transferStarted) /
              ((reducedMotion.matches ? 2500 : 3100) *
                (transferKind === 'opening' ? opening.length : 2)),
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
        worldGeneration: game.world.generation,
        hasNotebook: game.hasNotebook,
        notebook: { ...notebookView },
        player: game.player,
        phase: game.phase,
        time: game.time,
        paused,
        modal,
        transfer: !!transferStarted,
        inventory: game.inventory,
        quests: game.quests,
        storyStage: game.storyStage,
        campaign: game.campaign,
        campaignObjective: game.campaignObjective,
        endingSummary: game.endingSummary,
        freeLife: game.freeLife,
        knownIdentities: game.knownIdentities,
        progression: game.progression,
        nearbyHomes: game.nearbyHomes,
        bodyId: game.bodyId,
        displayAppearance: game.displayAppearance,
        multiplayer: {
          status: multiplayer.status,
          room: multiplayer.room,
          peerId: multiplayer.peerId,
          peers: multiplayer.peers,
          pending: sharedActionPending,
        },
        transferReady: game.transferReady,
        occupiedNpcId: game.occupiedNpcId,
        transferCandidate: game.transferCandidate,
        transferCandidates: game.transferCandidates,
        correspondenceJobs: game.dispatches,
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
        explorationRevision: game.explorationRevision,
        exploredBounds: game.exploredBounds,
        discoveredSites: game.discoveredSites,
        atlasView: chartControl ? { ...chartControl.view } : chartView,
        mapWaypoint,
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
    vaults(x: number, y: number, radius = 100) {
      return structuredClone(game.world.vaultsAround(x, y, radius));
    },
    botanicalProfile(prop: Prop) {
      return structuredClone(game.botanicalProfile(prop));
    },
    explored(x: number, y: number) {
      return game.explored(x, y);
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
