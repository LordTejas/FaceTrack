"""
Database schema migrations for FaceTrack.

All DDL uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
so the function is fully idempotent and safe to call on every startup.
"""

from __future__ import annotations

import aiosqlite


async def create_tables(db: aiosqlite.Connection) -> None:
    """Create all tables and indexes required by FaceTrack."""

    # ------------------------------------------------------------------
    # students
    # ------------------------------------------------------------------
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS students (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            age         INTEGER,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
            sample_count INTEGER NOT NULL DEFAULT 0,
            is_active   INTEGER NOT NULL DEFAULT 1
        )
        """
    )

    # ------------------------------------------------------------------
    # face_encodings
    # ------------------------------------------------------------------
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS face_encodings (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id       TEXT NOT NULL,
            encoding         BLOB NOT NULL,
            sample_image_path TEXT,
            created_at       TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
        """
    )

    # ------------------------------------------------------------------
    # cameras
    # ------------------------------------------------------------------
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS cameras (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            type       TEXT NOT NULL DEFAULT 'ip',
            url        TEXT,
            config     TEXT,
            is_active  INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )

    # ------------------------------------------------------------------
    # sessions
    # ------------------------------------------------------------------
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            camera_id  TEXT,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            ended_at   TEXT,
            status     TEXT NOT NULL DEFAULT 'active',
            FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL
        )
        """
    )

    # ------------------------------------------------------------------
    # attendance
    # ------------------------------------------------------------------
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS attendance (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id    TEXT NOT NULL,
            session_id    TEXT NOT NULL,
            timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
            confidence    REAL NOT NULL DEFAULT 0.0,
            capture_mode  TEXT NOT NULL DEFAULT 'auto',
            device_id     TEXT,
            snapshot_path TEXT,
            UNIQUE (student_id, session_id),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
        """
    )

    # ------------------------------------------------------------------
    # Indexes
    # ------------------------------------------------------------------
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_encodings_student "
        "ON face_encodings(student_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_attendance_session "
        "ON attendance(session_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_attendance_student "
        "ON attendance(student_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_attendance_timestamp "
        "ON attendance(timestamp)"
    )

    await db.commit()
