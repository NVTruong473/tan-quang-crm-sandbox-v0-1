let RELEASE = "v0.1-31ed10f5fde0";
const API_BASE = "https://fxwgehtnytdqqwabgemw.supabase.co/functions/v1/crm-sandbox";
const AUTH_SESSION_KEY = "tq-crm-admin-session";
let dataLoaded = false;

const DATA = {
  customer360: `${API_BASE}/data/customer_360.csv`,
  scoring: `${API_BASE}/data/scoring_sandbox.csv`,
  opportunities: `${API_BASE}/data/opportunities.csv`,
  activities: `${API_BASE}/data/crm_activities.csv`,
  evidence: `${API_BASE}/data/evidence_ledger.csv`,
};

const state = {
  customer360: [],
  scoring: [],
  opportunities: [],
  activities: [],
  evidence: [],
  customerMap: new Map(),
  scoreMap: new Map(),
  importCandidate: null,
};

const IMPORT_CONTRACT = {
  customer360: {
    label: "customer_360",
    sourceNames: ["customer_360", "customer360", "khach_hang", "khachhang", "customers"],
    required: ["customer_id", "customer_name", "revenue", "gross_profit", "outstanding", "weighted_pipeline"],
  },
  scoring: {
    label: "scoring_sandbox",
    sourceNames: ["scoring_sandbox", "scoring", "scores", "diem_khach_hang"],
    required: ["customer_id", "total_score", "segment"],
  },
  opportunities: {
    label: "opportunities",
    sourceNames: ["opportunities", "opportunity", "co_hoi", "pipeline"],
    required: ["customer_id", "opportunity_name", "estimated_value", "probability_pct", "stage", "status"],
  },
  activities: {
    label: "crm_activities",
    sourceNames: ["crm_activities", "activities", "activity", "hoat_dong"],
    required: ["customer_id", "activity_date", "activity_type", "summary", "outcome", "owner"],
  },
};

const HEADER_ALIASES = {
  customer_id: ["customer_id", "customer id", "ma_khach_hang", "mã khách hàng", "ma khach hang"],
  customer_name: ["customer_name", "customer name", "ten_khach_hang", "tên khách hàng", "ten khach hang"],
  revenue: ["revenue", "doanh_thu", "doanh thu"],
  gross_profit: ["gross_profit", "gross profit", "loi_nhuan_gop", "lợi nhuận gộp"],
  outstanding: ["outstanding", "cong_no", "công nợ"],
  weighted_pipeline: ["weighted_pipeline", "weighted pipeline", "pipeline_co_trong_so", "pipeline có trọng số"],
  total_score: ["total_score", "total score", "tong_diem", "tổng điểm"],
  segment: ["segment", "phan_khuc", "phân khúc", "nhom", "nhóm"],
  opportunity_name: ["opportunity_name", "opportunity name", "ten_co_hoi", "tên cơ hội"],
  estimated_value: ["estimated_value", "estimated value", "gia_tri_uoc_tinh", "giá trị ước tính"],
  probability_pct: ["probability_pct", "probability", "xac_suat", "xác suất"],
  stage: ["stage", "giai_doan", "giai đoạn"],
  status: ["status", "trang_thai", "trạng thái"],
  activity_date: ["activity_date", "activity date", "ngay_hoat_dong", "ngày hoạt động"],
  activity_type: ["activity_type", "activity type", "loai_hoat_dong", "loại hoạt động"],
  summary: ["summary", "tom_tat", "tóm tắt"],
  outcome: ["outcome", "ket_qua", "kết quả"],
  owner: ["owner", "nguoi_phu_trach", "người phụ trách"],
};

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function canonicalHeader(value) {
  const source = normalize(value);
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.map(normalize).includes(source)) return canonical;
  }
  return source;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function rowsToObjects(rows) {
  const headers = (rows.shift() || []).map(canonicalHeader);
  return rows
    .filter((values) => values.some((value) => String(value ?? "").trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])));
}

function readUint32(view, offset) { return view.getUint32(offset, true); }
function readUint16(view, offset) { return view.getUint16(offset, true); }

async function unzipXlsxEntries(buffer) {
  if (!("DecompressionStream" in window)) throw new Error("Trình duyệt này chưa hỗ trợ đọc XLSX an toàn. Hãy dùng Chrome/Edge mới hoặc xuất CSV.");
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (readUint32(view, index) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new Error("File XLSX không có cấu trúc ZIP hợp lệ.");
  const entryCount = readUint16(view, end + 10);
  if (entryCount > 400) throw new Error("Workbook có quá nhiều thành phần để kiểm tra an toàn.");
  let pointer = readUint32(view, end + 16);
  const decoder = new TextDecoder();
  const entries = new Map();
  let expandedSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, pointer) !== 0x02014b50) throw new Error("Không thể đọc mục lục XLSX.");
    if (readUint16(view, pointer + 8) & 0x0001) throw new Error("Workbook được mã hóa không thể kiểm tra trong trình duyệt.");
    const compression = readUint16(view, pointer + 10);
    const compressedSize = readUint32(view, pointer + 20);
    const uncompressedSize = readUint32(view, pointer + 24);
    expandedSize += uncompressedSize;
    if (expandedSize > 80 * 1024 * 1024) throw new Error("Workbook có kích thước giải nén vượt giới hạn kiểm tra an toàn.");
    const fileNameLength = readUint16(view, pointer + 28);
    const extraLength = readUint16(view, pointer + 30);
    const commentLength = readUint16(view, pointer + 32);
    const localOffset = readUint32(view, pointer + 42);
    const path = decoder.decode(bytes.slice(pointer + 46, pointer + 46 + fileNameLength));
    if (readUint32(view, localOffset) !== 0x04034b50) throw new Error("Không thể đọc một tệp bên trong XLSX.");
    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const payloadStart = localOffset + 30 + localNameLength + localExtraLength;
    const payload = bytes.slice(payloadStart, payloadStart + compressedSize);
    let content;
    if (compression === 0) content = payload;
    else if (compression === 8) content = new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else throw new Error("Workbook dùng kiểu nén không được hỗ trợ.");
    entries.set(path, decoder.decode(content));
    pointer += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function excelColumn(reference) {
  const letters = String(reference || "A").match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function xlsxText(node) { return [...node.querySelectorAll("t")].map((part) => part.textContent || "").join(""); }

function parseXlsxSheet(xml, sharedStrings) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("Không thể đọc sheet XLSX.");
  return [...documentXml.querySelectorAll("sheetData > row")].map((row) => {
    const values = [];
    row.querySelectorAll("c").forEach((cell) => {
      const index = excelColumn(cell.getAttribute("r"));
      const type = cell.getAttribute("t");
      const raw = cell.querySelector("v")?.textContent || "";
      values[index] = type === "s" ? (sharedStrings[Number(raw)] || "") : (type === "inlineStr" ? xlsxText(cell) : raw);
    });
    return values;
  });
}

async function parseXlsx(file) {
  const entries = await unzipXlsxEntries(await file.arrayBuffer());
  const workbook = entries.get("xl/workbook.xml");
  const relations = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !relations) throw new Error("Workbook XLSX thiếu thông tin sheet.");
  const sharedStringsXml = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml
    ? [...new DOMParser().parseFromString(sharedStringsXml, "application/xml").querySelectorAll("si")].map(xlsxText)
    : [];
  const workbookDoc = new DOMParser().parseFromString(workbook, "application/xml");
  const relDoc = new DOMParser().parseFromString(relations, "application/xml");
  const relationsById = new Map([...relDoc.querySelectorAll("Relationship")].map((item) => [item.getAttribute("Id"), item.getAttribute("Target")]));
  const sheets = new Map();
  workbookDoc.querySelectorAll("sheets > sheet").forEach((sheet) => {
    const id = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = relationsById.get(id);
    if (!target) return;
    const path = `xl/${target.replace(/^\//, "").replace(/^xl\//, "")}`;
    const content = entries.get(path);
    if (content) sheets.set(sheet.getAttribute("name") || "Sheet", rowsToObjects(parseXlsxSheet(content, sharedStrings)));
  });
  return sheets;
}

function detectContract(sourceName, rows) {
  const source = normalize(sourceName.replace(/\.[^.]+$/, ""));
  const headers = new Set(Object.keys(rows[0] || {}).map(canonicalHeader));
  const candidates = Object.entries(IMPORT_CONTRACT).map(([key, contract]) => {
    const nameMatch = contract.sourceNames.map(normalize).includes(source);
    const matched = contract.required.filter((header) => headers.has(header));
    return { key, nameMatch, matched, coverage: matched.length / contract.required.length };
  }).sort((first, second) => (Number(second.nameMatch) - Number(first.nameMatch)) || (second.coverage - first.coverage));
  const winner = candidates[0];
  return winner && (winner.nameMatch || winner.coverage >= 0.7) ? winner.key : null;
}

async function fingerprint(files) {
  const bytes = new Uint8Array(await Promise.all([...files].map((file) => file.arrayBuffer())).then((parts) => {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => { output.set(new Uint8Array(part), offset); offset += part.byteLength; });
    return output.buffer;
  }));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

const money = (value) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value || 0))} ₫`;
const moneyOrNA = (value) => String(value ?? "").trim() === "" ? "Chưa có dữ liệu" : money(value);
const compact = (value) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
const pct = (value) => new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 }).format(Number(value || 0));
const escapeHTML = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[character]));

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
    email: session.user?.email || "",
  }));
}

function clearSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const response = await fetch(`${window.TQ_SUPABASE.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: window.TQ_SUPABASE.publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) return null;
  const refreshed = await response.json();
  saveSession(refreshed);
  return readSession();
}

async function activeSession() {
  const session = readSession();
  if (!session) return null;
  if (Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 30) return session;
  return refreshSession(session);
}

async function load() {
  let session = await activeSession();
  if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");
  const entries = [];
  for (const [key, url] of Object.entries(DATA)) {
    let response = await fetch(url, {
      headers: {
        apikey: window.TQ_SUPABASE.publishableKey,
        authorization: `Bearer ${session.access_token}`,
      },
    });
    if (response.status === 401) {
      session = await refreshSession(session);
      if (session) response = await fetch(url, { headers: { apikey: window.TQ_SUPABASE.publishableKey, authorization: `Bearer ${session.access_token}` } });
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clearSession();
      throw new Error(`Không tải được ${url}`);
    }
    entries.push([key, parseCSV(await response.text())]);
  }

  Object.assign(state, Object.fromEntries(entries));
  state.scoreMap = new Map(state.scoring.map((row) => [row.customer_id, row]));
  state.customerMap = new Map(state.customer360.map((row) => [row.customer_id, row]));
  renderAll();
}

async function unlockApplication() {
  if (!dataLoaded) {
    await load();
    dataLoaded = true;
  }
  document.body.classList.remove("locked");
  document.body.classList.add("unlocked");
  refreshReleaseRegistry();
}

async function handleAccess(event) {
  event.preventDefault();
  const input = document.querySelector("#access-code");
  const error = document.querySelector("#access-error");
  const button = event.currentTarget.querySelector("button");
  const email = document.querySelector("#access-email").value.trim();
  const password = input.value;
  if (!email || !password) {
    error.textContent = "Vui lòng nhập email và mật khẩu.";
    return;
  }
  button.disabled = true;
  error.textContent = "";
  try {
    const response = await fetch(`${window.TQ_SUPABASE.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: window.TQ_SUPABASE.publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const session = await response.json();
    if (!response.ok || !session.access_token) throw new Error("Email hoặc mật khẩu không đúng.");
    saveSession(session);
    await unlockApplication();
    input.value = "";
  } catch (loginError) {
    clearSession();
    error.textContent = loginError.message || "Không thể đăng nhập.";
    input.select();
  } finally {
    button.disabled = false;
  }
}

async function handleLogout() {
  const session = readSession();
  clearSession();
  if (session?.access_token) {
    fetch(`${window.TQ_SUPABASE.url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: window.TQ_SUPABASE.publishableKey, authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  window.location.reload();
}

function renderAll() {
  renderKPIs();
  renderBars();
  renderSegments();
  renderAttention();
  renderPipelineSummary();
  renderCustomers();
  renderOpportunities();
  renderActivities();
}

function contractRows(candidate) {
  return Object.entries(IMPORT_CONTRACT).map(([key, contract]) => {
    const item = candidate?.tables?.[key];
    const missing = item ? contract.required.filter((header) => !item.headers.has(header)) : contract.required;
    const status = item && missing.length === 0 && item.rows.length > 0 ? "READY" : (item ? "BLOCKED" : "MISSING");
    return { key, contract, item, missing, status };
  });
}

function renderIntake(candidate) {
  const body = document.querySelector("#intake-table");
  const summary = document.querySelector("#intake-summary");
  const fingerprintLabel = document.querySelector("#intake-fingerprint");
  const preview = document.querySelector("#preview-release");
  const persist = document.querySelector("#persist-import");
  if (!candidate) {
    body.innerHTML = "";
    summary.textContent = "Chọn file để xem sheet, cột nhận diện, bản ghi và các lỗi chặn phát hành.";
    fingerprintLabel.textContent = "Chưa có fingerprint";
    preview.disabled = true;
    persist.disabled = true;
    return;
  }
  const rows = contractRows(candidate);
  const ready = rows.every((row) => row.status === "READY");
  body.innerHTML = rows.map((row) => `<tr><td><code>${row.contract.label}</code></td><td>${escapeHTML(row.item?.source || "—")}</td><td>${row.item ? row.item.rows.length.toLocaleString("vi-VN") : "—"}</td><td><span class="import-state ${row.status.toLowerCase()}">${row.status}</span></td><td>${row.missing.length ? escapeHTML(row.missing.join(", ")) : "—"}</td></tr>`).join("");
  const extras = candidate.unmatched.length ? ` ${candidate.unmatched.length} sheet/file chưa nhận diện sẽ không được dùng.` : "";
  summary.innerHTML = ready
    ? `<strong>Đạt điều kiện sandbox preview.</strong> Đã kiểm tra ${candidate.files.length} file, nhận diện đủ 4 bảng và ${candidate.totalRows.toLocaleString("vi-VN")} bản ghi.${extras}`
    : `<strong>Chưa thể phát hành.</strong> Cần đủ 4 bảng theo Data Contract, có đủ cột tối thiểu và ít nhất một bản ghi mỗi bảng.${extras}`;
  fingerprintLabel.textContent = `SHA-256: ${candidate.hash.slice(0, 12)}…`;
  preview.disabled = !ready;
  persist.disabled = !ready;
}

function setIntakeStatus(message, kind = "neutral") {
  const status = document.querySelector("#intake-status");
  status.textContent = message;
  status.className = `intake-status ${kind}`;
}

async function preflightFiles(files) {
  const accepted = [...files].filter((file) => /\.(csv|xlsx)$/i.test(file.name));
  if (!accepted.length) throw new Error("Hãy chọn file .xlsx hoặc .csv.");
  if (accepted.length > 4) throw new Error("Chỉ nhận tối đa 4 CSV, hoặc 1 workbook XLSX trong một phiên kiểm tra.");
  if (accepted.some((file) => file.size > 20 * 1024 * 1024)) throw new Error("Mỗi file tối đa 20 MB trong bước kiểm tra tại trình duyệt.");
  if (accepted.filter((file) => /\.xlsx$/i.test(file.name)).length > 1 || (accepted.length > 1 && accepted.some((file) => /\.xlsx$/i.test(file.name)))) {
    throw new Error("Chọn đúng một workbook XLSX, hoặc một nhóm CSV; không trộn hai loại trong cùng phiên.");
  }
  const tables = {};
  const unmatched = [];
  for (const file of accepted) {
    const sources = /\.csv$/i.test(file.name)
      ? new Map([[file.name, parseCSV(await file.text()).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [canonicalHeader(key), value])))]] )
      : await parseXlsx(file);
    for (const [source, rows] of sources) {
      const key = detectContract(source, rows);
      if (!key || tables[key]) { unmatched.push(source); continue; }
      tables[key] = { source, rows, headers: new Set(Object.keys(rows[0] || {}).map(canonicalHeader)) };
    }
  }
  return { files: accepted, tables, unmatched, hash: await fingerprint(accepted), totalRows: Object.values(tables).reduce((total, item) => total + item.rows.length, 0) };
}

async function handleImportFiles(event) {
  const files = event.currentTarget.files;
  try {
    setIntakeStatus("Đang đọc cục bộ và kiểm tra Data Contract…", "working");
    const candidate = await preflightFiles(files);
    state.importCandidate = candidate;
    renderIntake(candidate);
    const ready = contractRows(candidate).every((row) => row.status === "READY");
    setIntakeStatus(ready ? "Đạt điều kiện nạp bản xem trước sandbox. Chưa có dữ liệu nào được tải lên." : "Đã phát hiện lỗi hợp đồng. Dữ liệu đang xem vẫn không thay đổi.", ready ? "ready" : "blocked");
  } catch (error) {
    state.importCandidate = null;
    renderIntake(null);
    setIntakeStatus(error.message || "Không thể kiểm tra file.", "blocked");
  }
}

function loadPreviewRelease() {
  const candidate = state.importCandidate;
  if (!candidate || !contractRows(candidate).every((row) => row.status === "READY")) return;
  state.customer360 = candidate.tables.customer360.rows;
  state.scoring = candidate.tables.scoring.rows;
  state.opportunities = candidate.tables.opportunities.rows;
  state.activities = candidate.tables.activities.rows;
  state.scoreMap = new Map(state.scoring.map((row) => [row.customer_id, row]));
  state.customerMap = new Map(state.customer360.map((row) => [row.customer_id, row]));
  RELEASE = `local-preview-${candidate.hash.slice(0, 10)}`;
  document.querySelector("#active-release").textContent = "Bản xem trước cục bộ";
  document.querySelector("#active-release-status").textContent = "Chỉ tồn tại trong trình duyệt";
  document.querySelector("#active-release-code").textContent = `${RELEASE} · LOCAL_PREVIEW_ONLY`;
  document.querySelector(".warning").innerHTML = "<div><strong>BẢN XEM TRƯỚC CỤC BỘ</strong><span>Dữ liệu chỉ tồn tại trong phiên trình duyệt này. Tải lại trang sẽ quay về bản thử nghiệm đã phát hành; không có ghi dữ liệu sang production.</span></div><details class=\"technical-details\"><summary>Thông tin kỹ thuật</summary><code>release=" + escapeHTML(RELEASE) + " · LOCAL_PREVIEW_ONLY</code></details>";
  renderAll();
  setIntakeStatus("Đã nạp bản xem trước cục bộ. Dashboard đã đổi theo input này; tải lại trang để quay về release đã phát hành.", "ready");
  setView("overview");
}

async function persistImport() {
  const candidate = state.importCandidate;
  const button = document.querySelector("#persist-import");
  if (!candidate || !contractRows(candidate).every((row) => row.status === "READY")) return;
  let session = await activeSession();
  if (!session) { setIntakeStatus("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi lưu file.", "blocked"); return; }
  button.disabled = true;
  setIntakeStatus("Đang lưu file vào kho riêng tư và tạo phiên xét duyệt…", "working");
  try {
    const form = () => { const value = new FormData(); candidate.files.forEach((file) => value.append("files", file, file.name)); return value; };
    let response = await fetch(`${API_BASE}/imports`, { method: "POST", headers: { apikey: window.TQ_SUPABASE.publishableKey, authorization: `Bearer ${session.access_token}` }, body: form() });
    if (response.status === 401) {
      session = await refreshSession(session);
      if (session) response = await fetch(`${API_BASE}/imports`, { method: "POST", headers: { apikey: window.TQ_SUPABASE.publishableKey, authorization: `Bearer ${session.access_token}` }, body: form() });
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Không thể lưu phiên nhập.");
    setIntakeStatus(result.duplicate ? "File này đã có fingerprint trùng. Hệ thống giữ nguyên phiên bản cũ, không tạo bản sao." : `Server đã kiểm tra và vật liệu hóa phiên ${String(result.id).slice(0, 8)}…. Dashboard chưa thay đổi; cần tạo release, duyệt chéo rồi mới kích hoạt.`, "ready");
    refreshReleaseRegistry();
  } catch (error) {
    setIntakeStatus(error.message || "Không thể lưu file.", "blocked");
  } finally {
    button.disabled = false;
  }
}

async function serverRequest(path, options = {}) {
  let session = await activeSession(); if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");
  const init = () => ({ ...options, headers: { apikey: window.TQ_SUPABASE.publishableKey, authorization: `Bearer ${session.access_token}`, "content-type": "application/json", ...(options.headers || {}) } });
  let response = await fetch(`${API_BASE}${path}`, init());
  if (response.status === 401 && (session = await refreshSession(session))) response = await fetch(`${API_BASE}${path}`, init());
  const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.reason || body.error || "Server từ chối thao tác."); return body;
}

function releaseActionButton(label, action, id, extra = "") { return `<button class="text-button server-action" data-server-action="${action}" data-server-id="${id}" ${extra}>${label}</button>`; }
async function refreshReleaseRegistry() {
  const imports = document.querySelector("#server-import-table"), releases = document.querySelector("#server-release-table"); if (!imports || !releases || !readSession()) return;
  try {
    const [importResponse, releaseResponse] = await Promise.all([serverRequest("/imports"), serverRequest("/releases")]);
    imports.innerHTML = (importResponse.data || []).map((row) => {
      const validated = row.status === "VALIDATED" && row.materialized_at;
      return `<tr><td><code>${escapeHTML(String(row.id).slice(0, 8))}</code><br><small>${escapeHTML(row.original_filename)}</small></td><td><span class="import-state ${validated ? "ready" : "blocked"}">${validated ? "SERVER VALIDATED" : escapeHTML(row.status)}</span></td><td>${Number(row.materialized_row_count || 0).toLocaleString("vi-VN")}</td><td>${validated ? releaseActionButton("Tạo release", "create", row.id) : "—"}</td></tr>`;
    }).join("") || '<tr><td colspan="4">Chưa có phiên nhập đã kiểm tra.</td></tr>';
    releases.innerHTML = (releaseResponse.data || []).map((row) => `<tr><td><code>${escapeHTML(row.release_code)}</code></td><td><span class="import-state ${row.status === "ACTIVE" ? "ready" : "blocked"}">${escapeHTML(row.status)}</span></td><td>${new Date(row.created_at).toLocaleString("vi-VN")}</td><td>${row.status === "PENDING_APPROVAL" ? releaseActionButton("Phê duyệt", "approve", row.id) : row.status === "APPROVED" ? releaseActionButton("Kích hoạt sandbox", "activate", row.id) : "—"}</td></tr>`).join("") || '<tr><td colspan="4">Chưa có release candidate.</td></tr>';
  } catch (error) { setIntakeStatus(error.message || "Không tải được registry riêng tư.", "blocked"); }
}

async function handleReleaseAction(button) {
  const action = button.dataset.serverAction, id = button.dataset.serverId; if (!action || !id) return; button.disabled = true;
  try {
    const body = action === "create" ? { import_id: id, release_code: `SBX-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`, notes: "Server materialized sandbox release" } : { release_id: id };
    await serverRequest(`/releases/${action}`, { method: "POST", body: JSON.stringify(body) });
    setIntakeStatus(action === "create" ? "Đã tạo release candidate. Một quản trị viên khác phải phê duyệt." : action === "approve" ? "Đã phê duyệt chéo. Release có thể kích hoạt vào sandbox." : "Đã kích hoạt release sandbox. Dashboard sẽ nạp bản này khi tải lại.", "ready");
    await refreshReleaseRegistry();
  } catch (error) { setIntakeStatus(error.message || "Thao tác release bị từ chối.", "blocked"); } finally { button.disabled = false; }
}

function renderKPIs() {
  const totals = state.customer360.reduce((aggregate, row) => ({ revenue: aggregate.revenue + Number(row.revenue || 0), profit: aggregate.profit + Number(row.gross_profit || 0), outstanding: aggregate.outstanding + Number(row.outstanding || 0) }), { revenue: 0, profit: 0, outstanding: 0 });
  const withHistory = state.customer360.filter((row) => Number(row.contract_count || 0) > 0).length;
  const needsEvidence = state.customer360.filter((row) => row.evidence_status === "NEEDS_CONTRACT_EVIDENCE").length;

  const items = [
    ["Khách hàng có lịch sử HĐ", withHistory, "Có thể bắt đầu rà soát CSKH", "contract_count"],
    ["Cần bổ sung bằng chứng", needsEvidence, "Chưa đủ dữ liệu để xếp tiềm năng", "evidence_status"],
    ["Doanh thu từ hợp đồng", money(totals.revenue), "Chỉ tổng hợp hợp đồng đã liên kết", "revenue"],
    ["Công nợ đang ghi nhận", money(totals.outstanding), "Theo hợp đồng được liên kết", "outstanding"],
  ];

  document.querySelector("#kpi-grid").innerHTML = items.map(([label, value, note, key]) => (
    `<article class="kpi"><span>${label} <button class="evidence-button" data-evidence-key="${key}" aria-label="Xem bằng chứng cho ${label}" title="Rê chuột để xem nguồn · Bấm để xem chi tiết">i</button></span><strong>${value}</strong><small>${note}</small></article>`
  )).join("");
}

function renderBars() {
  const rows = [...state.customer360].sort((first, second) => Number(second.revenue) - Number(first.revenue)).slice(0, 8);
  const max = Math.max(...rows.map((row) => Number(row.revenue)), 1);
  document.querySelector("#revenue-bars").innerHTML = rows.map((row) => (
    `<div class="bar-row"><span>${row.customer_id}</span><div class="bar-track"><div class="bar-fill" style="width:${(Number(row.revenue) / max * 100).toFixed(1)}%"></div></div><b>${compact(row.revenue)} <button class="evidence-button" data-evidence-customer="${row.customer_id}" aria-label="Xem bằng chứng ${row.customer_id}" title="Bấm để xem nguồn và công thức">i</button></b></div>`
  )).join("");
}

function renderSegments() {
  const colors = { CONTRACT_HISTORY_PRESENT: "#2f75b5", NEEDS_CONTRACT_EVIDENCE: "#ed7d31", REVIEW_COST_EVIDENCE: "#b54708" };
  const labels = { CONTRACT_HISTORY_PRESENT: "Có lịch sử hợp đồng", NEEDS_CONTRACT_EVIDENCE: "Cần bổ sung dữ liệu", REVIEW_COST_EVIDENCE: "Cần kiểm tra giá vốn" };
  const counts = { CONTRACT_HISTORY_PRESENT: 0, NEEDS_CONTRACT_EVIDENCE: 0, REVIEW_COST_EVIDENCE: 0 };
  state.scoring.forEach((row) => { if (row.segment in counts) counts[row.segment] += 1; });
  const total = state.scoring.length || 1;
  let cursor = 0;
  const stops = Object.entries(counts).map(([segment, count]) => {
    const start = cursor;
    cursor += count / total * 360;
    return `${colors[segment]} ${start}deg ${cursor}deg`;
  }).join(",");
  const legend = Object.entries(counts).map(([segment, count]) => (
    `<span><i class="swatch" style="background:${colors[segment]}"></i>${labels[segment]}: ${count}</span>`
  )).join("");
  document.querySelector("#segment-ring").innerHTML = `<div class="ring" style="background:conic-gradient(${stops})"></div><div class="ring-legend">${legend}</div>`;
}

function renderAttention() {
  const rows = [...state.customer360].sort((first, second) => Number(second.contract_count || 0) - Number(first.contract_count || 0)).slice(0, 5);
  document.querySelector("#attention-list").innerHTML = rows.map((row) => (
    `<div class="account-row" data-customer="${row.customer_id}" tabindex="0"><div><strong>${escapeHTML(row.customer_name)}</strong><span>${row.customer_id} · ${escapeHTML(row.priority_reason || "Cần rà soát dữ liệu")}</span></div><div class="amount">${Number(row.contract_count || 0)} HĐ</div><div class="segment">${state.scoreMap.get(row.customer_id)?.segment === "CONTRACT_HISTORY_PRESENT" ? "Rà soát" : "Bổ sung"}</div></div>`
  )).join("");
}

function renderPipelineSummary() {
  const linked = state.customer360.filter((row) => Number(row.contract_count || 0) > 0);
  const revenue = linked.reduce((total, row) => total + Number(row.revenue || 0), 0);
  const orphans = Number(state.customer360[0]?.orphan_contract_count || 0);
  document.querySelector("#pipeline-summary").innerHTML = [
    ["Khách có HĐ liên kết", linked.length],
    ["Hợp đồng chưa gắn khách", orphans],
    ["Doanh thu có bằng chứng", money(revenue)],
  ].map(([label, value]) => `<div class="pipeline-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderCustomers() {
  const query = document.querySelector("#customer-search").value.trim().toLowerCase();
  const segment = document.querySelector("#segment-filter").value;
  const rows = state.customer360.filter((row) => {
    const matchesText = !query || row.customer_id.toLowerCase().includes(query) || row.customer_name.toLowerCase().includes(query);
    const matchesSegment = segment === "ALL" || state.scoreMap.get(row.customer_id)?.segment === segment;
    return matchesText && matchesSegment;
  }).sort((first, second) => Number(second.revenue) - Number(first.revenue));

  const body = rows.map((row) => {
    const status = row.evidence_status === "CONTRACT_HISTORY_PRESENT" ? "Có bằng chứng" : row.evidence_status === "REVIEW_COST_EVIDENCE" ? "Kiểm tra giá vốn" : "Thiếu bằng chứng";
    return `<tr data-customer="${row.customer_id}"><td><div class="customer-cell"><strong>${escapeHTML(row.customer_name)}</strong><span>${row.customer_id}</span></div></td><td>${moneyOrNA(row.revenue)} <button class="evidence-button" data-evidence-customer="${row.customer_id}" aria-label="Xem bằng chứng ${row.customer_id}" title="Bấm để xem nguồn và công thức">i</button></td><td>${moneyOrNA(row.gross_profit)}</td><td>${moneyOrNA(row.outstanding)}</td><td>${Number(row.contract_count || 0)}</td><td><span class="segment">${status}</span></td><td>${escapeHTML(row.priority_reason || "Cần rà soát")}</td></tr>`;
  }).join("");
  document.querySelector("#customer-table").innerHTML = body || '<tr><td colspan="7">Không có kết quả phù hợp.</td></tr>';
}

function renderOpportunities() {
  const stages = ["IDENTIFIED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "ON_HOLD"];
  document.querySelector("#opportunity-board").innerHTML = stages.map((stage) => {
    const rows = state.opportunities.filter((row) => row.stage === stage && row.status === "OPEN");
    const cards = rows.map((row) => `<div class="opp-card"><strong>${escapeHTML(row.opportunity_name)}</strong><span>${row.customer_id}</span><span>${money(row.estimated_value)} · ${pct(row.probability_pct)}</span></div>`).join("");
    return `<div class="stage"><h3>${stage} · ${rows.length}</h3>${cards || '<span class="muted">Không có bản ghi</span>'}</div>`;
  }).join("");
}

function renderActivities() {
  const rows = [...state.activities].sort((first, second) => second.activity_date.localeCompare(first.activity_date)).slice(0, 30);
  document.querySelector("#activity-feed").innerHTML = rows.map((row) => (
    `<div class="activity"><time>${row.activity_date}</time><span class="type">${row.activity_type}</span><div><strong>${escapeHTML(row.summary)}</strong><span class="muted">${row.customer_id} · ${escapeHTML(row.outcome)}</span></div><span class="owner">${row.owner}</span></div>`
  )).join("");
}

function showCustomer(id) {
  const row = state.customerMap.get(id);
  const score = state.scoreMap.get(id);
  if (!row) return;
  const metrics = [
    ["Số hợp đồng liên kết", row.contract_count || "0"],
    ["Doanh thu hợp đồng", moneyOrNA(row.revenue)],
    ["Lợi nhuận đã xác nhận", moneyOrNA(row.gross_profit)],
    ["Công nợ", moneyOrNA(row.outstanding)],
    ["Trạng thái bằng chứng", row.evidence_status || "Chưa xác định"],
  ];
  const metricHTML = metrics.map(([label, value]) => `<div class="detail-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
  const evidence = state.evidence.filter((item) => item.customer_id === id);
  const evidenceHTML = evidence.length ? `<div class="evidence-ledger"><h3>Bằng chứng & cách tính</h3>${evidence.map((item) => `<details class="evidence-row"><summary><strong>${escapeHTML(item.metric_label)}</strong><span>${escapeHTML(item.value || "—")} · ${escapeHTML(item.evidence_status || "")}</span></summary><dl><dt>Nguồn</dt><dd>${escapeHTML(item.source_file)} · ${escapeHTML(item.source_sheet)}</dd><dt>Cột / bản ghi</dt><dd>${escapeHTML(item.source_fields)} · ${escapeHTML(item.source_record_hint)}</dd><dt>Công thức / luật</dt><dd>${escapeHTML(item.derivation)}</dd><dt>Validator</dt><dd><code>${escapeHTML(item.validator_version)}</code></dd></dl></details>`).join("")}</div>` : `<p class="muted">Release hiện tại chưa trả về Evidence Ledger.</p>`;
  document.querySelector("#customer-detail").innerHTML = `<div class="detail-head"><p class="eyebrow">Khách hàng · ${id}</p><h2>${escapeHTML(row.customer_name)}</h2><p>${escapeHTML(row.priority_reason || "Chưa có giải thích ưu tiên.")}</p></div><div class="detail-grid">${metricHTML}</div>${evidenceHTML}`;
  document.querySelector("#customer-dialog").showModal();
}

function showEvidence(key) {
  const rows = state.evidence.filter((item) => item.metric_key === key);
  const title = key === "revenue" ? "Doanh thu từ hợp đồng" : key === "outstanding" ? "Công nợ đang ghi nhận" : key === "contract_count" ? "Khách hàng có lịch sử HĐ" : "Cần bổ sung bằng chứng";
  const detail = rows.length ? rows.slice(0, 20).map((item) => `<details class="evidence-row"><summary><strong>${escapeHTML(item.customer_id)} · ${escapeHTML(item.metric_label)}</strong><span>${escapeHTML(item.value || "—")}</span></summary><dl><dt>Nguồn</dt><dd>${escapeHTML(item.source_file)} · ${escapeHTML(item.source_sheet)}</dd><dt>Cột / bản ghi</dt><dd>${escapeHTML(item.source_fields)} · ${escapeHTML(item.source_record_hint)}</dd><dt>Công thức / luật</dt><dd>${escapeHTML(item.derivation)}</dd><dt>Trạng thái</dt><dd>${escapeHTML(item.evidence_status)} · <code>${escapeHTML(item.validator_version)}</code></dd></dl></details>`).join("") : `<p class="muted">Không có dòng ledger khớp. Đây là lỗi bằng chứng và không được coi là số liệu đã xác minh.</p>`;
  document.querySelector("#evidence-detail").innerHTML = `<div class="detail-head"><p class="eyebrow">Evidence Ledger</p><h2>${title}</h2><p>Mỗi dòng truy ngược về sheet, cột, bản ghi và luật materialize của release.</p></div>${detail}`;
  document.querySelector("#evidence-dialog").showModal();
}

function setView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  document.querySelector("#page-title").textContent = {
    overview: "Ưu tiên chăm sóc khách hàng",
    customers: "Danh sách khách hàng",
    scorecard: "Điểm khách hàng & đề xuất CSKH",
    opportunities: "Cơ hội kinh doanh",
    activities: "Hoạt động CRM",
    intake: "Nhập & phát hành dữ liệu",
    safety: "Safety Gate",
  }[id];
}

document.addEventListener("click", (event) => {
  const navigation = event.target.closest("[data-view]");
  if (navigation) setView(navigation.dataset.view);
  const shortcut = event.target.closest("[data-go]");
  if (shortcut) setView(shortcut.dataset.go);
  const customer = event.target.closest("[data-customer]");
  if (customer) showCustomer(customer.dataset.customer);
  const evidenceButton = event.target.closest(".evidence-button");
  if (evidenceButton) { event.stopPropagation(); if (evidenceButton.dataset.evidenceCustomer) showCustomer(evidenceButton.dataset.evidenceCustomer); else showEvidence(evidenceButton.dataset.evidenceKey); }
  if (event.target.closest(".close")) document.querySelector("#customer-dialog").close();
  if (event.target.closest("#logout-button")) handleLogout();
  const serverAction = event.target.closest(".server-action");
  if (serverAction) handleReleaseAction(serverAction);
});

document.querySelector("#customer-search").addEventListener("input", renderCustomers);
document.querySelector("#segment-filter").addEventListener("change", renderCustomers);
document.querySelector("#import-files").addEventListener("change", handleImportFiles);
document.querySelector("#preview-release").addEventListener("click", loadPreviewRelease);
document.querySelector("#persist-import").addEventListener("click", persistImport);
document.querySelector("#refresh-release-registry").addEventListener("click", refreshReleaseRegistry);
document.querySelector("#customer-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector("#evidence-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });

document.querySelector("#access-form").addEventListener("submit", handleAccess);
renderIntake(null);
if (readSession()) {
  unlockApplication().catch(() => {
    clearSession();
    document.querySelector("#access-error").textContent = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  });
}
