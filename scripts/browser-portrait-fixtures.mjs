/** Test-only saved lives at real seeded sites. Never imported by the game build. */
import fs from 'node:fs';
import { Stichos } from '../src/stichos/session.ts';
const out = process.env.VERSO_BROWSER_OUT || '.dream-loop/portrait-action-expansion/review-mobile';
fs.mkdirSync(`${out}/fixtures`, { recursive: true });
const fixtures = [];
for (const [kind, index] of [
  ['road', 0],
  ['relay', 40],
  ['garden', 22],
]) {
  const game = new Stichos(8, 4);
  if (!game.acceptLife(index, { name: `QA ${kind}` }).ok) throw Error('fixture life rejected');
  const plan = game.expeditions.find((p) => p.kind === kind);
  if (!plan) throw Error(`No ${kind}`);
  const spawn = { x: plan.site.x - 2, y: plan.site.y + 2 };
  if (game.world.blocked(spawn.x, spawn.y)) throw Error('Blocked fixture spawn');
  Object.assign(game.player, {
    ...spawn,
    level: 4,
    xp: 0,
    hp: 180,
    maxHp: 180,
    stamina: 100,
    heading: Math.atan2(plan.site.y - spawn.y, plan.site.x - spawn.x),
    breath: 100,
    warmth: 100,
  });
  Object.assign(game.inventory, { rations: 6, salve: 6, tonic: 6, cequin: 6, wood: 6, ore: 6 });
  const save = game.save();
  // Exercise the same validator and reconstruction used by Continue.
  const restored = Stichos.restore(save);
  if (restored.player.level !== 4) throw Error('Invalid restored fixture');
  const path = `${out}/fixtures/${kind}.json`;
  fs.writeFileSync(path, JSON.stringify(save, null, 2));
  fixtures.push({
    kind,
    path,
    seed: 8,
    generation: 4,
    index,
    site: plan.site,
    spawn,
    weapon: game.displayAppearance.weapon,
    enemies: plan.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, hp: e.hp })),
    note: 'Node-authored test save; inventory/level/position fixture setup only. Browser uses Continue and native inputs thereafter.',
  });
}
const dying = JSON.parse(fs.readFileSync(fixtures[0].path, 'utf8'));
dying.player.hp = 1;
dying.player.x = fixtures[0].enemies[0].x - 0.7;
dying.player.y = fixtures[0].enemies[0].y + 0.3;
Stichos.restore(dying);
fs.writeFileSync(`${out}/fixtures/death.json`, JSON.stringify(dying, null, 2));
fs.writeFileSync(`${out}/fixtures/manifest.json`, JSON.stringify(fixtures, null, 2));
console.log(JSON.stringify(fixtures, null, 2));
