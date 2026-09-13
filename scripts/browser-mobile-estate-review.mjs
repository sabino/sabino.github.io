import fs from 'node:fs';
import { browserHarness, delay } from './browser-harness.mjs';
const base = '.dream-loop/living-systems/mobile-systems-review';
const out = process.env.VERSO_BROWSER_OUT || `${base}/estate-first`;
const fixture = fs.readFileSync(`${base}/owned-home-fixture.json`, 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const results = [];
for (const [width, height] of [
  [390, 844],
  [320, 568],
]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  let p;
  const checks = [];
  try {
    p = await h.page(`estate-${width}`, 'http://127.0.0.1:4230/', { width, height, mobile: true });
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('systems-fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});localStorage.setItem('verso-room-v1:identity',JSON.stringify(${JSON.stringify(owner)}));sessionStorage.setItem('systems-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await delay(500);
    const button = async (label) => {
      const s = await p.read(
        `(()=>{const e=[...document.querySelectorAll('#s-modal button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});return e?.id?'#'+e.id:e?.dataset.livingAction?'[data-living-action="'+e.dataset.livingAction+'"]':null})()`,
      );
      if (!s) throw Error(`Missing ${label}`);
      await p.click(s);
    };
    const record = async (label) => {
      checks.push({
        label,
        text: await p.read("document.querySelector('#s-modal').innerText"),
        state: (await p.state()).livingSystems,
        focus: await p.read('document.activeElement?.outerHTML'),
      });
      await p.shot(label);
    };
    await p.click('#v-mobile-more');
    await p.click('#v-more-field');
    await button('Estates');
    await record('owned-property');
    await p.click('.v-living-row button');
    await record('home');
    await button('Supplies');
    await record('supplies');
    await button('Transfer supplies');
    await record('deposit-one-coin');
    await button('Work');
    await record('work');
    await button('Hire a person');
    await record('hire');
    await button('Work');
    await button('Build station');
    await record('blueprints');
    await button('Home');
    const summary = await p.read(
      "[...document.querySelectorAll('summary')].find(e=>e.textContent.startsWith('Guest keys'))?.outerHTML",
    );
    if (summary) {
      await p.click('.v-living-disclosure summary');
      await p.fill('input[name=guest]', '22222222-2222-4222-8222-222222222222');
      await record('guest-draft');
      await button('Give guest key');
      await record('guest-granted');
    }
    await button('Close');
    await p.click('[data-travel=lock]');
    await delay(350);
    let travel = (await p.state()).travel;
    checks.push({ label: 'obstruction-cancels-lock', travel });
    await p.shot('obstructed-lock');
    if (travel.state !== 'idle' || travel.reason !== 'obstruction')
      throw Error('Closed-door obstruction failed to cancel lock');
    const stick = await p.read(
      "(()=>{const r=document.querySelector('.v-joystick-surface').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    await p.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...stick, id: 1 }],
    });
    await p.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: stick.x + 35, y: stick.y, id: 1 }],
    });
    await delay(250);
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.click('[data-travel=lock]');
    await delay(100);
    travel = (await p.state()).travel;
    checks.push({ label: 'clear-ground-lock', travel });
    await p.shot('walk-lock');
    if (travel.state === 'locked') {
      await p.click('[data-travel=stop]');
      checks.push({ label: 'stop', travel: (await p.state()).travel });
    } else checks.push({ label: 'clear-ground-route-cancelled', travel });
  } catch (e) {
    checks.push({ label: 'failure', error: String(e) });
    if (p) await p.shot('failure');
  } finally {
    results.push({ width, height, checks, errors: h.errors });
    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
    await h.close();
  }
  console.log(JSON.stringify({ width, checks: checks.map((x) => x.label), errors: h.errors }));
}
