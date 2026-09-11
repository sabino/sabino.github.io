/** Original adaptation prose based on the author's Destino: Stíchos.
 * Source boundaries and chronology: docs/stichos/STORY.md.
 * Private notebook entries precede the player's present-day choices.
 */
export interface JournalEntry {
  id: string;
  year: number;
  title: string;
  subtitle: string;
  paragraphs: string[];
  margin: string;
}
export interface PlantNote {
  id: string;
  title: string;
  latin?: string;
  subtitle: string;
  paragraphs: string[];
  observation: string;
}
export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const JOURNAL_ENTRIES: readonly JournalEntry[] = [
  {
    id: 'theo-3866-01',
    year: 3866,
    title: 'A voice in the wrong throat',
    subtitle: 'Arrival · first surviving page',
    paragraphs: [
      "I remember the return instruction more clearly than the journey. At the base I repeated it until the sequence became almost musical. There were checks for drift, checks for interruption, a person whose task was to hear me answer. Here, the answer came out in an old man's voice. Someone knelt beside the bed. He called me Father and waited for a blessing. I gave him the shortest one I could remember.",
      "The first transmission attempt exhausted me. The second produced a pulse in my ears which I mistook for acknowledgement. Nothing I can reproduce distinguishes it from this body's heartbeat. I have written that sentence three times because the more comforting version keeps returning.",
      'Theo Bishop is the name I can defend privately. The hand that writes it belongs to the priest. I have no evidence that his mind is gone, sleeping, displaced, or listening. A man should require more than silence before declaring another man absent.',
    ],
    margin: 'Preserve the failed attempts, including the ones I am ashamed to count.',
  },
  {
    id: 'theo-3866-02',
    year: 3866,
    title: 'The name already in my papers',
    subtitle: 'Arrival · after the first thaw in the window',
    paragraphs: [
      'I had read the name Sallas before I came to Stíchos. In the material available to me, something about this family had survived the distance between their age and mine. I thought that survival made the record reliable. I can no longer separate what the source established from the importance I gave it while preparing to leave.',
      'The secret was a reason to investigate this planet. Now I have made it a possible route home, and that need changes the way I read. A missing line becomes deliberate concealment. An ordinary silence becomes an invitation. I know this defect in reasoning well enough to describe it and remain capable of it every morning.',
      'I shall keep two columns: what I actually hear, and what I hope it means. Today the first contains a family name, an unanswered transmission, and the sound of people praying outside my door. The second contains almost everything else. Neither column will be shown to the people who believe I have always lived here.',
    ],
    margin:
      'Prior knowledge is evidence about a source. It does not make every present rumor true.',
  },
  {
    id: 'theo-3867-03',
    year: 3867,
    title: 'A measure I did not bring',
    subtitle: 'Winter · the clinic window',
    paragraphs: [
      "I nearly exposed myself over the thermometer. I recognized a scale from histories I once read and answered a question before noticing which numbers the nurse had used. She was speaking in Rømer. My reply belonged to another convention. I blamed tiredness, then spent an afternoon copying the clinic's observations rather than displaying my own conversion.",
      'A correct calculation can still answer the wrong question. The nurse needed to know which bed lost heat when the door opened. I arranged the records by bed, hour, and proximity to the corridor. She had already noticed the pattern. My tidy table made it easier to ask for a curtain; it did not discover cold for her.',
      'I have travelled farther than anyone in that room could imagine and know less about keeping that room alive. This is a useful humiliation. Future knowledge will earn its place here through small, repeatable improvements. If I cannot explain a suggestion without invoking my origin, I must understand it better before offering it.',
    ],
    margin: 'Record the local reading first. Conversion is a second line.',
  },
  {
    id: 'theo-3868-04',
    year: 3868,
    title: 'Needles for the lungs',
    subtitle: 'Winter · cequin beds',
    paragraphs: [
      'Cequin resembles rosemary closely enough to tempt a careless comparison. The resemblance helped me remember its shape and told me nothing dependable about its action. Here its narrow leaves sustain breath in the cold. I know the difference in my own chest. I do not know the whole chain between leaf and lung.',
      'I proposed comparing doses and immediately imagined withholding leaves from half the clinic. That was the clean experiment in my first sketch. A woman watching me draw asked which patients I intended to frighten. I crossed it out. We can compare records of ordinary care, label bundles consistently, and admit what those observations cannot prove.',
      "The cultivated beds yield a predictable small harvest. Beyond them the branching, roots, and usable growth vary. I have begun sketching the whole plant before gathering it. A drawing takes longer than writing 'cequin,' but the name alone erases the difference between an abundant specimen and a frail one. Both can be exhausted. Neither appears because a priest requires another.",
    ],
    margin: "Do not turn another person's breath into an elegant control group.",
  },
  {
    id: 'theo-3869-05',
    year: 3869,
    title: 'The virtue of standing still',
    subtitle: 'Winter · private correction',
    paragraphs: [
      'I have told myself that restraint protects history. I nod through decisions, repeat the words expected of this office, and regard my silence as a kind of careful distance. Yesterday a clerk thanked me for supporting a restriction I had hoped would fail. My blessing had been entered beside the order.',
      "There is a convenient arithmetic in my private account: every intervention I imagine carries consequences, while every omission counts as zero. The clerk's ledger uses a more honest system. The seal went onto the page. The order travelled. People who never saw my hesitation will encounter its result.",
      'I still cannot forecast what a public refusal would do. It might expose me, divide the family, or merely replace my voice with a more willing one. Uncertainty deserves weight, but I have allowed it to excuse only the choice I find easiest. Henceforth I will record what my compliance enables with the same care I give the dangers of resistance. This rule is already unpleasant to follow.',
    ],
    margin: 'A decision made under cover remains a decision.',
  },
  {
    id: 'theo-3870-06',
    year: 3870,
    title: 'Children of Prometheus',
    subtitle: 'Winter · after the liturgy',
    paragraphs: [
      'They call the priests originais, true children of Prometheus. The words gather force as the congregation repeats them. I hear ancestry, authority, gratitude, and fear in a phrase I first treated as an item to translate. A translation that misses who may speak afterward is incomplete.',
      'In other places and ages I have seen a name survive while its obligations changed. That memory encourages comparisons. It cannot establish the origin of this belief. I have no right to flatten their Prometheus into an account I remember from elsewhere, however satisfying the resemblance might be.',
      "The people who approach me after worship ask for ordinary things: a sick relative admitted, a debt delayed, a quarrel heard fairly. Their reverence reaches me through the priest's face. I accepted it today while privately doubting the office that made them kneel. Then I used that office to have a request considered. I cannot call that innocent. I also cannot pretend the request would be better unanswered while I resolve my philosophy.",
    ],
    margin: 'Ask what a title permits, whom it obliges, and who pays for its protection.',
  },
  {
    id: 'theo-3871-07',
    year: 3871,
    title: 'Six columns',
    subtitle: 'Winter · the family register',
    paragraphs: [
      'I drew six columns for the great families and put resources, alliances, and grievances beneath each heading. By evening the page looked wonderfully intelligible. By morning I had heard a gardener defend a Brown proposal and a Brown worker object to its terms. I had built a diagram capable of explaining everyone except the people I met.',
      'The families matter. Their priests, obligations, and accumulated trust shape which door opens and whose testimony is believed. Yet a family contains households, rival interests, memories of favors, and people who are tired of the argument. I must record those differences without persuading myself that the larger power has disappeared.',
      'My position makes the error particularly easy. Messengers bring me statements polished for a priest. They rarely bring the disagreements that produced them. I have started noting who delivers an account, who benefits if it is repeated, and whose name is missing. A source can be sincere and still be a narrow window. Six columns are useful until I confuse their edges with the edges of human loyalties.',
    ],
    margin: 'Leave room beside every family name for a person who contradicts the summary.',
  },
  {
    id: 'theo-3872-08',
    year: 3872,
    title: 'Behind the deliberation',
    subtitle: 'Winter · a page kept folded',
    paragraphs: [
      "The name Cúpula do Destino belongs in this notebook only. Publicly, the priesthood presents the family's direction as a solemn responsibility. Privately, decisions arrive with an authority that precedes the ceremony in which I am meant to endorse them. The hidden council gives a shape to pressures I had mistaken for individual preference.",
      "My knowledge of it remains partial. Access through this body is not the same as understanding. An instruction, a pause at the wrong question, an agenda altered before it reaches the larger gathering: these tell me that direction is being exercised. They do not tell me every participant's purpose or how far the arrangement extends.",
      'I have begun retaining the order in which a proposal changes. The smallest alteration can matter: permission becoming duty, a temporary measure losing its end date, an unnamed exception acquiring a seal. I recognize these methods from other histories. Recognition helps me read the page; it does not grant me a complete view of the room behind it. I still pronounce the approved words aloud.',
    ],
    margin:
      'Keep the earlier wording. A final document conceals the path by which it became inevitable.',
  },
  {
    id: 'theo-3874-09',
    year: 3874,
    title: 'Food without the factory',
    subtitle: 'Winter · greenhouse inventory',
    paragraphs: [
      "The phrase 'pure plants' sounded sentimental when I first heard it. I pictured a society refusing useful tools. Then I watched a botanist distinguish beds by preparation, season, and intended use with a precision I had failed to notice. Their food and medicines arrive through cultivated living systems whose sophistication does not announce itself with a machine housing.",
      'I can remember industrial methods they have never seen. I cannot recreate the materials, measurements, labor, or maintenance that made those methods dependable where I knew them. Drawing a device from memory is easy. Accounting for everything needed to keep it working through winter is harder.',
      'The botanical system also has weaknesses. A harvest can fail; access can be controlled; expertise can remain inside a family. Admiration must not make those problems disappear. I am trying to compare complete arrangements: who grows, who repairs, who teaches, who may refuse a price. Calling one system advanced before asking those questions was another way of mistaking my own biography for a universal scale.',
    ],
    margin: 'Compare dependencies as carefully as outputs.',
  },
  {
    id: 'theo-3876-10',
    year: 3876,
    title: "Orlando's promise",
    subtitle: 'Winter · after the public address',
    paragraphs: [
      'Orlando Brown speaks of food and medicine in quantities large enough to quiet a hungry room. I understand the attraction. An industrial process might make a supply more regular, spare certain kinds of labor, or survive a particular failed crop. It might also concentrate the power to stop that supply in fewer hands. Neither outcome follows merely from the presence of a factory.',
      'He asks the other families to support a change whose costs they suspect they will bear. Some objections defend botanical knowledge. Others defend privileges of their own. I have listened for one honest motive that would sort the speakers into a clean moral arrangement. The search has made me a poorer listener.',
      'Today I asked who would retain access to cultivation if the trial succeeded. The answer returned to the promised volume of medicine. I asked again and was praised for my concern. Praise can be an efficient way to close a question. My public blessing followed anyway. I wrote down the unanswered question before I permitted myself to describe the address as productive.',
    ],
    margin: 'Capacity, ownership, and access require separate answers.',
  },
  {
    id: 'theo-3878-11',
    year: 3878,
    title: 'The furnace on the stage',
    subtitle: 'Winter · theatre programme inside cover',
    paragraphs: [
      'The play showed a furnace coughing up flowers while its owner swept fallen petals into a locked box. Nobody named Brown. The audience required no explanation. Outside, two people disputed whether the final flower belonged to a child or had been stolen from one. The same scene furnished opposite accusations before the street emptied.',
      'I had expected propaganda to make its argument unmistakable. The ambiguity is part of its reach. A spectator supplies the enemy, then carries the feeling home as a personal discovery. A denial remains available to the patron who paid for the performance.',
      "I remember wars in which images prepared an appetite that speeches later satisfied. Remembering them does not give me a timetable for this one. I have written 'war is inevitable' twice this week and struck it through twice. The danger is substantial. Inevitability is a claim I cannot support, and a dangerous gift to anyone who wants the audience to stop imagining another ending. I kept the programme because the printed joke may outlive our recollection of when it stopped being funny.",
    ],
    margin: 'Record laughter, silence, and who leaves before the applause.',
  },
  {
    id: 'theo-3880-12',
    year: 3880,
    title: 'A cathedral with an aerial',
    subtitle: 'Winter · west passage',
    paragraphs: [
      'Colored glass lays impossible gardens across the cathedral floor. Above the stonework, wires and radio fittings belong to a different account of the same civilization. My first instinct was to call the combination anachronistic. That word measures this place against an order of events I brought with me. Stíchos owes my histories no such sequence.',
      "The Gothic height serves authority and wonder at once. From the passage, a person becomes small enough to fit the institution's story about them. At the bench, the radio reduces that same institution to loose contact, fatigue, and a connection somebody has to repair. Both observations are true, and neither abolishes what the building means to those who enter it.",
      'I have been useful in small repairs: separating an intermittent fault from a bad component, keeping a record before changing two things at once. I still listen for the base in every unfamiliar sound. My hands can diagnose a connection while my hope misdiagnoses the static. Skill in one problem offers no immunity in the next.',
    ],
    margin: 'A beautiful pattern in noise still needs to recur under conditions I can describe.',
  },
  {
    id: 'theo-3881-13',
    year: 3881,
    title: "The painting's second audience",
    subtitle: 'Winter · reception room',
    paragraphs: [
      'In the painting, six crowned figures shared one set of roots. Their shadows had mouths; their faces had none. A visitor called it a defense of unity. Another called it a warning against dependence. I was asked to approve its place in the reception room, where petitioners would wait beneath it.',
      "I approved the placement and later caught myself writing that I had 'allowed the work to speak.' I had selected its audience. My title would accompany every interpretation whether I offered one or not. The artist's uncertainty about meaning did not cancel the certainty of my permission.",
      "I do not wish to turn every painting into a coded instruction. Art can hold experiences that a proclamation would flatten. That is also why political patrons desire it. I have copied the visitors' readings beside my own, including the reading that embarrassed me: six families nourished by people too small to appear in the frame. Tomorrow I will move a chair so a waiting person can choose to face the window. It is a small amendment to a decision that deserves a larger argument.",
    ],
    margin: 'Attribution includes the patron, the room, and the person made to wait there.',
  },
  {
    id: 'theo-3882-14',
    year: 3882,
    title: 'An old question under Sallas ink',
    subtitle: 'Winter · reading-room recollection',
    paragraphs: [
      'I saw a reference to Sallas work that appears to precede my arrival. I copied only what I could justify having read and left the uncertain dating marked as uncertain. The temptation is to treat every older reference to mind or memory as evidence that somebody expected me. That conclusion would make my isolation feel designed, and design would offer an adversary I could imagine confronting.',
      'There are other possibilities. Their work may concern an ordinary problem in their own intellectual tradition. A familiar term may carry a different meaning. My earlier research may have selected this family precisely because I was predisposed to notice such language here. None of those alternatives resolves the matter, but they belong on the page.',
      'The possibility of a route home survives this correction. I have not earned a mechanism, an invitation, or a culprit. What I have is a question that existed before my latest attempt to answer it. I will follow its provenance before I enlarge its promise. I am tired of writing this rule and grateful that I still can.',
    ],
    margin:
      'Check the date of the copy separately from the date of the work it claims to preserve.',
  },
  {
    id: 'theo-3883-15',
    year: 3883,
    title: 'A route carried in the head',
    subtitle: 'Winter · road notebook',
    paragraphs: [
      'A memorized account is unusually convenient for someone who has reason to fear a searched pocket. It also has an obvious weakness: the messenger can mistake confidence for exact recall. I repeat the authorized wording, then separately repeat what the sender omitted. I must keep the boundary audible even when nobody else hears it.',
      'An omission may protect a witness. It may conceal theft, preserve an uncertain rumor from becoming an accusation, or do several of these things at once. Carrying every version does not relieve me of deciding which to speak. The next settlement receives a person with interests, however accurately that person has memorized the words.',
      'The road reminds me how distant decisions are lived locally. A name on a route is not knowledge of the ground between us. I mark what I have actually walked and leave the rest blank. The discipline is useful beyond maps. Knowing where a question waits should not persuade me that I already know what I shall find there, or which answer a stranger can safely afford to give.',
    ],
    margin: "Preserve the sender's account and the omitted note as two attributed statements.",
  },
  {
    id: 'theo-3884-16',
    year: 3884,
    title: 'Instructions for the person I may enter',
    subtitle: 'Winter · unperformed experiment',
    paragraphs: [
      'I have imagined a successful transfer so often that the imagined scene now arrives with details no experiment supplied. There is another throat, a hand without these old scars, a door opening toward the base. The last detail is desire. I have underlined it separately.',
      "Before attempting another human mind, I owe the question of that person's fate more than the silence I have allowed around the priest's. An answering signal would establish contact of some kind. It would not by itself establish understanding, permission, or what remains of the person when I speak through their body. I cannot solve those obligations by naming the experience travel.",
      'There is a practical distinction I can state in advance: possessions belong to a body and to the life around it. My memory of a coin should not make the coin mine elsewhere. If this becomes possible, I must return to find what I left, accept what another person actually carries, and keep a record of the promises I have transported. A successful technique could deepen the original wrong.',
    ],
    margin: 'This page records conditions and doubts. No second transfer is being claimed here.',
  },
  {
    id: 'theo-3885-17',
    year: 3885,
    title: 'Ten years, counted twice',
    subtitle: 'Winter · reckoning toward 3886',
    paragraphs: [
      'Twenty stíchoi will have passed between 3866 and the coming year, 3886. Each local year occupies six Earth months. The arithmetic gives me ten Earth years, a duration small enough to write in a margin and large enough to alter every relationship that might still await me. I cannot calculate what happened at the base from what elapsed here.',
      'For a long time I treated the return as a restoration: the interrupted conversation resumed, my explanation heard, the borrowed life put down without remainder. That expectation has become harder to defend. I have made decisions here. People remember the priest doing things I chose. Going home would not remove those decisions from their lives.',
      'The blue beyond Vespera still seems capable of going on without limit. Walking into it is sometimes the only act that quiets my speculation. I return because a clinic, a clerk, or someone with an unanswered petition expects me. Attachment has not cancelled the desire to leave. It has given that desire consequences which the departure briefing never contained.',
    ],
    margin: 'An elapsed interval here is not a measurement of what the base experienced.',
  },
  {
    id: 'theo-3886-18',
    year: 3886,
    title: 'What I can do this morning',
    subtitle: 'Present day · Vespera',
    paragraphs: [
      'The transmission returns in sleep as though it happened yesterday. It happened twenty local years ago. I write the dates before leaving the bed: 3866, arrival; 3886, this morning. The memory is vivid enough to confuse the order, and I will not let its vividness erase the life between those numbers.',
      "I have spent too long waiting for a sufficiently complete explanation to authorize an imperfect action. Orlando's campaign gathers supporters and enemies. Theatre and painting rehearse their quarrel. The Cúpula do Destino continues to direct decisions I must answer for in public. The possibility of war deserves more than another elegant description of my uncertainty.",
      'I will begin near enough to be corrected. The botanist can tell me what the clinic needs now. Three cequin cannot serve two promises at once. After that, I will approach the archivist about Sallas and the engineer about the radio. A clearer signal may offer a next experiment. It will leave people, belongings, and unfinished obligations on this planet. I need a way home. I also need to stop using that need as the only scale of importance.',
    ],
    margin: 'Theo Bishop. Primeiro, ouvir. Then make one promise I can actually keep.',
  },
];

export const PLANT_NOTES: readonly PlantNote[] = [
  {
    id: 'cequin',
    title: 'Cequin',
    subtitle: 'Narrow leaves · breath in the cold',
    paragraphs: [
      'Cequin resembles rosemary closely enough to help me recognize its narrow needles. The comparison tells me little about its action. Its use for breathing is a fact of life on Stíchos. Branching stems, buds, and roots distinguish the specimens I draw, and I compare their usable growth before gathering.',
      'Field rule: one cequin restores 35 breath and adds three minutes of breathing protection. Repeated uses extend that protection up to ten minutes. A portion is consumed each time. Cequin also enters two preparations: two emberroot with one cequin make one ember tonic; one heartleaf with one cequin makes two botanical dressings.',
      'Wild specimens yield one to four portions according to their visible growth. Vespera’s teaching beds supply three. Gathered plants remain exhausted; returning to the same roots does not produce another bundle. My pack holds sixty items, so I leave a harvest intact when I cannot carry it whole.',
    ],
    observation:
      'Draw the branching before counting the portions. Keep a breathing supply separate in my planning, even when a recipe is tempting.',
  },
  {
    id: 'heartleaf',
    title: 'Heartleaf',
    subtitle: 'Broad leaves · restorative preparations',
    paragraphs: [
      'I recognize heartleaf by its broad, heart-shaped leaves and cool sap. Pressed beside the narrow cequin needles, its outline is unmistakable, but I still record the whole specimen. Broadleaf, tall, and small-leaf forms differ in usable growth. The clinic keeps this distinction more carefully than my first sketches did.',
      'Two heartleaf make one salve, restoring 35 health. One heartleaf and one cequin make two botanical dressings, each restoring 20 health. Neither preparation requires the workbench used for the signal lens. I prepare or trade the raw leaf; it does not serve as a direct healing consumable.',
      'Salve and dressings remain in the pack when the body is already fully healthy. A wild plant yields the displayed one to four portions; the teaching garden gives two. Gathering is finite. I should count the cequin cost of a dressing as carefully as its benefit to a wound.',
    ],
    observation:
      'A wide leaf is an identifying feature. The displayed whole-plant profile determines harvest; width alone is not a reliable quantity rule.',
  },
  {
    id: 'emberroot',
    title: 'Emberroot',
    subtitle: 'Warm-colored roots · a botanical tonic',
    paragraphs: [
      'I sketch the roots beneath the narrow leaves because the usable crop lies there. The warm coloring makes this plant easy to remember. Fine-root and heavy-root specimens deserve separate drawings: a familiar name is poor preparation for discovering a smaller harvest than I expected. The tonic has a measured place in my road supplies.',
      'Two emberroot and one cequin prepare one ember tonic. Drinking it restores 55 warmth and 25 breath; it does not add cequin’s timed breathing protection. The raw root cannot be consumed directly through the field kit. Preparation can happen away from a workbench if I carry the required materials.',
      'The wild profile records one to four portions from the plant’s visible growth; Vespera’s cultivated lesson beds give two. The whole harvest must fit before I remove a plant. A consumed tonic is gone, and repeated use near full warmth can waste part of its benefit. Cold planning begins before the warmth reserve is empty.',
    ],
    observation:
      'Compare the tonic’s immediate warmth with cequin’s sustained breathing support. They solve overlapping needs with different supplies.',
  },
  {
    id: 'mushroom',
    title: 'Winter fungi',
    subtitle: 'Snowcaps · food along the road',
    paragraphs: [
      'Pale caps rise in slender or clustered groups from a connected winter mat. I record snowcaps as food for the road, alongside the plants I carry for breath and medicine. My drawing follows stalks and caps down to their shared base. A leaf diagram would conceal the structure I am trying to remember.',
      'Gathering a snowcap patch places ready plant rations directly in my pack. I keep no separate stock of raw fungi and require no additional recipe for this food. One ration restores 35 stamina, 20 warmth, and 8 health. It supplies neither an immediate breath increase nor cequin’s breathing protection.',
      'Wild patches yield their recorded one to four rations. The whole pickup needs room within the sixty-item limit. A gathered patch supplies no second meal when I return. I mark a food stop after observing it and leave enough provisions to reach another place if that stop has already been used.',
    ],
    observation:
      'Count the usable cluster before gathering. A previously harvested food stop is a remembered location, not a promise of replenishment.',
  },
];

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'Stíchos',
    definition:
      'The cold blue planet on which Theo is stranded. Stíchos names the whole world, not its starting city.',
  },
  {
    term: 'Vespera',
    definition:
      'The city where Theo has lived in the priest’s body. Its cathedral, clinic, and familiar streets are a small part of the planet beyond them.',
  },
  {
    term: 'Stíchoi',
    definition:
      'Local years. One lasts six Earth months; the twenty between 3866 and 3886 equal ten Earth years. This conversion does not establish how time has passed at Theo’s base.',
  },
  {
    term: 'Theo Bishop',
    definition:
      'The traveler’s identity on Stíchos: an exceptionally intelligent visitor from a future civilization, experienced in travel across times and worlds, now concealed in a priest’s body.',
  },
  {
    term: 'The priest',
    definition:
      'The person whose body received Theo in the failed transmission. The original mind’s fate is unresolved. Theo’s public authority and private identity remain distinct.',
  },
  {
    term: 'Originais',
    definition:
      'The revered priests, regarded as true children of Prometheus. The title expresses the inhabitants’ belief and authority structure; this notebook does not certify divine ancestry.',
  },
  {
    term: 'Prometheus',
    definition:
      'The figure invoked in the priests’ sacred lineage. Familiarity with a name from another history does not prove that Theo understands its entire meaning on Stíchos.',
  },
  {
    term: 'Cúpula do Destino',
    definition:
      'The hidden council directing the great families’ destinies. Theo’s access through the priest does not make its membership, every decision, or its full purpose transparent.',
  },
  {
    term: 'The six families',
    definition:
      'The great clans through which political, religious, and economic loyalties are organized. Their priests direct them, but households within a family can disagree about whom to trust and what their obligations require.',
  },
  {
    term: 'Orlando Brown',
    definition:
      'The Brown priest promoting industrial food and medicine. His campaign challenges established botanical practices and helps drive the struggle expressed through propaganda and threatened war.',
  },
  {
    term: 'Sallas',
    definition:
      'The family whose secret attracted Theo’s investigation and may offer hope of return. Its records and alignments give him questions to pursue. They have not explained the failed arrival or established a way home.',
  },
  {
    term: 'Pure plants',
    definition:
      'The highly developed botanical basis of food and medicine on Stíchos. Cultivation requires knowledge and labor; access to plants can be controlled as tightly as access to a factory.',
  },
  {
    term: 'Cequin',
    definition:
      'The rosemary-like plant that sustains breathing in Stíchos’s cold. Theo keeps a supply for his lungs and records the portions needed for tonics and dressings, since one bundle cannot meet every need at once.',
  },
  {
    term: 'Rømer',
    definition:
      'The temperature scale used by the inhabitants. Theo records local readings before comparing them with conventions remembered from elsewhere.',
  },
  {
    term: 'Mind transmission',
    definition:
      'The passage of a mind into another being’s body. An answering human signal may offer Theo another host. The body’s belongings remain where they are; he carries memories and unfinished commitments.',
  },
  {
    term: 'Private notebook',
    definition:
      'The priest’s physical notebook, filled with Theo’s private observations. It stays among that body’s belongings when Theo leaves. He can remember its contents through another life, but the paper must be found where it was left.',
  },
];

export const INTRO_BEATS: readonly (readonly [time: string, title: string, body: string])[] = [
  [
    'BEFORE STÍCHOS',
    'A departure from the future',
    'I knew other worlds and other times. Before leaving the base, I had already encountered the name Sallas. Their secret made Stíchos worth the journey.',
  ],
  [
    '3866 · TRANSMISSION',
    'The wrong voice answered',
    'The transmission failed. I woke in a priest’s body, with somebody calling me Father. I could not reach the base. I still do not know what happened to the priest’s mind.',
  ],
  [
    '3866–3886 · TWENTY STÍCHOI',
    'Ten Earth years in another life',
    'Stíchos is the cold blue planet beyond these windows. Cequin keeps this body breathing. Twenty local years have passed while I keep my identity concealed.',
  ],
  [
    '3886 · THE SIX FAMILIES',
    'The words I am expected to speak',
    'The priests are revered as originais, children of Prometheus. Their hidden Cúpula do Destino directs the families. I have endorsed decisions I privately opposed.',
  ],
  [
    '3886 · A QUARREL GATHERING FORCE',
    'Orlando Brown promises an industrial future',
    'Food and medicine from factories challenge a civilization of cultivated plants. Theatre and painting carry the struggle between families. I fear what may follow.',
  ],
  [
    'PRESENT DAY · VESPERA',
    'Begin where someone can correct me',
    'This morning belongs to Vespera, not to the memory of my arrival. I will hear what the botanist’s clinic needs, then follow the Sallas lead through the archivist and the damaged radio.',
  ],
];
