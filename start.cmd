@echo off
setlocal
cd /d "%~dp0"
if not exist "src\cli\runtime.js" (
  echo RemoteRonin runtime is missing. Reinstall the repository.
  exit /b 1
)
node src\cli\runtime.js %*
