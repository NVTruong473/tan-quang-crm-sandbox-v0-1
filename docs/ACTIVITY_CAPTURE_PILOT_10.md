# Activity Capture V1 — Pilot cohort 10

## Trạng thái

**READY_TO_RUN — chưa ghi activity nào.** Đây là cohort được chọn từ release `SBX-ACTIVITY-V1-MW1JIXWK`; mọi task hiện đang `OPEN` và `owner=UNASSIGNED`. Không được coi là đã chạy cho đến khi người phụ trách thực hiện liên hệ thật và nhập bằng chứng.

## Cohort

| # | Task | Customer | Loại | Hạn | Trạng thái hiện tại |
|---:|---|---|---|---|---|
| 1 | CSKH-HAIL-20261104 | HAIL | CUSTOMER_FOLLOW_UP | 2026-11-09 | Chờ gán người |
| 2 | CSKH-GREE-20261104 | GREE | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 3 | CSKH-TOPS-20261104 | TOPS | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 4 | CSKH-HUNG-20261104 | HUNG | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 5 | CSKH-DINS-20261104 | DINS | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 6 | CSKH-VIST-20261104 | VIST | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 7 | CSKH-JIAZ-20261104 | JIAZ | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 8 | CSKH-HUNK-20261104 | HUNK | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 9 | CSKH-HUIH-20261104 | HUIH | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |
| 10 | CSKH-CUTH-20261104 | CUTH | EVIDENCE_REQUEST | 2026-11-14 | Chờ gán người |

## Cách hoàn tất pilot

1. Gán owner thật cho từng task; không dùng `UNASSIGNED`.
2. Thực hiện cuộc gọi/email/thăm khách thật.
3. Nhập activity trong UI bằng Activity ID duy nhất, kết quả quan sát được, next action và `evidence_reference` có thể kiểm tra.
4. Đối chiếu 10/10 với bằng chứng gốc và audit log.

## Điều kiện pass

- 10/10 activity có task/customer khớp.
- 10/10 có evidence reference kiểm tra được.
- 10/10 có audit event.
- Không có activity giả hoặc ghi trước khi liên hệ.
- Scoring vẫn giữ khóa.

> Không thể hoàn tất phần “CSKH thật” bằng dữ liệu tổng hợp hoặc tự động hóa; làm vậy sẽ tạo outcome giả và làm sai mục tiêu xây scoring sau này.
