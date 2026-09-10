/**
 * Storage, accessibility, phase-modal, and offline acceptance checks.
 * Node 22.18+; use ONLY an isolated Agent Workspace Chromium CDP endpoint.
 * node scripts/browser-storage-check.mjs http://127.0.0.1:PORT http://localhost:4174
 * Phase fixtures are generated offline and imported using the game's file UI.
 * The separate real-input campaign is scripts/browser-check.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/game.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.argv[2],
  baseUrl = process.argv[3] || 'http://localhost:4174';
if (!endpoint || !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname))
  throw new Error('Pass the workspace-owned loopback CDP endpoint.');
if (new URL(baseUrl).hostname !== 'localhost')
  throw new Error('Use the isolated localhost game origin.');
const origin = new URL(baseUrl).origin;
const runFolder = `run-${Date.now()}`;
const hostDir = `/home/sabino/.local/share/agent-workspace-linux/files/verso-storage-qa/${runFolder}`;
const workspaceDir = `/workspace/agent/verso-storage-qa/${runFolder}`;
const out = path.join(root, '.dream-loop/storage-qa');
fs.mkdirSync(hostDir, { recursive: true });
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.rmSync(path.join(out, '99-failure.png'), { force: true });
const started = new Date(),
  results = [],
  errors = [],
  downloads = [],
  responses = [];
const storageKeys = ['verso.save.v1', 'verso.settings.v1'];
let browser,
  page,
  targetId,
  backup,
  failure,
  offline = false,
  restoredBackup = false,
  cacheEvidence;
let fileChooser,
  loadCount = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) {
  if (!value) throw new Error(message);
}
function pass(name, details = '') {
  results.push({ name, details });
  console.log(`PASS ${name}${details ? ': ' + details : ''}`);
}
async function connect(url, onEvent = () => {}) {
  const ws = new WebSocket(url); // No Origin header; Agent Workspace CDP requires this.
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (!m.id) return onEvent(m.method, m.params);
    const task = waiting.get(m.id);
    if (!task) return;
    clearTimeout(task.timer);
    waiting.delete(m.id);
    m.error ? task.reject(new Error(JSON.stringify(m.error))) : task.resolve(m.result);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const callId = ++id;
        const timer = setTimeout(() => {
          waiting.delete(callId);
          reject(new Error(`CDP timeout: ${method}`));
        }, 20000);
        waiting.set(callId, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: callId, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}
async function evaluate(expression) {
  const r = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitFor(expression, label, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      if (await evaluate(expression)) return;
    } catch (error) {
      if (!/navigated or closed|context.*destroyed|Cannot find context/i.test(error.message))
        throw error;
    }
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function click(selector) {
  const point = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing ${selector}');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...point,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...point,
  });
  await pause(130);
}
async function tap(key, modifiers = 0) {
  const special = { Tab: ['Tab', 9], Escape: ['Escape', 27], Enter: ['Enter', 13] };
  const args = {
    key,
    code: special[key]?.[0] || `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: special[key]?.[1] || key.toUpperCase().charCodeAt(0),
    modifiers,
  };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...args });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...args });
  await pause(150);
}
async function shot(name) {
  const r = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
}
async function current() {
  return evaluate('window.verso.state');
}
async function setOffline(enabled) {
  // Current Chromium separates request/SW conditions from navigator state.
  // The deprecated emulateNetworkConditions leaves navigator.onLine unchanged.
  await page.send('Network.emulateNetworkConditionsByRule', {
    emulateOfflineServiceWorker: enabled,
    matchedNetworkConditions: enabled
      ? [{ urlPattern: '', offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }]
      : [],
  });
  await page.send('Network.overrideNetworkState', {
    offline: enabled,
    latency: 0,
    downloadThroughput: enabled ? 0 : -1,
    uploadThroughput: enabled ? 0 : -1,
  });
}
async function ensurePause() {
  const modal = await evaluate('window.verso.modal');
  if (modal === 'pause') return;
  assert(modal === null, `Cannot pause from ${modal}`);
  await tap('Escape');
  await waitFor('window.verso.modal === "pause"', 'pause menu');
}
async function importFile(filename) {
  await ensurePause();
  fileChooser = undefined;
  await click('#import-open');
  const until = Date.now() + 3000;
  while (!fileChooser && Date.now() < until) await pause(50);
  assert(fileChooser, 'Restore UI did not open its file chooser');
  await page.send('DOM.setFileInputFiles', {
    backendNodeId: fileChooser.backendNodeId,
    files: [`${workspaceDir}/${filename}`],
  });
  await pause(250);
}
function fixtureFile(name, game) {
  const data = game.serialize();
  Game.restore(data); // Validate fixture against the production core contract.
  fs.writeFileSync(path.join(hostDir, name), JSON.stringify(data, null, 2));
  return name;
}
async function phaseChecks(phase, selector) {
  await waitFor(`window.verso.modal === ${JSON.stringify(phase)}`, `${phase} modal`);
  for (const closeKey of ['j', 'Escape']) {
    await tap('j');
    assert(
      await evaluate('window.verso.modal === "journal"'),
      `J failed to open journal from ${phase}`,
    );
    await tap(closeKey);
    assert(
      await evaluate(
        `window.verso.modal === ${JSON.stringify(phase)} && !!document.querySelector(${JSON.stringify(selector)})`,
      ),
      `${closeKey} failed to restore ${phase} controls`,
    );
  }
  await shot(`phase-${phase}`);
  pass(`Journal J/Escape preserves ${phase} phase and controls`);
}

try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl, (method, params) => {
    if (method.startsWith('Browser.download')) downloads.push({ method, ...params });
  });
  ({ targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    background: false,
  }));
  console.log(`Created independent storage QA target ${targetId}`);
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  page = await connect(
    targets.find((t) => t.id === targetId).webSocketDebuggerUrl,
    (method, params) => {
      if (method === 'Page.fileChooserOpened') fileChooser = params;
      if (method === 'Page.loadEventFired') loadCount++;
      if (method === 'Network.responseReceived' && params.response.url.startsWith(origin))
        responses.push({
          url: params.response.url,
          offline,
          fromServiceWorker: params.response.fromServiceWorker,
          fromDiskCache: params.response.fromDiskCache,
        });
      if (method === 'Runtime.exceptionThrown')
        errors.push({ method, offline, details: params.exceptionDetails });
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
        errors.push({ method, offline, details: params.args });
      if (method === 'Log.entryAdded' && params.entry.level === 'error')
        errors.push({ method, offline, details: params.entry });
    },
  );
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Log.enable');
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: workspaceDir,
    eventsEnabled: true,
  });
  await page.send('Page.navigate', { url: baseUrl });
  await waitFor(
    'window.verso?.loaded && !!document.querySelector("#operative-name")',
    'loaded title',
    30000,
  );
  backup = await evaluate(
    `Object.fromEntries(${JSON.stringify(storageKeys)}.map(key=>[key,localStorage.getItem(key)]))`,
  );
  fs.writeFileSync(
    path.join(hostDir, 'pre-check-storage-backup.json'),
    JSON.stringify({ origin, values: backup }, null, 2),
  );

  await click('#operative-name');
  await tap('Tab', 8);
  assert(
    await evaluate('document.activeElement.id === "title-audio"'),
    'Shift+Tab from first name input escaped the title dialog',
  );
  await tap('Tab');
  assert(
    await evaluate('document.activeElement.id === "operative-name"'),
    'Tab from final title control failed to wrap to name input',
  );
  for (let i = 0; i < 8; i++) {
    await tap('Tab');
    assert(
      await evaluate('!!document.activeElement.closest("#modal-layer")'),
      'Tab escaped modal into background HUD',
    );
  }
  pass('Name-input Shift+Tab and forward Tab remain trapped in title');

  const name = '<b>&"O\'Neil</b>';
  await click('#operative-name');
  await tap('a', 2);
  await page.send('Input.insertText', { text: name });
  await click('#start-form button[type=submit]');
  await waitFor('window.verso.modal === "briefing"', 'briefing');
  assert(
    await evaluate(
      `document.querySelector('.transmission').textContent.includes(${JSON.stringify(name)}) && !document.querySelector('.transmission b')`,
    ),
    'Name HTML was not escaped in briefing',
  );
  await shot('01-escaped-name-briefing');
  await click('#deploy-button');
  await pause(900);
  await tap('j');
  assert(
    await evaluate(
      `document.querySelector('.journal-heading').textContent.includes(${JSON.stringify(name)}) && !document.querySelector('.journal-heading b')`,
    ),
    'Name HTML was not escaped in journal',
  );
  await shot('02-escaped-name-journal');
  await tap('Escape');
  pass('HTML characters in name display literally in briefing and journal');

  await ensurePause();
  const exportedState = await current();
  await click('#save-export');
  const downloadUntil = Date.now() + 10000;
  while (
    !downloads.some((d) => d.method === 'Browser.downloadProgress' && d.state === 'completed') &&
    Date.now() < downloadUntil
  )
    await pause(100);
  const began = downloads.find((d) => d.method === 'Browser.downloadWillBegin');
  assert(
    began && downloads.some((d) => d.guid === began.guid && d.state === 'completed'),
    'UI save download did not complete',
  );
  assert(
    path.basename(began.suggestedFilename) === began.suggestedFilename,
    'Download filename is not a safe basename',
  );
  const exportedFile = path.join(hostDir, began.suggestedFilename);
  assert(fs.existsSync(exportedFile), 'Download did not arrive in the authorized mounted folder');
  const exported = JSON.parse(fs.readFileSync(exportedFile, 'utf8'));
  assert(
    exported.state.name === name && exported.state.weapon.name === exportedState.weapon.name,
    'Downloaded JSON lost name or seeded equipment',
  );
  Game.restore(exported);
  pass('Actual Download save creates valid JSON in workspace folder', began.suggestedFilename);

  // Advance through real input so importing the earlier file must restore state.
  await click('#resume');
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'd',
    code: 'KeyD',
    windowsVirtualKeyCode: 68,
  });
  await pause(350);
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'd',
    code: 'KeyD',
    windowsVirtualKeyCode: 68,
  });
  assert(
    (await current()).player.x > exportedState.player.x + 20,
    'Movement setup for import did not advance player',
  );
  await importFile(began.suggestedFilename);
  await waitFor('window.verso.modal === null', 'valid save import');
  const imported = await current();
  assert(
    imported.name === name &&
      Math.abs(imported.player.x - exportedState.player.x) < 0.01 &&
      imported.weapon.name === exportedState.weapon.name,
    'Valid import did not restore exported position/name/equipment',
  );
  pass('Actual Restore a save file chooser restores position, name, and equipment');

  const badFiles = {
    'corrupt-json.json': '{"version":1, definitely-not-json',
    'unsupported-version.json': JSON.stringify({ version: 999, state: exported.state }),
    'oversized.json': ' '.repeat(1_000_001),
  };
  for (const [filename, content] of Object.entries(badFiles)) {
    fs.writeFileSync(path.join(hostDir, filename), content);
    await ensurePause();
    const before = await evaluate('JSON.stringify(window.verso.exportSave())');
    await importFile(filename);
    assert(
      await evaluate(
        'window.verso.modal === "pause" && document.querySelector("#notification").textContent.includes("not a valid Verso save")',
      ),
      `Invalid file did not show safe rejection: ${filename}`,
    );
    assert(
      (await evaluate('JSON.stringify(window.verso.exportSave())')) === before,
      `Invalid file changed live progress: ${filename}`,
    );
    pass('Invalid import preserves current progress', filename);
  }
  await shot('03-invalid-import-preserved');

  // These are explicitly offline-generated fixtures, not campaign completions.
  const complete = new Game('PHASE FIXTURE', 0x71a3);
  for (const e of complete.state.entities.filter((e) => e.kind === 'species')) e.scanned = true;
  complete.state.catalog = complete.state.entities
    .filter((e) => e.kind === 'species')
    .map((e) => e.id);
  complete.state.player.x = 1030;
  complete.state.player.y = 366;
  complete.interact();
  await importFile(fixtureFile('phase-complete.json', complete));
  await phaseChecks('complete', '#next-assignment');
  await click('#next-assignment');
  await click('#deploy-button');
  await pause(250);

  const dead = new Game('PHASE FIXTURE', 0x71a3);
  dead.state.phase = 'dead';
  dead.state.player.hp = 0;
  await importFile(fixtureFile('phase-dead.json', dead));
  await phaseChecks('dead', '#reincarnate');
  await click('#reincarnate');
  await waitFor('window.verso.modal === null', 'reincarnation from phase fixture');

  const reveal = Game.restore(complete.serialize());
  reveal.nextMission();
  for (const relay of reveal.state.entities
    .filter((e) => e.kind === 'relay')
    .sort((a, b) => a.order - b.order)) {
    reveal.state.player.x = relay.x;
    reveal.state.player.y = relay.y;
    reveal.interact();
  }
  reveal.state.player.x = 1030;
  reveal.state.player.y = 366;
  reveal.interact();
  reveal.nextMission();
  const witness = reveal.state.entities.find((e) => e.kind === 'survivor');
  witness.state = 'rescued';
  witness.active = true;
  reveal.state.rescued = true;
  reveal.state.player.x = 1030;
  reveal.state.player.y = 366;
  reveal.interact();
  await importFile(fixtureFile('phase-reveal.json', reveal));
  await phaseChecks('reveal', '#endless');
  await click('#endless');
  await click('#deploy-button');
  await pause(250);
  await importFile(began.suggestedFilename);
  await waitFor('window.verso.modal === null', 'restore ordinary playing save');

  await waitFor('"serviceWorker" in navigator', 'service worker capability');
  await waitFor('navigator.serviceWorker.controller !== null', 'service worker controller', 45000);
  cacheEvidence = await evaluate(
    '(async()=>{const r=await navigator.serviceWorker.ready;const names=await caches.keys();return{scope:r.scope,script:r.active?.scriptURL,state:r.active?.state,controlled:!!navigator.serviceWorker.controller,caches:await Promise.all(names.map(async name=>({name,urls:(await (await caches.open(name)).keys()).map(r=>r.url)}))),manifest:document.querySelector("link[rel=manifest]")?.href};})()',
  );
  assert(
    cacheEvidence.caches.some(
      (c) =>
        c.urls.some((u) => u.endsWith('/index.html')) &&
        c.urls.some((u) => u.includes('/art/verge.png')) &&
        c.urls.some((u) => u.includes('/assets/')),
    ),
    'Service worker cache is missing entry, art, or bundle',
  );
  assert(cacheEvidence.manifest, 'Production manifest link missing');
  pass(
    'Production service worker activates, controls page, and caches application',
    `${cacheEvidence.caches.length} cache(s)`,
  );
  await ensurePause();
  const beforeOffline = await current();
  offline = true;
  await setOffline(true);
  await page.send('Network.setCacheDisabled', { cacheDisabled: true }); // HTTP cache cannot mask service worker coverage.
  const loadsBeforeOffline = loadCount;
  await page.send('Page.reload', { ignoreCache: true });
  const loadUntil = Date.now() + 30000;
  while (loadCount <= loadsBeforeOffline && Date.now() < loadUntil) await pause(100);
  assert(loadCount > loadsBeforeOffline, 'Offline navigation did not complete a load event');
  await pause(500);
  await waitFor(
    'window.verso?.loaded && !!document.querySelector("#continue-button")',
    'offline loaded title and saved Continue',
    30000,
  );
  const offlineFacts = await evaluate(
    '({online:navigator.onLine,controlled:!!navigator.serviceWorker.controller,url:location.href,loaded:window.verso?.loaded})',
  );
  assert(
    offlineFacts.controlled,
    'Offline reload lost its service worker controller: ' + JSON.stringify(offlineFacts),
  );
  const uncachedBlocked = await evaluate(
    '(async()=>{try{await fetch("/__storage_qa_uncached_probe__?t="+Date.now(),{cache:"no-store"});return false;}catch{return true;}})()',
  );
  assert(
    uncachedBlocked,
    'An uncached network probe unexpectedly succeeded while offline: ' +
      JSON.stringify(offlineFacts),
  );
  assert(
    responses.some((r) => r.offline && r.fromServiceWorker && new URL(r.url).pathname === '/'),
    'Offline navigation was not served by the service worker',
  );
  await shot('04-offline-title');
  await click('#continue-button');
  await waitFor('window.verso.modal === null', 'offline continuation');
  const offlineState = await current();
  assert(
    offlineState.name === beforeOffline.name &&
      offlineState.seed === beforeOffline.seed &&
      offlineState.mission === beforeOffline.mission &&
      offlineState.weapon.name === beforeOffline.weapon.name,
    'Offline continuation lost save or seeded equipment',
  );
  await shot('05-offline-continued');
  pass(
    'Offline reload loads art/game and Continue restores saved crossing with HTTP cache disabled',
  );
  await setOffline(false);
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  offline = false;
  assert(
    await evaluate(
      '(async()=>{try{return(await fetch("/__storage_qa_online_probe__?t="+Date.now(),{cache:"no-store"})).ok;}catch{return false;}})()',
    ),
    'Uncached network request failed after returning online',
  );
  pass('Network restored online');
  const unexpectedErrors = errors.filter(
    (e) =>
      !(
        e.offline &&
        e.details?.url?.includes('/__storage_qa_uncached_probe__') &&
        e.details?.text?.includes('ERR_INTERNET_DISCONNECTED')
      ),
  );
  assert(unexpectedErrors.length === 0, 'Unexpected console/runtime errors');
} catch (error) {
  failure = error;
  console.error(error.stack || error);
  if (page) await shot('99-failure').catch(() => {});
} finally {
  if (page) {
    await setOffline(false).catch(() => {});
    await page.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
    offline = false;
    if (backup) {
      try {
        // Navigation first triggers the game's normal final save. This scoped
        // new-document cleanup then restores only the backed-up QA-origin keys.
        const source = `if(location.origin===${JSON.stringify(origin)}){for(const [key,value] of Object.entries(${JSON.stringify(backup)})){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}}`;
        const script = await page.send('Page.addScriptToEvaluateOnNewDocument', { source });
        await page.send('Page.navigate', { url: baseUrl + '?storage-qa-cleanup=1' });
        await waitFor(
          'window.verso?.loaded && window.verso.modal === "title"',
          'cleanup title',
          30000,
        );
        const restored = await evaluate(
          `Object.fromEntries(${JSON.stringify(storageKeys)}.map(key=>[key,localStorage.getItem(key)]))`,
        );
        assert(
          JSON.stringify(restored) === JSON.stringify(backup),
          'QA-origin backup cleanup did not restore keys',
        );
        await page.send('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: script.identifier,
        });
        restoredBackup = true;
      } catch (error) {
        failure ||= error;
        console.error('Cleanup:', error.message);
      }
    }
  }
  if (browser)
    await browser
      .send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: false })
      .catch(() => {});
  fs.writeFileSync(
    path.join(out, 'storage-results.json'),
    JSON.stringify(
      {
        started,
        finished: new Date(),
        endpoint,
        baseUrl,
        targetId,
        results,
        errors,
        cacheEvidence,
        downloads,
        responses,
        restoredBackup,
        failure: failure?.stack,
      },
      null,
      2,
    ),
  );
  const report = `# Storage, accessibility, and offline QA\n\nRun: ${started.toISOString()}. **${failure ? 'FAIL — ' + failure.message : 'PASS'}**.\n\nA separate Agent Workspace Chromium tab used ${baseUrl}; the developer's 127.0.0.1 tab was never controlled. Original QA-origin save/settings restored: **${restoredBackup ? 'yes' : 'no'}**.\n\n## Verified\n\n${results.map((r) => '- ' + r.name + (r.details ? ': ' + r.details : '')).join('\n')}\n\n## Method and scope\n\nName, focus, export/import, journal navigation, and continuation used actual mouse/keyboard/file-chooser UI. The complete/dead/reveal edge cases used explicitly generated offline Game fixtures imported through that UI. These fixtures are separate from the full real-input campaign in [QA.md](QA.md).\n\nOffline verification waited for an activated service worker and controller, disabled network and the HTTP cache, then reloaded and continued the saved game. Network was restored in cleanup. This verifies service worker/cache behavior, not physical PWA installation.\n\nDownloads and fixtures stayed in workspace \`${workspaceDir}\`, mapped to host \`${hostDir}\`. Only the two backed-up save/settings keys were restored; storage was never cleared wholesale.\n\n## Evidence and repeat\n\nScreenshots and structured results: [../.dream-loop/storage-qa/](../.dream-loop/storage-qa/). Online browser errors: ${errors.filter((e) => !e.offline).length}; offline-period browser errors: ${errors.filter((e) => e.offline).length}.\n\n\`node scripts/browser-storage-check.mjs ${endpoint} ${baseUrl}\`\n\nReplace the ephemeral CDP endpoint with the active Agent Workspace endpoint. The check creates and closes its own tab.\n`;
  fs.writeFileSync(
    path.join(root, 'docs/STORAGE-QA.md'),
    report +
      '\nThe uncached offline probe is intentionally expected to report `ERR_INTERNET_DISCONNECTED`. Navigation, bundles, and artwork must still arrive from the service worker. Any other browser error fails the check.\n',
  );
  if (browser && targetId) await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  page?.close();
  browser?.close();
}
if (failure) process.exitCode = 1;
