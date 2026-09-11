/** A tile is one world unit. x/east, y/south; height is visual elevation only. */
export interface Point {
  x: number;
  y: number;
}
export type Terrain =
  | 'snow'
  | 'grass'
  | 'ice'
  | 'water'
  | 'road'
  | 'floor'
  | 'wall'
  | 'bridge'
  | 'sand'
  | 'mud'
  | 'basalt';
export type Biome =
  | 'frostwood'
  | 'tundra'
  | 'marsh'
  | 'highlands'
  | 'woodland'
  | 'meadow'
  | 'wetland'
  | 'dunes'
  | 'badlands'
  | 'volcanic'
  | 'alpine'
  | 'settlement';
export type TreeForm = 'conifer' | 'broadleaf' | 'willow' | 'acacia' | 'palm' | 'cactus' | 'snag';
export type RockMaterial = 'granite' | 'slate' | 'sandstone' | 'basalt' | 'limestone';
export type ArchitectureStyle = 'gothic' | 'timber' | 'adobe' | 'stilt' | 'basalt' | 'alpine';
/** Regional building grammar: shared local materials, climate adaptations and clan craft. */
export interface ArchitecturalCulture {
  seed: number;
  style: ArchitectureStyle;
  wallMaterial: 'stone' | 'timber' | 'adobe' | 'basalt' | 'metal' | 'glass' | 'composite';
  roof: 'steep' | 'flat' | 'terraced' | 'gable';
  wallColor: string;
  roofColor: string;
  woodColor: string;
  accentColor: string;
  window: 'arch' | 'square' | 'slit';
  raised: boolean;
  technology?: number;
  industry?: number;
  organics?: number;
  illumination?: number;
  transparency?: number;
  verticality?: number;
  ornament?: number;
  motif?: 'carved' | 'riveted' | 'latticed' | 'circuit' | 'grown';
  eraName?: string;
}
export interface TileEcology {
  moisture: number;
  elevation: number;
  geothermal: number;
  treeForm: TreeForm;
  rockMaterial: RockMaterial;
  groundCover: number;
}
/** Planned nonblocking ground planting; tree trunks remain separate harvestable props. */
export interface TownLandscape {
  parcel: string;
  seed: number;
  kind: 'grove' | 'garden' | 'planter';
  density: number;
  /** Exposed boundaries: north 1, east 2, south 4, west 8. */
  edge: number;
}
export type ItemId =
  | 'cequin'
  | 'heartleaf'
  | 'emberroot'
  | 'wood'
  | 'ore'
  | 'salve'
  | 'tonic'
  | 'rations'
  | 'bandage'
  | 'seal'
  | 'lens';
export type BuildingKind =
  | 'church'
  | 'house'
  | 'inn'
  | 'workshop'
  | 'greenhouse'
  | 'storehouse'
  | 'hall';
export interface Tile extends Point {
  seed: number;
  terrain: Terrain;
  biome: Biome;
  height: number;
  temperature: number;
  detail: number;
  building?: string;
  buildingKind?: BuildingKind;
  architecture?: ArchitecturalCulture;
  ecology?: TileEcology;
  cultivated?: boolean;
  landscape?: TownLandscape;
  site?: string;
  clan?: number;
}
export type PropKind =
  | 'pine'
  | 'rock'
  | 'cequin'
  | 'heartleaf'
  | 'emberroot'
  | 'lamp'
  | 'bench'
  | 'chest'
  | 'notice'
  | 'radio'
  | 'workbench'
  | 'shrine'
  | 'door'
  | 'grave'
  | 'mushroom'
  | 'banner'
  | 'crate';
export interface Prop extends Point {
  id: string;
  seed: number;
  kind: PropKind;
  vegetation?: TreeForm;
  mineral?: RockMaterial;
  solid: boolean;
  name: string;
  clan?: number;
  building?: string;
}
export type NpcRole =
  | 'botanist'
  | 'merchant'
  | 'archivist'
  | 'engineer'
  | 'guard'
  | 'refugee'
  | 'raider'
  | 'pilgrim';
export interface Appearance {
  /** Civilization construction tier; present even when this resident carries no weapon. */
  technology?: 0 | 1 | 2 | 3;
  /** Body-owned forged item seed; never changes this person's anatomy. */
  weaponSeed?: number;
  /** A generated physical object; anatomy still derives from seed. */
  artifactDesign?: string;
  seed: number;
  skin: string;
  hair: string;
  coat: string;
  trim: string;
  trousers: string;
  height: number;
  build: number;
  hairStyle: number;
  hat: number;
  cloak: boolean;
  weapon: 'staff' | 'sword' | 'bow' | 'none';
}
export interface Npc extends Point {
  id: string;
  seed: number;
  name: string;
  role: NpcRole;
  clan: number;
  appearance: Appearance;
  maxHp: number;
  hp: number;
  home: Point;
  speed: number;
  heading: number;
  phase: number;
  hostile: boolean;
  cooldown: number;
}
export interface Settlement extends Point {
  id: string;
  seed: number;
  name: string;
  clan: number;
  kind: 'cathedral' | 'village' | 'foundry';
  rank?: 'city' | 'village' | 'hamlet';
  architecture?: ArchitecturalCulture;
  radius: number;
}
export interface Chunk {
  cx: number;
  cy: number;
  tiles: Tile[];
  props: Prop[];
  npcs: Npc[];
  settlements: Settlement[];
}
export interface Clan {
  id: number;
  name: string;
  color: string;
  doctrine: string;
}
export interface WorldChange {
  removed: string[];
  opened: string[];
}
export interface Player extends Point {
  name: string;
  bodyName: string;
  clan: number;
  appearance: Appearance;
  hp: number;
  maxHp: number;
  breath: number;
  warmth: number;
  stamina: number;
  heading: number;
  phase: number;
  speed: number;
  level: number;
  xp: number;
  coins: number;
  attackCooldown: number;
  wardCooldown: number;
  cequinTime: number;
}
export interface Effect extends Point {
  id: number;
  kind: 'slash' | 'ward' | 'heal' | 'harvest' | 'hurt' | 'mind' | 'speech' | 'ember' | 'arrow';
  age: number;
  duration: number;
  color: string;
  heading?: number;
  text?: string;
  /** Physical body responsible for the effect; omitted for legacy proximity-based effects. */
  actorId?: string;
  tool?: { kind: 'axe' | 'pickaxe' | 'sickle'; seed: number };
}
export interface Quest {
  id: string;
  title: string;
  description: string;
  stage: number;
  complete: boolean;
  target?: Point;
  objective: string;
}
export interface DialogueChoice {
  id: string;
  label: string;
  disabled?: boolean;
  detail?: string;
}
export interface Dialogue {
  speaker: string;
  role: string;
  text: string;
  choices: DialogueChoice[];
  npcId?: string;
}
export interface JournalEntry {
  title: string;
  text: string;
  time: number;
}
export interface Recipe {
  id: string;
  name: string;
  description: string;
  cost: Partial<Record<ItemId, number>>;
  result: ItemId;
  amount: number;
}
export interface GameEvent {
  kind:
    | 'step'
    | 'attack'
    | 'hurt'
    | 'harvest'
    | 'heal'
    | 'quest'
    | 'dialogue'
    | 'transfer'
    | 'level'
    | 'trade'
    | 'ward';
  text?: string;
}
export interface Input {
  x: number;
  y: number;
  run: boolean;
}
