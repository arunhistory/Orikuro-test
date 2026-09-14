import { getServiceFlowToken, ServiceFlowError } from './service-flow.js';

const GRANT_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-authorization';
const STORAGE_KEY = 'oc_stream_realtime_grant_v1';
const REQUEST_TIMEOUT_MS = 8_000;
const STREAM_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_RE = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{32,256}$/;
const NORTHFLANK_HOST = 'health--orikuro-northflank--gzhr8p5vl59b.code.run';

type RawGrant = Record<string, unknown>;

export type StreamRealtimeGrant = Readonly<{
  streamId: string;
  capability: string;
  expiresAt: number;
  audioWebSocketUrl: string;
  commentsWebSocketUrl: string;
}>;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceFlowError('REALTIME_GRANT_INVALID', 'リアルタイム接続情報を確認できません。');
  }
  return value as Record<string, unknown>;
}

function validWsUrl(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 512) {
    throw new ServiceFlowError('REALTIME_GRANT_INVALID', 'リアルタイム接続先を確認できません。');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceFlowError('REALTIME_GRANT_INVALID', 'リアルタイム接続先を確認できません。');
  }
  if (
    url.protocol !== 'wss:'
    || url.hostname !== NORTHFLANK_HOST
    || (url.port && url.port !== '443')
    || url.username
    || url.password
    || url.pathname !== path
    || url.search
    || url.hash
  ) {
    throw new ServiceFlowError('REALTIME_GRANT_INVALID', 'リアルタイム接続先を確認できません。');
  }
  return url.toString();
}

function parseGrant(value: unknown): StreamRealtimeGrant {
  const raw = asObject(value) as RawGrant;
  const streamId = raw.streamId;
  const capability = raw.capability;
  const expiresAt = raw.expiresAt;
  if (
    typeof streamId !== 'string'
    || !STREAM_ID_RE.test(streamId)
    || typeof capability !== 'string'
    || capability.length > 12_000
    || !CAPABILITY_RE.test(capability)
    || typeof expiresAt !== 'number'
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Date.now()
    || expiresAt > Date.now() + 11 * 60_000
  ) {
    throw new ServiceFlowError('REALTIME_GRANT_INVALID', 'リアルタイム接続情報を確認できません。');
  }
  return Object.freeze({
    streamId,
    capability,
    expiresAt,
    audioWebSocketUrl: validWsUrl(raw.audioWebSocketUrl, '/realtime/audio'),
    commentsWebSocketUrl: validWsUrl(raw.commentsWebSocketUrl, '/realtime/comments'),
  });
}

export function clearStreamRealtimeGrant(): void {
  sessionStorage.removeItem(STORAGE_KEY);
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

export async function prepareStreamRealtimeGrant(): Promise<StreamRealtimeGrant> {
  const flowToken = getServiceFlowToken();
  if (!flowToken) {
    throw new ServiceFlowError('FLOW_MISSING', '利用準備を確認できません。');
  }
  clearStreamRealtimeGrant();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GRANT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flowToken }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const root = asObject(payload);
    if (!response.ok || root.ok !== true) {
      throw new ServiceFlowError(
        typeof root.code === 'string' ? root.code : `HTTP_${response.status}`,
        'リアルタイム接続を準備できません。',
      );
    }
    const grant = parseGrant(asObject(root.result));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(grant));
    return grant;
  } catch (error) {
    clearStreamRealtimeGrant();
    if (error instanceof ServiceFlowError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ServiceFlowError('REALTIME_GRANT_TIMEOUT', 'リアルタイム接続の準備がタイムアウトしました。');
    }
    throw new ServiceFlowError('REALTIME_GRANT_NETWORK', 'リアルタイム接続の準備に失敗しました。');
  } finally {
    clearTimeout(timeout);
  }
}
