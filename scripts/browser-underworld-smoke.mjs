import fs from 'node:fs';
import assert from 'node:assert/strict';
import { browserHarness, delay } from './browser-harness.mjs';
const out = '.dream-loop/living-systems/underworld-browser';
const fixture = fs.readFileSync(`${out}/surface.json`, 'utf8');
const results = [];
for (const [width, height, mobile] of [
  [390, 844, true],
  [320, 568, true],
  [1280, 900, false],
]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  try {
    const p = await h.page(
      `underworld-${width}`,
      process.env.VERSO_BROWSER_URL ?? 'http://127.0.0.1:4210/',
      { width, height, mobile },
    );
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('underworld-fixture')){localStorage.setItem('verso-room-v1:identity',JSON.stringify('11111111-1111-4111-8111-111111111111'));localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});sessionStorage.setItem('underworld-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await delay(650);
    await p.shot('surface-entrance');
    const before = await p.state();
    if (mobile) await p.click('.v-touch-interact');
    else await p.key('e', 'KeyE', 69);
    await p.wait('window.stichos.state.livingSystems?.underground?.depth===0');
    await delay(250);
    await p.shot('entered');
    const entered = await p.state();
    assert.equal(entered.inputSequences.active, 0);
    // Native ordinary directional movement, then actual attack/guard/step controls.
    await p.key('ArrowRight', 'ArrowRight', 39, 850);
    await p.shot('walk-hall');
    if (mobile) {
      await p.click('.v-touch-attack');
      await delay(950);
      await p.click('[data-portrait-action="technique-1"]');
      await delay(700);
      await p.click('.v-touch-dodge');
    } else {
      await p.key('f', 'KeyF', 70);
    }
    await delay(400);
    await p.shot('combat-controls');
    await p.click(mobile ? '#v-mobile-more' : '#s-pause');
    await p.click(mobile ? '#v-more-field' : '#v-menu-field');
    await p.shot('floor-panel');
    const panel = await p.read("document.querySelector('#s-modal').innerText");
    assert.match(panel, /Underworld|Underworks|underworks/);
    const final = await p.state();
    assert.ok(final.livingSystems.underground);
    results.push({
      width,
      height,
      before: { player: before.player, space: before.livingSystems.location },
      entered: { player: entered.player, space: entered.livingSystems.location },
      final: { player: final.player, space: final.livingSystems.location },
      panel,
      errors: h.errors,
    });
  } finally {
    await h.close();
  }
}
fs.writeFileSync(`${out}/smoke.json`, JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    results.map((r) => ({ width: r.width, space: r.final.space, errors: r.errors.length })),
  ),
);
