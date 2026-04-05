"""
Face recognition engine for FaceTrack.

Wraps the face_recognition library to provide detection, encoding computation,
and identification against a database of known face encodings.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import face_recognition
import numpy as np

if TYPE_CHECKING:
    import aiosqlite

logger = logging.getLogger(__name__)


class FaceEngine:
    """
    Maintains an in-memory store of known face encodings and provides
    synchronous detection / recognition primitives.

    All CPU-bound methods are synchronous and intended to be called via
    ``asyncio.to_thread()`` from async callers.
    """

    def __init__(self) -> None:
        self.known_encodings: list[np.ndarray] = []
        self.known_student_ids: list[str] = []
        self.known_names: list[str] = []

    # ------------------------------------------------------------------
    # Encoding management
    # ------------------------------------------------------------------

    async def load_encodings_from_db(self, db: aiosqlite.Connection) -> None:
        """
        Populate in-memory encoding lists from the face_encodings table
        joined with students for the display name.
        """
        self.known_encodings.clear()
        self.known_student_ids.clear()
        self.known_names.clear()

        try:
            cursor = await db.execute(
                """
                SELECT fe.student_id, s.name, fe.encoding
                FROM face_encodings fe
                JOIN students s ON s.id = fe.student_id
                WHERE s.is_active = 1
                ORDER BY fe.student_id
                """
            )
            rows = await cursor.fetchall()

            for row in rows:
                encoding = np.frombuffer(row["encoding"], dtype=np.float64)
                self.known_encodings.append(encoding)
                self.known_student_ids.append(row["student_id"])
                self.known_names.append(row["name"])

            logger.info(
                "Loaded %d face encodings for %d students",
                len(self.known_encodings),
                len(set(self.known_student_ids)),
            )
        except Exception as exc:
            logger.error("Failed to load face encodings: %s", exc)

    def add_encoding(
        self, student_id: str, name: str, encoding: np.ndarray
    ) -> None:
        """Append a single encoding to the in-memory store."""
        self.known_encodings.append(encoding)
        self.known_student_ids.append(student_id)
        self.known_names.append(name)

    def remove_student(self, student_id: str) -> None:
        """Remove all encodings for the given student from the in-memory store."""
        indices = [
            i
            for i, sid in enumerate(self.known_student_ids)
            if sid == student_id
        ]
        # Remove in reverse order so indices remain valid
        for i in reversed(indices):
            del self.known_encodings[i]
            del self.known_student_ids[i]
            del self.known_names[i]

    @property
    def encoding_count(self) -> int:
        """Number of encodings currently held in memory."""
        return len(self.known_encodings)

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    def detect_faces(
        self, frame: np.ndarray, min_face_width: int = 60
    ) -> list[tuple[int, int, int, int]]:
        """
        Detect faces in *frame* using the HOG model.

        Returns a list of bounding boxes as ``(top, right, bottom, left)``
        tuples, filtering out faces whose width is smaller than
        *min_face_width* pixels.
        """
        locations = face_recognition.face_locations(frame, model="hog")

        filtered: list[tuple[int, int, int, int]] = []
        for top, right, bottom, left in locations:
            face_width = right - left
            if face_width >= min_face_width:
                filtered.append((top, right, bottom, left))

        return filtered

    # ------------------------------------------------------------------
    # Encoding
    # ------------------------------------------------------------------

    def compute_encoding(
        self,
        frame: np.ndarray,
        face_location: tuple[int, int, int, int],
    ) -> np.ndarray | None:
        """
        Compute the 128-d face encoding for the face at *face_location*.

        Returns the encoding array or ``None`` if computation fails.
        """
        try:
            encodings = face_recognition.face_encodings(frame, [face_location])
            if encodings:
                return encodings[0]
        except Exception as exc:
            logger.warning("Failed to compute encoding: %s", exc)
        return None

    # ------------------------------------------------------------------
    # Recognition
    # ------------------------------------------------------------------

    def recognize(
        self,
        encoding: np.ndarray,
        confidence_threshold: float = 0.75,
        uncertain_threshold: float = 0.50,
    ) -> dict:
        """
        Match *encoding* against all known encodings.

        Returns a dict with keys:
          - student_id: matched student ID or None
          - name: matched name or "Unknown"
          - confidence: 0-100 float
          - status: "recognized" | "uncertain" | "unknown"

        Thresholds are on a 0-1 scale (e.g. 0.75 means 75% confidence).
        """
        if not self.known_encodings:
            return {
                "student_id": None,
                "name": "Unknown",
                "confidence": 0.0,
                "status": "unknown",
            }

        distances = face_recognition.face_distance(
            self.known_encodings, encoding
        )
        min_index = int(np.argmin(distances))
        min_distance = float(distances[min_index])

        # Convert distance to a 0-100 confidence score
        confidence = max(0.0, min(100.0, (1.0 - min_distance) * 100.0))

        confidence_pct = confidence_threshold * 100.0
        uncertain_pct = uncertain_threshold * 100.0

        if confidence >= confidence_pct:
            status = "recognized"
            student_id = self.known_student_ids[min_index]
            name = self.known_names[min_index]
        elif confidence >= uncertain_pct:
            status = "uncertain"
            student_id = self.known_student_ids[min_index]
            name = self.known_names[min_index]
        else:
            status = "unknown"
            student_id = None
            name = "Unknown"

        return {
            "student_id": student_id,
            "name": name,
            "confidence": round(confidence, 2),
            "status": status,
        }
