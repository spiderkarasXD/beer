'use strict';
/* =========================================================
   Игры: хаб (Аркада / Удача), Сапёр, Змейка, Флаги, Кликер
   ========================================================= */
(() => {
  const { $, $$, h, store, snack, fmt, esc } = App;

  const ARCADE = [
    { id: 'mines', title: 'Сапёр', icon: 'flag', cls: 'c4', desc: 'Классика: открой все клетки и не подорвись.', stat: () => { const b = store.get('mines:best', {}); return b.easy ? 'Рекорд (лёгкий): ' + App.time(b.easy) : null; } },
    { id: 'snake', title: 'Змейка', icon: 'timeline', cls: 'c2', desc: 'Собирай кофе, расти и не врезайся в себя.', stat: () => { const b = store.get('snake:best', 0); return b ? 'Рекорд: ' + b : null; } },
    { id: 'flags', title: 'Флаги', icon: 'public', cls: 'c3', desc: 'Угадай страну по флагу. Серия решает.', stat: () => { const b = store.get('flags:best', 0); return b ? 'Лучшая серия: ' + b : null; } },
    { id: 'clicker', title: 'Кофейный кликер', icon: 'sports_bar', cls: 'c1', desc: 'Кликай, строй кофейни, копи миллиарды. Прогресс сохраняется.', stat: () => { const s = store.get('clicker', null); return s && s.total ? 'Сварено: ' + fmt(s.total) + ' ☕' : null; } },
  ];
  const LUCK = [
    { id: 'plinko', title: 'Плинко', icon: 'blur_on', cls: 'c1', desc: 'Шарик падает через штырьки. До ×1000 на высоком риске.' },
    { id: 'crash', title: 'Ракетка', icon: 'rocket_launch', cls: 'c4', desc: 'Множитель растёт, пока ракета не взорвётся. Успей забрать!' },
    { id: 'slots', title: 'Барабаны', icon: 'payments', cls: 'c2', desc: 'Три барабана, кофейный джекпот ×500.' },
    { id: 'roulette', title: 'Колесо', icon: 'motion_photos_on', cls: 'c3', desc: 'Колесо чисел: числа, цвета, дюжины.' },
  ];

  function card(g, href) {
    const stat = g.stat && g.stat();
    return `<a class="game-card ${g.cls}" href="${href}">
      <div class="gc-icon"><span class="ms">${g.icon}</span></div>
      <h3>${esc(g.title)}</h3>
      <p>${esc(g.desc)}</p>
      ${stat ? `<div class="gc-meta"><span class="chip assist"><span class="ms">emoji_events</span>${esc(stat)}</span></div>` : ''}
    </a>`;
  }

  function hub(tab) {
    return {
      title: 'Игры',
      nav: 'games',
      mount(el) {
        el.appendChild(h(`
          <div>
            <div class="tabs" role="tablist">
              <button role="tab" aria-selected="${tab === 'arcade'}" data-href="#/games"><span class="ms">sports_esports</span>Аркада</button>
              <button role="tab" aria-selected="${tab === 'luck'}" data-href="#/luck"><span class="ms">payments</span>Удача</button>
            </div>
            <div id="hubBody"></div>
          </div>`));
        $$('.tabs button', el).forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
        const body = $('#hubBody', el);
        if (tab === 'arcade') {
          body.innerHTML = `<div class="grid-cards">${ARCADE.map((g) => card(g, '#/play/' + g.id)).join('')}</div>`;
        } else {
          App.luckLobby(body, LUCK.map((g) => card(g, '#/luck/' + g.id)).join(''));
        }
      },
    };
  }
  App.route('games', hub('arcade'));
  App.route('luck', hub('luck'));

  /* =====================================================
     САПЁР
     ===================================================== */
  const MINES_LEVELS = {
    easy: { w: 9, h: 9, m: 10, name: 'Лёгкий' },
    medium: { w: 12, h: 12, m: 24, name: 'Средний' },
    hard: { w: 16, h: 16, m: 45, name: 'Сложный' },
  };

  App.route('play/mines', {
    title: 'Сапёр',
    nav: 'games',
    back: '#/games',
    mount(el, sc) {
      let level = store.get('mines:level', 'easy');
      let grid, opened, flags, state, startTime, flagMode = false, timerId = null;

      el.appendChild(h(`
        <div class="game-layout">
          <div class="stage">
            <div class="scorebar">
              <span class="chip assist"><span class="ms">flag</span><span id="mnLeft">0</span></span>
              <span class="chip assist"><span class="ms">timer</span><span id="mnTime" class="tabular">0:00</span></span>
              <span class="spacer"></span>
              <button class="chip sl" id="mnFlag" aria-pressed="false"><span class="ms">flag</span>Режим флажков</button>
            </div>
            <div class="mines-board" id="mnBoard"></div>
          </div>
          <div class="panel">
            <h3>Сложность</h3>
            <div class="segmented block" id="mnLevels">
              ${Object.entries(MINES_LEVELS).map(([k, v]) => `<button data-l="${k}"><span class="ms">check</span>${v.name}</button>`).join('')}
            </div>
            <button class="btn lg sl" id="mnNew"><span class="ms">refresh</span>Новая игра</button>
            <div class="body-m muted">ЛКМ — открыть, ПКМ или долгое нажатие — флажок. Первый клик всегда безопасный. Клик по цифре открывает соседей, если флажков хватает.</div>
            <hr class="divider">
            <h3>Рекорды</h3>
            <div id="mnBest" class="body-m"></div>
          </div>
        </div>`));

      const board = $('#mnBoard', el);

      function renderBest() {
        const b = store.get('mines:best', {});
        $('#mnBest', el).innerHTML = Object.entries(MINES_LEVELS)
          .map(([k, v]) => `<div class="row"><span>${v.name}</span><span class="spacer"></span><b class="tabular">${b[k] ? App.time(b[k]) : '—'}</b></div>`).join('');
      }

      function cellSize() {
        const L = MINES_LEVELS[level];
        const avail = Math.min(board.parentElement.clientWidth - 32, 640);
        return Math.max(20, Math.min(40, Math.floor((avail - (L.w - 1) * 3) / L.w)));
      }

      function newGame() {
        const L = MINES_LEVELS[level];
        store.set('mines:level', level);
        $$('#mnLevels button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === level)));
        grid = Array.from({ length: L.w * L.h }, () => ({ mine: false, n: 0 }));
        opened = 0; flags = 0; state = 'ready'; startTime = 0;
        clearInterval(timerId);
        $('#mnTime', el).textContent = '0:00';
        board.style.gridTemplateColumns = `repeat(${L.w}, auto)`;
        board.style.setProperty('--cs', cellSize() + 'px');
        board.innerHTML = '';
        grid.forEach((c, i) => {
          const b = document.createElement('button');
          b.className = 'cell';
          b.dataset.i = i;
          board.appendChild(b);
        });
        updLeft();
      }

      function neighbors(i) {
        const L = MINES_LEVELS[level];
        const x = i % L.w, y = Math.floor(i / L.w), out = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < L.w && ny < L.h) out.push(ny * L.w + nx);
        }
        return out;
      }

      function placeMines(safe) {
        const L = MINES_LEVELS[level];
        const forbidden = new Set([safe, ...neighbors(safe)]);
        const pool = grid.map((_, i) => i).filter((i) => !forbidden.has(i));
        App.shuffle(pool).slice(0, L.m).forEach((i) => (grid[i].mine = true));
        grid.forEach((c, i) => (c.n = neighbors(i).filter((j) => grid[j].mine).length));
      }

      function updLeft() { $('#mnLeft', el).textContent = MINES_LEVELS[level].m - flags; }

      function cellEl(i) { return board.children[i]; }

      function open(i) {
        const c = grid[i];
        if (c.open || c.flag) return;
        if (state === 'ready') {
          placeMines(i);
          state = 'play';
          startTime = Date.now();
          timerId = setInterval(() => { $('#mnTime', el).textContent = App.time((Date.now() - startTime) / 1000); }, 250);
        }
        if (state !== 'play') return;
        if (c.mine) return lose(i);
        // flood fill
        const stack = [i];
        while (stack.length) {
          const k = stack.pop();
          const ck = grid[k];
          if (ck.open || ck.flag) continue;
          ck.open = true; opened++;
          const e = cellEl(k);
          e.classList.add('open');
          if (ck.n) { e.textContent = ck.n; e.classList.add('n' + ck.n); }
          else neighbors(k).forEach((j) => { if (!grid[j].open && !grid[j].mine) stack.push(j); });
        }
        const L = MINES_LEVELS[level];
        if (opened === L.w * L.h - L.m) win();
      }

      function chord(i) {
        const c = grid[i];
        if (!c.open || !c.n) return;
        const nb = neighbors(i);
        if (nb.filter((j) => grid[j].flag).length === c.n) nb.forEach((j) => open(j));
      }

      function toggleFlag(i) {
        const c = grid[i];
        if (c.open || state === 'over' || state === 'won') return;
        c.flag = !c.flag;
        flags += c.flag ? 1 : -1;
        const e = cellEl(i);
        e.classList.toggle('flag', c.flag);
        e.innerHTML = c.flag ? '<span class="ms">flag</span>' : '';
        if (navigator.vibrate) navigator.vibrate(15);
        updLeft();
      }

      function lose(i) {
        state = 'over';
        clearInterval(timerId);
        grid.forEach((c, k) => {
          const e = cellEl(k);
          if (c.mine && !c.flag) { e.classList.add('mine'); e.innerHTML = '<span class="ms">bomb</span>'; }
          if (!c.mine && c.flag) e.innerHTML = '<span class="ms">close</span>';
        });
        cellEl(i).classList.add('boom');
        if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
        App.pop(board.parentElement, 'БУМ! 💥', 'lose');
        snack('Подорвался. Ещё раз?', { action: 'Новая игра', onAction: newGame });
      }

      function win() {
        state = 'won';
        clearInterval(timerId);
        const t = Math.round((Date.now() - startTime) / 1000);
        grid.forEach((c, k) => { if (c.mine && !c.flag) { cellEl(k).classList.add('flag'); cellEl(k).innerHTML = '<span class="ms">flag</span>'; } });
        const best = store.get('mines:best', {});
        const rec = !best[level] || t < best[level];
        if (rec) { best[level] = t; store.set('mines:best', best); renderBest(); }
        App.confetti();
        App.pop(board.parentElement, 'Победа! ' + App.time(t), 'win');
        snack(rec ? 'Новый рекорд: ' + App.time(t) + ' 🏆' : 'Разминировано за ' + App.time(t), { action: 'Ещё', onAction: newGame });
      }

      // ввод: клик, ПКМ, долгое нажатие
      let pressTimer = null, longPressed = false;
      sc.on(board, 'contextmenu', (e) => {
        e.preventDefault();
        const t = e.target.closest('.cell');
        if (t && !longPressed) toggleFlag(+t.dataset.i);
      });
      sc.on(board, 'pointerdown', (e) => {
        const t = e.target.closest('.cell');
        if (!t || e.pointerType === 'mouse') return;
        longPressed = false;
        pressTimer = setTimeout(() => { longPressed = true; toggleFlag(+t.dataset.i); }, 380);
      });
      const cancelPress = () => clearTimeout(pressTimer);
      sc.on(board, 'pointerup', cancelPress);
      sc.on(board, 'pointerleave', cancelPress);
      sc.on(board, 'pointercancel', cancelPress);
      sc.on(board, 'click', (e) => {
        const t = e.target.closest('.cell');
        if (!t) return;
        if (longPressed) { longPressed = false; return; }
        const i = +t.dataset.i;
        if (state === 'over' || state === 'won') return;
        if (grid[i].open) return chord(i);
        if (flagMode) return toggleFlag(i);
        open(i);
      });

      $('#mnFlag', el).onclick = (e) => {
        flagMode = !flagMode;
        e.currentTarget.setAttribute('aria-pressed', String(flagMode));
      };
      $$('#mnLevels button', el).forEach((b) => (b.onclick = () => { level = b.dataset.l; newGame(); }));
      $('#mnNew', el).onclick = newGame;
      sc.on(window, 'resize', () => board.style.setProperty('--cs', cellSize() + 'px'));
      sc.add(() => clearInterval(timerId));

      renderBest();
      newGame();
    },
  });

  /* =====================================================
     ЗМЕЙКА
     ===================================================== */
  App.route('play/snake', {
    title: 'Змейка',
    nav: 'games',
    back: '#/games',
    mount(el, sc) {
      const N = 20;
      let snake, dir, nextDirs, food, bonus, score, state = 'idle', speed, acc = 0, last = 0;
      let wrap = store.get('snake:wrap', false);

      el.appendChild(h(`
        <div class="game-layout">
          <div class="stage">
            <div class="scorebar">
              <span class="chip assist"><span class="ms">sports_bar</span>Счёт: <b id="snScore">0</b></span>
              <span class="chip assist"><span class="ms">emoji_events</span>Рекорд: <b id="snBest">0</b></span>
            </div>
            <div class="snake-wrap">
              <canvas id="snCanvas" width="600" height="600"></canvas>
              <div class="overlay" id="snOverlay">
                <div style="font-size:56px">🐍</div>
                <div class="headline-s" id="snMsg">Змейка</div>
                <div class="body-m muted" id="snSub">Стрелки / WASD / свайпы. Пробел — пауза.</div>
                <button class="btn lg sl" id="snStart"><span class="ms">play_arrow</span>Играть</button>
              </div>
            </div>
            <div class="dpad">
              <button class="up sl" data-d="0,-1"><span class="ms">keyboard_arrow_up</span></button>
              <button class="left sl" data-d="-1,0"><span class="ms">keyboard_arrow_left</span></button>
              <button class="down sl" data-d="0,1"><span class="ms">keyboard_arrow_down</span></button>
              <button class="right sl" data-d="1,0"><span class="ms">keyboard_arrow_right</span></button>
            </div>
          </div>
          <div class="panel">
            <h3>Режим стен</h3>
            <div class="segmented block" id="snWalls">
              <button data-w="0"><span class="ms">check</span>Стены убивают</button>
              <button data-w="1"><span class="ms">check</span>Сквозные</button>
            </div>
            <div class="body-m muted">☕ — +1 и змейка растёт. 🌭 появляется ненадолго и даёт +5. Чем длиннее змейка, тем быстрее она ползёт.</div>
          </div>
        </div>`));

      const cv = $('#snCanvas', el), ctx = cv.getContext('2d');
      const S = cv.width / N;
      const overlay = $('#snOverlay', el);
      $('#snBest', el).textContent = store.get('snake:best', 0);

      function setWalls() { $$('#snWalls button', el).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.w === '1') === wrap))); }
      $$('#snWalls button', el).forEach((b) => (b.onclick = () => { wrap = b.dataset.w === '1'; store.set('snake:wrap', wrap); setWalls(); }));
      setWalls();

      function freeCell() {
        let p;
        do { p = { x: App.randInt(N), y: App.randInt(N) }; }
        while (snake.some((s) => s.x === p.x && s.y === p.y) || (food && food.x === p.x && food.y === p.y));
        return p;
      }

      function reset() {
        snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
        dir = { x: 1, y: 0 }; nextDirs = [];
        food = null; food = freeCell(); bonus = null;
        score = 0; speed = 8;
        $('#snScore', el).textContent = 0;
      }

      function start() {
        reset();
        state = 'play';
        overlay.hidden = true;
        document.body.classList.add('immersive');
      }

      function turn(x, y) {
        if (state === 'paused') { resume(); }
        if (state !== 'play') return;
        const ref = nextDirs.length ? nextDirs[nextDirs.length - 1] : dir;
        if (ref.x === -x && ref.y === -y) return;
        if (ref.x === x && ref.y === y) return;
        if (nextDirs.length < 3) nextDirs.push({ x, y });
      }

      function pause() {
        if (state !== 'play') return;
        state = 'paused';
        $('#snMsg', el).textContent = 'Пауза';
        $('#snSub', el).textContent = 'Счёт: ' + score;
        $('#snStart', el).innerHTML = '<span class="ms">play_arrow</span>Продолжить';
        overlay.hidden = false;
      }
      function resume() { state = 'play'; overlay.hidden = true; }

      function die() {
        state = 'over';
        document.body.classList.remove('immersive');
        const best = store.get('snake:best', 0);
        if (navigator.vibrate) navigator.vibrate(120);
        if (score > best) {
          store.set('snake:best', score);
          $('#snBest', el).textContent = score;
          $('#snMsg', el).textContent = 'Новый рекорд! 🏆';
          if (score > 0) App.confetti(40);
        } else $('#snMsg', el).textContent = 'Игра окончена';
        $('#snSub', el).textContent = 'Счёт: ' + score;
        $('#snStart', el).innerHTML = '<span class="ms">replay</span>Ещё раз';
        overlay.hidden = false;
      }

      function step() {
        if (nextDirs.length) dir = nextDirs.shift();
        let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (wrap) { head.x = (head.x + N) % N; head.y = (head.y + N) % N; }
        else if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N) return die();
        if (snake.some((s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y)) return die();
        snake.unshift(head);
        let grow = 0;
        if (head.x === food.x && head.y === food.y) {
          grow = 1; score += 1; food = freeCell();
          if (!bonus && App.rand() < 0.18) bonus = Object.assign(freeCell(), { ttl: 45 });
        }
        if (bonus && head.x === bonus.x && head.y === bonus.y) { grow = 3; score += 5; bonus = null; }
        if (!grow) snake.pop();
        else for (let i = 1; i < grow; i++) snake.push({ ...snake[snake.length - 1] });
        if (bonus && --bonus.ttl <= 0) bonus = null;
        speed = Math.min(20, 8 + snake.length * 0.18);
        $('#snScore', el).textContent = score;
      }

      function draw() {
        const bg = App.color('surface-container-highest');
        const grid = App.color('surface-container-high');
        const body = App.color('tertiary');
        const head = App.color('primary');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = grid;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2) ctx.fillRect(x * S, y * S, S, S);
        if (!wrap) { ctx.strokeStyle = App.color('outline'); ctx.lineWidth = 4; ctx.strokeRect(2, 2, cv.width - 4, cv.height - 4); }
        ctx.font = `${S * 0.8}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('☕', food.x * S + S / 2, food.y * S + S / 2 + 2);
        if (bonus) {
          ctx.globalAlpha = bonus.ttl < 12 ? (bonus.ttl % 2 ? 0.3 : 1) : 1;
          ctx.fillText('🌭', bonus.x * S + S / 2, bonus.y * S + S / 2 + 2);
          ctx.globalAlpha = 1;
        }
        snake.forEach((s, i) => {
          ctx.fillStyle = i === 0 ? head : body;
          const pad = i === 0 ? 1 : 3;
          roundRect(ctx, s.x * S + pad, s.y * S + pad, S - pad * 2, S - pad * 2, i === 0 ? 9 : 7);
        });
        // глаза
        const hd = snake[0];
        ctx.fillStyle = App.color('on-primary');
        const cx = hd.x * S + S / 2, cy = hd.y * S + S / 2;
        const ox = dir.y !== 0 ? 6 : 0, oy = dir.x !== 0 ? 6 : 0;
        [[-1], [1]].forEach(([k]) => {
          ctx.beginPath();
          ctx.arc(cx + dir.x * 5 + ox * k, cy + dir.y * 5 + oy * k, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      reset();
      sc.raf((t) => {
        if (!last) last = t;
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        if (state === 'play') {
          acc += dt;
          const interval = 1 / speed;
          while (acc >= interval && state === 'play') { acc -= interval; step(); }
        }
        draw();
      });

      const keymap = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
      sc.on(document, 'keydown', (e) => {
        if (keymap[e.code]) { e.preventDefault(); if (state === 'idle' || state === 'over') start(); turn(...keymap[e.code]); }
        else if (e.code === 'Space') { e.preventDefault(); if (state === 'play') pause(); else if (state === 'paused') resume(); else start(); }
      });
      let tx = 0, ty = 0;
      sc.on(cv, 'touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
      sc.on(cv, 'touchmove', (e) => e.preventDefault(), { passive: false });
      sc.on(cv, 'touchend', (e) => {
        const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy));
      });
      $$('.dpad button', el).forEach((b) => sc.on(b, 'pointerdown', (e) => { e.preventDefault(); const [x, y] = b.dataset.d.split(',').map(Number); turn(x, y); }));
      $('#snStart', el).onclick = () => (state === 'paused' ? resume() : start());
      sc.on(document, 'visibilitychange', () => { if (document.hidden) pause(); });
      sc.add(() => document.body.classList.remove('immersive'));
    },
  });

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }
  App.roundRect = roundRect;

  /* =====================================================
     ФЛАГИ
     ===================================================== */
  const COUNTRIES = [
    ['ru', 'Россия'], ['ua', 'Украина'], ['by', 'Беларусь'], ['kz', 'Казахстан'], ['us', 'США'], ['gb', 'Великобритания'],
    ['de', 'Германия'], ['fr', 'Франция'], ['it', 'Италия'], ['es', 'Испания'], ['pt', 'Португалия'], ['nl', 'Нидерланды'],
    ['be', 'Бельгия'], ['ch', 'Швейцария'], ['at', 'Австрия'], ['pl', 'Польша'], ['cz', 'Чехия'], ['sk', 'Словакия'],
    ['hu', 'Венгрия'], ['ro', 'Румыния'], ['bg', 'Болгария'], ['gr', 'Греция'], ['tr', 'Турция'], ['se', 'Швеция'],
    ['no', 'Норвегия'], ['fi', 'Финляндия'], ['dk', 'Дания'], ['is', 'Исландия'], ['ie', 'Ирландия'], ['ee', 'Эстония'],
    ['lv', 'Латвия'], ['lt', 'Литва'], ['md', 'Молдова'], ['ge', 'Грузия'], ['am', 'Армения'], ['az', 'Азербайджан'],
    ['uz', 'Узбекистан'], ['kg', 'Киргизия'], ['tj', 'Таджикистан'], ['tm', 'Туркменистан'], ['mn', 'Монголия'], ['cn', 'Китай'],
    ['jp', 'Япония'], ['kr', 'Южная Корея'], ['kp', 'КНДР'], ['in', 'Индия'], ['pk', 'Пакистан'], ['bd', 'Бангладеш'],
    ['th', 'Таиланд'], ['vn', 'Вьетнам'], ['id', 'Индонезия'], ['my', 'Малайзия'], ['ph', 'Филиппины'], ['sg', 'Сингапур'],
    ['au', 'Австралия'], ['nz', 'Новая Зеландия'], ['ca', 'Канада'], ['mx', 'Мексика'], ['br', 'Бразилия'], ['ar', 'Аргентина'],
    ['cl', 'Чили'], ['co', 'Колумбия'], ['pe', 'Перу'], ['ve', 'Венесуэла'], ['cu', 'Куба'], ['jm', 'Ямайка'],
    ['eg', 'Египет'], ['za', 'ЮАР'], ['ng', 'Нигерия'], ['ke', 'Кения'], ['ma', 'Марокко'], ['dz', 'Алжир'],
    ['tn', 'Тунис'], ['et', 'Эфиопия'], ['gh', 'Гана'], ['sn', 'Сенегал'], ['cm', 'Камерун'], ['sa', 'Саудовская Аравия'],
    ['ae', 'ОАЭ'], ['il', 'Израиль'], ['ir', 'Иран'], ['iq', 'Ирак'], ['sy', 'Сирия'], ['lb', 'Ливан'],
    ['jo', 'Иордания'], ['qa', 'Катар'], ['kw', 'Кувейт'], ['af', 'Афганистан'], ['np', 'Непал'], ['lk', 'Шри-Ланка'],
    ['rs', 'Сербия'], ['hr', 'Хорватия'], ['si', 'Словения'], ['ba', 'Босния и Герцеговина'], ['me', 'Черногория'], ['mk', 'Северная Македония'],
    ['al', 'Албания'], ['cy', 'Кипр'], ['mt', 'Мальта'], ['lu', 'Люксембург'], ['mc', 'Монако'], ['va', 'Ватикан'],
  ];

  App.route('play/flags', {
    title: 'Флаги',
    nav: 'games',
    back: '#/games',
    mount(el, sc) {
      let streak = 0, correctTotal = 0, answered = 0, current = null, locked = false, lives = 3;
      let timeLeft = 0, timerOn = store.get('flags:timer', false);
      const recent = [];

      el.appendChild(h(`
        <div class="game-layout">
          <div class="stage">
            <div class="scorebar">
              <span class="chip assist"><span class="ms">local_fire_department</span>Серия: <b id="fgStreak">0</b></span>
              <span class="chip assist"><span class="ms">emoji_events</span>Рекорд: <b id="fgBest">0</b></span>
              <span class="chip assist"><span class="ms fill">favorite</span><b id="fgLives">3</b></span>
            </div>
            <div class="flag-stage">
              <div class="flag-img-wrap" id="fgWrap"></div>
              <div class="timer-bar progress" id="fgTimer" hidden><div style="width:100%"></div></div>
              <div class="flag-opts" id="fgOpts"></div>
            </div>
          </div>
          <div class="panel">
            <h3>Режим</h3>
            <div class="segmented block" id="fgMode">
              <button data-t="0"><span class="ms">check</span>Спокойно</button>
              <button data-t="1"><span class="ms">check</span>На время</button>
            </div>
            <div class="body-m muted">3 жизни. Ошибка отнимает жизнь, серия продолжается до последней. В режиме «На время» — 7 секунд на ответ.</div>
            <hr class="divider">
            <div class="row"><span>Правильных ответов</span><span class="spacer"></span><b id="fgTotal">0</b></div>
            <div class="row"><span>Точность</span><span class="spacer"></span><b id="fgAcc">—</b></div>
            <button class="btn tonal sl" id="fgRestart"><span class="ms">replay</span>Начать заново</button>
          </div>
        </div>`));

      $('#fgBest', el).textContent = store.get('flags:best', 0);
      const opts = $('#fgOpts', el);

      function setModeUI() { $$('#fgMode button', el).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.t === '1') === timerOn))); $('#fgTimer', el).hidden = !timerOn; }
      $$('#fgMode button', el).forEach((b) => (b.onclick = () => { timerOn = b.dataset.t === '1'; store.set('flags:timer', timerOn); setModeUI(); restart(); }));

      function upd() {
        $('#fgStreak', el).textContent = streak;
        $('#fgLives', el).textContent = lives;
        $('#fgTotal', el).textContent = correctTotal;
        $('#fgAcc', el).textContent = answered ? Math.round((correctTotal / answered) * 100) + '%' : '—';
      }

      function next() {
        locked = false;
        let c;
        do { c = COUNTRIES[App.randInt(COUNTRIES.length)]; } while (recent.includes(c[0]));
        recent.push(c[0]); if (recent.length > 25) recent.shift();
        current = c;
        const options = [c];
        while (options.length < 4) {
          const r = COUNTRIES[App.randInt(COUNTRIES.length)];
          if (!options.includes(r)) options.push(r);
        }
        App.shuffle(options);
        $('#fgWrap', el).innerHTML = `<img src="assets/flags/${c[0]}.svg" alt="Флаг" draggable="false">`;
        // предзагрузка следующих не нужна — картинки маленькие
        opts.innerHTML = '';
        options.forEach((o) => {
          const b = h(`<button class="sl">${esc(o[1])}</button>`);
          b.onclick = () => answer(o, b);
          opts.appendChild(b);
        });
        timeLeft = 7;
      }

      function answer(o, btn) {
        if (locked) return;
        locked = true;
        answered++;
        const ok = o && o[0] === current[0];
        $$('button', opts).forEach((b) => { if (b.textContent === current[1]) b.classList.add('right'); });
        if (ok) {
          streak++; correctTotal++;
          const best = store.get('flags:best', 0);
          if (streak > best) { store.set('flags:best', streak); $('#fgBest', el).textContent = streak; }
          if (streak > 0 && streak % 10 === 0) { App.confetti(40); snack('Серия ' + streak + '! 🔥'); }
        } else {
          if (btn) btn.classList.add('wrong');
          lives--;
          if (navigator.vibrate) navigator.vibrate(80);
        }
        upd();
        if (lives <= 0) {
          sc.timeout(async () => {
            const again = await App.dialog({ icon: 'public', title: 'Игра окончена', text: `Серия: ${streak}. Правильных ответов: ${correctTotal}.`, actions: [{ label: 'В меню', value: false }, { label: 'Ещё раз', value: true, style: '' }] });
            if (again) restart(); else location.hash = '#/games';
          }, 900);
          return;
        }
        sc.timeout(next, ok ? 700 : 1400);
      }

      function restart() { streak = 0; correctTotal = 0; answered = 0; lives = 3; upd(); next(); }

      sc.interval(() => {
        if (!timerOn || locked || lives <= 0) return;
        timeLeft -= 0.1;
        $('#fgTimer > div', el).style.width = Math.max(0, (timeLeft / 7) * 100) + '%';
        if (timeLeft <= 0) { snack('Время вышло ⏰'); answer(null, null); }
      }, 100);
      sc.on(document, 'keydown', (e) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 4) { const b = opts.children[n - 1]; if (b) b.click(); }
      });

      $('#fgRestart', el).onclick = restart;
      setModeUI();
      restart();
    },
  });

  /* =====================================================
     КЛИКЕР (сохранение прогресса + оффлайн-доход)
     ===================================================== */
  const BUILDINGS = [
    { id: 'mug', name: 'Кружка', icon: '☕', base: 15, cps: 0.1, desc: 'Сама себя наливает' },
    { id: 'tap', name: 'Пивной кран', icon: '🚰', base: 100, cps: 1, desc: 'Течёт без остановки' },
    { id: 'keg', name: 'Кег', icon: '🛢️', base: 1100, cps: 8, desc: '50 литров счастья' },
    { id: 'bar', name: 'Кофейня', icon: '☕', base: 12000, cps: 47, desc: 'Бариста работает за тебя' },
    { id: 'brew', name: 'Пивоварня', icon: '🏭', base: 130000, cps: 260, desc: 'Крафт в промышленных масштабах' },
    { id: 'farm', name: 'Кофейная плантация', icon: '🌿', base: 1400000, cps: 1400, desc: 'Свои зёрна — свой кофе' },
    { id: 'fest', name: 'Октоберфест', icon: '🎪', base: 20000000, cps: 7800, desc: 'Праздник каждый день' },
    { id: 'river', name: 'Пивная река', icon: '🌊', base: 330000000, cps: 44000, desc: 'Течёт прямо в кружку' },
    { id: 'planet', name: 'Пивная планета', icon: '🪐', base: 5.1e9, cps: 260000, desc: 'Океаны из лагера' },
    { id: 'portal', name: 'Портал в Пивляндию', icon: '🌀', base: 7.5e10, cps: 1.6e6, desc: 'Бесконечный налив' },
  ];
  const UPGRADES = [
    { id: 'c1', name: 'Крепкий палец', icon: '👆', cost: 100, desc: 'Клик ×2', type: 'click', mult: 2 },
    { id: 'c2', name: 'Пивная мышка', icon: '🖱️', cost: 2000, desc: 'Клик ×2', type: 'click', mult: 2 },
    { id: 'c3', name: 'Железная рука', icon: '🦾', cost: 50000, desc: 'Клик ×3', type: 'click', mult: 3 },
    { id: 'c4', name: 'Клик-машина', icon: '⚙️', cost: 2e6, desc: 'Клик ×5', type: 'click', mult: 5 },
    { id: 'cp', name: 'Синергия', icon: '🔗', cost: 5e5, desc: 'Клик даёт +1% от дохода в секунду', type: 'cpsclick' },
    { id: 'm1', name: 'Хмелевая магия', icon: '✨', cost: 5000, desc: 'Весь доход ×1.5', type: 'all', mult: 1.5 },
    { id: 'm2', name: 'Секретный рецепт', icon: '📜', cost: 250000, desc: 'Весь доход ×2', type: 'all', mult: 2 },
    { id: 'm3', name: 'Золотой солод', icon: '🌾', cost: 3e7, desc: 'Весь доход ×2', type: 'all', mult: 2 },
    { id: 'm4', name: 'Пивной бог', icon: '👑', cost: 5e9, desc: 'Весь доход ×3', type: 'all', mult: 3 },
  ];
  const OFFLINE_CAP = 3 * 3600;

  function loadClicker() {
    const s = store.get('clicker', null) || {};
    return {
      cups: s.cups || 0,
      total: s.total || 0,
      clicks: s.clicks || 0,
      owned: s.owned || {},
      ups: s.ups || [],
      saved: s.saved || Date.now(),
    };
  }

  App.route('play/clicker', {
    title: 'Кофейный кликер',
    nav: 'games',
    back: '#/games',
    mount(el, sc) {
      const st = loadClicker();
      let shopTab = 'b';

      const cost = (b) => Math.ceil(b.base * Math.pow(1.15, st.owned[b.id] || 0));
      const allMult = () => UPGRADES.filter((u) => u.type === 'all' && st.ups.includes(u.id)).reduce((m, u) => m * u.mult, 1);
      const cps = () => BUILDINGS.reduce((s, b) => s + (st.owned[b.id] || 0) * b.cps, 0) * allMult();
      const perClick = () => {
        const v = UPGRADES.filter((u) => u.type === 'click' && st.ups.includes(u.id)).reduce((m, u) => m * u.mult, 1) * allMult();
        return st.ups.includes('cp') ? v + cps() * 0.01 : v;
      };
      const save = () => { st.saved = Date.now(); store.set('clicker', st); };

      // оффлайн-доход
      const away = Math.min(OFFLINE_CAP, (Date.now() - st.saved) / 1000);
      const offline = away > 30 ? cps() * away : 0;

      el.appendChild(h(`
        <div class="game-layout wide-side">
          <div class="stage">
            <div class="clicker-top">
              <div class="big" id="ckCups">0</div>
              <div class="body-m muted">чашек кофе · <b id="ckCps">0</b> в сек · <b id="ckPc">1</b> за клик</div>
            </div>
            <button class="clicker-btn" id="ckBtn" aria-label="Кликнуть">☕</button>
            <div class="stat-grid">
              <div class="stat"><b id="ckTotal">0</b><span>сварено всего</span></div>
              <div class="stat"><b id="ckClicks">0</b><span>кликов</span></div>
              <div class="stat"><b id="ckBuild">0</b><span>построек</span></div>
            </div>
          </div>
          <div class="panel">
            <div class="segmented block" id="ckTabs">
              <button data-t="b"><span class="ms">check</span>Постройки</button>
              <button data-t="u"><span class="ms">check</span>Улучшения</button>
            </div>
            <div class="shop-list" id="ckShop"></div>
            <div class="row">
              <span class="body-s muted"><span class="ms" style="font-size:14px;vertical-align:-2px">cloud_done</span> Прогресс сохраняется автоматически</span>
              <span class="spacer"></span>
              <button class="btn text sl" id="ckReset">Сбросить</button>
            </div>
          </div>
        </div>`));

      const btn = $('#ckBtn', el);
      const shop = $('#ckShop', el);

      const isUnlocked = (b, i) => i === 0 || (st.owned[BUILDINGS[i - 1].id] || 0) > 0 || st.total >= b.base * 0.5;
      const unlockedCount = () => BUILDINGS.filter(isUnlocked).length;
      let renderedUnlocked = 0;

      function renderShop() {
        renderedUnlocked = unlockedCount();
        $$('#ckTabs button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === shopTab)));
        if (shopTab === 'b') {
          let shownLocked = 0;
          shop.innerHTML = BUILDINGS.map((b, i) => {
            const unlocked = isUnlocked(b, i);
            if (!unlocked) { if (shownLocked++) return ''; }
            return `<button class="shop-item ${unlocked ? '' : 'locked'}" data-b="${b.id}" ${unlocked ? '' : 'disabled'}>
              <span class="ico">${unlocked ? b.icon : '❓'}</span>
              <span><div class="nm">${unlocked ? esc(b.name) : '???'}</div><div class="ds">${unlocked ? esc(b.desc) + ' · +' + fmt(b.cps * allMult()) + '/с' : 'Купи предыдущую постройку'}</div></span>
              <span><div class="pr">${fmt(cost(b))} ☕</div><div class="cnt">${st.owned[b.id] || 0} шт.</div></span>
            </button>`;
          }).join('');
        } else {
          const avail = UPGRADES.filter((u) => !st.ups.includes(u.id)).sort((a, b) => a.cost - b.cost);
          shop.innerHTML = avail.length ? avail.map((u) => `<button class="shop-item" data-u="${u.id}">
              <span class="ico">${u.icon}</span>
              <span><div class="nm">${esc(u.name)}</div><div class="ds">${esc(u.desc)}</div></span>
              <span><div class="pr">${fmt(u.cost)} ☕</div></span>
            </button>`).join('') : '<div class="body-m muted" style="text-align:center;padding:24px">Все улучшения куплены 👑</div>';
        }
        refreshAffordable();
      }

      function refreshAffordable() {
        $$('.shop-item', shop).forEach((it) => {
          let c = Infinity;
          if (it.dataset.b) c = cost(BUILDINGS.find((b) => b.id === it.dataset.b));
          if (it.dataset.u) c = UPGRADES.find((u) => u.id === it.dataset.u).cost;
          it.classList.toggle('can', !it.disabled && st.cups >= c);
        });
      }

      function updStats() {
        $('#ckCups', el).textContent = fmt(Math.floor(st.cups));
        $('#ckCps', el).textContent = fmt(cps());
        $('#ckPc', el).textContent = fmt(perClick());
        $('#ckTotal', el).textContent = fmt(Math.floor(st.total));
        $('#ckClicks', el).textContent = fmt(st.clicks);
        $('#ckBuild', el).textContent = Object.values(st.owned).reduce((a, b) => a + b, 0);
        document.title = fmt(Math.floor(st.cups)) + ' ☕ · Кликер';
      }

      shop.addEventListener('click', (e) => {
        const it = e.target.closest('.shop-item');
        if (!it || it.disabled) return;
        if (it.dataset.b) {
          const b = BUILDINGS.find((x) => x.id === it.dataset.b);
          const c = cost(b);
          if (st.cups < c) return snack('Не хватает ' + fmt(c - st.cups) + ' ☕');
          st.cups -= c;
          st.owned[b.id] = (st.owned[b.id] || 0) + 1;
        } else if (it.dataset.u) {
          const u = UPGRADES.find((x) => x.id === it.dataset.u);
          if (st.cups < u.cost) return snack('Не хватает ' + fmt(u.cost - st.cups) + ' ☕');
          st.cups -= u.cost;
          st.ups.push(u.id);
          snack('Куплено: ' + u.name);
        }
        save(); renderShop(); updStats();
      });

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const v = perClick();
        st.cups += v; st.total += v; st.clicks++;
        const r = btn.getBoundingClientRect();
        const f = h(`<div class="float-num">+${fmt(v)}</div>`);
        f.style.left = e.clientX - r.left - 20 + (App.rand() * 30 - 15) + 'px';
        f.style.top = e.clientY - r.top - 20 + 'px';
        btn.appendChild(f);
        setTimeout(() => f.remove(), 900);
        updStats(); refreshAffordable();
      });
      sc.on(document, 'keydown', (e) => {
        if (e.code === 'Space' && !e.repeat && document.activeElement === document.body) {
          e.preventDefault();
          const r = btn.getBoundingClientRect();
          btn.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
        }
      });

      $$('#ckTabs button', el).forEach((b) => (b.onclick = () => { shopTab = b.dataset.t; renderShop(); }));
      $('#ckReset', el).onclick = async () => {
        const ok = await App.dialog({ icon: 'delete_forever', title: 'Сбросить прогресс?', text: 'Все кружки, постройки и улучшения пропадут навсегда.', actions: [{ label: 'Отмена', value: false }, { label: 'Сбросить', value: true, style: 'danger' }] });
        if (!ok) return;
        Object.assign(st, { cups: 0, total: 0, clicks: 0, owned: {}, ups: [] });
        save(); renderShop(); updStats();
      };

      // тики
      let lastTick = performance.now();
      sc.interval(() => {
        const now = performance.now();
        const dt = (now - lastTick) / 1000;
        lastTick = now;
        const gain = cps() * dt;
        st.cups += gain; st.total += gain;
        updStats();
        refreshAffordable();
        // открываем новые постройки по мере роста
        if (shopTab === 'b' && unlockedCount() !== renderedUnlocked) renderShop();
      }, 100);
      sc.interval(save, 5000);
      sc.on(window, 'beforeunload', save);
      sc.on(document, 'visibilitychange', () => { if (document.hidden) save(); else lastTick = performance.now(); });
      sc.add(() => { save(); document.title = 'Shifr'; });

      if (offline > 0) {
        st.cups += offline; st.total += offline;
        sc.timeout(() => snack(`Пока тебя не было, заварилось +${fmt(offline)} ☕`, { duration: 5000 }), 400);
      }
      save();
      renderShop();
      updStats();
    },
  });
})();
