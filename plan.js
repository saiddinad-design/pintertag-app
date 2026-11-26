/* grid plan: every one of the 9 frames says what goes there (brand or personal rhythm), colour-coded.
   empty frames are coloured cards to fill; filled frames get a colour wash when the plan is on.
   "Plana göre yerleştir" moves photos into the frames whose type they match. */
(function(){
  /* our own palette: muted, dark enough for white text, sits with the black / white / grey brand */
  const C = { detail: '#7E8C7B', look: '#3F4B5D', edit: '#9B7D5E', product: '#6F5C6E', place: '#5E7482', portrait: '#4E5A49', moment: '#8C8578', text: '#A0927A' };
  const ROLE = {
    detail:   { tr: 'Detay',     en: 'Detail',    type: 'detail',  hint: ['Doku, dikiş, takı, yakın plan.', 'Texture, stitching, close-up.'] },
    look:     { tr: 'Look',      en: 'Look',      type: 'person',  hint: ['Ürünü üstünde, boydan.', 'Worn, full length.'] },
    edit:     { tr: 'Editoryal', en: 'Editorial', type: 'person',  hint: ['Kurgulu kare: ışık, poz, hikâye.', 'Styled frame: light, pose, story.'] },
    product:  { tr: 'Ürün',      en: 'Product',   type: 'product', hint: ['Tek ürün, temiz arka plan.', 'One product, clean background.'] },
    place:    { tr: 'Mekân',     en: 'Place',     type: 'place',   hint: ['Atmosfer: mağaza, sokak, oda.', 'Mood: store, street, room.'] },
    portrait: { tr: 'Portre',    en: 'Portrait',  type: 'person',  hint: ['Yüzün, yakın.', 'Your face, close.'] },
    text:     { tr: 'Yazı / süreç', en: 'Note / process', type: 'text', hint: ['Eskiz, el yazısı not, tek cümle.', 'Sketch, handwritten note, one line.'] },
    moment:   { tr: 'An',        en: 'Moment',    type: 'object',  hint: ['Günden bir an: masa, kahve, yol.', 'A moment: table, coffee, road.'] }
  };
  Object.keys(ROLE).forEach(k => ROLE[k].c = C[k]);
  /* read left to right, top to bottom. no two neighbours (side or below) share a role */
  const PLAN = {
    brand:    ['detail', 'look', 'edit', 'product', 'place', 'look', 'edit', 'detail', 'text'],
    personal: ['portrait', 'detail', 'place', 'look', 'moment', 'portrait', 'place', 'look', 'detail']
  };
  const mode = () => state.mode === 'brand' ? 'brand' : 'personal';
  const on = () => state.slotPlan !== false;
  const roleAt = i => ROLE[PLAN[mode()][i % 9]];
  const name = r => T(r.tr, r.en);

  function bar(ids){
    const seg = (v, l) => `<button class="${mode() === v ? 'on' : ''}" data-action="pt-plan-mode" data-v="${v}" aria-pressed="${mode() === v}">${l}</button>`;
    return `<div class="pt-plan-bar"><div class="pt-plan-seg" role="group" aria-label="${T('Hesap türü','Account type')}">${seg('brand', T('Marka','Brand'))}${seg('personal', T('Kişisel','Personal'))}</div>
      <label class="pt-plan-switch"><input type="checkbox" data-plan-toggle ${on() ? 'checked' : ''}><span>${T('Ne nereye gelir','What goes where')}</span></label></div>
      ${on() ? `<p class="pt-plan-note">${T('Her kare ne paylaşacağını söylüyor. Instagram’da 9’dan başla, 1’e doğru paylaş.','Each frame says what to post. On Instagram, post 9 first and work back to 1.')}</p>` : ''}
      ${on() && ids.length >= 2 ? action('pt-plan-fit', T('Plana göre yerleştir','Arrange to the plan'), 'pill pt-plan-fit') : ''}`;
  }
  function slot(i){ const r = roleAt(i);
    return `<button class="pt-slot" data-action="pt-plan-slot" data-i="${i}" style="--c:${r.c};--bg:url('assets/inspo/${mode()}-${i % 9}.webp?v=3')" aria-label="${esc(name(r))}, ${T('fotoğraf ekle','add photo')}"><b>${i + 1}</b><strong>${esc(name(r))}</strong><small>${esc(T(...r.hint))}</small><i aria-hidden="true">＋</i></button>`; }

  const _grid = simpleGrid;
  simpleGrid = function(){
    let h = _grid(); const ids = simpleIds();
    h = h.replace('<div class="simple-feed">', bar(ids) + '<div class="simple-feed">');
    if (!on()) return h;
    let n = 0;
    h = h.replace(/<button class="simple-tile" data-action="s-photo" data-id="[^"]*">/g, m => { const i = n++; if (i > 8) return m; const r = roleAt(i);
      return m + `<span class="pt-slot-tag" style="--c:${r.c}" data-plan="${esc(T('Plan: ','Plan: ') + name(r))}" aria-hidden="true"><b>${i + 1}</b></span>`; });
    if (ids.length < 9){
      h = h.replace(/<button class="grid-placeholder"[^>]*>(?:<span aria-hidden="true">＋<\/span>)?<\/button>/g, '');
      const empty = Array.from({ length: 9 - ids.length }, (_, k) => slot(ids.length + k)).join('');
      const start = h.indexOf('<div class="simple-feed">'), end = h.indexOf('</div><p class="simple-hint">', start);
      if (start >= 0 && end > start) h = h.slice(0, end) + empty + h.slice(end);
    }
    return h;
  };

  /* fill a frame: the next upload takes that frame's type */
  let pending = null;
  const _render = render;
  render = function(){
    if (pending){ const fresh = state.photos.filter(p => !pending.before.has(p.id));
      if (fresh.length){ const p = fresh[0]; if (p.type === 'unknown'){ p.type = pending.type; p.typeSrc = 'plan'; } pending = null; try { save(); } catch(_) {} } }
    return _render.apply(this, arguments); };

  function fit(){
    const before = [...simpleIds()], plan = PLAN[mode()], used = new Set(), out = new Array(before.length).fill(null);
    before.forEach((id, i) => { const p = simplePhoto(id); if (p && p.locked){ out[i] = id; used.add(id); } });
    for (let i = 0; i < Math.min(9, out.length); i++){ if (out[i]) continue; const want = ROLE[plan[i]].type;
      const hit = before.find(id => !used.has(id) && simplePhoto(id) && simplePhoto(id).type === want); if (hit){ out[i] = hit; used.add(hit); } }
    const rest = before.filter(id => !used.has(id)); for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = rest.shift();
    const unknown = before.slice(0, 9).filter(id => simplePhoto(id) && simplePhoto(id).type === 'unknown').length;
    if (out.every((id, i) => id === before[i])){ toast(unknown ? T('Önce karelerin türünü seç, sonra yerleştireyim.','Pick photo types first, then I can arrange.') : T('Grid zaten plana uyuyor.','Your grid already fits the plan.')); return; }
    state.simpleUndo = before; state.simpleOrder = out; try { save(); } catch(_) {} render();
    toast(unknown ? T(`Yerleştirildi. ${unknown} karenin türü belli değil; türünü seçersen daha iyi oturur.`, `Arranged. ${unknown} photos have no type yet; pick them for a better fit.`) : T('Plana göre yerleştirildi. İstersen geri al.','Arranged to the plan. You can undo it.'));
  }

  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pt-plan-mode'){ state.mode = b.dataset.v; try { save(); } catch(_) {} render(); }
    if (a === 'pt-plan-slot'){ pending = { type: roleAt(+b.dataset.i).type, before: new Set(state.photos.map(p => p.id)) }; document.getElementById('upload').click(); }
    if (a === 'pt-plan-fit') fit(); });
  document.addEventListener('change', e => { if (e.target.matches('[data-plan-toggle]')){ state.slotPlan = e.target.checked; try { save(); } catch(_) {} render(); } });
  window.PTPlan = { PLAN, ROLE, fit };
})();
