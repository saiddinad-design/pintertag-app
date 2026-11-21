/* home order: the grid is the first thing you see. profile, account type and the 9 frames come first,
   the main actions sit right under the grid, and the extra tools (today's pick, import, vibe, booth)
   move into one small sideways row below. the cards themselves are untouched, only their place. */
(function(){
  const _render = render;
  render = function(){
    const out = _render.apply(this, arguments);
    try { arrange(); } catch(_) {}
    return out;
  };
  function arrange(){
    const app = document.querySelector('#main > .simple-app'); if (!app) return;
    const q = s => app.querySelector(':scope > ' + s);
    const head = q('.simple-profile'), tools = q('.simple-tools'), note = q('.m-note'), ig = q('.pt-ig, .pt-ig-showbtn'),
      bar = q('.pt-plan-bar'), pnote = q('.pt-plan-note'), fit = q('.pt-plan-fit'), feed = q('.simple-feed'), hint = q('.simple-hint');
    if (!feed) return;
    /* already in order: nothing loose above the grid → leave it (keeps the observer from looping) */
    const loose = app.querySelector(':scope > .m-today, :scope > .m-import, :scope > .m-vibe-card') || (note && note.compareDocumentPosition(feed) & 4);
    if (!loose && (!tools || feed.compareDocumentPosition(tools) & 4) && (!ig || ig.compareDocumentPosition(feed) & 4)) return;
    /* always the same 4 tools in the same order; one that has nothing to work on yet asks for photos first */
    const pick = sel => q(sel) || null;
    const found = [pick('.m-today'), pick('.m-import:not(.pt-booth-cta)'), pick('.pt-booth-cta'), pick('.m-vibe-card')];
    const want = ['m-today', 'm-shot', 'pt-booth-open', 'm-vibe-pick'];
    const extras = (found.some(Boolean) || !q('.pt-home-tools')) ? found.map((e, i) => { if (e) return e;
      const f = document.createElement('button'); f.dataset.action = 'pt-tile-need'; f.dataset.want = want[i]; return f; }) : [];
    /* tools: rebuilt as equal tiles (same size, same parts), each carrying the original card's action */
    let strip = q('.pt-home-tools');
    if (extras.length){
      if (!strip){ strip = document.createElement('div'); strip.className = 'pt-home-tools'; }
      const ICON = {
        'm-today': '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
        'm-shot': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>',
        'pt-booth-open': '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
        'm-vibe-pick': '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>'
      };
      const COPY = {
        'm-today': [T('Bugünün önerisi','Today’s pick'), T('Tek öneri, nedeniyle.','One pick, with the reason.')],
        'm-shot': [T('Instagram grid’in','Your Instagram grid'), T('Ekran görüntüsünden puan ve vibe.','Score and vibe from a screenshot.')],
        'pt-booth-open': [T('Kabin','Booth'), T('Tekli, 3’lü ya da 4’lü şerit.','Single, 3 or 4 frame strip.')],
        'm-vibe-pick': [T('Hedef vibe','Target vibe'), T('Neyi çekeceğini söyler.','Tells you what to shoot.')]
      };
      const tiles = extras.map(e => { const a = e.dataset.want || e.dataset.action || '', b = e.querySelector('b'), sm = e.querySelector('small');
        const dots = e.querySelector('.m-vibe-dots'), c = COPY[a], bt = b ? b.textContent.trim() : '', st = sm ? sm.textContent.trim() : '';
        const title = c ? c[0] : bt, sub = a === 'm-vibe-pick' && /%/.test(bt) ? bt : (c ? c[1] : st);
        const data = [...e.attributes].filter(x => x.name.startsWith('data-')).map(x => `${x.name}="${esc(x.value)}"`).join(' ');
        const ico = dots ? `<span class="pt-tile-ico is-dots">${dots.innerHTML}</span>` : `<span class="pt-tile-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[a] || ICON['m-shot']}</svg></span>`;
        return `<button class="pt-tile" ${data}>${ico}<span class="pt-tile-go" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 14 14"><path d="M4 10L10 4M5 4h5v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span><b>${esc(title)}</b><small>${esc(sub)}</small></button>`; }).join('');
      strip.innerHTML = `<h3>${T('Araçlar','Tools')}</h3><div class="pt-home-grid${extras.length % 2 ? ' is-odd' : ''}">${tiles}</div>`;
      extras.forEach(e => e.remove());
    }
    if (hint) hint.hidden = !!pnote;
    if (tools) tools.classList.add('pt-home-actions');
    if (note) note.classList.add('pt-home-note');
    const order = [head, ig, bar, feed, tools, note, fit, pnote, hint, strip].filter(Boolean);
    const rest = [...app.children].filter(c => !order.includes(c));
    order.forEach(n => app.appendChild(n)); rest.forEach(n => app.appendChild(n));
    fitGrid();
  }
  /* phone: the name, profile row and all 9 frames fit on the first screen, like an Instagram profile.
     if the screen is short (Claude's own bars, small phones), the grid gets a little narrower instead of running under the menu. */
  function fitGrid(){
    const app = document.querySelector('#main > .simple-app'), feed = app && app.querySelector(':scope > .simple-feed'); if (!feed) return;
    feed.style.width = ''; feed.classList.remove('is-tight');
    if (matchMedia('(hover:hover) and (pointer:fine) and (min-width:700px)').matches) return;
    const nav = document.getElementById('appnav'), r = feed.getBoundingClientRect();
    const bottom = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : innerHeight;
    const avail = bottom - (r.top + scrollY) - 8, full = r.width, need = (full - 8) * 4 / 3 + 8;
    if (avail <= 0 || need <= avail) return;
    const w = Math.max(250, Math.round((avail - 8) * 3 / 4 + 8));
    if (w < full){ feed.style.width = w + 'px'; feed.style.marginLeft = feed.style.marginRight = 'auto'; if (w < 330) feed.classList.add('is-tight'); }
  }
  addEventListener('resize', () => { try { fitGrid(); } catch(_) {} });
  /* some screens re-draw the grid without render(): follow the page instead */
  let raf = 0; const main = document.getElementById('main');
  if (main) new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { try { arrange(); } catch(_) {} }); }).observe(main, { childList: true, subtree: true });
  document.addEventListener('click', e => { const b = e.target.closest('[data-action="pt-tile-need"]'); if (!b) return;
    toast(T('Bunun için önce grid’ine fotoğraf ekle.','Add photos to your grid first.')); const u = document.getElementById('upload'); if (u) u.click(); });
  window.PTHome = { arrange };
  /* the first screen is drawn before the later modules (profile, plan, tools) load: draw it once more so a new user sees all of it */
  try { render(); } catch(_) {}
})();
