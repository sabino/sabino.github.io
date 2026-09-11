import { deriveSeed, random } from '../procedural/random.ts';
import type { ArchitecturalCulture, BuildingKind, Clan, NpcRole } from './types.ts';
import { STICHOS_CLIMATE_SEED } from './ecology.ts';

export interface CivilizationAxes {
  technology: number;
  industry: number;
  organics: number;
  spirituality: number;
  collectivism: number;
  scarcity: number;
  illumination: number;
  verticality: number;
  ornament: number;
  transparency: number;
}
export interface CivilizationProfile {
  seed: number;
  canonical: boolean;
  name: string;
  peopleName: string;
  eraName: string;
  originCityName: string;
  axes: CivilizationAxes;
  politics: { governance: string; leaderTitle: string; law: string; conflict: string };
  factions: Clan[];
  roleNames: Record<NpcRole, string>;
  lexicon: Record<
    | BuildingKind
    | 'radio'
    | 'notice'
    | 'shrine'
    | 'workbench'
    | 'lamp'
    | 'archive'
    | 'cequin'
    | 'heartleaf'
    | 'emberroot'
    | 'wood'
    | 'ore',
    string
  >;
  story: { arrival: string; mystery: string; tension: string; purpose: string };
}

export const STICHOS_CLANS: readonly Clan[] = [
  {
    id: 0,
    name: 'Brown',
    color: '#a68c6a',
    doctrine: 'Orlando advocates industrial production of food and medicine.',
  },
  {
    id: 1,
    name: 'Sallas',
    color: '#7faaa6',
    doctrine: 'Guard a family secret that may explain travel between minds.',
  },
  { id: 2, name: 'Veyr', color: '#aa8197', doctrine: 'Maintain the frostwood seed libraries.' },
  {
    id: 3,
    name: 'Ordel',
    color: '#9f9ab8',
    doctrine: 'Shelter travelers and record the winter roads.',
  },
  { id: 4, name: 'Meren', color: '#83a77f', doctrine: 'Restore living soil beneath the ice.' },
  {
    id: 5,
    name: 'Caldris',
    color: '#b08a76',
    doctrine: 'Keep the furnaces and long-range radios alive.',
  },
];
const pick = <T>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const value = (seed: number, name: string) =>
  deriveSeed(seed, 'v4-civilization-axis', name) / 0xffffffff;
const rounded = (v: number) => Math.round(clamp(v) * 1000) / 1000;
const cache = new Map<number, CivilizationProfile>();

/** Phonetic syllables combine independently; names belong to a world's sound family. */
function word(seed: number, family: number) {
  const rng = random(seed),
    offset = family % 3;
  const onset = [
    ['v', 's', 'm', 'n', 'l', 'r', 'th', 'f', 'c', 'd', 'br', 'vr'],
    ['k', 'zh', 't', 'd', 'q', 'g', 'vr', 'z', 'kr', 'n', 'kl', 'gr'],
    ['ch', 'b', 'w', 'h', 'j', 'p', 'sh', 'y', 'ph', 'c', 'l', 'm'],
  ][offset];
  const syllables = 2 + Math.floor(rng() * 1.4);
  let name = '';
  for (let i = 0; i < syllables; i++)
    name +=
      pick(onset, rng) +
      pick(['a', 'e', 'i', 'o', 'u', 'ai', 'ei'], rng) +
      (rng() > (i === syllables - 1 ? 0.48 : 0.82) ? pick(['n', 'r', 's', 'l', 'th'], rng) : '');
  return name[0].toUpperCase() + name.slice(1);
}
const hueColor = (hue: number, saturation: number, light: number) => {
  const c = (1 - Math.abs(2 * light - 1)) * saturation,
    x = c * (1 - Math.abs(((hue / 60) % 2) - 1)),
    m = light - c / 2;
  const rgb =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
export function civilizationTechnologyTier(profile: CivilizationProfile): 0 | 1 | 2 | 3 {
  return profile.axes.technology < 0.22
    ? 0
    : profile.axes.technology < 0.5
      ? 1
      : profile.axes.technology < 0.76
        ? 2
        : 3;
}
export function civilizationPlaceName(profile: CivilizationProfile, placeSeed: number): string {
  const rng = random(deriveSeed(placeSeed, 'v4-place-language'));
  const stem = word(deriveSeed(placeSeed, 'v4-place-stem'), profile.seed);
  const suffix =
    profile.axes.technology > 0.72
      ? pick([' Array', ' Reach', ' Junction', ' Spire', ' Relay'], rng)
      : profile.axes.industry > 0.66
        ? pick([' Works', ' Crossing', ' Furnace', ' Quay', ' Market'], rng)
        : pick(['', ' Vale', ' Haven', ' Hold', ' Orchard'], rng);
  return stem + suffix;
}
export function civilizationPersonName(profile: CivilizationProfile, personSeed: number): string {
  return `${word(deriveSeed(personSeed, 'v4-person-given'), profile.seed)} ${word(deriveSeed(personSeed, 'v4-person-family'), profile.seed)}`;
}

/** Independent axes can yield electronic agrarian societies, industrial theocracies, or organic city networks. */
export function civilizationFor(seed: number): CivilizationProfile {
  seed = Number.isFinite(seed) ? seed >>> 0 : 0;
  const cached = cache.get(seed);
  if (cached) return structuredClone(cached);
  const canonical = seed === STICHOS_CLIMATE_SEED;
  const technology = canonical ? 0.58 : value(seed, 'technology');
  const industry = canonical ? 0.41 : rounded(value(seed, 'industry') * 0.72 + technology * 0.28);
  const organics = canonical ? 0.94 : value(seed, 'organics');
  const spirituality = canonical ? 0.95 : value(seed, 'spirituality');
  const collectivism = canonical ? 0.76 : value(seed, 'collectivism');
  const scarcity = canonical ? 0.73 : value(seed, 'scarcity');
  const axes: CivilizationAxes = {
    technology: rounded(technology),
    industry: rounded(industry),
    organics: rounded(organics),
    spirituality: rounded(spirituality),
    collectivism: rounded(collectivism),
    scarcity: rounded(scarcity),
    illumination: rounded(technology * 0.58 + value(seed, 'illumination') * 0.42),
    verticality: rounded(industry * 0.36 + value(seed, 'verticality') * 0.64),
    ornament: rounded(spirituality * 0.42 + value(seed, 'ornament') * 0.58),
    transparency: rounded(technology * 0.34 + value(seed, 'transparency') * 0.66),
  };
  const rng = random(deriveSeed(seed, 'v4-civilization-language'));
  const techName =
    technology < 0.22
      ? 'Hearth'
      : technology < 0.5
        ? 'Forged'
        : technology < 0.76
          ? 'Mechanized'
          : 'Networked';
  const socialName =
    organics > 0.7
      ? 'Canopy'
      : spirituality > 0.68
        ? 'Reverie'
        : industry > 0.65
          ? 'Foundry'
          : collectivism > 0.65
            ? 'Commons'
            : 'Frontier';
  const eraName = canonical ? 'Stíchoi botanical radio age' : `${techName} ${socialName} Age`;
  const identity = word(deriveSeed(seed, 'v4-people'), seed);
  const name = canonical
    ? 'Stíchos'
    : `${identity} ${collectivism > 0.65 ? 'Concord' : spirituality > 0.68 ? 'Dominion' : technology > 0.76 ? 'Network' : 'Marches'}`;
  const governance = canonical
    ? 'Six hereditary priesthoods'
    : `${collectivism > 0.67 ? 'Federated' : collectivism < 0.3 ? 'Competing' : 'Contractual'} ${technology > 0.76 ? 'identity networks' : industry > 0.67 ? 'production syndicates' : spirituality > 0.67 ? 'temple houses' : 'settlement councils'}`;
  const leaderTitle = canonical
    ? 'priest'
    : technology > 0.76 && collectivism > 0.5
      ? 'consensus steward'
      : spirituality > 0.7
        ? 'oracle'
        : industry > 0.65
          ? 'factor'
          : collectivism < 0.3
            ? 'patron'
            : 'warden';
  const contested =
    scarcity > 0.66
      ? organics > 0.55
        ? 'fertile substrate'
        : 'power reserves'
      : technology > 0.73
        ? 'the ownership of recorded memory'
        : industry > 0.66
          ? 'who controls the workshops'
          : 'the right to settle common land';
  const law = canonical
    ? 'The Originals speak for their families; the Cúpula do Destino settles the hidden disputes.'
    : `${collectivism > 0.55 ? 'Shared holdings require a public witness' : 'Possession follows the registered custodian'}; ${technology > 0.75 ? 'identity records survive bodily death' : spirituality > 0.7 ? 'oaths are kept in the communal sanctum' : 'debts follow the household ledger'}.`;
  const factions = canonical
    ? STICHOS_CLANS.map((c) => ({ ...c }))
    : Array.from({ length: 6 }, (_, id): Clan => {
        const local = random(deriveSeed(seed, 'v4-faction', id));
        const title =
          technology > 0.76
            ? pick(['Collective', 'Protocol', 'Circuit', 'Syndicate', 'Assembly'], local)
            : industry > 0.64
              ? pick(['Union', 'Guild', 'Company', 'League'], local)
              : pick(['House', 'Circle', 'Pact', 'Fellowship'], local);
        const practice = pick(
          [
            'open stewardship',
            'exclusive licenses',
            'ancestral custody',
            'distributed ownership',
            'strict rationing',
            'unrestricted exchange',
          ],
          local,
        );
        const concern = pick(
          [
            'living materials',
            'energy',
            'travel permits',
            'memories',
            'water',
            'tools',
            'safe housing',
            'the orbital archives',
          ],
          local,
        );
        return {
          id,
          name: `${word(deriveSeed(seed, 'v4-faction-name', id), seed)} ${title}`,
          color: hueColor(
            (value(seed, 'faction-hue') * 360 + id * 59 + local() * 17) % 360,
            0.27 + technology * 0.28,
            0.52 + local() * 0.12,
          ),
          doctrine: `Advocates ${practice} of ${concern}; disputes ${contested}.`,
        };
      });
  const resourceName = (address: string, suffix: string) =>
    `${word(deriveSeed(seed, address), seed)} ${suffix}`;
  const lexicon: CivilizationProfile['lexicon'] = canonical
    ? {
        church: 'Cathedral',
        house: 'Family dwelling',
        inn: 'Wayfarer inn',
        workshop: 'Radio workshop',
        greenhouse: 'Botanical conservatory',
        storehouse: 'Provision storehouse',
        hall: 'Assembly hall',
        radio: 'Long-range radio',
        notice: 'Noticeboard',
        shrine: 'Memorial of borrowed lives',
        workbench: 'Botanical workbench',
        lamp: 'Lumen lantern',
        archive: 'botanical archive',
        cequin: 'Cequin',
        heartleaf: 'Heartleaf',
        emberroot: 'Emberroot',
        wood: 'Frostwood',
        ore: 'Iron-bearing stone',
      }
    : {
        church:
          spirituality > 0.65
            ? technology > 0.76
              ? 'Mnemonic sanctum'
              : 'Covenant temple'
            : technology > 0.76
              ? 'Identity exchange'
              : 'Civic observatory',
        house:
          technology > 0.76
            ? 'Residential cell'
            : industry > 0.65
              ? 'Worker residence'
              : 'Family dwelling',
        inn: technology > 0.76 ? 'Transit hostel' : 'Wayfarer lodge',
        workshop:
          technology > 0.76
            ? 'Fabrication atelier'
            : technology > 0.5
              ? 'Machine shop'
              : 'Artisan forge',
        greenhouse:
          organics > 0.65
            ? technology > 0.65
              ? 'Living-material nursery'
              : 'Seed conservatory'
            : technology > 0.7
              ? 'Hydroponic hall'
              : 'Medicinal garden',
        storehouse: technology > 0.76 ? 'Resource depot' : 'Provision storehouse',
        hall: technology > 0.76 ? 'Consensus exchange' : 'Assembly hall',
        radio:
          technology > 0.76
            ? 'Memory-network terminal'
            : technology > 0.5
              ? 'Signal relay'
              : 'Resonance beacon',
        notice: technology > 0.76 ? 'Public contract display' : 'Public ledger',
        shrine:
          spirituality > 0.65
            ? 'Witness altar'
            : technology > 0.76
              ? 'Identity memorial'
              : 'Founders’ memorial',
        workbench:
          technology > 0.76
            ? 'Material assembler'
            : technology > 0.5
              ? 'Precision workbench'
              : 'Crafting bench',
        lamp:
          technology > 0.76
            ? 'Luminous conduit'
            : technology > 0.5
              ? 'Arc lantern'
              : organics > 0.7
                ? 'Glowpod lantern'
                : 'Oil lantern',
        archive: technology > 0.76 ? 'memory archive' : 'sealed settlement archive',
        cequin: resourceName('v4-breath-herb', organics > 0.6 ? 'fronds' : 'bloom'),
        heartleaf: resourceName('v4-healing-herb', 'leaf'),
        emberroot: resourceName('v4-warmth-herb', 'root'),
        wood: resourceName('v4-timber', 'timber'),
        ore: resourceName('v4-ore', 'mineral'),
      };
  const roleNames: Record<NpcRole, string> = canonical
    ? {
        botanist: 'botanist',
        merchant: 'merchant',
        archivist: 'archivist',
        engineer: 'engineer',
        guard: 'guard',
        refugee: 'refugee',
        raider: 'raider',
        pilgrim: 'pilgrim',
      }
    : {
        botanist:
          technology > 0.76
            ? organics > 0.6
              ? 'biomaterial cultivator'
              : 'hydroponic medic'
            : 'herbal steward',
        merchant: technology > 0.76 ? 'contract broker' : 'provision trader',
        archivist:
          technology > 0.76
            ? 'memory archivist'
            : spirituality > 0.6
              ? 'oath keeper'
              : 'record keeper',
        engineer:
          technology > 0.76 ? 'systems fabricator' : technology > 0.5 ? 'machinist' : 'wright',
        guard: technology > 0.76 ? 'network sentinel' : 'ward guard',
        refugee: technology > 0.76 ? 'displaced resident' : 'unhoused traveler',
        raider: technology > 0.76 ? 'salvage corsair' : 'road reaver',
        pilgrim:
          spirituality > 0.6 ? 'oath traveler' : technology > 0.76 ? 'courier' : 'itinerant worker',
      };
  const profile: CivilizationProfile = {
    seed,
    canonical,
    name,
    peopleName: canonical ? 'Stíchoi' : identity + 'i',
    eraName,
    originCityName: canonical ? 'Vespera' : '',
    axes,
    politics: {
      governance,
      leaderTitle,
      law,
      conflict: canonical
        ? 'The Brown industrialization proposal threatens the other five botanical families.'
        : `${factions[0].name} and ${factions[1].name} disagree over ${contested}.`,
    },
    factions,
    roleNames,
    lexicon,
    story: {
      arrival: canonical
        ? 'A traveler from the future wakes inside the priest Theo Bishop on Stíchos.'
        : `A foreign awareness has entered an existing life in the ${name}. Its household, work and obligations existed before the arrival.`,
      mystery: canonical
        ? 'The Sallas secret may explain a transmission lost twenty stíchoi ago.'
        : `${pick(['A missing survey', 'An altered witness record', 'An impossible distress signal', 'An abandoned experiment', 'A repeated memory'], rng)} links ${factions[2].name} to ${pick(['the first consciousness crossing', 'a world absent from the public charts', 'people living under borrowed identities', 'an unseen settlement beyond the relay range'], rng)}.`,
      tension: canonical
        ? 'The priesthoods prepare for a war over botanical industrialization.'
        : `Daily life depends on ${organics > 0.65 ? 'cultivated living materials' : industry > 0.65 ? 'interdependent production lines' : 'local workshops and harvests'}, while the factions dispute ${contested}.`,
      purpose: canonical
        ? 'Discover the family secret while deciding how far Theo may change history.'
        : `Keep this life solvent, choose which witnesses to trust, and investigate the crossing without surrendering its identity to ${factions[3].name}.`,
    },
  };
  if (!canonical)
    profile.originCityName = civilizationPlaceName(profile, deriveSeed(seed, 'v4-origin-city'));
  cache.set(seed, profile);
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return structuredClone(profile);
}

function blendColor(a: string, b: string, amount: number): string {
  const aa = parseInt(a.slice(1), 16),
    bb = parseInt(b.slice(1), 16);
  return (
    '#' +
    [16, 8, 0]
      .map((shift) =>
        Math.round(((aa >> shift) & 255) * (1 - amount) + ((bb >> shift) & 255) * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Climate sets the structure; civilization contributes independent materials, fabrication and light. */
export function civilizationArchitecture(
  base: ArchitecturalCulture,
  profile: CivilizationProfile,
  settlementSeed: number,
): ArchitecturalCulture {
  if (profile.canonical) return base;
  const a = profile.axes,
    local = (value(settlementSeed, 'craft-adaptation') - 0.5) * 0.12;
  const technology = rounded(a.technology + local),
    industry = rounded(a.industry - local);
  const wallMaterial: ArchitecturalCulture['wallMaterial'] =
    technology > 0.84 && a.transparency > 0.63
      ? 'glass'
      : technology > 0.74 && a.organics > 0.64
        ? 'composite'
        : industry > 0.62 && technology > 0.48
          ? 'metal'
          : base.wallMaterial;
  const motif: NonNullable<ArchitecturalCulture['motif']> =
    a.organics > 0.72
      ? 'grown'
      : technology > 0.76
        ? 'circuit'
        : industry > 0.62
          ? 'riveted'
          : a.transparency > 0.62
            ? 'latticed'
            : 'carved';
  return {
    ...base,
    wallMaterial,
    wallColor:
      wallMaterial === 'glass'
        ? blendColor(base.wallColor, '#568fa0', 0.55)
        : wallMaterial === 'metal'
          ? blendColor(base.wallColor, '#83939c', 0.62)
          : wallMaterial === 'composite'
            ? blendColor(base.wallColor, '#739a8d', 0.45)
            : base.wallColor,
    roofColor: industry > 0.65 ? blendColor(base.roofColor, '#525c6e', 0.35) : base.roofColor,
    technology,
    industry,
    organics: a.organics,
    illumination: a.illumination,
    transparency: a.transparency,
    verticality: a.verticality,
    ornament: a.ornament,
    motif,
    eraName: profile.eraName,
  };
}
