# Jp-Learning — Installer (Windows)

Per-user install. No administrator rights needed. Installs to
`%LOCALAPPDATA%\Jp-Learning`.

## Install

One-liner (PowerShell) — downloads and installs the latest version:

```powershell
iwr -useb https://raw.githubusercontent.com/oVesp/Jp-Learning/main/installer/install.ps1 | iex
```

Or, if you already have the repo locally:

```powershell
powershell -ExecutionPolicy Bypass -File installer\install.ps1
```

The installer:
- checks for Node.js (installs it via `winget` if available, else asks you to)
- downloads the `main` branch and copies it to `%LOCALAPPDATA%\Jp-Learning`
- runs `npm install`
- creates a launcher plus **Start Menu** and **Desktop** shortcuts
- registers an entry in **Apps & features** so it shows up like a normal app

## Run

Use the **Jp-Learning** shortcut (Start Menu or Desktop). A console window
starts the local server; a browser tab opens to <http://localhost:3000> after
a few seconds (first start warms the dictionary index).

Close the console window to stop the app.

## Update

Pulls the latest `main` and reinstalls **while preserving your `glossary.json`**
(your saved words + progress):

```powershell
powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\Jp-Learning\installer\update.ps1"
```

(Also available as "Modify" in Apps & features.)

## Uninstall

From **Apps & features** → Jp-Learning → Uninstall, or:

```powershell
powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\Jp-Learning\installer\uninstall.ps1"
```

Your glossary is backed up to the Desktop before removal.

## Notes
- Everything is per-user under `%LOCALAPPDATA%` and `HKCU` — nothing system-wide.
- Default port is `3000`. Set `PORT` to change it before launch.
- The repo ships the prebuilt JMdict index (`data/jmdict-index.json`), so no
  build step is needed; if it is ever missing, the installer rebuilds it.
