import fs from 'node:fs';
import { browserHarness, delay } from './browser-harness.mjs';
const out = '.dream-loop/living-systems/mobile-systems-review/review-03',
  fixture = fs.readFileSync(`${out}/estate-fixture.json`, 'utf8'),
  metadata = JSON.parse(fs.readFileSync(`${out}/estate-metadata.json`));
const results = [];
for (const [width, height] of [
  [320, 568],
  [390, 844],
]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  try {
    const p = await h.page(`metrics-${width}`, 'http://127.0.0.1:4210/', {
      width,
      height,
      mobile: true,
    });
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});localStorage.setItem('verso-room-v1:identity',JSON.stringify('11111111-1111-4111-8111-111111111111'));`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await p.click('#v-mobile-more');
    await p.click('#v-more-field');
    const clickLabel = async (label) => {
      const sel = await p.read(
        `(()=>{const e=[...document.querySelectorAll('#s-modal button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});return '[data-living-action="'+e.dataset.livingAction+'"]'})()`,
      );
      await p.click(sel);
    };
    const clickRow = async (title) => {
      const sel = await p.read(
        `(()=>{const e=[...document.querySelectorAll('.v-living-row')].find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(title)}).querySelector('button');return '[data-living-action="'+e.dataset.livingAction+'"]'})()`,
      );
      await p.click(sel);
    };
    await clickLabel('Estates');
    await clickRow(metadata.offer.name);
    await clickLabel('Work');
    await clickLabel('Build station');
    await clickRow('Dressing table');
    const pt = await p.read(
      `(()=>{const p=window.stichos.worldToScreen(${JSON.stringify(metadata.point)}),r=document.querySelector('#s-world').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y}})()`,
    );
    await p.point(pt.x, pt.y);
    await p.shot('preview-overlap');
    const placement = await p.read(
      `(()=>{const r=document.querySelector('#s-world').getBoundingClientRect(),a=window.stichos.worldToScreen(${JSON.stringify(metadata.point)}),b=window.stichos.worldToScreen({x:${metadata.point.x}+2,y:${metadata.point.y}+1}),c=document.querySelector('.v-estate-placement').getBoundingClientRect();return{footprint:{x:a.x+r.x,y:a.y+r.y,right:b.x+r.x,bottom:b.y+r.y},panel:{x:c.x,y:c.y,right:c.right,bottom:c.bottom},world:{x:r.x,y:r.y,width:r.width,height:r.height},atPoint:document.elementFromPoint(a.x+r.x,a.y+r.y)?.outerHTML?.slice(0,150)}})()`,
    );
    await p.click('[data-estate-cancel]');
    await p.click('#s-mobile-pack');
    await p.shot('satchel-targets');
    const smallControls = await p.read(
      `(()=>{return [...document.querySelectorAll('.s-sidebar button,.s-sidebar input,.s-sidebar select')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{id:e.id,label:e.getAttribute('aria-label')||e.textContent.trim(),width:r.width,height:r.height}}).filter(e=>e.width<44||e.height<44)})()`,
    );
    results.push({ width, height, placement, smallControls, errors: h.errors });
  } finally {
    await h.close();
  }
}
fs.writeFileSync(`${out}/metrics-before-fix.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
