// ───────────────────────── Настройки игры ─────────────────────────
// Должны совпадать с supabase/schema.sql
const HOUSE = 0.95;        // шанс = вход / цена цели × 0.95
const MAX_CHANCE = 0.75;
const MIN_CHANCE = 0.01;
const CLICK_VALUE = 0.01;  // $ за клик
const CLICKS_PER_SEC = 15; // клиентский лимит (сервер пропускает до 20/с)
const START_BALANCE = 1;
// В базе всё в долларах (цены Skinport), на экране — в рублях по живому курсу
const FX_URL = 'https://open.er-api.com/v6/latest/USD';
const FX_FALLBACK = 80;
const PAGE_SIZE = 19;      // + промо-карточка = 4 ряда по 5
const SHOP_PAGE = 20;
const DEFAULT_SETTINGS = { mult: [2, 4, 8], pct: [35, 55, 75], sound: true, fast: false };

const CFG = window.UPGRADER_CONFIG || {};
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const round2 = n => Math.round(n * 100) / 100;
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
let FX = FX_FALLBACK;                                   // ₽ за $1
const money = usd => fmt((usd || 0) * FX) + ' ₽';       // $ → «1 741,38 ₽»
const toUsd = rub => round2((Number(rub) || 0) / FX);   // ввод в рублях → $

// Курс USD→RUB: берём из бесплатного API, кэшируем на 6 часов, при ошибке — последний известный
async function loadFx() {
  try {
    const c = JSON.parse(localGet('upg_fx', 'null'));
    if (c?.rate) FX = c.rate;
    if (c && Date.now() - c.at < 6 * 3600e3) return;
    const r = await Promise.race([fetch(FX_URL).then(x => x.json()), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
    if (r?.rates?.RUB > 0) {
      FX = r.rates.RUB;
      localSet('upg_fx', JSON.stringify({ rate: FX, at: Date.now() }));
    }
  } catch (e) { console.warn('fx', e); }
}
const int = n => Number(n || 0).toLocaleString('ru-RU');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COIN = '';
const CHEV_DOWN = '<svg class="chev-down" viewBox="0 0 52 78"><path d="M4 4 26 22 48 4v14L26 36 4 18z"/><path d="M4 24 26 42 48 24v14L26 56 4 38z" opacity=".72"/><path d="M4 44 26 62 48 44v14L26 76 4 58z" opacity=".45"/></svg>';
const CHEV_UP = '<svg class="chev-up" viewBox="0 0 52 78"><path d="M4 34 26 16 48 34v14L26 30 4 48z" opacity=".72"/><path d="M4 54 26 36 48 54v14L26 50 4 68z" opacity=".45"/><path d="M4 18 26 0 48 18v14L26 14 4 32z"/></svg>';

function localGet(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localGet('upg_settings', '{}')) }; } catch { return { ...DEFAULT_SETTINGS }; }
}

const S = {
  catalog: [], byId: new Map(), imgPrefix: '', ghost: null,
  user: null, inventory: [],
  selInv: new Set(), useBalance: 0, target: null,
  filter: { q: '', from: null, to: null, desc: true, page: 0, userSorted: false, shuffled: null },
  shop: { q: '', from: null, to: null, desc: false, page: 0, cart: new Set() },
  invTab: 'skins', spinning: false, rotation: 180, freshInv: null,
  settings: loadSettings(),
  sessionEarned: 0, pendingClicks: 0, clickTimes: [],
  stats: { players: 0, upgrades: 0 }, online: 1,
};
let backend;

// ───────────────────────── Предметы ─────────────────────────
const img = (it, size = 256) => it?.i ? (it.i.startsWith('http') ? it.i : S.imgPrefix + it.i) + `/${size}fx${size}f` : '';
const prefix = it => (it.id.startsWith('★') ? '★ ' : '') + (it.st ? 'StatTrak™ ' : '') + (it.sv ? 'Souvenir ' : '');
const weaponLabel = it => prefix(it) + it.w;
const itemOf = invRow => S.byId.get(invRow.item_id) || {
  id: invRow.item_id, w: '', s: invRow.item_id, q: '', c: '#5d5d66', i: '', p: 0, st: 0, sv: 0,
};

function inputValue() {
  let v = S.useBalance;
  for (const inv of S.inventory) if (S.selInv.has(inv.id)) v += itemOf(inv).p;
  return round2(v);
}
const chanceFor = (input, target) => target && input > 0 ? (input / target.p) * HOUSE : 0;

// ───────────────────────── Бэкенды ─────────────────────────
// Локальный режим: всё хранится в localStorage этого браузера
class LocalBackend {
  mode = 'local';
  key = 'upgrader_local_v1';
  constructor() {
    try { this.db = JSON.parse(localStorage.getItem(this.key)); } catch {}
    if (!this.db?.accounts) this.db = { accounts: {}, current: null, nextId: 1 };
  }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.db)); } catch {} }
  get acc() { return this.db.accounts[this.db.current]; }
  async hasSession() { return !!this.acc; }
  async signIn({ username }) {
    if (!/^[\wА-Яа-яЁё.-]{3,20}$/.test(username || '')) throw new Error('Nickname: 3–20 letters, digits, _ . -');
    this.db.accounts[username] ??= {
      user: { username, balance: START_BALANCE, clicks: 0, upgrades_total: 0, upgrades_won: 0, best_win: 0 },
      inventory: [],
    };
    this.db.current = username;
    this.save();
  }
  signUp(p) { return this.signIn(p); }
  async signOut() { this.db.current = null; this.save(); }
  async profile() { return { ...this.acc.user }; }
  async inventory() { return [...this.acc.inventory].reverse(); }
  async click(n) {
    const u = this.acc.user;
    u.balance = round2(u.balance + n * CLICK_VALUE);
    u.clicks += n;
    this.save();
    return u.balance;
  }
  async upgrade(ids, bal, targetId) {
    const u = this.acc.user;
    const target = S.byId.get(targetId);
    bal = round2(bal);
    if (!target) throw new Error('Target not found');
    if (bal < 0 || bal > u.balance + 1e-9) throw new Error('Not enough balance');
    const rows = this.acc.inventory.filter(r => ids.includes(r.id));
    if (rows.length !== ids.length) throw new Error('Item not found');
    const chance = chanceFor(rows.reduce((s, r) => s + itemOf(r).p, 0) + bal, target);
    if (chance > MAX_CHANCE) throw new Error('Chance is above 75% — pick a more expensive item');
    if (chance < MIN_CHANCE) throw new Error('Chance is below 1%');
    const roll = Math.random();
    const won = roll < chance;
    this.acc.inventory = this.acc.inventory.filter(r => !ids.includes(r.id));
    u.balance = round2(u.balance - bal);
    u.upgrades_total++;
    let inv_id = null;
    if (won) {
      u.upgrades_won++;
      u.best_win = Math.max(u.best_win, target.p);
      inv_id = this.db.nextId++;
      this.acc.inventory.push({ id: inv_id, item_id: targetId });
    }
    this.save();
    return { won, roll, chance, inv_id, balance: u.balance };
  }
  async sell(ids) {
    const u = this.acc.user;
    for (const r of this.acc.inventory) if (ids.includes(r.id)) u.balance += itemOf(r).p;
    u.balance = round2(u.balance);
    this.acc.inventory = this.acc.inventory.filter(r => !ids.includes(r.id));
    this.save();
    return u.balance;
  }
  async buy(itemIds) {
    const u = this.acc.user;
    const items = itemIds.map(id => S.byId.get(id));
    if (items.some(x => !x)) throw new Error('Skin not found');
    const sum = round2(items.reduce((s, x) => s + x.p, 0));
    if (sum > u.balance + 1e-9) throw new Error('Not enough balance');
    u.balance = round2(u.balance - sum);
    for (const id of itemIds) this.acc.inventory.push({ id: this.db.nextId++, item_id: id });
    this.save();
    return u.balance;
  }
  async leaderboard() {
    return Object.values(this.db.accounts).map(a => {
      const inv = a.inventory.reduce((s, r) => s + itemOf(r).p, 0);
      return { ...a.user, inventory_value: inv, networth: a.user.balance + inv };
    }).sort((a, b) => b.networth - a.networth);
  }
  async stats() {
    const accs = Object.values(this.db.accounts);
    return { players: accs.length, upgrades: accs.reduce((s, a) => s + a.user.upgrades_total, 0) };
  }
  onOnline() {}
  onUpgrade() {}
  onAuthChange() {}
}

// Supabase: аккаунты, баланс и апгрейды на сервере, лидерборд из реальных игроков
class SupabaseBackend {
  mode = 'remote';
  async init() {
    const { createClient } = await import(SUPABASE_JS);
    this.sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
  }
  async hasSession() { return !!this.session; }
  async signUp({ email, password, username }) {
    if (!/^[\wА-Яа-яЁё.-]{3,20}$/.test(username || '')) throw new Error('Nickname: 3–20 letters, digits, _ . -');
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { username } } });
    if (error) throw error;
    this.session = data.session;
    if (!data.session) return 'confirm';
  }
  async signIn({ email, password }) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.session = data.session;
  }
  async signOut() { await this.sb.auth.signOut(); this.session = null; }
  async profile() {
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', this.session.user.id).single();
    if (error) throw error;
    return { ...data, balance: Number(data.balance), best_win: Number(data.best_win) };
  }
  async inventory() {
    const { data, error } = await this.sb.from('inventory').select('id,item_id').order('id', { ascending: false });
    if (error) throw error;
    return data;
  }
  async rpc(name, args) {
    const { data, error } = await this.sb.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async click(n) { return Number(await this.rpc('register_clicks', { p_count: n })); }
  upgrade(ids, bal, target) { return this.rpc('do_upgrade', { p_inv_ids: ids, p_balance: round2(bal), p_target: target }); }
  async sell(ids) { return Number(await this.rpc('sell_items', { p_inv_ids: ids })); }
  async buy(itemIds) { return Number(await this.rpc('buy_items', { p_items: itemIds })); }
  async leaderboard() { return (await this.rpc('get_leaderboard', { p_limit: 50 })) || []; }
  stats() { return this.rpc('get_stats'); }
  // Цены, по которым сервер считает шанс: { updated_at, prices: { id: price } }
  prices() { return this.rpc('get_prices'); }
  // Edge Function обновляет цены со Skinport (сама не даёт вызывать чаще раза в 10 минут)
  async syncPrices() {
    const { data, error } = await this.sb.functions.invoke('sync-prices');
    if (error) throw error;
    return data;
  }
  onOnline(cb) {
    const ch = this.sb.channel('online', { config: { presence: { key: crypto.randomUUID() } } });
    ch.on('presence', { event: 'sync' }, () => cb(Object.keys(ch.presenceState()).length))
      .subscribe(st => { if (st === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
  }
  onUpgrade(cb) {
    this.sb.channel('upgrade_log')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'upgrade_log' }, p => cb(p.new))
      .subscribe();
  }
  onAuthChange(cb) {
    this.sb.auth.onAuthStateChange((_e, session) => {
      const changed = (session?.user?.id) !== (this.session?.user?.id);
      this.session = session;
      if (changed) cb();
    });
  }
}

// ───────────────────────── Звук ─────────────────────────
let audio;
function beep(freq, dur = 0.06, type = 'square', vol = 0.04) {
  if (!S.settings.sound) return;
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch {}
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').prepend(el);
  setTimeout(() => el.remove(), 4200);
}

// ───────────────────────── Шапка / аккаунт ─────────────────────────
function renderAccount() {
  const u = S.user;
  $('#btn-signin').hidden = !!u;
  $('#user-chip').hidden = !u;
  if (u) {
    const ub = $('#uc-balance'), nv = money(u.balance);
    if (ub.textContent !== nv) { ub.textContent = nv; replay(ub, 'bump'); }
    $('#uc-avatar').textContent = u.username[0].toUpperCase();
    $('#uc-name').textContent = u.username;
  }
  $('#rw-balance').textContent = money(u?.balance);
  $('#rw-clicks').textContent = int(u?.clicks);
  $('#rw-session').textContent = money(S.sessionEarned);
  $('#rw-note').textContent = u
    ? (backend.mode === 'remote' ? 'Progress is saved to your account' : 'Local mode: progress is saved in this browser')
    : 'Sign in to start earning';
  renderBalanceSlider();
}

function renderStats() {
  $('#st-online').textContent = int(S.online);
  $('#st-upgrades').textContent = int(S.stats.upgrades);
  $('#st-players').textContent = int(S.stats.players);
}

async function refreshStats() {
  try { S.stats = await backend.stats(); renderStats(); } catch {}
}

async function refreshUser() {
  if (!(await backend.hasSession())) {
    S.user = null; S.inventory = [];
  } else {
    try {
      [S.user, S.inventory] = await Promise.all([backend.profile(), backend.inventory()]);
    } catch (e) {
      toast(e.message, 'err');
      S.user = null; S.inventory = [];
    }
  }
  const ids = new Set(S.inventory.map(r => r.id));
  for (const id of S.selInv) if (!ids.has(id)) S.selInv.delete(id);
  S.useBalance = Math.min(S.useBalance, S.user?.balance || 0);
  renderAll();
}

// ───────────────────────── Слоты и колесо ─────────────────────────
function ghostHTML(chev) {
  const g = S.ghost ? `<img class="ghost" src="${img(S.ghost, 360)}" alt="">` : '';
  return `${g}<div class="slot-glow"></div>${chev}`;
}

const WEAR_FULL = { FN: 'Factory New', MW: 'Minimal Wear', FT: 'Field-Tested', WW: 'Well-Worn', BS: 'Battle-Scarred' };

// Карточка выбранного скина в слоте, как на оригинале: оружие, крупное имя с качеством, картинка, цена
function slotSkinHTML({ weapon, title, image, price, clear, extra = '' }) {
  return `<button class="slot-x" data-clear="${clear}" title="Clear"><svg><use href="#i-close"/></svg></button>
    <div class="slot-sel">
      <small>${esc(weapon)}</small>
      <h3>${esc(title)}</h3>
      <div class="ss-img">${image}</div>
      <div class="ss-price">${money(price)}${extra}</div>
    </div>`;
}

function renderSlots() {
  const input = inputValue();
  const selected = S.inventory.filter(r => S.selInv.has(r.id)).map(itemOf).sort((a, b) => b.p - a.p);
  $('#slot-in').classList.toggle('filled', !!(selected.length || S.useBalance));
  $('#slot-out').classList.toggle('filled', !!S.target);

  let inHTML;
  if (!selected.length && !S.useBalance) {
    inHTML = ghostHTML(CHEV_DOWN);
  } else if (selected.length) {
    const top = selected[0];
    const more = selected.length - 1;
    inHTML = slotSkinHTML({
      clear: 'in',
      weapon: weaponLabel(top) + (more ? ` + ${more} more` : '') + (S.useBalance ? ` + ${money(S.useBalance)}` : ''),
      title: `${top.s} ${WEAR_FULL[top.q] || ''}`.trim(),
      image: `<img src="${img(top, 360)}" alt="">`,
      price: input,
    });
  } else {
    inHTML = slotSkinHTML({
      clear: 'in', weapon: 'Balance', title: 'Balance amount', price: input,
      image: '<svg class="ss-coin"><use href="#i-wallet"/></svg>',
    });
  }
  $('#slot-in-body').innerHTML = inHTML;

  const t = S.target;
  $('#slot-out-body').innerHTML = t
    ? slotSkinHTML({
      clear: 'out', weapon: weaponLabel(t), title: `${t.s} ${WEAR_FULL[t.q] || ''}`.trim(),
      image: `<img src="${img(t, 360)}" alt="">`, price: t.p,
      extra: input > 0 ? `<span class="si-x">x${(t.p / input).toFixed(2)}</span>` : '',
    })
    : ghostHTML(CHEV_UP);
  renderWheel();
}

function chanceLabel(c) {
  if (c < 0.25) return ['low chance', '#ff7a45'];
  if (c < 0.6) return ['medium chance', 'var(--lime)'];
  if (c < 0.74) return ['high chance', '#b5e04a'];
  return ['very high chance', '#d4e84a'];
}

function renderWheel(chanceOverride) {
  const c = chanceOverride ?? Math.min(chanceFor(inputValue(), S.target), 1);
  const arcC = c > 0 ? Math.min(c, 1) : 0.5; // без выбора — половина дуги, как на оригинале
  for (const arc of $$('.wheel-arc')) {
    const len = 2 * Math.PI * Number(arc.getAttribute('r'));
    // через style, а не атрибут — так дуга плавно анимируется CSS-переходом
    arc.style.strokeDasharray = `${arcC * len} ${len}`;
    // дуга шанса симметрична относительно низа колеса; круг SVG начинается с «3 часов»
    arc.style.transform = `rotate(${180 - arcC * 180 - 90}deg)`;
  }

  const logged = !!S.user;
  $('.wc-logo').style.display = logged ? 'none' : '';
  $('.wc-chance').hidden = !logged;
  $('#wheel-ghost').setAttribute('opacity', logged ? '1' : '0');
  const [label, color] = c > 0 ? chanceLabel(c) : ['select skins', 'var(--muted)'];
  countTo($('#wc-chance'), c * 100);
  $('#wc-chance').style.color = c > MAX_CHANCE ? 'var(--red)' : color;
  $('#wc-label').textContent = c > MAX_CHANCE ? 'max chance is 75%' : label;
  $('#wc-label').style.color = c > MAX_CHANCE ? 'var(--red)' : color;

  const ready = logged && c >= MIN_CHANCE && c <= MAX_CHANCE;
  $('#btn-improve').disabled = S.spinning;
  $('#btn-improve').classList.toggle('dim', !ready);
}

// Плавный счётчик процента шанса
function countTo(el, to) {
  const from = el._val ?? 0;
  el._val = to;
  cancelAnimationFrame(el._raf);
  const t0 = performance.now(), dur = 380;
  const step = now => {
    const k = Math.min((now - t0) / dur, 1);
    const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
    el.textContent = v.toFixed(2) + '%';
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
  // в фоновой вкладке rAF не вызывается — финальное значение ставим таймером
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.textContent = to.toFixed(2) + '%'), dur + 30);
  if (Math.abs(to - from) > 0.01) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

// Частицы при выигрыше
function burst(el, colors = ['#ffd200', '#3ddc84', '#ff8a00', '#ffffff']) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.className = 'particle';
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
    p.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${colors[i % colors.length]};--tx:${Math.cos(a) * d}px;--ty:${Math.sin(a) * d - 40}px;animation-delay:${Math.random() * 80}ms`;
    document.body.append(p);
    setTimeout(() => p.remove(), 1100);
  }
}

// Перезапуск CSS-анимации появления у элемента
function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

function setPointer(deg, ms = 0) {
  const p = $('#wheel-pointer');
  p.classList.toggle('spin', ms > 0);
  p.style.setProperty('--spin', ms + 'ms');
  p.style.transform = `rotate(${deg}deg)`;
  S.rotation = deg;
}

function spinTo(roll, chance) {
  return new Promise(resolve => {
    const final = 180 - chance * 180 + roll * 360;        // попадание в дугу ⇔ roll < chance
    const cur = S.rotation;
    let next = cur - (((cur % 360) + 360) % 360) + 360 * 6 + (((final % 360) + 360) % 360);
    if (next - cur < 360 * 5) next += 360;
    const ms = S.settings.fast ? 1600 : 5200;
    setPointer(next, ms);
    // тиканье, замедляющееся вместе со стрелкой
    const t0 = performance.now();
    let lastTick = 0;
    const tick = now => {
      const k = Math.min((now - t0) / ms, 1);
      const eased = 1 - Math.pow(1 - k, 3.2);
      const passed = Math.floor(eased * (next - cur) / 18);
      if (passed > lastTick) { lastTick = passed; beep(900, 0.025, 'square', 0.015); }
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // конец прокрутки — по таймеру, чтобы не зависеть от rAF в фоновой вкладке
    setTimeout(resolve, ms + 50);
  });
}

async function doUpgrade() {
  if (S.spinning) return;
  if (!S.user) return openAuth();
  const input = inputValue();
  if (input <= 0) return toast('Select skins or balance to use', 'err');
  if (!S.target) return toast('Select skin for upgrade', 'err');
  const c = chanceFor(input, S.target);
  if (c > MAX_CHANCE) return toast('Chance is above 75% — pick a more expensive skin', 'err');
  if (c < MIN_CHANCE) return toast('Chance is below 1% — pick a cheaper skin', 'err');

  S.spinning = true;
  renderWheel();
  $$('.up-slot').forEach(s => s.classList.remove('win', 'lose'));
  $('.wheel-wrap').classList.remove('won', 'lost');
  const target = S.target;
  let res;
  try {
    res = await backend.upgrade([...S.selInv], S.useBalance, target.id);
  } catch (e) {
    S.spinning = false;
    renderWheel();
    return toast(e.message, 'err');
  }
  renderWheel(Number(res.chance));
  await spinTo(Number(res.roll), Number(res.chance));

  $('.wheel-wrap').classList.add(res.won ? 'won' : 'lost');
  if (res.won) {
    $('#slot-out').classList.add('win');
    burst($('#slot-out'));
    burst($('.wheel-wrap'));
    beep(660, 0.12, 'triangle', 0.08); setTimeout(() => beep(990, 0.25, 'triangle', 0.08), 120);
    toast(`You won ${target.s} — ${money(target.p)}`, 'ok');
    S.freshInv = res.inv_id;
    addFeedCard(target, S.user.username, true);
  } else {
    $('#slot-in').classList.add('lose');
    replay($('#slot-in'), 'shake');
    beep(180, 0.3, 'sawtooth', 0.05);
    toast('Upgrade failed', 'err');
  }

  await new Promise(r => setTimeout(r, S.settings.fast ? 700 : 1500));
  S.selInv.clear();
  S.useBalance = 0;
  S.target = null;
  S.spinning = false;
  if (!S.filter.userSorted) S.filter.desc = true;
  $$('.up-slot').forEach(s => s.classList.remove('win', 'lose'));
  $('.wheel-wrap').classList.remove('won', 'lost');
  setPointer(Math.round((S.rotation - 180) / 360) * 360 + 180, 600);
  await refreshUser();
  refreshStats();
}

// ───────────────────────── Баланс и быстрый выбор ─────────────────────────
function renderBalanceSlider() {
  const r = $('#bal-range');
  // слайдер ходит по центам
  const maxCents = Math.floor((S.user?.balance || 0) * 100);
  const val = Math.round(S.useBalance * 100);
  r.max = maxCents;
  r.value = val;
  r.disabled = !S.user || S.spinning;
  r.style.setProperty('--p', maxCents ? (val / maxCents) * 100 + '%' : '0%');
  $('#bal-val').textContent = money(val / 100);
  $('#bal-max').textContent = `(max ${money(S.user?.balance || 0)})`;
}

function renderQuick() {
  const { mult, pct } = S.settings;
  const cls = p => (p < 40 ? 'low' : p < 65 ? 'mid' : 'high');
  $('#quick').innerHTML =
    mult.map(m => `<button class="q" data-quick="x" data-v="${m}">x${m}</button>`).join('') +
    pct.map(p => `<button class="q ${cls(p)}" data-quick="p" data-v="${p}">${p}%</button>`).join('') +
    '<button class="q-gear" data-action="settings" title="Settings"><svg><use href="#i-gear"/></svg></button>';
}

// x2 — цель примерно в 2 раза дороже входа; 35% — цель с шансом около 35%
function quickSelect(kind, v) {
  if (S.spinning) return;
  const input = inputValue();
  if (input <= 0) return toast('Select skins or balance first', 'err');
  const want = kind === 'x' ? input * v : input * HOUSE / (v / 100);
  const lo = input * HOUSE / MAX_CHANCE, hi = input * HOUSE / MIN_CHANCE;
  let best = null, bestD = Infinity;
  for (const it of S.catalog) {
    if (it.p < lo || it.p > hi) continue;
    const d = Math.abs(it.p - want);
    if (d < bestD) { bestD = d; best = it; }
  }
  if (!best) return toast('No suitable skin found', 'err');
  S.target = best;
  // показываем выбранный скин в сетке
  Object.assign(S.filter, { q: '', from: null, to: null, shuffled: null, desc: false, userSorted: false });
  $('#f-name').value = $('#f-from').value = $('#f-to').value = '';
  const idx = targetList().findIndex(it => it.id === best.id);
  S.filter.page = Math.max(0, Math.floor(idx / PAGE_SIZE));
  beep(1100, 0.04, 'triangle', 0.04);
  renderSlots();
  renderTargets();
}

// ───────────────────────── Инвентарь и магазин ─────────────────────────
function cardHTML(it, { cls = '', extra = '', attrs = '' } = {}) {
  return `<div class="icard ${cls}" style="--c:${it.c}" ${attrs}>
    <div class="ic-price">${money(it.p)}${COIN}</div>
    ${it.q ? `<div class="ic-wear">${it.q}</div>` : ''}
    ${it.st ? '<div class="ic-st">ST™</div>' : ''}
    <img src="${img(it, 128)}" alt="" loading="lazy">
    <div class="ic-weapon">${esc(weaponLabel(it))}</div>
    <div class="ic-name">${esc(it.s)}</div>
    ${extra}
  </div>`;
}

let showcaseTimer, showcaseIdx = 0;
function renderInventory() {
  const body = $('#inv-body');
  const shop = S.invTab === 'shop' && !!S.user;
  clearInterval(showcaseTimer);
  $$('[data-invtab]').forEach(b => b.classList.toggle('active', b.dataset.invtab === (shop ? 'shop' : 'skins')));
  $('#inv-title').textContent = shop ? 'Shop' : 'My skins';
  $('.inv-panel').classList.toggle('shop', shop);
  $('#shop-tools').hidden = !shop;
  $('#shop-pager').hidden = !shop;
  $('#btn-sell').hidden = shop || !S.user || !S.selInv.size;
  const selSum = S.inventory.filter(r => S.selInv.has(r.id)).reduce((s, r) => s + itemOf(r).p, 0);
  $('#sell-sum').textContent = money(selSum);
  const total = S.inventory.reduce((s, r) => s + itemOf(r).p, 0);
  $('#inv-total').hidden = shop || !S.user || !S.inventory.length || S.selInv.size > 0;
  $('#inv-total').innerHTML = `Total skins: <b>${money(total)}</b>`;

  if (!S.user) {
    body.innerHTML = `<div class="unauth">
      <div class="inv-empty">
        <h3>You are not authorized</h3>
        <p>Log in to access upgrades</p>
        <button class="btn-yellow" data-action="login">Login to play <svg><use href="#i-steam"/></svg></button>
      </div>
      <div class="showcase" id="showcase"></div>
    </div>`;
    renderShowcase();
    showcaseTimer = setInterval(() => { showcaseIdx++; renderShowcase(); }, 3000);
    return;
  }

  if (shop) return renderShop();

  if (!S.inventory.length) {
    // как на оригинале: размытые скины и предложение пополнить баланс
    const deco = S.catalog.slice(40, 60);
    let need = '';
    if (S.target) {
      // сколько не хватает до первого процентного быстрого выбора
      const lack = S.target.p * (S.settings.pct[0] / 100) / HOUSE - S.user.balance;
      if (lack > 0) need = `<br>by <b>${money(lack)}${COIN}</b>`;
    }
    body.innerHTML = `<div class="topup">
      <div class="inv-grid">${deco.map(it => cardHTML(it)).join('')}</div>
      <div class="topup-card">
        <p>Top up balance${need}</p>
        <a href="#rewards"><svg><use href="#i-wallet"/></svg>Top Up</a>
      </div>
    </div>`;
    return;
  }

  const rows = S.inventory.map(r => ({ r, it: itemOf(r) })).sort((a, b) => b.it.p - a.it.p);
  // как на оригинале: сетка всегда заполнена, свободные места — пустые клетки
  const empty = Math.max(0, 20 - rows.length) + ((5 - (Math.max(rows.length, 20) % 5)) % 5);
  body.innerHTML = `<div class="inv-grid">${rows.map(({ r, it }) => cardHTML(it, {
    cls: `inv-card ${S.selInv.has(r.id) ? 'sel' : ''} ${S.freshInv === r.id ? 'fresh' : ''}`,
    attrs: `data-inv="${r.id}"`,
    extra: `<span class="ic-check"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <button class="sell-x" data-sell="${r.id}">SELL</button>`,
  })).join('')}${'<div class="cell-empty"></div>'.repeat(empty)}</div>`;
  const key = 'inv|' + rows.map(x => x.r.id).join(',');
  if (key !== renderInventory.key) { renderInventory.key = key; replay(body.firstElementChild, 'stagger'); }
  S.freshInv = null;
}

function shopList() {
  const f = S.shop;
  const q = f.q.trim().toLowerCase();
  const lo = f.from ?? 0, hi = f.to ?? Infinity;
  const list = S.catalog.filter(it => it.p >= lo && it.p <= hi && (!q || it.id.toLowerCase().includes(q)));
  return f.desc ? list : list.reverse();
}

function renderShop() {
  const list = shopList();
  const pages = Math.max(1, Math.ceil(list.length / SHOP_PAGE));
  S.shop.page = Math.min(S.shop.page, pages - 1);
  const items = list.slice(S.shop.page * SHOP_PAGE, (S.shop.page + 1) * SHOP_PAGE);
  $('#inv-body').innerHTML = items.length
    ? `<div class="inv-grid">${items.map(it => cardHTML(it, { cls: S.shop.cart.has(it.id) ? 'sel' : '', attrs: `data-buy="${esc(it.id)}"` })).join('')}</div>`
    : '<div class="inv-empty"><p>Nothing found</p></div>';
  const key = [S.shop.page, S.shop.q, S.shop.from, S.shop.to, S.shop.desc].join('|');
  if (key !== renderShop.key) { renderShop.key = key; replay($('#inv-body').firstElementChild, 'stagger'); }
  renderInventory.key = null;
  $('#sp-prev').disabled = S.shop.page === 0;
  $('#sp-next').disabled = S.shop.page >= pages - 1;
  $('#s-sort').classList.toggle('asc', !S.shop.desc);
  renderCart();
}

const cartSum = () => round2([...S.shop.cart].reduce((s, id) => s + (S.byId.get(id)?.p || 0), 0));

// Всплывающая корзина: список выбранных скинов, удаление по крестику, итог и покупка
function renderCart() {
  $('#s-count').textContent = S.shop.cart.size;
  const pop = $('#cart-pop');
  if (pop.hidden) return;
  const items = [...S.shop.cart].map(id => S.byId.get(id)).filter(Boolean);
  const sum = cartSum();
  const enough = S.user && sum <= S.user.balance + 1e-9;
  pop.innerHTML = `<h4>Cart (${items.length})${items.length ? '<button data-cart="clear">Clear all</button>' : ''}</h4>
    ${items.length ? `<div class="cart-list">${items.map(it => `<div class="cart-row" style="--c:${it.c}">
        <img src="${img(it, 128)}" alt="">
        <div><small>${esc(weaponLabel(it))}${it.q ? ' · ' + it.q : ''}</small><b>${esc(it.s)}</b></div>
        <span>${money(it.p)}</span>
        <button data-cart-remove="${esc(it.id)}" title="Remove"><svg><use href="#i-close"/></svg></button>
      </div>`).join('')}</div>` : '<div class="cart-empty">Cart is empty — click skins in the shop to add them</div>'}
    <div class="cart-foot">
      <div>Total<b>${money(sum)}</b></div>
      <button class="btn-yellow" data-cart="buy" ${items.length && enough ? '' : 'disabled'}>${items.length && !enough ? 'Not enough balance' : 'Buy'}</button>
    </div>`;
}

function toggleCart(show = $('#cart-pop').hidden) {
  $('#cart-pop').hidden = !show;
  renderCart();
}

async function buyCart() {
  if (!S.shop.cart.size) return toast('Select skins to buy', 'err');
  const ids = [...S.shop.cart];
  const sum = cartSum();
  if (sum > S.user.balance + 1e-9) return toast(`Not enough balance: need ${money(sum)}`, 'err');
  try {
    await backend.buy(ids);
    S.shop.cart.clear();
    toggleCart(false);
    toast(`Bought ${ids.length} skin${ids.length > 1 ? 's' : ''} for ${money(sum)}`, 'ok');
    beep(1500, 0.08, 'triangle', 0.05);
    await refreshUser();
  } catch (e) { toast(e.message, 'err'); }
}

function renderShowcase() {
  const el = $('#showcase');
  if (!el || !S.catalog.length) return;
  const pool = S.catalog.slice(0, 300);
  const w = el.clientWidth || 462, cx = (w - 180) / 2;
  const pos = [[-1, cx - 205, 'side'], [0, cx, ''], [1, cx + 205, 'side']];
  el.innerHTML = pos.map(([d, x, cls]) => {
    const it = pool[(showcaseIdx + d + 1 + pool.length) * 37 % pool.length];
    return `<div class="sc-card ${cls}" style="transform:translateX(${x}px) scale(${cls ? .8 : 1})">
      <div class="sc-in"><img src="${img(it, 256)}" alt=""><small>${esc(weaponLabel(it))}</small><b>${esc(it.s)}</b></div>
    </div>`;
  }).join('');
}

// ───────────────────────── Цели апгрейда ─────────────────────────
function targetList() {
  const f = S.filter;
  const input = inputValue();
  let list = f.shuffled || S.catalog;
  const q = f.q.trim().toLowerCase();
  // без своих фильтров при выбранном входе показываем только цели с шансом 1–75%;
  // со своими «от/до» показываем всё, а недоступные скины — под замком
  const own = f.from != null || f.to != null;
  const lo = own ? (f.from ?? 0) : input > 0 ? input * HOUSE / MAX_CHANCE : 0;
  const hi = own ? (f.to ?? Infinity) : input > 0 ? input * HOUSE / MIN_CHANCE : Infinity;
  list = list.filter(it => it.p >= lo && it.p <= hi && (!q || it.id.toLowerCase().includes(q)));
  if (!f.shuffled && !f.desc) list = [...list].reverse();
  return list;
}

function renderTargets() {
  const list = targetList();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  S.filter.page = Math.min(S.filter.page, pages - 1);
  const items = list.slice(S.filter.page * PAGE_SIZE, (S.filter.page + 1) * PAGE_SIZE);
  const promoA = S.catalog.find(x => x.w === 'Desert Eagle' && x.c === '#eb4b4b') || S.catalog[0];
  const promoB = S.catalog.find(x => x.w === 'AWP' && x.c === '#eb4b4b') || S.catalog[1];
  const promo = `<div class="promo-card" data-action="shuffle" title="Show random skins">
    ${promoA ? `<img src="${img(promoA, 128)}" alt="">` : ''}${promoB ? `<img src="${img(promoB, 128)}" alt="">` : ''}
    <span>${S.filter.shuffled ? 'ALL' : 'RANDOM'} <em>SKINS</em> ›</span>
  </div>`;
  $('#tgt-grid').innerHTML = promo + (items.length
    ? items.map(it => {
      const input = inputValue();
      const c = chanceFor(input, it);
      const locked = input > 0 && (c > MAX_CHANCE || c < MIN_CHANCE);
      return cardHTML(it, locked
        ? { cls: 'locked', extra: '<svg class="ic-lock" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10zm2.2 0h5.6V7a2.8 2.8 0 0 0-5.6 0z"/></svg>' }
        : { cls: S.target?.id === it.id ? 'sel' : '', attrs: `data-target="${esc(it.id)}"` });
    }).join('')
    : `<div style="grid-column:2/-1;display:grid;place-items:center;color:var(--muted);font-size:11px">Nothing found</div>`);
  // карточки «въезжают» только при смене страницы/фильтров, а не на каждый клик
  const key = [S.filter.page, S.filter.q, S.filter.from, S.filter.to, S.filter.desc, !!S.filter.shuffled, inputValue(), items.length].join('|');
  if (key !== renderTargets.key) { renderTargets.key = key; replay($('#tgt-grid'), 'stagger'); }
  $('#pg-prev').disabled = S.filter.page === 0;
  $('#pg-next').disabled = S.filter.page >= pages - 1;
  $('#sort-btn').classList.toggle('asc', !S.filter.desc);
}

// ───────────────────────── Лента слева ─────────────────────────
function addFeedCard(it, username, real = false) {
  if (!it) return;
  const list = $('#feed-list');
  const el = document.createElement('div');
  el.className = 'fcard' + (username ? ' real' : '');
  el.style.setProperty('--c', it.c);
  if (username) el.dataset.user = username;
  el.title = `${prefix(it)}${it.w} | ${it.s} — ${money(it.p)}`;
  el.innerHTML = `<img src="${img(it, 128)}" alt=""><div class="fc-txt"><b>${esc(it.s)}</b><small>${esc(weaponLabel(it))}</small></div>`;
  list.prepend(el);
  while (list.children.length > 18) list.lastElementChild.remove();
  if (real) el.style.boxShadow = 'inset 0 0 0 1px rgba(255,210,0,.6)';
}

function randomDrop() {
  const c = S.catalog;
  if (!c.length) return null;
  // чаще дорогие предметы — как на настоящих лентах дропов
  const top = Math.min(c.length, 2500);
  return Math.random() < 0.45 ? c[Math.floor(Math.random() ** 1.6 * top)] : c[Math.floor(Math.random() * c.length)];
}

function startFeed() {
  for (let i = 0; i < 16; i++) addFeedCard(randomDrop());
  $$('.fcard').forEach(el => (el.style.animation = 'none'));
  const loop = () => { addFeedCard(randomDrop()); setTimeout(loop, 1800 + Math.random() * 2800); };
  setTimeout(loop, 2000);
}

// ───────────────────────── Кликер ─────────────────────────
function onCoinClick(e) {
  if (!S.user) return openAuth();
  const now = performance.now();
  S.clickTimes = S.clickTimes.filter(t => now - t < 1000);
  if (S.clickTimes.length >= CLICKS_PER_SEC) return;
  S.clickTimes.push(now);
  S.pendingClicks++;
  S.user.balance = round2(S.user.balance + CLICK_VALUE);
  S.user.clicks++;
  S.sessionEarned = round2(S.sessionEarned + CLICK_VALUE);
  beep(1200 + Math.random() * 300, 0.04, 'triangle', 0.03);
  const pop = document.createElement('div');
  pop.className = 'click-pop';
  pop.textContent = '+' + money(CLICK_VALUE);
  pop.style.left = (e.clientX || innerWidth / 2) - 10 + 'px';
  pop.style.top = (e.clientY || innerHeight / 2) - 20 + 'px';
  pop.style.setProperty('--dx', (Math.random() * 40 - 20) + 'px');
  document.body.append(pop);
  setTimeout(() => pop.remove(), 800);
  renderAccount();
}

async function flushClicks() {
  const n = S.pendingClicks;
  if (!n || !S.user) return;
  S.pendingClicks = 0;
  try {
    const bal = await backend.click(n);
    // сервер — источник правды; добавляем клики, сделанные пока шёл запрос
    S.user.balance = round2(bal + S.pendingClicks * CLICK_VALUE);
    renderAccount();
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ───────────────────────── Лидерборд ─────────────────────────
async function renderLeaderboard() {
  const body = $('#lb-body');
  body.innerHTML = '<div class="lb-empty"><div class="spinner"></div>Loading…</div>';
  let rows;
  try { rows = await backend.leaderboard(); } catch (e) { body.innerHTML = `<div class="lb-empty">${esc(e.message)}</div>`; return; }
  if (!rows.length) { body.innerHTML = '<div class="lb-empty">No players yet — be the first!</div>'; return; }
  const note = backend.mode === 'local'
    ? '<div class="lb-empty" style="padding:14px">Local mode: only players from this browser. Connect Supabase to see everyone.</div>' : '';
  body.innerHTML = rows.map((r, i) => `<div class="lb-row ${i < 3 ? 'top' + (i + 1) : ''} ${r.username === S.user?.username ? 'me' : ''}">
    <span class="rank">${i + 1}</span>
    <span class="pl"><span class="av">${esc(r.username[0].toUpperCase())}</span><span>${esc(r.username)}</span></span>
    <span class="money big">${money(r.networth)}${COIN}</span>
    <span class="money">${money(r.balance)}</span>
    <span class="money">${money(r.inventory_value)}</span>
    <span>${int(r.upgrades_won)}/${int(r.upgrades_total)}</span>
    <span class="money">${money(r.best_win)}</span>
  </div>`).join('') + note;
}

// ───────────────────────── Вход ─────────────────────────
let authTab = 'in';
function openAuth(tab = 'in') {
  authTab = tab;
  $('#auth-modal').hidden = false;
  renderAuthForm();
  setTimeout(() => $('#auth-form label:not([hidden]) input')?.focus(), 30);
}
function renderAuthForm() {
  const remote = backend.mode === 'remote';
  $$('[data-authtab]').forEach(b => b.classList.toggle('active', b.dataset.authtab === authTab));
  $$('#auth-form [data-only]').forEach(el => {
    const need = el.dataset.only;
    el.hidden = need === 'remote' ? !remote : need === 'up' ? (remote && authTab !== 'up') : false;
  });
  $('#auth-submit').textContent = authTab === 'up' ? 'Create account' : 'Sign in';
  $('#auth-err').textContent = '';
  $('#auth-hint').textContent = remote
    ? 'Your balance and skins are saved in your account and you appear on the leaderboard.'
    : 'Supabase is not connected — progress is saved in this browser only.';
}
async function submitAuth(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const p = { username: f.get('username')?.trim(), email: f.get('email')?.trim(), password: f.get('password') };
  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    const r = authTab === 'up' ? await backend.signUp(p) : await backend.signIn(p);
    if (r === 'confirm') {
      $('#auth-err').style.color = 'var(--green)';
      $('#auth-err').textContent = 'Check your email to confirm the account, then sign in.';
      return;
    }
    $('#auth-modal').hidden = true;
    e.target.reset();
    await refreshUser();
    refreshStats();
    toast(`Welcome, ${S.user?.username}!`, 'ok');
  } catch (err) {
    $('#auth-err').style.color = '';
    $('#auth-err').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

// ───────────────────────── Settings ─────────────────────────
function openSettings(draft = S.settings) {
  const box = (id, vals, sign, max) => {
    $(id).innerHTML = vals.map((v, i) => sign === 'x'
      ? `<label>×<input type="number" min="1.1" max="${max}" step="0.1" value="${v}" data-i="${i}"></label>`
      : `<label><input type="number" min="1" max="${max}" step="1" value="${v}" data-i="${i}">%</label>`).join('');
  };
  box('#set-mult', draft.mult, 'x', 100);
  box('#set-pct', draft.pct, '%', 75);
  $$('#settings-modal [name=sound]').forEach(r => (r.checked = (r.value === '1') === draft.sound));
  $$('#settings-modal [name=speed]').forEach(r => (r.checked = (r.value === '1') === draft.fast));
  $('#settings-modal').hidden = false;
}
function saveSettings() {
  const read = (id, lo, hi, d) => $$(id + ' input').map((el, i) => {
    const v = Number(el.value);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : d[i];
  });
  S.settings = {
    mult: read('#set-mult', 1.1, 100, DEFAULT_SETTINGS.mult),
    pct: read('#set-pct', 1, 75, DEFAULT_SETTINGS.pct),
    sound: $('#settings-modal [name=sound]:checked')?.value === '1',
    fast: $('#settings-modal [name=speed]:checked')?.value === '1',
  };
  localSet('upg_settings', JSON.stringify(S.settings));
  $('#settings-modal').hidden = true;
  renderQuick();
  renderToolIcons();
}
function renderToolIcons() {
  $('#btn-sound').classList.toggle('on', S.settings.sound);
  $('#btn-fast').classList.toggle('on', S.settings.fast);
}

// ───────────────────────── Навигация ─────────────────────────
function route() {
  const view = ['upgrade', 'rewards', 'leaderboard'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'upgrade';
  $$('.view').forEach(v => (v.hidden = v.id !== 'view-' + view));
  replay($('#view-' + view), 'view-in');
  $$('.mainnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === view));
  if (view === 'leaderboard') renderLeaderboard();
  scrollTo(0, 0);
}

function renderAll() {
  renderAccount();
  renderSlots();
  renderInventory();
  renderTargets();
}

// ───────────────────────── События ─────────────────────────
function bind() {
  $('#btn-signin').onclick = () => openAuth();
  $('#btn-signout').onclick = async () => { await backend.signOut(); S.selInv.clear(); S.useBalance = 0; refreshUser(); };
  $('#auth-form').onsubmit = submitAuth;
  $$('[data-authtab]').forEach(b => (b.onclick = () => { authTab = b.dataset.authtab; renderAuthForm(); }));
  $$('.modal').forEach(m => (m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) m.hidden = true; }));
  addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal').forEach(m => (m.hidden = true)); });

  $('#btn-improve').onclick = doUpgrade;
  $('#btn-info').onclick = () => ($('#info-modal').hidden = false);
  $('#btn-settings').onclick = () => openSettings();
  $('#btn-sound').onclick = () => { S.settings.sound = !S.settings.sound; localSet('upg_settings', JSON.stringify(S.settings)); renderToolIcons(); };
  $('#btn-fast').onclick = () => { S.settings.fast = !S.settings.fast; localSet('upg_settings', JSON.stringify(S.settings)); renderToolIcons(); toast(S.settings.fast ? 'Fast scroll on' : 'Normal scroll'); };
  $('#set-save').onclick = saveSettings;
  $('#set-default').onclick = () => openSettings(DEFAULT_SETTINGS);
  $$('[data-reset]').forEach(b => (b.onclick = () => {
    const k = b.dataset.reset;
    $$(`#set-${k} input`).forEach((el, i) => (el.value = DEFAULT_SETTINGS[k][i]));
  }));

  $('#quick').onclick = e => {
    if (e.target.closest('[data-action="settings"]')) return openSettings();
    const b = e.target.closest('[data-quick]');
    if (b) quickSelect(b.dataset.quick, Number(b.dataset.v));
  };
  $('#bal-range').oninput = e => {
    if (S.spinning || !S.user) return;
    S.useBalance = Math.min(toUsd(e.target.value / 100), S.user.balance);
    onInputChange(false);
  };

  $('#inv-body').onclick = async e => {
    if (e.target.closest('[data-action="login"]')) return openAuth();
    if (S.spinning) return;
    const buy = e.target.closest('[data-buy]');
    if (buy) {
      const id = buy.dataset.buy;
      S.shop.cart.has(id) ? S.shop.cart.delete(id) : S.shop.cart.add(id);
      buy.classList.toggle('sel', S.shop.cart.has(id));
      renderCart();
      return;
    }
    const sell = e.target.closest('[data-sell]');
    if (sell) return sellItems([Number(sell.dataset.sell)]);
    const card = e.target.closest('[data-inv]');
    if (card) {
      const id = Number(card.dataset.inv);
      S.selInv.has(id) ? S.selInv.delete(id) : S.selInv.add(id);
      onInputChange();
    }
  };
  $$('[data-invtab]').forEach(b => (b.onclick = () => {
    if (!S.user) return openAuth();
    S.invTab = b.dataset.invtab;
    renderInventory();
  }));
  $('#btn-sell').onclick = () => sellItems([...S.selInv]);

  // фильтры магазина
  const applyShop = () => {
    S.shop.q = $('#s-name').value;
    S.shop.from = $('#s-from').value === '' ? null : toUsd($('#s-from').value);
    S.shop.to = $('#s-to').value === '' ? null : toUsd($('#s-to').value);
    S.shop.page = 0;
    renderShop();
  };
  let st;
  ['#s-name', '#s-from', '#s-to'].forEach(s => ($(s).oninput = () => { clearTimeout(st); st = setTimeout(applyShop, 200); }));
  $('#s-search').onclick = applyShop;
  $('#s-sort').onclick = () => { S.shop.desc = !S.shop.desc; S.shop.page = 0; renderShop(); };
  $('#s-cart').onclick = e => { e.stopPropagation(); toggleCart(); };
  $('#cart-pop').onclick = e => {
    e.stopPropagation();
    const rm = e.target.closest('[data-cart-remove]');
    if (rm) {
      S.shop.cart.delete(rm.dataset.cartRemove);
      $$('#inv-body [data-buy]').forEach(c => c.classList.toggle('sel', S.shop.cart.has(c.dataset.buy)));
      return renderCart();
    }
    const act = e.target.closest('[data-cart]')?.dataset.cart;
    if (act === 'clear') { S.shop.cart.clear(); renderShop(); }
    if (act === 'buy') buyCart();
  };
  // клик мимо корзины закрывает её
  document.addEventListener('click', e => { if (!e.target.closest('.cart-wrap')) $('#cart-pop').hidden = true; });
  $('#sp-prev').onclick = () => { S.shop.page--; renderShop(); };
  $('#sp-next').onclick = () => { S.shop.page++; renderShop(); };

  // крестик в слоте сбрасывает выбор
  $('.up-stage').addEventListener('click', e => {
    const x = e.target.closest('[data-clear]');
    if (!x || S.spinning) return;
    if (x.dataset.clear === 'in') { S.selInv.clear(); S.useBalance = 0; onInputChange(); }
    else { S.target = null; renderSlots(); renderTargets(); }
  });

  // цели апгрейда
  $('#tgt-grid').onclick = e => {
    if (S.spinning) return;
    if (e.target.closest('[data-action="shuffle"]')) {
      S.filter.shuffled = S.filter.shuffled ? null : [...S.catalog].sort(() => Math.random() - 0.5);
      S.filter.page = 0;
      return renderTargets();
    }
    const lockedCard = e.target.closest('.locked');
    if (lockedCard) { replay(lockedCard, 'shake'); return toast('This skin is not available for your current selection', 'err'); }
    const card = e.target.closest('[data-target]');
    if (!card) return;
    const it = S.byId.get(card.dataset.target);
    S.target = S.target?.id === it.id ? null : it;
    renderSlots();
    renderTargets();
    if (!S.inventory.length && S.user) renderInventory();
  };
  $('#sort-btn').onclick = () => { S.filter.desc = !S.filter.desc; S.filter.userSorted = true; S.filter.shuffled = null; S.filter.page = 0; renderTargets(); };
  const applyFilters = () => {
    S.filter.q = $('#f-name').value;
    S.filter.from = $('#f-from').value === '' ? null : toUsd($('#f-from').value);
    S.filter.to = $('#f-to').value === '' ? null : toUsd($('#f-to').value);
    S.filter.page = 0;
    renderTargets();
  };
  let ft;
  ['#f-name', '#f-from', '#f-to'].forEach(s => ($(s).oninput = () => { clearTimeout(ft); ft = setTimeout(applyFilters, 200); }));
  $('#f-search').onclick = applyFilters;
  $('#pg-prev').onclick = () => { S.filter.page--; renderTargets(); };
  $('#pg-next').onclick = () => { S.filter.page++; renderTargets(); };

  $('#clicker').addEventListener('pointerdown', onCoinClick);
  setInterval(flushClicks, 900);
  addEventListener('beforeunload', flushClicks);
  addEventListener('hashchange', route);
}

function onInputChange(rerenderInv = true) {
  // с выбранным входом удобнее видеть ближайшие по цене цели
  if (!S.filter.userSorted) S.filter.desc = inputValue() <= 0;
  if (S.target && chanceFor(inputValue(), S.target) > MAX_CHANCE) S.target = null;
  S.filter.page = 0;
  renderSlots();
  renderTargets();
  renderBalanceSlider();
  if (rerenderInv) renderInventory();
}

async function sellItems(ids) {
  if (!ids.length) return;
  const sum = S.inventory.filter(r => ids.includes(r.id)).reduce((s, r) => s + itemOf(r).p, 0);
  try {
    await backend.sell(ids);
    toast(`Sold for ${money(sum)}`, 'ok');
    beep(1500, 0.08, 'triangle', 0.05);
  } catch (e) { toast(e.message, 'err'); }
  ids.forEach(id => S.selInv.delete(id));
  if (!S.filter.userSorted) S.filter.desc = inputValue() <= 0;
  await refreshUser();
}

// ───────────────────────── Каталог ─────────────────────────
const PRICES_STALE = 15 * 60e3;
let baseCatalog = [];

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

function setCatalog(items) {
  S.catalog = items.sort((a, b) => b.p - a.p);
  S.byId = new Map(S.catalog.map(it => [it.id, it]));
  S.ghost ??= S.catalog.find(it => it.w === 'AK-47' && !it.st && it.q === 'FT') || S.catalog.find(it => it.w === 'AK-47');
}

// В Supabase-режиме показываем только скины с ценой в базе — по ней сервер считает шанс
async function applyRemotePrices() {
  const { updated_at, prices } = await backend.prices();
  const priced = baseCatalog.filter(it => prices[it.id]).map(it => ({ ...it, p: Number(prices[it.id]) }));
  if (priced.length) setCatalog(priced);
  return updated_at;
}

async function loadCatalog() {
  let data;
  // локальный сервер отдаёт свежие цены; на статическом хостинге берём снимок из catalog.json
  if (backend.mode === 'local') data = await fetchJSON('api/catalog').catch(() => null);
  data ??= await fetchJSON('catalog.json');
  S.imgPrefix = data.imgPrefix;
  baseCatalog = data.items;
  setCatalog([...baseCatalog]);
  if (backend.mode !== 'remote') return;

  let updatedAt = null;
  try { updatedAt = await applyRemotePrices(); } catch (e) { console.warn('prices', e); }
  if (!updatedAt || Date.now() - Date.parse(updatedAt) > PRICES_STALE) {
    backend.syncPrices()
      .then(async r => { if (r?.updated) { await applyRemotePrices(); renderAll(); } })
      .catch(e => console.warn('sync-prices', e));
  }
}

// ───────────────────────── Старт ─────────────────────────
async function main() {
  const fxReady = loadFx();
  setPointer(180);
  renderQuick();
  renderToolIcons();
  $('#tgt-grid').innerHTML = '<div class="loading" style="position:relative;grid-column:1/-1;height:300px"><div><div class="spinner"></div>Loading skins and prices…</div></div>';

  // ?local — принудительно локальный режим (удобно для разработки без своей базы)
  const forceLocal = new URLSearchParams(location.search).has('local');
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !forceLocal) {
    try {
      backend = new SupabaseBackend();
      await backend.init();
    } catch (e) {
      console.error(e);
      toast('Supabase is unavailable — switched to local mode', 'err');
      backend = new LocalBackend();
    }
  } else {
    backend = new LocalBackend();
  }

  bind();
  route();
  try {
    await Promise.all([loadCatalog(), fxReady]);
    $('#rw-rate').textContent = '+' + money(CLICK_VALUE);
  } catch (e) {
    $('#tgt-grid').innerHTML = `<div class="loading" style="position:relative;grid-column:1/-1;height:300px">Could not load skins: ${esc(e.message)}</div>`;
    return;
  }
  startFeed();
  await refreshUser();
  refreshStats();
  setInterval(refreshStats, 30000);

  backend.onOnline(n => { S.online = n; renderStats(); });
  backend.onUpgrade(row => {
    if (row.won && row.username !== S.user?.username) addFeedCard(S.byId.get(row.item_id), row.username, true);
    S.stats.upgrades++;
    renderStats();
  });
  backend.onAuthChange(() => refreshUser());
  renderStats();
}

main();
