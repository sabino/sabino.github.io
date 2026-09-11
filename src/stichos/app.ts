import './style.css';
import './notebook.css';
import './life.css';
import './universe-ui.css';
import './screen-ui.css';
import aiCompanionGuide from '../../docs/stichos/AI-COMPANION.md?url';
import { drawProduction } from './production-art';
import { creationHtml, mountCreation } from './creation';
import { mountGalaxy } from './galaxy';
import { findWalkingPath } from './pathfinding.ts';
import {
  STICHOS_SEED,
  planetAt,
  sectorPlanets,
  knownWorlds,
  rememberWorld,
  stashLife,
  rememberedLife,
  readRoomLink,
  roomLink,
  roomAddress,
  roomTitle,
  readRoomInput,
  validRoomCode,
  publicRoomCode,
} from './universe';
import type { Geography, RoomInvitation, Planet } from './universe';
import { requestInstall } from '../install';
import qrcode from 'qrcode-generator';
import { claimLifeTab, releaseLifeTab } from './life-lease';
import { mountLife } from './life';
import { MultiplayerConnection, getBrowserPlayerId, savedWorlds } from './multiplayer';
import { PRODUCTION_KINDS, type ProductionKind } from './production';
import { notebookHtml, notebookLeafCount } from './notebook';
import type { NotebookSection, NotebookView } from './notebook';
import { INTRO_BEATS, JOURNAL_ENTRIES, PLANT_NOTES } from './lore';
import { Stichos, ITEMS, RECIPES } from './session';
import { StichosRenderer } from './render';
import { drawPortrait } from './portrait';
import { weaponIcon } from './equipment';
import { artifactIcon } from './artifact-art';
import { toolIcon } from './labor-art';
import type { ToolKind } from './labor';
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
 <header class="s-header"><a class="s-brand" href="?">VERSO<span>One universe, many lives</span></a><div class="s-location"><strong id="s-place">Vespera</strong><span id="s-coordinates">Stíchos · 3886</span></div><nav><button id="s-sound" title="Sound">♫</button><button id="s-together" title="Play together">Together</button><button id="s-life" title="Professions, homes and clothing (L)">Life</button><button id="s-journal" title="Journal (J)">Journal <kbd>J</kbd></button><button id="s-pause" aria-label="Pause">Ⅱ</button></nav></header>
 <section class="s-world-wrap"><canvas id="s-world" tabindex="0" aria-label="An open world in the Verso universe. WASD or click to walk. E to interact."></canvas><div class="s-weather"><i></i><span id="s-weather">A cold morning</span></div><div class="s-mobile-status"><span>♥ <b id="s-mobile-hp"></b><i><em id="s-mobile-hp-bar"></em></i></span><span>Breath <b id="s-mobile-breath"></b><i><em id="s-mobile-breath-bar"></em></i></span></div><div class="s-compass">N<span>◇</span></div><div id="s-hover" class="s-hover" hidden></div><button id="s-context" class="s-context" hidden></button><div id="s-toast" class="s-toast" role="status" aria-live="polite"></div><div class="s-world-caption">Every road leads to another life.</div></section>
 <aside class="s-sidebar"><section class="s-person"><div class="s-person-heading"><canvas id="s-portrait" width="96" height="112" aria-label="Your current human host"></canvas><div><small id="s-body-label">A borrowed life</small><h1 id="s-person-name">Theo Bishop</h1></div><strong id="s-level">1</strong></div><div class="s-meter health"><label>Vitality <b id="s-hp-label"></b></label><div><i id="s-hp"></i></div></div><div class="s-meter breath"><label>Breath <b id="s-breath-label"></b></label><div><i id="s-breath"></i></div></div><div class="s-person-minor"><span id="s-warmth"></span><span id="s-stamina"></span></div><div class="s-xp"><i id="s-xp"></i></div></section>
 <section class="s-map-block"><canvas id="s-map" width="240" height="150" aria-label="Map around your current position"></canvas><div><span id="s-map-label">Vespera</span><button id="s-expand-map" aria-label="Open world atlas" title="Map (M)">⤢</button></div></section>
 <section class="s-task"><small>Following a thread</small><h2 id="s-quest-title"></h2><p id="s-quest-objective"></p><span id="s-quest-distance"></span><button id="s-track">Read journal</button></section>
 <section class="s-pack"><div class="s-pack-heading"><h2>Your satchel</h2><span id="s-coins"></span><button id="v-pack-close" aria-label="Close satchel">×</button></div><div class="s-tabs" role="tablist" aria-label="Satchel view"><button id="s-tab-pack" role="tab" aria-selected="true">Belongings</button><button id="s-tab-craft" role="tab" aria-selected="false">Prepare</button></div><div id="s-pack-content"></div><button id="s-pocketbook" class="s-pocketbook"><span aria-hidden="true">▤</span><strong id="s-pocketbook-label">The priest’s notebook</strong><small id="s-pocketbook-note">In this body’s keeping</small></button><div id="s-item-detail" class="s-item-detail">Select an item to examine it.</div></section>
 <footer class="s-side-footer"><span id="s-distance">0 paces traveled</span><button id="s-help">Controls</button></footer></aside>
 <footer class="s-actionbar"><div class="s-equipment"><button data-equip="staff" title="Equip staff">${itemIcon('staff')}</button><button data-equip="sword" title="Equip sword">${itemIcon('sword')}</button><button data-equip="bow" title="Equip bow">${itemIcon('bow')}</button><button id="s-inspect-gear" title="Inspect equipment (K)">Gear</button></div><div class="s-hotkeys"><button data-action="attack" title="Attack (F / 1)"><kbd>1</kbd>${itemIcon('sword')}<span>Strike</span></button><button data-action="ward" title="Botanical ward (Q / 2)"><kbd>2</kbd>${itemIcon('ward')}<span>Ward</span><i id="s-ward-cooldown"></i></button><button data-use="cequin" title="Breathe cequin (3)"><kbd>3</kbd>${itemIcon('cequin')}<b data-count="cequin"></b><span>Breathe</span></button><button data-use="salve" title="Apply salve (4)"><kbd>4</kbd>${itemIcon('salve')}<b data-count="salve"></b><span>Heal</span></button><button data-use="tonic" title="Use warming tonic (5)"><kbd>5</kbd>${itemIcon('tonic')}<b data-count="tonic"></b><span>Warm</span></button><button data-use="rations" title="Eat (6)"><kbd>6</kbd>${itemIcon('rations')}<b data-count="rations"></b><span>Eat</span></button><button data-action="interact" title="Interact (E)"><kbd>E</kbd>${itemIcon('hand')}<span>Interact</span></button></div><button id="s-mobile-pack">Satchel</button><button id="v-mobile-more">More</button><span class="s-walk-help">WASD / click to walk<br>Shift to run</span></footer>
 <div class="s-mobile-move"><button data-move="w">↑</button><button data-move="a">←</button><button data-move="s">↓</button><button data-move="d">→</button></div>
 <div id="s-dialogue" class="s-dialogue" hidden></div><div id="s-modal" class="s-modal" hidden></div><div id="s-transfer" class="s-transfer" role="dialog" aria-modal="true" aria-labelledby="s-transfer-line" hidden><div class="s-transfer-ring"></div><span id="s-transfer-time"></span><h2 id="s-transfer-line"></h2><p id="s-transfer-sub"></p><div id="s-intro-controls" class="s-intro-controls" hidden><button id="s-intro-prev">← Back</button><span id="s-intro-page" aria-live="polite"></span><button id="s-intro-next">Continue →</button></div><button id="s-skip">Continue</button></div></main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (text: unknown) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const canvas = el<HTMLCanvasElement>('s-world');
document
  .querySelector('.s-header nav')!
  .insertAdjacentHTML(
    'afterbegin',
    '<button id="v-galaxy" title="Galaxy chart (G)">Galaxy</button><button id="v-work" title="Construct and automate">Work</button>',
  );
document
  .querySelector('.s-shell')!
  .insertAdjacentHTML(
    'beforeend',
    `<section class="v-chat" aria-label="Traveler communication"><nav><button data-chat-channel="say" aria-pressed="true">Local</button><button data-chat-channel="world" aria-pressed="false">Room</button><button id="v-chat-settings" title="Assign phrases to shortcuts">Shortcuts</button><button id="v-chat-toggle" aria-label="Collapse chat">−</button><span id="v-chat-status">Traveling alone</span></nav><div id="v-chat-log" role="log" aria-live="polite"></div><form id="v-chat-form"><input id="v-chat-input" maxlength="280" placeholder="Enter to talk · /help for commands" aria-label="Chat message" autocomplete="off"><button type="submit">Send</button></form></section>`,
  );
document
  .querySelector('.s-person-minor')!
  .insertAdjacentHTML(
    'beforebegin',
    '<div class="s-meter v-energy"><label>Energy <b id="v-energy-label">100%</b></label><div><i id="v-energy-bar"></i></div></div>',
  );
document
  .querySelector('.s-map-block')!
  .insertAdjacentHTML(
    'afterbegin',
    '<div class="v-map-heading"><span>Local chart</span><div><small>World zoom</small><button id="v-map-less" aria-label="Zoom world out">−</button><button id="v-map-more" aria-label="Zoom world in">+</button></div></div>',
  );
document
  .querySelector('.s-side-footer')!
  .insertAdjacentHTML(
    'beforebegin',
    '<section class="v-roster"><header><span id="v-roster-title">Travelers</span><button id="v-roster-page" aria-label="Next travelers">›</button></header><div id="v-roster-list"></div></section>',
  );
document
  .querySelector('.s-walk-help')!
  .insertAdjacentHTML(
    'beforebegin',
    '<div class="v-phrase-bar">' +
      ['Hello', 'Follow', 'Wait']
        .map(
          (p, i) =>
            `<button data-phrase-send="${i}" title="Send F${i + 7} phrase"><kbd>F${i + 7}</kbd><span>${p}</span></button>`,
        )
        .join('') +
      '</div>',
  );
const renderer = new StichosRenderer(canvas);
const audio = new AudioDirector();
const storageKey = 'verso.stichos.v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let game = new Stichos(0x53544943);
const multiplayer = new MultiplayerConnection();
const peerEmotes = new Map<string, { text: string; until: number }>();
let sharedActionPending = false;
let multiplayerRoster = '';
let roomName = 'Traveler';
let roomServer = 'peer:';
try {
  roomName = localStorage.getItem('verso.room.name') || 'Traveler';
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
let disposeSpecial: (() => void) | null = null;
let pendingInvitation: RoomInvitation | null = readRoomLink(location.href);
let pendingRoomAfterArrival: RoomInvitation | null = null;
let currentPlanet = planetAt(STICHOS_SEED);
let chatChannel: 'say' | 'world' = 'say';
let phraseShortcuts: string[] = ['Hello!', 'Follow me.', 'Wait here.'];
try {
  const p = JSON.parse(localStorage.getItem('verso.chat.shortcuts') || 'null');
  if (Array.isArray(p))
    phraseShortcuts = [0, 1, 2].map((i) =>
      typeof p[i] === 'string' ? p[i].slice(0, 280) : phraseShortcuts[i],
    );
} catch {}
const atlasPainter = new AtlasPainter();
function trackedQuest() {
  if (trackedQuestId === 'map-waypoint' && mapWaypoint)
    return {
      id: 'map-waypoint',
      title: 'Your marked destination',
      description: 'A point marked in your atlas.',
      objective: `Travel toward ${Math.round(mapWaypoint.x)}, ${Math.round(mapWaypoint.y)}.`,
      target: mapWaypoint,
      complete: false,
      stage: 0,
    };
  const active = game.quests.filter((q) => !q.complete);
  return (
    active.find((q) => q.id === trackedQuestId) ??
    (game.universeLife ? active.find((q) => q.target) : active.filter((q) => q.target).at(-1)) ??
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
  transferKind: 'opening' | 'arrival' | 'return' | 'clinic' = 'opening',
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
    map.height = Math.max(170, Math.round(map.getBoundingClientRect().height));
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
let ownsLifeTab = false;
function save() {
  if (!started || !ownsLifeTab) return false;
  try {
    stored = JSON.stringify(game.save());
    localStorage.setItem(storageKey, stored);
    stashLife(game.world.seed, game.world.generation, stored);
    rememberWorld({
      seed: game.world.seed,
      generation: game.world.generation,
      visitedAt: Date.now(),
      name: game.player.name,
    });
    return true;
  } catch {
    toast(
      'This browser could not store your progress. Free some browser storage before leaving this life.',
    );
    return false;
  }
}
function activate(next: Stichos) {
  multiplayer.disconnect();
  peerEmotes.clear();
  el('v-chat-log').replaceChildren();
  setChatCollapsed(innerWidth < 900);
  game = next;
  roomName = next.player.name;
  currentPlanet = planetAt(next.world.seed, next.world.generation);
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
let modalInvoker: HTMLElement | null = null;
function openModal(kind: string, html: string) {
  if (!modal) modalInvoker = document.activeElement as HTMLElement;
  disposeSpecial?.();
  disposeSpecial = null;
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
  container.innerHTML = `<section class="s-window" role="dialog" aria-modal="true" data-screen="${kind}">${html}</section>`;
  if (!['title', 'journal', 'map'].includes(kind)) {
    const frame = container.querySelector<HTMLElement>('.s-window')!;
    frame.classList.add('s-bounded-window');
    const header = document.createElement('header');
    header.className = 's-dialog-heading';
    const existingHeading = frame.querySelector<HTMLElement>(':scope > .v-window-heading');
    if (existingHeading) header.append(existingHeading);
    else {
      const heading = frame.querySelector('h2');
      if (heading) header.append(heading);
    }
    if (!['lost', 'life-in-use'].includes(kind) && !header.querySelector('button')) {
      const close = document.createElement('button');
      close.className = 's-window-close';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close window');
      close.onclick = () => (started ? closeModal() : title());
      header.append(close);
    }
    const body = document.createElement('div');
    body.className = 's-window-content';
    const footer = document.createElement('footer');
    footer.className = 's-dialog-footer';
    for (const node of [...frame.children]) {
      if (node === existingHeading) continue;
      if (
        (node.tagName === 'BUTTON' && /return|close|resume/.test(node.id)) ||
        node.classList.contains('v-window-footer')
      )
        footer.append(node);
      else body.append(node);
    }
    frame.append(header, body);
    if (footer.childElementCount) frame.append(footer);
    if (kind === 'creation') {
      const tabs = document.createElement('nav');
      tabs.className = 'v-creation-tabs';
      tabs.setAttribute('aria-label', 'Character creation pages');
      tabs.innerHTML =
        '<button type="button" data-creation-page="life" aria-pressed="true">This life</button><button type="button" data-creation-page="look" aria-pressed="false">Appearance</button>';
      body.prepend(tabs);
      frame.dataset.creationPage = 'life';
      tabs.querySelectorAll<HTMLButtonElement>('button').forEach(
        (b) =>
          (b.onclick = () => {
            frame.dataset.creationPage = b.dataset.creationPage;
            tabs
              .querySelectorAll('button')
              .forEach((other) => other.setAttribute('aria-pressed', String(other === b)));
            body.scrollTop = 0;
          }),
      );
    }
  }
  const heading = container.querySelector('h2');
  if (heading) {
    heading.id = 's-modal-heading';
    container.querySelector('section')!.setAttribute('aria-labelledby', heading.id);
  }
  container.querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true });
  container.scrollTop = 0;
}
function closeModal() {
  disposeSpecial?.();
  disposeSpecial = null;
  modalRevision++;
  chartControl?.dispose();
  chartControl = null;
  modal = '';
  el('s-modal').hidden = true;
  el('s-modal').innerHTML = '';
  setInert(false);
  paused = false;
  audio.pause(false);
  if (modalInvoker?.isConnected && !modalInvoker.closest('#s-modal'))
    modalInvoker.focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
}
function title() {
  const invite = pendingInvitation;
  openModal(
    'title',
    `<div class="v-window-heading"><div class="s-title-mark">VERSO</div><button id="v-install-title">Install app</button></div><h2>One universe.<br>A life of your own.</h2><p>Work the land. Build a livelihood. Find other minds among the stars. Every world has an address; every life leaves something behind.</p>${invite ? `<div class="v-incoming"><b>Invitation to room ${esc(invite.room)}</b><span>${esc(planetAt(invite.seed).name)} · your friend’s planet is already selected</span><button id="v-join-invite" class="s-primary">Join this world</button></div>` : ''}${stored ? '<button id="s-continue" class="s-primary s-continue">Continue this life</button>' : ''}<div class="v-entry-columns"><form id="s-start"><label>Planet seed <span>Leave blank for a new signal</span><input id="s-seed-input" value="" maxlength="64" aria-label="World seed" placeholder="A name, number, or leave to chance"></label><button class="s-primary" type="submit">Choose a life</button><button id="v-theo-story" type="button">Theo Bishop’s story · Stíchos</button></form><form id="v-title-room"><label>Join friends<input id="v-title-code" maxlength="600" placeholder="Complete room code or invitation link" autocapitalize="characters" autocomplete="off"></label><button type="submit">Find room</button><p id="v-title-room-error" class="v-room-error" role="alert" hidden></p><button id="v-title-galaxy" type="button">Browse the galaxy</button></form></div><p class="s-title-foot">Your continuing life is kept in this browser. Share a room link to bring friends to the same world.</p>`,
  );
  el('v-install-title').onclick = () => void requestInstall().then(toast);
  el('v-title-galaxy').onclick = galaxyMenu;
  el<HTMLFormElement>('s-start').onsubmit = (e) => {
    e.preventDefault();
    const text = el<HTMLInputElement>('s-seed-input').value.trim();
    const seed = text ? parseSeed(text) : crypto.getRandomValues(new Uint32Array(1))[0];
    choosePlanet(seed, 4);
  };
  el('v-theo-story').onclick = () => {
    choosePlanet(STICHOS_SEED, 3, undefined, true);
  };
  el<HTMLFormElement>('v-title-room').onsubmit = (e) => {
    e.preventDefault();
    void findRoom(el<HTMLInputElement>('v-title-code').value);
  };
  if (invite)
    el('v-join-invite').onclick = () => choosePlanet(invite.seed, invite.generation, invite);
  if (stored)
    el('s-continue').onclick = () => {
      try {
        activate(Stichos.restore(JSON.parse(stored!)));
        void audio.start(game.world.seed);
        closeModal();
        if (game.phase === 'lost') lost();
        else if (
          invite &&
          invite.seed === game.world.seed &&
          invite.generation === game.world.generation
        )
          void joinInvitation(invite);
        else toast('Your life continues.');
      } catch {
        toast('This life could not be read. Its stored record has been preserved.');
      }
    };
}
function choosePlanet(
  seed: number,
  generation: Geography = 4,
  invite?: RoomInvitation,
  theo = false,
) {
  if (started && !save()) return;
  let prior = rememberedLife(seed, generation);
  if (!prior && stored)
    try {
      const legacy = JSON.parse(stored);
      if (legacy.seed === seed && (legacy.worldGeneration ?? legacy.generation ?? 1) === generation)
        prior = stored;
    } catch {}
  if (prior) {
    try {
      const next = Stichos.restore(JSON.parse(prior));
      activate(next);
      void audio.start(seed);
      closeModal();
      save();
      if (invite) void joinInvitation(invite);
      else transfer('return');
      return;
    } catch {
      toast('This planet’s stored life could not be read. It has been preserved.');
      return;
    }
  }
  if (theo) {
    activate(new Stichos(seed, generation));
    void audio.start(seed);
    closeModal();
    transfer('opening');
    return;
  }
  let candidateIndex = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  openModal('creation', creationHtml(seed, invite?.room));
  el('v-create-back').onclick = title;
  disposeSpecial = mountCreation(
    el('s-modal'),
    seed,
    generation,
    candidateIndex,
    (index, customization) => {
      const next = new Stichos(seed, generation);
      const result = next.acceptLife(index, customization);
      if (!result.ok) {
        toast(result.message);
        return;
      }
      activate(next);
      roomName = next.player.name;
      pendingRoomAfterArrival = invite ?? null;
      void audio.start(seed);
      closeModal();
      transfer('arrival');
    },
  );
}
let joiningPublic = false;
let roomError = '';
let roomDraft = '';
let findingRoom = false;
async function joinInvitation(invite: RoomInvitation) {
  if (joiningPublic) return;
  const source = game;
  roomError = '';
  roomDraft = invite.endpoint === 'peer:' ? roomAddress(invite) : roomLink(location.href, invite);
  roomServer = invite.endpoint;
  roomName = game.player.name;
  try {
    if (invite.public) {
      joiningPublic = true;
      toast('Listening for this planet’s public frequency…', 16000);
      const { discoverRoom } = await import('./multiplayer');
      let found = false;
      try {
        const info = await discoverRoom('peer:', invite.room);
        if (info.seed !== invite.seed || info.generation !== invite.generation)
          throw Error('This public frequency belongs to a different planet.');
        found = true;
      } catch (error) {
        if (error instanceof Error && error.message.includes('different planet')) throw error;
      }
      if (source !== game) return;
      if (found) await multiplayer.connect('peer:', roomIdentity(), invite.room);
      else
        try {
          await multiplayer.hostPublicWorld(invite.room, roomIdentity());
        } catch (error) {
          // Simultaneous first visitors may race for the same rendezvous address.
          if (error instanceof Error && /taken|unavailable|already.*use/i.test(error.message))
            await multiplayer.connect('peer:', roomIdentity(), invite.room);
          else throw error;
        }
    } else await multiplayer.connect(roomServer, roomIdentity(), invite.room);
    if (source !== game) return;
    pendingInvitation = null;
    history.replaceState(null, '', roomLink(location.href, invite));
    toast(
      `Room ${invite.room} joined. ${innerWidth < 900 ? 'Open chat below to talk.' : 'Press Enter to talk.'}`,
      3000,
    );
  } catch (error) {
    if (source !== game) return;
    roomError = error instanceof Error ? error.message : 'The room could not be reached.';
    togetherMenu();
  } finally {
    joiningPublic = false;
  }
}
async function findRoom(raw: string) {
  if (findingRoom) return;
  const invite = readRoomInput(raw);
  if (invite) {
    choosePlanet(invite.seed, invite.generation, invite);
    return;
  }
  const code = validRoomCode(raw);
  if (!code) {
    toast('Enter the room code your friend shared.');
    return;
  }
  const known = knownWorlds().find((w) => w.room === code);
  if (known) {
    choosePlanet(known.seed, known.generation, {
      seed: known.seed,
      generation: known.generation,
      room: code,
      endpoint: known.endpoint || 'peer:',
    });
    return;
  }
  findingRoom = true;
  toast('Contacting the host of this legacy room code…', 40000);
  const revision = modalRevision;
  try {
    const { discoverRoom } = await import('./multiplayer');
    const found = await discoverRoom('peer:', code);
    if (revision !== modalRevision) return;
    const invite = {
      room: code,
      endpoint: 'peer:',
      seed: found.seed,
      generation: found.generation,
    };
    choosePlanet(invite.seed, invite.generation, invite);
  } catch (error) {
    toast(
      error instanceof Error
        ? error.message
        : 'The room host could not be reached. Ask your friend for the new complete room code.',
    );
    const notice = document.getElementById('v-title-room-error');
    if (notice) {
      notice.hidden = false;
      notice.textContent =
        error instanceof Error ? error.message : 'Could not reach the room host.';
    }
  } finally {
    findingRoom = false;
  }
}
function galaxyMenu() {
  const known = knownWorlds();
  const seed = started ? game.world.seed : STICHOS_SEED;
  openModal(
    'galaxy',
    `<div class="v-window-heading"><div><small>Verso universe</small><h2>The signal atlas</h2></div><button id="v-galaxy-close" aria-label="Close galaxy">×</button></div><div class="v-galaxy-layout"><div class="v-galaxy-stage"><canvas id="v-galaxy-canvas" aria-label="Galaxy chart. Drag to pan. Select a planet." tabindex="0"></canvas><div class="v-galaxy-controls"><button id="v-sector-prev">Previous sector</button><button id="v-galaxy-out" aria-label="Zoom out">−</button><button id="v-galaxy-in" aria-label="Zoom in">+</button><button id="v-sector-next">Next sector</button></div></div><section class="v-planet-info" id="v-planet-info"></section></div><div class="v-world-list"><h3>Known worlds</h3><div id="v-known-worlds">${
      known.length
        ? known
            .slice(-8)
            .reverse()
            .map(
              (w, i) =>
                `<button data-known="${i}">${esc(planetAt(w.seed).name)}${w.room ? ` · ${esc(w.room)}` : ''}<small>Remembered here · connection unverified</small></button>`,
            )
            .join('')
        : 'No visited worlds yet. Choose a signal to explore.'
    }</div></div><p class="v-muted">The chart shares one seed address space. Live rooms require an online host or a world node; unknown signals are unexplored planets, not online player counts.</p>`,
  );
  let selected = planetAt(seed);
  const select = (p: Planet) => {
    selected = p;
    const visited = known.some((w) => w.seed === p.seed);
    el('v-planet-info').innerHTML =
      `<div class="v-planet-orb" style="--planet-color:${p.color}"></div><h3>${esc(p.name)}</h3><p>${esc(p.climate)}</p><dl><div><dt>Signal</dt><dd>${esc(p.signal)}</dd></div><div><dt>Address</dt><dd>${p.seed}</dd></div><div><dt>Chart</dt><dd>${visited ? 'Visited' : 'Unexplored'}</dd></div></dl><button id="v-planet-travel" class="s-primary">${p.seed === game.world.seed && started ? 'Return to this world' : visited ? 'Resume this planet’s life' : 'Find a life here'}</button><button id="v-planet-public">Open public frequency</button><p>Your possessions stay with their body on this planet.</p>`;
    el('v-planet-public').onclick = () => {
      const invite: RoomInvitation = {
        seed: p.seed,
        generation: p.generation,
        room: publicRoomCode(p.seed, p.generation),
        endpoint: 'peer:',
        public: true,
      };
      if (started && p.seed === game.world.seed) {
        closeModal();
        void joinInvitation(invite);
      } else choosePlanet(p.seed, p.generation, invite);
    };
    el('v-planet-travel').onclick = () => {
      if (started && p.seed === game.world.seed) closeModal();
      else choosePlanet(p.seed, p.generation);
    };
  };
  const chart = mountGalaxy(el<HTMLCanvasElement>('v-galaxy-canvas'), known, seed, select);
  disposeSpecial = () => chart.dispose();
  select(selected);
  el('v-galaxy-close').onclick = () => (started ? closeModal() : title());
  el('v-galaxy-in').onclick = () => chart.zoom(1.3);
  el('v-galaxy-out').onclick = () => chart.zoom(1 / 1.3);
  el('v-sector-prev').onclick = () => chart.sector(-1);
  el('v-sector-next').onclick = () => chart.sector(1);
  const display = known.slice(-8).reverse();
  document
    .querySelectorAll<HTMLElement>('[data-known]')
    .forEach((n) => (n.onclick = () => chart.focus(display[Number(n.dataset.known)].seed)));
  el<HTMLCanvasElement>('v-galaxy-canvas').onkeydown = (e) => {
    if (e.key === '+' || e.key === '=') chart.zoom(1.3);
    else if (e.key === '-') chart.zoom(1 / 1.3);
    else if (e.key === 'ArrowRight') chart.sector(1);
    else if (e.key === 'ArrowLeft') chart.sector(-1);
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
const arriving = [
  [
    'Carrier lock',
    'A thought crosses the distance.',
    'Nothing physical travels. A mind finds an existing nervous system.',
  ],
  [
    'Memory mismatch',
    'Someone else was here a moment ago.',
    'A profession. A key to a house. A day already in progress.',
  ],
  [
    'Transfer complete',
    'Your first breath in this life.',
    'Their hands are yours now. What you do with them is your choice.',
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
function transfer(kind: 'opening' | 'arrival' | 'return' | 'clinic', after?: () => void) {
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
  if (pendingRoomAfterArrival) {
    const invite = pendingRoomAfterArrival;
    pendingRoomAfterArrival = null;
    void joinInvitation(invite);
  }
  if (game.phase === 'lost') {
    lost();
    return;
  }
  toast(
    transferKind === 'opening'
      ? 'Cequin helps this body breathe. Speak to the botanist beside the garden.'
      : transferKind === 'arrival'
        ? `${game.player.name}: a new day begins. Find work, build a home, or share a room with friends.`
        : 'Your mind settles. This life continues.',
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
      transferKind === 'opening'
        ? opening
        : transferKind === 'arrival'
          ? arriving
          : transferKind === 'clinic'
            ? recovering
            : returning,
    seconds = Math.max(0, (now - transferStarted) / 1000);
  const duration = reducedMotion.matches ? 2.5 : 3.1;
  const step =
    transferKind === 'opening'
      ? introPage
      : Math.max(0, Math.min(lines.length - 1, Math.floor(seconds / duration)));
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
    `<div class="v-window-heading"><h2>A continuing life</h2><button id="s-resume" aria-label="Resume">×</button></div><p>${esc(game.player.name)} · ${esc(currentPlanet.name)}<br>${Math.floor(game.distanceTraveled)} paces traveled · kept in this browser</p><div class="s-menu-buttons"><button id="v-pause-resume" class="s-primary">Return to the world</button><button id="s-new">Galaxy & other worlds</button><button id="s-pause-life">Home, profession & clothing</button><button id="s-pause-together">Room & friends</button><button id="v-install">Install Verso</button><button id="v-ai">AI companion</button><button id="v-retire">Leave this body</button><button id="s-pause-help">Controls & shortcuts</button></div><p class="v-muted">Leaving a body keeps its belongings and work on this planet. Clearing this browser’s storage loses its local identity and private progress.</p>`,
  );
  el('s-resume').onclick = closeModal;
  el('v-pause-resume').onclick = closeModal;
  el('s-new').onclick = galaxyMenu;
  el('s-pause-help').onclick = controls;
  el('s-pause-life').onclick = () => lifeMenu();
  el('s-pause-together').onclick = togetherMenu;
  el('v-install').onclick = () => void requestInstall().then(toast);
  el('v-ai').onclick = aiMenu;
  el('v-retire').onclick = () => {
    openModal(
      'retire',
      `<h2>Leave ${esc(game.player.bodyName)} behind?</h2><p>Their home, coins, tools and work stay here. Your mind can enter another resident, with that person’s own position and belongings.</p><div class="s-menu-buttons"><button id="v-retire-cancel" class="s-primary">Stay in this life</button><button id="v-retire-confirm">Choose the next body</button></div>`,
    );
    el('v-retire-cancel').onclick = closeModal;
    el('v-retire-confirm').onclick = () => {
      openModal('creation', creationHtml(game.world.seed));
      el('v-create-back').onclick = pauseMenu;
      disposeSpecial = mountCreation(
        el('s-modal'),
        game.world.seed,
        game.world.generation,
        crypto.getRandomValues(new Uint32Array(1))[0] % 1000000,
        (index, customization) => {
          const result = game.retireLife(index, customization);
          if (!result.ok) {
            toast(result.message);
            return;
          }
          roomName = game.player.name;
          updateUI();
          closeModal();
          transfer('arrival');
        },
        (index, customization) => game.lifeCandidate(index, customization),
      );
    };
  };
}
async function aiMenu() {
  openModal(
    'ai',
    `<div class="v-window-heading"><h2>AI companion</h2><button id="v-ai-close" aria-label="Close">×</button></div><p>Player chat works directly in your room. Optional AI conversations require a trusted companion outside the browser.</p><p>AI conversations are not available in this release. You can still talk to real players through Local and Room chat.</p><details><summary>Advanced companion setup</summary><p>The optional local companion can check a native Codex login. It does not enable AI dialogue in this build.</p><form id="v-ai-pair"><label>Local companion pairing code<input id="v-ai-code" autocomplete="off" maxlength="100"></label><button>Check companion</button></form><p id="v-ai-status" role="status">Start the optional companion with <code>node server/ai-companion.mjs</code>, then enter its pairing code. No AI requests run automatically.</p><a href="${esc(aiCompanionGuide)}" target="_blank" rel="noopener">Read companion setup notes</a></details>`,
  );
  el('v-ai-close').onclick = closeModal;
  el<HTMLFormElement>('v-ai-pair').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { AICompanion } = await import('./ai-companion');
      const companion = new AICompanion();
      const state = await companion.pair(el<HTMLInputElement>('v-ai-code').value);
      el('v-ai-status').textContent =
        `Codex ${state.version ?? ''} · ${state.auth}. ${state.reason}`;
      el<HTMLInputElement>('v-ai-code').value = '';
    } catch (error) {
      el('v-ai-status').textContent =
        error instanceof Error ? error.message : 'Could not reach the companion.';
    }
  };
}
function equipmentMenu() {
  openModal(
    'gear',
    `<span class="s-chapter">Belongings of ${esc(game.player.bodyName)}</span><h2>Your equipment</h2><p>Every weapon has its own materials, proportions and handling. These objects stay with this body when your mind travels.</p><div class="s-gear-cards">${game.weaponInventory.map((w) => `<article>${weaponIcon(w.seed, w.kind, 112)}<small>${w.equipped ? 'Equipped' : esc(w.profile.construction)}</small><h3>${esc(w.profile.name)}</h3><dl><div><dt>Strength</dt><dd>${w.profile.damage}</dd></div><div><dt>Reach</dt><dd>${w.profile.range.toFixed(2)}</dd></div><div><dt>Recovery</dt><dd>${w.profile.cooldown.toFixed(2)}s</dd></div></dl><p>${esc(w.profile.effectDescription)}</p><button data-equip-record="${esc(w.id)}" ${w.equipped ? 'disabled' : ''}>${w.equipped ? 'Equipped' : 'Equip this weapon'}</button></article>`).join('') || '<p>Your hands are empty. Visit a merchant to examine their stock, or build a weapon at a workbench.</p>'}</div>${game.activeArtifact ? `<article class="s-active-invention"><img src="${artifactIcon(game.activeArtifact.design, 112)}" alt="${esc(game.activeArtifact.name)}"><h3>${esc(game.activeArtifact.name)}</h3><p>Equipped invention · ${game.activeArtifact.properties.damage} strength · ${game.activeArtifact.properties.range.toFixed(2)} reach</p></article>` : ''}<div class="s-menu-buttons"><button id="s-open-estate">Working tools and household</button><button id="s-open-invent">Invent a construction</button><button id="s-open-forge">Build a weapon from parts</button></div><button id="s-gear-return" class="s-primary">Return to this life</button>`,
  );
  el('s-gear-return').onclick = closeModal;
  el('s-open-forge').onclick = () => lifeMenu('forge');
  el('s-open-estate').onclick = () => lifeMenu('estate');
  el('s-open-invent').onclick = () => lifeMenu('discover', game.activeArtifact?.design);
  document.querySelectorAll<HTMLButtonElement>('[data-equip-record]').forEach(
    (b) =>
      (b.onclick = () => {
        const result = game.equipWeapon(b.dataset.equipRecord!);
        save();
        updateUI();
        equipmentMenu();
        toast(result.message);
      }),
  );
}
function controls() {
  const touch = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
  openModal(
    'help',
    `<span class="s-chapter">Living on ${esc(currentPlanet.name)}</span><h2>Explore at your own pace.</h2>${touch ? '<article><h3>Touch controls</h3><p>Tap the ground to walk. Hold an arrow to move. Tap a person, plant or object to approach, then tap the action shown above the hotbar.</p><p>Satchel opens your belongings and preparation recipes. More opens equipment, supplies, journal and saved phrases. Pinch is not required: use the chart buttons to zoom.</p></article>' : ''}<details ${touch ? '' : 'open'}><summary>Keyboard and mouse</summary><div class="s-control-list"><p><b>WASD / arrows</b><span>Walk · Shift runs</span></p><p><b>Click ground / person</b><span>Approach the selected place or person</span></p><p><b>E</b><span>Talk, work with a tool, gather, read or open</span></p><p><b>F / 1 / right mouse</b><span>Attack toward the cursor with held equipment</span></p><p><b>Q / 2</b><span>Release a ward</span></p><p><b>3 / 4 / 5 / 6</b><span>Breath supply · salve · tonic · food</span></p><p><b>I / B / K</b><span>Satchel / prepare / equipment</span></p><p><b>J / M / L / G</b><span>Notebook / world atlas / Life / galaxy</span></p><p><b>Enter / F7–F9</b><span>Chat / send saved phrases</span></p><p><b>Escape</b><span>Close a window, cancel construction or pause</span></p><p><b>Mouse wheel</b><span>Zoom the world or chart under the cursor</span></p></div></details><p>Use actual tools to harvest resources. Learn local needs, earn wages, hire people you trust and build a home. Roads connect settlements; wilderness contains supplies and danger.</p><button id="s-help-return" class="s-primary">Return to this life</button>`,
  );
  el('s-help-return').onclick = closeModal;
}
function moreActions() {
  openModal(
    'actions',
    `<h2>Actions</h2><div class="s-menu-buttons"><button id="v-more-gear">Equipment</button><button id="v-more-journal">Notebook</button><button id="v-more-life">Life, home and work</button><button id="v-more-warm">Use warming tonic · ${game.inventory.tonic ?? 0}</button><button id="v-more-eat">Eat food · ${game.inventory.rations ?? 0}</button><button id="v-more-phrases">Words and shortcuts</button><button id="v-more-atlas">World atlas</button></div>`,
  );
  el('v-more-gear').onclick = equipmentMenu;
  el('v-more-journal').onclick = () => journal();
  el('v-more-life').onclick = () => lifeMenu();
  el('v-more-phrases').onclick = shortcutsMenu;
  el('v-more-atlas').onclick = mapModal;
  el('v-more-warm').onclick = () => {
    closeModal();
    game.use('tonic');
    updateUI();
    save();
  };
  el('v-more-eat').onclick = () => {
    closeModal();
    game.use('rations');
    updateUI();
    save();
  };
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
    if ((game.hasNotebook || game.universeLife) && notebookView.open) foldNotebook(false);
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
      notebookView.entry = Math.max(0, Math.min(notebookLeafCount(game, 'years') - 1, n));
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
  const introButton = el('s-notebook-intro');
  if (introButton)
    introButton.onclick = () => {
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
  if ((!game.hasNotebook && !game.universeLife) || !notebookView.open) {
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
    `<span class="s-chapter">${esc(game.player.bodyName)}’s atlas · ${esc(currentPlanet.name)}</span><div class="s-atlas-heading"><h2>The country you remember.</h2><button id="s-map-return" class="s-primary">Keep walking</button></div><div class="s-atlas-toolbar"><div class="s-atlas-zoom"><button id="s-atlas-minus" aria-label="Zoom atlas out">−</button><button id="s-atlas-plus" aria-label="Zoom atlas in">+</button></div><button id="s-atlas-body">My body</button><button id="s-atlas-fit">All explored</button><button id="v-atlas-places" aria-expanded="false">Places & mark</button>${trackedQuest()?.target ? '<button id="s-atlas-task">Current thread</button>' : ''}<span id="s-atlas-scale"></span></div><div class="s-atlas-layout"><div class="s-atlas-chart"><canvas id="s-large-map" tabindex="0" width="800" height="500" aria-label="Explored world atlas. Drag or use arrow keys to pan. Scroll or use plus and minus to zoom. Click to mark a destination."></canvas><div class="s-atlas-coordinate-line"><span id="s-atlas-coordinate"></span><span>Dark country is uncharted</span></div></div><aside class="s-atlas-places"><h3>Known places</h3>${places.length ? places.map((site) => `<button data-atlas-site="${esc(site.id)}"><strong>${esc(site.name)}</strong><small>${esc(site.detail)} · ${Math.round(site.x)}, ${Math.round(site.y)}</small></button>`).join('') : '<p>Walk the roads to learn the names of distant places.</p>'}<div class="s-atlas-mark"><h3>Chart mark</h3><p id="s-atlas-mark-label">Click the chart to mark a destination.</p><button id="s-atlas-follow" disabled>Follow this mark</button><button id="s-atlas-clear" ${mapWaypoint ? '' : 'disabled'}>Clear mark</button></div></aside></div><form id="s-atlas-find" class="s-atlas-find"><span>Find coordinates</span><label>East / west <input id="s-atlas-x" type="number" step="1" min="-1000000000" max="1000000000" value="${Math.round(game.player.x)}" required></label><label>North / south <input id="s-atlas-y" type="number" step="1" min="-1000000000" max="1000000000" value="${Math.round(game.player.y)}" required></label><button type="submit">Locate</button></form><p class="s-atlas-hint">Drag to move the chart. Scroll to change scale. Your gold arrow marks the current body; diamonds mark destinations. Only explored terrain is drawn. Looking at the atlas does not move your body or reveal distant country.</p>`,
  );
  el('v-atlas-places').onclick = () => {
    const pane = document.querySelector('.s-atlas-places')!;
    const open = pane.classList.toggle('is-open');
    el('v-atlas-places').setAttribute('aria-expanded', String(open));
  };
  const map = el<HTMLCanvasElement>('s-large-map');
  map.width = Math.max(260, Math.round(map.getBoundingClientRect().width));
  map.height = Math.max(170, Math.round(map.getBoundingClientRect().height));
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
    `<span class="s-chapter">The breath stops</span><h2>${anotherMind ? 'Your mind is still here.' : 'A voice pulls you back.'}</h2><p>${anotherMind ? 'The restored signal can hold your consciousness while another body wakes. Your choices remain in this world.' : 'The clinic knows this face. Somewhere beyond the cold, someone is still trying to reach you.'}</p><button id="s-return-life" class="s-primary">${anotherMind ? 'Follow the other heartbeat' : 'Wake at the clinic'}</button>`,
  );
  el('s-return-life').onclick = () =>
    transfer(anotherMind ? 'return' : 'clinic', () => {
      game.reincarnate();
      lastPhase = game.phase;
    });
}
el('v-pack-close').onclick = () => root.classList.remove('satchel-open');
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
    game.artifacts.map((a) => [a.design, a.equipped]),
    game.tools.map((t) => [t.kind, t.durability, t.equipped]),
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
      `<div class="s-item-grid">${entries.map((id) => `<button class="s-item ${selectedItem === id ? 'selected' : ''}" data-item="${id}" aria-label="${esc(game.itemName(id))}, ${game.inventory[id]}, inspect" aria-pressed="${selectedItem === id}" title="${esc(game.itemName(id))}">${itemIcon(id, 34)}<b>${game.inventory[id]}</b></button>`).join('')}${Array.from({ length: Math.max(0, Math.ceil(Math.max(10, entries.length) / 5) * 5 - entries.length) }, () => '<span class="s-empty-slot"></span>').join('')}</div>` +
      `<div class="s-pack-tools">${game.tools.map((t) => `<button data-pack-tool="${t.kind}" title="${esc(t.profile.name)} · ${t.durability}/${t.profile.maxDurability} condition" aria-pressed="${t.equipped && !game.activeArtifact}"><img src="${toolIcon(t.seed, t.kind, 36)}" alt=""><span>${t.kind}<small>${t.durability}/${t.profile.maxDurability}</small></span></button>`).join('')}</div><div class="s-pack-inventions">${game.artifacts.map((a) => `<button data-pack-invention="${esc(a.design)}" title="${esc(a.genome.name)}"><img src="${artifactIcon(a.design, 52)}" alt=""><span>${esc(a.genome.name)}<small>${a.equipped ? 'Equipped' : esc(a.genome.delivery)}</small></span></button>`).join('')}<div class="v-pack-management"><button id="s-pack-tools">Tools & household</button><button id="s-pack-invent">Invent</button></div></div>`;
    el('s-pack-content')
      .querySelectorAll<HTMLButtonElement>('[data-pack-tool]')
      .forEach(
        (b) =>
          (b.onclick = () => {
            toast(game.equipTool(b.dataset.packTool as ToolKind).message);
            updateUI();
            save();
          }),
      );
    el('s-pack-tools').onclick = () => lifeMenu('estate');
    el('s-pack-invent').onclick = () => lifeMenu('discover');
    el('s-pack-content')
      .querySelectorAll<HTMLButtonElement>('[data-pack-invention]')
      .forEach(
        (button) => (button.onclick = () => lifeMenu('discover', button.dataset.packInvention)),
      );
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
      `<strong>${esc(game.itemName(selectedItem))}</strong><p>${esc(item.description)}</p>${['cequin', 'salve', 'tonic', 'rations', 'bandage'].includes(selectedItem) ? `<button data-use="${selectedItem}">Use ${esc(game.itemName(selectedItem).toLowerCase())}</button>` : ''}`;
  }
}
let tradeTab: 'buy' | 'sell' = 'buy';
let tradeSelection = '';
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
  if (d.role === 'merchant' && d.npcId) {
    const choices = d.choices
      .filter((c) =>
        tradeTab === 'sell'
          ? c.id.startsWith('sell:')
          : c.id.startsWith('buy:') || c.id.startsWith('weapon:'),
      )
      .sort((a, b) => Number(b.id.startsWith('weapon:')) - Number(a.id.startsWith('weapon:')));
    let selected =
      choices.find((c) => c.id === tradeSelection) ??
      choices.find((c) => c.id === 'weapon:sword') ??
      choices.find((c) => c.id.startsWith('weapon:')) ??
      choices[0];
    tradeSelection = selected?.id ?? '';
    const stock = selected?.id.startsWith('weapon:')
      ? game.merchantWeaponStock(d.npcId).find((w) => w.kind === selected.id.slice(7))
      : undefined;
    const item = selected && !stock ? (selected.id.split(':')[1] as ItemId) : null;
    el('s-dialogue').innerHTML =
      `<section role="dialog" aria-label="Trade with ${esc(d.speaker)}"><div class="s-dialogue-heading"><div><small>Merchant · ${game.player.coins} coins</small><h2>${esc(d.speaker)}</h2></div><button id="s-dialogue-close" aria-label="Finish trading">×</button></div><div class="s-trade-tabs"><button data-trade-tab="buy" aria-pressed="${tradeTab === 'buy'}">Buy</button><button data-trade-tab="sell" aria-pressed="${tradeTab === 'sell'}">Sell</button></div><div class="s-trade-workspace"><div class="s-trade-list">${choices.map((c) => `<button data-trade-select="${esc(c.id)}" aria-pressed="${c.id === selected?.id}">${esc(c.label)}</button>`).join('') || '<p>No items to sell.</p>'}</div><article class="s-trade-detail">${selected ? `${stock ? weaponIcon(stock.seed, stock.kind, 112) : item && ITEMS[item] ? itemIcon(item, 112) : ''}<h3>${esc(stock?.profile.name ?? (item ? game.itemName(item) : selected.label))}</h3><p>${stock ? `${stock.profile.damage} strength · ${stock.profile.range.toFixed(2)} reach · ${stock.profile.cooldown.toFixed(2)}s recovery` : item ? esc(ITEMS[item].description) : ''}</p>${stock ? `<p>${esc(stock.profile.construction)}</p><p>${esc(stock.profile.effectDescription)}</p>` : `<label>Quantity<select id="v-trade-quantity"><option value="1">1</option><option value="5">5</option><option value="10">10</option></select></label>`}<button id="v-trade-confirm" ${selected.disabled ? 'disabled' : ''}>${esc(selected.label)}</button>${selected.disabled ? '<small>More coins or space are needed.</small>' : ''}` : '<p>Choose something to inspect.</p>'}</article></div></section>`;
    const refresh = () => {
      dialogueSignature = '';
      updateDialogue();
    };
    document.querySelectorAll<HTMLButtonElement>('[data-trade-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          tradeTab = b.dataset.tradeTab as 'buy' | 'sell';
          tradeSelection = '';
          refresh();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-trade-select]').forEach(
      (b) =>
        (b.onclick = () => {
          tradeSelection = b.dataset.tradeSelect!;
          refresh();
        }),
    );
    const quantitySelect = el<HTMLSelectElement>('v-trade-quantity');
    if (quantitySelect && selected && item) {
      const unitPrice = Number(selected.label.match(/(\d+) coins/)?.[1] ?? 0);
      const max =
        tradeTab === 'sell'
          ? (game.inventory[item] ?? 0)
          : Math.min(
              game.capacity - game.carried,
              unitPrice ? Math.floor(game.player.coins / unitPrice) : 0,
            );
      for (const option of [...quantitySelect.options])
        option.disabled = Number(option.value) > max;
      quantitySelect.onchange = () => {
        const count = Number(quantitySelect.value);
        el('v-trade-confirm').textContent =
          `${tradeTab === 'sell' ? 'Sell' : 'Buy'} ${count} · ${unitPrice * count} coins`;
      };
      quantitySelect.onchange(new Event('change'));
    }
    const confirm = el('v-trade-confirm');
    if (confirm && selected)
      confirm.onclick = (event) => {
        event.stopPropagation();
        const quantity = stock ? 1 : Number(el<HTMLSelectElement>('v-trade-quantity').value);
        for (let i = 0; i < quantity; i++) {
          const option = game.dialogue?.choices.find((c) => c.id === selected!.id);
          if (!option || option.disabled) break;
          game.choose(selected!.id);
        }
        save();
        updateUI();
      };
  }
  el('s-dialogue-close').onclick = () => {
    game.dialogue = null;
    updateDialogue();
    canvas.focus();
  };
}
function updateUI() {
  el('s-pocketbook-label').textContent = game.universeLife
    ? 'My field notebook'
    : game.hasNotebook
      ? 'The priest’s notebook'
      : 'Remembered pages';
  el('s-pocketbook-note').textContent = game.universeLife
    ? 'In this body’s keeping'
    : game.hasNotebook
      ? 'In this body’s keeping'
      : 'The book remains with the priest';
  const p = game.player,
    tile = game.world.tile(p.x, p.y);
  document.querySelector('.s-brand span')!.textContent = game.universeLife
    ? 'One universe, many lives'
    : 'Destino: Stíchos';
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
  el('s-stamina').textContent = `Level ${p.level}`;
  el('v-energy-label').textContent = `${Math.round(p.stamina)}%`;
  el('v-energy-bar').style.width = `${p.stamina}%`;
  el('s-xp').style.width = `${Math.min(100, (p.xp / (p.level * 40)) * 100)}%`;
  el('s-coins').textContent = `◈ ${p.coins}`;
  const closest = game.world
    .settlementsAround(p.x, p.y, 28)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  el('s-place').textContent =
    (tile.site ? 'Botanical seed vault' : closest?.name) ??
    {
      woodland: 'The woodland',
      meadow: 'The meadow',
      wetland: 'The wetland',
      dunes: 'The dunes',
      badlands: 'The badlands',
      volcanic: 'The volcanic ridge',
      alpine: 'The alpine heights',
      frostwood: 'The frostwood',
      tundra: 'Open tundra',
      marsh: 'The blue marshes',
      highlands: 'The highlands',
      settlement: 'An inhabited quarter',
    }[tile.biome];
  el('s-map-label').textContent = closest
    ? `${game.world.clans[closest.clan].name} territory`
    : 'Unclaimed wilderness';
  el('s-coordinates').textContent =
    `${Math.round(p.x)}, ${Math.round(p.y)} · ${currentPlanet.name}${game.universeLife ? '' : ', 3886'}`;
  const romer = (tile.temperature * 21) / 40 + 7.5;
  el('s-weather').textContent =
    `${game.universeLife ? '' : romer.toFixed(1) + '° Rø · '}${tile.temperature.toFixed(0)}° C · ${game.universeLife ? game.exposure.label : p.cequinTime > 0 ? 'Breath sustained' : 'Freezing air'}`;
  el('s-weather').title = game.universeLife
    ? game.exposure.detail
    : 'Cequin protects breathing in the cold.';
  const q = trackedQuest();
  el('s-quest-title').textContent = q?.title ?? 'An unfinished life';
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
  const equipmentKey = `${p.appearance.seed}:${p.appearance.weapon}:${(['staff', 'sword', 'bow'] as const).map((kind) => game.weaponSeed(kind)).join(':')}:${game.activeArtifact?.design ?? ''}`;
  const equipmentChanged = equipmentSignature !== equipmentKey;
  equipmentSignature = equipmentKey;
  if (equipmentChanged) {
    const kind = p.appearance.weapon;
    const artifact = game.activeArtifact;
    const attackButton = document.querySelector<HTMLButtonElement>('[data-action="attack"]');
    attackButton
      ?.querySelector('svg, img')
      ?.replaceWith(
        document
          .createRange()
          .createContextualFragment(
            artifact
              ? `<img src="${artifactIcon(artifact.design, 30)}" width="30" height="30" alt="">`
              : kind === 'none'
                ? itemIcon('hand')
                : weaponIcon(game.weaponSeed(kind), kind, 30),
          ),
      );
    if (attackButton)
      attackButton.title = artifact
        ? `${artifact.name} · ${artifact.properties.damage} strength · ${artifact.delivery}`
        : kind === 'none'
          ? 'Empty hands · equip a weapon to attack'
          : game.weaponProfile(kind).name;
    if (attackButton) {
      attackButton.disabled = !artifact && kind === 'none';
      attackButton.setAttribute('aria-label', attackButton.title);
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((n) => {
    if (equipmentChanged)
      n.innerHTML = weaponIcon(
        game.weaponSeed(n.dataset.equip as WeaponKind),
        n.dataset.equip as WeaponKind,
        38,
      );
    n.classList.toggle('equipped', !game.activeArtifact && n.dataset.equip === p.appearance.weapon);
    n.disabled = !game.weapons.has(n.dataset.equip as 'staff' | 'sword' | 'bow');
    n.title = n.disabled
      ? `Find ${n.dataset.equip} equipment at a merchant`
      : `Equip ${game.weaponProfile(n.dataset.equip as WeaponKind).name}`;
    n.setAttribute('aria-label', n.title);
    n.setAttribute(
      'aria-pressed',
      String(!game.activeArtifact && n.dataset.equip === p.appearance.weapon),
    );
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
  if (
    near &&
    !('role' in near) &&
    ['pine', 'rock', 'cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(near.kind)
  ) {
    const work = game.workProgress;
    const required = near.kind === 'pine' ? 'axe' : near.kind === 'rock' ? 'pickaxe' : 'sickle';
    context.textContent = `E · ${near.kind === 'pine' ? 'Chop' : near.kind === 'rock' ? 'Mine' : 'Gather'} ${near.name}${work?.propId === near.id ? ` · ${work.strokes}/${work.requiredStrokes} strokes` : ` · ${required}`}`;
  }
  updatePack();
  updateDialogue();
}
function drawMap(target = el<HTMLCanvasElement>('s-map'), scale = 5) {
  atlasPainter.draw(target, atlasSource(), { x: game.player.x, y: game.player.y, scale }, false);
}

function lifeMenu(
  initialTab: 'purpose' | 'forge' | 'discover' | 'estate' = 'purpose',
  initialDesign?: string,
) {
  if (sharedActionPending) return;
  openModal(
    'life',
    '<span class="s-chapter">A life of your choosing</span><h2>What will you make of it?</h2><div id="s-life-content"></div><button id="s-life-return" class="s-primary">Return to the world</button>',
  );
  mountLife(
    el('s-life-content'),
    game,
    () => {
      updateUI();
      save();
    },
    initialTab,
    initialDesign,
    multiplayer.status !== 'offline',
    (id) => {
      const target = game.compactTarget(id);
      if (!target) return;
      mapWaypoint = { x: target.x, y: target.y };
      trackedQuestId = 'map-waypoint';
      closeModal();
      updateUI();
      drawMap();
      toast(`Follow the atlas bearing to ${target.name}.`);
    },
  );
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
  el('s-ending-life').onclick = () => lifeMenu();
  el('s-ending-journal').onclick = () => journal('threads');
}
function roomIdentity() {
  return {
    clientId: getBrowserPlayerId(),
    seed: game.world.seed,
    generation: game.world.generation,
    name: roomName,
    appearance: game.displayAppearance,
    position: { x: game.player.x, y: game.player.y },
    bodyId: game.bodyId,
    combatActive: false,
    progression: game.sharedCombatProgression,
  };
}
function togetherMenu() {
  if (sharedActionPending) return;
  const active = multiplayer.status === 'online',
    browserRoom = roomServer === 'peer:';
  const invite: RoomInvitation = {
    seed: game.world.seed,
    generation: game.world.generation,
    room: multiplayer.room,
    endpoint: roomServer,
  };
  const link = active ? roomLink(location.href, invite) : '';
  const codeToShare = active ? (browserRoom ? roomAddress(invite) : link) : '';
  const failure = roomError || multiplayer.lastError;
  const owned = savedWorlds().filter(
    (w) => w.owned && w.seed === game.world.seed && w.generation === game.world.generation,
  );
  openModal(
    'together',
    `<div class="v-window-heading"><div><small>${esc(currentPlanet.name)} · ${active ? 'Connected' : 'Find your people'}</small><h2>${active ? esc(roomTitle(multiplayer.room)) : 'Play together'}</h2></div><button id="s-room-return" aria-label="Return to the world">×</button></div><p id="v-room-failure" class="v-room-error" role="alert" ${failure ? '' : 'hidden'}>${esc(failure)}</p>${
      active
        ? `<div class="v-room-layout"><div><small>${browserRoom ? 'Room + planet code' : 'Node room ID · share the full invitation'}</small><div class="v-room-code" id="v-room-code" data-room="${esc(multiplayer.room)}">${esc(browserRoom ? roomAddress(invite) : multiplayer.room)}</div><p>${multiplayer.peers.length + 1} of 8 travelers<br>Share the code, link, or QR.</p><div class="s-menu-buttons"><button id="v-copy-code">${browserRoom ? 'Copy code' : 'Copy invitation'}</button><button id="v-share-room">Share link</button></div></div><div id="v-room-qr" class="v-room-qr" aria-label="QR code to join this room"></div></div><details class="v-room-link"><summary>Full invitation link</summary><input id="s-room-invitation" readonly aria-label="Room join URL" value="${esc(link)}"><button id="s-room-copy">Copy link</button></details><div class="s-room-people">${[{ id: multiplayer.peerId, name: roomName, x: game.player.x, y: game.player.y }, ...multiplayer.peers].map((p) => `<p><b>${esc(p.name)}${p.id === multiplayer.peerId ? ' · you' : ''}</b><span>${Math.round(p.x)}, ${Math.round(p.y)}</span>${p.id !== multiplayer.peerId ? `<button data-meet-peer="${esc(p.id)}">Track</button>` : ''}</p>`).join('')}</div><p class="v-muted">${browserRoom ? 'The host keeps this room open. Signed checkpoints preserve shared changes for the same host to resume later.' : 'This world runs on a dedicated node; its operator controls availability.'} Press Enter to talk; Local reaches nearby people, Room reaches this whole room.</p><div class="v-room-emotes"><button data-room-emote="wave">Wave</button><button data-room-emote="thanks">Thanks</button><button data-room-emote="help">Over here</button><button id="s-room-leave">Leave room</button></div>`
        : `<form id="s-room-form"><label>Your traveler name<input id="s-room-name" value="${esc(roomName)}" maxlength="32" required></label><label>Room code or invitation link<input id="s-room-code" value="${esc(roomDraft || multiplayer.room)}" placeholder="Leave empty to host a new room" maxlength="600" autocapitalize="characters"></label><div class="s-menu-buttons"><button class="s-primary" type="submit">${multiplayer.status === 'connecting' ? 'Connecting…' : 'Join or host'}</button>${multiplayer.reconnectable ? '<button id="s-room-reconnect" type="button">Reconnect</button>' : ''}</div><details class="v-room-mode"><summary>Connection options</summary><label>Connection<select id="s-room-mode"><option value="peer" ${browserRoom ? 'selected' : ''}>Browser room</option><option value="server" ${!browserRoom ? 'selected' : ''}>Dedicated world node</option></select></label><label id="s-room-server-label" ${browserRoom ? 'hidden' : ''}>World node<input id="s-room-server" value="${esc(browserRoom ? '' : roomServer)}" placeholder="wss://your-world-node.example/ws" maxlength="240"></label></details></form>${
            owned.length
              ? `<h3>Resume a world you host</h3><div class="s-menu-buttons">${owned
                  .slice(0, 4)
                  .map(
                    (w) =>
                      `<button data-resume-world="${esc(w.room)}">${esc(w.room)} · revision ${w.revision}</button>`,
                  )
                  .join('')}</div>`
              : ''
          }<button id="v-room-public">Meet people on this planet</button><p class="v-muted">A public frequency lets travelers find the same planet without an invitation. A complete room code includes the planet; older codes need an online host to look it up. Browser rooms use direct connections and require their host online. Pear-based world nodes can keep replicated history; no public storage node is connected by default.</p>`
    }<p id="v-network-status" class="v-muted" role="status"></p>`,
  );
  renderNetworkStatus();
  el('s-room-return').onclick = closeModal;
  const publicButton = document.getElementById('v-room-public');
  if (publicButton)
    publicButton.onclick = () => {
      closeModal();
      void joinInvitation({
        seed: game.world.seed,
        generation: game.world.generation,
        room: publicRoomCode(game.world.seed, game.world.generation),
        endpoint: 'peer:',
        public: true,
      });
    };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied.');
    } catch {
      const input = el<HTMLInputElement>('s-room-invitation');
      input?.select();
      toast('Select and copy the room link.');
    }
  };
  if (active) {
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    el('v-room-qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 12, scalable: true });
    el('v-copy-code').onclick = () => void copy(codeToShare);
    el('s-room-copy').onclick = () => void copy(link);
    el('v-share-room').onclick = async () => {
      if (navigator.share)
        try {
          await navigator.share({ title: `Verso · room ${multiplayer.room}`, url: link });
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) void copy(link);
        }
      else void copy(link);
    };
    el('s-room-leave').onclick = () => {
      multiplayer.disconnect();
      roomDraft = '';
      roomError = '';
      multiplayer.lastError = '';
      history.replaceState(null, '', location.pathname);
      togetherMenu();
    };
    document.querySelectorAll<HTMLButtonElement>('[data-room-emote]').forEach(
      (n) =>
        (n.onclick = () => {
          multiplayer.emote(n.dataset.roomEmote as 'wave' | 'thanks' | 'help');
          closeModal();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-meet-peer]').forEach(
      (n) =>
        (n.onclick = () => {
          const p = multiplayer.peers.find((p) => p.id === n.dataset.meetPeer);
          if (p) {
            mapWaypoint = { x: p.x, y: p.y };
            trackedQuestId = 'map-waypoint';
            closeModal();
            toast(`Tracking ${p.name}. Open the map to follow the route.`);
          }
        }),
    );
  } else {
    el<HTMLSelectElement>('s-room-mode').onchange = () =>
      (el('s-room-server-label').hidden = el<HTMLSelectElement>('s-room-mode').value === 'peer');
    el<HTMLFormElement>('s-room-form').onsubmit = async (e) => {
      e.preventDefault();
      if (multiplayer.status === 'connecting') return;
      const source = game,
        revision = modalRevision;
      roomName = el<HTMLInputElement>('s-room-name').value.trim() || game.player.name;
      roomServer =
        el<HTMLSelectElement>('s-room-mode').value === 'peer'
          ? 'peer:'
          : el<HTMLInputElement>('s-room-server').value.trim();
      const raw = el<HTMLInputElement>('s-room-code').value.trim();
      roomDraft = raw;
      roomError = '';
      const addressed = readRoomInput(raw);
      const code = addressed?.room ?? (raw ? validRoomCode(raw) : '');
      if (raw && !code) {
        toast('Use the room code, or leave it empty to host.');
        return;
      }
      try {
        localStorage.setItem('verso.room.name', roomName);
        localStorage.setItem('verso.room.server', roomServer);
        if (code) {
          if (addressed) roomServer = addressed.endpoint;
          const { discoverRoom } = await import('./multiplayer');
          const info = addressed ?? (await discoverRoom(roomServer, code));
          if (source !== game || revision !== modalRevision) return;
          if (info.seed !== game.world.seed || info.generation !== game.world.generation) {
            choosePlanet(info.seed, info.generation, {
              seed: info.seed,
              generation: info.generation,
              room: code,
              endpoint: roomServer,
            });
            return;
          }
        }
        await multiplayer.connect(roomServer, roomIdentity(), code || '');
        if (modal === 'together') togetherMenu();
        toast('Your room is ready. Share its code or link.');
      } catch (error) {
        roomError = error instanceof Error ? error.message : 'Could not reach this room.';
        if (modal === 'together') togetherMenu();
      }
    };
    const reconnect = document.getElementById('s-room-reconnect');
    if (reconnect)
      reconnect.onclick = async () => {
        try {
          await multiplayer.reconnect(roomIdentity());
          togetherMenu();
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Could not reconnect.');
        }
      };
    document.querySelectorAll<HTMLElement>('[data-resume-world]').forEach(
      (n) =>
        (n.onclick = async () => {
          try {
            roomServer = 'peer:';
            await multiplayer.hostSavedWorld(n.dataset.resumeWorld!, roomIdentity());
            togetherMenu();
            toast('Your saved shared world is open again.');
          } catch (error) {
            toast(error instanceof Error ? error.message : 'Could not resume this world.');
          }
        }),
    );
  }
}
function renderNetworkStatus() {
  const target = document.getElementById('v-network-status');
  if (!target) return;
  const d = multiplayer.networkDiagnostic;
  target.textContent = d
    ? `${d.hosting ? 'Hosting' : 'Joining'} · ${d.stage} · discovery ${d.signalling ? 'online' : 'offline'} · ${d.route === 'relay' ? 'relayed connection' : d.route === 'direct' ? 'direct connection' : d.route === 'local-host' ? 'local host' : 'finding a route'}${d.roundTripMs === undefined ? '' : ` · ${d.roundTripMs} ms`} · ${d.relayConfigured ? 'relay configured' : 'no relay configured'}`
    : '';
}
multiplayer.onNetworkChange = renderNetworkStatus;
function appendChat(name: string, text: string, system = false, at = Date.now()) {
  const log = el('v-chat-log'),
    line = document.createElement('p');
  const stamp = document.createElement('time');
  stamp.textContent = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  line.append(stamp);
  if (system) {
    line.className = 'is-system';
    line.append(document.createTextNode(text));
  } else {
    const who = document.createElement('b');
    who.textContent = name + ': ';
    line.append(who, document.createTextNode(text));
  }
  const bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.append(line);
  while (log.children.length > 150) log.firstElementChild?.remove();
  if (bottom) log.scrollTop = log.scrollHeight;
}
multiplayer.onChat = (message) => {
  appendChat(message.name, message.text, false, message.at);
  if (message.channel === 'say')
    peerEmotes.set(message.peerId, {
      text: message.text.slice(0, 80),
      until: performance.now() + 6500,
    });
};
async function say(text: string) {
  text = text.trim();
  if (!text) return;
  if (text === '/help') {
    appendChat(
      '',
      'Enter speaks. /say text reaches nearby travelers; /room text reaches your room. F7–F9 send your saved phrases. Say hi to greet a nearby resident.',
      true,
    );
    return;
  }
  if (/^\/(room|world)\s/i.test(text)) {
    setChatChannel('world');
    text = text.replace(/^\/\w+\s+/, '');
  } else if (/^\/say\s/i.test(text)) {
    setChatChannel('say');
    text = text.replace(/^\/say\s+/, '');
  } else if (text.startsWith('/')) {
    appendChat('', 'Unknown command. Use /say, /room or /help.', true);
    return;
  }
  if (text.length > 280) {
    appendChat('', 'Keep a message within 280 characters.', true);
    return;
  }
  if (multiplayer.status === 'online') {
    const result = await multiplayer.sendChat(text, chatChannel);
    if (!result.ok) appendChat('', result.reason || 'The message was not delivered.', true);
  } else if (multiplayer.status === 'disconnected') {
    appendChat('', 'Reconnect to your room before speaking to its travelers.', true);
    return;
  } else if (chatChannel === 'world') {
    appendChat('', 'Join or host a room to speak to other travelers.', true);
    return;
  } else appendChat(game.player.name, text);
  if (chatChannel === 'say' && /^(hi|hello|greetings|trade|job|work)[.!?]?$/i.test(text)) {
    const npc = game.npcs
      .filter(
        (n) =>
          n.hp > 0 &&
          !n.hostile &&
          n.id !== game.occupiedNpcId &&
          Math.hypot(n.x - game.player.x, n.y - game.player.y) < 2.6,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - game.player.x, a.y - game.player.y) -
          Math.hypot(b.x - game.player.x, b.y - game.player.y),
      )[0];
    if (npc) {
      game.interact(npc.id);
      if (game.dialogue) {
        appendChat(npc.name, game.dialogue.text);
        updateDialogue();
      }
    }
  }
}
function shortcutsMenu() {
  openModal(
    'shortcuts',
    `<div class="v-window-heading"><h2>Words at your fingertips</h2><button id="v-shortcuts-close" aria-label="Close shortcuts">×</button></div><p>Assign a phrase or chat command to F7, F8 and F9. Shortcuts stay with this browser. Press a key or a Send button to speak.</p><form id="v-shortcuts-form">${phraseShortcuts.map((p, i) => `<label class="v-shortcut-row"><kbd>F${i + 7}</kbd><input data-phrase="${i}" maxlength="280" value="${esc(p)}"><button type="button" data-shortcut-send="${i}">Send</button></label>`).join('')}<button class="s-primary">Keep these shortcuts</button></form><p class="v-muted">Examples: /room Meet at the market. · /say Follow me. · hi</p>`,
  );
  el('v-shortcuts-close').onclick = closeModal;
  document.querySelectorAll<HTMLButtonElement>('[data-shortcut-send]').forEach(
    (b) =>
      (b.onclick = () => {
        const text = document
          .querySelector<HTMLInputElement>(`[data-phrase="${b.dataset.shortcutSend}"]`)!
          .value.trim();
        if (text) {
          closeModal();
          void say(text);
        }
      }),
  );
  el<HTMLFormElement>('v-shortcuts-form').onsubmit = (e) => {
    e.preventDefault();
    phraseShortcuts = [...document.querySelectorAll<HTMLInputElement>('[data-phrase]')].map((n) =>
      n.value.trim(),
    );
    try {
      localStorage.setItem('verso.chat.shortcuts', JSON.stringify(phraseShortcuts));
    } catch {}
    closeModal();
    toast('F7, F8 and F9 are ready.');
  };
}
el<HTMLFormElement>('v-chat-form').onsubmit = (e) => {
  e.preventDefault();
  const input = el<HTMLInputElement>('v-chat-input');
  const text = input.value;
  input.value = '';
  void say(text);
};
el('v-chat-input').onfocus = () => {
  keys.clear();
  walk = [];
};
el('v-chat-input').onkeydown = (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    canvas.focus();
  }
};
el('v-chat-settings').onclick = shortcutsMenu;
function setChatChannel(channel: 'say' | 'world') {
  chatChannel = channel;
  document
    .querySelectorAll<HTMLElement>('[data-chat-channel]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.chatChannel === channel)));
}
function setChatCollapsed(collapsed: boolean) {
  document.querySelector('.s-shell')!.classList.toggle('chat-collapsed', collapsed);
  el('v-chat-toggle').textContent = collapsed ? '+' : '−';
  el('v-chat-toggle').setAttribute('aria-label', collapsed ? 'Expand chat' : 'Collapse chat');
  resize();
}
el('v-chat-toggle').onclick = () =>
  setChatCollapsed(!document.querySelector('.s-shell')!.classList.contains('chat-collapsed'));
document.querySelectorAll<HTMLElement>('[data-chat-channel]').forEach(
  (n) =>
    (n.onclick = () => {
      setChatChannel(n.dataset.chatChannel as 'say' | 'world');
    }),
);
let placingProduction: ProductionKind | null = null;
let productionSyncAt = 0,
  productionSyncBusy = false;
const registeredProduction = new Set<string>();
const machineId = (localId: string) => `${getBrowserPlayerId()}:${localId}`;
async function placeProduction(kind: ProductionKind, point: Point) {
  const source = game,
    room = multiplayer.room,
    bodyId = game.bodyId;
  const preview = source.productionPreview(kind, point);
  if (!preview.ok) {
    toast(preview.message);
    return;
  }
  if (multiplayer.status === 'disconnected' || multiplayer.status === 'connecting') {
    toast('Reconnect before constructing in this shared world.');
    return;
  }
  const id = machineId(source.nextProductionId);
  if (multiplayer.status === 'online') {
    sharedActionPending = true;
    keys.clear();
    walk = [];
    sendCombatPose(true, false);
    try {
      const ack = await multiplayer.registerProductionMachine({ id, kind, ...preview.point });
      if (source !== game || room !== multiplayer.room || bodyId !== source.bodyId) return;
      if (!ack.ok) {
        toast(ack.reason || 'The room could not confirm this work site.');
        return;
      }
      registeredProduction.add(id);
      const result = source.buildProduction(kind, preview.point);
      toast(result.message);
      if (result.ok) {
        placingProduction = null;
        save();
      }
    } finally {
      sharedActionPending = false;
    }
  } else {
    const result = source.buildProduction(kind, preview.point);
    toast(result.message);
    if (result.ok) {
      placingProduction = null;
      save();
    }
  }
}
async function syncProduction(now: number) {
  if (productionSyncBusy || multiplayer.status !== 'online' || now - productionSyncAt < 1500)
    return;
  productionSyncAt = now;
  productionSyncBusy = true;
  const source = game,
    room = multiplayer.room;
  const bodyId = source.bodyId;
  try {
    for (const structure of source.productionStructures) {
      if (source !== game || room !== multiplayer.room || bodyId !== source.bodyId) break;
      const id = machineId(structure.id);
      if (
        !registeredProduction.has(id) &&
        Math.hypot(structure.x - source.player.x, structure.y - source.player.y) <= 2
      ) {
        const ack = await multiplayer.registerProductionMachine({
          id,
          kind: structure.kind,
          x: structure.x,
          y: structure.y,
        });
        if (source !== game || room !== multiplayer.room || bodyId !== source.bodyId) break;
        if (ack.ok) registeredProduction.add(id);
      }
    }
    for (const claim of source.pendingProductionClaims) {
      if (source !== game || room !== multiplayer.room) break;
      const id = machineId(claim.structureId);
      if (!registeredProduction.has(id)) continue;
      const ack = await multiplayer.productionClaim(
        id,
        `${claim.structureId}:${claim.jobId}`,
        claim.sourceId,
        claim,
      );
      if (source !== game || room !== multiplayer.room) break;
      if (ack.ok) source.commitProductionClaim(claim.structureId, claim.jobId, claim.sourceId);
      else if (multiplayer.status === 'online')
        source.rejectProductionClaim(claim.structureId, claim.jobId, claim.sourceId, ack.reason);
      save();
    }
  } finally {
    productionSyncBusy = false;
  }
}
function workMenu() {
  if (!started) return;
  const amounts = (values: Partial<Record<ItemId, number>>) =>
    Object.entries(values)
      .map(([k, n]) => `${n} ${game.itemName(k as ItemId)}`)
      .join(', ') || 'none';
  const machines = game.productionStructures;
  openModal(
    'production',
    `<div class="v-window-heading"><div><small>Gather · construct · supply · earn</small><h2>Make a working place</h2></div><button id="v-work-close" aria-label="Close work">×</button></div><p>Build on clear ground near your resources. Load real inputs, let the work run while you play, then collect the output at the platform. Merchants buy gathered materials and prepared goods.</p><div class="v-production-grid">${PRODUCTION_KINDS.map((k) => `<article><canvas data-production-preview="${k.id}" width="160" height="110" aria-label="${esc(k.name)} structure"></canvas><h3>${esc(k.name)}</h3><p>${k.coins} coins · ${amounts(k.items)}</p><p>${esc(k.description)}</p><button data-build-kind="${k.id}">Place in world</button></article>`).join('')}</div><div class="v-production-list">${
      machines
        .map((m) => {
          const near = Math.hypot(m.x - game.player.x, m.y - game.player.y) < 3;
          return `<article><canvas data-production-preview="${m.kind}" data-production-progress="${m.progress}" width="160" height="110" aria-label="${esc(m.kind)} work platform"></canvas><header><b>${esc(PRODUCTION_KINDS.find((k) => k.id === m.kind)!.name)}</b><span>${esc({ idle: 'Ready for inputs', working: 'Making the next batch', ready: 'Output ready', blocked: 'Work interrupted' }[m.phase] ?? m.phase)} · ${Math.round(Math.hypot(m.x - game.player.x, m.y - game.player.y))} paces away</span></header>${m.job ? `<progress value="${m.progress}" max="1"></progress><p>${esc(m.job.blocked || `${m.job.completed}/${m.job.batches} batches completed`)} · ${Math.floor(m.progress * 100)}%</p>` : ''}<p>Stored: ${amounts(m.output)} ${!near ? '· Approach to supply or collect' : ''}</p>${
            !m.job
              ? `<select aria-label="Production recipe" data-machine-recipe="${m.id}">${game.productionRecipes
                  .filter((r) => r.kind === m.kind)
                  .map(
                    (r) =>
                      `<option value="${r.id}">${esc(r.name)} · ${amounts(r.inputs)} → ${amounts(r.output)} · ${r.seconds}s</option>`,
                  )
                  .join(
                    '',
                  )}</select><select aria-label="Batch count" data-machine-batches="${m.id}">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} batch${n > 1 ? 'es' : ''}</option>`).join('')}</select><button data-machine-start="${m.id}" ${near ? '' : 'disabled'}>Load inputs</button>`
              : `<button data-machine-cancel="${m.id}" ${near ? '' : 'disabled'}>Cancel & retrieve inputs</button>${m.phase === 'blocked' ? `<button data-machine-retry="${m.id}" ${near ? '' : 'disabled'}>Retry</button>` : ''}`
          }<button data-machine-collect="${m.id}" ${near && Object.values(m.output).some((n) => n) ? '' : 'disabled'}>Collect output</button><button data-machine-track="${m.id}">Track</button></article>`;
        })
        .join('') ||
      '<p>No production platforms yet. Gather timber and ore with your tools, then choose a clear work site.</p>'
    }</div>`,
  );
  const workFrame = document.querySelector<HTMLElement>('[data-screen=production]')!;
  const workTabs = document.createElement('nav');
  workTabs.className = 'v-production-tabs';
  workTabs.setAttribute('aria-label', 'Work views');
  workFrame.dataset.workView = machines.length ? 'machines' : 'build';
  workTabs.innerHTML = `<button data-work-view="build" aria-pressed="${!machines.length}">Build a platform</button><button data-work-view="machines" aria-pressed="${!!machines.length}">My work · ${machines.length}</button>`;
  workFrame.querySelector('.s-dialog-heading')!.after(workTabs);
  workTabs.querySelectorAll<HTMLButtonElement>('button').forEach(
    (b) =>
      (b.onclick = () => {
        workFrame.dataset.workView = b.dataset.workView;
        workTabs
          .querySelectorAll('button')
          .forEach((other) => other.setAttribute('aria-pressed', String(other === b)));
        workFrame.querySelector('.s-window-content')!.scrollTop = 0;
      }),
  );
  document.querySelectorAll<HTMLCanvasElement>('[data-production-preview]').forEach((c) => {
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    drawProduction(
      ctx,
      c.dataset.productionPreview as ProductionKind,
      80,
      85,
      2,
      Number(c.dataset.productionProgress ?? 0),
      false,
      0,
    );
  });
  el('v-work-close').onclick = closeModal;
  document.querySelectorAll<HTMLElement>('[data-build-kind]').forEach(
    (n) =>
      (n.onclick = () => {
        placingProduction = n.dataset.buildKind as ProductionKind;
        closeModal();
        toast('Choose a clear 3×3 patch within two paces. Click to build; Escape cancels.', 8000);
      }),
  );
  const finish = (result: { ok: boolean; message: string }) => {
    save();
    workMenu();
    toast(result.message);
  };
  document.querySelectorAll<HTMLElement>('[data-machine-start]').forEach(
    (n) =>
      (n.onclick = () => {
        const id = n.dataset.machineStart!;
        finish(
          game.startProduction(
            id,
            document.querySelector<HTMLSelectElement>(`[data-machine-recipe="${id}"]`)!.value,
            Number(
              document.querySelector<HTMLSelectElement>(`[data-machine-batches="${id}"]`)!.value,
            ),
          ),
        );
      }),
  );
  document
    .querySelectorAll<HTMLElement>('[data-machine-cancel]')
    .forEach((n) => (n.onclick = () => finish(game.cancelProduction(n.dataset.machineCancel!))));
  document
    .querySelectorAll<HTMLElement>('[data-machine-retry]')
    .forEach((n) => (n.onclick = () => finish(game.retryProduction(n.dataset.machineRetry!))));
  document
    .querySelectorAll<HTMLElement>('[data-machine-collect]')
    .forEach((n) => (n.onclick = () => finish(game.collectProduction(n.dataset.machineCollect!))));
  document.querySelectorAll<HTMLElement>('[data-machine-track]').forEach(
    (n) =>
      (n.onclick = () => {
        const m = machines.find((m) => m.id === n.dataset.machineTrack)!;
        mapWaypoint = { x: m.x, y: m.y };
        trackedQuestId = 'map-waypoint';
        closeModal();
      }),
  );
}
el('v-galaxy').onclick = galaxyMenu;
el('v-work').onclick = workMenu;
let rosterPage = 0,
  rosterSignature = '';
function renderRoster() {
  const all = [
    {
      id: multiplayer.peerId || '$self',
      name: multiplayer.status === 'online' ? roomName : game.player.name,
      appearance: game.displayAppearance,
    },
    ...multiplayer.peers.map(({ id, name, appearance }) => ({ id, name, appearance })),
  ];
  rosterPage = Math.min(rosterPage, Math.max(0, Math.ceil(all.length / 2) - 1));
  const signature = JSON.stringify([rosterPage, multiplayer.status, all]);
  if (signature === rosterSignature) return;
  rosterSignature = signature;
  el('v-roster-title').textContent =
    multiplayer.status === 'online' ? `Room · ${all.length} travelers` : 'Traveling alone';
  el('v-roster-page').hidden = all.length <= 2;
  const shown = all.slice(rosterPage * 2, rosterPage * 2 + 2);
  el('v-roster-list').innerHTML =
    shown
      .map(
        (p, i) =>
          `<button class="v-traveler-row" data-roster-id="${esc(p.id)}"><canvas id="v-roster-face-${i}" width="96" height="112"></canvas><span><b>${esc(p.name)}</b><small>${p.id === multiplayer.peerId || p.id === '$self' ? 'Your continuing life' : 'Track this traveler'}</small></span><i title="${multiplayer.status === 'online' ? 'Online' : 'Solo'}"></i></button>`,
      )
      .join('') +
    (multiplayer.status !== 'online'
      ? '<button id="v-roster-invite">Invite a traveler</button>'
      : '');
  shown.forEach((p, i) =>
    drawPortrait(el<HTMLCanvasElement>(`v-roster-face-${i}`).getContext('2d')!, p.appearance),
  );
  document.querySelectorAll<HTMLElement>('[data-roster-id]').forEach(
    (n) =>
      (n.onclick = () => {
        const peer = multiplayer.peers.find((p) => p.id === n.dataset.rosterId);
        if (peer) {
          mapWaypoint = { x: peer.x, y: peer.y };
          trackedQuestId = 'map-waypoint';
          toast(`Following ${peer.name} on the map.`);
        } else lifeMenu();
      }),
  );
  const invite = document.getElementById('v-roster-invite');
  if (invite) invite.onclick = togetherMenu;
}
el('v-roster-page').onclick = () => {
  rosterPage = (rosterPage + 1) % Math.ceil((multiplayer.peers.length + 1) / 2);
  renderRoster();
};
el('v-map-less').onclick = () => renderer.setZoom(renderer.zoom - 0.15);
el('v-map-more').onclick = () => renderer.setZoom(renderer.zoom + 0.15);
document
  .querySelectorAll<HTMLElement>('[data-phrase-send]')
  .forEach((n) => (n.onclick = () => void say(phraseShortcuts[Number(n.dataset.phraseSend)])));
multiplayer.onChange = () => {
  if (multiplayer.status === 'online') roomError = '';
  if (multiplayer.status !== 'online') registeredProduction.clear();
  game.setSharedWorld(multiplayer.status !== 'offline');
  game.setSharedCombat(multiplayer.status !== 'offline', `${game.world.seed}:${multiplayer.room}`);
  el('s-together').textContent =
    multiplayer.status === 'online'
      ? `Room · ${multiplayer.peers.length + 1}`
      : multiplayer.status === 'disconnected'
        ? 'Reconnect'
        : 'Room';
  el('v-chat-status').textContent =
    multiplayer.status === 'online'
      ? `Room ${multiplayer.room} · ${multiplayer.peers.length + 1}/8`
      : multiplayer.status === 'disconnected'
        ? 'Connection interrupted'
        : 'Traveling alone';
  renderRoster();
  const signature = `${multiplayer.status}:${multiplayer.room}:${multiplayer.peers.map((p) => p.id).join(',')}`;
  if (signature !== multiplayerRoster) {
    multiplayerRoster = signature;
    if (multiplayer.status === 'online') {
      try {
        rememberWorld({
          seed: game.world.seed,
          generation: game.world.generation,
          room: multiplayer.room,
          endpoint: roomServer,
          visitedAt: Date.now(),
        });
      } catch {}
    }

    if (modal === 'together' && multiplayer.status !== 'connecting') togetherMenu();
  }
};
multiplayer.onMessage = (text) => toast(text, 7000);
let savedCombatEvent = 0,
  savedCombatRoom = '';
multiplayer.onCombat = (frame) => {
  const accepted = game.applySharedCombat(frame, multiplayer.peerId);
  if (savedCombatRoom !== multiplayer.room) {
    savedCombatRoom = multiplayer.room;
    savedCombatEvent = 0;
  }
  if (accepted.eventId > savedCombatEvent && save()) savedCombatEvent = accepted.eventId;
  if (accepted.eventId && accepted.eventId <= savedCombatEvent)
    multiplayer.acknowledgeCombat(accepted.eventId);
};
function sendCombatPose(
  force = false,
  active = started && !paused && !game.dialogue && !transferStarted && game.phase === 'playing',
) {
  multiplayer.pose(
    game.player,
    game.displayAppearance,
    force,
    active,
    game.sharedCombatProgression,
    game.bodyId,
    roomName,
  );
}
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
    el('v-chat-log').replaceChildren();
    for (const message of change.chat ?? [])
      appendChat(message.name, message.text, false, message.at);
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
async function interactShared(id?: string, keepRoute = false) {
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
    if (keepRoute) walk = [];
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
    if (keepRoute) walk = [];
    toast(available.reason ?? 'This cannot be gathered yet.');
    return;
  }
  if (available.completes === false) {
    game.interact(target.id);
    updateUI();
    save();
    return;
  }
  const current = game,
    desiredOpen = !game.opened.has(target.id);
  sharedActionPending = true;
  keys.clear();
  if (!keepRoute) walk = [];
  setInert(true);
  sendCombatPose(true);
  try {
    const result =
      target.kind === 'door'
        ? await multiplayer.door(target.id, desiredOpen)
        : await multiplayer.claim(
            target.id,
            ['chest', 'crate'].includes(target.kind) ? 'loot' : 'gather',
            target,
            available.toolKind,
          );
    if (current !== game) return;
    if (result.ok) {
      if (target.kind !== 'door' || game.opened.has(target.id) !== desiredOpen)
        game.interact(target.id);
      updateUI();
      save();
    } else {
      if (keepRoute) walk = [];
      toast(result.reason ?? 'Another traveler reached it first.');
    }
  } finally {
    sharedActionPending = false;
    if (!modal && !transferStarted) setInert(false);
    if (document.hidden && !modal && !transferStarted) pauseMenu();
  }
}
async function combatShared(kind: 'attack' | 'ward') {
  if (sharedActionPending || game.phase !== 'playing') return;
  if (multiplayer.status === 'offline') {
    if (kind === 'attack') game.attack(pointer ?? undefined);
    else game.ward();
    return;
  }
  if (multiplayer.status !== 'online') {
    toast('Reconnect from Together, or leave the room before fighting alone.');
    return;
  }
  const preview = game.sharedCombatPreview(kind, pointer ?? undefined);
  if (!preview.ok) {
    toast(preview.message);
    return;
  }
  const current = game;
  sharedActionPending = true;
  keys.clear();
  walk = [];
  setInert(true);
  sendCombatPose(true, true);
  try {
    const result = await multiplayer.combat(kind, preview.heading);
    if (current !== game) return;
    if (result.ok) game.commitSharedCombatAction(kind, preview.heading, preview.bodyId);
    else toast(result.reason ?? 'That action could not reach the shared world.');
    updateUI();
    save();
  } finally {
    sharedActionPending = false;
    if (!modal && !transferStarted) setInert(false);
    if (document.hidden && !modal && !transferStarted) pauseMenu();
  }
}
async function parleyShared() {
  if (sharedActionPending) return;
  if (multiplayer.status !== 'online') {
    toast('Reconnect to ask for a shared truce.');
    return;
  }
  const preview = game.sharedParleyPreview();
  if (!preview.ok) {
    toast(preview.message);
    return;
  }
  const current = game;
  sharedActionPending = true;
  keys.clear();
  setInert(true);
  sendCombatPose(true, false);
  try {
    const result = await multiplayer.parley(preview.guardIds);
    if (current !== game) return;
    if (result.ok) toast(game.commitSharedParley(preview.stepId, preview.bodyId).message);
    else toast(result.reason ?? 'The guards did not accept the truce.');
    updateUI();
    drawMap();
    save();
  } finally {
    sharedActionPending = false;
    if (!modal && !transferStarted) setInert(false);
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
  if (command === 'attack' || command === 'ward') void combatShared(command);
  if (command === 'interact') void interactShared();
  updateUI();
  save();
}
function pathTo(goal: Point): Point[] {
  return findWalkingPath(game.player, [goal], (x, y) =>
    game.world.blocked(x, y, game.removed, true),
  );
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
  const route = findWalkingPath(game.player, options, (x, y) =>
    game.world.blocked(x, y, game.removed, true),
  );
  if (route.length) {
    walk = route;
    walkTarget = target.id;
    walkStuck = 0;
    return;
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
  if (placingProduction) {
    const preview = game.productionPreview(placingProduction, ground);
    if (!preview.ok) {
      toast(preview.message);
      if (Math.hypot(ground.x - game.player.x, ground.y - game.player.y) > 2) {
        walk = pathTo(ground);
        walkTarget = undefined;
        walkStuck = 0;
      }
      return;
    }
    void placeProduction(placingProduction, ground);
    return;
  }
  const machine = game.productionStructures.find(
    (m) => Math.hypot(m.x - ground.x, m.y - ground.y) < 1.4,
  );
  if (machine) {
    workMenu();
    return;
  }
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
    if (d.choice === 'campaign:parley' && multiplayer.status !== 'offline') {
      void parleyShared();
      return;
    }
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
el('s-life').onclick = () => lifeMenu();
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
el('v-mobile-more').onclick = moreActions;
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
  if (e.key === 'Tab' && (modal || transferStarted || game.dialogue)) {
    const focus = [
      ...el(
        transferStarted ? 's-transfer' : modal ? 's-modal' : 's-dialogue',
      ).querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled):not([hidden]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
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
  if (k === 'escape' && placingProduction) {
    e.preventDefault();
    placingProduction = null;
    toast('Construction cancelled.');
    return;
  }
  if (k === 'escape') {
    e.preventDefault();
    if (modal === 'journal') foldNotebook(true);
    else if (modal && !['title', 'lost', 'life-in-use'].includes(modal)) closeModal();
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
  if (k === 'enter') {
    e.preventDefault();
    setChatCollapsed(false);
    el('v-chat-input').focus();
    return;
  }
  if (/^f[789]$/.test(k)) {
    e.preventDefault();
    if (!e.repeat) void say(phraseShortcuts[Number(k.slice(1)) - 7]);
    return;
  }
  if (k === 'g' && !e.repeat) {
    e.preventDefault();
    galaxyMenu();
    return;
  }
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
        const door =
          d < 1.6
            ? game.world
                .propsAround(next.x, next.y, 0)
                .find((p) => p.kind === 'door' && !game.removed.has(p.id))
            : undefined;
        if (door) {
          // This goes through the same server acknowledgement as an explicit E press.
          // Keep the route while waiting, but never move through an unconfirmed door.
          void interactShared(door.id, true);
          walkStuck = 0;
        } else {
          x = (dx / d) * Math.min(1, d / (game.player.speed * Math.max(dt, 0.001)));
          y = (dy / d) * Math.min(1, d / (game.player.speed * Math.max(dt, 0.001)));
        }
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
  sendCombatPose();
  void syncProduction(now);
  renderer.draw(game, {
    peers: multiplayer.peers,
    machines: multiplayer.machines,
    placement:
      placingProduction && pointer
        ? {
            kind: placingProduction,
            point: { x: Math.round(pointer.x), y: Math.round(pointer.y) },
            valid: game.productionPreview(placingProduction, pointer).ok,
          }
        : undefined,
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
    renderRoster();
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
        lifeOrigin: game.lifeOrigin,
        lifeCandidate: game.lifeOrigin,
        identityName: game.identityName,
        browserIdentity: getBrowserPlayerId(),
        productionStructures: game.productionStructures,
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
        tools: game.tools,
        workProgress: game.workProgress,
        staff: game.staff,
        estate: game.estate,
        laborOrders: game.laborOrders,
        artifacts: game.artifacts,
        activeArtifact: game.activeArtifact,
        nextArtifactDesign: game.nextArtifactDesign,
        multiplayer: {
          status: multiplayer.status,
          room: multiplayer.room,
          peerId: multiplayer.peerId,
          peers: multiplayer.peers,
          machines: multiplayer.machines,
          placement:
            placingProduction && pointer
              ? {
                  kind: placingProduction,
                  point: { x: Math.round(pointer.x), y: Math.round(pointer.y) },
                  valid: game.productionPreview(placingProduction, pointer).ok,
                }
              : undefined,
          pending: sharedActionPending,
          network: multiplayer.networkDiagnostic,
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
    productionPreview(kind: ProductionKind, point: Point) {
      return structuredClone(game.productionPreview(kind, point));
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
async function enterBrowserLife() {
  ownsLifeTab = await claimLifeTab();
  if (ownsLifeTab) {
    title();
    return;
  }
  openModal(
    'life-in-use',
    `<h2>This mind is already awake.</h2><p>Verso is open in another tab of this browser. Close that tab to continue the same life here.</p><button id="v-retry-life-tab" class="s-primary">Continue here</button>`,
  );
  el('v-retry-life-tab').onclick = () => void enterBrowserLife();
}
void enterBrowserLife();
addEventListener('pagehide', () => {
  save();
  ownsLifeTab = false;
  releaseLifeTab();
});
addEventListener('pageshow', (event) => {
  if (event.persisted) void enterBrowserLife();
});
requestAnimationFrame(frame);
