/* booth: a photo booth on the phone. three formats:
   - single: one black & white print with the pintertag strip below (5:7)
   - strip of 3 / strip of 4: the classic booth strip, frames stacked on black, warm black & white
   live mode opens the camera in the page and shoots the frames with a 3-2-1 countdown and a flash;
   where the page can't open the camera (some in-app viewers) it falls back to the phone's own camera, one frame per tap,
   or to picking photos from the library. a 9:16 story card is made from every result.
   everything is drawn on the phone; photos are never uploaded. entry: the "booth" card on the grid screen. */
(function(){
  const PW = 1080, PH = 1512, STRIP = 162;            /* single print: 5:7, photo area 1080x1350 (4:5) */
  const SW = 1080, SH = 1920;                          /* story card */
  const sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const cam = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>';
  const MODES = ['1','3','4'], TONES = ['classic','plate','film','sepia'];
  let lastShots = [];                                  /* frames of the last result, kept so the colour can be switched afterwards */
  let last = null;                                     /* { print:Blob, card:Blob, printUrl, cardUrl, mode } */
  let shots = [];                                      /* collected frames: { im (img|canvas), thumb (url) } */
  let live = null;                                     /* running camera session */

  const mode = () => MODES.includes(String(state.boothMode)) ? String(state.boothMode) : '1';
  const tone = () => TONES.includes(state.boothTone) ? state.boothTone : 'classic';
  const toneName = t => t === 'plate' ? T('Plaka','Plate') : t === 'film' ? T('Film','Film') : t === 'sepia' ? T('Sepya','Sepia') : T('Klasik','Classic');
  const toneSeg = act => `<div class="pt-booth-seg pt-booth-tone" role="group" aria-label="${T('Renk','Colour')}">${TONES.map(x => action(act, toneName(x), x === tone() ? 'on' : '', `data-tone="${x}" aria-pressed="${x === tone()}"`)).join('')}</div>`;
  const need = () => +mode();
  const tag = () => { const v = (state.boothTag ?? state.campaign?.name ?? '').trim(); return v && v.toLowerCase() !== 'pintertag' ? v : ''; };
  const dateText = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getFullYear()).slice(2)}`; };
  const up = s => s.toLocaleUpperCase(state.lang === 'tr' ? 'tr-TR' : 'en-US');
  const label = () => { const t = tag(); return up(T('KABİN','BOOTH') + (t ? ' · ' + t : '')); };
  const modeName = m => m === '1' ? T('Tekli','Single') : m === '3' ? T('3’lü şerit','Strip of 3') : T('4’lü şerit','Strip of 4');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const blobOf = (c, type, q) => new Promise(r => c.toBlob(r, type, q));

  function resetShots(){ shots.forEach(s => { if (s.url) URL.revokeObjectURL(s.url); }); shots = []; }

  function inputs(){
    if (document.getElementById('pt-booth-cam')) return;
    document.body.insertAdjacentHTML('beforeend', '<input id="pt-booth-cam" type="file" accept="image/*" capture="user" hidden><input id="pt-booth-lib" type="file" accept="image/*" multiple hidden>');
    ['pt-booth-cam','pt-booth-lib'].forEach(id => { const el = document.getElementById(id);
      el.addEventListener('click', () => { el.value = ''; });
      el.addEventListener('change', async () => { const fs = [...(el.files || [])]; el.value = ''; if (fs.length) await addFiles(fs); }); });
  }

  /* ---------- start screen ---------- */
  function slotArt(m){ return m === '1' ? '<div class="pt-booth-slot"><span>5:7</span></div>'
    : `<div class="pt-booth-slot is-strip">${Array.from({ length: +m }, (_, i) => `<i>${shots[i] ? `<img src="${shots[i].thumb}" alt="">` : i + 1}</i>`).join('')}</div>`; }
  function open(){
    inputs(); if (shots.length > need()) resetShots();
    const m = mode(), many = m !== '1', left = need() - shots.length;
    modal(T('kabin.','booth.'), `<div class="pt-booth is-sym">
      <div class="pt-booth-seg is-3" role="group" aria-label="${T('Kabin türü','Booth format')}">${MODES.map(x => action('pt-booth-mode', modeName(x), x === m ? 'on' : '', `data-mode="${x}" aria-pressed="${x === m}"`)).join('')}</div>
      ${toneSeg('pt-booth-tone')}
      <div class="pt-booth-stage">${slotArt(m)}</div>
      <p class="pt-booth-lede">${many ? T(`${m} kare, 3-2-1 sayarak arka arkaya. Sonunda kabin şeridin hazır.`, `${m} frames in a row, 3-2-1. Then your strip is ready.`)
        : T('Telefonunla çek, altında pintertag şeridiyle baskını al.','Shoot it on your phone, get your print with the pintertag strip.')}</p>
      ${shots.length && many ? `<p class="pt-booth-count"><b>${shots.length}/${need()}</b> ${T('kare hazır','frames ready')}</p>` : ''}
      <div class="pt-booth-pair">
        ${action('pt-booth-live', cam + '<span>' + (shots.length && many ? T(`Kalan ${left}`, `Other ${left}`) : many ? T('Başlat','Start') : T('Kamerayı aç','Open camera')) + '</span>', 'pill solid')}
        <label class="pill" for="pt-booth-lib">${T('Galeriden seç','From library')}</label>
      </div>
      ${shots.length ? action('pt-booth-reset', T('Baştan başla','Start over'), 'text-button') : ''}
      <label class="pt-booth-tag"><span class="small muted">${T('Şeritte yazsın (isteğe bağlı)','On the strip (optional)')}</span>
        <input id="pt-booth-tag" class="field" maxlength="24" placeholder="${T('örn. cihangir','e.g. cihangir')}" value="${esc(tag())}" autocomplete="off" autocapitalize="none"></label>
      <p class="small muted pt-booth-foot">${T('Fotoğrafların sadece telefonunda işlenir. Story’nde @pintertag’i etiketleyebilirsin.','Your photos stay on your phone. Tag @pintertag in your story.')}</p></div>`);
  }

  /* ---------- collecting frames ---------- */
  function flipX(im){ const c = document.createElement('canvas'), w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    c.width = w; c.height = h; const g = c.getContext('2d'); g.translate(w, 0); g.scale(-1, 1); g.drawImage(im, 0, 0, w, h); return c; }
  async function addFiles(files, mirror){
    for (const f of files){ if (shots.length >= need()) break; const url = URL.createObjectURL(f);
      try { let im = await loadImg(url);
        if (mirror){ im = flipX(im); URL.revokeObjectURL(url); shots.push({ im, thumb: im.toDataURL('image/jpeg', .7) }); }
        else shots.push({ im, url, thumb: url }); } catch(_) { URL.revokeObjectURL(url); } }
    if (!shots.length){ toast(T('Bu fotoğraf açılamadı. Başka bir fotoğraf dene.','This photo couldn’t be opened. Try another one.')); return; }
    if (shots.length >= need()) develop(); else open();
  }
  function grab(video, mirror){ const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
    const c = document.createElement('canvas'), s = Math.min(1, 1600 / Math.max(vw, vh)); c.width = Math.round(vw * s); c.height = Math.round(vh * s);
    const g = c.getContext('2d'); if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); } g.drawImage(video, 0, 0, c.width, c.height); return { im: c, thumb: c.toDataURL('image/jpeg', .7) }; }

  async function startLive(){
    const many = need() > 1, facing = state.boothFacing || 'user';
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return fallbackCam();
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1600 }, height: { ideal: 1600 } }, audio: false }); }
    catch(_) { return fallbackCam(); }
    closeModal();
    const el = document.createElement('div'); el.className = 'pt-booth-live'; el.innerHTML = `
      <video playsinline muted autoplay class="${facing === 'user' ? 'mirror' : ''} tone-${tone()}"></video>
      <div class="pt-bl-top"><span class="pt-bl-n"></span>${action('pt-bl-flip', T('Çevir','Flip'), 'pt-bl-btn')}</div>
      <div class="pt-bl-count" aria-live="assertive"></div><div class="pt-bl-flash"></div>
      <div class="pt-bl-bottom"><div class="pt-bl-thumbs">${Array.from({ length: need() }, () => '<i></i>').join('')}</div>
        <div class="pt-bl-row">${action('pt-bl-cancel', T('Vazgeç','Cancel'), 'pt-bl-btn')}${many ? '' : action('pt-bl-shoot', '', 'pt-bl-shutter', `aria-label="${T('Çek','Shoot')}"`)}</div></div>`;
    document.body.appendChild(el);
    const video = el.querySelector('video'); video.srcObject = stream; try { await video.play(); } catch(_) {}
    const session = live = { el, stream, video, stop: false, facing };
    const alive = () => live === session && !session.stop;
    const paint = () => { el.querySelector('.pt-bl-n').textContent = many ? `${Math.min(shots.length + 1, need())} / ${need()}` : '';
      el.querySelectorAll('.pt-bl-thumbs i').forEach((t, i) => { t.innerHTML = shots[i] ? `<img src="${shots[i].thumb}" alt="">` : ''; t.classList.toggle('now', i === shots.length); }); };
    paint();
    for (let k = 0; k < 40 && !video.videoWidth; k++) await wait(50);
    if (!many){ session.paint = paint; return; }              /* single: wait for the shutter tap */
    await wait(500);
    while (alive() && shots.length < need()){
      for (let n = shots.length ? 2 : 3; n > 0; n--){ if (!alive()) return; countdown(String(n)); await wait(900); }
      if (!alive()) return;
      await snap(); paint(); await wait(650);
    }
    if (alive()){ endLive(); develop(); }
  }
  function countdown(t){ if (!live) return; const c = live.el.querySelector('.pt-bl-count'); c.textContent = t; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
  async function snap(){ if (!live) return; const c = live.el.querySelector('.pt-bl-count'); c.textContent = '';
    const f = live.el.querySelector('.pt-bl-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    try { navigator.vibrate && navigator.vibrate(18); } catch(_) {}
    const s = grab(live.video); if (s) shots.push(s); }
  function endLive(){ if (!live) return; live.stop = true; try { live.stream.getTracks().forEach(t => t.stop()); } catch(_) {} live.el.remove(); live = null; }
  async function flip(){ if (!live) return; state.boothFacing = live.facing === 'user' ? 'environment' : 'user'; save(); endLive(); startLive(); }
  async function shootOne(){ if (!live) return; await snap(); live.paint && live.paint(); await wait(350); endLive(); develop(); }

  /* the page can't open the camera here: use the phone's camera app, one frame per tap */
  function fallbackCam(){ inputs(); const left = need() - shots.length;
    modal(T('kabin.','booth.'), `<div class="pt-booth"><div class="pt-booth-start">${slotArt(mode())}<div class="pt-booth-go">
      <p class="pt-booth-lede">${need() > 1 ? T(`Burada canlı kabin açılamıyor; telefonunun kamerasıyla kareleri tek tek çek. <b>${shots.length + 1}. kare</b>.`, `The live booth can’t open here, so shoot the frames one by one with your phone’s camera. <b>Frame ${shots.length + 1}</b>.`) : T('Burada canlı kamera açılamıyor; telefonunun kamerasını kullan.','The live camera can’t open here; use your phone’s camera.')}</p>
      <label class="pill solid" for="pt-booth-cam">${cam}<span>${need() > 1 ? T(`${shots.length + 1}. kareyi çek`, `Shoot frame ${shots.length + 1}`) : T('Kamerayı aç','Open camera')}</span></label>
      <label class="pill" for="pt-booth-lib">${left > 1 ? T(`Galeriden ${left} fotoğraf seç`, `Pick ${left} from library`) : T('Galeriden seç','Choose from library')}</label>
      ${action('pt-booth-open', T('Geri','Back'), 'text-button')}</div></div></div>`);
    live = null; }

  /* ---------- drawing ---------- */
  /* black & white, soft s-curve, lifted blacks, grain, a hint of warm paper. strips get a deeper, warmer tone. */
  /* second colour, "plate": measured from the reference print. warm brown shadows, mint-cream highlights,
     lifted blacks and capped whites like an old plate, fine grain and visible dust. */
  const PLATE = [[0,[28,26,23]],[.25,[60,57,50]],[.4,[86,83,75]],[.55,[116,116,106]],[.7,[148,151,141]],[.82,[177,183,174]],[.92,[199,212,201]],[1,[212,225,214]]];
  const PLATE_LUT = (() => { const t = new Uint8ClampedArray(256 * 3); for (let v = 0; v < 256; v++){ const l = v / 255; let k = 1; while (k < PLATE.length - 1 && PLATE[k][0] < l) k++;
      const [a, ca] = PLATE[k - 1], [b, cb] = PLATE[k], f = (l - a) / (b - a || 1); for (let c = 0; c < 3; c++) t[v * 3 + c] = ca[c] + (cb[c] - ca[c]) * f; } return t; })();
  function plate(g, x, y, w, h){
    const d = g.getImageData(x, y, w, h), a = d.data, n = a.length / 4; let seed = 11 + w + h; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const L = new Float32Array(n), hist = new Uint32Array(256);
    for (let p = 0, i = 0; p < n; p++, i += 4){ const l = (.2126 * a[i] + .7152 * a[i+1] + .0722 * a[i+2]) / 255; L[p] = l; hist[Math.min(255, l * 255 | 0)]++; }
    const pct = q => { let c = 0, t = n * q; for (let v = 0; v < 256; v++){ c += hist[v]; if (c >= t) return v / 255; } return 1; };
    const lo = pct(.01), hi = Math.max(lo + .2, pct(.995)), span = hi - lo;
    for (let p = 0, i = 0; p < n; p++, i += 4){
      let l = Math.max(0, Math.min(1, (L[p] - lo) / span));
      l = Math.pow(l, 1.06); l = l * l * (3 - 2 * l) * .45 + l * .55;
      l += (rnd() - .5) * .045; const v = Math.max(0, Math.min(255, Math.round(l * 255))) * 3;
      a[i] = PLATE_LUT[v]; a[i+1] = PLATE_LUT[v+1]; a[i+2] = PLATE_LUT[v+2]; }
    g.putImageData(d, x, y);
    g.save(); const specks = Math.round((w * h) / 45000) + 6;
    for (let k = 0; k < specks; k++){ const px = x + rnd() * w, py = y + rnd() * h, r = .7 + rnd() * 1.9, dark = rnd() < .8;
      g.fillStyle = dark ? `rgba(30,27,23,${.35 + rnd() * .4})` : `rgba(230,238,230,${.5 + rnd() * .4})`; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); }
    for (let k = 0; k < 3; k++){ const px = x + rnd() * w, py = y + rnd() * h; g.strokeStyle = 'rgba(30,27,23,.28)'; g.lineWidth = .9;
      g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + (rnd() - .5) * 34, py + (rnd() - .5) * 34, px + (rnd() - .5) * 46, py + (rnd() - .5) * 46); g.stroke(); }
    g.restore();
  }
  /* third colour, "film": colour, measured from the reference portraits. deep near-neutral blacks with a hint of magenta,
     warm amber mids, creamy highlights that never clip, greys stay grey, blues and greens a touch quieter, fine grain. */
  function film(g, x, y, w, h){
    const d = g.getImageData(x, y, w, h), a = d.data, n = a.length / 4; let seed = 23 + w + h; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const hist = new Uint32Array(256);
    for (let i = 0; i < a.length; i += 4) hist[Math.min(255, (.2126 * a[i] + .7152 * a[i+1] + .0722 * a[i+2]) | 0)]++;
    const pct = q => { let c = 0, t = n * q; for (let v = 0; v < 256; v++){ c += hist[v]; if (c >= t) return v; } return 255; };
    const lo = pct(.008), hi = Math.max(lo + 60, pct(.996)), span = hi - lo;
    for (let i = 0; i < a.length; i += 4){
      let r = (a[i] - lo) / span, gg = (a[i+1] - lo) / span, b = (a[i+2] - lo) / span;
      const l0 = Math.max(0, .2126 * r + .7152 * gg + .0722 * b);
      let l = Math.min(1, l0); l = l * l * (3 - 2 * l) * .46 + l * .54; l = Math.pow(l, 1.04);
      const k = l0 > .001 ? l / l0 : 1;
      r = l + (r * k - l); gg = l + (gg * k - l); b = l + (b * k - l);
      const wt = Math.max(0, Math.min(1, (r - b) * 5)), sat = .84 + .42 * wt;
      r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
      const sh = (1 - l) * (1 - l), md = 4 * l * (1 - l), hl = l * l;
      r += (.012 * sh + .016 * md + .012 * hl); gg += (-.004 * sh + .002 * md + .004 * hl); b += (.012 * sh - .018 * md - .006 * hl);
      const gr = (rnd() - .5) * .032;
      const cap = v => Math.max(0, Math.min(255, Math.round((.028 + Math.min(1, v + gr) * .935) * 255)));
      a[i] = cap(r); a[i+1] = cap(gg); a[i+2] = cap(b); }
    g.putImageData(d, x, y);
  }
  /* fourth colour, "sepia" (shown as "Sepya"): an old film print gone olive. olive-brown shadows, khaki mids,
     pale olive-cream highlights, faded blacks, soft focus, heavy film grain, dark falloff at the edges. */
  const SEPIA = [[26,[30,27,16]],[45,[48,45,28]],[70,[74,71,46]],[98,[102,99,68]],[126,[130,128,93]],[154,[158,157,120]],
    [182,[185,186,150]],[206,[208,211,176]],[224,[225,228,197]],[232,[232,235,208]]];
  const SEPIA_LUT = (() => { const t = new Uint8ClampedArray(256 * 3), y0 = SEPIA[0][0], y1 = SEPIA[SEPIA.length - 1][0];
      for (let v = 0; v < 256; v++){ const y = y0 + (y1 - y0) * v / 255; let k = 1; while (k < SEPIA.length - 1 && SEPIA[k][0] < y) k++;
        const [a, ca] = SEPIA[k - 1], [b, cb] = SEPIA[k], f = Math.max(0, Math.min(1, (y - a) / (b - a || 1))); for (let c = 0; c < 3; c++) t[v * 3 + c] = ca[c] + (cb[c] - ca[c]) * f; } return t; })();
  function sepia(g, x, y, w, h){
    const d = g.getImageData(x, y, w, h), a = d.data, n = a.length / 4; let seed = 31 + w + h; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const L = new Float32Array(n), hist = new Uint32Array(256);
    for (let p = 0, i = 0; p < n; p++, i += 4){ const l = (.2126 * a[i] + .7152 * a[i+1] + .0722 * a[i+2]) / 255; L[p] = l; hist[Math.min(255, l * 255 | 0)]++; }
    const pct = q => { let c = 0, t = n * q; for (let v = 0; v < 256; v++){ c += hist[v]; if (c >= t) return v / 255; } return 1; };
    const lo = pct(.01), hi = Math.max(lo + .2, pct(.99)), span = hi - lo;
    /* local contrast: a heavily blurred copy (drawn small, then scaled back up) is the base; detail is pushed away from it,
       which brightens lit skin and deepens the shadows around it like the reference booth portrait */
    const sw = Math.max(8, Math.round(w / 24)), sh = Math.max(8, Math.round(h / 24));
    const sm = document.createElement('canvas'); sm.width = sw; sm.height = sh; const sg = sm.getContext('2d'); sg.imageSmoothingQuality = 'high';
    sg.drawImage(g.canvas, x, y, w, h, 0, 0, sw, sh);
    const bl = document.createElement('canvas'); bl.width = w; bl.height = h; const bg = bl.getContext('2d'); bg.imageSmoothingQuality = 'high'; bg.drawImage(sm, 0, 0, w, h);
    const B = bg.getImageData(0, 0, w, h).data;
    for (let p = 0, i = 0; p < n; p++, i += 4){
      const base = (.2126 * B[i] + .7152 * B[i+1] + .0722 * B[i+2]) / 255;
      let l = L[p] + (L[p] - base) * .3;
      l = Math.max(0, Math.min(1, (l - lo) / span));
      l = Math.pow(l, .82); l = l * l * (3 - 2 * l) * .75 + l * .25; l += (rnd() - .5) * .07;
      const v = Math.max(0, Math.min(255, Math.round(l * 255))) * 3;
      a[i] = SEPIA_LUT[v]; a[i+1] = SEPIA_LUT[v+1]; a[i+2] = SEPIA_LUT[v+2]; }
    g.putImageData(d, x, y);
    /* soft focus: a slightly blurred copy laid over at low strength, like an old lens */
    const sf = document.createElement('canvas'); sf.width = Math.round(w / 3); sf.height = Math.round(h / 3); sf.getContext('2d').drawImage(g.canvas, x, y, w, h, 0, 0, sf.width, sf.height);
    g.save(); g.globalAlpha = .28; g.imageSmoothingQuality = 'high'; g.drawImage(sf, x, y, w, h); g.restore();
    const r = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * .38, x + w / 2, y + h / 2, Math.max(w, h) * .75);
    r.addColorStop(0, 'rgba(28,27,14,0)'); r.addColorStop(1, 'rgba(28,27,14,.32)'); g.fillStyle = r; g.fillRect(x, y, w, h);
  }
  function bw(g, x, y, w, h, deep){
    if (tone() === 'plate') return plate(g, x, y, w, h);
    if (tone() === 'film') return film(g, x, y, w, h);
    if (tone() === 'sepia') return sepia(g, x, y, w, h);
    const d = g.getImageData(x, y, w, h), a = d.data; let seed = 7 + w; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const k = deep ? 1.12 : 1.04, warm = deep ? [7, 2, -6] : [3, 1, -2];
    for (let i = 0; i < a.length; i += 4){ let l = (.2126 * a[i] + .7152 * a[i+1] + .0722 * a[i+2]) / 255;
      l = l < .5 ? 2 * l * l * k : 1 - 2 * (1 - l) * (1 - l) * (2 - k);
      l = (deep ? .045 : .035) + l * (deep ? .9 : .93) + (rnd() - .5) * (deep ? .05 : .035);
      const v = Math.max(0, Math.min(255, l * 255)); a[i] = v + warm[0]; a[i+1] = v + warm[1]; a[i+2] = v + warm[2]; }
    g.putImageData(d, x, y);
  }
  function vignette(g, x, y, w, h){ const r = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * .35, x + w / 2, y + h / 2, Math.max(w, h) * .75);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = r; g.fillRect(x, y, w, h); }
  function cover(g, im, x, y, w, h){ const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, r = Math.max(w / iw, h / ih), sw = w / r, sh = h / r; g.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h); }

  function drawPrint(im, logo){
    const c = document.createElement('canvas'); c.width = PW; c.height = PH; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, PW, PH);
    cover(g, im, 0, 0, PW, PH - STRIP); bw(g, 0, 0, PW, PH - STRIP);
    const y = PH - STRIP / 2; g.fillStyle = '#080808'; g.textBaseline = 'middle';
    if (logo){ g.drawImage(logo, 58, y - 26, 39, 52); }
    g.font = `700 50px ${sans}`; g.textAlign = 'left'; g.fillText('pintertag', logo ? 108 : 58, y + 2);
    g.textAlign = 'right'; g.font = `500 30px ${sans}`; g.fillText(label(), PW - 58, y - 20);
    g.fillStyle = '#757575'; g.fillText(dateText(), PW - 58, y + 22);
    return c;
  }
  /* classic booth strip: white paper edge, frames on black, small pintertag foot */
  function drawStrip(ims, logo){
    const n = ims.length, W = 700, M = 26, B = 22, FW = W - 2 * (M + B), FH = Math.round(FW * .96), GAP = 26, FOOT = 132;
    const H = M + B + n * FH + (n - 1) * GAP + B + FOOT;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0d0c0b'; g.fillRect(M, M, W - 2 * M, B + n * FH + (n - 1) * GAP + B);
    ims.forEach((im, i) => { const x = M + B, y = M + B + i * (FH + GAP); cover(g, im, x, y, FW, FH); bw(g, x, y, FW, FH, true); if (tone() === 'classic') vignette(g, x, y, FW, FH); });
    const fy = H - FOOT / 2 - 6; g.textBaseline = 'middle'; g.fillStyle = '#0d0c0b';
    if (logo) g.drawImage(logo, M + 4, fy - 20, 30, 40);
    g.font = `700 38px ${sans}`; g.textAlign = 'left'; g.fillText('pintertag', M + (logo ? 42 : 4), fy + 2);
    g.textAlign = 'right'; g.font = `500 21px ${sans}`; g.fillText(label(), W - M - 4, fy - 14); g.fillStyle = '#757575'; g.fillText(dateText(), W - M - 4, fy + 16);
    return c;
  }
  function drawCard(print, logo, strip){
    const c = document.createElement('canvas'); c.width = SW; c.height = SH; const g = c.getContext('2d');
    g.fillStyle = '#e9e7e3'; g.fillRect(0, 0, SW, SH);
    g.fillStyle = '#080808'; g.textBaseline = 'alphabetic';
    if (logo) g.drawImage(logo, 90, 118, 30, 40);
    g.font = `700 44px ${sans}`; g.textAlign = 'left'; g.fillText('pintertag', 130, 155);
    g.textAlign = 'right'; g.font = `500 28px ${sans}`; g.fillStyle = '#5f5f5f'; g.fillText(label(), SW - 90, 152);
    let w, h, cx, cy, rot;
    if (strip){ h = Math.min(1380, SH - 520); w = h * print.width / print.height; if (w > 560){ w = 560; h = w * print.height / print.width; } cx = SW / 2; cy = 250 + (SH - 250 - 300) / 2; rot = -7; }
    else { w = 820; h = w * print.height / print.width; cx = SW / 2; cy = 330 + h / 2; rot = -2.2; }
    g.save(); g.translate(cx, cy); g.rotate(rot * Math.PI / 180);
    g.shadowColor = 'rgba(0,0,0,.24)'; g.shadowBlur = 46; g.shadowOffsetY = 18; g.fillStyle = '#fff'; g.fillRect(-w / 2, -h / 2, w, h);
    g.shadowColor = 'transparent'; g.drawImage(print, -w / 2, -h / 2, w, h); g.restore();
    g.textAlign = 'left'; g.fillStyle = '#080808'; g.font = `700 46px ${sans}`; g.fillText(T('pintertag kabininden.','From the pintertag booth.'), 90, SH - 190);
    g.font = `500 28px ${sans}`; g.fillStyle = '#5f5f5f'; g.fillText(up('@PINTERTAG · ' + T('FEED’İNİN SANAT YÖNETMENİ','YOUR FEED’S ART DIRECTOR')), 92, SH - 136);
    return c;
  }

  async function renderOut(ims, m){
    const strip = m !== '1', logo = await loadImg('assets/logo.png').catch(() => null);
    const printC = strip ? drawStrip(ims, logo) : drawPrint(ims[0], logo), cardC = drawCard(printC, logo, strip);
    const print = await blobOf(printC, 'image/jpeg', .92), card = await blobOf(cardC, 'image/jpeg', .92);
    if (!print || !card) throw new Error('blob');
    if (last){ URL.revokeObjectURL(last.printUrl); URL.revokeObjectURL(last.cardUrl); }
    last = { print, card, printUrl: URL.createObjectURL(print), cardUrl: URL.createObjectURL(card), mode: m, tone: tone() };
  }
  async function retone(t){ if (!last || !lastShots.length || t === tone()) return; const view = current();
    state.boothTone = t; save(); const out = document.querySelector('.pt-booth-out'); if (out) out.classList.add('busy');
    try { await renderOut(lastShots.map(s => s.im), last.mode); } catch(_) { toast(T('Renk değiştirilemedi.','Couldn’t change the colour.')); }
    result(view); }
  async function develop(){
    const tagEl = document.getElementById('pt-booth-tag'); if (tagEl) state.boothTag = tagEl.value.trim(); save();
    const m = mode(), strip = m !== '1';
    modal(strip ? T('şeridin basılıyor.','printing your strip.') : T('baskı hazırlanıyor.','developing your print.'), `<div class="pt-booth"><div class="pt-booth-dev"><i></i></div><p class="small muted">${T('Birkaç saniye. Telefonunda oluyor.','A few seconds. It happens on your phone.')}</p></div>`);
    await wait(60);
    try {
      const keep = shots.slice(0, need()); if (keep.length < need()) throw new Error('short');
      await renderOut(keep.map(s => s.im), m);
      lastShots.forEach(s => { if (s.url && !keep.includes(s)) URL.revokeObjectURL(s.url); }); lastShots = keep; shots = [];
      result('print');
    } catch(_){
      resetShots();
      modal(T('kabin.','booth.'), `<p class="m-reason">${T('Bu fotoğraflar açılamadı. Başka fotoğraflarla ya da kamerayla tekrar dene.','These photos couldn’t be opened. Try other photos or the camera.')}</p><div class="actions">${action('pt-booth-open', T('Tekrar dene','Try again'), 'pill solid')}</div>`);
    }
  }

  function result(view){
    if (!last) return; const card = view === 'card', strip = last.mode !== '1';
    modal(card ? T('story kartın.','your story card.') : strip ? T('şeridin hazır.','your strip is ready.') : T('baskın hazır.','your print is ready.'), `<div class="pt-booth">
      <div class="pt-booth-seg" role="group">${action('pt-booth-view', strip ? T('Şerit','Strip') : T('Baskı','Print'), card ? '' : 'on', 'data-view="print" aria-pressed="' + !card + '"')}${action('pt-booth-view', T('Story kartı','Story card'), card ? 'on' : '', 'data-view="card" aria-pressed="' + card + '"')}</div>
      <p class="pt-booth-hold">${T('Görsele <b>basılı tut</b> → <b>Fotoğraflara Ekle</b>','<b>Press and hold</b> the image → <b>Add to Photos</b>')}</p>
      <div class="pt-booth-out ${card ? 'is-card' : strip ? 'is-strip' : ''}"><img src="${card ? last.cardUrl : last.printUrl}" alt="${T('pintertag kabin baskısı','pintertag booth print')}"></div>
      ${lastShots.length ? toneSeg('pt-booth-retone') : ''}
      <div class="actions pt-booth-actions">${action('pt-booth-share', card ? T('Story’de paylaş','Share to story') : T('Paylaş','Share'), 'pill solid')}${action('pt-booth-save', T('Kaydet','Save'), 'pill')}</div>
      <div class="pt-booth-more">${strip ? '<span></span>' : action('pt-booth-grid', T('Grid’ime ekle','Add to my grid'), 'text-button')}${action('pt-booth-open', T('Yeniden çek','Shoot again'), 'text-button')}</div>
      <p class="small muted">${T('Paylaş’a dokununca telefonunun menüsü açılır; Instagram’ı seç, story’ne koy, @pintertag’i etiketle.','Tap Share to open your phone’s menu; pick Instagram, post it to your story, tag @pintertag.')}</p></div>`);
  }

  const fileOf = which => new File([last[which]], `pintertag-${which === 'card' ? 'story' : last.mode === '1' ? 'kabin' : 'serit-' + last.mode}-${dateText().replace(/\./g,'')}.jpg`, { type: 'image/jpeg' });
  const current = () => document.querySelector('.pt-booth-out.is-card') ? 'card' : 'print';
  async function share(){ if (!last) return; const f = fileOf(current());
    try { if (navigator.canShare && navigator.canShare({ files: [f] })){ await navigator.share({ files: [f] }); return; } } catch(e){ if (e && e.name === 'AbortError') return; }
    const r = await PTSave.save(f.name, f); PTSave.say(r, T('Görsel','Image')); }
  async function saveIt(){ if (!last) return; const f = fileOf(current()); const r = await PTSave.save(f.name, f); PTSave.say(r, T('Görsel','Image')); }
  function toGrid(){ if (!last || last.mode !== '1') return; const upEl = document.getElementById('upload'); if (!upEl || typeof upEl.onchange !== 'function') return;
    closeModal(); upEl.onchange({ target: { files: [fileOf('print')], value: '' } }); }

  /* entry on the grid screen, under "add your instagram grid" */
  const _grid = simpleGrid;
  const card = () => `<button class="m-import pt-booth-cta" data-action="pt-booth-open"><span class="pt-booth-ico" aria-hidden="true">${cam}</span><span><b>${T('Kabin','Booth')}</b><small>${T('Tekli ya da 3’lü, 4’lü şerit: 4 renkli pintertag kabini.','Single or a strip of 3 or 4: the pintertag booth in 4 colours.')}</small></span><span aria-hidden="true">›</span></button>`;
  simpleGrid = function(){ const h = _grid(); return h.replace('<div class="simple-feed">', card() + '<div class="simple-feed">'); };

  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pt-booth-open') open();
    if (a === 'pt-booth-mode'){ if (b.dataset.mode !== mode()){ state.boothMode = b.dataset.mode; save(); resetShots(); } open(); }
    if (a === 'pt-booth-reset'){ resetShots(); open(); }
    if (a === 'pt-booth-live'){ const t = document.getElementById('pt-booth-tag'); if (t){ state.boothTag = t.value.trim(); save(); } startLive(); }
    if (a === 'pt-bl-cancel'){ endLive(); open(); }
    if (a === 'pt-bl-flip') flip();
    if (a === 'pt-bl-shoot') shootOne();
    if (a === 'pt-booth-view') result(b.dataset.view);
    if (a === 'pt-booth-tone'){ state.boothTone = b.dataset.tone; save(); open(); }
    if (a === 'pt-booth-retone') retone(b.dataset.tone);
    if (a === 'pt-booth-share') share();
    if (a === 'pt-booth-save') saveIt();
    if (a === 'pt-booth-grid') toGrid(); });
  document.addEventListener('input', e => { if (e.target.id === 'pt-booth-tag'){ state.boothTag = e.target.value.trim(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && live){ endLive(); } });
  window.PTBooth = { flipX, open, develop, drawPrint, drawStrip, drawCard, addFiles, shots: () => shots.length };
  render();
})();
