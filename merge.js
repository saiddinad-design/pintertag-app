/* the art director layer: reads every photo on the device, explains why an order is better,
   flags the one frame that breaks the grid, and suggests what to post today. one card at a time, only when it helps. */
(function(){
  const MC = document.createElement('canvas'); MC.width = MC.height = 48; const mx = MC.getContext('2d', { willReadFrequently: true });
  function measure(img){
    mx.clearRect(0,0,48,48); mx.drawImage(img, 0, 0, 48, 48);
    const d = mx.getImageData(0,0,48,48).data, L = new Float32Array(48*48);
    let r=0,g=0,b=0,s=0,ls=0,ls2=0,vv=0;
    for (let i=0,p=0;i<d.length;i+=4,p++){ const R=d[i]/255,G=d[i+1]/255,B=d[i+2]/255; r+=R;g+=G;b+=B;
      const hi=Math.max(R,G,B), lo=Math.min(R,G,B); s+= hi ? (hi-lo)/hi : 0; if (hi>.25 && (hi-lo)/hi>.55) vv++; const l=.2126*R+.7152*G+.0722*B; L[p]=l; ls+=l; ls2+=l*l; }
    const n=48*48; r/=n; g/=n; b/=n; s/=n; const lum=ls/n, contrast=Math.sqrt(Math.max(0, ls2/n-lum*lum));
    let lap=0; for (let y=1;y<47;y++) for (let x=1;x<47;x++){ const i=y*48+x; lap+=Math.abs(4*L[i]-L[i-1]-L[i+1]-L[i-48]-L[i+48]); }
    /* v65: CIELAB stats, the features that separated curated grids from random mixes in our reference set */
    const lin = v => v > .04045 ? Math.pow((v+.055)/1.055, 2.4) : v/12.92, fl = t => t > .008856 ? Math.cbrt(t) : 7.787*t + 16/116;
    const Ls = new Float32Array(n), hist = [0,0,0,0,0,0,0,0]; let aS = 0, Lsum = 0, Ct = 0;
    for (let i=0,p=0;i<d.length;i+=4,p++){ const R=lin(d[i]/255),G=lin(d[i+1]/255),B=lin(d[i+2]/255);
      const X=(.4124*R+.3576*G+.1805*B)/.95047, Y=.2126*R+.7152*G+.0722*B, Z=(.0193*R+.1192*G+.9505*B)/1.08883;
      const fx=fl(X), fy=fl(Y), fz=fl(Z), L=116*fy-16, A=500*(fx-fy), Bb=200*(fy-fz), C=Math.hypot(A,Bb);
      Ls[p]=L; Lsum+=L; aS+=A; Ct+=C; const h=Math.floor((Math.atan2(Bb,A)+Math.PI)/(2*Math.PI)*8)%8; hist[h]+=C; }
    const sorted = Array.from(Ls).sort((x,y)=>x-y);
    return { sat:s, lum, contrast, sharp: lap/(46*46), warm: r-b, vivid: vv/n, v:2, L: Lsum/n, Lp95: sorted[Math.floor(n*.95)], a: aS/n, hist: hist.map(v => v/(Ct+1e-6)) };
  }
  /* v65 grid score, fitted on 48 reference grids (curated personal + brand accounts) against random 9-photo mixes.
     what curated grids share: steady overall brightness, steady highlights, a narrow colour family. order matters only a little:
     neighbours tend to differ slightly more than chance, so a small bonus for not parking look-alikes side by side. */
  const MODEL = { mu: [15.254, 13.358, 1.11, 2.555], sd: [3.711, 4.51, .185, 1.294], w: [-.55, -.42, -.27, -.29], b: -.4 };
  const sdv = a => { const m = a.reduce((t,v)=>t+v,0)/a.length; return Math.sqrt(a.reduce((t,v)=>t+(v-m)**2,0)/a.length); };
  const hd = (x,y) => x.hist.reduce((t,v,k)=>t+Math.abs(v-y.hist[k]),0);
  function scoreGrid(ms){ const c = ms.filter(m => m && m.v === 2); if (c.length < 2) return null;
    let pairs = 0, hsum = 0; for (let i=0;i<c.length;i++) for (let j=i+1;j<c.length;j++){ hsum += hd(c[i],c[j]); pairs++; }
    const f = [sdv(c.map(m=>m.L)), sdv(c.map(m=>m.Lp95)), hsum/pairs, sdv(c.map(m=>m.a))];
    const logit = f.reduce((t,v,k)=>t + (v-MODEL.mu[k])/MODEL.sd[k]*MODEL.w[k], MODEL.b);
    const near = (x,y) => hd(x,y) + Math.abs(x.L-y.L)/25; let nb = 0, nn = 0, all = 0, an = 0;
    for (let i=0;i<c.length;i++){ if (i%3<2 && c[i+1]){ nb += near(c[i],c[i+1]); nn++; } if (c[i+3]){ nb += near(c[i],c[i+3]); nn++; } for (let j=i+1;j<c.length;j++){ all += near(c[i],c[j]); an++; } }
    const ratio = nn && all ? (nb/nn)/(all/an) : 1, bonus = Math.max(-3, Math.min(3, (ratio-1)*10));
    const total = Math.round(Math.max(45, Math.min(98, 78 + 13*logit + bonus)));
    return { total, tone: 1/(1+Math.exp(-logit)), light: Math.max(0, 1 - f[0]/30), rhythm: Math.max(0, Math.min(1, ratio/1.3)), lsd: f[0] }; }
  const KEYS = [['warm',.09,'warm','cool'],['lum',.2,'bright','dark'],['sat',.2,'sat','flat']];
  const med = a => { const s=[...a].sort((x,y)=>x-y), h=s.length>>1; return s.length%2 ? s[h] : (s[h-1]+s[h])/2; };
  const baseOf = ms => { const ok = ms.filter(Boolean), b = {}; KEYS.forEach(([k]) => b[k] = med(ok.map(m => m[k]))); return b; };
  const dist = (m, b) => KEYS.reduce((a,[k,th]) => a + ((m[k]-b[k])/th)**2, 0);
  function flags(ms){ const ok = ms.filter(Boolean); if (ok.length < 6) return ms.map(() => null);
    const sc = scoreGrid(ms); if (sc && sc.total >= 90) return ms.map(() => null);
    const b = baseOf(ms);
    return ms.map(m => { if (!m) return null; let best = null; KEYS.forEach(([k,th,hi,lo]) => { const d=(m[k]-b[k])/th; if (Math.abs(d)>1.3 && (!best || Math.abs(d)>best.d)) best = { d:Math.abs(d), key: d>0?hi:lo }; }); return best; }); }
  const loadI = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const pad = i => String(i+1).padStart(2,'0');
  const low = s => s.toLocaleLowerCase(state.lang === 'tr' ? 'tr' : 'en');
  const ready = src => typeof src === 'string' && !PTStore.isRef(src);

  /* 1. every photo is measured on the device once: light, warmth, colour, sharpness */
  let measuring = false;
  async function analyze(){
    if (measuring) return; const todo = state.photos.filter(p => (!p.m || p.m.v !== 2) && ready(p.src)); if (!todo.length){ label(); return; }
    measuring = true; let n = 0;
    for (const p of todo){ const im = await loadI(p.src); if (!im) { p.m = null; continue; } p.m = measure(im); p.light = p.m.lum; p.accent = p.m.vivid > .18; p.bw = p.m.sat < .07; n++; }
    measuring = false; if (n){ save(); render(); } label(); }

  /* 2. ai names the shot type (person, detail, product…) when the ai is connected; it never pretends otherwise */
  let sampleFn = null, labeling = false, aiState = 'unknown';
  (async () => { try { sampleFn = window.PTCredits ? await PTCredits.sample() : (window.claude && window.claude.use ? await window.claude.use('sample') : null); } catch(_) { sampleFn = null; } aiState = sampleFn ? 'on' : 'off'; })();
  async function sheet(ps){ const cols = 4, w = 220, h = 275, rows = Math.ceil(ps.length/cols), c = document.createElement('canvas'); c.width = cols*w; c.height = rows*h; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0,0,c.width,c.height);
    for (let i=0;i<ps.length;i++){ const im = await loadI(ps[i].src); if (!im) continue; const x=(i%cols)*w, y=Math.floor(i/cols)*h, r=Math.max(w/im.width,h/im.height), sw=w/r, sh=h/r;
      g.drawImage(im,(im.width-sw)/2,(im.height-sh)/2,sw,sh,x+3,y+3,w-6,h-6); g.fillStyle='#000'; g.fillRect(x+6,y+6,44,34); g.fillStyle='#fff'; g.font='bold 24px sans-serif'; g.fillText(String(i+1),x+14,y+32); }
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', .85)); }
  async function label(){
    if (!sampleFn || labeling) return; const todo = state.photos.filter(p => p.type === 'unknown' && !p.typeTried && ready(p.src)).slice(0, 12); if (!todo.length) return;
    labeling = true; let n = 0;
    try { const blob = await sheet(todo);
      const prompt = `The attached image shows ${todo.length} photos in a grid, numbered from the top-left, left to right. Label each photo's shot type for planning an Instagram feed. Types: "person" (a person is the main subject), "detail" (close-up of clothing, hands, texture, product part), "product" (a product shown whole with no person), "place" (room, street, architecture, landscape, no main person), "object" (still life or everyday object, not for sale), "text" (graphic or type is the subject), "break" (calm breather: sky, wall, shadow, plant). Reply with only JSON: {"tags":[{"n":1,"type":"person"}]}`;
      const r = await sampleFn.json(prompt, { images: blob }); const ok = ['person','detail','product','place','object','text','break'];
      (r && Array.isArray(r.tags) ? r.tags : []).forEach(x => { const p = todo[(parseInt(x.n)||0)-1]; if (p && ok.includes(x.type)){ p.type = x.type; p.typeBy = 'ai'; n++; } });
    } catch(e) { if (e && (e.code === 'capability_disabled' || e.code === 'not_declared')) { sampleFn = null; aiState = 'off'; } }
    todo.forEach(p => p.typeTried = true); labeling = false;
    if (n){ save(); render(); toast(T(`AI ${n} fotoğrafın türünü etiketledi. Yanlışsa fotoğrafa dokun, “Diğer seçenekler”den düzelt.`, `AI tagged ${n} photos by type. If one is wrong, tap it and fix it under “More options”.`)); } }

  /* 3. why this order: the rules it fixed, in one line, plus the match with your style */
  const WHY = { types:['aynı tür kareler yan yana gelmiyor','no two frames of the same kind side by side'], accent:['vurgu rengi her satırda bir kez','the accent colour shows up once per row'],
    bw:['siyah-beyazlar ayrı duruyor','black and white frames are kept apart'], people:['her satırda insansız bir kare var','every row has a frame without a person'],
    product:['her satırda ürün ya da detay var','every row has a product or detail'], text:['en fazla bir yazı karesi','one text tile at most'] };
  const msOf = ids => ids.map(id => { const p = simplePhoto(id); return p && p.m ? p.m : null; });
  function whyBlock(before, after){
    const sb = scoreGrid(msOf(before.slice(0,9))), sa = scoreGrid(msOf(after.slice(0,9)));
    const items = ids => ids.map(simplePhoto).filter(Boolean);
    const rb = PTEngine.conflicts(items(before), state.mode, 'grid', state.style).reasons, ra = PTEngine.conflicts(items(after), state.mode, 'grid', state.style).reasons;
    const fixed = rb.filter(k => !ra.includes(k) && WHY[k]).map(k => T(...WHY[k]));
    if (sa && sb && sb.lsd - sa.lsd > 1.5 && fixed.length < 2) fixed.push(T('ışık seviyesi daha tutarlı','light level is more even'));
    if (!fixed.length && sa && sb && sa.rhythm > sb.rhythm + .05) fixed.push(T('benzer kareler artık yan yana değil','look-alike frames no longer sit side by side'));
    const unknown = items(after).filter(p => p.type === 'unknown').length;
    let h = '<div class="m-why">';
    if (sb && sa) h += `<p class="m-score"><span>${T('Seçtiğin stile uyum','Match with your style')}</span><b>${sb.total} → ${sa.total}</b></p>`;
    if (fixed.length) h += `<p>${T('Neden böyle:','Why this order:')} ${fixed.slice(0,2).join(', ')}.</p>`;
    if (unknown) h += `<p class="small muted">${T(`${unknown} karenin türü belli değil; bunlar için sıralama ışık ve renge bakıyor.`, `${unknown} photos have no type yet; for those the order follows light and colour.`)}</p>`;
    return h + '</div>'; }
  const _cmp = simpleComparison;
  simpleComparison = function(){ const h = _cmp(); const p = simplePreview; if (!p) return h; return h.replace('<div class="compare-actions">', whyBlock(p.before, p.after) + '<div class="compare-actions">'); };

  /* 4. one card on the grid, only when a frame breaks the next nine */
  const FL = { dark:['diğerlerinden çok daha karanlık','is much darker than the rest'], bright:['diğerlerinden çok daha parlak','is much brighter than the rest'],
    warm:['tek başına fazla sıcak','is far warmer than the rest'], cool:['diğerlerine göre soğuk kalıyor','is colder than the rest'],
    sat:['fazla doygun, dikkati tek başına çekiyor','is too saturated and pulls all the attention'], flat:['diğerlerinin yanında solgun','looks washed out next to the others'] };
  function worst(){ const ids = simpleIds().slice(0,9), ms = msOf(ids), f = flags(ms); let wi = -1;
    f.forEach((x,i) => { if (x && !simplePhoto(ids[i]).locked && (wi < 0 || x.d > f[wi].d)) wi = i; }); return wi < 0 ? null : { i: wi, key: f[wi].key, ids, ms }; }
  function directorCard(){ const w = worst(); if (!w) return '';
    return `<div class="m-note"><div><b>${pad(w.i)}</b> ${T(...FL[w.key])}.</div>${action('m-calm',T('Sakinleştir','Calm it down'),'pill solid')}</div>`; }
  function calm(){ const w = worst(); if (!w) return; const all = simpleIds(), b = baseOf(w.ms), cur = scoreGrid(w.ms);
    const cands = all.slice(9).map((id, k) => ({ id, j: k+9, p: simplePhoto(id) })).filter(x => x.p && x.p.m && !x.p.locked).map(x => ({ ...x, d: dist(x.p.m, b) })).filter(x => x.d <= 1.7).sort((a,c) => a.d - c.d);
    for (const c of cands){ const trial = [...w.ms]; trial[w.i] = c.p.m; const sc = scoreGrid(trial); if (cur && sc && sc.total < cur.total) continue;
      const order = [...all]; [order[w.i], order[c.j]] = [order[c.j], order[w.i]]; state.simpleUndo = [...all]; state.simpleOrder = order; save(); render();
      toast(T(`${pad(w.i)} aşağı indi, yerine tona uyan bir kare geldi. Beğenmezsen geri al.`, `${pad(w.i)} moved down and a frame that fits the tone took its place. Undo if you don't like it.`)); return; }
    toast(T(`Aşağıda bu tona uyan kare yok. Yeni fotoğraf ekle ya da ${pad(w.i)} numaralı kareyi kendin taşı.`, `Nothing further down fits this tone. Add new photos or move ${pad(w.i)} yourself.`)); }

  /* 5. what to post today: one photo, one reason */
  let skip = [];
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  function suggest(){
    const ids = simpleIds(), planned = new Set((state.plans||[]).flatMap(p => p.photos || [])), today = todayIso();
    const past = (state.plans||[]).filter(p => p.purpose !== 'story' && p.date <= today).sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time)).map(p => p.photos[0]);
    const posted = ids.filter(id => simplePhoto(id)?.posted);
    const recent = (past.length >= 2 ? past : posted.length >= 2 ? posted : ids.slice(0,3)).slice(0,3).map(simplePhoto).filter(Boolean);
    const pool = ids.map(simplePhoto).filter(p => p && p.m && !p.posted && !planned.has(p.id) && !recent.includes(p) && !skip.includes(p.id));
    if (!pool.length) return null;
    const cnt = {}; recent.forEach(p => { if (p.type && p.type !== 'unknown') cnt[p.type] = (cnt[p.type]||0) + 1; });
    const dom = Object.keys(cnt).sort((a,b) => cnt[b]-cnt[a])[0], domN = dom ? cnt[dom] : 0;
    const b = baseOf(msOf(ids.slice(0,9))), rl = recent.filter(p => p.m).map(p => p.m.lum), rLum = rl.length ? rl.reduce((a,v)=>a+v,0)/rl.length : .5;
    const sc = p => (domN >= 2 && p.type !== 'unknown' && p.type !== dom ? 3 : 0) - dist(p.m, b) * .6 + (Math.abs(p.m.lum - rLum) > .15 ? 1 : 0) - (p.m.sharp < .012 && !p.important ? 2 : 0);
    const best = pool.sort((x,y) => sc(y) - sc(x))[0];
    let why;
    if (domN >= 2 && best.type !== 'unknown' && best.type !== dom) why = T(`Son paylaşımların ${low(typeName(dom))} ağırlıklı. Bugün bu ${low(typeName(best.type))} karesi iyi bir geçiş olur.`, `Your last posts lean ${low(typeName(dom))}. A ${low(typeName(best.type))} shot like this one is a good change today.`);
    else if (best.m.lum > rLum + .15) why = T('Son paylaşımların koyu tonda. Bu aydınlık kare akışa nefes aldırır.', 'Your last posts are dark. This lighter frame lets the feed breathe.');
    else if (best.m.lum < rLum - .15) why = T('Son paylaşımların çok aydınlık. Bu koyu kare ritim katar.', 'Your last posts are very bright. This darker frame adds rhythm.');
    else why = T('Henüz planlanmamış kareler içinde grid’inin tonuna en çok bu uyuyor.', 'Of your unplanned photos, this one fits your grid’s tone best.');
    return { p: best, why }; }
  function todayCard(){ if (simpleIds().length < 4 || (window.__PTShare && window.__PTShare.due())) return '';
    return `<button class="m-today" data-action="m-today"><span><b>${T('Bugün ne paylaşayım?','What should I post today?')}</b><small>${T('Tek öneri, nedeniyle.','One pick, with a reason.')}</small></span><span aria-hidden="true">›</span></button>`; }
  function openToday(){ const s = suggest();
    if (!s){ skip = []; toast(T('Önerecek planlanmamış fotoğraf kalmadı. Yeni fotoğraf ekle.', 'No unplanned photos left to suggest. Add new photos.')); return; }
    modal(T('bugün bunu paylaş.','post this today.'), `<div class="simple-sheet-photo">${simpleImage(s.p.id)}</div><p class="m-reason">${esc(s.why)}</p><div class="sheet-actions">${action('m-today-plan',T('Bugüne planla','Plan it for today'),'pill solid',`data-id="${esc(s.p.id)}"`)}${action('m-today-next',T('Başka öner','Suggest another'),'pill',`data-id="${esc(s.p.id)}"`)}</div><p class="small muted space">${T('Öneri bu cihazdaki fotoğraflarından ve planlarından çıkar. Instagram hesabına bağlanmaz.','The pick comes from the photos and plans on this device. It does not connect to Instagram.')}</p>`); }

  /* arrange: their rule engine first, then a pass that also weighs tone and light; never hand back an order that scores lower */
  const _arrange = simpleArrange;
  simpleArrange = function(){ _arrange(); const pv = simplePreview; if (!pv) return;
    const before = pv.before, all = before.map(simplePhoto); if (all.some(p => !p || !p.m)) return;
    const val = ids => { const sc = scoreGrid(msOf(ids.slice(0,9))); const cf = PTEngine.conflicts(ids.slice(0,9).map(simplePhoto), state.mode, 'grid', state.style).cost; return (sc ? sc.total : 0) - cf * .8; };
    const free = before.map((id,i) => simplePhoto(id).locked ? -1 : i).filter(i => i >= 0);
    let best = [...pv.after], bv = val(best); let seed = 97; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 900 && free.length > 1; k++){ const a = free[Math.floor(rnd()*free.length)], c = free[Math.floor(rnd()*free.length)]; if (a === c) continue;
      const t = [...best]; [t[a], t[c]] = [t[c], t[a]]; const tv = val(t); if (tv >= bv){ best = t; bv = tv; } }
    const sb = scoreGrid(msOf(before.slice(0,9))), sa = scoreGrid(msOf(best.slice(0,9)));
    if (sb && sa && sa.total < sb.total && val(best) <= val(before)) best = [...before];
    simplePreview = { before, after: best }; render(); };

  const _grid = simpleGrid;
  simpleGrid = function(){ const h = _grid(); return h.replace('<div class="simple-feed">', todayCard() + directorCard() + '<div class="simple-feed">'); };

  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b || !b.dataset.action.startsWith('m-')) return; const a = b.dataset.action;
    if (a === 'm-calm') calm();
    if (a === 'm-today'){ skip = []; openToday(); }
    if (a === 'm-today-next'){ skip.push(b.dataset.id); openToday(); }
    if (a === 'm-today-plan'){ closeModal(); simpleDate(b.dataset.id); } });

  /* after each screen draw: measure anything new */
  const _render = render; render = function(){ _render(); clearTimeout(window.__mT); window.__mT = setTimeout(analyze, 60); };
  PTStore.hydrate(state).then(n => { render(); }).catch(() => render());
  window.__PT = { measure, scoreGrid, flags, suggest, worst, aiState: () => aiState };
})();
