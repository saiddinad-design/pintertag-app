/* progress: the grid harmony score is logged once a day, so the user sees a result over time ("68 four weeks ago, 86 now").
   free shows the last 7 days, pro the whole history. the score measures visual harmony only, not reach or engagement. */
(function(){
  const DAY = 864e5, FREE_DAYS = 7;
  const iso = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const log = () => state.scoreLog || (state.scoreLog = []);
  function current(){ const ms = simpleIds().slice(0, 9).map(simplePhoto).filter(p => p && !p.imported && p.m).map(p => p.m);
    if (ms.length < 3 || !window.__PT) return null; const s = window.__PT.scoreGrid(ms); return s ? s.total : null; }
  function record(){ const s = current(); if (s === null) return; const l = log(), d = iso(Date.now()), last = l[l.length - 1];
    if (last && last.d === d){ if (last.s === s) return; last.s = s; } else l.push({ d, s });
    if (l.length > 400) l.splice(0, l.length - 400); save(); }
  const pro = () => !window.PTAcct || PTAcct.isPro();
  const visible = () => { const l = log(); if (pro()) return l; const from = iso(Date.now() - (FREE_DAYS - 1) * DAY); return l.filter(x => x.d >= from); };
  function delta(){ const l = log(); if (l.length < 2) return null; const from = iso(Date.now() - 28 * DAY), base = l.find(x => x.d >= from) || l[0], now = l[l.length - 1];
    if (base === now) return null; const days = Math.round((Date.parse(now.d) - Date.parse(base.d)) / DAY); return { v: now.s - base.s, days }; }
  const ago = n => n >= 14 ? T(`${Math.round(n / 7)} haftada`, `in ${Math.round(n / 7)} weeks`) : T(`${n} günde`, `in ${n} day${n > 1 ? 's' : ''}`);

  function chart(rows){ const W = 340, H = 170, L = 30, R = 12, Tp = 16, B = 26;
    if (rows.length < 2) return '';
    const t0 = Date.parse(rows[0].d), t1 = Date.parse(rows[rows.length - 1].d), lo = Math.max(0, Math.min(...rows.map(r => r.s)) - 8), hi = Math.min(100, Math.max(...rows.map(r => r.s)) + 6);
    const X = d => L + (t1 === t0 ? 0 : (Date.parse(d) - t0) / (t1 - t0)) * (W - L - R), Y = s => Tp + (1 - (s - lo) / (hi - lo || 1)) * (H - Tp - B);
    const pts = rows.map(r => `${X(r.d).toFixed(1)},${Y(r.s).toFixed(1)}`).join(' '), last = rows[rows.length - 1], first = rows[0];
    const lbl = d => { const m = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'], e = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${Number(d.slice(8))} ${(state.lang === 'en' ? e : m).at(Number(d.slice(5, 7)) - 1)}`; };
    const grid = [lo, Math.round((lo + hi) / 2), hi].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="m-pg-grid"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="m-pg-ax">${Math.round(v)}</text>`).join('');
    return `<svg class="m-pg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('Grid uyumu zaman içinde','Grid harmony over time')}">${grid}
      <polyline points="${pts}" class="m-pg-line"/>${rows.map(r => `<circle cx="${X(r.d).toFixed(1)}" cy="${Y(r.s).toFixed(1)}" r="${r === last ? 5 : 2.5}" class="${r === last ? 'm-pg-now' : 'm-pg-dot'}"/>`).join('')}
      <text x="${L}" y="${H - 6}" class="m-pg-ax">${lbl(first.d)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="m-pg-ax">${lbl(last.d)}</text></svg>`; }

  function open(){ record(); const all = log(), rows = visible(), now = all[all.length - 1], dl = delta(), hidden = all.length - rows.length;
    if (!now){ modal(T('ilerlemen.','your progress.'), `<p class="m-reason">${T('Grid’inde en az 3 fotoğraf olunca uyum puanın her gün kaydedilir ve burada birikir.','Once your grid has 3 photos, your harmony score is logged daily and builds up here.')}</p>`); return; }
    const best = Math.max(...all.map(x => x.s));
    modal(T('ilerlemen.','your progress.'), `<div class="m-pg-head"><div><b>${now.s}</b><small>${T('bugünkü uyum','harmony today')}</small></div>
      ${dl ? `<div class="m-pg-delta ${dl.v >= 0 ? 'up' : 'down'}"><b>${dl.v >= 0 ? '+' : ''}${dl.v}</b><small>${ago(dl.days)}</small></div>` : ''}<div><b>${best}</b><small>${T('en iyi','best')}</small></div></div>
      ${rows.length >= 2 ? chart(rows) : `<p class="m-reason">${T('Yarın tekrar bak: puanın her gün kaydediliyor, çizgin burada büyüyecek.','Check back tomorrow: your score is logged daily and your line grows here.')}</p>`}
      ${hidden > 0 ? `<button class="m-pg-lock" data-action="m-pw-open" data-ctx="progress"><span aria-hidden="true"><svg class="pt-ico" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><rect x="2" y="7" width="10" height="8" rx="2" fill="currentColor"/><path d="M4.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></span><span><b>${T(`Önceki ${hidden} gün Pro’da`, `${hidden} earlier days are Pro`)}</b><small>${T('Ücretsizde son 7 gün görünür. Tüm geçmişi 7 gün ücretsiz dene.','Free shows the last 7 days. Try Pro free for 7 days.')}</small></span></button>` : ''}
      <p class="small muted space">${T('Puan; ilk 9 karenin ışık ve renk tutarlılığından hesaplanır. Görsel uyumu ölçer, etkileşim ya da takipçi verisi değildir.','The score comes from how consistent light and colour are across your top 9. It measures visual harmony, not engagement or followers.')}</p>
      <div class="actions">${action('m-prog-arrange', T('Puanı yükselt: benim için düzenle','Raise it: arrange for me'), 'pill solid')}</div>`); }

  const _grid = simpleGrid;
  simpleGrid = function(){ const h = _grid(), now = log()[log().length - 1], dl = delta(), lab = '<span>' + T('Senin grid’in','Your grid') + '</span>';
    if (!now || h.indexOf(lab) < 0) return h;
    return h.replace(lab, `<button class="m-prog" data-action="m-prog">${T('Senin grid’in','Your grid')} · ${T('uyum','harmony')} <b>${now.s}</b>${dl && dl.v ? ` <em class="${dl.v > 0 ? 'up' : 'down'}">${dl.v > 0 ? '↑' : '↓'} ${Math.abs(dl.v)}</em>` : ''}</button>`); };
  let pending = false; const _render = render;
  render = function(){ _render(); if (pending) return; pending = true; setTimeout(() => { pending = false; const before = JSON.stringify(log().slice(-1)); record(); if (JSON.stringify(log().slice(-1)) !== before && !settingsScreen && !document.getElementById('modal').open) _render(); }, 400); };
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return;
    if (b.dataset.action === 'm-prog') open();
    if (b.dataset.action === 'm-prog-arrange'){ closeModal(); setTimeout(() => simpleArrange(), 200); } });
  window.__PTProgress = { record, current, delta, open };
  render();
})();
