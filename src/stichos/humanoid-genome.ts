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

export type GarmentCut = 'open-coat' | 'tunic' | 'robe' | 'apron' | 'vest' | 'jacket';
export type GarmentClosure = 'open' | 'buttons' | 'laces' | 'wrap';
export type WaistFastening = 'none' | 'belt' | 'sash';

/** Tailoring is a correlated construction grammar, not a mandatory coat and belt.
 * Anatomy and palette stay independent, so player color customization is preserved.
 */
export function tailoringGenome(seed: number) {
  const r = random(deriveSeed(seed, 'stichos-tailoring-v2'));
  const cut = (['open-coat', 'tunic', 'robe', 'apron', 'vest', 'jacket'] as const)[
    Math.floor(r() * 6)
  ];
  const closure: GarmentClosure =
    cut === 'open-coat' || cut === 'vest'
      ? 'open'
      : cut === 'robe'
        ? 'wrap'
        : cut === 'tunic'
          ? 'laces'
          : 'buttons';
  const choice = r();
  const fastening: WaistFastening =
    cut === 'robe'
      ? choice < 0.72
        ? 'sash'
        : 'none'
      : cut === 'apron' || cut === 'open-coat' || cut === 'vest'
        ? 'none'
        : choice < 0.25
          ? 'belt'
          : choice < 0.38
            ? 'sash'
            : 'none';
  return {
    cut,
    closure,
    fastening,
    bottom:
      cut === 'robe'
        ? -3
        : cut === 'open-coat'
          ? -6
          : cut === 'apron'
            ? -7
            : cut === 'tunic'
              ? -9
              : -13,
    flare: cut === 'robe' ? 3 : cut === 'open-coat' ? 2.2 : cut === 'tunic' ? 1.5 : 0.65,
    split: cut === 'open-coat' ? 3 : cut === 'tunic' ? 1 : 0,
    collar: Math.floor(r() * 4),
    pockets: cut === 'robe' ? 0 : cut === 'apron' ? 1 : Math.floor(r() * 3),
    sleeve: cut === 'vest' || cut === 'apron' ? ('underlayer' as const) : ('outer' as const),
    capeLength: 11 + Math.floor(r() * 13),
    capeSplit: r() < 0.45,
    embroidery: r() < 0.3,
    buttonSide: r() < 0.5 ? -1 : 1,
  };
}
