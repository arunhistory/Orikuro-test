import { clearStreamRealtimeGrant, getStreamRealtimeGrant, type StreamRealtimeGrant } from './realtime-grant.js';

const FLOW_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow';
const VIDEO_SUBPROTOCOL = 'orikuro-stream-v1';
const AUDIO_SUBPROTOCOL = 'orikuro-audio-v1';
const COMMENT_SUBPROTOCOL = 'orikuro-comments-v1';
const MEDIA_MAGIC = 0x4f52494b;
const MEDIA_VERSION = 1;
const MEDIA_HEADER_BYTES = 44;
const MEDIA_KIND_VIDEO = 1;
const MEDIA_KIND_CONFIG = 2;
const MEDIA_FLAG_KEYFRAME = 1;
const AUDIO_MAGIC = 0x4f434155;
const AUDIO_VERSION = 1;
const AUDIO_FORMAT_F32P = 1;
const AUDIO_HEADER_BYTES = 32;
const AUDIO_FRAMES = 1024;
const MAX_AUDIO_BUFFERED_BYTES = 512 * 1024;
const MAX_VIDEO_BUFFERED_BYTES = 2 * 1024 * 1024;
const MAX_COMMENT_BYTES = 4096;
const MAX_RECONNECT_DELAY_MS = 2_000;
const WORKLET_URL = './assets/js/stream-audio-worklet.js?v=20260918-audio2';
const TARGET_WIDTH = 640;
const TARGET_HEIGHT = 360;
const TARGET_FPS = 5;
const FRAME_INTERVAL_MS = Math.round(1000 / TARGET_FPS);
const KEYFRAME_INTERVAL = TARGET_FPS * 2;
const H264_CODEC = 'avc1.42001E';
const encoderText = new TextEncoder();

type JsonObject = Record<string, unknown>;
type WorkletPacket = Readonly<{
  type: 'audio-packet';
  startFrame: number;
  sampleRate: number;
  frames: number;
  planes: Float32Array[];
}>;

let grant: StreamRealtimeGrant | null = null;
let pageStopping = false;
let streamWanted = false;
let selectedMode = 'radio';

let commentsSocket: WebSocket | null = null;
let commentsAuthenticated = false;
let commentsReconnectTimer: number | null = null;
let commentLastSequence = 0;
let commentReconnectAttempt = 0;

let audioSocket: WebSocket | null = null;
let audioReconnectTimer: number | null = null;
let audioReconnectAttempt = 0;
let audioAuthenticated = false;
let audioSequence = 0;
let audioStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let audioWorklet: AudioWorkletNode | null = null;
let silentGain: GainNode | null = null;
let audioPerfOriginMs = 0;
let streamStartedAtPerfMs = 0;

let videoSocket: WebSocket | null = null;
let videoStream: MediaStream | null = null;
let videoElement: HTMLVideoElement | null = null;
let videoCanvas: HTMLCanvasElement | null = null;
let videoContext: CanvasRenderingContext2D | null = null;
let videoEncoder: VideoEncoder | null = null;
let videoTimer: number | null = null;
let videoSequence = 0;
let videoFrameIndex = 0;
let videoStartedAt = 0;
let videoBackpressureUntil = 0;
let h264ParameterSets: Uint8Array | null = null;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function setText(selector: string, value: string): void {
  const target = document.querySelector<HTMLElement>(selector);
  if (target) target.textContent = value;
}

function startErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'マイクの使用が許可されていません。ブラウザのマイク許可を確認してください。';
    if (error.name === 'NotFoundError') return '使用できるマイクが見つかりません。';
    if (error.name === 'NotReadableError' || error.name === 'AbortError') return 'マイクを開始できません。ほかのアプリで使用中でないか確認してください。';
    if (error.name === 'SecurityError') return 'このブラウザではマイクを使用できません。';
  }
  const code = error instanceof Error ? error.message : '';
  if (code === 'AUDIO_CAPTURE_UNAVAILABLE') return 'このブラウザはマイク配信に対応していません。';
  if (code === 'WEBSOCKET_TIMEOUT') return '音声サーバーへの接続がタイムアウトしました。';
  return code ? `配信開始エラー: ${code}` : '配信を開始できませんでした。';
}

function validGrant(): StreamRealtimeGrant | null {
  const current = grant ?? getStreamRealtimeGrant();
  if (!current || current.expiresAt <= Date.now()) {
    grant = null;
    clearStreamRealtimeGrant();
    return null;
  }
  grant = current;
  return current;
}

function reconnectDelay(attempt: number): number {
  return Math.min(MAX_RECONNECT_DELAY_MS, 250 * (2 ** Math.min(attempt, 3)));
}

function parseText(raw: unknown): JsonObject | null {
  if (typeof raw !== 'string' || raw.length > 64_000) return null;
  try { return objectValue(JSON.parse(raw)); } catch { return null; }
}

function appendComment(raw: unknown): void {
  const message = objectValue(raw);
  if (!message) return;
  const sequence = message.sequence;
  const text = message.text;
  if (!Number.isSafeInteger(sequence) || Number(sequence) <= 0 || typeof text !== 'string' || text.length === 0) return;
  const n = Number(sequence);
  if (n <= commentLastSequence) return;
  commentLastSequence = n;
  const list = document.querySelector<HTMLOListElement>('[data-comment-list]');
  if (!list) return;
  const item = document.createElement('li');
  item.className = 'realtime-comment-item';
  const body = document.createElement('span');
  body.textContent = text;
  const seq = document.createElement('small');
  seq.textContent = `#${n}`;
  item.append(body, seq);
  list.append(item);
  list.scrollTop = list.scrollHeight;
}

function scheduleCommentsReconnect(): void {
  if (pageStopping || commentsReconnectTimer !== null || !validGrant()) return;
  const delay = reconnectDelay(commentReconnectAttempt++);
  commentsReconnectTimer = window.setTimeout(() => {
    commentsReconnectTimer = null;
    void connectComments();
  }, delay);
}

async function connectComments(): Promise<void> {
  const current = validGrant();
  if (!current || pageStopping) return;
  if (commentsSocket && (commentsSocket.readyState === WebSocket.OPEN || commentsSocket.readyState === WebSocket.CONNECTING)) return;
  commentsAuthenticated = false;
  const socket = new WebSocket(current.commentsWebSocketUrl, COMMENT_SUBPROTOCOL);
  commentsSocket = socket;
  socket.addEventListener('open', () => {
    if (socket !== commentsSocket) return;
    socket.send(JSON.stringify({ type: 'auth', streamId: current.streamId, capability: current.capability, lastSequence: commentLastSequence }));
  });
  socket.addEventListener('message', (event) => {
    if (socket !== commentsSocket) return;
    const payload = parseText(event.data);
    if (!payload || typeof payload.type !== 'string') return;
    if (payload.type === 'auth_ok') {
      commentsAuthenticated = true;
      commentReconnectAttempt = 0;
      setText('[data-comment-status]', 'コメント接続中');
    } else if (payload.type === 'comment') {
      appendComment(payload.message);
    }
  });
  socket.addEventListener('close', (event) => {
    if (socket !== commentsSocket) return;
    commentsSocket = null;
    commentsAuthenticated = false;
    if (!pageStopping && event.code !== 1008 && validGrant()) scheduleCommentsReconnect();
  });
}

function sendComment(text: string): void {
  const normalized = text.trim();
  if (!normalized) return;
  if (encoderText.encode(normalized).byteLength > MAX_COMMENT_BYTES) {
    setText('[data-comment-status]', 'コメントが長すぎます。');
    return;
  }
  if (!commentsSocket || commentsSocket.readyState !== WebSocket.OPEN || !commentsAuthenticated) {
    setText('[data-comment-status]', 'コメントへ再接続しています。');
    scheduleCommentsReconnect();
    return;
  }
  commentsSocket.send(JSON.stringify({ type: 'comment', text: normalized }));
}

function buildAudioPacket(packet: WorkletPacket): ArrayBuffer | null {
  if (
    !Number.isSafeInteger(packet.startFrame)
    || packet.startFrame < 0
    || !Number.isSafeInteger(packet.sampleRate)
    || packet.sampleRate <= 0
    || packet.frames !== AUDIO_FRAMES
    || !Array.isArray(packet.planes)
    || packet.planes.length < 1
    || packet.planes.length > 8
  ) return null;
  for (const plane of packet.planes) {
    if (!(plane instanceof Float32Array) || plane.length !== AUDIO_FRAMES) return null;
  }

  audioSequence = (audioSequence + 1) >>> 0;
  if (audioSequence === 0) audioSequence = 1;
  const payloadBytes = packet.planes.length * AUDIO_FRAMES * 4;
  const buffer = new ArrayBuffer(AUDIO_HEADER_BYTES + payloadBytes);
  const view = new DataView(buffer);
  view.setUint32(0, AUDIO_MAGIC, false);
  view.setUint8(4, AUDIO_VERSION);
  view.setUint8(5, packet.planes.length);
  view.setUint8(6, AUDIO_FORMAT_F32P);
  view.setUint8(7, 0);
  view.setUint32(8, packet.sampleRate, false);
  view.setUint16(12, AUDIO_FRAMES, false);
  view.setUint16(14, 0, false);
  view.setUint32(16, audioSequence, false);
  const packetPerfMs = audioPerfOriginMs + (packet.startFrame * 1000 / packet.sampleRate);
  const relativeNs = Math.max(0, Math.round((packetPerfMs - streamStartedAtPerfMs) * 1_000_000));
  view.setBigInt64(20, BigInt(relativeNs), false);
  view.setUint32(28, payloadBytes, false);

  let offset = AUDIO_HEADER_BYTES;
  for (const plane of packet.planes) {
    for (let i = 0; i < plane.length; i++) {
      const sample = Number.isFinite(plane[i]) ? Math.max(-1, Math.min(1, plane[i])) : 0;
      view.setFloat32(offset, sample, true);
      offset += 4;
    }
  }
  return buffer;
}

function sendAudioPacket(packet: WorkletPacket): void {
  if (!streamWanted || !audioAuthenticated || !audioSocket || audioSocket.readyState !== WebSocket.OPEN) return;
  if (audioSocket.bufferedAmount > MAX_AUDIO_BUFFERED_BYTES) {
    setText('[data-audio-status]', '音声通信が詰まったため停止します。');
    void stopStreaming(true);
    return;
  }
  const encoded = buildAudioPacket(packet);
  if (!encoded) {
    setText('[data-audio-status]', 'マイクデータを確認できません。');
    void stopStreaming(true);
    return;
  }
  audioSocket.send(encoded);
}

function waitOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('WEBSOCKET_TIMEOUT')), 10_000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WEBSOCKET_ERROR')); }, { once: true });
  });
}

async function connectAudio(current: StreamRealtimeGrant): Promise<void> {
  if (audioSocket && audioSocket.readyState < WebSocket.CLOSING) return;
  const socket = new WebSocket(current.audioWebSocketUrl, [AUDIO_SUBPROTOCOL, `bearer.${current.publisherCapability}`]);
  audioSocket = socket;
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (event) => {
    if (socket !== audioSocket) return;
    const payload = parseText(event.data);
    if (!payload) return;
    if (payload.type === 'audio_ack') {
      audioAuthenticated = true;
      setText('[data-audio-status]', 'マイク送信中');
      window.dispatchEvent(new CustomEvent('orikuro:audio-ready'));
    } else if (payload.type === 'audio_error') {
      setText('[data-audio-status]', typeof payload.code === 'string' ? `音声エラー: ${payload.code}` : '音声エラー');
      void stopStreaming(true);
    }
  });
  socket.addEventListener('close', () => {
    if (socket !== audioSocket) return;
    audioSocket = null;
    audioAuthenticated = false;
    if (streamWanted && !pageStopping) {
      setText('[data-audio-status]', '音声接続が終了しました。');
      void stopStreaming(true);
    }
  });
  await waitOpen(socket);
  audioAuthenticated = true;
}

async function startAudio(current: StreamRealtimeGrant): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
    throw new Error('AUDIO_CAPTURE_UNAVAILABLE');
  }
  audioSequence = 0;
  setText('[data-audio-status]', 'マイクの利用許可を確認しています。');
  const context = new AudioContext({ latencyHint: 'interactive' });
  audioContext = context;
  await context.resume();
  await context.audioWorklet.addModule(WORKLET_URL);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false,
  });
  audioStream = stream;
  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, 'orikuro-audio-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(worklet);
  worklet.connect(gain);
  gain.connect(context.destination);
  audioWorklet = worklet;
  silentGain = gain;
  audioPerfOriginMs = performance.now() - context.currentTime * 1000;
  worklet.port.onmessage = (event: MessageEvent<unknown>) => {
    const data = objectValue(event.data);
    if (!data || data.type !== 'audio-packet') return;
    sendAudioPacket(data as unknown as WorkletPacket);
  };
  await connectAudio(current);
}

function buildVideoPacket(kind: number, payload: Uint8Array, keyframe: boolean, ptsUs: number): ArrayBuffer {
  videoSequence = (videoSequence + 1) >>> 0;
  if (videoSequence === 0) videoSequence = 1;
  const buffer = new ArrayBuffer(MEDIA_HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, MEDIA_MAGIC, false);
  view.setUint8(4, MEDIA_VERSION);
  view.setUint8(5, kind);
  view.setUint16(6, keyframe ? MEDIA_FLAG_KEYFRAME : 0, false);
  view.setUint32(8, videoSequence, false);
  view.setUint16(12, 0, false);
  view.setUint16(14, 0, false);
  view.setUint32(16, 1, false);
  view.setUint32(20, 1_000_000, false);
  view.setBigInt64(24, BigInt(Math.max(0, Math.round(ptsUs))), false);
  view.setBigInt64(32, BigInt(Math.max(0, Math.round(ptsUs))), false);
  view.setUint32(40, payload.byteLength, false);
  new Uint8Array(buffer, MEDIA_HEADER_BYTES).set(payload);
  return buffer;
}

function annexBHasStartCode(bytes: Uint8Array): boolean {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) return true;
    if (i + 4 <= bytes.length && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) return true;
  }
  return false;
}

function parseAvcC(description: AllowSharedBufferSource): Uint8Array | null {
  const bytes = description instanceof ArrayBuffer
    ? new Uint8Array(description)
    : new Uint8Array(description.buffer, description.byteOffset, description.byteLength);
  if (bytes.length < 7 || bytes[0] !== 1) return null;
  let offset = 5;
  const countSps = bytes[offset++] & 31;
  const units: Uint8Array[] = [];
  for (let i = 0; i < countSps; i++) {
    if (offset + 2 > bytes.length) return null;
    const len = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
    if (len < 1 || offset + len > bytes.length) return null;
    units.push(bytes.slice(offset, offset + len));
    offset += len;
  }
  if (offset >= bytes.length) return null;
  const countPps = bytes[offset++];
  for (let i = 0; i < countPps; i++) {
    if (offset + 2 > bytes.length) return null;
    const len = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
    if (len < 1 || offset + len > bytes.length) return null;
    units.push(bytes.slice(offset, offset + len));
    offset += len;
  }
  if (units.length < 2) return null;
  const total = units.reduce((sum, unit) => sum + 4 + unit.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const unit of units) {
    out.set([0, 0, 0, 1], pos);
    pos += 4;
    out.set(unit, pos);
    pos += unit.byteLength;
  }
  return out;
}

function prependParameterSets(payload: Uint8Array): Uint8Array {
  if (!h264ParameterSets) return payload;
  const out = new Uint8Array(h264ParameterSets.byteLength + payload.byteLength);
  out.set(h264ParameterSets, 0);
  out.set(payload, h264ParameterSets.byteLength);
  return out;
}

async function supportedVideoConfig(): Promise<VideoEncoderConfig> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('WEBCODECS_H264_UNAVAILABLE');
  const config: VideoEncoderConfig = {
    codec: H264_CODEC,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    framerate: TARGET_FPS,
    bitrate: 800_000,
    latencyMode: 'realtime',
    avc: { format: 'annexb' },
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error('H264_ANNEXB_UNSUPPORTED');
  return support.config ?? config;
}

function handleVideoControl(raw: unknown): void {
  const payload = parseText(raw);
  if (!payload || typeof payload.type !== 'string') return;
  if (payload.type === 'ack') {
    setText('[data-stream-state="output"]', '送出中');
    window.dispatchEvent(new CustomEvent('orikuro:output-ready'));
    return;
  }
  if (payload.type === 'backpressure') {
    videoBackpressureUntil = Date.now() + 1_000;
    setText('[data-stream-state="output"]', '混雑待機');
    return;
  }
  if (payload.type === 'ready') {
    window.dispatchEvent(new CustomEvent('orikuro:transport-ready'));
    return;
  }
  if (payload.type === 'session_warning') {
    setText('[data-realtime-status]', typeof payload.message === 'string' ? payload.message : 'そろそろ終了します');
    return;
  }
  if (payload.type === 'session_ended') {
    window.dispatchEvent(new CustomEvent('orikuro:stream-ended', { detail: { reason: payload.reason ?? 'ended' } }));
    return;
  }
  if (payload.type === 'downstream_unavailable' || payload.type === 'downstream_disconnected' || payload.type === 'fatal') {
    setText('[data-stream-state="output"]', '送出停止');
    void stopStreaming(true);
  }
}

async function connectVideo(current: StreamRealtimeGrant): Promise<void> {
  const socket = new WebSocket(current.cloudflareWebSocketUrl, [VIDEO_SUBPROTOCOL, `bearer.${current.publisherCapability}`]);
  socket.binaryType = 'arraybuffer';
  videoSocket = socket;
  socket.addEventListener('message', (event) => {
    if (socket === videoSocket && typeof event.data === 'string') handleVideoControl(event.data);
  });
  socket.addEventListener('close', () => {
    if (socket !== videoSocket) return;
    videoSocket = null;
    if (streamWanted && selectedMode === 'standing' && !pageStopping) {
      setText('[data-stream-state="output"]', '接続終了');
      void stopStreaming(true);
    }
  });
  await waitOpen(socket);
  window.dispatchEvent(new CustomEvent('orikuro:transport-ready'));
}

function createEncoder(config: VideoEncoderConfig): void {
  h264ParameterSets = null;
  videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const socket = videoSocket;
      if (!streamWanted || !socket || socket.readyState !== WebSocket.OPEN) return;
      if (metadata?.decoderConfig?.description) {
        const parsed = parseAvcC(metadata.decoderConfig.description);
        if (parsed) h264ParameterSets = parsed;
      }
      const payload = new Uint8Array(chunk.byteLength);
      chunk.copyTo(payload);
      if (!annexBHasStartCode(payload)) {
        setText('[data-stream-state="output"]', 'H.264形式エラー');
        void stopStreaming(true);
        return;
      }
      if (socket.bufferedAmount > MAX_VIDEO_BUFFERED_BYTES) {
        setText('[data-stream-state="output"]', '送出混雑');
        void stopStreaming(true);
        return;
      }
      const keyframe = chunk.type === 'key';
      const wirePayload = keyframe ? prependParameterSets(payload) : payload;
      socket.send(buildVideoPacket(MEDIA_KIND_VIDEO, wirePayload, keyframe, chunk.timestamp));
    },
    error: () => {
      setText('[data-stream-state="output"]', '映像エンコードエラー');
      void stopStreaming(true);
    },
  });
  videoEncoder.configure(config);
}

function encodeVideoFrame(): void {
  if (
    !streamWanted
    || selectedMode !== 'standing'
    || Date.now() < videoBackpressureUntil
    || !videoEncoder
    || videoEncoder.state !== 'configured'
    || !videoElement
    || !videoCanvas
    || !videoContext
  ) return;
  if (videoEncoder.encodeQueueSize > 2) return;
  videoContext.drawImage(videoElement, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  const timestampUs = Math.max(0, Math.round((performance.now() - videoStartedAt) * 1000));
  const frame = new VideoFrame(videoCanvas, { timestamp: timestampUs });
  try {
    const keyFrame = videoFrameIndex % KEYFRAME_INTERVAL === 0;
    videoEncoder.encode(frame, { keyFrame });
    videoFrameIndex += 1;
  } finally {
    frame.close();
  }
}

async function startVideo(current: StreamRealtimeGrant): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNAVAILABLE');
  const config = await supportedVideoConfig();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: TARGET_WIDTH },
      height: { ideal: TARGET_HEIGHT },
      frameRate: { ideal: TARGET_FPS, max: 10 },
    },
    audio: false,
  });
  videoStream = stream;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  videoElement = video;
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context) throw new Error('VIDEO_CANVAS_UNAVAILABLE');
  videoCanvas = canvas;
  videoContext = context;

  await connectVideo(current);
  videoSequence = 0;
  videoFrameIndex = 0;
  videoStartedAt = streamStartedAtPerfMs;
  const configPayload = encoderText.encode(JSON.stringify({
    codec: 'h264-annexb',
    profile: H264_CODEC,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    fps: TARGET_FPS,
    keyframeIntervalFrames: KEYFRAME_INTERVAL,
    staging: true,
  }));
  videoSocket?.send(buildVideoPacket(MEDIA_KIND_CONFIG, configPayload, false, 0));
  createEncoder(config);
  encodeVideoFrame();
  videoTimer = window.setInterval(encodeVideoFrame, FRAME_INTERVAL_MS);
  window.dispatchEvent(new CustomEvent('orikuro:composition-ready'));
}

async function requestServerStop(keepalive = false): Promise<void> {
  const current = grant;
  if (!current) return;
  try {
    await fetch(FLOW_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'stream_stop',
        streamId: current.streamId,
        controlCapability: current.controlCapability,
      }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      keepalive,
    });
  } catch {}
}

async function startStreaming(mode: string): Promise<void> {
  if (streamWanted) return;
  const current = validGrant();
  if (!current) {
    setText('[data-realtime-status]', '配信接続情報を確認できません。');
    return;
  }
  selectedMode = mode === 'standing' ? 'standing' : 'radio';
  if (selectedMode === 'standing') {
    setText('[data-realtime-status]', '2.5D Character Engine 入力経路を確認中です。');
    window.dispatchEvent(new CustomEvent('orikuro:standing-engine-required'));
    return;
  }
  streamStartedAtPerfMs = performance.now();
  streamWanted = true;
  setText('[data-realtime-status]', '配信開始処理中');
  try {
    await startAudio(current);
    window.dispatchEvent(new CustomEvent('orikuro:stream-live'));
    setText('[data-stream-state="output"]', '音声テスト中');
  } catch (error) {
    const message = startErrorMessage(error);
    setText('[data-realtime-status]', message);
    await stopStreaming(false);
    window.dispatchEvent(new CustomEvent('orikuro:stream-start-failed', { detail: { message } }));
  }
}

async function stopStreaming(notifyServer: boolean): Promise<void> {
  const wasActive = streamWanted;
  streamWanted = false;

  if (videoTimer !== null) { clearInterval(videoTimer); videoTimer = null; }
  if (videoEncoder) {
    try { videoEncoder.close(); } catch {}
    videoEncoder = null;
  }
  h264ParameterSets = null;
  if (videoSocket) {
    try { videoSocket.close(1000, 'publisher stop'); } catch {}
    videoSocket = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }
  videoCanvas = null;
  videoContext = null;

  if (audioWorklet) {
    audioWorklet.port.onmessage = null;
    try { audioWorklet.disconnect(); } catch {}
    audioWorklet = null;
  }
  if (silentGain) {
    try { silentGain.disconnect(); } catch {}
    silentGain = null;
  }
  if (audioSocket) {
    try { audioSocket.close(1000, 'audio stopped'); } catch {}
    audioSocket = null;
  }
  audioAuthenticated = false;
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }
  if (audioContext) {
    await audioContext.close().catch(() => undefined);
    audioContext = null;
  }
  if (notifyServer && wasActive) await requestServerStop();
  setText('[data-audio-status]', '待機中');
  setText('[data-stream-state="output"]', '待機中');
}

function bindUI(): void {
  const stop = document.querySelector<HTMLButtonElement>('[data-audio-stop]');
  const form = document.querySelector<HTMLFormElement>('[data-comment-form]');
  const input = document.querySelector<HTMLInputElement>('[data-comment-input]');
  stop?.addEventListener('click', () => { void stopStreaming(true); });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input) {
      sendComment(input.value);
      input.value = '';
    }
  });
  window.addEventListener('orikuro:stream-start-request', (event) => {
    const detail = objectValue((event as CustomEvent).detail);
    const mode = typeof detail?.mode === 'string' ? detail.mode : 'radio';
    void startStreaming(mode);
  });
}

async function startRealtime(): Promise<void> {
  if (pageStopping) return;
  grant = getStreamRealtimeGrant();
  if (!grant) {
    setText('[data-realtime-status]', 'リアルタイム接続情報を確認できません。');
    return;
  }
  setText('[data-realtime-status]', 'リアルタイム処理を準備しています。');
  bindUI();
  await connectComments();
  setText('[data-realtime-status]', '配信開始できます。');
}

function serviceReady(): boolean {
  const content = document.querySelector<HTMLElement>('[data-service-content]');
  return !!content && content.hidden === false;
}

function shutdown(): void {
  pageStopping = true;
  if (commentsReconnectTimer !== null) clearTimeout(commentsReconnectTimer);
  if (audioReconnectTimer !== null) clearTimeout(audioReconnectTimer);
  commentsReconnectTimer = null;
  audioReconnectTimer = null;
  if (commentsSocket && commentsSocket.readyState < WebSocket.CLOSING) commentsSocket.close(1000, 'page closed');
  commentsSocket = null;
  void stopStreaming(false);
  if (grant) void requestServerStop(true);
  clearStreamRealtimeGrant();
}

document.addEventListener('orikuro:service-ready', () => { void startRealtime(); }, { once: true });
if (serviceReady()) void startRealtime();
window.addEventListener('pagehide', shutdown, { once: true });
