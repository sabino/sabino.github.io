/** QA scenario construction through the real solo authority, then native browser input. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
const dir = '.dream-loop/living-systems/underworld-browser';
fs.mkdirSync(dir, { recursive: true });
const owner = '11111111-1111-4111-8111-111111111111';
const game = new Stichos(8, 4);
assert.ok(game.acceptLife(0, { name: 'Underworks witness' }).ok);
game.enableLivingSystems(owner);
const entry = game.livingSystemsFrame.entrances[0];
assert.ok(entry);
// Fixture starts beside the real surface entrance. Travel itself is exercised below in browser QA.
Object.assign(game.player, { x: entry.x, y: entry.y });
for (let n = 0; n < 5; n++) game.update(0.1, { x: 0, y: 0, run: false });
fs.writeFileSync(`${dir}/surface.json`, JSON.stringify(game.save()));
const entered = game.fieldCommand({ kind: 'underworld-enter', settlementId: entry.settlementId });
assert.ok(entered.ok, entered.message);
assert.equal(game.spaceId, entered.transition.to.spaceId);
const saved = game.save();
const restored = Stichos.restore(saved);
restored.enableLivingSystems(owner);
assert.equal(restored.spaceId, game.spaceId);
assert.deepEqual(restored.player, game.player);
fs.writeFileSync(`${dir}/entry.json`, JSON.stringify(saved));
fs.writeFileSync(
  `${dir}/metadata.json`,
  JSON.stringify(
    {
      owner,
      entry,
      entered,
      location: game.livingSystemsFrame.location,
      kit: game.livingSystemsFrame.equipment,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ entry: entry.name, space: game.spaceId, owner }));
