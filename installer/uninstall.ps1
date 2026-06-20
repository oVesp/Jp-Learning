<#
  Jp-Learning uninstaller. Removes shortcuts, the Apps & features entry,
  and the install folder. Backs up your glossary.json to the Desktop first.

  Run:
    powershell -ExecutionPolicy Bypass -File uninstall.ps1
#>
$ErrorActionPreference = 'SilentlyContinue'
$AppName = 'Jp-Learning'
# install dir = parent of this script's folder (…\Jp-Learning\installer\uninstall.ps1)
$InstallDir = Split-Path -Parent $PSScriptRoot
function Info($m){ Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[+] $m" -ForegroundColor Green }

Write-Host "Uninstalling $AppName from $InstallDir" -ForegroundColor Yellow

# stop running server on port 3000
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }

# back up glossary to Desktop
$glossary = Join-Path $InstallDir 'glossary.json'
if (Test-Path $glossary) {
  $dest = Join-Path ([Environment]::GetFolderPath('Desktop')) ("Jp-Learning-glossary-backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".json")
  Copy-Item $glossary $dest -Force
  Ok "Glossary backed up to: $dest"
}

# remove shortcuts
$sm = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$AppName.lnk"
$dk = Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk"
Remove-Item $sm -Force
Remove-Item $dk -Force
Info "Removed shortcuts."

# remove Apps & features entry
Remove-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppName" -Recurse -Force
Info "Removed registry entry."

# remove install dir (step outside it first so it isn't in use)
Set-Location $env:TEMP
if (Test-Path $InstallDir) {
  Remove-Item $InstallDir -Recurse -Force
  Ok "Removed $InstallDir"
}
Write-Host ""
Ok "$AppName uninstalled."
