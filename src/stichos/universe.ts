/** Everyone uses this address space. A seed is an address, never a private universe. */
export const UNIVERSE_ID = 'verso-1';
export const STICHOS_SEED = 0x53544943;
export type Geography = 1 | 2 | 3;
export interface PlanetAddress {
  seed: number;
  generation: Geography;
}
export interface RoomInvitation extends PlanetAddress {
  room: string;
  endpoint: string;
  public?: boolean;
}
/** A shared meeting frequency lets strangers on the same planet find one another. */
export function publicRoomCode(seed: number, generation: Geography = 3) {
  return `U${generation}${(seed >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}
export interface Planet extends PlanetAddress {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  radius: number;
  climate: string;
  signal: string;
}
function mix(value: number) {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
export function planetAt(seed: number, generation: Geography = 3): Planet {
  seed >>>= 0;
  const h = mix(seed),
    a = ['Ae', 'Mira', 'Or', 'Vela', 'Thes', 'Iri', 'Cal', 'Sere'];
  const b = ['neth', 'lios', 'vane', 'dara', 'mora', 'thia', 'las', 'phos'];
  return {
    seed,
    generation,
    id: `${UNIVERSE_ID}:${seed}:${generation}`,
    name:
      seed === STICHOS_SEED ? 'Stíchos' : `${a[h % 8]}${b[(h >>> 4) % 8]} ${1 + ((h >>> 12) % 99)}`,
    x: ((h & 0xffff) / 65535) * 1800 - 900,
    y: ((mix(h) & 0xffff) / 65535) * 1100 - 550,
    color: ['#82b9cb', '#b9b68b', '#b098c6', '#8ebfa5', '#c68e79'][h % 5],
    radius: 9 + ((h >>> 8) % 9),
    climate: [
      'Frostwood and glacial seas',
      'Highland tundra and winter marsh',
      'Icebound botanical settlements',
      'Cold forests and mineral ridges',
    ][h % 4],
    signal: [
      'Botanical societies',
      'Six family territories',
      'Industrial radio traffic',
      'Unmapped rural settlements',
    ][(h >>> 2) % 4],
  };
}
export function sectorPlanets(sector = 0): Planet[] {
  return Array.from({ length: 48 }, (_, i) =>
    planetAt(
      sector === 0 && i === 0
        ? STICHOS_SEED
        : mix(0x56455253 ^ Math.imul(sector + 1, 9811) ^ Math.imul(i + 1, 104729)),
    ),
  );
}
export function validRoomCode(raw: string) {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}
export function roomLink(base: string, invite: RoomInvitation) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', invite.room);
  url.searchParams.set('planet', String(invite.seed >>> 0));
  url.searchParams.set('g', String(invite.generation));
  if (invite.endpoint !== 'peer:') url.searchParams.set('server', invite.endpoint);
  return url.href;
}
export function readRoomLink(raw: string): RoomInvitation | null {
  try {
    const url = new URL(raw),
      room = validRoomCode(url.searchParams.get('room') || '');
    const seedText = url.searchParams.get('planet'),
      seed = Number(seedText),
      generation = Number(url.searchParams.get('g') || 3);
    const endpoint = url.searchParams.get('server') || 'peer:';
    if (
      !room ||
      !seedText ||
      !/^\d{1,10}$/.test(seedText) ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 0xffffffff ||
      ![1, 2, 3].includes(generation)
    )
      return null;
    if (endpoint !== 'peer:') {
      const server = new URL(endpoint);
      if (
        !['ws:', 'wss:'].includes(server.protocol) ||
        server.username ||
        server.password ||
        endpoint.length > 240
      )
        return null;
      // An HTTPS invitation must never downgrade its game channel.
      if (url.protocol === 'https:' && server.protocol !== 'wss:') return null;
    }
    return { room, seed, generation: generation as Geography, endpoint };
  } catch {
    return null;
  }
}
export interface KnownWorld extends PlanetAddress {
  visitedAt: number;
  room?: string;
  endpoint?: string;
  name?: string;
}
const chartKey = 'verso.universe.chart.v1';
export function knownWorlds(): KnownWorld[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(chartKey) || '[]');
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (p): p is KnownWorld =>
          !!p &&
          Number.isInteger(p.seed) &&
          p.seed >= 0 &&
          p.seed <= 0xffffffff &&
          [1, 2, 3].includes(p.generation) &&
          Number.isFinite(p.visitedAt),
      )
      .slice(-128);
  } catch {
    return [];
  }
}
export function rememberWorld(world: KnownWorld) {
  const worlds = knownWorlds().filter(
    (p) => p.seed !== world.seed || p.generation !== world.generation || p.room !== world.room,
  );
  worlds.push(world);
  localStorage.setItem(chartKey, JSON.stringify(worlds.slice(-128)));
}
/** Private local continuity, never accepted as proof by another world authority. */
export function stashLife(seed: number, generation: Geography, data: string) {
  localStorage.setItem(`verso.life.${seed >>> 0}.${generation}`, data);
}
export function rememberedLife(seed: number, generation: Geography) {
  return localStorage.getItem(`verso.life.${seed >>> 0}.${generation}`);
}
