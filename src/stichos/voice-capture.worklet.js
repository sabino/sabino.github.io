/* Original Verso audio worklet. No network, recording, persistence, or output monitoring. */
class VersoVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;
    this.frame = new Float32Array(320);
    this.index = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.port.onmessage = (e) => {
      this.enabled = e.data === true;
      this.index = 0;
      this.phase = 0;
      this.sum = 0;
      this.count = 0;
    };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!this.enabled || !input) return true;
    // Averaging before downsampling reduces aliasing; fixed 16kHz independent of device clock.
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.frame[this.index++] = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        if (this.index === 320) {
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(320);
          this.index = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('verso-voice-capture', VersoVoiceCapture);
