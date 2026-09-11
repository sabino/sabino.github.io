import test from 'node:test';
import assert from 'node:assert/strict';
import { tailoringGenome } from '../src/stichos/humanoid-genome.ts';

test('tailoring keeps six different garment constructions, with belts only where physically appropriate', () => {
  const cuts = new Set<string>();
  const closures = new Set<string>();
  let belted = 0,
    unfastened = 0,
    sashes = 0;
  for (let seed = 0; seed < 2000; seed++) {
    const garment = tailoringGenome(seed);
    assert.deepEqual(garment, tailoringGenome(seed));
    cuts.add(garment.cut);
    closures.add(garment.closure);
    assert.ok(garment.bottom >= -13 && garment.bottom <= -3);
    if (garment.cut === 'robe') {
      assert.equal(garment.closure, 'wrap');
      assert.equal(garment.bottom, -3);
    }
    if (garment.cut === 'vest' || garment.cut === 'apron')
      assert.equal(garment.sleeve, 'underlayer');
    if (garment.cut === 'open-coat' || garment.cut === 'apron' || garment.cut === 'vest')
      assert.equal(garment.fastening, 'none');
    if (garment.fastening === 'belt') belted++;
    if (garment.fastening === 'none') unfastened++;
    if (garment.fastening === 'sash') sashes++;
  }
  assert.equal(cuts.size, 6);
  assert.equal(closures.size, 4);
  assert.ok(belted > 80 && belted < 260);
  assert.ok(unfastened > 1200);
  assert.ok(sashes > 200);
});
