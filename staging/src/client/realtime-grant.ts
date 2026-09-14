import { ServiceFlowError } from './service-flow.js';

const STORAGE_KEY = 'oc_stream_realtime_grant_v1';
const STREAM_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_RE = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{32,256}$/;
const NORTHFLANK_HOST = 'health--orikuro-northflank--gzhr8p5vl59b.code.run';
const CLOUDFLARE_STREAMING_HOST = 'orikuro-streaming.garigarimegane625.workers.dev';

type RawGrant = Record<string, unknown>;

export type StreamRealtimeGrant = Readonly<{
  streamId: string;
  capability: string;
  expiresAt: number;
  audioWebSocketUrl: string;
  commentsWebSocketUrl: string;
  publisherCapability?: string;
  cameraFrameUrl?: string;
}>;

function invalid(): never {
  throw new ServiceFlowError('REALTIME_GRANT_INVALID', 'リアルタイム接続情報を確認できません。');
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function validCapability(value: unknown): string {
  if (typeof value !== 'string' || value.length > 12_000 || !CAPABILITY_RE.test(value)) invalid();
  return value;
}

function validWsUrl(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 512) invalid();
  let url: URL;
  try { url = new URL(value); } catch { invalid(); }
  if (
    url.protocol !== 'wss:'
    || url.hostname !== NORTHFLANK_HOST
    || (url.port && url.port !== '443')
    || url.username
    || url.password
    || url.pathname !== path
    || url.search
    || url.hash
  ) invalid();
  return url.toString();
}

function validCameraUrl(value: unknown, streamId: string): string {
  if (typeof value !== 'string' || value.length > 512) invalid();
  let url: URL;
  try { url = new URL(value); } catch { invalid(); }
  if (
    url.protocol !== 'https:'
    || url.hostname !== CLOUDFLARE_STREAMING_HOST
    || (url.port && url.port !== '443')
    || url.username
    || url.password
    || url.pathname !== `/v1/streams/${encodeURIComponent(streamId)}/camera-frame`
    || url.search
    || url.hash
  ) invalid();
  return url.toString();
}

function parseGrant(value: unknown): StreamRealtimeGrant {
  const raw = asObject(value) as RawGrant;
  const streamId = raw.streamId;
  const expiresAt = raw.expiresAt;
  if (
    typeof streamId !== 'string'
    || !STREAM_ID_RE.test(streamId)
    || typeof expiresAt !== 'number'
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Date.now()
    || expiresAt > Date.now() + 11 * 60_000
  ) invalid();

  const publisherPresent = raw.publisherCapability !== undefined || raw.cameraFrameUrl !== undefined;
  if ((raw.publisherCapability === undefined) !== (raw.cameraFrameUrl === undefined)) invalid();

  const base = {
    streamId,
    capability: validCapability(raw.capability),
    expiresAt,
    audioWebSocketUrl: validWsUrl(raw.audioWebSocketUrl, '/realtime/audio'),
    commentsWebSocketUrl: validWsUrl(raw.commentsWebSocketUrl, '/realtime/comments'),
  };
  if (!publisherPresent) return Object.freeze(base);
  return Object.freeze({
    ...base,
    publisherCapability: validCapability(raw.publisherCapability),
    cameraFrameUrl: validCameraUrl(raw.cameraFrameUrl, streamId),
  });
}

export function clearStreamRealtimeGrant(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function storeStreamRealtimeGrant(value: unknown): StreamRealtimeGrant {
  clearStreamRealtimeGrant();
  const grant = parseGrant(value);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(grant));
  return grant;
}

export function getStreamRealtimeGrant(): StreamRealtimeGrant | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const grant = parseGrant(JSON.parse(raw));
    if (grant.expiresAt <= Date.now()) {
      clearStreamRealtimeGrant();
      return null;
    }
    return grant;
  } catch {
    clearStreamRealtimeGrant();
    return null;
  }
}
