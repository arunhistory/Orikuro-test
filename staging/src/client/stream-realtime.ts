import { clearStreamRealtimeGrant, getStreamRealtimeGrant, type StreamRealtimeGrant } from './realtime-grant.js';

const AUDIO_SUBPROTOCOL = 'orikuro-audio-v1';
const COMMENT_SUBPROTOCOL = 'orikuro-comments-v1';
const AUDIO_MAGIC = 0x4f434131;
const AUDIO_VERSION = 1;
const AUDIO_HEADER_BYTES = 28;
const MAX_AUDIO_BUFFERED_BYTES = 512 * 1024;
const MAX_COMMENT_BYTES = 4096;
const MAX_RECONNECT_DELAY_MS = 2_000;
const WORKLET_URL = './assets/js/stream-audio-worklet.js?v=20260912-phase3';
const encoder = new TextEncoder();

type JsonObject = Record<string, unknown>;
type WorkletPacket = Readonly<{
  type: 'audio-packet';
  startFrame: number;
  sampleRate: number;
  frames: number;
  planes: Float32Array[];
}>;

let grant: StreamRealtimeGrant | null = null;
let commentsSocket: WebSocket | null = null;
let commentsAuthenticated = false;
let commentsReconnectTimer: number | null = null;
let commentLastSequence = 0;
let commentReconnectAttempt = 0;
let pageStopping = false;

let audioSocket: WebSocket | null = null;
let audioAuthenticated = false;
let audioReconnectTimer: number | null = null;
let audioReconnectAttempt = 0;
let audioWanted = false;
let audioSequence = 0;
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let audioWorklet: AudioWorkletNode | null = null;
let silentGain: GainNode | null = null;
let audioEpochNS = 0n;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function textTarget(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

function setText(selector: string, value: string): void {
  const target = textTarget(selector);
  if (target) target.textContent = value;
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

function parseMessage(event: MessageEvent): JsonObject | null {
  if (typeof event.data !== 'string' || event.data.length > 64_000) return null;
  try {
    return objectValue(JSON.parse(event.data));
  } catch {
    return null;
  }
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
  if (!current || pageStopping) {
    setText('[data-comment-status]', 'コメント接続を利用できません。');
    return;
  }
  if (commentsSocket && (commentsSocket.readyState === WebSocket.OPEN || commentsSocket.readyState === WebSocket.CONNECTING)) return;

  commentsAuthenticated = false;
  setText('[data-comment-status]', 'コメントへ接続しています。');
  const socket = new WebSocket(current.commentsWebSocketUrl, COMMENT_SUBPROTOCOL);
  commentsSocket = socket;

  socket.addEventListener('open', () => {
    if (socket !== commentsSocket) return;
    socket.send(JSON.stringify({
      type: 'auth',
      streamId: current.streamId,
      capability: current.capability,
      lastSequence: commentLastSequence,
    }));
  });

  socket.addEventListener('message', (event) => {
    if (socket !== commentsSocket) return;
    const payload = parseMessage(event);
    if (!payload || typeof payload.type !== 'string') {
      socket.close(1008, 'invalid server message');
      return;
    }
    if (payload.type === 'auth_ok') {
      commentsAuthenticated = true;
      commentReconnectAttempt = 0;
      setText('[data-comment-status]', 'コメント接続中');
      return;
    }
    if (payload.type === 'comment') {
      appendComment(payload.message);
      return;
    }
    if (payload.type === 'error') {
      setText('[data-comment-status]', typeof payload.code === 'string' ? `コメントエラー: ${payload.code}` : 'コメントエラー');
    }
  });

  socket.addEventListener('close', (event) => {
    if (socket !== commentsSocket) return;
    commentsSocket = null;
    commentsAuthenticated = false;
    if (pageStopping) return;
    if (event.code === 1008 || !validGrant()) {
      setText('[data-comment-status]', 'コメント接続の認可が終了しました。');
      return;
    }
    setText('[data-comment-status]', 'コメントを再接続しています。');
    scheduleCommentsReconnect();
  });

  socket.addEventListener('error', () => {
    if (socket === commentsSocket) setText('[data-comment-status]', 'コメント通信を再確認しています。');
  });
}

function sendComment(text: string): void {
  const normalized = text.trim();
  if (!normalized) return;
  if (encoder.encode(normalized).byteLength > MAX_COMMENT_BYTES) {
    setText('[data-comment-status]', 'コメントが長すぎます。');
    return;
  }
  if (!commentsSocket || commentsSocket.readyState !== WebSocket.OPEN || !commentsAuthenticated) {
    setText('[data-comment-status]', 'コメントへ再接続しています。');
    scheduleCommentsReconnect();
    return;
  }
  commentsSocket.send(JSON.stringify({ type: 'comment', text: normalized }));
  const input = document.querySelector<HTMLInputElement>('[data-comment-input]');
  if (input) input.value = '';
}

function encodeAudioPacket(packet: WorkletPacket): ArrayBuffer | null {
  if (
    !Number.isSafeInteger(packet.startFrame)
    || packet.startFrame < 0
    || !Number.isSafeInteger(packet.sampleRate)
    || packet.sampleRate <= 0
    || !Number.isSafeInteger(packet.frames)
    || packet.frames <= 0
    || packet.frames > 4096
    || !Array.isArray(packet.planes)
    || packet.planes.length < 1
    || packet.planes.length > 8
  ) return null;
  for (const plane of packet.planes) {
    if (!(plane instanceof Float32Array) || plane.length !== packet.frames) return null;
  }

  audioSequence = (audioSequence + 1) >>> 0;
  if (audioSequence === 0) audioSequence = 1;
  const size = AUDIO_HEADER_BYTES + packet.planes.length * packet.frames * 4;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint32(0, AUDIO_MAGIC, false);
  view.setUint8(4, AUDIO_VERSION);
  view.setUint8(5, packet.planes.length);
  view.setUint8(6, 0);
  view.setUint8(7, 0);
  view.setUint32(8, audioSequence, false);
  const frameOffsetNS = BigInt(Math.round(packet.startFrame * 1_000_000_000 / packet.sampleRate));
  const timestampNS = audioEpochNS + frameOffsetNS;
  view.setBigUint64(12, timestampNS, false);
  view.setUint32(20, packet.sampleRate, false);
  view.setUint32(24, packet.frames, false);
  let offset = AUDIO_HEADER_BYTES;
  for (const plane of packet.planes) {
    for (let i = 0; i < plane.length; i++) {
      const sample = Number.isFinite(plane[i]) ? plane[i] : 0;
      view.setFloat32(offset, sample, false);
      offset += 4;
    }
  }
  return buffer;
}

function sendAudioPacket(packet: WorkletPacket): void {
  if (!audioWanted || !audioAuthenticated || !audioSocket || audioSocket.readyState !== WebSocket.OPEN) return;
  if (audioSocket.bufferedAmount > MAX_AUDIO_BUFFERED_BYTES) {
    setText('[data-audio-status]', '音声通信が詰まったため再接続します。');
    audioAuthenticated = false;
    audioSocket.close(1011, 'audio backpressure');
    return;
  }
  const encoded = encodeAudioPacket(packet);
  if (!encoded) {
    setText('[data-audio-status]', 'マイクデータを確認できません。');
    void stopAudioCapture(false);
    return;
  }
  audioSocket.send(encoded);
}

function scheduleAudioReconnect(): void {
  if (!audioWanted || pageStopping || audioReconnectTimer !== null || !validGrant()) return;
  const delay = reconnectDelay(audioReconnectAttempt++);
  audioReconnectTimer = window.setTimeout(() => {
    audioReconnectTimer = null;
    void connectAudioSocket();
  }, delay);
}

async function connectAudioSocket(): Promise<void> {
  const current = validGrant();
  if (!current || !audioWanted || pageStopping) return;
  if (audioSocket && (audioSocket.readyState === WebSocket.OPEN || audioSocket.readyState === WebSocket.CONNECTING)) return;

  audioAuthenticated = false;
  setText('[data-audio-status]', '音声へ接続しています。');
  const socket = new WebSocket(current.audioWebSocketUrl, AUDIO_SUBPROTOCOL);
  audioSocket = socket;

  socket.addEventListener('open', () => {
    if (socket !== audioSocket) return;
    socket.send(JSON.stringify({ type: 'auth', streamId: current.streamId, capability: current.capability }));
  });

  socket.addEventListener('message', (event) => {
    if (socket !== audioSocket) return;
    const payload = parseMessage(event);
    if (!payload || typeof payload.type !== 'string') {
      socket.close(1008, 'invalid server message');
      return;
    }
    if (payload.type === 'auth_ok') {
      audioAuthenticated = true;
      audioReconnectAttempt = 0;
      setText('[data-audio-status]', 'マイク送信中');
      return;
    }
    if (payload.type === 'error') {
      setText('[data-audio-status]', typeof payload.code === 'string' ? `音声エラー: ${payload.code}` : '音声エラー');
    }
  });

  socket.addEventListener('close', (event) => {
    if (socket !== audioSocket) return;
    audioSocket = null;
    audioAuthenticated = false;
    if (!audioWanted || pageStopping) return;
    if (event.code === 1008 || !validGrant()) {
      setText('[data-audio-status]', '音声接続の認可が終了しました。');
      void stopAudioCapture(false);
      return;
    }
    if (event.code === 1011 && event.reason !== 'audio backpressure') {
      setText('[data-audio-status]', '音声処理でエラーが発生しました。');
      void stopAudioCapture(false);
      return;
    }
    setText('[data-audio-status]', '音声を再接続しています。');
    scheduleAudioReconnect();
  });

  socket.addEventListener('error', () => {
    if (socket === audioSocket) setText('[data-audio-status]', '音声通信を再確認しています。');
  });
}

async function startAudioCapture(): Promise<void> {
  if (audioWanted) return;
  const current = validGrant();
  if (!current) {
    setText('[data-audio-status]', 'マイク接続情報がありません。');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
    setText('[data-audio-status]', 'このブラウザではマイク配信を利用できません。');
    return;
  }

  audioWanted = true;
  audioSequence = 0;
  const start = document.querySelector<HTMLButtonElement>('[data-audio-start]');
  const stop = document.querySelector<HTMLButtonElement>('[data-audio-stop]');
  if (start) start.disabled = true;
  if (stop) stop.disabled = false;
  setText('[data-audio-status]', 'マイクの利用許可を確認しています。');

  try {
    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    const context = new AudioContext({ latencyHint: 'interactive' });
    audioContext = context;
    await Promise.all([context.resume(), context.audioWorklet.addModule(WORKLET_URL)]);
    const stream = await streamPromise;
    if (!audioWanted) {
      stream.getTracks().forEach((track) => track.stop());
      await context.close().catch(() => undefined);
      return;
    }
    mediaStream = stream;

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

    const epochMs = performance.timeOrigin + performance.now() - context.currentTime * 1000;
    audioEpochNS = BigInt(Math.max(0, Math.round(epochMs * 1_000_000)));
    worklet.port.onmessage = (event: MessageEvent<unknown>) => {
      const data = objectValue(event.data);
      if (!data || data.type !== 'audio-packet') return;
      sendAudioPacket(data as unknown as WorkletPacket);
    };

    await connectAudioSocket();
  } catch {
    setText('[data-audio-status]', 'マイクを開始できませんでした。');
    await stopAudioCapture(false);
  }
}

async function stopAudioCapture(userRequested = true): Promise<void> {
  audioWanted = false;
  audioAuthenticated = false;
  if (audioReconnectTimer !== null) {
    clearTimeout(audioReconnectTimer);
    audioReconnectTimer = null;
  }
  const socket = audioSocket;
  audioSocket = null;
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'audio stopped');

  if (audioWorklet) {
    audioWorklet.port.onmessage = null;
    try { audioWorklet.disconnect(); } catch {}
    audioWorklet = null;
  }
  if (silentGain) {
    try { silentGain.disconnect(); } catch {}
    silentGain = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  const context = audioContext;
  audioContext = null;
  if (context && context.state !== 'closed') await context.close().catch(() => undefined);

  const start = document.querySelector<HTMLButtonElement>('[data-audio-start]');
  const stop = document.querySelector<HTMLButtonElement>('[data-audio-stop]');
  if (start) start.disabled = false;
  if (stop) stop.disabled = true;
  if (userRequested) setText('[data-audio-status]', 'マイク停止中');
}

function bindUI(): void {
  const start = document.querySelector<HTMLButtonElement>('[data-audio-start]');
  const stop = document.querySelector<HTMLButtonElement>('[data-audio-stop]');
  const form = document.querySelector<HTMLFormElement>('[data-comment-form]');
  const input = document.querySelector<HTMLInputElement>('[data-comment-input]');

  start?.addEventListener('click', () => { void startAudioCapture(); });
  stop?.addEventListener('click', () => { void stopAudioCapture(); });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input) sendComment(input.value);
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
  setText('[data-realtime-status]', 'リアルタイム処理を利用できます。');
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
  void stopAudioCapture(false);
}

document.addEventListener('orikuro:service-ready', () => { void startRealtime(); }, { once: true });
if (serviceReady()) void startRealtime();
window.addEventListener('pagehide', shutdown, { once: true });
