@echo off
echo ===================================================
echo     Starting Al-Khalil ArabicEdit Platform
echo ===================================================
echo.

echo Step 1: Cleaning active ports and closing old servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /f /pid %%a > nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a > nul 2>&1

echo Waiting 3 seconds for ports to be released...
timeout /t 3 /nobreak > nul

echo.
echo Step 2: Verifying port availability...
set PORT_8000_FREE=1
set PORT_3000_FREE=1

netstat -aon | findstr :8000 | findstr LISTENING > nul 2>&1
if %errorlevel% equ 0 set PORT_8000_FREE=0

netstat -aon | findstr :3000 | findstr LISTENING > nul 2>&1
if %errorlevel% equ 0 set PORT_3000_FREE=0

if "%PORT_8000_FREE%"=="0" goto PORT_8000_BUSY
if "%PORT_3000_FREE%"=="0" goto PORT_3000_BUSY

echo Confirmation: All ports are free and ready.
echo.
echo Step 3: Launching servers...
echo Starting Backend Server...
start "Backend Server" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Frontend Server...
start "Frontend Server" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ===================================================
echo Servers launched successfully!
echo You can now open your browser at:
echo http://localhost:3000
echo ===================================================
pause
exit /b

:PORT_8000_BUSY
echo [Error] Port 8000 is still busy! Please close the program using it manually.
pause
exit /b

:PORT_3000_BUSY
echo [Error] Port 3000 is still busy! Please close the program using it manually.
pause
exit /b
