'use strict';
/* =========================================================
   Язык сайта: один на главную, Rice и CaseBeer.
   Хранится в localStorage (beer:lang), ?lang=ru|en в ссылке
   переключает и запоминает, иначе берётся язык браузера.
   lng('Текст', 'Text') — строка на текущем языке.
   В HTML русский текст по умолчанию, английский — в атрибутах
   data-en (текст), data-en-html, data-en-title, data-en-aria,
   data-en-placeholder.
   ========================================================= */
(() => {
  const KEY = 'beer:lang';
  const ok = (l) => l === 'ru' || l === 'en';
  let lang = null;
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (ok(q)) { lang = q; localStorage.setItem(KEY, JSON.stringify(q)); }
  } catch (e) { /* ignore */ }
  if (!lang) {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (ok(s)) lang = s; } catch (e) { /* ignore */ }
  }
  if (!lang) lang = /^(ru|be|uk|kk)\b/i.test(navigator.language || '') ? 'ru' : 'en';
  document.documentElement.lang = lang;

  const en = lang === 'en';
  window.lng = (ru, enText) => (en ? enText : ru);

  function apply(root = document) {
    if (!en) return;
    root.querySelectorAll('[data-en]').forEach((el) => { el.textContent = el.dataset.en; });
    root.querySelectorAll('[data-en-html]').forEach((el) => { el.innerHTML = el.dataset.enHtml; });
    root.querySelectorAll('[data-en-title]').forEach((el) => { el.title = el.dataset.enTitle; });
    root.querySelectorAll('[data-en-aria]').forEach((el) => { el.setAttribute('aria-label', el.dataset.enAria); });
    root.querySelectorAll('[data-en-placeholder]').forEach((el) => { el.placeholder = el.dataset.enPlaceholder; });
    const t = document.querySelector('meta[name="description"][data-en-content]');
    if (t) t.setAttribute('content', t.dataset.enContent);
    const title = document.querySelector('title[data-en]');
    if (title) document.title = title.dataset.en;
  }

  window.L10N = {
    lang,
    en,
    locale: en ? 'en-US' : 'ru-RU',
    apply,
    // меняем язык и перезагружаем страницу: всё сразу рисуется заново на нужном языке
    set(l) {
      if (!ok(l) || l === lang) return;
      try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* ignore */ }
      try {
        const u = new URL(location.href);
        u.searchParams.delete('lang');
        history.replaceState(null, '', u);
      } catch (e) { /* ignore */ }
      location.reload();
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply());
  else apply();
})();
