import type { Npc } from './types.ts';
import { normalizeArtifactDesign } from './artifacts.ts';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const point = (v: unknown) =>
  record(v) && finite(v.x, -99999999, 99999999) && finite(v.y, -99999999, 99999999);
const keys = (v: Record<string, unknown>, allowed: string) =>
  Object.keys(v).every((k) => allowed.split(' ').includes(k));
/** Durable bodies contain only the explicit NPC schema, never transient render/audio fields. */
export function validPersistentNpc(value: unknown): value is Npc {
  if (
    !record(value) ||
    !keys(
      value,
      'id seed name role clan appearance maxHp hp home speed heading phase hostile cooldown stagger x y',
    )
  )
    return false;
  const n = value,
    a = n.appearance;
  if (
    !record(a) ||
    !keys(
      a,
      'technology weaponSeed artifactDesign seed skin hair coat trim trousers height build hairStyle hat cloak weapon',
    )
  )
    return false;
  if (a.artifactDesign !== undefined) {
    try {
      if (normalizeArtifactDesign(a.artifactDesign) !== a.artifactDesign) return false;
    } catch {
      return false;
    }
  }
  return (
    point(n) &&
    typeof n.id === 'string' &&
    n.id.length > 0 &&
    n.id.length <= 160 &&
    typeof n.name === 'string' &&
    n.name.length <= 100 &&
    finite(n.seed, -0xffffffff, 0xffffffff) &&
    [
      'botanist',
      'merchant',
      'archivist',
      'engineer',
      'guard',
      'refugee',
      'raider',
      'pilgrim',
    ].includes(n.role as string) &&
    finite(n.clan, 0, 5) &&
    Number.isInteger(n.clan) &&
    finite(n.maxHp, 1, 1000) &&
    finite(n.hp, 0, n.maxHp as number) &&
    point(n.home) &&
    record(n.home) &&
    keys(n.home, 'x y') &&
    finite(n.speed, 0, 10) &&
    finite(n.heading, -1e6, 1e6) &&
    finite(n.phase, 0, Number.MAX_SAFE_INTEGER) &&
    typeof n.hostile === 'boolean' &&
    finite(n.cooldown, 0, 30) &&
    (n.stagger === undefined || finite(n.stagger, 0, 3)) &&
    finite(a.seed, -0xffffffff, 0xffffffff) &&
    ['skin', 'hair', 'coat', 'trim', 'trousers'].every(
      (k) => typeof a[k] === 'string' && /^#[0-9a-f]{3,8}$/i.test(a[k]),
    ) &&
    finite(a.height, 0.1, 10) &&
    finite(a.build, 0.1, 10) &&
    finite(a.hairStyle, 0, 100) &&
    finite(a.hat, 0, 100) &&
    typeof a.cloak === 'boolean' &&
    ['staff', 'sword', 'bow', 'none'].includes(a.weapon as string) &&
    (a.weaponSeed === undefined || finite(a.weaponSeed, 0, Number.MAX_SAFE_INTEGER)) &&
    (a.technology === undefined || (finite(a.technology, 0, 3) && Number.isInteger(a.technology)))
  );
}
