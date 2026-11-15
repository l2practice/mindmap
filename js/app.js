/* Application shell: views, auth flow, autosave, editor chrome, minimap, presentation, settings, admin */
(function (g) {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = MindMap.esc;
const S = { me: null, user: null, mm: null, folder: { id: '', name: '' }, fileId: null, modified: null, maps: [], mapsLoading: false, dirty: false, saving: false, again: false, rev: 0, timer: null, draftT: null, renewing: false, lastTitle: '', view: 'home' };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
const errMsg = e => (e && e.message) || String(e);
const isAdmin = () => !!S.me && S.me.role === 'admin';
const can = k => !!S.me && (S.me.role === 'admin' || S.me.perms[k] !== false);
const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const fdate = t => t ? new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '';

/* ---------- preferences (per device) ---------- */
const P = Object.assign({ autosave: true, zoom: 'fit', appTheme: 'system', mapTheme: 'classic', layout: 'map' }, (() => { try { return JSON.parse(lsGet('mm-prefs') || '{}'); } catch (e) { return {}; } })());
if (!MindMap.THEMES[P.mapTheme]) P.mapTheme = 'classic';   // themes that no longer exist fall back to Classic
const savePrefs = () => lsSet('mm-prefs', JSON.stringify(P));
const isDark = () => P.appTheme === 'dark' || (P.appTheme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
function applyAppTheme() {
  const dark = isDark(); document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (typeof S !== 'undefined' && S.mm) S.mm.setAppDark(dark);
  if (window.MMIcons) document.querySelectorAll('[data-theme-toggle]').forEach(b => { b.innerHTML = MMIcons.svg(dark ? 'sun' : 'moon'); b.title = dark ? 'Switch to light mode' : 'Switch to dark mode'; });
}
applyAppTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppTheme);

/* ---------- small UI helpers ---------- */
function toast(msg, bad, ms) {
  const d = document.createElement('div'); d.textContent = msg; if (bad) d.className = 'bad'; $('#toast').append(d);
  setTimeout(() => d.remove(), ms || (bad ? 6000 : 2600)); return d;
}
function menu(items, x, y) {
  $$('.menu').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'menu';
  items.forEach(it => {
    if (it.sep) return m.append(document.createElement('hr'));
    if (it.hd) { const h = document.createElement('div'); h.className = 'hd'; h.textContent = it.hd; return m.append(h); }
    const b = document.createElement('button'); b.disabled = !!it.disabled; b.innerHTML = `<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}`;
    b.onclick = () => { m.remove(); it.fn && it.fn(); }; m.append(b);
  });
  document.body.append(m);
  const w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(6, Math.min(innerWidth - w - 6, x)) + 'px'; m.style.top = Math.max(6, Math.min(innerHeight - h - 6, y)) + 'px';
  setTimeout(() => { const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  return m;
}
const menuAt = (btn, items) => { const r = btn.getBoundingClientRect(); menu(items, Math.min(r.left, innerWidth - 240), r.bottom + 6); };
function modal(title, html, o = {}) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${o.wide ? 'wide' : ''}" role="dialog" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="ib" data-x>✕</button></header><div class="body">${html}</div></div>`;
  const close = () => { bg.remove(); o.onClose && o.onClose(); };
  bg.addEventListener('pointerdown', e => { if (e.target === bg) close(); }); bg.querySelector('[data-x]').onclick = close;
  document.body.append(bg); return { el: bg.querySelector('.body'), close };
}
const blocked = () => !!document.querySelector('.modal-bg') || !$('#gate').hidden || PR.on || S.view !== 'editor';

/* ---------- gate: login / register / waiting ---------- */
const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
function gateShow(which) {   // landing | login | state
  $('#gate').hidden = false; $('#app').hidden = true;
  $('#landing').hidden = which !== 'landing'; $('#loginCard').hidden = which !== 'login'; $('#stateCard').hidden = which !== 'state';
}
function gate(html) { gateShow('state'); $('#gate-body').innerHTML = html; }          // message card (register / waiting / error)
function gateLogin(msg, card) {
  gateShow(card || msg ? 'login' : 'landing');
  if (card || msg) { $('#gErr').textContent = msg || ''; $('#gGoogle').disabled = false; $('#gGoogle').innerHTML = GOOGLE_G + '<span>Sign in with Google</span><b>→</b>'; }
}
async function doLogin() {
  const b = $('#gGoogle'); b.disabled = true; b.innerHTML = '<span class="spin"></span><span>Signing in…</span>'; $('#gErr').textContent = '';
  try { await Cloud.signIn($('#gRemember').checked); await afterLogin(); }
  catch (err) {
    gateLogin(err.code === 'popup_closed' || err.code === 'access_denied' ? 'The sign-in window was closed or permission was denied.' : err.code === 'popup_failed_to_open' ? 'Your browser blocked the sign-in window. Allow pop-ups and try again.' : errMsg(err), true);
  }
}
function openDemo() {
  const m = modal('Watch demo', '<div id="demoMap" style="height:min(70vh,560px);border-radius:12px;overflow:hidden;position:relative"></div><div class="help" style="margin-top:10px">This is a sample map (view only). Sign in to create and edit your own maps.</div>', { wide: true });
  const doc = MMTemplates.make('skills'); doc.theme = 'classic'; doc.title = 'Demo';
  const mm = new MindMap(m.el.querySelector('#demoMap'), { static: true }); mm.readOnly = true; mm.load(doc); requestAnimationFrame(() => mm.fit());
}
function initGate() {
  $('#gStart').onclick = $('#gNavLogin').onclick = () => gateLogin('', true);
  $('#gDemo').onclick = openDemo; $$('[data-demo]').forEach(b => b.onclick = openDemo);
  $('#gGoogle').onclick = doLogin; $('#gReg').onclick = () => { $('#gErr').textContent = ''; doLogin(); };
  $('#gBack').onclick = () => gateLogin();
}
async function afterLogin() { const u = Cloud.user || await Cloud.userinfo(); S.user = u; route((await Cloud.gas('me', { name: u.name })).me); }
function route(me) {
  const who = `<p><b>${esc(S.user.name || '')}</b><br><span style="color:var(--muted)">${esc(S.user.email)}</span></p>`;
  const out = `<p><button class="btn small" id="gOut">Sign out / switch account</button></p>`;
  if (me.status === 'active') return start(me);
  if (me.status === 'none') {
    gate(`${who}<div class="badge wait">No access yet</div><p class="sub" style="margin-top:12px">This account has not been granted access yet. Send a request for the administrator to approve.</p>
      <input type="text" id="rgNote" placeholder="Who are you? (class / unit / reason)" maxlength="300"><button class="btn primary" id="rgGo">Request access</button><div class="err" id="rgErr"></div>${out}`);
    $('#rgGo').onclick = async e => { e.target.disabled = true; try { route((await Cloud.gas('register', { name: S.user.name, note: $('#rgNote').value })).me); } catch (err) { $('#rgErr').textContent = errMsg(err); e.target.disabled = false; } };
  } else if (me.status === 'pending') {
    gate(`${who}<div class="badge wait">Awaiting approval</div><p class="sub" style="margin-top:12px">Your request has been sent. When the administrator approves it, click "Check again".</p><p><button class="btn primary" id="gRe">Check again</button></p>${out}`);
    $('#gRe').onclick = async e => { e.target.disabled = true; try { route((await Cloud.gas('me', {})).me); } catch (err) { toast(errMsg(err), true); e.target.disabled = false; } };
  } else gate(`${who}<div class="badge bad">Blocked</div><p class="sub" style="margin-top:12px">This account has been blocked by the administrator. Contact the administrator if this is a mistake.</p>${out}`);
  const b = $('#gOut'); if (b) b.onclick = async () => { await Cloud.signOut(); gateLogin(); };
}

/* ---------- start ---------- */
function start(me) {
  S.me = me; S.folder = { id: me.folderId || '', name: me.folderName || '' };
  $('#gate').hidden = true; $('#app').hidden = false;
  const av = (S.user && S.user.picture) || 'icon.svg';
  $('#ucAvatar').src = av; $('#eAvatar').src = av; $('#ucName').textContent = (S.user && S.user.name) || ''; $('#ucMail').textContent = (S.user && S.user.email) || '';
  $('#navAdmin').hidden = !isAdmin();
  if (!S.mm) { initShell(); initEditor(); initInspector(); initSearch(); initMini(); initAI(); }
  updateUserCard();
  setInsp(innerWidth > 900 && lsGet('mm-insp') !== '0');
  go('home');
  loadLibrary().then(() => { restoreDraft(); if (!S.folder.id) setTimeout(() => { if (S.view === 'home') { toast('Link a Google Drive folder to save your maps.'); go('cloud'); } }, 500); });
}
function updateUserCard() {
  $('#ucDrive').innerHTML = S.folder.id ? `📁 ${esc(S.folder.name || 'Drive folder')}` : '<button class="link" data-go="cloud">⚠ Drive not linked</button>';
}

/* ---------- router ---------- */
function go(v) {
  if (v === 'admin' && !isAdmin()) v = 'home';
  const was = S.view; if (was === 'editor' && v !== 'editor') { endPresent(); flush(); $$('.menu').forEach(m => m.remove()); }
  S.view = v; const app = $('#app'); app.dataset.view = v; app.classList.remove('menu-open');
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === v));
  $('#v-editor').hidden = v !== 'editor'; $('#pages').scrollTop = 0;
  const r = { home: renderHome, maps: renderMaps, templates: renderTemplates, cloud: renderCloud, settings: renderSettings, admin: renderAdmin }[v]; if (r) r();
  if (v === 'editor' && S.mm) S.mm.render();
}
function initShell() {
  document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.closest('#nav')) go(b.dataset.go); });
  $('#nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.go); };
  $$('.burger').forEach(b => b.onclick = () => $('#app').classList.toggle('menu-open')); $('#scrim').onclick = () => $('#app').classList.remove('menu-open');
  $('#ucOut').onclick = logout;
  $('#hNew').onclick = () => newMap(); $('#mNew').onclick = () => newMap(); $('#hTpl').onclick = () => go('templates');
  $('#hImport').onclick = () => pickFile('.xmind,.pdf,.md,.markdown,.txt,.json'); $('#mImport').onclick = () => pickFile('.xmind,.pdf,.md,.markdown,.txt,.json');
  $('#mRef').onclick = async () => { await loadLibrary(); toast('List reloaded'); }; $('#mQ').oninput = renderMaps; $('#tQ').oninput = renderTemplates;
  $('#adRef').onclick = renderAdmin;
  $('#fileIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) doImport(f); };
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  // drag & drop a file anywhere
  let dz = null; const undz = () => { if (dz) { dz.remove(); dz = null; } };
  document.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files') && !$('#app').hidden) { e.preventDefault(); if (!dz) { dz = document.createElement('div'); dz.className = 'dropzone'; dz.style.position = 'fixed'; dz.style.zIndex = 400; dz.textContent = 'Drop an .xmind / .pdf / .md file here'; document.body.append(dz); } } });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) undz(); });
  document.addEventListener('drop', e => { undz(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && !$('#app').hidden) { e.preventDefault(); doImport(f); } });
}

/* ---------- editor chrome ---------- */
function initEditor() {
  document.querySelectorAll('[data-theme-toggle]').forEach(b => b.onclick = () => { P.appTheme = isDark() ? 'light' : 'dark'; savePrefs(); applyAppTheme(); if (S.view === 'settings') renderSettings(); });
  S.mm = new MindMap($('#canvas'), {
    onChange, onSelect: () => { updateInspector(); updateOutlinerSel(); }, isBlocked: blocked, onLayout: drawMini,
    onView: k => { $('#zPct').textContent = Math.round(k * 100) + '%'; drawMini(); },
    onContext: (id, x, y) => contextMenu(id, x, y)
  });
  applyAppTheme();
  // The layout is measured from rendered text, so re-measure once the web font has really loaded (otherwise boxes keep fallback-font widths)
  if (document.fonts) { const again = () => { if (S.mm && S.view === 'editor') S.mm.relayout(); }; document.fonts.addEventListener('loadingdone', again); document.fonts.ready.then(again); }
  $('#title').addEventListener('input', e => {
    const v = e.target.value, mm = S.mm, r = mm.doc.root;
    if (r.text === S.lastTitle && !r.html && mm.index.size === 1) { mm.setRootText(v); mm.render(); }
    S.lastTitle = v; S.book.title = v; mm.changed();
  });
  $('#eBack').onclick = () => go('maps');
  $('#zIn').onclick = () => S.mm.zoomBy(1.2); $('#zOut').onclick = () => S.mm.zoomBy(1 / 1.2); $('#zFit').onclick = () => S.mm.fit(); $('#zHelp').onclick = showShortcuts;
  $('#zoomPill').onclick = e => { const r = S.mm.vp.getBoundingClientRect(); menuAt(e.currentTarget, [50, 75, 100, 125, 150, 200].map(z => ({ label: z + '%', fn: () => S.mm.zoomAt(z / 100, r.left + r.width / 2, r.top + r.height / 2) })).concat([{ sep: 1 }, { label: 'Fit to screen', hint: 'Ctrl+0', fn: () => S.mm.fit() }])); };
  $('#btnUndo').onclick = () => S.mm.undo(); $('#btnRedo').onclick = () => S.mm.redo();
  $('#sheetAdd').onclick = addSheet; $('#btnOutl').onclick = () => toggleOutliner($('#outl').hidden); $('#olClose').onclick = () => toggleOutliner(false);
  $('#btnPresent').onclick = present; $('#btnShare').onclick = openShare;
  $('#btnInsp').onclick = () => setInsp($('#insp').hidden); $('#inspClose').onclick = () => setInsp(false); $('#inspOpen').onclick = () => setInsp(true);
  $('#eMenu').onclick = e => menuAt(e.currentTarget, fileMenu());
  $('#eAvatar').onclick = e => menuAt(e.currentTarget, [{ hd: S.user ? S.user.email : '' }, { label: 'Go to home', fn: () => go('home') }, { label: 'Settings', fn: () => go('settings') }, { sep: 1 }, { label: 'Sign out', fn: logout }]);
  $('#qbar').onclick = e => {
    const b = e.target.closest('[data-q]'); if (!b) return; const mm = S.mm; if (!mm.primary && b.dataset.q !== 'child') return toast('Select a topic first');
    ({ child: () => mm.addChild(), sibling: () => mm.addSibling(), edit: () => mm.startEdit(mm.primary, true), fold: () => mm.toggleCollapse(), del: () => mm.remove() })[b.dataset.q]();
  };
  $('#rail').onclick = e => {
    const b = e.target.closest('[data-r]'); if (!b) return; const mm = S.mm, r = b.dataset.r;
    const needSel = () => { if (!mm.primary) { toast('Select a topic first'); return false; } return true; };
    const openInsp = () => { setInsp(true); $$('.tabs button[data-tab]')[0].click(); };
    if (r === 'ai') toggleAI($('#aip').hidden);
    else if (r === 'sibling') mm.primary ? mm.addSibling() : mm.addChild();
    else if (r === 'child') mm.addChild(mm.primary || mm.doc.root.id);
    else if (r === 'parent') { if (needSel()) mm.addParent(); }
    else if (r === 'note') { if (needSel()) { openInsp(); $('#secNote').scrollIntoView({ block: 'center' }); setTimeout(() => $('#fNote').focus(), 50); } }
    else if (r === 'marker') { if (needSel()) { openInsp(); $('#secMarkers').scrollIntoView({ block: 'center' }); } }
    else if (r === 'more') { const rc = b.getBoundingClientRect(); contextMenu(mm.primary, rc.right + 6, rc.top); }
  };
  document.addEventListener('keydown', e => {
    if (S.view !== 'editor') return;
    if (PR.on) {
      if (e.key === 'Escape') { endPresent(); e.preventDefault(); } else if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { stepPresent(1); e.preventDefault(); } else if (['ArrowLeft', 'PageUp'].includes(e.key)) { stepPresent(-1); e.preventDefault(); }
      return;
    }
    if (document.querySelector('.modal-bg')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); } else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); }
  });
}
function setInsp(open) {   // show/hide the right-hand format panel and remember the choice
  $('#insp').hidden = !open; $('#inspOpen').hidden = open; $('#btnInsp').classList.toggle('on', open); lsSet('mm-insp', open ? '1' : '0');
}
function updateHistBtns() { $('#btnUndo').disabled = !S.mm.canUndo(); $('#btnRedo').disabled = !S.mm.canRedo(); }
function setSave(text, cls, fn) { const el = $('#save'); el.textContent = text; el.className = 'save ' + (cls || ''); el.onclick = fn || null; el.style.cursor = fn ? 'pointer' : ''; }
function applyZoomPref() { if (P.zoom !== 'fit' && S.mm) S.mm.resetView(+P.zoom / 100); }
/* A file ("book") holds several sheets; the engine always edits the active one. Old single-map files are wrapped on load. */
function toBook(d) {
  if (d && Array.isArray(d.sheets) && d.sheets.length) return { id: d.id || MindMap.uid(), title: d.title || 'New map', active: Math.min(Math.max(+d.active || 0, 0), d.sheets.length - 1), sheets: d.sheets };
  return { id: d.id || MindMap.uid(), title: d.title || 'New map', active: 0, sheets: [Object.assign({}, d, { title: 'Map 1' })] };
}
function commitSheet() { if (S.book && S.mm) S.book.sheets[S.book.active] = S.mm.serialize(); }
function bookData() { commitSheet(); return { v: 2, id: S.book.id, title: S.book.title, active: S.book.active, sheets: S.book.sheets }; }
function showDoc(d, fileId, modified) {
  S.book = toBook(d); go('editor'); S.mm.load(S.book.sheets[S.book.active]); S.fileId = fileId || null; S.modified = modified || null;
  $('#title').value = S.lastTitle = S.book.title; syncInspectorDoc(); updateHistBtns(); renderSheets(); renderOutliner(); requestAnimationFrame(applyZoomPref);
}
function renderSheets() {
  const bar = $('#sheets'); if (!bar || !S.book) return; bar.innerHTML = '';
  S.book.sheets.forEach((sh, i) => {
    const b = document.createElement('button'); b.className = 'sheet' + (i === S.book.active ? ' on' : ''); b.textContent = i === S.book.active ? S.mm.doc.title : sh.title;
    b.title = 'Click to open · double-click to rename · right-click for more';
    b.onclick = () => switchSheet(i); b.ondblclick = () => renameSheet(i); b.oncontextmenu = e => { e.preventDefault(); sheetMenu(i, e.clientX, e.clientY); };
    bar.append(b);
  });
  const on = bar.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function afterSheetLoad() { syncInspectorDoc(); updateHistBtns(); renderSheets(); renderOutliner(); requestAnimationFrame(applyZoomPref); }
function switchSheet(i) {
  if (i === S.book.active || !S.book.sheets[i]) return; if (S.mm.editing) S.mm.endEdit(true);
  commitSheet(); S.book.active = i; S.mm.clearFind(); S.mm.load(S.book.sheets[i]); afterSheetLoad();
}
function addSheet() {
  commitSheet(); const d = MMTemplates.make('blank'); d.title = 'Map ' + (S.book.sheets.length + 1); d.theme = P.mapTheme; d.layout = P.layout;
  S.book.sheets.push(d); S.book.active = S.book.sheets.length - 1; S.mm.load(d); afterSheetLoad(); S.mm.changed();
  requestAnimationFrame(() => { S.mm.select(S.mm.doc.root.id); S.mm.startEdit(S.mm.doc.root.id, true); });
}
function renameSheet(i) {
  const cur = i === S.book.active ? S.mm.doc.title : S.book.sheets[i].title, n = (prompt('Sheet name', cur) || '').trim(); if (!n) return;
  if (i === S.book.active) S.mm.doc.title = n; else S.book.sheets[i].title = n; renderSheets(); S.mm.changed();
}
function duplicateSheet(i) {
  commitSheet(); const c = JSON.parse(JSON.stringify(S.book.sheets[i])); c.id = MindMap.uid(); c.title += ' copy';
  (function w(n) { n.id = MindMap.uid(); n.children.forEach(w); })(c.root);
  S.book.sheets.splice(i + 1, 0, c); S.book.active = i + 1; S.mm.load(c); afterSheetLoad(); S.mm.changed();
}
function deleteSheet(i) {
  if (S.book.sheets.length < 2) return toast('A map needs at least one sheet.', true);
  if (!confirm('Delete sheet “' + (i === S.book.active ? S.mm.doc.title : S.book.sheets[i].title) + '”?')) return;
  commitSheet(); S.book.sheets.splice(i, 1); S.book.active = Math.min(i === S.book.active ? i : (i < S.book.active ? S.book.active - 1 : S.book.active), S.book.sheets.length - 1);
  S.mm.load(S.book.sheets[S.book.active]); afterSheetLoad(); S.mm.changed();
}
function sheetMenu(i, x, y) {
  menu([{ label: 'Rename', fn: () => renameSheet(i) }, { label: 'Duplicate', fn: () => duplicateSheet(i) }, { sep: 1 }, { label: 'Delete', fn: () => deleteSheet(i), disabled: S.book.sheets.length < 2 }], x, y);
}

/* ---------- outliner: the map as an editable, indented list ---------- */
let olBusy = false;   // true while the outliner itself is committing a text edit (so it is not rebuilt under the user's cursor)
function toggleOutliner(open) {
  $('#outl').hidden = !open; $('#btnOutl').classList.toggle('on', open); lsSet('mm-outl', open ? '1' : '0');
  if (open) { if (!$('#aip').hidden) toggleAI(false); renderOutliner(); }
}
function updateOutlinerSel() {
  if ($('#outl').hidden) return; const mm = S.mm;
  $$('#olBody .ol-row').forEach(r => r.classList.toggle('sel', mm.sel.has(r.dataset.id)));
}
function renderOutliner(focusId, selectAll) {
  const el = $('#olBody'); if (!el || $('#outl').hidden || !S.mm) return; const mm = S.mm, top = el.scrollTop; el.innerHTML = '';
  const rows = [];
  (function w(n, d) {
    const row = document.createElement('div'); row.className = 'ol-row' + (d === 0 ? ' root' : '') + (mm.sel.has(n.id) ? ' sel' : ''); row.dataset.id = n.id; row.style.paddingLeft = (4 + d * 20) + 'px';
    const caret = document.createElement('button'); caret.className = 'ol-caret' + (n.children.length ? '' : ' none'); caret.tabIndex = -1; caret.textContent = n.children.length ? (n.collapsed ? '▸' : '▾') : '•';
    caret.onclick = () => { if (n.children.length) mm.toggleCollapse([n.id]); };
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'ol-text'; inp.spellcheck = false; inp.value = inp.dataset.orig = n.text.replace(/\s*\n\s*/g, ' ');
    const commit = () => { if (inp.value === inp.dataset.orig) return; const v = inp.value.trim(); inp.dataset.orig = inp.value; if (v) { olBusy = true; try { mm.setText(n.id, v); } finally { olBusy = false; } } else inp.value = inp.dataset.orig = n.text; };
    const go = k => { const ip = rows[rows.findIndex(r => r.id === n.id) + k]; if (ip) ip.inp.focus(); };
    inp.onfocus = () => { if (!mm.sel.has(n.id) || mm.primary !== n.id) { mm.select(n.id); mm.reveal(n.id); } };
    inp.onblur = commit;
    inp.onkeydown = e => {
      if (e.isComposing || e.keyCode === 229) return; e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); const nn = d === 0 ? mm.addChild(n.id, true) : mm.addSibling(n.id, false, true); renderOutliner(nn.id, true); }
      else if (e.key === 'Tab') { e.preventDefault(); commit(); if (d > 0) { (e.shiftKey ? mm.outdent(n.id) : mm.indent(n.id)); } renderOutliner(n.id); }
      else if (e.key === 'Backspace' && inp.value === '' && d > 0) { e.preventDefault(); const prev = rows[rows.findIndex(r => r.id === n.id) - 1]; mm.select(n.id); mm.remove(); renderOutliner(prev && prev.id); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); commit(); go(-1); } else if (e.key === 'ArrowDown') { e.preventDefault(); commit(); go(1); }
      else if (e.key === 'Escape') { inp.value = inp.dataset.orig; inp.blur(); }
    };
    row.append(caret, inp); el.append(row); rows.push({ id: n.id, inp });
    if (!n.collapsed) n.children.forEach(c => w(c, d + 1));
  })(mm.doc.root, 0);
  el.scrollTop = top;
  if (focusId) { const r = rows.find(x => x.id === focusId); if (r) { r.inp.focus(); const L = r.inp.value.length; r.inp.setSelectionRange(selectAll ? 0 : L, L); r.inp.scrollIntoView({ block: 'nearest' }); } }
}


/* ---------- saving ---------- */
function onChange() {
  if (!$('#outl').hidden && !olBusy) renderOutliner();
  S.rev++; S.dirty = true; updateHistBtns();
  clearTimeout(S.draftT); S.draftT = setTimeout(() => lsSet('mm-draft', JSON.stringify({ t: Date.now(), fileId: S.fileId, modified: S.modified, doc: bookData() })), 600);
  if (!S.folder.id) setSave('Drive not linked: saving a local draft only', 'err');
  else if (!P.autosave) setSave('Unsaved (Ctrl+S to save)');
  else { setSave('Unsaved…'); schedule(); }
}
function schedule(ms) { if (!P.autosave && !ms) return; clearTimeout(S.timer); S.timer = setTimeout(() => save(false), ms || 2200); }
async function flush() { if (S.dirty && S.folder.id && S.mm) { clearTimeout(S.timer); await save(false); } }
async function save(force) {
  if (!S.me || !S.mm) return;
  if (!S.folder.id) { toast('No Drive folder is linked. Open Google Drive in the sidebar to link one.', true); return; }
  if (S.saving) { S.again = true; return; }
  clearTimeout(S.timer); S.saving = true; const rev = S.rev; setSave('Saving…');
  try {
    const doc = bookData(), name = MMIO.safeName(doc.title) + '.mindmap.json', D = Cloud.drive;
    if (!S.fileId) {
      if (!isAdmin() && S.maps.length >= S.me.perms.maxMaps) throw Object.assign(new Error('You have reached the limit of ' + S.me.perms.maxMaps + ' maps set by the administrator.'), { code: 'quota' });
      const f = await D.create(S.folder.id, name, doc); S.fileId = f.id; S.modified = f.modifiedTime; thAfterSave(f.id, f.modifiedTime); S.maps.unshift({ id: f.id, name: f.name, modifiedTime: f.modifiedTime });
    } else {
      if (!force && S.modified) {
        let m = null; try { m = await D.meta(S.fileId); } catch (e) { if (e.code === 404) { S.fileId = null; S.saving = false; return save(true); } throw e; }
        if (m.trashed) { S.fileId = null; S.saving = false; return save(true); }
        if (m.modifiedTime !== S.modified && !confirm('The version on Drive is newer than the one you have open (you may have edited on another device).\n\nOK = overwrite it with the open version\nCancel = keep the Drive version (your open version stays in the local draft)')) { setSave('Not saved: version conflict', 'err'); S.saving = false; return; }
      }
      const f = await D.update(S.fileId, name, doc); S.modified = f.modifiedTime; thAfterSave(S.fileId, f.modifiedTime);
      const it = S.maps.find(x => x.id === S.fileId); if (it) { it.name = f.name; it.modifiedTime = f.modifiedTime; }
    }
    if (S.rev === rev) { S.dirty = false; lsDel('mm-draft'); setSave('Saved to Drive ✓'); } else S.again = true;
    lsSet('mm-last', S.fileId);
  } catch (e) {
    if (e.code === 'quota') setSave('Not saved: ' + e.message, 'err');
    else if (e.code === 'relink' || e.code === 'blocked') setSave(e.code === 'blocked' ? 'Account blocked' : 'Google connection expired, click here to sign in again', 'err', async () => { S.me = null; gateLogin('', true); })
    else if (e.code === 404 && S.fileId) { S.fileId = null; setSave('The file is gone from Drive, it will be recreated', 'err'); S.again = true; }
    else if (e.code === 403 || e.code === 404) setSave('Not saved: no permission to write to this Drive folder. Choose the folder again.', 'err');
    else setSave('Not saved: ' + errMsg(e) + ' (local draft kept)', 'err');
  } finally { S.saving = false; if (S.again) { S.again = false; if (S.dirty) schedule(1500); } }
}

/* ---------- library: home / my maps / templates ---------- */
const GRADS = ['#dbeafe,#e0e7ff', '#fce7f3,#ede9fe', '#dcfce7,#d1fae5', '#fef3c7,#ffedd5', '#e0f2fe,#ccfbf1', '#f3e8ff,#fae8ff'];
const gradOf = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADS[h % GRADS.length]; };
async function loadLibrary() {
  if (!S.folder.id) { S.maps = []; S.mapsLoading = false; refreshLists(); return; }
  S.mapsLoading = true; refreshLists();
  try { S.maps = await Cloud.drive.list(S.folder.id); } catch (e) { toast('Could not load the map list: ' + errMsg(e), true); }
  S.mapsLoading = false; refreshLists();
}
function refreshLists() { if (S.view === 'home') renderHome(); else if (S.view === 'maps') renderMaps(); }
/* ---------- map thumbnails: drawn from the map itself, cached on this device ---------- */
const COVER = '<svg viewBox="0 0 200 110" aria-hidden="true"><g fill="none" stroke-width="3.2" stroke-linecap="round"><path d="M100 55C84 45 72 32 54 29" stroke="#8b5cf6"/><path d="M100 55C118 44 132 30 150 30" stroke="#f59e0b"/><path d="M100 55C84 67 72 80 54 82" stroke="#0ea5e9"/><path d="M100 55C118 68 132 80 150 80" stroke="#ec4899"/></g><rect x="30" y="20" width="36" height="16" rx="8" fill="#c4b5fd"/><rect x="134" y="22" width="38" height="16" rx="8" fill="#fde68a"/><rect x="30" y="74" width="36" height="16" rx="8" fill="#7dd3fc"/><rect x="134" y="72" width="38" height="16" rx="8" fill="#f9a8d4"/><rect x="76" y="42" width="48" height="26" rx="13" fill="#7c5cf5"/><rect x="86" y="52" width="28" height="5" rx="2.5" fill="#fff" opacity=".85"/></svg>';
const TH = { cache: null, q: [], busy: false, eng: null, fail: new Set(), last: {}, t: 0, W: 420, H: 240, KEY: 'mm-thumbs2' };
try { localStorage.removeItem('mm-thumbs'); } catch (e) {}   // older thumbnails showed the whole map; they are rebuilt zoomed on the centre
function thCache() { if (!TH.cache) { try { TH.cache = JSON.parse(lsGet(TH.KEY) || '{}'); } catch (e) { TH.cache = {}; } } return TH.cache; }
function thSave(id, mod, url, empty) {
  const c = thCache(); c[id] = { m: mod, u: url || '', e: empty ? 1 : 0, t: Date.now() };
  const keys = Object.keys(c); if (keys.length > 60) keys.sort((x, y) => c[x].t - c[y].t).slice(0, keys.length - 60).forEach(k => delete c[k]);
  lsSet(TH.KEY, JSON.stringify(c));
}
const bookEmpty = b => b.sheets.every(s => !s.root.children || !s.root.children.length);   // nothing but a central topic
async function thDraw(mm) {
  // Picture of the central part of the sheet: the main topic and its first-level branches, at a readable size.
  const b = mm.bounds(), pad = 40, ex = pad + 20, ey = pad, w = Math.ceil(b.w + pad * 2 + 40);
  const blob = await mm.exportPNG(2), bmp = await createImageBitmap(blob), s = bmp.width / w;       // px per world unit in the PNG
  const R = mm.doc.root, set = [R].concat(R.collapsed ? [] : R.children);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; set.forEach(n => { x0 = Math.min(x0, n._x); y0 = Math.min(y0, n._y); x1 = Math.max(x1, n._x + n._w); y1 = Math.max(y1, n._y + n._h); });
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = Math.max(0.55, Math.min(1.2, (TH.W - 28) / (x1 - x0), (TH.H - 28) / (y1 - y0)));
  const c = document.createElement('canvas'); c.width = TH.W; c.height = TH.H; const x = c.getContext('2d');
  x.fillStyle = mm.bgColor(); x.fillRect(0, 0, TH.W, TH.H);
  x.drawImage(bmp, (b.x - ex - cx) * k + TH.W / 2, (b.y - ey - cy) * k + TH.H / 2, bmp.width * k / s, bmp.height * k / s);
  return c.toDataURL('image/jpeg', 0.84);
}
function thEngine() {
  if (!TH.eng) { const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:-20000px;top:0;width:1100px;height:700px;visibility:hidden;pointer-events:none'; document.body.append(el); TH.eng = new MindMap(el, { static: true }); TH.eng.readOnly = true; }
  return TH.eng;
}
async function thGenerate(m) {
  const book = toBook(await Cloud.drive.read(m.id)); if (bookEmpty(book)) return { e: 1, u: '' };
  const eng = thEngine(); eng.load(book.sheets[book.active]); await new Promise(r => requestAnimationFrame(r));
  return { e: 0, u: await thDraw(eng) };
}
function thShow(el, hit) {
  el.classList.toggle('empty', !!hit.e); el.querySelectorAll('.tbadge').forEach(x => x.remove());
  if (hit.e) { const b = document.createElement('span'); b.className = 'tbadge'; b.textContent = 'Empty'; el.append(b); el.style.backgroundImage = el.dataset.grad || ''; el.classList.remove('img'); }
  else { el.style.backgroundImage = 'url(' + hit.u + ')'; el.classList.add('img'); }
}
function thApply(id, hit) { document.querySelectorAll('.card[data-id="' + id + '"] .thumb').forEach(t => thShow(t, hit)); }
async function thPump() {
  if (TH.busy) return; const m = TH.q.shift(); if (!m) return; TH.busy = true;
  try { const r = await thGenerate(m); thSave(m.id, m.modifiedTime, r.u, r.e); thApply(m.id, r); } catch (e) { TH.fail.add(m.id + '|' + m.modifiedTime); }
  TH.busy = false; setTimeout(thPump, 80);
}
function thWant(m, thumbEl) {
  const hit = thCache()[m.id];
  if (hit && hit.m === m.modifiedTime) { thShow(thumbEl, hit); return; }
  const key = m.id + '|' + m.modifiedTime; if (TH.fail.has(key) || TH.q.some(q => q.id === m.id && q.modifiedTime === m.modifiedTime)) return;
  TH.q.push(m); thPump();
}
function thAfterSave(id, mod) {   // refresh the thumbnail of the map being edited (at most every 20 s)
  clearTimeout(TH.t); TH.t = setTimeout(async () => {
    if (S.view !== 'editor' || !S.mm || S.mm.editing || S.fileId !== id || Date.now() - (TH.last[id] || 0) < 20000) return;
    TH.last[id] = Date.now();
    try { if (bookEmpty(bookData())) thSave(id, mod, '', true); else thSave(id, mod, await thDraw(S.mm), false); } catch (e) {}
  }, 1500);
}
function thClear() { TH.cache = null; TH.q = []; TH.fail.clear(); try { localStorage.removeItem(TH.KEY); } catch (e) {} }
function mapCard(m) {
  const c = document.createElement('div'); c.className = 'card' + (m.id === S.fileId ? ' cur' : ''); c.tabIndex = 0;
  c.dataset.id = m.id;
  c.innerHTML = `<div class="thumb" data-grad="linear-gradient(135deg,${gradOf(m.id)})" style="background-image:linear-gradient(135deg,${gradOf(m.id)})">${COVER}</div><div class="meta"><div class="nm">${esc(m.name.replace(/\.mindmap\.json$/, ''))}</div><small>${esc(fdate(m.modifiedTime))}</small></div><button class="x" title="Delete (moves to Drive trash)">🗑</button>`;
  thWant(m, c.querySelector('.thumb'));
  c.onclick = e => { if (e.target.closest('.x')) return; openMap(m.id); };
  c.onkeydown = e => { if (e.key === 'Enter') openMap(m.id); };
  c.querySelector('.x').onclick = async () => {
    if (!confirm('Move "' + m.name.replace(/\.mindmap\.json$/, '') + '" to the Google Drive trash?')) return;
    try { await Cloud.drive.trash(m.id); S.maps = S.maps.filter(x => x.id !== m.id); if (m.id === S.fileId) { S.fileId = null; S.dirty = false; lsDel('mm-draft'); } refreshLists(); toast('Deleted'); } catch (e) { toast(errMsg(e), true); }
  };
  return c;
}
function fillGrid(el, list, emptyHtml) {
  el.innerHTML = ''; if (S.mapsLoading && !list.length) { el.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>'; return; }
  if (!list.length) { el.innerHTML = `<div class="empty">${emptyHtml}</div>`; return; } list.forEach(m => el.append(mapCard(m)));
}
function renderHome() {
  fillGrid($('#hRecent'), S.maps.slice(0, 6), S.folder.id ? 'No maps yet. Click “Create new map” or pick a template.' : 'Google Drive is not linked. <button class="link" data-go="cloud">Link now →</button>');
}
function renderMaps() {
  const q = $('#mQ').value.trim().toLowerCase();
  fillGrid($('#mGrid'), S.maps.filter(m => !q || m.name.toLowerCase().includes(q)), S.maps.length ? 'No results.' : (S.folder.id ? 'There are no maps in this folder yet.<br>Click “＋ New map” or import from .xmind / PDF.' : 'Google Drive is not linked. <button class="link" data-go="cloud">Link now →</button>'));
}
let tplCat = 'all';
function renderTemplates() {
  const T = MMTemplates, tabs = $('#tTabs'); tabs.innerHTML = '';
  T.cats.forEach(([k, n]) => { const b = document.createElement('button'); b.textContent = n; b.className = k === tplCat ? 'on' : ''; b.onclick = () => { tplCat = k; renderTemplates(); }; tabs.append(b); });
  const q = $('#tQ').value.trim().toLowerCase(), grid = $('#tGrid'); grid.innerHTML = '';
  const list = T.list.filter(t => (tplCat === 'all' || t.cat === tplCat || t.key === 'blank' && tplCat === 'all') && (!q || t.name.toLowerCase().includes(q)));
  list.forEach(t => { const c = document.createElement('button'); c.className = 'card'; c.innerHTML = `<div class="ico">${t.icon}</div><div class="nm">${esc(t.name)}</div>`; c.onclick = () => newMap(t.key); grid.append(c); });
  if (!list.length) grid.innerHTML = '<div class="empty">No matching templates.</div>';
}
async function openMap(id) {
  await flush(); const t = toast('Opening map…', false, 30000);
  try {
    const [doc, meta] = await Promise.all([Cloud.drive.read(id), Cloud.drive.meta(id)]);
    t.remove(); showDoc(doc, id, meta.modifiedTime); S.dirty = false; lsDel('mm-draft'); lsSet('mm-last', id); setSave('Opened');
  } catch (e) { t.remove(); toast('Could not open the map: ' + errMsg(e), true); }
}
async function newMap(tplKey) {
  await flush();
  if (!isAdmin() && S.folder.id && S.maps.length >= S.me.perms.maxMaps) return toast('You have reached the limit of ' + S.me.perms.maxMaps + ' maps set by the administrator.', true);
  const doc = MMTemplates.make(tplKey || 'blank'); doc.theme = P.mapTheme; if (!tplKey || tplKey === 'blank') doc.layout = P.layout;
  showDoc(doc, null, null); S.rev++; S.dirty = true;
  if (S.folder.id) { setSave('New map'); schedule(800); } else setSave('New map (Drive not linked)', 'err');
  requestAnimationFrame(() => { S.mm.select(S.mm.doc.root.id); if (!tplKey || tplKey === 'blank') S.mm.startEdit(S.mm.doc.root.id, true); });
}
function restoreDraft() {
  const raw = lsGet('mm-draft'); let d = null; try { d = raw && JSON.parse(raw); } catch (e) {} if (!d || !d.doc) return;
  if (confirm('There is an unsaved draft from your last session (' + fdate(d.t) + ').\nRestore it?')) { showDoc(d.doc, d.fileId, d.modified); S.rev++; S.dirty = true; if (S.folder.id) schedule(800); } else lsDel('mm-draft');
}

/* ---------- import / export ---------- */
function fileMenu() {
  const ex = fn => () => { if (!can('export')) return toast('The administrator has not allowed file export for this account.', true); fn(); };
  return [
    { label: 'New map', fn: () => newMap() }, { label: 'Save now', hint: 'Ctrl+S', fn: () => save(true) },
    { label: 'Present', fn: present }, { label: isDark() ? 'Switch to light mode' : 'Switch to dark mode', fn: () => document.querySelector('[data-theme-toggle]').click() },
    { sep: 1 }, { hd: 'Import from' }, { label: 'XMind file (.xmind)', fn: () => pickFile('.xmind') }, { label: 'PDF file (.pdf)', fn: () => pickFile('.pdf') }, { label: 'Markdown / text', fn: () => pickFile('.md,.markdown,.txt,.json') },
    { sep: 1 }, { label: 'Share / Export…', fn: openShare }
  ];
}
function pickFile(accept) { const i = $('#fileIn'); i.accept = accept; i.click(); }
async function doImport(file) {
  const kind = MMIO.kindOf(file.name);
  if (kind === 'pdf' && !can('pdf')) return toast('The administrator has not allowed PDF import for this account.', true);
  if (kind === 'xmind' && !can('xmind')) return toast('The administrator has not allowed XMind import for this account.', true);
  const t = toast('Reading ' + file.name + '…', false, 90000);
  try {
    const docs = await MMIO.importFile(file, (p, n) => { t.textContent = 'Analysing PDF: page ' + p + '/' + n + '…'; });
    t.remove(); await flush(); docs.forEach(d => { if (!d.theme || d.theme === 'classic') d.theme = P.mapTheme; });
    if (!isAdmin() && S.folder.id && S.maps.length >= S.me.perms.maxMaps) return toast('You have reached the limit of ' + S.me.perms.maxMaps + ' maps set by the administrator; nothing more can be imported.', true);
    const base = file.name.replace(/\.[^.]+$/, ''), d0 = docs.length > 1 ? { id: MindMap.uid(), title: base, active: 0, sheets: docs } : docs[0];
    showDoc(d0, null, null); S.rev++; S.dirty = true; if (S.folder.id) schedule(300);
    toast('Imported "' + (d0.title) + '"' + (docs.length > 1 ? ' with ' + docs.length + ' sheets' : '') + (docs[0].importNote ? '. ' + docs[0].importNote : ''), false, 5600);
  } catch (e) { t.remove(); toast(errMsg(e), true); }
}
async function exportAs(kind) {
  if (!can('export')) return toast('The administrator has not allowed file export for this account.', true);
  const mm = S.mm, nm = MMIO.safeName(S.book.title);
  try {
    if (kind === 'png') MMIO.download(await mm.exportPNG(2), nm + '.png');
    else if (kind === 'svg') { await MindMap.loadFontCss(); MMIO.download(new Blob([mm.exportSVG().svg], { type: 'image/svg+xml' }), nm + '.svg'); }
    else if (kind === 'xmind') MMIO.download(await MMIO.exportXMind(bookData()), nm + '.xmind');
    else if (kind === 'md') MMIO.download(new Blob([MMIO.toMarkdown(bookData())], { type: 'text/markdown' }), nm + '.md');
    else if (kind === 'json') MMIO.download(new Blob([JSON.stringify(bookData(), null, 1)], { type: 'application/json' }), nm + '.mindmap.json');
    else if (kind === 'pdf') await exportPDF();
  } catch (e) { toast('Export failed: ' + errMsg(e), true); }
}
async function exportPDF() {
  const mm = S.mm; await MindMap.loadFontCss(); const { w, h } = mm.exportSVG(), url = URL.createObjectURL(await mm.exportPNG(2));
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.append(f);
  const d = f.contentDocument; d.open(); d.write(`<!doctype html><title>${esc(S.book.title)}</title><style>@page{size:${w >= h ? 'landscape' : 'portrait'};margin:8mm}html,body{margin:0}img{width:100%;height:auto;display:block}</style><img src="${url}">`); d.close();
  const img = d.querySelector('img'); const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000); };
  if (img.complete) go(); else img.onload = go;
  toast('Choose “Save as PDF” in the print dialog', false, 4500);
}
async function openShare() {
  const mm = S.mm, link = S.fileId ? 'https://drive.google.com/file/d/' + S.fileId + '/view' : '';
  const m = modal('Share / Export map', `<div class="share"><div>
      <h5 style="margin-top:4px">Share</h5>
      <div class="help" style="margin:0 0 10px">Your map lives in your Drive and only you can see it. To let others view it, share the file in Drive or send an export from below.</div>
      <div class="copyrow"><input type="text" id="shLink" readonly value="${esc(link || 'The map has not been saved to Drive yet')}"><button class="btn primary" id="shCopy" ${link ? '' : 'disabled'}>Copy</button></div>
      <div class="apps" style="margin-top:14px">
        <button id="shMail"><i>✉️</i>Email</button><button id="shDrive" ${link ? '' : 'disabled'}><i>📁</i>Open in Drive</button><button id="shMd"><i>📋</i>Copy outline</button>
      </div>
      <h5>Export as</h5>
      <div class="chips">${[['png', 'PNG'], ['pdf', 'PDF'], ['svg', 'SVG'], ['md', 'Markdown'], ['xmind', 'XMind'], ['json', 'JSON']].map(([k, n]) => `<button data-x="${k}">${n}</button>`).join('')}</div>
    </div><div class="prev" id="shPrev"><span class="spin"></span></div></div>`, { wide: true });
  m.el.querySelector('#shCopy').onclick = () => { navigator.clipboard.writeText(link).then(() => toast('Drive link copied'), () => toast('Could not copy', true)); };
  m.el.querySelector('#shDrive').onclick = () => window.open(link, '_blank', 'noopener');
  const outline = () => MMIO.toMarkdown(bookData());
  m.el.querySelector('#shMd').onclick = () => navigator.clipboard.writeText(outline()).then(() => toast('Outline copied (Markdown)'), () => toast('Could not copy', true));
  m.el.querySelector('#shMail').onclick = () => { location.href = 'mailto:?subject=' + encodeURIComponent(S.book.title) + '&body=' + encodeURIComponent(outline().slice(0, 1800)); };
  m.el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => exportAs(b.dataset.x));
  try { const blob = await mm.exportPNG(1); const u = URL.createObjectURL(blob); const pv = m.el.querySelector('#shPrev'); if (pv) pv.innerHTML = `<img alt="Preview" src="${u}">`; } catch (e) { const pv = m.el.querySelector('#shPrev'); if (pv) pv.textContent = 'Could not create a preview'; }
}
function contextMenu(id, x, y) {
  const mm = S.mm;
  if (!id) return menu([{ label: 'Fit to screen', hint: 'Ctrl+0', fn: () => mm.fit() }, { label: 'Expand all topics', fn: () => mm.expandAll(true) }, { label: 'Collapse all', fn: () => mm.expandAll(false) }], x, y);
  const isRoot = id === mm.doc.root.id;
  menu([
    { label: 'Add subtopic', hint: 'Tab', fn: () => mm.addChild(id) }, { label: 'Add sibling topic', hint: 'Enter', fn: () => mm.addSibling(id), disabled: isRoot },
    { label: 'Insert parent topic', hint: 'Ctrl+Enter', fn: () => mm.addParent(id), disabled: isRoot }, { label: 'Edit text', hint: 'F2', fn: () => mm.startEdit(id, true) }, { label: 'Expand with AI', fn: () => expandWithAI(id) },
    { label: 'Collapse / expand', hint: 'Ctrl+/', fn: () => mm.toggleCollapse() }, { sep: 1 },
    { label: 'Clear topic style', fn: () => mm.clearStyle() }, { label: 'Delete topic', hint: 'Del', fn: () => mm.remove(), disabled: isRoot }
  ], x, y);
}
function showShortcuts() {
  modal('Shortcuts', `<div class="kbd">${[['Subtopic', 'Tab'], ['Sibling', 'Enter'], ['Sibling (above)', 'Shift+Enter'], ['Insert parent topic', 'Ctrl+Enter'], ['Edit text', 'F2 / Space / double-click'], ['Delete topic', 'Delete'], ['Fold / unfold topic', 'Ctrl+/'], ['Move selection', 'Arrow keys'], ['Select all', 'Ctrl+A'], ['Bold / italic / underline', 'Ctrl+B / I / U'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Copy / paste topics', 'Ctrl+C / Ctrl+V'], ['Search', 'Ctrl+F'], ['Save now', 'Ctrl+S'], ['Zoom', 'Ctrl + scroll / + / −'], ['Fit to screen', 'Ctrl+0']].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>
    <div class="help" style="margin-top:14px">Drag a topic onto another topic to move it there (drop on the top/bottom edge to make it a sibling). Hold Shift or Ctrl while clicking to select several topics and drag them together.</div>`);
}

/* ---------- search ---------- */
const SR = { res: [], i: 0 };
function initSearch() {
  const q = $('#searchQ'), go2 = d => { if (!SR.res.length) return; SR.i = (SR.i + d + SR.res.length) % SR.res.length; S.mm.focusNode(SR.res[SR.i]); $('#searchN').textContent = (SR.i + 1) + '/' + SR.res.length; };
  q.oninput = () => { SR.res = S.mm.find(q.value); SR.i = -1; $('#searchN').textContent = q.value ? SR.res.length + ' results' : ''; if (SR.res.length) go2(1); };
  q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go2(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') closeSearch(); e.stopPropagation(); };
  $('#searchNext').onclick = () => go2(1); $('#searchPrev').onclick = () => go2(-1); $('#searchX').onclick = closeSearch; $('#btnSearch').onclick = openSearch;
}
function openSearch() { $('#searchbar').hidden = false; $('#searchQ').focus(); $('#searchQ').select(); }
function closeSearch() { $('#searchbar').hidden = true; S.mm.clearFind(); $('#searchQ').value = ''; $('#searchN').textContent = ''; S.mm.vp.focus(); }

/* ---------- minimap ---------- */
const MINI = { tf: null, raf: 0, down: false };
function drawMini() {
  if (MINI.raf || !S.mm || S.view !== 'editor' || PR.on) return;
  MINI.raf = requestAnimationFrame(() => {
    MINI.raf = 0; const mm = S.mm, c = $('#mini'); if (!c || !c.offsetParent) return;
    const W = 200, H = 130, ctx = c.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, W, H);
    const b = mm.bounds(), v = mm.view, vw = mm.vp.clientWidth / v.k, vh = mm.vp.clientHeight / v.k, vx = -v.x / v.k, vy = -v.y / v.k;
    if (!(b.w > 0)) return;
    const ux = Math.min(b.x, vx), uy = Math.min(b.y, vy), uw = Math.max(b.x + b.w, vx + vw) - ux, uh = Math.max(b.y + b.h, vy + vh) - uy;
    const s = Math.min((W - 16) / uw, (H - 16) / uh), ox = (W - uw * s) / 2, oy = (H - uh * s) / 2; MINI.tf = { s, ox, oy, ux, uy, W, H };
    const X = x => (x - ux) * s + ox, Y = y => (y - uy) * s + oy;
    mm.vis.forEach(n => { const col = mm.bc.get(n.id) || '#888', root = n.id === mm.doc.root.id; ctx.fillStyle = root ? '#5b47e0' : col; ctx.globalAlpha = root ? 1 : 0.75; const w = Math.max(3, n._w * s), h = Math.max(2, n._h * s); ctx.fillRect(X(n._x), Y(n._y), w, h); });
    ctx.globalAlpha = 1; ctx.strokeStyle = '#5b47e0'; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(91,71,224,.12)'; ctx.fillRect(X(vx), Y(vy), vw * s, vh * s); ctx.strokeRect(X(vx), Y(vy), vw * s, vh * s);
  });
}
function initMini() {
  const c = $('#mini'), at = e => {
    const t = MINI.tf; if (!t) return; const r = c.getBoundingClientRect(), cx = (e.clientX - r.left) / r.width * t.W, cy = (e.clientY - r.top) / r.height * t.H;
    const wx = (cx - t.ox) / t.s + t.ux, wy = (cy - t.oy) / t.s + t.uy, mm = S.mm; mm.view.x = mm.vp.clientWidth / 2 - wx * mm.view.k; mm.view.y = mm.vp.clientHeight / 2 - wy * mm.view.k; mm.applyView();
  };
  c.onpointerdown = e => { MINI.down = true; c.setPointerCapture(e.pointerId); at(e); }; c.onpointermove = e => { if (MINI.down) at(e); }; c.onpointerup = () => { MINI.down = false; };
}

/* ---------- presentation ---------- */
const PR = { on: false, i: 0, steps: [], dark: true };
function present() {
  const mm = S.mm; PR.on = true; PR.i = 0; PR.steps = [null].concat(mm.doc.root.children.map(c => c.id));
  $('#v-editor').classList.add('presenting'); $('#pres').hidden = false; closeSearch(); mm.clearSel(); mm.readOnly = true; mm.themeOverride = PR.dark ? 'dark' : null; mm.render();
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  requestAnimationFrame(() => { mm.fit(); stepPresent(0); });
}
function stepPresent(d) {
  PR.i = Math.max(0, Math.min(PR.steps.length - 1, PR.i + d)); S.mm.focusBranch(PR.steps[PR.i]); $('#prN').textContent = (PR.i + 1) + ' / ' + PR.steps.length;
}
function endPresent() {
  if (!PR.on) return; PR.on = false; const mm = S.mm; mm.readOnly = false; mm.themeOverride = null; mm.dim = null;
  $('#v-editor').classList.remove('presenting'); $('#pres').hidden = true; mm.render(); requestAnimationFrame(() => mm.fit());
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (PR.on && !document.fullscreenElement) endPresent(); });
document.addEventListener('DOMContentLoaded', () => {
  $('#prExit').onclick = endPresent; $('#prPrev').onclick = () => stepPresent(-1); $('#prNext').onclick = () => stepPresent(1);
  $('#prFs').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); };
  $('#prTheme').onclick = () => { PR.dark = !PR.dark; S.mm.themeOverride = PR.dark ? 'dark' : null; S.mm.render(); stepPresent(0); };
});

/* ---------- inspector ---------- */
let inspReady = false;
function initInspector() {
  if (inspReady) return; inspReady = true; const mm = () => S.mm;
  $$('.tabs button[data-tab]').forEach(b => b.onclick = () => { $$('.tabs button[data-tab]').forEach(x => x.classList.toggle('on', x === b)); $('#tabNode').hidden = b.dataset.tab !== 'node'; $('#tabDoc').hidden = b.dataset.tab !== 'doc'; });
  const fs = $('#fSize'); fs.innerHTML = '<option value="">Auto</option>' + [10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64].map(n => `<option value="${n}">${n}px</option>`).join('');
  fs.onchange = () => mm().setStyle({ size: fs.value ? +fs.value : null });
  $$('[data-st]').forEach(b => b.onclick = () => mm().toggleStyle(b.dataset.st));
  $('#fColor').onchange = e => mm().setStyle({ color: e.target.value }); $('#fHl').onchange = e => mm().setStyle({ hl: e.target.value });
  $('#fHlX').onclick = () => mm().setStyle({ hl: null }); $('#fFill').onchange = e => mm().setStyle({ fill: e.target.value }); $('#fLine').onchange = e => mm().setStyle({ line: e.target.value });
  $('#fShape').onchange = e => mm().setStyle({ shape: e.target.value === 'auto' ? null : e.target.value });
  $('#fReset').onclick = () => mm().clearStyle(); $('#fClearRich').onclick = () => mm().clearRich();
  ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#111827', '#ffffff'].forEach(c => { const b = document.createElement('button'); b.style.background = c; b.title = c; b.onclick = () => mm().setStyle({ fill: c }); $('#fSwatch').append(b); });
  MindMap.MARKER_GROUPS.forEach(gp => gp.ids.forEach(id => { const b = document.createElement('button'); b.dataset.m = id; b.title = gp.name; b.append(MindMap.markerEl(id)); b.onclick = () => mm().toggleMarker(id); $('#fMarkers').append(b); }));
  $('#fMkClear').onclick = () => mm().clearMarkers();
  $('#fLink').onchange = e => { mm().setField(mm().primary, 'link', e.target.value); updateInspector(); };
  $('#fLabels').onchange = e => mm().setField(mm().primary, 'labels', e.target.value); $('#fNote').onchange = e => mm().setField(mm().primary, 'note', e.target.value);
  $$('#dLayouts button').forEach(b => b.onclick = () => { mm().setLayout(b.dataset.l); syncInspectorDoc(); });
  Object.entries(MindMap.THEMES).forEach(([k, t]) => {
    const b = document.createElement('button'); b.dataset.t = k; b.innerHTML = `<i style="background:${t.bg}">${t.branches.slice(0, 5).map(c => `<b style="background:${c}"></b>`).join('')}</i>${esc(t.name)}`;
    b.onclick = () => { mm().setTheme(k); syncInspectorDoc(); }; $('#dThemes').append(b);
  });
  $('#dBg').onchange = e => mm().setDocOpt('bg', e.target.value); $('#dBgX').onclick = () => mm().setDocOpt('bg', ''); $('#dGrid').onchange = e => mm().setDocOpt('grid', e.target.checked);
  $('#dMono').onchange = e => mm().setDocOpt('mono', !e.target.checked); $('#dNotes').onchange = e => mm().setDocOpt('notes', e.target.checked); $('#dLineW').onchange = e => mm().setDocOpt('lineW', e.target.value);
  $('#dLine').onchange = e => mm().setLineStyle(e.target.value); $('#dExpand').onclick = () => mm().expandAll(true); $('#dCollapse').onclick = () => mm().expandAll(false);
  syncInspectorDoc();
}
function syncInspectorDoc() {
  const d = S.mm.doc; $$('#dLayouts button').forEach(b => b.classList.toggle('on', b.dataset.l === d.layout));
  $$('#dThemes button').forEach(b => b.classList.toggle('on', b.dataset.t === d.theme)); $('#dLine').value = d.lineStyle;
  $('#dBg').value = d.bg || S.mm.bgColor(); $('#dGrid').checked = d.grid !== false; $('#dMono').checked = !d.mono; $('#dNotes').checked = !!d.notes; $('#dLineW').value = d.lineW || 'auto'; updateInspector();
}
function updateInspector() {
  updateAICtx();
  const mm = S.mm; if (!mm || !$('#fSize')) return; const id = mm.primary, n = id && mm.get(id);
  $('#nodeHint').hidden = !!n; $('#nodeForm').hidden = !n; if (!n) return;
  const st = mm.styleInfo(id) || {}, s = n.style || {};
  $('#fSize').value = s.size ? String(s.size) : ''; $('#fShape').value = s.shape || 'auto';
  $('#fColor').value = /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#111827'; $('#fFill').value = st.fillHex || '#2563eb';
  $('#fHl').value = s.hl || '#fef08a'; $('#fLine').value = mm.bc.get(id) || '#2563eb';
  $$('[data-st]').forEach(b => { const k = b.dataset.st; b.classList.toggle('on', k === 'bold' ? st.weight >= 600 : k === 'italic' ? st.italic : k === 'u' ? st.under : st.strike); });
  const mk = n.markers || []; $$('#fMarkers button').forEach(b => b.classList.toggle('on', mk.includes(b.dataset.m)));
  const act = document.activeElement;
  if (act !== $('#fLink')) $('#fLink').value = n.link || ''; if (act !== $('#fLabels')) $('#fLabels').value = (n.labels || []).join(', '); if (act !== $('#fNote')) $('#fNote').value = n.note || '';
}

/* ---------- cloud (Drive folder) page ---------- */
function renderCloud() {
  const hasPicker = !!(MM_CONFIG.API_KEY && MM_CONFIG.APP_ID), el = $('#cloudBody');
  el.innerHTML = `
    <div class="fld"><label class="t">Google account</label><div>${esc(S.user ? S.user.name : '')} <span style="color:var(--muted)">${esc(S.user ? S.user.email : '')}</span> <span class="badge ${isAdmin() ? 'ok' : ''}">${isAdmin() ? 'Administrator' : 'User'}</span></div>
      <div class="help">The Drive connection is kept alive and refreshes itself: you do not need to sign in again every hour. <button class="link" id="clRenew">Check connection</button></div></div>
    <div class="fld"><label class="t">Google Drive folder for your maps</label>
      <div id="clFolder" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${hasPicker ? '<button class="btn primary" id="clPick">Choose a folder from Drive…</button>' : ''}<button class="btn ${hasPicker ? '' : 'primary'}" id="clNew">Create a new folder</button></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><input type="text" id="clLink" placeholder="Or paste a Drive folder link…" style="flex:1;min-width:200px"><button class="btn" id="clGo">Link</button></div>
      <div class="err" id="clErr"></div>
      <div class="help">The app uses the narrow <code>drive.file</code>permission: it only sees files it created itself (or folders you pick on purpose). Pasting a link only works for folders the app already has access to; if it says “no access”, use “Choose a folder from Drive” or “Create a new folder”. This choice is remembered on all your devices.</div></div>
    <div class="fld"><label class="t">Session</label><button class="btn" id="clSw">Switch Google account</button> <button class="btn danger" id="clOut">Sign out</button></div>`;
  const show = () => { $('#clFolder').innerHTML = S.folder.id ? `📁 <b>${esc(S.folder.name || 'Folder')}</b> · <a href="https://drive.google.com/drive/folders/${encodeURIComponent(S.folder.id)}" target="_blank" rel="noopener">open in Drive</a> · ${S.maps.length} maps` : '<span class="badge wait">Not linked</span> Maps are only saved as a local draft on this device.'; };
  show(); const err = t => { $('#clErr').textContent = t || ''; };
  const link = async (id, name) => {
    try { const r = await Cloud.gas('saveSettings', { folderId: id, folderName: name }); S.me = Object.assign(S.me, r.me); S.folder = { id, name }; updateUserCard(); err(''); toast('Linked folder "' + name + '"'); await loadLibrary(); show(); if (S.dirty) schedule(300); }
    catch (e) { err(errMsg(e)); }
  };
  $('#clRenew').onclick = async () => { try { await Cloud.refresh(); toast('Drive connection is working'); } catch (e) { toast('Connection problem: ' + errMsg(e), true); } };
  const pk = $('#clPick'); if (pk) pk.onclick = async () => { err(''); try { const f = await Cloud.drive.pick(); if (f) link(f.id, f.name); } catch (e) { err(errMsg(e)); } };
  $('#clNew').onclick = async () => { const name = prompt('Name of the new folder in your Drive:', 'Mind Map'); if (!name) return; err(''); try { const f = await Cloud.drive.createFolder(name.trim()); link(f.id, f.name); } catch (e) { err(errMsg(e)); } };
  $('#clGo').onclick = async () => {
    err(''); const id = Cloud.drive.folderIdFrom($('#clLink').value); if (!id) return err('That does not look like a Drive folder link.');
    try { const f = await Cloud.drive.folderInfo(id); link(f.id, f.name); } catch (e) { err(e.code === 404 || e.code === 403 ? 'The app has no access to this folder yet. Use “Choose a folder from Drive” (grants access) or “Create a new folder”.' : errMsg(e)); }
  };
  $('#clSw').onclick = switchAccount; $('#clOut').onclick = logout;
}
async function switchAccount() { await flush(); thClear(); await Cloud.signOut(); S.me = null; gateLogin('', true); }
async function logout() { await flush(); thClear(); await Cloud.signOut(); S.me = null; gateLogin(); }

/* ---------- settings page ---------- */
let setTab = 'general';
function renderSettings() {
  const tabs = $('#sTabs'); tabs.innerHTML = '';
  [['general', 'General'], ['appearance', 'Appearance'], ['ai', 'AI (Gemini)'], ['shortcuts', 'Shortcuts'], ['advanced', 'Advanced']].forEach(([k, n]) => { const b = document.createElement('button'); b.textContent = n; b.className = k === setTab ? 'on' : ''; b.onclick = () => { setTab = k; renderSettings(); }; tabs.append(b); });
  const el = $('#sBody');
  if (setTab === 'general') {
    el.innerHTML = `
      <div class="setrow"><div class="lb"><b>Auto-save</b><small>Saves to Google Drive a few seconds after every change.</small></div><label class="switch"><input type="checkbox" id="pAuto" ${P.autosave ? 'checked' : ''}><i></i></label></div>
      <div class="setrow"><div class="lb"><b>Default zoom when opening a map</b><small>“Fit to screen” scales the map so it is fully visible.</small></div>
        <select id="pZoom">${[['fit', 'Fit to screen'], ['75', '75%'], ['100', '100%'], ['125', '125%'], ['150', '150%']].map(([v, n]) => `<option value="${v}" ${String(P.zoom) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="setrow"><div class="lb"><b>Layout of new blank maps</b></div>
        <select id="pLayout">${[['map', 'Both sides (mind map)'], ['right', 'Right (logic)'], ['left', 'Left (logic)'], ['org', 'Org chart']].map(([v, n]) => `<option value="${v}" ${P.layout === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="help">These options are stored separately on each device.</div>`;
    $('#pAuto').onchange = e => { P.autosave = e.target.checked; savePrefs(); if (P.autosave && S.dirty) schedule(); toast(P.autosave ? 'Auto-save turned on' : 'Auto-save turned off, use Ctrl+S to save'); };
    $('#pZoom').onchange = e => { P.zoom = e.target.value; savePrefs(); }; $('#pLayout').onchange = e => { P.layout = e.target.value; savePrefs(); };
  } else if (setTab === 'appearance') {
    el.innerHTML = `<div class="fld"><label class="t">App theme</label><div class="choice" id="pTheme">${[['light', '☀️', 'Light'], ['dark', '🌙', 'Dark'], ['system', '🖥️', 'System']].map(([v, i, n]) => `<button data-v="${v}" class="${P.appTheme === v ? 'on' : ''}"><i>${i}</i>${n}</button>`).join('')}</div></div>
      <div class="fld"><label class="t">Default theme for new maps</label><div class="themes" id="pMapTheme" style="max-width:420px"></div></div>`;
    $$('#pTheme button').forEach(b => b.onclick = () => { P.appTheme = b.dataset.v; savePrefs(); applyAppTheme(); renderSettings(); });
    Object.entries(MindMap.THEMES).forEach(([k, t]) => { const b = document.createElement('button'); b.className = k === P.mapTheme ? 'on' : ''; b.innerHTML = `<i style="background:${t.bg}">${t.branches.slice(0, 5).map(c => `<b style="background:${c}"></b>`).join('')}</i>${esc(t.name)}`; b.onclick = () => { P.mapTheme = k; savePrefs(); renderSettings(); }; $('#pMapTheme').append(b); });
  } else if (setTab === 'ai') {
    const has = MMAI.hasKey(), masked = has ? MMAI.getKey().slice(0, 4) + '…' + MMAI.getKey().slice(-4) : '';
    el.innerHTML = `<div class="setrow" style="display:block"><div class="lb"><b>Gemini API key</b><small>${has ? 'A key is saved in this browser (' + esc(masked) + ').' : 'No key saved. Create your own key in Google AI Studio and paste it here.'}</small></div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><input type="password" id="aiKey2" placeholder="${has ? 'Paste a new key to replace it' : 'AIza…'}" autocomplete="off" spellcheck="false" style="flex:1;min-width:220px"><button class="btn primary" id="aiKey2Save">Save &amp; test</button>${has ? '<button class="btn danger" id="aiKey2Del">Remove key</button>' : ''}</div>
        <div class="err" id="aiKey2Err"></div><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:13px">Get a key in Google AI Studio →</a></div>
      <div class="setrow"><div class="lb"><b>Model</b><small>The list is loaded from Google when you save a key.</small></div><select id="aiModel2"></select></div>
      <div class="help" style="margin-top:12px"><b>Privacy.</b> Your key is stored only in this browser’s localStorage and is sent only to Google’s Gemini API; it is never sent to the administrator or any other server. Anyone who can use this browser profile can read it, so do not save it on shared computers, and use a dedicated key you can revoke in AI Studio. When you use the assistant, the text of your map (topic text and short notes) is sent to Google and processed under the Gemini API terms for your key’s plan. On another device you need to enter a key again.</div>`;
    const sel = $('#aiModel2'), cur = MMAI.getModel(), list = MMAI.models();
    sel.innerHTML = (list.some(m => m[0] === cur) ? list : [[cur, cur]].concat(list)).map(([v, n]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(n)}</option>`).join(''); sel.onchange = () => MMAI.setModel(sel.value);
    $('#aiKey2Save').onclick = e => saveAIKey($('#aiKey2').value, e.target, $('#aiKey2Err'));
    const del = $('#aiKey2Del'); if (del) del.onclick = () => { MMAI.setKey(''); AIS.hist = []; toast('Gemini key removed from this browser'); renderSettings(); renderAI(); };
  } else if (setTab === 'shortcuts') {
    el.innerHTML = `<div class="kbd">${[['Subtopic', 'Tab'], ['Sibling', 'Enter'], ['Sibling (above)', 'Shift+Enter'], ['Insert parent topic', 'Ctrl+Enter'], ['Edit text', 'F2 / Space'], ['Delete topic', 'Delete'], ['Fold / unfold topic', 'Ctrl+/'], ['Move selection', 'Arrows'], ['Select all', 'Ctrl+A'], ['Bold / italic / underline', 'Ctrl+B / I / U'], ['Undo / redo', 'Ctrl+Z / Y'], ['Copy / paste', 'Ctrl+C / V'], ['Search', 'Ctrl+F'], ['Save now', 'Ctrl+S'], ['Zoom', 'Ctrl + scroll'], ['Fit to screen', 'Ctrl+0']].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>`;
  } else {
    el.innerHTML = `
      <div class="setrow"><div class="lb"><b>Draft on this device</b><small>${lsGet('mm-draft') ? 'There is an unsaved draft.' : 'There is no draft.'} The draft is deleted automatically after a successful save to Drive.</small></div><button class="btn small danger" id="aDraft">Delete draft</button></div>
      <div class="setrow"><div class="lb"><b>Where is your data?</b><small>Maps are <code>*.mindmap.json</code> files in the Drive folder you linked. To keep the connection alive (so you do not sign in again every hour) a refresh key is stored on the access server (Apps Script) managed by the administrator. That key only has the <code>drive.file</code>permission: it can reach files created by the app and folders you picked, not your whole Drive. You can revoke it at any time with “Sign out” or at myaccount.google.com/permissions.</small></div></div>
      <div class="setrow"><div class="lb"><b>Sign out of this device</b></div><button class="btn small" id="aOut">Sign out</button></div>`;
    $('#aDraft').onclick = () => { lsDel('mm-draft'); toast('Draft deleted'); renderSettings(); }; $('#aOut').onclick = logout;
  }
}

/* ---------- admin page ---------- */
async function renderAdmin() {
  const el = $('#adminBody'); if (!isAdmin()) return; el.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>';
  let users; try { users = (await Cloud.gas('admin.list')).users; } catch (e) { el.innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; return; }
  const order = { pending: 0, active: 1, blocked: 2 }; users.sort((a, b) => order[a.status] - order[b.status]);
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap"><input type="email" id="adEm" placeholder="Add a user by Google email (approved immediately)" style="flex:1;min-width:220px"><button class="btn primary" id="adAdd">Add</button></div>
    ${users.length ? `<div style="overflow:auto"><table><thead><tr><th>User</th><th>Status</th><th>PDF</th><th>XMind</th><th>Export</th><th>Max maps</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr data-e="${esc(u.email)}"><td><b>${esc(u.name || u.email)}</b><br><span style="color:var(--muted)">${esc(u.email)}</span>${u.note ? `<br><i style="color:var(--muted)">${esc(u.note)}</i>` : ''}<br><small style="color:var(--muted)">${ago(u.seen)}${u.folderName ? ' · 📁 ' + esc(u.folderName) : ''}</small></td>
      <td><span class="badge ${u.status === 'active' ? 'ok' : u.status === 'pending' ? 'wait' : 'bad'}">${{ active: 'Approved', pending: 'Pending', blocked: 'Blocked' }[u.status]}</span></td>
      <td><input type="checkbox" data-p="pdf" ${u.perms.pdf ? 'checked' : ''}></td><td><input type="checkbox" data-p="xmind" ${u.perms.xmind ? 'checked' : ''}></td><td><input type="checkbox" data-p="export" ${u.perms.export ? 'checked' : ''}></td>
      <td><input type="number" min="0" data-p="maxMaps" value="${u.perms.maxMaps}"></td>
      <td style="white-space:nowrap">${u.status !== 'active' ? '<button class="btn small primary" data-a="active">Approve</button> ' : '<button class="btn small" data-a="blocked">Block</button> '}<button class="btn small danger" data-a="remove">Delete</button></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Nobody has registered yet. Users who sign in with Google will see a “Request access” button; their requests show up here for you to approve.</div>'}
    <div class="help" style="margin-top:14px">Permissions apply when the user next opens the app. Only you can see this list. Note: to keep connections alive, your Apps Script stores each user’s refresh key (only the <code>drive.file</code>permission), so technically you can access the files the app created in their Drive. Please tell your users. Deleting a user revokes their key.</div>`;
  const busy = async fn => { try { await fn(); } catch (e) { toast(errMsg(e), true); } renderAdmin(); };
  $('#adAdd').onclick = () => { const v = $('#adEm').value.trim(); if (v) busy(() => Cloud.gas('admin.add', { email: v })); };
  el.querySelectorAll('tr[data-e]').forEach(tr => {
    const email = tr.dataset.e;
    tr.querySelectorAll('[data-p]').forEach(i => i.onchange = () => busy(() => Cloud.gas('admin.set', { email, patch: { perms: { [i.dataset.p]: i.type === 'checkbox' ? i.checked : +i.value } } })));
    tr.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'remove') { if (confirm('Delete ' + email + ' from the list? (Their data in Drive is not affected.)')) busy(() => Cloud.gas('admin.remove', { email })); } else busy(() => Cloud.gas('admin.set', { email, patch: { status: a } })); });
  });
}

/* ---------- AI assistant (Gemini, user-supplied key) ---------- */
const AIS = { hist: [], busy: false };
const aiHtml = t => {   // tiny, safe markdown: **bold**, "- " bullets, line breaks
  const lines = esc(t).split('\n'); let out = '', list = false;
  lines.forEach(l => {
    const b = l.match(/^\s*[-*•]\s+(.*)$/), f = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (b) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + f(b[1]) + '</li>'; }
    else { if (list) { out += '</ul>'; list = false; } if (l.trim()) out += '<p>' + f(l) + '</p>'; }
  });
  return out + (list ? '</ul>' : '');
};
function topicsHtml(items, max = 18) {
  let n = 0; const w = a => '<ul>' + a.map(t => { if (n++ >= max) return ''; return '<li>' + esc(t.text) + (t.children.length ? w(t.children) : '') + '</li>'; }).join('') + '</ul>';
  const count = (function c(a) { return a.reduce((s, t) => s + 1 + c(t.children), 0); })(items);
  return w(items) + (count > max ? '<div class="more">+ ' + (count - max) + ' more…</div>' : '');
}
function toggleAI(open) {
  if (open && !$('#outl').hidden) toggleOutliner(false);
  $('#aip').hidden = !open; $('#rail [data-r=ai]').classList.toggle('on', open); lsSet('mm-ai', open ? '1' : '0');
  if (open) { renderAI(); setTimeout(() => { const t = $('#aiText'); t && t.focus(); }, 30); }
}
function updateAICtx() {
  const mm = S.mm, el = $('#aiCtx'); if (!el || !mm) return;
  const n = mm.primary && mm.get(mm.primary); const txt = (n ? n.text : mm.doc.root.text).replace(/\s+/g, ' ');
  el.innerHTML = MMIcons.svg('sibling') + '<span>' + esc(txt.length > 34 ? txt.slice(0, 34) + '…' : txt) + '</span>'; el.title = 'Selected topic: ' + txt;
}
function fillModels() {
  const sel = $('#aiModelSel'); if (!sel) return; const cur = MMAI.getModel(), list = MMAI.models();
  sel.innerHTML = (list.some(m => m[0] === cur) ? list : [[cur, cur]].concat(list)).map(([v, n]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
}
function renderAI() {
  const body = $('#aiBody'); fillModels(); updateAICtx();
  $('#aiForm').hidden = !MMAI.hasKey();
  if (!MMAI.hasKey()) {
    body.innerHTML = `<div class="ai-empty"><div class="ai-logo">${MMIcons.svg('sparkle')}</div><h3>Connect Gemini</h3>
      <p>Paste your own Google AI Studio API key. It is stored <b>only in this browser</b> (localStorage) and sent <b>only to Google</b>. On another device you will need to enter a key again.</p>
      <input type="password" id="aiKey" placeholder="AIza…" autocomplete="off" spellcheck="false"><button class="btn primary" id="aiKeySave" style="width:100%">Save &amp; test key</button>
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a key in Google AI Studio →</a><div class="err" id="aiKeyErr"></div></div>`;
    $('#aiKeySave').onclick = async e => saveAIKey($('#aiKey').value, e.target, $('#aiKeyErr'));
    $('#aiKey').onkeydown = e => { if (e.key === 'Enter') $('#aiKeySave').click(); e.stopPropagation(); };
    return;
  }
  if (!AIS.hist.length) {
    const cards = [
      ['expand', 'sibling', 'Expand the selected topic', true], ['plan', 'tasks', 'Break down a project into an execution plan', false],
      ['explain', 'search', 'Explain a topic and outline the key points', false], ['review', 'results', 'Review my mind map and suggest improvements', true]
    ];
    body.innerHTML = `<div class="ai-empty"><div class="ai-logo">${MMIcons.svg('sparkle')}</div><h3>How can I help you today?</h3>
      ${cards.map(([k, ic, t]) => `<button class="ai-card" data-k="${k}"><i>${MMIcons.svg(ic)}</i><span>${esc(t)}</span></button>`).join('')}</div>`;
    body.querySelectorAll('.ai-card').forEach(b => b.onclick = () => {
      const k = b.dataset.k, mm = S.mm, n = mm.get(mm.primary || mm.doc.root.id);
      if (k === 'expand') sendAI('Expand the topic “' + n.text.replace(/\s+/g, ' ') + '” with 5 to 8 useful subtopics (and a few details under the most important ones).', { apply: true });
      else if (k === 'review') sendAI('Review my mind map: point out gaps, duplicates and unclear branches, and suggest concrete improvements.');
      else { $('#aiText').value = k === 'plan' ? 'Break down this project into an execution plan with phases and tasks: ' : 'Explain this topic and outline the key points: '; $('#aiText').focus(); }
    });
    return;
  }
  body.innerHTML = '';
  AIS.hist.forEach((m, i) => {
    const d = document.createElement('div'); d.className = 'ai-msg ' + m.role + (m.err ? ' err' : '');
    if (m.role === 'user') d.textContent = m.text;
    else if (m.pending) d.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    else {
      d.innerHTML = aiHtml(m.text);
      if (m.topics && m.topics.length) {
        const tgt = S.mm.get(m.target); const name = tgt ? tgt.text.replace(/\s+/g, ' ') : 'topic';
        d.insertAdjacentHTML('beforeend', '<div class="ai-topics">' + topicsHtml(m.topics) + '</div>' + (m.applied
          ? `<div class="ai-done">✓ Added ${m.applied} topic(s). Press Ctrl+Z to undo.</div>`
          : `<div class="ai-act"><button class="btn small primary" data-a="sel">Add to “${esc(name.length > 22 ? name.slice(0, 22) + '…' : name)}”</button><button class="btn small" data-a="root">Add to central topic</button></div>`));
        d.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const id = b.dataset.a === 'root' ? S.mm.doc.root.id : m.target; m.applied = S.mm.addTree(S.mm.get(id) ? id : S.mm.doc.root.id, m.topics); renderAI(); });
      }
    }
    body.append(d);
  });
  body.scrollTop = body.scrollHeight;
}
async function saveAIKey(key, btn, errEl) {
  key = (key || '').trim(); if (!key) { errEl.textContent = 'Paste your API key first.'; return false; }
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'Testing…'; errEl.textContent = '';
  try {
    const list = await MMAI.testKey(key); MMAI.setKey(key);
    if (list.length && !list.some(m => m[0] === MMAI.getModel())) MMAI.setModel((list.find(m => /flash/.test(m[0]) && !/lite|image|exp|preview/.test(m[0])) || list[0])[0]);
    toast('Gemini key saved in this browser'); if (S.view === 'settings') renderSettings(); renderAI(); return true;
  } catch (e) { errEl.textContent = errMsg(e); btn.disabled = false; btn.textContent = old; return false; }
}
async function sendAI(text, o = {}) {
  text = (text || '').trim(); if (!text || AIS.busy) return;
  if (!MMAI.hasKey()) { toggleAI(true); return; }
  if ($('#aip').hidden) toggleAI(true);
  const mm = S.mm, target = mm.primary || mm.doc.root.id; AIS.busy = true; $('#aiSend').disabled = true;
  const past = AIS.hist.filter(m => !m.err && !m.pending).map(m => ({ role: m.role, text: m.text }));
  AIS.hist.push({ role: 'user', text }); const pend = { role: 'ai', pending: true }; AIS.hist.push(pend); renderAI();
  try {
    const r = await MMAI.ask(mm, past, text, target); AIS.hist.splice(AIS.hist.indexOf(pend), 1);
    const msg = { role: 'ai', text: r.reply || (r.topics.length ? 'Here are some suggestions.' : '…'), topics: r.topics, target }; AIS.hist.push(msg);
    if (o.apply && r.topics.length) msg.applied = mm.addTree(mm.get(target) ? target : mm.doc.root.id, r.topics);
  } catch (e) {
    AIS.hist.splice(AIS.hist.indexOf(pend), 1); AIS.hist.push({ role: 'ai', text: errMsg(e), err: true });
    if (e.code === 'badkey') { MMAI.setKey(''); toast('The saved key was rejected and was removed.', true); }
  }
  AIS.busy = false; $('#aiSend').disabled = false; renderAI();
}
function expandWithAI(id) {
  const mm = S.mm; mm.select(id); toggleAI(true);
  if (!MMAI.hasKey()) return;
  sendAI('Expand the topic “' + mm.get(id).text.replace(/\s+/g, ' ') + '” with 5 to 8 useful subtopics (and a few details under the most important ones).', { apply: true });
}
function initAI() {
  $('#aiClose').onclick = () => toggleAI(false);
  $('#aiNew').onclick = () => { AIS.hist = []; renderAI(); };
  $('#aiModelSel').onchange = e => MMAI.setModel(e.target.value);
  $('#aiForm').onsubmit = e => { e.preventDefault(); const t = $('#aiText'); const v = t.value; t.value = ''; sendAI(v); };
  $('#aiText').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#aiForm').requestSubmit(); } e.stopPropagation(); };
  if (lsGet('mm-ai') === '1' && innerWidth > 1100) toggleAI(true);
}

/* ---------- boot ---------- */
async function boot() {
  initGate();
  if (!Cloud.configured()) { gate(`<div class="badge wait">Not configured</div><p class="sub" style="margin-top:12px">Fill in <code>CLIENT_ID</code> and <code>SCRIPT_URL</code> trong <code>config.js</code> (xem <code>apps-script/HUONG-DAN.md</code>).</p>`); return; }
  try { await Cloud.init(); } catch (e) { gateLogin('Could not load Google sign-in: ' + errMsg(e), true); return; }
  if (Cloud.hasSession()) {          // returning user: reconnect silently with the stored device key
    gate('<p class="sub"><span class="spin"></span> Connecting…</p>');
    try { const u = await Cloud.resume(); if (u) { await afterLogin(); return; } } catch (e) { gateLogin(errMsg(e), true); return; }
  }
  gateLogin();
}
g.MMApp = { S, P, start, boot, save, go, newMap, showDoc, toast, route, present, openShare };
document.addEventListener('DOMContentLoaded', boot);
})(window);
