/* empty calendar: "plan your first post" opens a photo picker, then the date sheet. no detour through the grid. */
(function(){
  function pick(){ const ids = simpleIds().filter(id => { const p = simplePhoto(id); return p && !p.posted && !p.imported; });
    if (!ids.length){ closeModal(); simpleTab = 'grid'; render(); toast(T('Önce grid’ine fotoğraf ekle.','Add photos to your grid first.')); return; }
    modal(T('hangisini planlayalım?','which one should we plan?'), `<p class="small muted">${T('Fotoğrafa dokun, sonra tarih ve saatini seç.','Tap a photo, then choose a date and time.')}</p><div class="pt-pick-grid">${ids.slice(0, 30).map(id => `<button class="pt-pick-tile" data-action="pt-plan-photo" data-id="${esc(id)}">${simpleImage(id)}</button>`).join('')}</div>`); }
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pt-plan-pick'){ e.stopPropagation(); pick(); }
    if (a === 'pt-plan-photo'){ const id = b.dataset.id; closeModal(); setTimeout(() => { simpleTarget = id; simpleDate(id); }, 260); } });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.simple-empty[data-action]')){ e.preventDefault(); pick(); } });
})();
