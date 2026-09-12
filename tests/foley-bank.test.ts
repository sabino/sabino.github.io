import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { foleyGroup, planFoley, FOLEY_LIMITS } from '../src/foley.ts';
import type { FoleyEvent, FoleyMaterial } from '../src/foley.ts';
import { FOLEY_CLIPS } from '../src/foley-clips.ts';
import { AUDIO_BANK_PATHS } from '../src/audio-bank-manifest.ts';
import { SoundBank } from '../src/sound-bank.ts';
import { instrumentSamples } from '../src/physical-instruments.ts';

test('all physical actions and terrains resolve to actual recorded takes', () => {
  const materials: FoleyMaterial[] = [
    'grass',
    'dirt',
    'gravel',
    'stone',
    'wood',
    'sand',
    'snow',
    'water',
    'metal',
    'plant',
    'cloth',
    'flesh',
  ];
  const kinds: FoleyEvent['kind'][] = [
    'footstep',
    'tool-impact',
    'pickup',
    'swing',
    'hit',
    'door',
    'equip',
    'craft',
  ];
  for (const kind of kinds)
    for (const material of materials)
      assert.ok(FOLEY_CLIPS[foleyGroup({ kind, material })]?.length >= 2, `${kind}/${material}`);
  assert.equal(foleyGroup({ kind: 'tool-impact', material: 'wood' }), 'chop');
  assert.equal(foleyGroup({ kind: 'tool-impact', material: 'stone' }), 'mining');
  assert.equal(foleyGroup({ kind: 'pickup', material: 'plant' }), 'rustle');
});
test('contact timing, world-space range and take variation are deterministic and bounded', () => {
  const e: FoleyEvent = { kind: 'tool-impact', material: 'stone', intensity: 1, delay: 0.17 };
  assert.deepEqual(planFoley(e, 8, 91), planFoley(e, 8, 91));
  assert.equal(planFoley(e, 0, 91)!.delay, 0.17);
  assert.equal(new Set(Array.from({ length: 4 }, (_, i) => planFoley(e, i, 91)!.variant)).size, 4);
  assert.equal(planFoley({ ...e, distance: 18 }, 0, 91), null);
  assert.ok(planFoley({ ...e, distance: 9 }, 0, 91)!.gain < planFoley(e, 0, 91)!.gain);
  const bad = planFoley({ ...e, delay: 99, pan: 99, speed: Infinity, intensity: NaN }, 0, 91)!;
  assert.equal(bad.delay, 0.3);
  assert.equal(bad.pan, 1);
  assert.ok(Number.isFinite(bad.gain));
});
test('shipped banks are content-addressed, licensed, under download budget, and contain73 unique nonsilent contacts', () => {
  const provenance = JSON.parse(readFileSync('public/audio/PROVENANCE.json', 'utf8'));
  assert.equal(provenance.license, 'CC0-1.0');
  for (const file of Object.values(AUDIO_BANK_PATHS)) {
    const bytes = readFileSync('public/audio/' + file),
      hash = createHash('sha256').update(bytes).digest('hex');
    assert.ok(file.includes(hash.slice(0, 12)));
    assert.ok(bytes.length < FOLEY_LIMITS.maxAssetBytes);
    assert.ok(provenance.outputs.some((output: { sha256: string }) => output.sha256 === hash));
  }
  const wav = readFileSync('public/audio/' + AUDIO_BANK_PATHS.foley);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  const clips = Object.values(FOLEY_CLIPS).flat();
  assert.ok(clips.length >= 73);
  const hashes = new Set<string>();
  for (const clip of clips) {
    const start = 44 + Math.round(clip.offset * 24000) * 2,
      end = start + Math.round(clip.duration * 24000) * 2;
    assert.ok(end <= wav.length);
    const bytes = wav.subarray(start, end);
    let peak = 0,
      energy = 0;
    for (let i = 0; i < bytes.length; i += 2) {
      const v = bytes.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(v));
      energy += v * v;
    }
    assert.ok(energy > 0.01);
    assert.ok(peak < 0.83);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  // Chop shares wooden collision takes; cloth is also used as a soft staff swish.
  assert.equal(hashes.size, 73);
});
test('physical instruments decay without clipping and retain seeded excitation', () => {
  for (const kind of ['string', 'resonator'] as const) {
    const a = instrumentSamples(kind, 220, 12),
      b = instrumentSamples(kind, 220, 12),
      c = instrumentSamples(kind, 220, 13);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    let peak = 0,
      early = 0,
      late = 0;
    for (let i = 0; i < a.length; i++) {
      peak = Math.max(peak, Math.abs(a[i]));
      if (i < 12000) early += a[i] ** 2;
      if (i > a.length - 12000) late += a[i] ** 2;
    }
    assert.ok(peak < 1);
    assert.ok(early > late * 2);
    assert.ok(Math.abs(a[0]) < 0.001);
    assert.ok(Math.abs(a.at(-1)!) < 0.001);
  }
});
function buffer(seconds = 1, rate = 24000) {
  const length = Math.round(seconds * rate),
    data = new Float32Array(length);
  return {
    length,
    numberOfChannels: 1,
    duration: seconds,
    sampleRate: rate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}
test('recorded bank coalesces loads, bounds concurrency and decodes once', async () => {
  let fetches = 0,
    decodes = 0,
    active = 0,
    maxActive = 0;
  const context = {
    decodeAudioData: async () => {
      decodes++;
      return buffer();
    },
  } as unknown as AudioContext;
  const fetcher = (async () => {
    fetches++;
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 8));
    active--;
    return new Response(new Uint8Array(20));
  }) as typeof fetch;
  const bank = new SoundBank(context, '/games/verso/audio/', fetcher);
  await Promise.all([
    bank.load('foley'),
    bank.load('foley'),
    bank.load('wind'),
    bank.load('birds'),
    bank.load('water'),
  ]);
  assert.equal(fetches, 4);
  assert.equal(decodes, 4);
  assert.ok(maxActive <= 2);
  assert.equal(bank.diagnostics().ready, 4);
  await bank.load('foley');
  assert.equal(fetches, 4);
  bank.dispose();
  assert.equal(bank.diagnostics().decodedBytes, 0);
});
test('missing assets back off instead of network loops; oversize data never decodes', async () => {
  let requests = 0,
    decodes = 0;
  const context = {
    decodeAudioData: async () => {
      decodes++;
      return buffer();
    },
  } as unknown as AudioContext;
  const bank = new SoundBank(context, '/audio/', (async () => {
    requests++;
    return new Response('', { status: 404 });
  }) as typeof fetch);
  assert.equal(await bank.load('foley'), null);
  assert.equal(await bank.load('foley'), null);
  assert.equal(requests, 1);
  assert.equal(bank.diagnostics().failed, 1);
  bank.dispose();
  const large = new SoundBank(
    context,
    '/audio/',
    (async () =>
      new Response('', {
        headers: { 'content-length': String(FOLEY_LIMITS.maxAssetBytes + 1) },
      })) as typeof fetch,
  );
  assert.equal(await large.load('foley'), null);
  assert.equal(decodes, 0);
  large.dispose();
});
test('late decode after disposal cannot restore buffers or start playback', async () => {
  let finish: (value: AudioBuffer) => void = () => {};
  const context = {
    decodeAudioData: () =>
      new Promise<AudioBuffer>((resolve) => {
        finish = resolve;
      }),
  } as unknown as AudioContext;
  const bank = new SoundBank(
    context,
    '/audio/',
    (async () => new Response(new Uint8Array(20))) as typeof fetch,
  );
  const pending = bank.load('foley');
  await new Promise((r) => setTimeout(r, 0));
  bank.dispose();
  finish(buffer());
  assert.equal(await pending, null);
  assert.equal(bank.get('foley'), undefined);
  assert.equal(bank.diagnostics().decodedBytes, 0);
});
test('high-rate devices retain compact decoded banks instead of multiplying memory', async () => {
  const context = {
    decodeAudioData: async () => buffer(2, 96000),
    createBuffer: (_channels: number, length: number, rate: number) => buffer(length / rate, rate),
  } as unknown as AudioContext;
  const bank = new SoundBank(
    context,
    '/audio/',
    (async () => new Response(new Uint8Array(20))) as typeof fetch,
  );
  const decoded = await bank.load('wind');
  assert.equal(decoded?.sampleRate, 24000);
  assert.equal(bank.diagnostics().decodedBytes, 2 * 24000 * 4);
  bank.dispose();
});

test('stalled connections time out and release both slots for queued banks', async () => {
  const context = { decodeAudioData: async () => buffer() } as unknown as AudioContext;
  let calls = 0;
  const bank = new SoundBank(
    context,
    '/audio/',
    (async () => {
      calls++;
      if (calls <= 2) return await new Promise<Response>(() => {});
      return new Response(new Uint8Array(20));
    }) as typeof fetch,
    15,
  );
  const results = await Promise.all([bank.load('foley'), bank.load('wind'), bank.load('birds')]);
  assert.equal(results[0], null);
  assert.equal(results[1], null);
  assert.ok(results[2]);
  assert.equal(bank.diagnostics().activeLoads, 0);
  assert.equal(calls, 3);
  bank.dispose();
});

test('unbounded responses and invalid decoded shape are rejected before compact allocation', async () => {
  let decoded = 0,
    allocated = 0,
    cancelled = false;
  const context = {
    decodeAudioData: async () => {
      decoded++;
      return buffer(400);
    },
    createBuffer: () => {
      allocated++;
      return buffer();
    },
  } as unknown as AudioContext;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(FOLEY_LIMITS.maxAssetBytes + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const streamed = new SoundBank(
    context,
    '/audio/',
    (async () => new Response(stream)) as typeof fetch,
  );
  assert.equal(await streamed.load('foley'), null);
  assert.equal(decoded, 0);
  assert.equal(cancelled, true);
  streamed.dispose();
  const invalid = new SoundBank(
    context,
    '/audio/',
    (async () => new Response(new Uint8Array(20))) as typeof fetch,
  );
  assert.equal(await invalid.load('foley'), null);
  assert.equal(allocated, 0);
  invalid.dispose();
});

test('native fetch receiver is the global scope, not a SoundBank instance', async () => {
  const context = { decodeAudioData: async () => buffer() } as unknown as AudioContext;
  const fetcher = async function (this: unknown) {
    assert.equal(this, globalThis);
    return new Response(new Uint8Array(20));
  } as typeof fetch;
  const bank = new SoundBank(context, '/audio/', fetcher);
  assert.ok(await bank.load('foley'));
  assert.equal(bank.diagnostics().failed, 0);
  bank.dispose();
});
