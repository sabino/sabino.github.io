/** Saved fixture admitted through actual solo authority APIs. No runtime QA cheats. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
const out = '.dream-loop/living-systems/mobile-systems-review';
const owner = '11111111-1111-4111-8111-111111111111';
const game = new Stichos(8, 4);
assert.equal(game.acceptLife(0, { name: 'Mobile systems witness' }).ok, true);
const home = game.progression.homes[0];
game.enableLivingSystems(owner);
const offer = game.livingSystemsFrame.offers.find((o) => o.id === home.buildingId);
assert.ok(offer);
Object.assign(game.player, { x: offer.entrance.x, y: offer.entrance.y });
for (let i = 0; i < 30; i++) game.update(1 / 30, { x: 0, y: 0 });
const adopted = {
  ok: game.livingSystemsFrame.property.estates.some((e) => e.id === home.buildingId),
  message: 'Automatically registered verified solo origin home at its canonical entrance.',
};
assert.equal(adopted.ok, true, adopted.message);
for (let i = 0; i < 30; i++) game.update(1 / 30, { x: 0, y: 0 });
const hatchet = game.fieldCommand({ kind: 'craft', recipeId: 'hatchet' });
assert.equal(hatchet.ok, true, hatchet.message);
const save = game.save();
const restored = Stichos.restore(save);
restored.enableLivingSystems(owner);
assert.equal(restored.livingSystemsFrame.property.estates[0].ownerId, owner);
fs.writeFileSync(`${out}/owned-home-fixture.json`, JSON.stringify(save, null, 2));
fs.writeFileSync(
  `${out}/owned-home-fixture-meta.json`,
  JSON.stringify({ owner, home, adopted, hatchet }, null, 2),
);
console.log(
  JSON.stringify({ file: `${out}/owned-home-fixture.json`, owner, home: home.buildingId }),
);
