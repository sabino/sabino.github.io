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
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      const sample = document.createElement('canvas');
      sample.width = 96;
      sample.height = 80;
      const ctx = sample.getContext('2d', { willReadFrequently: true });
      const colors = {
        seed: 734,
        skin: '#ceac8c',
        hair: '#53453e',
        coat: '#94644f',
        trim: '#c2b68b',
        trousers: '#4f626c',
        height: 1,
        build: 1,
        hairStyle: 1,
        hat: 1,
        cloak: true,
        weapon: 'staff',
      };
      const render = (
        look,
        facing,
        phase,
        moving,
        attack,
        player,
        behind = facing.weaponBehindBody,
      ) => {
        ctx.clearRect(0, 0, 96, 80);
        drawHumanoid(ctx, look, 48, 68, 1, facing.face, phase, moving, attack, player, behind);
        return ctx.getImageData(0, 0, 96, 80).data;
      };
      const equal = (a, b, i) =>
        a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];
      let cases = 0,
        visibleEquipmentCases = 0,
        protectedPixels = 0,
        foregroundOverlapCases = 0;
      const headings = [
        -Math.PI / 2,
        -Math.PI / 4,
        (-3 * Math.PI) / 4,
        -Math.PI / 6,
        (-5 * Math.PI) / 6,
      ];
      const kinds = ['staff', 'sword', 'bow'];
      for (const cloak of [false, true])
        for (const weapon of kinds)
          for (const angle of headings)
            for (const moving of [false, true])
              for (const attack of [0, 0.2, 0.4, 0.6, 0.8, 1])
                for (const player of [false, true]) {
                  const look = { ...colors, weapon, cloak, hat: cloak ? 1 : 0 };
                  const facing = humanoidDirection(angle),
                    phase = moving ? Math.PI / 2 : 0;
                  const base = render(
                    { ...look, weapon: 'none' },
                    facing,
                    phase,
                    moving,
                    attack,
                    player,
                  );
                  const actual = render(look, facing, phase, moving, attack, player);
                  // Same side pose forced to foreground exercises the distinct cache key.
                  const foreground = render(look, facing, phase, moving, attack, player, false);
                  let visible = 0,
                    overlaps = 0;
                  for (let i = 0; i < actual.length; i += 4) if (!equal(base, actual, i)) visible++;
                  // Fully opaque inner torso/hood pixels must be unaffected by held equipment.
                  // This checks final raster occlusion, not the implementation's draw call order.
                  for (let y = 29; y < 55; y++)
                    for (let x = 43; x < 54; x++) {
                      const i = (y * 96 + x) * 4;
                      if (base[i + 3] !== 255) continue;
                      protectedPixels++;
                      assert(
                        equal(base, actual, i),
                        'Weapon crossed torso/head: ' +
                          JSON.stringify({ cloak, weapon, angle, moving, attack, player, x, y }),
                      );
                      if (!equal(base, foreground, i)) overlaps++;
                    }
                  const cached = render(look, facing, phase, moving, attack, player);
                  assert(
                    cached.every((value, i) => value === actual[i]),
                    'Foreground/rear pose cache collision',
                  );
                  if (visible > 0) visibleEquipmentCases++;
                  if (overlaps > 0) foregroundOverlapCases++;
                  cases++;
                }
      assert(visibleEquipmentCases === cases, 'An item disappeared completely');
      assert(
        foregroundOverlapCases > 0,
        'The occlusion regression probe must overlap an opaque body pixel',
      );

      const sheet = document.createElement('canvas');
      sheet.width = 1600;
      sheet.height = 1040;
      const paint = sheet.getContext('2d');
      paint.imageSmoothingEnabled = false;
      paint.fillStyle = '#b9cddd';
      paint.fillRect(0, 0, sheet.width, sheet.height);
      const columns = [
        ['N idle', -Math.PI / 2, false, 0],
        ['N walk', -Math.PI / 2, true, 0],
        ['N attack', -Math.PI / 2, true, 0.6],
        ['NE attack', -Math.PI / 4, true, 0.6],
        ['NW attack', (-3 * Math.PI) / 4, true, 0.6],
        ['ENE attack', -Math.PI / 6, true, 0.6],
        ['WNW attack', (-5 * Math.PI) / 6, true, 0.6],
        ['S attack', Math.PI / 2, true, 0.6],
      ];
      paint.font = '15px monospace';
      paint.fillStyle = '#294858';
      columns.forEach(([label], i) => paint.fillText(label, 92 + i * 190, 31));
      for (let row = 0; row < 6; row++) {
        const player = row < 3,
          weapon = kinds[row % 3];
        const look = {
          ...colors,
          weapon,
          cloak: player,
          hat: player ? 1 : 0,
          coat: player ? '#94644f' : '#506e73',
        };
        paint.fillStyle = '#294858';
        paint.font = '14px monospace';
        paint.fillText((player ? 'PLAYER ' : 'NPC ') + weapon, 12, 73 + row * 161);
        columns.forEach(([, angle, moving, attack], col) => {
          const facing = humanoidDirection(angle);
          drawHumanoid(
            paint,
            look,
            130 + col * 190,
            188 + row * 161,
            2.9,
            facing.face,
            Math.PI / 2,
            moving,
            attack,
            player,
            facing.weaponBehindBody,
          );
        });
      }
      return {
        cases,
        visibleEquipmentCases,
        protectedPixels,
        foregroundOverlapCases,
        png: sheet.toDataURL(),
        url: location.href,
      };
    }.toString()})()`,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const { png, ...results } = result.result.value;
  const directory = path.resolve('.dream-loop/stichos');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'humanoid-weapon-depth.png'),
    Buffer.from(png.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    path.join(directory, 'humanoid-weapon-depth.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} finally {
  page?.ws.close();
  if (context) await browser.send('Target.disposeBrowserContext', { browserContextId: context });
  browser.ws.close();
}
