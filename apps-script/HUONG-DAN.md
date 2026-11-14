# Mind Map DNU: hướng dẫn triển khai

Ứng dụng là một trang web tĩnh (GitHub Pages) + một Google Apps Script nhỏ làm "cổng phân quyền".

```
Trình duyệt ──đăng nhập Google──▶ Google (token drive.file, 1 giờ)
     │ ├──đọc/ghi sơ đồ──▶ Google Drive CỦA CHÍNH NGƯỜI DÙNG (thư mục họ chọn)
     │ └──"tôi là ai, có được dùng không, quyền gì?"──▶ Apps Script của admin
```

* Admin (`duongthanhtu.dnu@gmail.com`) cố định trong `Code.gs`. Người khác đăng nhập → gửi yêu cầu → admin duyệt và đặt quyền (PDF / XMind / xuất tệp / số sơ đồ tối đa) ngay trong ứng dụng, mục **Quản trị**.
* Apps Script chỉ giữ danh sách người dùng và quyền. Nó **không** giữ token Drive và không đọc được sơ đồ của ai.
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
   * Không cần Client secret. Sao chép **Client ID**.
5. (Tuỳ chọn, cho nút chọn thư mục) **Create credentials → API key**: giới hạn *Application restrictions* = HTTP referrers `https://<tên-github>.github.io/*`, *API restrictions* = Google Picker API. **Project number** của project (trang Dashboard) chính là `APP_ID`.

## 3. Apps Script: cổng phân quyền
1. Đăng nhập **đúng tài khoản admin** (`duongthanhtu.dnu@gmail.com`), mở <https://script.google.com> → New project.
2. Dán toàn bộ `Code.gs` thay nội dung mặc định.
3. Project Settings → **Script properties** → thêm `GOOGLE_CLIENT_ID` = Client ID ở bước 2. (Tuỳ chọn: `ADMIN_EMAIL` để đổi admin; `AUTO_APPROVE` = `true` để ai đăng ký cũng được duyệt luôn.)
4. Chạy hàm `authorize_` một lần (Run) để cấp quyền cho script (kết nối ngoài, lưu thuộc tính).
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
* **Token 1 giờ**: ứng dụng tự gia hạn ở lần bấm chuột kế tiếp (trình duyệt chỉ cho mở popup gia hạn khi có thao tác của người dùng). Nếu hết hạn lúc đang gõ, bản nháp vẫn được giữ trên máy, dòng trạng thái sẽ cho bạn bấm để gia hạn.
* **Phân quyền là "mềm"**: trang là mã tĩnh, nên người rành kỹ thuật có thể sửa mã trên máy mình để bỏ qua kiểm tra quyền (PDF/XMind/xuất tệp/giới hạn số sơ đồ). Họ chỉ ghi được vào Drive của chính họ, nên không ảnh hưởng ai khác. Việc cho phép đăng nhập/đăng ký và danh sách người dùng thì do máy chủ Apps Script quyết định.
* Xung đột nhiều thiết bị: trước khi lưu, app so thời gian sửa trên Drive, nếu bản Drive mới hơn sẽ hỏi trước khi ghi đè.
