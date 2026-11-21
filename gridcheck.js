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
    if (ratio){ const hh = best.h, near = (v, w) => Math.abs(v - w) <= 2*k; const rows = best.iv.filter(top => gaps.some(([ga]) => near(ga, top + hh)) && (top <= k*2 || gaps.some(([, gb]) => near(gb, top))));
      /* rows next to a confirmed one whose own edge is hidden (tab underline above, pin icons, the bar below) still count:
         step from the confirmed rows by one row height and keep any full row that checks out */
      if (rows.length){ rows.sort((x, y) => x - y); const seamH = rows.length > 1 ? Math.max(1, Math.min(...rows.slice(1).map((v, i) => v - rows[i])) - hh) : Math.max(2, Math.round(tw * .006)), step = hh + seamH;
        const fits = t => [0, -1, 1, -2, 2, -3, 3].map(d => t + d).find(tt => check(tt, hh));
        for (let t = rows[0] - step; t >= 0; t -= step){ const f = fits(t); if (f === undefined) break; rows.unshift(f); t = f; }
        for (let t = rows[rows.length - 1] + step; t + hh <= H; t += step){ const f = fits(t); if (f === undefined) break; rows.push(f); t = f; } }
      /* fewer than 3 full rows: the screenshot cut a row at the top (under the profile header) or the bottom (under the tab bar).
         take the cut row if at least half of it shows; the top one first, those are the newest posts */
      const spans = rows.map(a => [a, hh]);
      if (rows.length){ const seam = Math.max(2, Math.round(tw * .006));
        const part = (a, h) => { if (h < hh * .5) return false; let photo = 0, n = 0; for (let y = a + k; y < a + h - k; y += 2){ n++; if (rowS[y] > 30 && seamAt(s1[2], y) && seamAt(s2[2], y)) photo++; } return n > 8 && photo / n > .6; };
        /* the newest row is usually the one cut by the screen edge or the header: keep it when most of it shows (any number of full rows below) */
        const topEnd = rows[0] - seam; let tStart = 0; for (const [ga, gb] of gaps) if (gb < topEnd - hh * .5 && gb > tStart) tStart = gb;
        if (topEnd - tStart >= hh * (rows.length < 3 ? .5 : .7) && part(tStart, topEnd - tStart)) spans.unshift([tStart, topEnd - tStart]);
        if (spans.length < 3){ const bStart = rows[rows.length - 1] + hh + seam; let bEnd = Math.min(H, bStart + hh); for (const [ga] of gaps) if (ga > bStart + hh * .5 && ga < bEnd) bEnd = ga;
          if (part(bStart, bEnd - bStart)) spans.push([bStart, bEnd - bStart]); } }
      for (const [a, h] of spans.slice(0, 3)) for (const [x0, x1] of colsX) tiles.push({ x:x0, y:a, w:x1 - x0, h }); }
    if (tiles.length < 3) return null;
    const out = tiles.map(t => { const q = Math.min(1, 720 / t.w), cc = document.createElement('canvas'); cc.width = Math.round(t.w * q); cc.height = Math.round(t.h * q);
      cc.getContext('2d').drawImage(c, t.x, t.y, t.w, t.h, 0, 0, cc.width, cc.height); return cc.toDataURL('image/jpeg', .9); });
    return { tiles: out, ratio, theme: bg ? 'light' : 'dark' };
  }}
  /* any image gets a score: when no Instagram grid is found (a moodboard, a collage, a brand board, even one photo),
     trim plain borders and cut it into 3 columns, rows sized by the tile shape that fits best */
  function cutGrid(im){
    const W = im.naturalWidth || im.width, H = im.naturalHeight || im.height; if (W < 90 || H < 90) return null;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data, px = (x, y) => (y * W + x) * 4;
    const ref = [d[0], d[1], d[2]], plain = (x0, y0, x1, y1) => { let n = 0, off = 0; for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3){ const i = px(x, y); n++; if (Math.abs(d[i]-ref[0]) + Math.abs(d[i+1]-ref[1]) + Math.abs(d[i+2]-ref[2]) > 40) off++; } return off / Math.max(1, n) < .02; };
    let t = 0, b = H, l = 0, r = W; while (t < H * .3 && plain(0, t, W, t + 4)) t += 4; while (b > H * .7 && plain(0, b - 4, W, b)) b -= 4; while (l < W * .3 && plain(l, t, l + 4, b)) l += 4; while (r > W * .7 && plain(r - 4, t, r, b)) r -= 4;
    const w = r - l, h = b - t, cw = w / 3; let best = null;
    for (const ratio of [4/3, 5/4, 1]){ const rows = h / (cw * ratio), k = Math.max(1, Math.round(rows)), err = Math.abs(rows - k) / k; if (!best || err < best.err) best = { ratio, k, err }; }
    const rows = Math.min(3, best.k), ch = h / best.k, tiles = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j < 3; j++){ const x = l + j * cw, y = t + i * ch, q = Math.min(1, 720 / cw), cc = document.createElement('canvas'); cc.width = Math.round(cw * q); cc.height = Math.round(ch * q);
      cc.getContext('2d').drawImage(c, x, y, cw, ch, 0, 0, cc.width, cc.height); tiles.push(cc.toDataURL('image/jpeg', .9)); }
    return { tiles, ratio: best.ratio, theme: 'light', cut: true };
  }
  /* several screenshots: keep the order, drop posts already seen (a scrolled screenshot repeats rows) */
  const sig = im => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 8, 8); return [...g.getImageData(0,0,8,8).data].filter((_,i) => i%4 !== 3); };
  async function readShots(srcs){
    const all = [], sigs = []; let ratio = null, found = 0;
    for (const s of srcs){ const im = await loadImg(s); if (!im) continue; const r = findGrid(im) || cutGrid(im); if (!r) continue; found++; ratio = ratio || r.ratio;
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
    const sg = (window.PTScore || window.__PT).scoreGrid(ms); if (sg && sg.lsd > 20 && out.length < 3) out.push(T.rhythm);
    if (!out.length) out.push(score >= 90 ? T.great : T.good);
    return out.slice(0, 3); }
  const verdict = s => tx().verdict[s >= 90 ? 0 : s >= 80 ? 1 : s >= 70 ? 2 : 3];
  /* 1080x1920 story card: everything centred on one axis, the 9 posts on a white sheet,
     three backgrounds (pink default). kept inside Instagram's safe zone (top ~250, bottom ~340). */
  const THEMES = {
    pink:  { bg: '#F5CCD6', bg2: '#F9DDE3', ink: '#1B1214', mute: '#8A5560', sheet: '#ffffff', dot: '#D7263D' },
    cream: { bg: '#EFE9DF', bg2: '#F6F2EB', ink: '#151412', mute: '#6F6A62', sheet: '#ffffff', dot: '#D7263D' },
    black: { bg: '#121211', bg2: '#1C1C1A', ink: '#F3EFE8', mute: '#A39E95', sheet: '#232321', dot: '#FF5A6E' }
  };
  /* one line per grid: picked by score band, varied by the grid itself so two grids rarely get the same one */
  const LINES = {
    tr: [
      ['bu grid’i kaydedip moodboard’a koyuyorlar.','profiline girenler takip etmeden çıkamıyor.','bu feed’in sanat yönetmeni var gibi.','her kare yerini bilmiş, kimse kimseyi ezmiyor.','burası grid değil, sergi.','scroll’u yavaşlatan cinsten.','tek kelime: tutarlı. iki kelime: çok tutarlı.','bu grid’e ekran görüntüsü alınır.','renkler aynı dili konuşuyor.','şu an biri bu grid’i arkadaşına atıyor.'],
      ['bir kare daha düzelirse müze olur.','neredeyse kusursuz, bir post fazla bağırıyor.','çok iyi, ama bir kare yanlış partiye gelmiş.','ritim tutuyor, sadece bir yerde tökezliyor.','takip ettirir. bir kareyi değiştir, kaydettirir.','sakin ve güçlü. birini öne al, tamam.','iyi göz, eksik son dokunuş.','buradan sonrası detay işi.','profil temiz, bir kare kendi kafasında.','neredeyse estetik hesap seviyesi.'],
      ['iyi niyet var, plan yok.','güzel kareler, birbirini tanımıyor.','her post tek başına iyi, birlikte kalabalık.','bu grid bir toplantı, herkes aynı anda konuşuyor.','ışık bir sağa bir sola, göz yoruluyor.','potansiyel var, sıralama yok.','bir kahve molası verip baştan dizelim.','renkler anlaşamamış.','iyi bir başlangıç, kötü bir sıralama.','sıralarsan bambaşka bir hesap olur.'],
      ['bu grid değil, galeri klasörü.','her kare farklı bir hesaptan gelmiş gibi.','feed’in şu an “fark etmez” diyor.','burada herkes başrol oynamak istiyor.','renkler kavga ediyor, kazanan yok.','kamera rulosu modunda.','derin nefes. bunu toparlarız.','bu hesabın bir sanat yönetmenine ihtiyacı var.','takipçi gelir ama kalmaz.','iyi haber: düzeltmesi 5 dakika.']
    ],
    en: [
      ['people are saving this grid to their moodboards.','nobody leaves this profile without following.','this feed clearly has an art director.','every post knows its place.','this isn’t a grid, it’s a gallery.','the kind of grid that slows the scroll.','one word: consistent. two words: very consistent.','this grid gets screenshotted.','the colours speak the same language.','someone is sending this grid to a friend right now.'],
      ['fix one post and it’s museum level.','almost perfect, one post is shouting.','great, but one post came to the wrong party.','the rhythm holds, it trips once.','it gets follows. swap one, it gets saves.','calm and strong. move one up and done.','good eye, missing the last touch.','from here it’s all details.','clean profile, one post has its own plans.','almost aesthetic-account level.'],
      ['good intentions, no plan.','nice posts that have never met.','great alone, crowded together.','this grid is a meeting where everyone talks at once.','the light goes left, then right. eyes get tired.','potential, no order.','coffee break, then we re-arrange.','the colours didn’t agree.','good start, bad order.','sort it and it’s a different account.'],
      ['this isn’t a grid, it’s a camera roll.','every post looks like it’s from another account.','your feed is saying “whatever”.','everyone here wants the lead role.','the colours are fighting and nobody wins.','camera roll mode: on.','deep breath. we can fix this.','this account needs an art director.','followers will come, but won’t stay.','good news: it’s a 5-minute fix.']
    ]
  };
  function lineFor(score, tiles){ const band = score >= 90 ? 0 : score >= 80 ? 1 : score >= 70 ? 2 : 3, pool = LINES[L()][band];
    let h = score * 31; (tiles || []).slice(0, 9).forEach(t => { const str = String(t); for (let i = str.length - 1; i > Math.max(0, str.length - 400); i -= 37) h = (h * 33 + str.charCodeAt(i)) >>> 0; });
    return pool[h % pool.length]; }
  async function card(o){ const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const th = THEMES[o.theme] || THEMES.pink, cx = W / 2, sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const bgG = g.createLinearGradient(0, 0, 0, H); bgG.addColorStop(0, th.bg2); bgG.addColorStop(1, th.bg); g.fillStyle = bgG; g.fillRect(0, 0, W, H);
    const ls = v => { if ('letterSpacing' in g) g.letterSpacing = v; };
    // top: brand lockup + date (the only pintertag on the card)
    const logo = await loadImg('assets/logo.png'); g.font = `700 54px ${sans}`; ls('-1.6px'); const ww = g.measureText('pintertag').width; ls('0px');
    const lx = cx - (38 + 14 + ww) / 2, by = 300;
    /* tint the mark in code (Safari ignores canvas filters), same colour as the wordmark, centred on its x-height */
    if (logo){ const t = document.createElement('canvas'); t.width = 68; t.height = 76; const tg = t.getContext('2d'); tg.drawImage(logo, 0, 0, 68, 76); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = th.ink; tg.fillRect(0, 0, 68, 76);
      g.drawImage(t, lx, by - 41, 38, 43); }
    g.textAlign = 'left'; g.fillStyle = th.ink; ls('-1.6px'); g.fillText('pintertag', lx + 52, by); ls('0px');
    // score ring + vibe side by side, centred as one group, above the grid (nothing covers a photo)
    const R = 92, dark = o.theme === 'black', frac = Math.max(0, Math.min(1, o.score / 100));
    const said = o.line || lineFor(o.score, o.tiles), maxTW = W - 120 - 2*R - 36; let fs = 50, rows2 = [];
    for (; fs >= 36; fs -= 2){ g.font = `700 ${fs}px ${sans}`; ls('-1px'); const words = said.split(' '); rows2 = []; let cur = '';
      for (const w of words){ const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxTW && cur){ rows2.push(cur); cur = w; } else cur = t; } if (cur) rows2.push(cur); if (rows2.length <= 2) break; }
    const tw2 = Math.max(...rows2.map(r => g.measureText(r).width)); ls('0px');
    const grpW = 2*R + 36 + tw2, gx = cx - grpW/2, ry = 450;
    g.fillStyle = dark ? '#F3EFE8' : '#151412'; g.beginPath(); g.arc(gx + R, ry, R, 0, 7); g.fill();
    g.lineCap = 'round'; g.lineWidth = 11; g.strokeStyle = dark ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(gx + R, ry, R - 15, 0, 7); g.stroke();
    g.strokeStyle = o.score >= 85 ? '#22B573' : o.score >= 70 ? '#F5A524' : '#F0475B'; g.beginPath(); g.arc(gx + R, ry, R - 15, -Math.PI/2, -Math.PI/2 + frac * Math.PI * 2); g.stroke();
    g.textAlign = 'center'; g.fillStyle = dark ? '#151412' : '#ffffff'; g.font = `700 78px ${sans}`; ls('-3px'); g.fillText(String(o.score), gx + R, ry + 20); ls('0px');
    g.font = `600 20px ${sans}`; g.globalAlpha = .6; g.fillText('/100', gx + R, ry + 50); g.globalAlpha = 1;
    g.textAlign = 'left'; g.fillStyle = th.ink; g.font = `700 ${fs}px ${sans}`; ls('-1px'); const lh = fs * 1.15, y0 = ry - (rows2.length - 1) * lh / 2 + fs * .35;
    rows2.forEach((r, i) => g.fillText(r, gx + 2*R + 36, y0 + i * lh)); ls('0px');
    g.textAlign = 'center';
    // the posts, as big as the space allows
    const n = Math.min(9, o.tiles.length), rows = Math.max(1, Math.ceil(n / 3)), ratio = o.ratio || 4/3, gap = 5, pad = 14, top = 590, maxH = 1700 - top;
    let cw = (W - 120 - 2*pad - 2*gap) / 3, ch = cw * ratio; if (rows*ch + (rows-1)*gap + 2*pad > maxH){ ch = (maxH - 2*pad - (rows-1)*gap) / rows; cw = ch / ratio; }
    const gw = 3*cw + 2*gap, gh = rows*ch + (rows - 1)*gap, sx = cx - gw/2 - pad, sy = top;
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x+r, y); g.arcTo(x+w, y, x+w, y+h, r); g.arcTo(x+w, y+h, x, y+h, r); g.arcTo(x, y+h, x, y, r); g.arcTo(x, y, x+w, y, r); g.closePath(); };
    g.save(); g.shadowColor = 'rgba(0,0,0,.16)'; g.shadowBlur = 44; g.shadowOffsetY = 18; g.fillStyle = th.sheet; rr(sx, sy, gw + 2*pad, gh + 2*pad, 28); g.fill(); g.restore();
    const ims = await Promise.all(o.tiles.slice(0, rows*3).map(loadImg));
    ims.forEach((im, i) => { if (!im) return; const x = sx + pad + (i%3)*(cw+gap), y = sy + pad + Math.floor(i/3)*(ch+gap); const r = Math.max(cw/im.width, ch/im.height), w = cw/r, h = ch/r;
      g.drawImage(im, (im.width-w)/2, (im.height-h)/2, w, h, x, y, cw, ch); });
    // bottom question
    g.fillStyle = th.ink; g.font = `600 44px ${sans}`; ls('-1px'); g.fillText(tx().card.foot, cx, Math.min(1790, sy + gh + 2*pad + 84)); ls('0px');
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
  }
  const challenge = (score, vibeName) => tx().challenge.replace('{s}', score).replace('{v}', vibeName);
  const vibeText = k => tx().vibes[k] || tx().vibes.chaos;
  return { lineFor, findGrid, readShots, vibeOf, roastOf, verdict, card, challenge, vibeText, loadImg };
})();
