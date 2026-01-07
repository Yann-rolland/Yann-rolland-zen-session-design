param(
  [int]$Port = 8006
)

$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (!(Test-Path "..\\.venv\\Scripts\\python.exe")) {
  Write-Host "Missing venv at D:\BN-3\.venv. Create it first: python -m venv .venv" -ForegroundColor Red
  exit 1
}

Write-Host "Starting backend on port $Port (reads env.local/.env automatically)..." -ForegroundColor Cyan
& ..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port $Port


