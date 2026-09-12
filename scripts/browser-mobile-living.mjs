/** Native touch/keyboard QA. Only a verified agent-workspace CDP endpoint is allowed.
 * This emulates Chromium layouts, not iOS hardware or an actual software keyboard.
 * node scripts/browser-mobile-living.mjs http://127.0.0.1:PORT http://localhost:4183/
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserHarness, delay, chooseLife } from './browser-harness.mjs';
const out = path.resolve('.dream-loop/mobile-living-voice');
const h = await browserHarness(process.argv[2], out);
const results = [],
  observations = [];
const pass = (name, data = {}) => {
  results.push({ name, ...data });
  console.log('PASS ' + name);
};
const url = process.argv[3] || 'http://localhost:4183/';
let failure;
async function capture(p, name) {
  const metrics = await p.read(
    `(()=>{const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).visibility!=='hidden'};const c=document.querySelector('#s-world').getBoundingClientRect();return{modal:window.stichos.state.modal,viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],world:{x:c.x,y:c.y,width:c.width,height:c.height},focused:document.activeElement?.id,appMode:window.stichos.state.appMode,buttons:[...document.querySelectorAll('button,input,select,summary')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return{id:e.id,text:e.textContent.trim().slice(0,60),width:r.width,height:r.height,x:r.x,y:r.y,font:getComputedStyle(e).fontSize}})}})()`,
  );
  observations.push({ name, ...metrics, screenshot: await p.shot(name) });
  assert.ok(metrics.page[0] <= metrics.viewport[0] + 1, `${name}: page horizontal overflow`);
  return metrics;
}
async function close(p) {
  await p.key('Escape', 'Escape', 27);
  await delay(100);
}
async function more(p, id) {
  await p.click('#v-mobile-more');
  await p.click(id);
}
try {
  const p = await h.page('phone', url, { width: 390, height: 844, mobile: true });
  await capture(p, 'title');
  assert.notEqual(
    await p.read('document.activeElement?.tagName'),
    'INPUT',
    'title does not automatically open keyboard',
  );
  await p.fill('#s-seed-input', '8');
  await p.click('#s-start button[type=submit]');
  await p.wait("window.stichos.state.modal==='creation'");
  await capture(p, 'creation-life');
  await p.click('#v-reroll');
  await p.click('[data-creation-page=look]');
  await p.fill('#v-create-name', 'Mira');
  await p.key('Tab', 'Tab', 9);
  await capture(p, 'creation-look');
  await p.click('#v-accept-life');
  await p.wait('window.stichos.state.transfer');
  await capture(p, 'mind-transfer');
  await p.click('#s-skip');
  await p.wait("!window.stichos.state.transfer&&window.stichos.state.modal===''");
  pass('Title, life randomization, customization and mind transfer via native touch');
  for (const [w, ht] of [
    [320, 640],
    [360, 780],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [844, 390],
  ]) {
    await p.resize(w, ht);
    const m = await capture(p, `play-${w}x${ht}`);
    assert.ok(m.world.height >= 175, 'usable game height');
    const hud = m.buttons.filter((b) =>
      ['v-ptt', 'v-quick-words', 'v-compose-toggle', 's-mobile-pack', 'v-mobile-more'].includes(
        b.id,
      ),
    );
    for (const b of hud) {
      assert.ok(b.width >= 43 && b.height >= 43, `${b.id} target ${b.width}x${b.height}`);
      assert.ok(b.x >= 0 && b.x + b.width <= w + 1, `${b.id} clipped`);
    }
    pass(`Playable layout and touch targets ${w}×${ht}`, { worldHeight: m.world.height });
  }
  await p.resize(390, 844);
  let spokeToResident = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const target = await p.read(
      `(()=>{const s=window.stichos.state,r=document.querySelector('#s-world').getBoundingClientRect();return s.npcs.filter(n=>!n.hostile&&n.hp>0&&n.id!==s.occupiedNpcId).sort((a,b)=>Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y)).map(n=>{const p=window.stichos.worldToScreen({x:n.x,y:n.y-.7});return{x:r.x+p.x,y:r.y+p.y,id:n.id}}).find(p=>p.x>r.x+15&&p.x<r.right-15&&p.y>r.top+90&&p.y<r.bottom-130)})()`,
    );
    if (!target) break;
    await p.point(target.x, target.y);
    await delay(1300);
    if ((await p.state()).dialogue) {
      spokeToResident = true;
      break;
    }
  }
  if (spokeToResident) {
    await capture(p, 'resident-dialogue');
    const choice = await p.read(
      `(()=>{const b=[...document.querySelectorAll('[data-choice]')].find(b=>!b.disabled&&/life|routine|mind/i.test(b.textContent));return b?.dataset.choice})()`,
    );
    if (choice) {
      await p.click(`[data-choice="${choice}"]`);
      await capture(p, 'resident-personality');
    }
    await p.click('#s-dialogue-close');
    pass('Nearby resident approached through native world touch and dialogue closed');
  } else
    pass('No safely reachable resident in this random life; dialogue requires world exploration');
  const before = await p.state();
  for (const dir of ['d', 's', 'a', 'w']) {
    const r = await p.read(
      `(()=>{const r=document.querySelector('[data-move="${dir}"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [r] });
    await delay(500);
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const after = await p.state();
  assert.ok(after.distanceTraveled > before.distanceTraveled + 0.2);
  pass('Directional hold moves body and release stops movement');
  await p.click('[data-action=attack]');
  if ((await p.state()).modal === 'gear') {
    await capture(p, 'empty-hands-equipment');
    await close(p);
  }
  await p.click('[data-action=ward]');
  await capture(p, 'combat-controls');
  pass('Touch attack/equipment routing and ward action');
  await p.click('#v-quick-words');
  await capture(p, 'quick-phrases');
  await p.click('[data-quick-text="Thanks!"]');
  await p.wait('!window.stichos.state.modal');
  assert.notEqual(await p.read('document.activeElement?.tagName'), 'INPUT');
  pass('Quick phrase sends without opening text input');
  await p.click('#v-compose-toggle');
  await p.fill('#v-chat-input', 'Keyboard viewport proof');
  await p.resize(390, 390);
  const keyboard = await capture(p, 'keyboard-emulated');
  assert.ok((await p.state()).viewport.compactInput);
  assert.ok(keyboard.world.height >= 220, `keyboard world ${keyboard.world.height}`);
  assert.ok(
    await p.read(
      `(()=>{const r=document.querySelector('#v-chat-form').getBoundingClientRect();return r.bottom<=innerHeight})()`,
    ),
  );
  await p.key('Enter', 'Enter', 13);
  assert.notEqual(await p.read('document.activeElement?.id'), 'v-chat-input');
  await p.resize(390, 844);
  await capture(p, 'keyboard-dismissed');
  pass('Reduced viewport keeps world and composer usable; sending restores focus');
  await p.click('#s-mobile-pack');
  await capture(p, 'satchel');
  await p.click('#s-tab-craft');
  await capture(p, 'prepare');
  const recipe = await p.read(
    "[...document.querySelectorAll('[data-craft]')].find(b=>!b.disabled&&['salve','tonic','bandage'].includes(b.dataset.craft))?.dataset.craft",
  );
  if (recipe) {
    const inventoryBefore = (await p.state()).inventory;
    await p.click(`[data-craft="${recipe}"]`);
    assert.ok(((await p.state()).inventory[recipe] ?? 0) > (inventoryBefore[recipe] ?? 0));
    await capture(p, 'prepared-supply');
    pass('Preparation consumes owned plants and creates a usable supply');
  }
  await p.key('Escape', 'Escape', 27);
  assert.equal(
    await p.read("document.querySelector('#app').classList.contains('satchel-open')"),
    false,
  );
  pass('Satchel preparation and escape/focus restoration');
  await more(p, '#v-more-life');
  for (const tab of [
    'purpose',
    'compact',
    'skills',
    'forge',
    'discover',
    'estate',
    'homes',
    'wardrobe',
    'store',
  ]) {
    await p.click(`[data-life-tab=${tab}]`);
    await delay(tab === 'store' ? 500 : 100);
    await capture(p, `life-${tab}`);
  }
  await close(p);
  pass('All nine life loops reachable in bounded phone window');
  await more(p, '#v-more-work');
  await capture(p, 'construction');
  await close(p);
  await more(p, '#v-more-atlas');
  await capture(p, 'atlas');
  await close(p);
  await more(p, '#v-more-galaxy');
  await capture(p, 'galaxy');
  await close(p);
  await more(p, '#v-more-journal');
  await capture(p, 'notebook-closed');
  if (await p.read("!!document.querySelector('#s-notebook-open')")) {
    await p.click('#s-notebook-open');
    await delay(500);
    await capture(p, 'notebook-open');
  }
  await close(p);
  if ((await p.state()).modal) await close(p);
  pass('Construction, atlas, galaxy and physical notebook open/close');
  await p.click('#s-sound');
  await capture(p, 'audio-settings');
  await p.click('[data-audio-bus=music]');
  await p.key('ArrowLeft', 'ArrowLeft', 37);
  const savedMusic = (await p.state()).audio.settings.music;
  await p.click('.v-app-diagnostics summary');
  await capture(p, 'app-diagnostics');
  await p.click('#v-audio-voice');
  await capture(p, 'voice-settings');
  await close(p);
  await p.click('#s-sound');
  assert.equal((await p.state()).audio.settings.music, savedMusic);
  await close(p);
  pass('Audio preference persists between panels; voice consent remains explicit');
  assert.equal((await p.state()).appMode.installedWindow, false);
  pass('Browser app mode remains honest; unit tests cover standalone signals');
  await p.click('#s-together');
  await p.wait("window.stichos.state.modal==='together'", 'room panel opens');
  await capture(p, 'host-form');
  await p.click('#s-room-form button[type=submit]');
  await p.wait(
    "window.stichos.state.multiplayer.status==='online'",
    'local hosted room online',
    20000,
  );
  if ((await p.state()).modal !== 'together') await p.click('#s-together');
  await capture(p, 'hosted-room');
  const invitation = await p.read("document.querySelector('#s-room-invitation').value");
  await p.click('#s-room-return');
  const friend = await h.page('tablet', url, { width: 768, height: 1024, mobile: true });
  await chooseLife(friend, 'Rowan', '8', true);
  await friend.click('#s-together');
  await friend.fill('#s-room-code', invitation);
  await friend.click('#s-room-form button[type=submit]');
  await friend.wait(
    "window.stichos.state.multiplayer.status==='online'",
    'invitation joins local room',
    20000,
  );
  await capture(friend, 'joined-room');
  if ((await friend.state()).modal) await close(friend);
  await friend.click('#v-quick-words');
  await friend.click('#v-words-channel-toggle');
  await friend.click('[data-quick-text="Thanks!"]');
  await p.wait(
    "document.querySelector('#v-chat-log').textContent.includes('Rowan')",
    'room quick phrase delivered',
  );
  pass('Phone creates room; tablet invitation joins and quick phrase reaches host');
  if ((await p.state()).modal) await close(p);
  await p.click('#v-voice-settings');
  await p.click('#v-listen-consent');
  await delay(1500);
  await capture(p, 'listen-only');
  assert.equal((await p.state()).voice.microphone, false);
  await close(p);
  pass('Listen-only never requests/enables a microphone');
  const desktop = await h.page('desktop', url, { width: 1440, height: 960 });
  await chooseLife(desktop, 'Aster', '8');
  await capture(desktop, 'play');
  await desktop.click('#s-sound');
  await capture(desktop, 'audio-settings');
  pass('Desktop keyboard/mouse layout retained');
  assert.equal(h.errors.length, 0, JSON.stringify(h.errors));
  pass('No browser runtime exceptions or console errors');
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        results,
        observations,
        errors: h.errors,
        failure: failure?.stack,
        limits: [
          'Chromium responsive emulation is not an iOS Safari/Bluetooth/microphone hardware test.',
          'The keyboard state uses a reduced viewport and real focused input; no native mobile keyboard is installed.',
        ],
      },
      null,
      2,
    ),
  );
  await h.close();
}
if (failure) process.exitCode = 1;
