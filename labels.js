/* fast labelling: one big photo, four big answers, auto-advance. 9 taps and the grid can be arranged properly.
   replaces the old dropdown list (captured before app.js sees the click). */
(function(){
  const MAIN = [['person', 'Kişi / kombin', 'Person / outfit'], ['detail', 'Detay', 'Detail'], ['product', 'Ürün', 'Product'], ['place', 'Mekân', 'Place']];
  const MORE = [['object', 'Obje', 'Object'], ['text', 'Yazı', 'Text'], ['break', 'Mola', 'Break']];
  let queue = [], at = 0, thenArrange = false;
  function open(arrangeAfter){
    const top = simpleIds().slice(0, 9).map(simplePhoto).filter(p => p && !p.imported);
    const rest = top.filter(p => p.type === 'unknown');
    queue = (rest.length ? rest : top).map(p => p.id); at = 0; thenArrange = arrangeAfter;
    if (!queue.length){ toast(T('Etiketlenecek kare yok.','Nothing to label.')); return; } show(); }
  function show(){ const id = queue[at], p = simplePhoto(id); if (!p){ finish(); return; }
    const btn = ([k, tr, en]) => `<button class="pt-lb-btn ${p.type === k ? 'on' : ''}" data-action="pt-lb-set" data-type="${k}">${T(tr, en)}</button>`;
    modal(T('bu kare ne gösteriyor?','what does this photo show?'), `<div class="pt-lb">
      <div class="pt-lb-top"><span>${at + 1} / ${queue.length}</span>${at > 0 ? `<button class="text-button" data-action="pt-lb-back">${T('Geri','Back')}</button>` : '<span></span>'}</div>
      <div class="pt-lb-photo">${simpleImage(id)}</div>
      <div class="pt-lb-main">${MAIN.map(btn).join('')}</div>
      <div class="pt-lb-more">${MORE.map(btn).join('')}<button class="pt-lb-btn ghost" data-action="pt-lb-skip">${T('Atla','Skip')}</button></div>
      <p class="small muted">${T('Kişi / kombin: yüzün ya da kombinin göründüğü kare. Detay: yakın çekim (ayakkabı, kumaş, aksesuar).','Person / outfit: your face or full look. Detail: a close-up (shoes, fabric, accessory).')}</p></div>`); }
  function finish(){ closeModal(); render(); const n = simpleIds().slice(0, 9).map(simplePhoto).filter(p => p && p.type === 'unknown').length;
    if (thenArrange || n === 0){ setTimeout(() => { const b = document.createElement('button'); b.dataset.action = 'm-p-grid'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }, 280); }
    else toast(T(`${n} kare hâlâ işaretsiz.`, `${n} photos still unlabelled.`)); }
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'label-photos'){ e.stopImmediatePropagation(); e.preventDefault(); open(true); return; }
    if (a === 'pt-lb-set'){ const p = simplePhoto(queue[at]); if (p){ p.type = b.dataset.type; p.typeTried = true; save(); } b.classList.add('on');
      if (navigator.vibrate) try { navigator.vibrate(8); } catch(_) {}
      setTimeout(() => { at++; at < queue.length ? show() : finish(); }, 160); return; }
    if (a === 'pt-lb-skip'){ at++; at < queue.length ? show() : finish(); return; }
    if (a === 'pt-lb-back'){ at = Math.max(0, at - 1); show(); } }, true);
  window.PTLabels = { open };
})();
