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

  const store = {
    get(k, d) { try { const v = localStorage.getItem('cb2:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cb2:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  /* ---------------- состояние ---------------- */
  const S = Object.assign({
    balance: 1000,
    inv: [],              // [{ u: uid, id: skinId }]
    nick: 'Игрок' + (1000 + randInt(9000)),
    freeAt: 0,            // когда снова доступен бесплатный кейс
    bonusAt: 0,           // когда снова доступен бонус
    fast: false,
    st: { opened: 0, spent: 0, best: 0, bestId: null, upg: 0, upgWin: 0, battles: 0, battleWin: 0, contracts: 0 },
  }, store.get('state', {}));
  const save = () => store.set('state', S);

  function setBalance(v) {
    const old = S.balance;
    S.balance = Math.max(0, Math.round(v));
    save();
    const b = $('#balance');
    if (!b) return;
    $('#balanceText').textContent = rub(S.balance);
    b.classList.remove('up', 'down');
    if (S.balance !== old) { b.classList.add(S.balance > old ? 'up' : 'down'); setTimeout(() => b.classList.remove('up', 'down'), 500); }
  }
  const addItem = (id) => { const it = { u: uid(), id }; S.inv.unshift(it); noteBest(id); save(); return it; };
  const removeItems = (uids) => { const set = new Set(uids); S.inv = S.inv.filter((x) => !set.has(x.u)); save(); };
  function noteBest(id) { const p = SKIN[id].price; if (p > S.st.best) { S.st.best = p; S.st.bestId = id; } }

  /* ---------------- тосты / модалки ---------------- */
  function toast(msg, kind = '') {
    const t = h(`<div class="toast ${kind}">${esc(msg)}</div>`);
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
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

  /* ---------------- иконки ---------------- */
  const GUN = {
    rifle: 'M2 19 13 15 20 17 56 16 58 13 68 13 70 16 97 16 97 19 70 20 64 22 57 22 55 31 49 35 46 23 33 23 27 31 17 31 22 23 14 25 2 27Z',
    sniper: 'M2 20 15 16 23 18 58 18 98 17 98 20 60 22 50 23 48 31 43 31 41 23 29 23 23 29 15 29 19 23 2 25ZM38 10H64V15H38Z',
    pistol: 'M24 13H80L83 16 81 19H48L46 23H42L40 34H28L30 24 25 22 24 18Z',
    smg: 'M6 17 20 15 24 16 74 15 76 17 90 17 90 20 74 21 61 22 59 32 52 32 52 23 39 23 35 30 27 30 31 23 20 23 6 25Z',
    shotgun: 'M2 19 18 15 28 17 95 16 95 20 61 21 59 25 44 25 42 22 33 22 27 30 17 30 22 23 2 26Z',
    knife: 'M5 22Q9 18 22 18H29L31 15H39L41 18 83 13Q95 13 97 20 91 27 70 27L41 25 39 28H31L29 25H22Q9 25 5 22Z',
    gloves: 'M30 35V19Q30 13 34 13V8Q36 4 39 8V13L41 6Q43 3 45 6V13L47 7Q49 4 51 7V15L54 10Q57 8 58 12L55 25 51 35ZM56 35V22Q56 16 60 16V11Q62 7 65 11V16L67 9Q69 6 71 9V16L73 10Q75 7 77 10V18L80 13Q83 11 84 15L81 28 77 35Z',
  };
  const gunSvg = (type) => `<svg class="gun" viewBox="0 0 100 40" aria-hidden="true"><path d="${GUN[type] || GUN.rifle}" fill="currentColor"/></svg>`;

  function caseSvg(c, cls = 'box') {
    const gid = 'g' + c.id + cls.replace(/\W/g, '');
    return `<svg class="${cls}" viewBox="0 0 140 110" aria-hidden="true">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.color}"/><stop offset="1" stop-color="#1b2440"/></linearGradient></defs>
      <path d="M18 38 70 22 122 38 122 92 70 106 18 92Z" fill="url(#${gid})" opacity=".95"/>
      <path d="M18 38 70 54 122 38 70 22Z" fill="${c.color}"/>
      <path d="M70 54V106" stroke="rgba(0,0,0,.35)" stroke-width="2"/>
      <path d="M18 38 70 54 122 38" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2"/>
      <rect x="58" y="60" width="24" height="14" rx="3" fill="#0b0f1a" opacity=".55"/>
      <text x="70" y="94" text-anchor="middle" font-size="22">${c.icon}</text>
    </svg>`;
  }

  const NAV_ICON = {
    cases: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 7l9-4 9 4v10l-9 4-9-4zm9 2.2L6.6 7 12 4.6 17.4 7zM5 8.6v7.1l6 2.7v-7.2zm8 9.8 6-2.7V8.6l-6 2.6z"/></svg>',
    upgrade: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8m1-13h-2v5.4l-2.3-2.3-1.4 1.4L12 16.2l4.7-4.7-1.4-1.4L13 12.4z" transform="rotate(180 12 12)"/></svg>',
    battles: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.9 2 2 6.9l4 4L3.7 13l1.4 1.4 2.1-2.1 2.4 2.4-2.1 2.1 1.4 1.4 2.3-2.2 1.4 1.4 3.6 3.6 2.8-2.8-3.6-3.6-1.4-1.4 2.2-2.3-1.4-1.4-2.1 2.1-2.4-2.4 2.1-2.1L10.9 6zm10.2 0L13 6l1.4 1.4L17 4.8l2.2 2.2-2.6 2.6L18 11l4-4.1z"/></svg>',
    contracts: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5zM8 12h8v2H8zm0 4h8v2H8z"/></svg>',
    profile: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5m0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5"/></svg>',
  };

  /* ---------------- шансы кейсов ----------------
     Вес предмета ∝ цена^(-a). Параметр a подбирается так,
     чтобы матожидание дропа было ~90% цены кейса. */
  const RTP = 0.9;
  function calibrate(c) {
    const prices = c.items.map((id) => SKIN[id].price);
    const target = c.free ? 25 : c.price * RTP;
    const ev = (a) => { let num = 0, den = 0; prices.forEach((p) => { const w = Math.pow(p, -a); num += w * p; den += w; }); return num / den; };
    let lo = 0, hi = 8, a = 0;
    if (ev(0) <= target) a = 0;
    else if (ev(hi) >= target) a = hi;
    else { for (let i = 0; i < 60; i++) { a = (lo + hi) / 2; if (ev(a) > target) lo = a; else hi = a; } }
    const ws = prices.map((p) => Math.pow(p, -a));
    const sum = ws.reduce((x, y) => x + y, 0);
    c.chances = c.items.map((id, i) => ({ id, p: ws[i] / sum }));
    c.ev = ev(a);
  }
  CASES.forEach(calibrate);
  const CASE = Object.fromEntries(CASES.map((c) => [c.id, c]));
  const PAID = CASES.filter((c) => !c.free);

  function roll(c) {
    let r = rand();
    for (const ch of c.chances) { r -= ch.p; if (r < 0) return ch.id; }
    return c.chances[c.chances.length - 1].id;
  }

  /* ---------------- карточка предмета ---------------- */
  function itemHtml(id, extra = '', attrs = '') {
    const s = SKIN[id];
    return `<div class="item ${extra}" style="--rc:${RARITY[s.rarity].color}" ${attrs}>
      ${gunSvg(s.type)}
      <div class="w">${esc(s.weapon)}</div>
      <div class="s">${esc(s.skin)}</div>
      <div class="p">${rub(s.price)}</div>
    </div>`;
  }

  /* ---------------- лента последних дропов ---------------- */
  const KNIVES = SKINS.filter((s) => s.type === 'knife').map((s) => s.id);
  let liveOpened = 1843000 + randInt(20000);
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
  function pushTicker(d, mine = false) {
    const track = $('#tickerTrack');
    const s = SKIN[d.id];
    const el = h(`<a class="tdrop ${mine ? 'mine' : ''}" href="#/case/${d.caseId}" style="--rc:${RARITY[s.rarity].color}" title="${esc(s.weapon + ' | ' + s.skin)} — ${esc(d.user)}">
      ${gunSvg(s.type)}
      <div class="tn"><b>${esc(s.skin)}</b><span>${esc(d.user)}</span><i>${rub(s.price)}</i></div>
    </a>`);
    track.prepend(el);
    while (track.children.length > 30) track.lastChild.remove();
    liveOpened++;
    const o = $('#statOpened'); if (o) o.textContent = liveOpened.toLocaleString('ru-RU');
  }
  function startTicker() {
    for (let i = 0; i < 18; i++) pushTicker(fakeDrop());
    const loop = () => { pushTicker(fakeDrop()); setTimeout(loop, 1400 + rand() * 2600); };
    setTimeout(loop, 1500);
    let online = 1180 + randInt(300);
    const upd = () => { online = Math.max(900, online + randInt(21) - 10); $('#statOnline').textContent = online.toLocaleString('ru-RU'); };
    upd(); setInterval(upd, 4000);
  }

  /* ---------------- горизонтальная лента открытия ---------------- */
  function spinReel(reel, c, winId, fast) {
    const N = 56, WIN = 48;
    const ids = Array.from({ length: N }, (_, i) => (i === WIN ? winId : roll(c)));
    reel.innerHTML = `<div class="marker"></div><div class="strip">${ids.map((id, i) => itemHtml(id, i === WIN ? 'target' : '')).join('')}</div>`;
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
  function pageHome(el) {
    el.innerHTML = `
      <section class="hero">
        <div class="banner">
          <h2>Открывай кейсы.<br>Апгрейдь. Побеждай.</h2>
          <p>Кейсы с ножами и перчатками, апгрейд до ×20, батлы против игроков и контракты. Всё на виртуальные рубли.</p>
          <div class="row"><a class="btn lg" href="#/case/beer">Открыть кейс</a><a class="btn lg ghost" href="#/upgrade">Апгрейд</a></div>
          ${caseSvg(CASE.dlore, 'big')}
        </div>
        <div class="free-card">
          <div><h3>🎁 Бесплатный кейс</h3><div class="muted">Раз в час — забирай скин бесплатно</div></div>
          <div class="timer" id="freeTimer"></div>
          <a class="btn green block" href="#/case/free">Открыть бесплатно</a>
        </div>
      </section>
      <h2 class="h2">Кейсы</h2>
      <div class="case-grid">${PAID.map(caseCard).join('')}</div>`;
    const t = setInterval(updFree, 1000); updFree();
    onLeave(() => clearInterval(t));
    function updFree() {
      const left = S.freeAt - Date.now();
      $('#freeTimer', el).textContent = left > 0 ? clock(left) : 'Доступен!';
    }
  }
  const clock = (ms) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  function caseCard(c) {
    return `<a class="case" href="#/case/${c.id}" style="--cc:${c.color}">
      ${c.price >= 9999 ? '<span class="tag">Хит</span>' : ''}
      ${caseSvg(c)}
      <div class="name">${esc(c.name)}</div>
      <div class="price">${rub(c.price)}</div>
    </a>`;
  }

  // ---------- кейс ----------
  function pageCase(el, id) {
    const c = CASE[id];
    if (!c) { location.hash = '#/'; return; }
    let count = c.free ? 1 : store.get('count', 1);
    let busy = false;
    el.innerHTML = `
      <div class="case-head" style="--cc:${c.color}">
        ${caseSvg(c)}
        <div>
          <h1>${esc(c.name)}</h1>
          <div class="muted" style="margin-bottom:14px">${c.free ? 'Бесплатно раз в час' : 'Средний дроп ≈ ' + rub(c.ev)}</div>
          <div class="row">
            ${c.free ? '' : `<div class="seg" id="cnt">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">x${n}</button>`).join('')}</div>`}
            <button class="pill" id="fastBtn">⚡ Быстро</button>
          </div>
        </div>
      </div>
      <div class="reels" id="reels"></div>
      <div class="open-bar"><button class="btn lg" id="openBtn"></button></div>
      <h2 class="h2">Содержимое кейса</h2>
      <div class="item-grid small">${c.chances.slice().sort((a, b) => SKIN[b.id].price - SKIN[a.id].price).map((ch) => itemHtml(ch.id, '', '').replace('<div class="w">', `<span class="ch">${(ch.p * 100).toFixed(ch.p < 0.01 ? 3 : 2)}%</span><div class="w">`)).join('')}</div>`;

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
        btn.textContent = left > 0 ? 'Доступно через ' + clock(left) : 'Открыть бесплатно';
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
      won.forEach((it) => pushTicker({ user: S.nick, id: it.id, caseId: c.id }, true));
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
        <button class="btn ghost" data-a="upg">В апгрейд</button>
        <button class="btn ghost" data-a="keep">Забрать</button>
      </div>`, (bg, close) => {
      bg.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'sell') { sell(items.map((x) => x.u)); }
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
  const MAX_CHANCE = 0.75, HOUSE = 0.95;
  function pageUpgrade(el) {
    const sel = new Set((upgPreselect || []).filter((u) => S.inv.some((x) => x.u === u)));
    upgPreselect = null;
    let addBal = 0, target = null, busy = false, rot = 0, q = '';
    el.innerHTML = `
      <h1 class="h1">Апгрейд</h1>
      <div class="upg-top">
        <div class="panel upg-slot"><div class="row"><b>Твои предметы</b><span class="spacer"></span><span class="muted" id="stakeSum"></span></div><div class="slot-body" id="srcBox"></div>
          <div class="row"><input class="input" id="addBal" type="number" min="0" step="1" placeholder="+ баланс к ставке, ₽" style="flex:1"></div></div>
        <div class="panel upg-wheel">
          <div class="wheel" id="wheel">
            <svg viewBox="0 0 300 300"><circle cx="150" cy="150" r="128" fill="none" stroke="#232e52" stroke-width="22"/><path id="arc" fill="none" stroke="#2fd67b" stroke-width="22" stroke-linecap="butt"/><circle cx="150" cy="150" r="104" fill="#10162a"/></svg>
            <svg class="arrow" id="arrow" viewBox="0 0 300 300"><path d="M150 4 162 30 150 24 138 30Z" fill="#ff9f1a"/></svg>
            <div class="center"><b id="chance">0%</b><span>шанс</span></div>
          </div>
          <button class="btn lg block" id="upgBtn">Апгрейд</button>
        </div>
        <div class="panel upg-slot"><div class="row"><b>Цель</b><span class="spacer"></span><span class="muted" id="tgtMult"></span></div><div class="slot-body" id="tgtBox"></div>
          <div class="mult-row" id="mults">${[1.5, 2, 3, 5, 10, 20].map((m) => `<button class="pill" data-m="${m}">×${m}</button>`).join('')}</div></div>
      </div>
      <div class="cols-2">
        <div class="panel"><div class="row" style="margin-bottom:10px"><b>Инвентарь</b><span class="spacer"></span><span class="muted">до 6 предметов</span></div><div class="scroll-box"><div class="item-grid small" id="invGrid"></div></div></div>
        <div class="panel"><div class="row" style="margin-bottom:10px"><b>Выбери цель</b><span class="spacer"></span><input class="search" id="q" placeholder="Поиск скина"></div><div class="scroll-box"><div class="item-grid small" id="tgtGrid"></div></div></div>
      </div>`;

    const stake = () => [...sel].reduce((s, u) => { const it = S.inv.find((x) => x.u === u); return s + (it ? SKIN[it.id].price : 0); }, 0) + addBal;
    const chance = () => (target ? Math.min(MAX_CHANCE, (stake() / SKIN[target].price) * HOUSE) : 0);

    function drawArc(p) {
      const arc = $('#arc', el);
      if (p <= 0) { arc.setAttribute('d', ''); return; }
      const a = Math.min(p, 0.9999) * Math.PI * 2;
      const r = 128, cx = 150, cy = 150;
      const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
      arc.setAttribute('d', `M ${cx} ${cy - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x} ${y}`);
    }

    function render() {
      const inv = S.inv;
      $('#invGrid', el).innerHTML = inv.length ? inv.map((it) => itemHtml(it.id, 'click' + (sel.has(it.u) ? ' sel' : ''), `data-u="${it.u}"`)).join('') : '<div class="muted">Инвентарь пуст — открой кейс</div>';
      const chosen = inv.filter((x) => sel.has(x.u));
      $('#srcBox', el).innerHTML = chosen.length
        ? (chosen.length === 1 ? itemHtml(chosen[0].id) : `<div class="stack">${chosen.map((x) => itemHtml(x.id)).join('')}</div>`)
        : (addBal ? `<div class="empty"><b style="font-size:22px;color:var(--accent2)">${rub(addBal)}</b><br>с баланса</div>` : '<div class="empty">Выбери предметы из инвентаря<br>или добавь баланс</div>');
      $('#stakeSum', el).textContent = stake() ? rub(stake()) : '';
      const st = stake();
      if (target && SKIN[target].price <= st) target = null;
      $('#tgtBox', el).innerHTML = target ? itemHtml(target) : '<div class="empty">Выбери предмет,<br>который хочешь получить</div>';
      $('#tgtMult', el).textContent = target && st ? '×' + (SKIN[target].price / st).toFixed(2) : '';
      const list = SKINS.filter((s) => s.price > st && (!q || (s.weapon + ' ' + s.skin).toLowerCase().includes(q))).sort((a, b) => a.price - b.price);
      $('#tgtGrid', el).innerHTML = list.map((s) => itemHtml(s.id, 'click' + (s.id === target ? ' sel' : ''), `data-t="${s.id}"`)).join('') || '<div class="muted">Ничего не найдено</div>';
      const ch = chance();
      $('#chance', el).textContent = (ch * 100).toFixed(2) + '%';
      drawArc(ch);
      $('#upgBtn', el).disabled = busy || !target || !st;
    }

    $('#invGrid', el).addEventListener('click', (e) => {
      const it = e.target.closest('[data-u]'); if (!it || busy) return;
      const u = it.dataset.u;
      if (sel.has(u)) sel.delete(u); else { if (sel.size >= 6) return toast('Максимум 6 предметов'); sel.add(u); }
      render();
    });
    $('#tgtGrid', el).addEventListener('click', (e) => { const it = e.target.closest('[data-t]'); if (!it || busy) return; target = it.dataset.t; render(); });
    $('#mults', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b || busy) return;
      const st = stake(); if (!st) return toast('Сначала выбери ставку');
      const want = st * +b.dataset.m;
      const cand = SKINS.filter((s) => s.price > st).sort((a, c) => Math.abs(a.price - want) - Math.abs(c.price - want))[0];
      if (cand) { target = cand.id; render(); }
    });
    $('#addBal', el).addEventListener('input', (e) => { addBal = Math.max(0, Math.min(S.balance, Math.floor(+e.target.value || 0))); render(); });
    $('#q', el).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); render(); });

    $('#upgBtn', el).onclick = async () => {
      if (busy || !target) return;
      const st = stake();
      if (!st) return;
      if (addBal > S.balance) return toast('Недостаточно средств', 'bad');
      const ch = chance();
      const win = rand() < ch;
      busy = true;
      // списываем ставку сразу — результат определён заранее
      const used = [...sel];
      removeItems(used);
      setBalance(S.balance - addBal);
      S.st.upg++;
      let wonItem = null;
      if (win) { wonItem = addItem(target); S.st.upgWin++; }
      save();
      const wheel = $('#wheel', el);
      wheel.classList.remove('win', 'lose');
      const deg = win ? rand() * ch * 360 : ch * 360 + rand() * (360 - ch * 360);
      rot = Math.ceil(rot / 360) * 360 + 360 * 6 + deg;
      const arrow = $('#arrow', el);
      arrow.style.transition = `transform ${S.fast ? 1.5 : 5}s cubic-bezier(.12,.75,.1,1)`;
      arrow.style.transform = `rotate(${rot}deg)`;
      $('#upgBtn', el).disabled = true;
      await sleep((S.fast ? 1.5 : 5) * 1000 + 150);
      wheel.classList.add(win ? 'win' : 'lose');
      sel.clear(); addBal = 0; $('#addBal', el).value = '';
      busy = false;
      if (win) { toast(`Апгрейд успешен: ${SKIN[target].weapon} | ${SKIN[target].skin}`, 'good'); pushTicker({ user: S.nick, id: target, caseId: 'high' }, true); }
      else toast('Не повезло — апгрейд не удался', 'bad');
      if (win) sel.add(wonItem.u);
      target = null;
      render();
    };
    // ушёл со страницы посреди анимации — результат уже записан
    onLeave(() => {});
    render();
  }

  // ---------- батлы ----------
  let battle = null;
  function makeBattle(cases, size, mode, botsJoined) {
    return { cases, size, mode, players: [{ name: S.nick, me: true }, ...Array.from({ length: botsJoined }, () => ({ name: pick(USERS.filter((u) => u !== 'lafore')) }))], price: cases.reduce((s, id) => s + CASE[id].price, 0) };
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
      <h1 class="h1">Кейс-батлы</h1>
      <div class="panel" style="margin-bottom:18px">
        <div class="row" style="margin-bottom:14px">
          <b>Создать батл</b><span class="spacer"></span>
          <div class="seg" id="bSize">${[2, 3, 4].map((n) => `<button data-n="${n}">${n} игрока</button>`).join('')}</div>
          <div class="seg" id="bMode"><button data-m="normal">Обычный</button><button data-m="crazy">Crazy</button></div>
        </div>
        <div class="picker" id="bPicker">${PAID.map((c) => `<div class="pick-case" data-c="${c.id}">${caseSvg(c)}<div class="nm">${esc(c.name)}</div><div class="pr">${rub(c.price)}</div><div class="cnt"><button data-d="-1">−</button><b>0</b><button data-d="1">+</button></div></div>`).join('')}</div>
        <div class="row" style="margin-top:14px"><span class="muted" id="bInfo"></span><span class="spacer"></span><button class="btn lg" id="bCreate">Создать</button></div>
        <div class="muted" style="font-size:13px;margin-top:8px">Все игроки открывают одни и те же кейсы. Победитель забирает все предметы. В режиме Crazy побеждает тот, у кого сумма меньше.</div>
      </div>
      <h2 class="h2">Активные батлы</h2>
      <div class="battle-list">${lobbyCache.map((b, i) => `
        <div class="bl-row">
          <div><b>${esc(b.host)}</b><div class="muted" style="font-size:12px">${b.cases.length} раунд(а) · ${b.mode === 'crazy' ? 'Crazy' : 'Обычный'}</div></div>
          <div class="bl-cases">${b.cases.map((id) => caseSvg(CASE[id], 'mini-case')).join('')}</div>
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
    while (B.players.length < B.size) B.players.push({ name: pick(USERS.filter((u) => u !== 'lafore' && !B.players.some((p) => p.name === u))), bot: true, late: true });
    B.players.forEach((p) => { p.drops = B.cases.map((cid) => roll(CASE[cid])); p.total = p.drops.reduce((s, id) => s + SKIN[id].price, 0); });
    const best = B.mode === 'crazy' ? Math.min(...B.players.map((p) => p.total)) : Math.max(...B.players.map((p) => p.total));
    const tied = B.players.filter((p) => p.total === best);
    const winner = pick(tied);
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
        <h1 class="h1" style="margin:0">Батл · ${B.mode === 'crazy' ? 'Crazy' : 'Обычный'}</h1>
        <span class="spacer"></span>
        <span class="pill">Банк: <b id="bank" style="color:var(--accent2)">0 ₽</b></span>
        <button class="pill" id="fastBtn">⚡ Быстро</button>
      </div>
      <div class="round-cases" id="rounds">${B.cases.map((id, i) => `<div class="rc" data-i="${i}">${caseSvg(CASE[id])}<div>${rub(CASE[id].price)}</div></div>`).join('')}</div>
      <div class="players" id="players" style="grid-template-columns:repeat(${B.size},minmax(0,1fr));margin-top:12px">
        ${B.players.map((p, i) => `
          <div class="pcol" data-p="${i}">
            <div class="phead"><span class="slot-ava ${p.me ? 'me' : 'full'}">${esc(p.name[0].toUpperCase())}</span><span class="nm">${esc(p.name)}</span><span class="tot">0 ₽</span></div>
            <div class="vreel"><div class="waiting">${p.late ? 'Ожидание игрока…' : 'Готов'}</div></div>
            <div class="pdrops"></div>
          </div>`).join('')}
      </div>
      <div class="actions" id="bEnd" style="display:flex;gap:10px;justify-content:center;margin-top:18px" hidden>
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
      // боты подключаются
      for (let i = 0; i < B.players.length; i++) {
        if (!B.players[i].late) continue;
        await sleep(500 + rand() * 600); if (!alive) return;
        $('.waiting', cols[i]).textContent = 'Готов';
      }
      for (const n of [3, 2, 1]) {
        cols.forEach((c) => { $('.waiting', c).innerHTML = `<span class="countdown">${n}</span>`; });
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
        $('.vreel', col).innerHTML = `<div class="waiting" style="font-size:20px">${B.players[i] === winner ? '🏆 Победа<br><span style="font-size:14px">' + rub(bank) + '</span>' : 'Проигрыш'}</div>`;
      });
      $('#bEnd', el).hidden = false;
      if (winner.me) { toast(`Ты выиграл батл! +${allDrops.length} предметов на ${rub(bank)}`, 'good'); allDrops.slice(0, 3).forEach((id) => pushTicker({ user: S.nick, id, caseId: B.cases[0] }, true)); }
      else toast(`Победил ${winner.name}`, 'bad');
    })();
  }

  // ---------- контракты ----------
  function pageContracts(el) {
    const slots = [];
    let busy = false;
    el.innerHTML = `
      <h1 class="h1">Контракты</h1>
      <div class="panel">
        <div class="muted" style="margin-bottom:12px">Положи от 3 до 10 предметов — получишь один скин стоимостью от ×0.25 до ×4 от суммы контракта.</div>
        <div class="con-slots" id="cSlots"></div>
        <div class="con-info">
          <div class="panel"><b id="cSum">0 ₽</b><span>Сумма контракта</span></div>
          <div class="panel"><b id="cMin">0 ₽</b><span>Минимум</span></div>
          <div class="panel"><b id="cMax">0 ₽</b><span>Максимум</span></div>
        </div>
        <div class="reels" id="cReel" hidden><div class="reel"></div></div>
        <button class="btn lg block" id="cGo">Подписать контракт</button>
      </div>
      <h2 class="h2">Инвентарь</h2>
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
      $('#cInv', el).innerHTML = S.inv.filter((x) => !slots.includes(x.u)).map((it) => itemHtml(it.id, 'click', `data-add="${it.u}"`)).join('') || '<div class="muted">Нет предметов — открой кейс</div>';
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
      // множитель: 78% — от ×0.25 до ×1, 22% — от ×1 до ×4 (лог-равномерно) → в среднем ~×0.9
      const m = rand() < 0.78 ? Math.pow(4, rand()) / 4 : Math.pow(4, rand());
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
          <div class="avatar">${esc(S.nick[0].toUpperCase())}</div>
          <div style="flex:1;min-width:200px">
            <div class="row"><input class="input" id="nick" maxlength="20" value="${esc(S.nick)}" style="max-width:260px"><button class="btn ghost" id="saveNick">Сохранить</button></div>
            <div class="muted" style="margin-top:6px">Ник показывается в ленте последних дропов</div>
          </div>
          <div><div class="muted">Баланс</div><div style="font-size:26px;font-weight:900">${rub(S.balance)}</div></div>
        </div>
        <div class="stat-grid">
          <div class="panel"><b>${S.st.opened}</b><span>кейсов открыто</span></div>
          <div class="panel"><b>${S.st.upgWin}/${S.st.upg}</b><span>апгрейдов успешно</span></div>
          <div class="panel"><b>${S.st.battleWin}/${S.st.battles}</b><span>батлов выиграно</span></div>
          <div class="panel"><b>${S.st.contracts}</b><span>контрактов</span></div>
          <div class="panel"><b>${rub(S.st.best)}</b><span>лучший дроп${S.st.bestId ? ': ' + esc(SKIN[S.st.bestId].weapon + ' | ' + SKIN[S.st.bestId].skin) : ''}</span></div>
        </div>
        <div class="row" style="margin:24px 0 14px"><h2 class="h2" style="margin:0">Инвентарь · ${S.inv.length} шт. · ${rub(invSum)}</h2><span class="spacer"></span>
          <button class="btn green" id="sellAll" ${S.inv.length ? '' : 'disabled'}>Продать всё за ${rub(invSum)}</button></div>
        <div class="item-grid">${S.inv.map((it) => `<div>${itemHtml(it.id)}<button class="btn ghost sm block" style="margin-top:6px" data-sell="${it.u}">Продать</button></div>`).join('') || '<div class="muted">Пусто. <a href="#/">Открой кейс</a></div>'}</div>
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

  // ---------- пополнение (виртуальное) ----------
  function openTopUp() {
    const left = S.bonusAt - Date.now();
    modal(`<h3>Пополнение баланса</h3>
      <p class="muted" style="text-align:center;margin:0 0 6px">Здесь всё на виртуальные рубли — настоящие деньги не принимаются и не выводятся.</p>
      <p style="text-align:center;margin:0">Бонус <b style="color:var(--accent2)">+500 ₽</b> можно забирать раз в 30 минут.</p>
      <div class="actions"><button class="btn green lg" id="claim" ${left > 0 ? 'disabled' : ''}>${left > 0 ? 'Через ' + clock(left) : 'Забрать +500 ₽'}</button></div>`, (bg, close) => {
      $('#claim', bg).onclick = () => {
        if (S.bonusAt > Date.now()) return;
        S.bonusAt = Date.now() + 30 * 60e3;
        setBalance(S.balance + 500);
        toast('+500 ₽ на баланс', 'good');
        close();
      };
    });
  }

  /* ---------------- шапка и роутер ---------------- */
  const NAV = [['cases', '#/', 'Кейсы'], ['upgrade', '#/upgrade', 'Апгрейд'], ['battles', '#/battles', 'Батлы'], ['contracts', '#/contracts', 'Контракты']];
  function header() {
    $('#nav').innerHTML = NAV.map(([k, href, label]) => `<a href="${href}" data-k="${k}">${NAV_ICON[k]}${label}</a>`).join('');
    $('#mnav').innerHTML = [...NAV, ['profile', '#/profile', 'Профиль']].map(([k, href, label]) => `<a href="${href}" data-k="${k}">${NAV_ICON[k]}${label}</a>`).join('');
    $('#avatar').textContent = S.nick[0].toUpperCase();
    $('#balanceText').textContent = rub(S.balance);
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
    header();
    $('#topup').onclick = openTopUp;
    startTicker();
    window.addEventListener('hashchange', route);
    route();
  });
})();
