/** Addressed seeds keep unrelated generation streams independent and reproducible. */
export function deriveSeed(seed: number, ...address: (string | number)[]): number {
  let hash = (seed ^ 2166136261) >>> 0;
  for (const character of address.join('/').normalize('NFC')) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return hash >>> 0;
}
export function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
