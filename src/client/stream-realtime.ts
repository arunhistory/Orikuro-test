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
let liveTransmission = false;
let realtimePrepared = false;
let commonPrepared = false;
let commonPreparePromise: Promise<void> | null = null;
let preparationRequestedMode: string | null = null;
let preparePromise: Promise<void> | null = null;
let serverLivePromise: Promise<boolean> | null = null;
let selectedMode = 'radio';
let selectedAudioInputDeviceId = '';

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
let preparedVideoConfig: VideoEncoderConfig | null = null;
let standingVideoPreparePromise: Promise<void> | null = null;
let videoStandingImage: HTMLImageElement | null = null;
let videoBackgroundImage: HTMLImageElement | null = null;
let videoBackgroundColor = '#151827';
type StandingFrameState = Readonly<{x:number;y:number;z:number;yaw:number;pitch:number;roll:number;confidence:number;lod:number;faceLocalWarp:number;}>;
type StandingFrameWindow = Window & { __orikuroStandingFrameState?: StandingFrameState };

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
  preparedVideoConfig = null;
  if (videoTimer !== null) {
    clearInterval(videoTimer);
    videoTimer = null;
  }
  if (videoEncoder) {
    try { videoEncoder.close(); } catch {}
    videoEncoder = null;
  }
  h264ParameterSets = null;
  if (videoSocket) {
    try { videoSocket.close(1000, 'standing standby released'); } catch {}
    videoSocket = null;
  }
  videoCanvas = null;
  videoContext = null;
  videoStandingImage = null;
  videoBackgroundImage = null;
  videoBackgroundColor = '#151827';
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
    const config = preparedVideoConfig ?? await supportedVideoConfig();
    if (selectedMode !== 'standing' || pageStopping) return;
    preparedVideoConfig = config;

    if (!videoCanvas || !videoContext) {
      const canvas = document.createElement('canvas');
      canvas.width = TARGET_WIDTH;
      canvas.height = TARGET_HEIGHT;
      const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!context) throw new Error('VIDEO_CANVAS_UNAVAILABLE');
      videoCanvas = canvas;
      videoContext = context;
    }

    await connectVideo(current);
    if (selectedMode !== 'standing' || pageStopping) return;
    if (!videoEncoder || videoEncoder.state !== 'configured') createEncoder(config);
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
      if (!streamWanted || !liveTransmission || !socket || socket.readyState !== WebSocket.OPEN) return;
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

function currentStandingFrameState(): StandingFrameState {
  const state=(window as StandingFrameWindow).__orikuroStandingFrameState;
  return {
    x:Number.isFinite(state?.x)?Math.max(-0.08,Math.min(0.08,Number(state?.x))):0,
    y:Number.isFinite(state?.y)?Math.max(-0.08,Math.min(0.08,Number(state?.y))):0,
    z:Number.isFinite(state?.z)?Math.max(-0.08,Math.min(0.08,Number(state?.z))):0,
    yaw:Number.isFinite(state?.yaw)?Math.max(-18,Math.min(18,Number(state?.yaw))):0,
    pitch:Number.isFinite(state?.pitch)?Math.max(-14,Math.min(14,Number(state?.pitch))):0,
    roll:Number.isFinite(state?.roll)?Math.max(-24,Math.min(24,Number(state?.roll))):0,
    confidence:Number.isFinite(state?.confidence)?Math.max(0,Math.min(1,Number(state?.confidence))):1,
    lod:Number.isFinite(state?.lod)?Math.max(0,Math.min(5,Math.round(Number(state?.lod)))):0,
    faceLocalWarp:0,
  };
}
function drawCover(context:CanvasRenderingContext2D,image:HTMLImageElement,offsetX=0,scaleGain=1):void{
  const scale=Math.max(TARGET_WIDTH/image.naturalWidth,TARGET_HEIGHT/image.naturalHeight)*scaleGain;
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  context.drawImage(image,(TARGET_WIDTH-width)/2+offsetX,(TARGET_HEIGHT-height)/2,width,height);
}
function drawStandingVideoScene():void{
  if(!videoContext||!videoStandingImage)return;
  const context=videoContext,state=currentStandingFrameState();
  context.save();context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,TARGET_WIDTH,TARGET_HEIGHT);
  if(videoBackgroundImage&&videoBackgroundImage.complete&&videoBackgroundImage.naturalWidth>0)drawCover(context,videoBackgroundImage,-state.x*TARGET_WIDTH*.18,1.02+Math.abs(state.z)*.08);
  else{context.fillStyle=/^#[0-9a-f]{6}$/i.test(videoBackgroundColor)?videoBackgroundColor:'#151827';context.fillRect(0,0,TARGET_WIDTH,TARGET_HEIGHT);}
  context.restore();
  const image=videoStandingImage,baseScale=Math.min(TARGET_WIDTH/image.naturalWidth,TARGET_HEIGHT/image.naturalHeight),width=image.naturalWidth*baseScale,height=image.naturalHeight*baseScale;
  const depthScale=1+state.z,yawScale=1-Math.min(Math.abs(state.yaw)/18,1)*.06,pitchScale=1-Math.min(Math.abs(state.pitch)/14,1)*.04;
  context.save();context.translate(TARGET_WIDTH/2+state.x*TARGET_HEIGHT,TARGET_HEIGHT+state.y*TARGET_HEIGHT);context.rotate(state.roll*Math.PI/180);context.scale(depthScale*yawScale,depthScale*pitchScale);context.drawImage(image,-width/2,-height,width,height);context.restore();
}
function encodeVideoFrame(): void {
  if(!streamWanted||!liveTransmission||selectedMode!=='standing'||Date.now()<videoBackpressureUntil||!videoEncoder||videoEncoder.state!=='configured'||!videoCanvas||!videoContext)return;
  if(videoEncoder.encodeQueueSize>2)return;
  drawStandingVideoScene();
  const timestampUs=Math.max(0,Math.round((performance.now()-videoStartedAt)*1000));
  const frame=new VideoFrame(videoCanvas,{timestamp:timestampUs});
  try{const keyFrame=videoFrameIndex%KEYFRAME_INTERVAL===0;videoEncoder.encode(frame,{keyFrame});videoFrameIndex+=1;}finally{frame.close();}
}
async function startVideo(current:StreamRealtimeGrant):Promise<void>{
  await prepareStandingVideoRuntime();
  const image=Array.from(document.querySelectorAll<HTMLImageElement>('[data-standing-preview-image]')).find(item=>!item.hidden&&item.complete&&item.naturalWidth>0);
  if(!image)throw new Error('STANDING_PREVIEW_MISSING');
  if(!videoCanvas||!videoContext)throw new Error('VIDEO_CANVAS_UNAVAILABLE');
  if(!videoSocket||videoSocket.readyState!==WebSocket.OPEN)await connectVideo(current);
  if(!preparedVideoConfig)preparedVideoConfig=await supportedVideoConfig();
  if(!videoEncoder||videoEncoder.state!=='configured')createEncoder(preparedVideoConfig);

  const preparedBackground=Array.from(document.querySelectorAll<HTMLImageElement>('[data-background-preview-image]')).find(item=>!item.hidden&&item.complete&&item.naturalWidth>0)??null;
  const solidBackground=Array.from(document.querySelectorAll<HTMLElement>('[data-radio-background]')).find(item=>!item.hidden)??null;
  const backgroundColor=solidBackground?getComputedStyle(solidBackground).getPropertyValue('--radio-background-color').trim():'#151827';

  videoStandingImage=image;
  videoBackgroundImage=preparedBackground;
  videoBackgroundColor=/^#[0-9a-f]{6}$/i.test(backgroundColor)?backgroundColor:'#151827';
  drawStandingVideoScene();

  videoSequence=0;videoFrameIndex=0;videoStartedAt=streamStartedAtPerfMs;
  const configPayload=encoderText.encode(JSON.stringify({codec:'h264-annexb',profile:H264_CODEC,width:TARGET_WIDTH,height:TARGET_HEIGHT,fps:TARGET_FPS,keyframeIntervalFrames:KEYFRAME_INTERVAL,source:'standing-2.5d-streaming-temporary-copy',staging:true,faceLocalWarp:0}));
  videoSocket?.send(buildVideoPacket(MEDIA_KIND_CONFIG,configPayload,false,0));
  encodeVideoFrame();
  if(videoTimer!==null)clearInterval(videoTimer);
  videoTimer=window.setInterval(encodeVideoFrame,FRAME_INTERVAL_MS);
  window.dispatchEvent(new CustomEvent('orikuro:composition-ready'));
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
    setText('[data-realtime-status]', '立ち絵の映像送出を準備しています。');
    try {
      streamStartedAtPerfMs = performance.now();
      await startVideo(current);
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
    preparedVideoConfig = null;
    standingVideoPreparePromise = null;
    videoStandingImage = null;
    videoBackgroundImage = null;
    videoBackgroundColor = '#151827';

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
  setText('[data-realtime-status]', '共通配信経路をスタンバイ中');
  await prepareCommonStreaming();
  if (selectedMode === 'standing') void prepareStandingVideoRuntime();
  if (preparationRequestedMode && preparedAudioStreamAvailable()) {
    await prepareStreaming(preparationRequestedMode);
  }
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
