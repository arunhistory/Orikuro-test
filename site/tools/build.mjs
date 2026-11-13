// build.mjs — 片側をビルドする。 使い方: node tools/build.mjs public | staging
// （Windowsでも動くように、環境変数の指定をここで行う）
import { SIDES } from '../site.config.mjs';
import { writeRedirects } from './write-redirects.mjs';
import { copyStagingApps } from './copy-staging-apps.mjs';

const side = process.argv[2];
if (!(side in SIDES)) {
  console.error('使い方: node tools/build.mjs public か node tools/build.mjs staging');
  process.exit(1);
}
process.env.SITE_SIDE = side;
const { build } = await import('astro');
await build({ root: new URL('..', import.meta.url) });
if (side === 'staging') await copyStagingApps();
await writeRedirects(side);
console.log(`\n✔ ${SIDES[side].label}（${side}）を ${SIDES[side].outDir}/ に書き出しました`);
