import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CoopRooms } from '../src/stichos/room-authority.mjs';
import { appearance } from '../src/stichos/world.ts';
import { Stichos } from '../src/stichos/session.ts';
import {
  SharedCombat,
  validSharedCombatFrame,
  type SharedEnemy,
  type SharedCombatFrame,
  type SharedCombatPeer,
} from '../src/stichos/shared-combat.ts';

class ReviewSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages: any[] = [];
  send(raw: string) {
    this.messages.push(JSON.parse(raw));
  }
  close() {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  ping() {
    this.emit('pong');
  }
  last(type: string) {
    return this.messages.filter((m) => m.type === type).at(-1);
  }
}

test('independent review: techniques negotiate per member and preserve legacy attacks, replay receipts and disconnect cleanup', (t) => {
  let now = 10000;
  const hub = new CoopRooms({ now: () => now });
  t.after(() => {
    for (const connection of hub.connections) connection.socket.close();
  });
  const connect = (extra: Record<string, unknown> = {}) => {
    const socket = new ReviewSocket();
    const connection = hub.attach(socket);
    const look = appearance(42, 'pilgrim', 1);
    look.weapon = 'sword';
    hub.handle(connection, {
      type: 'join',
      protocol: 3,
      seed: 3886,
      generation: 3,
      name: 'Review traveler',
      appearance: look,
      position: { x: 0, y: 30 },
      combatActive: true,
      bodyId: 'body:review',
      ...extra,
    });
    assert.ok(socket.last('welcome'));
    return { socket, connection, send: (message: any) => hub.handle(connection, message) };
  };
  const legacy = connect();
  const room = legacy.socket.last('welcome').room;
  assert.equal(legacy.socket.last('welcome').actionExpansion, undefined);
  legacy.send({
    type: 'combat',
    requestId: 'r1',
    kind: 'technique',
    technique: 'crescent',
    heading: 0,
  });
  assert.equal(legacy.socket.last('combat_result').ok, false);
  legacy.send({ type: 'combat', requestId: 'r2', kind: 'attack', heading: 0 });
  assert.equal(legacy.socket.last('combat_result').ok, true);
  const modern = connect({ room, actionExpansion: 1, bodyId: 'body:modern' });
  assert.equal(modern.socket.last('welcome').actionExpansion, 1);
  const intent = {
    type: 'combat',
    requestId: 'r1',
    kind: 'technique',
    technique: 'crescent',
    heading: 0,
  };
  modern.send(intent);
  const first = modern.socket.last('combat_result');
  assert.equal(first.ok, true);
  assert.equal(validSharedCombatFrame(first.frame), true);
  const cast = first.frame.snapshot.casts[0];
  modern.send(intent);
  assert.equal(modern.socket.last('combat_result').frame.snapshot.casts[0].id, cast.id);
  modern.send({ ...intent, technique: 'faultline' });
  assert.match(modern.socket.last('combat_result').reason, /different request/);
  modern.send({ ...intent, requestId: 'r2' });
  assert.equal(modern.socket.last('combat_result').ok, false);
  modern.socket.close();
  now += 50;
  hub.tick(0.05);
  assert.equal(modern.connection.room.combat.snapshot().casts?.length ?? 0, 0);
  assert.equal(validSharedCombatFrame(legacy.socket.last('combat_frame').frame), true);
});

function sharedSession() {
  const game = new Stichos(3886);
  Object.assign(game.player, { x: 0, y: 30, heading: 0 });
  game.setSharedWorld(true);
  game.setSharedCombat(true, 'review:room');
  game.applySharedCombat(
    {
      snapshot: { seq: 1, enemies: [], projectiles: [], dead: [], peaceful: [] },
      hits: [],
      deaths: [],
    },
    'review-player',
  );
  return game;
}

test('independent review: accepted shared attacks still pay after movement spends stamina during a delayed reply', () => {
  const game = sharedSession();
  game.player.stamina = 8;
  const preview = game.sharedCombatPreview('attack');
  assert.equal(preview.ok, true);
  // The authority accepted this request; continued running consumes energy before its reply.
  game.player.stamina = 4;
  assert.equal(game.commitSharedCombatAction('attack', preview.heading, preview.bodyId).ok, true);
  assert.equal(game.player.stamina, 0);
  assert.ok(game.player.attackCooldown > 0);
  assert.equal(
    game.commitSharedCombatAction('attack', preview.heading, preview.bodyId).ok,
    false,
    'The receipt must not pay or animate twice.',
  );
  const restored = Stichos.restore(game.save());
  restored.update(0.1, { x: 0, y: 0, run: false });
  assert.equal(restored.player.stamina, 0, 'Reload cannot discard unpaid action energy.');
  restored.update(0.1, { x: 0, y: 0, run: false });
  assert.equal(restored.player.stamina, 0);
  restored.update(0.1, { x: 0, y: 0, run: false });
  assert.ok(
    Math.abs(restored.player.stamina - 1.4) < 1e-9,
    'Regeneration repays all four missing energy before becoming usable.',
  );
});

test('independent review: changing combat authority cancels paid preparation instead of releasing it as a solo attack', () => {
  const game = sharedSession();
  const technique = game.techniques[0];
  assert.ok(technique);
  assert.equal(game.commitTechnique(technique.id, 0, game.bodyId).ok, true);
  assert.ok(game.preparingTechnique);
  game.setSharedCombat(false);
  assert.equal(game.preparingTechnique, undefined);
  assert.ok(game.techniques[0].remaining > 0, 'Authority transitions retain paid recovery.');
  assert.equal(
    game.actionCues.some((cue) => cue.kind === 'charge'),
    false,
  );
});

test('independent review: changed room identity clears remote preparation immediately', () => {
  const game = sharedSession();
  game.applySharedCombat(
    {
      snapshot: {
        seq: 2,
        enemies: [],
        projectiles: [],
        dead: [],
        peaceful: [],
        casts: [
          {
            id: 1,
            actorId: 'remote',
            bodyId: 'remote-body',
            technique: 'pulse',
            x: 0,
            y: 30,
            heading: 0,
            remaining: 0.2,
            duration: 0.2,
          },
        ],
      },
      hits: [],
      deaths: [],
    },
    'review-player',
  );
  assert.ok(game.actionCues.some((cue) => cue.kind === 'charge'));
  game.setSharedCombat(true, 'review:other-room');
  assert.equal(
    game.actionCues.some((cue) => cue.kind === 'charge'),
    false,
  );
});

test('independent review: quick-step and held movement consume disjoint elapsed time across frame rates', () => {
  for (const dt of [0.01, 0.02, 0.05, 0.1]) {
    const game = new Stichos(3886);
    Object.assign(game.player, { x: 0, y: 30, heading: 0, speed: 3 });
    assert.equal(game.dodge(0), true);
    for (let elapsed = 0; elapsed < 0.2 - 1e-9; elapsed += dt) {
      game.update(dt, { x: 1, y: 0, run: false });
    }
    assert.ok(
      Math.abs(game.player.x - 1.81) < 1e-9,
      `A 1.75-tile step lasting 0.18s leaves exactly 0.02s to walk; dt=${dt}, x=${game.player.x}`,
    );
  }
});

function reviewEnemy(id = 'review-enemy', x = 1, y = 30): SharedEnemy {
  const look = appearance(42, 'raider', 0);
  look.weapon = 'sword';
  return {
    id,
    x,
    y,
    seed: 42,
    name: 'Review foe',
    role: 'raider',
    clan: 0,
    appearance: look,
    hp: 100,
    maxHp: 100,
    home: { x, y },
    speed: 1.5,
    heading: 0,
    phase: 0,
    hostile: true,
    cooldown: 0,
  };
}
function reviewFrame(
  seq: number,
  enemies: SharedEnemy[] = [],
  dead: string[] = [],
): SharedCombatFrame {
  return { snapshot: { seq, enemies, projectiles: [], dead, peaceful: [] }, hits: [], deaths: [] };
}
function reviewAuthority(enemies: SharedEnemy[] = []) {
  const world = {
    generation: 3 as const,
    blocked: () => false,
    propsAround: () => [],
    npcsAround: () => structuredClone(enemies),
  };
  return new SharedCombat(world, new Set(), { now: () => 1000 });
}

test('independent review: authority records real releases and keeps interrupted preparation silent', () => {
  const look = appearance(42, 'pilgrim', 0);
  look.weapon = 'staff';
  const peer: SharedCombatPeer = {
    id: 'review-player',
    bodyId: 'review-body',
    x: 0,
    y: 30,
    heading: 0,
    appearance: look,
    combatActive: true,
  };
  const canceled = reviewAuthority();
  assert.equal(canceled.technique(peer, 0, 'pulse').ok, true);
  const canceledFrame = canceled.tick(0.05, [{ ...peer, x: 1 }]);
  assert.equal(canceledFrame.snapshot.casts?.length ?? 0, 0);
  assert.equal(canceledFrame.snapshot.releases?.length ?? 0, 0);
  const released = reviewAuthority();
  assert.equal(released.technique(peer, 0, 'pulse').ok, true);
  const releasedFrame = released.tick(0.25, [peer]);
  assert.equal(releasedFrame.snapshot.releases?.length, 1);
  assert.equal(releasedFrame.snapshot.releases?.[0].technique, 'pulse');
  assert.equal(validSharedCombatFrame(releasedFrame), true);
  const game = sharedSession();
  const castFrame = reviewFrame(2);
  castFrame.snapshot.casts = [
    {
      id: 4,
      actorId: 'other',
      technique: 'pulse',
      x: 0,
      y: 30,
      heading: 0,
      duration: 0.2,
      remaining: 0.2,
    },
  ];
  game.applySharedCombat(castFrame, 'review-player');
  game.applySharedCombat(reviewFrame(3), 'review-player');
  assert.equal(
    game.actionCues.some((cue) => cue.kind === 'area' || cue.kind === 'melee'),
    false,
  );
  releasedFrame.snapshot.seq = 4;
  game.applySharedCombat(releasedFrame, 'review-player');
  assert.equal(game.actionCues.filter((cue) => cue.kind === 'area').length, 1);
});

test('independent review: shared warning geometry comes from authoritative reach and locked attack angles', () => {
  const game = sharedSession();
  const cone = reviewEnemy('cone'),
    line = reviewEnemy('line', 2),
    volley = reviewEnemy('volley', 3);
  const base = {
    kind: 'slash' as const,
    heading: 0.4,
    remaining: 0.5,
    duration: 1,
    range: 2.8,
    color: '#abcdef',
    targetId: 'review-player',
    damage: 8,
  };
  cone.intent = base;
  line.intent = { ...base, shape: 'line', range: 3.6 };
  volley.intent = { ...base, kind: 'arrow', shape: 'volley', angles: [-0.16, 0.16], range: 7 };
  const frame = reviewFrame(2, [cone, line, volley]);
  assert.equal(validSharedCombatFrame(frame), true);
  game.applySharedCombat(frame, 'review-player');
  const cues = game.actionCues.filter((cue) => cue.kind === 'telegraph');
  assert.equal(cues.find((cue) => cue.actorId === 'cone')?.radius, 2.8);
  assert.equal(cues.find((cue) => cue.actorId === 'cone')?.halfAngle, Math.acos(0.35));
  assert.equal(cues.find((cue) => cue.actorId === 'line')?.halfWidth, 0.62);
  assert.deepEqual(
    cues.filter((cue) => cue.actorId === 'volley').map((cue) => cue.heading),
    [0.4 - 0.16, 0.4 + 0.16],
  );
  assert.ok(
    cues
      .filter((cue) => cue.actorId === 'volley')
      .every((cue) => cue.halfWidth === 0.35 && cue.radius === 7),
  );
});

test('independent review: shared deaths remain visible without reviving simulation actors and stay bounded while paused', () => {
  const game = sharedSession();
  const dead: string[] = [];
  for (let i = 0; i < 80; i++) {
    const npc = reviewEnemy(`review-dead-${i}`);
    game.applySharedCombat(reviewFrame(2 + i * 2, [npc], [...dead]), 'review-player');
    dead.push(npc.id);
    game.applySharedCombat(reviewFrame(3 + i * 2, [], [...dead]), 'review-player');
  }
  assert.equal(
    game.npcs.some((npc) => dead.includes(npc.id)),
    false,
  );
  assert.equal(game.defeatedVisuals.length, 16);
  assert.ok(game.defeatedVisuals.every((npc) => npc.hp === 0));
  assert.ok(
    game.actionCues.length <= 64,
    'No update ticks ran; enqueue itself must enforce the limit.',
  );
  const before = game.actionCues.map((cue) => cue.id);
  game.applySharedCombat(reviewFrame(200, [], [...dead]), 'review-player');
  assert.deepEqual(
    game.actionCues.map((cue) => cue.id),
    before,
    'Repeated room snapshots cannot replay old deaths.',
  );
  game.update(0.25, { x: 0, y: 0, run: false });
  game.update(0.25, { x: 0, y: 0, run: false });
  game.update(0.1, { x: 0, y: 0, run: false });
  assert.equal(game.defeatedVisuals.length, 0);
});

test('independent review: nearby exact warnings cannot be displaced by a saturated paused decoration queue', () => {
  const game = sharedSession();
  const dead: string[] = [];
  for (let i = 0; i < 65; i++) {
    const npc = reviewEnemy(`review-priority-${i}`);
    game.applySharedCombat(reviewFrame(2 + i * 2, [npc], [...dead]), 'review-player');
    dead.push(npc.id);
    game.applySharedCombat(reviewFrame(3 + i * 2, [], [...dead]), 'review-player');
  }
  const local = reviewEnemy('local-warning');
  local.intent = {
    kind: 'slash',
    heading: 0,
    remaining: 0.5,
    duration: 1,
    range: 3.6,
    color: '#abcdef',
    targetId: 'review-player',
    damage: 8,
    shape: 'line',
  };
  const distant = Array.from({ length: 70 }, (_, i) => {
    const enemy = reviewEnemy(`distant-${i}`, 200 + i);
    enemy.intent = { ...local.intent! };
    return enemy;
  });
  game.applySharedCombat(reviewFrame(200, [...distant, local], [...dead]), 'review-player');
  assert.ok(
    game.actionCues
      .slice(0, 64)
      .some((cue) => cue.kind === 'telegraph' && cue.actorId === local.id),
    'The renderer only consumes the first64 supplied cues; local danger has priority over distant warnings and decoration.',
  );
});

test('independent review: renewal is once per authoritative cast across multiple targets, repeats and reload', () => {
  let game = sharedSession();
  game.player.breath = 50;
  game.player.warmth = 50;
  const first = reviewFrame(2, [reviewEnemy('a'), reviewEnemy('b', 2)]);
  first.hits = ['a', 'b'].map((targetId, i) => ({
    id: 20 + i,
    actorId: 'review-player',
    targetId,
    target: 'npc',
    damage: 7,
    kind: 'ward',
    color: '#aabbcc',
    strikeId: 10,
    actorBodyId: game.bodyId,
    targetBodyId: targetId,
    technique: 'pulse',
    renewal: true,
  }));
  assert.equal(validSharedCombatFrame(first), true);
  game.applySharedCombat(first, 'review-player');
  game.applySharedCombat(first, 'review-player');
  assert.equal(game.player.breath, 54);
  assert.equal(game.player.warmth, 54);
  game = Stichos.restore(game.save());
  game.setSharedCombat(true, 'review:room');
  const late = reviewFrame(3, [reviewEnemy('c')]);
  late.hits = [{ ...first.hits[0], id: 22, targetId: 'c', targetBodyId: 'c' }];
  game.applySharedCombat(late, 'review-player');
  assert.equal(game.player.breath, 54);
  assert.equal(game.player.warmth, 54);
});

test('independent review: precision reads pre-hit stagger, techniques interrupt intents and status remains bounded', () => {
  const look = appearance(42, 'pilgrim', 0);
  look.weapon = 'sword';
  const peer: SharedCombatPeer = {
    id: 'review-player',
    bodyId: 'review-body',
    x: 0,
    y: 30,
    heading: 0,
    appearance: look,
    combatActive: true,
    progression: { level: 1, combatXp: 0, upgrade: 0, attunement: 'precision' },
  };
  const enemy = reviewEnemy();
  enemy.intent = {
    kind: 'slash',
    heading: Math.PI,
    remaining: 0.5,
    duration: 0.5,
    range: 2,
    color: '#abcdef',
    targetId: peer.id,
    damage: 8,
  };
  const normal = reviewAuthority([enemy]);
  const staggered = reviewAuthority([{ ...enemy, stagger: 1 }]);
  assert.equal(normal.technique(peer, 0, 'crescent').ok, true);
  assert.equal(staggered.technique(peer, 0, 'crescent').ok, true);
  const normalFrame = normal.tick(0.15, [peer]);
  const enhancedFrame = staggered.tick(0.15, [peer]);
  assert.equal(validSharedCombatFrame(enhancedFrame), true);
  assert.ok(
    enhancedFrame.hits.find((hit) => hit.target === 'npc')!.damage >
      normalFrame.hits.find((hit) => hit.target === 'npc')!.damage,
  );
  assert.equal(normalFrame.snapshot.enemies[0].intent, undefined);
  assert.ok((normalFrame.snapshot.enemies[0].stagger ?? 0) > 0);
  assert.equal(
    normal.tick(0.25, [peer]).hits.some((hit) => hit.target === 'peer'),
    false,
  );
  const malformed = structuredClone(enhancedFrame);
  malformed.snapshot.enemies[0].stagger = Infinity;
  assert.equal(validSharedCombatFrame(malformed), false);
});

test('independent review: shared missed encounter attacks release once with sound, interruption stays quiet and checkpoints omit presentation', () => {
  const enemy = reviewEnemy('expedition:3886:0:0:relay:warden:0');
  const look = appearance(42, 'pilgrim', 0);
  look.weapon = 'staff';
  const peer: SharedCombatPeer = {
    id: 'review-player',
    bodyId: 'review-body',
    x: 0,
    y: 30,
    heading: 0,
    appearance: look,
    combatActive: true,
  };
  const authority = reviewAuthority([enemy]);
  const windup = authority.tick(0.01, [peer]);
  assert.equal(windup.snapshot.enemies[0].intent?.shape, 'line');
  let release = windup;
  for (let i = 0; i < 5; i++) release = authority.tick(0.25, [{ ...peer, y: 33 }]);
  assert.equal(
    release.hits.some((hit) => hit.target === 'peer'),
    false,
    'The player stepped sideways out of the locked beam.',
  );
  assert.equal(
    release.snapshot.encounterReleases?.length,
    1,
    'A missed attack still visibly and audibly releases.',
  );
  assert.equal(release.snapshot.encounterReleases?.[0].shape, 'line');
  assert.equal(validSharedCombatFrame(release), true);
  const checkpoint = authority.checkpoint();
  assert.equal(checkpoint.snapshot.encounterReleases, undefined);
  assert.equal(checkpoint.snapshot.releases, undefined);
  assert.equal(checkpoint.snapshot.casts, undefined);
  const restored = reviewAuthority([enemy]);
  restored.restore(checkpoint);
  assert.equal(restored.snapshot().encounterReleases, undefined);

  const game = sharedSession();
  game.events.length = 0;
  game.applySharedCombat(release, peer.id);
  assert.equal(
    game.actionCues.filter((cue) => cue.id.startsWith('shared-enemy-release:')).length,
    1,
  );
  assert.equal(
    game.events.filter((event) => event.kind === 'foley' && event.foley?.kind === 'tool-impact')
      .length,
    1,
  );
  const repeated = structuredClone(release);
  repeated.snapshot.seq++;
  game.applySharedCombat(repeated, peer.id);
  assert.equal(
    game.events.filter((event) => event.kind === 'foley' && event.foley?.kind === 'tool-impact')
      .length,
    1,
  );
  const saved = JSON.stringify(game.save());
  assert.equal(saved.includes('shared-enemy-release:'), false);
  assert.equal(saved.includes('encounterRelease'), false);
  const malformed = structuredClone(release);
  malformed.snapshot.encounterReleases![0].remaining = 10;
  assert.equal(validSharedCombatFrame(malformed), false);
  const oversized = structuredClone(release);
  oversized.snapshot.encounterReleases = Array.from({ length: 17 }, (_, i) => ({
    ...release.snapshot.encounterReleases![0],
    id: i + 1,
  }));
  assert.equal(validSharedCombatFrame(oversized), false);

  const interrupted = reviewAuthority([enemy]);
  interrupted.tick(0.01, [peer]);
  assert.equal(interrupted.technique(peer, 0, 'pulse').ok, true);
  const interrupt = interrupted.tick(0.25, [peer]);
  assert.equal(interrupt.snapshot.enemies[0].intent, undefined);
  assert.equal(interrupt.snapshot.encounterReleases?.length ?? 0, 0);
  const quiet = interrupted.tick(0.25, [peer]);
  assert.equal(quiet.snapshot.encounterReleases?.length ?? 0, 0);
});
