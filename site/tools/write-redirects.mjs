// write-redirects.mjs — 古いURL（about.html など）に「新しいURLへ移るページ」を書き出す。
// 表は src/data/redirects.mjs。build.mjs から自動で呼ばれる。
import { writeFile } from 'node:fs/promises';
import { SIDES, SITE_ORIGIN } from '../site.config.mjs';
import { redirects } from '../src/data/redirects.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export async function writeRedirects(side) {
  const { base, outDir } = SIDES[side];
  const root = new URL(`../${outDir}/`, import.meta.url);
  let count = 0;
  for (const r of redirects) {
    if ((r.side ?? 'both') === 'staging' && side !== 'staging') continue;
    const to = base.replace(/\/$/, '') + r.to;
    const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex" />
<meta http-equiv="refresh" content="0; url=${esc(to)}" />
<link rel="canonical" href="${esc(SITE_ORIGIN + to)}" />
<title>移動しました | Original Create Project</title>
<script>location.replace(${JSON.stringify(to)} + location.search);</script>
</head>
<body>
<p>このページは移動しました。<a href="${esc(to)}">新しいページへ</a></p>
</body>
</html>
`;
    await writeFile(new URL(r.from, root), html);
    count++;
  }
  console.log(`✔ 古いURLの移動ページを ${count} 件書き出しました`);
}
