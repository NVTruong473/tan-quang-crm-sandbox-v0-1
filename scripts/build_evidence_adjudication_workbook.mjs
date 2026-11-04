import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = path.resolve("outputs/2026-11-04-customer-contract-v1/tan-quang-data-readiness-campaign-v1.xlsx");
const outputDir = path.resolve("outputs/2026-11-04-customer-contract-v1");
const outputPath = path.join(outputDir, "tan-quang-evidence-adjudication-v1.xlsx");
const previewPath = path.join(outputDir, "evidence-adjudication-preview.png");
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const review = wb.worksheets.getItem("03 CSKH Review");
const reviewRows = review.getRange("A6:L22").values.filter((r) => String(r[0] ?? "").trim());
const sheet = wb.worksheets.add("06 Evidence Adjudication");
sheet.showGridLines = false;
sheet.tabColor = "#8064A2";
const common = [
  ["Cập nhật dữ liệu chốt kỳ 2026", "CSKH + Kế toán", "Ngày chốt số liệu 2026", "Ngày chốt"],
];
const contractFields = [
  ["Hợp đồng", "Kế toán hợp đồng", "Mã HĐ; ngày ký; tình trạng", "Mã HĐ / ngày ký / trạng thái"],
  ["Doanh thu", "Kế toán", "Doanh thu ghi nhận", "Doanh thu thực nhận"],
  ["Giá vốn", "Kế toán", "Giá vốn + xác nhận giá vốn", "Sổ giá vốn / xác nhận"],
  ["Công nợ", "Kế toán", "Công nợ", "Sổ công nợ"],
  ["Thanh toán", "Kế toán", "Hạn thanh toán + ngày thanh toán + trạng thái", "Chứng từ / sổ thanh toán"],
];
const potentialFields = [
  ["Cơ hội mới", "CSKH", "Cơ hội dự án mới", "Email / biên bản / xác nhận khách"],
  ["Bảo trì", "CSKH + Kỹ thuật", "Nhu cầu bảo trì / thay thế", "Phiếu kỹ thuật / trao đổi khách"],
  ["Mở rộng", "CSKH", "Khả năng mở rộng hoạt động", "Kế hoạch khách / xác nhận khách"],
  ["Chất lượng phối hợp", "CSKH", "Phối hợp và trao đổi công việc", "Nhật ký làm việc"],
  ["Người quyết định", "CSKH", "Quan hệ với người ra quyết định", "Biên bản / danh bạ đầu mối"],
];
const rows = [];
for (const r of reviewRows) {
  const id = String(r[0]);
  const name = String(r[1]);
  const hasContract = Number(r[2] || 0) > 0;
  const fields = hasContract ? [...common, ...potentialFields] : [...contractFields, ...common];
  for (const [domain, owner, field, expected] of fields) rows.push([id, name, domain, field, expected, owner, "PENDING_ADJUDICATION", "", "", "", "", ""]);
}
const headers = ["Mã KH", "Tên công ty", "Nhóm bằng chứng", "Ô cần phân loại", "Bằng chứng mong đợi", "Đầu mối", "Trạng thái", "Mã lý do", "Giá trị xác nhận", "Nguồn bằng chứng", "Người xác nhận", "Ngày xác nhận"];
sheet.getRange("A2:L2").merge();
sheet.getRange("A2").values = [["EVIDENCE ADJUDICATION V1 — Phiên Kế toán + CSKH"]];
sheet.getRange("A3:L3").merge();
sheet.getRange("A3").values = [["Chỉ chuyển PENDING_ADJUDICATION sang CONFIRMED_VALUE / CONFIRMED_NONE / NOT_APPLICABLE khi có nguồn, người xác nhận và ngày xác nhận."]];
sheet.getRange("A5:L5").values = [headers];
sheet.getRange(`A6:L${5 + rows.length}`).values = rows;
sheet.getRange("A2:L2").format = { font: { name: "Arial", size: 14, bold: true, color: "#17365D" } };
sheet.getRange("A3:L3").format = { font: { name: "Arial", size: 10, italic: true, color: "#7F6000" }, fill: "#FFF2CC" };
sheet.getRange("A5:L5").format = { fill: "#17365D", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
sheet.getRange(`A6:L${5 + rows.length}`).format = { font: { name: "Arial", size: 10 }, verticalAlignment: "center", wrapText: true };
sheet.getRange(`G6:L${5 + rows.length}`).format.fill = "#FFF2CC";
sheet.getRange(`A6:L${5 + rows.length}`).format.borders = { preset: "outside", style: "thin", color: "#D9E2F3" };
sheet.tables.add(`A5:L${5 + rows.length}`, true, "EvidenceAdjudication");
sheet.freezePanes.freezeRows(5);
sheet.freezePanes.freezeColumns(2);
sheet.getRange("A:L").format.autofitColumns();
sheet.getRange("B:B").format.columnWidth = 30;
sheet.getRange("D:E").format.columnWidth = 28;
sheet.getRange("J:J").format.columnWidth = 32;
await fs.mkdir(outputDir, { recursive: true });
const preview = await wb.render({ sheetName: "06 Evidence Adjudication", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath, adjudicationRows: rows.length, customers: reviewRows.length, pending: rows.length }));
