/* motion: apple-style feel. presses answer the finger, sheets rise on a spring, tabs slide in, everything stops under reduced motion. */
(function(){
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('touchstart', () => {}, { passive: true }); // lets :active fire on iOS Safari
  const d = document.getElementById('modal'); let timer = null;
  /* sheet close: slide down first, then close. a new modal() during the slide cancels it. */
  const _close = closeModal;
  closeModal = function(){ if (!d.open || reduce() || d.classList.contains('plan-page')){ clearTimeout(timer); d.classList.remove('pt-closing'); return _close(); }
    if (timer) return; d.classList.add('pt-closing'); timer = setTimeout(() => { timer = null; d.classList.remove('pt-closing'); _close(); }, 170); };
  document.getElementById('close-modal').onclick = () => closeModal();
  d.addEventListener('cancel', e => { if (!reduce() && !d.classList.contains('plan-page')){ e.preventDefault(); closeModal(); } });
  const _modal = modal;
  modal = function(t, c){ if (timer){ clearTimeout(timer); timer = null; d.classList.remove('pt-closing'); }
    const was = d.open; _modal(t, c); if (was && !reduce()){ const b = document.getElementById('modal-body'); b.classList.remove('pt-swap'); void b.offsetWidth; b.classList.add('pt-swap'); } };
  /* tab change: the new screen slides in from the side it came from */
  const order = { 's-grid': 0, 's-calendar': 1, 's-settings': 2 }; let cur = 0;
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b || !(b.dataset.action in order)) return;
    const n = order[b.dataset.action], dir = n >= cur ? 1 : -1; cur = n; if (reduce()) return;
    const m = document.querySelector('#main > *'); if (!m) return; m.style.setProperty('--pt-dir', dir); m.classList.remove('pt-enter'); void m.offsetWidth; m.classList.add('pt-enter'); });
  /* a light tick on android for the moments that matter (iOS Safari has no vibration api) */
  const tick = ['s-accept', 'm-done', 'm-share', 'm-gc-keep', 'calm', 'm-p-grid'];
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b && tick.includes(b.dataset.action) && navigator.vibrate) try { navigator.vibrate(8); } catch(_){} });
})();
