// main.js 105〜125行: サービス入口の動作を全ページで共有する。
// 表示されるリンクはHTML段階で /consent/、JSの役割は利用の札の取得だけ。
import { href } from '../data/url';

type ServiceEntry = 'stream' | 'watch' | 'algorithm';
const toast = document.querySelector<HTMLElement>('[data-toast]');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

document.querySelectorAll<HTMLAnchorElement>('[data-service-entry]').forEach((link) => {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    if (link.dataset.serviceLoading === '1') return;
    link.dataset.serviceLoading = '1';
    try {
      const entry = link.dataset.serviceEntry;
      if (!['stream', 'watch', 'algorithm'].includes(entry || '')) {
        throw new Error('サービス入口を確認できません。');
      }
      const { startServiceFlow } = await import(/* @vite-ignore */ href('/assets/js/service-flow.js'));
      await startServiceFlow(entry as ServiceEntry);
      location.assign(href('/consent/'));
    } catch (error) {
      if (toast) {
        toast.textContent = error instanceof Error && error.message ? error.message : '利用準備に失敗しました。';
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1600);
      }
    } finally {
      delete link.dataset.serviceLoading;
    }
  });
});
