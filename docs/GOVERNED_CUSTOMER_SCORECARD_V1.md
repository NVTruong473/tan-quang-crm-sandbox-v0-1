# Governed Customer Scorecard V1 — Rule của sếp + đề xuất tăng cường

## Phân định quyền quyết định

Các nội dung sau là **rule chính thức do sếp giao**, không được thay đổi bởi mô hình hay AI:

- 5 nhóm trọng số 30 / 25 / 20 / 15 / 10.
- Tổng thang 100.
- Xếp hạng A: 85–100, B: 70–84, C: 50–69, D: dưới 50.

Các ngưỡng chi tiết, Coverage, cảnh báo và gợi ý hành động trong tài liệu này là **đề xuất kỹ thuật cần trình sếp duyệt**, nhằm làm rule gốc có thể vận hành được mà không bóp méo ý nghĩa. CRM không được kích hoạt xếp hạng chính thức trước khi các đề xuất này được duyệt.

Khi được duyệt, hệ thống hiển thị đồng thời:

- `Official Score` (0–100): chỉ có khi đủ điều kiện; dùng để xếp A/B/C/D.
- `Provisional Score` (0–100): chỉ để người phụ trách tham khảo, luôn kèm `Coverage` và nhãn `TẠM THỜI`; không dùng làm báo cáo chính thức.
- `Data Coverage` (0–100%): tỷ trọng trọng số của tiêu chí có bằng chứng hợp lệ.
- `Evidence Gaps`: danh sách trường cần bổ sung, không thay giá trị trống bằng 0.

Điểm thiếu dữ liệu **khác** với điểm 0: `0` chỉ dùng khi có xác nhận nghiệp vụ rằng giá trị thực là không có, chẳng hạn “không có cơ hội dự án mới”.

## Công thức 100 điểm

### 1. Giá trị lợi nhuận — 30 điểm

| Tiêu chí | Điểm | Công thức / bằng chứng bắt buộc |
|---|---:|---|
| Tổng lợi nhuận gộp 3 năm | 15 | Phân vị lợi nhuận gộp trong tập khách có dữ liệu đầy đủ: top 20%=15; 20–50%=11; 50–80%=7; còn lại=3. Cần doanh thu và giá vốn đã xác nhận. |
| Tỷ suất lợi nhuận gộp | 10 | `LN gộp / doanh thu`: >=30%=10; 20–<30%=8; 10–<20%=5; 0–<10%=2; <0=0. |
| Đóng góp 12 tháng gần nhất | 5 | Cùng phân vị trên lợi nhuận gộp 12 tháng: top 20%=5; 20–50%=4; 50–80%=2; còn lại=1. |

### 2. Ổn định hợp tác — 25 điểm

| Tiêu chí | Điểm | Công thức / bằng chứng bắt buộc |
|---|---:|---|
| Số năm hợp tác | 8 | `DATEDIF(ngày bắt đầu, ngày chấm, "y")`: >=3=8; 2=6; 1=3; <1=1. |
| Tần suất hợp đồng | 9 | Số hợp đồng không hủy trong 36 tháng: >=6=9; 4–5=7; 2–3=4; 1=1. |
| Độ mới hợp tác | 8 | Ngày chấm trừ ngày hợp đồng gần nhất: <=90=8; <=180=6; <=365=3; >365=0. |

### 3. Tiềm năng phát triển — 20 điểm

Ba trường này là **tín hiệu do người phụ trách xác nhận**, không được suy luận bởi AI từ tên/ngành khách hàng:

| Tiêu chí | Điểm | Giá trị hợp lệ |
|---|---:|---|
| Cơ hội dự án mới | 10 | Có bằng chứng và xác suất/giá trị được ghi nhận=10; xác nhận không có=0; chưa biết=trống. |
| Nhu cầu bảo trì/thay thế | 5 | Có bằng chứng=5; xác nhận không có=0; chưa biết=trống. |
| Khả năng mở rộng | 5 | Có bằng chứng được quản lý xác nhận=5; xác nhận không có=0; chưa biết=trống. |

### 4. Uy tín thanh toán — 15 điểm

| Tiêu chí | Điểm | Công thức / bằng chứng bắt buộc |
|---|---:|---|
| Tỷ lệ thanh toán đúng hạn | 8 | `số HĐ thanh toán đúng hạn / số HĐ đã đến hạn`: >=95%=8; 80–<95%=6; 60–<80%=3; <60%=0. |
| Mức độ chậm thanh toán | 7 | Không công nợ quá hạn=7; <=30 ngày=5; 31–60=3; 61–90=1; >90=0. Nếu không có ngày đến hạn/thanh toán, để trống. |

### 5. Chất lượng hợp tác — 10 điểm

| Tiêu chí | Điểm | Giá trị hợp lệ |
|---|---:|---|
| Phối hợp và trao đổi | 0–5 | Đánh giá có ngày, người đánh giá, mô tả ngắn: 1–5; không có bằng chứng=trống. |
| Quan hệ với người quyết định | 0–5 | 1–5 theo tiêu chí nội bộ; không có bằng chứng=trống. |

## Điều kiện xuất điểm

`Official Score` chỉ xuất khi đồng thời:

1. Có đủ bằng chứng cho toàn bộ nhóm Giá trị lợi nhuận, Ổn định hợp tác và Uy tín thanh toán (70 điểm); và
2. `Data Coverage >= 85%`; và
3. Không có hợp đồng mồ côi, trùng mã khách hàng hoặc lỗi ngày/số tiền nghiêm trọng; và
4. Nguồn 2026 có `as_of_date` (vì chưa phải số liệu cả năm).

Khi chưa đạt, `Official Score = CHƯA ĐỦ DỮ LIỆU`; dashboard đưa khách vào hàng đợi bổ sung thông tin, không vào A/B/C/D. `Provisional Score` chỉ xuất nếu Coverage >=70% và phải hiện đồng thời phần trăm Coverage.

## Phân loại và cảnh báo

- A: 85–100 — chiến lược.
- B: 70–84 — phát triển.
- C: 50–69 — duy trì.
- D: dưới 50 — ưu tiên thấp.
- Cảnh báo tách biệt, không trừ điểm âm vô hạn: công nợ quá hạn >30 ngày; không có hợp đồng mới >365 ngày; hoặc Coverage <85%.

## Trạng thái dữ liệu hiện tại

Tập đang hoạt động có 17 khách và 2 dòng hợp đồng, chỉ 1 hợp đồng liên kết hợp lệ; các trường cơ hội, bảo trì/mở rộng, lịch sử liên hệ, hầu hết mốc thanh toán và chuỗi hợp đồng 3 năm chưa đủ. Vì vậy không khách nào được phép nhận `Official Score` hay A/B/C/D lúc này.

## Pass gate trước kích hoạt

- 100% `Mã KH` duy nhất và 100% `Mã HĐ` liên kết hoặc được quarantine.
- 100% khách có `as_of_date` cho kỳ chấm; 2026 ghi rõ ngày chốt số liệu.
- Tối thiểu 95% bản ghi đưa vào xếp hạng đạt điều kiện Official Score; khách còn lại phải hiện lý do thiếu.
- Kiểm tra đối chiếu ngẫu nhiên ít nhất 10 khách hoặc toàn bộ nếu dưới 10, giữa Excel và dashboard; sai lệch = 0.
- Hai người duyệt: người chuẩn bị dữ liệu không tự kích hoạt release.
