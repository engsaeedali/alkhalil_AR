@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ===================================================
echo     Starting Al-Khalil ArabicEdit Platform
echo     (Background mode — no terminal windows)
echo ===================================================
echo.

echo Step 1: Cleaning active ports and closing old servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /f /t /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /f /t /pid %%a >nul 2>&1

echo Waiting 3 seconds for ports to be released...
timeout /t 3 /nobreak >nul

echo.
echo Step 2: Verifying port availability...
set PORT_8000_FREE=1
set PORT_3000_FREE=1

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 set PORT_8000_FREE=0

netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 set PORT_3000_FREE=0

if "%PORT_8000_FREE%"=="0" goto PORT_8000_BUSY
if "%PORT_3000_FREE%"=="0" goto PORT_3000_BUSY

if not exist "%~dp0logs" mkdir "%~dp0logs"

echo Confirmation: All ports are free and ready.
echo.
echo Step 3: Launching servers in the background (hidden)...

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch_service.ps1" ^
  -WorkingDirectory "%~dp0backend" ^
  -FilePath "%~dp0backend\venv\Scripts\python.exe" ^
  -ArgumentList "-m","uvicorn","main:app","--host","127.0.0.1","--port","8000","--reload" ^
  -LogFile "%~dp0logs\backend.log"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch_service.ps1" ^
  -WorkingDirectory "%~dp0frontend" ^
  -FilePath "cmd.exe" ^
  -ArgumentList "/c","npm","run","dev" ^
  -LogFile "%~dp0logs\frontend.log"

echo Waiting for servers to warm up...
timeout /t 5 /nobreak >nul

echo.
echo ===================================================
echo Servers launched in the background.
echo   App:      http://localhost:3000
echo   Backend:  http://127.0.0.1:8000/health
echo   Logs:     %~dp0logs\
echo       backend.log  |  frontend.log
echo.
echo To stop: run stop_platform.bat
echo ===================================================
pause
exit /b 0

:PORT_8000_BUSY
echo [Error] Port 8000 is still busy! Run stop_platform.bat first.
pause
exit /b 1

:PORT_3000_BUSY
echo [Error] Port 3000 is still busy! Run stop_platform.bat first.
pause
exit /b 1
