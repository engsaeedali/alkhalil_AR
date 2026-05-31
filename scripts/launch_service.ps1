# تشغيل خدمة في الخلفية بدون نافذة طرفية — مع تسجيل المخرجات
param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [Parameter(Mandatory = $true)]
    [string]$LogFile
)

$ErrorActionPreference = "Stop"
$logDir = Split-Path -Parent $LogFile
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "`n===== $stamp =====`n"

$argString = $ArgumentList -join ' '
$cmd = "Set-Location -LiteralPath '$WorkingDirectory'; & '$FilePath' $argString *>> '$LogFile' 2>&1"

Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-Command", $cmd) `
    -WindowStyle Hidden
