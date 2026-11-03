# Tân Quang CRM Sandbox V0.1

Sandbox CRM dùng dữ liệu tổng hợp để kiểm thử giao diện và luồng Customer 360. Không dùng số liệu trong bản này để ra quyết định kinh doanh.

## Truy cập

- Frontend: GitHub Pages.
- Đăng nhập: Supabase Auth bằng email và mật khẩu.
- Phân quyền: Edge Function chỉ trả dữ liệu khi tài khoản đã được xác thực và có `app_metadata.role = admin`, `app_metadata.environment = sandbox`.
- Phiên đăng nhập được giữ trong `sessionStorage`, không lưu mật khẩu trong trình duyệt.
- Production Gate vẫn `BLOCKED`.

Trang công khai chỉ chứa thông tin giới thiệu sandbox và form đăng nhập. Bốn tệp CSV không còn nằm trong GitHub Pages; chúng được đóng gói trong Supabase Edge Function và chỉ trả về sau kiểm tra quyền quản trị.

## Kiến trúc

```text
GitHub Pages (public shell)
        |
        +-- Supabase Auth: email/password -> user access token
        |
        +-- Edge Function /crm-sandbox/data/*
                |-- xác minh token qua Auth server
                |-- kiểm tra app_metadata role/environment
                +-- trả dữ liệu SYNTHETIC hoặc 401
```

`dist/supabase-config.js` chỉ chứa publishable key, loại khóa được Supabase thiết kế để dùng trong trình duyệt. Secret key và service-role key tuyệt đối không được đưa vào source control.

## Triển khai Edge Function

```bash
npx supabase@2.72.7 functions deploy crm-sandbox \
  --project-ref fxwgehtnytdqqwabgemw \
  --no-verify-jwt
```

`--no-verify-jwt` là có chủ đích: function tự xác minh access token với Supabase Auth và kiểm tra vai trò admin, đồng thời cho phép endpoint `/health` công khai. Không được thêm route dữ liệu nào mà bỏ qua `authenticatedAdmin()`.

## Ranh giới bảo mật

- Đây là sandbox read-only, không có thao tác tạo/sửa/xóa dữ liệu CRM.
- Dữ liệu đều mang nhãn `SANDBOX`, `SYNTHETIC`, `business_approved=FALSE`.
- Không có dữ liệu tài chính thật hoặc scoring production.
- Tài khoản admin phải được thu hồi hoặc đổi mật khẩu sau demo/handover.
