"""
Config router for FaceTrack.

Read and update application configuration at runtime.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from config import get_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["config"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/")
async def get_configuration() -> dict:
    """Return the current application configuration."""
    cfg = get_config()
    return cfg.model_dump()


@router.put("/")
async def update_configuration(request: Request, body: dict) -> dict:
    """
    Update application configuration.

    Accepts a (potentially nested) dict of overrides that are deep-merged
    into the current config, persisted to disk, and applied to running
    services where possible.
    """
    cfg = get_config()
    cfg.update(body)

    # Apply live changes to running services
    app = request.app

    # Update frame processor config reference
    if hasattr(app.state, "frame_processor"):
        app.state.frame_processor._config = cfg

    # Update ESP32 service config if present
    if hasattr(app.state, "esp32_service"):
        app.state.esp32_service._config = cfg.esp32_tft

    logger.info("Configuration updated successfully.")
    return cfg.model_dump()
