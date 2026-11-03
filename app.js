const RELEASE = "v0.1-31ed10f5fde0";
const ACCESS_HASH = "1f0384bad409c942f9addddf081f661e6615a7ab8db2b57de34393676eeeeb1a";
const ACCESS_SESSION_KEY = "tq-crm-sandbox-access";
let accessFailures = 0;
let dataLoaded = false;

const DATA = {
  customer360: "data/customer_360.csv",
  scoring: "data/scoring_sandbox.csv",
  opportunities: "data/opportunities.csv",
  activities: "data/crm_activities.csv",
};

const state = {
  customer360: [],
  scoring: [],
  opportunities: [],
  activities: [],
  customerMap: new Map(),
  scoreMap: new Map(),
};

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

const money = (value) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value || 0))} ₫`;
const compact = (value) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
const pct = (value) => new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 }).format(Number(value || 0));
const escapeHTML = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[character]));

async function load() {
  const entries = [];
  for (const [key, url] of Object.entries(DATA)) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Không tải được ${url}`);
    }
    entries.push([key, parseCSV(await response.text())]);
  }

  Object.assign(state, Object.fromEntries(entries));
  state.scoreMap = new Map(state.scoring.map((row) => [row.customer_id, row]));
  state.customerMap = new Map(state.customer360.map((row) => [row.customer_id, row]));
  renderAll();
}

async function hashAccessCode(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unlockApplication() {
  document.body.classList.remove("locked");
  document.body.classList.add("unlocked");
  sessionStorage.setItem(ACCESS_SESSION_KEY, "granted");
  if (!dataLoaded) {
    dataLoaded = true;
    load().catch((error) => {
      document.querySelector("#overview").innerHTML = `<div class="panel"><h2>Không tải được dữ liệu sandbox</h2><p>${escapeHTML(error.message)}</p></div>`;
    });
  }
}

async function handleAccess(event) {
  event.preventDefault();
  const input = document.querySelector("#access-code");
  const error = document.querySelector("#access-error");
  const button = event.currentTarget.querySelector("button");
  const value = input.value.trim();
  if (!/^\d{6}$/.test(value)) {
    error.textContent = "Vui lòng nhập đúng 6 chữ số.";
    return;
  }
  button.disabled = true;
  const accepted = await hashAccessCode(value) === ACCESS_HASH;
  if (accepted) {
    input.value = "";
    unlockApplication();
    return;
  }
  accessFailures += 1;
  input.value = "";
  error.textContent = "Mã truy cập không đúng.";
  input.focus();
  if (accessFailures >= 5) {
    error.textContent = "Đã nhập sai nhiều lần. Vui lòng thử lại sau 30 giây.";
    input.disabled = true;
    setTimeout(() => {
      accessFailures = 0;
      input.disabled = false;
      button.disabled = false;
      error.textContent = "";
      input.focus();
    }, 30000);
  } else {
    button.disabled = false;
  }
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

function renderKPIs() {
  const totals = state.customer360.reduce((aggregate, row) => ({
    revenue: aggregate.revenue + Number(row.revenue),
    profit: aggregate.profit + Number(row.gross_profit),
    outstanding: aggregate.outstanding + Number(row.outstanding),
    pipeline: aggregate.pipeline + Number(row.weighted_pipeline),
  }), { revenue: 0, profit: 0, outstanding: 0, pipeline: 0 });

  const items = [
    ["Doanh thu mô phỏng", money(totals.revenue), "Từ 12 khách hàng synthetic"],
    ["Lợi nhuận gộp", money(totals.profit), "Cùng phạm vi revenue/cost synthetic"],
    ["Công nợ mô phỏng", money(totals.outstanding), "Không dùng đôn đốc thu hồi"],
    ["Pipeline có trọng số", money(totals.pipeline), "Xác suất chưa phê duyệt"],
  ];

  document.querySelector("#kpi-grid").innerHTML = items.map(([label, value, note]) => (
    `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`
  )).join("");
}

function renderBars() {
  const rows = [...state.customer360].sort((first, second) => Number(second.revenue) - Number(first.revenue)).slice(0, 8);
  const max = Math.max(...rows.map((row) => Number(row.revenue)), 1);
  document.querySelector("#revenue-bars").innerHTML = rows.map((row) => (
    `<div class="bar-row"><span>${row.customer_id}</span><div class="bar-track"><div class="bar-fill" style="width:${(Number(row.revenue) / max * 100).toFixed(1)}%"></div></div><b>${compact(row.revenue)}</b></div>`
  )).join("");
}

function renderSegments() {
  const colors = { A: "#2f75b5", B: "#ed7d31", C: "#1f7a3f", D: "#4db7d8" };
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  state.scoring.forEach((row) => { counts[row.segment] += 1; });
  const total = state.scoring.length || 1;
  let cursor = 0;
  const stops = Object.entries(counts).map(([segment, count]) => {
    const start = cursor;
    cursor += count / total * 360;
    return `${colors[segment]} ${start}deg ${cursor}deg`;
  }).join(",");
  const legend = Object.entries(counts).map(([segment, count]) => (
    `<span><i class="swatch" style="background:${colors[segment]}"></i>Nhóm ${segment}: ${count}</span>`
  )).join("");
  document.querySelector("#segment-ring").innerHTML = `<div class="ring" style="background:conic-gradient(${stops})"></div><div class="ring-legend">${legend}</div>`;
}

function renderAttention() {
  const rows = [...state.customer360].sort((first, second) => Number(second.outstanding) - Number(first.outstanding)).slice(0, 5);
  document.querySelector("#attention-list").innerHTML = rows.map((row) => (
    `<div class="account-row" data-customer="${row.customer_id}" tabindex="0"><div><strong>${escapeHTML(row.customer_name)}</strong><span>${row.customer_id} · công nợ mô phỏng</span></div><div class="amount">${money(row.outstanding)}</div><div class="segment">${state.scoreMap.get(row.customer_id)?.segment || "–"}</div></div>`
  )).join("");
}

function renderPipelineSummary() {
  const open = state.opportunities.filter((row) => row.status === "OPEN");
  const weighted = open.reduce((total, row) => total + Number(row.estimated_value) * Number(row.probability_pct), 0);
  const stages = new Set(open.map((row) => row.stage)).size;
  document.querySelector("#pipeline-summary").innerHTML = [
    ["Cơ hội mở", open.length],
    ["Giai đoạn hoạt động", stages],
    ["Giá trị có trọng số", money(weighted)],
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
    const score = state.scoreMap.get(row.customer_id);
    return `<tr data-customer="${row.customer_id}"><td><div class="customer-cell"><strong>${escapeHTML(row.customer_name)}</strong><span>${row.customer_id}</span></div></td><td>${money(row.revenue)}</td><td>${money(row.gross_profit)}</td><td>${money(row.outstanding)}</td><td>${money(row.weighted_pipeline)}</td><td>${score?.total_score || "–"}</td><td><span class="segment">${score?.segment || "–"}</span></td></tr>`;
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
    ["Doanh thu", money(row.revenue)],
    ["Lợi nhuận gộp", money(row.gross_profit)],
    ["Biên lợi nhuận", pct(row.gross_margin_pct)],
    ["Đã xuất hóa đơn", money(row.invoiced)],
    ["Đã thu", money(row.paid)],
    ["Công nợ", money(row.outstanding)],
    ["Pipeline", money(row.weighted_pipeline)],
    ["Hoạt động", row.activity_count],
    ["Điểm mô phỏng", score?.total_score || "–"],
  ];
  const metricHTML = metrics.map(([label, value]) => `<div class="detail-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
  document.querySelector("#customer-detail").innerHTML = `<div class="detail-head"><p class="eyebrow">Customer 360 · ${id}</p><h2>${escapeHTML(row.customer_name)}</h2><p>Hồ sơ synthetic trong release ${RELEASE}. Không có giá trị nghiệp vụ.</p></div><div class="detail-grid">${metricHTML}</div>`;
  document.querySelector("#customer-dialog").showModal();
}

function setView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  document.querySelector("#page-title").textContent = {
    overview: "Tổng quan CRM",
    customers: "Khách hàng",
    opportunities: "Cơ hội kinh doanh",
    activities: "Hoạt động CRM",
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
  if (event.target.closest(".close")) document.querySelector("#customer-dialog").close();
});

document.querySelector("#customer-search").addEventListener("input", renderCustomers);
document.querySelector("#segment-filter").addEventListener("change", renderCustomers);
document.querySelector("#customer-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.querySelector("#access-form").addEventListener("submit", handleAccess);
if (sessionStorage.getItem(ACCESS_SESSION_KEY) === "granted") unlockApplication();
