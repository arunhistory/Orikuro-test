// check-site.mjs — 決まりが守られているかを確かめる。 使い方: npm run check（先に npm run build:pages）
//  1. サイトの中のリンク・画像・CSS・JSの行き先が全てあるか（無いものは「未移行」として一覧）
//  2. 書き出したサイトにソース（.ts .astro .rs など）が混ざっていないか
//  3. src/pages・src/components・src/layouts に色の値（#…）を直接書いていないか
//  4. src に !important・?v= が無いか
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const pagesRoot = join(here, 'dist/pages');
const prefix = '/Orikuro-test';
let errors = 0;
const fail = (msg) => { errors++; console.log('  ✘ ' + msg); };

async function* walk(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p); else yield p;
  }
}
async function exists(p) { try { await stat(p); return true; } catch { return false; } }

try { await stat(pagesRoot); } catch {
  console.error('dist/pages/ がありません。先に npm run build:pages を実行してください'); process.exit(1);
}

// 1. リンクの行き先
console.log('1. リンクの行き先');
const missing = new Map();
for await (const file of walk(pagesRoot)) {
  if (extname(file) !== '.html') continue;
  const html = await readFile(file, 'utf8');
  if (html.includes('http-equiv="refresh"')) continue; // 古いURLの移動ページは別に数える
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (!url.startsWith(prefix + '/')) continue;
    const path = url.split('#')[0].split('?')[0];
    let target = join(pagesRoot, path.slice(prefix.length));
    if (path.endsWith('/')) target = join(target, 'index.html');
    if (!(await exists(target))) {
      const from = '/' + relative(pagesRoot, file).replace(/\\/g, '/');
      if (!missing.has(path)) missing.set(path, new Set());
      missing.get(path).add(from);
    }
  }
}
for await (const file of walk(pagesRoot)) {
  if (extname(file) !== '.html') continue;
  const html = await readFile(file, 'utf8');
  const m = html.match(/http-equiv="refresh" content="0; url=([^"]+)"/);
  if (!m) continue;
  const path = m[1].split('#')[0];
  if (!(await exists(join(pagesRoot, path.slice(prefix.length), 'index.html')))) {
    if (!missing.has(path)) missing.set(path, new Set());
    missing.get(path).add('（古いURL）' + relative(pagesRoot, file).replace(/\\/g, '/'));
  }
}
if (missing.size === 0) console.log('  ✔ 全てあります');
else {
  console.log(`  △ 行き先がまだ無いもの ${missing.size} 件（未移行のページ。移行が終わるまでは出てよい）`);
  for (const [path, froms] of [...missing].sort()) console.log(`    ${path}  ← ${[...froms].slice(0, 3).join(', ')}${froms.size > 3 ? ' ほか' : ''}`);
}

// 仮置きのリンク（navigation.ts の placeholder: true）の一覧
{
  const names = new Set();
  for await (const file of walk(pagesRoot)) {
    if (extname(file) !== '.html') continue;
    const html = await readFile(file, 'utf8');
    for (const m of html.matchAll(/<a href="#" aria-disabled="true" data-placeholder-link[^>]*>([^<]+)<\/a>/g)) names.add(m[1]);
  }
  console.log(names.size ? `  △ 仮置きのリンク: ${[...names].join('、')}（ページができたら navigation.ts の placeholder を消す）` : '  ✔ 仮置きのリンクはありません');
}

// 2. ソースが混ざっていないか
console.log('2. 書き出したサイトにソースが無いか');
const bad = ['.ts', '.astro', '.rs', '.mjs', '.toml', '.map'];
let leaked = 0;
for await (const file of walk(pagesRoot)) if (bad.includes(extname(file))) { leaked++; fail('ソースが入っている: ' + relative(pagesRoot, file)); }
if (!leaked) console.log('  ✔ ありません');

// 3・4. ソースの書き方
console.log('3. 色の直書き・!important・?v=');
const before = errors;
for await (const file of walk(join(here, 'src'))) {
  const rel = relative(here, file).replace(/\\/g, '/');
  if (!/\.(astro|ts|css|mjs)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  if (code.includes('!important')) fail(`${rel}: !important がある`);
  if (/\?v=/.test(code)) fail(`${rel}: ?v= がある`);
  const colorCheck = /^src\/(pages|pages-staging|components|layouts)\//.test(rel);
  if (colorCheck) {
    for (const m of code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const line = code.slice(0, m.index).split('\n').length;
      const lineText = code.split('\n')[line - 1];
      if (/theme-color/.test(lineText)) continue; // BaseLayout の theme-color だけは例外
      if (/href=["'][^"']*#/.test(lineText) || /path:\s*'[^']*#/.test(lineText)) continue; // ページ内リンク
      fail(`${rel}:${line} 色の値 ${m[0]} を直接書いている（tokens.css の変数を使う）`);
    }
  }
}
if (errors === before) console.log('  ✔ ありません');

console.log(errors ? `\n✘ 決まりに反するものが ${errors} 件あります` : '\n✔ 決まりは守られています');
process.exit(errors ? 1 : 0);
