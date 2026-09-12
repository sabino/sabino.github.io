/** Synthetic microphone end-to-end proof. Requires a verified workspace browser launched
 * with --use-fake-device-for-media-stream. No microphone bytes are written to evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserHarness, chooseLife, delay } from './browser-harness.mjs';
import { InfiniteWorld } from '../src/stichos/world.ts';
const endpoint = process.argv[2],
  url = process.argv[3] || 'http://localhost:4183/';
const out = process.env.VOICE_QA_OUT || '.dream-loop/voice-integration';
const harness = await browserHarness(endpoint, out);
const results = [];
const pass = (name, detail) => {
  results.push({ name, detail });
  console.log(`PASS ${name}: ${JSON.stringify(detail)}`);
};
let failure;
try {
  const host = await harness.page('speaker', url);
  await chooseLife(host, 'Aster Voice', '8');
  await host.click('#s-together');
  // Production assets default to the public node. Exercise only our local QA node.
  if (
    (await host.read("document.querySelector('#s-room-server').value")) !== 'ws://localhost:4185/ws'
  ) {
    await host.click('.v-room-mode summary');
    await host.fill('#s-room-server', 'ws://localhost:4185/ws');
    await host.key('Tab', 'Tab', 9);
  }
  await host.click('#s-room-form button[type=submit]');
  await host.wait("window.stichos.state.multiplayer.status==='online'", 'host connected', 30000);
  await host.wait("!!document.querySelector('#s-room-invitation')", 'invitation');
  const link = await host.read("document.querySelector('#s-room-invitation').value");
  await host.click('#s-room-return');
  const listener = await harness.page('listener-phone', link, {
    width: 390,
    height: 844,
    mobile: true,
  });
  await listener.click('#v-join-invite');
  await listener.wait("window.stichos.state.modal==='creation'", 'invited creation', 30000);
  // Select a nearby life through the actual reroll control. Fresh lives legitimately
  // start in different towns; a room invitation does not teleport them together.
  const hostPosition = (await host.state()).player;
  const world = new InfiniteWorld(8, 4);
  const neighbors = world
    .settlementsAround(0, 0, 340)
    .flatMap((t) => world.npcsAround(t.x, t.y, t.radius + 6))
    .filter((n) => Math.hypot(n.x - hostPosition.x, n.y - hostPosition.y) < 10 && !n.hostile);
  let nearby = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    const name = await listener.read("document.querySelector('#v-life-facts h3').textContent");
    if (neighbors.some((n) => n.name === name)) {
      nearby = true;
      break;
    }
    await listener.click('#v-reroll');
  }
  assert.ok(nearby, 'a nearby resident was selected with native reroll inputs');
  await listener.click('[data-creation-page=look]');
  await listener.fill('#v-create-name', 'Beryl Listener');
  await listener.key('Tab', 'Tab', 9);
  await listener.click('#v-accept-life');
  await listener.wait('window.stichos.state.transfer', 'arrival');
  await listener.click('#s-skip');
  await listener.wait(
    "window.stichos.state.multiplayer.status==='online' && !window.stichos.state.transfer",
    'listener connected',
    30000,
  );
  await host.wait('window.stichos.state.multiplayer.peers.length===1', 'mutual membership');
  pass('shared invitation connects two actual browser lives', {
    room: (await host.state()).multiplayer.room,
  });
  await listener.click('#v-voice-settings');
  await listener.click('#v-listen-consent');
  await listener.wait("window.stichos.state.voice.status==='listening'", 'listen-only');
  assert.equal((await listener.state()).voice.microphone, false);
  await listener.shot('listen-only');
  await listener.click('.s-window-close');
  await host.click('#v-voice-settings');
  await host.click('#v-mic-consent');
  await host.wait(
    "window.stichos.state.voice.status==='ready'",
    'synthetic microphone ready',
    20000,
  );
  await host.shot('mic-ready');
  await host.click('.s-window-close');
  const before = await (await fetch('http://localhost:4185/voice/health')).json();
  await host.focus();
  await host.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
  });
  await host.wait('window.stichos.state.voice.transmitting', 'PTT held');
  await listener.wait(
    'window.stichos.state.voice.speakers.length===1',
    'listener receives encoded audio',
  );
  const talking = await listener.state();
  assert.equal(talking.audio.voiceDucked, true);
  const shot = await listener.cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(out, 'listener-phone-hearing.png'), Buffer.from(shot.data, 'base64'));
  await delay(1200);
  await host.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
  });
  await listener.wait('window.stichos.state.voice.speakers.length===0', 'speech ends');
  await listener.wait('!window.stichos.state.audio.voiceDucked', 'ducking released');
  const after = await (await fetch('http://localhost:4185/voice/health')).json();
  pass('native PTT sends synthetic encoded speech, listen-only receives and game sound ducks', {
    before,
    after,
  });
  assert.ok(after.frames > before.frames);
  assert.ok(after.forwarded > before.forwarded);
  await listener.click('#v-voice-settings');
  const peer = (await listener.state()).multiplayer.peers[0].id;
  await listener.click(`[data-voice-peer="${peer}"] [data-peer-setting=blocked]`);
  await listener.shot('blocked-peer');
  await listener.click('.s-window-close');
  await host.key('v', 'KeyV', 86, 600);
  assert.deepEqual((await listener.state()).voice.speakers, []);
  pass('per-player block prevents audio delivery', { blocked: true });
  await host.click('#v-voice-settings');
  await host.click('#v-mic-consent');
  assert.equal((await host.state()).voice.microphone, false);
  await host.click('.s-window-close');
  await host.key('v', 'KeyV', 86, 200);
  assert.equal((await host.state()).voice.transmitting, false);
  if ((await host.state()).modal === 'voice') await host.click('.s-window-close');
  pass('microphone off cannot transmit from PTT', { microphone: false });
  if (await host.read("document.querySelector('.s-shell').classList.contains('v-chat-collapsed')"))
    await host.click('#v-chat-toggle');
  await host.fill('#v-chat-input', '/room Audio check complete.');
  await host.key('Enter', 'Enter', 13);
  await listener.wait(
    "document.querySelector('#v-chat-log').textContent.includes('Audio check complete.')",
    'game chat remains live',
  );
  pass('gameplay /ws remains connected after voice use', {
    peers: (await listener.state()).multiplayer.peers.length,
  });
  assert.deepEqual(harness.errors, []);
} catch (error) {
  failure = error;
  console.error(error);
  for (const client of harness.clients) {
    await client.shot('failure').catch(() => {});
    console.error(client.name, JSON.stringify(await client.state().catch(() => ({}))));
  }
} finally {
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        syntheticMicrophone: true,
        results,
        errors: harness.errors,
        failure: failure?.message,
      },
      null,
      2,
    ),
  );
  await harness.close();
}
if (failure) process.exitCode = 1;
