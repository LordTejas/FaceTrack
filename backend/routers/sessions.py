"""
Sessions router for FaceTrack.

Manages attendance sessions (create, list, update, detail).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Request

from database.connection import get_db
from database.models import SessionCreate, SessionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[SessionResponse])
async def list_sessions(
    date_from: str | None = None,
    date_to: str | None = None,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[dict]:
    """
    List sessions with optional date-range filters.

    Includes an ``attendance_count`` computed via subquery.
    """
    base = (
        "SELECT s.*, "
        "(SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS attendance_count "
        "FROM sessions s"
    )
    conditions: list[str] = []
    params: list = []

    if date_from:
        conditions.append("s.started_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("s.started_at <= ?")
        params.append(date_to)

    if conditions:
        base += " WHERE " + " AND ".join(conditions)

    base += " ORDER BY s.started_at DESC"

    cursor = await db.execute(base, params)
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("/", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreate,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Create a new attendance session."""
    session_id = str(uuid.uuid4())
    started_at = datetime.utcnow().isoformat()

    await db.execute(
        "INSERT INTO sessions (id, name, camera_id, started_at, status) VALUES (?, ?, ?, ?, ?)",
        (session_id, body.name, body.camera_id, started_at, "active"),
    )
    await db.commit()

    # Tell the frame processor about this session so it can auto-mark attendance
    frame_processor = request.app.state.frame_processor
    frame_processor._session_id = session_id

    cursor = await db.execute(
        "SELECT s.*, "
        "(SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS attendance_count "
        "FROM sessions s WHERE s.id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    return dict(row)


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """
    End / complete a session.

    Sets ``ended_at`` to the current time and ``status`` to ``completed``.
    """
    cursor = await db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Session not found")

    ended_at = datetime.utcnow().isoformat()
    await db.execute(
        "UPDATE sessions SET ended_at = ?, status = 'completed' WHERE id = ?",
        (ended_at, session_id),
    )
    await db.commit()

    # Clear session from frame processor
    frame_processor = request.app.state.frame_processor
    if frame_processor._session_id == session_id:
        frame_processor._session_id = None

    cursor = await db.execute(
        "SELECT s.*, "
        "(SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS attendance_count "
        "FROM sessions s WHERE s.id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    return dict(row)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """
    Fetch a single session with its attendance summary.
    """
    cursor = await db.execute(
        "SELECT s.*, "
        "(SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS attendance_count "
        "FROM sessions s WHERE s.id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    session = dict(row)

    # Attach per-student attendance detail
    att_cursor = await db.execute(
        "SELECT a.*, st.name AS student_name "
        "FROM attendance a "
        "JOIN students st ON st.id = a.student_id "
        "WHERE a.session_id = ? ORDER BY a.timestamp ASC",
        (session_id,),
    )
    attendance_rows = await att_cursor.fetchall()
    session["attendance"] = [dict(r) for r in attendance_rows]

    return session
