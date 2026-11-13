// copy-staging-apps.mjs — テスト側だけのテスト画面（site/apps-staging/）を書き出し先へ写す。
// build.mjs からテスト側のビルドのときだけ呼ばれる。
//
// apps-staging/ の中身：
//   <画面名>/index.html … 配信テスト・視聴テストなどの画面（元の staging のHTMLそのまま。参照先だけ新しい場所に直してある）
//   apps/               … その画面が使うCSSとJS
// 画面は1段深いフォルダにあるので、参照は "../apps/…" "../assets/js/…" の形で書いてある。
// data-site-base="../" は、書き出すときにサイトの一番上の絶対パスに置き換える（JSが使う）。
import { cp, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIDES } from '../site.config.mjs';

export async function copyStagingApps() {
  const from = fileURLToPath(new URL('../apps-staging/', import.meta.url));
  const to = fileURLToPath(new URL(`../${SIDES.staging.outDir}/`, import.meta.url));
  let pages = 0;
  for (const ent of await readdir(from, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const target = join(to, ent.name);
    try { await stat(target); throw new Error(`apps-staging/${ent.name} と同じ名前のページが既にあります（src/pages* と重ねない）`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    await cp(join(from, ent.name), target, { recursive: true });
    const index = join(target, 'index.html');
    try {
      const html = await readFile(index, 'utf8');
      await writeFile(index, html.replace('data-site-base="../"', `data-site-base="${SIDES.staging.base}"`));
      pages++;
    } catch {}
  }
  console.log(`✔ テスト側だけのテスト画面を ${pages} 画面写しました`);
}
