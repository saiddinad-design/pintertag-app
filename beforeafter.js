/* before/after video: the same 9 photos glide from the old order into the new one. 1080x1920, ~6.5 s, for story/reels.
   same photos on both sides, so brightness is equal by construction; only the order changes. */
(function(){
  const W = 1080, H = 1920, FPS = 30, T_HOLD = 1.4, T_MOVE = 1.9, T_END = 6.6;
  const spring = t => { if (t <= 0) return 0; if (t >= 1) return 1; return 1 - Math.exp(-7 * t) * Math.cos(9 * t); };
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3);
  const mime = () => { if (!window.MediaRecorder) return null; return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch(_) { return false; } }) || null; };
  const scoreOf = ids => { const s = window.__PT.scoreGrid(ids.slice(0, 9).map(id => { const p = simplePhoto(id); return p && p.m ? p.m : null; })); return s ? s.total : null; };

  async function render(canvas, before, after, onDone){
    const g = canvas.getContext('2d'), dark = state.theme === 'dark', bg = dark ? '#111110' : '#f3efe8', ink = dark ? '#f3efe8' : '#151412', mute = dark ? '#a39e95' : '#6f6a62';
    const sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const ids = [...new Set([...before.slice(0, 9), ...after.slice(0, 9)])];
    const imgs = {}; await Promise.all(ids.map(async id => { const p = simplePhoto(id); imgs[id] = p ? await GC.loadImg(p.src) : null; }));
    const logo = await GC.loadImg('assets/logo.png');
    const gap = 8, gw = 780, gx = (W - gw) / 2, cw = (gw - 2 * gap) / 3, ch = cw * 4 / 3, gy = 440, gh = 3 * ch + 2 * gap;
    const pos = i => { const j = i < 0 || i >= 9 ? 15 + ((i < 0 ? 0 : i) % 3) : i; return { x: gx + (j % 3) * (cw + gap), y: gy + Math.floor(j / 3) * (ch + gap) }; };
    const sb = scoreOf(before), sa = scoreOf(after);
    const moving = ids.filter(id => before.indexOf(id) !== after.indexOf(id));
    function tile(im, x, y, s, a){ if (!im) return; g.save(); g.globalAlpha = a; const w = cw * s, h = ch * s, X = x + (cw - w) / 2, Y = y + (ch - h) / 2;
      if (s > 1.001){ g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 40; g.shadowOffsetY = 14; }
      const r = Math.max(w / im.width, h / im.height), sw = w / r, sh = h / r; g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, X, Y, w, h); g.restore(); }
    function frame(t){
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // top label: önce → sonra
      const k = ease((t - T_HOLD - T_MOVE * .6) / .4);
      g.textAlign = 'left'; g.fillStyle = ink; g.font = `700 92px ${sans}`;
      g.globalAlpha = 1 - k; g.fillText(T('önce.', 'before.'), 88, 300); g.globalAlpha = k; g.fillText(T('sonra.', 'after.'), 88, 300); g.globalAlpha = 1;
      g.font = `500 34px ${sans}`; g.fillStyle = mute; g.fillText(T('aynı fotoğraflar. sadece sıra değişti.', 'same photos. only the order changed.'), 90, 360);
      // grid
      g.save(); g.beginPath(); g.rect(gx - 40, gy - 40, gw + 80, gh + 64); g.clip();
      const mv = []; ids.forEach((id, n) => { const i0 = before.indexOf(id), i1 = after.indexOf(id), a = pos(i0), b = pos(i1);
        const delay = moving.indexOf(id) * .05, p = spring((t - T_HOLD - Math.max(0, delay)) / T_MOVE);
        const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p, lift = i0 !== i1 ? Math.sin(Math.min(1, Math.max(0, (t - T_HOLD - delay) / (T_MOVE * .7))) * Math.PI) * .05 : 0;
        const vis = (i0 >= 0 && i0 < 9) || (i1 >= 0 && i1 < 9);
        if (!vis) return;
        if (lift > .001) mv.push([imgs[id], x, y, 1 + lift]); else tile(imgs[id], x, y, 1, 1); });
      mv.forEach(a => tile(a[0], a[1], a[2], a[3], 1)); g.restore();
      // score
      const by = gy + gh + 150;
      if (sb !== null && sa !== null){ const c = ease((t - T_HOLD - T_MOVE) / .9), v = Math.round(sb + (sa - sb) * c);
        g.fillStyle = ink; g.font = `700 112px ${sans}`; g.fillText(String(t < T_HOLD + T_MOVE ? sb : v), 90, by + 20);
        const w = g.measureText(String(v)).width; g.font = `500 40px ${sans}`; g.fillStyle = mute; g.fillText(T('/100 · grid uyumu', '/100 · grid harmony'), 90 + w + 16, by + 20);
        if (t > T_HOLD + T_MOVE && sa > sb){ g.globalAlpha = ease((t - T_HOLD - T_MOVE - .6) / .4); g.fillStyle = ink; g.font = `600 40px ${sans}`; g.fillText(`+${sa - sb}`, 90, by + 90); g.globalAlpha = 1; } }
      // footer
      g.fillStyle = ink; if (logo){ g.save(); if (dark) g.filter = 'invert(1)'; g.drawImage(logo, 90, H - 150, 30, 40); g.restore(); }
      g.font = `700 44px ${sans}`; g.fillText('pintertag', 128, H - 116); g.font = `400 30px ${sans}`; g.fillStyle = mute; g.fillText(T('feed’inin sanat yönetmeni', 'your feed’s art director'), 90, H - 66);
    }
    frame(0);
    const type = mime(); if (!type || !canvas.captureStream){ onDone(null, null); return; }
    const stream = canvas.captureStream(FPS), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 }), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => onDone(new Blob(chunks, { type: type.split(';')[0] }), type);
    rec.start(250); const t0 = performance.now();
    (function loop(){ const t = (performance.now() - t0) / 1000; frame(Math.min(t, T_END)); if (t < T_END) requestAnimationFrame(loop); else setTimeout(() => rec.stop(), 120); })();
  }

  let lastVideo = null;
  async function make(){ const p = simplePreview; if (!p) return;
    modal(T('videon hazırlanıyor.', 'making your video.'), `<div class="m-ba"><canvas id="m-ba-canvas" width="${W}" height="${H}"></canvas></div><p class="small muted space">${T('Yaklaşık 7 saniye. Ekranda gördüğün kaydediliyor.', 'About 7 seconds. What you see is being recorded.')}</p>`);
    const c = document.getElementById('m-ba-canvas');
    await render(c, p.before, p.after, (blob, type) => {
      if (!blob){ modal(T('video desteklenmiyor.', 'video not supported.'), `<p class="m-reason">${T('Bu tarayıcı video kaydedemiyor. Telefonunda Safari ya da Chrome ile dene.', 'This browser can’t record video. Try Safari or Chrome on your phone.')}</p>`); return; }
      const ext = /mp4/.test(type) ? 'mp4' : 'webm'; lastVideo = new File([blob], `pintertag-once-sonra.${ext}`, { type: blob.type }); const url = URL.createObjectURL(blob);
      modal(T('önce / sonra.', 'before / after.'), `<div class="m-ba"><video src="${url}" autoplay loop muted playsinline></video></div>
        <div class="actions">${action('m-ba-share', T('Story’de paylaş', 'Share to story'), 'pill solid')}${action('m-ba-save', T('Videoyu kaydet', 'Save video'), 'pill')}</div>
        ${ext === 'webm' ? `<p class="small muted">${T('Bu tarayıcı videoyu WebM olarak kaydetti; Instagram bazı cihazlarda kabul etmeyebilir. iPhone’da MP4 olarak kaydedilir.', 'This browser saved WebM; Instagram may not accept it on some devices. iPhone saves MP4.')}</p>` : ''}`); }); }
  async function share(){ if (!lastVideo) return;
    try { if (navigator.canShare && navigator.canShare({ files: [lastVideo] })){ await navigator.share({ files: [lastVideo] }); return; } } catch(e){ if (e && e.name === 'AbortError') return; }
    return saveIt(); }
  async function saveIt(){ if (!lastVideo) return; const r = await PTSave.save(lastVideo.name, lastVideo); PTSave.say(r, T('Video', 'Video')); }

  const _cmp = simpleComparison;
  simpleComparison = function(){ const h = _cmp(); return h.replace('<div class="compare-actions">', `<button class="m-ba-cta" data-action="m-ba-make"><span aria-hidden="true"><svg width="12" height="14" viewBox="0 0 12 14"><path d="M1.5 1.2v11.6c0 .5.5.8.9.5l9-5.8c.4-.2.4-.8 0-1L2.4.7c-.4-.3-.9 0-.9.5z" fill="currentColor"/></svg></span><span><b>${T('Önce/sonra videosu', 'Before/after video')}</b><small>${T('Story ve Reels için 7 saniye', '7 seconds for story & reels')}</small></span></button><div class="compare-actions">`); };
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'm-ba-make') make(); if (a === 'm-ba-share') share(); if (a === 'm-ba-save') saveIt(); });
  window.__PTBA = { render, mime };
})();
