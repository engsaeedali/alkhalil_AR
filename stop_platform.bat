@echo off
echo ===================================================
echo     Stopping Al-Khalil ArabicEdit Platform
echo ===================================================
echo.

echo Stopping Backend Server on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Terminating PID %%a
    taskkill /f /pid %%a > nul 2>&1
)

echo Stopping Frontend Server on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Terminating PID %%a
    taskkill /f /pid %%a > nul 2>&1
)

echo.
echo ===================================================
echo All platform servers stopped successfully.
echo ===================================================
pause
