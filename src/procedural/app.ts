import './style.css';
import { Crossing, distance } from './session';
import type { Actor } from './session';
import { tileAt } from './world';
import { sampleMotion } from './motion';
import { drawSpecies, drawWeapon } from './draw';
import { random, deriveSeed, clamp } from './random';
import { parseSeed, formatSeed } from '../seed';
import { AudioDirector } from '../audio';
import { registerOffline } from '../offline';
import type { V3 } from './schema';

void registerOffline();
const app = document.getElementById('app')!;
app.innerHTML = `<main class="p-shell"><canvas id="p-world" aria-label="A generated isometric world" tabindex="0"></canvas>
<header class="p-header"><div><a href="?" class="p-brand">◇ VERSO</a><span id="p-world-name"></span></div><div class="p-header-actions"><button id="p-pause" aria-label="Pause">Ⅱ</button><button id="p-sound" aria-label="Sound">♪</button><button id="p-journal">Field record <kbd>J</kbd></button></div></header>
<aside class="p-assignment"><span class="p-eyebrow" id="p-assignment-index"></span><h1 id="p-objective"></h1><p id="p-condition"></p><div class="p-progress"><i id="p-progress-fill"></i></div><span id="p-progress-label"></span><p class="p-integrity" id="p-integrity"></p></aside>
<aside class="p-laws"><canvas id="p-map" width="180" height="130" aria-label="Map of this crossing"></canvas><span id="p-seed"></span><small id="p-laws"></small></aside>
<div class="p-vitals"><span id="p-vessel"></span><strong id="p-host-name"></strong><div class="p-health"><i id="p-health-fill"></i></div><small id="p-health-label"></small><span id="p-memory"></span></div>
<div class="p-weapon"><canvas id="p-weapon-art" width="88" height="88"></canvas><div><strong id="p-weapon-name"></strong><small id="p-weapon-desc"></small></div></div>
<nav class="p-controls"><button data-command="attack"><kbd>F / LMB</kbd><span>Use weapon</span></button><button data-command="jump"><kbd>Space</kbd><span>Jump</span></button><button data-command="interact"><kbd>E</kbd><span>Read / interact</span></button><button data-command="heal"><kbd>Q</kbd><span>Mend</span></button></nav>
<div id="p-prompt" class="p-prompt"></div><div id="p-message" class="p-message" role="status" aria-live="polite"></div>
<div class="p-movement"><button data-move="w" aria-label="Move up">↑</button><button data-move="a" aria-label="Move left">←</button><button data-move="s" aria-label="Move down">↓</button><button data-move="d" aria-label="Move right">→</button></div>
<div id="p-modal" class="p-modal"></div></main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('p-world'),
  ctx = canvas.getContext('2d', { alpha: false })!;
const audio = new AudioDirector();
let run = new Crossing(0x71a3),
  name = 'Traveler',
  paused = true,
  journal = false,
  started = false,
  muted = false;
let width = innerWidth,
  height = innerHeight,
  unit = 30,
  camera = { x: run.player.position.x, y: run.player.position.y, z: run.player.position.z };
let keys = new Set<string>(),
  mouse = { x: 0, y: 0, known: false, down: false },
  last = performance.now(),
  lastUI = 0,
  lastSave = 0,
  lastPhase = run.phase,
  frames = 0,
  frameSeconds = 0,
  fps = 60;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const saveKey = 'verso.procedural.v1';
let stored: string | null = null;
try {
  stored = localStorage.getItem(saveKey);
} catch {}
function resize() {
  width = innerWidth;
  height = innerHeight;
  const d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * d;
  canvas.height = height * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.imageSmoothingEnabled = false;
  unit = clamp(Math.min(width / 38, height / 23), 20, 38);
}
addEventListener('resize', resize);
resize();
function project(p: V3) {
  return {
    x: width * 0.5 + (p.x - camera.x - p.z + camera.z) * unit,
    y:
      height * 0.53 +
      (p.x - camera.x + p.z - camera.z) * unit * 0.5 -
      (p.y - camera.y) * unit * 1.25,
  };
}
function polygon(points: { x: number; y: number }[], fill: string, stroke?: string) {
  ctx.beginPath();
  points.forEach((p, i) =>
    i ? ctx.lineTo(Math.round(p.x), Math.round(p.y)) : ctx.moveTo(Math.round(p.x), Math.round(p.y)),
  );
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function box(x: number, z: number, y: number, sx: number, sz: number, tall: number, color: string) {
  const a = project({ x: x - sx, y: y + tall, z: z - sz }),
    b = project({ x: x + sx, y: y + tall, z: z - sz }),
    c = project({ x: x + sx, y: y + tall, z: z + sz }),
    d = project({ x: x - sx, y: y + tall, z: z + sz });
  const e = project({ x: x + sx, y, z: z + sz }),
    f = project({ x: x - sx, y, z: z + sz }),
    g = project({ x: x + sx, y, z: z - sz });
  polygon([b, c, e, g], color);
  polygon([d, c, e, f], color);
  ctx.fillStyle = '#00182350';
  ctx.beginPath();
  [d, c, e, f].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.fill();
  polygon([a, b, c, d], color, '#a2cdc72b');
}
function drawTerrain() {
  const h = run.world.laws.hue;
  const sorted = [...run.world.tiles].sort((a, b) => a.x + a.z - b.x - b.z);
  for (const t of sorted) {
    const p = project({ x: t.x, y: t.height, z: t.z });
    if (p.x < -unit * 4 || p.x > width + unit * 4 || p.y < -unit * 4 || p.y > height + unit * 6)
      continue;
    const r = random(t.seed),
      depth = 1.3 + r() * 1.3;
    const color =
      t.kind === 'path' || t.kind === 'ladder'
        ? `hsl(${h + 30} 19% ${39 + r() * 8}%)`
        : `hsl(${h} ${30 + run.world.laws.moisture * 25}% ${25 + r() * 9}%)`;
    const corners = [
      { x: t.x - 0.5, y: t.height, z: t.z - 0.5 },
      { x: t.x + 0.5, y: t.height, z: t.z - 0.5 },
      { x: t.x + 0.5, y: t.height, z: t.z + 0.5 },
      { x: t.x - 0.5, y: t.height, z: t.z + 0.5 },
    ];
    for (const [edge, nx, nz] of [
      [1, t.x + 1, t.z],
      [2, t.x, t.z + 1],
    ] as const) {
      const neighbor = tileAt(run.world, nx, nz),
        base = neighbor ? neighbor.height : t.height - depth;
      if (base < t.height) {
        const a = corners[edge],
          b = corners[(edge + 1) % 4];
        polygon(
          [project(a), project(b), project({ ...b, y: base }), project({ ...a, y: base })],
          `hsl(${h + 15} 20% ${edge === 1 ? 22 : 15}%)`,
        );
      }
    }
    polygon(corners.map(project), color, '#0d23384d');
    for (let i = 0; i < 7; i++) {
      const grain = project({
        x: t.x + (r() - 0.5) * 0.85,
        y: t.height + 0.012,
        z: t.z + (r() - 0.5) * 0.85,
      });
      ctx.fillStyle = i % 2 ? '#e8efd120' : '#071b3030';
      ctx.fillRect(Math.round(grain.x), Math.round(grain.y), 2, 1);
    }
    if (t.kind === 'ladder') {
      const foot = project({ x: t.x + 0.5, y: t.height - 1.75, z: t.z + 0.5 }),
        top = project({ x: t.x + 0.5, y: t.height, z: t.z + 0.5 });
      ctx.strokeStyle = '#d1b982';
      ctx.lineWidth = 2;
      for (const side of [-5, 5]) {
        ctx.beginPath();
        ctx.moveTo(foot.x + side, foot.y);
        ctx.lineTo(top.x + side, top.y);
        ctx.stroke();
      }
      for (let y = top.y; y < foot.y; y += 7) {
        ctx.beginPath();
        ctx.moveTo(top.x - 5, y);
        ctx.lineTo(top.x + 5, y);
        ctx.stroke();
      }
    }
  }
}
function drawPlant(t: (typeof run.world.tiles)[number]) {
  const r = random(deriveSeed(t.seed, 'plant')),
    height = 0.35 + r() * 1.3,
    h = run.world.laws.hue;
  const root = project({ x: t.x, y: t.height, z: t.z }),
    top = project({ x: t.x, y: t.height + height, z: t.z });
  ctx.strokeStyle = `hsl(${h + 12} 25% 22%)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  const branches = 3 + Math.floor(r() * 4);
  for (let i = 0; i < branches; i++) {
    const angle = r() * Math.PI * 2,
      len = 0.15 + r() * 0.42,
      y = t.height + height * (0.4 + r() * 0.6),
      point = project({ x: t.x + Math.cos(angle) * len, y, z: t.z + Math.sin(angle) * len });
    const s = unit * (0.1 + r() * 0.18);
    polygon(
      [
        { x: point.x, y: point.y - s },
        { x: point.x + s * 0.8, y: point.y },
        { x: point.x, y: point.y + s * 0.6 },
        { x: point.x - s * 0.8, y: point.y },
      ],
      `hsl(${h + 25 + r() * 30} ${35 + r() * 25}% ${35 + r() * 15}%)`,
    );
  }
}
function ring(position: V3, radius: number, color: string) {
  const p = project(position);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, radius * unit, radius * unit * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
}
function drawGate() {
  const p = project(run.world.gate);
  const ready = run.ready;
  box(run.world.gate.x, run.world.gate.z, run.world.gate.y, 0.7, 0.7, 0.12, '#719594');
  ctx.save();
  ctx.shadowColor = ready ? '#c2ffb0' : '#72e8e2';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = ready ? '#c2ffb0' : '#72e8e2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - unit * 0.7, unit * 0.42, unit * 0.8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 9; i++) {
    const angle = run.time * 0.6 + i * 2.4;
    ctx.fillStyle = '#b4fff2';
    ctx.fillRect(
      p.x + Math.cos(angle) * unit * 0.45,
      p.y - unit * 0.7 + Math.sin(angle) * unit * 0.8,
      2,
      2,
    );
  }
}
function drawActor(a: Actor, highlight = false) {
  if (a.hp <= 0) {
    ring(a.position, 0.35, '#be6d6955');
    return;
  }
  const pose = sampleMotion(a.genome, {
    position: a.position,
    heading: a.heading,
    speed: a.speed,
    time: run.time,
    phase: a.phase,
    grounded: a.grounded,
  });
  drawSpecies(ctx, a.genome, pose, project, unit, highlight);
  if (a !== run.player) {
    const point = project(a.position);
    if (a.scanned || (a === run.target && run.world.mission.kind !== 'survey')) {
      ctx.fillStyle = a.scanned ? '#a5d6c4' : '#f3bf76';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(a.scanned ? a.genome.name : '◇', point.x, point.y - unit * 1.6);
    }
  }
}
function draw() {
  ctx.fillStyle = '#07131f';
  ctx.fillRect(0, 0, width, height);
  const stars = random(deriveSeed(run.world.seed, 'stars'));
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = `rgba(132,191,202,${0.1 + stars() * 0.35})`;
    ctx.fillRect(stars() * width, stars() * height, 1, 1);
  }
  drawTerrain();
  drawGate();
  const ordered: { depth: number; draw: () => void }[] = [];
  for (const t of run.world.tiles)
    if (t.decoration > 0) ordered.push({ depth: t.x + t.z, draw: () => drawPlant(t) });
  for (const a of [...run.actors, run.player])
    ordered.push({
      depth: a.position.x + a.position.z,
      draw: () => drawActor(a, a === run.player),
    });
  ordered.sort((a, b) => a.depth - b.depth).forEach((a) => a.draw());
  if (run.world.mission.kind === 'attune') {
    const p = run.world.resonator;
    box(p.x, p.z, p.y, 0.3, 0.3, 0.7, coreColor(run.world.weapon.core));
    ring(p, 1, run.attunement >= 1 ? '#ccffbd' : '#91c3cd');
  }
  for (const b of run.bolts) {
    const p = project(b.position);
    ctx.fillStyle = coreColor(b.core);
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 + b.power, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (const b of run.bursts) {
    ctx.globalAlpha = b.life;
    ring(b.position, b.radius * (1.1 - b.life), coreColor(b.core));
    ctx.globalAlpha = 1;
  }
  if (run.belongings) ring(run.belongings, 0.5, '#efb466');
}
function coreColor(core: string) {
  return (
    (
      { heat: '#f6a35e', cold: '#92c6ff', charge: '#d7a8ff', growth: '#a5e58f' } as Record<
        string,
        string
      >
    )[core] || '#8ce9e0'
  );
}
function save() {
  if (!started) return;
  try {
    const snapshot = JSON.stringify({
      version: 1,
      name,
      seed: run.world.seed,
      rootSeed: run.rootSeed,
      crossing: run.crossing,
      vessel: run.vessel,
      actionSeed: run.actionSeed,
      scanned: run.scanned,
      integrity: run.integrity,
      attunement: run.attunement,
      memories: run.memories,
      belongings: run.belongings,
      belongingsAmount: run.belongingsAmount,
      kills: run.kills,
      phase: run.phase,
      player: { position: run.player.position, hp: run.player.hp },
      actors: run.actors.map((a) => ({
        id: a.id,
        hp: a.hp,
        position: a.position,
        scanned: a.scanned,
        following: a.following,
      })),
    });
    localStorage.setItem(saveKey, snapshot);
    stored = snapshot;
  } catch {}
}
function applyWorld(next: Crossing) {
  run = next;
  camera = { ...run.player.position };
  lastPhase = run.phase;
  audio.setWorld(run.crossing, run.world.seed);
  update();
}
function open(html: string) {
  paused = true;
  keys.clear();
  mouse.down = false;
  audio.pause(true);
  document
    .querySelectorAll<HTMLElement>('.p-shell > :not(#p-modal)')
    .forEach((node) => (node.inert = true));
  el('p-modal').innerHTML =
    `<section class="p-terminal" role="dialog" aria-modal="true">${html}</section>`;
  el('p-modal').classList.add('open');
  const heading = el('p-modal').querySelector('h2');
  if (heading) {
    heading.id = 'p-dialog-heading';
    el('p-modal').querySelector('section')!.setAttribute('aria-labelledby', heading.id);
  }
  el('p-modal').querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true });
  el('p-modal').scrollTop = 0;
}
function close() {
  paused = false;
  journal = false;
  el('p-modal').classList.remove('open');
  el('p-modal').innerHTML = '';
  document
    .querySelectorAll<HTMLElement>('.p-shell > :not(#p-modal)')
    .forEach((node) => (node.inert = false));
  audio.pause(false);
  canvas.focus();
}
function title() {
  open(
    `<span class="p-eyebrow">VERSO / Possible lives</span><h2>A world begins.<br>Someone else lives it.</h2><p>Enter a generated crossing. The terrain, native anatomy, movement and issued equipment follow its seed.</p><form id="p-start"><label>Your name<input id="p-name" value="${escape(name)}" maxlength="22" required></label><label>World seed<input id="p-root" value="0x71A3" maxlength="64" required></label><button class="primary">Enter a possible world ↗</button></form>${stored ? '<button id="p-continue">Continue your crossing</button>' : ''}<a class="p-study" href="?study=1">Open the earlier visual study</a>`,
  );
  el<HTMLFormElement>('p-start').onsubmit = (e) => {
    e.preventDefault();
    name = el<HTMLInputElement>('p-name').value.trim() || 'Traveler';
    applyWorld(new Crossing(parseSeed(el<HTMLInputElement>('p-root').value)));
    started = true;
    void audio.start(run.world.seed);
    brief();
  };
  if (stored)
    el('p-continue').onclick = () => {
      try {
        const s = JSON.parse(stored!);
        if (
          s.version !== 1 ||
          !Number.isInteger(s.seed) ||
          !Number.isInteger(s.crossing) ||
          s.crossing < 0 ||
          s.crossing > 10000
        )
          throw new Error('Invalid crossing');
        const next = new Crossing(s.seed, s.crossing, s.rootSeed);
        next.restoreVessel(s.vessel ?? 0);
        if (!Array.isArray(s.actors) || s.actors.length !== next.actors.length)
          throw new Error('Invalid lifeforms');
        for (const actor of next.actors) {
          const old = s.actors.find((a: { id: string }) => a.id === actor.id);
          if (!old || !Number.isFinite(old.hp)) throw new Error('Invalid lifeform');
          actor.hp = clamp(old.hp, 0, actor.maxHp);
          actor.scanned = !!old.scanned;
          actor.following = !!old.following;
          if (old.position && tileAt(next.world, old.position.x, old.position.z))
            actor.position = {
              ...old.position,
              y: tileAt(next.world, old.position.x, old.position.z)!.height,
            };
        }
        next.scanned = next.actors.filter((a) => a.scanned).map((a) => a.genome.id);
        next.integrity = clamp(Number(s.integrity) || 0, 0, 100);
        next.attunement = clamp(Number(s.attunement) || 0, 0, 1);
        next.memories = clamp(Number(s.memories) || 0, 0, 999);
        next.actionSeed = s.actionSeed >>> 0;
        next.kills = clamp(Number(s.kills) || 0, 0, 999);
        if (!s.player || !Number.isFinite(s.player.hp)) throw new Error('Invalid host');
        next.player.hp = clamp(s.player.hp, 0, next.player.maxHp);
        const position = s.player.position;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.z)) {
          const ground = tileAt(next.world, position.x, position.z);
          if (ground) next.player.position = { x: position.x, y: ground.height, z: position.z };
        }
        if (s.belongings && Number.isFinite(s.belongings.x) && Number.isFinite(s.belongings.z)) {
          const ground = tileAt(next.world, s.belongings.x, s.belongings.z);
          if (ground) {
            next.belongings = { x: s.belongings.x, y: ground.height, z: s.belongings.z };
            next.belongingsAmount = clamp(Number(s.belongingsAmount) || 0, 0, 999);
          }
        }
        if (s.phase === 'dead' || next.player.hp <= 0) next.phase = 'dead';
        else if (s.phase === 'complete' && next.ready) next.phase = 'complete';
        name = String(s.name).slice(0, 22);
        applyWorld(next);
        started = true;
        void audio.start(run.world.seed);
        close();
        if (run.phase !== 'playing') phasePanel();
      } catch {
        stored = null;
        title();
        run.message = 'That crossing could not be restored.';
      }
    };
}
function brief() {
  open(
    `<span class="p-eyebrow">Assignment ${run.crossing + 1} / ${escape(run.world.name)}</span><h2>${escape(run.world.mission.title)}</h2><p>${escape(run.world.mission.reason)}</p><div class="p-brief-data"><div><small>Borrowed anatomy</small><strong>${escape(run.player.genome.name)}</strong><span>${run.player.genome.locomotion} · ${run.player.genome.nodes.length} segments · ${run.player.genome.appendages.filter((a) => a.kind === 'leg').length} legs</span></div><div><small>Issued object</small><strong>${escape(run.world.weapon.name)}</strong><span>${run.world.weapon.core} / ${run.world.weapon.trigger}</span></div></div><p>${escape(run.world.mission.condition)}</p><button class="primary" id="p-deploy">Inhabit this body ↗</button><small class="p-note">WASD move · Shift run · Space jump · E interact · F use weapon</small>`,
  );
  el('p-deploy').onclick = () => {
    close();
    save();
  };
}
function showJournal() {
  journal = true;
  const s = run.player.genome,
    w = run.world.weapon;
  open(
    `<span class="p-eyebrow">Personal field record / ${escape(name)}</span><h2>Forms have consequences.</h2><p>${escape(s.explanation)}</p><div class="p-record-grid"><div><h3>Your anatomy</h3><p>${s.nodes.length} body segments · ${s.appendages.length} appendages<br>${s.locomotion} · ${s.role}<br>Mass ${s.mass.toFixed(2)} · speed ${s.speed.toFixed(2)}<br>Jump impulse ${s.jump.toFixed(2)}</p><p>${s.capabilities.map(escape).join(' · ')}</p><h3>Issued object</h3><p>${escape(w.explanation)}</p><p>Damage ${w.damage.toFixed(1)} · reach ${w.reach.toFixed(1)}<br>Recovery ${w.recovery.toFixed(2)}s</p></div><div><h3>Native lineages</h3>${run.actors.map((a) => `<article><strong>${a.scanned ? escape(a.genome.name) : 'Uncataloged lifeform'}</strong><small>${a.scanned ? `${a.genome.role} / ${a.genome.locomotion} / ${a.genome.nodes.length} segments` : 'Approach and read its anatomy.'}</small></article>`).join('')}</div></div><p class="p-note">The same seed and generator version reproduce these descriptors. Your actions feed the next crossing.</p><button id="p-return" class="primary">Return to the world</button>`,
  );
  el('p-return').onclick = () => {
    if (run.phase === 'playing') close();
    else phasePanel();
  };
}
function pauseMenu() {
  open(
    `<span class="p-eyebrow">Link on hold</span><h2>Between possible worlds.</h2><button id="p-resume" class="primary">Return to this body</button><button id="p-record">Read the field record</button><button id="p-new">Start from another seed</button><a class="p-study" href="?study=1">Earlier visual study</a>`,
  );
  el('p-resume').onclick = close;
  el('p-record').onclick = showJournal;
  el('p-new').onclick = () => {
    save();
    title();
  };
}
function phasePanel() {
  save();
  if (run.phase === 'dead') {
    open(
      `<span class="p-eyebrow">Vessel lost</span><h2>Another form.<br>The same unfinished task.</h2><p>A new body is generated for the next host. Its movement and capabilities may differ.</p><button id="p-rebody" class="primary">Borrow another life</button>`,
    );
    el('p-rebody').onclick = () => {
      run.reincarnate();
      lastPhase = run.phase;
      camera = { ...run.player.position };
      close();
    };
  } else if (run.phase === 'complete') {
    open(
      `<span class="p-eyebrow">Assignment returned</span><h2>${Math.round(run.integrity)}% of this world remains.</h2><p>${run.kills} lives ended. ${run.scanned.length} lineages cataloged. Your action history has become part of the next seed.</p><button id="p-next" class="primary">Cross into another possibility ↗</button><button id="p-review">Review your field record</button>`,
    );
    el('p-next').onclick = () => {
      applyWorld(run.next());
      brief();
    };
    el('p-review').onclick = showJournal;
  }
}
function update() {
  const w = run.world,
    p = run.player,
    m = w.mission;
  el('p-world-name').textContent = w.name;
  el('p-assignment-index').textContent =
    `Crossing ${String(run.crossing + 1).padStart(3, '0')} / ${m.kind}`;
  el('p-objective').textContent = m.title;
  el('p-condition').textContent = m.condition;
  const progress =
    m.kind === 'survey'
      ? run.scanned.length / 3
      : m.kind === 'attune'
        ? run.attunement
        : run.ready
          ? 1
          : 0;
  el('p-progress-fill').style.width = `${Math.min(100, progress * 100)}%`;
  el('p-progress-label').textContent = run.ready
    ? 'Return through the rift'
    : m.kind === 'survey'
      ? `${run.scanned.length} / 3 species cataloged`
      : m.kind === 'attune'
        ? `${Math.round(run.attunement * 100)}% resonance`
        : m.kind === 'escort' && run.target.following
          ? 'The lifeform is following'
          : 'Assignment in progress';
  el('p-integrity').textContent = `World integrity ${Math.round(run.integrity)}%`;
  el('p-seed').textContent = `SEED ${formatSeed(w.seed)}`;
  el('p-laws').textContent =
    `Gravity ${w.laws.gravity.toFixed(1)} · moisture ${Math.round(w.laws.moisture * 100)}%`;
  el('p-vessel').textContent = `Vessel ${run.vessel + 1} / ${p.genome.locomotion}`;
  el('p-host-name').textContent = p.genome.name;
  el('p-health-fill').style.width = `${(p.hp / p.maxHp) * 100}%`;
  el('p-health-label').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  el('p-memory').textContent = `◇ ${run.memories} memories`;
  el('p-weapon-name').textContent = w.weapon.name;
  el('p-weapon-desc').textContent = `${w.weapon.frame} · ${w.weapon.core} · ${w.weapon.trigger}`;
  const wc = el<HTMLCanvasElement>('p-weapon-art').getContext('2d')!;
  wc.clearRect(0, 0, 88, 88);
  drawWeapon(wc, w.weapon, 44, 44, 80);
  el('p-message').textContent = run.message;
  const near = run.nearby;
  el('p-prompt').textContent = paused
    ? ''
    : distance(p.position, w.gate) < 1.6 && run.ready
      ? 'E · Return through the rift'
      : near
        ? `E · ${near.scanned ? near.genome.name : 'Read this lifeform'}`
        : '';
  const map = el<HTMLCanvasElement>('p-map').getContext('2d')!;
  map.clearRect(0, 0, 180, 130);
  const max = Math.max(...w.tiles.map((t) => Math.abs(t.x) + Math.abs(t.z))) + 3,
    s = 75 / max;
  for (const t of w.tiles) {
    map.fillStyle = t.kind === 'path' ? '#bad1bd66' : '#6fa89466';
    map.fillRect(90 + (t.x - t.z) * s, 65 + (t.x + t.z) * s * 0.5, 3, 2);
  }
  for (const a of run.actors) {
    map.fillStyle = a.scanned ? '#abc8b4' : '#e5b575';
    map.fillRect(
      90 + (a.position.x - a.position.z) * s - 1,
      65 + (a.position.x + a.position.z) * s * 0.5 - 1,
      3,
      3,
    );
  }
  map.fillStyle = '#bcfff3';
  map.fillRect(
    90 + (p.position.x - p.position.z) * s - 2,
    65 + (p.position.x + p.position.z) * s * 0.5 - 2,
    4,
    4,
  );
}
function command(kind: string) {
  if (paused) return;
  if (kind === 'attack') {
    run.attack();
    audio.play('pulse');
  } else if (kind === 'jump') run.jump();
  else if (kind === 'interact') {
    run.interact();
    audio.play('scan');
  } else if (kind === 'heal') {
    run.heal();
    audio.play('heal');
  }
  if (run.phase !== lastPhase) {
    lastPhase = run.phase;
    phasePanel();
  }
  update();
}
document
  .querySelectorAll<HTMLElement>('[data-command]')
  .forEach((b) => (b.onclick = () => command(b.dataset.command!)));
document.querySelectorAll<HTMLElement>('[data-move]').forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.move!);
  };
  b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.move!);
});
el('p-journal').onclick = showJournal;
el('p-pause').onclick = pauseMenu;
el('p-sound').onclick = () => {
  if (audio.needsGesture && !muted) {
    void audio.start(run.world.seed);
    return;
  }
  muted = !muted;
  audio.setMuted(muted);
  el('p-sound').textContent = muted ? '×' : '♪';
};
addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && paused) {
    const controls = Array.from(
      el('p-modal').querySelectorAll<HTMLElement>('button,input,a'),
    ).filter((node) => node.getClientRects().length > 0);
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const key = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
  if (key === 'escape') {
    if (paused && started && run.phase === 'playing') close();
    else if (!paused) pauseMenu();
    return;
  }
  if (key === 'j' && started) {
    if (journal && run.phase === 'playing') close();
    else showJournal();
    return;
  }
  if (paused) return;
  if (!keys.has(key)) run.record(`down:${key}`);
  keys.add(key);
  if (!e.repeat) {
    if (key === 'e') command('interact');
    if (key === ' ') command('jump');
    if (key === 'f') command('attack');
    if (key === 'q') command('heal');
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});
canvas.onpointermove = (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.known = true;
};
canvas.onpointerdown = (e) => {
  if (paused) return;
  if (audio.needsGesture) void audio.start(run.world.seed);
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.known = true;
  mouse.down = true;
  command('attack');
};
addEventListener('pointerup', () => (mouse.down = false));
canvas.oncontextmenu = (e) => e.preventDefault();
canvas.onwheel = (e) => {
  e.preventDefault();
  unit = clamp(unit - e.deltaY * 0.015, 16, 60);
};
addEventListener('blur', () => {
  keys.clear();
  mouse.down = false;
  if (started && !paused) pauseMenu();
});
addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    keys.clear();
    mouse.down = false;
    if (started && !paused) pauseMenu();
  }
});
function frame(now: number) {
  const elapsed = (now - last) / 1000;
  const dt = Math.min(elapsed, 0.04);
  last = now;
  frames++;
  frameSeconds += elapsed;
  if (frameSeconds > 0.5) {
    fps = frames / frameSeconds;
    frames = 0;
    frameSeconds = 0;
  }
  if (!paused) {
    const sx =
        Number(keys.has('d') || keys.has('arrowright')) -
        Number(keys.has('a') || keys.has('arrowleft')),
      sz =
        Number(keys.has('s') || keys.has('arrowdown')) -
        Number(keys.has('w') || keys.has('arrowup'));
    // Screen-space controls map to the two diagonals of the isometric plane.
    const x = sx + sz,
      z = sz - sx,
      p = project(run.player.position),
      mx = (mouse.x - p.x) / unit,
      mz = (mouse.y - p.y) / unit;
    const aim = mouse.known
      ? Math.atan2(mz - mx * 0.5, mz + mx * 0.5)
      : Math.hypot(x, z) > 0
        ? Math.atan2(z, x)
        : run.player.heading;
    run.update(dt, { x, z, run: keys.has('shift'), aim });
    if (mouse.down || keys.has('f')) run.attack();
    if (run.phase !== lastPhase) {
      lastPhase = run.phase;
      phasePanel();
    }
    if (now - lastSave > 5000) {
      save();
      lastSave = now;
    }
  }
  const ground = tileAt(run.world, run.player.position.x, run.player.position.z);
  camera.x += (run.player.position.x - camera.x) * Math.min(1, dt * 7);
  camera.z += (run.player.position.z - camera.z) * Math.min(1, dt * 7);
  camera.y += ((ground?.height ?? 0) - camera.y) * Math.min(1, dt * 5);
  draw();
  if (now - lastUI > 120) {
    update();
    lastUI = now;
  }
  requestAnimationFrame(frame);
}
Object.defineProperty(window, 'versoProcedural', {
  value: {
    get state() {
      return structuredClone({
        seed: run.world.seed,
        crossing: run.crossing,
        phase: run.phase,
        player: run.player,
        actors: run.actors,
        mission: run.world.mission,
        weapon: run.world.weapon,
        scanned: run.scanned,
        ready: run.ready,
        paused,
      });
    },
    get world() {
      return structuredClone(run.world);
    },
    get fps() {
      return fps;
    },
    worldToScreen: project,
  },
  writable: false,
});
update();
title();
requestAnimationFrame(frame);
