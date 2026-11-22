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
      box.innerHTML = `<video src="${lastUrl}" poster="${esc(p.src)}" playsinline muted loop autoplay controls></video>`; }); }
    return out; };
  window.PTReels = { cover, addVideos };
})();
