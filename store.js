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
      if (!known.has(k)) pending.push(put(k, v).then(ok => ok || put(k, v))); o[f] = REF + k; }
      /* a photo whose image could not be found shows a placeholder; the placeholder is never stored, the original reference is kept so it can still be recovered */
      if (p.lost && p.lost[f]) o[f] = REF + p.lost[f]; }
    if (o.lost) delete o.lost;
    return o; };
  let warned = false;
  function save(state, toastFn){
    const pending = [];
    const slim = { ...state, photos: (state.photos || []).map(p => slimItem(p, pending)), storyMedia: (state.storyMedia || []).map(p => slimItem(p, pending)) };
    /* the other account (brand / personal) that is put away: same short references, never full images */
    if (state.spaces){ slim.spaces = {}; for (const k in state.spaces){ const sp = state.spaces[k] || {};
      slim.spaces[k] = { ...sp, photos: (sp.photos || []).map(p => slimItem(p, pending)), storyMedia: (sp.storyMedia || []).map(p => slimItem(p, pending)) }; } }
    try { localStorage.setItem(KEY, JSON.stringify(slim)); }
    catch (e) { if (!warned && toastFn){ warned = true; toastFn(); } return false; }
    return true; }
  /* recovery when an image is missing from the device database: rebuild the preview from the full-size copy, else fetch it
     from the cloud backup (signed in), else show a placeholder and keep the reference for later. nothing is ever deleted here. */
  const fromBlob = async b => { try { const im = await createImageBitmap(b), r = Math.min(1, 800 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * r); c.height = Math.round(im.height * r); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .68); } catch(_) { return null; } };
  const toData = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
  let ph = null;
  const placeholder = () => { if (ph) return ph; try { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d');
      g.fillStyle = '#ECEAE6'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#8A8680'; g.textAlign = 'center'; g.font = '500 30px system-ui, sans-serif';
      const tr = (a, b) => (typeof T === 'function' ? T(a, b) : b); g.fillText(tr('Fotoğraf yüklenemedi', 'Photo not found'), 300, 390); g.font = '24px system-ui, sans-serif'; g.fillText(tr('Tekrar ekleyebilirsin', 'Add it again'), 300, 430);
      ph = c.toDataURL('image/png'); } catch(_) { ph = ''; } return ph; };
  async function recover(p, f, k){
    if (f === 'src'){ const hq = await get(p.id + ':orig'); if (hq instanceof Blob){ const d = await fromBlob(hq); if (d && await put(k, d)) return d; } }
    const C = root.PTCloud; if (C && C.user){ try { const sb = await C.client(), uid = C.user.id, safe = x => String(x).replace(/[^A-Za-z0-9._-]/g, c => '~' + c.charCodeAt(0).toString(16));
      const dl = async x => { const { data } = await sb.storage.from('photos').download(uid + '/' + safe(x)); return data || null; };
      const b = await dl(k); if (b){ const d = await toData(b); if (d && await put(k, d)) return d; }
      if (f === 'src'){ const o = await dl(p.id + ':orig'); if (o){ await put(p.id + ':orig', o); const d = await fromBlob(o); if (d && await put(k, d)) return d; } } } catch(_) {} }
    return null; }
  async function hydrate(state){
    let n = 0; const fill = async p => { if (!p) return; for (const f of FIELDS){ const v = p[f], k = p.lost && p.lost[f] || (typeof v === 'string' && v.startsWith(REF) ? v.slice(REF.length) : null); if (!k) continue;
      let d = await get(k); if (!d) d = await recover(p, f, k);
      if (d){ p[f] = d; known.add(k); n++; if (p.lost){ delete p.lost[f]; if (!Object.keys(p.lost).length) delete p.lost; } }
      else if (f === 'src'){ p.lost = { ...(p.lost || {}), src: k }; p.src = placeholder(); } } };
    for (const p of state.photos || []) await fill(p);
    for (const p of state.storyMedia || []) await fill(p);
    return n; }
  const isRef = v => typeof v === 'string' && v.startsWith(REF);
  root.PTStore = { save, hydrate, isRef, get, put };
  /* high-quality copy of every upload (long side 2160, jpeg .92). the 800px preview stays for the planner;
     crops and shares are rendered from this copy so nothing posted is degraded. key = <photo id>:orig */
  const HQ = 3240, objUrls = {};
  const blobOf = (canvas, q) => new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', q));
  root.PTHQ = {
    async fromImage(id, im){
      /* keep the photo's own file when we can (no re-encode = no quality loss); else a 3240 px copy at .95 */
      try { const src = im && im.currentSrc || im.src || '', long = Math.max(im.naturalWidth || 0, im.naturalHeight || 0);
        if (/^blob:/.test(src) && long && long <= 6000){ const b = await (await fetch(src)).blob();
          if (b && b.size && b.size <= 15 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(b.type)){ await put(id + ':orig', b); if (objUrls[id]){ URL.revokeObjectURL(objUrls[id]); delete objUrls[id]; } return true; } } } catch(_) {}
      try { const r = Math.min(1, HQ / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height)), c = document.createElement('canvas');
      c.width = Math.round((im.naturalWidth || im.width) * r); c.height = Math.round((im.naturalHeight || im.height) * r); { const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height); }
      const b = await blobOf(c, .95); if (b){ await put(id + ':orig', b); if (objUrls[id]){ URL.revokeObjectURL(objUrls[id]); delete objUrls[id]; } } return !!b; } catch(_) { return false; } },
    get: id => get(id + ':orig').then(b => b instanceof Blob ? b : null),
    /* reels: the video file itself, untouched, next to its cover frame */
    putVideo: (id, blob) => put(id + ':video', blob),
    video: id => get(id + ':video').then(b => b instanceof Blob ? b : null),
    async url(id){ if (objUrls[id]) return objUrls[id]; const b = await root.PTHQ.get(id); return b ? (objUrls[id] = URL.createObjectURL(b)) : null; },
    /* the file that goes to instagram: the crop at 1080x1440 when there is one, else the hq copy */
    async exportFile(p, name){ const b = await root.PTHQ.get(p.id);
      if (!b){ const r = await fetch(p.src); const f = await r.blob(); return new File([f], name, { type: f.type || 'image/jpeg' }); }
      if (!p.crop || typeof cropGeometry !== 'function') return new File([b], name, { type: 'image/jpeg' });
      const u = URL.createObjectURL(b); try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
        const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H; const g = cropGeometry(im.naturalWidth, im.naturalHeight, W, H, p.crop.z, p.crop.x, p.crop.y);
        { const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, g.left, g.top, g.dw, g.dh); } const o = await blobOf(c, .95); return new File([o], name, { type: 'image/jpeg' }); } finally { URL.revokeObjectURL(u); } }
  };
})(window);
