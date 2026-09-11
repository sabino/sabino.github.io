/**
 * Real-input Stíchos acceptance check. Requires Node 22+ and an already-running
 * isolated Agent Workspace Chromium endpoint discovered by workspace_browser_targets.
 * Never attach this script to host Chrome. No game state or save injection.
 * node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT http://localhost:4173/?stichos=1
 * Add --smoke for the opening, core controls, screenshots, and saved continuation.
 * Add --visual for an isolated browser-context screenshot/FPS sample with no saved-life changes.
 * Add --possession to Continue a completed QA save and verify actual NPC mind transfer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.argv[2];
const baseUrl = new URL(process.argv[3] || 'http://localhost:4173/?stichos=1');
const smoke = process.argv.includes('--smoke');
const visualOnly = process.argv.includes('--visual');
const possessionOnly = process.argv.includes('--possession');
const expeditionOnly = process.argv.includes('--expedition');
const visualName =
  process.argv.find((arg) => arg.startsWith('--visual-name='))?.split('=')[1] ?? 'round-02';
const profileVisual = process.argv.includes('--profile');
const mobileVisual = process.argv.includes('--mobile');
if (!/^[a-z0-9-]+$/.test(visualName))
  throw new Error('Visual artifact name must use lowercase letters, numbers and hyphens.');
if (!endpoint || !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname))
  throw new Error('Pass the isolated Agent Workspace loopback CDP endpoint.');
if (baseUrl.hostname !== 'localhost')
  throw new Error('Use localhost to protect the developer’s 127.0.0.1 save.');
const out = path.join(
  root,
  expeditionOnly
    ? '.dream-loop/stichos-expedition'
    : possessionOnly
      ? '.dream-loop/stichos-possession'
      : visualOnly
        ? '.dream-loop/stichos'
        : '.dream-loop/stichos-qa',
);
fs.mkdirSync(out, { recursive: true });
const downloadFolder = `verso-stichos-campaign-${Date.now()}`;
const downloadHost = `/home/sabino/.local/share/agent-workspace-linux/files/${downloadFolder}`;
const downloadWorkspace = `/workspace/agent/${downloadFolder}`;
const downloads = [];
const results = [],
  errors = [],
  findings = [],
  screenshots = [];
const started = new Date();
let browser, page, targetId, contextId, failure, fps, wideFps, final, exportedSave;
const held = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const log = (name, details = '') => {
  results.push({ name, details });
  console.log(`PASS ${name}${details ? ': ' + details : ''}`);
};
const finding = (message) => {
  findings.push(message);
  console.warn(`FINDING ${message}`);
};

async function connect(url, events = () => {}) {
  const ws = new WebSocket(url); // Native Node WebSocket omits the Origin header.
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const p = pending.get(message.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(message.id);
      message.error
        ? p.reject(new Error(JSON.stringify(message.error)))
        : p.resolve(message.result);
    } else events(message.method, message.params);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const callId = ++id,
          timer = setTimeout(() => {
            pending.delete(callId);
            reject(new Error(`CDP timeout: ${method}`));
          }, 20000);
        pending.set(callId, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: callId, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}
async function read(expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function state() {
  return read('window.stichos.state');
}
async function waitFor(expression, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await read(expression).catch(() => false)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function mouse(x, y, button = 'left') {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button,
    clickCount: 1,
    x,
    y,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button,
    clickCount: 1,
    x,
    y,
  });
  await delay(120);
}
async function click(selector) {
  let rect;
  for (let attempt = 0; attempt < 12; attempt++) {
    rect = await read(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight}})()`,
    );
    assert(rect, `Missing or disabled control: ${selector}`);
    if (
      rect.w > 0 &&
      rect.h > 0 &&
      rect.y >= 6 &&
      rect.y < rect.vh - 6 &&
      rect.x >= 0 &&
      rect.x < rect.vw
    )
      break;
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.max(8, Math.min(rect.vw - 8, rect.x)),
      y: rect.vh / 2,
      deltaX: 0,
      deltaY: rect.y < 6 ? -rect.vh * 0.65 : rect.vh * 0.65,
    });
    await delay(180);
  }
  assert(
    rect.w > 0 && rect.h > 0 && rect.x >= 0 && rect.x < rect.vw && rect.y >= 0 && rect.y < rect.vh,
    `Control outside viewport: ${selector}`,
  );
  await mouse(rect.x, rect.y);
}
function keyInfo(key) {
  const specials = {
    Escape: ['Escape', 27],
    Enter: ['Enter', 13],
    Shift: ['ShiftLeft', 16],
    Tab: ['Tab', 9],
  };
  return {
    key,
    code: specials[key]?.[0] ?? (/^\d$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`),
    windowsVirtualKeyCode: specials[key]?.[1] ?? key.toUpperCase().charCodeAt(0),
  };
}
async function key(key, down) {
  await page.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', ...keyInfo(key) });
}
async function tap(keyName) {
  await key(keyName, true);
  await delay(45);
  await key(keyName, false);
  await delay(140);
}
async function setKeys(keys) {
  for (const k of [...held])
    if (!keys.includes(k)) {
      await key(k, false);
      held.delete(k);
    }
  for (const k of keys)
    if (!held.has(k)) {
      await key(k, true);
      held.add(k);
    }
}
async function screenshot(name) {
  const r = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
  screenshots.push(name);
}
async function viewport(width, height, mobile = false) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
  await delay(350);
}
async function worldClick(point, button = 'left') {
  const pos = await read(
    `(()=>{const p=window.stichos.worldToScreen(${JSON.stringify(point)}),r=document.querySelector('#s-world').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom};})()`,
  );
  assert(
    pos.x > pos.left && pos.x < pos.right && pos.y > pos.top && pos.y < pos.bottom,
    `World target outside current view: ${JSON.stringify(point)}`,
  );
  await mouse(pos.x, pos.y, button);
}
async function closeDialogue() {
  if ((await state()).dialogue) {
    await tap('Escape');
    await waitFor('!window.stichos.state.dialogue', 'dialogue close');
  }
}
async function keyWalkNear(point, range = 0.45) {
  const until = Date.now() + 6000;
  while (Date.now() < until) {
    const p = (await state()).player;
    if (distance(p, point) <= range) {
      await setKeys([]);
      return;
    }
    const dx = point.x - p.x,
      dy = point.y - p.y,
      keys = [];
    if (Math.abs(dx) > 0.16) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 0.16) keys.push(dy > 0 ? 's' : 'w');
    await setKeys(keys);
    await delay(70);
  }
  await setKeys([]);
  throw new Error('Short keyboard approach stalled');
}
async function clickWalk(point, range = 0.3, label = 'click route') {
  await worldClick(point);
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    const s = await state();
    assert(s.phase === 'playing' && !s.modal, `${label} interrupted`);
    if (distance(s.player, point) <= range) return;
    await delay(150);
  }
  throw new Error(`${label} stalled at ${JSON.stringify((await state()).player)}`);
}
async function interactTarget(id, kind = 'prop') {
  await closeDialogue();
  const target = await read(
    kind === 'npc'
      ? `window.stichos.state.npcs.find(n=>n.id===${JSON.stringify(id)})`
      : `(()=>{const p=window.stichos.state.player;return window.stichos.props(p.x,p.y,26).find(n=>n.id===${JSON.stringify(id)})})()`,
  );
  assert(target, `No visible ${kind}: ${id}`);
  await worldClick({ x: target.x, y: target.y - (kind === 'npc' ? 0.5 : 0.25) });
  await waitFor(
    kind === 'npc'
      ? `window.stichos.state.dialogue?.npcId===${JSON.stringify(id)}`
      : `window.stichos.state.removed.includes(${JSON.stringify(id)}) || window.stichos.state.opened.includes(${JSON.stringify(id)}) || !!window.stichos.state.dialogue || Math.hypot(window.stichos.state.player.x-(${target.x}),window.stichos.state.player.y-(${target.y}))<1.7`,
    `${kind} interaction ${id}`,
    20000,
  );
  await delay(300);
}
async function chooseAvailable(preferred = []) {
  const choices = await read('window.stichos.state.dialogue?.choices??[]');
  const selected =
    preferred.map((id) => choices.find((c) => c.id === id && !c.disabled)).find(Boolean) ??
    choices.find((c) => !c.disabled && !/close|leave|goodbye/i.test(c.id + ' ' + c.label));
  if (!selected) return false;
  await click(`[data-choice=${JSON.stringify(selected.id)}]`);
  return selected;
}
async function sustain() {
  const s = await state();
  if (s.player.cequinTime < 18 && (s.inventory.cequin ?? 0) > 0) await tap('3');
  if (s.player.warmth < 45 && (s.inventory.tonic ?? 0) > 0) await tap('5');
  if (s.player.hp < s.player.maxHp - 30 && (s.inventory.salve ?? 0) > 0) await tap('4');
}

async function roadAxis(axis, value) {
  const until = Date.now() + 130000;
  while (Date.now() < until) {
    const s = await state();
    assert(s.phase === 'playing' && !s.paused, 'Road journey interrupted');
    const delta = value - s.player[axis];
    if (Math.abs(delta) < 0.24) {
      await setKeys([]);
      return;
    }
    await setKeys([
      axis === 'x' ? (delta > 0 ? 'd' : 'a') : delta > 0 ? 's' : 'w',
      ...(Math.abs(delta) > 3 ? ['Shift'] : []),
    ]);
    await sustain();
    await delay(70);
  }
  await setKeys([]);
  throw Error(`Road axis ${axis} did not reach ${value}`);
}

async function combatNearby() {
  const s = await state();
  assert(s.phase === 'playing', 'The host died during the expedition');
  if (s.player.hp < s.player.maxHp - 35 && (s.inventory.salve ?? 0) > 0) await tap('4');
  const enemies = s.npcs
    .filter((n) => n.hostile && n.hp > 0 && distance(n, s.player) < 2.7)
    .sort((a, b) => distance(a, s.player) - distance(b, s.player));
  if (!enemies.length) return false;
  if (s.player.wardCooldown <= 0 && s.player.stamina >= 40) await tap('q');
  if (distance(enemies[0], s.player) <= s.weaponProfile.range - 0.03) {
    await setKeys([]);
    if (s.player.attackCooldown <= 0.03) await worldClick(enemies[0], 'right');
    await delay(100);
    return true;
  }
  return false;
}

async function vaultWalk(site, goal) {
  const start = (await state()).player;
  const data = await read(
    `(()=>{const cells=[];for(let y=${site.y - 17};y<=${site.y + 41};y++)for(let x=${site.x - 17};x<=${site.x + 17};x++){const t=window.stichos.tile(x,y);if(t.site===${JSON.stringify(site.id)}&&!window.stichos.blocked(x,y))cells.push({x,y})}return cells})()`,
  );
  const allowed = new Set(data.map((p) => `${p.x},${p.y}`));
  const first = { x: Math.round(start.x), y: Math.round(start.y) },
    end = `${Math.round(goal.x)},${Math.round(goal.y)}`;
  const q = [first],
    previous = new Map([[`${first.x},${first.y}`, null]]);
  for (let i = 0; i < q.length && !previous.has(end); i++)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const p = { x: q[i].x + dx, y: q[i].y + dy },
        id = `${p.x},${p.y}`;
      if (!allowed.has(id) || previous.has(id)) continue;
      previous.set(id, q[i]);
      q.push(p);
    }
  assert(previous.has(end), 'No passable site route to target');
  const route = [];
  let p = { x: Math.round(goal.x), y: Math.round(goal.y) };
  while (p) {
    route.push(p);
    p = previous.get(`${p.x},${p.y}`);
  }
  route.reverse();
  for (let i = 1; i < route.length; i++) {
    let target = route[i];
    const dx = target.x - route[i - 1].x,
      dy = target.y - route[i - 1].y;
    let steps = 1;
    while (
      i + 1 < route.length &&
      steps < 4 &&
      route[i + 1].x - target.x === dx &&
      route[i + 1].y - target.y === dy
    ) {
      i++;
      target = route[i];
      steps++;
    }
    const until = Date.now() + 18000;
    while (Date.now() < until) {
      if (await combatNearby()) continue;
      const s = await state();
      if (distance(s.player, target) < 0.18) break;
      const keys = [];
      if (Math.abs(target.x - s.player.x) > 0.1) keys.push(target.x > s.player.x ? 'd' : 'a');
      if (Math.abs(target.y - s.player.y) > 0.1) keys.push(target.y > s.player.y ? 's' : 'w');
      await setKeys(keys);
      await delay(50);
    }
    await setKeys([]);
    assert(
      distance((await state()).player, target) < 0.3,
      `Actual walking stalled inside vault at ${JSON.stringify(target)}`,
    );
  }
}

async function wideViewCheck(name) {
  if ((await state()).paused) await tap('Escape');
  await viewport(1600, 1000);
  const canvas = await read(
    `(()=>{const r=document.querySelector('#s-world').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  for (let i = 0; i < 5 && (await read('window.stichos.zoom')) > 0.65; i++) {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: canvas.x,
      y: canvas.y,
      deltaX: 0,
      deltaY: 350,
    });
    await delay(180);
  }
  assert(
    Math.abs((await read('window.stichos.zoom')) - 0.65) < 0.001,
    'Real wheel did not reach minimum zoom',
  );
  await delay(3000);
  await page.send('Profiler.enable');
  await page.send('Profiler.start');
  wideFps = await read(
    'new Promise(resolve=>{const times=[],start=performance.now();function tick(t){times.push(t);if(t-start>2500)resolve({frames:times.length,elapsedMs:t-times[0],rafFps:(times.length-1)*1000/(t-times[0]),reported:window.stichos.fps,foreground:!document.hidden&&document.hasFocus(),zoom:window.stichos.zoom,player:{x:window.stichos.state.player.x,y:window.stichos.state.player.y}});else requestAnimationFrame(tick)}requestAnimationFrame(tick)})',
  );
  const { profile } = await page.send('Profiler.stop');
  fs.writeFileSync(path.join(out, `${name}.cpuprofile`), JSON.stringify(profile));
  wideFps.visibleProps = await read(
    `(()=>{const p=window.stichos.state.player,r=document.querySelector('#s-world').getBoundingClientRect(),props=window.stichos.props(p.x,p.y,80).filter(q=>{const s=window.stichos.worldToScreen(q);return s.x>=-120&&s.x<=r.width+120&&s.y>=-120&&s.y<=r.height+120});const organic=props.filter(q=>['pine','rock','cequin','heartleaf','emberroot','mushroom'].includes(q.kind));return {all:props.length,organic:organic.length,uniqueOrganicSeeds:new Set(organic.map(q=>q.kind+':'+q.seed)).size}})()`,
  );
  await screenshot(name);
  assert(wideFps.foreground, 'Minimum-zoom FPS sample was not foreground');
  log(
    'Real wheel reaches minimum zoom; dense view remains playable',
    `${wideFps.rafFps.toFixed(1)} FPS, ${wideFps.visibleProps.uniqueOrganicSeeds} unique organic sprites at (${wideFps.player.x.toFixed(1)},${wideFps.player.y.toFixed(1)})`,
  );
  if (wideFps.rafFps < 40)
    finding(
      `Minimum zoom renders ${wideFps.rafFps.toFixed(1)} FPS; CPU profile and visible sprite counts recorded.`,
    );
}

async function wildBotanyCheck() {
  const candidate = await read(`(()=>{
    const host=window.stichos.state.player,all=window.stichos.props(host.x,host.y,12);
    const plants=all.filter(p=>['cequin','heartleaf','emberroot','mushroom'].includes(p.kind)&&!p.id.startsWith('origin:')&&Math.hypot(p.x-host.x,p.y-host.y)<9).sort((a,b)=>Math.hypot(a.x-host.x,a.y-host.y)-Math.hypot(b.x-host.x,b.y-host.y));
    for(const prop of plants)for(const dx of [-1,1]){
      const approach={x:prop.x+dx,y:prop.y};
      if([[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]].some(([x,y])=>window.stichos.blocked(approach.x+x,approach.y+y)))continue;
      if(all.some(q=>q.id!==prop.id&&Math.hypot(q.x-approach.x,q.y-approach.y)<1.2))continue;
      return {prop,approach,profile:window.stichos.botanicalProfile(prop)};
    }
    return null;
  })()`);
  assert(candidate?.profile, 'No accessible wild botanical specimen near the road');
  const { prop, approach, profile } = candidate;
  await clickWalk(approach, 0.2, 'approach generated wild plant');
  const pos = await read(
    `(()=>{const p=window.stichos.worldToScreen({x:${prop.x},y:${prop.y - 0.25}}),r=document.querySelector('#s-world').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}})()`,
  );
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
  await delay(220);
  const hover = await read(
    'document.querySelector("#s-hover").hidden ? "" : document.querySelector("#s-hover").textContent',
  );
  const prompt = await read(
    'document.querySelector("#s-context").hidden ? "" : document.querySelector("#s-context").textContent',
  );
  assert(
    hover.includes(profile.name) &&
      hover.includes(`${profile.yield} portions`) &&
      hover.includes(profile.construction),
    'Wild plant hover differs from generated profile',
  );
  assert(
    prompt.toLowerCase().includes(profile.name.toLowerCase()) &&
      prompt.includes(`${profile.yield} portions`),
    'Nearby harvest prompt omits actual plant name or yield',
  );
  await screenshot('02b-wild-plant-profile');
  const item = prop.kind === 'mushroom' ? 'rations' : prop.kind;
  const before = (await state()).inventory[item] ?? 0;
  await tap('e');
  await waitFor(
    `window.stichos.state.removed.includes(${JSON.stringify(prop.id)})`,
    'wild botanical harvest',
  );
  assert(
    ((await state()).inventory[item] ?? 0) === before + profile.yield,
    'Actual wild harvest differs from displayed generated yield',
  );
  await screenshot('02c-wild-plant-harvest');
  await clickWalk({ x: 0, y: 32 }, 0.2, 'return from wild plant to south road');
  log(
    'Generated wild botanical hover and nearby prompt agree with actual harvest',
    `${profile.name}: ${profile.yield} ${item}`,
  );
  return { id: prop.id, item, amount: profile.yield, x: prop.x, y: prop.y };
}

async function expeditionChecks() {
  assert(
    (await state()).worldGeneration === 2,
    'Expedition needs the versioned climate/vault world',
  );
  await tap('3');
  for (const id of ['origin:cequin', 'origin:heartleaf', 'origin:heartleaf:2'])
    await interactTarget(id);
  await tap('b');
  await click('[data-craft="salve"]');
  await click('[data-craft="salve"]');
  await interactTarget('origin-engineer', 'npc');
  await click('[data-choice="dispatch:request"]');
  const job = (await state()).correspondenceJobs.find(
    (j) => j.sourceId === 'origin-engineer' && j.status === 'active',
  );
  assert(
    job && distance(job.target, (await state()).player) > 40,
    'Dispatch must target a real distant recipient',
  );
  assert(
    await read(
      `document.querySelector('#s-quest-title').textContent===window.stichos.state.quests.find(q=>q.id===${JSON.stringify('correspondence:' + job.sourceId + ':' + job.number)})?.title`,
    ),
    'Newly accepted dispatch is not tracked in the sidebar',
  );
  await screenshot('01-dispatch-accepted');
  await closeDialogue();
  log(
    'Memorized dispatch targets a real person in another generated settlement',
    `${job.recipientName}, ${job.settlementName}`,
  );
  await viewport(390, 844, true);
  await tap('j');
  await waitFor('window.stichos.state.modal==="journal"', 'actual mobile journal');
  await screenshot('02-mobile-journal');
  await tap('Escape');
  await viewport(1600, 1000);
  await clickWalk({ x: 0, y: 5 }, 0.25, 'join south road');
  const site = (await read('window.stichos.vaults(40,40,1)'))[0];
  assert(site, 'First excavation missing');
  await roadAxis('y', 32);
  const harvestedPlant = await wildBotanyCheck();
  await roadAxis('y', 80);
  await roadAxis('x', site.entrance.x);
  await interactTarget(`${site.id}:notice`);
  await screenshot('03-vault-road-sign');
  await click('[data-choice="vault:survey"]');
  assert(
    (await state()).quests.some(
      (q) => q.id === `${site.id}:survey` && !q.complete && distance(q.target, site.reward) === 0,
    ),
    'Notice did not mark the actual deep archive',
  );
  assert(
    await read(
      `document.querySelector('#s-quest-title').textContent===window.stichos.state.quests.find(q=>q.id===${JSON.stringify(site.id + ':survey')})?.title`,
    ),
    'Newly accepted vault task is not tracked in the sidebar',
  );
  log('Newly accepted dispatch and vault task automatically replace the tracked sidebar objective');
  await roadAxis('x', site.entrance.x);
  await roadAxis('y', site.entrance.y);
  await screenshot('04-vault-entrance');
  console.log('SHOT 04-vault-entrance.png');
  await vaultWalk(site, site.reward);
  for (let i = 0; i < 24; i++) {
    const current = await state();
    const enemies = current.npcs
      .filter((n) => n.id.startsWith(`${site.id}:guard:`) && n.hp > 0)
      .sort((a, b) => distance(a, current.player) - distance(b, current.player));
    if (!enemies.length) break;
    if (distance(enemies[0], current.player) > current.weaponProfile.range - 0.03)
      await vaultWalk(site, enemies[0]);
    else {
      await combatNearby();
      await delay(150);
    }
  }
  assert(
    (await state()).removed.filter((id) => id.startsWith(`${site.id}:guard:`)).length === 2,
    'Both actual vault guards must be defeated',
  );
  await screenshot('05-vault-combat-cleared');
  await vaultWalk(site, site.reward);
  const chest = (await read(`window.stichos.props(${site.reward.x},${site.reward.y},3)`)).find(
    (p) => p.id === `${site.id}:cache`,
  );
  assert(chest, 'Deep archive chest missing');
  const before = await state(),
    herb = ['cequin', 'heartleaf', 'emberroot'][chest.seed % 3];
  await interactTarget(chest.id);
  await waitFor(
    `window.stichos.state.opened.includes(${JSON.stringify(chest.id)})`,
    'archive opened',
  );
  const looted = await state();
  for (const [item, amount] of [
    [herb, 3],
    ['ore', 2],
    ['rations', 1],
  ])
    assert(
      (looted.inventory[item] ?? 0) === (before.inventory[item] ?? 0) + amount,
      `Archive ${item} reward incorrect`,
    );
  assert(looted.player.coins === before.player.coins + 12, 'Archive coin reward incorrect');
  assert(
    looted.quests.find((q) => q.id === `${site.id}:survey`)?.complete,
    'Archive quest did not complete',
  );
  await screenshot('06-deep-archive-recovered');
  log(
    'Actual keyboard movement follows connected vault passages; two raiders defeated with attacks and ward',
  );
  log(
    'Deep archive gives exact seeded herbs, ore, rations and coins, completing the marked journal task',
  );
  await interactTarget(chest.id);
  assert((await state()).player.coins === looted.player.coins, 'Archive reward duplicated');
  await vaultWalk(site, site.entrance);
  await roadAxis('y', 80);
  await roadAxis('x', 0);
  const grid = { x: Math.round(job.target.x / 80) * 80, y: Math.round(job.target.y / 80) * 80 };
  await roadAxis('y', 0);
  await roadAxis('x', grid.x);
  await roadAxis('y', grid.y);
  const building = await read(`window.stichos.tile(${job.target.x},${job.target.y}).building`);
  let door;
  if (building) {
    door = (await read(`window.stichos.props(${job.target.x},${job.target.y},16)`)).find(
      (p) => p.id === `${building}:door:1`,
    );
    if (door) {
      await keyWalkNear({ x: door.x, y: door.y + 2 }, 0.3);
      await interactTarget(door.id);
      await keyWalkNear({ x: door.x, y: door.y - 1 }, 0.3);
    }
  }
  await interactTarget(job.recipientId, 'npc');
  await screenshot('07-dispatch-recipient');
  const choices = (await state()).dialogue.choices;
  for (const kind of ['deliver', 'reveal', 'withhold'])
    assert(
      choices.some((c) => c.id === `dispatch:${kind}:${job.sourceId}` && !c.disabled),
      `Missing meaningful ${kind} decision`,
    );
  const beforeDelivery = await state();
  await click(`[data-choice="dispatch:deliver:${job.sourceId}"]`);
  const delivered = await state();
  assert(
    delivered.correspondenceJobs.find((j) => j.sourceId === job.sourceId)?.status === 'delivered',
    'Dispatch decision did not persist',
  );
  assert(
    delivered.player.coins === beforeDelivery.player.coins + job.reward,
    'Dispatch payment differs from offered reward',
  );
  const expectedRep = [...beforeDelivery.reputation];
  expectedRep[job.sourceClan] += 7;
  expectedRep[job.recipientClan] += 2;
  assert(
    JSON.stringify(delivered.reputation) === JSON.stringify(expectedRep),
    'Dispatch did not change both family relationships',
  );
  await screenshot('08-dispatch-delivered');
  await closeDialogue();
  log(
    'Road travel reaches the actual dispatch recipient; three decisions offered; chosen delivery pays and changes both clans',
  );
  await tap('Escape');
  const saved = await state();
  await page.send('Page.reload', { ignoreCache: true });
  await waitFor('document.querySelector("#s-continue")&&window.stichos', 'expedition saved title');
  await click('#s-continue');
  await waitFor('!window.stichos.state.paused', 'expedition continuation');
  const restored = await state();
  assert(
    restored.worldGeneration === 2 && distance(restored.player, saved.player) < 0.02,
    'Expedition save lost generation or position',
  );
  assert(
    restored.opened.includes(chest.id) &&
      restored.quests.find((q) => q.id === `${site.id}:survey`)?.complete &&
      restored.correspondenceJobs.find((j) => j.sourceId === job.sourceId)?.status === 'delivered',
    'Expedition save lost archive or dispatch outcomes',
  );
  assert(
    restored.removed.includes(harvestedPlant.id) &&
      !(await read(
        `window.stichos.props(${harvestedPlant.x},${harvestedPlant.y},1).some(p=>p.id===${JSON.stringify(harvestedPlant.id)})`,
      )),
    'Save/Continue regenerated the harvested wild plant',
  );
  assert(
    JSON.stringify(restored.inventory) === JSON.stringify(saved.inventory),
    'Save/Continue lost harvested inventory',
  );
  log('Save/Continue preserves the generated wild plant removal and actual inventory');
  await screenshot('09-expedition-continued');
  log('Save/Continue preserves generation2, position, archive and dispatch outcomes');
  await roadAxis('x', grid.x);
  await roadAxis('y', 40);
  await wideViewCheck('10-dense-forest-minimum-zoom');
  assert(errors.length === 0, 'Browser reported runtime or console errors');
  log('No browser console or runtime errors');
}

async function possessionChecks() {
  await click('#s-continue');
  await waitFor('!window.stichos.state.paused', 'continue the completed QA life');
  const initial = await state();
  assert(
    initial.transferReady,
    'Run the full route first so its actual radio repair unlocks transfer',
  );
  const shrine = await read(
    '(()=>{const p=window.stichos.state.player;return window.stichos.props(p.x,p.y,64).filter(q=>q.kind==="shrine"&&q.id.endsWith(":shrine")).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]})()',
  );
  assert(shrine, 'No settlement shrine near the saved road position');
  const until = Date.now() + 50000;
  while (Date.now() < until) {
    const s = await state();
    assert(s.phase === 'playing' && !s.paused, 'Return to shrine interrupted');
    if (Math.abs(s.player.x - shrine.x) < 0.3) break;
    await setKeys([s.player.x > shrine.x ? 'a' : 'd']);
    await sustain();
    await delay(100);
  }
  await setKeys([]);
  assert(
    Math.abs((await state()).player.x - shrine.x) < 0.5,
    'Could not follow the road back to the shrine',
  );
  await interactTarget(shrine.id);
  await waitFor(
    `window.stichos.state.dialogue?.npcId===${JSON.stringify(shrine.id)}`,
    'shrine dialogue',
  );
  const before = await state(),
    candidate = before.transferCandidate;
  assert(
    candidate && candidate.hp > 0 && !candidate.hostile,
    'Shrine must name a living eligible person',
  );
  assert(
    before.dialogue.choices.some(
      (c) => c.id === 'transfer' && !c.disabled && c.label.includes(candidate.name),
    ),
    'Transfer choice must name its actual recipient',
  );
  await screenshot('01-named-recipient');
  await click('[data-choice="transfer"]');
  await waitFor('window.stichos.state.transfer', 'mind-transfer animation');
  await screenshot('02-transfer');
  await click('#s-skip');
  await waitFor('!window.stichos.state.transfer&&!window.stichos.state.paused', 'occupied life');
  await delay(300);
  const after = await state();
  assert(
    after.occupiedNpcId === candidate.id && after.player.bodyName === candidate.name,
    'Mind did not enter the named NPC',
  );
  assert(
    distance(after.player, candidate) < 0.02,
    'Mind transfer did not use the NPC actual location',
  );
  for (const field of [
    'skin',
    'hair',
    'coat',
    'trim',
    'trousers',
    'height',
    'build',
    'hairStyle',
    'hat',
    'cloak',
  ])
    assert(
      after.player.appearance[field] === candidate.appearance[field],
      `Possession did not adopt recipient ${field}`,
    );
  assert(
    !after.npcs.some((n) => n.id === candidate.id),
    'Occupied NPC is still duplicated in active population',
  );
  const previous = after.npcs.find(
    (n) => n.name === before.player.bodyName && n.id !== candidate.id,
  );
  assert(
    previous && distance(previous, before.player) < 0.02,
    'Previous priest body did not remain at its actual position',
  );
  assert(after.storyStage === before.storyStage, 'Mind transfer lost remembered story');
  assert(
    JSON.stringify(after.inventory) !== JSON.stringify(before.inventory),
    'Recipient incorrectly inherited the priest’s physical pack',
  );
  assert(
    Object.values(after.inventory).every((n) => Number.isInteger(n) && n > 0) &&
      Object.values(after.inventory).reduce((a, b) => a + b, 0) <= 60 &&
      Number.isInteger(after.player.coins) &&
      after.player.coins >= 0,
    'Recipient possessions are not finite, valid supplies',
  );
  await screenshot('03-existing-person-occupied');
  log(
    'Mind enters the named living NPC at its actual location',
    `${candidate.name} (${candidate.role}) at ${candidate.x.toFixed(1)},${candidate.y.toFixed(1)}`,
  );
  log('Recipient anatomy/clothing adopted; duplicate suppressed; priest remains at shrine');
  log('Recipient has a separate physical pack while story remains remembered');
  await tap('Escape');
  const saved = await state();
  await page.send('Page.reload', { ignoreCache: true });
  await waitFor('document.querySelector("#s-continue")&&window.stichos', 'possession save title');
  await click('#s-continue');
  await waitFor('!window.stichos.state.paused', 'occupied save continuation');
  const restored = await state();
  assert(
    restored.occupiedNpcId === saved.occupiedNpcId &&
      restored.player.bodyName === saved.player.bodyName &&
      distance(restored.player, saved.player) < 0.02,
    'Continue lost occupied body',
  );
  assert(
    restored.npcs.some((n) => n.id === previous.id),
    'Continue lost the body left behind',
  );
  assert(
    JSON.stringify(restored.inventory) === JSON.stringify(saved.inventory) &&
      restored.player.coins === saved.player.coins &&
      JSON.stringify(restored.weapons) === JSON.stringify(saved.weapons),
    'Continue changed the occupied body’s belongings',
  );
  await screenshot('04-occupied-save-restored');
  log('Save and Continue preserve occupied person and the body left behind');
  await interactTarget(shrine.id);
  await waitFor(
    `window.stichos.state.dialogue?.npcId===${JSON.stringify(shrine.id)}`,
    'return shrine dialogue',
  );
  const returning = (await state()).transferCandidate;
  assert(
    returning?.id === previous.id,
    'Nearby former priest must be available as the return recipient',
  );
  await click('[data-choice="transfer"]');
  await waitFor('window.stichos.state.transfer', 'return animation');
  await click('#s-skip');
  await waitFor('!window.stichos.state.transfer&&!window.stichos.state.paused', 'return to priest');
  assert(
    (await state()).occupiedNpcId === previous.id &&
      (await state()).player.bodyName === before.player.bodyName,
    'Could not return to the original priest',
  );
  const returned = await state();
  assert(
    JSON.stringify(returned.inventory) === JSON.stringify(before.inventory) &&
      returned.player.coins === before.player.coins &&
      JSON.stringify(returned.weapons) === JSON.stringify(before.weapons),
    'Returning to the priest did not restore the exact physical belongings left with that body',
  );
  await delay(700);
  assert(!(await state()).transfer, 'A second unwanted transfer animation started');
  await screenshot('05-return-to-priest');
  log('Mind can return to the actual priest body without a duplicate animation');
  log('Returning restores the priest’s exact pack, coins, and weapons');
  assert(errors.length === 0, `Browser emitted ${errors.length} errors`);
  log('No browser console or runtime errors');
  await tap('Escape');
}

try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl, (method, params) => {
    if (method.startsWith('Browser.download')) downloads.push({ method, ...params });
  });
  if (visualOnly || expeditionOnly)
    ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
  if (!visualOnly && !possessionOnly && !expeditionOnly && !smoke) {
    fs.mkdirSync(downloadHost, { recursive: true });
    await browser.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadWorkspace,
      eventsEnabled: true,
    });
  }
  ({ targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    background: false,
    ...(contextId ? { browserContextId: contextId } : {}),
  }));
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  page = await connect(
    targets.find((t) => t.id === targetId).webSocketDebuggerUrl,
    (method, params) => {
      if (method === 'Runtime.exceptionThrown')
        errors.push({ method, details: params.exceptionDetails });
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
        errors.push({ method, details: params.args });
      if (method === 'Log.entryAdded' && params.entry.level === 'error')
        errors.push({ method, details: params.entry });
    },
  );
  for (const method of ['Runtime.enable', 'Log.enable', 'Page.enable', 'Network.enable'])
    await page.send(method);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await viewport(1600, 1000);
  await page.send('Page.navigate', { url: baseUrl.href });
  await waitFor(
    'window.stichos?.state && document.querySelector("#s-seed-input")',
    'Stíchos title',
    30000,
  );
  if (possessionOnly) {
    await possessionChecks();
  } else {
    await screenshot('01-title');
    await click('#s-seed-input');
    for (const type of ['keyDown', 'keyUp'])
      await page.send('Input.dispatchKeyEvent', {
        type,
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
        modifiers: 2,
      });
    await page.send('Input.insertText', { text: '0x53544943' });
    await click('#s-start button[type=submit]');
    await waitFor('window.stichos.state.transfer', 'opening transfer');
    await delay(700);
    await screenshot('02-mind-transfer');
    await click('#s-skip');
    await waitFor(
      '!window.stichos.state.transfer && !window.stichos.state.paused',
      'playable world',
    );
    assert(
      (await state()).player.appearance.weapon === 'staff',
      'Default humanoid must carry a staff',
    );
    await screenshot('03-cathedral-world');
    log('Seed entry, visible mind-transfer sequence, skip button, and humanoid staff host');
    if (expeditionOnly) {
      await expeditionChecks();
    } else if (visualOnly) {
      await delay(3000);
      if (profileVisual) {
        await page.send('Profiler.enable');
        await page.send('Profiler.start');
      }
      fps = await read(
        'new Promise(resolve=>{const times=[],start=performance.now();function tick(t){times.push(t);if(t-start>2000)resolve({frames:times.length,elapsedMs:t-times[0],rafFps:(times.length-1)*1000/(t-times[0]),reported:window.stichos.fps,foreground:!document.hidden&&document.hasFocus()});else requestAnimationFrame(tick)}requestAnimationFrame(tick)})',
      );
      if (profileVisual) {
        const { profile } = await page.send('Profiler.stop');
        fs.writeFileSync(path.join(out, `${visualName}.cpuprofile`), JSON.stringify(profile));
      }
      await screenshot(visualName);
      log('Warm-cache visual comparison', `${fps.rafFps.toFixed(1)} FPS at 1600×1000`);
      await tap('k');
      await waitFor('window.stichos.state.modal==="gear"', 'equipment components');
      assert(
        await read('document.querySelectorAll(".s-gear-cards article").length===3'),
        'Gear panel did not show three composed weapon profiles',
      );
      assert(
        await read(
          '!document.querySelector(".s-gear-cards [data-equip=staff]").disabled&&document.querySelector(".s-gear-cards [data-equip=sword]").disabled&&document.querySelector(".s-gear-cards [data-equip=bow]").disabled',
        ),
        'Gear ownership controls do not match the opening staff host',
      );
      await screenshot(`${visualName}-gear`);
      await click('.s-gear-cards [data-equip="staff"]');
      assert(
        (await state()).player.appearance.weapon === 'staff',
        'Owned staff could not be equipped',
      );
      if ((await state()).paused) await tap('Escape');
      log('K opens composed gear profiles; equipment controls respect body ownership');
      if (mobileVisual) {
        await viewport(390, 844);
        await delay(500);
        assert(
          await read('document.documentElement.scrollWidth<=innerWidth+1'),
          'Mobile world has horizontal overflow',
        );
        await screenshot(`${visualName}-mobile-world`);
        await tap('i');
        await delay(150);
        assert(
          await read('document.documentElement.scrollWidth<=innerWidth+1'),
          'Mobile satchel has horizontal overflow',
        );
        await screenshot(`${visualName}-mobile-inventory`);
        await tap('i');
        await tap('j');
        await waitFor('window.stichos.state.modal==="journal"', 'mobile journal');
        await delay(150);
        assert(
          await read('document.documentElement.scrollWidth<=innerWidth+1'),
          'Mobile journal has horizontal overflow',
        );
        await screenshot(`${visualName}-mobile-journal`);
        log(
          'Latest mobile world, satchel, and journal captured without horizontal overflow',
          '390×844',
        );
      }
      await wideViewCheck(`${visualName}-wide`);
    } else {
      const beforeMove = (await state()).player;
      await setKeys(['d']);
      await delay(550);
      await setKeys([]);
      assert((await state()).player.x > beforeMove.x + 0.5, 'D did not move east');
      await setKeys(['a']);
      await delay(550);
      await setKeys([]);
      log('WASD produces actual world movement');
      const beforeUse = await state();
      await tap('3');
      const afterUse = await state();
      assert(
        afterUse.inventory.cequin === beforeUse.inventory.cequin - 1 &&
          afterUse.player.cequinTime > 0,
        'Cequin key did not consume and sustain breath',
      );
      log('Cequin hotkey consumes a real item and sustains breathing');

      await interactTarget('origin-botanist', 'npc');
      await screenshot('04-botanist-dialogue');
      const botanistChoice = await chooseAvailable(['learn-cequin']);
      log(
        'Click approach and botanist dialogue choice',
        botanistChoice?.id ?? 'No enabled narrative choice',
      );
      await closeDialogue();
      await keyWalkNear((await state()).npcs.find((n) => n.id === 'origin-botanist'));
      await tap('e');
      assert(
        (await state()).dialogue?.npcId === 'origin-botanist',
        'E did not open the nearest botanist',
      );
      await closeDialogue();
      log('E opens a nearby conversation');

      for (const [keyName, modal, name] of [
        ['j', 'journal', '05-journal'],
        ['m', 'map', '06-map'],
        ['Escape', 'pause', '07-pause'],
      ]) {
        await tap(keyName);
        await waitFor(`window.stichos.state.modal===${JSON.stringify(modal)}`, modal);
        const time = (await state()).time;
        await delay(200);
        assert((await state()).time === time, `${modal} did not freeze simulation`);
        await screenshot(name);
        await tap('Escape');
      }
      await tap('i');
      await click('[data-item="cequin"]');
      await screenshot('08-inventory');
      await clickWalk({ x: 0, y: 5 }, 0.3, 'clear road for ability checks');
      await worldClick({ x: (await state()).player.x + 2, y: (await state()).player.y }, 'right');
      assert((await state()).player.attackCooldown > 0, 'Mouse attack did not execute');
      await tap('q');
      assert((await state()).player.wardCooldown > 0, 'Botanical ward did not execute');
      await screenshot('09-combat-controls');
      log('Journal/map/pause freeze time; inventory, mouse attack, and ward work');

      fps = await read(
        'new Promise(resolve=>{const times=[],start=performance.now();function tick(t){times.push(t);if(t-start>1800)resolve({frames:times.length,elapsedMs:t-times[0],rafFps:(times.length-1)*1000/(t-times[0]),reported:window.stichos.fps,foreground:!document.hidden&&document.hasFocus()});else requestAnimationFrame(tick)}requestAnimationFrame(tick)})',
      );
      assert(fps.foreground, 'Frame rate sample must be foreground');
      log('Desktop foreground frame rate', `${fps.rafFps.toFixed(1)} FPS at 1600×1000`);
      await viewport(390, 844, true);
      if (await read('document.querySelector("#app").classList.contains("satchel-open")'))
        await click('#s-mobile-pack');
      await screenshot('10-mobile-world');
      const fit = await read(
        '({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,touch:getComputedStyle(document.querySelector(".s-mobile-move")).display})',
      );
      if (fit.scrollWidth > 390 || fit.scrollHeight > 844)
        finding(`Mobile overflow: ${JSON.stringify(fit)}`);
      if (fit.touch === 'none') finding('Mobile movement controls are hidden');
      await click('#s-mobile-pack');
      await screenshot('11-mobile-inventory');
      await click('#s-mobile-pack');
      await tap('j');
      await screenshot('12-mobile-journal');
      await tap('Escape');
      await viewport(1600, 1000);

      if (!smoke) {
        // These are actual harvest actions on the guaranteed, reachable garden plots.
        for (const id of [
          'origin:cequin',
          'origin:cequin:2',
          'origin:cequin:3',
          'origin:heartleaf',
          'origin:heartleaf:2',
          'origin:emberroot',
          'origin:emberroot:2',
          'origin:timber:1',
          'origin:timber:2',
          'origin:ore:1',
          'origin:ore:2',
        ]) {
          const before = await state();
          await interactTarget(id);
          await waitFor(
            `window.stichos.state.removed.includes(${JSON.stringify(id)})`,
            `harvest ${id}`,
            5000,
          );
          assert(
            (await state()).removed.length > before.removed.length,
            'Harvest must change persistent world state',
          );
          const item = id.includes('timber')
            ? 'wood'
            : id.includes('ore:')
              ? 'ore'
              : id.split(':')[1];
          assert(
            (await state()).inventory[item] ===
              (before.inventory[item] ?? 0) + (item === 'cequin' ? 3 : 2),
            `Harvest ${id} did not yield the expected ${item}`,
          );
          await sustain();
        }
        await screenshot('13-garden-harvested');
        log('Harvested garden herbs, two timber trees, and two ore deposits through world clicks');
        await interactTarget('origin-botanist', 'npc');
        await chooseAvailable(['learn-cequin']);
        const beforeClinic = await state();
        await chooseAvailable(['aid-clinic']);
        const afterClinic = await state();
        assert(
          afterClinic.inventory.cequin === beforeClinic.inventory.cequin - 3,
          'Clinic choice must spend three actual Cequin',
        );
        assert(
          afterClinic.storyStage > beforeClinic.storyStage,
          'Clinic choice must advance the story',
        );
        log('Supplied clinic with three harvested Cequin and changed the story');
        await closeDialogue();
        await interactTarget('origin:workbench');
        await closeDialogue();
        await tap('b');
        const recipeButtons = await read(
          '[...document.querySelectorAll("[data-craft]")].map(e=>({id:e.dataset.craft,disabled:e.disabled,text:e.innerText}))',
        );
        for (const part of ['salve', 'lens']) {
          const recipe = recipeButtons.find((r) => r.id.includes(part));
          if (!recipe) {
            finding(`No ${part} recipe visible`);
            continue;
          }
          const before = await state();
          await click(`[data-craft=${JSON.stringify(recipe.id)}]`);
          await delay(250);
          const after = await state();
          assert(
            (after.inventory[part] ?? 0) > (before.inventory[part] ?? 0),
            `${part} craft did not produce its item`,
          );
          const cost = part === 'salve' ? { heartleaf: 2 } : { ore: 2, wood: 1 };
          for (const [item, amount] of Object.entries(cost))
            assert(
              after.inventory[item] === before.inventory[item] - amount,
              `${part} craft did not spend ${amount} ${item}`,
            );
          log(`Crafted ${part} through the recipe UI`, recipe.id);
        }
        await screenshot('14-crafting');
        await interactTarget('origin:hall:door:1');
        await keyWalkNear({ x: 0, y: -3 }, 0.35);
        await interactTarget('origin-archivist', 'npc');
        await chooseAvailable(['ask-sallas']);
        assert((await state()).storyStage >= 3, 'Archivist did not reveal the Sallas alignment');
        await screenshot('14b-sallas-record');
        await closeDialogue();
        await interactTarget('origin-engineer', 'npc');
        await chooseAvailable(['engineer-plan']);
        await closeDialogue();
        await interactTarget('origin-radio');
        await waitFor('window.stichos.state.dialogue?.npcId==="origin-radio"', 'radio interaction');
        const beforeRadio = await state();
        await chooseAvailable(['repair-radio']);
        const afterRadio = await state();
        assert(
          afterRadio.transferReady && afterRadio.storyStage === 4,
          'Repair did not establish the mind signal',
        );
        for (const [item, cost] of Object.entries({ wood: 2, ore: 2, lens: 1 }))
          assert(
            (afterRadio.inventory[item] ?? 0) === (beforeRadio.inventory[item] ?? 0) - cost,
            `Radio did not spend ${cost} ${item}`,
          );
        await screenshot('14c-radio-repaired');
        await closeDialogue();
        log(
          'Sallas record, engineer plan, and radio repair use the crafted lens and actual materials',
        );
        const merchant = (await state()).npcs.find((n) => n.role === 'merchant' && !n.hostile);
        if (merchant) {
          await interactTarget(merchant.id, 'npc');
          await screenshot('15-merchant');
          const choices = (await state()).dialogue?.choices ?? [];
          for (const kind of ['buy', 'sell']) {
            const choice = choices.find((c) => c.id.includes(kind) && !c.disabled);
            if (choice) {
              const before = await state();
              await click(`[data-choice=${JSON.stringify(choice.id)}]`);
              const after = await state();
              const item = choice.id.split(':')[1],
                price = Number(choice.label.match(/(\d+) coins/)?.[1]);
              assert(
                (after.inventory[item] ?? 0) ===
                  (before.inventory[item] ?? 0) + (kind === 'buy' ? 1 : -1),
                `${kind} did not exchange one ${item}`,
              );
              assert(
                after.player.coins === before.player.coins + (kind === 'buy' ? -price : price),
                `${kind} did not exchange the displayed coin price`,
              );
              log(`Merchant ${kind}`, choice.id);
            } else finding(`Merchant has no available ${kind} choice during this route`);
          }
          await closeDialogue();
        }
        await clickWalk({ x: 0, y: 0 }, 0.22, 'join trunk road');
        const start = (await state()).player,
          until = Date.now() + 100000;
        let enteredTown = false,
          townShot = false,
          nextLog = 32;
        await setKeys(['d', 'Shift']);
        while (Date.now() < until) {
          const s = await state();
          assert(s.phase === 'playing' && !s.paused, 'Long road walk interrupted');
          if (
            s.player.x > 40 &&
            (await read(`window.stichos.tile(${s.player.x},${s.player.y}).biome`)) === 'settlement'
          )
            enteredTown = true;
          if (enteredTown && !townShot && s.player.x >= 76) {
            await screenshot('16a-next-settlement');
            townShot = true;
            console.log('SHOT 16a-next-settlement.png');
          }
          if (s.player.x - start.x >= 110) break;
          if (s.player.x - start.x >= nextLog) {
            console.log(`ROAD ${Math.floor(s.player.x - start.x)} tiles`);
            nextLog += 32;
          }
          await sustain();
          await delay(300);
        }
        await setKeys([]);
        const after = await state();
        assert(after.player.x - start.x >= 110, 'Did not walk 110 continuous tiles');
        assert(enteredTown, 'Long walk did not pass through another generated settlement');
        assert(after.cacheSize <= 160, 'Chunk cache exceeded bound');
        await screenshot('16-long-road');
        log(
          'Continuous road travel streams chunks and reaches another settlement',
          `${(after.player.x - start.x).toFixed(1)} tiles, cache ${after.cacheSize}`,
        );
      }

      await tap('Escape');
      await waitFor('window.stichos.state.modal==="pause"', 'save pause');
      const saved = await state();
      if (!smoke) {
        await click('#s-save-file');
        const until = Date.now() + 10000;
        while (!downloads.some((d) => d.state === 'completed') && Date.now() < until)
          await delay(100);
        const download = downloads.find((d) => d.method === 'Browser.downloadWillBegin');
        assert(
          download && downloads.some((d) => d.guid === download.guid && d.state === 'completed'),
          'Completed campaign save download did not finish',
        );
        const name = path.basename(download.suggestedFilename);
        assert(name === download.suggestedFilename, 'Unexpected save filename');
        const source = path.join(downloadHost, name);
        const exported = JSON.parse(fs.readFileSync(source, 'utf8'));
        assert(
          exported.seed === saved.seed &&
            exported.player.x === saved.player.x &&
            exported.storyStage === saved.storyStage,
          'Downloaded campaign does not match played life',
        );
        exportedSave = {
          host: source,
          workspace: `${downloadWorkspace}/${name}`,
          artifact: path.join(out, 'completed-campaign.json'),
        };
        fs.copyFileSync(source, exportedSave.artifact);
        log('Completed campaign exported through the Download save control', exportedSave.artifact);
      }
      await page.send('Page.reload', { ignoreCache: true });
      await waitFor('document.querySelector("#s-continue")&&window.stichos', 'saved title', 20000);
      await click('#s-continue');
      await waitFor('!window.stichos.state.paused', 'continue saved life');
      const restored = await state();
      assert(distance(saved.player, restored.player) < 0.02, 'Continue changed saved position');
      assert(
        JSON.stringify(saved.removed) === JSON.stringify(restored.removed),
        'Continue lost harvested changes',
      );
      assert(
        JSON.stringify(saved.inventory) === JSON.stringify(restored.inventory),
        'Continue changed inventory',
      );
      await screenshot('17-continued-life');
      log(
        smoke
          ? 'Save and Continue restore position and inventory'
          : 'Save and Continue restore position, inventory, and harvested world changes',
      );
      assert(errors.length === 0, `Browser reported ${errors.length} console/runtime errors`);
      log('No browser console or runtime errors');
      await tap('Escape');
    }
  }
} catch (error) {
  failure = error;
  console.error(error.stack ?? error);
  if (page) {
    await setKeys([]).catch(() => {});
    await screenshot('99-failure').catch(() => {});
  }
} finally {
  final = page ? await state().catch(() => null) : null;
  const report = {
    started,
    finished: new Date(),
    mode: expeditionOnly
      ? 'expedition'
      : possessionOnly
        ? 'possession'
        : visualOnly
          ? 'visual'
          : smoke
            ? 'smoke'
            : 'full',
    endpoint,
    baseUrl: baseUrl.href,
    targetId,
    results,
    findings,
    errors,
    fps,
    wideFps,
    screenshots,
    failure: failure?.stack,
    final,
    exportedSave,
  };
  fs.writeFileSync(
    path.join(out, visualOnly ? `${visualName}-results.json` : 'results.json'),
    JSON.stringify(report, null, 2),
  );
  if (!visualOnly && !possessionOnly && !expeditionOnly)
    fs.writeFileSync(
      path.join(out, 'REPORT.md'),
      `# Stíchos browser QA\n\nRun: ${started.toISOString()}. ${failure ? '**FAIL** — ' + failure.message : findings.length ? '**Checks passed; findings remain.**' : '**PASS**'}. Mode: ${smoke ? 'smoke' : 'full'}.\n\nThe harness uses an isolated Agent Workspace Chromium tab, real CDP keyboard/mouse input, and read-only \`window.stichos\` diagnostics. It does not inject game state or directly write or clear browser storage; save changes come from normal game actions. The game runs on the separate localhost origin.\n\n## Verified\n\n${results.map((r) => '- ' + r.name + (r.details ? ': ' + r.details : '')).join('\n')}\n\n## Findings\n\n${findings.length ? findings.map((f) => '- ' + f).join('\n') : 'None observed.'}\n\n## Evidence and limits\n\nScreenshots and detailed results: [../../.dream-loop/stichos-qa/](../../.dream-loop/stichos-qa/). Browser errors: ${errors.length}. Desktop: 1600×1000. Mobile: 390×844. The FPS observation describes this isolated browser session; it is not a hardware benchmark. Audio quality, prolonged combat balance, death/mind-transfer recovery, and file import/export need separate checks.\n\n## Repeat\n\nDiscover the active workspace-owned endpoint with \`workspace_browser_targets\`, then run:\n\n\`\`\`sh\nnode scripts/browser-stichos-check.mjs http://127.0.0.1:PORT '${baseUrl.href}'${smoke ? ' --smoke' : ''}\n\`\`\`\n\nThe endpoint is ephemeral. The script creates and closes its own tab. Omit \`--smoke\` to include gathering, crafting, trading and 110-tile travel.\n`,
    );
  if (page) await page.send('Network.setBypassServiceWorker', { bypass: false }).catch(() => {});
  if (browser && targetId) await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  if (browser && contextId)
    await browser
      .send('Target.disposeBrowserContext', { browserContextId: contextId })
      .catch(() => {});
  if (browser && !visualOnly && !possessionOnly && !expeditionOnly && !smoke)
    await browser.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
  page?.close();
  browser?.close();
}
if (failure || findings.length) process.exitCode = 1;
