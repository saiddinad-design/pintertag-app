/* grid check: read an instagram profile screenshot, cut the grid into posts, score it, name its vibe, roast it, draw a story card.
   runs on the device. nothing is uploaded. shared by the site and the app. */
const GC = (() => {
  const near = (r, g, b, bg, tol) => Math.abs(r - bg) <= tol && Math.abs(g - bg) <= tol && Math.abs(b - bg) <= tol;
  function loadImg(src){ return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
  /* find the 3-column grid: thin background seams at about 1/3 and 2/3 of the width, rows split by thin full-width seams */
  function findGrid(im){
    const W = im.naturalWidth || im.width, H = im.naturalHeight || im.height; if (W < 240 || H < 300) return null;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data, px = (x, y) => (y * W + x) * 4;
    // theme: light (white) or dark (black) from the top band
    let lum = 0, n = 0; for (let y = Math.round(H*.01); y < H*.06; y += 3) for (let x = 0; x < W; x += 7){ const i = px(x, y); lum += d[i] + d[i+1] + d[i+2]; n++; }
    const guess = lum / n / 3 > 128 ? 255 : 0;
    for (const bg of [guess, 255 - guess]){ const r = scan(bg); if (r) return r; } return null;
    function scan(bg){
    // distance of a pixel from the background colour, 0..255 (jpeg and downscaled screenshots blur the thin seams, so compare with neighbours too)
    const bd = (x, y) => { const i = px(x, y); return Math.max(Math.abs(d[i]-bg), Math.abs(d[i+1]-bg), Math.abs(d[i+2]-bg)); };
    const k = Math.max(2, Math.round(W / 400));
    const seamAt = (x, y) => { const v = bd(x, y); if (v < 26) return true; const l = x - k >= 0 ? bd(x-k, y) : 255, r = x + k < W ? bd(x+k, y) : 255; return v < .55 * Math.min(l, r) && Math.min(l, r) > 40; };
    const rowS = new Float32Array(H); for (let y = 0; y < H; y++){ let s = 0, m = 0; for (let x = 0; x < W; x += 3){ s += bd(x, y); m++; } rowS[y] = s / m; }
    const photoRows = []; for (let y = 0; y < H; y += 2) if (rowS[y] > 40) photoRows.push(y);
    if (photoRows.length < H * .07) return null;
    const seam = frac => { const lo = Math.round(W*(frac-.04)), hi = Math.round(W*(frac+.04)); let best = -1, bx = -1; const sc = [];
      for (let x = lo; x <= hi; x++){ let q = 0; for (let j = 0; j < photoRows.length; j += 2) if (seamAt(x, photoRows[j])) q++; sc.push([x, q]); if (q > best){ best = q; bx = x; } }
      if (best < photoRows.length / 2 * .3) return null;
      const on = sc.filter(s => s[1] >= best * .7 && Math.abs(s[0] - bx) <= 3*k).map(s => s[0]); return [Math.min(...on), Math.max(...on), bx]; };
    const s1 = seam(1/3), s2 = seam(2/3); if (!s1 || !s2) return null;
    const colsX = [[0, s1[0]], [s1[1] + 1, s2[0]], [s2[1] + 1, W]], tw = (colsX[0][1] + (colsX[1][1] - colsX[1][0]) + (colsX[2][1] - colsX[2][0])) / 3;
    if (colsX.some(([a, b]) => Math.abs((b - a) - tw) > tw * .08)) return null;
    // horizontal seams: rows much closer to the background than the rows a few pixels away
    const gapRow = y => rowS[y] < 26 || (y-k >= 0 && y+k < H && rowS[y] < .45 * Math.min(rowS[y-k], rowS[y+k]));
    // seam runs, then rows of posts between them; dark photos in dark mode can look like background, so rows are checked as whole blocks
    const gaps = []; let gs = -1; for (let y = 0; y <= H; y++){ const ok = y < H && gapRow(y); if (ok && gs < 0) gs = y; if (!ok && gs >= 0){ gaps.push([gs, y]); gs = -1; } }
    const isGap = y => gapRow(y);
    const check = (a, h) => { if (a < 0 || a + h > H) return false; let seamOk = 0, photo = 0, inner = 0, n = 0, run = 0, maxRun = 0;
      for (let y = a + k*2; y < a + h - k*2; y += 2){ n++; if (seamAt(s1[2], y) && seamAt(s2[2], y)) seamOk++; if (rowS[y] > 30) photo++; if (rowS[y] < 26 && isGap(y)){ inner++; run++; maxRun = Math.max(maxRun, run); } else run = 0; }
      /* a full-width seam inside the box means it straddles two rows of posts (the "stacked photos" bug) */
      return n > 10 && seamOk / n > .6 && photo / n > .7 && inner / n < .04 && maxRun * 2 < Math.max(3, k); };
    let best = null;
    for (const ratio of [4/3, 5/4, 1]){ const h = Math.round(tw * ratio), iv = [];
      for (const [ga, gb] of gaps){ for (const top of [gb, ga - h]){ if (check(top, h) && !iv.some(v => Math.abs(v - top) < h * .5)) iv.push(top); } }
      /* the right tile shape lines up with a seam above AND below every row; a wrong shape only fits one side */
      const near = (v, w) => Math.abs(v - w) <= 2*k, above = top => top <= k*2 || gaps.some(([, gb]) => near(gb, top)), below = top => gaps.some(([ga]) => near(ga, top + h));
      const sc = iv.reduce((acc, top) => acc + (above(top) && below(top) ? 3 : 0), 0);
      if (!best || sc > best.sc) best = { sc, ratio, h, iv: iv.sort((x, y) => x - y) }; }
    const tiles = []; const ratio = best && best.sc > 0 ? best.ratio : null;
    if (ratio){ const hh = best.h, near = (v, w) => Math.abs(v - w) <= 2*k; const rows = best.iv.filter(top => gaps.some(([ga]) => near(ga, top + hh)) && (top <= k*2 || gaps.some(([, gb]) => near(gb, top)))); for (const a of rows) for (const [x0, x1] of colsX) tiles.push({ x:x0, y:a, w:x1 - x0, h:hh }); }
    if (tiles.length < 3) return null;
    const out = tiles.map(t => { const q = Math.min(1, 720 / t.w), cc = document.createElement('canvas'); cc.width = Math.round(t.w * q); cc.height = Math.round(t.h * q);
      cc.getContext('2d').drawImage(c, t.x, t.y, t.w, t.h, 0, 0, cc.width, cc.height); return cc.toDataURL('image/jpeg', .9); });
    return { tiles: out, ratio, theme: bg ? 'light' : 'dark' };
  }}
  /* several screenshots: keep the order, drop posts already seen (a scrolled screenshot repeats rows) */
  const sig = im => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 8, 8); return [...g.getImageData(0,0,8,8).data].filter((_,i) => i%4 !== 3); };
  async function readShots(srcs){
    const all = [], sigs = []; let ratio = null, found = 0;
    for (const s of srcs){ const im = await loadImg(s); if (!im) continue; const r = findGrid(im); if (!r) continue; found++; ratio = ratio || r.ratio;
      for (const t of r.tiles){ const ti = await loadImg(t); const sg = sig(ti); if (sigs.some(o => o.reduce((a,v,i) => a + Math.abs(v - sg[i]), 0) / sg.length < 6)) continue; sigs.push(sg); all.push(t); } }
    return { tiles: all, ratio, found, total: srcs.length };
  }
  const L = () => ((typeof state !== 'undefined' && state.lang) || (typeof lang !== 'undefined' && lang) || 'en') === 'tr' ? 'tr' : 'en';
  const TXT = {
    en: { vibes: {
      quiet:['quiet luxury','calm, expensive, nothing shouts.'], beige:['beige universe','warm neutrals all the way down.'], film:['film roll','warm, a bit grainy, lived in.'],
      mono:['monochrome poet','black and white does the talking.'], night:['night owl','dark, moody, after hours.'], gallery:['gallery white','bright, clean, lots of air.'],
      riot:['colour riot','loud colour, big energy.'], coastal:['coastal blue','cool light, sea air.'], chaos:['cute chaos','fun, but your grid has no plan.'] },
      verdict: ['museum level.','almost there. one post away.','good intentions, mixed results.','this is a camera roll, not a grid.'],
      r: { dark:'post {i} is darker than the rest. looks like it fell in from another account.', bright:'post {i} is so bright it makes the rest look tired.',
        warm:'post {i} got a tan the others didn\'t.', cool:'post {i} is cold. everyone else is in golden hour.', sat:'post {i} is shouting, the rest are whispering.',
        flat:'post {i} looks washed out next to the others.', bwpair:'two black and whites side by side. reads like a newspaper.', accent:'the accent colour is everywhere. that\'s not an accent, that\'s wallpaper.',
        rhythm:'brightness jumps from frame to frame. the grid reads scattered.', great:'someone is screenshotting this grid right now.', good:'one swap and this is a 90.' },
      card:{ top:'grid check', foot:'what does your grid score?', by:'pintertag · your feed\'s art director' },
      challenge:'my grid got {s} and it\'s "{v}". what does yours get? pintertag' },
    tr: { vibes: {
      quiet:['sessiz lüks','sakin, pahalı, hiçbir şey bağırmıyor.'], beige:['bej evren','baştan sona sıcak nötrler.'], film:['film rulosu','sıcak, biraz grenli, yaşanmış.'],
      mono:['monokrom şair','konuşmayı siyah-beyaz yapıyor.'], night:['gece kuşu','karanlık, moody, mesai sonrası.'], gallery:['galeri beyazı','aydınlık, temiz, bol nefes.'],
      riot:['renk isyanı','yüksek renk, yüksek enerji.'], coastal:['kıyı mavisi','serin ışık, deniz havası.'], chaos:['tatlı kaos','eğlenceli ama grid\'inin bir planı yok.'] },
      verdict: ['müze seviyesi.','neredeyse. tek kare uzakta.','iyi niyet, karışık sonuç.','bu grid değil, kamera rulosu.'],
      r: { dark:'{i}. post diğerlerinden karanlık. başka bir hesaptan düşmüş gibi.', bright:'{i}. post o kadar parlak ki geri kalanı yorgun gösteriyor.',
        warm:'{i}. post tek başına güneşte bronzlaşmış.', cool:'{i}. post üşüyor, herkes altın saatte.', sat:'{i}. post bağırıyor, diğerleri fısıldıyor.',
        flat:'{i}. post diğerlerinin yanında solgun kalıyor.', bwpair:'iki siyah-beyaz yan yana. gazete sayfası olmuş.', accent:'vurgu rengi her yerde. vurgu değil, duvar kağıdı olmuş.',
        rhythm:'parlaklık kareden kareye çok değişiyor. grid dağınık görünüyor.', great:'şu an biri bu grid\'in ekran görüntüsünü alıyor.', good:'tek bir değişiklikle bu 90 olur.' },
      card:{ top:'grid puanı', foot:'senin grid\'in kaç alır?', by:'pintertag · feed\'inin sanat yönetmeni' },
      challenge:'grid\'im {s} aldı, "{v}" çıktı. seninki kaç alır? pintertag' }
  };
  const tx = () => TXT[L()];
  const med = a => { const s = [...a].sort((x,y) => x-y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h-1] + s[h]) / 2; };
  function vibeOf(ms){ const ok = ms.filter(Boolean); if (!ok.length) return 'chaos';
    const lum = med(ok.map(m => m.lum)), warm = med(ok.map(m => m.warm)), sat = med(ok.map(m => m.sat)), bw = ok.filter(m => m.sat < .07).length;
    const spread = k => { const v = ok.map(m => m[k]); return Math.max(...v) - Math.min(...v); };
    if (bw >= Math.ceil(ok.length * .45)) return 'mono';
    if (sat > .38 && spread('sat') > .35) return 'riot';
    if (spread('lum') > .55 && spread('warm') > .2) return 'chaos';
    if (lum < .32) return 'night';
    if (warm < -.02) return 'coastal';
    if (lum > .66 && sat < .16) return 'gallery';
    if (warm > .07 && sat < .22) return 'beige';
    if (warm > .05) return 'film';
    return 'quiet'; }
  /* concrete roast lines from what the grid check measured */
  function roastOf(ms, flags, score){ const T = tx().r, out = [], p = i => String(i+1).padStart(2,'0');
    const key = { 'gd.dark':'dark', 'gd.bright':'bright', 'gd.warm':'warm', 'gd.cool':'cool', 'gd.sat':'sat', 'gd.flat':'flat' };
    flags.map((f,i) => f ? {i, f} : null).filter(Boolean).sort((a,b) => b.f.d - a.f.d).slice(0,2).forEach(({i,f}) => { const k = key[f.key]; if (k) out.push(T[k].replace('{i}', p(i))); });
    const bw = ms.map(m => m && m.sat < .07); for (let i = 0; i < ms.length && out.length < 3; i++){ const nb = []; if (i%3 < 2) nb.push(i+1); if (i+3 < ms.length) nb.push(i+3); if (bw[i] && nb.some(j => bw[j])){ out.push(T.bwpair); break; } }
    const acc = ms.filter(m => m && m.vivid > .18).length; if (acc >= 5 && out.length < 3) out.push(T.accent);
    const sg = window.__PT.scoreGrid(ms); if (sg && sg.lsd > 20 && out.length < 3) out.push(T.rhythm);
    if (!out.length) out.push(score >= 90 ? T.great : T.good);
    return out.slice(0, 3); }
  const verdict = s => tx().verdict[s >= 90 ? 0 : s >= 80 ? 1 : s >= 70 ? 2 : 3];
  /* 1080x1920 story card */
  async function card(o){ const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const dark = o.vibe === 'night' || o.vibe === 'mono', bgc = dark ? '#111110' : '#f3efe8', ink = dark ? '#f3efe8' : '#151412', mute = dark ? '#a39e95' : '#6f6a62';
    g.fillStyle = bgc; g.fillRect(0, 0, W, H);
    const sans = '"Helvetica Neue", Helvetica, Arial, sans-serif', serif = '"Instrument Serif", Georgia, "Times New Roman", serif';
    try { await document.fonts.load('400 40px "Instrument Serif"'); await document.fonts.load('italic 40px "Instrument Serif"'); } catch(_){}
    g.fillStyle = mute; g.font = `500 30px ${sans}`; g.textAlign = 'left'; g.fillText(tx().card.top.toUpperCase().split('').join(' '), 90, 262);
    g.textAlign = 'right'; g.fillText(o.date || '', W - 90, 262);
    // score + vibe
    g.textAlign = 'left'; g.fillStyle = ink; g.font = `500 260px ${sans}`; g.fillText(String(o.score), 78, 500);
    const sw = g.measureText(String(o.score)).width; g.fillStyle = mute; g.font = `500 54px ${sans}`; g.fillText('/100', 78 + sw + 18, 500);
    g.fillStyle = ink; g.font = `600 112px ${sans}`; if ("letterSpacing" in g) g.letterSpacing = "-3px"; g.fillText(o.vibeName, 84, 628); if ("letterSpacing" in g) g.letterSpacing = "0px";
    g.fillStyle = mute; g.font = `400 38px ${sans}`; g.fillText(o.vibeLine, 90, 690);
    // the grid: sized so roast and footer always fit below it
    g.font = `400 40px ${sans}`;
    const wrap = (s, maxW) => { const w = s.split(' '), lines = []; let cur = ''; for (const t of w){ const n = cur ? cur + ' ' + t : t; if (g.measureText(n).width > maxW && cur){ lines.push(cur); cur = t; } else cur = n; } if (cur) lines.push(cur); return lines; };
    const rows0 = Math.min(3, Math.ceil(o.tiles.length / 3)), roast = (o.roast || []).slice(0, rows0 > 2 ? 1 : 2).map(l => { const w = wrap(l, W - 220); if (w.length > 2){ w.length = 2; w[1] = w[1].replace(/[\s,;:.]*\S*$/, '') + '…'; } return w; });
    const roastH = roast.reduce((a, l) => a + l.length*52 + 22, 0);
    const rows = Math.min(3, Math.ceil(o.tiles.length / 3)), gap = 6, ratio = o.ratio || 4/3, gy = 750;
    const avail = (H - 440) - gy - 50 - roastH;
    let cw = (W - 180 - 2*gap) / 3, ch = cw * ratio;
    if (rows*(ch+gap) > avail){ ch = (avail - rows*gap) / rows; cw = ch / ratio; }
    const gw = 3*cw + 2*gap, gx = (W - gw) / 2;
    const ims = await Promise.all(o.tiles.slice(0, rows*3).map(loadImg));
    ims.forEach((im, i) => { if (!im) return; const x = gx + (i%3)*(cw+gap), y = gy + Math.floor(i/3)*(ch+gap); const r = Math.max(cw/im.width, ch/im.height), w = cw/r, h = ch/r;
      g.drawImage(im, (im.width-w)/2, (im.height-h)/2, w, h, x, y, cw, ch);
      if (o.flags && o.flags[i]){ g.strokeStyle = '#e0412f'; g.lineWidth = 8; g.strokeRect(x+4, y+4, cw-8, ch-8); g.fillStyle = '#e0412f'; g.beginPath(); g.arc(x + cw - 30, y + 30, 14, 0, 7); g.fill(); } });
    let y = gy + rows*(ch+gap) + 70;
    // roast
    g.font = `400 40px ${sans}`;
    for (const lines of roast){ g.fillStyle = '#e0412f'; g.fillRect(90, y - 22, 10, 10); g.fillStyle = ink; for (const l of lines){ g.fillText(l, 130, y); y += 52; } y += 22; }
    // footer
    // brand lockup: logo + wordmark + handle, kept above Instagram's reply bar so viewers see where it came from
    g.fillStyle = ink; g.font = `500 42px ${sans}`; g.fillText(tx().card.foot, 90, H - 392);
    const logo = await loadImg('assets/logo.png'), by = H - 312;
    if (logo){ g.save(); if (dark) g.filter = 'invert(1)'; g.drawImage(logo, 90, by - 40, 40, 45); g.restore(); }
    g.fillStyle = ink; g.font = `700 46px ${sans}`; if ("letterSpacing" in g) g.letterSpacing = "-1.5px"; g.fillText('pintertag', 138, by); if ("letterSpacing" in g) g.letterSpacing = "0px";
    g.fillStyle = mute; g.font = `500 32px ${sans}`; g.textAlign = 'right'; g.fillText('@pintertag', W - 90, by - 4); g.textAlign = 'left';
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
  }
  const challenge = (score, vibeName) => tx().challenge.replace('{s}', score).replace('{v}', vibeName);
  const vibeText = k => tx().vibes[k] || tx().vibes.chaos;
  return { findGrid, readShots, vibeOf, roastOf, verdict, card, challenge, vibeText, loadImg };
})();
