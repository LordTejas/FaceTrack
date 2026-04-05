"""
Pydantic v2 models for all FaceTrack API request/response shapes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Students
# ---------------------------------------------------------------------------

class StudentCreate(BaseModel):
    """Payload for creating a new student."""
    id: str
    name: str
    age: int | None = None


class StudentUpdate(BaseModel):
    """Payload for updating an existing student (partial)."""
    name: str | None = None
    age: int | None = None


class StudentResponse(BaseModel):
    """Full student record returned by the API."""
    id: str
    name: str
    age: int | None = None
    created_at: str
    updated_at: str
    sample_count: int = 0
    is_active: bool = True


# ---------------------------------------------------------------------------
# Cameras
# ---------------------------------------------------------------------------

class CameraDevice(BaseModel):
    """Represents a registered camera device."""
    id: str
    name: str
    type: str
    url: str | None = None
    is_active: bool = False


class CameraCreate(BaseModel):
    """Payload for registering a new camera."""
    url: str
    name: str
    type: str = "ip"


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

class SessionCreate(BaseModel):
    """Payload for starting a new attendance session."""
    name: str
    camera_id: str | None = None


class SessionResponse(BaseModel):
    """Full session record returned by the API."""
    id: str
    name: str
    camera_id: str | None = None
    started_at: str
    ended_at: str | None = None
    status: str
    attendance_count: int = 0


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendanceRecord(BaseModel):
    """A single attendance log entry."""
    id: int
    student_id: str
    student_name: str
    session_id: str
    timestamp: str
    confidence: float
    capture_mode: str
    device_id: str | None = None
    snapshot_path: str | None = None


class AttendanceCreate(BaseModel):
    """Payload for manually recording attendance."""
    student_id: str
    session_id: str


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

class TrainingStatus(BaseModel):
    """Current state of the face-encoding training pipeline."""
    status: str
    progress: int = 0
    total: int = 0
    last_trained: str | None = None


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class ConfigResponse(BaseModel):
    """Mirrors the full AppConfig schema for the settings endpoint."""
    server: dict[str, Any]
    recognition: dict[str, Any]
    attendance: dict[str, Any]
    camera: dict[str, Any]
    esp32_tft: dict[str, Any]
    storage: dict[str, Any]


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    """Simple health-check response."""
    status: str = "ok"


# ---------------------------------------------------------------------------
# WebSocket / real-time face data
# ---------------------------------------------------------------------------

class FaceInfo(BaseModel):
    """Information about a single detected face in a frame."""
    bbox: list[int]
    student_id: str | None = None
    name: str | None = None
    confidence: float = 0.0
    status: str = "unknown"


class FrameMessage(BaseModel):
    """WebSocket message carrying a processed video frame with face data."""
    type: str = "frame"
    data: str
    timestamp: str
    faces: list[FaceInfo] = Field(default_factory=list)
