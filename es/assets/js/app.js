'use strict';
/* =========================================================
   Оболочка: роутер, тема, баланс в шапке, раздел «Разделы»
   ========================================================= */
(() => {
  const { $, $$, h, store, snack, money } = App;

  /* ---------- тема ---------- */
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const pref = store.get('theme', 'system');
    const dark = pref === 'dark' || (pref === 'system' && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#metaTheme').setAttribute('content', dark ? '#17130b' : '#fff8f2');
    $$('[data-action="theme"] .ms').forEach((i) => (i.textContent = dark ? 'light_mode' : 'dark_mode'));
    window.dispatchEvent(new Event('themechange'));
  }
  if (mq) mq.addEventListener('change', applyTheme);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="theme"]')) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    store.set('theme', dark ? 'light' : 'dark');
    applyTheme();
  });

  /* ---------- баланс в шапке ---------- */
  const chip = $('#balanceChip');
  let bumpT = null;
  function renderBalance(cents, delta) {
    $('#balanceText').textContent = money(cents);
    if (delta) {
      chip.classList.add('bump');
      chip.classList.toggle('down', delta < 0);
      clearTimeout(bumpT);
      bumpT = setTimeout(() => chip.classList.remove('bump', 'down'), 260);
    }
  }
  App.wallet.onChange(renderBalance);
  renderBalance(App.wallet.cents);

  /* ---------- раздел «Разделы» + настройки ---------- */
  const SECTIONS = [
    { href: '../Caesar/', name: 'Caesar', desc: 'ROT1-переводчик', icon: 'key', cls: 'c1' },
    { href: '../cb/', name: 'Cases', desc: 'Кейсы', icon: 'inventory_2', cls: 'c2' },
    { href: '../eng/', name: 'PC Version', desc: 'Старая версия для ПК', icon: 'computer', cls: 'c3' },
    { href: '../music/', name: 'VIBEFILTER', desc: 'Убей свои плохие треки', icon: 'music_note', cls: 'c4' },
    { href: '../old/', name: 'Shifr (old)', desc: 'Самая первая версия переводчика', icon: 'history', cls: 'c1' },
    { href: '../rat/', name: 'Раздел с крысой', desc: 'Просто крыса', icon: 'pest_control_rodent', cls: 'c3' },
  ];

  App.route('sections', {
    title: 'Разделы',
    nav: 'sections',
    mount(el) {
      const pref = store.get('theme', 'system');
      el.appendChild(h(`
        <div>
          <div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
            ${SECTIONS.map((s) => `<a class="sec-card ${s.cls}" href="${s.href}">
              <span class="gc-icon"><span class="ms">${s.icon}</span></span>
              <div><b>${s.name}</b><span>${s.desc}</span></div>
              <span class="ms go">chevron_right</span>
            </a>`).join('')}
          </div>

          <h2 class="title-l section-title">Настройки</h2>
          <div class="card flat stack">
            <div>
              <div class="title-s" style="margin-bottom:8px">Тема</div>
              <div class="segmented" id="stTheme">
                <button data-t="system"><span class="ms">check</span>Системная</button>
                <button data-t="light"><span class="ms">check</span>Светлая</button>
                <button data-t="dark"><span class="ms">check</span>Тёмная</button>
              </div>
            </div>
            <div class="row">
              <div style="flex:1;min-width:200px">
                <div class="title-s">Сбросить все данные</div>
                <div class="body-m muted">Прогресс кликера, рекорды и баланс удачи ($10 заново).</div>
              </div>
              <button class="btn outlined sl" id="stReset"><span class="ms">delete</span>Сбросить</button>
            </div>
          </div>
          <div class="footer">Shifr · Material 3 · ☕</div>
        </div>`));
      const sync = (t) => $$('#stTheme button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
      sync(pref);
      $$('#stTheme button', el).forEach((b) => (b.onclick = () => { store.set('theme', b.dataset.t); applyTheme(); sync(b.dataset.t); }));
      $('#stReset', el).onclick = async () => {
        const ok = await App.dialog({
          icon: 'warning', title: 'Сбросить всё?', text: 'Удалятся рекорды, кликер и баланс удачи. Тема и текст переводчика останутся.',
          actions: [{ label: 'Отмена', value: false }, { label: 'Сбросить', value: true, style: 'danger' }],
        });
        if (!ok) return;
        try {
          Object.keys(localStorage).filter((k) => k.startsWith('es:') && !/^es:(theme|tr:)/.test(k)).forEach((k) => localStorage.removeItem(k));
        } catch (e) { /* ignore */ }
        location.reload();
      };
    },
  });

  /* ---------- роутер ---------- */
  const view = $('#view');
  const topbar = $('#topbar');
  const backBtn = $('#backBtn');
  let scope = null;
  let current = null;

  function render() {
    const path = location.hash.replace(/^#\/?/, '') || 'translate';
    const def = App.routes[path] || App.routes.translate;
    if (scope) scope.dispose();
    document.body.classList.remove('immersive');
    scope = App.scope();
    current = def;

    view.innerHTML = '';
    view.style.animation = 'none';
    view.offsetHeight;
    view.style.animation = '';

    $('#pageTitle').textContent = def.title;
    document.title = def.title === 'Shifr' ? 'Shifr — переводчик на секретный язык' : def.title + ' · Shifr';
    backBtn.hidden = !def.back;
    chip.hidden = !(def.luck || path === 'luck');
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === def.nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    try { def.mount(view, scope); }
    catch (e) {
      console.error(e);
      view.appendChild(h('<div class="card filled">Что-то пошло не так 😵 Обнови страницу.</div>'));
    }
    window.scrollTo(0, 0);
  }

  backBtn.onclick = () => { if (current && current.back) location.hash = current.back; };
  window.addEventListener('hashchange', render);
  window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && current.back && !$('.dialog-scrim')) location.hash = current.back;
  });

  App.rerender = render;
  applyTheme();
  render();
})();
