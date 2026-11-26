/* native layer for the iOS app (Capacitor). loaded only in the app bundle, before the app scripts.
   - share sheet: navigator.share / canShare with files go through the iOS share sheet (Instagram, Save Image, AirDrop)
   - post reminders: every planned post with a date and time gets a local notification at that time
   - haptics on key actions, light status bar, splash hidden once the app has drawn */
(function(){
  const C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  window.PT_NATIVE = true;
  const { Share } = window.capacitorShare || {}, { Filesystem, Directory } = window.capacitorFilesystemPluginCapacitor || window.capacitorFilesystem || {};
  const { LocalNotifications } = window.capacitorLocalNotifications || {}, { Haptics, ImpactStyle } = window.capacitorHaptics || {};
  const { StatusBar, Style } = window.capacitorStatusBar || {}, { SplashScreen } = window.capacitorSplashScreen || {};
  const tr = (a, b) => (typeof T === 'function' ? T(a, b) : b);

  /* ---------- share sheet ---------- */
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const safeName = (n, i) => (String(n || 'pintertag-' + i).replace(/[^\w.\-]+/g, '-').slice(-80)) || ('pintertag-' + i);
  if (Share && Filesystem){
    navigator.canShare = data => !!data && (!data.files || data.files.length > 0);
    navigator.share = async data => {
      data = data || {}; const files = [];
      for (const [i, f] of (data.files || []).entries()){
        const r = await Filesystem.writeFile({ path: 'share/' + Date.now() + '-' + safeName(f.name, i), data: await b64(f), directory: Directory.Cache, recursive: true });
        files.push(r.uri); }
      try { await Share.share({ text: data.text || undefined, url: data.url || undefined, files: files.length ? files : undefined, dialogTitle: data.title || undefined }); }
      catch (e){ const m = String(e && (e.message || e)); if (/cancel/i.test(m)){ const err = new Error('Share canceled'); err.name = 'AbortError'; throw err; } throw e; } };
  }

  /* ---------- post reminders ---------- */
  const idOf = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 || 1; };
  let asked = false, timer = null;
  async function syncReminders(){
    if (!LocalNotifications || typeof state === 'undefined') return;
    const now = Date.now(), soon = (state.plans || []).filter(p => p && p.date && p.time).map(p => ({ p, at: new Date(p.date + 'T' + p.time + ':00') }))
      .filter(x => !isNaN(x.at) && x.at.getTime() > now + 60000).sort((a, b) => a.at - b.at).slice(0, 60);
    try {
      const pending = await LocalNotifications.getPending(); if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      if (!soon.length) return;
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted'){ if (asked || perm.display === 'denied') return; asked = true; perm = await LocalNotifications.requestPermissions(); if (perm.display !== 'granted') return; }
      await LocalNotifications.schedule({ notifications: soon.map(({ p, at }) => ({ id: idOf(p.id), at, title: p.purpose === 'story' ? tr('Story zamanı', 'Story time') : tr('Paylaşım zamanı', 'Time to post'),
        body: (p.caption ? String(p.caption).slice(0, 90) : tr('Planladığın post hazır. Pintertag’den paylaş.', 'Your planned post is ready. Share it from Pintertag.')), extra: { plan: p.id } })) });
    } catch (_) {} }
  const later = () => { clearTimeout(timer); timer = setTimeout(syncReminders, 1500); };
  function hookSave(){ if (!window.PTStore || PTStore.__native) return; const s = PTStore.save; PTStore.save = function(){ const r = s.apply(this, arguments); later(); return r; }; PTStore.__native = true; }
  document.addEventListener('DOMContentLoaded', () => { hookSave(); later(); });

  /* ---------- feel ---------- */
  const TAP = /^(s-accept|m-done|m-share|m-gc-keep|pt-plan-mode|pt-carousel-open|pt-fit-open|m-shot|pt-booth-open)$/;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-action]'); if (b && Haptics && TAP.test(b.dataset.action)) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); }, true);
  try { StatusBar && StatusBar.setStyle({ style: Style.Light }); } catch (_) {}
  window.addEventListener('load', () => setTimeout(() => { try { SplashScreen && SplashScreen.hide(); } catch (_) {} }, 150));
  /* links that leave the app open in Safari */
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="http"]'); if (!a) return; e.preventDefault(); window.open(a.href, '_blank'); }, true);
})();
