/* carousel check: score a carousel (2-20 slides) before posting, or pick the best frames from a shoot (up to 40). replaces the "today's pick" tile on home.
   everything is measured on the device from light, colour and detail (PTScore.measure); nothing is uploaded.
   four parts, each out of 10: first slide (does it stop the scroll), one family (do the slides belong together),
   flow (no hard jumps, no twins side by side), last slide (a calm frame or a takeaway to end on).
   it cannot read text or captions, and says so. */
(function(){
  const MAX = 20, SHOOT = 40;
  const css = `.cc-hero{display:flex;align-items:baseline;gap:6px;margin:4px 0 2px}.cc-hero b{font-size:56px;letter-spacing:-2.5px;line-height:1}.cc-hero span{font-size:20px;color:var(--muted)}
.cc-verdict{font-size:16px;margin:0 0 18px}.cc-row{border:1px solid var(--line);border-radius:16px;padding:14px 14px 12px;margin-top:10px}
.cc-row summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:15px}.cc-row summary::-webkit-details-marker{display:none}
.cc-bar{height:5px;border-radius:9px;background:var(--soft);overflow:hidden;margin-top:10px}.cc-bar i{display:block;height:100%;background:currentColor;border-radius:9px}
.cc-row p{font-size:14px;line-height:1.45;margin:10px 0 0;color:var(--muted)}.cc-row p.cc-fix{color:inherit;border-left:2px solid currentColor;padding-left:10px}
.cc-strip{display:flex;gap:6px;overflow-x:auto;padding:4px 0 2px;scrollbar-width:none}.cc-strip figure{margin:0;flex:0 0 64px;position:relative}
.cc-strip img{width:64px;height:80px;object-fit:cover;border-radius:8px;display:block}.cc-strip figcaption{position:absolute;left:4px;top:4px;background:rgba(0,0,0,.72);color:#fff;font-size:11px;font-weight:600;border-radius:99px;min-width:18px;height:18px;line-height:18px;text-align:center;padding:0 4px}
.cc-h{font-size:13px;color:var(--muted);margin:22px 0 6px}.cc-hero-img{display:flex;gap:14px;align-items:flex-start;margin:4px 0 6px}.cc-hero-img img{width:132px;height:165px;object-fit:cover;border-radius:12px;flex:0 0 auto}.cc-why{margin:0;padding:0;list-style:none;font-size:14px;line-height:1.4}.cc-why li{margin:0 0 6px}.cc-why b{font-size:13px;font-weight:600}.cc-skip figure{opacity:.55}.cc-tag{display:block;font-size:10px;color:var(--muted);margin-top:3px;text-align:center;line-height:1.2;white-space:normal;overflow-wrap:anywhere;width:64px}.cc-note{font-size:12px;color:var(--muted);margin-top:16px;line-height:1.4}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', '<input id="pt-cc-input" type="file" accept="image/*" multiple hidden><input id="pt-cc-shoot" type="file" accept="image/*" multiple hidden>');
  const input = document.getElementById('pt-cc-input'), shootIn = document.getElementById('pt-cc-shoot');
  let last = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /* step between two slides: light, colour strength, warmth, busy vs calm; hue only counts when both frames have real colour (grey frames have noisy hue) */
  const near = (x, y) => Math.abs(x.L - y.L) / 20 + Math.abs(x.sat - y.sat) / .15 + Math.abs(x.warm - y.warm) / .1 + PTScore.hd(x, y) * Math.min(x.sat, y.sat) / .3 + Math.abs((x.flat || 0) - (y.flat || 0)) / .35;
  const sdv = a => { const m = a.reduce((t, v) => t + v, 0) / a.length; return Math.sqrt(a.reduce((t, v) => t + (v - m) ** 2, 0) / a.length); };
  const S = n => T(`${n}. kare`, `slide ${n}`);

  function intro(){
    modal(T('karusel ve çekim.', 'carousel & shoot.'), `<p class="edit-subtitle">${T('İki şey yapabilir: karuselini 10 üzerinden puanlar ya da bir çekimden en iyi kareleri seçer.', 'Two things: score a carousel out of 10, or pick the best frames from a shoot.')}</p>
      ${action('pt-cc-pick', T('Karuseli puanla', 'Score a carousel'), 'pill solid wide space')}
      <p class="cc-note">${T(`Kareleri paylaşacağın sırayla seç, en fazla ${MAX}.`, `Pick the slides in posting order, up to ${MAX}.`)}</p>
      ${action('pt-cc-shoot', T('Çekimden en iyisini seç', 'Pick the best from a shoot'), 'pill wide space')}
      <p class="cc-note">${T(`Çekimdeki tüm fotoğrafları seç, en fazla ${SHOOT}. Paylaşılacak tek kareyi ve en iyi 3-4'lü karuseli söyler. Telefonunda ölçülür, hiçbir şey yüklenmez.`, `Pick every photo from the shoot, up to ${SHOOT}. It tells you the one to post and the best 3-4 for a carousel. Measured on your phone; nothing is uploaded.`)}</p>`); }

  /* shrink step by step (never more than 2x per step) so a 4000 px photo and a 400 px one are read alike */
  function shrink(img, tw, th){ let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, src = img;
    while (w > tw * 2 || h > th * 2){ const c = document.createElement('canvas'); c.width = Math.max(tw, Math.round(w / 2)); c.height = Math.max(th, Math.round(h / 2));
      c.getContext('2d').drawImage(src, 0, 0, w, h, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; }
    const o = document.createElement('canvas'); o.width = tw; o.height = th; o.getContext('2d').drawImage(src, 0, 0, w, h, 0, 0, tw, th); return o; }
  async function load(file){
    const url = URL.createObjectURL(file);
    try { const im = new Image(); im.src = url; await im.decode();
      const ar = im.naturalHeight / im.naturalWidth || 1.25, th = c => c.toDataURL('image/jpeg', .82);
      /* fine detail at 320 px: variance of the edge map. a missed focus or shaken frame reads far lower than its neighbours */
      const big = shrink(im, 320, Math.round(320 * ar)), bx = big.getContext('2d').getImageData(0, 0, big.width, big.height).data, W = big.width, H = big.height, G = new Float32Array(W * H);
      for (let i = 0, p = 0; i < bx.length; i += 4, p++) G[p] = .2126 * bx[i] + .7152 * bx[i + 1] + .0722 * bx[i + 2];
      let s1 = 0, s2 = 0, nn = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++){ const i = y * W + x, l = 4 * G[i] - G[i - 1] - G[i + 1] - G[i - W] - G[i + W]; s1 += l; s2 += l * l; nn++; }
      const detail = Math.sqrt(Math.max(0, s2 / nn - (s1 / nn) ** 2));
      /* 12x15 light map for spotting burst shots (same pose, same framing) */
      const lm = shrink(im, 12, 15).getContext('2d').getImageData(0, 0, 12, 15).data, map = []; for (let i = 0; i < lm.length; i += 4) map.push((.2126 * lm[i] + .7152 * lm[i + 1] + .0722 * lm[i + 2]) / 255);
      const mm = map.reduce((t, v) => t + v, 0) / map.length;
      return { m: PTScore.measure(im), thumb: th(shrink(im, 160, Math.round(160 * ar))), big: th(shrink(big, 320, Math.round(320 * ar))), detail, map: map.map(v => v - mm) };
    } finally { URL.revokeObjectURL(url); } }

  /* how hard a frame stops the scroll: punchy light contrast, some colour, and looking different from the rest */
  const hookRaw = (ms, i) => { const m = ms[i], o = ms.filter((_, k) => k !== i);
    const dist = o.length ? o.reduce((t, x) => t + near(m, x), 0) / o.length : 0;
    return m.contrast * 2.2 + m.vivid * 1.2 + Math.min(1, dist / 5) * .6; };
  /* a good closer: calm, empty surface (room to breathe) or a hard-edged takeaway / text slide */
  const endRaw = m => Math.max(clamp((m.flat || 0) * 1.5, 0, 1), clamp((m.txt || 0) * 25, 0, 1));

  function analyse(ms){
    const n = ms.length, idx = ms.map((_, i) => i);
    /* 1. first slide */
    const hr = idx.map(i => hookRaw(ms, i)), best = idx.reduce((a, b) => hr[b] > hr[a] ? b : a, 0);
    let hook = clamp(Math.round(2 + (hr[0] - .45) / .55 * 8), 2, 10);
    const hookSwap = best !== 0 && hr[best] > hr[0] + .15; if (hookSwap) hook = Math.min(hook, 7);
    /* 2. one family */
    /* nov 25: fitted on 116 sets: 54 curated boards and brand grids (good) against 62 random mixes of the same frames (bad).
       three signals separate them (leave-one-out AUC 0.90): how many unrelated hue families, how much the warmth jumps,
       and how much calm frames are mixed with busy ones. light level spread did not matter. */
    const P = [0,0,0,0,0,0,0,0]; let pt = 1e-9; ms.forEach(m => m.hist.forEach((v, k) => { P[k] += v * m.sat; pt += v * m.sat; }));
    const ent = -P.map(v => v / pt).filter(v => v > 0).reduce((t, q) => t + q * Math.log(q), 0) / Math.log(8);
    const zf = { hue: (ent - .6309) / .1369, warm: (sdv(ms.map(m => m.warm)) - .0427) / .0279, busy: (sdv(ms.map(m => m.sharp)) - .0415) / .0176 };
    /* brand and personal are fitted apart (brand: 31 curated brand boards, personal: 49 creator grids, each against the 62 mixes).
       personal accounts are allowed more warmth and calm/busy variety (a selfie, a room, a detail); brands are held tighter. */
    const FW = (typeof state !== 'undefined' && state.mode === 'personal') ? { hue: 1.28, warm: .59, busy: .57, b: -.08 } : { hue: 1.0, warm: 1.39, busy: 1.25, b: -.98 };
    const famP = 1 / (1 + Math.exp(-(-FW.hue * zf.hue - FW.warm * zf.warm - FW.busy * zf.busy + FW.b)));
    const fam = clamp(Math.round(2 + 8 * famP), 2, 10), famWhy = ['hue', 'warm', 'busy'].reduce((a, k) => zf[k] * FW[k] > zf[a] * FW[a] ? k : a, 'hue');
    const avgD = idx.map(i => idx.filter(k => k !== i).reduce((t, k) => t + near(ms[i], ms[k]), 0) / (n - 1));
    const med = avgD.slice().sort((a, b) => a - b)[Math.floor(n / 2)], odd = idx.reduce((a, b) => avgD[b] > avgD[a] ? b : a, 0);
    const famOdd = n > 2 && avgD[odd] > med * 1.35 && avgD[odd] > 3 ? odd : -1;
    /* 3. flow */
    const steps = idx.slice(1).map(i => near(ms[i - 1], ms[i]));
    const jumps = steps.map((d, k) => d > 5 ? k + 1 : -1).filter(k => k > 0), twins = steps.map((d, k) => d < .8 ? k + 1 : -1).filter(k => k > 0);
    const pen = steps.reduce((t, d) => t + Math.max(0, d - 3.5) * .8 + (d < .8 ? 1.2 : 0), 0) / Math.max(1, steps.length);
    /* the same photo twice anywhere in the set (not only side by side) */
    const dups = []; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) if (near(ms[i], ms[j]) < .5) dups.push([i + 1, j + 1]);
    let flow = clamp(Math.round(10 - pen * 4.5), 2, 10); if (jumps.length || twins.length || dups.length) flow = Math.min(flow, 7);
    /* 4. last slide */
    const er = ms.map(endRaw), endBest = idx.slice(1).reduce((a, b) => er[b] > er[a] ? b : a, n - 1);
    let end = clamp(Math.round(3 + er[n - 1] * 7), 2, 10); const endSwap = endBest !== n - 1 && er[endBest] > er[n - 1] + .2;
    /* a better order: strongest stopper first, the best closer last, and in between each next slide a clear but gentle step */
    const first = hookSwap ? best : 0, lastI = endSwap && endBest !== first ? endBest : (n - 1 !== first ? n - 1 : -1);
    const order = [first], left = new Set(idx.filter(i => i !== first && i !== lastI));
    while (left.size){ const cur = ms[order[order.length - 1]]; let pick = -1, bd = 1e9;
      left.forEach(i => { const d = Math.abs(near(cur, ms[i]) - 2.5); if (d < bd){ bd = d; pick = i; } }); order.push(pick); left.delete(pick); }
    if (lastI >= 0) order.push(lastI);
    /* one family carries half the score: in the fit it was the only part that told curated sets from random mixes */
    const total = Math.round((hook + fam * 3 + flow + end) / 6 * 10) / 10;
    return { n, hook, hookSwap, best, fam, famWhy, famOdd, dups, flow, jumps, twins, end, endSwap, endBest, order, total, changed: order.some((v, i) => v !== i) }; }

  function verdict(t, low){ return t >= 8.5 && low >= 8 ? T('Paylaşmaya hazır.', 'Ready to post.') : t >= 7 ? T('Güçlü. Bir iki dokunuş kaldı.', 'Strong. One or two touches away.') : t >= 5 ? T('Kareler iyi, henüz birlikte çalışmıyor.', 'Good slides, not working together yet.') : T('Bu haliyle kaydırılıp geçilir.', 'As it is, people will scroll past.'); }

  function row(title, score, why, fix, open){
    return `<details class="cc-row"${open ? ' open' : ''}><summary><span>${title}</span><span>${score}/10</span></summary><div class="cc-bar"><i style="width:${score * 10}%"></i></div><p>${why}</p>${fix ? `<p class="cc-fix">${fix}</p>` : ''}</details>`; }

  function show(r, slides){
    const hookWhy = r.hookSwap ? T('Kapağın fena değil ama içeride daha çok durduran bir kare var.', 'Your cover works, but there is a slide inside that stops the scroll harder.') : r.hook >= 8 ? T('İlk kare güçlü: ışık kontrastı ve renk dikkat çekiyor.', 'The first slide is strong: its light contrast and colour grab attention.') : T('İlk kare akışta kaybolabilir: kontrastı düşük ya da diğerlerine çok benziyor.', 'The first slide can get lost in the feed: low contrast, or too similar to the rest.');
    const hookFix = r.hookSwap ? T(`${r.best + 1}. kareyi başa al. En çok durduran kare o.`, `Move ${S(r.best + 1)} to the front. It is the one that stops the scroll.`) : r.hook < 7 ? T('Kapak için daha net, daha kontrastlı bir kare seç ya da ilk kareyi yakından kadrajla.', 'Pick a sharper, higher-contrast frame for the cover, or crop the first slide closer.') : '';
    const famWhy = r.famOdd >= 0 ? T('Karelerin çoğu aynı renk ailesinde, biri hariç.', 'Most slides sit in one colour family, except one.') : r.fam >= 7 ? T('Kareler aynı renk ailesinde, tek bir hikâye gibi duruyor.', 'The slides sit in one colour family and read as one story.') : T('Renkler ve ışık kareden kareye çok değişiyor.', 'Colour and light change a lot from slide to slide.');
    const famFix = r.famOdd >= 0 ? T(`${S(r.famOdd + 1)} ailenin dışında kalıyor. Rengini diğerlerine yaklaştır ya da çıkar.`, `${S(r.famOdd + 1)} breaks the family. Edit its colour closer to the others, or drop it.`) : r.fam < 7 ? ({ hue: T('Çok fazla renk ailesi var. Bir ana renk ve bir vurgu rengiyle sınırla.', 'Too many colour families. Keep to one main colour and one accent.'), warm: T('Sıcaklık kareden kareye zıplıyor. Hepsine aynı beyaz dengesini ver.', 'Warmth jumps from slide to slide. Give them all the same white balance.'), busy: T('Sakin ve kalabalık kareler karışık. Ya hepsini sadeleştir ya kalabalığı bir iki kareyle sınırla.', 'Calm and busy slides are mixed. Simplify them, or keep the busy ones to one or two.') })[r.famWhy] : '';
    const flowWhy = r.flow >= 8 && !r.jumps.length && !r.twins.length && !r.dups.length ? T('Her kare bir sonrakine yumuşak geçiyor.', 'Each slide hands over smoothly to the next.') : T('Akışta sert geçişler ya da yan yana ikiz kareler var.', 'The flow has hard jumps or near-twins side by side.');
    const flowFix = [r.jumps.length ? T(`${r.jumps.map(k => `${k}→${k + 1}`).join(', ')} arası sert bir geçiş.`, `Hard jump between ${r.jumps.map(k => `${k}→${k + 1}`).join(', ')}.`) : '',
      r.twins.length ? T(`${r.twins.map(k => `${k} ve ${k + 1}`).join(', ')} neredeyse aynı; birini çıkar ya da araya başka kare koy.`, `${r.twins.map(k => `${k} and ${k + 1}`).join(', ')} are near-twins; drop one or put another slide between them.`) : '',
      r.dups.length ? T(`${r.dups.map(([a, b]) => `${a} ve ${b}`).join(', ')} aynı fotoğraf gibi; birini çıkar.`, `${r.dups.map(([a, b]) => `${a} and ${b}`).join(', ')} look like the same photo; drop one.`) : ''].filter(Boolean).join(' ');
    const endWhy = r.end >= 7 ? T('Son kare sakin ya da net bir mesajla kapanıyor; kaydetmek için iyi bir an.', 'The last slide closes calmly or with a clear takeaway: a good moment to save.') : T('Son kare yoğun; karusel bitmiş gibi hissettirmiyor.', 'The last slide is busy; the carousel doesn’t feel finished.');
    const endFix = r.endSwap ? T(`${S(r.endBest + 1)} ile bitir: daha sakin, daha iyi bir kapanış.`, `End on ${S(r.endBest + 1)}: calmer, a better close.`) : r.end < 7 ? T('Sonuna boşluğu bol bir kare ya da tek cümlelik bir özet kare ekle.', 'Add a closing slide with lots of empty space, or a one-line takeaway.') : '';
    const strip = ids => `<div class="cc-strip">${ids.map(i => `<figure><img src="${slides[i].thumb}" alt=""><figcaption>${i + 1}</figcaption></figure>`).join('')}</div>`;
    const weakest = Math.min(r.hook, r.fam, r.flow, r.end), wk = weakest >= 9 ? '' : ['hook', 'fam', 'flow', 'end'].find(k => r[k] === weakest);
    modal(T('karusel puanı.', 'carousel score.'), `<div class="cc-hero"><b>${r.total.toFixed(1)}</b><span>/10</span></div><p class="cc-verdict">${verdict(r.total, weakest)}</p>
      ${row(T('İlk kare', 'First slide'), r.hook, hookWhy, hookFix, wk === 'hook')}
      ${row(T('Bütünlük', 'One family'), r.fam, famWhy, famFix, wk === 'fam')}
      ${row(T('Akış', 'Flow'), r.flow, flowWhy, flowFix, wk === 'flow')}
      ${row(T('Son kare', 'Last slide'), r.end, endWhy, endFix, wk === 'end')}
      <p class="cc-h">${T('Şu anki sıran', 'Your order')}</p>${strip(slides.map((_, i) => i))}
      ${r.changed ? `<p class="cc-h">${T('Önerilen sıra', 'Suggested order')}</p>${strip(r.order)}` : `<p class="cc-h">${T('Sıran zaten en iyisi.', 'Your order is already the best one.')}</p>`}
      <p class="cc-note">${state.mode === 'personal' ? T('Kişisel hesap olarak puanlandı: daha çok çeşitliliğe izin verilir.', 'Scored as a personal account: more variety is allowed.') : T('Marka hesabı olarak puanlandı: bütünlük daha sıkı tutulur.', 'Scored as a brand account: one family is held tighter.')} ${T('Işık, renk ve detaydan ölçülür. Yazıları ve caption’ı okuyamaz; metnin gücünü sen değerlendir.', 'Measured from light, colour and detail. It can’t read your text or caption; judge the words yourself.')}</p>
      ${action('pt-cc-pick', T('Başka karusel puanla', 'Check another carousel'), 'pill solid wide space')}`); }

  /* ---------- pick the best from a shoot ----------
     not a viral prediction (nobody can promise that from pixels). it ranks every frame on three things we can measure:
     stop power (light contrast and colour punch), craft (in focus compared with the rest of the shoot, not too dark or blown out)
     and, when the grid has photos, how well it sits with the feed. burst shots of the same pose are grouped and only the best one stays. */
  function shootPick(sl){
    const n = sl.length, ms = sl.map(x => x.m), idx = ms.map((_, i) => i);
    const med = sl.map(x => x.detail).sort((a, b) => a - b)[Math.floor(n / 2)] || 1;
    const grid = (typeof simpleIds === 'function' ? simpleIds().slice(0, 9).map(simplePhoto) : []).filter(p => p && p.m && p.m.hist).map(p => p.m);
    const stopRaw = ms.map(m => m.contrast * 2.2 + m.vivid * 1.2);
    const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; o.forEach(([, i], k) => r[i] = n > 1 ? k / (n - 1) : 1); return r; };
    const stopN = rank(stopRaw);
    const flags = idx.map(() => []), qual = idx.map(i => { const m = ms[i], d = sl[i].detail / med; let q = clamp(d, 0, 1.2) / 1.2;
      if (d < .6) flags[i].push('blur'); if (m.L < 18) { q -= .3; flags[i].push('dark'); } if (m.L > 88 && m.bwx > .3) { q -= .3; flags[i].push('bright'); } return clamp(q, 0, 1); });
    const fitN = grid.length >= 3 ? ms.map(m => 1 - clamp((grid.reduce((t, g) => t + near(m, g), 0) / grid.length - 1.5) / 4, 0, 1)) : null;
    const score = idx.map(i => Math.round(100 * (fitN ? .4 * stopN[i] + .4 * qual[i] + .2 * fitN[i] : .5 * stopN[i] + .5 * qual[i])));
    /* burst groups: same framing (12x15 light map) and same colour */
    const par = idx.slice(), find = i => par[i] === i ? i : (par[i] = find(par[i]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){ const md = sl[i].map.reduce((t, v, k) => t + Math.abs(v - sl[j].map[k]), 0) / sl[i].map.length;
      if (md < .055 && near(ms[i], ms[j]) < 1.5) par[find(j)] = find(i); }
    const groups = {}; idx.forEach(i => (groups[find(i)] ||= []).push(i));
    const dupOf = {}; Object.values(groups).forEach(g => { g.sort((a, b) => score[b] - score[a]); g.slice(1).forEach(i => { dupOf[i] = g[0]; flags[i].push('dup'); }); });
    const keep = idx.filter(i => dupOf[i] === undefined && !flags[i].includes('blur')).sort((a, b) => score[b] - score[a]);
    const top = keep.length ? keep[0] : idx.slice().sort((a, b) => score[b] - score[a])[0];
    /* best carousel: start from the top frame, add the frame that keeps the set one family and scores best, up to 4 */
    /* looks: one outfit / one location reads as one set of colours (background + clothes). average-linkage clustering on the
       slide distance; a carousel is built inside one look only, so two outfits are never mixed in one post */
    const looks = (() => { let cl = idx.map(i => [i]); const dist = (A, B) => { let t = 0; A.forEach(i => B.forEach(j => t += near(ms[i], ms[j]))); return t / (A.length * B.length); };
      for (;;){ let ba = -1, bb = -1, bd = 1e9; for (let a = 0; a < cl.length; a++) for (let b = a + 1; b < cl.length; b++){ const d = dist(cl[a], cl[b]); if (d < bd){ bd = d; ba = a; bb = b; } }
        if (ba < 0 || bd > 3.2) break; cl[ba] = cl[ba].concat(cl[bb]); cl.splice(bb, 1); }
      return cl; })();
    const famMin = (typeof state !== 'undefined' && state.mode === 'personal') ? 6 : 7;
    const build = pool => { const p = pool.slice().sort((a, b) => score[b] - score[a]); if (p.length < 3) return null; const set = [p[0]];
      while (set.length < 4){ let bi = -1, bv = -1;
        p.filter(i => !set.includes(i)).forEach(i => { const a = analyse([...set, i].map(k => ms[k])), v = score[i] / 100 + a.fam / 10 * 1.5; if ((set.length < 2 || a.fam >= famMin) && v > bv){ bv = v; bi = i; } });
        if (bi < 0) break; set.push(bi); }
      if (set.length < 3) return null; const a = analyse(set.map(k => ms[k])), ids = a.order.map(k => set[k]); return { ids, r: analyse(ids.map(k => ms[k])) }; };
    const cars = looks.map(g => build(g.filter(i => keep.includes(i)))).filter(Boolean).sort((a, b) => b.r.total - a.r.total).slice(0, 2);
    const lookOf = {}; looks.forEach((g, k) => g.forEach(i => lookOf[i] = k));
    return { top, score, stopN, qual, fitN, flags, dupOf, keep, cars, looks: looks.length, grid: !!fitN };
  }

  function showShoot(p, sl){
    const i = p.top, why = [];
    if (p.stopN[i] >= .75) why.push(T('Çekimdeki en güçlü kontrast ve renk: akışta durduran kare bu.', 'The strongest contrast and colour in the shoot: the frame that stops the scroll.'));
    if (p.qual[i] >= .85) why.push(T('Benzerleri arasında en net olanı.', 'The sharpest of its look-alikes.'));
    if (p.fitN && p.fitN[i] >= .7) why.push(T('Grid’indeki renklerle uyumlu; feed’e oturur.', 'Sits with the colours already on your grid.'));
    if (!why.length) why.push(T('Netlik, ışık ve dikkat çekme dengesi en iyi olan kare.', 'The best balance of focus, light and stopping power in this shoot.'));
    const tag = k => ({ blur: T('bulanık', 'blurry'), dark: T('karanlık', 'too dark'), bright: T('patlamış', 'blown out'), dup: T('ikizi:', 'twin of') })[k];
    const fig = (k, extra = '') => `<figure><img src="${sl[k].thumb}" alt=""><figcaption>${k + 1}</figcaption>${extra}</figure>`;
    const ranked = p.keep.slice(0, 12), skip = sl.map((_, k) => k).filter(k => p.flags[k].length);
    modal(T('çekimin en iyisi.', 'best of your shoot.'), `<p class="cc-h" style="margin-top:0">${T('Bunu paylaş', 'Post this one')}</p>
      <div class="cc-hero-img"><img src="${sl[i].big}" alt=""><ul class="cc-why"><li><b>${i + 1}. ${T('kare', 'photo')} · ${p.score[i]}/100</b></li>${why.map(w => `<li>${w}</li>`).join('')}</ul></div>
      ${p.cars.length ? p.cars.map((c, k) => `<p class="cc-h">${p.cars.length > 1 ? T(`Karusel ${k + 1} · tek look · ${c.ids.length} kare, bu sırayla`, `Carousel ${k + 1} · one look · ${c.ids.length} photos, in this order`) : T(`En iyi karusel · ${c.ids.length} kare, bu sırayla`, `Best carousel · ${c.ids.length} photos, in this order`)}</p><div class="cc-strip">${c.ids.map(i => fig(i)).join('')}</div>
        <p class="cc-note" style="margin-top:6px">${T(`Karusel puanı ${c.r.total.toFixed(1)}/10.`, `Carousel score ${c.r.total.toFixed(1)}/10.`)}</p>`).join('') + (p.cars.length > 1 ? `<p class="cc-note">${T('Çekimde iki ayrı look var: aynı karusele karıştırma, iki ayrı post yap.', 'This shoot has two looks: don’t mix them in one carousel, make two posts.')}</p>` : '') : `<p class="cc-note">${T('Karusel için aynı look’tan en az 3 net kare çıkmadı.', 'There weren’t 3 sharp frames from one look for a carousel.')}</p>`}
      ${ranked.length > 1 ? `<p class="cc-h">${T('Sıralama', 'Ranking')}</p><div class="cc-strip">${ranked.map(k => fig(k, `<span class="cc-tag">${p.score[k]}</span>`)).join('')}</div>` : ''}
      ${skip.length ? `<p class="cc-h">${T('Bunları geç', 'Skip these')}</p><div class="cc-strip cc-skip">${skip.map(k => fig(k, `<span class="cc-tag">${p.flags[k].map(f => f === 'dup' ? tag(f) + ' ' + (p.dupOf[k] + 1) : tag(f)).join(' · ')}</span>`)).join('')}</div>` : ''}
      <p class="cc-note">${T('Viral olacağını kimse pikselden garanti edemez. Bu, akışta durdurma gücü en yüksek, net ve feed’ine uyan kareleri seçer.', 'No one can promise viral from pixels. This picks the frames with the most stopping power that are sharp and fit your feed.')} ${p.grid ? '' : T('Grid’ine fotoğraf eklersen feed uyumuna da bakar.', 'Add photos to your grid and it will check feed fit too.')}</p>
      ${action('pt-cc-shoot', T('Başka çekim seç', 'Check another shoot'), 'pill solid wide space')}`); }

  shootIn.addEventListener('change', async () => {
    const all = [...shootIn.files].filter(f => /^image\//.test(f.type)), files = all.slice(0, SHOOT); shootIn.value = '';
    if (files.length < 2){ toast(T('En az 2 fotoğraf seç.', 'Pick at least 2 photos.')); return; }
    if (all.length > SHOOT) toast(T(`İlk ${SHOOT} fotoğraf alındı.`, `Took the first ${SHOOT} photos.`));
    const sl = []; for (let k = 0; k < files.length; k++){ modal(T('çekim okunuyor.', 'reading your shoot.'), `<p class="edit-subtitle">${T(`${k + 1}/${files.length} fotoğraf ölçülüyor…`, `Measuring photo ${k + 1} of ${files.length}…`)}</p>`); try { sl.push(await load(files[k])); } catch (e) {} }
    if (sl.length < 2){ modal(T('fotoğraflar açılamadı.', 'couldn’t open the photos.'), `<p class="edit-subtitle">${T('JPG ya da PNG olarak tekrar dene.', 'Try again with JPG or PNG photos.')}</p>${action('pt-cc-shoot', T('Tekrar seç', 'Pick again'), 'pill solid wide space')}`); return; }
    showShoot(shootPick(sl), sl); });

  input.addEventListener('change', async () => {
    const files = [...input.files].filter(f => /^image\//.test(f.type)).slice(0, MAX); input.value = '';
    if (files.length < 2){ toast(T('En az 2 kare seç.', 'Pick at least 2 slides.')); return; }
    if (input.files && input.files.length > MAX) toast(T(`İlk ${MAX} kare alındı.`, `Took the first ${MAX} slides.`));
    modal(T('karusel okunuyor.', 'reading your carousel.'), `<p class="edit-subtitle">${T(`${files.length} kare ölçülüyor…`, `Measuring ${files.length} slides…`)}</p>`);
    const slides = []; for (const f of files){ try { slides.push(await load(f)); } catch (e) {} }
    if (slides.length < 2){ modal(T('kareler açılamadı.', 'couldn’t open the slides.'), `<p class="edit-subtitle">${T('Fotoğrafları JPG ya da PNG olarak tekrar dene.', 'Try again with JPG or PNG photos.')}</p>${action('pt-cc-pick', T('Tekrar seç', 'Pick again'), 'pill solid wide space')}`); return; }
    last = { slides, r: analyse(slides.map(s => s.m)) }; show(last.r, slides); });

  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pt-carousel-open'){ e.stopPropagation(); intro(); }
    if (a === 'pt-cc-pick') input.click();
    if (a === 'pt-cc-shoot') shootIn.click(); });
  window.PTCarousel = { analyse, intro, shootPick };
})();
