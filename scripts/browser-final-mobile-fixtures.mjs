/** Independent review setup. These saved scenarios are explicitly prepared, not played campaigns. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
const out =
  process.env.VERSO_BROWSER_OUT || '.dream-loop/living-systems/mobile-systems-review/review-03';
fs.mkdirSync(out, { recursive: true });
const owner = '11111111-1111-4111-8111-111111111111';
const game = new Stichos(8, 4);
assert.ok(game.acceptLife(0, { name: 'Independent mobile witness' }).ok);
game.enableLivingSystems(owner);
const bench = game.world
  .propsAround(game.player.x, game.player.y, 32)
  .find((p) => p.kind === 'workbench');
assert.ok(bench);
Object.assign(game.player, { x: bench.x + 1, y: bench.y });
for (let n = 0; n < 3; n++) game.update(0.1, { x: 0, y: 0 });
const boards = game.fieldCommand({ kind: 'craft', recipeId: 'boards' });
assert.ok(boards.ok, boards.message);
const home = game.progression.homes[0],
  offer = game.livingSystemsFrame.offers.find((o) => o.id === home.buildingId);
assert.ok(offer);
Object.assign(game.player, { x: offer.entrance.x, y: offer.entrance.y });
for (let n = 0; n < 8; n++) game.update(0.1, { x: 0, y: 0 });
assert.ok(game.livingSystemsFrame.property.estates.some((e) => e.id === home.buildingId));
const saved = game.save();
let plan;
for (let y = offer.bounds.y + 1; y < offer.bounds.y + offer.bounds.height - 2 && !plan; y++)
  for (let x = offer.bounds.x + 1; x < offer.bounds.x + offer.bounds.width - 2 && !plan; x++) {
    const trial = Stichos.restore(saved);
    trial.enableLivingSystems(owner);
    Object.assign(trial.player, { x: x + 0.1, y: y + 1.1 });
    if (trial.world.blocked(trial.player.x, trial.player.y)) continue;
    for (let n = 0; n < 2; n++) trial.update(0.1, { x: 0, y: 0 });
    const before = trial.save(),
      result = trial.fieldCommand({
        kind: 'property',
        command: {
          kind: 'build',
          propertyId: home.buildingId,
          station: 'apothecary',
          at: { spaceId: 'surface', x, y },
        },
      });
    if (result.ok)
      plan = { point: { x, y }, player: { x: x + 0.1, y: y + 1.1 }, save: before, result };
  }
assert.ok(plan, 'Existing home must have a valid dressing-table footprint for native confirmation');
fs.writeFileSync(`${out}/estate-fixture.json`, JSON.stringify(plan.save));
fs.writeFileSync(
  `${out}/estate-metadata.json`,
  JSON.stringify(
    {
      owner,
      home,
      offer,
      point: plan.point,
      player: plan.player,
      preparation:
        'Real starter timber is crafted into boards beside a generated workbench; the origin home is automatically adopted. The model searches a valid placement; the browser starts before construction and must confirm with native input.',
    },
    null,
    2,
  ),
);
const near = new Stichos(8, 4);
near.acceptLife(0, { name: 'Contact witness' });
near.enableLivingSystems(owner);
const contact = near.livingSystemsFrame.contacts[0];
assert.ok(contact);
Object.assign(near.player, { x: contact.x - 1, y: contact.y });
for (let n = 0; n < 3; n++) near.update(0.1, { x: 0, y: 0 });
fs.writeFileSync(`${out}/contact-fixture.json`, JSON.stringify(near.save()));
fs.writeFileSync(
  `${out}/contact-metadata.json`,
  JSON.stringify(
    {
      contact,
      occupied: near.occupiedNpcId,
      actualContacts: near.livingSystemsFrame.contacts,
      preparation:
        'Prepared at the actual named guild contact; subsequent discovery uses native controls.',
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ owner, home: home.buildingId, point: plan.point, contact: contact.name }),
);
