const search = document.querySelector('#search');
const weapon = document.querySelector('#weapon');
const rarity = document.querySelector('#rarity');
const cards = document.querySelector('#cards');
const template = document.querySelector('#card');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const pageSize = 48;
let page = 0;

function addOptions(select, values) {
  for (const value of [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b))) {
    select.add(new Option(value, value));
  }
}

addOptions(weapon, SKINS.map(skin => skin.weapon));
addOptions(rarity, SKINS.map(skin => skin.rarity));

function render() {
  const terms = search.value.toLowerCase().split(/[\s|]+/).filter(Boolean);
  const matching = SKINS.filter(skin =>
    (!weapon.value || skin.weapon === weapon.value) &&
    (!rarity.value || skin.rarity === rarity.value) &&
    terms.every(term => skin.search.includes(term))
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  page = Math.min(page, pageCount - 1);
  const fragment = document.createDocumentFragment();
  for (const skin of matching.slice(page * pageSize, (page + 1) * pageSize)) {
    const card = template.content.cloneNode(true);
    const image = card.querySelector('img');
    if (skin.image) {
      image.src = skin.image;
      image.alt = skin.name;
      image.loading = 'lazy';
      image.decoding = 'async';
    } else {
      image.remove();
    }
    card.querySelector('article').style.setProperty('--rarity', skin.color);
    card.querySelector('h2').textContent = skin.name;
    card.querySelector('p').textContent = [skin.rarity, skin.stattrak && 'StatTrak™', skin.souvenir && 'Souvenir'].filter(Boolean).join(' · ');
    fragment.append(card);
  }
  cards.replaceChildren(fragment);
  document.querySelector('#status').textContent = 'Найдено: ' + matching.length.toLocaleString('ru');
  document.querySelector('#page').textContent = (page + 1) + ' / ' + pageCount;
  previous.disabled = page === 0;
  next.disabled = page + 1 >= pageCount;
}

function reset() {
  page = 0;
  render();
}

search.addEventListener('input', reset);
weapon.addEventListener('change', reset);
rarity.addEventListener('change', reset);
previous.addEventListener('click', () => { page--; render(); cards.scrollIntoView(); });
next.addEventListener('click', () => { page++; render(); cards.scrollIntoView(); });
render();
