import { clearServiceFlowToken, consumeServiceFlow, isFlowTimeout } from './service-flow.js';

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
  clearServiceFlowToken();
  setTimeout(() => location.replace('./index.html'), 1100);
}

async function authorize(): Promise<void> {
  const status = statusTarget();
  if (status) status.textContent = '利用準備を確認しています。';
  try {
    await consumeServiceFlow(currentRelativePath());
    clearServiceFlowToken();
    if (status) status.textContent = '';
    const content = contentTarget();
    if (content) content.hidden = false;
  } catch (error) {
    returnHome(isFlowTimeout(error) ? 'タイムアウトしました。' : 'このサービスを直接開くことはできません。');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void authorize(); }, { once: true });
} else {
  void authorize();
}
