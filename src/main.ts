import './style.css';
import { Game, distance, WALKABLE } from './game';
import type { ActionKind, InputState } from './game';
import { Renderer } from './render';
import { AudioDirector } from './audio';
import { parseSeed, formatSeed } from './seed';
import { registerOffline } from './offline';
void registerOffline();

const SAVE_KEY = 'verso.save.v1';
const SETTINGS_KEY = 'verso.settings.v1';
const WORLD_NAMES = ['The quiet verge', 'The violet archive', 'The last witness'];
const icons: Record<string, string> = {
  blade: '<path d="m7 25 15-15 4-7-7 4L4 22m2-5 9 9m-6-5-6 6"/>',
  pulse:
    '<circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="3"/><path d="M16 2v5m0 18v5M2 16h5m18 0h5m-3-8 3 3"/>',
  dash: '<path d="m6 8 6 8-6 8m8-16 6 8-6 8m8-16 6 8-6 8"/>',
  scan: '<path d="M11 5H5v6m16-6h6v6M5 21v6h6m16-6v6h-6"/><path d="m16 11 5 5-5 5-5-5Z"/>',
  mend: '<path d="M13 5h6v8h8v6h-8v8h-6v-8H5v-6h8Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M11 8v16M21 8v16" stroke-width="5"/>',
  audio: '<path d="M5 12h6l7-6v20l-7-6H5Z"/><path d="M23 10q7 6 0 12m1-16q12 10 0 20"/>',
  muted: '<path d="M5 12h6l7-6v20l-7-6H5Z"/><path d="m23 12 7 8m0-8-7 8"/>',
  journal: '<path d="M7 5h18v23H7zM4 9h6m-6 7h6m-6 7h6m4-13h7m-7 6h7"/>',
  close: '<path d="m8 8 16 16M8 24 24 8"/>',
  full: '<path d="M11 4H4v7m17-7h7v7M4 21v7h7m17-7v7h-7"/>',
  diamond:
    '<path d="m16 3 13 13-13 13L3 16Z"/><path d="m16 11 5 5-5 5-5-5Z" fill="currentColor" stroke="none"/>',
};
const logoPixels = [
  '10001/10001/10001/10001/01010/01010/00100',
  '11111/10000/10000/11110/10000/10000/11111',
  '11110/10001/10001/11110/10100/10010/10001',
  '01111/10000/10000/01110/00001/00001/11110',
  '01110/10001/10001/10001/10001/10001/01110',
];
const logo = `<svg class="brand-svg" viewBox="0 0 37 7" role="img" aria-label="VERSO" shape-rendering="crispEdges">${logoPixels
  .map((letter, index) =>
    letter
      .split('/')
      .map((row, y) =>
        row
          .split('')
          .map((pixel, x) =>
            pixel === '1'
              ? `<rect x="${index * 8 + x}" y="${y}" width="1" height="1" fill="currentColor"/>`
              : '',
          )
          .join(''),
      )
      .join(''),
  )
  .join('')}</svg>`;
const icon = (name: string) =>
  `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" aria-hidden="true">${icons[name] || icons.diamond}</svg>`;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = el('app');
app.innerHTML = `
  <main class="game-shell" aria-label="Verso game">
    <canvas id="world" aria-label="An isometric floating forest. Move with WASD, scan nearby objects with E." tabindex="0"></canvas>
    <div class="edge-shade" aria-hidden="true"></div>
    <div id="hud" class="hud hidden">
      <header class="world-heading"><div class="wordmark">${icon('diamond')}${logo}</div><span id="world-name" class="world-name">The quiet verge</span></header>
      <section class="assignment glass" aria-label="Current assignment">
        <div class="assignment-top"><span id="assignment-number">Assignment 001</span><button id="journal-link" class="text-button" title="Open journal (J)">Journal <kbd>J</kbd></button></div>
        <h1 id="objective-title">Leave only a trace.</h1>
        <div id="objective-tasks" class="objective-tasks"></div>
        <div class="integrity"><div class="integrity-line"><i id="integrity-fill"></i></div><span id="integrity-label">World integrity 100%</span></div>
      </section>
      <nav class="top-controls" aria-label="Game controls">
        <button id="pause-button" class="icon-button" title="Pause (Esc)" aria-label="Pause game">${icon('pause')}</button>
        <button id="audio-button" class="icon-button" title="Toggle audio (M)" aria-label="Mute audio">${icon('audio')}</button>
        <button id="fullscreen-button" class="icon-button extra-control" title="Fullscreen" aria-label="Enter fullscreen">${icon('full')}</button>
      </nav>
      <div class="minimap-wrap" aria-label="World map"><span class="map-n">N</span><canvas id="minimap" width="170" height="130" aria-label="Minimap showing objectives and your position"></canvas><span class="map-w">W</span><span class="map-e">E</span><span class="map-s">S</span></div>
      <section id="vitals" class="vitals" aria-label="Vessel health"><div class="vessel-label"><span id="vessel-label">Vessel 01</span><span id="health-number">100 / 100</span></div><div id="hearts" class="hearts" aria-hidden="true"><i>♥</i><i>♥</i><i>♥</i></div><div class="health-track" role="meter" id="health-meter" aria-label="Health" aria-valuemin="0" aria-valuemax="100"><i id="health-fill"></i></div><div class="stamina-track" role="meter" id="stamina-meter" aria-label="Stamina" aria-valuemin="0" aria-valuemax="100"><i id="stamina-fill"></i></div><div class="fragment-label">${icon('diamond')}<span id="fragments">2 fragments</span></div></section>
      <nav class="action-dock glass" aria-label="Abilities">
        ${(
          [
            ['blade', 'LMB', 'Blade'],
            ['pulse', 'RMB', 'Pulse'],
            ['dash', 'Space', 'Dash'],
            ['scan', 'E', 'Scan'],
            ['mend', 'Q', 'Mend'],
          ] as const
        )
          .map(
            ([kind, key, label]) =>
              `<button class="ability" data-action="${kind}" aria-label="${label} (${key})" title="${label} (${key})"><span class="ability-icon">${icon(kind)}<i class="cooldown"></i></span><kbd>${key}</kbd><span class="ability-label">${label}</span></button>`,
          )
          .join('')}
      </nav>
      <div class="seed-label"><span id="seed-label">VERGE / SEED 0x71A3</span><span id="save-indicator">Progress saved locally</span></div>
      <div id="interaction" class="interaction hidden"><kbd>E</kbd><span></span></div>
      <div id="tutorial" class="tutorial glass"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Shift</kbd> Run</span><span>Approach a glowing species, then press <kbd>E</kbd>.</span><button id="dismiss-tutorial" aria-label="Dismiss movement hint">${icon('close')}</button></div>
      <div class="touch-controls"><div id="joystick" aria-label="Touch movement joystick"><i id="joystick-thumb"></i></div><button id="touch-interact">${icon('scan')}<span>Interact</span></button></div>
    </div>
    <div id="notification" class="notification hidden" role="status" aria-live="polite"></div>
    <div id="modal-layer" class="modal-layer"></div>
    <div id="transition" class="transition" aria-hidden="true"></div>
    <div id="load-screen" class="load-screen"><div class="wordmark">${icon('diamond')}${logo}</div><p>Locating a possible world<span class="loading-dots">...</span></p></div>
  </main>`;

let game = new Game('TRAVELER', 0x71a3);
const renderer = new Renderer(el<HTMLCanvasElement>('world'));
const audio = new AudioDirector();
let hasStarted = false;
let modal: 'title' | 'briefing' | 'pause' | 'journal' | 'dead' | 'complete' | 'reveal' | null =
  'title';
let pausedByVisibility = false;
let muted = false;
let showHints = true;
let loading = true;
let lastUI = 0,
  lastSave = 0,
  lastStep = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let lastPhase = game.state.phase;
let touch = { x: 0, y: 0 };
let mouse = { x: 900, y: 500, down: false, right: false, known: false };
const keys = new Set<string>();
const input: InputState = { x: 0, y: 0, running: false, aim: { x: 895, y: 525 } };
let saveAvailable = false;

try {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  muted = !!settings.muted;
  showHints = settings.showHints !== false;
  const save = localStorage.getItem(SAVE_KEY);
  if (save) {
    Game.restore(save);
    saveAvailable = true;
  }
} catch {
  /* Invalid or unavailable local data never blocks the game. */
}
audio.setMuted(muted);
updateAudioButton();

renderer.ready
  .then(() => {
    loading = false;
    el('load-screen').classList.add('hidden');
    showTitle();
  })
  .catch((error) => {
    el('load-screen').innerHTML =
      `<h1>The world could not load.</h1><p>Refresh to reconnect to the local game files.</p><button class="primary" id="reload">Try again</button>`;
    el('reload').onclick = () => location.reload();
    console.error(error);
  });

function save() {
  if (!hasStarted) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize()));
    saveAvailable = true;
    el('save-indicator').textContent = 'Progress saved locally';
  } catch {
    el('save-indicator').textContent = 'Storage unavailable — keep this tab open';
  }
}
function settings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted, showHints }));
  } catch {
    /* optional */
  }
}
function updateAudioButton() {
  const b = el('audio-button');
  b.innerHTML = icon(muted ? 'muted' : 'audio');
  b.setAttribute('aria-label', muted ? 'Enable audio' : 'Mute audio');
  b.setAttribute('aria-pressed', String(muted));
}
function toggleAudio() {
  muted = !muted;
  audio.setMuted(muted);
  if (!muted && !modal) void audio.start(game.state.seed);
  settings();
  updateAudioButton();
}
function openModal(kind: NonNullable<typeof modal>, html: string) {
  modal = kind;
  keys.clear();
  mouse.down = false;
  mouse.right = false;
  touch = { x: 0, y: 0 };
  const layer = el('modal-layer');
  layer.innerHTML = html;
  layer.classList.add('visible');
  audio.pause(true);
  el('hud').classList.toggle('dimmed', hasStarted);
  el('world').setAttribute('aria-hidden', 'true');
  el('world').inert = true;
  el('hud').inert = true;
  requestAnimationFrame(() => {
    (layer.querySelector('[autofocus],input,button') as HTMLElement)?.focus();
  });
}
function closeModal() {
  modal = null;
  el('modal-layer').classList.remove('visible');
  el('modal-layer').innerHTML = '';
  el('hud').classList.remove('dimmed');
  el('world').removeAttribute('aria-hidden');
  el('world').inert = false;
  el('hud').inert = false;
  audio.pause(false);
  keys.clear();
  el('world').focus();
}
function terminalTop(label: string, close = false) {
  return `<div class="terminal-top"><span><i></i> ${label}</span>${close ? `<button class="plain-icon modal-close" aria-label="Close dialog">${icon('close')}</button>` : '<span class="terminal-code">VRS / 09.71</span>'}</div>`;
}
function bindClose() {
  document
    .querySelectorAll('.modal-close')
    .forEach((b) => ((b as HTMLButtonElement).onclick = closeModal));
}

function showTitle() {
  hasStarted = false;
  el('hud').classList.add('hidden');
  openModal(
    'title',
    `<div class="title-screen"><section class="title-panel" role="dialog" aria-modal="true" aria-labelledby="title-heading">
    <div class="title-emblem">${icon('diamond')}</div><h1 id="title-heading" aria-label="Verso">${logo}</h1><p class="title-subtitle">A game about multiverse,<br>species and selfishness.</p>
    <form id="start-form"><label for="operative-name">Before you borrow a life,<br>tell us your name.</label><div class="name-field"><span>&gt;</span><input id="operative-name" name="operative-name" placeholder="Your name" maxlength="22" autocomplete="off" spellcheck="false" required value="${escape(game.state.name === 'TRAVELER' ? '' : game.state.name)}" aria-label="Your name" /></div>
    <details class="seed-options"><summary>Choose a world seed</summary><label for="world-seed">Same seed, same starting conditions.</label><input id="world-seed" maxlength="64" value="0x71A3" autocomplete="off" spellcheck="false" aria-label="World seed" /></details>
    <button class="primary" type="submit">Enter the rift <span>↗</span></button></form>
    ${saveAvailable ? '<button id="continue-button" class="secondary">Continue your assignment</button>' : ''}
    <div class="title-footer"><span>Single player adventure</span><button id="title-audio" class="text-button">Sound ${muted ? 'off' : 'on'}</button></div>
  </section><div class="title-world-caption"><i></i><span>A possible world is waiting.</span><small>Headphones recommended</small></div></div>`,
  );
  el<HTMLFormElement>('start-form').onsubmit = (e) => {
    e.preventDefault();
    const name = el<HTMLInputElement>('operative-name').value.trim();
    if (!name) {
      el<HTMLInputElement>('operative-name').focus();
      return;
    }
    const seed = parseSeed(el<HTMLInputElement>('world-seed').value);
    void audio.start(seed);
    audio.play('click');
    game.newRun(name, seed);
    hasStarted = true;
    lastPhase = game.state.phase;
    showBriefing();
    save();
  };
  el('title-audio').onclick = () => {
    toggleAudio();
    el('title-audio').textContent = `Sound ${muted ? 'off' : 'on'}`;
  };
  if (saveAvailable)
    el('continue-button').onclick = () => {
      try {
        game = Game.restore(localStorage.getItem(SAVE_KEY)!);
        hasStarted = true;
        lastPhase = game.state.phase;
        void audio.start(game.state.seed);
        audio.setWorld(game.state.mission, game.state.worldSeed);
        closeModal();
        el('hud').classList.remove('hidden');
        el('tutorial').classList.toggle('hidden', !showHints || game.state.mission > 0);
        updateUI();
        handlePhase(true);
        notify(`Link restored. Welcome back, ${game.state.name}.`);
      } catch {
        saveAvailable = false;
        notify('That save could not be restored. Start a new assignment.');
        showTitle();
      }
    };
}

const briefings = [
  {
    tag: 'Survey / minimal intervention',
    title: 'Leave only a trace.',
    body: 'Your first assignment is simple. Borrow this vessel. Catalog three native species. Return through the rift.',
    detail: 'The world was here before you. Try to leave it that way.',
    world: 'The quiet verge',
    weather: 'Gentle wind / twilight',
    bodyName: 'Cartographer / healthy',
  },
  {
    tag: 'Adjustment / restricted access',
    title: 'A very small change.',
    body: 'Three dormant relays keep this branch of reality in balance. Synchronize them in their original order: Moss, Ember, Tide.',
    detail: 'The instruction says “original.” The archive says they have never been touched.',
    world: 'The violet archive',
    weather: 'Ion mist / no recorded date',
    bodyName: 'Field technician / healthy',
  },
  {
    tag: 'Retrieval / living asset',
    title: 'Bring back the witness.',
    body: 'An archivist is stranded near the eastern ruins. Find them, establish a link, and escort them to the rift.',
    detail: 'They have been classified as an asset. They still remember being a person.',
    world: 'The last witness',
    weather: 'Cold front / temporal drift',
    bodyName: 'Recovery agent / healthy',
  },
];
function showBriefing() {
  const index = game.state.mission % 3,
    b = briefings[index];
  openModal(
    'briefing',
    `<section class="terminal briefing" role="dialog" aria-modal="true" aria-labelledby="brief-title">${terminalTop('V E R S O   /   Assignment uplink')}
    <div class="terminal-body"><div class="transmission"><span class="status-dot"></span> ${escape(game.state.name)}, your vessel is ready.</div><p class="assignment-index">Assignment ${String(game.state.mission + 1).padStart(3, '0')} <span>${b.tag}</span></p><h1 id="brief-title">${b.title}</h1><p class="brief-body">${b.body}</p>
    <dl class="brief-data"><div><dt>Destination</dt><dd>${b.world}</dd></div><div><dt>Conditions</dt><dd>${b.weather}</dd></div><div><dt>Vessel</dt><dd>${b.bodyName}</dd></div><div><dt>Armament</dt><dd>${escape(game.state.weapon.name)}</dd></div></dl>
    <p class="whisper">${b.detail}</p><button id="deploy-button" class="primary">Inhabit vessel <span>↗</span></button><p class="brief-hint">WASD to move · E to interact · Esc to pause</p></div></section>`,
  );
  el('deploy-button').onclick = () => {
    audio.pause(false);
    void audio.start(game.state.seed);
    audio.setWorld(game.state.mission, game.state.worldSeed);
    audio.play('portal');
    closeModal();
    el('hud').classList.remove('hidden');
    el('tutorial').classList.toggle('hidden', !showHints || game.state.mission > 0);
    el('transition').classList.add('flash');
    setTimeout(() => el('transition').classList.remove('flash'), 800);
    updateUI();
    save();
    if (game.state.mission === 0)
      notify(`Link established. Welcome to the verge, ${game.state.name}.`);
    else notify(b.detail, 6500);
  };
}

function showPause() {
  if (!hasStarted || game.state.phase !== 'playing') return;
  save();
  openModal(
    'pause',
    `<section class="terminal pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">${terminalTop('Link on hold', true)}<div class="terminal-body"><h1 id="pause-title">Between moments.</h1><p>This world will wait for you.</p><div class="pause-actions"><button id="resume" class="primary">Return to your vessel</button><button id="open-journal" class="secondary">Field journal <kbd>J</kbd></button><button id="save-export" class="secondary">Download save</button><button id="import-open" class="secondary">Restore a save</button><input type="file" id="save-import" accept="application/json,.json" hidden/><button id="copy-seed" class="secondary">Copy starting seed</button><button id="return-title" class="text-button">Save and return to title</button></div><div class="control-reference"><span><kbd>WASD</kbd> Move</span><span><kbd>Shift</kbd> Run</span><span><kbd>LMB</kbd> Blade</span><span><kbd>RMB</kbd> Pulse</span><span><kbd>Space</kbd> Dash</span><span><kbd>E</kbd> Interact</span><span><kbd>Q</kbd> Mend</span><span><kbd>M</kbd> Audio</span></div><p class="small-note">Progress saves automatically in this browser.</p></div></section>`,
  );
  bindClose();
  el('resume').onclick = closeModal;
  el('open-journal').onclick = showJournal;
  el('copy-seed').onclick = async () => {
    const seed = formatSeed(game.state.seed);
    try {
      await navigator.clipboard.writeText(seed);
      notify(`Starting seed ${seed} copied. Choices still shape later worlds.`);
    } catch {
      notify(`Starting seed: ${seed}`);
    }
  };
  el('return-title').onclick = () => {
    save();
    showTitle();
  };
  el('save-export').onclick = () => {
    const blob = new Blob([JSON.stringify(game.serialize(), null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `verso-${game.state.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify('Save downloaded. Your borrowed lives travel with you.');
  };
  el('import-open').onclick = () => el<HTMLInputElement>('save-import').click();
  el<HTMLInputElement>('save-import').onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('too large');
      const restored = Game.restore(await file.text());
      game = restored;
      lastPhase = game.state.phase;
      save();
      closeModal();
      handlePhase(true);
      audio.setWorld(game.state.mission, game.state.worldSeed);
      notify('Save restored. Your link is stable.');
      updateUI();
    } catch {
      notify('This file is not a valid Verso save. Your current progress is safe.');
    }
  };
}

function returnFromJournal() {
  if (game.state.phase === 'dead') showDeath();
  else if (game.state.phase === 'complete') showComplete();
  else if (game.state.phase === 'reveal') showReveal();
  else closeModal();
}

const speciesLore: Record<string, { name: string; latin: string; text: string }> = {
  mushroom: {
    name: 'Lumen cap',
    latin: 'Mycena memoris',
    text: 'Stores warmth from suns that no longer exist. Its rings record years this world has not lived.',
  },
  crystal: {
    name: 'Glass fern',
    latin: 'Flora resonans',
    text: 'Each crystalline leaf vibrates at a different possible future. Picking one silences that future.',
  },
  deer: {
    name: 'Prism stag',
    latin: 'Cervus interstitialis',
    text: 'A gentle herbivore visible in two realities at once. It watches you with the same recognition in both.',
  },
};
function speciesType(subtype: string) {
  const v = subtype.toLowerCase();
  return v.includes('deer') || v.includes('hart')
    ? 'deer'
    : v.includes('crystal') || v.includes('bloom')
      ? 'crystal'
      : 'mushroom';
}
function showJournal() {
  if (!hasStarted) return;
  const s = game.state,
    obj = game.getObjective();
  openModal(
    'journal',
    `<section class="terminal journal-panel" role="dialog" aria-modal="true" aria-labelledby="journal-title">${terminalTop('Personal field record', true)}<div class="terminal-body"><div class="journal-heading"><h1 id="journal-title">Field journal</h1><span>${escape(s.name)} / Vessel ${String(s.player.vessel).padStart(2, '0')}</span></div><div class="journal-columns"><div><h2>Current assignment</h2><p class="journal-objective">${escape(obj.title)}</p><p>${escape(obj.description)}</p><ul class="journal-tasks">${obj.tasks.map((t) => `<li class="${t.done ? 'done' : ''}"><span>${t.done ? '✓' : '◇'}</span>${escape(t.label)} ${t.progress ? `<small>${escape(t.progress)}</small>` : ''}</li>`).join('')}</ul><h2>Your footprint</h2><div class="journal-stats"><div><strong>${Math.round(s.integrity)}%</strong><span>world integrity</span></div><div><strong>${s.kills}</strong><span>lives ended</span></div><div><strong>${s.player.vessel - 1}</strong><span>vessels lost</span></div></div><div class="vessel-kit"><h2>Vessel equipment</h2><p class="weapon-name">${escape(s.weapon.name)}</p><div class="weapon-stats"><span>Blade <b>${s.weapon.bladeDamage}</b></span><span>Pulse <b>${s.weapon.pulseDamage}</b></span><span>Recovery <b>${s.weapon.bladeCooldown.toFixed(2)}s</b></span><span>Reach <b>${s.weapon.pulseRange < 740 ? 'Short' : s.weapon.pulseRange > 820 ? 'Long' : 'Standard'}</b></span></div><p class="weapon-note">This kit belongs to this world. Your next crossing may issue another.</p></div><p class="journal-note">Every intervention leaves a record. Scan gently. Defend yourself when needed. The company is measuring more than your success.</p>${s.mission > 0 ? `<h2>Recovered transmission</h2><blockquote>${s.mission > 1 ? '“Why do your instructions call me an asset?”' : '“This adjustment was purchased before this world existed.”'}</blockquote>` : ''}</div><div><h2>Native species <span>${s.catalog.length} / 3</span></h2><div class="species-list">${Object.entries(
      speciesLore,
    )
      .map(([key, v]) => {
        const found = s.entities.some(
          (e) =>
            e.kind === 'species' && speciesType(e.subtype || e.name || '') === key && e.scanned,
        );
        return `<article class="species-entry ${found ? 'cataloged' : ''}"><span class="species-glyph">${key === 'deer' ? '♧' : key === 'crystal' ? '✧' : '♠'}</span><div><h3>${found ? v.name : 'Uncataloged lifeform'}</h3><small>${found ? v.latin : 'Approach and scan to discover'}</small>${found ? `<p>${v.text}</p>` : ''}</div></article>`;
      })
      .join(
        '',
      )}</div><h2>Assignment history</h2>${s.history.length ? `<ol class="history-list">${s.history.map((h) => `<li><span>${String(h.mission + 1).padStart(3, '0')}</span><div>${escape(h.title)}<small>Integrity ${h.integrity}% · ${h.kills} lives ended</small></div></li>`).join('')}</ol>` : '<p class="muted">Your first return is still ahead of you.</p>'}</div></div><button id="journal-return" class="primary">Return to the world</button></div></section>`,
  );
  document
    .querySelectorAll('.modal-close')
    .forEach((b) => ((b as HTMLButtonElement).onclick = returnFromJournal));
  el('journal-return').onclick = returnFromJournal;
}

function showDeath() {
  openModal(
    'dead',
    `<section class="terminal death-panel" role="dialog" aria-modal="true" aria-labelledby="death-title">${terminalTop('Vessel connection lost')}<div class="terminal-body"><span class="death-sigil">${icon('diamond')}</span><h1 id="death-title">That life has ended.<br>Yours has not.</h1><p>The vessel is gone. Your memories and assignment remain. A new host can recover the fragments you left behind.</p><p class="whisper">Someone else pays for your second chance.</p><button id="reincarnate" class="primary">Inhabit another vessel</button><button id="death-title-button" class="text-button">Save and return to title</button></div></section>`,
  );
  el('reincarnate').onclick = () => {
    game.reincarnate();
    lastPhase = game.state.phase;
    closeModal();
    audio.play('portal');
    save();
    updateUI();
    notify('New link established. Recover your belongings at the amber marker.');
  };
  el('death-title-button').onclick = () => {
    save();
    showTitle();
  };
}
function showComplete() {
  const s = game.state,
    d = game.getDebrief();
  openModal(
    'complete',
    `<section class="terminal complete-panel" role="dialog" aria-modal="true" aria-labelledby="complete-title">${terminalTop('Assignment returned')}<div class="terminal-body"><div class="complete-sigil">${icon('diamond')}</div><p class="assignment-index">Assignment ${String(s.mission + 1).padStart(3, '0')} complete</p><h1 id="complete-title">${escape(d.rating)}</h1><p>${escape(d.summary)}</p><div class="debrief-stats"><div><strong>${Math.round(s.integrity)}%</strong><span>World integrity</span></div><div><strong>${s.missionStats.kills}</strong><span>Lives ended</span></div><div><strong>${formatTime(s.levelTime)}</strong><span>Time in vessel</span></div></div><p class="whisper">${escape(d.footprint === 0 ? 'No measurable disturbance. This world still belongs to itself.' : `${d.footprint}% world disturbance recorded. Every action changes what comes next.`)}</p><button id="next-assignment" class="primary">Receive next assignment <span>↗</span></button><button id="complete-journal" class="text-button">Review field journal</button></div></section>`,
  );
  el('next-assignment').onclick = () => {
    game.nextMission();
    lastPhase = game.state.phase;
    save();
    showBriefing();
  };
  el('complete-journal').onclick = () => {
    showJournal();
    el('journal-return').textContent = 'Return to debrief';
    el('journal-return').onclick = showComplete;
    document
      .querySelectorAll('.modal-close')
      .forEach((b) => ((b as HTMLButtonElement).onclick = showComplete));
  };
}
function showReveal() {
  const s = game.state;
  openModal(
    'reveal',
    `<section class="terminal reveal-panel" role="dialog" aria-modal="true" aria-labelledby="reveal-title">${terminalTop('Unredacted / internal communication')}<div class="terminal-body"><p class="assignment-index">Three assignments. One employer.</p><h1 id="reveal-title">You were never<br>an explorer.</h1><p>You are a multiverse engineer. The worlds were real. So were the lives you borrowed.</p><p>The company auctions small changes in reality to the highest bidder. Your observations priced the world. Your adjustment prepared it. The witness knew.</p><blockquote>“They don’t pay you to save a world.<br>They pay you to make it theirs.”</blockquote><p class="whisper">${escape(s.name)}, what happens next is yours to decide.</p><div class="reveal-choices"><button id="endless" class="primary">Keep the link. Change the terms.</button><button id="walk-away" class="secondary">Archive the evidence. Walk away.</button></div><p class="small-note">Continue into seeded expeditions, or end this chapter with your record intact.</p></div></section>`,
  );
  el('endless').onclick = () => {
    game.nextMission();
    lastPhase = game.state.phase;
    save();
    showBriefing();
  };
  el('walk-away').onclick = () => {
    save();
    showEpilogue();
  };
}
function showEpilogue() {
  openModal(
    'reveal',
    `<section class="terminal epilogue" role="dialog" aria-modal="true" aria-labelledby="epilogue-title">${terminalTop('Personal archive / sealed')}<div class="terminal-body"><div class="complete-sigil">${icon('diamond')}</div><h1 id="epilogue-title">Some worlds should<br>be left alone.</h1><p>The evidence is yours. So is the choice to stop.</p><p class="whisper">Your field record is saved. You can return to the link whenever you choose.</p><button id="epilogue-journal" class="primary">Read your field record</button><button id="epilogue-title-button" class="secondary">Return to title</button></div></section>`,
  );
  el('epilogue-title-button').onclick = showTitle;
  el('epilogue-journal').onclick = () => {
    showJournal();
    el('journal-return').onclick = showEpilogue;
    document
      .querySelectorAll('.modal-close')
      .forEach((b) => ((b as HTMLButtonElement).onclick = showEpilogue));
  };
}
function formatTime(time: number) {
  return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}
function notify(text: string, duration = 4300) {
  if (noticeTimer) clearTimeout(noticeTimer);
  el('notification').textContent = text;
  el('notification').classList.remove('hidden');
  noticeTimer = setTimeout(() => el('notification').classList.add('hidden'), duration);
}
function handlePhase(force = false) {
  if (game.state.phase === lastPhase && !force) return;
  lastPhase = game.state.phase;
  save();
  if (game.state.phase === 'dead') showDeath();
  else if (game.state.phase === 'complete') showComplete();
  else if (game.state.phase === 'reveal') showReveal();
}
function processEvents() {
  for (const e of game.drainEvents()) {
    const effect =
      (
        {
          damage: 'hurt',
          mend: 'heal',
          kill: 'enemy-death',
          collect: 'scanned',
          rescue: 'scanned',
          scan: 'scanned',
        } as Record<string, string>
      )[e.type] || e.type;
    audio.play(effect);
    renderer.emit(effect, e.x, e.y, e.value);
    if (e.text && !['damage', 'step', 'blade', 'pulse'].includes(e.type)) notify(e.text);
    if (
      [
        'scan',
        'relay',
        'complete',
        'death',
        'reincarnate',
        'collect',
        'rescue',
        'mend',
        'reveal',
      ].includes(e.type)
    )
      save();
  }
}
function perform(kind: ActionKind) {
  if (modal || !hasStarted) return;
  if (kind === 'scan') {
    const interaction = game.getInteraction();
    if (interaction) game.interact();
    else game.action('scan');
  } else game.action(kind, kind === 'dash' ? undefined : input.aim);
  processEvents();
  updateUI();
  handlePhase();
}
function updateUI() {
  const s = game.state,
    p = s.player,
    obj = game.getObjective();
  el('world-name').textContent = WORLD_NAMES[s.mission % 3];
  el('assignment-number').textContent = `Assignment ${String(s.mission + 1).padStart(3, '0')}`;
  el('objective-title').textContent = briefings[s.mission % 3].title;
  const hudTasks =
    s.mission % 3 === 0
      ? [
          {
            label: 'Catalog native species',
            done: s.catalog.length === 3,
            progress: `${s.catalog.length} / 3`,
          },
          { label: 'Return to the rift', done: s.phase === 'complete', progress: undefined },
        ]
      : obj.tasks;
  const tasks = hudTasks
    .map(
      (t) =>
        `<div class="task ${t.done ? 'done' : ''}"><i>${t.done ? '✓' : ''}</i><span>${escape(t.label)}</span>${t.progress ? `<b>${escape(t.progress)}</b>` : ''}</div>`,
    )
    .join('');
  if (el('objective-tasks').innerHTML !== tasks) el('objective-tasks').innerHTML = tasks;
  el('integrity-fill').style.width = `${s.integrity}%`;
  el('integrity-label').textContent = `World integrity ${Math.round(s.integrity)}%`;
  el('vessel-label').textContent = `Vessel ${String(p.vessel).padStart(2, '0')}`;
  el('vitals')?.classList.toggle('damaged', p.hp < p.maxHp);
  el('health-number').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  el('health-fill').style.width = `${(p.hp / p.maxHp) * 100}%`;
  el('stamina-fill').style.width = `${(p.stamina / p.maxStamina) * 100}%`;
  el('health-meter').setAttribute('aria-valuenow', String(Math.round(p.hp)));
  el('stamina-meter').setAttribute('aria-valuenow', String(Math.round(p.stamina)));
  el('hearts')
    .querySelectorAll('i')
    .forEach((h, i) => h.classList.toggle('empty', p.hp <= (i * p.maxHp) / 3));
  el('fragments').textContent = `${p.fragments} fragment${p.fragments === 1 ? '' : 's'}`;
  el('seed-label').textContent =
    `${['VERGE', 'ARCHIVE', 'WITNESS'][s.mission % 3]} / SEED 0x${s.worldSeed.toString(16).toUpperCase()}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    const kind = button.dataset.action as ActionKind;
    const duration = {
      blade: s.weapon.bladeCooldown,
      pulse: s.weapon.pulseCooldown,
      dash: 0.8,
      scan: 0.55,
      mend: 2.5,
    }[kind];
    if (kind === 'blade')
      button.title = `${s.weapon.name} · ${s.weapon.bladeDamage} damage · ${s.weapon.bladeCooldown.toFixed(2)}s recovery`;
    if (kind === 'pulse')
      button.title = `Pulse · ${s.weapon.pulseDamage} damage · ${s.weapon.pulseRange < 740 ? 'short' : s.weapon.pulseRange > 820 ? 'long' : 'standard'} reach`;
    const cd = p.cooldowns[kind];
    button.classList.toggle('on-cooldown', cd > 0);
    button.style.setProperty('--cooldown', String(Math.min(1, cd / duration)));
    button.classList.toggle('depleted', kind === 'mend' && p.fragments === 0);
  }
  const interaction = game.getInteraction();
  el('interaction').classList.toggle('hidden', !interaction || !!modal);
  if (interaction) {
    const point = renderer.toScreen({ x: s.player.x, y: s.player.y + 34 });
    el('interaction').style.left = `${point.x}px`;
    el('interaction').style.top = `${point.y}px`;
    el('interaction').querySelector('span')!.textContent = interaction.label;
  }
  drawMinimap();
}
function drawMinimap() {
  const c = el<HTMLCanvasElement>('minimap').getContext('2d')!;
  c.clearRect(0, 0, 170, 130);
  const tx = (x: number) => 16 + (x - 220) * 0.119,
    ty = (y: number) => 12 + (y - 280) * 0.22;
  c.fillStyle = '#637a4155';
  c.beginPath();
  WALKABLE.forEach((p, i) => (i ? c.lineTo(tx(p.x), ty(p.y)) : c.moveTo(tx(p.x), ty(p.y))));
  c.closePath();
  c.fill();
  c.save();
  c.clip();
  for (let i = 0; i < 530; i++) {
    const x = 16 + ((i * 43) % 142),
      y = 10 + ((i * 29) % 108);
    c.fillStyle = ['#7d8e4b80', '#a6a66a60', '#375445', '#203e3f', '#18323a'][i % 5];
    c.fillRect(x, y, 3 + (i % 3), 3 + (i % 2));
  }
  c.strokeStyle = '#adbd8840';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(tx(570), ty(710));
  c.lineTo(tx(800), ty(550));
  c.lineTo(tx(1030), ty(365));
  c.stroke();
  c.strokeStyle = '#061f2bbb';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(tx(840), ty(750));
  c.lineTo(tx(810), ty(660));
  c.stroke();
  c.restore();
  for (const e of game.state.entities) {
    if (e.kind === 'enemy' && (e.hp || 0) <= 0) continue;
    c.fillStyle =
      e.kind === 'enemy'
        ? '#d67a5c'
        : e.kind === 'portal'
          ? '#71e2e2'
          : (e.kind === 'species' ? e.scanned : e.active)
            ? '#9cb59a'
            : '#edb758';
    const r = e.kind === 'enemy' ? 2 : e.kind === 'portal' ? 3 : 3.5;
    c.beginPath();
    c.arc(tx(e.x), ty(e.y), r, 0, Math.PI * 2);
    c.fill();
  }
  const p = game.state.player,
    x = tx(p.x),
    y = ty(p.y);
  c.fillStyle = '#a8fffa';
  c.beginPath();
  c.moveTo(x, y - 5);
  c.lineTo(x + 4, y);
  c.lineTo(x, y + 5);
  c.lineTo(x - 4, y);
  c.closePath();
  c.fill();
}

el('pause-button').onclick = showPause;
el('audio-button').onclick = toggleAudio;
el('journal-link').onclick = showJournal;
el('fullscreen-button').onclick = () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else
    void el('app')
      .requestFullscreen()
      .catch(() => notify('Fullscreen is not available in this browser.'));
};
el('dismiss-tutorial').onclick = () => {
  showHints = false;
  el('tutorial').classList.add('hidden');
  settings();
};
document
  .querySelectorAll<HTMLButtonElement>('[data-action]')
  .forEach((b) => (b.onclick = () => perform(b.dataset.action as ActionKind)));
el('touch-interact').onclick = () => perform('scan');

window.addEventListener('keydown', (e) => {
  if (loading) return;
  const target = e.target as HTMLElement;
  const key = e.key.toLowerCase();
  if (key === 'tab' && modal) {
    const focusable = Array.from(
      el('modal-layer').querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([hidden]),[tabindex="0"]',
      ),
    );
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  if (target.tagName === 'BUTTON' && (key === ' ' || key === 'enter')) return;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
  if (e.repeat) {
    if (!modal) keys.add(key);
    return;
  }
  if (key === 'm') {
    toggleAudio();
    return;
  }
  if (key === 'escape') {
    e.preventDefault();
    if (modal === 'pause' || modal === 'journal') {
      returnFromJournal();
    } else if (!modal) showPause();
    return;
  }
  if (key === 'j' && hasStarted) {
    if (modal === 'journal') {
      returnFromJournal();
    } else if (modal !== 'title' && modal !== 'briefing') showJournal();
    return;
  }
  if (modal) return;
  keys.add(key);
  if (key === 'e') perform('scan');
  if (key === 'q') perform('mend');
  if (key === ' ') perform('dash');
  if (key === 'f') perform('blade');
  if (key === 'r') perform('pulse');
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  keys.clear();
  mouse.down = false;
  mouse.right = false;
  touch = { x: 0, y: 0 };
  if (hasStarted && !modal) showPause();
});
document.addEventListener('visibilitychange', () => {
  pausedByVisibility = document.hidden;
  if (document.hidden) {
    save();
    keys.clear();
    mouse.down = false;
    mouse.right = false;
    if (hasStarted && !modal) showPause();
  }
  audio.pause(pausedByVisibility || !!modal);
});
window.addEventListener('beforeunload', save);
window.addEventListener('resize', () => {
  renderer.resize();
  updateUI();
});
const canvas = el<HTMLCanvasElement>('world');
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', (e) => {
  const p = renderer.toWorld(e.clientX, e.clientY);
  mouse.x = p.x;
  mouse.y = p.y;
  mouse.known = true;
});
canvas.addEventListener('pointerdown', (e) => {
  if (modal) return;
  canvas.focus();
  const p = renderer.toWorld(e.clientX, e.clientY);
  mouse.x = p.x;
  mouse.y = p.y;
  mouse.known = true;
  input.aim = p;
  if (e.pointerType === 'touch') return;
  if (e.button === 0) {
    mouse.down = true;
    perform('blade');
  } else if (e.button === 2) {
    mouse.right = true;
    perform('pulse');
  }
});
window.addEventListener('pointerup', () => {
  mouse.down = false;
  mouse.right = false;
});
const joystick = el('joystick');
let joystickPointer: number | null = null;
function updateJoystick(e: PointerEvent) {
  const r = joystick.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / 35,
    y = (e.clientY - r.top - r.height / 2) / 35;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  touch = { x, y };
  el('joystick-thumb').style.transform = `translate(${x * 29}px,${y * 29}px)`;
}
joystick.onpointerdown = (e) => {
  e.preventDefault();
  joystickPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  updateJoystick(e);
};
joystick.onpointermove = (e) => {
  if (joystickPointer === e.pointerId) updateJoystick(e);
};
function releaseJoystick() {
  joystickPointer = null;
  touch = { x: 0, y: 0 };
  el('joystick-thumb').style.transform = '';
}
joystick.onpointerup = releaseJoystick;
joystick.onpointercancel = releaseJoystick;

let last = performance.now();
function frame(now: number) {
  const elapsed = (now - last) / 1000;
  const dt = Math.min(elapsed, 0.05);
  last = now;
  const paused = !!modal || pausedByVisibility || !hasStarted;
  if (!paused) {
    input.x = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + touch.x;
    input.y = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0) + touch.y;
    input.running = keys.has('shift');
    const arrowX = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0),
      arrowY = (keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') ? 1 : 0);
    if (arrowX || arrowY) {
      input.aim = { x: game.state.player.x + arrowX * 300, y: game.state.player.y + arrowY * 180 };
      game.action('pulse', input.aim);
    } else if (mouse.known) input.aim = { x: mouse.x, y: mouse.y };
    else if (input.x || input.y)
      input.aim = {
        x: game.state.player.x + input.x * 200,
        y: game.state.player.y + input.y * 120,
      };
    else
      input.aim = {
        x: game.state.player.x + game.state.player.facing.x * 200,
        y: game.state.player.y + game.state.player.facing.y * 120,
      };
    if (mouse.down) game.action('blade', input.aim);
    if (mouse.right) game.action('pulse', input.aim);
    game.update(dt, input);
    processEvents();
    handlePhase();
    if ((input.x || input.y) && now - lastStep > (input.running ? 220 : 340)) {
      audio.play('step');
      lastStep = now;
    }
    const nearestEnemy = Math.min(
      ...game.state.entities
        .filter((e) => e.kind === 'enemy' && (e.hp || 0) > 0)
        .map((e) => distance(e, game.state.player)),
      1000,
    );
    audio.setIntensity(Math.max(0, 1 - nearestEnemy / 340));
    if (now - lastSave > 5000) {
      save();
      lastSave = now;
    }
  }
  renderer.draw(game, elapsed, paused && hasStarted);
  if (hasStarted && now - lastUI > 100) {
    updateUI();
    lastUI = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only diagnostics are useful for browser smoke tests and field bug reports.
Object.defineProperty(window, 'verso', {
  value: {
    get state() {
      return structuredClone(game.state);
    },
    get fps() {
      return Math.round(renderer.fps);
    },
    get modal() {
      return modal;
    },
    get loaded() {
      return renderer.loaded;
    },
    worldToScreen: (p: { x: number; y: number }) => renderer.toScreen(p),
    exportSave: () => game.serialize(),
  },
  writable: false,
});
