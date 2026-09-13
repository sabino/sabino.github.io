/** Independent native touch QA against a copied working-tree build; no runtime game mutation. */
import fs from 'node:fs';
import { browserHarness, delay } from './browser-harness.mjs';
const out = process.env.VERSO_BROWSER_OUT || '.dream-loop/living-systems/mobile-systems-review';
const fixture = fs.readFileSync(`${out}/npc-fixture.json`, 'utf8');
const results = [];
for (const [width, height, mobile] of [
  [320, 568, true],
  [390, 844, true],
  [430, 932, true],
  [1280, 900, false],
]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  const checks = [];
  try {
    const p = await h.page(
      `systems-${width}`,
      process.env.VERSO_BROWSER_URL || 'http://127.0.0.1:4230/',
      { width, height, mobile },
    );
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('systems-fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});sessionStorage.setItem('systems-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await delay(1200);
    const shot = (label) => p.shot(label);
    const labelled = async (label) => {
      const sel = await p.read(
        `(()=>{const e=[...document.querySelectorAll('#s-modal button')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!e)return null;if(e.id)return '#'+e.id;if(e.dataset.livingAction)return '[data-living-action="'+e.dataset.livingAction+'"]';return null;})()`,
      );
      if (!sel) throw Error(`Button ${label} absent`);
      await p.click(sel);
    };
    const inspect = async (label) => {
      const layout = await p.read(
        `(()=>{let modal=document.querySelector('#s-modal');return {text:modal?.innerText,focus:document.activeElement?.outerHTML?.slice(0,300),state:window.stichos.state.livingSystems,modal:window.stichos.state.modal,overflow:document.documentElement.scrollWidth>innerWidth,windows:modal.querySelectorAll('.s-window').length,missingNames:[...modal.querySelectorAll('[aria-labelledby]')].filter(e=>e.getAttribute('aria-labelledby').split(' ').some(id=>!document.getElementById(id))).map(e=>e.outerHTML.slice(0,200)),controls:[...modal.querySelectorAll('button,input,select,summary')].map(e=>{let r=e.getBoundingClientRect();return {text:e.textContent.trim(),disabled:e.disabled,x:r.x,y:r.y,w:r.width,h:r.height,visible:!!e.getClientRects().length}})};})()`,
      );
      checks.push({ label, ...layout });
      await shot(label);
    };
    await shot('exploration');
    await p.click(mobile ? '#v-mobile-more' : '#s-pause');
    await inspect('more');
    await p.click(mobile ? '#v-more-field' : '#v-menu-field');
    await inspect('field-nearby');
    await labelled('Satchel');
    await inspect('field-satchel');
    await labelled('Craft');
    await inspect('field-craft');
    await p.click('.v-living-row button');
    await inspect('field-recipe');
    await labelled('Craft one');
    await inspect('field-craft-result');
    await labelled('Field');
    await labelled('Underworld');
    await inspect('underworld');
    await labelled('Charters');
    await inspect('charters');
    const read = await p.read(
      "document.querySelector('.v-living-row button')?.dataset.livingAction",
    );
    if (read) {
      await p.click(`[data-living-action="${read}"]`);
      await inspect('charter-detail');
    }
    await labelled('Estates');
    await inspect('estates');
    const estate = await p.read(
      "document.querySelector('.v-living-row button')?.dataset.livingAction",
    );
    if (estate) {
      await p.click(`[data-living-action="${estate}"]`);
      await inspect('estate-detail');
    }
    await labelled('Signs');
    await inspect('signs');
    const sign = await p.read(
      "document.querySelector('.v-living-row button')?.dataset.livingAction",
    );
    if (sign) {
      await p.click(`[data-living-action="${sign}"]`);
      await inspect('sign-detail');
    }
    await labelled('Close');
    checks.push({
      label: 'close-focus',
      state: (await p.state()).modal,
      focus: await p.read('document.activeElement?.outerHTML'),
    });
    await p.click('#v-ptt');
    await inspect('voice-setup');
    checks.push({
      label: 'microphone-remains-unconsented',
      microphone: (await p.state()).voice.microphone,
    });
    results.push({ width, height, mobile, checks, errors: h.errors });
  } catch (error) {
    results.push({ width, height, mobile, checks, error: String(error), errors: h.errors });
    const p = h.clients.at(-1);
    if (p) await p.shot('failure');
  } finally {
    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
    await h.close();
  }
  console.log(
    JSON.stringify({
      width,
      checks: checks.map((x) => x.label),
      error: results.at(-1).error,
      errors: h.errors.length,
    }),
  );
}
