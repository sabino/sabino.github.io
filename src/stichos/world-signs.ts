import type { BuildingKind, Point, Prop, Settlement, Tile } from './types.ts';
import {
  doorAccess,
  type CivicAddress,
  type CivicFaction,
  type CivicWorld,
  type DoorAccess,
  type DoorAccessInput,
  type Heraldry,
} from './civic-world.ts';

/** Original silhouette grammar. Every color also has a stable shape and spoken name. */
export type SignSymbol =
  | 'home'
  | 'inn'
  | 'temple'
  | 'workshop'
  | 'farm'
  | 'store'
  | 'civic'
  | 'guard'
  | 'guild'
  | 'road'
  | 'danger'
  | 'dungeon';
export interface SignLine {
  key: string;
  text: string;
  kind: 'information' | 'service' | 'access' | 'warning';
  values?: Record<string, string | number>;
}
export interface WorldSign extends CivicAddress {
  id: string;
  symbol: SignSymbol;
  title: string;
  compactTitle: string;
  subtitle: string;
  lines: SignLine[];
  heraldry?: Heraldry;
  access?: DoorAccess;
  inspectDistance: number;
  accessibleLabel: string;
  mapSymbol: SignSymbol;
}
export interface SignContext {
  actorId: string;
  hour: number;
  civic?: CivicWorld;
  ownerId?: string;
  ownerName?: string;
  guests?: readonly string[];
  keys?: readonly string[];
  locked?: boolean;
  publicAccess?: boolean;
  price?: number;
  notices?: readonly string[];
  faction?: CivicFaction;
  /** Services verified from actual nearby props, current workers or owned property. */
  services?: readonly SignService[];
  /** The authority's actual estate/guest/key/hour result, when it differs from civic defaults. */
  access?: DoorAccess;
}
export type SignService =
  | 'rest'
  | 'workbench'
  | 'storage'
  | 'production'
  | 'garden'
  | 'trade'
  | 'guild-contact'
  | 'food-preparation';
const SYMBOL: Record<BuildingKind, SignSymbol> = {
  house: 'home',
  inn: 'inn',
  church: 'temple',
  workshop: 'workshop',
  greenhouse: 'farm',
  storehouse: 'store',
  hall: 'civic',
};
const PURPOSE: Record<BuildingKind, string> = {
  house: 'Residence',
  inn: 'Inn',
  church: 'Temple',
  workshop: 'Workshop',
  greenhouse: 'Growing house',
  storehouse: 'Storehouse',
  hall: 'Civic hall',
};
const SERVICES: Record<SignService, string> = {
  rest: 'Rest at the furnished home, bench or shrine',
  workbench: 'Workbench · bring tools and crafting materials',
  storage: 'Estate storage · owner permission required',
  production: 'Workstations · assign workers, inputs and paid jobs in Estates',
  garden: 'Growing beds · planting and tending supplies required',
  trade: 'Merchant nearby · field supplies can be sold while the merchant is awake',
  'guild-contact': 'Guild contact nearby · speak in person to join or report a duty',
  'food-preparation': 'Hearth preparation · bring the recipe ingredients',
};
const text = (value: string, max = 180) =>
  Array.from(value.replace(/[\u0000-\u001f]/g, ' '))
    .slice(0, max)
    .join('');
export function compactSignTitle(value: string, limit = 30) {
  const points = Array.from(text(value));
  const count = Math.max(8, Math.min(60, Math.trunc(limit) || 30));
  return points.length > count ? points.slice(0, count - 1).join('') + '…' : points.join('');
}
function finish(
  sign: Omit<WorldSign, 'compactTitle' | 'accessibleLabel' | 'mapSymbol' | 'inspectDistance'>,
): WorldSign {
  const title = text(sign.title),
    subtitle = text(sign.subtitle);
  const lines = sign.lines.map((line) => ({ ...line, text: text(line.text) }));
  return {
    ...sign,
    title,
    subtitle,
    lines,
    compactTitle: compactSignTitle(title),
    accessibleLabel: [title, subtitle, ...lines.map((l) => l.text)].join('. '),
    mapSymbol: sign.symbol,
    inspectDistance: 2.8,
  };
}
/** Uses actual generated door/building IDs and tile semantics; never fabricates a parallel building. */
export function signForProp(
  prop: Prop,
  tile: Tile,
  settlement: Settlement | undefined,
  context: SignContext,
): WorldSign | undefined {
  const kind = tile.buildingKind;
  if (prop.kind === 'door' && prop.building && kind) {
    const accessInput: DoorAccessInput = {
      door: prop,
      tile,
      settlement,
      actorId: context.actorId,
      hour: context.hour,
      ownerId: context.ownerId,
      guests: context.guests,
      keys: context.keys,
      locked: context.locked,
      publicAccess: context.publicAccess,
    };
    const authorityAccess = context.access ?? doorAccess(accessInput);
    const access =
      authorityAccess.reason === 'public'
        ? { ...authorityAccess, label: 'Public entry · open now' }
        : authorityAccess;
    const faction = context.faction;
    const lines: SignLine[] = [
      { key: 'sign.access', text: access.label, kind: access.allowed ? 'access' : 'warning' },
      {
        key: 'sign.owner',
        text: context.ownerName
          ? `Keeper: ${text(context.ownerName)}`
          : context.ownerId
            ? 'Registered private holding'
            : kind === 'house' || kind === 'storehouse'
              ? 'Private household · ask before entering'
              : 'Local community building',
        kind: 'information',
      },
    ];
    if (settlement)
      lines.push({
        key: 'sign.district',
        text: `District: ${text(settlement.name)}`,
        kind: 'information',
        values: { place: settlement.name },
      });
    // Building appearance is not proof of a shop, ceremony, workbench or rentable bed.
    // Only the inn's ingredient-based field hearth is guaranteed by its actual tile rule.
    const services = new Set<SignService>(
      context.services ?? (kind === 'inn' ? ['food-preparation'] : []),
    );
    for (const service of services)
      if (Object.hasOwn(SERVICES, service))
        lines.push({ key: `sign.service.${service}`, text: SERVICES[service], kind: 'service' });
    if (faction)
      lines.push(
        { key: 'sign.guild', text: faction.name, kind: 'information' },
        { key: 'sign.guild.charter', text: faction.principles, kind: 'information' },
      );
    if (context.price !== undefined && Number.isFinite(context.price) && context.price >= 0)
      lines.push({
        key: 'sign.price',
        text: `Listed price: ${Math.round(context.price)} field coin`,
        kind: 'information',
        values: { price: Math.round(context.price) },
      });
    if (settlement && context.civic)
      lines.push({
        key: 'sign.law',
        text: context.civic.lawsFor(settlement).description,
        kind: 'information',
      });
    for (const notice of context.notices?.slice(0, 3) ?? [])
      lines.push({ key: 'sign.notice', text: text(notice), kind: 'information' });
    return finish({
      id: `sign:${prop.id}`,
      spaceId: 'surface',
      x: prop.x,
      y: prop.y,
      symbol: faction ? 'guild' : SYMBOL[kind],
      title: prop.name,
      subtitle: PURPOSE[kind],
      lines,
      access,
      heraldry: faction?.heraldry,
    });
  }
  if (prop.kind === 'notice' && settlement) {
    const guilds = context.civic?.factionsFor(settlement) ?? [];
    return finish({
      id: `sign:${prop.id}`,
      spaceId: 'surface',
      x: prop.x,
      y: prop.y,
      symbol: 'civic',
      title: settlement.name,
      subtitle: 'Town noticeboard',
      lines: [
        {
          key: 'sign.town.kind',
          text: `${settlement.rank ?? 'Settlement'} · ${settlement.kind === 'foundry' ? 'production district' : settlement.kind === 'cathedral' ? 'temple district' : 'residential district'}`,
          kind: 'information',
        },
        ...(context.civic
          ? [
              {
                key: 'sign.law',
                text: context.civic.lawsFor(settlement).description,
                kind: 'information' as const,
              },
            ]
          : []),
        ...guilds.map((g) => ({
          key: 'sign.charter',
          text: `${g.heraldry.label}: ${g.principles}`,
          kind: 'service' as const,
        })),
        ...(context.notices?.slice(0, 3) ?? []).map((n) => ({
          key: 'sign.notice',
          text: text(n),
          kind: 'information' as const,
        })),
      ],
    });
  }
  if (prop.kind === 'banner' && context.faction)
    return finish({
      id: `sign:${prop.id}`,
      spaceId: 'surface',
      x: prop.x,
      y: prop.y,
      symbol: 'guild',
      title: context.faction.name,
      subtitle: 'Guild colors and charter',
      heraldry: context.faction.heraldry,
      lines: [
        { key: 'sign.charter', text: context.faction.principles, kind: 'information' },
        {
          key: 'sign.symbol',
          text: `${context.faction.heraldry.symbol} on a ${context.faction.heraldry.shape}`,
          kind: 'information',
        },
      ],
    });
  return undefined;
}
export function roadSign(
  origin: Point,
  settlement: Settlement,
  destinations: readonly Settlement[],
): WorldSign {
  const nearby = destinations
    .filter((s) => s.id !== settlement.id)
    .map((s) => ({ town: s, dist: Math.hypot(s.x - origin.x, s.y - origin.y) }))
    .sort((a, b) => a.dist - b.dist || a.town.id.localeCompare(b.town.id))
    .slice(0, 4);
  const direction = (p: Point) => {
    const dx = p.x - origin.x,
      dy = p.y - origin.y;
    return Math.abs(dx) > Math.abs(dy) * 2
      ? dx > 0
        ? 'east'
        : 'west'
      : Math.abs(dy) > Math.abs(dx) * 2
        ? dy > 0
          ? 'south'
          : 'north'
        : `${dy > 0 ? 'south' : 'north'}${dx > 0 ? 'east' : 'west'}`;
  };
  return finish({
    id: `road-sign:${settlement.id}:${origin.x}:${origin.y}`,
    spaceId: 'surface',
    ...origin,
    symbol: 'road',
    title: `Roads from ${settlement.name}`,
    subtitle: 'Straight-line bearings · terrain may lengthen the journey',
    lines: nearby.length
      ? nearby.map(({ town, dist }) => ({
          key: 'sign.direction',
          text: `${text(town.name)} · ${direction(town)} · ${Math.ceil(dist)} tiles`,
          kind: 'information',
          values: { place: town.name, direction: direction(town), distance: Math.ceil(dist) },
        }))
      : [
          {
            key: 'sign.unknown-road',
            text: 'No other settlement has been surveyed nearby.',
            kind: 'information',
          },
        ],
  });
}
export function inspectWorldSign(
  sign: WorldSign,
  viewer: CivicAddress,
): { ok: boolean; message: string; sign?: WorldSign } {
  if (
    viewer.spaceId !== sign.spaceId ||
    !Number.isFinite(viewer.x) ||
    !Number.isFinite(viewer.y) ||
    Math.hypot(viewer.x - sign.x, viewer.y - sign.y) > sign.inspectDistance
  )
    return { ok: false, message: 'Move closer to read this sign.' };
  return { ok: true, message: sign.accessibleLabel, sign: structuredClone(sign) };
}

/** Canvas code-native glyphs. Call with >=16 CSS px on world signs, >=24 px in panels. */
export function drawSignSymbol(
  c: CanvasRenderingContext2D,
  symbol: SignSymbol,
  x: number,
  y: number,
  size: number,
  ink = '#f1e4c4',
  background = '#172732',
) {
  if (![x, y, size].every(Number.isFinite) || size <= 0) return;
  c.save();
  c.translate(x, y);
  c.scale(size / 24, size / 24);
  c.fillStyle = background;
  c.fillRect(0, 0, 24, 24);
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = 2;
  c.lineCap = 'square';
  c.lineJoin = 'miter';
  const line = (points: number[]) => {
    c.beginPath();
    c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
    c.stroke();
  };
  switch (symbol) {
    case 'home':
      line([4, 11, 12, 4, 20, 11]);
      line([6, 10, 6, 20, 18, 20, 18, 10]);
      c.fillRect(10, 14, 4, 6);
      break;
    case 'inn':
      c.fillRect(5, 6, 14, 3);
      c.fillRect(6, 9, 3, 8);
      c.fillRect(15, 9, 3, 8);
      line([5, 20, 5, 17, 19, 17, 19, 20]);
      c.fillRect(10, 11, 3, 3);
      break;
    case 'temple':
      line([4, 20, 20, 20]);
      line([6, 20, 6, 10, 12, 4, 18, 10, 18, 20]);
      line([12, 9, 12, 16]);
      line([9, 12, 15, 12]);
      break;
    case 'workshop':
      line([6, 19, 16, 7]);
      c.fillRect(12, 4, 8, 5);
      line([4, 17, 7, 20]);
      break;
    case 'farm':
      line([12, 21, 12, 7]);
      line([12, 15, 5, 10, 5, 5, 10, 8, 12, 12]);
      line([12, 11, 17, 5, 20, 5, 19, 11, 12, 15]);
      break;
    case 'store':
      line([4, 20, 4, 9, 20, 9, 20, 20, 4, 20]);
      line([3, 8, 6, 4, 18, 4, 21, 8]);
      line([8, 13, 16, 13]);
      line([12, 10, 12, 19]);
      break;
    case 'civic':
      line([4, 8, 12, 3, 20, 8, 4, 8]);
      line([6, 10, 6, 18]);
      line([12, 10, 12, 18]);
      line([18, 10, 18, 18]);
      line([4, 21, 20, 21]);
      break;
    case 'guard':
      line([5, 5, 12, 3, 19, 5, 18, 15, 12, 21, 6, 15, 5, 5]);
      line([9, 11, 12, 14, 16, 9]);
      break;
    case 'guild':
      line([6, 21, 6, 3, 19, 3, 16, 8, 19, 13, 6, 13]);
      line([9, 6, 13, 10, 16, 6]);
      break;
    case 'road':
      line([12, 22, 12, 3]);
      line([3, 8, 17, 8, 21, 11, 17, 14, 3, 14, 3, 8]);
      break;
    case 'danger':
      line([12, 3, 22, 20, 2, 20, 12, 3]);
      line([12, 9, 12, 14]);
      c.fillRect(11, 16, 2, 2);
      break;
    case 'dungeon':
      line([3, 20, 3, 11, 6, 5, 18, 5, 21, 11, 21, 20]);
      line([7, 20, 7, 16, 11, 16, 11, 12, 15, 12, 15, 9]);
      break;
  }
  c.restore();
}
