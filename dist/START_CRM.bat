@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  start "Tân Quang CRM" http://localhost:4173/index.html
  py -m http.server 4173
  exit /b
)
where python >nul 2>&1
if %errorlevel%==0 (
  start "Tân Quang CRM" http://localhost:4173/index.html
  python -m http.server 4173
  exit /b
)
echo Python 3 chua duoc cai dat. Vui long cai Python 3 roi bam lai file nay.
pause
