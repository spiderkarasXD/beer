// Локальный сервер без зависимостей (необязателен — папку можно залить на любой статический хостинг):
//  - отдаёт статику из этой папки
//  - /api/catalog — каталог со свежими ценами Skinport (нужен для локального режима без Supabase)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildCatalog, PRICE_TTL } from './scripts/catalog.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = ROOT;
const CACHE = path.join(ROOT, 'cache');
const PORT = Number(process.env.PORT || 3000);

let catalogAt = 0;
let catalogGz = null;
let catalogEtag = '';
let building = null;

async function rebuild() {
  const catalog = await buildCatalog(CACHE);
  catalogGz = zlib.gzipSync(JSON.stringify(catalog));
  catalogEtag = '"' + catalog.updatedAt.toString(36) + '"';
  catalogAt = catalog.updatedAt;
  console.log(`[catalog] готово: ${catalog.items.length} скинов с ценами`);
}

function ensureCatalog() {
  if (Date.now() - catalogAt >= PRICE_TTL && !building) {
    building = rebuild().catch(e => console.error('[catalog]', e.message)).finally(() => { building = null; });
  }
  return catalogGz ? Promise.resolve() : building;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/catalog') {
      await ensureCatalog();
      if (!catalogGz) throw new Error('catalog is not available');
      if (req.headers['if-none-match'] === catalogEtag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, {
        'Content-Type': 'application/json', 'Content-Encoding': 'gzip',
        'Cache-Control': 'no-cache', ETag: catalogEtag,
      });
      return res.end(catalogGz);
    }
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) file = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ошибка: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`Сайт: http://localhost:${PORT}`);
  ensureCatalog();
  setInterval(ensureCatalog, PRICE_TTL);
});
