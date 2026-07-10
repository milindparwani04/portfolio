@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
node ".claude\tools\node_modules\live-server\live-server.js" public --port=%PORT% --no-browser --quiet
