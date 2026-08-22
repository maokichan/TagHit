# TagHit Windows Release build script
# Usage (run from project root):
#   powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1        # standard (skip exe resource edit)
#   powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Full  # full (admin terminal, with resource edit)
#
# Background (pitfalls recorded 2026-08-23, v0.1.2):
# 1. Direct GitHub download of electron-builder binaries (nsis/winCodeSign) often times out
#    -> always use npmmirror mirror (ELECTRON_BUILDER_BINARIES_MIRROR).
# 2. Cert auto-discovery hangs/fails without a signing cert -> CSC_IDENTITY_AUTO_DISCOVERY=false.
# 3. winCodeSign extraction needs 7za -snld to create symlinks (darwin dir); normal terminals
#    lack admin/developer-mode privilege -> default to --config.win.signAndEditExecutable=false
#    (exe keeps default Electron icon). Run as ADMIN with -Full for full resource edit
#    (custom icon/version info; configure win.icon in electron-builder.yml first).
param(
  [switch]$Full
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> [1/2] electron-vite build"
npm run build

Write-Host "==> [2/2] electron-builder --win"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

if ($Full) {
  Write-Host "    full build (with resource edit / signing) - requires admin privileges"
  npx electron-builder --win
} else {
  Write-Host "    standard build (skip resource edit / signing, default Electron icon)"
  npx electron-builder --win --config.win.signAndEditExecutable=false
}

Write-Host "==> Done. Artifacts: dist\TagHit Setup *.exe"
