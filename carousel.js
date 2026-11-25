/* carousel check: score a carousel (2-20 slides) before posting. replaces the "today's pick" tile on home.
   everything is measured on the device from light, colour and detail (PTScore.measure); nothing is uploaded.
   four parts, each out of 10: first slide (does it stop the scroll), one family (do the slides belong together),
   flow (no hard jumps, no twins side by side), last slide (a calm frame or a takeaway to end on).
   it cannot read text or captions, and says so. */
(function(){
  const MAX = 20;
  const css = `.cc-hero{display:flex;align-items:baseline;gap:6px;margin:4px 0 2px}.cc-hero b{font-size:56px;letter-spacing:-2.5px;line-height:1}.cc-hero span{font-size:20px;color:var(--muted)}
.cc-verdict{font-size:16px;margin:0 0 18px}.cc-row{border:1px solid var(--line);border-radius:16px;padding:14px 14px 12px;margin-top:10px}
.cc-row summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:15px}.cc-row summary::-webkit-details-marker{display:none}
.cc-bar{height:5px;border-radius:9px;background:var(--soft);overflow:hidden;margin-top:10px}.cc-bar i{display:block;height:100%;background:currentColor;border-radius:9px}
.cc-row p{font-size:14px;line-height:1.45;margin:10px 0 0;color:var(--muted)}.cc-row p.cc-fix{color:inherit;border-left:2px solid currentColor;padding-left:10px}
.cc-strip{display:flex;gap:6px;overflow-x:auto;padding:4px 0 2px;scrollbar-width:none}.cc-strip figure{margin:0;flex:0 0 64px;position:relative}
.cc-strip img{width:64px;height:80px;object-fit:cover;border-radius:8px;display:block}.cc-strip figcaption{position:absolute;left:4px;top:4px;background:rgba(0,0,0,.72);color:#fff;font-size:11px;font-weight:600;border-radius:99px;min-width:18px;height:18px;line-height:18px;text-align:center;padding:0 4px}
.cc-h{font-size:13px;color:var(--muted);margin:22px 0 6px}.cc-note{font-size:12px;color:var(--muted);margin-top:16px;line-height:1.4}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', '<input id="pt-cc-input" type="file" accept="image/*" multiple hidden>');
  const input = document.getElementById('pt-cc-input');
  let last = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /* step between two slides: light, colour strength, warmth, busy vs calm; hue only counts when both frames have real colour (grey frames have noisy hue) */
  const near = (x, y) => Math.abs(x.L - y.L) / 20 + Math.abs(x.sat - y.sat) / .15 + Math.abs(x.warm - y.warm) / .1 + PTScore.hd(x, y) * Math.min(x.sat, y.sat) / .3 + Math.abs((x.flat || 0) - (y.flat || 0)) / .35;
  const sdv = a => { const m = a.reduce((t, v) => t + v, 0) / a.length; return Math.sqrt(a.reduce((t, v) => t + (v - m) ** 2, 0) / a.length); };
  const S = n => T(`${n}. kare`, `slide ${n}`);

  function intro(){
    modal(T('karuseli puanla.', 'carousel check.'), `<p class="edit-subtitle">${T('Paylaşmadan önce karuselini 10 üzerinden puanla: ilk kare, bütünlük, akış ve son kare. Nasıl düzelteceğini de söyler.', 'Score your carousel out of 10 before you post: first slide, one family, flow and last slide. It tells you how to fix it, too.')}</p>
      <p class="cc-note">${T(`Kareleri paylaşacağın sırayla seç, en fazla ${MAX}. Telefonunda ölçülür, hiçbir şey yüklenmez.`, `Pick the slides in posting order, up to ${MAX}. Measured on your phone; nothing is uploaded.`)}</p>
      ${action('pt-cc-pick', T('Kareleri seç', 'Pick slides'), 'pill solid wide space')}`); }

  async function load(file){
    const url = URL.createObjectURL(file);
    try { const im = new Image(); im.src = url; await im.decode();
      const c = document.createElement('canvas'), w = 160, h = Math.round(160 * im.naturalHeight / im.naturalWidth) || 200; c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      return { m: PTScore.measure(im), thumb: c.toDataURL('image/jpeg', .8) };
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
    /* spread of light, colour strength, warmth and calm-vs-busy across the slides (fitted on real carousels and random mixes) */
    const spread = (sdv(ms.map(m => m.L)) / 12 + sdv(ms.map(m => m.sat)) / .08 + sdv(ms.map(m => m.warm)) / .06 + sdv(ms.map(m => m.flat || 0)) / .2) / 4;
    const fam = clamp(Math.round(10 - (spread - .55) * 8), 2, 10);
    const avgD = idx.map(i => idx.filter(k => k !== i).reduce((t, k) => t + near(ms[i], ms[k]), 0) / (n - 1));
    const med = avgD.slice().sort((a, b) => a - b)[Math.floor(n / 2)], odd = idx.reduce((a, b) => avgD[b] > avgD[a] ? b : a, 0);
    const famOdd = n > 2 && avgD[odd] > med * 1.35 && avgD[odd] > 3 ? odd : -1;
    /* 3. flow */
    const steps = idx.slice(1).map(i => near(ms[i - 1], ms[i]));
    const jumps = steps.map((d, k) => d > 5 ? k + 1 : -1).filter(k => k > 0), twins = steps.map((d, k) => d < .8 ? k + 1 : -1).filter(k => k > 0);
    const pen = steps.reduce((t, d) => t + Math.max(0, d - 3.5) * .8 + (d < .8 ? 1.2 : 0), 0) / Math.max(1, steps.length);
    const flow = clamp(Math.round(10 - pen * 4.5), 2, 10);
    /* 4. last slide */
    const er = ms.map(endRaw), endBest = idx.slice(1).reduce((a, b) => er[b] > er[a] ? b : a, n - 1);
    let end = clamp(Math.round(3 + er[n - 1] * 7), 2, 10); const endSwap = endBest !== n - 1 && er[endBest] > er[n - 1] + .2;
    /* a better order: strongest stopper first, the best closer last, and in between each next slide a clear but gentle step */
    const first = hookSwap ? best : 0, lastI = endSwap && endBest !== first ? endBest : (n - 1 !== first ? n - 1 : -1);
    const order = [first], left = new Set(idx.filter(i => i !== first && i !== lastI));
    while (left.size){ const cur = ms[order[order.length - 1]]; let pick = -1, bd = 1e9;
      left.forEach(i => { const d = Math.abs(near(cur, ms[i]) - 2.5); if (d < bd){ bd = d; pick = i; } }); order.push(pick); left.delete(pick); }
    if (lastI >= 0) order.push(lastI);
    /* one family counts a little more: a mixed set is what makes a carousel look random */
    const total = Math.round((hook + fam * 1.5 + flow + end) / 4.5 * 10) / 10;
    return { n, hook, hookSwap, best, fam, famOdd, flow, jumps, twins, end, endSwap, endBest, order, total, changed: order.some((v, i) => v !== i) }; }

  function verdict(t, low){ return t >= 8.5 && low >= 7 ? T('Paylaşmaya hazır.', 'Ready to post.') : t >= 7 ? T('Güçlü. Bir iki dokunuş kaldı.', 'Strong. One or two touches away.') : t >= 5 ? T('Kareler iyi, henüz birlikte çalışmıyor.', 'Good slides, not working together yet.') : T('Bu haliyle kaydırılıp geçilir.', 'As it is, people will scroll past.'); }

  function row(title, score, why, fix, open){
    return `<details class="cc-row"${open ? ' open' : ''}><summary><span>${title}</span><span>${score}/10</span></summary><div class="cc-bar"><i style="width:${score * 10}%"></i></div><p>${why}</p>${fix ? `<p class="cc-fix">${fix}</p>` : ''}</details>`; }

  function show(r, slides){
    const hookWhy = r.hookSwap ? T('Kapağın fena değil ama içeride daha çok durduran bir kare var.', 'Your cover works, but there is a slide inside that stops the scroll harder.') : r.hook >= 8 ? T('İlk kare güçlü: ışık kontrastı ve renk dikkat çekiyor.', 'The first slide is strong: its light contrast and colour grab attention.') : T('İlk kare akışta kaybolabilir: kontrastı düşük ya da diğerlerine çok benziyor.', 'The first slide can get lost in the feed: low contrast, or too similar to the rest.');
    const hookFix = r.hookSwap ? T(`${r.best + 1}. kareyi başa al. En çok durduran kare o.`, `Move ${S(r.best + 1)} to the front. It is the one that stops the scroll.`) : r.hook < 7 ? T('Kapak için daha net, daha kontrastlı bir kare seç ya da ilk kareyi yakından kadrajla.', 'Pick a sharper, higher-contrast frame for the cover, or crop the first slide closer.') : '';
    const famWhy = r.famOdd >= 0 ? T('Karelerin çoğu aynı renk ailesinde, biri hariç.', 'Most slides sit in one colour family, except one.') : r.fam >= 7 ? T('Kareler aynı renk ailesinde, tek bir hikâye gibi duruyor.', 'The slides sit in one colour family and read as one story.') : T('Renkler ve ışık kareden kareye çok değişiyor.', 'Colour and light change a lot from slide to slide.');
    const famFix = r.famOdd >= 0 ? T(`${S(r.famOdd + 1)} ailenin dışında kalıyor. Rengini diğerlerine yaklaştır ya da çıkar.`, `${S(r.famOdd + 1)} breaks the family. Edit its colour closer to the others, or drop it.`) : r.fam < 7 ? T('Hepsine aynı düzenlemeyi uygula: aynı sıcaklık, aynı kontrast.', 'Give every slide the same edit: same warmth, same contrast.') : '';
    const flowWhy = r.flow >= 8 ? T('Her kare bir sonrakine yumuşak geçiyor.', 'Each slide hands over smoothly to the next.') : T('Akışta sert geçişler ya da yan yana ikiz kareler var.', 'The flow has hard jumps or near-twins side by side.');
    const flowFix = [r.jumps.length ? T(`${r.jumps.map(k => `${k}→${k + 1}`).join(', ')} arası sert bir geçiş.`, `Hard jump between ${r.jumps.map(k => `${k}→${k + 1}`).join(', ')}.`) : '',
      r.twins.length ? T(`${r.twins.map(k => `${k} ve ${k + 1}`).join(', ')} neredeyse aynı; birini çıkar ya da araya başka kare koy.`, `${r.twins.map(k => `${k} and ${k + 1}`).join(', ')} are near-twins; drop one or put another slide between them.`) : ''].filter(Boolean).join(' ');
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
      <p class="cc-note">${T('Işık, renk ve detaydan ölçülür. Yazıları ve caption’ı okuyamaz; metnin gücünü sen değerlendir.', 'Measured from light, colour and detail. It can’t read your text or caption; judge the words yourself.')}</p>
      ${action('pt-cc-pick', T('Başka karusel puanla', 'Check another carousel'), 'pill solid wide space')}`); }

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
    if (a === 'pt-cc-pick') input.click(); });
  window.PTCarousel = { analyse, intro };
})();
