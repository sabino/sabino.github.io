/** Explicit model fixtures for native encounter presentation, not a claimed completed run. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { Underworld } from '../src/stichos/underworld.ts';
const dir = '.dream-loop/living-systems/underworld-browser';
const base = JSON.parse(fs.readFileSync(`${dir}/entry.json`, 'utf8'));
const owner = '11111111-1111-4111-8111-111111111111',
  settlement = base.livingSystems.underworld.complexes[0];
const descriptions = [];
for (const depth of [0, 1, 2]) {
  const saved = structuredClone(base),
    world = new Underworld(base.seed, saved.livingSystems.underworld),
    plan = world.floor(settlement, depth),
    ledger = world.save(),
    floor = ledger.floors.find((f) => f.spaceId === plan.spaceId),
    boss = floor.enemies.find((e) => e.kind === 'boss');
  const point = { spaceId: plan.spaceId, x: boss.x - 2.8, y: boss.y };
  if (depth === 2) {
    boss.hp = Math.floor(boss.maxHp * 0.45);
    boss.phase = 2;
  }
  ledger.residents.find((r) => r.id === owner).address = point;
  saved.livingSystems.underworld = ledger;
  Object.assign(saved.player, { x: point.x, y: point.y, heading: 0, hp: saved.player.maxHp });
  const game = Stichos.restore(saved);
  game.enableLivingSystems(owner);
  assert.equal(game.spaceId, plan.spaceId);
  assert.equal(game.navigationBlocked(game.player.x, game.player.y), false);
  fs.writeFileSync(`${dir}/encounter-${depth}.json`, JSON.stringify(game.save()));
  descriptions.push({
    depth,
    biome: plan.biome,
    boss: boss.name,
    hp: boss.hp,
    phase: boss.phase,
    point,
    preparation:
      'Fixture places a normal-health life beside a generated boss; final-floor boss starts in phase two. Native inputs perform all subsequent actions.',
  });
}
fs.writeFileSync(`${dir}/encounter-fixtures.json`, JSON.stringify(descriptions, null, 2));
console.log(JSON.stringify(descriptions));
