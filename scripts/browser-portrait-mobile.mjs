/** Native touch/keyboard input. Attach only to the isolated workspace browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { browserHarness, chooseLife, delay } from './browser-harness.mjs';

export async function verifyPortraitMobile({ endpoint, url, out }) {
  const harness = await browserHarness(endpoint, out);
  const evidence = { checks: [], screenshots: [], errors: [] };
  const record = (label, detail) => evidence.checks.push({ label, detail });
  const shot = async (page, label) => evidence.screenshots.push(await page.shot(label));
  try {
    const page = await harness.page('portrait', url, { width: 390, height: 844, mobile: true });
    await shot(page, 'title');
    await chooseLife(page, 'Portrait input QA', '8', true);
    await page.wait(
      "document.querySelector('#app').classList.contains('portrait-controls-mounted')",
    );
    for (const [width, height] of [
      [320, 568],
      [360, 800],
      [390, 844],
      [430, 932],
      [768, 1024],
      [900, 1200],
    ]) {
      await page.resize(width, height);
      const layout = await page.read(`(() => {
        const pane=document.querySelector('.v-portrait-controls');
        const nodes=[...pane.querySelectorAll('button')];
        return { coarse:matchMedia('(pointer: coarse)').matches,
          gate:!document.querySelector('.v-portrait-gate').hidden,
          width:document.documentElement.scrollWidth,
          world:document.querySelector('.s-world-wrap').getBoundingClientRect().toJSON(),
          buttons:nodes.map(e=>{const r=e.getBoundingClientRect();return {
            label:e.getAttribute('aria-label'),rect:r.toJSON(),
            reachable:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))
          }})};
      })()`);
      assert.equal(layout.coarse, true);
      assert.equal(layout.gate, false);
      assert.ok(layout.width <= width, `${width}: no horizontal overflow`);
      assert.ok(
        layout.world.height >= height * 0.55,
        `${width}: world retains at least 55% height`,
      );
      for (const button of layout.buttons) {
        assert.ok(
          button.rect.width >= 44 && button.rect.height >= 44,
          `${width}: ${button.label} touch target`,
        );
        assert.ok(
          button.rect.x >= 0 &&
            button.rect.y >= 0 &&
            button.rect.right <= width &&
            button.rect.bottom <= height,
          `${width}: ${button.label} inside screen`,
        );
        assert.ok(button.reachable, `${width}: ${button.label} is not covered`);
      }
      record(`${width}×${height} portrait`, layout);
      await shot(page, `${width}x${height}-exploration`);
    }
    await page.resize(390, 844);
    const position = (await page.state()).player;
    const stick = await page.read(
      `document.querySelector('.v-joystick-surface').getBoundingClientRect().toJSON()`,
    );
    const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    await page.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...center, id: 1 }],
    });
    await page.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: center.x - 38, y: center.y, id: 1 }],
    });
    await delay(900);
    await shot(page, 'walking-stick-held');
    await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = (await page.state()).player;
    assert.ok(
      Math.hypot(after.x - position.x, after.y - position.y) > 0.1,
      'native analog drag moves the player',
    );
    await delay(250);
    const stopped = (await page.state()).player;
    assert.ok(Math.hypot(stopped.x - after.x, stopped.y - after.y) < 0.1, 'release stops movement');
    record('native analog movement and release', { position, after, stopped });
    await page.click('#s-mobile-pack');
    await shot(page, 'inventory');
    assert.equal(
      await page.read(
        "document.querySelector('.v-portrait-controls').checkVisibility({visibilityProperty:true})",
      ),
      false,
    );
    await page.click('#s-tab-craft');
    await shot(page, 'crafting');
    await page.click('#v-pack-close');
    await page.click('#v-mobile-more');
    await shot(page, 'actions');
    await page.click('#v-more-gear');
    await shot(page, 'equipment');
    await page.key('Escape', 'Escape', 27);
    await page.click('#v-quick-words');
    await shot(page, 'quick-phrases');
    await page.click('[data-quick-text="Thanks!"]');
    await page.click('#v-compose-toggle');
    await page.fill('#v-chat-input', 'Portrait text fallback');
    await shot(page, 'chat-entry');
    // Desktop Chromium cannot summon an iOS keyboard. Emulate its contracted
    // viewport while retaining real input focus, and label this evidence honestly.
    await page.resize(390, 390);
    const keyboard = await page.read(
      `({viewport:window.stichos.state.viewport,world:document.querySelector('.s-world-wrap').getBoundingClientRect().toJSON(),focus:document.activeElement.id})`,
    );
    assert.equal(keyboard.focus, 'v-chat-input');
    assert.equal(keyboard.viewport.portraitRequired, false);
    assert.equal(keyboard.viewport.keyboardLikely, true);
    assert.ok(keyboard.world.height >= 120, 'contracted keyboard viewport keeps a usable world');
    record('emulated keyboard contraction while actual text entry retains focus', keyboard);
    await shot(page, 'keyboard-viewport');
    await page.resize(390, 844);
    await page.click('#v-chat-form button[type="submit"]');
    assert.notEqual(
      await page.read('document.activeElement.id'),
      'v-chat-input',
      'sending restores game focus',
    );
    if (
      await page.read(
        "document.querySelector('#v-compose-toggle').getAttribute('aria-expanded')==='true'",
      )
    )
      await page.click('#v-chat-toggle');
    await page.click('#v-voice-settings');
    await shot(page, 'voice-setup');
    await page.key('Escape', 'Escape', 27);
    await page.click('#s-together');
    await shot(page, 'room-join');
    await page.key('Escape', 'Escape', 27);
    await page.click('#s-sound');
    await page.click('#v-control-hand');
    await page.key('ArrowDown', 'ArrowDown', 40);
    await page.key('Enter', 'Enter', 13);
    await page.click('#v-control-movement');
    await page.key('ArrowDown', 'ArrowDown', 40);
    await page.key('Enter', 'Enter', 13);
    await shot(page, 'touch-settings');
    await page.key('Escape', 'Escape', 27);
    const fallback = await page.read(
      `(() => {const root=document.querySelector('#app'),pad=document.querySelector('.s-mobile-move');return {hand:root.dataset.controlHand,movement:root.dataset.movementControl,display:getComputedStyle(pad).display,buttons:[...pad.querySelectorAll('button')].map(e=>{const r=e.getBoundingClientRect();return {rect:r.toJSON(),reachable:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})}})()`,
    );
    assert.equal(fallback.hand, 'left');
    assert.equal(fallback.movement, 'buttons');
    assert.equal(fallback.display, 'grid');
    for (const button of fallback.buttons)
      assert.ok(button.reachable && button.rect.width >= 44 && button.rect.height >= 44);
    record('left-handed direction button fallback', fallback);
    await shot(page, 'left-hand-buttons');
    await page.resize(844, 390);
    await page.wait("!document.querySelector('.v-portrait-gate').hidden");
    assert.equal(await page.read("document.querySelector('.s-shell').inert"), true);
    await shot(page, 'landscape-gate');
    await page.resize(390, 844);
    await page.wait("document.querySelector('.v-portrait-gate').hidden");
    assert.equal(await page.read("document.querySelector('.s-shell').inert"), false);
    record('rotation clears input and restores portrait shell', (await page.state()).viewport);
    // Simulate the iOS standalone signal without installing anything on a device.
    await page.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});",
    });
    await page.cdp.send('Page.reload');
    await page.wait('window.stichos?.state.appMode.installedWindow');
    record('simulated iOS standalone detection', (await page.state()).appMode);
    for (const [width, height] of [
      [390, 844],
      [430, 932],
      [768, 1024],
    ]) {
      await page.resize(width, height);
      assert.equal((await page.state()).appMode.installedWindow, true);
      assert.equal((await page.state()).viewport.portraitRequired, false);
      await shot(page, `${width}x${height}-standalone-title`);
    }
    const desktop = await harness.page('desktop', url, { width: 1440, height: 900 });
    assert.equal(await desktop.read("document.querySelector('.v-portrait-gate').hidden"), true);
    await shot(desktop, 'title');
    evidence.errors = harness.errors;
    assert.deepEqual(evidence.errors, []);
    return evidence;
  } finally {
    evidence.errors = harness.errors;
    fs.writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
    await harness.close();
  }
}

if (process.argv[1]?.endsWith('browser-portrait-mobile.mjs')) {
  const evidence = await verifyPortraitMobile({
    endpoint: process.env.VERSO_BROWSER_CDP,
    url: process.env.VERSO_BROWSER_URL || 'http://localhost:4197/',
    out: process.env.VERSO_BROWSER_OUT || '.dream-loop/portrait-expansion/mobile-native',
  });
  console.log(
    JSON.stringify({
      checks: evidence.checks.length,
      screenshots: evidence.screenshots.length,
      errors: evidence.errors.length,
    }),
  );
}
