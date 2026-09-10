/** Synthetic Gamepad API acceptance checks; physical controller hardware is not tested.
 * node scripts/browser-gamepad-check.mjs http://127.0.0.1:PORT http://127.0.0.1:4174
 * CDP must belong to an isolated Agent Workspace Chromium. No window.verso mutation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distance, ISO_Y, isWalkable } from '../src/game.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.argv[2],
  baseUrl = process.argv[3] || 'http://127.0.0.1:4174';
if (!endpoint || !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname))
  throw new Error('Pass the isolated workspace loopback CDP endpoint.');
if (
  !['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname) ||
  new URL(baseUrl).port !== '4174'
)
  throw new Error('Use the separate local production preview on port 4174.');
const origin = new URL(baseUrl).origin,
  out = path.join(root, '.dream-loop/gamepad-qa');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.rmSync(path.join(out, '99-failure.png'), { force: true });
const started = new Date(),
  results = [],
  errors = [],
  warnings = [],
  audioEvents = [],
  findings = [];
const keys = ['verso.save.v1', 'verso.settings.v1'];
let browser,
  page,
  targetId,
  backup,
  restoredBackup = false,
  failure,
  assets,
  audioAtDeployment;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) {
  if (!value) throw new Error(message);
}
function pass(name, details = '') {
  results.push({ name, details });
  console.log(`PASS ${name}${details ? ': ' + details : ''}`);
}
async function connect(url, event = () => {}) {
  const ws = new WebSocket(url); // Native Node WebSocket sends no Origin header.
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (!m.id) return event(m.method, m.params);
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const i = ++id,
          timer = setTimeout(() => {
            pending.delete(i);
            reject(new Error(`CDP timeout: ${method}`));
          }, 20000);
        pending.set(i, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: i, method, params }));
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
async function waitFor(expression, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      if (await evaluate(expression)) return;
    } catch (error) {
      if (!/navigated or closed|context.*destroyed|Cannot find context/i.test(error.message))
        throw error;
    }
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
const injection = `(()=>{const pad={id:'Verso synthetic standard controller',index:0,mapping:'standard',connected:false,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),timestamp:0};Object.defineProperty(window,'__versoGamepadQa',{value:pad});Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pad.connected?[pad]:[]});})();`;
async function input({ connected, axes, buttons } = {}) {
  await evaluate(
    `(()=>{const p=window.__versoGamepadQa;${connected === undefined ? '' : `p.connected=${connected};`}${axes ? `p.axes=${JSON.stringify(axes)};` : ''}${buttons ? `p.buttons=Array.from({length:17},(_,i)=>({pressed:${JSON.stringify(buttons)}.includes(i),touched:${JSON.stringify(buttons)}.includes(i),value:${JSON.stringify(buttons)}.includes(i)?1:0}));` : ''}p.timestamp=performance.now();})()`,
  );
}
async function neutral() {
  await input({ axes: [0, 0, 0, 0], buttons: [] });
  await sleep(100);
}
async function press(index, duration = 90) {
  await input({ buttons: [index] });
  await sleep(duration);
  await input({ buttons: [] });
  await sleep(130);
}
async function state() {
  return evaluate('window.verso.state');
}
async function shot(name) {
  const r = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
}
function lineClear(a, b) {
  const n = Math.max(1, Math.ceil(distance(a, b) / 5));
  for (let i = 0; i <= n; i++)
    if (!isWalkable({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, 23))
      return false;
  return true;
}
function route(start, goal, range) {
  if (distance(start, goal) < range) return [];
  if (lineClear(start, goal)) return [goal];
  const size = 24,
    pt = (x, y) => ({ x: x * size, y: y * size * ISO_Y });
  const open = [
      {
        x: Math.round(start.x / size),
        y: Math.round(start.y / size / ISO_Y),
        cost: 0,
        score: distance(start, goal),
        parent: null,
      },
    ],
    best = new Map();
  let end;
  while (open.length) {
    open.sort((a, b) => a.score - b.score);
    const n = open.shift(),
      p = pt(n.x, n.y);
    if (distance(p, goal) < range) {
      end = n;
      break;
    }
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++) {
        if (!x && !y) continue;
        const q = pt(n.x + x, n.y + y),
          id = `${n.x + x},${n.y + y}`,
          cost = n.cost + Math.hypot(x, y) * size;
        if (!isWalkable(q, 26) || !lineClear(p, q) || (best.get(id) ?? Infinity) <= cost) continue;
        best.set(id, cost);
        open.push({ x: n.x + x, y: n.y + y, cost, score: cost + distance(q, goal), parent: n });
      }
    if (best.size > 15000) break;
  }
  assert(end, 'No collision-safe analog route');
  const nodes = [];
  for (let n = end; n?.parent; n = n.parent) nodes.unshift(pt(n.x, n.y));
  const clean = [];
  let current = start;
  for (let i = 0; i < nodes.length; ) {
    let j = i;
    while (j + 1 < nodes.length && lineClear(current, nodes[j + 1])) j++;
    clean.push(nodes[j]);
    current = nodes[j];
    i = j + 1;
  }
  return clean;
}
async function walkTo(goal, range = 50) {
  let s = await state(),
    nodes = route(s.player, goal, range);
  const until = Date.now() + 40000;
  while (Date.now() < until) {
    s = await state();
    assert(s.phase === 'playing', 'Analog walking left playing phase');
    if (distance(s.player, goal) < range) {
      await neutral();
      return;
    }
    while (nodes.length > 1 && distance(s.player, nodes[0]) < 7) nodes.shift();
    if (!nodes.length) nodes = route(s.player, goal, range);
    const target = nodes[0] || goal,
      dx = target.x - s.player.x,
      dy = (target.y - s.player.y) / ISO_Y,
      len = Math.hypot(dx, dy);
    if (len < 5) {
      nodes.shift();
      continue;
    }
    await input({ axes: [dx / len, dy / len, 0, 0], buttons: [] });
    await sleep(Math.max(30, Math.min(100, (len / 180) * 750)));
  }
  await neutral();
  throw new Error('Analog route timed out');
}

try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  ({ targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    background: false,
  }));
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  page = await connect(
    targets.find((t) => t.id === targetId).webSocketDebuggerUrl,
    (method, params) => {
      if (method === 'Runtime.exceptionThrown') errors.push(params);
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errors.push(params);
      if (method === 'Runtime.consoleAPICalled' && params.type === 'warning') warnings.push(params);
      if (method === 'Log.entryAdded' && params.entry.level === 'error') errors.push(params.entry);
      if (method === 'Log.entryAdded' && params.entry.level === 'warning')
        warnings.push(params.entry);
      if (['WebAudio.contextCreated', 'WebAudio.contextChanged'].includes(method))
        audioEvents.push({ method, ...params });
    },
  );
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Log.enable');
  await page.send('WebAudio.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: injection });
  await page.send('Page.navigate', { url: baseUrl });
  await waitFor(
    'window.verso?.loaded && !!document.querySelector("#operative-name")',
    'loaded title',
    30000,
  );
  assets = await evaluate('Array.from(document.scripts).map(s=>s.src).filter(Boolean)');
  console.log(`LOADED own target ${targetId}: ${assets.join(', ')}`);
  backup = await evaluate(
    `Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)]))`,
  );
  assert(
    await evaluate('document.querySelector("[data-action=blade] kbd").textContent === "LMB"'),
    'Keyboard hints were replaced before controller connection',
  );
  await input({ connected: true });
  await waitFor(
    'document.querySelector("#app").classList.contains("controller-connected")',
    'controller connection',
  );
  assert(
    await evaluate(
      'document.querySelector("#operative-name").value === "Traveler" && document.activeElement.matches("#start-form button[type=submit]")',
    ),
    'Controller did not populate Traveler and focus title submit',
  );
  pass('Controller connection changes hints and prepares title name/submit');
  await shot('01-controller-title');
  await press(0);
  await waitFor('window.verso.modal === "briefing"', 'A confirms title');
  await press(0);
  await waitFor('window.verso.modal === null', 'A deploys');
  await sleep(900);
  assert(
    (await state()).player.stamina === 100 &&
      distance((await state()).player, { x: 795, y: 525 }) < 1,
    'A menu confirm leaked into a gameplay dash',
  );
  pass('A confirms title and deploys without accidental dash');
  audioAtDeployment = {
    userActivation: await evaluate(
      '({hasBeenActive:navigator.userActivation.hasBeenActive,isActive:navigator.userActivation.isActive})',
    ),
    contexts: audioEvents
      .filter((e) => e.context)
      .map((e) => ({ id: e.context.contextId, state: e.context.contextState })),
  };
  const latestContexts = new Map(audioAtDeployment.contexts.map((c) => [c.id, c.state]));
  assert(
    latestContexts.size > 0,
    'Controller deployment did not create an observable audio context',
  );
  if (latestContexts.size && ![...latestContexts.values()].includes('running')) {
    await waitFor(
      '!!document.querySelector("#audio-button .sound-unlock")',
      'blocked audio recovery prompt',
    );
    await shot('01b-controller-audio-prompt');
    const p = await evaluate(
      '(()=>{const r=document.querySelector("#audio-button").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()',
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
    const audioUntil = Date.now() + 5000;
    while (Date.now() < audioUntil) {
      const contexts = new Map(
        audioEvents
          .filter((e) => e.context)
          .map((e) => [e.context.contextId, e.context.contextState]),
      );
      if ([...contexts.values()].includes('running')) break;
      await sleep(100);
    }
    assert(
      audioEvents.some((e) => e.context?.contextState === 'running'),
      'One trusted audio click did not unlock suspended audio',
    );
    await waitFor(
      '!document.querySelector("#audio-button .sound-unlock") && document.querySelector("#audio-button").getAttribute("aria-pressed")==="false"',
      'unmuted audio recovery',
    );
    pass('Controller-only blocked audio shows prompt; one click enables sound without muting');
  } else
    pass(
      'Controller-only deployment audio context runs',
      JSON.stringify(audioAtDeployment.userActivation),
    );

  let before = (await state()).player;
  await input({ axes: [1, 0, 0, 0] });
  await sleep(300);
  await neutral();
  assert((await state()).player.x > before.x + 25, 'Left stick did not move right');
  pass('Left stick moves player');
  before = (await state()).player;
  await press(14, 300);
  assert((await state()).player.x < before.x - 25, 'D-pad did not move left');
  pass('D-pad moves player');
  before = (await state()).player;
  await input({ axes: [0.1, 0.1, 0, 0] });
  await sleep(250);
  await neutral();
  assert(distance(before, (await state()).player) < 1, 'Deadzone drift moved player');
  pass('Stick deadzone prevents drift');
  before = (await state()).player;
  await input({ axes: [0.3, 0, 0, 0] });
  await sleep(300);
  const lightMove = distance(before, (await state()).player);
  assert(lightMove > 2 && lightMove < 25, 'Light stick strength is not proportional');
  before = (await state()).player;
  await press(0);
  await sleep(140);
  await neutral();
  const dashDistance = distance(before, (await state()).player);
  assert(
    dashDistance > 85 && (await state()).player.stamina < 100,
    'Light-stick A dash lost full direction strength',
  );
  pass(
    'Light analog movement retains full A dash',
    `light movement ${lightMove.toFixed(1)}; dash ${dashDistance.toFixed(1)} ground units`,
  );
  await walkTo({ x: 795, y: 525 }, 8);
  await input({ axes: [0, 0, 0, -1], buttons: [1] });
  await sleep(70);
  let s = await state();
  assert(
    s.player.cooldowns.pulse > 0 && s.projectiles.some((p) => p.vy < 0 && Math.abs(p.vx) < 20),
    'Right stick up + B failed to aim/fire pulse north',
  );
  await neutral();
  pass('Right stick aims B pulse');
  await press(2, 70);
  assert((await state()).player.cooldowns.blade > 0, 'X did not trigger blade');
  pass('X triggers blade');
  await sleep(1300);

  await press(9);
  await waitFor('window.verso.modal === "pause"', 'Start pause');
  const pausedTime = (await state()).time;
  await sleep(250);
  assert((await state()).time === pausedTime, 'Pause did not freeze simulation');
  await press(9);
  assert(await evaluate('window.verso.modal === null'), 'Start did not resume');
  pass('Start pauses/freezes and resumes');
  await press(8);
  await waitFor('window.verso.modal === "journal"', 'View journal');
  await input({ buttons: [1] });
  await sleep(500);
  assert(await evaluate('window.verso.modal === null'), 'B did not close journal');
  s = await state();
  assert(
    s.player.cooldowns.pulse === 0 && s.projectiles.length === 0,
    'Held B leaked a pulse after closing journal',
  );
  await input({ buttons: [] });
  await sleep(120);
  await input({ axes: [0, 0, 0, -1], buttons: [1] });
  await sleep(70);
  assert((await state()).player.cooldowns.pulse > 0, 'Fresh B did not rearm after modal close');
  await neutral();
  pass('View opens journal; held B closes without pulse until release and fresh press');
  await press(9);
  await waitFor('window.verso.modal === "pause"', 'menu navigation pause');
  await press(13);
  assert(
    await evaluate('document.activeElement.id === "resume"'),
    'D-pad first menu step did not select Resume',
  );
  await press(13);
  assert(
    await evaluate('document.activeElement.id === "open-journal"'),
    'D-pad second step did not select Journal',
  );
  await press(0);
  assert(
    await evaluate('window.verso.modal === "journal"'),
    'A did not activate selected journal menu item',
  );
  await shot('02-controller-journal');
  await press(1);
  assert(await evaluate('window.verso.modal === null'), 'B did not return from journal');
  pass('D-pad selects menu item and A activates it');

  const deer = (await state()).entities.find((e) => e.subtype === 'deer');
  await walkTo(deer, 70);
  await press(3);
  assert(
    (await state()).entities.find((e) => e.id === deer.id).scanned,
    'Y did not catalog nearby species',
  );
  pass('Y interacts and catalogs nearby species');
  s = await state();
  let dx = deer.x - s.player.x,
    dy = (deer.y - s.player.y) / ISO_Y,
    len = Math.hypot(dx, dy);
  await input({ axes: [0, 0, dx / len, dy / len], buttons: [2] });
  await sleep(70);
  await neutral();
  const damaged = await state();
  assert(damaged.integrity < 100, 'Mend setup did not create a repairable world change');
  await press(5);
  const mended = await state();
  assert(
    mended.integrity > damaged.integrity &&
      mended.player.fragments === damaged.player.fragments - 1,
    'RB did not mend and consume one fragment',
  );
  pass('RB mends world integrity and consumes one fragment');
  await shot('03-controller-gameplay');

  await input({ axes: [1, 0, 0, 0] });
  await sleep(150);
  await input({ connected: false });
  await sleep(120);
  before = (await state()).player;
  await sleep(350);
  assert(distance(before, (await state()).player) < 1, 'Disconnect left player movement stuck');
  assert(
    await evaluate(
      '!document.querySelector("#app").classList.contains("controller-connected") && document.querySelector("[data-action=blade] kbd").textContent === "LMB" && document.querySelector("[data-action=pulse] kbd").textContent === "RMB" && document.querySelector("[data-action=dash] kbd").textContent === "Space" && document.querySelector("#journal-link kbd").textContent === "J"',
    ),
    'Disconnect did not restore keyboard labels',
  );
  pass('Disconnect stops motion and restores keyboard hints');
  await shot('04-disconnected');
  assert(errors.length === 0, 'Browser runtime/console errors occurred');
  pass('No browser errors');
} catch (error) {
  failure = error;
  console.error(error.stack || error);
  if (page) {
    await neutral().catch(() => {});
    await shot('99-failure').catch(() => {});
  }
} finally {
  if (page && backup) {
    try {
      await input({ connected: false, axes: [0, 0, 0, 0], buttons: [] });
      const source = `if(location.origin===${JSON.stringify(origin)})for(const[k,v]of Object.entries(${JSON.stringify(backup)})){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}`;
      const added = await page.send('Page.addScriptToEvaluateOnNewDocument', { source });
      await page.send('Page.navigate', { url: baseUrl + '?gamepad-qa-cleanup=1' });
      await waitFor(
        'window.verso?.loaded && window.verso.modal === "title"',
        'cleanup title',
        30000,
      );
      const restored = await evaluate(
        `Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)]))`,
      );
      assert(
        JSON.stringify(restored) === JSON.stringify(backup),
        'Scoped save/settings backup restoration failed',
      );
      restoredBackup = true;
      await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: added.identifier });
    } catch (error) {
      failure ||= error;
    }
  }
  if (page) await page.send('Network.setBypassServiceWorker', { bypass: false }).catch(() => {});
  fs.writeFileSync(
    path.join(out, 'gamepad-results.json'),
    JSON.stringify(
      {
        started,
        finished: new Date(),
        baseUrl,
        targetId,
        assets,
        results,
        findings,
        errors,
        warnings,
        audioAtDeployment,
        audioEvents,
        restoredBackup,
        failure: failure?.stack,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(root, 'docs/GAMEPAD-QA.md'),
    `# Gamepad browser QA\n\nRun: ${started.toISOString()}. **${failure ? 'FAIL — ' + failure.message : findings.length ? 'CONTROLS PASS; audio finding below' : 'PASS'}**.\n\n## Verified\n\n${results.map((r) => '- ' + r.name + (r.details ? ': ' + r.details : '')).join('\n')}\n\n## Findings\n\n${findings.length ? findings.map((f) => '- ' + f).join('\n') : 'None observed.'}\n\n## Method and limits\n\nThis check overrides only \`navigator.getGamepads\` with a synthetic standard-mapping controller and changes its button/axis samples. The actual animation loop, adapter, UI handlers, and game simulation perform every action. \`window.verso\` is read-only and was not mutated. Offline collision geometry is used only to plan analog movement. No mouse or keyboard activation is supplied before the controller-only audio observation.\n\nPhysical USB/Bluetooth hardware, operating-system mapping, rumble, and device-specific browser activation behavior are **not tested**. This is browser integration QA for standard-mapping input.\n\nThe check creates a separate Agent Workspace tab at ${baseUrl}, bypasses service workers for the current production bundle, then restores the original scoped save/settings keys and closes the tab. Backup restored: **${restoredBackup ? 'yes' : 'no'}**. Loaded scripts: ${assets?.join(', ') || 'unavailable'}.\n\nEvidence: [../.dream-loop/gamepad-qa/](../.dream-loop/gamepad-qa/).\n\nRepeat with the active isolated workspace endpoint:\n\n\`node scripts/browser-gamepad-check.mjs ${endpoint} ${baseUrl}\`\n`,
  );
  if (browser && targetId) await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  page?.close();
  browser?.close();
}
if (failure) process.exitCode = 1;
