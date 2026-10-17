'use strict';
// без lang.js (старая страница из кэша) — всё по-русски
if (!window.L10N) { window.lng = (ru) => ru; window.L10N = { lang: 'ru', en: false, locale: 'ru-RU', apply() {}, set() {} }; }
/* =========================================================
   Ядро: хранилище, утилиты, снекбар, диалоги, роутинг-реестр
   ========================================================= */
const Beer = (window.Beer = {
  routes: {},
  casino: {},
});

Beer.$ = (sel, root = document) => root.querySelector(sel);
Beer.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- localStorage (всё в try/catch: приватный режим и т.п.) ---------- */
Beer.store = {
  get(key, def) {
    try {
      const raw = localStorage.getItem('beer:' + key);
      return raw == null ? def : JSON.parse(raw);
    } catch (e) { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('beer:' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  },
  del(key) {
    try { localStorage.removeItem('beer:' + key); } catch (e) { /* ignore */ }
  },
};

/* ---------- DOM ---------- */
Beer.h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
Beer.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- случайность (crypto, если есть) ---------- */
Beer.rand = () => {
  if (window.crypto && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
};
Beer.randInt = (n) => Math.floor(Beer.rand() * n);
Beer.shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Beer.randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
Beer.pickWeighted = (items, weightOf) => {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let r = Beer.rand() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
};

/* ---------- форматирование ---------- */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
Beer.fmt = (n) => {
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) < 1000) return (Math.round(n * 10) / 10).toLocaleString(L10N.locale);
  let i = 0;
  while (Math.abs(n) >= 1000 && i < SUFFIXES.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + SUFFIXES[i];
};
Beer.money = (cents) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1e7) return '$' + Beer.fmt(v);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
Beer.time = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
};

/* ---------- снекбар ---------- */
let snackTimer = null;
Beer.snack = (text, opts = {}) => {
  const bar = Beer.$('#snackbar');
  Beer.$('#snackText').textContent = text;
  Beer.$$('.btn', bar).forEach((b) => b.remove());
  if (opts.action) {
    const b = Beer.h(`<button class="btn text sl">${Beer.esc(opts.action)}</button>`);
    b.onclick = () => { bar.classList.remove('show'); opts.onAction && opts.onAction(); };
    bar.appendChild(b);
  }
  bar.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => bar.classList.remove('show'), opts.duration || 3000);
};

/* ---------- диалог ---------- */
Beer.dialog = ({ icon, title, text, html, actions = [{ label: 'OK', value: true }] }) =>
  new Promise((resolve) => {
    const scrim = Beer.h(`
      <div class="dialog-scrim">
        <div class="dialog ${icon ? 'center' : ''}" role="dialog" aria-modal="true">
          ${icon ? `<span class="ms d-icon">${icon}</span>` : ''}
          <h2>${Beer.esc(title)}</h2>
          ${text ? `<p>${Beer.esc(text)}</p>` : ''}
          ${html || ''}
          <div class="actions"></div>
        </div>
      </div>`);
    const close = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };
    actions.forEach((a) => {
      const b = Beer.h(`<button class="btn ${a.style || 'text'} sl">${Beer.esc(a.label)}</button>`);
      b.onclick = () => close(a.value);
      Beer.$('.actions', scrim).appendChild(b);
    });
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(undefined); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(scrim);
    const last = Beer.$$('.actions .btn', scrim).pop();
    if (last) last.focus();
  });

/* ---------- конфетти ---------- */
Beer.confetti = (count = 60) => {
  const colors = ['#f5bd48', '#7a5900', '#4a6547', '#e53935', '#1e88e5', '#ffdea6', '#8e24aa'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Beer.rand() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.6 + Beer.rand() * 1.8 + 's';
    c.style.animationDelay = Beer.rand() * 0.4 + 's';
    c.style.transform = `rotate(${Beer.rand() * 360}deg)`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
};

/* ---------- всплывающая надпись в игровой сцене ---------- */
Beer.pop = (container, text, kind = 'win') => {
  const el = Beer.h(`<div class="result-pop ${kind}">${Beer.esc(text)}</div>`);
  container.appendChild(el);
  setTimeout(() => el.remove(), 950);
};

/* ---------- цвета из темы для canvas ---------- */
Beer.color = (name) => getComputedStyle(document.documentElement).getPropertyValue('--md-' + name).trim();

/* ---------- ripple ---------- */
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .icon-btn, .fab, .chip, .game-card, .segmented button, .tabs button, .shop-item, .flag-opts button, .sec-card');
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const rip = document.createElement('span');
  rip.className = 'ripple';
  rip.style.width = rip.style.height = size + 'px';
  rip.style.left = e.clientX - r.left - size / 2 + 'px';
  rip.style.top = e.clientY - r.top - size / 2 + 'px';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.style.isolation = 'isolate';
  el.appendChild(rip);
  setTimeout(() => rip.remove(), 600);
});

/* ---------- регистрация страниц ----------
   def: { title, nav, back, immersive, mount(el) -> cleanup? } */
Beer.route = (path, def) => { Beer.routes[path] = def; };

/* Интервалы/таймеры, которые автоматически чистятся при уходе со страницы */
Beer.scope = () => {
  const fns = [];
  return {
    interval(fn, ms) { const id = setInterval(fn, ms); fns.push(() => clearInterval(id)); return id; },
    timeout(fn, ms) { const id = setTimeout(fn, ms); fns.push(() => clearTimeout(id)); return id; },
    raf(fn) {
      let id, alive = true;
      const loop = (t) => { if (!alive) return; fn(t); id = requestAnimationFrame(loop); };
      id = requestAnimationFrame(loop);
      fns.push(() => { alive = false; cancelAnimationFrame(id); });
    },
    on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); fns.push(() => target.removeEventListener(ev, fn, opt)); },
    add(fn) { fns.push(fn); },
    dispose() { while (fns.length) { try { fns.pop()(); } catch (e) { console.error(e); } } },
  };
};
