/** Real Canvas2D asset verification in a disposable Agent Workspace browser context.
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
    background: true,
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
      const { toolIcon } = await import('/src/stichos/labor-art.ts');
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 80;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      const render = (kind, seed, angle, progress, tool) => {
        c.clearRect(0, 0, 96, 80);
        const f = humanoidDirection(angle);
        drawHumanoid(
          c,
          { ...appearance(703), weapon: 'none', hat: 1, cloak: true },
          48,
          68,
          1,
          f.face,
          0,
          false,
          0,
          true,
          f.weaponBehindBody,
          { kind: 'gather', progress, ...(tool ? { tool: { kind, seed } } : {}) },
        );
        return c.getImageData(0, 0, 96, 80).data;
      };
      let cases = 0,
        protectedPixels = 0;
      for (const kind of ['axe', 'pickaxe', 'sickle'])
        for (const seed of [1, 703, 734, 3886])
          for (const angle of [
            -Math.PI / 2,
            -Math.PI / 4,
            (-3 * Math.PI) / 4,
            -Math.PI / 6,
            (-5 * Math.PI) / 6,
          ])
            for (const progress of [0.2, 0.5, 0.8]) {
              const base = render(kind, seed, angle, progress, false),
                actual = render(kind, seed, angle, progress, true);
              if (!actual.some((v, i) => v !== base[i])) throw Error('Tool did not render ' + kind);
              for (const y of [34, 35, 36, 46, 47, 48, 49, 50, 51])
                for (let x = 46; x < 51; x++) {
                  const n = (y * 96 + x) * 4;
                  if (base[n + 3] !== 255) continue;
                  protectedPixels++;
                  if (
                    base[n] !== actual[n] ||
                    base[n + 1] !== actual[n + 1] ||
                    base[n + 2] !== actual[n + 2] ||
                    base[n + 3] !== actual[n + 3]
                  )
                    throw Error('Tool crossed north body ' + kind);
                }
              cases++;
            }
      const sheet = document.createElement('canvas');
      sheet.width = 1380;
      sheet.height = 700;
      const ctx = sheet.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#e2dfcc';
      ctx.fillRect(0, 0, 1380, 700);
      ctx.fillStyle = '#233d49';
      ctx.font = '18px monospace';
      ctx.fillText('ACTUAL WORK TOOL / PREPARATION, STROKE, RECOVERY / NORTH DEPTH', 24, 30);
      const kinds = ['axe', 'pickaxe', 'sickle'];
      for (let row = 0; row < 3; row++) {
        const kind = kinds[row],
          y = 85 + row * 205;
        ctx.fillStyle = '#233d49';
        ctx.font = '15px monospace';
        ctx.fillText(kind + ' / seed 703', 24, y);
        const image = new Image();
        image.src = toolIcon(703, kind, 140);
        await image.decode();
        ctx.drawImage(image, 25, y + 5, 140, 140);
        for (let col = 0; col < 5; col++) {
          const f = humanoidDirection(
            col < 3 ? Math.PI / 2 : col === 3 ? -Math.PI / 2 : -Math.PI / 4,
          );
          drawHumanoid(
            ctx,
            { ...appearance(703), hat: 1, weapon: 'staff' },
            300 + col * 230,
            y + 160,
            3.3,
            f.face,
            0,
            false,
            0,
            true,
            f.weaponBehindBody,
            { kind: 'gather', progress: [0.2, 0.5, 0.8, 0.5, 0.5][col], tool: { kind, seed: 703 } },
          );
        }
      }
      return { cases, protectedPixels, png: sheet.toDataURL() };
    }.toString()})()`,
  });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  const { png, ...results } = result.result.value,
    directory = path.resolve('.dream-loop/stichos-artifacts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'work-tools.png'),
    Buffer.from(png.split(',')[1], 'base64'),
  );
  fs.writeFileSync(path.join(directory, 'work-tools.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  page?.ws.close();
  if (context) await browser.send('Target.disposeBrowserContext', { browserContextId: context });
  browser.ws.close();
}
