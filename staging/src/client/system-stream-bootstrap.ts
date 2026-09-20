import { clearStreamRealtimeGrant, getStreamRealtimeGrant, storeStreamRealtimeGrant } from './realtime-grant.js';

const START_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/system-stream-test';
const STOP_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow';
const OP_RE = /^[a-f0-9]{64}$/;
const CAP_RE = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{32,256}$/;
const SID_RE = /^[A-Za-z0-9_-]{16,128}$/;

type JsonObject = Record<string, unknown>;

let accessKey: string | null = null;
let preparing = false;
let prepared = false;
let rawGrant: unknown = null;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}
function statusTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-service-gate-status]');
}
function contentTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-service-content]');
}
function takeAccessKey(): string | null {
  const params = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : '');
  const key = params.get('access') || params.get('op') || '';
  history.replaceState(null, '', location.pathname + location.search);
  return OP_RE.test(key) ? key : null;
}
async function stopRaw(value: unknown, keepalive = false): Promise<boolean> {
  const raw = asObject(value);
  if (!raw) return false;
  const streamId = raw.streamId;
  const controlCapability = raw.controlCapability;
  if (
    typeof streamId !== 'string'
    || !SID_RE.test(streamId)
    || typeof controlCapability !== 'string'
    || controlCapability.length > 12_000
    || !CAP_RE.test(controlCapability)
  ) return false;
  try {
    const response = await fetch(STOP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stream_stop', streamId, controlCapability }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      keepalive,
    });
    const payload = asObject(await response.json().catch(() => null));
    const result = asObject(payload?.result);
    return response.ok
      && payload?.ok === true
      && result?.streamId === streamId
      && result?.cloudflareStopped === true
      && result?.northflankRevoked === true;
  } catch {
    return false;
  }
}

function failMessage(code: string): string {
  if (code === 'SYSTEM_STREAM_ACTIVE_BUSY') return '別の配信テストが実行中です。';
  if (code === 'ACCESS_NOT_VALID') return 'このテストURLは無効、または期限切れです。';
  return '配信準備を完了できませんでした。';
}

async function revealPrep(): Promise<void> {
  const status = statusTarget();
  const content = contentTarget();
  accessKey = takeAccessKey();
  if (!accessKey) {
    if (status) status.textContent = '有効なテストURLではありません。';
    if (content) content.hidden = true;
    return;
  }

  const previous = getStreamRealtimeGrant();
  if (previous) {
    if (status) status.textContent = '前回の配信を終了しています…';
    const cleaned = await stopRaw(previous);
    if (!cleaned) {
      if (status) status.textContent = '前回の配信終了を確認できません。もう一度開いてください。';
      if (content) content.hidden = true;
      return;
    }
  }
  clearStreamRealtimeGrant();

  document.documentElement.dataset.systemAccessReady = 'true';
  if (status) status.textContent = '';
  if (content) content.hidden = false;
  document.dispatchEvent(new CustomEvent('orikuro:system-access-ready'));
}

async function prepareSystemStream(): Promise<void> {
  if (prepared || preparing || !accessKey) return;
  preparing = true;
  rawGrant = null;
  window.dispatchEvent(new CustomEvent('orikuro:stream-preparing'));
  try {
    const response = await fetch(START_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessKey }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const payload = asObject(await response.json().catch(() => null));
    if (!response.ok || !payload || payload.ok !== true) {
      const code = payload && typeof payload.code === 'string' ? payload.code : 'SYSTEM_STREAM_PREPARE_FAILED';
      throw new Error(failMessage(code));
    }
    const result = asObject(payload.result);
    if (!result) throw new Error('SYSTEM_STREAM_RESULT_INVALID');
    rawGrant = result.realtimeGrant;
    const grant = storeStreamRealtimeGrant(rawGrant);
    prepared = true;
    preparing = false;
    document.dispatchEvent(new CustomEvent('orikuro:service-ready', {
      detail: { path: './system-stream-test.html', streamId: grant.streamId, systemTest: true },
    }));
  } catch (error) {
    if (rawGrant) await stopRaw(rawGrant);
    rawGrant = null;
    clearStreamRealtimeGrant();
    prepared = false;
    preparing = false;
    const message = error instanceof Error && error.message ? error.message : '配信準備を完了できませんでした。';
    window.dispatchEvent(new CustomEvent('orikuro:stream-prepare-failed', { detail: { message } }));
  }
}

window.addEventListener('orikuro:system-prepare-request', () => {
  void prepareSystemStream();
});

window.addEventListener('orikuro:stream-ended', () => {
  preparing = false;
  prepared = false;
  rawGrant = null;
});
window.addEventListener('orikuro:stream-stop-failed', () => { preparing = false; });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void revealPrep(); }, { once: true });
} else {
  void revealPrep();
}
