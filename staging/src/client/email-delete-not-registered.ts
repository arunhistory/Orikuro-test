type InspectPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  requestKind?: 'registered' | 'unregistered';
};

const DELETE_API = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/preregister-delete';
const EXPIRED_PAGE = './email-delete-expired.html';
const DELETE_PAGE = './email-delete.html';
const REQUEST_TIMEOUT_MS = 12000;

const panel = document.querySelector<HTMLElement>('[data-not-registered-panel]');
const status = document.querySelector<HTMLElement>('[data-not-registered-status]');

if (panel && status) {
  const token = (new URLSearchParams(location.search).get('token') || '').trim();

  const redirectExpired = (): void => location.replace(EXPIRED_PAGE);
  const redirectDelete = (): void => location.replace(`${DELETE_PAGE}?token=${encodeURIComponent(token)}`);

  const initialize = async (): Promise<void> => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      redirectExpired();
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(DELETE_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'inspect', token }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as InspectPayload | null;
      if (response.status === 410 || payload?.code === 'TOKEN_EXPIRED' || payload?.code === 'TOKEN_USED') {
        redirectExpired();
        return;
      }
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.message || '確認URLを利用できません。');
      if (payload.requestKind === 'registered') {
        redirectDelete();
        return;
      }
      if (payload.requestKind !== 'unregistered') throw new Error('確認内容を取得できませんでした。');

      status.hidden = true;
      panel.hidden = false;
    } catch (error) {
      status.textContent = error instanceof DOMException && error.name === 'AbortError'
        ? '確認処理がタイムアウトしました。もう一度お試しください。'
        : error instanceof Error ? error.message : '確認URLを利用できません。';
      status.classList.add('is-error');
    } finally {
      window.clearTimeout(timeout);
    }
  };

  void initialize();
}
