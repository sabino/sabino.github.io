/** Actual-input death and mind recovery QA, using an earned campaign fixture.
 * node scripts/browser-stichos-recovery.mjs WORKSPACE_CDP [http://localhost:4174/]
 * The fixture is produced by stichos-campaign.test.ts public actions; gameplay state is never injected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const endpoint = process.argv[2],
  url = process.argv[3] ?? 'http://localhost:4174/';
if (
  !endpoint ||
  !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname) ||
  new URL(url).hostname !== 'localhost'
)
  throw Error('Use the isolated workspace CDP and localhost game origin.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = `verso-stichos-recovery-${Date.now()}`;
const hostDir = `/home/sabino/.local/share/agent-workspace-linux/files/${folder}`;
const workspaceDir = `/workspace/agent/${folder}`;
const out = path.join(root, '.dream-loop/stichos-recovery');
fs.mkdirSync(hostDir, { recursive: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(
  path.join(root, '.dream-loop/campaign-fixtures/before-first-encounter.json'),
  path.join(hostDir, 'before-first-encounter.json'),
);
const results = [],
  errors = [];
let browser, page, contextId, chooser, failure;
const downloads = [];
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
async function walk(point, range = 0.6) {
  await closeModal();
  await worldClick(point);
  await waitFor(
    `Math.hypot(window.stichos.state.player.x-(${point.x}),window.stichos.state.player.y-(${point.y}))<${range}`,
    'actual click walking',
    25000,
  );
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
  await page.send('Page.bringToFront');
  await waitFor("window.stichos?.state.modal==='title'", 'title');
  snapshots.build = await read(
    `({scripts:[...document.scripts].map(s=>s.src).filter(Boolean),assets:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('/assets/app-'))})`,
  );
  await click('#s-start button');
  await waitFor('window.stichos.state.transfer', 'opening');
  await click('#s-skip');
  await waitFor('!window.stichos.state.transfer', 'world');
  await importFile('before-first-encounter.json');
  await waitFor(
    'window.stichos.state.campaign.step===5&&!window.stichos.state.modal',
    'earned encounter fixture',
  );
  snapshots.imported = await state();
  const objective = snapshots.imported.campaignObjective;
  await interact(objective.target);
  await shot('01-real-encounter-choice');
  await choose('campaign:fight');
  await closeModal();
  assert(
    (await state()).campaignObjective.target.id.includes(':guard:'),
    'Fight choice did not activate real guards',
  );
  pass('Earned fixture imported through file chooser and real encounter fight selected');
  const entrance = objective.vault.entrance;
  await walk({ x: entrance.x, y: (await state()).player.y }, 0.6);
  while ((await state()).player.y > entrance.y + 8) {
    const p = (await state()).player;
    await walk({ x: entrance.x, y: Math.max(entrance.y, p.y - 12) }, 0.6);
    console.log('WALK', Math.round((await state()).player.y));
  }
  await walk(entrance, 0.7);
  await shot('02-vault-approach');
  snapshots.beforeCombat = await state();
  const guard =
    snapshots.beforeCombat.npcs
      .filter((n) => n.hostile && n.id.startsWith(objective.vault.id + ':guard:'))
      .sort((a, b) => distance(a, entrance) - distance(b, entrance))[0] ??
    snapshots.beforeCombat.campaignObjective.target;
  assert(
    guard.id.startsWith(objective.vault.id + ':guard:'),
    'Tracked encounter does not identify a real guard',
  );
  // Read collision tiles to plan an ordinary keyboard path. No movement/debug APIs are called.
  const grid = await read(
    `(()=>{const a=[];for(let y=${entrance.y - 33};y<=${entrance.y + 2};y++)for(let x=${entrance.x - 24};x<=${entrance.x + 30};x++)if(!window.stichos.blocked(x,y))a.push([x,y]);return a;})()`,
  );
  const clear = new Set(grid.map((p) => p.join(',')));
  const here = (await state()).player,
    origin = [Math.round(here.x), Math.round(here.y)];
  const queue = [origin],
    parents = new Map([[origin.join(','), null]]);
  let last;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (Math.hypot(cur[0] - guard.x, cur[1] - guard.y) < 1.6) {
      last = cur;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = [cur[0] + dx, cur[1] + dy],
        k = next.join(',');
      if (clear.has(k) && !parents.has(k)) {
        parents.set(k, cur);
        queue.push(next);
      }
    }
  }
  assert(last, 'No collision-clear route to living guard');
  const route = [];
  for (let n = last; n; n = parents.get(n.join(','))) route.unshift(n);
  for (const [x, y] of route.slice(1)) {
    let s = await state();
    if (s.phase === 'lost') break;
    // Stop upon genuine incoming damage; remaining idle permits the guard to finish its attacks.
    if (s.player.hp < snapshots.beforeCombat.player.hp - 2) break;
    for (let i = 0; i < 10; i++) {
      s = await state();
      if (s.phase === 'lost') break;
      const dx = x - s.player.x,
        dy = y - s.player.y;
      if (Math.hypot(dx, dy) < 0.38) break;
      const horizontal = Math.abs(dx) > Math.abs(dy),
        positive = horizontal ? dx > 0 : dy > 0;
      const k = horizontal ? (positive ? 'd' : 'a') : positive ? 's' : 'w';
      await key(
        k,
        'Key' + k.toUpperCase(),
        k.toUpperCase().charCodeAt(0),
        Math.min(240, Math.max(45, (horizontal ? Math.abs(dx) : Math.abs(dy)) * 240)),
      );
    }
  }
  await shot('03-guard-combat');
  const until = Date.now() + 90000;
  while (Date.now() < until && (await state()).phase !== 'lost') {
    await delay(1000);
    const s = await state();
    console.log('HEALTH', s.player.hp);
  }
  await waitFor(
    "window.stichos.state.phase==='lost'&&window.stichos.state.modal==='lost'",
    'real combat death',
    1000,
  );
  snapshots.lost = await state();
  assert(snapshots.lost.player.hp === 0, 'Lost body retained positive health');
  assert(snapshots.lost.transferCandidate, 'Stable signal has no actual recovery host');
  assert(
    await read(
      "document.querySelector('#s-return-life').textContent.includes('Follow the other heartbeat')",
    ),
    'Mind recovery action missing',
  );
  await shot('04-lost-body');
  pass('Actual guard attacks kill the body and expose the visible mind recovery action');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(300);
  assert(
    await read('document.documentElement.scrollWidth<=innerWidth'),
    'Lost-body modal overflows mobile viewport',
  );
  await shot('05-mobile-lost-body');
  await click('#s-return-life');
  await waitFor('window.stichos.state.transfer', 'recovery transition');
  await shot('06-mobile-mind-travel');
  await click('#s-skip');
  await waitFor(
    "window.stichos.state.phase==='playing'&&!window.stichos.state.transfer&&!window.stichos.state.modal",
    'recovered living host',
  );
  snapshots.recovered = await state();
  const dead = snapshots.lost,
    recovered = snapshots.recovered,
    target = dead.transferCandidate;
  assert(
    recovered.occupiedNpcId === target.id && recovered.bodyId === target.id,
    'Recovered body is not the actual offered NPC',
  );
  assert(
    recovered.player.hp > 0 && recovered.player.appearance.seed === target.appearance.seed,
    'New host anatomy/health does not match living target',
  );
  assert(!recovered.npcs.some((n) => n.id === target.id), 'Occupied host is duplicated as an NPC');
  assert(recovered.removed.includes(dead.bodyId), 'Dead previous body is not marked removed');
  assert(
    !recovered.hasNotebook && dead.hasNotebook,
    'Physical notebook incorrectly followed the mind',
  );
  assert(
    JSON.stringify(recovered.campaign) === JSON.stringify(dead.campaign),
    'Death changed campaign choices/evidence',
  );
  assert(
    JSON.stringify(recovered.opened) === JSON.stringify(dead.opened),
    'Death lost opened world objects',
  );
  assert(
    dead.removed.every((id) => recovered.removed.includes(id)),
    'Death lost removed world objects',
  );
  assert(recovered.storyStage === dead.storyStage, 'Death reset story stage');
  await shot('07-mobile-recovered-host');
  pass(
    'Mobile recovery follows a real living host without duplicate body and preserves world/story; notebook stays behind',
    target.id,
  );
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(200);
  await pause();
  await click('#s-save-file');
  const downloadUntil = Date.now() + 10000;
  while (!downloads.some((d) => d.state === 'completed') && Date.now() < downloadUntil)
    await delay(100);
  const begun = downloads.find((d) => d.method === 'Browser.downloadWillBegin');
  assert(
    begun && downloads.some((d) => d.guid === begun.guid && d.state === 'completed'),
    'Recovered save export failed',
  );
  assert(
    path.basename(begun.suggestedFilename) === begun.suggestedFilename,
    'Unsafe export filename',
  );
  const exported = JSON.parse(fs.readFileSync(path.join(hostDir, begun.suggestedFilename), 'utf8'));
  snapshots.exported = exported;
  const originalFixture = JSON.parse(
    fs.readFileSync(path.join(hostDir, 'before-first-encounter.json'), 'utf8'),
  );
  assert(
    exported.campaign.choices[objective.id] === 'fight' &&
      originalFixture.campaign.evidence.every((id) => exported.campaign.evidence.includes(id)),
    'Export lost the confrontation choice or prior evidence',
  );
  const belongings = exported.bodyPossessions.find((b) => b.npcId === dead.bodyId);
  assert(belongings, 'Dead body belongings missing from actual exported save');
  assert(
    JSON.stringify(belongings.inventory) === JSON.stringify(dead.inventory) &&
      belongings.coins === dead.player.coins &&
      belongings.notebook === dead.hasNotebook,
    'Dead body inventory/coins/notebook were moved or destroyed',
  );
  assert(
    JSON.stringify([...belongings.weapons].sort()) === JSON.stringify([...dead.weapons].sort()),
    'Dead body weapon collection lost',
  );
  assert(
    exported.npcs.filter((n) => n.id === dead.bodyId).length === 1,
    'Previous body ledger is duplicated or absent',
  );
  pass(
    'Actual exported save retains exact dead-body inventory, coins, weapons and physical notebook once',
  );
  await page.send('Page.reload');
  await waitFor("window.stichos?.state.modal==='title'", 'reload title');
  await click('#s-continue');
  await waitFor(
    "window.stichos.state.phase==='playing'&&!window.stichos.state.modal&&!window.stichos.state.transfer",
    'Continue recovered host',
  );
  const restored = await state();
  snapshots.restored = restored;
  assert(
    restored.bodyId === recovered.bodyId && restored.occupiedNpcId === target.id,
    'Continue changed recovered host',
  );
  assert(
    JSON.stringify(restored.inventory) === JSON.stringify(recovered.inventory) &&
      restored.player.coins === recovered.player.coins,
    'Continue changed host possessions',
  );
  assert(
    JSON.stringify(restored.campaign) === JSON.stringify(dead.campaign) &&
      dead.opened.every((id) => restored.opened.includes(id)),
    'Continue lost story or world',
  );
  assert(!restored.npcs.some((n) => n.id === target.id), 'Continue duplicated occupied host');
  await shot('08-continued-host');
  await key('j', 'KeyJ', 74);
  assert(
    await read('/remembered|remains with|another body/i.test(document.body.innerText)'),
    'Borrowed host journal misrepresents physical notebook',
  );
  await shot('09-remembered-pages-after-death');
  pass(
    'Save/Continue retains recovered host, belongings and story, and journal presents remembered pages',
  );
  assert(errors.length === 0, 'Browser runtime exceptions occurred');
  pass('No browser runtime exceptions');
} catch (error) {
  failure = String(error.stack ?? error);
  console.error(failure);
  if (page) await shot('failure').catch(() => {});
} finally {
  if (page) {
    const final = await state().catch(() => null);
    fs.writeFileSync(
      path.join(out, 'results.json'),
      JSON.stringify(
        {
          url,
          results,
          errors,
          failure,
          final,
          snapshots,
          fixtures:
            'Earned public-action campaign save imported through real file chooser; all subsequent gameplay used mouse/keyboard.',
        },
        null,
        2,
      ),
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
