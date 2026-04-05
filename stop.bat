@echo off
echo Stopping FaceTrack...
taskkill /F /IM app.exe 2>nul
taskkill /F /IM uvicorn.exe 2>nul
taskkill /F /IM node.exe 2>nul
echo FaceTrack stopped.
timeout /t 2 /nobreak >nul
