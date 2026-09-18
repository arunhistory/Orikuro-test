const TARGET_FRAMES = 1024;

class OrikuroAudioCaptureProcessor extends AudioWorkletProcessor {
  private readonly targetFrames = TARGET_FRAMES;
  private channelCount = 0;
  private planes: Float32Array[] = [];
  private writeOffset = 0;
  private packetStartFrame = 0;

  private resetChannels(channels: number): void {
    this.channelCount = channels;
    this.planes = Array.from({ length: channels }, () => new Float32Array(this.targetFrames));
    this.writeOffset = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;
    const channels = Math.min(input.length, 8);
    const sourceFrames = input[0].length;
    for (let ch = 1; ch < channels; ch++) {
      if (input[ch].length !== sourceFrames) return true;
    }
    if (channels !== this.channelCount) this.resetChannels(channels);

    let sourceOffset = 0;
    while (sourceOffset < sourceFrames) {
      if (this.writeOffset === 0) this.packetStartFrame = currentFrame + sourceOffset;
      const take = Math.min(sourceFrames - sourceOffset, this.targetFrames - this.writeOffset);
      for (let ch = 0; ch < channels; ch++) {
        this.planes[ch].set(input[ch].subarray(sourceOffset, sourceOffset + take), this.writeOffset);
      }
      sourceOffset += take;
      this.writeOffset += take;

      if (this.writeOffset === this.targetFrames) {
        const packetPlanes = this.planes;
        const transfer = packetPlanes.map((plane) => plane.buffer);
        this.port.postMessage({
          type: 'audio-packet',
          startFrame: this.packetStartFrame,
          sampleRate,
          frames: this.targetFrames,
          planes: packetPlanes,
        }, transfer);
        this.planes = Array.from({ length: channels }, () => new Float32Array(this.targetFrames));
        this.writeOffset = 0;
      }
    }
    return true;
  }
}

registerProcessor('orikuro-audio-capture', OrikuroAudioCaptureProcessor);
