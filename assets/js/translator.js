'use strict';
/* =========================================================
   Переводчик: русский / английский  ⇄  пивной язык
   ========================================================= */
(() => {
  const { $, h, store, snack } = Beer;

  const beerMap = {'А':'влдаолдцт3894','Б':'78ем9т4325243895тм72','В':'атдлжиыфвеи0653','Г':'тмщышевз34','Д':'34три537уиадлвы','Е':'ь02м392м7','Ё':'ь02м392м8','Ж':'тт32м4о35т2','З':'3и45рт647ь8','И':'49и357т7т50иц7','Й':'49и357т7т50иц8','К':'тй89и5446','Л':'7ьт47тть75','М':'7ь65бь47456ь7','Н':'8674ь5б867куекв','О':'ь7т3567о5643654','П':'т76376534ывтн','Р':'вьтапгь67767ь5ке','С':'пиавые54','Т':'т65436отекнр','У':'6т54у65т6цу3','Ф':'74567о5тнит7546','Х':'547т456756т85','Ц':'7ль564л7от546р546','Ч':'87645ьт5куьлнаенген','Ш':'аеткуну45654н','Щ':'аеткуну45654н1','Ъ':'22987т6и0222лвдпфы1','Ы':'22987т6и0222лвдпфы3','Ь':'22987т6и0222лвдпфы2','Э':'638ь54и96346и0345','Ю':'е0ц4539и587т3450879345','Я':'еьекутнтек6ня','A':'z99x11v','B':'bb77beer00','C':'c_shakal_99','D':'d88_vottak_2','E':'e_pivo_1','F':'f_44_ff','G':'g_top_g_7','H':'h_hh_888','I':'i_eye_111','J':'j_jack_55','K':'k_kick_0','L':'l_lose_77','M':'m_m_444555','N':'n_nitro_9','O':'o_zero_00','P':'p_pub_4','Q':'q_quest_1','R':'r_root_66','S':'s_snk_33','T':'t_tank_4','U':'u_unit_22','V':'v_v_666','W':'w_wow_7','X':'x_xxx_0','Y':'y_yes_9','Z':'z_zzz_1'};
  const revCodes = Object.entries(beerMap).map(([l, c]) => ({ l, c })).sort((a, b) => b.c.length - a.c.length);

  function toBeer(text) {
    let res = '';
    for (const ch of text.toUpperCase()) res += beerMap[ch] || ch;
    return res;
  }

  // Возвращает расшифровку и долю символов, которые удалось распознать как коды
  function fromBeer(text) {
    let res = '', i = 0, matched = 0;
    while (i < text.length) {
      let found = null;
      for (const item of revCodes) {
        if (text.startsWith(item.c, i)) { found = item; break; }
      }
      if (found) { res += found.l; i += found.c.length; matched += found.c.length; }
      else { res += text[i]; i++; }
    }
    return { text: res.toLowerCase(), ratio: text.length ? matched / text.replace(/\s/g, '').length : 0 };
  }

  Beer.translator = { toBeer, fromBeer };

  Beer.route('translate', {
    title: 'Beer Translate',
    nav: 'translate',
    mount(el) {
      let toBeerMode = store.get('tr:mode', 'text') === 'text';

      el.appendChild(h(`
        <div>
          <section class="hero">
            <div class="bubbles"></div>
            <span class="mug">🍺</span>
            <h1>Переводчик на <b>пивной</b> язык</h1>
            <p>Пиши по-русски или по-английски — получай шифр, понятный только настоящим ценителям. Работает и в обратную сторону.</p>
          </section>

          <div class="tr-controls">
            <div class="segmented" role="group" aria-label="Направление">
              <button data-mode="text"><span class="ms">check</span>Текст → Пивной</button>
              <button data-mode="beer"><span class="ms">check</span>Пивной → Текст</button>
            </div>
            <button class="btn tonal sl" id="trSwap"><span class="ms">swap_horiz</span>Поменять</button>
          </div>

          <div class="tr-grid">
            <div class="tr-pane in">
              <header>
                <span class="label-l lang" id="trInLabel"></span>
                <button class="icon-btn sl" id="trPaste" title="Вставить"><span class="ms">content_paste</span></button>
                <button class="icon-btn sl" id="trClear" title="Очистить"><span class="ms">close</span></button>
              </header>
              <textarea id="trInput" spellcheck="false" aria-label="Исходный текст"></textarea>
              <footer>
                <span class="count" id="trCount">0 символов</span>
                <button class="chip sl" id="trDetect" hidden><span class="ms">auto_fix_high</span>Похоже на пивной — расшифровать?</button>
              </footer>
            </div>
            <div class="tr-pane out">
              <header>
                <span class="label-l lang" id="trOutLabel"></span>
              </header>
              <div class="output" id="trOutput" aria-live="polite"></div>
              <footer>
                <span class="count" id="trOutCount"></span>
                <button class="icon-btn sl" id="trShare" title="Поделиться" hidden><span class="ms">share</span></button>
                <button class="btn sl" id="trCopy"><span class="ms">content_copy</span>Копировать</button>
              </footer>
            </div>
          </div>

          <div class="tips">
            <div class="tip"><span class="ms">bolt</span><div><b>Мгновенно</b><span>Перевод появляется прямо во время набора.</span></div></div>
            <div class="tip"><span class="ms">language</span><div><b>RU + EN</b><span>Понимает кириллицу и латиницу, остальное оставляет как есть.</span></div></div>
            <div class="tip"><span class="ms">sports_esports</span><div><b>Скучно?</b><span>Загляни во вкладку «Игры» — там сапёр, змейка и казино.</span></div></div>
          </div>
          <div class="footer">Beer Translate · сделано с любовью к крафту 🍻</div>
        </div>`));

      // пузырьки в шапке
      const bubbles = $('.bubbles', el);
      for (let i = 0; i < 14; i++) {
        const b = document.createElement('span');
        const s = 8 + Beer.rand() * 22;
        b.style.width = b.style.height = s + 'px';
        b.style.left = Beer.rand() * 100 + '%';
        b.style.animationDuration = 5 + Beer.rand() * 7 + 's';
        b.style.animationDelay = -Beer.rand() * 10 + 's';
        bubbles.appendChild(b);
      }

      const input = $('#trInput', el);
      const output = $('#trOutput', el);
      const detect = $('#trDetect', el);
      input.value = store.get('tr:input', '');

      if (navigator.share) $('#trShare', el).hidden = false;

      function render() {
        Beer.$$('.segmented button', el).forEach((b) =>
          b.setAttribute('aria-pressed', String((b.dataset.mode === 'text') === toBeerMode)));
        $('#trInLabel', el).textContent = toBeerMode ? 'Русский / English' : 'Пивной язык 🍺';
        $('#trOutLabel', el).textContent = toBeerMode ? 'Пивной язык 🍺' : 'Русский / English';
        input.placeholder = toBeerMode ? 'Введите текст…' : 'Вставьте пивной шифр…';
        output.dataset.placeholder = 'Здесь появится перевод';
        translate();
      }

      function translate() {
        const val = input.value;
        store.set('tr:input', val);
        $('#trCount', el).textContent = val.length + ' ' + plural(val.length, ['символ', 'символа', 'символов']);
        if (toBeerMode) {
          output.textContent = toBeer(val);
          const probe = fromBeer(val.trim());
          detect.hidden = !(val.trim().length >= 7 && probe.ratio > 0.7);
        } else {
          output.textContent = fromBeer(val).text;
          detect.hidden = true;
        }
        const o = output.textContent.length;
        $('#trOutCount', el).textContent = o ? o + ' ' + plural(o, ['символ', 'символа', 'символов']) : '';
      }

      function setMode(textMode) {
        toBeerMode = textMode;
        store.set('tr:mode', textMode ? 'text' : 'beer');
        render();
      }

      Beer.$$('.segmented button', el).forEach((b) => (b.onclick = () => setMode(b.dataset.mode === 'text')));
      $('#trSwap', el).onclick = () => {
        const out = output.textContent;
        input.value = out;
        setMode(!toBeerMode);
      };
      detect.onclick = () => setMode(false);
      input.addEventListener('input', translate);
      $('#trClear', el).onclick = () => { input.value = ''; translate(); input.focus(); };
      $('#trPaste', el).onclick = async () => {
        try {
          input.value = await navigator.clipboard.readText();
          translate();
        } catch (e) { snack('Браузер не дал доступ к буферу обмена'); input.focus(); }
      };
      $('#trCopy', el).onclick = async () => {
        const t = output.textContent;
        if (!t) return snack('Сначала введите текст');
        try { await navigator.clipboard.writeText(t); snack('Скопировано 🍺'); }
        catch (e) {
          const ta = h('<textarea style="position:fixed;opacity:0"></textarea>');
          ta.value = t; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); snack('Скопировано 🍺'); } catch (e2) { snack('Не удалось скопировать'); }
          ta.remove();
        }
      };
      $('#trShare', el).onclick = () => {
        const t = output.textContent;
        if (t) navigator.share({ text: t }).catch(() => {});
      };

      render();
    },
  });

  function plural(n, forms) {
    const a = n % 100, b = n % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
  }
  Beer.plural = plural;
})();
