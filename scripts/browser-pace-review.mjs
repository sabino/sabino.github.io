/** Native-input pace QA. Only the initial local save is a prepared scenario. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { browserHarness, delay } from './browser-harness.mjs';
const out = '.dream-loop/pace-controls';
fs.mkdirSync(out, { recursive: true });
const fixture = fs.readFileSync(`${out}/fixture.json`, 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const results = [];
for (const [width, height, mobile] of [
  [320, 568, true],
  [390, 844, true],
  [1280, 900, false],
]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  let p;
  const checks = [];
  try {
    p = await h.page(`pace-${width}`, process.env.VERSO_BROWSER_URL || 'http://127.0.0.1:4210/', {
      width,
      height,
      mobile,
    });
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('pace-fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});localStorage.setItem('verso-room-v1:identity',JSON.stringify(${JSON.stringify(owner)}));sessionStorage.setItem('pace-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await delay(300);
    const record = async (name) => {
      const state = await p.state();
      const layout = await p.read(
        "(()=>{const q=e=>{const r=e.getBoundingClientRect();return{id:e.id,action:e.dataset.travel,x:r.x,y:r.y,w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}};return{overflow:document.documentElement.scrollWidth>innerWidth,dock:document.querySelector('.v-travel-controls')?.dataset.layout,controls:[...document.querySelectorAll('.v-travel-controls button')].filter(e=>e.getClientRects().length).map(q),focus:document.activeElement?.outerHTML,paceHint:document.querySelector('#v-joystick-hint')?.textContent}})()",
      );
      checks.push({
        name,
        pace: state.movementPace,
        player: { x: state.player.x, y: state.player.y, stamina: state.player.stamina },
        travel: state.travel,
        layout,
      });
      await p.shot(name);
      assert.equal(layout.overflow, false);
      for (const c of layout.controls) {
        assert.ok(c.h >= 43.5 && c.w >= 43.5, `undersized ${c.action}`);
        assert.ok(c.y >= 0 && c.y + c.h <= height, `offscreen ${c.action}`);
      }
    };
    if (process.env.VERSO_PACE_BEFORE) {
      await record('before');
      results.push({ width, height, checks, errors: h.errors });
      continue;
    }
    await record('walk-dock');
    assert.equal((await p.state()).movementPace, 'walk');
    const origin = (await p.state()).player;
    await p.key('c', 'KeyC', 67);
    assert.equal((await p.state()).movementPace, 'run');
    await record('c-run-stationary');
    assert.equal((await p.state()).player.x, origin.x);
    assert.equal((await p.state()).player.y, origin.y);
    await p.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'c',
      code: 'KeyC',
      windowsVirtualKeyCode: 67,
      autoRepeat: true,
    });
    await p.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'c',
      code: 'KeyC',
      windowsVirtualKeyCode: 67,
    });
    assert.equal((await p.state()).movementPace, 'run');
    for (const modifiers of [1, 2, 4, 8]) await p.key('c', 'KeyC', 67, 0, modifiers);
    assert.equal((await p.state()).movementPace, 'run');
    await p.click('[data-travel=pace]');
    assert.equal((await p.state()).movementPace, 'walk');
    await record('one-tap-walk');
    const walkStart = (await p.state()).player;
    await p.key('ArrowRight', 'ArrowRight', 39, 450);
    const walkEnd = (await p.state()).player;
    await p.key('c', 'KeyC', 67);
    const runStart = (await p.state()).player;
    await p.key('ArrowRight', 'ArrowRight', 39, 450);
    const runEnd = (await p.state()).player;
    const walkDistance = Math.hypot(walkEnd.x - walkStart.x, walkEnd.y - walkStart.y),
      runDistance = Math.hypot(runEnd.x - runStart.x, runEnd.y - runStart.y);
    assert.ok(
      runDistance > walkDistance * 1.25,
      `Run ${runDistance} must exceed Walk ${walkDistance}`,
    );
    checks.push({ name: 'native-run-is-faster', walkDistance, runDistance });
    await p.click('[data-travel=options]');
    await record('travel-options');
    await p.key('c', 'KeyC', 67);
    assert.equal((await p.state()).movementPace, 'run', 'disclosure ignores C');
    await p.key('Escape', 'Escape', 27);
    assert.equal(await p.read('document.activeElement?.dataset.travel'), 'options');
    assert.equal((await p.state()).modal, '');
    await p.click('[data-travel=options]');
    await p.click('[data-travel=lock]');
    await p.wait("window.stichos.state.travel.state==='locked'");
    await record('auto-run');
    await p.key('c', 'KeyC', 67);
    assert.equal((await p.state()).travel.run, false);
    await record('auto-walk');
    await p.click('[data-travel=stop]');
    assert.equal((await p.state()).travel.state, 'idle');
    await record('stopped');
    await p.click('[data-travel=pace]');
    assert.equal((await p.state()).movementPace, 'run');
    if (await p.read("document.querySelector('.s-shell').classList.contains('chat-collapsed')"))
      await p.click('#v-compose-toggle');
    await p.click('#v-chat-input');
    await p.wait("document.activeElement?.id==='v-chat-input'");
    await p.cdp.send('Input.insertText', { text: 'c' });
    await p.key('c', 'KeyC', 67);
    assert.equal((await p.state()).movementPace, 'run');
    await record('chat-does-not-toggle');
    await p.key('Escape', 'Escape', 27);
    if (!(await p.read("document.querySelector('.s-shell').classList.contains('chat-collapsed')")))
      await p.click('#v-compose-toggle');
    await p.click('#v-ptt');
    assert.equal((await p.state()).modal, 'voice');
    await p.key('c', 'KeyC', 67);
    assert.equal((await p.state()).movementPace, 'run');
    assert.equal((await p.state()).voice.microphone, false);
    await record('ptt-overlay-does-not-toggle');
    await p.key('Escape', 'Escape', 27);
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    assert.equal((await p.state()).movementPace, 'run');
    await record('pace-survives-reload');
    assert.deepEqual(h.errors, []);
    results.push({ width, height, checks, errors: h.errors });
  } catch (error) {
    if (p) await p.shot('failure');
    results.push({
      width,
      height,
      checks,
      error: String(error),
      state: await p?.state().catch(() => null),
      errors: h.errors,
    });
  } finally {
    fs.writeFileSync(
      `${out}/${process.env.VERSO_PACE_BEFORE ? 'before' : 'after'}-results.json`,
      JSON.stringify(results, null, 2),
    );
    await h.close();
  }
  console.log(
    JSON.stringify({
      width,
      checks: checks.length,
      error: results.at(-1).error,
      errors: h.errors.length,
    }),
  );
}
if (results.some((r) => r.error)) process.exitCode = 1;
