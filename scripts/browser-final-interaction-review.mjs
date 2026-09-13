/** Real CDP touch/key input in an owned Chromium workspace; no DOM-dispatched actions. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { browserHarness, delay } from './browser-harness.mjs';
const out =
  process.env.VERSO_BROWSER_OUT ||
  '.dream-loop/living-systems/mobile-systems-review/review-03/interaction';
const fixture = fs.readFileSync(
  process.env.VERSO_BROWSER_FIXTURE || '.dream-loop/living-systems/interaction/npc-fixture.json',
  'utf8',
);
const results = [];
const url = process.env.VERSO_BROWSER_URL || 'http://127.0.0.1:4210/';
for (const [width, height] of process.env.VERSO_BROWSER_SINGLE
  ? [[390, 844]]
  : [
      [390, 844],
      [320, 568],
      [430, 932],
    ]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  try {
    const p = await h.page(`touch-${width}`, url, { width, height, mobile: true });
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('input-fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});sessionStorage.setItem('input-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await p.read(
      `window.inputTrace=[];for(const type of ['pointerdown','pointerup','pointercancel','click','lostpointercapture','keydown','keyup'])window.addEventListener(type,e=>{const t=e.target;window.inputTrace.push({type,pointerId:e.pointerId,key:e.key,detail:e.detail,target:t.id||t.closest?.('[data-choice]')?.dataset.choice||t.closest?.('[data-portrait-action]')?.dataset.portraitAction||t.className,time:performance.now()});},true);`,
    );
    const checks = [];
    const pos = (selector) =>
      p.read(
        `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
      );
    const touch = (type, points = []) =>
      p.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const interact = async () => {
      await p.wait(
        "(()=>{const b=document.querySelector('[data-portrait-action=interact]'),r=b.getBoundingClientRect();return r.width>0&&r.height>0&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()",
        'Interact has visibly returned after closing the previous dialog',
      );
      const a = await pos('[data-portrait-action=interact]');
      await touch('touchStart', [{ ...a, id: 1 }]);
      return a;
    };
    const leave = async () => {
      await p.click('[data-choice=close]');
      assert.equal((await p.state()).dialogue, null);
    };
    const check = (name, data = {}) => checks.push({ name, ...data });
    await p.shot('before');
    await interact();
    await touch('touchEnd');
    assert.ok((await p.state()).dialogue, 'single physical Interact persists');
    await p.shot('one-tap-dialogue');
    check('Interact down/up opens exactly one dialogue', (await p.state()).inputSequences);
    const dragChoice = await pos('[data-choice=close]');
    await touch('touchStart', [{ ...dragChoice, id: 1 }]);
    await touch('touchMove', [{ x: dragChoice.x + 30, y: dragChoice.y, id: 1 }]);
    await touch('touchEnd');
    assert.ok((await p.state()).dialogue, 'dragging a conversation control must not choose');
    check('dragging across a choice cancels activation');
    await leave();

    await interact();
    await touch('touchCancel');
    assert.ok((await p.state()).dialogue, 'cancel cannot activate Leave');
    check('native pointercancel after mount cannot dismiss');
    await leave();

    const a = await interact();
    const close = await pos('[data-choice=close]');
    await touch('touchMove', [{ ...close, id: 1 }]);
    await touch('touchEnd');
    assert.ok((await p.state()).dialogue, 'release over new Leave cannot activate it');
    check('drag release onto replacement Leave does not activate it', { start: a, end: close });
    await leave();

    await p.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (let i = 0; i < 12; i++) {
      await interact();
      await touch('touchEnd');
      assert.ok((await p.state()).dialogue);
      await leave();
    }
    await p.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('12 rapid open/close pairs at4× CPU throttle remain deterministic');

    const attack = await pos('[data-portrait-action=attack]');
    const it = await pos('[data-portrait-action=interact]');
    await touch('touchStart', [{ ...attack, id: 1 }]);
    await touch('touchStart', [
      { ...attack, id: 1 },
      { ...it, id: 2 },
    ]);
    assert.ok((await p.state()).dialogue);
    assert.equal((await p.state()).portraitControls.heldActions, 0);
    await touch('touchEnd');
    check('second thumb opens overlay and cancels held attack');
    await leave();

    for (let n = 0; n < 60; n++) {
      if (await p.read("document.activeElement?.dataset.portraitAction==='interact'")) break;
      await p.key('Tab', 'Tab', 9);
    }
    assert.equal(await p.read('document.activeElement?.dataset.portraitAction'), 'interact');
    await p.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
    });
    await delay(120);
    assert.ok((await p.state()).dialogue);
    await p.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await delay(50);
    assert.ok((await p.state()).dialogue);
    check('held Enter across focus/DOM replacement does not activate close');
    await p.key('Enter', 'Enter', 13);
    assert.equal((await p.state()).dialogue, null, 'fresh keyboard activation closes once');
    check('fresh Enter activates the newly focused close button');
    await interact();
    await touch('touchEnd');
    await p.click('#s-dialogue-close');
    assert.equal((await p.state()).dialogue, null);
    check('fresh native close control remains actionable after repeated dialogue replacement');

    const talk = await pos('#v-ptt');
    await touch('touchStart', [{ ...talk, id: 1 }]);
    await touch('touchEnd');
    assert.equal((await p.state()).modal, 'voice');
    assert.equal((await p.state()).voice.microphone, false);
    await p.shot('ptt-setup');
    check('PTT touch opens setup once without requesting microphone');
    const report = {
      width,
      height,
      checks,
      trace: await p.read('window.inputTrace'),
      diagnostics: (await p.state()).inputSequences,
      errors: h.errors,
    };
    results.push(report);
    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
    assert.deepEqual(h.errors, []);
    console.log(
      JSON.stringify({
        width,
        checks: checks.length,
        rejected: report.diagnostics?.rejected,
        errors: h.errors.length,
      }),
    );
  } catch (error) {
    const p = h.clients.at(-1);
    fs.writeFileSync(
      `${out}/failure-${width}.json`,
      JSON.stringify(
        {
          error: String(error),
          trace: await p?.read('window.inputTrace'),
          state: await p?.state().catch(() => null),
          errors: h.errors,
        },
        null,
        2,
      ),
    );
    if (p) await p.shot('failure');
    throw error;
  } finally {
    await h.close();
  }
}
