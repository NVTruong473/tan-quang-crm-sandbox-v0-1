#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT=4173
cd "$ROOT"
if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display dialog "CRM Sandbox cần Python 3 để chạy cục bộ. Vui lòng cài Python 3 rồi bấm lại." with title "Tân Quang CRM" buttons {"OK"} default button "OK"'
  exit 1
fi
open "http://localhost:${PORT}/index.html"
echo "Tân Quang CRM đang chạy tại http://localhost:${PORT}/index.html"
echo "Đóng cửa sổ này để dừng máy chủ."
python3 -m http.server "$PORT"
