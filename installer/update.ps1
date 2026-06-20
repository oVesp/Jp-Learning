<#
  Jp-Learning updater. Re-downloads the latest main branch and overwrites
  the app files, PRESERVING your glossary.json (vocabulary + progress).

  Run:
    powershell -ExecutionPolicy Bypass -File update.ps1
#>
param([string]$Branch = "main")

$ErrorActionPreference = 'Stop'
$Repo   = 'oVesp/Jp-Learning'
$ZipUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# install dir = parent of this script's folder (…\Jp-Learning\installer\update.ps1)
$InstallDir = Split-Path -Parent $PSScriptRoot
function Info($m){ Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[+] $m" -ForegroundColor Green }
function Die($m){ Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path (Join-Path $InstallDir 'package.json'))) { Die "Install not found at $InstallDir." }

# stop a running server (one we started) on port 3000
try {
  Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
} catch {}

$tmp = Join-Path $env:TEMP ("jp-learning-upd-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zip = Join-Path $tmp 'src.zip'
Info "Downloading latest ($Branch)..."
Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$extracted = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like 'Jp-Learning-*' } | Select-Object -First 1
if (-not $extracted) { Die "Extraction failed." }

# back up user data
$glossary = Join-Path $InstallDir 'glossary.json'
$backup = $null
if (Test-Path $glossary) {
  $backup = Join-Path $tmp 'glossary.backup.json'
  Copy-Item $glossary $backup -Force
  Info "Backed up glossary."
}

# overwrite app files (the downloaded zip does NOT contain your glossary edits,
# but guard anyway by restoring the backup afterwards)
Info "Applying update..."
Copy-Item -Path (Join-Path $extracted.FullName '*') -Destination $InstallDir -Recurse -Force
if ($backup) { Copy-Item $backup $glossary -Force; Ok "Glossary restored." }

Push-Location $InstallDir
Info "Refreshing dependencies..."
& npm install --no-audit --no-fund --loglevel=error
Pop-Location

Set-Content -Path (Join-Path $InstallDir '.version') -Value (Get-Date -Format 'yyyy.MM.dd') -Encoding ASCII
# keep Apps & features version in sync if the key exists
$regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Jp-Learning"
if (Test-Path $regKey) {
  New-ItemProperty -Path $regKey -Name DisplayVersion -Value (Get-Date -Format 'yyyy.MM.dd') -PropertyType String -Force | Out-Null
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Ok "Update complete."
