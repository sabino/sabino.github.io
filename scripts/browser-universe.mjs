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
const out = path.join(root, '.dream-loop/universe-qa');
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

async function choose(c, seed = '3886') {
  await c.fill('#s-seed-input', seed);
  await c.click('#s-start button[type=submit]');
  await c.wait("window.stichos.state.modal==='creation'", 'life creator');
}
async function accept(c) {
  await c.click('#v-accept-life');
  await c.wait('window.stichos.state.transfer', 'actual arrival transition');
  await c.click('#s-skip');
  await c.wait(
    "window.stichos.state.modal===''&&!window.stichos.state.transfer",
    'inhabited world',
  );
}
async function facts(c) {
  return c.read(
    `(()=>{const f=document.querySelector('#v-life-facts');return {name:f.querySelector('h3').textContent,profession:f.querySelector('p').textContent,details:[...f.querySelectorAll('dd')].map(n=>n.textContent),coat:document.querySelector('[data-color=coat]').value,portrait:f.querySelector('canvas').toDataURL()};})()`,
  );
}
async function fit(c, selectors) {
  for (const selector of selectors) {
    const box = await c.read(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,disabled:e.disabled};})()`,
    );
    assert(box && box.width > 0 && box.height > 0, `${c.name}: visible ${selector}`);
    assert(
      box.x >= -1 && box.x + box.width <= (c.mobile ? 390 : 1440) + 1,
      `${c.name}: horizontal bounds ${selector}`,
    );
  }
  assert(
    await c.read('document.documentElement.scrollWidth<=innerWidth+1'),
    `${c.name}: no page overflow`,
  );
}
async function host(c) {
  await c.click('#s-together');
  await c.click('.v-room-mode summary');
  await c.click('#s-room-mode');
  await c.key('Home', 'Home', 36);
  await c.key('Enter', 'Enter', 13);
  await c.fill('#s-room-name', 'Universe host');
  await c.click('#s-room-form button[type=submit]');
  await c.wait("window.stichos.state.multiplayer.status==='online'", 'host is online', 30000);
  await c.wait("!!document.querySelector('#s-room-invitation')", 'shareable invitation');
  const invitation = await c.read("document.querySelector('#s-room-invitation').value");
  assert.equal(new URL(invitation).searchParams.get('planet'), '3886');
  assert(await c.read("!!document.querySelector('#v-room-qr svg')"), 'A real QR is displayed.');
  await c.shot('06-host-invitation');
  const room = (await c.state()).multiplayer.room;
  await c.click('#s-room-return');
  return { invitation, room };
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  const a = await traveler('Host');
  await fit(a, ['#s-start', '#v-title-room', '#v-title-galaxy']);
  await a.shot('01-title');
  const mobilePreview = await traveler('MobilePreview', url, true);
  await fit(mobilePreview, ['#s-start', '#v-title-room']);
  await mobilePreview.shot('01-mobile-title');
  await choose(mobilePreview);
  await fit(mobilePreview, ['#v-create-name', '#v-reroll', '#v-accept-life']);
  await mobilePreview.shot('02-mobile-creator');
  await mobilePreview.click('#v-reroll');
  pass('Mobile title and creator have no horizontal overflow and real reroll remains reachable');
  await a.focus();
  await choose(a);
  const initial = await facts(a);
  let rerolled;
  for (let attempt = 0; attempt < 12; attempt++) {
    await a.click('#v-reroll');
    rerolled = await facts(a);
    if (
      rerolled.name !== initial.name &&
      rerolled.profession !== initial.profession &&
      JSON.stringify(rerolled.details) !== JSON.stringify(initial.details)
    )
      break;
  }
  assert.notEqual(rerolled.name, initial.name);
  assert.notEqual(rerolled.profession, initial.profession);
  assert.notDeepEqual(rerolled.details, initial.details);
  pass('Reroll changes the visible person, profession and existing-life circumstances');
  await a.fill('#v-create-name', 'Mira Browser Witness');
  await a.key('Tab', 'Tab', 9);
  assert.equal((await facts(a)).name, 'Mira Browser Witness');
  // A native color input is operated through real pointer/keyboard events below.
  // Keep its picker sequence explicit so it can be inspected against Chromium.
  await a.click('[data-color=coat]');
  console.log(
    'NATIVE_COLOR ' +
      JSON.stringify({
        targetId: a.targetId,
        browserContextId: a.browserContextId,
        initial: rerolled.coat,
      }),
  );
  // Native Chromium color popovers belong to the browser, outside page CDP input.
  // Operate this visible picker with workspace-scoped native input while this bounded wait runs.
  await a.wait(
    `document.querySelector('[data-color=coat]').value!==${JSON.stringify(rerolled.coat)}`,
    'native color changed',
    60000,
  );
  await delay(500);
  const customized = await facts(a);
  assert.notEqual(
    customized.coat,
    rerolled.coat,
    'The actual color picker changes the visible coat.',
  );
  assert.notEqual(customized.portrait, rerolled.portrait);
  await a.shot('02-customized-life');
  pass('Name and coat customization visibly change the candidate');
  await accept(a);
  const accepted = await a.state();
  assert.equal(accepted.seed, 3886);
  assert.equal(accepted.player.name, customized.name);
  assert.equal(accepted.displayAppearance.coat, customized.coat);
  await a.shot('03-arrived-life');
  pass(
    'Accepting the candidate enters its actual body through the arrival transition',
    accepted.bodyId,
  );
  await a.key('Escape', 'Escape', 27);
  await a.wait("window.stichos.state.modal==='pause'", 'pause commits the continuing life');
  await a.page.send('Page.reload', { ignoreCache: true });
  await a.wait("window.stichos?.state.modal==='title'", 'reload title');
  await a.click('#s-continue');
  await a.wait("window.stichos.state.modal===''", 'saved life continued');
  const continued = await a.state();
  assert.equal(continued.bodyId, accepted.bodyId);
  assert.equal(continued.player.name, accepted.player.name);
  assert.equal(continued.displayAppearance.coat, accepted.displayAppearance.coat);
  assert.equal(continued.seed, 3886);
  pass('Save and Continue retain the chosen identity and physical appearance');
  await a.click('#s-pause');
  await a.click('#v-retire');
  await a.wait("window.stichos.state.modal==='retire'", 'explicit leave-body confirmation');
  assert.equal((await a.state()).bodyId, accepted.bodyId);
  await a.shot('04-leave-body-confirmation');
  await a.click('#v-retire-cancel');
  assert.equal((await a.state()).bodyId, accepted.bodyId);
  await a.click('#s-pause');
  await a.click('#v-retire');
  await a.click('#v-retire-confirm');
  await a.wait("window.stichos.state.modal==='creation'", 'confirmed next-body creator');
  await a.click('#v-create-back');
  await a.click('#v-pause-resume');
  assert.equal(
    (await a.state()).bodyId,
    accepted.bodyId,
    'Backing out before acceptance preserves the current body.',
  );
  pass(
    'Leave-body requires explicit confirmation, and backing out before acceptance preserves the body',
  );
  await a.click('#v-galaxy');
  await a.wait("window.stichos.state.modal==='galaxy'", 'galaxy atlas');
  await fit(a, ['#v-galaxy-canvas', '#v-planet-travel', '#v-sector-next']);
  await a.click('#v-galaxy-in');
  await a.click('#v-sector-next');
  await a.shot('04-galaxy');
  await a.click('#v-galaxy-close');
  pass('Galaxy pan/zoom controls preserve the current body');
  assert.equal((await a.state()).bodyId, accepted.bodyId);
  const { invitation, room } = await host(a);
  const b = await traveler('LinkVisitor', invitation);
  await b.wait(
    "!!document.querySelector('#v-join-invite')",
    'URL invitation selects the host planet',
  );
  await b.click('#v-join-invite');
  await b.wait("window.stichos.state.modal==='creation'", 'invited creator');
  await accept(b);
  await b.wait(
    "window.stichos.state.multiplayer.status==='online'",
    'link visitor connected',
    30000,
  );
  assert.equal((await b.state()).seed, 3886);
  assert.equal((await b.state()).multiplayer.room, room);
  await a.wait('window.stichos.state.multiplayer.peers.length===1', 'host sees visitor');
  await b.shot('07-link-visitor');
  pass('URL invitation opens the correct creator and room without entering a seed', room);
  const c = await traveler('CodeVisitor', url, true);
  await fit(c, ['#s-start', '#v-title-room']);
  await c.fill('#v-title-code', room);
  await c.click('#v-title-room button[type=submit]');
  await c.wait("window.stichos.state.modal==='creation'", 'room-code metadata finds planet', 30000);
  await fit(c, ['#v-create-name', '#v-reroll', '#v-accept-life']);
  await c.shot('08-mobile-creator');
  await accept(c);
  await c.wait(
    "window.stichos.state.multiplayer.status==='online'",
    'code visitor connected',
    30000,
  );
  assert.equal((await c.state()).seed, 3886);
  assert.equal((await c.state()).multiplayer.room, room);
  await c.shot('09-mobile-world');
  pass('Room code discovers the same planet from a fresh mobile context without manual seed');
  assert.deepEqual(errors, []);
  pass('No browser exceptions or error logs');
} catch (error) {
  failure = error;
  console.error(error.stack);
  for (const c of clients) {
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
