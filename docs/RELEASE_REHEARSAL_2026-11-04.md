# Release Rehearsal — 2026-11-04

Phạm vi: Supabase Sandbox V0.1. Test Pack chỉ dùng 8 bản ghi synthetic có tiền tố `SYN-RH-`; không chứa dữ liệu khách hàng thật hay credential.

## Tiêu chí pass

Các gate an ninh trọng yếu phải đạt **100%**. Toàn bộ rehearsal đạt khi ít nhất 95% các kiểm tra tổng thể pass và không có critical gate nào fail.

| # | Kiểm tra | Kết quả |
|---|---|---|
| 1 | Hai admin khác user xác thực thành công | PASS |
| 2 | Registry không xác thực trả 401 | PASS |
| 3 | Release registry không xác thực trả 401 | PASS |
| 4 | Dashboard data không xác thực trả 401 | PASS |
| 5 | CSV thiếu cột bắt buộc bị server từ chối 422 | PASS |
| 6 | Bốn CSV Test Pack được server validate/materialize | PASS — 2 dòng/bảng |
| 7 | Admin A tạo release `PENDING_APPROVAL` | PASS |
| 8 | Admin A tự phê duyệt bị chặn `maker_checker_separation_required` | PASS |
| 9 | Admin B phê duyệt release | PASS |
| 10 | Admin B kích hoạt release sandbox | PASS |
| 11 | Audit có `RELEASE_CREATED`, `RELEASE_APPROVED`, `RELEASE_ACTIVATED` | PASS |
| 12 | Bốn endpoint dashboard đọc đúng `SYN-RH-001` từ release active | PASS |

Kết quả: **12/12 = 100%**, vượt ngưỡng 95%. Active release rehearsal là `SBX-RH-3754808702`.

## Lỗi phát hiện và đã sửa trong rehearsal

1. Edge Function dùng service role khi gọi RPC nên mất JWT của admin; maker–checker không thể thực thi. Đã thay bằng client RPC mang JWT của người dùng.
2. Đường dẫn `data/<table>.csv` được map sai sang key materialization và gây HTTP 500 sau activation. Đã chuẩn hóa về basename bảng trước khi đọc payload.

Production Gate vẫn `BLOCKED`; rehearsal chỉ kích hoạt release sandbox synthetic.
