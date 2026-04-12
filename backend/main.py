"""
FaceTrack API -- FastAPI application entry point.

Bootstraps all services on startup, tears them down on shutdown, and
mounts every router under a single ASGI application.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_config
from database.connection import init_db, close_db
from database.migrations import create_tables
from database.models import HealthResponse

# Routers
from routers.websocket import router as ws_router, ws_manager
from routers.devices import router as devices_router
from routers.students import router as students_router
from routers.sessions import router as sessions_router
from routers.attendance import router as attendance_router
from routers.training import router as training_router
from routers.config import router as config_router

# Services (imported lazily so the module layout can evolve)
from services.camera_manager import CameraManager
from services.face_engine import FaceEngine
from services.frame_processor import FrameProcessor
from services.attendance_service import AttendanceService
from services.training_service import TrainingService
from services.esp32_service import ESP32Service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown lifecycle."""
    cfg = get_config()

    # ---- Startup ----------------------------------------------------------
    logger.info("Starting FaceTrack API...")

    # Database
    db = await init_db()
    await create_tables(db)
    app.state.db = db

    # Services
    camera_manager = CameraManager()
    face_engine = FaceEngine()
    attendance_service = AttendanceService()
    training_service = TrainingService()
    esp32_service = ESP32Service(cfg.esp32_tft)
    frame_processor = FrameProcessor(
        camera_manager=camera_manager,
        face_engine=face_engine,
        ws_manager=ws_manager,
        config=cfg,
        attendance_service=attendance_service,
        db=db,
    )

    app.state.camera_manager = camera_manager
    app.state.face_engine = face_engine
    app.state.frame_processor = frame_processor
    app.state.attendance_service = attendance_service
    app.state.training_service = training_service
    app.state.esp32_service = esp32_service
    app.state.ws_manager = ws_manager

    # Pre-load face encodings from the database into memory
    await face_engine.load_encodings_from_db(db)

    # Restore active session if one exists (e.g., after restart)
    try:
        cursor = await db.execute(
            "SELECT id FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
        )
        active_session = await cursor.fetchone()
        if active_session:
            frame_processor._session_id = active_session["id"]
            logger.info("Restored active session: %s", active_session["id"])
    except Exception as exc:
        logger.warning("Could not restore active session: %s", exc)

    # Auto-connect to first available camera and start frame processor
    try:
        devices = await camera_manager.list_devices(db)
        if devices:
            first = devices[0]
            device_id = first.id if hasattr(first, 'id') else first.get("id")
            if device_id:
                await camera_manager.connect(device_id, db)
                frame_processor.start()
                logger.info("Auto-connected camera: %s", device_id)
    except Exception as exc:
        logger.warning("Could not auto-connect camera: %s", exc)

    logger.info("FaceTrack API ready.")

    yield  # ---- Application is running ------------------------------------

    # ---- Shutdown ---------------------------------------------------------
    logger.info("Shutting down FaceTrack API...")

    if frame_processor.is_running():
        frame_processor.stop()

    await camera_manager.disconnect()
    await close_db()

    logger.info("FaceTrack API stopped.")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="FaceTrack API",
    lifespan=lifespan,
)

# CORS -- wide open for local development; tighten for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers --------------------------------------------------------------
app.include_router(ws_router)
app.include_router(devices_router)
app.include_router(students_router)
app.include_router(sessions_router)
app.include_router(attendance_router)
app.include_router(training_router)
app.include_router(config_router)


# ---- Health check ----------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health_check() -> dict:
    return {"status": "ok"}


# ---- Static files for student images / snapshots ---------------------------
data_dir = Path(get_config().storage.data_dir)
data_dir.mkdir(parents=True, exist_ok=True)
app.mount("/data", StaticFiles(directory=str(data_dir), check_dir=False), name="data")


# ---- Entry point for PyInstaller exe --------------------------------------
if __name__ == "__main__":
    import sys
    import os
    import uvicorn

    # When running as PyInstaller bundle, set working directory
    # to the exe's location so data/ folder is created there
    if getattr(sys, 'frozen', False):
        os.chdir(os.path.dirname(sys.executable))

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
