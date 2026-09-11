/** Real-input notebook QA in a fresh context of a verified Agent Workspace Chromium.
 * node scripts/browser-notebook-check.mjs http://127.0.0.1:CDP_PORT http://localhost:4174/
 * Reads DOM and frozen diagnostics; never injects game state or browser storage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

const endpoint = process.argv[2];
const url = process.argv[3] || 'http://localhost:4174/';
if (
  !endpoint ||
  !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname) ||
  new URL(url).hostname !== 'localhost'
)
  throw Error('Use a verified isolated workspace CDP endpoint and the localhost game origin.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.dream-loop/stichos-notebook');
fs.mkdirSync(out, { recursive: true });
const started = new Date();
const results = [],
  errors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser, page, contextId, failure, chooser, build;
let viewport = { width: 1600, height: 1000 };
const pass = (name, detail = '') => {
  results.push({ name, detail });
  console.log(`PASS ${name}${detail ? ': ' + detail : ''}`);
};
async function connect(address, events = () => {}) {
  const ws = new WebSocket(address); // Node omits Origin; this is the workspace-owned endpoint.
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
            reject(Error(`CDP timeout ${method}`));
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
const state = () => read('window.stichos.state');
async function waitFor(expression, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await read(expression).catch(() => false)) return;
    await delay(80);
  }
  throw Error(`Timed out: ${label}`);
}
async function wheel(x, y, deltaY) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  await delay(100);
}
async function click(selector) {
  // Scroll by real wheel input, including the independent desktop contents list.
  for (let attempt = 0; attempt < 20; attempt++) {
    const geometry = await read(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});
      if(!e||e.disabled)throw Error('Missing or disabled control: '+${JSON.stringify(selector)});
      const r=e.getBoundingClientRect();
      if(!r.width||!r.height)throw Error('Hidden control: '+${JSON.stringify(selector)});
      let clip={left:0,top:0,right:innerWidth,bottom:innerHeight}, scroll=null;
      for(let p=e.parentElement;p;p=p.parentElement){
        const style=getComputedStyle(p),a=p.getBoundingClientRect();
        if(/auto|scroll/.test(style.overflowY)&&p.scrollHeight>p.clientHeight+1){
          if(!scroll)scroll={x:Math.max(2,Math.min(innerWidth-2,a.x+a.width/2)),y:Math.max(2,Math.min(innerHeight-2,a.y+a.height/2))};
          if(r.bottom<=a.top+3||r.top>=a.bottom-3)return{scroll:{x:Math.max(2,Math.min(innerWidth-2,a.x+a.width/2)),y:Math.max(2,Math.min(innerHeight-2,a.y+a.height/2)),delta:Math.max(-600,Math.min(600,(r.top+r.bottom-a.top-a.bottom)/2))}};
        }
        if(/auto|scroll|hidden/.test(style.overflowY))clip={left:Math.max(clip.left,a.left),right:Math.min(clip.right,a.right),top:Math.max(clip.top,a.top),bottom:Math.min(clip.bottom,a.bottom)};
      }
      const x=(Math.max(r.left,clip.left)+Math.min(r.right,clip.right))/2,y=(Math.max(r.top,clip.top)+Math.min(r.bottom,clip.bottom))/2;
      if(r.bottom<=clip.top||r.top>=clip.bottom||!e.contains(document.elementFromPoint(x,y)))return{scroll:{...(scroll??{x:innerWidth/2,y:innerHeight/2}),delta:Math.max(-600,Math.min(600,(r.top+r.bottom)/2-innerHeight*.55))}};
      return{x,y};
    })()`);
    if (geometry.scroll) {
      await wheel(geometry.scroll.x, geometry.scroll.y, geometry.scroll.delta || 150);
      continue;
    }
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...geometry,
    });
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...geometry,
    });
    await delay(130);
    return;
  }
  throw Error(`Could not reach control using real scrolling: ${selector}`);
}
async function key(key, code, vk, hold = 0, modifiers = 0) {
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
  await delay(120);
}
async function fill(selector, text) {
  await click(selector);
  await key('a', 'KeyA', 65, 0, 2);
  await page.send('Input.insertText', { text });
  await delay(130);
}
/** Decode the browser's 8-bit PNG for a visible-paper check; never changes the evidence image. */
function pngPixels(bytes) {
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, 'Screenshot uses eight-bit channels');
  const channels = bytes[25] === 2 ? 3 : bytes[25] === 6 ? 4 : 0;
  assert.ok(channels, 'Screenshot is RGB or RGBA');
  const pieces = [];
  for (let offset = 8; offset < bytes.length; ) {
    const size = bytes.readUInt32BE(offset),
      kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (kind === 'IDAT') pieces.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(pieces)),
    stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      da = Math.abs(p - a),
      db = Math.abs(p - b),
      dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x,
        a = x >= channels ? pixels[i - channels] : 0,
        b = y ? pixels[i - stride] : 0,
        c = y && x >= channels ? pixels[i - stride - channels] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? Math.floor((a + b) / 2)
                : paeth(a, b, c);
      assert.ok(filter <= 4, 'Known PNG row filter');
      pixels[i] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}
async function screenshot(name) {
  const r = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(r.data, 'base64');
  fs.writeFileSync(path.join(out, `${name}.png`), bytes);
  if (
    [
      '04-open-notebook',
      '05-botanical-sheet',
      '07-mobile-open-book',
      '08-mobile-glossary',
    ].includes(name)
  ) {
    const rect = await read(
      `(()=>{const r=document.querySelector('.s-notebook-leaf').getBoundingClientRect();return{left:Math.max(0,r.left),right:Math.min(innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom)}})()`,
    );
    assert.ok(
      rect.right - rect.left > 100 && rect.bottom - rect.top > 80,
      `${name}: a readable part of the page is in view`,
    );
    const png = pngPixels(bytes);
    let light = 0;
    for (let y = 1; y <= 9; y++)
      for (let x = 1; x <= 9; x++) {
        const px = Math.floor(rect.left + ((rect.right - rect.left) * x) / 10),
          py = Math.floor(rect.top + ((rect.bottom - rect.top) * y) / 10);
        const offset = (py * png.width + px) * png.channels;
        if ((png.pixels[offset] + png.pixels[offset + 1] + png.pixels[offset + 2]) / 3 > 150)
          light++;
      }
    assert.ok(
      light > 40,
      `${name}: actual screenshot must show the light paper, not an opaque backing over live controls (${light}/81 light samples)`,
    );
  }
}
async function resize(width, height, mobile) {
  viewport = { width, height };
  await page.send('Emulation.setDeviceMetricsOverride', {
    ...viewport,
    deviceScaleFactor: 1,
    mobile,
  });
  await delay(200);
}
async function noHorizontalOverflow(label) {
  const values = await read(
    `(()=>({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,modal:document.querySelector('#s-modal')?.scrollWidth,modalClient:document.querySelector('#s-modal')?.clientWidth,book:document.querySelector('.s-notebook')?.scrollWidth,bookClient:document.querySelector('.s-notebook')?.clientWidth}))()`,
  );
  assert.ok(
    values.document <= values.width + 1 && values.body <= values.width + 1,
    `${label}: document horizontal overflow ${JSON.stringify(values)}`,
  );
  assert.ok(
    values.modal <= values.modalClient + 1,
    `${label}: modal horizontal overflow ${JSON.stringify(values)}`,
  );
  assert.ok(
    values.book <= values.bookClient + 16,
    `${label}: notebook content overflow ${JSON.stringify(values)}`,
  ); // Cover binding intentionally projects beyond the paper edge.
  return values;
}
async function openBook() {
  if ((await state()).modal !== 'journal') await key('j', 'KeyJ', 74);
  await waitFor("window.stichos.state.modal==='journal'", 'notebook modal');
  if (await read("!!document.querySelector('.is-shut')")) {
    await click('#s-notebook-open');
    await waitFor('window.stichos.state.notebook.open', 'unfolded notebook');
  }
}
async function tab(section) {
  await click(`[data-notebook-section="${section}"]`);
  await waitFor(
    `window.stichos.state.notebook.section===${JSON.stringify(section)}`,
    `${section} section`,
  );
}
async function pause() {
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal==='pause'", 'pause menu');
}
async function importOldCampaign() {
  const campaign = path.join(root, '.dream-loop/stichos-qa/completed-campaign.json');
  if (!fs.existsSync(campaign)) {
    pass(
      'Legacy campaign import unavailable',
      'No archived campaign file was present; current-life continuation still tested.',
    );
    return;
  }
  const folder = `notebook-campaign-${Date.now()}`;
  const hostDir = `/home/sabino/.local/share/agent-workspace-linux/files/${folder}`;
  const workspaceFile = `/workspace/agent/${folder}/completed-campaign.json`;
  fs.mkdirSync(hostDir, { recursive: true });
  fs.copyFileSync(campaign, path.join(hostDir, 'completed-campaign.json'));
  const original = JSON.parse(fs.readFileSync(campaign, 'utf8'));
  await pause();
  chooser = undefined;
  await click('#s-load-file');
  const until = Date.now() + 3000;
  while (!chooser && Date.now() < until) await delay(50);
  assert.ok(chooser, 'Restore opened its file chooser');
  await page.send('DOM.setFileInputFiles', {
    backendNodeId: chooser.backendNodeId,
    files: [workspaceFile],
  });
  await waitFor("window.stichos.state.modal==='';", 'legacy campaign restored');
  const imported = await state();
  assert.equal(imported.seed, original.seed);
  assert.equal(imported.storyStage, original.storyStage);
  assert.equal(
    imported.hasNotebook,
    !original.occupiedNpcId || original.occupiedNpcId === `body:theo-priest:${original.seed}`,
  );
  assert.deepEqual(imported.inventory, original.inventory);
  await key('j', 'KeyJ', 74);
  await waitFor("!!document.querySelector('.s-notebook')", 'legacy-life notebook');
  assert.equal(await read("!!document.querySelector('.is-shut')"), imported.hasNotebook);
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal==='';", 'return from legacy cover');
  await pause();
  const before = await state();
  await page.send('Page.reload');
  await waitFor("window.stichos?.state.modal==='title'", 'legacy title after reload');
  await click('#s-continue');
  await waitFor("window.stichos.state.modal==='';", 'legacy Continue');
  const after = await state();
  assert.equal(after.hasNotebook, before.hasNotebook);
  assert.equal(after.storyStage, before.storyStage);
  assert.deepEqual(after.inventory, before.inventory);
  pass(
    'Legacy campaign file imports and Continue retain physical-book ownership',
    `Seed ${after.seed}; story stage ${after.storyStage}; physical book ${after.hasNotebook}`,
  );
}
try {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  browser = await connect(version.webSocketDebuggerUrl);
  ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
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
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errors.push(params);
    },
  );
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await resize(1600, 1000, false);
  await page.send('Page.navigate', { url });
  await page.send('Page.bringToFront');
  await waitFor("window.stichos?.state.modal==='title'", 'title');
  build = await read(
    '({url:location.href,title:document.title,scripts:[...document.scripts].map(s=>s.src).filter(Boolean),appAssets:performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/app-"))})',
  );
  await click('#s-start button');
  await waitFor(
    "window.stichos.state.transfer&&document.querySelector('#s-transfer').dataset.step==='0'",
    'intro page one',
  );
  const introTime = (await state()).time;
  await screenshot('01-intro-before-stichos');
  await delay(6200);
  assert.equal(await read("document.querySelector('#s-transfer').dataset.step"), '0');
  assert.equal((await state()).time, introTime);
  assert.equal(await read("document.querySelector('#s-intro-prev').disabled"), true);
  await click('#s-intro-next');
  await waitFor("document.querySelector('#s-transfer').dataset.step==='1'", 'intro page two');
  await click('#s-intro-prev');
  await waitFor(
    "document.querySelector('#s-transfer').dataset.step==='0'",
    'intro back navigation',
  );
  const introTitles = [];
  for (let i = 0; i < 6; i++) {
    await waitFor(
      `document.querySelector('#s-transfer').dataset.step==='${i}'`,
      `intro page ${i + 1}`,
    );
    introTitles.push(await read("document.querySelector('#s-transfer-line').textContent"));
    assert.equal(
      (await state()).time,
      introTime,
      'the body stays paused throughout every intro page',
    );
    if (i === 5) {
      assert.match(await read("document.querySelector('#s-intro-next').textContent"), /Vespera/);
      await screenshot('02-intro-present-vespera');
    }
    await click('#s-intro-next');
  }
  await waitFor('!window.stichos.state.transfer', 'present-day world');
  assert.equal(new Set(introTitles).size, 6);
  assert.ok((await state()).hasNotebook);
  pass(
    'Six user-paced intro beats, backward navigation and explicit present-day arrival',
    'No page or body-time advance during 6.2 seconds of waiting',
  );

  await key('j', 'KeyJ', 74);
  await waitFor("!!document.querySelector('.is-shut')", 'physical closed cover');
  assert.equal((await state()).notebook.open, false);
  await screenshot('03-closed-notebook');
  await openBook();
  await read('document.fonts.ready.then(()=>true)');
  assert.equal(await read("document.querySelectorAll('[data-leaf]').length"), 18);
  await screenshot('04-open-notebook');
  const journalTime = (await state()).time;
  const leafTitles = [];
  for (let i = 0; i < 18; i++) {
    await click(`[data-leaf="${i}"]`);
    assert.equal((await state()).notebook.entry, i);
    assert.equal(
      await read(`document.querySelector('[data-leaf="${i}"]').getAttribute('aria-current')`),
      'page',
    );
    leafTitles.push(await read("document.querySelector('#s-leaf-title').textContent"));
    assert.ok(
      (await read("document.querySelector('.s-handwriting').innerText")).split(/\s+/).length >= 120,
    );
  }
  assert.equal(new Set(leafTitles).size, 18);
  assert.equal(await read("document.querySelector('#s-leaf-next').disabled"), true);
  await click('#s-leaf-prev');
  assert.equal((await state()).notebook.entry, 16);
  await click('#s-leaf-next');
  assert.equal((await state()).notebook.entry, 17);
  await click('[data-leaf="0"]');
  assert.equal(await read("document.querySelector('#s-leaf-prev').disabled"), true);
  assert.equal((await state()).time, journalTime);
  pass(
    'All eighteen dated leaves and previous/next controls work without advancing simulation',
    'Contents navigation used mouse and independent real wheel scrolling',
  );

  await click('#s-notebook-type');
  assert.equal((await state()).notebook.plain, true);
  assert.ok(
    await read(
      "getComputedStyle(document.querySelector('.s-handwriting p')).fontFamily.includes('Georgia')",
    ),
  );
  await click('#s-notebook-type');
  assert.equal((await state()).notebook.plain, false);
  assert.ok(
    await read(
      "getComputedStyle(document.querySelector('.s-handwriting p')).fontFamily.includes('Theo Hand')",
    ),
  );
  await tab('botany');
  for (let i = 0; i < 4; i++) {
    await click(`[data-leaf="${i}"]`);
    assert.equal((await state()).notebook.plant, i);
    assert.ok(
      await read("document.querySelector('.s-botanical-study').getAttribute('aria-label')"),
    );
  }
  await click('[data-leaf="0"]');
  await screenshot('05-botanical-sheet');
  pass(
    'Four botanical sheets and the handwriting/plain-type toggle work',
    'Each study has a named accessible ink diagram',
  );

  await tab('glossary');
  await fill('#s-glossary-search', 'cupula');
  assert.deepEqual(
    await read(
      "[...document.querySelectorAll('[data-glossary]:not([hidden]) dt')].map(e=>e.textContent)",
    ),
    ['Cúpula do Destino'],
  );
  await fill('#s-glossary-search', 'zz-unrecorded-word');
  assert.equal(await read("document.querySelector('#s-glossary-empty').hidden"), false);
  await fill('#s-glossary-search', '');
  assert.equal(await read("document.querySelectorAll('[data-glossary]:not([hidden])').length"), 16);
  await key('Escape', 'Escape', 27);
  await waitFor(
    "window.stichos.state.modal==='';",
    'Escape closes the notebook while glossary search owns focus',
  );
  await openBook();
  assert.equal((await state()).notebook.section, 'glossary');
  await tab('years');
  await click('[data-leaf="7"]');
  const replayBefore = await state();
  await click('#s-notebook-intro');
  await waitFor('window.stichos.state.transfer', 'notebook intro replay');
  await click('#s-intro-next');
  await click('#s-skip');
  await waitFor(
    "!window.stichos.state.transfer&&window.stichos.state.modal==='journal'",
    'replay return to notebook',
  );
  const replayAfter = await state();
  assert.equal(replayAfter.time, replayBefore.time);
  assert.deepEqual(replayAfter.player, replayBefore.player);
  assert.deepEqual(replayAfter.inventory, replayBefore.inventory);
  assert.deepEqual(replayAfter.notebook, replayBefore.notebook);
  pass(
    'Accent-folded glossary search and intro replay preserve the current life and leaf',
    'cupula finds Cúpula do Destino; skipped replay returns to folio eight',
  );

  await click('#s-journal-return');
  await waitFor("!!document.querySelector('.is-shut')", 'button closes physical cover');
  assert.equal((await state()).modal, 'journal');
  await click('#s-journal-return');
  await waitFor("window.stichos.state.modal==='';", 'Put away returns to world');
  await openBook();
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal==='';", 'Escape folds and puts away');
  await openBook();
  await key('j', 'KeyJ', 74);
  await waitFor("window.stichos.state.modal==='';", 'J folds and puts away');
  pass('Physical cover, Put away, Escape and J respect the book’s two closing states');

  await key('j', 'KeyJ', 74);
  await waitFor("!!document.querySelector('.is-shut')", 'rapid-open initial cover');
  await click('#s-notebook-open');
  await key('Escape', 'Escape', 27);
  await key('j', 'KeyJ', 74);
  await delay(450);
  assert.equal((await state()).modal, 'journal');
  assert.equal(
    (await state()).notebook.open,
    false,
    'a cancelled old open timer cannot unfold a newly reopened cover',
  );
  assert.ok(await read("!!document.querySelector('.is-shut')"));
  await openBook();
  await key('j', 'KeyJ', 74);
  await waitFor(
    "!!document.querySelector('.is-shut')",
    'folding reveals cover before putting away',
  );
  await click('#s-notebook-open');
  await waitFor(
    "window.stichos.state.modal==='journal'&&window.stichos.state.notebook.open",
    'reopen during put-away delay',
  );
  await delay(350);
  assert.equal(
    (await state()).modal,
    'journal',
    'the superseded put-away timer must not close the new open request',
  );
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal==='';", 'rapid-transition cleanup');
  pass('Rapid open/cancel/reopen and reopen-during-fold keep only the latest book action');

  const botanist = (await state()).npcs.find((npc) => npc.id === 'origin-botanist');
  assert.ok(botanist);
  const point = await read(
    `(()=>{const p=window.stichos.worldToScreen(${JSON.stringify({ x: botanist.x, y: botanist.y })}),r=document.querySelector('#s-world').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top}})()`,
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
  await waitFor(
    "window.stichos.state.dialogue?.npcId==='origin-botanist'",
    'actual botanist conversation',
  );
  const conversation = (await state()).dialogue;
  await key('j', 'KeyJ', 74);
  await waitFor("window.stichos.state.modal==='journal'", 'book from active conversation');
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal==='';", 'close book back to conversation');
  assert.equal((await state()).dialogue?.npcId, conversation.npcId);
  await waitFor(
    "!document.querySelector('#s-dialogue').hidden",
    'continuing conversation redraws after notebook closes',
    1500,
  );
  assert.equal(
    await read("document.querySelector('#s-dialogue').hidden"),
    false,
    'the continuing conversation is visible when the notebook closes',
  );
  await key('Escape', 'Escape', 27);
  await waitFor('!window.stichos.state.dialogue', 'leave conversation');
  pass('An actual NPC conversation remains visible after opening and closing the notebook');

  await openBook();
  await tab('threads');
  const thread = await read("document.querySelector('[data-track-quest]').dataset.trackQuest");
  const title = (await state()).quests.find((q) => q.id === thread).title;
  await click(`[data-track-quest="${thread}"]`);
  await waitFor("window.stichos.state.modal==='';", 'following a thread puts book away');
  assert.equal(await read("document.querySelector('#s-quest-title').textContent"), title);
  pass(
    'Following a current thread closes the physical book and updates the actual HUD objective',
    title,
  );

  await resize(390, 844, true);
  await key('j', 'KeyJ', 74);
  await waitFor("!!document.querySelector('.is-shut')", 'mobile cover');
  await noHorizontalOverflow('mobile cover');
  await screenshot('06-mobile-cover');
  await openBook();
  await tab('years');
  await noHorizontalOverflow('mobile notebook');
  await screenshot('07-mobile-open-book');
  await click('#s-notebook-select');
  await key('Home', 'Home', 36);
  await key('ArrowDown', 'ArrowDown', 40);
  await key('Enter', 'Enter', 13);
  await waitFor('window.stichos.state.notebook.entry===1', 'mobile native leaf selector');
  await click('#s-leaf-next');
  assert.equal((await state()).notebook.entry, 2);
  await tab('botany');
  await noHorizontalOverflow('mobile botanical page');
  await tab('glossary');
  await fill('#s-glossary-search', 'stichoi');
  assert.deepEqual(
    await read(
      "[...document.querySelectorAll('[data-glossary]:not([hidden]) dt')].map(e=>e.textContent)",
    ),
    ['Stíchoi'],
  );
  await noHorizontalOverflow('mobile glossary');
  await screenshot('08-mobile-glossary');
  await tab('threads');
  await noHorizontalOverflow('mobile threads');
  await click('#s-journal-return');
  await waitFor("!!document.querySelector('.is-shut')", 'mobile Close book');
  await click('#s-journal-return');
  await waitFor("window.stichos.state.modal==='';", 'mobile Put away');
  pass(
    '390×844 cover, pages, glossary and threads have no horizontal overflow',
    'Native leaf selector, next leaf, tabs, search and both closing buttons used real input',
  );

  await resize(1600, 1000, false);
  await key('s', 'KeyS', 83, 650);
  await pause();
  const saved = await state();
  assert.ok(saved.hasNotebook);
  await page.send('Page.reload');
  await waitFor("window.stichos?.state.modal==='title'", 'saved life title');
  await click('#s-continue');
  await waitFor("window.stichos.state.modal==='';", 'Continue saved life');
  const continued = await state();
  assert.equal(continued.hasNotebook, true);
  assert.deepEqual(continued.inventory, saved.inventory);
  assert.equal(continued.player.x, saved.player.x);
  assert.equal(continued.player.y, saved.player.y);
  await key('j', 'KeyJ', 74);
  await waitFor("!!document.querySelector('.is-shut')", 'continued physical notebook');
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal==='';", 'closed continued cover');
  pass('Save and Continue retain the current body’s physical notebook and possessions');
  await key('i', 'KeyI', 73);
  await waitFor("!!document.querySelector('#s-pocketbook')", 'physical book item in satchel');
  assert.match(await read("document.querySelector('#s-pocketbook').textContent"), /notebook/i);
  await click('#s-pocketbook');
  await waitFor("!!document.querySelector('.is-shut')", 'satchel opens the actual physical cover');
  await key('Escape', 'Escape', 27);
  await waitFor("window.stichos.state.modal==='';", 'put away satchel book');
  pass('The satchel identifies and opens the current body’s physical notebook');
  await importOldCampaign();
  assert.equal(errors.length, 0, 'No browser runtime or console errors');
  pass('No browser console or runtime errors');
} catch (error) {
  failure = error;
  console.error(error.stack || error);
  if (page) await screenshot('99-failure').catch(() => {});
} finally {
  const report = {
    started: started.toISOString(),
    finished: new Date().toISOString(),
    url,
    build,
    viewport,
    passed: !failure,
    error: failure?.message ?? null,
    results,
    errors,
  };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(out, 'REPORT.md'),
    `# Notebook browser QA\n\n${report.started} · **${failure ? 'FAIL: ' + failure.message : 'PASS'}**\n\n${results.map((r) => '- ' + r.name + (r.detail ? ': ' + r.detail : '')).join('\n')}\n\nReal mouse, keyboard, wheel and native file-chooser input in a fresh Agent Workspace Chromium context. DOM and simulation diagnostics were read-only. No game-state or browser-storage injection. Build: ${JSON.stringify(build)}. Console/runtime errors: ${errors.length}.\n`,
  );
  page?.close();
  if (browser && contextId)
    await browser
      .send('Target.disposeBrowserContext', { browserContextId: contextId })
      .catch(() => {});
  browser?.close();
  if (failure) process.exitCode = 1;
}
