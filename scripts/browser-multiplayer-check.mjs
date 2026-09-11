/** Real-input cooperative QA in fresh contexts of a verified Agent Workspace browser.
 * node scripts/browser-multiplayer-check.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
 * Only reads DOM/diagnostics; game and storage changes are driven by actual inputs.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createCoopServer } from '../server/coop.mjs';
const endpoint = process.argv[2],
  url = process.argv[3] || 'http://localhost:4174/';
if (
  !endpoint ||
  !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname) ||
  new URL(url).hostname !== 'localhost'
)
  throw Error('Use the verified workspace endpoint and localhost frontend.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.dream-loop/stichos-multiplayer');
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
  await c.fill('#s-room-server', serverUrl);
  await c.fill('#s-room-code', code);
  await c.click('#s-room-form button[type="submit"]');
  await c.wait("window.stichos.state.multiplayer.status==='online'", 'room joined');
  const id = (await c.state()).multiplayer.room;
  await c.click('#s-room-return');
  return id;
}
try {
  coop = createCoopServer();
  const address = await coop.listen(0, '127.0.0.1');
  serverUrl = `ws://localhost:${address.port}/ws`;
  browser = await connect(
    (await (await fetch(`${endpoint}/json/version`)).json()).webSocketDebuggerUrl,
  );
  const a = await traveler('Theo — north road'),
    b = await traveler('Mira — archive road');
  const code = await room(a);
  await room(b, code);
  await a.wait('window.stichos.state.multiplayer.peers.length===1', 'second traveler appeared');
  assert.equal((await b.state()).multiplayer.peers[0].name, a.name);
  pass(
    'Two independent lives create and join through the Together form',
    `Room ${code}; generation3; seed3886`,
  );
  await a.move({ x: -1, y: 5 });
  await b.move({ x: 1, y: 5 });
  await b.wait(
    'Math.abs(window.stichos.state.multiplayer.peers[0].x+1)<.3',
    'actual remote movement received',
  );
  await b.shot('01-two-travelers');
  await a.focus();
  await a.click('#s-together');
  await a.click('[data-room-emote="wave"]');
  await b.wait(
    "document.querySelector('#s-toast').textContent.includes('Hello!')",
    'peer wave visible',
  );
  await b.shot('02-peer-wave');
  pass(
    'Humanoid movement and finite emotes reach the other browser',
    'Actual ground clicks and wave button; visible peer evidence captured.',
  );
  await b.move({ x: -1, y: 5 });
  const beforeA = await a.state(),
    beforeB = await b.state();
  // Both players click the same visible plant, never a nearest-object shortcut that could select its neighbor after a remote harvest.
  await Promise.all([a.worldClick({ x: -2, y: 5 }), b.worldClick({ x: -2, y: 5 })]);
  await a.wait(
    "window.stichos.state.removed.includes('origin:cequin')",
    'shared cequin gone on first client',
  );
  await b.wait(
    "window.stichos.state.removed.includes('origin:cequin')",
    'shared cequin gone on second client',
  );
  const afterA = await a.state(),
    afterB = await b.state();
  const requests = [...a.wire, ...b.wire].filter(
    (w) => w.direction === 'sent' && w.message.type === 'claim',
  );
  assert.ok(requests.length > 0);
  for (const { message } of requests) {
    assert.equal(message.kind, 'gather');
    assert.deepEqual(Object.keys(message).sort(), [
      'kind',
      'propId',
      'requestId',
      'type',
      'x',
      'y',
    ]);
  }
  const deltaA = (afterA.inventory.cequin || 0) - (beforeA.inventory.cequin || 0),
    deltaB = (afterB.inventory.cequin || 0) - (beforeB.inventory.cequin || 0);
  assert.equal(deltaA + deltaB, 3);
  assert.ok(deltaA === 0 || deltaB === 0);
  assert.equal(afterA.multiplayer.pending, false);
  assert.equal(afterB.multiplayer.pending, false);
  await Promise.all([a.worldClick({ x: -2, y: 5 }), b.worldClick({ x: -2, y: 5 })]);
  assert.equal(
    (await a.state()).inventory.cequin + (await b.state()).inventory.cequin,
    (afterA.inventory.cequin || 0) + (afterB.inventory.cequin || 0),
    'Repeated interact cannot regrow the shared plant',
  );
  pass(
    'Shared harvest awards exactly one body and removes the same plant for both',
    `Cequin gains ${deltaA}/${deltaB}; total3; subsequent input gives no repeat harvest.`,
  );
  await a.shot('03-shared-harvest');
  // The south cathedral doorway is approachable on the central paved road.
  await a.move({ x: 0, y: 1 });
  const door = await a.read("window.stichos.props(0,-1,1).find(p=>p.kind==='door')");
  assert.ok(door);
  await a.worldClick(door);
  await a.wait(
    `window.stichos.state.opened.includes(${JSON.stringify(door.id)})`,
    'door opened locally',
  );
  await b.wait(
    `window.stichos.state.opened.includes(${JSON.stringify(door.id)})`,
    'door opened remotely',
  );
  await a.worldClick(door);
  await a.wait(
    `!window.stichos.state.opened.includes(${JSON.stringify(door.id)})`,
    'door closed locally',
  );
  await b.wait(
    `!window.stichos.state.opened.includes(${JSON.stringify(door.id)})`,
    'door closed remotely',
  );
  pass('Actual cathedral door open and close synchronize', door.id);
  // Keyboard movement must stop at the same closed collision cell on both clients.
  // A floor click then plans through the door, waits for the server to open it,
  // and continues the existing route without another click.
  for (const client of [a, b]) {
    await client.move({ x: 0, y: 0 });
    await client.key('w', 'KeyW', 87, 800);
    const stopped = await client.state();
    assert.ok(stopped.player.y > door.y + 0.5, `${client.name}: closed door must stop the body`);
    assert.ok(!stopped.opened.includes(door.id));
  }
  const beforeRouteFrames = a.wire.length;
  await a.move({ x: 0, y: -3 });
  await b.wait(
    `window.stichos.state.opened.includes(${JSON.stringify(door.id)}) && window.stichos.state.multiplayer.peers[0].y < -2.7`,
    'remote doorway and the arriving indoor body agree',
  );
  const routeOpen = a.wire
    .slice(beforeRouteFrames)
    .find((w) => w.direction === 'sent' && w.message.type === 'door' && w.message.open);
  assert.ok(routeOpen, 'The routed door must be opened through the shared server action.');
  assert.ok(
    a.wire.some(
      (w) =>
        w.direction === 'received' &&
        w.message.type === 'claimResult' &&
        w.message.requestId === routeOpen.message.requestId &&
        w.message.ok,
    ),
    'The route must receive a successful server acknowledgement.',
  );
  await b.move({ x: 0, y: -2 });
  await a.wait(
    'window.stichos.state.multiplayer.peers[0].y < -1.7',
    'second body crosses shared open door',
  );
  await a.shot('05-shared-door-route');
  // Close from indoors after both people have cleared the threshold, then ask
  // the second client to leave with one floor click through that closed door.
  await b.worldClick(door);
  await a.wait(
    `!window.stichos.state.opened.includes(${JSON.stringify(door.id)})`,
    'indoor close mirrors',
  );
  await b.move({ x: 0, y: 1 });
  await a.wait(
    `window.stichos.state.opened.includes(${JSON.stringify(door.id)}) && window.stichos.state.multiplayer.peers[0].y > .7`,
    'second route opens and exits through shared collision',
  );
  assert.equal((await a.state()).multiplayer.pending, false);
  assert.equal((await b.state()).multiplayer.pending, false);
  assert.ok(
    ![...a.wire, ...b.wire].some(
      (w) => w.message.type === 'error' && w.message.code === 'blocked_pose',
    ),
  );
  pass(
    'Both bodies respect closed doors and one floor click continues through a server-approved opening',
    'Keyboard blocks on both clients; indoor and outdoor routes resume after acknowledgement; the other browser sees the same open collision and arriving body.',
  );
  // Cut only the test-owned production server's actual socket. Browser offline emulation
  // leaves already-open WebSockets untouched; no browser game state is injected here.
  const peerId = (await b.state()).multiplayer.peerId;
  const connection = coop.hub.rooms.get(code).members.get(peerId).connection;
  assert.ok(connection);
  connection.socket.terminate();
  await b.wait(
    "window.stichos.state.multiplayer.status==='disconnected'",
    'transport interruption detected',
  );
  await a.wait('window.stichos.state.multiplayer.peers.length===0', 'disconnected body removed');
  await b.focus();
  await b.click('#s-together');
  await b.click('#s-room-reconnect');
  await b.wait("window.stichos.state.multiplayer.status==='online'", 'reconnected by UI');
  assert.equal((await b.state()).multiplayer.peerId, peerId);
  assert.ok((await b.state()).removed.includes('origin:cequin'));
  await a.wait('window.stichos.state.multiplayer.peers.length===1', 'one resumed peer');
  await b.shot('04-reconnected-room');
  pass(
    'Network interruption and UI reconnect preserve identity and shared harvest',
    'Remote body disappears on disconnect and returns exactly once.',
  );
  await b.click('#s-room-leave');
  await b.wait("window.stichos.state.multiplayer.status==='offline'", 'explicit leave');
  await a.wait('window.stichos.state.multiplayer.peers.length===0', 'left room peer gone');
  pass('Leave room removes the peer and returns to solo play');
  const wrong = await traveler('Different world', '3887');
  await wrong.click('#s-together');
  await wrong.fill('#s-room-name', wrong.name);
  await wrong.fill('#s-room-server', serverUrl);
  await wrong.fill('#s-room-code', code);
  await wrong.click('#s-room-form button[type="submit"]');
  await wrong.wait(
    "document.querySelector('#s-toast').textContent.includes('different world')",
    'world mismatch explained',
  );
  assert.notEqual((await wrong.state()).multiplayer.status, 'online');
  assert.equal((await a.state()).multiplayer.peers.length, 0);
  pass('A mismatched seed is rejected without joining or changing either world');
  assert.deepEqual(errors, []);
  pass('No browser exceptions or error logs');
} catch (error) {
  failure = error;
  console.error(error);
  for (const c of clients) {
    await c.shot(`FAIL-${c.name.split(' ')[0]}`).catch(() => {});
    const state = await c.state().catch(() => null);
    fs.writeFileSync(
      path.join(out, `FAIL-${c.name.split(' ')[0]}-state.json`),
      JSON.stringify({ state, wire: c.wire }, null, 2),
    );
  }
} finally {
  const report = {
    status: failure ? 'FAIL' : 'PASS',
    started: started.toISOString(),
    finished: new Date().toISOString(),
    url,
    server: {
      endpoint: serverUrl,
      module: 'server/coop.mjs',
      testOwned: true,
      disconnect: 'Actual server-side socket termination; no game/storage injection',
    },
    results,
    errors,
    failure: failure?.stack,
    builds: clients.map((c) => ({ name: c.name, build: c.build })),
    actionFrames: clients.map((c) => ({ name: c.name, frames: c.wire })),
  };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(out, 'REPORT.md'),
    `# Cooperative browser QA\n\n${report.status} · ${report.finished}\n\n${results.map((r) => `- **${r.name}** — ${r.detail}`).join('\n')}\n${failure ? `\nFailure: ${failure.message}\n` : ''}`,
  );
  for (const c of clients) {
    await browser
      ?.send('Target.disposeBrowserContext', { browserContextId: c.browserContextId })
      .catch(() => {});
    c.page.close();
  }
  browser?.close();
  await coop?.close();
}
if (failure) process.exitCode = 1;
