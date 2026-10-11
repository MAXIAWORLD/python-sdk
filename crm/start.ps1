# Prisme CRM — lancement local (Windows PowerShell).
#   .\start.ps1            construit l'interface si besoin puis démarre le serveur
#   .\start.ps1 -Build     force la reconstruction de l'interface
param([switch]$Build, [Parameter(ValueFromRemainingArguments = $true)][string[]]$ServeArgs)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Error "uv est requis : powershell -ExecutionPolicy ByPass -c `"irm https://astral.sh/uv/install.ps1 | iex`" (https://docs.astral.sh/uv/)"
}

if ($Build -or -not (Test-Path "frontend/dist/index.html")) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js 20+ est requis pour construire l'interface : https://nodejs.org"
  }
  Write-Host "→ Construction de l'interface…"
  Push-Location frontend
  npm ci --no-audit --no-fund
  npm run build
  Pop-Location
}

uv run --project backend prisme serve @ServeArgs
