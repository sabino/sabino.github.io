import { civilizationFor } from './civilization.ts';
/** Everyone uses this address space. A seed is an address, never a private universe. */
export const UNIVERSE_ID = 'verso-1';
export const STICHOS_SEED = 0x53544943;
export type Geography = 1 | 2 | 3 | 4;
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
export function publicRoomCode(seed: number, generation: Geography = 4) {
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
export function planetAt(seed: number, generation: Geography = 4): Planet {
  seed >>>= 0;
  const civilization = generation >= 4 ? civilizationFor(seed) : undefined;
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
    climate: civilization
      ? civilization.axes.organics > 0.7
        ? 'Lush forests, wetlands and highland ecologies'
        : civilization.axes.scarcity > 0.65
          ? 'Mineral deserts, temperate valleys and glacial highlands'
          : 'Forests, inland seas and varied regional climates'
      : [
          'Frostwood and glacial seas',
          'Highland tundra and winter marsh',
          'Icebound botanical settlements',
          'Cold forests and mineral ridges',
        ][h % 4],
    signal: civilization
      ? `${civilization.eraName} · ${civilization.politics.governance}`
      : [
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
/** A complete browser-room address: generator, planet, room and typo checksum.
 * Decoding is local; reaching the host is a separate step. Legacy bare IDs still work.
 */
function addressChecksum(value: string) {
  let hash = 0x811c9dc5;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-4);
}
export function roomAddress(invite: PlanetAddress & { room: string }) {
  const room = validRoomCode(invite.room);
  if (
    !room ||
    !Number.isInteger(invite.seed) ||
    invite.seed < 0 ||
    invite.seed > 0xffffffff ||
    ![1, 2, 3, 4].includes(invite.generation)
  )
    throw Error('Invalid room address.');
  const body = `V${invite.generation}-${invite.seed.toString(36).toUpperCase()}-${room}`;
  return `${body}-${addressChecksum(body)}`;
}
export function readRoomAddress(raw: string): RoomInvitation | null {
  const code = raw.trim().toUpperCase();
  const match = /^V([1-4])-([A-Z0-9]{1,7})-([A-Z0-9]{4,16})-([A-Z0-9]{4})$/.exec(code);
  if (!match || addressChecksum(code.slice(0, -5)) !== match[4]) return null;
  const seed = parseInt(match[2], 36);
  if (seed > 0xffffffff || seed.toString(36).toUpperCase() !== match[2]) return null;
  return { seed, generation: Number(match[1]) as Geography, room: match[3], endpoint: 'peer:' };
}
/** A readable display name; the complete code remains the unambiguous address. */
export function roomTitle(room: string) {
  const value = parseInt(addressChecksum(room.toUpperCase()), 36);
  const adjectives = ['Amber', 'Silver', 'Copper', 'Jade', 'Velvet', 'Azure', 'Silent', 'Golden'];
  const places = [
    'Harbor',
    'Orchard',
    'Haven',
    'Lantern',
    'Workshop',
    'Garden',
    'Observatory',
    'Crossing',
  ];
  return `${adjectives[value % 8]} ${places[(value >>> 3) % 8]}`;
}
export function readRoomInput(raw: string): RoomInvitation | null {
  return readRoomAddress(raw) ?? readRoomLink(raw);
}
export function roomLink(base: string, invite: RoomInvitation) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', roomAddress(invite));
  if (invite.endpoint !== 'peer:') url.searchParams.set('server', invite.endpoint);
  return url.href;
}
export function readRoomLink(raw: string): RoomInvitation | null {
  try {
    const url = new URL(raw);
    const packed = url.searchParams.get('join');
    const decoded = packed ? readRoomAddress(packed) : null;
    if (packed && !decoded) return null;
    const room = decoded?.room ?? validRoomCode(url.searchParams.get('room') || '');
    const seedText = decoded ? String(decoded.seed) : url.searchParams.get('planet'),
      seed = Number(seedText),
      generation = decoded?.generation ?? Number(url.searchParams.get('g') || 3);
    const endpoint = url.searchParams.get('server') || 'peer:';
    if (
      !room ||
      !seedText ||
      !/^\d{1,10}$/.test(seedText) ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 0xffffffff ||
      ![1, 2, 3, 4].includes(generation)
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
          [1, 2, 3, 4].includes(p.generation) &&
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
