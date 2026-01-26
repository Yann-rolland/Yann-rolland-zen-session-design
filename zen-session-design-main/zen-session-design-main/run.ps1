param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "Starting frontend (Vite)..." -ForegroundColor Cyan
Write-Host "If port $Port is busy, Vite will pick the next one automatically." -ForegroundColor DarkGray

# Ensure deps are present
if (!(Test-Path ".\\node_modules")) {
  npm install
}

# Call Vite directly to avoid argument parsing quirks across shells.
# Keep host IPv4-friendly so http://127.0.0.1 works.
npx --yes vite --host 0.0.0.0 --port $Port --strictPort


