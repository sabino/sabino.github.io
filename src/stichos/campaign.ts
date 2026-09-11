import { deriveSeed, random } from '../procedural/random.ts';
import { InfiniteWorld, STOP_SPACING, ORIGIN_CITY_NAME, type VaultSite } from './world.ts';
import type { ItemId, Point, Settlement } from './types.ts';

export type CampaignKind =
  | 'talk'
  | 'delivery'
  | 'choice'
  | 'puzzle'
  | 'encounter'
  | 'archive'
  | 'decode'
  | 'ending';
export interface CampaignChoice {
  id: string;
  label: string;
  text: string;
  trust: [number, number][];
}
export interface CampaignStep {
  id: string;
  act: number;
  kind: CampaignKind;
  title: string;
  text: string;
  result: string;
  town: Settlement;
  target: Point & { id: string };
  cost?: Partial<Record<ItemId, number>>;
  choices?: CampaignChoice[];
  answer?: string;
  options?: [string, string][];
  vault?: VaultSite;
  lamps?: { id: string; x: number; y: number; name: string; channel: number }[];
  reward: { coins: number; xp: number; items?: Partial<Record<ItemId, number>> };
}
export interface CampaignPlan {
  seed: number;
  generation: number;
  acts: readonly string[];
  steps: CampaignStep[];
  towns: Settlement[];
}
export interface CampaignState {
  version: 1;
  started: boolean;
  step: number;
  puzzle: number;
  choices: Record<string, string>;
  evidence: string[];
  ending: null | 'return-link' | 'stay';
}
export const CAMPAIGN_ACTS = [
  'The broken address',
  'What Sallas preserved',
  'The price of abundance',
  'A council of living witnesses',
  'The missing return',
  'A choice made awake',
] as const;
export const CAMPAIGN_LENGTH = 24;
export function createCampaignState(): CampaignState {
  return {
    version: 1,
    started: false,
    step: 0,
    puzzle: -1,
    choices: {},
    evidence: [],
    ending: null,
  };
}

/** Authored adaptation, assembled around actual seeded settlements and excavations. */
export function buildCampaign(world: InfiniteWorld): CampaignPlan {
  const origin = world.settlementsAround(0, 0, 1)[0]!;
  const all = new Map<string, Settlement>();
  if (world.generation === 3) {
    for (const town of world.settlementsAround(0, 0, 1500)) all.set(town.id, town);
  } else {
    for (const x of [-160, 0, 160])
      for (const y of [-160, 0, 160])
        for (const town of world.settlementsAround(x, y, 128)) all.set(town.id, town);
  }
  const used = new Set(['origin']);
  const chooseTown = (clan: number) => {
    const candidates = [...all.values()].filter((t) => !used.has(t.id));
    candidates.sort(
      (a, b) =>
        Number(b.clan === clan) - Number(a.clan === clan) ||
        Number(b.rank === 'city') - Number(a.rank === 'city') ||
        Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) ||
        deriveSeed(world.seed, 'campaign-town', a.id) -
          deriveSeed(world.seed, 'campaign-town', b.id),
    );
    const selected = candidates[0] ?? origin;
    used.add(selected.id);
    return selected;
  };
  const towns = [origin, chooseTown(1), chooseTown(0), chooseTown(2), chooseTown(5), origin];
  const spacing = world.generation === 3 ? STOP_SPACING : 80;
  const usedVaults = new Set<string>();
  const chooseVault = (town: Settlement) => {
    const gx = Math.floor(town.x / spacing),
      gy = Math.floor(town.y / spacing),
      sites: VaultSite[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round((gx + dx + 0.5) * spacing),
          y = Math.round((gy + dy + 0.5) * spacing);
        for (const site of world.vaultsAround(x, y, 2))
          if (!usedVaults.has(site.id)) sites.push(site);
      }
    sites.sort(
      (a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y),
    );
    // Generation-one lives predate excavations. Their restored radio opens the same
    // investigation through genuine civic archives rather than changing old terrain.
    const site = sites[0];
    if (site) usedVaults.add(site.id);
    return site;
  };
  const vaults = [chooseVault(towns[1]), chooseVault(towns[2]), chooseVault(towns[4])];
  const npc = (town: Settlement, role: 'archivist' | 'engineer' | 'botanist') => {
    const id =
      town.id === 'origin'
        ? `origin-${role}`
        : `${town.id}:resident:${role === 'botanist' ? 0 : role === 'archivist' ? 1 : 2}`;
    const offset =
      role === 'archivist'
        ? { x: 0, y: -8 }
        : role === 'engineer'
          ? { x: 4, y: 4 }
          : { x: -3, y: 4 };
    if (town.rank === 'hamlet' && role !== 'botanist')
      return { id: `${town.id}:notice`, x: town.x - 2, y: town.y + 1 };
    return { id, x: town.x + offset.x, y: town.y + offset.y };
  };
  const radio = (town: Settlement) => ({
    id: town.id === 'origin' ? 'origin-radio' : `${town.id}:radio`,
    x: town.x + 3,
    y: town.y + 1,
  });
  const board = (town: Settlement) => ({ id: `${town.id}:notice`, x: town.x - 2, y: town.y + 1 });
  const steps: CampaignStep[] = [];
  const add = (
    act: number,
    kind: CampaignKind,
    title: string,
    text: string,
    result: string,
    extra: Partial<CampaignStep> = {},
  ) => {
    const town = towns[act];
    const id = `sallas:${steps.length.toString().padStart(2, '0')}`;
    steps.push({
      id,
      act,
      kind,
      title,
      text,
      result,
      town,
      target: npc(town, 'archivist'),
      reward: { coins: 18 + act * 5, xp: 35 + act * 10 },
      ...extra,
    });
  };
  const choice = (
    id: string,
    label: string,
    text: string,
    trust: [number, number][],
  ): CampaignChoice => ({ id, label, text, trust });
  const puzzle = (act: number) => {
    const town = towns[act],
      rng = random(deriveSeed(world.seed, 'campaign-resonance', act));
    const lamps = [
      [-3, -3, 'northwest'],
      [3, -3, 'northeast'],
      [3, 3, 'southeast'],
      [-3, 3, 'southwest'],
    ] as const;
    const order = lamps.map(([x, y, name]) => ({
      id: `${town.id}:lamp:${x}:${y}`,
      x: town.x + x,
      y: town.y + y,
      name,
      channel: Math.floor(rng() * 3),
    }));
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { target: radio(town), lamps: order };
  };
  const encounter = (act: number, vault: VaultSite | undefined) => {
    if (!vault)
      return {
        target: board(towns[act]),
        cost: { salve: 2, rations: 3 },
        text: 'The civic archive shelters a displaced convoy. Supply medicine and food, or sponsor their shelter for forty coins. Their testimony survives here, in the older inhabited world.',
      };
    return {
      vault,
      target: {
        id: `${vault.id}:notice`,
        x: vault.entrance.x + 1,
        y: Math.round((Math.floor(vault.y / spacing) + 1) * spacing) - 1,
      },
      cost: { salve: 2, rations: 3 },
    };
  };
  const archive = (act: number, vault: VaultSite | undefined) =>
    vault
      ? { vault, target: { id: `${vault.id}:cache`, ...vault.reward } }
      : { target: npc(towns[act], 'archivist') };

  add(
    0,
    'talk',
    'An address with one digit missing',
    'The repaired radio repeats an incomplete return address. The archivist asks you to compare its fragments against independent records, rather than trust the voice merely because you wanted to hear it.',
    'The first copy records a missing acknowledgement. Someone preserved the address, but the copy alone cannot explain the failure.',
  );
  add(
    0,
    'delivery',
    'Care before experimentation',
    'The clinic can safely observe the old signal only while its patients have ordinary care. Bring two salves and two dressings. These supplies are used, not collateral for a dangerous trial.',
    'The clinic shares observations of breathing and memory under normal treatment.',
    { target: npc(origin, 'botanist'), cost: { salve: 2, bandage: 2 } },
  );
  add(
    0,
    'choice',
    'Whose names belong in the record?',
    'Two witnesses describe the same pulse. One fears family retaliation. Decide how their statements will travel.',
    'Two separately attributed accounts enter Theo’s memory.',
    {
      target: npc(origin, 'botanist'),
      choices: [
        choice(
          'protect',
          'Keep the witnesses anonymous',
          'Their observations are shared without identifying the patients.',
          [
            [2, 8],
            [0, -3],
          ],
        ),
        choice(
          'publish',
          'Publish the signed observations',
          'The signed record can be challenged openly; Brown gains a public account.',
          [
            [0, 7],
            [2, -3],
          ],
        ),
      ],
    },
  );
  add(
    0,
    'puzzle',
    'Four lamps, one quiet interval',
    'The plaza lamps have independent coils. Tune them in the listed order, then return to the radio. A wrong coil or channel breaks the alignment and requires a fresh sequence.',
    'The local address stabilizes. It points to a surviving Sallas record outside Vespera.',
    puzzle(0),
  );

  add(
    1,
    'talk',
    'The family that kept a copy',
    `The archive in ${towns[1].name} holds a Sallas copy excluded from the public register. Ask what its author actually claimed.`,
    'Sallas described transmission as a relation between living minds, not ownership of another body.',
  );
  add(
    1,
    'encounter',
    'A passage owed to people',
    'Raiders occupy an abandoned archive. Offer two salves and three rations to secure passage, or face both guards. Either route must account for the people on the road.',
    'The archive passage is accessible.',
    encounter(1, vaults[0]),
  );
  add(
    1,
    'archive',
    'The first independent ledger',
    'Reach the deep botanical cache and read its surviving transmission ledger. Previously recovered records can be read again without another material reward.',
    'A dated ledger distinguishes a willing acknowledgement from a forced occupation. The safe return protocol required an answer from both ends.',
    archive(1, vaults[0]),
  );
  add(
    1,
    'decode',
    'What counts as an answer?',
    'The ledger contrasts an imposed voice with an acknowledgement offered by another mind. Which condition did its safe protocol require?',
    'The first address fragment is verified against the ledger.',
    {
      target: radio(towns[1]),
      answer: 'willing',
      options: [
        ['willing', 'A willing acknowledgement at both ends'],
        ['silence', 'Silence from the receiving body'],
        ['rank', 'The speaker’s religious rank'],
      ],
    },
  );

  add(
    2,
    'delivery',
    'An instrument Brown can inspect',
    'The foundry engineer will compare industrial interference with a separate receiver. Bring six timber, eight ore and two crafted lenses. Keep this instrument independent from the factory being tested.',
    'An independently powered receiver separates machinery noise from the older failure.',
    { target: npc(towns[2], 'engineer'), cost: { wood: 6, ore: 8, lens: 2 } },
  );
  add(
    2,
    'choice',
    'Who controls the measurement?',
    'Brown offers a public trial; the clinic asks for a binding limit on production until measurements are shared. Neither side is entitled to an invented certainty.',
    'The agreement changes who may inspect the receiver.',
    {
      target: npc(towns[2], 'engineer'),
      choices: [
        choice(
          'open-audit',
          'Require an open audit before expansion',
          'Both families can inspect the records; expansion must wait.',
          [
            [0, -4],
            [2, 10],
          ],
        ),
        choice(
          'shared-trial',
          'Allow a limited trial with shared records',
          'A bounded industrial trial proceeds under joint observation.',
          [
            [0, 10],
            [2, 2],
          ],
        ),
      ],
    },
  );
  add(
    2,
    'encounter',
    'The second road account',
    'A second archive is occupied. Offer ordinary supplies for passage or defeat its guards; this is a separate group with a separate cost.',
    'A second source can now be examined.',
    encounter(2, vaults[1]),
  );
  add(
    2,
    'archive',
    'The date on the closed channel',
    'Find the older shutdown log in the deep cache. Compare its date with the industrial trial instead of assuming the newest machine caused the oldest silence.',
    'The return channel was closed before the current factory trials. Industrial noise complicates reception but cannot explain the original shutdown.',
    archive(2, vaults[1]),
  );

  add(
    3,
    'delivery',
    'A network kept breathing',
    'Three clinics will host independent living reference signals. Supply eight cequin, eight heartleaf and six emberroot so participation does not take medicine from ordinary patients.',
    'The reference network operates through supported clinics rather than coerced bodies.',
    { target: npc(towns[3], 'botanist'), cost: { cequin: 8, heartleaf: 8, emberroot: 6 } },
  );
  add(
    3,
    'choice',
    'A council without hidden signatures',
    'A clerk can release a sealed instruction but fears being made the sole culprit. Preserve their anonymity or attach your priestly authority to a public disclosure.',
    'The instruction becomes available with a recorded decision about responsibility.',
    {
      choices: [
        choice(
          'protect-clerk',
          'Protect the clerk and publish the instruction',
          'The evidence is separated from the vulnerable person who copied it.',
          [
            [3, 9],
            [0, -3],
          ],
        ),
        choice(
          'sign-disclosure',
          'Sign the disclosure with this office',
          'Theo publicly accepts responsibility for releasing the copy.',
          [
            [1, 8],
            [0, -6],
          ],
        ),
      ],
    },
  );
  add(
    3,
    'puzzle',
    'An answer outside the council',
    'Align this city’s four actual plaza coils. Their sequence differs from Vespera’s. The receiver should hear an independently held reference rather than a council-controlled copy.',
    'The independent reference confirms that the return channel was deliberately quarantined.',
    puzzle(3),
  );
  add(
    3,
    'choice',
    'Who may keep the reference?',
    'The reference could remain with a single technical custodian or be divided among clinics that must agree before changing it. Decide how the repaired system will be governed.',
    'A practical safeguard is agreed for the future network.',
    {
      target: npc(towns[3], 'botanist'),
      choices: [
        choice(
          'distributed',
          'Give separate references to the clinics',
          'No single keeper can quietly alter every reference.',
          [
            [2, 10],
            [3, 6],
          ],
        ),
        choice(
          'public-custodian',
          'Appoint a named, auditable custodian',
          'One custodian maintains the equipment under a public record.',
          [
            [0, 5],
            [5, 8],
          ],
        ),
      ],
    },
  );

  add(
    4,
    'delivery',
    'The receiver that survived the frost',
    'A northern engineer can reconstruct the final receiving stage. Bring six ore, three lenses and two ember tonics for the exposed maintenance crew.',
    'The northern receiver can compare the quarantined channel with the base’s original address.',
    { target: npc(towns[4], 'engineer'), cost: { ore: 6, lens: 3, tonic: 2 } },
  );
  add(
    4,
    'encounter',
    'The last sealed approach',
    'The remaining copy lies in a third occupied archive. Secure passage with two salves and three rations, or defeat the two guards.',
    'The final archive is within reach.',
    encounter(4, vaults[2]),
  );
  add(
    4,
    'archive',
    'An order from 3866',
    'Recover the last deep record. Read the instruction, its date and the acknowledgement together.',
    'The records agree: a council quarantine in 3866 suppressed unregistered return addresses. Sallas preserved an independent consensual protocol instead of giving the council ownership of every connection.',
    archive(4, vaults[2]),
  );
  add(
    4,
    'decode',
    'A cause that fits all three records',
    'The shutdown order predates the factory trial; the Sallas protocol survives independently; the base address remains valid. Which explanation fits those observations?',
    'Theo can finally distinguish the channel’s political quarantine from machinery noise. The collected records explain this failed return without assigning Sallas knowledge of his every action.',
    {
      answer: 'quarantine',
      options: [
        ['quarantine', 'An unregistered return channel was quarantined'],
        ['factory', 'The present factory caused the earlier shutdown'],
        ['prophecy', 'Sallas predicted every choice Theo would make'],
      ],
    },
  );

  add(
    5,
    'talk',
    'Bring the evidence home',
    `Return to ${ORIGIN_CITY_NAME}. Place the three independent records before the archivist, including the decisions under which their witnesses spoke.`,
    'The complete record is entered in Vespera: the cause of the silence, the preserved safe protocol, and the people affected by recovering it.',
  );
  add(
    5,
    'delivery',
    'A return that need not belong to a family',
    'Build the independent return receiver: three lenses, ten ore, six cequin and two ember tonics. The device needs both an address and living participants; no family seal substitutes for either.',
    'The independent receiver is complete and its clinical support is funded.',
    { target: radio(origin), cost: { lens: 3, ore: 10, cequin: 6, tonic: 2 } },
  );
  add(
    5,
    'puzzle',
    'The address answered in full',
    'Tune the final sequence at Vespera’s four plaza lamps, then close the circuit at the radio. This time the channel has an independent reference and an address whose provenance you can explain.',
    'A clear acknowledgement arrives from the base. The return connection is real, and the choice to use it remains Theo’s.',
    puzzle(5),
  );
  add(
    5,
    'ending',
    'A choice made awake',
    'The base answers. Theo can establish a standing return connection while finishing his obligations, or commit to remaining on Stíchos and place the protocol in local hands. Neither choice erases twenty local years.',
    'The investigation is resolved. Stíchos remains a place of living people and unfinished possibilities.',
    {
      target: radio(origin),
      choices: [
        choice(
          'return-link',
          'Keep the return connection open',
          'Theo exchanges a verified acknowledgement with home. He can return, and chooses when to conclude the obligations he has made here.',
          [
            [1, 8],
            [5, 5],
          ],
        ),
        choice(
          'stay',
          'Stay and place the protocol in local hands',
          'Theo tells the base that he is staying. The independent protocol is entrusted to the people whose lives made its recovery possible.',
          [
            [2, 8],
            [3, 8],
          ],
        ),
      ],
      reward: { coins: 100, xp: 180 },
    },
  );
  return { seed: world.seed, generation: world.generation, acts: CAMPAIGN_ACTS, steps, towns };
}

export function validateCampaignState(value: unknown): CampaignState {
  const bad = (): never => {
    throw new Error('Invalid Sallas campaign state.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
  const s = value as CampaignState;
  if (
    s.version !== 1 ||
    typeof s.started !== 'boolean' ||
    !Number.isInteger(s.step) ||
    s.step < 0 ||
    s.step > CAMPAIGN_LENGTH ||
    !Number.isInteger(s.puzzle) ||
    s.puzzle < -1 ||
    s.puzzle > 4 ||
    !Array.isArray(s.evidence) ||
    s.evidence.length !== s.step ||
    s.evidence.some((id, i) => id !== `sallas:${i.toString().padStart(2, '0')}`) ||
    !s.choices ||
    typeof s.choices !== 'object' ||
    Array.isArray(s.choices) ||
    Object.keys(s.choices).length > 24 ||
    ![null, 'return-link', 'stay'].includes(s.ending) ||
    (s.step === 24) !== (s.ending !== null) ||
    (!s.started && (s.step !== 0 || s.puzzle !== -1 || Object.keys(s.choices).length > 0)) ||
    (![3, 14, 22].includes(s.step) && s.puzzle !== -1)
  )
    return bad();
  const options: Record<number, string[]> = {
    2: ['protect', 'publish'],
    5: ['parley', 'fight', 'shelter'],
    7: ['willing'],
    9: ['open-audit', 'shared-trial'],
    10: ['parley', 'fight', 'shelter'],
    13: ['protect-clerk', 'sign-disclosure'],
    15: ['distributed', 'public-custodian'],
    17: ['parley', 'fight', 'shelter'],
    19: ['quarantine'],
    23: ['return-link', 'stay'],
  };
  for (const [id, choice] of Object.entries(s.choices)) {
    const index = Number(id.slice(7));
    if (
      !/^sallas:\d{2}$/.test(id) ||
      index > 23 ||
      index > s.step ||
      !options[index]?.includes(choice) ||
      (index === s.step && (![5, 10, 17].includes(index) || choice !== 'fight'))
    )
      return bad();
  }
  for (const index of Object.keys(options).map(Number))
    if (index < s.step && !s.choices[`sallas:${index.toString().padStart(2, '0')}`]) return bad();
  if (s.ending && s.choices['sallas:23'] !== s.ending) return bad();
  return {
    version: 1,
    started: s.started,
    step: s.step,
    puzzle: s.puzzle,
    choices: { ...s.choices },
    evidence: [...s.evidence],
    ending: s.ending,
  };
}
