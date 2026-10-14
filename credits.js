/* AI credits + consent. every AI-labelled photo costs 1 credit (free 20/month, pro 500/month).
   nothing leaves the device for AI unless the user has switched AI labelling on (state.aiConsent). */
(function(){
  const month = () => new Date().toISOString().slice(0, 7);
  const C = window.PTCredits = {
    limit(){ return window.PTAcct && PTAcct.isPro() ? 500 : 20; },
    left(){ let c = state.credits; if (!c || c.month !== month()){ c = state.credits = { month: month(), used: 0 }; } return Math.max(0, C.limit() - c.used); },
    used(){ C.left(); return state.credits.used; },
    spend(n){ C.left(); state.credits.used += n; save(); }
  };
  let warned = false;
  function hint(text){ if (warned) return; warned = true; setTimeout(() => toast(text), 600); }
  /* the platform namespace is never modified; merge.js asks this wrapper instead */
  C.sample = async function(){
    const cap = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('sample') : null;
    if (!cap) return null;
    return { json: async (prompt, opts) => {
      if (!state.aiConsent){ if (!state.aiHintShown){ state.aiHintShown = true; save(); hint(T('AI etiketleme kapalı. Açmak için Ayarlar > Gizlilik.','AI tagging is off. Turn it on in Settings > Privacy.')); } return { tags: [] }; }
      const n = parseInt((String(prompt).match(/shows (\d+) photos/) || [])[1], 10) || 1;
      if (C.left() < n){ hint(T(`Bu ayki AI kredin bitti (${C.limit()}). Türleri kendin seçebilir ya da Pro’ya geçebilirsin.`, `You’ve used this month’s AI credits (${C.limit()}). Pick types yourself or go Pro.`)); return { tags: [] }; }
      const r = await cap.json(prompt, opts); const got = r && Array.isArray(r.tags) ? Math.min(n, r.tags.length) : 0; if (got) C.spend(got); return r; } };
  };
})();
