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
const out = path.join(root, '.dream-loop/screen-smoke');
fs.mkdirSync(out, { recursive: true });
const observations = [];
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
async function traveler(name, targetUrl = url, mobile = false) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
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
  await wait("window.stichos?.state.modal==='title'", 'title ready');
  c.build = await read(
    '({url:location.href,scripts:[...document.scripts].map(s=>s.src).filter(Boolean),assets:performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/app-"))})',
  );
  return c;
}

async function capture(c, id, detail = '') {
  await c.shot(c.name + '-' + id);
  const metrics = await c.read(
    `(()=>{const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden]')&&!e.closest('[inert]')};const nodes=[...document.querySelectorAll('button,input,select,summary,a')].filter(visible);return{modal:window.stichos.state.modal,title:document.querySelector('#s-modal h2')?.textContent,viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],window:[...document.querySelectorAll('#s-modal .s-window,.s-notebook,#s-life-panel,.s-sidebar')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return{class:e.className,x:r.x,y:r.y,w:r.width,h:r.height,scroll:[e.scrollHeight,e.clientHeight],overflow:getComputedStyle(e).overflowY}}),buttons:nodes.map(e=>{const r=e.getBoundingClientRect();return{id:e.id,text:e.textContent?.trim().slice(0,100),label:e.getAttribute('aria-label'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),disabled:e.disabled,font:getComputedStyle(e).fontSize}}),focused:{id:document.activeElement?.id,text:document.activeElement?.textContent?.slice(0,100)},text:document.querySelector('#s-modal:not([hidden]),#s-transfer:not([hidden]),#s-dialogue:not([hidden])')?.innerText}})()`,
  );
  observations.push({ id: c.name + '-' + id, detail, ...metrics });
  fs.writeFileSync(
    path.join(out, 'observations.json'),
    JSON.stringify({ started, errors, observations }, null, 2),
  );
  console.log('CAPTURE ' + c.name + '-' + id + ' ' + (metrics.title || metrics.modal || 'world'));
}
async function bottom(c, id) {
  const pos = await c.read(
    `(()=>{const e=document.querySelector('#s-modal .s-window');const r=e.getBoundingClientRect();return{x:Math.min(innerWidth-20,r.right-30),y:Math.min(innerHeight-35,r.bottom-35)}})()`,
  );
  await c.page.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    ...pos,
    deltaX: 0,
    deltaY: 10000,
  });
  await delay(160);
  await capture(c, id);
}
async function select(c, selector, index) {
  await c.click(selector);
  await c.key('Home', 'Home', 36);
  for (let i = 0; i < index; i++) await c.key('ArrowDown', 'ArrowDown', 40);
  await c.key('Enter', 'Enter', 13);
}
async function smoke(c) {
  await c.fill('#s-seed-input', '8');
  await c.click('#s-start button[type=submit]');
  await c.wait("window.stichos.state.modal==='creation'", 'creator');
  await c.click('#v-accept-life');
  await c.wait('window.stichos.state.transfer', 'arrival');
  await c.click('#s-skip');
  await c.wait('!window.stichos.state.transfer', 'arrived');
  if (!c.mobile) {
    for (const [width, height] of [
      [1440, 960],
      [1366, 768],
    ]) {
      await c.page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await capture(c, `hud-${width}`);
      const geometry = await c.read(
        '(()=>{const p=document.querySelector("#s-portrait").getBoundingClientRect(),h=document.querySelector(".s-meter.health label").getBoundingClientRect(),s=document.querySelector(".s-sidebar"),f=document.querySelector(".s-side-footer").getBoundingClientRect();return{portrait:p.bottom,health:h.top,scroll:s.scrollHeight,height:s.clientHeight,footer:f.bottom,vh:innerHeight};})()',
      );
      assert(geometry.portrait <= geometry.health, 'portrait clears health label');
      assert(geometry.scroll <= geometry.height + 1, 'sidebar fits');
      assert(geometry.footer <= geometry.vh, 'footer visible');
    }
  } else {
    await c.key('j', 'KeyJ', 74);
    await c.click('#s-notebook-open');
    await delay(450);
    await capture(c, 'book-years-controls');
    const controls = await c.read(
      '(()=>{return[...document.querySelectorAll(".s-notebook button")].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return{id:b.id,x:r.x,right:r.right,y:r.y,bottom:r.bottom,w:innerWidth,h:innerHeight}})})()',
    );
    for (const control of controls) {
      assert(control.x >= 0 && control.right <= control.w, control.id + ' horizontally visible');
      assert(control.y >= 0 && control.bottom <= control.h, control.id + ' vertically visible');
    }
    await c.click('#s-notebook-type');
    assert(
      await c.read('!!document.querySelector(".s-notebook.plain-type")'),
      'plain type selected',
    );
    await capture(c, 'book-plain-controls');
    await c.click('#s-notebook-type');
    await c.click('#s-journal-return');
    await delay(450);
    assert(
      await c.read('!!document.querySelector(".s-notebook.is-shut")'),
      'physical cover closed',
    );
    await capture(c, 'book-closed');
  }
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  for (const mobile of [false, true]) {
    const c = await traveler(mobile ? 'mobile' : 'desktop', url, mobile);
    await smoke(c);
  }
} catch (error) {
  failure = String(error.stack || error);
  console.error(failure);
  for (const c of clients) await capture(c, 'failure').catch(() => {});
} finally {
  fs.writeFileSync(
    path.join(out, 'observations.json'),
    JSON.stringify({ started, ended: new Date(), failure, errors, observations }, null, 2),
  );
  for (const c of clients) {
    c.page.close();
    await browser
      ?.send('Target.disposeBrowserContext', { browserContextId: c.browserContextId })
      .catch(() => {});
  }
  browser?.close();
}
if (failure) process.exitCode = 1;
