param(
  [int]$Port = 8006,
  [switch]$NoReload
)

$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (!(Test-Path "..\\.venv\\Scripts\\python.exe")) {
  Write-Host "Missing venv at D:\BN-3\.venv. Create it first: python -m venv .venv" -ForegroundColor Red
  exit 1
}

Write-Host "Starting backend on port $Port (reads env.local/.env automatically)..." -ForegroundColor Cyan

# On Windows, --reload can crash if it scans large virtualenv folders (e.g. backend\.venv / .venv).
# We exclude common venv paths by default; use -NoReload to disable reload entirely.
$uvicornArgs = @("main:app", "--port", "$Port")

if (-not $NoReload) {
  $uvicornArgs += @(
    "--reload",
    "--reload-dir", ".",
    "--reload-exclude", ".venv",
    "--reload-exclude", ".venv/*",
    "--reload-exclude", ".venv/**",
    "--reload-exclude", "**/.venv/**"
  )
}

& ..\.venv\Scripts\python.exe -m uvicorn @uvicornArgs


