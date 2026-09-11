import { createPeerTransport, type RoomTransport } from '../src/stichos/peer-transport.ts';
import { MULTIPLAYER_PROTOCOL } from '../src/stichos/multiplayer-protocol.ts';
import { validSharedCombatFrame, type SharedCombatFrame } from '../src/stichos/shared-combat.ts';
import { InfiniteWorld, appearance } from '../src/stichos/world.ts';

// These are real clear coordinates in world3886/gen3. Their union exposes49 generated raiders.
// No invented NPCs, padded packets, game-state assignment, or local-storage changes participate.
const positions = [
  { x: -352, y: -448 },
  { x: 192, y: -480 },
  { x: -384, y: -416 },
  { x: -128, y: -352 },
  { x: 448, y: -352 },
  { x: 0, y: -256 },
  { x: 320, y: -160 },
  { x: -480, y: -128 },
];
interface Client {
  wire: RoomTransport;
  peerId: string;
  room: string;
  welcomed: number;
  frames: number;
  maxBytes: number;
  lastSequence: number;
  lastAck: number;
}
interface Report {
  status: 'RUNNING' | 'PASS' | 'FAIL';
  started: string;
  finished?: string;
  checks: { name: string; detail?: unknown }[];
  error?: string;
  clients?: {
    peerId: string;
    welcomed: number;
    frames: number;
    maxBytes: number;
    lastSequence: number;
  }[];
  cleanup?: { connections: number; allClosed: boolean; webSocketRestored: boolean };
}
const output = document.querySelector<HTMLPreElement>('#result')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const encode = new TextEncoder();
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

button.onclick = async () => {
  button.disabled = true;
  const report: Report = { status: 'RUNNING', started: new Date().toISOString(), checks: [] };
  const publish = () => {
    output.textContent = JSON.stringify(report, null, 2);
    (window as unknown as { peerTransportFixture: Report }).peerTransportFixture =
      structuredClone(report);
  };
  publish();
  const deadline = performance.now() + 30000;
  const NativeWebSocket = window.WebSocket;
  const signals: WebSocket[] = [];
  const clients: Client[] = [];
  const frameHashes = new Map<number, number>();
  let ending = false,
    failure = '',
    poseClock: ReturnType<typeof setInterval> | undefined;
  const fail = (message: string) => {
    if (!ending && !failure) failure = message;
  };
  class SignalSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      if (new URL(String(url), location.href).hostname.endsWith('peerjs.com')) signals.push(this);
    }
  }
  window.WebSocket = SignalSocket;
  const guard = () => {
    if (failure) throw Error(failure);
    if (performance.now() >= deadline)
      throw Error('Transport fixture exceeded its30-second deadline.');
  };
  const wait = async (check: () => boolean) => {
    while (!check()) {
      guard();
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    guard();
  };
  const note = (name: string, detail?: unknown) => {
    report.checks.push({ name, ...(detail === undefined ? {} : { detail }) });
    publish();
  };
  const look = { ...appearance(42, 'pilgrim', 1), weapon: 'staff' as const };
  const makeClient = (index: number, room = '') => {
    const wire = createPeerTransport(room);
    const c: Client = {
      wire,
      room,
      peerId: '',
      welcomed: 0,
      frames: 0,
      maxBytes: 0,
      lastSequence: 0,
      lastAck: 0,
    };
    clients.push(c);
    wire.onopen = () =>
      wire.send(
        JSON.stringify({
          type: 'join',
          protocol: MULTIPLAYER_PROTOCOL,
          seed: 3886,
          generation: 3,
          name: `Transport witness ${index + 1}`,
          appearance: look,
          position: positions[index],
          combatActive: true,
          bodyId: `fixture-body-${index}`,
          progression: { level: 1, combatXp: 0, upgrade: 0 },
          ...(room ? { room } : {}),
        }),
      );
    wire.onerror = () => fail(`Transport${index + 1} emitted an error.`);
    wire.onclose = () => fail(`Transport${index + 1} closed before cleanup.`);
    wire.onmessage = ({ data }) => {
      if (ending) return;
      if (typeof data !== 'string') {
        fail('Binary transport did not reassemble the original string.');
        return;
      }
      try {
        const message = JSON.parse(data);
        if (message.type === 'error') {
          fail(`Authority error: ${message.code}: ${message.reason}`);
          return;
        }
        if (message.type === 'welcome') {
          c.welcomed++;
          c.peerId = message.peerId;
          c.room = message.room;
          if (c.welcomed !== 1) fail('A signalling reconnect triggered a second room join.');
          if (!validSharedCombatFrame(message.combat)) fail('Malformed welcome combat frame.');
        }
        if (message.type === 'combat_frame') {
          if (!validSharedCombatFrame(message.frame)) {
            fail('Malformed reassembled combat frame.');
            return;
          }
          const frame = message.frame as SharedCombatFrame;
          const bytes = encode.encode(data).length,
            seq = message.frame.snapshot.seq,
            checksum = hash(data);
          if (frameHashes.has(seq) && frameHashes.get(seq) !== checksum)
            fail(`Room frame${seq} differed between participants.`);
          frameHashes.set(seq, checksum);
          while (frameHashes.size > 128) frameHashes.delete(frameHashes.keys().next().value!);
          c.frames++;
          c.lastSequence = seq;
          c.maxBytes = Math.max(c.maxBytes, bytes);
          const eventId = Math.max(
            0,
            ...frame.hits.map((h) => h.id),
            ...frame.deaths.map((d) => d.id),
          );
          if (eventId > c.lastAck) {
            c.lastAck = eventId;
            wire.send(JSON.stringify({ type: 'combat_ack', eventId }));
          }
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    };
    return c;
  };
  // A hard wall-clock cleanup also covers a stalled external connection promise.
  const hardStop = setTimeout(() => {
    fail('Transport fixture exceeded its30-second deadline.');
    ending = true;
    clearInterval(poseClock);
    for (const c of [...clients].reverse()) c.wire.close();
    window.WebSocket = NativeWebSocket;
  }, 30000);
  try {
    const world = new InfiniteWorld(3886, 3);
    if (positions.some((p) => world.blocked(p.x, p.y)))
      throw Error('A fixture position is not clear in this generated world.');
    note('All eight fixture positions are legal generated terrain', positions);
    const host = makeClient(0);
    await wait(() => host.welcomed === 1);
    for (let i = 1; i < 8; i++) makeClient(i, host.room);
    poseClock = setInterval(() => {
      if (ending) return;
      clients.forEach((c, i) => {
        if (c.welcomed && c.wire.readyState === 1)
          c.wire.send(
            JSON.stringify({
              type: 'pose',
              ...positions[i],
              heading: 0,
              phase: 0,
              appearance: look,
              combatActive: true,
              bodyId: `fixture-body-${i}`,
              progression: { level: 1, combatXp: 0, upgrade: 0 },
            }),
          );
      });
    }, 200);
    await wait(
      () =>
        clients.length === 8 && clients.every((c) => c.welcomed === 1 && c.wire.readyState === 1),
    );
    note('Eight participants joined through real public PeerJS signalling and RTC channels');
    await wait(() => clients.every((c) => c.maxBytes > 16300 && c.frames >= 2));
    note(
      'Every participant reassembled identical valid combat strings larger than the JSON-channel limit',
      clients.map((c) => ({ bytes: c.maxBytes, frames: c.frames })),
    );
    const hostSignal = signals.find(
      (s) =>
        s.readyState === NativeWebSocket.OPEN &&
        new URL(s.url).searchParams.get('id') === `verso-room-${host.room}`,
    );
    if (!hostSignal)
      throw Error('Could not identify this fixture host’s actual signalling WebSocket.');
    const beforeSignals = signals.length,
      beforeFrames = clients.map((c) => c.frames);
    hostSignal.close(4000, 'test-owned signalling interruption');
    await wait(() =>
      signals
        .slice(beforeSignals)
        .some(
          (s) =>
            s.readyState === NativeWebSocket.OPEN &&
            new URL(s.url).searchParams.get('id') === `verso-room-${host.room}`,
        ),
    );
    await wait(() => clients.every((c, i) => c.frames >= beforeFrames[i] + 4));
    if (clients.some((c) => c.welcomed !== 1 || c.wire.readyState !== 1))
      throw Error('Signalling recovery replaced or closed a live room participant.');
    note(
      'Host signalling recovered while all eight RTC room sessions continued without duplicate welcome',
      { newSignallingSockets: signals.length - beforeSignals },
    );
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    ending = true;
    clearTimeout(hardStop);
    clearInterval(poseClock);
    for (const c of [...clients].reverse()) c.wire.close();
    window.WebSocket = NativeWebSocket;
    report.finished = new Date().toISOString();
    report.clients = clients.map(({ peerId, welcomed, frames, maxBytes, lastSequence }) => ({
      peerId,
      welcomed,
      frames,
      maxBytes,
      lastSequence,
    }));
    report.cleanup = {
      connections: clients.length,
      allClosed: clients.every((c) => c.wire.readyState === 3),
      webSocketRestored: window.WebSocket === NativeWebSocket,
    };
    publish();
    button.disabled = false;
  }
};
