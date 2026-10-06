import { clearStreamRealtimeGrant, getStreamRealtimeGrant, type StreamRealtimeGrant } from './realtime-grant.js';

const FLOW_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow';
const LIVE_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-live';
const VIDEO_SUBPROTOCOL = 'orikuro-stream-v1';
const AUDIO_SUBPROTOCOL = 'orikuro-audio-v1';
const COMMENT_SUBPROTOCOL = 'orikuro-comments-v1';
const MONITOR_SUBPROTOCOL = 'orikuro-media-v1';
const LISTENER_WIRE_MAGIC = 0x4f435650;
const LISTENER_WIRE_VERSION = 1;
const LISTENER_WIRE_HEADER_BYTES = 52;
const LISTENER_KIND_AUDIO = 2;
const LISTENER_AUDIO_MAGIC = 0x4f415031;
const LISTENER_AUDIO_VERSION = 1;
const LISTENER_AUDIO_HEADER_BYTES = 16;
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
const AUDIO_ACK_TIMEOUT_MS = 5_000;
const AUDIO_LISTENER_TIMEOUT_MS = 7_000;
const AUDIO_METER_INTERVAL_MS = 80;
const WORKLET_URL = './assets/js/stream-audio-worklet.js?v=20260919-audio3';
const LISTENER_KIND_VIDEO = 1;
const CONTROL_RECONNECT_MAX_MS = 4_000;
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
let liveTransmission = false;
let realtimePrepared = false;
let commonPrepared = false;
let commonPreparePromise: Promise<void> | null = null;
let preparationRequestedMode: string | null = null;
let preparePromise: Promise<void> | null = null;
let serverLivePromise: Promise<boolean> | null = null;
let selectedMode = 'radio';
let selectedAudioInputDeviceId = '';
let liveAudioSwitchInProgress = false;

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
let audioRuntimePromise: Promise<AudioContext> | null = null;
let audioSource: MediaStreamAudioSourceNode | null = null;
let audioWorklet: AudioWorkletNode | null = null;
let silentGain: GainNode | null = null;
let audioPerfOriginMs = 0;
let streamStartedAtPerfMs = 0;
let lastAudioMeterEmitMs = 0;
let audioPathAcknowledged = false;
let monitorSocket: WebSocket | null = null;
let monitorReconnectTimer: number | null = null;
let monitorReconnectAttempt = 0;
let monitorLastCursor = 0;
let stopPromise: Promise<boolean> | null = null;
let serverStopPromise: Promise<boolean> | null = null;
let serverStopped = false;
let uiBound = false;

// Cloudflare publisher socket: Tracking (face_region_v1) and ACT
// (cartoon_act_v1) inputs only. The browser never renders or encodes the
// stream picture: Cloudflare composes it and Northflank delivers it; the
// preview below decodes Northflank's own output.
let videoSocket: WebSocket | null = null;
let controlReconnectTimer: number | null = null;
let controlReconnectAttempt = 0;
let standingVideoPreparePromise: Promise<void> | null = null;
let actSequence = 0;
let previewDecoder: VideoDecoder | null = null;
let previewDecoderCodec = '';
let previewNeedsKeyframe = true;
let previewPendingFrame: VideoFrame | null = null;
let previewRaf = 0;
let previewFrames = 0;
let lastSceneForwarded = -1;
type FaceRegionControl = Readonly<{type:'face_region_v1';frameId:number;timestampNS:number;present:boolean;centerX:number;centerY:number;size:number;angleRad:number;confidence:number;}>;
let lastFaceRegionFrameId=0;
let lastFaceRegionTimestampNS=0;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function setText(selector: string, value: string): void {
  const target = document.querySelector<HTMLElement>(selector);
  if (target) target.textContent = value;
}

type PreparedAudioWindow = Window & {
  __orikuroPreparedAudioStream?: MediaStream | null;
};

function preparedAudioStreamAvailable(): boolean {
  const stream = (window as PreparedAudioWindow).__orikuroPreparedAudioStream;
  const track = stream?.getAudioTracks()[0];
  return !!track && track.readyState === 'live';
}

function takePreparedAudioStream(): MediaStream {
  const holder = window as PreparedAudioWindow;
  const stream = holder.__orikuroPreparedAudioStream;
  const track = stream?.getAudioTracks()[0];
  if (!stream || !track || track.readyState !== 'live') throw new Error('AUDIO_PREPARED_STREAM_MISSING');
  holder.__orikuroPreparedAudioStream = null;
  track.enabled = true;
  return stream;
}

async function ensureAudioRuntime(): Promise<AudioContext> {
  if (audioContext && audioContext.state !== 'closed') {
    if (audioContext.state === 'suspended') await audioContext.resume();
    return audioContext;
  }
  if (audioRuntimePromise) return await audioRuntimePromise;
  if (typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
    throw new Error('AUDIO_CAPTURE_UNAVAILABLE');
  }

  audioRuntimePromise = (async () => {
    const context = new AudioContext({ latencyHint: 'interactive' });
    audioContext = context;
    await context.resume();
    await context.audioWorklet.addModule(WORKLET_URL);
    return context;
  })();

  try {
    return await audioRuntimePromise;
  } catch (error) {
    if (audioContext) {
      const failed = audioContext;
      audioContext = null;
      void failed.close().catch(() => undefined);
    }
    throw error;
  } finally {
    audioRuntimePromise = null;
  }
}

async function resetAudioCaptureGraph(closeContext = false): Promise<void> {
  if (audioWorklet) {
    audioWorklet.port.onmessage = null;
    try { audioWorklet.disconnect(); } catch {}
    audioWorklet = null;
  }
  if (audioSource) {
    try { audioSource.disconnect(); } catch {}
    audioSource = null;
  }
  if (silentGain) {
    try { silentGain.disconnect(); } catch {}
    silentGain = null;
  }
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }
  if (closeContext && audioContext) {
    const context = audioContext;
    audioContext = null;
    await context.close().catch(() => undefined);
  }
}

function startErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'マイクの使用が許可されていません。ブラウザのマイク許可を確認してください。';
    if (error.name === 'NotFoundError') return '使用できるマイクが見つかりません。';
    if (error.name === 'NotReadableError' || error.name === 'AbortError') return 'マイクを開始できません。ほかのアプリで使用中でないか確認してください。';
    if (error.name === 'SecurityError') return 'このブラウザではマイクを使用できません。';
    if (error.name === 'OverconstrainedError') return '選択したマイクを使用できません。機材を確認し直してください。';
  }
  const code = error instanceof Error ? error.message : '';
  if (code === 'AUDIO_CAPTURE_UNAVAILABLE') return 'このブラウザはマイク配信に対応していません。';
  if (code === 'AUDIO_PREPARED_STREAM_MISSING') return '事前に準備したマイク入力を使用できません。配信形式を選び直してください。';
  if (code === 'WEBSOCKET_TIMEOUT') return '音声サーバーへの接続がタイムアウトしました。';
  if (code === 'AUDIO_DELIVERY_ACK_TIMEOUT') return '音声サーバーへの到達確認がタイムアウトしました。';
  if (code === 'AUDIO_LISTENER_PATH_TIMEOUT') return 'リスナー側の音声配信経路まで届いたことを確認できませんでした。';
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

function clearCommentDemo(): void {
  document.querySelectorAll<HTMLElement>('[data-comment-demo]').forEach((item) => item.remove());
}

function appendComment(raw: unknown): void {
  const message = objectValue(raw);
  if (!message) return;

  const sequence = message.sequence;
  if (!Number.isSafeInteger(sequence) || Number(sequence) <= 0) return;
  const n = Number(sequence);
  if (n <= commentLastSequence) return;

  const rawKind = typeof message.kind === 'string' ? message.kind : 'comment';
  const kind = rawKind === 'gift' || rawKind === 'fan_level_up' || rawKind === 'superchat' ? rawKind : 'comment';

  const candidateName = typeof message.displayName === 'string'
    ? message.displayName
    : typeof message.userName === 'string'
      ? message.userName
      : '';
  const displayName = candidateName.trim().slice(0, 80) || 'リスナー';

  const list = document.querySelector<HTMLOListElement>('[data-comment-list]');
  if (!list) return;
  clearCommentDemo();

  const item = document.createElement('li');
  item.className = 'realtime-comment-item';
  item.dataset.feedKind = kind;

  if (kind === 'comment') {
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (!text) return;
    const name = document.createElement('strong');
    name.className = 'realtime-comment-name';
    name.textContent = displayName;
    const body = document.createElement('span');
    body.className = 'realtime-comment-text';
    body.textContent = text;
    item.append(name, body);
  } else {
    const system = document.createElement('span');
    system.className = 'realtime-system-text';

    if (kind === 'gift') {
      const giftName = typeof message.giftName === 'string' ? message.giftName.trim().slice(0, 80) : '';
      system.textContent = `${displayName}が「${giftName || 'ギフト'}」を投げました`;
    } else if (kind === 'fan_level_up') {
      const level = Number(message.fanLevel ?? message.level);
      system.textContent = Number.isInteger(level) && level > 0 && level <= 99
        ? `${displayName}のファンレベルがLv.${level}に上がりました`
        : `${displayName}のファンレベルが上がりました`;
    } else {
      const amount = Number(message.amount);
      system.textContent = Number.isSafeInteger(amount) && amount > 0
        ? `${displayName}がスパチャ ${amount.toLocaleString('ja-JP')}pt を送りました`
        : `${displayName}がスパチャを送りました`;
    }
    item.append(system);
  }

  commentLastSequence = n;
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
  if (!streamWanted || !liveTransmission || !audioAuthenticated || !audioSocket || audioSocket.readyState !== WebSocket.OPEN) return;
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

type ListenerAudio = Readonly<{ channels: number; frames: number; planes: Float32Array[] }>;

function parseListenerAudio(raw: ArrayBuffer): { cursor: number; sequence: number; audio: ListenerAudio } | null {
  if (raw.byteLength < LISTENER_WIRE_HEADER_BYTES) return null;
  const wire = new DataView(raw);
  if (
    wire.getUint32(0, false) !== LISTENER_WIRE_MAGIC
    || wire.getUint8(4) !== LISTENER_WIRE_VERSION
    || wire.getUint8(5) !== LISTENER_KIND_AUDIO
    || wire.getUint16(18, false) !== 0
  ) return null;
  const cursorBig = wire.getBigUint64(8, false);
  if (cursorBig === 0n || cursorBig > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const payloadBytes = wire.getUint32(48, false);
  if (payloadBytes < LISTENER_AUDIO_HEADER_BYTES || LISTENER_WIRE_HEADER_BYTES + payloadBytes !== raw.byteLength) return null;

  const payloadOffset = LISTENER_WIRE_HEADER_BYTES;
  const audio = new DataView(raw, payloadOffset, payloadBytes);
  if (
    audio.getUint32(0, false) !== LISTENER_AUDIO_MAGIC
    || audio.getUint8(4) !== LISTENER_AUDIO_VERSION
    || audio.getUint8(6) !== 0
    || audio.getUint8(7) !== 0
  ) return null;
  const channels = audio.getUint8(5);
  const frames = audio.getUint32(12, false);
  if (channels < 1 || channels > 8 || frames < 1 || frames > 4096) return null;
  if (LISTENER_AUDIO_HEADER_BYTES + channels * frames * 4 !== payloadBytes) return null;

  const planes: Float32Array[] = [];
  let offset = LISTENER_AUDIO_HEADER_BYTES;
  for (let ch = 0; ch < channels; ch++) {
    const plane = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame++) {
      const sample = audio.getFloat32(offset, false);
      if (!Number.isFinite(sample)) return null;
      plane[frame] = sample;
      offset += 4;
    }
    planes.push(plane);
  }
  return {
    cursor: Number(cursorBig),
    sequence: wire.getUint32(44, false),
    audio: { channels, frames, planes },
  };
}

function listenerMeterLevel(audio: ListenerAudio): number {
  let sum = 0;
  let count = 0;
  for (const plane of audio.planes) {
    for (let i = 0; i < plane.length; i++) {
      const sample = Math.max(-1, Math.min(1, plane[i]));
      sum += sample * sample;
      count++;
    }
  }
  if (count === 0) return 0;
  const rms = Math.sqrt(sum / count);
  const db = 20 * Math.log10(Math.max(rms, 0.00001));
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

function emitListenerMeter(audio: ListenerAudio, sequence: number, cursor: number): void {
  const now = performance.now();
  if (now - lastAudioMeterEmitMs < AUDIO_METER_INTERVAL_MS) return;
  lastAudioMeterEmitMs = now;
  window.dispatchEvent(new CustomEvent('orikuro:audio-meter', {
    detail: {
      level: listenerMeterLevel(audio),
      sequence,
      cursor,
      pathAcknowledged: true,
      source: 'listener-delivery',
    },
  }));
}

// Publisher preview: decodes the H.264 the viewers receive from Northflank
// (Cloudflare composite -> Northflank encode) and draws it into the preview
// canvases. This is the only picture the publisher UI shows.
function previewCanvases(): HTMLCanvasElement[] {
  return Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-scene-preview-canvas]'));
}

function resetPreviewDecoder(): void {
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
  previewPendingFrame?.close();
  previewPendingFrame = null;
  if (previewDecoder && previewDecoder.state !== 'closed') { try { previewDecoder.close(); } catch {} }
  previewDecoder = null;
  previewDecoderCodec = '';
  previewNeedsKeyframe = true;
}

function annexBUnits(bytes: Uint8Array): Uint8Array[] {
  const units: Uint8Array[] = [];
  let i = 0, start = -1;
  while (i + 3 <= bytes.length) {
    const sc4 = i + 4 <= bytes.length && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1;
    const sc3 = bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1;
    if (sc4 || sc3) {
      if (start >= 0) units.push(bytes.subarray(start, i));
      i += sc4 ? 4 : 3;
      start = i;
      continue;
    }
    i++;
  }
  if (start >= 0 && start < bytes.length) units.push(bytes.subarray(start));
  return units;
}

function avcCodec(bytes: Uint8Array): string | null {
  const sps = annexBUnits(bytes).find((unit) => unit.length >= 4 && (unit[0] & 31) === 7);
  if (!sps) return null;
  return 'avc1.' + [sps[1], sps[2], sps[3]].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function drawPreviewFrame(): void {
  previewRaf = 0;
  const frame = previewPendingFrame;
  previewPendingFrame = null;
  if (!frame) return;
  try {
    for (const canvas of previewCanvases()) {
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
      }
      canvas.getContext('2d')?.drawImage(frame, 0, 0, canvas.width, canvas.height);
    }
    previewFrames++;
    if (previewFrames === 1 || previewFrames % 30 === 0) {
      window.dispatchEvent(new CustomEvent('orikuro:scene-preview-frame', { detail: { frames: previewFrames, width: frame.displayWidth, height: frame.displayHeight } }));
    }
  } finally { frame.close(); }
}

function handlePreviewVideo(raw: ArrayBuffer): void {
  if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') return;
  if (raw.byteLength <= LISTENER_WIRE_HEADER_BYTES) return;
  const wire = new DataView(raw);
  if (wire.getUint32(0, false) !== LISTENER_WIRE_MAGIC || wire.getUint8(4) !== LISTENER_WIRE_VERSION || wire.getUint8(5) !== LISTENER_KIND_VIDEO) return;
  const payloadBytes = wire.getUint32(48, false);
  if (LISTENER_WIRE_HEADER_BYTES + payloadBytes !== raw.byteLength) return;
  const keyframe = (wire.getUint16(6, false) & 1) === 1;
  const num = wire.getUint32(20, false), den = wire.getUint32(24, false);
  if (!num || !den) return;
  const pts = Number(wire.getBigInt64(28, false));
  const timestamp = Math.max(0, Math.round(pts * num * 1_000_000 / den));
  const payload = new Uint8Array(raw, LISTENER_WIRE_HEADER_BYTES, payloadBytes);
  if (keyframe) {
    const codec = avcCodec(payload);
    if (!codec) return;
    if (!previewDecoder || previewDecoder.state === 'closed' || codec !== previewDecoderCodec) {
      resetPreviewDecoder();
      try {
        previewDecoder = new VideoDecoder({
          output: (frame) => {
            previewPendingFrame?.close();
            previewPendingFrame = frame;
            if (!previewRaf) previewRaf = requestAnimationFrame(drawPreviewFrame);
          },
          error: () => { resetPreviewDecoder(); },
        });
        previewDecoder.configure({ codec, optimizeForLatency: true });
        previewDecoderCodec = codec;
      } catch { resetPreviewDecoder(); return; }
    }
    previewNeedsKeyframe = false;
  }
  if (previewNeedsKeyframe || !previewDecoder || previewDecoder.state !== 'configured') return;
  if (previewDecoder.decodeQueueSize > 6) { previewNeedsKeyframe = true; return; }
  try {
    previewDecoder.decode(new EncodedVideoChunk({ type: keyframe ? 'key' : 'delta', timestamp, data: payload }));
  } catch { previewNeedsKeyframe = true; }
}

function scheduleMonitorReconnect(): void {
  if (pageStopping || !streamWanted || monitorReconnectTimer !== null || !validGrant()) return;
  const delay = reconnectDelay(monitorReconnectAttempt++);
  monitorReconnectTimer = window.setTimeout(() => {
    monitorReconnectTimer = null;
    const current = validGrant();
    if (current) void connectDeliveryMonitor(current, false).catch(() => undefined);
  }, delay);
}

async function connectDeliveryMonitor(current: StreamRealtimeGrant, waitForFirstAudio = true): Promise<void> {
  if (monitorSocket && monitorSocket.readyState < WebSocket.CLOSING) return;
  audioPathAcknowledged = false;
  window.dispatchEvent(new CustomEvent('orikuro:audio-path-waiting'));

  let firstResolve: (() => void) | null = null;
  let firstReject: ((error: Error) => void) | null = null;
  let firstSettled = !waitForFirstAudio;
  const firstAudio = waitForFirstAudio ? new Promise<void>((resolve, reject) => {
    firstResolve = resolve;
    firstReject = reject;
  }) : Promise.resolve();

  const timeout = waitForFirstAudio ? window.setTimeout(() => {
    if (firstSettled) return;
    firstSettled = true;
    firstReject?.(new Error('AUDIO_LISTENER_PATH_TIMEOUT'));
  }, AUDIO_LISTENER_TIMEOUT_MS) : null;

  const settleFirst = (error: Error | null = null): void => {
    if (firstSettled) return;
    firstSettled = true;
    if (timeout !== null) clearTimeout(timeout);
    if (error) firstReject?.(error);
    else firstResolve?.();
  };

  const socket = new WebSocket(current.mediaWebSocketUrl, MONITOR_SUBPROTOCOL);
  monitorSocket = socket;
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    if (socket !== monitorSocket) return;
    socket.send(JSON.stringify({
      type: 'auth',
      token: current.monitorCapability,
      streamId: current.streamId,
      after: monitorLastCursor,
    }));
  });

  socket.addEventListener('message', (event) => {
    if (socket !== monitorSocket) return;
    if (typeof event.data === 'string') {
      const payload = parseText(event.data);
      if (!payload || typeof payload.type !== 'string') {
        socket.close(1008, 'invalid monitor control');
        return;
      }
      if (payload.type === 'media_ready') {
        monitorReconnectAttempt = 0;
        return;
      }
      if (payload.type === 'media_ended') {
        settleFirst(new Error('AUDIO_LISTENER_PATH_ENDED'));
        window.dispatchEvent(new CustomEvent('orikuro:audio-meter-reset'));
        return;
      }
      if (payload.type === 'pong') return;
      socket.close(1008, 'unsupported monitor control');
      return;
    }
    if (!(event.data instanceof ArrayBuffer)) {
      socket.close(1008, 'invalid monitor media');
      return;
    }
    if (event.data.byteLength > 5 && new DataView(event.data).getUint8(5) === LISTENER_KIND_VIDEO) {
      handlePreviewVideo(event.data);
      return;
    }
    const packet = parseListenerAudio(event.data);
    if (!packet) return;
    monitorLastCursor = Math.max(monitorLastCursor, packet.cursor);
    if (!audioPathAcknowledged) {
      audioPathAcknowledged = true;
      window.dispatchEvent(new CustomEvent('orikuro:audio-path-ready'));
    }
    emitListenerMeter(packet.audio, packet.sequence, packet.cursor);
    settleFirst();
  });

  socket.addEventListener('close', (event) => {
    if (socket !== monitorSocket) return;
    monitorSocket = null;
    audioPathAcknowledged = false;
    window.dispatchEvent(new CustomEvent('orikuro:audio-meter-reset'));
    if (!firstSettled) settleFirst(new Error('AUDIO_LISTENER_PATH_CLOSED'));
    if (!pageStopping && streamWanted && event.code !== 1008 && validGrant()) scheduleMonitorReconnect();
  });
  socket.addEventListener('error', () => {
    if (socket !== monitorSocket) return;
    if (!firstSettled) settleFirst(new Error('AUDIO_LISTENER_PATH_ERROR'));
  });

  await waitOpen(socket);
  await firstAudio;
}

async function connectAudio(current: StreamRealtimeGrant, waitForAck = true): Promise<void> {
  if (audioSocket && audioSocket.readyState === WebSocket.OPEN) {
    audioAuthenticated = true;
    return;
  }
  if (audioSocket && audioSocket.readyState === WebSocket.CONNECTING) {
    await waitOpen(audioSocket);
    audioAuthenticated = true;
    return;
  }
  audioPathAcknowledged = false;

  let ackResolve: (() => void) | null = null;
  let ackReject: ((error: Error) => void) | null = null;
  let ackSettled = !waitForAck;
  const ackPromise = waitForAck ? new Promise<void>((resolve, reject) => {
    ackResolve = resolve;
    ackReject = reject;
  }) : Promise.resolve();
  const ackTimer = waitForAck ? window.setTimeout(() => {
    if (ackSettled) return;
    ackSettled = true;
    ackReject?.(new Error('AUDIO_DELIVERY_ACK_TIMEOUT'));
  }, AUDIO_ACK_TIMEOUT_MS) : null;

  const settleAck = (error: Error | null = null): void => {
    if (ackSettled) return;
    ackSettled = true;
    if (ackTimer !== null) clearTimeout(ackTimer);
    if (error) ackReject?.(error);
    else ackResolve?.();
  };

  const socket = new WebSocket(current.audioWebSocketUrl, [AUDIO_SUBPROTOCOL, `bearer.${current.publisherCapability}`]);
  audioSocket = socket;
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (event) => {
    if (socket !== audioSocket) return;
    const payload = parseText(event.data);
    if (!payload) return;
    if (payload.type === 'audio_ack') {
      audioAuthenticated = true;
      settleAck();
      setText('[data-audio-status]', 'マイク送信中');
      window.dispatchEvent(new CustomEvent('orikuro:audio-ready'));
    } else if (payload.type === 'audio_error') {
      const code = typeof payload.code === 'string' ? payload.code : 'AUDIO_ERROR';
      settleAck(new Error(code));
      setText('[data-audio-status]', `音声エラー: ${code}`);
      void stopStreaming(true);
    }
  });
  socket.addEventListener('close', () => {
    if (socket !== audioSocket) return;
    audioSocket = null;
    audioAuthenticated = false;
    settleAck(new Error('AUDIO_SOCKET_CLOSED'));
    if (streamWanted && !pageStopping) {
      setText('[data-audio-status]', '音声接続が終了しました。');
      void stopStreaming(true);
    }
  });
  await waitOpen(socket);
  audioAuthenticated = true;
  await ackPromise;
}

async function prepareAudio(current: StreamRealtimeGrant): Promise<void> {
  audioSequence = 0;
  setText('[data-audio-status]', '音声経路を準備しています。');
  const context = await ensureAudioRuntime();
  const stream = takePreparedAudioStream();
  audioStream = stream;
  const activeTrack = stream.getAudioTracks()[0];

  window.dispatchEvent(new CustomEvent('orikuro:audio-device-active', {
    detail: {
      deviceId: activeTrack?.getSettings().deviceId ?? selectedAudioInputDeviceId,
      label: activeTrack?.label ?? '',
    },
  }));

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
  audioSource = source;
  audioWorklet = worklet;
  silentGain = gain;
  audioPerfOriginMs = performance.now() - context.currentTime * 1000;
  worklet.port.onmessage = (event: MessageEvent<unknown>) => {
    const data = objectValue(event.data);
    if (!data || data.type !== 'audio-packet') return;
    sendAudioPacket(data as unknown as WorkletPacket);
  };

  await Promise.all([
    connectDeliveryMonitor(current, false),
    connectAudio(current, false),
  ]);
  setText('[data-audio-status]', '開始待機中');
}

async function prefetchAudioWorklet(): Promise<void> {
  try {
    const response = await fetch(WORKLET_URL, {
      method: 'GET',
      cache: 'force-cache',
      credentials: 'same-origin',
    });
    try { await response.body?.cancel(); } catch {}
  } catch {}
}

async function prepareCommonStreaming(): Promise<void> {
  if (pageStopping || commonPrepared) return;
  if (commonPreparePromise) {
    await commonPreparePromise;
    return;
  }
  const current = validGrant();
  if (!current) return;

  window.dispatchEvent(new CustomEvent('orikuro:stream-common-preparing'));
  commonPreparePromise = (async () => {
    await Promise.all([
      connectComments(),
      connectDeliveryMonitor(current, false),
      connectAudio(current, false),
      prefetchAudioWorklet(),
    ]);
    commonPrepared = true;
    window.dispatchEvent(new CustomEvent('orikuro:stream-common-prepared'));
  })();

  try {
    await commonPreparePromise;
  } catch (error) {
    commonPrepared = false;
    window.dispatchEvent(new CustomEvent('orikuro:stream-common-prepare-failed', {
      detail: { message: startErrorMessage(error) },
    }));
  } finally {
    commonPreparePromise = null;
  }
}

function releaseStandingVideoStandby(): void {
  standingVideoPreparePromise = null;
  if (controlReconnectTimer !== null) { clearTimeout(controlReconnectTimer); controlReconnectTimer = null; }
  if (videoSocket) {
    try { videoSocket.close(1000, 'standing standby released'); } catch {}
    videoSocket = null;
  }
}

async function prepareStandingVideoRuntime(): Promise<void> {
  if (pageStopping || selectedMode !== 'standing') return;
  if (standingVideoPreparePromise) {
    await standingVideoPreparePromise;
    return;
  }
  const current = validGrant();
  if (!current) return;

  standingVideoPreparePromise = (async () => {
    await connectVideo(current);
    if (selectedMode !== 'standing' || pageStopping) return;
    window.dispatchEvent(new CustomEvent('orikuro:standing-runtime-ready'));
  })();

  try {
    await standingVideoPreparePromise;
  } catch (error) {
    if (selectedMode === 'standing') {
      window.dispatchEvent(new CustomEvent('orikuro:standing-runtime-failed', {
        detail: { message: startErrorMessage(error) },
      }));
    }
  } finally {
    standingVideoPreparePromise = null;
  }
}

async function prepareStreaming(mode: string): Promise<void> {
  preparationRequestedMode = mode === 'standing' ? 'standing' : 'radio';
  if (pageStopping || realtimePrepared || preparePromise) {
    if (preparePromise) await preparePromise;
    return;
  }
  const current = validGrant();
  if (!current || !preparedAudioStreamAvailable()) return;

  selectedMode = preparationRequestedMode;
  streamWanted = true;
  liveTransmission = false;
  serverStopped = false;
  window.dispatchEvent(new CustomEvent('orikuro:stream-preparing'));
  setText('[data-realtime-status]', '配信経路をバックグラウンド準備中');

  preparePromise = (async () => {
    await Promise.all([
      connectComments(),
      prepareAudio(current),
    ]);
    realtimePrepared = true;
    setText('[data-realtime-status]', '配信開始できます。');
    setText('[data-stream-state="output"]', '開始待機中');
    window.dispatchEvent(new CustomEvent('orikuro:stream-prepared'));
  })();

  try {
    await preparePromise;
  } catch (error) {
    realtimePrepared = false;
    streamWanted = false;
    const message = startErrorMessage(error);
    setText('[data-realtime-status]', message);
    await resetAudioCaptureGraph(false);
    window.dispatchEvent(new CustomEvent('orikuro:stream-prepare-failed', { detail: { message } }));
  } finally {
    preparePromise = null;
  }
}

async function switchLiveAudioInput(deviceId: string): Promise<void> {
  if (liveAudioSwitchInProgress) {
    window.dispatchEvent(new CustomEvent('orikuro:live-audio-input-switch-failed', {detail:{code:'MIC_SWITCH_BUSY'}}));
    return;
  }
  if (!deviceId || deviceId.length > 512 || !navigator.mediaDevices?.getUserMedia
      || !liveTransmission || pageStopping || stopPromise || !audioContext
      || !audioWorklet || !audioSource || !audioStream) {
    window.dispatchEvent(new CustomEvent('orikuro:live-audio-input-switch-failed', {detail:{code:'MIC_SWITCH_UNAVAILABLE'}}));
    return;
  }
  const previousStream = audioStream;
  const previousSource = audioSource;
  const worklet = audioWorklet;
  const context = audioContext;
  const currentTrack = previousStream.getAudioTracks()[0];
  if (currentTrack?.readyState !== 'live') {
    window.dispatchEvent(new CustomEvent('orikuro:live-audio-input-switch-failed', {detail:{code:'MIC_CURRENT_TRACK_ENDED'}}));
    return;
  }
  const oldDeviceId = currentTrack.getSettings().deviceId || selectedAudioInputDeviceId;
  if (oldDeviceId === deviceId) {
    window.dispatchEvent(new CustomEvent('orikuro:live-audio-input-switched', {
      detail:{deviceId:oldDeviceId,label:currentTrack.label||''}
    }));
    return;
  }
  liveAudioSwitchInProgress = true;
  let nextStream: MediaStream | null = null;
  let nextSource: MediaStreamAudioSourceNode | null = null;
  try {
    // Acquire the selected mic while the original source continues to feed the same
    // AudioWorklet, WebSocket, timestamps and listener-delivery monitor.
    nextStream = await navigator.mediaDevices.getUserMedia({
      audio:{
        deviceId:{exact:deviceId},
        echoCancellation:false,
        noiseSuppression:false,
        autoGainControl:false
      },
      video:false
    });
    const track = nextStream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') throw new Error('MIC_NEW_TRACK_UNAVAILABLE');
    if (!liveTransmission || pageStopping || stopPromise || audioStream !== previousStream
        || audioSource !== previousSource || audioWorklet !== worklet
        || audioContext !== context || worklet.context.state === 'closed')
      throw new Error('MIC_SWITCH_CANCELLED');
    nextSource = context.createMediaStreamSource(nextStream);
    nextSource.connect(worklet);
    // No asynchronous boundary between connecting the new source and retiring
    // the previous source. In case of failure, the former source remains active.
    previousSource.disconnect();
    audioStream = nextStream;
    audioSource = nextSource;
    selectedAudioInputDeviceId = track.getSettings().deviceId || deviceId;
    nextStream = null;
    nextSource = null;
    previousStream.getTracks().forEach(oldTrack=>oldTrack.stop());
    const detail={deviceId:selectedAudioInputDeviceId,label:track.label||''};
    window.dispatchEvent(new CustomEvent('orikuro:audio-device-active',{detail}));
    window.dispatchEvent(new CustomEvent('orikuro:live-audio-input-switched',{detail}));
  } catch (error) {
    try{nextSource?.disconnect();}catch{}
    const name=error instanceof DOMException?error.name:(error instanceof Error?error.message:'MIC_SWITCH_FAILED');
    const safeCodes=new Set(['NotAllowedError','NotFoundError','NotReadableError','OverconstrainedError','SecurityError','AbortError','MIC_SWITCH_CANCELLED','MIC_NEW_TRACK_UNAVAILABLE']);
    window.dispatchEvent(new CustomEvent('orikuro:live-audio-input-switch-failed',{
      detail:{code:safeCodes.has(name)?name:'MIC_SWITCH_FAILED'}
    }));
  } finally {
    nextStream?.getTracks().forEach(track=>track.stop());
    liveAudioSwitchInProgress = false;
  }
}

async function rebuildPreparedAudio(): Promise<void> {
  if (pageStopping || liveTransmission || !realtimePrepared) return;
  const current = validGrant();
  if (!current || !preparedAudioStreamAvailable()) return;
  realtimePrepared = false;
  window.dispatchEvent(new CustomEvent('orikuro:stream-preparing'));
  setText('[data-realtime-status]', 'マイク入力を再準備しています。');
  try {
    await resetAudioCaptureGraph(false);
    await prepareAudio(current);
    realtimePrepared = true;
    setText('[data-realtime-status]', '配信開始できます。');
    window.dispatchEvent(new CustomEvent('orikuro:stream-prepared'));
  } catch (error) {
    const message = startErrorMessage(error);
    setText('[data-realtime-status]', message);
    window.dispatchEvent(new CustomEvent('orikuro:stream-prepare-failed', { detail: { message } }));
  }
}

function faceRegionControl(raw: unknown): FaceRegionControl | null {
  const value=objectValue(raw);
  if(!value)return null;
  const frameId=Number(value.frameId),timestampNS=Number(value.timestampNS);
  const present=value.present;
  const centerX=Number(value.centerX),centerY=Number(value.centerY),size=Number(value.size),angleRad=Number(value.angleRad),confidence=Number(value.confidence);
  if(!Number.isSafeInteger(frameId)||frameId<=0||!Number.isSafeInteger(timestampNS)||timestampNS<=0||typeof present!=='boolean')return null;
  if(!Number.isFinite(confidence)||confidence<0||confidence>1)return null;
  if(!present)return {type:'face_region_v1',frameId,timestampNS,present:false,centerX:0,centerY:0,size:0,angleRad:0,confidence:0};
  if(!Number.isFinite(centerX)||centerX<0||centerX>1||!Number.isFinite(centerY)||centerY<0||centerY>1||!Number.isFinite(size)||size<=0||size>1||!Number.isFinite(angleRad)||angleRad<-Math.PI||angleRad>Math.PI)return null;
  return {type:'face_region_v1',frameId,timestampNS,present:true,centerX,centerY,size,angleRad,confidence};
}

function sendFaceRegionControl(raw: unknown): void {
  if(pageStopping||selectedMode!=='standing')return;
  const sample=faceRegionControl(raw);
  if(!sample)return;
  if(sample.frameId<=lastFaceRegionFrameId||sample.timestampNS<=lastFaceRegionTimestampNS)return;
  const socket=videoSocket;
  if(!socket||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>MAX_VIDEO_BUFFERED_BYTES)return;
  socket.send(JSON.stringify(sample));
  lastFaceRegionFrameId=sample.frameId;
  lastFaceRegionTimestampNS=sample.timestampNS;
}

// ACT operation input: Cloudflare render-2d performs it in the stream picture.
function sendCartoonAct(raw: unknown): void {
  const detail=objectValue(raw);
  const act=typeof detail?.act==='string'?detail.act:'';
  const eventId=typeof detail?.eventId==='string'&&/^[A-Za-z0-9_-]{16,96}$/.test(detail.eventId)?detail.eventId:'';
  const fail=(code:string)=>window.dispatchEvent(new CustomEvent('orikuro:cartoon-act-result',{detail:{ok:false,code,eventId,act}}));
  if(!eventId||!/^[a-z_]{3,32}$/.test(act)){fail('CARTOON_ACT_REQUEST_INVALID');return;}
  if(pageStopping||selectedMode!=='standing'){fail('CARTOON_ACT_STANDING_NOT_ACTIVE');return;}
  const socket=videoSocket;
  if(!socket||socket.readyState!==WebSocket.OPEN){fail('CARTOON_ACT_CONTROL_NOT_CONNECTED');return;}
  actSequence=Math.min(0xffffffff,actSequence+1);
  socket.send(JSON.stringify({type:'cartoon_act_v1',eventId,act,sequence:actSequence}));
}

function handleVideoControl(raw: unknown): void {
  const payload = parseText(raw);
  if (!payload || typeof payload.type !== 'string') return;
  if (payload.type === 'scene_status') {
    // Cloudflare scene: render-2d -> first composition -> Northflank.
    const forwarded = Number(payload.forwarded);
    window.dispatchEvent(new CustomEvent('orikuro:scene-status', { detail: payload }));
    if (Number.isFinite(forwarded) && forwarded > lastSceneForwarded) {
      if (lastSceneForwarded < 0 || forwarded > 0) window.dispatchEvent(new CustomEvent('orikuro:composition-ready'));
      lastSceneForwarded = forwarded;
      if (liveTransmission) {
        setText('[data-stream-state="output"]', '送出中');
        window.dispatchEvent(new CustomEvent('orikuro:output-ready'));
      }
    }
    return;
  }
  if (payload.type === 'cartoon_act_result') {
    window.dispatchEvent(new CustomEvent('orikuro:cartoon-act-result', { detail: payload }));
    return;
  }
  if (payload.type === 'support_act') {
    window.dispatchEvent(new CustomEvent('orikuro:support-act-applied', { detail: payload }));
    return;
  }
  if (payload.type === 'ack') {
    setText('[data-stream-state="output"]', '送出中');
    window.dispatchEvent(new CustomEvent('orikuro:output-ready'));
    return;
  }
  if (payload.type === 'backpressure') {
    setText('[data-stream-state="output"]', '混雑待機');
    return;
  }
  if (payload.type === 'ready') {
    window.dispatchEvent(new CustomEvent('orikuro:transport-ready'));
    return;
  }
  if (payload.type === 'face_region_received') {
    const frameId=Number(payload.frameId);
    if(Number.isSafeInteger(frameId)&&frameId>0)window.dispatchEvent(new CustomEvent('orikuro:face-region-cloudflare-received',{detail:{frameId}}));
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
  if (payload.type === 'downstream_disconnected' || payload.type === 'downstream_unavailable') {
    // Northflank keeps the session and reconnects to Cloudflare by itself.
    setText('[data-stream-state="output"]', 'Northflank再接続待ち');
    return;
  }
  if (payload.type === 'fatal') {
    setText('[data-stream-state="output"]', '送出停止');
    void stopStreaming(true);
  }
}

function scheduleControlReconnect(): void {
  if (pageStopping || !streamWanted || selectedMode !== 'standing' || controlReconnectTimer !== null) return;
  const current = validGrant();
  if (!current) return;
  const delay = Math.min(CONTROL_RECONNECT_MAX_MS, 250 * 2 ** Math.min(4, controlReconnectAttempt++));
  controlReconnectTimer = window.setTimeout(() => {
    controlReconnectTimer = null;
    const next = validGrant();
    if (next) void connectVideo(next).catch(() => scheduleControlReconnect());
  }, delay);
}

async function connectVideo(current: StreamRealtimeGrant): Promise<void> {
  if (videoSocket && videoSocket.readyState === WebSocket.OPEN) return;
  if (videoSocket && videoSocket.readyState === WebSocket.CONNECTING) {
    await waitOpen(videoSocket);
    return;
  }
  const socket = new WebSocket(current.cloudflareWebSocketUrl, [VIDEO_SUBPROTOCOL, `bearer.${current.publisherCapability}`]);
  socket.binaryType = 'arraybuffer';
  videoSocket = socket;
  socket.addEventListener('message', (event) => {
    if (socket === videoSocket && typeof event.data === 'string') handleVideoControl(event.data);
  });
  socket.addEventListener('close', () => {
    if (socket !== videoSocket) return;
    videoSocket = null;
    // Only inputs travel on this socket; the stream itself continues on
    // Cloudflare/Northflank. Reconnect the input channel.
    if (streamWanted && selectedMode === 'standing' && !pageStopping) {
      setText('[data-stream-state="output"]', '操作チャネル再接続中');
      scheduleControlReconnect();
    }
  });
  await waitOpen(socket);
  controlReconnectAttempt = 0;
  lastFaceRegionFrameId = 0;
  lastFaceRegionTimestampNS = 0;
  window.dispatchEvent(new CustomEvent('orikuro:transport-ready'));
}

async function requestServerLive(): Promise<boolean> {
  if (serverLivePromise) return await serverLivePromise;
  const current = validGrant();
  if (!current) return false;

  serverLivePromise = (async () => {
    try {
      const response = await fetch(LIVE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          streamId: current.streamId,
          controlCapability: current.controlCapability,
        }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      const payload = objectValue(await response.json().catch(() => null));
      const result = objectValue(payload?.result);
      return response.ok
        && payload?.ok === true
        && result?.streamId === current.streamId
        && result?.running === true
        && result?.live === true;
    } catch {
      return false;
    }
  })();

  try {
    return await serverLivePromise;
  } finally {
    serverLivePromise = null;
  }
}

async function requestServerStop(keepalive = false): Promise<boolean> {
  if (serverStopped) return true;
  if (serverStopPromise) return await serverStopPromise;
  const current = grant ?? getStreamRealtimeGrant();
  if (!current) return true;

  serverStopPromise = (async () => {
    // If the user stops immediately after Start, let the in-flight live marker
    // settle first, then clear it. This prevents a late activation from
    // resurrecting a stream after the local UI has already ended.
    const pendingLive = serverLivePromise;
    if (pendingLive) {
      try { await pendingLive; } catch {}
    }
    try {
      const response = await fetch(FLOW_URL, {
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
      const payload = objectValue(await response.json().catch(() => null));
      const result = objectValue(payload?.result);
      const stopped = response.ok
        && payload?.ok === true
        && result?.streamId === current.streamId
        && result?.cloudflareStopped === true
        && result?.northflankRevoked === true;
      if (stopped) {
        serverStopped = true;
        clearStreamRealtimeGrant();
        grant = null;
      }
      return stopped;
    } catch {
      return false;
    }
  })();

  try {
    return await serverStopPromise;
  } finally {
    serverStopPromise = null;
  }
}

async function startStreaming(mode: string): Promise<void> {
  if (liveTransmission) return;
  const current = validGrant();
  if (!current || !realtimePrepared) {
    const message = '配信準備が完了していません。';
    setText('[data-realtime-status]', message);
    window.dispatchEvent(new CustomEvent('orikuro:stream-start-failed', { detail: { message } }));
    return;
  }
  selectedMode = mode === 'standing' ? 'standing' : 'radio';
  if (selectedMode === 'standing') {
    // Cloudflare is already rendering the scene; make sure the input channel
    // (Tracking / ACT) is connected.
    setText('[data-realtime-status]', 'Cloudflareの立ち絵シーンへ接続しています。');
    try {
      if (!videoSocket || videoSocket.readyState !== WebSocket.OPEN) await connectVideo(current);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'STANDING_VIDEO_START_FAILED';
      const message = `立ち絵の映像送出を開始できません: ${code}`;
      setText('[data-realtime-status]', message);
      window.dispatchEvent(new CustomEvent('orikuro:stream-start-failed', { detail: { message } }));
      return;
    }
  }

  // Start is local and immediate. All expensive preparation has already
  // finished; public visibility flips asynchronously through the signed
  // live marker and never blocks the user's transition to LIVE.
  streamStartedAtPerfMs = performance.now();
  liveTransmission = true;
  setText('[data-realtime-status]', '配信中');
  setText('[data-stream-state="output"]', '送出中');
  window.dispatchEvent(new CustomEvent('orikuro:stream-live'));
  window.dispatchEvent(new CustomEvent('orikuro:audio-path-waiting'));

  void requestServerLive().then(async (activated) => {
    if (activated || !liveTransmission || pageStopping) return;
    const message = '配信公開を開始できませんでした。';
    setText('[data-realtime-status]', message);
    const cleaned = await stopStreaming(true);
    if (cleaned) {
      window.dispatchEvent(new CustomEvent('orikuro:stream-start-failed', { detail: { message } }));
    } else {
      setText('[data-realtime-status]', `${message} 配信セッションの終了確認にも失敗しました。`);
    }
  });
}

async function stopStreaming(notifyServer: boolean, endReason: string | null = null): Promise<boolean> {
  if (stopPromise) return await stopPromise;
  stopPromise = (async () => {
    const current = grant ?? getStreamRealtimeGrant();
    const shouldNotify = notifyServer && !!current && !serverStopped;
    liveTransmission = false;
    realtimePrepared = false;
    commonPrepared = false;
    commonPreparePromise = null;
    preparationRequestedMode = null;
    streamWanted = false;

    if (commentsReconnectTimer !== null) { clearTimeout(commentsReconnectTimer); commentsReconnectTimer = null; }
    if (audioReconnectTimer !== null) { clearTimeout(audioReconnectTimer); audioReconnectTimer = null; }
    if (monitorReconnectTimer !== null) { clearTimeout(monitorReconnectTimer); monitorReconnectTimer = null; }
    if (monitorSocket) {
      try { monitorSocket.close(1000, 'delivery monitor stopped'); } catch {}
      monitorSocket = null;
    }
    monitorReconnectAttempt = 0;
    monitorLastCursor = 0;
    commentsAuthenticated = false;
    if (commentsSocket) {
      try { commentsSocket.close(1000, 'stream stopped'); } catch {}
      commentsSocket = null;
    }

    if (controlReconnectTimer !== null) { clearTimeout(controlReconnectTimer); controlReconnectTimer = null; }
    if (videoSocket) {
      try { videoSocket.close(1000, 'publisher stop'); } catch {}
      videoSocket = null;
    }
    lastFaceRegionFrameId=0;
    lastFaceRegionTimestampNS=0;
    standingVideoPreparePromise = null;
    lastSceneForwarded = -1;
    resetPreviewDecoder();

    if (audioWorklet) {
      audioWorklet.port.onmessage = null;
      try { audioWorklet.disconnect(); } catch {}
      audioWorklet = null;
    }
    if (audioSource) {
      try { audioSource.disconnect(); } catch {}
      audioSource = null;
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
    audioPathAcknowledged = false;
    lastAudioMeterEmitMs = 0;
    window.dispatchEvent(new CustomEvent('orikuro:audio-meter-reset'));
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
      audioStream = null;
    }
    const closingAudioContext = audioContext;
    audioContext = null;

    if (endReason) {
      if (closingAudioContext) void closingAudioContext.close().catch(() => undefined);
      if (shouldNotify) void requestServerStop(true);
      setText('[data-audio-status]', '待機中');
      setText('[data-stream-state="output"]', '待機中');
      window.dispatchEvent(new CustomEvent('orikuro:stream-ended', { detail: { reason: endReason } }));
      return true;
    }

    if (closingAudioContext) {
      await closingAudioContext.close().catch(() => undefined);
    }

    if (shouldNotify) {
      setText('[data-realtime-status]', '配信を終了しています…');
      const stopped = await requestServerStop(false);
      if (!stopped) {
        setText('[data-realtime-status]', '配信終了を確認できませんでした。もう一度終了してください。');
        window.dispatchEvent(new CustomEvent('orikuro:stream-stop-failed'));
        return false;
      }
    }

    setText('[data-audio-status]', '待機中');
    setText('[data-stream-state="output"]', '待機中');

    if (endReason) {
      window.dispatchEvent(new CustomEvent('orikuro:stream-ended', { detail: { reason: endReason } }));
    }
    return true;
  })();
  try {
    return await stopPromise;
  } finally {
    stopPromise = null;
  }
}

function bindUI(): void {
  if (uiBound) return;
  uiBound = true;
  const stop = document.querySelector<HTMLButtonElement>('[data-audio-stop]');
  const form = document.querySelector<HTMLFormElement>('[data-comment-form]');
  const input = document.querySelector<HTMLInputElement>('[data-comment-input]');
  stop?.addEventListener('click', () => { void stopStreaming(true, 'user_stop'); });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input) {
      sendComment(input.value);
      input.value = '';
    }
  });
  window.addEventListener('orikuro:stream-mode-change', (event) => {
    const detail = objectValue((event as CustomEvent).detail);
    const mode = typeof detail?.mode === 'string' ? detail.mode : 'radio';
    const previousMode = selectedMode;
    selectedMode = mode === 'standing' ? 'standing' : 'radio';
    if (selectedMode === 'standing') {
      void prepareStandingVideoRuntime();
    } else {
      if (previousMode === 'standing' && !liveTransmission) releaseStandingVideoStandby();
      void ensureAudioRuntime().catch(() => undefined);
    }
  });
  window.addEventListener('orikuro:cartoon-act-request', (event) => {
    sendCartoonAct((event as CustomEvent).detail);
  });
  window.addEventListener('orikuro:face-region-sample', (event) => {
    sendFaceRegionControl((event as CustomEvent).detail);
  });
  window.addEventListener('orikuro:live-audio-input-change', (event) => {
    const detail=objectValue((event as CustomEvent).detail);
    const id=typeof detail?.deviceId==='string'?detail.deviceId:'';
    void switchLiveAudioInput(id);
  });
  window.addEventListener('orikuro:audio-input-change', (event) => {
    if (liveTransmission) return;
    const detail = objectValue((event as CustomEvent).detail);
    const deviceId = typeof detail?.deviceId === 'string' ? detail.deviceId : '';
    selectedAudioInputDeviceId = deviceId.length <= 512 ? deviceId : '';
    if (realtimePrepared && preparedAudioStreamAvailable()) {
      void rebuildPreparedAudio();
    } else if (preparationRequestedMode && validGrant() && preparedAudioStreamAvailable()) {
      void prepareStreaming(preparationRequestedMode);
    }
  });
  window.addEventListener('orikuro:stream-prepare-request', (event) => {
    const detail = objectValue((event as CustomEvent).detail);
    const mode = typeof detail?.mode === 'string' ? detail.mode : 'radio';
    preparationRequestedMode = mode === 'standing' ? 'standing' : 'radio';
    void prepareStreaming(preparationRequestedMode);
  });
  window.addEventListener('orikuro:stream-start-request', (event) => {
    const detail = objectValue((event as CustomEvent).detail);
    const mode = typeof detail?.mode === 'string' ? detail.mode : 'radio';
    void startStreaming(mode);
  });
  window.addEventListener('orikuro:stream-stop-request', (event) => {
    const detail = objectValue((event as CustomEvent).detail);
    const reason = typeof detail?.reason === 'string' && detail.reason ? detail.reason : 'stopped';
    void stopStreaming(true, reason);
  });
}

async function startRealtime(): Promise<void> {
  if (pageStopping) return;
  grant = getStreamRealtimeGrant();
  if (!grant) return;
  setText('[data-realtime-status]', '共通・専用配信経路を並列スタンバイ中');

  const tasks: Promise<void>[] = [prepareCommonStreaming()];
  if (selectedMode === 'standing') tasks.push(prepareStandingVideoRuntime());
  if (preparationRequestedMode && preparedAudioStreamAvailable()) {
    tasks.push(prepareStreaming(preparationRequestedMode));
  }
  await Promise.all(tasks);
}

function serviceReady(): boolean {
  const content = document.querySelector<HTMLElement>('[data-service-content]');
  return !!content && content.hidden === false;
}

function shutdown(): void {
  pageStopping = true;
  liveTransmission = false;
  realtimePrepared = false;
  if (commentsReconnectTimer !== null) clearTimeout(commentsReconnectTimer);
  if (audioReconnectTimer !== null) clearTimeout(audioReconnectTimer);
  if (monitorReconnectTimer !== null) clearTimeout(monitorReconnectTimer);
  commentsReconnectTimer = null;
  audioReconnectTimer = null;
  monitorReconnectTimer = null;
  if (monitorSocket && monitorSocket.readyState < WebSocket.CLOSING) monitorSocket.close(1000, 'page closed');
  monitorSocket = null;
  if (commentsSocket && commentsSocket.readyState < WebSocket.CLOSING) commentsSocket.close(1000, 'page closed');
  commentsSocket = null;
  void stopStreaming(false);
  if (!serverStopped && (grant ?? getStreamRealtimeGrant())) {
    void requestServerStop(true);
  } else {
    clearStreamRealtimeGrant();
    grant = null;
  }
}

bindUI();
document.addEventListener('orikuro:service-ready', () => { void startRealtime(); });
if (serviceReady() && getStreamRealtimeGrant()) void startRealtime();
window.addEventListener('pagehide', shutdown, { once: true });
