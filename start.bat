@echo off
title FaceTrack - Starting...
echo ========================================
echo   FaceTrack - Facial Recognition System
echo ========================================
echo.

:: Start backend
echo [1/2] Starting backend server...
cd /d "%~dp0backend"
start "FaceTrack Backend" cmd /k "venv\Scripts\activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000"

:: Wait for backend to be ready
echo       Waiting for backend...
timeout /t 4 /nobreak >nul

:: Start Tauri desktop app
echo [2/2] Starting desktop app...
cd /d "%~dp0"
start "FaceTrack App" cmd /k "cargo tauri dev"

echo.
echo ========================================
echo   FaceTrack is starting!
echo   Backend: http://localhost:8000
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Close this window anytime - servers run independently.
timeout /t 5 /nobreak >nul
