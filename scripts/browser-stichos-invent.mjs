/** Real-input Invent acceptance from an earned campaign save; no gameplay state injection. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const resume = process.argv.includes('--resume');
const downloads = [];
const endpoint = process.argv[2],
  url = process.argv[3] ?? 'http://localhost:4174/';
if (
  !endpoint ||
  !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname) ||
  new URL(url).hostname !== 'localhost'
)
  throw Error('Use isolated workspace CDP and localhost.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  folder = `verso-invent-${Date.now()}`,
  hostDir = `/home/sabino/.local/share/agent-workspace-linux/files/${folder}`,
  workspaceDir = `/workspace/agent/${folder}`,
  out = path.join(root, '.dream-loop/stichos-invent');
fs.mkdirSync(hostDir, { recursive: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(
  path.join(
    root,
    resume
      ? '.dream-loop/stichos-invent/earned-materials.json'
      : '.dream-loop/campaign-fixtures/free-life-home.json',
  ),
  path.join(hostDir, 'free-life-home.json'),
);
const results = [],
  errors = [],
  screenshots = [];
let browser, page, contextId, chooser, failure;
let build;
const snapshots = {};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (ok, text) => {
  if (!ok) throw Error(text);
};
const pass = (name, detail = '') => {
  results.push({ name, detail });
  console.log(`PASS ${name}: ${detail}`);
};
const state = () => read('window.stichos.state');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
async function mouse(x, y, button = 'left') {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button,
    clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button,
    clickCount: 1,
  });
  await delay(150);
}
async function connect(address, events = () => {}) {
  const ws = new WebSocket(address);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (!m.id) return events(m.method, m.params);
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    if (m.error) p.reject(Error(JSON.stringify(m.error)));
    else p.resolve(m.result);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, {
          resolve,
          reject,
          timer: setTimeout(() => {
            pending.delete(n);
            reject(Error(`Timeout: ${method}`));
          }, 20000),
        });
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}
async function read(expression) {
  const r = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitFor(expression, label, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await read(expression).catch(() => false)) return;
    await delay(100);
  }
  throw Error(`Timed out: ${label}`);
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
async function key(key, code, vk, ms = 0) {
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
  });
  if (ms) await delay(ms);
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
  });
  await delay(150);
}
async function shot(name) {
  const r = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
}
async function pause() {
  if (await read("window.stichos.state.modal === 'pause'")) return;
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal === 'pause'", 'pause');
}
async function importFile(filename) {
  await pause();
  chooser = undefined;
  await click('#s-load-file');
  const end = Date.now() + 3000;
  while (!chooser && Date.now() < end) await delay(50);
  assert(chooser, 'Restore did not open a file chooser');
  await page.send('DOM.setFileInputFiles', {
    backendNodeId: chooser.backendNodeId,
    files: [`${workspaceDir}/${filename}`],
  });
  await delay(300);
}
async function worldClick(point) {
  const pos = await read(
    `(()=>{const p=window.stichos.worldToScreen(${JSON.stringify(point)}),r=document.querySelector('#s-world').getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y}})()`,
  );
  await mouse(pos.x, pos.y);
}
async function closeModal() {
  for (let i = 0; i < 4; i++) {
    const s = await state();
    if (!s.modal && !s.dialogue) return;
    await key('Escape', 'Escape', 27);
  }
  assert(!(await state()).modal, 'Modal did not close');
}
async function walk(point, range = 0.55) {
  await closeModal();
  const until = Date.now() + 22000;
  while (Date.now() < until) {
    const p = (await state()).player,
      dx = point.x - p.x,
      dy = point.y - p.y;
    if (Math.hypot(dx, dy) < range) return;
    const horizontal = Math.abs(dx) > Math.abs(dy),
      delta = horizontal ? dx : dy;
    const k = horizontal ? (delta > 0 ? 'd' : 'a') : delta > 0 ? 's' : 'w';
    await key(
      k,
      'Key' + k.toUpperCase(),
      k.toUpperCase().charCodeAt(0),
      Math.min(400, Math.max(40, (Math.abs(delta) / 3) * 1000 - 40)),
    );
  }
  throw Error('Keyboard route did not reach ' + JSON.stringify(point));
}
async function interact(target) {
  await closeModal();
  await worldClick({ x: target.x, y: target.y - 0.25 });
  await waitFor(
    `window.stichos.state.dialogue?.npcId===${JSON.stringify(target.id)}`,
    'actual dialogue ' + target.id,
    25000,
  );
}
async function choose(id) {
  await click(`[data-choice=${JSON.stringify(id)}]`);
}
async function life(tab = 'purpose') {
  await closeModal();
  await click('#s-life');
  await waitFor("window.stichos.state.modal==='life'", 'Life panel');
  await click(`[data-life-tab="${tab}"]`);
}

async function phrase(value) {
  await click('#s-invention-design');
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
  await page.send('Input.insertText', { text: value });
  await click('#s-invention-form button[type=submit]');
  await waitFor(
    `document.querySelector('#s-invention-design')?.value===${JSON.stringify(value)}`,
    'design submitted',
  );
}
async function preview() {
  return read(
    `(()=>{const s=document.querySelector('.s-invention-sheet');return {name:s.querySelector('h3').textContent,icon:s.querySelector('img').src,parts:s.querySelector('small').textContent,cost:document.querySelector('.s-forge-price').textContent,disabled:document.querySelector('#s-invention-build')?.disabled,stats:[...s.querySelectorAll('dd')].map(d=>d.textContent)}})()`,
  );
}
async function approachResource(target) {
  const p = (await state()).player,
    x0 = Math.round(p.x),
    y0 = Math.round(p.y),
    r = 29;
  const cells = await read(
    `(()=>{const a=[];for(let y=${y0 - r};y<=${y0 + r};y++)for(let x=${x0 - r};x<=${x0 + r};x++)if(!window.stichos.blocked(x,y))a.push([x,y]);return a;})()`,
  );
  const allowed = new Set(cells.map((p) => p.join(','))),
    queue = [[x0, y0]],
    parent = new Map([[`${x0},${y0}`, null]]);
  let end;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (Math.hypot(c[0] - target.x, c[1] - target.y) < 1.3) {
      end = c;
      break;
    }
    for (const [dX, dY] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]) {
      const n = [c[0] + dX, c[1] + dY],
        k = n.join(',');
      if (allowed.has(k) && !parent.has(k)) {
        parent.set(k, c);
        queue.push(n);
      }
    }
  }
  assert(end, 'No reachable resource approach');
  const route = [];
  for (let n = end; n; n = parent.get(n.join(','))) route.unshift(n);
  for (let i = 1; i < route.length; ) {
    let end = i;
    const dx = route[i][0] - route[i - 1][0],
      dy = route[i][1] - route[i - 1][1];
    while (
      end + 1 < route.length &&
      end - i < 5 &&
      route[end + 1][0] - route[end][0] === dx &&
      route[end + 1][1] - route[end][1] === dy
    )
      end++;
    await walk({ x: route[end][0], y: route[end][1] }, 0.55);
    i = end + 1;
  }
}
async function gather(kind, item, minimum) {
  await life('estate');
  const t = (await state()).tools.find((t) => t.kind === kind);
  assert(t, 'Missing earned ' + kind);
  if (!t.equipped) await click(`[data-tool-equip="${kind}"]`);
  await closeModal();
  while (((await state()).inventory[item] ?? 0) < minimum) {
    const target = await read(
      `(()=>{const s=window.stichos.state;return window.stichos.props(s.player.x,s.player.y,24).filter(p=>p.kind==='${item === 'wood' ? 'pine' : 'rock'}').sort((a,b)=>Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y))[0]})()`,
    );
    assert(target, 'No actual ' + item + ' resource');
    console.log('GATHER', item, target.id, target.x, target.y);
    await approachResource(target);
    await worldClick({ x: target.x, y: target.y - 0.25 });
    await waitFor(
      `window.stichos.state.workProgress?.propId===${JSON.stringify(target.id)}||window.stichos.state.removed.includes(${JSON.stringify(target.id)})`,
      'approach and first tool stroke',
      25000,
    );
    for (let stroke = 0; stroke < 16 && !(await state()).removed.includes(target.id); stroke++) {
      await delay(t.profile.cooldown * 1000 + 100);
      await worldClick({ x: target.x, y: target.y - 0.25 });
    }
    assert((await state()).removed.includes(target.id), 'Resource not completed by real strokes');
  }
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl, (method, params) => {
    if (method.startsWith('Browser.download')) downloads.push({ method, ...params });
  });
  ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
  await browser.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    browserContextId: contextId,
    downloadPath: workspaceDir,
    eventsEnabled: true,
  });
  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: contextId,
  });
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  page = await connect(
    targets.find((t) => t.id === targetId).webSocketDebuggerUrl,
    (method, params) => {
      if (method === 'Runtime.exceptionThrown') errors.push(params.exceptionDetails);
      if (method === 'Page.fileChooserOpened') chooser = params;
    },
  );
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Page.navigate', { url });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await waitFor("window.stichos?.state.modal==='title'", 'title');
  build = await read(
    "performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('/assets/app-'))",
  );
  await click('#s-start button');
  await waitFor('window.stichos.state.transfer', 'opening');
  await click('#s-skip');
  await waitFor('!window.stichos.state.transfer', 'world');

  await importFile('free-life-home.json');
  await waitFor(
    'window.stichos.state.progression.homes.length===1&&!window.stichos.state.modal',
    'earned household',
  );
  snapshots.initial = await state();
  await life('discover');
  await phrase('icework 58');
  const missing = await preview();
  if (!resume) assert(missing.disabled, 'Missing timber did not block creation');
  await click('#s-invention-next');
  const next = await preview();
  assert(
    next.icon !== missing.icon && next.name !== missing.name,
    'Next invention did not change topology/name',
  );
  await phrase('icework 37');
  const vessel = await preview();
  assert(vessel.icon !== missing.icon, 'Vessel reused implement icon');
  await shot('01-distinct-procedural-preview');
  pass(
    'Arbitrary phrases and next invention change actual component image/name; missing supplies block construction',
  );
  await gather('axe', 'wood', 3);
  await gather('pickaxe', 'ore', 2);
  await approachResource({ x: 4, y: 5 });
  await shot('02-real-materials');
  await pause();
  await click('#s-save-file');
  const downloadedUntil = Date.now() + 10000;
  while (!downloads.some((d) => d.state === 'completed') && Date.now() < downloadedUntil)
    await delay(100);
  const download = downloads.find((d) => d.method === 'Browser.downloadWillBegin');
  assert(
    download && downloads.some((d) => d.guid === download.guid && d.state === 'completed'),
    'Material checkpoint export failed',
  );
  assert(
    path.basename(download.suggestedFilename) === download.suggestedFilename,
    'Unsafe checkpoint filename',
  );
  fs.copyFileSync(
    path.join(hostDir, download.suggestedFilename),
    path.join(out, 'earned-materials.json'),
  );
  await closeModal();
  pass(
    resume
      ? 'Previously exported earned materials restored through file chooser'
      : 'Actual multi-stroke tool gathering supplies required timber and ore',
  );
  await life('discover');
  await phrase('icework 58');
  const expected = await preview(),
    before = await state();
  assert(!expected.disabled, 'Earned supplies and bench did not enable construction');
  await shot('03-ready-implement');
  await click('#s-invention-build');
  await waitFor("window.stichos.state.activeArtifact?.design==='icework 58'", 'created implement');
  const created = await state(),
    genome = created.activeArtifact;
  snapshots.created = created;
  assert(
    genome.name === expected.name && created.displayAppearance.artifactDesign === genome.design,
    'Displayed design differs from equipped object',
  );
  assert(created.player.coins === before.player.coins - genome.cost.coins, 'Wrong creation coins');
  for (const [item, n] of Object.entries(genome.cost.items))
    assert(
      (created.inventory[item] ?? 0) === (before.inventory[item] ?? 0) - n,
      'Wrong creation material ' + item,
    );
  assert(
    created.player.appearance.seed === before.player.appearance.seed,
    'Artifact changed anatomy',
  );
  pass('Construction pays exact generated costs and equips the same design on unchanged body');
  await closeModal();
  await delay(500);
  await shot('04-generated-object-held');
  await key('k', 'KeyK', 75);
  await waitFor("window.stichos.state.modal==='gear'", 'equipment panel');
  assert(
    (await read(
      `document.querySelector('.s-active-invention img')?.src===${JSON.stringify(expected.icon.replace(/width%3D%22[0-9]+%22%20height%3D%22[0-9]+%22/, 'width%3D%22112%22%20height%3D%22112%22'))}`,
    )) ||
      (await read(
        `document.querySelector('.s-active-invention h3')?.textContent===${JSON.stringify(expected.name)}`,
      )),
    'Equipment omits generated implement',
  );
  await shot('05-equipment');
  await click('#s-modal [data-equip="staff"]');
  await closeModal();
  assert(!(await state()).activeArtifact, 'Normal weapon did not stow invention');
  await life('discover');
  await phrase('icework 58');
  await click('#s-invention-act');
  assert((await state()).activeArtifact?.design === 'icework 58', 'Re-equip failed');
  await closeModal();
  assert(
    await read('!!document.querySelector(\'[data-pack-invention="icework 58"]\')'),
    'Dynamic pack omits invention',
  );
  await click('[data-pack-invention="icework 58"]');
  await waitFor("window.stichos.state.modal==='life'", 'pack inspect');
  pass(
    'Equipment, normal-weapon stow, re-equip and actual pack inspection show the generated object',
  );
  await closeModal();
  await pause();
  await page.send('Page.reload');
  await waitFor("window.stichos?.state.modal==='title'", 'reload');
  await click('#s-continue');
  await waitFor('!window.stichos.state.modal&&!window.stichos.state.transfer', 'Continue');
  const restored = await state();
  assert(
    restored.activeArtifact?.design === 'icework 58' &&
      restored.displayAppearance.artifactDesign === 'icework 58',
    'Continue lost equipped construction',
  );
  assert(restored.artifacts.length === 1, 'Continue duplicated construction');
  snapshots.restored = restored;
  pass('Save/Continue preserves the exact equipped physical construction once');
  await life('discover');
  await phrase('icework 37');
  await click('#s-invention-build');
  assert(
    (await state()).artifacts.some((a) => a.design === 'icework 37'),
    'Consumable did not enter pack',
  );
  await closeModal();
  await walk({ x: 0, y: 10 }, 1);
  await delay(2000);
  await life('discover');
  await phrase('icework 37');
  const beforeUse = await state();
  assert(
    beforeUse.player.warmth < 100 ||
      beforeUse.player.breath < 100 ||
      beforeUse.player.hp < beforeUse.player.maxHp,
    'No natural restorative need',
  );
  await click('#s-invention-act');
  const used = await state();
  assert(!used.artifacts.some((a) => a.design === 'icework 37'), 'Use did not consume vessel');
  assert(
    used.player.warmth > beforeUse.player.warmth ||
      used.player.breath > beforeUse.player.breath ||
      used.player.hp > beforeUse.player.hp,
    'Use did not restore a needed body resource',
  );
  pass('Actual consumable restores a naturally depleted resource and removes its physical object');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(250);
  await phrase('icework 58');
  assert(
    await read('document.documentElement.scrollWidth<=innerWidth'),
    'Mobile Invent horizontal overflow',
  );
  await shot('06-mobile-invent');
  const beforeSalvage = await state();
  await click('[data-invention-salvage="icework 58"]');
  const salvaged = await state();
  assert(
    salvaged.artifacts.length === 0 && !salvaged.activeArtifact,
    'Salvage left active or duplicate object',
  );
  assert(
    (salvaged.inventory.ore ?? 0) === (beforeSalvage.inventory.ore ?? 0) + 1,
    'Salvage did not return stated material',
  );
  snapshots.final = salvaged;
  pass('Mobile inspection and salvage remove the object and return one actual ore');
  assert(errors.length === 0, 'Runtime exceptions');
  pass('No runtime exceptions');
} catch (error) {
  failure = String(error.stack ?? error);
  console.error(failure);
  if (page) await shot('failure').catch(() => {});
} finally {
  if (page) {
    const final = await state().catch(() => null);
    fs.writeFileSync(
      path.join(out, 'results.json'),
      JSON.stringify({ url, build, resume, results, errors, failure, final, snapshots }, null, 2),
    );
    page.close();
  }
  if (browser && contextId)
    await browser
      .send('Target.disposeBrowserContext', { browserContextId: contextId })
      .catch(() => {});
  browser?.close();
  fs.rmSync(hostDir, { recursive: true, force: true });
}
if (failure) process.exitCode = 1;
