/*
  site.config.mjs — 公開側とテスト側の設定（ここだけで決める）
  ------------------------------------------------------------
  GitHub Pages は pages-preview ブランチを公開していて、その中身は
    ・一番上        … 公開側（今は main ブランチの中身）
    ・staging/ の中 … テスト側（今は staging ブランチの中身）
  という並びです。このサイトも同じ並びで書き出します。

  base … 公開されるURLの頭の部分。独自ドメインに変えるときはここを直す。
  outDir … ビルド結果の置き場所（site/dist/ の中。リポジトリには入れない）。
  pagesDir … pages-preview の中で置く場所（'' = 一番上）。
*/
export const SIDES = {
  public: {
    label: '公開側',
    base: '/Orikuro-test/',
    outDir: 'dist/public',
    pagesDir: '',
  },
  staging: {
    label: 'テスト側',
    base: '/Orikuro-test/staging/',
    outDir: 'dist/staging',
    pagesDir: 'staging',
  },
};

export const SITE_ORIGIN = 'https://arunhistory.github.io';

export function currentSide() {
  const side = process.env.SITE_SIDE ?? 'public';
  if (!(side in SIDES)) {
    throw new Error(`SITE_SIDE は public か staging にしてください（今の値: ${side}）`);
  }
  return side;
}
