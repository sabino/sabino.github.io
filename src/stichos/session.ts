import { InfiniteWorld, appearance, CHUNK_SIZE } from './world.ts';
import { deriveSeed } from '../procedural/random.ts';
import type {
  Dialogue,
  Effect,
  GameEvent,
  Input,
  ItemId,
  JournalEntry,
  Npc,
  Player,
  Point,
  Prop,
  Quest,
  Recipe,
} from './types.ts';

export const ITEMS: Record<ItemId, { name: string; description: string; price: number }> = {
  cequin: {
    name: 'Cequin',
    description:
      'Rosemary-like leaves that sustain breath in the cold. Protects breathing for three minutes.',
    price: 4,
  },
  heartleaf: {
    name: 'Heartleaf',
    description: 'A medicinal leaf used in healing salves and dressings.',
    price: 3,
  },
  emberroot: {
    name: 'Emberroot',
    description: 'A warming root used in botanical tonics.',
    price: 4,
  },
  wood: {
    name: 'Timber',
    description: 'Gathered with the staff. Used for tools and radio repairs.',
    price: 3,
  },
  ore: {
    name: 'Conductive ore',
    description: 'Recovered with the staff. A raw material for lenses and wiring.',
    price: 5,
  },
  salve: {
    name: 'Heartleaf salve',
    description: 'A prepared botanical medicine. Restores 35 health.',
    price: 12,
  },
  tonic: { name: 'Ember tonic', description: 'Restores 55 warmth and 25 breath.', price: 14 },
  rations: {
    name: 'Plant rations',
    description: 'Restores 35 stamina, 20 warmth, and 8 health.',
    price: 6,
  },
  bandage: {
    name: 'Botanical dressing',
    description: 'A clean plant-fibre dressing. Restores 20 health.',
    price: 8,
  },
  seal: {
    name: 'Family seal',
    description: 'Evidence of service to a local community.',
    price: 20,
  },
  lens: {
    name: 'Signal lens',
    description: 'A carefully aligned conductive lens. Craft at a workbench.',
    price: 24,
  },
};

export const RECIPES: Recipe[] = [
  {
    id: 'salve',
    name: 'Heartleaf salve',
    description: 'Crush two heartleaves into a restorative salve.',
    cost: { heartleaf: 2 },
    result: 'salve',
    amount: 1,
  },
  {
    id: 'tonic',
    name: 'Ember tonic',
    description: 'Prepare emberroot with cequin to warm the body.',
    cost: { emberroot: 2, cequin: 1 },
    result: 'tonic',
    amount: 1,
  },
  {
    id: 'bandage',
    name: 'Botanical dressing',
    description: 'Weave heartleaf fibre with a cequin antiseptic.',
    cost: { heartleaf: 1, cequin: 1 },
    result: 'bandage',
    amount: 2,
  },
  {
    id: 'lens',
    name: 'Signal lens',
    description: 'Align two conductive ores in a timber housing at a workbench.',
    cost: { ore: 2, wood: 1 },
    result: 'lens',
    amount: 1,
  },
];

type Weapon = 'staff' | 'sword' | 'bow';
export interface WeaponProfile {
  name: string;
  material: string;
  effect: 'stagger' | 'breath' | 'warmth';
  effectDescription: string;
  color: string;
  damage: number;
  range: number;
  cooldown: number;
}
type SupplyJob = {
  npcId: string;
  item: 'cequin' | 'heartleaf' | 'emberroot';
  amount: number;
  number: number;
  active: boolean;
  target: Point;
};
type Arrow = {
  effect: Effect;
  vx: number;
  vy: number;
  damage: number;
  enchantment: WeaponProfile['effect'];
};
const CAPACITY = 60;
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const itemIds = Object.keys(ITEMS) as ItemId[];
const isItem = (v: string): v is ItemId => itemIds.includes(v as ItemId);

/** Persistent human-scale simulation; chunk eviction never discards a player's actions. */
export class Stichos {
  readonly world: InfiniteWorld;
  player: Player;
  inventory: Partial<Record<ItemId, number>> = { cequin: 3, rations: 2, bandage: 2 };
  readonly removed = new Set<string>();
  readonly opened = new Set<string>();
  readonly weapons = new Set<Weapon>(['staff']);
  effects: Effect[] = [];
  npcs: Npc[] = [];
  quests: Quest[] = [];
  journal: JournalEntry[] = [];
  dialogue: Dialogue | null = null;
  events: GameEvent[] = [];
  time = 0;
  distanceTraveled = 0;
  readonly visited = new Set<string>();
  reputation = [0, 0, 0, 0, 0, 0];
  storyStage = 0;
  phase: 'playing' | 'lost' = 'playing';
  occupiedNpcId: string | null = null;
  private occupiedBody: Npc | null = null;
  private npcMemory = new Map<string, Npc>();
  private npcRuntime = new Map<string, Npc>();
  private supplyJobs = new Map<string, SupplyJob>();
  private arrows: Arrow[] = [];
  private nextEffect = 1;
  private refreshClock = 0;
  private stepClock = 0;
  private lifeCount = 0;
  private restAnchor: Point;
  private seed: number;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) throw new Error('A world seed must be a safe integer.');
    this.seed = seed >>> 0;
    this.world = new InfiniteWorld(this.seed);
    this.restAnchor = { ...this.world.spawn };
    this.player = {
      ...this.world.spawn,
      name: 'Theo Bishop',
      bodyName: 'The priest',
      clan: 1,
      appearance: appearance(this.seed ^ 0x7468656f, 'archivist', 1),
      hp: 100,
      maxHp: 100,
      breath: 100,
      warmth: 90,
      stamina: 100,
      heading: Math.PI / 2,
      phase: 0,
      speed: 3,
      level: 1,
      xp: 0,
      coins: 18,
      attackCooldown: 0,
      wardCooldown: 0,
      cequinTime: 0,
    };
    this.player.appearance.weapon = 'staff';
    this.player.appearance.coat = '#8d5847';
    this.player.appearance.cloak = true;
    this.quests = [
      {
        id: 'first-breath',
        title: 'Twenty stíchoi later',
        description:
          '3886. Ten Earth years have passed in the priest’s body. Begin with the people keeping this settlement alive.',
        stage: 0,
        complete: false,
        objective: 'Speak with the botanist near the plaza.',
        target: this.originTarget('origin-botanist'),
      },
    ];
    this.entry(
      'Theo Bishop · 3886',
      'The failed transmission is a memory. Ten Earth years, twenty stíchoi, have passed in this priest’s body. Cequin sustains breath; the Sallas secret may yet explain the silence from home.',
    );
    this.refreshNpcs();
    this.visit();
  }

  get transferReady() {
    return this.storyStage >= 4;
  }
  get transferCandidate(): Npc | null {
    if (!this.transferReady) return null;
    const center = this.phase === 'lost' ? this.restAnchor : this.player;
    const candidates = new Map<string, Npc>();
    for (const original of this.world.npcsAround(center.x, center.y, 14)) {
      const npc = this.npcMemory.get(original.id) ?? this.npcRuntime.get(original.id) ?? original;
      candidates.set(npc.id, npc);
    }
    for (const npc of [...this.npcMemory.values(), ...this.npcs]) candidates.set(npc.id, npc);
    const priority = (npc: Npc) => (npc.role === 'pilgrim' ? 0 : npc.role === 'refugee' ? 1 : 2);
    const target = [...candidates.values()]
      .filter(
        (npc) =>
          npc.id !== this.occupiedNpcId &&
          npc.hp > 0 &&
          !npc.hostile &&
          !this.removed.has(npc.id) &&
          ['pilgrim', 'refugee', 'guard'].includes(npc.role) &&
          !(npc.role === 'guard' && this.reputation[npc.clan] < -24) &&
          distance(npc, center) <= 14 &&
          this.clear(npc),
      )
      .sort((a, b) => priority(a) - priority(b) || distance(a, center) - distance(b, center))[0];
    return target ? clone(target) : null;
  }
  get capacity() {
    return CAPACITY;
  }
  get carried() {
    return Object.values(this.inventory).reduce((sum, n) => sum + (n ?? 0), 0);
  }

  weaponProfile(kind: Weapon): WeaponProfile {
    const seed = deriveSeed(this.seed, 'theo-weapon', kind);
    const effect = (['stagger', 'breath', 'warmth'] as const)[seed % 3];
    const material = (
      kind === 'sword'
        ? ['blue steel', 'tempered iron', 'Sallas alloy']
        : ['frostwood', 'ironbark', 'silver birch']
    )[(seed >>> 4) % 3];
    const effectDescription = {
      stagger: 'Successful hits delay the target’s next attack.',
      breath: 'Successful hits restore two breath.',
      warmth: 'Successful hits restore three warmth.',
    }[effect];
    const prefix = { stagger: 'Steadfast', breath: 'Breathkeeper', warmth: 'Emberbound' }[effect];
    return {
      name: `${prefix} ${material} ${kind}`,
      material,
      effect,
      effectDescription,
      color: { stagger: '#d9e2ee', breath: '#a8d8d1', warmth: '#e2b088' }[effect],
      damage:
        (kind === 'sword' ? 25 : kind === 'bow' ? 16 : 17) +
        ((seed >>> 8) % 5) +
        this.player.level * 2,
      range:
        kind === 'bow'
          ? 8.5 + ((seed >>> 12) % 5) * 0.4
          : (kind === 'sword' ? 1.65 : 1.5) + ((seed >>> 12) % 4) * 0.04,
      cooldown: Number(
        (
          (kind === 'sword' ? 0.46 : kind === 'bow' ? 0.63 : 0.58) +
          ((seed >>> 16) % 5) * 0.01
        ).toFixed(2),
      ),
    };
  }

  update(dt: number, input: Input) {
    if (!finite(dt) || dt <= 0 || this.phase !== 'playing' || this.dialogue) return;
    const ix = finite(input.x) ? clamp(input.x, -1, 1) : 0;
    const iy = finite(input.y) ? clamp(input.y, -1, 1) : 0;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 0.000001) {
      const step = Math.min(remaining, 1 / 30);
      this.tick(step, { x: ix, y: iy, run: !!input.run });
      remaining -= step;
      if (this.phase !== 'playing') break;
    }
  }

  private tick(dt: number, input: Input) {
    const p = this.player;
    this.time += dt;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.wardCooldown = Math.max(0, p.wardCooldown - dt);
    p.cequinTime = Math.max(0, p.cequinTime - dt);
    const length = Math.hypot(input.x, input.y);
    const running = input.run && length > 0 && p.stamina > 1;
    if (length > 0) {
      p.heading = Math.atan2(input.y, input.x);
      const speed = p.speed * (running ? 1.55 : 1);
      const before = { x: p.x, y: p.y };
      this.move(
        p,
        (input.x / Math.max(1, length)) * speed * dt,
        (input.y / Math.max(1, length)) * speed * dt,
      );
      const moved = distance(p, before);
      this.distanceTraveled += moved;
      p.phase += moved * 2.5;
      this.stepClock += moved;
      if (this.stepClock > 0.85) {
        this.stepClock = 0;
        this.event('step');
      }
    }
    p.stamina = clamp(p.stamina + (running ? -15 : 18) * dt);
    const tile = this.world.tile(p.x, p.y);
    const sheltered = tile.terrain === 'floor';
    p.breath = clamp(p.breath + (p.cequinTime > 0 ? 0.3 : sheltered ? -0.03 : -0.11) * dt);
    p.warmth = clamp(p.warmth + (sheltered ? 1.2 : running ? -0.015 : -0.075) * dt);
    if (p.breath <= 0 || p.warmth <= 0) this.hurt((p.breath <= 0 ? 0.9 : 0.35) * dt, false);
    this.refreshClock -= dt;
    if (this.refreshClock <= 0) {
      this.refreshClock = 0.6;
      this.refreshNpcs();
      this.visit();
    }
    this.updateNpcs(dt);
    this.updateArrows(dt);
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter((e) => e.age < e.duration);
  }

  private clear(point: Point) {
    const r = 0.21;
    return [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ].every(([x, y]) => !this.world.blocked(point.x + x, point.y + y, this.removed));
  }

  private move(point: Point, dx: number, dy: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
    for (let i = 0; i < steps; i++) {
      const x = { x: point.x + dx / steps, y: point.y };
      if (this.clear(x)) point.x = x.x;
      const y = { x: point.x, y: point.y + dy / steps };
      if (this.clear(y)) point.y = y.y;
    }
  }

  private refreshNpcs() {
    for (const npc of this.npcs) {
      this.rememberNpc(npc);
      this.npcRuntime.delete(npc.id);
      this.npcRuntime.set(npc.id, clone(npc));
    }
    while (this.npcRuntime.size > 128) this.npcRuntime.delete(this.npcRuntime.keys().next().value!);
    const generated = this.world.npcsAround(this.player.x, this.player.y, 15);
    const candidates = new Map<string, Npc>();
    for (const npc of generated) {
      const saved = this.npcMemory.get(npc.id) ?? this.npcRuntime.get(npc.id);
      const actor = saved ? clone(saved) : clone(npc);
      if (
        actor.id !== this.occupiedNpcId &&
        actor.hp > 0 &&
        !this.removed.has(actor.id) &&
        distance(actor, this.player) <= 18
      )
        candidates.set(actor.id, actor);
    }
    for (const npc of this.npcMemory.values())
      if (
        npc.id !== this.occupiedNpcId &&
        npc.hp > 0 &&
        !this.removed.has(npc.id) &&
        distance(npc, this.player) <= 17 &&
        !candidates.has(npc.id)
      )
        candidates.set(npc.id, clone(npc));
    this.npcs = [...candidates.values()]
      .sort((a, b) => distance(a, this.player) - distance(b, this.player))
      .slice(0, 64);
  }

  private rememberNpc(npc: Npc) {
    // Only consequences belong in the permanent save, not every streamed resident.
    if (
      this.npcMemory.has(npc.id) ||
      npc.id.startsWith('body:theo-priest:') ||
      npc.hp < npc.maxHp ||
      npc.hostile !== (npc.role === 'raider') ||
      this.removed.has(npc.id)
    )
      this.npcMemory.set(npc.id, clone(npc));
  }

  private updateNpcs(dt: number) {
    for (const npc of this.npcs) {
      if (npc.hp <= 0) continue;
      npc.cooldown = Math.max(0, npc.cooldown - dt);
      if (npc.role === 'guard' && this.reputation[npc.clan] < -24) npc.hostile = true;
      const range = distance(npc, this.player);
      const target = npc.hostile && range < 8 ? this.player : npc.home;
      const targetDistance = distance(npc, target);
      if (npc.hostile && range < 1.1 && npc.cooldown <= 0) {
        npc.heading = Math.atan2(this.player.y - npc.y, this.player.x - npc.x);
        npc.cooldown = 1.15;
        this.hurt(npc.role === 'raider' ? 9 : 7);
      } else if (targetDistance > (npc.hostile && range < 8 ? 0.85 : 0.5)) {
        const dx = target.x - npc.x,
          dy = target.y - npc.y;
        const speed = Math.min(2.4, npc.speed || 1.5);
        const before = { x: npc.x, y: npc.y };
        this.move(npc, (dx / targetDistance) * speed * dt, (dy / targetDistance) * speed * dt);
        npc.heading = Math.atan2(dy, dx);
        npc.phase += distance(npc, before) * 2.5;
      }
    }
  }

  nearby(): Prop | Npc | null {
    const props = this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .filter((p) => !this.removed.has(p.id) || p.kind === 'door');
    const npcs = this.npcs.filter((n) => n.hp > 0 && !n.hostile);
    return (
      [...props, ...npcs]
        .filter((p) => distance(p, this.player) <= 1.8)
        .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0] ?? null
    );
  }

  interact(id?: string) {
    if (this.phase !== 'playing') return;
    const found = id
      ? [...this.npcs, ...this.world.propsAround(this.player.x, this.player.y, 2.2)].find(
          (p) => p.id === id,
        )
      : this.nearby();
    if (!found || distance(found, this.player) > 1.8) {
      this.event('dialogue', 'Move closer to interact.');
      return;
    }
    if ('role' in found) {
      if (found.hp <= 0 || found.hostile) return;
      this.talk(found);
      return;
    }
    const prop = found;
    if (this.removed.has(prop.id) && prop.kind !== 'door') return;
    if (['cequin', 'heartleaf', 'emberroot', 'pine', 'rock', 'mushroom'].includes(prop.kind)) {
      this.harvest(prop);
      return;
    }
    if (prop.kind === 'chest' || prop.kind === 'crate') {
      if (this.opened.has(prop.id)) {
        this.event('dialogue', 'Already searched.');
        return;
      }
      if (!this.gain({ wood: 2, rations: 1 })) return;
      this.opened.add(prop.id);
      this.player.coins += 5;
      this.event('harvest', 'Recovered two timber, plant rations, and five coins.');
      return;
    }
    if (prop.kind === 'door') {
      if (this.removed.has(prop.id)) {
        if (
          distance(this.player, prop) < 0.85 ||
          this.npcs.some((n) => n.hp > 0 && distance(n, prop) < 0.7)
        ) {
          this.event('dialogue', 'Step clear of the doorway before closing it.');
          return;
        }
        this.removed.delete(prop.id);
        this.opened.delete(prop.id);
      } else {
        this.removed.add(prop.id);
        this.opened.add(prop.id);
      }
      this.event('dialogue', this.opened.has(prop.id) ? 'Door opened.' : 'Door closed.');
      return;
    }
    if (prop.kind === 'radio') {
      this.dialogue = {
        speaker: 'Cathedral radio',
        role: 'Signal apparatus',
        npcId: prop.id,
        text: this.transferReady
          ? 'A fragile reply threads through the static. The signal describes a mental alignment, not a road through space. There is still a Sallas mystery to investigate.'
          : this.storyStage >= 3
            ? 'The damaged radio needs two timber, two conductive ore, and a signal lens. The Sallas record provides the missing alignment.'
            : 'Static. The engineer can explain the damage, but its alignment is concealed in a Sallas record.',
        choices: this.transferReady
          ? [{ id: 'close', label: 'Keep exploring Stíchos' }]
          : [
              {
                id: 'repair-radio',
                label: 'Repair and align the radio',
                disabled: this.storyStage < 3 || !this.has({ wood: 2, ore: 2, lens: 1 }),
                detail: '2 timber · 2 ore · 1 signal lens',
              },
              { id: 'close', label: 'Step away' },
            ],
      };
    } else if (prop.kind === 'bench' || prop.kind === 'shrine') {
      const candidate = prop.kind === 'shrine' ? this.transferCandidate : null;
      this.dialogue = {
        speaker: prop.kind === 'shrine' ? 'Quiet concentration' : 'A sheltered rest',
        role: 'Rest',
        npcId: prop.id,
        text:
          prop.kind === 'shrine'
            ? candidate
              ? `Beyond the stained glass, ${candidate.name} breathes in another human body. The signal can carry Theo into that person at their present location. This body will remain here when the mind leaves.`
              : 'Prometheus watches in colored glass. Quiet concentration steadies this borrowed body. No eligible living mind is within reach yet.'
            : 'The wind is gentler here. Rest replenishes health, breath, warmth, and stamina.',
        choices: [
          { id: 'rest', label: 'Rest and remember this place' },
          ...(prop.kind === 'shrine' && this.transferReady
            ? [
                {
                  id: 'transfer',
                  label: candidate
                    ? `Enter ${candidate.name}’s body`
                    : 'No living mind within reach',
                  disabled: !candidate,
                  detail: candidate
                    ? `A ${candidate.role} ${distance(candidate, this.player).toFixed(1)} tiles away. Your mind enters their actual body.`
                    : 'Keep exploring for inhabited shrines.',
                },
              ]
            : []),
          { id: 'close', label: 'Continue walking' },
        ],
      };
    } else if (prop.kind === 'workbench') {
      this.dialogue = {
        speaker: 'Botanical workbench',
        role: 'Crafting',
        npcId: prop.id,
        text: 'Prepare the plants directly, or align a conductive lens for the cathedral radio.',
        choices: [
          ...RECIPES.map((r) => ({
            id: `craft:${r.id}`,
            label: r.name,
            disabled: !this.has(r.cost),
            detail: this.costText(r.cost),
          })),
          { id: 'close', label: 'Leave the bench' },
        ],
      };
    } else {
      this.dialogue = {
        speaker: prop.name,
        role: 'Stíchos',
        npcId: prop.id,
        text:
          prop.kind === 'notice'
            ? 'The botanical clinics need supplies. Speak with local botanists for paid work. Brown factories promise abundance; the other families fear what that promise will cost.'
            : prop.kind === 'grave'
              ? 'A human name, worn by cold. The six families do not own every memory.'
              : 'Cold blue country continues beyond the settlement. Roads connect inhabited places; wild plants grow off the paths.',
        choices: [{ id: 'close', label: 'Continue' }],
      };
    }
    this.event('dialogue');
  }

  private harvest(prop: Prop) {
    if (
      (prop.kind === 'pine' || prop.kind === 'rock') &&
      this.player.appearance.weapon !== 'staff'
    ) {
      this.event('dialogue', 'Equip the staff to gather timber or ore.');
      return;
    }
    const item: ItemId =
      prop.kind === 'pine'
        ? 'wood'
        : prop.kind === 'rock'
          ? 'ore'
          : prop.kind === 'mushroom'
            ? 'rations'
            : (prop.kind as ItemId);
    const amount = item === 'cequin' ? 3 : 2;
    if (!this.gain({ [item]: amount })) return;
    this.removed.add(prop.id);
    this.effect('harvest', prop, '#d2efa8');
    this.event('harvest', `Gathered ${amount} ${ITEMS[item].name.toLowerCase()}.`);
  }

  private talk(npc: Npc) {
    const choices = [{ id: 'close', label: 'Leave the conversation' }];
    let text =
      'The roads do not end here. Every settlement carries its own bargains, and the cold treats all six families alike.';
    if (npc.role === 'botanist') {
      text =
        'Cequin opens the breath in this cold. We measure it in Rømer; your body still needs the leaves whatever scale you remember. Our clinics prepare food and medicine directly from plants. Orlando Brown asks us to abandon that knowledge for his factories.';
      choices.unshift({
        id: 'learn-cequin',
        label:
          this.storyStage === 0 ? 'Ask what the clinic needs' : 'Discuss cequin and the clinic',
      });
      const job = this.supplyJobs.get(npc.id);
      choices.unshift({
        id: job?.active ? 'supply:deliver' : 'supply:accept',
        label: job?.active
          ? `Deliver ${job.amount} ${ITEMS[job.item].name.toLowerCase()}`
          : 'Ask for local botanical work',
      });
    } else if (npc.role === 'archivist') {
      text =
        'Priests are called originais, true children of Prometheus. Behind their reverence sits the Cúpula do Destino. The Sallas family keeps records even the other families cannot read.';
      choices.unshift({ id: 'ask-sallas', label: 'Ask about the Sallas transmission records' });
    } else if (npc.role === 'engineer') {
      text =
        'Orlando Brown wants industry to feed the clans. Machines can serve people, but someone always controls the switch. I can repair this radio if you bring an aligned lens and materials; its strange tuning is a Sallas matter.';
      choices.unshift({ id: 'engineer-plan', label: 'Review the radio repair' });
    } else if (npc.role === 'merchant') {
      this.merchant(npc);
      return;
    } else if (npc.role === 'refugee') {
      text =
        'We need three cequin for the clinic’s breath jars. Brown’s buyers want the same leaves for an industrial trial. One bundle cannot serve both today.';
      if (this.storyStage >= 1 && this.storyStage < 2)
        choices.unshift(
          { id: 'aid-clinic', label: 'Give the clinic three cequin' },
          { id: 'aid-brown', label: 'Sell three cequin to Brown’s trial' },
        );
    } else if (npc.role === 'guard')
      text = `I serve ${this.world.clans[npc.clan]?.name ?? 'this family'}. Keep your weapons away from our people. Reputation travels farther than footsteps.`;
    this.dialogue = { speaker: npc.name, role: npc.role, npcId: npc.id, text, choices };
    this.event('dialogue');
  }

  private merchant(npc: Npc) {
    const stock: ItemId[] = ['cequin', 'heartleaf', 'emberroot', 'rations', 'bandage'];
    this.dialogue = {
      speaker: npc.name,
      role: 'merchant',
      npcId: npc.id,
      text: `Trade fairly. You carry ${this.carried}/${CAPACITY} items and ${this.player.coins} coins.`,
      choices: [
        ...stock.map((item) => ({
          id: `buy:${item}`,
          label: `Buy ${ITEMS[item].name} · ${ITEMS[item].price} coins`,
          disabled: this.player.coins < ITEMS[item].price || this.carried >= CAPACITY,
        })),
        ...itemIds
          .filter((item) => (this.inventory[item] ?? 0) > 0)
          .map((item) => ({
            id: `sell:${item}`,
            label: `Sell ${ITEMS[item].name} · ${this.sellPrice(item)} coins`,
          })),
        ...(['sword', 'bow'] as Weapon[])
          .filter((w) => !this.weapons.has(w))
          .map((w) => ({
            id: `weapon:${w}`,
            label: `Buy ${w} · ${w === 'sword' ? 28 : 32} coins`,
            disabled: this.player.coins < (w === 'sword' ? 28 : 32),
          })),
        { id: 'close', label: 'Finish trading' },
      ],
    };
    this.event('dialogue');
  }

  choose(choiceId: string) {
    const dialogue = this.dialogue;
    const choice = dialogue?.choices.find((c) => c.id === choiceId);
    if (!dialogue || !choice || choice.disabled || this.phase !== 'playing') return;
    if (choiceId === 'close') {
      this.dialogue = null;
      return;
    }
    const npc = this.npcs.find(
      (n) => n.id === dialogue.npcId && !n.hostile && n.hp > 0 && distance(n, this.player) <= 1.8,
    );
    const prop = this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .find((p) => p.id === dialogue.npcId && distance(p, this.player) <= 1.8);
    if (!npc && !prop) {
      this.dialogue = null;
      this.event('dialogue', 'Move closer to continue.');
      return;
    }
    if (choiceId.startsWith('buy:') || choiceId.startsWith('sell:')) {
      if (npc?.role !== 'merchant') return;
      const [kind, item] = choiceId.split(':');
      if (!isItem(item)) return;
      if (kind === 'buy') {
        if (this.player.coins < ITEMS[item].price || !this.gain({ [item]: 1 })) return;
        this.player.coins -= ITEMS[item].price;
      } else {
        if (!this.spend({ [item]: 1 })) return;
        this.player.coins += this.sellPrice(item);
      }
      this.event(
        'trade',
        `${kind === 'buy' ? 'Bought' : 'Sold'} ${ITEMS[item].name.toLowerCase()}.`,
      );
      this.merchant(npc);
      return;
    }
    if (choiceId.startsWith('weapon:')) {
      if (npc?.role !== 'merchant') return;
      const weapon = choiceId.slice(7) as Weapon;
      const price = weapon === 'sword' ? 28 : 32;
      if (
        !['sword', 'bow'].includes(weapon) ||
        this.weapons.has(weapon) ||
        this.player.coins < price
      )
        return;
      this.player.coins -= price;
      this.weapons.add(weapon);
      this.event('trade', `Acquired a ${weapon}.`);
      this.merchant(npc);
      return;
    }
    if (choiceId.startsWith('craft:')) {
      this.craft(choiceId.slice(6));
      if (prop) this.interact(prop.id);
      return;
    }
    if (choiceId === 'learn-cequin' && npc?.role === 'botanist') {
      this.complete('first-breath');
      this.storyStage = Math.max(1, this.storyStage);
      this.addQuest({
        id: 'cequin-choice',
        title: 'Three leaves, two promises',
        description:
          'A scarce bundle can relieve the clinic today or support Brown’s industrial trial. Decide whom to trust.',
        stage: 0,
        complete: false,
        objective: 'Give three cequin to the clinic or to Brown’s trial.',
        target: { x: npc.x, y: npc.y },
      });
      this.dialogue = {
        speaker: npc.name,
        role: 'botanist',
        npcId: npc.id,
        text:
          this.storyStage >= 2
            ? 'Your first decision is remembered. Other clinics still need plants; ask me for local supply work whenever you return.'
            : 'Three cequin will give the clinic’s patients another day of breath. Brown’s buyers offer twelve coins for an industrial trial instead. A priest’s quiet choice is still a political act.',
        choices:
          this.storyStage >= 2
            ? [{ id: 'close', label: 'Continue' }]
            : [
                {
                  id: 'aid-clinic',
                  label: 'Give three cequin to the clinic',
                  disabled: !this.has({ cequin: 3 }),
                  detail: 'Community trust rises; Brown loses influence.',
                },
                {
                  id: 'aid-brown',
                  label: 'Sell three cequin to Brown’s trial',
                  disabled: !this.has({ cequin: 3 }),
                  detail: 'Gain 12 coins and Brown’s trust; the clinic must wait.',
                },
                { id: 'close', label: 'Gather more cequin first' },
              ],
      };
      return;
    }
    if (
      (choiceId === 'aid-clinic' || choiceId === 'aid-brown') &&
      npc &&
      ['botanist', 'refugee'].includes(npc.role)
    ) {
      if (this.storyStage !== 1 || !this.spend({ cequin: 3 })) return;
      const brown = this.clanId('Brown', 0);
      const botanical = npc.clan === brown ? this.clanId('Veyr', 2) : npc.clan;
      if (choiceId === 'aid-clinic') {
        this.changeReputation(botanical, 10);
        this.changeReputation(brown, -3);
        this.entry(
          'A bundle for the clinic',
          'Three cequin went to people struggling to breathe. Brown’s industrial trial will have to wait.',
        );
      } else {
        this.player.coins += 12;
        this.changeReputation(brown, 10);
        this.changeReputation(botanical, -5);
        this.entry(
          'A bundle for industry',
          'Brown’s trial received the cequin. Twelve coins changed hands; the clinic’s need remains.',
        );
      }
      this.storyStage = 2;
      this.complete('cequin-choice');
      this.addQuest({
        id: 'sallas-record',
        title: 'What Sallas remembers',
        description: 'The archivist knows a hidden record about mental transmission.',
        stage: 0,
        complete: false,
        objective: 'Ask the archivist about Sallas.',
        target: this.originTarget('origin-archivist'),
      });
      this.dialogue = null;
      return;
    }
    if (choiceId === 'ask-sallas' && npc?.role === 'archivist') {
      if (this.storyStage < 2) {
        this.reply(
          'First understand the settlement’s need for breath. Speak to the botanist; words about destiny are cheap while the clinic goes without.',
        );
        return;
      }
      if (this.storyStage === 2) {
        this.storyStage = 3;
        this.complete('sallas-record');
        this.changeReputation(this.clanId('Sallas', 1), 6);
        this.entry(
          'The Sallas alignment',
          'A concealed record describes phase-locked memory, not a physical passage. Its alignment may let the cathedral radio hear a mind signal. This is one clue, not the resolution of the Sallas secret.',
        );
        this.addQuest({
          id: 'repair-radio',
          title: 'A voice beneath the static',
          description:
            'Use the Sallas alignment to repair the cathedral radio. The signal may reveal a way to steady mental transmission.',
          stage: 0,
          complete: false,
          objective: 'Repair the radio: 2 timber, 2 ore, and 1 crafted signal lens.',
          target: this.originTarget('origin-radio', true),
        });
      }
      this.reply(
        'The Cúpula do Destino conceals a record of phase-locked memory. I copied its alignment. Bring it to the engineer, craft a signal lens at a workbench, and repair the cathedral radio. There is no gate to walk through.',
      );
      return;
    }
    if (choiceId === 'engineer-plan' && npc?.role === 'engineer') {
      this.reply(
        this.storyStage < 3
          ? 'Gather timber with your staff and conductive ore from exposed rock. An aligned lens needs one timber and two ore at a workbench. Before we can tune it, ask the archivist for the Sallas alignment.'
          : 'Craft one signal lens at a workbench using one timber and two ore. Bring that lens, two more timber, and two more ore to the radio itself. I have marked it in your journal.',
      );
      return;
    }
    if (choiceId === 'repair-radio' && prop?.kind === 'radio') {
      if (this.storyStage !== 3 || !this.spend({ wood: 2, ore: 2, lens: 1 })) return;
      this.opened.add(prop.id);
      this.storyStage = 4;
      this.complete('repair-radio');
      this.effect('mind', prop, '#9ae4ff', 2.4);
      this.entry(
        'The reply',
        'A remembered voice surfaced through the radio static. The signal can steady a voluntary mind transfer at a quiet shrine. Theo remains on Stíchos; the families, the threatened botanical society, and the Sallas secret are still here.',
      );
      this.addQuest({
        id: 'beyond-the-signal',
        title: 'The country continues',
        description:
          'The reply is a beginning. Travel between settlements, support local clinics, and decide how the six families will remember you.',
        stage: 0,
        complete: false,
        objective: 'Explore Stíchos. A quiet shrine now permits voluntary mind travel.',
      });
      this.reply(
        'A voice returns in fragments: memory, breath, a coordinate inside the mind. The link holds. At a quiet shrine you can attempt a voluntary transfer. Outside, the same cold country stretches on.',
      );
      return;
    }
    if (choiceId === 'supply:accept' && npc?.role === 'botanist') {
      this.acceptSupply(npc);
      return;
    }
    if (choiceId === 'supply:deliver' && npc?.role === 'botanist') {
      this.deliverSupply(npc);
      return;
    }
    if (choiceId === 'rest' && prop && ['bench', 'shrine'].includes(prop.kind)) {
      this.dialogue = null;
      this.rest();
      return;
    }
    if (choiceId === 'transfer' && prop?.kind === 'shrine' && this.transferReady) {
      this.dialogue = null;
      this.reincarnate();
    }
  }

  private acceptSupply(npc: Npc) {
    if (this.supplyJobs.get(npc.id)?.active) return;
    const number = (this.supplyJobs.get(npc.id)?.number ?? 0) + 1;
    const preferred = (['cequin', 'heartleaf', 'emberroot'] as const)[
      ((npc.seed >>> 0) + number) % 3
    ];
    const plants = this.world
      .propsAround(npc.x, npc.y, 24)
      .filter(
        (p) => ['cequin', 'heartleaf', 'emberroot'].includes(p.kind) && !this.removed.has(p.id),
      );
    const target =
      plants
        .filter((p) => p.kind === preferred)
        .sort((a, b) => distance(a, npc) - distance(b, npc))[0] ??
      plants.sort((a, b) => distance(a, npc) - distance(b, npc))[0];
    if (!target) {
      this.reply(
        'These nearby plots have been gathered. Other settlements have their own clinics and supply work.',
      );
      return;
    }
    const item = target.kind as SupplyJob['item'];
    const job: SupplyJob = {
      npcId: npc.id,
      item,
      amount: 3,
      number,
      active: true,
      target: { x: target.x, y: target.y },
    };
    this.supplyJobs.set(npc.id, job);
    this.addQuest({
      id: `supply:${npc.id}:${number}`,
      title: `${ITEMS[item].name} for ${npc.name}`,
      description:
        'Gather or trade for the plants, then return to this botanist. The map marks a real nearby plot.',
      stage: 0,
      complete: false,
      objective: `Bring 3 ${ITEMS[item].name.toLowerCase()} to ${npc.name}. Reward: 14 coins and local trust.`,
      target: { ...job.target },
    });
    this.reply(
      `Bring three ${ITEMS[item].name.toLowerCase()}. I marked a nearby growing plot. Deliver the leaves here and the clinic will pay fourteen coins.`,
    );
  }

  private deliverSupply(npc: Npc) {
    const job = this.supplyJobs.get(npc.id);
    if (!job?.active) return;
    if (!this.spend({ [job.item]: job.amount })) {
      this.reply(
        `We still need ${job.amount} ${ITEMS[job.item].name.toLowerCase()}. The plants are marked in your journal.`,
      );
      return;
    }
    job.active = false;
    this.player.coins += 14;
    this.changeReputation(npc.clan, 5);
    this.awardXp(12);
    this.complete(`supply:${npc.id}:${job.number}`);
    this.reply(
      'The clinic can prepare these immediately. Fourteen coins, with our thanks. There will be more work when you are ready.',
    );
  }

  attack(target?: Point) {
    const p = this.player;
    if (this.phase !== 'playing' || this.dialogue || p.attackCooldown > 0 || p.stamina < 8) return;
    if (target && finite(target.x) && finite(target.y) && distance(target, p) > 0.01)
      p.heading = Math.atan2(target.y - p.y, target.x - p.x);
    const weapon = p.appearance.weapon === 'none' ? 'staff' : p.appearance.weapon;
    const profile = this.weaponProfile(weapon);
    p.stamina -= 8;
    p.attackCooldown = profile.cooldown;
    this.event('attack');
    if (weapon === 'bow') {
      const effect = this.effect('arrow', p, profile.color, profile.range / 9, p.heading);
      this.arrows.push({
        effect,
        vx: Math.cos(p.heading) * 9,
        vy: Math.sin(p.heading) * 9,
        damage: profile.damage,
        enchantment: profile.effect,
      });
      return;
    }
    this.effect('slash', p, profile.color, 0.22, p.heading);
    const range = profile.range;
    const candidates = this.npcs.filter(
      (n) => n.hp > 0 && distance(n, p) <= range && this.inCone(n, p.heading),
    );
    candidates.sort((a, b) => distance(a, p) - distance(b, p));
    if (candidates[0]) this.damageNpc(candidates[0], profile.damage, profile.effect);
  }

  ward() {
    const p = this.player;
    if (this.phase !== 'playing' || this.dialogue || p.wardCooldown > 0 || p.stamina < 30) return;
    p.stamina -= 30;
    p.wardCooldown = 8;
    this.effect('ward', p, '#9abde9', 0.75);
    this.event('ward', 'The ward steadies your breath and repels attackers.');
    p.breath = clamp(p.breath + 5);
    for (const npc of this.npcs.filter((n) => n.hostile && n.hp > 0 && distance(n, p) < 2.7)) {
      this.damageNpc(npc, 14 + p.level);
      const range = Math.max(0.01, distance(npc, p));
      this.move(npc, ((npc.x - p.x) / range) * 0.7, ((npc.y - p.y) / range) * 0.7);
      npc.cooldown = Math.max(npc.cooldown, 1);
    }
  }

  private inCone(npc: Npc, heading: number) {
    const d = Math.max(0.001, distance(npc, this.player));
    return (
      ((npc.x - this.player.x) * Math.cos(heading) + (npc.y - this.player.y) * Math.sin(heading)) /
        d >
      0.2
    );
  }

  private updateArrows(dt: number) {
    for (const arrow of this.arrows) {
      if (arrow.effect.age >= arrow.effect.duration) continue;
      const count = Math.max(1, Math.ceil((9 * dt) / 0.12));
      for (let i = 0; i < count; i++) {
        arrow.effect.x += (arrow.vx * dt) / count;
        arrow.effect.y += (arrow.vy * dt) / count;
        if (this.world.blocked(arrow.effect.x, arrow.effect.y, this.removed)) {
          arrow.effect.age = arrow.effect.duration;
          break;
        }
        const hit = this.npcs.find((n) => n.hp > 0 && distance(n, arrow.effect) < 0.4);
        if (hit) {
          this.damageNpc(hit, arrow.damage, arrow.enchantment);
          arrow.effect.age = arrow.effect.duration;
          break;
        }
      }
    }
    this.arrows = this.arrows.filter((a) => a.effect.age < a.effect.duration);
  }

  private damageNpc(npc: Npc, amount: number, enchantment?: WeaponProfile['effect']) {
    const wasFriendly = !npc.hostile && npc.role !== 'raider';
    npc.hp = Math.max(0, npc.hp - amount);
    npc.hostile = true;
    if (enchantment === 'stagger') npc.cooldown = Math.max(npc.cooldown, 1.35);
    if (enchantment === 'breath') this.player.breath = clamp(this.player.breath + 2);
    if (enchantment === 'warmth') this.player.warmth = clamp(this.player.warmth + 3);
    this.effect('hurt', npc, '#ec8277', 0.45);
    if (wasFriendly) {
      this.changeReputation(npc.clan, -12);
      this.event(
        'quest',
        `Violence against ${npc.name} damages your standing with ${this.world.clans[npc.clan]?.name ?? 'their family'}.`,
      );
      for (const guard of this.npcs)
        if (guard.role === 'guard' && guard.clan === npc.clan && distance(guard, npc) < 8)
          guard.hostile = true;
    }
    if (npc.hp <= 0) {
      this.removed.add(npc.id);
      if (npc.role === 'raider') {
        this.player.coins += 4;
        this.awardXp(16);
      } else {
        this.changeReputation(npc.clan, -18);
        this.entry(
          'A life ended',
          `${npc.name} died by Theo’s hand. The ${this.world.clans[npc.clan]?.name ?? 'local'} family will remember.`,
        );
      }
    }
    this.npcMemory.set(npc.id, clone(npc));
  }

  private hurt(amount: number, feedback = true) {
    if (this.phase !== 'playing') return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    if (feedback) {
      this.effect('hurt', this.player, '#ed8b81', 0.4);
      this.event('hurt');
    }
    if (this.player.hp <= 0) {
      this.phase = 'lost';
      this.dialogue = null;
      this.arrows = [];
      this.entry(
        'The body falls quiet',
        this.transferReady
          ? 'The signal remains. At the last place of rest, another human breath may answer.'
          : 'The clinic can still recover the priest’s body. The radio signal is not yet stable.',
      );
      this.event('hurt', 'The body can no longer continue.');
    }
  }

  use(item: ItemId) {
    if (this.phase !== 'playing' || !isItem(item) || !(this.inventory[item] ?? 0)) return;
    const p = this.player;
    if (!['cequin', 'salve', 'tonic', 'rations', 'bandage'].includes(item)) {
      this.event('dialogue', 'This material must be traded or prepared.');
      return;
    }
    if ((item === 'salve' || item === 'bandage') && p.hp >= p.maxHp) {
      this.event('dialogue', 'You are already at full health.');
      return;
    }
    this.spend({ [item]: 1 });
    if (item === 'cequin') {
      p.cequinTime = Math.min(600, p.cequinTime + 180);
      p.breath = clamp(p.breath + 35);
    }
    if (item === 'salve') p.hp = clamp(p.hp + 35, 0, p.maxHp);
    if (item === 'bandage') p.hp = clamp(p.hp + 20, 0, p.maxHp);
    if (item === 'tonic') {
      p.warmth = clamp(p.warmth + 55);
      p.breath = clamp(p.breath + 25);
    }
    if (item === 'rations') {
      p.stamina = clamp(p.stamina + 35);
      p.warmth = clamp(p.warmth + 20);
      p.hp = clamp(p.hp + 8, 0, p.maxHp);
    }
    this.effect('heal', p, '#addaa5', 0.6);
    this.event('heal', `Used ${ITEMS[item].name.toLowerCase()}.`);
  }

  craft(recipeId: string) {
    if (this.phase !== 'playing') return;
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return;
    if (recipe.id === 'lens' && !this.nearProp('workbench')) {
      this.event('dialogue', 'A signal lens must be aligned at a workbench.');
      return;
    }
    if (!this.has(recipe.cost)) {
      this.event('dialogue', `Missing materials: ${this.costText(recipe.cost)}.`);
      return;
    }
    const used = Object.values(recipe.cost).reduce((sum, n) => sum + (n ?? 0), 0);
    if (this.carried - used + recipe.amount > CAPACITY) {
      this.event('dialogue', 'Your pack is full.');
      return;
    }
    this.spend(recipe.cost);
    this.gain({ [recipe.result]: recipe.amount });
    this.effect('harvest', this.player, '#d5dca4');
    this.event('harvest', `Prepared ${recipe.amount} ${recipe.name.toLowerCase()}.`);
  }

  equip(weapon: Weapon) {
    if (!this.weapons.has(weapon) || this.phase !== 'playing') {
      this.event('dialogue', 'Acquire that weapon from a merchant first.');
      return;
    }
    this.player.appearance.weapon = weapon;
    this.event('dialogue', `Equipped ${weapon}.`);
  }

  rest() {
    if (this.phase !== 'playing') return;
    const place = this.nearProp('bench') ?? this.nearProp('shrine');
    if (!place) {
      this.event('dialogue', 'Find a bench or quiet shrine to rest.');
      return;
    }
    if (this.npcs.some((n) => n.hostile && n.hp > 0 && distance(n, this.player) < 5)) {
      this.event('dialogue', 'It is not safe to rest beside an attacker.');
      return;
    }
    this.restAnchor = { x: this.player.x, y: this.player.y };
    this.player.hp = this.player.maxHp;
    this.player.stamina = 100;
    this.player.warmth = 100;
    this.player.breath = 100;
    this.time += 30;
    this.effect('heal', this.player, '#c4e7df', 1);
    this.event('heal', 'Rested. This place will anchor a return.');
  }

  reincarnate() {
    const lost = this.phase === 'lost';
    if (!lost && (!this.transferReady || !this.nearProp('shrine'))) {
      this.event(
        'dialogue',
        'A stable signal and a quiet shrine are needed for voluntary mind travel.',
      );
      return;
    }
    if (!lost && this.npcs.some((n) => n.hostile && n.hp > 0 && distance(n, this.player) < 5)) {
      this.event('dialogue', 'An attacker breaks your concentration.');
      return;
    }
    const target = this.transferReady ? this.transferCandidate : null;
    if (this.transferReady && !target) {
      this.event('dialogue', 'No living human mind answers near this place of rest.');
      return;
    }
    const previousPosition = { x: this.player.x, y: this.player.y };
    if (target) {
      const previous: Npc = this.occupiedBody
        ? clone(this.occupiedBody)
        : {
            id: `body:theo-priest:${this.seed}`,
            name: 'The priest',
            seed: this.player.appearance.seed,
            role: 'pilgrim',
            clan: this.player.clan,
            appearance: clone(this.player.appearance),
            x: this.player.x,
            y: this.player.y,
            home: previousPosition,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            speed: 0.7,
            heading: this.player.heading,
            phase: 0,
            hostile: false,
            cooldown: 0,
          };
      Object.assign(previous, previousPosition, {
        home: { ...previousPosition },
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        heading: this.player.heading,
        appearance: clone(this.player.appearance),
      });
      this.npcMemory.set(previous.id, previous);
      this.npcRuntime.set(previous.id, clone(previous));
      if (previous.hp <= 0) this.removed.add(previous.id);
      this.occupiedBody = clone(target);
      this.occupiedNpcId = target.id;
      this.lifeCount++;
      const weapon = this.player.appearance.weapon;
      this.player.x = target.x;
      this.player.y = target.y;
      this.player.bodyName = target.name;
      this.player.clan = target.clan;
      this.player.appearance = clone(target.appearance);
      // Equipment belongs to the retained inventory; the host supplies the body and clothing.
      this.player.appearance.weapon = weapon;
      this.player.maxHp = target.maxHp;
      this.player.hp = target.hp;
      this.player.heading = target.heading;
      this.player.phase = 0;
      this.entry(
        'Another person’s breath',
        `Theo’s mind entered ${target.name}, a living ${target.role}, at (${target.x.toFixed(1)}, ${target.y.toFixed(1)}). ${previous.name}’s body remained at (${previousPosition.x.toFixed(1)}, ${previousPosition.y.toFixed(1)}). The world and unfinished promises remain.`,
      );
    } else {
      // Before the recovered signal, the clinic treats the original priest; this is not possession.
      this.player.x = this.restAnchor.x;
      this.player.y = this.restAnchor.y;
      this.player.hp = this.player.maxHp;
    }
    if (lost) this.player.coins = Math.floor(this.player.coins * 0.8);
    this.player.breath = 100;
    this.player.warmth = 100;
    this.player.stamina = 100;
    this.player.attackCooldown = 0;
    this.player.wardCooldown = 0;
    this.phase = 'playing';
    this.dialogue = null;
    this.arrows = [];
    this.effects = [];
    this.refreshNpcs();
    this.visit();
    this.effect('mind', previousPosition, '#c1d9ff', 2);
    this.effect('mind', this.player, '#c1d9ff', 2);
    this.event(
      'transfer',
      target
        ? `Theo now breathes through ${target.name}’s body.`
        : 'The clinic restores the priest’s breath.',
    );
  }

  private has(cost: Partial<Record<ItemId, number>>) {
    return Object.entries(cost).every(
      ([item, amount]) => (this.inventory[item as ItemId] ?? 0) >= (amount ?? 0),
    );
  }
  private spend(cost: Partial<Record<ItemId, number>>) {
    if (!this.has(cost)) return false;
    for (const [item, amount] of Object.entries(cost)) {
      const key = item as ItemId;
      this.inventory[key] = (this.inventory[key] ?? 0) - (amount ?? 0);
      if (!this.inventory[key]) delete this.inventory[key];
    }
    return true;
  }
  private gain(items: Partial<Record<ItemId, number>>) {
    const count = Object.values(items).reduce((sum, n) => sum + (n ?? 0), 0);
    if (this.carried + count > CAPACITY) {
      this.event('dialogue', 'Your pack is full. Use supplies, craft, or trade first.');
      return false;
    }
    for (const [item, amount] of Object.entries(items))
      this.inventory[item as ItemId] = (this.inventory[item as ItemId] ?? 0) + (amount ?? 0);
    return true;
  }
  private nearProp(kind: Prop['kind']) {
    return this.world
      .propsAround(this.player.x, this.player.y, 2.2)
      .find((p) => p.kind === kind && distance(p, this.player) <= 1.8);
  }
  private sellPrice(item: ItemId) {
    return Math.max(1, Math.floor(ITEMS[item].price * 0.45));
  }
  private costText(cost: Partial<Record<ItemId, number>>) {
    return Object.entries(cost)
      .map(([id, n]) => `${n} ${ITEMS[id as ItemId].name.toLowerCase()}`)
      .join(' · ');
  }
  private clanId(name: string, fallback: number) {
    return (
      this.world.clans.find((c) => c.name.toLowerCase().includes(name.toLowerCase()))?.id ??
      fallback
    );
  }
  private changeReputation(clan: number, amount: number) {
    if (Number.isInteger(clan) && clan >= 0 && clan < 6)
      this.reputation[clan] = clamp(this.reputation[clan] + amount, -100, 100);
  }
  private originTarget(id: string, prop = false): Point {
    const result = (prop ? this.world.propsAround(0, 0, 24) : this.world.npcsAround(0, 0, 24)).find(
      (n) => n.id === id,
    );
    return result ? { x: result.x, y: result.y } : { ...this.world.spawn };
  }
  private reply(text: string) {
    if (this.dialogue)
      this.dialogue = { ...this.dialogue, text, choices: [{ id: 'close', label: 'Continue' }] };
  }
  private addQuest(quest: Quest) {
    if (!this.quests.some((q) => q.id === quest.id)) {
      this.quests.push(quest);
      this.event('quest', quest.title);
    }
  }
  private complete(id: string) {
    const q = this.quests.find((q) => q.id === id);
    if (q && !q.complete) {
      q.complete = true;
      q.stage++;
      this.awardXp(15);
      this.event('quest', `${q.title} · complete`);
    }
  }
  private awardXp(amount: number) {
    this.player.xp += amount;
    while (this.player.xp >= this.player.level * 40 && this.player.level < 50) {
      this.player.xp -= this.player.level * 40;
      this.player.level++;
      this.player.maxHp += 6;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 6);
      this.event('level', `Experience ${this.player.level}`);
    }
  }
  private entry(title: string, text: string) {
    this.journal.push({ title, text, time: this.time });
    if (this.journal.length > 400) this.journal.splice(0, this.journal.length - 400);
  }
  private visit() {
    this.visited.add(
      `${Math.floor(this.player.x / CHUNK_SIZE)},${Math.floor(this.player.y / CHUNK_SIZE)}`,
    );
  }
  private effect(
    kind: Effect['kind'],
    point: Point,
    color: string,
    duration = 0.6,
    heading?: number,
  ): Effect {
    const effect: Effect = {
      id: this.nextEffect++,
      kind,
      x: point.x,
      y: point.y,
      age: 0,
      duration,
      color,
      heading,
    };
    this.effects.push(effect);
    return effect;
  }
  private event(kind: GameEvent['kind'], text?: string) {
    this.events.push({ kind, text });
    if (this.events.length > 100) this.events.shift();
  }
  drainEvents() {
    return this.events.splice(0);
  }

  save() {
    for (const npc of this.npcs) this.rememberNpc(npc);
    return clone({
      version: 1,
      seed: this.seed,
      player: this.player,
      inventory: this.inventory,
      removed: [...this.removed],
      opened: [...this.opened],
      weapons: [...this.weapons],
      npcs: [...this.npcMemory.values()],
      quests: this.quests,
      journal: this.journal,
      time: this.time,
      distanceTraveled: this.distanceTraveled,
      visited: [...this.visited],
      reputation: this.reputation,
      storyStage: this.storyStage,
      phase: this.phase,
      restAnchor: this.restAnchor,
      lifeCount: this.lifeCount,
      occupiedNpcId: this.occupiedNpcId,
      occupiedBody: this.occupiedBody,
      supplyJobs: [...this.supplyJobs.values()],
    });
  }

  static restore(value: unknown): Stichos {
    const data = validateSave(value);
    const game = new Stichos(data.seed);
    game.player = clone(data.player);
    game.inventory = { ...data.inventory };
    for (const id of data.removed) game.removed.add(id);
    for (const id of data.opened) game.opened.add(id);
    game.weapons.clear();
    for (const weapon of data.weapons) game.weapons.add(weapon);
    game.npcMemory = new Map(data.npcs.map((n) => [n.id, clone(n)]));
    game.npcs = [];
    game.quests = clone(data.quests);
    game.journal = clone(data.journal);
    game.time = data.time;
    game.distanceTraveled = data.distanceTraveled;
    game.visited.clear();
    for (const id of data.visited) game.visited.add(id);
    game.reputation = [...data.reputation];
    game.storyStage = data.storyStage;
    game.phase = data.phase;
    game.restAnchor = { ...data.restAnchor };
    game.lifeCount = data.lifeCount;
    game.occupiedNpcId = data.occupiedNpcId ?? null;
    game.occupiedBody = data.occupiedBody ? clone(data.occupiedBody) : null;
    game.supplyJobs = new Map(data.supplyJobs.map((job) => [job.npcId, clone(job)]));
    if (!game.clear(game.player) || !game.clear(game.restAnchor))
      throw new Error('Saved position is inside blocked terrain.');
    game.refreshNpcs();
    game.events = [];
    game.dialogue = null;
    return game;
  }
}

type SaveData = ReturnType<Stichos['save']>;
function validateSave(value: unknown): SaveData {
  const fail = () => {
    throw new Error('Invalid or incompatible Stíchos save.');
  };
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const number = (v: unknown, min: number, max: number, integer = false) =>
    finite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
  const text = (v: unknown, limit = 500): v is string => typeof v === 'string' && v.length <= limit;
  const point = (v: unknown) =>
    object(v) &&
    number(v.x, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) &&
    number(v.y, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const strings = (v: unknown) =>
    Array.isArray(v) && v.every((x) => text(x, 160)) && new Set(v).size === v.length;
  const look = (v: unknown) =>
    object(v) &&
    number(v.seed, -0xffffffff, 0xffffffff, true) &&
    ['skin', 'hair', 'coat', 'trim', 'trousers'].every(
      (k) => text(v[k], 40) && /^#[0-9a-f]{3,8}$/i.test(v[k] as string),
    ) &&
    ['height', 'build'].every((k) => number(v[k], 0.1, 10)) &&
    ['hairStyle', 'hat'].every((k) => number(v[k], 0, 100, true)) &&
    typeof v.cloak === 'boolean' &&
    ['staff', 'sword', 'bow', 'none'].includes(v.weapon as string);
  if (!object(value) || value.version !== 1 || !number(value.seed, 0, 0xffffffff, true))
    return fail();
  const p = value.player;
  if (
    !object(p) ||
    !point(p) ||
    !text(p.name, 80) ||
    !text(p.bodyName, 100) ||
    !look(p.appearance) ||
    !number(p.clan, 0, 5, true) ||
    !number(p.maxHp, 1, 1000) ||
    !number(p.hp, 0, p.maxHp as number) ||
    !['breath', 'warmth', 'stamina'].every((k) => number(p[k], 0, 100)) ||
    !number(p.speed, 0.5, 8) ||
    !number(p.level, 1, 50, true) ||
    !number(p.xp, 0, Number.MAX_SAFE_INTEGER, true) ||
    !number(p.coins, 0, Number.MAX_SAFE_INTEGER, true) ||
    !number(p.heading, -1e6, 1e6) ||
    !number(p.phase, 0, Number.MAX_SAFE_INTEGER) ||
    !number(p.attackCooldown, 0, 10) ||
    !number(p.wardCooldown, 0, 30) ||
    !number(p.cequinTime, 0, 600)
  )
    return fail();
  if (
    !object(value.inventory) ||
    !Object.entries(value.inventory).every(([k, v]) => isItem(k) && number(v, 0, CAPACITY, true)) ||
    Object.values(value.inventory).reduce<number>((sum, n) => sum + (n as number), 0) > CAPACITY
  )
    return fail();
  if (
    !strings(value.removed) ||
    !strings(value.opened) ||
    !strings(value.visited) ||
    !Array.isArray(value.weapons) ||
    !value.weapons.length ||
    !value.weapons.every((w) => ['staff', 'sword', 'bow'].includes(w)) ||
    !value.weapons.includes((p.appearance as Record<string, unknown>).weapon)
  )
    return fail();
  if (
    !number(value.time, 0, Number.MAX_SAFE_INTEGER) ||
    !number(value.distanceTraveled, 0, Number.MAX_SAFE_INTEGER) ||
    !number(value.storyStage, 0, 4, true) ||
    !number(value.lifeCount, 0, Number.MAX_SAFE_INTEGER, true) ||
    !point(value.restAnchor) ||
    !['playing', 'lost'].includes(value.phase as string) ||
    (value.phase === 'lost') !== (p.hp === 0)
  )
    return fail();
  if (
    !Array.isArray(value.reputation) ||
    value.reputation.length !== 6 ||
    !value.reputation.every((r) => number(r, -100, 100))
  )
    return fail();
  const npc = (n: unknown) =>
    object(n) &&
    point(n) &&
    text(n.id, 160) &&
    text(n.name, 100) &&
    number(n.seed, -0xffffffff, 0xffffffff, true) &&
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
    number(n.clan, 0, 5, true) &&
    look(n.appearance) &&
    number(n.maxHp, 1, 1000) &&
    number(n.hp, 0, n.maxHp as number) &&
    point(n.home) &&
    number(n.speed, 0, 10) &&
    number(n.heading, -1e6, 1e6) &&
    number(n.phase, 0, Number.MAX_SAFE_INTEGER) &&
    typeof n.hostile === 'boolean' &&
    number(n.cooldown, 0, 30);
  if (
    !Array.isArray(value.npcs) ||
    !value.npcs.every(npc) ||
    new Set(value.npcs.map((n) => n.id)).size !== value.npcs.length
  )
    return fail();
  if (value.occupiedNpcId !== undefined && value.occupiedNpcId !== null) {
    if (
      !text(value.occupiedNpcId, 160) ||
      !npc(value.occupiedBody) ||
      (value.occupiedBody as Npc).id !== value.occupiedNpcId ||
      !['pilgrim', 'refugee', 'guard'].includes((value.occupiedBody as Npc).role) ||
      (value.removed as string[]).includes(value.occupiedNpcId) ||
      (value.storyStage as number) < 4
    )
      return fail();
  } else if (value.occupiedBody !== undefined && value.occupiedBody !== null) return fail();
  if (
    !Array.isArray(value.quests) ||
    !value.quests.every(
      (q) =>
        object(q) &&
        text(q.id, 200) &&
        text(q.title, 200) &&
        text(q.description, 2000) &&
        text(q.objective, 1000) &&
        number(q.stage, 0, 100, true) &&
        typeof q.complete === 'boolean' &&
        (q.target === undefined || point(q.target)),
    ) ||
    new Set(value.quests.map((q) => q.id)).size !== value.quests.length
  )
    return fail();
  if (
    !Array.isArray(value.journal) ||
    value.journal.length > 400 ||
    !value.journal.every(
      (j) =>
        object(j) &&
        text(j.title, 200) &&
        text(j.text, 4000) &&
        number(j.time, 0, value.time as number),
    )
  )
    return fail();
  if (
    !Array.isArray(value.supplyJobs) ||
    !value.supplyJobs.every(
      (j) =>
        object(j) &&
        text(j.npcId, 160) &&
        ['cequin', 'heartleaf', 'emberroot'].includes(j.item as string) &&
        number(j.amount, 1, 20, true) &&
        number(j.number, 1, Number.MAX_SAFE_INTEGER, true) &&
        typeof j.active === 'boolean' &&
        point(j.target),
    )
  )
    return fail();
  return value as unknown as SaveData;
}
