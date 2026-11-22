/* post calendar: the same week view as daily stories, placed first. each day shows the post planned for it;
   an empty day opens the photo picker and the date sheet already set to that day. */
(function(){
  let postDay = localDate(new Date()), pendingDay = null;
  const loc = () => state.lang === 'tr' ? 'tr-TR' : 'en-GB';
  const posts = () => state.plans.filter(p => p.purpose !== 'story');
  function week(){
    const days = storyDays(postDay), all = posts(), today = localDate(new Date());
    const items = all.filter(p => p.date === postDay).sort((a, b) => a.time.localeCompare(b.time));
    const count = days.filter(d => all.some(p => p.date === d)).length;
    const kind = p => simplePhoto(p.photos[0])?.video ? 'Reels' : p.photos.length > 1 ? 'Carousel' : 'Post';
    return `<section class="daily-stories post-week"><div class="stories-heading"><h2>${T('post takvimi.','post calendar.')}</h2><span>${count}/7 ${T('gün planlı','days planned')}</span></div>
      <div class="story-week-heading">${action('pw-week', '‹', 'icon-button', 'data-step="-7" aria-label="' + T('Önceki hafta','Previous week') + '"')}<span>${storyDate(days[0]).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })} — ${storyDate(days[6]).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })}</span>${action('pw-week', '›', 'icon-button', 'data-step="7" aria-label="' + T('Sonraki hafta','Next week') + '"')}</div>
      <div class="story-week">${days.map(d => { const rows = all.filter(p => p.date === d);
        return `<button data-action="pw-day" data-day="${d}" aria-pressed="${d === postDay}" class="story-day"><small>${d === today ? T('Bugün','Today') : storyDate(d).toLocaleDateString(loc(), { weekday: 'short' })}</small><span class="story-ring is-post ${rows.length ? 'filled' : ''}">${rows.length ? simpleImage(rows[0].photos[0]) : '<span>＋</span>'}</span><span>${storyDate(d).getDate()}</span></button>`; }).join('')}</div>
      <div class="story-day-heading"><strong>${storyDate(postDay).toLocaleDateString(loc(), { day: 'numeric', month: 'long' })}</strong>${action('pw-new', '＋ Post', 'text-button')}</div>
      ${items.length ? `<div class="story-list">${items.map(p => `<article><button class="story-thumb is-post" data-action="s-date" data-plan="${esc(p.id)}" data-id="${esc(p.photos[0])}">${simpleImage(p.photos[0])}</button><button class="story-info" data-action="s-date" data-plan="${esc(p.id)}" data-id="${esc(p.photos[0])}"><strong>${esc(p.time)} · ${kind(p)}</strong><span>${esc(p.caption || T('Açıklama ekle','Add a caption'))}</span></button>${action('calendar', '↓', 'icon-button story-check', `data-id="${esc(p.id)}" aria-label="${T('Takvime indir','Download calendar event')}"`)}</article>`).join('')}</div>`
        : `<button class="story-empty" data-action="pw-new"><span>＋</span>${T('Bu güne bir post ekle','Add a post for this day')}</button>`}
      <p class="story-footnote">${T('Grid’indeki bir fotoğrafı seç, saatini belirle. Otomatik paylaşım yok; saati gelince elinin altında.','Pick a photo from your grid and set the time. No auto-posting; it’s ready when the time comes.')}</p></section>`;
  }
  simpleCalendar = function(){
    return `<div class="simple-title"><h1>${T('takvimin.','your calendar.')}</h1><p>${T('Paylaşacakların, seçtiğin saatte elinin altında.','Your planned posts, ready when you need them.')}</p></div>${week()}${typeof dailyStories === 'function' ? dailyStories() : ''}`;
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action;
    if (a === 'pw-week'){ const d = storyDate(postDay); d.setDate(d.getDate() + Number(b.dataset.step)); postDay = localDate(d); render(); }
    if (a === 'pw-day'){ postDay = b.dataset.day; render(); }
    if (a === 'pw-new'){ pendingDay = postDay; const p = document.querySelector('[data-action="pt-plan-pick"]') || Object.assign(document.createElement('button'), { hidden: true });
      p.dataset.action = 'pt-plan-pick'; if (!p.isConnected){ document.body.appendChild(p); p.click(); p.remove(); } else p.click(); }
  });
  /* the date sheet opened from an empty day starts on that day */
  new MutationObserver(() => { if (!pendingDay) return; const f = document.querySelector('#simple-date-form [name="day"]');
    if (f){ if (!document.querySelector('#simple-date-form [data-action="s-unschedule"]')) f.value = pendingDay; pendingDay = null; } })
    .observe(document.getElementById('modal'), { childList: true, subtree: true });
  /* plan both at once: the post date sheet gets "also plan as a story that day" (new posts only) */
  new MutationObserver(() => { const f = document.getElementById('simple-date-form'); if (!f || f.querySelector('#pw-also-story') || f.querySelector('[data-action="s-unschedule"]')) return;
    const kind = f.querySelector('[name="kind"]'); if (!kind) return;
    const row = document.createElement('label'); row.className = 'checkline pw-also'; row.innerHTML = `<input id="pw-also-story" type="checkbox">${T('Aynı gün story olarak da planla','Also plan it as a story that day')}`;
    kind.closest('label').after(row);
    const sync = () => { row.hidden = kind.value === 'story'; }; kind.addEventListener('change', sync); sync(); })
    .observe(document.getElementById('modal'), { childList: true, subtree: true });
  document.addEventListener('submit', e => { const f = e.target; if (f.id !== 'simple-date-form') return; const box = f.querySelector('#pw-also-story');
    if (!box || !box.checked || f.elements.kind.value === 'story') return;
    const before = new Set(state.plans.map(p => p.id)), day = f.elements.day.value, hour = f.elements.hour.value, caption = f.elements.caption.value;
    setTimeout(() => { const post = state.plans.find(p => !before.has(p.id) && p.purpose !== 'story'); if (!post) return;
      state.plans.push({ id: crypto.randomUUID(), photos: [post.photos[0]], date: day, time: hour, caption, purpose: 'story' });
      try { save(); } catch(_) {} render(); toast(T('Post ve story takvimine kaydedildi.','Saved as a post and a story.')); }, 0); }, true);
  window.PTPostWeek = { week };
})();
