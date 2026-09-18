const MEDIA_SUBPROTOCOL = 'orikuro-media-v1';
const WIRE_MAGIC = 0x4f435650;
const WIRE_VERSION = 1;
const WIRE_HEADER_BYTES = 52;
const WIRE_FLAG_KEYFRAME = 1;
const KIND_VIDEO = 1;
const KIND_AUDIO = 2;
const AUDIO_MAGIC = 0x4f415031;
const AUDIO_VERSION = 1;
const AUDIO_HEADER_BYTES = 16;
const MAX_RECONNECT_DELAY_MS = 2_000;
const MAX_WIRE_BYTES = 64 * 1024 * 1024 + WIRE_HEADER_BYTES;
const NORTHFLANK_HOST = 'health--orikuro-northflank--gzhr8p5vl59b.code.run';
const STREAM_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_RE = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{32,256}$/;

type JsonObject = Record<string, unknown>;

export type WatchMediaGrant = Readonly<{
  streamId: string;
  capability: string;
  expiresAt: number;
  mediaWebSocketUrl: string;
}>;

type MediaPacket = Readonly<{
  kind: number;
  keyframe: boolean;
  cursor: bigint;
  trackIndex: number;
  timebaseNum: number;
  timebaseDen: number;
  pts: bigint;
  dts: bigint;
  sequence: number;
  payload: Uint8Array;
}>;

type AudioPCM = Readonly<{
  channels: number;
  sampleRate: number;
  frames: number;
  planes: Float32Array[];
}>;

type MediaReady = Readonly<{
  resync: boolean;
  startCursor: bigint;
  latestCursor: bigint;
}>;

export class WatchMediaError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WatchMediaError';
    this.code = code;
  }
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function validMediaUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new WatchMediaError('MEDIA_URL_INVALID', '視聴接続先を確認できません。'); }
  if (
    url.protocol !== 'wss:'
    || url.hostname !== NORTHFLANK_HOST
    || (url.port && url.port !== '443')
    || url.username
    || url.password
    || url.pathname !== '/realtime/media'
    || url.search
    || url.hash
  ) throw new WatchMediaError('MEDIA_URL_INVALID', '視聴接続先を確認できません。');
  return url.toString();
}

function validateGrant(grant: WatchMediaGrant): WatchMediaGrant {
  if (
    !STREAM_ID_RE.test(grant.streamId)
    || grant.capability.length > 12_000
    || !CAPABILITY_RE.test(grant.capability)
    || !Number.isSafeInteger(grant.expiresAt)
    || grant.expiresAt <= Date.now()
    || grant.expiresAt > Date.now() + 11 * 60_000
  ) throw new WatchMediaError('MEDIA_GRANT_INVALID', '視聴接続情報を確認できません。');
  return Object.freeze({ ...grant, mediaWebSocketUrl: validMediaUrl(grant.mediaWebSocketUrl) });
}

function reconnectDelay(attempt: number): number {
  return Math.min(MAX_RECONNECT_DELAY_MS, 250 * (2 ** Math.min(attempt, 3)));
}

function safeBigIntToNumber(value: bigint): number | null {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(value);
}

function mediaMicros(value: bigint, num: number, den: number): number | null {
  if (!Number.isSafeInteger(num) || num <= 0 || !Number.isSafeInteger(den) || den <= 0) return null;
  const micros = value * BigInt(num) * 1_000_000n / BigInt(den);
  return safeBigIntToNumber(micros);
}

function parseWire(raw: ArrayBuffer): MediaPacket | null {
  if (raw.byteLength < WIRE_HEADER_BYTES || raw.byteLength > MAX_WIRE_BYTES) return null;
  const view = new DataView(raw);
  if (view.getUint32(0, false) !== WIRE_MAGIC || view.getUint8(4) !== WIRE_VERSION) return null;
  const kind = view.getUint8(5);
  if (kind !== KIND_VIDEO && kind !== KIND_AUDIO) return null;
  const flags = view.getUint16(6, false);
  if ((flags & ~WIRE_FLAG_KEYFRAME) !== 0) return null;
  const cursor = view.getBigUint64(8, false);
  if (cursor === 0n || view.getUint16(18, false) !== 0) return null;
  const timebaseNum = view.getUint32(20, false);
  const timebaseDen = view.getUint32(24, false);
  if (timebaseNum === 0 || timebaseDen === 0) return null;
  const payloadBytes = view.getUint32(48, false);
  if (WIRE_HEADER_BYTES + payloadBytes !== raw.byteLength || payloadBytes === 0) return null;
  return Object.freeze({
    kind,
    keyframe: (flags & WIRE_FLAG_KEYFRAME) !== 0,
    cursor,
    trackIndex: view.getUint16(16, false),
    timebaseNum,
    timebaseDen,
    pts: view.getBigInt64(28, false),
    dts: view.getBigInt64(36, false),
    sequence: view.getUint32(44, false),
    payload: new Uint8Array(raw, WIRE_HEADER_BYTES, payloadBytes),
  });
}

function parseAudioPCM(payload: Uint8Array): AudioPCM | null {
  if (payload.byteLength < AUDIO_HEADER_BYTES) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (
    view.getUint32(0, false) !== AUDIO_MAGIC
    || view.getUint8(4) !== AUDIO_VERSION
    || view.getUint8(6) !== 0
    || view.getUint8(7) !== 0
  ) return null;
  const channels = view.getUint8(5);
  const sampleRate = view.getUint32(8, false);
  const frames = view.getUint32(12, false);
  if (channels < 1 || channels > 8 || sampleRate < 8_000 || sampleRate > 384_000 || frames < 1 || frames > 4096) return null;
  if (AUDIO_HEADER_BYTES + channels * frames * 4 !== payload.byteLength) return null;
  const planes: Float32Array[] = [];
  let offset = AUDIO_HEADER_BYTES;
  for (let ch = 0; ch < channels; ch++) {
    const plane = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame++) {
      const sample = view.getFloat32(offset, false);
      if (!Number.isFinite(sample)) return null;
      plane[frame] = sample;
      offset += 4;
    }
    planes.push(plane);
  }
  return Object.freeze({ channels, sampleRate, frames, planes });
}

function annexBNALUnits(data: Uint8Array): Uint8Array[] {
  const units: Uint8Array[] = [];
  let i = 0;
  while (i + 3 <= data.length) {
    let header = -1;
    for (let j = i; j + 3 <= data.length; j++) {
      if (j + 4 <= data.length && data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 0 && data[j + 3] === 1) { header = j + 4; break; }
      if (data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 1) { header = j + 3; break; }
    }
    if (header < 0 || header >= data.length) break;
    let end = data.length;
    for (let j = header + 1; j + 3 <= data.length; j++) {
      if (
        (j + 4 <= data.length && data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 0 && data[j + 3] === 1)
        || (data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 1)
      ) { end = j; break; }
    }
    units.push(data.subarray(header, end));
    i = end;
  }
  return units;
}

function avcCodecFromAnnexB(data: Uint8Array): string | null {
  for (const nal of annexBNALUnits(data)) {
    if (nal.length >= 4 && (nal[0] & 0x1f) === 7) {
      return `avc1.${nal[1].toString(16).padStart(2, '0')}${nal[2].toString(16).padStart(2, '0')}${nal[3].toString(16).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseReady(value: JsonObject): MediaReady | null {
  if (
    value.type !== 'media_ready'
    || value.protocol !== 1
    || value.videoPayload !== 'h264-annexb'
    || value.audioPayload !== 'oap1-f32-planar'
    || typeof value.resync !== 'boolean'
    || !Number.isSafeInteger(value.startCursor)
    || Number(value.startCursor) < 0
    || !Number.isSafeInteger(value.latestCursor)
    || Number(value.latestCursor) < 0
  ) return null;
  return Object.freeze({
    resync: value.resync,
    startCursor: BigInt(Number(value.startCursor)),
    latestCursor: BigInt(Number(value.latestCursor)),
  });
}

export class WatchMediaClient {
  private readonly grant: WatchMediaGrant;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly status: HTMLElement | null;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private stopping = false;
  private authenticated = false;
  private lastCursor = 0n;
  private expectedCursor: bigint | null = null;
  private allowKeyframeJump = false;
  private decoder: VideoDecoder | null = null;
  private decoderCodec = '';
  private videoAnchorMediaUs: number | null = null;
  private videoAnchorPerfMs = 0;
  private pendingFrames: VideoFrame[] = [];
  private renderTimer: number | null = null;
  private audioContext: AudioContext | null = null;
  private audioEnabled = false;
  private scheduledAudio = new Set<AudioBufferSourceNode>();
  private endedHandler: (() => void) | null = null;

  constructor(grant: WatchMediaGrant, canvas: HTMLCanvasElement, status: HTMLElement | null = null) {
    this.grant = validateGrant(grant);
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) throw new WatchMediaError('CANVAS_UNAVAILABLE', '映像表示を開始できません。');
    this.context = context;
    this.status = status;
  }

  onEnded(handler: () => void): void { this.endedHandler = handler; }
  start(): void { if (!this.stopping) this.connect(); }

  async enableAudio(): Promise<void> {
    if (this.stopping || this.audioEnabled) return;
    if (typeof AudioContext === 'undefined') throw new WatchMediaError('AUDIO_UNAVAILABLE', 'このブラウザでは音声を再生できません。');
    const context = this.audioContext ?? new AudioContext({ latencyHint: 'interactive' });
    this.audioContext = context;
    await context.resume();
    this.audioEnabled = true;
    this.setStatus('視聴中');
  }

  async disableAudio(): Promise<void> {
    this.audioEnabled = false;
    this.clearScheduledAudio();
    if (this.audioContext && this.audioContext.state === 'running') await this.audioContext.suspend().catch(() => undefined);
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'viewer stopped');
    this.resetMediaState(true);
    if (this.audioContext) {
      await this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.setStatus('視聴を終了しました。');
  }

  private setStatus(text: string): void { if (this.status) this.status.textContent = text; }

  private connect(): void {
    if (this.stopping || this.grant.expiresAt <= Date.now()) { this.setStatus('視聴認可が終了しました。'); return; }
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.authenticated = false;
    this.setStatus('配信へ接続しています。');
    const socket = new WebSocket(this.grant.mediaWebSocketUrl, MEDIA_SUBPROTOCOL);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (socket !== this.socket) return;
      const after = this.lastCursor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(this.lastCursor) : 0;
      socket.send(JSON.stringify({ type: 'auth', token: this.grant.capability, streamId: this.grant.streamId, after }));
    });

    socket.addEventListener('message', (event) => {
      if (socket !== this.socket) return;
      if (typeof event.data === 'string') { this.handleControl(socket, event.data); return; }
      if (!(event.data instanceof ArrayBuffer)) { socket.close(1008, 'invalid media message'); return; }
      const packet = parseWire(event.data);
      if (!packet || !this.authenticated) { socket.close(1008, 'invalid media packet'); return; }
      if (!this.cursorAllowed(packet)) { this.forceKeyframeReconnect('配信時刻を再同期しています。'); return; }
      const accepted = packet.kind === KIND_VIDEO ? this.handleVideo(socket, packet) : this.handleAudio(socket, packet);
      if (accepted) this.commitCursor(packet.cursor);
    });

    socket.addEventListener('close', (event) => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.authenticated = false;
      if (this.stopping) return;
      if (event.code === 1008 || this.grant.expiresAt <= Date.now()) { this.setStatus('視聴認可が終了しました。'); return; }
      if (event.code === 1001 && event.reason === 'stream ended') { this.finishStream(); return; }
      this.setStatus('配信へ再接続しています。');
      window.dispatchEvent(new CustomEvent('orikuro:transport-reconnecting', { detail: { streamId: this.grant.streamId } }));
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (socket === this.socket) this.setStatus('配信通信を再確認しています。');
    });
  }

  private handleControl(socket: WebSocket, raw: string): void {
    if (raw.length > 64_000) { socket.close(1008, 'control message too large'); return; }
    let payload: JsonObject | null = null;
    try { payload = objectValue(JSON.parse(raw)); } catch {}
    if (!payload || typeof payload.type !== 'string') { socket.close(1008, 'invalid control message'); return; }
    if (payload.type === 'media_ready') {
      const ready = parseReady(payload);
      if (!ready) { socket.close(1008, 'invalid media ready'); return; }
      if (ready.resync) this.resetMediaState(false);
      this.expectedCursor = ready.startCursor > 0n ? ready.startCursor : null;
      this.allowKeyframeJump = ready.startCursor === 0n;
      this.authenticated = true;
      this.reconnectAttempt = 0;
      this.setStatus('視聴中');
      window.dispatchEvent(new CustomEvent('orikuro:transport-ready', { detail: { streamId: this.grant.streamId } }));
      return;
    }
    if (payload.type === 'media_ended') { this.finishStream(); return; }
    if (payload.type === 'pong') return;
    socket.close(1008, 'unsupported control message');
  }

  private cursorAllowed(packet: MediaPacket): boolean {
    if (packet.cursor <= this.lastCursor) return false;
    if (this.expectedCursor !== null) return packet.cursor === this.expectedCursor;
    if (this.lastCursor !== 0n) return packet.cursor === this.lastCursor + 1n;
    if (this.allowKeyframeJump) return packet.kind === KIND_VIDEO && packet.keyframe;
    return true;
  }

  private commitCursor(cursor: bigint): void {
    this.lastCursor = cursor;
    this.expectedCursor = cursor + 1n;
    this.allowKeyframeJump = false;
  }

  private handleVideo(socket: WebSocket, packet: MediaPacket): boolean {
    const timestampUs = mediaMicros(packet.pts, packet.timebaseNum, packet.timebaseDen);
    if (timestampUs === null || timestampUs < 0 || typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
      socket.close(1003, 'video decoder unavailable');
      return false;
    }
    if (packet.keyframe) {
      const codec = avcCodecFromAnnexB(packet.payload);
      if (!codec) { this.forceKeyframeReconnect('映像を再同期しています。'); return false; }
      if (!this.decoder || codec !== this.decoderCodec || this.decoder.state === 'closed') {
        this.resetVideoDecoder();
        try {
          this.decoder = new VideoDecoder({
            output: (frame) => this.queueVideoFrame(frame),
            error: () => this.forceKeyframeReconnect('映像を再同期しています。'),
          });
          this.decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: 'no-preference' });
          this.decoderCodec = codec;
        } catch {
          this.resetVideoDecoder();
          socket.close(1003, 'h264 decoder configuration failed');
          return false;
        }
      }
    }
    if (!this.decoder || this.decoder.state !== 'configured') { this.forceKeyframeReconnect('キーフレームを再取得しています。'); return false; }
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: packet.keyframe ? 'key' : 'delta', timestamp: timestampUs, data: packet.payload }));
      return true;
    } catch {
      this.forceKeyframeReconnect('映像を再同期しています。');
      return false;
    }
  }

  private queueVideoFrame(frame: VideoFrame): void {
    if (this.stopping) { frame.close(); return; }
    this.pendingFrames.push(frame);
    if (this.pendingFrames.length > 90) {
      this.pendingFrames.shift()?.close();
      this.forceKeyframeReconnect('映像遅延を再同期しています。');
      return;
    }
    this.pumpVideoFrames();
  }

  private pumpVideoFrames(): void {
    if (this.renderTimer !== null || this.pendingFrames.length === 0) return;
    const frame = this.pendingFrames[0];
    const timestampUs = frame.timestamp;
    if (!Number.isFinite(timestampUs) || timestampUs < 0) {
      this.pendingFrames.shift()?.close();
      this.forceKeyframeReconnect('映像時刻を再同期しています。');
      return;
    }
    if (this.videoAnchorMediaUs === null) {
      this.videoAnchorMediaUs = timestampUs;
      this.videoAnchorPerfMs = performance.now();
    }
    const targetMs = this.videoAnchorPerfMs + (timestampUs - this.videoAnchorMediaUs) / 1000;
    const delay = targetMs - performance.now();
    if (delay > 4) {
      this.renderTimer = window.setTimeout(() => { this.renderTimer = null; this.pumpVideoFrames(); }, Math.min(delay, 50));
      return;
    }
    this.pendingFrames.shift();
    try {
      if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
        this.canvas.width = frame.displayWidth;
        this.canvas.height = frame.displayHeight;
      }
      this.context.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
    } finally { frame.close(); }
    queueMicrotask(() => this.pumpVideoFrames());
  }

  private handleAudio(socket: WebSocket, packet: MediaPacket): boolean {
    const pcm = parseAudioPCM(packet.payload);
    const timestampUs = mediaMicros(packet.pts, packet.timebaseNum, packet.timebaseDen);
    if (!pcm || timestampUs === null || timestampUs < 0) { socket.close(1008, 'invalid audio packet'); return false; }
    if (!this.audioEnabled || !this.audioContext || this.audioContext.state !== 'running' || this.videoAnchorMediaUs === null) return true;

    const context = this.audioContext;
    const nowMediaUs = this.videoAnchorMediaUs + (performance.now() - this.videoAnchorPerfMs) * 1000;
    let deltaSec = (timestampUs - nowMediaUs) / 1_000_000;
    const durationSec = pcm.frames / pcm.sampleRate;
    if (deltaSec < -Math.max(0.25, durationSec * 2)) return true;
    let offsetSec = 0;
    if (deltaSec < 0) { offsetSec = Math.min(durationSec, -deltaSec); deltaSec = 0; }
    if (offsetSec >= durationSec) return true;

    let buffer: AudioBuffer;
    try {
      buffer = context.createBuffer(pcm.channels, pcm.frames, pcm.sampleRate);
      for (let ch = 0; ch < pcm.channels; ch++) buffer.copyToChannel(pcm.planes[ch], ch);
    } catch { socket.close(1011, 'audio buffer failed'); return false; }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.scheduledAudio.add(source);
    source.addEventListener('ended', () => {
      this.scheduledAudio.delete(source);
      try { source.disconnect(); } catch {}
    }, { once: true });
    try { source.start(context.currentTime + deltaSec, offsetSec); }
    catch {
      this.scheduledAudio.delete(source);
      try { source.disconnect(); } catch {}
    }
    return true;
  }

  private forceKeyframeReconnect(message: string): void {
    if (this.stopping) return;
    this.setStatus(message);
    this.resetMediaState(false);
    const socket = this.socket;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1013, 'media resync required');
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer !== null || this.grant.expiresAt <= Date.now()) return;
    const delay = reconnectDelay(this.reconnectAttempt++);
    this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }

  private resetVideoDecoder(): void {
    if (this.decoder) { try { this.decoder.close(); } catch {}; this.decoder = null; }
    this.decoderCodec = '';
    for (const frame of this.pendingFrames.splice(0)) frame.close();
    if (this.renderTimer !== null) { clearTimeout(this.renderTimer); this.renderTimer = null; }
  }

  private clearScheduledAudio(): void {
    for (const source of this.scheduledAudio) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    this.scheduledAudio.clear();
  }

  private resetMediaState(keepCursor: boolean): void {
    this.resetVideoDecoder();
    this.clearScheduledAudio();
    this.videoAnchorMediaUs = null;
    this.videoAnchorPerfMs = 0;
    this.expectedCursor = null;
    this.allowKeyframeJump = false;
    if (!keepCursor) this.lastCursor = 0n;
  }

  private finishStream(): void {
    if (this.stopping) return;
    this.stopping = true;
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'stream ended');
    this.resetMediaState(true);
    this.setStatus('配信が終了しました。');
    window.dispatchEvent(new CustomEvent('orikuro:transport-ended', { detail: { streamId: this.grant.streamId } }));
    this.endedHandler?.();
  }
}
