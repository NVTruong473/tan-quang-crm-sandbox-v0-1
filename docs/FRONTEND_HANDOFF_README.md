# Cách mở CRM Sandbox đúng cách

## Một lần bấm

- macOS: bấm đúp `START_CRM.command`.
- Windows: bấm đúp `START_CRM.bat`.

Trình duyệt sẽ tự mở CRM. Không cần mở Terminal hoặc gõ lệnh.

Nếu macOS hỏi xác nhận bảo mật lần đầu, bấm chuột phải vào file → **Open** → **Open**.

Không mở `index.html` bằng cách double-click (`file://`). Trình duyệt sẽ chặn request Supabase Auth và hiển thị `Failed to fetch`.

Sau khi giải nén gói bàn giao, mở Terminal tại thư mục chứa `index.html` và chạy:

```bash
python3 -m http.server 4173
```

Sau đó mở:

`http://localhost:4173/index.html`

Đăng nhập bằng tài khoản admin được bàn giao riêng. Tài khoản đã được kiểm tra trực tiếp với Supabase Auth và trả về HTTP 200.

Không đưa mật khẩu admin hoặc API key vào báo cáo công khai.
