'use strict';
/* =========================================================
   Игры: хаб (Аркада / Казино), Сапёр, Змейка, Флаги, Кликер
   ========================================================= */
(() => {
  const { $, $$, h, store, snack, fmt, esc } = Beer;

  const ARCADE = [
    { id: 'mines', title: lng('Сапёр', 'Minesweeper'), icon: 'flag', cls: 'c4', desc: lng('Классика: открой все клетки и не подорвись.', 'A classic: open every cell and don’t blow up.'), stat: () => { const b = store.get('mines:best', {}); return b.easy ? lng('Рекорд (лёгкий): ', 'Best (easy): ') + Beer.time(b.easy) : null; } },
    { id: 'snake', title: lng('Змейка', 'Snake'), icon: 'timeline', cls: 'c2', desc: lng('Собирай пиво, расти и не врезайся в себя.', 'Collect beer, grow and don’t bite yourself.'), stat: () => { const b = store.get('snake:best', 0); return b ? lng('Рекорд: ', 'Best: ') + b : null; } },
    { id: 'flags', title: lng('Флаги', 'Flags'), icon: 'public', cls: 'c3', desc: lng('Угадай страну по флагу. Серия решает.', 'Guess the country by its flag. The streak is what counts.'), stat: () => { const b = store.get('flags:best', 0); return b ? lng('Лучшая серия: ', 'Best streak: ') + b : null; } },
    { id: 'clicker', title: lng('Пивной кликер', 'Beer Clicker'), icon: 'sports_bar', cls: 'c1', desc: lng('Кликай, строй пивоварни, копи миллиарды. Прогресс сохраняется.', 'Click, build breweries, stack billions. Progress is saved.'), stat: () => { const s = store.get('clicker', null); return s && s.total ? lng('Сварено: ', 'Brewed: ') + fmt(s.total) + ' 🍺' : null; } },
  ];
  const CASINO = [
    { id: 'plinko', title: lng('Плинко', 'Plinko'), icon: 'blur_on', cls: 'c1', desc: lng('Шарик падает через штырьки. До ×1000 на высоком риске.', 'The ball falls through the pegs. Up to ×1000 on high risk.') },
    { id: 'crash', title: lng('Ракетка', 'Rocket'), icon: 'rocket_launch', cls: 'c4', desc: lng('Множитель растёт, пока ракета не взорвётся. Успей забрать!', 'The multiplier grows until the rocket explodes. Cash out in time!') },
    { id: 'slots', title: lng('Слоты', 'Slots'), icon: 'casino', cls: 'c2', desc: lng('Три барабана, пивной джекпот ×500.', 'Three reels, a beer jackpot of ×500.') },
    { id: 'roulette', title: lng('Рулетка', 'Roulette'), icon: 'motion_photos_on', cls: 'c3', desc: lng('Европейская рулетка: числа, цвета, дюжины.', 'European roulette: numbers, colors, dozens.') },
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
      title: lng('Игры', 'Games'),
      nav: 'games',
      mount(el) {
        el.appendChild(h(`
          <div>
            <div class="tabs" role="tablist">
              <button role="tab" aria-selected="${tab === 'arcade'}" data-href="#/games"><span class="ms">sports_esports</span>${lng('Аркада', 'Arcade')}</button>
              <button role="tab" aria-selected="${tab === 'casino'}" data-href="#/casino"><span class="ms">casino</span>${lng('Казино', 'Casino')}</button>
            </div>
            <div id="hubBody"></div>
          </div>`));
        $$('.tabs button', el).forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
        const body = $('#hubBody', el);
        if (tab === 'arcade') {
          body.innerHTML = `<div class="grid-cards">${ARCADE.map((g) => card(g, '#/play/' + g.id)).join('')}</div>`;
        } else {
          Beer.casinoLobby(body, CASINO.map((g) => card(g, '#/casino/' + g.id)).join(''));
        }
      },
    };
  }
  Beer.route('games', hub('arcade'));
  Beer.route('casino', hub('casino'));

  /* =====================================================
     САПЁР
     ===================================================== */
  const MINES_LEVELS = {
    easy: { w: 9, h: 9, m: 10, name: lng('Лёгкий', 'Easy') },
    medium: { w: 12, h: 12, m: 24, name: lng('Средний', 'Medium') },
    hard: { w: 16, h: 16, m: 45, name: lng('Сложный', 'Hard') },
  };

  Beer.route('play/mines', {
    title: lng('Сапёр', 'Minesweeper'),
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
              <button class="chip sl" id="mnFlag" aria-pressed="false"><span class="ms">flag</span>${lng('Режим флажков', 'Flag mode')}</button>
            </div>
            <div class="mines-board" id="mnBoard"></div>
          </div>
          <div class="panel">
            <h3>${lng('Сложность', 'Difficulty')}</h3>
            <div class="segmented block" id="mnLevels">
              ${Object.entries(MINES_LEVELS).map(([k, v]) => `<button data-l="${k}"><span class="ms">check</span>${v.name}</button>`).join('')}
            </div>
            <button class="btn lg sl" id="mnNew"><span class="ms">refresh</span>${lng('Новая игра', 'New game')}</button>
            <div class="body-m muted">${lng('ЛКМ — открыть, ПКМ или долгое нажатие — флажок. Первый клик всегда безопасный. Клик по цифре открывает соседей, если флажков хватает.', 'Left click opens, right click or long press places a flag. The first click is always safe. Clicking a number opens its neighbours if enough flags are placed.')}</div>
            <hr class="divider">
            <h3>${lng('Рекорды', 'Records')}</h3>
            <div id="mnBest" class="body-m"></div>
          </div>
        </div>`));

      const board = $('#mnBoard', el);

      function renderBest() {
        const b = store.get('mines:best', {});
        $('#mnBest', el).innerHTML = Object.entries(MINES_LEVELS)
          .map(([k, v]) => `<div class="row"><span>${v.name}</span><span class="spacer"></span><b class="tabular">${b[k] ? Beer.time(b[k]) : '—'}</b></div>`).join('');
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
        Beer.shuffle(pool).slice(0, L.m).forEach((i) => (grid[i].mine = true));
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
          timerId = setInterval(() => { $('#mnTime', el).textContent = Beer.time((Date.now() - startTime) / 1000); }, 250);
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
        Beer.pop(board.parentElement, lng('БУМ! 💥', 'BOOM! 💥'), 'lose');
        snack(lng('Подорвался. Ещё раз?', 'You blew up. Again?'), { action: lng('Новая игра', 'New game'), onAction: newGame });
      }

      function win() {
        state = 'won';
        clearInterval(timerId);
        const t = Math.round((Date.now() - startTime) / 1000);
        grid.forEach((c, k) => { if (c.mine && !c.flag) { cellEl(k).classList.add('flag'); cellEl(k).innerHTML = '<span class="ms">flag</span>'; } });
        const best = store.get('mines:best', {});
        const rec = !best[level] || t < best[level];
        if (rec) { best[level] = t; store.set('mines:best', best); renderBest(); }
        Beer.confetti();
        Beer.pop(board.parentElement, lng('Победа! ', 'Victory! ') + Beer.time(t), 'win');
        snack(rec ? lng('Новый рекорд: ', 'New record: ') + Beer.time(t) + ' 🏆' : lng('Разминировано за ', 'Cleared in ') + Beer.time(t), { action: lng('Ещё', 'Again'), onAction: newGame });
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
  Beer.route('play/snake', {
    title: lng('Змейка', 'Snake'),
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
              <span class="chip assist"><span class="ms">sports_bar</span>${lng('Счёт', 'Score')}: <b id="snScore">0</b></span>
              <span class="chip assist"><span class="ms">emoji_events</span>${lng('Рекорд', 'Best')}: <b id="snBest">0</b></span>
            </div>
            <div class="snake-wrap">
              <canvas id="snCanvas" width="600" height="600"></canvas>
              <div class="overlay" id="snOverlay">
                <div style="font-size:56px">🐍</div>
                <div class="headline-s" id="snMsg">${lng('Змейка', 'Snake')}</div>
                <div class="body-m muted" id="snSub">${lng('Стрелки / WASD / свайпы. Пробел — пауза.', 'Arrows / WASD / swipes. Space pauses.')}</div>
                <button class="btn lg sl" id="snStart"><span class="ms">play_arrow</span>${lng('Играть', 'Play')}</button>
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
            <h3>${lng('Режим стен', 'Walls')}</h3>
            <div class="segmented block" id="snWalls">
              <button data-w="0"><span class="ms">check</span>${lng('Стены убивают', 'Walls kill')}</button>
              <button data-w="1"><span class="ms">check</span>${lng('Сквозные', 'Wrap around')}</button>
            </div>
            <div class="body-m muted">${lng('🍺 — +1 и змейка растёт. 🌭 появляется ненадолго и даёт +5. Чем длиннее змейка, тем быстрее она ползёт.', '🍺 gives +1 and the snake grows. 🌭 shows up for a short time and gives +5. The longer the snake, the faster it crawls.')}</div>
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
        do { p = { x: Beer.randInt(N), y: Beer.randInt(N) }; }
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
        $('#snMsg', el).textContent = lng('Пауза', 'Paused');
        $('#snSub', el).textContent = lng('Счёт: ', 'Score: ') + score;
        $('#snStart', el).innerHTML = '<span class="ms">play_arrow</span>' + lng('Продолжить', 'Resume');
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
          $('#snMsg', el).textContent = lng('Новый рекорд! 🏆', 'New record! 🏆');
          if (score > 0) Beer.confetti(40);
        } else $('#snMsg', el).textContent = lng('Игра окончена', 'Game over');
        $('#snSub', el).textContent = lng('Счёт: ', 'Score: ') + score;
        $('#snStart', el).innerHTML = '<span class="ms">replay</span>' + lng('Ещё раз', 'Play again');
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
          if (!bonus && Beer.rand() < 0.18) bonus = Object.assign(freeCell(), { ttl: 45 });
        }
        if (bonus && head.x === bonus.x && head.y === bonus.y) { grow = 3; score += 5; bonus = null; }
        if (!grow) snake.pop();
        else for (let i = 1; i < grow; i++) snake.push({ ...snake[snake.length - 1] });
        if (bonus && --bonus.ttl <= 0) bonus = null;
        speed = Math.min(20, 8 + snake.length * 0.18);
        $('#snScore', el).textContent = score;
      }

      function draw() {
        const bg = Beer.color('surface-container-highest');
        const grid = Beer.color('surface-container-high');
        const body = Beer.color('tertiary');
        const head = Beer.color('primary');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = grid;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2) ctx.fillRect(x * S, y * S, S, S);
        if (!wrap) { ctx.strokeStyle = Beer.color('outline'); ctx.lineWidth = 4; ctx.strokeRect(2, 2, cv.width - 4, cv.height - 4); }
        ctx.font = `${S * 0.8}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🍺', food.x * S + S / 2, food.y * S + S / 2 + 2);
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
        ctx.fillStyle = Beer.color('on-primary');
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
  Beer.roundRect = roundRect;

  /* =====================================================
     ФЛАГИ
     ===================================================== */
  const COUNTRIES = [
    ['ru', 'Россия', 'Russia'], ['ua', 'Украина', 'Ukraine'], ['by', 'Беларусь', 'Belarus'], ['kz', 'Казахстан', 'Kazakhstan'], ['us', 'США', 'USA'], ['gb', 'Великобритания', 'United Kingdom'],
    ['de', 'Германия', 'Germany'], ['fr', 'Франция', 'France'], ['it', 'Италия', 'Italy'], ['es', 'Испания', 'Spain'], ['pt', 'Португалия', 'Portugal'], ['nl', 'Нидерланды', 'Netherlands'],
    ['be', 'Бельгия', 'Belgium'], ['ch', 'Швейцария', 'Switzerland'], ['at', 'Австрия', 'Austria'], ['pl', 'Польша', 'Poland'], ['cz', 'Чехия', 'Czechia'], ['sk', 'Словакия', 'Slovakia'],
    ['hu', 'Венгрия', 'Hungary'], ['ro', 'Румыния', 'Romania'], ['bg', 'Болгария', 'Bulgaria'], ['gr', 'Греция', 'Greece'], ['tr', 'Турция', 'Turkey'], ['se', 'Швеция', 'Sweden'],
    ['no', 'Норвегия', 'Norway'], ['fi', 'Финляндия', 'Finland'], ['dk', 'Дания', 'Denmark'], ['is', 'Исландия', 'Iceland'], ['ie', 'Ирландия', 'Ireland'], ['ee', 'Эстония', 'Estonia'],
    ['lv', 'Латвия', 'Latvia'], ['lt', 'Литва', 'Lithuania'], ['md', 'Молдова', 'Moldova'], ['ge', 'Грузия', 'Georgia'], ['am', 'Армения', 'Armenia'], ['az', 'Азербайджан', 'Azerbaijan'],
    ['uz', 'Узбекистан', 'Uzbekistan'], ['kg', 'Киргизия', 'Kyrgyzstan'], ['tj', 'Таджикистан', 'Tajikistan'], ['tm', 'Туркменистан', 'Turkmenistan'], ['mn', 'Монголия', 'Mongolia'], ['cn', 'Китай', 'China'],
    ['jp', 'Япония', 'Japan'], ['kr', 'Южная Корея', 'South Korea'], ['kp', 'КНДР', 'North Korea'], ['in', 'Индия', 'India'], ['pk', 'Пакистан', 'Pakistan'], ['bd', 'Бангладеш', 'Bangladesh'],
    ['th', 'Таиланд', 'Thailand'], ['vn', 'Вьетнам', 'Vietnam'], ['id', 'Индонезия', 'Indonesia'], ['my', 'Малайзия', 'Malaysia'], ['ph', 'Филиппины', 'Philippines'], ['sg', 'Сингапур', 'Singapore'],
    ['au', 'Австралия', 'Australia'], ['nz', 'Новая Зеландия', 'New Zealand'], ['ca', 'Канада', 'Canada'], ['mx', 'Мексика', 'Mexico'], ['br', 'Бразилия', 'Brazil'], ['ar', 'Аргентина', 'Argentina'],
    ['cl', 'Чили', 'Chile'], ['co', 'Колумбия', 'Colombia'], ['pe', 'Перу', 'Peru'], ['ve', 'Венесуэла', 'Venezuela'], ['cu', 'Куба', 'Cuba'], ['jm', 'Ямайка', 'Jamaica'],
    ['eg', 'Египет', 'Egypt'], ['za', 'ЮАР', 'South Africa'], ['ng', 'Нигерия', 'Nigeria'], ['ke', 'Кения', 'Kenya'], ['ma', 'Марокко', 'Morocco'], ['dz', 'Алжир', 'Algeria'],
    ['tn', 'Тунис', 'Tunisia'], ['et', 'Эфиопия', 'Ethiopia'], ['gh', 'Гана', 'Ghana'], ['sn', 'Сенегал', 'Senegal'], ['cm', 'Камерун', 'Cameroon'], ['sa', 'Саудовская Аравия', 'Saudi Arabia'],
    ['ae', 'ОАЭ', 'UAE'], ['il', 'Израиль', 'Israel'], ['ir', 'Иран', 'Iran'], ['iq', 'Ирак', 'Iraq'], ['sy', 'Сирия', 'Syria'], ['lb', 'Ливан', 'Lebanon'],
    ['jo', 'Иордания', 'Jordan'], ['qa', 'Катар', 'Qatar'], ['kw', 'Кувейт', 'Kuwait'], ['af', 'Афганистан', 'Afghanistan'], ['np', 'Непал', 'Nepal'], ['lk', 'Шри-Ланка', 'Sri Lanka'],
    ['rs', 'Сербия', 'Serbia'], ['hr', 'Хорватия', 'Croatia'], ['si', 'Словения', 'Slovenia'], ['ba', 'Босния и Герцеговина', 'Bosnia and Herzegovina'], ['me', 'Черногория', 'Montenegro'], ['mk', 'Северная Македония', 'North Macedonia'],
    ['al', 'Албания', 'Albania'], ['cy', 'Кипр', 'Cyprus'], ['mt', 'Мальта', 'Malta'], ['lu', 'Люксембург', 'Luxembourg'], ['mc', 'Монако', 'Monaco'], ['va', 'Ватикан', 'Vatican City'],
  ].map(([code, ru, en]) => [code, lng(ru, en)]);

  Beer.route('play/flags', {
    title: lng('Флаги', 'Flags'),
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
              <span class="chip assist"><span class="ms">local_fire_department</span>${lng('Серия', 'Streak')}: <b id="fgStreak">0</b></span>
              <span class="chip assist"><span class="ms">emoji_events</span>${lng('Рекорд', 'Best')}: <b id="fgBest">0</b></span>
              <span class="chip assist"><span class="ms fill">favorite</span><b id="fgLives">3</b></span>
            </div>
            <div class="flag-stage">
              <div class="flag-img-wrap" id="fgWrap"></div>
              <div class="timer-bar progress" id="fgTimer" hidden><div style="width:100%"></div></div>
              <div class="flag-opts" id="fgOpts"></div>
            </div>
          </div>
          <div class="panel">
            <h3>${lng('Режим', 'Mode')}</h3>
            <div class="segmented block" id="fgMode">
              <button data-t="0"><span class="ms">check</span>${lng('Спокойно', 'Relaxed')}</button>
              <button data-t="1"><span class="ms">check</span>${lng('На время', 'Timed')}</button>
            </div>
            <div class="body-m muted">${lng('3 жизни. Ошибка отнимает жизнь, серия продолжается до последней. В режиме «На время» — 7 секунд на ответ.', '3 lives. A mistake costs a life, the streak goes on until the last one. In Timed mode you get 7 seconds per answer.')}</div>
            <hr class="divider">
            <div class="row"><span>${lng('Правильных ответов', 'Correct answers')}</span><span class="spacer"></span><b id="fgTotal">0</b></div>
            <div class="row"><span>${lng('Точность', 'Accuracy')}</span><span class="spacer"></span><b id="fgAcc">—</b></div>
            <button class="btn tonal sl" id="fgRestart"><span class="ms">replay</span>${lng('Начать заново', 'Start over')}</button>
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
        do { c = COUNTRIES[Beer.randInt(COUNTRIES.length)]; } while (recent.includes(c[0]));
        recent.push(c[0]); if (recent.length > 25) recent.shift();
        current = c;
        const options = [c];
        while (options.length < 4) {
          const r = COUNTRIES[Beer.randInt(COUNTRIES.length)];
          if (!options.includes(r)) options.push(r);
        }
        Beer.shuffle(options);
        $('#fgWrap', el).innerHTML = `<img src="assets/flags/${c[0]}.svg" alt="${lng('Флаг', 'Flag')}" draggable="false">`;
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
          if (streak > 0 && streak % 10 === 0) { Beer.confetti(40); snack(lng('Серия ', 'Streak ') + streak + '! 🔥'); }
        } else {
          if (btn) btn.classList.add('wrong');
          lives--;
          if (navigator.vibrate) navigator.vibrate(80);
        }
        upd();
        if (lives <= 0) {
          sc.timeout(async () => {
            const again = await Beer.dialog({ icon: 'public', title: lng('Игра окончена', 'Game over'), text: lng(`Серия: ${streak}. Правильных ответов: ${correctTotal}.`, `Streak: ${streak}. Correct answers: ${correctTotal}.`), actions: [{ label: lng('В меню', 'Menu'), value: false }, { label: lng('Ещё раз', 'Play again'), value: true, style: '' }] });
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
        if (timeLeft <= 0) { snack(lng('Время вышло ⏰', 'Time’s up ⏰')); answer(null, null); }
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
    { id: 'mug', name: lng('Кружка', 'Mug'), icon: '🍺', base: 15, cps: 0.1, desc: lng('Сама себя наливает', 'Pours itself') },
    { id: 'tap', name: lng('Пивной кран', 'Beer tap'), icon: '🚰', base: 100, cps: 1, desc: lng('Течёт без остановки', 'Never stops flowing') },
    { id: 'keg', name: lng('Кег', 'Keg'), icon: '🛢️', base: 1100, cps: 8, desc: lng('50 литров счастья', '50 liters of happiness') },
    { id: 'bar', name: lng('Бар', 'Bar'), icon: '🍻', base: 12000, cps: 47, desc: lng('Бармен работает за тебя', 'The bartender works for you') },
    { id: 'brew', name: lng('Пивоварня', 'Brewery'), icon: '🏭', base: 130000, cps: 260, desc: lng('Крафт в промышленных масштабах', 'Craft on an industrial scale') },
    { id: 'farm', name: lng('Хмелевая ферма', 'Hop farm'), icon: '🌿', base: 1400000, cps: 1400, desc: lng('Свой хмель — своё пиво', 'Your own hops, your own beer') },
    { id: 'fest', name: lng('Октоберфест', 'Oktoberfest'), icon: '🎪', base: 20000000, cps: 7800, desc: lng('Праздник каждый день', 'A party every day') },
    { id: 'river', name: lng('Пивная река', 'Beer river'), icon: '🌊', base: 330000000, cps: 44000, desc: lng('Течёт прямо в кружку', 'Flows right into your mug') },
    { id: 'planet', name: lng('Пивная планета', 'Beer planet'), icon: '🪐', base: 5.1e9, cps: 260000, desc: lng('Океаны из лагера', 'Oceans of lager') },
    { id: 'portal', name: lng('Портал в Пивляндию', 'Portal to Beerland'), icon: '🌀', base: 7.5e10, cps: 1.6e6, desc: lng('Бесконечный налив', 'Endless pour') },
  ];
  const UPGRADES = [
    { id: 'c1', name: lng('Крепкий палец', 'Strong finger'), icon: '👆', cost: 100, desc: lng('Клик ×2', 'Click ×2'), type: 'click', mult: 2 },
    { id: 'c2', name: lng('Пивная мышка', 'Beer mouse'), icon: '🖱️', cost: 2000, desc: lng('Клик ×2', 'Click ×2'), type: 'click', mult: 2 },
    { id: 'c3', name: lng('Железная рука', 'Iron hand'), icon: '🦾', cost: 50000, desc: lng('Клик ×3', 'Click ×3'), type: 'click', mult: 3 },
    { id: 'c4', name: lng('Клик-машина', 'Click machine'), icon: '⚙️', cost: 2e6, desc: lng('Клик ×5', 'Click ×5'), type: 'click', mult: 5 },
    { id: 'cp', name: lng('Синергия', 'Synergy'), icon: '🔗', cost: 5e5, desc: lng('Клик даёт +1% от дохода в секунду', 'A click gives +1% of income per second'), type: 'cpsclick' },
    { id: 'm1', name: lng('Хмелевая магия', 'Hop magic'), icon: '✨', cost: 5000, desc: lng('Весь доход ×1.5', 'All income ×1.5'), type: 'all', mult: 1.5 },
    { id: 'm2', name: lng('Секретный рецепт', 'Secret recipe'), icon: '📜', cost: 250000, desc: lng('Весь доход ×2', 'All income ×2'), type: 'all', mult: 2 },
    { id: 'm3', name: lng('Золотой солод', 'Golden malt'), icon: '🌾', cost: 3e7, desc: lng('Весь доход ×2', 'All income ×2'), type: 'all', mult: 2 },
    { id: 'm4', name: lng('Пивной бог', 'Beer god'), icon: '👑', cost: 5e9, desc: lng('Весь доход ×3', 'All income ×3'), type: 'all', mult: 3 },
  ];
  const OFFLINE_CAP = 3 * 3600;

  function loadClicker() {
    const s = store.get('clicker', null) || {};
    return {
      beer: s.beer || 0,
      total: s.total || 0,
      clicks: s.clicks || 0,
      owned: s.owned || {},
      ups: s.ups || [],
      saved: s.saved || Date.now(),
    };
  }

  Beer.route('play/clicker', {
    title: lng('Пивной кликер', 'Beer Clicker'),
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
              <div class="big" id="ckBeer">0</div>
              <div class="body-m muted">${lng('кружек пива', 'mugs of beer')} · <b id="ckCps">0</b> ${lng('в сек', 'per sec')} · <b id="ckPc">1</b> ${lng('за клик', 'per click')}</div>
            </div>
            <button class="clicker-btn" id="ckBtn" aria-label="${lng('Кликнуть', 'Click')}">🍺</button>
            <div class="stat-grid">
              <div class="stat"><b id="ckTotal">0</b><span>${lng('сварено всего', 'brewed in total')}</span></div>
              <div class="stat"><b id="ckClicks">0</b><span>${lng('кликов', 'clicks')}</span></div>
              <div class="stat"><b id="ckBuild">0</b><span>${lng('построек', 'buildings')}</span></div>
            </div>
          </div>
          <div class="panel">
            <div class="segmented block" id="ckTabs">
              <button data-t="b"><span class="ms">check</span>${lng('Постройки', 'Buildings')}</button>
              <button data-t="u"><span class="ms">check</span>${lng('Улучшения', 'Upgrades')}</button>
            </div>
            <div class="shop-list" id="ckShop"></div>
            <div class="row">
              <span class="body-s muted"><span class="ms" style="font-size:14px;vertical-align:-2px">cloud_done</span> ${lng('Прогресс сохраняется автоматически', 'Progress is saved automatically')}</span>
              <span class="spacer"></span>
              <button class="btn text sl" id="ckReset">${lng('Сбросить', 'Reset')}</button>
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
              <span><div class="nm">${unlocked ? esc(b.name) : '???'}</div><div class="ds">${unlocked ? esc(b.desc) + ' · +' + fmt(b.cps * allMult()) + lng('/с', '/s') : lng('Купи предыдущую постройку', 'Buy the previous building')}</div></span>
              <span><div class="pr">${fmt(cost(b))} 🍺</div><div class="cnt">${st.owned[b.id] || 0} ${lng('шт.', 'pcs')}</div></span>
            </button>`;
          }).join('');
        } else {
          const avail = UPGRADES.filter((u) => !st.ups.includes(u.id)).sort((a, b) => a.cost - b.cost);
          shop.innerHTML = avail.length ? avail.map((u) => `<button class="shop-item" data-u="${u.id}">
              <span class="ico">${u.icon}</span>
              <span><div class="nm">${esc(u.name)}</div><div class="ds">${esc(u.desc)}</div></span>
              <span><div class="pr">${fmt(u.cost)} 🍺</div></span>
            </button>`).join('') : `<div class="body-m muted" style="text-align:center;padding:24px">${lng('Все улучшения куплены 👑', 'All upgrades bought 👑')}</div>`;
        }
        refreshAffordable();
      }

      function refreshAffordable() {
        $$('.shop-item', shop).forEach((it) => {
          let c = Infinity;
          if (it.dataset.b) c = cost(BUILDINGS.find((b) => b.id === it.dataset.b));
          if (it.dataset.u) c = UPGRADES.find((u) => u.id === it.dataset.u).cost;
          it.classList.toggle('can', !it.disabled && st.beer >= c);
        });
      }

      function updStats() {
        $('#ckBeer', el).textContent = fmt(Math.floor(st.beer));
        $('#ckCps', el).textContent = fmt(cps());
        $('#ckPc', el).textContent = fmt(perClick());
        $('#ckTotal', el).textContent = fmt(Math.floor(st.total));
        $('#ckClicks', el).textContent = fmt(st.clicks);
        $('#ckBuild', el).textContent = Object.values(st.owned).reduce((a, b) => a + b, 0);
        document.title = fmt(Math.floor(st.beer)) + ' 🍺 · ' + lng('Кликер', 'Clicker');
      }

      shop.addEventListener('click', (e) => {
        const it = e.target.closest('.shop-item');
        if (!it || it.disabled) return;
        if (it.dataset.b) {
          const b = BUILDINGS.find((x) => x.id === it.dataset.b);
          const c = cost(b);
          if (st.beer < c) return snack(lng('Не хватает ', 'Not enough: ') + fmt(c - st.beer) + ' 🍺');
          st.beer -= c;
          st.owned[b.id] = (st.owned[b.id] || 0) + 1;
        } else if (it.dataset.u) {
          const u = UPGRADES.find((x) => x.id === it.dataset.u);
          if (st.beer < u.cost) return snack(lng('Не хватает ', 'Not enough: ') + fmt(u.cost - st.beer) + ' 🍺');
          st.beer -= u.cost;
          st.ups.push(u.id);
          snack(lng('Куплено: ', 'Bought: ') + u.name);
        }
        save(); renderShop(); updStats();
      });

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const v = perClick();
        st.beer += v; st.total += v; st.clicks++;
        const r = btn.getBoundingClientRect();
        const f = h(`<div class="float-num">+${fmt(v)}</div>`);
        f.style.left = e.clientX - r.left - 20 + (Beer.rand() * 30 - 15) + 'px';
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
        const ok = await Beer.dialog({ icon: 'delete_forever', title: lng('Сбросить прогресс?', 'Reset progress?'), text: lng('Все кружки, постройки и улучшения пропадут навсегда.', 'All mugs, buildings and upgrades will be gone forever.'), actions: [{ label: lng('Отмена', 'Cancel'), value: false }, { label: lng('Сбросить', 'Reset'), value: true, style: 'danger' }] });
        if (!ok) return;
        Object.assign(st, { beer: 0, total: 0, clicks: 0, owned: {}, ups: [] });
        save(); renderShop(); updStats();
      };

      // тики
      let lastTick = performance.now();
      sc.interval(() => {
        const now = performance.now();
        const dt = (now - lastTick) / 1000;
        lastTick = now;
        const gain = cps() * dt;
        st.beer += gain; st.total += gain;
        updStats();
        refreshAffordable();
        // открываем новые постройки по мере роста
        if (shopTab === 'b' && unlockedCount() !== renderedUnlocked) renderShop();
      }, 100);
      sc.interval(save, 5000);
      sc.on(window, 'beforeunload', save);
      sc.on(document, 'visibilitychange', () => { if (document.hidden) save(); else lastTick = performance.now(); });
      sc.add(() => { save(); document.title = 'Beer Translate'; });

      if (offline > 0) {
        st.beer += offline; st.total += offline;
        sc.timeout(() => snack(lng(`Пока тебя не было, сварилось +${fmt(offline)} 🍺`, `While you were away, +${fmt(offline)} 🍺 got brewed`), { duration: 5000 }), 400);
      }
      save();
      renderShop();
      updStats();
    },
  });
})();
