/** Actual-input QA in an existing isolated Agent Workspace Chromium. No game state mutation. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.argv[2];
const url = process.argv[3] || 'http://localhost:4174/';
if (!endpoint || !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname))
  throw new Error('Pass workspace-owned loopback CDP endpoint.');
if (new URL(url).hostname !== 'localhost')
  throw new Error('Use separate localhost origin to protect root save.');
const out = path.join(root, '.dream-loop/procedural-qa');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, '99-failure.png'), { force: true });
const results = [],
  findings = [],
  errors = [],
  shots = [],
  held = new Set();
let page, browser, targetId;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const log = (name, detail = '') => {
  results.push({ name, detail });
  console.log(`PASS ${name}: ${detail}`);
};
const check = (ok, detail) => {
  if (!ok) {
    findings.push(detail);
    console.log(`FINDING ${detail}`);
  }
  return ok;
};
async function connect(url, events = () => {}) {
  const ws = new WebSocket(url); // Native Node WebSocket omits Origin.
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (!m.id) return events(m.method, m.params);
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id,
          timer = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 15000);
        pending.set(n, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}
async function evaluate(expression) {
  const value = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
async function waitFor(expression, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await delay(80);
  }
  throw new Error(`Timeout ${label}`);
}
const state = () => evaluate('window.versoProcedural.state');
async function shot(name) {
  let r;
  try {
    r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  } catch {
    await page.send('Page.bringToFront');
    await delay(100);
    r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  }
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
  shots.push(name);
}
async function click(selector) {
  let p;
  for (let i = 0; i < 12; i++) {
    p = await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing ${selector}');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};})()`,
    );
    if (p.y > 3 && p.y < p.h - 3) break;
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: p.w / 2,
      y: p.h / 2,
      deltaX: 0,
      deltaY: p.y < 0 ? -450 : 450,
    });
    await delay(100);
  }
  assert(p.x > 0 && p.x < p.w && p.y > 0 && p.y < p.h, `Offscreen ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', {
      type,
      button: 'left',
      clickCount: 1,
      x: p.x,
      y: p.y,
    });
  await delay(100);
}
async function key(key, down = true, modifiers = 0) {
  const code =
    {
      ' ': 'Space',
      Escape: 'Escape',
      Tab: 'Tab',
      Shift: 'ShiftLeft',
      Control: 'ControlLeft',
      Enter: 'Enter',
    }[key] || `Key${key.toUpperCase()}`;
  const vk =
    { ' ': 32, Escape: 27, Tab: 9, Shift: 16, Control: 17, Enter: 13 }[key] ||
    key.toUpperCase().charCodeAt(0);
  await page.send('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
    modifiers,
  });
  down ? held.add(key) : held.delete(key);
}
async function tap(k) {
  await key(k);
  await key(k, false);
  await delay(110);
}
async function release() {
  for (const k of [...held]) await key(k, false);
}
async function enterSeed(seed) {
  await click('#p-root');
  await key('a', true, 2);
  await key('a', false, 2);
  await page.send('Input.insertText', { text: seed });
  await click('#p-start button');
  await waitFor('!!document.querySelector("#p-deploy")', 'briefing');
}
function route(world, start, goal) {
  const id = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const tiles = new Map(world.tiles.map((t) => [id(t.x, t.z), t]));
  const begin = id(start.x, start.z),
    end = id(goal.x, goal.z),
    queue = [begin],
    parent = new Map([[begin, null]]);
  for (let i = 0; i < queue.length; i++) {
    const a = tiles.get(queue[i]);
    if (!a) continue;
    if (queue[i] === end) break;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const b = tiles.get(id(a.x + dx, a.z + dz));
      if (!b || parent.has(id(b.x, b.z))) continue;
      // Avoid jumps during interaction routing; climbable paths are exercised separately.
      if (b.height > a.height + 0.4 && !['path', 'ladder'].includes(b.kind)) continue;
      parent.set(id(b.x, b.z), queue[i]);
      queue.push(id(b.x, b.z));
    }
  }
  if (!parent.has(end)) return null;
  const result = [];
  for (let p = end; p !== begin; p = parent.get(p)) result.push(tiles.get(p));
  return result.reverse();
}
async function walkTo(point, tolerance = 0.22, budget = 6000) {
  const end = Date.now() + budget;
  let prior = Infinity,
    still = 0;
  while (Date.now() < end) {
    const s = await state();
    if (s.phase !== 'playing' || s.paused) return false;
    const dx = point.x - s.player.position.x,
      dz = point.z - s.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < tolerance) {
      await release();
      return true;
    }
    if (Math.abs(prior - d) < 0.005) still++;
    else still = 0;
    prior = d;
    if (still > 18) {
      await release();
      return false;
    }
    const sx = dx - dz,
      sy = dx + dz;
    const next = new Set();
    if (Math.abs(sx) > Math.max(0.07, Math.abs(sy) * 0.38)) next.add(sx > 0 ? 'd' : 'a');
    if (Math.abs(sy) > Math.max(0.07, Math.abs(sx) * 0.38)) next.add(sy > 0 ? 's' : 'w');
    for (const k of [...held]) if (!next.has(k)) await key(k, false);
    for (const k of next) if (!held.has(k)) await key(k);
    await delay(Math.min(75, Math.max(22, (d / s.player.genome.speed) * 450)));
  }
  await release();
  return false;
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  ({ targetId } = await browser.send('Target.createTarget', { url: 'about:blank' }));
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  page = await connect(targets.find((t) => t.id === targetId).webSocketDebuggerUrl, (method, p) => {
    if (method === 'Runtime.exceptionThrown')
      errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
    if (method === 'Log.entryAdded' && p.entry.level === 'error') errors.push(p.entry.text);
  });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Page.navigate', { url });
  await page.send('Page.bringToFront');
  await waitFor(
    '!!window.versoProcedural && !!document.querySelector("#p-start")',
    'procedural title',
  );
  await shot('01-title');
  await enterSeed('0x71A3');
  await shot('02-briefing');
  await click('#p-deploy');
  await waitFor('!window.versoProcedural.state.paused', 'deployment');
  const first = await state(),
    firstWorld = await evaluate('window.versoProcedural.world');
  fs.writeFileSync(
    path.join(out, 'seed-a.json'),
    JSON.stringify({ state: first, world: firstWorld }, null, 2),
  );
  await shot('03-world-seed-a');
  log(
    'title → briefing → inhabit',
    `${first.player.genome.locomotion}, ${first.player.genome.nodes.length} segments, ${first.player.genome.appendages.length} appendages; ${first.weapon.frame}/${first.weapon.trigger}`,
  );
  const start = { ...first.player.position };
  const safeNeighbor = firstWorld.tiles.find(
    (t) => Math.abs(t.x - start.x) + Math.abs(t.z - start.z) === 1 && t.height === start.y,
  );
  if (safeNeighbor) {
    assert(await walkTo(safeNeighbor), 'Could not move to neighboring floor tile');
    log('keyboard movement', JSON.stringify((await state()).player.position));
  }
  const beforeJump = await state();
  await key(' ');
  await delay(120);
  const duringJump = await state();
  await key(' ', false);
  check(
    beforeJump.player.genome.jump > 0
      ? !duringJump.player.grounded && duringJump.player.position.y > beforeJump.player.position.y
      : duringJump.player.grounded,
    'Space did not match generated jump capability',
  );
  log(
    'jump capability',
    `${beforeJump.player.genome.jump > 0 ? 'airborne observed' : 'anatomy cannot jump'}`,
  );
  await shot('04-jump');
  await delay(1100);
  await tap('f');
  check((await state()).player.cooldown > 0, 'F did not activate weapon cooldown');
  log('weapon keyboard input');
  await tap('j');
  assert(await evaluate('!!document.querySelector("#p-return")'), 'J did not open record');
  await shot('05-record');
  const frozen = (await state()).player.position;
  await key('d');
  await delay(350);
  await key('d', false);
  assert(
    JSON.stringify((await state()).player.position) === JSON.stringify(frozen),
    'Journal did not freeze world',
  );
  await tap('j');
  assert(!(await state()).paused, 'J did not close record');
  log('journal toggle and frozen simulation');
  await tap('Escape');
  assert((await state()).paused, 'Escape did not pause');
  await shot('06-pause');
  await click('#p-resume');
  log('pause and resume');
  let current = await state();
  const candidates = [...current.actors].sort(
    (a, b) =>
      Math.hypot(
        a.position.x - current.player.position.x,
        a.position.z - current.player.position.z,
      ) -
      Math.hypot(
        b.position.x - current.player.position.x,
        b.position.z - current.player.position.z,
      ),
  );
  let interacted = false;
  for (const actor of candidates.slice(0, 3)) {
    const path = route(firstWorld, (await state()).player.position, actor.position);
    if (!path) continue;
    let okay = true;
    for (const step of path) {
      if (!(await walkTo(step))) {
        okay = false;
        break;
      }
      const s = await state();
      if (
        s.actors.some(
          (a) =>
            Math.hypot(a.position.x - s.player.position.x, a.position.z - s.player.position.z) <
            1.6,
        )
      )
        break;
    }
    if (okay) {
      await tap('e');
      if ((await state()).scanned.length) {
        interacted = true;
        break;
      }
    }
  }
  check(
    interacted,
    'Could not reach/read a lifeform through generated navigation within QA route budget',
  );
  if (interacted) log('approach + E reads generated anatomy', (await state()).scanned.join(','));
  await shot('07-interaction');
  const fps = await evaluate(
    'new Promise(resolve=>{const t=[];let n=90;function tick(x){t.push(x);if(--n)requestAnimationFrame(tick);else resolve({fps:1000*(t.length-1)/(t.at(-1)-t[0]),hud:window.versoProcedural.fps})}requestAnimationFrame(tick)})',
  );
  log('foreground desktop frame sample', JSON.stringify(fps));
  await tap('Escape');
  await click('#p-new');
  await enterSeed('0x2A');
  await shot('08-second-brief');
  await click('#p-deploy');
  const second = await state(),
    secondWorld = await evaluate('window.versoProcedural.world');
  const anatomy = (s) =>
    JSON.stringify({ nodes: s.player.genome.nodes, appendages: s.player.genome.appendages });
  assert(anatomy(first) !== anatomy(second), 'Anatomy did not change structurally');
  assert(
    JSON.stringify(firstWorld.tiles) !== JSON.stringify(secondWorld.tiles),
    'World geometry did not change',
  );
  assert(
    JSON.stringify(first.weapon.shape) !== JSON.stringify(second.weapon.shape),
    'Equipment shape did not change',
  );
  log(
    'seed changes structural anatomy, terrain, equipment',
    `${second.player.genome.locomotion}, ${second.player.genome.nodes.length} segments, ${second.player.genome.appendages.length} appendages; ${second.weapon.frame}/${second.weapon.trigger}`,
  );
  fs.writeFileSync(
    path.join(out, 'seed-b.json'),
    JSON.stringify({ state: second, world: secondWorld }, null, 2),
  );
  await shot('09-world-seed-b');
  await key('d');
  await delay(200);
  await key('d', false);
  await delay(150);
  const beforeReload = await state();
  await page.send('Page.reload', { ignoreCache: true });
  await waitFor('!!document.querySelector("#p-continue")', 'saved continue');
  await click('#p-continue');
  await delay(200);
  const continued = await state();
  check(
    continued.seed === beforeReload.seed &&
      continued.player.genome.id === beforeReload.player.genome.id,
    'Continue changed seed/body identity',
  );
  check(
    Math.hypot(
      continued.player.position.x - beforeReload.player.position.x,
      continued.player.position.z - beforeReload.player.position.z,
    ) < 0.15,
    'Continue reset player position',
  );
  log(
    'save/continue inspected',
    JSON.stringify({ before: beforeReload.player.position, after: continued.player.position }),
  );
  await shot('10-continued');
  await tap('Escape');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(250);
  await click('#p-record');
  await shot('11-mobile-record');
  const layout = await evaluate(
    '({w:document.documentElement.clientWidth,inner:innerWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelector(".p-terminal").getBoundingClientRect().toJSON()})',
  );
  check(layout.scroll <= layout.w + 1, 'Mobile horizontal overflow');
  check(
    layout.dialog.top >= 0,
    'Mobile journal opens scrolled past its heading because footer receives focus',
  );
  log('mobile journal dimensions', JSON.stringify(layout));
  await click('#p-return');
  await shot('12-mobile-world');
  check(errors.length === 0, `Browser errors: ${errors.join(' | ')}`);
} catch (error) {
  findings.push(`Harness stopped: ${error.message}`);
  console.error(error);
  if (page) await shot('99-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (page) await release().catch(() => {});
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      { date: new Date().toISOString(), url, results, findings, errors, shots },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(root, 'docs/PROCEDURAL-QA.md'),
    `# Procedural browser QA\n\n${new Date().toISOString()} · ${url}\n\nActual CDP keyboard/mouse input in a new isolated Agent Workspace tab. Diagnostics were read-only; no game state or save injection. Service worker bypassed for the current served build.\n\n${results.map((r) => `- PASS ${r.name}${r.detail ? `: ${r.detail}` : ''}`).join('\n')}\n\n## Findings\n\n${findings.length ? findings.map((f) => `- ${f}`).join('\n') : 'No failures in this bounded check.'}\n\nScreenshots and two seed descriptor snapshots: [.dream-loop/procedural-qa](../.dream-loop/procedural-qa/). This check is not a full campaign or physical controller/offline test of the new mode.\n`,
  );
  if (targetId && browser) await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  page?.close();
  browser?.close();
}
