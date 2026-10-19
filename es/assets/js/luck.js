'use strict';
/* =========================================================
   Удача: кошелёк ($10 на старте), Плинко, Ракетка, Барабаны, Колесо
   Все суммы хранятся в центах (целые числа).
   ========================================================= */
(() => {
  const { $, $$, h, store, snack, money, esc } = App;

  const START = 1000;     // $10
  const MIN_BET = 10;     // $0.10
  const GOALS = [
    { c: 5000, label: '$50' }, { c: 10000, label: '$100' }, { c: 50000, label: '$500' },
    { c: 100000, label: '$1K' }, { c: 1000000, label: '$10K' }, { c: 10000000, label: '$100K' },
    { c: 100000000, label: '$1M' }, { c: 1000000000, label: '$10M' },
  ];

  /* ---------------- кошелёк ---------------- */
  const wallet = (() => {
    const s = Object.assign(
      { cents: START, peak: START, wagered: 0, returned: 0, bets: 0, best: 0, resets: 0, goals: 0 },
      store.get('luck', {})
    );
    const listeners = new Set();
    const save = () => store.set('luck', s);
    const emit = (delta) => listeners.forEach((fn) => fn(s.cents, delta));

    function checkGoals() {
      while (s.goals < GOALS.length && s.cents >= GOALS[s.goals].c) {
        const g = GOALS[s.goals++];
        App.confetti(80);
        snack('Цель достигнута: ' + g.label + ' 🏆', { duration: 4000 });
      }
    }

    return {
      get cents() { return s.cents; },
      get stats() { return s; },
      /** Списать взносу. false — если денег не хватает. */
      bet(c) {
        c = Math.floor(c);
        if (c < MIN_BET || c > s.cents) return false;
        s.cents -= c; s.wagered += c; s.bets++;
        save(); emit(-c);
        return true;
      },
      /** Зачислить выплату (полную, включая взносу). */
      pay(c, stake = 0) {
        c = Math.floor(c);
        if (c <= 0) return;
        s.cents += c; s.returned += c;
        if (c - stake > s.best) s.best = c - stake;
        if (s.cents > s.peak) s.peak = s.cents;
        checkGoals();
        save(); emit(c);
      },
      reset() {
        s.cents = START; s.resets++;
        save(); emit(0);
      },
      broke() { return s.cents < MIN_BET; },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
  })();
  App.wallet = wallet;

  async function offerReset() {
    const ok = await App.dialog({
      icon: 'money_off', title: 'Ты банкрот 😵',
      text: 'Деньги закончились. Начать заново с $10? Счётчик банкротств увеличится.',
      actions: [{ label: 'Позже', value: false }, { label: 'Начать с $10', value: true, style: '' }],
    });
    if (ok) { wallet.reset(); snack('Держи $10. Не проиграй сразу 😉'); }
  }

  /* ---------------- поле взноси ---------------- */
  function betControl(key, def = 100) {
    const el = h(`
      <div class="bet">
        <div class="field">
          <span class="prefix">$</span>
          <input type="number" inputmode="decimal" min="0.1" step="0.1">
          <label>Взноса</label>
        </div>
        <div class="quick">
          <button data-q="half">½</button>
          <button data-q="double">×2</button>
          <button data-q="min">MIN</button>
          <button data-q="max">MAX</button>
        </div>
      </div>`);
    const input = $('input', el);
    const set = (c) => { c = Math.max(MIN_BET, Math.floor(c)); input.value = (c / 100).toFixed(2); store.set('bet:' + key, c); };
    set(Math.min(store.get('bet:' + key, def), Math.max(MIN_BET, wallet.cents)));
    const get = () => Math.round(parseFloat(String(input.value).replace(',', '.')) * 100) || 0;
    input.addEventListener('change', () => set(get()));
    $$('.quick button', el).forEach((b) => (b.onclick = () => {
      const c = get();
      if (b.dataset.q === 'half') set(c / 2);
      if (b.dataset.q === 'double') set(Math.min(c * 2, Math.max(MIN_BET, wallet.cents)));
      if (b.dataset.q === 'min') set(MIN_BET);
      if (b.dataset.q === 'max') set(Math.max(MIN_BET, wallet.cents));
    }));
    return {
      el,
      /** Валидирует взносу; возвращает центы или 0 (и показывает подсказку). */
      take() {
        const c = get();
        if (!c || c < MIN_BET) { snack('Минимальная взноса — ' + money(MIN_BET)); return 0; }
        if (c > wallet.cents) {
          if (wallet.broke()) offerReset(); else snack('Не хватает денег. Баланс: ' + money(wallet.cents));
          return 0;
        }
        if (!wallet.bet(c)) return 0;
        store.set('bet:' + key, c);
        return c;
      },
      value: get,
      disable(d) { input.disabled = d; $$('.quick button', el).forEach((b) => (b.disabled = d)); },
    };
  }

  /* ---------------- лобби (вкладка «Удача») ---------------- */
  App.luckLobby = (body, cardsHtml) => {
    const s = wallet.stats;
    body.appendChild(h(`
      <div>
        <section class="wallet-hero">
          <div>
            <div class="label-l">Твой баланс</div>
            <div class="amount" id="lbAmount">${money(wallet.cents)}</div>
            <div class="goal" id="lbGoal"></div>
          </div>
          <div class="side">
            <button class="btn sl" id="lbReset" hidden><span class="ms">restart_alt</span>Начать с $10</button>
            <span class="chip assist"><span class="ms">trending_up</span>Пик: ${money(s.peak)}</span>
          </div>
        </section>
        <div class="grid-cards">${cardsHtml}</div>
        <h2 class="title-l section-title">Статистика</h2>
        <div class="stat-grid">
          <div class="stat"><b>${s.bets.toLocaleString('ru-RU')}</b><span>ставок сделано</span></div>
          <div class="stat"><b>${money(s.wagered)}</b><span>поставлено всего</span></div>
          <div class="stat"><b>${money(s.best)}</b><span>самый крупный выигрыш</span></div>
          <div class="stat"><b>${s.resets}</b><span>банкротств</span></div>
        </div>
        <h2 class="title-l section-title">Цели</h2>
        <div class="body-m muted">Начинаешь с $10. Сможешь раскрутиться до миллиона?</div>
        <div class="ach">${GOALS.map((g, i) => `<span class="chip assist ${i < s.goals ? 'done' : ''}"><span class="ms">${i < s.goals ? 'check_circle' : 'radio_button_unchecked'}</span>${g.label}</span>`).join('')}</div>
        <p class="body-s muted" style="margin-top:24px">Это игра на виртуальные доллары. Настоящие деньги здесь не используются и вывести их нельзя.</p>
      </div>`));

    const next = GOALS[s.goals];
    const prev = s.goals ? GOALS[s.goals - 1].c : 0;
    $('#lbGoal', body).innerHTML = next
      ? `<div class="body-m">Следующая цель: <b>${next.label}</b></div><div class="progress"><div style="width:${Math.max(2, Math.min(100, ((wallet.cents - prev) / (next.c - prev)) * 100))}%"></div></div>`
      : '<div class="body-m"><b>Все цели выполнены. Ты легенда удачи 👑</b></div>';
    const rb = $('#lbReset', body);
    rb.hidden = !wallet.broke();
    rb.onclick = () => { wallet.reset(); App.rerender(); };
  };

  function luckRoute(id, title, mount) {
    App.route('luck/' + id, { title, nav: 'games', back: '#/luck', luck: true, mount });
  }

  function resultText(net) {
    return net > 0 ? `<span class="win-text">+${money(net)}</span>` : net < 0 ? `<span class="lose-text">−${money(-net)}</span>` : '<span class="muted">±$0.00</span>';
  }

  /* =====================================================
     ПЛИНКО
     ===================================================== */
  const PLINKO = {
    8: {
      low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    },
    12: {
      low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    },
    16: {
      low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
      medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    },
  };

  luckRoute('plinko', 'Плинко', (el, sc) => {
    let rows = store.get('plinko:rows', 12);
    let risk = store.get('plinko:risk', 'medium');
    const balls = [];
    const pegFlash = new Map();
    const bucketFlash = new Map();
    let geo;

    const bet = betControl('plinko', 50);
    el.appendChild(h(`
      <div class="game-layout">
        <div class="stage">
          <div class="plinko-hist" id="plHist"></div>
          <canvas class="plinko-canvas" id="plCanvas"></canvas>
        </div>
        <div class="panel" id="plPanel">
          <h3>Риск</h3>
          <div class="segmented block" id="plRisk">
            <button data-r="low"><span class="ms">check</span>Низкий</button>
            <button data-r="medium"><span class="ms">check</span>Средний</button>
            <button data-r="high"><span class="ms">check</span>Высокий</button>
          </div>
          <h3>Ряды</h3>
          <div class="segmented block" id="plRows">
            <button data-n="8"><span class="ms">check</span>8</button>
            <button data-n="12"><span class="ms">check</span>12</button>
            <button data-n="16"><span class="ms">check</span>16</button>
          </div>
          <div id="plBet"></div>
          <button class="btn lg sl" id="plDrop"><span class="ms">arrow_downward</span>Бросить шарик</button>
          <button class="btn tonal sl" id="plAuto"><span class="ms">repeat</span>Авто ×10</button>
          <div class="body-m muted">Последний: <span id="plLast">—</span></div>
        </div>
      </div>`));
    $('#plBet', el).appendChild(bet.el);

    const cv = $('#plCanvas', el), ctx = cv.getContext('2d');

    function layout() {
      const W = 720;
      const gap = W / (rows + 3);
      const rowGap = gap * 0.88;
      const top = 36;
      const bucketY = top + (rows - 1) * rowGap + rowGap * 0.75;
      const H = bucketY + 46;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geo = { W, H, gap, rowGap, top, bucketY, cx: W / 2, pegR: Math.max(3, gap * 0.1), ballR: Math.max(5, gap * 0.2) };
    }

    const pegX = (i, j) => geo.cx + (j - (i + 2) / 2) * geo.gap;
    const pegY = (i) => geo.top + i * geo.rowGap;

    function bucketColor(m, maxM) {
      const t = Math.log(m + 1) / Math.log(maxM + 1); // 0..1
      const hue = 48 - t * 48;
      const dark = document.documentElement.dataset.theme === 'dark';
      return `hsl(${hue}, ${85}%, ${dark ? 58 - t * 8 : 52 - t * 6}%)`;
    }

    function syncUI() {
      $$('#plRisk button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === risk)));
      $$('#plRows button', el).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === rows)));
      const busy = balls.length > 0;
      $$('#plRisk button, #plRows button', el).forEach((b) => (b.disabled = busy));
    }

    function drop() {
      const c = bet.take();
      if (!c) return false;
      // путь: rows решений лево/право
      const path = [];
      for (let i = 0; i < rows; i++) { const r = App.rand() < 0.5 ? 0 : 1; path.push(r); }
      balls.push({ bet: c, path, t: 0, rows, risk, jitter: (App.rand() - 0.5) * 6 });
      syncUI();
      return true;
    }

    function ballPos(b) {
      // сегмент 0: падение сверху на первый штырёк; сегменты 1..rows: прыжки
      const seg = Math.floor(b.t);
      const f = b.t - seg;
      let k = 0;
      for (let i = 0; i < Math.min(seg, b.rows); i++) k += b.path[i];
      const pt = (i, kk) => ({ x: geo.cx + (kk - i / 2) * geo.gap, y: pegY(i) - geo.pegR - geo.ballR });
      if (seg === 0) {
        const p1 = pt(0, 0);
        return { x: geo.cx + b.jitter * (1 - f), y: 0 + (p1.y - 0) * f * f };
      }
      if (seg <= b.rows) {
        const i = seg - 1;
        const p0 = pt(i, k - b.path[i]);
        let p1;
        if (seg < b.rows) p1 = pt(i + 1, k);
        else p1 = { x: geo.cx + (k - b.rows / 2) * geo.gap, y: geo.bucketY + 6 };
        const x = p0.x + (p1.x - p0.x) * f;
        const y = p0.y + (p1.y - p0.y) * f * f - Math.sin(Math.PI * f) * geo.rowGap * 0.35 * (1 - f);
        return { x, y };
      }
      return null;
    }

    function land(b) {
      let k = 0;
      b.path.forEach((p) => (k += p));
      const mult = PLINKO[b.rows][b.risk][k];
      const win = Math.floor(b.bet * mult);
      wallet.pay(win, b.bet);
      bucketFlash.set(k, performance.now());
      $('#plLast', el).innerHTML = `×${mult} · ${resultText(win - b.bet)}`;
      const hist = $('#plHist', el);
      const chip = h(`<span class="chip assist" style="background:${bucketColor(mult, PLINKO[b.rows][b.risk][0])};color:#1f1b13;border-color:transparent;font-weight:700">×${mult}</span>`);
      hist.prepend(chip);
      while (hist.children.length > 12) hist.lastChild.remove();
      if (mult >= 10) { App.pop(el.querySelector('.stage'), '×' + mult + '!', 'win'); if (mult >= 100) App.confetti(); }
    }

    function draw(now) {
      const { W, H } = geo;
      ctx.clearRect(0, 0, W, H);
      // штырьки
      const pegCol = App.color('on-surface-variant');
      const hot = App.color('primary');
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < i + 3; j++) {
          const fl = pegFlash.get(i + ':' + j);
          const a = fl ? Math.max(0, 1 - (now - fl) / 300) : 0;
          ctx.beginPath();
          ctx.arc(pegX(i, j), pegY(i), geo.pegR * (1 + a * 0.8), 0, Math.PI * 2);
          ctx.fillStyle = a > 0 ? hot : pegCol;
          ctx.globalAlpha = a > 0 ? 1 : 0.7;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // корзины
      const mults = PLINKO[rows][risk];
      const bw = geo.gap - 4;
      mults.forEach((m, k) => {
        const x = geo.cx + (k - rows / 2) * geo.gap;
        const fl = bucketFlash.get(k);
        const a = fl ? Math.max(0, 1 - (now - fl) / 400) : 0;
        const y = geo.bucketY + a * 8;
        ctx.fillStyle = bucketColor(m, mults[0]);
        App.roundRect(ctx, x - bw / 2, y, bw, 30, 7);
        ctx.fillStyle = '#1f1b13';
        ctx.font = `700 ${rows === 16 ? 10 : rows === 12 ? 12 : 14}px Roboto, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(m >= 100 ? m + '' : m + '×', x, y + 15);
      });
      // шарики
      for (let n = balls.length - 1; n >= 0; n--) {
        const b = balls[n];
        const p = ballPos(b);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, geo.ballR, 0, Math.PI * 2);
        ctx.fillStyle = App.color('primary');
        ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.fill();
        ctx.shadowColor = 'transparent';
      }
    }

    let last = 0;
    sc.raf((now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const speed = rows === 16 ? 9.5 : rows === 12 ? 8 : 6.5; // сегментов в секунду
      for (let n = balls.length - 1; n >= 0; n--) {
        const b = balls[n];
        const before = Math.floor(b.t);
        b.t += dt * speed;
        const after = Math.floor(b.t);
        if (after > before && after - 1 < b.rows) {
          // ударился о штырёк ряда after-1
          const i = after - 1;
          let k = 0;
          for (let q = 0; q < i; q++) k += b.path[q];
          pegFlash.set(i + ':' + (k + 1), now);
        }
        if (b.t >= b.rows + 1) { balls.splice(n, 1); land(b); syncUI(); }
      }
      draw(now);
    });

    $$('#plRisk button', el).forEach((b) => (b.onclick = () => { if (balls.length) return; risk = b.dataset.r; store.set('plinko:risk', risk); syncUI(); }));
    $$('#plRows button', el).forEach((b) => (b.onclick = () => { if (balls.length) return; rows = +b.dataset.n; store.set('plinko:rows', rows); layout(); syncUI(); }));
    $('#plDrop', el).onclick = drop;
    let autoLeft = 0;
    $('#plAuto', el).onclick = () => {
      if (autoLeft) { autoLeft = 0; return; }
      autoLeft = 10;
      const btn = $('#plAuto', el);
      btn.innerHTML = '<span class="ms">stop</span>Стоп';
      const tick = () => {
        if (!autoLeft || !drop()) { autoLeft = 0; btn.innerHTML = '<span class="ms">repeat</span>Авто ×10'; return; }
        autoLeft--;
        if (autoLeft) sc.timeout(tick, 280); else btn.innerHTML = '<span class="ms">repeat</span>Авто ×10';
      };
      tick();
    };
    // если ушли со страницы с шариками в полёте — честно досчитываем их
    sc.add(() => { while (balls.length) land(balls.pop()); });

    layout();
    syncUI();
  });

  /* =====================================================
     РАКЕТКА (crash)
     ===================================================== */
  luckRoute('crash', 'Ракетка', (el, sc) => {
    const K = 0.00014; // скорость роста множителя
    let state = 'idle', crashAt = 1, startT = 0, stake = 0, mult = 1, cashedAt = 0;
    let autoOn = store.get('crash:autoOn', false);
    const hist = store.get('crash:hist', []);
    let stars = Array.from({ length: 60 }, () => ({ x: App.rand(), y: App.rand(), s: App.rand() * 1.5 + 0.5 }));
    let shake = 0;

    const bet = betControl('crash', 100);
    el.appendChild(h(`
      <div class="game-layout">
        <div>
          <div class="hist-row" id="crHist"></div>
          <div class="stage crash-stage" style="padding:0">
            <canvas class="crash-canvas" id="crCanvas"></canvas>
            <div class="crash-mult" id="crMult">1.00×</div>
            <div class="crash-sub" id="crSub">Сделай взносу и запускай ракету 🚀</div>
          </div>
        </div>
        <div class="panel">
          <div id="crBet"></div>
          <div class="row nowrap">
            <div class="field" style="flex:1">
              <input type="number" id="crAuto" inputmode="decimal" min="1.01" step="0.1">
              <label>Автовывод на ×</label>
            </div>
            <button class="icon-btn outlined sl" id="crAutoToggle" title="Автовывод"><span class="ms">bolt</span></button>
          </div>
          <button class="btn lg sl" id="crGo"><span class="ms">rocket_launch</span>Запуск</button>
          <div class="body-m muted">Множитель растёт, пока ракета летит. Нажми «Забрать» до взрыва — получишь взносу × множитель. Взорвётся — взноса сгорит.</div>
        </div>
      </div>`));
    $('#crBet', el).appendChild(bet.el);

    const cv = $('#crCanvas', el), ctx = cv.getContext('2d');
    const autoInput = $('#crAuto', el);
    autoInput.value = store.get('crash:auto', 2).toFixed(2);
    autoInput.addEventListener('change', () => {
      let v = parseFloat(autoInput.value.replace(',', '.'));
      if (!(v >= 1.01)) v = 1.01;
      autoInput.value = v.toFixed(2);
      store.set('crash:auto', v);
    });
    const autoBtn = $('#crAutoToggle', el);
    const syncAuto = () => { autoBtn.classList.toggle('selected', autoOn); autoInput.disabled = !autoOn; };
    autoBtn.onclick = () => { autoOn = !autoOn; store.set('crash:autoOn', autoOn); syncAuto(); };
    syncAuto();

    function renderHist() {
      $('#crHist', el).innerHTML = hist.map((m) => `<span class="chip assist ${m >= 2 ? 'hi' : m < 1.2 ? 'lo' : ''}">${m.toFixed(2)}×</span>`).join('') || '<span class="chip assist">Ещё не было запусков</span>';
    }

    function resize() {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(300, r.width) * dpr;
      cv.height = Math.max(190, r.height) * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const goBtn = $('#crGo', el);
    function setBtn() {
      if (state === 'running' && !cashedAt) {
        goBtn.className = 'btn lg tertiary sl';
        goBtn.innerHTML = `<span class="ms">savings</span>Забрать ${money(Math.floor(stake * mult))}`;
      } else if (state === 'running') {
        goBtn.className = 'btn lg sl'; goBtn.disabled = true;
        goBtn.innerHTML = '<span class="ms">hourglass_top</span>Ждём взрыва…';
        return;
      } else {
        goBtn.className = 'btn lg sl';
        goBtn.innerHTML = '<span class="ms">rocket_launch</span>Запуск';
      }
      goBtn.disabled = false;
    }

    function launch() {
      stake = bet.take();
      if (!stake) return;
      // P(crash >= m) = 0.97 / m  → RTP 97%
      const r = App.rand();
      crashAt = Math.min(1000, Math.max(1, Math.floor((97 / (1 - r))) / 100));
      state = 'running'; startT = performance.now(); mult = 1; cashedAt = 0;
      bet.disable(true);
      $('#crMult', el).className = 'crash-mult';
      $('#crSub', el).textContent = 'Взноса ' + money(stake);
      setBtn();
    }

    function cashout(at) {
      if (state !== 'running' || cashedAt) return;
      cashedAt = at;
      const win = Math.floor(stake * at);
      wallet.pay(win, stake);
      $('#crSub', el).innerHTML = `Забрал на ${at.toFixed(2)}× · ${resultText(win - stake)}`;
      $('#crMult', el).classList.add('cashed');
      App.pop($('.crash-stage', el), '+' + money(win - stake), 'win');
      if (at >= 10) App.confetti();
      setBtn();
    }

    function crash() {
      state = 'crashed';
      mult = crashAt;
      shake = 1;
      hist.unshift(crashAt); hist.length = Math.min(hist.length, 20);
      store.set('crash:hist', hist);
      renderHist();
      const m = $('#crMult', el);
      m.textContent = crashAt.toFixed(2) + '×';
      if (!cashedAt) {
        m.className = 'crash-mult crashed';
        $('#crSub', el).innerHTML = `Взорвалась на ${crashAt.toFixed(2)}× · ${resultText(-stake)}`;
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      } else {
        $('#crSub', el).innerHTML += ` · улетела до ${crashAt.toFixed(2)}×`;
      }
      bet.disable(false);
      sc.timeout(() => { if (state === 'crashed') state = 'idle'; }, 1200);
      setBtn();
      if (wallet.broke()) sc.timeout(offerReset, 1300);
    }

    goBtn.onclick = () => {
      if (state === 'running') cashout(mult);
      else launch();
    };
    sc.on(document, 'keydown', (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); goBtn.click(); }
    });

    function draw(now) {
      const r = cv.getBoundingClientRect();
      const W = r.width, H = r.height;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (shake > 0) { ctx.translate((App.rand() - 0.5) * 12 * shake, (App.rand() - 0.5) * 12 * shake); shake = Math.max(0, shake - 0.04); }

      const elapsed = state === 'running' ? now - startT : state === 'crashed' || state === 'idle' ? Math.log(mult) / K : 0;
      const pad = { l: 44, r: 24, t: 24, b: 30 };
      const tMax = Math.max(8000, elapsed * 1.15);
      const mMax = Math.max(2, mult * 1.25);
      const X = (t) => pad.l + (t / tMax) * (W - pad.l - pad.r);
      const Y = (m) => H - pad.b - ((m - 1) / (mMax - 1)) * (H - pad.t - pad.b);

      // звёзды
      ctx.fillStyle = App.color('on-surface-variant');
      stars.forEach((s) => {
        if (state === 'running') { s.x -= 0.0006 * s.s * Math.min(6, mult); if (s.x < 0) { s.x = 1; s.y = App.rand(); } }
        ctx.globalAlpha = 0.25 * s.s;
        ctx.fillRect(s.x * W, s.y * H, s.s * 1.5, s.s * 1.5);
      });
      ctx.globalAlpha = 1;

      // сетка
      ctx.strokeStyle = App.color('outline-variant');
      ctx.fillStyle = App.color('on-surface-variant');
      ctx.lineWidth = 1;
      ctx.font = '11px Roboto, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const stepM = niceStep((mMax - 1) / 4);
      for (let m = 1; m <= mMax; m += stepM) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(pad.l, Y(m)); ctx.lineTo(W - pad.r, Y(m)); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(m.toFixed(m < 10 ? 1 : 0) + '×', pad.l - 6, Y(m));
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const stepT = niceStep(tMax / 1000 / 5) * 1000;
      for (let t = 0; t <= tMax; t += stepT) ctx.fillText(Math.round(t / 1000) + 'с', X(t), H - pad.b + 8);

      if (state !== 'idle' || mult > 1) {
        // кривая
        const crashed = state === 'crashed' || (state === 'idle' && mult > 1);
        const col = crashed && !cashedAt ? App.color('error') : App.color('primary');
        ctx.beginPath();
        ctx.moveTo(X(0), Y(1));
        const N = 80;
        for (let i = 1; i <= N; i++) { const t = (elapsed * i) / N; ctx.lineTo(X(t), Y(Math.exp(K * t))); }
        ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.lineTo(X(elapsed), Y(1)); ctx.closePath();
        ctx.globalAlpha = 0.15; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;

        // ракета / взрыв
        const ex = X(elapsed), ey = Y(mult);
        const dt = 100;
        const ang = Math.atan2(Y(Math.exp(K * (elapsed + dt))) - Y(mult), X(elapsed + dt) - X(elapsed));
        ctx.save();
        ctx.translate(ex, ey);
        ctx.font = '34px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (crashed && !cashedAt) ctx.fillText('💥', 0, 0);
        else {
          ctx.rotate(ang + Math.PI / 4);
          ctx.fillText('🚀', 0, 0);
        }
        ctx.restore();
        if (cashedAt) {
          const cx = X(Math.log(cashedAt) / K), cy = Y(cashedAt);
          ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx.fillStyle = App.color('tertiary'); ctx.fill();
          ctx.font = '600 12px Roboto, sans-serif'; ctx.fillStyle = App.color('tertiary');
          ctx.textAlign = 'left'; ctx.fillText(cashedAt.toFixed(2) + '×', cx + 10, cy - 14);
        }
      } else {
        ctx.font = '42px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🚀', X(0) + 20, Y(1) - 24);
      }
      ctx.restore();
    }

    function niceStep(x) {
      const p = Math.pow(10, Math.floor(Math.log10(x)));
      const n = x / p;
      return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
    }

    sc.raf((now) => {
      if (state === 'running') {
        mult = Math.exp(K * (now - startT));
        if (autoOn && !cashedAt) {
          const target = parseFloat(autoInput.value) || 2;
          if (mult >= target && target <= crashAt) cashout(target);
        }
        if (mult >= crashAt) { mult = crashAt; crash(); }
        else {
          $('#crMult', el).textContent = mult.toFixed(2) + '×';
          if (!cashedAt) goBtn.innerHTML = `<span class="ms">savings</span>Забрать ${money(Math.floor(stake * mult))}`;
        }
      }
      draw(now);
    });

    // ушли со страницы посреди полёта — раунд доигрывается автоматически (авто-вывод или проигрыш)
    sc.add(() => {
      if (state === 'running' && !cashedAt) {
        const target = autoOn ? parseFloat(autoInput.value) || 0 : 0;
        if (target && target <= crashAt) wallet.pay(Math.floor(stake * target), stake);
        hist.unshift(crashAt); hist.length = Math.min(hist.length, 20); store.set('crash:hist', hist);
      }
    });
    sc.on(window, 'resize', resize);
    resize();
    renderHist();
  });

  /* =====================================================
     СЛОТЫ
     ===================================================== */
  const SYMBOLS = [
    { s: '🍒', w: 8, p3: 8, p2: 0.5 },
    { s: '🍋', w: 7, p3: 10, p2: 0.5 },
    { s: '🍇', w: 6, p3: 14, p2: 1 },
    { s: '🔔', w: 4, p3: 25, p2: 2 },
    { s: '⭐', w: 3, p3: 50, p2: 3 },
    { s: '💎', w: 2, p3: 100, p2: 5 },
    { s: '7', w: 1.4, p3: 250, p2: 10 },
    { s: '☕', w: 1, p3: 500, p2: 15 },
  ];
  const SYM_H = 84;
  const symHtml = (sym) => `<div class="sym ${sym.s === '7' ? 'seven' : ''}">${sym.s}</div>`;
  const randSym = () => App.pickWeighted(SYMBOLS, (x) => x.w);

  function slotPayout(line) {
    const [a, b, c] = line.map((x) => x.s);
    if (a === b && b === c) return line[0].p3;
    const pair = a === b || a === c ? a : b === c ? b : null;
    return pair ? SYMBOLS.find((x) => x.s === pair).p2 : 0;
  }

  luckRoute('slots', 'Барабаны', (el, sc) => {
    let spinning = false, auto = false, pending = null;
    let visible = [0, 1, 2].map(() => [randSym(), randSym(), randSym()]); // [reel][row]

    const bet = betControl('slots', 50);
    el.appendChild(h(`
      <div class="game-layout">
        <div class="stage">
          <div class="slot-machine" id="slMachine">
            <div class="slot-top">LUCKY 7<div class="lights">${'<i></i>'.repeat(9)}</div></div>
            <div class="reels" id="slReels">
              ${[0, 1, 2].map(() => '<div class="reel"><div class="strip"></div></div>').join('')}
              <div class="payline"></div>
            </div>
          </div>
          <div class="body-l" style="text-align:center;margin-top:12px;min-height:24px" id="slMsg">Крути барабаны!</div>
        </div>
        <div class="panel">
          <div id="slBet"></div>
          <button class="btn lg sl" id="slSpin"><span class="ms">replay</span>Крутить</button>
          <button class="btn tonal sl" id="slAuto"><span class="ms">autorenew</span>Автоспин</button>
          <hr class="divider">
          <h3>Выплаты (×взноса)</h3>
          <div class="paytable">
            ${SYMBOLS.slice().reverse().map((x) => `<span>${x.s === '7' ? '<b style="color:#e53935">7</b>' : x.s} ${x.s === '7' ? '<b style="color:#e53935">7</b>' : x.s} ${x.s === '7' ? '<b style="color:#e53935">7</b>' : x.s}</span><span>×${x.p3}</span>`).join('')}
            <span class="muted">Любые два одинаковых</span><span class="muted">×0.5 – ×15</span>
          </div>
        </div>
      </div>`));
    $('#slBet', el).appendChild(bet.el);
    const reels = $$('.reel', el);
    const machine = $('#slMachine', el);

    function paint() {
      reels.forEach((r, i) => {
        const strip = $('.strip', r);
        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0)';
        strip.innerHTML = visible[i].map(symHtml).join('');
      });
    }

    function spin() {
      if (spinning) return;
      const stake = bet.take();
      if (!stake) { setAuto(false); return; }
      spinning = true;
      machine.classList.remove('won');
      machine.classList.add('spinning');
      $('#slMsg', el).textContent = 'Крутим…';
      $('#slSpin', el).disabled = true;
      const result = [0, 1, 2].map(() => [randSym(), randSym(), randSym()]);
      const mult = slotPayout(result.map((r) => r[1]));
      const win = Math.floor(stake * mult);
      // выплата фиксируется сразу: если уйти со страницы во время вращения, выигрыш не пропадёт
      pending = () => { pending = null; if (win > 0) wallet.pay(win, stake); };
      const fast = auto ? 0.6 : 1;
      reels.forEach((r, i) => {
        const strip = $('.strip', r);
        const filler = Array.from({ length: 18 + i * 6 }, randSym);
        const seq = [...result[i], ...filler, ...visible[i]]; // результат сверху, текущие снизу
        strip.style.transition = 'none';
        strip.innerHTML = seq.map(symHtml).join('');
        const startY = -(seq.length - 3) * SYM_H;
        strip.style.transform = `translateY(${startY}px)`;
        strip.offsetHeight; // reflow
        const dur = (1.1 + i * 0.45) * fast;
        strip.style.transition = `transform ${dur}s cubic-bezier(.25,.1,.2,1.04)`;
        strip.style.transform = 'translateY(0)';
      });
      sc.timeout(() => {
        visible = result;
        paint();
        spinning = false;
        machine.classList.remove('spinning');
        $('#slSpin', el).disabled = false;
        pending && pending();
        if (win > 0) {
          machine.classList.add('won');
          $('#slMsg', el).innerHTML = `×${mult} · ${resultText(win - stake)}`;
          if (mult >= 25) { App.confetti(); App.pop($('.stage', el), 'ДЖЕКПОТ ×' + mult, 'win'); }
          else if (mult >= 1.5) App.pop($('.stage', el), '+' + money(win - stake), 'win');
        } else {
          $('#slMsg', el).innerHTML = `Мимо · ${resultText(-stake)}`;
        }
        if (auto) sc.timeout(spin, 450);
        else if (wallet.broke()) sc.timeout(offerReset, 600);
      }, (1.1 + 2 * 0.45) * (auto ? 0.6 : 1) * 1000 + 80);
    }

    function setAuto(on) {
      auto = on;
      const b = $('#slAuto', el);
      b.innerHTML = on ? '<span class="ms">stop</span>Стоп' : '<span class="ms">autorenew</span>Автоспин';
      b.className = on ? 'btn danger sl' : 'btn tonal sl';
    }
    $('#slSpin', el).onclick = spin;
    $('#slAuto', el).onclick = () => { setAuto(!auto); if (auto && !spinning) spin(); };
    sc.on(document, 'keydown', (e) => { if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); spin(); } });
    sc.add(() => { auto = false; pending && pending(); });
    paint();
  });

  /* =====================================================
     РУЛЕТКА (европейская, одно зеро)
     ===================================================== */
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');
  const CHIPS = [
    { c: 10, label: '10¢', col: '#607d8b' }, { c: 50, label: '50¢', col: '#8d6e63' }, { c: 100, label: '$1', col: '#1e88e5' },
    { c: 500, label: '$5', col: '#e53935' }, { c: 2500, label: '$25', col: '#43a047' }, { c: 10000, label: '$100', col: '#212121' },
    { c: 100000, label: '$1K', col: '#8e24aa' },
  ];

  // выигрышные взноси и множители (возврат включая взносу)
  function betWins(key, n) {
    if (key.startsWith('n')) return +key.slice(1) === n ? 36 : 0;
    if (n === 0) return 0;
    switch (key) {
      case 'red': return REDS.has(n) ? 2 : 0;
      case 'black': return !REDS.has(n) ? 2 : 0;
      case 'even': return n % 2 === 0 ? 2 : 0;
      case 'odd': return n % 2 === 1 ? 2 : 0;
      case 'low': return n <= 18 ? 2 : 0;
      case 'high': return n >= 19 ? 2 : 0;
      case 'doz1': return n <= 12 ? 3 : 0;
      case 'doz2': return n >= 13 && n <= 24 ? 3 : 0;
      case 'doz3': return n >= 25 ? 3 : 0;
      case 'col1': return n % 3 === 1 ? 3 : 0;
      case 'col2': return n % 3 === 2 ? 3 : 0;
      case 'col3': return n % 3 === 0 ? 3 : 0;
    }
    return 0;
  }

  luckRoute('roulette', 'Колесо', (el, sc) => {
    let chip = store.get('roulette:chip', 100);
    let bets = {};
    let history = [];
    let lastBets = store.get('roulette:last', {});
    let spinning = false, rot = 0, pending = null;
    const rHist = store.get('roulette:hist', []);

    el.appendChild(h(`
      <div class="stage">
        <div class="roulette-top">
          <div class="wheel-wrap">
            <div class="wheel-pointer"></div>
            <canvas id="rwCanvas" width="600" height="600"></canvas>
            <div class="wheel-center" id="rwCenter">☕</div>
          </div>
          <div class="stack">
            <div>
              <div class="label-l muted">Взноса на столе</div>
              <div class="headline-m tabular" id="rwTotal">$0.00</div>
              <div class="body-m" id="rwMsg">Выбери фишку и кликай по столу</div>
            </div>
            <div>
              <div class="label-m muted" style="margin-bottom:6px">Фишка</div>
              <div class="chip-picker" id="rwChips">
                ${CHIPS.map((c) => `<button data-c="${c.c}" style="background:${c.col}">${c.label}</button>`).join('')}
              </div>
            </div>
            <div class="row">
              <button class="btn lg sl" id="rwSpin"><span class="ms">motion_photos_on</span>Крутить</button>
              <button class="icon-btn tonal sl" id="rwUndo" title="Отменить"><span class="ms">undo</span></button>
              <button class="icon-btn tonal sl" id="rwDouble" title="Удвоить"><span class="ms">exposure_plus_2</span></button>
              <button class="icon-btn tonal sl" id="rwRepeat" title="Повторить прошлые взноси"><span class="ms">replay</span></button>
              <button class="icon-btn tonal sl" id="rwClear" title="Очистить"><span class="ms">delete</span></button>
            </div>
            <div class="r-hist" id="rwHist"></div>
          </div>
        </div>
        <div class="table-scroll">
          <div class="rtable" id="rwTable"></div>
        </div>
        <div class="body-s muted" style="margin-top:8px">Число ×36 · дюжина/колонка ×3 · цвет, чёт/нечёт, 1–18/19–36 ×2. На зеро внешние взноси проигрывают.</div>
      </div>`));

    // стол
    const table = $('#rwTable', el);
    const cells = [];
    const add = (key, label, cls, col, row, span = 1, rspan = 1) => {
      const b = h(`<button class="rcell ${cls}" data-k="${key}">${label}</button>`);
      b.style.gridColumn = `${col} / span ${span}`;
      b.style.gridRow = `${row} / span ${rspan}`;
      table.appendChild(b);
      cells.push(b);
    };
    add('n0', '0', 'zero', 1, 1, 1, 3);
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 3; r++) {
        const n = c * 3 + (3 - r);
        add('n' + n, n, colorOf(n), c + 2, r + 1);
      }
    }
    add('col3', '2:1', 'out', 14, 1); add('col2', '2:1', 'out', 14, 2); add('col1', '2:1', 'out', 14, 3);
    add('doz1', '1–12', 'out', 2, 4, 4); add('doz2', '13–24', 'out', 6, 4, 4); add('doz3', '25–36', 'out', 10, 4, 4);
    add('low', '1–18', 'out', 2, 5, 2); add('even', 'Чёт', 'out', 4, 5, 2);
    add('red', '<span style="width:18px;height:18px;border-radius:4px;background:#c62828;display:block"></span>', 'out', 6, 5, 2);
    add('black', '<span style="width:18px;height:18px;border-radius:4px;background:#263238;display:block;box-shadow:0 0 0 1px #888"></span>', 'out', 8, 5, 2);
    add('odd', 'Нечёт', 'out', 10, 5, 2); add('high', '19–36', 'out', 12, 5, 2);

    const totalBet = () => Object.values(bets).reduce((a, b) => a + b, 0);

    function renderBets() {
      cells.forEach((cell) => {
        const v = bets[cell.dataset.k];
        let mark = $('.chipmark', cell);
        if (v) {
          if (!mark) { mark = h('<span class="chipmark"></span>'); cell.appendChild(mark); }
          mark.textContent = v >= 100 ? '$' + App.fmt(v / 100) : v + '¢';
        } else if (mark) mark.remove();
      });
      $('#rwTotal', el).textContent = money(totalBet());
    }

    function renderChips() { $$('#rwChips button', el).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.c === chip))); }
    function renderHist() { $('#rwHist', el).innerHTML = rHist.map((n) => `<span class="r-${colorOf(n)}">${n}</span>`).join(''); }

    table.addEventListener('click', (e) => {
      const cell = e.target.closest('.rcell');
      if (!cell || spinning) return;
      if (totalBet() + chip > wallet.cents) { if (wallet.broke() && !totalBet()) offerReset(); else snack('Не хватает денег на эту фишку'); return; }
      const k = cell.dataset.k;
      bets[k] = (bets[k] || 0) + chip;
      history.push([k, chip]);
      renderBets();
    });
    table.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('.rcell');
      if (!cell || spinning) return;
      e.preventDefault();
      delete bets[cell.dataset.k];
      history = history.filter(([k]) => k !== cell.dataset.k);
      renderBets();
    });
    $$('#rwChips button', el).forEach((b) => (b.onclick = () => { chip = +b.dataset.c; store.set('roulette:chip', chip); renderChips(); }));
    $('#rwUndo', el).onclick = () => {
      if (spinning || !history.length) return;
      const [k, v] = history.pop();
      bets[k] -= v; if (bets[k] <= 0) delete bets[k];
      renderBets();
    };
    $('#rwClear', el).onclick = () => { if (spinning) return; bets = {}; history = []; renderBets(); };
    $('#rwDouble', el).onclick = () => {
      if (spinning) return;
      if (totalBet() * 2 > wallet.cents) return snack('Не хватает денег, чтобы удвоить');
      Object.keys(bets).forEach((k) => { history.push([k, bets[k]]); bets[k] *= 2; });
      renderBets();
    };
    $('#rwRepeat', el).onclick = () => {
      if (spinning) return;
      const sum = Object.values(lastBets).reduce((a, b) => a + b, 0);
      if (!sum) return snack('Прошлых ставок нет');
      if (sum > wallet.cents) return snack('Не хватает денег на прошлые взноси');
      bets = { ...lastBets }; history = Object.entries(bets);
      renderBets();
    };

    // колесо
    const cv = $('#rwCanvas', el), ctx = cv.getContext('2d');
    function drawWheel() {
      const R = 300, step = (Math.PI * 2) / 37;
      ctx.clearRect(0, 0, 600, 600);
      ctx.save();
      ctx.translate(300, 300);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = '#5d4037'; ctx.fill();
      WHEEL.forEach((n, i) => {
        const a0 = -Math.PI / 2 + i * step - step / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R - 14, a0, a0 + step);
        ctx.closePath();
        ctx.fillStyle = n === 0 ? '#2e7d32' : REDS.has(n) ? '#c62828' : '#212121';
        ctx.fill();
        ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.save();
        ctx.rotate(a0 + step / 2 + Math.PI / 2);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Roboto, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 0, -(R - 42));
        ctx.restore();
      });
      ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2); ctx.fillStyle = '#4e342e'; ctx.fill();
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 3; ctx.stroke();
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 4);
        ctx.fillStyle = '#d4af37'; ctx.fillRect(-3, -R * 0.6, 6, R * 0.25);
        ctx.restore();
      }
      ctx.restore();
    }

    $('#rwSpin', el).onclick = () => {
      if (spinning) return;
      const total = totalBet();
      if (!total) return snack('Сначала сделай взносу — кликни по столу');
      if (!wallet.bet(total)) return snack('Не хватает денег');
      spinning = true;
      lastBets = { ...bets }; store.set('roulette:last', lastBets);
      $('#rwSpin', el).disabled = true;
      $$('.win-cell', el).forEach((c) => c.classList.remove('win-cell'));
      const center = $('#rwCenter', el);
      center.className = 'wheel-center'; center.textContent = '…';
      $('#rwMsg', el).textContent = 'Взноси сделаны, ставок больше нет!';

      const n = WHEEL[App.randInt(37)];
      const idx = WHEEL.indexOf(n);
      const stepDeg = 360 / 37;
      const targetMod = ((-idx * stepDeg) % 360 + 360) % 360;
      const curMod = ((rot % 360) + 360) % 360;
      rot += 360 * 5 + ((targetMod - curMod + 360) % 360) + (App.rand() - 0.5) * stepDeg * 0.6;
      cv.style.transition = 'transform 4.2s cubic-bezier(.12,.75,.15,1)';
      cv.style.transform = `rotate(${rot}deg)`;

      let ret = 0;
      Object.entries(bets).forEach(([k, v]) => { ret += v * betWins(k, n); });
      pending = () => { pending = null; if (ret) wallet.pay(ret, total); };

      sc.timeout(() => {
        spinning = false;
        pending && pending();
        $('#rwSpin', el).disabled = false;
        center.className = 'wheel-center ' + colorOf(n);
        center.textContent = n;
        rHist.unshift(n); rHist.length = Math.min(rHist.length, 14); store.set('roulette:hist', rHist);
        renderHist();
        cells.forEach((c) => { if (betWins(c.dataset.k, n)) c.classList.add('win-cell'); });
        const net = ret - total;
        const colorName = { red: 'красное', black: 'чёрное', green: 'зеро' }[colorOf(n)];
        $('#rwMsg', el).innerHTML = `Выпало <b>${n}</b> (${colorName}) · ${resultText(net)}`;
        if (net > 0) App.pop($('.stage', el), '+' + money(net), 'win');
        if (net >= total * 10) App.confetti();
        // взноси остаются на столе, но если денег на них уже нет — убираем
        if (totalBet() > wallet.cents) { bets = {}; history = []; }
        renderBets();
        if (wallet.broke()) sc.timeout(offerReset, 800);
      }, 4300);
    };

    // ушли во время вращения — выигрыш всё равно зачисляется
    sc.add(() => pending && pending());

    drawWheel();
    renderChips();
    renderBets();
    renderHist();
  });

  App.luckMeta = { MIN_BET, START };
})();
