/**
 * Real-input Stíchos acceptance check. Requires Node 22+ and an already-running
 * isolated Agent Workspace Chromium endpoint discovered by workspace_browser_targets.
 * Never attach this script to host Chrome. No game state or save injection.
 * node scripts/browser-stichos-check.mjs http://127.0.0.1:PORT http://localhost:4173/?stichos=1
 * Add --smoke for the opening, core controls, screenshots, and saved continuation.
 * Add --visual for an isolated browser-context screenshot/FPS sample with no saved-life changes.
 * Add --possession to Continue a completed QA save and verify actual NPC mind transfer.
 * Add --atlas for the current generation-three map and smaller-settlement road route.
 * --expedition exercises the archived generation-two excavation checkpoint.
 * --doors checks solid thresholds and automatic door opening along click routes.
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
const atlasOnly = process.argv.includes('--atlas');
const doorsOnly = process.argv.includes('--doors');
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
const out = path.join(root, '.dream-loop/stichos-labor-browser');
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

try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
  ({ targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    background: true,
    browserContextId: contextId,
  }));
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  page = await connect(
    targets.find((t) => t.id === targetId).webSocketDebuggerUrl,
    (method, params) => {
      if (method === 'Runtime.exceptionThrown') errors.push(params.exceptionDetails);
    },
  );
  for (const method of ['Runtime.enable', 'Page.enable', 'Network.enable']) await page.send(method);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await viewport(1600, 1000);
  await page.send('Page.navigate', { url: baseUrl.href });
  await waitFor('window.stichos?.state && document.querySelector("#s-seed-input")', 'title');
  await click('#s-start button[type=submit]');
  await waitFor('window.stichos.state.transfer', 'intro');
  await delay(400);
  await click('#s-skip');
  await waitFor('!window.stichos.state.transfer&&!window.stichos.state.paused', 'playing');
  let initial = await state();
  assert(
    initial.estate.residence &&
      initial.staff.length === 3 &&
      initial.tools.length === 3 &&
      initial.player.coins === 240,
    'Established household missing',
  );
  log('New priest owns a real residence, three working tools, 240 coins and three named staff');
  await tap('k');
  await click('#s-open-estate');
  await waitFor('document.querySelectorAll(".s-staff-grid article").length===3', 'staff cards');
  await screenshot('01-established-household');
  const worker = initial.staff.find((w) => w.specialty === 'garden');
  await click(`[data-staff-trust="${worker.id}"]`);
  assert(
    !(await state()).staff.find((w) => w.id === worker.id).trusted,
    'Trust withdrawal did not persist',
  );
  assert(
    await read(`document.querySelector('[data-staff-hire="${worker.id}"]').disabled`),
    'Untrusted worker accepts commission',
  );
  await click(`[data-staff-trust="${worker.id}"]`);
  await click(`[data-staff-hire="${worker.id}"][data-labor-kind="garden"]`);
  let hired = await state();
  const order = hired.laborOrders.find((o) => o.status === 'working');
  assert(order && hired.player.coins === initial.player.coins - order.wages, 'Wages not exact');
  assert(
    !order.allocations.some((a) => hired.removed.includes(a.propId)),
    'Hiring immediately harvested',
  );
  log(
    'Individual trust gates named assignments; wages paid once and real resource allocations stay unharvested while working',
    JSON.stringify(order),
  );
  await click('#s-life-return');
  const rock = await read('window.stichos.props(0,5,12).find(p=>p.id==="origin:ore:1")');
  await worldClick(rock);
  await delay(1800);
  assert(!(await state()).removed.includes(rock.id), 'Sickle mined ore');
  await tap('i');
  await click('[data-pack-tool="pickaxe"]');
  if ((await state()).paused) await tap('Escape');
  const before = await state();
  await worldClick(rock);
  await delay(700);
  let progress = await state();
  assert(
    progress.workProgress?.propId === rock.id &&
      progress.workProgress.strokes === 1 &&
      !progress.removed.includes(rock.id),
    'First proper tool stroke did not preserve uncompleted resource',
  );
  await screenshot('02-mining-in-progress');
  for (let n = 0; n < 12 && !(await state()).removed.includes(rock.id); n++) {
    await delay(1600);
    await worldClick(rock);
  }
  let mined = await state();
  assert(mined.removed.includes(rock.id), 'Timed strokes did not mine resource');
  assert((mined.inventory.ore ?? 0) === (before.inventory.ore ?? 0) + 2, 'Mining yield incorrect');
  assert(
    mined.tools.find((t) => t.kind === 'pickaxe').durability <
      before.tools.find((t) => t.kind === 'pickaxe').durability,
    'Actual pickaxe did not wear',
  );
  log(
    'Wrong tool cannot mine; repeated cooldown-limited pickaxe strokes consume condition and yield two ore only at completion',
  );
  const target = await read(
    `window.stichos.state.staff.find(w=>w.id===${JSON.stringify(worker.id)})`,
  );
  await clickWalk({ x: 0, y: 5 }, 0.4, 'return plaza');
  await clickWalk({ x: target.x + 1.5, y: target.y + 1.5 }, 1.2, 'approach worker');
  while ((await state()).time < order.endsAt + 1) {
    await delay(4000);
    const s = await state();
    if (s.player.breath < 70) await tap('3');
  }
  await tap('k');
  await click('#s-open-estate');
  const beforeCollect = await state();
  await click(`[data-labor-collect="${order.id}"]`);
  let collected = await state();
  assert(
    collected.laborOrders.find((o) => o.id === order.id).status === 'complete',
    'Due labor not collected',
  );
  assert(
    order.allocations.every((a) => collected.removed.includes(a.propId)),
    'Worker did not deplete real allocations',
  );
  for (const item of [...new Set(order.allocations.map((a) => a.item))])
    assert(
      (collected.inventory[item] ?? 0) ===
        (beforeCollect.inventory[item] ?? 0) +
          order.allocations.filter((a) => a.item === item).reduce((s, a) => s + a.amount, 0),
      'Wrong staff delivery',
    );
  log(
    'After real world time passes, staff delivery consumes the allocated resources and pays their exact output',
  );
  await screenshot('03-labor-delivery');
  await viewport(390, 844, true);
  await screenshot('04-mobile-household');
  assert(
    await read('document.documentElement.scrollWidth<=innerWidth'),
    'Mobile horizontal overflow',
  );
  await click('#s-life-return');
  await tap('Escape');
  await page.send('Page.reload', { ignoreCache: true });
  await waitFor('document.querySelector("#s-continue")', 'saved continuation');
  await click('#s-continue');
  await waitFor('!window.stichos.state.paused', 'restored world');
  const restored = await state();
  assert(
    JSON.stringify(restored.tools) === JSON.stringify(collected.tools),
    'Tool ledger changed after reload',
  );
  assert(
    restored.laborOrders.find((o) => o.id === order.id)?.status === 'complete',
    'Labor collection lost on reload',
  );
  log('Mobile household closes and reload preserves tool condition, paid work and ownership');
  assert(!errors.length, 'Runtime errors');
} catch (error) {
  failure = error;
  console.error(error.stack);
  if (page) await screenshot('99-failure').catch(() => {});
} finally {
  final = page ? await state().catch(() => null) : null;
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      { started, finished: new Date(), results, errors, final, failure: failure?.stack },
      null,
      2,
    ),
  );
  if (browser && contextId)
    await browser
      .send('Target.disposeBrowserContext', { browserContextId: contextId })
      .catch(() => {});
  page?.close();
  browser?.close();
}
if (failure) process.exitCode = 1;
