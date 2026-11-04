import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/vantruong/Downloads/THÔNG TIN KHÁCH HÀNG.xlsx";
const outputDir = path.resolve("outputs/2026-11-04-customer-contract-v1");
const outputPath = path.join(outputDir, "tan-quang-customer-triage-v1.xlsx");
const previewPath = path.join(outputDir, "customer-triage-v1-preview.png");
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const value = (row, index) => String(row[index] ?? "").trim();
const headers = (row) => row.map((x) => String(x ?? "").split("/")[0].trim());
const num = (x) => Number(String(x ?? "").replace(/,/g, "")) || 0;
const sourceJson = execFileSync("python", ["-c", "import openpyxl,json,sys; w=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True); out={};\nfor n in ['01 Khach hang','02 Hop dong']:\n rows=list(w[n].values); out[n]=rows\nprint(json.dumps(out,default=str,ensure_ascii=False))", inputPath], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
const raw = JSON.parse(sourceJson);
const readRaw = (name) => { const rows = raw[name]; const h = headers(rows[0]); return { rows: rows.slice(1).filter((r) => r.some((x) => String(x ?? "").trim())), index: Object.fromEntries(h.map((x, i) => [x, i])) }; };
const customer = readRaw("01 Khach hang");
const contracts = readRaw("02 Hop dong");
const customers = customer.rows.filter((r) => value(r, customer.index["Mã KH"]) && value(r, customer.index["Tên công ty"]));
const byId = new Map(); const orphan = [];
for (const [i, row] of contracts.rows.entries()) {
  const contractId = value(row, contracts.index["Mã HĐ"]); const hasSourceData = row.some((x) => String(x ?? "").trim()); if (!contractId && !hasSourceData) continue;
  const id = value(row, contracts.index["Mã KH"]); const status = value(row, contracts.index["Tình trạng"]);
  if (!id || !customers.some((c) => value(c, customer.index["Mã KH"]) === id)) { orphan.push([`UNATTRIBUTED-${i + 2}`, "02 Hop dong", String(i + 2), contractId, id, value(row, contracts.index["Tên công ty"]), value(row, contracts.index["Ngày ký"]), value(row, contracts.index["Loại công trình"]), status, num(row[contracts.index["Giá trị HĐ"]]), num(row[contracts.index["Doanh thu ghi nhận"]]), num(row[contracts.index["Giá vốn"]]), num(row[contracts.index["Công nợ"]]), contractId ? "MISSING_CUSTOMER_KEY" : "MISSING_CONTRACT_AND_CUSTOMER_KEY", "EXCLUDED_FROM_CUSTOMER_METRICS", "UNATTRIBUTED", "CUSTOMER_CONTRACT_WORKBOOK_ADAPTER_V1"]); continue; }
  if (status.toLowerCase() === "hủy") continue;
  const a = byId.get(id) ?? { count: 0, revenue: 0, profit: 0, outstanding: 0, incomplete: 0 }; a.count += 1; a.revenue += num(row[contracts.index["Doanh thu ghi nhận"]]); a.outstanding += num(row[contracts.index["Công nợ"]]); if (value(row, contracts.index["Xác nhận giá vốn"]).toLowerCase().includes("đã xác nhận")) a.profit += num(row[contracts.index["Doanh thu ghi nhận"]]) - num(row[contracts.index["Giá vốn"]]); else a.incomplete += 1; byId.set(id, a);
}
const triage = customers.map((r) => { const id = value(r, customer.index["Mã KH"]); const name = value(r, customer.index["Tên công ty"]); const a = byId.get(id) ?? { count: 0, revenue: 0, profit: 0, outstanding: 0, incomplete: 0 }; const queue = a.count === 0 ? "DATA_GAP_CUSTOMER" : a.outstanding > 0 ? "CSKH_RISK_REVIEW" : "CSKH_RELATIONSHIP_REVIEW"; const priority = a.count === 0 ? "P3" : a.outstanding > 0 ? "P1" : "P2"; const action = a.count === 0 ? "Không xếp hạng; rà soát và bổ sung bằng chứng hợp đồng" : a.outstanding > 0 ? "CSKH phối hợp kế toán rà soát công nợ trước liên hệ bán hàng" : "CSKH liên hệ duy trì và rà soát nhu cầu tái ký"; return [id, name, queue, priority, a.count ? "CONTRACT_HISTORY_PRESENT" : "NEEDS_CONTRACT_EVIDENCE", a.count, a.revenue, a.profit, a.outstanding, queue === "DATA_GAP_CUSTOMER" ? 0 : 25, a.count ? "LINKED_CONTRACT" : "NO_LINKED_CONTRACT", action, "", "NOT_READY", `${path.basename(inputPath)} · 01 Khach hang + 02 Hop dong`]; });
function styleSheet(sheet, title, headersRow, rows, color) { const end = String.fromCharCode(64 + headersRow.length); sheet.showGridLines = false; sheet.tabColor = color; sheet.getRange(`A1:${end}1`).merge(); sheet.getRange("A1").values = [[title]]; sheet.getRange(`A2:${end}2`).values = [headersRow]; if (rows.length) sheet.getRange(`A3:${end}${rows.length + 2}`).values = rows; sheet.getRange(`A1:${end}1`).format = { font: { name: "Arial", size: 14, bold: true, color: "#17365D" } }; sheet.getRange(`A2:${end}2`).format = { fill: "#17365D", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, wrapText: true, horizontalAlignment: "center" }; if (rows.length) sheet.getRange(`A3:${end}${rows.length + 2}`).format = { font: { name: "Arial", size: 10 }, wrapText: true, verticalAlignment: "center" }; sheet.tables.add(`A2:${end}${rows.length + 2}`, true, title.replace(/[^A-Za-z0-9]/g, "").slice(0, 20)); sheet.freezePanes.freezeRows(2); sheet.getRange(`A:${end}`).format.autofitColumns(); sheet.getRange("B:B").format.columnWidth = 30; sheet.getRange("L:L").format.columnWidth = 46; }
const triageSheet = wb.worksheets.add("07 CSKH Triage");
styleSheet(triageSheet, "CUSTOMER TRIAGE V1 — EVIDENCE ONLY · SCORING LOCKED", ["Mã KH", "Tên công ty", "Hàng đợi", "Ưu tiên", "Trạng thái bằng chứng", "HĐ liên kết", "Doanh thu xác minh", "LN gộp xác minh", "Công nợ", "Coverage %", "Rule trigger", "Hành động CSKH", "Official score", "Score status", "Provenance"], triage, "#2F75B5");
const orphanSheet = wb.worksheets.add("08 Unattributed Contracts");
styleSheet(orphanSheet, "UNATTRIBUTED CONTRACTS — EXCLUDED FROM CUSTOMER METRICS", ["ID", "Sheet nguồn", "Dòng nguồn", "Mã HĐ", "Mã KH", "Tên công ty", "Ngày ký", "Loại công trình", "Tình trạng", "Giá trị HĐ", "Doanh thu ghi nhận", "Giá vốn", "Công nợ", "Issue code", "Disposition", "Evidence status", "Validator"], orphan, "#C55A11");
await fs.mkdir(outputDir, { recursive: true });
const preview = await wb.render({ sheetName: "07 CSKH Triage", autoCrop: "all", scale: 1, format: "png" }); await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const out = await SpreadsheetFile.exportXlsx(wb); await out.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath, triageRows: triage.length, unattributedRows: orphan.length, scoring: "LOCKED" }));
