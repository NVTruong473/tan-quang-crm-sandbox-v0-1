# Activity Capture V1 — ghi nhận kết quả CSKH thật

## Mục tiêu

Activity Capture V1 ghi nhận kết quả sau khi nhân viên CSKH thực sự liên hệ khách hàng. Bản ghi phải gắn với một `task_id` trong Work Queue và đúng `customer_id`; không cho phép nhập activity rời khỏi hàng đợi.

## Quy tắc kiểm soát

- Append-only: không có đường cập nhật/xóa bản ghi sau khi ghi.
- Bắt buộc: `activity_id`, `task_id`, `customer_id`, ngày, loại hoạt động, người phụ trách, kết quả, hành động tiếp theo và `evidence_reference`.
- Server kiểm tra task tồn tại trong release đang ACTIVE và kiểm tra task/customer khớp nhau.
- Mỗi lần ghi tạo audit event `ACTIVITY_OUTCOME_RECORDED`; RLS chỉ cho admin đã xác thực đọc/ghi qua RPC.
- Activity không làm thay đổi scoring. Official scoring vẫn `BLOCKED_BY_SCORE_READINESS_GATE`.
- Ledger rỗng sau release rehearsal là đúng chủ đích: không tạo dữ liệu CSKH giả để làm đẹp kết quả.

## Cách sử dụng

1. Vào **Hàng đợi CSKH** và chọn task cần xử lý.
2. Sau cuộc gọi/email/thăm khách, nhập Activity ID duy nhất, kết quả quan sát được, bước tiếp theo và bằng chứng (biên bản, email, ghi chú cuộc gọi hoặc đường dẫn hồ sơ nội bộ).
3. Bấm **Ghi activity append-only**. Nếu task/customer không khớp, server từ chối.
4. Kiểm tra bản ghi xuất hiện trong Activity Outcome Ledger; không sửa trực tiếp bản ghi đã ghi.

## Căn cứ thiết kế

- Microsoft Dynamics 365 mô hình hóa work item trong queue và theo dõi hoạt động gắn với record: https://learn.microsoft.com/en-us/dynamics365/customer-service/administer/set-up-queues-manage-activities-cases
- Microsoft mô tả activity history là lịch sử tương tác cần được lưu để theo dõi công việc: https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/basics/work-with-activities?view=op-9-1
- GOV.UK Data Quality Issues Framework khuyến nghị gắn vấn đề dữ liệu với owner, ưu tiên, hạn xử lý và review: https://www.gov.uk/government/publications/implement-a-data-quality-action-plan/data-quality-issues-framework
