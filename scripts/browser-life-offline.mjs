/** Real-input continuing-life and PWA QA in fresh contexts of a verified Agent Workspace browser.
 * node scripts/browser-life-offline.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
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
const out = path.join(
  root,
  '.dream-loop/life-offline' + (new URL(url).hostname === 'sabino.pro' ? '-public' : ''),
);
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
let browser, failure;
let offlineTesting = false;
const offlineResponses = [];
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
      if (method === 'Network.responseReceived' && offlineTesting)
        offlineResponses.push({
          url: params.response.url,
          fromServiceWorker: params.response.fromServiceWorker,
        });
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
  await page.send('Network.setBypassServiceWorker', { bypass: false });
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

async function networkOffline(c, value) {
  await c.page.send('Network.emulateNetworkConditionsByRule', {
    emulateOfflineServiceWorker: value,
    matchedNetworkConditions: value
      ? [{ urlPattern: '', offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }]
      : [],
  });
  await c.page.send('Network.overrideNetworkState', {
    offline: value,
    latency: 0,
    downloadThroughput: value ? 0 : -1,
    uploadThroughput: value ? 0 : -1,
  });
}
async function pause(c) {
  if ((await c.state()).modal === 'pause') return;
  await c.key('Escape', 'Escape', 27);
  await c.wait("window.stichos.state.modal==='pause'", 'pause saves the life');
}
async function exactLife(c, saved, label) {
  const current = await c.state();
  for (const k of ['seed', 'worldGeneration', 'bodyId', 'browserIdentity'])
    assert.equal(current[k], saved[k], `${label}: ${k}`);
  assert.equal(current.player.x, saved.player.x, `${label}: x`);
  assert.equal(current.player.y, saved.player.y, `${label}: y`);
  assert.equal(current.player.name, saved.player.name, `${label}: name`);
  assert.deepEqual(current.displayAppearance, saved.displayAppearance, `${label}: appearance`);
  assert.deepEqual(current.inventory, saved.inventory, `${label}: inventory`);
  return current;
}
let c, manifest, worker, cacheFacts;
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  c = await traveler('ContinuingLife');
  await c.fill('#s-seed-input', '3886');
  await c.click('#v-theo-story');
  await c.wait('window.stichos.state.transfer', 'story arrival');
  await c.click('#s-skip');
  await c.wait(
    "window.stichos.state.modal===''&&!window.stichos.state.transfer",
    'inhabited world',
  );
  const initial = await c.state();
  await c.key('s', 'KeyS', 83, 1500);
  await pause(c);
  const saved = await c.state();
  assert(saved.player.y > initial.player.y + 2, 'actual walking moved the player');
  await c.page.send('Page.reload', { ignoreCache: false });
  await c.wait("window.stichos?.state.modal==='title'", 'reload title');
  await c.click('#s-continue');
  await c.wait("window.stichos.state.modal===''", 'saved life continued');
  await exactLife(c, saved, 'online reload');
  pass(
    'Walking, Pause, reload and Continue preserve exact location, body, browser identity and belongings',
  );
  await pause(c);
  await c.wait('navigator.serviceWorker.controller!==null', 'active worker controls page', 30000);
  worker = await c.read(
    '(async()=>{const r=await navigator.serviceWorker.getRegistration();return {scope:r.scope,active:r.active?.scriptURL,state:r.active?.state,controller:navigator.serviceWorker.controller?.scriptURL}})()',
  );
  assert.equal(worker.scope, new URL('./', url).href, 'worker respects the app folder scope');
  assert.equal(worker.state, 'activated');
  cacheFacts = await c.read(
    '(async()=>{const keys=await caches.keys();return await Promise.all(keys.map(async name=>({name,assets:(await(await caches.open(name)).keys()).map(r=>r.url)})))})()',
  );
  assert(
    cacheFacts.some((k) => k.assets.length > 10),
    'app assets are cached',
  );
  manifest = await c.read(
    "(async()=>{const href=document.querySelector('link[rel=manifest]').href;const response=await fetch(href);const manifest=await response.json();const icons=await Promise.all(manifest.icons.map(async i=>{const url=new URL(i.src,href).href;const r=await fetch(url);const bitmap=await createImageBitmap(await r.blob());const result={url,width:bitmap.width,height:bitmap.height,status:r.status,sizes:i.sizes,purpose:i.purpose};bitmap.close();return result}));return{href,manifest,icons}})()",
  );
  assert.equal(new URL(manifest.manifest.scope, manifest.href).href, new URL('./', url).href);
  assert.equal(new URL(manifest.manifest.start_url, manifest.href).href, new URL('./', url).href);
  assert.equal(manifest.manifest.display, 'standalone');
  for (const i of manifest.icons) {
    assert.equal(i.status, 200);
    assert.equal(`${i.width}x${i.height}`, i.sizes);
    assert(i.url.startsWith(new URL('./', url).href));
  }
  assert(manifest.icons.some((i) => i.width === 192));
  assert(manifest.icons.some((i) => i.width === 512));
  pass(
    'Active scoped service worker and standalone manifest resolve real 192px/512px icons',
    worker.scope,
  );
  await c.page.send('Network.setCacheDisabled', { cacheDisabled: true });
  offlineTesting = true;
  await networkOffline(c, true);
  await c.page.send('Page.reload', { ignoreCache: false });
  await c.wait("window.stichos?.state.modal==='title'", 'offline title', 30000);
  assert(
    await c.read(
      `(async()=>{try{await fetch(new URL('__verso_uncached_probe__?t='+Date.now(),location.href),{cache:'no-store'});return false}catch{return true}})()`,
    ),
    'uncached network request must fail',
  );
  assert(
    offlineResponses.some(
      (r) => r.fromServiceWorker && new URL(r.url).pathname === new URL(url).pathname,
    ),
    'offline navigation comes from service worker',
  );
  assert(
    offlineResponses.some(
      (r) => r.fromServiceWorker && /\/assets\/app-.*\.js/.test(new URL(r.url).pathname),
    ),
    'game bundle comes from service worker',
  );
  await c.click('#s-continue');
  await c.wait("window.stichos.state.modal===''", 'offline life continued');
  await exactLife(c, saved, 'offline reload');
  await c.key('s', 'KeyS', 83, 550);
  assert((await c.state()).player.y > saved.player.y + 0.5, 'actual walking works offline');
  await pause(c);
  await c.shot('01-offline-continuing-life');
  pass(
    'Network-disabled reload and Continue retain the same life; actual offline movement works from cached assets',
  );
  assert.deepEqual(errors, []);
  pass('No runtime exceptions or error logs');
} catch (error) {
  failure = error;
  console.error(error.stack);

  if (c) await c.shot('99-failure').catch(() => {});
} finally {
  if (c) await networkOffline(c, false).catch(() => {});
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
        worker,
        manifest,
        cacheFacts,
        offlineResponses,
      },
      null,
      2,
    ),
  );
  for (const contextId of new Set(clients.map((c) => c.browserContextId)))
    await browser
      ?.send('Target.disposeBrowserContext', { browserContextId: contextId })
      .catch(() => {});
  clients.forEach((c) => c.page.close());
  browser?.close();
}
if (failure) process.exitCode = 1;
