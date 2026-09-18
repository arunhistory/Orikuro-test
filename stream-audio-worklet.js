class OrikuroAudioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = 1024;
    this.offset = 0;
    this.buffers = [];
    this.blockStart = 0;
  }

  ensureChannels(count) {
    if (this.buffers.length === count) return;
    this.buffers = Array.from({length: count}, () => new Float32Array(this.frames));
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length < 1) return true;
    const channels = Math.min(input.length, 8);
    this.ensureChannels(channels);
    const available = input[0]?.length || 0;
    if (available < 1) return true;

    let srcOffset = 0;
    while (srcOffset < available) {
      if (this.offset === 0) this.blockStart = currentTime + srcOffset / sampleRate;
      const take = Math.min(this.frames - this.offset, available - srcOffset);
      for (let c = 0; c < channels; c++) {
        this.buffers[c].set(input[c].subarray(srcOffset, srcOffset + take), this.offset);
      }
      this.offset += take;
      srcOffset += take;
      if (this.offset === this.frames) {
        const planes = this.buffers.map((plane) => plane.slice());
        this.port.postMessage({
          type: 'audio_block',
          sampleRate,
          timestampSeconds: this.blockStart,
          planes,
        }, planes.map((plane) => plane.buffer));
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('orikuro-audio-capture', OrikuroAudioCapture);
