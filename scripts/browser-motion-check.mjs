/** Contextual-motion Canvas2D asset verification in a disposable Agent Workspace browser context.
 * Pass its verified CDP endpoint and the local Vite origin. No game state is created.
 */
import fs from 'node:fs';
import path from 'node:path';

const endpoint = process.argv[2];
const origin = process.argv[3] ?? 'http://127.0.0.1:4173';
for (const address of [endpoint, origin])
  if (!address || !['127.0.0.1', 'localhost'].includes(new URL(address).hostname))
    throw new Error('Use verified workspace CDP and local app loopback URLs.');

async function connect(url) {
  const ws = new WebSocket(url); // No Origin header: workspace-owned DevTools only.
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data),
      callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    message.error ? callback.reject(message.error) : callback.resolve(message.result);
  };
  return {
    ws,
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const next = ++id;
        pending.set(next, { resolve, reject });
        ws.send(JSON.stringify({ id: next, method, params }));
      }),
  };
}

const version = await (await fetch(`${endpoint}/json/version`)).json();
const browser = await connect(version.webSocketDebuggerUrl);
let context, page;
try {
  context = (await browser.send('Target.createBrowserContext')).browserContextId;
  const { targetId } = await browser.send('Target.createTarget', {
    url: new URL('/src/stichos/art.ts', origin).href,
    browserContextId: context,
  });
  const target = (await (await fetch(`${endpoint}/json/list`)).json()).find(
    (t) => t.id === targetId,
  );
  page = await connect(target.webSocketDebuggerUrl);
  await page.send('Runtime.enable');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(${async function verify() {
      const { drawHumanoid, humanoidDirection } = await import('/src/stichos/art.ts');
      const { appearance } = await import('/src/stichos/world.ts');
      const { actionMotion } = await import('/src/stichos/actor-motion.ts');
      const assert = (ok, message) => {
        if (!ok) throw Error(message);
      };
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 80;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const kinds = ['gather', 'craft', 'ward', 'heal', 'hurt'];
      const render = (look, heading, action) => {
        ctx.clearRect(0, 0, 96, 80);
        const f = humanoidDirection(heading);
        drawHumanoid(ctx, look, 48, 68, 1, f.face, 0, false, 0, true, f.weaponBehindBody, action);
        return ctx.getImageData(0, 0, 96, 80).data;
      };
      const equal = (a, b, i) =>
        a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];
      const look = { ...appearance(703), hat: 1, cloak: true };
      let cases = 0,
        protectedPixels = 0,
        distinctPoses = 0;
      for (const kind of kinds)
        for (const progress of [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1])
          for (const weapon of ['staff', 'sword', 'bow'])
            for (const heading of [
              -Math.PI / 2,
              -Math.PI / 4,
              (-3 * Math.PI) / 4,
              -Math.PI / 6,
              (-5 * Math.PI) / 6,
            ]) {
              const action = { kind, progress };
              const noItem = render({ ...look, weapon: 'none' }, heading, action),
                actual = render({ ...look, weapon }, heading, action);
              const motion = actionMotion(action),
                facing = humanoidDirection(heading).face;
              const dx = Math.round(
                (facing === 1 ? 1 : facing === 3 ? -1 : 0) * motion.lean * 1.28,
              );
              const dy = Math.round(motion.crouch);
              // Sample the inner hood and torso, excluding the articulated exposed arm gap.
              for (const yy of [
                ...Array.from({ length: 5 }, (_, i) => 32 + i),
                ...Array.from({ length: 9 }, (_, i) => 44 + i),
              ])
                for (let xx = 44; xx < 52; xx++) {
                  const x = xx + dx,
                    y = yy + dy;
                  const i = (y * 96 + x) * 4;
                  if (noItem[i + 3] !== 255) continue;
                  protectedPixels++;
                  assert(
                    equal(actual, noItem, i),
                    'North item crossed contextual torso/head: ' +
                      JSON.stringify({ kind, progress, weapon, heading, x, y }),
                  );
                }
              cases++;
            }
      for (const kind of kinds) {
        const rest = render({ ...look, weapon: 'staff' }, Math.PI / 2, null),
          act = render({ ...look, weapon: 'staff' }, Math.PI / 2, { kind, progress: 0.5 });
        assert(
          act.some((v, i) => v !== rest[i]),
          kind + ' has no visible pose',
        );
        for (const progress of [0, 1]) {
          const settled = render({ ...look, weapon: 'staff' }, Math.PI / 2, { kind, progress });
          assert(
            settled.every((value, i) => value === rest[i]),
            kind + ' must start and finish at exact idle',
          );
        }
        distinctPoses++;
        const early = render({ ...look, weapon: 'staff' }, Math.PI / 2, {
            kind,
            progress: 0.1,
            reduced: true,
          }),
          late = render({ ...look, weapon: 'staff' }, Math.PI / 2, {
            kind,
            progress: 0.9,
            reduced: true,
          });
        assert(
          early.every((v, i) => v === late[i]),
          'Reduced motion must keep pose still',
        );
      }
      for (const weapon of ['staff', 'sword', 'bow']) {
        const a = render({ ...look, weapon, weaponSeed: 17 }, Math.PI / 2, null),
          b = render({ ...look, weapon, weaponSeed: 9981 }, Math.PI / 2, null),
          again = render({ ...look, weapon, weaponSeed: 17 }, Math.PI / 2, null);
        assert(
          a.some((v, i) => v !== b[i]),
          'Weapon seed did not change held ' + weapon,
        );
        assert(
          a.every((v, i) => v === again[i]),
          'Weapon seed cache collision',
        );
      }
      const sheet = document.createElement('canvas');
      sheet.width = 1600;
      sheet.height = 1100;
      const paint = sheet.getContext('2d');
      paint.imageSmoothingEnabled = false;
      paint.fillStyle = '#bed0d6';
      paint.fillRect(0, 0, 1600, 1100);
      paint.font = '15px Georgia';
      const columns = [
        ['North reach', -Math.PI / 2, 0.33],
        ['North recover', -Math.PI / 2, 0.67],
        ['East reach', 0, 0.33],
        ['East recover', 0, 0.67],
        ['South reach', Math.PI / 2, 0.33],
        ['South recover', Math.PI / 2, 0.67],
        ['West reach', Math.PI, 0.33],
        ['West recover', Math.PI, 0.67],
      ];
      columns.forEach(([label], i) => {
        paint.fillStyle = '#2b4955';
        paint.fillText(label, 40 + i * 198, 29);
      });
      kinds.forEach((kind, row) => {
        columns.forEach(([, angle, progress], column) => {
          const f = humanoidDirection(angle);
          drawHumanoid(
            paint,
            { ...look, weapon: 'staff' },
            115 + column * 198,
            213 + row * 214,
            3.5,
            f.face,
            0,
            false,
            0,
            true,
            f.weaponBehindBody,
            { kind, progress },
          );
        });
        paint.fillStyle = '#2b4955';
        paint.font = '18px Georgia';
        paint.fillText(kind.toUpperCase(), 18, 245 + row * 214);
      });
      return { cases, protectedPixels, distinctPoses, weaponSeedCases: 3, png: sheet.toDataURL() };
    }.toString()})()`,
  });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  const { png, ...summary } = result.result.value;
  const out = path.resolve('.dream-loop/stichos-progression');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, 'contextual-motion.png'),
    Buffer.from(png.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    path.join(out, 'contextual-motion.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(JSON.stringify(summary));
} finally {
  page?.ws.close();
  if (context) await browser.send('Target.disposeBrowserContext', { browserContextId: context });
  browser.ws.close();
}
