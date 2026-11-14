/**
 * Mind Map - cổng phân quyền + giữ kết nối Google Drive (Google Apps Script web app)
 *
 * Làm 2 việc:
 *  1) Giữ DANH SÁCH NGƯỜI DÙNG và QUYỀN (admin duyệt, đặt quyền).
 *  2) Giữ "khoá làm mới" (refresh token) của từng người dùng để họ KHÔNG phải đăng nhập lại mỗi giờ.
 *     Khoá này chỉ có quyền drive.file: truy cập các tệp do chính ứng dụng tạo (và thư mục người dùng chọn).
 *     Người dùng thu hồi được bất cứ lúc nào (Đăng xuất, hoặc myaccount.google.com/permissions).
 *
 * Script properties (Project Settings -> Script properties):
 *   GOOGLE_CLIENT_ID      OAuth Client ID (bắt buộc)
 *   GOOGLE_CLIENT_SECRET  Client secret của đúng Client ID đó (bắt buộc)
 *   ADMIN_EMAIL           (tuỳ chọn) đổi email admin, mặc định bên dưới
 *   AUTO_APPROVE          (tuỳ chọn) 'true' = ai đăng ký cũng được duyệt luôn
 */
var DEFAULT_ADMIN = 'duongthanhtu.dnu@gmail.com';
var DEFAULT_PERMS = { pdf: true, xmind: true, export: true, maxMaps: 100 };
var MAX_SESSIONS = 6;      // số thiết bị/trình duyệt được ghi nhớ cho mỗi người

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }
function delProp_(k) { PropertiesService.getScriptProperties().deleteProperty(k); }
function admin_() { return String(prop_('ADMIN_EMAIL') || DEFAULT_ADMIN).toLowerCase(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, detail) { return json_({ ok: false, error: code, detail: detail || undefined }); }
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function post_(payload) {
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: payload, muteHttpExceptions: true });
  try { return JSON.parse(r.getContentText() || '{}'); } catch (e) { return {}; }
}

/** Xác thực access token của Google -> email đã xác minh (và chắc chắn token cấp cho đúng ứng dụng này). */
function verify_(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache(), key = 'tk:' + hash_(token), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  var t = JSON.parse(r.getContentText()), cid = prop_('GOOGLE_CLIENT_ID');
  if (!cid || (t.aud !== cid && t.azp !== cid)) return null;
  if (!t.email || String(t.email_verified) !== 'true') return null;
  var u = { email: String(t.email).toLowerCase() };
  cache.put(key, JSON.stringify(u), Math.max(1, Math.min(300, parseInt(t.expires_in || '0', 10) - 5)));
  return u;
}

/* ---------- người dùng & quyền ---------- */
function getUser_(email) { var s = prop_('U:' + email); return s ? JSON.parse(s) : null; }
function putUser_(u) { setProp_('U:' + u.email, JSON.stringify(u)); }
function allUsers_() {
  var p = PropertiesService.getScriptProperties().getProperties(), out = [];
  for (var k in p) if (k.indexOf('U:') === 0) { try { out.push(JSON.parse(p[k])); } catch (e) {} }
  return out;
}
function clean_(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').slice(0, n || 200).trim(); }
function perms_(p) {
  p = p || {};
  return {
    pdf: p.pdf !== false, xmind: p.xmind !== false, export: p.export !== false,
    maxMaps: Math.max(0, Math.min(100000, parseInt(p.maxMaps != null ? p.maxMaps : DEFAULT_PERMS.maxMaps, 10) || 0))
  };
}
function view_(u) {
  var isAdmin = u.email === admin_();
  return {
    email: u.email, name: u.name || '', role: isAdmin ? 'admin' : 'user', status: isAdmin ? 'active' : u.status,
    perms: isAdmin ? { pdf: true, xmind: true, export: true, maxMaps: 100000 } : perms_(u.perms),
    folderId: u.folderId || '', folderName: u.folderName || ''
  };
}

/* ---------- giữ kết nối Drive (refresh token) ---------- */
function getKeys_(email) { var s = prop_('K:' + email); try { return s ? JSON.parse(s) : []; } catch (e) { return []; } }
function setKeys_(email, list) { if (list.length) setProp_('K:' + email, JSON.stringify(list)); else delProp_('K:' + email); }
function cacheToken_(email, token, expiresIn) {
  CacheService.getScriptCache().put('at:' + email, JSON.stringify({ t: token, exp: Date.now() + (expiresIn || 3600) * 1000 }), 3000);
}
function dropLink_(email) {
  var rt = prop_('R:' + email);
  if (rt) { try { UrlFetchApp.fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'post', muteHttpExceptions: true }); } catch (e) {} }
  delProp_('R:' + email); delProp_('K:' + email); CacheService.getScriptCache().remove('at:' + email);
}

/** Đăng nhập lần đầu: đổi "mã uỷ quyền" của Google lấy token, lưu khoá làm mới, cấp "khoá phiên" cho thiết bị này. */
function link_(req, lock) {
  if (!prop_('GOOGLE_CLIENT_ID') || !prop_('GOOGLE_CLIENT_SECRET')) return fail_('no_secret');
  var t = post_({ code: String(req.code || ''), client_id: prop_('GOOGLE_CLIENT_ID'), client_secret: prop_('GOOGLE_CLIENT_SECRET'), redirect_uri: 'postmessage', grant_type: 'authorization_code' });
  if (!t.access_token) return fail_('exchange', t.error_description || t.error || '');
  var who = verify_(t.access_token); if (!who) return fail_('bad_token');
  lock.waitLock(20000);
  var email = who.email, rt = t.refresh_token || prop_('R:' + email);
  if (!rt) return fail_('no_refresh');       // Google chỉ trả khoá làm mới ở lần cấp quyền đầu tiên
  if (t.refresh_token) setProp_('R:' + email, t.refresh_token);
  var sk = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var list = getKeys_(email); list.push({ h: hash_(sk), t: Date.now() }); if (list.length > MAX_SESSIONS) list = list.slice(-MAX_SESSIONS);
  setKeys_(email, list); cacheToken_(email, t.access_token, t.expires_in);
  return json_({ ok: true, email: email, sk: sk, access_token: t.access_token, expires_in: t.expires_in || 3600 });
}

/** Các lần sau: đưa "khoá phiên" -> nhận access token mới (không cần popup, không cần bấm gì). */
function keep_(req) {
  var email = clean_(req.email, 120).toLowerCase(), sk = String(req.sk || '');
  if (!email || sk.length < 32) return fail_('bad_session');
  var h = hash_(sk);
  if (!getKeys_(email).some(function (x) { return x.h === h; })) return fail_('bad_session');
  var u = getUser_(email); if (u && u.status === 'blocked' && email !== admin_()) return fail_('blocked');
  var cache = CacheService.getScriptCache(), c = cache.get('at:' + email);
  if (c) { c = JSON.parse(c); var left = Math.floor((c.exp - Date.now()) / 1000); if (left > 600) return json_({ ok: true, access_token: c.t, expires_in: left }); }
  var rt = prop_('R:' + email); if (!rt) return fail_('relink');
  var t = post_({ client_id: prop_('GOOGLE_CLIENT_ID'), client_secret: prop_('GOOGLE_CLIENT_SECRET'), refresh_token: rt, grant_type: 'refresh_token' });
  if (!t.access_token) {
    if (t.error === 'invalid_grant') { dropLink_(email); return fail_('relink'); }   // người dùng đã thu hồi quyền ở Google
    return fail_('google', t.error || 'unknown');
  }
  cacheToken_(email, t.access_token, t.expires_in);
  return json_({ ok: true, access_token: t.access_token, expires_in: t.expires_in || 3600 });
}

/** Đăng xuất: xoá khoá phiên của thiết bị này; hết thiết bị thì thu hồi luôn khoá làm mới. */
function unlink_(req, lock) {
  var email = clean_(req.email, 120).toLowerCase(), sk = String(req.sk || ''); if (!email || sk.length < 32) return json_({ ok: true });
  lock.waitLock(20000);
  var h = hash_(sk), list = getKeys_(email).filter(function (x) { return x.h !== h; });
  if (!list.length || req.all) dropLink_(email); else setKeys_(email, list);
  return json_({ ok: true });
}

function doGet() {
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:18px system-ui;max-width:520px;margin:12vh auto;padding:0 20px"><h2>Mind Map</h2><p>The access gateway is running. Open the Mind Map app to use it.</p></body>');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.action === 'link') return link_(req, lock);
    if (req.action === 'keep') return keep_(req);
    if (req.action === 'unlink') return unlink_(req, lock);

    var who = verify_(req.token);
    if (!who) return fail_('bad_token');
    var isAdmin = who.email === admin_();
    lock.waitLock(20000);
    var u = getUser_(who.email), now = Date.now();

    if (isAdmin && !u) { u = { email: who.email, status: 'active', created: now }; }
    switch (req.action) {
      case 'me':
        if (!u) return json_({ ok: true, me: { email: who.email, status: 'none', role: 'user', perms: perms_({}) } });
        if (req.name && !u.name) u.name = clean_(req.name, 80);
        if (!u.seen || now - u.seen > 10 * 60000 || isAdmin) { u.seen = now; putUser_(u); }
        return json_({ ok: true, me: view_(u) });

      case 'register':
        if (!u) {
          u = { email: who.email, name: clean_(req.name, 80), note: clean_(req.note, 300), status: prop_('AUTO_APPROVE') === 'true' ? 'active' : 'pending', created: now, seen: now, perms: DEFAULT_PERMS };
          putUser_(u);
        }
        return json_({ ok: true, me: view_(u) });

      case 'saveSettings':
        if (!u || view_(u).status !== 'active') return fail_('not_active');
        u.folderId = clean_(req.folderId, 120); u.folderName = clean_(req.folderName, 160); putUser_(u);
        return json_({ ok: true, me: view_(u) });
    }

    if (!isAdmin) return fail_('forbidden');
    switch (req.action) {
      case 'admin.list':
        return json_({ ok: true, users: allUsers_().filter(function (x) { return x.email !== admin_(); }).sort(function (a, b) { return (a.created || 0) - (b.created || 0); }).map(function (x) {
          return { email: x.email, name: x.name || '', note: x.note || '', status: x.status, perms: perms_(x.perms), created: x.created || 0, seen: x.seen || 0, folderName: x.folderName || '' };
        }) });

      case 'admin.add': {
        var em = clean_(req.email, 120).toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em === admin_()) return fail_('bad_email');
        var ex = getUser_(em) || { email: em, created: now };
        ex.status = 'active'; ex.perms = perms_(req.perms || ex.perms); if (req.name) ex.name = clean_(req.name, 80);
        putUser_(ex); return json_({ ok: true });
      }
      case 'admin.set': {
        var t = getUser_(clean_(req.email, 120).toLowerCase()); if (!t) return fail_('not_found');
        var p = req.patch || {};
        if (p.status === 'active' || p.status === 'blocked' || p.status === 'pending') t.status = p.status;
        if (p.perms) t.perms = perms_(Object.assign({}, perms_(t.perms), p.perms));
        putUser_(t); return json_({ ok: true });
      }
      case 'admin.remove': {
        var rem = clean_(req.email, 120).toLowerCase();
        delProp_('U:' + rem); dropLink_(rem);          // xoá người dùng cũng thu hồi khoá kết nối của họ
        return json_({ ok: true });
      }
    }
    return fail_('unknown_action');
  } catch (err) {
    return json_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/** Chạy tay MỘT LẦN trong trình soạn thảo để Google hỏi quyền (UrlFetch + Properties + Cache + Lock). */
function authorize() { UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=x', { muteHttpExceptions: true }); LockService.getScriptLock(); CacheService.getScriptCache(); PropertiesService.getScriptProperties(); }
