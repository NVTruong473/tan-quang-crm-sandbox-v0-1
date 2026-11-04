# Customer Triage V1 — Evidence Only

## Phạm vi

Đây là engine định tuyến hành động CSKH, không phải mô hình scoring. Nó chỉ dùng các giá trị đã materialize từ workbook nguồn và không gán khách hàng cho hợp đồng thiếu khóa.

## Luật tất định

| Điều kiện | Hàng đợi | Ưu tiên | Hành động |
|---|---|---|---|
| Có hợp đồng liên kết và công nợ > 0 | `CSKH_RISK_REVIEW` | P1 | CSKH phối hợp kế toán rà soát công nợ |
| Có hợp đồng liên kết, không có công nợ | `CSKH_RELATIONSHIP_REVIEW` | P2 | Duy trì quan hệ, rà soát nhu cầu tái ký |
| Không có hợp đồng liên kết | `DATA_GAP_CUSTOMER` | P3 | Không xếp hạng; bổ sung bằng chứng |

Hợp đồng không có `Mã KH` hợp lệ được đưa vào `Unattributed Contracts`, giữ nguyên giá trị nguồn nhưng loại khỏi mọi tổng hợp theo khách hàng.

## Kết quả release

- `cskh_triage`: 17 khách hàng.
- `unattributed_contracts`: 70 dòng nguồn có dữ liệu nhưng thiếu khóa định danh; các dòng hoàn toàn trống không được coi là bản ghi.
- `scoring_sandbox`: vẫn `NOT_READY`; `official_score` để trống.
- Release ACTIVE: `SBX-TRIAGE-V1-6621E58D`.

## Điều kiện kiểm soát

- Không có fuzzy matching hoặc suy đoán tên công ty.
- Không tạo A/B/C/D chính thức.
- Mọi dòng có `provenance_ref` hoặc `source_sheet/source_row`.
- Raw workbook vẫn là nguồn sự thật; dashboard chỉ đọc materialization của release.
