// Каталог скинов CS2: названия и картинки — ByMykel/CSGO-API, цены — Skinport. Ключи не нужны.
import fs from 'node:fs';
import path from 'node:path';

const SKINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json';
const PRICES_URL = 'https://api.skinport.com/v1/items?app_id=730&currency=USD';
const SALES_URL = 'https://api.skinport.com/v1/sales/history?app_id=730&currency=USD';
export const IMG_PREFIX = 'https://community.akamai.steamstatic.com/economy/image/';
export const META_TTL = 24 * 3600e3;   // описание скинов меняется редко
export const PRICE_TTL = 15 * 60e3;    // Skinport сам кэширует цены на 5 минут

const WEAR = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' };

function readCache(dir, name, ttl) {
  const file = path.join(dir, name);
  try {
    if (Date.now() - fs.statSync(file).mtimeMs < ttl) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return null;
}

function writeCache(dir, name, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
}

async function loadMeta(cacheDir) {
  const cached = readCache(cacheDir, 'meta.json', META_TTL);
  if (cached) return cached;
  console.log('[catalog] скачиваю список скинов (ByMykel/CSGO-API)…');
  const res = await fetch(SKINS_URL);
  if (!res.ok) throw new Error('skins ' + res.status);
  const meta = {};
  for (const s of await res.json()) {
    if (!s.market_hash_name || !s.image || meta[s.market_hash_name]) continue;
    meta[s.market_hash_name] = {
      w: s.weapon?.name || '',
      s: s.pattern?.name || 'Vanilla',
      q: WEAR[s.wear?.name] || '',
      c: s.rarity?.color || '#b0c3d9',
      i: s.image.startsWith(IMG_PREFIX) ? s.image.slice(IMG_PREFIX.length) : s.image,
      st: s.stattrak ? 1 : 0,
      sv: s.souvenir ? 1 : 0,
    };
  }
  writeCache(cacheDir, 'meta.json', meta);
  return meta;
}

async function loadPrices(cacheDir) {
  const cached = readCache(cacheDir, 'prices.json', PRICE_TTL);
  if (cached) return cached;
  console.log('[catalog] обновляю цены (Skinport: продажи + лоты)…');
  try {
    const get = async url => {
      const res = await fetch(url, { headers: { 'Accept-Encoding': 'br' } });
      if (!res.ok) throw new Error('skinport ' + res.status);
      return res.json();
    };
    const sales = await get(SALES_URL);
    const listings = await get(PRICES_URL);
    const prices = pickPrices(sales, listings);
    writeCache(cacheDir, 'prices.json', prices);
    return prices;
  } catch (e) {
    // Skinport лимитирует запросы — берём последние сохранённые цены, даже устаревшие
    console.warn('[catalog] цены не обновились:', e.message);
    const stale = readCache(cacheDir, 'prices.json', Infinity);
    if (stale) return stale;
    throw e;
  }
}

// Реальная цена = медиана продаж на Skinport (30 дней, а если продаж мало — 90 дней).
// Без продаж — медиана лотов, но только если лотов хотя бы 3: одиночный лот может стоить сколько угодно.
// Та же логика — в supabase/functions/sync-prices/index.ts.
export function pickPrices(sales, listings) {
  const best = new Map();
  // у Doppler одно имя на все фазы (version): берём самую дешёвую фазу, а не общую запись,
  // которую задирают Ruby/Sapphire
  const put = (name, price, isVersion, rank) => {
    const prev = best.get(name);
    if (!prev || rank > prev.rank || (rank === prev.rank && isVersion && (!prev.ver || price < prev.p))) {
      best.set(name, { p: price, ver: isVersion, rank });
    }
  };
  for (const l of listings) {
    if (l.quantity >= 3 && l.median_price > 0) put(l.market_hash_name, l.median_price, !!l.version, 1);
  }
  for (const s of sales) {
    const d = s.last_30_days?.volume >= 3 ? s.last_30_days : s.last_90_days;
    if (d?.median > 0) put(s.market_hash_name, d.median, !!s.version, 2);
  }
  const out = {};
  for (const [name, v] of best) out[name] = Math.round(v.p * 100) / 100;
  return out;
}

// Только скины, у которых есть цена; самые дорогие — первыми
export async function buildCatalog(cacheDir) {
  const [meta, prices] = await Promise.all([loadMeta(cacheDir), loadPrices(cacheDir)]);
  const items = [];
  for (const [id, m] of Object.entries(meta)) {
    if (prices[id]) items.push({ id, ...m, p: prices[id] });
  }
  items.sort((a, b) => b.p - a.p);
  return { updatedAt: Date.now(), imgPrefix: IMG_PREFIX, items };
}
