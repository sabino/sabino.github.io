/** Real-input universe QA in fresh contexts of a verified Agent Workspace browser.
 * node scripts/browser-universe.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
 * Only reads DOM/diagnostics; game and storage changes are driven by actual inputs.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const endpoint = process.argv[2],
  url = process.argv[3] || 'http://localhost:4174/';
if (
  !endpoint ||
  !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname) ||
  !['localhost', 'sabino.pro'].includes(new URL(url).hostname)
)
  throw Error('Use the verified workspace endpoint and the local or published Verso frontend.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.dream-loop/universe-release-qa');
fs.mkdirSync(out, { recursive: true });
const started = new Date(),
  results = [],
  errors = [],
  clients = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pass = (name, detail = '') => {
  results.push({ name, detail });
  console.log(`PASS ${name}: ${detail}`);
};
let browser, failure, observedFps;
async function connect(address, events = () => {}) {
  const ws = new WebSocket(address);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let serial = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (!m.id) return events(m.method, m.params);
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, {
          resolve,
          reject,
          timer: setTimeout(() => {
            pending.delete(id);
            reject(Error(`CDP timeout ${method}`));
          }, 20000),
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}
async function traveler(name, targetUrl = url, mobile = false, sharedContext) {
  const { browserContextId } = sharedContext
    ? { browserContextId: sharedContext }
    : await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId,
    newWindow: true,
  });
  const nativeWindow = await browser.send('Browser.getWindowForTarget', { targetId });
  await browser.send('Browser.setWindowBounds', {
    windowId: nativeWindow.windowId,
    bounds: { windowState: 'maximized' },
  });
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  const wire = [];
  const page = await connect(
    targets.find((t) => t.id === targetId).webSocketDebuggerUrl,
    (method, params) => {
      if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') {
        try {
          const m = JSON.parse(params.response.payloadData);
          if (['claim', 'door', 'claimResult', 'world', 'error'].includes(m.type))
            wire.push({ direction: method.endsWith('Sent') ? 'sent' : 'received', message: m });
        } catch {}
      }
      if (method === 'Runtime.exceptionThrown') errors.push({ name, ...params.exceptionDetails });
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
        errors.push({ name, ...params });
    },
  );
  const read = async (expression) => {
    const r = await page.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = async (expression, label, timeout = 15000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await read(expression).catch(() => false)) return;
      await delay(70);
    }
    throw Error(`${name}: ${label}`);
  };
  const focus = () => page.send('Page.bringToFront');
  const key = async (key, code, vk, hold = 0, modifiers = 0) => {
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: vk,
      ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
      modifiers,
    });
    if (hold) await delay(hold);
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: vk,
      modifiers,
    });
    await delay(80);
  };
  const point = async (x, y) => {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      x,
      y,
    });
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      x,
      y,
    });
    await delay(100);
  };
  const click = async (selector) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const g = await read(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing control '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();let top=0,bottom=innerHeight,scroller=null;for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);if(/auto|scroll/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+1&&!scroller)scroller={x:b.x+b.width/2,y:b.y+b.height/2};}}const x=r.x+r.width/2,y=(Math.max(r.top,top)+Math.min(r.bottom,bottom))/2;if(r.bottom<=top||r.top>=bottom||!e.contains(document.elementFromPoint(x,y)))return{scroll:scroller??{x:innerWidth/2,y:innerHeight/2},delta:Math.max(-500,Math.min(500,(r.top+r.bottom)/2-(top+bottom)/2))};return{x,y};})()`,
      );
      if (g.scroll) {
        await page.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          ...g.scroll,
          deltaX: 0,
          deltaY: g.delta || 150,
        });
        await delay(100);
        continue;
      }
      return point(g.x, g.y);
    }
    throw Error(`Cannot click ${selector}`);
  };
  const fill = async (selector, text) => {
    await click(selector);
    await key('a', 'KeyA', 65, 0, 2);
    await page.send('Input.insertText', { text });
  };
  const state = () => read('window.stichos.state');
  const shot = async (label) => {
    await focus();
    await delay(180);
    const r = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(out, `${label}.png`), Buffer.from(r.data, 'base64'));
  };
  const c = {
    name,
    page,
    wire,
    browserContextId,
    targetId,
    read,
    wait,
    focus,
    key,
    point,
    click,
    fill,
    state,
    shot,
    mobile,
  };
  clients.push(c);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: mobile ? 390 : 1440,
    height: mobile ? 844 : 960,
    deviceScaleFactor: 1,
    mobile,
  });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.navigate', { url: targetUrl });
  await focus();
  await wait("['title','life-in-use'].includes(window.stichos?.state.modal)", 'title ready');
  c.build = await read(
    '({url:location.href,scripts:[...document.scripts].map(s=>s.src).filter(Boolean),assets:performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/app-"))})',
  );
  return c;
}

async function begin(c, seed = '3886') {
  await c.fill('#s-seed-input', seed);
  await c.click('#v-theo-story');
  await c.wait('window.stichos.state.transfer', 'story opens');
  await c.click('#s-skip');
  await c.wait("window.stichos.state.modal===''&&!window.stichos.state.transfer", 'world ready');
}
async function room(c, code = '') {
  await c.focus();
  await c.click('#s-together');
  await c.fill('#s-room-name', c.name);
  if (code) await c.fill('#s-room-code', code);
  await c.click('#s-room-form button[type=submit]');
  await c.wait("window.stichos.state.multiplayer.status==='online'", 'room online', 30000);
  const id = (await c.state()).multiplayer.room;
  await c.click('#s-room-return');
  return id;
}
async function worldClick(c, p) {
  await c.focus();
  await delay(150);
  const screen = await c.read(
    `(()=>{const p=window.stichos.worldToScreen(${JSON.stringify(p)}),r=document.querySelector('canvas').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};})()`,
  );
  await c.point(screen.x, screen.y);
}
async function move(c, p) {
  await worldClick(c, p);
  await c.wait(
    `Math.hypot(window.stichos.state.player.x-(${p.x}),window.stichos.state.player.y-(${p.y}))<.3`,
    'actual walking ' + JSON.stringify(p),
    12000,
  );
}
async function chat(c, text, channel = 'world') {
  await c.focus();
  await c.click(`[data-chat-channel=${channel}]`);
  await c.fill('#v-chat-input', text);
  await c.key('Enter', 'Enter', 13);
  await c.key('Escape', 'Escape', 27);
}
async function received(c, text) {
  await c.wait(
    `document.querySelector('#v-chat-log').textContent.includes(${JSON.stringify(text)})`,
    'chat received ' + text,
  );
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  const a = await traveler('Mira'),
    b = await traveler('Elias');
  await begin(a);
  await begin(b);
  const code = await room(a);
  await room(b, code);
  await a.wait('window.stichos.state.multiplayer.peers.length===1', 'two travelers');
  await chat(a, 'The market is clear. Meet by the greenhouse.');
  await received(b, 'The market is clear. Meet by the greenhouse.');
  await delay(1100);
  await chat(b, 'I have the cequin. Keep the north road open.', 'say');
  await received(a, 'I have the cequin. Keep the north road open.');
  pass('Real two-player Room and nearby Local chat cross WebRTC');
  await a.click('#v-chat-settings');
  await a.fill('[data-phrase="0"]', '/room Supply route confirmed.');
  await a.click('#v-shortcuts-form button');
  await delay(1100);
  await a.key('F7', 'F7', 118);
  await received(b, 'Supply route confirmed.');
  pass('A customized F7 chat command sends only on actual shortcut input');
  await move(a, { x: -1, y: 5 });
  await move(b, { x: 1, y: 5 });
  await worldClick(a, { x: -2, y: 5 });
  await delay(800);
  await worldClick(a, { x: -2, y: 5 });
  await a.wait("window.stichos.state.removed.includes('origin:cequin')", 'harvest authority');
  await b.wait("window.stichos.state.removed.includes('origin:cequin')", 'harvest shared');
  await delay(6000);
  await a.focus();
  await a.shot('01-two-traveler-desktop');
  const before = await a.state(),
    visitorBefore = await b.state();
  observedFps = await a.read('window.stichos.fps');
  console.log('FPS ' + observedFps);
  await a.key('Escape', 'Escape', 27);
  await a.page.send('Page.reload', { ignoreCache: true });
  await a.wait("window.stichos?.state.modal==='title'", 'host reload title');
  await b.wait(
    "window.stichos.state.multiplayer.status==='disconnected'",
    'visitor sees host leave',
  );
  await a.click('#s-continue');
  await a.wait("window.stichos.state.modal===''", 'host own life restored');
  // The old invitation URL initiates a visitor reconnect; wait until it fails before resuming authority.
  await a.wait(
    "window.stichos.state.multiplayer.status!=='connecting'",
    'old host join resolves',
    30000,
  );
  await a.click('#s-together');
  await a.wait(
    `!!document.querySelector('[data-resume-world="${code}"]')`,
    'owned world resume control',
  );
  await a.click(`[data-resume-world="${code}"]`);
  await a.wait("window.stichos.state.multiplayer.status==='online'", 'restored room online', 30000);
  await a.click('#s-room-return');
  assert.equal((await a.state()).bodyId, before.bodyId);
  assert((await a.state()).removed.includes('origin:cequin'));
  await b.click('#s-together');
  await b.click('#s-room-reconnect');
  await b.wait(
    "window.stichos.state.multiplayer.status==='online'",
    'visitor private reconnect',
    30000,
  );
  await b.click('#s-room-return');
  assert.equal((await b.state()).multiplayer.peerId, visitorBefore.multiplayer.peerId);
  assert((await b.state()).removed.includes('origin:cequin'));
  pass(
    'Host-owned checkpoint resumes after reload; visitor credentials recover the same peer and depleted plant',
  );
  await a.click('#v-chat-settings');
  assert.equal(
    await a.read('document.querySelector(\'[data-phrase="0"]\').value'),
    '/room Supply route confirmed.',
  );
  await a.click('#v-shortcuts-close');
  await delay(1100);
  await a.key('F7', 'F7', 118);
  await received(b, 'Supply route confirmed.');
  pass('Customized shortcut survives a full page reload');
  const second = await traveler('SecondTab', url, false, a.browserContextId);
  assert.equal((await second.state()).modal, 'life-in-use');
  await second.key('Escape', 'Escape', 27);
  assert.equal((await second.state()).modal, 'life-in-use');
  await browser.send('Target.closeTarget', { targetId: a.targetId });
  a.closed = true;
  await second.click('#v-retry-life-tab');
  await second.wait("window.stichos.state.modal==='title'", 'same identity lease released');
  await second.click('#s-continue');
  assert.equal((await second.state()).bodyId, before.bodyId);
  pass(
    'Same-browser second tab is locked, Escape cannot bypass, closing the first permits continuing',
  );
  const p = await traveler('PublicOne'),
    q = await traveler('PublicTwo', url, true);
  await begin(p, '989123');
  await begin(q, '989123');
  for (const c of [p, q]) {
    await c.focus();
    await c.click('#s-together');
    await c.click('#v-room-public');
    await c.wait(
      "window.stichos.state.multiplayer.status==='online'",
      'public frequency online',
      40000,
    );
  }
  assert.equal((await p.state()).multiplayer.room, (await q.state()).multiplayer.room);
  await p.wait('window.stichos.state.multiplayer.peers.length===1', 'public peer arrived');
  assert(await q.read('document.querySelector(".s-shell").classList.contains("chat-collapsed")'));
  await delay(3500);
  await q.shot('02-mobile-collapsed-world');
  pass(
    'Two independent lives find the same public planetary room without exchanging a code',
    (await p.state()).multiplayer.room,
  );
  assert.deepEqual(errors, []);
  pass('No browser exceptions or error logs');
} catch (error) {
  failure = error;
  console.error(error.stack);
  for (const c of clients.filter((c) => !c.closed)) {
    await c.shot(`FAIL-${c.name}`).catch(() => {});
    fs.writeFileSync(
      path.join(out, `FAIL-${c.name}.json`),
      JSON.stringify(
        {
          state: await c.state().catch(() => null),
          dom: await c.read('document.body.innerText').catch(() => null),
        },
        null,
        2,
      ),
    );
  }
} finally {
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        status: failure ? 'FAIL' : 'PASS',
        observedFps,
        started,
        finished: new Date(),
        url,
        results,
        errors,
        failure: failure?.stack,
        builds: clients.map((c) => c.build),
      },
      null,
      2,
    ),
  );
  for (const id of new Set(clients.map((c) => c.browserContextId)))
    await browser?.send('Target.disposeBrowserContext', { browserContextId: id }).catch(() => {});
  clients.forEach((c) => c.page.close());
  browser?.close();
}
if (failure) process.exitCode = 1;
