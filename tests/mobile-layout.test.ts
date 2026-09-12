import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportLayout } from '../src/stichos/mobile-viewport.ts';
import { detectAppMode } from '../src/app-mode.ts';
test('keyboard visual viewport retains its visible height and compacts only text entry', () => {
  const layout = viewportLayout({
    width: 390,
    height: 844,
    visualHeight: 390,
    visualTop: 23,
    editing: true,
    coarse: true,
  });
  assert.equal(layout.height, 390);
  assert.equal(layout.top, 23);
  assert.equal(layout.compactInput, true);
  assert.equal(layout.keyboardLikely, true);
  assert.equal(
    viewportLayout({ width: 390, height: 844, visualHeight: 760, editing: false, coarse: true })
      .keyboardLikely,
    false,
  );
});
test('browser chrome, desktop, orientation and pinch zoom are not treated as a keyboard', () => {
  assert.equal(
    viewportLayout({ width: 1200, height: 800, visualHeight: 400, editing: true, coarse: false })
      .compactInput,
    false,
  );
  const zoom = viewportLayout({
    width: 390,
    height: 844,
    visualHeight: 400,
    scale: 2,
    editing: false,
    coarse: true,
  });
  assert.equal(zoom.height, 844);
  assert.equal(zoom.keyboardLikely, false);
  assert.equal(
    viewportLayout({ width: 844, height: 390, editing: false, coarse: true }).landscape,
    true,
  );
});
test('all installed display modes and iOS standalone are detected without claiming browser install state', () => {
  for (const mode of ['standalone', 'minimal-ui', 'window-controls-overlay'])
    assert.equal(detectAppMode({ matches: (q) => q.includes(mode) }).installedWindow, true);
  assert.equal(detectAppMode({ matches: () => false, iosStandalone: true }).installedWindow, true);
  const browser = detectAppMode({
    matches: () => false,
    launchQueueSupported: true,
    launchObserved: true,
    installObserved: true,
  });
  assert.equal(browser.installedWindow, false);
  assert.equal(browser.launchObserved, true);
  assert.match(browser.label, /unknown/);
  assert.equal(detectAppMode({ matches: (q) => q.includes('fullscreen') }).installedWindow, false);
});

// A real CSS cascade regression: 761–899px previously inherited display:none
// from the desktop sheet even though the mobile sheet supplied pad dimensions.
// Supply only a workspace_browser_targets-verified endpoint; no browser is launched.
test(
  'native tablet controls stay visible, reachable and correctly arranged across mobile breakpoints',
  { skip: !process.env.VERSO_BROWSER_CDP, timeout: 90000 },
  async () => {
    const { browserHarness, chooseLife } = await import('../scripts/browser-harness.mjs');
    const harness = await browserHarness(
      process.env.VERSO_BROWSER_CDP,
      '.dream-loop/mobile-mic-realistic-audio/responsive-test',
    );
    try {
      const page = await harness.page(
        'controls',
        process.env.VERSO_BROWSER_URL || 'http://localhost:4193/',
        {
          width: 768,
          height: 1024,
          mobile: true,
        },
      );
      await chooseLife(page, 'Tablet controls QA', '8', true);
      for (const [width, height] of [
        [768, 1024],
        [390, 844],
        [844, 390],
        [899, 1024],
        [900, 1024],
      ]) {
        await page.resize(width, height);
        const controls = await page.read(`(() => {
          const pad = document.querySelector('.s-mobile-move');
          return {
            coarse: matchMedia('(pointer: coarse)').matches,
            display: getComputedStyle(pad).display,
            worldWidth: document.querySelector('.s-world-wrap').getBoundingClientRect().width,
            buttons: [...pad.querySelectorAll('button')].map(e => {
              const r = e.getBoundingClientRect(), style = getComputedStyle(e);
              return { action: e.dataset.move, x: r.x, y: r.y, width: r.width, height: r.height,
                column: style.gridColumnStart, row: style.gridRowStart,
                reachable: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
                covering: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 200) };
            })
          };
        })()`);
        await page.shot(`${width}x${height}`);
        assert.equal(controls.coarse, true, `${width}: touch emulation is active`);
        assert.equal(controls.display, 'grid', `${width}: movement pad is displayed`);
        assert.ok(
          controls.worldWidth > width * 0.45,
          `${width}: sidebar cannot consume the world viewport`,
        );
        assert.equal(controls.buttons.length, 5);
        for (const button of controls.buttons) {
          assert.ok(
            button.width >= 44 && button.height >= 44,
            `${width}: ${button.action} touch target`,
          );
          assert.ok(
            button.x >= 0 &&
              button.y >= 0 &&
              button.x + button.width <= width &&
              button.y + button.height <= height,
            `${width}: ${button.action} remains inside viewport`,
          );
          assert.equal(
            button.reachable,
            true,
            `${width}: ${button.action} is not covered by ${button.covering}`,
          );
        }
        const byAction = Object.fromEntries(controls.buttons.map((b) => [b.action, b]));
        assert.equal(byAction.w.column, '2');
        assert.equal(byAction.a.column, '1');
        assert.equal(byAction.s.column, '2');
        assert.equal(byAction.d.column, '3');
        assert.equal(byAction.shift.column, '3');
        assert.equal(byAction.shift.row, '1');
        assert.ok(
          byAction.w.y < byAction.s.y && byAction.a.x < byAction.s.x && byAction.s.x < byAction.d.x,
        );
      }
      assert.deepEqual(harness.errors, []);
    } finally {
      await harness.close();
    }
  },
);
