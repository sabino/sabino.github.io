import { FOLEY_LIMITS } from './foley.ts';
import { AUDIO_BANK_PATHS } from './audio-bank-manifest.ts';
export type SampleBankId = 'foley' | 'wind' | 'water' | 'birds' | 'insects' | 'fire';
interface Entry {
  buffer?: AudioBuffer;
  task?: Promise<AudioBuffer | null>;
  failedAt?: number;
  attempts: number;
}
/** Same-origin, bounded recorded samples. Only the game AudioContext owns these buffers. */
export class SoundBank {
  private context: AudioContext;
  private base: string;
  private fetcher: typeof fetch;
  private timeoutMs: number;
  private entries = new Map<SampleBankId, Entry>();
  private abort = new AbortController();
  private active = 0;
  private waiting: Array<() => void> = [];
  private disposed = false;
  private bytes = 0;
  constructor(
    context: AudioContext,
    base = `${import.meta.env?.BASE_URL ?? './'}audio/`,
    fetcher: typeof fetch = globalThis.fetch,
    timeoutMs = FOLEY_LIMITS.requestTimeoutMs,
  ) {
    this.context = context;
    this.base = base;
    this.fetcher = fetcher.bind(globalThis);
    this.timeoutMs = timeoutMs;
  }
  get(id: SampleBankId): AudioBuffer | undefined {
    return this.entries.get(id)?.buffer;
  }
  diagnostics() {
    return {
      ready: [...this.entries.values()].filter((e) => e.buffer).length,
      loading: [...this.entries.values()].filter((e) => e.task).length,
      failed: [...this.entries.values()].filter((e) => e.failedAt !== undefined).length,
      decodedBytes: this.bytes,
      activeLoads: this.active,
    };
  }
  async load(id: SampleBankId): Promise<AudioBuffer | null> {
    if (this.disposed || typeof this.context.decodeAudioData !== 'function') return null;
    const entry = this.entries.get(id) ?? { attempts: 0 };
    if (entry.buffer) return entry.buffer;
    if (entry.task) return entry.task;
    if (
      entry.failedAt !== undefined &&
      (Date.now() - entry.failedAt < 15000 || entry.attempts >= 3)
    )
      return null;
    this.entries.set(id, entry);
    entry.task = (async () => {
      if (this.active >= FOLEY_LIMITS.concurrentLoads)
        await new Promise<void>((resolve) => this.waiting.push(resolve));
      if (this.disposed) return null;
      this.active++;
      entry.attempts++;
      const request = new AbortController();
      const cancelled = () => request.abort();
      this.abort.signal.addEventListener('abort', cancelled, { once: true });
      const timeout = setTimeout(() => request.abort(), this.timeoutMs);
      let rejectAborted: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        rejectAborted = () => reject(Error('Audio request cancelled or timed out'));
        request.signal.addEventListener('abort', rejectAborted, { once: true });
      });
      try {
        const response = await Promise.race([
          this.fetcher(this.base + AUDIO_BANK_PATHS[id], {
            signal: request.signal,
            credentials: 'same-origin',
          }),
          aborted,
        ]);
        if (!response.ok) throw Error('Audio asset unavailable');
        const declared = Number(response.headers.get('content-length'));
        if (declared > FOLEY_LIMITS.maxAssetBytes) throw Error('Audio asset exceeds byte limit');
        const chunks: Uint8Array[] = [];
        let size = 0;
        const reader = response.body?.getReader();
        if (!reader) throw Error('Audio response has no body');
        try {
          for (;;) {
            const next = await Promise.race([reader.read(), aborted]);
            if (next.done) break;
            size += next.value.byteLength;
            if (size > FOLEY_LIMITS.maxAssetBytes) throw Error('Audio asset exceeds byte limit');
            chunks.push(next.value);
          }
        } finally {
          void reader.cancel().catch(() => undefined);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        let buffer = await Promise.race([this.context.decodeAudioData(bytes.buffer), aborted]);
        if (
          !Number.isFinite(buffer.duration) ||
          buffer.duration <= 0 ||
          buffer.duration > 45 ||
          buffer.numberOfChannels !== 1 ||
          !Number.isInteger(buffer.length) ||
          buffer.length < 1 ||
          buffer.sampleRate < 8000 ||
          buffer.sampleRate > 192000 ||
          Math.abs(buffer.length - buffer.duration * buffer.sampleRate) > 2
        )
          throw Error('Decoded audio shape exceeds bank limits');
        if (
          Math.ceil(buffer.duration * Math.min(buffer.sampleRate, 24000)) * 4 + this.bytes >
          FOLEY_LIMITS.decodedBytes
        )
          throw Error('Audio decode budget exceeded');
        // Decoders resample to the device rate. Keep long-lived banks at24kHz,
        // including96kHz output devices, rather than scaling their memory use.
        if (buffer.sampleRate > 24000) {
          const compact = this.context.createBuffer(
            buffer.numberOfChannels,
            Math.ceil(buffer.duration * 24000),
            24000,
          );
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const input = buffer.getChannelData(channel),
              output = compact.getChannelData(channel),
              ratio = buffer.sampleRate / 24000;
            for (let i = 0; i < output.length; i++) {
              const position = i * ratio,
                index = Math.floor(position),
                fraction = position - index;
              output[i] =
                (input[index] ?? 0) * (1 - fraction) +
                (input[index + 1] ?? input[index] ?? 0) * fraction;
            }
          }
          buffer = compact;
        }
        const memory = buffer.length * buffer.numberOfChannels * 4;
        if (this.disposed) return null;
        if (!Number.isFinite(memory) || memory + this.bytes > FOLEY_LIMITS.decodedBytes)
          throw Error('Audio decode budget exceeded');
        entry.buffer = buffer;
        this.bytes += memory;
        entry.failedAt = undefined;
        return buffer;
      } catch {
        if (!this.disposed) entry.failedAt = Date.now();
        return null;
      } finally {
        clearTimeout(timeout);
        this.abort.signal.removeEventListener('abort', cancelled);
        request.signal.removeEventListener('abort', rejectAborted);
        request.abort();
        this.active--;
        this.waiting.shift()?.();
        entry.task = undefined;
      }
    })();
    return entry.task;
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    for (const resolve of this.waiting.splice(0)) resolve();
    this.entries.clear();
    this.bytes = 0;
  }
}
