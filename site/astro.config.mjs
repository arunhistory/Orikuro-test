// astro.config.mjs — ビルドの設定。公開側とテスト側の違いは site.config.mjs で決める。
import { defineConfig } from 'astro/config';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SIDES, SITE_ORIGIN, currentSide } from './site.config.mjs';

const side = currentSide();
const conf = SIDES[side];

// src/pages-staging/ のページは、テスト側のビルドにだけ入れる。
function stagingOnlyPages() {
  return {
    name: 'staging-only-pages',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        if (side !== 'staging') return;
        const dir = new URL('./src/pages-staging/', import.meta.url);
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
  integrations: [stagingOnlyPages()],
  vite: {
    define: { 'import.meta.env.SITE_SIDE': JSON.stringify(side) },
  },
});
