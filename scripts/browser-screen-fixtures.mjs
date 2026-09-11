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
const out = path.join(root, '.dream-loop/screen-audit-fixtures');
fs.mkdirSync(out, { recursive: true });
const observations = process.argv.includes('--extra')
  ? JSON.parse(fs.readFileSync(path.join(out, 'observations.json'), 'utf8')).observations
  : [];
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
async function startTheo(c) {
  await c.fill('#s-seed-input', '3886');
  await c.click('#v-theo-story');
  await c.wait('window.stichos.state.transfer', 'intro');
  await capture(c, 'intro-01');
  const pages = await c.read(`document.querySelector('#s-intro-page').textContent`);
  const count = Number(pages.match(/\/\s*(\d+)/)?.[1] || 6);
  for (let i = 1; i < count; i++) {
    await c.click('#s-intro-next');
    await delay(130);
    await capture(c, 'intro-' + String(i + 1).padStart(2, '0'));
  }
  await c.click('#s-skip');
  await delay(450);
  await capture(c, 'world');
}
async function mainScreens(c) {
  await capture(c, 'title');
  await c.click('#v-title-galaxy');
  await capture(c, 'galaxy-unvisited');
  await c.click('#v-sector-next');
  await capture(c, 'galaxy-sector');
  await c.click('#v-galaxy-close');
  await c.fill('#s-seed-input', '3886');
  await c.click('#s-start button[type=submit]');
  await c.wait("window.stichos.state.modal==='creation'", 'creator');
  await capture(c, 'creator');
  await bottom(c, 'creator-bottom');
  await c.click('#v-reroll');
  await capture(c, 'creator-rerolled');
  await c.click('#v-create-back');
  await startTheo(c);
  await c.click('#s-pause');
  await capture(c, 'pause');
  await c.click('#v-ai');
  await capture(c, 'ai');
  await c.fill('#v-ai-code', 'audit');
  await c.click('#v-ai-pair button');
  await delay(500);
  await capture(c, 'ai-unavailable');
  await c.click('#v-ai-close');
  await c.click('#s-pause');
  await c.click('#v-retire');
  await capture(c, 'retire');
  await c.click('#v-retire-confirm');
  await capture(c, 'retire-creator');
  await c.click('#v-create-back');
  await c.click('#v-pause-resume');
  await c.click('#s-pause');
  await c.click('#s-pause-help');
  await capture(c, 'controls');
  await bottom(c, 'controls-bottom');
  await c.click('#s-help-return');
  await c.click('#v-chat-toggle');
  await capture(c, 'chat-toggled');
  await c.click('#v-chat-settings');
  await capture(c, 'shortcuts');
  await c.click('#v-shortcuts-close');
  await c.key('k', 'KeyK', 75);
  await capture(c, 'gear');
  await bottom(c, 'gear-bottom');
  await c.click('#s-gear-return');
  await c.click('#s-life');
  for (const tab of [
    'purpose',
    'compact',
    'skills',
    'forge',
    'discover',
    'estate',
    'homes',
    'wardrobe',
    'store',
  ]) {
    await c.click(`[data-life-tab="${tab}"]`);
    await delay(tab === 'store' ? 450 : 100);
    await capture(c, 'life-' + tab);
    await bottom(c, 'life-' + tab + '-bottom');
    if (tab === 'forge') {
      await select(c, '#s-forge-kind', 1);
      await capture(c, 'forge-sword');
      await select(c, '#s-forge-kind', 2);
      await capture(c, 'forge-bow');
    }
    if (tab === 'discover') {
      await c.click('.s-invention-parts summary');
      await capture(c, 'invention-parts');
      await bottom(c, 'invention-parts-bottom');
      await c.click('#s-invention-next');
      await capture(c, 'invention-next');
    }
  }
  await c.click('#s-life-return');
  await c.click('#v-work');
  await capture(c, 'work-empty');
  await bottom(c, 'work-empty-bottom');
  await c.click('#v-work-close');
  await c.key('m', 'KeyM', 77);
  await capture(c, 'atlas');
  await bottom(c, 'atlas-bottom');
  await c.click('#s-atlas-plus');
  await capture(c, 'atlas-zoom');
  await c.click('#s-map-return');
  await c.click('#v-galaxy');
  await capture(c, 'galaxy-known');
  await bottom(c, 'galaxy-known-bottom');
  await c.click('#v-galaxy-close');
  await c.key('j', 'KeyJ', 74);
  await capture(c, 'notebook-cover');
  await c.click('#s-notebook-open');
  await delay(450);
  for (const section of ['years', 'botany', 'glossary', 'threads']) {
    await c.click(`[data-notebook-section="${section}"]`);
    await capture(c, 'notebook-' + section);
    await bottom(c, 'notebook-' + section + '-bottom');
    if (section === 'years' || section === 'botany') {
      const leaves = await c.read(`document.querySelectorAll('#s-notebook-select option').length`);
      for (let i = 1; i < leaves; i++) {
        await c.click('#s-leaf-next');
        await capture(c, `notebook-${section}-leaf-${i + 1}`);
      }
    }
    if (section === 'glossary') {
      await c.fill('#s-glossary-search', 'zznotaword');
      await capture(c, 'glossary-empty');
      await c.fill('#s-glossary-search', 'cequin');
      await capture(c, 'glossary-match');
    }
  }
  await c.click('#s-notebook-type');
  await capture(c, 'notebook-plain');
  await c.click('#s-journal-return');
  await delay(350);
  await capture(c, 'notebook-closed');
  await c.click('#s-journal-return');
  await c.key('i', 'KeyI', 73);
  await capture(c, 'satchel');
  await c.click('#s-tab-craft');
  await capture(c, 'prepare');
  await c.click('#s-tab-pack');
  await c.click('[data-item="cequin"]');
  await capture(c, 'item-detail');
  if (c.mobile) await c.click('#s-mobile-pack');
  await c.click('#s-together');
  await capture(c, 'room-offline');
  await c.click('.v-room-mode summary');
  await capture(c, 'room-options');
  await select(c, '#s-room-mode', 1);
  await capture(c, 'room-dedicated');
  await select(c, '#s-room-mode', 0);
  await c.fill('#s-room-name', c.name + ' audit');
  await c.click('#s-room-form button[type=submit]');
  await c.wait("window.stichos.state.multiplayer.status==='online'", 'hostroom', 30000);
  await capture(c, 'room-host');
  await bottom(c, 'room-host-bottom');
  await c.click('#s-room-leave');
  await capture(c, 'room-saved');
  await c.click('#s-room-return');
  await capture(c, 'world-final');
}

async function fixture(c, name, screen) {
  if (!(await c.read(`document.querySelector('#review-fixtures details').open`)))
    await c.click('#review-fixtures summary');
  const n = await c.read(
    `[...document.querySelector('#review-fixture').options].findIndex(o=>o.value===${JSON.stringify(name)})`,
  );
  const k = await c.read(
    `[...document.querySelector('#review-screen').options].findIndex(o=>o.value===${JSON.stringify(screen)})`,
  );
  if (n < 0 || k < 0) throw Error('Unknown fixture');
  await select(c, '#review-fixture', n);
  await select(c, '#review-screen', k);
  await c.click('#review-load');
  await delay(300);
  const status = await c.read(`document.querySelector('#review-status').textContent`);
  if (status.startsWith('Error')) {
    console.log('UNAVAILABLE ' + name + '/' + screen + ' ' + status);
    return false;
  }
  return true;
}
async function fixtures(c) {
  for (const [name, screen] of [
    ['fresh', 'botanist'],
    ['fresh', 'engineer'],
    ['fresh', 'merchant'],
    ['fresh', 'archivist'],
    ['fresh', 'refugee'],
    ['fresh', 'guard'],
    ['fresh', 'radio'],
    ['fresh', 'workbench'],
    ['fresh', 'notice'],
    ['fresh', 'shrine'],
    ['before-first-encounter', 'objective'],
    ['before-final-puzzle', 'objective'],
    ['before-ending', 'objective'],
    ['campaign-complete', 'ending'],
    ['campaign-complete', 'life'],
    ['free-life-home', 'homes'],
    ['campaign-complete', 'shrine'],
    ['fresh', 'clinic-loss'],
    ['campaign-complete', 'signal-loss'],
    ['campaign-complete', 'journal-remembered'],
    ['production-idle', 'work'],
    ['production-working', 'work'],
    ['production-ready', 'work'],
    ['production-blocked', 'work'],
    ['compact-work', 'compact'],
    ['compact-delivery', 'compact'],
    ['compact-complete', 'compact'],
  ]) {
    if (
      process.argv.includes('--extra') &&
      !['archivist', 'homes', 'journal-remembered'].includes(screen) &&
      name !== 'production-idle'
    )
      continue;
    if (!(await fixture(c, name, screen))) continue;
    await capture(c, `${name}-${screen}`, 'Visual-only fixture loaded via explicit review UI.');
    if (await c.read(`!document.querySelector('#s-modal').hidden`))
      await bottom(c, `${name}-${screen}-bottom`);
    if (name === 'before-ending' && screen === 'objective') {
      await c.click('[data-choice="campaign:stay"]');
      await c.wait(`window.stichos.state.modal==='ending'`, 'stay ending');
      await capture(c, 'ending-stay');
    }
    if (name === 'free-life-home' && screen === 'homes') {
      const usable = await c.read(
        `document.querySelector('[data-plant-plot="0"]')?.disabled===false`,
      );
      if (usable) {
        await c.click('[data-plant-plot="0"]');
        await capture(c, 'home-growing');
        for (let i = 0; i < 5; i++) await c.click('#s-home-rest');
        await capture(c, 'home-ready');
      }
    }
    if (screen === 'compact') {
      const outcomes = await c.read(`!!document.querySelector('.s-compact-outcomes summary')`);
      if (outcomes) {
        await c.click('.s-compact-outcomes summary');
        await capture(c, `${name}-outcomes`);
        await bottom(c, `${name}-outcomes-bottom`);
      }
    }
  }
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  for (const mobile of [false, true]) {
    const c = await traveler(mobile ? 'fixture-mobile' : 'fixture-desktop', url, mobile);
    await fixtures(c);
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
