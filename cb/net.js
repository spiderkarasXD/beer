'use strict';
/* =========================================================
   CaseBeer — облако (Supabase): аккаунты, сохранения, топ, дропы, аватарки.
   Работает через REST API Supabase без сторонних библиотек.
   Если Supabase недоступен — сайт продолжает работать локально.
   ========================================================= */
window.CB_NET = (() => {
  const URL_ = 'https://zsrnbvlmuwofmpezqbct.supabase.co';
  const KEY = 'sb_publishable_asWGR_4h-Bth7eZRntdUnw_j2EcYJgP'; // публичный ключ, его можно хранить в коде
  const EMAIL_DOMAIN = 'casebeer.app';                          // ник → служебная почта для входа

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('cb2:' + k)); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem('cb2:' + k); else localStorage.setItem('cb2:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  let session = store.get('session');

  // ник (в том числе кириллица) → постоянная служебная почта
  function emailFor(nick) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (const ch of nick.trim().toLowerCase()) {
      const c = ch.codePointAt(0);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return `u${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}@${EMAIL_DOMAIN}`;
  }

  class NetError extends Error {}
  async function call(path, { method = 'GET', body, headers = {}, auth = true, raw = false } = {}) {
    if (auth && session) await ensureFresh();
    const h = { apikey: KEY, ...headers };
    if (auth && session) h.Authorization = 'Bearer ' + session.access_token;
    if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(URL_ + path, { method, cache: 'no-store', headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    } catch (e) { throw new NetError('offline'); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + res.status);
      const err = new NetError(msg); err.status = res.status; err.code = data && data.code; throw err;
    }
    return data;
  }

  function keep(s) {
    session = s && s.access_token ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in || 3600) * 1000, uid: s.user ? s.user.id : session && session.uid } : null;
    store.set('session', session);
    return session;
  }
  let refreshing = null;
  async function ensureFresh() {
    if (!session || Date.now() < session.expires_at - 60e3) return;
    if (!refreshing) {
      refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })
        .then(keep)
        .catch((e) => { if (e.status === 400 || e.status === 401) keep(null); throw e; })
        .finally(() => { refreshing = null; });
    }
    await refreshing;
  }

  /* ---------- аккаунт ---------- */
  async function signUp(nick, password, state, netWorth, balance) {
    nick = nick.trim();
    const taken = await call('/rest/v1/rpc/nick_taken', { method: 'POST', body: { p_nick: nick }, auth: false });
    if (taken) throw new NetError('nick_taken');
    const r = await call('/auth/v1/signup', { method: 'POST', body: { email: emailFor(nick), password }, auth: false });
    if (!r || !r.access_token) throw new NetError('confirm_email_on'); // в настройках Supabase включено подтверждение почты
    keep(r);
    const [row] = await call('/rest/v1/profiles', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { id: session.uid, nick, state, net_worth: netWorth, balance } });
    return row;
  }
  async function signIn(nick, password) {
    keep(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: emailFor(nick), password }, auth: false }));
    return loadProfile();
  }
  async function signOut() {
    try { await call('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* всё равно выходим */ }
    keep(null);
  }
  async function loadProfile() {
    if (!session) return null;
    const rows = await call(`/rest/v1/profiles?id=eq.${session.uid}&select=*`);
    return rows && rows[0] || null;
  }
  async function updateProfile(patch) {
    if (!session) return null;
    const rows = await call(`/rest/v1/profiles?id=eq.${session.uid}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { ...patch, updated_at: new Date().toISOString() } });
    return rows && rows[0];
  }

  /* ---------- сохранение (с задержкой, чтобы не слать запрос на каждый клик) ---------- */
  let pending = null, timer = null, inflight = false;
  function queueSave(state, netWorth, balance) {
    if (!session) return;
    pending = { state, net_worth: netWorth, balance };
    clearTimeout(timer);
    timer = setTimeout(flush, 1500);
  }
  async function flush() {
    if (!pending || inflight || !session) return;
    const p = pending; pending = null; inflight = true;
    try { await updateProfile(p); }
    catch (e) { if (!pending) pending = p; setTimeout(flush, 10000); }
    finally { inflight = false; }
  }
  window.addEventListener('pagehide', () => { if (pending && session) { clearTimeout(timer); flush(); } });

  /* ---------- топ ---------- */
  const leaderboard = (limit = 10) => call(`/rest/v1/leaderboard?select=nick,avatar_url,peak,balance,pinned&order=peak.desc&limit=${limit}`, { auth: false });

  /* ---------- реальные дропы ---------- */
  function postDrop(nick, skinId, caseId) {
    if (!session) return;
    call('/rest/v1/drops', { method: 'POST', body: { nick, skin_id: skinId, case_id: caseId } }).catch(() => {});
  }
  const recentDrops = (afterId = 0, limit = 20) =>
    call(`/rest/v1/drops?select=id,user_id,nick,skin_id,case_id&id=gt.${afterId}&order=id.desc&limit=${limit}`, { auth: false });

  /* ---------- аватарка: обрезаем до квадрата 256×256 и грузим в Storage ---------- */
  async function uploadAvatar(file) {
    if (!session) throw new NetError('not_logged_in');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
    URL.revokeObjectURL(img.src);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    const path = `avatars/${session.uid}/avatar.jpg`;
    await call('/storage/v1/object/' + path, { method: 'POST', raw: true, body: blob, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' } });
    const url = `${URL_}/storage/v1/object/public/${path}?v=${Date.now()}`;
    await updateProfile({ avatar_url: url });
    return url;
  }

  return {
    get loggedIn() { return !!session; },
    get uid() { return session && session.uid; },
    signUp, signIn, signOut, loadProfile, updateProfile, queueSave, flush, leaderboard, postDrop, recentDrops, uploadAvatar, NetError,
  };
})();
