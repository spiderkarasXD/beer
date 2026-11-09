const game = document.querySelector('#game');
const wallet = document.querySelector('#wallet');
const testing = new URLSearchParams(location.search).get('test') === '1';
const storageKey = testing ? 'beer-csr-test-v1' : 'beer-csr-v1';
document.querySelector('#csr-test-panel').hidden = !testing;
document.querySelector('#csr-test-link').hidden = testing;
const coin = '<img class="caser-coin" src="../assets/coin-01a962a66455ca.svg" alt="монет">';
const cents = value => Math.round(value * 100) / 100;
const market = new Map(CASER_DATA.items.map(item => [item.id, {...item,price:cents(item.price)}]));
const originals = new Map(ORIGINAL_CARDS.map(item => [item.name,item]));
const catalog = [...new Set([...CASER_DATA.shop, ...market.keys()])].map(id => market.get(id));
const skins = new Map(market);
const listed = new Map();
for (const item of catalog) {
  if (item.baseId && !listed.has(item.baseId)) listed.set(item.baseId,item);
}
for (const skin of SKINS) {
  const current = listed.get(skin.id);
  skins.set(skin.id,{...skin,price:current?.price ?? null});
}
for (const skin of ORIGINAL_CARDS) skins.set(skin.id,skin);
const cases = CASER_DATA.cases.map(box => ({...box,image:box.image || market.get(box.pool.at(-1)?.[0])?.image}));
const fresh = {balance:testing ? 100000 : 0, clicks:0, opened:0, attempts:0, inventory:[], claims:[], draws:{}, turbo:false, sound:true};
function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Array.isArray(saved.inventory) && Array.isArray(saved.claims)) {
      const seen = new Set();
      const inventory = saved.inventory.filter(entry => entry && typeof entry.id === 'string' &&
        skins.has(entry.skin) && !seen.has(entry.id) && seen.add(entry.id));
      return {...fresh,...saved,draws:saved.draws && typeof saved.draws==='object' ? saved.draws : {},inventory,balance:Number.isFinite(saved.balance) && saved.balance > 0 ? cents(saved.balance) : 0};
    }
  } catch {}
  return {...fresh,inventory:[],claims:[],draws:{}};
}
let state = readState();
const drawTimes = {hourly:3600000,daily:86400000,weekly:604800000};
function dayKey() {
  const now = new Date();
  return [now.getFullYear(),now.getMonth()+1,now.getDate()].join('-');
}
const coinValue = value => number(value) + ' ' + coin;
const nav = '<nav class="game-nav"><a href="#inventory">Инвентарь</a><a href="#cases">Кейсы</a><a href="#upgrade">Апгрейды</a><a href="#rewards">Награды</a><a href="skins/index.html">Скины</a></nav>';
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const img = skin => !skin?.image ? '' : '<img loading="lazy" src="' + escape(skin.image.startsWith('../') ? skin.image : 'skins/' + skin.image) + '" alt="' + escape(skin.name) + '">';
const number = n => n.toLocaleString('ru',{minimumFractionDigits:2,maximumFractionDigits:2});
const route = () => ['cases','inventory','rewards'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'upgrade';
const announce = message => { game.querySelector('.message').textContent = message; };
let target = '';
let selected = '';
const upgradeItems = new Set();
let caseQuantity = 1;
let caseResults = [];
let stake = 0;
let page = 0;
let search = '';
let minimum = '';
let maximum = '';
let ascending = true;
let rolling = false;
let busy = false;
let mystery = false;
let mysteryGoal = '';
let mysteryStake = '';
let ownedAscending = true;
let mobileList = 'desired';
let selectedCase = '';
let caseFilter = '';
let storageFailed = false;

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { storageFailed = true; }
}

function tile(skin, action, id = skin.id, active = false) {
  if(game.classList.contains('essential-game')) {
    const [, base, wear] = skin.name.match(/^(.*?)(?: \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\))?$/);
    const [weapon,...finish]=base.split(' | ');
    const codes={'Factory New':'FN','Minimal Wear':'MW','Field-Tested':'FT','Well-Worn':'WW','Battle-Scarred':'BS'};
    const values={ACTION:action,ID:id,COLOR:skin.color || '#83d8ff',
      IMAGE:skin.image ? (skin.image.startsWith('../') ? skin.image : 'skins/'+skin.image) : '../assets/case-logo-f3efae2cb1a3df.webp',
      NAME:skin.name,PRICE:skin.price==null?'Без цены':number(skin.price),WEAR:codes[wear] || '',WEAPON:weapon,FINISH:finish.join(' | ')};
    const markup=document.querySelector('#caser-item-card').innerHTML.replace(/CARD_([A-Z]+)/gi,(_,key)=>escape(values[key.toUpperCase()]));
    return active ? markup.replace('class="relative"','class="relative selected"') : markup;
  }
  return '<button type="button" class="tile' + (active ? ' selected' : '') + '" data-' + action + '="' + escape(id) +
    '" style="--grade:' + escape(skin.color || '#83d8ff') + '"><strong class="price">' + (skin.price == null ? 'Без цены' : coinValue(skin.price)) + '</strong>' +
    img(skin) + '<small>' + escape(skin.name) + '</small></button>';
}

function ownTiles(action) {
  const sorted = [...state.inventory].sort((a,b) => (ownedAscending ? 1 : -1) * ((skins.get(a.skin)?.price ?? Infinity)-(skins.get(b.skin)?.price ?? Infinity)));
  const tiles = sorted.map(entry => {
    const skin = skins.get(entry.skin);
    return skin ? tile(skin, action, entry.id, action === 'source' ? upgradeItems.has(entry.id) : entry.id === selected) : '';
  }).join('');
  return tiles ? '<div class="tiles">' + tiles + '</div>' :
    '<p class="muted">Ваш инвентарь пуст<br><a href="#cases">Открыть кейс</a></p>';
}

function renderTargets() {
  const query = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = catalog.filter(skin => query.every(word => skin.search.includes(word)) &&
    (minimum === '' || skin.price >= Number(minimum.replace(',','.'))) &&
    (maximum === '' || skin.price <= Number(maximum.replace(',','.'))))
    .sort((a,b) => ascending ? a.price-b.price : b.price-a.price);
  const count = Math.max(1, Math.ceil(list.length / 16));
  page = Math.max(0, Math.min(count-1,page));
  const shown = list.slice(page*16,page*16+16);
  const markup = shown.map(skin => {
    const original = originals.get(skin.name);
    if (!original || cents(original.price)!==skin.price) return tile(skin,'target',skin.id,skin.id===target);
    return original.markup.replace('data-target="'+original.id+'"','data-target="'+skin.id+'"');
  }).join('');
  const grid = game.querySelector('#targets');
  grid.innerHTML = markup;
  if (!shown.length) grid.innerHTML = '<p class="muted">Предметы не найдены</p>';
  for (const card of grid.querySelectorAll('[data-target]')) card.classList.toggle('selected',card.dataset.target===target);
  const counter = game.querySelector('#game-page');
  if (counter) counter.textContent = (page+1) + ' / ' + count;
  game.querySelector('[data-page="-1"]').disabled = page === 0;
  game.querySelector('[data-page="1"]').disabled = page >= count-1;
  const sort = game.querySelector('#sort');
  sort.title = ascending ? 'По возрастанию цены' : 'По убыванию цены';
}

function currentOffer() {
  const sources=state.inventory.filter(entry=>upgradeItems.has(entry.id));
  const inputs=sources.map(entry=>skins.get(entry.skin));
  const total=cents(inputs.reduce((sum,skin)=>sum+(skin?.price || 0),0)+stake);
  const key=[...upgradeItems].join(',')+':'+total;
  if(mystery && mysteryStake!==key) {
    const choices=catalog.filter(skin=>skin.price>total && skin.price<=total*4);
    const fallback=catalog.find(skin=>skin.price>total);
    mysteryGoal=choices[Math.floor(Math.random()*choices.length)]?.id || fallback?.id || '';
    mysteryStake=key;
  }
  const goal=skins.get(mystery?mysteryGoal:target);
  const chance=goal && total>0 && goal.price>total && inputs.every(skin=>skin?.price!=null) ?
    Math.min(.95,total/goal.price*.95):0;
  return {sources,inputs,goal,total,chance};
}

function refreshWallet() {
  wallet.textContent = number(state.balance);
  document.querySelector('#inventory-value').textContent = number(state.inventory.reduce((sum,entry) => sum + (skins.get(entry.skin)?.price || 0),0));
  document.querySelector('#clicker-balance').textContent = number(state.balance);
}

function refreshOwned() {
  const owned = game.querySelector('#owned');
  owned.innerHTML = !state.inventory.length && owned.dataset.empty ? owned.dataset.empty : ownTiles('source');
}

function refreshUpgrade() {
  const {inputs,goal,total,chance} = currentOffer();
  const slider=game.querySelector('#stake');
  slider.max=state.balance;
  slider.value=stake;
  slider.style.setProperty('--range-progress',(state.balance ? stake/state.balance*100 : 0)+'%');
  game.querySelector('#stake-value').textContent=number(stake);
  game.querySelector('#stake-max').textContent=number(state.balance);
  slider.disabled=state.balance<=0 || rolling;
  game.querySelector('#source-preview').innerHTML=inputs.length ?
    '<div class="caser-selected-grid">'+inputs.map(skin=>'<span title="'+escape(skin.name)+'">'+img(skin)+'</span>').join('')+
    '</div><strong>'+inputs.length+' / 20 · '+coinValue(total)+'</strong>' :
    stake ? '<strong>'+coinValue(stake)+'</strong>' : 'Выбранные предметы появятся здесь';
  game.querySelector('#target-preview').innerHTML=mystery ? '<strong>Mystery Mode</strong><span>Предмет откроется после попытки</span>' :
    goal ? img(goal)+'<strong>'+escape(goal.name)+'</strong><span>'+coinValue(goal.price)+'</span>' : 'Выберите предмет из списка ниже';
  const wheel=game.querySelector('[data-wheel]');
  const angle=(total ? chance : .5)*360;
  wheel.style.setProperty('--chance-angle',angle+'deg');
  wheel.style.setProperty('--sector-start',(180-angle/2)+'deg');
  wheel.classList.remove('caser-win','caser-loss');
  wheel.querySelector('.essential-pointer').style.removeProperty('transform');
  game.querySelector('#chance').textContent=(angle/3.6).toFixed(2)+'%';
  game.querySelector('[data-testid=upgrade-spinner-chance-label]').textContent=angle<108?'Низкий шанс':angle>=252?'Высокий шанс':'Средний шанс';
  const upgrade=game.querySelector('#upgrade');
  upgrade.disabled=!chance || rolling;
  upgrade.setAttribute('aria-busy',String(rolling));
  game.querySelector('[data-testid=upgrade-fast-amounts-mystery-toggle]').setAttribute('aria-pressed',String(mystery));
  for (const button of game.querySelectorAll('[data-toggle]')) button.setAttribute('aria-pressed',String(state[button.dataset.toggle]));
  for (const tab of game.querySelectorAll('[data-list]')) {
    const active=tab.dataset.list===mobileList;
    tab.setAttribute('aria-selected',String(active));
    tab.dataset.active=String(active);
  }
  game.dataset.list=mobileList;
}

function caseTile(skin) {
  return '<div class="caser-reel-item" style="--item-color:'+escape(skin.color || '#83d8ff')+'">'+img(skin)+
    '<small>'+escape(skin.name)+'</small></div>';
}

function renderCases() {
  const box=cases.find(box=>box.slug===selectedCase);
  if(box) {
    const pool=box.pool.map(([id])=>skins.get(id)).filter(Boolean);
    const options=Array.from({length:10},(_,i)=>i+1);
    const cost=cents(box.cost*caseQuantity);
    return '<a class="caser-case-back" href="#cases" data-back-case>← Все кейсы</a><article class="caser-case-stage">'+
      '<h1>'+escape(box.name)+'</h1><div id="case-rollers">'+(caseResults.length ?
        '<div class="caser-case-results">'+caseResults.map(caseTile).join('')+'</div>' :
        '<div class="caser-case-cover">'+img(box)+'</div>')+'</div>'+
      '<div class="caser-case-options" aria-label="Количество кейсов">'+options.map(count=>
        '<button type="button" data-quantity="'+count+'" aria-pressed="'+(count===caseQuantity)+'">×'+count+'</button>').join('')+'</div>'+
      '<button type="button" class="primary caser-case-open" data-case="'+escape(box.slug)+'"'+(!pool.length || state.balance<cost?' disabled':'')+
      '>Открыть '+(caseQuantity>1?'×'+caseQuantity+' ':'')+'за '+coinValue(cost)+'</button>'+
      (state.balance<cost?'<p>Недостаточно монет</p>':'')+'</article><section class="caser-case-section"><h2>Содержимое кейса</h2><div class="caser-case-loot">'+
      pool.map(caseTile).join('')+'</div></section>';
  }
  const filter=caseFilter.trim().toLowerCase();
  const groups=new Map();
  for(const box of cases) {
    if(!(box.name+' '+box.section).toLowerCase().includes(filter)) continue;
    if(!groups.has(box.section)) groups.set(box.section,[]);
    groups.get(box.section).push(box);
  }
  return '<div class="caser-case-heading"><h1>Кейсы</h1><input id="case-filter" type="search" placeholder="Поиск по кейсам" value="'+escape(caseFilter)+'"></div>'+
    [...groups].map(([section,boxes])=>'<section class="caser-case-section"><h2>'+escape(section)+'</h2><div class="caser-case-grid">'+
      boxes.map(box=>'<button type="button" class="caser-case-card" data-show-case="'+escape(box.slug)+'"><span class="caser-case-art">'+img(box)+
        '</span><span class="caser-case-caption"><strong>'+escape(box.name)+'</strong><span>'+coinValue(box.cost)+'</span></span></button>').join('')+
      '</div></section>').join('')+(!groups.size?'<p>Кейсы не найдены.</p>':'');
}

function animateCases(box,drops) {
  const stage=game.querySelector('#case-rollers');
  const pool=box.pool.map(([id])=>skins.get(id)).filter(Boolean);
  const stop=24;
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?80:4600;
  stage.innerHTML='<div class="caser-reel-grid" data-count="'+drops.length+'">'+drops.map(drop=>{
    const strip=Array.from({length:stop+5},(_,index)=>index===stop?drop:pool[Math.floor(Math.random()*pool.length)]);
    return '<div class="caser-reel"><div class="caser-reel-track">'+strip.map(caseTile).join('')+'</div></div>';
  }).join('')+'</div>';
  for(const [i,track] of [...stage.querySelectorAll('.caser-reel-track')].entries()) {
    const winner=track.children[stop];
    const winnerCenter=winner.offsetLeft+winner.offsetWidth/2;
    const viewportWidth=Math.max(track.parentElement.clientWidth,screen.width);
    const minimumWidth=Math.max(viewportWidth,winnerCenter+viewportWidth/2)+winner.offsetWidth;
    while(track.scrollWidth<minimumWidth) {
      const skin=pool[Math.floor(Math.random()*pool.length)];
      track.insertAdjacentHTML('beforeend',caseTile(skin));
    }
    for(const picture of track.querySelectorAll('img')) picture.loading='eager';
    track.animate([{transform:'translateX(0)'},{transform:'translateX(calc(50cqw - '+winnerCenter+'px))'}],
      {duration:duration+i*55,easing:'cubic-bezier(.12,.72,.13,1)',fill:'forwards'});
  }
  setTimeout(()=>{
    rolling=false;
    caseResults=drops;
    chime(true);
    render(drops.length===1?'Выпало: '+drops[0].name:'Предметов добавлено в инвентарь: '+drops.length);
  },duration+(drops.length-1)*55+250);
}

function refreshRewards() {
  const now=Date.now();
  for (const card of game.querySelectorAll('[data-draw-card]')) {
    const cadence=card.dataset.drawCard;
    const entry=state.draws[cadence];
    const period=drawTimes[cadence];
    const boundary=(Math.floor(now/period)+1)*period;
    const remaining=Math.max(0,Math.ceil((((!entry?.claimed && entry?.end) || boundary)-now)/1000));
    const values=[Math.floor(remaining/86400),Math.floor(remaining/3600)%24,Math.floor(remaining/60)%60,remaining%60];
    for (const [i,unit] of ['days','hours','minutes','seconds'].entries()) {
      const timer=card.querySelector('[data-testid=giveaway-timer-'+unit+']');
      if(timer?.firstElementChild) timer.firstElementChild.textContent=String(values[i]).padStart(i ? 2 : 1,'0');
    }
    const button=card.querySelector('[data-draw]');
    const waiting=Boolean(entry && !entry.claimed && remaining);
    button.disabled=waiting;
    button.textContent=waiting?'Вы участвуете':entry && !entry.claimed?'Забрать приз':entry?.claimed?'Следующий розыгрыш':'Участвовать';
  }
  const daily=state.lastDaily?.key==='daily-'+dayKey() && skins.get(state.lastDaily.skin);
  for(const button of game.querySelectorAll('[data-daily]')) {
    button.disabled=state.claims.includes('daily-'+dayKey());
    button.textContent=button.disabled?(daily?'Получено: '+daily.name:'Получено сегодня'):'Забрать дроп';
  }
}

function render(message='') {
  refreshWallet();
  const view=route();
  const upgrade=view==='upgrade';
  game.className=upgrade?'essential-game':view==='rewards'?'caser-rewards':'game';
  let content;
  if (view==='cases') content=renderCases();
  else if (view==='rewards') content=document.querySelector('#caser-rewards').innerHTML;
  else if (view==='inventory') content='<h1>Инвентарь</h1><div class="panel">'+ownTiles('sell')+'</div><div class="controls"><button type="button" id="sell-item" '+
    (!selected?'disabled':'')+'>Продать выбранный предмет</button><button type="button" id="sell-all" class="primary" '+
    (!state.inventory.some(entry=>skins.get(entry.skin)?.price!=null)?'disabled':'')+'>Продать все</button><a href="#upgrade">К апгрейдам</a></div>';
  else content=document.querySelector('#essential-upgrade').innerHTML;
  game.innerHTML=nav+'<p class="message" role="status"></p>'+content;
  if (upgrade) {
    game.querySelector('#search-game').value=search;
    game.querySelector('#minimum').value=minimum;
    game.querySelector('#maximum').value=maximum;
    refreshOwned();
    renderTargets();
    refreshUpgrade();
  }
  if (view==='rewards') refreshRewards();
  for(const link of document.querySelectorAll('body a[href^="#"]')) {
    if (['#inventory','#cases','#rewards','#upgrade'].includes(link.getAttribute('href'))) {
      if (link.hash==='#'+view) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
  }
  const active=document.querySelector('[data-testid=header-nav-desktop] a[aria-current=page]');
  if(active) active.prepend(document.querySelector('#nav-cubes'));
  announce(message || (storageFailed?'Браузер запретил сохранение. Прогресс доступен до закрытия вкладки.':''));
}

function give(skin) {
  const id = Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-');
  state.inventory.push({id, skin:skin.id});
}

function commit(message) {
  save();
  render(message);
}

function transact(action, queue = false) {
  if ((!queue && busy) || rolling) return;
  if (!queue) busy=true;
  const run=()=>{
    if (!storageFailed) state=readState();
    stake=Math.min(stake,state.balance);
    action();
  };
  const done=()=>{if (!queue) busy=false;};
  if (navigator.locks) navigator.locks.request(storageKey,run).catch(error=>{
    console.error(error);
    announce('Операция не завершена.');
  }).finally(done);
  else {
    try {run();} finally {done();}
  }
}

const clicker=document.querySelector('#clicker');
document.querySelector('#earn').addEventListener('click',()=>clicker.showModal());
document.querySelector('#close-clicker').addEventListener('click',()=>clicker.close());
document.querySelector('#click-coin').addEventListener('click',()=>transact(()=>{
  state.balance=cents(state.balance+1);
  state.clicks++;
  save();
  refreshWallet();
  if(route()==='upgrade') refreshUpgrade();
  else if(route()==='cases') render();
}, true));

function chooseDrop(box, mode) {
  const pool=box.pool.map(([id,chance])=>({skin:skins.get(id),chance})).filter(entry=>entry.skin);
  if (!pool.length) return null;
  if (mode === 'low' || mode === 'high') {
    return pool.reduce((best,entry) => {
      const difference = entry.skin.price - best.skin.price;
      return (mode === 'low' ? difference < 0 : difference > 0) ? entry : best;
    }).skin;
  }
  if (!box.originalOdds) {
    pool.sort((a,b)=>a.skin.price-b.skin.price);
    const floor=pool[0].skin.price;
    const extras=pool.slice(1);
    const weights=extras.map(entry=>Math.min(.12,Math.max(0,(box.cost-floor)*.85)/(Math.max(1,extras.length)*Math.max(1,entry.skin.price-floor))));
    for(const [index,entry] of extras.entries()) entry.chance=weights[index]*100;
    pool[0].chance=100-weights.reduce((sum,weight)=>sum+weight,0)*100;
  }
  let roll=Math.random()*pool.reduce((sum,entry)=>sum+entry.chance,0);
  return pool.find(entry=>(roll-=entry.chance)<0)?.skin || pool.at(-1).skin;
}

function chime(success) {
  if(!state.sound) return;
  try {
    const context=new AudioContext();
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    oscillator.frequency.value=success?660:230;
    gain.gain.setValueAtTime(.07,context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime+.23);
    oscillator.onended=()=>context.close();
  } catch {}
}

game.addEventListener('input', event => {
  if(event.target.id==='case-filter') {
    caseFilter=event.target.value;
    const cursor=event.target.selectionStart; render();
    const field=game.querySelector('#case-filter'); field.focus(); field.setSelectionRange(cursor,cursor);
    return;
  }
  if (event.target.id === 'stake') {
    if(rolling) return;
    stake=cents(Number(event.target.value));
    if(!mystery && stake && (!target || !currentOffer().chance)) chooseTarget(2);
    refreshUpgrade();
    return;
  }
  if (event.target.id === 'search-game') search = event.target.value;
  else if (event.target.id === 'minimum') minimum = event.target.value;
  else if (event.target.id === 'maximum') maximum = event.target.value;
  else return;
  page = 0;
  renderTargets();
});

game.addEventListener('click', event => {
  const button = event.target.closest('button,[role=button],[data-max],[data-back-case]');
  if (!button || button.disabled || rolling) return;
  const data = button.dataset;
  if(data.backCase!==undefined) {event.preventDefault(); selectedCase='';caseResults=[];render();return;}
  if(data.showCase) {selectedCase=data.showCase;caseResults=[];caseQuantity=1;render();return;}
  if(data.quantity) {caseQuantity=Number(data.quantity);render();return;}
  if(data.list) {mobileList=data.list;refreshUpgrade();return;}
  if(data.ownedSort!==undefined) {ownedAscending=!ownedAscending;refreshOwned();return;}
  if(button.matches('[data-testid=upgrade-fast-amounts-mystery-toggle]')) {
    mystery=!mystery;mysteryStake='';refreshUpgrade();return;
  }
  if(data.toggle) {
    transact(()=>{state[data.toggle]=!state[data.toggle];save();refreshUpgrade();});
    return;
  }
  if(data.case!==undefined || data.daily!==undefined || data.draw || button.id==='sell-item' || button.id==='sell-all' || button.id==='upgrade') {
    transact(()=>settle(button,data));
    return;
  }
  if (data.target) {
    mystery=false;
    target = target === data.target ? '' : data.target;
    renderTargets();
    refreshUpgrade();
  } else if (data.source) {
    if(upgradeItems.has(data.source)) upgradeItems.delete(data.source);
    else {
      const entry=state.inventory.find(item=>item.id===data.source);
      if(!entry || skins.get(entry.skin)?.price==null) return announce('Для предмета нет сохранённой цены.');
      if(upgradeItems.size>=20) return announce('В одной ставке можно использовать до 20 предметов.');
      upgradeItems.add(data.source);
    }
    if(upgradeItems.size && !mystery && (!target || !currentOffer().chance)) chooseTarget(2);
    refreshOwned();
    renderTargets();
    refreshUpgrade();
  } else if (data.sell) {
    selected = selected === data.sell ? '' : data.sell;
    render();
  } else if (data.max !== undefined) {
    stake = state.balance;
    if(!mystery && stake && (!target || !currentOffer().chance)) chooseTarget(2);
    refreshUpgrade();
  } else if (data.page) {
    page += Number(data.page);
    renderTargets();
  } else if (button.id === 'sort') {
    ascending = !ascending;
    page = 0;
    renderTargets();
  } else if (data.ratio) {
    mystery=false;
    chooseTarget(Number(data.ratio),true);
    renderTargets();
    refreshUpgrade();
  }
});

function chooseTarget(multiplier,notify=false) {
  const {total}=currentOffer();
  if(!total) {
    if(notify) announce('Сначала выберите ставку или предмет.');
    return;
  }
  const desired=total*multiplier;
  const choices=catalog.filter(skin=>skin.price>total);
  if(!choices.length) {
    if(notify) announce('Для этой ставки нет более дорогой цели.');
    return;
  }
  target=choices.reduce((best,skin)=>Math.abs(skin.price-desired)<Math.abs(best.price-desired)?skin:best).id;
}

function takeTestMode(selector) {
  if (!testing) return 'normal';
  const field = document.querySelector(selector);
  const mode = field.value;
  field.value = 'normal';
  return mode;
}

function settle(button,data) {
  if(button.id==='sell-item' || button.id==='sell-all') {
    const sold=state.inventory.filter(entry=>(button.id==='sell-all' || entry.id===selected) && skins.get(entry.skin)?.price!=null);
    if(!sold.length) return announce('Нет предметов с сохранённой ценой.');
    const soldIds=new Set(sold.map(entry=>entry.id));
    const amount=cents(sold.reduce((sum,entry)=>sum+skins.get(entry.skin).price,0));
    state.inventory=state.inventory.filter(entry=>!soldIds.has(entry.id));
    for(const id of soldIds) upgradeItems.delete(id);
    state.balance=cents(state.balance+amount);
    selected='';
    commit('Продано предметов: '+sold.length+' · +'+number(amount));
  } else if(data.case!==undefined) {
    const box=cases.find(box=>box.slug===data.case);
    const cost=box && cents(box.cost*caseQuantity);
    if(!box || state.balance<cost) return render('Недостаточно монет.');
    const mode = takeTestMode('#csr-case-mode');
    const drops=Array.from({length:caseQuantity},()=>chooseDrop(box, mode));
    if(drops.some(drop=>!drop)) return announce('Состав кейса недоступен.');
    state.balance=cents(state.balance-cost);
    stake=Math.min(stake,state.balance);
    state.opened+=drops.length;
    for(const drop of drops) give(drop);
    save();
    refreshWallet();
    rolling=true;
    game.querySelector('[data-case]').disabled=true;
    animateCases(box,drops);
  } else if(data.daily!==undefined) {
    const key='daily-'+dayKey();
    if(state.claims.includes(key)) return render();
    const pool=CASER_DATA.shop.slice(0,80);
    const drop=skins.get(pool[Math.floor(Math.random()*pool.length)]);
    if(!drop) return announce('Каталог предметов недоступен.');
    state.claims.push(key);
    state.lastDaily={key,skin:drop.id};
    give(drop);
    commit('Ежедневный дроп: '+drop.name);
  } else if(data.draw) {
    const cadence=data.draw;
    const period=drawTimes[cadence];
    const now=Date.now();
    const entry=state.draws[cadence];
    if(entry && !entry.claimed && now<entry.end) return render();
    if(entry && !entry.claimed) {
      const prize=skins.get(CASER_DATA.giveaways.find(draw=>draw.cadence===cadence)?.prize);
      if(!prize) return announce('Приз недоступен.');
      entry.claimed=true;
      give(prize);
      commit('Приз розыгрыша: '+prize.name);
    } else {
      state.draws[cadence]={end:(Math.floor(now/period)+1)*period,claimed:false};
      commit('Участие зарегистрировано. Забери приз после окончания таймера.');
    }
  } else if(button.id==='upgrade') {
    const {sources,goal,chance}=currentOffer();
    if(sources.length!==upgradeItems.size) {
      upgradeItems.clear();render('Предмет уже использован.');return;
    }
    if(!chance || stake>state.balance) return render('Выберите ставку и более дорогую цель.');
    const start=180-chance*180;
    const mode = takeTestMode('#csr-upgrade-mode');
    const angle = mode === 'win' ? chance * 180 :
      mode === 'loss' ? (1 + chance) * 180 : Math.random() * 360;
    const success=angle<chance*360;
    state.balance=cents(state.balance-stake);
    state.inventory=state.inventory.filter(entry=>!upgradeItems.has(entry.id));
    upgradeItems.clear();
    if(success) give(goal);
    state.attempts++;
    selected='';
    stake=0;
    mysteryStake='';
    save();
    refreshWallet();
    rolling=true;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    const pointer=game.querySelector('.essential-pointer');
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : state.turbo?1450:3600;
    pointer.style.setProperty('--roll',(1080+start+angle-180)+'deg');
    pointer.style.setProperty('--spin-time',duration+'ms');
    pointer.classList.add('rolling');
    announce('Апгрейд...');
    setTimeout(()=>{
      rolling=false;
      chime(success);
      render(success?'Получено: '+goal.name:'Апгрейд не удался. Ставка использована.');
      if(route()==='upgrade') {
        const wheel=game.querySelector('[data-wheel]');
        wheel.style.setProperty('--sector-start',start+'deg');
        wheel.style.setProperty('--chance-angle',(chance*360)+'deg');
        wheel.querySelector('#chance').textContent=(chance*100).toFixed(2)+'%';
        wheel.querySelector('[data-testid=upgrade-spinner-chance-label]').textContent=success?'Предмет получен':'Не удалось';
        wheel.querySelector('.essential-pointer').style.transform='rotate('+(start+angle)+'deg)';
        wheel.classList.add(success?'caser-win':'caser-loss');
        if(success) game.querySelector('#target-preview').innerHTML=img(goal)+'<strong>'+escape(goal.name)+'</strong><span>Добавлено в инвентарь</span>';
      }
    },duration+180);
  }
}

game.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role=button][data-target],[role=button][data-source],[data-max]')) {
    event.preventDefault();
    event.target.click();
  }
});
window.addEventListener('hashchange',()=>{
  if(rolling) return;
  selectedCase='';
  caseResults=[];
  render();
});
window.addEventListener('storage',event=>{if(event.key===storageKey && !rolling){state=readState();stake=Math.min(stake,state.balance);render();}});
setInterval(()=>{
  if(route()!=='rewards') return;
  refreshRewards();
  const due=Object.keys(drawTimes).find(cadence=>{
    const entry=state.draws[cadence];
    return entry && !entry.claimed && Date.now()>=entry.end;
  });
  if(due) transact(()=>settle({}, {draw:due}));
},1000);
render();








