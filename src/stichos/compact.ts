import { deriveSeed } from '../procedural/random.ts';
import type { InfiniteWorld } from './world.ts';
import type { ItemId, Npc, Point, Settlement } from './types.ts';

export type CompactStage = 'survey' | 'work' | 'delivery' | 'complete';
export interface CompactTarget extends Point {
  id: string;
  name: string;
  role: string;
  statement?: string;
}
export interface CompactCost {
  coins: number;
  items: Partial<Record<ItemId, number>>;
}
export interface CompactWork {
  kind: 'gather' | 'craft';
  item: ItemId;
  amount: number;
  acceptsLabor: boolean;
}
export interface CompactChoice {
  id: string;
  label: string;
  description: string;
  consequence: string;
  cost: CompactCost;
  work: CompactWork;
  delivery: Partial<Record<ItemId, number>>;
  outcomes: { care: number; independence: number; reliability: number };
  reputation: [number, number][];
}
export interface CompactProject {
  id: string;
  index: number;
  district: number;
  phase: number;
  clan: number;
  title: string;
  description: string;
  town: Settlement;
  board: CompactTarget;
  witnesses: [CompactTarget, CompactTarget];
  choices: [CompactChoice, CompactChoice];
  reward: { coins: number; xp: number };
}
export interface CompactPlan {
  seed: number;
  generation: number;
  towns: Settlement[];
  projects: CompactProject[];
}
export interface CompactOutcome {
  care: number;
  independence: number;
  reliability: number;
}
export interface CompactState {
  version: 1;
  project: number;
  stage: CompactStage;
  surveys: string[];
  choices: Record<string, string>;
  work: number;
  completed: string[];
  receipts: string[];
  observed: number;
  paidOrders: number;
  outcomes: CompactOutcome[];
  workerTrust: Record<string, number>;
}
/** The adapter calls these only after an actual successful physical operation. */
export type CompactEvent =
  | { id: string; kind: 'gather'; item: ItemId; amount: number; propId: string }
  | { id: string; kind: 'craft'; item: ItemId; amount: number; recipeId: string }
  | {
      id: string;
      kind: 'labor';
      workerId: string;
      orderId: string;
      paidCoins: number;
      output: Partial<Record<ItemId, number>>;
    };
export type CompactAction =
  | { kind: 'survey'; witnessId: string }
  | { kind: 'choose'; choiceId: string }
  | { kind: 'deliver' };
export interface CompactContext {
  plan: CompactPlan;
  position: Point;
  coins: number;
  inventory: Partial<Record<ItemId, number>>;
  /** Actual nearby live actor/notice, supplied by the session rather than by the UI. */
  actor?: CompactTarget & { hp?: number; hostile?: boolean };
  /** Dead, hostile or occupied original witnesses may leave records at their real board. */
  unavailableWitnesses?: readonly string[];
}
export interface CompactResult {
  ok: boolean;
  message: string;
  state: CompactState;
  cost: CompactCost;
  reward: { coins: number; xp: number };
  reputation: [number, number][];
}
export const COMPACT_PROJECTS = 24;
export const COMPACT_MILESTONES = 72;
const ITEMS: readonly ItemId[] = [
  'cequin',
  'heartleaf',
  'emberroot',
  'wood',
  'ore',
  'salve',
  'tonic',
  'rations',
  'bandage',
  'seal',
  'lens',
];
const copy = <T>(value: T): T => structuredClone(value);
const emptyOutcome = (): CompactOutcome => ({ care: 0, independence: 0, reliability: 0 });
export function createCompact(): CompactState {
  return {
    version: 1,
    project: 0,
    stage: 'survey',
    surveys: [],
    choices: {},
    work: 0,
    completed: [],
    receipts: [],
    observed: 0,
    paidOrders: 0,
    outcomes: Array.from({ length: 6 }, emptyOutcome),
    workerTrust: {},
  };
}

interface Theme {
  titles: [string, string, string, string];
  needs: [string, string, string, string];
  roles: [Npc['role'], Npc['role']];
  local: [ItemId, ItemId, ItemId, ItemId];
  prepared: [ItemId, ItemId, ItemId, ItemId];
  independent: string;
  sponsored: string;
}
const THEMES: readonly Theme[] = [
  {
    titles: [
      'A furnace beside the clinic',
      'Who owns the repair bench',
      'The failed quota',
      'The price on the public ledger',
    ],
    needs: [
      'A Brown workshop offers standardized medicine containers. The clinic wants useful vessels without surrendering its botanical judgment; a worker asks who will pay for breakage.',
      'The first agreement has left tools in daily use. A shared repair bench requires more local timber; a patron offers metal stocks in return for priority over its appointments.',
      'A production tally counts containers, while the clinic counts treatments that reached people. Replenish the shortfall and decide whose measure will appear in the account.',
      'The workshop and clinic now depend on each other. Establish either an independently supplied reserve or a publicly auditable industrial contract; neither erases the other party’s objections.',
    ],
    roles: ['engineer', 'botanist'],
    local: ['wood', 'ore', 'cequin', 'wood'],
    prepared: ['bandage', 'lens', 'salve', 'tonic'],
    independent: 'A locally owned workshop',
    sponsored: 'A published Brown supply contract',
  },
  {
    titles: [
      'The names beside the specimens',
      'Copies beyond one cabinet',
      'A witness asks to withdraw',
      'Custody without ownership',
    ],
    needs: [
      'Sallas researchers can describe a plant without publishing its donor’s name. The archivist needs a reproducible record; the clinic fears that a useful specimen will become a claim over its patients.',
      'A single cabinet is convenient and vulnerable. Local copies need their own supports and medicines; a protected archive offers storage under its existing access rules.',
      'Someone named in an early account no longer consents to its circulation. The useful botanical observation can remain while the name is removed, or be sealed with a documented custodian.',
      'The district must keep its observations useful without claiming certainty about Theo’s interrupted transmission. Fund continued local observation or a restricted but accountable research service.',
    ],
    roles: ['archivist', 'botanist'],
    local: ['heartleaf', 'wood', 'cequin', 'emberroot'],
    prepared: ['salve', 'lens', 'bandage', 'tonic'],
    independent: 'Distributed, unnamed field records',
    sponsored: 'A named and audited custodian',
  },
  {
    titles: [
      'Beds promised before winter',
      'The household is not a granary',
      'A resident refuses a favor',
      'Care without a private debt',
    ],
    needs: [
      'The clinic has more requests than warm beds. A refugee describes the queue from outside; its keeper describes the same queue as a supply problem. Both accounts belong in the decision.',
      'Theo’s title opens doors, but the people doing the work still need wages. Prepare supplies under an independent household agreement or place an order through the established patron.',
      'A resident accepts medicine and refuses the obligation attached to it. Replace the consumed supplies before deciding whether future help is a public entitlement or a recorded private undertaking.',
      'The new beds will outlast this conversation. Give their supplies to an open clinic reserve or a smaller supervised service, recording whom each arrangement leaves waiting.',
    ],
    roles: ['refugee', 'botanist'],
    local: ['cequin', 'wood', 'heartleaf', 'emberroot'],
    prepared: ['bandage', 'salve', 'tonic', 'salve'],
    independent: 'An open clinic reserve',
    sponsored: 'A supervised household undertaking',
  },
  {
    titles: [
      'The last convenient stand',
      'A boundary the cutters accept',
      'Shelter lost with the timber',
      'A common without an owner',
    ],
    needs: [
      'The nearest stand is convenient for cutters and useful as shelter. The workshop needs timber now; a resident wants a rule that leaves the next household something to work with.',
      'A boundary on paper is not a paid agreement. Supply the people maintaining it, choosing a locally supported common or a contracted reserve whose accounts can be inspected.',
      'Earlier cutting has exposed a path to the cold. Gather replacement materials or prepare portable warming kits while both witnesses explain the cost of the first policy.',
      'The district can keep a shared maintenance stock or pay a steward to release supplies. Record the arrangement and its obligations before calling the boundary settled.',
    ],
    roles: ['engineer', 'refugee'],
    local: ['wood', 'cequin', 'wood', 'emberroot'],
    prepared: ['tonic', 'bandage', 'tonic', 'salve'],
    independent: 'A paid woodland common',
    sponsored: 'An accountable reserve steward',
  },
  {
    titles: [
      'Medicine that must cross the road',
      'The carrier’s own breath',
      'The shipment that arrived short',
      'A route held by neighbors',
    ],
    needs: [
      'A merchant can move a bundle, but cannot promise that its recipient can afford it. The clinic wants a reserve at the far end rather than another promise of a future shipment.',
      'Carriers consume cequin and warmth as they work. A public route shares that burden; a contracted service supplies fewer people while accepting responsibility for each recorded delivery.',
      'The count at departure differs from the count received. Neither account alone proves theft. Replenish the actual shortfall and preserve both statements before setting new terms.',
      'The route needs another supply agreement after its first test. Build a distributed reserve or renew a smaller contracted service with a visible delivery account.',
    ],
    roles: ['merchant', 'botanist'],
    local: ['cequin', 'emberroot', 'heartleaf', 'wood'],
    prepared: ['tonic', 'bandage', 'salve', 'tonic'],
    independent: 'A reserve shared by neighbors',
    sponsored: 'A carrier paid for each account',
  },
  {
    titles: [
      'The picture outside the meeting',
      'An account in more than one voice',
      'The names omitted from the painting',
      'A compact that can be questioned',
    ],
    needs: [
      'A painting celebrates a medicine delivery while omitting the people who waited. Its maker’s patron and the clinic describe different successes. Theo can support care without pretending the picture is a neutral record.',
      'A public account needs witnesses who can disagree. Fund an independent set of practical records or a supervised archive that must preserve the original objections.',
      'The display has become a political promise. Provide the missing practical supplies before deciding whether to replace its claims with collective testimony or append a signed correction.',
      'The six-family compact can be maintained by visible local reserves or accountable custodians. Complete this district’s last commitment and leave its dissent in the record; no agreement reveals the hidden council’s whole purpose.',
    ],
    roles: ['archivist', 'refugee'],
    local: ['heartleaf', 'wood', 'cequin', 'emberroot'],
    prepared: ['salve', 'bandage', 'tonic', 'salve'],
    independent: 'A public account with dissent',
    sponsored: 'A signed correction under custody',
  },
];
const ACCOUNTS: readonly (readonly [string, string])[] = [
  [
    'A reusable vessel saves a day of work only when somebody can repair its seam. I can keep a bench open if its timber and ore are actually paid for.',
    'Count the patient who received a treatment. A stack of perfect containers can still leave my waiting room without medicine.',
  ],
  [
    'A patron can replenish our metal sooner than our neighbors can. The priority clause means the patron’s repairs come first; I will put that clause in writing.',
    'Local ownership costs more at the beginning. It also lets us mend the clinic’s tools when a private appointment would otherwise occupy the bench.',
  ],
  [
    'The workshop met the written quota. If the tally is wrong for the task, change it openly; calling every worker dishonest will not mend the account.',
    'Several containers arrived empty. I need the missing treatments replaced, and I want the next tally to include the people who actually receive them.',
  ],
  [
    'Reliable work needs a continuing customer. Publish who funds us and what they may request; promises of independence still require someone to supply the ore.',
    'A public reserve lets the clinic refuse a harmful instruction. Keep that reserve real, and preserve the workshop’s explanation beside our own.',
  ],

  [
    'A specimen label should let another observer repeat the observation. It need not give a patron the name of the person who first brought us the plant.',
    'People will stop bringing unusual growths if a useful discovery turns their family into an entry that strangers can inspect.',
  ],
  [
    'One protected cabinet is easier to maintain. Several copies make a single custodian less powerful, but each copy needs an actual keeper and working supplies.',
    'A local copy lets us question a preparation without waiting for permission. I will accept the extra work if the medicines for that work arrive with it.',
  ],
  [
    'We can retain the measurement and withdraw a name. A sealed original preserves another kind of evidence; the custodian must record who is allowed to open it.',
    'The person who withdrew consent has not withdrawn their illness. We owe them care while the argument over the record continues.',
  ],
  [
    'These observations establish what we measured here. They do not establish why your signal failed, and I will not put that claim under a Sallas seal.',
    'Let the next observer find enough medicine to repeat the work. Ownership of a cabinet should not decide whose questions can be asked.',
  ],

  [
    'When the beds are full, the queue becomes somebody else’s room. I want to know whether a person without a family introduction will be admitted.',
    'A larger promise requires a larger reserve of dressings and breath plants. I can keep a smaller service reliable if its limit is stated honestly.',
  ],
  [
    'A priest’s request is difficult to refuse. A wage written before the work gives my refusal a meaning that a promised favor does not.',
    'The household can arrange useful work, but its own supplies must not be counted as medicines that have already reached this clinic.',
  ],
  [
    'I accepted a dressing. I did not agree that my next vote, my labor or my children now belong to the person who paid for it.',
    'The dressing was used, and must be replaced. Record the disagreement without making the patient wait for another hearing.',
  ],
  [
    'I would rather share an openly limited reserve than depend on a private invitation. Show me the limit and let another household challenge it.',
    'A supervised service can protect a small stock. A public reserve can reach more people. Both require a keeper who admits when the cupboard is empty.',
  ],

  [
    'The nearest trees make every repair cheaper. Leave us a boundary we can recognize on the ground, and enough timber on its permitted side to finish the work.',
    'Those trees shelter the path to our doors. The price of a plank does not include the warming plants we consume after the wind reaches us.',
  ],
  [
    'A common still needs people to mark and maintain it. Pay that work before asking its workers to turn away a powerful customer.',
    'A contracted keeper can answer for one reserve. I want the refusal rule written down so that a family name cannot silently overrule it.',
  ],
  [
    'The shelter changed after the cutting. We can rebuild screens from real material, or carry warming preparations while another arrangement takes root.',
    'A kit is useful to the person who receives it. A screen shelters the next person too, though somebody must return to mend it.',
  ],
  [
    'A shared stock spreads the responsibility for repairs. A steward concentrates it. Choose who may inspect the count, not merely whose seal goes on the lock.',
    'Let the people using the path report a failure. A boundary that cannot be questioned will eventually become somebody’s private wall.',
  ],

  [
    'I can name the carrier, price and destination. I cannot promise that the person at the far end will have the money to buy the medicine again.',
    'A reserve already received here gives me a practical choice. A promise about the next caravan does not warm the patient beside me.',
  ],
  [
    'Carriers breathe cequin and consume food on the road. Count their provisions in the price; hiding that cost encourages somebody to take it from the shipment.',
    'A smaller reliable route can serve us well. Keep its exclusions visible, because the household beyond the last stop still needs help.',
  ],
  [
    'My departure tally and the clinic’s receipt differ. Keep both accounts while the shortfall is replaced; neither tells you where every missing portion went.',
    'I can sign for what reached my hands. Ask me to certify the whole journey and my signature becomes a decoration rather than evidence.',
  ],
  [
    'A paid carrier can be replaced when an account fails. A network of neighbors can share a reserve. Neither arrangement should depend on my goodwill alone.',
    'The medicines delivered under this agreement will be used. Its next keeper needs supplies and a record of the disagreement, not a painting of an endless abundance.',
  ],

  [
    'The picture shows a real delivery. Its frame leaves out the queue. Preserve both facts before asking me to call it either proof of abundance or a complete lie.',
    'I recognize the bundle in the painting. I also recognize the person standing outside it, who came back to us without a dressing.',
  ],
  [
    'An account with several signatures can preserve a disagreement. A supervised copy can do the same if its keeper cannot erase the inconvenient sentence.',
    'Give the witnesses enough practical help to speak without owing a favor. Paying for their silence would be cheaper and would destroy the account.',
  ],
  [
    'A correction should name the claim it changes. Replacing every image without keeping the old claim makes it difficult to understand what the audience was promised.',
    'The missing person needs medicine before becoming another symbol. Supply the shortfall, then ask how their experience may be recorded.',
  ],
  [
    'The compact records agreements among these six districts. It does not let us see every purpose inside the Cúpula do Destino, or guarantee what its priests will do next.',
    'A useful agreement leaves a way to object after Theo has gone. Keep a reserve, a keeper and a dissenting account that another person can actually find.',
  ],
];
const target = (npc: Npc): CompactTarget => ({
  id: npc.id,
  name: npc.name,
  role: npc.role,
  x: npc.x,
  y: npc.y,
});

/** Metadata chooses actual towns; no invented host, excavation or terrain revision is required. */
export function buildCompact(world: InfiniteWorld): CompactPlan {
  const all = new Map<string, Settlement>();
  const add = (x: number, y: number, radius: number) => {
    for (const town of world.settlementsAround(x, y, radius))
      if (town.rank !== 'hamlet') all.set(town.id, town);
  };
  if (world.generation === 3) add(0, 0, 2048);
  else for (let y = -480; y <= 480; y += 160) for (let x = -480; x <= 480; x += 160) add(x, y, 128);
  // A rare missing family widens the real metadata search, never substitutes a different clan.
  for (let ring = 1; ring <= 3 && new Set([...all.values()].map((t) => t.clan)).size < 6; ring++) {
    const stride = world.generation === 3 ? 1280 : 640;
    for (let y = -ring; y <= ring; y++)
      for (let x = -ring; x <= ring; x++)
        if (Math.max(Math.abs(x), Math.abs(y)) === ring)
          add(x * stride, y * stride, world.generation === 3 ? 2048 : 128);
  }
  const towns = Array.from({ length: 6 }, (_, clan) => {
    const candidates = [...all.values()].filter((t) => t.clan === clan);
    candidates.sort(
      (a, b) =>
        Number(b.id === 'origin') - Number(a.id === 'origin') ||
        Number(b.rank === 'city') - Number(a.rank === 'city') ||
        Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) ||
        a.id.localeCompare(b.id),
    );
    if (!candidates[0]) throw new Error(`No actual settlement found for compact family ${clan}.`);
    return copy(candidates[0]);
  });
  const anchors = towns.map((town) => {
    const theme = THEMES[town.clan];
    const npcs = world
      .npcsAround(town.x, town.y, town.radius + 8)
      .filter((n) => n.hp > 0 && !n.hostile && n.role !== 'raider' && n.clan === town.clan)
      .sort((a, b) => a.id.localeCompare(b.id));
    const first = npcs.find((n) => n.role === theme.roles[0]) ?? npcs[0];
    const second =
      npcs.find((n) => n.role === theme.roles[1] && n.id !== first?.id) ??
      npcs.find((n) => n.id !== first?.id);
    const witnesses = [first, second] as [Npc, Npc];
    if (!witnesses[0] || !witnesses[1] || witnesses[0].id === witnesses[1].id)
      throw new Error(`Compact needs two actual witnesses in ${town.id}.`);
    const boardProp = world
      .propsAround(town.x, town.y, town.radius + 8)
      .find((p) => p.id === `${town.id}:notice` && p.kind === 'notice');
    if (!boardProp) throw new Error(`Compact needs the actual noticeboard of ${town.id}.`);
    return { witnesses, boardProp };
  });
  const projects: CompactProject[] = [];
  // Four council rounds revisit the consequences of the preceding agreements.
  for (let phase = 0; phase < 4; phase++)
    for (let district = 0; district < 6; district++) {
      const town = towns[district],
        theme = THEMES[town.clan];
      const { witnesses, boardProp } = anchors[district];
      const h = deriveSeed(world.seed, 'winter-compact-v1', town.id, phase);
      const amount = 10 + phase * 2 + (h % 4);
      const ownClan = town.clan,
        otherClan = (ownClan + 1 + ((h >>> 8) % 5)) % 6;
      const independent: CompactChoice = {
        id: 'common',
        label: theme.independent,
        description: `Fund local control and a larger fresh reserve. ${witnesses[1].name} can keep a dissenting account; the work has no patron’s priority clause.`,
        consequence:
          'Care and local independence improve. More supplies must be provided now; later independent work needs less outside coin.',
        cost: { coins: 18 + phase * 3 + ((h >>> 4) % 7), items: { wood: 1 + phase } },
        work: { kind: 'gather', item: theme.local[phase], amount, acceptsLabor: true },
        delivery: { [theme.local[phase]]: amount, bandage: 1 + Math.floor(phase / 2) },
        outcomes: { care: 2, independence: 2, reliability: 1 },
        reputation: [
          [ownClan, 3],
          [otherClan, -1],
        ],
      };
      const sponsored: CompactChoice = {
        id: 'charter',
        label: theme.sponsored,
        description: `Prepare a smaller, specified batch under a paid charter. ${witnesses[0].name} records its terms and the patron’s continuing claim on the service.`,
        consequence:
          'Reliability improves and the initial cash burden is lower. The district gains less independence and owes more outside funding on later rounds.',
        cost: {
          coins: 10 + phase * 2 + ((h >>> 6) % 5),
          items: { ore: 1 + Math.floor(phase / 2) },
        },
        work: {
          kind: 'craft',
          item: theme.prepared[phase],
          amount: 5 + phase + ((h >>> 10) % 3),
          acceptsLabor: false,
        },
        delivery: { [theme.prepared[phase]]: 5 + phase + ((h >>> 10) % 3), cequin: 2 + phase },
        outcomes: { care: 1, independence: -1, reliability: 3 },
        reputation: [
          [ownClan, -1],
          [otherClan, 3],
        ],
      };
      projects.push({
        id: `compact:${phase}:${town.clan}`,
        index: projects.length,
        district,
        phase,
        clan: town.clan,
        title: theme.titles[phase],
        description: theme.needs[phase],
        town: copy(town),
        board: {
          id: boardProp.id,
          name: boardProp.name,
          role: 'notice',
          x: boardProp.x,
          y: boardProp.y,
        },
        witnesses: [
          { ...target(witnesses[0]), statement: ACCOUNTS[town.clan * 4 + phase][0] },
          { ...target(witnesses[1]), statement: ACCOUNTS[town.clan * 4 + phase][1] },
        ],
        choices: [independent, sponsored],
        reward: { coins: 32 + phase * 9, xp: 20 + phase * 8 },
      });
    }
  return { seed: world.seed, generation: world.generation, towns, projects };
}

/** Current terms derive from completed public commitments, not elapsed time or random rerolls. */
export function compactProject(state: CompactState, plan: CompactPlan): CompactProject | null {
  const base = plan.projects[state.project];
  if (!base) return null;
  const project = copy(base),
    outcome = state.outcomes[base.district];
  for (const choice of project.choices) {
    const discount = Math.min(4, Math.floor(Math.max(0, outcome.reliability) / 3));
    choice.work.amount = Math.max(3, choice.work.amount - discount);
    choice.delivery[choice.work.item] = choice.work.amount;
    choice.cost.coins = Math.max(
      4,
      choice.cost.coins -
        Math.max(0, outcome.independence) +
        Math.max(0, -outcome.independence) * 2,
    );
    if (outcome.care >= 4) {
      const extra: ItemId = choice.work.item === 'bandage' ? 'cequin' : 'bandage';
      choice.delivery[extra] = (choice.delivery[extra] ?? 0) + 1;
      choice.description +=
        ' The larger clinic now also accepts people excluded by the first agreement; its delivery includes one additional emergency portion.';
    }
  }
  return project;
}

const validText = (v: unknown, max = 180): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= max &&
  !['__proto__', 'constructor', 'prototype'].includes(v) &&
  !/[\u0000-\u001f\u007f]/u.test(v);
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER, min = 0): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const validItems = (v: unknown, max = 1000): v is Partial<Record<ItemId, number>> =>
  object(v) &&
  Object.entries(v).every(([item, n]) => ITEMS.includes(item as ItemId) && integer(n, max));
const validPoint = (p: Point) =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e9 && Math.abs(p.y) <= 1e9;
const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= 2;

function transact(
  state: CompactState,
  action: CompactAction,
  context: CompactContext,
): CompactResult {
  const result: CompactResult = {
    ok: false,
    message: 'This compact action is unavailable.',
    state: copy(state),
    cost: { coins: 0, items: {} },
    reward: { coins: 0, xp: 0 },
    reputation: [],
  };
  const project = compactProject(state, context.plan);
  if (!project || state.stage === 'complete') {
    result.message = 'All twenty-four winter commitments have been resolved.';
    return result;
  }
  if (
    !validPoint(context.position) ||
    !integer(context.coins, 1e12) ||
    !validItems(context.inventory, 1e9)
  ) {
    result.message = 'This body has no valid position or physical pack.';
    return result;
  }
  const actor = context.actor;
  if (
    !actor ||
    !validPoint(actor) ||
    !close(context.position, actor) ||
    actor.hostile ||
    (actor.hp !== undefined && actor.hp <= 0)
  ) {
    result.message = 'Speak beside the living witness or the district noticeboard.';
    return result;
  }
  const atBoard = actor.id === project.board.id && close(actor, project.board);
  if (action.kind === 'survey') {
    const witness = project.witnesses.find((w) => w.id === action.witnessId);
    if (state.stage !== 'survey' || !witness || state.surveys.includes(witness.id)) {
      result.message = 'That account is already recorded, or belongs to another commitment.';
      return result;
    }
    const fallback = atBoard && context.unavailableWitnesses?.includes(witness.id);
    if (actor.id !== witness.id && !fallback) {
      result.message = `Hear ${witness.name} in person. Only an unavailable witness’s deposited account can be read here.`;
      return result;
    }
    result.state.surveys.push(witness.id);
    result.message = fallback
      ? `${witness.name} is unavailable. The deposited account is recorded without replacing its author.`
      : `${witness.name}’s account is recorded alongside the other witness’s concerns.`;
    if (witness.statement) result.message += ` “${witness.statement}”`;
    if (result.state.surveys.length === 2) result.state.stage = 'work';
  } else if (action.kind === 'choose') {
    const choice = project.choices.find((c) => c.id === action.choiceId);
    if (!atBoard || state.stage !== 'work' || state.choices[project.id] || !choice) {
      result.message =
        'Record both witnesses, then agree one set of terms at this district’s board.';
      return result;
    }
    result.cost = copy(choice.cost);
    result.state.choices[project.id] = choice.id;
    result.message = `${choice.label}. ${choice.consequence} Fresh ${choice.work.kind === 'craft' ? 'preparations' : 'resource work'} must now be performed; old stock alone is not evidence of this undertaking.`;
  } else if (action.kind === 'deliver') {
    const choice = project.choices.find((c) => c.id === state.choices[project.id]);
    if (!atBoard || state.stage !== 'delivery' || !choice || state.work < choice.work.amount) {
      result.message =
        'Complete the agreed fresh work and bring its supplies to the issuing board.';
      return result;
    }
    result.cost = { coins: 0, items: copy(choice.delivery) };
    result.reward = copy(project.reward);
    result.reputation = copy(choice.reputation);
    const o = result.state.outcomes[project.district];
    for (const k of ['care', 'independence', 'reliability'] as const) o[k] += choice.outcomes[k];
    result.state.completed.push(project.id);
    result.state.project++;
    result.state.stage = result.state.project === COMPACT_PROJECTS ? 'complete' : 'survey';
    result.state.surveys = [];
    result.state.work = 0;
    result.message = `${project.title}: the physical delivery is accepted once. ${choice.consequence}${result.state.stage === 'complete' ? ' The winter compact is complete; its care, dependencies and dissent remain part of this life.' : ''}`;
  } else return result;
  if (
    context.coins < result.cost.coins ||
    Object.entries(result.cost.items).some(([id, n]) => (context.inventory[id as ItemId] ?? 0) < n!)
  ) {
    return {
      ...result,
      state: copy(state),
      reward: { coins: 0, xp: 0 },
      reputation: [],
      message: 'The agreed physical resources or coins are missing. Nothing was spent or advanced.',
    };
  }
  result.ok = true;
  return result;
}
/** Preview never exposes a changed state or modifies its inputs. */
export function previewCompact(
  state: CompactState,
  action: CompactAction,
  context: CompactContext,
): CompactResult {
  const result = transact(state, action, context);
  return { ...result, state: copy(state) };
}
/** Pure transaction: the session commits cost, reward, reputation and returned state together. */
export function applyCompact(
  state: CompactState,
  action: CompactAction,
  context: CompactContext,
): CompactResult {
  return transact(state, action, context);
}

/** Receipt IDs must identify actual successful operations; polling, menus and elapsed time do not count. */
export function recordCompactEvent(
  state: CompactState,
  event: CompactEvent,
  plan: CompactPlan,
): CompactState {
  const next = copy(state);
  if (state.stage === 'complete' || state.receipts.includes(event.id)) return next;
  if (!validText(event.id) || !integer(state.observed, Number.MAX_SAFE_INTEGER - 1))
    throw new Error('Invalid compact event receipt.');
  next.observed++;
  const project = compactProject(state, plan);
  const choice = project?.choices.find((c) => c.id === state.choices[project.id]);
  if (state.stage !== 'work' || !choice) return next;
  let amount = 0;
  if (event.kind === 'gather' || event.kind === 'craft') {
    if (
      !ITEMS.includes(event.item) ||
      !integer(event.amount, 100, 1) ||
      !validText(event.kind === 'gather' ? event.propId : event.recipeId)
    )
      throw new Error('Invalid physical compact work.');
    if (event.kind === choice.work.kind && event.item === choice.work.item) amount = event.amount;
  } else if (event.kind === 'labor') {
    if (
      !validText(event.workerId) ||
      !validText(event.orderId) ||
      !integer(event.paidCoins, 1000, 1) ||
      !validItems(event.output, 100)
    )
      throw new Error('Invalid paid compact labor.');
    if (choice.work.acceptsLabor) amount = event.output[choice.work.item] ?? 0;
  } else throw new Error('Invalid compact operation.');
  if (!amount) return next;
  if (state.receipts.length >= 4096) throw new Error('Compact evidence capacity exceeded.');
  // Natural object/order identities stop duplicate work even if a caller changes the outer receipt ID.
  const evidence =
    event.kind === 'gather'
      ? `prop:${event.propId}`
      : event.kind === 'labor'
        ? `order:${event.orderId}`
        : event.id;
  if (state.receipts.includes(evidence)) return copy(state);
  next.receipts.push(evidence);
  next.work = Math.min(choice.work.amount, next.work + amount);
  if (event.kind === 'labor') {
    next.paidOrders++;
    next.workerTrust[event.workerId] = Math.min(12, (next.workerTrust[event.workerId] ?? 0) + 2);
  }
  if (next.work >= choice.work.amount) next.stage = 'delivery';
  return next;
}

/** Strict optional v1 migration. A saved map is never regenerated under a different geography. */
export function restoreCompact(raw: unknown, plan: CompactPlan): CompactState {
  if (raw === undefined) return createCompact();
  const fail = (): never => {
    throw new Error('Invalid winter compact save.');
  };
  if (!object(raw)) return fail();
  if (Object.keys(raw).some((k) => !Object.hasOwn(createCompact(), k))) return fail();
  const s = raw as unknown as CompactState;
  const list = (v: unknown, max: number) =>
    Array.isArray(v) &&
    v.length <= max &&
    new Set(v).size === v.length &&
    v.every((x) => validText(x, 200));
  if (
    s.version !== 1 ||
    !integer(s.project, 24) ||
    !['survey', 'work', 'delivery', 'complete'].includes(s.stage) ||
    !list(s.surveys, 2) ||
    !list(s.completed, 24) ||
    !list(s.receipts, 4096) ||
    !integer(s.observed) ||
    s.receipts.length > s.observed ||
    !integer(s.paidOrders, 4096) ||
    s.paidOrders > s.receipts.length ||
    !integer(s.work, 100) ||
    !object(s.choices) ||
    !object(s.workerTrust) ||
    Object.keys(s.workerTrust).length > 128 ||
    Object.entries(s.workerTrust).some(([id, n]) => !validText(id) || !integer(n, 12)) ||
    !Array.isArray(s.outcomes) ||
    s.outcomes.length !== 6 ||
    s.completed.length !== s.project
  )
    return fail();
  const expectedOutcomes = Array.from({ length: 6 }, emptyOutcome);
  for (let i = 0; i < s.project; i++) {
    const p = plan.projects[i];
    if (!p || s.completed[i] !== p.id) return fail();
    const c = p.choices.find((c) => c.id === s.choices[p.id]);
    if (!c) return fail();
    for (const k of ['care', 'independence', 'reliability'] as const)
      expectedOutcomes[p.district][k] += c.outcomes[k];
  }
  if (
    s.outcomes.some(
      (o, i) =>
        !object(o) ||
        (['care', 'independence', 'reliability'] as const).some(
          (k) => o[k] !== expectedOutcomes[i][k],
        ),
    )
  )
    return fail();
  const project = compactProject(s, plan);
  if (s.project === 24) {
    if (
      s.stage !== 'complete' ||
      s.surveys.length ||
      s.work ||
      Object.keys(s.choices).length !== 24
    )
      return fail();
  } else {
    if (
      !project ||
      s.stage === 'complete' ||
      s.surveys.some((id) => !project.witnesses.some((w) => w.id === id))
    )
      return fail();
    const choice = project.choices.find((c) => c.id === s.choices[project.id]);
    if (s.stage === 'survey' && (s.surveys.length >= 2 || choice || s.work)) return fail();
    if (s.stage !== 'survey' && s.surveys.length !== 2) return fail();
    if (s.work && !choice) return fail();
    if (
      choice &&
      ((s.stage === 'work' && s.work >= choice.work.amount) ||
        (s.stage === 'delivery' && s.work !== choice.work.amount))
    )
      return fail();
    if (s.stage === 'delivery' && !choice) return fail();
    if (Object.keys(s.choices).length !== s.project + Number(!!choice)) return fail();
  }
  const allowed = new Set(plan.projects.slice(0, s.project + 1).map((p) => p.id));
  if (Object.keys(s.choices).some((id) => !allowed.has(id))) return fail();
  return copy(s);
}
