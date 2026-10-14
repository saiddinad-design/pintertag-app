/* one way to hand a file to the viewer, and an honest answer about what happened.
   - in claude: the downloads capability (the viewer confirms; on the iPhone app it opens the share sheet)
   - inside the desktop iPhone frame: the request goes to the outer page, which owns the capability
   - elsewhere on a phone: the share sheet ("Save Video" / "Save Image")
   - last resort: a browser download link
   resolves 'saved' | 'shared' | 'started' | 'declined' | 'failed' and never claims a save that did not happen. */
(function(){
  const framed = document.documentElement.classList.contains('pt-in-frame') && window.parent !== window;
  const touch = matchMedia('(hover:none) and (pointer:coarse)').matches;
  let seq = 0; const waiting = {};
  window.addEventListener('message', e => { const d = e.data; if (!d || d.pt !== 'saved' || !waiting[d.id]) return; waiting[d.id](d); delete waiting[d.id]; });
  async function viaClaude(name, blob){
    const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
    if (!dl) return null;
    try { const r = await dl.save({ filename: name, data: blob }); return r && r.status === 'saved' ? 'saved' : 'shared'; }
    catch(err){ const c = err && err.code; return c === 'declined' ? 'declined' : c === 'rate_limited' ? 'busy' : null; } }
  function viaParent(name, blob){ return new Promise(res => { const id = ++seq; waiting[id] = d => res(d.error === 'declined' ? 'declined' : d.error ? null : 'saved');
    try { window.parent.postMessage({ pt: 'save', id, filename: name, blob }, location.origin); } catch(_) { res(null); }
    setTimeout(() => { if (waiting[id]){ delete waiting[id]; res(null); } }, 120000); }); }
  async function viaShare(name, blob){ const f = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (!(navigator.canShare && navigator.canShare({ files: [f] }))) return null;
    try { await navigator.share({ files: [f] }); return 'shared'; } catch(e){ return e && e.name === 'AbortError' ? 'declined' : null; } }
  function viaLink(name, blob){ try { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); return 'started'; } catch(_) { return 'failed'; } }
  async function save(name, blob){
    let r = framed ? await viaParent(name, blob) : await viaClaude(name, blob);
    if (r) return r;
    if (touch){ r = await viaShare(name, blob); if (r) return r; }
    return viaLink(name, blob); }
  function say(r, what){ const W = what || T('Dosya','File');
    const m = { saved: T(`${W} kaydedildi.`, `${W} saved.`), shared: T('Paylaşım menüsü açıldı; “Kaydet”i seç.','Share sheet opened; choose “Save”.'),
      started: T('İndirme başlatıldı. Görmüyorsan tarayıcının İndirilenler klasörüne bak.','Download started. If you don’t see it, check your browser’s Downloads.'),
      declined: T('Kaydetme iptal edildi.','Save cancelled.'), busy: T('Açık bir kaydetme penceresi var; önce onu kapat.','A save prompt is already open; close it first.'),
      failed: T('Bu tarayıcı dosyayı kaydedemedi.','This browser couldn’t save the file.') }; toast(m[r] || m.failed); }
  window.PTSave = { save, say };
  /* the app's own backup download goes through the same door */
  downloadBlob = (blob, name) => { save(name, blob).then(r => say(r, T('Yedek','Backup'))); };
})();
