@echo off
rem ZALVO launcher. Double-click to chat, or run: ZALVO.bat --help
chcp 65001 >nul
set "ZALVO_EXE=%~dp0.venv\Scripts\zalvo.exe"
if not exist "%ZALVO_EXE%" (
  echo [ZALVO] Not installed yet. Run install.bat first.
  pause
  exit /b 1
)
"%ZALVO_EXE%" %*
if "%~1"=="" pause
