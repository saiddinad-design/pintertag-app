/* A brief brand entrance, once per tab session. Never blocks input or readiness. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    if (sessionStorage.getItem('pintertag-launch-seen')) return;
    sessionStorage.setItem('pintertag-launch-seen', '1');
  } catch (_) { /* Storage can be unavailable in private browsing. */ }
  const screen = document.createElement('div');
  screen.className = 'brand-launch';
  screen.setAttribute('aria-hidden', 'true');
  try {
    if (JSON.parse(localStorage.getItem('pintertag-demo-v1') || '{}').theme === 'dark') screen.classList.add('is-dark');
  } catch (_) {}
  screen.innerHTML = '<div class="brand-launch-mark"><img src="assets/logo.png" alt="" width="42" height="50"><span>pintertag</span></div>';
  document.body.append(screen);
  const dismiss = () => screen.remove();
  screen.addEventListener('animationend', event => {
    if (event.target === screen) dismiss();
  });
  // Also remove when animations are overridden or interrupted.
  setTimeout(dismiss, 1100);
  window.addEventListener('pagehide', dismiss, { once: true });
})();
