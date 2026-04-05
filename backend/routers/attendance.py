"""
Attendance router for FaceTrack.

Query, create, delete attendance records and export as CSV.
"""

from __future__ import annotations

import csv
import io
import logging

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from database.connection import get_db
from database.models import AttendanceCreate, AttendanceRecord

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/")
async def list_attendance(
    request: Request,
    session_id: str | None = None,
    student_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = 1,
    limit: int = 100,
    db: aiosqlite.Connection = Depends(get_db),
):
    """Query attendance records with optional filters."""
    attendance_service = request.app.state.attendance_service

    try:
        result = await attendance_service.get_attendance(
            db,
            session_id=session_id,
            student_id=student_id,
            date_from=date_from,
            date_to=date_to,
            page=page,
            limit=limit,
        )
        return result
    except Exception as exc:
        logger.exception("Failed to query attendance: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/", status_code=201)
async def create_attendance(
    body: AttendanceCreate,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Manually mark attendance for a student in a session."""
    attendance_service = request.app.state.attendance_service

    result = await attendance_service.mark_attendance(
        db=db,
        student_id=body.student_id,
        session_id=body.session_id,
        confidence=1.0,
        mode="manual",
        device_id=None,
    )

    if not result.get("marked"):
        reason = result.get("reason", "unknown")
        raise HTTPException(status_code=409, detail=f"Attendance not marked: {reason}")

    # Broadcast event
    ws_manager = request.app.state.ws_manager
    try:
        cursor = await db.execute("SELECT name FROM students WHERE id = ?", (body.student_id,))
        row = await cursor.fetchone()
        name = row["name"] if row else body.student_id
        await ws_manager.broadcast("events", {
            "type": "attendance_marked",
            "student_id": body.student_id,
            "name": name,
            "confidence": 100.0,
            "mode": "manual",
            "session_id": body.session_id,
        })
    except Exception:
        pass

    return result


@router.delete("/{record_id}", status_code=204)
async def delete_attendance(
    record_id: int,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    """Delete a single attendance record."""
    attendance_service = request.app.state.attendance_service

    try:
        await attendance_service.delete_attendance(db, record_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/export")
async def export_attendance(
    request: Request,
    session_id: str | None = None,
    student_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: aiosqlite.Connection = Depends(get_db),
) -> StreamingResponse:
    """Export attendance records as a downloadable CSV file."""
    attendance_service = request.app.state.attendance_service

    csv_content = await attendance_service.export_csv(
        db,
        session_id=session_id,
        student_id=student_id,
        date_from=date_from,
        date_to=date_to,
    )

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=attendance_export.csv",
        },
    )
