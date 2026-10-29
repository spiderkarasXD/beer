// npm run build:catalog — пересобирает catalog.json (новые скины + снимок цен).
// Запускайте, когда в CS2 выходят новые скины. Живые цены сайт всё равно берёт из Supabase.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from './catalog.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = await buildCatalog(path.join(ROOT, 'cache'));
const out = path.join(ROOT, 'catalog.json');
fs.writeFileSync(out, JSON.stringify(catalog));
console.log(`[catalog] ${catalog.items.length} скинов → catalog.json (${(fs.statSync(out).size / 1e6).toFixed(1)} МБ)`);
