/**
 * Real-input browser acceptance check. Node 22.18+; no test-only game mutations.
 * Usage: node scripts/browser-check.mjs http://127.0.0.1:PORT [http://localhost:4174/?study=1] [expected-bundle.js]
 * The endpoint MUST belong to an isolated Agent Workspace Chromium.
 * A new localhost-origin tab protects a developer's 127.0.0.1-origin save.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWalkable, distance, ISO_Y } from '../src/game.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.argv[2];
const studyUrl = new URL(process.argv[3] || 'http://localhost:4174');
studyUrl.searchParams.set('study', '1');
const baseUrl = studyUrl.href;
const expectedBundle = process.argv[4];
if (!endpoint) throw new Error('Pass the isolated Agent Workspace loopback CDP endpoint.');
if (!['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname))
  throw new Error('CDP must be loopback.');
if (new URL(baseUrl).hostname !== 'localhost')
  throw new Error('Use localhost game origin to isolate the developer save.');
const out = path.join(root, '.dream-loop/qa');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, '99-failure.png'), { force: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const results = [],
  errors = [],
  shots = [],
  findings = [];
const started = new Date();
let browser, page, targetId, loadedScripts, fpsSample, ultrawideSample;
const held = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (name, details = '') => {
  results.push({ name, details });
  console.log(`PASS ${name}${details ? ': ' + details : ''}`);
};
function assert(value, message) {
  if (!value) throw new Error(message);
}
function check(value, message) {
  if (!value) {
    findings.push(message);
    console.warn(`FINDING ${message}`);
  }
  return !!value;
}

async function connect(url, events = () => {}) {
  // Node's native WebSocket omits Origin, as required by Agent Workspace CDP.
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timeout);
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else events(m.method, m.params);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const callId = ++id;
        const timeout = setTimeout(() => {
          pending.delete(callId);
          reject(new Error(`CDP timeout: ${method}`));
        }, 15000);
        pending.set(callId, { resolve, reject, timeout });
        ws.send(JSON.stringify({ id: callId, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}
async function evaluate(expression) {
  const r = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitFor(expression, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function click(selector) {
  let rect;
  for (let attempt = 0; attempt < 8; attempt++) {
    rect = await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error(${JSON.stringify('Missing selector: ' + selector)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth,height:innerHeight};})()`,
    );
    if (rect.y >= 8 && rect.y < rect.height - 8) break;
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.max(8, Math.min(rect.width - 8, rect.x)),
      y: rect.height / 2,
      deltaX: 0,
      deltaY: rect.y < 8 ? -rect.height * 0.65 : rect.height * 0.65,
    });
    await delay(180);
  }
  assert(
    rect.x > 0 && rect.x < rect.width && rect.y >= 8 && rect.y < rect.height - 8,
    `Click target is outside the visible viewport: ${selector}`,
  );
  const point = { x: rect.x, y: rect.y };
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...point,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...point,
  });
  await delay(120);
}
function keyInfo(key) {
  const special = {
    Escape: ['Escape', 27],
    Tab: ['Tab', 9],
    Enter: ['Enter', 13],
    Shift: ['ShiftLeft', 16],
    ' ': ['Space', 32],
  };
  return {
    key,
    code: special[key]?.[0] || `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: special[key]?.[1] || key.toUpperCase().charCodeAt(0),
  };
}
async function key(key, down) {
  await page.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', ...keyInfo(key) });
}
async function tap(k) {
  await key(k, true);
  await delay(50);
  await key(k, false);
  await delay(120);
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
async function state() {
  return evaluate('window.verso.state');
}
async function screenshot(name) {
  const r = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
  shots.push(name);
}
async function viewport(width, height, mobile = false) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
  await delay(250);
}

// A* plans a route against the same exported collision geometry as the game.
// It does not import a game instance or write browser state. Movement is WASD.
function lineWalkable(a, b) {
  const n = Math.ceil(distance(a, b) / 5);
  for (let i = 0; i <= n; i++)
    if (!isWalkable({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, 23))
      return false;
  return true;
}
function route(start, goal, range) {
  if (distance(start, goal) <= range) return [];
  const step = 24;
  const point = (gx, gy) => ({ x: gx * step, y: gy * step * ISO_Y });
  const startNode = { gx: Math.round(start.x / step), gy: Math.round(start.y / (step * ISO_Y)) };
  const open = [{ ...startNode, g: 0, f: distance(start, goal), parent: null }];
  const best = new Map();
  let end;
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const node = open.shift();
    const p = point(node.gx, node.gy);
    if (distance(p, goal) < range) {
      end = node;
      break;
    }
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const gx = node.gx + dx,
          gy = node.gy + dy,
          q = point(gx, gy),
          id = `${gx},${gy}`;
        if (!isWalkable(q, 26) || !lineWalkable(p, q)) continue;
        const g = node.g + Math.hypot(dx, dy) * step;
        if ((best.get(id) ?? Infinity) <= g) continue;
        best.set(id, g);
        open.push({ gx, gy, g, f: g + distance(q, goal), parent: node });
      }
    if (best.size > 15000) break;
  }
  assert(end, `No walkable route to ${JSON.stringify(goal)}`);
  const full = [];
  for (let n = end; n?.parent; n = n.parent) full.unshift(point(n.gx, n.gy));
  const simplified = [];
  let from = start,
    i = 0;
  while (i < full.length) {
    let j = i;
    while (j + 1 < full.length && lineWalkable(from, full[j + 1])) j++;
    simplified.push(full[j]);
    from = full[j];
    i = j + 1;
  }
  return simplified;
}
async function walkTo(goal, range = 45, label = '') {
  let s = await state();
  let nodes = route(s.player, goal, range);
  let stagnant = 0;
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    s = await state();
    assert(s.phase === 'playing', `Walking interrupted by ${s.phase}`);
    const modal = await evaluate('window.verso.modal');
    if (modal === 'pause') {
      await setKeys([]);
      await click('#resume');
    } else assert(!modal, `Unexpected modal while walking: ${modal}`);
    if (distance(s.player, goal) <= range) {
      await setKeys([]);
      return;
    }
    if (!nodes.length) nodes = route(s.player, goal, range);
    while (nodes.length > 1 && distance(s.player, nodes[0]) < 7) nodes.shift();
    const target = nodes[0] || goal;
    let dx = target.x - s.player.x,
      dy = (target.y - s.player.y) / ISO_Y;
    const absX = Math.abs(dx),
      absY = Math.abs(dy),
      keys = [];
    if (absX > Math.max(4, absY * 0.43)) keys.push(dx > 0 ? 'd' : 'a');
    if (absY > Math.max(4, absX * 0.43)) keys.push(dy > 0 ? 's' : 'w');
    if (!keys.length) {
      nodes.shift();
      continue;
    }
    await setKeys(keys);
    await delay(Math.max(40, Math.min(140, (distance(s.player, target) / 180) * 750)));
    const next = await state();
    if (distance(s.player, next.player) < 0.2) stagnant++;
    else stagnant = 0;
    if (stagnant >= 8) {
      await setKeys([]);
      nodes = route(next.player, goal, range);
      stagnant = 0;
    }
  }
  await setKeys([]);
  throw new Error(
    `Walk timed out (${label}) at ${JSON.stringify((await state()).player)} toward ${JSON.stringify(goal)}`,
  );
}
async function interactWith(entity, expected, label) {
  await walkTo(entity, entity.kind === 'portal' ? 55 : 42, label);
  await tap('e');
  await waitFor(expected, label, 3000);
  log(label);
}
async function deploy() {
  await click('#deploy-button');
  await waitFor('window.verso.modal===null', 'deployment');
  await delay(900);
}

let failure;
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  ({ targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    background: false,
  }));
  console.log(`Created independent QA target ${targetId}`);
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
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await viewport(1600, 1000);
  await page.send('Page.navigate', { url: baseUrl });
  await waitFor(
    'window.verso?.loaded && !!document.querySelector("#operative-name")',
    'title and assets',
    30000,
  );
  loadedScripts = await evaluate('Array.from(document.scripts).map(s=>s.src).filter(Boolean)');
  assert(
    !expectedBundle || loadedScripts.some((url) => url.endsWith('/' + expectedBundle)),
    'Loaded production bundle differs from expected: ' + loadedScripts.join(', '),
  );
  log('Current production bundle loaded with service worker bypassed', loadedScripts.join(', '));
  await screenshot('01-title');
  await click('#start-form button[type=submit]');
  assert(await evaluate('window.verso.modal === "title"'), 'Empty name should not deploy');
  log('Required name validation');
  await click('#operative-name');
  // Select existing field text through real keyboard events, then type through CDP input.
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  });
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  });
  await page.send('Input.insertText', { text: 'QA Traveler' });
  await click('#start-form button[type=submit]');
  await waitFor('window.verso.modal === "briefing"', 'briefing');
  assert((await state()).name === 'QA Traveler', 'Name not persisted into briefing');
  log('Name entry and briefing');
  await screenshot('02-briefing');
  await deploy();
  await screenshot('03-game');
  log('Deployment');
  fpsSample = await evaluate(
    'new Promise(resolve=>{const times=[],reported=[];const start=performance.now();const foreground=!document.hidden&&document.hasFocus();function frame(t){times.push(t);if(times.length%15===0)reported.push(window.verso.fps);if(t-start>=2000){const elapsed=times.at(-1)-times[0];resolve({foreground,frames:times.length,elapsedMs:elapsed,rafFps:(times.length-1)*1000/elapsed,diagnosticFps:reported});}else requestAnimationFrame(frame);}requestAnimationFrame(frame);})',
  );
  assert(fpsSample.foreground, 'FPS sample was not taken in the foreground');
  log(
    'Foreground desktop frame-rate sample',
    `${fpsSample.rafFps.toFixed(1)} FPS over ${(fpsSample.elapsedMs / 1000).toFixed(2)} s at 1600 × 1000; diagnostic ${fpsSample.diagnosticFps.join(', ')}`,
  );

  await tap('Escape');
  await waitFor('window.verso.modal === "pause"', 'pause');
  const beforePause = (await state()).time;
  await delay(350);
  assert((await state()).time === beforePause, 'Simulation advanced while paused');
  await screenshot('04-pause');
  await click('#open-journal');
  await waitFor('window.verso.modal === "journal"', 'journal');
  await screenshot('05-journal');
  await tap('Escape');
  assert(await evaluate('window.verso.modal===null'), 'Journal Escape did not return to game');
  log('Pause freezes simulation; journal opens and closes');

  for (const [width, height, name] of [
    [390, 844, 'portrait'],
    [844, 390, 'landscape'],
  ]) {
    await viewport(width, height, true);
    await screenshot(`06-mobile-${name}`);
    const overflow = await evaluate(
      '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,joystick:getComputedStyle(document.querySelector(".touch-controls")).display})',
    );
    const fits = check(
      overflow.scrollWidth <= width && overflow.scrollHeight <= height,
      `Mobile page overflow: ${JSON.stringify(overflow)}`,
    );
    check(overflow.joystick !== 'none', `Touch controls missing in ${name}`);
    await tap('j');
    await screenshot(`07-mobile-${name}-journal`);
    const modalRect = await evaluate(
      '(()=>{const r=document.querySelector(".journal-panel").getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()',
    );
    // Tall dialogs may scroll below the viewport, but their top must remain reachable.
    const journalFits = check(
      modalRect.x >= -1 && modalRect.y >= -1 && modalRect.right <= width + 1,
      `Mobile ${name} journal starts outside viewport: ${JSON.stringify(modalRect)}`,
    );
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: width / 2,
      y: height / 2,
      deltaX: 0,
      deltaY: 2000,
    });
    await delay(350);
    const returnRect = await evaluate(
      '(()=>{const r=document.querySelector("#journal-return").getBoundingClientRect();return {y:r.y,bottom:r.bottom};})()',
    );
    const returnFits = check(
      returnRect.y >= 0 && returnRect.bottom <= height,
      `Mobile ${name} journal return button unreachable after scrolling: ${JSON.stringify(returnRect)}`,
    );
    await screenshot(`07-mobile-${name}-journal-bottom`);
    if (returnFits) await click('#journal-return');
    else await tap('Escape');
    if (fits && journalFits && returnFits)
      log(
        `Mobile ${name} content reachable`,
        `${width} × ${height}; scrolled to and clicked journal return`,
      );
  }
  await viewport(390, 844, true);
  const joy = await evaluate(
    '(()=>{const r=document.querySelector("#joystick").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()',
  );
  const beforeTouch = (await state()).player;
  await page.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: joy.x + 30, y: joy.y }],
  });
  await delay(500);
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert(distance(beforeTouch, (await state()).player) > 20, 'Touch joystick did not move player');
  log('Touch joystick moves player');
  await viewport(2560, 720);
  const beforeSouth = (await state()).player;
  await screenshot('07b-ultrawide-before-south');
  await setKeys(['s']);
  await delay(700);
  await setKeys([]);
  await delay(180);
  const afterSouth = (await state()).player;
  ultrawideSample = await evaluate(
    '({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,player:window.verso.state.player,screen:window.verso.worldToScreen(window.verso.state.player)})',
  );
  ultrawideSample.southDistance = distance(beforeSouth, afterSouth);
  assert(
    afterSouth.y > beforeSouth.y + 30,
    'Ultrawide southern movement did not advance the player',
  );
  assert(
    ultrawideSample.scrollWidth === 2560 && ultrawideSample.scrollHeight === 720,
    'Ultrawide viewport overflowed',
  );
  assert(
    ultrawideSample.screen.x > 40 &&
      ultrawideSample.screen.x < 2520 &&
      ultrawideSample.screen.y > 80 &&
      ultrawideSample.screen.y < 670,
    'Ultrawide camera clipped the moving player: ' + JSON.stringify(ultrawideSample.screen),
  );
  await screenshot('07c-ultrawide-after-south');
  log(
    'Ultrawide southern movement keeps player visible',
    `2560 × 720; ${ultrawideSample.southDistance.toFixed(1)} ground units; player screen (${ultrawideSample.screen.x.toFixed(1)}, ${ultrawideSample.screen.y.toFixed(1)})`,
  );
  await viewport(1600, 1000);

  for (const subtype of ['deer', 'mushroom', 'crystal']) {
    const entity = (await state()).entities.find((e) => e.subtype === subtype);
    await interactWith(
      entity,
      `window.verso.state.entities.find(e=>e.subtype===${JSON.stringify(subtype)}).scanned`,
      `Catalog ${entity.name}`,
    );
  }
  assert((await state()).catalog.length === 3, 'Survey catalog incomplete');
  await screenshot('08-survey-complete');
  await interactWith(
    (await state()).entities.find((e) => e.kind === 'portal'),
    'window.verso.state.phase === "complete"',
    'Return survey through gate',
  );
  assert(
    (await state()).integrity === 100 && (await state()).kills === 0,
    'Peaceful survey changed integrity or kill count',
  );
  await screenshot('09-survey-debrief');
  await click('#complete-journal');
  assert(
    await evaluate('document.querySelectorAll(".history-list li").length===1'),
    'Journal history missing completed survey',
  );
  await click('#journal-return');
  assert(await evaluate('window.verso.modal==="complete"'), 'Debrief journal failed to return');
  await click('#next-assignment');
  await deploy();

  for (let order = 0; order < 3; order++) {
    const entity = (await state()).entities.find((e) => e.kind === 'relay' && e.order === order);
    await interactWith(
      entity,
      `window.verso.state.relays.length === ${order + 1}`,
      `Align relay ${order + 1}`,
    );
  }
  await screenshot('10-relays-complete');
  await interactWith(
    (await state()).entities.find((e) => e.kind === 'portal'),
    'window.verso.state.phase === "complete"',
    'Return relay assignment through gate',
  );
  await screenshot('11-relay-debrief');
  await click('#next-assignment');
  await deploy();
  let witness = (await state()).entities.find((e) => e.kind === 'survivor');
  await interactWith(
    witness,
    'window.verso.state.entities.find(e=>e.kind==="survivor").state === "following"',
    'Recruit archivist',
  );
  await screenshot('12-archivist-following');
  // A short westward detour stays below the blocking eastern ruin. Walking,
  // rather than running, lets the witness follow without losing the link.
  await walkTo({ x: 1050, y: 600 }, 25, 'escort west detour');
  await walkTo({ x: 1010, y: 480 }, 25, 'escort north approach');
  const portal = (await state()).entities.find((e) => e.kind === 'portal');
  await walkTo(portal, 35, 'escort gate');
  await waitFor('window.verso.state.rescued', 'archivist rescue', 8000);
  log('Escort archivist safely to gate');
  await tap('e');
  await waitFor('window.verso.modal === "reveal"', 'reveal');
  assert((await state()).history.length === 3, 'All three assignment records should exist');
  await screenshot('13-reveal');
  log(
    'Three-assignment reveal',
    `Integrity ${(await state()).integrity}%; kills ${(await state()).kills}`,
  );
  await click('#walk-away');
  await screenshot('14-epilogue');
  await click('#epilogue-journal');
  await screenshot('15-final-journal');
  await click('#journal-return');
  await click('#epilogue-title-button');
  await click('#continue-button');
  await waitFor('window.verso.modal === "reveal"', 'restored reveal');
  log('Epilogue, journal, title, and saved continuation');
  await click('#endless');
  await deploy();
  assert(
    (await state()).mission === 3 && (await state()).endless,
    'Independent crossings not unlocked',
  );
  await screenshot('16-endless');
  log('Independent crossing unlocked');

  const beforeDash = (await state()).player;
  await tap(' ');
  await delay(200);
  assert(distance(beforeDash, (await state()).player) > 45, 'Dash did not move the player');
  assert((await state()).player.stamina < 100, 'Dash did not consume stamina');
  log('Dash moves and consumes stamina');
  const aim = await evaluate(
    'window.verso.worldToScreen({x:window.verso.state.player.x+200,y:window.verso.state.player.y-120})',
  );
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...aim });
  for (const [button, ability] of [
    ['left', 'blade'],
    ['right', 'pulse'],
  ]) {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button,
      clickCount: 1,
      ...aim,
    });
    await delay(50);
    assert(
      (await state()).player.cooldowns[ability] > 0,
      `Mouse ${button} did not trigger ${ability}`,
    );
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button,
      clickCount: 1,
      ...aim,
    });
    log(`Mouse ${button} triggers ${ability}`);
  }
  // Deliberately let a sentinel attack through normal simulation, then test the
  // life-cycle path. This is after the peaceful campaign assertions above.
  await walkTo(
    (await state()).entities.find((e) => e.kind === 'enemy'),
    32,
    'sentinel damage',
  );
  await waitFor('window.verso.state.player.hp <= 72', 'sentinel damage', 25000);
  const beforeMend = (await state()).player;
  await tap('q');
  const afterMend = (await state()).player;
  assert(
    afterMend.hp > beforeMend.hp && afterMend.fragments === beforeMend.fragments - 1,
    'Mend did not heal and consume one fragment',
  );
  log('Mend heals and consumes one fragment');
  await waitFor('window.verso.modal === "dead"', 'death from sentinel', 45000);
  const deadState = await state();
  const dropped = deadState.entities.find((e) => e.kind === 'drop');
  assert(dropped && deadState.player.fragments === 0, 'Death did not leave recoverable fragments');
  await screenshot('17-death');
  await click('#reincarnate');
  await waitFor(
    'window.verso.modal===null && window.verso.state.phase === "playing"',
    'reincarnation',
  );
  assert(
    (await state()).player.vessel === deadState.player.vessel + 1 &&
      (await state()).player.hp === 100,
    'Reincarnation did not create a healthy next vessel',
  );
  log('Death drops fragments; reincarnation creates next vessel');
  await interactWith(
    dropped,
    '!window.verso.state.entities.some(e=>e.kind === "drop")',
    'Recover previous vessel fragments',
  );
  assert(
    (await state()).player.fragments === dropped.fragments,
    'Recovered fragment amount differs',
  );
  await screenshot('18-fragments-recovered');
  await tap('Escape');
  assert(errors.length === 0, `Browser emitted ${errors.length} errors; see browser-results.json`);
  log('No browser console/runtime errors');
} catch (error) {
  failure = error;
  console.error(error.stack || error);
  if (page) {
    await setKeys([]).catch(() => {});
    await screenshot('99-failure').catch(() => {});
  }
} finally {
  const final = page ? await state().catch(() => null) : null;
  fs.writeFileSync(
    path.join(out, 'browser-results.json'),
    JSON.stringify(
      {
        started,
        finished: new Date(),
        endpoint,
        baseUrl,
        targetId,
        loadedScripts,
        expectedBundle,
        fpsSample,
        ultrawideSample,
        results,
        errors,
        findings,
        failure: failure?.stack,
        final,
      },
      null,
      2,
    ),
  );
  const report = `# Browser QA\n\nRun: ${started.toISOString()}. Workspace-owned Chromium via CDP; ${baseUrl}.\n\n${failure ? '**FAIL** — ' + failure.message : '**PASS** — complete three-assignment playthrough and independent crossing verified.'}\n\nEvery game action used real mouse, keyboard, or touch events. Read-only diagnostics supplied assertions and collision geometry supplied route planning. No game state, saves, or shared developer storage were injected or cleared.\n\n## Verified\n\n${results.map((r) => '- ' + r.name + (r.details ? ': ' + r.details : '')).join('\n')}\n\n## Evidence\n\nScreenshots and detailed results: [../.dream-loop/qa/](../.dream-loop/qa/). Browser errors: ${errors.length}.\n\n${failure ? 'Failure screenshot: `99-failure.png`.\n' : ''}## Scope\n\nDesktop 1600 × 1000; mobile 390 × 844 and 844 × 390. The check covers a peaceful happy path, modal navigation, autosaved continuation, and touch movement. It does not assert audio fidelity, gamepad support, export/import file dialogs, or death/reincarnation.\n`;
  fs.writeFileSync(
    path.join(root, 'docs/QA.md'),
    report
      .replace(
        'Desktop 1600 × 1000; mobile 390 × 844 and 844 × 390.',
        'Desktop 1600 × 1000; ultrawide 2560 × 720; mobile 390 × 844 and 844 × 390. FPS is a foreground observation in this isolated Chromium session, not a hardware benchmark.',
      )
      .replace(
        '**PASS** — complete',
        findings.length ? '**CAMPAIGN PASS, findings remain** — complete' : '**PASS** — complete',
      )
      .replace(
        'The check covers a peaceful happy path, modal navigation, autosaved continuation, and touch movement. It does not assert audio fidelity, gamepad support, export/import file dialogs, or death/reincarnation.',
        'The check covers a peaceful campaign, modal navigation, autosaved continuation, touch movement, abilities, healing, death, reincarnation, and fragment recovery. It does not assert audio fidelity, gamepad support, or export/import file dialogs.',
      ) +
      '\n## Findings\n\n' +
      (findings.length ? findings.map((f) => '- ' + f).join('\n') : 'None observed.') +
      '\n\n## Repeat\n\nWith a current production build served on localhost and an isolated Agent Workspace Chromium running:\n\n```sh\nnode scripts/browser-check.mjs ' +
      endpoint +
      ' ' +
      baseUrl +
      (expectedBundle ? ' ' + expectedBundle : '') +
      '\n```\n\nThe browser endpoint is ephemeral; replace it with the active workspace endpoint. The script creates and closes its own tab.\n',
  );
  if (page) await page.send('Network.setBypassServiceWorker', { bypass: false }).catch(() => {});
  if (browser && targetId) await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  page?.close();
  browser?.close();
}
if (failure || findings.length) process.exitCode = 1;
