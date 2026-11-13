// astro.config.mjs — ビルドの設定。公開側とテスト側の違いは site.config.mjs で決める。
import { defineConfig } from 'astro/config';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SIDES, SITE_ORIGIN, currentSide } from './site.config.mjs';

const side = currentSide();
const conf = SIDES[side];

// 片側だけに出すページ：
//   src/pages-public/  … 公開側のビルドにだけ入れる
//   src/pages-staging/ … テスト側のビルドにだけ入れる
// 同じURLのページを両方に置くと、公開側とテスト側で中身を変えられる（例: /stream-test/）。
function sideOnlyPages() {
  return {
    name: 'side-only-pages',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        const dir = new URL(side === 'staging' ? './src/pages-staging/' : './src/pages-public/', import.meta.url);
        const walk = (rel) => {
          for (const ent of readdirSync(new URL(rel, dir), { withFileTypes: true })) {
            const path = rel + ent.name;
            if (ent.name.startsWith('_')) continue;
            if (ent.isDirectory()) { walk(path + '/'); continue; }
            if (!ent.name.endsWith('.astro')) continue;
            const route = '/' + path.replace(/\.astro$/, '').replace(/(^|\/)index$/, '');
            injectRoute({ pattern: route || '/', entrypoint: fileURLToPath(new URL(path, dir)) });
          }
        };
        walk('');
      },
    },
  };
}

export default defineConfig({
  site: SITE_ORIGIN,
  base: conf.base,
  outDir: conf.outDir,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sideOnlyPages()],
  vite: {
    define: { 'import.meta.env.SITE_SIDE': JSON.stringify(side) },
  },
});
