# Customer + Contract Input Policy V1

## Mục tiêu cốt lõi

Xếp thứ tự chăm sóc theo bằng chứng, không suy diễn tiềm năng từ dữ liệu thiếu. Mỗi khách hàng thuộc một trong ba trạng thái:

1. `CONTRACT_HISTORY_PRESENT`: có hợp đồng liên kết; được đưa vào danh sách rà soát CSKH.
2. `REVIEW_COST_EVIDENCE`: có hợp đồng nhưng thiếu xác nhận giá vốn; cần kiểm tra trước khi dùng lợi nhuận.
3. `NEEDS_CONTRACT_EVIDENCE`: chưa có hợp đồng liên kết; là backlog bổ sung dữ liệu, không phải khách tiềm năng thấp.

## Quy tắc workbook

- Nguồn nhập là `01 Khach hang` và `02 Hop dong`, với hàng 1 là tiêu đề.
- Không có giới hạn 100 dòng ở import server. Mọi dòng có định danh hợp lệ được đọc.
- Không thay giá trị thiếu bằng `0`, `N/A` số hoặc giá trị ước lượng; để trống và bổ sung sau.
- `Mã KH` phải duy nhất. `Mã HĐ` phải duy nhất và tham chiếu đến `Mã KH` đã có. Hợp đồng không liên kết được tách khỏi tổng hợp.
- Không đổi tên hai sheet nguồn hoặc hàng tiêu đề. Những sheet còn lại có thể giữ để người dùng xem/sửa nhưng không là nguồn tính CRM.

## Khả năng chỉnh sửa đa nền tảng

- Lưu `.xlsx`; Excel và Google Sheets đều mở/sửa được.
- Để mở rộng số dòng, thêm dòng dưới cùng vùng dữ liệu; ưu tiên Excel Table/Google Sheets Table để định dạng theo dòng mới.
- Sau khi sửa, người dùng chủ động chọn lại file trong CRM. Không tự theo dõi file trên máy.

## Pass gate

- 100% hàng nguồn có định danh hợp lệ hoặc được nêu rõ trong báo cáo quarantine.
- Không có dữ liệu cũ trong Active Release.
- Những chỉ số thiếu nguồn hiển thị “chưa có bằng chứng”, không hiển thị 0 như số liệu thật.
