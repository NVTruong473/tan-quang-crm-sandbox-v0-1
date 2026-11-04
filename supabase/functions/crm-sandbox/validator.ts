export type InputFile = { name: string; type: string; bytes: Uint8Array };
export type Materialization = {
  tables: Record<string, Array<Record<string, string>>>;
  record_counts: Record<string, number>;
  report: Record<string, unknown>;
};

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50_000;
const REQUIRED: Record<string, string[]> = {
  customer_360: ["customer_id", "customer_name", "revenue", "gross_profit", "outstanding", "weighted_pipeline"],
  scoring_sandbox: ["customer_id", "total_score", "segment"],
  opportunities: ["customer_id", "opportunity_name", "estimated_value", "probability_pct", "stage", "status"],
  crm_activities: ["customer_id", "activity_date", "activity_type", "summary", "outcome", "owner"],
};
const SOURCE_NAMES: Record<string, string[]> = {
  customer_360: ["customer_360", "customer360", "khach_hang", "khachhang", "customers"],
  scoring_sandbox: ["scoring_sandbox", "scoring", "scores", "diem_khach_hang"],
  opportunities: ["opportunities", "opportunity", "co_hoi", "pipeline"],
  crm_activities: ["crm_activities", "activities", "activity", "hoat_dong"],
};
const ALIASES: Record<string, string[]> = {
  customer_id: ["customer_id", "customer id", "ma_khach_hang", "mã khách hàng", "ma khach hang"], customer_name: ["customer_name", "customer name", "ten_khach_hang", "tên khách hàng", "ten khach hang"],
  revenue: ["revenue", "doanh_thu", "doanh thu"], gross_profit: ["gross_profit", "gross profit", "loi_nhuan_gop", "lợi nhuận gộp"], outstanding: ["outstanding", "cong_no", "công nợ"], weighted_pipeline: ["weighted_pipeline", "weighted pipeline", "pipeline_co_trong_so", "pipeline có trọng số"],
  total_score: ["total_score", "total score", "tong_diem", "tổng điểm"], segment: ["segment", "phan_khuc", "phân khúc", "nhom", "nhóm"], opportunity_name: ["opportunity_name", "opportunity name", "ten_co_hoi", "tên cơ hội"], estimated_value: ["estimated_value", "estimated value", "gia_tri_uoc_tinh", "giá trị ước tính"], probability_pct: ["probability_pct", "probability", "xac_suat", "xác suất"], stage: ["stage", "giai_doan", "giai đoạn"], status: ["status", "trang_thai", "trạng thái"], activity_date: ["activity_date", "activity date", "ngay_hoat_dong", "ngày hoạt động"], activity_type: ["activity_type", "activity type", "loai_hoat_dong", "loại hoạt động"], summary: ["summary", "tom_tat", "tóm tắt"], outcome: ["outcome", "ket_qua", "kết quả"], owner: ["owner", "nguoi_phu_trach", "người phụ trách"],
};
const normal = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const canonical = (value: string) => Object.entries(ALIASES).find(([, values]) => values.map(normal).includes(normal(value)))?.[0] ?? normal(value);
const text = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
const xmlDecode = (value: string) => value.replace(/&(?:amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (token, dec, hex) => dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }[token] ?? token));

function csv(source: string): Array<Record<string, string>> {
  if (source.includes("\0")) throw new Error("CSV_CONTAINS_NUL");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < source.length; i += 1) { const c = source[i]; if (quoted) { if (c === '"' && source[i + 1] === '"') { cell += c; i += 1; } else if (c === '"') quoted = false; else cell += c; } else if (c === '"') quoted = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; } else cell += c; }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE"); if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows.shift() ?? []).map(canonical); if (!headers.length || headers.some((v) => !v)) throw new Error("CSV_HEADERS_INVALID");
  return rows.filter((r) => r.some((v) => v.trim())).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function u16(v: DataView, o: number) { return v.getUint16(o, true); } function u32(v: DataView, o: number) { return v.getUint32(o, true); }
async function xlsx(bytes: Uint8Array): Promise<Map<string, Array<Record<string, string>>>> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("XLSX_SIGNATURE_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("XLSX_ZIP_INVALID"); const count = u16(view, eocd + 10); if (count > 200) throw new Error("XLSX_TOO_MANY_ENTRIES"); let p = u32(view, eocd + 16), total = 0; const entries = new Map<string, string>();
  for (let i = 0; i < count; i += 1) { if (u32(view, p) !== 0x02014b50) throw new Error("XLSX_DIRECTORY_INVALID"); const flags = u16(view, p + 8), method = u16(view, p + 10), compressed = u32(view, p + 20), expanded = u32(view, p + 24), nl = u16(view, p + 28), el = u16(view, p + 30), cl = u16(view, p + 32), offset = u32(view, p + 42), name = text(bytes.slice(p + 46, p + 46 + nl));
    total += expanded; if (flags & 1 || total > MAX_EXPANDED_BYTES || name.includes("..") || name.startsWith("/") || /vbaProject\.bin$/i.test(name)) throw new Error("XLSX_UNSAFE_ARCHIVE"); if (u32(view, offset) !== 0x04034b50) throw new Error("XLSX_LOCAL_ENTRY_INVALID"); const ln = u16(view, offset + 26), le = u16(view, offset + 28), payload = bytes.slice(offset + 30 + ln + le, offset + 30 + ln + le + compressed);
    let raw: Uint8Array; if (method === 0) raw = payload; else if (method === 8) raw = new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); else throw new Error("XLSX_COMPRESSION_UNSUPPORTED");
    if (name.endsWith(".xml") || name.endsWith(".rels")) { const value = text(raw); if (/<!DOCTYPE|<!ENTITY/i.test(value)) throw new Error("XLSX_XML_DTD_FORBIDDEN"); entries.set(name, value); } p += 46 + nl + el + cl;
  }
  const workbook = entries.get("xl/workbook.xml"), rels = entries.get("xl/_rels/workbook.xml.rels"); if (!workbook || !rels) throw new Error("XLSX_WORKBOOK_INVALID");
  const relationship = new Map([...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?/g)].map((m) => [m[1], m[2]]));
  const shared = [...(entries.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlDecode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const output = new Map<string, Array<Record<string, string>>>();
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?/g)) { const target = relationship.get(sheet[2]); const path = target ? `xl/${target.replace(/^\/?(?:xl\/)?/, "")}` : ""; const xml = entries.get(path); if (!xml) continue; const matrix: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) { const cells: string[] = []; for (const c of r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) { const ref = /\br="([A-Z]+)\d+"/i.exec(c[1])?.[1] ?? "A"; let col = 0; for (const char of ref.toUpperCase()) col = col * 26 + char.charCodeAt(0) - 64; const type = /\bt="([^"]+)"/.exec(c[1])?.[1]; const formula = /<f[\s>]/.test(c[2]); const value = formula ? "" : (/\<v\>([\s\S]*?)<\/v>/.exec(c[2])?.[1] ?? (/<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2])?.[1] ?? "")); cells[col - 1] = type === "s" ? (shared[Number(value)] ?? "") : xmlDecode(value); } matrix.push(cells); }
    const headers = (matrix.shift() ?? []).map(canonical); output.set(sheet[1], matrix.filter((r) => r.some((v) => String(v ?? "").trim())).map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()]))));
  } return output;
}

function tableKey(name: string, rows: Array<Record<string, string>>) { const n = normal(name.replace(/\.[^.]+$/, "")); return Object.keys(REQUIRED).find((k) => SOURCE_NAMES[k].map(normal).includes(n)) ?? Object.keys(REQUIRED).find((k) => REQUIRED[k].every((field) => field in (rows[0] ?? {}))) ?? null; }
function finite(row: Record<string, string>, field: string, table: string, index: number) { if (!Number.isFinite(Number(row[field]))) throw new Error(`${table}:ROW_${index + 2}_${field.toUpperCase()}_INVALID`); }
function field(row: Record<string, string>, ...aliases: string[]) { return Object.entries(row).find(([key]) => aliases.some((alias) => normal(key) === normal(alias) || normal(key).startsWith(normal(alias))))?.[1]?.trim() ?? ""; }
function numberOrZero(value: string) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function customerContractProfile(sources: Map<string, Array<Record<string, string>>>, sourceFile = "uploaded_workbook.xlsx"): Materialization | null {
  const customerSheet = [...sources.entries()].find(([name]) => normal(name).startsWith("01_khach_hang"));
  const contractSheet = [...sources.entries()].find(([name]) => normal(name).startsWith("02_hop_dong"));
  if (!customerSheet || !contractSheet) return null;
  const customers = customerSheet[1].filter((row) => field(row, "ma_kh") && field(row, "ten_cong_ty"));
  if (!customers.length) throw new Error("CUSTOMER_CONTRACT_PROFILE_CUSTOMERS_REQUIRED");
  const ids = new Set<string>();
  for (const customer of customers) { const id = field(customer, "ma_kh"); if (ids.has(id)) throw new Error("CUSTOMER_CONTRACT_PROFILE_DUPLICATE_CUSTOMER_ID"); ids.add(id); }
  const byCustomer = new Map<string, { count: number; revenue: number; profit: number; outstanding: number; incompleteCost: number }>();
  const contractsByCustomer = new Map<string, Array<Record<string, string> & { __source_row?: string }>>();
  let orphanContracts = 0; let validContracts = 0;
  const unattributedContracts: Array<Record<string, string>> = [];
  for (const [sourceIndex, rawRow] of contractSheet[1].entries()) {
    const row = Object.assign({}, rawRow, { __source_row: String(sourceIndex + 2) });
    const contractId = field(row, "ma_hd");
    const hasSourceData = Object.entries(rawRow).some(([key, value]) => key !== "__source_row" && String(value ?? "").trim());
    if (!contractId && !hasSourceData) continue;
    const customerId = field(row, "ma_kh"); if (!customerId || !ids.has(customerId)) {
      orphanContracts += 1;
      unattributedContracts.push({
        unattributed_id: `UNATTRIBUTED-${sourceIndex + 2}`,
        source_sheet: "02 Hop dong",
        source_row: String(sourceIndex + 2),
        contract_id: contractId,
        customer_id: customerId,
        company_name: field(row, "ten_cong_ty"),
        contract_date: field(row, "ngay_ky"),
        project_type: field(row, "loai_cong_trinh"),
        contract_status: field(row, "tinh_trang"),
        contract_value: String(numberOrZero(field(row, "gia_tri_hd"))),
        recognized_revenue: String(numberOrZero(field(row, "doanh_thu_ghi_nhan"))),
        cost: String(numberOrZero(field(row, "gia_von"))),
        outstanding: String(numberOrZero(field(row, "cong_no"))),
        issue_code: contractId ? "MISSING_CUSTOMER_KEY" : "MISSING_CONTRACT_AND_CUSTOMER_KEY",
        disposition: "EXCLUDED_FROM_CUSTOMER_METRICS",
        evidence_status: "UNATTRIBUTED",
        validator_version: "CUSTOMER_CONTRACT_WORKBOOK_ADAPTER_V1",
      });
      continue;
    }
    const status = field(row, "tinh_trang"); if (normal(status) === "huy") continue;
    const current = byCustomer.get(customerId) ?? { count: 0, revenue: 0, profit: 0, outstanding: 0, incompleteCost: 0 };
    current.count += 1; current.revenue += numberOrZero(field(row, "doanh_thu_ghi_nhan")); current.outstanding += numberOrZero(field(row, "cong_no"));
    if (normal(field(row, "xac_nhan_gia_von")) === "da_xac_nhan") current.profit += numberOrZero(field(row, "doanh_thu_ghi_nhan")) - numberOrZero(field(row, "gia_von")); else current.incompleteCost += 1;
    byCustomer.set(customerId, current); validContracts += 1;
    contractsByCustomer.set(customerId, [...(contractsByCustomer.get(customerId) ?? []), row]);
  }
  const customer360 = customers.map((row) => {
    const id = field(row, "ma_kh");
    const history = byCustomer.get(id) ?? { count: 0, revenue: 0, profit: 0, outstanding: 0, incompleteCost: 0 };
    const linked = contractsByCustomer.get(id) ?? [];
    const hasStartDate = Boolean(field(row, "bat_dau_hop_tac", "ngay_bat_dau_hop_tac"));
    const hasRevenue = linked.length > 0 && linked.every((contract) => field(contract, "doanh_thu_ghi_nhan"));
    const hasCost = linked.length > 0 && linked.every((contract) => field(contract, "gia_von") && field(contract, "xac_nhan_gia_von"));
    const hasRecentContribution = linked.some((contract) => field(contract, "nam") === "2026");
    const hasFrequency = linked.length > 0;
    const hasRecency = linked.some((contract) => field(contract, "ngay_ky"));
    const hasPayment = linked.length > 0 && linked.every((contract) => field(contract, "ngay_den_han") && field(contract, "ngay_thanh_toan") && field(contract, "thanh_toan"));
    const availableWeight = (hasRevenue && hasCost ? 25 : 0) + (hasRecentContribution ? 5 : 0) + (hasStartDate ? 8 : 0) + (hasFrequency ? 9 : 0) + (hasRecency ? 8 : 0) + (hasPayment ? 15 : 0);
    const evidence = history.count === 0 ? "NEEDS_CONTRACT_EVIDENCE" : history.incompleteCost > 0 ? "REVIEW_COST_EVIDENCE" : "CONTRACT_HISTORY_PRESENT";
    return { customer_id: id, customer_name: field(row, "ten_cong_ty"), revenue: String(history.revenue), gross_profit: String(history.profit), outstanding: String(history.outstanding), weighted_pipeline: "", contract_count: String(history.count), orphan_contract_count: String(orphanContracts), evidence_status: evidence, priority_reason: evidence === "NEEDS_CONTRACT_EVIDENCE" ? "Chưa có hợp đồng liên kết; cần bổ sung bằng chứng trước khi xếp tiềm năng." : "Có lịch sử hợp đồng đã liên kết; ưu tiên kiểm tra CSKH theo dữ liệu hợp đồng.", score_coverage_pct: String(availableWeight), score_status: "NOT_READY" };
  });
  const triage = customer360.map((row) => ({
    customer_id: row.customer_id,
    total_score: row.contract_count,
    segment: row.evidence_status,
    official_score: "",
    score_status: "NOT_READY",
    coverage_pct: row.score_coverage_pct,
    priority_reason: row.priority_reason,
    cskh_action: row.evidence_status === "NEEDS_CONTRACT_EVIDENCE" ? "Thu thập bằng chứng hợp đồng trước khi xếp hạng" : row.evidence_status === "REVIEW_COST_EVIDENCE" ? "Xác nhận giá vốn/công nợ trước khi đánh giá lợi nhuận" : "Phân công CSKH rà soát nhu cầu và khả năng tái ký",
  }));
  const cskhTriage = customer360.map((row) => {
    const linked = Number(row.contract_count || 0) > 0;
    const hasDebt = Number(row.outstanding || 0) > 0;
    const queue = !linked ? "DATA_GAP_CUSTOMER" : hasDebt ? "CSKH_RISK_REVIEW" : "CSKH_RELATIONSHIP_REVIEW";
    const priority = !linked ? "P3" : hasDebt ? "P1" : "P2";
    const action = !linked ? "Không xếp hạng; rà soát và bổ sung bằng chứng hợp đồng" : hasDebt ? "CSKH phối hợp kế toán rà soát công nợ trước liên hệ bán hàng" : "CSKH liên hệ duy trì và rà soát nhu cầu tái ký";
    return { customer_id: row.customer_id, customer_name: row.customer_name, triage_queue: queue, triage_priority: priority, evidence_status: row.evidence_status, linked_contract_count: row.contract_count, verified_revenue: row.revenue, verified_gross_profit: row.gross_profit, outstanding: row.outstanding, coverage_pct: row.score_coverage_pct, rule_trigger: !linked ? "NO_LINKED_CONTRACT" : hasDebt ? "LINKED_CONTRACT_WITH_OUTSTANDING" : "LINKED_CONTRACT_NO_OUTSTANDING", cskh_action: action, official_score: "", score_status: "NOT_READY", provenance_ref: `${sourceFile} · 01 Khach hang + 02 Hop dong` };
  });
  const queueCreatedAt = new Date().toISOString().slice(0, 10);
  const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const workQueue = cskhTriage.map((row) => { const slaDays = row.triage_priority === "P1" ? 1 : row.triage_priority === "P2" ? 5 : 10; return { task_id: `CSKH-${row.customer_id}-${queueCreatedAt.replace(/-/g, "")}`, customer_id: row.customer_id, customer_name: row.customer_name, queue: row.triage_queue, priority: row.triage_priority, task_type: row.triage_queue === "DATA_GAP_CUSTOMER" ? "EVIDENCE_REQUEST" : "CUSTOMER_FOLLOW_UP", task_status: "OPEN", owner: "UNASSIGNED", created_date: queueCreatedAt, due_date: addDays(queueCreatedAt, slaDays), sla_days: String(slaDays), action_required: row.cskh_action, source_rule: row.rule_trigger, evidence_ref: row.provenance_ref, score_status: "NOT_READY" }; });
  const evidenceLedger: Array<Record<string, string>> = [];
  const validatorVersion = "CUSTOMER_CONTRACT_WORKBOOK_ADAPTER_V1";
  const metricKeys: Record<string, string> = { "Doanh thu hợp đồng": "revenue", "Lợi nhuận gộp": "gross_profit", "Công nợ": "outstanding", "Số hợp đồng": "contract_count", "Coverage điểm": "coverage", "Trạng thái bằng chứng": "evidence_status" };
  const addEvidence = (customerId: string, label: string, value: string, fields: string, hint: string, derivation: string, status: string) => evidenceLedger.push({
    metric_key: metricKeys[label] ?? "metric", customer_id: customerId, metric_label: label, value,
    source_file: sourceFile, source_sheet: "01 Khach hang + 02 Hop dong", source_fields: fields, source_record_hint: hint,
    derivation, evidence_status: status, validator_version: validatorVersion,
  });
  for (const row of customer360) {
    const linked = contractsByCustomer.get(row.customer_id) ?? [];
    const hint = linked.length ? linked.map((contract) => `02 Hop dong!row_${contract.__source_row ?? "?"}`).join("; ") : "01 Khach hang!customer_id=" + row.customer_id;
    const status = row.evidence_status === "CONTRACT_HISTORY_PRESENT" ? "DIRECT_OR_DERIVED" : "MISSING_SOURCE_EVIDENCE";
    addEvidence(row.customer_id, "Doanh thu hợp đồng", row.revenue, "Mã KH; Doanh thu ghi nhận", hint, "SUM(Doanh thu ghi nhận) theo Mã KH, loại trừ hợp đồng hủy", status);
    addEvidence(row.customer_id, "Lợi nhuận gộp", row.gross_profit, "Mã KH; Doanh thu ghi nhận; Giá vốn; Xác nhận giá vốn", hint, "SUM(Doanh thu ghi nhận - Giá vốn) chỉ khi Xác nhận giá vốn=Đã xác nhận", row.evidence_status === "REVIEW_COST_EVIDENCE" ? "MISSING_COST_EVIDENCE" : status);
    addEvidence(row.customer_id, "Công nợ", row.outstanding, "Mã KH; Công nợ", hint, "SUM(Công nợ) theo Mã KH, loại trừ hợp đồng hủy", status);
    addEvidence(row.customer_id, "Số hợp đồng", row.contract_count, "Mã KH; Mã HĐ; Tình trạng", hint, "COUNT(Mã HĐ) theo Mã KH, loại trừ hợp đồng hủy", status);
    addEvidence(row.customer_id, "Coverage điểm", row.score_coverage_pct, "Các trường có dữ liệu trong 5 nhóm rule", hint, "Tổng trọng số sếp chỉ khi trường nguồn đủ; không nội suy ô trống", "DERIVED_WITH_COVERAGE");
    addEvidence(row.customer_id, "Trạng thái bằng chứng", row.evidence_status, "Mã KH; Mã HĐ; Giá vốn; Xác nhận giá vốn", hint, "Luật validator CUSTOMER_CONTRACT_WORKBOOK_ADAPTER_V1", status);
  }
  return { tables: { customer_360: customer360, scoring_sandbox: triage, cskh_triage: cskhTriage, work_queue: workQueue, unattributed_contracts: unattributedContracts, activity_outcome_ledger: [], opportunities: [], crm_activities: [], evidence_ledger: evidenceLedger }, record_counts: { customer_360: customer360.length, scoring_sandbox: triage.length, cskh_triage: cskhTriage.length, work_queue: workQueue.length, unattributed_contracts: unattributedContracts.length, activity_outcome_ledger: 0, opportunities: 0, crm_activities: 0, evidence_ledger: evidenceLedger.length }, report: { validator_version: validatorVersion, contract_version: "TAN_QUANG_CUSTOMER_CONTRACT_V1", source_profile: "CUSTOMER_CONTRACT", customers: customer360.length, linked_contracts: validContracts, quarantined_orphan_contracts: orphanContracts, deterministic_triage: { version: "TRIAGE_EVIDENCE_ONLY_V1", queues: ["CSKH_RISK_REVIEW", "CSKH_RELATIONSHIP_REVIEW", "DATA_GAP_CUSTOMER"], scoring: "DISABLED" }, work_queue: { rows: workQueue.length, activity_outcome_ledger: "EMPTY_APPEND_ONLY_READY_FOR_ENTRY" }, unattributed_contracts: { rows: unattributedContracts.length, disposition: "EXCLUDED_FROM_CUSTOMER_METRICS" }, evidence_ledger: { rows: evidenceLedger.length, grain: "customer-metric", raw_source_required: true }, scorecard: { rule_version: "BOSS_RULE_100_V1", official_scoring: "BLOCKED", reason: "MISSING_REQUIRED_DOMAINS", cskh_triage: "EVIDENCE_ONLY" }, unavailable_domains: ["sales_pipeline", "crm_activities", "approved_potential_score"], result: "VALIDATED_WITH_LIMITATIONS" } };
}
export async function validateAndMaterialize(files: InputFile[]): Promise<Materialization> {
  if (!files.length || files.length > 4) throw new Error("FILE_COUNT_INVALID"); const total = files.reduce((n, file) => n + file.bytes.byteLength, 0); if (total > MAX_SOURCE_BYTES) throw new Error("SOURCE_SIZE_EXCEEDS_8MB_VALIDATION_LIMIT"); const workbook = files.filter((f) => /\.xlsx$/i.test(f.name)); if (workbook.length > 1 || (workbook.length && files.length !== 1) || files.some((f) => !/\.(xlsx|csv)$/i.test(f.name))) throw new Error("INPUT_COMBINATION_INVALID");
  const sources = new Map<string, Array<Record<string, string>>>(); if (workbook.length) for (const [name, rows] of await xlsx(workbook[0].bytes)) sources.set(name, rows); else for (const file of files) sources.set(file.name, csv(text(file.bytes)));
  const profile = workbook.length ? customerContractProfile(sources, workbook[0].name) : null; if (profile) return profile;
  const tables: Record<string, Array<Record<string, string>>> = {}; for (const [name, rows] of sources) { const key = tableKey(name, rows); if (!key || tables[key]) throw new Error(`TABLE_NOT_RECOGNIZED_OR_DUPLICATE:${name}`); tables[key] = rows; }
  for (const [key, fields] of Object.entries(REQUIRED)) { const rows = tables[key]; if (!rows?.length) throw new Error(`TABLE_REQUIRED:${key}`); const missing = fields.filter((field) => !(field in rows[0])); if (missing.length) throw new Error(`HEADER_REQUIRED:${key}:${missing.join(",")}`); }
  const records = Object.values(tables).reduce((n, rows) => n + rows.length, 0); if (records > MAX_ROWS) throw new Error("ROW_LIMIT_EXCEEDED"); const ids = new Set<string>();
  tables.customer_360.forEach((r, i) => { if (!r.customer_id || !r.customer_name || ids.has(r.customer_id)) throw new Error(`CUSTOMER_ID_INVALID_OR_DUPLICATE:ROW_${i + 2}`); ids.add(r.customer_id); ["revenue", "gross_profit", "outstanding", "weighted_pipeline"].forEach((f) => finite(r, f, "customer_360", i)); });
  tables.scoring_sandbox.forEach((r, i) => { if (!ids.has(r.customer_id) || !r.segment) throw new Error(`SCORING_REFERENCE_INVALID:ROW_${i + 2}`); finite(r, "total_score", "scoring_sandbox", i); });
  tables.opportunities.forEach((r, i) => { if (!ids.has(r.customer_id) || !r.opportunity_name || !r.stage || !r.status) throw new Error(`OPPORTUNITY_REFERENCE_INVALID:ROW_${i + 2}`); finite(r, "estimated_value", "opportunities", i); const p = Number(r.probability_pct); if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`OPPORTUNITY_PROBABILITY_OUT_OF_RANGE:ROW_${i + 2}`); });
  tables.crm_activities.forEach((r, i) => { if (!ids.has(r.customer_id) || !r.activity_type || !r.summary || !r.outcome || !r.owner || !/^\d{4}-\d{2}-\d{2}$/.test(r.activity_date)) throw new Error(`ACTIVITY_INVALID:ROW_${i + 2}`); });
  return { tables, record_counts: Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.length])), report: { validator_version: "SERVER_VALIDATOR_V1", contract_version: "DATA_CONTRACT_V1", source_files: files.map((f) => ({ name: f.name, bytes: f.bytes.byteLength })), total_records: records, result: "VALIDATED" } };
}
