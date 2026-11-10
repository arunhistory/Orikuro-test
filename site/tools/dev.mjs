// dev.mjs — 手元で見ながら作る。 使い方: node tools/dev.mjs public | staging
import { SIDES } from '../site.config.mjs';

const side = process.argv[2] ?? 'public';
if (!(side in SIDES)) {
  console.error('使い方: node tools/dev.mjs public か node tools/dev.mjs staging');
  process.exit(1);
}
process.env.SITE_SIDE = side;
const { dev } = await import('astro');
await dev({ root: new URL('..', import.meta.url) });
