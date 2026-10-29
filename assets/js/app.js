'use strict';
/* =========================================================
   Оболочка: роутер, тема, баланс в шапке, раздел «Разделы»
   ========================================================= */
(() => {
  const { $, $$, h, store, snack, money } = Beer;

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
    if (e.target.closest('[data-action="lang"]')) { L10N.set(lng('en', 'ru')); return; }
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
  Beer.wallet.onChange(renderBalance);
  renderBalance(Beer.wallet.cents);

  /* ---------- раздел «Разделы» + настройки ---------- */
  const SECTIONS = [
    { href: 'Caesar/', name: 'Caesar', desc: lng('ROT1-переводчик', 'ROT1 translator'), icon: 'key', cls: 'c1' },
    { href: 'cb/', name: 'CaseBeer', desc: lng('Кейсы', 'Cases'), icon: 'inventory_2', cls: 'c2' },
    { href: 'eng/', name: 'PC Version', desc: lng('Старая версия для ПК', 'Old version for PC'), icon: 'computer', cls: 'c3' },
    { href: 'music/', name: 'VIBEFILTER', desc: lng('Убей свои плохие треки', 'Kill your bad tracks'), icon: 'music_note', cls: 'c4' },
    { href: 'old/', name: 'Beer Translate (old)', desc: lng('Самая первая версия переводчика', 'The very first version of the translator'), icon: 'history', cls: 'c1' },
    { href: 'rat/', name: lng('Раздел с крысой', 'Rat section'), desc: lng('Просто крыса', 'Just a rat'), icon: 'pest_control_rodent', cls: 'c3' },
    { href: 'rice/', name: 'Rice', desc: lng('Калькулятор риса и переводчик из риса во всё', 'Rice calculator and rice-to-everything converter'), icon: 'rice_bowl', cls: 'c2' },
    { href: 'upgrade/', name: 'Upgrader', desc: lng('Апгрейд скинов CS2 по реальным ценам', 'CS2 skin upgrader with real prices'), icon: 'trending_up', cls: 'c4' },
  ];

  Beer.route('sections', {
    title: lng('Разделы', 'Sections'),
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

          <h2 class="title-l section-title">${lng('Настройки', 'Settings')}</h2>
          <div class="card flat stack">
            <div>
              <div class="title-s" style="margin-bottom:8px">${lng('Язык', 'Language')}</div>
              <div class="segmented" id="stLang">
                <button data-l="ru" aria-pressed="${!L10N.en}"><span class="ms">check</span>Русский</button>
                <button data-l="en" aria-pressed="${L10N.en}"><span class="ms">check</span>English</button>
              </div>
              <div class="body-s muted" style="margin-top:6px">${lng('Язык общий для всего сайта: Rice и CaseBeer тоже откроются на нём.', 'The language is shared across the site: Rice and CaseBeer open in it too.')}</div>
            </div>
            <div>
              <div class="title-s" style="margin-bottom:8px">${lng('Тема', 'Theme')}</div>
              <div class="segmented" id="stTheme">
                <button data-t="system"><span class="ms">check</span>${lng('Системная', 'System')}</button>
                <button data-t="light"><span class="ms">check</span>${lng('Светлая', 'Light')}</button>
                <button data-t="dark"><span class="ms">check</span>${lng('Тёмная', 'Dark')}</button>
              </div>
            </div>
            <div class="row">
              <div style="flex:1;min-width:200px">
                <div class="title-s">${lng('Сбросить все данные', 'Reset all data')}</div>
                <div class="body-m muted">${lng('Прогресс кликера, рекорды и баланс казино ($10 заново).', 'Clicker progress, records and the casino balance (back to $10).')}</div>
              </div>
              <button class="btn outlined sl" id="stReset"><span class="ms">delete</span>${lng('Сбросить', 'Reset')}</button>
            </div>
          </div>
          <div class="footer">Beer Translate · Material 3 · 🍻</div>
        </div>`));
      const sync = (t) => $$('#stTheme button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
      sync(pref);
      $$('#stLang button', el).forEach((b) => (b.onclick = () => L10N.set(b.dataset.l)));
      $$('#stTheme button', el).forEach((b) => (b.onclick = () => { store.set('theme', b.dataset.t); applyTheme(); sync(b.dataset.t); }));
      $('#stReset', el).onclick = async () => {
        const ok = await Beer.dialog({
          icon: 'warning', title: lng('Сбросить всё?', 'Reset everything?'),
          text: lng('Удалятся рекорды, кликер и баланс казино. Тема и текст переводчика останутся.', 'Records, the clicker and the casino balance will be deleted. The theme, language and translator text stay.'),
          actions: [{ label: lng('Отмена', 'Cancel'), value: false }, { label: lng('Сбросить', 'Reset'), value: true, style: 'danger' }],
        });
        if (!ok) return;
        try {
          Object.keys(localStorage).filter((k) => k.startsWith('beer:') && !/^beer:(theme|lang|tr:)/.test(k)).forEach((k) => localStorage.removeItem(k));
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
    const def = Beer.routes[path] || Beer.routes.translate;
    if (scope) scope.dispose();
    document.body.classList.remove('immersive');
    scope = Beer.scope();
    current = def;

    view.innerHTML = '';
    view.style.animation = 'none';
    view.offsetHeight;
    view.style.animation = '';

    $('#pageTitle').textContent = def.title;
    document.title = def.title === 'Beer Translate' ? lng('Beer Translate — переводчик на пивной язык', 'Beer Translate — translator into the beer language') : def.title + ' · Beer Translate';
    backBtn.hidden = !def.back;
    chip.hidden = !(def.casino || path === 'casino');
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === def.nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    try { def.mount(view, scope); }
    catch (e) {
      console.error(e);
      view.appendChild(h(`<div class="card filled">${lng('Что-то пошло не так 😵 Обнови страницу.', 'Something went wrong 😵 Reload the page.')}</div>`));
    }
    window.scrollTo(0, 0);
  }

  backBtn.onclick = () => { if (current && current.back) location.hash = current.back; };
  window.addEventListener('hashchange', render);
  window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && current.back && !$('.dialog-scrim')) location.hash = current.back;
  });

  Beer.rerender = render;
  applyTheme();
  render();
})();
