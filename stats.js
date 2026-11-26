/* anonymous usage counts. no user id, no device id, no photo, no text: only which feature was used, on which day, platform and app version.
   one "open" per device per day. sends nothing else. */
(function(){
  const URL_ = 'https://mtmjadjiofgopmutdvnw.supabase.co/rest/v1/pt_events', KEY = 'sb_publishable_fS-1AGEHPyL4hIMwtiWMgw_S9wC_-zu';
  const OK = new Set(['open','score','carousel','shoot','fit','export','signup']), V = '1.0';
  const platform = window.PT_NATIVE ? 'ios' : (/iphone|ipad|android/i.test(navigator.userAgent) ? 'mobile-web' : 'web');
  const local = !window.PT_NATIVE && /^(localhost|127\.|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
  let last = {};
  function track(event){ if (!OK.has(event) || local) return; const now = Date.now(); if (last[event] && now - last[event] < 4000) return; last[event] = now;
    try { const lang = (typeof state !== 'undefined' && state.lang) || 'en';
      fetch(URL_, { method: 'POST', keepalive: true, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ event, platform, app_ver: V, lang: lang === 'tr' ? 'tr' : 'en' }) }).catch(() => {}); } catch(_) {} }
  function daily(){ try { const d = new Date().toISOString().slice(0, 10); if (localStorage.getItem('pt-stat-day') === d) return; localStorage.setItem('pt-stat-day', d); } catch(_) {} track('open'); }
  if (window.PTSave && PTSave.save){ const s = PTSave.save; PTSave.save = async function(){ const r = await s.apply(this, arguments); if (['saved','shared','started'].includes(r)) track('export'); return r; }; }
  window.PTStats = { track };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(daily, 1500)); else setTimeout(daily, 1500);
})();
