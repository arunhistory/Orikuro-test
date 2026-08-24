(() => {
  'use strict';

  type DeletePayload = {
    ok?: boolean;
    code?: string;
    message?: string;
  };

  const DELETE_API = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/preregister-delete';
  const EXPIRED_PAGE = './email-delete-expired.html';
  const REQUEST_TIMEOUT_MS = 12000;

  const button = document.querySelector<HTMLButtonElement>('[data-email-delete-button]');
  const status = document.querySelector<HTMLElement>('[data-email-delete-status]');
  const panel = document.querySelector<HTMLElement>('[data-email-delete-panel]');
  const complete = document.querySelector<HTMLElement>('[data-email-delete-complete]');

  if (!button || !status || !panel || !complete) return;

  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();

  const setStatus = (message: string, error = false): void => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };

  const redirectExpired = (): void => {
    window.location.replace(EXPIRED_PAGE);
  };

  if (token.length < 32 || token.length > 512) {
    redirectExpired();
    return;
  }

  button.disabled = false;
  setStatus('削除する場合は、下のボタンを押してください。');

  button.addEventListener('click', () => {
    void (async () => {
      if (button.disabled) return;

      button.disabled = true;
      button.textContent = '削除しています…';
      setStatus('事前登録メールアドレスを削除しています。');

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(DELETE_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete', token }),
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null) as DeletePayload | null;

        if (response.status === 410 || payload?.code === 'TOKEN_EXPIRED' || payload?.code === 'TOKEN_USED') {
          redirectExpired();
          return;
        }

        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.message || '削除処理に失敗しました。時間をおいて再度お試しください。');
        }

        panel.hidden = true;
        complete.hidden = false;
        document.title = '削除完了 | Original Create Project';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setStatus('削除処理がタイムアウトしました。もう一度お試しください。', true);
        } else {
          setStatus(error instanceof Error ? error.message : '削除処理に失敗しました。', true);
        }
        button.disabled = false;
        button.textContent = '削除する';
      } finally {
        window.clearTimeout(timeout);
      }
    })();
  });
})();
