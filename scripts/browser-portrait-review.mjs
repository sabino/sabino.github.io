/** Independent native browser review. Uses only a verified agent-workspace endpoint. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserHarness, chooseLife, delay } from './browser-harness.mjs';
const out = process.env.VERSO_BROWSER_OUT || '.dream-loop/portrait-action-expansion/review-mobile';
const harness = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
const evidence = { checks: [], screenshots: [], findings: [], errors: [] };
const record = (label, detail) => evidence.checks.push({ label, detail });
const shot = async (p, label) => evidence.screenshots.push(await p.shot(label));
const check = async (label, work) => {
  try {
    const detail = await work();
    record(label, detail);
  } catch (error) {
    evidence.findings.push({ label, message: String(error) });
  }
};
const layout = async (p, selector) =>
  p.read(
    `(()=>{const root=document.querySelector(${JSON.stringify(selector)}),r=root.getBoundingClientRect();return{rect:r.toJSON(),width:document.documentElement.scrollWidth,role:root.getAttribute('role'),labelledby:root.getAttribute('aria-labelledby'),focus:document.activeElement?.outerHTML?.slice(0,200),buttons:[...root.querySelectorAll('button,summary')].map(e=>{const b=e.getBoundingClientRect();return{tag:e.tagName,text:(e.getAttribute('aria-label')||e.textContent).trim().slice(0,80),rect:b.toJSON(),disabled:!!e.disabled,visible:!!e.getClientRects().length}})}})()`,
  );
try {
  const page = await harness.page(
    'review',
    process.env.VERSO_BROWSER_URL || 'http://localhost:4197/',
    { width: 320, height: 568, mobile: true },
  );
  await check('fresh title has quiet accessible unread marker', async () => {
    const label = await page.read("document.querySelector('#v-title-announcements').textContent");
    assert.match(label, /unread/);
    return label;
  });
  await shot(page, '320-title');
  await page.click('#v-title-announcements');
  await page.wait("window.stichos.state.modal==='announcements'");
  await check(
    'announcements dialog has heading, safe width and persistent read state',
    async () => {
      const v = await layout(page, '.s-window');
      assert.equal(v.role, 'dialog');
      assert.equal(v.labelledby, 's-modal-heading');
      assert.ok(v.width <= 320);
      const saved = await page.read(
        "JSON.parse(localStorage.getItem('verso.announcements.read.v1'))",
      );
      assert.equal(saved.schema, 1);
      assert.ok(saved.read.length > 0);
      return { ...v, saved };
    },
  );
  await shot(page, '320-announcements');
  await check('native keyboard reaches summary and Space collapses first entry', async () => {
    await page.key('Tab', 'Tab', 9);
    const before = await page.read(
      "({tag:document.activeElement.tagName,open:document.querySelector('.v-news-entry').open})",
    );
    assert.equal(before.tag, 'SUMMARY');
    await page.key(' ', 'Space', 32);
    const after = await page.read("document.querySelector('.v-news-entry').open");
    assert.equal(after, !before.open);
    return { before, after };
  });
  await check('native keyboard focus stays in announcement modal', async () => {
    for (let i = 0; i < 12; i++) {
      await page.key('Tab', 'Tab', 9);
      assert.equal(await page.read("!!document.activeElement.closest('.s-window')"), true);
    }
    return await page.read('document.activeElement.tagName');
  });
  await page.click('#v-news-return');
  await check('return and reload stay read without reopening announcements', async () => {
    assert.equal((await page.state()).modal, 'title');
    assert.equal(
      await page.read("!!document.querySelector('#v-title-announcements .v-news-dot')"),
      false,
    );
    await page.cdp.send('Page.reload');
    await delay(600);
    await page.wait("window.stichos?.state.modal==='title'");
    assert.equal(
      await page.read("!!document.querySelector('#v-title-announcements .v-news-dot')"),
      false,
    );
    return (await page.state()).modal;
  });
  await page.resize(390, 844);
  await page.click('#v-title-announcements');
  await shot(page, '390-announcements');
  await page.click('#v-news-return');
  await chooseLife(page, 'Independent mobile review', '8', true);
  await page.wait("document.querySelector('#app').classList.contains('portrait-controls-mounted')");
  await shot(page, '390-exploration');
  await page.click('#s-pause');
  await page.click('#v-menu-announcements');
  await check('game menu opens same read bulletin and Return goes to pause', async () => {
    assert.equal(
      await page.read(
        "document.querySelector('.v-news-read-status').textContent.includes('up to date')",
      ),
      true,
    );
    await page.click('#v-news-return');
    assert.equal((await page.state()).modal, 'pause');
    return 'read bulletin retained across title → life → menu';
  });
  await page.key('Escape', 'Escape', 27);
  await page.click('#v-voice-settings');
  await shot(page, '390-voice-setup');
  await check(
    'solo voice setup states prerequisite and exposes actionable room setup',
    async () => {
      const text = await page.read("document.querySelector('#s-modal').textContent");
      assert.match(text, /room/i);
      const buttons = await page.read(
        "[...document.querySelectorAll('#s-modal button')].map(b=>({id:b.id,text:b.textContent,disabled:b.disabled}))",
      );
      assert.ok(buttons.some((b) => /room/i.test(b.text) && !b.disabled));
      return buttons;
    },
  );
  await page.key('Escape', 'Escape', 27);
  await page.click('#s-sound');
  await shot(page, '390-settings');
  await check('motion settings labels and native keyboard edit', async () => {
    for (
      let i = 0;
      i < 10 && (await page.read('document.activeElement.id')) !== 'v-effect-intensity';
      i++
    )
      await page.key('Tab', 'Tab', 9);
    assert.equal(await page.read('document.activeElement.id'), 'v-effect-intensity');
    const before = await page.read("Number(document.querySelector('#v-effect-intensity').value)");
    await page.key('ArrowLeft', 'ArrowLeft', 37);
    const after = await page.read("Number(document.querySelector('#v-effect-intensity').value)");
    assert.ok(after < before);
    assert.equal(Number(await page.read("localStorage.getItem('verso.effects.intensity')")), after);
    return { before, after };
  });
  await page.key('Escape', 'Escape', 27);
  await check('rotation during held action clears held controls', async () => {
    const r = await page.read(
      "document.querySelector('[data-portrait-action=dodge]').getBoundingClientRect().toJSON()",
    );
    await page.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }],
    });
    await delay(150);
    await page.resize(844, 390);
    await page.wait("!document.querySelector('.v-portrait-gate').hidden");
    const rotated = await page.read(
      "({inert:document.querySelector('.s-shell').inert,held:document.querySelectorAll('.v-portrait-controls .is-held').length,diag:window.stichos.state.portraitControls})",
    );
    assert.equal(rotated.inert, true);
    assert.equal(rotated.held, 0);
    await shot(page, 'landscape-cancel');
    await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.resize(390, 844);
    await page.wait("document.querySelector('.v-portrait-gate').hidden");
    assert.equal(await page.read("document.querySelector('.s-shell').inert"), false);
    return rotated;
  });
  await check('native window backgrounding cancels held touch', async () => {
    const r = await page.read(
      "document.querySelector('[data-portrait-action=dodge]').getBoundingClientRect().toJSON()",
    );
    await page.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }],
    });
    await page.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    const { windowId } = await harness.browser.send('Browser.getWindowForTarget', {
      targetId: page.targetId,
    });
    await harness.browser.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'minimized' },
    });
    await page.wait("document.visibilityState==='hidden'", 'native window is hidden', 3000);
    const hidden = await page.read(
      "({visibility:document.visibilityState,held:document.querySelectorAll('.v-portrait-controls .is-held').length,diag:window.stichos.state.portraitControls})",
    );
    assert.equal(hidden.held, 0);
    await harness.browser.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal' },
    });
    await page.focus();
    await page.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.wait("document.visibilityState==='visible'");
    await page.resize(390, 844);
    await delay(350);
    if ((await page.state()).modal === 'pause') await page.key('Escape', 'Escape', 27);
    const restored = await page.state();
    hidden.restored = {
      modal: restored.modal,
      paused: restored.paused,
      viewport: restored.viewport,
      controls: restored.portraitControls,
    };
    await shot(page, 'background-restored');
    return hidden;
  });
  await page.click('#s-mobile-pack');
  await shot(page, '390-inventory');
  await page.click('#s-tab-craft');
  await shot(page, '390-crafting');
  await page.click('#v-pack-close');
  await page.click('#v-quick-words');
  await shot(page, '390-text-fallback');
  await page.key('Escape', 'Escape', 27);
  await check('More exposes an accessible Field expeditions action', async () => {
    await page.click('#v-mobile-more');
    const button = await page.read(
      "(()=>{const b=document.querySelector('#v-more-expeditions'),r=b.getBoundingClientRect();return{text:b.textContent,width:r.width,height:r.height}})()",
    );
    assert.match(button.text, /expedition/i);
    assert.ok(button.width >= 44 && button.height >= 44);
    await page.click('#v-more-expeditions');
    assert.equal((await page.state()).modal, 'expeditions');
    await shot(page, 'more-expeditions');
    await page.key('Escape', 'Escape', 27);
    return button;
  });
  await page.click('#s-pause');
  await page.click('#v-menu-techniques');
  await shot(page, '390-techniques');
  await page.key('Escape', 'Escape', 27);
  await page.click('#s-pause');
  await page.click('#v-menu-expeditions');
  await shot(page, '390-expeditions');
  await page.key('Escape', 'Escape', 27);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
  ]) {
    await page.resize(width, height);
    await check(`${width} portrait action targets`, async () => {
      const v = await layout(page, '.v-portrait-controls');
      assert.ok(v.width <= width);
      for (const b of v.buttons)
        if (b.visible) {
          assert.ok(b.rect.width >= 44 && b.rect.height >= 44, b.text);
          assert.ok(
            b.rect.x >= 0 && b.rect.right <= width && b.rect.y >= 0 && b.rect.bottom <= height,
            b.text,
          );
        }
      return v;
    });
    await shot(page, `${width}-controls`);
  }
  await check('actual hostile death and native clinic recovery fit portrait', async () => {
    const death = await harness.page(
      'death',
      process.env.VERSO_BROWSER_URL || 'http://localhost:4199/',
      { width: 320, height: 568, mobile: true },
    );
    const fixture = fs.readFileSync(`${out}/fixtures/death.json`, 'utf8');
    await death.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(location.protocol==='http:'&&!sessionStorage.getItem('verso.qa.death')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});sessionStorage.setItem('verso.qa.death','1');}`,
    });
    await death.cdp.send('Page.reload');
    await delay(700);
    await death.wait(
      "window.stichos?.state.modal==='title'&&!!document.querySelector('#s-continue')",
    );
    await death.click('#s-continue');
    await death.wait(
      "window.stichos.state.phase==='lost'&&window.stichos.state.modal==='lost'",
      'real hostile attack reaches low-HP fixture',
      15000,
    );
    const lost = await death.state();
    const panel = await layout(death, '.s-window');
    assert.ok(panel.width <= 320);
    const wake = panel.buttons.find((b) => /Wake|heartbeat/.test(b.text));
    assert.ok(wake && wake.rect.width >= 44 && wake.rect.height >= 44);
    assert.equal(lost.player.hp, 0);
    await shot(death, '320-lost');
    await death.click('#s-return-life');
    await death.wait('window.stichos.state.transfer');
    await shot(death, '320-recovery-transfer');
    await death.click('#s-skip');
    await death.wait(
      "!window.stichos.state.transfer&&window.stichos.state.phase==='playing'&&window.stichos.state.modal===''",
    );
    const recovered = await death.state();
    assert.ok(recovered.player.hp > 0);
    assert.equal(recovered.bodyId, lost.bodyId);
    await shot(death, '320-recovered');
    return {
      source: 'Node-authored1HPsave; actual hostile AI and native recovery controls',
      lost: { hp: lost.player.hp, bodyId: lost.bodyId },
      recovered: {
        hp: recovered.player.hp,
        bodyId: recovered.bodyId,
        x: recovered.player.x,
        y: recovered.player.y,
      },
      panel,
    };
  });
  await check('bulletin opens from PWA cache with its local origin stopped', async () => {
    const build = path.resolve(process.env.VERSO_BROWSER_STATIC_DIR || 'dist');
    const mime = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.webmanifest': 'application/manifest+json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.ttf': 'font/ttf',
    };
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.resolve(
        build,
        '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)),
      );
      if (
        !file.startsWith(build + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const offline = await harness.page('offline', origin + '/', {
        width: 320,
        height: 568,
        mobile: true,
      });
      await offline.cdp.send('Network.setBypassServiceWorker', { bypass: false });
      await offline.cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await offline.read('navigator.serviceWorker.ready.then(()=>true)');
      await offline.cdp.send('Page.reload');
      await delay(700);
      await offline.wait(
        "window.stichos?.state.modal==='title'&&!!navigator.serviceWorker.controller",
      );
      await new Promise((resolve) => server.close(resolve));
      assert.equal(server.listening, false);
      await assert.rejects(fetch(origin + '/index.html'), 'test origin is genuinely unavailable');
      await offline.cdp.send('Page.reload');
      await delay(700);
      await offline.wait(
        "window.stichos?.state.modal==='title'",
        'cached title with origin stopped',
      );
      await offline.click('#v-title-announcements');
      await offline.wait("window.stichos.state.modal==='announcements'");
      await shot(offline, '320-offline-announcements');
      const result = await offline.read(
        "({controller:!!navigator.serviceWorker.controller,title:document.title,entries:document.querySelectorAll('.v-news-entry').length,readStatus:document.querySelector('.v-news-read-status').textContent})",
      );
      assert.equal(result.entries, 6);
      return {
        ...result,
        originServerStopped: true,
        httpCacheDisabled: true,
        condition:
          'Local origin unavailable; service-worker cache serves the complete application. OS connectivity was not changed.',
      };
    } finally {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
  });
  const ax = await page.cdp.send('Accessibility.getFullAXTree');
  fs.writeFileSync(`${out}/accessibility-tree.json`, JSON.stringify(ax, null, 2));
  record('accessibility tree captured', { nodes: ax.nodes.length });
} catch (error) {
  evidence.findings.push({ label: 'harness abort', message: String(error), stack: error.stack });
} finally {
  evidence.errors = harness.errors;
  fs.writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
  await harness.close();
}
console.log(
  JSON.stringify(
    {
      checks: evidence.checks.length,
      findings: evidence.findings,
      errors: evidence.errors.length,
      screenshots: evidence.screenshots.length,
    },
    null,
    2,
  ),
);
if (evidence.findings.length || evidence.errors.length) process.exitCode = 1;
