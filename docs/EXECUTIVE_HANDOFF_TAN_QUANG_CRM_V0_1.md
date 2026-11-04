# TÂN QUANG CRM — Executive Handoff V0.1

## 1. Kết luận điều hành

Bản Sandbox Release Candidate đã hoàn tất về mặt kỹ thuật và có thể bàn giao để sếp xem xét. Hệ thống hiện ưu tiên CSKH dựa trên bằng chứng, không tự bịa dữ liệu và không phát hành scoring khi dữ liệu chưa đủ.

## 2. Những gì đã hoàn thành

- Nhập XLSX/CSV qua server validator/materializer.
- Private Storage, Release Registry, dual approval, RLS và Approval Audit Log trên Supabase.
- Customer Triage Evidence Only và CSKH Work Queue.
- Quarantine 70 hợp đồng chưa định danh, không phân bổ giả vào khách hàng.
- Evidence Ledger truy ngược nguồn file/sheet/cột/dòng.
- Activity Capture V1 thủ công, append-only, bắt buộc evidence reference.
- Technical Completion Gate: PASS; provenance reconciliation: 10/10 = 100%.

## 3. Kết quả dữ liệu hiện tại

- 17 hồ sơ khách hàng.
- 1 khách có hợp đồng liên kết và doanh thu ghi nhận xác minh 740.000.000.
- 70 dòng hợp đồng chưa định danh khách hàng.
- 102 dòng evidence ledger.
- Activity thật: 0; không tạo dữ liệu giả.
- Official scoring: LOCKED; mọi dòng scoring vẫn `NOT_READY`.

## 4. Ý nghĩa kinh doanh hiện tại

CRM đã trả lời được “nên ưu tiên rà soát khách nào trước dựa trên bằng chứng đang có”, nhưng chưa thể cam kết “khách nào có xác suất chốt đơn cao” vì thiếu dữ liệu hợp đồng liên kết, tài chính, thanh toán và outcome CSKH.

## 5. Cách xem sản phẩm

1. Tải gói frontend từ Supabase Storage.
2. Giải nén, mở Terminal tại thư mục chứa `index.html` và chạy `python3 -m http.server 4173`.
3. Mở `http://localhost:4173/index.html` rồi đăng nhập bằng tài khoản admin được bàn giao riêng.
4. Backend/API và dữ liệu CRM chạy trên Supabase; dữ liệu chỉ tải sau khi Supabase Auth xác thực.

## 6. Điều chưa được phép tuyên bố

- Chưa có official A/B/C/D scoring.
- Chưa có mô hình dự báo conversion.
- Chưa có automation gọi điện/email.
- Chưa được coi là Production CRM.

## 7. Quyết định đề xuất

Chốt V0.1 là **CRM Sandbox kỹ thuật + manual CSKH ready**. Khi công việc CSKH thật phát sinh tự nhiên hoặc có workbook mới được công ty phê duyệt, nhập dữ liệu qua Import Gate và ghi activity có bằng chứng. Không gọi khách chỉ để thử hệ thống.
