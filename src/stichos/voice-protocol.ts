/** Versioned, independently decodable 20 ms IMA ADPCM packets. No audio containers. */
export const VOICE_CODEC = 'ima-adpcm-16k-v1' as const;
export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_SAMPLES = 320;
export const VOICE_FRAME_BYTES = 176;
export const VOICE_RELAY_BYTES = 192;
export const VOICE_MODES = ['whisper', 'normal', 'shout'] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];
/** Canonical gameplay camera covers ~28 world tiles. Devices and zoom never alter reach. */
export const VOICE_RANGES: Readonly<Record<VoiceMode, number>> = Object.freeze({
  whisper: 3,
  normal: 14,
  shout: 42,
});
export interface VoiceTicket {
  ticket: string;
  expiresAt: number;
}
export interface VoiceCapability {
  version: 1;
  codecs: string[];
  ranges: Record<VoiceMode, number>;
}
export function validVoiceMode(mode: unknown): mode is VoiceMode {
  return VOICE_MODES.includes(mode as VoiceMode);
}
export function validVoiceFrame(bytes: Uint8Array): boolean {
  if (bytes.length !== VOICE_FRAME_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (
    bytes[0] === 86 &&
    bytes[1] === 65 &&
    bytes[2] === 1 &&
    bytes[3] === 1 &&
    bytes[4]! < 3 &&
    bytes[5] === 0 &&
    view.getUint16(6, true) === VOICE_SAMPLES &&
    bytes[14]! <= 88 &&
    bytes[15] === 0
  );
}
const STEPS = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
  80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
  544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
  2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
  12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];
const clamp16 = (x: number) => Math.max(-32768, Math.min(32767, x));
export function encodeVoiceFrame(
  samples: Float32Array,
  sequence: number,
  mode: VoiceMode,
  inputGain = 1,
): Uint8Array {
  if (samples.length !== VOICE_SAMPLES || !validVoiceMode(mode))
    throw Error('Invalid audio frame.');
  const out = new Uint8Array(VOICE_FRAME_BYTES),
    view = new DataView(out.buffer);
  out.set([86, 65, 1, 1, VOICE_MODES.indexOf(mode), 0]);
  view.setUint16(6, VOICE_SAMPLES, true);
  view.setUint32(8, sequence >>> 0, true);
  let predictor = clamp16(Math.round((samples[0] || 0) * 28000 * inputGain)),
    index = 30;
  view.setInt16(12, predictor, true);
  out[14] = index;
  for (let i = 0; i < VOICE_SAMPLES; i++) {
    const target = clamp16(Math.round(Math.tanh((samples[i] || 0) * inputGain) * 30000));
    let diff = target - predictor,
      code = diff < 0 ? 8 : 0;
    diff = Math.abs(diff);
    const step = STEPS[index]!;
    let delta = step >> 3;
    if (diff >= step) {
      code |= 4;
      diff -= step;
      delta += step;
    }
    if (diff >= step / 2) {
      code |= 2;
      diff -= step / 2;
      delta += step >> 1;
    }
    if (diff >= step / 4) {
      code |= 1;
      delta += step >> 2;
    }
    predictor = clamp16(predictor + (code & 8 ? -delta : delta));
    index = Math.max(0, Math.min(88, index + INDEX[code & 7]!));
    out[16 + (i >> 1)]! |= code << ((i & 1) * 4);
  }
  return out;
}
export function decodeVoiceFrame(bytes: Uint8Array): Float32Array {
  if (!validVoiceFrame(bytes)) throw Error('Malformed audio frame.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    out = new Float32Array(VOICE_SAMPLES);
  let predictor = view.getInt16(12, true),
    index = bytes[14]!;
  for (let i = 0; i < VOICE_SAMPLES; i++) {
    const code = (bytes[16 + (i >> 1)]! >> ((i & 1) * 4)) & 15,
      step = STEPS[index]!;
    let delta = step >> 3;
    if (code & 4) delta += step;
    if (code & 2) delta += step >> 1;
    if (code & 1) delta += step >> 2;
    predictor = clamp16(predictor + (code & 8 ? -delta : delta));
    index = Math.max(0, Math.min(88, index + INDEX[code & 7]!));
    out[i] = predictor / 32768;
  }
  return out;
}
export function voicePeerBytes(id: string): Uint8Array {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))
    throw Error('Invalid voice identity.');
  return Uint8Array.from(id.replaceAll('-', '').match(/../g)!, (h) => parseInt(h, 16));
}
export function voicePeerId(bytes: Uint8Array): string {
  const h = Array.from(bytes.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
