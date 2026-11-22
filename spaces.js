/* two accounts in one app: "Marka" and "Kişisel" each keep their own grid, profile, order and plans.
   switching puts the current account away in state.spaces and brings the other one back.
   photos stay in the device database; only short references are kept for the account that is put away. */
(function(){
  const KEYS = ['photos', 'plans', 'result', 'previousResult', 'simpleOrder', 'simpleUndo', 'hiddenGrid', 'gridRemoved',
    'storyMedia', 'storyIds', 'igp', 'vibeTarget', 'seriesMain', 'campaign', 'scoreLog', 'simpleRemovedPlan', 'removedPlan', 'before', 'reorder'];
  const FRESH = { photos: [], plans: [], result: [], simpleOrder: [] };
  const cur = () => state.mode === 'brand' ? 'brand' : 'personal';
  let busy = false;
  async function to(m){
    m = m === 'brand' ? 'brand' : 'personal'; if (busy || m === cur()) return; busy = true;
    try {
      state.spaces = state.spaces || {};
      const away = {}; KEYS.forEach(k => { if (state[k] !== undefined) away[k] = state[k]; });
      state.spaces[cur()] = away;
      const next = state.spaces[m] || FRESH; delete state.spaces[m];
      KEYS.forEach(k => { if (next[k] !== undefined) state[k] = JSON.parse(JSON.stringify(next[k])); else delete state[k]; });
      Object.keys(FRESH).forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
      state.mode = m;
      if (window.PTStore) await PTStore.hydrate(state);
      try { save(); } catch(_) {}
      if (typeof closeModal === 'function' && document.getElementById('modal')?.open && !document.querySelector('.settings-content')) closeModal();
      render();
      if (document.querySelector('.settings-content') && typeof simpleSettings === 'function') simpleSettings();
      toast(m === 'brand' ? T('Marka hesabı açıldı.','Brand account.') : T('Kişisel hesap açıldı.','Personal account.'));
    } finally { busy = false; }
  }
  /* catch the account buttons first (plan bar and settings) so the switch always moves the grid with it */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action="pt-plan-mode"], [data-action="s-mode-choice"]'); if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    to(b.dataset.v || b.dataset.value);
  }, true);
  window.PTSpaces = { to, KEYS };
})();
