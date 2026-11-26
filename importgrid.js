/* challenge-a-friend: at App Store launch set window.PT_STORE_URL (https://apps.apple.com/app/id...) and the message carries the link */
window.PT_STORE_URL = window.PT_STORE_URL || '';
/* bring your real instagram grid in from a profile screenshot: score it, name its vibe, share a story card,
   and keep those posts under your new ones so every plan is checked against the feed people actually see. */
(function(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.hidden = true; inp.id = 'm-shot'; document.body.appendChild(inp);
  let last = null;
  const imported = () => state.photos.filter(p => p.imported);
  const toMs = async srcs => { const out = []; for (const s of srcs){ const im = await GC.loadImg(s); out.push(im ? window.__PT.measure(im) : null); } return out; };
  const readFile = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(f); });
  async function share(blob, name, text){ const file = new File([blob], name, { type: blob.type });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })){ await navigator.share({ files: [file], text }); return 'shared'; } } catch(e){ if (e && e.name === 'AbortError') return 'cancel'; }
    /* phones without a share sheet (in-app browsers, http): show the card big to long-press and save */
    if (matchMedia('(pointer:coarse)').matches){ sheet(`<img src="${URL.createObjectURL(blob)}" alt="">`, T('Karta basılı tut, “Fotoğraflar’a Kaydet”e dokun. Sonra story’de paylaş.','Press and hold the card, then tap “Save to Photos”. Share it to your story from there.')); return 'done'; }
    const r = await PTSave.save(name, blob); PTSave.say(r, T('Kart','Card')); return r === 'declined' ? 'cancel' : 'done'; }
  function sheet(inner, note){ let s = document.getElementById('pt-sheet');
    /* its own <dialog>, so it opens in the top layer above the grid-check modal */
    if (!s){ s = document.createElement('dialog'); s.id = 'pt-sheet'; s.className = 'pt-sheet';
      s.innerHTML = '<div class="pt-sheet-body"></div><p class="pt-sheet-note"></p><button class="pt-sheet-x" type="button"></button>';
      s.addEventListener('click', e => { if (e.target === s || e.target.closest('.pt-sheet-x')) s.close(); }); document.body.appendChild(s); }
    s.querySelector('.pt-sheet-body').innerHTML = inner; s.querySelector('.pt-sheet-note').textContent = note; s.querySelector('.pt-sheet-x').textContent = T('Kapat','Close');
    if (!s.open){ try { s.showModal(); } catch(_) { s.setAttribute('open', ''); } } }

  let lastSrcs = [], adding = false;
  async function run(files){
    modal(T('grid’in okunuyor.','reading your grid.'), `<p class="m-reason">${T('Ekran görüntüsündeki kareler ayrılıyor, ışık ve renk ölçülüyor. Hiçbir şey yüklenmiyor.','Cutting out the posts and reading light and colour. Nothing is uploaded.')}</p>`);
    const fresh = (await Promise.all([...files].slice(0, 4).map(readFile))).filter(Boolean);
    const srcs = adding ? [...lastSrcs, ...fresh].slice(0, 4) : fresh; adding = false; lastSrcs = srcs;
    const r = await GC.readShots(srcs);
    if (!r.tiles || r.tiles.length < 3){
      modal(T('grid bulunamadı.','couldn’t find a grid.'), `<p class="m-reason">${T('Bu görselde Instagram profil grid’i göremedim.','I couldn’t see an Instagram profile grid in this image.')}</p><ol class="m-steps"><li>${T('Instagram’da kendi profilini aç.','Open your own profile on Instagram.')}</li><li>${T('Biraz aşağı kaydır; grid ekranın çoğunu kaplasın.','Scroll a little so the grid fills most of the screen.')}</li><li>${T('Ekran görüntüsü al, buraya yükle. Daha fazla satır için 2–3 ekran görüntüsü ekleyebilirsin.','Take a screenshot and add it here. For more rows, add 2–3 screenshots.')}</li></ol>${action('m-shot', T('Tekrar dene','Try again'), 'pill solid wide')}`);
      return; }
    const tiles = r.tiles, ms = await toMs(tiles.slice(0, 9));
    window.PTStats && PTStats.track('score'); const sc = window.__PT.scoreGrid(ms), score = sc ? sc.total : 0, fl = window.__PT.flags(ms).map(f => f ? { d: f.d, key: 'gd.' + f.key } : null);
    const vk = GC.vibeOf(ms), [vName, vLine] = GC.vibeText(vk), roast = GC.roastOf(ms, fl, score);
    last = { tiles, ratio: r.ratio, score, vk, vName, vLine, roast, flags: fl };
    show(); }

  const dateStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; };
  const theme = () => state.gcTheme || 'pink';
  let cardBlob = null, cardUrl = '';
  async function makeCard(){ if (!last) return null;
    cardBlob = await GC.card({ score: last.score, vibe: last.vk, vibeName: last.vName, vibeLine: last.vLine, tiles: last.tiles, ratio: last.ratio, flags: last.flags, roast: last.roast, date: dateStr(), theme: theme() });
    if (cardUrl) URL.revokeObjectURL(cardUrl); cardUrl = URL.createObjectURL(cardBlob); return cardUrl; }
  /* the result: the story card itself is the preview, so what you see is what you share */
  async function show(){ if (!last) return; const n = last.tiles.length;
    const sw = (k, label, col) => `<button class="m-gc-sw ${theme() === k ? 'on' : ''}" data-action="m-gc-theme" data-theme="${k}" aria-pressed="${theme() === k}"><i style="background:${col}"></i>${label}</button>`;
    modal(T('grid puanın.','grid check.'), `<div class="m-gc">
      <div class="m-gc-card"><img id="m-gc-img" alt="${T('Story kartı','Story card')}"></div>
      <div class="m-gc-sws" role="group" aria-label="${T('Kart rengi','Card colour')}">${sw('pink', T('Pembe','Pink'), '#F5CCD6')}${sw('cream', T('Krem','Cream'), '#EFE9DF')}${sw('black', T('Siyah','Black'), '#121211')}</div>
      <p class="m-gc-meta">${GC.verdict(last.score)} ${T(`${Math.min(9, n)} post okundu.`, `${Math.min(9, n)} posts read.`)}</p>
      ${n < 9 ? `<button class="m-gc-more" data-action="m-gc-more">${T(`9’a tamamla: biraz aşağı kaydırıp bir ekran görüntüsü daha ekle`, `Complete 9: scroll a little and add one more screenshot`)}</button>` : ''}
      <div class="m-gc-pair">${action('m-gc-card', T('Story’de paylaş','Share to story'), 'pill solid')}${action('m-gc-dare', T('Meydan oku','Challenge'), 'pill')}</div>
      ${imported().length ? '' : action('m-gc-keep', T('Bunlar paylaştıklarım: grid’ime ekle','These are my posts: add to my grid'), 'text-button m-gc-keep')}
      <p class="small muted m-gc-foot">${T('Puan ışık, ton ve ritimden hesaplanır; Instagram hesabına bağlanmaz.','The score comes from light, tone and rhythm; it never connects to your Instagram account.')}</p></div>`);
    const u = await makeCard(), img = document.getElementById('m-gc-img'); if (img && u) img.src = u; }

  function keep(){ if (!last) return; const ids = last.tiles.map(s => { const id = 'ig' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random());
      state.photos.push({ id, src: s, type: 'unknown', selected: true, locked: true, posted: true, imported: true, important: false, zoom: 1, title: 'Instagram' }); return id; });
    const order = simpleIds().filter(id => !ids.includes(id)); state.simpleOrder = [...order, ...ids]; save(); closeModal(); render();
    toast(T(`${ids.length} paylaşılmış post grid’inin altına eklendi ve yerine kilitlendi. Yeni planların artık gerçek feed’inle birlikte kontrol ediliyor.`, `${ids.length} posted photos were added under your grid and locked in place. New plans are now checked against your real feed.`)); }

  function cta(){ if (imported().length) return '';
    return `<button class="m-import" data-action="m-shot"><span><b>${T('Instagram grid’ini ekle','Add your Instagram grid')}</b><small>${T('Profil ekran görüntüsünden puan, vibe ve story kartı.','Score, vibe and a story card from a profile screenshot.')}</small></span><span aria-hidden="true">›</span></button>`; }
  /* your real feed always sits under everything new, like on instagram */
  const _ids = simpleIds; simpleIds = function(){ const ids = _ids(), imp = ids.filter(id => simplePhoto(id)?.imported); if (!imp.length) return ids;
    const out = [...ids.filter(id => !imp.includes(id)), ...imp]; state.simpleOrder = out; return out; };
  const _grid = simpleGrid; simpleGrid = function(){ const h = _grid(); return h.replace('<div class="simple-feed">', cta() + '<div class="simple-feed">'); };
  const _render = render; render = function(){ _render(); imported().forEach(p => { const t = document.querySelector(`.simple-tile[data-id="${CSS.escape(p.id)}"]`); if (t){ t.classList.add('m-posted'); const l = t.querySelector('.simple-lock'); if (l) l.remove(); } }); };

  inp.addEventListener('change', () => { const f = inp.files; if (f && f.length) run(f); inp.value = ''; });
  document.addEventListener('click', async e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'm-shot'){ inp.click(); }
    if (a === 'm-gc-keep') keep();
    if (a === 'm-gc-card' && last){ if (!cardBlob) await makeCard(); await share(cardBlob, 'pintertag-grid-check.png'); }
    if (a === 'm-gc-theme' && last){ state.gcTheme = b.dataset.theme; save(); document.querySelectorAll('.m-gc-sw').forEach(x => { const on = x.dataset.theme === state.gcTheme; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      const img = document.getElementById('m-gc-img'); if (img) img.style.opacity = '.5'; const u = await makeCard(); if (img && u){ img.src = u; img.style.opacity = ''; } }
    if (a === 'm-gc-more'){ adding = true; inp.click(); }
    if (a === 'm-gc-dare' && last){ const text = GC.challenge(last.score, last.vName).replace(/\s*pintertag\s*$/i, '') + ' ' + (window.PT_STORE_URL || 'https://pintertag.com');
      try { if (navigator.share){ await navigator.share({ text }); return; } } catch(err){ if (err && err.name === 'AbortError') return; }
      let ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch(_){}
      sheet(`<p class="pt-sheet-text">${esc(text)}</p>`, ok ? T('Kopyalandı. Arkadaşına yapıştır.','Copied. Paste it to a friend.') : T('Bunu kopyala, arkadaşına gönder.','Copy this and send it to a friend.')); } });
  render();
})();
