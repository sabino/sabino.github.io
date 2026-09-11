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
      const { drawArtifact, artifactIcon } = await import('/src/stichos/artifact-art.ts');
      const { generateArtifact } = await import('/src/stichos/artifacts.ts');
      const { appearance } = await import('/src/stichos/world.ts');
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 80;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      const render = (look, angle, attack) => {
        c.clearRect(0, 0, 96, 80);
        const f = humanoidDirection(angle);
        drawHumanoid(c, look, 48, 68, 1, f.face, 1, true, attack, false, f.weaponBehindBody);
        return c.getImageData(0, 0, 96, 80).data;
      };
      let protectedPixels = 0,
        cases = 0;
      const designs = [];
      for (let i = 0; designs.length < 18 && i < 200; i++) {
        const design = 'field construction ' + i;
        if (generateArtifact(design).category === 'implement') designs.push(design);
      }
      for (const design of designs)
        for (const angle of [
          -Math.PI / 2,
          -Math.PI / 4,
          (-3 * Math.PI) / 4,
          -Math.PI / 6,
          (-5 * Math.PI) / 6,
        ])
          for (const attack of [0, 0.5, 1]) {
            const look = { ...appearance(703), hat: 1, cloak: true, weapon: 'staff' };
            const base = render({ ...look, weapon: 'none' }, angle, attack),
              actual = render({ ...look, artifactDesign: design }, angle, attack);
            for (const y of [32, 33, 34, 44, 45, 46, 47, 48, 49, 50])
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
                  throw Error(
                    'Artifact crosses north torso/head: ' +
                      design +
                      ' angle ' +
                      angle +
                      ' at ' +
                      x +
                      ',' +
                      y,
                  );
              }
            cases++;
          }
      const sheet = document.createElement('canvas');
      sheet.width = 1440;
      sheet.height = 1100;
      const ctx = sheet.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#e2dfcc';
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      ctx.font = '18px monospace';
      ctx.fillStyle = '#263e49';
      ctx.fillText('GENERATED CONSTRUCTIONS / SHARED ICON + HELD GEOMETRY', 24, 30);
      const selected = [
        'copper moth beneath ice',
        'field construction 0',
        'field construction 1',
        'field construction 2',
        'field construction 3',
        'field construction 4',
      ];
      for (let row = 0; row < selected.length; row++) {
        const design = selected[row],
          g = generateArtifact(design),
          y = 70 + row * 165;
        ctx.fillStyle = '#263e49';
        ctx.font = '13px monospace';
        ctx.fillText(design + ' / ' + g.category + ' / ' + g.delivery, 24, y);
        const image = new Image();
        image.src = artifactIcon(design, 160);
        await image.decode();
        ctx.drawImage(image, 24, y + 7, 145, 145);
        const look = {
          ...appearance(703 + row),
          artifactDesign: design,
          weapon: g.delivery === 'projectile' ? 'bow' : g.delivery === 'pulse' ? 'staff' : 'sword',
          hat: row % 3,
          cloak: row % 2 === 0,
        };
        for (const [col, angle, attack, stow] of [
          [0, Math.PI / 2, 0, false],
          [1, -Math.PI / 2, 0, false],
          [2, -Math.PI / 4, 0.8, false],
          [3, Math.PI / 4, 0.8, false],
          [4, -Math.PI / 2, 0, true],
        ]) {
          const f = humanoidDirection(angle);
          drawHumanoid(
            ctx,
            { ...look, weapon: stow ? 'none' : look.weapon },
            270 + col * 240,
            y + 132,
            2.7,
            f.face,
            1,
            true,
            attack,
            true,
            f.weaponBehindBody,
          );
        }
      }
      const people = document.createElement('canvas');
      people.width = 1440;
      people.height = 800;
      const pc = people.getContext('2d');
      pc.imageSmoothingEnabled = false;
      pc.fillStyle = '#e2dfcc';
      pc.fillRect(0, 0, 1440, 800);
      pc.fillStyle = '#263e49';
      pc.font = '18px monospace';
      pc.fillText('SEED-DERIVED ANATOMY + TAILORING / SAME BASE COLORS', 24, 30);
      const common = {
        ...appearance(703),
        hat: 0,
        cloak: false,
        weapon: 'none',
        height: 1,
        build: 1,
        hairStyle: 0,
      };
      for (let i = 0; i < 24; i++) {
        const x = 90 + (i % 8) * 180,
          y = 245 + Math.floor(i / 8) * 250;
        pc.fillStyle = '#263e49';
        pc.font = '14px monospace';
        pc.fillText('seed ' + (700 + i), x - 45, y + 24);
        drawHumanoid(pc, { ...common, seed: 700 + i }, x, y, 4, 2, 0, false, 0, false, false);
      }
      return {
        cases,
        protectedPixels,
        designs: designs.length,
        artifactPng: sheet.toDataURL(),
        humanPng: people.toDataURL(),
      };
    }.toString()})()`,
  });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  const { artifactPng, humanPng, ...results } = result.result.value;
  const directory = path.resolve('.dream-loop/stichos-artifacts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'constructions.png'),
    Buffer.from(artifactPng.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    path.join(directory, 'humanoid-genomes.png'),
    Buffer.from(humanPng.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    path.join(directory, 'asset-results.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} finally {
  page?.ws.close();
  if (context) await browser.send('Target.disposeBrowserContext', { browserContextId: context });
  browser.ws.close();
}
