/** Two real browser lives against an ephemeral local authority; never uses production. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readBuildMetadata } from './build-metadata.mjs';
import { createCoopServer } from '../server/coop.mjs';
import { browserHarness, delay } from './browser-harness.mjs';
const endpoint = process.env.VERSO_BROWSER_CDP,
  url = process.env.VERSO_BROWSER_URL || 'http://localhost:4211/';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw Error('Local frontend required.');
const out = '.dream-loop/living-systems/compiled-multiplayer',
  checks = [];
fs.mkdirSync(out, { recursive: true });
const build = readBuildMetadata();
assert.equal(build.modified, false, 'Build QA must start from the committed source');
const coop = createCoopServer({
  persistenceDirectory: null,
  allowedOrigins: [new URL(url).origin],
});
const address = await coop.listen(0, '127.0.0.1');
const serverUrl = `ws://127.0.0.1:${address.port}/ws`;
const h = await browserHarness(endpoint, out);
const check = (name, detail) => {
  checks.push({ name, detail });
  console.log(`PASS ${name}`);
};
async function life(name, mobile, reroll) {
  const p = await h.page(name, url, {
    width: mobile ? 390 : 1280,
    height: mobile ? 844 : 900,
    mobile,
  });
  await p.click('#v-title-announcements');
  const label = await p.read("document.querySelector('.v-news-installed code').textContent");
  assert.ok(label.includes(build.revision.slice(0, 12)));
  assert.ok(!label.includes('local changes'));
  await p.click('#v-news-return');
  await p.fill('#s-seed-input', '8');
  await p.click('#s-start button[type=submit]');
  await p.wait("window.stichos.state.modal==='creation'");
  if (reroll) await p.click('#v-reroll');
  if (mobile) await p.click('[data-creation-page=look]');
  await p.fill('#v-create-name', name);
  await p.key('Tab', 'Tab', 9);
  await p.click('#v-accept-life');
  await p.wait('window.stichos.state.transfer');
  await p.click('#s-skip');
  await p.wait("window.stichos.state.modal===''&&!window.stichos.state.transfer");
  assert.equal(
    (await p.state()).multiplayer.status,
    'offline',
    'No automatic production connection',
  );
  return p;
}
async function join(p, code = '') {
  await p.click('#s-together');
  await p.click('.v-room-mode summary');
  await p.fill('#s-room-server', serverUrl);
  await p.fill('#s-room-name', p.name);
  await p.fill('#s-room-code', code);
  await p.click('#s-room-form button[type=submit]');
  await p.wait(
    "window.stichos.state.multiplayer.status==='online'",
    'authenticated local room',
    30000,
  );
  const state = await p.state();
  await p.click('#s-room-return');
  return state.multiplayer.room;
}
try {
  const a = await life('Local desktop traveler', false, false),
    b = await life('Local phone traveler', true, true);
  const room = await join(a);
  assert.equal(await join(b, room), room);
  await a.wait('window.stichos.state.multiplayer.peers.length===1');
  await b.wait('window.stichos.state.multiplayer.peers.length===1');
  const members = [...coop.hub.rooms.values()][0]?.members;
  assert.equal(members?.size, 2);
  assert.equal(
    new Set([...members.values()].map((m) => m.domainBodyId)).size,
    2,
    'Distinct admitted bodies',
  );
  check('Two independently created lives join one local room by code', { peers: members.size });
  const before = (await a.state()).player;
  let after = before;
  for (const [key, code, keyCode] of [
    ['s', 'KeyS', 83],
    ['d', 'KeyD', 68],
    ['w', 'KeyW', 87],
    ['a', 'KeyA', 65],
  ]) {
    await a.key(key, code, keyCode, 550);
    await delay(300);
    after = (await a.state()).player;
    if (Math.hypot(after.x - before.x, after.y - before.y) > 0.3) break;
  }
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.3, 'actual keyboard movement');
  await b.wait(
    `(()=>{const p=window.stichos.state.multiplayer.peers[0];return p&&Math.hypot(p.x-${after.x},p.y-${after.y})<.65})()`,
  );
  check('Accepted ordinary movement reaches the other browser', {
    from: { x: before.x, y: before.y },
    to: { x: after.x, y: after.y },
  });
  await a.shot('shared-exploration');
  await b.shot('shared-portrait');
  await a.click('#s-pause');
  await a.click('#v-menu-field');
  await a.wait(
    "document.querySelector('.v-living-panel')||document.querySelector('[role=tablist]')",
  );
  const state = await a.state();
  assert.ok(state.livingSystems.economy.satchel.actorId);
  assert.equal(state.livingSystems.version, 1);
  await a.shot('authoritative-field-satchel');
  check('Compiled client receives and presents authority-owned field state', {
    coins: state.livingSystems.economy.satchel.coins,
  });
  await a.key('Escape', 'Escape', 27);
  await a.click('#s-together');
  await a.click('#v-room-voice');
  await a.shot('connected-listen-only-controls');
  check('Voice settings remain reachable without microphone consent');
  await a.key('Escape', 'Escape', 27);
  await b.click('#s-together');
  await b.click('#s-room-leave');
  await a.wait('window.stichos.state.multiplayer.peers.length===0');
  check('Native room leave removes the peer and retains gameplay');
  assert.equal(h.errors.length, 0, JSON.stringify(h.errors));
  fs.writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ checks, errors: h.errors, server: 'ephemeral loopback only', build }, null, 2),
  );
} catch (error) {
  fs.writeFileSync(
    `${out}/failure.json`,
    JSON.stringify({ message: String(error), checks, errors: h.errors }, null, 2),
  );
  throw error;
} finally {
  await h.close();
  await coop.close();
}
