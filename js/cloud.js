/* Google sign-in (one-time authorization code), persistent connection via the gate, and Drive storage */
(function (g) {
'use strict';
const C = g.MM_CONFIG || {};
const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file';
const D = 'https://www.googleapis.com/drive/v3/files', U = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
let codeClient = null, tok = null, exp = 0, pendingCode = null, user = null, refreshing = null;

const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
});
const store = k => { try { return JSON.parse(localStorage.getItem(k) || sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const SESS = 'mm-sess';
function saveSession(s, remember) {
  try { localStorage.removeItem(SESS); sessionStorage.removeItem(SESS); (remember ? localStorage : sessionStorage).setItem(SESS, JSON.stringify(s)); } catch (e) {}
}
const clearSession = () => { try { localStorage.removeItem(SESS); sessionStorage.removeItem(SESS); } catch (e) {} };
const session = () => store(SESS);
const err = (msg, code) => Object.assign(new Error(msg), { code });

const configured = () => !!(C.CLIENT_ID && C.SCRIPT_URL);

async function init() {
  await loadScript('https://accounts.google.com/gsi/client');
  codeClient = google.accounts.oauth2.initCodeClient({
    client_id: C.CLIENT_ID, scope: SCOPE, ux_mode: 'popup',
    callback: r => { const p = pendingCode; pendingCode = null; if (!p) return; r.error ? p.rej(err(r.error_description || r.error, r.error)) : p.res(r.code); },
    error_callback: e => { const p = pendingCode; pendingCode = null; p && p.rej(err(e.type || 'popup_error', e.type)); }
  });
}
// must be called from a click handler (browsers only allow the popup from a user gesture)
const requestCode = () => new Promise((res, rej) => { pendingCode = { res, rej }; codeClient.requestCode(); });

async function raw(body) {
  let r; try { r = await fetch(C.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); }
  catch (e) { throw err('Could not reach the access server (Apps Script). Check SCRIPT_URL and your network.', 'net'); }
  let j; try { j = await r.json(); } catch (e) { throw err('The access server returned unexpected data. Check that the Apps Script is deployed for "Anyone" .', 'bad_response'); }
  return j;
}
function setToken(j) { tok = j.access_token; exp = Date.now() + (j.expires_in || 3600) * 1000; }

/** Đăng nhập (gọi trong click). Trả về thông tin người dùng Google. */
async function signIn(remember) {
  const code = await requestCode();
  const j = await raw({ action: 'link', code });
  if (!j.ok) throw err(({
    no_refresh: 'Google has not granted long-lived access for this account. Go to https://myaccount.google.com/permissions , remove access for the Mind Map app, then sign in again.',
    no_secret: 'The Apps Script has no GOOGLE_CLIENT_SECRET. See the deployment guide.',
    exchange: 'Google rejected the sign-in code (' + (j.detail || '') + '). Check the Client ID / Client secret in the Apps Script.',
    bad_token: 'The Google token does not match the Client ID configured in the Apps Script (GOOGLE_CLIENT_ID).'
  })[j.error] || j.detail || j.error, j.error);
  saveSession({ email: j.email, sk: j.sk }, !!remember); setToken(j);
  return userinfo();
}
/** Mở lại ứng dụng: dùng khoá phiên đã lưu để lấy token mới, không cần popup. */
async function resume() {
  const s = session(); if (!s) return null;
  try { await refresh(); } catch (e) { if (e.code === 'net') throw e; return null; }
  return userinfo();
}
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const s = session(); if (!s) throw err('Not signed in', 'relink');
    const j = await raw({ action: 'keep', email: s.email, sk: s.sk });
    if (!j.ok) {
      if (['bad_session', 'relink', 'blocked'].includes(j.error)) clearSession();
      throw err(j.error === 'blocked' ? 'This account has been blocked.' : 'The Google connection expired. Please sign in again.', j.error === 'blocked' ? 'blocked' : 'relink');
    }
    setToken(j);
  })();
  try { await refreshing; } finally { refreshing = null; }
}
async function userinfo() {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + (await token()) } });
  if (!r.ok) throw err('Could not read the Google account info');
  user = await r.json(); return user;
}
const hasToken = () => !!tok && exp - Date.now() > 90000;
async function token() { if (!hasToken()) await refresh(); return tok; }
async function signOut(all) {
  const s = session(); clearSession(); tok = null; exp = 0; user = null;
  if (s) { try { await raw({ action: 'unlink', email: s.email, sk: s.sk, all: !!all }); } catch (e) {} }
}

/* ---- Apps Script gate (authenticated by the user's Google token) ---- */
async function gas(action, extra) {
  const j = await raw(Object.assign({ action, token: await token() }, extra || {}));
  if (!j.ok) throw err(j.detail || j.error || 'Error', j.error);
  return j;
}

/* ---- Drive ---- */
async function dfetch(url, opt, retry = true) {
  const t = await token(); opt = opt || {}; opt.headers = Object.assign({}, opt.headers, { Authorization: 'Bearer ' + t });
  let r; try { r = await fetch(url, opt); } catch (e) { throw err('Network connection lost', 'net'); }
  if (r.status === 401 && retry) { tok = null; return dfetch(url, opt, false); }
  if (!r.ok) {
    let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
    throw err(m || ('Drive error ' + r.status), r.status);
  }
  return r;
}
const multipart = (meta, content) => {
  const b = 'mmb' + Math.random().toString(36).slice(2);
  return { type: 'multipart/related; boundary=' + b, body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(content)}\r\n--${b}--` };
};
const drive = {
  async list(folderId) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name contains '.mindmap.json'`);
    const r = await dfetch(`${D}?q=${q}&orderBy=modifiedTime desc&pageSize=500&fields=files(id,name,modifiedTime)`);
    return (await r.json()).files || [];
  },
  async read(id) { return (await dfetch(`${D}/${id}?alt=media`)).json(); },
  async meta(id) { return (await dfetch(`${D}/${id}?fields=id,name,mimeType,modifiedTime,trashed,capabilities(canAddChildren,canEdit)`)).json(); },
  async create(folderId, name, obj) {
    const m = multipart({ name, parents: [folderId], mimeType: 'application/json' }, obj);
    return (await dfetch(`${U}?uploadType=multipart&fields=id,name,modifiedTime`, { method: 'POST', headers: { 'Content-Type': m.type }, body: m.body })).json();
  },
  async update(id, name, obj) {
    const m = multipart({ name }, obj);
    return (await dfetch(`${U}/${id}?uploadType=multipart&fields=id,name,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': m.type }, body: m.body })).json();
  },
  async trash(id) { await dfetch(`${D}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); },
  async createFolder(name) { return (await dfetch(`${D}?fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER }) })).json(); },
  folderIdFrom(s) {
    s = String(s || '').trim(); let m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
    if (m) return m[1]; return /^[\w-]{10,}$/.test(s) ? s : '';
  },
  async folderInfo(id) { const f = await this.meta(id); if (f.mimeType !== FOLDER) throw err('This link is not a folder', 'notfolder'); return f; },
  async pick() {
    if (!C.API_KEY || !C.APP_ID) throw new Error('API_KEY and APP_ID for Google Picker are not configured in config.js');
    if (!g.gapi) await loadScript('https://apis.google.com/js/api.js');
    await new Promise(r => gapi.load('picker', r)); const t = await token();
    return new Promise(res => {
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER);
      new google.picker.PickerBuilder().addView(view).setOAuthToken(t).setDeveloperKey(C.API_KEY).setAppId(C.APP_ID)
        .setTitle('Choose a folder for your maps').setCallback(d => { if (d.action === 'picked') res(d.docs[0]); else if (d.action === 'cancel') res(null); }).build().setVisible(true);
    });
  }
};

g.Cloud = { configured, init, signIn, resume, signOut, token, hasToken, refresh, gas, drive, hasSession: () => !!session(), get user() { return user; }, userinfo };
})(window);
