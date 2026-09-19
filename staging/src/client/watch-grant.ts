import { ServiceFlowError } from './service-flow.js';

const STORAGE_KEY = 'oc_watch_realtime_grant_v1';
const STREAM_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_RE = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{32,256}$/;
const NORTHFLANK_HOST = 'health--orikuro-northflank--gzhr8p5vl59b.code.run';

export type WatchRealtimeGrant = Readonly<{
  streamId: string;
  capability: string;
  expiresAt: number;
  mediaWebSocketUrl: string;
}>;

function parseGrant(value: unknown): WatchRealtimeGrant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceFlowError('WATCH_GRANT_INVALID', '視聴接続情報を確認できません。');
  const raw = value as Record<string, unknown>;
  const streamId = raw.streamId;
  const capability = raw.capability;
  const expiresAt = raw.expiresAt;
  const mediaWebSocketUrl = raw.mediaWebSocketUrl;
  if (typeof streamId !== 'string' || !STREAM_ID_RE.test(streamId) || typeof capability !== 'string' || capability.length > 12_000 || !CAPABILITY_RE.test(capability) || typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 11 * 60_000 || typeof mediaWebSocketUrl !== 'string') throw new ServiceFlowError('WATCH_GRANT_INVALID', '視聴接続情報を確認できません。');
  let url: URL;
  try { url = new URL(mediaWebSocketUrl); } catch { throw new ServiceFlowError('WATCH_GRANT_INVALID', '視聴接続先を確認できません。'); }
  if (url.protocol !== 'wss:' || url.hostname !== NORTHFLANK_HOST || (url.port && url.port !== '443') || url.username || url.password || url.pathname !== '/realtime/media' || url.search || url.hash) throw new ServiceFlowError('WATCH_GRANT_INVALID', '視聴接続先を確認できません。');
  return Object.freeze({ streamId, capability, expiresAt, mediaWebSocketUrl: url.toString() });
}

export function clearWatchRealtimeGrant(): void { sessionStorage.removeItem(STORAGE_KEY); }
export function storeWatchRealtimeGrant(value: unknown): WatchRealtimeGrant { clearWatchRealtimeGrant(); const grant = parseGrant(value); sessionStorage.setItem(STORAGE_KEY, JSON.stringify(grant)); return grant; }
export function takeWatchRealtimeGrant(): WatchRealtimeGrant | null { const raw = sessionStorage.getItem(STORAGE_KEY); clearWatchRealtimeGrant(); if (!raw) return null; try { return parseGrant(JSON.parse(raw)); } catch { return null; } }
