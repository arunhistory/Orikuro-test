// serve.mjs — dist/pages/ を、GitHub Pages と同じURLで手元に表示する。
//   公開側 http://localhost:4321/Orikuro-test/
//   テスト側 http://localhost:4321/Orikuro-test/staging/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/pages/', import.meta.url));
const prefix = '/Orikuro-test';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webp': 'image/webp', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(prefix + '/')) { res.writeHead(302, { location: prefix + '/' }); return res.end(); }
  let file = normalize(join(root, path.slice(prefix.length)));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    if ((await stat(file)).isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { location: path + '/' }); return res.end(); }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 ページがありません: ' + path);
  }
}).listen(4321, () => console.log('公開側  http://localhost:4321/Orikuro-test/\nテスト側 http://localhost:4321/Orikuro-test/staging/'));
