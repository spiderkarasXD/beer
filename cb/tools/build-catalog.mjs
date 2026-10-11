// Генератор каталога CaseBeer: все скины CS2 + кейсы + заранее посчитанные шансы.
//
//   node cb/tools/build-catalog.mjs            # скачает базу ByMykel/CSGO-API с GitHub
//   node cb/tools/build-catalog.mjs skins.json crates.json   # или возьмёт локальные файлы
//
// Результат: cb/catalog.js. Цены — оценка (редкость × оружие × скин × разброс),
// а не биржевые котировки: публичного бесплатного API с ценами нет.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'catalog.js');
const API = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/';

async function load(file, name) {
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(API + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

const [skinsRaw, cratesRaw] = await Promise.all([load(process.argv[2], 'skins.json'), load(process.argv[3], 'crates.json')]);
const custom = JSON.parse(fs.readFileSync(path.join(HERE, 'custom.json'), 'utf8'));

/* ---------------- детерминированная «случайность» ---------------- */
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const noise = (str, lo, hi) => lo + (hash(str) / 4294967296) * (hi - lo);
function seeded(seed) { let s = hash(seed) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/* ---------------- оценка цены, ₽ ---------------- */
const RARITY_OF = {
  rarity_common_weapon: 'consumer', rarity_uncommon_weapon: 'industrial', rarity_rare_weapon: 'milspec',
  rarity_mythical_weapon: 'restricted', rarity_legendary_weapon: 'classified', rarity_ancient_weapon: 'covert',
  rarity_ancient: 'gold', rarity_contraband_weapon: 'gold',
};
const BASE = { consumer: 4, industrial: 9, milspec: 28, restricted: 140, classified: 650, covert: 2600 };
const WEAPON_MULT = {
  'AK-47': 2.4, 'AWP': 2.8, 'M4A4': 1.9, 'M4A1-S': 1.9, 'Desert Eagle': 1.6, 'USP-S': 1.6, 'Glock-18': 1.4,
  'P250': 0.8, 'Five-SeveN': 0.8, 'Tec-9': 0.7, 'CZ75-Auto': 0.7, 'P2000': 0.8, 'Dual Berettas': 0.6, 'R8 Revolver': 0.6,
  'MP9': 0.8, 'MAC-10': 0.8, 'MP7': 0.7, 'MP5-SD': 0.7, 'UMP-45': 0.7, 'P90': 0.9, 'PP-Bizon': 0.6,
  'FAMAS': 0.9, 'Galil AR': 0.9, 'SG 553': 0.8, 'AUG': 0.8, 'SSG 08': 1.1, 'SCAR-20': 0.6, 'G3SG1': 0.6,
  'Nova': 0.6, 'XM1014': 0.7, 'Sawed-Off': 0.6, 'MAG-7': 0.6, 'M249': 0.5, 'Negev': 0.5, 'Zeus x27': 0.8,
};
const KNIFE_BASE = {
  'Karambit': 70000, 'Butterfly Knife': 75000, 'M9 Bayonet': 52000, 'Bayonet': 36000, 'Talon Knife': 42000,
  'Skeleton Knife': 42000, 'Stiletto Knife': 30000, 'Classic Knife': 30000, 'Flip Knife': 24000, 'Nomad Knife': 26000,
  'Kukri Knife': 24000, 'Paracord Knife': 17000, 'Survival Knife': 16000, 'Ursus Knife': 18000, 'Huntsman Knife': 17000,
  'Bowie Knife': 15000, 'Falchion Knife': 14000, 'Gut Knife': 11000, 'Navaja Knife': 9000, 'Shadow Daggers': 9500,
};
const GLOVE_BASE = {
  'Sport Gloves': 60000, 'Specialist Gloves': 42000, 'Moto Gloves': 32000, 'Driver Gloves': 24000,
  'Hand Wraps': 22000, 'Broken Fang Gloves': 16000, 'Hydra Gloves': 15000, 'Bloodhound Gloves': 17000,
};
// премиальные расцветки (ищутся в названии скина / фазе)
const FINISH = [
  ['Dragon Lore', 45], ['Gungnir', 40], ['Howl', 30], ['Medusa', 22], ['Fire Serpent', 12], ['Wild Lotus', 14],
  ['Prince', 9], ['Gold Arabesque', 9], ['Case Hardened', 1.6], ['Crimson Web', 2.1], ['Fade', 2.3],
  ['Marble Fade', 2.4], ['Doppler', 2.2], ['Gamma Doppler', 2.6], ['Lore', 2], ['Tiger Tooth', 1.8], ['Slaughter', 1.5],
  ['Autotronic', 1.4], ['Asiimov', 1.8], ['Printstream', 1.6], ['Vulcan', 1.6], ['Neo-Noir', 1.3], ['Hyper Beast', 1.2],
  ['Blue Gem', 4], ['Emerald', 2.4], ['Pandora', 3], ['Vice', 2.2], ['Kimono', 2], ['Hedge Maze', 3], ['Superconductor', 2.2],
];
const PHASE = { Ruby: 3.2, Sapphire: 3.5, 'Black Pearl': 2.6, Emerald: 4, 'Phase 2': 1.25, 'Phase 4': 1.15 };

function estimate(s, rarity) {
  const weapon = s.weapon.name, cat = s.category.name, skinName = s.pattern ? s.pattern.name : '';
  let p;
  if (cat === 'Knives') p = KNIFE_BASE[weapon] || 15000;
  else if (cat === 'Gloves') p = GLOVE_BASE[weapon] || 20000;
  else p = (BASE[rarity] || 4000) * (WEAPON_MULT[weapon] || 0.8);
  if (s.rarity.id === 'rarity_contraband_weapon') p = 300000;
  for (const [k, m] of FINISH) if (skinName.includes(k)) p *= m;
  if (s.phase && PHASE[s.phase]) p *= PHASE[s.phase];
  p *= noise(s.id, 0.65, 1.55);
  return nice(p);
}
function nice(p) {
  if (p < 10) return Math.max(1, Math.round(p));
  const mag = Math.pow(10, Math.floor(Math.log10(p)) - 1);
  return Math.round(p / mag) * mag;
}

const TYPE_OF = (s) => {
  const c = s.category.name, w = s.weapon.name;
  if (c === 'Knives') return 'knife';
  if (c === 'Gloves') return 'gloves';
  if (c === 'Pistols' || c === 'Equipment') return 'pistol';
  if (c === 'SMGs') return 'smg';
  if (['AWP', 'SSG 08', 'SCAR-20', 'G3SG1'].includes(w)) return 'sniper';
  if (['Nova', 'XM1014', 'Sawed-Off', 'MAG-7'].includes(w)) return 'shotgun';
  return 'rifle';
};

/* ---------------- скины ---------------- */
const legacyByName = new Map(custom.legacySkins.map((x) => [x.name, x]));
const LEGACY_PHASE = { '★ Karambit | Doppler': 'Phase 2', '★ Karambit | Gamma Doppler': 'Emerald' };
const legacyAlias = { 'kara-emerald': '★ Karambit | Gamma Doppler' };

const skins = [];
const byDatasetId = new Map();
for (const s of skinsRaw) {
  if (!s.image || !s.weapon || !s.category) continue;
  const rarityKey = RARITY_OF[s.rarity.id] || 'consumer';
  const rarity = (s.category.name === 'Knives' || s.category.name === 'Gloves') ? 'gold' : rarityKey;
  const weapon = (s.name.startsWith('★') ? '★ ' : '') + s.weapon.name;
  let skin = s.pattern ? s.pattern.name : 'Vanilla';
  if (s.phase) skin += ` (${s.phase})`;
  const name = s.name; // "AK-47 | Redline" / "★ Karambit | Doppler"
  let id = 's' + skins.length.toString(36);
  let price = estimate(s, rarity);
  // старые id и цены сохраняем, чтобы не ломать инвентари игроков
  const legacy = [...custom.legacySkins].find((x) => {
    const want = legacyAlias[x.id] || x.name;
    if (want !== name) return false;
    const ph = LEGACY_PHASE[want];
    return ph ? s.phase === ph : !s.phase || s.phase === 'Phase 1';
  });
  if (legacy && !skins.some((k) => k.id === legacy.id)) { id = legacy.id; price = legacy.price; }
  const img = (s.image.match(/economy\/image\/([^/]+)/) || [])[1];
  if (!img) continue;
  const row = { id, weapon, skin, type: TYPE_OF(s), rarity, price, img, wname: s.weapon.name, cat: s.category.name };
  skins.push(row);
  byDatasetId.set(s.id, row);
}
const SK = new Map(skins.map((s) => [s.id, s]));
const missingLegacy = custom.legacySkins.filter((x) => !SK.has(x.id));
if (missingLegacy.length) console.warn('legacy skins not matched:', missingLegacy.map((x) => x.id));

/* ---------------- шансы (та же формула, что была в app.js) ---------------- */
const RTP = 1.05, HIT = 0.33;
function chances(items, P, free) {
  const prices = items.map((id) => SK.get(id).price);
  let near = prices.map((p) => p >= P && p <= P * 4);
  if (!near.some(Boolean)) near = prices.map((p) => p >= P && p <= P * 12); // нет скинов около цены — берём окно шире
  const dist = (a, B) => { const ws = prices.map((p, i) => Math.pow(p, -a) * (near[i] ? B : 1)); const sum = ws.reduce((x, y) => x + y, 0); return ws.map((w) => w / sum); };
  const ev = (ps) => ps.reduce((acc, p, i) => acc + p * prices[i], 0);
  const hit = (ps) => ps.reduce((acc, p, i) => acc + (prices[i] >= P ? p : 0), 0);
  const target = free ? 25 : P * RTP;
  const solveA = (B) => { let lo = -2, hi = 8; for (let i = 0; i < 60; i++) { const a = (lo + hi) / 2; if (ev(dist(a, B)) > target) lo = a; else hi = a; } return (lo + hi) / 2; };
  let B = 1, a = solveA(1);
  if (!free && hit(dist(a, 1)) < HIT) {
    let lo = 1, hi = 200;
    for (let i = 0; i < 40; i++) { B = (lo + hi) / 2; a = solveA(B); if (hit(dist(a, B)) < HIT) lo = B; else hi = B; }
  }
  const ps = dist(a, B);
  return { ch: ps.map((p) => +p.toPrecision(4)), ev: Math.round(ev(ps)) };
}

// цена кейса — «красивое» число около квантиля цен содержимого
const NICE = [5, 9, 15, 19, 29, 39, 49, 69, 79, 99, 129, 149, 199, 249, 299, 349, 399, 499, 599, 699, 799, 999, 1199, 1499, 1999, 2499, 2999, 3999, 4999, 5999, 7999, 9999, 14999, 19999, 29999, 49999, 79999, 99999];
const quant = (arr, q) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const priceFor = (items, q) => { const v = quant(items.map((id) => SK.get(id).price), q); return NICE.reduce((b, n) => (Math.abs(n - v) < Math.abs(b - v) ? n : b), NICE[0]); };

const PALETTE = ['#ff9f1a', '#eb4b4b', '#8847ff', '#4b69ff', '#2fd67b', '#d32ce6', '#e4ae39', '#36d1ff', '#ff4fa3', '#b0c3d9'];
const cases = [];
function addCase(c) {
  const items = [...new Set(c.items)].filter((id) => SK.has(id));
  if (items.length < 4) return;
  const price = c.price != null ? c.price : priceFor(c.priceItems ? c.priceItems.filter((id) => SK.has(id)) : items, c.q ?? 0.55);
  const { ch, ev } = chances(items, c.free ? 25 : price, c.free);
  const color = c.color || PALETTE[hash(c.id) % PALETTE.length];
  cases.push({ id: c.id, name: c.name, group: c.group, price, color, icon: c.icon || '', img: c.img || '', free: !!c.free, items, ch, ev });
}

// 1) свои кейсы (как были)
for (const c of custom.customCases) addCase({ ...c, group: c.free ? 'free' : 'hits' });

// 2) настоящие оружейные кейсы CS2: реальный состав + ножи/перчатки
const real = cratesRaw.filter((c) => c.type === 'Case').sort((a, b) => String(b.first_sale_date).localeCompare(String(a.first_sale_date)));
for (const c of real) {
  const items = [...c.contains, ...(c.contains_rare || [])].map((x) => byDatasetId.get(x.id)).filter(Boolean).map((x) => x.id);
  const img = (c.image.match(/economy\/image\/([^/]+)/) || [])[1];
  const regular = c.contains.map((x) => byDatasetId.get(x.id)).filter(Boolean).map((x) => x.id);
  addCase({ id: 'cs-' + c.id.replace(/^crate-/, ''), name: c.name.replace(/ Case$/, ''), group: 'cs2', img, items, priceItems: regular, q: 0.8 });
}

// 3) кейсы по оружию
const WEAPONS = ['AK-47', 'AWP', 'M4A4', 'M4A1-S', 'Desert Eagle', 'USP-S', 'Glock-18', 'P250', 'Five-SeveN', 'Tec-9', 'MP9', 'MAC-10', 'P90', 'UMP-45', 'FAMAS', 'Galil AR', 'SSG 08', 'AUG', 'SG 553', 'XM1014', 'Nova', 'MP7', 'CZ75-Auto', 'Dual Berettas'];
for (const w of WEAPONS) {
  const items = skins.filter((s) => s.wname === w && s.cat !== 'Knives').map((s) => s.id);
  addCase({ id: 'w-' + w.toLowerCase().replace(/[^a-z0-9]+/g, ''), name: w, group: 'weapons', items, q: 0.6 });
}

// 4) ножевые кейсы: все расцветки ножа + «утешительные» стволы
const covertFill = skins.filter((s) => (s.rarity === 'covert' || s.rarity === 'classified') && s.cat !== 'Knives' && s.cat !== 'Gloves');
for (const k of Object.keys(KNIFE_BASE)) {
  const knives = skins.filter((s) => s.wname === k).map((s) => s.id);
  if (!knives.length) continue;
  const r = seeded('knife-' + k);
  const fill = covertFill.slice().sort(() => r() - 0.5).slice(0, 14).map((s) => s.id);
  addCase({ id: 'k-' + k.toLowerCase().replace(/[^a-z0-9]+/g, ''), name: k.replace(' Knife', ''), group: 'knives', items: [...knives, ...fill], q: 0.35, color: '#e4ae39' });
}

// 5) перчатки
for (const g of Object.keys(GLOVE_BASE)) {
  const gloves = skins.filter((s) => s.wname === g).map((s) => s.id);
  if (!gloves.length) continue;
  const r = seeded('glove-' + g);
  const fill = covertFill.slice().sort(() => r() - 0.5).slice(0, 12).map((s) => s.id);
  addCase({ id: 'g-' + g.toLowerCase().replace(/[^a-z0-9]+/g, ''), name: g, group: 'gloves', items: [...gloves, ...fill], q: 0.35, color: '#2fd67b' });
}

// 6) по редкости / бюджету
const RAR_CASES = [
  ['r-bomzh', 'Бомж', ['consumer', 'industrial'], '#b0c3d9'],
  ['r-army', 'Армейский склад', ['milspec', 'restricted'], '#4b69ff'],
  ['r-pink', 'Розовый', ['classified', 'restricted'], '#d32ce6'],
  ['r-red', 'Красный', ['covert'], '#eb4b4b'],
  ['r-gold', 'Только ★', ['gold'], '#e4ae39'],
];
for (const [id, name, rar, color] of RAR_CASES) {
  const r = seeded(id);
  const pool = skins.filter((s) => rar.includes(s.rarity)).sort(() => r() - 0.5).slice(0, 40).map((s) => s.id);
  addCase({ id, name, group: 'rarity', items: pool, q: 0.5, color });
}

/* ---------------- запись ---------------- */
const used = new Set(cases.flatMap((c) => c.items));
const out = [
  '// Сгенерировано cb/tools/build-catalog.mjs — не редактировать руками.',
  '// Скины и картинки: открытая база ByMykel/CSGO-API. Цены — оценка, не биржевые котировки.',
  "'use strict';",
  // [id, оружие, скин, тип, редкость, цена, хэш картинки Steam]
  'const SKIN_ROWS = ' + JSON.stringify(skins.filter((s) => used.has(s.id) || true).map((s) => [s.id, s.weapon, s.skin, s.type, s.rarity, s.price, s.img])) + ';',
  'const SKINS = SKIN_ROWS.map(([id, weapon, skin, type, rarity, price, img]) => ({ id, weapon, skin, type, rarity, price, img }));',
  'const SKIN = Object.fromEntries(SKINS.map((s) => [s.id, s]));',
  'const CASES = ' + JSON.stringify(cases) + ';',
  '',
].join('\n');
fs.writeFileSync(OUT, out);
const groups = cases.reduce((m, c) => ((m[c.group] = (m[c.group] || 0) + 1), m), {});
console.log(`skins: ${skins.length}, cases: ${cases.length}`, groups, `size: ${(out.length / 1024).toFixed(0)} KB`);
