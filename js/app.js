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
const ago = t => { if (!t) return 'chưa vào'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : m < 1440 ? Math.round(m / 60) + ' giờ trước' : Math.round(m / 1440) + ' ngày trước'; };
const fdate = t => t ? new Date(t).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '';

/* ---------- preferences (per device) ---------- */
const P = Object.assign({ autosave: true, zoom: 'fit', appTheme: 'system', mapTheme: 'flow', layout: 'map' }, (() => { try { return JSON.parse(lsGet('mm-prefs') || '{}'); } catch (e) { return {}; } })());
const savePrefs = () => lsSet('mm-prefs', JSON.stringify(P));
function applyAppTheme() {
  const dark = P.appTheme === 'dark' || (P.appTheme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
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
  if (card || msg) { $('#gErr').textContent = msg || ''; $('#gGoogle').disabled = false; $('#gGoogle').innerHTML = GOOGLE_G + '<span>Đăng nhập bằng Google</span><b>→</b>'; }
}
async function doLogin() {
  const b = $('#gGoogle'); b.disabled = true; b.innerHTML = '<span class="spin"></span><span>Đang đăng nhập…</span>'; $('#gErr').textContent = '';
  try { await Cloud.signIn($('#gRemember').checked); await afterLogin(); }
  catch (err) {
    gateLogin(err.code === 'popup_closed' || err.code === 'access_denied' ? 'Bạn đã đóng cửa sổ đăng nhập hoặc từ chối quyền.' : err.code === 'popup_failed_to_open' ? 'Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép popup rồi thử lại.' : errMsg(err), true);
  }
}
function openDemo() {
  const m = modal('Xem demo', '<div id="demoMap" style="height:min(70vh,560px);border-radius:12px;overflow:hidden;position:relative"></div><div class="help" style="margin-top:10px">Đây là sơ đồ mẫu (chỉ xem). Đăng nhập để tạo và chỉnh sửa sơ đồ của riêng bạn.</div>', { wide: true });
  const doc = MMTemplates.make('skills'); doc.theme = 'flow'; doc.title = 'Demo';
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
  const out = `<p><button class="btn small" id="gOut">Đăng xuất / đổi tài khoản</button></p>`;
  if (me.status === 'active') return start(me);
  if (me.status === 'none') {
    gate(`${who}<div class="badge wait">Chưa có quyền</div><p class="sub" style="margin-top:12px">Tài khoản này chưa được cấp quyền sử dụng. Gửi yêu cầu để quản trị viên duyệt.</p>
      <input type="text" id="rgNote" placeholder="Bạn là ai? (lớp / đơn vị / lý do)" maxlength="300"><button class="btn primary" id="rgGo">Gửi yêu cầu đăng ký</button><div class="err" id="rgErr"></div>${out}`);
    $('#rgGo').onclick = async e => { e.target.disabled = true; try { route((await Cloud.gas('register', { name: S.user.name, note: $('#rgNote').value })).me); } catch (err) { $('#rgErr').textContent = errMsg(err); e.target.disabled = false; } };
  } else if (me.status === 'pending') {
    gate(`${who}<div class="badge wait">Đang chờ duyệt</div><p class="sub" style="margin-top:12px">Yêu cầu của bạn đã được gửi. Khi quản trị viên duyệt, bấm "Kiểm tra lại".</p><p><button class="btn primary" id="gRe">Kiểm tra lại</button></p>${out}`);
    $('#gRe').onclick = async e => { e.target.disabled = true; try { route((await Cloud.gas('me', {})).me); } catch (err) { toast(errMsg(err), true); e.target.disabled = false; } };
  } else gate(`${who}<div class="badge bad">Đã bị khoá</div><p class="sub" style="margin-top:12px">Tài khoản này đã bị quản trị viên khoá. Liên hệ quản trị viên nếu đây là nhầm lẫn.</p>${out}`);
  const b = $('#gOut'); if (b) b.onclick = async () => { await Cloud.signOut(); gateLogin(); };
}

/* ---------- start ---------- */
function start(me) {
  S.me = me; S.folder = { id: me.folderId || '', name: me.folderName || '' };
  $('#gate').hidden = true; $('#app').hidden = false;
  const av = (S.user && S.user.picture) || 'icon.svg';
  $('#ucAvatar').src = av; $('#eAvatar').src = av; $('#ucName').textContent = (S.user && S.user.name) || ''; $('#ucMail').textContent = (S.user && S.user.email) || '';
  $('#navAdmin').hidden = !isAdmin();
  if (!S.mm) { initShell(); initEditor(); initInspector(); initSearch(); initMini(); }
  updateUserCard();
  setInsp(innerWidth > 900 && lsGet('mm-insp') !== '0');
  go('home');
  loadLibrary().then(() => { restoreDraft(); if (!S.folder.id) setTimeout(() => { if (S.view === 'home') { toast('Hãy liên kết một thư mục Google Drive để lưu sơ đồ.'); go('cloud'); } }, 500); });
}
function updateUserCard() {
  $('#ucDrive').innerHTML = S.folder.id ? `📁 ${esc(S.folder.name || 'Thư mục Drive')}` : '<button class="link" data-go="cloud">⚠ Chưa liên kết Drive</button>';
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
  $('#mRef').onclick = async () => { await loadLibrary(); toast('Đã tải lại danh sách'); }; $('#mQ').oninput = renderMaps; $('#tQ').oninput = renderTemplates;
  $('#adRef').onclick = renderAdmin;
  $('#fileIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) doImport(f); };
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  // drag & drop a file anywhere
  let dz = null; const undz = () => { if (dz) { dz.remove(); dz = null; } };
  document.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files') && !$('#app').hidden) { e.preventDefault(); if (!dz) { dz = document.createElement('div'); dz.className = 'dropzone'; dz.style.position = 'fixed'; dz.style.zIndex = 400; dz.textContent = 'Thả tệp .xmind / .pdf / .md vào đây'; document.body.append(dz); } } });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) undz(); });
  document.addEventListener('drop', e => { undz(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && !$('#app').hidden) { e.preventDefault(); doImport(f); } });
}

/* ---------- editor chrome ---------- */
function initEditor() {
  S.mm = new MindMap($('#canvas'), {
    onChange, onSelect: updateInspector, isBlocked: blocked, onLayout: drawMini,
    onView: k => { $('#zPct').textContent = Math.round(k * 100) + '%'; drawMini(); },
    onContext: (id, x, y) => contextMenu(id, x, y)
  });
  $('#title').addEventListener('input', e => {
    const v = e.target.value, mm = S.mm, r = mm.doc.root;
    if (r.text === S.lastTitle && !r.html && mm.index.size === 1) { mm.setRootText(v); mm.render(); }
    S.lastTitle = v; mm.setTitle(v);
  });
  $('#eBack').onclick = () => go('maps');
  $('#zIn').onclick = () => S.mm.zoomBy(1.2); $('#zOut').onclick = () => S.mm.zoomBy(1 / 1.2); $('#zFit').onclick = () => S.mm.fit(); $('#zHelp').onclick = showShortcuts;
  $('#zoomPill').onclick = e => { const r = S.mm.vp.getBoundingClientRect(); menuAt(e.currentTarget, [50, 75, 100, 125, 150, 200].map(z => ({ label: z + '%', fn: () => S.mm.zoomAt(z / 100, r.left + r.width / 2, r.top + r.height / 2) })).concat([{ sep: 1 }, { label: 'Vừa màn hình', hint: 'Ctrl+0', fn: () => S.mm.fit() }])); };
  $('#btnUndo').onclick = () => S.mm.undo(); $('#btnRedo').onclick = () => S.mm.redo();
  $('#btnPresent').onclick = present; $('#btnShare').onclick = openShare;
  $('#btnInsp').onclick = () => setInsp($('#insp').hidden); $('#inspClose').onclick = () => setInsp(false); $('#inspOpen').onclick = () => setInsp(true);
  $('#eMenu').onclick = e => menuAt(e.currentTarget, fileMenu());
  $('#eAvatar').onclick = e => menuAt(e.currentTarget, [{ hd: S.user ? S.user.email : '' }, { label: 'Về trang chủ', fn: () => go('home') }, { label: 'Cài đặt', fn: () => go('settings') }, { sep: 1 }, { label: 'Đăng xuất', fn: logout }]);
  $('#qbar').onclick = e => {
    const b = e.target.closest('[data-q]'); if (!b) return; const mm = S.mm; if (!mm.primary && b.dataset.q !== 'child') return toast('Hãy chọn một nhánh trước');
    ({ child: () => mm.addChild(), sibling: () => mm.addSibling(), edit: () => mm.startEdit(mm.primary, true), fold: () => mm.toggleCollapse(), del: () => mm.remove() })[b.dataset.q]();
  };
  $('#rail').onclick = e => {
    const b = e.target.closest('[data-r]'); if (!b) return; const mm = S.mm, r = b.dataset.r;
    const needSel = () => { if (!mm.primary) { toast('Hãy chọn một nhánh trước'); return false; } return true; };
    const openInsp = () => { setInsp(true); $$('.tabs button[data-tab]')[0].click(); };
    if (r === 'sibling') mm.primary ? mm.addSibling() : mm.addChild();
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
function showDoc(doc, fileId, modified) {
  go('editor'); S.mm.load(doc); S.fileId = fileId || null; S.modified = modified || null;
  $('#title').value = S.lastTitle = S.mm.doc.title; syncInspectorDoc(); updateHistBtns(); requestAnimationFrame(applyZoomPref);
}

/* ---------- saving ---------- */
function onChange() {
  S.rev++; S.dirty = true; updateHistBtns();
  clearTimeout(S.draftT); S.draftT = setTimeout(() => lsSet('mm-draft', JSON.stringify({ t: Date.now(), fileId: S.fileId, modified: S.modified, doc: S.mm.serialize() })), 600);
  if (!S.folder.id) setSave('Chưa liên kết Drive: chỉ lưu nháp trên máy', 'err');
  else if (!P.autosave) setSave('Chưa lưu (Ctrl+S để lưu)');
  else { setSave('Chưa lưu…'); schedule(); }
}
function schedule(ms) { if (!P.autosave && !ms) return; clearTimeout(S.timer); S.timer = setTimeout(() => save(false), ms || 2200); }
async function flush() { if (S.dirty && S.folder.id && S.mm) { clearTimeout(S.timer); await save(false); } }
async function save(force) {
  if (!S.me || !S.mm) return;
  if (!S.folder.id) { toast('Chưa liên kết thư mục Drive. Mở mục Google Drive để liên kết.', true); return; }
  if (S.saving) { S.again = true; return; }
  clearTimeout(S.timer); S.saving = true; const rev = S.rev; setSave('Đang lưu…');
  try {
    const doc = S.mm.serialize(), name = MMIO.safeName(doc.title) + '.mindmap.json', D = Cloud.drive;
    if (!S.fileId) {
      if (!isAdmin() && S.maps.length >= S.me.perms.maxMaps) throw Object.assign(new Error('Đã đạt giới hạn ' + S.me.perms.maxMaps + ' sơ đồ do quản trị viên đặt.'), { code: 'quota' });
      const f = await D.create(S.folder.id, name, doc); S.fileId = f.id; S.modified = f.modifiedTime; S.maps.unshift({ id: f.id, name: f.name, modifiedTime: f.modifiedTime });
    } else {
      if (!force && S.modified) {
        let m = null; try { m = await D.meta(S.fileId); } catch (e) { if (e.code === 404) { S.fileId = null; S.saving = false; return save(true); } throw e; }
        if (m.trashed) { S.fileId = null; S.saving = false; return save(true); }
        if (m.modifiedTime !== S.modified && !confirm('Bản trên Drive mới hơn bản đang mở (có thể bạn đã sửa trên thiết bị khác).\n\nOK = ghi đè bằng bản đang mở\nHủy = giữ bản trên Drive (bản đang mở vẫn còn trong nháp)')) { setSave('Chưa lưu: xung đột phiên bản', 'err'); S.saving = false; return; }
      }
      const f = await D.update(S.fileId, name, doc); S.modified = f.modifiedTime;
      const it = S.maps.find(x => x.id === S.fileId); if (it) { it.name = f.name; it.modifiedTime = f.modifiedTime; }
    }
    if (S.rev === rev) { S.dirty = false; lsDel('mm-draft'); setSave('Đã lưu lên Drive ✓'); } else S.again = true;
    lsSet('mm-last', S.fileId);
  } catch (e) {
    if (e.code === 'quota') setSave('Chưa lưu: ' + e.message, 'err');
    else if (e.code === 'relink' || e.code === 'blocked') setSave(e.code === 'blocked' ? 'Tài khoản đã bị khoá' : 'Kết nối Google đã hết hạn, bấm vào đây để đăng nhập lại', 'err', async () => { S.me = null; gateLogin('', true); })
    else if (e.code === 404 && S.fileId) { S.fileId = null; setSave('Tệp trên Drive không còn, sẽ tạo lại', 'err'); S.again = true; }
    else if (e.code === 403 || e.code === 404) setSave('Chưa lưu: không có quyền ghi vào thư mục Drive này. Hãy chọn lại thư mục.', 'err');
    else setSave('Chưa lưu: ' + errMsg(e) + ' (đã giữ nháp trên máy)', 'err');
  } finally { S.saving = false; if (S.again) { S.again = false; if (S.dirty) schedule(1500); } }
}

/* ---------- library: home / my maps / templates ---------- */
const GRADS = ['#dbeafe,#e0e7ff', '#fce7f3,#ede9fe', '#dcfce7,#d1fae5', '#fef3c7,#ffedd5', '#e0f2fe,#ccfbf1', '#f3e8ff,#fae8ff'];
const gradOf = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADS[h % GRADS.length]; };
async function loadLibrary() {
  if (!S.folder.id) { S.maps = []; S.mapsLoading = false; refreshLists(); return; }
  S.mapsLoading = true; refreshLists();
  try { S.maps = await Cloud.drive.list(S.folder.id); } catch (e) { toast('Không tải được danh sách sơ đồ: ' + errMsg(e), true); }
  S.mapsLoading = false; refreshLists();
}
function refreshLists() { if (S.view === 'home') renderHome(); else if (S.view === 'maps') renderMaps(); }
function mapCard(m) {
  const c = document.createElement('div'); c.className = 'card' + (m.id === S.fileId ? ' cur' : ''); c.tabIndex = 0;
  c.innerHTML = `<div class="thumb" style="background:linear-gradient(135deg,${gradOf(m.id)})">🧠</div><div class="meta"><div class="nm">${esc(m.name.replace(/\.mindmap\.json$/, ''))}</div><small>${esc(fdate(m.modifiedTime))}</small></div><button class="x" title="Xoá (vào thùng rác Drive)">🗑</button>`;
  c.onclick = e => { if (e.target.closest('.x')) return; openMap(m.id); };
  c.onkeydown = e => { if (e.key === 'Enter') openMap(m.id); };
  c.querySelector('.x').onclick = async () => {
    if (!confirm('Chuyển "' + m.name.replace(/\.mindmap\.json$/, '') + '" vào thùng rác Google Drive?')) return;
    try { await Cloud.drive.trash(m.id); S.maps = S.maps.filter(x => x.id !== m.id); if (m.id === S.fileId) { S.fileId = null; S.dirty = false; lsDel('mm-draft'); } refreshLists(); toast('Đã xoá'); } catch (e) { toast(errMsg(e), true); }
  };
  return c;
}
function fillGrid(el, list, emptyHtml) {
  el.innerHTML = ''; if (S.mapsLoading && !list.length) { el.innerHTML = '<div class="empty"><span class="spin"></span> Đang tải…</div>'; return; }
  if (!list.length) { el.innerHTML = `<div class="empty">${emptyHtml}</div>`; return; } list.forEach(m => el.append(mapCard(m)));
}
function renderHome() {
  fillGrid($('#hRecent'), S.maps.slice(0, 6), S.folder.id ? 'Chưa có sơ đồ nào. Bấm “Tạo sơ đồ mới” hoặc chọn một mẫu.' : 'Chưa liên kết Google Drive. <button class="link" data-go="cloud">Liên kết ngay →</button>');
}
function renderMaps() {
  const q = $('#mQ').value.trim().toLowerCase();
  fillGrid($('#mGrid'), S.maps.filter(m => !q || m.name.toLowerCase().includes(q)), S.maps.length ? 'Không có kết quả.' : (S.folder.id ? 'Chưa có sơ đồ nào trong thư mục này.<br>Bấm “＋ Sơ đồ mới” hoặc nhập từ .xmind / PDF.' : 'Chưa liên kết Google Drive. <button class="link" data-go="cloud">Liên kết ngay →</button>'));
}
let tplCat = 'all';
function renderTemplates() {
  const T = MMTemplates, tabs = $('#tTabs'); tabs.innerHTML = '';
  T.cats.forEach(([k, n]) => { const b = document.createElement('button'); b.textContent = n; b.className = k === tplCat ? 'on' : ''; b.onclick = () => { tplCat = k; renderTemplates(); }; tabs.append(b); });
  const q = $('#tQ').value.trim().toLowerCase(), grid = $('#tGrid'); grid.innerHTML = '';
  const list = T.list.filter(t => (tplCat === 'all' || t.cat === tplCat || t.key === 'blank' && tplCat === 'all') && (!q || t.name.toLowerCase().includes(q)));
  list.forEach(t => { const c = document.createElement('button'); c.className = 'card'; c.innerHTML = `<div class="ico">${t.icon}</div><div class="nm">${esc(t.name)}</div>`; c.onclick = () => newMap(t.key); grid.append(c); });
  if (!list.length) grid.innerHTML = '<div class="empty">Không có mẫu phù hợp.</div>';
}
async function openMap(id) {
  await flush(); const t = toast('Đang mở sơ đồ…', false, 30000);
  try {
    const [doc, meta] = await Promise.all([Cloud.drive.read(id), Cloud.drive.meta(id)]);
    t.remove(); showDoc(doc, id, meta.modifiedTime); S.dirty = false; lsDel('mm-draft'); lsSet('mm-last', id); setSave('Đã mở');
  } catch (e) { t.remove(); toast('Không mở được sơ đồ: ' + errMsg(e), true); }
}
async function newMap(tplKey) {
  await flush();
  if (!isAdmin() && S.folder.id && S.maps.length >= S.me.perms.maxMaps) return toast('Đã đạt giới hạn ' + S.me.perms.maxMaps + ' sơ đồ do quản trị viên đặt.', true);
  const doc = MMTemplates.make(tplKey || 'blank'); doc.theme = P.mapTheme; if (!tplKey || tplKey === 'blank') doc.layout = P.layout;
  showDoc(doc, null, null); S.rev++; S.dirty = true;
  if (S.folder.id) { setSave('Sơ đồ mới'); schedule(800); } else setSave('Sơ đồ mới (chưa liên kết Drive)', 'err');
  requestAnimationFrame(() => { S.mm.select(S.mm.doc.root.id); if (!tplKey || tplKey === 'blank') S.mm.startEdit(S.mm.doc.root.id, true); });
}
function restoreDraft() {
  const raw = lsGet('mm-draft'); let d = null; try { d = raw && JSON.parse(raw); } catch (e) {} if (!d || !d.doc) return;
  if (confirm('Có bản nháp chưa lưu từ lần làm việc trước (' + fdate(d.t) + ').\nKhôi phục nó?')) { showDoc(d.doc, d.fileId, d.modified); S.rev++; S.dirty = true; if (S.folder.id) schedule(800); } else lsDel('mm-draft');
}

/* ---------- import / export ---------- */
function fileMenu() {
  const ex = fn => () => { if (!can('export')) return toast('Quản trị viên chưa cấp quyền xuất tệp cho tài khoản này.', true); fn(); };
  return [
    { label: 'Sơ đồ mới', fn: () => newMap() }, { label: 'Lưu ngay', hint: 'Ctrl+S', fn: () => save(true) },
    { sep: 1 }, { hd: 'Nhập từ' }, { label: 'Tệp XMind (.xmind)', fn: () => pickFile('.xmind') }, { label: 'Tệp PDF (.pdf)', fn: () => pickFile('.pdf') }, { label: 'Markdown / văn bản', fn: () => pickFile('.md,.markdown,.txt,.json') },
    { sep: 1 }, { label: 'Chia sẻ / Xuất…', fn: openShare }
  ];
}
function pickFile(accept) { const i = $('#fileIn'); i.accept = accept; i.click(); }
async function doImport(file) {
  const kind = MMIO.kindOf(file.name);
  if (kind === 'pdf' && !can('pdf')) return toast('Quản trị viên chưa cấp quyền nhập PDF cho tài khoản này.', true);
  if (kind === 'xmind' && !can('xmind')) return toast('Quản trị viên chưa cấp quyền nhập XMind cho tài khoản này.', true);
  const t = toast('Đang đọc ' + file.name + '…', false, 90000);
  try {
    const docs = await MMIO.importFile(file, (p, n) => { t.textContent = 'Đang phân tích PDF: trang ' + p + '/' + n + '…'; });
    t.remove(); await flush(); docs.forEach(d => { if (!d.theme || d.theme === 'classic') d.theme = P.mapTheme; });
    if (!isAdmin() && S.folder.id) {   // respect the per-user map limit
      const room = S.me.perms.maxMaps - S.maps.length;
      if (room <= 0) return toast('Đã đạt giới hạn ' + S.me.perms.maxMaps + ' sơ đồ do quản trị viên đặt, không nhập thêm được.', true);
      if (docs.length > room) { toast('Chỉ nhập ' + room + '/' + docs.length + ' sơ đồ vì giới hạn quản trị viên đặt.', true, 6000); docs.length = room; }
    }
    showDoc(docs[0], null, null); S.rev++; S.dirty = true; if (S.folder.id) schedule(300);
    for (let i = 1; i < docs.length && S.folder.id; i++) { const d = docs[i], f = await Cloud.drive.create(S.folder.id, MMIO.safeName(d.title) + '.mindmap.json', d); S.maps.unshift({ id: f.id, name: f.name, modifiedTime: f.modifiedTime }); }
    toast('Đã nhập "' + docs[0].title + '"' + (docs.length > 1 ? ' và thêm ' + (docs.length - 1) + ' sơ đồ nữa' : '') + (docs[0].importNote ? '. ' + docs[0].importNote : ''), false, 5600);
  } catch (e) { t.remove(); toast(errMsg(e), true); }
}
async function exportAs(kind) {
  if (!can('export')) return toast('Quản trị viên chưa cấp quyền xuất tệp cho tài khoản này.', true);
  const mm = S.mm, nm = MMIO.safeName(mm.doc.title);
  try {
    if (kind === 'png') MMIO.download(await mm.exportPNG(2), nm + '.png');
    else if (kind === 'svg') MMIO.download(new Blob([mm.exportSVG().svg], { type: 'image/svg+xml' }), nm + '.svg');
    else if (kind === 'xmind') MMIO.download(await MMIO.exportXMind(mm.serialize()), nm + '.xmind');
    else if (kind === 'md') MMIO.download(new Blob([MMIO.toMarkdown(mm.serialize())], { type: 'text/markdown' }), nm + '.md');
    else if (kind === 'json') MMIO.download(new Blob([JSON.stringify(mm.serialize(), null, 1)], { type: 'application/json' }), nm + '.mindmap.json');
    else if (kind === 'pdf') await exportPDF();
  } catch (e) { toast('Không xuất được: ' + errMsg(e), true); }
}
async function exportPDF() {
  const mm = S.mm, { w, h } = mm.exportSVG(), url = URL.createObjectURL(await mm.exportPNG(2));
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.append(f);
  const d = f.contentDocument; d.open(); d.write(`<!doctype html><title>${esc(mm.doc.title)}</title><style>@page{size:${w >= h ? 'landscape' : 'portrait'};margin:8mm}html,body{margin:0}img{width:100%;height:auto;display:block}</style><img src="${url}">`); d.close();
  const img = d.querySelector('img'); const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000); };
  if (img.complete) go(); else img.onload = go;
  toast('Chọn “Lưu thành PDF” trong hộp thoại in', false, 4500);
}
async function openShare() {
  const mm = S.mm, link = S.fileId ? 'https://drive.google.com/file/d/' + S.fileId + '/view' : '';
  const m = modal('Chia sẻ / Xuất sơ đồ', `<div class="share"><div>
      <h5 style="margin-top:4px">Chia sẻ</h5>
      <div class="help" style="margin:0 0 10px">Sơ đồ nằm trong Drive của bạn và chỉ mình bạn xem được. Muốn cho người khác xem, hãy chia sẻ tệp trong Drive, hoặc gửi bản xuất bên dưới.</div>
      <div class="copyrow"><input type="text" id="shLink" readonly value="${esc(link || 'Sơ đồ chưa được lưu lên Drive')}"><button class="btn primary" id="shCopy" ${link ? '' : 'disabled'}>Sao chép</button></div>
      <div class="apps" style="margin-top:14px">
        <button id="shMail"><i>✉️</i>Email</button><button id="shDrive" ${link ? '' : 'disabled'}><i>📁</i>Mở trong Drive</button><button id="shMd"><i>📋</i>Chép dàn ý</button>
      </div>
      <h5>Xuất dưới dạng</h5>
      <div class="chips">${[['png', 'PNG'], ['pdf', 'PDF'], ['svg', 'SVG'], ['md', 'Markdown'], ['xmind', 'XMind'], ['json', 'JSON']].map(([k, n]) => `<button data-x="${k}">${n}</button>`).join('')}</div>
    </div><div class="prev" id="shPrev"><span class="spin"></span></div></div>`, { wide: true });
  m.el.querySelector('#shCopy').onclick = () => { navigator.clipboard.writeText(link).then(() => toast('Đã sao chép liên kết Drive'), () => toast('Không sao chép được', true)); };
  m.el.querySelector('#shDrive').onclick = () => window.open(link, '_blank', 'noopener');
  const outline = () => MMIO.toMarkdown(mm.serialize());
  m.el.querySelector('#shMd').onclick = () => navigator.clipboard.writeText(outline()).then(() => toast('Đã chép dàn ý (Markdown)'), () => toast('Không sao chép được', true));
  m.el.querySelector('#shMail').onclick = () => { location.href = 'mailto:?subject=' + encodeURIComponent(mm.doc.title) + '&body=' + encodeURIComponent(outline().slice(0, 1800)); };
  m.el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => exportAs(b.dataset.x));
  try { const blob = await mm.exportPNG(1); const u = URL.createObjectURL(blob); const pv = m.el.querySelector('#shPrev'); if (pv) pv.innerHTML = `<img alt="Xem trước" src="${u}">`; } catch (e) { const pv = m.el.querySelector('#shPrev'); if (pv) pv.textContent = 'Không tạo được bản xem trước'; }
}
function contextMenu(id, x, y) {
  const mm = S.mm;
  if (!id) return menu([{ label: 'Vừa màn hình', hint: 'Ctrl+0', fn: () => mm.fit() }, { label: 'Mở tất cả nhánh', fn: () => mm.expandAll(true) }, { label: 'Thu gọn tất cả', fn: () => mm.expandAll(false) }], x, y);
  const isRoot = id === mm.doc.root.id;
  menu([
    { label: 'Thêm nhánh con', hint: 'Tab', fn: () => mm.addChild(id) }, { label: 'Thêm nhánh cùng cấp', hint: 'Enter', fn: () => mm.addSibling(id), disabled: isRoot },
    { label: 'Chèn nhánh cha', hint: 'Ctrl+Enter', fn: () => mm.addParent(id), disabled: isRoot }, { label: 'Sửa chữ', hint: 'F2', fn: () => mm.startEdit(id, true) },
    { label: 'Thu gọn / mở', hint: 'Ctrl+/', fn: () => mm.toggleCollapse() }, { sep: 1 },
    { label: 'Xoá định dạng nhánh', fn: () => mm.clearStyle() }, { label: 'Xoá nhánh', hint: 'Del', fn: () => mm.remove(), disabled: isRoot }
  ], x, y);
}
function showShortcuts() {
  modal('Phím tắt', `<div class="kbd">${[['Nhánh con', 'Tab'], ['Cùng cấp', 'Enter'], ['Cùng cấp (phía trên)', 'Shift+Enter'], ['Chèn nhánh cha', 'Ctrl+Enter'], ['Sửa chữ', 'F2 / Space / bấm đúp'], ['Xoá nhánh', 'Delete'], ['Thu / mở nhánh', 'Ctrl+/'], ['Di chuyển chọn', 'Phím mũi tên'], ['Chọn tất cả', 'Ctrl+A'], ['Đậm / nghiêng / gạch chân', 'Ctrl+B / I / U'], ['Hoàn tác / làm lại', 'Ctrl+Z / Ctrl+Y'], ['Sao chép / dán nhánh', 'Ctrl+C / Ctrl+V'], ['Tìm kiếm', 'Ctrl+F'], ['Lưu ngay', 'Ctrl+S'], ['Thu phóng', 'Ctrl + cuộn / + / −'], ['Vừa màn hình', 'Ctrl+0']].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>
    <div class="help" style="margin-top:14px">Kéo một nhánh thả lên nhánh khác để chuyển sang đó (thả vào mép trên/dưới nhánh để làm nhánh cùng cấp). Giữ Shift hoặc Ctrl khi bấm để chọn nhiều nhánh rồi kéo cùng lúc.</div>`);
}

/* ---------- search ---------- */
const SR = { res: [], i: 0 };
function initSearch() {
  const q = $('#searchQ'), go2 = d => { if (!SR.res.length) return; SR.i = (SR.i + d + SR.res.length) % SR.res.length; S.mm.focusNode(SR.res[SR.i]); $('#searchN').textContent = (SR.i + 1) + '/' + SR.res.length; };
  q.oninput = () => { SR.res = S.mm.find(q.value); SR.i = -1; $('#searchN').textContent = q.value ? SR.res.length + ' kết quả' : ''; if (SR.res.length) go2(1); };
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
  const fs = $('#fSize'); fs.innerHTML = '<option value="">Tự động</option>' + [10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64].map(n => `<option value="${n}">${n}px</option>`).join('');
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
  $('#dLine').onchange = e => mm().setLineStyle(e.target.value); $('#dExpand').onclick = () => mm().expandAll(true); $('#dCollapse').onclick = () => mm().expandAll(false);
  syncInspectorDoc();
}
function syncInspectorDoc() {
  const d = S.mm.doc; $$('#dLayouts button').forEach(b => b.classList.toggle('on', b.dataset.l === d.layout));
  $$('#dThemes button').forEach(b => b.classList.toggle('on', b.dataset.t === d.theme)); $('#dLine').value = d.lineStyle; updateInspector();
}
function updateInspector() {
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
    <div class="fld"><label class="t">Tài khoản Google</label><div>${esc(S.user ? S.user.name : '')} <span style="color:var(--muted)">${esc(S.user ? S.user.email : '')}</span> <span class="badge ${isAdmin() ? 'ok' : ''}">${isAdmin() ? 'Quản trị viên' : 'Người dùng'}</span></div>
      <div class="help">Kết nối Drive được giữ liên tục và tự làm mới: bạn không cần đăng nhập lại mỗi giờ. <button class="link" id="clRenew">Kiểm tra kết nối</button></div></div>
    <div class="fld"><label class="t">Thư mục Google Drive lưu sơ đồ</label>
      <div id="clFolder" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${hasPicker ? '<button class="btn primary" id="clPick">Chọn thư mục từ Drive…</button>' : ''}<button class="btn ${hasPicker ? '' : 'primary'}" id="clNew">Tạo thư mục mới</button></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><input type="text" id="clLink" placeholder="Hoặc dán liên kết thư mục Drive…" style="flex:1;min-width:200px"><button class="btn" id="clGo">Liên kết</button></div>
      <div class="err" id="clErr"></div>
      <div class="help">Ứng dụng dùng quyền hẹp <code>drive.file</code>: chỉ thấy tệp do chính nó tạo (hoặc thư mục bạn chủ động chọn). Dán liên kết chỉ dùng được với thư mục ứng dụng đã có quyền; nếu báo “chưa có quyền”, hãy dùng “Chọn thư mục từ Drive” hoặc “Tạo thư mục mới”. Lựa chọn này được ghi nhớ cho mọi thiết bị của bạn.</div></div>
    <div class="fld"><label class="t">Phiên đăng nhập</label><button class="btn" id="clSw">Đổi tài khoản Google</button> <button class="btn danger" id="clOut">Đăng xuất</button></div>`;
  const show = () => { $('#clFolder').innerHTML = S.folder.id ? `📁 <b>${esc(S.folder.name || 'Thư mục')}</b> · <a href="https://drive.google.com/drive/folders/${encodeURIComponent(S.folder.id)}" target="_blank" rel="noopener">mở trong Drive</a> · ${S.maps.length} sơ đồ` : '<span class="badge wait">Chưa liên kết</span> Sơ đồ chỉ được lưu nháp trên máy này.'; };
  show(); const err = t => { $('#clErr').textContent = t || ''; };
  const link = async (id, name) => {
    try { const r = await Cloud.gas('saveSettings', { folderId: id, folderName: name }); S.me = Object.assign(S.me, r.me); S.folder = { id, name }; updateUserCard(); err(''); toast('Đã liên kết thư mục "' + name + '"'); await loadLibrary(); show(); if (S.dirty) schedule(300); }
    catch (e) { err(errMsg(e)); }
  };
  $('#clRenew').onclick = async () => { try { await Cloud.refresh(); toast('Kết nối Drive đang hoạt động'); } catch (e) { toast('Kết nối có vấn đề: ' + errMsg(e), true); } };
  const pk = $('#clPick'); if (pk) pk.onclick = async () => { err(''); try { const f = await Cloud.drive.pick(); if (f) link(f.id, f.name); } catch (e) { err(errMsg(e)); } };
  $('#clNew').onclick = async () => { const name = prompt('Tên thư mục mới trong Drive của bạn:', 'Mind Map'); if (!name) return; err(''); try { const f = await Cloud.drive.createFolder(name.trim()); link(f.id, f.name); } catch (e) { err(errMsg(e)); } };
  $('#clGo').onclick = async () => {
    err(''); const id = Cloud.drive.folderIdFrom($('#clLink').value); if (!id) return err('Không nhận ra liên kết thư mục Drive.');
    try { const f = await Cloud.drive.folderInfo(id); link(f.id, f.name); } catch (e) { err(e.code === 404 || e.code === 403 ? 'Ứng dụng chưa có quyền với thư mục này. Hãy dùng “Chọn thư mục từ Drive” (cấp quyền) hoặc “Tạo thư mục mới”.' : errMsg(e)); }
  };
  $('#clSw').onclick = switchAccount; $('#clOut').onclick = logout;
}
async function switchAccount() { await flush(); await Cloud.signOut(); S.me = null; gateLogin('', true); }
async function logout() { await flush(); await Cloud.signOut(); S.me = null; gateLogin(); }

/* ---------- settings page ---------- */
let setTab = 'general';
function renderSettings() {
  const tabs = $('#sTabs'); tabs.innerHTML = '';
  [['general', 'Chung'], ['appearance', 'Giao diện'], ['shortcuts', 'Phím tắt'], ['advanced', 'Nâng cao']].forEach(([k, n]) => { const b = document.createElement('button'); b.textContent = n; b.className = k === setTab ? 'on' : ''; b.onclick = () => { setTab = k; renderSettings(); }; tabs.append(b); });
  const el = $('#sBody');
  if (setTab === 'general') {
    el.innerHTML = `
      <div class="setrow"><div class="lb"><b>Tự động lưu</b><small>Tự lưu lên Google Drive vài giây sau mỗi thay đổi.</small></div><label class="switch"><input type="checkbox" id="pAuto" ${P.autosave ? 'checked' : ''}><i></i></label></div>
      <div class="setrow"><div class="lb"><b>Thu phóng mặc định khi mở sơ đồ</b><small>“Vừa màn hình” sẽ tự co giãn cho thấy toàn bộ sơ đồ.</small></div>
        <select id="pZoom">${[['fit', 'Vừa màn hình'], ['75', '75%'], ['100', '100%'], ['125', '125%'], ['150', '150%']].map(([v, n]) => `<option value="${v}" ${String(P.zoom) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="setrow"><div class="lb"><b>Bố cục của sơ đồ trống mới</b></div>
        <select id="pLayout">${[['map', 'Hai phía (mind map)'], ['right', 'Sang phải (logic)'], ['left', 'Sang trái (logic)'], ['org', 'Sơ đồ tổ chức']].map(([v, n]) => `<option value="${v}" ${P.layout === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="help">Các tuỳ chọn này lưu riêng trên từng thiết bị.</div>`;
    $('#pAuto').onchange = e => { P.autosave = e.target.checked; savePrefs(); if (P.autosave && S.dirty) schedule(); toast(P.autosave ? 'Đã bật tự động lưu' : 'Đã tắt tự động lưu, dùng Ctrl+S để lưu'); };
    $('#pZoom').onchange = e => { P.zoom = e.target.value; savePrefs(); }; $('#pLayout').onchange = e => { P.layout = e.target.value; savePrefs(); };
  } else if (setTab === 'appearance') {
    el.innerHTML = `<div class="fld"><label class="t">Giao diện ứng dụng</label><div class="choice" id="pTheme">${[['light', '☀️', 'Sáng'], ['dark', '🌙', 'Tối'], ['system', '🖥️', 'Hệ thống']].map(([v, i, n]) => `<button data-v="${v}" class="${P.appTheme === v ? 'on' : ''}"><i>${i}</i>${n}</button>`).join('')}</div></div>
      <div class="fld"><label class="t">Giao diện mặc định của sơ đồ mới</label><div class="themes" id="pMapTheme" style="max-width:420px"></div></div>`;
    $$('#pTheme button').forEach(b => b.onclick = () => { P.appTheme = b.dataset.v; savePrefs(); applyAppTheme(); renderSettings(); });
    Object.entries(MindMap.THEMES).forEach(([k, t]) => { const b = document.createElement('button'); b.className = k === P.mapTheme ? 'on' : ''; b.innerHTML = `<i style="background:${t.bg}">${t.branches.slice(0, 5).map(c => `<b style="background:${c}"></b>`).join('')}</i>${esc(t.name)}`; b.onclick = () => { P.mapTheme = k; savePrefs(); renderSettings(); }; $('#pMapTheme').append(b); });
  } else if (setTab === 'shortcuts') {
    el.innerHTML = `<div class="kbd">${[['Nhánh con', 'Tab'], ['Cùng cấp', 'Enter'], ['Cùng cấp (phía trên)', 'Shift+Enter'], ['Chèn nhánh cha', 'Ctrl+Enter'], ['Sửa chữ', 'F2 / Space'], ['Xoá nhánh', 'Delete'], ['Thu / mở nhánh', 'Ctrl+/'], ['Di chuyển chọn', 'Mũi tên'], ['Chọn tất cả', 'Ctrl+A'], ['Đậm / nghiêng / gạch chân', 'Ctrl+B / I / U'], ['Hoàn tác / làm lại', 'Ctrl+Z / Y'], ['Sao chép / dán', 'Ctrl+C / V'], ['Tìm kiếm', 'Ctrl+F'], ['Lưu ngay', 'Ctrl+S'], ['Thu phóng', 'Ctrl + cuộn'], ['Vừa màn hình', 'Ctrl+0']].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>`;
  } else {
    el.innerHTML = `
      <div class="setrow"><div class="lb"><b>Bản nháp trên máy này</b><small>${lsGet('mm-draft') ? 'Có bản nháp chưa lưu.' : 'Không có bản nháp.'} Bản nháp tự xoá sau khi lưu thành công lên Drive.</small></div><button class="btn small danger" id="aDraft">Xoá bản nháp</button></div>
      <div class="setrow"><div class="lb"><b>Dữ liệu của bạn nằm ở đâu?</b><small>Sơ đồ là các tệp <code>*.mindmap.json</code> trong thư mục Drive bạn đã liên kết. Để giữ kết nối liên tục (không phải đăng nhập lại mỗi giờ), một khoá làm mới được lưu ở máy chủ phân quyền (Apps Script) do quản trị viên quản lý. Khoá này chỉ có quyền <code>drive.file</code>: truy cập các tệp do ứng dụng tạo và thư mục bạn đã chọn, không phải toàn bộ Drive. Bạn thu hồi được bất cứ lúc nào bằng “Đăng xuất” hoặc tại myaccount.google.com/permissions.</small></div></div>
      <div class="setrow"><div class="lb"><b>Đăng xuất khỏi thiết bị này</b></div><button class="btn small" id="aOut">Đăng xuất</button></div>`;
    $('#aDraft').onclick = () => { lsDel('mm-draft'); toast('Đã xoá bản nháp'); renderSettings(); }; $('#aOut').onclick = logout;
  }
}

/* ---------- admin page ---------- */
async function renderAdmin() {
  const el = $('#adminBody'); if (!isAdmin()) return; el.innerHTML = '<div class="empty"><span class="spin"></span> Đang tải…</div>';
  let users; try { users = (await Cloud.gas('admin.list')).users; } catch (e) { el.innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; return; }
  const order = { pending: 0, active: 1, blocked: 2 }; users.sort((a, b) => order[a.status] - order[b.status]);
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap"><input type="email" id="adEm" placeholder="Thêm người dùng theo email Google (được duyệt ngay)" style="flex:1;min-width:220px"><button class="btn primary" id="adAdd">Thêm</button></div>
    ${users.length ? `<div style="overflow:auto"><table><thead><tr><th>Người dùng</th><th>Trạng thái</th><th>PDF</th><th>XMind</th><th>Xuất tệp</th><th>Số sơ đồ tối đa</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr data-e="${esc(u.email)}"><td><b>${esc(u.name || u.email)}</b><br><span style="color:var(--muted)">${esc(u.email)}</span>${u.note ? `<br><i style="color:var(--muted)">${esc(u.note)}</i>` : ''}<br><small style="color:var(--muted)">${ago(u.seen)}${u.folderName ? ' · 📁 ' + esc(u.folderName) : ''}</small></td>
      <td><span class="badge ${u.status === 'active' ? 'ok' : u.status === 'pending' ? 'wait' : 'bad'}">${{ active: 'Đã duyệt', pending: 'Chờ duyệt', blocked: 'Đã khoá' }[u.status]}</span></td>
      <td><input type="checkbox" data-p="pdf" ${u.perms.pdf ? 'checked' : ''}></td><td><input type="checkbox" data-p="xmind" ${u.perms.xmind ? 'checked' : ''}></td><td><input type="checkbox" data-p="export" ${u.perms.export ? 'checked' : ''}></td>
      <td><input type="number" min="0" data-p="maxMaps" value="${u.perms.maxMaps}"></td>
      <td style="white-space:nowrap">${u.status !== 'active' ? '<button class="btn small primary" data-a="active">Duyệt</button> ' : '<button class="btn small" data-a="blocked">Khoá</button> '}<button class="btn small danger" data-a="remove">Xoá</button></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Chưa có ai đăng ký. Người dùng đăng nhập bằng Google sẽ thấy nút “Gửi yêu cầu đăng ký”; yêu cầu hiện ở đây để bạn duyệt.</div>'}
    <div class="help" style="margin-top:14px">Quyền được áp dụng khi người dùng mở lại ứng dụng. Chỉ bạn thấy danh sách này. Lưu ý: để giữ kết nối liên tục, Apps Script của bạn lưu khoá làm mới (chỉ quyền <code>drive.file</code>) của từng người dùng, nên về kỹ thuật bạn có thể truy cập các tệp do ứng dụng tạo trong Drive của họ. Hãy thông báo điều này cho người dùng. Xoá người dùng sẽ thu hồi khoá của họ.</div>`;
  const busy = async fn => { try { await fn(); } catch (e) { toast(errMsg(e), true); } renderAdmin(); };
  $('#adAdd').onclick = () => { const v = $('#adEm').value.trim(); if (v) busy(() => Cloud.gas('admin.add', { email: v })); };
  el.querySelectorAll('tr[data-e]').forEach(tr => {
    const email = tr.dataset.e;
    tr.querySelectorAll('[data-p]').forEach(i => i.onchange = () => busy(() => Cloud.gas('admin.set', { email, patch: { perms: { [i.dataset.p]: i.type === 'checkbox' ? i.checked : +i.value } } })));
    tr.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'remove') { if (confirm('Xoá ' + email + ' khỏi danh sách? (Dữ liệu trong Drive của họ không bị ảnh hưởng.)')) busy(() => Cloud.gas('admin.remove', { email })); } else busy(() => Cloud.gas('admin.set', { email, patch: { status: a } })); });
  });
}

/* ---------- boot ---------- */
async function boot() {
  initGate();
  if (!Cloud.configured()) { gate(`<div class="badge wait">Chưa cấu hình</div><p class="sub" style="margin-top:12px">Hãy điền <code>CLIENT_ID</code> và <code>SCRIPT_URL</code> trong <code>config.js</code> (xem <code>apps-script/HUONG-DAN.md</code>).</p>`); return; }
  try { await Cloud.init(); } catch (e) { gateLogin('Không tải được dịch vụ đăng nhập của Google: ' + errMsg(e), true); return; }
  if (Cloud.hasSession()) {          // returning user: reconnect silently with the stored device key
    gate('<p class="sub"><span class="spin"></span> Đang kết nối…</p>');
    try { const u = await Cloud.resume(); if (u) { await afterLogin(); return; } } catch (e) { gateLogin(errMsg(e), true); return; }
  }
  gateLogin();
}
g.MMApp = { S, P, start, boot, save, go, newMap, showDoc, toast, route, present, openShare };
document.addEventListener('DOMContentLoaded', boot);
})(window);
