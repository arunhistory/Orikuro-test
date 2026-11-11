// compare-shots.mjs — 移したページが、古いページと「同じ見た目」かを画素単位で確かめる。
// 使い方: npm run build:pages のあと npm run compare
//
// しくみ:
//   ・src/data/redirects.mjs の「古いファイル → 新しいURL」を使って、移し終わったページを自動で探す
//   ・古いページは一番上の階層のファイル（about.html など）をそのまま表示する
//   ・新しいページは dist/pages/ を GitHub Pages と同じURLで表示する
//   ・PC幅 1440px とスマホ幅 390px で、ページ全体とメニューを開いた画面を撮って比べる
//   ・撮った画像は dist/compare/ に置く（old-*.png と new-*.png、違いがあれば diff-*.png）
//
// まとめたページ（新しいURLに # がつくもの。about＋代表挨拶 など）は形が変わるので比べない。
// 一覧に「目で確認」と出るので、画像を見て確かめる。
//
// 初めて使うときは、ブラウザを入れる: npx playwright install chromium
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { redirects } from '../src/data/redirects.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const pagesRoot = fileURLToPath(new URL('../dist/pages/', import.meta.url));
const outDir = fileURLToPath(new URL('../dist/compare/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webp': 'image/webp' };

function serve(root, prefix, port) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!path.startsWith(prefix)) { res.writeHead(404); return res.end(); }
      let file = normalize(join(root, path.slice(prefix.length)));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      try {
        if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
        res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
        res.end(await readFile(file));
      } catch { res.writeHead(404); res.end(); }
    }).listen(port, () => resolve(server));
  });
}
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

// 比べる組を決める
const pairs = [];
const skipped = [];
for (const r of redirects) {
  const newFile = join(pagesRoot, r.to.split('#')[0], 'index.html');
  if (!(await exists(newFile))) continue; // まだ移していない
  if (!(await exists(join(repoRoot, r.from)))) continue; // 古いファイルが既に無い
  if (r.to.includes('#')) { skipped.push(r); continue; }
  pairs.push(r);
}
if (pairs.length === 0 && skipped.length === 0) {
  console.log('比べるページがありません（先に npm run build:pages を実行してください）');
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true }); // 前回の画像を消す
await mkdir(outDir, { recursive: true });
const oldServer = await serve(repoRoot, '/', 4401);
const newServer = await serve(pagesRoot, '/Orikuro-test/', 4402);
const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {});

// 2枚の画像の違う画素を数える（ブラウザの canvas で比べるので、追加の道具は要らない）
const diffPage = await browser.newPage();
async function countDiff(a, b, diffPath) {
  const result = await diffPage.evaluate(async ([a64, b64]) => {
    const load = (src) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(img); img.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}x${ia.height} → ${ib.width}x${ib.height}`, count: -1 };
    const c = (img) => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height); };
    const da = c(ia), db = c(ib);
    const out = document.createElement('canvas'); out.width = ia.width; out.height = ia.height;
    const ox = out.getContext('2d'); const od = ox.createImageData(ia.width, ia.height);
    let count = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      if (d > 8) { count++; od.data[i] = 255; od.data[i + 3] = 255; } else { od.data[i] = od.data[i + 1] = od.data[i + 2] = 255; od.data[i + 3] = 255; }
    }
    ox.putImageData(od, 0, 0);
    return { count, png: count ? out.toDataURL('image/png').split(',')[1] : null };
  }, [a.toString('base64'), b.toString('base64')]);
  if (result.png) await writeFile(diffPath, Buffer.from(result.png, 'base64'));
  return result;
}

async function shoot(url, width, height, name) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const full = await page.screenshot({ fullPage: true });
  await writeFile(join(outDir, `${name}.png`), full);
  let menu = null;
  if (await page.$('[data-menu-button]')) {
    await page.click('[data-menu-button]');
    await page.waitForTimeout(400);
    menu = await page.screenshot();
    await writeFile(join(outDir, `${name}-menu.png`), menu);
  }
  await ctx.close();
  return { full, menu };
}

let bad = 0;
console.log('古いページ → 新しいページ（PC 1440px / スマホ 390px、ページ全体とメニュー）');
for (const r of pairs) {
  const results = [];
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const key = r.from.replace(/\.html$/, '') + '-' + w;
    const o = await shoot(`http://localhost:4401/${r.from}`, w, h, 'old-' + key);
    const n = await shoot(`http://localhost:4402/Orikuro-test${r.to}`, w, h, 'new-' + key);
    for (const [label, a, b, suffix] of [['全体', o.full, n.full, ''], ['メニュー', o.menu, n.menu, '-menu']]) {
      if (!a || !b) { results.push(`${w}${label}:メニュー無し`); continue; }
      const d = await countDiff(a, b, join(outDir, `diff-${key}${suffix}.png`));
      if (d.count === 0) results.push(`${w}${label}:同じ`);
      else { bad++; results.push(d.count < 0 ? `${w}${label}:大きさが違う(${d.size})` : `${w}${label}:${d.count}画素違う`); }
    }
  }
  const ok = results.every((x) => x.endsWith('同じ'));
  console.log(`  ${ok ? '✔' : '✘'} ${r.from} → ${r.to}  ${results.join(' / ')}`);
}
for (const r of skipped) console.log(`  👀 ${r.from} → ${r.to}  まとめたページなので目で確認（dist/compare/ ではなく、npm run preview で見比べる）`);

await browser.close();
oldServer.close();
newServer.close();
console.log(bad ? `\n✘ 違いが ${bad} か所あります。dist/compare/diff-*.png の赤い所が違う画素です` : '\n✔ 比べたページは全て古いページと同じ見た目です');
process.exit(bad ? 1 : 0);
