# Provenance Reconciliation V1

**Release kiểm thử:** `SBX-TRIAGE-V1-6621E58D`  
**Workbook đối soát:** `THÔNG TIN KHÁCH HÀNG.xlsx`  
**Ngày chạy:** 2026-11-04  

## Kết quả

| Chỉ tiêu | Kết quả |
|---|---:|
| Mẫu đối soát | 10 customer-metric records |
| Khớp giá trị raw workbook → ledger | 10/10 |
| Tỷ lệ | 100% |
| Provenance Gate | PASS |
| Official Scoring Gate | Vẫn BLOCKED |

Mẫu gồm 5 khách hàng đầu theo mã khách hàng và hai metric `revenue`, `outstanding`. Với khách không có hợp đồng liên kết, giá trị `0` được đối chiếu riêng với trạng thái thiếu bằng chứng; không coi đây là bằng chứng kinh doanh đầy đủ.

## Điều kiện mở Gate tiếp theo

Đã đạt điều kiện kỹ thuật của Provenance Gate. Gate tiếp theo chỉ được xem xét sau khi có phê duyệt nghiệp vụ và dữ liệu đủ cho các miền scoring còn thiếu. Không tự động mở Official Scoring Gate từ kết quả đối soát này.

## Bằng chứng thực thi

Script tái chạy: `scripts/run_provenance_reconciliation.py`. Script đăng nhập admin, đọc Evidence Ledger từ active release, đọc workbook bằng `data_only=True`, tính lại tổng doanh thu/công nợ theo Mã KH và so sánh bằng Decimal — không dùng số liệu UI làm nguồn sự thật.
