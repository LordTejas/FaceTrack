"""
Real-time frame processing pipeline for FaceTrack.

Reads frames from CameraManager, runs face detection/recognition via
FaceEngine, annotates frames, and broadcasts results over WebSocket.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import cv2
import numpy as np

from database.models import FaceInfo, FrameMessage

if TYPE_CHECKING:
    from config import AppConfig

    from services.camera_manager import CameraManager
    from services.face_engine import FaceEngine

logger = logging.getLogger(__name__)

# Bounding-box colours (BGR)
COLOR_RECOGNIZED = (0, 200, 0)      # green
COLOR_UNCERTAIN = (0, 165, 255)     # orange
COLOR_UNKNOWN = (0, 0, 220)         # red

# Font settings
FONT = cv2.FONT_HERSHEY_SIMPLEX
FONT_SCALE = 0.6
FONT_THICKNESS = 2
LABEL_BG_ALPHA = 0.65


class FrameProcessor:
    """
    Continuously processes camera frames in an asyncio task:
    detect faces, recognise identities, annotate, and broadcast.
    """

    def __init__(
        self,
        camera_manager: CameraManager,
        face_engine: FaceEngine,
        ws_manager: Any,
        config: AppConfig,
        attendance_service: Any = None,
        db: Any = None,
    ) -> None:
        self._camera = camera_manager
        self._engine = face_engine
        self._ws = ws_manager
        self._config = config
        self._attendance = attendance_service
        self._db = db

        self._task: asyncio.Task | None = None
        self._session_id: str | None = None
        self._frame_counter: int = 0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, session_id: str | None = None) -> None:
        """Start the background processing loop."""
        if self._task is not None and not self._task.done():
            logger.warning("FrameProcessor is already running")
            return

        self._session_id = session_id
        self._frame_counter = 0
        self._task = asyncio.create_task(
            self._processing_loop(), name="frame-processor"
        )
        logger.info("FrameProcessor started (session=%s)", session_id)

    def stop(self) -> None:
        """Cancel the background processing task."""
        if self._task is not None:
            self._task.cancel()
            self._task = None
            self._session_id = None
            logger.info("FrameProcessor stopped")

    def is_running(self) -> bool:
        """Return True if the processing loop is active."""
        return self._task is not None and not self._task.done()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _processing_loop(self) -> None:  # noqa: C901 (complexity acceptable for main loop)
        """Core loop: read -> detect -> recognise -> annotate -> broadcast."""
        frame_skip = self._config.camera.frame_skip
        jpeg_quality = self._config.camera.jpeg_quality
        min_face_width = self._config.recognition.min_face_width_px
        confidence_threshold = self._config.recognition.confidence_threshold
        uncertain_threshold = self._config.recognition.uncertain_threshold

        try:
            while True:
                # ---- read frame ----
                frame = await self._camera.read_frame()
                if frame is None:
                    await asyncio.sleep(0.05)
                    continue

                self._frame_counter += 1
                faces_info: list[FaceInfo] = []
                face_results: list[dict] = []

                # ---- detection / recognition (every Nth frame) ----
                # frame_skip=0 means full stream (process every frame)
                should_process = (frame_skip <= 1) or (self._frame_counter % frame_skip == 0)

                if should_process:
                    try:
                        locations = await asyncio.to_thread(
                            self._engine.detect_faces, frame, min_face_width
                        )

                        for loc in locations:
                            top, right, bottom, left = loc

                            encoding = await asyncio.to_thread(
                                self._engine.compute_encoding, frame, loc
                            )
                            if encoding is None:
                                # Could not compute encoding — mark unknown
                                result = {
                                    "student_id": None,
                                    "name": "Unknown",
                                    "confidence": 0.0,
                                    "status": "unknown",
                                }
                            else:
                                result = await asyncio.to_thread(
                                    self._engine.recognize,
                                    encoding,
                                    confidence_threshold,
                                    uncertain_threshold,
                                )

                            face_results.append({**result, "location": loc})

                            faces_info.append(
                                FaceInfo(
                                    bbox=[top, right, bottom, left],
                                    student_id=result.get("student_id"),
                                    name=result.get("name"),
                                    confidence=result.get("confidence", 0.0),
                                    status=result.get("status", "unknown"),
                                )
                            )

                    except Exception as exc:
                        logger.error("Detection/recognition error: %s", exc)

                # ---- annotate frame ----
                annotated = frame.copy()
                for face in faces_info:
                    top, right, bottom, left = face.bbox
                    status = face.status

                    if status == "recognized":
                        color = COLOR_RECOGNIZED
                    elif status == "uncertain":
                        color = COLOR_UNCERTAIN
                    else:
                        color = COLOR_UNKNOWN

                    # Bounding box
                    cv2.rectangle(
                        annotated, (left, top), (right, bottom), color, 2
                    )

                    # Label background
                    label = f"{face.name} ({face.confidence:.0f}%)"
                    (text_w, text_h), baseline = cv2.getTextSize(
                        label, FONT, FONT_SCALE, FONT_THICKNESS
                    )
                    label_y = max(top - 10, text_h + 4)

                    # Semi-transparent rectangle behind text
                    overlay = annotated.copy()
                    cv2.rectangle(
                        overlay,
                        (left, label_y - text_h - 4),
                        (left + text_w + 8, label_y + baseline),
                        color,
                        cv2.FILLED,
                    )
                    cv2.addWeighted(
                        overlay, LABEL_BG_ALPHA, annotated,
                        1 - LABEL_BG_ALPHA, 0, annotated,
                    )

                    # Text
                    cv2.putText(
                        annotated,
                        label,
                        (left + 4, label_y),
                        FONT,
                        FONT_SCALE,
                        (255, 255, 255),
                        FONT_THICKNESS,
                        cv2.LINE_AA,
                    )

                # ---- JPEG encode + base64 ----
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
                success, buffer = cv2.imencode(".jpg", annotated, encode_params)
                if not success:
                    await asyncio.sleep(0.01)
                    continue

                b64_frame = base64.b64encode(buffer.tobytes()).decode("ascii")

                # ---- build message ----
                now = datetime.now(timezone.utc).isoformat()
                message = FrameMessage(
                    type="frame",
                    data=b64_frame,
                    timestamp=now,
                    faces=faces_info,
                )

                # ---- broadcast frame ----
                try:
                    await self._ws.broadcast(
                        "video-feed", message.model_dump()
                    )
                except Exception as exc:
                    logger.debug("Frame broadcast failed: %s", exc)

                # ---- broadcast face events + mark attendance ----
                if should_process and face_results:
                    for result in face_results:
                        status = result.get("status", "unknown")
                        student_id = result.get("student_id")
                        confidence = result.get("confidence", 0.0)

                        # Determine event type
                        if status == "recognized":
                            event_type = "face_recognized"
                        elif status == "uncertain":
                            event_type = "face_uncertain"
                        else:
                            event_type = "face_unknown"

                        event = {
                            "type": event_type,
                            "student_id": student_id,
                            "name": result.get("name"),
                            "confidence": confidence,
                            "status": status,
                            "session_id": self._session_id,
                            "timestamp": now,
                        }
                        try:
                            await self._ws.broadcast("events", event)
                        except Exception as exc:
                            logger.debug("Event broadcast failed: %s", exc)

                        # Auto-mark attendance for recognized faces
                        if (
                            status == "recognized"
                            and student_id
                            and self._session_id
                            and self._attendance
                            and self._db
                        ):
                            try:
                                mark_result = await self._attendance.mark_attendance(
                                    db=self._db,
                                    student_id=student_id,
                                    session_id=self._session_id,
                                    confidence=confidence / 100.0,
                                    mode="auto",
                                    device_id=self._camera.get_active_device().id if self._camera.get_active_device() else None,
                                    frame=frame,
                                    config=self._config,
                                )
                                if mark_result.get("marked"):
                                    att_event = {
                                        "type": "attendance_marked",
                                        "student_id": student_id,
                                        "name": result.get("name"),
                                        "confidence": confidence,
                                        "mode": "auto",
                                        "session_id": self._session_id,
                                        "timestamp": now,
                                    }
                                    await self._ws.broadcast("events", att_event)
                                    logger.info("Auto-marked attendance for %s (%.0f%%)", result.get("name"), confidence)
                            except Exception as exc:
                                logger.error("Failed to mark attendance: %s", exc)

                # Yield control to the event loop
                await asyncio.sleep(0.01)

        except asyncio.CancelledError:
            logger.info("FrameProcessor loop cancelled — shutting down cleanly")
        except Exception as exc:
            logger.exception("Fatal error in FrameProcessor loop: %s", exc)
