@echo off
cd /d "%~dp0"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "LENS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
) else (
  set "LENS_NODE=node"
)
echo ScopeLedger Lens will open at http://127.0.0.1:4173
echo Keep this window open while using the app. Press Ctrl+C to stop.
"%LENS_NODE%" --env-file-if-exists=.env server.mjs
pause
