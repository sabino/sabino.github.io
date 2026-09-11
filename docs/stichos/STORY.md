# Theo Bishop’s private notebook

The notebook in [lore.ts](../../src/stichos/lore.ts) is original English adaptation prose based on the author’s **Destino: Stíchos**. It is not a recovered manuscript, a translation of the full source, or a new ending attributed to the author. [CANON.md](CANON.md) records the source facts that control the adaptation.

The collection contains eighteen dated entries, from 3866 through 3886, comprising 3,111 words of notebook prose. Each entry contains 158–185 words, plus a brief marginal note. Four botanical sheets, sixteen glossary definitions, and six introductory beats provide separate reference material. The notebook dates mark selected observations rather than an exhaustive diary of every local year.

## Chronology and identity

**Stíchos is the planet. Vespera is the starting city**, a name introduced for this adaptation. Theo arrived in 3866. The present is 3886, twenty local stíchoi later. At six Earth months per local year, that interval equals ten Earth years. The prose does not assume that Theo’s base experienced the same interval.

Theo is exceptionally intelligent and comes from a future civilization familiar with travel across times and worlds. His earlier investigation had already encountered Sallas. The secret helps explain his interest in this planet and now offers hope of return. Prior research gives him a question to pursue; it does not prove that Sallas caused the failed arrival, expected him, or possesses a working route to his base.

The arrival placed Theo in a priest’s body by mistake. The original priest’s mental fate remains unknown. The notebook never establishes that the priest died, consented, disappeared, or secretly communicates with Theo. The 3884 entry considers another transfer prospectively; it does not claim that the playable signal repair or a later possession has already happened.

The first two notebook entries belong to the arrival. The final entry belongs to the present day in Vespera. The opening replay is a memory of 3866, followed by an explicit return to 3886. A player reading the notebook after a new game has therefore not just arrived on Stíchos.

## Narrative approach

The entries use private first-person observation. Theo’s intelligence appears through provenance checks, simple record keeping, attention to causal claims, and revisions of his own explanations. He can help isolate a radio fault or organize clinic observations without recreating a future industrial infrastructure from memory. Local expertise can correct him.

His central revision concerns nonintervention. Early restraint becomes an account of moral complicity: the priest’s endorsement enters an official record even when Theo privately objects. Later entries examine how patrons, institutions, and audiences shape political art. The play, paintings, clinic conversations, administrative details, and specific notebook incidents are newly written scenes that give this tension concrete form. They are not quotations from the source story or additional events the author has confirmed.

Orlando Brown’s industrial campaign promises food and medicine while threatening established botanical arrangements. The notebook leaves room for real benefits, concentrated control, sincere disagreement, and interests within every family. It avoids reducing industry to an intrinsically evil technology or botany to an effortless society without power or scarcity.

The priests’ reverence as **originais**, their association with **Prometheus**, the six families, and the hidden **Cúpula do Destino** remain narrative anchors. Religious claims are expressed as the inhabitants’ beliefs rather than certified cosmological facts. Theo recognizes possible historical analogies without declaring their traditions identical to ones he remembers.

Brown and Sallas are source family names. Generated names for the other families and residents remain adaptation material. The notebook uses no fixed name for those residents, so the private narrative remains coherent across seeded worlds. It does not resolve player choices, assign a completed correspondence delivery, spend an inventory bundle, repair the radio, or pronounce a final outcome for the political conflict.

## Botanical sheets and playable rules

Cequin’s rosemary-like appearance and importance to breathing come from the source story. **Heartleaf, emberroot, and winter fungi are adaptation species.** The source establishes highly developed plant-based food and medicine; these additions make that practice available through concrete gathering and preparation. No invented Latin taxonomy is supplied.

The sheets distinguish Theo’s observations from explicit field-kit rules. Quantities describe the fictional simulation, not real-world botanical or medical instructions. Their numerical statements were checked against `ITEMS`, `RECIPES`, `botanicalProfile`, `harvest`, `use`, and `craft` in [session.ts](../../src/stichos/session.ts), and the visible profiles in [botany.ts](../../src/stichos/botany.ts).

| Sheet        | Current playable behavior                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cequin       | One portion restores 35 breath and adds 180 seconds of protection, accumulating up to 600 seconds. It is also an ingredient in tonic and dressings.                                  |
| Heartleaf    | Two leaves make one salve, restoring 35 health. One heartleaf plus one cequin makes two dressings; each restores 20 health. Raw heartleaf is a material.                             |
| Emberroot    | Two roots plus one cequin make one tonic, restoring 55 warmth and 25 breath. The tonic does not add timed cequin protection. Raw emberroot is a material.                            |
| Winter fungi | Gathering directly supplies plant rations in the field-kit abstraction. One ration restores 35 stamina, 20 warmth, and 8 health. It gives no breath restoration or timed protection. |

Current wild specimens yield the displayed one to four portions according to their composed plant structure. The origin teaching garden preserves its fixed yield of three cequin or two other portions. Generation-one saves also retain their established cultivated quantities; a plant sheet does not change older-world mechanics.

Harvesting removes the actual plant persistently. An entire pickup must fit within the sixty-item pack before it succeeds. Salve, tonic, and dressing preparation do not need a workbench; the signal lens does. Healing salve and dressings are not consumed at full health. Other consumables can be spent while some of their benefit would exceed the relevant resource limit.

## Mind travel and unfinished obligations

The playable signal supports entry into another existing nearby human. It is a mental event expressed by the interface, without a physical portal or extraction gate. The broader moral questions remain part of Theo’s unresolved account; a signal or selectable host does not establish a general answer about the original priest’s fate.

Physical possessions remain with the body. A later host has their own finite supplies, coins, and equipment. Returning to a previously inhabited body restores its actual remaining belongings. Theo retains memories, experience, discoveries, journal entries, and unfinished commitments. The private notebook is also a physical possession in the priest’s body ledger. Its paper stays with that body during transfer and becomes physically available again when Theo returns to those belongings. Theo can remember the contents from another body; a presentation of those memories does not transport the book itself. Clinic recovery restores the same body and is distinct from possession.

A recorded mission destination may be known before its terrain has been explored. The notebook’s map language respects that difference. Distant promises give walking a purpose; accepting one does not disclose the intervening landscape or certify the account a messenger carries.

## Intro and book integration

The module exports `JOURNAL_ENTRIES`, `PLANT_NOTES`, `GLOSSARY`, and `INTRO_BEATS`. The six intro records are readonly `[time, title, body]` string tuples intended for user-paced presentation: future departure, failed arrival, elapsed years, family authority, Brown’s campaign, and a present-day purpose in Vespera. They supply content rather than automatic timing.

Notebook entries use stable IDs and numeric local years. Their paragraphs are separate strings so the book can paginate and wrap them naturally. Marginal notes express Theo’s changing discipline; they are not quest requirements or new game rules. Botanical observations and glossary text remain reference sections, separate from the live event journal generated by play. Their in-world wording describes Theo’s knowledge and surroundings; source provenance and adaptation labels belong in this document, not in the notebook’s definitions.

The author’s broader concepts include runner, point-and-click, and action-RPG interpretations. This content acknowledges that range without promising additional playable modes. The present implementation remains a continuous humanoid RPG with walking, conversation, gathering, trade, preparation, combat, exploration, and mind travel. The notebook and intro deepen that mode; they do not announce a runner campaign, a separate puzzle adventure, or a completed ARPG story arc.
