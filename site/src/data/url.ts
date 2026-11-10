/*
  url.ts — サイトの中のリンクを作る関数
  ------------------------------------------------------------
  リンクは必ず href('/legal/terms/') のように書きます。
  公開側なら /Orikuro-test/legal/terms/、テスト側なら
  /Orikuro-test/staging/legal/terms/ に自動でなります。
*/
import type { Side } from './navigation';

export const side = import.meta.env.SITE_SIDE as Side;

export function href(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + (path.startsWith('/') ? path : '/' + path);
}

/** 今のページかどうか（メニューの aria-current 用） */
export function isCurrent(path: string, pathname: string): boolean {
  return href(path) === pathname;
}
