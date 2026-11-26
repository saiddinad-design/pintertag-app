/* free account + cloud copy (supabase). sign in with an email code, no password.
   the plan (state) goes to the pt_state table, photos to the private "photos" bucket under <user id>/.
   only the public publishable key lives here; every row and file is locked to its owner by row level security.
   reels videos stay on the device for now (too large for the free tier). */
(function(){
  const URL_ = 'https://mtmjadjiofgopmutdvnw.supabase.co', KEYP = 'sb_publishable_fS-1AGEHPyL4hIMwtiWMgw_S9wC_-zu';
  const LS = 'pintertag-demo-v1', META = 'pintertag-cloud', TOKEN = 'sb-mtmjadjiofgopmutdvnw-auth-token';
  const LOCAL_ONLY = ['view', 'reorder', 'account', 'remembered', 'guest', 'trialOffered'];
  const HQ_SIDE = 2160;
  let sb = null, user = null, timer = null, busy = false, again = false, status = 'idle', lastErr = '';
  const meta = () => { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch(_) { return {}; } };
  const setMeta = o => { try { localStorage.setItem(META, JSON.stringify({ ...meta(), ...o })); } catch(_) {} };
  const tr = (a, b) => (typeof T === 'function' ? T(a, b) : a);
  const say = m => { try { toast(m); } catch(_) {} };

  /* ---------- client (loaded only when needed) ---------- */
  function lib(){ if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/supabase.js?v=2454'; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); }); }
  async function client(){ if (sb) return sb; await lib();
    sb = window.supabase.createClient(URL_, KEYP, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: TOKEN } });
    sb.auth.onAuthStateChange((ev, s) => { const was = user && user.id; user = s ? s.user : null;
      if (!user) synced = null; if (user && user.id !== was && ev === 'SIGNED_IN') afterSignIn(); paint(); });
    const { data } = await sb.auth.getSession(); user = data.session ? data.session.user : null; return sb; }
  const signedHint = () => { try { return !!localStorage.getItem(TOKEN) || /access_token=|type=magiclink/.test(location.hash); } catch(_) { return false; } };

  /* ---------- what we send: the same slim copy the device keeps (photos as short references) ---------- */
  function snapshot(){ let o = {}; try { o = JSON.parse(localStorage.getItem(LS) || '{}'); } catch(_) {}
    LOCAL_ONLY.forEach(k => delete o[k]); return o; }
  function refs(x, out = new Set()){ if (typeof x === 'string'){ if (x.startsWith('idb:')) out.add(x.slice(4)); }
    else if (Array.isArray(x)) x.forEach(v => refs(v, out)); else if (x && typeof x === 'object') for (const k in x) refs(x[k], out); return out; }
  function photoIds(d){ const ids = new Set(); const add = arr => (arr || []).forEach(p => { if (p && p.id && !/^sample\d+$/.test(p.id)) ids.add(String(p.id)); });
    add(d.photos); add(d.storyMedia); for (const k in (d.spaces || {})){ add(d.spaces[k].photos); add(d.spaces[k].storyMedia); } return ids; }
  const safe = k => String(k).replace(/[^A-Za-z0-9._-]/g, c => '~' + c.charCodeAt(0).toString(16));
  const pathOf = (uid, k) => uid + '/' + safe(k);
  const hasOwn = d => (d.plans || []).length > 0 || [...photoIds(d)].length > 0;
  const toBlob = v => v instanceof Blob ? Promise.resolve(v) : fetch(v).then(r => r.blob());
  const toData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  async function shrink(b){ try { const u = URL.createObjectURL(b); const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      const r = Math.min(1, HQ_SIDE / Math.max(im.naturalWidth, im.naturalHeight)); if (r === 1 && b.size < 1.6e6){ URL.revokeObjectURL(u); return b; }
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      return await new Promise(res => c.toBlob(x => res(x || b), 'image/jpeg', .9)); } catch(_) { return b; } }

  /* ---------- push: files first, then the plan ---------- */
  async function push(){ if (!user) return; if (busy){ again = true; return; } busy = true; status = 'saving'; paint();
    try { const uid = user.id, d = snapshot(), m = meta(), up = new Set(m.uid === uid ? (m.up || []) : []);
      for (const k of refs(d)){ if (up.has(k)) continue; const v = await PTStore.get(k); if (!v) continue;
        const { error } = await sb.storage.from('photos').upload(pathOf(uid, k), await toBlob(v), { upsert: true, contentType: 'image/jpeg' });
        if (error) throw error; up.add(k); setMeta({ uid, up: [...up] }); }
      for (const id of photoIds(d)){ const k = id + ':orig'; if (up.has(k)) continue; const b = window.PTHQ && await PTHQ.get(id); if (!b){ up.add(k); continue; }
        const { error } = await sb.storage.from('photos').upload(pathOf(uid, k), await shrink(b), { upsert: true, contentType: 'image/jpeg' });
        if (error) throw error; up.add(k); setMeta({ uid, up: [...up] }); }
      const row = { user_id: uid, data: d, updated_at: new Date().toISOString() };
      if (typeof m.marketing === 'boolean') row.marketing = m.marketing;
      const { error } = await sb.from('pt_state').upsert(row); if (error) throw error;
      setMeta({ uid, up: [...up], at: row.updated_at, dirty: false }); status = 'ok'; lastErr = '';
    } catch (e) { status = 'error'; lastErr = String(e && (e.message || e.error) || e); }
    finally { busy = false; paint(); if (again){ again = false; schedule(1500); } } }
  function schedule(ms = 4000){ if (!user) return; clearTimeout(timer); timer = setTimeout(push, ms); }

  /* ---------- pull: bring the account's plan and photos onto this device ---------- */
  async function restore(row){ const uid = user.id, d = row.data || {}; status = 'loading'; paint();
    const up = new Set();
    for (const k of refs(d)){ up.add(k); if (await PTStore.get(k)) continue;
      const { data: b } = await sb.storage.from('photos').download(pathOf(uid, k)); if (b) await PTStore.put(k, await toData(b)); }
    for (const id of photoIds(d)){ const k = id + ':orig'; up.add(k); if (window.PTHQ && await PTHQ.get(id)) continue;
      const { data: b } = await sb.storage.from('photos').download(pathOf(uid, k)); if (b) await PTStore.put(k, b); }
    const keep = {}; ['lang', 'theme'].forEach(k => { if (state[k] !== undefined) keep[k] = state[k]; });
    Object.keys(state).forEach(k => { if (!['lang', 'theme', 'view'].includes(k)) delete state[k]; });
    Object.assign(state, { photos: [], plans: [], result: [], before: [], recipes: [] }, d, keep);
    try { await PTStore.hydrate(state); } catch(_) {}
    clearTimeout(timer); try { save(); } catch(_) {}
    setMeta({ uid, up: [...up], at: row.updated_at, dirty: false }); status = 'ok'; paint(); try { render(); } catch(_) {} }
  async function fetchRow(){ const { data, error } = await sb.from('pt_state').select('data, updated_at, marketing').eq('user_id', user.id).maybeSingle(); if (error) throw error; return data; }

  /* first sign in on a device, or a newer copy from another device */
  let synced = null;
  async function afterSignIn(){ if (!user || synced === user.id) return; synced = user.id; if (!meta().up) window.PTStats && PTStats.track('signup'); try { const row = await fetchRow(), m = meta(), mine = m.uid === user.id;
      if (!row){ await push(); say(tr('Hesabın hazır. Planın artık yedekleniyor.', 'Account ready. Your plan is backed up now.')); return; }
      if (typeof m.marketing !== 'boolean' && typeof row.marketing === 'boolean') setMeta({ marketing: row.marketing });
      const local = snapshot(), localHas = hasOwn(local), cloudHas = hasOwn(row.data || {});
      if (mine && !m.dirty){ if (row.updated_at !== m.at) await restore(row); else schedule(500); return; }
      if (!localHas || (mine && row.updated_at === m.at)){ await restore(row); if (cloudHas) say(tr('Planın geri geldi.', 'Your plan is back.')); return; }
      if (!cloudHas){ await push(); return; }
      choose(row);
    } catch (e) { status = 'error'; lastErr = String(e && e.message || e); paint(); }
    finally { /* after sign in: bring back any photo this device has lost from the backup */
    try { if ((state.photos || []).some(p => p.lost) && await PTStore.hydrate(state)){ save(); render(); } } catch(_) {} } }
  function choose(row){ const when = new Date(row.updated_at).toLocaleString(state.lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    modal(tr('hangisi kalsın?', 'which one stays?'), `<div class="cl-sheet"><p>${tr('Hem hesabında hem bu cihazda bir plan var.', 'There is a plan in your account and on this device.')}</p>
      <button class="cl-opt" data-action="cl-take-cloud"><b>${tr('Hesabımdakini getir', 'Bring my account’s plan')}</b><small>${tr('Son kayıt: ', 'Last saved: ') + when}</small></button>
      <button class="cl-opt" data-action="cl-take-local"><b>${tr('Bu cihazdakini kaydet', 'Keep this device’s plan')}</b><small>${tr('Hesaptaki plan bununla değişir.', 'Replaces the plan in your account.')}</small></button></div>`);
    pendingRow = row; }
  let pendingRow = null;

  /* ---------- sign in sheet ---------- */
  let sentTo = '';
  function sheet(){ const m = meta();
    if (user) return modal(tr('hesabın.', 'your account.'), `<div class="cl-sheet"><div class="cl-who"><span class="cl-av">${esc((user.email || '?')[0].toUpperCase())}</span><div><b>${esc(user.email || '')}</b><small class="cl-state">${stateLine()}</small></div></div>
      <p class="cl-note">${tr('Grid’in, planların ve fotoğrafların hesabında yedekli. Başka telefonda aynı e-postayla girince hepsi gelir. Reels videoları şimdilik sadece bu cihazda.', 'Your grid, plans and photos are backed up to your account. Sign in with the same email on another phone and it all comes back. Reels videos stay on this device for now.')}</p>
      <label class="m-check"><input type="checkbox" id="cl-mk" ${m.marketing ? 'checked' : ''}><span>${tr('Yeni özellik ve ipuçlarını e-postayla almak istiyorum.', 'Email me new features and tips.')}</span></label>
      <div class="actions">${action('cl-sync', tr('Şimdi yedekle', 'Back up now'), 'pill solid')}${action('cl-out', tr('Çıkış yap', 'Sign out'), 'pill')}</div>
      <button class="cl-del" data-action="cl-del">${tr('Hesabımı sil', 'Delete my account')}</button></div>`);
    if (sentTo) return modal(tr('kodu gir.', 'enter your code.'), `<form class="cl-sheet" id="cl-code-form"><p>${tr(`<b>${esc(sentTo)}</b> adresine 6 haneli bir kod gönderdik. Gönderen: Pintertag.`, `We sent a 6-digit code to <b>${esc(sentTo)}</b>. From: Pintertag.`)}</p>
      <input class="cl-input cl-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" placeholder="••••••" required>
      <button class="pill solid wide" type="submit">${tr('Giriş yap', 'Sign in')}</button>
      <p class="cl-note">${tr('E-postadaki butona da dokunabilirsin. Gelmediyse spam klasörüne bak.', 'You can also tap the button in the email. Not there? Check spam.')}</p>
      <button type="button" class="cl-link" data-action="cl-back">${tr('Başka e-posta kullan', 'Use another email')}</button></form>`);
    const last = m.last || '', back = !!(last && m.consent);
    modal(back ? tr('tekrar hoş geldin.', 'welcome back.') : tr('ücretsiz hesap.', 'free account.'), `<form class="cl-sheet" id="cl-mail-form"><p class="cl-lead">${tr('Planın yedeklensin, her telefonda açılsın.', 'Back up your plan. Open it on any phone.')}</p>
      <div class="cl-field">${last ? `<span class="cl-last">${tr('Son kullanılan', 'Last used')}</span>` : ''}<input class="cl-input" name="email" type="email" autocomplete="email" inputmode="email" placeholder="${tr('e-posta adresin', 'your email')}" value="${esc(last)}" required></div>
      <label class="m-check"><input type="checkbox" name="consent" required ${back ? 'checked' : ''}><span>${tr('Yedeğimin AB’deki (İrlanda) sunucuda saklanmasına açık rıza veriyorum.', 'I consent to my backup being stored on a server in the EU (Ireland).')}</span></label>
      ${back ? '' : `<label class="m-check"><input type="checkbox" name="mk"><span>${tr('Yeni özellikleri e-postayla almak istiyorum.', 'Email me new features.')}</span></label>`}
      <button class="pill solid wide" type="submit">${tr('E-postama kod gönder', 'Email me a code')}</button>
      <p class="cl-note">${tr('Şifre yok, ücret yok. Devam edersen ', 'No password, no fee. By continuing you accept the ')}<button type="button" class="cl-link" data-action="m-legal" data-doc="terms">${tr('Kullanım Koşulları', 'Terms')}</button>${tr(' ve ', ' and ')}<button type="button" class="cl-link" data-action="m-legal" data-doc="privacy">${tr('Gizlilik', 'Privacy')}</button>${tr(' metnini kabul edersin.', ' notice.')}</p></form>`); }
  function stateLine(){ const m = meta();
    if (status === 'saving' || status === 'loading') return tr('Yedekleniyor…', 'Backing up…');
    if (status === 'error') return tr('Yedeklenemedi. İnternetini kontrol et.', 'Backup failed. Check your connection.');
    if (m.at) return tr('Yedeklendi · ', 'Backed up · ') + new Date(m.at).toLocaleTimeString(state.lang === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    return tr('Bağlandı', 'Connected'); }
  function paint(){ const s = document.querySelector('#modal[open] .cl-state'); if (s) s.textContent = stateLine(); card(); }

  /* settings: the "this device" card becomes the account card */
  function card(){ document.querySelectorAll('.m-acct-card').forEach(b => { b.dataset.action = 'cl-open'; delete b.dataset.page;
    const html = user ? `<span class="m-avatar">${esc((user.email || 'P')[0].toUpperCase())}</span><span><b>${esc(user.email || '')}</b><small>${stateLine()}</small></span><em class="m-badge">${tr('Ücretsiz', 'Free')}</em>`
      : `<span class="m-avatar" aria-hidden="true">+</span><span><b>${tr('Ücretsiz hesap aç', 'Create a free account')}</b><small>${tr('Planın yedeklensin, kaybolmasın', 'Back up your plan so it’s never lost')}</small></span><em class="m-badge">${tr('Ücretsiz', 'Free')}</em>`;
    if (b.dataset.cl !== html){ b.innerHTML = html; b.dataset.cl = html; } }); nudge(); }

  /* home: one quiet line while the plan lives only on this device */
  function nudge(){ const grid = document.querySelector('.simple-app .pt-plan-bar'), old = document.querySelector('.cl-nudge');
    const show = grid && !user && !signedHint() && hasOwn(snapshot()) && !(Date.now() < (meta().snooze || 0));
    if (!show){ if (old) old.remove(); return; } if (old) return;
    const n = document.createElement('div'); n.className = 'cl-nudge';
    n.innerHTML = `<button data-action="cl-open"><b>${tr('Planın sadece bu telefonda.', 'Your plan lives only on this phone.')}</b><span>${tr('Ücretsiz hesapla yedekle', 'Back it up with a free account')}</span></button><button class="cl-x" data-action="cl-snooze" aria-label="${tr('Kapat', 'Close')}">×</button>`;
    grid.before(n); }

  /* ---------- actions ---------- */
  document.addEventListener('click', async e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (!/^cl-/.test(a)) return; e.preventDefault(); e.stopImmediatePropagation();
    try {
      if (a === 'cl-open'){ sheet(); client().then(() => { paint(); if (user && document.querySelector('#cl-mail-form')) sheet(); }).catch(() => {}); }
      if (a === 'cl-snooze'){ setMeta({ snooze: Date.now() + 3 * 864e5 }); nudge(); }
      if (a === 'cl-back'){ sentTo = ''; sheet(); }
      if (a === 'cl-sync'){ const mk = document.getElementById('cl-mk'); if (mk) setMeta({ marketing: mk.checked }); await push(); say(status === 'ok' ? tr('Yedeklendi.', 'Backed up.') : tr('Yedeklenemedi.', 'Backup failed.')); }
      if (a === 'cl-out'){ await push(); await sb.auth.signOut(); user = null; sentTo = ''; closeModal(); paint(); say(tr('Çıkış yapıldı. Planın bu cihazda duruyor.', 'Signed out. Your plan stays on this device.')); }
      if (a === 'cl-take-cloud' && pendingRow){ closeModal(); await restore(pendingRow); pendingRow = null; say(tr('Hesabındaki plan getirildi.', 'Your account’s plan is here.')); }
      if (a === 'cl-take-local'){ closeModal(); pendingRow = null; setMeta({ uid: user.id, dirty: true }); await push(); say(tr('Bu cihazdaki plan hesabına kaydedildi.', 'This device’s plan is saved to your account.')); }
      if (a === 'cl-del'){ modal(tr('hesabı sil?', 'delete account?'), `<div class="cl-sheet"><p>${tr('Hesabın, buluttaki planın ve fotoğrafların kalıcı olarak silinir. Bu cihazdaki planın kalır. Geri alınamaz.', 'Your account, cloud plan and photos are deleted for good. The plan on this device stays. This can’t be undone.')}</p><div class="actions">${action('cl-del-yes', tr('Kalıcı olarak sil', 'Delete for good'), 'pill m-danger')}${action('cl-open', tr('Vazgeç', 'Cancel'), 'pill')}</div></div>`); }
      if (a === 'cl-del-yes'){ b.disabled = true; await removeAccount(); closeModal(); say(tr('Hesabın silindi.', 'Your account is deleted.')); }
    } catch (err) { say(tr('Bir sorun oldu: ', 'Something went wrong: ') + (err && err.message || err)); paint(); }
  }, true);
  document.addEventListener('change', e => { if (e.target && e.target.id === 'cl-mk'){ setMeta({ marketing: e.target.checked, dirty: true }); schedule(800); } });
  document.addEventListener('submit', async e => { const f = e.target; if (!f || !/^cl-/.test(f.id)) return; e.preventDefault();
    const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try { await client();
      if (f.id === 'cl-mail-form'){ const email = f.elements.email.value.trim().toLowerCase(); setMeta({ ...(f.elements.mk ? { marketing: !!f.elements.mk.checked } : {}), consent: Date.now(), last: email });
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error; sentTo = email; sheet(); setTimeout(() => document.querySelector('.cl-code')?.focus(), 60); }
      if (f.id === 'cl-code-form'){ const token = f.elements.code.value.replace(/\D/g, '');
        const { error } = await sb.auth.verifyOtp({ email: sentTo, token, type: 'email' }); if (error) throw error;
        sentTo = ''; closeModal(); say(tr('Giriş yapıldı.', 'Signed in.')); }
    } catch (err) { const msg = String(err && err.message || err);
      say(/rate|seconds|too many/i.test(msg) ? tr('Çok sık denendi. Biraz bekleyip tekrar dene.', 'Too many tries. Wait a moment and try again.')
        : /expired|invalid|token/i.test(msg) ? tr('Kod hatalı ya da süresi geçmiş.', 'The code is wrong or expired.') : tr('Olmadı: ', 'Didn’t work: ') + msg);
      if (btn) btn.disabled = false; } }, true);

  async function removeAccount(){ const uid = user.id;
    for (;;){ const { data, error } = await sb.storage.from('photos').list(uid, { limit: 1000 }); if (error) throw error; if (!data || !data.length) break;
      const { error: e2 } = await sb.storage.from('photos').remove(data.map(o => uid + '/' + o.name)); if (e2) throw e2; if (data.length < 1000) break; }
    const { error } = await sb.rpc('delete_my_account'); if (error) throw error;
    await sb.auth.signOut(); user = null; localStorage.removeItem(META); paint(); }

  /* every local save marks the device copy as newer and backs it up a few seconds later */
  const _save = PTStore.save;
  PTStore.save = function(st, warn){ const r = _save.apply(this, arguments); if (user){ setMeta({ dirty: true }); schedule(); } return r; };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && user && meta().dirty) push(); });
  let raf = 0; new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; card(); }); }).observe(document.body, { childList: true, subtree: true });

  /* returning user (or coming back from the email link): connect quietly */
  if (signedHint()) client().then(() => { if (user) afterSignIn(); paint(); }).catch(() => {});
  /* from the score page: "plan your next 9 posts" opens the free account sheet once */
  if (/[?&]signup=1/.test(location.search) && !signedHint()) setTimeout(() => { try { history.replaceState(null, '', location.pathname); } catch(_) {} if (!user) sheet(); }, 2200);
  window.PTCloud = { push, client, get user(){ return user; }, get status(){ return status; }, get error(){ return lastErr; }, _set(c, u){ sb = c; user = u; } };
})();
