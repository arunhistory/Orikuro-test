type DeletePayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  requestKind?: 'registered' | 'unregistered';
};

const DELETE_API = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/preregister-delete';
const EXPIRED_PAGE = './email-delete-expired.html';
const NOT_REGISTERED_PAGE = './email-delete-not-registered.html';
const REQUEST_TIMEOUT_MS = 12000;

const button = document.querySelector<HTMLButtonElement>('[data-email-delete-button]');
const status = document.querySelector<HTMLElement>('[data-email-delete-status]');
const panel = document.querySelector<HTMLElement>('[data-email-delete-panel]');
const complete = document.querySelector<HTMLElement>('[data-email-delete-complete]');

if (button && status && panel && complete) {
  const token = (new URLSearchParams(location.search).get('token') || '').trim();

  const setStatus = (message: string, error = false): void => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };

  const redirectExpired = (): void => location.replace(EXPIRED_PAGE);
  const redirectNotRegistered = (): void => location.replace(`${NOT_REGISTERED_PAGE}?token=${encodeURIComponent(token)}`);

  const request = async (action: 'inspect' | 'delete'): Promise<DeletePayload> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(DELETE_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, token }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as DeletePayload | null;
      if (response.status === 410 || payload?.code === 'TOKEN_EXPIRED' || payload?.code === 'TOKEN_USED') {
        redirectExpired();
        throw new Error('expired');
      }
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message || '削除URLを確認できませんでした。');
      }
      return payload;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const initialize = async (): Promise<void> => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      redirectExpired();
      return;
    }
    button.disabled = true;
    setStatus('削除URLを確認しています。');
    try {
      const payload = await request('inspect');
      if (payload.requestKind === 'unregistered') {
        redirectNotRegistered();
        return;
      }
      if (payload.requestKind !== 'registered') throw new Error('削除対象を確認できませんでした。');
      button.disabled = false;
      setStatus('削除する場合は、下のボタンを押してください。');
    } catch (error) {
      if (error instanceof Error && error.message === 'expired') return;
      setStatus(error instanceof Error ? error.message : '削除URLを確認できませんでした。', true);
    }
  };

  button.addEventListener('click', () => {
    void (async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = '削除しています…';
      setStatus('事前登録メールアドレスを削除しています。');
      try {
        await request('delete');
        panel.hidden = true;
        complete.hidden = false;
        document.title = '削除完了 | Original Create Project';
        history.replaceState(null, '', './email-delete.html');
      } catch (error) {
        if (error instanceof Error && error.message === 'expired') return;
        setStatus(error instanceof DOMException && error.name === 'AbortError'
          ? '削除処理がタイムアウトしました。もう一度お試しください。'
          : error instanceof Error ? error.message : '削除処理に失敗しました。', true);
        button.disabled = false;
        button.textContent = '削除する';
      }
    })();
  });

  void initialize();
}
