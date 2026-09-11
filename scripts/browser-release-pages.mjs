/** Real-input cooperative QA in fresh contexts of a verified Agent Workspace browser.
 * node scripts/browser-peer-rooms.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
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
const out = path.join(root, '.dream-loop/stichos-release-pages');
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
let browser, failure, coop, serverUrl;
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
async function traveler(name, seed = '3886') {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId,
    newWindow: true,
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
  const worldClick = async (p) => {
    await focus();
    await delay(150);
    const screen = await read(
      `(()=>{const p=window.stichos.worldToScreen(${JSON.stringify(p)}),r=document.querySelector('canvas').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};})()`,
    );
    await point(screen.x, screen.y);
  };
  const move = async (p) => {
    await focus();
    await worldClick(p);
    await wait(
      `Math.hypot(window.stichos.state.player.x-(${p.x}),window.stichos.state.player.y-(${p.y}))<.3`,
      'walk to ' + JSON.stringify(p),
      12000,
    );
  };
  const c = {
    name,
    page,
    wire,
    browserContextId,
    read,
    wait,
    focus,
    key,
    point,
    click,
    fill,
    state,
    shot,
    worldClick,
    move,
  };
  clients.push(c);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.navigate', { url });
  await focus();
  await wait("window.stichos?.state.modal==='title'", 'title ready');
  await fill('#s-seed-input', seed);
  await click('#v-theo-story');
  await wait('window.stichos.state.transfer', 'opening intro');
  await click('#s-skip');
  await wait("window.stichos.state.modal===''&&!window.stichos.state.transfer", 'present day');
  c.build = await read(
    '({url:location.href,scripts:[...document.scripts].map(s=>s.src).filter(Boolean),assets:performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/app-"))})',
  );
  return c;
}

try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  const c = await traveler('Release traveler');
  await c.move({ x: 0, y: 7 });
  pass('Game starts and accepts actual walking input');
  await c.click('#s-life');
  await c.click('[data-life-tab="compact"]');
  await c.wait(
    "document.querySelector('.s-compact-heading')?.textContent.includes('72')",
    'Winter Compact renders',
  );
  await c.shot('01-winter-compact');
  const id = await c.read(
    "document.querySelector('.s-compact-witnesses [data-compact-track]').dataset.compactTrack",
  );
  await c.click('.s-compact-witnesses [data-compact-track]');
  const mark = (await c.state()).mapWaypoint;
  assert(mark, 'Track sets actual atlas bearing');
  await c.worldClick(mark);
  await c.wait(
    `Math.hypot(window.stichos.state.player.x-${mark.x},window.stichos.state.player.y-${mark.y})<1.8`,
    'Approach the actual witness',
  );
  await c.click('#s-life');
  await c.click('[data-life-tab="compact"]');
  await c.click('[data-compact-survey="' + id + '"]');
  await c.wait(
    "document.querySelector('.s-compact-witnesses blockquote')?.textContent.length>30",
    'actual nearby witness account recorded',
  );
  pass('Winter Compact tracks an actual witness and records the nearby account');
  await c.shot('02-account-recorded');
  await c.page.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(300);
  assert(
    await c.read('document.documentElement.scrollWidth<=innerWidth+1'),
    'No page width overflow on mobile',
  );
  await c.shot('03-mobile-compact');
  await c.click('#s-life-return');
  await c.click('#s-life');
  await c.click('[data-life-tab="store"]');
  await c.wait(
    "document.querySelector('#s-life-panel')?.textContent.includes('Cosmetic') || document.querySelector('#s-life-panel')?.textContent.includes('cosmetic')",
    'Cosmetic previews loaded',
  );
  if (new URL(url).protocol === 'https:') {
    await c.wait(
      "document.querySelector('#s-life-panel')?.textContent.includes('not active')",
      'Static shop clearly inactive',
    );
    assert(
      await c.read(
        "(()=>{const buttons=[...document.querySelectorAll('[data-store-action]')].filter(b=>b.dataset.storeAction.startsWith('buy:'));return buttons.length>0 && buttons.every(b=>b.disabled)})()",
      ),
      'No active real-money purchase button',
    );
    pass('Static edition presents cosmetic previews with purchases explicitly inactive');
  }
  await c.shot('04-mobile-cosmetics');
  await c.click('#s-life-return');
  await c.wait(
    "window.stichos.state.modal===''&&!window.stichos.state.paused",
    'Life closes and movement resumes',
  );
  assert.deepEqual(errors, []);
  pass('Mobile views close cleanly and browser reports no errors');
} catch (error) {
  failure = error;
  console.error(error.stack);
  for (const c of clients) {
    await c.shot('FAIL').catch(() => {});
    fs.writeFileSync(
      path.join(out, 'FAIL.json'),
      JSON.stringify(await c.state().catch(() => null), null, 2),
    );
  }
} finally {
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        status: failure ? 'FAIL' : 'PASS',
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
  for (const c of clients) {
    await browser
      ?.send('Target.disposeBrowserContext', { browserContextId: c.browserContextId })
      .catch(() => {});
    c.page.close();
  }
  browser?.close();
}
if (failure) process.exitCode = 1;
