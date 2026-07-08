@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
node ".claude\tools\node_modules\live-server\live-server.js" --port=5500 --no-browser --quiet --ignore=.claude
