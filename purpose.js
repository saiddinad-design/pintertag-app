/* what are you making? separate posts for the grid, one carousel, or a story sequence.
   each one gets its own rules: grid rules stay on the grid; a carousel needs a cover and a swipe order; a story needs a flow. */
(function(){
  const gridArrange = simpleArrange;
  let pk = null, pickSel = [], undo = null;
  const pool = () => simpleIds().map(simplePhoto).filter(p => p && !p.imported && !p.posted);
  const lumOf = p => p.m ? p.m.lum : (p.light ?? .5);
  const typeTR = t => typeName(t).toLocaleLowerCase(state.lang === 'tr' ? 'tr' : 'en');

  function choose(){
    modal(T('ne hazırlıyorsun?','what are you making?'), `<div class="m-purpose">
      ${action('m-p-grid', `<b>${T('Grid’i düzenle','Arrange my grid')}</b><small>${T('Ayrı ayrı postlar. Profilinde yan yana nasıl duracaklarına göre sıralanır.','Separate posts, ordered by how they sit side by side on your profile.')}</small>`, 'm-purpose-row')}
      ${action('m-p-carousel', `<b>${T('Carousel hazırla','Make a carousel')}</b><small>${T('Tek post, en fazla 10 kare: bir kapak ve kaydırma sırası.','One post, up to 10 photos: a cover and a swipe order.')}</small>`, 'm-purpose-row')}
      ${action('m-p-story', `<b>${T('Story dizisi hazırla','Make a story sequence')}</b><small>${T('Birbirini takip eden story’ler: açılış, akış, kapanış.','Stories that follow each other: opener, flow, closer.')}</small>`, 'm-purpose-row')}</div>`); }

  function picker(kind){ pk = kind; const ps = pool();
    if (ps.length < 2){ toast(T('Önce en az iki fotoğraf ekle.','Add at least two photos first.')); return; }
    modal(kind === 'carousel' ? T('carousel için seç.','pick for the carousel.') : T('story için seç.','pick for your stories.'),
      `<p class="small muted">${T('Sırayla dokun; en fazla 10. Dizilişi Pintertag önerecek, sen onaylayacaksın.','Tap to pick, up to 10. Pintertag suggests the order; you approve it.')}</p>
      <div class="vote-grid m-pick">${ps.map(p => `<button class="vote-card ${pickSel.includes(p.id) ? 'active' : ''}" data-action="m-p-toggle" data-id="${esc(p.id)}">${simpleImage(p.id)}${pickSel.includes(p.id) ? `<span>${pickSel.indexOf(p.id) + 1}</span>` : ''}</button>`).join('')}</div>
      ${action('m-p-order', `${T('Sırala','Order them')} (${pickSel.length})`, 'pill solid wide')}`); }

  /* carousel: the cover is the frame that reads best small (sharp, contrasted, a person or the product); then light and scale take turns */
  function orderCarousel(ps){ const cov = p => (p.m ? p.m.sharp*30 + p.m.contrast*2 - Math.abs(p.m.lum-.5) : 0) + (['person','product'].includes(p.type) ? .6 : 0) + (p.important ? 1.5 : 0);
    const rest = [...ps], cover = rest.sort((a,b) => cov(b) - cov(a))[0]; const out = [cover]; let left = ps.filter(p => p !== cover);
    while (left.length){ const prev = out[out.length-1];
      const cost = p => (p.type !== 'unknown' && p.type === prev.type ? 2 : 0) + (Math.abs(lumOf(p) - lumOf(prev)) < .08 ? .6 : 0) + (p.m && cover.m ? Math.abs(p.m.warm - cover.m.warm)*3 : 0) - (p.important ? .4 : 0);
      left.sort((a,b) => cost(a) - cost(b)); out.push(left.shift()); }
    const why = [T('kapak küçükken bile en net okunan kare','the cover is the frame that reads best at a small size')];
    if (out.some((p,i) => i && p.type !== 'unknown' && p.type !== out[i-1].type)) why.push(T('aynı tür kareler arka arkaya gelmiyor','no two frames of the same kind back to back'));
    else why.push(T('açık ve koyu kareler sırayla','light and dark frames take turns'));
    return { out, why }; }
  /* story: opener (place or person), then people, product, detail, and a calm or text frame to close */
  function orderStory(ps){ const rank = { place:0, person:1, product:2, object:3, detail:4, break:5, text:6, unknown:3 };
    const known = ps.some(p => p.type !== 'unknown'); let out;
    if (known) out = [...ps].sort((a,b) => (rank[a.type] ?? 3) - (rank[b.type] ?? 3));
    else { out = [ps.slice().sort((a,b) => lumOf(b) - lumOf(a))[0]]; let left = ps.filter(p => p !== out[0]);
      while (left.length){ const prev = out[out.length-1]; left.sort((a,b) => Math.abs(lumOf(a)-lumOf(prev)) - Math.abs(lumOf(b)-lumOf(prev))); out.push(left.shift()); } }
    const f = out[0].type, l = out[out.length-1].type;
    const why = known ? [f !== 'unknown' && l !== 'unknown' && f !== l ? T(`${typeTR(f)} karesiyle açılıp ${typeTR(l)} karesiyle kapanıyor; aradakiler türlerine göre sıralı`, `opens on a ${typeTR(f)} shot and closes on a ${typeTR(l)} shot, with the rest grouped by kind`) : T('kareler türlerine göre sıralı: önce genel, sonra yakın','grouped by kind: wide first, then close')] : [T('ışık bir kareden ötekine yumuşakça geçiyor; kare türleri belli olunca açılış ve kapanışa da bakar','light flows gently from frame to frame; once shot types are known it also plans the opener and the closer')];
    return { out, why }; }

  function variety(ps){ const types = ps.map(p => p.type).filter(t => t !== 'unknown'); if (types.length < ps.length * .6) return '';
    const cnt = {}; types.forEach(t => cnt[t] = (cnt[t]||0) + 1); const top = Object.keys(cnt).sort((a,b) => cnt[b]-cnt[a])[0];
    return cnt[top] === ps.length ? T(`Hepsi ${typeTR(top)} karesi; sıra yine önerildi ama tür çeşitliliği yok. Bir detay ya da mekân karesi eklersen akış güçlenir.`, `Every photo is a ${typeTR(top)} shot; there’s an order, but no variety of shot types. Add a detail or a place shot to make it flow.`) : ''; }

  function result(){ const ps = pickSel.map(simplePhoto).filter(Boolean);
    if (ps.length < 2){ toast(T('En az iki fotoğraf seç.','Pick at least two photos.')); return; }
    const r = pk === 'carousel' ? orderCarousel(ps) : orderStory(ps), v = variety(ps); pickSel = r.out.map(p => p.id);
    const ratio = pk === 'carousel' ? '4/5' : '9/16', d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, next = `${String(Math.min(22, d.getHours()+1)).padStart(2,'0')}:00`;
    modal(pk === 'carousel' ? T('carousel sırası.','carousel order.') : T('story sırası.','story order.'),
      `<div class="m-seq">${r.out.map((p,i) => `<div class="m-seq-item" style="aspect-ratio:${ratio}">${simpleImage(p.id)}<span>${i === 0 && pk === 'carousel' ? T('kapak','cover') : i+1}</span></div>`).join('')}</div>
      <div class="m-why"><p>${T('Neden böyle:','Why this order:')} ${r.why.join(', ')}.</p>${v ? `<p class="small muted">${v}</p>` : ''}</div>
      ${pk === 'carousel' ? `<div class="sheet-actions">${action('m-p-save', T('Carousel olarak kaydet','Save as a carousel'), 'pill solid wide')}</div><p class="small muted space">${T('Grid’de tek kare olarak görünür; içindeki diğer kareler grid’den çıkar, silinmez.','It shows as one tile in your grid; the other photos move inside it and aren’t deleted.')}</p>`
        : `<div class="split-fields"><label class="control-label">${T('Tarih','Date')}<input id="m-st-day" class="field" type="date" value="${today}"></label><label class="control-label">${T('İlk story','First story')}<input id="m-st-time" class="field" type="time" value="${next}"></label></div>
           <label class="control-label">${T('Aralık','Every')}<select id="m-st-gap" class="field"><option value="30">30 ${T('dk','min')}</option><option value="60">1 ${T('saat','hour')}</option><option value="120" selected>2 ${T('saat','hours')}</option></select></label>
           <div class="sheet-actions">${action('m-p-save', T('Story’leri planla','Plan the stories'), 'pill solid wide')}</div>`}
      ${action('m-p-back', T('Seçime dön','Back to picking'), 'text-button wide')}`); }

  function saveSeq(){ const ids = [...pickSel]; undo = { kind: pk, plans: JSON.parse(JSON.stringify(state.plans)), hidden: [...(state.hiddenGrid||[])], car: ids.map(id => [id, simplePhoto(id)?.carousel ? [...simplePhoto(id).carousel] : null]) };
    if (pk === 'carousel'){ const cover = simplePhoto(ids[0]); cover.carousel = ids.slice(1); state.hiddenGrid = [...new Set([...(state.hiddenGrid||[]), ...ids.slice(1)])];
      const plan = state.plans.find(x => x.photos?.[0] === cover.id && x.purpose !== 'story'); if (plan){ plan.photos = ids; plan.purpose = 'carousel'; }
      save(); closeModal(); render(); toast(T(`Carousel hazır: ${ids.length} kare, grid’de tek post. Tarih vermek için kapağa dokun.`, `Carousel ready: ${ids.length} photos, one post in your grid. Tap the cover to set a date.`)); }
    else { const day = document.getElementById('m-st-day').value, [h, m] = (document.getElementById('m-st-time').value || '19:00').split(':').map(Number), gap = +document.getElementById('m-st-gap').value;
      const cur = new Date(day + 'T00:00:00'); cur.setMinutes(h*60 + m);
      ids.forEach((id, i) => { if (i) cur.setMinutes(cur.getMinutes() + gap);
        if (cur.getHours() >= 23 || cur.getHours() < 8){ if (cur.getHours() >= 23) cur.setDate(cur.getDate() + 1); cur.setHours(10, 0, 0, 0); } // no stories in the middle of the night
        const d = new Date(cur);
        const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        state.plans.push({ id: crypto.randomUUID(), photos: [id], date: ds, time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, caption: '', purpose: 'story' }); });
      save(); closeModal(); simpleTab = 'calendar'; render(); toast(T(`${ids.length} story planlandı.`, `${ids.length} stories planned.`)); }
    pickSel = []; }
  function undoSeq(){ if (!undo) return; state.plans = undo.plans; state.hiddenGrid = undo.hidden; undo.car.forEach(([id, c]) => { const p = simplePhoto(id); if (p){ if (c) p.carousel = c; else delete p.carousel; } });
    undo = null; save(); render(); toast(T('Geri alındı.','Undone.')); }
  const undoCard = () => undo ? `<div class="m-note"><div>${undo.kind === 'carousel' ? T('Carousel oluşturuldu.','Carousel created.') : T('Story’ler planlandı.','Stories planned.')}</div>${action('m-p-undo', T('Geri al','Undo'), 'pill')}</div>` : '';
  const _grid = simpleGrid; simpleGrid = function(){ const h = _grid(), c = undoCard(); return c ? h.replace('<div class="simple-feed">', c + '<div class="simple-feed">') : h; };
  const _cal = simpleCalendar; simpleCalendar = function(){ const h = _cal(), c = undoCard(); return c ? c + h : h; };

  simpleArrange = function(){ choose(); };
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'm-p-grid'){ closeModal(); gridArrange(); }
    if (a === 'm-p-carousel' || a === 'm-p-story'){ pickSel = []; picker(a === 'm-p-carousel' ? 'carousel' : 'story'); }
    if (a === 'm-p-toggle'){ const id = b.dataset.id; pickSel = pickSel.includes(id) ? pickSel.filter(x => x !== id) : pickSel.length >= 10 ? (toast(T('En fazla 10 kare.','Up to 10 photos.')), pickSel) : [...pickSel, id]; picker(pk); }
    if (a === 'm-p-order') result();
    if (a === 'm-p-back') picker(pk);
    if (a === 'm-p-save') saveSeq();
    if (a === 'm-p-undo') undoSeq(); });
  render();
})();
