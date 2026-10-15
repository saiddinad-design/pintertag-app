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
    const r = await PTSave.save(name, blob); PTSave.say(r, T('Kart','Card')); return r === 'declined' ? 'cancel' : 'done'; }

  async function run(files){
    modal(T('grid’in okunuyor.','reading your grid.'), `<p class="m-reason">${T('Ekran görüntüsündeki kareler ayrılıyor, ışık ve renk ölçülüyor. Hiçbir şey yüklenmiyor.','Cutting out the posts and reading light and colour. Nothing is uploaded.')}</p>`);
    const srcs = (await Promise.all([...files].slice(0, 4).map(readFile))).filter(Boolean);
    const r = await GC.readShots(srcs);
    if (!r.tiles || r.tiles.length < 3){
      modal(T('grid bulunamadı.','couldn’t find a grid.'), `<p class="m-reason">${T('Bu görselde Instagram profil grid’i göremedim.','I couldn’t see an Instagram profile grid in this image.')}</p><ol class="m-steps"><li>${T('Instagram’da kendi profilini aç.','Open your own profile on Instagram.')}</li><li>${T('Biraz aşağı kaydır; grid ekranın çoğunu kaplasın.','Scroll a little so the grid fills most of the screen.')}</li><li>${T('Ekran görüntüsü al, buraya yükle. Daha fazla satır için 2–3 ekran görüntüsü ekleyebilirsin.','Take a screenshot and add it here. For more rows, add 2–3 screenshots.')}</li></ol>${action('m-shot', T('Tekrar dene','Try again'), 'pill solid wide')}`);
      return; }
    const tiles = r.tiles, ms = await toMs(tiles.slice(0, 9));
    const sc = window.__PT.scoreGrid(ms), score = sc ? sc.total : 0, fl = window.__PT.flags(ms).map(f => f ? { d: f.d, key: 'gd.' + f.key } : null);
    const vk = GC.vibeOf(ms), [vName, vLine] = GC.vibeText(vk), roast = GC.roastOf(ms, fl, score);
    last = { tiles, ratio: r.ratio, score, vk, vName, vLine, roast, flags: fl };
    const mini = tiles.slice(0, 9).map((s, i) => `<div class="m-gc-tile ${fl[i] ? 'flag' : ''}" style="aspect-ratio:${r.ratio === 1 ? '1/1' : r.ratio === 5/4 ? '4/5' : '3/4'}"><img src="${s}" alt=""><span>${String(i+1).padStart(2,'0')}</span></div>`).join('');
    modal(T('grid puanın.','grid check.'), `<div class="m-gc-head"><b>${score}</b><span>/100</span><div><i>${esc(vName)}</i><small>${esc(vLine)}</small></div></div>
      <p class="small muted">${GC.verdict(score)} ${T(`${tiles.length} post okundu.`, `${tiles.length} posts read.`)}</p>
      <div class="m-gc-grid">${mini}</div><ul class="m-gc-roast">${roast.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="sheet-actions">${action('m-gc-card', T('Story kartını paylaş','Share the story card'), 'pill solid')}${action('m-gc-dare', T('Arkadaşına meydan oku','Challenge a friend'), 'pill')}
      ${imported().length ? '' : action('m-gc-keep', T('Bunlar paylaştıklarım: grid’ime ekle','These are my posts: add to my grid'), 'sheet-row')}</div>
      <p class="small muted space">${T('Puan ışık, ton ve ritimden hesaplanır; Instagram hesabına bağlanmaz.','The score comes from light, tone and rhythm; it never connects to your Instagram account.')}</p>`); }

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
    if (a === 'm-gc-card' && last){ toast(T('Kart hazırlanıyor…','Making your card…'));
      const d = new Date(), blob = await GC.card({ score: last.score, vibe: last.vk, vibeName: last.vName, vibeLine: last.vLine, tiles: last.tiles, ratio: last.ratio, flags: last.flags, roast: last.roast, date: `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}` });
      await share(blob, 'pintertag-grid-check.png'); }
    if (a === 'm-gc-dare' && last){ const text = GC.challenge(last.score, last.vName) + (window.PT_STORE_URL ? ' ' + window.PT_STORE_URL : '');
      try { if (navigator.share){ await navigator.share({ text }); return; } } catch(err){ if (err && err.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(text); toast(T('Mesaj kopyalandı. Arkadaşına yapıştır.','Message copied. Paste it to a friend.')); } catch(_){ toast(text); } } });
  render();
})();
