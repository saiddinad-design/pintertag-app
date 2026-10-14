/* photo storage: images live in the device database (IndexedDB, hundreds of MB);
   the plan, order and settings stay in localStorage with a short reference per photo. */
(function(root){
  const KEY = 'pintertag-demo-v1', REF = 'idb:';
  let dbp = null; const known = new Set();
  const db = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('pintertag-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const put = (k, v) => db().then(d => new Promise(res => { const tx = d.transaction('img', 'readwrite'); tx.objectStore('img').put(v, k); tx.oncomplete = () => { known.add(k); res(true); }; tx.onerror = () => res(false); })).catch(() => false);
  const get = k => db().then(d => new Promise(res => { const q = d.transaction('img').objectStore('img').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); })).catch(() => undefined);
  const FIELDS = ['src', 'cropSource'];
  const slimItem = (p, pending) => { if (!p || typeof p !== 'object') return p; const o = { ...p };
    for (const f of FIELDS){ const v = o[f]; if (typeof v === 'string' && v.startsWith('data:')){ const k = p.id + ':' + f + ':' + v.length + ':' + v.slice(-24);
      if (!known.has(k)) pending.push(put(k, v)); o[f] = REF + k; } }
    return o; };
  let warned = false;
  function save(state, toastFn){
    const pending = [];
    const slim = { ...state, photos: (state.photos || []).map(p => slimItem(p, pending)), storyMedia: (state.storyMedia || []).map(p => slimItem(p, pending)) };
    try { localStorage.setItem(KEY, JSON.stringify(slim)); }
    catch (e) { if (!warned && toastFn){ warned = true; toastFn(); } return false; }
    return true; }
  async function hydrate(state){
    let n = 0; const fill = async p => { for (const f of FIELDS){ const v = p && p[f]; if (typeof v === 'string' && v.startsWith(REF)){ const k = v.slice(REF.length); const d = await get(k); if (d){ p[f] = d; known.add(k); n++; } } } };
    for (const p of state.photos || []) await fill(p);
    for (const p of state.storyMedia || []) await fill(p);
    return n; }
  const isRef = v => typeof v === 'string' && v.startsWith(REF);
  root.PTStore = { save, hydrate, isRef };
  /* high-quality copy of every upload (long side 2160, jpeg .92). the 800px preview stays for the planner;
     crops and shares are rendered from this copy so nothing posted is degraded. key = <photo id>:orig */
  const HQ = 2160, objUrls = {};
  const blobOf = (canvas, q) => new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', q));
  root.PTHQ = {
    async fromImage(id, im){ try { const r = Math.min(1, HQ / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height)), c = document.createElement('canvas');
      c.width = Math.round((im.naturalWidth || im.width) * r); c.height = Math.round((im.naturalHeight || im.height) * r); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const b = await blobOf(c, .92); if (b){ await put(id + ':orig', b); if (objUrls[id]){ URL.revokeObjectURL(objUrls[id]); delete objUrls[id]; } } return !!b; } catch(_) { return false; } },
    get: id => get(id + ':orig').then(b => b instanceof Blob ? b : null),
    async url(id){ if (objUrls[id]) return objUrls[id]; const b = await root.PTHQ.get(id); return b ? (objUrls[id] = URL.createObjectURL(b)) : null; },
    /* the file that goes to instagram: the crop at 1080x1440 when there is one, else the hq copy */
    async exportFile(p, name){ const b = await root.PTHQ.get(p.id);
      if (!b){ const r = await fetch(p.src); const f = await r.blob(); return new File([f], name, { type: f.type || 'image/jpeg' }); }
      if (!p.crop || typeof cropGeometry !== 'function') return new File([b], name, { type: 'image/jpeg' });
      const u = URL.createObjectURL(b); try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
        const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H; const g = cropGeometry(im.naturalWidth, im.naturalHeight, W, H, p.crop.z, p.crop.x, p.crop.y);
        c.getContext('2d').drawImage(im, g.left, g.top, g.dw, g.dh); const o = await blobOf(c, .92); return new File([o], name, { type: 'image/jpeg' }); } finally { URL.revokeObjectURL(u); } }
  };
})(window);
