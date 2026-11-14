// copy-live.mjs — 体験版の画面（site/live-dist/）を書き出し先の live/ へ写す。
// どちらの側に入れるかは site.config.mjs の LIVE.sides で決める。build.mjs から呼ばれる。
import { cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIDES, LIVE } from '../site.config.mjs';

export async function copyLive(side) {
  const from = fileURLToPath(new URL(`../${LIVE.dir}/`, import.meta.url));
  const to = join(fileURLToPath(new URL(`../${SIDES[side].outDir}/`, import.meta.url)), 'live');
  const entries = (await readdir(from)).filter((name) => !name.startsWith('README'));
  if (entries.length === 0) { console.log('・体験版の画面はまだありません（site/live-dist/ が空）'); return; }
  try { await stat(to); throw new Error('live/ と同じ名前のページが既にあります（src/pages* に /live/ を作らない）'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const name of entries) await cp(join(from, name), join(to, name), { recursive: true });
  console.log(`✔ 体験版の画面を ${SIDES[side].label}の /live/ に写しました`);
}
