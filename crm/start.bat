@echo off
rem Prisme CRM — lancement local (Windows, double-clic)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
pause
