/** Empty inputs keep the authored opening; names and numbers are reproducible. */
export const DEFAULT_SEED = 0x71a3;
export function parseSeed(input: string): number {
  const value = input.trim().slice(0, 64);
  if (!value) return DEFAULT_SEED;
  if (/^0x[\da-f]{1,8}$/i.test(value)) return Number.parseInt(value.slice(2), 16) >>> 0;
  if (/^\d{1,10}$/.test(value) && Number(value) <= 0xffffffff) return Number(value) >>> 0;
  let seed = 2166136261;
  for (const character of value.normalize('NFC')) {
    seed ^= character.codePointAt(0)!;
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}
export function formatSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16).toUpperCase()}`;
}
