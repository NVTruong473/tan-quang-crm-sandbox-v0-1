#!/usr/bin/env python3
"""Reconcile a deterministic sample of active-release Evidence Ledger rows to raw XLSX."""
import csv, io, json, os, sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from urllib.request import Request, urlopen
import openpyxl

BASE = os.environ.get("CRM_API_BASE", "https://fxwgehtnytdqqwabgemw.supabase.co/functions/v1/crm-sandbox")
ANON = os.environ["SUPABASE_ANON_KEY"]
EMAIL = os.environ["CRM_ADMIN_EMAIL"]
PASSWORD = os.environ["CRM_ADMIN_PASSWORD"]
WORKBOOK = Path(os.environ.get("CRM_SOURCE_XLSX", "/Users/vantruong/Downloads/THÔNG TIN KHÁCH HÀNG.xlsx"))

def request_json(url, method="GET", body=None, token=None):
    headers = {"apikey": ANON}
    if token: headers["authorization"] = f"Bearer {token}"
    if body is not None:
        headers["content-type"] = "application/json"
        body = json.dumps(body).encode()
    req = Request(url, method=method, headers=headers, data=body)
    with urlopen(req) as response:
        return response.read().decode()

def num(value):
    return Decimal(str(value or "0").replace(",", "").strip() or "0")

def main():
    session = json.loads(request_json("https://fxwgehtnytdqqwabgemw.supabase.co/auth/v1/token?grant_type=password", "POST", {"email": EMAIL, "password": PASSWORD}))
    token = session["access_token"]
    ledger_text = request_json(f"{BASE}/data/evidence_ledger.csv", token=token)
    ledger = list(csv.DictReader(io.StringIO(ledger_text)))
    wb = openpyxl.load_workbook(WORKBOOK, read_only=True, data_only=True)
    customer_sheet = next(name for name in wb.sheetnames if name.lower().replace(" ", "_").startswith("01_khach_hang"))
    contract_sheet = next(name for name in wb.sheetnames if name.lower().replace(" ", "_").startswith("02_hop_dong"))
    customer_rows = list(wb[customer_sheet].values)
    customer_headers = [str(x or "").strip() for x in customer_rows[0]]
    customer_index = {h.split("/")[0].strip(): i for i, h in enumerate(customer_headers)}
    customer_ids = [str(row[customer_index["Mã KH"]] or "").strip() for row in customer_rows[1:] if str(row[customer_index["Mã KH"]] or "").strip()]
    ws = wb[contract_sheet]
    rows = list(ws.values)
    headers = [str(x or "").strip() for x in rows[0]]
    index = {h.split("/")[0].strip(): i for i, h in enumerate(headers)}
    by_customer = defaultdict(lambda: {"revenue": Decimal("0"), "outstanding": Decimal("0")})
    for row in rows[1:]:
        customer = str(row[index["Mã KH"]] or "").strip()
        status = str(row[index.get("Tình trạng", -1)] or "").strip().lower() if "Tình trạng" in index else ""
        if not customer or status == "hủy": continue
        by_customer[customer]["revenue"] += num(row[index["Doanh thu ghi nhận"]])
        by_customer[customer]["outstanding"] += num(row[index["Công nợ"]])
    selected = sorted(customer_ids)[:5]
    tests = [(customer, metric) for customer in selected for metric in ("revenue", "outstanding")]
    ledger_map = {(r["customer_id"], r["metric_key"]): r for r in ledger}
    results = []
    for customer, metric in tests:
        expected = by_customer[customer][metric]
        actual = num(ledger_map[(customer, metric)]["value"])
        results.append({"customer_id": customer, "metric": metric, "expected": str(expected), "ledger": str(actual), "match": expected == actual, "source_hint": ledger_map[(customer, metric)]["source_record_hint"]})
    passed = sum(1 for r in results if r["match"])
    output = {"release": "SBX-EVIDENCE-V3-1872B8BC", "sample_size": len(results), "passed": passed, "pass_rate_pct": passed / len(results) * 100, "gate": "PASS" if passed == len(results) else "BLOCKED", "tests": results}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if passed != len(results): sys.exit(2)

if __name__ == "__main__": main()
