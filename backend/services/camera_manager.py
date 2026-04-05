"""
Camera management service for FaceTrack.

Handles discovery of local cameras, connection to local/network devices,
frame reading, and CRUD for saved network cameras.
"""

from __future__ import annotations

import asyncio
import logging
import platform
import threading
import uuid
from typing import TYPE_CHECKING

import cv2
import numpy as np

if TYPE_CHECKING:
    import aiosqlite

from database.models import CameraDevice

logger = logging.getLogger(__name__)


class CameraManager:
    """Manages camera device lifecycle: discovery, connection, and frame capture."""

    def __init__(self) -> None:
        self._cap: cv2.VideoCapture | None = None
        self._active_device: CameraDevice | None = None
        self._lock = threading.Lock()
        self._last_frame: np.ndarray | None = None

    # ------------------------------------------------------------------
    # Device discovery
    # ------------------------------------------------------------------

    async def list_devices(self, db: aiosqlite.Connection) -> list[CameraDevice]:
        """
        Return all available camera devices.

        Probes local camera indices 0-9 (using DirectShow on Windows) and
        merges saved network cameras from the database.
        """
        local_devices = await asyncio.to_thread(self._probe_local_cameras)
        network_devices = await self._query_network_cameras(db)

        # Mark the currently active device
        all_devices = local_devices + network_devices
        if self._active_device is not None:
            for dev in all_devices:
                if dev.id == self._active_device.id:
                    dev.is_active = True
        return all_devices

    def _probe_local_cameras(self) -> list[CameraDevice]:
        """Probe local camera indices 0-9 and return reachable devices."""
        devices: list[CameraDevice] = []
        api_preference = cv2.CAP_DSHOW if platform.system() == "Windows" else cv2.CAP_ANY

        for idx in range(10):
            cap = cv2.VideoCapture(idx, api_preference)
            try:
                if cap.isOpened():
                    devices.append(
                        CameraDevice(
                            id=f"local:{idx}",
                            name=f"Camera {idx}",
                            type="local",
                            url=None,
                            is_active=False,
                        )
                    )
            finally:
                cap.release()

        return devices

    async def _query_network_cameras(
        self, db: aiosqlite.Connection
    ) -> list[CameraDevice]:
        """Fetch saved network cameras from the cameras table."""
        try:
            cursor = await db.execute(
                "SELECT id, name, type, url FROM cameras ORDER BY name"
            )
            rows = await cursor.fetchall()
            return [
                CameraDevice(
                    id=f"network:{row['id']}",
                    name=row["name"],
                    type=row["type"],
                    url=row["url"],
                    is_active=False,
                )
                for row in rows
            ]
        except Exception as exc:
            logger.warning("Failed to query network cameras: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    async def connect(
        self, device_id: str, db: aiosqlite.Connection | None = None
    ) -> bool:
        """
        Open a VideoCapture for the given device.

        device_id formats:
          - "local:<index>"   -> cv2.VideoCapture(index)
          - "network:<uuid>"  -> look up URL from DB, then cv2.VideoCapture(url)

        Returns True on success, False otherwise.
        """
        await self.disconnect()

        if device_id.startswith("local:"):
            index = int(device_id.split(":", 1)[1])
            success, name = await asyncio.to_thread(self._open_local, index)
            if success:
                self._active_device = CameraDevice(
                    id=device_id,
                    name=name,
                    type="local",
                    url=None,
                    is_active=True,
                )
            return success

        if device_id.startswith("network:") and db is not None:
            cam_uuid = device_id.split(":", 1)[1]
            cursor = await db.execute(
                "SELECT id, name, type, url FROM cameras WHERE id = ?",
                (cam_uuid,),
            )
            row = await cursor.fetchone()
            if row is None:
                logger.error("Network camera %s not found in DB", cam_uuid)
                return False

            success = await asyncio.to_thread(self._open_url, row["url"])
            if success:
                self._active_device = CameraDevice(
                    id=device_id,
                    name=row["name"],
                    type=row["type"],
                    url=row["url"],
                    is_active=True,
                )
            return success

        logger.error("Invalid device_id format: %s", device_id)
        return False

    def _open_local(self, index: int) -> tuple[bool, str]:
        """Open a local camera by index (blocking)."""
        api = cv2.CAP_DSHOW if platform.system() == "Windows" else cv2.CAP_ANY
        cap = cv2.VideoCapture(index, api)
        if cap.isOpened():
            with self._lock:
                self._cap = cap
            return True, f"Camera {index}"
        cap.release()
        return False, ""

    def _open_url(self, url: str) -> bool:
        """Open a network camera by URL (blocking)."""
        cap = cv2.VideoCapture(url)
        if cap.isOpened():
            with self._lock:
                self._cap = cap
            return True
        cap.release()
        return False

    async def disconnect(self) -> None:
        """Release the active VideoCapture, if any."""
        if self._cap is not None:
            await asyncio.to_thread(self._release_capture)
        self._active_device = None

    def _release_capture(self) -> None:
        """Release cv2.VideoCapture in a thread-safe manner."""
        with self._lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None

    # ------------------------------------------------------------------
    # Frame reading
    # ------------------------------------------------------------------

    async def read_frame(self) -> np.ndarray | None:
        """Read a single frame from the active camera. Returns None on failure."""
        if self._cap is None:
            return None
        return await asyncio.to_thread(self._read_frame_sync)

    def _read_frame_sync(self) -> np.ndarray | None:
        """Thread-safe synchronous frame read."""
        with self._lock:
            if self._cap is None or not self._cap.isOpened():
                return None
            ret, frame = self._cap.read()
            if ret and frame is not None:
                self._last_frame = frame.copy()
            return frame if ret else None

    def get_last_frame(self) -> np.ndarray | None:
        """Return the most recently read frame (non-blocking, no camera access)."""
        return self._last_frame

    # ------------------------------------------------------------------
    # Network camera CRUD
    # ------------------------------------------------------------------

    async def add_network_camera(
        self,
        url: str,
        name: str,
        type_: str,
        db: aiosqlite.Connection,
    ) -> CameraDevice:
        """
        Validate a network camera URL by reading one frame, then persist it.

        Raises ValueError if the camera cannot be opened or no frame is read.
        """
        valid = await asyncio.to_thread(self._validate_network_camera, url)
        if not valid:
            raise ValueError(f"Cannot open camera at URL: {url}")

        cam_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO cameras (id, name, type, url) VALUES (?, ?, ?, ?)",
            (cam_id, name, type_, url),
        )
        await db.commit()

        return CameraDevice(
            id=f"network:{cam_id}",
            name=name,
            type=type_,
            url=url,
            is_active=False,
        )

    def _validate_network_camera(self, url: str) -> bool:
        """Try to open the URL and read one frame. Returns True on success."""
        cap = cv2.VideoCapture(url)
        try:
            if not cap.isOpened():
                return False
            ret, _ = cap.read()
            return ret
        finally:
            cap.release()

    async def remove_network_camera(
        self, device_id: str, db: aiosqlite.Connection
    ) -> None:
        """Delete a network camera record from the database."""
        if not device_id.startswith("network:"):
            raise ValueError("Only network cameras can be removed")

        cam_uuid = device_id.split(":", 1)[1]

        # Disconnect if this is the active camera
        if self._active_device and self._active_device.id == device_id:
            await self.disconnect()

        await db.execute("DELETE FROM cameras WHERE id = ?", (cam_uuid,))
        await db.commit()

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def is_connected(self) -> bool:
        """Return True if a camera is currently open and connected."""
        with self._lock:
            return self._cap is not None and self._cap.isOpened()

    def get_active_device(self) -> CameraDevice | None:
        """Return the currently active CameraDevice, or None."""
        return self._active_device
