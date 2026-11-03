# Tân Quang CRM — Product Rules V1

Ngày hiệu lực: 2026-11-04. Phạm vi: Sandbox V0.1 và mọi phiên bản nhập liệu tiếp theo.

## 1. Một nguồn dữ liệu, nhiều phiên bản bất biến

- Mỗi lần người dùng chọn XLSX/CSV là một `Import Version` mới, có fingerprint SHA-256, người thao tác, thời điểm, tên nguồn và báo cáo kiểm tra.
- Không được ghi đè nguồn cũ hoặc thay đổi dashboard đang phát hành khi chưa có thao tác **Phát hành** rõ ràng.
- Dashboard luôn đọc đúng một `Active Release`; giao diện luôn hiển thị thời điểm và trạng thái của release đó bằng ngôn ngữ nghiệp vụ.
- Người dùng sửa file trên máy phải chọn lại file và chạy **Kiểm tra**. Trình duyệt không được tự theo dõi hoặc tự đồng bộ file cục bộ.

## 2. Luồng bắt buộc

`Chọn file → Kiểm tra cục bộ → Báo cáo lỗi/mapping → Nạp xem trước Sandbox → Phê duyệt → Phát hành lưu trữ → Dashboard tự làm mới`

- Chỉ bước sau cùng mới đổi số liệu đang công bố.
- Một phiên không đạt Data Contract phải vào trạng thái `QUARANTINED`; không được suy diễn giá trị thiếu hoặc âm thầm bỏ cột trọng yếu.
- `Nạp xem trước Sandbox` không lưu file, không ảnh hưởng production và hết hiệu lực khi kết thúc phiên trình duyệt.

## 3. Data Contract tối thiểu hiện tại

| Bảng | Khóa/cột tối thiểu | Mục đích |
|---|---|---|
| `customer_360` | `customer_id`, `customer_name`, `revenue`, `gross_profit`, `outstanding`, `weighted_pipeline` | Customer 360 |
| `scoring_sandbox` | `customer_id`, `total_score`, `segment` | Chỉ mô phỏng sandbox |
| `opportunities` | `customer_id`, `opportunity_name`, `estimated_value`, `probability_pct`, `stage`, `status` | Pipeline |
| `crm_activities` | `customer_id`, `activity_date`, `activity_type`, `summary`, `outcome`, `owner` | Hoạt động CRM |

## 4. Bảo mật và quyền riêng tư

- File nghiệp vụ được lưu vào private storage có RLS khi tính năng phát hành lưu trữ được mở; không dùng public bucket.
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
- Bước kế tiếp sau V1 local preflight là private storage + release registry + RLS + approval audit log. Chỉ sau đó mới cho phép phát hành nhập liệu bền vững.
