/* on-device photo types. three small open models (face, body pose, objects; ~10 MB, MIT, vendor/human) run in the browser;
   no photo leaves the phone. rules were tuned on 81 real grid photos: 95% right when they decide, and they stay quiet
   (type stays "unknown", the one-tap label screen asks) when they aren't sure. */
(function(){
  /* inside Claude the AI labeller (merge.js) does this job, and model files can't be served there */
  if (/claude/.test(location.hostname)) return;
  const BASE = 'vendor/human/'; let human = null, loading = null, busy = null, total = 0, done = 0, stage = '', stop = false;
  const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document || /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const IGN = new Set(['bed','refrigerator','chair','tv','bird','frisbee','dog','cat','bench','couch','dining table','potted plant','person']);
  function load(){ if (human) return Promise.resolve(human); if (loading) return loading;
    stage = 'load'; loading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + 'human.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); })
      .then(async () => { const cfg = { backend: apple ? 'wasm' : 'webgl', wasmPath: BASE, modelBasePath: BASE + 'models/', debug: false, cacheSensitivity: 0, filter: { enabled: false },
          face: { enabled: true, detector: { modelPath: 'blazeface.json', rotation: false, maxDetected: 3, minConfidence: .4 }, mesh: { enabled: false }, iris: { enabled: false }, emotion: { enabled: false }, description: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false } },
          body: { enabled: true, modelPath: 'movenet-lightning.json', maxDetected: 1, minConfidence: .2 }, hand: { enabled: false },
          object: { enabled: true, modelPath: 'centernet.json', minConfidence: .3, maxDetected: 6 }, gesture: { enabled: false }, segmentation: { enabled: false } };
        let h = new Human.Human(cfg);
        /* no warmup: on iPhone it compiled shaders for seconds and looked frozen */
        try { await h.load(); } catch(_) { cfg.backend = cfg.backend === 'wasm' ? 'webgl' : 'wasm'; h = new Human.Human(cfg); await h.load(); }
        human = h; return h; }).catch(e => { loading = null; throw e; });
    return loading; }
  function classify(r, W, H){ const area = b => b[2] * b[3] / (W * H);
    const fs = Math.max(0, ...r.face.map(f => f.boxScore || f.score || 0)), fa = Math.max(0, ...r.face.map(f => area(f.box)));
    const po = r.object.filter(o => o.label === 'person'), ps = Math.max(0, ...po.map(o => o.score)), pa = Math.max(0, ...po.map(o => area(o.box)));
    const kp = new Set(((r.body[0] && r.body[0].keypoints) || []).filter(k => k.score > .3).map(k => k.part)), n = kp.size, body = r.body[0] ? r.body[0].score : 0;
    const head = ['nose','leftEye','rightEye','leftEar','rightEar'].some(k => kp.has(k)), legs = ['leftAnkle','rightAnkle','leftKnee','rightKnee'].some(k => kp.has(k));
    const items = r.object.filter(o => !IGN.has(o.label) && o.score >= .4);
    if (fs >= .7 && fa >= .008){ if (fa > .3) return fs >= .8 ? 'person' : null; if (pa > 0 && pa < .08 && n >= 12) return 'place'; return 'person'; }
    if (ps >= .3 && pa >= .5 && !head && body >= .4) return 'detail';
    if (ps >= .38 && head && legs && n >= 12 && body >= .8) return 'person';
    if (ps < .3 && n <= 2 && fs < .5 && items.length) return 'product';
    return null; }
  const todo = () => (state.photos || []).filter(p => p.type === 'unknown' && !p.autoTried && !p.imported && typeof p.src === 'string' && !(window.PTStore && PTStore.isRef(p.src)));
  function run(){ if (busy) return busy; const list = todo(); if (!list.length) return Promise.resolve(0);
    total = list.length; done = 0; let typed = 0;
    busy = (async () => { try { const h = await load();
        stage = 'scan';
        for (const p of list){ if (stop) break; const im = new Image(); im.src = p.src; try { await im.decode(); } catch(_) { p.autoTried = true; done++; continue; }
          /* 512 px is plenty for "is there a person, how much of them": 3-4x faster than the full preview */
          const k = Math.min(1, 512 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          await new Promise(r => setTimeout(r, 30));
          try { const r = await h.detect(cv); const t = classify(r, cv.width, cv.height); if (t && p.type === 'unknown'){ p.type = t; p.typeSrc = 'auto'; typed++; } } catch(_) {}
          p.autoTried = true; done++; if (done % 3 === 0) save(); }
        save(); if (typed) render(); } catch(_) { /* models unavailable: the label screen still works */ }
      busy = null; stage = ''; stop = false; return typed; })();
    return busy; }
  /* arrange waits for the models instead of asking the user to label */
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b || b.dataset.action !== 'm-p-grid' || b.dataset.autoDone) return;
    if (!todo().length && !busy) return; e.stopImmediatePropagation(); e.preventDefault();
    modal(T('fotoğrafların inceleniyor.','looking at your photos.'), `<div class="pt-auto"><div class="pt-auto-bar"><i id="pt-auto-fill"></i></div>
      <p class="pt-auto-stage" id="pt-auto-stage">${T('Hazırlanıyor…','Getting ready…')}</p>
      <div class="pt-auto-thumbs" id="pt-auto-thumbs">${todo().slice(0, 9).map(p => `<span data-id="${esc(p.id)}">${simpleImage(p.id)}</span>`).join('')}</div>
      <p class="small muted">${T('Her karede kişi, detay, ürün ya da mekân var mı bakıyorum. Telefonunda oluyor, hiçbir şey yüklenmiyor.','Checking each photo for a person, a detail, a product or a place. It happens on your phone; nothing is uploaded.')}</p>
      <button class="text-button" data-action="pt-auto-skip">${T('Beklemeden devam et','Continue without waiting')}</button></div>`);
    let finished = false; const go = () => { if (finished) return; finished = true; stop = true; clearInterval(tick); clearTimeout(cap); closeModal();
      setTimeout(() => { const x = document.createElement('button'); x.dataset.action = 'm-p-grid'; x.dataset.autoDone = '1'; x.hidden = true; document.body.appendChild(x); x.click(); x.remove(); }, 260); };
    const tick = setInterval(() => { const st = document.getElementById('pt-auto-stage'), fill = document.getElementById('pt-auto-fill'); if (!st) return;
      if (stage === 'load' || !total){ st.textContent = human ? T('Hazırlanıyor…','Getting ready…') : T('Tanıma modeli hazırlanıyor (ilk seferde ~10 sn)…','Preparing the model (about 10 s the first time)…'); fill.parentNode.classList.add('wait'); }
      else { fill.parentNode.classList.remove('wait'); fill.style.width = Math.round(done / total * 100) + '%'; st.textContent = T(`${done} / ${total} kare incelendi`, `${done} / ${total} photos checked`);
        document.querySelectorAll('#pt-auto-thumbs span').forEach(el => { const p = simplePhoto(el.dataset.id); if (p && p.autoTried) el.classList.add('done'); }); } }, 200);
    const cap = setTimeout(go, 30000);  /* never hold the user longer than 30 s */
    run().finally(go);
    window.__ptAutoGo = go; }, true);
  document.addEventListener('click', e => { const b = e.target.closest('[data-action="pt-auto-skip"]'); if (b && window.__ptAutoGo) window.__ptAutoGo(); });
  /* start quietly after uploads, when the phone is idle */
  let timer = null; const kick = () => { clearTimeout(timer); timer = setTimeout(() => { if (todo().length) (window.requestIdleCallback ? requestIdleCallback(() => run(), { timeout: 3000 }) : setTimeout(() => run(), 1200)); }, 1500); };
  const _render = render; render = function(){ _render.apply(this, arguments); kick(); };
  window.PTAuto = { run, classify, pending: () => todo().length, busy: () => !!busy };
})();
