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

// Supply only an agent-workspace-verified endpoint; this never launches a browser.
test(
  'native portrait controls, landscape gate and direction fallback remain reachable',
  { skip: !process.env.VERSO_BROWSER_CDP, timeout: 180000 },
  async () => {
    const { verifyPortraitMobile } = await import('../scripts/browser-portrait-mobile.mjs');
    await verifyPortraitMobile({
      endpoint: process.env.VERSO_BROWSER_CDP,
      url: process.env.VERSO_BROWSER_URL || 'http://localhost:4197/',
      out: '.dream-loop/portrait-expansion/responsive-test',
    });
  },
);
