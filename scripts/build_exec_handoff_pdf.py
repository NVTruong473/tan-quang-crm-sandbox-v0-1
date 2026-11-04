from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = "output/pdf/tan-quang-crm-executive-handoff-v0-1.pdf"
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
pdfmetrics.registerFont(TTFont("ArialUnicode", FONT))
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TQTitle", parent=styles["Title"], fontName="ArialUnicode", fontSize=20, leading=25, textColor=colors.HexColor("#17365D"), alignment=TA_CENTER, spaceAfter=10))
styles.add(ParagraphStyle(name="TQH1", parent=styles["Heading1"], fontName="ArialUnicode", fontSize=13, leading=17, textColor=colors.HexColor("#17365D"), spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="TQBody", parent=styles["BodyText"], fontName="ArialUnicode", fontSize=9.5, leading=14, spaceAfter=5))
styles.add(ParagraphStyle(name="TQSmall", parent=styles["BodyText"], fontName="ArialUnicode", fontSize=8, leading=11, textColor=colors.HexColor("#52606D")))
P = lambda text, style="TQBody": Paragraph(text, styles[style])

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("ArialUnicode", 8); canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(18 * mm, 12 * mm, "Tân Quang CRM Sandbox V0.1 · Executive Handoff")
    canvas.drawRightString(192 * mm, 12 * mm, f"Trang {doc.page}"); canvas.restoreState()

story = [P("TÂN QUANG CRM", "TQTitle"), P("Báo cáo bàn giao điều hành V0.1", "TQTitle"), P("Release Candidate: SBX-ACTIVITY-V1-MW1JIXWK · Technical Completion Gate: PASS", "TQSmall"), Spacer(1, 8), P("1. Kết luận điều hành", "TQH1"), P("Bản CRM Sandbox Release Candidate đã hoàn tất về mặt kỹ thuật và có thể bàn giao để đánh giá. Hệ thống ưu tiên CSKH dựa trên bằng chứng, không tự bịa dữ liệu và không phát hành scoring khi dữ liệu chưa đủ."), P("2. Phạm vi đã hoàn thành", "TQH1")]
items = ["Nhập XLSX/CSV qua server validator/materializer.", "Private Storage, Release Registry, dual approval, RLS và Approval Audit Log trên Supabase.", "Customer Triage Evidence Only và CSKH Work Queue.", "Quarantine 70 hợp đồng chưa định danh, không phân bổ giả vào khách hàng.", "Evidence Ledger truy ngược nguồn file/sheet/cột/dòng.", "Activity Capture V1 thủ công, append-only, bắt buộc evidence reference.", "Provenance reconciliation: 10/10 = 100%."]
story += [P("• " + x) for x in items]
story += [P("3. Kết quả dữ liệu hiện tại", "TQH1")]
data = [[P("Chỉ tiêu", "TQSmall"), P("Kết quả", "TQSmall")], [P("Hồ sơ khách hàng"), P("17")], [P("Khách có hợp đồng liên kết"), P("1 · doanh thu xác minh 740.000.000")], [P("Hợp đồng chưa định danh"), P("70 · đang quarantine")], [P("Evidence Ledger"), P("102 dòng")], [P("Activity thật"), P("0 · không tạo dữ liệu giả")], [P("Official scoring"), P("LOCKED · NOT_READY")]]
t = Table(data, colWidths=[75*mm, 105*mm]); t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#17365D")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .3, colors.HexColor("#CBD5E1")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F4F7FB")]), ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)])); story += [t]
story += [P("4. Ý nghĩa kinh doanh", "TQH1"), P("CRM đã trả lời được nên ưu tiên rà soát khách nào trước dựa trên bằng chứng đang có. Hệ thống chưa thể cam kết khách nào có xác suất chốt đơn cao vì thiếu dữ liệu hợp đồng liên kết, tài chính, thanh toán và outcome CSKH."), P("5. Giới hạn và trạng thái an toàn", "TQH1"), P("Chưa có official A/B/C/D scoring; chưa có mô hình dự báo conversion; chưa có automation gọi điện/email; chưa được coi là Production CRM. Scoring và Production Gate vẫn khóa."), P("6. Cách xem sản phẩm", "TQH1"), P("Tải gói frontend từ Supabase Storage, giải nén và mở index.html trên máy; đăng nhập bằng tài khoản admin được bàn giao riêng. Backend/API chạy trên Supabase và chỉ trả dữ liệu sau khi Supabase Auth xác thực."), P("Lưu ý: Supabase mặc định không phục vụ HTML tương tác như static-site host trên URL dự án, nên gói frontend được bàn giao dưới dạng artifact tải xuống. Không sử dụng GitHub Pages làm link chính thức."), P("7. Quyết định đề xuất", "TQH1"), P("Chốt V0.1 là CRM Sandbox kỹ thuật + manual CSKH ready. Khi CSKH thật phát sinh tự nhiên hoặc có workbook mới được công ty phê duyệt, nhập qua Import Gate và ghi activity có bằng chứng. Không gọi khách chỉ để thử hệ thống."), Spacer(1, 8), P("Tài liệu này không phê duyệt scoring hoặc sử dụng như Production CRM.", "TQSmall")]
SimpleDocTemplate(OUT, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=16*mm, bottomMargin=18*mm, title="Tân Quang CRM Executive Handoff V0.1", author="Tân Quang CRM").build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
