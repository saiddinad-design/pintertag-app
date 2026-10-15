/* on-device photo types. three small open models (face, body pose, objects; ~10 MB, MIT, vendor/human) run in the browser;
   no photo leaves the phone. rules were tuned on 81 real grid photos: 95% right when they decide, and they stay quiet
   (type stays "unknown", the one-tap label screen asks) when they aren't sure. */
(function(){
  const BASE = 'vendor/human/'; let human = null, loading = null, busy = null, total = 0, done = 0;
  const IGN = new Set(['bed','refrigerator','chair','tv','bird','frisbee','dog','cat','bench','couch','dining table','potted plant','person']);
  function load(){ if (human) return Promise.resolve(human); if (loading) return loading;
    loading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + 'human.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); })
      .then(async () => { const cfg = { backend: 'webgl', wasmPath: BASE, modelBasePath: BASE + 'models/', debug: false, cacheSensitivity: 0, filter: { enabled: false },
          face: { enabled: true, detector: { modelPath: 'blazeface.json', rotation: false, maxDetected: 3, minConfidence: .4 }, mesh: { enabled: false }, iris: { enabled: false }, emotion: { enabled: false }, description: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false } },
          body: { enabled: true, modelPath: 'movenet-lightning.json', maxDetected: 1, minConfidence: .2 }, hand: { enabled: false },
          object: { enabled: true, modelPath: 'centernet.json', minConfidence: .3, maxDetected: 6 }, gesture: { enabled: false }, segmentation: { enabled: false } };
        let h = new Human.Human(cfg);
        try { await h.load(); await h.warmup(); } catch(_) { cfg.backend = 'wasm'; h = new Human.Human(cfg); await h.load(); await h.warmup(); }
        human = h; return h; });
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
        for (const p of list){ const im = new Image(); im.src = p.src; try { await im.decode(); } catch(_) { p.autoTried = true; done++; continue; }
          try { const r = await h.detect(im); const t = classify(r, im.naturalWidth, im.naturalHeight); if (t && p.type === 'unknown'){ p.type = t; p.typeSrc = 'auto'; typed++; } } catch(_) {}
          p.autoTried = true; done++; if (done % 3 === 0) save(); }
        save(); if (typed) render(); } catch(_) { /* models unavailable: the label screen still works */ }
      busy = null; return typed; })();
    return busy; }
  /* arrange waits for the models instead of asking the user to label */
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b || b.dataset.action !== 'm-p-grid' || b.dataset.autoDone) return;
    if (!todo().length && !busy) return; e.stopImmediatePropagation(); e.preventDefault();
    modal(T('fotoğrafların inceleniyor.','looking at your photos.'), `<p class="m-reason">${T('Her karede kişi, detay, ürün ya da mekân var mı bakıyorum. Telefonunda oluyor, hiçbir şey yüklenmiyor.','Checking each photo for a person, a detail, a product or a place. It happens on your phone; nothing is uploaded.')}</p><p class="small muted" id="pt-auto-n"></p>`);
    const tick = setInterval(() => { const el = document.getElementById('pt-auto-n'); if (el) el.textContent = total ? `${done} / ${total}` : T('Hazırlanıyor…','Getting ready…'); }, 250);
    run().finally(() => { clearInterval(tick); closeModal(); setTimeout(() => { const x = document.createElement('button'); x.dataset.action = 'm-p-grid'; x.dataset.autoDone = '1'; x.hidden = true; document.body.appendChild(x); x.click(); x.remove(); }, 260); }); }, true);
  /* start quietly after uploads, when the phone is idle */
  let timer = null; const kick = () => { clearTimeout(timer); timer = setTimeout(() => { if (todo().length) (window.requestIdleCallback ? requestIdleCallback(() => run(), { timeout: 3000 }) : setTimeout(() => run(), 1200)); }, 1500); };
  const _render = render; render = function(){ _render.apply(this, arguments); kick(); };
  window.PTAuto = { run, classify, pending: () => todo().length, busy: () => !!busy };
})();
