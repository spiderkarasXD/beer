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
  const rub = (v) => Math.round(v).toLocaleString('ru-RU') + ' ₽';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let uidSeq = Date.now();
  const uid = () => (uidSeq++).toString(36);
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
  const dhm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 1440)}д:${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}м`; };

  const store = {
    get(k, d) { try { const v = localStorage.getItem('cb2:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cb2:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  /* ---------------- состояние ---------------- */
  const S = Object.assign({
    balance: 1000,
    inv: [],              // [{ u: uid, id: skinId }]
    nick: 'Игрок' + (1000 + randInt(9000)),
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
  const save = () => store.set('state', S);

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
  const CASE = Object.fromEntries(CASES.map((c) => [c.id, c]));
  const PAID = CASES.filter((c) => !c.free);
  const LIMITED = ['dlore', 'high', 'gloves', 'knife'];
  const NEWC = ['beer', 'ak', 'awp'];
  const limitedEnd = (i) => { const week = 7 * 864e5; const base = Math.floor(Date.now() / week) * week; return base + week + i * 864e5 * 0.37 + 3600e3 * 5; };

  function roll(c) {
    let r = rand();
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
  function fakeDrop() {
    const user = pick(USERS);
    if (user === 'lafore') return { user, id: pick(KNIVES), caseId: 'knife' };
    const c = pickWeightedCase();
    return { user, id: roll(c), caseId: c.id };
  }
  function pickWeightedCase() {
    const ws = PAID.map((c) => 1 / Math.sqrt(c.price + 30));
    let r = rand() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < PAID.length; i++) { r -= ws[i]; if (r < 0) return PAID[i]; }
    return PAID[0];
  }
  const showInFeed = (d) => feedTab === 'all' || SKIN[d.id].price >= 1000;
  function dropHtml(d) {
    const s = SKIN[d.id];
    return `<a class="drop ${d.mine ? 'mine' : ''}" href="#/case/${d.caseId}" style="--rc:${RARITY[s.rarity].color}">
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
  const myDrop = (id, caseId) => pushDrop({ user: S.nick, id, caseId, mine: true });
  function startFeed() {
    for (let i = 0; i < 40; i++) FEED.push(fakeDrop());
    // в «Топ» сразу должно что-то быть
    for (let i = 0; i < 6; i++) FEED.splice(randInt(FEED.length), 0, { user: pick(USERS), id: pick(SKINS.filter((s) => s.price >= 1000)).id, caseId: pick(['covert', 'knife', 'high']) });
    renderFeed();
    $$('.side-tabs button').forEach((b) => (b.onclick = () => { feedTab = b.dataset.t; renderFeed(); }));
    const loop = () => { pushDrop(fakeDrop()); setTimeout(loop, 1300 + rand() * 2600); };
    setTimeout(loop, 1500);
    let online = 6100 + randInt(800);
    const upd = () => {
      online = Math.max(4000, online + randInt(41) - 20);
      const t = online.toLocaleString('ru-RU');
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
    ['all', 'Все'], ['hits', 'Хиты'], ['cs2', 'Кейсы CS2'], ['weapons', 'Оружие'], ['knives', 'Ножи'], ['gloves', 'Перчатки'], ['rarity', 'По редкости'],
  ];
  const GROUP_TITLE = { free: 'Бесплатно', hits: 'Хиты CaseBeer', cs2: 'Оружейные кейсы CS2', weapons: 'Кейсы по оружию', knives: 'Ножевые кейсы', gloves: 'Перчатки', rarity: 'По редкости' };
  function caseCard(c) {
    return `<a class="ccard ${c.price > S.balance ? 'locked' : ''}" href="#/case/${c.id}" style="--cc:${c.color}">
      <div class="head"><div class="nm">${esc(c.name)}</div><div class="sub">${c.items.length} предметов ${NEWC.includes(c.id) ? '<span class="badge-new">NEW</span>' : ''}</div></div>
      ${caseArt(c)}
      <div class="price-box">${c.free ? 'Бесплатно' : rub(c.price)}</div>
    </a>`;
  }
  function pageHome(el) {
    let q = '', onlyAff = store.get('onlyAff', false), grp = store.get('grp', 'all');
    el.innerHTML = `
      <section class="promo">
        <div class="voucher" id="vchr"><div class="vt">%</div><div class="vb"><b>+20%</b><span>к балансу</span></div></div>
        <div class="countdown-box"><div class="cl">До бесплатного<br>кейса:</div><div class="ct" id="freeT">00:00:00</div></div>
        <div class="promo-code"><div class="pl">Используй <b>промокод:</b></div><button id="promoBtn">BEER-20</button></div>
      </section>
      <div class="filter-bar">
        <label class="row" style="gap:10px">Быстрый фильтр: <input class="search" id="q" placeholder="Что ищем?"></label>
        <span class="toggle ${onlyAff ? 'on' : ''}" id="aff"><i></i>Только по карману</span>
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
          </a>`).join('') || '<div class="muted">Ничего не найдено</div>';
      }
      const order = ['free', 'hits', 'cs2', 'weapons', 'knives', 'gloves', 'rarity'];
      const groups = grp === 'all' ? order : grp === 'hits' ? ['free', 'hits'] : [grp];
      const html = groups.map((g) => {
        const list = CASES.filter((c) => c.group === g && !LIMITED.includes(c.id) && match(c));
        if (!list.length) return '';
        return `<div class="title-glow"><span></span>${GROUP_TITLE[g]} <small class="muted">· ${list.length}</small></div><div class="case-grid">${list.map(caseCard).join('')}</div>`;
      }).join('');
      $('#sections', el).innerHTML = html || '<div class="muted" style="text-align:center;padding:40px">Ничего не найдено</div>';
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
        <div class="sub">${c.free ? 'Бесплатно раз в час' : c.items.length + ' предметов · средний дроп ≈ ' + rub(c.ev)}</div>
        <div class="row" style="justify-content:center">
          ${c.free ? '' : `<div class="seg" id="cnt">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">x${n}</button>`).join('')}</div>`}
          <button class="icon-btn" id="fastBtn" title="Быстрое открытие">${icon('bolt')}</button>
        </div>
      </div>
      <div class="reels" id="reels"></div>
      <div class="open-bar"><button class="btn xl" id="openBtn"></button></div>
      <div class="title-glow"><span></span>Содержимое кейса</div>
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
        btn.textContent = left > 0 ? 'Через ' + clock(left) : 'Открыть бесплатно';
      } else {
        btn.disabled = busy;
        btn.textContent = `Открыть за ${rub(c.price * count)}`;
      }
    }
    $$('#cnt button', el).forEach((b) => (b.onclick = () => { if (busy) return; count = +b.dataset.n; store.set('count', count); layout(); }));
    if (c.free) { const t = setInterval(updBtn, 1000); onLeave(() => clearInterval(t)); }

    btn.onclick = async () => {
      if (busy) return;
      const cost = c.price * count;
      if (c.free) { if (S.freeAt > Date.now()) return; S.freeAt = Date.now() + 3600e3; }
      else if (S.balance < cost) { toast('Недостаточно средств — пополни баланс', 'bad'); openTopUp(); return; }
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
    modal(`<h3>${items.length > 1 ? 'Твой дроп' : 'Тебе выпало!'}</h3>
      <div class="item-grid">${items.map((it) => itemHtml(it.id)).join('')}</div>
      <div class="actions">
        <button class="btn green" data-a="sell">Продать за ${rub(total)}</button>
        <button class="btn" data-a="upg">В апгрейд</button>
        <button class="btn ghost" data-a="keep">Забрать</button>
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
    if (items.length) toast(`Продано ${items.length} шт. за ${rub(sum)}`, 'good');
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
      <div class="h1">${icon('upgrade')}Апгрейд</div>
      <div class="upg-tools"><button class="icon-btn" id="fastBtn" title="Быстро">${icon('bolt')}</button><span class="spacer"></span>
        <div class="cashback" id="cbBox"><span class="cb-ico">↺</span><span>Кешбек <b>${Math.round(CASHBACK * 100)}%</b> с неудачных апгрейдов</span><b class="cb-sum" id="cbSum"></b><button class="btn green sm" id="cbClaim">Забрать</button></div></div>
      <div class="upg-top">
        <div class="upg-box"><div class="bh">Выберите предметы и/или баланс для использования<small>Можно выбрать несколько предметов</small></div><div class="bb" id="srcBox"></div></div>
        <div class="gauge" id="gauge">
          <svg class="dial" viewBox="0 0 330 330">
            ${ticks}
            <circle cx="165" cy="165" r="132" fill="none" stroke="#262b3d" stroke-width="22"/>
            <path id="arc" fill="none" stroke="url(#gauge-g)" stroke-width="22"/>
            <circle cx="165" cy="165" r="114" fill="#141725" stroke="#2b3044" stroke-width="2"/>
            <circle cx="165" cy="165" r="96" fill="none" stroke="#1d2131" stroke-width="10"/>
          </svg>
          <svg class="needle" id="needle" viewBox="0 0 330 330"><path d="M165 270 175 300H155Z" fill="#ffc700" stroke="#141725" stroke-width="2"/><path d="M165 296V318" stroke="#ff7a00" stroke-width="3"/></svg>
          <div class="core"><svg viewBox="0 0 70 100"><path d="M35 0 70 26V48L35 22 0 48V26Z" fill="currentColor"/><path d="M35 36 70 62V84L35 58 0 84V62Z" fill="currentColor" opacity=".55"/></svg><b id="chance">0.00%</b><span>шанс</span></div>
        </div>
        <div class="upg-box"><div class="bh">Выберите предмет для апгрейда<small>Из списка ниже или кнопками множителей</small></div><div class="bb" id="tgtBox"></div></div>
      </div>
      <div class="upg-under">
        <div class="bal-slider"><span class="lb">Добавить баланс</span><div class="mid"><b id="addBalT">0 ₽</b><input type="range" id="addBal" min="0" max="${S.balance}" step="1" value="0"></div><div class="mx">Макс.<b>${rub(S.balance)}</b></div></div>
        <button class="btn xl block" id="upgBtn">${icon('upgrade')} Апгрейд</button>
        <div class="mults" id="mults">${['x1.5', 'x2', 'x5', 'x10', '30%', '50%', '75%', '90%'].map((m) => `<button class="chip" data-m="${m}">${m}</button>`).join('')}</div>
      </div>
      <div class="upg-bottom">
        <div class="ibox"><div class="ih"><span class="t">${icon('box')}Мои предметы</span><span class="spacer"></span><button class="icon-btn" id="invSort" title="Сортировка">${icon('sort')}</button></div><div class="ib"><div class="item-grid small" id="invGrid"></div></div></div>
        <div class="ibox"><div class="ih"><span class="t">${icon('upgrade')}Выбрать предмет</span><span class="spacer"></span>
          <input class="search" id="pFrom" type="number" placeholder="От ₽"><input class="search" id="pTo" type="number" placeholder="До ₽"><input class="search wide" id="q" placeholder="Поиск"></div>
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
        : `<div class="empty-inv" style="grid-column:1/-1"><b>Ваш инвентарь пуст</b><span>Открой свой первый кейс</span><a class="btn green" href="#/">${icon('box')} Открыть кейс</a></div>`;
      const chosen = S.inv.filter((x) => sel.has(x.u));
      const ghost = '<svg class="ghost-gun" viewBox="0 0 120 48"><use width="120" height="48" href="#w-rifle" fill="currentColor"/></svg>';
      $('#srcBox', el).innerHTML = chosen.length
        ? (chosen.length === 1 ? itemHtml(chosen[0].id) : `<div class="stack">${chosen.map((x) => itemHtml(x.id)).join('')}</div>`)
        : (addBal ? `${ghost}<div class="bal-only">${rub(addBal)}<small>с баланса</small></div>` : `${ghost}${CHEV_DOWN}`);
      const st = stake();
      if (target && SKIN[target].price <= st) target = null;
      $('#tgtBox', el).innerHTML = target ? itemHtml(target) : `${ghost}${CHEV_UP}`;
      const list = SKINS.filter((s) => s.price > st && (!from || s.price >= from) && (!to || s.price <= to) && (!q || (s.weapon + ' ' + s.skin).toLowerCase().includes(q))).sort((a, b) => a.price - b.price);
      $('#tgtGrid', el).innerHTML = (list.slice(0, limit).map((s) => itemHtml(s.id, 'click' + (s.id === target ? ' sel' : ''), `data-t="${s.id}"`, null, true)).join('') || '<div class="muted">Ничего не найдено</div>')
        + (list.length > limit ? `<button class="btn ghost block" id="more" style="grid-column:1/-1">Показать ещё (${list.length - limit})</button>` : '');
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
      if (sel.has(u)) sel.delete(u); else { if (sel.size >= 6) return toast('Максимум 6 предметов'); sel.add(u); }
      render();
    });
    $('#tgtGrid', el).addEventListener('click', (e) => {
      if (e.target.closest('#more')) { limit += 120; render(); return; }
      const it = e.target.closest('[data-t]'); if (!it || busy) return; target = it.dataset.t; render();
    });
    $('#cbClaim', el).onclick = () => { if (S.cashback < 1) return; const v = Math.floor(S.cashback); S.cashback -= v; setBalance(S.balance + v); toast(`Кешбек ${rub(v)} зачислен на баланс`, 'good'); render(); };
    $('#mults', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b || busy) return;
      const st = stake(); if (!st) return toast('Сначала выбери предметы или добавь баланс');
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
      if (addBal > S.balance) return toast('Недостаточно средств', 'bad');
      const ch = chance();
      const win = rand() < ch;
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
      if (win) { toast(`Апгрейд успешен: ${SKIN[target].weapon} | ${SKIN[target].skin}`, 'good'); myDrop(target, 'high'); sel.add(wonItem.u); }
      else toast(`Не повезло. Кешбек +${rub(back)} — забери его кнопкой сверху`, 'bad');
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
      <div class="h1">${icon('battles')}Кейс-батлы</div>
      <div class="panel" style="margin-bottom:18px">
        <div class="row" style="margin-bottom:14px">
          <b class="cond" style="font-size:20px">Создать батл</b><span class="spacer"></span>
          <div class="seg" id="bSize">${[2, 3, 4].map((n) => `<button data-n="${n}">${n} игрока</button>`).join('')}</div>
          <div class="seg" id="bMode"><button data-m="normal">Обычный</button><button data-m="crazy">Crazy</button></div>
        </div>
        <input class="search" id="bq" placeholder="Поиск кейса" style="margin-bottom:10px;width:240px">
        <div class="picker" id="bPicker">${PAID.map((c) => `<div class="pick-case" data-c="${c.id}">${caseArt(c)}<div class="nm">${esc(c.name)}</div><div class="pr">${rub(c.price)}</div><div class="cnt"><button data-d="-1">−</button><b>0</b><button data-d="1">+</button></div></div>`).join('')}</div>
        <div class="row" style="margin-top:14px"><span class="muted" id="bInfo"></span><span class="spacer"></span><button class="btn lg" id="bCreate">Создать</button></div>
        <div class="muted" style="font-size:13px;margin-top:8px">Все игроки открывают одни и те же кейсы. Победитель забирает все предметы. В режиме Crazy побеждает тот, у кого сумма меньше.</div>
      </div>
      <div class="title-glow"><span></span>Активные батлы</div>
      <div class="battle-list">${lobbyCache.map((b, i) => `
        <div class="bl-row ${b.mode}">
          <div><b>${esc(b.host)}</b><div class="muted" style="font-size:12px">${b.cases.length} раунд(а) · ${b.mode === 'crazy' ? 'Crazy' : 'Обычный'}</div></div>
          <div class="bl-cases">${b.cases.map((id) => caseArt(CASE[id])).join('')}</div>
          <div class="slots">${Array.from({ length: b.size }, (_, k) => `<span class="slot-ava ${k < b.joined ? 'full' : ''}">${k < b.joined ? '👤' : '+'}</span>`).join('')}</div>
          <button class="btn" data-join="${i}">Войти · ${rub(b.cases.reduce((s, id) => s + CASE[id].price, 0))}</button>
        </div>`).join('')}</div>`;

    function info() {
      const cases = Object.entries(pickCnt).flatMap(([id, n]) => Array(n).fill(id));
      const price = cases.reduce((s, id) => s + CASE[id].price, 0);
      $('#bInfo', el).textContent = cases.length ? `${cases.length} раунд(ов) · стоимость входа ${rub(price)}` : 'Выбери кейсы (до 10 раундов)';
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
      if (d > 0 && total >= 10) return toast('Максимум 10 раундов');
      pickCnt[id] = Math.max(0, (pickCnt[id] || 0) + d);
      if (!pickCnt[id]) delete pickCnt[id];
      store.set('bpick', pickCnt); info();
    });
    $$('#bSize button', el).forEach((b) => (b.onclick = () => { size = +b.dataset.n; store.set('bsize', size); info(); }));
    $$('#bMode button', el).forEach((b) => (b.onclick = () => { mode = b.dataset.m; store.set('bmode', mode); info(); }));
    $('#bCreate', el).onclick = () => {
      const { cases, price } = info();
      if (S.balance < price) { toast('Недостаточно средств', 'bad'); openTopUp(); return; }
      battle = makeBattle(cases, size, mode, 0);
      location.hash = '#/battle';
    };
    el.querySelector('.battle-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-join]'); if (!b) return;
      const L = lobbyCache[+b.dataset.join];
      const price = L.cases.reduce((s, id) => s + CASE[id].price, 0);
      if (S.balance < price) { toast('Недостаточно средств', 'bad'); openTopUp(); return; }
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
        <a class="btn ghost sm" href="#/battles">← Батлы</a>
        <div class="h1">${icon('battles')}Батл · ${B.mode === 'crazy' ? 'Crazy' : 'Обычный'}</div>
        <span class="spacer"></span>
        <span class="chip">Банк: <b id="bank" style="color:var(--yellow)">0 ₽</b></span>
        <button class="icon-btn" id="fastBtn" title="Быстро">${icon('bolt')}</button>
      </div>
      <div class="round-cases" id="rounds">${B.cases.map((id, i) => `<div class="rc" data-i="${i}">${caseArt(CASE[id])}<div>${rub(CASE[id].price)}</div></div>`).join('')}</div>
      <div class="players" style="grid-template-columns:repeat(${B.size},minmax(0,1fr))">
        ${B.players.map((p, i) => `
          <div class="pcol" data-p="${i}">
            <div class="phead"><span class="slot-ava ${p.me ? 'me' : 'full'}">${esc(p.name[0].toUpperCase())}</span><span class="nm">${esc(p.name)}</span><span class="tot">0 ₽</span></div>
            <div class="vreel"><div class="waiting">${p.late ? 'Ожидание игрока…' : 'Готов'}</div></div>
            <div class="pdrops"></div>
          </div>`).join('')}
      </div>
      <div id="bEnd" style="display:flex;gap:10px;justify-content:center;margin-top:18px" hidden>
        <button class="btn lg" id="again">Ещё такой же</button><a class="btn lg ghost" href="#/battles">К батлам</a>
      </div>`;
    const fastBtn = $('#fastBtn', el);
    const setFast = () => fastBtn.classList.toggle('on', S.fast);
    fastBtn.onclick = () => { S.fast = !S.fast; save(); setFast(); };
    setFast();
    $('#again', el).onclick = () => {
      if (S.balance < B.price) { toast('Недостаточно средств', 'bad'); return; }
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
        $('.waiting', cols[i]).textContent = 'Готов';
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
        $('.vreel', col).innerHTML = `<div class="waiting">${B.players[i] === winner ? '🏆 Победа<br>' + rub(bank) : 'Проигрыш'}</div>`;
      });
      $('#bEnd', el).hidden = false;
      if (winner.me) { toast(`Ты выиграл батл! +${allDrops.length} предметов на ${rub(bank)}`, 'good'); allDrops.slice(0, 3).forEach((id) => myDrop(id, B.cases[0])); }
      else toast(`Победил ${winner.name}`, 'bad');
    })();
  }

  // ---------- контракты ----------
  function pageContracts(el) {
    const slots = [];
    let busy = false;
    el.innerHTML = `
      <div class="h1">${icon('contracts')}Контракты</div>
      <div class="panel">
        <div class="muted" style="margin-bottom:12px;text-align:center">Положи от 3 до 10 предметов — получишь один скин стоимостью от ×0.25 до ×4 от суммы контракта.</div>
        <div class="con-slots" id="cSlots"></div>
        <div class="con-info">
          <div class="panel"><b id="cSum">0 ₽</b><span>Сумма контракта</span></div>
          <div class="panel"><b id="cMin">0 ₽</b><span>Минимум</span></div>
          <div class="panel"><b id="cMax">0 ₽</b><span>Максимум</span></div>
        </div>
        <div class="reels" id="cReel" hidden><div class="reel"></div></div>
        <button class="btn xl block" id="cGo">Подписать контракт</button>
      </div>
      <div class="title-glow"><span></span>Инвентарь</div>
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
        || `<div class="empty-inv" style="grid-column:1/-1"><b>Нет предметов</b><span>Открой кейс, чтобы было что положить в контракт</span><a class="btn green" href="#/">Открыть кейс</a></div>`;
    }
    el.addEventListener('click', (e) => {
      if (busy) return;
      const a = e.target.closest('[data-add]'), r = e.target.closest('[data-rm]');
      if (a) { if (slots.length >= 10) return toast('Максимум 10 предметов'); slots.push(a.dataset.add); render(); }
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
  function pageProfile(el) {
    const render = () => {
      const invSum = S.inv.reduce((s, it) => s + SKIN[it.id].price, 0);
      el.innerHTML = `
        <div class="panel prof-head">
          <div class="ava">${esc(S.nick[0].toUpperCase())}</div>
          <div style="flex:1;min-width:200px">
            <div class="row"><input class="input" id="nick" maxlength="20" value="${esc(S.nick)}" style="max-width:260px"><button class="btn ghost" id="saveNick">Сохранить</button></div>
            <div class="muted" style="margin-top:6px">Ник показывается в ленте последних дропов</div>
          </div>
          <div><div class="muted">На счету</div><div class="cond" style="font-size:32px;color:var(--yellow)">${rub(S.balance)}</div></div>
        </div>
        <div class="stat-grid">
          <div class="panel"><b>${S.st.opened}</b><span>кейсов открыто</span></div>
          <div class="panel"><b>${S.st.upgWin}/${S.st.upg}</b><span>апгрейдов успешно</span></div>
          <div class="panel"><b>${S.st.battleWin}/${S.st.battles}</b><span>батлов выиграно</span></div>
          <div class="panel"><b>${S.st.contracts}</b><span>контрактов</span></div>
          <div class="panel"><b>${rub(S.cashback)}</b><span>кешбек к выплате (<a href="#/upgrade">забрать</a>)</span></div>
          <div class="panel"><b>${rub(S.st.best)}</b><span>лучший дроп${S.st.bestId ? ': ' + esc(SKIN[S.st.bestId].weapon + ' | ' + SKIN[S.st.bestId].skin) : ''}</span></div>
        </div>
        <div class="row" style="margin:26px 0 14px"><div class="cond" style="font-size:22px">Инвентарь · ${S.inv.length} шт. · ${rub(invSum)}</div><span class="spacer"></span>
          <button class="btn green" id="sellAll" ${S.inv.length ? '' : 'disabled'}>Продать всё за ${rub(invSum)}</button></div>
        <div class="item-grid">${S.inv.map((it) => `<div>${itemHtml(it.id)}<button class="btn ghost sm block" style="margin-top:6px" data-sell="${it.u}">Продать</button></div>`).join('')
          || `<div class="empty-inv" style="grid-column:1/-1"><b>Ваш инвентарь пуст</b><span>Открой свой первый кейс</span><a class="btn green" href="#/">${icon('box')} Открыть кейс</a></div>`}</div>
        <div class="row" style="margin-top:30px"><span class="spacer"></span><button class="btn red sm" id="reset">Сбросить прогресс</button></div>`;
      $('#saveNick', el).onclick = () => { const v = $('#nick', el).value.trim().slice(0, 20); if (v) { S.nick = v; save(); header(); toast('Ник сохранён', 'good'); render(); } };
      $('#sellAll', el).onclick = () => { sell(S.inv.map((x) => x.u)); render(); };
      $('#reset', el).onclick = () => {
        modal('<h3>Сбросить всё?</h3><p class="muted" style="text-align:center">Баланс, инвентарь и статистика обнулятся.</p><div class="actions"><button class="btn ghost" data-x="0">Отмена</button><button class="btn red" data-x="1">Сбросить</button></div>', (bg, close) => {
          bg.addEventListener('click', (e) => {
            const b = e.target.closest('[data-x]'); if (!b) return;
            if (b.dataset.x === '1') { try { localStorage.removeItem('cb2:state'); } catch (err) { /* ignore */ } location.reload(); }
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
    'BEER-20': { desc: '+20% к балансу (от 100 до 500 ₽)', apply: () => { const v = Math.max(100, Math.min(500, Math.round(S.balance * 0.2))); setBalance(S.balance + v); return '+' + rub(v); } },
    'CASEBEER': { desc: '+300 ₽', apply: () => { setBalance(S.balance + 300); return '+300 ₽'; } },
    'LAFORE': { desc: 'случайный нож', apply: () => { const id = pick(KNIVES.filter((k) => SKIN[k].price <= 60000)); addItem(id); myDrop(id, 'knife'); return SKIN[id].weapon + ' | ' + SKIN[id].skin; } },
  };
  function applyPromo(code) {
    code = String(code || '').trim().toUpperCase();
    const p = PROMOS[code];
    if (!p) { toast('Такого промокода нет', 'bad'); return false; }
    if (S.promos.includes(code)) { toast('Промокод уже использован', 'bad'); return false; }
    S.promos.push(code);
    const res = p.apply();
    save();
    toast(`Промокод ${code} активирован: ${res}`, 'good');
    return true;
  }
  function openTopUp() {
    const left = S.bonusAt - Date.now();
    modal(`<h3>Пополнение</h3>
      <p class="muted" style="text-align:center;margin:0 0 14px">Всё на виртуальные рубли — настоящие деньги не принимаются и не выводятся.</p>
      <div class="panel" style="text-align:center;margin-bottom:12px">
        <div class="cond" style="font-size:20px">Бонус <b style="color:var(--yellow)">+500 ₽</b> раз в 30 минут</div>
        <button class="btn green lg" id="claim" style="margin-top:10px" ${left > 0 ? 'disabled' : ''}>${left > 0 ? 'Через ' + clock(left) : 'Забрать +500 ₽'}</button>
      </div>
      <div class="panel"><div class="cond" style="font-size:18px;margin-bottom:8px">Промокод</div>
        <div class="row nowrap" style="flex-wrap:nowrap"><input class="input" id="code" placeholder="Например, BEER-20"><button class="btn" id="codeBtn">OK</button></div></div>`, (bg, close) => {
      $('#claim', bg).onclick = () => {
        if (S.bonusAt > Date.now()) return;
        S.bonusAt = Date.now() + 30 * 60e3;
        setBalance(S.balance + 500);
        toast('+500 ₽ на баланс', 'good');
        close();
      };
      $('#codeBtn', bg).onclick = () => { if (applyPromo($('#code', bg).value)) close(); };
    });
  }

  /* ---------------- шапка и роутер ---------------- */
  const NAV = [['cases', '#/', 'Кейсы'], ['upgrade', '#/upgrade', 'Апгрейд'], ['battles', '#/battles', 'Батлы'], ['contracts', '#/contracts', 'Контракты']];
  function header() {
    $('#nav').innerHTML = NAV.map(([k, href, label]) => `<a href="${href}" data-k="${k}">${icon(k)}${label}</a>`).join('');
    $('#mnav').innerHTML = [...NAV, ['profile', '#/profile', 'Профиль']].map(([k, href, label]) => `<a href="${href}" data-k="${k}">${icon(k)}${label}</a>`).join('');
    $('#ava').textContent = S.nick[0].toUpperCase();
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
    const active = { '': 'cases', case: 'cases', upgrade: 'upgrade', battles: 'battles', battle: 'battles', contracts: 'contracts', profile: 'profile' }[name || ''] || 'cases';
    $$('[data-k]').forEach((a) => a.classList.toggle('active', a.dataset.k === active));
    try {
      if (name === 'case') pageCase(el, arg);
      else if (name === 'upgrade') pageUpgrade(el);
      else if (name === 'battles') pageBattles(el);
      else if (name === 'battle') pageBattle(el);
      else if (name === 'contracts') pageContracts(el);
      else if (name === 'profile') pageProfile(el);
      else pageHome(el);
    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="panel">Что-то пошло не так. Обнови страницу.</div>';
    }
    window.scrollTo(0, 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildSprite();
    header();
    $('#topup').onclick = openTopUp;
    startFeed();
    window.addEventListener('hashchange', route);
    route();
  });
})();
