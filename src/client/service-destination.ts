import { clearServiceFlowToken, consumeServiceFlow, isFlowTimeout } from './service-flow.js?v=20260827-flow1';
import { clearStreamRealtimeGrant, prepareStreamRealtimeGrant } from './realtime-grant.js';

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
    // The flow token is deleted by consumeServiceFlow. The stream page therefore
    // obtains its scoped realtime capability immediately before consuming the
    // one-time delivery flow. No flow token is retained by the stream runtime.
    if (path === './stream-test.html') {
      await prepareStreamRealtimeGrant();
    }
    await consumeServiceFlow(path);
    clearServiceFlowToken();
    if (status) status.textContent = '';
    const content = contentTarget();
    if (content) content.hidden = false;
    document.dispatchEvent(new CustomEvent('orikuro:service-ready', { detail: { path } }));
  } catch (error) {
    returnHome(isFlowTimeout(error) ? 'タイムアウトしました。' : '利用準備ができません。');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void authorize(); }, { once: true });
} else {
  void authorize();
}
