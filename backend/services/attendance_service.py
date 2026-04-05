"""
Attendance management service for FaceTrack.

Handles marking, querying, exporting, and deleting attendance records
with cooldown enforcement and optional face-snapshot storage.
"""

from __future__ import annotations

import csv
import io
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import cv2

if TYPE_CHECKING:
    import aiosqlite

    from config import AppConfig

logger = logging.getLogger(__name__)


class AttendanceService:
    """
    Core business logic for attendance records: mark, query, export, delete.

    Maintains an in-memory cooldown map to prevent duplicate marks within a
    configurable window.
    """

    def __init__(self) -> None:
        # (student_id, session_id) -> last-marked unix timestamp
        self._cooldowns: dict[tuple[str, str], float] = {}

    # ------------------------------------------------------------------
    # Mark attendance
    # ------------------------------------------------------------------

    async def mark_attendance(
        self,
        db: aiosqlite.Connection,
        student_id: str,
        session_id: str,
        confidence: float,
        mode: str,
        device_id: str | None = None,
        frame: Any | None = None,
        config: AppConfig | None = None,
    ) -> dict:
        """
        Attempt to record an attendance entry.

        Returns ``{"marked": True, "record": {...}}`` on success, or
        ``{"marked": False, "reason": "cooldown"}`` if the student is
        still within the cooldown window.
        """
        cooldown_seconds = 30
        save_snapshots = True
        data_dir = "data"

        if config is not None:
            cooldown_seconds = config.attendance.cooldown_seconds
            save_snapshots = config.attendance.save_snapshots
            data_dir = config.storage.data_dir

        # ---- cooldown check ----
        key = (student_id, session_id)
        now = time.time()
        last_marked = self._cooldowns.get(key, 0.0)
        if now - last_marked < cooldown_seconds:
            remaining = round(cooldown_seconds - (now - last_marked), 1)
            return {
                "marked": False,
                "reason": "cooldown",
                "remaining_seconds": remaining,
            }

        # ---- save snapshot ----
        snapshot_path: str | None = None
        if save_snapshots and frame is not None:
            try:
                snapshot_dir = Path(data_dir) / "snapshots" / session_id
                snapshot_dir.mkdir(parents=True, exist_ok=True)
                filename = f"{student_id}_{int(now)}.jpg"
                full_path = snapshot_dir / filename
                cv2.imwrite(str(full_path), frame)
                # Store a relative path for portability
                snapshot_path = str(
                    Path("snapshots") / session_id / filename
                )
            except Exception as exc:
                logger.warning("Failed to save snapshot: %s", exc)

        # ---- insert record ----
        timestamp = datetime.now(timezone.utc).isoformat()
        try:
            await db.execute(
                """
                INSERT INTO attendance
                    (student_id, session_id, timestamp, confidence,
                     capture_mode, device_id, snapshot_path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    student_id,
                    session_id,
                    timestamp,
                    round(confidence, 2),
                    mode,
                    device_id,
                    snapshot_path,
                ),
            )
            await db.commit()
        except Exception as exc:
            # UNIQUE constraint — already marked for this session
            if "UNIQUE" in str(exc):
                self._cooldowns[key] = now  # prevent retries
                return {"marked": False, "reason": "already_marked"}
            raise

        # Get the inserted row id
        cursor = await db.execute("SELECT last_insert_rowid()")
        row = await cursor.fetchone()
        record_id = row[0] if row else None

        # ---- update cooldown ----
        self._cooldowns[key] = now

        # ---- fetch student name for response ----
        name = student_id
        try:
            cur = await db.execute(
                "SELECT name FROM students WHERE id = ?", (student_id,)
            )
            name_row = await cur.fetchone()
            if name_row:
                name = name_row["name"]
        except Exception:
            pass

        record = {
            "id": record_id,
            "student_id": student_id,
            "student_name": name,
            "session_id": session_id,
            "timestamp": timestamp,
            "confidence": round(confidence, 2),
            "capture_mode": mode,
            "device_id": device_id,
            "snapshot_path": snapshot_path,
        }

        return {"marked": True, "record": record}

    # ------------------------------------------------------------------
    # Query attendance
    # ------------------------------------------------------------------

    async def get_attendance(
        self,
        db: aiosqlite.Connection,
        session_id: str | None = None,
        student_id: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        capture_mode: str | None = None,
        page: int = 1,
        limit: int = 50,
        sort_by: str = "timestamp",
        sort_order: str = "desc",
    ) -> dict:
        """
        Retrieve attendance records with optional filtering, pagination,
        and sorting.

        Returns ``{"records": [...], "total": int, "page": int, "limit": int}``.
        """
        # Allowed sort columns to prevent SQL injection
        allowed_sort = {
            "timestamp", "confidence", "student_id", "session_id",
            "capture_mode", "student_name",
        }
        if sort_by not in allowed_sort:
            sort_by = "timestamp"
        if sort_order.lower() not in ("asc", "desc"):
            sort_order = "desc"

        base_select = """
            SELECT
                a.id,
                a.student_id,
                s.name AS student_name,
                a.session_id,
                sess.name AS session_name,
                a.timestamp,
                a.confidence,
                a.capture_mode,
                a.device_id,
                a.snapshot_path
            FROM attendance a
            LEFT JOIN students s ON s.id = a.student_id
            LEFT JOIN sessions sess ON sess.id = a.session_id
        """

        conditions: list[str] = []
        params: list[Any] = []

        if session_id:
            conditions.append("a.session_id = ?")
            params.append(session_id)
        if student_id:
            conditions.append("a.student_id = ?")
            params.append(student_id)
        if date_from:
            conditions.append("a.timestamp >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("a.timestamp <= ?")
            params.append(date_to)
        if capture_mode:
            conditions.append("a.capture_mode = ?")
            params.append(capture_mode)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        # ---- total count ----
        count_sql = f"SELECT COUNT(*) FROM attendance a {where_clause}"
        cursor = await db.execute(count_sql, params)
        total_row = await cursor.fetchone()
        total = total_row[0] if total_row else 0

        # ---- sort column mapping ----
        sort_col_map = {
            "student_name": "s.name",
            "timestamp": "a.timestamp",
            "confidence": "a.confidence",
            "student_id": "a.student_id",
            "session_id": "a.session_id",
            "capture_mode": "a.capture_mode",
        }
        order_col = sort_col_map.get(sort_by, "a.timestamp")

        # ---- paginated query ----
        offset = (page - 1) * limit
        query = (
            f"{base_select} {where_clause} "
            f"ORDER BY {order_col} {sort_order} "
            f"LIMIT ? OFFSET ?"
        )
        cursor = await db.execute(query, params + [limit, offset])
        rows = await cursor.fetchall()

        records = [
            {
                "id": row["id"],
                "student_id": row["student_id"],
                "student_name": row["student_name"] or row["student_id"],
                "session_id": row["session_id"],
                "session_name": row["session_name"],
                "timestamp": row["timestamp"],
                "confidence": row["confidence"],
                "capture_mode": row["capture_mode"],
                "device_id": row["device_id"],
                "snapshot_path": row["snapshot_path"],
            }
            for row in rows
        ]

        return {
            "records": records,
            "total": total,
            "page": page,
            "limit": limit,
        }

    # ------------------------------------------------------------------
    # Export CSV
    # ------------------------------------------------------------------

    async def export_csv(
        self,
        db: aiosqlite.Connection,
        session_id: str | None = None,
        student_id: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        capture_mode: str | None = None,
    ) -> str:
        """
        Build a CSV string of attendance records matching the given filters.
        """
        base_select = """
            SELECT
                a.rowid AS id,
                a.student_id,
                s.name AS student_name,
                a.session_id,
                sess.name AS session_name,
                a.timestamp,
                a.confidence,
                a.capture_mode,
                a.device_id
            FROM attendance a
            LEFT JOIN students s ON s.id = a.student_id
            LEFT JOIN sessions sess ON sess.id = a.session_id
        """

        conditions: list[str] = []
        params: list[Any] = []

        if session_id:
            conditions.append("a.session_id = ?")
            params.append(session_id)
        if student_id:
            conditions.append("a.student_id = ?")
            params.append(student_id)
        if date_from:
            conditions.append("a.timestamp >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("a.timestamp <= ?")
            params.append(date_to)
        if capture_mode:
            conditions.append("a.capture_mode = ?")
            params.append(capture_mode)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        query = f"{base_select} {where_clause} ORDER BY a.timestamp DESC"
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "ID",
            "Student ID",
            "Student Name",
            "Session ID",
            "Session Name",
            "Timestamp",
            "Confidence",
            "Capture Mode",
            "Device ID",
        ])

        for row in rows:
            writer.writerow([
                row["id"],
                row["student_id"],
                row["student_name"] or row["student_id"],
                row["session_id"],
                row["session_name"] or "",
                row["timestamp"],
                row["confidence"],
                row["capture_mode"],
                row["device_id"] or "",
            ])

        return output.getvalue()

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete_attendance(
        self,
        db: aiosqlite.Connection,
        record_id: int,
        data_dir: str = "data",
    ) -> None:
        """
        Delete an attendance record by ID and remove its snapshot file
        if one exists.
        """
        # Fetch snapshot path before deleting
        cursor = await db.execute(
            "SELECT snapshot_path FROM attendance WHERE rowid = ?",
            (record_id,),
        )
        row = await cursor.fetchone()

        if row is None:
            raise ValueError(f"Attendance record {record_id} not found")

        snapshot_path = row["snapshot_path"]

        await db.execute(
            "DELETE FROM attendance WHERE rowid = ?", (record_id,)
        )
        await db.commit()

        # Remove snapshot file from disk
        if snapshot_path:
            full_path = Path(data_dir) / snapshot_path
            try:
                if full_path.exists():
                    full_path.unlink()
            except OSError as exc:
                logger.warning(
                    "Failed to remove snapshot %s: %s", full_path, exc
                )
