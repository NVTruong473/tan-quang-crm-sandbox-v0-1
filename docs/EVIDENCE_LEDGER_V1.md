# Evidence Ledger V1

## Mục tiêu

Mọi số liệu hiển thị trên CRM phải truy ngược được về nguồn, bản ghi, trường dữ liệu, phép tính và phiên release. Tooltip chỉ là lối tắt; chi tiết đầy đủ phải mở được bằng thao tác bấm và bàn phím.

## Thiết kế

`evidence_ledger` được materialize cùng release, ở grain `customer-metric`. Mỗi dòng ghi:

- `metric_key`, `customer_id`, `metric_label`, `value`
- workbook nguồn, sheet, cột nguồn và gợi ý dòng/bản ghi
- công thức/luật validator, trạng thái bằng chứng và phiên bản validator

Dashboard đọc ledger từ cùng active release với các bảng nghiệp vụ. Khi thiếu ledger hoặc thiếu bằng chứng nguồn, UI không gọi số đó là đã xác minh.

## UX

- Nút `i` cạnh KPI và số liệu bảng: rê chuột hiển thị gợi ý, bấm mở Evidence Ledger.
- Bấm một khách hàng mở chi tiết, gồm các metric và toàn bộ dòng bằng chứng liên quan.
- Dùng `<details>` để người dùng non-tech đọc tóm tắt; mở rộng để xem sheet, cột, record hint, công thức và validator.
- Không dùng hover làm cơ chế duy nhất: thao tác bấm/bàn phím là bắt buộc cho khả năng tiếp cận và kiểm toán.

## Điều kiện pass

1. Mỗi KPI có ít nhất một metric key và có đường dẫn tới ledger.
2. Mỗi dòng ledger có nguồn sheet/cột, derivation, status và validator version.
3. Dashboard và ledger cùng một release; không đọc ledger từ file cũ hoặc nguồn ngoài release.
4. Nếu không có bằng chứng, hiển thị trạng thái thiếu bằng chứng thay vì số giả định.
5. Chạy reconciliation trước khi mở gate: chọn ngẫu nhiên 10 customer-metric, đối chiếu UI → ledger → sheet nguồn, pass 100%.

## Cơ sở tham khảo

- W3C PROV mô hình hóa entity, activity, agent, việc sử dụng/tạo ra và trách nhiệm theo thời gian: <https://www.w3.org/TR/prov-primer/>.
- DataCite yêu cầu provenance record để đánh giá chất lượng, độ tin cậy và niềm tin; khuyến nghị ghi hoạt động, thời điểm tạo, nguồn dẫn xuất và tác nhân: <https://support.datacite.org/docs/tracking-provenance>.
- GOV.UK Data Quality Framework yêu cầu metadata về dataset, kỳ dữ liệu, tần suất cập nhật, chất lượng và cập nhật metadata khi dataset thay đổi: <https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework-guidance>.
