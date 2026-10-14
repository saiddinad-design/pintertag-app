/* target vibe + shot list: pick the feed you want, see how close the top 9 are, get a checklist of what to shoot next.
   we never generate photos; we tell you what to go and take. */
(function(){
  const TYPES = ['person', 'detail', 'product', 'place'];
  const V = {
    quiet:   { tone: { lum: .50, warm: .03, sat: .15 }, mix: { person: 2, detail: 3, product: 2, place: 2 }, sw: ['#d9d2c5', '#8f877a'],
      ideas: { person: [['Yüzü tam görünmeyen portre','Sırt, profil ya da elde fincan; sade kıyafet.'], ['Ayna önünde sakin poz','Nötr renkler, tek ışık.']],
               detail: [['Kumaş dokusu yakın plan','Keten, yün ya da deri; yandan gelen gün ışığı.'], ['Aksesuar detayı','Saat, yüzük ya da toka; düz zemin.']],
               product: [['Tek ürün, bol boşluk','Nötr duvar önünde, ortada değil, hafif kenarda.'], ['Masa üstü düzen','3 obje, aynı renk ailesi.']],
               place: [['Boş masa, sabah ışığı','İnsan yok, gölgeler uzun.'], ['Sade iç mekân köşesi','Sandalye, perde, bitki.']] },
      en: { person: [['Portrait without the full face','Back, profile or a cup in hand; plain clothes.'], ['Calm mirror pose','Neutral colours, one light.']], detail: [['Fabric texture close-up','Linen, wool or leather; side daylight.'], ['Accessory detail','Watch, ring or buckle; plain background.']], product: [['One product, lots of space','Against a neutral wall, slightly off-centre.'], ['Tabletop arrangement','3 objects, one colour family.']], place: [['Empty table, morning light','No people, long shadows.'], ['Simple interior corner','Chair, curtain, plant.']] } },
    film:    { tone: { lum: .45, warm: .10, sat: .25 }, mix: { person: 3, detail: 2, product: 1, place: 3 }, sw: ['#c98b52', '#5b3a24'],
      ideas: { person: [['Yürürken yakalanmış an','Hafif bulanık, poz yok; altın saat.'], ['Kafede doğal portre','Pencere ışığı, sıcak ton.']], detail: [['Fincan, el, mum ışığı','Yakın plan, sıcak ışık.'], ['Bilet, plak ya da kitap','Yaşanmışlık hissi veren bir obje.']], product: [['Ürün, gündelik sahnede','Masa üstünde, kullanılıyormuş gibi.'], ['Çanta ya da ayakkabı','Sokakta, yerde, gölgede.']], place: [['Eski sokak, altın saat','Uzun gölgeler, sıcak duvarlar.'], ['Vapur, tren ya da yol','Hareket hissi, pencereden.']] },
      en: { person: [['A candid walking moment','Slightly blurred, no pose; golden hour.'], ['Natural café portrait','Window light, warm tone.']], detail: [['Cup, hand, candlelight','Close-up, warm light.'], ['Ticket, record or book','An object that feels lived in.']], product: [['Product in an everyday scene','On a table, as if in use.'], ['Bag or shoes','On the street, on the ground, in shade.']], place: [['Old street, golden hour','Long shadows, warm walls.'], ['Ferry, train or road','A sense of movement, through a window.']] } },
    gallery: { tone: { lum: .72, warm: .01, sat: .10 }, mix: { person: 2, detail: 2, product: 3, place: 2 }, sw: ['#f4f3f0', '#c9c7c2'],
      ideas: { person: [['Beyaz duvar önünde tam boy','Bol boşluk, sade kıyafet.'], ['Işıklı odada profil','Gölge yumuşak.']], detail: [['Beyaz üstüne tek detay','Düğme, dikiş ya da kenar.'], ['Kağıt, seramik, taş doku','Açık tonlar.']], product: [['Tek obje, bol nefes','Beyaz zemin, kadrajın üçte biri.'], ['Raf ya da kaide üstünde ürün','Galeri gibi.']], place: [['Beyaz, aydınlık iç mekân','Pencere, boş duvar.'], ['Mimari çizgi','Merdiven, kemer, köşe.']] },
      en: { person: [['Full length against a white wall','Lots of space, plain clothes.'], ['Profile in a bright room','Soft shadows.']], detail: [['One detail on white','Button, seam or edge.'], ['Paper, ceramic, stone texture','Light tones.']], product: [['One object, lots of air','White background, a third of the frame.'], ['Product on a shelf or plinth','Gallery style.']], place: [['White, bright interior','Window, empty wall.'], ['Architectural line','Stairs, arch, corner.']] } },
    night:   { tone: { lum: .25, warm: .06, sat: .25 }, mix: { person: 3, detail: 2, product: 1, place: 3 }, sw: ['#2a2420', '#7a4b2a'],
      ideas: { person: [['Flaşlı portre','Gece, doğrudan flaş, sert gölge.'], ['Neon ya da sokak lambası altında','Tek ışık kaynağı.']], detail: [['Bar tezgahı detayı','Kadeh, el, loş ışık.'], ['Mum ya da lamba yakın plan','Karanlık zemin.']], product: [['Ürün, karanlıkta tek ışıkla','Spot ışık hissi.'], ['Gece masasında obje','Sıcak lamba.']], place: [['Gece şehir ışıkları','Pencereden ya da köprüden.'], ['Loş iç mekân','Restoran, bar, koridor.']] },
      en: { person: [['Flash portrait','Night, direct flash, hard shadow.'], ['Under neon or a street lamp','One light source.']], detail: [['Bar counter detail','Glass, hand, low light.'], ['Candle or lamp close-up','Dark background.']], product: [['Product, one light in the dark','Spotlight feel.'], ['Object on a night table','Warm lamp.']], place: [['City lights at night','From a window or bridge.'], ['Dim interior','Restaurant, bar, hallway.']] } },
    mono:    { tone: { lum: .48, warm: 0, sat: .04 }, bw: true, mix: { person: 3, detail: 2, product: 1, place: 3 }, sw: ['#e6e6e6', '#1c1c1c'],
      ideas: { person: [['Siyah-beyaz portre','Güçlü gölge, yüz yarı karanlık.'], ['Sokakta siluet','Arkadan ışık.']], detail: [['Doku, s-b yakın plan','Kumaş, el, saç.'], ['Grafik gölge','Panjur ya da dal gölgesi.']], product: [['Ürün, sert kontrastla','Siyah zemin, beyaz ışık.'], ['Tek obje, net çizgi','Minimal.']], place: [['Mimari, s-b','Merdiven, cephe, tekrar eden çizgiler.'], ['Boş sokak','Yağmur sonrası, yansımalı.']] },
      en: { person: [['Black and white portrait','Strong shadow, half the face in dark.'], ['Street silhouette','Backlit.']], detail: [['Texture, b&w close-up','Fabric, hand, hair.'], ['Graphic shadow','Blinds or branch shadows.']], product: [['Product, hard contrast','Black background, white light.'], ['One object, clean line','Minimal.']], place: [['Architecture in b&w','Stairs, facade, repeating lines.'], ['Empty street','After rain, with reflections.']] } },
    coastal: { tone: { lum: .58, warm: -.05, sat: .25 }, mix: { person: 3, detail: 2, product: 1, place: 3 }, sw: ['#9ec3d6', '#2f6d8c'],
      ideas: { person: [['Deniz kenarında doğal an','Rüzgâr, keten, serin ışık.'], ['Gökyüzü bol portre','Kadrajın yarısı mavi.']], detail: [['Keten, hasır, kum','Yakın plan, serin ton.'], ['Su damlası, cam, kabuk','Parlak detay.']], product: [['Ürün, mavi zemin önünde','Deniz ya da gökyüzü.'], ['Plaj çantası, gözlük','Güneşte.']], place: [['Ufuk çizgisi','Deniz, gökyüzü, tek tekne.'], ['Beyaz duvar, mavi kapı','Kıyı kasabası.']] },
      en: { person: [['A natural seaside moment','Wind, linen, cool light.'], ['Portrait with lots of sky','Half the frame blue.']], detail: [['Linen, straw, sand','Close-up, cool tone.'], ['Water drop, glass, shell','A shiny detail.']], product: [['Product against blue','Sea or sky.'], ['Beach bag, sunglasses','In the sun.']], place: [['Horizon line','Sea, sky, one boat.'], ['White wall, blue door','Seaside town.']] } }
  };
  const ORDER = ['quiet', 'film', 'gallery', 'night', 'mono', 'coastal'];
  const name = k => GC.vibeText(k);
  const top = () => simpleIds().slice(0, 9).map(simplePhoto).filter(Boolean);
  const avg = (a, k) => a.reduce((t, m) => t + m[k], 0) / a.length;

  function analyse(key){ const v = V[key], ph = top(), ms = ph.map(p => p.m).filter(Boolean);
    if (ms.length < 3) return { few: true };
    const t = { lum: avg(ms, 'lum'), warm: avg(ms, 'warm'), sat: avg(ms, 'sat') }, bw = ms.filter(m => m.sat < .07).length;
    let d = Math.abs(t.lum - v.tone.lum) / .25 + Math.abs(t.warm - v.tone.warm) / .12 + (v.bw ? (1 - bw / ms.length) * 2 : Math.abs(t.sat - v.tone.sat) / .2);
    const toneScore = Math.max(0, 1 - d / 3.2);
    const typed = ph.filter(p => TYPES.includes(p.type)), have = {}; TYPES.forEach(k => have[k] = typed.filter(p => p.type === k).length);
    const known = typed.length >= Math.min(5, ph.length - 1);
    let mixScore = null; if (known){ const scale = ph.length / 9; mixScore = Math.max(0, 1 - TYPES.reduce((a, k) => a + Math.abs(have[k] - v.mix[k] * scale), 0) / (ph.length * 1.2)); }
    const match = Math.round(100 * (mixScore === null ? toneScore : toneScore * .55 + mixScore * .45));
    return { t, bw, n: ms.length, have, known, match: Math.max(5, Math.min(99, match)) }; }

  function build(key){ const v = V[key], a = analyse(key), en = state.lang === 'en', items = [];
    if (a.few) return { a, items };
    const add = (id, title, hint) => items.push({ id, title, hint });
    if (v.bw){ const off = a.n - a.bw; if (off > 1) add('bw', T(`${off - 1} kareyi siyah-beyaza çevir ya da s-b çek`, `Turn ${off - 1} photos black and white, or shoot in b&w`), T('Monokrom grid’de renkli kare en fazla bir tane olmalı.','A monochrome grid has one colour photo at most.')); }
    else {
      const dl = v.tone.lum - a.t.lum, dw = v.tone.warm - a.t.warm, ds = v.tone.sat - a.t.sat;
      if (dl > .08) add('lum+', T('2 aydınlık kare','2 brighter photos'), T('Pencere önü, gün ışığı, açık zemin.','By a window, daylight, light background.'));
      if (dl < -.08) add('lum-', T('1 karanlık, gölgeli kare','1 darker, shadowy photo'), T('Akşam, loş iç mekân ya da sert gölge.','Evening, a dim interior or hard shadow.'));
      if (dw > .04) add('warm+', T('1 sıcak tonlu kare','1 warm-toned photo'), T('Altın saat, ahşap, mum ya da lamba ışığı.','Golden hour, wood, candle or lamp light.'));
      if (dw < -.04) add('warm-', T('1 serin tonlu kare','1 cool-toned photo'), T('Gölge, mavi saat, beyaz ya da gri zemin.','Shade, blue hour, white or grey background.'));
      if (ds < -.08) add('sat-', T('Bir sonraki çekimde renkleri sakinleştir','Calm the colours in your next shoot'), T('Nötr kıyafet, tek vurgu rengi.','Neutral clothes, one accent colour.'));
      if (ds > .08) add('sat+', T('1 renkli kare','1 colourful photo'), T('Tek güçlü renk: çiçek, kapı, kıyafet.','One strong colour: flowers, a door, clothing.'));
    }
    if (a.known){ const scale = Math.max(1, top().length) / 9;
      TYPES.map(k => [k, Math.round(v.mix[k] * scale - a.have[k])]).filter(([, g]) => g > 0).sort((x, y) => y[1] - x[1])
        .forEach(([k, g]) => { const ideas = (en ? v.en : v.ideas)[k]; for (let i = 0; i < Math.min(g, 2); i++) add(k + i, ideas[i % ideas.length][0], ideas[i % ideas.length][1]); }); }
    return { a, items: items.slice(0, 6) }; }

  function save_(key){ const old = (state.shots && state.shots.items) || [], done = new Set(old.filter(x => x.done).map(x => x.id));
    const { items } = build(key); state.shots = { vibe: key, items: items.map(x => ({ ...x, done: done.has(x.id) })), at: Date.now() }; save(); }

  function picker(){ const cur = state.vibeTarget, ms = top().map(p => p.m).filter(Boolean), now = ms.length >= 3 ? GC.vibeOf(ms) : null;
    modal(T('hedef vibe’ın ne?','what’s your target vibe?'), `<p class="m-reason">${T('Grid’in neye benzesin? Seç, ne kadar yakın olduğunu ve neyi çekmen gerektiğini söyleyelim.','How should your grid feel? Pick one; we’ll tell you how close you are and what to shoot.')}${now ? `<br><small class="muted">${T('Şu anki vibe’ın','Your current vibe')}: <b>${esc(name(now)[0])}</b></small>` : ''}</p>
      <div class="m-vibes">${ORDER.map(k => `<button class="m-vibe ${cur === k ? 'on' : ''}" data-action="m-vibe-set" data-v="${k}" aria-pressed="${cur === k}"><span class="m-vibe-dot" style="background:linear-gradient(135deg,${V[k].sw[0]},${V[k].sw[1]})"></span><b>${esc(name(k)[0])}</b><small>${esc(name(k)[1])}</small></button>`).join('')}</div>`); }

  function list(){ const key = state.vibeTarget; if (!key) return picker(); const { a } = build(key), s = state.shots && state.shots.vibe === key ? state.shots : (save_(key), state.shots);
    if (a.few){ modal(T('çekim listen.','your shot list.'), `<p class="m-reason">${T('Önce en az 3 fotoğraf ekle; sonra hedefe ne kadar yakın olduğunu ve neyi çekmen gerektiğini söyleyelim.','Add at least 3 photos first; then we’ll show how close you are and what to shoot.')}</p>${action('m-vibe-pick', T('Vibe’ı değiştir','Change vibe'), 'pill wide')}`); return; }
    const pro = !window.PTAcct || PTAcct.isPro(), shown = pro ? s.items : s.items.slice(0, 3), locked = s.items.length - shown.length;
    const doneN = shown.filter(x => x.done).length;
    modal(T('çekim listen.','your shot list.'), `<div class="m-vibe-head"><span class="m-vibe-dot big" style="background:linear-gradient(135deg,${V[key].sw[0]},${V[key].sw[1]})"></span><div><small>${T('hedef','target')}</small><b>${esc(name(key)[0])}</b></div><div class="m-vibe-pct"><b>%${a.match}</b><small>${T('uyum','match')}</small></div></div>
      <div class="m-meter"><i style="width:${a.match}%"></i></div>
      ${s.items.length ? `<ul class="m-shots">${shown.map(x => `<li><button class="m-shotrow ${x.done ? 'done' : ''}" data-action="m-shot-toggle" data-id="${esc(x.id)}" aria-pressed="${x.done}"><span class="m-shot-box" aria-hidden="true">${x.done ? '✓' : ''}</span><span><b>${esc(x.title)}</b><small>${esc(x.hint)}</small></span></button></li>`).join('')}${locked ? `<li><button class="m-shotrow m-locked" data-action="m-pw-open" data-ctx="shots"><span class="m-shot-box" aria-hidden="true"><svg class="pt-ico" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><rect x="2" y="7" width="10" height="8" rx="2" fill="currentColor"/><path d="M4.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></span><span><b>${T(`+${locked} madde daha`, `+${locked} more`)}</b><small>${T('Tam liste Pro’da. 7 gün ücretsiz dene.','The full list is Pro. Try 7 days free.')}</small></span></button></li>` : ''}</ul>
        <p class="small muted">${T(`${doneN}/${shown.length} tamam. Çektiklerini ekleyince “Listeyi yenile”ye dokun.`, `${doneN}/${shown.length} done. Add what you shot, then tap “Refresh list”.`)}</p>`
        : `<p class="m-reason">${T('Grid’in bu vibe’a çok yakın. Şimdilik eksik yok.','Your grid is very close to this vibe. Nothing missing for now.')}</p>`}
      ${a.known ? '' : `<p class="m-note-sm">${T('Fotoğraf türleri belli olunca (AI etiketleme ya da kendin seçerek) liste kişi, detay, ürün, mekân önerileriyle netleşir.','Once photo types are known (AI tagging or picking them yourself) the list adds person, detail, product and place ideas.')}</p>`}
      <div class="actions">${action('m-shot-refresh', T('Listeyi yenile','Refresh list'), 'pill solid')}${action('m-vibe-pick', T('Vibe’ı değiştir','Change vibe'), 'pill')}</div>`); }

  function card(){ if (simpleIds().length < 3) return '';
    const key = state.vibeTarget;
    if (!key) return `<button class="m-vibe-card" data-action="m-vibe-pick"><span class="m-vibe-dots"><i style="background:#c98b52"></i><i style="background:#d9d2c5"></i><i style="background:#2a2420"></i></span><span><b>${T('Hedef vibe’ını seç','Pick your target vibe')}</b><small>${T('Neyi çekmen gerektiğini söyleyelim.','We’ll tell you what to shoot next.')}</small></span><span aria-hidden="true">›</span></button>`;
    const { a } = build(key), s = state.shots && state.shots.vibe === key ? state.shots : null, left = s ? (!window.PTAcct || PTAcct.isPro() ? s.items : s.items.slice(0, 3)).filter(x => !x.done).length : 0;
    return `<button class="m-vibe-card" data-action="m-shot-open"><span class="m-vibe-dot" style="background:linear-gradient(135deg,${V[key].sw[0]},${V[key].sw[1]})"></span><span><b>${esc(name(key)[0])}${a.few ? '' : ` · %${a.match} ${T('uyum','match')}`}</b><small>${s && s.items.length ? T(`Çekim listesi: ${left} kare kaldı`, `Shot list: ${left} to go`) : T('Çekim listeni gör','See your shot list')}</small></span><span aria-hidden="true">›</span></button>`; }
  const _grid = simpleGrid; simpleGrid = function(){ const h = _grid(); return h.replace('<div class="simple-feed">', card() + '<div class="simple-feed">'); };

  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'm-vibe-pick') picker();
    if (a === 'm-vibe-set'){ state.vibeTarget = b.dataset.v; save_(b.dataset.v); render(); list(); }
    if (a === 'm-shot-open') list();
    if (a === 'm-shot-refresh'){ save_(state.vibeTarget); render(); list(); toast(T('Liste son grid’ine göre yenilendi.','List refreshed from your latest grid.')); }
    if (a === 'm-shot-toggle' && state.shots){ const x = state.shots.items.find(i => i.id === b.dataset.id); if (x){ x.done = !x.done; save(); render(); list(); } } });
  window.__PTVibe = { analyse, build, V };
  render();
})();
