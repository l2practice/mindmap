/* Mind map engine (no dependencies) */
(function (g) {
'use strict';

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const hex = c => { c = String(c).replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16)); };
const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
const contrast = c => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111827' : '#ffffff'; };
const isHex = c => /^#[0-9a-f]{6}$/i.test(c || '');

function safeUrl(u) {
  u = String(u || '').trim(); if (!u) return '';
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
  return 'https://' + u;
}

/* ---------- Themes & markers ---------- */
const THEMES = {
  classic: { name: 'Classic', bg: '#f6f7fb', text: '#1f2937', root: ['#1f2937', '#ffffff'], dark: false, branches: ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777'] },
  fresh:   { name: 'Fresh', bg: '#f1fbf7', text: '#12372a', root: ['#0f766e', '#ffffff'], dark: false, branches: ['#14b8a6', '#22c55e', '#65a30d', '#06b6d4', '#0ea5e9', '#10b981', '#84cc16', '#0d9488'] },
  warm:    { name: 'Warm', bg: '#fff8f1', text: '#431407', root: ['#9a3412', '#ffffff'], dark: false, branches: ['#f97316', '#ef4444', '#eab308', '#f43f5e', '#d97706', '#dc2626', '#fb923c', '#be123c'] },
  pastel:  { name: 'Pastel', bg: '#fdf6ff', text: '#3b0764', root: ['#6d28d9', '#ffffff'], dark: false, branches: ['#a78bfa', '#f9a8d4', '#7dd3fc', '#86efac', '#fcd34d', '#fda4af', '#93c5fd', '#c4b5fd'] },
  dark:    { name: 'Dark', bg: '#111827', text: '#e5e7eb', root: ['#f9fafb', '#111827'], dark: true, branches: ['#60a5fa', '#34d399', '#fb923c', '#c084fc', '#f87171', '#22d3ee', '#facc15', '#f472b6'] },
  mono:    { name: 'Mono', bg: '#ffffff', text: '#111111', root: ['#111111', '#ffffff'], dark: false, branches: ['#374151', '#4b5563', '#6b7280', '#52525b', '#3f3f46', '#57534e', '#44403c', '#334155'] }
};

const PRI = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed'];
const MK = {};
const MARKER_GROUPS = [
  { name: 'Priority', ids: [] }, { name: 'Progress', ids: [] }, { name: 'Symbols', ids: [] }
];
PRI.forEach((c, i) => { MK['p' + (i + 1)] = { t: String(i + 1), bg: c }; MARKER_GROUPS[0].ids.push('p' + (i + 1)); });
[['t0', 0], ['t25', 25], ['t50', 50], ['t75', 75], ['t100', 100]].forEach(([id, pct]) => { MK[id] = { pct }; MARKER_GROUPS[1].ids.push(id); });
[['ok', '✅'], ['no', '❌'], ['q', '❓'], ['!', '❗'], ['idea', '💡'], ['star', '⭐'], ['flag', '🚩'], ['heart', '❤️'], ['pin', '📌'], ['book', '📖'], ['clock', '⏰'], ['up', '👍'], ['down', '👎'], ['smile', '😀'], ['warn', '⚠️'], ['target', '🎯']]
  .forEach(([id, t]) => { MK[id] = { t }; MARKER_GROUPS[2].ids.push(id); });
const groupOf = id => /^p\d$/.test(id) ? 'p' : /^t\d+$/.test(id) ? 't' : id;
function markerEl(id) {
  const m = MK[id], s = $('span', 'mk' + (m && m.bg ? ' pri' : '')); if (!m) return s;
  if (m.pct != null) {   // progress pie
    s.className = 'mk pie'; s.style.background = m.pct ? `conic-gradient(#2563eb ${m.pct}%, #dbeafe 0)` : '#fff'; s.title = m.pct + '%'; return s;
  }
  s.textContent = m.t; if (m.bg) s.style.background = m.bg; if (m.c) s.style.color = m.c; return s;
}

/* ---------- Rich text sanitizer (inline formatting inside a node) ---------- */
const OK_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SPAN', 'BR', 'A', 'SUB', 'SUP', 'FONT']);
const SAFE_VAL = /^[#\w\s.,()%-]+$/;
const STYLE_PROPS = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration'];
function sanitize(src) {
  const doc = new DOMParser().parseFromString('<body>' + String(src) + '</body>', 'text/html');
  const out = document.createElement('div');
  const copy = (from, to) => {
    from.childNodes.forEach(c => {
      if (c.nodeType === 3) { to.append(document.createTextNode(c.nodeValue.replace(/ /g, ' '))); return; }
      if (c.nodeType !== 1) return;
      const tag = c.tagName;
      if (tag === 'BR') { to.append(document.createElement('br')); return; }
      if (tag === 'DIV' || tag === 'P') {
        if (to.lastChild && to.lastChild.nodeName !== 'BR') to.append(document.createElement('br'));
        copy(c, to); return;
      }
      if (!OK_TAGS.has(tag)) { copy(c, to); return; }
      let el;
      if (tag === 'FONT') { el = document.createElement('span'); const col = c.getAttribute('color'); if (col && SAFE_VAL.test(col)) el.style.color = col; }
      else { const n = { STRONG: 'b', EM: 'i', STRIKE: 's', DEL: 's' }[tag] || tag.toLowerCase(); el = document.createElement(n); }
      if (tag === 'A') {
        const h = safeUrl(c.getAttribute('href'));
        if (!h) { copy(c, to); return; }
        el.setAttribute('href', h); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener');
      }
      const st = c.style;
      if (st) STYLE_PROPS.forEach(p => { const v = st[p]; if (v && SAFE_VAL.test(v)) el.style[p] = v; });
      copy(c, el);
      if (el.tagName === 'SPAN' && !el.getAttribute('style')) { while (el.firstChild) to.append(el.firstChild); }
      else to.append(el);
    });
  };
  copy(doc.body, out);
  while (out.lastChild && out.lastChild.nodeName === 'BR') out.lastChild.remove();
  const text = (function t(n) { let s = ''; n.childNodes.forEach(c => { s += c.nodeType === 3 ? c.nodeValue : c.nodeName === 'BR' ? '\n' : t(c); }); return s; })(out);
  const html = out.innerHTML;
  return { html, text, rich: /<(?!br\b)/i.test(html) };
}

/* ---------- Style resolution ---------- */
function resolveStyle(n, depth, bc, th) {
  const s = n.style || {};
  let fill, color, border = 'transparent', radius = 10, size = 14, weight = 400, shape = s.shape || 'auto';
  if (depth === 0) { fill = th.root[0]; color = th.root[1]; size = 20; weight = 700; radius = 14; }
  else if (depth === 1) { fill = bc; color = contrast(bc); size = 16; weight = 600; }
  else { fill = rgba(bc, th.dark ? 0.22 : 0.13); color = th.text; border = bc; }
  if (isHex(s.fill)) { fill = s.fill; color = s.color ? s.color : contrast(s.fill); border = depth >= 2 ? s.fill : border; }
  if (isHex(s.color)) color = s.color;
  if (s.size) size = s.size;
  if (s.bold != null) weight = s.bold ? 700 : 400;
  const r = { fill, color, border, radius, size, weight, italic: !!s.italic, under: !!s.u, strike: !!s.strike, hl: isHex(s.hl) ? s.hl : '', bottom: null };
  if (shape === 'rect') r.radius = 2;
  else if (shape === 'pill') r.radius = 999;
  else if (shape === 'round') r.radius = 10;
  else if (shape === 'underline') { r.bottom = isHex(s.fill) ? s.fill : bc; r.fill = 'transparent'; r.border = 'transparent'; if (!isHex(s.color)) r.color = th.text; r.radius = 0; }
  else if (shape === 'none') { r.fill = 'transparent'; r.border = 'transparent'; if (!isHex(s.color)) r.color = th.text; }
  r.fillHex = isHex(s.fill) ? s.fill : (depth === 0 ? '#5b47e0' : bc);
  return r;
}
function applyStyle(el, r) {
  const t = el.querySelector('.t');
  el.style.background = r.fill; el.style.color = r.color; el.style.fontSize = r.size + 'px';
  el.style.fontWeight = r.weight; el.style.fontStyle = r.italic ? 'italic' : 'normal';
  el.style.borderRadius = r.radius + 'px'; el.style.border = '2px solid ' + r.border;
  if (r.bottom) { el.style.border = '0'; el.style.borderBottom = '3px solid ' + r.bottom; }
  const dec = [r.under && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ');
  t.style.textDecoration = dec || 'none';
  if (r.hl) { t.style.background = r.hl; t.style.color = contrast(r.hl) === '#ffffff' ? '#fff' : (r.color === '#ffffff' ? '#111827' : ''); t.classList.add('hl'); }
}

/* ---------- Outline parsing (markdown / indented text) ---------- */
function parseOutline(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim());
  let unit = 0;
  lines.forEach(l => { const ind = l.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length; if (ind > 0 && (!unit || ind < unit)) unit = ind; });
  unit = unit || 2;
  const root = { children: [] }, stack = [{ lvl: -1, n: root }]; let head = 0;
  for (const raw of lines) {
    let m, lvl, t;
    if ((m = raw.match(/^\s*(#{1,6})\s+(.*)$/))) { lvl = m[1].length - 1; t = m[2]; head = lvl + 1; }
    else {
      const ind = raw.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length;
      const b = raw.match(/^[\t ]*(?:[-*+•]|\d+[.)])\s+(.*)$/);
      t = b ? b[1] : raw.trim(); lvl = head + Math.round(ind / unit);
    }
    t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').trim(); if (!t) continue;
    while (stack[stack.length - 1].lvl >= lvl) stack.pop();
    const node = { id: uid(), text: t, children: [] };
    stack[stack.length - 1].n.children.push(node); stack.push({ lvl, n: node });
  }
  return root.children;
}

/* ---------- Node normalisation ---------- */
function norm(n) {
  const o = { id: n.id || uid(), text: String(n.text == null ? '' : n.text), children: [] };
  if (n.html) { const r = sanitize(n.html); if (r.rich) { o.html = r.html; o.text = r.text; } }
  if (n.collapsed) o.collapsed = true;
  if (n.style && typeof n.style === 'object') {
    const s = {};
    ['fill', 'color', 'line', 'hl'].forEach(k => { if (isHex(n.style[k])) s[k] = n.style[k]; });
    ['bold', 'italic', 'u', 'strike'].forEach(k => { if (n.style[k] != null) s[k] = !!n.style[k]; });
    if (n.style.size) s.size = Math.max(8, Math.min(96, +n.style.size || 14));
    if (['auto', 'round', 'rect', 'pill', 'underline', 'none'].includes(n.style.shape)) s.shape = n.style.shape;
    if (Object.keys(s).length) o.style = s;
  }
  if (Array.isArray(n.markers) && n.markers.length) o.markers = n.markers.filter(m => MK[m]);
  if (n.note) o.note = String(n.note);
  if (n.link) { const l = safeUrl(n.link); if (l) o.link = l; }
  if (Array.isArray(n.labels) && n.labels.length) o.labels = n.labels.map(String).filter(Boolean);
  if (n.side === 'l' || n.side === 'r') o.side = n.side;
  if (Array.isArray(n.children)) o.children = n.children.map(norm);
  if (o.markers && !o.markers.length) delete o.markers;
  return o;
}

const darkCache = new Map();
function darkOf(th) {
  if (!darkCache.has(th)) darkCache.set(th, Object.assign({}, th, { bg: THEMES.dark.bg, text: THEMES.dark.text, root: THEMES.dark.root, dark: true }));
  return darkCache.get(th);
}

/* ---------- Engine ---------- */
class MindMap {
  constructor(host, o = {}) {
    this.o = o; this.view = { x: 0, y: 0, k: 1 };
    this.sel = new Set(); this.primary = null; this.els = new Map(); this.index = new Map(); this.vis = [];
    this.hist = []; this.hp = -1; this.clip = null; this.editing = null; this.pts = new Map(); this.p = null; this.hits = new Set();
    host.innerHTML = '';
    this.host = host;
    this.vp = $('div', 'mm-viewport'); this.vp.tabIndex = 0;
    this.stage = $('div', 'mm-stage');
    this.svg = document.createElementNS(SVGNS, 'svg'); this.svg.setAttribute('class', 'mm-links');
    this.layer = $('div', 'mm-nodes');
    this.stage.append(this.svg, this.layer); this.vp.append(this.stage); host.append(this.vp);
    this.fmt = $('div'); this.fmt.hidden = true;
    if (!o.static) this.buildFmt();
    this.bind();
    this.load(MindMap.blank());
  }
  static blank(title = 'New map') {
    return { v: 1, id: uid(), title, layout: 'map', theme: 'classic', lineStyle: 'curve', root: { id: uid(), text: title, children: [] } };
  }

  /* ----- document ----- */
  load(doc) {
    this.endEdit(false);
    const d = doc || MindMap.blank();
    this.doc = {
      v: 1, id: d.id || uid(), title: d.title || 'New map',
      layout: ['map', 'right', 'left', 'org'].includes(d.layout) ? d.layout : 'map',
      theme: THEMES[d.theme] ? d.theme : 'classic',
      lineStyle: ['curve', 'elbow', 'straight'].includes(d.lineStyle) ? d.lineStyle : 'curve',
      grid: d.grid !== false, bg: isHex(d.bg) ? d.bg : '', lineW: ['thin', 'thick'].includes(d.lineW) ? d.lineW : 'auto', mono: !!d.mono, notes: !!d.notes,
      root: norm(d.root || { text: d.title || 'Central topic' })
    };
    this.sel.clear(); this.primary = null; this.hits.clear();
    this.hist = []; this.hp = -1;
    this.reindex(); this.render(); this.pushHist();
    this.select(this.doc.root.id, false, true);
    requestAnimationFrame(() => this.fit());
  }
  serialize() {
    const clean = n => {
      const o = { id: n.id, text: n.text };
      if (n.html) o.html = n.html;
      if (n.collapsed) o.collapsed = true;
      if (n.style && Object.keys(n.style).length) o.style = n.style;
      if (n.markers && n.markers.length) o.markers = n.markers;
      if (n.note) o.note = n.note; if (n.link) o.link = n.link;
      if (n.labels && n.labels.length) o.labels = n.labels;
      if (n.side) o.side = n.side;
      o.children = n.children.map(clean); return o;
    };
    const d = this.doc;
    return { v: 1, id: d.id, title: d.title, layout: d.layout, theme: d.theme, lineStyle: d.lineStyle, grid: d.grid, bg: d.bg, lineW: d.lineW, mono: d.mono, notes: d.notes, root: clean(d.root) };
  }
  theme() {
    const base = THEMES[this.themeOverride || this.doc.theme] || THEMES.classic;
    if (!this.appDark || base.dark || this.themeOverride) return base;      // in dark mode every light map theme gets a dark canvas
    return darkOf(base);
  }
  bgColor() { return isHex(this.doc.bg) ? this.doc.bg : this.theme().bg; }
  setDocOpt(k, v) { this.doc[k] = v; this.commit(); }
  setAppDark(on) { on = !!on; if (on === !!this.appDark) return; this.appDark = on; if (this.doc) this.render(); }
  reindex() {
    this.index.clear();
    const walk = (n, p, d) => { this.index.set(n.id, { n, p, d }); n.children.forEach(c => walk(c, n, d + 1)); };
    walk(this.doc.root, null, 0);
  }
  get(id) { const i = this.index.get(id); return i ? i.n : null; }

  /* ----- history ----- */
  snap() { return JSON.stringify(this.serialize()); }
  pushHist() {
    const s = this.snap(); if (s === this.hist[this.hp]) return;
    this.hist.length = this.hp + 1; this.hist.push(s); this.hp++;
    if (this.hist.length > 120) { this.hist.shift(); this.hp--; }
  }
  commit() { this.reindex(); this.render(); this.pushHist(); this.changed(); }
  changed() { this.o.onChange && this.o.onChange(); }
  restore(s) {
    const d = JSON.parse(s); this.endEdit(false);
    Object.assign(this.doc, { layout: d.layout, theme: d.theme, lineStyle: d.lineStyle, grid: d.grid !== false, bg: d.bg || '', lineW: d.lineW || 'auto', mono: !!d.mono, notes: !!d.notes, root: norm(d.root) });
    this.reindex(); this.render(); this.changed();
  }
  undo() { if (this.hp > 0) { this.hp--; this.restore(this.hist[this.hp]); } }
  redo() { if (this.hp < this.hist.length - 1) { this.hp++; this.restore(this.hist[this.hp]); } }
  canUndo() { return this.hp > 0; } canRedo() { return this.hp < this.hist.length - 1; }

  /* ----- rendering ----- */
  render() {
    const th = this.theme();
    const bg = this.bgColor(); this.vp.style.background = bg; this.vp.classList.toggle('dark', this.doc.bg ? contrast(bg) === '#ffffff' : th.dark); this.vp.classList.toggle('nogrid', this.doc.grid === false);
    this.layer.innerHTML = ''; this.els.clear(); this.bc = new Map(); this.sty = new Map();
    const walk = (n, d, bc) => {
      this.bc.set(n.id, bc);
      const el = this.buildEl(n, d, bc, th); this.layer.append(el); this.els.set(n.id, el);
      if (!n.collapsed) n.children.forEach((c, i) => {
        const cb = (c.style && c.style.line) || (this.doc.mono ? (th.dark ? '#9aa3b8' : '#6b7280') : d === 0 ? th.branches[i % th.branches.length] : bc);
        walk(c, d + 1, cb);
      });
    };
    walk(this.doc.root, 0, isHex(th.root[0]) ? th.root[0] : '#5b47e0');
    [...this.sel].forEach(id => { if (!this.els.has(id)) this.sel.delete(id); });
    if (!this.els.has(this.primary)) this.primary = [...this.sel][0] || null;
    this.relayout(); this.paintSel(); this.applyDim();
  }
  buildEl(n, d, bc, th) {
    const el = $('div', 'node d' + Math.min(d, 2)); el.dataset.id = n.id;
    const row = $('div', 'row');
    if (n.markers && n.markers.length) { const m = $('span', 'mks'); n.markers.forEach(id => m.append(markerEl(id))); row.append(m); }
    const t = $('span', 't');
    if (n.html) t.innerHTML = n.html; else t.textContent = n.text;
    row.append(t);
    if (n.note) { const i = $('span', 'ic', '📝'); i.title = n.note.slice(0, 300); row.append(i); }
    if (n.link) { const a = $('a', 'ic', '🔗'); a.href = n.link; a.target = '_blank'; a.rel = 'noopener'; a.title = n.link; row.append(a); }
    el.append(row);
    if (this.doc.notes && n.note) { const nb = $('div', 'note-body'); nb.textContent = n.note.slice(0, 400); el.append(nb); }
    if (n.labels && n.labels.length) { const l = $('div', 'labels'); n.labels.forEach(x => l.append($('span', 'lb', esc(x)))); el.append(l); }
    if (n.children.length) {
      const f = $('button', 'fold' + (n.collapsed ? ' on' : '')); f.tabIndex = -1; f.dataset.fold = n.id;
      f.textContent = n.collapsed ? n.children.length : '−'; f.style.borderColor = bc; f.style.color = bc; el.append(f);
    }
    const r = resolveStyle(n, d, bc, th); this.sty.set(n.id, r); applyStyle(el, r);
    return el;
  }
  relayout() {
    const R = this.doc.root, L = this.doc.layout;
    this.vis = []; const collect = n => { this.vis.push(n); if (!n.collapsed) n.children.forEach(collect); }; collect(R);
    this.vis.forEach(n => { const el = this.els.get(n.id); n._w = el.offsetWidth; n._h = el.offsetHeight; });
    if (L === 'org') this.layoutOrg(R); else this.layoutH(R, L);
    this.vis.forEach(n => {
      const el = this.els.get(n.id); el.style.left = n._x + 'px'; el.style.top = n._y + 'px';
      el.classList.toggle('dl', n._dir < 0); el.classList.toggle('vt', L === 'org');
    });
    this.drawLinks(); this.o.onLayout && this.o.onLayout();
  }
  layoutH(R, mode) {
    const GY = 22, GX = 44, GX0 = 72;
    const kids = n => n.collapsed ? [] : n.children;
    const dlt = n => { const st = this.sty.get(n.id); return st && st.bottom ? n._h / 2 : 0; };   // anchor offset below the box centre
    const ext = n => {      // vertical room a subtree needs, including the small shift applied to underline-style children
      const ks = kids(n); if (!ks.length) return n._ext = n._h;
      let s = GY * (ks.length - 1); ks.forEach(k => s += ext(k));
      const sh = Math.abs(dlt(n) - (dlt(ks[0]) + dlt(ks[ks.length - 1])) / 2);
      return n._ext = Math.max(n._h, s + 2 * sh);
    };
    const spread = (ks, pa) => {   // centres of child slots, shifted so the child anchors are symmetric about the parent anchor
      let tot = GY * (ks.length - 1); ks.forEach(k => tot += k._ext);
      let y = -tot / 2; const cc = ks.map(k => { const c = y + k._ext / 2; y += k._ext + GY; return c; });
      // Keep the slot block centred on the parent (never move slots relative to each other, or neighbouring subtrees overlap);
      // only compensate for underline nodes whose connector sits at their bottom edge.
      const shift = pa - (dlt(ks[0]) + dlt(ks[ks.length - 1])) / 2;
      return cc.map(c => c + shift);
    };
    const place = (n, edge, yc, dir) => {
      n._dir = dir; n._x = dir > 0 ? edge : edge - n._w; n._y = yc - n._h / 2;
      const ks = kids(n); if (!ks.length) return;
      const cs = spread(ks, dlt(n)), ce = dir > 0 ? n._x + n._w + GX : n._x - GX;
      ks.forEach((k, i) => place(k, ce, yc + cs[i], dir));
    };
    ext(R); R._x = -R._w / 2; R._y = -R._h / 2; R._dir = 0;
    const ks = kids(R); let groups;
    if (mode === 'right') groups = [[ks, 1]]; else if (mode === 'left') groups = [[ks, -1]];
    else {
      let a = 0, b = 0;
      ks.forEach(k => { if (k.side === 'r') a += k._ext; else if (k.side === 'l') b += k._ext; });
      ks.forEach(k => { if (k.side !== 'l' && k.side !== 'r') { k.side = a <= b ? 'r' : 'l'; if (k.side === 'r') a += k._ext; else b += k._ext; } });
      groups = [[ks.filter(k => k.side === 'r'), 1], [ks.filter(k => k.side === 'l'), -1]];
    }
    groups.forEach(([list, dir]) => {
      if (!list.length) return;
      const cs = spread(list, 0), edge = dir > 0 ? R._x + R._w + GX0 : R._x - GX0;
      list.forEach((k, i) => place(k, edge, cs[i], dir));
    });
  }
  layoutOrg(R) {
    const GX = 24, GY = 56; const kids = n => n.collapsed ? [] : n.children;
    const ext = n => { const ks = kids(n); if (!ks.length) return n._ext = n._w; let s = GX * (ks.length - 1); ks.forEach(k => s += ext(k)); return n._ext = Math.max(n._w, s); };
    const place = (n, xc, top) => {
      n._dir = 2; n._x = xc - n._w / 2; n._y = top; const ks = kids(n); if (!ks.length) return;
      let tot = GX * (ks.length - 1); ks.forEach(k => tot += k._ext);
      let x = xc - tot / 2; ks.forEach(k => { place(k, x + k._ext / 2, top + n._h + GY); x += k._ext + GX; });
    };
    ext(R); place(R, 0, -R._h / 2);
  }
  drawLinks() {
    const L = this.doc.layout, ls = this.doc.lineStyle || 'curve';
    this.svg.innerHTML = '';
    this.vis.forEach(p => {
      if (p.collapsed) return;
      p.children.forEach(c => {
        let x1, y1, x2, y2, vert = false, d;
        const ps = this.sty.get(p.id), cs = this.sty.get(c.id);
        if (L === 'org') { x1 = p._x + p._w / 2; y1 = p._y + p._h; x2 = c._x + c._w / 2; y2 = c._y; vert = true; }
        else { const dir = c._dir; x1 = dir > 0 ? p._x + p._w : p._x; y1 = p._y + (ps && ps.bottom ? p._h : p._h / 2); x2 = dir > 0 ? c._x : c._x + c._w; y2 = c._y + (cs && cs.bottom ? c._h : c._h / 2); }
        const xm = (x1 + x2) / 2, ym = (y1 + y2) / 2;
        if (ls === 'straight') d = `M${x1} ${y1}L${x2} ${y2}`;
        else if (ls === 'elbow') d = vert ? `M${x1} ${y1}V${ym}H${x2}V${y2}` : `M${x1} ${y1}H${xm}V${y2}H${x2}`;
        else d = vert ? `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}` : `M${x1} ${y1}C${xm} ${y1} ${xm} ${y2} ${x2} ${y2}`;
        const dep = this.index.get(c.id).d, path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', this.bc.get(c.id) || '#888');
        path.setAttribute('stroke-width', (dep === 1 ? 3.2 : dep === 2 ? 2.4 : 1.8) * ({ thin: 0.6, thick: 1.7 }[this.doc.lineW] || 1)); path.setAttribute('stroke-linecap', 'round'); path.dataset.c = c.id;
        this.svg.append(path);
      });
    });
  }

  /* ----- selection ----- */
  paintSel() {
    this.els.forEach((el, id) => {
      el.classList.toggle('sel', this.sel.has(id)); el.classList.toggle('pri', id === this.primary);
      el.classList.toggle('hit', this.hits.has(id));
    });
  }
  select(id, add, silent) {
    if (!add) this.sel.clear();
    if (id) { if (add && this.sel.has(id)) { this.sel.delete(id); if (this.primary === id) this.primary = [...this.sel][0] || null; } else { this.sel.add(id); this.primary = id; } }
    else this.primary = null;
    this.paintSel(); if (!silent) this.o.onSelect && this.o.onSelect(); else this.o.onSelect && this.o.onSelect();
  }
  clearSel() { this.sel.clear(); this.primary = null; this.paintSel(); this.o.onSelect && this.o.onSelect(); }
  selectAll() { this.sel = new Set(this.vis.map(n => n.id)); this.primary = this.primary || this.doc.root.id; this.paintSel(); this.o.onSelect && this.o.onSelect(); }
  selNodes() {   // selected nodes, excluding ones nested inside another selected node
    const out = [];
    this.sel.forEach(id => {
      const i = this.index.get(id); if (!i) return;
      for (let x = i.p; x; x = this.index.get(x.id).p) if (this.sel.has(x.id)) return;
      out.push(i.n);
    });
    return out;
  }

  /* ----- viewport ----- */
  applyView() {
    const v = this.view; this.stage.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
    this.o.onView && this.o.onView(v.k); if (this.editing) this.posFmt();
  }
  zoomAt(k, cx, cy) {
    k = Math.max(0.15, Math.min(3, k)); const r = this.vp.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, v = this.view;
    const wx = (px - v.x) / v.k, wy = (py - v.y) / v.k; v.k = k; v.x = px - wx * k; v.y = py - wy * k; this.applyView();
  }
  zoomBy(f) { const r = this.vp.getBoundingClientRect(); this.zoomAt(this.view.k * f, r.left + r.width / 2, r.top + r.height / 2); }
  bounds() {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    this.vis.forEach(n => { a = Math.min(a, n._x); b = Math.min(b, n._y); c = Math.max(c, n._x + n._w); d = Math.max(d, n._y + n._h); });
    return { x: a, y: b, w: c - a, h: d - b };
  }
  fit(b, max) {
    b = b || this.bounds(); const W = this.vp.clientWidth, H = this.vp.clientHeight; if (!W || !H || b.w <= 0) return;
    const k = Math.max(0.15, Math.min(max || 1.4, Math.min((W - 120) / b.w, (H - 120) / b.h)));
    this.view.k = k; this.view.x = W / 2 - (b.x + b.w / 2) * k; this.view.y = H / 2 - (b.y + b.h / 2) * k; this.applyView();
  }
  resetView(k) {   // centre the whole map at a fixed zoom
    const b = this.bounds(); this.view.k = k; this.view.x = this.vp.clientWidth / 2 - (b.x + b.w / 2) * k; this.view.y = this.vp.clientHeight / 2 - (b.y + b.h / 2) * k; this.applyView();
  }
  applyDim() {
    this.els.forEach((el, id) => el.classList.toggle('dim', !!this.dim && !this.dim.has(id)));
    this.svg.querySelectorAll('path').forEach(p => p.classList.toggle('dim', !!this.dim && !this.dim.has(p.dataset.c)));
  }
  focusBranch(id) {   // presentation: spotlight one first-level branch (null = whole map)
    this.dim = null;
    if (id && this.get(id)) { const set = new Set([this.doc.root.id]); (function add(n) { set.add(n.id); n.children.forEach(add); })(this.get(id)); this.dim = set; }
    this.applyDim();
    const nodes = this.vis.filter(n => !this.dim || this.dim.has(n.id)); let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    nodes.forEach(n => { a = Math.min(a, n._x); b = Math.min(b, n._y); c = Math.max(c, n._x + n._w); d = Math.max(d, n._y + n._h); });
    this.fit({ x: a, y: b, w: c - a, h: d - b }, 1.6);
  }
  centerOn(id) {
    const n = this.get(id); if (!n || n._x == null) return; const k = this.view.k;
    this.view.x = this.vp.clientWidth / 2 - (n._x + n._w / 2) * k; this.view.y = this.vp.clientHeight / 2 - (n._y + n._h / 2) * k; this.applyView();
  }
  reveal(id) {
    const n = this.get(id); if (!n || n._x == null) return; const v = this.view, m = 60;
    const x1 = n._x * v.k + v.x, x2 = (n._x + n._w) * v.k + v.x, y1 = n._y * v.k + v.y, y2 = (n._y + n._h) * v.k + v.y;
    const W = this.vp.clientWidth, H = this.vp.clientHeight; let moved = false;
    if (x1 < m) { v.x += m - x1; moved = true; } else if (x2 > W - m) { v.x -= x2 - (W - m); moved = true; }
    if (y1 < m) { v.y += m - y1; moved = true; } else if (y2 > H - m) { v.y -= y2 - (H - m); moved = true; }
    if (moved) this.applyView();
  }

  /* ----- pointer / keyboard ----- */
  bind() {
    const vp = this.vp;
    vp.addEventListener('pointerdown', e => this.pdown(e));
    vp.addEventListener('pointermove', e => this.pmove(e));
    vp.addEventListener('pointerup', e => this.pup(e));
    vp.addEventListener('pointercancel', e => this.pup(e));
    vp.addEventListener('wheel', e => this.wheel(e), { passive: false });
    vp.addEventListener('dblclick', e => {
      if (this.readOnly) return;
      const el = e.target.closest('.node'); if (el && !e.target.closest('.fold') && !e.target.closest('a')) this.startEdit(el.dataset.id, false);
    });
    vp.addEventListener('contextmenu', e => {
      e.preventDefault(); if (this.readOnly) return; const el = e.target.closest('.node');
      if (el && !this.sel.has(el.dataset.id)) this.select(el.dataset.id);
      this.o.onContext && this.o.onContext(el ? el.dataset.id : null, e.clientX, e.clientY);
    });
    if (this.o.static) return;
    document.addEventListener('keydown', e => this.onKey(e));
    document.addEventListener('copy', e => this.onCopy(e, false));
    document.addEventListener('cut', e => this.onCopy(e, true));
    document.addEventListener('paste', e => this.onPaste(e));
    window.addEventListener('resize', () => this.editing && this.posFmt());
  }
  pdown(e) {
    if (this.editing && e.target.closest('.t') && e.target.closest('.t').isContentEditable) return;
    if (this.editing) this.endEdit(true);
    this.vp.focus({ preventScroll: true });
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 2) {
      const [a, b] = [...this.pts.values()]; this.p = null;
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: this.view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return;
    }
    const fold = e.target.closest('.fold');
    if (fold && !this.readOnly) { this.toggleCollapse([fold.dataset.fold]); e.preventDefault(); return; }
    if (this.readOnly) { this.p = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, nodeId: null, mode: null, mod: false }; return; }
    const nel = e.target.closest('.node'), id = nel ? nel.dataset.id : null, mod = e.shiftKey || e.ctrlKey || e.metaKey;
    if (id) { if (mod) this.select(id, true); else if (!this.sel.has(id)) this.select(id); else { this.primary = id; this.paintSel(); this.o.onSelect && this.o.onSelect(); } }
    this.p = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, nodeId: id, mode: null, mod };
  }
  pmove(e) {
    const pt = this.pts.get(e.pointerId); if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
    if (this.pts.size === 2 && this.pinch) {
      const [a, b] = [...this.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.zoomAt(this.pinch.k * d / this.pinch.d, cx, cy); this.view.x += cx - this.pinch.cx; this.view.y += cy - this.pinch.cy;
      this.pinch.cx = cx; this.pinch.cy = cy; this.applyView(); return;
    }
    const p = this.p; if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
    if (!p.mode) {
      if (Math.hypot(dx, dy) < 5) return;
      const info = p.nodeId && this.index.get(p.nodeId);
      const canDrag = !this.readOnly && info && info.p && (e.pointerType !== 'touch' || this.sel.has(p.nodeId));
      p.mode = canDrag ? 'drag' : 'pan'; try { this.vp.setPointerCapture(e.pointerId); } catch (x) {}
      if (canDrag) this.dragStart(e); else this.vp.classList.add('panning');
    }
    if (p.mode === 'pan') { this.view.x = p.vx + dx; this.view.y = p.vy + dy; this.applyView(); }
    else this.dragMove(e);
  }
  pup(e) {
    this.pts.delete(e.pointerId); if (this.pts.size < 2) this.pinch = null;
    const p = this.p; if (!p || p.id !== e.pointerId) return; this.p = null; this.vp.classList.remove('panning');
    if (p.mode === 'drag') this.dragEnd(e);
    else if (!p.mode) {
      if (p.nodeId) { if (!p.mod && this.sel.size > 1) this.select(p.nodeId); }
      else if (!p.mod) this.clearSel();
    }
  }
  wheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) this.zoomAt(this.view.k * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX, e.clientY);
    else { this.view.x -= e.shiftKey ? e.deltaY : e.deltaX; this.view.y -= e.shiftKey ? 0 : e.deltaY; this.applyView(); }
  }

  /* ----- drag & drop: move branches ----- */
  isDesc(id, anc) { for (let x = this.index.get(id); x; x = x.p ? this.index.get(x.p.id) : null) if (x.n.id === anc) return true; return false; }
  dragStart(e) {
    const moving = this.selNodes().filter(n => this.index.get(n.id).p); this.drag = { ids: moving.map(n => n.id), drop: null };
    const el = this.els.get(this.p.nodeId); const ghost = el.cloneNode(true);
    ghost.classList.add('ghost'); ghost.classList.remove('sel', 'pri'); ghost.style.left = ghost.style.top = '0';
    if (moving.length > 1) { const b = $('span', 'gbadge', String(moving.length)); ghost.append(b); }
    document.body.append(ghost); this.drag.ghost = ghost;
    this.drag.ids.forEach(id => this.els.get(id) && this.els.get(id).classList.add('dragging'));
    this.vp.classList.add('dragmode'); this.dragMove(e);
  }
  dragMove(e) {
    const d = this.drag; if (!d) return;
    d.ghost.style.transform = `translate(${e.clientX + 10}px,${e.clientY + 10}px)`;
    this.els.forEach(el => el.classList.remove('drop-child', 'drop-before', 'drop-after'));
    d.drop = null; const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const tel = stack.find(x => x.classList && x.classList.contains('node') && !x.classList.contains('ghost'));
    if (!tel) return; const tid = tel.dataset.id;
    if (d.ids.some(id => id === tid || this.isDesc(tid, id))) return;     // can't drop into itself
    const r = tel.getBoundingClientRect(), root = tid === this.doc.root.id;
    let pos = 'child';
    if (!root) {
      if (this.doc.layout === 'org') { const rx = (e.clientX - r.left) / r.width; pos = rx < 0.22 ? 'before' : rx > 0.78 ? 'after' : 'child'; }
      else { const ry = (e.clientY - r.top) / r.height; pos = ry < 0.28 ? 'before' : ry > 0.72 ? 'after' : 'child'; }
    }
    let side;
    if (root && pos === 'child' && this.doc.layout === 'map') { const rc = r.left + r.width / 2; side = e.clientX < rc ? 'l' : 'r'; }
    d.drop = { id: tid, pos, side }; tel.classList.add('drop-' + pos);
  }
  dragEnd() {
    const d = this.drag; this.drag = null; if (!d) return;
    d.ghost.remove(); this.vp.classList.remove('dragmode');
    this.els.forEach(el => el.classList.remove('drop-child', 'drop-before', 'drop-after', 'dragging'));
    if (d.drop) this.moveMany(d.ids, d.drop.id, d.drop.pos, d.drop.side);
  }
  moveMany(ids, tid, pos, side) {
    const list = ids.filter(id => this.index.get(id) && this.index.get(id).p);
    const order = n => { const out = []; (function w(x) { out.push(x.id); x.children.forEach(w); })(this.doc.root); return out.indexOf(n); };
    const ord = list.slice().sort((a, b) => order.call(this, a) - order.call(this, b));
    const tgt = this.index.get(tid); if (!tgt) return false;
    if (ord.some(id => id === tid || this.isDesc(tid, id))) return false;
    if (pos !== 'child' && !tgt.p) return false;
    const nodes = ord.map(id => this.index.get(id).n);
    nodes.forEach(n => { const p = this.index.get(n.id).p; p.children.splice(p.children.indexOf(n), 1); });
    const parent = pos === 'child' ? tgt.n : tgt.p;
    if (pos === 'child') { tgt.n.collapsed = false; tgt.n.children.push(...nodes); }
    else { const i = parent.children.indexOf(tgt.n); parent.children.splice(pos === 'before' ? i : i + 1, 0, ...nodes); }
    nodes.forEach(n => {
      if (parent === this.doc.root) n.side = side || (pos !== 'child' ? tgt.n.side : undefined) || n.side;
      if (n.side === undefined) delete n.side;
    });
    this.commit(); this.select(nodes[0].id); nodes.slice(1).forEach(n => this.sel.add(n.id)); this.paintSel(); this.o.onSelect && this.o.onSelect();
    return true;
  }
  move(id, tid, pos, side) { return this.moveMany([id], tid, pos, side); }

  /* ----- keyboard ----- */
  onKey(e) {
    if (this.o.isBlocked && this.o.isBlocked()) return;
    const tg = e.target;
    if (tg.closest && tg.closest('input,textarea,select,button,[contenteditable="true"],[contenteditable="plaintext-only"]')) return;
    if (e.isComposing || e.keyCode === 229) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key, kl = k.length === 1 ? k.toLowerCase() : k; let h = true;
    if (mod) {
      if (kl === 'z') e.shiftKey ? this.redo() : this.undo();
      else if (kl === 'y') this.redo();
      else if (kl === 'a') this.selectAll();
      else if (kl === 'b') this.toggleStyle('bold');
      else if (kl === 'i') this.toggleStyle('italic');
      else if (kl === 'u') this.toggleStyle('u');
      else if (k === '=' || k === '+') this.zoomBy(1.2);
      else if (k === '-') this.zoomBy(1 / 1.2);
      else if (k === '0') this.fit();
      else if (k === '/') this.toggleCollapse();
      else if (k === 'Enter') this.addParent();
      else h = false;
    } else if (!this.primary) h = false;
    else switch (k) {
      case 'Enter': e.shiftKey ? this.addSibling(this.primary, true) : this.addSibling(); break;
      case 'Tab': this.addChild(); break;
      case 'Delete': case 'Backspace': this.remove(); break;
      case 'F2': case ' ': this.startEdit(this.primary, true); break;
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': this.nav(k, e.shiftKey); break;
      case 'Escape': this.clearSel(); break;
      default: h = false;
    }
    if (h) e.preventDefault();
  }
  nav(k, add) {
    const cur = this.index.get(this.primary); if (!cur) return; const a = cur.n, ax = a._x + a._w / 2, ay = a._y + a._h / 2;
    let best = null, bd = 1e9;
    this.vis.forEach(n => {
      if (n === a) return; const dx = n._x + n._w / 2 - ax, dy = n._y + n._h / 2 - ay; let main, cross;
      if (k === 'ArrowRight') { main = dx; cross = dy; } else if (k === 'ArrowLeft') { main = -dx; cross = dy; }
      else if (k === 'ArrowDown') { main = dy; cross = dx; } else { main = -dy; cross = dx; }
      if (main <= 4) return; const d = main + Math.abs(cross) * 2.2; if (d < bd) { bd = d; best = n; }
    });
    if (best) { this.select(best.id, add); this.reveal(best.id); }
  }

  /* ----- inline editing with rich text ----- */
  startEdit(id, all = true) {
    const info = this.index.get(id); if (!info) return; this.endEdit(true);
    this.select(id); const el = this.els.get(id), t = el.querySelector('.t');
    this.editing = { id, old: { text: info.n.text, html: info.n.html }, t };
    t.contentEditable = 'true'; t.spellcheck = false; el.classList.add('editing'); t.classList.remove('hl'); t.style.background = '';
    t.focus();
    const r = document.createRange(); r.selectNodeContents(t); if (!all) r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    t.oninput = () => { this.relayout(); this.posFmt(); };
    t.onkeydown = e => {
      if (e.isComposing || e.keyCode === 229) return; e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.endEdit(true); this.vp.focus({ preventScroll: true }); }
      else if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      else if (e.key === 'Escape') { e.preventDefault(); this.endEdit(false); this.vp.focus({ preventScroll: true }); }
      else if (e.key === 'Tab') { e.preventDefault(); this.endEdit(true); this.addChild(); }
    };
    t.onpaste = e => { e.preventDefault(); const tx = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, tx.replace(/\r?\n/g, ' ')); };
    t.onblur = () => {
      if (this.noBlur) return;
      setTimeout(() => { if (this.editing && this.editing.t === t && document.activeElement !== t && !this.fmt.contains(document.activeElement)) this.endEdit(true); }, 0);
    };
    this.fmt.hidden = false; this.posFmt();
  }
  endEdit(save) {
    const ed = this.editing; if (!ed) return; this.editing = null;
    const { t, id, old } = ed; t.onblur = t.onkeydown = t.oninput = t.onpaste = null;
    t.contentEditable = 'false'; this.fmt.hidden = true; this.closePops();
    const el = this.els.get(id); if (el) el.classList.remove('editing');
    try { getSelection().removeAllRanges(); } catch (e) {}
    const info = this.index.get(id); if (!info) return;
    let changed = false;
    if (save) {
      const r = sanitize(t.innerHTML);
      if (r.text.trim()) {
        const nh = r.rich ? r.html : undefined;
        changed = r.text !== old.text || nh !== old.html;
        info.n.text = r.text; if (nh) info.n.html = nh; else delete info.n.html;
      }
    }
    if (changed) this.commit(); else this.render();
  }

  /* floating text-format toolbar */
  buildFmt() {
    const f = this.fmt = $('div', 'mm-fmt'); f.hidden = true; document.body.append(f);
    const keep = e => e.preventDefault();
    const btn = (html, title, fn, cls) => { const b = $('button', 'fb ' + (cls || ''), html); b.type = 'button'; b.title = title; b.onmousedown = keep; b.onclick = fn; f.append(b); return b; };
    btn('<b>B</b>', 'Bold (Ctrl+B)', () => this.exec('bold'));
    btn('<i>I</i>', 'Italic (Ctrl+I)', () => this.exec('italic'));
    btn('<u>U</u>', 'Underline (Ctrl+U)', () => this.exec('underline'));
    btn('<s>S</s>', 'Strikethrough', () => this.exec('strikeThrough'));
    f.append($('span', 'fsep'));
    const pal = ['#111827', '#6b7280', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#ffffff'];
    const hlp = ['#fef08a', '#fde68a', '#fdba74', '#fca5a5', '#f9a8d4', '#d8b4fe', '#a5b4fc', '#93c5fd', '#99f6e4', '#bbf7d0', '#d9f99d', '#e5e7eb'];
    this.popBtn(f, '<span class="fa">A</span>', 'Text colour', pal, c => this.exec('foreColor', c), 'fore');
    this.popBtn(f, '<span class="fh">ab</span>', 'Highlight', hlp, c => c ? this.exec('hiliteColor', c) : this.exec('hiliteColor', 'transparent'), 'hil', true);
    this.popSizes(f);
    f.append($('span', 'fsep'));
    btn('x<sup>2</sup>', 'Superscript', () => this.exec('superscript'));
    btn('x<sub>2</sub>', 'Subscript', () => this.exec('subscript'));
    btn('🔗', 'Insert link', () => this.execLink());
    btn('<span style="text-decoration:line-through wavy">T</span>', 'Clear formatting', () => this.exec('removeFormat'));
  }
  closePops() { this.fmt.querySelectorAll('.fpop').forEach(p => p.hidden = true); }
  popBtn(f, html, title, colors, fn, key, clearable) {
    const wrap = $('span', 'fwrap'), b = $('button', 'fb', html); b.type = 'button'; b.title = title; b.onmousedown = e => e.preventDefault();
    const pop = $('div', 'fpop'); pop.hidden = true;
    colors.forEach(c => { const s = $('button', 'sw'); s.type = 'button'; s.style.background = c; s.title = c; s.onmousedown = e => e.preventDefault(); s.onclick = () => { fn(c); pop.hidden = true; }; pop.append(s); });
    if (clearable) { const s = $('button', 'sw none', '∅'); s.type = 'button'; s.title = 'Remove highlight'; s.onmousedown = e => e.preventDefault(); s.onclick = () => { fn(null); pop.hidden = true; }; pop.append(s); }
    const cu = $('input'); cu.type = 'color'; cu.title = 'Custom colour'; cu.className = 'swc';
    let saved = null;
    cu.onmousedown = () => { const s = getSelection(); saved = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; };
    cu.oninput = () => { const t = this.editing && this.editing.t; if (!t) return; t.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } fn(cu.value); };
    pop.append(cu);
    b.onclick = () => { const open = pop.hidden; this.closePops(); pop.hidden = !open; };
    wrap.append(b, pop); f.append(wrap);
  }
  popSizes(f) {
    const wrap = $('span', 'fwrap'), b = $('button', 'fb', '<span style="font-size:11px">A</span><span style="font-size:15px">A</span>'); b.type = 'button'; b.title = 'Font size'; b.onmousedown = e => e.preventDefault();
    const pop = $('div', 'fpop sizes'); pop.hidden = true;
    [12, 14, 16, 18, 20, 24, 28, 32, 40, 56].forEach(sz => { const s = $('button', 'sz', String(sz)); s.type = 'button'; s.onmousedown = e => e.preventDefault(); s.onclick = () => { this.exec('fontSize', sz); pop.hidden = true; }; pop.append(s); });
    b.onclick = () => { const open = pop.hidden; this.closePops(); pop.hidden = !open; };
    wrap.append(b, pop); f.append(wrap);
  }
  exec(cmd, val) {
    const ed = this.editing; if (!ed) return; const t = ed.t; t.focus();
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed || !t.contains(sel.anchorNode)) { const r = document.createRange(); r.selectNodeContents(t); sel.removeAllRanges(); sel.addRange(r); }
    if (cmd === 'fontSize') {
      document.execCommand('styleWithCSS', false, false); document.execCommand('fontSize', false, '7');
      t.querySelectorAll('font[size="7"]').forEach(f => { const s = document.createElement('span'); s.style.fontSize = val + 'px'; while (f.firstChild) s.append(f.firstChild); f.replaceWith(s); });
    } else { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); }
    this.relayout(); this.posFmt();
  }
  execLink() {
    const ed = this.editing; if (!ed) return; const t = ed.t, s = getSelection();
    const range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; this.noBlur = true;
    const url = window.prompt('Link address (leave empty to remove the link):', 'https://'); this.noBlur = false;
    t.focus(); if (range) { s.removeAllRanges(); s.addRange(range); }
    if (url === null) return;
    if (!url.trim()) document.execCommand('unlink'); else { const u = safeUrl(url); if (u) { if (s.isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(u)}">${esc(u)}</a>`); else document.execCommand('createLink', false, u); } }
    this.relayout(); this.posFmt();
  }
  posFmt() {
    const ed = this.editing; if (!ed) return; const el = this.els.get(ed.id); if (!el) return;
    const r = el.getBoundingClientRect(), f = this.fmt; f.hidden = false;
    const fw = f.offsetWidth, fh = f.offsetHeight; let x = r.left + r.width / 2 - fw / 2, y = r.top - fh - 10;
    if (y < 8) y = r.bottom + 10; x = Math.max(8, Math.min(innerWidth - fw - 8, x)); f.style.left = x + 'px'; f.style.top = y + 'px';
  }

  /* ----- structure operations ----- */
  newNode(text = 'Subtopic') { return { id: uid(), text, children: [] }; }
  addChild(id = this.primary, quiet = false) {
    const info = this.index.get(id) || this.index.get(this.doc.root.id), p = info.n; p.collapsed = false;
    const n = this.newNode(); p.children.push(n); this.commit(); if (!quiet) { this.select(n.id); this.reveal(n.id); this.startEdit(n.id, true); } return n;
  }
  addSibling(id = this.primary, before = false, quiet = false) {
    const info = this.index.get(id); if (!info) return this.addChild(undefined, quiet);
    if (!info.p) return this.addChild(id, quiet);
    const n = this.newNode(); if (info.n.side) n.side = info.n.side;
    const i = info.p.children.indexOf(info.n); info.p.children.splice(before ? i : i + 1, 0, n);
    this.commit(); if (!quiet) { this.select(n.id); this.reveal(n.id); this.startEdit(n.id, true); } return n;
  }
  setText(id, text) { const n = this.get(id); if (!n) return; n.text = String(text); delete n.html; this.commit(); }
  indent(id) {   // make the topic a child of its previous sibling (outliner Tab)
    const i = this.index.get(id); if (!i || !i.p) return false; const k = i.p.children.indexOf(i.n); if (k < 1) return false;
    return this.moveMany([id], i.p.children[k - 1].id, 'child');
  }
  outdent(id) {   // move the topic after its parent (outliner Shift+Tab)
    const i = this.index.get(id); if (!i || !i.p || !this.index.get(i.p.id).p) return false;
    return this.moveMany([id], i.p.id, 'after');
  }
  addParent(id = this.primary) {   // wrap selected node in a new parent
    const info = this.index.get(id); if (!info || !info.p) return;
    const n = this.newNode('Intermediate topic'), i = info.p.children.indexOf(info.n);
    if (info.n.side) n.side = info.n.side; info.p.children.splice(i, 1, n); n.children.push(info.n);
    this.commit(); this.select(n.id); this.startEdit(n.id, true);
  }
  addTree(id, items) {   // add a plain {text, children} tree under a topic (used by the AI assistant); returns the number of topics added
    const info = this.index.get(id) || this.index.get(this.doc.root.id), p = info.n; let count = 0;
    const mk = a => { count++; return { id: uid(), text: String(a.text || '').slice(0, 200), children: (a.children || []).map(mk) }; };
    const nodes = (items || []).map(mk); if (!nodes.length) return 0;
    p.collapsed = false; p.children.push(...nodes); this.commit(); this.select(nodes[0].id); this.reveal(nodes[0].id); return count;
  }
  remove() {
    const nodes = this.selNodes().filter(n => this.index.get(n.id).p); if (!nodes.length) return;
    const first = this.index.get(nodes[0].id); let next = null;
    if (first) { const sib = first.p.children; const i = sib.indexOf(first.n); next = (sib[i + 1] || sib[i - 1] || first.p).id; }
    nodes.forEach(n => { const p = this.index.get(n.id).p; const i = p.children.indexOf(n); if (i >= 0) p.children.splice(i, 1); });
    this.commit(); this.select(next);
  }
  toggleCollapse(ids) {
    ids = ids || [...this.sel]; let any = false;
    const targets = ids.map(i => this.get(i)).filter(n => n && n.children.length);
    if (!targets.length) return; const collapse = !targets.every(n => n.collapsed);
    targets.forEach(n => { n.collapsed = collapse; any = true; });
    if (any) { this.commit(); }
  }
  expandAll(open = true) { this.index.forEach(({ n }) => { if (n.children.length) n.collapsed = !open; }); this.commit(); }
  setStyle(patch, ids) {
    const nodes = (ids ? ids.map(i => this.get(i)) : this.selNodes().length ? [...this.sel].map(i => this.get(i)) : []).filter(Boolean);
    nodes.forEach(n => {
      const s = Object.assign({}, n.style || {}, patch);
      Object.keys(s).forEach(k => { if (s[k] == null || s[k] === '' || s[k] === false && k !== 'bold') delete s[k]; });
      if (Object.keys(s).length) n.style = s; else delete n.style;
    });
    if (nodes.length) { this.commit(); this.o.onSelect && this.o.onSelect(); }
  }
  toggleStyle(key) {   // bold / italic / u / strike applied to whole selected nodes (or to selection while editing)
    if (this.editing) { this.exec({ bold: 'bold', italic: 'italic', u: 'underline', strike: 'strikeThrough' }[key]); return; }
    const r = this.sty.get(this.primary); if (!r) return;
    const cur = key === 'bold' ? r.weight >= 600 : key === 'italic' ? r.italic : key === 'u' ? r.under : r.strike;
    this.setStyle({ [key]: !cur });
  }
  clearStyle() { [...this.sel].forEach(id => { const n = this.get(id); if (n) { delete n.style; } }); this.commit(); this.o.onSelect && this.o.onSelect(); }
  clearRich() { [...this.sel].forEach(id => { const n = this.get(id); if (n) delete n.html; }); this.commit(); }
  toggleMarker(mid) {
    [...this.sel].forEach(id => {
      const n = this.get(id); if (!n) return; let m = n.markers || [];
      if (m.includes(mid)) m = m.filter(x => x !== mid);
      else { const g = groupOf(mid); m = m.filter(x => groupOf(x) !== g); m.push(mid); }
      if (m.length) n.markers = m; else delete n.markers;
    });
    this.commit(); this.o.onSelect && this.o.onSelect();
  }
  clearMarkers() { [...this.sel].forEach(id => { const n = this.get(id); if (n) delete n.markers; }); this.commit(); this.o.onSelect && this.o.onSelect(); }
  setField(id, field, val, commit = true) {
    const n = this.get(id); if (!n) return;
    if (field === 'link') val = safeUrl(val);
    if (field === 'labels') val = (Array.isArray(val) ? val : String(val).split(',')).map(s => s.trim()).filter(Boolean);
    if (val == null || val === '' || (Array.isArray(val) && !val.length)) delete n[field]; else n[field] = val;
    if (commit) this.commit();
  }
  setLayout(l) { this.doc.layout = l; this.commit(); requestAnimationFrame(() => this.fit()); }
  setTheme(t) { this.doc.theme = t; this.commit(); }
  setLineStyle(s) { this.doc.lineStyle = s; this.commit(); }
  setTitle(t) { this.doc.title = t; this.changed(); }
  setRootText(t) { this.doc.root.text = t; delete this.doc.root.html; }

  /* ----- clipboard ----- */
  outlineOf(nodes) {
    const lines = []; const w = (n, d) => { lines.push('  '.repeat(d) + '- ' + n.text.replace(/\n/g, ' ')); n.children.forEach(c => w(c, d + 1)); };
    nodes.forEach(n => w(n, 0)); return lines.join('\n');
  }
  fresh(n) { const o = JSON.parse(JSON.stringify(n)); (function w(x) { x.id = uid(); x.children.forEach(w); })(o); return o; }
  inEditable(e) { const t = e.target; return t && t.closest && t.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]'); }
  onCopy(e, cut) {
    if (this.inEditable(e) || (this.o.isBlocked && this.o.isBlocked()) || !this.sel.size) return;
    const nodes = this.selNodes(); if (!nodes.length) return;
    const ser = this.serialize(); const byId = new Map(); (function w(n) { byId.set(n.id, n); n.children.forEach(w); })(ser.root);
    this.clip = { items: nodes.map(n => byId.get(n.id)), text: this.outlineOf(nodes) };
    e.clipboardData.setData('text/plain', this.clip.text); e.preventDefault();
    if (cut) this.remove();
  }
  onPaste(e) {
    if (this.inEditable(e) || (this.o.isBlocked && this.o.isBlocked()) || !this.primary) return;
    const text = (e.clipboardData || window.clipboardData).getData('text/plain'); if (!text) return; e.preventDefault();
    const info = this.index.get(this.primary); let items;
    if (this.clip && text === this.clip.text) items = this.clip.items.map(n => this.fresh(n));
    else items = parseOutline(text).map(n => norm(n));
    if (!items.length) return;
    info.n.collapsed = false; info.n.children.push(...items); this.commit();
    this.select(items[0].id); this.reveal(items[0].id);
  }

  /* ----- search ----- */
  find(q) {
    this.hits.clear(); q = fold(q).trim(); if (!q) { this.paintSel(); return []; }
    const res = []; const open = [];
    this.index.forEach(({ n }) => {
      const hay = fold(n.text + ' ' + (n.note || '') + ' ' + (n.labels || []).join(' '));
      if (hay.includes(q)) res.push(n.id);
    });
    let changed = false;
    res.forEach(id => { for (let x = this.index.get(id).p; x; x = this.index.get(x.id).p) if (x.collapsed) { x.collapsed = false; changed = true; } });
    if (changed) { this.reindex(); this.render(); }
    res.forEach(id => this.hits.add(id)); this.paintSel(); return res;
  }
  clearFind() { this.hits.clear(); this.paintSel(); }
  focusNode(id) { if (!this.els.has(id)) return; this.select(id); this.centerOn(id); }

  /* ----- export ----- */
  cssText() {
    let css = '';
    [...document.styleSheets].forEach(ss => {
      let rules; try { rules = ss.cssRules; } catch (e) { return; }
      [...rules].forEach(r => { if (r.selectorText && /\.(node|mm-links|mm-stage|mk|mks|lb|labels|fold|ic|t|row|hl)\b/.test(r.selectorText) && !/hover|\.sel|\.pri|\.hit|\.editing|\.drop|\.dragging|\.ghost/.test(r.selectorText)) css += r.cssText + '\n'; });
    });
    return css;
  }
  exportSVG(pad = 40) {
    const wasDark = this.appDark; if (wasDark) { this.appDark = false; this.render(); }
    try { return this.exportSVGNow(pad); } finally { if (wasDark) { this.appDark = true; this.render(); } }
  }
  exportSVGNow(pad) {
    const b = this.bounds(), th = this.theme(), w = Math.ceil(b.w + pad * 2 + 40), h = Math.ceil(b.h + pad * 2);
    const clone = this.stage.cloneNode(true);
    clone.style.transform = `translate(${pad + 20 - b.x}px,${pad - b.y}px)`;
    clone.querySelectorAll('.sel,.pri,.hit,.editing,.dragging').forEach(e => e.classList.remove('sel', 'pri', 'hit', 'editing', 'dragging'));
    clone.querySelectorAll('.fold:not(.on)').forEach(e => e.remove());
    clone.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:relative;width:${w}px;height:${h}px;background:${this.bgColor()};overflow:hidden;font-family:'Google Sans','Google Sans Flex',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif`;
    wrap.append(clone);
    const xml = new XMLSerializer().serializeToString(wrap);
    return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style><![CDATA[${MindMap.fontCss || ''}${this.cssText()}]]></style><foreignObject x="0" y="0" width="${w}" height="${h}">${xml}</foreignObject></svg>` };
  }
  async exportPNG(scale = 2) {
    await MindMap.loadFontCss();
    const { svg, w, h } = this.exportSVG(); const s = Math.min(scale, 16000 / Math.max(w, h));
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    const x = c.getContext('2d'); x.fillStyle = this.bgColor(); x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not create the image')), 'image/png'));
  }
  styleInfo(id) { return this.sty.get(id); }
}

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400..700&display=swap';
MindMap.fontCss = null;
MindMap.loadFontCss = async function () {
  if (MindMap.fontCss !== null) return MindMap.fontCss;
  let out = '';
  try {
    const css = await (await fetch(FONT_URL)).text(), parts = css.split(/\/\*\s*([\w-]+)\s*\*\//).slice(1);
    for (let i = 0; i < parts.length; i += 2) {
      if (!['latin', 'latin-ext', 'vietnamese'].includes(parts[i])) continue;
      const u = (parts[i + 1].match(/url\(([^)]+)\)/) || [])[1]; if (!u) continue;
      const buf = await (await fetch(u)).arrayBuffer();
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([buf], { type: 'font/woff2' })); });
      out += parts[i + 1].replace(u, data);
    }
  } catch (e) { out = ''; }
  return (MindMap.fontCss = out);
};
MindMap.THEMES = THEMES; MindMap.MARKER_GROUPS = MARKER_GROUPS; MindMap.markerEl = markerEl; MK && (MindMap.MK = MK);
MindMap.parseOutline = parseOutline; MindMap.norm = norm; MindMap.uid = uid; MindMap.sanitize = sanitize; MindMap.safeUrl = safeUrl; MindMap.esc = esc;
g.MindMap = MindMap;
})(window);
