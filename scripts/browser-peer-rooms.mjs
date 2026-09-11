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
const out = path.join(root, '.dream-loop/stichos-peer-rooms');
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
  await click('#s-start button');
  await wait('window.stichos.state.transfer', 'opening intro');
  await click('#s-skip');
  await wait("window.stichos.state.modal===''&&!window.stichos.state.transfer", 'present day');
  c.build = await read(
    '({url:location.href,scripts:[...document.scripts].map(s=>s.src).filter(Boolean),assets:performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/app-"))})',
  );
  return c;
}

async function room(c, code = '') {
  await c.focus();
  await c.click('#s-together');
  await c.fill('#s-room-name', c.name);
  await c.click('#s-room-mode');
  await c.key('Home', 'Home', 36);
  await c.key('Enter', 'Enter', 13);
  await c.fill('#s-room-code', code);
  await c.click('#s-room-form button[type=submit]');
  await c.wait("window.stichos.state.multiplayer.status==='online'", 'browser room joined', 30000);
  const id = (await c.state()).multiplayer.room;
  await c.click('#s-room-return');
  return id;
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  const a = await traveler('Theo browser host'),
    b = await traveler('Mira browser visitor');
  const code = await room(a);
  await room(b, code);
  await a.wait('window.stichos.state.multiplayer.peers.length===1', 'visitor arrived');
  assert.equal((await b.state()).multiplayer.peers[0].name, a.name);
  pass('Two browser rooms connect using real PeerJS signalling and RTC data channels', code);
  await a.move({ x: -1, y: 5 });
  await b.move({ x: 1, y: 5 });
  await b.wait(
    'Math.abs(window.stichos.state.multiplayer.peers[0].x+1)<.3',
    'remote host movement',
  );
  await b.shot('01-public-signalling-peers');
  await a.click('#s-together');
  await a.click('[data-room-emote=wave]');
  await b.wait(
    "document.querySelector('#s-toast').textContent.includes('Hello!')",
    'visible peer wave',
  );
  pass('Actual movement and emotes cross browser-hosted room');
  await b.move({ x: -1, y: 5 });
  const beforeA = await a.state(),
    beforeB = await b.state();
  await a.worldClick({ x: -2, y: 5 });
  await b.worldClick({ x: -2, y: 5 });
  await delay(800);
  assert(
    !(await a.state()).removed.includes('origin:cequin'),
    'A preliminary stroke removed shared plant',
  );
  assert(
    !(await b.state()).removed.includes('origin:cequin'),
    'B preliminary stroke removed shared plant',
  );
  await a.worldClick({ x: -2, y: 5 });
  await b.worldClick({ x: -2, y: 5 });
  await a.wait(
    "window.stichos.state.removed.includes('origin:cequin')",
    'host sees consumed plant',
  );
  await b.wait(
    "window.stichos.state.removed.includes('origin:cequin')",
    'visitor sees consumed plant',
  );
  const afterA = await a.state(),
    afterB = await b.state();
  assert.equal(
    (afterA.inventory.cequin ?? 0) +
      (afterB.inventory.cequin ?? 0) -
      (beforeA.inventory.cequin ?? 0) -
      (beforeB.inventory.cequin ?? 0),
    3,
  );
  pass(
    'Only final tool stroke claims the shared plant and exactly one body earns its three portions',
  );
  await a.shot('02-single-winner-harvest');
  await a.click('#s-room-return');
  for (const c of [a, b]) {
    const merchant = (await c.state()).npcs.find((n) => n.id === 'origin:resident:3');
    await c.worldClick(merchant);
    await c.wait("window.stichos.state.dialogue?.role==='merchant'", 'actual merchant trade');
    await c.click('[data-choice="weapon:bow"]');
    await c.click('[data-choice="close"]');
    assert((await c.state()).weapons.includes('bow'), 'Bow bought with actual coins');
    await c.click('[data-equip=bow]');
    await c.move({ x: 6, y: 5 });
    await c.move({ x: 10, y: 0 });
    await c.move({ x: 18, y: 0 });
    await c.move({ x: 24, y: 0 });
  }
  for (const c of [a, b]) await c.move({ x: 28, y: 0 });
  const foeId = 'wanderer:35:3';
  await a.wait(
    `window.stichos.state.npcs.some(n=>n.id===${JSON.stringify(foeId)})`,
    'shared raider visible',
  );
  const shoot = async (c) => {
    const foe = (await c.state()).npcs.find((n) => n.id === foeId);
    if (!foe || foe.hp <= 0) return;
    const pt = await c.read(
      `(()=>{const p=window.stichos.worldToScreen(${JSON.stringify(foe)}),r=document.querySelector('canvas').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top}})()`,
    );
    await c.focus();
    await c.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...pt });
    await c.key('f', 'KeyF', 70);
    await c.wait('!window.stichos.state.multiplayer.pending', 'combat acknowledgment');
  };
  await shoot(a);
  await a.wait(
    `window.stichos.state.npcs.some(n=>n.id===${JSON.stringify(foeId)}&&n.hp<75&&n.hp>0)`,
    'first actual shared arrow wound',
  );
  const wounded = (await a.state()).npcs.find((n) => n.id === foeId).hp;
  await b.wait(
    `window.stichos.state.npcs.some(n=>n.id===${JSON.stringify(foeId)}&&n.hp===${wounded})`,
    'visitor observes identical wounded HP',
  );
  pass('Both browsers observe the same raider wound after a real aimed arrow', String(wounded));
  await shoot(b);
  for (let i = 0; i < 8 && !(await a.state()).removed.includes(foeId); i++) {
    await delay(850);
    await shoot(i % 2 ? a : b);
  }
  await a.wait(
    `window.stichos.state.removed.includes(${JSON.stringify(foeId)})`,
    'host confirms shared defeat',
  );
  await b.wait(
    `window.stichos.state.removed.includes(${JSON.stringify(foeId)})`,
    'visitor confirms same shared defeat',
  );
  pass('Two travelers contribute attacks to one shared raider defeat');
  await a.shot('03-shared-raider-defeat');

  await b.click('#s-together');
  await b.click('#s-room-leave');
  await b.click('#s-room-return');
  await a.wait('window.stichos.state.multiplayer.peers.length===0', 'visitor departure');
  await room(b, code);
  await b.wait(
    "window.stichos.state.removed.includes('origin:cequin')",
    'rejoined world retains depletion',
  );
  pass('Visitor can leave and rejoin the live host without restoring exhausted resources');
  await a.click('#s-together');
  await a.click('#s-room-leave');
  await b.wait(
    "window.stichos.state.multiplayer.status==='disconnected'",
    'host closure ends room',
  );
  assert(!(await b.state()).multiplayer.pending, 'No stranded shared claim after host closure');
  pass(
    'Host departure clearly disconnects the visitor instead of silently continuing a divergent shared world',
  );
  assert.deepEqual(errors, []);
  pass('No browser exceptions or error logs');
} catch (error) {
  failure = error;
  console.error(error.stack);
  for (const c of clients) {
    await c.shot(`FAIL-${c.name.split(' ')[0]}`).catch(() => {});
    fs.writeFileSync(
      path.join(out, `FAIL-${c.name.split(' ')[0]}.json`),
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
