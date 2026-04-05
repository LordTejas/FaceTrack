"""
Training router for FaceTrack.

Trigger face-encoding retraining and check its progress.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request

from database.models import TrainingStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/train", tags=["training"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/")
async def start_training(request: Request) -> dict:
    """
    Kick off a full face-encoding retrain as a background task.

    The retrain scans all student samples, recomputes encodings, and
    refreshes the in-memory face engine.  Progress can be polled via
    ``GET /api/train/status``.
    """
    training_service = request.app.state.training_service

    # Prevent duplicate runs
    status = training_service.get_status()
    if status.get("status") == "training":
        return {"status": "already_running"}

    # Launch as a background asyncio task so the endpoint returns immediately
    from config import get_config
    cfg = get_config()
    asyncio.create_task(
        training_service.retrain_all(
            db=request.app.state.db,
            face_engine=request.app.state.face_engine,
            ws_manager=request.app.state.ws_manager,
            data_dir=cfg.storage.data_dir,
        )
    )

    return {"status": "started"}


@router.get("/status", response_model=TrainingStatus)
async def training_status(request: Request) -> dict:
    """Return the current training pipeline status."""
    training_service = request.app.state.training_service
    return training_service.get_status()
