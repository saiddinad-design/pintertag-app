/* fits my grid?: before posting, drop 1-6 candidate photos and see each one at the top of the grid (where Instagram puts it).
   scored with the same grid model (PTScore.scoreGrid) on the new first 9 against the current first 9, plus the two posts it will
   touch (right and below). everything is measured on the device; nothing is uploaded. replaces the "target vibe" tile on home. */
(function(){
  const MAXC = 6;
  const css = `.fg-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;border-radius:12px;overflow:hidden;margin:6px 0 14px}
.fg-mini i{display:block;aspect-ratio:4/5;background:var(--soft) center/cover no-repeat;position:relative}
.fg-mini i.is-new{outline:3px solid var(--ink);outline-offset:-3px;z-index:1}
.fg-delta{display:flex;align-items:baseline;gap:8px;margin:2px 0 4px}.fg-delta b{font-size:44px;letter-spacing:-2px;line-height:1}.fg-delta span{font-size:15px;color:var(--muted)}
.fg-verdict{font-size:16px;margin:0 0 10px}.fg-list{list-style:none;margin:0 0 6px;padding:0;font-size:14px;line-height:1.45}.fg-list li{padding:8px 0;border-top:1px solid var(--line)}
.fg-alt{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none}.fg-alt button{flex:0 0 68px;border:0;background:none;padding:0;text-align:center;font-size:11px;color:var(--muted)}
.fg-alt img{width:68px;height:85px;object-fit:cover;border-radius:8px;display:block;margin-bottom:3px}.fg-alt button.on img{outline:2px solid var(--ink);outline-offset:1px}
.fg-note{font-size:12px;color:var(--muted);margin-top:14px;line-height:1.4}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', '<input id="pt-fit-input" type="file" accept="image/*" multiple hidden>');
  const input = document.getElementById('pt-fit-input');
  const near = (x, y) => Math.abs(x.L - y.L) / 20 + Math.abs(x.sat - y.sat) / .15 + Math.abs(x.warm - y.warm) / .1 + PTScore.hd(x, y) * Math.min(x.sat, y.sat) / .3 + Math.abs((x.flat || 0) - (y.flat || 0)) / .35;
  const mean = a => a.reduce((t, v) => t + v, 0) / a.length;
  let last = null;

  const grid = () => (typeof simpleIds === 'function' ? simpleIds() : []).map(simplePhoto).filter(p => p && p.m && p.m.hist && p.m.v >= 2);

  function intro(){
    const g = grid();
    if (g.length < 3){
      modal(T('grid’ime uyar mı?', 'fits my grid?'), `<p class="edit-subtitle">${T('Önce grid’ini ekle: son paylaştığın fotoğrafları (ya da profil ekran görüntünü) yükle. Sonra paylaşmak istediğin kareyi grid’in en başında görürsün.', 'Add your grid first: upload your latest posts (or a profile screenshot). Then you’ll see the photo you want to post at the top of it.')}</p>
        ${action('pt-fit-addgrid', T('Fotoğraf ekle', 'Add photos'), 'pill solid wide space')}`); return; }
    modal(T('grid’ime uyar mı?', 'fits my grid?'), `<p class="edit-subtitle">${T('Paylaşmak istediğin kareyi seç. Instagram’daki gibi grid’in en başına koyar ve feed’ini iyileştirip iyileştirmediğini söyler.', 'Pick the photo you want to post. It goes to the top of your grid, as on Instagram, and you’ll see if it makes your feed better or worse.')}</p>
      <p class="fg-note">${T(`Kararsızsan ${MAXC} adaya kadar seç; en iyi oturanı söyler. Telefonunda ölçülür, hiçbir şey yüklenmez.`, `Torn between a few? Pick up to ${MAXC}; it tells you which fits best. Measured on your phone; nothing is uploaded.`)}</p>
      ${action('pt-fit-pick', T('Fotoğraf seç', 'Pick a photo'), 'pill solid wide space')}`); }

  async function load(file){
    const url = URL.createObjectURL(file);
    try { const im = new Image(); im.src = url; await im.decode();
      const ar = im.naturalHeight / im.naturalWidth || 1.25; let w = im.naturalWidth, h = im.naturalHeight, src = im;
      while (w > 480){ const c = document.createElement('canvas'); c.width = Math.round(w / 2); c.height = Math.round(h / 2); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; }
      const o = document.createElement('canvas'); o.width = 240; o.height = Math.round(240 * ar); o.getContext('2d').drawImage(src, 0, 0, o.width, o.height);
      return { m: PTScore.measure(im), thumb: o.toDataURL('image/jpeg', .82) };
    } finally { URL.revokeObjectURL(url); } }

  function judge(c, g){
    window.PTStats && PTStats.track('fit'); const cur = g.slice(0, 9).map(p => p.m), now = PTScore.scoreGrid(cur), after = PTScore.scoreGrid([c.m, ...g.slice(0, 8).map(p => p.m)]);
    const b = now ? now.total : 0, a = after ? after.total : 0, why = [], fix = [];
    const gw = mean(cur.map(m => m.warm)), gs = mean(cur.map(m => m.sat)), gb = mean(cur.map(m => m.sharp)), gL = mean(cur.map(m => m.L));
    if (c.m.warm - gw > .06){ why.push(T('Grid’inden belirgin şekilde daha sıcak (sarı/turuncu).', 'Noticeably warmer (more yellow/orange) than your grid.')); fix.push(T('Beyaz dengesini biraz soğut.', 'Cool the white balance a little.')); }
    if (gw - c.m.warm > .06){ why.push(T('Grid’inden belirgin şekilde daha soğuk (mavi).', 'Noticeably cooler (bluer) than your grid.')); fix.push(T('Beyaz dengesini biraz ısıt.', 'Warm the white balance a little.')); }
    if (c.m.sat - gs > .1){ why.push(T('Renkleri grid’inden çok daha canlı.', 'Its colours are much louder than your grid.')); fix.push(T('Doygunluğu düşür.', 'Lower the saturation.')); }
    if (c.m.sharp - gb > .035){ why.push(T('Grid’ine göre kalabalık: çok detay ya da yazı var.', 'Busier than your grid: lots of detail or text.')); fix.push(T('Daha sade bir kadraj seç ya da yakından kırp.', 'Pick a calmer frame or crop in closer.')); }
    if (Math.abs(c.m.L - gL) > 22){ why.push(c.m.L > gL ? T('Grid’inden çok daha aydınlık.', 'Much brighter than your grid.') : T('Grid’inden çok daha karanlık.', 'Much darker than your grid.')); fix.push(T('Pozlamayı grid’e yaklaştır.', 'Bring the exposure closer to your grid.')); }
    const nb = [g[0], g[2]].filter(Boolean), twin = nb.find(p => near(c.m, p.m) < .8);
    const dupe = g.slice(0, 12).findIndex(p => near(c.m, p.m) < .25);
    if (dupe >= 0){ why.unshift(T(`Bu fotoğraf (ya da çok benzeri) grid’inde zaten var: ${dupe + 1}. kare.`, `This photo (or one very close to it) is already on your grid: post ${dupe + 1}.`)); fix.push(T('Aynı kareyi tekrar paylaşma; aynı çekimden farklı bir açı seç.', 'Don’t post the same frame again; pick a different angle from that shoot.')); }
    if (twin){ why.push(T('Yanına gelecek postla neredeyse aynı: ikisi yan yana tekrar gibi durur.', 'Nearly the same as the post it will sit next to: side by side it reads as a repeat.')); fix.push(T('Araya farklı bir post koy, bunu sonra paylaş.', 'Post something different first, then this one.')); }
    /* fit: how far the photo sits from your grid, compared with how far your grid's own photos sit from each other */
    const pw = []; for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) pw.push(near(cur[i], cur[j]));
    const wd = Math.max(.6, mean(pw)), cd = mean(cur.map(m => near(c.m, m)));
    const fit = Math.round(100 * (1 - Math.max(0, Math.min(1, (cd / wd - .85) / .8))) - (twin ? 15 : 0) - (dupe >= 0 ? 40 : 0));
    const d = a - b, verdict = fit >= 75 && fix.length === 0 ? T('Paylaş: grid’ine oturuyor.', 'Post it: it sits right on your grid.') : fit >= 75 ? T('Oturuyor. Küçük bir dokunuşla daha da iyi olur.', 'It fits. A small touch would make it even better.') : fit >= 45 ? T('Olur, ama düzenlemeden paylaşma.', 'It can work, but edit it before you post.') : T('Bu haliyle feed’inin dışında kalıyor.', 'As it is, it stands outside your feed.');
    if (!why.length) why.push(T('Renk, ışık ve sakinlik olarak grid’inle aynı ailede.', 'Same colour, light and calm as your grid.'));
    return { b, a, d, fit, verdict, why, fix, twin: !!twin, cd, wd };
  }

  function show(k){
    const { cands, res, g } = last, c = cands[k], r = res[k], best = res.reduce((x, y, i) => y.fit > res[x].fit ? i : x, 0);
    const tiles = [`<i class="is-new" style="background-image:url('${c.thumb}')"></i>`, ...g.slice(0, 8).map(p => `<i style="background-image:url('${esc(p.src || '')}')"></i>`)].join('');
    const sign = r.d > 0 ? '+' : '';
    modal(T('grid’ime uyar mı?', 'fits my grid?'), `${cands.length > 1 ? `<div class="fg-alt">${cands.map((x, i) => `<button data-action="pt-fit-show" data-i="${i}" class="${i === k ? 'on' : ''}"><img src="${x.thumb}" alt="">${i === best ? T('en iyi', 'best') : res[i].fit}</button>`).join('')}</div>` : ''}
      <div class="fg-delta"><b>${Math.max(0, r.fit)}</b><span>/100 ${T('uyum', 'fit')} · ${T('grid puanı', 'grid score')} ${r.b} → ${r.a}</span></div>
      <p class="fg-verdict">${r.verdict}</p>
      <div class="fg-mini">${tiles}</div>
      <ul class="fg-list">${r.why.map(w => `<li>${w}</li>`).join('')}${r.fix.map(f => `<li><b>${T('Düzelt:', 'Fix:')}</b> ${f}</li>`).join('')}</ul>
      ${cands.length > 1 && best !== k ? `<p class="fg-note">${T('En iyi oturan aday: ', 'The best fit of your picks: ')}${T('işaretli olan', 'the one marked best')}.</p>` : ''}
      <p class="fg-note">${T('Uyum: bu karenin grid’indeki karelerden ne kadar uzak durduğu, grid’inin kendi içindeki farka göre. Grid puanı: yeni ilk 9 kare, şu anki ilk 9’a karşı.', 'Fit: how far this photo sits from your grid, compared with how far your grid’s photos sit from each other. Grid score: the new first 9 against your current first 9.')}</p>
      ${action('pt-fit-pick', T('Başka fotoğraf dene', 'Try another photo'), 'pill solid wide space')}`); }

  input.addEventListener('change', async () => {
    const all = [...input.files].filter(f => /^image\//.test(f.type)), files = all.slice(0, MAXC); input.value = '';
    if (!files.length) return;
    if (all.length > MAXC) toast(T(`İlk ${MAXC} fotoğraf alındı.`, `Took the first ${MAXC} photos.`));
    modal(T('grid’ime uyar mı?', 'fits my grid?'), `<p class="edit-subtitle">${T('Ölçülüyor…', 'Measuring…')}</p>`);
    const cands = []; for (const f of files){ try { cands.push(await load(f)); } catch (e) {} }
    const g = grid();
    if (!cands.length){ modal(T('fotoğraf açılamadı.', 'couldn’t open the photo.'), `<p class="edit-subtitle">${T('JPG ya da PNG olarak tekrar dene.', 'Try again with a JPG or PNG.')}</p>${action('pt-fit-pick', T('Tekrar seç', 'Pick again'), 'pill solid wide space')}`); return; }
    const res = cands.map(c => judge(c, g)); last = { cands, res, g };
    show(res.reduce((x, y, i) => y.fit > res[x].fit ? i : x, 0)); });

  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pt-fit-open'){ e.stopPropagation(); intro(); }
    if (a === 'pt-fit-pick') input.click();
    if (a === 'pt-fit-show' && last) show(+b.dataset.i);
    if (a === 'pt-fit-addgrid'){ try { closeModal(); } catch (_) {} const u = document.getElementById('upload'); if (u) u.click(); } });
  window.PTFit = { judge, intro, get last(){ return last; } };
})();
