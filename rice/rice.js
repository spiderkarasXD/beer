'use strict';
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
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const minus = (s) => s.replace('-', '−');

  // 2,25 × 10¹² для очень больших и очень маленьких, иначе обычная запись
  function sci(v, digits) {
    const [m, e] = v.toExponential(digits).split('e');
    return minus(String(parseFloat(m)).replace('.', ',')) + ' × 10' + String(+e).split('').map((c) => SUP[c]).join('');
  }
  function fmtNum(v) {
    if (Number.isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e15 || a < 1e-6) return sci(v, 3);
    return minus(a >= 1e6
      ? v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
      : v.toLocaleString('ru-RU', { maximumSignificantDigits: 6 }));
  }
  // для полей ввода: без пробелов-разделителей, чтобы было удобно править
  function fmtInput(v) {
    if (!isFinite(v)) return '';
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e15 || a < 1e-6)) {
      const [m, e] = v.toExponential(5).split('e');
      return String(parseFloat(m)).replace('.', ',') + 'e' + e.replace('+', '');
    }
    return v.toLocaleString('ru-RU', { maximumSignificantDigits: 8, useGrouping: false });
  }
  function parseNum(s) {
    s = String(s).replace(/\s/g, '').replace(',', '.').replace('−', '-');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  }
  function plural(n, forms) {
    if (!Number.isInteger(n)) return forms[1];
    const n100 = Math.abs(n) % 100, n10 = n100 % 10;
    if (n100 > 10 && n100 < 20) return forms[2];
    if (n10 === 1) return forms[0];
    if (n10 > 1 && n10 < 5) return forms[1];
    return forms[2];
  }
  const GRAIN_WORDS = ['зерно', 'зерна', 'зёрен'];

  const TIME_UNITS = [[31557600, 'г.'], [86400, 'дн'], [3600, 'ч'], [60, 'мин'], [1, 'с']];
  function humanTime(sec) {
    if (!isFinite(sec)) return fmtNum(sec);
    const sign = sec < 0 ? '−' : '';
    sec = Math.abs(sec);
    if (sec < 60) return sign + fmtNum(sec) + ' с';
    if (sec >= 31557600 * 1e4) return sign + fmtNum(sec / 31557600) + ' лет';
    sec = Math.round(sec);
    const i = TIME_UNITS.findIndex(([k]) => sec >= k);
    const [k, u] = TIME_UNITS[i];
    const major = Math.floor(sec / k);
    let out = major.toLocaleString('ru-RU') + ' ' + u;
    const next = TIME_UNITS[i + 1];
    if (next) {
      const minor = Math.floor((sec - major * k) / next[0]);
      if (minor) out += ' ' + minor + ' ' + next[1];
    }
    return sign + out;
  }

  const BYTE_UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ', 'ЭБ', 'ЗБ', 'ИБ'];
  function humanBytes(bits) {
    if (!isFinite(bits) || Math.abs(bits) < 8) return fmtNum(bits) + ' бит';
    let v = bits / 8, i = 0;
    while (Math.abs(v) >= 1024 && i < BYTE_UNITS.length - 1) { v /= 1024; i++; }
    return (Math.abs(v) < 1e6 ? minus(v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })) : fmtNum(v)) + ' ' + BYTE_UNITS[i];
  }

  /* ---------- рисовая физика ---------- */
  const GRAIN = {
    len: 0.007,     // м — длина зерна длиннозёрного риса
    mass: 0.025,    // г
    density: 0.8,   // г/мл — насыпная плотность сухого риса
    kcal: 0.09,     // ккал (≈ 360 ккал на 100 г)
    price: 0.12,    // ₽ за грамм (120 ₽/кг)
  };
  const L = GRAIN.len;
  const VOL = GRAIN.mass / GRAIN.density;      // мл на зерно, насыпью
  const KG = GRAIN.mass / 1000;
  const C = 299792458;                          // скорость света, м/с
  const SPERM_ML = 3;                           // объём, мл
  const SPERM_NORM = 16;                        // млн/мл, нижняя граница ВОЗ

  function lenText(m) {
    const a = Math.abs(m);
    if (a < 1) return fmtNum(m * 100) + ' см';
    if (a < 1000) return fmtNum(m) + ' м';
    return fmtNum(m / 1000) + ' км';
  }

  function spermNote(grains) {
    const c = grains / SPERM_ML / 1e6;
    if (c < SPERM_NORM) return `ниже нормы ВОЗ (${SPERM_NORM} млн/мл): докинь ещё ${fmtNum((SPERM_NORM * SPERM_ML * 1e6 - grains) * KG)} кг риса`;
    if (c <= 250) return 'норма ВОЗ ✅';
    return 'это уже рисовая каша 🍚';
  }

  const RICE_UNITS = [
    { id: 'grain', name: 'Зёрна', forms: GRAIN_WORDS, k: 1 },
    { id: 'g', name: 'Граммы', short: 'г', k: 1 / GRAIN.mass },
    { id: 'kg', name: 'Килограммы', short: 'кг', k: 1000 / GRAIN.mass },
    { id: 'cup', name: 'Стаканы (250 мл)', forms: ['стакан', 'стакана', 'стаканов'], k: 250 / VOL },
    { id: 'bag', name: 'Мешки (25 кг)', forms: ['мешок', 'мешка', 'мешков'], k: 25000 / GRAIN.mass },
  ];
  const riceAmount = (u, n) => fmtNum(n) + ' ' + (u.short || plural(n, u.forms));

  const CATS = [
    { id: 'len', name: 'Длина', icon: 'straighten', hint: 'если выложить все зёрна в линию, 1 зерно ≈ 7 мм' },
    { id: 'game', name: 'Игры', icon: 'sports_esports', hint: 'та же рисовая линия в игровых единицах' },
    { id: 'vol', name: 'Объём', icon: 'water_drop', hint: 'насыпью, 1 л ≈ 800 г риса' },
    { id: 'mass', name: 'Масса', icon: 'scale', hint: '1 зерно ≈ 25 мг' },
    { id: 'elec', name: 'Электричество', icon: 'bolt', hint: 'каждое зерно — батарейка АА на 1,5 В, всё последовательно' },
    { id: 'energy', name: 'Энергия', icon: 'local_fire_department', hint: 'сколько энергии сидит в рисе' },
    { id: 'speed', name: 'Скорость', icon: 'speed', hint: 'пробежать всю рисовую линию за 1 секунду' },
    { id: 'bio', name: 'Биология', icon: 'biotech', hint: 'рис глазами биолога' },
    { id: 'money', name: 'Деньги и время', icon: 'payments', hint: 'во что обойдётся и сколько считать' },
    { id: 'data', name: 'Данные', icon: 'memory', hint: '1 зерно = 1 бит' },
  ];

  // k — сколько единиц приходится на одно зерно
  const TARGETS = [
    { id: 'mm', cat: 'len', e: '📏', name: 'Миллиметры', sym: 'мм', k: L * 1000 },
    { id: 'cm', cat: 'len', e: '📏', name: 'Сантиметры', sym: 'см', k: L * 100 },
    { id: 'm', cat: 'len', e: '📐', name: 'Метры', sym: 'м', k: L },
    { id: 'km', cat: 'len', e: '🛣️', name: 'Километры', sym: 'км', k: L / 1000 },
    { id: 'in', cat: 'len', e: '🇺🇸', name: 'Дюймы', sym: 'дюйм.', k: L / 0.0254 },
    { id: 'banana', cat: 'len', e: '🍌', name: 'Бананы', k: L / 0.18, hint: 'banana for scale, 18 см' },
    { id: 'parrot', cat: 'len', e: '🦜', name: 'Попугаи', k: L / 0.1, hint: 'удав = 38 попугаев' },
    { id: 'field', cat: 'len', e: '⚽', name: 'Футбольные поля', k: L / 105, hint: '105 м' },
    { id: 'eiffel', cat: 'len', e: '🗼', name: 'Эйфелевы башни', k: L / 330, hint: '330 м' },
    { id: 'moon', cat: 'len', e: '🌕', name: 'Расстояния до Луны', k: L / 384400000, hint: '384 400 км' },

    { id: 'stud', cat: 'game', e: '🧱', name: 'Стады Roblox', sym: 'studs', k: L / 0.28, hint: '1 стад = 28 см' },
    { id: 'noob', cat: 'game', e: '🙂', name: 'Нубы Roblox в рост', k: L / (5 * 0.28), hint: 'персонаж ≈ 5 стадов' },
    { id: 'hu', cat: 'game', e: '🔫', name: 'Юниты CS2', sym: 'u', k: L / 0.0254, hint: '1 юнит ≈ 1 дюйм (Source 2)' },
    { id: 'csman', cat: 'game', e: '🧍', name: 'Игроки CS2 в рост', k: L / (72 * 0.0254), hint: 'игрок = 72 юнита' },
    { id: 'mc', cat: 'game', e: '⛏️', name: 'Блоки Minecraft', k: L, hint: '1 блок = 1 м' },
    { id: 'px', cat: 'game', e: '🖥️', name: 'Пиксели', sym: 'px', k: L / (0.0254 / 96), hint: 'при 96 DPI' },

    { id: 'ml', cat: 'vol', e: '💧', name: 'Миллилитры', sym: 'мл', k: VOL },
    { id: 'l', cat: 'vol', e: '🧴', name: 'Литры', sym: 'л', k: VOL / 1000 },
    { id: 'm3', cat: 'vol', e: '📦', name: 'Кубометры', sym: 'м³', k: VOL / 1e6 },
    { id: 'tsp', cat: 'vol', e: '🥄', name: 'Чайные ложки', k: VOL / 5, hint: '5 мл' },
    { id: 'glass', cat: 'vol', e: '🥛', name: 'Стаканы', k: VOL / 250, hint: '250 мл' },
    { id: 'beer', cat: 'vol', e: '🍺', name: 'Бутылки пива', k: VOL / 500, hint: '0,5 л' },
    { id: 'bath', cat: 'vol', e: '🛁', name: 'Ванны', k: VOL / 150000, hint: '150 л' },

    { id: 'mg', cat: 'mass', e: '⚖️', name: 'Миллиграммы', sym: 'мг', k: GRAIN.mass * 1000 },
    { id: 'gr', cat: 'mass', e: '⚖️', name: 'Граммы', sym: 'г', k: GRAIN.mass },
    { id: 'kgm', cat: 'mass', e: '🏋️', name: 'Килограммы', sym: 'кг', k: KG },
    { id: 't', cat: 'mass', e: '🚛', name: 'Тонны', sym: 'т', k: KG / 1000 },
    { id: 'elephant', cat: 'mass', e: '🐘', name: 'Слоны', k: KG / 5000, hint: '5 т' },

    { id: 'v', cat: 'elec', e: '🔋', name: 'Вольты', sym: 'В', k: 1.5, hint: '1 зерно = 1,5 В' },
    { id: 'kv', cat: 'elec', e: '🔋', name: 'Киловольты', sym: 'кВ', k: 1.5 / 1000 },
    { id: 'socket', cat: 'elec', e: '🔌', name: 'Розетки', k: 1.5 / 220, hint: '220 В' },
    { id: 'lightning', cat: 'elec', e: '🌩️', name: 'Молнии', k: 1.5 / 3e8, hint: '≈ 300 млн В' },

    { id: 'kcal', cat: 'energy', e: '🔥', name: 'Калории', sym: 'ккал', k: GRAIN.kcal, hint: 'сухой рис ≈ 360 ккал на 100 г' },
    { id: 'kettle', cat: 'energy', e: '☕', name: 'Вскипячённые чайники', k: GRAIN.kcal * 4184 / (1.7 * 80 * 4186), hint: 'если сжечь: 1,7 л с 20 до 100 °C' },
    { id: 'mc2', cat: 'energy', e: '☢️', name: 'Энергия E = mc²', sym: 'Дж', k: KG * C * C, hint: 'если вся масса станет энергией' },
    { id: 'tnt', cat: 'energy', e: '💥', name: 'Тротиловый эквивалент', sym: 'т', k: KG * C * C / 4.184e9, hint: 'та же E = mc² в тоннах тротила' },

    { id: 'mps', cat: 'speed', e: '🏃', name: 'Метры в секунду', sym: 'м/с', k: L },
    { id: 'kmh', cat: 'speed', e: '🚗', name: 'Километры в час', sym: 'км/ч', k: L * 3.6 },
    { id: 'snail', cat: 'speed', e: '🐌', name: 'Улитки', k: L / 0.001, hint: 'улитка ползёт ≈ 1 мм/с' },
    { id: 'mach', cat: 'speed', e: '✈️', name: 'Махи', sym: 'M', k: L / 343, hint: 'скорость звука 343 м/с' },
    { id: 'light', cat: 'speed', e: '🌌', name: 'Скорости света', sym: 'c', k: L / C },

    { id: 'sperm', cat: 'bio', e: '🧪', name: 'Густота спермы', sym: 'млн/мл', k: 1 / SPERM_ML / 1e6, hint: 'каждое зерно — сперматозоид в 3 мл', note: spermNote },
    { id: 'mosquito', cat: 'bio', e: '🦟', name: 'Комары по массе', k: GRAIN.mass / 0.0025, hint: 'комар ≈ 2,5 мг' },
    { id: 'human', cat: 'bio', e: '🧍', name: 'Люди по массе', k: KG / 70, hint: '70 кг' },

    { id: 'rub', cat: 'money', e: '💸', name: 'Рубли', sym: '₽', k: GRAIN.price * GRAIN.mass, hint: 'рис по 120 ₽/кг' },
    { id: 'pint', cat: 'money', e: '🍻', name: 'Кружки пива', k: GRAIN.price * GRAIN.mass / 250, hint: 'по 250 ₽' },
    { id: 'portion', cat: 'money', e: '🍛', name: 'Порции риса', k: GRAIN.mass / 75, hint: '75 г сухого риса' },
    { id: 'count', cat: 'money', e: '⏱️', name: 'Пересчитать вручную', sym: 'с', k: 1, hint: '1 зерно в секунду без перерывов', fmt: humanTime },

    { id: 'bit', cat: 'data', e: '🧠', name: 'Информация', sym: 'бит', k: 1, hint: '1 зерно = 1 бит', fmt: humanBytes },
    { id: 'floppy', cat: 'data', e: '💾', name: 'Дискеты', k: 1 / (1474560 * 8), hint: '1,44 МБ' },
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
  let calcErr = '';
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
    const body = (int ? Number(int).toLocaleString('ru-RU') : '') + (frac !== undefined ? ',' + frac : '');
    if (!neg) return body;
    if (!body) return first ? '−' : '(−';
    return first ? '−' + body : '(−' + body + ')';
  }
  const fmtExpr = (t) => t.map((x, i) => (isOp(x) ? ' ' + x + ' ' : x === '%' ? '%' : fmtTyped(x, i === 0))).join('');

  function fmtCalc(v) {
    if (!isFinite(v)) return fmtNum(v);
    const a = Math.abs(v);
    if (a >= 1e15 || (a !== 0 && a < 1e-9)) return sci(v, 8);
    return minus(v.toLocaleString('ru-RU', { maximumFractionDigits: 12 }));
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
        calcErr = e.message === 'div0' ? 'На ноль рис не делится 🍚' : 'Слишком много риса 🌾';
      }
      done = true;
      if (!calcErr) epic(result);
    }
    render();
  }

  function render() {
    const main = $('#calcMain');
    let text, live = '', prev = '';
    if (done) {
      prev = resultExpr;
      text = calcErr || fmtCalc(result);
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
      ? `🍚 ${fmtNum(calcVal)} ${plural(calcVal, GRAIN_WORDS)} ≈ ${fmtNum(calcVal * GRAIN.mass)} г · ${lenText(calcVal * L)} в линию`
      : (calcErr ? '' : '🍚 считаем в зёрнах');
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

  /* ---------- эпичное «=»: вспышка, ударная волна, взрыв риса, тряска и БУМ ---------- */
  const EPIC_CAPS = ['Легендарно', 'Рисовый удар', 'Математика свершилась', 'Абсолютный рис', 'Критический урон', 'Это было эпично', 'Готово, шеф'];
  let soundOn = store.get('rice:sound', true);
  let actx = null;
  let epicEl = null, epicTimer = null;

  function syncSound() {
    const b = $('#calcSound');
    b.textContent = soundOn ? '🔊' : '🔇';
    b.setAttribute('aria-pressed', String(soundOn));
  }
  $('#calcSound').onclick = () => { soundOn = !soundOn; store.set('rice:sound', soundOn); syncSound(); };
  syncSound();

  // Звук синтезируется на лету: бас-удар, взрыв из шума и киношный «бряяям»
  function boom(power) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, tail = 1.2 + power * 0.08;
      const comp = actx.createDynamicsCompressor();
      const master = actx.createGain();
      master.gain.value = 0.8;
      master.connect(comp).connect(actx.destination);
      const env = (g, peak, attack, end) => {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + end);
      };

      const kick = actx.createOscillator(), kickG = actx.createGain();
      kick.frequency.setValueAtTime(160, t);
      kick.frequency.exponentialRampToValueAtTime(36, t + 0.6);
      env(kickG, 1, 0.008, tail);
      kick.connect(kickG).connect(master);
      kick.start(t);
      kick.stop(t + tail + 0.1);

      const len = Math.floor(actx.sampleRate * 1.6);
      const buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const noise = actx.createBufferSource(), lp = actx.createBiquadFilter(), noiseG = actx.createGain();
      noise.buffer = buf;
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5000, t);
      lp.frequency.exponentialRampToValueAtTime(150, t + 1.3);
      env(noiseG, 0.7, 0.005, 1.6);
      noise.connect(lp).connect(noiseG).connect(master);
      noise.start(t);

      const braamF = actx.createBiquadFilter(), braamG = actx.createGain();
      braamF.type = 'lowpass';
      braamF.frequency.setValueAtTime(250, t);
      braamF.frequency.linearRampToValueAtTime(1400, t + 0.35);
      braamF.frequency.exponentialRampToValueAtTime(200, t + 2);
      env(braamG, 0.22, 0.12, 2.2);
      braamF.connect(braamG).connect(master);
      [55, 82.4, 110, 110.6].forEach((f) => {
        const o = actx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(braamF);
        o.start(t);
        o.stop(t + 2.3);
      });
    } catch (e) { /* без звука — так без звука */ }
  }

  function epic(value) {
    // сила эффекта растёт с размером числа: 1 → 0, миллиард → 9
    const power = Math.min(15, Math.log10(Math.abs(value) + 1));
    boom(power);
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (epicEl) epicEl.remove();
    clearTimeout(epicTimer);
    const screen = $('#calcScreen');
    const r = screen.getBoundingClientRect();
    const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    const text = fmtCalc(value);

    epicEl = document.createElement('div');
    epicEl.className = 'epic';
    epicEl.setAttribute('aria-hidden', 'true');
    epicEl.innerHTML = `
      <div class="epic-dim"></div>
      <div class="epic-flash"></div>
      <div class="epic-ring" style="left:${ox}px;top:${oy}px"></div>
      <div class="epic-ring two" style="left:${ox}px;top:${oy}px"></div>
      <div class="epic-num"></div>
      <div class="epic-cap"></div>`;
    const num = $('.epic-num', epicEl);
    const size = Math.max(40, Math.min(170, (window.innerWidth * 0.9) / (text.length * 0.62)));
    num.textContent = text;
    num.style.fontSize = size + 'px';
    const cap = $('.epic-cap', epicEl);
    cap.textContent = EPIC_CAPS[Math.floor(Math.random() * EPIC_CAPS.length)];
    cap.style.setProperty('--cap-gap', size * 0.55 + 12 + 'px');
    document.body.appendChild(epicEl);

    const count = Math.round(40 + power * 8);
    const reach = Math.max(window.innerWidth, window.innerHeight) * 0.6;
    for (let i = 0; i < count; i++) {
      const g = document.createElement('span');
      g.className = 'epic-grain';
      g.style.left = ox + 'px';
      g.style.top = oy + 'px';
      epicEl.appendChild(g);
      const a = Math.random() * Math.PI * 2, dist = reach * (0.35 + Math.random() * 0.65);
      const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist, rot = Math.random() * 1440 - 720;
      g.animate([
        { transform: 'translate(0, 0) rotate(0deg) scale(.4)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.2)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx * 1.15}px, ${dy + 260}px) rotate(${rot * 1.4}deg) scale(1)`, opacity: 0 },
      ], { duration: 1200 + Math.random() * 700, easing: 'cubic-bezier(.12, .8, .3, 1)', fill: 'forwards' });
    }

    const wrap = $('.view-wrap');
    [wrap, screen].forEach((el) => el.classList.remove('epic-shake', 'epic-hit'));
    void wrap.offsetWidth;
    wrap.classList.add('epic-shake');
    screen.classList.add('epic-hit');
    if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
    riceRain();

    epicTimer = setTimeout(() => {
      if (epicEl) epicEl.remove();
      epicEl = null;
      wrap.classList.remove('epic-shake');
      screen.classList.remove('epic-hit');
    }, 2100);
  }

  $('#calcKeys').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) press(b.dataset.k);
  });

  const KEYS = { '/': '÷', '*': '×', x: '×', 'х': '×', '-': '−', '+': '+', ',': '.', '.': '.', '%': '%', Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', Delete: 'C' };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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
  chips.innerHTML = [{ id: 'all', name: 'Все', icon: 'apps' }, ...CATS]
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
      ? `${fmtNum(grains)} ${plural(grains, GRAIN_WORDS)} · ${fmtNum(grains * GRAIN.mass)} г`
      : 'введи число';
    const extra = isFinite(grains) && t.fmt ? t.fmt(grains * t.k) : '';
    const note = isFinite(grains) && t.note ? t.note(grains) : '';
    $('#rcOutHint').textContent = [extra, note || t.hint || CATS.find((c) => c.id === t.cat).hint].filter(Boolean).join(' · ');

    $$('.rcard', grid).forEach((el) => {
      const item = TARGET[el.dataset.id];
      $('.val', el).innerHTML = valueHtml(item, grains * item.k);
      if (item.note) $('.nt', el).textContent = isFinite(grains) ? item.note(grains) : '';
      el.classList.toggle('on', item.id === t.id);
    });

    store.set('rice:in', inEl.value);
    store.set('rice:unit', unitSel.value);
    store.set('rice:target', tgtSel.value);
  }

  function buildGrid() {
    const cats = cat === 'all' ? CATS : CATS.filter((c) => c.id === cat);
    grid.innerHTML = cats.map((c) => `
      <section class="rgroup">
        <div class="rgroup-head"><span class="ms">${c.icon}</span><div><b>${c.name}</b><span>${c.hint}</span></div></div>
        <div class="rgrid">${TARGETS.filter((t) => t.cat === c.id).map((t) => `
          <button class="rcard sl" data-id="${t.id}" title="Скопировать">
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
    const ok = () => snack('Скопировано: ' + text);
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
    copy(`${riceAmount(unit(), n)} риса = ${$('.val', card).textContent.replace(/\s+/g, ' ').trim()} — ${t.name}`);
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
    if (!isFinite(calcVal)) { snack('Сначала посчитай что-нибудь'); return; }
    unitSel.value = 'grain';
    inEl.value = fmtInput(calcVal);
    fromRice();
    $('#conv').scrollIntoView({ behavior: 'smooth', block: 'start' });
    snack(`${fmtNum(calcVal)} ${plural(calcVal, GRAIN_WORDS)} отправлено в переводчик`);
  };

  /* ---------- старт ---------- */
  if (!CATS.some((c) => c.id === cat)) cat = 'all';
  unitSel.value = RICE_UNITS.some((u) => u.id === store.get('rice:unit')) ? store.get('rice:unit') : 'kg';
  tgtSel.value = TARGET[store.get('rice:target')] ? store.get('rice:target') : 'stud';
  inEl.value = store.get('rice:in', '1');
  grains = parseNum(inEl.value) * unit().k;
  outEl.value = isFinite(grains) ? fmtInput(grains * target().k) : '';
  buildGrid();
  render();
})();
