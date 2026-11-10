// assemble-pages.mjs — 公開側とテスト側を、GitHub Pages（pages-preview ブランチ）と同じ並びにまとめる。
//   dist/pages/            ← 公開側（dist/public の中身）
//   dist/pages/staging/    ← テスト側（dist/staging の中身）
// 使い方: node tools/assemble-pages.mjs
import { cp, rm, writeFile, access } from 'node:fs/promises';
import { SIDES } from '../site.config.mjs';

const dist = new URL('../dist/', import.meta.url);
const out = new URL('pages/', dist);

for (const side of Object.keys(SIDES)) {
  try { await access(new URL(`../${SIDES[side].outDir}/`, import.meta.url)); }
  catch { console.error(`${SIDES[side].label} がまだビルドされていません。先に node tools/build.mjs ${side} を実行してください`); process.exit(1); }
}

await rm(out, { recursive: true, force: true });
for (const [side, conf] of Object.entries(SIDES)) {
  const to = new URL(conf.pagesDir ? `${conf.pagesDir}/` : '', out);
  await cp(new URL(`../${conf.outDir}/`, import.meta.url), to, { recursive: true });
  console.log(`✔ ${conf.label} → dist/pages/${conf.pagesDir ? conf.pagesDir + '/' : ''}`);
}
await writeFile(new URL('.nojekyll', out), '');
console.log('\n✔ dist/pages/ が pages-preview ブランチと同じ並びになりました');
