/* reels: videos go into the grid next to photos. the cover is a frame from the video (that is what the grid shows),
   the file itself is kept untouched in the device database and plays when the tile is opened. */
(function(){
  const MAX = 500 * 1024 * 1024;
  const up = document.getElementById('upload'); if (!up) return;
  up.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/*';
  const isVideo = f => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name || '');
  const prev = up.onchange;
  function cover(file){ return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const fail = () => { URL.revokeObjectURL(url); rej(new Error('video')); }, timer = setTimeout(fail, 15000);
    v.onerror = () => { clearTimeout(timer); fail(); };
    v.onloadedmetadata = () => { const t = Math.min(0.6, (v.duration || 1) / 3); try { v.currentTime = t; } catch(_) {} };
    v.onseeked = () => { clearTimeout(timer); try {
      const w = v.videoWidth, h = v.videoHeight; if (!w || !h) throw 0;
      const c = document.createElement('canvas'), r = Math.min(1, 800 / Math.max(w, h)); c.width = Math.round(w * r); c.height = Math.round(h * r);
      const g = c.getContext('2d'); g.drawImage(v, 0, 0, c.width, c.height);
      const hq = document.createElement('canvas'), r2 = Math.min(1, 2160 / Math.max(w, h)); hq.width = Math.round(w * r2); hq.height = Math.round(h * r2); hq.getContext('2d').drawImage(v, 0, 0, hq.width, hq.height);
      const px = g.getImageData(0, 0, c.width, c.height).data; let lum = 0, sat = 0, n = 0;
      for (let i = 0; i < px.length; i += 400){ lum += (px[i] + px[i + 1] + px[i + 2]) / 765; sat += (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])) / 255; n++; }
      URL.revokeObjectURL(url); res({ src: c.toDataURL('image/jpeg', .7), hq, light: lum / n, sat: sat / n, duration: v.duration || 0 }); } catch(e){ fail(); } };
  }); }
  async function addVideos(files){
    toast(T('Videolar hazırlanıyor…','Preparing videos…')); let failed = 0; const added = [];
    for (const f of files){ try { if (f.size > MAX) throw 0; const cv = await cover(f), id = 'user' + crypto.randomUUID();
        if (window.PTHQ){ await PTHQ.putVideo(id, f); await PTHQ.fromImage(id, cv.hq); }
        added.push({ id, src: cv.src, hq: !!window.PTHQ, type: 'unknown', light: cv.light, accent: cv.sat > .3, bw: cv.sat < .03, selected: true, locked: false, important: false, zoom: 1, title: f.name, video: true, duration: Math.round(cv.duration) });
      } catch(_) { failed++; } }
    if (added.length){ state.photos = (state.photos || []).filter(p => !/^sample\d+$/.test(p.id)); state.photos.push(...added); try { save(); } catch(_) {} render(); }
    toast(failed ? T(`${added.length} reels eklendi; ${failed} video açılamadı (MP4 ya da MOV, en fazla 500 MB).`, `${added.length} reels added; ${failed} videos could not be opened (MP4 or MOV, 500 MB max).`)
      : T(`${added.length} reels eklendi.`, `${added.length} reels added.`)); }
  up.onchange = async e => { const all = [...(e.target.files || [])]; if (!all.length) return;
    const vids = all.filter(isVideo), imgs = all.filter(f => !isVideo(f)); e.target.value = '';
    if (imgs.length && prev) await prev({ target: { files: imgs, value: '' } });
    if (vids.length) await addVideos(vids); };

  /* grid: reels get the instagram play mark */
  const icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 8h18M9 3l3 5M15 3l3 5"/><path d="M10 11.5v5l4.5-2.5z" fill="currentColor"/></svg>';
  function mark(){ document.querySelectorAll('.simple-tile[data-id]').forEach(t => { const p = simplePhoto(t.dataset.id);
    if (p && p.video && !t.querySelector('.pt-reel')) t.insertAdjacentHTML('beforeend', `<span class="pt-reel" aria-label="Reels">${icon}</span>`); }); }
  const _render = render; render = function(){ const out = _render.apply(this, arguments); try { mark(); } catch(_) {} return out; };
  /* opening a reel plays it */
  let lastUrl = '';
  const _sheet = simpleSheet; simpleSheet = function(id){ const out = _sheet.apply(this, arguments); const p = simplePhoto(id);
    if (p && p.video && window.PTHQ){ PTHQ.video(id).then(b => { const box = document.querySelector('.simple-sheet-photo'); if (!b || !box) return;
      if (lastUrl) URL.revokeObjectURL(lastUrl); lastUrl = URL.createObjectURL(b);
      box.innerHTML = `<video src="${lastUrl}" poster="${esc(p.src)}" playsinline muted loop autoplay controls></video>`;
      if (!box.parentNode.querySelector('.pt-reel-coverbtn')) box.insertAdjacentHTML('afterend', action('pt-reel-cover', T('Kapağı değiştir','Change cover'), 'sheet-row pt-reel-coverbtn', `data-id="${esc(id)}"`)); }); }
    return out; };

  /* cover picker: scrub the video and keep a frame, or use a separate photo like instagram does */
  let coverId = null, coverUrl = '';
  async function setCover(id, source){
    const p = simplePhoto(id); if (!p) return; const w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height; if (!w || !h) throw 0;
    const c = document.createElement('canvas'), r = Math.min(1, 800 / Math.max(w, h)); c.width = Math.round(w * r); c.height = Math.round(h * r);
    const g = c.getContext('2d'); g.drawImage(source, 0, 0, c.width, c.height);
    const hq = document.createElement('canvas'), r2 = Math.min(1, 2160 / Math.max(w, h)); hq.width = Math.round(w * r2); hq.height = Math.round(h * r2); hq.getContext('2d').drawImage(source, 0, 0, hq.width, hq.height);
    const px = g.getImageData(0, 0, c.width, c.height).data; let lum = 0, sat = 0, n = 0;
    for (let i = 0; i < px.length; i += 400){ lum += (px[i] + px[i + 1] + px[i + 2]) / 765; sat += (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])) / 255; n++; }
    p.src = c.toDataURL('image/jpeg', .7); p.light = lum / n; p.accent = sat / n > .3; p.bw = sat / n < .03; delete p.crop; delete p.cropSource; p.zoom = 1;
    if (window.PTHQ) await PTHQ.fromImage(id, hq); try { save(); } catch(_) {} render(); }
  async function coverEditor(id){
    const p = simplePhoto(id); if (!p || !window.PTHQ) return; const b = await PTHQ.video(id); if (!b) return;
    coverId = id; if (coverUrl) URL.revokeObjectURL(coverUrl); coverUrl = URL.createObjectURL(b);
    modal(T('kapak seç.','choose a cover.'), `<div class="pt-cover">
      <div class="pt-cover-frame"><video id="pt-cover-v" src="${coverUrl}" playsinline muted preload="auto"></video></div>
      <input id="pt-cover-t" type="range" min="0" max="1000" value="0" aria-label="${T('Kare seç','Pick a frame')}">
      <p class="small muted">${T('Kaydırarak kareyi seç. Grid’de bu kare görünür.','Slide to pick the frame. This is what your grid shows.')}</p>
      <div class="actions">${action('pt-cover-save', T('Bu kareyi kapak yap','Use this frame'), 'pill solid')}<label class="pill" for="pt-cover-file">${T('Galeriden kapak seç','Cover from library')}</label></div>
      <input id="pt-cover-file" type="file" accept="image/*" hidden></div>`);
    const v = document.getElementById('pt-cover-v'), t = document.getElementById('pt-cover-t');
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(0.6, (v.duration || 1) / 3); t.value = Math.round(v.currentTime / (v.duration || 1) * 1000); } catch(_) {} };
    t.oninput = () => { if (v.duration) try { v.currentTime = t.value / 1000 * v.duration; } catch(_) {} }; }
  document.addEventListener('click', async e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pt-reel-cover') coverEditor(b.dataset.id);
    if (a === 'pt-cover-save' && coverId){ const v = document.getElementById('pt-cover-v');
      try { await setCover(coverId, v); simpleSheet(coverId); toast(T('Kapak güncellendi.','Cover updated.')); } catch(_) { toast(T('Bu kare alınamadı, biraz kaydırıp tekrar dene.','Couldn’t grab that frame. Slide a little and try again.')); } } });
  document.addEventListener('change', async e => { if (e.target.id !== 'pt-cover-file' || !coverId) return; const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    const u = URL.createObjectURL(f); try { const im = await loadImg(u); await setCover(coverId, im); simpleSheet(coverId); toast(T('Kapak güncellendi.','Cover updated.')); }
    catch(_) { toast(T('Fotoğraf açılamadı.','Couldn’t open that photo.')); } finally { URL.revokeObjectURL(u); } });
  window.PTReels = { cover, addVideos, setCover, coverEditor };
})();
