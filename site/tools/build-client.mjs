// build-client.mjs — フォーム・利用の流れ・配信のJS（リポジトリ直下の src/client/*.ts）を作る。
// 使い方: npm run build:client
//
// 元の staging の自動処理（.github/workflows/build-client-pipeline.yml）と同じ道具・同じ設定で作る。
//   esbuild 0.28.2 で変換・圧縮 → javascript-obfuscator 5.5.0 で読みにくくする
//   stream-audio-worklet だけは読みにくくしない（AudioWorklet の中では window などが無いため）
// 書き出し先: site/public/assets/js/<名前>.js と <名前>.js.sha256
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(site, '../src/client');
const outDir = join(site, 'public/assets/js');
const tmpDir = join(site, '.client-build');
const bin = (name) => join(site, 'node_modules/.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const WORKLETS = new Set(['stream-audio-worklet']);
const OBFUSCATE = [
  '--target', 'browser-no-eval', '--compact', 'true',
  '--control-flow-flattening', 'true', '--control-flow-flattening-threshold', '0.35',
  '--dead-code-injection', 'false', '--debug-protection', 'false', '--disable-console-output', 'true',
  '--identifier-names-generator', 'hexadecimal', '--ignore-imports', 'true', '--numbers-to-expressions', 'true',
  '--rename-globals', 'false', '--rename-properties', 'false', '--self-defending', 'false', '--simplify', 'true',
  '--split-strings', 'true', '--split-strings-chunk-length', '12',
  '--string-array', 'true', '--string-array-encoding', 'base64', '--string-array-threshold', '0.70',
  '--transform-object-keys', 'false', '--unicode-escape-sequence', 'false',
];

await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });
await mkdir(outDir, { recursive: true });
const names = (await readdir(srcDir)).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3)).sort();
for (const name of names) {
  const out = join(outDir, `${name}.js`);
  const esbuildArgs = [join(srcDir, `${name}.ts`), '--format=esm', '--target=es2022', '--minify', '--legal-comments=none', '--charset=utf8'];
  if (WORKLETS.has(name)) {
    execFileSync(bin('esbuild'), [...esbuildArgs, `--outfile=${out}`], { stdio: 'pipe' });
  } else {
    const tmp = join(tmpDir, `${name}.min.js`);
    execFileSync(bin('esbuild'), [...esbuildArgs, `--outfile=${tmp}`], { stdio: 'pipe' });
    execFileSync(bin('javascript-obfuscator'), [tmp, '--output', out, ...OBFUSCATE], { stdio: 'pipe' });
  }
  const hash = createHash('sha256').update(await readFile(out)).digest('hex');
  await writeFile(`${out}.sha256`, `${hash}  assets/js/${name}.js\n`);
  console.log(`✔ ${name}.js`);
}
await rm(tmpDir, { recursive: true, force: true });
console.log(`\n✔ ${names.length} 個のJSを site/public/assets/js/ に書き出しました`);
