/** Actual save download/import and offline checks in a fresh Agent Workspace browser context.
 * node scripts/browser-stichos-storage.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
 * Never connect this script to host Chrome. It does not inject simulation or save state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoint = process.argv[2],
  url = process.argv[3] || 'http://localhost:4174/';
if (
  !endpoint ||
  !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname) ||
  new URL(url).hostname !== 'localhost'
)
  throw Error('Use isolated workspace CDP and the localhost game origin.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = `verso-stichos-storage-${Date.now()}`;
const hostDir = `/home/sabino/.local/share/agent-workspace-linux/files/${folder}`;
const workspaceDir = `/workspace/agent/${folder}`;
const out = path.join(root, '.dream-loop/stichos-storage');
fs.mkdirSync(hostDir, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const results = [],
  errors = [],
  downloads = [];
let browser, page, contextId, chooser, failure;
let offlineTesting = false;
const offlineResponses = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (ok, text) => {
  if (!ok) throw Error(text);
};
const pass = (name, detail = '') => {
  results.push({ name, detail });
  console.log(`PASS ${name}: ${detail}`);
};
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
  const p = await read(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing button');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...p,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...p,
  });
  await delay(150);
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
async function networkOffline(value) {
  await page.send('Network.emulateNetworkConditionsByRule', {
    emulateOfflineServiceWorker: value,
    matchedNetworkConditions: value
      ? [{ urlPattern: '', offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }]
      : [],
  });
  await page.send('Network.overrideNetworkState', {
    offline: value,
    latency: 0,
    downloadThroughput: value ? 0 : -1,
    uploadThroughput: value ? 0 : -1,
  });
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl, (method, params) => {
    if (method.startsWith('Browser.download')) downloads.push({ method, ...params });
  });
  ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
  await browser.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: workspaceDir,
    browserContextId: contextId,
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
      if (method === 'Network.responseReceived' && offlineTesting)
        offlineResponses.push({
          url: params.response.url,
          fromServiceWorker: params.response.fromServiceWorker,
        });
    },
  );
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Page.navigate', { url });
  await page.send('Page.bringToFront');
  await waitFor("window.stichos?.state.modal === 'title'", 'title');
  await click('#s-start button');
  await waitFor('window.stichos.state.transfer', 'opening');
  await click('#s-skip');
  await waitFor('!window.stichos.state.transfer', 'world');
  await key('s', 'KeyS', 83, 3500);
  await pause();
  const saved = await read('window.stichos.state');
  await click('#s-save-file');
  const until = Date.now() + 10000;
  while (!downloads.some((d) => d.state === 'completed') && Date.now() < until) await delay(100);
  const download = downloads.find((d) => d.method === 'Browser.downloadWillBegin');
  assert(
    download && downloads.some((d) => d.guid === download.guid && d.state === 'completed'),
    'Save download did not finish',
  );
  const filename = path.basename(download.suggestedFilename);
  assert(filename === download.suggestedFilename, 'Invalid filename');
  const exported = JSON.parse(fs.readFileSync(path.join(hostDir, filename), 'utf8'));
  assert(
    exported.player.x === saved.player.x &&
      exported.player.y === saved.player.y &&
      exported.seed === saved.seed &&
      exported.worldGeneration === saved.worldGeneration &&
      exported.exploration?.revision === saved.explorationRevision,
    'Export does not match live game',
  );
  pass('Actual JSON download matches live position, seed, generation, and exploration', filename);
  await click('#s-resume');
  await key('s', 'KeyS', 83, 750);
  assert(
    (await read('window.stichos.state.player.y')) > saved.player.y + 1,
    'Movement before restore failed',
  );
  await importFile(filename);
  await waitFor("window.stichos.state.modal === ''", 'valid restored file');
  const restored = await read('window.stichos.state');
  assert(
    restored.player.x === saved.player.x &&
      restored.player.y === saved.player.y &&
      JSON.stringify(restored.inventory) === JSON.stringify(saved.inventory) &&
      restored.worldGeneration === saved.worldGeneration &&
      restored.explorationRevision === saved.explorationRevision &&
      JSON.stringify(restored.exploredBounds) === JSON.stringify(saved.exploredBounds) &&
      JSON.stringify(restored.discoveredSites) === JSON.stringify(saved.discoveredSites),
    'Imported save did not restore exact position, inventory, generation, and exploration',
  );
  pass('File chooser restores downloaded position, inventory, world, and atlas knowledge');
  const bad = {
    'broken.json': '{"x":',
    'wrong-version.json': '{"version":999}',
    'oversized.json': ' '.repeat(8000001),
  };
  for (const [name, data] of Object.entries(bad)) {
    fs.writeFileSync(path.join(hostDir, name), data);
    await pause();
    const before = await read('JSON.stringify(window.stichos.state)');
    await importFile(name);
    assert(
      await read(
        "window.stichos.state.modal === 'pause' && document.querySelector('.s-modal-note')?.textContent.includes('not a valid')",
      ),
      `Rejected file needs visible feedback: ${name}`,
    );
    assert(
      (await read('JSON.stringify(window.stichos.state)')) === before,
      `Rejected file altered progress: ${name}`,
    );
    pass('Invalid file preserves the live run', name);
  }
  await shot('01-import-rejection');
  await waitFor(
    'navigator.serviceWorker.controller !== null',
    'service worker controlling app',
    30000,
  );
  const caches = await read(
    '(async()=>{const keys=await caches.keys();return await Promise.all(keys.map(async k=>({name:k,assets:(await (await caches.open(k)).keys()).length})))})()',
  );
  assert(
    caches.some((c) => c.assets > 5),
    'App has not cached its assets',
  );
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  offlineTesting = true;
  await networkOffline(true);
  await page.send('Page.reload', { ignoreCache: true });
  await waitFor("window.stichos?.state.modal === 'title'", 'offline title');
  // Chromium can report navigator.onLine=true after a navigation despite active
  // per-request offline emulation. Verify actual networking and SW response instead.
  assert(
    await read(
      `(async()=>{try{await fetch('/__stichos_uncached_probe__?t='+Date.now(),{cache:'no-store'});return false}catch{return true}})()`,
    ),
    'Uncached network request succeeded while offline',
  );
  assert(
    offlineResponses.some((r) => r.fromServiceWorker && new URL(r.url).pathname === '/'),
    'Offline navigation was not served by the service worker',
  );
  await click('#s-continue');
  await waitFor("window.stichos.state.modal === ''", 'offline continuation');
  const offline = await read('window.stichos.state');
  assert(
    offline.player.x === saved.player.x && offline.player.y === saved.player.y,
    'Offline continue lost position',
  );
  await key('s', 'KeyS', 83, 450);
  assert(
    (await read('window.stichos.state.player.y')) > offline.player.y + 0.4,
    'Offline movement failed',
  );
  await pause();
  await shot('02-offline-play');
  pass('Offline reload, saved continuation, and real movement', JSON.stringify(caches));
  assert(errors.length === 0, `Runtime errors: ${JSON.stringify(errors)}`);
  pass('No runtime exceptions');
} catch (error) {
  failure = error.stack || String(error);
  console.error(failure);
  if (page) await shot('99-failure').catch(() => {});
} finally {
  if (page) {
    await networkOffline(false).catch(() => {});
    page.close();
  }
  if (browser) {
    if (contextId)
      await browser
        .send('Target.disposeBrowserContext', { browserContextId: contextId })
        .catch(() => {});
    browser.close();
  }
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      { results, errors, failure: failure || null, completed: new Date().toISOString() },
      null,
      2,
    ),
  );
  if (failure) process.exitCode = 1;
}
