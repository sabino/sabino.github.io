/** Local-only native-input evidence. Accelerated time lives exclusively in this test authority.
 * Run with a PTY so stdin stays open:
 * node --experimental-strip-types scripts/browser-living-evidence.mjs <verified-CDP> http://localhost:4183/
 * JSON commands (one per line) drive only native input or read-only diagnostics.
 * The owned test authority listens on loopback :4187, has no disk/Pear/payment handlers,
 * and changes time only via {op:'advance',seconds:840}; it never mutates browser state.
 * See .dream-loop/living-evidence/README.md for the actual adaptive scenario and results.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { browserHarness, chooseLife, delay } from './browser-harness.mjs';
import { createCoopServer } from '../server/coop.mjs';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { findWalkingPath } from '../src/stichos/pathfinding.ts';
const out = path.resolve('.dream-loop/living-evidence');
fs.mkdirSync(out, { recursive: true });
let offset = 0;
const server = createCoopServer({
  now: () => Date.now() + offset,
  persistenceDirectory: null,
  voice: false,
  allowedOrigins: ['http://localhost:4183'],
  maxRooms: 2,
  maxPeers: 2,
});
await server.listen(4187, '127.0.0.1');
const h = await browserHarness(process.argv[2], out);
const p = await h.page('living', process.argv[3] || 'http://localhost:4183/', {
  width: 1280,
  height: 900,
  mobile: false,
});
await chooseLife(p, 'Aster', '1');
const evidence = [];
async function record(name) {
  const state = await p.state();
  const shot = await p.shot(name);
  const entry = { name, shot, at: new Date().toISOString(), offsetSeconds: offset / 1000, state };
  evidence.push(entry);
  fs.writeFileSync(
    path.join(out, 'evidence.json'),
    JSON.stringify(
      {
        fixture:
          'Real browser app; native input only; isolated authority clock can be accelerated through this process stdin. No product changes or browser game-state mutation.',
        evidence,
        errors: h.errors,
      },
      null,
      2,
    ),
  );
  return { shot, state };
}
function compact(s) {
  return {
    player: s.player,
    worldTime: s.worldTime,
    fauna: s.fauna,
    npcs: s.npcs,
    residentActivities: s.residentActivities,
    modal: s.modal,
    dialogue: s.dialogue,
    multiplayer: s.multiplayer,
    seed: s.seed,
    generation: s.generation,
    inventory: s.inventory,
  };
}
async function worldClick(point) {
  const pos = await p.read(
    `(()=>{const r=document.querySelector('#s-world').getBoundingClientRect(),p=window.stichos.worldToScreen(${JSON.stringify(point)});return {x:r.x+p.x,y:r.y+p.y,inside:p.x>5&&p.x<r.width-5&&p.y>50&&p.y<r.height-70};})()`,
  );
  if (!pos.inside) throw Error('World point outside usable canvas ' + JSON.stringify(pos));
  await p.point(pos.x, pos.y);
}
async function dispatch(cmd) {
  if (cmd.op === 'state') return compact(await p.state());
  if (cmd.op === 'dom')
    return await p.read(
      "({text:document.body.innerText.slice(-16000),inputs:[...document.querySelectorAll('input,select,button,summary')].filter(e=>e.getBoundingClientRect().width).map(e=>({tag:e.tagName,id:e.id,text:e.textContent.trim().slice(0,90),value:e.value,data:{...e.dataset}}))})",
    );
  if (cmd.op === 'click') {
    await p.click(cmd.selector);
    return compact(await p.state());
  }
  if (cmd.op === 'fill') {
    await p.fill(cmd.selector, cmd.text);
    return true;
  }
  if (cmd.op === 'key') {
    await p.key(cmd.key, cmd.code, cmd.vk, cmd.hold || 0);
    return compact(await p.state());
  }
  if (cmd.op === 'world') {
    await worldClick(cmd.point);
    await delay(cmd.wait || 1200);
    return compact(await p.state());
  }
  if (cmd.op === 'wait') {
    await delay(Math.min(cmd.ms || 1000, 30000));
    return compact(await p.state());
  }
  if (cmd.op === 'shot') return record(cmd.name);
  if (cmd.op === 'resize') {
    await p.resize(cmd.width, cmd.height);
    return true;
  }
  if (cmd.op === 'advance') {
    offset += cmd.seconds * 1000;
    await delay(800);
    return compact(await p.state());
  }
  if (cmd.op === 'plan') {
    const s = await p.state(),
      w = new InfiniteWorld(s.seed ?? 1, s.worldGeneration ?? s.generation ?? 4);
    const removed = new Set([...(s.removed ?? []), ...(s.opened ?? [])]);
    const route = findWalkingPath(s.player, [cmd.point], (x, y) => w.blocked(x, y, removed), {
      radius: 64,
      maxVisited: 5500,
    });
    return { from: s.player, to: cmd.point, route };
  }
  if (cmd.op === 'nearby') {
    const s = await p.state(),
      w = new InfiniteWorld(s.seed ?? 1, s.worldGeneration ?? s.generation ?? 4);
    return {
      props: w.propsAround(s.player.x, s.player.y, cmd.radius || 12),
      tile: w.tile(s.player.x, s.player.y),
    };
  }
  if (cmd.op === 'goto') {
    let steps = 0;
    while (steps++ < 20) {
      const s = await p.state();
      if (s.modal || s.dialogue) throw Error('Modal/dialogue interrupts walking');
      if (Math.hypot(s.player.x - cmd.point.x, s.player.y - cmd.point.y) < 1) return compact(s);
      const w = new InfiniteWorld(s.seed ?? 1, s.worldGeneration ?? s.generation ?? 4),
        removed = new Set([...(s.removed ?? []), ...(s.opened ?? [])]);
      const route = findWalkingPath(s.player, [cmd.point], (x, y) => w.blocked(x, y, removed), {
        radius: 64,
        maxVisited: 5500,
      });
      if (!route.length) throw Error('No ordinary walkable route from current body');
      const next = route[Math.min(6, route.length - 1)];
      await worldClick(next);
      await delay(1800);
      const after = await p.state();
      if (Math.hypot(after.player.x - s.player.x, after.player.y - s.player.y) < 0.15)
        throw Error('Native path blocked ' + JSON.stringify({ next, player: after.player }));
    }
    return compact(await p.state());
  }
  if (cmd.op === 'close') {
    await record('final');
    await h.close();
    await server.close();
    process.exit(0);
  }
  throw Error('Unknown operation');
}
console.log(JSON.stringify({ ready: true, state: compact(await p.state()) }));
const lines = readline.createInterface({ input: process.stdin });
for await (const line of lines) {
  try {
    const cmd = JSON.parse(line);
    fs.appendFileSync(path.join(out, 'commands.jsonl'), JSON.stringify(cmd) + '\n');
    console.log(JSON.stringify({ op: cmd.op, result: await dispatch(cmd) }));
  } catch (error) {
    console.log(JSON.stringify({ error: String(error) }));
  }
}
await h.close();
await server.close();
