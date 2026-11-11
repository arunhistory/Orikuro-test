/*
  menu.ts — メニューの開け閉めと、仮置きリンクを押しても移動しないようにすることだけを行う。
  リンク先やCSSを書き換える処理はここに書かない（リンクはHTMLの時点で正しい）。
*/
const button = document.querySelector<HTMLButtonElement>('[data-menu-button]');
const menu = document.querySelector<HTMLElement>('[data-mobile-menu]');

function setOpen(open: boolean) {
  if (!button || !menu) return;
  button.classList.toggle('is-open', open);
  menu.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
}

button?.addEventListener('click', () => setOpen(!menu?.classList.contains('is-open')));
menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setOpen(false);
});

// 仮置きのリンク（navigation.ts で placeholder: true）は、押しても移動しない。
document.querySelectorAll('[data-placeholder-link]').forEach((link) => {
  link.addEventListener('click', (event) => event.preventDefault());
});
