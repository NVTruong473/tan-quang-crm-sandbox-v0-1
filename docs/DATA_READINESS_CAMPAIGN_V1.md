# Data Readiness Campaign V1

## Mục tiêu

Đóng Score Readiness Gate bằng bằng chứng thật để có thể áp dụng rule 100 điểm của sếp. Chiến dịch này không thay đổi công thức và không tự tạo dữ liệu.

## Hàng đợi hiện tại

- P1: 1 khách đã có hợp đồng liên kết — hoàn thiện tín hiệu tiềm năng, thanh toán và chất lượng hợp tác.
- P2: 16 khách chưa có bằng chứng hợp đồng liên kết — bổ sung mã hợp đồng và các trường hợp đồng trước khi chấm.

## Quy tắc thực hiện

1. Người phụ trách điền vào các cột màu vàng trong workbook chiến dịch.
2. Mỗi giá trị phải có nguồn kiểm tra, người xác nhận và ngày xác nhận.
3. Không điền `0` nếu thực tế là chưa biết.
4. Nếu xác nhận “không có”, ghi rõ nguồn và ngày; khi đó mới được tính 0 điểm.
5. Sau khi hoàn thành, import lại workbook nguồn; server validator sẽ quarantine dòng lỗi và ghi audit.
6. Admin khác phê duyệt và kích hoạt release; không sửa trực tiếp materialized release.

## Điều kiện đóng Gate

- 100% Mã KH duy nhất.
- 100% Mã HĐ có liên kết hoặc được quarantine có lý do.
- Tối thiểu 95% bản ghi đạt trường bắt buộc của ba nhóm lõi: lợi nhuận, ổn định hợp tác, thanh toán.
- Các trường tiềm năng và chất lượng hợp tác có người xác nhận; không suy luận từ tên công ty.
- Dữ liệu 2026 có ngày chốt (`as_of_date`).
- Kiểm tra đối chiếu dashboard với workbook đạt 100% trên mẫu kiểm tra.

Khi chưa đạt, CRM chỉ hiển thị hàng đợi CSKH theo bằng chứng và giữ `OFFICIAL_SCORE_BLOCKED`.
