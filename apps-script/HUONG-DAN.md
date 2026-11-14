# Mind Map: hướng dẫn triển khai

Ứng dụng là một trang web tĩnh (GitHub Pages) + một Google Apps Script nhỏ làm "cổng phân quyền".

```
Trình duyệt ──đăng nhập Google──▶ Google (token drive.file, 1 giờ)
     │ ├──đọc/ghi sơ đồ──▶ Google Drive CỦA CHÍNH NGƯỜI DÙNG (thư mục họ chọn)
     │ └──"tôi là ai, có được dùng không, quyền gì?"──▶ Apps Script của admin
```

* Admin (`duongthanhtu.dnu@gmail.com`) cố định trong `Code.gs`. Người khác đăng nhập → gửi yêu cầu → admin duyệt và đặt quyền (PDF / XMind / xuất tệp / số sơ đồ tối đa) ngay trong ứng dụng, mục **Quản trị**.
* Apps Script giữ **danh sách người dùng và quyền**, và (để người dùng không phải đăng nhập lại mỗi giờ) giữ cả **khoá làm mới (refresh token)** của từng người. Khoá này chỉ có quyền `drive.file`: truy cập các tệp do ứng dụng tạo và thư mục người dùng chọn, không phải toàn bộ Drive. **Hệ quả về quyền riêng tư:** về kỹ thuật, bạn (chủ Apps Script) có thể truy cập các tệp sơ đồ của người dùng; hãy thông báo điều này cho họ. Người dùng thu hồi bằng *Đăng xuất* hoặc tại <https://myaccount.google.com/permissions>; bạn xoá một người dùng trong mục Quản trị thì khoá của họ cũng bị thu hồi.
* Quyền `drive.file` thuộc loại không nhạy cảm, nên không cần Google xác minh ứng dụng và không bị giới hạn 100 người dùng thử.

## 1. Đưa code lên GitHub Pages
1. Tạo repo (ví dụ `mindmap`), đẩy toàn bộ thư mục này lên nhánh `main`.
2. Settings → Pages → Deploy from a branch → `main` / root. Địa chỉ sẽ là `https://<tên-github>.github.io/mindmap/`.

## 2. Google Cloud: lấy Client ID
1. Vào <https://console.cloud.google.com>, tạo project (ví dụ `mindmap-dnu`).
2. **APIs & Services → Library**: bật **Google Drive API** (và **Google Picker API** nếu muốn nút "Chọn thư mục từ Drive").
3. **OAuth consent screen**: User type **External**; điền tên ứng dụng, email hỗ trợ; Scopes: `openid`, `email`, `profile`, `.../auth/drive.file`; cuối cùng bấm **Publish app** (chuyển sang *In production*, nếu để *Testing* thì chỉ test users đăng nhập được).
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   * *Authorized JavaScript origins*: `https://<tên-github>.github.io` (chỉ domain, không có đường dẫn; thêm `http://localhost:8000` nếu muốn thử máy bạn).
   * Sao chép **Client ID** và **Client secret** (bấm vào client đã tạo; nếu secret đã lộ ở đâu đó, hãy *Add secret* mới rồi vô hiệu hoá secret cũ). Client secret chỉ được dán vào **Script properties của Apps Script**, tuyệt đối không đưa vào `config.js` hay lên GitHub.
5. (Tuỳ chọn, cho nút chọn thư mục) **Create credentials → API key**: giới hạn *Application restrictions* = HTTP referrers `https://<tên-github>.github.io/*`, *API restrictions* = Google Picker API. **Project number** của project (trang Dashboard) chính là `APP_ID`.

## 3. Apps Script: cổng phân quyền
1. Đăng nhập **đúng tài khoản admin** (`duongthanhtu.dnu@gmail.com`), mở <https://script.google.com> → New project.
2. Dán toàn bộ `Code.gs` thay nội dung mặc định.
3. Project Settings → **Script properties** → thêm 2 mục bắt buộc: `GOOGLE_CLIENT_ID` = Client ID, và `GOOGLE_CLIENT_SECRET` = Client secret ở bước 2. (Tuỳ chọn: `ADMIN_EMAIL` để đổi admin; `AUTO_APPROVE` = `true` để ai đăng ký cũng được duyệt luôn.)
4. Chạy hàm `authorize` một lần (Run) để cấp quyền cho script (kết nối ngoài, lưu thuộc tính).
5. **Deploy → New deployment → Web app**: *Execute as*: **Me**; *Who has access*: **Anyone**. Sao chép URL kết thúc bằng `/exec`.
6. Mỗi lần sửa `Code.gs`, phải **Deploy → Manage deployments → Edit → New version**.

## 4. Điền `config.js` rồi đẩy lên GitHub
```js
window.MM_CONFIG = {
  CLIENT_ID:  '123...apps.googleusercontent.com',
  SCRIPT_URL: 'https://script.google.com/macros/s/.../exec',
  API_KEY:    '',   // tuỳ chọn
  APP_ID:     ''    // tuỳ chọn
};
```

## 5. Dùng
* **Admin** mở trang, đăng nhập bằng Google, vào mục **Google Drive** để chọn/tạo thư mục lưu của mình.
* **Người dùng mới**: đăng nhập → "Gửi yêu cầu đăng ký" → chờ admin duyệt (admin thấy ở **Quản trị**, bấm *Duyệt*). Có thể thêm trước theo email.
* Mỗi người vào **Google Drive** trong thanh bên để liên kết thư mục của họ: *Chọn thư mục từ Drive* (Picker), *Tạo thư mục mới*, hoặc dán liên kết (chỉ chạy nếu app đã có quyền với thư mục đó, xem lưu ý dưới).

## Lưu ý quan trọng
* **Quyền `drive.file`**: ứng dụng chỉ thấy tệp do chính nó tạo, hoặc thư mục/tệp người dùng chọn qua Picker. Vì vậy dán link một thư mục bất kỳ sẽ báo "chưa có quyền", đây là cơ chế an toàn của Google, không phải lỗi. Muốn bỏ giới hạn này phải dùng scope `drive` (nhạy cảm, cần Google xác minh), không khuyến nghị.
* **Kết nối liên tục**: lần đăng nhập đầu, Google cấp một mã uỷ quyền; Apps Script đổi lấy khoá làm mới và cấp cho trình duyệt một "khoá phiên" riêng (tối đa 6 thiết bị/người). Sau đó trình duyệt tự xin token 1 giờ mới qua Apps Script, không popup, không đăng nhập lại; mở lại trang là vào thẳng. Nếu người dùng thu hồi quyền ở Google, hoặc admin khoá/xoá họ, kết nối dừng và họ phải đăng nhập lại.
* **Tài khoản đã từng cấp quyền trước đó (ví dụ admin đã thử bản cũ)**: Google chỉ trả khoá làm mới ở lần cấp quyền đầu tiên. Nếu app báo "Google chưa cấp quyền kết nối lâu dài", vào <https://myaccount.google.com/permissions>, chọn ứng dụng, bấm **Remove access**, rồi đăng nhập lại.
* **Sau khi cập nhật `Code.gs`**: Deploy → Manage deployments → ✏️ → Version: **New version** → Deploy (URL `/exec` giữ nguyên).
* **Phân quyền là "mềm"**: trang là mã tĩnh, nên người rành kỹ thuật có thể sửa mã trên máy mình để bỏ qua kiểm tra quyền (PDF/XMind/xuất tệp/giới hạn số sơ đồ). Họ chỉ ghi được vào Drive của chính họ, nên không ảnh hưởng ai khác. Việc cho phép đăng nhập/đăng ký và danh sách người dùng thì do máy chủ Apps Script quyết định.
* Xung đột nhiều thiết bị: trước khi lưu, app so thời gian sửa trên Drive, nếu bản Drive mới hơn sẽ hỏi trước khi ghi đè.


## Trợ lý AI (Gemini)
* Mỗi người tự tạo **API key** tại <https://aistudio.google.com/apikey> và dán vào *Settings → AI (Gemini)* (hoặc ngay trong khung AI ở bên trái editor). Key chỉ nằm trong `localStorage` của trình duyệt đó và chỉ được gửi tới `generativelanguage.googleapis.com`. Apps Script và admin **không** nhận được key. Đổi máy thì nhập lại key.
* Khi dùng AI, nội dung sơ đồ (chữ của các nhánh và ghi chú ngắn) được gửi tới Google theo điều khoản Gemini API của gói mà key đó thuộc về. Hãy nhắc người dùng điều này, và khuyên không lưu key trên máy dùng chung.
* Danh sách model được tải từ Google khi lưu key, nên không phụ thuộc tên model cố định trong mã.

## Giao diện & font
* Font toàn ứng dụng là **Google Sans** (tải từ Google Fonts, gói tiếng Việt đầy đủ). Ảnh PNG/SVG xuất ra được nhúng font này.
* Ảnh nền trang giới thiệu: `bg-earth.webp` (giữ nguyên bản gốc).


## Chế độ Testing và Publish (quan trọng)
* Khi ứng dụng Google ở chế độ **Testing**: (1) chỉ những email trong **Audience → Test users** mới đăng nhập được, người khác thấy lỗi `Error 403: access_denied`; (2) **khoá làm mới chỉ sống 7 ngày**, nên "kết nối liên tục" bị gián đoạn mỗi tuần và người dùng phải đăng nhập lại.
* Để kết nối liên tục thật sự và để bất kỳ ai được bạn duyệt đều đăng nhập được, hãy **Publish app** (Audience → Publish app → Confirm) để chuyển sang *In production*. Vì chỉ xin các quyền không nhạy cảm (`openid`, `email`, `profile`, `drive.file`) nên không cần Google xác minh.
* Nếu nút Publish bị xám: kiểm tra **Branding** đã điền *App name*, *User support email*, *Developer contact*; tải lại trang (Cmd+Shift+R); xem **Verification Center** có mục nào đang chờ; thử bằng cửa sổ ẩn danh.

## Nhiều sheet và Outliner
* Một tệp sơ đồ có thể chứa nhiều **sheet** (thanh tab ở đáy editor: bấm để mở, bấm đúp để đổi tên, chuột phải để nhân đôi/xoá, dấu ＋ để thêm). Tệp XMind nhiều sheet được nhập thành một tệp nhiều sheet, và xuất `.xmind`/Markdown/JSON gồm tất cả sheet. Tệp cũ (một sơ đồ) tự mở như một tệp 1 sheet.
* **Outliner** (nút ở góc phải thanh đáy): xem và sửa sơ đồ dưới dạng danh sách thụt lề. Enter: thêm chủ đề; Tab / Shift+Tab: thụt vào / ra; Backspace trên dòng trống: xoá; ↑ ↓: di chuyển.
