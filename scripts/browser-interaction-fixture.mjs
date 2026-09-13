/** Test save fixture only. Browser actions run through native controls afterward. */
import fs from 'node:fs';
import { Stichos } from '../src/stichos/session.ts';
const out = process.env.VERSO_BROWSER_OUT || '.dream-loop/living-systems/interaction';
fs.mkdirSync(out, { recursive: true });
const game = new Stichos(8, 4);
if (!game.acceptLife(0, { name: 'Touch witness' }).ok) throw Error('Fixture life rejected');
const npc = game.npcs.find((n) => n.role === 'refugee');
if (!npc) throw Error('No seeded resident');
Object.assign(game.player, { x: npc.x - 1, y: npc.y });
if (game.world.blocked(game.player.x, game.player.y)) throw Error('Blocked fixture ground');
const save = game.save();
const restored = Stichos.restore(save);
if (restored.nearby()?.id !== npc.id)
  throw Error('Fixture must start beside the intended resident');
fs.writeFileSync(`${out}/npc-fixture.json`, JSON.stringify(save, null, 2));
// Keep the original cold-walk start stable for before/after comparisons. Never
// overwrite an already captured baseline save.
if (!fs.existsSync(`${out}/fixture.json`)) {
  const walkSave = structuredClone(save);
  walkSave.player.x = npc.x;
  walkSave.player.y = npc.y + 1;
  Stichos.restore(walkSave);
  fs.writeFileSync(`${out}/fixture.json`, JSON.stringify(walkSave, null, 2));
}
console.log(
  JSON.stringify({
    file: `${out}/npc-fixture.json`,
    npc: npc.id,
    position: { x: game.player.x, y: game.player.y },
  }),
);
