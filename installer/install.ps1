<#
  Jp-Learning installer (Windows, per-user, no admin required).

  Usage (from an elevated-or-normal PowerShell):
    powershell -ExecutionPolicy Bypass -File install.ps1
  Or bootstrap directly from GitHub:
    iwr -useb https://raw.githubusercontent.com/oVesp/Jp-Learning/main/installer/install.ps1 | iex

  What it does:
    - downloads the repo (main branch) as a zip
    - installs to %LOCALAPPDATA%\Jp-Learning
    - runs npm install
    - creates a launcher + Start Menu and Desktop shortcuts
    - registers an entry in "Apps & features" (per-user) with an uninstaller
#>
param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Jp-Learning",
  [string]$Branch     = "main"
)

$ErrorActionPreference = 'Stop'
$Repo    = 'oVesp/Jp-Learning'
$AppName = 'Jp-Learning'
$ZipUrl  = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Info($m){ Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[+] $m" -ForegroundColor Green }
function Die($m){ Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

# --- prerequisites -------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required but not found." -ForegroundColor Yellow
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Info "Installing Node.js LTS via winget..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Die "Install Node.js (https://nodejs.org) and re-run this script."
  }
}
Ok ("Node " + (node -v))

# --- download ------------------------------------------------------------
$tmp = Join-Path $env:TEMP ("jp-learning-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zip = Join-Path $tmp 'src.zip'
Info "Downloading $Repo ($Branch)..."
Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
Info "Extracting..."
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$extracted = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like 'Jp-Learning-*' } | Select-Object -First 1
if (-not $extracted) { Die "Could not find extracted folder." }

# --- preserve existing user data ----------------------------------------
$glossaryBackup = $null
$existingGlossary = Join-Path $InstallDir 'glossary.json'
if (Test-Path $existingGlossary) {
  $glossaryBackup = Join-Path $tmp 'glossary.backup.json'
  Copy-Item $existingGlossary $glossaryBackup -Force
  Info "Preserving existing glossary."
}

# --- install -------------------------------------------------------------
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Info "Installing to $InstallDir"
Copy-Item -Path (Join-Path $extracted.FullName '*') -Destination $InstallDir -Recurse -Force
if ($glossaryBackup) { Copy-Item $glossaryBackup $existingGlossary -Force }

Push-Location $InstallDir
Info "Installing dependencies (npm install)..."
& npm install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Pop-Location; Die "npm install failed." }
Pop-Location

if (-not (Test-Path (Join-Path $InstallDir 'data\jmdict-index.json'))) {
  Write-Host "Note: JMdict index missing; building (needs the dump)..." -ForegroundColor Yellow
  Push-Location $InstallDir
  if (Test-Path 'data\jmdict-eng.zip') { Expand-Archive 'data\jmdict-eng.zip' 'data' -Force }
  & node scripts\build-index.js
  Pop-Location
}

# --- launcher ------------------------------------------------------------
$launcher = Join-Path $InstallDir 'Jp-Learning.cmd'
@'
@echo off
cd /d "%~dp0"
echo Starting Jp-Learning... a browser tab will open shortly.
start "" cmd /c "timeout /t 12 >nul & start "" http://localhost:3000"
node src\server.js
echo.
echo Server stopped. Close this window.
pause >nul
'@ | Set-Content -Path $launcher -Encoding ASCII
Ok "Launcher created."

# --- shortcuts -----------------------------------------------------------
$ws = New-Object -ComObject WScript.Shell
function New-Shortcut($path){
  $sc = $ws.CreateShortcut($path)
  $sc.TargetPath       = $launcher
  $sc.WorkingDirectory = $InstallDir
  $sc.IconLocation     = "$env:SystemRoot\System32\shell32.dll,13"
  $sc.Description       = 'Jp-Learning - Japanese vocabulary trainer'
  $sc.Save()
}
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
New-Shortcut (Join-Path $startMenu "$AppName.lnk")
New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk")
Ok "Shortcuts created (Start Menu + Desktop)."

# --- Apps & features registration (per-user, no admin) -------------------
$uninstallPs1 = Join-Path $InstallDir 'installer\uninstall.ps1'
$regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppName"
New-Item -Path $regKey -Force | Out-Null
$verFile = Join-Path $InstallDir '.version'
$ver = (Get-Date -Format 'yyyy.MM.dd')
Set-Content -Path $verFile -Value $ver -Encoding ASCII
$props = @{
  DisplayName     = $AppName
  DisplayVersion  = $ver
  Publisher       = 'oVesp'
  InstallLocation = $InstallDir
  DisplayIcon     = "$env:SystemRoot\System32\shell32.dll,13"
  UninstallString = "powershell -ExecutionPolicy Bypass -File `"$uninstallPs1`""
  ModifyPath      = "powershell -ExecutionPolicy Bypass -File `"$($InstallDir)\installer\update.ps1`""
  NoModify        = 0
  NoRepair        = 1
  URLInfoAbout    = "https://github.com/$Repo"
}
foreach ($k in $props.Keys) {
  $type = if ($props[$k] -is [int]) { 'DWord' } else { 'String' }
  New-ItemProperty -Path $regKey -Name $k -Value $props[$k] -PropertyType $type -Force | Out-Null
}
Ok "Registered in Apps & features."

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Ok "Installed $AppName ($ver)."
Write-Host "Launch it from the Start Menu / Desktop shortcut, or run:" -ForegroundColor Gray
Write-Host "    `"$launcher`"" -ForegroundColor Gray
Write-Host "Update:    powershell -ExecutionPolicy Bypass -File `"$InstallDir\installer\update.ps1`"" -ForegroundColor Gray
Write-Host "Uninstall: powershell -ExecutionPolicy Bypass -File `"$uninstallPs1`"  (or via Apps & features)" -ForegroundColor Gray
