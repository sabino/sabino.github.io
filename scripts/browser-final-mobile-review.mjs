/** Independent native-input review of current local app. Scenario bootstrap is explicitly labelled. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { browserHarness, delay } from './browser-harness.mjs';
const out =
  process.env.VERSO_BROWSER_OUT || '.dream-loop/living-systems/mobile-systems-review/review-03';
const url = process.env.VERSO_BROWSER_URL || 'http://127.0.0.1:4210/';
const owner = '11111111-1111-4111-8111-111111111111';
fs.mkdirSync(out, { recursive: true });
const results = [];
const allSizes = [
  [320, 568, true],
  [390, 844, true],
  [430, 932, true],
  [1280, 900, false],
];
const sizes = process.env.VERSO_REVIEW_WIDTH
  ? allSizes.filter((s) => s[0] === Number(process.env.VERSO_REVIEW_WIDTH))
  : allSizes;
const selected = process.env.VERSO_REVIEW_CASE;
async function scenario(name, fixture, width, height, mobile, run) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out),
    checks = [];
  let p;
  const record = async (label, detail = {}) => {
    const layout = await p.read(
      `(()=>{const m=document.querySelector('#s-modal');return{modal:window.stichos.state.modal,focus:document.activeElement?.outerHTML.slice(0,300),overflow:document.documentElement.scrollWidth>innerWidth,text:m?.innerText,missingNames:[...document.querySelectorAll('[aria-labelledby]')].filter(e=>e.getClientRects().length&&e.getAttribute('aria-labelledby').split(' ').some(id=>!document.getElementById(id))).map(e=>e.outerHTML.slice(0,160)),smallControls:[...document.querySelectorAll('#s-modal button,#s-modal input,#s-modal select,#s-modal summary,.v-estate-placement button')].filter(e=>e.getClientRects().length&&!e.disabled&&e.getBoundingClientRect().height<43.5).map(e=>({label:e.textContent,h:e.getBoundingClientRect().height}))}})()`,
    );
    const reviewedControls = await p.read(
      "[...document.querySelectorAll('#s-resume,#v-ptt-behavior,#v-input-device')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{id:e.id,width:r.width,height:r.height}})",
    );
    checks.push({ label, ...layout, reviewedControls, ...detail });
    await p.shot(label);
    assert.equal(layout.overflow, false, 'document width overflow');
    assert.deepEqual(layout.missingNames, [], 'ARIA references');
    assert.deepEqual(layout.smallControls, [], 'new controls must be at least 44 px high');
  };
  try {
    p = await h.page(`${name}-${width}`, url, { width, height, mobile });
    const serialized = fs.readFileSync(fixture, 'utf8');
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('final-review-fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(serialized)});localStorage.setItem('verso-room-v1:identity',JSON.stringify(${JSON.stringify(owner)}));sessionStorage.setItem('final-review-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await delay(250);
    const selector = async (label) =>
      p.read(
        `(()=>{const b=[...document.querySelectorAll('#s-modal button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});return b?.id?'#'+b.id:b?.dataset.livingAction?'[data-living-action="'+b.dataset.livingAction+'"]':null})()`,
      );
    const button = async (label) => {
      const s = await selector(label);
      assert.ok(s, `Missing button ${label}`);
      await p.click(s);
    };
    const row = async (title) => {
      const s = await p.read(
        `(()=>{const row=[...document.querySelectorAll('.v-living-row')].find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(title)});const b=row?.querySelector('button');return b?.dataset.livingAction?'[data-living-action="'+b.dataset.livingAction+'"]':null})()`,
      );
      assert.ok(s, `Missing row ${title}`);
      await p.click(s);
    };
    const open = async (section = 'Field') => {
      await p.click(mobile ? '#v-mobile-more' : '#s-pause');
      await p.click(mobile ? '#v-more-field' : '#v-menu-field');
      if (section !== 'Field') await button(section);
    };
    await run({ p, checks, record, button, row, open, selector, mobile });
    assert.deepEqual(h.errors, [], 'browser exceptions or console errors');
    results.push({ name, width, height, mobile, checks, errors: h.errors });
  } catch (error) {
    if (p) await p.shot('failure');
    results.push({
      name,
      width,
      height,
      mobile,
      checks,
      error: String(error),
      state: await p?.state().catch(() => null),
      errors: h.errors,
    });
  } finally {
    fs.writeFileSync(
      `${out}/final-${selected ?? 'all'}-results.json`,
      JSON.stringify(results, null, 2),
    );
    await h.close();
  }
  console.log(
    JSON.stringify({
      name,
      width,
      checks: checks.length,
      error: results.at(-1).error,
      errors: h.errors.length,
    }),
  );
}
for (const [width, height, mobile] of sizes) {
  if (!selected || selected === 'estate')
    await scenario(
      'estate',
      `${out}/estate-fixture.json`,
      width,
      height,
      mobile,
      async ({ p, record, button, row, open }) => {
        const metadata = JSON.parse(fs.readFileSync(`${out}/estate-metadata.json`));
        await open('Estates');
        await record('owned-estate');
        await row(metadata.offer.name);
        await button('Work');
        await button('Build station');
        await record('blueprints');
        const before = (await p.state()).livingSystems;
        await row('Dressing table');
        assert.equal((await p.state()).modal, '');
        await record('placement-awaiting-point');
        assert.equal(
          await p.read("document.querySelector('[data-estate-confirm]').disabled"),
          true,
        );
        const pt = await p.read(
          `(()=>{const s=window.stichos.worldToScreen(${JSON.stringify(metadata.point)}),r=document.querySelector('#s-world').getBoundingClientRect();return{x:s.x+r.x,y:s.y+r.y,hit:document.elementFromPoint(s.x+r.x,s.y+r.y)?.id}})()`,
        );
        assert.equal(
          pt.hit,
          's-world',
          `prepared footprint must be visible and tappable: ${JSON.stringify(pt)}`,
        );
        await p.point(pt.x, pt.y);
        assert.equal(
          await p.read("document.querySelector('[data-estate-confirm]').disabled"),
          false,
        );
        const previewGeometry = await p.read(
          `(()=>{const r=document.querySelector('#s-world').getBoundingClientRect(),a=window.stichos.worldToScreen(${JSON.stringify(metadata.point)}),b=window.stichos.worldToScreen({x:${metadata.point.x}+2,y:${metadata.point.y}+1}),panel=document.querySelector('.v-estate-placement').getBoundingClientRect();const box={x:a.x+r.x,y:a.y+r.y,right:b.x+r.x,bottom:b.y+r.y};return{footprint:box,panel:{x:panel.x,y:panel.y,right:panel.right,bottom:panel.bottom},overlap:Math.max(0,Math.min(box.right,panel.right)-Math.max(box.x,panel.x))*Math.max(0,Math.min(box.bottom,panel.bottom)-Math.max(box.y,panel.y))}})()`,
        );
        await record('preview-no-charge', { previewGeometry });
        assert.equal(
          previewGeometry.overlap,
          0,
          'confirmation card must leave the footprint visible',
        );
        let frame = (await p.state()).livingSystems;
        assert.deepEqual(frame.economy.satchel, before.economy.satchel);
        assert.equal(frame.property.estates[0].stations.length, 0);
        await p.click('[data-estate-cancel]');
        assert.equal(await p.read("document.querySelector('.v-estate-placement').hidden"), true);
        await record('preview-cancelled');
        await open('Estates');
        await row(metadata.offer.name);
        await button('Work');
        await button('Build station');
        await row('Dressing table');
        const next = await p.read(
          `(()=>{const s=window.stichos.worldToScreen(${JSON.stringify(metadata.point)}),r=document.querySelector('#s-world').getBoundingClientRect();return{x:s.x+r.x,y:s.y+r.y}})()`,
        );
        await p.point(next.x, next.y);
        await p.click('[data-estate-confirm]');
        await delay(250);
        frame = (await p.state()).livingSystems;
        assert.equal(
          frame.property.estates[0].stations.length,
          1,
          'native confirm creates one station',
        );
        assert.equal(frame.economy.satchel.coins, before.economy.satchel.coins - 8);
        await record('one-confirmed-station');
        await open('Estates');
        await row(metadata.offer.name);
        await button('Work');
        await row('Dressing table');
        await record('station-details');
        await button('Dismantle station');
        await record('dismantle-confirmation');
        await button('Keep things as they are');
        assert.equal((await p.state()).livingSystems.property.estates[0].stations.length, 1);
        await button('Close');
        await p.click('[data-travel=home]');
        await p.wait(
          "['arrived','unreachable','idle'].includes(window.stichos.state.travel.state)",
          'Home journey ends',
          10000,
        );
        await record('home-route', { travel: (await p.state()).travel });
        assert.equal(
          (await p.state()).travel.state,
          'arrived',
          'Go home reaches the actual entrance',
        );
        if (await p.read("!document.querySelector('[data-travel=stop]').hidden"))
          await p.click('[data-travel=stop]');
        if (mobile) {
          await p.click('#s-mobile-pack');
          await record('inventory');
          const small = await p.read(
            "[...document.querySelectorAll('.s-sidebar button')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width})).filter(e=>e.h<43.5||e.w<43.5)",
          );
          assert.deepEqual(small, [], 'Satchel touch controls meet 44 px');
          assert.equal((await p.state()).portraitControls.heldActions, 0);
          await p.click('#v-pack-close');
        }
      },
    );
  if (!selected || selected === 'contact')
    await scenario(
      'contact',
      `${out}/contact-fixture.json`,
      width,
      height,
      mobile,
      async ({ p, record, button, row, open }) => {
        const metadata = JSON.parse(fs.readFileSync(`${out}/contact-metadata.json`));
        let state = await p.state();
        assert.ok(state.livingSystems.contacts.every((c) => c.npcId !== state.occupiedNpcId));
        assert.ok(state.livingSystems.actors.every((c) => c.id !== state.occupiedNpcId));
        if (!mobile) {
          await p.click('#s-pause');
          await record('desktop-pause-controls');
          await p.click('#s-resume');
        }
        await open('Charters');
        const f = state.livingSystems.factions.find((f) => f.id === metadata.contact.factionId);
        assert.ok(f);
        await row(f.name);
        await record('truthful-contact');
        await button('Ask for the charter');
        await record('charter-discovered');
        state = await p.state();
        assert.ok(
          state.livingSystems.memberships.some((m) => m.factionId === f.id && m.discovered),
        );
        // Navigate the tab strip using an actual keyboard, then close with Escape.
        for (let n = 0; n < 30; n++) {
          if (await p.read("document.activeElement?.getAttribute('role')==='tab'")) break;
          await p.key('Tab', 'Tab', 9);
        }
        assert.equal(await p.read("document.activeElement?.getAttribute('role')"), 'tab');
        await p.key('End', 'End', 35);
        assert.equal(await p.read('document.activeElement?.id'), 'living-tab-signs');
        await record('keyboard-tab-navigation');
        await p.key('Escape', 'Escape', 27);
        assert.equal((await p.state()).modal, '');
        await p.click('#v-ptt');
        await record('ptt-setup');
        assert.equal((await p.state()).voice.microphone, false);
      },
    );
}
for (const depth of [0, 1, 2])
  for (const [width, height, mobile] of sizes.filter((s) => s[0] !== 430)) {
    if (selected && selected !== 'underworld') continue;
    await scenario(
      `floor-${depth + 1}`,
      `.dream-loop/living-systems/underworld-browser/encounter-${depth}.json`,
      width,
      height,
      mobile,
      async ({ p, record, button, open }) => {
        const before = await p.state();
        assert.equal(before.livingSystems.underground.depth, depth);
        await p.shot('encounter');
        if (mobile) {
          await p.key('ArrowRight', 'ArrowRight', 39, 650);
          const bossBefore = (await p.state()).livingSystems.underground.state.enemies.find(
            (e) => e.kind === 'boss',
          );
          await p.shot('within-melee-reach');
          if (depth === 2 && width === 390) {
            const fps = p.read(
              `new Promise(resolve=>{const start=performance.now(), intervals=[];let previous;const frame=t=>{if(previous!==undefined)intervals.push(t-previous);previous=t;if(t-start>=8000)resolve(intervals);else requestAnimationFrame(frame);};requestAnimationFrame(frame);})`,
            );
            const at = await p.read(
              "(()=>{const r=document.querySelector('.v-touch-attack').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()",
            );
            await p.cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [{ ...at, id: 1 }],
            });
            const intervals = await fps;
            await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            const afterHit = await p.state(),
              bossAfter = afterHit.livingSystems.underground.state.enemies.find(
                (e) => e.id === bossBefore.id,
              );
            assert.ok(bossAfter.hp < bossBefore.hp, 'held attack must actually damage boss');
            const ordered = [...intervals].sort((a, b) => a - b);
            await record('landed-attacks-frame-sample', {
              bossBefore,
              bossAfter,
              playerHp: afterHit.player.hp,
              intervals,
              frameCount: intervals.length,
              p95: ordered[Math.floor(ordered.length * 0.95)],
              over335: intervals.filter((n) => n > 33.5).length,
            });
            if (afterHit.phase === 'lost') {
              await p.click('#s-return-life');
              await p.wait("window.stichos.state.livingSystems.location.spaceId==='surface'");
              await record('defeat-recall');
              return;
            }
          } else await p.click('.v-touch-attack');
          await p.click('.v-touch-dodge');
        } else {
          await p.key('f', 'KeyF', 70);
          await p.key(' ', 'Space', 32);
        }
        await open();
        await record('floor-panel');
        assert.match(
          await p.read("document.querySelector('#s-modal').innerText"),
          new RegExp(`Floor ${depth + 1} of 3`),
        );
        const coins = (await p.state()).livingSystems.economy.satchel.coins;
        await button('Recall to entrance');
        await record('recall-confirmation');
        await button('Keep things as they are');
        assert.equal((await p.state()).livingSystems.underground.depth, depth);
        await record('recall-cancelled');
        await button('Recall to entrance');
        await button('Confirm');
        await delay(250);
        const after = await p.state();
        assert.equal(after.livingSystems.location.spaceId, 'surface');
        assert.equal(after.livingSystems.economy.satchel.coins, coins - Math.ceil(coins * 0.2));
        await record('recalled-once');
        assert.equal(after.inputSequences.active, 0);
      },
    );
  }
const failed = results.filter((r) => r.error);
console.log(
  JSON.stringify({
    scenarios: results.length,
    failures: failed.map((r) => ({ name: r.name, width: r.width, error: r.error })),
  }),
);
if (failed.length) process.exitCode = 1;
