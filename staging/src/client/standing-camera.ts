import { getStreamRealtimeGrant } from './realtime-grant.js';

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_TRACKING_PIXELS = 1920 * 1080;
const MAX_ENCODE_ATTEMPTS = 4;
const MAX_RESPONSE_BYTES = 64 * 1024;

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: DOMHighResTimeStamp, metadata: unknown) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

let running = false;
let starting = false;
let sequence = 0;
let inFlight = false;
let consecutiveFailures = 0;
let mediaStream: MediaStream | null = null;
let video: VideoWithFrameCallback | null = null;
let canvas: HTMLCanvasElement | null = null;
let callbackHandle: number | null = null;

function dispatch(name: string, detail: Record<string, unknown> = {}): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function cameraGrant() {
  const grant = getStreamRealtimeGrant();
  if (!grant || !grant.publisherCapability || !grant.cameraFrameUrl || grant.expiresAt <= Date.now()) return null;
  return grant;
}

export function standingCameraSupported(): boolean {
  const probe = document.createElement('video') as VideoWithFrameCallback;
  return !!navigator.mediaDevices?.getUserMedia
    && typeof probe.requestVideoFrameCallback === 'function'
    && typeof HTMLCanvasElement !== 'undefined';
}

export function standingCameraAuthorized(): boolean {
  return cameraGrant() !== null;
}

function trackerDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32) {
    throw new Error('STANDING_CAMERA_DIMENSIONS_INVALID');
  }
  const pixels = width * height;
  const scale = pixels > MAX_TRACKING_PIXELS ? Math.sqrt(MAX_TRACKING_PIXELS / pixels) : 1;
  return {
    width: Math.max(32, Math.floor(width * scale)),
    height: Math.max(32, Math.floor(height * scale)),
  };
}

function toJpeg(target: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    target.toBlob((blob) => {
      if (!blob) reject(new Error('STANDING_CAMERA_ENCODE_FAILED'));
      else resolve(blob);
    }, 'image/jpeg');
  });
}

async function encodedFrame(): Promise<Blob> {
  const currentVideo = video;
  const target = canvas;
  if (!currentVideo || !target || currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('STANDING_CAMERA_FRAME_NOT_READY');
  }
  let size = trackerDimensions(currentVideo.videoWidth, currentVideo.videoHeight);
  for (let attempt = 0; attempt < MAX_ENCODE_ATTEMPTS; attempt++) {
    target.width = size.width;
    target.height = size.height;
    const context = target.getContext('2d', { alpha: false });
    if (!context) throw new Error('STANDING_CAMERA_CANVAS_UNAVAILABLE');
    context.drawImage(currentVideo, 0, 0, size.width, size.height);
    const blob = await toJpeg(target);
    if (blob.size > 0 && blob.size <= MAX_FRAME_BYTES) return blob;
    if (blob.size <= 0) throw new Error('STANDING_CAMERA_ENCODE_FAILED');
    const factor = Math.min(0.9, Math.sqrt(MAX_FRAME_BYTES / blob.size) * 0.9);
    size = {
      width: Math.max(32, Math.floor(size.width * factor)),
      height: Math.max(32, Math.floor(size.height * factor)),
    };
  }
  throw new Error('STANDING_CAMERA_FRAME_TOO_LARGE');
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('STANDING_CAMERA_RESPONSE_TOO_LARGE');
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function sendCurrentFrame(): Promise<void> {
  const grant = cameraGrant();
  if (!grant) throw new Error('STANDING_CAMERA_GRANT_MISSING');
  const frame = await encodedFrame();
  sequence++;
  if (sequence > 0xffffffff) throw new Error('STANDING_CAMERA_SEQUENCE_EXHAUSTED');
  const response = await fetch(grant.cameraFrameUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${grant.publisherCapability}`,
      'content-type': frame.type || 'image/jpeg',
      'x-orikuro-sequence': String(sequence),
    },
    body: frame,
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  const payload = await responsePayload(response);
  if (!response.ok || payload.ok !== true) {
    const code = typeof payload.code === 'string' ? payload.code : `STANDING_CAMERA_HTTP_${response.status}`;
    const error = new Error(code) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  consecutiveFailures = 0;
  dispatch('orikuro:standing-tracking-ready', {
    streamId: grant.streamId,
    sequence,
    result: payload.result ?? null,
  });
}

function scheduleNextFrame(): void {
  const current = video;
  if (!running || !current || typeof current.requestVideoFrameCallback !== 'function') return;
  callbackHandle = current.requestVideoFrameCallback(() => {
    callbackHandle = null;
    if (!running) return;
    if (!inFlight) {
      inFlight = true;
      void sendCurrentFrame().catch((error: unknown) => {
        consecutiveFailures++;
        const status = typeof (error as { status?: unknown })?.status === 'number' ? Number((error as { status?: number }).status) : 0;
        dispatch('orikuro:standing-camera-error', {
          code: error instanceof Error ? error.message : 'STANDING_CAMERA_SEND_FAILED',
          status,
          consecutiveFailures,
        });
        if (status === 401 || status === 403 || consecutiveFailures >= 3) {
          void stopStandingCamera(false);
        }
      }).finally(() => {
        inFlight = false;
      });
    }
    scheduleNextFrame();
  });
}

export async function startStandingCamera(): Promise<void> {
  if (running || starting) return;
  if (!standingCameraSupported()) throw new Error('STANDING_CAMERA_UNSUPPORTED');
  if (!cameraGrant()) throw new Error('STANDING_CAMERA_GRANT_MISSING');
  starting = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (!cameraGrant()) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('STANDING_CAMERA_GRANT_MISSING');
    }
    const element = document.createElement('video') as VideoWithFrameCallback;
    element.muted = true;
    element.playsInline = true;
    element.autoplay = true;
    element.srcObject = stream;
    await element.play();
    if (element.videoWidth < 32 || element.videoHeight < 32) {
      stream.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
      throw new Error('STANDING_CAMERA_DIMENSIONS_INVALID');
    }
    mediaStream = stream;
    video = element;
    canvas = document.createElement('canvas');
    sequence = 0;
    consecutiveFailures = 0;
    inFlight = false;
    running = true;
    dispatch('orikuro:standing-camera-started', { payloadRetention: 'none', trackingTarget: 'face' });
    scheduleNextFrame();
  } finally {
    starting = false;
  }
}

export async function stopStandingCamera(userRequested = true): Promise<void> {
  running = false;
  consecutiveFailures = 0;
  const currentVideo = video;
  if (currentVideo && callbackHandle !== null && typeof currentVideo.cancelVideoFrameCallback === 'function') {
    try { currentVideo.cancelVideoFrameCallback(callbackHandle); } catch {}
  }
  callbackHandle = null;
  const stream = mediaStream;
  mediaStream = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  if (currentVideo) currentVideo.srcObject = null;
  video = null;
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  canvas = null;
  if (userRequested) dispatch('orikuro:standing-camera-stopped');
}

window.addEventListener('orikuro:standing-camera-start', () => { void startStandingCamera().catch((error: unknown) => {
  dispatch('orikuro:standing-camera-error', { code: error instanceof Error ? error.message : 'STANDING_CAMERA_START_FAILED', status: 0, consecutiveFailures: 0 });
}); });
window.addEventListener('orikuro:standing-camera-stop', () => { void stopStandingCamera(); });
window.addEventListener('pagehide', () => { void stopStandingCamera(false); }, { once: true });
