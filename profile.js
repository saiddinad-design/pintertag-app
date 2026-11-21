/* profile preview: the top of the Instagram profile (photo, counts, name, bio, link, highlights) sits right above the grid,
   so the user sees the whole profile before posting. everything stays on the phone (state.igp). */
(function(){
  const MAX_HL = 5, BIO_MAX = 150;
  const P = () => (state.igp = state.igp || { user: '', name: '', bio: '', link: '', followers: '', following: '', avatar: '', hl: [], hidden: false });
  let draft = null;
  const avatarHtml = (src, cls) => src ? `<img src="${esc(src)}" alt="">` : `<span class="pt-ig-ph${cls ? ' ' + cls : ''}" aria-hidden="true">#</span>`;
  const cover = id => { const p = id && simplePhoto(id); return p ? `<img src="${esc(p.src)}" alt="">` : '<span class="pt-ig-hl-empty" aria-hidden="true"></span>'; };
  const linkText = l => String(l || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  function block(full){
    const p = P(); if (p.hidden) return action('pt-ig-show', T('Profil önizlemesini göster','Show profile preview'), 'text-button pt-ig-showbtn');
    const ids = simpleIds(), empty = !p.bio && !p.name && !p.avatar;
    const stat = (n, l) => `<span><b>${esc(n === '' || n == null ? '–' : String(n))}</b><small>${l}</small></span>`;
    const hl = (p.hl || []).filter(h => h && (h.title || h.cover));
    return `<section class="pt-ig${full ? ' is-full' : ''}" aria-label="${T('Profil önizlemesi','Profile preview')}">
      ${p.user ? `<div class="pt-ig-user">${esc(p.user)}</div>` : ''}
      <div class="pt-ig-head"><button class="pt-ig-avatar" data-action="${full ? 'pt-ig-edit' : 'pt-ig-full'}" aria-label="${T('Profil önizlemesi','Profile preview')}">${avatarHtml(p.avatar)}</button>
        <div class="pt-ig-stats" ${full ? '' : 'data-action="pt-ig-full"'}>${stat(ids.length, T('gönderi','posts'))}${stat(p.followers, T('takipçi','followers'))}${stat(p.following, T('takip','following'))}</div></div>
      ${p.name ? `<div class="pt-ig-name">${esc(p.name)}</div>` : ''}
      ${p.bio ? `<div class="pt-ig-bio">${esc(p.bio)}</div>` : ''}
      ${p.link ? `<div class="pt-ig-link"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>${esc(linkText(p.link))}</div>` : ''}
      ${empty ? `<p class="pt-ig-empty">${T('Fotoğrafını, bio’nu ve öne çıkanlarını ekle; profilin paylaşmadan önce nasıl duracağını gör.','Add your photo, bio and highlights to see your whole profile before you post.')}</p>` : ''}
      ${hl.length ? `<div class="pt-ig-hls">${hl.map(h => `<span class="pt-ig-hl"><i>${cover(h.cover)}</i><small>${esc(h.title || '')}</small></span>`).join('')}</div>` : ''}
      ${action('pt-ig-edit', empty ? T('Profilini ekle','Add your profile') : T('Profili düzenle','Edit profile'), 'pt-ig-btn')}
    </section>`;
  }

  function editor(){
    const d = draft, ids = simpleIds();
    const hlRows = d.hl.map((h, i) => `<div class="pt-ige-hl"><button class="pt-ige-hlc" data-action="pt-ige-cover" data-i="${i}" aria-label="${T('Kapak fotoğrafını değiştir','Change cover')}">${cover(h.cover)}</button>
        <input class="field" data-hl="${i}" maxlength="15" value="${esc(h.title || '')}" placeholder="${T('Başlık','Title')}">
        <button class="icon-button" data-action="pt-ige-hldel" data-i="${i}" aria-label="${T('Kaldır','Remove')}">×</button></div>`).join('');
    modal(T('profil.','profile.'), `<div class="pt-ige">
      <button class="pt-ige-avatar" data-action="pt-ige-avatar">${avatarHtml(d.avatar)}<span>${d.avatar ? T('Fotoğrafı değiştir','Change photo') : T('Profil fotoğrafı ekle','Add profile photo')}</span></button>
      <label class="control-label" for="pt-ige-user">${T('Kullanıcı adı','Username')}</label><input id="pt-ige-user" class="field" maxlength="30" value="${esc(d.user)}" placeholder="${esc(state.campaign?.name || 'pintertag')}" autocapitalize="off" autocorrect="off" spellcheck="false">
      <label class="control-label" for="pt-ige-name">${T('Ad','Name')}</label><input id="pt-ige-name" class="field" maxlength="30" value="${esc(d.name)}">
      <label class="control-label" for="pt-ige-bio">${T('Bio','Bio')} <span class="muted" id="pt-ige-count">${d.bio.length}/${BIO_MAX}</span></label><textarea id="pt-ige-bio" class="field" rows="4" maxlength="${BIO_MAX}">${esc(d.bio)}</textarea>
      <label class="control-label" for="pt-ige-link">${T('Bağlantı','Link')}</label><input id="pt-ige-link" class="field" inputmode="url" autocapitalize="off" value="${esc(d.link)}" placeholder="pintertag.com">
      <div class="pt-ige-two"><div><label class="control-label" for="pt-ige-f">${T('Takipçi','Followers')}</label><input id="pt-ige-f" class="field" maxlength="9" value="${esc(d.followers)}" placeholder="7.985"></div>
        <div><label class="control-label" for="pt-ige-g">${T('Takip','Following')}</label><input id="pt-ige-g" class="field" maxlength="9" value="${esc(d.following)}" placeholder="312"></div></div>
      <p class="small muted">${T('Gönderi sayısı grid’indeki karelerden gelir.','The post count comes from the photos in your grid.')}</p>
      <div class="control-label">${T('Öne çıkanlar','Highlights')}</div>
      <p class="small muted">${ids.length ? T('Kapağı değiştirmek için daireye dokun.','Tap a circle to change its cover.') : T('Kapak seçmek için önce grid’ine fotoğraf ekle.','Add photos to your grid to pick covers.')}</p>
      ${hlRows}
      ${d.hl.length < MAX_HL ? action('pt-ige-hladd', '＋ ' + T('Öne çıkan ekle','Add highlight'), 'text-button') : ''}
      <label class="checkline"><input id="pt-ige-show" type="checkbox" ${d.hidden ? '' : 'checked'}>${T('Grid ekranında göster','Show on the grid screen')}</label>
      <div class="actions">${action('pt-ige-save', T('Kaydet','Save'), 'pill solid')}</div></div>`);
  }
  function pull(){ const v = id => (document.getElementById(id) || {}).value; if (!document.getElementById('pt-ige-user')) return;
    Object.assign(draft, { user: (v('pt-ige-user') || '').trim().replace(/^@/, ''), name: (v('pt-ige-name') || '').trim(), bio: (v('pt-ige-bio') || '').slice(0, BIO_MAX), link: (v('pt-ige-link') || '').trim(),
      followers: (v('pt-ige-f') || '').trim(), following: (v('pt-ige-g') || '').trim(), hidden: !document.getElementById('pt-ige-show').checked });
    document.querySelectorAll('[data-hl]').forEach(el => { const h = draft.hl[+el.dataset.hl]; if (h) h.title = el.value.trim(); }); }
  function open(){ draft = JSON.parse(JSON.stringify(P())); draft.hl = draft.hl || []; editor(); }

  /* profile photo: square-cropped to 320 px so it stays small in storage */
  const pick = document.createElement('input'); pick.type = 'file'; pick.accept = 'image/*'; pick.hidden = true; document.body.appendChild(pick);
  pick.onchange = async () => { const f = pick.files && pick.files[0]; pick.value = ''; if (!f || !draft) return; const url = URL.createObjectURL(f);
    try { const im = await loadImg(url), s = Math.min(im.naturalWidth, im.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 320;
      c.getContext('2d').drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 320, 320); pull(); draft.avatar = c.toDataURL('image/jpeg', .85); editor(); }
    catch(_) { toast(T('Fotoğraf açılamadı.','Could not open photo.')); } finally { URL.revokeObjectURL(url); } };

  document.addEventListener('input', e => { if (e.target.id === 'pt-ige-bio'){ const c = document.getElementById('pt-ige-count'); if (c) c.textContent = e.target.value.length + '/' + BIO_MAX; } });
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pt-ig-edit') open();
    if (a === 'pt-ig-full') modal(T('profilin.','your profile.'), block(true));
    if (a === 'pt-ig-show'){ P().hidden = false; try { save(); } catch(_) {} render(); }
    if (a === 'pt-ige-avatar'){ pull(); pick.click(); }
    if (a === 'pt-ige-hladd'){ pull(); const ids = simpleIds(), used = draft.hl.map(h => h.cover); draft.hl.push({ title: '', cover: ids.find(id => !used.includes(id)) || ids[0] || '' }); editor(); }
    if (a === 'pt-ige-hldel'){ pull(); draft.hl.splice(+b.dataset.i, 1); editor(); }
    if (a === 'pt-ige-cover'){ pull(); const ids = simpleIds(), h = draft.hl[+b.dataset.i]; if (!ids.length || !h) return; h.cover = ids[(ids.indexOf(h.cover) + 1) % ids.length]; editor(); }
    if (a === 'pt-ige-save'){ pull(); draft.hl = draft.hl.filter(h => h.title || h.cover); state.igp = draft; draft = null;
      try { save(); } catch(_) {} closeModal(); render(); toast(state.igp.hidden ? T('Kaydedildi. Önizleme gizlendi.','Saved. The preview is hidden.') : T('Profil kaydedildi.','Profile saved.')); } });

  const _grid = simpleGrid;
  simpleGrid = function(){ const h = _grid(); return h.replace('<div class="simple-feed">', block() + '<div class="simple-feed">'); };
  window.PTProfile = { open, block };
})();
