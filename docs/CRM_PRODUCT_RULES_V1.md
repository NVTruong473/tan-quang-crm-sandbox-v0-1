# Tân Quang CRM — Product Rules V1

Ngày hiệu lực: 2026-11-04. Phạm vi: Sandbox V0.1 và mọi phiên bản nhập liệu tiếp theo.

## 1. Một nguồn dữ liệu, nhiều phiên bản bất biến

- Mỗi lần người dùng chọn XLSX/CSV là một `Import Version` mới, có fingerprint SHA-256, người thao tác, thời điểm, tên nguồn và báo cáo kiểm tra.
- Không được ghi đè nguồn cũ hoặc thay đổi dashboard đang phát hành khi chưa có thao tác **Phát hành** rõ ràng.
- Dashboard luôn đọc đúng một `Active Release`; giao diện luôn hiển thị thời điểm và trạng thái của release đó bằng ngôn ngữ nghiệp vụ.
- Người dùng sửa file trên máy phải chọn lại file và chạy **Kiểm tra**. Trình duyệt không được tự theo dõi hoặc tự đồng bộ file cục bộ.

## 2. Luồng bắt buộc

`Chọn file → Kiểm tra cục bộ (chỉ hỗ trợ) → Server validate → Server materialize → Tạo release → Phê duyệt chéo → Kích hoạt sandbox → Dashboard tự nạp Active Release`

- Chỉ bước sau cùng mới đổi số liệu đang công bố.
- Browser preflight không phải bằng chứng phát hành. Server kiểm lại chữ ký XLSX/CSV, số lượng/giới hạn dữ liệu, Data Contract, kiểu số, khóa trùng và quan hệ `customer_id` trước khi có thể tạo release.
- Server không thực thi macro, không đánh giá công thức XLSX, từ chối XML DTD/entity, archive mã hóa/không an toàn và giới hạn kích thước sau giải nén. File lớn hơn giới hạn đồng bộ phải đi qua worker/queue chuyên dụng, không được tự nới giới hạn.
- Một phiên không đạt Data Contract bị server từ chối và không được lưu/version hóa như dữ liệu hợp lệ; không được suy diễn giá trị thiếu hoặc âm thầm bỏ cột trọng yếu.
- Chỉ materialization bất biến, có checksum riêng, mới được dashboard của release `ACTIVE` đọc. Dashboard không bao giờ đọc trực tiếp file upload.
- Người tạo release không được tự phê duyệt release đó (maker–checker); mọi chuyển trạng thái có audit log append-only.
- `Nạp xem trước Sandbox` không lưu file, không ảnh hưởng production và hết hiệu lực khi kết thúc phiên trình duyệt.

## 3. Data Contract tối thiểu hiện tại

| Bảng | Khóa/cột tối thiểu | Mục đích |
|---|---|---|
| `customer_360` | `customer_id`, `customer_name`, `revenue`, `gross_profit`, `outstanding`, `weighted_pipeline` | Customer 360 |
| `scoring_sandbox` | `customer_id`, `total_score`, `segment` | Chỉ mô phỏng sandbox |
| `opportunities` | `customer_id`, `opportunity_name`, `estimated_value`, `probability_pct`, `stage`, `status` | Pipeline |
| `crm_activities` | `customer_id`, `activity_date`, `activity_type`, `summary`, `outcome`, `owner` | Hoạt động CRM |

## 4. Bảo mật và quyền riêng tư

- File nghiệp vụ chỉ được lưu sau server validation, trong private storage; browser không có policy Storage trực tiếp. Edge Function dùng service role tối thiểu cần thiết, còn bảng registry/materialization đều bật RLS.
- Không lưu service key, khóa OpenRouter hay mật khẩu trong frontend, GitHub, Excel, log hoặc tài liệu công khai.
- LLM bị tắt mặc định. Khi được bật, nó chỉ nhận metadata/dictionary đã được phê duyệt hoặc dữ liệu đã giảm nhận diện; không nhận file thô mặc định.
- LLM chỉ trả về JSON schema cho đề xuất mapping hoặc giải thích lỗi. Kết quả phải qua deterministic validation và phê duyệt của quản trị viên.
- LLM không được tự tính KPI, tự tạo số liệu thiếu, tự đổi scoring, tự ghi dữ liệu hoặc tự phát hành release.

## 5. Quy tắc hiển thị

- Người dùng nghiệp vụ thấy nhãn dễ hiểu: “Bản thử nghiệm”, “Chỉ xem và kiểm tra”, “Cần xử lý”.
- Mã môi trường, release ID, fingerprint, cờ hệ thống và thông số kỹ thuật nằm trong **Thông tin kỹ thuật** mở theo yêu cầu.
- Màu không được là tín hiệu duy nhất: mọi trạng thái có văn bản rõ ràng.

## 6. Ranh giới hiện tại

- Production Gate vẫn `BLOCKED`; không xây Production Scoring Engine hoặc financial scoring từ dữ liệu trống/synthetic.
- Private storage + release registry + RLS + audit log + server-side validator/materializer đã có ở Sandbox V0.1. Chưa có antivirus/CDR hay worker/queue cho file lớn; đây là điều kiện bắt buộc trước khi mở quy mô nhập liệu production.
