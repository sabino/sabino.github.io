import { deriveSeed, random } from '../procedural/random.ts';

/** Correlated anatomy and tailoring rules, independent of outfits and carried equipment. */
export function humanoidGenome(seed: number) {
  const r = random(deriveSeed(seed, 'stichos-human-construction'));
  const frame = r(),
    stature = r(),
    taper = r();
  const shoulders = 4.5 + frame * 1.7,
    waist = 3.5 + frame * 0.7 + taper * 0.6;
  return {
    width: 0.94 + frame * 0.12,
    height: 0.97 + stature * 0.065,
    shoulders,
    waist,
    hem: waist + 1 + r() * 1.7,
    coatBottom: -7 - Math.floor(r() * 6),
    stance: 2.5 + frame * 0.6 + r() * 0.5,
    skull: 3.6 + r() * 0.9,
    jaw: 2.1 + taper * 1.2,
    eyeGap: 1.4 + r() * 1.1,
    eyeLift: Math.floor(r() * 2),
    brow: Math.floor(r() * 3),
    nose: Math.floor(r() * 3),
    beard: Math.floor(r() * 5),
    hairline: Math.floor(r() * 5),
    cuff: 1 + Math.floor(r() * 2),
    collar: Math.floor(r() * 3),
    beltY: -14 - Math.floor(r() * 3),
    pocketSide: r() < 0.5 ? -1 : 1,
    pockets: Math.floor(r() * 3),
    buttons: 2 + Math.floor(r() * 3),
    patch: r() < 0.38,
    seam: r() < 0.5 ? -1 : 1,
  };
}
