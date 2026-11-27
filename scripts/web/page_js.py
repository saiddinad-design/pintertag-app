"""The scripts scripts/web/browser.py runs inside the page: what is on the screen, what a finger moves,
picking an option of a drop-down list, and the focused field.

Positions in and out are CSS pixels of the visible screen (the screenshot). On a page without a mobile
viewport tag the phone shows a wider layout zoomed out; each script converts between the screen and the
page's own coordinates with window.visualViewport, so a position read on the image still hits its element."""

# Shared helpers: v.toPage(x, y) turns a screen position into page (client) coordinates, v.box(rect) a
# page rectangle into a screen one; v.w and v.h are the screen size.
VIEW = r"""const vv = window.visualViewport;
  const S = vv ? vv.scale : 1, ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0;
  const v = {w: Math.round((vv ? vv.width : innerWidth) * S), h: Math.round((vv ? vv.height : innerHeight) * S),
             toPage: (x, y) => [x / S + ox, y / S + oy],
             box: r => ({x: (r.left - ox) * S, y: (r.top - oy) * S, w: r.width * S, h: r.height * S})};"""

# Visible elements, in document order. An element covered by another one (a closed menu, a hidden panel)
# is left out: it cannot be tapped. Checkboxes and radios are listed through their label when the label shows.
ELEMENTS_JS = (
    r"""() => {
  """
    + VIEW
    + r"""
  const CONTROL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,label,[role=button],[role=link],' +
    '[role=checkbox],[role=radio],[role=tab],[role=switch],[role=menuitem],[role=slider],[contenteditable=""],[contenteditable=true]';
  const TEXT = 'h1,h2,h3,h4,h5,h6,p,li,td,th,dt,dd,figcaption,blockquote,legend,img[alt]';
  const BUTTON_INPUT = /^(button|submit|reset)$/;
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const nameOf = el => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = clean(by.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(n => n.textContent).join(' '));
      if (t) return t;
    }
    const own = clean(el.getAttribute('aria-label') || el.getAttribute('alt'));
    if (own) return own;
    if (el.tagName === 'INPUT' && BUTTON_INPUT.test(el.type)) return clean(el.value) || (el.type === 'submit' ? 'Submit' : '');
    if (el.labels && el.labels.length) return clean(el.labels[0].innerText);
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const t = clean(el.innerText);
      if (t) return t;
      const inner = el.querySelector('img[alt],[aria-label]');
      if (inner) return clean(inner.getAttribute('alt') || inner.getAttribute('aria-label'));
    }
    return clean(el.getAttribute('title') || el.getAttribute('placeholder'));
  };
  const onTop = el => {
    const b = v.box(el.getBoundingClientRect());
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (b.w < 2 || b.h < 2 || cx < 0 || cy < 0 || cx > v.w || cy > v.h) return null;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) return null;
    const top = document.elementFromPoint(...v.toPage(cx, cy));
    if (!top) return null;
    if (top === el || el.contains(top)) return b;
    return el.labels && Array.from(el.labels).some(l => l.contains(top)) ? b : null;
  };
  const valueOf = (el, field) => {
    const box = el.tagName === 'LABEL' ? el.control : el;
    if (/^(checkbox|radio)$/.test(box.type || '')) return box.checked ? 'on' : 'off';
    if (box.tagName === 'SELECT') return clean(box.selectedOptions[0] && box.selectedOptions[0].text);
    if (!field) return '';
    if (box.type === 'password') return box.value ? '(hidden)' : '';
    return clean(box.value !== undefined ? box.value : box.innerText);
  };
  const out = [];
  for (const el of document.querySelectorAll(CONTROL + ',' + TEXT)) {
    const control = el.matches(CONTROL);
    const tick = /^(checkbox|radio)$/.test(el.type || '');
    if (el.tagName === 'LABEL' && !/^(checkbox|radio)$/.test((el.control || {}).type)) continue;  // the field is the target
    if (tick && el.labels && Array.from(el.labels).some(onTop)) continue;  // its label on screen is the target
    if (!control && el.parentElement && el.parentElement.closest(CONTROL)) continue;     // text inside a control
    const b = onTop(el);
    if (!b) continue;
    const field = el.isContentEditable || (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) &&
      !/^(button|submit|reset|checkbox|radio|image|range|color|file)$/.test(el.type));
    const name = nameOf(el);
    if (!control && !name) continue;
    // A link inside a sentence: WCAG 2.5.8 leaves it out of the target size (not a link beside other blocks)
    const prose = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li,dd,td,blockquote,figcaption');
    const inline = !!prose && clean(prose.innerText).length > clean(el.innerText).length + 10;
    const options = el.tagName === 'SELECT' ? Array.from(el.options).map(o => clean(o.text)) : [];
    out.push({kind: field ? 'field' : control ? 'button' : 'text', name: name.slice(0, 200),
              value: valueOf(el, field).slice(0, 80), x: b.x, y: b.y, w: b.w, h: b.h, inline, options});
    if (out.length >= 120) break;
  }
  const root = document.scrollingElement || document.documentElement;
  return {elements: out, w: v.w, h: v.h, scroll: Math.round(root.scrollTop),
          max: Math.max(0, Math.round(root.scrollHeight - root.clientHeight))};
}"""
)

# What a finger moving the content by (dx, dy) from (x, y) does on a phone, for WebKit, where Playwright has
# no touch scroll: "blocked" when touch-action gives that axis to the page's own code, "scrolled" when the
# nearest box that can still move that way (or the page) moved, "none" when nothing can move.
PAN_JS = (
    r"""([x, y, dx, dy]) => {
  """
    + VIEW
    + r"""
  const start = document.elementFromPoint(...v.toPage(x, y));
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const d = (vertical ? dy : dx) / S;
  for (let el = start; el; el = el.parentElement) {
    const ta = getComputedStyle(el).touchAction;
    if (ta === 'none' || (ta.includes('pan') && !ta.includes(vertical ? 'pan-y' : 'pan-x')
        && !(vertical ? /pan-(up|down)/ : /pan-(left|right)/).test(ta))) return 'blocked';
  }
  const canMove = (el, pos, size, view) => d > 0 ? el[pos] + el[view] < el[size] - 1 : el[pos] > 0;
  const [pos, size, view, flow] = vertical ? ['scrollTop', 'scrollHeight', 'clientHeight', 'overflowY']
                                           : ['scrollLeft', 'scrollWidth', 'clientWidth', 'overflowX'];
  for (let el = start; el && el !== document.documentElement && el !== document.body; el = el.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(el)[flow]) && canMove(el, pos, size, view)) {  // else it chains on
      el.scrollBy(vertical ? 0 : d, vertical ? d : 0); return 'scrolled';
    }
  }
  const root = document.scrollingElement || document.documentElement;
  if (!canMove(root, pos, size, view)) return 'none';
  window.scrollBy(vertical ? 0 : d, vertical ? d : 0); return 'scrolled'; }"""
)

# A drop-down list at (x, y): pick the option whose text or value matches, as the phone's picker would.
CHOOSE_JS = (
    r"""([x, y, want]) => {
  """
    + VIEW
    + r"""
  const at = document.elementFromPoint(...v.toPage(x, y));
  const sel = at && (at.closest('select') || (at.closest('label') || {}).control);
  if (!sel || sel.tagName !== 'SELECT') return {error: 'no drop-down list at this position'};
  if (sel.disabled) return {error: 'this drop-down list is disabled'};
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const usable = o => !o.disabled && !(o.parentElement.tagName === 'OPTGROUP' && o.parentElement.disabled);
  const opt = Array.from(sel.options).find(o => norm(o.text) === norm(want) || norm(o.value) === norm(want));
  if (!opt) return {error: 'no such option; the list has: ' + Array.from(sel.options).map(o => o.text.trim()).join(' | ')};
  if (!usable(opt)) return {error: 'this option is disabled'};
  sel.value = opt.value;
  sel.dispatchEvent(new Event('input', {bubbles: true}));
  sel.dispatchEvent(new Event('change', {bubbles: true}));
  return {ok: true, chosen: opt.text.trim()}; }"""
)

# Selects the focused field's content so typing replaces it; true only when that element takes text.
SELECT_FOCUSED_JS = r"""() => { const el = document.activeElement;
  const text = !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' &&
    !/^(button|submit|reset|checkbox|radio|image|range|color|file|hidden)$/.test(el.type)));
  if (text && el.isContentEditable) document.execCommand('selectAll');
  else if (text && typeof el.select === 'function') el.select();
  return text; }"""
