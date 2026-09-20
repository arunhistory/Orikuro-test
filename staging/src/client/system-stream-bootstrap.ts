import { clearStreamRealtimeGrant, storeStreamRealtimeGrant } from './realtime-grant.js';

const START_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/system-stream-test';
const STOP_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow';
const OP_RE = /^[a-f0-9]{64}$/;
const CAP_RE = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{32,256}$/;
const SID_RE = /^[A-Za-z0-9_-]{16,128}$/;

type JsonObject = Record<string, unknown>;

let accessKey: string | null = null;
let starting = false;
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
async function stopRaw(value: unknown): Promise<void> {
  const raw = asObject(value);
  if (!raw) return;
  const streamId = raw.streamId;
  const controlCapability = raw.controlCapability;
  if (
    typeof streamId !== 'string'
    || !SID_RE.test(streamId)
    || typeof controlCapability !== 'string'
    || controlCapability.length > 12_000
    || !CAP_RE.test(controlCapability)
  ) return;
  try {
    await fetch(STOP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stream_stop', streamId, controlCapability }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      keepalive: true,
    });
  } catch {}
}
function failMessage(code: string): string {
  if (code === 'SYSTEM_STREAM_ACTIVE_BUSY') return '別の配信テストが実行中です。';
  if (code === 'ACCESS_NOT_VALID') return 'このテストURLは無効、または期限切れです。';
  return '配信を開始できませんでした。';
}

function revealPrep(): void {
  clearStreamRealtimeGrant();
  const status = statusTarget();
  const content = contentTarget();
  accessKey = takeAccessKey();
  if (!accessKey) {
    if (status) status.textContent = '有効なテストURLではありません。';
    if (content) content.hidden = true;
    return;
  }
  document.documentElement.dataset.systemAccessReady = 'true';
  if (status) status.textContent = '';
  if (content) content.hidden = false;
  document.dispatchEvent(new CustomEvent('orikuro:system-access-ready'));
}

async function beginSystemStream(mode: string): Promise<void> {
  if (starting || !accessKey) return;
  starting = true;
  rawGrant = null;
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
      const code = payload && typeof payload.code === 'string' ? payload.code : 'SYSTEM_STREAM_START_FAILED';
      throw new Error(failMessage(code));
    }
    const result = asObject(payload.result);
    if (!result) throw new Error('SYSTEM_STREAM_RESULT_INVALID');
    rawGrant = result.realtimeGrant;
    const grant = storeStreamRealtimeGrant(rawGrant);
    document.dispatchEvent(new CustomEvent('orikuro:service-ready', {
      detail: { path: './system-stream-test.html', streamId: grant.streamId, systemTest: true },
    }));
    window.dispatchEvent(new CustomEvent('orikuro:stream-start-request', { detail: { mode } }));
  } catch (error) {
    if (rawGrant) await stopRaw(rawGrant);
    rawGrant = null;
    clearStreamRealtimeGrant();
    starting = false;
    const message = error instanceof Error && error.message ? error.message : '配信を開始できませんでした。';
    window.dispatchEvent(new CustomEvent('orikuro:stream-start-failed', { detail: { message } }));
  }
}

window.addEventListener('orikuro:system-start-request', (event) => {
  const detail = asObject((event as CustomEvent).detail);
  const mode = typeof detail?.mode === 'string' ? detail.mode : 'radio';
  void beginSystemStream(mode);
});

window.addEventListener('orikuro:stream-live', () => { starting = false; });
window.addEventListener('orikuro:stream-start-failed', () => { starting = false; });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', revealPrep, { once: true });
} else {
  revealPrep();
}
