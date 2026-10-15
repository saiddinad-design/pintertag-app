/* Brand intro: the # pin assembles stroke by stroke, then slides left while "pintertag" types in.
   Once per app open (session), ~2.3 s, tap to skip. Never blocks the app underneath. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.webdriver && !/[?&]intro=1/.test(location.search)) return; /* automated tests */
  try { if (sessionStorage.getItem('pintertag-launch-seen')) return; sessionStorage.setItem('pintertag-launch-seen', '1'); } catch (_) {}
  let dark = false; try { dark = JSON.parse(localStorage.getItem('pintertag-demo-v1') || '{}').theme === 'dark'; } catch (_) {}
  const el = document.createElement('div');
  el.className = 'pt-intro' + (dark ? ' is-dark' : ''); el.setAttribute('aria-hidden', 'true');
  const letters = 'pintertag'.split('').map((c, i) => `<i style="--i:${i}">${c}</i>`).join('');
  el.innerHTML = `<div class="pt-intro-lockup">
    <svg class="pt-intro-mark" viewBox="0 0 319 357" width="40" height="45">
      <path class="s s1" d="M128 34 L104 320" pathLength="1"/>
      <polygon class="f f2" points="208,84 238,84 199,350 195,350"/>
      <path class="s s3" d="M26 132 L302 132" pathLength="1"/>
      <path class="s s4" d="M20 222 L292 222" pathLength="1"/>
      <circle class="f f5" cx="228" cy="45" r="44"/>
    </svg><span class="pt-intro-word"><span>${letters}</span></span></div>`;
  document.body.append(el);
  const word = el.querySelector('.pt-intro-word');
  const lock = el.querySelector('.pt-intro-lockup'); lock.style.setProperty('--shift', (word.offsetWidth / 2) + 'px'); void lock.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));
  let gone = false; const done = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 380); };
  setTimeout(done, 2300); el.addEventListener('pointerdown', done); addEventListener('pagehide', () => el.remove(), { once: true });
})();
