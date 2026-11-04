# CSKH Work Queue + Activity Outcome Ledger V1

## Nguyên tắc

Work Queue là danh sách việc phải làm được sinh tất định từ `cskh_triage`. Activity Outcome Ledger chỉ ghi nhận sự kiện đã xảy ra sau khi CSKH liên hệ; không tạo activity giả từ task.

## Work Queue

- P1: `CSKH_RISK_REVIEW`, SLA 1 ngày, phối hợp Kế toán.
- P2: `CSKH_RELATIONSHIP_REVIEW`, SLA 5 ngày, duy trì quan hệ/tái ký.
- P3: `DATA_GAP_CUSTOMER`, SLA 10 ngày, yêu cầu bằng chứng; không phải khách hạng thấp.
- Owner mặc định là `UNASSIGNED` để không tự bịa người phụ trách.
- Task trạng thái ban đầu là `OPEN`.

## Activity Outcome Ledger

Ledger ban đầu rỗng có chủ đích. Khi có liên hệ thật, nhập `activity_id`, `task_id`, `customer_id`, ngày, loại hoạt động, người phụ trách, kết quả, hành động tiếp theo, hạn tiếp theo, `evidence_reference`, trạng thái và ghi chú. Ledger append-only; không sửa ngược workbook nguồn hoặc KPI đã materialize.

## Kết quả release

- `work_queue`: 17 task.
- `activity_outcome_ledger`: 0 activity thật, schema đã sẵn sàng.
- `official_score`: vẫn `NOT_READY`.
- Release ACTIVE: `SBX-WORKQUEUE-V1-2F6D0B33`.

## Cơ sở tham khảo

- Dynamics 365 mô tả queues là nơi tập trung và ưu tiên work items cần hành động: <https://learn.microsoft.com/en-us/dynamics365/customer-service/administer/set-up-queues-manage-activities-cases>.
- Dynamics 365 khuyến nghị ghi lại email, cuộc gọi, task, appointment và notes gắn với hồ sơ khách hàng để duy trì lịch sử tương tác: <https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/basics/work-with-activities?view=op-9-1>.
- GOV.UK Data Quality Issues Framework yêu cầu issue có owner, priority, timescale và review date: <https://www.gov.uk/government/publications/implement-a-data-quality-action-plan/data-quality-issues-framework>.
