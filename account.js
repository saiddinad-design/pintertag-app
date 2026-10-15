/* account, 7-day pro trial, free limits, paywall, privacy & legal.
   PROTOTYPE HONESTY: there is no server yet. the account lives on this device, the trial is a local clock,
   and no payment is ever taken. apple/google sign-in and real purchases arrive with the app store build. */
(function(){
  const DAY = 864e5, TRIAL_DAYS = 7, FREE = { photos: 30, plans: 5 };
  const PRICE = { year: '₺899,99', yearMonthly: '₺75', month: '₺129,99', save: '%42' };
  const PRO_ACTIONS = { 'm-p-carousel': 'carousel', 'm-p-story': 'story', 'm-today-next': 'today' };
  const MINE = ['acct', 'plan', 'privacy'];
  const testMode = navigator.webdriver && !/[?&]onboard=1/.test(location.search);

  /* ---------- entitlement ---------- */
  const sub = () => state.sub || (state.sub = { plan: 'free', trialUsed: false, choice: 'year' });
  const daysLeft = () => { const s = sub(); return s.plan === 'trial' ? Math.max(0, Math.ceil((s.trialStart + TRIAL_DAYS*DAY - Date.now()) / DAY)) : 0; };
  /* launch period: every feature free, no paywall. set PT_FREE_LAUNCH = false to switch subscriptions back on (planned 2-3 months after launch) */
  const FREE_LAUNCH = window.PT_FREE_LAUNCH = window.PT_FREE_LAUNCH !== false;
  const isPro = () => { if (FREE_LAUNCH) return true; const s = sub(); return s.plan === 'pro' || (s.plan === 'trial' && daysLeft() > 0); };
  const ownPhotos = () => state.photos.filter(p => !p.imported && !/^sample\d+$/.test(p.id)).length;
  const activePlans = () => (state.plans || []).filter(p => !p.done && new Date(p.date + 'T' + (p.time || '19:00')).getTime() > Date.now() - DAY).length;
  function expire(){ if (FREE_LAUNCH) return; const s = sub(); if (s.plan === 'trial' && daysLeft() <= 0){ s.plan = 'free'; s.trialEnded = Date.now(); save();
    setTimeout(() => paywall('ended'), 900); } }
  window.PTAcct = { isPro, daysLeft, sub, FREE };

  /* ---------- per-account data on this device ----------
     device settings stay shared; photos, plans, subscription and consents live in each account's own box.
     on log out the live data is boxed and cleared, on log in the box comes back. (cross-device sync needs the server.) */
  const KEY = 'pintertag-demo-v1', DEVICE = ['lang','theme','view','reorder','account','remembered','guest','trialOffered'];
  const boxKey = email => 'pintertag-box-' + String(email).trim().toLowerCase();
  const hasBox = email => { try { return !!localStorage.getItem(boxKey(email)); } catch(_) { return false; } };
  function stash(){ if (!state.account) return; save();
    try { const slim = JSON.parse(localStorage.getItem(KEY) || '{}'); DEVICE.forEach(k => delete slim[k]); localStorage.setItem(boxKey(state.account.email), JSON.stringify(slim)); } catch(_) {} }
  function clearData(){ Object.keys(state).forEach(k => { if (!DEVICE.includes(k)) delete state[k]; });
    /* explicit clean values: app.js shares its defaults arrays with a fresh state, so they can't be trusted */
    Object.assign(state, { mode: 'brand', purpose: 'grid', style: 'balanced', count: 9, photos: [], result: [], before: [], plans: [], recipes: [], vote: { favorites: [], cover: null, comment: '' } }); }
  async function unstash(email){ let box = null; try { box = JSON.parse(localStorage.getItem(boxKey(email)) || 'null'); } catch(_) {}
    if (!box) return false; clearData(); Object.assign(state, box); try { await PTStore.hydrate(state); } catch(_) {} return true; }
  async function login(acc){ const back = await unstash(acc.email); state.account = { ...acc }; state.guest = false; save();
    try { localStorage.removeItem(boxKey(acc.email)); } catch(_) {} return back; }
  function wipeImages(ids){ return new Promise(res => { try { const r = indexedDB.open('pintertag-photos', 1);
    r.onsuccess = () => { try { const tx = r.result.transaction('img', 'readwrite'), st = tx.objectStore('img'), q = st.openCursor();
      q.onsuccess = () => { const c = q.result; if (!c) return; if (ids.has(String(c.key).split(':')[0])) c.delete(); c.continue(); }; tx.oncomplete = () => res(); tx.onerror = () => res(); } catch(_) { res(); } };
    r.onerror = () => res(); } catch(_) { res(); } }); }

  /* ---------- small helpers ---------- */
  const legalLink = (doc, label) => `<button type="button" class="m-link" data-action="m-legal" data-doc="${doc}">${label}</button>`;
  const check = (name, label, on, req) => `<label class="m-check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${req ? 'required' : ''}><span>${label}</span></label>`;
  const benefit = (t, s) => `<li><span class="m-tick" aria-hidden="true">✓</span><span><b>${t}</b><small>${s}</small></span></li>`;

  /* ---------- legal docs ---------- */
  function openDoc(doc, back){ const d = PTLegal[doc]; if (!d) return;
    const body = d.sections.map(([h, p]) => `<h3>${esc(h)}</h3><p>${esc(p)}</p>`).join('');
    modal(T(d.tr, d.en) + '.', `<div class="m-legal">${state.lang === 'en' ? '<p class="m-draft">The English translation will be published before launch. Turkish text below.</p>' : ''}<p class="m-draft">${esc(PTLegal.draft)} ${T('Son güncelleme','Updated')}: ${PTLegal.updated}</p>${body}</div>${back ? action('m-pw-open', T('Geri','Back'), 'pill wide space', `data-ctx="${esc(back)}"`) : ''}`); }

  /* ---------- paywall ---------- */
  let pwCtx = '';
  const REASON = {
    carousel: ['Carousel sırası Pro’da.','Carousel ordering is a Pro feature.'], story: ['Story dizisi Pro’da.','Story sequences are a Pro feature.'],
    today: ['Başka öneri Pro’da. Günün önerisi her gün ücretsiz.','More picks are Pro. The daily pick stays free.'],
    photos: [`Ücretsiz planda ${FREE.photos} fotoğrafa kadar.`, `The free plan holds up to ${FREE.photos} photos.`],
    plans: [`Ücretsiz planda aynı anda ${FREE.plans} plan.`, `The free plan holds ${FREE.plans} plans at a time.`],
    progress: ['Tüm ilerleme geçmişi Pro’da. Ücretsizde son 7 gün.','Your full progress history is Pro. Free shows the last 7 days.'],
    shots: ['Tam çekim listesi Pro’da. Ücretsizde ilk 3 madde.','The full shot list is Pro. Free shows the first 3.'],
    ended: ['Pro denemen bitti. Hiçbir şeyin silinmedi.','Your Pro trial has ended. Nothing was deleted.'] };
  function paywall(ctx){ if (FREE_LAUNCH) return; pwCtx = ctx || ''; const s = sub(), choice = s.choice || 'year', canTrial = !s.trialUsed;
    const why = REASON[ctx] ? `<p class="m-pw-why">${T(...REASON[ctx])}</p>` : '';
    const opt = (k, title, price, note, tag) => `<button class="m-pw-opt ${choice === k ? 'on' : ''}" data-action="m-pw-plan" data-plan="${k}" aria-pressed="${choice === k}"><span><b>${title}</b><small>${note}</small></span><span class="m-pw-price">${price}</span>${tag ? `<em>${tag}</em>` : ''}</button>`;
    const price = choice === 'year' ? `${PRICE.year}/${T('yıl','year')}` : `${PRICE.month}/${T('ay','month')}`;
    const fine = canTrial
      ? T(`7 gün ücretsiz, sonra ${price}. Deneme bitmeden en az 24 saat önce iptal edersen ücret alınmaz. Abonelik, dönem bitmeden 24 saat önce iptal edilmezse otomatik yenilenir. İptal: App Store > Abonelikler.`, `Free for 7 days, then ${price}. Cancel at least 24 hours before the trial ends and you won’t be charged. Renews automatically unless cancelled 24 hours before the period ends. Cancel in App Store > Subscriptions.`)
      : T(`${price}. Abonelik, dönem bitmeden 24 saat önce iptal edilmezse otomatik yenilenir. İptal: App Store > Abonelikler.`, `${price}. Renews automatically unless cancelled 24 hours before the period ends. Cancel in App Store > Subscriptions.`);
    modal(T('pintertag pro.','pintertag pro.'), `${why}
      <ul class="m-pw-list">${benefit(T('Carousel ve story sırası','Carousel & story order'), T('Kapak seçimi, kaydırma ve story akışı.','Cover pick, swipe order and story flow.'))}
        ${benefit(T('Sınırsız plan, 200 fotoğraf','Unlimited plans, 200 photos'), T(`Ücretsizde ${FREE.plans} plan, ${FREE.photos} fotoğraf.`, `Free: ${FREE.plans} plans, ${FREE.photos} photos.`))}
        ${benefit(T('Ayda 500 AI kredisi','500 AI credits a month'), T('Fotoğraf türlerini AI etiketler. Ücretsizde 20.','AI tags your photo types. Free: 20.'))}
        ${benefit(T('İlerlemeni gör','See your progress'), T('Grid uyumun her gün kaydedilir: “4 haftada 68’den 86’ya”. Ücretsizde son 7 gün.','Your grid harmony is logged daily: “68 to 86 in 4 weeks”. Free: last 7 days.'))}${benefit(T('Tam çekim listesi','Full shot list'), T('Hedef vibe’ına göre 6 maddeye kadar; neyi çekeceğini bil. Ücretsizde 3.','Up to 6 items for your target vibe; know what to shoot. Free: 3.'))}${benefit(T('Sınırsız “Bugün ne paylaşayım?”','Unlimited “What to post today?”'), T('Beğenmezsen bir sonraki öneri.','Don’t like it? Get the next pick.'))}</ul>
      <div class="m-pw-opts">${opt('year', T('Yıllık','Yearly'), PRICE.year, T(`Ayda ${PRICE.yearMonthly}`, `${PRICE.yearMonthly} a month`), T(`${PRICE.save} avantajlı`, `save ${PRICE.save.replace('%','')}%`))}${opt('month', T('Aylık','Monthly'), PRICE.month, T('İstediğin an iptal','Cancel anytime'))}</div>
      ${action('m-pw-start', canTrial ? T('7 gün ücretsiz başla','Start 7 days free') : T('Pro’ya geç','Go Pro'), 'pill solid wide')}
      ${action('m-pw-later', ctx === 'onboard' ? T('Şimdilik ücretsiz devam et','Continue free for now') : T('Şimdi değil','Not now'), 'text-button wide')}
      <p class="m-fine">${fine}</p>
      <p class="m-fine m-links">${legalLink('terms', T('Kullanım Koşulları','Terms'))} · ${legalLink('privacy', T('Gizlilik','Privacy'))} · <button type="button" class="m-link" data-action="m-pw-restore">${T('Satın alımları geri yükle','Restore purchases')}</button></p>
      <p class="m-proto">${T('Prototip: bu sürümde ödeme alınmaz, kart bilgisi istenmez; deneme bu cihazda başlar. Fiyatlar taslaktır.','Prototype: no payment is taken and no card is asked for; the trial runs on this device. Prices are drafts.')}</p>`); }
  function startTrial(){ const s = sub();
    if (s.trialUsed){ modal(T('ödeme henüz bağlı değil.','payments aren’t connected yet.'), `<p class="m-reason">${T('Satın alma, App Store ve Google Play sürümüyle açılacak. Bu prototipte ödeme alınmıyor.','Purchases open with the App Store and Google Play release. This prototype takes no payment.')}</p>${action('m-pw-later', T('Tamam','OK'), 'pill solid wide')}`); return; }
    Object.assign(s, { plan: 'trial', trialStart: Date.now(), trialUsed: true }); save(); closeModal(); render();
    toast(T('Pro denemen başladı: 7 gün her şey açık. Bitmeden 2 gün önce burada hatırlatırız.','Your Pro trial has started: everything is open for 7 days. We’ll remind you here 2 days before it ends.')); }

  /* ---------- onboarding ---------- */
  let onb = null, pendingKeep = false;
  function keepImport(){ if (!pendingKeep) return; pendingKeep = false; const b = document.createElement('button'); b.dataset.action = 'm-gc-keep'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }
  function onboard(step){ if (!onb){ onb = document.createElement('div'); onb.id = 'pt-onb'; onb.setAttribute('role', 'dialog'); onb.setAttribute('aria-modal', 'true'); document.body.appendChild(onb); }
    document.body.classList.add('pt-onb-open');
    if (step === 'email'){ onb.innerHTML = `<div class="pt-onb-in"><button class="pt-onb-back" data-action="m-onb" data-step="signup" aria-label="${T('Geri','Back')}">‹</button>
      <h1>${T('e-postanla devam et.','continue with email.')}</h1><p class="pt-onb-sub">${T('Şifre yok. Bu sürümde hesabın yalnızca bu cihazda tutulur.','No password. In this version your account stays on this device.')}</p>
      <form id="pt-onb-form" novalidate><label class="control-label" for="pt-n">${T('Adın','Your name')}</label><input class="field" id="pt-n" name="name" autocomplete="name" maxlength="40">
      <label class="control-label" for="pt-e">${T('E-posta','Email')}</label><input class="field" id="pt-e" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="80">
      <div class="pt-onb-checks">${check('terms', T(`${legalLink('terms','Kullanım Koşulları')}’nı ve ${legalLink('privacy','Gizlilik Politikası')}’nı kabul ediyorum.`, `I accept the ${legalLink('terms','Terms')} and ${legalLink('privacy','Privacy Policy')}.`), false, true)}
      ${check('ai', T('AI etiketleme: fotoğraf önizlemelerimin türlerini belirlemek için yurt dışındaki AI sağlayıcısına gönderilmesine açık rıza veriyorum. (İsteğe bağlı)','AI tagging: I consent to small previews of my photos being sent to the AI provider abroad to detect their type. (Optional)'), false)}
      ${check('mkt', T('Yenilik ve kampanyalardan e-postayla haberdar olmak istiyorum. (İsteğe bağlı)','Email me about news and offers. (Optional)'), false)}</div>
      <p class="pt-onb-err" id="pt-onb-err" role="alert"></p>
      <button class="pill solid wide" type="submit">${T('Devam et','Continue')}</button></form>
      <p class="pt-onb-legal">${legalLink('kvkk', T('KVKK Aydınlatma Metni','KVKK notice'))}</p></div>`;
      setTimeout(() => onb.querySelector('#pt-e')?.focus(), 50); return; }
    if (step === 'signup'){ onb.innerHTML = `<div class="pt-onb-in pt-onb-welcome"><button class="pt-onb-back" data-action="m-onb" data-step="welcome" aria-label="${T('Geri','Back')}">‹</button>
      <h1 class="pt-onb-mid">${pendingKeep ? T('grid’ini kaydet.','save your grid.') : T('giriş yap.','log in.')}</h1><p class="pt-onb-sub">${pendingKeep ? T('Puanın ve kareler hesabına eklenecek. Daha önce girdiysen aynı e-postayla gir; içeriklerin geri gelir.','Your score and posts go into your account. Been here before? Use the same email and your content comes back.') : T('Hesap aç ya da daha önce kullandığın e-postayla gir; içeriklerin geri gelir.','Create an account or use the email you used before; your content comes back.')}</p>
      <div class="pt-onb-actions">
      <button class="pt-sso apple" data-action="m-onb-sso" data-p="Apple"><span aria-hidden="true"></span>${T('Apple ile devam et','Continue with Apple')}<em>${T('yakında','soon')}</em></button>
      <button class="pt-sso" data-action="m-onb-sso" data-p="Google"><span aria-hidden="true" class="g">G</span>${T('Google ile devam et','Continue with Google')}<em>${T('yakında','soon')}</em></button>
      <button class="pill solid wide" data-action="m-onb" data-step="email">${T('E-posta ile devam et','Continue with email')}</button></div>
      <p class="pt-onb-legal">${T(`Devam ederek ${legalLink('terms','Kullanım Koşulları')}’nı ve ${legalLink('privacy','Gizlilik Politikası')}’nı kabul etmiş olursun. ${legalLink('kvkk','KVKK Aydınlatma Metni')}`, `By continuing you accept the ${legalLink('terms','Terms')} and ${legalLink('privacy','Privacy Policy')}. ${legalLink('kvkk','KVKK notice')}`)}</p></div>`; return; }
    onb.innerHTML = `<div class="pt-onb-in pt-onb-welcome"><p class="pt-onb-brand"><img class="pt-onb-logo" src="assets/logo.png" alt="">pintertag</p>
      <h1>${T('grid’in kaç puan?','what does your grid score?')}</h1>
      <p class="pt-onb-lead">${T('Instagram profilinin ekran görüntüsünü at. 10 saniyede puanını, vibe’ını ve neyi düzeltmen gerektiğini söyleyelim. Kayıt sonra.','Drop a screenshot of your Instagram profile. In 10 seconds we’ll tell you your score, your vibe and what to fix. Sign-up comes later.')}</p>
      ${state.remembered ? `<div class="pt-onb-remember"><button class="m-acct-card" data-action="m-onb-again"><span class="m-avatar">${esc((state.remembered.name[0] || 'P').toUpperCase())}</span><span><b>${T(`${esc(state.remembered.name)} olarak devam et`, `Continue as ${esc(state.remembered.name)}`)}</b><small>${esc(state.remembered.email)}</small></span></button><button class="m-link pt-onb-forget" type="button" data-action="m-onb-forget">${T('Bu cihazdan kaldır','Remove from this device')}</button></div>` : ''}
      <div class="pt-onb-actions"><button class="pt-onb-hero" data-action="m-shot"><span class="pt-onb-hero-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/></svg></span><span><b>${T('Grid’imi puanla','Score my grid')}</b><small>${T('Profil ekran görüntüsüyle · hiçbir yere yüklenmez','With a profile screenshot · nothing is uploaded')}</small></span></button>
      <button class="pill wide" data-action="m-onb" data-step="signup">${T('Giriş yap ya da hesap aç','Log in or create an account')}</button>
      <button class="text-button wide" data-action="m-onb-guest">${T('Hesapsız dene','Try without an account')}</button></div>
      <p class="pt-onb-legal">${T(`Devam ederek ${legalLink('terms','Kullanım Koşulları')}’nı ve ${legalLink('privacy','Gizlilik Politikası')}’nı kabul etmiş olursun. ${legalLink('kvkk','KVKK Aydınlatma Metni')}`, `By continuing you accept the ${legalLink('terms','Terms')} and ${legalLink('privacy','Privacy Policy')}. ${legalLink('kvkk','KVKK notice')}`)}</p></div>`; }
  function closeOnb(){ if (onb){ onb.remove(); onb = null; } document.body.classList.remove('pt-onb-open'); render(); keepImport(); if (!FREE_LAUNCH && !sub().trialUsed && !state.trialOffered){ state.trialOffered = true; save(); setTimeout(() => paywall('onboard'), 250); } }
  function submitOnb(f){ const name = f.name.value.trim(), email = f.email.value.trim(), err = f.querySelector('#pt-onb-err') || document.getElementById('pt-onb-err');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ err.textContent = T('Geçerli bir e-posta yaz.','Enter a valid email.'); f.email.focus(); return; }
    if (!f.terms.checked){ err.textContent = T('Devam etmek için koşulları kabul etmelisin.','Accept the terms to continue.'); return; }
    if (hasBox(email)){ let prev = null; try { prev = JSON.parse(localStorage.getItem(boxKey(email))); } catch(_) {}
      login({ name: (prev && prev.__acct && prev.__acct.name) || name || email.split('@')[0], email, method: 'email', created: (prev && prev.__acct && prev.__acct.created) || Date.now() })
        .then(() => { closeOnb(); render(); toast(T(`Tekrar hoş geldin, ${state.account.name}. Her şey yerinde.`, `Welcome back, ${state.account.name}. Everything’s where you left it.`)); }); return; }
    state.account = { name: name || email.split('@')[0], email, method: 'email', created: Date.now() };
    state.guest = false; state.aiConsent = f.ai.checked; state.consent = { terms: Date.now(), marketing: f.mkt.checked, ai: f.ai.checked ? Date.now() : null };
    save(); closeOnb(); toast(T(`Hoş geldin, ${state.account.name}.`, `Welcome, ${state.account.name}.`)); }

  /* ---------- grid check before sign-up: the result asks to be saved ---------- */
  const _modal = modal;
  modal = function(t, c){ if (onb && !state.account && /data-action="m-gc-card"/.test(c)){
      c = c.replace(/<button class="sheet-row" data-action="m-gc-keep"[\s\S]*?<\/button>/, '')
           .replace('<div class="sheet-actions">', `<div class="m-gc-save">${action('m-onb-save', T('Kaydet ve devam et','Save and continue'), 'pill solid wide')}<small>${T('Bu kareler grid’inin altına eklenir; yeni planların gerçek feed’ine göre kontrol edilir.','These posts go under your grid; new plans are checked against your real feed.')}</small></div><div class="sheet-actions">`); }
    return _modal(t, c); };

  /* ---------- settings ---------- */
  const _title = settingsTitle;
  settingsTitle = function(page){ return { acct: T('Hesap','Account'), plan: T('Abonelik','Subscription'), privacy: T('Gizlilik ve yasal','Privacy & legal') }[page] || _title(page); };
  const glyph = { acct: 'M20 21a8 8 0 1 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10', plan: 'M12 2l3 6.5 7 .9-5.1 4.8 1.3 7-6.2-3.4L5.8 21l1.3-7L2 9.4l7-.9z', privacy: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' };
  const row = (key, value) => `<button class="native-setting-row" data-action="ns-page" data-page="${key}"><span class="native-setting-icon">${settingsGlyph(glyph[key])}</span><span class="native-setting-label">${settingsTitle(key)}</span><span class="native-setting-value">${value || ''}</span>${settingsGlyph('M9 5l7 7-7 7')}</button>`;
  const planLabel = () => { if (FREE_LAUNCH) return T('Ücretsiz','Free'); const s = sub(); return s.plan === 'pro' ? 'Pro' : isPro() ? T(`Deneme · ${daysLeft()} gün`, `Trial · ${daysLeft()} days`) : T('Ücretsiz','Free'); };
  const shell = content => `<section class="native-settings"><header class="native-settings-header"><button data-action="ns-back" aria-label="${T('Geri','Back')}">${settingsGlyph('M15 5l-7 7 7 7')}</button><h1 id="settings-heading" tabindex="-1">${settingsTitle(settingsScreen)}</h1><span></span></header><div class="native-settings-content">${content}</div></section>`;
  function acctCard(){ const a = state.account, n = a ? a.name : T('Misafir','Guest');
    return `<button class="m-acct-card" data-action="ns-page" data-page="acct"><span class="m-avatar">${esc((n[0] || 'P').toUpperCase())}</span><span><b>${esc(n)}</b><small>${a ? esc(a.email) : T('Hesapsız deniyorsun · verilerin bu cihazda','Trying without an account · data on this device')}</small></span><em class="m-badge ${isPro() ? 'pro' : ''}">${planLabel()}</em></button>`; }
  function meter(used, max){ const pct = Math.min(100, Math.round(used / max * 100)); return `<div class="m-meter"><i style="width:${pct}%"></i></div>`; }
  function page(){
    if (settingsScreen === 'acct'){ const a = state.account;
      return a ? `<div class="native-setting-copy"><div class="m-acct-head"><span class="m-avatar big">${esc(a.name[0].toUpperCase())}</span><div><b>${esc(a.name)}</b><small>${esc(a.email)}</small></div></div>
        <dl class="m-dl"><dt>${T('Giriş','Sign-in')}</dt><dd>${T('E-posta','Email')}</dd><dt>${T('Katılma','Joined')}</dt><dd>${new Date(a.created).toLocaleDateString(state.lang === 'tr' ? 'tr-TR' : 'en-GB')}</dd><dt>${T('Hesap nerede','Stored')}</dt><dd>${T('Bu cihazda','On this device')}</dd></dl>
        <div class="actions">${action('export-data', T('Verilerimi indir','Download my data'), 'pill')}${action('m-acct-logout', T('Çıkış yap','Sign out'), 'pill')}${action('m-acct-delete', T('Hesabı ve verileri sil','Delete account & data'), 'pill m-danger')}</div>
        <p class="native-setting-note">${T('Çıkış yapınca içeriklerin hesabında saklanır, tekrar girince geri gelir. Şimdilik yalnızca bu cihazda; başka cihazdan erişim sunucu bağlanınca gelecek. Silme işlemi geri alınamaz.','Logging out keeps your content in your account; it comes back when you log in. For now this is on this device only; access from other devices comes with the server. Deleting can’t be undone.')}</p></div>`
      : `<div class="native-setting-copy"><h2>${T('Hesapsız deniyorsun.','You’re trying without an account.')}</h2><p class="muted">${T('Hesap oluşturursan yayın sürümünde fotoğrafların ve planların cihazlar arasında taşınabilecek.','With an account, the release version will carry your photos and plans across devices.')}</p>
        <div class="actions">${action('m-acct-create', T('Hesap oluştur','Create account'), 'pill solid')}${action('export-data', T('Verilerimi indir','Download my data'), 'pill')}${action('m-acct-delete', T('Bu cihazdaki tüm verileri sil','Delete all data on this device'), 'pill m-danger')}</div></div>`; }
    if (settingsScreen === 'plan' && FREE_LAUNCH) return `<div class="native-setting-copy"><h2>${T('Lansman dönemi: her şey ücretsiz.','Launch period: everything is free.')}</h2><p class="muted">${T('Pintertag’in tüm özelliklerini ücretsiz kullanıyorsun: sınırsız plan, 200 fotoğraf, carousel ve story sırası, tüm ilerleme geçmişi. Ücretli plan gelirse önceden haber vereceğiz; hiçbir ödeme otomatik başlamaz.','You’re using every Pintertag feature for free: unlimited plans, 200 photos, carousel and story order, full progress history. If a paid plan comes, we’ll tell you first; no payment ever starts automatically.')}</p></div>`;
    if (settingsScreen === 'plan'){ const s = sub(), pro = isPro(), used = PTCredits.used(), lim = PTCredits.limit();
      const head = s.plan === 'pro' ? T('Pro aktif.','Pro is active.') : pro ? T(`Pro denemen: ${daysLeft()} gün kaldı.`, `Pro trial: ${daysLeft()} days left.`) : T('Ücretsiz plandasın.','You’re on the free plan.');
      const line = (t, f, p) => `<tr><td>${t}</td><td>${f}</td><td>${p}</td></tr>`;
      return `<div class="native-setting-copy"><h2>${head}</h2>
        <div class="m-usage"><div><span>${T('AI kredisi bu ay','AI credits this month')}</span><b>${used}/${lim}</b></div>${meter(used, lim)}
        ${pro ? '' : `<div><span>${T('Fotoğraf','Photos')}</span><b>${ownPhotos()}/${FREE.photos}</b></div>${meter(ownPhotos(), FREE.photos)}<div><span>${T('Aktif plan','Active plans')}</span><b>${activePlans()}/${FREE.plans}</b></div>${meter(activePlans(), FREE.plans)}`}</div>
        <table class="m-compare"><thead><tr><th></th><th>${T('Ücretsiz','Free')}</th><th>Pro</th></tr></thead><tbody>
        ${line(T('Grid düzenleme ve puan','Grid arrange & score'), '✓', '✓')}${line(T('Instagram grid check + story kartı','Grid check + story card'), '✓', '✓')}
        ${line(T('Fotoğraf','Photos'), FREE.photos, '200')}${line(T('Aktif plan','Active plans'), FREE.plans, T('Sınırsız','Unlimited'))}${line(T('AI kredisi / ay','AI credits / month'), '20', '500')}
        ${line(T('Carousel ve story sırası','Carousel & story order'), '—', '✓')}${line(T('Günün önerisi','Daily pick'), T('1/gün','1/day'), T('Sınırsız','Unlimited'))}${line(T('Takvim hatırlatması','Calendar reminders'), '✓', '✓')}${line(T('Hedef vibe ve uyum puanı','Target vibe & match'), '✓', '✓')}${line(T('Çekim listesi','Shot list'), T('3 madde','3 items'), T('6’ya kadar','up to 6'))}${line(T('Önce/sonra videosu','Before/after video'), '✓', '✓')}${line(T('İlerleme geçmişi','Progress history'), T('Son 7 gün','Last 7 days'), T('Tamamı','All of it'))}</tbody></table>
        <div class="actions">${s.plan === 'pro' ? '' : action('m-pw-open', s.trialUsed ? T('Pro’ya geç','Go Pro') : T('7 gün ücretsiz dene','Try 7 days free'), 'pill solid')}${action('m-pw-restore', T('Satın alımları geri yükle','Restore purchases'), 'pill')}</div>
        <p class="native-setting-note">${T('Aboneliğini App Store > Apple Kimliği > Abonelikler’den yönetir ve iptal edersin. İptal, dönem sonunda geçerli olur.','Manage or cancel in App Store > Apple ID > Subscriptions. Cancelling takes effect at the end of the period.')}</p>
        <div class="m-dev"><p>${T('Prototip testi: durumu değiştir','Prototype test: switch state')}</p><div class="pill-group">${[['free', T('Ücretsiz','Free')], ['trial', T('Deneme','Trial')], ['ending', T('Son 2 gün','Last 2 days')], ['ended', T('Deneme bitti','Trial ended')], ['pro', 'Pro']].map(([k, l]) => `<button class="chip" data-action="m-dev" data-s="${k}">${l}</button>`).join('')}</div></div></div>`; }
    if (settingsScreen === 'privacy'){ const ai = !!state.aiConsent, mk = !!(state.consent && state.consent.marketing);
      const tog = (act, on, title, text) => `<div class="m-toggle-row"><div><b>${title}</b><small>${text}</small></div><button class="m-switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-action="${act}" aria-label="${title}"><i></i></button></div>`;
      return `<div class="native-setting-copy"><div class="m-promise"><b>${T('Fotoğrafların senin.','Your photos are yours.')}</b><small>${T('Cihazında işlenir ve saklanır. Instagram şifreni istemeyiz. Reklam ya da izleme aracı yok.','Processed and stored on your device. We never ask for your Instagram password. No ads or trackers.')}</small></div>
        ${tog('m-ai-toggle', ai, T('AI etiketleme','AI tagging'), T('Açıkken fotoğraf önizlemeleri tür tespiti için yurt dışındaki AI sağlayıcısına gönderilir. Kapalıyken hiçbir şey cihazdan çıkmaz.','When on, small previews go to the AI provider abroad to detect photo type. When off, nothing leaves your device.'))}
        ${tog('m-mkt-toggle', mk, T('E-posta ile haberler','News by email'), T('Yenilik ve kampanyalar. İstediğin an kapat.','News and offers. Turn off anytime.'))}
        <div class="native-setting-list secondary">${['privacy', 'terms', 'kvkk'].map(d => `<button class="native-setting-row" data-action="m-legal" data-doc="${d}"><span class="native-setting-label">${T(PTLegal[d].tr, PTLegal[d].en)}</span><span class="native-setting-value"></span>${settingsGlyph('M9 5l7 7-7 7')}</button>`).join('')}</div>
        <p class="native-setting-note">${T('Verilerini indirmek ya da silmek için: Ayarlar > Hesap.','To download or delete your data: Settings > Account.')}</p></div>`; }
    return '';
  }
  const _page = settingsPage;
  settingsPage = function(){ if (MINE.includes(settingsScreen)) return shell(page());
    let h = _page(); if (settingsScreen === 'home'){ h = h.replace('<div class="native-setting-list">', `${acctCard()}<div class="native-setting-list">${row('plan', planLabel())}${row('privacy')}</div><div class="native-setting-list secondary">`);
      const a = state.account, login = `<div class="m-login"><p>${T('Giriş','Login')}</p>${a ? `<button class="m-login-row out" data-action="m-acct-logout">${T(`Çıkış yap: ${esc(a.name)}`, `Log out ${esc(a.name)}`)}</button>` : `<button class="m-login-row" data-action="m-acct-login">${T('Giriş yap ya da hesap oluştur','Log in or create an account')}</button>`}</div>`;
      h = h.replace(/<\/div><\/section>$/, login + '</div></section>'); }
    return h; };

  /* ---------- grid chip ---------- */
  function chip(){ const s = sub(); if (FREE_LAUNCH || s.plan === 'pro') return '';
    if (isPro()){ const d = daysLeft(); return `<button class="m-plan-chip ${d <= 2 ? 'warn' : ''}" data-action="m-pw-open" data-ctx="chip"><span>Pro ${T('deneme','trial')}</span><b>${T(`${d} gün kaldı`, `${d} day${d > 1 ? 's' : ''} left`)}</b></button>`; }
    return `<button class="m-plan-chip" data-action="m-pw-open" data-ctx="chip"><span>${T('Ücretsiz','Free')} · ${ownPhotos()}/${FREE.photos} ${T('fotoğraf','photos')}</span><b>${s.trialUsed ? T('Pro’ya geç','Go Pro') : T('7 gün Pro dene','Try Pro 7 days')}</b></button>`; }
  const _grid = simpleGrid; simpleGrid = function(){ const h = _grid(); return h.replace('<div class="simple-tools">', chip() + '<div class="simple-tools">'); };

  /* ---------- gates (capture phase: they run before the feature's own handler) ---------- */
  window.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (PRO_ACTIONS[a] && !isPro()){ e.preventDefault(); e.stopImmediatePropagation(); paywall(PRO_ACTIONS[a]); return; }
    if (a === 's-date' && !isPro() && !b.dataset.plan){ const id = b.dataset.id, has = (state.plans || []).some(p => p.photos && p.photos[0] === id && p.purpose !== 'story');
      if (!has && activePlans() >= FREE.plans){ e.preventDefault(); e.stopImmediatePropagation(); paywall('plans'); } } }, true);
  window.addEventListener('change', e => { const t = e.target; if (!t || t.id !== 'upload' || isPro()) return; const n = (t.files || []).length;
    if (n && ownPhotos() + n > FREE.photos){ e.stopImmediatePropagation(); t.value = ''; paywall('photos'); } }, true);
  document.addEventListener('submit', e => { if (e.target && e.target.id === 'pt-onb-form'){ e.preventDefault(); submitOnb(e.target); } }, true);

  /* ---------- actions ---------- */
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'ns-page' && MINE.includes(b.dataset.page)){ settingsScreen = b.dataset.page; render(); scrollTo(0, 0); document.getElementById('settings-heading')?.focus({ preventScroll: true }); }
    if (a === 'm-onb') onboard(b.dataset.step);
    if (a === 'm-onb-guest'){ state.guest = true; save(); closeOnb(); }
    if (a === 'm-onb-sso') modal(T(`${b.dataset.p} ile giriş yakında.`, `${b.dataset.p} sign-in is coming.`), `<p class="m-reason">${T(`${b.dataset.p} ile giriş App Store sürümünde açılacak; bunun için sunucu gerekiyor. Şimdilik e-posta ile devam edebilirsin, hesabın bu cihazda tutulur.`, `${b.dataset.p} sign-in opens with the App Store release; it needs a server. For now continue with email; your account stays on this device.`)}</p>${action('m-onb-email', T('E-posta ile devam et','Continue with email'), 'pill solid wide')}`);
    if (a === 'm-onb-email'){ closeModal(); onboard('email'); }
    if (a === 'm-onb-save'){ pendingKeep = true; closeModal(); onboard('signup'); }
    if (a === 'm-legal'){ e.preventDefault(); openDoc(b.dataset.doc, document.getElementById('modal').open && pwCtx !== null && document.querySelector('.m-pw-opts') ? (pwCtx || 'chip') : ''); }
    if (a === 'm-pw-open') paywall(b.dataset.ctx || '');
    if (a === 'm-pw-plan'){ sub().choice = b.dataset.plan; save(); paywall(pwCtx); }
    if (a === 'm-pw-start') startTrial();
    if (a === 'm-pw-later') closeModal();
    if (a === 'm-pw-restore') modal(T('geri yüklenecek satın alım yok.','nothing to restore.'), `<p class="m-reason">${T('Bu hesapta etkin bir App Store ya da Google Play aboneliği bulunamadı. (Prototip: ödeme altyapısı henüz bağlı değil.)','No active App Store or Google Play subscription was found. (Prototype: payments aren’t connected yet.)')}</p>${action('m-pw-later', T('Tamam','OK'), 'pill solid wide')}`);
    if (a === 'm-acct-create'){ settingsScreen = null; render(); onboard('email'); }
    if (a === 'm-acct-logout'){ const n = state.account ? state.account.name : '';
      modal(T('çıkış yapılsın mı?','log out?'), `<p class="m-reason">${T(`${esc(n)} hesabından çıkacaksın. Fotoğrafların ve planların hesabında saklanır; tekrar girince her şey olduğu gibi döner.`, `You’ll log out of ${esc(n)}. Your photos and plans are kept in your account and come back exactly as they were when you log in.`)}</p>${check('remember', T('Giriş bilgilerimi hatırla','Remember my login info'), true)}<div class="actions">${action('m-acct-logout-yes', T('Çıkış yap','Log out'), 'pill m-danger-solid')}${action('m-pw-later', T('Vazgeç','Cancel'), 'text-button wide')}</div>`); }
    if (a === 'm-acct-logout-yes'){ const rem = document.querySelector('#modal input[name=remember]');
      state.remembered = rem && rem.checked && state.account ? { ...state.account } : null;
      state.__acct = state.account ? { name: state.account.name, created: state.account.created } : null; stash(); delete state.__acct;
      clearData(); state.account = null; state.guest = false; save(); closeModal(); settingsScreen = null; render(); onboard('welcome'); }
    if (a === 'm-acct-login'){ settingsScreen = null; render(); onboard('welcome'); }
    if (a === 'm-onb-again' && state.remembered){ login(state.remembered).then(() => { closeOnb(); render(); toast(T(`Tekrar hoş geldin, ${state.account.name}. Her şey yerinde.`, `Welcome back, ${state.account.name}. Everything’s where you left it.`)); }); }
    if (a === 'm-onb-forget'){ state.remembered = null; save(); onboard('welcome'); toast(T('Hesap bu ekrandan kaldırıldı. E-postanla tekrar girersen içeriklerin döner.','Removed from this screen. Log in with your email to get your content back.')); }
    if (a === 'm-acct-delete') modal(T('her şey silinsin mi?','delete everything?'), `<p class="m-reason">${T('Hesabın, fotoğrafların, planların ve ayarların bu cihazdan kalıcı olarak silinir. Geri alınamaz. İstersen önce yedeğini indir.','Your account, photos, plans and settings are permanently removed from this device. This can’t be undone. Download a backup first if you like.')}</p><div class="actions">${action('m-acct-delete-yes', T('Evet, kalıcı olarak sil','Yes, delete permanently'), 'pill m-danger-solid')}${action('export-data', T('Önce yedeği indir','Download backup first'), 'pill')}${action('m-pw-later', T('Vazgeç','Cancel'), 'text-button wide')}</div>`);
    if (a === 'm-acct-delete-yes'){ const ids = new Set(state.photos.map(p => String(p.id)));
      try { if (state.account) localStorage.removeItem(boxKey(state.account.email)); localStorage.removeItem(KEY); } catch(_){}
      const others = (() => { try { return Object.keys(localStorage).some(k => /^pintertag-box-/.test(k)); } catch(_) { return false; } })();
      if (others) wipeImages(ids); else { try { indexedDB.deleteDatabase('pintertag-photos'); } catch(_){} }
      try { localStorage.setItem(KEY, JSON.stringify({ lang: state.lang, theme: state.theme })); } catch(_){}
      window.__ptDeleted = true; modal(T('silindi.','deleted.'), `<p class="m-reason">${T('Bu cihazdaki tüm Pintertag verileri silindi.','All Pintertag data on this device was deleted.')}</p>`); setTimeout(() => location.reload(), 1200); }
    if (a === 'm-ai-toggle'){ state.aiConsent = !state.aiConsent; state.consent = { ...(state.consent || {}), ai: state.aiConsent ? Date.now() : null }; if (state.aiConsent) state.photos.forEach(p => { if (p.type === 'unknown') p.typeTried = false; }); save(); render();
      toast(state.aiConsent ? T('AI etiketleme açık. Yeni fotoğrafların türü otomatik belirlenecek.','AI tagging on. New photos will be typed automatically.') : T('AI etiketleme kapalı. Hiçbir şey cihazından çıkmaz.','AI tagging off. Nothing leaves your device.')); }
    if (a === 'm-mkt-toggle'){ state.consent = { ...(state.consent || {}), marketing: !(state.consent && state.consent.marketing) }; save(); render(); }
    if (a === 'm-dev'){ const s = sub(), k = b.dataset.s;
      if (k === 'free') Object.assign(s, { plan: 'free', trialUsed: false });
      if (k === 'trial') Object.assign(s, { plan: 'trial', trialStart: Date.now(), trialUsed: true });
      if (k === 'ending') Object.assign(s, { plan: 'trial', trialStart: Date.now() - 5*DAY - 60000, trialUsed: true });
      if (k === 'ended') Object.assign(s, { plan: 'trial', trialStart: Date.now() - 8*DAY, trialUsed: true });
      if (k === 'pro') Object.assign(s, { plan: 'pro', trialUsed: true });
      save(); expire(); render(); toast(T('Test durumu: ','Test state: ') + b.textContent); } });

  /* ---------- start ---------- */
  sub(); expire();
  if (!state.account && !state.guest && !testMode) setTimeout(() => onboard('welcome'), document.querySelector('.brand-launch') ? 700 : 0);
  render();
})();
