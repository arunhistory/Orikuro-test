import { clearServiceFlowToken, consumeServiceFlow, isFlowTimeout } from './service-flow.js?v=20260918-flow2';
import { clearStreamRealtimeGrant, storeStreamRealtimeGrant } from './realtime-grant.js';

function currentRelativePath(): string {
  const file = location.pathname.split('/').filter(Boolean).at(-1) || '';
  return `./${file}`;
}

function statusTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-service-gate-status]');
}

function contentTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-service-content]');
}

function returnHome(message: string): void {
  const status = statusTarget();
  if (status) status.textContent = message;
  const content = contentTarget();
  if (content) content.hidden = true;
  clearStreamRealtimeGrant();
  clearServiceFlowToken();
  setTimeout(() => location.replace('./index.html'), 1100);
}

async function authorize(): Promise<void> {
  const status = statusTarget();
  if (status) status.textContent = '利用準備を確認しています。';
  const path = currentRelativePath();
  try {
    const consumed = await consumeServiceFlow(path);
    let detail: Record<string, unknown> = { path };

    if (path === './stream-test.html') {
      const raw = consumed.realtimeGrant;
      const grant = storeStreamRealtimeGrant(raw);
      detail = { ...detail, streamId: grant.streamId };
    } else {
      clearStreamRealtimeGrant();
      if (path === './watch-test.html') {
        const watchGrant = consumed.watchGrant;
        if (!watchGrant || typeof watchGrant !== 'object' || Array.isArray(watchGrant)) {
          throw new Error('WATCH_GRANT_MISSING');
        }
        detail = { ...detail, watchGrant };
      }
    }

    clearServiceFlowToken();
    if (status) status.textContent = '';
    const content = contentTarget();
    if (content) content.hidden = false;
    document.dispatchEvent(new CustomEvent('orikuro:service-ready', { detail }));
  } catch (error) {
    returnHome(isFlowTimeout(error) ? 'タイムアウトしました。' : '利用準備ができません。');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void authorize(); }, { once: true });
} else {
  void authorize();
}
