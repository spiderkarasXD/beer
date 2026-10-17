'use strict';
// без lang.js (старая страница из кэша) — всё по-русски
if (!window.L10N) { window.lng = (ru) => ru; window.L10N = { lang: 'ru', en: false, locale: 'ru-RU', apply() {}, set() {} }; }
/* =========================================================
   Rice: калькулятор риса + переводчик из риса во всё подряд
   ========================================================= */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- localStorage (общие ключи с главной: beer:*) ---------- */
  const store = {
    get(key, def) {
      try {
        const raw = localStorage.getItem('beer:' + key);
        return raw == null ? def : JSON.parse(raw);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('beer:' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    },
  };

  /* ---------- тема ---------- */
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const pref = store.get('theme', 'system');
    const dark = pref === 'dark' || (pref === 'system' && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#metaTheme').setAttribute('content', dark ? '#17130b' : '#fff8f2');
    $('#themeBtn .ms').textContent = dark ? 'light_mode' : 'dark_mode';
  }
  if (mq) mq.addEventListener('change', applyTheme);
  $('#themeBtn').onclick = () => {
    store.set('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    applyTheme();
  };
  applyTheme();
  $('#langBtn').textContent = lng('EN', 'RU');
  $('#langBtn').onclick = () => L10N.set(lng('en', 'ru'));
  window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

  /* ---------- снекбар ---------- */
  let snackTimer = null;
  function snack(text) {
    $('#snackText').textContent = text;
    $('#snackbar').classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => $('#snackbar').classList.remove('show'), 2500);
  }

  /* ---------- числа ---------- */
  const LOC = L10N.locale;
  const DEC = lng(',', '.');
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const minus = (s) => s.replace('-', '−');

  // 2,25 × 10¹² для очень больших и очень маленьких, иначе обычная запись
  function sci(v, digits) {
    const [m, e] = v.toExponential(digits).split('e');
    return minus(String(parseFloat(m)).replace('.', DEC)) + ' × 10' + String(+e).split('').map((c) => SUP[c]).join('');
  }
  function fmtNum(v) {
    if (Number.isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e15 || a < 1e-6) return sci(v, 3);
    return minus(a >= 1e6
      ? v.toLocaleString(LOC, { maximumFractionDigits: 0 })
      : v.toLocaleString(LOC, { maximumSignificantDigits: 6 }));
  }
  // для полей ввода: без разделителей разрядов, чтобы было удобно править
  function fmtInput(v) {
    if (!isFinite(v)) return '';
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e15 || a < 1e-6)) {
      const [m, e] = v.toExponential(5).split('e');
      return String(parseFloat(m)).replace('.', DEC) + 'e' + e.replace('+', '');
    }
    return v.toLocaleString(LOC, { maximumSignificantDigits: 8, useGrouping: false });
  }
  // по-русски запятая — дробная часть, по-английски — разделитель разрядов
  function parseNum(s) {
    s = String(s).replace(/\s/g, '').replace('−', '-');
    s = L10N.en ? s.replace(/,/g, '') : s.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  }
  // формы: по-русски [1, 2–4, 5+], по-английски [1, остальное]
  function plural(n, forms) {
    if (forms.length === 2) return Math.abs(n) === 1 ? forms[0] : forms[1];
    if (!Number.isInteger(n)) return forms[1];
    const n100 = Math.abs(n) % 100, n10 = n100 % 10;
    if (n100 > 10 && n100 < 20) return forms[2];
    if (n10 === 1) return forms[0];
    if (n10 > 1 && n10 < 5) return forms[1];
    return forms[2];
  }
  const GRAIN_WORDS = lng(['зерно', 'зерна', 'зёрен'], ['grain', 'grains']);

  const TIME_UNITS = [[31557600, lng('г.', 'y')], [86400, lng('дн', 'd')], [3600, lng('ч', 'h')], [60, lng('мин', 'min')], [1, lng('с', 's')]];
  function humanTime(sec) {
    if (!isFinite(sec)) return fmtNum(sec);
    const sign = sec < 0 ? '−' : '';
    sec = Math.abs(sec);
    if (sec < 60) return sign + fmtNum(sec) + ' ' + lng('с', 's');
    if (sec >= 31557600 * 1e4) return sign + fmtNum(sec / 31557600) + ' ' + lng('лет', 'years');
    sec = Math.round(sec);
    const i = TIME_UNITS.findIndex(([k]) => sec >= k);
    const [k, u] = TIME_UNITS[i];
    const major = Math.floor(sec / k);
    let out = major.toLocaleString(LOC) + ' ' + u;
    const next = TIME_UNITS[i + 1];
    if (next) {
      const minor = Math.floor((sec - major * k) / next[0]);
      if (minor) out += ' ' + minor + ' ' + next[1];
    }
    return sign + out;
  }

  const BYTE_UNITS = lng(['Б', 'КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ', 'ЭБ', 'ЗБ', 'ИБ'], ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']);
  function humanBytes(bits) {
    if (!isFinite(bits) || Math.abs(bits) < 8) return fmtNum(bits) + ' ' + lng('бит', 'bits');
    let v = bits / 8, i = 0;
    while (Math.abs(v) >= 1024 && i < BYTE_UNITS.length - 1) { v /= 1024; i++; }
    return (Math.abs(v) < 1e6 ? minus(v.toLocaleString(LOC, { maximumFractionDigits: 2 })) : fmtNum(v)) + ' ' + BYTE_UNITS[i];
  }

  /* ---------- рисовая физика ---------- */
  const GRAIN = {
    len: 0.007,     // м — длина зерна длиннозёрного риса
    mass: 0.025,    // г
    density: 0.8,   // г/мл — насыпная плотность сухого риса
    kcal: 0.09,     // ккал (≈ 360 ккал на 100 г)
    price: lng(0.12, 0.002),  // за грамм: 120 ₽/кг или $2/кг
  };
  const PINT = lng(250, 6);                     // кружка пива: 250 ₽ или $6
  const L = GRAIN.len;
  const VOL = GRAIN.mass / GRAIN.density;      // мл на зерно, насыпью
  const KG = GRAIN.mass / 1000;
  const C = 299792458;                          // скорость света, м/с
  const SPERM_ML = 3;                           // объём, мл
  const SPERM_NORM = 16;                        // млн/мл, нижняя граница ВОЗ
  const G = lng('г', 'g');

  function lenText(m) {
    const a = Math.abs(m);
    if (a < 1) return fmtNum(m * 100) + ' ' + lng('см', 'cm');
    if (a < 1000) return fmtNum(m) + ' ' + lng('м', 'm');
    return fmtNum(m / 1000) + ' ' + lng('км', 'km');
  }

  function spermNote(grains) {
    const c = grains / SPERM_ML / 1e6;
    const more = fmtNum((SPERM_NORM * SPERM_ML * 1e6 - grains) * KG);
    if (c < SPERM_NORM) return lng(`ниже нормы ВОЗ (${SPERM_NORM} млн/мл): докинь ещё ${more} кг риса`, `below the WHO norm (${SPERM_NORM} M/ml): add ${more} kg more rice`);
    if (c <= 250) return lng('норма ВОЗ ✅', 'WHO norm ✅');
    return lng('это уже рисовая каша 🍚', 'that’s rice porridge now 🍚');
  }

  const RICE_UNITS = [
    { id: 'grain', name: lng('Зёрна', 'Grains'), forms: GRAIN_WORDS, k: 1 },
    { id: 'g', name: lng('Граммы', 'Grams'), short: G, k: 1 / GRAIN.mass },
    { id: 'kg', name: lng('Килограммы', 'Kilograms'), short: lng('кг', 'kg'), k: 1000 / GRAIN.mass },
    { id: 'cup', name: lng('Стаканы (250 мл)', 'Cups (250 ml)'), forms: lng(['стакан', 'стакана', 'стаканов'], ['cup', 'cups']), k: 250 / VOL },
    { id: 'bag', name: lng('Мешки (25 кг)', 'Bags (25 kg)'), forms: lng(['мешок', 'мешка', 'мешков'], ['bag', 'bags']), k: 25000 / GRAIN.mass },
  ];
  const riceAmount = (u, n) => fmtNum(n) + ' ' + (u.short || plural(n, u.forms));

  const CATS = [
    { id: 'len', name: lng('Длина', 'Length'), icon: 'straighten', hint: lng('если выложить все зёрна в линию, 1 зерно ≈ 7 мм', 'all grains laid end to end, 1 grain ≈ 7 mm') },
    { id: 'game', name: lng('Игры', 'Games'), icon: 'sports_esports', hint: lng('та же рисовая линия в игровых единицах', 'the same rice line in game units') },
    { id: 'vol', name: lng('Объём', 'Volume'), icon: 'water_drop', hint: lng('насыпью, 1 л ≈ 800 г риса', 'loose, 1 l ≈ 800 g of rice') },
    { id: 'mass', name: lng('Масса', 'Mass'), icon: 'scale', hint: lng('1 зерно ≈ 25 мг', '1 grain ≈ 25 mg') },
    { id: 'elec', name: lng('Электричество', 'Electricity'), icon: 'bolt', hint: lng('каждое зерно — батарейка АА на 1,5 В, всё последовательно', 'every grain is a 1.5 V AA battery, all in series') },
    { id: 'energy', name: lng('Энергия', 'Energy'), icon: 'local_fire_department', hint: lng('сколько энергии сидит в рисе', 'how much energy hides in rice') },
    { id: 'speed', name: lng('Скорость', 'Speed'), icon: 'speed', hint: lng('пробежать всю рисовую линию за 1 секунду', 'run the whole rice line in 1 second') },
    { id: 'bio', name: lng('Биология', 'Biology'), icon: 'biotech', hint: lng('рис глазами биолога', 'rice through a biologist’s eyes') },
    { id: 'money', name: lng('Деньги и время', 'Money & time'), icon: 'payments', hint: lng('во что обойдётся и сколько считать', 'what it costs and how long to count it') },
    { id: 'data', name: lng('Данные', 'Data'), icon: 'memory', hint: lng('1 зерно = 1 бит', '1 grain = 1 bit') },
  ];

  // k — сколько единиц приходится на одно зерно
  const TARGETS = [
    { id: 'mm', cat: 'len', e: '📏', name: lng('Миллиметры', 'Millimeters'), sym: lng('мм', 'mm'), k: L * 1000 },
    { id: 'cm', cat: 'len', e: '📏', name: lng('Сантиметры', 'Centimeters'), sym: lng('см', 'cm'), k: L * 100 },
    { id: 'm', cat: 'len', e: '📐', name: lng('Метры', 'Meters'), sym: lng('м', 'm'), k: L },
    { id: 'km', cat: 'len', e: '🛣️', name: lng('Километры', 'Kilometers'), sym: lng('км', 'km'), k: L / 1000 },
    { id: 'in', cat: 'len', e: '🇺🇸', name: lng('Дюймы', 'Inches'), sym: lng('дюйм.', 'in'), k: L / 0.0254 },
    { id: 'banana', cat: 'len', e: '🍌', name: lng('Бананы', 'Bananas'), k: L / 0.18, hint: lng('banana for scale, 18 см', 'banana for scale, 18 cm') },
    { id: 'parrot', cat: 'len', e: '🦜', name: lng('Попугаи', 'Parrots'), k: L / 0.1, hint: lng('удав = 38 попугаев', 'a boa is 38 parrots long') },
    { id: 'field', cat: 'len', e: '⚽', name: lng('Футбольные поля', 'Football fields'), k: L / 105, hint: lng('105 м', '105 m') },
    { id: 'eiffel', cat: 'len', e: '🗼', name: lng('Эйфелевы башни', 'Eiffel Towers'), k: L / 330, hint: lng('330 м', '330 m') },
    { id: 'moon', cat: 'len', e: '🌕', name: lng('Расстояния до Луны', 'Trips to the Moon'), k: L / 384400000, hint: lng('384 400 км', '384,400 km') },

    { id: 'stud', cat: 'game', e: '🧱', name: lng('Стады Roblox', 'Roblox studs'), sym: 'studs', k: L / 0.28, hint: lng('1 стад = 28 см', '1 stud = 28 cm') },
    { id: 'noob', cat: 'game', e: '🙂', name: lng('Нубы Roblox в рост', 'Roblox noobs tall'), k: L / (5 * 0.28), hint: lng('персонаж ≈ 5 стадов', 'a character ≈ 5 studs') },
    { id: 'hu', cat: 'game', e: '🔫', name: lng('Юниты CS2', 'CS2 units'), sym: 'u', k: L / 0.0254, hint: lng('1 юнит ≈ 1 дюйм (Source 2)', '1 unit ≈ 1 inch (Source 2)') },
    { id: 'csman', cat: 'game', e: '🧍', name: lng('Игроки CS2 в рост', 'CS2 players tall'), k: L / (72 * 0.0254), hint: lng('игрок = 72 юнита', 'a player = 72 units') },
    { id: 'mc', cat: 'game', e: '⛏️', name: lng('Блоки Minecraft', 'Minecraft blocks'), k: L, hint: lng('1 блок = 1 м', '1 block = 1 m') },
    { id: 'px', cat: 'game', e: '🖥️', name: lng('Пиксели', 'Pixels'), sym: 'px', k: L / (0.0254 / 96), hint: lng('при 96 DPI', 'at 96 DPI') },

    { id: 'ml', cat: 'vol', e: '💧', name: lng('Миллилитры', 'Milliliters'), sym: lng('мл', 'ml'), k: VOL },
    { id: 'l', cat: 'vol', e: '🧴', name: lng('Литры', 'Liters'), sym: lng('л', 'l'), k: VOL / 1000 },
    { id: 'm3', cat: 'vol', e: '📦', name: lng('Кубометры', 'Cubic meters'), sym: lng('м³', 'm³'), k: VOL / 1e6 },
    { id: 'tsp', cat: 'vol', e: '🥄', name: lng('Чайные ложки', 'Teaspoons'), k: VOL / 5, hint: lng('5 мл', '5 ml') },
    { id: 'glass', cat: 'vol', e: '🥛', name: lng('Стаканы', 'Glasses'), k: VOL / 250, hint: lng('250 мл', '250 ml') },
    { id: 'beer', cat: 'vol', e: '🍺', name: lng('Бутылки пива', 'Beer bottles'), k: VOL / 500, hint: lng('0,5 л', '0.5 l') },
    { id: 'bath', cat: 'vol', e: '🛁', name: lng('Ванны', 'Bathtubs'), k: VOL / 150000, hint: lng('150 л', '150 l') },

    { id: 'mg', cat: 'mass', e: '⚖️', name: lng('Миллиграммы', 'Milligrams'), sym: lng('мг', 'mg'), k: GRAIN.mass * 1000 },
    { id: 'gr', cat: 'mass', e: '⚖️', name: lng('Граммы', 'Grams'), sym: G, k: GRAIN.mass },
    { id: 'kgm', cat: 'mass', e: '🏋️', name: lng('Килограммы', 'Kilograms'), sym: lng('кг', 'kg'), k: KG },
    { id: 't', cat: 'mass', e: '🚛', name: lng('Тонны', 'Tonnes'), sym: lng('т', 't'), k: KG / 1000 },
    { id: 'elephant', cat: 'mass', e: '🐘', name: lng('Слоны', 'Elephants'), k: KG / 5000, hint: lng('5 т', '5 t') },

    { id: 'v', cat: 'elec', e: '🔋', name: lng('Вольты', 'Volts'), sym: lng('В', 'V'), k: 1.5, hint: lng('1 зерно = 1,5 В', '1 grain = 1.5 V') },
    { id: 'kv', cat: 'elec', e: '🔋', name: lng('Киловольты', 'Kilovolts'), sym: lng('кВ', 'kV'), k: 1.5 / 1000 },
    { id: 'socket', cat: 'elec', e: '🔌', name: lng('Розетки', 'Wall sockets'), k: 1.5 / 220, hint: lng('220 В', '220 V') },
    { id: 'lightning', cat: 'elec', e: '🌩️', name: lng('Молнии', 'Lightning bolts'), k: 1.5 / 3e8, hint: lng('≈ 300 млн В', '≈ 300 million V') },

    { id: 'kcal', cat: 'energy', e: '🔥', name: lng('Калории', 'Calories'), sym: lng('ккал', 'kcal'), k: GRAIN.kcal, hint: lng('сухой рис ≈ 360 ккал на 100 г', 'dry rice ≈ 360 kcal per 100 g') },
    { id: 'kettle', cat: 'energy', e: '☕', name: lng('Вскипячённые чайники', 'Boiled kettles'), k: GRAIN.kcal * 4184 / (1.7 * 80 * 4186), hint: lng('если сжечь: 1,7 л с 20 до 100 °C', 'if burned: 1.7 l from 20 to 100 °C') },
    { id: 'mc2', cat: 'energy', e: '☢️', name: lng('Энергия E = mc²', 'Energy E = mc²'), sym: lng('Дж', 'J'), k: KG * C * C, hint: lng('если вся масса станет энергией', 'if all the mass turns into energy') },
    { id: 'tnt', cat: 'energy', e: '💥', name: lng('Тротиловый эквивалент', 'TNT equivalent'), sym: lng('т', 't'), k: KG * C * C / 4.184e9, hint: lng('та же E = mc² в тоннах тротила', 'the same E = mc² in tonnes of TNT') },

    { id: 'mps', cat: 'speed', e: '🏃', name: lng('Метры в секунду', 'Meters per second'), sym: lng('м/с', 'm/s'), k: L },
    { id: 'kmh', cat: 'speed', e: '🚗', name: lng('Километры в час', 'Kilometers per hour'), sym: lng('км/ч', 'km/h'), k: L * 3.6 },
    { id: 'snail', cat: 'speed', e: '🐌', name: lng('Улитки', 'Snails'), k: L / 0.001, hint: lng('улитка ползёт ≈ 1 мм/с', 'a snail crawls ≈ 1 mm/s') },
    { id: 'mach', cat: 'speed', e: '✈️', name: lng('Махи', 'Mach'), sym: 'M', k: L / 343, hint: lng('скорость звука 343 м/с', 'speed of sound 343 m/s') },
    { id: 'light', cat: 'speed', e: '🌌', name: lng('Скорости света', 'Speeds of light'), sym: 'c', k: L / C },

    { id: 'sperm', cat: 'bio', e: '🧪', name: lng('Густота спермы', 'Sperm density'), sym: lng('млн/мл', 'M/ml'), k: 1 / SPERM_ML / 1e6, hint: lng('каждое зерно — сперматозоид в 3 мл', 'every grain is a sperm cell in 3 ml'), note: spermNote },
    { id: 'mosquito', cat: 'bio', e: '🦟', name: lng('Комары по массе', 'Mosquitoes by mass'), k: GRAIN.mass / 0.0025, hint: lng('комар ≈ 2,5 мг', 'a mosquito ≈ 2.5 mg') },
    { id: 'human', cat: 'bio', e: '🧍', name: lng('Люди по массе', 'Humans by mass'), k: KG / 70, hint: lng('70 кг', '70 kg') },

    { id: 'rub', cat: 'money', e: '💸', name: lng('Рубли', 'Dollars'), sym: lng('₽', '$'), k: GRAIN.price * GRAIN.mass, hint: lng('рис по 120 ₽/кг', 'rice at $2/kg') },
    { id: 'pint', cat: 'money', e: '🍻', name: lng('Кружки пива', 'Pints of beer'), k: GRAIN.price * GRAIN.mass / PINT, hint: lng('по 250 ₽', '$6 each') },
    { id: 'portion', cat: 'money', e: '🍛', name: lng('Порции риса', 'Rice portions'), k: GRAIN.mass / 75, hint: lng('75 г сухого риса', '75 g of dry rice') },
    { id: 'count', cat: 'money', e: '⏱️', name: lng('Пересчитать вручную', 'Count by hand'), sym: lng('с', 's'), k: 1, hint: lng('1 зерно в секунду без перерывов', '1 grain per second, no breaks'), fmt: humanTime },

    { id: 'bit', cat: 'data', e: '🧠', name: lng('Информация', 'Information'), sym: lng('бит', 'bits'), k: 1, hint: lng('1 зерно = 1 бит', '1 grain = 1 bit'), fmt: humanBytes },
    { id: 'floppy', cat: 'data', e: '💾', name: lng('Дискеты', 'Floppy disks'), k: 1 / (1474560 * 8), hint: lng('1,44 МБ', '1.44 MB') },
  ];
  const TARGET = Object.fromEntries(TARGETS.map((t) => [t.id, t]));

  /* =========================================================
     Калькулятор
     ========================================================= */
  const isOp = (t) => t === '+' || t === '−' || t === '×' || t === '÷';
  const isNum = (t) => t != null && !isOp(t) && t !== '%';

  let tokens = [];      // числа строками ('12', '-3.5'), операторы + − × ÷ и постфиксный %
  let done = false;     // только что нажали «=»
  let result = 0;
  let resultExpr = '';
  let calcErr = '';      // 'div0' | 'overflow'
  const ERR = { div0: lng('На ноль рис не делится 🍚', 'Rice can’t be divided by zero 🍚'), overflow: lng('Слишком много риса 🌾', 'Too much rice 🌾') };
  let calcVal = 0;      // текущее значение на экране — его можно отправить в переводчик

  // 200 + 10% = 220, 50 × 10% = 5, просто 10% = 0,1
  function evaluate(t) {
    let i = 0;
    const factor = (base) => {
      let v = parseFloat(t[i++]);
      if (t[i] === '%') { i++; v = base == null ? v / 100 : base * v / 100; }
      return v;
    };
    const term = (base) => {
      let v = factor(base);
      while (t[i] === '×' || t[i] === '÷') {
        const op = t[i++], r = factor(null);
        if (op === '÷' && r === 0) throw new Error('div0');
        v = op === '×' ? v * r : v / r;
      }
      return v;
    };
    let v = term(null);
    while (t[i] === '+' || t[i] === '−') {
      const op = t[i++], r = term(v);
      v = op === '+' ? v + r : v - r;
    }
    return parseFloat(v.toPrecision(12));
  }

  // выражение без хвостового оператора и недописанного «-»
  function complete() {
    const t = tokens.slice();
    while (t.length && (isOp(t[t.length - 1]) || t[t.length - 1] === '-')) t.pop();
    return t;
  }

  function fmtTyped(s, first) {
    if (s.includes('e')) return minus(s);
    const neg = s.startsWith('-');
    const [int, frac] = (neg ? s.slice(1) : s).split('.');
    const body = (int ? Number(int).toLocaleString(LOC) : '') + (frac !== undefined ? DEC + frac : '');
    if (!neg) return body;
    if (!body) return first ? '−' : '(−';
    return first ? '−' + body : '(−' + body + ')';
  }
  const fmtExpr = (t) => t.map((x, i) => (isOp(x) ? ' ' + x + ' ' : x === '%' ? '%' : fmtTyped(x, i === 0))).join('');

  function fmtCalc(v) {
    if (!isFinite(v)) return fmtNum(v);
    const a = Math.abs(v);
    if (a >= 1e15 || (a !== 0 && a < 1e-9)) return sci(v, 8);
    return minus(v.toLocaleString(LOC, { maximumFractionDigits: 12 }));
  }

  function numToken(v) {
    return isFinite(v) ? String(v) : null;
  }

  function press(k) {
    if (done && k === '=') return;
    if (done) {
      done = false;
      if (/^[\d.]$/.test(k) || k === 'back' || calcErr) tokens = [];
      else if (k !== 'C' && k !== '=') tokens = numToken(result) ? [numToken(result)] : [];
      calcErr = '';
      if (k === 'back') return render();
    }
    const lt = tokens[tokens.length - 1];

    if (/^\d$/.test(k)) {
      if (isNum(lt)) {
        if (lt.replace(/\D/g, '').length >= 15 || lt.includes('e')) return;
        tokens[tokens.length - 1] = lt === '0' ? k : lt === '-0' ? '-' + k : lt + k;
      } else {
        if (lt === '%') tokens.push('×');
        tokens.push(k);
      }
    } else if (k === '.') {
      if (isNum(lt)) {
        if (!lt.includes('.') && !lt.includes('e')) tokens[tokens.length - 1] = (lt === '-' ? '-0' : lt) + '.';
      } else {
        if (lt === '%') tokens.push('×');
        tokens.push('0.');
      }
    } else if (isOp(k)) {
      if (lt === '-') tokens.pop();
      const prev = tokens[tokens.length - 1];
      if (!tokens.length) tokens.push('0', k);
      else if (isOp(prev)) tokens[tokens.length - 1] = k;
      else {
        if (prev.endsWith('.')) tokens[tokens.length - 1] = prev.slice(0, -1);
        tokens.push(k);
      }
    } else if (k === '%') {
      if (isNum(lt) && lt !== '-') {
        if (lt.endsWith('.')) tokens[tokens.length - 1] = lt.slice(0, -1);
        tokens.push('%');
      }
    } else if (k === '±') {
      const idx = lt === '%' ? tokens.length - 2 : tokens.length - 1;
      const t = tokens[idx];
      if (isNum(t)) {
        const flipped = t.startsWith('-') ? t.slice(1) : '-' + t;
        if (flipped) tokens[idx] = flipped;
        else tokens.splice(idx, 1);
      } else tokens.push('-');
    } else if (k === 'back') {
      if (isNum(lt) && lt.length > 1) tokens[tokens.length - 1] = lt.slice(0, -1);
      else tokens.pop();
    } else if (k === 'C') {
      tokens = [];
    } else if (k === '=') {
      const t = complete();
      if (!t.length) return render();
      resultExpr = fmtExpr(t) + ' =';
      try {
        result = evaluate(t);
        if (!isFinite(result)) throw new Error('overflow');
      } catch (e) {
        result = NaN;
        calcErr = e.message === 'div0' ? 'div0' : 'overflow';
      }
      done = true;
      if (!calcErr) epic(splitExpr(t), result);
    }
    render();
  }

  function render() {
    const main = $('#calcMain');
    let text, live = '', prev = '';
    if (done) {
      prev = resultExpr;
      text = calcErr ? ERR[calcErr] : fmtCalc(result);
      calcVal = calcErr ? NaN : result;
    } else {
      text = tokens.length ? fmtExpr(tokens) : '0';
      const t = complete();
      try { calcVal = t.length ? evaluate(t) : 0; } catch (e) { calcVal = NaN; }
      if (t.length > 1 && isFinite(calcVal)) live = '= ' + fmtCalc(calcVal);
    }
    main.textContent = text;
    const len = text.length;
    main.className = 'calc-main' + (calcErr && done ? ' err' : len > 22 ? ' s3' : len > 16 ? ' s2' : len > 11 ? ' s1' : '');
    $('#calcPrev').textContent = prev;
    $('#calcLive').textContent = live;
    $('#calcRice').textContent = isFinite(calcVal) && (tokens.length || done)
      ? `🍚 ${fmtNum(calcVal)} ${plural(calcVal, GRAIN_WORDS)} ≈ ${fmtNum(calcVal * GRAIN.mass)} ${G} · ${lenText(calcVal * L)} ${lng('в линию', 'in a line')}`
      : (calcErr ? '' : lng('🍚 считаем в зёрнах', '🍚 counting in grains'));
  }

  function riceRain() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const screen = $('#calcScreen');
    for (let i = 0; i < 14; i++) {
      const g = document.createElement('span');
      g.className = 'grain-fx';
      g.style.left = 4 + Math.random() * 92 + '%';
      g.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
      g.style.animationDuration = 0.7 + Math.random() * 0.6 + 's';
      g.style.animationDelay = Math.random() * 0.25 + 's';
      screen.appendChild(g);
      setTimeout(() => g.remove(), 1700);
    }
  }

  /* ---------- эпичное «=»: катсцена вычисления ----------
     Числа взлетают к порталу со знаком, дрожат, кружатся по орбите среди вопросиков,
     камера наезжает, экран трясёт, цвета двоятся, к центру стягиваются лучи света.
     Тишина, белая вспышка — и под дроп в портале появляется ответ, летят зелёные галочки,
     фон мигает неоном. Клик или любая клавиша — пропустить. */
  const EPIC_CAPS = lng(['Легендарно', 'Рисовый удар', 'Математика свершилась', 'Абсолютный рис', 'Критический урон', 'Это было эпично', 'Готово, шеф'],
    ['Legendary', 'Rice strike', 'Math has been done', 'Absolute rice', 'Critical hit', 'That was epic', 'Done, chef']);
  const NEON = ['#00ff6a', '#2979ff', '#b000ff', '#ff1744'];
  // секунды: подготовка → дрожь → орбита → кульминация → слияние → дроп → конец
  const T = { tension: 0.7, orbit: 1.7, climax: 2.9, merge: 3.9, drop: 4.1, end: 6.5, out: 6.9 };
  const BEAT = 0.4;
  let soundOn = store.get('rice:sound', true);
  let actx = null, noiseBuf = null;
  let scene = null;

  function syncSound() {
    const b = $('#calcSound');
    b.textContent = soundOn ? '🔊' : '🔇';
    b.setAttribute('aria-pressed', String(soundOn));
  }
  $('#calcSound').onclick = () => { soundOn = !soundOn; store.set('rice:sound', soundOn); syncSound(); };
  syncSound();

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const phase = (t, a, b) => clamp01((t - a) / (b - a));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;
  const easeOutBack = (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

  /* ---- саундтрек: всё синтезируется через Web Audio, без файлов ---- */
  function soundtrack(full) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { return null; }
    const ctx = actx;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + 0.05;
    const D = full ? T.drop : 0;
    const at = (s) => t0 + s;
    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);

    const env = (param, start, peak, attack, end) => {
      param.setValueAtTime(0.0001, start);
      param.exponentialRampToValueAtTime(peak, start + attack);
      param.exponentialRampToValueAtTime(0.0001, end);
    };
    const tone = (start, dur, type, f0, f1, peak, dest = out) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, start);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, start + dur * 0.8);
      env(g.gain, start, peak, 0.005, start + dur);
      o.connect(g).connect(dest);
      o.start(start);
      o.stop(start + dur + 0.05);
    };
    const noise = (start, dur, type, freq, peak, f1) => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf;
      f.type = type;
      f.frequency.setValueAtTime(freq, start);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, start + dur);
      env(g.gain, start, peak, 0.004, start + dur);
      src.connect(f).connect(g).connect(out);
      src.start(start, Math.random());
      src.stop(start + dur + 0.05);
    };
    const kick = (s, peak = 1) => tone(s, 0.45, 'sine', 160, 38, peak);
    const snare = (s, peak) => { noise(s, 0.12, 'highpass', 1400, peak); tone(s, 0.08, 'triangle', 240, 180, peak * 0.5); };

    if (full) {
      // гудящий дрон, фильтр которого раскрывается к кульминации, и обрыв перед слиянием
      const droneF = ctx.createBiquadFilter(), droneG = ctx.createGain();
      droneF.type = 'lowpass';
      droneF.frequency.setValueAtTime(160, at(0));
      droneF.frequency.exponentialRampToValueAtTime(3200, at(T.merge));
      droneG.gain.setValueAtTime(0.0001, at(0));
      droneG.gain.exponentialRampToValueAtTime(0.1, at(T.tension));
      droneG.gain.exponentialRampToValueAtTime(0.32, at(T.merge - 0.02));
      droneG.gain.linearRampToValueAtTime(0, at(T.merge));
      droneF.connect(droneG).connect(out);
      [55, 55.4, 82.4, 110.3].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, at(0));
        o.frequency.exponentialRampToValueAtTime(f * 2, at(T.merge));
        o.connect(droneF);
        o.start(at(0));
        o.stop(at(T.merge + 0.05));
      });
      // райзер из шума на орбите и в кульминации
      const rs = ctx.createBufferSource(), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
      rs.buffer = noiseBuf;
      rs.loop = true;
      rf.type = 'bandpass';
      rf.Q.value = 1.2;
      rf.frequency.setValueAtTime(400, at(T.orbit));
      rf.frequency.exponentialRampToValueAtTime(9000, at(T.merge));
      rg.gain.setValueAtTime(0.0001, at(T.orbit));
      rg.gain.exponentialRampToValueAtTime(0.45, at(T.merge - 0.02));
      rg.gain.linearRampToValueAtTime(0, at(T.merge));
      rs.connect(rf).connect(rg).connect(out);
      rs.start(at(T.orbit));
      rs.stop(at(T.merge + 0.05));
      // ускоряющиеся ударные
      for (let s = T.tension, gap = 0.34, i = 0; s < T.merge - 0.03; s += gap, gap = Math.max(0.045, gap * 0.9), i++) {
        snare(at(s), 0.12 + 0.4 * phase(s, T.tension, T.merge));
        if (s < T.climax && i % 2 === 0) kick(at(s), 0.55);
      }
    }

    // дроп: удар, бас, аккорды на слабую долю, хлопки и хэты (Am – Am – F – F – C – G)
    kick(at(D), 1.3);
    noise(at(D), 1.4, 'lowpass', 7000, 0.8, 180);
    const roots = [55, 55, 43.65, 43.65, 65.41, 49];
    const chords = [[220, 261.63, 329.63], [220, 261.63, 329.63], [174.61, 220, 261.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
    const stabF = ctx.createBiquadFilter();
    stabF.type = 'lowpass';
    stabF.frequency.value = 3800;
    stabF.connect(out);
    roots.forEach((root, b) => {
      const tb = at(D + b * BEAT);
      if (b) kick(tb, 1);
      tone(tb, BEAT * 0.95, 'sawtooth', root, root, 0.3);
      tone(tb, BEAT * 0.95, 'sine', root, root, 0.5);
      if (b % 2) noise(tb, 0.18, 'bandpass', 1800, 0.55);
      noise(tb + BEAT / 2, 0.05, 'highpass', 8000, 0.18);
      chords[b].forEach((f) => [0.996, 1.004].forEach((k) => tone(tb + BEAT / 2, 0.2, 'sawtooth', f * k, f * k, 0.07, stabF)));
    });
    kick(at(D + roots.length * BEAT), 1.2);
    noise(at(D + roots.length * BEAT), 1.1, 'lowpass', 6000, 0.55, 150);

    return {
      stop() {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 0.08);
        setTimeout(() => out.disconnect(), 200);
      },
    };
  }

  // делим выражение по последнему оператору: «1 + 2 × 3» → «1 + 2», «×», «3»
  function splitExpr(t) {
    let i = t.length - 1;
    while (i >= 0 && !isOp(t[i])) i--;
    if (i <= 0) return { left: fmtExpr(t), sign: '=', right: '' };
    return { left: fmtExpr(t.slice(0, i)), sign: t[i], right: fmtExpr(t.slice(i + 1)) };
  }

  function stopEpic() {
    if (!scene) return;
    const s = scene;
    scene = null;
    cancelAnimationFrame(s.raf);
    window.removeEventListener('resize', s.resize);
    if (s.music) s.music.stop();
    s.el.remove();
    riceRain();
  }

  function epic(expr, value) {
    stopEpic();
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const music = soundOn ? soundtrack(!reduce) : null;
    if (reduce) { riceRain(); return; }

    const el = document.createElement('div');
    el.className = 'epic';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<canvas></canvas><div class="epic-skip">${lng('нажми, чтобы пропустить', 'tap to skip')}</div>`;
    document.body.appendChild(el);
    const cv = $('canvas', el), g = cv.getContext('2d');
    const s = scene = { el, music, raf: 0, resize: null };
    let W = 0, H = 0, dpr = 1;
    s.resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    };
    s.resize();
    window.addEventListener('resize', s.resize);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); stopEpic(); });

    const FONT = '"Roboto", system-ui, sans-serif';
    const answer = fmtCalc(value);
    const caption = EPIC_CAPS[Math.floor(Math.random() * EPIC_CAPS.length)];
    const src = $('#calcMain').getBoundingClientRect();
    const srcX = src.left + src.width / 2, srcY = src.top + src.height / 2;
    const parts = [];   // «?», галочки и рис
    const rays = [];    // лучи света, летящие к центру
    let last = performance.now(), start = last, vibrated = false;

    const spawn = (kind, n, speed) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
        parts.push({ kind, x: Math.cos(a) * 20, y: Math.sin(a) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          rot: Math.random() * 6, vr: Math.random() * 8 - 4, size: 12 + Math.random() * 22, age: 0, life: 0.9 + Math.random() * 0.8 });
      }
    };
    // текст с хроматической аберрацией: красный и голубой сдвинуты, белый поверх
    const text = (str, x, y, size, color, ab, weight = 900) => {
      g.font = `${weight} ${size}px ${FONT}`;
      ab = Math.min(ab, size * 0.07);
      if (ab > 0.4) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(255, 0, 70, .85)';
        g.fillText(str, x - ab, y);
        g.fillStyle = 'rgba(0, 220, 255, .85)';
        g.fillText(str, x + ab, y);
        g.globalCompositeOperation = 'source-over';
      }
      g.fillStyle = color;
      g.fillText(str, x, y);
    };
    const check = (p, a) => {
      const k = p.size;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(Math.sin(p.rot) * 0.35);
      g.lineCap = g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(-0.45 * k, 0);
      g.lineTo(-0.12 * k, 0.32 * k);
      g.lineTo(0.5 * k, -0.38 * k);
      g.strokeStyle = `rgba(0, 230, 118, ${a * 0.3})`;
      g.lineWidth = k * 0.45;
      g.stroke();
      g.strokeStyle = `rgba(0, 230, 118, ${a})`;
      g.lineWidth = k * 0.2;
      g.stroke();
      g.restore();
    };

    const frame = (now) => {
      const t = (now - start) / 1000, dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t >= T.out) { stopEpic(); return; }
      const R = Math.max(46, Math.min(110, Math.min(W, H) * 0.12));
      const cx = W / 2, cy = H * 0.46;
      const dropT = t - T.drop, beatF = dropT >= 0 ? (dropT / (BEAT / 2)) % 1 : 0;
      const pulse = dropT >= 0 ? Math.pow(1 - beatF, 2) : 0;

      cv.style.opacity = Math.min(phase(t, 0, 0.25), 1 - phase(t, T.end, T.out));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // фон: тьма, а на дропе — неон в такт
      g.fillStyle = '#07060a';
      g.fillRect(0, 0, W, H);
      if (dropT >= 0) {
        g.globalAlpha = 0.25 + 0.6 * pulse;
        g.fillStyle = NEON[Math.floor(dropT / (BEAT / 2)) % NEON.length];
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }
      const vig = g.createRadialGradient(cx, cy, R, cx, cy, Math.max(W, H) * 0.75);
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(0, 0, 0, .7)');
      g.fillStyle = vig;
      g.fillRect(0, 0, W, H);

      // камера: наезд и тряска
      const climax = phase(t, T.climax, T.merge);
      let zoom = 1 + 0.4 * easeIn(climax), shake = 0, ab = 0;
      if (t < T.climax) shake = t > T.tension ? 1.5 + 2 * phase(t, T.tension, T.climax) : 0;
      else if (t < T.merge) { shake = 4 + 18 * climax; ab = 2 + 9 * climax; }
      else if (dropT < 0) zoom = 1.4 + 0.3 * phase(t, T.merge, T.drop);
      else { zoom = 1 + 0.25 * Math.exp(-dropT * 6) + 0.05 * pulse; shake = 16 * pulse; ab = 8 * pulse; }
      g.translate(cx + (Math.random() * 2 - 1) * shake, cy + (Math.random() * 2 - 1) * shake);
      g.scale(zoom, zoom);
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      // лучи света стягиваются к центру
      if (t > T.climax && t < T.merge) {
        const far = Math.hypot(W, H) / zoom;
        for (let i = 0, n = Math.round((60 + 160 * climax) * dt); i < n; i++) {
          rays.push({ a: Math.random() * Math.PI * 2, d: far * (0.6 + Math.random() * 0.4), len: 60 + Math.random() * 160, v: 1400 + Math.random() * 1400 });
        }
      }
      g.lineCap = 'round';
      for (let i = rays.length - 1; i >= 0; i--) {
        const r = rays[i];
        r.d -= r.v * dt;
        if (r.d < R * 0.9 || t >= T.merge) { rays.splice(i, 1); continue; }
        const c = Math.cos(r.a), sn = Math.sin(r.a);
        g.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.85, r.d / 400)})`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(c * r.d, sn * r.d);
        g.lineTo(c * (r.d + r.len), sn * (r.d + r.len));
        g.stroke();
      }

      // частицы: «?» до дропа, галочки и рис после
      const density = Math.max(0.45, Math.min(1, (W * H) / (1280 * 800)));
      if (t > T.orbit && t < T.merge) spawn('q', Math.round((25 + 90 * phase(t, T.orbit, T.merge)) * density * dt + Math.random() * 0.5), 260 + 260 * climax);
      if (dropT >= 0 && !s.burst) {
        // вопросы кончились — теперь только галочки (и немного риса)
        s.burst = true;
        parts.length = 0;
        spawn('ok', Math.round(46 * density), 620);
        spawn('rice', Math.round(30 * density), 520);
      }
      if (dropT >= 0 && t < T.end) spawn('ok', Math.round(30 * dt + Math.random() * 0.6), 480);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age > p.life) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const a = 1 - p.age / p.life;
        if (p.kind === 'ok') check(p, a);
        else if (p.kind === 'rice') {
          p.vy += 500 * dt;
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = `rgba(251, 247, 236, ${a})`;
          g.beginPath();
          g.ellipse(0, 0, 3.5, 8, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        } else {
          g.save();
          g.globalAlpha = a;
          g.translate(p.x, p.y);
          g.rotate(p.rot * 0.4);
          text('?', 0, 0, p.size, '#fff', ab * 0.6, 800);
          g.restore();
        }
      }

      // числа: взлетают с экрана калькулятора, дрожат по бокам, уходят на орбиту и сливаются с порталом
      const opSize = (() => {
        let size = R * 0.95;
        g.font = `900 ${size}px ${FONT}`;
        const widest = Math.max(g.measureText(expr.left).width, expr.right ? g.measureText(expr.right).width : 0);
        const room = W / 2 / 1.4 - R * 1.35 - 12;
        if (widest > room) size = Math.max(14, size * room / widest);
        return size;
      })();
      g.font = `900 ${opSize}px ${FONT}`;
      const sideL = R * 1.35 + g.measureText(expr.left).width / 2;
      const sideR = expr.right ? R * 1.35 + g.measureText(expr.right).width / 2 : 0;
      const ops = [];
      if (dropT < 0) {
        const nums = expr.right ? [[expr.left, -sideL, Math.PI], [expr.right, sideR, 0]] : [[expr.left, -sideL, Math.PI]];
        nums.forEach(([str, side, a0], k) => {
          let x, y, sc = 1, alpha = 1;
          if (t < T.tension) {
            const p = easeOutBack(phase(t, 0, T.tension));
            x = (srcX - cx + (k ? 30 : -30)) * (1 - p) + side * p;
            y = (srcY - cy) * (1 - p) - Math.sin(Math.PI * phase(t, 0, T.tension)) * 60;
          } else if (t < T.orbit) {
            const w = phase(t, T.tension, T.orbit);
            x = side + Math.sin(t * 23 + k) * 3 * w + (Math.random() - 0.5) * 2.5 * w;
            y = Math.sin(t * 11 + k * 2) * 7 * w + (Math.random() - 0.5) * 2.5 * w;
          } else {
            // угол — интеграл ускоряющейся угловой скорости ω = 2 + 26·u²
            const span = T.drop - T.orbit, d = t - T.orbit;
            const ang = a0 + 2 * d + 26 * d * d * d / (3 * span * span);
            const settle = easeOut(phase(t, T.orbit, T.orbit + 0.35));
            const merge = easeIn(phase(t, T.merge, T.drop));
            const r = (Math.abs(side) * (1 - settle) + R * 1.75 * settle) * (1 - merge);
            x = Math.cos(ang) * r;
            y = Math.sin(ang) * r * 0.5;
            sc = (1 + 0.22 * Math.sin(ang)) * (1 - 0.8 * merge);
            alpha = 1 - merge * 0.7;
          }
          ops.push({ str, x, y, sc, alpha, front: y >= 0 });
        });
      }
      const drawOp = (o) => {
        g.save();
        g.globalAlpha = o.alpha;
        g.translate(o.x, o.y);
        g.scale(o.sc, o.sc);
        g.shadowColor = '#ffd54a';
        g.shadowBlur = 18;
        text(o.str, 0, 0, opSize, '#fff', ab);
        g.restore();
      };
      ops.filter((o) => !o.front).forEach(drawOp);

      // портал
      const merging = phase(t, T.merge, T.drop);
      let pr = R * (1 + (t > T.climax && dropT < 0 ? 0.05 * Math.sin(t * 50) : 0) - 0.25 * merging);
      if (dropT >= 0) {
        g.font = `900 ${R}px ${FONT}`;
        const fit = Math.min(1, (R * 1.6) / g.measureText(answer).width);
        const aSize = Math.max(18, R * fit);
        g.font = `900 ${aSize}px ${FONT}`;
        pr = Math.max(R, g.measureText(answer).width / 2 + 22) * (1 + 0.35 * Math.exp(-dropT * 7) * Math.cos(dropT * 18) + 0.04 * pulse);
        s.aSize = aSize;
      }
      const ringColor = dropT >= 0 ? '#00e676' : '#ffd54a';
      g.save();
      g.shadowColor = ringColor;
      g.shadowBlur = 30 + 50 * merging + 30 * pulse;
      g.fillStyle = '#120f08';
      g.beginPath();
      g.arc(0, 0, pr, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = ringColor;
      g.stroke();
      g.restore();
      g.save();
      g.setLineDash([10, 12]);
      g.lineDashOffset = -t * (60 + 400 * climax);
      g.lineWidth = 2;
      g.strokeStyle = dropT >= 0 ? 'rgba(0, 230, 118, .6)' : 'rgba(255, 213, 74, .5)';
      g.beginPath();
      g.arc(0, 0, pr * 1.28, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      if (dropT < 0) text(expr.sign, 0, R * 0.04, R * 1.1, '#fff', ab);
      else {
        g.save();
        g.shadowColor = '#00e676';
        g.shadowBlur = 24;
        text(answer, 0, s.aSize * 0.04, s.aSize, '#fff', ab);
        g.restore();
        const capA = phase(dropT, 0.15, 0.45);
        if (capA > 0) {
          g.save();
          g.globalAlpha = capA;
          g.shadowColor = 'rgba(0, 0, 0, .8)';
          g.shadowBlur = 10;
          const capSize = Math.max(13, Math.min(26, W * 0.045));
          g.font = `800 ${capSize}px ${FONT}`;
          if ('letterSpacing' in g) g.letterSpacing = capSize * 0.35 + 'px';
          text(caption.toUpperCase(), 0, pr * 1.28 + capSize * 1.6, capSize, '#fff', ab * 0.5, 800);
          if ('letterSpacing' in g) g.letterSpacing = '0px';
          g.restore();
        }
      }

      // «?» кружатся вокруг портала, пока числа дрожат
      if (t > T.tension * 0.7 && t < T.merge) {
        const qa = Math.min(phase(t, T.tension * 0.7, T.tension + 0.3), 1 - merging);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + t * (1.4 + 3 * climax);
          g.save();
          g.globalAlpha = 0.75 * qa;
          text('?', Math.cos(a) * R * 1.55, Math.sin(a) * R * 1.55, R * 0.24, '#fff', ab * 0.5, 800);
          g.restore();
        }
      }
      ops.filter((o) => o.front).forEach(drawOp);

      // слияние: экран заливает белым, на дропе вспышка гаснет
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const flash = dropT < 0 ? easeIn(merging) : Math.exp(-dropT * 5);
      if (flash > 0.01) {
        g.fillStyle = `rgba(255, 255, 255, ${flash})`;
        g.fillRect(0, 0, W, H);
      }
      if (dropT >= 0 && !vibrated) {
        vibrated = true;
        if (navigator.vibrate) navigator.vibrate([90, 110, 90, 110, 160]);
      }
      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
  }

  $('#calcKeys').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) press(b.dataset.k);
  });

  const KEYS = { '/': '÷', '*': '×', x: '×', 'х': '×', '-': '−', '+': '+', ',': '.', '.': '.', '%': '%', Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', Delete: 'C' };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (scene) { e.preventDefault(); stopEpic(); return; }
    if (e.target.closest('input, select, textarea')) return;
    const k = /^\d$/.test(e.key) ? e.key : KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    press(k);
    const btn = $(`#calcKeys button[data-k="${k}"]`);
    if (btn) { btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 120); }
  });

  /* =========================================================
     Переводчик
     ========================================================= */
  const inEl = $('#rcIn'), outEl = $('#rcOut'), unitSel = $('#rcUnit'), tgtSel = $('#rcTarget');
  const grid = $('#rcGrid'), chips = $('#rcChips');

  unitSel.innerHTML = RICE_UNITS.map((u) => `<option value="${u.id}">${u.name}</option>`).join('');
  tgtSel.innerHTML = CATS.map((c) => `<optgroup label="${c.name}">${TARGETS.filter((t) => t.cat === c.id)
    .map((t) => `<option value="${t.id}">${t.name}${t.sym ? ' (' + t.sym + ')' : ''}</option>`).join('')}</optgroup>`).join('');
  chips.innerHTML = [{ id: 'all', name: lng('Все', 'All'), icon: 'apps' }, ...CATS]
    .map((c) => `<button class="chip sl" data-cat="${c.id}"><span class="ms">${c.icon}</span>${c.name}</button>`).join('');

  const unit = () => RICE_UNITS.find((u) => u.id === unitSel.value) || RICE_UNITS[0];
  const target = () => TARGET[tgtSel.value] || TARGETS[0];
  let grains = NaN;
  let cat = store.get('rice:cat', 'all');

  function fromRice() {
    grains = parseNum(inEl.value) * unit().k;
    outEl.value = isFinite(grains) ? fmtInput(grains * target().k) : '';
    update();
  }
  function fromTarget() {
    grains = parseNum(outEl.value) / target().k;
    inEl.value = isFinite(grains) ? fmtInput(grains / unit().k) : '';
    update();
  }

  function valueHtml(t, v) {
    if (!isFinite(v)) return '—';
    if (t.fmt) return t.fmt(v);
    return fmtNum(v) + (t.sym ? ` <small>${t.sym}</small>` : '');
  }

  function update() {
    const t = target();
    $('#rcInHint').textContent = isFinite(grains)
      ? `${fmtNum(grains)} ${plural(grains, GRAIN_WORDS)} · ${fmtNum(grains * GRAIN.mass)} ${G}`
      : lng('введи число', 'enter a number');
    const extra = isFinite(grains) && t.fmt ? t.fmt(grains * t.k) : '';
    const note = isFinite(grains) && t.note ? t.note(grains) : '';
    $('#rcOutHint').textContent = [extra, note || t.hint || CATS.find((c) => c.id === t.cat).hint].filter(Boolean).join(' · ');

    $$('.rcard', grid).forEach((el) => {
      const item = TARGET[el.dataset.id];
      $('.val', el).innerHTML = valueHtml(item, grains * item.k);
      if (item.note) $('.nt', el).textContent = isFinite(grains) ? item.note(grains) : '';
      el.classList.toggle('on', item.id === t.id);
    });

    store.set('rice:val', isFinite(parseNum(inEl.value)) ? parseNum(inEl.value) : null);
    store.set('rice:unit', unitSel.value);
    store.set('rice:target', tgtSel.value);
  }

  function buildGrid() {
    const cats = cat === 'all' ? CATS : CATS.filter((c) => c.id === cat);
    grid.innerHTML = cats.map((c) => `
      <section class="rgroup">
        <div class="rgroup-head"><span class="ms">${c.icon}</span><div><b>${c.name}</b><span>${c.hint}</span></div></div>
        <div class="rgrid">${TARGETS.filter((t) => t.cat === c.id).map((t) => `
          <button class="rcard sl" data-id="${t.id}" title="${lng('Скопировать', 'Copy')}">
            <span class="em">${t.e}</span>
            <span class="rc-body">
              <span class="nm">${t.name}</span>
              <span class="val"></span>
              ${t.hint ? `<span class="ht">${t.hint}</span>` : ''}
              <span class="nt"></span>
            </span>
          </button>`).join('')}
        </div>
      </section>`).join('');
    $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
    update();
  }

  function copy(text) {
    const ok = () => snack(lng('Скопировано: ', 'Copied: ') + text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, () => snack(text));
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { snack(text); }
    ta.remove();
  }

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.rcard');
    if (!card) return;
    const t = TARGET[card.dataset.id];
    const n = parseNum(inEl.value);
    if (!isFinite(n)) return;
    copy(`${riceAmount(unit(), n)} ${lng('риса', 'of rice')} = ${$('.val', card).textContent.replace(/\s+/g, ' ').trim()} — ${t.name}`);
  });
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    cat = b.dataset.cat;
    store.set('rice:cat', cat);
    buildGrid();
  });

  inEl.addEventListener('input', fromRice);
  outEl.addEventListener('input', fromTarget);
  unitSel.addEventListener('change', fromRice);
  tgtSel.addEventListener('change', fromRice);

  $('#calcSend').onclick = () => {
    if (!isFinite(calcVal)) { snack(lng('Сначала посчитай что-нибудь', 'Calculate something first')); return; }
    unitSel.value = 'grain';
    inEl.value = fmtInput(calcVal);
    fromRice();
    $('#conv').scrollIntoView({ behavior: 'smooth', block: 'start' });
    snack(lng(`${fmtNum(calcVal)} ${plural(calcVal, GRAIN_WORDS)} отправлено в переводчик`, `${fmtNum(calcVal)} ${plural(calcVal, GRAIN_WORDS)} sent to the converter`));
  };

  /* ---------- старт ---------- */
  if (!CATS.some((c) => c.id === cat)) cat = 'all';
  unitSel.value = RICE_UNITS.some((u) => u.id === store.get('rice:unit')) ? store.get('rice:unit') : 'kg';
  tgtSel.value = TARGET[store.get('rice:target')] ? store.get('rice:target') : 'stud';
  const saved = store.get('rice:val', undefined);
  if (saved !== undefined) inEl.value = saved == null ? '' : fmtInput(saved);
  else {
    const legacy = parseFloat(String(store.get('rice:in', '1')).replace(/\s/g, '').replace(',', '.'));
    inEl.value = fmtInput(isFinite(legacy) ? legacy : 1);
  }
  grains = parseNum(inEl.value) * unit().k;
  outEl.value = isFinite(grains) ? fmtInput(grains * target().k) : '';
  buildGrid();
  render();
})();
