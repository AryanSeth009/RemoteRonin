[CmdletBinding()]
param([switch]$InstallChromium)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host 'REMOTE RONIN' -ForegroundColor Yellow
Write-Host 'Remote Developer Command Center - Built by Aryan Seth' -ForegroundColor DarkYellow
if ($env:OS -ne 'Windows_NT') { throw 'RemoteRonin setup currently supports Windows 10/11 only.' }
foreach ($command in @('node','npm','git')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required dependency not found: $command" }
  Write-Host "[OK] $command detected" -ForegroundColor Green
}
Push-Location $root
try {
  Write-Host '[INFO] RemoteRonin core has no network dependencies.' -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Automated tests failed.' }
  if ($InstallChromium) { Write-Warning 'Screenshot automation requires the optional Playwright package. Install it explicitly with npm install playwright, then run npx playwright install chromium.' }
  Write-Host '[OK] RemoteRonin is ready. Run .\start.cmd' -ForegroundColor Green
  Write-Host '[INFO] Run .\start.cmd remote open for the official remote access setup.' -ForegroundColor Yellow
} finally { Pop-Location }
