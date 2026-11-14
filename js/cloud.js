/* Google sign-in (GIS), access gate (Apps Script) and Drive storage */
(function (g) {
'use strict';
const C = g.MM_CONFIG || {};
const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file';
const D = 'https://www.googleapis.com/drive/v3/files', U = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
let tc = null, tok = null, exp = 0, pending = null, user = null;

const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Không tải được ' + src)); document.head.append(s);
});
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

function configured() { return !!(C.CLIENT_ID && C.SCRIPT_URL); }

async function init() {
  await loadScript('https://accounts.google.com/gsi/client');
  tc = google.accounts.oauth2.initTokenClient({
    client_id: C.CLIENT_ID, scope: SCOPE, prompt: '',
    callback: r => {
      const p = pending; pending = null; if (!p) return;
      if (r.error) return p.rej(Object.assign(new Error(r.error_description || r.error), { code: r.error }));
      tok = r.access_token; exp = Date.now() + (r.expires_in || 3600) * 1000;
      try { sessionStorage.setItem('mm-tok', JSON.stringify({ tok, exp })); } catch (e) {}
      p.res(tok);
    },
    error_callback: e => { const p = pending; pending = null; p && p.rej(Object.assign(new Error(e.type || 'popup_error'), { code: e.type })); }
  });
  try { const s = JSON.parse(sessionStorage.getItem('mm-tok') || 'null'); if (s && s.exp - Date.now() > 120000) { tok = s.tok; exp = s.exp; } } catch (e) {}
}
const request = prompt => new Promise((res, rej) => { pending = { res, rej }; tc.requestAccessToken({ prompt, hint: lsGet('mm-email') || undefined }); });

async function signIn() { await request(lsGet('mm-email') ? '' : 'select_account'); return userinfo(); }
async function switchAccount() { await request('select_account'); return userinfo(); }
async function userinfo() {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('Không lấy được thông tin tài khoản Google');
  user = await r.json(); lsSet('mm-email', user.email); return user;
}
const hasToken = () => !!tok && exp - Date.now() > 60000;
const tokenLeft = () => tok ? exp - Date.now() : 0;
async function token() { if (hasToken()) return tok; return request(''); }
function signOut() {
  try { if (tok) google.accounts.oauth2.revoke(tok, () => {}); } catch (e) {}
  tok = null; exp = 0; user = null; try { sessionStorage.removeItem('mm-tok'); } catch (e) {} try { localStorage.removeItem('mm-email'); } catch (e) {}
}
/** gia hạn token ngầm; phải gọi từ một thao tác của người dùng (click/phím) để trình duyệt không chặn popup */
async function renew() { await request(''); }

/* ---- Apps Script gate ---- */
async function gas(action, extra) {
  const t = await token();
  let r; try { r = await fetch(C.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: t }, extra || {})) }); }
  catch (e) { throw new Error('Không kết nối được máy chủ phân quyền (Apps Script). Kiểm tra SCRIPT_URL và mạng.'); }
  let j; try { j = await r.json(); } catch (e) { throw new Error('Máy chủ phân quyền trả về dữ liệu lạ. Hãy kiểm tra Apps Script đã triển khai "Anyone" chưa.'); }
  if (!j.ok) throw Object.assign(new Error(j.detail || j.error || 'Lỗi'), { code: j.error });
  return j;
}

/* ---- Drive ---- */
async function dfetch(url, opt, retry = true) {
  const t = await token(); opt = opt || {}; opt.headers = Object.assign({}, opt.headers, { Authorization: 'Bearer ' + t });
  let r; try { r = await fetch(url, opt); } catch (e) { throw Object.assign(new Error('Mất kết nối mạng'), { code: 'net' }); }
  if (r.status === 401 && retry) { tok = null; return dfetch(url, opt, false); }
  if (!r.ok) {
    let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
    throw Object.assign(new Error(m || ('Drive lỗi ' + r.status)), { code: r.status });
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
  async folderInfo(id) { const f = await this.meta(id); if (f.mimeType !== FOLDER) throw Object.assign(new Error('Liên kết này không phải thư mục'), { code: 'notfolder' }); return f; },
  async pick() {
    if (!C.API_KEY || !C.APP_ID) throw new Error('Chưa cấu hình API_KEY và APP_ID cho Google Picker trong config.js');
    if (!g.gapi) await loadScript('https://apis.google.com/js/api.js');
    await new Promise(r => gapi.load('picker', r)); const t = await token();
    return new Promise(res => {
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER);
      new google.picker.PickerBuilder().addView(view).setOAuthToken(t).setDeveloperKey(C.API_KEY).setAppId(C.APP_ID)
        .setTitle('Chọn thư mục lưu sơ đồ').setCallback(d => { if (d.action === 'picked') res(d.docs[0]); else if (d.action === 'cancel') res(null); }).build().setVisible(true);
    });
  }
};

g.Cloud = { configured, init, signIn, switchAccount, signOut, token, hasToken, tokenLeft, renew, gas, drive, get user() { return user; }, userinfo };
})(window);
