"""
Face-encoding training service for FaceTrack.

Rebuilds the face_encodings table from student sample images and refreshes
the in-memory FaceEngine, broadcasting progress events via WebSocket.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import cv2
import face_recognition
import numpy as np

if TYPE_CHECKING:
    import aiosqlite

    from services.face_engine import FaceEngine

logger = logging.getLogger(__name__)


class TrainingService:
    """
    Orchestrates a full retrain cycle: read sample images for every student,
    compute encodings, persist them, and update the live FaceEngine.
    """

    def __init__(self) -> None:
        self._status: dict[str, Any] = {
            "status": "idle",
            "progress": 0,
            "total": 0,
            "last_trained": None,
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def retrain_all(
        self,
        db: aiosqlite.Connection,
        face_engine: FaceEngine,
        ws_manager: Any | None = None,
        data_dir: str = "data",
    ) -> None:
        """
        Re-compute face encodings for every active student and reload
        the in-memory engine.

        Progress is broadcast over the ``training`` WebSocket channel
        when *ws_manager* is provided.
        """
        self._status["status"] = "training"
        self._status["progress"] = 0

        try:
            # Fetch all active students
            cursor = await db.execute(
                "SELECT id, name FROM students WHERE is_active = 1 ORDER BY id"
            )
            students = await cursor.fetchall()
            self._status["total"] = len(students)

            if not students:
                logger.info("No active students found — nothing to train")
                self._status["status"] = "complete"
                self._status["last_trained"] = datetime.now(
                    timezone.utc
                ).isoformat()
                self._status["status"] = "idle"
                return

            # Clear existing encodings
            await db.execute("DELETE FROM face_encodings")
            await db.commit()

            total_encodings = 0

            for idx, student in enumerate(students):
                student_id = student["id"]
                student_name = student["name"]

                # Look for sample images in data/samples/<student_id>/
                samples_dir = Path(data_dir) / "samples" / student_id
                if not samples_dir.exists():
                    logger.debug(
                        "No samples directory for student %s", student_id
                    )
                    self._status["progress"] = idx + 1
                    await self._broadcast_progress(ws_manager)
                    continue

                image_files = [
                    f
                    for f in samples_dir.iterdir()
                    if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp")
                ]

                if not image_files:
                    logger.debug(
                        "No image files for student %s", student_id
                    )
                    self._status["progress"] = idx + 1
                    await self._broadcast_progress(ws_manager)
                    continue

                # Process each sample image
                for img_path in image_files:
                    try:
                        encoding = await asyncio.to_thread(
                            self._compute_encoding_from_file, str(img_path)
                        )
                        if encoding is not None:
                            # Persist to DB
                            blob = encoding.tobytes()
                            await db.execute(
                                """
                                INSERT INTO face_encodings
                                    (student_id, encoding)
                                VALUES (?, ?)
                                """,
                                (student_id, blob),
                            )
                            total_encodings += 1
                    except Exception as exc:
                        logger.warning(
                            "Failed to process %s: %s", img_path, exc
                        )

                await db.commit()

                self._status["progress"] = idx + 1
                await self._broadcast_progress(ws_manager)

            # Reload the in-memory engine
            await face_engine.load_encodings_from_db(db)

            self._status["status"] = "complete"
            self._status["last_trained"] = datetime.now(
                timezone.utc
            ).isoformat()

            logger.info(
                "Training complete: %d encodings for %d students",
                total_encodings,
                len(students),
            )

            # Broadcast final status
            await self._broadcast_progress(ws_manager)

        except Exception as exc:
            logger.exception("Training failed: %s", exc)
            self._status["status"] = "idle"
            raise
        finally:
            # Always return to idle after a short delay so clients see "complete"
            await asyncio.sleep(1.0)
            self._status["status"] = "idle"

    def get_status(self) -> dict[str, Any]:
        """Return the current training status snapshot."""
        return dict(self._status)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_encoding_from_file(path: str) -> np.ndarray | None:
        """
        Load an image file and compute a single face encoding (blocking).

        Returns None if no face is found.
        """
        image = cv2.imread(path)
        if image is None:
            logger.warning("Could not read image: %s", path)
            return None

        # face_recognition expects RGB
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        locations = face_recognition.face_locations(rgb, model="hog")
        if not locations:
            logger.debug("No face found in %s", path)
            return None

        # Use the first (largest) face
        encodings = face_recognition.face_encodings(rgb, [locations[0]])
        if encodings:
            return encodings[0]
        return None

    async def _broadcast_progress(self, ws_manager: Any | None) -> None:
        """Send a training progress event over WebSocket if available."""
        if ws_manager is None:
            return
        try:
            await ws_manager.broadcast(
                "training",
                {
                    "type": "training_progress",
                    "status": self._status["status"],
                    "progress": self._status["progress"],
                    "total": self._status["total"],
                },
            )
        except Exception as exc:
            logger.debug("Training progress broadcast failed: %s", exc)
