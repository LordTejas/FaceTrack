@echo off
title FaceTrack - Building...
echo ================================================
echo   FaceTrack - Building Production Executable
echo ================================================
echo.

:: Step 1: Build Python backend
echo [1/4] Building Python backend with PyInstaller...
cd /d "%~dp0backend"
call venv\Scripts\activate
pyinstaller --onefile --name facetrack-server ^
  --hidden-import=face_recognition ^
  --hidden-import=face_recognition_models ^
  --hidden-import=uvicorn.logging ^
  --hidden-import=uvicorn.protocols.http ^
  --hidden-import=uvicorn.protocols.http.auto ^
  --hidden-import=uvicorn.protocols.websockets ^
  --hidden-import=uvicorn.protocols.websockets.auto ^
  --hidden-import=uvicorn.lifespan ^
  --hidden-import=uvicorn.lifespan.on ^
  --hidden-import=aiosqlite ^
  --collect-data face_recognition_models ^
  --add-data "config.py;." ^
  --add-data "database;database" ^
  --add-data "routers;routers" ^
  --add-data "services;services" ^
  main.py
if errorlevel 1 (
    echo ERROR: Backend build failed!
    pause
    exit /b 1
)
echo       Backend built successfully.
echo.

:: Step 2: Copy sidecar binary
echo [2/4] Copying sidecar binary...
cd /d "%~dp0"
if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"
copy /Y "backend\dist\facetrack-server.exe" "src-tauri\binaries\facetrack-server-x86_64-pc-windows-msvc.exe"
echo       Sidecar copied.
echo.

:: Step 3: Build frontend
echo [3/4] Building frontend...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
echo       Frontend built successfully.
echo.

:: Step 4: Build Tauri app
echo [4/4] Building Tauri desktop app (this takes a few minutes)...
cd /d "%~dp0"
cargo tauri build
if errorlevel 1 (
    echo ERROR: Tauri build failed!
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Build complete!
echo   Installer: src-tauri\target\release\bundle\nsis\
echo ================================================
echo.
pause
