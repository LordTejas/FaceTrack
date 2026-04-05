"""
Database connection management for FaceTrack.

Provides async helpers to initialise, retrieve, and close an aiosqlite
connection to data/facetrack.db.
"""

from __future__ import annotations

from pathlib import Path
from typing import AsyncGenerator

import aiosqlite

from config import get_config

# Module-level connection handle
_db: aiosqlite.Connection | None = None


async def init_db() -> aiosqlite.Connection:
    """
    Initialise the database:
      1. Ensure the data/ directory exists.
      2. Open an aiosqlite connection to data/facetrack.db.
      3. Enable WAL journal mode for better concurrent read performance.
      4. Enable foreign key enforcement.

    Returns the open connection and stores it as a module-level singleton.
    """
    global _db

    config = get_config()
    data_dir = Path(config.storage.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    db_path = data_dir / "facetrack.db"
    _db = await aiosqlite.connect(str(db_path))

    # aiosqlite returns rows as sqlite3.Row for dict-like access
    _db.row_factory = aiosqlite.Row

    # Enable WAL mode for improved concurrency
    await _db.execute("PRAGMA journal_mode=WAL")
    # Enforce foreign key constraints
    await _db.execute("PRAGMA foreign_keys=ON")

    return _db


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    """
    FastAPI dependency that yields the active database connection.

    Usage::

        @router.get("/example")
        async def example(db = Depends(get_db)):
            ...
    """
    if _db is None:
        raise RuntimeError(
            "Database not initialised. Call init_db() during application startup."
        )
    yield _db


async def close_db() -> None:
    """Close the database connection if it is open."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None
