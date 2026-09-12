/** Noise-excited delay-line string and struck wooden/metal resonators; no swept game beeps. */
export function instrumentSamples(
  kind: 'string' | 'resonator',
  hz: number,
  seed: number,
  rate = 24000,
): Float32Array {
  hz = Math.max(70, Math.min(1600, Number.isFinite(hz) ? hz : 220));
  const duration = kind === 'string' ? 2.2 : 3.6;
  const output = new Float32Array(Math.ceil(rate * duration));
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
  if (kind === 'string') {
    const size = Math.max(3, Math.round(rate / hz - 0.5)),
      ring = new Float32Array(size);
    let previous = 0;
    for (let i = 0; i < size; i++) {
      previous = previous * 0.4 + random() * 0.6;
      ring[i] = previous;
    }
    let index = 0;
    for (let i = 0; i < output.length; i++) {
      const value = ring[index];
      const next = (index + 1) % size;
      ring[index] = (value + ring[next]) * 0.4983;
      output[i] =
        value * Math.min(1, i / (rate * 0.003)) * Math.min(1, (output.length - i) / (rate * 0.04));
      index = next;
    }
  } else {
    // Damped inharmonic modes approximate a struck hollow resonator. Excitation
    // and partial decay are deterministic; terminal taper prevents clicks.
    const modes = [1, 2.756, 5.404, 8.933];
    for (let m = 0; m < modes.length; m++) {
      const frequency = hz * modes[m];
      if (frequency > rate * 0.43) continue;
      const phase = random() * 0.08,
        decay = 1.05 + m * 0.95,
        amplitude = 0.42 / (1 + m * 2.5);
      const omega = (frequency * Math.PI * 2) / rate,
        damping = Math.exp(-decay / rate);
      const a = 2 * damping * Math.cos(omega),
        b = damping * damping;
      let previous = (amplitude * Math.sin(phase - omega)) / damping,
        current = amplitude * Math.sin(phase);
      const attack = rate * 0.009,
        release = rate * 0.08;
      for (let i = 0; i < output.length; i++) {
        output[i] += current * Math.min(1, i / attack, (output.length - i) / release);
        const next = a * current - b * previous;
        previous = current;
        current = next;
      }
    }
  }
  return output;
}
