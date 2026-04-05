"""
Devices (camera) router for FaceTrack.

CRUD and connection management for camera devices.
Service instances are accessed via ``request.app.state``.
"""

from __future__ import annotations

import logging

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Request

from database.connection import get_db
from database.models import CameraCreate, CameraDevice

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/devices", tags=["devices"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[CameraDevice])
async def list_devices(
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[dict]:
    """Return every registered camera device."""
    camera_manager = request.app.state.camera_manager
    return await camera_manager.list_devices(db)


@router.post("/", response_model=CameraDevice, status_code=201)
async def add_device(
    body: CameraCreate,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Register a new network / IP camera."""
    camera_manager = request.app.state.camera_manager
    try:
        device = await camera_manager.add_network_camera(
            url=body.url,
            name=body.name,
            cam_type=body.type,
            db=db,
        )
        return device
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{device_id}", status_code=204)
async def remove_device(
    device_id: str,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    """Unregister a camera device."""
    camera_manager = request.app.state.camera_manager
    try:
        await camera_manager.remove_network_camera(device_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{device_id}/connect")
async def connect_device(
    device_id: str,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Connect to a camera and start the frame processor."""
    camera_manager = request.app.state.camera_manager
    frame_processor = request.app.state.frame_processor

    # If already connected to this device, just return OK
    active = camera_manager.get_active_device()
    active_id = active.id if hasattr(active, 'id') else (active.get("id") if isinstance(active, dict) else None)
    if active and active_id == device_id:
        if not frame_processor.is_running():
            await frame_processor.start()
        return {"status": "connected", "device_id": device_id}

    # Disconnect current device if switching
    if camera_manager.is_connected():
        if frame_processor.is_running():
            frame_processor.stop()
        await camera_manager.disconnect()

    try:
        await camera_manager.connect(device_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Start processing frames from the connected camera
    await frame_processor.start()

    return {"status": "connected", "device_id": device_id}


@router.post("/disconnect")
async def disconnect_device(request: Request) -> dict:
    """Stop frame processing and disconnect the active camera."""
    frame_processor = request.app.state.frame_processor
    camera_manager = request.app.state.camera_manager

    if frame_processor.is_running():
        frame_processor.stop()
    await camera_manager.disconnect()

    return {"status": "disconnected"}


@router.get("/active")
async def get_active_device(request: Request) -> dict:
    """Return info about the currently connected camera (if any)."""
    camera_manager = request.app.state.camera_manager
    device = camera_manager.get_active_device()
    if device is None:
        return {"active": False, "device": None}
    return {"active": True, "device": device}
