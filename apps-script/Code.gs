/**
 * Mind Map DNU - cổng phân quyền (Google Apps Script web app)
 *
 * Vai trò: giữ DANH SÁCH NGƯỜI DÙNG và QUYỀN. Script này KHÔNG giữ token Drive của ai
 * và không đọc được sơ đồ của người dùng (sơ đồ nằm trong Drive của chính họ).
 *
 * Script properties (Project Settings -> Script properties):
 *   GOOGLE_CLIENT_ID   OAuth Client ID mà ứng dụng dùng (bắt buộc)
 *   ADMIN_EMAIL        (tuỳ chọn) đổi email admin, mặc định như bên dưới
 *   AUTO_APPROVE       (tuỳ chọn) 'true' = ai đăng ký cũng được duyệt luôn
 */
var DEFAULT_ADMIN = 'duongthanhtu.dnu@gmail.com';
var DEFAULT_PERMS = { pdf: true, xmind: true, export: true, maxMaps: 100 };

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function admin_() { return String(prop_('ADMIN_EMAIL') || DEFAULT_ADMIN).toLowerCase(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code) { return json_({ ok: false, error: code }); }
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
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

function getUser_(email) { var s = prop_('U:' + email); return s ? JSON.parse(s) : null; }
function putUser_(u) { PropertiesService.getScriptProperties().setProperty('U:' + u.email, JSON.stringify(u)); }
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

function doGet() {
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:18px system-ui;max-width:520px;margin:12vh auto;padding:0 20px"><h2>Mind Map DNU</h2><p>Cổng phân quyền đang chạy. Hãy mở ứng dụng Mind Map để sử dụng.</p></body>');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
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
      case 'admin.remove':
        PropertiesService.getScriptProperties().deleteProperty('U:' + clean_(req.email, 120).toLowerCase());
        return json_({ ok: true });
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
