/** Real-input production QA in fresh contexts of a verified Agent Workspace browser.
 * node scripts/browser-production.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
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
const out = path.join(root, '.dream-loop/stichos-production');
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
  const c = await traveler('Production keeper');
  await c.shot('01-opening');
  const initial = await c.state();
  assert.equal(initial.inventory.cequin, 3);
  pass(
    'A fresh Theo life starts with its real inherited tools and finite coins',
    String(initial.player.coins),
  );
  const keyWalk = async (point) => {
    for (let n = 0; n < 30; n++) {
      const p = (await c.state()).player,
        dx = point.x - p.x,
        dy = point.y - p.y;
      if (Math.hypot(dx, dy) < 0.24) return;
      const horizontal = Math.abs(dx) > Math.abs(dy),
        delta = horizontal ? dx : dy,
        key = horizontal ? (delta > 0 ? 'd' : 'a') : delta > 0 ? 's' : 'w';
      await c.key(
        key,
        'Key' + key.toUpperCase(),
        key.toUpperCase().charCodeAt(0),
        Math.min(230, Math.max(30, ((Math.abs(delta) - 0.1) / p.speed) * 1000)),
      );
    }
    throw Error('Actual keyboard path stalled at ' + JSON.stringify(point));
  };
  const approach = async (target) => {
    const route = await c.read(
      `(()=>{const g=window.stichos,p=g.state.player,t=${JSON.stringify(target)},sx=Math.round(p.x),sy=Math.round(p.y),margin=8,minX=Math.floor(Math.min(sx,t.x)-margin),maxX=Math.ceil(Math.max(sx,t.x)+margin),minY=Math.floor(Math.min(sy,t.y)-margin),maxY=Math.ceil(Math.max(sy,t.y)+margin),key=(x,y)=>x+','+y,q=[{x:sx,y:sy}],seen=new Map([[key(sx,sy),null]]);let end=null;for(let n=0;n<q.length;n++){const a=q[n];if(Math.hypot(a.x-t.x,a.y-t.y)<=1.3){end=a;break;}for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=a.x+dx,y=a.y+dy,k=key(x,y);if(x<minX||x>maxX||y<minY||y>maxY||seen.has(k)||g.blocked(x,y))continue;seen.set(k,a);q.push({x,y});}}if(!end)return null;const path=[];for(let a=end;a;a=seen.get(key(a.x,a.y)))path.push(a);return path.reverse();})()`,
    );
    assert(route, 'A walkable route reaches ' + target.id);
    for (let i = 1; i < route.length; i++) await keyWalk(route[i]);
  };
  const harvest = async (prop, kind) => {
    await c.click(`[data-pack-tool="${kind}"]`);
    await approach(prop);
    await c.worldClick(prop);
    await c.wait(
      `window.stichos.state.workProgress?.propId===${JSON.stringify(prop.id)}||window.stichos.state.removed.includes(${JSON.stringify(prop.id)})`,
      'reach real resource ' + prop.id,
      18000,
    );
    for (let n = 0; n < 18 && !(await c.state()).removed.includes(prop.id); n++) {
      await delay(1450);
      await c.key('e', 'KeyE', 69);
    }
    assert((await c.state()).removed.includes(prop.id), 'Finite strokes finish ' + prop.id);
    console.log('Gathered', prop.id, (await c.state()).inventory);
  };
  while (((await c.state()).inventory.wood ?? 0) < 6) {
    const s = await c.state();
    const prop = await c.read(
      `window.stichos.props(${s.player.x},${s.player.y},22).filter(p=>p.kind==='pine').sort((a,b)=>Math.hypot(a.x-(${s.player.x}),a.y-(${s.player.y}))-Math.hypot(b.x-(${s.player.x}),b.y-(${s.player.y})))[0]`,
    );
    assert(prop, 'Actual accessible timber exists');
    await harvest(prop, 'axe');
  }
  while (((await c.state()).inventory.ore ?? 0) < 1) {
    const s = await c.state();
    const prop = await c.read(
      `window.stichos.props(${s.player.x},${s.player.y},24).filter(p=>p.kind==='rock').sort((a,b)=>Math.hypot(a.x-(${s.player.x}),a.y-(${s.player.y}))-Math.hypot(b.x-(${s.player.x}),b.y-(${s.player.y})))[0]`,
    );
    assert(prop, 'Actual accessible mineral exists');
    await harvest(prop, 'pickaxe');
  }
  pass(
    'Actual axes and pickaxes gather construction materials through repeated finite strokes',
    JSON.stringify((await c.state()).inventory),
  );
  const s = await c.state();
  const site = await c.read(
    `(()=>{const g=window.stichos,s=g.state,points=[],props=g.props(s.player.x,s.player.y,22);for(let y=Math.round(s.player.y)-12;y<=Math.round(s.player.y)+12;y++)for(let x=Math.round(s.player.x)-12;x<=Math.round(s.player.x)+12;x++){let clear=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const t=g.tile(x+dx,y+dy);if(t.building||t.site||!['snow','grass'].includes(t.terrain)||g.blocked(x+dx,y+dy))clear=false;}if(clear&&!props.some(p=>Math.hypot(p.x-x,p.y-y)<2.1)&&!s.npcs.some(n=>n.hp>0&&Math.hypot(n.x-x,n.y-y)<2))points.push({x,y});}return points.sort((a,b)=>Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y))[0];})()`,
  );
  assert(site, 'A real clear three-by-three site exists');
  console.log('Garden site', site);
  await approach({ ...site, id: 'garden site' });
  const before = await c.state();
  await c.click('#v-work');
  await c.click('[data-build-kind="garden"]');
  await c.worldClick(site);
  await c.wait('window.stichos.state.productionStructures.length===1', 'garden built');
  const built = await c.state(),
    id = built.productionStructures[0].id;
  assert.equal(built.player.coins, before.player.coins - 35);
  assert.equal(built.inventory.wood, before.inventory.wood - 5);
  assert.equal(built.inventory.ore ?? 0, (before.inventory.ore ?? 0) - 1);
  pass(
    'World placement creates a visible garden and spends exact construction cost',
    JSON.stringify(site),
  );
  await c.shot('02-garden-constructed');
  await c.click('#v-work');
  await c.click(`[data-machine-start="${id}"]`);
  const loaded = await c.state();
  assert.equal(loaded.inventory.cequin, built.inventory.cequin - 1);
  assert.equal(loaded.inventory.wood ?? 0, (built.inventory.wood ?? 0) - 1);
  assert.equal(loaded.productionStructures[0].job.recipe, 'grow-cequin');
  pass('Loading one batch consumes one real cutting and one timber immediately');
  await c.click('#v-work-close');
  const begun = Date.now();
  let halfway = false,
    lastLog = Date.now();
  while ((await c.state()).productionStructures[0].phase !== 'ready') {
    assert(Date.now() - begun < 130000, 'Batch finishes during bounded active play');
    await c.key('d', 'KeyD', 68, 300);
    await c.key('a', 'KeyA', 65, 600);
    await c.key('d', 'KeyD', 68, 300);
    const state = await c.state(),
      m = state.productionStructures[0];
    if (Date.now() - lastLog > 12000) {
      console.log('Garden active progress', Math.round(m.progress * 100) + '%', state.time);
      lastLog = Date.now();
    }
    if (!halfway && m.progress > 0.35) {
      halfway = true;
      await c.shot('03-garden-growing');
      await c.click('#v-work');
      const frozen = (await c.state()).productionStructures[0].job.elapsed;
      await delay(1600);
      assert.equal(
        (await c.state()).productionStructures[0].job.elapsed,
        frozen,
        'Modal pause does not grant free production time',
      );
      await c.shot('04-garden-progress-ui');
      await c.click('#v-work-close');
    }
  }
  const ready = await c.state();
  assert.equal(ready.productionStructures[0].output.cequin, 3);
  assert.equal(ready.inventory.cequin, loaded.inventory.cequin);
  pass(
    'Eighty active seconds produce three stored portions without automatically granting inventory',
    `${((Date.now() - begun) / 1000).toFixed(1)} wall seconds`,
  );
  await c.shot('05-garden-ready');
  const far = { x: site.x + 4, y: site.y };
  const walkable = await c.read(`!window.stichos.blocked(${far.x},${far.y})`);
  if (walkable) {
    await approach({ ...far, id: 'distant viewing point' });
    await c.click('#v-work');
    assert(await c.read(`document.querySelector('[data-machine-collect="${id}"]').disabled`));
    await c.click('#v-work-close');
    pass('A distant output cannot be collected remotely');
  }
  await approach({ ...site, id: 'garden' });
  await c.click('#v-work');
  await c.click(`[data-machine-collect="${id}"]`);
  const collected = await c.state();
  assert.equal(collected.inventory.cequin, loaded.inventory.cequin + 3);
  assert.equal(collected.productionStructures[0].output.cequin ?? 0, 0);
  assert(await c.read(`document.querySelector('[data-machine-collect="${id}"]').disabled`));
  pass('Approaching and collecting grants exactly three portions once');
  await c.shot('06-collected');
  await c.click('#v-work-close');
  await c.page.send('Page.reload', { ignoreCache: true });
  await c.wait("window.stichos?.state.modal==='title'", 'reload title');
  await c.click('#s-continue');
  await c.wait(
    "window.stichos.state.modal===''&&!window.stichos.state.transfer",
    'continue saved life',
  );
  const restored = await c.state();
  assert.equal(restored.inventory.cequin, collected.inventory.cequin);
  assert.equal(restored.inventory.wood ?? 0, collected.inventory.wood ?? 0);
  assert.equal(restored.player.coins, collected.player.coins);
  assert.equal(restored.productionStructures.length, 1);
  assert.deepEqual(restored.productionStructures[0], collected.productionStructures[0]);
  pass('Reload and Continue preserve the structure, depleted inputs, coins and collected output');
  await c.shot('07-restored-garden');
  fs.writeFileSync(path.join(out, 'final-state.json'), JSON.stringify(restored, null, 2));
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
