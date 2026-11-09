document.addEventListener('submit', event => {
  event.preventDefault();
  alert('Форма недоступна в автономной копии.');
});
document.addEventListener('click', event => {
  if (!event.target.closest('button[data-offline], a[data-offline]')) return;
  const banner = event.target.closest('[data-cookie-banner]');
  if (banner) { banner.remove(); return; }
  event.preventDefault();
  alert('Действие недоступно в автономной копии.');
});
