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

npm run dev -- --host --port $Port


