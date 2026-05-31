@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ===================================================
echo     Stopping Al-Khalil ArabicEdit Platform
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/4] Stopping background PowerShell launchers (if any)...
for /f "skip=1 tokens=1" %%p in ('wmic process where "CommandLine like '%%launch_service.ps1%%'" get ProcessId 2^>nul') do (
    if not "%%p"=="" taskkill /F /T /PID %%p >nul 2>&1
)

echo [2/4] Stopping processes on ports 8000 and 3000 (with child tree)...
call :KillPort 8000
call :KillPort 3000

echo [3/4] Stopping leftover uvicorn / Next.js from this project...
for /f "skip=1 tokens=1" %%p in ('wmic process where "CommandLine like '%%ArabicEdit\\backend%%' and CommandLine like '%%uvicorn%%'" get ProcessId 2^>nul') do (
    if not "%%p"=="" (
        echo   Terminating backend PID %%p
        taskkill /F /T /PID %%p >nul 2>&1
    )
)
for /f "skip=1 tokens=1" %%p in ('wmic process where "CommandLine like '%%ArabicEdit\\frontend%%' and (CommandLine like '%%next%%' or CommandLine like '%%node%%')" get ProcessId 2^>nul') do (
    if not "%%p"=="" (
        echo   Terminating frontend PID %%p
        taskkill /F /T /PID %%p >nul 2>&1
    )
)

echo [4/4] Verifying ports are released...
call :WaitPortFree 8000 8
call :WaitPortFree 3000 8

set STILL_BUSY=0
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul 2>&1 && set STILL_BUSY=1
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1 && set STILL_BUSY=1

echo.
if "!STILL_BUSY!"=="1" (
    echo ===================================================
    echo WARNING: A port may still be in use.
    echo   Port 8000 ^(backend^):
    netstat -ano | findstr ":8000" | findstr "LISTENING"
    echo   Port 3000 ^(frontend^):
    netstat -ano | findstr ":3000" | findstr "LISTENING"
    echo Close the program manually or run this script again as Administrator.
    echo ===================================================
) else (
    echo ===================================================
    echo All platform servers stopped. Ports 8000 and 3000 are free.
    echo ===================================================
)

pause
exit /b 0

:KillPort
set "TARGET_PORT=%~1"
set /a TRIES=5
:KillPortLoop
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%TARGET_PORT%" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo   Port %TARGET_PORT%: terminating PID %%a ^(tree^)
    taskkill /F /T /PID %%a >nul 2>&1
)
if "!FOUND!"=="1" (
    set /a TRIES-=1
    if !TRIES! gtr 0 (
        timeout /t 2 /nobreak >nul
        goto KillPortLoop
    )
)
exit /b 0

:WaitPortFree
set "WP_PORT=%~1"
set /a WP_TRIES=%~2
:WaitPortFreeLoop
netstat -ano | findstr ":%WP_PORT%" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 exit /b 0
set /a WP_TRIES-=1
if !WP_TRIES! leq 0 exit /b 1
timeout /t 1 /nobreak >nul
goto WaitPortFreeLoop
