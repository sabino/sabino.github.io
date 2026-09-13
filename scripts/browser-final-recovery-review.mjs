/** Native defeat/recovery from an explicitly prepared, normal-health boss scenario. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { browserHarness, delay } from './browser-harness.mjs';

const out =
  process.env.VERSO_BROWSER_OUT ||
  '.dream-loop/living-systems/mobile-systems-review/review-03/recovery';
const url = process.env.VERSO_BROWSER_URL || 'http://127.0.0.1:4210/';
const fixture = fs.readFileSync(
  '.dream-loop/living-systems/underworld-browser/encounter-2.json',
  'utf8',
);
const owner = '11111111-1111-4111-8111-111111111111';
const results = [];
for (const [width, height] of [
  [320, 568],
  [390, 844],
]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  let p;
  const checks = [];
  try {
    p = await h.page(`defeat-${width}`, url, { width, height, mobile: true });
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('recovery-fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(fixture)});localStorage.setItem('verso-room-v1:identity',JSON.stringify(${JSON.stringify(owner)}));sessionStorage.setItem('recovery-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    const before = await p.state();
    assert.equal(before.player.hp, before.player.maxHp);
    assert.equal(before.livingSystems.underground.depth, 2);
    const coins = before.livingSystems.economy.satchel.coins;
    await p.shot('normal-health-encounter');
    await p.click('[data-portrait-action="technique-1"]');
    assert.ok((await p.state()).player.attackCooldown > 0, 'Accepted guard raises its cooldown');
    checks.push({
      name: 'Native Guard is accepted by underground combat',
      cooldown: (await p.state()).player.attackCooldown,
    });
    await delay(650);
    await p.click('.v-touch-dodge');
    assert.ok((await p.state()).dodgeCooldown > 0, 'Accepted Step raises its cooldown');
    checks.push({
      name: 'Native Step is accepted by underground combat',
      cooldown: (await p.state()).dodgeCooldown,
    });
    // Move into reach and allow the actual encounter AI to defeat this life.
    await p.key('ArrowRight', 'ArrowRight', 39, 650);
    await p.wait(
      "window.stichos.state.phase==='lost'&&document.querySelector('#s-return-life')",
      'Native enemy attacks cause defeat',
      30000,
    );
    const lost = await p.state();
    assert.equal(lost.player.hp, 0);
    assert.equal(lost.modal, 'lost');
    const layout = await p.read(
      "(()=>{const b=document.querySelector('#s-return-life'),r=b.getBoundingClientRect();return{text:document.querySelector('#s-modal').innerText,overflow:document.documentElement.scrollWidth>innerWidth,button:{x:r.x,y:r.y,w:r.width,h:r.height},focus:document.activeElement?.id}})()",
    );
    assert.equal(layout.overflow, false);
    assert.ok(layout.button.h >= 43.5 && layout.button.w >= 43.5);
    assert.ok(layout.button.y >= 0 && layout.button.y + layout.button.h <= height);
    assert.match(layout.text, /one fifth/i);
    checks.push({
      name: 'Actual enemy attacks defeat a normal-health life; recall is visible',
      beforeHp: before.player.hp,
      lostHp: lost.player.hp,
      layout,
    });
    await p.shot('actual-defeat-recall');
    await p.click('#s-return-life');
    await p.wait(
      "window.stichos.state.livingSystems.location.spaceId==='surface'&&window.stichos.state.phase==='playing'&&window.stichos.state.modal===''",
    );
    const after = await p.state();
    assert.ok(after.player.hp > 0);
    assert.equal(after.livingSystems.economy.satchel.coins, coins - Math.ceil(coins * 0.2));
    assert.equal(after.inputSequences.active, 0);
    checks.push({
      name: 'One native recall restores this life on the surface and debits one fifth once',
      beforeCoins: coins,
      afterCoins: after.livingSystems.economy.satchel.coins,
      hp: after.player.hp,
      location: after.livingSystems.location,
      input: after.inputSequences,
    });
    await p.shot('recalled-and-restored');
    await delay(400);
    assert.equal(
      (await p.state()).livingSystems.economy.satchel.coins,
      after.livingSystems.economy.satchel.coins,
    );
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
    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
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
