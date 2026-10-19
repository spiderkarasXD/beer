'use strict';
/* =========================================================
   CaseBeer — логика: кейсы, апгрейд, батлы, контракты, лента
   Всё на виртуальных рублях, хранится в localStorage.
   ========================================================= */
(() => {
  /* ---------------- утилиты ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rand = () => {
    if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
    return Math.random();
  };
  const randInt = (n) => Math.floor(rand() * n);
  const pick = (arr) => arr[randInt(arr.length)];
  const rub = (v) => Math.round(v).toLocaleString(L10N.locale) + ' ₽';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let uidSeq = Date.now();
  const uid = () => (uidSeq++).toString(36);
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
  const dhm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 1440)}${lng('д', 'd')}:${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}${lng('м', 'm')}`; };

  const store = {
    get(k, d) { try { const v = localStorage.getItem('cb2:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cb2:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  /* ---------------- состояние ---------------- */
  const S = Object.assign({
    balance: 1000,
    inv: [],              // [{ u: uid, id: skinId }]
    nick: lng('Игрок', 'Player') + (1000 + randInt(9000)),
    freeAt: 0,
    bonusAt: 0,
    promos: [],
    cashback: 0,          // накопленный кешбек с неудачных апгрейдов
    fast: false,
    st: { opened: 0, spent: 0, best: 0, bestId: null, upg: 0, upgWin: 0, battles: 0, battleWin: 0, contracts: 0 },
  }, store.get('state', {}));
  if (!S.promos) S.promos = [];
  if (!S.cashback) S.cashback = 0;
  if (!SKIN[S.st.bestId]) S.st.bestId = null;
  S.inv = S.inv.filter((x) => SKIN[x.id]); // скины, которых больше нет в каталоге
  const NET = window.CB_NET || null;
  const invValue = () => S.inv.reduce((a, it) => a + (SKIN[it.id] ? SKIN[it.id].price : 0), 0);
  const save = () => {
    if ((S.st.peak || 0) < S.balance) S.st.peak = S.balance; // пик денег
    store.set('state', S);
    if (NET && NET.loggedIn) NET.queueSave(S, S.balance + invValue(), S.balance);
  };
  const freshState = () => ({
    balance: 1000, inv: [], freeAt: 0, bonusAt: 0, promos: [], cashback: 0, fast: S.fast,
    st: { opened: 0, spent: 0, best: 0, bestId: null, upg: 0, upgWin: 0, battles: 0, battleWin: 0, contracts: 0, peak: 1000 },
  });
  // профиль из облака → в текущее состояние
  function applyCloud(row) {
    const st = row.state || {};
    for (const k of Object.keys(S)) if (!(k in st) && k !== 'nick' && k !== 'fast') delete S[k];
    Object.assign(S, freshState(), st);
    S.inv = (S.inv || []).filter((x) => SKIN[x.id]);
    S.nick = row.nick;
    S.avatar = row.avatar_url || null;
    store.set('state', S);
  }

  function setBalance(v) {
    const old = S.balance;
    S.balance = Math.max(0, Math.round(v));
    save();
    const b = $('#balanceText');
    if (!b) return;
    b.textContent = rub(S.balance);
    b.classList.remove('up', 'down');
    if (S.balance !== old) { b.classList.add(S.balance > old ? 'up' : 'down'); setTimeout(() => b.classList.remove('up', 'down'), 600); }
  }
  const addItem = (id) => { const it = { u: uid(), id }; S.inv.unshift(it); noteBest(id); save(); return it; };
  const removeItems = (uids) => { const set = new Set(uids); S.inv = S.inv.filter((x) => !set.has(x.u)); save(); };
  function noteBest(id) { const p = SKIN[id].price; if (p > S.st.best) { S.st.best = p; S.st.bestId = id; } }

  /* ---------------- тосты / модалки ---------------- */
  function toast(msg, kind = '') {
    const t = h(`<div class="toast ${kind}">${esc(msg)}</div>`);
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }
  function modal(html, onMount) {
    const bg = h(`<div class="modal-bg"><div class="modal">${html}</div></div>`);
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    if (onMount) onMount(bg, close);
    return close;
  }

  /* ---------------- графика: спрайт оружия, раскраски, кейсы ---------------- */
  const SHAPES = {
    rifle: '<path d="M4 21 22 16 27 18 30 17H72L74 14H80L81 17H104V16H112V19L104 20H82L80 23H66L64 25H60L62 31Q63 39 58 43L52 41Q56 35 54 27L50 25H40L36 33H28L31 25H27L22 28 6 30Z"/><path d="M52 25H62L62 31Q63 39 58 43L52 41Q56 35 54 27Z" fill="rgba(0,0,0,.28)"/><path d="M66 18H100V19H66Z" fill="rgba(255,255,255,.35)"/>',
    sniper: '<path d="M2 23 10 19H24L28 21H70V19H117V22L70 23 62 25 60 33H54V26H40L36 34H28L32 26 24 27 10 31H2Z"/><path d="M36 12H66L69 14V17H34V14Z" fill="rgba(0,0,0,.35)"/><path d="M44 17 46 21H58L60 17Z" fill="rgba(0,0,0,.35)"/><path d="M70 20H114V21H70Z" fill="rgba(255,255,255,.35)"/>',
    pistol: '<path d="M18 13H92L95 15V21H60L58 23H54L55 26 51 29 47 27 44 41H28L33 25 22 23 18 19Z"/><path d="M28 41 33 25H44L47 27 44 41Z" fill="rgba(0,0,0,.3)"/><path d="M22 15H90V16H22Z" fill="rgba(255,255,255,.35)"/>',
    smg: '<path d="M6 19 24 16 28 18H82L84 19H100V22L82 23H68L66 38H58V25H44L40 33H32L35 25H24L8 28Z"/><path d="M58 25H68L66 38H58Z" fill="rgba(0,0,0,.3)"/><path d="M30 19H80V20H30Z" fill="rgba(255,255,255,.35)"/>',
    shotgun: '<path d="M2 22 22 17 32 19H110V23L72 24V28H50L48 25H38L32 33H22L27 26 4 29Z"/><path d="M50 24H72V28H50Z" fill="rgba(0,0,0,.3)"/><path d="M34 20H108V21H34Z" fill="rgba(255,255,255,.35)"/>',
    knife: '<path fill-rule="evenodd" d="M8 28Q3 24 8 19 13 15 18 19H40L44 16H48V19L82 17Q106 13 116 23 102 28 84 28H48V31H44L40 28H20Q14 32 8 28ZM10.5 23.5A3 3 0 1 0 16.5 23.5 3 3 0 1 0 10.5 23.5Z"/><path d="M18 19H40L42 28H20Q14 32 8 28Z" fill="rgba(0,0,0,.3)"/><path d="M50 21Q90 15 112 22" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>',
    gloves: '<path d="M30 42V22Q30 16 34 16V10Q36 6 39 10V16L41 8Q43 5 45 8V16L47 9Q49 6 51 9V17L54 12Q57 10 58 14L55 29 51 42Z"/><path d="M60 42V24Q60 18 64 18V12Q66 8 69 12V18L71 10Q73 7 75 10V18L77 11Q79 8 81 11V19L84 14Q87 12 88 16L85 31 81 42Z"/><path d="M30 36H51V42H30ZM60 36H81V42H60Z" fill="rgba(0,0,0,.35)"/>',
  };
  const ICON = {
    cases: '<path fill="currentColor" d="M3 7l9-4 9 4v10l-9 4-9-4zm9 2.2L6.6 7 12 4.6 17.4 7zM5 8.6v7.1l6 2.7v-7.2zm8 9.8 6-2.7V8.6l-6 2.6z"/>',
    upgrade: '<path fill="currentColor" d="M12 3 4 11h4.5L12 7.5 15.5 11H20zm0 7-8 8h4.5l3.5-3.5 3.5 3.5H20z"/>',
    battles: '<path fill="currentColor" d="M6.9 2 2 6.9l4 4L3.7 13l1.4 1.4 2.1-2.1 2.4 2.4-2.1 2.1 1.4 1.4 2.3-2.2 5 5 2.8-2.8-5-5 2.2-2.3-1.4-1.4-2.1 2.1-2.4-2.4 2.1-2.1L10.9 6zm10.2 0L13 6l1.4 1.4L17 4.8l2.2 2.2-2.6 2.6L18 11l4-4.1z"/>',
    contracts: '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5zM8 12h8v2H8zm0 4h8v2H8z"/>',
    profile: '<path fill="currentColor" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5m0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5"/>',
    people: '<path fill="currentColor" d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3m-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3m0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13m8 0h-1a4.6 4.6 0 0 1 2 3.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5"/>',
    wallet: '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11v3"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M20 11h-4a2 2 0 0 0 0 4h4z"/>',
    bolt: '<path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    sort: '<path fill="currentColor" d="M3 6h10v2H3zm0 5h7v2H3zm0 5h4v2H3zm14-10v10.2l2.6-2.6L21 15l-5 5-5-5 1.4-1.4 2.6 2.6V6z"/>',
    search: '<path fill="currentColor" d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3m0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10"/>',
    trophy: '<path fill="currentColor" d="M7 3h10v2h4v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 7.4 12H7a4 4 0 0 1-4-4V5h4zm0 4H5v1a2 2 0 0 0 2 2zm10 0v3a2 2 0 0 0 2-2V7z"/>',
    box: '<path fill="currentColor" d="M4 4h16v4H4zm1 5h14v11H5zm4 2v2h6v-2z"/>',
  };
  const icon = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const CHEV_UP = '<svg class="chev" viewBox="0 0 70 100"><path d="M35 0 70 26V44L35 18 0 44V26Z" fill="currentColor"/><path d="M35 28 70 54V72L35 46 0 72V54Z" fill="currentColor" opacity=".7"/><path d="M35 56 70 82V100L35 74 0 100V82Z" fill="currentColor" opacity=".4"/></svg>';
  const CHEV_DOWN = '<svg class="chev" viewBox="0 0 70 100"><path d="M35 100 70 74V56L35 82 0 56V74Z" fill="currentColor"/><path d="M35 72 70 46V28L35 54 0 28V46Z" fill="currentColor" opacity=".7"/><path d="M35 44 70 18V0L35 26 0 0V18Z" fill="currentColor" opacity=".4"/></svg>';

  const RCOL = { consumer: '#b0c3d9', industrial: '#5e98d9', milspec: '#4b69ff', restricted: '#8847ff', classified: '#d32ce6', covert: '#eb4b4b', gold: '#e4ae39' };
  function buildSprite() {
    const shade = (hex, k) => {
      const n = parseInt(hex.slice(1), 16);
      const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
      return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('');
    };
    const defs = [
      ...Object.entries(SHAPES).map(([k, p]) => `<symbol id="w-${k}" viewBox="0 0 120 48">${p}</symbol>`),
      ...Object.entries(RCOL).map(([k, c]) => `<linearGradient id="sk-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 1.25)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 0.5)}"/></linearGradient>`),
      ...CASES.map((c) => `<linearGradient id="cg-${c.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c.color, 1.08)}"/><stop offset=".6" stop-color="${shade(c.color, 0.7)}"/><stop offset="1" stop-color="${shade(c.color, 0.35)}"/></linearGradient>
         <linearGradient id="cl-${c.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c.color, 0.55)}"/><stop offset="1" stop-color="${shade(c.color, 0.3)}"/></linearGradient>
         <radialGradient id="cr-${c.id}"><stop offset="0" stop-color="${c.color}" stop-opacity=".55"/><stop offset="1" stop-color="${c.color}" stop-opacity="0"/></radialGradient>`),
      '<pattern id="pt-stripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4" height="10" fill="rgba(255,255,255,.09)"/></pattern>',
      '<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6e9f2"/><stop offset="1" stop-color="#7d8396"/></linearGradient>',
      '<linearGradient id="gauge-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff5a00"/></linearGradient>',
    ];
    document.body.insertAdjacentHTML('afterbegin', `<svg class="sprite" aria-hidden="true"><defs>${defs.join('')}</defs></svg>`);
  }

  const STEAM = 'https://community.akamai.steamstatic.com/economy/image/';
  const imgUrl = (id, size = '256fx256f') => (SKIN[id] && SKIN[id].img ? STEAM + SKIN[id].img + '/' + size : '');
  // Картинка скина со Steam; при ошибке загрузки остаётся нарисованный силуэт
  const pic = (id, lazy) => {
    const url = imgUrl(id);
    const sil = gunSvg(id, 'gun sil');
    if (!url) return sil;
    return `<img class="gun pic" src="${url}" alt="" draggable="false" ${lazy ? 'loading="lazy"' : ''} onerror="this.parentNode.classList.add('noimg');this.remove()">${sil}`;
  };

  const gunSvg = (id, cls = 'gun') => {
    const s = SKIN[id];
    return `<svg class="${cls}" viewBox="0 0 120 48" aria-hidden="true"><use width="120" height="48" href="#w-${s.type}" fill="url(#sk-${s.rarity})" stroke="#0a0c14" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
  };

  // Кейс: ящик + торчащий из него самый дорогой скин
  function caseArt(c, cls = 'art') {
    if (c.img) return `<img class="${cls} case-img" src="${STEAM + c.img}/360fx360f" alt="" loading="lazy" draggable="false" onerror="this.outerHTML=this.dataset.fb" data-fb="${esc(crateSvg(c, cls))}">`;
    return crateSvg(c, cls);
  }
  function crateSvg(c, cls) {
    const hero = SKIN[c.hero];
    return `<svg class="${cls}" viewBox="0 0 200 150" aria-hidden="true">
      <ellipse cx="100" cy="80" rx="96" ry="62" fill="url(#cr-${c.id})"/>
      <g style="display:none" transform="translate(100 44) rotate(-14) scale(1.3) translate(-60 -24)"><use width="120" height="48" href="#w-${hero.type}" fill="url(#sk-${hero.rarity})" stroke="#0a0c14" stroke-width="1.1" stroke-linejoin="round"/></g>
      <image href="${imgUrl(hero.id, '360fx360f')}" x="22" y="-14" width="156" height="117" transform="rotate(-10 100 44)" preserveAspectRatio="xMidYMid meet" onerror="this.previousElementSibling.style.display='';this.remove()"/>
      <path d="M26 70H174L168 62H32Z" fill="url(#cl-${c.id})"/>
      <rect x="18" y="68" width="164" height="18" rx="4" fill="url(#cl-${c.id})" stroke="rgba(0,0,0,.4)"/>
      <rect x="22" y="84" width="156" height="56" rx="5" fill="url(#cg-${c.id})" stroke="rgba(0,0,0,.45)"/>
      <rect x="22" y="84" width="156" height="56" rx="5" fill="url(#pt-stripes)"/>
      <rect x="22" y="84" width="156" height="4" fill="rgba(255,255,255,.25)"/>
      <path d="M22 96H178M22 128H178" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
      <rect x="16" y="66" width="16" height="22" rx="3" fill="url(#metal)"/><rect x="168" y="66" width="16" height="22" rx="3" fill="url(#metal)"/>
      <rect x="16" y="124" width="16" height="18" rx="3" fill="url(#metal)"/><rect x="168" y="124" width="16" height="18" rx="3" fill="url(#metal)"/>
      <rect x="54" y="80" width="18" height="16" rx="2" fill="url(#metal)"/><rect x="128" y="80" width="18" height="16" rx="2" fill="url(#metal)"/>
      <rect x="58" y="88" width="10" height="4" fill="#3a3f52"/><rect x="132" y="88" width="10" height="4" fill="#3a3f52"/>
      <rect x="74" y="104" width="52" height="18" rx="3" fill="rgba(0,0,0,.35)"/>
      <text x="100" y="117" text-anchor="middle" font-family="Oswald, sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,.85)" letter-spacing="1">CASEBEER</text>
    </svg>`;
  }

  /* ---------------- шансы кейсов ----------------
     Считаются заранее генератором cb/tools/build-catalog.mjs (поле ch):
     средний возврат ~105%, кейс окупается примерно в каждом третьем открытии. */
  function calibrate(c) {
    c.chances = c.items.map((id, i) => ({ id, p: c.ch[i] }));
    c.hero = c.items.slice().sort((x, y) => SKIN[y].price - SKIN[x].price)[0];
  }
  CASES.forEach(calibrate);
  const CASE_EN = { free: 'Free', beer: 'Beer Starter', pistol: 'Pistol', milspec: 'Mil-Spec', covert: 'Covert', knife: 'Knife', gloves: 'Gloves', high: 'High Roller', dlore: 'Dragon', 'r-bomzh': 'Hobo', 'r-army': 'Army Depot', 'r-pink': 'Pink', 'r-red': 'Red', 'r-gold': 'Only ★' };
  if (L10N.en) CASES.forEach((c) => { if (CASE_EN[c.id]) c.name = CASE_EN[c.id]; });
  const CASE = Object.fromEntries(CASES.map((c) => [c.id, c]));
  const PAID = CASES.filter((c) => !c.free);
  const LIMITED = ['dlore', 'high', 'gloves', 'knife'];
  const NEWC = ['beer', 'ak', 'awp'];
  const limitedEnd = (i) => { const week = 7 * 864e5; const base = Math.floor(Date.now() / week) * week; return base + week + i * 864e5 * 0.37 + 3600e3 * 5; };

  function roll(c, rng = rand) {
    let r = rng();
    for (const ch of c.chances) { r -= ch.p; if (r < 0) return ch.id; }
    return c.chances[c.chances.length - 1].id;
  }

  /* ---------------- карточка предмета ---------------- */
  function itemHtml(id, extra = '', attrs = '', chance = null, lazy = false) {
    const s = SKIN[id];
    return `<div class="item ${extra}" style="--rc:${RARITY[s.rarity].color}" ${attrs}>
      ${chance != null ? `<span class="ch">${(chance * 100).toFixed(chance < 0.01 ? 3 : 2)}%</span>` : ''}
      <span class="p">${rub(s.price)}</span>
      ${pic(id, lazy)}
      <div class="w">${esc(s.weapon)}</div>
      <div class="s">${esc(s.skin)}</div>
    </div>`;
  }

  /* ---------------- лента последних дропов (слева) ---------------- */
  const KNIVES = SKINS.filter((s) => s.type === 'knife').map((s) => s.id);
  const FEED = [];
  let feedTab = 'all';
  // Дропы ботов одинаковые у всех: каждый «тик» времени (0,9 с) задаёт свой seed,
  // поэтому все игроки в один момент видят одну и ту же ленту.
  const TICK = 900;
  function seeded(n) {
    let a = (n ^ 0x9e3779b9) >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pickR = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  function botDropAt(tick) {
    const rng = seeded(tick);
    if (rng() > 0.36) return null; // в среднем один дроп в ~2,5 с
    const user = pickR(USERS, rng);
    if (user === 'lafore') return { user, id: pickR(KNIVES, rng), caseId: 'knife', tick };
    const c = pickWeightedCase(rng);
    return { user, id: roll(c, rng), caseId: c.id, tick };
  }
  function pickWeightedCase(rng = rand) {
    const ws = PAID.map((c) => 1 / Math.sqrt(c.price + 30));
    let r = rng() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < PAID.length; i++) { r -= ws[i]; if (r < 0) return PAID[i]; }
    return PAID[0];
  }
  const showInFeed = (d) => feedTab === 'all' || SKIN[d.id].price >= 1000;
  function dropHtml(d) {
    const s = SKIN[d.id];
    return `<a class="drop ${d.mine ? 'mine' : ''} ${d.real ? 'real' : ''}" href="#/case/${d.caseId}" style="--rc:${RARITY[s.rarity].color}">${d.real ? '<span class="live-tag">LIVE</span>' : ''}
      ${pic(d.id)}
      <div class="dn">${esc(s.weapon)}<b>${esc(s.skin)}</b></div>
      <div class="who"><span>${esc(CASE[d.caseId] ? CASE[d.caseId].name : '')}</span><b>${esc(d.user)}</b><span>${rub(s.price)}</span></div>
    </a>`;
  }
  function pushDrop(d) {
    FEED.unshift(d);
    if (FEED.length > 80) FEED.pop();
    if (!showInFeed(d)) return;
    const box = $('#drops');
    box.insertAdjacentHTML('afterbegin', dropHtml(d));
    while (box.children.length > 24) box.lastChild.remove();
  }
  function renderFeed() {
    $('#drops').innerHTML = FEED.filter(showInFeed).slice(0, 24).map(dropHtml).join('');
    $$('.side-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === feedTab));
  }
  const myDrop = (id, caseId) => {
    pushDrop({ user: S.nick, id, caseId, mine: true });
    if (NET && NET.loggedIn) NET.postDrop(S.nick, id, caseId);
  };
  // реальные дропы игроков из базы: подтягиваем каждые 8 секунд
  let lastDropId = 0;
  async function pollRealDrops(first) {
    if (!NET) return;
    try {
      const rows = await NET.recentDrops(lastDropId, first ? 10 : 30);
      if (!rows || !rows.length) return;
      lastDropId = Math.max(lastDropId, ...rows.map((r) => r.id));
      rows.reverse().forEach((r) => {
        if (!SKIN[r.skin_id] || r.user_id === NET.uid) return; // свои уже показаны
        pushDrop({ user: r.nick, id: r.skin_id, caseId: r.case_id, real: true });
      });
    } catch (e) { /* нет сети — живём на ботах */ }
  }
  function startFeed() {
    const nowTick = () => Math.floor(Date.now() / TICK);
    let lastTick = nowTick();
    // история за последние ~4 минуты — тоже общая для всех
    for (let t = lastTick - 260; t <= lastTick; t++) { const d = botDropAt(t); if (d) FEED.unshift(d); }
    FEED.splice(80);
    renderFeed();
    $$('.side-tabs button').forEach((b) => (b.onclick = () => { feedTab = b.dataset.t; renderFeed(); }));
    setInterval(() => {
      const t = nowTick();
      for (let k = lastTick + 1; k <= t; k++) { const d = botDropAt(k); if (d) pushDrop(d); }
      lastTick = t;
    }, 300);
    pollRealDrops(true);
    setInterval(() => pollRealDrops(false), 3000);
    // онлайн тоже общий: плавная функция от времени
    const upd = () => {
      const m = Math.floor(Date.now() / 3500) * 3500 / 60000; // меняется ступенькой раз в 3,5 с — у всех одно число
      const online = Math.round(6400 + 600 * Math.sin(m / 37) + 180 * Math.sin(m / 5.3) + 40 * Math.sin(m * 1.7));
      const t = online.toLocaleString(L10N.locale);
      $('#onlineSide').textContent = t; $('#onlineHead').textContent = t;
    };
    upd(); setInterval(upd, 3500);
  }

  /* ---------------- горизонтальная лента открытия ---------------- */
  function spinReel(reel, c, winId, fast) {
    const N = 56, WIN = 48;
    const ids = Array.from({ length: N }, (_, i) => (i === WIN ? winId : roll(c)));
    reel.innerHTML = `<div class="marker"></div><div class="strip">${ids.map((id) => itemHtml(id)).join('')}</div>`;
    const strip = $('.strip', reel);
    const card = strip.children[0];
    const cw = card.offsetWidth + 6;
    const off = (rand() - 0.5) * card.offsetWidth * 0.8;
    const x = -(WIN * cw + card.offsetWidth / 2 + off) + reel.clientWidth / 2;
    strip.style.transform = 'translateX(0)';
    strip.offsetHeight;
    const dur = fast ? 1.3 : 6.2;
    strip.style.transition = `transform ${dur}s cubic-bezier(.08,.72,.1,1)`;
    strip.style.transform = `translateX(${x}px)`;
    return sleep(dur * 1000 + 120).then(() => { strip.children[WIN].classList.add('win'); });
  }
  function idleReel(reel, c) {
    const ids = Array.from({ length: 14 }, () => roll(c));
    reel.innerHTML = `<div class="marker"></div><div class="strip">${ids.map((id) => itemHtml(id)).join('')}</div>`;
    const strip = $('.strip', reel);
    const cw = strip.children[0].offsetWidth + 6;
    strip.style.transform = `translateX(${-(6 * cw + strip.children[0].offsetWidth / 2) + reel.clientWidth / 2}px)`;
  }

  /* ---------------- вертикальная лента (батлы) ---------------- */
  function spinVReel(reel, c, winId, fast) {
    const N = 40, WIN = 34;
    const ids = Array.from({ length: N }, (_, i) => (i === WIN ? winId : roll(c)));
    reel.innerHTML = `<div class="hmark"></div><div class="vstrip">${ids.map((id) => itemHtml(id)).join('')}</div>`;
    const strip = $('.vstrip', reel);
    const card = strip.children[0];
    const ch = card.offsetHeight + 6;
    const off = (rand() - 0.5) * card.offsetHeight * 0.7;
    const y = -(WIN * ch + card.offsetHeight / 2 + off) + reel.clientHeight / 2;
    strip.style.transform = 'translateY(0)';
    strip.offsetHeight;
    const dur = fast ? 1.4 : 4.6;
    strip.style.transition = `transform ${dur}s cubic-bezier(.1,.75,.12,1)`;
    strip.style.transform = `translateY(${y}px)`;
    return sleep(dur * 1000 + 100);
  }

  /* =====================================================
     СТРАНИЦЫ
     ===================================================== */
  let cleanup = [];
  const onLeave = (fn) => cleanup.push(fn);

  // ---------- главная ----------
  const GROUPS = [
    ['all', lng('Все', 'All')], ['hits', lng('Хиты', 'Hits')], ['cs2', lng('Кейсы CS2', 'CS2 cases')], ['weapons', lng('Оружие', 'Weapons')], ['knives', lng('Ножи', 'Knives')], ['gloves', lng('Перчатки', 'Gloves')], ['rarity', lng('По редкости', 'By rarity')],
  ];
  const GROUP_TITLE = lng(
    { free: 'Бесплатно', hits: 'Хиты CaseBeer', cs2: 'Оружейные кейсы CS2', weapons: 'Кейсы по оружию', knives: 'Ножевые кейсы', gloves: 'Перчатки', rarity: 'По редкости' },
    { free: 'Free', hits: 'CaseBeer hits', cs2: 'CS2 weapon cases', weapons: 'Cases by weapon', knives: 'Knife cases', gloves: 'Gloves', rarity: 'By rarity' });
  function caseCard(c) {
    return `<a class="ccard ${c.price > S.balance ? 'locked' : ''}" href="#/case/${c.id}" style="--cc:${c.color}">
      <div class="head"><div class="nm">${esc(c.name)}</div><div class="sub">${c.items.length} ${lng('предметов', 'items')} ${NEWC.includes(c.id) ? '<span class="badge-new">NEW</span>' : ''}</div></div>
      ${caseArt(c)}
      <div class="price-box">${c.free ? lng('Бесплатно', 'Free') : rub(c.price)}</div>
    </a>`;
  }
  function pageHome(el) {
    let q = '', onlyAff = store.get('onlyAff', false), grp = store.get('grp', 'all');
    el.innerHTML = `
      <section class="promo">
        <div class="voucher" id="vchr"><div class="vt">%</div><div class="vb"><b>+20%</b><span>${lng('к балансу', 'to balance')}</span></div></div>
        <div class="countdown-box"><div class="cl">${lng('До бесплатного<br>кейса:', 'Free case<br>in:')}</div><div class="ct" id="freeT">00:00:00</div></div>
        <div class="promo-code"><div class="pl">${lng('Используй <b>промокод:</b>', 'Use the <b>promo code:</b>')}</div><button id="promoBtn">BEER-20</button></div>
      </section>
      <div class="filter-bar">
        <label class="row" style="gap:10px">${lng('Быстрый фильтр:', 'Quick filter:')} <input class="search" id="q" placeholder="${lng('Что ищем?', 'Looking for?')}"></label>
        <span class="toggle ${onlyAff ? 'on' : ''}" id="aff"><i></i>${lng('Только по карману', 'Only affordable')}</span>
      </div>
      <div class="grp-tabs" id="grpTabs">${GROUPS.map(([k, n]) => `<button class="chip" data-g="${k}">${n}</button>`).join('')}</div>
      <div id="limWrap"><div class="title-glow"><span></span>Limited</div><div class="lim-grid" id="limGrid"></div></div>
      <div id="sections"></div>`;

    function renderCases() {
      $$('#grpTabs .chip', el).forEach((b) => b.classList.toggle('on', b.dataset.g === grp));
      const match = (c) => (!q || c.name.toLowerCase().includes(q)) && (c.free || !onlyAff || c.price <= S.balance);
      const showLim = (grp === 'all' || grp === 'hits');
      $('#limWrap', el).hidden = !showLim;
      if (showLim) {
        $('#limGrid', el).innerHTML = LIMITED.map((id) => CASE[id]).filter(match).map((c, i) => `
          <a class="lcard" href="#/case/${c.id}" style="--cc:${c.color}">
            <div class="top"><span class="tag">LIMITED</span><span class="tm" data-end="${limitedEnd(i)}">⏱ ${dhm(limitedEnd(i) - Date.now())}</span>${caseArt(c)}</div>
            <div class="bot"><b>${esc(c.name)}</b><span>${rub(c.price)}</span></div>
          </a>`).join('') || `<div class="muted">${lng('Ничего не найдено', 'Nothing found')}</div>`;
      }
      const order = ['free', 'hits', 'cs2', 'weapons', 'knives', 'gloves', 'rarity'];
      const groups = grp === 'all' ? order : grp === 'hits' ? ['free', 'hits'] : [grp];
      const html = groups.map((g) => {
        const list = CASES.filter((c) => c.group === g && !LIMITED.includes(c.id) && match(c));
        if (!list.length) return '';
        return `<div class="title-glow"><span></span>${GROUP_TITLE[g]} <small class="muted">· ${list.length}</small></div><div class="case-grid">${list.map(caseCard).join('')}</div>`;
      }).join('');
      $('#sections', el).innerHTML = html || `<div class="muted" style="text-align:center;padding:40px">${lng('Ничего не найдено', 'Nothing found')}</div>`;
    }
    $('#q', el).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); renderCases(); });
    $('#aff', el).onclick = (e) => { onlyAff = !onlyAff; store.set('onlyAff', onlyAff); e.currentTarget.classList.toggle('on', onlyAff); renderCases(); };
    $('#grpTabs', el).addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; grp = b.dataset.g; store.set('grp', grp); renderCases(); });
    $('#vchr', el).onclick = openTopUp;
    $('#promoBtn', el).onclick = () => applyPromo('BEER-20');

    const tick = () => {
      const left = S.freeAt - Date.now();
      $('#freeT', el).textContent = left > 0 ? clock(left) : '00:00:00';
      $$('[data-end]', el).forEach((t) => { t.textContent = '⏱ ' + dhm(+t.dataset.end - Date.now()); });
    };
    const t = setInterval(tick, 1000); tick();
    onLeave(() => clearInterval(t));
    renderCases();
  }
  // ---------- кейс ----------
  function pageCase(el, id) {
    const c = CASE[id];
    if (!c) { location.hash = '#/'; return; }
    let count = c.free ? 1 : store.get('count', 1);
    let busy = false;
    el.innerHTML = `
      <div class="case-hero" style="--cc:${c.color}">
        ${caseArt(c)}
        <div class="nm">${esc(c.name)}</div>
        <div class="sub">${c.free ? lng('Бесплатно раз в час', 'Free once an hour') : c.items.length + lng(' предметов · средний дроп ≈ ', ' items · average drop ≈ ') + rub(c.ev)}</div>
        <div class="row" style="justify-content:center">
          ${c.free ? '' : `<div class="seg" id="cnt">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">x${n}</button>`).join('')}</div>`}
          <button class="icon-btn" id="fastBtn" title="${lng('Быстрое открытие', 'Fast opening')}">${icon('bolt')}</button>
        </div>
      </div>
      <div class="reels" id="reels"></div>
      <div class="open-bar"><button class="btn xl" id="openBtn"></button></div>
      <div class="title-glow"><span></span>${lng('Содержимое кейса', 'Case contents')}</div>
      <div class="item-grid small">${c.chances.slice().sort((a, b) => SKIN[b.id].price - SKIN[a.id].price).map((ch) => itemHtml(ch.id, '', '', ch.p, true)).join('')}</div>`;

    const reels = $('#reels', el);
    const btn = $('#openBtn', el);
    const fastBtn = $('#fastBtn', el);
    const setFast = () => fastBtn.classList.toggle('on', S.fast);
    fastBtn.onclick = () => { S.fast = !S.fast; save(); setFast(); };
    setFast();

    function layout() {
      reels.classList.toggle('multi', count > 1);
      reels.innerHTML = Array.from({ length: count }, () => '<div class="reel"></div>').join('');
      $$('.reel', reels).forEach((r) => idleReel(r, c));
      $$('#cnt button', el).forEach((b) => b.classList.toggle('on', +b.dataset.n === count));
      updBtn();
    }
    function updBtn() {
      if (c.free) {
        const left = S.freeAt - Date.now();
        btn.disabled = busy || left > 0;
        btn.textContent = left > 0 ? lng('Через ', 'In ') + clock(left) : lng('Открыть бесплатно', 'Open for free');
      } else {
        btn.disabled = busy;
        btn.textContent = `${lng('Открыть за', 'Open for')} ${rub(c.price * count)}`;
      }
    }
    $$('#cnt button', el).forEach((b) => (b.onclick = () => { if (busy) return; count = +b.dataset.n; store.set('count', count); layout(); }));
    if (c.free) { const t = setInterval(updBtn, 1000); onLeave(() => clearInterval(t)); }

    btn.onclick = async () => {
      if (busy) return;
      const cost = c.price * count;
      if (c.free) { if (S.freeAt > Date.now()) return; S.freeAt = Date.now() + 3600e3; }
      else if (S.balance < cost) { toast(lng('Недостаточно средств — пополни баланс', 'Not enough funds — top up your balance'), 'bad'); openTopUp(); return; }
      busy = true; updBtn();
      setBalance(S.balance - cost);
      S.st.opened += count; S.st.spent += cost;
      const won = Array.from({ length: count }, () => addItem(roll(c)));
      save();
      await Promise.all($$('.reel', reels).map((r, i) => spinReel(r, c, won[i].id, S.fast)));
      won.forEach((it) => myDrop(it.id, c.id));
      busy = false; updBtn();
      showWin(won);
    };
    layout();
  }

  function showWin(items) {
    const total = items.reduce((s, it) => s + SKIN[it.id].price, 0);
    modal(`<h3>${items.length > 1 ? lng('Твой дроп', 'Your drop') : lng('Тебе выпало!', 'You got!')}</h3>
      <div class="item-grid">${items.map((it) => itemHtml(it.id)).join('')}</div>
      <div class="actions">
        <button class="btn green" data-a="sell">${lng('Продать за', 'Sell for')} ${rub(total)}</button>
        <button class="btn" data-a="upg">${lng('В апгрейд', 'To upgrade')}</button>
        <button class="btn ghost" data-a="keep">${lng('Забрать', 'Keep')}</button>
      </div>`, (bg, close) => {
      bg.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'sell') sell(items.map((x) => x.u));
        if (a.dataset.a === 'upg') { upgPreselect = items.map((x) => x.u); location.hash = '#/upgrade'; }
        close();
      });
    });
  }

  function sell(uids) {
    const set = new Set(uids);
    const items = S.inv.filter((x) => set.has(x.u));
    const sum = items.reduce((s, it) => s + SKIN[it.id].price, 0);
    removeItems(uids);
    setBalance(S.balance + sum);
    if (items.length) toast(lng(`Продано ${items.length} шт. за ${rub(sum)}`, `Sold ${items.length} for ${rub(sum)}`), 'good');
    return sum;
  }

  // ---------- апгрейд ----------
  let upgPreselect = null;
  const CASHBACK = 0.1; // 10% от проигранной ставки возвращается кешбеком
  const MAX_CHANCE = 0.9, HOUSE = 1; // шанс = ставка / цена цели, без комиссии, максимум 90%
  function pageUpgrade(el) {
    const sel = new Set((upgPreselect || []).filter((u) => S.inv.some((x) => x.u === u)));
    upgPreselect = null;
    let addBal = 0, target = null, busy = false, rot = 0, q = '', from = 0, to = 0, invDesc = true, limit = 120;
    const ticks = Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2, big = i % 9 === 0;
      const r1 = big ? 146 : 150, r2 = 158;
      return `<line x1="${165 + r1 * Math.sin(a)}" y1="${165 - r1 * Math.cos(a)}" x2="${165 + r2 * Math.sin(a)}" y2="${165 - r2 * Math.cos(a)}" stroke="${big ? '#5b6280' : '#3a4058'}" stroke-width="${big ? 2.4 : 1.4}"/>`;
    }).join('');
    el.innerHTML = `
      <div class="h1">${icon('upgrade')}${lng('Апгрейд', 'Upgrade')}</div>
      <div class="upg-tools"><button class="icon-btn" id="fastBtn" title="${lng('Быстро', 'Fast')}">${icon('bolt')}</button><span class="spacer"></span>
        <div class="cashback" id="cbBox"><span class="cb-ico">↺</span><span>${lng('Кешбек', 'Cashback')} <b>${Math.round(CASHBACK * 100)}%</b> ${lng('с неудачных апгрейдов', 'on failed upgrades')}</span><b class="cb-sum" id="cbSum"></b><button class="btn green sm" id="cbClaim">${lng('Забрать', 'Claim')}</button></div></div>
      <div class="upg-top">
        <div class="upg-box"><div class="bh">${lng('Выберите предметы и/или баланс для использования<small>Можно выбрать несколько предметов</small>', 'Pick items and/or balance to use<small>You can pick several items</small>')}</div><div class="bb" id="srcBox"></div></div>
        <div class="gauge" id="gauge">
          <svg class="dial" viewBox="0 0 330 330">
            ${ticks}
            <circle cx="165" cy="165" r="132" fill="none" stroke="#262b3d" stroke-width="22"/>
            <path id="arc" fill="none" stroke="url(#gauge-g)" stroke-width="22"/>
            <circle cx="165" cy="165" r="114" fill="#141725" stroke="#2b3044" stroke-width="2"/>
            <circle cx="165" cy="165" r="96" fill="none" stroke="#1d2131" stroke-width="10"/>
          </svg>
          <svg class="needle" id="needle" viewBox="0 0 330 330"><path d="M165 270 175 300H155Z" fill="#ffc700" stroke="#141725" stroke-width="2"/><path d="M165 296V318" stroke="#ff7a00" stroke-width="3"/></svg>
          <div class="core"><svg viewBox="0 0 70 100"><path d="M35 0 70 26V48L35 22 0 48V26Z" fill="currentColor"/><path d="M35 36 70 62V84L35 58 0 84V62Z" fill="currentColor" opacity=".55"/></svg><b id="chance">0.00%</b><span>${lng('шанс', 'chance')}</span></div>
        </div>
        <div class="upg-box"><div class="bh">${lng('Выберите предмет для апгрейда<small>Из списка ниже или кнопками множителей</small>', 'Pick an item to upgrade to<small>From the list below or with the multiplier buttons</small>')}</div><div class="bb" id="tgtBox"></div></div>
      </div>
      <div class="upg-under">
        <div class="bal-slider"><span class="lb">${lng('Добавить баланс', 'Add balance')}</span><div class="mid"><b id="addBalT">0 ₽</b><input type="range" id="addBal" min="0" max="${S.balance}" step="1" value="0"></div><div class="mx">${lng('Макс.', 'Max')}<b>${rub(S.balance)}</b></div></div>
        <button class="btn xl block" id="upgBtn">${icon('upgrade')} ${lng('Апгрейд', 'Upgrade')}</button>
        <div class="mults" id="mults">${['x1.5', 'x2', 'x5', 'x10', '30%', '50%', '75%', '90%'].map((m) => `<button class="chip" data-m="${m}">${m}</button>`).join('')}</div>
      </div>
      <div class="upg-bottom">
        <div class="ibox"><div class="ih"><span class="t">${icon('box')}${lng('Мои предметы', 'My items')}</span><span class="spacer"></span><button class="icon-btn" id="invSort" title="${lng('Сортировка', 'Sort')}">${icon('sort')}</button></div><div class="ib"><div class="item-grid small" id="invGrid"></div></div></div>
        <div class="ibox"><div class="ih"><span class="t">${icon('upgrade')}${lng('Выбрать предмет', 'Pick an item')}</span><span class="spacer"></span>
          <input class="search" id="pFrom" type="number" placeholder="${lng('От ₽', 'From ₽')}"><input class="search" id="pTo" type="number" placeholder="${lng('До ₽', 'To ₽')}"><input class="search wide" id="q" placeholder="${lng('Поиск', 'Search')}"></div>
          <div class="ib"><div class="item-grid small" id="tgtGrid"></div></div></div>
      </div>`;

    const fastBtn = $('#fastBtn', el);
    const setFast = () => fastBtn.classList.toggle('on', S.fast);
    fastBtn.onclick = () => { S.fast = !S.fast; save(); setFast(); };
    setFast();

    const stake = () => [...sel].reduce((s, u) => { const it = S.inv.find((x) => x.u === u); return s + (it ? SKIN[it.id].price : 0); }, 0) + addBal;
    const chance = () => (target ? Math.min(MAX_CHANCE, (stake() / SKIN[target].price) * HOUSE) : 0);

    // дуга шанса — симметрично вокруг низа круга (там стоит стрелка)
    function drawArc(p) {
      const arc = $('#arc', el);
      if (p <= 0) { arc.setAttribute('d', ''); return; }
      const r = 132, cx = 165, cy = 165;
      const half = Math.min(p, 0.9999) * Math.PI;
      const a1 = Math.PI - half, a2 = Math.PI + half;
      const pt = (a) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
      arc.setAttribute('d', `M ${pt(a1)} A ${r} ${r} 0 ${half * 2 > Math.PI ? 1 : 0} 1 ${pt(a2)}`);
    }

    function render() {
      let inv = S.inv.slice();
      inv.sort((a, b) => (invDesc ? -1 : 1) * (SKIN[a.id].price - SKIN[b.id].price));
      $('#invGrid', el).innerHTML = inv.length
        ? inv.map((it) => itemHtml(it.id, 'click' + (sel.has(it.u) ? ' sel' : ''), `data-u="${it.u}"`)).join('')
        : `<div class="empty-inv" style="grid-column:1/-1"><b>${lng('Ваш инвентарь пуст', 'Your inventory is empty')}</b><span>${lng('Открой свой первый кейс', 'Open your first case')}</span><a class="btn green" href="#/">${icon('box')} ${lng('Открыть кейс', 'Open a case')}</a></div>`;
      const chosen = S.inv.filter((x) => sel.has(x.u));
      const ghost = '<svg class="ghost-gun" viewBox="0 0 120 48"><use width="120" height="48" href="#w-rifle" fill="currentColor"/></svg>';
      $('#srcBox', el).innerHTML = chosen.length
        ? (chosen.length === 1 ? itemHtml(chosen[0].id) : `<div class="stack">${chosen.map((x) => itemHtml(x.id)).join('')}</div>`)
        : (addBal ? `${ghost}<div class="bal-only">${rub(addBal)}<small>${lng('с баланса', 'from balance')}</small></div>` : `${ghost}${CHEV_DOWN}`);
      const st = stake();
      if (target && SKIN[target].price <= st) target = null;
      $('#tgtBox', el).innerHTML = target ? itemHtml(target) : `${ghost}${CHEV_UP}`;
      const list = SKINS.filter((s) => s.price > st && (!from || s.price >= from) && (!to || s.price <= to) && (!q || (s.weapon + ' ' + s.skin).toLowerCase().includes(q))).sort((a, b) => a.price - b.price);
      $('#tgtGrid', el).innerHTML = (list.slice(0, limit).map((s) => itemHtml(s.id, 'click' + (s.id === target ? ' sel' : ''), `data-t="${s.id}"`, null, true)).join('') || `<div class="muted">${lng('Ничего не найдено', 'Nothing found')}</div>`)
        + (list.length > limit ? `<button class="btn ghost block" id="more" style="grid-column:1/-1">${lng('Показать ещё', 'Show more')} (${list.length - limit})</button>` : '');
      $('#cbSum', el).textContent = rub(S.cashback);
      $('#cbClaim', el).disabled = S.cashback < 1;
      const ch = chance();
      $('#chance', el).textContent = (ch * 100).toFixed(2) + '%';
      drawArc(ch);
      $('#upgBtn', el).disabled = busy || !target || !st;
      $('#addBalT', el).textContent = rub(addBal);
    }

    $('#invGrid', el).addEventListener('click', (e) => {
      const it = e.target.closest('[data-u]'); if (!it || busy) return;
      const u = it.dataset.u;
      if (sel.has(u)) sel.delete(u); else { if (sel.size >= 6) return toast(lng('Максимум 6 предметов', 'Up to 6 items')); sel.add(u); }
      render();
    });
    $('#tgtGrid', el).addEventListener('click', (e) => {
      if (e.target.closest('#more')) { limit += 120; render(); return; }
      const it = e.target.closest('[data-t]'); if (!it || busy) return; target = it.dataset.t; render();
    });
    $('#cbClaim', el).onclick = () => { if (S.cashback < 1) return; const v = Math.floor(S.cashback); S.cashback -= v; setBalance(S.balance + v); toast(lng(`Кешбек ${rub(v)} зачислен на баланс`, `Cashback of ${rub(v)} added to your balance`), 'good'); render(); };
    $('#mults', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b || busy) return;
      const st = stake(); if (!st) return toast(lng('Сначала выбери предметы или добавь баланс', 'Pick items or add balance first'));
      const m = b.dataset.m;
      const want = m.endsWith('%') ? (st * HOUSE) / (parseFloat(m) / 100) : st * parseFloat(m.slice(1));
      const cand = SKINS.filter((s) => s.price > st).sort((a, c) => Math.abs(a.price - want) - Math.abs(c.price - want))[0];
      if (cand) { target = cand.id; render(); }
    });
    $('#addBal', el).addEventListener('input', (e) => { addBal = Math.max(0, Math.min(S.balance, Math.floor(+e.target.value || 0))); render(); });
    $('#q', el).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); limit = 120; render(); });
    $('#pFrom', el).addEventListener('input', (e) => { from = +e.target.value || 0; limit = 120; render(); });
    $('#pTo', el).addEventListener('input', (e) => { to = +e.target.value || 0; limit = 120; render(); });
    $('#invSort', el).onclick = () => { invDesc = !invDesc; render(); };

    $('#upgBtn', el).onclick = async () => {
      if (busy || !target) return;
      const st = stake();
      if (!st) return;
      if (addBal > S.balance) return toast(lng('Недостаточно средств', 'Not enough funds'), 'bad');
      const ch = chance();
      const win = S.rigged || rand() < ch;
      busy = true;
      // ставка списывается и результат записывается сразу
      removeItems([...sel]);
      setBalance(S.balance - addBal);
      S.st.upg++;
      let wonItem = null, back = 0;
      if (win) { wonItem = addItem(target); S.st.upgWin++; }
      else { back = Math.round(st * CASHBACK * 100) / 100; S.cashback += back; }
      save();
      const g = $('#gauge', el);
      g.classList.remove('win', 'lose');
      const half = ch * 180;
      const deg = win ? (rand() * 2 - 1) * half * 0.92 : half + 2 + rand() * (360 - half * 2 - 4);
      rot = Math.ceil(rot / 360) * 360 + 360 * 5 + ((deg + 360) % 360);
      const nd = $('#needle', el);
      const dur = S.fast ? 1.5 : 5;
      nd.style.transition = `transform ${dur}s cubic-bezier(.12,.75,.1,1)`;
      nd.style.transform = `rotate(${rot}deg)`;
      $('#upgBtn', el).disabled = true;
      await sleep(dur * 1000 + 150);
      g.classList.add(win ? 'win' : 'lose');
      sel.clear(); addBal = 0; $('#addBal', el).value = 0; $('#addBal', el).max = S.balance;
      el.querySelector('.bal-slider .mx b').textContent = rub(S.balance);
      busy = false;
      if (win) { toast(`${lng('Апгрейд успешен', 'Upgrade succeeded')}: ${SKIN[target].weapon} | ${SKIN[target].skin}`, 'good'); myDrop(target, 'high'); sel.add(wonItem.u); }
      else toast(lng(`Не повезло. Кешбек +${rub(back)} — забери его кнопкой сверху`, `No luck. Cashback +${rub(back)} — claim it with the button above`), 'bad');
      target = null;
      render();
    };
    render();
  }

  // ---------- батлы ----------
  let battle = null;
  const botName = (taken) => pick(USERS.filter((u) => u !== 'lafore' && !taken.includes(u)));
  function makeBattle(cases, size, mode, botsJoined) {
    const players = [{ name: S.nick, me: true }];
    for (let i = 0; i < botsJoined; i++) players.push({ name: botName(players.map((p) => p.name)) });
    return { cases, size, mode, players, price: cases.reduce((s, id) => s + CASE[id].price, 0) };
  }
  function lobby() {
    return Array.from({ length: 6 }, () => {
      const size = pick([2, 2, 3, 4]);
      const rounds = 1 + randInt(5);
      const pool = PAID.filter((c) => c.price <= 2999);
      const cases = Array.from({ length: rounds }, () => pick(pool).id);
      return { cases, size, mode: rand() < 0.25 ? 'crazy' : 'normal', joined: 1 + randInt(size - 1), host: pick(USERS) };
    });
  }
  let lobbyCache = null;
  function pageBattles(el) {
    lobbyCache = lobbyCache || lobby();
    const pickCnt = store.get('bpick', {});
    let size = store.get('bsize', 2), mode = store.get('bmode', 'normal');
    el.innerHTML = `
      <div class="h1">${icon('battles')}${lng('Кейс-батлы', 'Case battles')}</div>
      <div class="panel" style="margin-bottom:18px">
        <div class="row" style="margin-bottom:14px">
          <b class="cond" style="font-size:20px">${lng('Создать батл', 'Create a battle')}</b><span class="spacer"></span>
          <div class="seg" id="bSize">${[2, 3, 4].map((n) => `<button data-n="${n}">${n} ${lng('игрока', 'players')}</button>`).join('')}</div>
          <div class="seg" id="bMode"><button data-m="normal">${lng('Обычный', 'Normal')}</button><button data-m="crazy">Crazy</button></div>
        </div>
        <input class="search" id="bq" placeholder="${lng('Поиск кейса', 'Search cases')}" style="margin-bottom:10px;width:240px">
        <div class="picker" id="bPicker">${PAID.map((c) => `<div class="pick-case" data-c="${c.id}">${caseArt(c)}<div class="nm">${esc(c.name)}</div><div class="pr">${rub(c.price)}</div><div class="cnt"><button data-d="-1">−</button><b>0</b><button data-d="1">+</button></div></div>`).join('')}</div>
        <div class="row" style="margin-top:14px"><span class="muted" id="bInfo"></span><span class="spacer"></span><button class="btn lg" id="bCreate">${lng('Создать', 'Create')}</button></div>
        <div class="muted" style="font-size:13px;margin-top:8px">${lng('Все игроки открывают одни и те же кейсы. Победитель забирает все предметы. В режиме Crazy побеждает тот, у кого сумма меньше.', 'All players open the same cases. The winner takes all the items. In Crazy mode the lowest total wins.')}</div>
      </div>
      <div class="title-glow"><span></span>${lng('Активные батлы', 'Active battles')}</div>
      <div class="battle-list">${lobbyCache.map((b, i) => `
        <div class="bl-row ${b.mode}">
          <div><b>${esc(b.host)}</b><div class="muted" style="font-size:12px">${b.cases.length} ${lng('раунд(а)', 'round(s)')} · ${b.mode === 'crazy' ? 'Crazy' : lng('Обычный', 'Normal')}</div></div>
          <div class="bl-cases">${b.cases.map((id) => caseArt(CASE[id])).join('')}</div>
          <div class="slots">${Array.from({ length: b.size }, (_, k) => `<span class="slot-ava ${k < b.joined ? 'full' : ''}">${k < b.joined ? '👤' : '+'}</span>`).join('')}</div>
          <button class="btn" data-join="${i}">${lng('Войти', 'Join')} · ${rub(b.cases.reduce((s, id) => s + CASE[id].price, 0))}</button>
        </div>`).join('')}</div>`;

    function info() {
      const cases = Object.entries(pickCnt).flatMap(([id, n]) => Array(n).fill(id));
      const price = cases.reduce((s, id) => s + CASE[id].price, 0);
      $('#bInfo', el).textContent = cases.length ? lng(`${cases.length} раунд(ов) · стоимость входа ${rub(price)}`, `${cases.length} round(s) · entry cost ${rub(price)}`) : lng('Выбери кейсы (до 10 раундов)', 'Pick cases (up to 10 rounds)');
      $('#bCreate', el).disabled = !cases.length;
      $$('.pick-case', el).forEach((p) => { const n = pickCnt[p.dataset.c] || 0; $('b', p).textContent = n; p.classList.toggle('on', n > 0); });
      $$('#bSize button', el).forEach((b) => b.classList.toggle('on', +b.dataset.n === size));
      $$('#bMode button', el).forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
      return { cases, price };
    }
    $('#bq', el).addEventListener('input', (e) => {
      const v = e.target.value.trim().toLowerCase();
      $$('.pick-case', el).forEach((p) => { p.hidden = !!v && !CASE[p.dataset.c].name.toLowerCase().includes(v); });
    });
    $('#bPicker', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      const id = b.closest('.pick-case').dataset.c;
      const total = Object.values(pickCnt).reduce((a, x) => a + x, 0);
      const d = +b.dataset.d;
      if (d > 0 && total >= 10) return toast(lng('Максимум 10 раундов', 'Up to 10 rounds'));
      pickCnt[id] = Math.max(0, (pickCnt[id] || 0) + d);
      if (!pickCnt[id]) delete pickCnt[id];
      store.set('bpick', pickCnt); info();
    });
    $$('#bSize button', el).forEach((b) => (b.onclick = () => { size = +b.dataset.n; store.set('bsize', size); info(); }));
    $$('#bMode button', el).forEach((b) => (b.onclick = () => { mode = b.dataset.m; store.set('bmode', mode); info(); }));
    $('#bCreate', el).onclick = () => {
      const { cases, price } = info();
      if (S.balance < price) { toast(lng('Недостаточно средств', 'Not enough funds'), 'bad'); openTopUp(); return; }
      battle = makeBattle(cases, size, mode, 0);
      location.hash = '#/battle';
    };
    el.querySelector('.battle-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-join]'); if (!b) return;
      const L = lobbyCache[+b.dataset.join];
      const price = L.cases.reduce((s, id) => s + CASE[id].price, 0);
      if (S.balance < price) { toast(lng('Недостаточно средств', 'Not enough funds'), 'bad'); openTopUp(); return; }
      battle = makeBattle(L.cases, L.size, L.mode, L.joined);
      battle.players[1].name = L.host;
      lobbyCache.splice(+b.dataset.join, 1);
      lobbyCache.push(lobby()[0]);
      location.hash = '#/battle';
    });
    info();
  }

  function pageBattle(el) {
    if (!battle) { location.hash = '#/battles'; return; }
    const B = battle;
    battle = null;
    // оплата и заранее определённый исход всех раундов
    setBalance(S.balance - B.price);
    S.st.battles++; S.st.spent += B.price;
    while (B.players.length < B.size) B.players.push({ name: botName(B.players.map((p) => p.name)), late: true });
    B.players.forEach((p) => { p.drops = B.cases.map((cid) => roll(CASE[cid])); p.total = p.drops.reduce((s, id) => s + SKIN[id].price, 0); });
    const best = B.mode === 'crazy' ? Math.min(...B.players.map((p) => p.total)) : Math.max(...B.players.map((p) => p.total));
    const winner = pick(B.players.filter((p) => p.total === best));
    const allDrops = B.players.flatMap((p) => p.drops);
    let settled = false;
    const settle = () => {
      if (settled) return; settled = true;
      if (winner.me) { allDrops.forEach((id) => addItem(id)); S.st.battleWin++; }
      save();
    };
    onLeave(settle);

    el.innerHTML = `
      <div class="arena-head">
        <a class="btn ghost sm" href="#/battles">← ${lng('Батлы', 'Battles')}</a>
        <div class="h1">${icon('battles')}${lng('Батл', 'Battle')} · ${B.mode === 'crazy' ? 'Crazy' : lng('Обычный', 'Normal')}</div>
        <span class="spacer"></span>
        <span class="chip">${lng('Банк', 'Pot')}: <b id="bank" style="color:var(--yellow)">0 ₽</b></span>
        <button class="icon-btn" id="fastBtn" title="${lng('Быстро', 'Fast')}">${icon('bolt')}</button>
      </div>
      <div class="round-cases" id="rounds">${B.cases.map((id, i) => `<div class="rc" data-i="${i}">${caseArt(CASE[id])}<div>${rub(CASE[id].price)}</div></div>`).join('')}</div>
      <div class="players" style="grid-template-columns:repeat(${B.size},minmax(0,1fr))">
        ${B.players.map((p, i) => `
          <div class="pcol" data-p="${i}">
            <div class="phead"><span class="slot-ava ${p.me ? 'me' : 'full'}">${esc(p.name[0].toUpperCase())}</span><span class="nm">${esc(p.name)}</span><span class="tot">0 ₽</span></div>
            <div class="vreel"><div class="waiting">${p.late ? lng('Ожидание игрока…', 'Waiting for a player…') : lng('Готов', 'Ready')}</div></div>
            <div class="pdrops"></div>
          </div>`).join('')}
      </div>
      <div id="bEnd" style="display:flex;gap:10px;justify-content:center;margin-top:18px" hidden>
        <button class="btn lg" id="again">${lng('Ещё такой же', 'Same again')}</button><a class="btn lg ghost" href="#/battles">${lng('К батлам', 'To battles')}</a>
      </div>`;
    const fastBtn = $('#fastBtn', el);
    const setFast = () => fastBtn.classList.toggle('on', S.fast);
    fastBtn.onclick = () => { S.fast = !S.fast; save(); setFast(); };
    setFast();
    $('#again', el).onclick = () => {
      if (S.balance < B.price) { toast(lng('Недостаточно средств', 'Not enough funds'), 'bad'); return; }
      battle = makeBattle(B.cases, B.size, B.mode, 0);
      route();
    };

    let alive = true;
    onLeave(() => { alive = false; });
    const cols = $$('.pcol', el);
    (async () => {
      for (let i = 0; i < B.players.length; i++) {
        if (!B.players[i].late) continue;
        await sleep(500 + rand() * 600); if (!alive) return;
        $('.waiting', cols[i]).textContent = lng('Готов', 'Ready');
      }
      for (const n of [3, 2, 1]) {
        cols.forEach((c) => { $('.waiting', c).innerHTML = `<span class="count">${n}</span>`; });
        await sleep(700); if (!alive) return;
      }
      let bank = 0;
      const totals = B.players.map(() => 0);
      for (let r = 0; r < B.cases.length; r++) {
        $$('#rounds .rc', el).forEach((x, i) => { x.classList.toggle('cur', i === r); x.classList.toggle('done', i < r); });
        const c = CASE[B.cases[r]];
        await Promise.all(cols.map((col, i) => spinVReel($('.vreel', col), c, B.players[i].drops[r], S.fast)));
        if (!alive) return;
        cols.forEach((col, i) => {
          const id = B.players[i].drops[r];
          totals[i] += SKIN[id].price; bank += SKIN[id].price;
          $('.pdrops', col).insertAdjacentHTML('afterbegin', itemHtml(id));
          $('.tot', col).textContent = rub(totals[i]);
        });
        $('#bank', el).textContent = rub(bank);
        await sleep(S.fast ? 250 : 600); if (!alive) return;
      }
      $$('#rounds .rc', el).forEach((x) => { x.classList.remove('cur'); x.classList.add('done'); });
      settle();
      cols.forEach((col, i) => {
        col.classList.add(B.players[i] === winner ? 'winner' : 'loser');
        $('.vreel', col).innerHTML = `<div class="waiting">${B.players[i] === winner ? lng('🏆 Победа<br>', '🏆 Win<br>') + rub(bank) : lng('Проигрыш', 'Loss')}</div>`;
      });
      $('#bEnd', el).hidden = false;
      if (winner.me) { toast(lng(`Ты выиграл батл! +${allDrops.length} предметов на ${rub(bank)}`, `You won the battle! +${allDrops.length} items worth ${rub(bank)}`), 'good'); allDrops.slice(0, 3).forEach((id) => myDrop(id, B.cases[0])); }
      else toast(`${lng('Победил', 'Winner:')} ${winner.name}`, 'bad');
    })();
  }

  // ---------- контракты ----------
  function pageContracts(el) {
    const slots = [];
    let busy = false;
    el.innerHTML = `
      <div class="h1">${icon('contracts')}${lng('Контракты', 'Contracts')}</div>
      <div class="panel">
        <div class="muted" style="margin-bottom:12px;text-align:center">${lng('Положи от 3 до 10 предметов — получишь один скин стоимостью от ×0.25 до ×4 от суммы контракта.', 'Put in 3 to 10 items and get one skin worth ×0.25 to ×4 of the contract total.')}</div>
        <div class="con-slots" id="cSlots"></div>
        <div class="con-info">
          <div class="panel"><b id="cSum">0 ₽</b><span>${lng('Сумма контракта', 'Contract total')}</span></div>
          <div class="panel"><b id="cMin">0 ₽</b><span>${lng('Минимум', 'Minimum')}</span></div>
          <div class="panel"><b id="cMax">0 ₽</b><span>${lng('Максимум', 'Maximum')}</span></div>
        </div>
        <div class="reels" id="cReel" hidden><div class="reel"></div></div>
        <button class="btn xl block" id="cGo">${lng('Подписать контракт', 'Sign the contract')}</button>
      </div>
      <div class="title-glow"><span></span>${lng('Инвентарь', 'Inventory')}</div>
      <div class="item-grid small" id="cInv"></div>`;

    const sum = () => slots.reduce((s, u) => s + SKIN[S.inv.find((x) => x.u === u).id].price, 0);
    function render() {
      $('#cSlots', el).innerHTML = Array.from({ length: 10 }, (_, i) => {
        const u = slots[i];
        if (!u) return '<div class="con-slot">+</div>';
        const it = S.inv.find((x) => x.u === u);
        return `<div class="con-slot">${itemHtml(it.id, 'click', `data-rm="${u}"`)}</div>`;
      }).join('');
      const s = sum();
      $('#cSum', el).textContent = rub(s);
      $('#cMin', el).textContent = rub(s * 0.25);
      $('#cMax', el).textContent = rub(s * 4);
      $('#cGo', el).disabled = busy || slots.length < 3;
      const free = S.inv.filter((x) => !slots.includes(x.u));
      $('#cInv', el).innerHTML = free.map((it) => itemHtml(it.id, 'click', `data-add="${it.u}"`)).join('')
        || `<div class="empty-inv" style="grid-column:1/-1"><b>${lng('Нет предметов', 'No items')}</b><span>${lng('Открой кейс, чтобы было что положить в контракт', 'Open a case to have something to put in a contract')}</span><a class="btn green" href="#/">${lng('Открыть кейс', 'Open a case')}</a></div>`;
    }
    el.addEventListener('click', (e) => {
      if (busy) return;
      const a = e.target.closest('[data-add]'), r = e.target.closest('[data-rm]');
      if (a) { if (slots.length >= 10) return toast(lng('Максимум 10 предметов', 'Up to 10 items')); slots.push(a.dataset.add); render(); }
      if (r) { slots.splice(slots.indexOf(r.dataset.rm), 1); render(); }
    });
    $('#cGo', el).onclick = async () => {
      if (busy || slots.length < 3) return;
      const s = sum();
      // множитель: 69% — от ×0.25 до ×1, 31% — от ×1 до ×4 (лог-равномерно) → в среднем ~×1.05
      const m = rand() < 0.69 ? Math.pow(4, rand()) / 4 : Math.pow(4, rand());
      const want = s * m;
      const inRange = SKINS.filter((x) => x.price >= s * 0.25 && x.price <= s * 4);
      const pool = inRange.length ? inRange : SKINS;
      const res = pool.slice().sort((a, b) => Math.abs(a.price - want) - Math.abs(b.price - want))[0];
      busy = true;
      removeItems(slots.splice(0));
      const it = addItem(res.id);
      S.st.contracts++; save();
      render();
      $('#cReel', el).hidden = false;
      const fake = { chances: pool.map((x) => ({ id: x.id, p: 1 / pool.length })) };
      await spinReel($('#cReel .reel', el), fake, res.id, S.fast);
      busy = false; render();
      showWin([it]);
    };
    render();
  }

  // ---------- профиль ----------
  // ---------- лидерборд ----------
  const LEADERS = [
    { name: 'kryon', sum: 10912131, ava: 'img/ava-kryon.jpg' },
    { name: 'spiderkaras', sum: 6537211, ava: 'img/ava-spiderkaras.jpg' },
  ];
  const avaHtml = (url, nick) => (url ? `<img src="${esc(url)}" alt="" onerror="this.remove()">` : '') + esc((nick || '?')[0].toUpperCase());
  function pageLeaders(el) {
    const SLOTS = 10, EVERY = 5 * 60e3;
    let rows = null, live = false, nextAt = 0;
    const myPeak = () => Math.max(S.st.peak || 0, S.balance);
    function render() {
      const list = rows || LEADERS.map((p) => ({ nick: p.name, avatar_url: p.ava, peak: p.sum, pinned: true }));
      const row = (i) => {
        const p = list[i];
        const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
        if (!p) return `<div class="lb-row empty"><span class="lb-pos">${medal}</span><span class="lb-ava">?</span><span class="lb-nm muted">${lng('Свободно', 'Free spot')}</span><span class="lb-sum muted">—</span></div>`;
        const me = NET && NET.loggedIn && p.nick === S.nick && !p.pinned;
        return `<div class="lb-row taken place-${i + 1} ${me ? 'me' : ''}"><span class="lb-pos">${medal}</span><span class="lb-ava">${avaHtml(p.avatar_url, p.nick)}</span><b class="lb-nm">${esc(p.nick)}${me ? ` <small class="muted">(${lng('ты', 'you')})</small>` : ''}</b><span class="lb-sum">${rub(p.peak)}</span></div>`;
      };
      const top = list[0] || { nick: '—', peak: 0 };
      const mp = myPeak();
      el.innerHTML = `
        <div class="h1">${icon('trophy')}${lng('Лидеры', 'Leaderboard')}</div>
        <div class="lb-note muted">${lng('Рейтинг по пику денег на счету', 'Ranked by peak balance')}${live ? ` · ${lng('обновление через', 'refresh in')} <b id="lbT"></b>` : ` · ${lng('офлайн-версия', 'offline copy')}`}</div>
        <div class="lb">${Array.from({ length: SLOTS }, (_, i) => row(i)).join('')}</div>
        <div class="panel lb-me">
          <span class="lb-ava me">${avaHtml(S.avatar, S.nick)}</span>
          <div style="flex:1;min-width:0"><b>${esc(S.nick)}</b><div class="muted" style="font-size:13px">${lng('Твой пик денег', 'Your peak balance')}${NET && NET.loggedIn ? '' : ` · <a href="#/profile">${lng('войди, чтобы попасть в топ', 'log in to get on the board')}</a>`}</div></div>
          <div style="text-align:right"><div class="cond" style="font-size:24px;color:var(--yellow)">${rub(mp)}</div>
          <div class="muted" style="font-size:12px">${mp >= top.peak ? lng('Ты на вершине 👑', 'You are on top 👑') : lng('До 1 места: ', 'To 1st place: ') + rub(top.peak - mp)}</div></div>
        </div>`;
      tick();
    }
    function tick() { const t = $('#lbT', el); if (t) t.textContent = clock(Math.max(0, nextAt - Date.now())).slice(3); }
    async function load() {
      nextAt = Date.now() + EVERY;
      if (NET) {
        try { rows = await NET.leaderboard(SLOTS); live = true; } catch (e) { live = false; }
      }
      render();
    }
    render();
    load();
    const t1 = setInterval(load, EVERY), t2 = setInterval(tick, 1000);
    onLeave(() => { clearInterval(t1); clearInterval(t2); });
  }

  const netMsg = (e) => {
    const m = String(e && e.message || '');
    if (e && e.status === 404) return lng('База ещё не настроена — нужно запустить cb/supabase/schema.sql в Supabase', 'The database is not set up yet — run cb/supabase/schema.sql in Supabase');
    if (m === 'offline') return lng('Сервер недоступен — проверь интернет', 'Server unreachable — check your connection');
    if (m === 'nick_taken') return lng('Этот ник уже занят', 'This nickname is taken');
    if (m === 'confirm_email_on') return lng('В Supabase включено подтверждение почты — выключи его (Authentication → Sign In / Providers → Email → Confirm email)', 'Email confirmation is on in Supabase — turn it off');
    if (/invalid login credentials/i.test(m)) return lng('Неверный ник или пароль', 'Wrong nickname or password');
    if (/already registered/i.test(m)) return lng('Такой аккаунт уже есть — войди', 'This account already exists — log in');
    if (/password/i.test(m)) return lng('Пароль слишком простой (минимум 6 символов)', 'Password is too weak (6+ characters)');
    return m;
  };
  function accountPanel() {
    if (!NET) return '';
    if (!NET.loggedIn) {
      return `<div class="panel acc-panel"><div style="flex:1;min-width:220px"><b class="cond" style="font-size:20px">${lng('Аккаунт', 'Account')}</b>
        <div class="muted">${lng('Войди или зарегистрируйся — инвентарь сохранится на сервере, а ты попадёшь в топ и ленту дропов.', 'Log in or sign up — your inventory is saved on the server and you get on the leaderboard and the drop feed.')}</div></div>
        <button class="btn" id="accLogin">${lng('Войти / Регистрация', 'Log in / Sign up')}</button></div>`;
    }
    return `<div class="panel acc-panel"><div style="flex:1;min-width:220px"><b class="cond" style="font-size:20px">${lng('Аккаунт', 'Account')}</b>
      <div class="muted" style="font-size:12px;word-break:break-all">UID: ${esc(NET.uid)}</div>
      <div class="muted" style="font-size:12px">${lng('Прогресс сохраняется на сервере автоматически', 'Progress is saved to the server automatically')}</div></div>
      <label class="btn ghost" style="cursor:pointer">${lng('Загрузить аватарку', 'Upload avatar')}<input type="file" id="accAva" accept="image/png,image/jpeg,image/webp" hidden></label>
      <button class="btn red sm" id="accOut">${lng('Выйти', 'Log out')}</button></div>`;
  }
  function bindAccount(el, rerender) {
    const li = $('#accLogin', el); if (li) li.onclick = () => openAuth();
    const out = $('#accOut', el);
    if (out) out.onclick = async () => { await NET.flush(); await NET.signOut(); Object.assign(S, freshState()); S.avatar = null; S.nick = lng('Игрок', 'Player') + (1000 + randInt(9000)); save(); header(); rerender(); toast(lng('Ты вышел из аккаунта', 'Logged out')); };
    const av = $('#accAva', el);
    if (av) av.onchange = async () => {
      const f = av.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) return toast(lng('Файл слишком большой (до 8 МБ)', 'File too large (8 MB max)'), 'bad');
      try { S.avatar = await NET.uploadAvatar(f); save(); header(); rerender(); toast(lng('Аватарка обновлена', 'Avatar updated'), 'good'); }
      catch (e) { toast(netMsg(e), 'bad'); }
    };
  }
  function openAuth() {
    let mode = 'login';
    modal(`<h3 id="authT"></h3>
      <div class="seg" id="authSeg" style="display:flex;margin:0 auto 14px;width:fit-content"><button data-m="login">${lng('Вход', 'Log in')}</button><button data-m="reg">${lng('Регистрация', 'Sign up')}</button></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <input class="input" id="authNick" maxlength="20" placeholder="${lng('Ник', 'Nickname')}" autocomplete="username" value="${esc(/^(Игрок|Player)\d+$/.test(S.nick) ? '' : S.nick)}">
        <input class="input" id="authPw" type="password" placeholder="${lng('Пароль (от 6 символов)', 'Password (6+ characters)')}" autocomplete="current-password">
        <div class="muted" id="authHint" style="font-size:12px;text-align:center"></div>
        <button class="btn lg block" id="authGo"></button>
      </div>`, (bg, close) => {
      const sync = () => {
        $$('#authSeg button', bg).forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
        $('#authT', bg).textContent = mode === 'login' ? lng('Вход', 'Log in') : lng('Регистрация', 'Sign up');
        $('#authGo', bg).textContent = mode === 'login' ? lng('Войти', 'Log in') : lng('Создать аккаунт', 'Create account');
        $('#authHint', bg).textContent = mode === 'reg' ? lng('Текущий баланс и инвентарь перейдут в новый аккаунт.', 'Your current balance and inventory move into the new account.') : '';
      };
      $$('#authSeg button', bg).forEach((b) => (b.onclick = () => { mode = b.dataset.m; sync(); }));
      const go = async () => {
        const nick = $('#authNick', bg).value.trim(), pw = $('#authPw', bg).value;
        if (nick.length < 3) return toast(lng('Ник от 3 до 20 символов', 'Nickname must be 3–20 characters'), 'bad');
        if (pw.length < 6) return toast(lng('Пароль от 6 символов', 'Password must be 6+ characters'), 'bad');
        const btn = $('#authGo', bg); btn.disabled = true;
        try {
          if (mode === 'reg') {
            S.nick = nick;
            const row = await NET.signUp(nick, pw, S, S.balance + invValue(), S.balance);
            applyCloud(row || { nick, state: S });
            toast(lng('Аккаунт создан, прогресс сохранён ✅', 'Account created, progress saved ✅'), 'good');
          } else {
            let row = await NET.signIn(nick, pw);
            if (!row) row = await NET.updateProfile({ nick, state: S, net_worth: S.balance + invValue(), balance: S.balance }).catch(() => null) || { nick, state: S };
            applyCloud(row);
            toast(`${lng('С возвращением', 'Welcome back')}, ${row.nick}!`, 'good');
          }
          close(); header(); route();
        } catch (e) { toast(netMsg(e), 'bad'); btn.disabled = false; }
      };
      $('#authGo', bg).onclick = go;
      $('#authPw', bg).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      sync();
    });
  }

  function pageProfile(el) {
    const render = () => {
      const invSum = S.inv.reduce((s, it) => s + SKIN[it.id].price, 0);
      el.innerHTML = `
        ${accountPanel()}
        <div class="panel prof-head">
          <div class="ava">${avaHtml(S.avatar, S.nick)}</div>
          <div style="flex:1;min-width:200px">
            <div class="row"><input class="input" id="nick" maxlength="20" value="${esc(S.nick)}" style="max-width:260px"><button class="btn ghost" id="saveNick">${lng('Сохранить', 'Save')}</button></div>
            <div class="muted" style="margin-top:6px">${lng('Ник показывается в ленте последних дропов', 'Your nickname shows up in the latest drops feed')}</div>
          </div>
          <div><div class="muted">${lng('На счету', 'Balance')}</div><div class="cond" style="font-size:32px;color:var(--yellow)">${rub(S.balance)}</div></div>
        </div>
        <div class="stat-grid">
          <div class="panel"><b>${S.st.opened}</b><span>${lng('кейсов открыто', 'cases opened')}</span></div>
          <div class="panel"><b>${S.st.upgWin}/${S.st.upg}</b><span>${lng('апгрейдов успешно', 'upgrades succeeded')}</span></div>
          <div class="panel"><b>${S.st.battleWin}/${S.st.battles}</b><span>${lng('батлов выиграно', 'battles won')}</span></div>
          <div class="panel"><b>${S.st.contracts}</b><span>${lng('контрактов', 'contracts')}</span></div>
          <div class="panel"><b>${rub(S.cashback)}</b><span>${lng('кешбек к выплате (<a href="#/upgrade">забрать</a>)', 'cashback to claim (<a href="#/upgrade">claim</a>)')}</span></div>
          <div class="panel"><b>${rub(S.st.best)}</b><span>${lng('лучший дроп', 'best drop')}${S.st.bestId ? ': ' + esc(SKIN[S.st.bestId].weapon + ' | ' + SKIN[S.st.bestId].skin) : ''}</span></div>
        </div>
        <div class="row" style="margin:26px 0 14px"><div class="cond" style="font-size:22px">${lng('Инвентарь', 'Inventory')} · ${S.inv.length} ${lng('шт.', 'pcs')} · ${rub(invSum)}</div><span class="spacer"></span>
          <button class="btn green" id="sellAll" ${S.inv.length ? '' : 'disabled'}>${lng('Продать всё за', 'Sell all for')} ${rub(invSum)}</button></div>
        <div class="item-grid">${S.inv.map((it) => `<div>${itemHtml(it.id)}<button class="btn ghost sm block" style="margin-top:6px" data-sell="${it.u}">${lng('Продать', 'Sell')}</button></div>`).join('')
          || `<div class="empty-inv" style="grid-column:1/-1"><b>${lng('Ваш инвентарь пуст', 'Your inventory is empty')}</b><span>${lng('Открой свой первый кейс', 'Open your first case')}</span><a class="btn green" href="#/">${icon('box')} ${lng('Открыть кейс', 'Open a case')}</a></div>`}</div>
        <div class="row" style="margin-top:30px"><span class="spacer"></span><button class="btn red sm" id="reset">${lng('Сбросить прогресс', 'Reset progress')}</button></div>`;
      $('#saveNick', el).onclick = async () => {
        const v = $('#nick', el).value.trim().slice(0, 20);
        if (!v || v === S.nick) return;
        if (NET && NET.loggedIn) {
          if (v.length < 3) return toast(lng('Ник от 3 символов', 'Nickname must be at least 3 characters'), 'bad');
          try { await NET.updateProfile({ nick: v }); }
          catch (e) { return toast(e.code === '23505' ? lng('Ник уже занят', 'Nickname is taken') : netMsg(e), 'bad'); }
        }
        S.nick = v; save(); header(); toast(lng('Ник сохранён', 'Nickname saved'), 'good'); render();
      };
      bindAccount(el, render);
      $('#sellAll', el).onclick = () => { sell(S.inv.map((x) => x.u)); render(); };
      $('#reset', el).onclick = () => {
        modal(`<h3>${lng('Сбросить всё?', 'Reset everything?')}</h3><p class="muted" style="text-align:center">${lng('Баланс, инвентарь и статистика обнулятся.', 'Balance, inventory and stats will be wiped.')}</p><div class="actions"><button class="btn ghost" data-x="0">${lng('Отмена', 'Cancel')}</button><button class="btn red" data-x="1">${lng('Сбросить', 'Reset')}</button></div>`, (bg, close) => {
          bg.addEventListener('click', (e) => {
            const b = e.target.closest('[data-x]'); if (!b) return;
            if (b.dataset.x === '1') { Object.assign(S, freshState()); save(); header(); render(); toast(lng('Прогресс сброшен', 'Progress reset'), 'good'); }
            close();
          });
        });
      };
      el.querySelectorAll('[data-sell]').forEach((b) => (b.onclick = () => { sell([b.dataset.sell]); render(); }));
    };
    render();
  }

  // ---------- промокоды и пополнение (виртуальное) ----------
  const PROMOS = {
    'BEER-20': { desc: lng('+20% к балансу (от 100 до 500 ₽)', '+20% to balance (100 to 500 ₽)'), apply: () => { const v = Math.max(100, Math.min(500, Math.round(S.balance * 0.2))); setBalance(S.balance + v); return '+' + rub(v); } },
    'CASEBEER': { desc: '+300 ₽', apply: () => { setBalance(S.balance + 300); return '+300 ₽'; } },
    // накрутка: все апгрейды залетают. Повторный ввод выключает её.
    [atob('TkFLUlVUS0E=')]: { toggle: true, desc: lng('все апгрейды залетают', 'every upgrade wins'), apply: () => { S.rigged = !S.rigged; return S.rigged ? lng('апгрейды теперь всегда залетают 🔥', 'upgrades now always win 🔥') : lng('выключена', 'turned off'); } },
    'LAFORE': { desc: lng('случайный нож', 'a random knife'), apply: () => { const id = pick(KNIVES.filter((k) => SKIN[k].price <= 60000)); addItem(id); myDrop(id, 'knife'); return SKIN[id].weapon + ' | ' + SKIN[id].skin; } },
  };
  function applyPromo(code) {
    code = String(code || '').trim().toUpperCase();
    const p = PROMOS[code];
    if (!p) { toast(lng('Такого промокода нет', 'No such promo code'), 'bad'); return false; }
    if (!p.toggle && S.promos.includes(code)) { toast(lng('Промокод уже использован', 'Promo code already used'), 'bad'); return false; }
    if (!S.promos.includes(code)) S.promos.push(code);
    const res = p.apply();
    save();
    toast(`${lng('Промокод', 'Promo code')} ${code} ${lng('активирован', 'activated')}: ${res}`, 'good');
    return true;
  }
  function openTopUp() {
    const left = S.bonusAt - Date.now();
    modal(`<h3>${lng('Пополнение', 'Top up')}</h3>
      <p class="muted" style="text-align:center;margin:0 0 14px">${lng('Всё на виртуальные рубли — настоящие деньги не принимаются и не выводятся.', 'Everything is in virtual rubles — no real money is accepted or paid out.')}</p>
      <div class="panel" style="text-align:center;margin-bottom:12px">
        <div class="cond" style="font-size:20px">${lng('Бонус', 'Bonus')} <b style="color:var(--yellow)">+500 ₽</b> ${lng('раз в 30 минут', 'every 30 minutes')}</div>
        <button class="btn green lg" id="claim" style="margin-top:10px" ${left > 0 ? 'disabled' : ''}>${left > 0 ? lng('Через ', 'In ') + clock(left) : lng('Забрать +500 ₽', 'Claim +500 ₽')}</button>
      </div>
      <div class="panel"><div class="cond" style="font-size:18px;margin-bottom:8px">${lng('Промокод', 'Promo code')}</div>
        <div class="row nowrap" style="flex-wrap:nowrap"><input class="input" id="code" placeholder="${lng('Например, BEER-20', 'For example, BEER-20')}"><button class="btn" id="codeBtn">OK</button></div></div>`, (bg, close) => {
      $('#claim', bg).onclick = () => {
        if (S.bonusAt > Date.now()) return;
        S.bonusAt = Date.now() + 30 * 60e3;
        setBalance(S.balance + 500);
        toast(lng('+500 ₽ на баланс', '+500 ₽ to your balance'), 'good');
        close();
      };
      $('#codeBtn', bg).onclick = () => { if (applyPromo($('#code', bg).value)) close(); };
    });
  }

  /* ---------------- шапка и роутер ---------------- */
  const NAV = [['cases', '#/', lng('Кейсы', 'Cases')], ['upgrade', '#/upgrade', lng('Апгрейд', 'Upgrade')], ['battles', '#/battles', lng('Батлы', 'Battles')], ['contracts', '#/contracts', lng('Контракты', 'Contracts')], ['leaders', '#/leaders', lng('Лидеры', 'Leaders')]];
  function header() {
    $('#nav').innerHTML = NAV.map(([k, href, label]) => `<a href="${href}" data-k="${k}">${icon(k)}${label}</a>`).join('');
    $('#mnav').innerHTML = [...NAV, ['profile', '#/profile', lng('Профиль', 'Profile')]].map(([k, href, label]) => `<a href="${href}" data-k="${k}">${icon(k)}${label}</a>`).join('');
    $('#ava').innerHTML = avaHtml(S.avatar, S.nick);
    const lb = $('#loginBtn'); if (lb) { lb.hidden = !NET || NET.loggedIn; lb.textContent = lng('Войти', 'Log in'); }
    $('#nickT').textContent = S.nick;
    $('#balanceText').textContent = rub(S.balance);
    $('#peopleIco').innerHTML = icon('people');
    $('#topup').innerHTML = icon('wallet');
  }

  function route() {
    cleanup.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    cleanup = [];
    const path = location.hash.replace(/^#\/?/, '');
    const [name, arg] = path.split('/');
    const el = $('#page');
    el.innerHTML = '';
    const active = { '': 'cases', case: 'cases', upgrade: 'upgrade', battles: 'battles', battle: 'battles', contracts: 'contracts', profile: 'profile', leaders: 'leaders' }[name || ''] || 'cases';
    $$('[data-k]').forEach((a) => a.classList.toggle('active', a.dataset.k === active));
    try {
      if (name === 'case') pageCase(el, arg);
      else if (name === 'upgrade') pageUpgrade(el);
      else if (name === 'battles') pageBattles(el);
      else if (name === 'battle') pageBattle(el);
      else if (name === 'contracts') pageContracts(el);
      else if (name === 'profile') pageProfile(el);
      else if (name === 'leaders') pageLeaders(el);
      else pageHome(el);
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="panel">${lng('Что-то пошло не так. Обнови страницу.', 'Something went wrong. Reload the page.')}</div>`;
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- пасхалка ----------------
     7 быстрых кликов по 🍺 в логотипе — показываем секретный промокод,
     записанный на пивном языке (расшифровать можно в Beer Translate). */
  const SECRET = 'n_nitro_9z99x11vk_kick_0r_root_66u_unit_22t_tank_4k_kick_0z99x11v';
  let mugClicks = [];
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.logo .lt i')) return;
    const now = Date.now();
    mugClicks = mugClicks.filter((t) => now - t < 3000);
    mugClicks.push(now);
    if (mugClicks.length < 7) return;
    mugClicks = [];
    modal(`<h3>🤫 ${lng('Ты избранный', 'You are the chosen one')}</h3>
      <p class="muted" style="text-align:center;margin:0 0 12px">${lng('Переведи это с пивного языка и введи как промокод. Никому не говори.', 'Translate this from beer language and enter it as a promo code. Tell no one.')}</p>
      <div class="panel" style="font-family:monospace;word-break:break-all;text-align:center;user-select:all">${SECRET}</div>
      <div class="actions"><a class="btn ghost" href="../" target="_blank" rel="noopener">${lng('Пивной переводчик', 'Beer translator')}</a></div>`);
  });

  document.addEventListener('DOMContentLoaded', () => {
    buildSprite();
    header();
    $('#topup').onclick = openTopUp;
    const lb = $('#loginBtn'); if (lb) lb.onclick = () => openAuth();
    if (NET && NET.loggedIn) {
      NET.loadProfile().then((row) => { if (row) { applyCloud(row); header(); route(); } }).catch(() => { /* офлайн: играем на локальной копии */ });
    }
    $('#langBtn').onclick = () => L10N.set(lng('en', 'ru'));
    startFeed();
    window.addEventListener('hashchange', route);
    route();
  });
})();
