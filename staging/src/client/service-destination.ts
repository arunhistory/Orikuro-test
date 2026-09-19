import { clearServiceFlowToken, consumeServiceFlow, isFlowTimeout } from './service-flow.js?v=20260918-flow3';
import { clearStreamRealtimeGrant, getStreamRealtimeGrant } from './realtime-grant.js';
import { clearWatchRealtimeGrant, takeWatchRealtimeGrant } from './watch-grant.js';

function currentRelativePath(): string { const file = location.pathname.split('/').filter(Boolean).at(-1) || ''; return `./${file}`; }
function statusTarget(): HTMLElement | null { return document.querySelector<HTMLElement>('[data-service-gate-status]'); }
function contentTarget(): HTMLElement | null { return document.querySelector<HTMLElement>('[data-service-content]'); }
function reveal(detail: Record<string, unknown>): void { const status = statusTarget(); if (status) status.textContent = ''; const content = contentTarget(); if (content) content.hidden = false; document.dispatchEvent(new CustomEvent('orikuro:service-ready', { detail })); }
function returnHome(message: string): void { const status = statusTarget(); if (status) status.textContent = message; const content = contentTarget(); if (content) content.hidden = true; clearStreamRealtimeGrant(); clearWatchRealtimeGrant(); clearServiceFlowToken(); setTimeout(() => location.replace('./index.html'), 1100); }

async function authorize(): Promise<void> {
  const status = statusTarget();
  if (status) status.textContent = '利用準備を確認しています。';
  const path = currentRelativePath();
  try {
    if (path === './stream-test.html') {
      const grant = getStreamRealtimeGrant();
      if (!grant) throw new Error('STREAM_GRANT_MISSING');
      clearWatchRealtimeGrant(); clearServiceFlowToken(); reveal({ path, streamId: grant.streamId }); return;
    }
    if (path === './watch-test.html') {
      const watchGrant = takeWatchRealtimeGrant();
      if (!watchGrant) throw new Error('WATCH_GRANT_MISSING');
      clearStreamRealtimeGrant(); clearServiceFlowToken(); reveal({ path, watchGrant }); return;
    }
    await consumeServiceFlow(path);
    clearStreamRealtimeGrant(); clearWatchRealtimeGrant(); clearServiceFlowToken(); reveal({ path });
  } catch (error) { returnHome(isFlowTimeout(error) ? 'タイムアウトしました。' : '利用準備ができません。'); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void authorize(); }, { once: true }); else void authorize();
