// publish-pages.mjs — 書き出したサイトを pages-preview ブランチ（GitHub Pages が見せている場所）へ置く。
// 使い方: npm run publish:staging   … テスト側（pages-preview の staging/ の中）だけを置き換える
//         npm run publish:public    … 公開側（pages-preview の一番上。staging/ は残す）だけを置き換える
//
// 今のやり方のまま：公開側は main ブランチ、テスト側は staging ブランチから作る。
// 違うブランチから置こうとしたら止まる。置く前に、そのブランチの最新を取り込んでビルドし直す。
// GitHub Actions は使わないので、反映はこの道具を動かしたときだけ行われる。
import { execFileSync } from 'node:child_process';
import { cp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIDES } from '../site.config.mjs';

const side = process.argv[2];
const BRANCH = { public: 'main', staging: 'staging' };
if (!(side in BRANCH)) { console.error('使い方: node tools/publish-pages.mjs public か staging'); process.exit(1); }

const site = fileURLToPath(new URL('..', import.meta.url));
const repo = join(site, '..');
const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== BRANCH[side]) {
  console.error(`${SIDES[side].label}は ${BRANCH[side]} ブランチから置きます（今は ${branch}）。`);
  process.exit(1);
}
if (git(['status', '--porcelain', '--untracked-files=no'])) {
  console.error('まだコミットしていない変更があります。コミットしてから置いてください。');
  process.exit(1);
}
git(['fetch', 'origin', BRANCH[side], 'pages-preview']);
if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', `origin/${BRANCH[side]}`])) {
  console.error(`手元の ${branch} が GitHub の ${branch} と違います。push か pull をしてから置いてください。`);
  process.exit(1);
}
const sha = git(['rev-parse', '--short', 'HEAD']);

console.log(`▶ ${SIDES[side].label}をビルドします`);
execFileSync(process.execPath, [join(site, 'tools/build.mjs'), side], { cwd: site, stdio: 'inherit' });

const work = join(site, '.publish');
await rm(work, { recursive: true, force: true });
git(['worktree', 'prune']);
git(['worktree', 'add', '--detach', work, 'origin/pages-preview']);
try {
  const built = join(site, SIDES[side].outDir);
  if (side === 'staging') {
    await rm(join(work, 'staging'), { recursive: true, force: true });
    await cp(built, join(work, 'staging'), { recursive: true });
  } else {
    for (const name of await readdir(work)) {
      if (name === '.git' || name === 'staging') continue;
      await rm(join(work, name), { recursive: true, force: true });
    }
    await cp(built, work, { recursive: true });
  }
  await writeFile(join(work, '.nojekyll'), '');
  git(['add', '-A'], work);
  if (!git(['status', '--porcelain'], work)) {
    console.log('✔ 変わったところはありませんでした（置き直しは不要）');
  } else {
    git(['commit', '-m', `${SIDES[side].label}を ${BRANCH[side]}@${sha} から更新`], work);
    git(['push', 'origin', 'HEAD:pages-preview'], work);
    console.log(`✔ ${SIDES[side].label}を pages-preview に置きました（${BRANCH[side]}@${sha}）。GitHub Pages に出るまで1〜2分かかります。`);
  }
} finally {
  git(['worktree', 'remove', '--force', work]);
}
