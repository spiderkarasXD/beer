// Edge Function: подтягивает реальные цены CS2 со Skinport в таблицу items.
// Секретный ключ сюда не пишется: Supabase сам передаёт SUPABASE_SERVICE_ROLE_KEY в окружение функции.
// Вызывать может кто угодно (сайт дёргает её, когда цены устарели), поэтому стоит защита:
// не чаще одного обновления в MIN_INTERVAL_MIN минут.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const LISTINGS = 'https://api.skinport.com/v1/items?app_id=730&currency=USD';
const SALES = 'https://api.skinport.com/v1/sales/history?app_id=730&currency=USD';
const MIN_INTERVAL_MIN = 10;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Listing = { market_hash_name: string; version: string | null; quantity: number; median_price: number | null };
type Period = { median: number | null; volume: number } | null;
type Sale = { market_hash_name: string; version: string | null; last_30_days: Period; last_90_days: Period };

// Реальная цена = медиана продаж (30 дней, а если продаж мало — 90 дней).
// Без продаж — медиана лотов, но только если лотов хотя бы 3: одиночный лот может стоить сколько угодно.
// Та же логика — в scripts/catalog.mjs.
function pickPrices(sales: Sale[], listings: Listing[]) {
  const best = new Map<string, { p: number; ver: boolean; rank: number }>();
  // у Doppler одно имя на все фазы (version): берём самую дешёвую фазу, а не общую запись
  const put = (name: string, price: number, isVersion: boolean, rank: number) => {
    const prev = best.get(name);
    if (!prev || rank > prev.rank || (rank === prev.rank && isVersion && (!prev.ver || price < prev.p))) {
      best.set(name, { p: price, ver: isVersion, rank });
    }
  };
  for (const l of listings) {
    if (l.quantity >= 3 && l.median_price && l.median_price > 0) put(l.market_hash_name, l.median_price, !!l.version, 1);
  }
  for (const s of sales) {
    const d = (s.last_30_days?.volume ?? 0) >= 3 ? s.last_30_days : s.last_90_days;
    if (d?.median && d.median > 0) put(s.market_hash_name, d.median, !!s.version, 2);
  }
  return best;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set' }, 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: last, error: lastErr } = await sb
    .from('items').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (lastErr) return json({ error: lastErr.message }, 500);
  if (last && Date.now() - Date.parse(last.updated_at) < MIN_INTERVAL_MIN * 60e3) {
    return json({ skipped: true, updated_at: last.updated_at });
  }

  // Skinport требует Brotli; fetch в Deno сам распаковывает ответ
  const get = async (u: string) => {
    const res = await fetch(u, { headers: { 'Accept-Encoding': 'br' } });
    if (!res.ok) throw new Error(`skinport ${res.status}`);
    return res.json();
  };
  let prices;
  try {
    prices = pickPrices(await get(SALES), await get(LISTINGS));
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }

  const now = new Date().toISOString();
  const rows = [...prices].map(([id, v]) => ({ id, price: Math.round(v.p * 100) / 100, updated_at: now }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from('items').upsert(rows.slice(i, i + 1000), { onConflict: 'id' });
    if (error) return json({ error: error.message, done: i }, 500);
  }
  // убираем цены, которых больше нет (например, одиночные лоты без продаж), если скин ни у кого не лежит
  const { data: pruned, error: pruneErr } = await sb.rpc('prune_items', { p_before: now });
  if (pruneErr) return json({ error: pruneErr.message, updated: rows.length }, 500);
  return json({ updated: rows.length, pruned, updated_at: now });
});
