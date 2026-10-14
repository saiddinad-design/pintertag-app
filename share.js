/* posting moment: when a plan is due, one tap sends its photos to the phone's share sheet (choose instagram there)
   and copies the caption. reminders go to the phone's own calendar. nothing is posted automatically. */
(function(){
  const pad2 = n => String(n).padStart(2,'0');
  async function saveBlob(blob, name){ const r = await PTSave.save(name, blob); return ['saved','shared','started'].includes(r); }
  const planOf = id => state.plans.find(p => p.id === id);
  const kindOf = p => p.purpose === 'story' ? 'Story' : p.photos.length > 1 ? 'Carousel' : 'Post';
  const when = p => new Date(p.date + 'T' + (p.time || '19:00'));

  /* reminders: an .ics file with two alerts, ten minutes before and on time */
  calendarFile = async function(id){ const p = planOf(id); if (!p) return; const d = when(p);
    const utc = x => x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const clean = s => String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const title = `Pintertag · ${kindOf(p)} ${T('paylaşma zamanı','time to post')}`;
    const body = T('Pintertag’i aç, “Instagram’da paylaş”a dokun.','Open Pintertag and tap “Share on Instagram”.') + (p.caption ? '\n\n' + p.caption : '');
    const alarm = tr => ['BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:' + clean(title),'TRIGGER:' + tr,'END:VALARM'];
    const text = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pintertag//Plan//TR','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:' + p.id + '@pintertag','DTSTAMP:' + utc(new Date()),
      'DTSTART:' + utc(d),'DTEND:' + utc(new Date(d.getTime() + 15*60000)),'SUMMARY:' + clean(title),'DESCRIPTION:' + clean(body),...alarm('-PT10M'),...alarm('PT0M'),'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const ok = await saveBlob(new Blob([text], { type:'text/calendar' }), `pintertag-${p.date}-${(p.time||'').replace(':','')}.ics`);
    toast(ok ? T('Takvim dosyası hazır. Açınca telefonunun takvimine eklenir; paylaşmadan 10 dakika önce hatırlatır.','Calendar file ready. Open it to add it to your phone’s calendar; it reminds you 10 minutes before.') : T('Takvim dosyası kaydedilemedi.','Could not save the calendar file.')); };

  /* share: photos to the share sheet, caption to the clipboard */
  async function fileOf(src, name){ const r = await fetch(src); const b = await r.blob(); const type = b.type && b.type.startsWith('image/') ? b.type : 'image/jpeg';
    return new File([b], name.replace(/\.\w+$/, type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg'), { type }); }
  async function sharePlan(id){ const p = planOf(id); if (!p) return; const photos = p.photos.map(x => simplePhoto(x)).filter(Boolean);
    if (!photos.length){ toast(T('Bu planın fotoğrafı bulunamadı.','This plan has no photo.')); return; }
    let copied = false; if (p.caption){ try { await navigator.clipboard.writeText(p.caption); copied = true; } catch(_){} }
    let files = []; try { files = await Promise.all(photos.map((x,i) => window.PTHQ ? PTHQ.exportFile(x, `pintertag-${p.date}-${i+1}.jpg`) : fileOf(x.src, `pintertag-${p.date}-${i+1}.jpg`))); } catch(_){ files = []; }
    if (files.length && navigator.canShare && navigator.canShare({ files })){
      try { await navigator.share({ files }); toast(copied ? T('Instagram’ı seçtiysen caption’ı yapıştır; panoda hazır.','If you picked Instagram, paste the caption; it’s on your clipboard.') : T('Instagram’da paylaştıktan sonra “Paylaştım”a dokun.','After posting on Instagram, tap “I posted it”.')); return; }
      catch(e){ if (e && e.name === 'AbortError') return; } }
    let saved = 0; for (const f of files) if (await saveBlob(f, f.name)) saved++;
    toast(saved ? T(`${saved} fotoğraf kaydedildi${copied ? ', caption panoya kopyalandı' : ''}. Instagram’ı açıp paylaş.`, `${saved} photo${saved>1?'s':''} saved${copied ? ', caption copied' : ''}. Open Instagram to post.`) : T('Bu tarayıcı paylaşım menüsünü açamadı.','This browser could not open the share sheet.')); }
  function markDone(id){ const p = planOf(id); if (!p) return; p.done = !p.done;
    if (p.done && p.purpose !== 'story') p.photos.forEach(x => { const ph = simplePhoto(x); if (ph){ ph.posted = true; ph.locked = true; } });
    save(); closeModal(); render(); toast(p.done ? T('Paylaşıldı olarak işaretlendi. Bu kare artık grid’inde yerinde kalır.','Marked as posted. This photo now stays in place in your grid.') : T('İşaret kaldırıldı.','Unmarked.')); }

  const box = p => `<div class="m-share"><p class="m-share-h">${p.done ? '✓ ' + T('Instagram’da paylaşıldı','Posted on Instagram') : T('Paylaşım anı','Posting moment')}</p>
    <div class="m-share-row">${action('m-share', T('Instagram’da paylaş','Share on Instagram'), 'pill solid', `data-plan="${esc(p.id)}"`)}${action('calendar', T('Takvimime ekle','Add to my calendar'), 'pill', `data-id="${esc(p.id)}"`)}</div>
    ${action('m-done', p.done ? T('İşareti kaldır','Unmark') : T('Paylaştım ✓','I posted it ✓'), 'text-button', `data-plan="${esc(p.id)}"`)}
    <p class="small muted">${T('Otomatik paylaşım yok: fotoğraflar telefonunun paylaşım menüsüne gelir, oradan Instagram’ı seçersin; caption panoya kopyalanır.','No automatic posting: photos open in your phone’s share sheet, you pick Instagram there; the caption is copied for you.')}</p></div>`;
  const _date = simpleDate;
  simpleDate = function(id, planId){ _date(id, planId); const p = state.plans.find(x => planId ? x.id === planId : x.photos?.[0] === id && x.purpose !== 'story'); if (!p) return;
    const f = document.getElementById('simple-date-form'); if (f) f.insertAdjacentHTML('beforebegin', box(p)); };

  /* due now: one card at the top when a plan's time has come */
  function due(){ const now = Date.now(); return state.plans.filter(p => !p.done && p.photos?.length && when(p).getTime() - now < 30*60000 && now - when(p).getTime() < 6*3600000).sort((a,b) => when(a) - when(b))[0]; }
  function dueCard(){ const p = due(); if (!p) return '';
    return `<div class="m-due"><div class="m-due-img">${simpleImage(p.photos[0])}</div><div><b>${T('Paylaşım zamanı','Time to post')} · ${esc(p.time)}</b><small>${kindOf(p)}${p.caption ? ' · ' + esc(p.caption.split('\n')[0].slice(0,40)) : ''}</small></div>${action('m-share', T('Paylaş','Share'), 'pill solid', `data-plan="${esc(p.id)}"`)}</div>`; }
  const _grid = simpleGrid; simpleGrid = function(){ const h = _grid(), c = dueCard(); return c ? h.replace('<div class="simple-tools">', c + '<div class="simple-tools">') : h; };
  const _cal = simpleCalendar; simpleCalendar = function(){ const h = _cal(), c = dueCard(); return c ? c + h : h; };
  const _render = render; render = function(){ _render();
    state.plans.filter(p => p.done).forEach(p => document.querySelectorAll(`.simple-plan-text[data-plan="${CSS.escape(p.id)}"] strong`).forEach(el => { if (!el.querySelector('.m-done-tag')) el.insertAdjacentHTML('beforeend', ` <span class="m-done-tag">✓ ${T('paylaşıldı','posted')}</span>`); })); };

  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'm-share') sharePlan(b.dataset.plan);
    if (a === 'm-done') markDone(b.dataset.plan); });
  window.__PTShare = { sharePlan, due, calendarFile: id => calendarFile(id) };
  render();
})();
