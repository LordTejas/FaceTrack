"""
Students router for FaceTrack.

CRUD for student records and face-sample management (capture, delete, list).
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path

import cv2
import numpy as np
import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Request

from config import get_config
from database.connection import get_db
from database.models import StudentCreate, StudentResponse, StudentUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/students", tags=["students"])


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _student_dir(student_id: str) -> Path:
    """Return the filesystem path where a student's sample images are stored."""
    cfg = get_config()
    return Path(cfg.storage.data_dir) / "students" / student_id


# ---------------------------------------------------------------------------
# Student CRUD
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[StudentResponse])
async def list_students(
    search: str | None = None,
    page: int = 1,
    limit: int = 50,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[dict]:
    """List students with optional search (name/id) and pagination."""
    offset = (page - 1) * limit

    if search:
        query = (
            "SELECT * FROM students "
            "WHERE name LIKE ? OR id LIKE ? "
            "ORDER BY name ASC LIMIT ? OFFSET ?"
        )
        pattern = f"%{search}%"
        cursor = await db.execute(query, (pattern, pattern, limit, offset))
    else:
        query = "SELECT * FROM students ORDER BY name ASC LIMIT ? OFFSET ?"
        cursor = await db.execute(query, (limit, offset))

    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Fetch a single student together with their sample list."""
    cursor = await db.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Student not found")

    student = dict(row)

    # Attach sample encodings metadata
    sample_cursor = await db.execute(
        "SELECT id, sample_image_path, created_at FROM face_encodings WHERE student_id = ?",
        (student_id,),
    )
    samples = await sample_cursor.fetchall()
    student["samples"] = [dict(s) for s in samples]

    return student


@router.post("/", response_model=StudentResponse, status_code=201)
async def create_student(
    body: StudentCreate,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Create a new student record and their data directory."""
    # Check for duplicate
    cursor = await db.execute("SELECT id FROM students WHERE id = ?", (body.id,))
    if await cursor.fetchone():
        raise HTTPException(status_code=409, detail="Student ID already exists")

    await db.execute(
        "INSERT INTO students (id, name, age) VALUES (?, ?, ?)",
        (body.id, body.name, body.age),
    )
    await db.commit()

    # Create student data directory
    student_dir = _student_dir(body.id)
    os.makedirs(str(student_dir), exist_ok=True)

    # Return the newly created row
    cursor = await db.execute("SELECT * FROM students WHERE id = ?", (body.id,))
    row = await cursor.fetchone()
    return dict(row)


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: str,
    body: StudentUpdate,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """Update a student's name and/or age."""
    cursor = await db.execute("SELECT id FROM students WHERE id = ?", (student_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Student not found")

    updates: list[str] = []
    params: list = []

    if body.name is not None:
        updates.append("name = ?")
        params.append(body.name)
    if body.age is not None:
        updates.append("age = ?")
        params.append(body.age)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = datetime('now')")
    params.append(student_id)

    await db.execute(
        f"UPDATE students SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    row = await cursor.fetchone()
    return dict(row)


@router.delete("/{student_id}", status_code=204)
async def delete_student(
    student_id: str,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    """Delete a student, their encodings, attendance records, and data directory."""
    cursor = await db.execute("SELECT id FROM students WHERE id = ?", (student_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Student not found")

    face_engine = request.app.state.face_engine

    # Remove all encodings from in-memory face engine
    face_engine.remove_student(student_id)

    # Cascade delete handled by FK constraints, but explicitly clean up
    await db.execute("DELETE FROM face_encodings WHERE student_id = ?", (student_id,))
    await db.execute("DELETE FROM attendance WHERE student_id = ?", (student_id,))
    await db.execute("DELETE FROM students WHERE id = ?", (student_id,))
    await db.commit()

    # Remove data directory
    student_dir = _student_dir(student_id)
    if student_dir.exists():
        shutil.rmtree(str(student_dir), ignore_errors=True)


# ---------------------------------------------------------------------------
# Sample management
# ---------------------------------------------------------------------------


@router.post("/{student_id}/samples")
async def capture_sample(
    student_id: str,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict:
    """
    Capture a face sample from the active camera for the given student.

    - Reads a frame from the camera.
    - Detects faces. Requires exactly one face (400 otherwise).
    - Crops the face with margin, saves as JPEG.
    - Computes face encoding, stores in DB and loads into face engine.
    """
    camera_manager = request.app.state.camera_manager
    face_engine = request.app.state.face_engine

    # Verify student exists
    cursor = await db.execute("SELECT id, name FROM students WHERE id = ?", (student_id,))
    student_row = await cursor.fetchone()
    if student_row is None:
        raise HTTPException(status_code=404, detail="Student not found")

    # Grab the latest frame from the camera (shared with the frame processor)
    if not camera_manager.is_connected():
        raise HTTPException(status_code=400, detail="No active camera. Please connect a camera first.")
    frame = camera_manager.get_last_frame()
    if frame is None:
        # Fallback: try reading directly (frame processor may not be running)
        frame = await camera_manager.read_frame()
    if frame is None:
        raise HTTPException(status_code=400, detail="Failed to read frame from camera. Ensure the camera feed is active.")

    # Detect faces in the frame
    face_locations = await asyncio.to_thread(face_engine.detect_faces, frame)

    if len(face_locations) == 0:
        raise HTTPException(status_code=400, detail="No face detected in the frame")
    if len(face_locations) > 1:
        raise HTTPException(
            status_code=400,
            detail=f"Multiple faces detected ({len(face_locations)}). Ensure only one person is in frame.",
        )

    # Crop face with margin
    face_loc = face_locations[0]
    # face_recognition returns (top, right, bottom, left)
    top, right, bottom, left = face_loc
    h, w = frame.shape[:2]
    margin = int(max(bottom - top, right - left) * 0.3)
    top_m = max(0, top - margin)
    bottom_m = min(h, bottom + margin)
    left_m = max(0, left - margin)
    right_m = min(w, right + margin)
    cropped_face = frame[top_m:bottom_m, left_m:right_m]

    # Determine sample number
    student_dir = _student_dir(student_id)
    os.makedirs(str(student_dir), exist_ok=True)

    existing_samples = [
        f for f in os.listdir(str(student_dir))
        if f.startswith("sample_") and f.endswith(".jpg")
    ]
    sample_num = len(existing_samples) + 1
    sample_filename = f"sample_{sample_num}.jpg"
    sample_path = student_dir / sample_filename

    # Save cropped face as JPEG
    success, encoded_img = cv2.imencode(".jpg", cropped_face)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to encode face image")
    with open(str(sample_path), "wb") as f:
        f.write(encoded_img.tobytes())

    # Compute face encoding
    encoding = await asyncio.to_thread(face_engine.compute_encoding, frame, face_loc)
    if encoding is None:
        # Clean up saved file on failure
        if sample_path.exists():
            os.remove(str(sample_path))
        raise HTTPException(status_code=500, detail="Failed to compute face encoding")

    encoding_blob = np.array(encoding).tobytes()

    # Store in database
    relative_path = f"students/{student_id}/{sample_filename}"
    await db.execute(
        "INSERT INTO face_encodings (student_id, encoding, sample_image_path) VALUES (?, ?, ?)",
        (student_id, encoding_blob, relative_path),
    )

    # Update sample count
    await db.execute(
        "UPDATE students SET sample_count = sample_count + 1, updated_at = datetime('now') WHERE id = ?",
        (student_id,),
    )
    await db.commit()

    # Get the new encoding's row ID
    cursor = await db.execute("SELECT last_insert_rowid()")
    row = await cursor.fetchone()
    encoding_id = row[0]

    # Add to in-memory face engine
    student_name = student_row["name"]
    face_engine.add_encoding(student_id, student_name, encoding)

    return {
        "id": encoding_id,
        "student_id": student_id,
        "sample_image_path": relative_path,
        "sample_number": sample_num,
    }


@router.delete("/{student_id}/samples/{sample_id}", status_code=204)
async def delete_sample(
    student_id: str,
    sample_id: int,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    """Delete a specific face sample encoding and its image file."""
    face_engine = request.app.state.face_engine

    # Find the encoding row
    cursor = await db.execute(
        "SELECT id, sample_image_path FROM face_encodings WHERE id = ? AND student_id = ?",
        (sample_id, student_id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Sample not found")

    sample_image_path = row["sample_image_path"]

    # Delete from database
    await db.execute("DELETE FROM face_encodings WHERE id = ?", (sample_id,))
    await db.execute(
        "UPDATE students SET sample_count = MAX(0, sample_count - 1), updated_at = datetime('now') WHERE id = ?",
        (student_id,),
    )
    await db.commit()

    # Delete image file
    if sample_image_path:
        cfg = get_config()
        full_path = Path(cfg.storage.data_dir) / sample_image_path
        if full_path.exists():
            os.remove(str(full_path))

    # Remove from in-memory face engine (will reload remaining encodings)
    face_engine.remove_encoding(student_id, sample_id)


@router.get("/{student_id}/samples")
async def list_samples(
    student_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[dict]:
    """List all face-sample image paths for a student."""
    # Verify student exists
    cursor = await db.execute("SELECT id FROM students WHERE id = ?", (student_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Student not found")

    cursor = await db.execute(
        "SELECT id, sample_image_path, created_at FROM face_encodings WHERE student_id = ? ORDER BY created_at ASC",
        (student_id,),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
