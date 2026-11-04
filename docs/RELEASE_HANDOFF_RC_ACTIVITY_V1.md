# Release Handoff — Tân Quang CRM Sandbox RC

## Mốc bàn giao

- Release code: `SBX-ACTIVITY-V1-MW1JIXWK`
- Technical Completion Gate: `PASS`
- Scoring: `LOCKED`
- Activity Capture: `READY — AWAITING REAL HUMAN EVIDENCE`
- Production Gate: `BLOCKED`
- Dữ liệu: chỉ dùng materialized payload từ workbook đầu vào đã được validate server-side.

## Phạm vi được bàn giao

- Customer 360 và Customer Triage Evidence Only.
- CSKH Work Queue với task có rule/provenance.
- Unattributed Contracts quarantine, không phân bổ giả vào khách hàng.
- Activity Capture V1 append-only, bắt buộc evidence reference.
- Release Registry, dual approval, RLS và Approval Audit Log.
- Import XLSX/CSV qua server validator/materializer.

## Không thuộc phạm vi

- Không phát hành official customer scoring.
- Không coi `scoring_sandbox` là điểm kinh doanh.
- Không tự tạo activity, doanh thu, lợi nhuận, conversion hay outcome CSKH.
- Không đưa 70 hợp đồng chưa định danh vào KPI khách hàng.

## Quy tắc vận hành sau bàn giao

1. Người dùng chỉ nhập file qua Import Gate; không sửa payload materialized trực tiếp.
2. Mỗi release mới phải có fingerprint, validator report, người tạo và người duyệt khác nhau.
3. Chỉ release `APPROVED` mới được activate; dashboard chỉ đọc release `ACTIVE`.
4. Activity chỉ được ghi sau khi liên hệ thật và có evidence reference kiểm tra được.
5. Không sửa/xóa activity đã ghi; nếu có sai sót, ghi một bản correction có liên kết bằng chứng theo quy trình thay đổi được duyệt.
6. Mọi thay đổi mã nguồn hoặc schema sau mốc bàn giao phải tạo release candidate mới và chạy lại Technical Completion Gate.

## Điều kiện mở giai đoạn tiếp theo

- Có dữ liệu hợp đồng được định danh đủ để phục vụ mục tiêu kinh doanh.
- Có activity/outcome CSKH thật, được đối chiếu bằng chứng.
- Có business owner phê duyệt định nghĩa outcome và tiêu chí scoring.
- Provenance reconciliation đạt 100% trên mẫu kiểm tra.

## Quy trình xử lý sự cố

- Nếu validator, RLS, audit hoặc provenance fail: giữ Production Gate `BLOCKED`, không activate release mới.
- Nếu dữ liệu nguồn sai: sửa file nguồn, import phiên bản mới; không sửa ngược bản ghi bất biến.
- Nếu release mới lỗi: quay lại release ACTIVE trước đó qua quy trình dual-control, không sửa dữ liệu lịch sử.

Mốc này là bàn giao sandbox kỹ thuật có kiểm soát, không phải phê duyệt sử dụng scoring trong production.
