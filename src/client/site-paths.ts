/*
  site-paths.ts — 新しいURLと、サーバーが使っている古いファイル名の対応
  ------------------------------------------------------------
  サーバー（Supabase の oc_service_routes・mail-system）は、利用の流れの行き先を
  古いファイル名（'./algorithm-test.html' など）で持っている。
  サーバーは変えずに、ブラウザの側で「古いファイル名 ⇔ 新しいURL」を読み替える。
  対応は site/src/data/redirects.mjs と同じにすること（npm run check で確かめる）。
*/
const LEGACY_TO_PATH: Record<string, string> = {
  './algorithm-test.html': 'algorithm-test/',
  './stream-test.html': 'stream-test/',
  './watch-test.html': 'watch-test/',
};

/** サイトの一番上（公開側 /Orikuro-test/、テスト側 /Orikuro-test/staging/） */
export function siteBase(): string {
  return document.documentElement.dataset.siteBase || '/';
}

/** サイトの一番上からの道のり → 絶対URL */
export function siteUrl(path: string): string {
  return new URL(path.replace(/^\.?\//, ''), new URL(siteBase(), location.origin)).href;
}

/** 今のページを、サーバーが知っている古いファイル名で返す（無ければエラー） */
export function legacyPathForCurrentPage(): string {
  const base = siteBase();
  if (!location.pathname.startsWith(base)) throw new Error('サービスの場所を確認できません。');
  const path = location.pathname.slice(base.length);
  const legacy = Object.keys(LEGACY_TO_PATH).find((key) => LEGACY_TO_PATH[key] === path);
  if (!legacy) throw new Error('サービスの場所を確認できません。');
  return legacy;
}

/** サーバーから来た古いファイル名 → 新しいURL（知らない名前ならエラー） */
export function urlForLegacyPath(legacy: unknown): string {
  if (typeof legacy !== 'string' || !(legacy in LEGACY_TO_PATH)) {
    throw new Error('サービスの移動先を確認できません。');
  }
  return siteUrl(LEGACY_TO_PATH[legacy]);
}
