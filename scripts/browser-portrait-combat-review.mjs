/** Actual browser combat from validated test-only saves, controlled by native touch. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { browserHarness, delay } from './browser-harness.mjs';
const out = process.env.VERSO_BROWSER_OUT || '.dream-loop/portrait-action-expansion/review-mobile';
const url = process.env.VERSO_BROWSER_URL || 'http://localhost:4199/';
const harness = await browserHarness(process.env.VERSO_BROWSER_CDP, `${out}/combat`);
const manifest = JSON.parse(fs.readFileSync(`${out}/fixtures/manifest.json`, 'utf8'));
const evidence = {
  conditions: {
    browser: 'workspace Chromium, GPU disabled by saved profile',
    viewport: '390×844, touch emulation, DPR1',
    fixture: 'Node-authored existing save schema; actual accepted simulation thereafter',
    metrics:
      'native RAF interval + CDP Performance counters + bounded feedback diagnostics; screenshots outside measured interval',
  },
  encounters: [],
  errors: [],
};
const percentile = (xs, p) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
try {
  for (const fixture of [
    ...manifest,
    { ...manifest.find((f) => f.kind === 'garden'), kind: 'garden-reduced', reducedMotion: true },
  ]) {
    const page = await harness.page(fixture.kind, url, { width: 390, height: 844, mobile: true });
    if (fixture.reducedMotion)
      await page.cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
    const save = fs.readFileSync(fixture.path, 'utf8');
    await page.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(location.protocol==='http:'&&!sessionStorage.getItem('verso.qa.fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(save)});sessionStorage.setItem('verso.qa.fixture','1');}`,
    });
    await page.cdp.send('Page.reload');
    await delay(600);
    await page.wait(
      "window.stichos?.state.modal==='title'&&!!document.querySelector('#s-continue')",
    );
    await page.click('#s-continue');
    await page.wait("window.stichos?.state.modal===''&&window.stichos.state.phase==='playing'");
    await delay(500);
    const before = await page.state();
    const record = {
      kind: fixture.kind,
      fixture,
      before: {
        player: before.player,
        npcs: before.npcs.filter((n) => fixture.enemies.some((e) => e.id === n.id)),
      },
      screenshots: [],
      samples: [],
    };
    evidence.encounters.push(record);
    assert.equal(before.displayAppearance.weapon, fixture.weapon);
    assert.ok(record.before.npcs.length > 0, 'actual encounter spawned');
    record.screenshots.push(await page.shot('approach'));
    await page.click('[data-portrait-action=technique-2]');
    await delay(160);
    record.screenshots.push(await page.shot('charge'));
    await delay(450);
    record.screenshots.push(await page.shot('release'));
    await page.click('[data-portrait-action=technique-1]');
    await delay(220);
    record.screenshots.push(await page.shot('followup'));
    await page.cdp.send('Performance.enable');
    const beforeMetrics = await page.cdp.send('Performance.getMetrics');
    const cpu = fixture.kind === 'relay' ? 4 : 1;
    await page.cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    record.cpuThrottle = cpu;
    const rafPromise = page.read(
      `new Promise(resolve=>{const times=[],longGaps=[];let last=null,start=null;function frame(t){if(start===null)start=t;if(last!==null){const ms=t-last;times.push(ms);if(ms>=500)longGaps.push({ms,visibility:document.visibilityState});}last=t;if(t-start<14000)requestAnimationFrame(frame);else resolve({intervals:times,longGaps,endingVisibility:document.visibilityState});}requestAnimationFrame(frame);})`,
    );
    const rect = await page.read(
      "document.querySelector('[data-portrait-action=attack]').getBoundingClientRect().toJSON()",
    );
    await page.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1 }],
    });
    const stick = await page.read(
      "document.querySelector('.v-joystick-surface').getBoundingClientRect().toJSON()",
    );
    let stickHeld = false;
    const attackPoint = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1 };
    for (let n = 0; n < 42; n++) {
      await delay(320);
      const s = await page.state();
      record.samples.push({
        at: s.time,
        hp: s.player.hp,
        stamina: s.player.stamina,
        phase: s.phase,
        npcs: s.npcs
          .filter((a) => fixture.enemies.some((e) => e.id === a.id))
          .map((a) => ({ id: a.id, hp: a.hp, x: a.x, y: a.y })),
        removed: s.removed.filter((id) => fixture.enemies.some((e) => e.id === id)),
        feedback: s.combatFeedback,
        cues: s.actionCues.map((c) => ({ kind: c.kind, shape: c.shape, text: c.text })),
      });
      if (fixture.weapon !== 'bow') {
        const targets = s.npcs
          .filter((a) => a.hostile && a.hp > 0 && fixture.enemies.some((e) => e.id === a.id))
          .sort(
            (a, b) =>
              Math.hypot(a.x - s.player.x, a.y - s.player.y) -
              Math.hypot(b.x - s.player.x, b.y - s.player.y),
          );
        const target = targets[0],
          dx = target ? target.x - s.player.x : 0,
          dy = target ? target.y - s.player.y : 0,
          d = Math.hypot(dx, dy);
        if (target && d > 1.1) {
          const stickPoint = {
            x: stick.x + stick.width / 2 + (dx / d) * 31,
            y: stick.y + stick.height / 2 + (dy / d) * 31,
            id: 2,
          };
          if (!stickHeld) {
            await page.cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [
                attackPoint,
                { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 2 },
              ],
            });
            stickHeld = true;
          }
          await page.cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [attackPoint, stickPoint],
          });
        } else if (stickHeld) {
          await page.cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [attackPoint],
          });
          stickHeld = false;
        }
      }
      if (n === 18 || n === 30) {
        await page.key('r', 'KeyR', 82);
      }
      if (s.phase !== 'playing') break;
    }
    await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const frameSample = await rafPromise;
    const intervals = frameSample.intervals;
    await page.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const afterMetrics = await page.cdp.send('Performance.getMetrics');
    const metrics = {};
    for (const name of [
      'TaskDuration',
      'ScriptDuration',
      'LayoutDuration',
      'RecalcStyleDuration',
      'JSHeapUsedSize',
    ]) {
      const a = beforeMetrics.metrics.find((m) => m.name === name)?.value || 0,
        b = afterMetrics.metrics.find((m) => m.name === name)?.value || 0;
      metrics[name] = { before: a, after: b, delta: b - a };
    }
    record.performance = {
      frames: intervals.length,
      longGaps: frameSample.longGaps,
      endingVisibility: frameSample.endingVisibility,
      medianMs: percentile(intervals, 0.5),
      p95Ms: percentile(intervals, 0.95),
      p99Ms: percentile(intervals, 0.99),
      maxMs: Math.max(...intervals),
      over50ms: intervals.filter((n) => n > 50).length,
      metrics,
    };
    const after = await page.state();
    record.after = {
      player: after.player,
      phase: after.phase,
      npcs: after.npcs.filter((n) => fixture.enemies.some((e) => e.id === n.id)),
      removed: after.removed.filter((id) => fixture.enemies.some((e) => e.id === id)),
      feedback: after.combatFeedback,
    };
    record.screenshots.push(await page.shot('outcome'));
    const wounded = record.samples.some(
      (s) =>
        s.npcs.some((n) => n.hp < (fixture.enemies.find((e) => e.id === n.id)?.hp ?? 0)) ||
        s.removed.length > 0,
    );
    assert.ok(wounded, `${fixture.kind}: native attacks reach actual enemies`);
    assert.ok(
      record.samples.every((s) => s.feedback.particles <= 144 && s.feedback.cues <= 48),
      'strict live pool bounds',
    );
    if (fixture.reducedMotion)
      assert.ok(
        record.samples.every((s) => s.feedback.reducedMotion && s.feedback.particles === 0),
        'reduced motion leaves no particles during real attacks',
      );
    record.proof = {
      wounded,
      playerHurt: record.samples.some((s) => s.hp < before.player.hp),
      peakParticles: Math.max(...record.samples.map((s) => s.feedback.particles)),
      peakCues: Math.max(...record.samples.map((s) => s.feedback.cues)),
      maxFeedbackUpdateMs: Math.max(...record.samples.map((s) => s.feedback.updateMaxMs)),
    };
    await page.cdp.send('Page.navigate', { url: 'about:blank' });
  }
} catch (error) {
  evidence.failure = { message: String(error), stack: error.stack };
} finally {
  evidence.errors = harness.errors;
  fs.writeFileSync(`${out}/combat/evidence.json`, JSON.stringify(evidence, null, 2));
  await harness.close();
}
console.log(
  JSON.stringify(
    {
      encounters: evidence.encounters.map((e) => ({
        kind: e.kind,
        proof: e.proof,
        performance: e.performance,
      })),
      failure: evidence.failure,
      errors: evidence.errors.length,
    },
    null,
    2,
  ),
);
if (evidence.failure || evidence.errors.length) process.exitCode = 1;
