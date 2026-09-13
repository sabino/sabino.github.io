/** Native workspace-only walking traces, with one active game context at a time. */
import fs from 'node:fs';
import { browserHarness, delay } from './browser-harness.mjs';
const out = process.env.VERSO_BROWSER_OUT || '.dream-loop/living-systems/performance-before';
const fixture = JSON.parse(
  fs.readFileSync(
    process.env.VERSO_BROWSER_FIXTURE || '.dream-loop/living-systems/interaction/fixture.json',
    'utf8',
  ),
);
const url = process.env.VERSO_BROWSER_URL || 'http://127.0.0.1:4208/';
const results = [];
const percentile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)] || 0;
for (const [width, height] of [
  [390, 844],
  [320, 568],
]) {
  const h = await browserHarness(process.env.VERSO_BROWSER_CDP, out);
  try {
    const p = await h.page(`walk-${width}`, url, { width, height, mobile: true });
    await p.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if(!sessionStorage.getItem('profile-fixture')){localStorage.setItem('verso.stichos.v1',${JSON.stringify(JSON.stringify(fixture))});sessionStorage.setItem('profile-fixture','1');}`,
    });
    await p.cdp.send('Page.reload');
    await p.wait("window.stichos?.state.modal==='title'&&document.querySelector('#s-continue')");
    await p.click('#s-continue');
    await p.wait("window.stichos.state.modal===''");
    await delay(500);
    const start = await p.state();
    await p.shot('start');
    const r = await p.read(
      "document.querySelector('.v-joystick-surface').getBoundingClientRect().toJSON()",
    );
    await p.cdp.send('Performance.enable');
    const before = await p.cdp.send('Performance.getMetrics');
    await p.read('window.stichos.startProfile?.()');
    const raf = p.read(
      `new Promise(resolve=>{const times=[],longFrames=[];let last=null,start=null;function frame(t){if(start===null)start=t;if(last!==null){const ms=t-last;times.push(ms);if(ms>33.5)longFrames.push({at:t-start,ms});}last=t;if(t-start<14000)requestAnimationFrame(frame);else resolve({intervals:times,longFrames,visibility:document.visibilityState});}requestAnimationFrame(frame);})`,
    );
    await p.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 - 43, id: 1 }],
    });
    const intervals = await raf;
    const after = await p.cdp.send('Performance.getMetrics');
    await p.read('window.stichos.stopProfile?.()');
    const phases = await p.read('window.stichos.performanceTrace ?? null');
    await p.cdp.send('Profiler.enable');
    await p.cdp.send('Profiler.start');
    await delay(8000);
    const profile = await p.cdp.send('Profiler.stop');
    fs.writeFileSync(`${out}/walk-${width}.cpuprofile`, JSON.stringify(profile.profile));
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const end = await p.state();
    await p.shot('end');
    const report = {
      width,
      height,
      conditions:
        'Workspace Chromium CPU renderer, DPR1, no CPU throttle, one game context; screenshots outside measurement. 14s RAF followed by8s CPU sampling.',
      start: { player: start.player, cache: start.cacheSize, audio: start.audio },
      end: { player: end.player, cache: end.cacheSize, audio: end.audio },
      metrics: { before, after },
      raf: intervals,
      phases,
      summary: {
        frames: intervals.intervals.length,
        p50: percentile(intervals.intervals, 0.5),
        p95: percentile(intervals.intervals, 0.95),
        p99: percentile(intervals.intervals, 0.99),
        max: Math.max(...intervals.intervals),
        over33: intervals.intervals.filter((x) => x > 33.5).length,
        over50: intervals.intervals.filter((x) => x > 50).length,
      },
      errors: h.errors,
    };
    results.push(report);
    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
    console.log(
      JSON.stringify({
        width,
        ...report.summary,
        errors: h.errors.length,
        travel: Math.hypot(end.player.x - start.player.x, end.player.y - start.player.y),
      }),
    );
  } finally {
    await h.close();
  }
}
